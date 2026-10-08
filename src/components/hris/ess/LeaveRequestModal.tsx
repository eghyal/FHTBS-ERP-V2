import React from "react";
import { Modal } from "@/components/ui/Modal";
import { CalendarDays, ShieldCheck } from "lucide-react";

interface LeaveRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  isManager: boolean;
  isSubmittingLeave: boolean;
  leaveType: string;
  setLeaveType: (val: string) => void;
  startDate: string;
  setStartDate: (val: string) => void;
  endDate: string;
  setEndDate: (val: string) => void;
  handleRequestLeave: (e: React.FormEvent) => void;
}

export const LeaveRequestModal: React.FC<LeaveRequestModalProps> = ({
  isOpen,
  onClose,
  isManager,
  isSubmittingLeave,
  leaveType,
  setLeaveType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  handleRequestLeave,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      contentClassName="p-6 space-y-4"
      title={
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-brand text-white rounded-lg">
            <CalendarDays className="w-4 h-4" />
          </div>
          <h3 className="font-black text-stone-900 text-sm uppercase tracking-wider">
            Leave Request Form
          </h3>
        </div>
      }
    >
      <form onSubmit={handleRequestLeave} className="space-y-4 font-bold">
        <div className="space-y-1.5 flex flex-col">
          <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-1">
            Leave Category
          </label>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            className="w-full px-4 py-3 bg-stone-50 border border-stone-250 rounded-xl outline-none focus:border-stone-800 text-xs font-bold text-stone-800"
          >
            <option value="Annual Paid Leave">Annual Paid Leave</option>
            <option value="Sick Leave">Sick Leave</option>
            <option value="Maternity / Paternity">
              Maternity / Paternity Leave
            </option>
            <option value="Unpaid Leave">Unpaid Leave</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5 flex flex-col">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-1">
              Start Date
            </label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-3 bg-stone-50 border border-stone-250 rounded-xl outline-none focus:border-stone-800 text-xs text-stone-800 font-bold"
            />
          </div>
          <div className="space-y-1.5 flex flex-col">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-1">
              End Date
            </label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-3 bg-stone-50 border border-stone-250 rounded-xl outline-none focus:border-stone-800 text-xs text-stone-800 font-bold"
            />
          </div>
        </div>

        {isManager ? (
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-3 text-[11px] text-emerald-800 leading-relaxed font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>
              Manager / Executive Level Access Active: Your leave request is
              automatically approved without requiring authorization.
            </span>
          </div>
        ) : (
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-[11px] text-stone-600 leading-relaxed font-medium">
            ℹ️ Staff leave requests will be reviewed and approved by your
            department Manager (Not HR).
          </div>
        )}

        <div className="pt-4 border-t border-stone-100 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-black uppercase tracking-wider rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmittingLeave}
            className="px-6 py-2.5 bg-brand hover:bg-brand-dark text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md disabled:opacity-50 cursor-pointer"
          >
            {isSubmittingLeave ? "Processing..." : "Submit Leave Request"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
