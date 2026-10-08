import React from "react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle,
  FileText,
  Download,
  Mail,
} from "lucide-react";
import { copyToClipboard } from "@/utils/clipboard";
import { useToast } from "@/contexts/ToastContext";

interface CandidateEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedApp: any;
  reviewStatus: string;
  setReviewStatus: (val: "APPLIED" | "SCREENING" | "INTERVIEW" | "OFFER_MADE" | "ACCEPTED" | "REJECTED") => void;
  reviewNotes: string;
  setReviewNotes: (val: string) => void;
  handleSaveAppReview: (e: React.FormEvent) => void;
}

export const CandidateEvaluationModal: React.FC<CandidateEvaluationModalProps> = ({
  isOpen,
  onClose,
  selectedApp,
  reviewStatus,
  setReviewStatus,
  reviewNotes,
  setReviewNotes,
  handleSaveAppReview,
}) => {
  const { showToast } = useToast();

  if (!selectedApp) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Recruitment Dossier & Evaluation Engine"
      description="Verify qualifications, update progress milestones, log panels feedback, and generate communications templates on-the-fly."
      maxWidth="3xl"
    >
      <div className="text-stone-900 space-y-6">
        {/* Visual Recruitment Workflow Path */}
        <div className="bg-stone-50 border border-stone-200/60 p-5 rounded-[2rem] shadow-inner">
          <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block mb-4 text-center">
            Recruitment Timeline Milestones
          </span>

          <div className="grid grid-cols-5 gap-2 relative">
            {/* Horizontal progress bar */}
            <div className="absolute top-[18px] left-[10%] right-[10%] h-0.5 bg-stone-200 -z-0"></div>

            {[
              { key: "APPLIED", num: 1, label: "Applied" },
              { key: "SCREENING", num: 2, label: "Screening" },
              { key: "INTERVIEW", num: 3, label: "Interview" },
              { key: "OFFER_MADE", num: 4, label: "Proposal" },
              { key: "ACCEPTED", num: 5, label: "Hired" },
            ].map((step, idx) => {
              const statusOrder = [
                "APPLIED",
                "SCREENING",
                "INTERVIEW",
                "OFFER_MADE",
                "ACCEPTED",
                "REJECTED",
              ];
              const curActiveIdx = statusOrder.indexOf(reviewStatus);
              const isCompleted = curActiveIdx >= idx;
              const isActive = reviewStatus === step.key;

              return (
                <div
                  key={step.key}
                  className="flex flex-col items-center text-center relative z-10 select-none"
                >
                  <div
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center font-black text-xs transition-all duration-300",
                      isCompleted && !isActive
                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-200"
                        : "",
                      isActive
                        ? "bg-brand text-white ring-4 ring-red-100 shadow-md scale-110"
                        : "",
                      !isCompleted && !isActive
                        ? "bg-white text-stone-400 border border-stone-200"
                        : "",
                    )}
                  >
                    {isCompleted && !isActive ? "✓" : step.num}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-black mt-2 transition-colors",
                      isActive
                        ? "text-brand uppercase tracking-wide"
                        : "text-stone-500",
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {reviewStatus === "REJECTED" && (
            <div className="mt-4 p-2 bg-rose-50 border border-rose-100 rounded-xl text-center">
              <span className="text-[11px] font-black text-rose-600 uppercase tracking-widest">
                ⚠️ Candidate Sifted out / Filed to Pool
              </span>
            </div>
          )}
        </div>

        {/* Split Pane: Candidate Profiling vs. Timeline Notes */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Profile Details Column (Lefthand Pane) */}
          <div className="lg:col-span-5 bg-stone-50 border border-stone-200/80 p-5 rounded-[2rem] space-y-4 text-xs">
            <div>
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block mb-0.5">
                Applicant Name
              </span>
              <p className="font-black text-stone-900 text-sm">
                {selectedApp.name}
              </p>
            </div>

            <div>
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block mb-0.5">
                Contact Channels
              </span>
              <p className="font-extrabold text-stone-700">
                {selectedApp.email}
              </p>
              <p className="font-bold text-stone-500 mt-0.5">
                {selectedApp.phone}
              </p>
            </div>

            <div>
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block mb-0.5">
                Target Posting Role
              </span>
              <p className="font-extrabold text-stone-800">
                {selectedApp.job_title}
              </p>
            </div>

            <div>
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block mb-0.5">
                Professional Experience
              </span>
              <p className="font-bold text-stone-850 bg-white border border-stone-150 px-2.5 py-1 rounded-lg mt-1 w-max">
                {selectedApp.experience || "Not Specified"}
              </p>
            </div>

            {selectedApp.linkedin_url && (
              <div>
                <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block mb-1">
                  LinkedIn Profile
                </span>
                <a
                  href={
                    selectedApp.linkedin_url.startsWith("http")
                      ? selectedApp.linkedin_url
                      : `https://${selectedApp.linkedin_url}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand font-black hover:underline flex items-center gap-1 bg-white border border-stone-150 p-2 rounded-xl"
                >
                  <span>Visit Portfolio</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
            {selectedApp.onboarding_token && (
              <div className="bg-emerald-50 border border-emerald-200/80 p-3 rounded-xl">
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block mb-1">
                  Onboarding Access Token
                </span>
                <div className="flex items-center justify-between bg-white border border-emerald-100 rounded-lg p-2 mt-1">
                  <code className="font-mono font-black text-emerald-800 text-sm tracking-widest">
                    {selectedApp.onboarding_token}
                  </code>
                  <button
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const success = await copyToClipboard(
                        selectedApp.onboarding_token || "",
                      );
                      if (success) {
                        showToast("Token copied", "success");
                      } else {
                        showToast("Failed to copy", "error");
                      }
                    }}
                    className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 p-1.5 rounded-md transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                {selectedApp.token_used === 1 ? (
                  <p className="text-[10px] font-bold text-stone-500 mt-2 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />{" "}
                    User account created
                  </p>
                ) : (
                  <p className="text-[10px] font-bold text-amber-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Pending applicant
                    activation
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Cover Letter Panel (Righthand Pane) */}
          <div className="lg:col-span-7 space-y-3">
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block mb-1">
              Motivation Letter & Attached files
            </span>
            <div className="bg-white border rounded-[1.5rem] p-5 text-stone-600 leading-relaxed border-stone-200 max-h-[250px] overflow-y-auto text-xs custom-scrollbar">
              {(() => {
                const text = selectedApp.resume_text;
                if (!text)
                  return (
                    <p className="italic text-stone-400">
                      No application letters entered.
                    </p>
                  );

                const fileRegex = /\[RESUME FILE\]:\s*(\/uploads\/[^\n]+)/;
                const match = text.match(fileRegex);

                if (match) {
                  const fileUrl = match[1];
                  const cleanText = text.replace(fileRegex, "").trim();
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between bg-stone-50 border border-stone-150 rounded-2xl p-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 bg-red-50 rounded-lg text-brand flex-shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-stone-900 truncate">
                              Resume / CV Document
                            </p>
                            <p className="text-[9px] uppercase tracking-wider text-stone-400 font-bold mt-0.5">
                              PDF Format
                            </p>
                          </div>
                        </div>
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-2.5 bg-brand hover:bg-brand-dark text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-xs shrink-0 flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </a>
                      </div>
                      {cleanText && (
                        <div className="pt-3 border-t border-stone-50 whitespace-pre-wrap text-stone-600 text-xs font-medium">
                          {cleanText}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <p className="whitespace-pre-wrap text-xs font-medium">
                    {text}
                  </p>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Updates Form & Selection */}
        <form onSubmit={handleSaveAppReview} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-stone-200">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
                Milestone Phase <span className="text-brand">*</span>
              </label>
              <select
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value as any)}
                className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-xs font-black text-stone-800 focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none cursor-pointer"
              >
                <option value="APPLIED">APPLIED / SOURCED</option>
                <option value="SCREENING">SCREENING / VERIFYING</option>
                <option value="INTERVIEW">SCHEDULED INTERVIEW</option>
                <option value="OFFER_MADE">OFFER PROPOSAL SENT</option>
                <option value="ACCEPTED">OFFER ACCEPTED / ONBOARDED</option>
                <option value="REJECTED">PASSED OVER / ARCHIVED</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-2">
                HR Valuation Notes
              </label>
              <textarea
                rows={2}
                placeholder="Provide technical evaluation core, background results, score card info..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full px-5 py-3.5 bg-stone-50 border border-stone-200 rounded-[1.5rem] text-xs font-bold focus:border-red-200 focus:ring-4 focus:ring-red-50 transition-all outline-none resize-none"
              />
            </div>
          </div>

          {/* HIGH VALUE: AUTOMATED CORRESPONDENCE CORNER */}
          {(() => {
            // Draft template based on reviewStatus
            let subject = "";
            let bodyTemplate = "";

            if (reviewStatus === "INTERVIEW") {
              subject = `Job Interview Invitation - fhtbs HR Recruitment: ${selectedApp.name}`;
              bodyTemplate = `Dear ${selectedApp.name},\n\nThank you for applying for the position of ${selectedApp.job_title} at our company. Your portfolio is impressive.\n\nWe would like to invite you for a Technical Panel Interview:\n- Date: [Fill Date]\n- Time: [Fill Time]\n- Platform: Google Meet\n\nPlease let us know your availability.\n\nWarm Regards,\nHR Recruitment fhtbs ERP`;
            } else if (reviewStatus === "OFFER_MADE") {
              subject = `Employment Agreement Offer - ${selectedApp.job_title}: ${selectedApp.name}`;
              bodyTemplate = `Dear ${selectedApp.name},\n\nCongratulations! Based on our team evaluation, we are pleased to offer you the position of ${selectedApp.job_title}.\n\nWe offer a comprehensive compensation package. Detailed terms and contract attachments can be downloaded on your portal dashboard.\n\nPlease provide your confirmation prior to [Deadline Date].\n\nRegards,\nDirectorate of Human Resources fhtbs ERP`;
            } else if (reviewStatus === "REJECTED") {
              subject = `Job Application Update - fhtbs Recruitment: ${selectedApp.name}`;
              bodyTemplate = `Dear ${selectedApp.name},\n\nThank you for your time and interest in applying for the ${selectedApp.job_title} position at our company.\n\nAfter thorough review, we have decided to proceed with other candidates whose qualifications closely align with current operational requirements.\n\nWe will retain your profile in our talent pool for future opportunities.\n\nBest wishes for your career journey.\n\nBest Regards,\nHR fhtbs ERP`;
            } else if (reviewStatus === "ACCEPTED") {
              subject = `Welcome to fhtbs ERP! Onboarding Checklist: ${selectedApp.name}`;
              bodyTemplate = `Dear ${selectedApp.name},\n\nWelcome to our team! On your first day, please complete your personal documentation at the Staff Service Center.\n\nDay-1 Onboarding Schedule:\n- Time: Starting 08:00 AM\n- Location: Head Office fhtbs ERP\n\nWish you all the best in your new role!\n\nRegards,\nHR Operations`;
            }

            if (!bodyTemplate) return null;

            return (
              <div className="bg-amber-50/50 rounded-2xl border border-amber-200/60 p-4 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-800">
                    <Mail className="w-4 h-4 text-amber-600" />
                    <span>
                      Pre-written Professional Email Template Launcher
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const success = await copyToClipboard(
                        `Subyek: ${subject}\n\n${bodyTemplate}`,
                      );
                      if (success) {
                        showToast(
                          "Communication draft template copied to clipboard!",
                          "success",
                        );
                      } else {
                        showToast("Failed to copy", "error");
                      }
                    }}
                    className="text-[10px] font-black uppercase text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors border border-amber-300/40"
                  >
                    Copy Mail Draft
                  </button>
                </div>

                <div className="bg-white/80 p-3 rounded-lg border border-amber-100 text-[11px] font-mono whitespace-pre-wrap leading-relaxed max-h-[140px] overflow-y-auto text-stone-700">
                  <strong>Subject:</strong> {subject}
                  <br />
                  <br />
                  {bodyTemplate}
                </div>
              </div>
            );
          })()}

          <div className="pt-6 flex space-x-3 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 px-6 bg-stone-150 hover:bg-stone-200 text-stone-700 rounded-full text-xs font-black uppercase tracking-wider transition-all"
            >
              Close
            </button>
            <button
              type="submit"
              className="flex-1 py-3.5 px-6 bg-brand hover:bg-brand-dark text-white rounded-full text-xs font-black uppercase tracking-wider transition-all shadow-lg hover:-translate-y-0.5 active:translate-y-0"
            >
              Apply & Archive Dossier
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
