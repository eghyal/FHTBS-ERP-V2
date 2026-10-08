import React, { useRef } from "react";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { Modal } from "@/components/ui/Modal";

interface NdpPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  ndp: any;
  project?: any;
}

export const NdpPreviewModal: React.FC<NdpPreviewModalProps> = ({
  isOpen,
  onClose,
  ndp,
  project,
}) => {
  const printDocRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !ndp) return null;

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case "MATERIAL_DELAY":
        return "Material & Component Shortage / Delay";
      case "MACHINE_BREAKDOWN":
        return "Equipment & Machine Breakdown";
      case "QUALITY_REWORK":
        return "Quality Non-Conformance / Rework";
      case "DESIGN_REVISION":
        return "Engineering Clarification & Design Revision";
      case "FORCE_MAJEURE":
        return "External Factor / Force Majeure";
      default:
        return cat;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="NOTICE TO DOWN PROCESS (NDP)"
      maxWidth="5xl"
      contentClassName="p-0 flex flex-col h-[85vh] border-t border-stone-100"
    >
      <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
        <PdfPreviewWrapper>
          <PrintTemplate
            ref={printDocRef}
            documentTitleId="PEMBERITAHUAN PENGHENTIAN PROSES"
            documentTitleEn="NOTICE TO DOWN PROCESS"
            documentNameId="pemberitahuan penghentian proses"
            documentNameEn="notice to down process"
            date={new Date(ndp.created_at || ndp.down_started_at).toLocaleDateString("id-ID", {
              timeZone: "Asia/Jakarta",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
            referenceNumber={ndp.ndp_number}
            documentId={ndp.ndp_number}
            signatureStatus={ndp.status === 'RESOLVED' ? "signed" : "unsigned"}
          >
            {/* Grid Metadata */}
            <div className="grid grid-cols-2 gap-6 mb-6 border-b border-stone-100 pb-4">
              <div>
                <div className="text-[8px] font-bold tracking-widest uppercase text-stone-900 mb-2 border-b border-stone-100 pb-1">
                  Identifikasi Proyek <span className="font-normal text-[7px] text-stone-400">/ PROJECT IDENTIFICATION</span>
                </div>
                <div className="text-xl font-black text-stone-900 mb-1 tracking-tight leading-none">
                  {project?.name || ndp.project_name || "N/A"}
                </div>
                <div className="text-[9px] font-medium text-stone-500 uppercase tracking-widest flex items-center gap-2">
                  <span>SPK: {project?.spk_number || ndp.spk_number || "N/A"}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[8px] font-bold tracking-widest uppercase text-stone-900 mb-2 border-b border-stone-100 pb-1">
                  Konteks Produksi <span className="font-normal text-[7px] text-stone-400">/ PRODUCTION CONTEXT</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-medium mb-1">
                  <span className="text-stone-900 uppercase tracking-widest font-bold text-[8px]">PROSES (STEP):</span>
                  <span className="text-stone-700">{ndp.process_name || "Production Step"}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-medium mb-1">
                  <span className="text-stone-900 uppercase tracking-widest font-bold text-[8px]">WAKTU MULAI (START):</span>
                  <span className="text-stone-700">{new Date(ndp.down_started_at || ndp.created_at).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-medium">
                  <span className="text-stone-900 uppercase tracking-widest font-bold text-[8px]">STATUS:</span>
                  <span className={`font-bold ${ndp.status === 'ACTIVE' ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {ndp.status === 'ACTIVE' ? 'ACTIVE / IN DOWN' : 'RESOLVED / RESUMED'}
                  </span>
                </div>
              </div>
            </div>

            {/* Root Cause Section */}
            <div className="mb-6">
              <div className="text-[8px] font-bold tracking-widest uppercase text-stone-900 mb-3 border-b border-stone-100 pb-1">
                Kategori Akar Masalah <span className="font-normal text-[7px] text-stone-400">/ ROOT CAUSE CATEGORY</span>
              </div>
              <div className="p-3 bg-red-50/50 border border-red-200 rounded-xl text-xs font-bold text-red-700 w-full text-center tracking-wider">
                {getCategoryLabel(ndp.reason_category)}
              </div>
            </div>

            {/* Incident Details */}
            <div className="mb-6">
              <div className="text-[8px] font-bold tracking-widest uppercase text-stone-900 mb-3 border-b border-stone-100 pb-1">
                Detail Kejadian & Catatan Teknis <span className="font-normal text-[7px] text-stone-400">/ INCIDENT DETAIL & ENGINEERING NOTES</span>
              </div>
              <div className="p-4 bg-white border border-stone-200 rounded-xl text-[10px] leading-relaxed text-stone-700 min-h-[90px] whitespace-pre-wrap">
                {ndp.reason_detail || "No detailed notes provided."}
              </div>
            </div>

            {/* Timing Stats */}
            <div className="grid grid-cols-2 gap-4 text-xs mb-8">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                <span className="text-stone-400 block text-[9px] uppercase tracking-widest mb-1">Downtime Impact (Est)</span>
                <span className="font-bold text-stone-800 text-sm">{ndp.estimated_down_hours || 0} Hours</span>
              </div>
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                <span className="text-stone-400 block text-[9px] uppercase tracking-widest mb-1">Actual Downtime</span>
                <span className="font-bold text-stone-800 font-mono text-sm">
                  {ndp.actual_down_minutes ? `${ndp.actual_down_minutes} Minutes` : "In Progress..."}
                </span>
              </div>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-12 mt-12 mb-4">
              <div className="text-center">
                <div className="text-[9px] text-stone-400 mb-16 uppercase tracking-wider">Authorized By / Otorisasi Oleh</div>
                <div className="border-b-2 border-stone-900 pb-1 font-bold text-sm text-stone-900 mx-8">
                  {ndp.authorized_by}
                </div>
                <div className="text-[8px] font-bold text-stone-500 mt-1 uppercase tracking-widest">
                  {ndp.authorized_role || "Production Supervisor"}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-stone-400 mb-16 uppercase tracking-wider">Digital Audit Stamp</div>
                <div className="border-b border-stone-300 pb-1 font-mono text-[10px] text-emerald-700 font-bold mx-8">
                  PIN VERIFIED - {new Date(ndp.created_at).toISOString().split('T')[0]}
                </div>
                <div className="text-[8px] font-bold text-stone-500 mt-1 uppercase tracking-widest">
                  System Security Logging
                </div>
              </div>
            </div>
          </PrintTemplate>
        </PdfPreviewWrapper>
      </div>
    </Modal>
  );
};
