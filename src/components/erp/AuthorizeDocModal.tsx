import React, { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, ShieldCheck, KeyRound, Loader2 } from "lucide-react";
import { formatIDR, cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { getDailyAuthKey } from "@/utils/auth";

export interface AuthorizeDocModalProps {
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
  onAuthorize: (pin: string) => Promise<void> | void;
  children?: React.ReactNode;
  submitLabel?: string;
  submitVariant?: string;
  submitDisabled?: boolean;
  icon?: React.ReactNode;
  approvalTitle?: string;
  approvalDescription?: string;
  themeVariant?: "emerald" | "amber";
}

export function AuthorizeDocModal({
  isOpen,
  onClose,
  docType,
  docNumber,
  subtitle,
  status = "DRAFT",
  partnerLabel = "Partner / Client",
  partnerName,
  amount,
  projectName,
  isSubmitting,
  onAuthorize,
  children,
  submitLabel,
  submitVariant = "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs",
  submitDisabled = false,
  icon,
  approvalTitle = "Embedded Smart e-Approval",
  approvalDescription,
  themeVariant = "emerald",
}: AuthorizeDocModalProps) {
  const { user } = useAuth();
  const [authPin, setAuthPin] = useState("");
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setAuthPin("");
    } else {
      setAuthPin("");
      const timer = setTimeout(() => {
        pinInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, user?.username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authPin.trim() || isSubmitting || submitDisabled) return;
    await onAuthorize(authPin);
  };

  const isAmber = themeVariant === "amber";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title={
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0",
            isAmber ? "bg-amber-50 border-amber-200/60" : "bg-emerald-50 border-emerald-200/60"
          )}>
            {icon || <ShieldCheck className={cn("w-5 h-5", isAmber ? "text-amber-600" : "text-emerald-600")} />}
          </div>
          <div>
            <h3 className="text-base font-bold text-stone-900 leading-tight">
              Authorize {docType}
            </h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">
              {subtitle || `${docType.toUpperCase()} DIGITAL RELEASE & e-APPROVAL`}
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
            <span className={cn(
              "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border shadow-3xs",
              isAmber ? "bg-amber-50 text-amber-700 border-amber-200/80" : "bg-emerald-50 text-emerald-700 border-emerald-200/80"
            )}>
              {status}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-stone-600 pt-2 border-t border-stone-200/60">
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
                <span className={cn("font-bold font-mono", isAmber ? "text-amber-700" : "text-emerald-700")}>
                  {formatIDR(amount)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Custom Form Content */}
        {children && (
          <div>
            {children}
          </div>
        )}

        {/* Embedded e-Approval Box */}
        <div className={cn(
          "p-5 border rounded-2xl flex items-start gap-4 shadow-3xs",
          isAmber ? "bg-amber-50/50 border-amber-200/80" : "bg-emerald-50/50 border-emerald-100"
        )}>
          <div className={cn(
            "w-10 h-10 rounded-xl bg-white border flex items-center justify-center shrink-0 shadow-2xs mt-0.5",
            isAmber ? "border-amber-200" : "border-emerald-200/80"
          )}>
            <CheckCircle2 className={cn("w-5 h-5", isAmber ? "text-amber-600" : "text-emerald-600")} />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h4 className="text-xs font-bold text-stone-900 mb-0.5">
                {approvalTitle}
              </h4>
              <p className="text-[10px] text-stone-500 leading-relaxed font-medium">
                {approvalDescription || `Masukkan 6-digit Daily Auth Key akun Anda untuk menandatangani dan mengotorisasi ${docType} secara digital.`}
              </p>
            </div>

            <div className="relative max-w-xs">
              <KeyRound className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={pinInputRef}
                type="text"
                maxLength={6}
                required
                autoComplete="off"
                disabled={isSubmitting}
                value={authPin}
                onChange={(e) => setAuthPin(e.target.value.toUpperCase())}
                placeholder="6 digit key"
                className={cn(
                  "w-full pl-10 pr-4 py-2.5 bg-white border border-stone-200 rounded-xl text-center text-sm font-mono font-bold tracking-[0.4em] text-stone-900 outline-none transition-all shadow-2xs placeholder:tracking-normal placeholder:font-sans placeholder:text-stone-400 disabled:bg-stone-100 disabled:text-stone-400",
                  isAmber ? "focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10" : "focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                )}
              />
            </div>
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
            disabled={isSubmitting || !authPin.trim() || submitDisabled}
            className={cn("flex items-center gap-2", submitVariant)}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              submitLabel || "Authorize & Release"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
