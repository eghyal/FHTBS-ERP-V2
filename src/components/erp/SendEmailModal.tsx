import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Mail, MessageCircle, Send, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SendEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  docType: string;
  docNumber: string;
  defaultRecipientEmail?: string;
  defaultRecipientPhone?: string;
  defaultRecipientName?: string;
  defaultSubject: string;
  defaultBody: string;
  onSend: (data: { to: string; subject: string; body: string }) => Promise<void>;
  onDownloadPdf?: () => Promise<void>;
}

export function SendEmailModal({
  isOpen,
  onClose,
  docType,
  docNumber,
  defaultRecipientEmail = "",
  defaultRecipientPhone = "",
  defaultRecipientName = "",
  defaultSubject,
  defaultBody,
  onSend,
  onDownloadPdf
}: SendEmailModalProps) {
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isSubmittingWa, setIsSubmittingWa] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const formatWhatsAppNumber = (phone: string) => {
    if (!phone) return "";
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("0")) {
      cleaned = "62" + cleaned.substring(1);
    }
    return cleaned;
  };

  const handleEmailClick = async () => {
    setIsSubmittingEmail(true);
    try {
      if (onDownloadPdf) {
        setIsDownloadingPdf(true);
        try { await onDownloadPdf(); } catch(e) {}
        setIsDownloadingPdf(false);
      }
      await onSend({
        to: defaultRecipientEmail,
        subject: defaultSubject,
        body: defaultBody
      });
    } finally {
      setIsSubmittingEmail(false);
      onClose();
    }
  };

  const handleWaClick = async () => {
    setIsSubmittingWa(true);
    try {
      if (onDownloadPdf) {
        setIsDownloadingPdf(true);
        try { await onDownloadPdf(); } catch(e) {}
        setIsDownloadingPdf(false);
      }
      const waNumber = formatWhatsAppNumber(defaultRecipientPhone);
      const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(defaultBody)}`;
      const a = document.createElement("a");
      a.href = waUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setIsSubmittingWa(false);
      onClose();
    }
  };

  const hasEmail = Boolean(defaultRecipientEmail?.trim());
  const hasPhone = Boolean(defaultRecipientPhone?.trim());

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center shrink-0">
            <Send className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-stone-900 leading-tight">
              Send Document
            </h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">
              {docType.toUpperCase()} - {docNumber}
            </p>
          </div>
        </div>
      }
      contentClassName="p-0 border-t border-stone-100"
    >
      <div className="p-6 space-y-6">
        
        {/* Info Box */}
        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900 leading-relaxed">
            <span className="font-semibold block mb-1">Forward to Partner</span>
            This document has been authorized. You can share this document directly with <strong>{defaultRecipientName || (docType === "Quotation" ? "Customer" : "Supplier")}</strong>. The PDF document will be <strong>automatically downloaded</strong> for you to manually attach to your email or WhatsApp message.
          </div>
        </div>

        {/* Action Options */}
        <div className="flex items-stretch gap-3">
          <Button
            type="button"
            onClick={handleEmailClick}
            disabled={isSubmittingEmail || isSubmittingWa || isDownloadingPdf}
            className={cn(
              "flex-1 flex items-center justify-center gap-2.5 py-3 h-auto rounded-xl shadow-xs transition-all",
              hasEmail ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-blue-300 text-white cursor-not-allowed"
            )}
          >
            {(isSubmittingEmail || isDownloadingPdf) ? (
              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
            ) : (
              <Mail className="w-5 h-5 shrink-0" />
            )}
            <div className="flex flex-col items-start text-left min-w-0">
              <span className="font-semibold text-sm leading-tight">
                Send via Email
              </span>
              <span className="text-[10px] opacity-80 font-medium truncate w-full max-w-[180px]">
                {hasEmail ? defaultRecipientEmail : 'Not Found'}
              </span>
            </div>
          </Button>

          <Button
            type="button"
            onClick={handleWaClick}
            disabled={isSubmittingEmail || isSubmittingWa || isDownloadingPdf}
            title={hasPhone ? `Send via WhatsApp (${defaultRecipientPhone})` : 'Send via WhatsApp'}
            className={cn(
              "w-16 flex-shrink-0 flex items-center justify-center rounded-xl shadow-xs transition-all",
              hasPhone ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-emerald-300 text-white cursor-not-allowed"
            )}
          >
            {(isSubmittingWa && !isDownloadingPdf) ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
              </svg>
            )}
          </Button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-stone-100 flex items-center justify-end bg-stone-50">
        <Button
          variant="secondary"
          type="button"
          onClick={onClose}
          disabled={isSubmittingEmail || isSubmittingWa}
          className="hover:bg-stone-200"
        >
          Close
        </Button>
      </div>
    </Modal>
  );
}
