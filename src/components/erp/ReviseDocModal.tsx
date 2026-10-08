import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { formatIDR } from "@/lib/utils";

export interface ReviseDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  docType: string;
  docNumber: string;
  subtitle?: string;
  status?: string;
  partnerLabel?: string;
  partnerName?: string;
  amount?: number;
  projectName?: string;
  isSubmitting: boolean;
  onRevise: (note: string) => Promise<void> | void;
}

export function ReviseDocModal({
  isOpen,
  onClose,
  docType,
  docNumber,
  subtitle = "RETURN TO DRAFT FOR REVISION",
  status = "DRAFT",
  partnerLabel = "Partner / Client",
  partnerName,
  amount,
  projectName,
  isSubmitting,
  onRevise,
}: ReviseDocModalProps) {
  const [revisionNote, setRevisionNote] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setRevisionNote("");
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionNote.trim()) return;
    await onRevise(revisionNote);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200/60 flex items-center justify-center shrink-0">
            <RotateCcw className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-stone-900 leading-tight">
              Revise {docType}
            </h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>
      }
      contentClassName="p-0 border-t border-stone-100"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {/* Document Info Card */}
        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">
                Document Reference
              </div>
              <div className="text-base font-bold font-mono text-stone-900 mt-0.5">
                {docNumber}
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200/80 shadow-3xs">
              {status}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-stone-600 pt-1 border-t border-stone-200/60">
            {partnerName && (
              <div>
                <span className="text-stone-400 font-bold text-[10px] uppercase tracking-wider block">
                  {partnerLabel}
                </span>
                <span className="font-semibold text-stone-800">{partnerName}</span>
              </div>
            )}
            {projectName && (
              <div>
                <span className="text-stone-400 font-bold text-[10px] uppercase tracking-wider block">
                  Project
                </span>
                <span className="font-semibold text-stone-800">{projectName}</span>
              </div>
            )}
            {amount !== undefined && amount !== null && (
              <div className="col-span-full sm:col-span-1">
                <span className="text-stone-400 font-bold text-[10px] uppercase tracking-wider block">
                  Total Value
                </span>
                <span className="font-bold font-mono text-stone-800">
                  {formatIDR(amount)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Revision Instructions Box */}
        <div className="p-5 bg-rose-50/50 border border-rose-100/80 rounded-2xl flex items-start gap-4 shadow-3xs">
          <div className="w-10 h-10 rounded-xl bg-white border border-rose-200/80 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
          </div>
          <div className="flex-1 space-y-2.5">
            <div>
              <h4 className="text-xs font-bold text-stone-900 mb-0.5">
                Revision Notes & Instructions
              </h4>
              <p className="text-[10px] text-stone-500 leading-relaxed font-medium">
                Provide clear instructions on what needs to be changed before re-submission. This document will be returned to staff for modifications.
              </p>
            </div>

            <textarea
              required
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              placeholder="E.g., Item price is incorrect, update delivery schedule or adjust item specs..."
              className="w-full h-24 p-3 bg-white border border-stone-200 rounded-xl text-xs font-semibold text-stone-850 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 outline-none transition-all shadow-2xs resize-none placeholder:text-stone-400 placeholder:font-normal"
            />
          </div>
        </div>

        {/* Action Controls */}
        <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-3">
          <Button
            variant="secondary"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !revisionNote.trim()}
            className="bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
          >
            {isSubmitting ? "Processing..." : "Submit Revision"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
