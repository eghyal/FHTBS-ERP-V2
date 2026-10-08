/**
 * WOT Cycle & Station Execution Mathematical Engine
 * 
 * Provides:
 * 1. Exact mathematical cycle estimation for 1 WOT from Root to Finish
 * 2. Station-level cycle estimation for 1 WOT
 * 3. Station-scoped Manpower Balancing & Process Handover Logic (A->C, B->C with X and Y)
 */

export interface StationProcessNode {
  id: string;
  name: string;
  stationId: string;
  stationName: string;
  stationSequence: number;
  cycleTimeMinutes: number;
  predecessorIds: string[];
  assignedOperatorIds: string[];
  manpowerCount: number;
  targetQty: number;
  completedQty: number;
  wipBufferQty: number;
  status: "PENDING" | "RUNNING" | "PAUSED" | "BLOCKED_NDP" | "COMPLETED";
}

export interface WotStationCycleEstimation {
  stationId: string;
  stationName: string;
  stationSequence: number;
  wotQty: number;
  cycleDurationMinutes: number;
  cycleDurationHours: number;
  pacingBottleneckStep: string;
  pacingCycleTimeMinutes: number;
  processes: {
    id: string;
    name: string;
    cycleTimePerUnitMins: number;
    manpowerAllocated: number;
    wotDurationMins: number;
    isCriticalPath: boolean;
  }[];
}

export interface WotProjectCycleEstimation {
  projectId: string;
  wotQty: number;
  factoryFactor: number;
  rootToFinishCycleMinutes: number;
  rootToFinishCycleHours: number;
  rootToFinishWorkingDays: number;
  stationEstimations: WotStationCycleEstimation[];
  criticalPathProcessIds: string[];
  projectBottleneckStationId: string;
}

/**
 * 1. Mathematical Cycle Estimation for 1 WOT from Root to Finish & Per Station
 *
 * T_i(WOT) = (Q_WOT * CT_i) / (MP_i * (FactoryFactor / 100))
 * 
 * Uses forward-pass & backward-pass topological Critical Path Method (CPM)
 */
