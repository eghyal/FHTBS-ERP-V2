import React from "react";
import { Modal } from "@/components/ui/Modal";

interface KpiAppraisalModalProps {
  isOpen: boolean;
  onClose: () => void;
  handleSubmitKpi: (e: React.FormEvent) => void;
  kpiEmployee: string;
  setKpiEmployee: (val: string) => void;
  users: any[];
  kpiPeriod: string;
  setKpiPeriod: (val: string) => void;
  scComm: number;
  setScComm: (val: number) => void;
  scProd: number;
  setScProd: (val: number) => void;
  scRel: number;
  setScRel: (val: number) => void;
  scLead: number;
  setScLead: (val: number) => void;
  scTech: number;
  setScTech: (val: number) => void;
  kpiNotes: string;
  setKpiNotes: (val: string) => void;
}

export const KpiAppraisalModal: React.FC<KpiAppraisalModalProps> = ({
  isOpen,
  onClose,
  handleSubmitKpi,
  kpiEmployee,
  setKpiEmployee,
  users,
  kpiPeriod,
  setKpiPeriod,
  scComm,
  setScComm,
  scProd,
  setScProd,
  scRel,
  setScRel,
  scLead,
  setScLead,
  scTech,
  setScTech,
  kpiNotes,
  setKpiNotes,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Appraise Employee KPIs"
      description="Create structural scorecard appraisal matrices spanning five primary work parameters."
      maxWidth="xl"
    >
      <form onSubmit={handleSubmitKpi} className="space-y-6">
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Target staff Member <span className="text-brand">*</span>
            </label>
            <select
              value={kpiEmployee}
              onChange={(e) => setKpiEmployee(e.target.value)}
              required
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-xs font-black text-stone-800 focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none cursor-pointer"
            >
              <option value="">-- Choose Employee --</option>
              {users.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Appraisal Period <span className="text-brand">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Q1 2026, Mid-Year 2026"
              value={kpiPeriod}
              onChange={(e) => setKpiPeriod(e.target.value)}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-sm font-black focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none"
            />
          </div>
        </div>

        {/* SLIDERS SCOREBOARD CONFIGS */}
        <div className="space-y-6 border border-stone-200 p-6 rounded-[2rem] bg-stone-50/50">
          <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest block mb-4 ml-1">
            Metrics Scoring (1 - 100)
          </span>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs font-black text-stone-900">
              <span className="text-stone-700">Communication Metrics</span>
              <span className="text-amber-600 bg-amber-50 px-3 py-1 rounded-xl shadow-sm border border-amber-100">
                {scComm} / 100
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={scComm}
              onChange={(e) => setScComm(Number(e.target.value))}
              className="w-full accent-amber-500 h-2 rounded-lg bg-stone-200 appearance-none cursor-pointer"
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs font-black text-stone-900">
              <span className="text-stone-700">
                Productivity & Output Delivery
              </span>
              <span className="text-emerald-600 bg-emerald-50 px-3 py-1 rounded-xl shadow-sm border border-emerald-100">
                {scProd} / 100
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={scProd}
              onChange={(e) => setScProd(Number(e.target.value))}
              className="w-full accent-emerald-500 h-2 rounded-lg bg-stone-200 appearance-none cursor-pointer"
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs font-black text-stone-900">
              <span className="text-stone-700">
                Reliability & Work Attendance
              </span>
              <span className="text-blue-600 bg-blue-50 px-3 py-1 rounded-xl shadow-sm border border-blue-100">
                {scRel} / 100
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={scRel}
              onChange={(e) => setScRel(Number(e.target.value))}
              className="w-full accent-blue-500 h-2 rounded-lg bg-stone-200 appearance-none cursor-pointer"
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs font-black text-stone-900">
              <span className="text-stone-700">
                Leadership & Coordination Capacity
              </span>
              <span className="text-purple-600 bg-purple-50 px-3 py-1 rounded-xl shadow-sm border border-purple-100">
                {scLead} / 100
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={scLead}
              onChange={(e) => setScLead(Number(e.target.value))}
              className="w-full accent-purple-500 h-2 rounded-lg bg-stone-200 appearance-none cursor-pointer"
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs font-black text-stone-900">
              <span className="text-stone-700">
                Technical Knowledge & Equipment Safety
              </span>
              <span className="text-brand bg-red-50 px-3 py-1 rounded-xl shadow-sm border border-red-100">
                {scTech} / 100
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={scTech}
              onChange={(e) => setScTech(Number(e.target.value))}
              className="w-full accent-brand h-2 rounded-lg bg-stone-200 appearance-none cursor-pointer"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
            Evaluation appraisal Notes
          </label>
          <textarea
            rows={4}
            placeholder="Provide descriptive feedback regarding achievements or areas for improvement..."
            value={kpiNotes}
            onChange={(e) => setKpiNotes(e.target.value)}
            className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-xs font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none resize-none"
          />
        </div>

        <div className="pt-6 flex space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 px-6 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-[2rem] text-sm font-black uppercase tracking-wider transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 py-4 px-6 bg-brand hover:bg-brand-dark text-white rounded-[2rem] text-sm font-black uppercase tracking-wider transition-all shadow-md hover:-translate-y-0.5 active:translate-y-0"
          >
            Save Appraisal Entry
          </button>
        </div>
      </form>
    </Modal>
  );
};
