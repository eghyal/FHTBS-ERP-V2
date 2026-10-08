import React, { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { generatePDF } from "@/lib/pdfGenerator";
import { Download, QrCode, FolderKanban, ShieldCheck, Printer, Calculator } from "lucide-react";
import { formatIDR, formatIDRWithDecimals } from "@/lib/utils";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { calculateFinancialBreakdown } from "@/lib/financialEngine";

interface QuotationPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotation: any;
  onCreateProject?: (quotation: any) => void;
  onAuthorize?: (quotation: any) => void;
  onOpenReceipt?: (quotation: any) => void;
  isPrintModeHidden?: boolean;
  exportPdfRef?: React.MutableRefObject<any>;
}

// Precise business helper to calculate offset with Saturday & Sunday skipping
export const calculateWorkingDaysLimit = (
  startDateStr: string,
  workingDays: number,
): string => {
  const parsed = startDateStr ? new Date(startDateStr) : new Date();
  const date = isNaN(parsed.getTime()) ? new Date() : parsed;
  let daysToAdd = Math.min(Math.max(0, Number(workingDays) || 0), 365);
  let guard = 0;
  while (daysToAdd > 0 && guard < 600) {
    guard++;
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      // Sunday=0, Saturday=6
      daysToAdd--;
    }
  }
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