export function calculateWotCycleEstimation(params: {
  projectId: string;
  wotQty: number;
  factoryFactor: number;
  workingHoursPerDay?: number;
  nodes: StationProcessNode[];
}): WotProjectCycleEstimation {
  const { projectId, wotQty, factoryFactor, workingHoursPerDay = 8, nodes } = params;
  const ff = Math.max(10, Math.min(100, factoryFactor || 85)) / 100;
  const q = Math.max(1, wotQty || 10);

  // Map of node durations for 1 WOT in minutes
  const nodeDurationMap = new Map<string, number>();
  nodes.forEach((n) => {
    const mp = Math.max(1, n.manpowerCount || n.assignedOperatorIds?.length || 1);
    const ct = Math.max(0.1, n.cycleTimeMinutes || 1);
    // Formula: T = (Q * CT) / (MP * FF)
    const durationMins = (q * ct) / (mp * ff);
    nodeDurationMap.set(n.id, durationMins);
  });

  // Forward pass: Early Start (ES) and Early Finish (EF)
  const esMap = new Map<string, number>();
  const efMap = new Map<string, number>();

  const visited = new Set<string>();
  const resolveNodeEarly = (nodeId: string): number => {
    if (visited.has(nodeId)) return efMap.get(nodeId) || 0;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return 0;

    let maxPredEF = 0;
    if (node.predecessorIds && node.predecessorIds.length > 0) {
      for (const predId of node.predecessorIds) {
        const predEF = resolveNodeEarly(predId);
        if (predEF > maxPredEF) maxPredEF = predEF;
      }
    }

    const dur = nodeDurationMap.get(nodeId) || 0;
    const es = maxPredEF;
    const ef = es + dur;
    esMap.set(nodeId, es);
    efMap.set(nodeId, ef);
    visited.add(nodeId);
    return ef;
  };

  nodes.forEach((n) => resolveNodeEarly(n.id));

  // Max makespan for 1 WOT root-to-finish
  let maxProjectEF = 0;
  nodes.forEach((n) => {
    const ef = efMap.get(n.id) || 0;
    if (ef > maxProjectEF) maxProjectEF = ef;
  });

  // Backward pass: Late Finish (LF) and Late Start (LS) for Critical Path
  const lfMap = new Map<string, number>();
  const lsMap = new Map<string, number>();

  nodes.forEach((n) => lfMap.set(n.id, maxProjectEF));

  // Sort nodes in reverse topological order (by EF desc)
  const sortedNodesDesc = [...nodes].sort(
    (a, b) => (efMap.get(b.id) || 0) - (efMap.get(a.id) || 0)
  );

  sortedNodesDesc.forEach((node) => {
    const dur = nodeDurationMap.get(node.id) || 0;
    const lf = lfMap.get(node.id) || maxProjectEF;
    const ls = lf - dur;
    lsMap.set(node.id, ls);

    if (node.predecessorIds) {
      node.predecessorIds.forEach((predId) => {
        const currentPredLF = lfMap.get(predId) ?? maxProjectEF;
        if (ls < currentPredLF) {
          lfMap.set(predId, ls);
        }
      });
    }
  });

  const criticalPathProcessIds: string[] = [];
  nodes.forEach((n) => {
    const es = esMap.get(n.id) || 0;
    const ls = lsMap.get(n.id) || 0;
    // Slack = LS - ES. If Slack approx 0 (< 0.01 mins), it's on critical path
    if (Math.abs(ls - es) < 0.05) {
      criticalPathProcessIds.push(n.id);
    }
  });

  // Group by Station
  const stationMap = new Map<string, StationProcessNode[]>();
  nodes.forEach((n) => {
    const sId = n.stationId || "STATION_DEFAULT";
    if (!stationMap.has(sId)) stationMap.set(sId, []);
    stationMap.get(sId)!.push(n);
  });

  const stationEstimations: WotStationCycleEstimation[] = [];
  let highestStationDuration = 0;
  let projectBottleneckStationId = "";

  stationMap.forEach((stationNodes, sId) => {
    const sName = stationNodes[0]?.stationName || "Station";
    const sSeq = stationNodes[0]?.stationSequence || 1;

    let minStationES = Infinity;
    let maxStationEF = 0;
    let pacingBottleneck = stationNodes[0]?.name || "";
    let maxProcessDur = 0;

    const processDetails = stationNodes.map((pn) => {
      const dur = nodeDurationMap.get(pn.id) || 0;
      const es = esMap.get(pn.id) || 0;
      const ef = efMap.get(pn.id) || 0;

      if (es < minStationES) minStationES = es;
      if (ef > maxStationEF) maxStationEF = ef;

      if (dur > maxProcessDur) {
        maxProcessDur = dur;
        pacingBottleneck = pn.name;
      }

      return {
        id: pn.id,
        name: pn.name,
        cycleTimePerUnitMins: pn.cycleTimeMinutes,
        manpowerAllocated: pn.manpowerCount || pn.assignedOperatorIds?.length || 1,
        wotDurationMins: Math.round(dur * 10) / 10,
        isCriticalPath: criticalPathProcessIds.includes(pn.id),
      };
    });

    const stationDurationMins =
      minStationES === Infinity ? 0 : Math.max(0, maxStationEF - minStationES);

    if (stationDurationMins > highestStationDuration) {
      highestStationDuration = stationDurationMins;
      projectBottleneckStationId = sId;
    }

    stationEstimations.push({
      stationId: sId,
      stationName: sName,
      stationSequence: sSeq,
      wotQty: q,
      cycleDurationMinutes: Math.round(stationDurationMins * 10) / 10,
      cycleDurationHours: Math.round((stationDurationMins / 60) * 100) / 100,
      pacingBottleneckStep: pacingBottleneck,
      pacingCycleTimeMinutes: Math.round(maxProcessDur * 10) / 10,
      processes: processDetails,
    });
  });

  stationEstimations.sort((a, b) => a.stationSequence - b.stationSequence);

  const totalCycleHours = maxProjectEF / 60;
  const totalWorkingDays = totalCycleHours / workingHoursPerDay;

  return {
    projectId,
    wotQty: q,
    factoryFactor: Math.round(ff * 100),
    rootToFinishCycleMinutes: Math.round(maxProjectEF * 10) / 10,
    rootToFinishCycleHours: Math.round(totalCycleHours * 100) / 100,
    rootToFinishWorkingDays: Math.round(totalWorkingDays * 100) / 100,
    stationEstimations,
    criticalPathProcessIds,
    projectBottleneckStationId,
  };
}

/**
 * 2. Station-Scoped Manpower Balancing & Process Handover Algorithm
 *
 * Implements:
 * - Station boundary isolation (manpower cannot be reassigned outside station)
 * - Convergence rule (A->C, B->C):
 *   * If X has A and C, Y has B:
 *   * When C's required predecessor WIP is ready (>= WOT Qty), X automatically shifts to C.
 *   * When 1 WOT at C is done, X shifts back to A.
 *   * If Y finishes B before X finishes, Y automatically assists X on X's other task.
 */
export interface StationManpowerAllocation {
  operatorId: string;
  operatorName: string;
  currentAssignedProcessId: string;
  currentProcessName: string;
  isAssisting: boolean;
  statusReason: string;
}

