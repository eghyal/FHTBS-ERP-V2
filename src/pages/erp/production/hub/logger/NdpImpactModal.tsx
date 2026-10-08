import React, { useState, useEffect } from "react";
import { 
  ShieldAlert, AlertTriangle, Cpu, Layers, Clock, ArrowRight, 
  RefreshCw, CheckCircle2, ChevronRight, FileText, Printer, Wrench, X, Sparkles, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { NdpPreviewModal } from "@/components/erp/NdpPreviewModal";

interface NdpImpactModalProps {
  isOpen: boolean;
  onClose: () => void;
  ndp: any;
  onResolve?: (ndp: any) => void;
  onRescheduled?: () => void;
}

export function NdpImpactModal({
  isOpen,
  onClose,
  ndp,
  onResolve,
  onRescheduled
}: NdpImpactModalProps) {
  const { showToast } = useToast();
  const [impactData, setImpactData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingReschedule, setSyncingReschedule] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"TREE" | "PROJECTS" | "WOTS" | "ALTERNATIVES">("TREE");

  useEffect(() => {
    if (!isOpen || !ndp?.id) return;
    setLoading(true);
    apiFetch(`/api/ndps/${ndp.id}/impact-analysis`)
      .then((res: any) => {
        if (res.ok || res.success) {
          setImpactData(res);
        }
      })
      .catch((err) => {
        console.error("Failed to load impact analysis:", err);
      })
      .finally(() => setLoading(false));
  }, [isOpen, ndp?.id]);

  if (!isOpen || !ndp) return null;

  const ripple = impactData?.ripple_analysis || (typeof ndp.ripple_analysis === 'string' ? JSON.parse(ndp.ripple_analysis) : ndp.ripple_analysis) || {};
  const crossProcess = impactData?.cross_process_impact || ripple?.cross_process_impact || [];
  const crossStation = impactData?.cross_station_impact || ripple?.cross_station_impact || [];
  const crossProject = impactData?.cross_project_impact || ripple?.cross_project_impact || [];
  const affectedWots = impactData?.affected_wots || ripple?.affected_wots || [];

  const handleTriggerReschedule = async () => {
    try {
      setSyncingReschedule(true);
      const res: any = await apiFetch(`/api/ndps/${ndp.id}/reschedule-trigger`, {
        method: "POST"
      });
      if (res.ok || res.success) {
        showToast(res.message || "Planning synchronized with downstream constraints!", "success");
        if (onRescheduled) onRescheduled();
      } else {
        throw new Error(res.error || "Failed to sync reschedule");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSyncingReschedule(false);
    }
  };

  const severity = (ndp.severity || 'HIGH').toUpperCase();
  const severityBadgeColor = 
    severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800 border-rose-300' :
    severity === 'HIGH' ? 'bg-rose-50 text-rose-700 border-rose-200' :
    severity === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border-amber-200' :
    'bg-stone-100 text-stone-700 border-stone-200';

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="3xl"
        contentClassName="p-6 space-y-5"
        title={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${severityBadgeColor}`}>
                  {severity} • {ndp.type || ndp.reason_category || 'MACHINE_BREAKDOWN'}
                </span>
                <span className="text-xs font-mono font-bold text-stone-400">
                  {ndp.ndp_code || ndp.ndp_number}
                </span>
              </div>
              <h3 className="text-base font-bold text-stone-900 mt-1">
                {ndp.description || ndp.reason_detail}
              </h3>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Header Action Row */}
          <div className="flex items-center justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowPdfModal(true)}
              className="h-8 px-2.5 text-xs font-bold rounded-xl border-stone-200 flex items-center gap-1"
            >
              <Printer className="w-3.5 h-3.5 text-stone-600" />
              <span>Formal NDP PDF</span>
            </Button>
          </div>

          {/* Top Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl text-center">
              <span className="text-[10px] uppercase font-bold text-stone-500">Locked Equipment</span>
              <div className="text-sm font-black text-stone-900 mt-0.5 truncate font-mono">
                {ndp.machine_code || ndp.machine_name ? `[${ndp.machine_code || 'M'}] ${ndp.machine_name || ''}` : 'General Asset'}
              </div>
            </div>

            <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl text-center">
              <span className="text-[10px] uppercase font-bold text-stone-500">Projects Impacted</span>
              <div className="text-xl font-black text-rose-700 mt-0.5">
                {crossProject.length || ripple.affected_projects_count || 1}
              </div>
            </div>

            <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl text-center">
              <span className="text-[10px] uppercase font-bold text-stone-500">WIP Tickets Blocked</span>
              <div className="text-xl font-black text-rose-700 mt-0.5">
                {affectedWots.length || ripple.affected_wots_count || 0}
              </div>
            </div>

            <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl text-center">
              <span className="text-[10px] uppercase font-bold text-stone-500">Estimated Delay</span>
              <div className="text-xl font-black text-amber-700 mt-0.5">
                ~{ndp.estimated_down_hours || ripple.estimated_delay_hours || 48}h
              </div>
            </div>
          </div>

          {/* Reschedule Recommendation Banner */}
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <div className="text-xs text-amber-900">
                <strong>Reschedule Flag Active:</strong> Downtime causes a critical path shift on shared machinery constraints.
              </div>
            </div>
            <Button
              size="sm"
              disabled={syncingReschedule}
              onClick={handleTriggerReschedule}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl h-7 px-3 shrink-0"
            >
              {syncingReschedule ? "Syncing..." : "Sync Planning Engine"}
            </Button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex p-1 bg-stone-100 rounded-xl border border-stone-200">
            {[
              { key: "TREE", label: "Ripple Visual Tree" },
              { key: "PROJECTS", label: `Affected Projects (${crossProject.length})` },
              { key: "WOTS", label: `Blocked WOTs (${affectedWots.length})` },
              { key: "ALTERNATIVES", label: `Alternative Machines (${crossStation.filter((s: any) => s.has_alternative).length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeTab === tab.key
                    ? "bg-white text-stone-900 shadow-xs border border-stone-200"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content Area */}
          <div className="flex-1 overflow-y-auto space-y-3 min-h-[220px]">
            {loading ? (
              <div className="p-8 text-center text-xs text-stone-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-rose-600" />
                Analyzing cascade cross-impact ripple...
              </div>
            ) : (
              <>
                {/* 1. VISUAL TREE TAB (Section 5.5: Machine -> Process -> Station -> Project -> WOT) */}
                {activeTab === "TREE" && (
                  <div className="p-4 bg-stone-50/70 border border-stone-200 rounded-2xl space-y-4">
                    {/* Level 1: Machine Asset Node */}
                    <div className="flex items-center gap-3 p-3 bg-white border border-rose-300 rounded-xl shadow-2xs">
                      <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center font-black">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] font-black uppercase tracking-wider text-rose-700">Level 1: Machine Asset Constraint (Locked)</div>
                        <div className="text-xs font-bold text-stone-900">
                          [{ndp.machine_code || 'MCH'}] {ndp.machine_name || 'Machine Asset'}
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md">
                        BROKEN
                      </span>
                    </div>

                    {/* Tree connector */}
                    <div className="pl-6 border-l-2 border-rose-200 space-y-3 ml-4">
                      {/* Level 2: Processes */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
                          <ChevronRight className="w-3.5 h-3.5 text-rose-500" /> Level 2: Assigned Processes ({crossProcess.length})
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {crossProcess.map((bp: any) => (
                            <div key={bp.id} className="p-2.5 bg-white border border-stone-200 rounded-xl text-xs space-y-1">
                              <div className="font-bold text-stone-900">{bp.process_name}</div>
                              <div className="text-[10px] text-stone-500">Project: {bp.project_name} (SPK: {bp.spk_number || '-'})</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Level 3: Workstations */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
                          <ChevronRight className="w-3.5 h-3.5 text-rose-500" /> Level 3: Workstations Starving ({crossStation.length})
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {crossStation.map((st: any) => (
                            <div key={st.station_id} className="p-2.5 bg-white border border-stone-200 rounded-xl text-xs space-y-1">
                              <div className="font-bold text-stone-900">{st.station_name}</div>
                              <div className="text-[11px] text-amber-700">{st.recommendation}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. AFFECTED PROJECTS TAB */}
                {activeTab === "PROJECTS" && (
                  <div className="space-y-2">
                    {crossProject.length === 0 ? (
                      <div className="p-6 text-center text-xs text-stone-400 bg-white border border-dashed border-stone-200 rounded-2xl">
                        No external projects impacted.
                      </div>
                    ) : (
                      crossProject.map((prj: any) => (
                        <div key={prj.project_id} className="p-3.5 bg-white border border-stone-200 rounded-2xl flex items-center justify-between">
                          <div>
                            <div className="text-xs font-black text-stone-900">{prj.project_name}</div>
                            <div className="text-[11px] text-stone-500 font-mono mt-0.5">
                              SPK: {prj.spk_number || 'N/A'} • Due: {prj.due_date ? new Date(prj.due_date).toLocaleDateString() : 'TBD'}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md">
                              {prj.delivery_risk || 'RISK'}
                            </span>
                            <div className="text-[10px] text-stone-500 font-mono mt-1">
                              ~{prj.estimated_delay_hours || 48}h cascade delay
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 3. BLOCKED WOTS TAB */}
                {activeTab === "WOTS" && (
                  <div className="space-y-2">
                    {affectedWots.length === 0 ? (
                      <div className="p-6 text-center text-xs text-stone-400 bg-white border border-dashed border-stone-200 rounded-2xl">
                        No active WOTs currently in queue on this equipment.
                      </div>
                    ) : (
                      affectedWots.map((w: any) => (
                        <div key={w.id} className="p-3 bg-white border border-rose-200 rounded-2xl flex items-center justify-between">
                          <div>
                            <div className="text-xs font-mono font-bold text-stone-900 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                              Lot: {w.lot_number}
                            </div>
                            <div className="text-[11px] text-stone-500 mt-0.5">
                              Project: {w.project_name} • Qty: {w.qty || 0} units
                            </div>
                          </div>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md">
                            BLOCKED_NDP
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 4. ALTERNATIVE MACHINES TAB */}
                {activeTab === "ALTERNATIVES" && (
                  <div className="space-y-2">
                    {crossStation.map((st: any) => (
                      <div key={st.station_id} className="p-3.5 bg-white border border-stone-200 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-stone-900">{st.station_name}</h4>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                            st.has_alternative ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {st.has_alternative ? 'Alternative Machine Ready' : 'No Standby Machine'}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600">{st.recommendation}</p>

                        {st.alternative_machines?.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {st.alternative_machines.map((alt: any) => (
                              <div key={alt.id} className="p-2 bg-stone-50 rounded-xl border border-stone-200 text-xs flex items-center justify-between">
                                <div>
                                  <span className="font-bold text-stone-800">[{alt.item_code}] {alt.name}</span>
                                  <span className="block text-[10px] text-emerald-700 font-bold uppercase">{alt.operational_status || 'AVAILABLE'}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-stone-100">
            <span className="text-[11px] text-stone-400">
              NDP Code: <strong className="font-mono text-stone-700">{ndp.ndp_code || ndp.ndp_number}</strong>
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={onClose}
                className="rounded-xl font-bold text-xs"
              >
                Close
              </Button>
              {onResolve && ndp.status !== 'RESOLVED' && (
                <Button
                  size="sm"
                  onClick={() => {
                    onClose();
                    onResolve(ndp);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  Resolve & Unblock Asset
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Formal PDF Print Modal */}
      {showPdfModal && (
        <NdpPreviewModal
          isOpen={showPdfModal}
          onClose={() => setShowPdfModal(false)}
          ndp={ndp}
          project={{ name: ndp.project_name, spk_number: ndp.spk_number }}
        />
      )}
    </>
  );
}
