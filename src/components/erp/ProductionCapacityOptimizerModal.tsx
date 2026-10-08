import React, { useState, useMemo, useEffect } from "react";
import { Calendar, Clock, User, Users, Plus, Trash2, AlertCircle, CheckCircle2, Sparkles, Layers, Briefcase, Sliders, Gauge } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { cn } from "@/lib/utils";
import { 
  ProcessNodeInput, 
  MaterialFlowSimulationResult, 
  simulateMaterialFlow 
} from "@/utils/materialFlowEngine";

export interface ProductionCapacityOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  project?: any;
  processSteps?: any[];
  manpowerAssignments?: any[];
  factoryFactor?: number;
  initialLotSize?: number;
  currentLotSize?: number;
  initialTab?: "SIMULATOR" | "CPM_MATRIX" | "OVERTIME_SCHEDULE";
  onApplyLotSize?: (lotSize: number) => void;
  onConfirmSetMaster?: () => void;
  isSettingMaster?: boolean;
}

export const ProductionCapacityOptimizerModal: React.FC<ProductionCapacityOptimizerModalProps> = ({
  isOpen,
  onClose,
  projectId: propProjectId,
  project: propProject,
  processSteps: propProcessSteps,
  manpowerAssignments: propManpowerAssignments,
  factoryFactor: propFactoryFactor,
  initialLotSize,
  currentLotSize,
  initialTab = "SIMULATOR",
  onApplyLotSize,
  onConfirmSetMaster,
  isSettingMaster = false,
}) => {
  const { showToast } = useToast();

  // Active view tab inside the unified optimizer
  const [activeTab, setActiveTab] = useState<"SIMULATOR" | "CPM_MATRIX" | "OVERTIME_SCHEDULE">(initialTab);


  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Fallback state if props are loaded asynchronously
  const [asyncProject, setAsyncProject] = useState<any | null>(null);
  const [asyncProcessSteps, setAsyncProcessSteps] = useState<any[]>([]);
  const [asyncManpowerAssignments, setAsyncManpowerAssignments] = useState<any[]>([]);
  const [isLoadingAsync, setIsLoadingAsync] = useState(false);

  // Resolved project & steps
  const project = propProject || asyncProject;
  const processSteps = propProcessSteps || asyncProcessSteps;
  const manpowerAssignments = propManpowerAssignments || asyncManpowerAssignments;
  const effectiveProjectId = propProjectId || project?.id;

  const targetQty = Number(project?.qty) || 100;
  const initialFF = Number(propFactoryFactor || project?.factory_factor || 85);
  const baselineLotSize = Number(initialLotSize || currentLotSize || project?.default_lot_size || 50);

  // --- Interactive Simulation & Optimization Levers ---
  const [lotSize, setLotSize] = useState<number>(baselineLotSize);
  const [simWorkingHours, setSimWorkingHours] = useState<number>(8);
  const [simShiftMode, setSimShiftMode] = useState<number>(1);
  const [simFactoryFactor, setSimFactoryFactor] = useState<number>(initialFF);
  const [simBottleneckBoost, setSimBottleneckBoost] = useState<number>(0);
  const [simIsPipelined, setSimIsPipelined] = useState<boolean>(true);

  // CPM Backend Calculations & Gap State
  const [cpmData, setCpmData] = useState<any | null>(null);
  const [gapData, setGapData] = useState<any | null>(null);
  const [overtimeSimResult, setOvertimeSimResult] = useState<any | null>(null);
  const [isCpmLoading, setIsCpmLoading] = useState(false);

  // ─── Flow 2: Set Overtime (Siapa, Berapa Lama, Kapan) State & API ───
  const [overtimeList, setOvertimeList] = useState<any[]>([]);
  const [isLoadingOvertime, setIsLoadingOvertime] = useState(false);
  const [allManpower, setAllManpower] = useState<any[]>([]);
  const [allStations, setAllStations] = useState<any[]>([]);

  // Form Fields
  const [otManpowerId, setOtManpowerId] = useState("");
  const [otStationId, setOtStationId] = useState("");
  const [otDate, setOtDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [otHours, setOtHours] = useState<number>(2);
  const [otReason, setOtReason] = useState("Pengejaran target deadline SPK");
  const [isSubmittingOt, setIsSubmittingOt] = useState(false);

  const fetchOvertimeData = async () => {
    if (!effectiveProjectId) return;
    setIsLoadingOvertime(true);
    try {
      const [otRes, mpRes, stRes] = await Promise.all([
        apiFetch(`/api/production/projects/${effectiveProjectId}/overtime`).catch(() => ({ data: [] })),
        apiFetch('/api/production/manpower').catch(() => []),
        apiFetch(`/api/production/projects/${effectiveProjectId}/stations`).catch(() => []),
      ]);
      setOvertimeList(otRes?.data || []);
      if (Array.isArray(mpRes)) setAllManpower(mpRes);
      if (Array.isArray(stRes)) setAllStations(stRes);
    } catch (e) {
      console.error("Error fetching overtime data:", e);
    } finally {
      setIsLoadingOvertime(false);
    }
  };

  useEffect(() => {
    if (isOpen && effectiveProjectId) {
      fetchOvertimeData();
    }
  }, [isOpen, effectiveProjectId]);

  const handleCreateOvertime = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!effectiveProjectId) return;
    if (!otManpowerId) {
      showToast("Pilih operator yang akan ditugaskan lembur.", "error");
      return;
    }
    if (!otDate) {
      showToast("Pilih tanggal pelaksanaan lembur.", "error");
      return;
    }
    if (otHours <= 0) {
      showToast("Durasi lembur harus lebih dari 0 jam.", "error");
      return;
    }

    setIsSubmittingOt(true);
    try {
      const res = await apiFetch(`/api/production/projects/${effectiveProjectId}/overtime`, {
        method: "POST",
        body: JSON.stringify({
          manpower_id: otManpowerId,
          station_id: otStationId || undefined,
          date: otDate,
          overtime_hours: Number(otHours),
          reason: otReason,
        }),
      });

      if (res?.ok || res?.data) {
        showToast("Jadwal lembur berhasil ditambahkan!", "success");
        fetchOvertimeData();
        setOtHours(2);
        setOtReason("Pengejaran target deadline SPK");
      } else {
        showToast(res?.error || "Gagal menjadwalkan lembur", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Gagal menjadwalkan lembur", "error");
    } finally {
      setIsSubmittingOt(false);
    }
  };

  const handleDeleteOvertime = async (otId: string) => {
    if (!effectiveProjectId || !otId) return;
    try {
      const res = await apiFetch(`/api/production/projects/${effectiveProjectId}/overtime/${otId}`, {
        method: "DELETE",
      });
      if (res?.ok || res?.data) {
        showToast("Jadwal lembur dihapus.", "info");
        setOvertimeList((prev) => prev.filter((item) => item.id !== otId));
      }
    } catch (err: any) {
      showToast(err.message || "Gagal menghapus lembur", "error");
    }
  };

  // Fetch missing project details if only projectId was passed
  useEffect(() => {
    if (!isOpen || !effectiveProjectId) return;
    if (!propProject || !propProcessSteps || !propManpowerAssignments) {
      setIsLoadingAsync(true);
      Promise.all([
        apiFetch(`/api/projects/${effectiveProjectId}`).catch(() => null),
        apiFetch(`/api/production/projects/${effectiveProjectId}/stations`).catch(() => []),
      ])
        .then(([projRes]) => {
          if (projRes) {
            setAsyncProject(projRes);
            const steps = projRes.bop || projRes.bopSteps || [];
            setAsyncProcessSteps(steps);
          }
        })
        .finally(() => setIsLoadingAsync(false));
    }
  }, [isOpen, effectiveProjectId, propProject, propProcessSteps, propManpowerAssignments]);

  // Sync initial lot size if prop changes
  useEffect(() => {
    if (baselineLotSize && baselineLotSize !== lotSize) {
      setLotSize(baselineLotSize);
    }
  }, [baselineLotSize]);

  // Fetch CPM and Gap Analysis from backend when lotSize or projectId changes
  useEffect(() => {
    if (!isOpen || !effectiveProjectId) return;

    let isMounted = true;
    setIsCpmLoading(true);

    Promise.all([
      apiFetch(`/api/production/projects/${effectiveProjectId}/wot-cpm?wot_qty=${lotSize}`).catch(() => null),
      apiFetch(`/api/production/projects/${effectiveProjectId}/gap-analysis`).catch(() => null),
    ])
      .then(([cpmRes, gapRes]) => {
        if (!isMounted) return;
        setCpmData(cpmRes);
        setGapData(gapRes);
      })
      .finally(() => {
        if (isMounted) setIsCpmLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, effectiveProjectId, lotSize]);

  // 1. Transform raw process steps and assignments into baseline ProcessNodeInput
  const baselineNodeInputs: ProcessNodeInput[] = useMemo(() => {
    return (processSteps || []).map((step, idx) => {
      const rawCycleMins = step.cycle_time_minutes || Math.round((step.standard_hours || 1) * 60) || 10;
      const assignments = (manpowerAssignments || []).filter(
        (a) => a.bop_id === step.id || a.task_name === step.process_name || a.current_process_id === step.id
      );

      let predIds: string[] = [];
      try {
        predIds = typeof step.predecessor_ids === 'string' ? JSON.parse(step.predecessor_ids) : step.predecessor_ids || [];
      } catch {
        predIds = [];
      }

      return {
        id: step.id,
        name: step.process_name || `Step ${idx + 1}`,
        cycleTimeMinutes: rawCycleMins,
        predecessorIds: predIds,
        assignedOperatorIds: assignments.map((a: any) => a.manpower_id || a.id),
        manpowerCount: Math.max(1, assignments.length || 1),
        shiftMode: Number(step.shift_mode) || 1,
        standardHours: step.standard_hours,
        stepSequence: step.step_sequence || (idx + 1),
        assignments,
        rawStep: step,
      };
    });
  }, [processSteps, manpowerAssignments]);

  // 2. Run Baseline Discrete-Event Material Flow Simulation (Standard 8h, 1 shift, default FF)
  const baselineSim: MaterialFlowSimulationResult = useMemo(() => {
    return simulateMaterialFlow({
      tasks: baselineNodeInputs,
      targetQty,
      factoryFactor: initialFF,
      workingHoursPerDay: 8,
      isPipelined: true,
    });
  }, [baselineNodeInputs, targetQty, initialFF]);

  // 3. Compute Simulated Node Inputs by applying What-If adjustments
  const simulatedNodeInputs: ProcessNodeInput[] = useMemo(() => {
    const primaryBottleneckId = baselineSim.bottleneckStepId;
    return baselineNodeInputs.map((node) => {
      let extraOperators = 0;
      if (simBottleneckBoost > 0 && node.id === primaryBottleneckId) {
        extraOperators = simBottleneckBoost;
      }

      return {
        ...node,
        manpowerCount: (node.manpowerCount || 1) + extraOperators,
        shiftMode: simShiftMode,
      };
    });
  }, [baselineNodeInputs, baselineSim.bottleneckStepId, simBottleneckBoost, simShiftMode]);

  // 4. Run Simulated Discrete-Event Material Flow Simulation with live parameters
  const simulatedSim: MaterialFlowSimulationResult = useMemo(() => {
    const totalEffectiveDailyHours = simWorkingHours * simShiftMode;
    return simulateMaterialFlow({
      tasks: simulatedNodeInputs,
      targetQty,
      factoryFactor: simFactoryFactor,
      workingHoursPerDay: totalEffectiveDailyHours,
      isPipelined: simIsPipelined,
    });
  }, [simulatedNodeInputs, targetQty, simFactoryFactor, simWorkingHours, simShiftMode, simIsPipelined]);

  // 5. Compute Unified Metrics & Scheduling Feasibility
  const metrics = useMemo(() => {
    const now = new Date();
    
    // Baseline Finish Date
    const baselineFinishDate = new Date();
    baselineFinishDate.setDate(now.getDate() + Math.ceil(baselineSim.estimatedWorkingDays));

    // Simulated Finish Date
    const simFinishDate = new Date();
    simFinishDate.setDate(now.getDate() + Math.ceil(simulatedSim.estimatedWorkingDays));

    // Deadline analysis
    const hasDeadline = Boolean(project?.due_date);
    const deadlineDate = hasDeadline ? new Date(project.due_date) : null;
    
    // Gap in calendar days (positive = overdue, negative = safe buffer)
    const gapDays = deadlineDate 
      ? Math.ceil((simFinishDate.getTime() - deadlineDate.getTime()) / (1000 * 3600 * 24))
      : 0;

    const unassignedCount = baselineNodeInputs.filter(t => (t.assignedOperatorIds || []).length === 0).length;
    const timeSavedDays = Math.max(0, baselineSim.estimatedWorkingDays - simulatedSim.estimatedWorkingDays);
    const timeSavedHours = Math.max(0, baselineSim.totalMakespanHours - simulatedSim.totalMakespanHours);
    const throughputDelta = simulatedSim.lineDailyThroughput - baselineSim.lineDailyThroughput;

    const isModified = simWorkingHours !== 8 || 
      simShiftMode !== 1 || 
      simFactoryFactor !== initialFF || 
      simBottleneckBoost !== 0 || 
      !simIsPipelined ||
      lotSize !== baselineLotSize;

    // Computed Lot Count
    const totalWotLots = Math.ceil(targetQty / Math.max(1, lotSize));

    // Lead time for 1 WOT from CPM or calculation
    const singleWotLeadTimeDays = cpmData?.totalLeadTimeDays || Number(((baselineSim.totalRawCycleSum * lotSize) / (8 * 60)).toFixed(2));
    const singleWotLeadTimeMinutes = cpmData?.totalLeadTimeMinutes || Math.round(singleWotLeadTimeDays * 8 * 60);

    return {
      hasDeadline,
      deadlineDate,
      baselineDays: Math.ceil(baselineSim.estimatedWorkingDays),
      baselineMakespanHours: baselineSim.totalMakespanHours,
      baselineDailyThroughput: baselineSim.lineDailyThroughput,
      baselineFinishDate,
      baselineBottleneck: baselineSim.pacingBottleneckStep,
      
      simDays: Math.ceil(simulatedSim.estimatedWorkingDays),
      simMakespanHours: simulatedSim.totalMakespanHours,
      simDailyThroughput: simulatedSim.lineDailyThroughput,
      simFinishDate,
      simBottleneck: simulatedSim.pacingBottleneckStep,
      lineEfficiency: simulatedSim.lineBalancingEfficiency,
      
      gapDays,
      unassignedCount,
      timeSavedDays,
      timeSavedHours,
      throughputDelta,
      isModified,
      totalWotLots,
      singleWotLeadTimeDays,
      singleWotLeadTimeMinutes,
    };
  }, [
    baselineSim, simulatedSim, baselineNodeInputs, project?.due_date, 
    simWorkingHours, simShiftMode, simFactoryFactor, initialFF, 
    simBottleneckBoost, simIsPipelined, lotSize, baselineLotSize, 
    targetQty, cpmData
  ]);

  // Schedule status configuration
  const scheduleStatus = useMemo(() => {
    if (!metrics.hasDeadline) {
      return {
        status: "INFO",
        theme: "bg-stone-50/80 border-stone-200 text-stone-700",
        badgeBg: "bg-stone-100 text-stone-700 border-stone-200",
        dotColor: "bg-stone-400",
        title: "No SPK Deadline Set",
        subtitle: `Estimated duration: ${metrics.simDays} working days to complete ${targetQty} units.`,
      };
    }

    if (metrics.gapDays > 0) {
      return {
        status: "OVERDUE",
        theme: "bg-rose-50/60 border-rose-200 text-rose-950",
        badgeBg: "bg-rose-100/80 text-rose-800 border-rose-200",
        dotColor: "bg-rose-500",
        title: `Overdue Risk: Shortfall of ${metrics.gapDays} Days`,
        subtitle: `Estimated finish (${metrics.simFinishDate.toLocaleDateString()}) exceeds SPK deadline (${metrics.deadlineDate?.toLocaleDateString()}).`,
      };
    }

    if (metrics.gapDays >= -3) {
      return {
        status: "TIGHT",
        theme: "bg-amber-50/60 border-amber-200 text-amber-950",
        badgeBg: "bg-amber-100/80 text-amber-800 border-amber-200",
        dotColor: "bg-amber-500",
        title: `Tight Schedule: ${Math.abs(metrics.gapDays)} Days Buffer`,
        subtitle: `Estimated finish is close to deadline. Maintain steady execution without downtime.`,
      };
    }

    return {
      status: "SAFE",
      theme: "bg-emerald-50/60 border-emerald-200 text-emerald-950",
      badgeBg: "bg-emerald-100/80 text-emerald-800 border-emerald-200",
      dotColor: "bg-emerald-500",
      title: `Schedule On-Track: ${Math.abs(metrics.gapDays)} Days Ahead`,
      subtitle: `Delivery completes ahead of SPK deadline (${metrics.deadlineDate?.toLocaleDateString()}).`,
    };
  }, [metrics, targetQty]);

  // Automated Actionable Insights
  const automatedInsights = useMemo(() => {
    const insights: Array<{
      id: string;
      category: string;
      title: string;
      desc: string;
      type: "risk" | "warning" | "success" | "strategy";
    }> = [];

    // 1. Manpower Warning
    if (metrics.unassignedCount > 0) {
      insights.push({
        id: "unassigned",
        category: "Staffing",
        type: "warning",
        title: `${metrics.unassignedCount} Workstation(s) Unstaffed`,
        desc: "Simulation assumes 1 baseline operator per station. Assign permanent operators to lock shopfloor routing.",
      });
    }

    // 2. Schedule & Overtime Recommendation
    if (metrics.hasDeadline && metrics.gapDays > 0) {
      const neededHoursPerDay = Math.min(14, Math.ceil((metrics.baselineMakespanHours / (metrics.baselineDays - metrics.gapDays || 1)) / simShiftMode));
      const overtimeDiff = Math.max(1, neededHoursPerDay - simWorkingHours);
      
      insights.push({
        id: "overtime-advice",
        category: "Overtime",
        type: "risk",
        title: "Schedule Compression Recommended",
        desc: `To meet deadline, add +${overtimeDiff}h/day overtime or activate a 2nd shift in the simulator.`,
      });
    } else if (metrics.hasDeadline && metrics.gapDays <= -7) {
      insights.push({
        id: "cost-guardrail",
        category: "Efficiency",
        type: "success",
        title: "Capacity Buffer & Cost Efficiency",
        desc: `Delivery is safely ${Math.abs(metrics.gapDays)} days ahead of deadline. Standard 1-shift operation is optimal with zero overtime expense.`,
      });
    }

    // 3. Bottleneck Workstation Advice
    if (metrics.simBottleneck) {
      const isRelieved = simBottleneckBoost > 0;
      insights.push({
        id: "bottleneck",
        category: "Constraint",
        type: isRelieved ? "strategy" : "warning",
        title: `Pacing Bottleneck: ${metrics.simBottleneck.name}`,
        desc: isRelieved 
          ? `Staffed with +${simBottleneckBoost} extra operator(s). Pacing improved to ${metrics.simBottleneck.adjustedCycleTimeMinutes.toFixed(1)}m / pc.`
          : `Station cycle is ${metrics.simBottleneck.adjustedCycleTimeMinutes.toFixed(1)}m / pc, setting total line output to ${metrics.simDailyThroughput} pcs/day. Adding manpower here yields highest throughput gains.`,
      });
    }

    // 4. Lot Sizing Trade-Off Insight
    if (lotSize <= 25) {
      insights.push({
        id: "lot-flow",
        category: "Lot Flow",
        type: "strategy",
        title: "High-Frequency Lot Transfer (Lean Flow)",
        desc: `Batch size of ${lotSize} units minimizes WIP holding time and unlocks rapid piece flow, though requires more frequent lot gate confirmations.`,
      });
    } else if (lotSize >= 200) {
      insights.push({
        id: "lot-batch",
        category: "Batching",
        type: "warning",
        title: "Large Batch Concentration",
        desc: `Batch size of ${lotSize} units reduces transfer frequency, but increases downstream station wait times and first-batch delivery lag.`,
      });
    }

    return insights;
  }, [metrics, simBottleneckBoost, simWorkingHours, simShiftMode, lotSize]);

  // Overtime Simulation Calculator
  const overtimeScenarios = useMemo(() => {
    const baseDays = metrics.baselineDays;
    const baseDailyHours = 8;
    const scenarios = [
      { id: "std", label: "Standard (8h / 1 Shift)", hours: 8, shifts: 1 },
      { id: "ot1", label: "+1h Overtime (9h / 1 Shift)", hours: 9, shifts: 1 },
      { id: "ot2", label: "+2h Overtime (10h / 1 Shift)", hours: 10, shifts: 1 },
      { id: "ot4", label: "+4h Overtime (12h / 1 Shift)", hours: 12, shifts: 1 },
      { id: "sh2", label: "2 Shifts (16h Total)", hours: 16, shifts: 2 },
      { id: "sh3", label: "3 Shifts (24h Continuous)", hours: 24, shifts: 3 },
    ];

    const now = new Date();
    return scenarios.map(sc => {
      const effHours = sc.hours;
      const calDays = Math.max(1, Math.ceil((baseDays * baseDailyHours) / effHours));
      const saved = Math.max(0, baseDays - calDays);
      const estFinish = new Date();
      estFinish.setDate(now.getDate() + calDays);
      
      const deadline = metrics.hasDeadline && project?.due_date ? new Date(project.due_date) : null;
      const gap = deadline ? Math.ceil((estFinish.getTime() - deadline.getTime()) / (1000 * 3600 * 24)) : 0;

      return {
        ...sc,
        calDays,
        saved,
        estFinish,
        gap,
        isSafe: gap <= 0,
      };
    });
  }, [metrics.baselineDays, metrics.hasDeadline, project?.due_date]);

  // Reset to project baseline
  const handleReset = () => {
    setLotSize(baselineLotSize);
    setSimWorkingHours(8);
    setSimShiftMode(1);
    setSimFactoryFactor(initialFF);
    setSimBottleneckBoost(0);
    setSimIsPipelined(true);
  };

  // Apply selected lot size to project
  const handleApplyLotSize = () => {
    if (onApplyLotSize) {
      onApplyLotSize(lotSize);
    }
    showToast(`WOT Lot Size updated to ${lotSize} pcs/lot.`, "success");
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 leading-tight">
              Production Capacity & WOT Lot Sizing Optimizer
            </h2>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
              CPM & Flow Simulation
            </span>
          </div>
          <p className="text-xs text-stone-500 font-normal">
            Discrete-event capacity simulation, workstation bottleneck pacing analysis, and schedule feasibility verification.
          </p>
        </div>
      }
      maxWidth="6xl"
      contentClassName="p-0"
    >
      <div className="flex flex-col h-full bg-stone-50/40 dark:bg-stone-950">
        <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-[85vh]">
          
          {/* Header Ribbon / Project Reference */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 px-4 py-2.5 rounded-2xl text-xs">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-bold text-stone-900 dark:text-stone-100 text-sm">
                {project?.name || "Production Order"}
              </span>
              {project?.spk_number && (
                <span className="font-mono text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-md border border-stone-200 dark:border-stone-700 font-semibold">
                  {project.spk_number}
                </span>
              )}
              <span className="text-stone-300 dark:text-stone-700">•</span>
              <span className="text-stone-600 dark:text-stone-400">
                Target Batch: <strong className="font-mono text-stone-900 dark:text-stone-100">{targetQty} Units</strong>
              </span>
              <span className="text-stone-300 dark:text-stone-700">•</span>
              <span className="text-stone-600 dark:text-stone-400">
                Current Lot Size: <strong className="font-mono text-stone-900 dark:text-stone-100">{lotSize} pcs / lot</strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              {metrics.hasDeadline ? (
                <div className="flex items-center gap-1.5 text-stone-600 dark:text-stone-400">
                  <span>SPK Deadline:</span>
                  <strong className="font-mono text-stone-900 dark:text-stone-100">{metrics.deadlineDate?.toLocaleDateString()}</strong>
                </div>
              ) : (
                <span className="text-stone-400 italic">No SPK Deadline Attached</span>
              )}
            </div>
          </div>

          {/* TOP ROW: 6 KPI EXECUTIVE METRIC CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* 1. Total Lead Time / Makespan */}
            <div className="border border-stone-200 dark:border-stone-800 rounded-2xl p-3 bg-white dark:bg-stone-900 shadow-2xs flex flex-col justify-between">
              <div className="text-[10px] font-mono font-semibold text-stone-500 uppercase tracking-wider flex items-center justify-between mb-1">
                <span>Total Makespan</span>
                {metrics.isModified && metrics.timeSavedDays > 0 && (
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-1 py-0.2 rounded border border-emerald-200 dark:border-emerald-800">
                    -{metrics.timeSavedDays}d
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono text-stone-900 dark:text-stone-100 leading-none">
                    {metrics.simDays}
                  </span>
                  <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-400 uppercase">Days</span>
                </div>
                <div className="text-[10px] text-stone-400 font-mono mt-0.5 truncate">
                  {metrics.simMakespanHours.toFixed(1)}h total
                </div>
              </div>
            </div>

            {/* 2. 1-WOT Batch Lead Time (CPM) */}
            <div className="border border-stone-200 dark:border-stone-800 rounded-2xl p-3 bg-white dark:bg-stone-900 shadow-2xs flex flex-col justify-between">
              <div className="text-[10px] font-mono font-semibold text-stone-500 uppercase tracking-wider mb-1">
                1 WOT Lead Time
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 leading-none">
                    {metrics.singleWotLeadTimeDays}
                  </span>
                  <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-400 uppercase">Days</span>
                </div>
                <div className="text-[10px] text-stone-400 font-mono mt-0.5 truncate">
                  {metrics.singleWotLeadTimeMinutes} min / lot batch
                </div>
              </div>
            </div>

            {/* 3. Daily Line Throughput */}
            <div className="border border-stone-200 dark:border-stone-800 rounded-2xl p-3 bg-white dark:bg-stone-900 shadow-2xs flex flex-col justify-between">
              <div className="text-[10px] font-mono font-semibold text-stone-500 uppercase tracking-wider flex items-center justify-between mb-1">
                <span>Daily Output</span>
                {metrics.isModified && metrics.throughputDelta !== 0 && (
                  <span className={cn(
                    "text-[9px] font-bold px-1 py-0.2 rounded border",
                    metrics.throughputDelta > 0 
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200" 
                      : "text-amber-700 bg-amber-50 border-amber-200"
                  )}>
                    {metrics.throughputDelta > 0 ? `+${metrics.throughputDelta}` : metrics.throughputDelta}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 leading-none">
                    {metrics.simDailyThroughput}
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-500 uppercase">Pcs/d</span>
                </div>
                <div className="text-[10px] text-stone-400 font-mono mt-0.5 truncate">
                  Pacing: {metrics.simBottleneck?.adjustedCycleTimeMinutes.toFixed(1) || 0}m / pc
                </div>
              </div>
            </div>

            {/* 4. Total WOT Lots */}
            <div className="border border-stone-200 dark:border-stone-800 rounded-2xl p-3 bg-white dark:bg-stone-900 shadow-2xs flex flex-col justify-between">
              <div className="text-[10px] font-mono font-semibold text-stone-500 uppercase tracking-wider mb-1">
                WOT Lot Count
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono text-stone-900 dark:text-stone-100 leading-none">
                    {metrics.totalWotLots}
                  </span>
                  <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-400 uppercase">Lots</span>
                </div>
                <div className="text-[10px] text-stone-400 font-mono mt-0.5 truncate">
                  at {lotSize} pcs / lot
                </div>
              </div>
            </div>

            {/* 5. Line Balancing & Efficiency */}
            <div className="border border-stone-200 dark:border-stone-800 rounded-2xl p-3 bg-white dark:bg-stone-900 shadow-2xs flex flex-col justify-between">
              <div className="text-[10px] font-mono font-semibold text-stone-500 uppercase tracking-wider mb-1">
                Line Balance
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono text-stone-900 dark:text-stone-100 leading-none">
                    {metrics.lineEfficiency}%
                  </span>
                  <span className="text-[10px] text-stone-400 font-mono">@ FF {simFactoryFactor}%</span>
                </div>
                <div className="text-[10px] text-stone-400 font-mono mt-0.5 truncate">
                  Flow: {simIsPipelined ? "Continuous" : "Batch"}
                </div>
              </div>
            </div>

            {/* 6. Bottleneck Station */}
            <div className="border border-stone-200 dark:border-stone-800 rounded-2xl p-3 bg-white dark:bg-stone-900 shadow-2xs flex flex-col justify-between">
              <div className="text-[10px] font-mono font-semibold text-stone-500 uppercase tracking-wider mb-1">
                Bottleneck
              </div>
              <div>
                <div className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate" title={metrics.simBottleneck?.name}>
                  {metrics.simBottleneck?.name || "Balanced Line"}
                </div>
                <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5 font-semibold truncate">
                  {simBottleneckBoost > 0 ? `+${simBottleneckBoost} Extra Op` : "Critical Constraint"}
                </div>
              </div>
            </div>
          </div>

          {/* SCHEDULE FEASIBILITY BANNER */}
          <div className={cn("border p-3.5 rounded-2xl flex items-start justify-between gap-3", scheduleStatus.theme)}>
            <div className="flex items-start gap-2.5">
              <span className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5", scheduleStatus.dotColor)} />
              <div>
                <h4 className="font-bold text-xs leading-tight">{scheduleStatus.title}</h4>
                <p className="text-[11px] mt-0.5 opacity-90">{scheduleStatus.subtitle}</p>
              </div>
            </div>

            {metrics.hasDeadline && (
              <div className="flex items-center gap-3 shrink-0 text-right">
                <div className="hidden sm:block">
                  <span className="text-[10px] opacity-75 block uppercase font-bold">Projected Delivery</span>
                  <span className="font-mono font-bold text-xs">{metrics.simFinishDate.toLocaleDateString()}</span>
                </div>
                <div className={cn("px-2.5 py-1 rounded-xl border text-xs font-bold font-mono shrink-0", scheduleStatus.badgeBg)}>
                  {metrics.gapDays > 0 ? `+${metrics.gapDays} Days Overdue` : `${Math.abs(metrics.gapDays)} Days Buffer`}
                </div>
              </div>
            )}
          </div>

          {/* TAB NAVIGATION HEADER */}
          <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pt-1 pb-2">
            <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-stone-900 p-1 rounded-xl border border-stone-200 dark:border-stone-800">
              
                <button
                  type="button"
                  onClick={() => setActiveTab("OVERTIME_SCHEDULE")}
                  className={cn(
                    "flex-1 px-4 py-2.5 text-xs font-bold rounded-lg transition-all text-center flex items-center justify-center gap-2",
                    activeTab === "OVERTIME_SCHEDULE"
                      ? "bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700"
                      : "text-stone-500 hover:text-stone-700 hover:bg-stone-200 dark:hover:bg-stone-800"
                  )}
                >
                  <Clock className="w-4 h-4" /> Overtime Schedule
                </button>
            </div>

            {metrics.isModified && (
              <Button
                onClick={handleReset}
                variant="secondary"
                size="sm"
                className="h-8 text-xs font-semibold rounded-xl border-stone-200 dark:border-stone-700 text-stone-600 hover:text-stone-900"
              >
                Reset Defaults
              </Button>
            )}
          </div>

          {/* TAB 1: INTEGRATED SIMULATION & PARAMETER LEVERS */}
          {activeTab === "SIMULATOR" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              
              {/* LEFT: AUTOMATED INSIGHTS & BOTTLENECK STRATEGY (5 Cols) */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                    Operational Insights
                  </span>
                  <span className="text-[10px] text-stone-500 font-mono">Dynamic Analysis</span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {automatedInsights.map((insight) => (
                    <div
                      key={insight.id}
                      className={cn(
                        "border rounded-2xl p-3 bg-white dark:bg-stone-900 shadow-2xs transition-all",
                        insight.type === "risk" && "border-rose-200 dark:border-rose-900/50 bg-rose-50/30 dark:bg-rose-950/20",
                        insight.type === "warning" && "border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/20",
                        insight.type === "success" && "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/20",
                        insight.type === "strategy" && "border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={cn(
                          "text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                          insight.type === "risk" && "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
                          insight.type === "warning" && "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
                          insight.type === "success" && "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
                          insight.type === "strategy" && "bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700"
                        )}>
                          {insight.category}
                        </span>
                        <span className="text-[10px] font-mono text-stone-400 capitalize">{insight.type}</span>
                      </div>
                      <h5 className="font-bold text-xs text-stone-900 dark:text-stone-100 leading-snug">{insight.title}</h5>
                      <p className="text-[11px] text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">{insight.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Lot Sizing Summary Box */}
                <div className="p-3.5 bg-stone-100/60 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-stone-800 dark:text-stone-200">
                    <span>WOT Generation Preview</span>
                    <span className="font-mono text-stone-900 dark:text-stone-100">
                      {metrics.totalWotLots} Total Lots
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-500 space-y-1">
                    <p>
                      • Target Order: <strong className="text-stone-800 dark:text-stone-200 font-mono">{targetQty} units</strong> divided into batches of <strong className="text-stone-800 dark:text-stone-200 font-mono">{lotSize} pcs</strong>.
                    </p>
                    <p>
                      • First finished lot exits line in <strong className="text-stone-800 dark:text-stone-200 font-mono">{metrics.singleWotLeadTimeDays} days</strong> ({metrics.singleWotLeadTimeMinutes} min).
                    </p>
                  </div>
                  {onApplyLotSize && lotSize !== baselineLotSize && (
                    <Button
                      onClick={handleApplyLotSize}
                      size="sm"
                      className="w-full h-8 mt-1 text-xs font-bold bg-stone-900 hover:bg-stone-800 text-white rounded-xl"
                    >
                      Apply {lotSize} pcs/lot to Project Plan
                    </Button>
                  )}
                </div>
              </div>

              {/* RIGHT: INTERACTIVE PARAMETER LEVERS (7 Cols) */}
              <div className="lg:col-span-7 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 bg-white dark:bg-stone-900 shadow-2xs space-y-4">
                <div className="border-b border-stone-100 dark:border-stone-800 pb-2">
                  <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                    Capacity & Lot Sizing Levers
                  </h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Slide parameters to simulate capacity, shift adjustments, lot sizing, and overtime in real-time.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* 1. WOT Lot Size Slider */}
                  <div className="bg-stone-50 dark:bg-stone-800/40 p-3.5 rounded-2xl border border-stone-200/80 dark:border-stone-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                          WOT Lot Batch Sizing (Q_lot)
                        </span>
                        <p className="text-[10px] text-stone-500">
                          Governs lot transfer gate size between workstations
                        </p>
                      </div>
                      <span className="font-mono font-bold text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
                        {lotSize} pcs / lot
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={Math.max(100, Math.min(500, targetQty))}
                      step={5}
                      value={lotSize}
                      onChange={(e) => setLotSize(Number(e.target.value))}
                      className="w-full h-1.5 bg-stone-200 dark:bg-stone-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-[10px] text-stone-400 font-mono">
                      <span>10 pcs (Rapid Flow)</span>
                      <span>{Math.round(targetQty / 4)} pcs (Balanced)</span>
                      <span>{Math.min(500, targetQty)} pcs (Max Batch)</span>
                    </div>
                  </div>

                  {/* 2. Daily Working Hours & Overtime Slider */}
                  <div className="bg-stone-50 dark:bg-stone-800/40 p-3.5 rounded-2xl border border-stone-200/80 dark:border-stone-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                          Daily Shift Working Hours
                        </span>
                        <p className="text-[10px] text-stone-500">
                          Standard duration and daily overtime extensions
                        </p>
                      </div>
                      <span className="font-mono font-bold text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800">
                        {simWorkingHours} h / day
                        {simWorkingHours > 8 && ` (+${simWorkingHours - 8}h OT)`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={7}
                      max={14}
                      step={0.5}
                      value={simWorkingHours}
                      onChange={(e) => setSimWorkingHours(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-stone-200 dark:bg-stone-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {[
                        { label: "Standard (8h)", hours: 8 },
                        { label: "+1h OT (9h)", hours: 9 },
                        { label: "+2h OT (10h)", hours: 10 },
                        { label: "+4h OT (12h)", hours: 12 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setSimWorkingHours(preset.hours)}
                          className={cn(
                            "px-2 py-0.5 text-[10px] font-bold rounded-md border transition-all",
                            simWorkingHours === preset.hours
                              ? "bg-stone-900 text-white border-stone-900"
                              : "bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-100"
                          )}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Shift Mode Segmented Control */}
                  <div className="bg-stone-50 dark:bg-stone-800/40 p-3.5 rounded-2xl border border-stone-200/80 dark:border-stone-700/60">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                        Operation Shift Schedule
                      </span>
                      <span className="text-[11px] text-stone-500 font-medium">
                        Total Line Time: <strong className="font-mono text-stone-900 dark:text-stone-100">{simWorkingHours * simShiftMode}h / day</strong>
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 1, label: "1 Shift", desc: "Single Crew" },
                        { id: 2, label: "2 Shifts", desc: "Day & Evening" },
                        { id: 3, label: "3 Shifts", desc: "24h Continuous" },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSimShiftMode(s.id)}
                          className={cn(
                            "p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between",
                            simShiftMode === s.id
                              ? "bg-white dark:bg-stone-800 border-blue-600 dark:border-blue-500 ring-1 ring-blue-600 shadow-2xs"
                              : "bg-white/60 dark:bg-stone-900/60 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-white"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-stone-900 dark:text-stone-100">{s.label}</span>
                            {simShiftMode === s.id && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />}
                          </div>
                          <span className="text-[10px] text-stone-400 mt-0.5">{s.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4. Factory Factor (OEE Buffer) Slider */}
                  <div className="bg-stone-50 dark:bg-stone-800/40 p-3.5 rounded-2xl border border-stone-200/80 dark:border-stone-700/60">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                        Factory Factor (OEE & Human Efficiency Buffer)
                      </span>
                      <span className="font-mono font-bold text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                        {simFactoryFactor}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="100"
                      step="5"
                      value={simFactoryFactor}
                      onChange={(e) => setSimFactoryFactor(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-stone-200 dark:bg-stone-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-stone-400 font-mono mt-1">
                      <span>60% (Low OEE)</span>
                      <span>75%</span>
                      <span className="font-bold text-stone-600 dark:text-stone-300">85% (ERP Standard)</span>
                      <span>95%</span>
                      <span>100% (Theoretical)</span>
                    </div>
                  </div>

                  {/* 5. Bottleneck Station Boost & Flow Mode */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Bottleneck Boost */}
                    <div className="bg-stone-50 dark:bg-stone-800/40 p-3.5 rounded-2xl border border-stone-200/80 dark:border-stone-700/60 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                          Bottleneck Station Booster
                        </span>
                        <span className="text-[10px] text-stone-400">Add Crew</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[0, 1, 2, 3].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setSimBottleneckBoost(num)}
                            className={cn(
                              "py-1 text-xs font-bold rounded-lg border text-center transition-all",
                              simBottleneckBoost === num
                                ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900 dark:border-stone-100 shadow-2xs"
                                : "bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100"
                            )}
                          >
                            {num === 0 ? "Default" : `+${num} Op`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Flow Mode */}
                    <div className="bg-stone-50 dark:bg-stone-800/40 p-3.5 rounded-2xl border border-stone-200/80 dark:border-stone-700/60 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                          Material Flow Transfer
                        </span>
                        <span className="text-[10px] text-stone-400">Pipeline</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSimIsPipelined(true)}
                          className={cn(
                            "py-1.5 text-xs font-bold rounded-lg border text-center transition-all",
                            simIsPipelined
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                              : "bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100"
                          )}
                        >
                          1-WOT Flow
                        </button>
                        <button
                          type="button"
                          onClick={() => setSimIsPipelined(false)}
                          className={cn(
                            "py-1.5 text-xs font-bold rounded-lg border text-center transition-all",
                            !simIsPipelined
                              ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                              : "bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100"
                          )}
                        >
                          Full Batch
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* TAB 2: CRITICAL PATH METHOD (CPM) & STATION FLOAT MATRIX */}
          {activeTab === "CPM_MATRIX" && (
            <div className="space-y-4">
              <div className="p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                    Critical Path Method (CPM) Network Breakdown
                  </h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Station-by-station schedule calculated for a single WOT batch ({lotSize} pcs) with forward and backward slack passes.
                  </p>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="px-2.5 py-1 bg-stone-100 dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-700">
                    1 WOT Total: <strong>{metrics.singleWotLeadTimeDays} Days</strong>
                  </span>
                  <span className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 rounded-lg border border-rose-200 dark:border-rose-800 font-bold">
                    {cpmData?.nodes ? cpmData.nodes.filter((n: any) => n.is_critical).length : 0} Critical Steps
                  </span>
                </div>
              </div>

              {/* Station Table */}
              <div className="border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden bg-white dark:bg-stone-900 shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-mono text-[10px] uppercase border-b border-stone-200 dark:border-stone-700">
                      <tr>
                        <th className="p-3">Seq</th>
                        <th className="p-3">Station / Process Step</th>
                        <th className="p-3 text-center">Cycle (min)</th>
                        <th className="p-3 text-center">Staffing</th>
                        <th className="p-3 text-center">1-WOT Duration</th>
                        <th className="p-3 text-center">Early Start (ES)</th>
                        <th className="p-3 text-center">Early Finish (EF)</th>
                        <th className="p-3 text-center">Slack / Float</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 dark:divide-stone-800 font-mono">
                      {cpmData?.nodes && cpmData.nodes.length > 0 ? (
                        cpmData.nodes.map((n: any, idx: number) => {
                          const isCritical = Boolean(n.is_critical);
                          return (
                            <tr 
                              key={n.id || idx} 
                              className={cn(
                                "hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors",
                                isCritical ? "bg-rose-50/30 dark:bg-rose-950/10" : ""
                              )}
                            >
                              <td className="p-3 text-stone-400 font-bold">#{n.step_sequence || idx + 1}</td>
                              <td className="p-3 font-sans font-bold text-stone-900 dark:text-stone-100">
                                {n.process_name || `Step ${idx + 1}`}
                                {n.station_name && (
                                  <span className="block text-[10px] text-stone-400 font-mono font-normal">
                                    {n.station_code ? `[${n.station_code}] ` : ""}{n.station_name}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">{n.cycle_time_minutes}m</td>
                              <td className="p-3 text-center font-bold">{n.mp_count || n.mp || 1} MP</td>
                              <td className="p-3 text-center font-bold text-stone-800 dark:text-stone-200">
                                {Number(n.duration_days || n.duration || 0).toFixed(2)}d
                                <span className="block text-[10px] text-stone-400 font-normal">
                                  {Math.round(n.duration_minutes || 0)} min
                                </span>
                              </td>
                              <td className="p-3 text-center text-stone-500">{Number(n.es || 0).toFixed(2)}d</td>
                              <td className="p-3 text-center text-stone-500">{Number(n.ef || 0).toFixed(2)}d</td>
                              <td className="p-3 text-center font-bold">
                                {Number(n.float || 0).toFixed(2)}d
                              </td>
                              <td className="p-3 text-center">
                                {isCritical ? (
                                  <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 text-[10px] font-bold rounded-md border border-rose-300 dark:border-rose-800 uppercase">
                                    Critical
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-500 text-[10px] font-bold rounded-md uppercase">
                                    Float OK
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        baselineNodeInputs.map((node, idx) => (
                          <tr key={node.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                            <td className="p-3 text-stone-400 font-bold">#{node.stepSequence || idx + 1}</td>
                            <td className="p-3 font-sans font-bold text-stone-900 dark:text-stone-100">{node.name}</td>
                            <td className="p-3 text-center">{node.cycleTimeMinutes}m</td>
                            <td className="p-3 text-center font-bold">{node.manpowerCount} MP</td>
                            <td className="p-3 text-center font-bold">
                              {((node.cycleTimeMinutes * lotSize) / (8 * 60)).toFixed(2)}d
                            </td>
                            <td className="p-3 text-center text-stone-400">-</td>
                            <td className="p-3 text-center text-stone-400">-</td>
                            <td className="p-3 text-center text-stone-400">-</td>
                            <td className="p-3 text-center">
                              <span className="text-stone-400 text-[10px]">Baseline</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OVERTIME & CAPACITY SCHEDULE SCENARIOS */}
          {activeTab === "OVERTIME_SCHEDULE" && (
            <div className="space-y-4">
              <div className="p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xs">
                <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                  Overtime & Capacity Compression Scenarios
                </h4>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Simulate extending working hours or adding operating shifts to compress calendar duration and secure SPK delivery deadlines.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {overtimeScenarios.map((sc) => (
                  <div
                    key={sc.id}
                    className={cn(
                      "p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 bg-white dark:bg-stone-900",
                      sc.isSafe ? "border-stone-200 dark:border-stone-800" : "border-rose-200 dark:border-rose-900/60 bg-rose-50/20"
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-stone-900 dark:text-stone-100">{sc.label}</span>
                        <span className="text-[10px] font-mono text-stone-400">{sc.hours}h / day</span>
                      </div>
                      <div className="mt-2 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold font-mono text-stone-900 dark:text-stone-100">
                          {sc.calDays}
                        </span>
                        <span className="text-xs font-bold text-stone-500 uppercase">Days</span>
                        {sc.saved > 0 && (
                          <span className="ml-auto text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800 font-mono">
                            -{sc.saved}d Saved
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-stone-100 dark:border-stone-800 pt-2 text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-stone-500">
                        <span>Projected Finish:</span>
                        <strong className="text-stone-800 dark:text-stone-200 font-mono">{sc.estFinish.toLocaleDateString()}</strong>
                      </div>
                      {metrics.hasDeadline && (
                        <div className="flex items-center justify-between">
                          <span className="text-stone-500">Deadline Gap:</span>
                          <span className={cn(
                            "font-mono font-bold text-[10px] px-1.5 py-0.2 rounded",
                            sc.gap > 0 ? "text-rose-700 bg-rose-100" : "text-emerald-700 bg-emerald-100"
                          )}>
                            {sc.gap > 0 ? `+${sc.gap}d Overdue` : `${Math.abs(sc.gap)}d Buffer`}
                          </span>
                        </div>
                      )}
                    </div>

                    <Button
                      onClick={() => {
                        setSimWorkingHours(sc.hours / sc.shifts);
                        setSimShiftMode(sc.shifts);
                        setActiveTab("SIMULATOR");
                        showToast(`Adopted ${sc.label} in simulator.`, "info");
                      }}
                      variant="secondary"
                      size="sm"
                      className="w-full text-xs font-bold h-8 rounded-xl border-stone-200 dark:border-stone-700"
                    >
                      Apply to Simulation
                    </Button>
                  </div>
                ))}
              </div>

              {/* ─── INTERACTIVE OVERTIME ASSIGNMENT & REAL-TIME IMPACT ─── */}
              <div className="pt-2 space-y-4">
                {/* Real-time Overtime Impact Summary */}
                {(() => {
                  const totalOtHours = overtimeList.reduce((acc, ot) => acc + (Number(ot.overtime_hours) || 0), 0);
                  const daysCompressed = (totalOtHours / 8).toFixed(1);
                  const distinctOperators = new Set(overtimeList.map(ot => ot.manpower_id)).size;
                  return (
                    <div className="p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300 dark:border-amber-800/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 rounded-xl border border-amber-300 dark:border-amber-700">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className="text-xs font-black uppercase tracking-wider text-amber-950 dark:text-amber-200">
                              Dampak Lembur Terjadwal pada Lead Time
                            </h5>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100">
                              {overtimeList.length} Jadwal Aktif
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-600 dark:text-stone-300 mt-0.5">
                            Total <strong>{totalOtHours} Jam Lembur</strong> dialokasikan pada <strong>{distinctOperators} personil</strong>, mempercepat kapasitas setara ~<strong>{daysCompressed} hari kerja</strong>.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center font-mono">
                        <div className="px-3 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-center shadow-2xs">
                          <span className="block text-[9px] uppercase font-sans font-bold text-stone-400">Total Jam</span>
                          <span className="text-sm font-black text-amber-600 dark:text-amber-400">+{totalOtHours}h</span>
                        </div>
                        <div className="px-3 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-center shadow-2xs">
                          <span className="block text-[9px] uppercase font-sans font-bold text-stone-400">Kompresi Hari</span>
                          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">-{daysCompressed}d</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Overtime Scheduling Form */}
                <div className="p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2.5">
                    <div>
                      <h5 className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                        <User className="w-4 h-4 text-emerald-600" />
                        Formulir Penjadwalan Lembur (Set Overtime)
                      </h5>
                      <p className="text-[11px] text-stone-500">
                        Pilih personil operator, durasi lembur, dan tanggal pelaksanaan berdasarkan analisa bottleneck.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleCreateOvertime} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      {/* 1. Siapa (Operator) */}
                      <div>
                        <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                          Siapa (Operator) *
                        </label>
                        <select
                          value={otManpowerId}
                          onChange={(e) => {
                            setOtManpowerId(e.target.value);
                            const found = (allManpower.length > 0 ? allManpower : manpowerAssignments).find(
                              (m: any) => m.id === e.target.value || m.manpower_id === e.target.value
                            );
                            if (found && (found.station_id || found.current_station_id)) {
                              setOtStationId(found.station_id || found.current_station_id);
                            }
                          }}
                          required
                          className="w-full h-9 px-2.5 border border-stone-300 dark:border-stone-700 rounded-xl bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-xs focus:ring-1 focus:ring-emerald-500 font-medium"
                        >
                          <option value="">-- Pilih Operator --</option>
                          {(() => {
                            // List available operators for overtime schedule
                            const list = allManpower.length > 0 ? allManpower : (manpowerAssignments || []);
                            return list.map((mp: any) => {
                              const id = mp.id || mp.manpower_id;
                              const name = mp.name || mp.operator_name || "Operator";
                              const role = mp.role || mp.skill_grade || "";
                              const stationInfo = mp.station_name ? `(${mp.station_name})` : "";
                              return (
                                <option key={id} value={id}>
                                  {name} {role ? `[${role}]` : ""} {stationInfo}
                                </option>
                              );
                            });
                          })()}
                        </select>
                      </div>

                      {/* 2. Kapan (Tanggal) */}
                      <div>
                        <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                          Kapan (Tanggal) *
                        </label>
                        <input
                          type="date"
                          value={otDate}
                          onChange={(e) => setOtDate(e.target.value)}
                          required
                          className="w-full h-9 px-2.5 border border-stone-300 dark:border-stone-700 rounded-xl bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-xs font-mono font-medium focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>

                      {/* 3. Berapa Lama (Durasi) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-stone-700 dark:text-stone-300">
                            Berapa Lama (Jam) *
                          </label>
                          <span className="text-[10px] text-stone-400 font-mono">1 - 8 Jam</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0.5}
                            max={8}
                            step={0.5}
                            value={otHours}
                            onChange={(e) => setOtHours(Number(e.target.value))}
                            required
                            className="w-20 h-9 px-2.5 border border-stone-300 dark:border-stone-700 rounded-xl bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-xs font-mono font-bold focus:ring-1 focus:ring-emerald-500"
                          />
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4].map((hrs) => (
                              <button
                                key={hrs}
                                type="button"
                                onClick={() => setOtHours(hrs)}
                                className={cn(
                                  "h-8 px-2 text-[10px] font-bold rounded-lg border transition-all cursor-pointer",
                                  otHours === hrs
                                    ? "bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100 border-amber-300 dark:border-amber-700"
                                    : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:bg-stone-200"
                                )}
                              >
                                {hrs}h
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* 4. Stasiun Fokus (Opsional) */}
                      <div>
                        <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                          Stasiun Penugasan (Opsional)
                        </label>
                        <select
                          value={otStationId}
                          onChange={(e) => setOtStationId(e.target.value)}
                          className="w-full h-9 px-2.5 border border-stone-300 dark:border-stone-700 rounded-xl bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-xs focus:ring-1 focus:ring-emerald-500 font-medium"
                        >
                          <option value="">-- Semua / Sesuai Stasiun --</option>
                          {allStations.map((st: any) => (
                            <option key={st.id} value={st.id}>
                              [{st.station_code}] {st.station_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Alasan & Submit */}
                    <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                      <div className="w-full sm:flex-1">
                        <input
                          type="text"
                          placeholder="Alasan lembur (misal: Kompresi bottleneck stasiun pemotongan / deadline SPK)..."
                          value={otReason}
                          onChange={(e) => setOtReason(e.target.value)}
                          className="w-full h-9 px-3 border border-stone-300 dark:border-stone-700 rounded-xl bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-xs focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={isSubmittingOt}
                        className="w-full sm:w-auto h-9 px-5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-2xs"
                      >
                        <Plus className="w-4 h-4 mr-1.5" />
                        {isSubmittingOt ? "Menyimpan..." : "Tambahkan Jadwal Lembur"}
                      </Button>
                    </div>
                  </form>
                </div>

                {/* Scheduled Overtime List Table */}
                <div className="border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden bg-white dark:bg-stone-900 shadow-2xs">
                  <div className="p-3 bg-stone-50 dark:bg-stone-800/60 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-stone-500" />
                      <span className="text-xs font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider">
                        Daftar Lembur Terjadwal ({overtimeList.length})
                      </span>
                    </div>
                    {isLoadingOvertime && (
                      <span className="text-[10px] text-stone-400 italic">Memuat jadwal...</span>
                    )}
                  </div>

                  {overtimeList.length === 0 ? (
                    <div className="p-6 text-center text-stone-400 text-xs">
                      <Clock className="w-6 h-6 mx-auto mb-2 opacity-40" />
                      Belum ada personil yang dijadwalkan lembur untuk project ini. Gunakan formulir di atas untuk menetapkan lembur.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-stone-100 dark:bg-stone-800/80 text-stone-500 font-mono text-[10px] uppercase border-b border-stone-200 dark:border-stone-700">
                          <tr>
                            <th className="p-3">Operator</th>
                            <th className="p-3">Tanggal</th>
                            <th className="p-3 text-center">Durasi</th>
                            <th className="p-3">Stasiun Penugasan</th>
                            <th className="p-3">Alasan / Catatan</th>
                            <th className="p-3 text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                          {overtimeList.map((ot: any) => (
                            <tr key={ot.id} className="hover:bg-stone-50/60 dark:hover:bg-stone-800/40 transition-colors">
                              <td className="p-3">
                                <div className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 text-stone-400" />
                                  <span>{ot.operator_name || "Operator"}</span>
                                </div>
                                {ot.operator_role && (
                                  <span className="text-[10px] text-stone-400 block font-mono pl-5">
                                    {ot.operator_role}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-stone-700 dark:text-stone-300">
                                {ot.date}
                              </td>
                              <td className="p-3 text-center">
                                <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[11px] bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  {ot.overtime_hours} Jam
                                </span>
                              </td>
                              <td className="p-3 font-mono text-stone-600 dark:text-stone-400 text-[11px]">
                                {ot.station_name ? (
                                  <span>{ot.station_code ? `[${ot.station_code}] ` : ""}{ot.station_name}</span>
                                ) : (
                                  <span className="italic text-stone-400">Semua Stasiun</span>
                                )}
                              </td>
                              <td className="p-3 text-stone-600 dark:text-stone-400 text-[11px]">
                                {ot.reason || "-"}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteOvertime(ot.id)}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                  title="Hapus jadwal lembur"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* FOOTER ACTIONS */}
          <div className="pt-3 flex flex-col sm:flex-row justify-between items-center gap-3 border-t border-stone-200 dark:border-stone-800">
            <div className="text-xs text-stone-500">
              Interactive simulator analyzing throughput, CPM networks, and bottlenecks without modifying active Master Data.
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {onApplyLotSize && (
                <Button
                  type="button"
                  onClick={handleApplyLotSize}
                  variant="secondary"
                  size="sm"
                  className="rounded-xl text-xs font-bold h-9 px-4 border-stone-300 dark:border-stone-700"
                >
                  Save Lot Size ({lotSize} pcs)
                </Button>
              )}

              {onConfirmSetMaster && (
                <Button
                  type="button"
                  onClick={onConfirmSetMaster}
                  disabled={isSettingMaster}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold h-9 px-5"
                >
                  {isSettingMaster ? "Confirming Master..." : "Lock & Confirm Master Plan"}
                </Button>
              )}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                className="rounded-xl text-xs font-bold h-9 px-5 border-stone-300 dark:border-stone-700"
              >
                Close
              </Button>
            </div>
          </div>

        </div>
      </div>
    </Modal>
  );
};
