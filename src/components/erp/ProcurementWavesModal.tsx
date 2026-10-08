import React, { useState, useMemo, useRef } from "react";
import {
  Layers,
  Calendar,
  Clock,
  Package,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  FileText,
  Printer,
  ChevronRight,
  Info,
  Truck,
  Building2,
  Download,
  Filter,
  Check,
  ExternalLink,
  Plus,
  RefreshCw,
  Boxes,
  Lock,
  ArrowDown
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { generatePDF } from "@/lib/pdfGenerator";

export interface ProcurementWaveItem {
  item_id: string;
  item_code: string;
  name: string;
  dimension?: string;
  spec?: string;
  uom: string;
  unit_price: number;
  bom_qty: number; // per unit
  total_required: number; // bom_qty * project.qty
  free_stock: number;
  in_pr_pipeline: number;
  shortage: number; // max(0, total_required - free_stock - in_pr_pipeline)
  lead_time_days: number;
  wave_number: number; // 1, 2, 3
  custom_wave_override?: number;
  station_name?: string;
  station_seq?: number;
  target_arrival_date: string;
  status: "IN_STOCK" | "SHORTAGE" | "ON_ORDER" | "PARTIAL";
  is_long_lead_time?: boolean;
}

export interface ProcurementWavesModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  spkData?: any;
  bom: any[];
  processSteps: any[];
  shortageAnalysis?: any[];
  itemsCatalog?: any[];
  onPrGenerated?: () => void;
}

