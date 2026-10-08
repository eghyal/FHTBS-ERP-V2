import React from "react";
import { Modal } from "@/components/ui/Modal";
import { ReceiptText, Printer } from "lucide-react";

interface PayslipModalProps {
  selectedPayslip: any;
  onClose: () => void;
  user: any;
  formatRupiah: (val: any) => string;
}

export const PayslipModal: React.FC<PayslipModalProps> = ({
  selectedPayslip,
  onClose,
  user,
  formatRupiah,
}) => {
  return (
    <Modal
      isOpen={Boolean(selectedPayslip)}
      onClose={onClose}
      maxWidth="2xl"
      contentClassName="p-0 overflow-hidden"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-200/80 border border-stone-300/60 flex items-center justify-center text-stone-800">
            <ReceiptText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm uppercase tracking-wider text-stone-900 leading-none">
              Employee Payslip Breakdown
            </h3>
            <span className="text-[10px] text-stone-500 uppercase tracking-wider font-mono">
              Paving Joss Division
            </span>
          </div>
        </div>
      }
    >
      {selectedPayslip && (
        <div>
          <div className="p-8 space-y-6 text-stone-800">
            {/* Header Info */}
            <div className="flex justify-between items-start border-b border-stone-200 pb-5 text-xs font-bold">
              <div>
                <h4 className="font-mono text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">
                  Recipient
                </h4>
                <p className="font-extrabold text-stone-900 uppercase text-sm">
                  {user?.username}
                </p>
                <p className="text-stone-500 font-bold">
                  Role: {user?.role || "Staff"}
                </p>
              </div>
              <div className="text-right text-xs">
                <h4 className="font-mono text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">
                  Period
                </h4>
                <p className="font-extrabold text-stone-900 text-sm uppercase">
                  {selectedPayslip.period_month}
                </p>
                <p className="text-stone-500 font-mono text-[10px]">
                  ID: {selectedPayslip.id}
                </p>
              </div>
            </div>

            {/* Financial Calculations Table */}
            <div className="space-y-4">
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block font-bold">
                Financial Components
              </span>

              <div className="bg-stone-50 border border-stone-200/80 rounded-2xl overflow-hidden font-bold">
                <div className="grid grid-cols-2 bg-stone-150/40 border-b border-stone-200 py-2.5 px-4 text-[10px] font-black text-stone-500 uppercase tracking-wider">
                  <span>Component Type</span>
                  <span className="text-right">Amount (IDR)</span>
                </div>

                <div className="divide-y divide-stone-150 font-bold text-xs text-stone-700">
                  <div className="grid grid-cols-2 py-3 px-4">
                    <span>Basic Salary</span>
                    <span className="text-right font-mono text-stone-900">
                      {formatRupiah(selectedPayslip.basic_salary)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 py-3 px-4">
                    <span className="text-emerald-700 flex items-center gap-1">
                      Operational Allowance (+)
                    </span>
                    <span className="text-right font-mono text-emerald-700">
                      +{formatRupiah(selectedPayslip.allowances)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 py-3 px-4">
                    <span className="text-rose-700 flex items-center gap-1">
                      Deductions (-)
                    </span>
                    <span className="text-right font-mono text-rose-700">
                      -{formatRupiah(selectedPayslip.deductions)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Net Income block */}
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex justify-between items-center font-bold">
                <div>
                  <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest block">
                    Total Take Home Pay (THP)
                  </span>
                  <span className="text-xs text-stone-500 font-bold">
                    Net salary transferred to registered account
                  </span>
                </div>
                <span className="text-xl font-extrabold text-emerald-700 font-mono tracking-tight">
                  {formatRupiah(selectedPayslip.net_salary)}
                </span>
              </div>
            </div>

            {/* Legal confirmation seal */}
            <div className="flex justify-between items-end pt-4 border-t border-stone-200/60 text-[10px] text-stone-500 font-medium">
              <div>
                <p>
                  Validity: <strong>SYSTEM VERIFIED</strong>
                </p>
                <p>
                  Status:{" "}
                  <strong
                    className={
                      selectedPayslip.status === "PAID"
                        ? "text-emerald-600"
                        : "text-amber-600"
                    }
                  >
                    {selectedPayslip.status === "PAID"
                      ? "PAID (DISBURSED)"
                      : "PENDING PAYMENT"}
                  </strong>
                </p>
                <p>
                  Printed:{" "}
                  {new Date().toLocaleString("en-US", {
                    timeZone: "Asia/Jakarta",
                  })}
                </p>
              </div>
              <div className="text-right cursor-default select-none font-bold">
                <p className="uppercase tracking-widest font-black text-stone-400 mb-4">
                  Finance Department
                </p>
                <div className="font-mono bg-stone-100 text-stone-600 border border-stone-200 px-2 py-1 rounded inline-block">
                  PAVINGJOSS-ERP-SECURE✓
                </div>
              </div>
            </div>
          </div>

          <div className="bg-stone-50 px-8 py-5 border-t border-stone-100 flex justify-end gap-3 font-bold">
            <button
              type="button"
              onClick={() => {
                window.print();
              }}
              className="px-4 py-2.5 bg-stone-250 hover:bg-stone-300 text-stone-700 text-xs font-black uppercase tracking-wider rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" /> Print Slip
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-brand hover:bg-brand-dark text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              Close Document
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
