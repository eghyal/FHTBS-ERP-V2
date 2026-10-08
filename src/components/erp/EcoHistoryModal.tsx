import React, { useRef, useState, useMemo, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/contexts/ToastContext";
import { generatePDF } from "@/lib/pdfGenerator";
import {
  Download,
  History,
  ChevronDown,
  Check,
  QrCode,
  Calendar,
} from "lucide-react";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { formatIDR, cn } from "@/lib/utils";
import { apiFetch } from "@/utils/api";

export interface EcoItemDiff {
  item_code: string;
  name: string;
  spec?: string;
  uom: string;
  changeType: "ADDED" | "REMOVED" | "MODIFIED" | "UNCHANGED";
  prevQty: number;
  newQty: number;
  prevPrice: number;
  newPrice: number;
  prevTotal: number;
  newTotal: number;
  costDelta: number;
}

export interface EcoHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  previousBom: any[];
  currentBom: any[];
  ecoReason: string;
  authorizedBy?: string;
  authorizedAt?: string;
  ecoNumber?: string;
}

export const EcoHistoryModal: React.FC<EcoHistoryModalProps> = ({
  isOpen,
  onClose,
  project,
  previousBom = [],
  currentBom = [],
  ecoReason = "Technical revision requested during manufacturing phase.",
  authorizedAt,
  ecoNumber,
}) => {
  const { showToast } = useToast();
  const printDocRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // ECO Logs platform state
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string>("REV-1");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Fetch ECO History from server when modal opens
  useEffect(() => {
    if (isOpen && project?.id) {
      setIsLoadingHistory(true);
      apiFetch(`/api/projects/${project.id}/eco-history`)
        .then((res) => {
          if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
            setHistoryLogs(res.data);
            setSelectedLogId(res.data[0].id); // default to latest committed ECO
          } else {
            setHistoryLogs([]);
            setSelectedLogId("REV-1");
          }
        })
        .catch((err) => console.error("Error fetching ECO logs:", err))
        .finally(() => setIsLoadingHistory(false));
    }
  }, [isOpen, project?.id]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  if (!project) return null;

  // Determine active displayed revision data
  const selectedLog = historyLogs.find((l) => l.id === selectedLogId);

  const activePreviousBom = selectedLog ? selectedLog.previous_bom : previousBom;
  const activeCurrentBom = selectedLog ? selectedLog.current_bom : currentBom;
  const activeReason = selectedLog ? selectedLog.eco_reason : ecoReason;
  const activeAuthAt = selectedLog ? selectedLog.authorized_at : authorizedAt;
  const activeEcoNumber = selectedLog ? selectedLog.eco_number : ecoNumber;

  // Active Revision Number
  const activeRevisionNumber = useMemo(() => {
    if (selectedLog) {
      const logIndex = historyLogs.findIndex((l) => l.id === selectedLog.id);
      return logIndex !== -1 ? historyLogs.length - logIndex : 1;
    }
    return 1;
  }, [selectedLog, historyLogs]);

  // Fully deterministic and stable document reference number
  const docRefNo = useMemo(() => {
    if (activeEcoNumber) return activeEcoNumber;
    if (selectedLog?.eco_number) return selectedLog.eco_number;
    return `ECO-${project.id || "PRJ"}-REV${String(activeRevisionNumber).padStart(2, "0")}`;
  }, [activeEcoNumber, selectedLog, project?.id, activeRevisionNumber]);

  const handleExportPdf = async () => {
    if (!printDocRef.current) return;
    setIsExporting(true);
    try {
      const filename = `${docRefNo}_${project.id || "PRJ"}.pdf`;
      await generatePDF(printDocRef.current, filename);
      showToast("Engineering Change Order (ECO) PDF exported successfully", "success");
    } catch (err) {
      console.error(err);
      showToast("PDF export failed", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const issueDateStr = useMemo(() => {
    const d = activeAuthAt ? new Date(activeAuthAt) : new Date();
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, [activeAuthAt]);

  const issueDateShort = useMemo(() => {
    const d = activeAuthAt ? new Date(activeAuthAt) : new Date();
    return d.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, [activeAuthAt]);

  // Calculate BOM Comparison Delta
  const comparison = useMemo(() => {
    const prevMap = new Map<string, any>();
    (activePreviousBom || []).forEach((item: any) => {
      const code = (item.item_code || item.name || "").trim().toUpperCase();
      if (code) prevMap.set(code, item);
    });

    const currMap = new Map<string, any>();
    (activeCurrentBom || []).forEach((item: any) => {
      const code = (item.item_code || item.name || "").trim().toUpperCase();
      if (code) currMap.set(code, item);
    });

    const diffList: EcoItemDiff[] = [];
    const processedCodes = new Set<string>();

    // Process all current items
    (activeCurrentBom || []).forEach((curr: any) => {
      const code = (curr.item_code || curr.name || "").trim().toUpperCase();
      if (!code) return;
      processedCodes.add(code);

      const prev = prevMap.get(code);
      const newQty = Number(curr.required_qty || curr.qty || 0);
      const newPrice = Number(curr.unit_price || 0);
      const newTotal = newQty * newPrice;

      if (!prev) {
        // Item ADDED
        diffList.push({
          item_code: curr.item_code || code,
          name: curr.name || curr.item_name || "Item Component",
          spec: curr.spec || curr.dimension || "",
          uom: curr.uom || curr.unit || "pcs",
          changeType: "ADDED",
          prevQty: 0,
          newQty,
          prevPrice: 0,
          newPrice,
          prevTotal: 0,
          newTotal,
          costDelta: newTotal,
        });
      } else {
        const prevQty = Number(prev.required_qty || prev.qty || 0);
        const prevPrice = Number(prev.unit_price || 0);
        const prevTotal = prevQty * prevPrice;
        const costDelta = newTotal - prevTotal;

        const isQtyChanged = prevQty !== newQty;
        const isPriceChanged = prevPrice !== newPrice;

        diffList.push({
          item_code: curr.item_code || code,
          name: curr.name || curr.item_name || prev.name || "Item Component",
          spec: curr.spec || curr.dimension || prev.spec || "",
          uom: curr.uom || curr.unit || prev.uom || "pcs",
          changeType: isQtyChanged || isPriceChanged ? "MODIFIED" : "UNCHANGED",
          prevQty,
          newQty,
          prevPrice,
          newPrice,
          prevTotal,
          newTotal,
          costDelta,
        });
      }
    });

    // Process removed items (in prev but not in curr)
    (activePreviousBom || []).forEach((prev: any) => {
      const code = (prev.item_code || prev.name || "").trim().toUpperCase();
      if (!code || processedCodes.has(code)) return;

      const prevQty = Number(prev.required_qty || prev.qty || 0);
      const prevPrice = Number(prev.unit_price || 0);
      const prevTotal = prevQty * prevPrice;

      diffList.push({
        item_code: prev.item_code || code,
        name: prev.name || prev.item_name || "Item Component",
        spec: prev.spec || prev.dimension || "",
        uom: prev.uom || prev.unit || "pcs",
        changeType: "REMOVED",
        prevQty,
        newQty: 0,
        prevPrice,
        newPrice: 0,
        prevTotal,
        newTotal: 0,
        costDelta: -prevTotal,
      });
    });

    // Metrics Summary
    const totalPrevCost = diffList.reduce((sum, d) => sum + d.prevTotal, 0);
    const totalNewCost = diffList.reduce((sum, d) => sum + d.newTotal, 0);
    const totalCostDelta = totalNewCost - totalPrevCost;

    const addedCount = diffList.filter((d) => d.changeType === "ADDED").length;
    const removedCount = diffList.filter((d) => d.changeType === "REMOVED").length;
    const modifiedCount = diffList.filter((d) => d.changeType === "MODIFIED").length;
    const unchangedCount = diffList.filter((d) => d.changeType === "UNCHANGED").length;

    return {
      diffList,
      totalPrevCost,
      totalNewCost,
      totalCostDelta,
      addedCount,
      removedCount,
      modifiedCount,
      unchangedCount,
      prevItemCount: (activePreviousBom || []).length,
      newItemCount: (activeCurrentBom || []).length,
    };
  }, [activePreviousBom, activeCurrentBom]);

  // Determine current active revision label for dropdown button
  const currentRevisionLabel = useMemo(() => {
    return `Revision ${activeRevisionNumber}`;
  }, [activeRevisionNumber]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="6xl"
      title="Engineering Change Order (ECO) History"
      contentClassName="p-0 flex flex-col h-[88vh] bg-stone-100"
    >
      {/* Horizontal Revision Navigation Bar (Clean & Elegant Horizontal View) */}
      <div className="bg-white border-b border-stone-200 px-6 py-2.5 flex items-center justify-between gap-4 overflow-visible shrink-0 z-30">
        {/* Left: Minimalist Revision Switcher Dropdown Button */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 transition-colors font-medium text-xs cursor-pointer shadow-xs focus:outline-none focus:ring-1 focus:ring-stone-400"
          >
            <History className="w-3.5 h-3.5 text-stone-500 shrink-0" />
            <span className="font-semibold text-stone-900">
              {currentRevisionLabel}
            </span>
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 text-stone-400 transition-transform duration-200",
                isDropdownOpen ? "rotate-180" : ""
              )}
            />
          </button>

          {/* Minimalist Light Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-60 bg-white rounded-xl border border-stone-200 shadow-lg py-1.5 z-50 animate-in fade-in duration-100">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 border-b border-stone-100 mb-1">
                Select Revision
              </div>

              <div className="max-h-64 overflow-y-auto custom-scrollbar px-1 space-y-0.5">
                {isLoadingHistory ? (
                  <div className="p-3 text-center text-xs text-stone-400">
                    Loading history...
                  </div>
                ) : historyLogs.length === 0 ? (
                  /* Single initial revision option */
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLogId("REV-1");
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer bg-stone-100 text-stone-950 font-bold"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>Revision 1</span>
                    </div>
                    <Check className="w-3.5 h-3.5 text-stone-900 shrink-0" />
                  </button>
                ) : (
                  historyLogs.map((log, idx) => {
                    const isSelected = selectedLogId === log.id;
                    const revNumber = historyLogs.length - idx;
                    const logDate = new Date(log.authorized_at).toLocaleDateString("en-US", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    });

                    return (
                      <button
                        key={log.id || idx}
                        type="button"
                        onClick={() => {
                          setSelectedLogId(log.id);
                          setIsDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer",
                          isSelected
                            ? "bg-stone-100 text-stone-950 font-bold"
                            : "hover:bg-stone-50 text-stone-700"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>Revision {revNumber}</span>
                          <span className="text-[10px] text-stone-400 font-normal">({logDate})</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-stone-900 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Clean & Simple Document Metadata */}
        <div className="flex items-center gap-4 text-xs text-stone-600 shrink-0">
          <div className="text-[11px] font-mono text-stone-500">
            Ref: <span className="font-bold text-stone-800">{docRefNo}</span>
          </div>
          <div className="text-[11px] text-stone-500 flex items-center gap-1">
            <Calendar className="w-3 h-3 text-stone-400" />
            <span className="font-medium text-stone-700">{issueDateShort}</span>
          </div>
        </div>
      </div>

      {/* Document Preview View Area (Dual Language ERP Standard) */}
      <div className="flex-1 bg-stone-100 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
        <PdfPreviewWrapper>
          <PrintTemplate
            ref={printDocRef}
            documentTitleId="DOKUMEN RIWAYAT PERUBAHAN TEKNIS (ECO)"
            documentTitleEn="ENGINEERING CHANGE ORDER & REVISION RECORD"
            documentNameId="riwayat perubahan teknis"
            documentNameEn="engineering change order record"
            date={issueDateStr}
            referenceNumber={docRefNo}
            documentId={docRefNo}
            isDraft={false}
            signatureStatus="signed"
          >
            {/* Metadata Header Grid (Dual Language) */}
            <div className="grid grid-cols-2 gap-6 mb-6 pb-6 border-b border-stone-200">
              <div>
                <div className="text-[10px] text-stone-500 uppercase tracking-widest font-extrabold mb-1">
                  SUBJEK PROYEK / PROJECT CONTEXT
                </div>
                <div className="text-base font-black text-stone-900 uppercase">
                  {project.name || "PROJECT BOM REVISION"}
                </div>
                <div className="text-xs text-stone-600 mt-1 font-mono font-bold">
                  ID PROYEK / PROJECT ID: <span className="text-stone-900">{project.id}</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] text-stone-500 uppercase tracking-widest font-extrabold mb-1">
                  STATUS REVISI / REVISION STATUS
                </div>
                <div className="inline-block px-3 py-1 border border-stone-900 text-stone-900 font-mono font-bold text-[10px] uppercase tracking-wider mb-2">
                  {`REVISI ${activeRevisionNumber} / REVISION ${activeRevisionNumber}`}
                </div>
                <div className="text-xs text-stone-500 font-medium">
                  TANGGAL TERBIT / ISSUE DATE: <span className="font-bold text-stone-800">{issueDateStr}</span>
                </div>
              </div>
            </div>

            {/* Change Justification Box (Dual Language) */}
            <div className="mb-6 p-4 bg-stone-50/80 border-l-4 border-stone-900 border-y border-r border-stone-200">
              <div className="text-[10px] font-extrabold text-stone-900 uppercase tracking-widest mb-1">
                ALASAN PERUBAHAN TEKNIS / ENGINEERING CHANGE ORDER JUSTIFICATION
              </div>
              <p className="text-xs font-semibold text-stone-800 leading-relaxed">
                "{activeReason}"
              </p>
            </div>

            {/* BOM Comparison Table (Dual Language) */}
            <div className="mb-6">
              <div className="text-xs font-black text-stone-900 uppercase tracking-widest mb-3">
                KOMPARASI STRUKTUR BOM (SEBELUM VS SESUDAH)
                <span className="text-stone-500 font-normal ml-1">
                  / BOM STRUCTURE COMPARISON MATRIX
                </span>
              </div>

              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="py-3 px-3 font-bold text-stone-900 uppercase tracking-wider text-[11px] border-r border-stone-200/60 w-32">
                      KODE ITEM / CODE
                    </th>
                    <th className="py-3 px-3 font-bold text-stone-900 uppercase tracking-wider text-[11px] border-r border-stone-200/60">
                      DESKRIPSI MATERIAL / SPECS
                    </th>
                    <th className="py-3 px-3 font-bold text-stone-900 uppercase tracking-wider text-[11px] border-r border-stone-200/60 text-left w-32">
                      STATUS / TYPE
                    </th>
                    <th className="py-3 px-3 font-bold text-stone-900 uppercase tracking-wider text-[11px] border-r border-stone-200/60 text-right w-28">
                      SEBELUM / PREV QTY
                    </th>
                    <th className="py-3 px-3 font-bold text-stone-900 uppercase tracking-wider text-[11px] border-r border-stone-200/60 text-right w-28">
                      SESUDAH / NEW QTY
                    </th>
                    <th className="py-3 px-3 font-bold text-stone-900 uppercase tracking-wider text-[11px] text-right w-40">
                      DAMPAK BIAYA / COST IMPACT
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.diffList.map((item, idx) => {
                    const isAdded = item.changeType === "ADDED";
                    const isRemoved = item.changeType === "REMOVED";
                    const isModified = item.changeType === "MODIFIED";

                    return (
                      <tr key={idx} className="hover:bg-stone-50/50">
                        <td className="py-3 px-3 font-mono font-bold text-stone-900 text-[13px] border-r border-stone-200/60 whitespace-nowrap">
                          {item.item_code}
                        </td>
                        <td className="py-3 px-3 border-r border-stone-200/60 text-[13px]">
                          <div className="font-bold text-stone-900 uppercase">{item.name}</div>
                          {item.spec && (
                            <div className="text-[11px] text-stone-500 font-normal mt-0.5">{item.spec}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 border-r border-stone-200/60 text-left font-mono font-bold text-[11px] whitespace-nowrap">
                          {isAdded && <span className="text-stone-900 font-extrabold">[+] ADDED</span>}
                          {isRemoved && <span className="text-stone-500 line-through">[-] REMOVED</span>}
                          {isModified && <span className="text-stone-900 font-extrabold">[~] REVISED</span>}
                          {item.changeType === "UNCHANGED" && <span className="text-stone-400">UNCHANGED</span>}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-[13px] text-stone-600 border-r border-stone-200/60 whitespace-nowrap">
                          {isAdded ? "-" : `${item.prevQty} ${item.uom}`}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-stone-900 text-[13px] border-r border-stone-200/60 whitespace-nowrap">
                          {isRemoved ? "-" : `${item.newQty} ${item.uom}`}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[13px] whitespace-nowrap text-stone-900">
                          {item.costDelta > 0
                            ? `+ ${formatIDR(item.costDelta)}`
                            : item.costDelta < 0
                            ? `- ${formatIDR(Math.abs(item.costDelta))}`
                            : "Rp 0"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Financial Impact Summary Block (Dual Language without Indonesian/English labels) */}
            <div className="mb-6 pt-6 pb-2 border-t border-b border-stone-300">
              <div className="text-[10px] font-black text-stone-900 uppercase tracking-widest mb-3 flex items-center justify-between">
                <span>RANGKUMAN DAMPAK ANGGARAN & MATERIAL / FINANCIAL & MATERIAL IMPACT SUMMARY</span>
                <span className="font-mono text-stone-500 font-normal">FORM-ENG-ECO-REV01</span>
              </div>

              <div className="text-[13px] text-stone-800 leading-relaxed text-justify space-y-2">
                <p>
                  Total anggaran material proyek sebelumnya diestimasi sebesar{" "}
                  <span className="font-mono font-bold text-stone-900">{formatIDR(comparison.totalPrevCost)}</span> ({comparison.prevItemCount} komponen). 
                  Setelah diterapkannya revisi teknis (ECO), total anggaran menjadi{" "}
                  <span className="font-mono font-bold text-stone-900">{formatIDR(comparison.totalNewCost)}</span> ({comparison.newItemCount} komponen). 
                  Perubahan ini menghasilkan{" "}
                  <span className="font-bold text-stone-900">
                    {comparison.totalCostDelta > 0
                      ? `penambahan biaya sebesar ${formatIDR(comparison.totalCostDelta)}`
                      : comparison.totalCostDelta < 0
                      ? `efisiensi biaya sebesar ${formatIDR(Math.abs(comparison.totalCostDelta))}`
                      : "selisih anggaran Net Zero (tanpa perubahan biaya total)"}
                  </span>
                  . Struktur revisi mencakup {comparison.addedCount} penambahan, {comparison.removedCount} penghapusan, {comparison.modifiedCount} penyesuaian, dan {comparison.unchangedCount} komponen tetap.
                </p>
                <p className="text-stone-600 text-xs italic">
                  Baseline material budget was estimated at{" "}
                  <span className="font-mono font-bold text-stone-800">{formatIDR(comparison.totalPrevCost)}</span> ({comparison.prevItemCount} components). 
                  Following the authorized ECO revision, the revised budget stands at{" "}
                  <span className="font-mono font-bold text-stone-800">{formatIDR(comparison.totalNewCost)}</span> ({comparison.newItemCount} components), 
                  representing an overall cost impact of{" "}
                  <span className="font-bold text-stone-800">
                    {comparison.totalCostDelta > 0
                      ? `+${formatIDR(comparison.totalCostDelta)}`
                      : comparison.totalCostDelta < 0
                      ? `-${formatIDR(Math.abs(comparison.totalCostDelta))}`
                      : "Net Zero (no variance)"}
                  </span>
                  .
                </p>
              </div>
            </div>

            {/* Formal Notification Release with Best Regards & Manager Engineering Digital Signature */}
            <div className="mt-8 pt-4 border-t border-stone-200 flex justify-end">
              <div className="w-64 text-center">
                <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
                  Hormat Kami <span className="text-stone-500 font-normal">/ Best Regards</span>
                </div>
                <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">
                  Engineering Division
                </div>
                <div className="h-12 flex items-center justify-center my-0.5">
                  <div className="flex items-center gap-2.5 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg">
                    <QrCode className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="text-left">
                      <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">
                        Digitally Authorized
                      </div>
                      <div className="text-[8px] font-mono text-emerald-700 leading-none">
                        Validated via Auth Key
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-1 text-xs font-bold uppercase text-stone-900 border-t border-stone-200 pt-1">
                  Manager Engineering
                </div>
              </div>
            </div>
          </PrintTemplate>
        </PdfPreviewWrapper>
      </div>

      {/* Centered Modal Footer with Black Export PDF Button and Standard Secondary Close */}
      <div className="p-4 sm:px-6 sm:py-4 border-t border-stone-200 bg-white flex justify-center items-center gap-4 shrink-0">
        <Button
          variant="secondary"
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl text-xs font-bold border border-stone-200 bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
        >
          Close
        </Button>
        <Button
          onClick={handleExportPdf}
          disabled={isExporting}
          className="px-7 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 bg-black hover:bg-stone-800 text-white cursor-pointer"
        >
          <Download className="w-4 h-4" />
          {isExporting ? "Exporting PDF..." : "Export PDF (A4)"}
        </Button>
      </div>
    </Modal>
  );
};