export const ProcurementWavesModal: React.FC<ProcurementWavesModalProps> = ({
  isOpen,
  onClose,
  project,
  spkData,
  bom,
  processSteps,
  shortageAnalysis = [],
  itemsCatalog = [],
  onPrGenerated,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const printReportRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<"WAVES" | "TIMELINE" | "MATRIX">("WAVES");
  const [selectedWaveFilter, setSelectedWaveFilter] = useState<number | "ALL">("ALL");
  const [waveOverrides, setWaveOverrides] = useState<Record<string, number>>({});
  const [customArrivalDates, setCustomArrivalDates] = useState<Record<number, string>>({});
  const [isGeneratingPr, setIsGeneratingPr] = useState<number | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const projectQty = Number(project?.qty) || 1;
  const dueDateStr = project?.due_date || "";

  // 1. Calculate process step sequence & schedule timing
  const processStepsSorted = useMemo(() => {
    return [...processSteps]
      .filter((s) => s.node_type !== "PRODUCT")
      .sort((a, b) => (a.step_sequence || 1) - (b.step_sequence || 1));
  }, [processSteps]);

  const totalStations = Math.max(1, processStepsSorted.length);
  const earlyThreshold = Math.max(1, Math.ceil(totalStations / 3));
  const midThreshold = Math.max(earlyThreshold + 1, Math.ceil((totalStations * 2) / 3));

  // 2. Base Dates Calculation
  const now = useMemo(() => new Date(), []);
  
  const defaultWaveDates = useMemo(() => {
    // Wave 1: Immediate need, H-3 before station 1 starts (Default 3 days from now)
    const w1Date = new Date(now);
    w1Date.setDate(w1Date.getDate() + 3);

    // Wave 2: Mid stage (approx 10-14 days from now or 40% of remaining project timeline)
    const w2Date = new Date(now);
    w2Date.setDate(w2Date.getDate() + 12);

    // Wave 3: Final stage (approx 20-25 days from now or 75% of remaining project timeline)
    const w3Date = new Date(now);
    w3Date.setDate(w3Date.getDate() + 24);

    return {
      1: w1Date.toISOString().split("T")[0],
      2: w2Date.toISOString().split("T")[0],
      3: w3Date.toISOString().split("T")[0],
    };
  }, [now]);

  // 3. Construct wave items
  
  const waveItems: ProcurementWaveItem[] = useMemo(() => {
    if (!bom || bom.length === 0) return [];

    // 2.5 Dynamic BOP Mapping (Backward Scheduling Engine)
    const bomStationMap = new Map();
    processSteps.filter(s => s.node_type === "PRODUCT").forEach(step => {
      let allocs = [];
      if (typeof step.bom_allocations === 'string') {
        try { allocs = JSON.parse(step.bom_allocations); } catch(e){}
      } else if (Array.isArray(step.bom_allocations)) {
        allocs = step.bom_allocations;
      }
      
      allocs.forEach(a => {
        const existing = bomStationMap.get(a.bom_id);
        const stepSeq = step.step_sequence || 1;
        // Keep the earliest station it's needed
        if (!existing || stepSeq < existing.step_sequence) {
          bomStationMap.set(a.bom_id, {
            step_sequence: stepSeq,
            process_name: step.process_name,
            start_date: step.start_date,
            is_product_node: true
          });
        }
      });
    });

    return bom.map((bItem, idx) => {
      const catItem = itemsCatalog.find((c) => c.id === bItem.item_id || c.item_code === bItem.item_code) || {};
      const shortageInfo = Array.isArray(shortageAnalysis)
        ? (shortageAnalysis.find((s) => s.item_id === bItem.item_id || s.item_code === bItem.item_code) || {})
        : {};

      const bomQtyPerUnit = Number(bItem.required_qty) || 1;
      const totalRequired = bomQtyPerUnit * projectQty;
      
      const freeStock = typeof shortageInfo.free_stock !== "undefined" ? Number(shortageInfo.free_stock) : Number(catItem.free_stock || 0);
      const inPrPipeline = typeof shortageInfo.in_pr_pipeline !== "undefined" ? Number(shortageInfo.in_pr_pipeline) : 0;
      
      const shortage = typeof shortageInfo.shortage !== "undefined" 
        ? Math.max(0, Number(shortageInfo.shortage))
        : Math.max(0, totalRequired - freeStock - inPrPipeline);

      const leadTimeDays = Number(bItem.lead_time_days || catItem.lead_time_days) || 7;
      const isLongLead = leadTimeDays >= 14;

      // Assign station reference using REAL fractional BOP allocations
      let stationInfo = bomStationMap.get(bItem.id);
      
      // Fallback to sequential mapping if no BOP product nodes have been mapped yet
      if (!stationInfo) {
         const stepIdx = idx % totalStations;
         const fallbackStation = processStepsSorted[stepIdx];
         stationInfo = {
           step_sequence: fallbackStation?.step_sequence || stepIdx + 1,
           process_name: fallbackStation?.process_name || `Station ${stepIdx + 1}`,
           start_date: fallbackStation?.start_date
         };
      }

      const stationSeq = stationInfo.step_sequence;
      const stationName = stationInfo.process_name;

      // Automated Wave assignment:
      let defaultWave = 1;
      if (stationSeq <= earlyThreshold) {
        defaultWave = 1;
      } else if (stationSeq <= midThreshold) {
        defaultWave = isLongLead ? 1 : 2;
      } else {
        defaultWave = isLongLead ? 1 : 3;
      }

      const effectiveWave = waveOverrides[bItem.item_id || bItem.id] || defaultWave;

      let status: ProcurementWaveItem["status"] = "SHORTAGE";
      if (shortage <= 0 && freeStock >= totalRequired) {
        status = "IN_STOCK";
      } else if (shortage <= 0 && inPrPipeline > 0) {
        status = "ON_ORDER";
      } else if (freeStock > 0 || inPrPipeline > 0) {
        status = "PARTIAL";
      } else {
        status = "SHORTAGE";
      }
      
      // Target Arrival Date calculation (Backward Scheduling Integration)
      // If the station has a planned start date, we aim to arrive a few days before that.
      // If not, we use the fallback chronological dates (Wave 1, 2, 3 defaults).
      let targetArrival = defaultWaveDates[effectiveWave as 1 | 2 | 3] || defaultWaveDates[1];
      if (customArrivalDates[effectiveWave]) {
        targetArrival = customArrivalDates[effectiveWave];
      } else if (stationInfo.start_date) {
        // Calculate dynamically based on BOP step start date (buffer 3 days)
        const stDate = new Date(stationInfo.start_date);
        stDate.setDate(stDate.getDate() - 3); 
        // Ensure we don't set a date in the past
        if (stDate > new Date()) {
          targetArrival = stDate.toISOString().split("T")[0];
        }
      }

      return {
        item_id: bItem.item_id || bItem.id,
        item_code: bItem.item_code || catItem.item_code || `ITM-${idx + 1}`,
        name: bItem.name || catItem.name || "Material Item",
        dimension: bItem.dimension || catItem.dimension || "-",
        spec: bItem.spec || catItem.spec || "-",
        uom: bItem.uom || catItem.uom || "PCS",
        unit_price: Number(bItem.unit_price) || Number(catItem.unit_price) || 0,
        bom_qty: bomQtyPerUnit,
        total_required: totalRequired,
        free_stock: freeStock,
        in_pr_pipeline: inPrPipeline,
        shortage,
        lead_time_days: leadTimeDays,
        wave_number: effectiveWave,
        station_name: stationName,
        station_seq: stationSeq,
        target_arrival_date: targetArrival,
        status,
        is_long_lead_time: isLongLead,
      };
    });
  }, [
    bom,
    itemsCatalog,
    shortageAnalysis,
    projectQty,
    processStepsSorted,
    totalStations,
    earlyThreshold,
    midThreshold,
    waveOverrides,
    customArrivalDates,
    defaultWaveDates,
  ]);

  // 4. Summaries per wave
  const waveSummaries = useMemo(() => {
    const waves = [1, 2, 3].map((wNum) => {
      const items = waveItems.filter((i) => i.wave_number === wNum);
      const totalItems = items.length;
      const shortageItems = items.filter((i) => i.shortage > 0);
      const readyItems = items.filter((i) => i.status === "IN_STOCK");
      const onOrderItems = items.filter((i) => i.status === "ON_ORDER" || i.status === "PARTIAL");
      const totalShortageQty = shortageItems.reduce((acc, i) => acc + i.shortage, 0);
      const totalEstCost = shortageItems.reduce((acc, i) => acc + i.shortage * i.unit_price, 0);
      const totalWaveValue = items.reduce((acc, i) => acc + i.total_required * i.unit_price, 0);

      const targetArrival = customArrivalDates[wNum] || defaultWaveDates[wNum as 1 | 2 | 3];

      let title = "Wave 1: Early / Long Lead Materials";
      let subtitle = "Primary components for initial stations & high lead-time materials.";
      let badgeColor = "bg-stone-800 text-stone-100";

      if (wNum === 2) {
        title = "Wave 2: Mid-Stage Processing Materials";
        subtitle = "Intermediate assembly materials & standard lead-time parts.";
        badgeColor = "bg-stone-600 text-white";
      } else if (wNum === 3) {
        title = "Wave 3: Final Stage & Buffer Supplies";
        subtitle = "Final assembly, packaging, hardware, and safety spare buffer.";
        badgeColor = "bg-stone-500 text-white";
      }

      return {
        wave_number: wNum,
        title,
        subtitle,
        badgeColor,
        target_arrival_date: targetArrival,
        items,
        totalItems,
        shortageItems,
        readyItems,
        onOrderItems,
        totalShortageQty,
        totalEstCost,
        totalWaveValue,
      };
    });

    const grandTotalShortageCost = waves.reduce((acc, w) => acc + w.totalEstCost, 0);
    const grandTotalItems = waveItems.length;
    const grandTotalShortageItems = waveItems.filter((i) => i.shortage > 0).length;

    return {
      waves,
      grandTotalShortageCost,
      grandTotalItems,
      grandTotalShortageItems,
    };
  }, [waveItems, customArrivalDates, defaultWaveDates]);

  // Handle PR Generation for a specific wave
  const handleGenerateWavePR = async (waveNum: number) => {
    const waveData = waveSummaries.waves.find((w) => w.wave_number === waveNum);
    if (!waveData || waveData.shortageItems.length === 0) {
      showToast(`No shortage items found in Wave ${waveNum} requiring procurement.`, "info");
      return;
    }

    try {
      setIsGeneratingPr(waveNum);
      const payloadItems = waveData.shortageItems.map((w) => ({
        item_id: w.item_id,
        qty_to_order: w.shortage,
        dimension: w.dimension,
        spec: w.spec,
        unit_price: w.unit_price || 0,
        expected_delivery_date: waveData.target_arrival_date,
        remarks: `Procurement Wave ${waveNum} - Target Arrival: ${waveData.target_arrival_date}`,
      }));

      const res = await apiFetch(`/api/projects/${project?.id}/generate-prs`, {
        method: "POST",
        body: JSON.stringify({
          items: payloadItems,
          expected_delivery_date: waveData.target_arrival_date,
          urgency: waveNum === 1 ? "HIGH" : "NORMAL",
          category: "RAW_MATERIAL",
          remarks: `Wave ${waveNum} Phased Procurement (${waveData.shortageItems.length} items)`,
          wave_number: waveNum,
        }),
      }, user?.username);

      if (res.ok && (res.data?.success || res.data?.pr_id || res.data?.pr_number)) {
        const prNum = res.data.pr_number || "PR Created";
        showToast(
          `PR (${prNum}) for Wave ${waveNum} generated successfully!`,
          "success"
        );
        if (onPrGenerated) onPrGenerated();
      } else {
        showToast(res.data?.error || res.error || `Failed to generate PR for Wave ${waveNum}`, "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to generate PR", "error");
    } finally {
      setIsGeneratingPr(null);
    }
  };

  // Move item to different wave
  const handleItemWaveChange = (itemId: string, newWave: number) => {
    setWaveOverrides((prev) => ({
      ...prev,
      [itemId]: newWave,
    }));
    showToast(`Material moved to Wave ${newWave}`, "success");
  };

  // Export PDF Procurement Plan
  const handleExportPdf = async () => {
    if (!printReportRef.current) return;
    try {
      setIsExportingPdf(true);
      await generatePDF(
        printReportRef.current,
        `Procurement_Wave_Plan_${project?.id || "Project"}.pdf`
      );
      showToast("Procurement Wave Plan exported to PDF successfully!", "success");
    } catch (err) {
      showToast("Failed to export PDF", "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!isOpen) return null;

  const modalTitle = (
    <div className="flex items-center gap-2">
      <div className="p-2 rounded-xl bg-stone-100 border border-stone-200 text-stone-700">
        <Layers className="w-5 h-5" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-stone-900 leading-tight">
          Procurement Waves Window
        </h3>
        <p className="text-xs text-stone-500 font-medium">Phased Material Engineering Analysis</p>
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
        {/* Body Content */}
        <div className="max-h-[75vh] overflow-y-auto flex-1 bg-white p-6 space-y-6">
        {/* Header Summary Banner */}
        <div className="bg-stone-50 text-stone-900 p-5 rounded-2xl border border-stone-200 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-stone-700 border border-stone-200 uppercase">
                SPK: {spkData?.spk_number || project?.spk_number || "BATCH"}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-stone-700 border border-stone-200 uppercase">
                QTY: {projectQty} PCS
              </span>
              {dueDateStr && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-stone-700 border border-stone-200 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Due: {dueDateStr}
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-stone-900 tracking-tight">{project?.name}</h3>
            <p className="text-xs text-stone-500 font-medium mt-0.5">
              Phased material allocation aligned with Production Routing & Supplier Lead Times to prevent cashflow drain and warehouse congestion.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="bg-white hover:bg-stone-100 text-stone-700 border-stone-200 rounded-xl text-xs font-semibold h-9 px-3"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              {isExportingPdf ? "Exporting..." : "Export Plan PDF"}
            </Button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl">
            <div className="text-[11px] font-bold uppercase text-stone-500 flex items-center justify-between">
              <span>Total BOM Materials</span>
              <Boxes className="w-4 h-4 text-stone-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-stone-900 font-mono">{waveSummaries.grandTotalItems}</span>
              <span className="text-xs text-stone-500 font-semibold">SKUs</span>
            </div>
            <div className="mt-1 text-[11px] text-stone-600 font-medium">
              {waveSummaries.grandTotalShortageItems} SKUs require procurement order
            </div>
          </div>

          <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl">
            <div className="text-[11px] font-bold uppercase text-stone-500 flex items-center justify-between">
              <span>Total Estimated Shortage Cost</span>
              <DollarSign className="w-4 h-4 text-stone-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xs text-stone-500 font-semibold">Rp</span>
              <span className="text-2xl font-black text-stone-900 font-mono">
                {waveSummaries.grandTotalShortageCost.toLocaleString("id-ID")}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-stone-600 font-medium">
              Distributed over 3 phased procurement waves
            </div>
          </div>

          <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl">
            <div className="text-[11px] font-bold uppercase text-stone-500 flex items-center justify-between">
              <span>Routing Synchronized</span>
              <Clock className="w-4 h-4 text-stone-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-stone-900 font-mono">{totalStations}</span>
              <span className="text-xs text-stone-500 font-semibold">Production Stations</span>
            </div>
            <div className="mt-1 text-[11px] text-stone-600 font-medium">
              Lead time buffers active for all early processes
            </div>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center justify-between border-b border-stone-200 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("WAVES")}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5",
                activeTab === "WAVES"
                  ? "bg-stone-900 text-white shadow-xs"
                  : "text-stone-600 hover:bg-stone-100"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              Wave Breakdown ({waveSummaries.waves.length} Waves)
            </button>
            <button
              onClick={() => setActiveTab("TIMELINE")}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5",
                activeTab === "TIMELINE"
                  ? "bg-stone-900 text-white shadow-xs"
                  : "text-stone-600 hover:bg-stone-100"
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
              Material Requirement Timeline (MRT)
            </button>
            <button
              onClick={() => setActiveTab("MATRIX")}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5",
                activeTab === "MATRIX"
                  ? "bg-stone-900 text-white shadow-xs"
                  : "text-stone-600 hover:bg-stone-100"
              )}
            >
              <Boxes className="w-3.5 h-3.5" />
              Stock vs Need Matrix
            </button>
          </div>

          {activeTab === "WAVES" && (
            <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
              <button
                onClick={() => setSelectedWaveFilter("ALL")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors",
                  selectedWaveFilter === "ALL" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
                )}
              >
                All Waves
              </button>
              {[1, 2, 3].map((wNum) => (
                <button
                  key={wNum}
                  onClick={() => setSelectedWaveFilter(wNum)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors",
                    selectedWaveFilter === wNum ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
                  )}
                >
                  Wave {wNum}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 1. WAVE BREAKDOWN TAB */}
        {activeTab === "WAVES" && (
          <div className="space-y-6">
            {waveSummaries.waves
              .filter((w) => selectedWaveFilter === "ALL" || selectedWaveFilter === w.wave_number)
              .map((wave) => {
                const isWaveGenerating = isGeneratingPr === wave.wave_number;
                const hasShortage = wave.shortageItems.length > 0;

                return (
                  <div
                    key={wave.wave_number}
                    className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden"
                  >
                    {/* Wave Header */}
                    <div className="p-4 px-5 bg-stone-50 border-b border-stone-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider", wave.badgeColor)}>
                            WAVE {wave.wave_number}
                          </span>
                          <h4 className="text-sm font-bold text-stone-900">{wave.title}</h4>
                        </div>
                        <p className="text-xs text-stone-500">{wave.subtitle}</p>
                      </div>

                      {/* Wave Metrics & PR Action Button */}
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-stone-200 text-xs">
                          <span className="text-stone-500 font-medium">Target Arrival:</span>
                          <input
                            type="date"
                            value={wave.target_arrival_date}
                            onChange={(e) =>
                              setCustomArrivalDates((prev) => ({
                                ...prev,
                                [wave.wave_number]: e.target.value,
                              }))
                            }
                            className="bg-transparent border-0 text-xs font-bold text-stone-900 p-0 focus:outline-none cursor-pointer"
                          />
                        </div>

                        <div className="text-right">
                          <div className="text-[10px] font-bold uppercase text-stone-400">Shortage Cost</div>
                          <div className="text-xs font-black text-stone-900 font-mono">
                            Rp {wave.totalEstCost.toLocaleString("id-ID")}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          disabled={!hasShortage || isWaveGenerating}
                          onClick={() => handleGenerateWavePR(wave.wave_number)}
                          className={cn(
                            "rounded-xl text-xs font-bold h-9 px-3.5 shadow-xs transition-all flex items-center gap-1.5",
                            hasShortage
                              ? "bg-stone-900 hover:bg-stone-800 text-white"
                              : "bg-stone-100 text-stone-400 cursor-not-allowed"
                          )}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {isWaveGenerating
                            ? "Generating PR..."
                            : hasShortage
                            ? `Generate PR for Wave ${wave.wave_number} (${wave.shortageItems.length} items)`
                            : "All Items In Stock"}
                        </Button>
                      </div>
                    </div>

                    {/* Items Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-stone-50/50 text-stone-500 font-semibold border-b border-stone-100">
                          <tr>
                            <th className="px-5 py-2.5">Material & Spec</th>
                            <th className="px-5 py-2.5">Routing Station</th>
                            <th className="px-5 py-2.5 text-center">Total Need (Scaled)</th>
                            <th className="px-5 py-2.5 text-center">Free Stock</th>
                            <th className="px-5 py-2.5 text-center">On PR/PO</th>
                            <th className="px-5 py-2.5 text-center font-bold text-stone-900">Net Shortage</th>
                            <th className="px-5 py-2.5 text-right">Lead Time</th>
                            <th className="px-5 py-2.5 text-right">Est. Cost</th>
                            <th className="px-5 py-2.5 text-right">Reassign</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {wave.items.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="px-5 py-6 text-center text-stone-400 italic">
                                No materials assigned to this wave.
                              </td>
                            </tr>
                          ) : (
                            wave.items.map((item) => {
                              return (
                                <tr key={item.item_id} className="hover:bg-stone-50/70 transition-colors">
                                  <td className="px-5 py-3">
                                    <div className="font-bold text-stone-900">{item.name}</div>
                                    <div className="text-[11px] font-mono text-stone-500 flex items-center gap-1">
                                      <span>{item.item_code}</span>
                                      {item.dimension && <span>• {item.dimension}</span>}
                                      {item.spec && <span>• {item.spec}</span>}
                                    </div>
                                    {item.is_long_lead_time && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200 mt-0.5">
                                        Long Lead ({item.lead_time_days}d)
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3">
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                                      {item.station_name}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3 text-center">
                                    <div className="font-mono font-bold text-stone-900">
                                      {item.total_required.toLocaleString()} {item.uom}
                                    </div>
                                    <div className="text-[10px] text-stone-400 font-mono">
                                      ({item.bom_qty} /unit × {projectQty} pcs)
                                    </div>
                                  </td>
                                  <td className="px-5 py-3 text-center font-mono text-stone-600">
                                    {item.free_stock.toLocaleString()} {item.uom}
                                  </td>
                                  <td className="px-5 py-3 text-center font-mono text-stone-500">
                                    {item.in_pr_pipeline.toLocaleString()} {item.uom}
                                  </td>
                                  <td className="px-5 py-3 text-center">
                                    {item.shortage > 0 ? (
                                      <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-red-50 text-red-700 border border-red-200">
                                        {item.shortage.toLocaleString()} {item.uom}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded font-mono font-semibold text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        Ready (0)
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3 text-right font-mono text-stone-600">
                                    {item.lead_time_days} Days
                                  </td>
                                  <td className="px-5 py-3 text-right font-mono font-bold text-stone-900">
                                    Rp {(item.shortage * item.unit_price).toLocaleString("id-ID")}
                                  </td>
                                  <td className="px-5 py-3 text-right">
                                    <select
                                      value={item.wave_number}
                                      onChange={(e) =>
                                        handleItemWaveChange(item.item_id, Number(e.target.value))
                                      }
                                      className="bg-stone-50 border border-stone-200 rounded-lg text-[11px] font-semibold text-stone-700 p-1 px-1.5 focus:outline-none"
                                    >
                                      <option value={1}>Wave 1</option>
                                      <option value={2}>Wave 2</option>
                                      <option value={3}>Wave 3</option>
                                    </select>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* 2. MATERIAL REQUIREMENT TIMELINE (MRT) */}
        {activeTab === "TIMELINE" && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-6">
            <div>
              <h4 className="text-sm font-bold text-stone-900">Material Requirement Timeline (MRT)</h4>
              <p className="text-xs text-stone-500 mt-0.5">
                Visual alignment of material arrival dates against station sequencing.
              </p>
            </div>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
              {waveSummaries.waves.map((wave) => {
                return (
                  <div key={wave.wave_number} className="relative space-y-3">
                    <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-stone-900 text-white font-mono text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-2xs">
                      {wave.wave_number}
                    </div>

                    <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl space-y-3">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-stone-900">{wave.title}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-200 text-stone-700">
                              Target: {wave.target_arrival_date}
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-500">{wave.subtitle}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-stone-900 font-mono">
                            {wave.shortageItems.length} Shortage Items (Rp {wave.totalEstCost.toLocaleString("id-ID")})
                          </span>
                        </div>
                      </div>

                      {/* Item chips */}
                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-stone-200/60">
                        {wave.items.map((it) => (
                          <div
                            key={it.item_id}
                            className={cn(
                              "px-2 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1.5",
                              it.shortage > 0
                                ? "bg-white border-red-200 text-red-900"
                                : "bg-white border-emerald-200 text-emerald-900"
                            )}
                          >
                            <span className="font-bold">{it.item_code}</span>
                            <span className="text-stone-500 font-normal">({it.total_required} {it.uom})</span>
                            {it.shortage > 0 && (
                              <span className="px-1 rounded text-[9px] font-bold bg-red-100 text-red-800">
                                Short: {it.shortage}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. STOCK VS NEED MATRIX TAB */}
        {activeTab === "MATRIX" && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="p-4 px-5 bg-stone-50 border-b border-stone-200 flex justify-between items-center">
              <div>
                <h4 className="text-sm font-bold text-stone-900">Stock vs Requirement Matrix</h4>
                <p className="text-xs text-stone-500">Comprehensive material readiness audit across all BOM items.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50/50 text-stone-500 font-semibold border-b border-stone-100">
                  <tr>
                    <th className="px-5 py-2.5">Item Code</th>
                    <th className="px-5 py-2.5">Material Description</th>
                    <th className="px-5 py-2.5 text-center">BOM Qty</th>
                    <th className="px-5 py-2.5 text-center">Total Need</th>
                    <th className="px-5 py-2.5 text-center">Warehouse Stock</th>
                    <th className="px-5 py-2.5 text-center">On PR / PO</th>
                    <th className="px-5 py-2.5 text-center font-bold text-stone-900">Net Shortage</th>
                    <th className="px-5 py-2.5 text-center">Recommended Wave</th>
                    <th className="px-5 py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {waveItems.map((item) => (
                    <tr key={item.item_id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="px-5 py-3 font-mono font-bold text-stone-900">{item.item_code}</td>
                      <td className="px-5 py-3">
                        <div className="font-semibold text-stone-900">{item.name}</div>
                        <div className="text-[10px] text-stone-400">{item.dimension} • {item.spec}</div>
                      </td>
                      <td className="px-5 py-3 text-center font-mono text-stone-600">{item.bom_qty} {item.uom}</td>
                      <td className="px-5 py-3 text-center font-mono font-bold text-stone-900">{item.total_required} {item.uom}</td>
                      <td className="px-5 py-3 text-center font-mono text-stone-600">{item.free_stock} {item.uom}</td>
                      <td className="px-5 py-3 text-center font-mono text-stone-500">{item.in_pr_pipeline} {item.uom}</td>
                      <td className="px-5 py-3 text-center">
                        {item.shortage > 0 ? (
                          <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-red-50 text-red-700 border border-red-200">
                            {item.shortage} {item.uom}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded font-mono font-semibold text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Fulfilled
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-stone-100 text-stone-800 border border-stone-200">
                          Wave {item.wave_number}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {item.status === "IN_STOCK" && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            In Stock
                          </span>
                        )}
                        {item.status === "ON_ORDER" && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            On Order
                          </span>
                        )}
                        {item.status === "PARTIAL" && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Partial
                          </span>
                        )}
                        {item.status === "SHORTAGE" && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                            Action Needed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Hidden Print / PDF Template */}
        <div className="hidden">
          <div ref={printReportRef} className="p-8 bg-white text-stone-900 space-y-6 text-xs">
            <div className="border-b-2 border-stone-900 pb-4 flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold uppercase tracking-tight">Procurement Wave & Phased Material Report</h1>
                <p className="text-xs text-stone-600 font-medium">Production Engineering & Supply Chain Integration</p>
                <div className="mt-2 text-xs font-mono">
                  Project: <strong>{project?.name}</strong> ({project?.id}) | SPK: <strong>{spkData?.spk_number || project?.spk_number || "BATCH"}</strong> | QTY: <strong>{projectQty}</strong>
                </div>
              </div>
              <div className="text-right text-[10px] text-stone-500 font-mono">
                Generated: {new Date().toLocaleString()}<br />
                Author: {user?.name || user?.username}
              </div>
            </div>

            {waveSummaries.waves.map((w) => (
              <div key={w.wave_number} className="border border-stone-300 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                  <div>
                    <h3 className="font-bold text-sm text-stone-900">Wave {w.wave_number}: {w.title}</h3>
                    <p className="text-[10px] text-stone-500">Target Arrival: {w.target_arrival_date}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold font-mono">Est. Value: Rp {w.totalEstCost.toLocaleString("id-ID")}</div>
                    <div className="text-[10px] text-stone-500">{w.shortageItems.length} Shortage Items to Order</div>
                  </div>
                </div>

                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="border-b border-stone-200 font-bold text-stone-700">
                      <th className="py-1">Code</th>
                      <th className="py-1">Description</th>
                      <th className="py-1 text-center">Total Need</th>
                      <th className="py-1 text-center">Free Stock</th>
                      <th className="py-1 text-center">Shortage</th>
                      <th className="py-1 text-right">Lead Time</th>
                      <th className="py-1 text-right">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.items.map((it) => (
                      <tr key={it.item_id} className="border-b border-stone-100">
                        <td className="py-1 font-mono">{it.item_code}</td>
                        <td className="py-1">{it.name} ({it.dimension} {it.spec})</td>
                        <td className="py-1 text-center font-mono">{it.total_required} {it.uom}</td>
                        <td className="py-1 text-center font-mono">{it.free_stock}</td>
                        <td className="py-1 text-center font-mono font-bold">{it.shortage}</td>
                        <td className="py-1 text-right font-mono">{it.lead_time_days}d</td>
                        <td className="py-1 text-right font-mono">Rp {(it.shortage * it.unit_price).toLocaleString("id-ID")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 px-6 border-t border-stone-200 bg-stone-50 flex justify-end">
          <Button variant="secondary" onClick={onClose} size="sm" className="font-bold">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
