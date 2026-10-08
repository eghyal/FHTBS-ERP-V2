import React, { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { generatePDF } from "@/lib/pdfGenerator";
import { Download, ShieldCheck, QrCode } from "lucide-react";
import { formatIDR, cn } from "@/lib/utils";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";

interface BomPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  bomRows: any[];
  totalCost: number;
  bopSteps?: any[];
}

export const BomPreviewModal: React.FC<BomPreviewModalProps> = ({
  isOpen,
  onClose,
  project,
  bomRows,
  totalCost,
  bopSteps,
}) => {
  const { language } = useLanguage();
  const { showToast } = useToast();
  const printDocRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!project) return null;

  const handleExportPdf = async () => {
    if (!printDocRef.current) return;
    setIsExporting(true);
    try {
      await generatePDF(printDocRef.current, `BOM_Price_Est_${project.id}.pdf`);
      showToast("BOM Price Estimate PDF exported", "success");
    } catch (err: any) {
      console.error(err);
      showToast(
        `PDF generation failed: ${err.message || String(err)}`,
        "error",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const issueDateStr = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const activeRows = bomRows.filter(
    (r) => r.item_code && r.item_code.trim() !== "",
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      title="BOM Price Estimate Preview"
      contentClassName="p-0 flex flex-col h-[85vh] bg-stone-100 border-t border-stone-100"
    >
      <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
        <PdfPreviewWrapper>
<PrintTemplate
          ref={printDocRef}
          documentTitleId="ESTIMASI BILL OF MATERIALS (BOM)"
          documentTitleEn="BILL OF MATERIALS ESTIMATION"
          documentNameId="dokumen penaksiran harga"
          documentNameEn="cost estimation document"
          date={issueDateStr}
          referenceNumber={`BOM-${project.id}`}
          documentId={`BOM-${project.id}`}
          isDraft={project.status === "DRAFT"}
        >
          <div className="grid grid-cols-2 gap-6 mb-10">
            <div>
              <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-3">
                Nama Proyek{" "}
                <span className="text-stone-500 font-normal">
                  / Project Name
                </span>
              </div>
              <div className="text-xl font-black text-stone-900 uppercase">
                {project.name}
              </div>
              <div className="text-sm text-stone-900 mt-3 font-bold">
                Klien{" "}
                <span className="text-stone-500 font-normal">/ Client</span>:{" "}
                <span className="font-extrabold text-stone-850">
                  {project.customer || "N/A"}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-3">
                Status Proyek{" "}
                <span className="text-stone-500 font-normal">
                  / Project Status
                </span>
              </div>
              <div className="text-lg font-black text-stone-900 uppercase">
                {project.status}
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="flex-1">
            <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-3 ml-1">
              Rincian Estimasi Biaya Komponen{" "}
              <span className="text-stone-500 font-normal">
                / Detailed Component Cost Breakdown
              </span>
            </div>
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-stone-300 bg-white">
                  <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-xs">
                    SKU
                    <div className="text-[10.5px] font-bold text-stone-500 tracking-widest mt-1">
                      CODE
                    </div>
                  </th>
                  <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-xs">
                    Nama Item
                    <div className="text-[10.5px] font-bold text-stone-500 tracking-widest mt-1">
                      ITEM NAME
                    </div>
                  </th>
                  <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-xs w-16">
                    Jml
                    <div className="text-[10.5px] font-bold text-stone-500 tracking-widest mt-1">
                      QTY
                    </div>
                  </th>
                  <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-20">
                    Sat
                    <div className="text-[10.5px] font-bold text-stone-500 tracking-widest mt-1">
                      UOM
                    </div>
                  </th>
                  <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-xs w-32">
                    Harga Unit (Rp)
                    <div className="text-[10.5px] font-bold text-stone-500 tracking-widest mt-1">
                      UNIT PRICE
                    </div>
                  </th>
                  <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-xs w-32">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-150">
                {activeRows.map((row: any, i: number) => {
                  const qty = Number(row.qty || 0);
                  const price = Number(row.unit_price || 0);

                  // Extract BOP node allocation if bopSteps are passed
                  let assignedNodeNames: string[] = [];
                  if (bopSteps && bopSteps.length > 0) {
                    bopSteps.forEach((step: any) => {
                      if (step.node_type === "PRODUCT" && step.bom_allocations) {
                        try {
                          const allocs = typeof step.bom_allocations === "string"
                            ? JSON.parse(step.bom_allocations)
                            : step.bom_allocations;
                          if (Array.isArray(allocs)) {
                            allocs.forEach((a: any) => {
                              if (
                                (a.bom_id && (a.bom_id === row.id || a.bom_id === row.item_id || (row.item_code && a.bom_id.toUpperCase() === row.item_code.toUpperCase()))) ||
                                (a.bom_name && row.name && a.bom_name.toLowerCase().trim() === row.name.toLowerCase().trim())
                              ) {
                                assignedNodeNames.push(`#${step.step_sequence || 0} ${step.process_name || "Product Node"}`);
                              }
                            });
                          }
                        } catch (e) {}
                      }
                    });
                  }

                  return (
                    <tr
                      key={i}
                      className="align-middle border-b border-stone-200"
                    >
                      <td className="py-3 px-3 font-mono font-bold text-stone-850 uppercase text-sm">
                        {row.item_code}
                      </td>
                      <td className="py-3 px-3 text-stone-900 font-extrabold uppercase tracking-tight text-sm">
                        <div>{row.name}</div>
                        {(row.dimension || row.spec || row.reference) && (
                          <div className="mt-0.5 text-[11px] font-medium text-stone-600 font-sans flex items-center gap-1.5 flex-wrap">
                            {row.dimension && <span className="text-stone-500 font-mono text-[10px]">Dim: {row.dimension}</span>}
                            {row.spec && <span className="text-stone-500 text-[10px]">Spec: {row.spec}</span>}
                            {row.reference && (
                              <span className="text-stone-800 font-bold bg-stone-100 px-1.5 py-0.5 rounded text-[10px] border border-stone-200">
                                Ref: {row.reference}
                              </span>
                            )}
                          </div>
                        )}
                        {bopSteps && bopSteps.length > 0 && (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap font-sans">
                            {assignedNodeNames.length > 0 ? (
                              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                {language === "id" ? "Proses" : "Process"}: {assignedNodeNames.join(", ")}
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                {language === "id" ? "Belum Ter-assign pada Node Produk" : "Unassigned to Product Node"}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-stone-900 text-sm">
                        {qty}
                      </td>
                      <td className="py-3 px-3 text-center text-stone-700 font-extrabold uppercase tracking-wider text-xs">
                        {row.unit || row.uom || "PCS"}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-stone-650 text-sm">
                        {formatIDR(price)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-stone-900 text-sm">
                        {formatIDR(qty * price)}
                      </td>
                    </tr>
                  );
                })}
                {activeRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center text-xs text-stone-400 font-medium italic"
                    >
                      {language === "id"
                        ? "Tidak ada item BOM terisi."
                        : "No BOM items specified."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <div className="w-[400px] space-y-2">
                <div className="flex justify-between items-center text-xs text-stone-900 font-bold uppercase tracking-wider px-3 gap-2">
                  <span className="whitespace-nowrap">
                    {language === "id" ? "Subtotal DPP" : "Subtotal DPP"}{" "}
                    <span className="text-[10px] font-bold text-stone-500">
                      / Gross
                    </span>
                  </span>
                  <span className="font-mono text-stone-950 whitespace-nowrap">
                    {formatIDR(Math.round(totalCost / 1.12))}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-stone-900 font-bold uppercase tracking-wider px-3 gap-2">
                  <span className="whitespace-nowrap">
                    PPN{" "}
                    <span className="text-[10px] font-bold text-stone-500">
                      / VAT (12%)
                    </span>
                  </span>
                  <span className="font-mono text-stone-950 whitespace-nowrap">
                    + {formatIDR(Math.round((totalCost / 1.12) * 0.12))}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-white text-stone-900 p-3 rounded-xl border border-stone-200 mt-1.5 shadow-xs gap-3">
                  <span className="text-xs font-black uppercase tracking-wider text-stone-900 whitespace-nowrap">
                    Total Estimasi{" "}
                    <span className="font-bold text-[9px] text-stone-500 font-normal">
                      / Est Grand Total
                    </span>
                  </span>
                  <span className="text-sm font-black tracking-tight font-mono text-stone-900 whitespace-nowrap">
                    {formatIDR(totalCost)}
                  </span>
                </div>
              </div>
            </div>
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
