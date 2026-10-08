import React from "react";
import { Modal } from "@/components/ui/Modal";

interface JobVacancyModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedJob: any;
  handleSaveJob: (e: React.FormEvent) => void;
  jobTitle: string;
  setJobTitle: (val: string) => void;
  jobDept: string;
  setJobDept: (val: string) => void;
  jobLoc: string;
  setJobLoc: (val: string) => void;
  jobType: string;
  setJobType: (val: string) => void;
  jobSalary: string;
  setJobSalary: (val: string) => void;
  jobDesc: string;
  setJobDesc: (val: string) => void;
  jobReqs: string;
  setJobReqs: (val: string) => void;
  jobBens: string;
  setJobBens: (val: string) => void;
}

export const JobVacancyModal: React.FC<JobVacancyModalProps> = ({
  isOpen,
  onClose,
  selectedJob,
  handleSaveJob,
  jobTitle,
  setJobTitle,
  jobDept,
  setJobDept,
  jobLoc,
  setJobLoc,
  jobType,
  setJobType,
  jobSalary,
  setJobSalary,
  jobDesc,
  setJobDesc,
  jobReqs,
  setJobReqs,
  jobBens,
  setJobBens,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={selectedJob ? "Update Vacancy" : "New Vacancy"}
      description="Define the perfect candidate"
      maxWidth="2xl"
    >
      <form onSubmit={handleSaveJob} className="space-y-6">
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2 col-span-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Job vacancy Title <span className="text-brand">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Senior Welding Technician"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-sm font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Department <span className="text-brand">*</span>
            </label>
            <select
              value={jobDept}
              onChange={(e) => setJobDept(e.target.value)}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-sm font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none cursor-pointer"
            >
              <option value="Production">Production</option>
              <option value="Warehouse">Warehouse</option>
              <option value="Procurement">Procurement</option>
              <option value="Engineering">Engineering</option>
              <option value="Finance">Finance</option>
              <option value="Sales">Sales</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Location <span className="text-brand">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Central Factory"
              value={jobLoc}
              onChange={(e) => setJobLoc(e.target.value)}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-sm font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Job Type <span className="text-brand">*</span>
            </label>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-sm font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none cursor-pointer"
            >
              <option value="Full-time">Full-time</option>
              <option value="Internship">Internship</option>
              <option value="Contract">Contract</option>
              <option value="Freelance">Freelance</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Salary Range Info
            </label>
            <input
              type="text"
              placeholder="e.g. Rp 5.500.000 - Rp 7.000.000"
              value={jobSalary}
              onChange={(e) => setJobSalary(e.target.value)}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-sm font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
            Brief Description <span className="text-brand">*</span>
          </label>
          <textarea
            required
            rows={3}
            placeholder="Describe the responsibilities of this position..."
            value={jobDesc}
            onChange={(e) => setJobDesc(e.target.value)}
            className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-sm font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Requirements
            </label>
            <textarea
              rows={4}
              value={jobReqs}
              onChange={(e) => setJobReqs(e.target.value)}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-xs font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none resize-none"
              placeholder="- Bachelor's Degree minimum&#10;- 1 year experience..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
              Benefits / Perks
            </label>
            <textarea
              rows={4}
              value={jobBens}
              onChange={(e) => setJobBens(e.target.value)}
              className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-xs font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none resize-none"
              placeholder="- Meal Allowance&#10;- BPJS Health Insurance..."
            />
          </div>
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
            className="flex-1 py-4 px-6 bg-brand hover:bg-brand-dark text-white rounded-[2rem] text-sm font-black uppercase tracking-wider transition-all shadow-lg hover:-translate-y-1"
          >
            Post Vacancy
          </button>
        </div>
      </form>
    </Modal>
  );
};
