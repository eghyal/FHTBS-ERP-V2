import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  AlertTriangle,
  Package,
  FileText,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  X,
  Truck,
  QrCode,
  Activity,
  Cpu,
  Radio,
  ExternalLink,
  MessageSquare,
  AlertOctagon,
  ArrowRight,
  Calculator,
  DollarSign,
  PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader } from "@/components/shared/Loader";
import { Button } from "@/components/ui/Button";
import { AuditTimeline } from "@/components/erp/AuditTimeline";
import { ProjectHppModal } from "@/components/erp/ProjectHppModal";

const calculateCPM = (steps: any[], qty: number, ff: number) => {
  const nodes = steps.map(s => {
    const ct = s.cycle_time_minutes || (s.cycle_time_seconds ? s.cycle_time_seconds / 60 : 60);
    const durationDays = (qty * ct) / (1 * (ff / 100) * 8 * 60); 
    return { ...s, duration: Math.max(0.01, durationDays) };
  });

  const es: Record<string, number> = {}, ef: Record<string, number> = {};
  nodes.forEach(n => {
    let preds: string[] = [];
    try {
      preds = typeof n.predecessor_ids === 'string' ? JSON.parse(n.predecessor_ids) : n.predecessor_ids || [];
    } catch (e) {}
    es[n.id] = preds.length > 0 ? Math.max(...preds.map((pId: string) => ef[pId] || 0)) : 0;
    ef[n.id] = es[n.id] + n.duration;
  });

  const projectEF = Math.max(...Object.values(ef), 0);
  const ls: Record<string, number> = {}, lf: Record<string, number> = {};
  [...nodes].reverse().forEach(n => {
    const succs = nodes.filter(s => {
      let sPreds: string[] = [];
      try { sPreds = typeof s.predecessor_ids === 'string' ? JSON.parse(s.predecessor_ids) : s.predecessor_ids || []; } catch (e) {}
      return sPreds.includes(n.id);
    });
    lf[n.id] = succs.length > 0 ? Math.min(...succs.map((s: any) => ls[s.id] || projectEF)) : projectEF;
    ls[n.id] = lf[n.id] - n.duration;
  });

  return nodes.map(n => ({
    ...n,
    es_days: es[n.id], ef_days: ef[n.id],
    ls_days: ls[n.id], lf_days: lf[n.id],
    float_days: ls[n.id] - es[n.id],
    is_critical_path: Math.abs(ls[n.id] - es[n.id]) < 0.001
  }));
};

interface Project {
  id: string;
  name: string;
  due_date: string;
  customer: string;
  remarks: string;
  status: string;
  urgency: string;
  bq_updated_at?: string;
  parent_project_id?: string;
  is_master_set?: boolean;
  spk_id?: string;
}

interface PR {
  pr_number: string;
  status: string;
  created_at: string;
  item_count: number;
  has_po?: boolean;
}

interface BOMItem {
  id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  uom: string;
  total_required_qty: number;
  free_stock: number;
  received_by_production?: number;
}

interface BopStep {
  id: string;
  step_sequence: number;
  step_name: string;
  node_type: string;
  target_qty: number;
  completed_qty: number;
  progress: number;
  status: string;
  lifecycle_status?: string;
  bom_allocations?: string;
  is_manual_pause?: boolean;
  pause_type?: string;
  cycle_time_seconds?: number;
  lot_size?: number;
  transfer_mode?: string;
}

