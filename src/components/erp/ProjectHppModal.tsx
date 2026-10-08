import React, { useState, useEffect } from "react";
import {
  X,
  Calculator,
  Package,
  Users,
  Cpu,
  RefreshCw,
  TrendingUp,
  Info,
  CheckCircle2,
  Copy,
  Check,
  Search,
  Layers,
  ArrowRight,
} from "lucide-react";

interface ProjectMaterialItem {
  id: string;
  source: "PR_ITEM" | "BOM_ITEM";
  item_code?: string;
  item_name: string;
  qty: number;
  uom: string;
  unit_price: number;
  total_price: number;
  pr_number?: string;
  po_number?: string;
  supplier_name?: string;
}

interface ProjectLaborEntry {
  source: "ATTENDANCE" | "OVERTIME_SCHEDULE" | "MANPOWER_ASSIGNMENT";
  name: string;
  date: string;
  shift?: string;
  hours: number;
  overtimeHours: number;
  hourlyRate: number;
  cost: number;
  status: string;
}

interface ProjectHppData {
  projectId: string;
  projectName: string;
  projectQty: number;
  totalRevenue: number;
  lastUpdated: string;

  // Option 1: HPP Murni
  materialOnly: {
    totalHpp: number;
    unitHpp: number;
    grossProfit: number;
    grossMarginPct: number;
    materialCount: number;
  };

  // Option 2: HPP Komprehensif
  fullCosting: {
    totalHpp: number;
    unitHpp: number;
    grossProfit: number;
    grossMarginPct: number;
    totalMaterialCost: number;
    totalLaborCost: number;
    totalOverheadCost: number;
    materialPercentage: number;
    laborPercentage: number;
    overheadPercentage: number;
  };

  // Direct backwards-compatible fields
  totalBomCost: number;
  totalLaborCost: number;
  totalOverheadCost: number;
  totalHpp: number;
  unitHpp: number;
  grossProfit: number;
  grossMarginPct: number;

  materialBreakdown?: {
    totalMaterialCost: number;
    itemCount: number;
    sourceType: "ACTUAL_PR_PO" | "BOM_ESTIMATE";
    items: ProjectMaterialItem[];
  };

  laborBreakdown?: {
    totalLaborCost: number;
    regularHours: number;
    overtimeHours: number;
    regularLaborCost: number;
    overtimeLaborCost: number;
    attendanceLaborCost: number;
    overtimeSchedulesCost: number;
    assignmentsCost: number;
    entries: ProjectLaborEntry[];
  };
}

interface ProjectHppModalProps {
  projectId: string;
  projectName?: string;
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "MATERIAL_ONLY" | "FULL_COSTING";
}

