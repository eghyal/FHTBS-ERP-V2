import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Printer } from "lucide-react";
import { formatRupiah } from "@/utils/format";

interface PrqViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPrqView: any;
  handleOpenCancelPrqModal: (prq: any) => void;
  handleOpenDeletePrqModal: (prq: any) => void;
}

export const PrqViewModal: React.FC<PrqViewModalProps> = ({
  isOpen,
  onClose,
  selectedPrqView,
  handleOpenCancelPrqModal,
  handleOpenDeletePrqModal,
}) => {
  if (!selectedPrqView) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="HR Payroll Requisition Document Details (PRq)"
      description="Detailed sheet of HR cost requisition submitted to the Finance Division."
      maxWidth="4xl"
    >
      <div className="space-y-6 text-left">
        <div className="bg-stone-50 p-6 rounded-[2rem] border border-stone-200 flex flex-col md:flex-row justify-between gap-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">
              Requisition Number
            </span>
            <p className="text-xl font-mono font-black text-stone-900 mt-0.5">
              {selectedPrqView.requisition_no}
            </p>
            <span className="text-xs font-bold text-stone-500 block mt-1">
              Submitted By: @{selectedPrqView.prepared_by}
            </span>
          </div>

          <div className="md:text-right">
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">
              Total Disbursement Amount
            </span>
            <p className="text-2xl font-mono font-black text-brand mt-0.5">
              {formatRupiah(selectedPrqView.total_net_pay)}
            </p>
            <div className="mt-2">
              {selectedPrqView.status === "DRAFT" && (
                <span className="px-3 py-1 bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider rounded-full">
                  Status: DRAFT
                </span>
              )}
              {selectedPrqView.status === "SUBMITTED" && (
                <span className="px-3 py-1 bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wider rounded-full">
                  Status: AWAITING FINANCE APPROVAL
                </span>
              )}
              {selectedPrqView.status === "CONVERTED" && (
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider rounded-full">
                  Status: APPROVED & DISBURSED BY FINANCE
                </span>
              )}
              {selectedPrqView.status === "REJECTED" && (
                <span className="px-3 py-1 bg-rose-100 text-rose-800 text-[10px] font-black uppercase tracking-wider rounded-full">
                  Status: REJECTED BY FINANCE
                </span>
              )}
            </div>
          </div>
        </div>

        {selectedPrqView.rejection_reason && (
          <div className="bg-rose-50 border border-rose-200 text-rose-900 p-4 rounded-2xl text-xs font-bold">
            <span className="font-black block uppercase text-[10px] text-rose-600 mb-1">
              Finance Rejection Reason:
            </span>
            {selectedPrqView.rejection_reason}
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-stone-600">
            Per-Employee Breakdown ({selectedPrqView.details?.length || 0}{" "}
            Staff)
          </h4>
          <div className="overflow-x-auto border border-stone-200 rounded-2xl max-h-72">
            <table className="w-full text-left font-bold text-xs border-collapse">
              <thead className="bg-stone-100 text-stone-500 uppercase text-[10px] tracking-widest border-b border-stone-200">
                <tr>
                  <th className="p-3 pl-4">Employee</th>
                  <th className="p-3 text-right">Basic Salary</th>
                  <th className="p-3 text-right">
                    Overtime/Travel/Reimburse
                  </th>
                  <th className="p-3 text-right">Deductions</th>
                  <th className="p-3 pr-4 text-right">Net Salary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {(selectedPrqView.details || []).map((det: any) => (
                  <tr key={det.id || det.employee_username}>
                    <td className="p-3 pl-4">
                      <div className="font-extrabold text-stone-900">
                        {det.employee_name || det.employee_username}
                      </div>
                      <div className="text-[10px] text-stone-400">
                        @{det.employee_username}
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatRupiah(det.basic_salary)}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-600">
                      +
                      {formatRupiah(
                        Number(det.overtime_pay || 0) +
                          Number(det.travel_allowance || 0) +
                          Number(det.reimbursement_amount || 0)
                      )}
                    </td>
                    <td className="p-3 text-right font-mono text-rose-600">
                      -{formatRupiah(det.total_deductions)}
                    </td>
                    <td className="p-3 pr-4 text-right font-mono font-black text-stone-900">
                      {formatRupiah(det.net_pay)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedPrqView.notes && (
          <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 text-xs font-bold text-stone-700">
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block mb-1">
              HR Notes:
            </span>
            {selectedPrqView.notes}
          </div>
        )}

        <div className="pt-4 border-t border-stone-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Export Summary</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {(selectedPrqView.status === "DRAFT" ||
              selectedPrqView.status === "SUBMITTED") && (
              <button
                type="button"
                onClick={() => handleOpenCancelPrqModal(selectedPrqView)}
                className="px-4 py-2 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Cancel PRq
              </button>
            )}

            {(selectedPrqView.status === "DRAFT" ||
              selectedPrqView.status === "CANCELLED" ||
              selectedPrqView.status === "REJECTED") && (
              <button
                type="button"
                onClick={() => handleOpenDeletePrqModal(selectedPrqView)}
                className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Delete Draft
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-brand text-white text-xs font-bold rounded-xl hover:bg-brand-dark transition-all cursor-pointer shadow-xs"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
