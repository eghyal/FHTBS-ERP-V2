import React, { memo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface GrnReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  completedGrnData: any;
  grnReportRef: React.RefObject<HTMLDivElement | null>;
  isSubmitting: boolean;
  exportGrnPdf: () => void;
  language: string;
}

export const GrnReportModal = memo(function GrnReportModal({
  isOpen,
  onClose,
  completedGrnData,
  grnReportRef,
  isSubmitting,
  exportGrnPdf,
  language,
}: GrnReportModalProps) {
  if (!completedGrnData) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        completedGrnData?.is_reissue
          ? "GRN Re-issue Report"
          : "Goods Receive Note (GRN) Report"
      }
      maxWidth="5xl"
      contentClassName="p-0 flex flex-col h-[85vh] border-t border-stone-100"
    >
      <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
        <PdfPreviewWrapper>
          <PrintTemplate
            ref={grnReportRef}
            documentTitleId="GOODS RECEIVING NOTE"
            documentTitleEn="GOODS RECEIVING NOTE"
            documentNameId="goods receiving note"
            documentNameEn="goods receiving note"
            date={new Date(
              completedGrnData?.created_at || Date.now(),
            ).toLocaleDateString("en-US", {
              timeZone: "Asia/Jakarta",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
            referenceNumber={completedGrnData?.grn_id}
            documentId={completedGrnData?.grn_id}
            signatureStatus="signed"
          >
            {/* PO & Supplier Core Info */}
            <div className="grid grid-cols-2 gap-6 bg-white rounded-2xl p-5 border border-stone-100 mb-6 font-sans">
              <div className="flex flex-col gap-1.5">
                <div className="text-[10px] text-stone-900 uppercase tracking-widest font-bold">
                  Purchase Order
                </div>
                <div className="text-base font-bold text-stone-900">
                  {completedGrnData?.po_number}
                </div>
                <div className="text-[11px] text-stone-500 font-bold">
                  PR Ref: {completedGrnData?.pr_numbers || "-"}
                </div>
                <div className="text-[10px] text-stone-900 font-bold uppercase tracking-widest">
                  Project:{" "}
                  <span className="font-normal text-stone-500">
                    {completedGrnData?.project_ids ||
                      completedGrnData?.project_name ||
                      "-"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 text-right items-end">
                <div className="text-[10px] text-stone-900 uppercase tracking-widest font-bold">
                  Supplier Partner
                </div>
                <div className="text-base font-bold text-stone-800 line-clamp-1">
                  {completedGrnData?.supplier_name}
                </div>
                <div className="text-[10px] font-bold text-emerald-700 bg-white px-2.5 py-1 rounded-md mt-0.5 border border-emerald-150">
                  VERIFIED SOURCING
                </div>
              </div>
            </div>

            {/* Transaction Specifics Grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-6 font-sans w-full relative z-10">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-stone-900 uppercase tracking-widest font-bold">
                  Received Date
                </span>
                <span className="text-sm font-bold text-stone-900">
                  {completedGrnData?.received_date}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-stone-900 uppercase tracking-widest font-bold">
                  QC Status Report
                </span>
                <div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border",
                      completedGrnData?.qc_status === "PASSED"
                        ? "bg-white text-emerald-700 border-emerald-200"
                        : completedGrnData?.qc_status === "REJECTED"
                          ? "bg-white text-rose-700 border-rose-200"
                          : "bg-white text-amber-700 border-amber-200",
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        completedGrnData?.qc_status === "PASSED"
                          ? "bg-emerald-500"
                          : completedGrnData?.qc_status === "REJECTED"
                            ? "bg-rose-500"
                            : "bg-amber-500",
                      )}
                    />
                    {completedGrnData?.qc_status}
                  </span>
                </div>
              </div>
            </div>

            {completedGrnData?.rejected_grn_doc && (
              <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl mb-6 w-full relative z-10">
                <div className="text-[9px] text-rose-500 uppercase tracking-widest font-bold mb-1">
                  Previous Rejected Document Ref
                </div>
                <div className="text-[11px] font-mono font-bold text-rose-700 truncate">
                  {completedGrnData.rejected_grn_doc}
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-dashed border-stone-200 mb-6 w-full" />

            {/* Items Section */}
            <div className="flex-1 min-h-0 flex flex-col justify-start gap-4 mb-6 w-full relative z-10">
              <div>
                <div className="text-[10px] text-stone-900 uppercase tracking-[0.2em] font-bold mb-2.5">
                  CONSIGNED COMPONENTS
                </div>
                <div className="divide-y divide-stone-100 border border-stone-100 rounded-2xl overflow-hidden bg-white">
                  {completedGrnData &&
                    completedGrnData.items &&
                    completedGrnData.items.map((item: any, idx: number) => (
                      <div
                        key={item.id || idx}
                        className="p-4 flex justify-between items-center gap-4 hover:bg-stone-50/40 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-mono font-bold bg-white text-stone-600 px-1.5 py-0.5 rounded inline-block mb-1">
                            {item.item_code}
                          </div>
                          <div className="text-xs font-bold text-stone-900 truncate">
                            {item.item_name}
                          </div>
                          {(item.dimension || item.spec) && (
                            <div className="text-[10px] text-stone-500 mt-0.5 font-medium truncate">
                              {[item.dimension, item.spec]
                                .filter(Boolean)
                                .join(" | ")}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-stone-950 tabular-nums">
                            {item.qty_received}
                          </div>
                          <div className="text-xs uppercase font-bold text-stone-600 mt-0.5">
                            {item.uom}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Remarks */}
              {completedGrnData?.remarks && (
                <div className="p-4 bg-white border border-stone-100 rounded-xl">
                  <div className="text-[9px] text-stone-400 uppercase tracking-widest font-bold mb-1">
                    Consignment Notes
                  </div>
                  <div className="text-xs text-stone-600 font-medium italic line-clamp-3 leading-relaxed">
                    "{completedGrnData.remarks}"
                  </div>
                </div>
              )}
            </div>
          </PrintTemplate>
        </PdfPreviewWrapper>
      </div>

      <div className="p-6 border-t border-stone-100 bg-white flex justify-center gap-4 shrink-0">
        <Button
          variant="secondary"
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl text-sm"
        >
          {language === "id" ? "Tutup" : "Close"}
        </Button>
        <Button
          variant="primary"
          onClick={exportGrnPdf}
          isLoading={isSubmitting}
          className="px-6 py-2.5 rounded-xl text-sm shadow-md"
        >
          {!isSubmitting && <Download className="w-4 h-4" />}
          {language === "id"
            ? isSubmitting
              ? "Mengekspor..."
              : "Ekspor PDF (A4)"
            : isSubmitting
              ? "Generating..."
              : "Export PDF (A4)"}
        </Button>
      </div>
    </Modal>
  );
});
