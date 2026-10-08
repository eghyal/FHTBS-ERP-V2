import React from "react";
import { Modal } from "@/components/ui/Modal";
import { formatRupiah } from "@/utils/format";

interface GeneratePayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  handleCreatePayslip: (e: React.FormEvent) => void;
  users: any[];
  payslipEmployee: string;
  setPayslipEmployee: (val: string) => void;
  apiFetch: any;
  user: any;
  setPayslipBasic: (val: number) => void;
  setPayslipAllowances: (val: number) => void;
  setPayslipDeductions: (val: number) => void;
  payslipMonth: string;
  setPayslipMonth: (val: string) => void;
  payslipBasic: number;
  payslipAllowances: number;
  payslipDeductions: number;
  isSubmittingPayslip: boolean;
}

export const GeneratePayslipModal: React.FC<GeneratePayslipModalProps> = ({
  isOpen,
  onClose,
  handleCreatePayslip,
  users,
  payslipEmployee,
  setPayslipEmployee,
  apiFetch,
  user,
  setPayslipBasic,
  setPayslipAllowances,
  setPayslipDeductions,
  payslipMonth,
  setPayslipMonth,
  payslipBasic,
  payslipAllowances,
  payslipDeductions,
  isSubmittingPayslip,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Generate Employee Payslip"
      description="Draft custom basic salaries, benefits and custom deductions for this month"
      maxWidth="lg"
    >
      <form onSubmit={handleCreatePayslip} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Employee <span className="text-brand">*</span>
            </label>
            <select
              value={payslipEmployee}
              onChange={async (e) => {
                const empUsername = e.target.value;
                setPayslipEmployee(empUsername);
                if (empUsername) {
                  try {
                    const salRes = await apiFetch(
                      "/api/hr/salaries",
                      {},
                      user?.username
                    );
                    if (salRes.ok && Array.isArray(salRes.data)) {
                      const userSal = salRes.data.find(
                        (s: any) => s.employee_username === empUsername
                      );
                      if (userSal) {
                        if (userSal.basic_salary !== undefined)
                          setPayslipBasic(userSal.basic_salary);
                        if (userSal.allowances !== undefined)
                          setPayslipAllowances(userSal.allowances);
                        if (userSal.deductions !== undefined)
                          setPayslipDeductions(userSal.deductions);
                      }
                    }
                  } catch (err) {
                    console.error(err);
                  }
                }
              }}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-sm font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none cursor-pointer"
              required
            >
              <option value="">Select Employee...</option>
              {users.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Payroll Month <span className="text-brand">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. June 2026"
              value={payslipMonth}
              onChange={(e) => setPayslipMonth(e.target.value)}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-sm font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Basic Salary (IDR) <span className="text-brand">*</span>
            </label>
            <input
              type="number"
              required
              value={payslipBasic}
              onChange={(e) => setPayslipBasic(Number(e.target.value))}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-sm font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Allowances & Bonuses (IDR)
            </label>
            <input
              type="number"
              required
              value={payslipAllowances}
              onChange={(e) => setPayslipAllowances(Number(e.target.value))}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-sm font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Deductions & BPJS (IDR)
            </label>
            <input
              type="number"
              required
              value={payslipDeductions}
              onChange={(e) => setPayslipDeductions(Number(e.target.value))}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-sm font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none"
            />
          </div>

          <div className="bg-stone-50 border border-stone-150 rounded-[1.5rem] p-5 flex flex-col justify-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">
              Total Net Salary Formula
            </span>
            <span className="text-xl font-mono font-black text-stone-900 mt-1">
              {formatRupiah(
                Number(payslipBasic) +
                  Number(payslipAllowances) -
                  Number(payslipDeductions)
              )}
            </span>
            <span className="text-[10px] text-stone-400 font-medium mt-1">
              Basic + Allowances - Deductions
            </span>
          </div>
        </div>

        <div className="pt-6 border-t border-stone-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmittingPayslip}
            className="px-8 py-3 bg-brand text-white rounded-[1.5rem] font-bold text-xs uppercase tracking-widest shadow-lg shadow-red-100 hover:bg-brand-dark transition-all disabled:opacity-50 cursor-pointer"
          >
            {isSubmittingPayslip ? "Generating..." : "Confirm & Dispatch"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
