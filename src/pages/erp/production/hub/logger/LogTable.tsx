import React, { useState, useMemo, useRef, useEffect } from "react";
import { format, isToday, isThisWeek } from "date-fns";
import { 
  Search, Download, QrCode, CheckCircle2, AlertTriangle, Layers, 
  RefreshCw, ArrowRightLeft, Activity, User, Cpu, FileText, Image as ImageIcon,
  ShieldCheck, MessageSquarePlus, Filter, X, Volume2, VolumeX, Eye,
  Calendar, Check, ChevronDown, ChevronUp, AlertOctagon, CornerDownRight, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { WotGenealogyModal } from "@/components/erp/production/WotGenealogyModal";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface LogTableProps {
  logs: any[];
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRefresh?: () => void;
  newLogIds?: Set<string>;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
}

export function LogTable({ 
  logs, 
  loading, 
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  onRefresh,
  newLogIds = new Set(),
  soundEnabled = true,
  onToggleSound
}: LogTableProps) {
  const { showToast } = useToast();

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEventType, setSelectedEventType] = useState<string>("ALL");
  const [dateFilter, setDateFilter] = useState<"ALL" | "TODAY" | "WEEK" | "CUSTOM">("ALL");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  
  // Advanced Filter Drawer State
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterProject, setFilterProject] = useState<string>("ALL");
  const [filterStation, setFilterStation] = useState<string>("ALL");
  const [filterMachine, setFilterMachine] = useState<string>("ALL");
  const [filterRole, setFilterRole] = useState<string>("ALL");

  // Interactive Modals State
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [selectedWotForModal, setSelectedWotForModal] = useState<any | null>(null);
  
  // Correction Note Modal State
  const [correctingLog, setCorrectingLog] = useState<any | null>(null);
  const [correctionNote, setCorrectionNote] = useState("");
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [verifyingLogId, setVerifyingLogId] = useState<string | null>(null);

  // Table Scroll Container Ref
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [showNewLogsBanner, setShowNewLogsBanner] = useState(false);
  const [isScrolledDown, setIsScrolledDown] = useState(false);

  // Detect scroll position
  const handleScroll = () => {
    if (!tableContainerRef.current) return;
    const { scrollTop } = tableContainerRef.current;
    if (scrollTop > 80) {
      setIsScrolledDown(true);
    } else {
      setIsScrolledDown(false);
      setShowNewLogsBanner(false);
    }
  };

  // If new logs arrive and user is scrolled down, show banner
  useEffect(() => {
    if (newLogIds.size > 0 && isScrolledDown) {
      setShowNewLogsBanner(true);
    }
  }, [newLogIds, isScrolledDown]);

  const scrollToTop = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      setShowNewLogsBanner(false);
    }
  };

  // Extract unique options for advanced filter dropdowns
  const uniqueProjects = useMemo(() => {
    const map = new Map();
    logs.forEach(l => {
      if (l.project_id && l.project_name) {
        map.set(l.project_id, { id: l.project_id, name: l.project_name, spk: l.spk_number });
      }
    });
    return Array.from(map.values());
  }, [logs]);

  const uniqueStations = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => {
      if (l.station_name) set.add(l.station_name);
    });
    return Array.from(set);
  }, [logs]);

  const uniqueMachines = useMemo(() => {
    const map = new Map();
    logs.forEach(l => {
      if (l.machine_id) {
        map.set(l.machine_id, { id: l.machine_id, name: l.machine_name || l.machine_code || l.machine_id });
      }
    });
    return Array.from(map.values());
  }, [logs]);

  // Filter Logic
  const filteredLogs = useMemo(() => {
    let result = Array.isArray(logs) ? logs : [];

    // Event Type Filter
    if (selectedEventType !== "ALL") {
      if (selectedEventType === "NDP") {
        result = result.filter(l => l.log_type?.startsWith("NDP"));
      } else if (selectedEventType === "TRANSFER") {
        result = result.filter(l => l.log_type?.includes("TRANSFER"));
      } else if (selectedEventType === "FLOOR_REQUEST") {
        result = result.filter(l => l.log_type?.startsWith("FLOOR_REQUEST"));
      } else {
        result = result.filter(l => l.log_type === selectedEventType);
      }
    }

    // Date Filters
    if (dateFilter === "TODAY") {
      result = result.filter(l => l.timestamp && isToday(new Date(l.timestamp)));
    } else if (dateFilter === "WEEK") {
      result = result.filter(l => l.timestamp && isThisWeek(new Date(l.timestamp)));
    } else if (dateFilter === "CUSTOM") {
      if (customStartDate) {
        const start = new Date(customStartDate).getTime();
        result = result.filter(l => l.timestamp && new Date(l.timestamp).getTime() >= start);
      }
      if (customEndDate) {
        const end = new Date(customEndDate).getTime() + 86400000;
        result = result.filter(l => l.timestamp && new Date(l.timestamp).getTime() <= end);
      }
    }

    // Advanced Filters
    if (filterProject !== "ALL") {
      result = result.filter(l => l.project_id === filterProject);
    }
    if (filterStation !== "ALL") {
      result = result.filter(l => l.station_name === filterStation);
    }
    if (filterMachine !== "ALL") {
      result = result.filter(l => l.machine_id === filterMachine);
    }
    if (filterRole !== "ALL") {
      result = result.filter(l => l.user_role === filterRole);
    }

    // Search Query (Full Text)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => 
        (l.details && String(l.details).toLowerCase().includes(q)) ||
        (l.wot_id && String(l.wot_id).toLowerCase().includes(q)) ||
        (l.lot_number && String(l.lot_number).toLowerCase().includes(q)) ||
        (l.user_name && String(l.user_name).toLowerCase().includes(q)) ||
        (l.machine_code && String(l.machine_code).toLowerCase().includes(q)) ||
        (l.machine_name && String(l.machine_name).toLowerCase().includes(q)) ||
        (l.project_name && String(l.project_name).toLowerCase().includes(q)) ||
        (l.station_name && String(l.station_name).toLowerCase().includes(q)) ||
        (l.process_name && String(l.process_name).toLowerCase().includes(q)) ||
        (l.log_type && String(l.log_type).toLowerCase().includes(q))
      );
    }

    return result;
  }, [
    logs, selectedEventType, dateFilter, customStartDate, customEndDate,
    filterProject, filterStation, filterMachine, filterRole, searchQuery
  ]);

  // Toggle Row Expansion for JSON Details
  const toggleRowExpand = (id: string) => {
    setExpandedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // QC Verification Handler
  const handleVerifyLog = async (logId: string) => {
    try {
      setVerifyingLogId(logId);
      const res: any = await apiFetch(`/api/production-logger/logs/${logId}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ verified_by: "QC Inspector" })
      });
      if (res.ok) {
        showToast("Log entry successfully verified by QC", "success");
        if (onRefresh) onRefresh();
      } else {
        throw new Error(res.error || "Failed to verify log");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setVerifyingLogId(null);
    }
  };

  // SPV Submit Correction Note
  const handleSubmitCorrection = async () => {
    if (!correctingLog || !correctionNote.trim()) return;
    try {
      setSubmittingCorrection(true);
      const res: any = await apiFetch(`/api/production-logger/logs/${correctingLog.id}/correct`, {
        method: "POST",
        body: JSON.stringify({
          note: correctionNote.trim(),
          user_id: "Production Supervisor",
          user_role: "SUPERVISOR"
        })
      });
      if (res.ok) {
        showToast("Immutable correction note recorded in audit log", "success");
        setCorrectingLog(null);
        setCorrectionNote("");
        if (onRefresh) onRefresh();
      } else {
        throw new Error(res.error || "Failed to record correction");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmittingCorrection(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredLogs.length) {
      showToast("No logs available to export", "info");
      return;
    }
    const headers = [
      "Timestamp", "Log Type", "Project", "SPK", "Station", "Process", 
      "Machine Code", "Machine Name", "WOT Lot", "User", "Role", "QC Verified", "Details"
    ];
    const rows = filteredLogs.map(l => [
      l.timestamp ? new Date(l.timestamp).toISOString() : "",
      l.log_type || "",
      `"${(l.project_name || "").replace(/"/g, '""')}"`,
      l.spk_number || "",
      `"${(l.station_name || "").replace(/"/g, '""')}"`,
      `"${(l.process_name || "").replace(/"/g, '""')}"`,
      l.machine_code || "",
      `"${(l.machine_name || "").replace(/"/g, '""')}"`,
      l.lot_number || l.wot_id || "",
      `"${(l.user_name || "").replace(/"/g, '""')}"`,
      l.user_role || "",
      l.is_verified ? "YES" : "NO",
      `"${(typeof l.details === 'string' ? l.details : JSON.stringify(l.details || {})).replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `production_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV audit trail downloaded successfully", "success");
  };

  // Export JSON (for external BI tools)
  const handleExportJSON = () => {
    if (!filteredLogs.length) {
      showToast("No logs available to export", "info");
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `production_logs_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("JSON log feed exported", "success");
  };

  // Export PDF Report (Comprehensive Daily Production Report with jsPDF)
  const handleExportPDF = () => {
    if (!filteredLogs.length) {
      showToast("No logs available to export", "info");
      return;
    }
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      
      // Header & Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("PRODUCTION LOGGER — AUDIT & EVENT REPORT", 14, 15);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`Generated on: ${format(new Date(), "dd MMMM yyyy, HH:mm:ss")} | Total Log Entries: ${filteredLogs.length}`, 14, 21);

      // Summary Statistics Box
      const totalWot = filteredLogs.filter(l => l.log_type === 'WOT_COMPLETE').length;
      const totalQr = filteredLogs.filter(l => l.log_type === 'QR_SCAN').length;
      const totalNdp = filteredLogs.filter(l => l.log_type?.startsWith('NDP')).length;
      const totalFr = filteredLogs.filter(l => l.log_type?.startsWith('FLOOR_REQUEST')).length;
      const verifiedCount = filteredLogs.filter(l => l.is_verified).length;

      doc.setDrawColor(220, 220, 220);
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(14, 25, 269, 14, 2, 2, "FD");

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30);
      doc.text(`WOT Completions: ${totalWot}  |  QR Scans: ${totalQr}  |  NDP Incidents: ${totalNdp}  |  Floor Requests: ${totalFr}  |  QC Verified: ${verifiedCount}`, 20, 34);

      // AutoTable
      const tableData = filteredLogs.map((l) => [
        l.timestamp ? format(new Date(l.timestamp), "dd/MM/yy HH:mm:ss") : "-",
        l.log_type || "-",
        l.project_name ? `${l.project_name} (${l.spk_number || '-'})` : "-",
        l.station_name || "-",
        l.process_name || "-",
        l.machine_code || l.machine_name || "-",
        l.lot_number || "-",
        `${l.user_name || 'Operator'} (${l.user_role || 'OP'})`,
        typeof l.details === 'string' ? l.details.slice(0, 60) : JSON.stringify(l.details || {}).slice(0, 60)
      ]);

      autoTable(doc, {
        head: [["Timestamp", "Event Type", "Project (SPK)", "Station", "Process", "Machine", "WOT Lot", "Actor (Role)", "Details Summary"]],
        body: tableData,
        startY: 43,
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255], fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 26 },
          1: { cellWidth: 26 },
          2: { cellWidth: 38 },
          3: { cellWidth: 24 },
          4: { cellWidth: 26 },
          5: { cellWidth: 24 },
          6: { cellWidth: 28 },
          7: { cellWidth: 30 },
          8: { cellWidth: "auto" }
        }
      });

      doc.save(`production_report_${format(new Date(), "yyyyMMdd_HHmmss")}.pdf`);
      showToast("PDF Daily Production Report generated", "success");
    } catch (err: any) {
      console.error("PDF generation failed:", err);
      showToast("Failed to generate PDF report", "error");
    }
  };

  const eventTypes = [
    { key: "ALL", label: "All Events" },
    { key: "WOT_COMPLETE", label: "WOT Complete", count: logs.filter(l => l.log_type === 'WOT_COMPLETE').length },
    { key: "QR_SCAN", label: "QR Scans", count: logs.filter(l => l.log_type === 'QR_SCAN').length },
    { key: "NDP", label: "NDP Incidents", count: logs.filter(l => l.log_type?.startsWith('NDP')).length },
    { key: "FLOOR_REQUEST", label: "Floor Requests", count: logs.filter(l => l.log_type?.startsWith('FLOOR_REQUEST')).length },
    { key: "YIELD_INPUT", label: "Yield Logs", count: logs.filter(l => l.log_type === 'YIELD_INPUT').length },
    { key: "TRANSFER", label: "Transfers", count: logs.filter(l => l.log_type?.includes('TRANSFER')).length },
    { key: "CORRECTION", label: "Audit Notes", count: logs.filter(l => l.log_type === 'CORRECTION').length },
  ];

  return (
    <div className="flex flex-col flex-1 space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by lot, machine, process, user, details..."
                className="pl-9 h-9 text-xs rounded-xl bg-stone-50 border-stone-200 focus:border-stone-900"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons: Advanced Filter, Sound Toggle, Refresh, Export Dropdown */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Toggle */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`h-9 px-3 text-xs font-bold rounded-xl border ${
                showAdvancedFilters || filterProject !== 'ALL' || filterStation !== 'ALL' || filterMachine !== 'ALL' || filterRole !== 'ALL'
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'border-stone-200 text-stone-700'
              }`}
            >
              <Filter className="w-3.5 h-3.5 mr-1.5" /> Filters
              {(filterProject !== 'ALL' || filterStation !== 'ALL' || filterMachine !== 'ALL' || filterRole !== 'ALL') && (
                <span className="w-2 h-2 rounded-full bg-blue-500 ml-1.5" />
              )}
            </Button>

            {/* Sound Toggle */}
            {onToggleSound && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onToggleSound}
                className="h-9 px-3 text-xs font-bold rounded-xl border-stone-200 text-stone-600"
                title={soundEnabled ? "Mute stream alerts" : "Unmute stream alerts"}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-600" /> : <VolumeX className="w-3.5 h-3.5 text-stone-400" />}
              </Button>
            )}

            {/* Refresh */}
            {onRefresh && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onRefresh}
                className="h-9 px-3 text-xs font-bold rounded-xl border-stone-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            )}

            {/* Export Actions */}
            <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200">
              <button
                onClick={handleExportCSV}
                className="px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-white rounded-lg transition"
                title="Export CSV Raw Data"
              >
                CSV
              </button>
              <button
                onClick={handleExportJSON}
                className="px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-white rounded-lg transition"
                title="Export JSON for BI Tools"
              >
                JSON
              </button>
              <button
                onClick={handleExportPDF}
                className="px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition flex items-center gap-1"
                title="Generate PDF Daily Report"
              >
                <Download className="w-3 h-3" /> PDF Report
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Advanced Filters Drawer */}
        {showAdvancedFilters && (
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 animate-in fade-in text-xs">
            <div>
              <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">Project</label>
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="w-full bg-white border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-800"
              >
                <option value="ALL">All Projects ({uniqueProjects.length})</option>
                {uniqueProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name} {p.spk ? `(${p.spk})` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">Workstation</label>
              <select
                value={filterStation}
                onChange={(e) => setFilterStation(e.target.value)}
                className="w-full bg-white border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-800"
              >
                <option value="ALL">All Stations ({uniqueStations.length})</option>
                {uniqueStations.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">Machine Asset</label>
              <select
                value={filterMachine}
                onChange={(e) => setFilterMachine(e.target.value)}
                className="w-full bg-white border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-800"
              >
                <option value="ALL">All Machines ({uniqueMachines.length})</option>
                {uniqueMachines.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-stone-500 mb-1">Actor Role</label>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="w-full bg-white border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-800"
              >
                <option value="ALL">All Roles</option>
                <option value="OPERATOR">Operator</option>
                <option value="SUPERVISOR">Supervisor</option>
                <option value="QC">QC Inspector</option>
                <option value="WAREHOUSE">Warehouse</option>
              </select>
            </div>

            <div className="sm:col-span-2 md:col-span-4 flex items-center justify-between pt-2 border-t border-stone-200">
              <span className="text-stone-500 text-[11px]">
                Showing {filteredLogs.length} of {logs.length} total events
              </span>
              <button
                onClick={() => {
                  setFilterProject("ALL");
                  setFilterStation("ALL");
                  setFilterMachine("ALL");
                  setFilterRole("ALL");
                  setSelectedEventType("ALL");
                  setDateFilter("ALL");
                  setSearchQuery("");
                }}
                className="text-[11px] font-bold text-rose-600 hover:underline"
              >
                Reset All Filters
              </button>
            </div>
          </div>
        )}

        {/* Quick Filter Chips (Event Types & Date Ranges) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Event Types Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {eventTypes.map((t) => (
              <button
                key={t.key}
                onClick={() => setSelectedEventType(t.key)}
                className={`px-3 py-1 text-xs font-bold rounded-xl whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  selectedEventType === t.key
                    ? "bg-stone-900 text-white shadow-xs"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200/70"
                }`}
              >
                <span>{t.label}</span>
                {typeof t.count === 'number' && t.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    selectedEventType === t.key ? "bg-stone-800 text-stone-200" : "bg-stone-200 text-stone-700"
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl text-xs font-bold shrink-0">
            <button
              onClick={() => setDateFilter("ALL")}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition ${dateFilter === 'ALL' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'}`}
            >
              All Time
            </button>
            <button
              onClick={() => setDateFilter("TODAY")}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition ${dateFilter === 'TODAY' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'}`}
            >
              Today
            </button>
            <button
              onClick={() => setDateFilter("WEEK")}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition ${dateFilter === 'WEEK' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'}`}
            >
              This Week
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Stream Container */}
      <div className="relative flex-1 flex flex-col min-h-[450px]">
        {/* Floating New Logs Alert Banner */}
        {showNewLogsBanner && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 animate-in slide-in-from-top duration-200">
            <button
              onClick={scrollToTop}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>{newLogIds.size} new event{newLogIds.size > 1 ? 's' : ''} received • Click to scroll up</span>
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-16 text-stone-400 text-xs">
            <Activity className="w-7 h-7 animate-spin text-stone-600 mb-3" />
            <span className="font-bold text-stone-700">Connecting to real-time production audit stream...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-16 bg-stone-50 rounded-3xl border border-dashed border-stone-200 text-center">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-400 mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-stone-800">No matching production logs</h3>
            <p className="text-xs text-stone-500 mt-1 max-w-sm">
              Event entries will populate automatically as floor operators scan WOTs, confirm gates, report NDPs, or request materials.
            </p>
          </div>
        ) : (
          <div 
            ref={tableContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto rounded-2xl border border-stone-200 max-h-[620px] bg-white shadow-xs"
          >
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-stone-50/90 backdrop-blur-xs border-b border-stone-200 text-stone-600 font-bold sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3.5 whitespace-nowrap">Timestamp</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Project</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Station</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Process</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Machine</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">WOT Lot</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Event Type</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">User</th>
                  <th className="px-4 py-3.5 min-w-[200px]">Details & Proof</th>
                  <th className="px-4 py-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredLogs.map((log) => {
                  const isNew = newLogIds.has(log.id);
                  const isExpanded = expandedRowIds.has(log.id);
                  
                  const isWotComplete = log.log_type === 'WOT_COMPLETE';
                  const isQrScan = log.log_type === 'QR_SCAN';
                  const isNdp = log.log_type?.startsWith('NDP');
                  const isFr = log.log_type?.startsWith('FLOOR_REQUEST');
                  const isYield = log.log_type === 'YIELD_INPUT';
                  const isTransfer = log.log_type?.includes('TRANSFER');
                  const isCorrection = log.log_type === 'CORRECTION';
                  const isRejectedScan = log.log_type === 'REJECTED_SCAN';

                  // Parse Details & Photo evidence
                  let parsedDetails: any = null;
                  let detailsSummary = log.details;
                  let photoUrls: string[] = [];

                  if (typeof log.details === 'string') {
                    try {
                      parsedDetails = JSON.parse(log.details);
                      if (parsedDetails.photo_urls && Array.isArray(parsedDetails.photo_urls)) {
                        photoUrls = parsedDetails.photo_urls;
                      }
                      if (parsedDetails.photo_url) {
                        photoUrls.push(parsedDetails.photo_url);
                      }
                      detailsSummary = parsedDetails.reason || parsedDetails.description || parsedDetails.title || parsedDetails.supervisor_note || log.details;
                    } catch (e) {
                      detailsSummary = log.details;
                    }
                  } else if (typeof log.details === 'object' && log.details !== null) {
                    parsedDetails = log.details;
                    if (parsedDetails.photo_urls) photoUrls = parsedDetails.photo_urls;
                    detailsSummary = parsedDetails.reason || parsedDetails.description || parsedDetails.title || JSON.stringify(parsedDetails);
                  }

                  // Machine status indicator color
                  const machineStatus = (log.machine_status || 'AVAILABLE').toUpperCase();
                  const machineDotColor = 
                    machineStatus === 'BROKEN' ? 'bg-rose-500' :
                    machineStatus === 'MAINTENANCE' ? 'bg-amber-500' :
                    machineStatus === 'RUNNING' || machineStatus === 'ASSIGNED' || machineStatus === 'IN_USE' ? 'bg-blue-500' :
                    'bg-emerald-500';

                  return (
                    <React.Fragment key={log.id || `${log.timestamp}-${Math.random()}`}>
                      <tr 
                        className={`transition-colors duration-300 ${
                          isNew 
                            ? 'bg-amber-50/80 animate-pulse' 
                            : 'hover:bg-stone-50/70'
                        }`}
                      >
                        {/* 1. Timestamp */}
                        <td className="px-4 py-3 font-mono text-[11px] text-stone-600 whitespace-nowrap">
                          {log.timestamp ? format(new Date(log.timestamp), "dd MMM yyyy, HH:mm:ss") : "-"}
                        </td>

                        {/* 2. Project */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-bold text-stone-900">{log.project_name || '-'}</div>
                          {log.spk_number && (
                            <span className="font-mono text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                              {log.spk_number}
                            </span>
                          )}
                        </td>

                        {/* 3. Station */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-bold text-stone-800">
                            {log.station_name || log.station_code || '-'}
                          </span>
                        </td>

                        {/* 4. Process */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-stone-800">{log.process_name || '-'}</div>
                          {log.machine_category && (
                            <span className="text-[10px] font-mono text-stone-400">
                              {log.machine_category}
                            </span>
                          )}
                        </td>

                        {/* 5. Machine */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {log.machine_id ? (
                            <div className="inline-flex items-center gap-1.5 font-mono text-[11px] text-stone-800 font-bold bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
                              <span className={`w-1.5 h-1.5 rounded-full ${machineDotColor}`} title={`Machine Status: ${machineStatus}`} />
                              <span>{log.machine_code || log.machine_name || log.machine_id.slice(0, 8)}</span>
                            </div>
                          ) : (
                            <span className="text-stone-400 font-mono text-[11px]">-</span>
                          )}
                        </td>

                        {/* 6. WOT Lot (Clickable) */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {log.lot_number || log.wot_id ? (
                            <button
                              onClick={() => {
                                setSelectedWotForModal({
                                  id: log.wot_id,
                                  lot_number: log.lot_number || log.wot_id,
                                  project_id: log.project_id,
                                  station_id: log.station_id,
                                  process_id: log.process_id,
                                  machine_id: log.machine_id,
                                  qty: log.wot_qty || 1
                                });
                              }}
                              className="font-mono text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                              title="Click to view WOT Genealogy"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>{log.lot_number || log.wot_id?.slice(0, 10)}</span>
                            </button>
                          ) : (
                            <span className="text-stone-400 font-mono">-</span>
                          )}
                        </td>

                        {/* 7. Event Badge */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                            isWotComplete ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            isQrScan ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            isNdp ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            isFr ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            isYield ? 'bg-purple-50 text-purple-700 border-purple-200' :
                            isTransfer ? 'bg-cyan-50 text-cyan-700 border-cyan-200' :
                            isCorrection ? 'bg-stone-100 text-stone-800 border-stone-300' :
                            isRejectedScan ? 'bg-rose-100 text-rose-800 border-rose-300' :
                            'bg-stone-100 text-stone-700 border-stone-200'
                          }`}>
                            {isWotComplete && <CheckCircle2 className="w-3 h-3" />}
                            {isQrScan && <QrCode className="w-3 h-3" />}
                            {isNdp && <AlertTriangle className="w-3 h-3" />}
                            {isFr && <Layers className="w-3 h-3" />}
                            {isYield && <Activity className="w-3 h-3" />}
                            {isTransfer && <ArrowRightLeft className="w-3 h-3" />}
                            {isCorrection && <MessageSquarePlus className="w-3 h-3" />}
                            {isRejectedScan && <AlertOctagon className="w-3 h-3" />}
                            <span>{log.log_type}</span>
                          </span>
                        </td>

                        {/* 8. User */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-bold text-stone-900 flex items-center gap-1">
                            <User className="w-3 h-3 text-stone-400" />
                            <span>{log.user_name || 'System'}</span>
                          </div>
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                            {log.user_role || 'OPERATOR'}
                          </span>
                        </td>

                        {/* 9. Details & Proof Photos */}
                        <td className="px-4 py-3 text-stone-700">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1 max-w-xs">
                              <p className="line-clamp-2 text-xs text-stone-700">
                                {detailsSummary || '-'}
                              </p>
                              {/* Photo Evidence Thumbnails */}
                              {photoUrls.length > 0 && (
                                <div className="flex items-center gap-1.5 pt-1">
                                  {photoUrls.map((url, i) => (
                                    <button
                                      key={i}
                                      onClick={() => setLightboxPhoto(url)}
                                      className="relative w-8 h-8 rounded-lg border border-stone-200 overflow-hidden hover:opacity-80 transition group"
                                      title="Click to zoom proof photo"
                                    >
                                      <img src={url} alt="Proof" className="w-full h-full object-cover" />
                                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                                        <Eye className="w-3 h-3 text-white" />
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Expand JSON Toggle */}
                            <button
                              onClick={() => toggleRowExpand(log.id)}
                              className="p-1 text-stone-400 hover:text-stone-700 rounded transition"
                              title="Toggle JSON details"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>

                        {/* 10. Actions */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* QC Verify Button */}
                            {log.is_verified ? (
                              <span 
                                className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200"
                                title={`Verified by ${log.verified_by_name || 'QC'}`}
                              >
                                <ShieldCheck className="w-3 h-3" /> Verified
                              </span>
                            ) : (
                              <button
                                onClick={() => handleVerifyLog(log.id)}
                                disabled={verifyingLogId === log.id}
                                className="px-2 py-1 text-[10px] font-bold text-stone-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-stone-200 transition flex items-center gap-1"
                                title="QC Verify this event"
                              >
                                {verifyingLogId === log.id ? (
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                ) : (
                                  <ShieldCheck className="w-3 h-3" />
                                )}
                                <span>Verify</span>
                              </button>
                            )}

                            {/* SPV Correction Note Button */}
                            <button
                              onClick={() => {
                                setCorrectingLog(log);
                                setCorrectionNote("");
                              }}
                              className="p-1 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition"
                              title="Add SPV Audit Note / Correction"
                            >
                              <MessageSquarePlus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded JSON Detail View */}
                      {isExpanded && (
                        <tr className="bg-stone-900 text-stone-200 text-xs font-mono">
                          <td colSpan={10} className="p-4 space-y-2">
                            <div className="flex items-center justify-between text-stone-400 pb-1 border-b border-stone-800">
                              <span className="font-bold flex items-center gap-1 text-[11px] text-emerald-400">
                                <CornerDownRight className="w-3.5 h-3.5" /> IMMUTABLE AUDIT PAYLOAD & RECORD METADATA
                              </span>
                              <span>Log ID: {log.id}</span>
                            </div>
                            <pre className="p-3 bg-stone-950 rounded-xl overflow-x-auto text-[11px] text-emerald-300">
                              {JSON.stringify(
                                {
                                  id: log.id,
                                  log_type: log.log_type,
                                  timestamp: log.timestamp,
                                  project: { id: log.project_id, name: log.project_name, spk: log.spk_number },
                                  workstation: { id: log.station_id, name: log.station_name },
                                  process: { id: log.process_id, name: log.process_name },
                                  machine: { id: log.machine_id, code: log.machine_code, name: log.machine_name, status: log.machine_status },
                                  wot: { id: log.wot_id, lot_number: log.lot_number, qty: log.wot_qty },
                                  actor: { id: log.user_id, name: log.user_name, role: log.user_role },
                                  verification: { is_verified: log.is_verified, verified_by: log.verified_by_name, verified_at: log.verified_at },
                                  payload_details: parsedDetails || log.details
                                },
                                null,
                                2
                              )}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lightbox Photo Preview Modal */}
      <Modal
        isOpen={Boolean(lightboxPhoto)}
        onClose={() => setLightboxPhoto(null)}
        maxWidth="3xl"
        contentClassName="p-0 overflow-hidden bg-stone-900 border-stone-700"
        title={
          <span className="font-bold text-white text-xs flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-emerald-400" /> Photo Proof Inspection
          </span>
        }
      >
        {lightboxPhoto && (
          <div>
            <div className="p-4 bg-stone-950 flex items-center justify-center max-h-[75vh]">
              <img src={lightboxPhoto} alt="Evidence Large" className="max-w-full max-h-[70vh] object-contain rounded-xl" />
            </div>
            <div className="p-3 bg-stone-900 border-t border-stone-800 flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setLightboxPhoto(null)}
                className="text-xs font-bold rounded-xl"
              >
                Close Preview
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Load More Pagination */}
      {!loading && filteredLogs.length > 0 && hasMore && onLoadMore && (
        <div className="flex justify-center pt-4 pb-2">
          <Button
            variant="secondary"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-full shadow-sm px-6 bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
          >
            {loadingMore ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Loading More...
              </>
            ) : (
              "Load Older Logs"
            )}
          </Button>
        </div>
      )}

      {/* WOT Genealogy Travel Log Modal */}
      {selectedWotForModal && (
        <WotGenealogyModal
          isOpen={!!selectedWotForModal}
          onClose={() => setSelectedWotForModal(null)}
          wot={selectedWotForModal}
        />
      )}

      {/* SPV Correction Note Modal */}
      <Modal
        isOpen={Boolean(correctingLog)}
        onClose={() => setCorrectingLog(null)}
        maxWidth="md"
        contentClassName="p-6 space-y-4"
        title={
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-stone-800" />
            <h3 className="text-sm font-black text-stone-900">Add SPV Audit Correction Note</h3>
          </div>
        }
      >
        {correctingLog && (
          <div className="space-y-4">
            <p className="text-xs text-stone-500">
              Per Section 16.2, logs are strictly immutable. Submitting this form will append a new <span className="font-bold text-stone-900">CORRECTION</span> log referencing entry <span className="font-mono font-bold">[{correctingLog.id?.slice(0, 8)}]</span>.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700">Supervisor Audit Note</label>
              <textarea
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                placeholder="Describe reason for note or correction adjustment..."
                rows={4}
                className="w-full text-xs p-3 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:border-stone-900 outline-hidden resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCorrectingLog(null)}
                className="rounded-xl text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitCorrection}
                disabled={submittingCorrection || !correctionNote.trim()}
                className="bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold"
              >
                {submittingCorrection ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : "Append Correction"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
