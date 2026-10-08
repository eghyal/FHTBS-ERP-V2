import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Factory,
  Search,
  Filter,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sliders,
  Layers,
  ChevronRight,
  RefreshCw,
  AlertOctagon,
  Building2,
  Package,
  Play,
  CheckCircle,
  Activity,
  FileText,
  QrCode,
  Printer,
  Download,
  ExternalLink,
  ShieldCheck,
  User,
  X
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { generatePDF } from "@/lib/pdfGenerator";
import { cn } from "@/lib/utils";
import { ProductionAnalyticsDashboard } from "./ProductionAnalyticsDashboard";

interface ProjectCard {
  id: string;
  name: string;
  spk_number?: string;
  customer?: string;
  due_date: string;
  status: string;
  budget?: number;
  progress?: number;
  total_tasks?: number;
  completed_tasks?: number;
  active_ndp_count?: number;
  last_bop_step?: string;
}

export function Production() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();

  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [allNdps, setAllNdps] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Document Preview & QR Modals
  const [showQrLookupModal, setShowQrLookupModal] = useState(false);
  const [qrSearchInput, setQrSearchInput] = useState("");
  const [searchedTagResult, setSearchedTagResult] = useState<any | null>(null);
  const [isSearchingTag, setIsSearchingTag] = useState(false);

  const handleSearchTravelTag = async (query: string) => {
    if (!query.trim()) return;
    setIsSearchingTag(true);
    try {
      const res = await apiFetch("/api/production/travel-tags", {}, user?.username);
      const tagList = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
      const found = tagList.find(
        (t: any) =>
          t.tag_number?.toLowerCase().includes(query.trim().toLowerCase()) ||
          t.id?.toLowerCase() === query.trim().toLowerCase()
      );
      if (found) {
        setSearchedTagResult(found);
      } else {
        setSearchedTagResult(null);
        showToast(language === "id" ? "Travel Tag tidak ditemukan" : "Travel Tag not found", "info");
      }
    } catch (e) {
      showToast("Gagal mencari Travel Tag", "error");
    } finally {
      setIsSearchingTag(false);
    }
  };

  // Fetch Production Hub Data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [projRes, tasksRes, ndpRes] = await Promise.all([
        apiFetch("/api/projects", {}, user?.username),
        apiFetch("/api/project-tasks", {}, user?.username),
        apiFetch("/api/production/ndp", {}, user?.username)
      ]);

      let ndpMap: Record<string, number> = {};
      if (ndpRes.ok && Array.isArray(ndpRes.data)) {
        setAllNdps(ndpRes.data);
        ndpRes.data.forEach((ndp: any) => {
          if (ndp.status === "ACTIVE") {
            ndpMap[ndp.project_id] = (ndpMap[ndp.project_id] || 0) + 1;
          }
        });
      }

      if (tasksRes.ok && Array.isArray(tasksRes.data)) {
        setTasks(tasksRes.data);
      }

      if (projRes.ok && Array.isArray(projRes.data)) {
        const nonMfgIds = ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"];
        const isNonMfg = (p: any) => {
          if (!p) return true;
          if (nonMfgIds.includes(p.id)) return true;
          const name = (p.name || "").toLowerCase();
          const spk = (p.spk_number || "").toLowerCase();
          const cust = (p.customer || "").toLowerCase();
          return (
            name.includes("consumable") ||
            name.includes("transportation") ||
            name.includes("other procurement") ||
            name.includes("general procurement") ||
            name.includes("konsumabel") ||
            name.includes("transportasi") ||
            spk.includes("consumable") ||
            spk.includes("transport") ||
            cust.includes("internal")
          );
        };

        const mfgProjects = projRes.data.filter((p: any) => !isNonMfg(p));

        const mapped = mfgProjects.map((p: any) => {
          const pTasks = Array.isArray(tasksRes.data)
            ? tasksRes.data.filter((t: any) => t.project_id === p.id)
            : [];
          const totalT = pTasks.length;
          const compT = pTasks.filter((t: any) => t.status === "COMPLETED").length;
          const prog = totalT > 0 ? Math.round((compT / totalT) * 100) : (p.status === "COMPLETED" ? 100 : 0);

          return {
            ...p,
            total_tasks: totalT,
            completed_tasks: compT,
            progress: prog,
            active_ndp_count: ndpMap[p.id] || 0
          };
        });
        setProjects(mapped);
      }
    } catch (err) {
      console.error("Error loading production projects:", err);
      showToast("Failed to load production hub", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered Projects
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesSearch =
        (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.spk_number || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.customer || "").toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === "ACTIVE") return p.status !== "COMPLETED" && (p.active_ndp_count || 0) === 0;
      if (statusFilter === "PAUSED") return (p.active_ndp_count || 0) > 0;
      if (statusFilter === "COMPLETED") return p.status === "COMPLETED";
      return true;
    });
  }, [projects, searchQuery, statusFilter]);

  // Gantt Date Window Calculation (Next 30 Days)
  const ganttDays = useMemo(() => {
    const days: { dateStr: string; label: string; isToday: boolean }[] = [];
    const today = new Date();
    for (let i = -2; i < 28; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const str = d.toISOString().split("T")[0];
      days.push({
        dateStr: str,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        isToday: i === 0
      });
    }
    return days;
  }, []);

  // Summary Metrics
  const activeSpkCount = projects.filter(p => p.status !== "COMPLETED").length;
  const runningOpsCount = projects.filter(p => p.status !== "COMPLETED" && (p.active_ndp_count || 0) === 0).length;
  const pausedNdpCount = projects.filter(p => (p.active_ndp_count || 0) > 0).length;
  const completedCount = projects.filter(p => p.status === "COMPLETED").length;

  return (
    <div className="space-y-6">
      {/* Standard ERP Page Header */}
      <PageHeader
        title={language === "id" ? "Pusat Produksi" : "Production Hub"}
        subtitle={
          language === "id"
            ? "Perintah kerja dan jadwal lantai produksi"
            : "Work orders and shop floor scheduling"
        }
        icon={<Factory className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2.5">
            {/* Quick Travel Tag QR Scanner / Lookup */}
            <Button
              variant="secondary"
              onClick={() => setShowQrLookupModal(true)}
              className="border-stone-200 bg-white hover:bg-stone-50 text-stone-700 rounded-xl text-xs font-bold flex items-center gap-1.5 h-9 px-3.5 shadow-2xs active:scale-95 transition-all"
            >
              <QrCode className="w-3.5 h-3.5 text-emerald-600" />
              <span>{language === "id" ? "Pindai QR Travel Tag" : "Lookup QR Tag"}</span>
            </Button>

            {/* Standard ERP Header Refresh Button */}
            <button
              type="button"
              onClick={loadData}
              className="p-2 md:p-2.5 bg-stone-50 hover:bg-stone-100 rounded-xl md:rounded-2xl text-stone-400 hover:text-stone-600 transition-all active:scale-95 flex items-center justify-center shadow-sm cursor-pointer"
              title={language === "id" ? "Perbarui Data" : "Refresh Data"}
            >
              <RefreshCw className={cn("w-4 h-4 md:w-4.5 md:h-4.5", isLoading && "animate-spin")} />
            </button>
          </div>
        }
      />

      {/* Standard ERP KPI Metric Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Active SPK */}
        <div className="card-elegant rounded-[2rem] p-6 bg-white border border-stone-200 shadow-xs">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-center text-stone-700">
              <Factory className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-stone-400 tracking-[0.2em] font-mono">01</span>
          </div>
          <div className="text-[10px] text-stone-400 font-bold mb-1 uppercase tracking-[0.2em]">
            {language === "id" ? "SPK Aktif" : "Active SPK Projects"}
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-light tracking-tighter text-stone-900 leading-none">
              {activeSpkCount}
            </div>
            <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              {language === "id" ? "proyek berjalan" : "in manufacturing"}
            </span>
          </div>
        </div>

        {/* Card 2: Running Operations */}
        <div className="card-elegant rounded-[2rem] p-6 bg-white border border-stone-200 shadow-xs">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <Play className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-stone-400 tracking-[0.2em] font-mono">02</span>
          </div>
          <div className="text-[10px] text-stone-400 font-bold mb-1 uppercase tracking-[0.2em]">
            {language === "id" ? "Operasi Berjalan" : "Active Running"}
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-light tracking-tighter text-blue-700 leading-none">
              {runningOpsCount}
            </div>
            <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              {language === "id" ? "pada stasiun kerja" : "on work centers"}
            </span>
          </div>
        </div>

        {/* Card 3: Paused (NDP Incidents) */}
        <div className="card-elegant rounded-[2rem] p-6 bg-white border border-stone-200 shadow-xs">
          <div className="flex justify-between items-start mb-4">
            <div className={cn(
              "w-10 h-10 rounded-xl border flex items-center justify-center",
              pausedNdpCount > 0
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-stone-50 border-stone-200 text-stone-400"
            )}>
              <AlertOctagon className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-stone-400 tracking-[0.2em] font-mono">03</span>
          </div>
          <div className="text-[10px] text-stone-400 font-bold mb-1 uppercase tracking-[0.2em]">
            {language === "id" ? "Downtime / NDP" : "Incident Downtime"}
          </div>
          <div className="flex items-baseline gap-2">
            <div className={cn(
              "text-2xl font-light tracking-tighter leading-none",
              pausedNdpCount > 0 ? "text-amber-600 font-bold" : "text-stone-900"
            )}>
              {pausedNdpCount}
            </div>
            <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              {language === "id" ? "tertunda (NDP)" : "paused operations"}
            </span>
          </div>
        </div>

        {/* Card 4: Finished Goods Inbounded */}
        <div className="card-elegant rounded-[2rem] p-6 bg-white border border-stone-200 shadow-xs">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <CheckCircle className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-stone-400 tracking-[0.2em] font-mono">04</span>
          </div>
          <div className="text-[10px] text-stone-400 font-bold mb-1 uppercase tracking-[0.2em]">
            {language === "id" ? "Produk Selesai (FG)" : "Completed (FG)"}
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-light tracking-tighter text-emerald-700 leading-none">
              {completedCount}
            </div>
            <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              {language === "id" ? "masuk gudang" : "inbounded"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Workspace Card Container */}
      <div className="card-elegant rounded-[2rem] overflow-hidden bg-white border border-stone-200 shadow-xs">
        {/* Search & Filter Header Strip */}
        <div className="p-6 md:p-8 flex flex-col xl:flex-row xl:items-center justify-between gap-6 border-b border-stone-100">
          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "ALL", label: language === "id" ? `Semua (${projects.length})` : `All (${projects.length})` },
              { id: "ACTIVE", label: language === "id" ? `Aktif (${projects.filter(p => p.status !== "COMPLETED" && (p.active_ndp_count || 0) === 0).length})` : `Active (${projects.filter(p => p.status !== "COMPLETED" && (p.active_ndp_count || 0) === 0).length})` },
              { id: "PAUSED", label: `Paused / NDP (${projects.filter(p => (p.active_ndp_count || 0) > 0).length})` },
              { id: "COMPLETED", label: language === "id" ? `Selesai (${projects.filter(p => p.status === "COMPLETED").length})` : `Completed (${projects.filter(p => p.status === "COMPLETED").length})` },
              { id: "ANALYTICS", label: `Analytics` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider",
                  statusFilter === tab.id
                    ? "bg-stone-900 text-white shadow-xs"
                    : "bg-stone-100/70 text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          {statusFilter !== "ANALYTICS" && (
          <div className="relative min-w-[280px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder={language === "id" ? "Cari nomor SPK, nama proyek, pelanggan..." : "Search SPK, project name, customer..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-stone-50/70 border border-stone-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-semibold text-stone-900 focus:bg-white focus:outline-stone-900"
            />
          </div>
          )}
        </div>

        {/* Dynamic Content */}
        {statusFilter === "ANALYTICS" ? (
          <ProductionAnalyticsDashboard />
        ) : (
        <div className="p-6 md:p-8">
          {filteredProjects.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-stone-700">
                {language === "id" ? "Tidak ada proyek manufaktur ditemukan" : "No manufacturing projects found"}
              </h3>
              <p className="text-xs text-stone-400 mt-1">
                {language === "id" ? "Coba sesuaikan kata kunci pencarian atau filter status." : "Try adjusting your search query or status filter."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project) => {
                const isPaused = (project.active_ndp_count || 0) > 0;
                const isDone = project.status === "COMPLETED";

                return (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/production/project/${project.id}`)}
                    className={cn(
                      "bg-white rounded-3xl p-6 border shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden",
                      isPaused
                        ? "border-amber-300 hover:border-amber-400 bg-amber-50/20"
                        : "border-stone-200 hover:border-stone-800"
                    )}
                  >
                    {/* Top Status & SPK */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <span className="text-[10px] font-black uppercase font-mono tracking-widest text-stone-400 block mb-1">
                          {project.spk_number || "SPK-PROJECT"}
                        </span>
                        <h3 className="text-sm font-black text-stone-900 group-hover:text-stone-700 transition-colors line-clamp-1">
                          {project.name}
                        </h3>
                        <p className="text-xs text-stone-500 font-medium line-clamp-1 mt-0.5">
                          {project.customer || "General Manufacturing"}
                        </p>
                      </div>

                      {/* Status Badges */}
                      <div className="shrink-0">
                        {isPaused ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                            <AlertOctagon className="w-3 h-3" /> NDP PAUSED
                          </span>
                        ) : isDone ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> FG INBOUNDED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            <Play className="w-3 h-3" /> RUNNING
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar & Details */}
                    <div className="space-y-3 pt-3 border-t border-stone-100">
                      <div>
                        <div className="flex justify-between text-xs font-bold mb-1.5">
                          <span className="text-stone-500">
                            {language === "id" ? "Progres Eksekusi BoP:" : "BoP Process Progress:"}
                          </span>
                          <span className="text-stone-900 font-mono">{project.progress}%</span>
                        </div>
                        <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={cn(
                              "h-full transition-all duration-300",
                              isDone ? "bg-emerald-600" : (isPaused ? "bg-amber-500" : "bg-stone-900")
                            )}
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-stone-500 pt-3 border-t border-stone-100">
                        <div className="flex items-center gap-4 font-medium">
                          <div className="flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-stone-400" />
                            <span>{(project as any).station_count || 0} Stations</span>
                          </div>
                          {(project as any).total_wots > 0 && (
                            <div className="flex items-center gap-1.5 text-stone-600 font-semibold bg-stone-100 px-2 py-0.5 rounded-md text-[11px]">
                              <Package className="w-3 h-3 text-stone-500" />
                              <span>{(project as any).completed_wots || 0}/{(project as any).total_wots} WOT</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-stone-400" />
                            <span>
                              {project.due_date
                                ? `${language === "id" ? "Tenggat:" : "Due:"} ${new Date(project.due_date).toLocaleDateString()}`
                                : "Flexible Schedule"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/projects/${project.id}`);
                            }}
                            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
                            title={language === "id" ? "Detail SPK & Dokumen" : "Project Details"}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <div className="flex items-center gap-1 text-stone-900 font-bold group-hover:translate-x-0.5 transition-transform text-xs">
                            <span>{language === "id" ? "Buka Hub" : "Open Hub"}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-900" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Master Gantt Timeline Card Container */}
      <div className="card-elegant rounded-[2rem] overflow-hidden bg-white border border-stone-200 shadow-xs">
        <div className="p-6 md:p-8 border-b border-stone-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black tracking-tight text-stone-900">
              {language === "id" ? "Jadwal & Timeline Gantt Manufaktur" : "Master Production Gantt Timeline"}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {language === "id"
                ? "Jadwal operasional harian seluruh stasiun kerja dan tahapan proses SPK aktif."
                : "Operational schedule across work center stations and active SPK processes."}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-stone-600">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
              {language === "id" ? "Berjalan" : "Running"}
            </span>
            <span className="flex items-center gap-1.5 text-stone-600">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              {language === "id" ? "Tertunda (NDP)" : "Paused (NDP)"}
            </span>
            <span className="flex items-center gap-1.5 text-stone-600">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
              {language === "id" ? "Selesai" : "Completed"}
            </span>
          </div>
        </div>

        {/* Timeline View Canvas */}
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            {/* Header Days Row */}
            <div className="flex border-b border-stone-200 bg-stone-50/70 text-[11px] font-bold text-stone-500">
              <div className="w-64 p-3.5 border-r border-stone-200 shrink-0 uppercase tracking-wider text-[10px]">
                {language === "id" ? "Proyek / Tahap Proses" : "Project / Process Operation"}
              </div>
              <div className="flex-1 flex">
                {ganttDays.map((d, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 p-2 text-center border-r border-stone-100 font-mono text-[10px]",
                      d.isToday && "bg-amber-100/50 text-amber-900 font-black border-amber-300"
                    )}
                  >
                    {d.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-stone-100 text-xs">
              {projects.filter(p => p.status !== "COMPLETED").map((proj) => {
                const projTasks = tasks.filter(t => t.project_id === proj.id);

                return (
                  <div key={proj.id} className="hover:bg-stone-50/50 transition-colors">
                    {/* Project Header Bar */}
                    <div className="flex items-center bg-stone-50/80 font-bold p-2.5 px-4 border-b border-stone-100">
                      <span className="w-64 shrink-0 font-black text-stone-900 text-xs truncate">
                        {proj.name} ({proj.spk_number || "SPK"})
                      </span>
                      <span className="text-[10px] text-stone-500 font-mono">
                        {projTasks.length} {language === "id" ? "Tahapan Didefinisikan" : "Steps Defined"}
                      </span>
                    </div>

                    {/* Tasks of this project */}
                    {projTasks.length === 0 ? (
                      <div className="p-3.5 text-stone-400 text-xs pl-8 italic">
                        {language === "id"
                          ? "Belum ada tahapan proses. Buka proyek untuk mengonfigurasi Alur Proses (BoP)."
                          : "No process tasks defined yet. Open project to configure Bill of Process."}
                      </div>
                    ) : (
                      projTasks.map((task) => {
                        const isPrTask = Boolean(task.pr_id || (task.task_name && task.task_name.includes("[Procurement]")));
                        
                        let leftPercent = 0;
                        let widthPercent = 100;
                        if (ganttDays.length > 0 && task.start_date && task.end_date) {
                          const totalDays = ganttDays.length;
                          const minDate = ganttDays[0].dateStr;
                          const maxDate = ganttDays[totalDays - 1].dateStr;

                          const start = task.start_date < minDate ? minDate : task.start_date;
                          const end = task.end_date > maxDate ? maxDate : task.end_date;

                          let startIdx = ganttDays.findIndex(d => d.dateStr >= start);
                          let endIdx = ganttDays.findIndex(d => d.dateStr >= end);
                          if (startIdx < 0) startIdx = 0;
                          if (endIdx < 0) endIdx = totalDays - 1;

                          const dur = Math.max(1, endIdx - startIdx + 1);
                          leftPercent = (startIdx / totalDays) * 100;
                          widthPercent = (dur / totalDays) * 100;
                        }

                        let barBg = "bg-stone-400";
                        if (isPrTask) {
                          if (task.status === "COMPLETED") barBg = "bg-indigo-600";
                          else if (task.status === "REJECTED") barBg = "bg-rose-600";
                          else if (task.status === "IN_PROGRESS" || task.status === "RUNNING") barBg = "bg-amber-500";
                          else barBg = "bg-purple-400";
                        } else {
                          if (task.status === "COMPLETED") barBg = "bg-emerald-600";
                          else if (task.status === "PAUSED") barBg = "bg-amber-500 animate-pulse";
                          else if (task.status === "RUNNING") barBg = "bg-blue-600";
                          else barBg = "bg-slate-400";
                        }

                        return (
                          <div key={task.id} className="flex items-center h-10 border-b border-stone-50">
                            <div className="w-64 px-4 pl-8 text-xs font-semibold text-stone-700 truncate shrink-0 border-r border-stone-100 flex items-center justify-between gap-1">
                              <span className="truncate">{task.task_name || "Task"}</span>
                              {isPrTask && (
                                <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 shrink-0">
                                  PR
                                </span>
                              )}
                            </div>
                            <div className="flex-1 h-full relative flex items-center px-1">
                              <div
                                style={{
                                  left: `${leftPercent}%`,
                                  width: `${Math.max(4, widthPercent)}%`,
                                }}
                                className={cn(
                                  "absolute h-6 rounded-md px-2 flex items-center text-[10px] font-bold text-white shadow-2xs transition-all",
                                  barBg
                                )}
                                title={`${task.task_name} | ${task.start_date || ''} -> ${task.end_date || ''} (${task.status})`}
                              >
                                <span className="truncate">
                                  {isPrTask ? "PR Delivery: " : ""}{task.status} ({task.progress || 0}%)
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: QUICK TRAVEL TAG QR LOOKUP */}
      <Modal
        isOpen={showQrLookupModal}
        onClose={() => {
          setShowQrLookupModal(false);
          setSearchedTagResult(null);
          setQrSearchInput("");
        }}
        title={language === "id" ? "Pencarian & Validasi QR Travel Tag" : "Travel Tag QR Lookup & Audit"}
        maxWidth="lg"
      >
        <div className="space-y-6 p-6">
          {/* Search Input Bar */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-700">
              {language === "id" ? "Masukkan Nomor Travel Tag atau Scan QR Code" : "Enter Travel Tag Number or Scan QR Code"}
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  placeholder="e.g. TT-202608-001 / TG-12345"
                  value={qrSearchInput}
                  onChange={(e) => setQrSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearchTravelTag(qrSearchInput);
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-2 text-xs font-semibold text-stone-900 focus:bg-white focus:outline-stone-900"
                />
              </div>
              <Button
                onClick={() => handleSearchTravelTag(qrSearchInput)}
                disabled={isSearchingTag}
                className="bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold px-4 h-9"
              >
                {isSearchingTag ? "Mencari..." : "Cari Tag"}
              </Button>
            </div>
          </div>

          {/* Search Result Display */}
          {searchedTagResult ? (
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">
                    QC PASSED TAG
                  </span>
                  <span className="font-mono font-bold text-xs text-stone-900">{searchedTagResult.tag_number}</span>
                </div>
                <span className="text-[10px] text-stone-400 font-mono">
                  {searchedTagResult.created_at ? new Date(searchedTagResult.created_at).toLocaleString() : ""}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="p-3 bg-white rounded-2xl border border-stone-200 shadow-2xs shrink-0 flex flex-col items-center">
                  <QRCodeSVG
                    value={
                      typeof searchedTagResult.qr_payload === "string"
                        ? searchedTagResult.qr_payload
                        : JSON.stringify(searchedTagResult.qr_payload || { id: searchedTagResult.id })
                    }
                    size={120}
                    level="H"
                    includeMargin={true}
                  />
                  <span className="text-[9px] font-mono text-stone-400 mt-1">Audit QR Verified</span>
                </div>

                <div className="flex-1 space-y-2 text-xs w-full">
                  <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-stone-100">
                    <div>
                      <span className="text-[10px] text-stone-400 font-bold uppercase block">Proyek / SPK</span>
                      <span className="font-bold text-stone-800 truncate block">
                        {searchedTagResult.project_name || searchedTagResult.spk_number || "SPK"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 font-bold uppercase block">Tahap Proses</span>
                      <span className="font-bold text-stone-800 truncate block">
                        {searchedTagResult.process_name || "Manufacturing Step"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 font-bold uppercase block">Operator</span>
                      <span className="font-medium text-stone-700 block">{searchedTagResult.operator_name || "-"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 font-bold uppercase block">QC Inspector</span>
                      <span className="font-medium text-emerald-700 font-bold block">
                        {searchedTagResult.qc_inspector || "QC Lead"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 font-bold uppercase block">Good Qty</span>
                      <span className="font-bold text-emerald-600 block">{searchedTagResult.good_qty || 1} Unit</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 font-bold uppercase block">Scrap Qty</span>
                      <span className="font-bold text-rose-600 block">{searchedTagResult.scrap_qty || 0} Unit</span>
                    </div>
                  </div>

                  {searchedTagResult.project_id && (
                    <Button
                      onClick={() => {
                        setShowQrLookupModal(false);
                        navigate(`/production/project/${searchedTagResult.project_id}`);
                      }}
                      className="w-full bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold gap-1.5 h-8 mt-2"
                    >
                      <span>{language === "id" ? "Buka Hub Produksi Terkait" : "Open Related Production Hub"}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-stone-400 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
              <QrCode className="w-8 h-8 mx-auto mb-2 text-stone-300" />
              <span>{language === "id" ? "Ketik nomor Travel Tag di atas untuk melihat data QR digital dan audit QC." : "Type a Travel Tag number above to audit QC verification and QR data."}</span>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-stone-100">
            <Button
              variant="secondary"
              onClick={() => {
                setShowQrLookupModal(false);
                setSearchedTagResult(null);
                setQrSearchInput("");
              }}
              className="rounded-xl text-xs"
            >
              {language === "id" ? "Tutup" : "Close"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default Production;

