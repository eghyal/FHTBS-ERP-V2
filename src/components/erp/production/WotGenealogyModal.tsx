import React, { useState, useEffect } from "react";
import { 
  History, Clock, CheckCircle2, AlertTriangle, ArrowRight, 
  Layers, Cpu, User, ShieldCheck, RefreshCw, FileText
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";

interface WotGenealogyModalProps {
  isOpen: boolean;
  onClose: () => void;
  wot: any;
}

export function WotGenealogyModal({ isOpen, onClose, wot }: WotGenealogyModalProps) {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTravelLogs = async () => {
    if (!wot?.id) return;
    try {
      setLoading(true);
      const res: any = await apiFetch(`/api/wots/${wot.id}/travel-log`);
      if (res.ok && res.data) {
        setLogs(res.data);
      } else {
        // Fallback to genealogy endpoint
        const genRes: any = await apiFetch(`/api/production/wots/${wot.id}/genealogy`);
        if (genRes.ok && genRes.history) {
          setLogs(genRes.history);
        }
      }
    } catch (err: any) {
      showToast(err.message || "Failed to load travel logs", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && wot?.id) {
      fetchTravelLogs();
    }
  }, [isOpen, wot?.id]);

  if (!isOpen || !wot) return null;

  const getEventBadge = (eventType: string) => {
    switch (eventType) {
      case "START":
        return <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[10px]">STARTED</span>;
      case "QR_SCAN":
        return <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-bold text-[10px]">QR SCANNED</span>;
      case "WOT_COMPLETE":
        return <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">WOT COMPLETE</span>;
      case "TRANSFER":
      case "INTRA_STATION_TRANSFER":
      case "INTER_STATION_TRANSFER":
        return <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold text-[10px]">TRANSFERRED</span>;
      case "NDP_BLOCK":
        return <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold text-[10px]">NDP BLOCKED</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-bold text-[10px]">{eventType}</span>;
    }
  };

  const modalTitle = (
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-xs">
        <History className="w-5 h-5" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-stone-900 text-base">WOT Travel Log & Traceability</span>
          <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 font-bold border border-stone-200">
            {wot.lot_number}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title={modalTitle}
      description="Immutable chronological event trail from raw issuance to root finish"
      contentClassName="p-0"
    >
      <div className="flex flex-col">
        {/* WOT Quick Summary */}
        <div className="p-4 bg-stone-50 border-b border-stone-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-[10px] text-stone-400 block uppercase font-bold">Total Qty</span>
            <span className="font-mono font-bold text-stone-800">{wot.qty} units</span>
          </div>
          <div>
            <span className="text-[10px] text-stone-400 block uppercase font-bold">Good / Scrap</span>
            <span className="font-mono font-bold text-emerald-600">
              {wot.good_units || wot.completed_units || 0} / <span className="text-rose-500">{wot.reject_units || wot.scrap_qty || 0}</span>
            </span>
          </div>
          <div>
            <span className="text-[10px] text-stone-400 block uppercase font-bold">Current Status</span>
            <span className="font-bold text-blue-600 uppercase text-[11px]">{wot.status || "QUEUED"}</span>
          </div>
          <div>
            <span className="text-[10px] text-stone-400 block uppercase font-bold">Active Machine</span>
            <span className="font-mono text-stone-700 truncate block">
              {wot.machine_code || wot.machine_name || "MANUAL"}
            </span>
          </div>
        </div>

        {/* Timeline Event List */}
        <div className="max-h-[50vh] overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400">
              <RefreshCw className="w-6 h-6 animate-spin text-stone-700 mb-2" />
              <p className="text-xs font-medium">Loading ledger events...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-stone-400">
              <FileText className="w-8 h-8 mx-auto text-stone-300 mb-2" />
              <p className="text-xs font-medium">No travel logs recorded yet for this WOT.</p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
              {logs.map((entry, idx) => {
                let metaObj: any = null;
                try {
                  metaObj = typeof entry.metadata === "string" ? JSON.parse(entry.metadata) : entry.metadata;
                } catch (_) {}

                return (
                  <div key={entry.id || idx} className="relative group">
                    {/* Bullet marker */}
                    <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-white border-2 border-stone-800 ring-2 ring-stone-200" />

                    <div className="bg-stone-50 rounded-xl p-3.5 border border-stone-200/80 shadow-xs">
                      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {getEventBadge(entry.event_type)}
                          <span className="text-xs font-bold text-stone-800">
                            {entry.station_name || "Workstation"} • {entry.process_name || "Process Step"}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-stone-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(entry.timestamp || entry.created_at || entry.completed_at).toLocaleString()}
                        </span>
                      </div>

                      {/* Detail row */}
                      <div className="text-xs text-stone-600 flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-stone-200/60">
                        <span className="flex items-center gap-1 text-[11px] text-stone-500">
                          <User className="w-3 h-3" />
                          {entry.user_name || entry.operator_name || "Operator"}
                        </span>

                        {(entry.machine_code || entry.machine_name) && (
                          <span className="flex items-center gap-1 text-[11px] text-stone-500 font-mono">
                            <Cpu className="w-3 h-3 text-stone-700" />
                            {entry.machine_code || entry.machine_name}
                          </span>
                        )}

                        {metaObj?.good_units !== undefined && (
                          <span className="text-[11px] font-mono font-bold text-emerald-600">
                            Yield: {metaObj.good_units} pcs
                          </span>
                        )}

                        {metaObj?.reject_units > 0 && (
                          <span className="text-[11px] font-mono font-bold text-rose-500">
                            Scrap: {metaObj.reject_units} pcs
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between text-xs text-stone-500">
          <span className="font-mono text-[11px]">Audit records: {logs.length} entries</span>
          <Button variant="secondary" size="sm" onClick={onClose} className="text-xs font-bold">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
