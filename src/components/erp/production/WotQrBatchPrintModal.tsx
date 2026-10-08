import React, { useState, useEffect, useMemo } from "react";
import { 
  Printer, Download, QrCode, CheckSquare, Square, 
  Layers, Cpu, Box, RefreshCw, AlertCircle, Search, Filter
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import jsPDF from "jspdf";

interface WotQrBatchPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  spkNumber?: string;
}

export function WotQrBatchPrintModal({
  isOpen,
  onClose,
  projectId,
  projectName = "Project",
  spkNumber = "SPK"
}: WotQrBatchPrintModalProps) {
  const { showToast } = useToast();
  const [wots, setWots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedWotIds, setSelectedWotIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [stationFilter, setStationFilter] = useState("ALL");

  // Fetch or generate QR codes for all WOTs
  const loadWots = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      // First fetch current WOTs
      const res: any = await apiFetch(`/api/production/projects/${projectId}/wots`);
      const wotList = res.wots || [];
      
      // Auto-generate batch QR if any WOT is missing qr_image_url
      const needsQr = wotList.some((w: any) => !w.qr_image_url);
      if (needsQr || wotList.length > 0) {
        setGenerating(true);
        const batchRes: any = await apiFetch("/api/wots/generate-qr-batch", {
          method: "POST",
          body: JSON.stringify({
            project_id: projectId,
            wot_ids: wotList.map((w: any) => w.id)
          })
        });
        if (batchRes.ok && batchRes.wots) {
          setWots(batchRes.wots);
          setSelectedWotIds(new Set(batchRes.wots.map((w: any) => w.id)));
        } else {
          setWots(wotList);
          setSelectedWotIds(new Set(wotList.map((w: any) => w.id)));
        }
      } else {
        setWots(wotList);
        setSelectedWotIds(new Set(wotList.map((w: any) => w.id)));
      }
    } catch (err: any) {
      showToast(err.message || "Failed to load WOT QR data", "error");
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadWots();
    }
  }, [isOpen, projectId]);

  const stationList = useMemo(() => {
    return Array.from(new Set(wots.map(w => w.station_name).filter(Boolean)));
  }, [wots]);

  const filteredWots = useMemo(() => {
    return wots.filter(w => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        w.lot_number?.toLowerCase().includes(q) ||
        w.process_name?.toLowerCase().includes(q) ||
        w.machine_code?.toLowerCase().includes(q);
      const matchesStation = stationFilter === "ALL" || w.station_name === stationFilter;
      return matchesSearch && matchesStation;
    });
  }, [wots, searchQuery, stationFilter]);

  const toggleSelectAll = () => {
    const allFilteredSelected = filteredWots.length > 0 && filteredWots.every(w => selectedWotIds.has(w.id));
    if (allFilteredSelected) {
      const next = new Set(selectedWotIds);
      filteredWots.forEach(w => next.delete(w.id));
      setSelectedWotIds(next);
    } else {
      const next = new Set(selectedWotIds);
      filteredWots.forEach(w => next.add(w.id));
      setSelectedWotIds(next);
    }
  };

  const toggleWotSelect = (id: string) => {
    const next = new Set(selectedWotIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedWotIds(next);
  };

  const selectedWotsList = wots.filter(w => selectedWotIds.has(w.id));

  // Handle native browser print
  const handlePrint = () => {
    if (selectedWotsList.length === 0) {
      showToast("Please select at least 1 WOT to print", "info");
      return;
    }
    window.print();
  };

  // Handle PDF Generation via jsPDF
  const handleDownloadPdf = async () => {
    if (selectedWotsList.length === 0) {
      showToast("Please select at least 1 WOT to export", "info");
      return;
    }

    try {
      showToast("Generating high-res PDF...", "info");
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      // A4 is 210 x 297 mm
      // 50mm x 50mm cards, 3 columns x 5 rows = 15 cards per page
      const cardWidth = 58;
      const cardHeight = 52;
      const marginX = 14;
      const marginY = 14;
      const gapX = 4;
      const gapY = 4;
      const cols = 3;
      const rows = 5;
      const cardsPerPage = cols * rows;

      selectedWotsList.forEach((wot, idx) => {
        const pageIdx = Math.floor(idx / cardsPerPage);
        const cardOnPage = idx % cardsPerPage;
        const col = cardOnPage % cols;
        const row = Math.floor(cardOnPage / cols);

        if (pageIdx > 0 && cardOnPage === 0) {
          doc.addPage();
        }

        const x = marginX + col * (cardWidth + gapX);
        const y = marginY + row * (cardHeight + gapY);

        // Draw Card Border
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2);

        // Header Background
        doc.setFillColor(245, 245, 245);
        doc.rect(x + 0.3, y + 0.3, cardWidth - 0.6, 7, "F");

        // Lot Number Header
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 20, 20);
        doc.text(wot.lot_number || "WOT-LOT", x + 3, y + 5);

        // Project / SPK label
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(spkNumber, x + cardWidth - 3, y + 5, { align: "right" });

        // Left info column
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40, 40, 40);
        doc.text(`Station: ${wot.station_name || "ST-01"}`, x + 3, y + 12);
        
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text(`Proc: ${(wot.process_name || "General").substring(0, 16)}`, x + 3, y + 17);
        doc.text(`Mch: ${(wot.machine_code || wot.machine_name || "MANUAL").substring(0, 14)}`, x + 3, y + 22);

        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 50, 150);
        doc.text(`Qty: ${wot.qty || 1} units`, x + 3, y + 28);

        // Add QR Image
        if (wot.qr_image_url) {
          try {
            doc.addImage(wot.qr_image_url, "PNG", x + cardWidth - 25, y + 9, 22, 22);
          } catch (_) {}
        }

        // Footer Text
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(120, 120, 120);
        doc.text("Scan to Complete WOT • Production Logger", x + cardWidth / 2, y + cardHeight - 2.5, { align: "center" });
      });

      doc.save(`WOT_QR_Batch_${spkNumber}_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast("PDF downloaded successfully!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to generate PDF", "error");
    }
  };

  if (!isOpen) return null;

  const modalTitle = (
    <div className="flex items-center justify-between w-full pr-2">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-stone-900 text-white shadow-xs">
          <QrCode className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-stone-900">
              Batch WOT QR Code Printer
            </h3>
            <span className="text-xs px-2 py-0.5 rounded bg-stone-100 text-stone-800 font-mono font-bold border border-stone-200">
              {spkNumber}
            </span>
          </div>
          <p className="text-xs text-stone-500">
            5cm × 5cm Physical Tag Cards with Encrypted QR Payload & Signature
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDownloadPdf}
          disabled={loading || selectedWotsList.length === 0}
          className="flex items-center gap-1.5 text-xs font-bold"
        >
          <Download className="w-3.5 h-3.5 text-stone-600" />
          Download PDF
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handlePrint}
          disabled={loading || selectedWotsList.length === 0}
          className="flex items-center gap-1.5 text-xs font-bold"
        >
          <Printer className="w-3.5 h-3.5" />
          Print Sheet
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      title={modalTitle}
      contentClassName="p-0"
    >
      <div className="flex flex-col">

        {/* Action / Selection Bar */}
        <div className="px-4 py-2.5 bg-stone-100/70 dark:bg-stone-800/30 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 font-bold text-stone-700 dark:text-stone-300 hover:text-stone-900"
            >
              {filteredWots.length > 0 && filteredWots.every(w => selectedWotIds.has(w.id)) ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : (
                <Square className="w-4 h-4 text-stone-400" />
              )}
              Select Visible ({filteredWots.filter(w => selectedWotIds.has(w.id)).length} / {filteredWots.length})
            </button>

            {/* Quick Filters */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-stone-400" />
                <input
                  type="text"
                  placeholder="Filter lot / process / machine..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-2 py-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg text-xs w-48 focus:border-blue-500"
                />
              </div>

              {stationList.length > 1 && (
                <select
                  value={stationFilter}
                  onChange={(e) => setStationFilter(e.target.value)}
                  className="py-1 px-2.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg text-xs text-stone-700 dark:text-stone-300 focus:border-blue-500"
                >
                  <option value="ALL">All Stations ({wots.length})</option>
                  {stationList.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-stone-500 font-mono text-[11px]">
            <span>Layout: 5cm × 5cm grid (A4 3×5)</span>
            <button
              onClick={loadWots}
              className="flex items-center gap-1 text-blue-600 hover:underline"
              disabled={loading}
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Content Area - Scrollable Preview */}
        <div className="flex-1 overflow-y-auto p-6 bg-stone-100/50 dark:bg-stone-950 print:p-0 print:bg-white">
          {loading || generating ? (
            <div className="flex flex-col items-center justify-center py-20 text-stone-400">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mb-3" />
              <p className="text-sm font-medium">Generating cryptographic WOT QR tags...</p>
            </div>
          ) : filteredWots.length === 0 ? (
            <div className="text-center py-16 text-stone-400">
              <AlertCircle className="w-10 h-10 mx-auto text-stone-300 mb-2" />
              <p className="text-sm font-bold text-stone-700 dark:text-stone-300">No Matching WOTs Found</p>
              <p className="text-xs text-stone-500 mt-1">
                {wots.length === 0 ? "Please generate Work Order Tickets first in Production Planning." : "Adjust your search filter or station selection."}
              </p>
            </div>
          ) : (
            <div 
              id="wot-qr-printable-grid" 
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-3"
            >
              {filteredWots.map((wot) => {
                const isSelected = selectedWotIds.has(wot.id);
                return (
                  <div
                    key={wot.id}
                    onClick={() => toggleWotSelect(wot.id)}
                    className={`relative cursor-pointer transition rounded-xl border bg-white dark:bg-stone-900 p-3 shadow-sm hover:shadow-md print:shadow-none print:break-inside-avoid ${
                      isSelected
                        ? "border-blue-500 ring-2 ring-blue-500/20"
                        : "border-stone-200 dark:border-stone-800 opacity-60"
                    }`}
                    style={{ minHeight: "180px" }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-2 mb-2">
                      <span className="font-mono text-xs font-black text-stone-900 dark:text-stone-100 tracking-tight">
                        {wot.lot_number}
                      </span>
                      <span className="text-[10px] font-bold text-stone-400">
                        {spkNumber}
                      </span>
                    </div>

                    {/* Body */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 space-y-1 text-[11px]">
                        <div className="flex items-center gap-1 text-stone-700 dark:text-stone-300 font-bold">
                          <Layers className="w-3 h-3 text-stone-400" />
                          <span className="truncate">{wot.station_name || "ST-01"}</span>
                        </div>
                        <div className="text-[10px] text-stone-500 truncate">
                          Proc: {wot.process_name || "Cutting"}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-stone-500">
                          <Cpu className="w-3 h-3 text-blue-500" />
                          <span className="truncate">{wot.machine_code || wot.machine_name || "MANUAL"}</span>
                        </div>
                        <div className="pt-1 font-mono font-bold text-blue-600 dark:text-blue-400 text-xs">
                          Qty: {wot.qty} pcs
                        </div>
                      </div>

                      {/* QR Thumbnail */}
                      <div className="w-20 h-20 bg-white p-1 rounded-lg border border-stone-200 flex items-center justify-center shrink-0">
                        {wot.qr_image_url ? (
                          <img
                            src={wot.qr_image_url}
                            alt={wot.lot_number}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <QrCode className="w-8 h-8 text-stone-300" />
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-3 pt-2 border-t border-dashed border-stone-200 dark:border-stone-800 flex items-center justify-between text-[9px] text-stone-400 font-mono">
                      <span>Scan to Complete WOT</span>
                      <span>v1.0 • SIGNED</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Summary */}
        <div className="p-3.5 px-6 border-t border-stone-200 bg-stone-50 flex items-center justify-between text-xs text-stone-500">
          <div>
            Total Selected: <strong className="text-stone-900">{selectedWotsList.length}</strong> of {wots.length} tickets
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} className="text-xs font-bold">
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              disabled={selectedWotsList.length === 0}
              className="text-xs font-bold"
            >
              Print Selected
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
