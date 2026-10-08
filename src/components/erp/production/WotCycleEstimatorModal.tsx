import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { 
  Clock, Cpu, Users, Layers, Play, Pause, AlertTriangle, 
  ArrowRight, ShieldCheck, RefreshCw, Zap, CheckCircle2, ChevronRight 
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { WotProjectCycleEstimation, WotStationCycleEstimation } from "@/utils/wotCycleEngine";
import { cn } from "@/lib/utils";

interface WotCycleEstimatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  wotQty?: number;
  onRefreshProject?: () => void;
}

export function WotCycleEstimatorModal({
  isOpen,
  onClose,
  projectId,
  projectName = "Production Project",
  wotQty = 10,
  onRefreshProject,
}: WotCycleEstimatorModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [estimation, setEstimation] = useState<WotProjectCycleEstimation | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [balancingResult, setBalancingResult] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchEstimation = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/api/production/projects/${projectId}/wot-cycle-estimation?wot_qty=${wotQty}`);
      if (res.ok && res.estimation) {
        setEstimation(res.estimation);
        if (res.estimation.stationEstimations?.length > 0 && !selectedStationId) {
          setSelectedStationId(res.estimation.stationEstimations[0].stationId);
        }
      } else {
        showToast(res.error || "Failed to calculate WOT cycle estimation", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error calculating WOT cycle estimation", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchEstimation();
      setBalancingResult(null);
    }
  }, [isOpen, projectId, wotQty]);

  const handleStartStation = async (stationId: string) => {
    setActionLoading(`start_${stationId}`);
    try {
      const res: any = await apiFetch(`/api/production/stations/${stationId}/start-production`, {
        method: "POST",
      });
      if (res.ok || res.success) {
        showToast(res.message || "Station production started successfully", "success");
        if (onRefreshProject) onRefreshProject();
        fetchEstimation();
      } else {
        showToast(res.error || "Failed to start station", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error starting station", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePauseStation = async (stationId: string) => {
    setActionLoading(`pause_${stationId}`);
    try {
      const res: any = await apiFetch(`/api/production/stations/${stationId}/pause`, {
        method: "POST",
        body: JSON.stringify({ reason: "Manual floor pause" }),
      });
      if (res.ok || res.success) {
        showToast(res.message || "Station execution paused", "info");
        if (onRefreshProject) onRefreshProject();
        fetchEstimation();
      } else {
        showToast(res.error || "Failed to pause station", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error pausing station", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResumeStation = async (stationId: string) => {
    setActionLoading(`resume_${stationId}`);
    try {
      const res: any = await apiFetch(`/api/production/stations/${stationId}/resume`, {
        method: "POST",
      });
      if (res.ok || res.success) {
        showToast(res.message || "Station execution resumed", "success");
        if (onRefreshProject) onRefreshProject();
        fetchEstimation();
      } else {
        showToast(res.error || "Failed to resume station", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error resuming station", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRebalanceManpower = async (stationId: string) => {
    setActionLoading(`balance_${stationId}`);
    try {
      const res: any = await apiFetch(`/api/production/stations/${stationId}/rebalance-manpower`, {
        method: "POST",
      });
      if (res.ok && res.result) {
        setBalancingResult(res.result);
        showToast(res.result.message || "Manpower automatically rebalanced!", "success");
      } else {
        showToast(res.error || "Failed to rebalance manpower", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error rebalancing manpower", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const activeStation = estimation?.stationEstimations?.find(
    (s) => s.stationId === selectedStationId
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-stone-900 text-white">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-stone-900">
              WOT Cycle Estimator & Station Flow
            </h3>
            <p className="text-xs text-stone-500 font-medium">
              Deterministic Critical Path & Station-Scoped Manpower Balancing for 1 WOT ({wotQty} Units)
            </p>
          </div>
        </div>
      }
      maxWidth="5xl"
      contentClassName="p-6 space-y-6 max-h-[85vh] overflow-y-auto"
    >
      {loading ? (
        <div className="py-20 text-center text-stone-400 font-medium">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-stone-600" />
          Calculating Root-to-Finish Mathematical Cycle Estimation...
        </div>
      ) : estimation ? (
        <div className="space-y-6">
          {/* Top KPI Banner */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
                Root-to-Finish Cycle
              </span>
              <div className="text-2xl font-black text-stone-900 font-mono">
                {estimation.rootToFinishCycleHours}{" "}
                <span className="text-xs font-semibold text-stone-500">hours</span>
              </div>
              <span className="text-[10px] text-stone-500 mt-1 block">
                {estimation.rootToFinishCycleMinutes} mins (1 WOT = {estimation.wotQty} pcs)
              </span>
            </div>

            <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
                Est. Calendar Working Days
              </span>
              <div className="text-2xl font-black text-blue-700 font-mono">
                {estimation.rootToFinishWorkingDays}{" "}
                <span className="text-xs font-semibold text-stone-500">days/WOT</span>
              </div>
              <span className="text-[10px] text-stone-500 mt-1 block">
                Standard 8 hrs shift mode
              </span>
            </div>

            <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
                Factory Performance Factor
              </span>
              <div className="text-2xl font-black text-emerald-700 font-mono">
                {estimation.factoryFactor}%
              </div>
              <span className="text-[10px] text-stone-500 mt-1 block">
                OEE & shopfloor baseline
              </span>
            </div>

            <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
                Total Stations
              </span>
              <div className="text-2xl font-black text-stone-900 font-mono">
                {estimation.stationEstimations?.length || 0}
              </div>
              <span className="text-[10px] text-stone-500 mt-1 block">
                Sequential routing stages
              </span>
            </div>
          </div>

          {/* Station Selection Tabs */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-stone-900 uppercase tracking-widest flex items-center gap-2">
                <Layers className="w-4 h-4 text-stone-600" /> Station Cycle Breakdown
              </h4>
              <span className="text-xs text-stone-400 font-medium">
                Click a station to view internal processes and manpower balance
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {estimation.stationEstimations?.map((s) => {
                const isSelected = selectedStationId === s.stationId;
                const isBottleneck = estimation.projectBottleneckStationId === s.stationId;

                return (
                  <button
                    key={s.stationId}
                    type="button"
                    onClick={() => {
                      setSelectedStationId(s.stationId);
                      setBalancingResult(null);
                    }}
                    className={cn(
                      "p-4 rounded-2xl border text-left transition-all relative overflow-hidden",
                      isSelected
                        ? "bg-stone-900 text-white border-stone-900 shadow-md ring-2 ring-stone-900/10"
                        : "bg-white text-stone-800 border-stone-200 hover:border-stone-300 hover:bg-stone-50/50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md",
                        isSelected ? "bg-white/10 text-stone-200" : "bg-stone-100 text-stone-700"
                      )}>
                        Seq #{s.stationSequence}
                      </span>
                      {isBottleneck && (
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-rose-500 text-white">
                          Pacing Bottleneck
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-sm tracking-tight mb-1 truncate">
                      {s.stationName}
                    </div>
                    <div className="flex items-baseline gap-1 font-mono text-base font-bold">
                      <span>{s.cycleDurationMinutes}</span>
                      <span className={cn(
                        "text-[10px] font-semibold uppercase",
                        isSelected ? "text-stone-300" : "text-stone-400"
                      )}>
                        mins/WOT ({s.cycleDurationHours}h)
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Station Deep Dive */}
          {activeStation && (
            <div className="p-6 bg-stone-50/80 border border-stone-200 rounded-2xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded bg-stone-200 text-stone-800 text-[10px] font-bold font-mono">
                      Station #{activeStation.stationSequence}
                    </span>
                    <h4 className="text-base font-bold text-stone-900">
                      {activeStation.stationName}
                    </h4>
                  </div>
                  <p className="text-xs text-stone-500 font-medium">
                    1 WOT Duration: <strong className="text-stone-800 font-mono">{activeStation.cycleDurationMinutes} mins</strong> | Pacing Task: <strong className="text-stone-800">{activeStation.pacingBottleneckStep}</strong>
                  </p>
                </div>

                {/* Station Controls (Start, Pause, Resume, Rebalance) */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={actionLoading !== null}
                    isLoading={actionLoading === `start_${activeStation.stationId}`}
                    onClick={() => handleStartStation(activeStation.stationId)}
                    className="text-xs font-bold"
                  >
                    <Play className="w-3.5 h-3.5" /> Start Station
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={actionLoading !== null}
                    isLoading={actionLoading === `pause_${activeStation.stationId}`}
                    onClick={() => handlePauseStation(activeStation.stationId)}
                    className="text-xs font-bold"
                  >
                    <Pause className="w-3.5 h-3.5 text-amber-600" /> Pause
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={actionLoading !== null}
                    isLoading={actionLoading === `resume_${activeStation.stationId}`}
                    onClick={() => handleResumeStation(activeStation.stationId)}
                    className="text-xs font-bold"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-600" /> Continue
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={actionLoading !== null}
                    isLoading={actionLoading === `balance_${activeStation.stationId}`}
                    onClick={() => handleRebalanceManpower(activeStation.stationId)}
                    className="text-xs font-bold bg-white"
                  >
                    <Zap className="w-3.5 h-3.5 text-indigo-600" /> Auto-Balance Manpower
                  </Button>
                </div>
              </div>

              {/* Station Process List */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                  Station Processes & Cycle Math
                </h5>

                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[9px]">
                        <th className="p-3">Process Name</th>
                        <th className="p-3 text-right">Unit Cycle Time</th>
                        <th className="p-3 text-center">Allocated Manpower</th>
                        <th className="p-3 text-right">1 WOT Duration</th>
                        <th className="p-3 text-center">Critical Path</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {activeStation.processes?.map((proc) => (
                        <tr key={proc.id} className="hover:bg-stone-50/60 transition-colors">
                          <td className="p-3 font-bold text-stone-900">
                            {proc.name}
                          </td>
                          <td className="p-3 text-right font-mono font-medium text-stone-700">
                            {proc.cycleTimePerUnitMins} mins/unit
                          </td>
                          <td className="p-3 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 text-stone-800 text-[10px] font-bold">
                              <Users className="w-3 h-3 text-stone-500" />
                              {proc.manpowerAllocated} Operator
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-stone-900">
                            {proc.wotDurationMins} mins
                          </td>
                          <td className="p-3 text-center">
                            {proc.isCriticalPath ? (
                              <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[9px] uppercase border border-rose-200">
                                Critical
                              </span>
                            ) : (
                              <span className="text-stone-400 font-medium text-[10px]">
                                Non-Critical
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Station Manpower Rebalancing Status */}
              {balancingResult && (
                <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-indigo-600" />
                      Station Manpower Auto-Balance Result
                    </span>
                    <Badge variant="purple" size="sm">
                      {balancingResult.handoverTriggered ? "Dynamic Handover Active" : "Steady Balance"}
                    </Badge>
                  </div>
                  <p className="text-xs text-indigo-900 font-medium">
                    {balancingResult.message}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                    {balancingResult.allocations?.map((alloc: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 bg-white border border-indigo-100 rounded-xl flex items-start justify-between gap-2 shadow-2xs"
                      >
                        <div>
                          <div className="text-xs font-bold text-stone-900">
                            {alloc.operatorName || alloc.operatorId}
                          </div>
                          <div className="text-[10px] text-stone-500 font-medium mt-0.5">
                            {alloc.statusReason}
                          </div>
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                          alloc.isAssisting
                            ? "bg-amber-100 text-amber-800"
                            : "bg-indigo-100 text-indigo-800"
                        )}>
                          {alloc.currentProcessName || "Station Standby"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      <div className="flex justify-end pt-4 border-t border-stone-100">
        <Button variant="secondary" onClick={onClose} className="text-xs font-bold">
          Close Estimator
        </Button>
      </div>
    </Modal>
  );
}
