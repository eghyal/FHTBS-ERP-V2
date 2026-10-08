import React, { useRef } from "react";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Printer, Download, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const getShortCode = (rawCode: string | null | undefined): string => {
  if (!rawCode) return "";
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const match = rawCode.match(uuidRegex);
  if (match) {
    const fullUuid = match[0];
    const shortUuid = fullUuid.split("-")[0].toUpperCase();
    return rawCode.replace(fullUuid, shortUuid).toUpperCase();
  }
  return rawCode.toUpperCase();
};

interface FgrPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fgr?: any;
  project?: any;
  itemId?: string;
  fgCode?: string;
}

export const FgrPreviewModal: React.FC<FgrPreviewModalProps> = ({
  isOpen,
  onClose,
  fgr,
  project,
  itemId,
  fgCode,
}) => {
  const printDocRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  if (!isOpen) return null;

  const currentFgCode = fgCode || fgr?.item_code || (project ? `FG-${project.id}` : "FG-REC");
  const currentItemId = itemId || fgr?.item_id || fgr?.id || (project ? `ITM-FG-${project.id}` : "ITM-FG");
  const fgrNumber = fgr?.fgr_number || `FGR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${project?.spk_number || "001"}`;
  const totalQty = fgr?.quantity || project?.qty || 1;
  const uom = fgr?.uom || project?.uom || "UNIT";
  const serialNumber = fgr?.serial_number || `SN-${(project?.id || Date.now().toString()).slice(-6)}`;
  const warehouse = fgr?.target_warehouse || "Warehouse FG-01";

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="FINISH GOOD RECORD (FGR)"
      maxWidth="5xl"
      contentClassName="p-0 flex flex-col h-[85vh] border-t border-stone-100"
    >
      <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
        <PdfPreviewWrapper>
          <PrintTemplate
            ref={printDocRef}
            documentTitleId="REKAMAN BARANG JADI"
            documentTitleEn="FINISH GOOD RECORD"
            documentNameId="rekaman barang jadi"
            documentNameEn="finish good record"
            date={new Date(fgr?.created_at || Date.now()).toLocaleDateString("id-ID", {
              timeZone: "Asia/Jakarta",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
            referenceNumber={fgrNumber}
            documentId={getShortCode(currentFgCode)}
            signatureStatus="unsigned"
          >
            {/* Grid Metadata */}
            <div className="grid grid-cols-2 gap-6 mb-6 border-b border-stone-100 pb-4">
              <div>
                <div className="text-[8px] font-bold tracking-widest uppercase text-stone-900 mb-2 border-b border-stone-100 pb-1">
                  Identifikasi Item <span className="font-normal text-[7px] text-stone-400">/ ITEM IDENTIFICATION</span>
                </div>
                <div className="text-2xl font-black text-stone-900 mb-1 font-mono tracking-tighter leading-none">
                  {getShortCode(currentItemId)}
                </div>
                <div className="text-[9px] font-medium text-stone-500 uppercase tracking-widest flex items-center gap-2 flex-wrap">
                  <span>LOT: {getShortCode(currentFgCode)}</span>
                  <span className="w-1 h-1 rounded-full bg-stone-300"></span>
                  <span>SKU: {getShortCode(currentItemId)}</span>
                  <span className="w-1 h-1 rounded-full bg-stone-300"></span>
                  <span className="font-mono">SN: {serialNumber}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[8px] font-bold tracking-widest uppercase text-stone-900 mb-2 border-b border-stone-100 pb-1">
                  Konteks Produksi <span className="font-normal text-[7px] text-stone-400">/ Production Context</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-medium mb-1">
                  <span className="text-stone-900 uppercase tracking-widest font-bold text-[8px]">
                    Aliran Proyek <span className="font-normal text-stone-400">/ Project Stream:</span>
                  </span>
                  <span className="font-bold text-stone-900 uppercase">
                    {project?.name || "-"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-medium mb-1">
                  <span className="text-stone-900 uppercase tracking-widest font-bold text-[8px]">
                    No. SPK <span className="font-normal text-stone-400">/ SPK Reference:</span>
                  </span>
                  <span className="font-mono font-bold text-stone-900 uppercase">
                    {project?.spk_number || "BATCH"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-medium mb-1">
                  <span className="text-stone-900 uppercase tracking-widest font-bold text-[8px]">
                    Kategori <span className="font-normal text-stone-400">/ Uptake Category:</span>
                  </span>
                  <span className="font-bold bg-white border border-stone-200 px-1.5 py-0.5 rounded text-[8px] tracking-widest">
                    FINISHED_GOODS
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-medium mb-1">
                  <span className="text-stone-900 uppercase tracking-widest font-bold text-[8px]">
                    Gudang Tujuan <span className="font-normal text-stone-400">/ Target Loc:</span>
                  </span>
                  <span className="font-bold text-stone-800 text-[9px]">
                    {warehouse}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-medium mb-1">
                  <span className="text-stone-900 uppercase tracking-widest font-bold text-[8px]">
                    Diperiksa Oleh <span className="font-normal text-stone-400">/ Inspected By:</span>
                  </span>
                  <span className="font-bold uppercase">
                    {fgr?.inspected_by || user?.name || user?.username || "Quality & Production Lead"}
                  </span>
                </div>
              </div>
            </div>

            {/* Description Text */}
            <div className="p-4 bg-white rounded-xl border border-stone-100 mb-6 w-full">
              <div className="text-[8px] font-bold uppercase tracking-widest text-stone-900 mb-1">
                Klausul Sertifikasi & Ketertelusuran <span className="font-normal text-stone-400">/ Certification Clause & Traceability</span>
              </div>
              <p className="text-[10px] text-stone-600 italic leading-relaxed">
                Sertifikat Barang Jadi ini diverifikasi secara elektronik. Ini menandakan bahwa unit kerja yang dirujuk telah berhasil
                melewati kontrol kualitas, inspeksi fisik, dan sign-off produksi internal. Stok telah dialokasikan dan dimasukkan ke inventaris pergudangan.
              </p>
              <p className="text-[10px] text-stone-400 italic leading-relaxed mt-1">
                This certificate of Finished Goods is electronically verified. It signifies that the referenced work units have
                successfully passed quality control, physical inspection, and internal production sign-off. Stock is inbounded to warehouse inventory.
              </p>
            </div>

            {/* Lot Table */}
            <div className="flex-1 relative w-full mb-6">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-300 bg-white">
                    <th className="py-2 px-3 font-bold text-stone-900 uppercase tracking-wider text-[9px] w-12 text-center">
                      No
                    </th>
                    <th className="py-2 px-3 font-bold text-stone-900 uppercase tracking-wider text-[9px] w-28">
                      ID Barang <span className="font-normal text-stone-500 text-[8px] block mt-0.5">/ ITEM ID</span>
                    </th>
                    <th className="py-2 px-3 font-bold text-stone-900 uppercase tracking-wider text-[9px]">
                      Deskripsi Lot <span className="font-normal text-stone-500 text-[8px] block mt-0.5">/ LOT DESC</span>
                    </th>
                    <th className="py-2 px-3 font-bold text-stone-900 uppercase tracking-wider text-[9px] text-right w-32">
                      Hasil Produksi <span className="font-normal text-stone-500 text-[8px] block mt-0.5">/ YIELD YIELDED</span>
                    </th>
                    <th className="py-2 px-3 font-bold text-stone-900 uppercase tracking-wider text-[9px] w-20 text-center">
                      UOM
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-stone-200">
                    <td className="py-2.5 px-3 text-[10px] font-bold text-center text-stone-400">
                      01
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[10px] font-bold text-stone-600">
                      {getShortCode(currentItemId)}
                    </td>
                    <td className="py-2.5 px-3 text-[10px] font-bold text-stone-900 leading-snug uppercase">
                      Barang Jadi / Finished Good for {project?.name}
                    </td>
                    <td className="py-2.5 px-3 text-[10px] font-bold text-right font-mono text-stone-900">
                      {totalQty.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-[9px] tracking-wider uppercase font-bold text-stone-500 text-center">
                      {uom}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </PrintTemplate>
        </PdfPreviewWrapper>
      </div>
      <div className="p-4 border-t border-stone-200 bg-white flex justify-end gap-3 shrink-0">
        <Button variant="secondary" onClick={onClose} className="rounded-xl text-xs font-bold border-stone-200">
          <X className="w-3.5 h-3.5 mr-1.5" /> Close
        </Button>
        <Button onClick={handlePrint} className="bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold shadow-xs">
          <Printer className="w-3.5 h-3.5 mr-1.5" /> Print / Save PDF
        </Button>
      </div>
    </Modal>
  );
};