export const QuotationPreviewModal: React.FC<QuotationPreviewModalProps> = ({
  isOpen,
  onClose,
  quotation,
  onCreateProject,
  onAuthorize,
  onOpenReceipt,
  isPrintModeHidden,
  exportPdfRef,
}) => {
  const { language } = useLanguage();
  const { showToast } = useToast();
  const internalPrintDocRef = useRef<HTMLDivElement>(null);
  const printDocRef = exportPdfRef || internalPrintDocRef;
  const [isExporting, setIsExporting] = useState(false);

  if (!quotation) return null;

  // Simple localized translations
  const dict: Record<string, Record<string, string>> = {
    en: {
      quotation: "OFFICIAL QUOTATION",
      validity: "Validity period",
      preparedFor: "PREPARED FOR",
      date: "Date Issued",
      refNo: "Quotation Reference",
      subject: "PROJECT TITLE",
      grandTotal: "Grand Total (IDR)",
      officialHeader: "Official Document - Validated online",
      officialFooter:
        "This document is an official price quotation. Confidential information for recipient.",
      terms: "Terms & Additional Remarks",
      businessDays: "working days",
      termsTitle: "GENERAL TERMS & CONDITIONS",
      validityDays: "Validity",
      status: "Status",
    },
    id: {
      quotation: "SURAT PENAWARAN RESMI",
      validity: "Masa berlaku",
      preparedFor: "DITUJUKAN KEPADA",
      date: "Tanggal Terbit",
      refNo: "Referensi Penawaran",
      subject: "DESKRIPSI PEKERJAAN",
      grandTotal: "Total Nominal (IDR)",
      officialHeader: "Dokumen Resmi - Tervalidasi sistem online",
      officialFooter:
        "Dokumen ini adalah penawaran harga resmi. Informasi rahasia untuk penerima.",
      terms: "Ketentuan & Syarat Tambahan",
      businessDays: "hari kerja",
      termsTitle: "SYARAT & KETENTUAN UMUM",
      validityDays: "Validitas",
      status: "Status",
    },
  };

  const tLocal = (key: string) => {
    return dict[language]?.[key] || dict["en"][key];
  };

  const handleExportPdf = async () => {
    if (!printDocRef.current) return;
    setIsExporting(true);
    try {
      await generatePDF(
        printDocRef.current,
        `Quotation_${quotation.quotation_number}.pdf`,
      );
      showToast("Quotation PDF generated successfully", "success");
    } catch (err) {
      console.error(err);
      showToast("PDF generation failed", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const breakdown = calculateFinancialBreakdown({
    items: quotation.items?.map((item: any) => ({
      qty: Number(item.qty || 1),
      unit_price: Number(item.unit_price || 0),
    })),
    grossAmount: quotation.gross_amount,
    discountRate: quotation.discount_rate || 0,
    taxRate: quotation.tax_rate ?? 12,
    pphRate: quotation.pph_rate ?? 0,
    taxScheme: quotation.tax_scheme || (quotation.tax_rate > 0 ? "DPP_NILAI_LAIN" : "NON_PKP"),
    dpp: quotation.dpp,
    roundingFactor: quotation.rounding_factor,
    grandTotal: quotation.grand_total || quotation.amount,
  });

  const baseSubtotal = breakdown.grossAmount;
  const discountDisp = breakdown.discountAmount;
  const subtotalDisp = breakdown.dpp;
  const dppNilaiLainDisp = breakdown.dppNilaiLain;
  const taxDisp = breakdown.ppnAmount;
  const pphDisp = breakdown.pphAmount;
  const roundingFactor = breakdown.roundingFactor;
  const formattedAmount = formatIDRWithDecimals(breakdown.grandTotal, 2);
  const issueDateStr = quotation.created_at
    ? new Date(quotation.created_at).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : new Date().toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
  const validityLimit = calculateWorkingDaysLimit(
    quotation.created_at || new Date().toISOString(),
    quotation.validity_days || 20,
  );

  const printContent = (
    <PdfPreviewWrapper>
      <PrintTemplate
        ref={printDocRef}
            documentTitleId="SURAT PENAWARAN RESMI"
            documentTitleEn="OFFICIAL QUOTATION"
            documentNameId="penawaran harga resmi"
            documentNameEn="official price quotation"
            date={issueDateStr}
            referenceNumber={quotation.quotation_number}
            documentId={quotation.quotation_number || quotation.id}
            isDraft={
              quotation.status !== "APPROVED" && quotation.status !== "PROCESSED"
            }
          >
            <div className="grid grid-cols-2 gap-6 mb-5">
              <div>
                <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-1.5">
                  Ditujukan Kepada{" "}
                  <span className="text-stone-500 font-normal">
                    / Prepared For
                  </span>
                </div>
                <div className="text-xl font-black text-stone-900 uppercase">
                  {quotation.customer_name}
                </div>
                <div className="text-xs text-stone-600 mt-1 font-bold">
                  Corporate Client & Commercial Partner
                </div>
                {(quotation.customer_npwp || quotation.npwp_tax_id) && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-mono font-bold text-stone-800 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                    <span className="font-sans text-[9px] uppercase tracking-wider text-stone-500 font-black">
                      NPWP:
                    </span>
                    {quotation.customer_npwp || quotation.npwp_tax_id}
                  </div>
                )}
              </div>
              <div className="text-right space-y-2">
                <div>
                  <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-1">
                    Masa Berlaku{" "}
                    <span className="text-stone-500 font-normal">/ Validity</span>
                  </div>
                  <div className="text-base font-black text-stone-900">
                    {validityLimit}
                  </div>
                  <div className="text-xs text-stone-600 uppercase tracking-wider font-bold">
                    ({quotation.validity_days || 20} Hari Kerja / Business Days)
                  </div>
                </div>
                {(quotation.payment_terms || quotation.payment_method) && (
                  <div className="pt-1">
                    <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black">
                      Metode Pembayaran / Terms
                    </div>
                    <div className="text-xs font-black text-stone-900 uppercase">
                      {quotation.payment_terms || quotation.payment_method}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Subject Area */}
            <div className="mb-4 p-3 bg-white rounded-lg border border-stone-200">
              <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-1">
                Deskripsi Pekerjaan{" "}
                <span className="text-stone-500 font-normal">
                  / Project Title
                </span>
              </div>
              <div className="text-base font-black text-stone-900 tracking-tight leading-tight uppercase">
                {quotation.title}
              </div>
            </div>

            {/* Items Table */}
            <div className="flex-1">
              <div className="text-xl text-stone-900 uppercase tracking-widest font-black mb-4 ml-1">
                Cakupan Pengiriman Proyek{" "}
                <span className="text-sm text-stone-500 font-normal">
                  / Scope of Project Delivery
                </span>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-stone-300 bg-white">
                    <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-sm">
                      Deskripsi
                      <div className="text-[10px] font-bold text-stone-500 tracking-widest mt-1">
                        DESCRIPTION
                      </div>
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-sm w-16">
                      Jml
                      <div className="text-[10px] font-bold text-stone-500 tracking-widest mt-1">
                        QTY
                      </div>
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-sm w-20">
                      Sat
                      <div className="text-[10px] font-bold text-stone-500 tracking-widest mt-1">
                        UOM
                      </div>
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-sm w-32">
                      Harga / Unit
                      <div className="text-[10px] font-bold text-stone-500 tracking-widest mt-1">
                        PRICE / UNIT
                      </div>
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-sm w-36">
                      Subtotal
                      <div className="text-[10px] font-bold text-stone-500 tracking-widest mt-1">
                        AMOUNT
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-150">
                  {quotation.items?.map((item: any, i: number) => {
                    const itemPrice = Number(item.unit_price || 0);
                    const itemQty = Number(item.qty || 1);
                    const itemSubtotal = itemPrice * itemQty;
                    return (
                      <tr key={i}>
                        <td className="py-4 px-3 text-base font-black text-stone-900 uppercase tracking-tight">
                          {item.title}
                        </td>
                        <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">
                          {itemQty}
                        </td>
                        <td className="py-4 px-3 text-center text-stone-600 font-extrabold uppercase tracking-wider text-xs">
                          {item.uom || "Unit"}
                        </td>
                        <td className="py-4 px-3 text-right text-stone-800 font-mono font-bold text-sm whitespace-nowrap">
                          {itemPrice > 0 ? formatIDR(itemPrice) : "Rp\u00A00"}
                        </td>
                        <td className="py-4 px-3 text-right text-stone-900 font-mono font-black text-sm whitespace-nowrap">
                          {itemSubtotal > 0 ? formatIDR(itemSubtotal) : "Rp\u00A00"}
                        </td>
                      </tr>
                    );
                  })}
                  {(!quotation.items || quotation.items.length === 0) && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 text-center text-sm text-stone-400 font-medium italic"
                      >
                        No detailed scope provided.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="mt-4 flex justify-end">
                <div className="w-[450px] space-y-2">
                  <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2">
                    <span className="text-stone-900 whitespace-nowrap">
                      Subtotal Gross{" "}
                      <span className="font-semibold text-[10px] text-stone-500">
                        / Subtotal
                      </span>
                    </span>
                    <span className="font-mono text-stone-950 font-bold whitespace-nowrap">
                      {formatIDRWithDecimals(baseSubtotal, 2)}
                    </span>
                  </div>
                  {quotation.discount_rate > 0 && (
                    <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2">
                      <span className="text-stone-900 font-bold whitespace-nowrap">
                        DISCOUNT ({quotation.discount_rate}%)
                      </span>
                      <span className="font-mono text-rose-600 font-bold whitespace-nowrap">
                        - {formatIDRWithDecimals(discountDisp, 2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2">
                    <span className="text-stone-900 font-bold whitespace-nowrap">
                      DASAR PENGENAAN PAJAK (DPP)
                    </span>
                    <span className="font-mono text-stone-950 font-bold whitespace-nowrap">
                      {formatIDRWithDecimals(subtotalDisp, 2)}
                    </span>
                  </div>

                  {breakdown.isDppNilaiLain && (
                    <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2 bg-stone-100/70 py-1 rounded">
                      <span className="text-stone-800 font-bold whitespace-nowrap text-[10px]">
                        Other Tax Base / DPP Nilai Lain (11/12)
                      </span>
                      <span className="font-mono text-stone-900 font-bold whitespace-nowrap">
                        {formatIDRWithDecimals(dppNilaiLainDisp, 2)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2">
                    <span className="text-stone-900 whitespace-nowrap">
                      VAT / PPN {quotation.tax_rate ?? 12}%{" "}
                      <span className="font-semibold text-[10px] text-stone-500">
                        / VAT
                      </span>
                    </span>
                    <span className="font-mono text-stone-950 font-bold whitespace-nowrap">
                      + {formatIDRWithDecimals(taxDisp, 2)}
                    </span>
                  </div>

                  {roundingFactor !== 0 && (
                    <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2">
                      <span className="text-stone-900 font-bold whitespace-nowrap">
                        FAKTOR PEMBULATAN{" "}
                        <span className="font-semibold text-[10px] text-stone-500">
                          / ROUNDING
                        </span>
                      </span>
                      <span className="font-mono text-stone-950 font-bold whitespace-nowrap">
                        {roundingFactor > 0 ? "+" : ""}{formatIDRWithDecimals(roundingFactor, 2)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center bg-white text-stone-900 p-3.5 rounded-xl border border-stone-200 mt-2 shadow-xs font-bold gap-3">
                    <span className="text-xs font-black uppercase tracking-wider text-stone-900 whitespace-nowrap">
                      GRAND TOTAL{" "}
                      <span className="font-bold text-[10px] text-stone-500 font-normal">
                        / TOTAL PENAWARAN
                      </span>
                    </span>
                    <span className="text-base font-black tracking-tight font-mono text-stone-900 whitespace-nowrap">
                      {formattedAmount}
                    </span>
                  </div>

                  {pphDisp > 0 && (
                    <div className="mt-2 p-2.5 bg-stone-50 border border-stone-200 rounded-lg space-y-1 text-xs">
                      <div className="flex justify-between items-center text-stone-600">
                        <span className="text-[11px] font-semibold">
                          Potongan PPh 23 ({quotation.pph_rate ?? 0}% Withholding):
                        </span>
                        <span className="font-mono font-bold text-amber-700">
                          - {formatIDRWithDecimals(pphDisp, 2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-stone-200 text-stone-900 font-black">
                        <span className="text-[11px] uppercase tracking-wider">
                          Estimasi Bersih Diterima (Net Cash):
                        </span>
                        <span className="font-mono text-sm text-emerald-700">
                          {formatIDRWithDecimals(breakdown.netPayable, 2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Terms & Conditions */}
            <div className="mt-4 pt-3 border-t border-stone-200">
              <div className="grid grid-cols-2 gap-6 mt-2">
                <div>
                  <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-1.5">
                    Syarat & Ketentuan Umum{" "}
                    <span className="text-stone-500 font-normal">
                      / General Terms & Conditions
                    </span>
                  </div>
                  <div className="text-xs text-stone-800 font-semibold space-y-1.5 uppercase leading-relaxed tracking-tight">
                    <div>
                      <span className="text-stone-900 block font-bold">
                        • Payment Terms: {quotation.payment_terms || quotation.payment_method || "Net 30 Days"}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-900 block font-bold">
                        • Harga sudah termasuk pengiriman standar ke lokasi gudang.
                      </span>
                      <span className="text-stone-500 font-semibold text-[10.5px] block">
                        / Prices include standard delivery to warehouse site.
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-900 block font-bold">
                        • Perhitungan garis waktu dimulai setelah otorisasi SPK/NTP.
                      </span>
                      <span className="text-stone-500 font-semibold text-[10.5px] block">
                        / All timeline calculations begin after NTP authorization.
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-1.5">
                    Keterangan Tambahan{" "}
                    <span className="text-stone-500 font-normal">
                      / Additional Remarks
                    </span>
                  </div>
                  <div className="text-xs text-stone-800 font-bold italic leading-relaxed border-l-2 border-stone-300 pl-3 bg-white py-2 rounded-r-lg">
                    {quotation.remarks ? (
                      quotation.remarks
                    ) : (
                      <div>
                        <span className="text-stone-900 block">
                          Syarat komersial baku berlaku.
                        </span>
                        <span className="text-stone-500 font-semibold text-xs block mt-0.5">
                          / Standard commercial terms apply.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </PrintTemplate>
    </PdfPreviewWrapper>
  );

  if (isPrintModeHidden) {
    return (
      <div style={{ position: "absolute", top: -9999, left: -9999, opacity: 0, pointerEvents: "none" }}>
        {printContent}
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      title="Quotation Document"
      contentClassName="p-0 flex flex-col h-[85vh] bg-stone-100 border-t border-stone-100"
    >
      <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
        {printContent}
      </div>
      <div className="p-6 border-t border-stone-100 bg-white flex justify-center gap-4">
        {onAuthorize && (quotation?.status === "PENDING" || quotation?.status === "DRAFT") && (
          <Button
            variant="primary"
            onClick={() => {
              onAuthorize(quotation);
            }}
            className="px-6 py-2.5 rounded-xl text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            {language === "id" ? "Otorisasi Quotation" : "Authorize Quotation"}
          </Button>
        )}
        {onCreateProject && (quotation?.status === "APPROVED" || quotation?.status === "AUTHORIZED") && (
          <Button
            variant="primary"
            onClick={() => {
              onCreateProject(quotation);
            }}
            className="px-6 py-2.5 rounded-xl text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center gap-2"
          >
            <FolderKanban className="w-4 h-4" />
            {language === "id" ? "Buat Proyek (Create Project)" : "Create Project"}
          </Button>
        )}
        {onOpenReceipt && (quotation?.receipt_number || quotation?.sales_channel === "DIRECT_RETAIL" || quotation?.settlement_type === "IMMEDIATE") && (
          <Button
            variant="secondary"
            onClick={() => onOpenReceipt(quotation)}
            className="px-5 py-2.5 rounded-xl text-sm bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-2"
          >
            <Printer className="w-4 h-4 text-emerald-600" />
            <span>{language === "id" ? "Cetak Struk (POS)" : "Print Receipt"}</span>
          </Button>
        )}
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
