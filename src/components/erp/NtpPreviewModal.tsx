import React, { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { generatePDF } from "@/lib/pdfGenerator";
import { Download, ShieldCheck } from "lucide-react";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";

interface NtpPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  ntp: any;
}

export const NtpPreviewModal: React.FC<NtpPreviewModalProps> = ({
  isOpen,
  onClose,
  project,
  ntp,
}) => {
  const { language } = useLanguage();
  const { showToast } = useToast();
  const printDocRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!project || !ntp) return null;

  const handleExportPdf = async () => {
    if (!printDocRef.current) return;
    setIsExporting(true);
    try {
      await generatePDF(
        printDocRef.current,
        `NTP_${ntp.ntp_number || project.id}.pdf`,
      );
      showToast("Notice to Proceed PDF generated", "success");
    } catch (err) {
      console.error(err);
      showToast("PDF generation failed", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const issueDateStr = ntp.created_at
    ? new Date(ntp.created_at).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : new Date().toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

  const deadlineRaw =
    project.due_date ||
    project.deadline ||
    project.target_due_date ||
    project.project_due_date ||
    ntp.due_date ||
    "";

  const deadlineFormattedId = deadlineRaw
    ? new Date(deadlineRaw).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "Sesuai Kesepakatan / Per Schedule";

  const deadlineFormattedEn = deadlineRaw
    ? new Date(deadlineRaw).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      })
    : "Per Agreed Schedule";

  const refNo = ntp.ntp_number || ntp.id || "SPK/NTP-DRAFT";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      title="Notice to Proceed (NTP)"
      contentClassName="p-0 flex flex-col h-[85vh] bg-stone-100 border-t border-stone-100"
    >
      <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
        <PdfPreviewWrapper>
        <PrintTemplate
          ref={printDocRef}
          documentTitleId="SURAT PERINTAH KERJA (SPK)"
          documentTitleEn="NOTICE TO PROCEED & PROJECT CHARTER"
          documentNameId="surat perintah kerja resmi"
          documentNameEn="formal notice to proceed"
          date={issueDateStr}
          referenceNumber={refNo}
          documentId={refNo}
          isDraft={
            !ntp.ntp_number ||
            ntp.status === "DRAFT" ||
            ntp.status === "DRAFTED" ||
            ntp.status === "PENDING"
          }
        >
          {/* Section 1: Recipient & Project Charter Info Block */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
              <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1.5 flex items-center justify-between">
                <span>Unit Penerima Target <span className="font-normal text-stone-400">/ Target Recipient Unit</span></span>
              </div>
              <div className="text-xs font-black text-stone-900 uppercase tracking-tight">
                DIVISI OPERASIONAL & LOGISTIK
              </div>
              <div className="text-[10px] text-stone-500 font-bold uppercase tracking-wide mt-0.5">
                / Operational & Logistics Division
              </div>
              <div className="text-[11px] text-stone-700 font-semibold mt-2 pt-2 border-t border-stone-200 flex items-center justify-between">
                <span>Digital Facility - Production Control Unit</span>
                <span className="text-[9px] text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">Mandat Aktif</span>
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
              <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1.5 flex items-center justify-between">
                <span>Subjek Proyek <span className="font-normal text-stone-400">/ Subject Project</span></span>
                <span className="text-[9px] font-mono font-bold bg-white text-stone-900 border border-stone-300 px-1.5 py-0.5 rounded whitespace-nowrap">
                  ID: {project.id}
                </span>
              </div>
              <div className="text-xs font-black text-stone-900 uppercase tracking-tight truncate" title={project.name}>
                {project.name}
              </div>
              <div className="mt-2 pt-2 border-t border-stone-200 grid grid-cols-2 gap-2 text-left">
                <div>
                  <div className="text-[9px] text-stone-400 font-bold uppercase tracking-widest">Kuantitas / Qty</div>
                  <div className="text-xs font-black text-stone-900 font-mono mt-0.5 whitespace-nowrap">
                    {project.qty || project.quotation_qty || 1} {project.uom || "Unit"}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-stone-400 font-bold uppercase tracking-widest">Sales Ref / Quo</div>
                  <div className="text-xs font-bold text-stone-800 font-mono mt-0.5 whitespace-nowrap truncate" title={ntp.quotation_number || project.quotation_id || "-"}>
                    {ntp.quotation_number || project.quotation_id || "-"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Authorization Declaration & Execution Mandate */}
          <div className="mb-4 p-3.5 bg-white text-stone-900 rounded-lg border border-stone-200 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-600">
                Persetujuan Operasional Resmi{" "}
                <span className="font-normal text-stone-400">
                  / Formal Operational Clearance
                </span>
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider bg-stone-100 text-stone-800 border border-stone-300 px-2 py-0.5 rounded">
                Mandat Eksekusi Resmi
              </span>
            </div>

            <div className="text-sm font-black text-stone-900 uppercase tracking-tight leading-snug">
              Eksekusi Wajib Untuk Proyek <span className="font-normal text-stone-500">/ Mandatory Execution for Project:</span>{" "}
              <span className="font-mono bg-stone-100 px-2 py-0.5 rounded border border-stone-300 text-stone-900 whitespace-nowrap">
                {project.id}
              </span>
            </div>

            <div className="text-xs mt-2 leading-relaxed">
              <p className="text-stone-800 font-medium leading-snug">
                • Tim operasional dengan ini diberi wewenang penuh untuk memulai aktivitas manufaktur, pengadaan (PR/PO), dan alur logistik. Semua protokol pelaksanaan wajib mematuhi penawaran harga, toleransi mutu, serta spesifikasi proyek yang dirujuk.
              </p>
              <p className="text-stone-500 font-normal text-[10px] leading-tight mt-1 italic">
                / Operational teams are fully authorized to initiate manufacturing, procurement (PR/PO), and logistics activities. All execution protocols must strictly adhere to referenced quotation, quality tolerances, and technical specifications.
              </p>
            </div>

            {/* Target Deadline Strip */}
            <div className="mt-3 p-2.5 bg-stone-50 border border-stone-200 rounded-md grid grid-cols-2 gap-4 items-center">
              <div>
                <div className="text-[9px] uppercase font-black tracking-widest text-stone-500">
                  Target Batas Waktu Penyelesaian SPK <span className="font-normal text-stone-400">/ Project Execution Deadline</span>
                </div>
                <div className="text-xs font-black text-stone-900 font-mono mt-0.5 flex items-baseline gap-1.5 flex-wrap">
                  <span className="whitespace-nowrap">{deadlineFormattedId}</span>
                  <span className="text-[10px] font-bold text-stone-500 font-sans whitespace-nowrap">
                    ({deadlineFormattedEn})
                  </span>
                </div>
              </div>
              <div className="text-right border-l border-stone-200 pl-4">
                <div className="text-[9px] uppercase font-black tracking-widest text-stone-500">
                  Tanggal Terbit / Effective Date
                </div>
                <div className="text-xs font-bold text-stone-900 font-mono mt-0.5 whitespace-nowrap">
                  {issueDateStr}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Project Specifications Summary Strip */}
          <div className="mb-4 bg-stone-50 border border-stone-200 rounded-lg p-2.5">
            <div className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1.5">
              Parameter Eksekusi Proyek <span className="font-normal text-stone-400">/ Project Execution Parameters</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-left">
              <div>
                <div className="text-[8.5px] font-bold text-stone-400 uppercase tracking-wider">Work Center / Fasilitas</div>
                <div className="text-[10.5px] font-bold text-stone-800 mt-0.5 truncate">
                  Pusat Manufaktur & Perakitan
                </div>
              </div>
              <div>
                <div className="text-[8.5px] font-bold text-stone-400 uppercase tracking-wider">Acuan Teknis / Routing</div>
                <div className="text-[10.5px] font-bold text-stone-800 mt-0.5 truncate">
                  BOP Routing & Approved BOM
                </div>
              </div>
              <div>
                <div className="text-[8.5px] font-bold text-stone-400 uppercase tracking-wider">Standar Inspeksi / QC</div>
                <div className="text-[10.5px] font-bold text-stone-800 mt-0.5 truncate">
                  Toleransi Mutu CV. Batu Emas Group
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Workflow Directives & Protocols */}
          <div className="mb-4">
            <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-2 flex items-center justify-between">
              <span>
                Arahan Alur Kerja & Protokol Standar{" "}
                <span className="font-normal text-stone-500">
                  / Workflow Directives & Protocols
                </span>
              </span>
              <span className="text-[9px] font-mono text-stone-400 font-normal uppercase">
                3 Standard SOP Stages
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {[
                {
                  step: "01",
                  titleId: "ALOKASI SUMBER DAYA & PENGADAAN MATERIAL",
                  titleEn: "Resource Allocation & Procurement",
                  descId: "Tim pengadaan segera menerbitkan Permintaan Pembelian (PR) untuk seluruh material & komponen dalam Bill of Materials (BOM) yang telah disetujui.",
                  descEn: "Procurement teams to initiate Purchase Requests for all items listed in the approved BOM.",
                },
                {
                  step: "02",
                  titleId: "PENJADWALAN PRODUKSI & ALOKASI MESIN",
                  titleEn: "Production Scheduling & Machine Allocation",
                  descId: "Manajer lantai produksi menetapkan stasiun kerja prioritas, alokasi kapasitas mesin, dan jadwal eksekusi WOT.",
                  descEn: "Manufacturing floor managers to designate priority work centers, machine capacity allocation, and WOT schedules.",
                },
                {
                  step: "03",
                  titleId: "SINKRONISASI KONTROL KUALITAS (QC)",
                  titleEn: "Quality Control & Tolerance Sync",
                  descId: "Protokol inspeksi dimensi, uji ketahanan, dan kriteria penerimaan disinkronkan secara ketat dengan toleransi teknis proyek.",
                  descEn: "Inspection protocols and testing criteria must be strictly synchronized with project technical tolerances.",
                },
              ].map((d) => (
                <div
                  key={d.step}
                  className="flex items-start gap-3 p-2.5 bg-white rounded-lg border border-stone-200"
                >
                  <div className="w-7 h-7 rounded bg-stone-100 border border-stone-300 text-stone-900 flex items-center justify-center text-xs font-mono font-black shrink-0">
                    {d.step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-[11px] font-black text-stone-900 uppercase tracking-wide">
                        {d.titleId}
                      </span>
                      <span className="text-[9.5px] text-stone-500 font-normal italic">
                        / {d.titleEn}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-stone-800 font-medium mt-0.5 leading-snug">
                      {d.descId}
                    </p>
                    <p className="text-[9.5px] text-stone-500 font-normal mt-0.5 leading-tight italic">
                      / {d.descEn}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 5: Compliance Remarks */}
          <div className="mb-4 p-3 bg-stone-50 rounded-lg border border-stone-200">
            <h4 className="text-[10px] font-black text-stone-900 uppercase tracking-widest mb-1 flex items-center justify-between">
              <span>
                Catatan Kepatuhan Operasional{" "}
                <span className="font-normal text-stone-500">
                  / Compliance Remarks
                </span>
              </span>
              <span className="text-[8.5px] font-mono text-stone-400">SOP-REF: STD/OPS/2026</span>
            </h4>
            <p className="text-[11px] text-stone-800 font-semibold italic leading-relaxed">
              "{project.remarks ||
                "Standard operating procedures (SOP) apply throughout the project lifecycle. No additional operational constraints noted."}"
            </p>
          </div>
        </PrintTemplate>
</PdfPreviewWrapper>
      </div>
      <div className="p-6 border-t border-stone-100 bg-white flex justify-center gap-4">
        <Button
          variant="secondary"
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl text-sm"
        >
          {language === "id" ? "Tutup" : "Close"}
        </Button>
        <Button
          variant="primary"
          onClick={handleExportPdf}
          isLoading={isExporting}
          className="px-6 py-2.5 rounded-xl text-sm shadow-md"
        >
          {!isExporting && <Download className="w-4 h-4" />}
          {language === "id"
            ? isExporting
              ? "Mengekspor..."
              : "Ekspor PDF (A4)"
            : isExporting
              ? "Generating..."
              : "Export PDF (A4)"}
        </Button>
      </div>
    </Modal>
  );
};