export function computeStationManpowerBalancing(params: {
  stationId: string;
  wotQty: number;
  processes: StationProcessNode[];
  operators: { id: string; name: string }[];
}): {
  stationId: string;
  allocations: StationManpowerAllocation[];
  activeProcessIds: string[];
  handoverTriggered: boolean;
  message: string;
} {
  const { stationId, wotQty, processes, operators } = params;
  const q = Math.max(1, wotQty || 10);

  if (!operators || operators.length === 0 || !processes || processes.length === 0) {
    return {
      stationId,
      allocations: [],
      activeProcessIds: [],
      handoverTriggered: false,
      message: "No operators or processes in station.",
    };
  }

  // Identify processes that have input WIP ready >= 1 WOT
  const processWipReady = new Map<string, boolean>();
  processes.forEach((proc) => {
    if (!proc.predecessorIds || proc.predecessorIds.length === 0) {
      // Root process in station is always ready
      processWipReady.set(proc.id, true);
    } else {
      // All predecessors in station must have produced at least 1 WOT (or completed)
      const allPredsReady = proc.predecessorIds.every((pId) => {
        const predNode = processes.find((p) => p.id === pId);
        if (!predNode) return true; // Predecessor might be in upstream station
        return predNode.completedQty >= q || predNode.wipBufferQty >= q;
      });
      processWipReady.set(proc.id, allPredsReady);
    }
  });

  const allocations: StationManpowerAllocation[] = [];
  const assignedProcessSet = new Set<string>();
  let handoverTriggered = false;

  // Step 1: Assign primary tasks based on configuration
  const unallocatedOperators: { id: string; name: string }[] = [];

  operators.forEach((op) => {
    // Find all processes assigned to this operator in this station
    const opProcs = processes.filter((p) => p.assignedOperatorIds?.includes(op.id));

    if (opProcs.length === 0) {
      unallocatedOperators.push(op);
      return;
    }

    if (opProcs.length === 1) {
      const p = opProcs[0];
      allocations.push({
        operatorId: op.id,
        operatorName: op.name,
        currentAssignedProcessId: p.id,
        currentProcessName: p.name,
        isAssisting: false,
        statusReason: `Standard single-task station focus on ${p.name}`,
      });
      assignedProcessSet.add(p.id);
    } else {
      // Operator has multiple tasks (e.g. A and C)
      // Check if downstream task C has sufficient WIP ready (>= 1 WOT)
      const downstreamReadyProc = opProcs.find(
        (p) => p.predecessorIds && p.predecessorIds.length > 0 && processWipReady.get(p.id)
      );

      if (downstreamReadyProc && downstreamReadyProc.completedQty < downstreamReadyProc.targetQty) {
        // Shift to downstream task C
        allocations.push({
          operatorId: op.id,
          operatorName: op.name,
          currentAssignedProcessId: downstreamReadyProc.id,
          currentProcessName: downstreamReadyProc.name,
          isAssisting: false,
          statusReason: `Auto-shifted to downstream node ${downstreamReadyProc.name} (1 WOT WIP buffer ready)`,
        });
        assignedProcessSet.add(downstreamReadyProc.id);
        handoverTriggered = true;
      } else {
        // Work on upstream task A
        const upstreamProc = opProcs[0];
        allocations.push({
          operatorId: op.id,
          operatorName: op.name,
          currentAssignedProcessId: upstreamProc.id,
          currentProcessName: upstreamProc.name,
          isAssisting: false,
          statusReason: `Working on feeder process ${upstreamProc.name}`,
        });
        assignedProcessSet.add(upstreamProc.id);
      }
    }
  });

  // Step 2: Auto-rebalance idle / finished operators inside station
  // If an operator Y finished their process, assign them to assist an operator X with remaining load
  unallocatedOperators.forEach((op) => {
    // Find a process in the station that is not yet completed and has highest remaining WIP
    const candidateProcess = processes
      .filter((p) => p.completedQty < p.targetQty && processWipReady.get(p.id))
      .sort((a, b) => (b.targetQty - b.completedQty) - (a.targetQty - a.completedQty))[0];

    if (candidateProcess) {
      allocations.push({
        operatorId: op.id,
        operatorName: op.name,
        currentAssignedProcessId: candidateProcess.id,
        currentProcessName: candidateProcess.name,
        isAssisting: true,
        statusReason: `Auto-rebalanced to assist on ${candidateProcess.name} (Station Manpower Balancing)`,
      });
      assignedProcessSet.add(candidateProcess.id);
      handoverTriggered = true;
    } else {
      allocations.push({
        operatorId: op.id,
        operatorName: op.name,
        currentAssignedProcessId: "",
        currentProcessName: "Station Standby",
        isAssisting: false,
        statusReason: "Station queue satisfied. Ready for next WOT intake.",
      });
    }
  });

  return {
    stationId,
    allocations,
    activeProcessIds: Array.from(assignedProcessSet),
    handoverTriggered,
    message: handoverTriggered
      ? "Manpower automatically rebalanced according to WOT buffer readiness."
      : "Manpower steady on assigned station operations.",
  };
}
