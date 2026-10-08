import React, { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Download, Printer, Tag, Calendar, UserCheck, Building2, PackageCheck } from "lucide-react";
import { toPng } from "html-to-image";
import { useToast } from "@/contexts/ToastContext";

interface WarehouseIntakeLabelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  intakeLabels: any[];
  intakePoNumber?: string;
  intakeSupplierName?: string;
  intakeGrnId?: string;
  intakeReceivedDate?: string;
}

export const WarehouseIntakeLabelsModal: React.FC<WarehouseIntakeLabelsModalProps> = ({
  isOpen,
  onClose,
  intakeLabels,
  intakePoNumber,
  intakeSupplierName,
  intakeGrnId,
  intakeReceivedDate,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();
  const labelsRef = useRef<HTMLDivElement>(null);

  const exportLabelsPng = async () => {
    if (!labelsRef.current) return;
    setIsSubmitting(true);
    try {
      const element = labelsRef.current;
      const imgData = await toPng(element, {
        pixelRatio: 4,
        style: {
          transform: "scale(1)",
          transformOrigin: "top left",
          width: "480px",
        },
      });
      const link = document.createElement("a");
      link.download = `LABEL_PO_${intakePoNumber || "PO"}.png`;
      link.href = imgData;
      link.click();
      showToast("Label PO berhasil diekspor sebagai PNG", "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal mengekspor label PO", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const printLabels = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen && intakeLabels.length > 0}
      onClose={onClose}
      maxWidth="2xl"
      contentClassName="p-0 flex flex-col h-[85vh]"
      title={
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-600 text-white rounded-lg flex items-center justify-center">
            <Tag className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-900 tracking-tight">
              Label PO &amp; Penerimaan GRN
            </h3>
            <p className="text-[10px] text-stone-500 font-medium">
              Identitas batch penerimaan barang dari supplier
            </p>
          </div>
        </div>
      }
    >
      <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-stone-100/70 flex flex-col items-center">
        {/* Banner Penjelasan Standar 2 Label */}
        <div className="w-full max-w-[480px] mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-[10px] text-amber-900">
          <PackageCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Standar Label Gudang:</span> Label ini memuat referensi <strong>PO, Supplier, dan Qty</strong> tanpa QR. Label ini digunakan sebagai identitas batch kedatangan dan ditempel bersama Label QR master item di rak/palet.
          </div>
        </div>

        {/* Container Sheets for Print / Export */}
        <div
          className="space-y-6 flex flex-col items-center w-full"
          ref={labelsRef}
          data-label-root
        >
          {intakeLabels.map((item, idx) => {
            const poNum = item.po_number || intakePoNumber || "PO-GENERIC";
            const suppName = item.supplier_name || intakeSupplierName || "Supplier Mitra";
            const grnDocId = item.grn_id || intakeGrnId || item.reference_id || "-";
            const qtyVal = Math.abs(item.qty || item.original_qty || item.qty_received || 0);
            const uomVal = item.uom || "PCS";
            const targetProject = item.project_id && !["CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(item.project_id)
              ? item.project_id
              : "STOK BEBAS GUDANG (GENERAL STOCK)";
            const dateStr = intakeReceivedDate 
              ? new Date(intakeReceivedDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
              : new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

            return (
              <div
                key={idx}
                className="bg-white p-6 border-2 border-stone-900 rounded-none shadow-sm w-full max-w-[480px] shrink-0 font-sans text-stone-900 relative"
              >
                {/* Header Strip */}
                <div className="flex items-center justify-between border-b-2 border-stone-900 pb-2 mb-3 bg-stone-50 -mx-6 -mt-6 p-4 border-t-4 border-t-amber-600">
                  <div className="flex items-center gap-2">
                    <span className="bg-stone-900 text-white text-[8px] font-black tracking-widest px-2 py-0.5 uppercase">
                      LABEL PO INTAKE
                    </span>
                    <span className="text-[10px] font-black text-stone-900 tracking-wider uppercase">
                      BUKTI PENERIMAAN LOGISTIK
                    </span>
                  </div>
                  <div className="text-[8px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-widest">
                    QC PASSED / VERIFIED
                  </div>
                </div>

                {/* Section 1: PO & Supplier Info */}
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-stone-200">
                  <div>
                    <div className="text-[8px] font-bold text-stone-400 uppercase tracking-wider mb-0.5">
                      REFERENSI PO (PURCHASE ORDER)
                    </div>
                    <div className="text-base font-black text-stone-950 font-mono tracking-tight break-all">
                      {poNum}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] font-bold text-stone-400 uppercase tracking-wider mb-0.5">
                      NAMA SUPPLIER / VENDOR
                    </div>
                    <div className="text-xs font-black text-stone-900 leading-tight truncate">
                      {suppName}
                    </div>
                  </div>
                </div>

                {/* Section 2: Quantity & Item Info */}
                <div className="py-3 border-b-2 border-stone-900 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[8px] font-bold text-stone-400 uppercase tracking-wider mb-0.5">
                      KODE & NAMA BARANG
                    </div>
                    <div className="text-sm font-black text-stone-950 font-mono leading-none mb-1">
                      {item.item_code}
                    </div>
                    <div className="text-xs font-bold text-stone-700 leading-snug line-clamp-2">
                      {item.name || item.item_name || "Material Item"}
                    </div>
                    {(item.dimension || item.spec) && (
                      <div className="text-[9px] text-stone-500 font-mono mt-1">
                        {item.dimension && <span>Dim: {item.dimension} </span>}
                        {item.spec && <span>Spec: {item.spec}</span>}
                      </div>
                    )}
                  </div>

                  {/* Prominent Received Qty */}
                  <div className="shrink-0 text-right bg-stone-50 border-2 border-stone-900 p-2.5 min-w-[130px]">
                    <div className="text-[8px] font-black text-stone-500 uppercase tracking-widest">
                      JUMLAH DATANG
                    </div>
                    <div className="text-2xl font-black text-stone-950 tracking-tight font-mono">
                      {qtyVal}
                    </div>
                    <div className="text-[9px] font-black text-stone-600 uppercase tracking-widest">
                      {uomVal}
                    </div>
                  </div>
                </div>

                {/* Section 3: Traceability & Logistics Meta */}
                <div className="pt-3 grid grid-cols-3 gap-2 text-[9px]">
                  <div>
                    <span className="text-[7px] font-bold text-stone-400 uppercase block">NO. DOKUMEN GRN</span>
                    <span className="font-mono font-bold text-stone-800 break-all">{grnDocId}</span>
                  </div>
                  <div>
                    <span className="text-[7px] font-bold text-stone-400 uppercase block">TANGGAL TERIMA</span>
                    <span className="font-bold text-stone-800">{dateStr}</span>
                  </div>
                  <div>
                    <span className="text-[7px] font-bold text-stone-400 uppercase block">ALOKASI TUJUAN</span>
                    <span className="font-bold text-stone-800 truncate block" title={targetProject}>
                      {targetProject}
                    </span>
                  </div>
                </div>

                {/* Bottom Bar: Identification Barcode Look without QR */}
                <div className="mt-3 pt-2 border-t border-stone-200 flex items-center justify-between text-[8px] font-mono text-stone-400">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-stone-900 rounded-full inline-block"></span>
                    <span>LABEL INTAKE #{item.id ? String(item.id).slice(0, 10) : `LBL-${idx + 1}`}</span>
                  </div>
                  <span className="font-sans font-bold text-stone-500 uppercase tracking-widest text-[7px]">
                    NON-QR PHYSICAL RECEIVING TAG
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Actions */}
      <div className="p-6 border-t border-stone-100 bg-white flex justify-between items-center sticky bottom-0 shadow-sm">
        <div className="text-[10px] text-stone-400 font-medium tracking-wide">
          Total: <span className="font-bold text-stone-900">{intakeLabels.length} Label PO</span> siap cetak
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-stone-500 hover:text-stone-900 text-[10px] font-bold tracking-widest transition-colors uppercase border border-stone-200 hover:bg-stone-50 rounded-xl"
          >
            Tutup
          </button>
          <button
            onClick={exportLabelsPng}
            disabled={isSubmitting}
            className="px-8 py-3 bg-stone-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-stone-800 transition-all active:scale-[0.98] shadow-xs disabled:opacity-50 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {isSubmitting ? "Exporting..." : "Download Label PO PNG"}
          </button>
        </div>
      </div>
    </Modal>
  );
};
