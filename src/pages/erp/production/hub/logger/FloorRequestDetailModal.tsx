import React from "react";
import { 
  CheckCircle2, Clock, Package, Wrench, Cpu, AlertTriangle, 
  FileText, Printer, ShieldAlert, ArrowRight, Check, Image, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";

interface FloorRequestDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: any;
  onAcknowledge?: (id: string) => void;
  onFulfill?: (request: any) => void;
  onReject?: (request: any) => void;
}

export function FloorRequestDetailModal({
  isOpen,
  onClose,
  request,
  onAcknowledge,
  onFulfill,
  onReject
}: FloorRequestDetailModalProps) {
  if (!request) return null;

  const isPending = request.status === "PENDING";
  const isAck = request.status === "ACKNOWLEDGED";
  const isInProgress = request.status === "IN_PROGRESS" || isAck;
  const isFulfilled = request.status === "FULFILLED" || request.status === "RESOLVED";
  const isClosed = request.status === "CLOSED";
  const isRejected = request.status === "REJECTED";

  const handlePrint = () => {
    window.print();
  };

  const headerContent = (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border font-bold ${
        request.category === 'URGENT' 
          ? 'bg-rose-50 border-rose-200 text-rose-600' 
          : 'bg-amber-50 border-amber-200 text-amber-600'
      }`}>
        {request.type === 'MATERIAL' ? <Package className="w-5 h-5" /> :
         request.type === 'TOOL' ? <Wrench className="w-5 h-5" /> :
         request.type === 'MACHINE' ? <Cpu className="w-5 h-5" /> :
         <FileText className="w-5 h-5" />}
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-black text-stone-900">{request.request_code}</h2>
          <Badge 
            variant={
              isPending ? "warning" :
              isAck || isInProgress ? "info" :
              isFulfilled || isClosed ? "success" : "danger"
            }
            size="sm"
          >
            {request.status}
          </Badge>
          <Badge variant="neutral" size="sm">
            {request.category || 'NORMAL'}
          </Badge>
        </div>
        <p className="text-xs text-stone-500 mt-0.5 font-medium">
          Type: <span className="font-bold text-stone-800">{request.type}</span> • Requested by: <span className="font-bold text-stone-800">{request.requested_by || 'Floor Operator'}</span>
        </p>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={headerContent}
      maxWidth="2xl"
      contentClassName="p-0"
    >
      {/* Body Content */}
      <div className="p-6 space-y-5">
        {/* Title & Core Details */}
        <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
          <span className="text-[10px] font-black uppercase text-stone-400 tracking-wider">Request Subject</span>
          <h3 className="text-sm font-bold text-stone-900">{request.title}</h3>
          {request.description && (
            <p className="text-xs text-stone-600 leading-relaxed pt-1 border-t border-stone-200/60 mt-1">
              {request.description}
            </p>
          )}
        </div>

        {/* Grid Information */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-stone-50/70 border border-stone-100 rounded-xl">
            <span className="text-[10px] font-bold uppercase text-stone-400 block">Project & SPK</span>
            <span className="text-xs font-bold text-stone-900 block truncate">{request.project_name || "General Floor"}</span>
            <span className="text-[10px] font-mono text-stone-500">{request.spk_number || "-"}</span>
          </div>

          <div className="p-3 bg-stone-50/70 border border-stone-100 rounded-xl">
            <span className="text-[10px] font-bold uppercase text-stone-400 block">Workstation</span>
            <span className="text-xs font-bold text-stone-900 block truncate">{request.station_name || "Unassigned"}</span>
            <span className="text-[10px] font-mono text-stone-500">{request.station_code || "-"}</span>
          </div>

          <div className="p-3 bg-stone-50/70 border border-stone-100 rounded-xl">
            <span className="text-[10px] font-bold uppercase text-stone-400 block">Quantity / UOM</span>
            <span className="text-xs font-bold text-stone-900 block">
              {request.qty_required ? `${request.qty_required} ${request.unit || 'units'}` : 'N/A'}
            </span>
            <span className="text-[10px] text-stone-500">Demanded Volume</span>
          </div>
        </div>

        {/* Emergency Procurement Card if Auto-PR triggered */}
        {(request.pr_number || request.auto_pr || request.pr_id) && (
          <div className="p-4 bg-purple-50/80 border border-purple-200 rounded-2xl flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-black text-purple-950 uppercase tracking-wide">
                  Emergency Requisition Dispatched (Auto PR)
                </h4>
                <span className="text-[10px] font-mono font-bold bg-purple-200/70 text-purple-800 px-1.5 py-0.5 rounded">
                  {request.pr_number || "PR-AUTO"}
                </span>
              </div>
              <p className="text-[11px] text-purple-700">
                Because stock is required on the active shop floor, an emergency purchase request has been submitted to Procurement for immediate expedited PO release.
              </p>
            </div>
          </div>
        )}

        {/* Photo Evidence if uploaded */}
        {Array.isArray(request.photo_urls) && request.photo_urls.length > 0 && (
          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5 text-stone-400" /> Floor Incident / Evidence Photos
            </span>
            <div className="grid grid-cols-2 gap-3">
              {request.photo_urls.map((url: string, idx: number) => (
                <div key={idx} className="relative rounded-2xl overflow-hidden border border-stone-200 aspect-video bg-stone-100 group">
                  <img src={url} alt="Proof" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fulfillment Section (if fulfilled) */}
        {(isFulfilled || isClosed || request.fulfillment_notes) && (
          <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-black uppercase tracking-wider">Fulfillment Verification</h4>
            </div>
            <div className="text-xs text-stone-700 space-y-1">
              <p className="font-medium text-emerald-950">{request.fulfillment_notes || "Floor request fulfilled and parts delivered."}</p>
              <div className="text-[10px] text-stone-500 flex items-center gap-2 pt-1 border-t border-emerald-100">
                <span>Fulfilled by: <strong>{request.fulfilled_by || 'Warehouse Team'}</strong></span>
                <span>•</span>
                <span>Time: <strong>{request.fulfilled_at ? new Date(request.fulfilled_at).toLocaleString() : 'Recent'}</strong></span>
              </div>
            </div>

            {/* Fulfillment photo proof */}
            {Array.isArray(request.fulfillment_photo_urls) && request.fulfillment_photo_urls.length > 0 && (
              <div className="pt-2">
                <span className="text-[10px] font-bold text-emerald-900 block mb-1">Fulfillment Proof:</span>
                <div className="grid grid-cols-2 gap-2">
                  {request.fulfillment_photo_urls.map((pUrl: string, pIdx: number) => (
                    <div key={pIdx} className="rounded-xl overflow-hidden border border-emerald-200 aspect-video bg-stone-100">
                      <img src={pUrl} alt="Fulfillment Proof" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Timeline Audit Log */}
        <div className="p-4 bg-white border border-stone-200 rounded-2xl space-y-2">
          <span className="text-[10px] font-black uppercase text-stone-400 tracking-wider">Lifecycle History</span>
          <div className="space-y-1.5 text-xs text-stone-600">
            <div className="flex items-center justify-between">
              <span>1. Request Created & Logged</span>
              <span className="font-mono text-stone-500 text-[10px]">{request.created_at ? new Date(request.created_at).toLocaleString() : '-'}</span>
            </div>
            {request.acknowledged_at && (
              <div className="flex items-center justify-between text-blue-700 font-medium">
                <span>2. Acknowledged by {request.acknowledged_by || 'Supervisor'}</span>
                <span className="font-mono text-[10px]">{new Date(request.acknowledged_at).toLocaleString()}</span>
              </div>
            )}
            {request.fulfilled_at && (
              <div className="flex items-center justify-between text-emerald-700 font-medium">
                <span>3. Fulfilled by {request.fulfilled_by || 'Warehouse'}</span>
                <span className="font-mono text-[10px]">{new Date(request.fulfilled_at).toLocaleString()}</span>
              </div>
            )}
            {isClosed && (
              <div className="flex items-center justify-between text-stone-900 font-bold">
                <span>4. Operator Receipt Confirmed & Closed</span>
                <span className="font-mono text-[10px]">{request.updated_at ? new Date(request.updated_at).toLocaleString() : '-'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between shrink-0">
        <Button
          variant="secondary"
          size="sm"
          onClick={handlePrint}
          className="text-xs font-bold rounded-xl flex items-center gap-1.5 text-stone-700 border-stone-300"
        >
          <Printer className="w-3.5 h-3.5" /> Print Floor Slip
        </Button>

        <div className="flex items-center gap-2">
          {isPending && onAcknowledge && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                onAcknowledge(request.id);
                onClose();
              }}
              className="text-xs font-bold rounded-xl border-stone-300 text-stone-700"
            >
              Acknowledge
            </Button>
          )}

          {(isPending || isInProgress) && onFulfill && (
            <Button
              size="sm"
              variant="success"
              onClick={() => {
                onFulfill(request);
                onClose();
              }}
              className="text-xs font-bold rounded-xl"
            >
              <Check className="w-3.5 h-3.5 mr-1" /> Fulfill with Proof
            </Button>
          )}

          {(isPending || isInProgress) && onReject && (
            <Button
              size="sm"
              variant="danger_soft"
              onClick={() => {
                onReject(request);
                onClose();
              }}
              className="text-xs font-bold rounded-xl"
            >
              Reject
            </Button>
          )}

          <Button
            size="sm"
            variant="secondary"
            onClick={onClose}
            className="text-xs font-bold rounded-xl"
          >
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

