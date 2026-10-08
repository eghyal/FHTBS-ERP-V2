/**
 * MaterialFlowEngine - Discrete-Event Material-Driven Simulation & Capacity Engine
 * 
 * Implements realistic Discrete Event Simulation (DES) / Token-Bucket Pipeline:
 * - Material-Driven Precedence: Unit 'u' at Step 'C' can only start when Unit 'u' is completed
 *   at ALL upstream predecessor steps (A, B, etc.).
 * - Machine/Station Availability: Step 'C' can only start Unit 'u' after finishing Unit 'u-1'.
 * - Multi-Skill Floating Operator Leveling: An operator assigned to multiple stations cannot
 *   be physically processing units in parallel across conflicting stations.
 * - Theory of Constraints (TOC) & Line Balancing: Accurately computes true constrained daily output,
 *   starvation idle time, line pacing, bottleneck identification, and makespan.
 */

export interface ProcessNodeInput {
  id: string;
  name: string;
  cycleTimeMinutes: number;
  predecessorIds: string[];
  assignedOperatorIds?: string[];
  manpowerCount?: number;
  shiftMode?: number;
  standardHours?: number;
  stepSequence?: number;
  completedQty?: number;
  targetQty?: number;
  assignments?: any[];
  rawStep?: any;
}

export interface UnitExecutionRecord {
  unitIndex: number; // 1-based index
  startTimeMinutes: number;
  finishTimeMinutes: number;
  starveWaitMinutes: number;
  operatorWaitMinutes: number;
}

export interface ProcessSimulationMetrics {
  id: string;
  name: string;
  seq: number;
  rawCycleMins: number;
  cycleTimeMinutes: number; // Alias for rawCycleMins
  adjustedCycleMins: number;
  adjustedCycleTimeMinutes: number; // Alias for adjustedCycleMins
  effectiveAdjCT: number; // Alias for adjustedCycleMins
  manpowerCount: number;
  shiftMode: number;
  predecessorIds: string[];
  assignedOperatorIds: string[];

  // Timeline
  firstUnitStartTime: number;
  firstUnitFinishTime: number;
  lastUnitFinishTime: number;
  totalMakespanMinutes: number;
  totalMakespanHours: number;

  // Active vs Idle
  totalBusyMinutes: number;
  totalStarveMinutes: number;
  totalOperatorWaitMinutes: number;
  starvationRatePercent: number;

  // Capacity & Output
  nominalDailyCapacity: number; // Isolated without upstream starvation
  effectiveDailyCapacity: number; // True constrained output per day
  capacityUtilization: number; // Effective / Nominal %
  
  // Bottleneck & State
  isPacingBottleneck: boolean;
  bottleneckPredecessorName?: string;
  isStarvationConstrained: boolean;
  constraintReason: string;

  // Per-unit timeline (useful for granular debugging / gantt piece view)
  unitHistory?: UnitExecutionRecord[];

  // Attached CPM Schedule
  cpm: {
    es: number;
    ef: number;
    ls: number;
    lf: number;
    waitLag: number;
    waitReason: string;
    criticalPath: boolean;
  };
}

export interface MaterialFlowSimulationResult {
  // Global Metrics
  targetQty: number;
  factoryFactor: number;
  workingHoursPerDay: number;
  isPipelined: boolean;

  totalMakespanMinutes: number;
  totalMakespanHours: number;
  estimatedWorkingDays: number;

  lineDailyThroughput: number; // Units per working day
  lineBalancingEfficiency: number; // Percent
  totalRawCycleSum: number;
  totalAdjustedCycleSum: number;

  pacingBottleneckStep: ProcessSimulationMetrics | null;
  bottleneckStepId: string | null;
  bottleneckProcessIds: string[];
  tasks: ProcessSimulationMetrics[];
  metrics: ProcessSimulationMetrics[]; // Alias for tasks

  // CPM & Schedule Mapping for Gantt
  cpm: {
    es: Map<string, number>;
    ef: Map<string, number>;
    ls: Map<string, number>;
    lf: Map<string, number>;
    waitLag: Map<string, number>;
    waitReason: Map<string, string>;
    criticalPathIds: Set<string>;
    maxProjectDuration: number;
  };
}

export interface MaterialFlowSimulationParams {
  tasks: ProcessNodeInput[];
  targetQty: number;
  factoryFactor?: number;
  workingHoursPerDay?: number;
  isPipelined?: boolean;
  storeUnitHistory?: boolean;
}