export const ProjectHppModal: React.FC<ProjectHppModalProps> = ({
  projectId,
  projectName = "Proyek",
  isOpen,
  onClose,
  initialMode = "MATERIAL_ONLY",
}) => {
  const [costMode, setCostMode] = useState<"MATERIAL_ONLY" | "FULL_COSTING">(initialMode);
  const [data, setData] = useState<ProjectHppData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [recalculating, setRecalculating] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"summary" | "materials" | "labor" | "overhead">("summary");
  const [searchMaterial, setSearchMaterial] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  const formatIDR = (val: number = 0) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(Math.round(val || 0));

  const loadHppData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/hpp`);
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error("Failed to load project HPP data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      const res = await fetch(`/api/projects/${projectId}/recalculate-hpp`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error("Failed to recalculate project HPP:", err);
    } finally {
      setRecalculating(false);
    }
  };

  useEffect(() => {
    if (isOpen && projectId) {
      loadHppData();
    }
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  const currentMaterialHpp = data?.materialOnly?.totalHpp ?? data?.totalBomCost ?? 0;
  const currentMaterialUnit = data?.materialOnly?.unitHpp ?? Math.round(currentMaterialHpp / Math.max(1, data?.projectQty || 1));
  const currentMaterialProfit = data?.materialOnly?.grossProfit ?? ((data?.totalRevenue || 0) - currentMaterialHpp);
  const currentMaterialMargin = data?.materialOnly?.grossMarginPct ?? (data?.totalRevenue ? Number(((currentMaterialProfit / data.totalRevenue) * 100).toFixed(2)) : 0);

  const currentFullHpp = data?.fullCosting?.totalHpp ?? data?.totalHpp ?? 0;
  const currentFullUnit = data?.fullCosting?.unitHpp ?? Math.round(currentFullHpp / Math.max(1, data?.projectQty || 1));
  const currentFullProfit = data?.fullCosting?.grossProfit ?? ((data?.totalRevenue || 0) - currentFullHpp);
  const currentFullMargin = data?.fullCosting?.grossMarginPct ?? (data?.totalRevenue ? Number(((currentFullProfit / data.totalRevenue) * 100).toFixed(2)) : 0);

  const isMaterialOnly = costMode === "MATERIAL_ONLY";
  const activeHpp = isMaterialOnly ? currentMaterialHpp : currentFullHpp;
  const activeUnit = isMaterialOnly ? currentMaterialUnit : currentFullUnit;
  const activeProfit = isMaterialOnly ? currentMaterialProfit : currentFullProfit;
  const activeMargin = isMaterialOnly ? currentMaterialMargin : currentFullMargin;

  const materialItems = data?.materialBreakdown?.items || [];
  const filteredMaterials = materialItems.filter((item) =>
    (item.item_name || "").toLowerCase().includes(searchMaterial.toLowerCase()) ||
    (item.item_code || "").toLowerCase().includes(searchMaterial.toLowerCase()) ||
    (item.pr_number || "").toLowerCase().includes(searchMaterial.toLowerCase()) ||
    (item.supplier_name || "").toLowerCase().includes(searchMaterial.toLowerCase())
  );

  const handleCopySummary = () => {
    const text = `
=== ANALISIS HPP & COGS: ${data?.projectName || projectName} ===
ID Proyek: ${projectId}
Jumlah Unit: ${data?.projectQty || 1} Unit
Total Revenue: ${formatIDR(data?.totalRevenue || 0)}

--- OPSI 1: HPP MURNI (MATERIAL ONLY) ---
Total HPP Material: ${formatIDR(currentMaterialHpp)}
HPP per Unit (Material): ${formatIDR(currentMaterialUnit)}
Gross Profit (Murni): ${formatIDR(currentMaterialProfit)} (${currentMaterialMargin}%)
Jumlah Komponen: ${data?.materialOnly?.materialCount || materialItems.length} items

--- OPSI 2: HPP KOMPREHENSIF (+ TENAGA KERJA & OVERHEAD) ---
Biaya Material: ${formatIDR(currentMaterialHpp)} (${data?.fullCosting?.materialPercentage || 0}%)
Biaya Tenaga Kerja (BTKL): ${formatIDR(data?.totalLaborCost || 0)} (${data?.fullCosting?.laborPercentage || 0}%)
Biaya Overhead Pabrik (BOP): ${formatIDR(data?.totalOverheadCost || 0)} (${data?.fullCosting?.overheadPercentage || 0}%)
Total HPP Komprehensif: ${formatIDR(currentFullHpp)}
HPP per Unit (Komprehensif): ${formatIDR(currentFullUnit)}
Gross Profit: ${formatIDR(currentFullProfit)} (${currentFullMargin}%)
Waktu Terakhir Dihitung: ${data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString("id-ID") : "-"}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id="project-hpp-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200"
    >
      <div
        id="project-hpp-modal-container"
        className="relative w-full max-w-5xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Analisis HPP & COGS Proyek
                </h3>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {projectId}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {data?.projectName || projectName} &bull; Target: {data?.projectQty || 1} Unit
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="hpp-modal-recalculate-btn"
              onClick={handleRecalculate}
              disabled={recalculating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg shadow-sm transition-all disabled:opacity-50"
              title="Hitung Ulang HPP Real-time"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? "animate-spin text-blue-600" : ""}`} />
              <span>{recalculating ? "Menghitung..." : "Hitung Ulang"}</span>
            </button>

            <button
              id="hpp-modal-copy-btn"
              onClick={handleCopySummary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg shadow-sm transition-all"
              title="Salin Ringkasan HPP"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Tersalin" : "Salin Data"}</span>
            </button>

            <button
              id="hpp-modal-close-btn"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PROMINENT DUAL-OPTION TOGGLE SWITCH */}
        <div className="px-6 pt-4 pb-3 bg-gradient-to-r from-slate-100/80 via-slate-50/80 to-blue-50/40 dark:from-slate-800/40 dark:via-slate-800/20 dark:to-blue-950/20 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Mode Perhitungan HPP:
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Pilih opsi analisis untuk memisahkan biaya bahan baku murni atau dengan penambahan tenaga kerja & BOP.
              </p>
            </div>

            <div className="inline-flex p-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-inner">
              <button
                id="toggle-hpp-material-only-btn"
                type="button"
                onClick={() => setCostMode("MATERIAL_ONLY")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  isMaterialOnly
                    ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-500"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Package className="w-4 h-4" />
                <span>Opsi 1: HPP Murni (Material Only)</span>
              </button>

              <button
                id="toggle-hpp-full-costing-btn"
                type="button"
                onClick={() => setCostMode("FULL_COSTING")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  !isMaterialOnly
                    ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-500"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Opsi 2: HPP Komprehensif (+ Variable Lain)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-16 text-center text-slate-500 dark:text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-3" />
              <p className="text-sm font-medium">Memuat data analisis HPP...</p>
            </div>
          ) : (
            <>
              {/* CURRENT ACTIVE MODE BANNER */}
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
                  isMaterialOnly
                    ? "bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60"
                    : "bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900/60"
                }`}
              >
                <Info
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    isMaterialOnly ? "text-blue-600 dark:text-blue-400" : "text-indigo-600 dark:text-indigo-400"
                  }`}
                />
                <div className="text-xs space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white">
                    {isMaterialOnly
                      ? "Sedang Menampilkan: HPP Murni (Direct Material Only)"
                      : "Sedang Menampilkan: HPP Komprehensif (Full Variable Costing)"}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    {isMaterialOnly
                      ? "Perhitungan ini murni mengakumulasi biaya bahan baku langsung (Direct Materials) dari Purchase Request/Purchase Order actual atau estimasi BOM. Biaya tenaga kerja (BTKL) dan biaya overhead pabrik (BOP) ditiadakan dari perhitungan unit cost produk ini."
                      : "Perhitungan ini mengintegrasikan seluruh elemen biaya manufaktur: Direct Material (Bahan Baku) + Upah Tenaga Kerja Langsung (BTKL dari kehadiran & jam lembur mandor/operator) + Biaya Overhead Pabrik (BOP dari standar tarif mesin/proses)."}
                  </p>
                </div>
              </div>

              {/* 4 PRIMARY METRIC CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total HPP */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-semibold">
                      {isMaterialOnly ? "Total HPP Murni" : "Total HPP Komprehensif"}
                    </span>
                    <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {formatIDR(activeHpp)}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {isMaterialOnly
                      ? `${data?.materialBreakdown?.itemCount || 0} jenis komponen material`
                      : `Mat + Labor (${formatIDR(data?.totalLaborCost || 0)}) + BOP`}
                  </div>
                </div>

                {/* 2. Unit HPP */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-semibold">HPP per Unit</span>
                    <Calculator className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
                    {formatIDR(activeUnit)}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Per {data?.projectQty || 1} unit target produksi
                  </div>
                </div>

                {/* 3. Gross Profit */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-semibold">
                      {isMaterialOnly ? "Laba Kotor (Murni)" : "Laba Kotor (Komprehensif)"}
                    </span>
                    <TrendingUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div
                    className={`text-xl font-bold tracking-tight ${
                      activeProfit >= 0
                        ? "text-slate-900 dark:text-white"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {formatIDR(activeProfit)}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Revenue: {formatIDR(data?.totalRevenue || 0)}
                  </div>
                </div>

                {/* 4. Gross Margin % */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-semibold">Gross Margin %</span>
                    <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div
                    className={`text-xl font-bold tracking-tight ${
                      activeMargin >= 20
                        ? "text-emerald-600 dark:text-emerald-400"
                        : activeMargin > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {activeMargin}%
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {isMaterialOnly ? "Berdasarkan Bahan Baku" : "Berdasarkan Full Costing"}
                  </div>
                </div>
              </div>

              {/* COST COMPARISON TABLE (SIDE BY SIDE: MURNI VS KOMPREHENSIF) */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-3 bg-slate-100/70 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    Komparasi Dua Opsi HPP (Side-by-Side Comparison)
                  </h4>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Mata Uang: IDR (Rupiah)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Komponen Biaya</th>
                        <th className="py-2.5 px-4 font-semibold text-right bg-blue-50/50 dark:bg-blue-950/20">
                          Opsi 1: HPP Murni (Material)
                        </th>
                        <th className="py-2.5 px-4 font-semibold text-right bg-indigo-50/50 dark:bg-indigo-950/20">
                          Opsi 2: HPP Komprehensif (+ Var)
                        </th>
                        <th className="py-2.5 px-4 font-semibold text-right">Selisih (+ Biaya Lain)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {/* Direct Material */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <Package className="w-3.5 h-3.5 text-blue-500" />
                          Bahan Baku Langsung (Direct Materials)
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-slate-900 dark:text-white bg-blue-50/30 dark:bg-blue-950/10">
                          {formatIDR(currentMaterialHpp)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-slate-900 dark:text-white bg-indigo-50/30 dark:bg-indigo-950/10">
                          {formatIDR(currentMaterialHpp)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-400">Rp 0 (Sama)</td>
                      </tr>

                      {/* Direct Labor */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-emerald-500" />
                          Tenaga Kerja Langsung (BTKL Shift & Lembur)
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-400 italic bg-blue-50/30 dark:bg-blue-950/10">
                          Rp 0 (Diabaikan)
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400 bg-indigo-50/30 dark:bg-indigo-950/10">
                          {formatIDR(data?.totalLaborCost || 0)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                          +{formatIDR(data?.totalLaborCost || 0)}
                        </td>
                      </tr>

                      {/* Factory Overhead */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <Cpu className="w-3.5 h-3.5 text-purple-500" />
                          Biaya Overhead Pabrik (BOP Mesin & Proses)
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-400 italic bg-blue-50/30 dark:bg-blue-950/10">
                          Rp 0 (Diabaikan)
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-purple-600 dark:text-purple-400 bg-indigo-50/30 dark:bg-indigo-950/10">
                          {formatIDR(data?.totalOverheadCost || 0)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-purple-600 dark:text-purple-400 font-medium">
                          +{formatIDR(data?.totalOverheadCost || 0)}
                        </td>
                      </tr>

                      {/* TOTAL HPP */}
                      <tr className="bg-slate-100/60 dark:bg-slate-800/60 font-bold border-t border-slate-200 dark:border-slate-700">
                        <td className="py-3 px-4 text-slate-900 dark:text-white">
                          TOTAL HPP (COGS)
                        </td>
                        <td className="py-3 px-4 text-right text-blue-600 dark:text-blue-400 bg-blue-100/50 dark:bg-blue-950/30">
                          {formatIDR(currentMaterialHpp)}
                        </td>
                        <td className="py-3 px-4 text-right text-indigo-600 dark:text-indigo-400 bg-indigo-100/50 dark:bg-indigo-950/30">
                          {formatIDR(currentFullHpp)}
                        </td>
                        <td className="py-3 px-4 text-right text-indigo-600 dark:text-indigo-400">
                          +{formatIDR(currentFullHpp - currentMaterialHpp)}
                        </td>
                      </tr>

                      {/* UNIT HPP */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                          HPP per Unit (Target: {data?.projectQty || 1} Unit)
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-white bg-blue-50/30 dark:bg-blue-950/10">
                          {formatIDR(currentMaterialUnit)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-white bg-indigo-50/30 dark:bg-indigo-950/10">
                          {formatIDR(currentFullUnit)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-600 dark:text-slate-300">
                          +{formatIDR(currentFullUnit - currentMaterialUnit)}
                        </td>
                      </tr>

                      {/* GROSS PROFIT */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                          Laba Kotor (Gross Profit)
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400 bg-blue-50/30 dark:bg-blue-950/10">
                          {formatIDR(currentMaterialProfit)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400 bg-indigo-50/30 dark:bg-indigo-950/10">
                          {formatIDR(currentFullProfit)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-rose-600 dark:text-rose-400">
                          -{formatIDR(currentMaterialProfit - currentFullProfit)}
                        </td>
                      </tr>

                      {/* GROSS MARGIN % */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                          Margin Laba Kotor (%)
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400 bg-blue-50/30 dark:bg-blue-950/10">
                          {currentMaterialMargin}%
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400 bg-indigo-50/30 dark:bg-indigo-950/10">
                          {currentFullMargin}%
                        </td>
                        <td className="py-2.5 px-4 text-right text-rose-600 dark:text-rose-400">
                          {(currentFullMargin - currentMaterialMargin).toFixed(1)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TABS FOR DEEP-DIVE BREAKDOWN */}
              <div className="space-y-3">
                <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
                  <button
                    onClick={() => setActiveTab("materials")}
                    className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                      activeTab === "materials"
                        ? "border-blue-600 text-blue-600 dark:text-blue-400"
                        : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <Package className="w-3.5 h-3.5" />
                    Rincian Material ({materialItems.length})
                  </button>

                  <button
                    onClick={() => setActiveTab("labor")}
                    className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                      activeTab === "labor"
                        ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                        : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Rincian Tenaga Kerja BTKL ({data?.laborBreakdown?.entries?.length || 0})
                  </button>

                  <button
                    onClick={() => setActiveTab("overhead")}
                    className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                      activeTab === "overhead"
                        ? "border-purple-600 text-purple-600 dark:text-purple-400"
                        : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    Rincian BOP Overhead
                  </button>
                </div>

                {/* TAB CONTENT: MATERIAL ITEMS */}
                {activeTab === "materials" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          value={searchMaterial}
                          onChange={(e) => setSearchMaterial(e.target.value)}
                          placeholder="Cari komponen atau nomor PR..."
                          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Sumber data:{" "}
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {data?.materialBreakdown?.sourceType === "ACTUAL_PR_PO"
                            ? "PR/PO Actual Pembelian"
                            : "Estimasi Budget BOM Proyek"}
                        </span>
                      </span>
                    </div>

                    <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-xs text-left">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="py-2 px-3">Kode / Item</th>
                            <th className="py-2 px-3 text-right">Qty</th>
                            <th className="py-2 px-3 text-right">Harga Satuan</th>
                            <th className="py-2 px-3 text-right">Total Biaya</th>
                            <th className="py-2 px-3">Ref PR / PO</th>
                            <th className="py-2 px-3">Supplier</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredMaterials.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-slate-400">
                                Tidak ada item material ditemukan
                              </td>
                            </tr>
                          ) : (
                            filteredMaterials.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                <td className="py-2 px-3">
                                  <div className="font-medium text-slate-900 dark:text-white">
                                    {item.item_name}
                                  </div>
                                  {item.item_code && (
                                    <div className="text-[10px] text-slate-400">{item.item_code}</div>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right font-medium">
                                  {item.qty} {item.uom}
                                </td>
                                <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-400">
                                  {formatIDR(item.unit_price)}
                                </td>
                                <td className="py-2 px-3 text-right font-semibold text-slate-900 dark:text-white">
                                  {formatIDR(item.total_price)}
                                </td>
                                <td className="py-2 px-3 text-[11px] text-slate-500">
                                  {item.pr_number || "-"}
                                </td>
                                <td className="py-2 px-3 text-[11px] text-slate-500 truncate max-w-[120px]">
                                  {item.supplier_name || "-"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB CONTENT: LABOR ENTRIES */}
                {activeTab === "labor" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900">
                        <span className="text-slate-500 dark:text-slate-400">Jam Kerja Reguler</span>
                        <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                          {data?.laborBreakdown?.regularHours || 0} Jam
                        </div>
                        <span className="text-[11px] text-emerald-600">
                          {formatIDR(data?.laborBreakdown?.regularLaborCost || 0)}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
                        <span className="text-slate-500 dark:text-slate-400">Jam Lembur (Overtime)</span>
                        <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                          {data?.laborBreakdown?.overtimeHours || 0} Jam
                        </div>
                        <span className="text-[11px] text-amber-600">
                          {formatIDR(data?.laborBreakdown?.overtimeLaborCost || 0)}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <span className="text-slate-500 dark:text-slate-400">Total Biaya BTKL</span>
                        <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                          {formatIDR(data?.totalLaborCost || 0)}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {isMaterialOnly ? "Tidak dibebankan di Opsi 1" : "Dibebankan di Opsi 2"}
                        </span>
                      </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-xs text-left">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="py-2 px-3">Nama Pekerja / Operator</th>
                            <th className="py-2 px-3">Tanggal / Shift</th>
                            <th className="py-2 px-3 text-right">Jam Reguler</th>
                            <th className="py-2 px-3 text-right">Jam Lembur</th>
                            <th className="py-2 px-3 text-right">Tarif / Jam</th>
                            <th className="py-2 px-3 text-right">Total Upah</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {!data?.laborBreakdown?.entries?.length ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-slate-400">
                                Belum ada pencatatan kehadiran shift atau penugasan manpower
                              </td>
                            </tr>
                          ) : (
                            data.laborBreakdown.entries.map((entry, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">
                                  {entry.name}
                                </td>
                                <td className="py-2 px-3 text-slate-500">
                                  {entry.date} {entry.shift ? `(${entry.shift})` : ""}
                                </td>
                                <td className="py-2 px-3 text-right font-medium">
                                  {entry.hours} Jam
                                </td>
                                <td className="py-2 px-3 text-right font-medium text-amber-600">
                                  {entry.overtimeHours} Jam
                                </td>
                                <td className="py-2 px-3 text-right text-slate-500">
                                  {formatIDR(entry.hourlyRate)}
                                </td>
                                <td className="py-2 px-3 text-right font-semibold text-slate-900 dark:text-white">
                                  {formatIDR(entry.cost)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB CONTENT: OVERHEAD (BOP) */}
                {activeTab === "overhead" && (
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-purple-600" />
                        <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                          Biaya Overhead Pabrik (Factory Overhead Rate)
                        </h5>
                      </div>
                      <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                        Total: {formatIDR(data?.totalOverheadCost || 0)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      BOP dialokasikan berdasarkan jam standar permesinan/proses yang tercatat dalam Bill of Process (BOP) dikalikan dengan tarif standar overhead operasional (Rp 25.000 / jam mesin).
                    </p>

                    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Status Pembebanan:</span>
                      <span
                        className={`font-semibold px-2 py-0.5 rounded-md ${
                          isMaterialOnly
                            ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                            : "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                        }`}
                      >
                        {isMaterialOnly
                          ? "Tidak Diikutsertakan (Opsi HPP Murni Aktif)"
                          : "Diikutsertakan ke dalam COGS (Opsi Komprehensif Aktif)"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Terakhir dihitung:{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString("id-ID") : "-"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
