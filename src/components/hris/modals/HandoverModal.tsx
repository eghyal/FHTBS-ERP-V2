import React from "react";
import { Modal } from "@/components/ui/Modal";

interface HandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  handleSubmitHandover: (e: React.FormEvent) => void;
  hoResigning: string;
  setHoResigning: (val: string) => void;
  users: any[];
  hoSuccessor: string;
  setHoSuccessor: (val: string) => void;
  hoDate: string;
  setHoDate: (val: string) => void;
  hoItemsText: string;
  setHoItemsText: (val: string) => void;
  hoNotes: string;
  setHoNotes: (val: string) => void;
}

export const HandoverModal: React.FC<HandoverModalProps> = ({
  isOpen,
  onClose,
  handleSubmitHandover,
  hoResigning,
  setHoResigning,
  users,
  hoSuccessor,
  setHoSuccessor,
  hoDate,
  setHoDate,
  hoItemsText,
  setHoItemsText,
  hoNotes,
  setHoNotes,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Resignation Handover Track"
      description="Map resigning employees to successors with customizable checklists."
      maxWidth="xl"
    >
      <form onSubmit={handleSubmitHandover} className="space-y-6">
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Resigning Staff <span className="text-brand">*</span>
            </label>
            <select
              value={hoResigning}
              onChange={(e) => setHoResigning(e.target.value)}
              required
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-xs font-black text-stone-800 focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none cursor-pointer"
            >
              <option value="">-- Choose Leaving Staff --</option>
              {users.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Successor <span className="text-brand">*</span>
            </label>
            <select
              value={hoSuccessor}
              onChange={(e) => setHoSuccessor(e.target.value)}
              required
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-xs font-black text-stone-800 focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none cursor-pointer"
            >
              <option value="">-- Choose New Handle --</option>
              {users.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2 col-span-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Target Finish Date <span className="text-brand">*</span>
            </label>
            <input
              type="date"
              required
              value={hoDate}
              onChange={(e) => setHoDate(e.target.value)}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-sm font-black text-stone-800 focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
            Handover Checklist Items (one task per line){" "}
            <span className="text-brand">*</span>
          </label>
          <textarea
            required
            rows={4}
            value={hoItemsText}
            onChange={(e) => setHoItemsText(e.target.value)}
            className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-xs font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none resize-none"
            placeholder="- Standard Operating Procedures&#10;- Office key handover&#10;- Account credentials transfer..."
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
            Notes
          </label>
          <textarea
            rows={3}
            placeholder="Explain background transitions or coordination details..."
            value={hoNotes}
            onChange={(e) => setHoNotes(e.target.value)}
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
            Save Handover Track
          </button>
        </div>
      </form>
    </Modal>
  );
};
