import React, { useState, useEffect } from "react";
import { 
  Wrench, CheckCircle2, ShieldCheck, Cpu, RefreshCw, AlertCircle, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";

interface NdpResolveModalProps {
  isOpen: boolean;
  onClose: () => void;
  ndp: any;
  onSuccess?: () => void;
}

export function NdpResolveModal({
  isOpen,
  onClose,
  ndp,
  onSuccess
}: NdpResolveModalProps) {
  const { showToast } = useToast();
  
  const [resolutionType, setResolutionType] = useState<string>("REPAIR");
  const [resolutionNotes, setResolutionNotes] = useState<string>("");
  const [resolvedBy, setResolvedBy] = useState<string>("Maintenance Supervisor");
  const [verifiedByQc, setVerifiedByQc] = useState<boolean>(true);
  
  // Alternative Machine (if REPLACE_MACHINE chosen)
  const [altMachines, setAltMachines] = useState<any[]>([]);
  const [selectedAltMachineId, setSelectedAltMachineId] = useState<string>("");
  const [loadingAltMachines, setLoadingAltMachines] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || resolutionType !== "REPLACE_MACHINE") return;
    setLoadingAltMachines(true);
    apiFetch("/api/inventory/items?type=MACHINE")
      .then((res: any) => {
        const list = res.data || res.items || [];
        const availableOnly = list.filter((m: any) => 
          m.id !== (ndp.machine_id || ndp.affected_machine_id) &&
          m.operational_status !== 'BROKEN' && 
          m.machine_status !== 'BROKEN'
        );
        setAltMachines(availableOnly);
        if (availableOnly.length > 0 && !selectedAltMachineId) {
          setSelectedAltMachineId(availableOnly[0].id);
        }
      })
      .catch((err) => console.error("Failed to load alternative machines:", err))
      .finally(() => setLoadingAltMachines(false));
  }, [isOpen, resolutionType, ndp]);

  if (!isOpen || !ndp) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionNotes.trim()) {
      showToast("Please enter resolution notes / repair details.", "error");
      return;
    }

    if (resolutionType === "REPLACE_MACHINE" && !selectedAltMachineId) {
      showToast("Please select the replacement machine.", "error");
      return;
    }

    try {
      setSubmitting(true);
      const res: any = await apiFetch(`/api/ndps/${ndp.id}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({
          resolution_type: resolutionType,
          resolution_notes: resolutionNotes.trim(),
          resolved_by: resolvedBy,
          verified_by_qc: verifiedByQc,
          alternative_machine_id: resolutionType === "REPLACE_MACHINE" ? selectedAltMachineId : undefined
        })
      });

      if (res.ok || res.success) {
        showToast(`NDP ${ndp.ndp_code || ndp.ndp_number} successfully resolved! Equipment available & WIP tickets unblocked.`, "success");
        if (onSuccess) onSuccess();
        onClose();
      } else {
        throw new Error(res.error || "Failed to resolve NDP");
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
      maxWidth="lg"
      contentClassName="p-6 space-y-4"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-stone-900 flex items-center gap-1.5">
              Resolve Incident [{ndp.ndp_code || ndp.ndp_number}]
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Restore equipment availability, unblock WIP tickets, and write resolution audit trail
            </p>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
          {/* Resolution Strategy */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Resolution Strategy & Action
            </label>
            <select
              value={resolutionType}
              onChange={(e) => setResolutionType(e.target.value)}
              className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="REPAIR">Repair Completed (Asset Certified Ready for Operation)</option>
              <option value="REPLACE_MACHINE">Swapped to Alternative Machine (Reallocate Queue)</option>
              <option value="MATERIAL_ARRIVED">Material Shortage Restocked & Checked</option>
              <option value="WORKAROUND">Process Workaround / Manual Override Executed</option>
              <option value="CANCELLED">False Alarm / Cancelled</option>
            </select>
          </div>

          {/* Alternative Machine Selector (if REPLACE_MACHINE) */}
          {resolutionType === "REPLACE_MACHINE" && (
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-stone-700 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-emerald-600" /> Target Alternative Machine
              </label>
              {loadingAltMachines ? (
                <div className="text-xs text-stone-400">Loading standby machines...</div>
              ) : altMachines.length === 0 ? (
                <div className="text-xs text-rose-600 font-medium">No alternative machines available in inventory.</div>
              ) : (
                <select
                  value={selectedAltMachineId}
                  onChange={(e) => setSelectedAltMachineId(e.target.value)}
                  className="w-full p-2 text-xs bg-white border border-stone-200 rounded-xl font-mono font-bold"
                >
                  {altMachines.map((m) => (
                    <option key={m.id} value={m.id}>
                      [{m.item_code}] {m.name} ({m.capacity_per_hour || 0} u/hr)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Resolution Notes */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Resolution Summary & Maintenance Notes
            </label>
            <textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="e.g., Replaced spindle bearings and conducted 15-minute test cut. Tolerances verified within ±0.02mm."
              rows={3}
              className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-medium"
              required
            />
          </div>

          {/* Resolved By & QC Verification */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Technician / Resolved By
            </label>
            <input
              type="text"
              value={resolvedBy}
              onChange={(e) => setResolvedBy(e.target.value)}
              className="w-full p-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl font-medium"
              required
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl">
            <input
              type="checkbox"
              checked={verifiedByQc}
              onChange={(e) => setVerifiedByQc(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
            />
            <div className="text-xs">
              <span className="font-bold text-emerald-950 block">Verified & Certified by QC Inspector</span>
              <span className="text-[11px] text-emerald-700">Quality sign-off ensures first article inspection meets standards.</span>
            </div>
          </label>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? "Unblocking..." : "Confirm & Unblock Asset"}
            </Button>
          </div>
        </form>
    </Modal>
  );
}