/**
 * Runs Discrete-Event Material-Driven Simulation across all process steps for targetQty units.
 */
export function simulateMaterialFlow(params: MaterialFlowSimulationParams): MaterialFlowSimulationResult {
  const {
    tasks: rawTasks,
    targetQty: rawTargetQty,
    factoryFactor = 85,
    workingHoursPerDay = 8,
    isPipelined = true,
    storeUnitHistory = false,
  } = params;

  const targetQty = Math.max(1, Number(rawTargetQty) || 1);
  const ff = Math.min(100, Math.max(1, Number(factoryFactor) || 85));
  const ffMultiplier = ff / 100;
  const shiftHours = Math.max(1, Number(workingHoursPerDay) || 8);
  const totalShiftMinutesPerDay = shiftHours * 60;

  // Prepare normalized tasks
  const tasks = rawTasks.map((t, idx) => {
    const rawCT = Math.max(0.1, Number(t.cycleTimeMinutes) || Math.round((Number(t.standardHours) || 1) * 60) || 1);
    const manpower = Math.max(1, Number(t.manpowerCount) || (t.assignedOperatorIds?.length || (t.assignments?.length || 1)));
    const shift = Math.max(1, Number(t.shiftMode) || 1);

    // Adjusted Cycle Time per unit considering Factory Factor and parallel manpower
    const adjCT = (rawCT * (100 / ff)) / manpower;

    let predIds: string[] = [];
    if (Array.isArray(t.predecessorIds)) {
      predIds = t.predecessorIds;
    } else if (typeof t.predecessorIds === "string") {
      try {
        predIds = JSON.parse(t.predecessorIds);
      } catch (e) {
        predIds = [];
      }
    }

    const opIds = t.assignedOperatorIds || (t.assignments?.map((a: any) => a.manpower_id || a.id) || []);

    return {
      id: t.id,
      name: t.name || `Process ${idx + 1}`,
      seq: t.stepSequence || (idx + 1),
      rawCT,
      adjCT,
      manpower,
      shift,
      predIds,
      opIds,
      original: t,
    };
  });

  const taskMap = new Map<string, typeof tasks[0]>();
  tasks.forEach(t => taskMap.set(t.id, t));

  // Operator Availability Tracking: operatorId -> timestamp when they become free
  const operatorFreeTime = new Map<string, number>();
  tasks.forEach(t => {
    t.opIds.forEach(opId => {
      if (!operatorFreeTime.has(opId)) operatorFreeTime.set(opId, 0);
    });
  });

  // Per-unit start and finish timestamps: task_id -> array of unit finish times [unit 0 (unused), unit 1, ..., unit targetQty]
  const unitStartTimes = new Map<string, number[]>();
  const unitFinishTimes = new Map<string, number[]>();
  const unitStarveTimes = new Map<string, number[]>();
  const unitOpWaitTimes = new Map<string, number[]>();

  tasks.forEach(t => {
    unitStartTimes.set(t.id, new Array(targetQty + 1).fill(0));
    unitFinishTimes.set(t.id, new Array(targetQty + 1).fill(0));
    unitStarveTimes.set(t.id, new Array(targetQty + 1).fill(0));
    unitOpWaitTimes.set(t.id, new Array(targetQty + 1).fill(0));
  });

  // Track station ready time (when station completes unit u-1)
  const stationAvailableAt = new Map<string, number>();
  tasks.forEach(t => stationAvailableAt.set(t.id, 0));

  // --- Discrete Event Simulation Loop (Unit by Unit) ---
  // In pipelining mode: Units flow piece-by-piece through the network.
  // In batch mode: Downstream waits for entire batch of predecessors.
  for (let u = 1; u <= targetQty; u++) {
    for (const t of tasks) {
      const duration = t.adjCT;

      // 1. Material Precedence Constraint
      let materialReadyTime = 0;
      let bottleneckPredName = "";

      for (const pId of t.predIds) {
        const pred = taskMap.get(pId);
        if (!pred) continue;

        let predReady = 0;
        if (isPipelined) {
          // 1-Piece Flow: Unit 'u' at 't' requires Unit 'u' to be completed at 'pId'
          predReady = unitFinishTimes.get(pId)?.[u] || 0;
        } else {
          // Batch Flow: Requires all targetQty units to be finished at predecessor
          predReady = unitFinishTimes.get(pId)?.[targetQty] || 0;
        }

        if (predReady > materialReadyTime) {
          materialReadyTime = predReady;
          bottleneckPredName = pred.name;
        }
      }

      // 2. Machine/Station Sequential Constraint (Unit u can only start after Unit u-1)
      const stationReadyTime = stationAvailableAt.get(t.id) || 0;

      // 3. Multi-Skill Shared Operator Constraint
      let earliestOperatorReadyTime = 0;
      let busyOperatorId = "";

      for (const opId of t.opIds) {
        const opTime = operatorFreeTime.get(opId) || 0;
        if (opTime > earliestOperatorReadyTime) {
          earliestOperatorReadyTime = opTime;
          busyOperatorId = opId;
        }
      }

      // Start time is the maximum of all physical constraints
      const startTime = Math.max(materialReadyTime, stationReadyTime, earliestOperatorReadyTime);
      const finishTime = startTime + duration;

      // Calculate Idle / Starvation / Wait deltas for this unit
      const starveWait = Math.max(0, materialReadyTime - Math.max(stationReadyTime, earliestOperatorReadyTime));
      const opWait = Math.max(0, earliestOperatorReadyTime - Math.max(materialReadyTime, stationReadyTime));

      // Record timestamps
      unitStartTimes.get(t.id)![u] = startTime;
      unitFinishTimes.get(t.id)![u] = finishTime;
      unitStarveTimes.get(t.id)![u] = starveWait;
      unitOpWaitTimes.get(t.id)![u] = opWait;

      // Update state for next events
      stationAvailableAt.set(t.id, finishTime);
      for (const opId of t.opIds) {
        operatorFreeTime.set(opId, finishTime);
      }
    }
  }

  // --- Aggregate Metrics Per Task ---
  let maxProjectDuration = 0;
  let maxAdjustedCT = 0;
  let pacingBottleneckTaskId = tasks[0]?.id || "";
  let totalRawSum = 0;
  let totalAdjSum = 0;

  tasks.forEach(t => {
    totalRawSum += t.rawCT;
    totalAdjSum += t.adjCT;
    if (t.adjCT > maxAdjustedCT) {
      maxAdjustedCT = t.adjCT;
      pacingBottleneckTaskId = t.id;
    }
  });

  const taskMetrics: ProcessSimulationMetrics[] = tasks.map(t => {
    const starts = unitStartTimes.get(t.id)!;
    const finishes = unitFinishTimes.get(t.id)!;
    const starves = unitStarveTimes.get(t.id)!;
    const opWaits = unitOpWaitTimes.get(t.id)!;

    const firstUnitStartTime = starts[1] || 0;
    const firstUnitFinishTime = finishes[1] || 0;
    const lastUnitFinishTime = finishes[targetQty] || 0;

    if (lastUnitFinishTime > maxProjectDuration) {
      maxProjectDuration = lastUnitFinishTime;
    }

    const totalBusyMinutes = t.adjCT * targetQty;
    const totalStarveMinutes = starves.reduce((sum, val) => sum + val, 0);
    const totalOperatorWaitMinutes = opWaits.reduce((sum, val) => sum + val, 0);
    const totalSpanMinutes = Math.max(1, lastUnitFinishTime - firstUnitStartTime);

    const starvationRatePercent = Math.min(100, Math.round((totalStarveMinutes / (totalBusyMinutes + totalStarveMinutes || 1)) * 100));

    // Nominal Daily Capacity (unconstrained machine capacity in isolation)
    const nominalDailyCapacity = t.adjCT > 0
      ? Math.floor((totalShiftMinutesPerDay / t.adjCT) * ffMultiplier * t.shift)
      : 0;

    // Find upstream bottleneck constraining this process
    let minUpstreamNominalCap = Infinity;
    let bottleneckPredName = "";
    for (const pId of t.predIds) {
      const pred = taskMap.get(pId);
      if (!pred) continue;
      const predNominal = pred.adjCT > 0
        ? Math.floor((totalShiftMinutesPerDay / pred.adjCT) * ffMultiplier * pred.shift)
        : 0;
      if (predNominal < minUpstreamNominalCap) {
        minUpstreamNominalCap = predNominal;
        bottleneckPredName = pred.name;
      }
    }

    // Effective Daily Capacity (Constrained by Upstream Supply Rate)
    const effectiveDailyCapacity = t.predIds.length > 0
      ? Math.min(nominalDailyCapacity, minUpstreamNominalCap)
      : nominalDailyCapacity;

    const isStarvationConstrained = t.predIds.length > 0 && minUpstreamNominalCap < nominalDailyCapacity;
    const capacityUtilization = nominalDailyCapacity > 0
      ? Math.min(100, Math.round((effectiveDailyCapacity / nominalDailyCapacity) * 100))
      : 0;

    let constraintReason = "Penuh sesuai kapasitas stasiun";
    if (isStarvationConstrained) {
      constraintReason = `Dibatasi pasokan dari '${bottleneckPredName}' (Maks: ${effectiveDailyCapacity} pcs/hari vs Kapasitas Mandiri: ${nominalDailyCapacity} pcs/hari)`;
    } else if (totalOperatorWaitMinutes > 0) {
      constraintReason = `Terdapat jeda penugasan operator bersama (${(totalOperatorWaitMinutes / 60).toFixed(1)} jam)`;
    }

    const unitHistory: UnitExecutionRecord[] | undefined = storeUnitHistory
      ? Array.from({ length: targetQty }, (_, i) => ({
          unitIndex: i + 1,
          startTimeMinutes: starts[i + 1],
          finishTimeMinutes: finishes[i + 1],
          starveWaitMinutes: starves[i + 1],
          operatorWaitMinutes: opWaits[i + 1],
        }))
      : undefined;

    return {
      id: t.id,
      name: t.name,
      seq: t.seq,
      rawCycleMins: t.rawCT,
      cycleTimeMinutes: t.rawCT,
      adjustedCycleMins: t.adjCT,
      adjustedCycleTimeMinutes: t.adjCT,
      effectiveAdjCT: t.adjCT,
      manpowerCount: t.manpower,
      shiftMode: t.shift,
      predecessorIds: t.predIds,
      assignedOperatorIds: t.opIds,
      firstUnitStartTime,
      firstUnitFinishTime,
      lastUnitFinishTime,
      totalMakespanMinutes: lastUnitFinishTime,
      totalMakespanHours: lastUnitFinishTime / 60,
      totalBusyMinutes,
      totalStarveMinutes,
      totalOperatorWaitMinutes,
      starvationRatePercent,
      nominalDailyCapacity,
      effectiveDailyCapacity,
      capacityUtilization,
      isPacingBottleneck: t.id === pacingBottleneckTaskId,
      bottleneckPredecessorName: bottleneckPredName || undefined,
      isStarvationConstrained,
      constraintReason,
      unitHistory,
      cpm: {
        es: firstUnitStartTime,
        ef: lastUnitFinishTime,
        ls: firstUnitStartTime,
        lf: lastUnitFinishTime,
        waitLag: firstUnitStartTime,
        waitReason: "",
        criticalPath: false,
      },
    };
  });

  // --- CPM Backward Pass & Critical Path Identification ---
  const esMap = new Map<string, number>();
  const efMap = new Map<string, number>();
  const lsMap = new Map<string, number>();
  const lfMap = new Map<string, number>();
  const waitLagMap = new Map<string, number>();
  const waitReasonMap = new Map<string, string>();
  const criticalPathIds = new Set<string>();

  taskMetrics.forEach(m => {
    esMap.set(m.id, m.firstUnitStartTime);
    efMap.set(m.id, m.lastUnitFinishTime);
    waitLagMap.set(m.id, m.firstUnitStartTime);
    
    let reason = "Immediate Start";
    if (m.firstUnitStartTime > 0) {
      if (m.bottleneckPredecessorName) {
        reason = `Menunggu prasyarat proses '${m.bottleneckPredecessorName}'`;
      } else if (m.totalOperatorWaitMinutes > 0) {
        reason = `Menunggu giliran operator bebas dari stasiun lain`;
      }
    }
    waitReasonMap.set(m.id, reason);
  });

  // Initialize Late Finish at Max Project Duration
  tasks.forEach(t => {
    lfMap.set(t.id, maxProjectDuration);
    lsMap.set(t.id, maxProjectDuration - (t.adjCT * targetQty));
  });

  let changed = true;
  let iterations = 0;
  const maxIterations = Math.max(50, tasks.length * 2);
  while (changed && iterations < maxIterations) {
    iterations++;
    changed = false;
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i];
      let minSuccLs = maxProjectDuration;

      for (const succ of tasks) {
        if (succ.predIds.includes(t.id)) {
          const succLs = lsMap.get(succ.id) ?? maxProjectDuration;
          if (succLs < minSuccLs) {
            minSuccLs = succLs;
          }
        }
      }

      const totalDur = t.adjCT * targetQty;
      const currentLf = lfMap.get(t.id);
      if (currentLf === undefined || Math.abs(currentLf - minSuccLs) > 0.001) {
        lfMap.set(t.id, minSuccLs);
        lsMap.set(t.id, minSuccLs - totalDur);
        changed = true;
      }
    }
  }

  // Identify Critical Path & enrich task metrics
  tasks.forEach(t => {
    const es = esMap.get(t.id) || 0;
    const ls = lsMap.get(t.id) || 0;
    if (Math.abs(es - ls) < 0.1) {
      criticalPathIds.add(t.id);
    }
  });

  taskMetrics.forEach(m => {
    m.cpm = {
      es: esMap.get(m.id) ?? m.firstUnitStartTime,
      ef: efMap.get(m.id) ?? m.lastUnitFinishTime,
      ls: lsMap.get(m.id) ?? m.firstUnitStartTime,
      lf: lfMap.get(m.id) ?? m.lastUnitFinishTime,
      waitLag: waitLagMap.get(m.id) ?? m.firstUnitStartTime,
      waitReason: waitReasonMap.get(m.id) ?? "",
      criticalPath: criticalPathIds.has(m.id),
    };
  });

  // Global Project Outputs
  const totalMakespanMinutes = maxProjectDuration;
  const totalMakespanHours = totalMakespanMinutes / 60;
  const estimatedWorkingDays = Math.ceil(totalMakespanHours / shiftHours);

  // Line Daily Throughput (Global Line Pacing Rate)
  const pacingBottleneck = taskMetrics.find(m => m.isPacingBottleneck) || taskMetrics[0] || null;
  const lineDailyThroughput = pacingBottleneck
    ? pacingBottleneck.effectiveDailyCapacity
    : 0;

  // Line Balancing Efficiency (%)
  const lineBalancingEfficiency = tasks.length > 0 && maxAdjustedCT > 0
    ? Math.min(100, Math.round((totalAdjSum / (tasks.length * maxAdjustedCT)) * 100))
    : 0;

  const bottleneckProcessIds = taskMetrics
    .filter(m => m.isPacingBottleneck || (pacingBottleneck && m.effectiveDailyCapacity === pacingBottleneck.effectiveDailyCapacity))
    .map(m => m.id);

  return {
    targetQty,
    factoryFactor: ff,
    workingHoursPerDay: shiftHours,
    isPipelined,
    totalMakespanMinutes,
    totalMakespanHours,
    estimatedWorkingDays,
    lineDailyThroughput,
    lineBalancingEfficiency,
    totalRawCycleSum: totalRawSum,
    totalAdjustedCycleSum: totalAdjSum,
    pacingBottleneckStep: pacingBottleneck,
    bottleneckStepId: pacingBottleneck?.id || null,
    bottleneckProcessIds,
    tasks: taskMetrics,
    metrics: taskMetrics,
    cpm: {
      es: esMap,
      ef: efMap,
      ls: lsMap,
      lf: lfMap,
      waitLag: waitLagMap,
      waitReason: waitReasonMap,
      criticalPathIds,
      maxProjectDuration,
    },
  };
}