const getShortCode = (rawCode: string | null): string => {
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

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [bopSteps, setBopSteps] = useState<BopStep[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [bom, setBom] = useState<BOMItem[]>([]);
  const [prs, setPrs] = useState<PR[]>([]);
  const [wots, setWots] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [activeNdps, setActiveNdps] = useState<any[]>([]);
  const [activeFloorRequests, setActiveFloorRequests] = useState<any[]>([]);
  const [ganttFilter, setGanttFilter] = useState<"ALL" | "PROCUREMENT" | "MANUFACTURING">("ALL");

  // HPP Dual-View State
  const [showHppModal, setShowHppModal] = useState(false);
  const [hppModalMode, setHppModalMode] = useState<"MATERIAL_ONLY" | "FULL_COSTING">("MATERIAL_ONLY");
  const [hppBreakdown, setHppBreakdown] = useState<any>(null);
  const [cogsCardMode, setCogsCardMode] = useState<"MATERIAL_ONLY" | "FULL_COSTING">("MATERIAL_ONLY");

  const fetchProjectData = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/projects/${id}`, {}, user?.username || "");
      if (res.ok && res.data) {
        setProject(res.data.project || null);
        setBopSteps(res.data.processes || res.data.bopSteps || []);
        setTasks(res.data.tasks || []);
        setBom(res.data.bom || []);
        setPrs(res.data.prs || []);
        setWots(res.data.wots || []);
        setRecentLogs(res.data.recent_production_logs || []);
        setActiveNdps(res.data.active_ndps || []);
        setActiveFloorRequests(res.data.active_floor_requests || []);
        setHppBreakdown(res.data.hpp_breakdown || null);
      } else {
        showToast(res.error || "Failed to fetch project details", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error loading project data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [id]);

  // Gantt Date Window Calculation
  const ganttDays = useMemo(() => {
    const dates: { dateStr: string; label: string; isToday: boolean }[] = [];
    const today = new Date();
    
    // Find min start date among tasks or project creation date
    let minDate = new Date();
    if (project?.bq_updated_at || (project as any)?.created_at) {
      minDate = new Date((project as any)?.created_at || project?.bq_updated_at);
    }

    if (tasks.length > 0) {
      tasks.forEach((t) => {
        if (t.start_date) {
          const d = new Date(t.start_date);
          if (d < minDate) minDate = d;
        }
      });
    }

    for (let i = -1; i < 21; i++) {
      const d = new Date(minDate);
      d.setDate(d.getDate() + i);
      const str = d.toISOString().split("T")[0];
      const todayStr = today.toISOString().split("T")[0];
      dates.push({
        dateStr: str,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        isToday: str === todayStr,
      });
    }
    return dates;
  }, [tasks, project]);

  const materialFlowMetrics = useMemo(() => {
    if (!bopSteps || bopSteps.length === 0) return null;
    
    const targetQty = (project as any)?.qty || 1;
    const cpmNodes = calculateCPM(bopSteps, targetQty, 85);
    const estWorkingDays = Math.max(...cpmNodes.map(n => n.ef_days), 0);
    
    const finishDate = new Date();
    finishDate.setDate(finishDate.getDate() + Math.ceil(estWorkingDays));
    const estFinishDateStr = finishDate.toLocaleDateString();

    const hasDueDate = Boolean(project?.due_date);
    const dueDateObj = project?.due_date ? new Date(project.due_date) : null;
    const isOverdue = dueDateObj ? finishDate > dueDateObj : false;
    const isTight = dueDateObj && !isOverdue ? (dueDateObj.getTime() - finishDate.getTime()) / (1000 * 3600 * 24) <= 2 : false;

    return {
      cpmNodes,
      estWorkingDays,
      dailyCapacity: estWorkingDays > 0 ? targetQty / estWorkingDays : 0,
      estFinishDateStr,
      hasDueDate,
      isOverdue,
      isTight,
    };
  }, [bopSteps, project]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold text-stone-800">Project Not Found</h2>
        <Button onClick={() => navigate("/erp/production")} variant="secondary">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Production
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => navigate("/erp/production")}
            variant="ghost"
            size="sm"
            className="text-stone-600 hover:bg-stone-100 rounded-xl"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
                {getShortCode(project.id)}
              </span>
              <span
                className={cn(
                  "text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border",
                  project.status === "COMPLETED" || project.status === "FINISHED"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : project.status === "IN_PROGRESS" || project.status === "RUNNING"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                )}
              >
                {project.status}
              </span>
              {project.urgency === "HIGH" || project.urgency === "CRITICAL" ? (
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                  {project.urgency}
                </span>
              ) : null}
            </div>
            <h1 className="text-xl font-black text-stone-900 tracking-tight mt-1">
              {project.name}
            </h1>
            {project.customer && (
              <p className="text-xs text-stone-500 font-medium">
                Customer: <span className="text-stone-800 font-semibold">{project.customer}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setHppModalMode("MATERIAL_ONLY");
              setShowHppModal(true);
            }}
            variant="secondary"
            className="border-stone-300 text-stone-800 hover:bg-stone-100 text-xs font-bold rounded-xl h-9 px-3.5 flex items-center gap-1.5 shadow-2xs"
          >
            <Calculator className="w-3.5 h-3.5 text-stone-600" />
            <span>Analisis HPP & COGS</span>
          </Button>
          <Button
            onClick={() => navigate(`/erp/production/hub/${project.id}`)}
            className="bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl h-9 px-3.5"
          >
            Open Production Hub
          </Button>
          <Button
            onClick={() => fetchProjectData()}
            variant="ghost"
            size="sm"
            className="text-stone-600 hover:bg-stone-100 rounded-xl"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Active NDP Lockdown Banner */}
      {activeNdps.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 p-4 rounded-2xl flex items-start justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 border border-rose-300 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
              <AlertOctagon className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-rose-900 uppercase tracking-wider">
                  ASSET LOCKDOWN ACTIVE ({activeNdps.length} NDP)
                </span>
                <span className="text-[10px] bg-rose-200 text-rose-900 font-extrabold px-2 py-0.5 rounded-full">
                  CRITICAL PATH AT RISK
                </span>
              </div>
              <p className="text-xs text-rose-800 font-medium mt-0.5">
                {activeNdps.map(n => `${n.ndp_code}: ${n.machine_name || n.affected_machine_id} (${n.description})`).join(" • ")}
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate(`/erp/production/hub/${project.id}?tab=logger`)}
            size="sm"
            className="bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shrink-0 rounded-xl h-8 px-3"
          >
            Resolve in Logger <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      )}

      {/* Active Floor Requests Alert */}
      {activeFloorRequests.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="text-xs text-amber-900 font-medium">
              <strong className="font-bold">{activeFloorRequests.length} Active Floor Request(s)</strong> awaiting fulfillment from shop floor.
            </div>
          </div>
          <Button
            onClick={() => navigate(`/erp/production/hub/${project.id}?tab=logger`)}
            variant="ghost"
            size="sm"
            className="text-amber-900 hover:bg-amber-100 text-xs font-bold rounded-lg h-7 px-2.5"
          >
            View in Logger
          </Button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Schedule & BOP Mirror & WOT Flow */}
        <div className="lg:col-span-2 space-y-6">
          {/* Target Finish Date Mirror */}
          {materialFlowMetrics && (
            <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-stone-500 tracking-wider flex items-center gap-2 font-semibold uppercase">
                  <span className="w-2 h-2 bg-stone-800 rounded-full"></span>
                  PRODUCTION TARGET & SCHEDULE
                </div>
                {project.is_master_set ? (
                  <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    MASTER SET
                  </span>
                ) : (
                  <span className="text-[10px] font-bold bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full border border-stone-200">
                    UNLOCKED
                  </span>
                )}
              </div>

              <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border",
                    materialFlowMetrics.isOverdue
                      ? "bg-red-50 border-red-200 text-red-700"
                      : materialFlowMetrics.isTight
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : "bg-emerald-50 border-emerald-200 text-emerald-700"
                  )}
                >
                  {materialFlowMetrics.isOverdue ? (
                    <AlertTriangle className="w-6 h-6" />
                  ) : (
                    <Clock className="w-6 h-6" />
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-stone-900">
                      Est. Finish:{" "}
                      <span className="font-mono">{materialFlowMetrics.estFinishDateStr}</span>
                    </span>
                    {materialFlowMetrics.hasDueDate && (
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                          materialFlowMetrics.isOverdue
                            ? "bg-red-100 text-red-800 border-red-200"
                            : materialFlowMetrics.isTight
                            ? "bg-amber-100 text-amber-800 border-amber-200"
                            : "bg-emerald-100 text-emerald-800 border-emerald-200"
                        )}
                      >
                        {materialFlowMetrics.isOverdue
                          ? "OVERDUE"
                          : materialFlowMetrics.isTight
                          ? "TIGHT SCHEDULE"
                          : "ON TRACK"}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-stone-500 font-medium">
                    Makespan:{" "}
                    <strong className="text-stone-800">
                      {materialFlowMetrics.estWorkingDays} Days
                    </strong>{" "}
                    • Capacity:{" "}
                    <strong className="text-stone-800">
                      {materialFlowMetrics.dailyCapacity.toFixed(1)} Pcs/Day
                    </strong>
                    {project.due_date && (
                      <span className="ml-2 text-stone-400">
                        (Due: {new Date(project.due_date).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Work Order Tickets (WOT Flow Mirror) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-stone-500 tracking-wider flex items-center gap-2 font-semibold uppercase">
                <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                WORK ORDER TICKETS (WOT FLOW TOKENS)
              </div>
              <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-200">
                {wots.filter(w => w.status === 'COMPLETED' || w.status === 'DONE_ROOT').length} / {wots.length || 0} COMPLETED
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-2xs">
              {wots.length === 0 ? (
                <div className="p-8 text-center text-xs text-stone-400 space-y-1">
                  <QrCode className="w-8 h-8 text-stone-300 mx-auto" />
                  <p>No Work Order Tickets generated yet for this project.</p>
                  <p className="text-[10px] text-stone-400">Generate tickets inside Production Hub Planning tab.</p>
                </div>
              ) : (
                <div className="divide-y divide-stone-100">
                  {wots.map((wot) => (
                    <div key={wot.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/50 transition-all">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0 mt-0.5">
                          <QrCode className="w-4 h-4 text-stone-600" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-stone-900">{wot.lot_number}</span>
                            <span className={cn(
                              "text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border",
                              wot.status === "COMPLETED" || wot.status === "DONE_ROOT"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : wot.status === "RUNNING"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : wot.status === "BLOCKED_NDP"
                                ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
                                : "bg-stone-100 text-stone-600 border-stone-200"
                            )}>
                              {wot.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-stone-500 font-medium">
                            Qty: <strong className="text-stone-800">{wot.qty} units</strong> • Completed: <strong className="text-emerald-700">{wot.completed_units || 0}</strong> • Machine: <span className="text-stone-700 font-medium">{wot.machine_name}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="w-28 text-right space-y-1">
                          <div className="text-[10px] font-mono font-bold text-stone-700">
                            {wot.qty > 0 ? Math.round(((wot.completed_units || 0) / wot.qty) * 100) : 0}%
                          </div>
                          <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 transition-all duration-300"
                              style={{ width: `${wot.qty > 0 ? Math.min(100, ((wot.completed_units || 0) / wot.qty) * 100) : 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ERP Project Gantt Timeline */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-stone-500 tracking-wider flex items-center gap-2 font-semibold uppercase">
                <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
                PROJECT GANTT TIMELINE (PROCUREMENT & BOP)
              </div>
              <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl border border-stone-200">
                {(["ALL", "PROCUREMENT", "MANUFACTURING"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setGanttFilter(mode)}
                    className={cn(
                      "px-2.5 py-1 text-[10px] font-black uppercase rounded-lg transition-all",
                      ganttFilter === mode
                        ? "bg-white text-stone-900 shadow-2xs"
                        : "text-stone-500 hover:text-stone-900"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <div className="min-w-[750px]">
                  {/* Days Header */}
                  <div className="flex border-b border-stone-200 bg-stone-50/70 text-[10px] font-bold text-stone-500">
                    <div className="w-56 p-2.5 border-r border-stone-200 shrink-0 uppercase tracking-wider">
                      Task / Stage
                    </div>
                    <div className="flex-1 flex">
                      {ganttDays.map((d, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex-1 p-1.5 text-center border-r border-stone-100 font-mono text-[9px]",
                            d.isToday && "bg-amber-100/60 text-amber-900 font-black border-amber-300"
                          )}
                        >
                          {d.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Task Rows */}
                  <div className="divide-y divide-stone-100 text-xs">
                    {tasks
                      .filter((t) => {
                        const isPr = Boolean(t.pr_id || (t.task_name && t.task_name.includes("[Procurement]")));
                        if (ganttFilter === "PROCUREMENT") return isPr;
                        if (ganttFilter === "MANUFACTURING") return !isPr;
                        return true;
                      })
                      .map((task) => {
                        const isPrTask = Boolean(task.pr_id || (task.task_name && task.task_name.includes("[Procurement]")));
                        
                        let leftPercent = 0;
                        let widthPercent = 100;
                        if (ganttDays.length > 0 && task.start_date && task.end_date) {
                          const totalDays = ganttDays.length;
                          const minDate = ganttDays[0].dateStr;
                          const maxDate = ganttDays[totalDays - 1].dateStr;

                          const start = task.start_date < minDate ? minDate : task.start_date;
                          const end = task.end_date > maxDate ? maxDate : task.end_date;

                          let startIdx = ganttDays.findIndex((d) => d.dateStr >= start);
                          let endIdx = ganttDays.findIndex((d) => d.dateStr >= end);
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
                          <div key={task.id} className="flex items-center h-9 border-b border-stone-50">
                            <div className="w-56 px-3 text-[11px] font-semibold text-stone-800 truncate shrink-0 border-r border-stone-100 flex items-center justify-between gap-1">
                              <span className="truncate">{task.task_name || "Task"}</span>
                              {isPrTask && (
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 shrink-0">
                                  PR
                                </span>
                              )}
                            </div>
                            <div className="flex-1 h-full relative flex items-center px-1">
                              <div
                                style={{
                                  left: `${leftPercent}%`,
                                  width: `${Math.max(5, widthPercent)}%`,
                                }}
                                className={cn(
                                  "absolute h-5 rounded-md px-2 flex items-center text-[9px] font-bold text-white shadow-2xs transition-all",
                                  barBg
                                )}
                                title={`${task.task_name} | ${task.start_date || ""} -> ${task.end_date || ""} (${task.status})`}
                              >
                                <span className="truncate">
                                  {isPrTask ? "PR Delivery: " : ""}{task.status} ({task.progress || 0}%)
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* BOP Progress Mirror */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-stone-500 tracking-wider flex items-center gap-2 font-semibold uppercase">
                <span className="w-2 h-2 bg-stone-800 rounded-full"></span>
                BOP PROGRESS MIRROR
              </div>
              {bopSteps.length > 0 && (
                <span className="text-[10px] font-mono font-bold bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full border border-stone-200/50">
                  {bopSteps.filter((t) => t.status === "COMPLETED").length} / {bopSteps.length}{" "}
                  COMPLETED
                </span>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-2xs">
              {bopSteps.length === 0 ? (
                <div className="text-center py-16 text-stone-400 text-sm flex flex-col items-center justify-center space-y-2">
                  <Layers className="w-8 h-8 text-stone-300" />
                  <span>No Bill of Process steps defined for this project.</span>
                </div>
              ) : (
                <div className="divide-y divide-stone-150">
                  {bopSteps
                    .filter((t) => !!t)
                    .map((step) => (
                      <div
                        key={step.id}
                        className={cn(
                          "p-4 hover:bg-stone-50/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4",
                          step.status === "CANCELLED" && "opacity-60 grayscale"
                        )}
                      >
                        {/* Step Details */}
                        <div className="flex-1 min-w-0 flex items-start gap-3">
                          <div className="pt-0.5">
                            {step.status === "COMPLETED" ? (
                              <span className="w-6 h-6 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </span>
                            ) : step.status === "RUNNING" ? (
                              <span className="w-6 h-6 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
                                <Clock className="w-3.5 h-3.5 animate-spin" />
                              </span>
                            ) : step.status === "PAUSED" ? (
                              <span className="w-6 h-6 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </span>
                            ) : step.status === "CANCELLED" ? (
                              <span className="w-6 h-6 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400 shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <span className="w-6 h-6 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-500 shrink-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                              </span>
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4
                                className={cn(
                                  "text-sm font-bold text-stone-900 uppercase tracking-tight",
                                  step.status === "CANCELLED" && "line-through text-stone-400",
                                  materialFlowMetrics?.cpmNodes?.find(n => n.id === step.id)?.is_critical_path && "text-red-700"
                                )}
                              >
                                {step.step_name}
                              </h4>
                              {step.node_type && (
                                <span className={cn(
                                  "text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider border",
                                  step.node_type === 'PRODUCT'
                                    ? "bg-purple-50 text-purple-800 border-purple-200"
                                    : "bg-stone-100 text-stone-600 border-stone-200/50"
                                )}>
                                  {step.node_type}
                                </span>
                              )}
                              {step.node_type === 'PRODUCT' && (
                                <span className={cn(
                                  "inline-flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider border",
                                  step.status === "COMPLETED" || step.lifecycle_status === "Available" || step.lifecycle_status === "Produced"
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                    : step.lifecycle_status === "In Transit"
                                    ? "bg-blue-50 text-blue-800 border-blue-200"
                                    : step.lifecycle_status === "PO Issued"
                                    ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                                    : step.lifecycle_status === "PR Approved"
                                    ? "bg-amber-50 text-amber-800 border-amber-200"
                                    : step.lifecycle_status === "PR Pending"
                                    ? "bg-orange-50 text-orange-800 border-orange-200 shadow-2xs"
                                    : "bg-stone-100 text-stone-600 border-stone-200"
                                )}>
                                  {step.lifecycle_status || (step.status === "COMPLETED" ? "Available" : "Planned")}
                                </span>
                              )}
                              {step.status === "PAUSED" && (
                                <span className="inline-flex items-center gap-1 text-[8px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  {step.is_manual_pause
                                    ? "MANUAL PAUSE"
                                    : `AUTO PAUSED: ${step.pause_type || "WIP"}`}
                                </span>
                              )}
                              {materialFlowMetrics?.cpmNodes?.find(n => n.id === step.id)?.is_critical_path && (
                                <span className="inline-flex items-center gap-1 text-[8px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  CRITICAL PATH
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-[10px] text-stone-400 font-semibold uppercase tracking-wider">
                              <span>Target Qty: {step.target_qty}</span>
                              <span className="text-stone-300">|</span>
                              <span>Completed: {step.completed_qty}</span>
                              {step.lot_size && (
                                <>
                                  <span className="text-stone-300">|</span>
                                  <span className="text-blue-600 font-mono font-bold">Lot: {step.lot_size} pcs</span>
                                </>
                              )}
                              {step.transfer_mode && (
                                <>
                                  <span className="text-stone-300">|</span>
                                  <span className={step.transfer_mode === 'INTRA_STATION' ? 'text-emerald-600 font-bold' : 'text-stone-600 font-bold'}>
                                    {step.transfer_mode === 'INTRA_STATION' ? '1-Piece Flow' : 'Lot-Based WOT'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 w-full sm:w-auto">
                          <div className="w-40 space-y-1.5">
                            <div className="flex justify-between items-center text-[10px] font-extrabold uppercase tracking-widest">
                              <span className="text-stone-400">Progress</span>
                              <span className="text-stone-800">{step.progress || 0}%</span>
                            </div>
                            <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden border border-stone-200/20">
                              <div
                                className={cn(
                                  "h-full transition-all duration-500",
                                  step.status === "COMPLETED"
                                    ? "bg-emerald-500"
                                    : step.status === "RUNNING"
                                    ? "bg-blue-500"
                                    : step.status === "PAUSED"
                                    ? "bg-amber-500"
                                    : "bg-stone-400"
                                )}
                                style={{ width: `${step.progress || 0}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Material & PRs & Audit */}
        <div className="space-y-6">
          {/* HPP & COGS Dual-View Executive Widget */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-stone-500 tracking-wider flex items-center gap-2 font-semibold uppercase">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                ANALISIS HPP & COGS
              </div>
              <button
                onClick={() => {
                  setHppModalMode(cogsCardMode);
                  setShowHppModal(true);
                }}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1"
              >
                <span>Rincian Lengkap</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-2xs space-y-4">
              {/* Dual Options Selector */}
              <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
                <button
                  type="button"
                  onClick={() => setCogsCardMode("MATERIAL_ONLY")}
                  className={cn(
                    "flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5",
                    cogsCardMode === "MATERIAL_ONLY"
                      ? "bg-white text-stone-900 shadow-2xs"
                      : "text-stone-500 hover:text-stone-900"
                  )}
                >
                  <Package className="w-3.5 h-3.5 text-amber-500" />
                  <span>1. Murni (Material)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCogsCardMode("FULL_COSTING")}
                  className={cn(
                    "flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5",
                    cogsCardMode === "FULL_COSTING"
                      ? "bg-white text-stone-900 shadow-2xs"
                      : "text-stone-500 hover:text-stone-900"
                  )}
                >
                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                  <span>2. Komprehensif (+ Variabel)</span>
                </button>
              </div>

              {/* Scope Explanation Badge */}
              <div className="text-[11px] px-2.5 py-1.5 rounded-lg bg-stone-50 border border-stone-200/70 text-stone-600 flex items-center justify-between">
                <span>
                  {cogsCardMode === "MATERIAL_ONLY"
                    ? "HPP dihitung 100% murni dari bahan baku (PR/PO & BOM)"
                    : "HPP mencakup Bahan Baku + Upah Tenaga Kerja + Overhead BOP"}
                </span>
                <span className="font-mono font-bold text-stone-700 uppercase text-[9px] px-1.5 py-0.5 bg-white rounded border border-stone-200">
                  {cogsCardMode === "MATERIAL_ONLY" ? "Direct Material" : "Full Costing"}
                </span>
              </div>

              {/* Metric Values */}
              {(() => {
                const targetQty = (project as any)?.qty || 1;
                const activeMetrics = cogsCardMode === "MATERIAL_ONLY"
                  ? (hppBreakdown?.materialOnly || {
                      totalHpp: Number((project as any)?.material_cogs ?? (project as any)?.total_bom_cost ?? 0),
                      unitHpp: Math.round(Number((project as any)?.material_cogs ?? (project as any)?.total_bom_cost ?? 0) / targetQty),
                      grossProfit: Number((project as any)?.gross_profit_material ?? 0),
                      grossMarginPct: Number((project as any)?.gross_margin_material_pct ?? 0),
                    })
                  : (hppBreakdown?.fullCosting || {
                      totalHpp: Number((project as any)?.full_cogs ?? (project as any)?.total_cogs ?? 0),
                      unitHpp: Math.round(Number((project as any)?.full_cogs ?? (project as any)?.total_cogs ?? 0) / targetQty),
                      grossProfit: Number((project as any)?.gross_profit_full ?? (project as any)?.gross_profit ?? 0),
                      grossMarginPct: Number((project as any)?.gross_margin_full_pct ?? (project as any)?.gross_margin_pct ?? 0),
                      totalLaborCost: Number((project as any)?.total_labor_cost ?? 0),
                      totalOverheadCost: Number((project as any)?.total_overhead_cost ?? 0),
                    });

                const totalHpp = Number(activeMetrics.totalHpp) || 0;
                const unitHpp = Number(activeMetrics.unitHpp) || Math.round(totalHpp / targetQty);
                const marginPct = Number(activeMetrics.grossMarginPct) || 0;

                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 bg-stone-50 rounded-xl border border-stone-150">
                        <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                          Total HPP ({cogsCardMode === "MATERIAL_ONLY" ? "Murni" : "Penuh"})
                        </div>
                        <div className="text-base font-black font-mono text-stone-900 mt-0.5">
                          Rp {totalHpp.toLocaleString("id-ID")}
                        </div>
                      </div>
                      <div className="p-3 bg-stone-50 rounded-xl border border-stone-150">
                        <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                          HPP per Unit ({targetQty} units)
                        </div>
                        <div className="text-base font-black font-mono text-emerald-700 mt-0.5">
                          Rp {unitHpp.toLocaleString("id-ID")}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs px-1">
                      <span className="text-stone-500 font-medium">Estimasi Gross Margin:</span>
                      <span className={cn(
                        "font-mono font-bold px-2 py-0.5 rounded-full text-[10px]",
                        marginPct >= 20
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : marginPct >= 0
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      )}>
                        {marginPct.toFixed(1)}% {marginPct >= 0 ? "Margin" : "Defisit"}
                      </span>
                    </div>

                    {cogsCardMode === "FULL_COSTING" && (
                      <div className="text-[10px] text-stone-500 space-y-1 pt-1 border-t border-stone-100">
                        <div className="flex justify-between">
                          <span>• Biaya Tenaga Kerja (BTKL):</span>
                          <span className="font-mono font-bold text-stone-700">
                            Rp {Number(activeMetrics.totalLaborCost || 0).toLocaleString("id-ID")}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>• Overhead Pabrik (BOP):</span>
                          <span className="font-mono font-bold text-stone-700">
                            Rp {Number(activeMetrics.totalOverheadCost || 0).toLocaleString("id-ID")}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <Button
                onClick={() => {
                  setHppModalMode(cogsCardMode);
                  setShowHppModal(true);
                }}
                variant="secondary"
                className="w-full text-xs font-bold rounded-xl h-8.5 border-stone-200 hover:bg-stone-50 text-stone-800"
              >
                <Calculator className="w-3.5 h-3.5 mr-1.5 text-stone-500" />
                Lihat Komparasi Murni vs Komprehensif
              </Button>
            </div>
          </div>

          {/* Material Progress */}
          <div className="space-y-3">
            <div className="text-xs text-stone-500 tracking-wider flex items-center gap-2 font-semibold uppercase">
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
              MATERIAL PROGRESS
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-2xs">
              {bom.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-400">
                  No BOM materials specified for this project.
                </div>
              ) : (
                <div className="divide-y divide-stone-100">
                  {bom.map((item) => {
                    const received = item.received_by_production || 0;
                    const required = item.total_required_qty;
                    
                    let statusLabel = "WAITING MATERIAL";
                    let statusColor = "text-amber-500 bg-amber-50";
                    let statusIcon = <Clock className="w-3 h-3" />;
                    let statusFill = "bg-amber-400";
                    
                    if (received >= required) {
                      statusLabel = "MATERIAL READY";
                      statusColor = "text-emerald-600 bg-emerald-50";
                      statusIcon = <CheckCircle2 className="w-3 h-3" />;
                      statusFill = "bg-emerald-500";
                    }
                    
                    const progressPercent = Math.min(100, (received / required) * 100);
                    const transitPercent = 0;

                    return (
                      <div key={item.id} className="p-4 space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                              <Package className="w-3.5 h-3.5 text-stone-500" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-stone-900 truncate">
                                {item.item_code}
                              </div>
                              <div className="text-[10px] text-stone-400 truncate">
                                {item.item_name}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={cn("px-2 py-1 rounded-md text-[9px] font-black tracking-wider flex items-center gap-1", statusColor)}>
                              {statusIcon} {statusLabel}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                            <span>Req: {required} {item.uom}</span>
                            <span className="flex items-center gap-2">
                              <span className="text-stone-700"><span className="text-stone-300">Recv:</span> {received}</span>
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden flex">
                            <div className={cn("h-full transition-all duration-500", statusFill)} style={{ width: `${progressPercent}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Purchase Requests */}
          <div className="space-y-3">
            <div className="text-xs text-stone-500 tracking-wider flex items-center gap-2 font-semibold uppercase">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              PURCHASE REQUESTS
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-2xs">
              {prs.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-400">
                  No purchase requests issued yet.
                </div>
              ) : (
                <div className="divide-y divide-stone-100">
                  {prs.map((pr) => (
                    <div
                      key={pr.pr_number}
                      className="p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-mono font-bold text-stone-900">
                            {pr.pr_number}
                          </div>
                          <div className="text-[10px] text-stone-400">
                            {pr.item_count} items •{" "}
                            {new Date(pr.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={cn(
                            "text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border",
                            pr.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : pr.status === "PENDING"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-stone-50 text-stone-600 border-stone-200"
                          )}
                        >
                          {pr.status}
                        </span>
                        {pr.has_po && (
                          <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            PO CREATED
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Production Logger Events (Shop Floor Mirror) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-stone-500 tracking-wider flex items-center gap-2 font-semibold uppercase">
                <span className="w-2 h-2 bg-emerald-600 rounded-full animate-ping"></span>
                RECENT PRODUCTION LOGS
              </div>
              <Button
                onClick={() => navigate(`/erp/production/hub/${project.id}?tab=logger`)}
                variant="ghost"
                size="sm"
                className="text-[10px] text-stone-600 hover:text-stone-900 h-6 px-2"
              >
                Full Logger <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-2xs">
              {recentLogs.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-400">
                  No scan or event logs recorded yet for this project.
                </div>
              ) : (
                <div className="divide-y divide-stone-100">
                  {recentLogs.map((log) => {
                    let badgeColor = "bg-stone-100 text-stone-700 border-stone-200";
                    if (log.log_type === "QR_SCAN") badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                    else if (log.log_type === "WOT_COMPLETE") badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                    else if (log.log_type?.includes("NDP")) badgeColor = "bg-rose-50 text-rose-700 border-rose-200";
                    else if (log.log_type?.includes("FLOOR_REQUEST")) badgeColor = "bg-amber-50 text-amber-700 border-amber-200";

                    return (
                      <div key={log.id} className="p-3.5 space-y-1 hover:bg-stone-50/50 transition-all">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border", badgeColor)}>
                            {log.log_type}
                          </span>
                          <span className="text-[10px] font-mono text-stone-400">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-xs text-stone-800 font-medium truncate">
                          {log.machine_name && log.machine_name !== 'N/A' && (
                            <span className="text-stone-500 font-normal">[{log.machine_name}] </span>
                          )}
                          {log.user_name && <span className="font-semibold">{log.user_name}: </span>}
                          {(() => {
                            try {
                              const d = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                              return d?.reason || d?.message || d?.action || (typeof log.details === 'string' ? log.details : "Event recorded");
                            } catch (e) {
                              return typeof log.details === 'string' ? log.details : "Event logged";
                            }
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Audit Timeline */}
          <div className="space-y-3">
            <div className="text-xs text-stone-500 tracking-wider flex items-center gap-2 font-semibold uppercase">
              <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
              AUDIT TRAIL
            </div>
            <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-2xs">
              <AuditTimeline resourceType="PROJECT" resourceId={id} />
            </div>
          </div>
        </div>
      </div>

      {/* Dual HPP / COGS Analysis Modal */}
      {id && (
        <ProjectHppModal
          projectId={id}
          projectName={project?.name}
          isOpen={showHppModal}
          onClose={() => setShowHppModal(false)}
          initialMode={hppModalMode}
        />
      )}
    </div>
  );
}
