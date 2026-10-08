import React from "react";
import { Modal } from "@/components/ui/Modal";
import { AlertCircle, ShieldCheck, CheckCircle2, X } from "lucide-react";

interface PrqConfirmModalProps {
  prqConfirmModal: {
    isOpen: boolean;
    type: string;
    title: string;
    message: string;
    reasonInput?: string;
    authPin?: string;
    data?: any;
  };
  setPrqConfirmModal: React.Dispatch<React.SetStateAction<any>>;
  dailyAuthKey: string | undefined;
  handleSavePayrollRequisition: (submitToFinance: boolean) => void;
  isSavingPrq: boolean;
  handleExecuteCancelPrq: (id: string, reason: string) => void;
  handleExecuteDeletePrq: (id: string) => void;
}

export const PrqConfirmModal: React.FC<PrqConfirmModalProps> = ({
  prqConfirmModal,
  setPrqConfirmModal,
  dailyAuthKey,
  handleSavePayrollRequisition,
  isSavingPrq,
  handleExecuteCancelPrq,
  handleExecuteDeletePrq,
}) => {
  return (
    <Modal
      isOpen={prqConfirmModal.isOpen}
      onClose={() => setPrqConfirmModal((prev: any) => ({ ...prev, isOpen: false }))}
      title={prqConfirmModal.title}
      maxWidth="md"
    >
      <div className="space-y-4 p-2 text-left">
        <div className="flex items-start gap-3 p-3.5 bg-stone-50 rounded-2xl border border-stone-200 text-stone-700 text-xs">
          <AlertCircle className="w-5 h-5 text-brand shrink-0 mt-0.5" />
          <p className="font-semibold leading-relaxed">
            {prqConfirmModal.message}
          </p>
        </div>

        {prqConfirmModal.type === "CANCEL_PRQ" && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block">
              Reason for PRq Cancellation
            </label>
            <textarea
              rows={3}
              value={prqConfirmModal.reasonInput || ""}
              onChange={(e) =>
                setPrqConfirmModal((prev: any) => ({
                  ...prev,
                  reasonInput: e.target.value,
                }))
              }
              placeholder="State the cancellation reason for audit archives..."
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold focus:outline-none focus:border-brand"
            />
          </div>
        )}

        {(prqConfirmModal.type === "SUBMIT_PRQ" ||
          prqConfirmModal.type === "CANCEL_PRQ") && (
          <div className="space-y-1.5 p-3.5 bg-stone-100/80 rounded-2xl border border-stone-200 text-left">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-black text-stone-700 uppercase tracking-widest flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-brand" />
                <span>Auth System: ERP Authorization PIN</span>
              </label>
              <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded-md text-stone-600 font-extrabold border border-stone-200">
                Daily Key: {dailyAuthKey}
              </span>
            </div>
            <input
              type="password"
              value={prqConfirmModal.authPin || ""}
              onChange={(e) =>
                setPrqConfirmModal((prev: any) => ({
                  ...prev,
                  authPin: e.target.value,
                }))
              }
              placeholder="Enter Authorization PIN (e.g. 123456)"
              className="w-full p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-brand transition-all"
            />
            <p className="text-[10px] text-stone-500 font-medium leading-normal">
              HR Manager authorization verification. Default PIN:{" "}
              <span className="font-mono font-bold text-stone-800">123456</span>{" "}
              or Daily Key.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
          <button
            type="button"
            onClick={() =>
              setPrqConfirmModal((prev: any) => ({ ...prev, isOpen: false }))
            }
            className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>

          {prqConfirmModal.type === "SUBMIT_PRQ" && (
            <button
              type="button"
              onClick={() => handleSavePayrollRequisition(true)}
              disabled={isSavingPrq}
              className="px-5 py-2.5 bg-brand hover:bg-brand-dark text-white text-xs font-black rounded-xl transition-all shadow-md shadow-red-200/50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isSavingPrq ? "Submitting..." : "Yes, Submit to Finance"}
              </span>
            </button>
          )}

          {prqConfirmModal.type === "CANCEL_PRQ" && (
            <button
              type="button"
              disabled={isSavingPrq}
              onClick={() =>
                handleExecuteCancelPrq(
                  prqConfirmModal.data?.id,
                  prqConfirmModal.reasonInput || ""
                )
              }
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              <span>{isSavingPrq ? "Processing..." : "Confirm Cancel PRq"}</span>
            </button>
          )}

          {prqConfirmModal.type === "DELETE_PRQ" && (
            <button
              type="button"
              disabled={isSavingPrq}
              onClick={() => handleExecuteDeletePrq(prqConfirmModal.data?.id)}
              className="px-5 py-2.5 bg-brand hover:bg-brand-dark text-white text-xs font-black rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>{isSavingPrq ? "Processing..." : "Yes, Permanently Delete"}</span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