/**
 * Calculates Constrained Effective Daily Output for a single process step within a process network.
 * Accurately prevents overestimating daily capacity for downstream stations when upstream supply is constrained.
 */
export function calculateConstrainedDailyOutput(params: {
  stepId: string;
  allSteps: any[];
  manpowerAssignments?: any[];
  factoryFactor?: number;
  workingHoursPerDay?: number;
  projectQty?: number;
}): {
  nominalDailyOutput: number;
  effectiveDailyOutput: number;
  isStarvationConstrained: boolean;
  bottleneckProcessName: string;
  upstreamMaxDailyOutput: number;
  explanation: string;
} {
  const {
    stepId,
    allSteps,
    manpowerAssignments = [],
    factoryFactor = 85,
    workingHoursPerDay = 8,
    projectQty = 1,
  } = params;

  if (!allSteps || allSteps.length === 0) {
    return {
      nominalDailyOutput: 0,
      effectiveDailyOutput: 0,
      isStarvationConstrained: false,
      bottleneckProcessName: "",
      upstreamMaxDailyOutput: 0,
      explanation: "No steps available",
    };
  }

  // Normalize tasks for simulation
  const normalizedTasks: ProcessNodeInput[] = allSteps.map(s => {
    const rawCT = s.cycle_time_minutes || Math.round((s.standard_hours || 1) * 60) || 1;
    const assignments = manpowerAssignments.filter((a: any) => a.bop_id === s.id || a.task_name === s.process_name);

    let predIds: string[] = [];
    try {
      predIds = typeof s.predecessor_ids === "string" ? JSON.parse(s.predecessor_ids) : s.predecessor_ids || [];
    } catch (e) {
      predIds = [];
    }

    return {
      id: s.id,
      name: s.process_name,
      cycleTimeMinutes: rawCT,
      predecessorIds: predIds,
      assignedOperatorIds: assignments.map((a: any) => a.manpower_id || a.id),
      manpowerCount: Math.max(1, assignments.length || 1),
      shiftMode: Number(s.shift_mode) || 1,
      stepSequence: s.step_sequence,
    };
  });

  const simResult = simulateMaterialFlow({
    tasks: normalizedTasks,
    targetQty: Math.max(1, Number(projectQty) || 10),
    factoryFactor,
    workingHoursPerDay,
    isPipelined: true,
  });

  const currentTaskMetric = simResult.tasks.find(m => m.id === stepId);

  if (!currentTaskMetric) {
    return {
      nominalDailyOutput: 0,
      effectiveDailyOutput: 0,
      isStarvationConstrained: false,
      bottleneckProcessName: "",
      upstreamMaxDailyOutput: 0,
      explanation: "Step not found",
    };
  }

  return {
    nominalDailyOutput: currentTaskMetric.nominalDailyCapacity,
    effectiveDailyOutput: currentTaskMetric.effectiveDailyCapacity,
    isStarvationConstrained: currentTaskMetric.isStarvationConstrained,
    bottleneckProcessName: currentTaskMetric.bottleneckPredecessorName || "",
    upstreamMaxDailyOutput: currentTaskMetric.effectiveDailyCapacity,
    explanation: currentTaskMetric.constraintReason,
  };
}

