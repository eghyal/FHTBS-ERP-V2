import React, { memo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CloudFileUploader } from "@/components/shared/CloudFileUploader";
import { AlertCircle, X, ShieldCheck } from "lucide-react";

interface ReissueGrnModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPoDetails: any;
  handleReissueGrn: (e: React.FormEvent) => void;
  reissueGrnForm: {
    received_date: string;
    qc_status: string;
    remarks: string;
    rejected_grn_doc: string;
  };
  setReissueGrnForm: React.Dispatch<
    React.SetStateAction<{
      received_date: string;
      qc_status: string;
      remarks: string;
      rejected_grn_doc: string;
    }>
  >;
  reissueGrnItems: any[];
  setReissueGrnItems: React.Dispatch<React.SetStateAction<any[]>>;
  isSubmitting: boolean;
  user: any;
}

export const ReissueGrnModal = memo(function ReissueGrnModal({
  isOpen,
  onClose,
  selectedPoDetails,
  handleReissueGrn,
  reissueGrnForm,
  setReissueGrnForm,
  reissueGrnItems,
  setReissueGrnItems,
  isSubmitting,
  user,
}: ReissueGrnModalProps) {
  if (!selectedPoDetails) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="4xl"
      contentClassName="p-0 flex flex-col h-[90vh]"
    >
      <div className="p-4 border-b border-stone-100 flex justify-between items-center bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center">
            <AlertCircle className="w-4 h-4 text-rose-700" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-stone-900 tracking-tight">
              Re-issue Rejected Delivery (GRN)
            </h3>
            <p className="text-xs text-stone-500 font-medium tracking-widest uppercase mt-1">
              {selectedPoDetails?.po_number || "N/A"} &bull; Status: REJECTED
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-stone-400 hover:text-stone-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-stone-50/30 space-y-6">
        <form
          id="reissue-grn-form"
          onSubmit={handleReissueGrn}
          className="space-y-6"
        >
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl mb-2">
            <p className="text-xs text-rose-700 font-medium">
              This PO was previously rejected. Use this form to process the
              corrected/re-delivered items from the supplier.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-2 px-1">
                Received Date
              </label>
              <input
                required
                type="date"
                value={reissueGrnForm.received_date}
                onChange={(e) =>
                  setReissueGrnForm({
                    ...reissueGrnForm,
                    received_date: e.target.value,
                  })
                }
                className="w-full px-4 py-3 bg-white border border-stone-200 rounded-xl text-xs font-bold focus:border-stone-400 outline-none transition-all shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-2 px-1">
                Engineering Decision
              </label>
              <select
                value={reissueGrnForm.qc_status}
                onChange={(e) =>
                  setReissueGrnForm({
                    ...reissueGrnForm,
                    qc_status: e.target.value,
                  })
                }
                className="w-full px-4 py-3 bg-white border border-stone-200 rounded-xl text-xs font-bold focus:border-stone-400 outline-none transition-all appearance-none shadow-2xs cursor-pointer"
              >
                <option value="PASSED">Passed</option>
                <option value="REJECTED">Rejected</option>
                <option value="CONDITIONAL">Conditional</option>
              </select>
            </div>
          </div>

          <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-xs uppercase">
                {(user?.name || user?.username || "P").charAt(0)}
              </div>
              <div>
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                  Inspector & Receiver
                </div>
                <div className="text-xs font-bold text-stone-900 mt-0.5">
                  {user?.name || user?.username || "Purchasing Team"}{" "}
                  <span className="font-medium text-stone-500 text-[10px]">
                    ({user?.role || "Purchasing"})
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200/80 text-[10px] font-bold tracking-wider uppercase">
              <ShieldCheck className="w-3.5 h-3.5" /> Direct Verified
            </div>
          </div>

          {/* Rejected GRN Document Upload */}
          <div>
            <CloudFileUploader
              label="Previous Rejected GRN Document (Cloud Storage) *"
              accept=".pdf,.png,.jpg,.jpeg"
              maxSizeMb={15}
              value={reissueGrnForm.rejected_grn_doc}
              onChange={(url) =>
                setReissueGrnForm({
                  ...reissueGrnForm,
                  rejected_grn_doc: url,
                })
              }
              pathPrefix="rejected_grn_docs"
            />
            <p className="text-[9px] text-rose-500 font-medium tracking-wide mt-1.5">
              * Required: Attach the document of the GRN that was previously
              rejected for this PO.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-2 px-1">
              Item Confirmations (Engineering Verification)
            </label>
            <div className="border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                    <th className="px-4 py-3">Item Target</th>
                    <th className="px-4 py-3 text-center">Pending Volume</th>
                    <th className="px-4 py-3 text-right w-40">Count Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white">
                  {reissueGrnItems.map((item, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-stone-50/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold text-stone-900 tracking-tight">
                          {item.item_code}
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-stone-400 truncate max-w-[200px] mt-0.5">
                          {item.item_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-medium text-stone-600">
                        <span className="text-xs font-semibold text-stone-900 font-mono">
                          {item.qty - (item.received_qty || 0)}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400 ml-1">
                          {item.uom}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            value={item.qty_received}
                            onChange={(e) => {
                              const newItems = [...reissueGrnItems];
                              newItems[idx].qty_received = Number(
                                e.target.value,
                              );
                              setReissueGrnItems(newItems);
                            }}
                            className="w-full bg-stone-50 border border-stone-200 hover:bg-white rounded-lg px-3 py-1.5 pr-8 text-right text-xs font-mono font-bold text-stone-900 focus:bg-white focus:border-stone-400 outline-none transition-all shadow-2xs"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-stone-400 uppercase tracking-widest leading-none pointer-events-none mt-px">
                            {item.uom}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-2 px-1">
              Notes / Syarat / Physical Observations
            </label>
            <textarea
              placeholder="Physical condition, missing parts, corrective actions taken by supplier..."
              value={reissueGrnForm.remarks}
              onChange={(e) =>
                setReissueGrnForm({
                  ...reissueGrnForm,
                  remarks: e.target.value,
                })
              }
              className="w-full px-4 py-3 bg-white border border-stone-200 rounded-xl text-xs font-medium focus:border-stone-400 outline-none transition-all shadow-2xs h-24 resize-none"
            />
          </div>
        </form>
      </div>

      <div className="p-4 md:p-6 border-t border-stone-100 bg-white flex justify-between items-center shrink-0">
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => {
            const updated = reissueGrnItems.map((item) => ({
              ...item,
              qty_received: item.qty,
            }));
            setReissueGrnItems(updated);
          }}
        >
          Auto-Fill All Ordered
        </Button>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            form="reissue-grn-form"
            type="submit"
            size="sm"
            disabled={isSubmitting || !reissueGrnForm.rejected_grn_doc}
            className="bg-rose-700 hover:bg-rose-800 text-white"
          >
            {isSubmitting ? "Processing..." : "Confirm Re-issue Receipt"}
          </Button>
        </div>
      </div>
    </Modal>
  );
});
