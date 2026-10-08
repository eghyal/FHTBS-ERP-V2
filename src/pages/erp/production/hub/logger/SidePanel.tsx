import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/utils/api";
import { 
  AlertCircle, Wrench, RefreshCw, Layers, CheckCircle2, XCircle, 
  ArrowRight, ShieldAlert, Camera, Image, X, ExternalLink, Plus,
  Clock, Package, Cpu, ShieldCheck, AlertTriangle, ChevronRight, FileText, Printer, Sparkles, Filter
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/contexts/ToastContext";
import { useProductionHubStore } from "@/stores/productionHubStore";
import { NdpTriggerModal } from "./NdpTriggerModal";
import { NdpImpactModal } from "./NdpImpactModal";
import { NdpResolveModal } from "./NdpResolveModal";
import { NdpPreviewModal } from "@/components/erp/NdpPreviewModal";
import { FloorRequestDetailModal } from "./FloorRequestDetailModal";

export function SidePanel({ onActionComplete }: { onActionComplete?: () => void }) {
  const { showToast } = useToast();
  const store = useProductionHubStore();
  const [activeTab, setActiveTab] = useState<'NDP' | 'FR'>('NDP');
  const [ndps, setNdps] = useState<any[]>([]);
  const [frs, setFrs] = useState<any[]>([]);
  const [frStats, setFrStats] = useState<any | null>(null);
  const [machineSummary, setMachineSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Floor Request filters
  const [frStatusFilter, setFrStatusFilter] = useState<'ALL' | 'PENDING' | 'IN_PROGRESS' | 'FULFILLED'>('ALL');
  const [frTypeFilter, setFrTypeFilter] = useState<string>('ALL');

  // Fulfillment & Detail modal states
  const [fulfillingFr, setFulfillingFr] = useState<any | null>(null);
  const [fulfillmentNotes, setFulfillmentNotes] = useState("");
  const [fulfillmentPhoto, setFulfillmentPhoto] = useState("");
  const [rejectingFr, setRejectingFr] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [inspectingFr, setInspectingFr] = useState<any | null>(null);

  // NDP Modal states
  const [showNdpTriggerModal, setShowNdpTriggerModal] = useState(false);
  const [inspectingNdp, setInspectingNdp] = useState<any | null>(null);
  const [resolvingNdp, setResolvingNdp] = useState<any | null>(null);
  const [pdfNdp, setPdfNdp] = useState<any | null>(null);

  // Create Floor Request Modal State
  const [showCreateFrModal, setShowCreateFrModal] = useState(false);
  const [newFrType, setNewFrType] = useState<string>("MATERIAL");
  const [newFrUrgency, setNewFrUrgency] = useState<string>("NORMAL");
  const [newFrTitle, setNewFrTitle] = useState("");
  const [newFrDescription, setNewFrDescription] = useState("");
  const [newFrQty, setNewFrQty] = useState("");
  const [newFrUnit, setNewFrUnit] = useState("pcs");
  const [newFrPhoto, setNewFrPhoto] = useState("");
  const [submittingFr, setSubmittingFr] = useState(false);

  const fetchSideData = useCallback(async () => {
    setLoading(true);
    try {
      const [ndpRes, frRes, dashRes] = await Promise.all([
        apiFetch('/api/production/ndp/active'),
        apiFetch('/api/floor-requests?limit=50'),
        apiFetch('/api/production-logger/dashboard')
      ]);
      const anyNdpRes = ndpRes as any;
      if (ndpRes.ok) setNdps(ndpRes.data || anyNdpRes.ndps || []);
      if (frRes.ok) {
        setFrs(frRes.data || []);
        if ((frRes as any).stats) setFrStats((frRes as any).stats);
      }
      if (dashRes.ok) setMachineSummary((dashRes as any).machine_status_summary || null);
    } catch (e) {
      console.error("Failed to fetch side panel data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSideData();
  }, [fetchSideData]);

  // Update Floor Request Status
  const handleUpdateFrStatus = async (frId: string, status: string, notes?: string, photo?: string, reason?: string) => {
    try {
      setProcessingId(frId);
      const res: any = await apiFetch(`/api/floor-requests/${frId}`, {
        method: "PATCH",
        body: JSON.stringify({ 
          status,
          fulfillment_notes: notes || undefined,
          fulfillment_photo_urls: photo ? [photo] : undefined,
          reason: reason || undefined,
          user_id: "Floor Supervisor"
        })
      });
      if (res.ok || res.success) {
        showToast(`Floor request marked as ${status}`, "success");
        setFulfillingFr(null);
        setFulfillmentNotes("");
        setFulfillmentPhoto("");
        setRejectingFr(null);
        setRejectReason("");
        await fetchSideData();
        if (onActionComplete) onActionComplete();
      } else {
        throw new Error(res.error || "Failed to update floor request");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setProcessingId(null);
    }
  };

  // Create Floor Request
  const handleCreateFloorRequest = async () => {
    if (!newFrTitle.trim()) {
      showToast("Please provide a title for the floor request", "error");
      return;
    }
    try {
      setSubmittingFr(true);
      const res: any = await apiFetch('/api/floor-requests', {
        method: "POST",
        body: JSON.stringify({
          type: newFrType,
          category: newFrUrgency,
          title: newFrTitle.trim(),
          description: newFrDescription.trim(),
          qty_required: newFrQty ? parseFloat(newFrQty) : null,
          unit: newFrUnit,
          photo_urls: newFrPhoto.trim() ? [newFrPhoto.trim()] : [],
          project_id: store.project?.id || null,
          requested_by: "Floor Supervisor",
          auto_pr: newFrType === "MATERIAL"
        })
      });
      if (res.ok || res.success) {
        showToast(res.message || "Floor request dispatched to warehouse / maintenance", "success");
        setShowCreateFrModal(false);
        setNewFrTitle("");
        setNewFrDescription("");
        setNewFrQty("");
        setNewFrPhoto("");
        await fetchSideData();
        if (onActionComplete) onActionComplete();
      } else {
        throw new Error(res.error || "Failed to create floor request");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmittingFr(false);
    }
  };

  // Filter Floor Requests
  const filteredFrs = frs.filter(f => {
    if (frStatusFilter === 'PENDING' && f.status !== 'PENDING') return false;
    if (frStatusFilter === 'IN_PROGRESS' && f.status !== 'IN_PROGRESS' && f.status !== 'ACKNOWLEDGED') return false;
    if (frStatusFilter === 'FULFILLED' && f.status !== 'FULFILLED' && f.status !== 'RESOLVED' && f.status !== 'CLOSED') return false;
    if (frTypeFilter !== 'ALL' && f.type !== frTypeFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-stone-50 border border-stone-200 rounded-3xl overflow-hidden shadow-xs">
      {/* Tab Switcher Header */}
      <div className="flex p-2 bg-stone-100/60 border-b border-stone-200">
        <button
          onClick={() => setActiveTab('NDP')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'NDP' 
              ? 'bg-white shadow-xs text-rose-700 border border-rose-100' 
              : 'text-stone-500 hover:bg-stone-200/50'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Active NDPs</span>
          {ndps.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 font-mono font-bold">
              {ndps.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('FR')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'FR' 
              ? 'bg-white shadow-xs text-amber-700 border border-amber-100' 
              : 'text-stone-500 hover:bg-stone-200/50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Floor Requests</span>
          {frs.filter(f => f.status === 'PENDING' || f.status === 'ACKNOWLEDGED').length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-mono font-bold">
              {frs.filter(f => f.status === 'PENDING' || f.status === 'ACKNOWLEDGED').length}
            </span>
          )}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Machine Constraints Mini Status Strip */}
        {machineSummary && (
          <div className="p-3 bg-white border border-stone-200 rounded-2xl shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-stone-700">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-stone-500" /> Machine Constraints
              </span>
              <span className="font-mono text-stone-500">{machineSummary.total_machines || 0} Total Assets</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold">
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-100">
                <div className="text-xs font-black">{machineSummary.available || 0}</div>
                <div className="text-[9px] uppercase tracking-wider">Ready</div>
              </div>
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-100">
                <div className="text-xs font-black">{machineSummary.running || 0}</div>
                <div className="text-[9px] uppercase tracking-wider">Running</div>
              </div>
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-100">
                <div className="text-xs font-black">{machineSummary.maintenance || 0}</div>
                <div className="text-[9px] uppercase tracking-wider">Maint.</div>
              </div>
              <div className="p-1.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-100">
                <div className="text-xs font-black">{machineSummary.broken || 0}</div>
                <div className="text-[9px] uppercase tracking-wider">Broken</div>
              </div>
            </div>
          </div>
        )}

        {/* Action Header */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
            {activeTab === 'NDP' ? 'Asset Lockdowns & Incidents' : 'Active Shop Floor Requests'}
          </span>
          <div className="flex items-center gap-1.5">
            {activeTab === 'NDP' && (
              <Button
                size="sm"
                onClick={() => setShowNdpTriggerModal(true)}
                className="h-6 px-2.5 text-[10px] text-white bg-rose-600 hover:bg-rose-700 font-bold rounded-md shadow-2xs flex items-center gap-1"
              >
                <ShieldAlert className="w-3 h-3" /> Report Incident / NDP
              </Button>
            )}
            {activeTab === 'FR' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateFrModal(true)}
                className="h-6 px-2 text-[10px] text-amber-800 bg-amber-50 hover:bg-amber-100 font-bold rounded-md"
              >
                <Plus className="w-3 h-3 mr-0.5" /> New Request
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={fetchSideData} 
              className="h-6 px-2 text-[10px] text-stone-600 hover:bg-stone-200/60 rounded-md"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* TAB 1: NDP PANEL */}
        {activeTab === 'NDP' && (
          <div className="space-y-3">
            {ndps.length === 0 ? (
              <div className="text-center p-8 bg-white border border-dashed border-stone-200 rounded-2xl text-stone-400 text-xs flex flex-col items-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                <span className="font-bold text-stone-700">All Production Lines Operational</span>
                <span className="text-[11px] text-stone-400 mt-0.5">No active machine downtime or process lockdown.</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowNdpTriggerModal(true)}
                  className="mt-3 text-xs font-bold rounded-xl border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100"
                >
                  <ShieldAlert className="w-3.5 h-3.5 mr-1" /> Report Machine / Process Issue
                </Button>
              </div>
            ) : (
              ndps.map((n) => {
                const severity = (n.severity || 'HIGH').toUpperCase();
                const severityColor = 
                  severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                  severity === 'HIGH' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                  severity === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  'bg-stone-100 text-stone-700 border-stone-200';

                return (
                  <div key={n.id} className="p-4 bg-white border border-rose-200 rounded-2xl shadow-2xs space-y-3">
                    <div className="flex items-start justify-between">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${severityColor}`}>
                        {severity} • {n.type || 'MACHINE_BREAKDOWN'}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-stone-400">{n.ndp_code || n.ndp_number}</span>
                    </div>
                    
                    <div>
                      <h4 className="text-xs font-bold text-stone-900 leading-snug">{n.description || n.reason_detail}</h4>
                      {n.machine_name && (
                        <div className="text-[11px] font-mono text-rose-700 font-bold mt-1.5 flex items-center gap-1">
                          <Cpu className="w-3.5 h-3.5" />
                          <span>Locked Asset: [{n.machine_code || 'M'}] {n.machine_name}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Ripple Impact Mini Summary */}
                    {n.ripple_analysis && (() => {
                      try {
                        const analysis = typeof n.ripple_analysis === 'string' ? JSON.parse(n.ripple_analysis) : n.ripple_analysis;
                        if (analysis && (analysis.affected_projects_count > 0 || analysis.affected_wots_count > 0)) {
                          return (
                            <div className="bg-rose-50/70 rounded-xl p-2.5 border border-rose-100 space-y-1">
                              <div className="text-[10px] font-bold text-rose-800 uppercase tracking-widest flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Cross-Impact Ripple
                              </div>
                              <p className="text-[11px] text-rose-700 leading-tight">
                                Impacts <strong>{analysis.affected_projects_count || 1}</strong> project(s) & <strong>{analysis.affected_wots_count || 0}</strong> queued WOTs.
                              </p>
                            </div>
                          );
                        }
                      } catch (e) { return null; }
                      return null;
                    })()}

                    {/* Reschedule Recommendation Banner */}
                    <div className="p-2 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800 flex items-center justify-between">
                      <span>Planning recalculation advised</span>
                      <button
                        onClick={() => {
                          store.setCurrentPhase("PLANNING");
                        }}
                        className="text-[10px] font-black underline uppercase text-amber-900 hover:text-black flex items-center gap-0.5"
                      >
                        Open Planner <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setInspectingNdp(n)}
                        className="text-[10px] h-8 font-bold rounded-xl border-stone-200 px-1 truncate"
                      >
                        Impact Tree
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setPdfNdp(n)}
                        className="text-[10px] h-8 font-bold rounded-xl border-stone-200 px-1 text-stone-700 flex items-center justify-center gap-1 truncate"
                      >
                        <Printer className="w-3 h-3" /> PDF Doc
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => setResolvingNdp(n)}
                        className="text-[10px] h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-1 truncate"
                      >
                        Resolve
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: FLOOR REQUEST PANEL (Section 6.4) */}
        {activeTab === 'FR' && (
          <div className="space-y-3">
            {/* Mini Statistics Widget (Section 6.4) */}
            {frStats && (
              <div className="grid grid-cols-3 gap-2 bg-white p-2.5 border border-stone-200 rounded-2xl shadow-2xs text-center">
                <div className="p-1.5 bg-amber-50 rounded-xl border border-amber-100">
                  <div className="text-xs font-black text-amber-900">{frStats.total_today || 0}</div>
                  <div className="text-[9px] font-bold text-amber-700 uppercase tracking-tight">Today</div>
                </div>
                <div className="p-1.5 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="text-xs font-black text-blue-900">{frStats.avg_response_minutes || 14}m</div>
                  <div className="text-[9px] font-bold text-blue-700 uppercase tracking-tight">Avg Response</div>
                </div>
                <div className="p-1.5 bg-emerald-50 rounded-xl border border-emerald-100">
                  <div className="text-xs font-black text-emerald-900">{frStats.fulfillment_rate || 100}%</div>
                  <div className="text-[9px] font-bold text-emerald-700 uppercase tracking-tight">Fulfillment</div>
                </div>
              </div>
            )}

            {/* Sub-Filters: Status pills */}
            <div className="flex items-center gap-1 p-1 bg-stone-200/60 rounded-xl">
              {(['ALL', 'PENDING', 'IN_PROGRESS', 'FULFILLED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setFrStatusFilter(st)}
                  className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition-all ${
                    frStatusFilter === st 
                      ? 'bg-white shadow-2xs text-stone-900' 
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  {st === 'ALL' ? 'All' : st === 'IN_PROGRESS' ? 'In Progress' : st.charAt(0) + st.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {filteredFrs.length === 0 ? (
              <div className="text-center p-8 bg-white border border-dashed border-stone-200 rounded-2xl text-stone-400 text-xs flex flex-col items-center">
                <Package className="w-8 h-8 text-stone-300 mb-2" />
                <span className="font-bold text-stone-700">No Matching Floor Requests</span>
                <span className="text-[11px] text-stone-400 mt-0.5">Operators can request materials, tools, or machine assists via terminal.</span>
              </div>
            ) : (
              filteredFrs.map((f) => {
                const isPending = f.status === 'PENDING';
                const isAck = f.status === 'ACKNOWLEDGED';
                const isInProgress = f.status === 'IN_PROGRESS' || isAck;
                const isFulfilled = f.status === 'FULFILLED' || f.status === 'RESOLVED' || f.status === 'CLOSED';
                const isRejected = f.status === 'REJECTED';

                return (
                  <div key={f.id} className="p-4 bg-white border border-stone-200 rounded-2xl shadow-2xs space-y-3">
                    <div className="flex items-start justify-between">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                        f.category === 'URGENT' 
                          ? 'bg-rose-50 border-rose-200 text-rose-700' 
                          : 'bg-amber-50 border-amber-100 text-amber-700'
                      }`}>
                        {f.type} • {f.category || 'NORMAL'}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-stone-400">{f.request_code}</span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-stone-900 leading-snug">{f.title}</h4>
                      {f.description && <p className="text-xs text-stone-500 mt-1 line-clamp-2">{f.description}</p>}
                      {f.qty_required && (
                        <div className="text-[11px] font-mono text-stone-700 font-bold mt-1">
                          Required Qty: {f.qty_required} {f.unit || 'units'}
                        </div>
                      )}
                    </div>

                    {/* Auto-PR Badge if emergency requisition created */}
                    {(f.pr_number || f.auto_pr || f.pr_id) && (
                      <div className="p-2 bg-purple-50 rounded-xl border border-purple-100 flex items-center justify-between text-[10px]">
                        <span className="font-bold text-purple-900 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-purple-600" />
                          Auto PR: {f.pr_number || "PR-AUTO"}
                        </span>
                        <span className="text-purple-700 font-medium">Drafted in Procurement</span>
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-stone-100">
                      <span className="text-stone-500 text-[10px]">Requester: <strong>{f.requested_by || 'Floor'}</strong></span>
                      <span className={`font-black text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isPending ? 'bg-amber-100 text-amber-800' :
                        isInProgress ? 'bg-blue-100 text-blue-800' :
                        isFulfilled ? 'bg-emerald-100 text-emerald-800' :
                        'bg-rose-100 text-rose-800'
                      }`}>
                        {f.status}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setInspectingFr(f)}
                        className="text-[10px] h-7 font-bold rounded-lg border-stone-200 text-stone-700"
                      >
                        Detail & Slip
                      </Button>

                      {isPending && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={processingId === f.id}
                            onClick={() => handleUpdateFrStatus(f.id, 'ACKNOWLEDGED')}
                            className="text-[10px] h-7 font-bold rounded-lg border-stone-200 text-blue-700"
                          >
                            Acknowledge
                          </Button>
                          <Button
                            size="sm"
                            disabled={processingId === f.id}
                            onClick={() => setFulfillingFr(f)}
                            className="text-[10px] h-7 font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            Fulfill
                          </Button>
                        </>
                      )}

                      {isInProgress && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={processingId === f.id}
                            onClick={() => setRejectingFr(f)}
                            className="text-[10px] h-7 font-bold rounded-lg border-stone-200 text-rose-600"
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            disabled={processingId === f.id}
                            onClick={() => setFulfillingFr(f)}
                            className="text-[10px] h-7 font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            Fulfill (Proof)
                          </Button>
                        </>
                      )}

                      {isFulfilled && (
                        <div className="col-span-2 text-right">
                          <span className="text-[10px] text-emerald-700 font-bold flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Delivered & Verified
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* NDP Trigger Modal (Section 5.2) */}
      {showNdpTriggerModal && (
        <NdpTriggerModal
          isOpen={showNdpTriggerModal}
          onClose={() => setShowNdpTriggerModal(false)}
          onSuccess={async () => {
            await fetchSideData();
            if (onActionComplete) onActionComplete();
          }}
          projectId={store.project?.id || null}
        />
      )}

      {/* NDP Impact Tree Visualizer & Cascade Analysis Modal (Section 5.3 & 5.5) */}
      {inspectingNdp && (
        <NdpImpactModal
          isOpen={Boolean(inspectingNdp)}
          onClose={() => setInspectingNdp(null)}
          ndp={inspectingNdp}
          onResolve={(n) => {
            setResolvingNdp(n);
          }}
          onRescheduled={async () => {
            await fetchSideData();
            if (onActionComplete) onActionComplete();
          }}
        />
      )}

      {/* NDP Resolution Modal (Section 5.4) */}
      {resolvingNdp && (
        <NdpResolveModal
          isOpen={Boolean(resolvingNdp)}
          onClose={() => setResolvingNdp(null)}
          ndp={resolvingNdp}
          onSuccess={async () => {
            await fetchSideData();
            if (onActionComplete) onActionComplete();
          }}
        />
      )}

      {/* Formal NDP PDF Print Modal */}
      {pdfNdp && (
        <NdpPreviewModal
          isOpen={Boolean(pdfNdp)}
          onClose={() => setPdfNdp(null)}
          ndp={pdfNdp}
          project={{ name: pdfNdp.project_name, spk_number: pdfNdp.spk_number }}
        />
      )}

      {/* Floor Request Detail & Slip Modal */}
      {inspectingFr && (
        <FloorRequestDetailModal
          isOpen={Boolean(inspectingFr)}
          onClose={() => setInspectingFr(null)}
          request={inspectingFr}
          onAcknowledge={(id) => handleUpdateFrStatus(id, 'ACKNOWLEDGED')}
          onFulfill={(fr) => setFulfillingFr(fr)}
          onReject={(fr) => setRejectingFr(fr)}
        />
      )}

      {/* Rejection Modal with Reason */}
      <Modal
        isOpen={Boolean(rejectingFr)}
        onClose={() => setRejectingFr(null)}
        maxWidth="md"
        contentClassName="p-6 space-y-4"
        title={
          rejectingFr ? (
            <div>
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-600" />
                Reject Request [{rejectingFr.request_code}]
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">{rejectingFr.title}</p>
            </div>
          ) : ""
        }
      >
        {rejectingFr && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Reason for Rejection
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g., Alternate tools already allocated, material not required for this revision."
                rows={3}
                className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRejectingFr(null)}
                className="text-xs font-bold rounded-xl"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={processingId === rejectingFr.id || !rejectReason.trim()}
                onClick={() => handleUpdateFrStatus(rejectingFr.id, 'REJECTED', undefined, undefined, rejectReason)}
                className="text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white"
              >
                {processingId === rejectingFr.id ? "Rejecting..." : "Confirm Rejection"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Fulfillment Modal with Photo Proof & Notes */}
      <Modal
        isOpen={Boolean(fulfillingFr)}
        onClose={() => setFulfillingFr(null)}
        maxWidth="md"
        contentClassName="p-6 space-y-4"
        title={
          fulfillingFr ? (
            <div>
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Fulfill Request [{fulfillingFr.request_code}]
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">{fulfillingFr.title}</p>
            </div>
          ) : ""
        }
      >
        {fulfillingFr && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Fulfillment Notes / Verification
                </label>
                <textarea
                  value={fulfillmentNotes}
                  onChange={(e) => setFulfillmentNotes(e.target.value)}
                  placeholder="e.g., Tools inspected and calibrated. Part delivered to workstation."
                  rows={3}
                  className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-stone-500" />
                  Photo Proof URL / Evidence (Optional)
                </label>
                <input
                  type="text"
                  value={fulfillmentPhoto}
                  onChange={(e) => setFulfillmentPhoto(e.target.value)}
                  placeholder="https://... image snapshot URL"
                  className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFulfillingFr(null)}
                className="text-xs font-bold rounded-xl"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={processingId === fulfillingFr.id}
                onClick={() => handleUpdateFrStatus(fulfillingFr.id, 'FULFILLED', fulfillmentNotes, fulfillmentPhoto)}
                className="text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {processingId === fulfillingFr.id ? "Submitting..." : "Confirm & Fulfill"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create New Floor Request Modal */}
      <Modal
        isOpen={showCreateFrModal}
        onClose={() => setShowCreateFrModal(false)}
        maxWidth="md"
        contentClassName="p-6 space-y-4"
        title={
          <div>
            <h3 className="text-sm font-black text-stone-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-600" />
              Create Shop Floor Request
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">Bidirectional request to Warehouse or Maintenance</p>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">Request Type</label>
                <select
                  value={newFrType}
                  onChange={(e) => setNewFrType(e.target.value)}
                  className="w-full p-2 text-xs bg-stone-50 border border-stone-200 rounded-xl font-bold"
                >
                  <option value="MATERIAL">Material Shortage</option>
                  <option value="TOOL">Tool / Fixture</option>
                  <option value="MACHINE">Machine Assist</option>
                  <option value="QC_CHECK">QC Check</option>
                  <option value="SAFETY">Safety</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="DOCUMENT">Drawing / Doc</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">Urgency</label>
                <select
                  value={newFrUrgency}
                  onChange={(e) => setNewFrUrgency(e.target.value)}
                  className="w-full p-2 text-xs bg-stone-50 border border-stone-200 rounded-xl font-bold"
                >
                  <option value="NORMAL">Normal</option>
                  <option value="URGENT">Urgent (Line Waiting)</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Request Title</label>
              <input
                type="text"
                value={newFrTitle}
                onChange={(e) => setNewFrTitle(e.target.value)}
                placeholder="e.g., Need 20 pcs steel sheet 5mm"
                className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-stone-700 mb-1">Qty Required</label>
                <input
                  type="number"
                  value={newFrQty}
                  onChange={(e) => setNewFrQty(e.target.value)}
                  placeholder="e.g. 20"
                  className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Unit</label>
                <input
                  type="text"
                  value={newFrUnit}
                  onChange={(e) => setNewFrUnit(e.target.value)}
                  placeholder="pcs / kg"
                  className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Description / Reason</label>
              <textarea
                value={newFrDescription}
                onChange={(e) => setNewFrDescription(e.target.value)}
                placeholder="Provide floor details or work ticket context..."
                rows={2}
                className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Photo Evidence URL (Optional)</label>
              <input
                type="text"
                value={newFrPhoto}
                onChange={(e) => setNewFrPhoto(e.target.value)}
                placeholder="https://... photo URL"
                className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCreateFrModal(false)}
              className="text-xs font-bold rounded-xl"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={submittingFr || !newFrTitle.trim()}
              onClick={handleCreateFloorRequest}
              className="text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
            >
              {submittingFr ? "Submitting..." : "Dispatch Request"}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