/**
 * Calculates Live WIP Buffer availability and Starvation state for Shopfloor Execution.
 */
export function calculateLiveWipBuffer(
  targetStepId: string,
  allSteps: any[],
  projectQty: number
): {
  availableQty: number;
  isStarved: boolean;
  bottleneckProcess: string;
  minInputProduced: number;
  currentConsumed: number;
  inputBreakdown: Array<{ predId: string; predName: string; completedQty: number; targetQty: number }>;
} {
  const stepMap = new Map<string, any>();
  allSteps.forEach(s => stepMap.set(s.id, s));

  const targetStep = stepMap.get(targetStepId);
  if (!targetStep) {
    return {
      availableQty: 999999,
      isStarved: false,
      bottleneckProcess: "",
      minInputProduced: 999999,
      currentConsumed: 0,
      inputBreakdown: [],
    };
  }

  let predIds: string[] = [];
  try {
    predIds = Array.isArray(targetStep.predecessor_ids)
      ? targetStep.predecessor_ids
      : JSON.parse(targetStep.predecessor_ids || "[]");
  } catch (e) {
    predIds = [];
  }

  // Root process (no predecessors) is never starved by material
  if (predIds.length === 0) {
    const targetQty = Number(projectQty) || 1;
    const consumed = Number(targetStep.completed_qty || 0);
    return {
      availableQty: Math.max(0, targetQty - consumed),
      isStarved: false,
      bottleneckProcess: "",
      minInputProduced: targetQty,
      currentConsumed: consumed,
      inputBreakdown: [],
    };
  }

  const inputBreakdown: Array<{ predId: string; predName: string; completedQty: number; targetQty: number }> = [];
  let minInputProduced = Infinity;
  let bottleneckProcess = "";

  for (const predId of predIds) {
    const predStep = stepMap.get(predId);
    if (!predStep || predStep.node_type === 'PRODUCT') continue;

    const predCompletedQty = Number(predStep.completed_qty || 0);
    inputBreakdown.push({
      predId: predStep.id,
      predName: predStep.process_name || `Step ${predStep.step_sequence}`,
      completedQty: predCompletedQty,
      targetQty: Number(predStep.target_qty || projectQty || 0),
    });

    if (predCompletedQty < minInputProduced) {
      minInputProduced = predCompletedQty;
      bottleneckProcess = predStep.process_name || `Step ${predStep.step_sequence}`;
    }
  }

  if (minInputProduced === Infinity) minInputProduced = 0;

  const currentConsumed = Number(targetStep.completed_qty || 0);
  const availableQty = Math.max(0, minInputProduced - currentConsumed);
  const isStarved = availableQty <= 0;

  return {
    availableQty,
    isStarved,
    bottleneckProcess,
    minInputProduced,
    currentConsumed,
    inputBreakdown,
  };
}
