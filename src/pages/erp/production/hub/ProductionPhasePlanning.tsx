import { generateWotBatchPdf } from "@/components/erp/BatchQrPdfRenderer";
import React, { useState, useEffect } from "react";
import { useProductionHubStore } from "@/stores/productionHubStore";
import { 
  Package, Printer, Play, Truck, CheckCircle2, 
  Clock, AlertTriangle, Gauge, Sliders, ArrowRight, Layers,
  User, Calendar, Plus, ShieldAlert, Wrench, RefreshCw, Cpu, Activity, QrCode,
  TrendingUp, BarChart3, AlertOctagon, HelpCircle, Edit3, X, Check
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { WotSizeOptimizerModal } from "@/components/erp/WotSizeOptimizerModal";
import { LotsLabelsModal } from "@/components/erp/LotsLabelsModal";
import { WotQrBatchPrintModal } from "@/components/erp/production/WotQrBatchPrintModal";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";

export function ProductionPhasePlanning({ actions, user }: { actions: any; user: any }) {
  const store = useProductionHubStore();
  const { showToast } = useToast();
  const [showOptimizerModal, setShowOptimizerModal] = useState(false);
  const [showBatchQrModal, setShowBatchQrModal] = useState(false);
  const [optimizerInitialTab, setOptimizerInitialTab] = useState<"SIMULATOR" | "CPM_MATRIX" | "OVERTIME_SCHEDULE">("SIMULATOR");
  const [overtimeList, setOvertimeList] = useState<any[]>([]);
  const [scheduleData, setScheduleData] = useState<any[]>([]);
  const [allScheduleData, setAllScheduleData] = useState<any[]>([]);
  const [planningSummary, setPlanningSummary] = useState<any>(null);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [machineLoadDetail, setMachineLoadDetail] = useState<any[]>([]);
  const [timelineDates, setTimelineDates] = useState<string[]>([]);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [ganttViewMode, setGanttViewMode] = useState<"PROCESS" | "MACHINE">("PROCESS");
  const [activeNdpsCount, setActiveNdpsCount] = useState(0);
  const [rescheduleRequired, setRescheduleRequired] = useState(false);
  const [isReallocating, setIsReallocating] = useState(false);
  const [timelineView, setTimelineView] = useState<"grid" | "bars">("grid");
  const [targetShiftHours, setTargetShiftHours] = useState(8);
  const [isCalculatingWot, setIsCalculatingWot] = useState(false);

  // Manual Reschedule Modal
  const [rescheduleModal, setRescheduleModal] = useState<{
    isOpen: boolean;
    task: any | null;
    selectedMachineId: string;
  }>({
    isOpen: false,
    task: null,
    selectedMachineId: ""
  });
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);

  const {
    handleGenerateLots = () => {},
    handleDispatchToFloor = () => {},
  } = actions || {};

  const {
    isGeneratingLots,
    showLotsLabelsModal, setShowLotsLabelsModal,
    customLotSize, setCustomLotSize,
    project,
    shortageAnalysis: rawShortages,
    lots: rawLots,
    wots: rawWots,
    stations: rawStations,
    cpmData,
    gapAnalysis,
    setShowProcurementDrawer,
    setCurrentPhase,
    setConfirmModal
  } = store;

  const lots = Array.isArray(rawLots) && rawLots.length > 0 ? rawLots : (Array.isArray(rawWots) ? rawWots : []);
  const stations = Array.isArray(rawStations) ? rawStations : [];
  const shortageAnalysis = Array.isArray(rawShortages) ? rawShortages : [];

  const activeGap = gapAnalysis || store.cpmAnalysis?.gapAnalysis || {
    estimatedTotalDays: Math.max(1, Math.ceil((Number(project?.qty) || 100) / (customLotSize || project?.lot_size || 50)) * 2),
    availableCalendarDays: 14,
    gapDays: 14 - Math.max(1, Math.ceil((Number(project?.qty) || 100) / (customLotSize || project?.lot_size || 50)) * 2),
    isDelayed: false
  };

  // Fetch active overtime schedules and RCPSP multi-project schedule
  const loadPlanningData = () => {
    if (!project?.id) return;

    apiFetch(`/api/production/projects/${project.id}/overtime`)
      .then((res) => setOvertimeList(res?.data || []))
      .catch(() => setOvertimeList([]));
      
    apiFetch(`/api/planning/schedule?project_id=${project.id}`)
      .then((res: any) => {
        setScheduleData(res?.schedule || []);
        setAllScheduleData(res?.all_schedule || []);
        setPlanningSummary(res?.summary || null);
        setRescheduleRequired(Boolean(res?.reschedule_required));
        setActiveNdpsCount(Number(res?.active_ndps_count) || 0);
      })
      .catch(() => setScheduleData([]));
      
    apiFetch(`/api/planning/calculate-load?project_id=${project.id}`)
      .then((res: any) => {
        setHeatmapData(res?.heatmap || []);
        setMachineLoadDetail(res?.machines || []);
        setTimelineDates(res?.timeline || []);
      })
      .catch(() => {
        setHeatmapData([]);
        setMachineLoadDetail([]);
      });
  };

  useEffect(() => {
    loadPlanningData();
  }, [project?.id, showOptimizerModal]);

  const handleReallocateNdp = async () => {
    setIsReallocating(true);
    try {
      const res: any = await apiFetch("/api/planning/apply-ndp-impact", {
        method: "POST",
        body: JSON.stringify({ auto_reallocate: true })
      });
      
      // Auto-refresh calculate load without cache after reallocation
      apiFetch(`/api/planning/calculate-load?project_id=${project?.id}&force_refresh=true`)
        .then((matrixRes: any) => {
          setHeatmapData(matrixRes?.heatmap || []);
          setMachineLoadDetail(matrixRes?.machines || []);
          setTimelineDates(matrixRes?.timeline || []);
        }).catch(() => {});
        
      showToast(res?.message || "Reallocated tasks to alternative machines!", "success");
      loadPlanningData();
    } catch (err: any) {
      showToast(err.message || "Failed to reallocate", "error");
    } finally {
      setIsReallocating(false);
    }
  };

  const handleAutoGenerateWots = async () => {
    if (!project?.id) return;
    setIsCalculatingWot(true);
    try {
      const res: any = await apiFetch("/api/planning/generate-wots", {
        method: "POST",
        body: JSON.stringify({
          project_id: project.id,
          target_shift_hours: targetShiftHours,
          custom_lot_size: customLotSize || undefined
        })
      });
      if (res?.lot_size) {
        setCustomLotSize(res.lot_size);
      }
      
      // Auto-refresh calculate load without cache after generation
      apiFetch(`/api/planning/calculate-load?project_id=${project.id}&force_refresh=true`)
        .then((matrixRes: any) => {
          setHeatmapData(matrixRes?.heatmap || []);
          setMachineLoadDetail(matrixRes?.machines || []);
          setTimelineDates(matrixRes?.timeline || []);
        }).catch(() => {});
        
      showToast(res?.message || "WOTs generated successfully!", "success");
      loadPlanningData();
      if (actions?.loadProjectData) {
        actions.loadProjectData(project.id);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to generate WOTs", "error");
    } finally {
      setIsCalculatingWot(false);
    }
  };

  const handleApplyReschedule = async () => {
    if (!rescheduleModal.task || !rescheduleModal.selectedMachineId) return;
    setIsSavingReschedule(true);
    try {
      const res: any = await apiFetch("/api/planning/reschedule", {
        method: "PATCH",
        body: JSON.stringify({
          project_id: project?.id,
          manual_adjustments: [{
            bop_id: rescheduleModal.task.id,
            new_machine_id: rescheduleModal.selectedMachineId
          }]
        })
      });
      if (res?.conflicts && res.conflicts.length > 0) {
        showToast(res.conflicts[0].message, "error");
      } else {
        // Auto-refresh calculate load without cache after reschedule
        apiFetch(`/api/planning/calculate-load?project_id=${project?.id}&force_refresh=true`)
          .then((matrixRes: any) => {
            setHeatmapData(matrixRes?.heatmap || []);
            setMachineLoadDetail(matrixRes?.machines || []);
            setTimelineDates(matrixRes?.timeline || []);
          }).catch(() => {});
          
        showToast(res?.message || "Schedule updated successfully!", "success");
        setRescheduleModal({ isOpen: false, task: null, selectedMachineId: "" });
        loadPlanningData();
      }
    } catch (err: any) {
      showToast(err.message || "Failed to reschedule", "error");
    } finally {
      setIsSavingReschedule(false);
    }
  };

  const totalOtHours = overtimeList.reduce((acc, ot) => acc + (Number(ot.overtime_hours) || 0), 0);
  const daysCompressed = (totalOtHours / 8).toFixed(1);
  
  const maxHoursPerWot = Math.max(...(store.cpmAnalysis?.nodes?.map((n: any) => n.hours) || [0]));
  const isWotTooLarge = maxHoursPerWot > 8;

  // Group Gantt by Machine for Swimlane mode
  const currentScheduleList = showAllProjects ? allScheduleData : scheduleData;
  const machineSwimlanes: Record<string, any[]> = {};
  currentScheduleList.forEach(task => {
    const mName = task.machine || "Manual Station";
    if (!machineSwimlanes[mName]) machineSwimlanes[mName] = [];
    machineSwimlanes[mName].push(task);
  });

  return (
    <div className="space-y-6">
      {/* Top Banner: Mathematical CPM & Gap Analysis */}
      {isWotTooLarge && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-3xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <div>
            <h4 className="text-xs font-black text-rose-900 dark:text-rose-200 uppercase tracking-wider">Warning: WOT Size Terlalu Besar!</h4>
            <p className="text-xs text-rose-700 dark:text-rose-300">
              Kapasitas bottleneck saat ini membutuhkan <span className="font-mono font-bold">{maxHoursPerWot.toFixed(1)} jam</span> per WOT. 
              Ini akan menyebabkan starvation (proses menganggur) di station berikutnya. Rekomendasi: Gunakan WOT Optimizer untuk memperkecil ukuran lot.
            </p>
          </div>
          <Button
            onClick={() => {
              setOptimizerInitialTab("SIMULATOR");
              setShowOptimizerModal(true);
            }}
            size="sm"
            className="ml-auto bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs shrink-0 font-bold"
          >
            Optimize WOT
          </Button>
        </div>
      )}

      {/* NDP Cross-Impact & Machine Breakdown Alert Banner */}
      {(rescheduleRequired || activeNdpsCount > 0) && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-3xl p-4.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-black text-amber-950 dark:text-amber-200 uppercase tracking-wider flex items-center gap-2">
                Active Machine Breakdown Downtime Detected
                <span className="px-2 py-0.5 bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-300 rounded-full text-[10px] font-mono font-bold">
                  {activeNdpsCount} Active NDP{activeNdpsCount > 1 ? 's' : ''}
                </span>
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                One or more fabrication machines are currently down under emergency NDP. Downstream schedules across projects have been pushed back to prevent starvation. Reallocate to secondary machines to clear the bottleneck.
              </p>
              {planningSummary?.critical_path_shift_msg && (
                <p className="text-[11px] font-mono font-bold text-amber-900 dark:text-amber-200 mt-1 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-md inline-block">
                  {planningSummary.critical_path_shift_msg}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={handleReallocateNdp}
              disabled={isReallocating}
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5"
            >
              <Wrench className="w-3.5 h-3.5" />
              {isReallocating ? "Reallocating..." : "Auto-Reallocate Alternative Machines"}
            </Button>
            <Button
              onClick={loadPlanningData}
              variant="secondary"
              size="sm"
              className="rounded-xl font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      )}

      {/* Section 7.4.4 Executive Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-blue-600" /> Fleet Utilization
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              {planningSummary?.average_machine_load || 0}% avg load
            </span>
          </div>
          <p className="text-2xl font-mono font-black text-stone-900 dark:text-stone-100 mt-1">
            {planningSummary?.utilized_machines || 0} / {planningSummary?.total_fleet_machines || machineLoadDetail.length || 1} <span className="text-xs font-sans text-stone-500">Machines</span>
          </p>
          <span className="text-[11px] text-stone-500 font-mono block mt-0.5">
            Active Multi-Project Footprint
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-emerald-600" /> Project Milestones
            </span>
            <span className="text-[10px] font-mono font-bold text-stone-600">
              {planningSummary?.total_active_projects || 1} Total
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 font-mono text-xs font-bold">
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
              {planningSummary?.projects_on_track || 0} On Track
            </span>
            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md">
              {planningSummary?.projects_at_risk || 0} At Risk
            </span>
            <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md">
              {planningSummary?.projects_delayed || 0} Delayed
            </span>
          </div>
          <span className="text-[11px] text-stone-500 font-mono block mt-1">
            Multi-Project Delivery Tracking
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-stone-600" /> Root-to-Finish Time
            </span>
            <span className="text-[10px] font-mono font-bold text-stone-500">
              Per Lot Cycle
            </span>
          </div>
          <p className="text-2xl font-mono font-black text-stone-900 dark:text-stone-100 mt-1">
            {planningSummary?.root_to_finish_avg_hours || "0.0"} <span className="text-xs font-sans text-stone-500">Hours</span>
          </p>
          <span className="text-[11px] text-stone-500 font-mono block mt-0.5">
            Effective Lead Time per WOT
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
              <AlertOctagon className="w-3.5 h-3.5 text-amber-600" /> Bottleneck Alert
            </span>
            <span className="text-[10px] font-bold text-amber-600">
              {planningSummary?.next_bottleneck ? "High Load" : "Balanced"}
            </span>
          </div>
          <p className="text-xs font-bold text-stone-800 dark:text-stone-200 mt-1 line-clamp-2">
            {planningSummary?.next_bottleneck?.message || "No extreme bottleneck predicted across 30-day timeline."}
          </p>
          <span className="text-[10px] text-stone-400 font-mono block mt-1">
            RCPSP Machine Projection
          </span>
        </div>
      </div>

      {/* Overtime Leadtime Compression Banner (Flow 2) */}
      <div className="p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300 dark:border-amber-800/80 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 rounded-2xl border border-amber-300 dark:border-amber-700">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-950 dark:text-amber-200">
                Penjadwalan Overtime & Kompresi Leadtime (Flow 2)
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100">
                {overtimeList.length} Jadwal
              </span>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-300 mt-0.5">
              {overtimeList.length > 0 ? (
                <>
                  Tercatat <strong>{totalOtHours} jam lembur</strong> aktif, mempercepat leadtime setara ~<strong>{daysCompressed} hari kerja</strong>.
                </>
              ) : (
                "Belum ada lembur terjadwal. Analisa Capacity & LOT Optimizer untuk menetapkan lembur guna mengejar deadline SPK."
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <Button
            onClick={() => {
              setOptimizerInitialTab("OVERTIME_SCHEDULE");
              setShowOptimizerModal(true);
            }}
            size="sm"
            className="h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Atur Lembur Operator
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lot / WOT Generation Card with Shift Calculation Engine (Section 7.3.1) */}
        <div className="bg-white dark:bg-stone-900 rounded-3xl p-6 border border-stone-200 dark:border-stone-800 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 rounded-xl">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-stone-900 dark:text-stone-100">WOT Lot Sizing Engine</h3>
              <p className="text-xs text-stone-500">Shift-based mathematical ticket optimization</p>
            </div>
          </div>

          <div className="p-4 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-2xl space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 dark:text-stone-300 mb-1">
                  Target Shift (Hours)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={targetShiftHours}
                  onChange={(e) => setTargetShiftHours(Number(e.target.value))}
                  className="text-xs font-mono font-bold bg-white dark:bg-stone-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-700 dark:text-stone-300 mb-1">
                  Lot Size (pcs/WOT)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={project?.qty || 10000}
                  value={customLotSize || 50}
                  onChange={(e) => setCustomLotSize(Number(e.target.value))}
                  disabled={lots.length > 0}
                  className="text-xs font-mono font-bold bg-white dark:bg-stone-900 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl text-[11px] text-blue-900 dark:text-blue-200 space-y-1">
              <div className="font-bold flex items-center justify-between">
                <span>Optimal Formula:</span>
                <span className="font-mono">(Shift × 60) / Bottleneck CT</span>
              </div>
              <p className="text-[10px] text-blue-700 dark:text-blue-300">
                Matches station rhythm to eliminate idle starvation across upstream & downstream handovers.
              </p>
            </div>

            <Button
              onClick={handleAutoGenerateWots}
              disabled={isCalculatingWot || lots.length > 0}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs h-9 rounded-xl disabled:bg-stone-200 disabled:text-stone-400"
            >
              {isCalculatingWot ? "Calculating & Generating..." : lots.length > 0 ? "WOTs Generated" : `Generate Optimized WOTs (${Math.ceil((project?.qty || 1) / (customLotSize || 50))} Lots)`}
            </Button>
          </div>

          {lots.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-stone-700 dark:text-stone-300">
                <span>Generated WOTs ({lots.length})</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowBatchQrModal(true)}
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-black text-[11px]"
                  >
                    <QrCode className="w-3.5 h-3.5" /> 5×5cm Batch QR
                  </button>
                  <button
                    onClick={() => setShowLotsLabelsModal(true)}
                    className="text-stone-700 dark:text-stone-300 hover:underline flex items-center gap-1 font-black text-[11px]"
                  >
                    <Printer className="w-3.5 h-3.5" /> Travel Tags
                  </button>
                  <button
                    onClick={async () => {
                      const wotIds = lots.map(l => l.id);
                      if (wotIds.length > 0) {
                        const { generateWotBatchPdf } = await import("@/components/erp/BatchQrPdfRenderer");
                        await generateWotBatchPdf(lots.map(l => ({ ...l, project_name: project.name })));
                      }
                    }}
                    className="text-stone-700 dark:text-stone-300 hover:underline flex items-center gap-1 font-black text-[11px]"
                  >
                    <Printer className="w-3.5 h-3.5 text-blue-500" /> PDF A4
                  </button>
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {lots.map((l: any) => (
                  <div key={l.id} className="p-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-stone-900 dark:text-stone-100">{l.lot_number}</span>
                    <span className="text-stone-500">{l.target_qty || l.qty} {project?.uom || "pcs"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* WOT Dispatch & Station Routing Pipeline */}
        <div className="lg:col-span-2 bg-white dark:bg-stone-900 rounded-3xl p-6 border border-stone-200 dark:border-stone-800 shadow-xs space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-stone-900 dark:text-stone-100">WOT Dispatch & Station Routing Pipeline</h3>
                <p className="text-xs text-stone-500">Continuous pull-based execution — floor processes available WIP & incoming material waves</p>
              </div>
              
              <Button
                onClick={() => setShowProcurementDrawer(true)}
                variant="secondary"
                size="sm"
                className="h-8 text-xs font-bold border-stone-300"
              >
                <Layers className="w-3.5 h-3.5 mr-1.5 text-stone-700" /> Procurement Waves Window
              </Button>
            </div>

            {/* Operational Principle Banner */}
            <div className="p-3.5 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-2xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black text-stone-900 dark:text-stone-100">
                  Continuous WIP Flow Active (Zero Material Gating)
                </h4>
                <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                  Production floor operates on continuous piece/lot flow. Stations process available WIP and incoming material without waiting for full BOM arrival. Materials are supplied in partial waves by warehouse terminal operations.
                </p>
              </div>
            </div>

            {/* Metric Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">Total Scope</span>
                <p className="text-sm font-black text-stone-900 dark:text-stone-100 font-mono">
                  {project?.qty || 0} <span className="text-xs font-sans font-bold text-stone-500">{project?.uom || "pcs"}</span>
                </p>
              </div>

              <div className="p-3 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">Batch Lot Size</span>
                <p className="text-sm font-black text-stone-900 dark:text-stone-100 font-mono">
                  {customLotSize || 50} <span className="text-xs font-sans font-bold text-stone-500">{project?.uom || "pcs"}/lot</span>
                </p>
              </div>

              <div className="p-3 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">Planned WOTs</span>
                <p className="text-sm font-black text-emerald-700 dark:text-emerald-400 font-mono">
                  {lots.length} <span className="text-xs font-sans font-bold text-stone-500">Tickets</span>
                </p>
              </div>

              <div className="p-3 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">Station Stages</span>
                <p className="text-sm font-black text-stone-900 dark:text-stone-100 font-mono">
                  {stations.length || 3} <span className="text-xs font-sans font-bold text-stone-500">Sequential</span>
                </p>
              </div>
            </div>

            {/* Station Route Preview */}
            <div className="space-y-2">
              <span className="text-[11px] font-black uppercase font-mono tracking-wider text-stone-500">
                Sequential Station Routing
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {stations.length === 0 ? (
                  <div className="p-3 bg-stone-50 dark:bg-stone-950 rounded-xl border border-stone-200 dark:border-stone-800 text-xs text-stone-500 w-full text-center">
                    Default sequence: Station #1 (Preparation) → Station #2 (Processing) → Station #3 (Inspection & Packing)
                  </div>
                ) : (
                  stations.map((st: any, idx: number) => (
                    <React.Fragment key={st.id || idx}>
                      <div className="px-3 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl flex items-center gap-2 text-xs">
                        <span className="w-5 h-5 rounded-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-mono font-bold text-[10px] flex items-center justify-center">
                          #{st.station_sequence || idx + 1}
                        </span>
                        <div>
                          <span className="font-bold text-stone-900 dark:text-stone-100 block text-xs">
                            {st.station_name || st.name || `Station ${idx + 1}`}
                          </span>
                          <span className="text-[10px] text-stone-500 font-mono">{st.station_code || `ST-0${idx + 1}`}</span>
                        </div>
                      </div>
                      {idx < stations.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-stone-400 shrink-0" />
                      )}
                    </React.Fragment>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
            <Button
              onClick={() => setShowOptimizerModal(true)}
              variant="secondary"
              className="text-xs font-bold h-10 px-4 rounded-xl"
            >
              <Sliders className="w-4 h-4 mr-1.5 text-stone-700 dark:text-stone-300" /> Capacity & Lot Optimizer
            </Button>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => setCurrentPhase('LOGGER')}
                disabled={lots.length === 0}
                className="bg-stone-900 hover:bg-stone-800 text-white font-black text-xs h-10 px-6 rounded-xl disabled:bg-stone-200 disabled:text-stone-400"
              >
                <Play className="w-4 h-4 mr-2 fill-current" /> Release to Production Logger
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 30-Day Machine Load Heatmap (Section 7.4.2) */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-black text-stone-900 dark:text-stone-100">
              30-Day Machine Load Heatmap Matrix
            </h3>
            <span className="text-[10px] font-mono text-stone-500 font-bold ml-2">
              (Green: &lt;75% • Amber: 75-100% • Red: &gt;100% • Dark Red: NDP Down)
            </span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={() => setTimelineView("grid")}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                timelineView === "grid" ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700"
              }`}
            >
              30-Day Grid
            </button>
            <button
              type="button"
              onClick={() => setTimelineView("bars")}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                timelineView === "bars" ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700"
              }`}
            >
              Bar List
            </button>
          </div>
        </div>

        <div className="p-4 overflow-x-auto">
          {timelineView === "grid" ? (
            <div className="min-w-[700px] space-y-2">
              {/* Date Header Columns */}
              <div className="flex items-center text-[10px] font-mono font-bold text-stone-500 border-b border-stone-200 dark:border-stone-800 pb-2">
                <div className="w-44 shrink-0 truncate">Machine Name / Code</div>
                <div className="w-16 shrink-0 text-center">Avg Load</div>
                <div className="flex-1 grid grid-cols-15 sm:grid-cols-30 gap-1 text-center">
                  {timelineDates.slice(0, 20).map((d, dIdx) => (
                    <div key={dIdx} className="truncate text-[9px]" title={d}>
                      {d.slice(8, 10)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Machine Rows */}
              {machineLoadDetail.map((m, mIdx) => {
                const isDown = m.is_down || m.status === 'BLOCKED_NDP';
                return (
                  <div key={mIdx} className="flex items-center text-xs py-1.5 border-b border-stone-100 dark:border-stone-800/50 hover:bg-stone-50/80 dark:hover:bg-stone-800/30 transition-colors">
                    <div className="w-44 shrink-0 flex items-center gap-1.5 truncate pr-2">
                      <Cpu className={`w-3.5 h-3.5 shrink-0 ${isDown ? 'text-rose-500 animate-pulse' : 'text-stone-400'}`} />
                      <div className="truncate">
                        <span className="font-bold text-stone-800 dark:text-stone-200 block truncate" title={m.machine}>
                          {m.machine}
                        </span>
                        <span className="text-[9px] font-mono text-stone-400">{m.machine_code} • {m.capacity_per_hour || 10}/h</span>
                      </div>
                    </div>

                    <div className="w-16 shrink-0 text-center font-mono font-bold text-[11px]">
                      <span className={m.load_percent > 100 ? "text-rose-600 font-black" : (m.load_percent >= 75 ? "text-amber-600" : "text-emerald-600")}>
                        {m.load_percent}%
                      </span>
                    </div>

                    <div className="flex-1 grid grid-cols-15 sm:grid-cols-30 gap-1">
                      {(m.daily_loads || []).slice(0, 20).map((dl: any, dlIdx: number) => {
                        let cellBg = "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800";
                        if (dl.status === 'BLOCKED_NDP') {
                          cellBg = "bg-rose-900 text-white font-black animate-pulse";
                        } else if (dl.status === 'OVERLOADED') {
                          cellBg = "bg-rose-500 text-white font-bold";
                        } else if (dl.status === 'OPTIMAL') {
                          cellBg = "bg-amber-300 dark:bg-amber-900 text-amber-950 dark:text-amber-200";
                        } else if (dl.hours === 0) {
                          cellBg = "bg-stone-100 dark:bg-stone-800 text-stone-400";
                        }

                        return (
                          <div
                            key={dlIdx}
                            className={`h-7 rounded flex items-center justify-center text-[9px] font-mono cursor-pointer transition-transform hover:scale-110 shadow-2xs ${cellBg}`}
                            title={`${m.machine} on ${dl.date}: ${dl.hours}h load (${dl.load_percent}%) - Status: ${dl.status}`}
                          >
                            {dl.status === 'BLOCKED_NDP' ? 'NDP' : (dl.hours > 0 ? `${dl.hours.toFixed(0)}h` : '-')}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="min-w-[400px] space-y-3">
              {heatmapData.map((hm, i) => {
                const detail = machineLoadDetail.find(m => m.machine_id === hm.machine_id || m.machine_code === hm.machine_code);
                const isDown = hm.is_down || hm.status === 'BLOCKED_NDP';
                const isOverloaded = hm.loadPercent > 100 || hm.status === 'OVERLOADED';
                const isOptimal = hm.loadPercent >= 75 && !isOverloaded && !isDown;

                return (
                  <div key={i} className="p-2.5 rounded-2xl bg-stone-50/70 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-800 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 truncate max-w-[70%]">
                        <Cpu className={`w-3.5 h-3.5 shrink-0 ${isDown ? 'text-rose-500 animate-pulse' : 'text-stone-500'}`} />
                        <span className="font-bold text-stone-800 dark:text-stone-200 truncate" title={hm.machine}>
                          {hm.machine}
                        </span>
                        {hm.machine_code && (
                          <span className="text-[10px] font-mono text-stone-400">({hm.machine_code})</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isDown ? (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded-md text-[10px] font-bold flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-rose-600" /> DOWN (NDP)
                          </span>
                        ) : isOverloaded ? (
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md text-[10px] font-bold">
                            OVERLOADED ({hm.loadPercent}%)
                          </span>
                        ) : isOptimal ? (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[10px] font-bold">
                            OPTIMAL ({hm.loadPercent}%)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold">
                            NORMAL ({hm.loadPercent}%)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-stone-200/80 dark:bg-stone-700 rounded-full h-2.5 overflow-hidden relative">
                        <div 
                          className={`absolute top-0 left-0 h-full rounded-full transition-all ${
                            isDown ? 'bg-rose-600 animate-pulse' : (isOverloaded ? 'bg-rose-500' : (isOptimal ? 'bg-amber-400' : 'bg-emerald-500'))
                          }`}
                          style={{ width: `${Math.min(100, Math.max(5, hm.loadPercent))}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-mono font-bold text-[11px] text-stone-600 dark:text-stone-300">
                        {hm.loadPercent}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Resource-Constrained Multi-Project Gantt Chart (Section 7.4.1) */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-black text-stone-900 dark:text-stone-100">
              Multi-Project Resource-Constrained Gantt Schedule (RCPSP)
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-stone-200/70 dark:bg-stone-800 p-0.5 rounded-xl text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setGanttViewMode("PROCESS")}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  ganttViewMode === "PROCESS" ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs" : "text-stone-600 dark:text-stone-400"
                }`}
              >
                By Process
              </button>
              <button
                type="button"
                onClick={() => setGanttViewMode("MACHINE")}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  ganttViewMode === "MACHINE" ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs" : "text-stone-600 dark:text-stone-400"
                }`}
              >
                Machine Swimlanes
              </button>
            </div>

            <div className="flex items-center bg-stone-200/70 dark:bg-stone-800 p-0.5 rounded-xl text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setShowAllProjects(false)}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  !showAllProjects ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs" : "text-stone-600 dark:text-stone-400"
                }`}
              >
                Current Project
              </button>
              <button
                type="button"
                onClick={() => setShowAllProjects(true)}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  showAllProjects ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs" : "text-stone-600 dark:text-stone-400"
                }`}
              >
                Fleet Multi-Project ({allScheduleData.length})
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 overflow-x-auto">
          {ganttViewMode === "MACHINE" ? (
            <div className="min-w-[600px] space-y-4">
              {Object.keys(machineSwimlanes).map((mName, mIdx) => (
                <div key={mIdx} className="p-3 bg-stone-50/70 dark:bg-stone-800/40 rounded-2xl border border-stone-200/60 dark:border-stone-800 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-stone-800 dark:text-stone-200">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-blue-600" />
                      <span>{mName}</span>
                    </div>
                    <span className="text-[10px] font-mono text-stone-500">
                      {machineSwimlanes[mName].length} Assigned Tasks
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {machineSwimlanes[mName].map((task, tIdx) => (
                      <div key={tIdx} className="flex items-center gap-3 p-2 bg-white dark:bg-stone-900 rounded-xl border border-stone-200/60 dark:border-stone-800 text-xs">
                        <div className="w-48 truncate font-bold text-stone-800 dark:text-stone-200" title={task.name}>
                          {task.name}
                        </div>
                        <div className="flex-1 relative h-6 bg-stone-100 dark:bg-stone-800 rounded-lg overflow-hidden flex items-center px-2">
                          <div 
                            className="absolute top-1 bottom-1 bg-blue-500/30 border border-blue-500 rounded px-1.5 flex items-center text-[9px] font-mono font-bold text-blue-900 dark:text-blue-100 truncate"
                            style={{ left: `${Math.min(70, tIdx * 12)}%`, width: `${Math.min(80, Math.max(15, task.durationHours * 3))}%` }}
                          >
                            {task.durationHours}h
                          </div>
                        </div>
                        <button
                          onClick={() => setRescheduleModal({ isOpen: true, task, selectedMachineId: task.machine_id || "" })}
                          className="p-1 hover:bg-stone-100 dark:hover:bg-stone-800 rounded text-stone-500 hover:text-stone-900 transition-colors"
                          title="Reschedule / Reassign Machine"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="min-w-[550px] space-y-2">
              {currentScheduleList.length === 0 ? (
                <div className="text-xs text-stone-500 text-center py-6">No scheduled operations available.</div>
              ) : currentScheduleList.map((g, i) => {
                const isBlocked = Boolean(g.is_machine_down);
                const isCritical = Boolean(g.is_critical);

                return (
                  <div key={i} className="p-2.5 rounded-2xl bg-stone-50/60 dark:bg-stone-800/30 border border-stone-200/50 dark:border-stone-800 flex items-center gap-3 text-xs group hover:bg-stone-100/80 transition-colors">
                    <div className="w-52 shrink-0 space-y-0.5">
                      <div className="font-bold text-stone-800 dark:text-stone-200 truncate" title={g.name}>
                        {g.name}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-stone-500 font-mono truncate">
                          {g.machine || "Manual"}
                        </span>
                        {isCritical && (
                          <span className="px-1 py-0.2 bg-rose-600 text-white rounded text-[8px] font-black uppercase tracking-wider">
                            CRITICAL
                          </span>
                        )}
                        {isBlocked && (
                          <span className="px-1 py-0.2 bg-rose-100 text-rose-800 border border-rose-300 rounded text-[8px] font-black uppercase tracking-wider flex items-center gap-0.5">
                            <ShieldAlert className="w-2.5 h-2.5" /> NDP
                          </span>
                        )}
                        {g.bypass_multi_station && (
                          <span 
                            title="This machine has Bypass Multi-Station enabled. It can be concurrently assigned to multiple stations, breaking hard constraint planning."
                            className="px-1 py-0.2 bg-purple-100 text-purple-800 border border-purple-300 rounded text-[8px] font-black uppercase tracking-wider flex items-center gap-0.5 cursor-help"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" /> BYPASS AUDIT
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 relative h-7 bg-stone-100 dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 rounded-lg overflow-hidden flex items-center px-2">
                      <div 
                        className={`absolute top-1 bottom-1 rounded min-w-[28px] transition-all flex items-center px-1.5 overflow-hidden ${
                          isBlocked 
                            ? 'bg-rose-500/30 border border-rose-500 text-rose-900' 
                            : isCritical 
                              ? 'bg-amber-500/25 border border-amber-500 text-amber-900' 
                              : 'bg-blue-500/25 border border-blue-500 text-blue-900'
                        }`}
                        style={{ 
                          left: `${Math.min(70, i * 6)}%`,
                          width: `${Math.min(95, Math.max(15, (Number(g.durationHours) || 2) * 3))}%`
                        }}
                        title={`Earliest Start: ${g.startDate?.slice(0, 10) || 'Now'} → Finish: ${g.endDate?.slice(0, 10) || 'TBD'} (${g.durationHours} hrs)`}
                      >
                        <span className="text-[9px] font-mono font-bold truncate opacity-90">
                          {g.durationHours}h • {g.startDate ? new Date(g.startDate).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }) : ''}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => setRescheduleModal({ isOpen: true, task: g, selectedMachineId: g.machine_id || "" })}
                      className="p-1.5 hover:bg-white dark:hover:bg-stone-700 rounded-lg text-stone-400 hover:text-stone-900 dark:hover:text-white transition-colors shrink-0"
                      title="Adjust / Reschedule Assignment"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Manual Reschedule & Machine Reassignment Modal (Section 13.5) */}
      <Modal
        isOpen={rescheduleModal.isOpen && Boolean(rescheduleModal.task)}
        onClose={() => setRescheduleModal({ isOpen: false, task: null, selectedMachineId: "" })}
        maxWidth="md"
        contentClassName="p-6 space-y-4"
        title={
          <div className="flex items-center gap-2 text-base font-black text-stone-900 dark:text-stone-100">
            <Edit3 className="w-4 h-4 text-blue-600" /> Manual Schedule Reallocation
          </div>
        }
      >
        {rescheduleModal.task && (
          <div className="space-y-4">
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-stone-50 dark:bg-stone-950 rounded-2xl border border-stone-200 dark:border-stone-800 space-y-1">
                <div className="font-bold text-stone-900 dark:text-stone-100">{rescheduleModal.task.name}</div>
                <div className="text-stone-500 font-mono">Current Machine: {rescheduleModal.task.machine}</div>
                <div className="text-stone-500 font-mono">Estimated Duration: {rescheduleModal.task.durationHours} hours</div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  Assign Alternative Fleet Machine
                </label>
                <select
                  value={rescheduleModal.selectedMachineId}
                  onChange={(e) => setRescheduleModal(prev => ({ ...prev, selectedMachineId: e.target.value }))}
                  className="w-full px-3 py-2 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl text-xs font-bold text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select Target Machine --</option>
                  {machineLoadDetail.map((m) => (
                    <option key={m.machine_id} value={m.machine_id} disabled={m.is_down}>
                      {m.machine} ({m.machine_code}) {m.is_down ? "- [DOWN UNDER NDP]" : `- ${m.load_percent}% load`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRescheduleModal({ isOpen: false, task: null, selectedMachineId: "" })}
                className="rounded-xl font-bold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApplyReschedule}
                disabled={isSavingReschedule || !rescheduleModal.selectedMachineId}
                className="bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold"
              >
                {isSavingReschedule ? "Applying..." : "Apply Reschedule"}
              </Button>
            </div>
          </div>
        )}
      </Modal>


      {/* Unified Production Capacity & Lot Optimizer Modal */}
      {showOptimizerModal && (
        <WotSizeOptimizerModal
          isOpen={showOptimizerModal}
          onClose={() => setShowOptimizerModal(false)}
          projectId={project?.id}
          project={project}
          currentLotSize={customLotSize || 50}
          initialTab={optimizerInitialTab}
          onApplyLotSize={(newSize) => setCustomLotSize(newSize)}
        />
      )}
      
      {/* WOT Travel Tags Generator Modal */}
      {showLotsLabelsModal && (
        <LotsLabelsModal
          isOpen={showLotsLabelsModal}
          onClose={() => setShowLotsLabelsModal(false)}
          lots={lots}
          project={project}
        />
      )}

      {/* 5x5cm Cryptographic WOT QR Batch Printer */}
      {showBatchQrModal && (
        <WotQrBatchPrintModal
          isOpen={showBatchQrModal}
          onClose={() => setShowBatchQrModal(false)}
          projectId={project?.id}
          projectName={project?.name}
          spkNumber={project?.spk_number || project?.project_code || "SPK"}
        />
      )}
    </div>
  );
}

