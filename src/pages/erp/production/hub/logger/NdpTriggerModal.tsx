import React, { useState, useEffect, useCallback } from "react";
import { 
  AlertTriangle, ShieldAlert, Cpu, Layers, Camera, CheckCircle2, 
  ArrowRight, Clock, RefreshCw, AlertCircle, Sparkles, FileText, Wrench, Package
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";

interface NdpTriggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  projectId?: string | null;
  stationId?: string | null;
  processId?: string | null;
}

export function NdpTriggerModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  stationId,
  processId
}: NdpTriggerModalProps) {
  const { showToast } = useToast();
  
  const [type, setType] = useState<string>("MACHINE_BREAKDOWN");
  const [severity, setSeverity] = useState<string>("HIGH");
  const [description, setDescription] = useState<string>("");
  const [downHours, setDownHours] = useState<number>(48);
  const [authorizedBy, setAuthorizedBy] = useState<string>("Production Supervisor");
  
  // Machine Selection
  const [machines, setMachines] = useState<any[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");
  const [loadingMachines, setLoadingMachines] = useState(false);
  
  // Material shortage specific
  const [requiresProcurement, setRequiresProcurement] = useState<boolean>(false);
  const [materialQty, setMaterialQty] = useState<string>("");
  const [materialItemName, setMaterialItemName] = useState<string>("");

  // Photo / Evidence
  const [photoUrl, setPhotoUrl] = useState<string>("");
  
  // Live Ripple Preview
  const [previewLoading, setPreviewLoading] = useState(false);
  const [ripplePreview, setRipplePreview] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch available machines
  useEffect(() => {
    if (!isOpen) return;
    setLoadingMachines(true);
    apiFetch("/api/inventory/items?type=MACHINE")
      .then((res: any) => {
        const list = res.data || res.items || [];
        setMachines(list);
        if (list.length > 0 && !selectedMachineId) {
          setSelectedMachineId(list[0].id);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch machines:", err);
      })
      .finally(() => setLoadingMachines(false));
  }, [isOpen]);

  // Live Ripple Effect calculation on machine or hours change
  const fetchRipplePreview = useCallback(async (machineId: string, hours: number) => {
    if (!machineId) {
      setRipplePreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const res: any = await apiFetch(`/api/ndps/preview-impact?machine_id=${machineId}&hours=${hours}`);
      if (res.ok || res.success) {
        setRipplePreview(res.ripple_analysis);
      }
    } catch (e) {
      console.error("Failed to preview ripple impact:", e);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (type === "MACHINE_BREAKDOWN" && selectedMachineId) {
      fetchRipplePreview(selectedMachineId, downHours);
    } else {
      setRipplePreview(null);
    }
  }, [type, selectedMachineId, downHours, fetchRipplePreview]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      showToast("Please describe the root cause or breakdown symptom.", "error");
      return;
    }

    if (type === "MACHINE_BREAKDOWN" && !selectedMachineId) {
      showToast("Please select the affected machine asset.", "error");
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        type,
        reason_category: type,
        severity,
        description: description.trim(),
        reason_detail: description.trim(),
        estimated_down_hours: downHours,
        authorized_by: authorizedBy,
        reported_by: authorizedBy,
        machine_id: type === "MACHINE_BREAKDOWN" ? selectedMachineId : null,
        affected_machine_id: type === "MACHINE_BREAKDOWN" ? selectedMachineId : null,
        project_id: projectId || null,
        station_id: stationId || null,
        process_id: processId || null,
        requires_procurement: type === "MATERIAL_SHORTAGE" && requiresProcurement,
        material_request: type === "MATERIAL_SHORTAGE" ? {
          item_name: materialItemName,
          qty: parseFloat(materialQty) || 0
        } : null,
        photo_urls: photoUrl.trim() ? [photoUrl.trim()] : []
      };

      const res: any = await apiFetch("/api/ndps", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (res.ok || res.success) {
        showToast(`NDP ${res.ndp_number || 'Triggered'} successfully! Asset locked down & ripple effect calculated.`, "success");
        if (onSuccess) onSuccess();
        onClose();
      } else {
        throw new Error(res.error || "Failed to trigger NDP");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      contentClassName="p-6 space-y-5"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <ShieldAlert className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-black text-stone-900 tracking-tight">
              Trigger Notice to Down Process (NDP)
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Execute asset lockdown, halt affected WIP tickets, and calculate cascade ripple across projects
            </p>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
          {/* Incident Type & Severity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Incident / Downtime Category
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="MACHINE_BREAKDOWN">Machine Breakdown / Failure (Asset Lockdown)</option>
                <option value="MATERIAL_SHORTAGE">Material Shortage / Warehouse Out of Stock</option>
                <option value="QUALITY_ISSUE">Quality Non-Conformance / High Rejection</option>
                <option value="TOOL_BREAKAGE">Tool / Jig / Fixture Damage</option>
                <option value="POWER_OUTAGE">Power / Compressor / Utility Outage</option>
                <option value="MANPOWER_SHORTAGE">Skill / Manpower Shortage</option>
                <option value="OTHER">Other Unplanned Downtime</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Severity Level
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { key: "LOW", label: "Low", color: "text-stone-700 bg-stone-100 border-stone-200" },
                  { key: "MEDIUM", label: "Med", color: "text-amber-800 bg-amber-50 border-amber-200" },
                  { key: "HIGH", label: "High", color: "text-rose-700 bg-rose-50 border-rose-200" },
                  { key: "CRITICAL", label: "Critical", color: "text-white bg-rose-600 border-rose-700" },
                ].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSeverity(s.key)}
                    className={`py-2 text-[11px] font-black rounded-xl border transition-all ${
                      severity === s.key 
                        ? `${s.color} ring-2 ring-rose-500 shadow-xs` 
                        : "bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Machine Selection (Visible for MACHINE_BREAKDOWN) */}
          {type === "MACHINE_BREAKDOWN" && (
            <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-rose-600" />
                  Target Machinery Asset to Lockdown
                </label>
                <span className="text-[10px] font-mono text-stone-500">
                  {machines.length} Equipment Registered
                </span>
              </div>

              {loadingMachines ? (
                <div className="text-xs text-stone-400 p-2">Loading equipment catalog...</div>
              ) : (
                <select
                  value={selectedMachineId}
                  onChange={(e) => setSelectedMachineId(e.target.value)}
                  className="w-full p-2.5 text-xs bg-white border border-stone-200 rounded-xl font-mono font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="">-- Select Machine Asset --</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      [{m.item_code}] {m.name} — Status: {m.operational_status || m.machine_status || 'AVAILABLE'} ({m.capacity_per_hour || 0} u/hr)
                    </option>
                  ))}
                </select>
              )}

              {/* Live Ripple Effect Breakdown Preview (Section 5.3 & 5.5) */}
              {previewLoading && (
                <div className="p-3 bg-white rounded-xl border border-stone-200 flex items-center gap-2 text-xs text-stone-500">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-600" />
                  Calculating cross-project cascade ripple impact...
                </div>
              )}

              {ripplePreview && !previewLoading && (
                <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-black text-rose-950 uppercase tracking-wider">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-rose-600" />
                      Live Cross-Impact Ripple Forecast
                    </span>
                    <span className="text-rose-700 font-mono">
                      ~{downHours} Hours Est. Down
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-white rounded-lg border border-rose-100">
                      <div className="text-base font-black text-stone-900">{ripplePreview.affected_projects_count}</div>
                      <div className="text-[9px] uppercase font-bold text-stone-500">Projects Affected</div>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-rose-100">
                      <div className="text-base font-black text-stone-900">{ripplePreview.affected_processes_count}</div>
                      <div className="text-[9px] uppercase font-bold text-stone-500">Processes Locked</div>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-rose-100">
                      <div className="text-base font-black text-rose-700">{ripplePreview.affected_wots_count}</div>
                      <div className="text-[9px] uppercase font-bold text-stone-500">WIP Tickets Blocked</div>
                    </div>
                  </div>

                  {ripplePreview.cross_station_impact?.length > 0 && (
                    <div className="text-[11px] text-stone-600">
                      <strong>Affected Workstations:</strong> {ripplePreview.cross_station_impact.map((s: any) => s.station_name).join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Material Shortage Options */}
          {type === "MATERIAL_SHORTAGE" && (
            <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-3">
              <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-amber-700" />
                Material Shortage & Emergency Procurement
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-stone-600 mb-1">Item Name / SKU</label>
                  <input
                    type="text"
                    value={materialItemName}
                    onChange={(e) => setMaterialItemName(e.target.value)}
                    placeholder="e.g., Cold Rolled Steel Sheet 2mm"
                    className="w-full p-2 text-xs bg-white border border-stone-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-600 mb-1">Quantity Shortage</label>
                  <input
                    type="number"
                    value={materialQty}
                    onChange={(e) => setMaterialQty(e.target.value)}
                    placeholder="e.g., 50"
                    className="w-full p-2 text-xs bg-white border border-stone-200 rounded-xl"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={requiresProcurement}
                  onChange={(e) => setRequiresProcurement(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500 h-4 w-4"
                />
                <span className="text-xs font-bold text-stone-800">
                  Auto-generate Emergency Purchase Request (PR) to Procurement
                </span>
              </label>
            </div>
          )}

          {/* Root Cause Description */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Root Cause & Breakdown Symptoms
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Main spindle bearing overheating. Error code E-402 on CNC controller. Immediate maintenance required."
              rows={3}
              className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none font-medium"
              required
            />
          </div>

          {/* Downtime Hours, Authorized By & Photo Proof */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Est. Down Hours</label>
              <input
                type="number"
                value={downHours}
                onChange={(e) => setDownHours(Math.max(1, Number(e.target.value) || 1))}
                min={1}
                className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl font-bold font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-stone-700 mb-1">Authorizer / Reporter</label>
              <input
                type="text"
                value={authorizedBy}
                onChange={(e) => setAuthorizedBy(e.target.value)}
                className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
              <Camera className="w-3.5 h-3.5 text-stone-500" /> Photo Evidence / Inspection Snapshot URL (Optional)
            </label>
            <input
              type="text"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://... URL of machine breakdown or quality issue photo"
              className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl font-mono text-stone-600"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-stone-100">
            <span className="text-[11px] text-stone-400">
              * Execution immediately flags machine as BROKEN and pauses running WOTs
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                className="rounded-xl font-bold text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting}
                className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-md shadow-rose-600/20 flex items-center gap-1.5"
              >
                <ShieldAlert className="w-4 h-4" />
                {submitting ? "Locking Down..." : "Confirm & Trigger NDP"}
              </Button>
            </div>
          </div>
        </form>
    </Modal>
  );
}
