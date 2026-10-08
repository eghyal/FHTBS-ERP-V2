import { Button } from "@/components/ui/Button";
import { safeFetchJson, apiFetch, ApiResponse } from "@/utils/api";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Plus,
  X,
  ChevronRight,
  Package,
  AlertTriangle,
  ClipboardList,
  History,
  Bell,
  ArrowRight,
  Calendar,
  Wrench,
  PackageCheck,
  CheckCircle2,
  Filter,
  Home,
  GanttChartSquare,
  Info,
  Maximize2,
  Minimize2,
  Share2,
  AlertCircle,
  Library,
  TrendingUp,
  TrendingDown,
  Trash2,
  FolderKanban,
  Layers,
  Clock,
  RefreshCw,
  FileText,
  Landmark,
  BookOpen,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useInterval } from "@/hooks/useInterval";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useShare } from "@/contexts/ShareContext";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { HasRole } from "@/components/shared/HasRole";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  motion,
  AnimatePresence,
} from "motion/react";
import { formatIDR } from "@/lib/utils";

interface WorkCenter {
  id: string;
  name: string;
  manpower_count: number;
  hours_per_day: number;
  days_per_week: number;
  capacity_per_week: number;
  efficiency_index?: number;
  status?: "ACTIVE" | "MAINTENANCE" | "OFFLINE";
}

interface Task {
  id: string;
  project_id: string;
  task_name: string;
  work_center_id?: string;
  work_center_name?: string;
  required_hours?: number;
  start_date: string;
  end_date: string;
  actual_start_date?: string;
  actual_end_date?: string;
  progress: number;
  status: string;
}

interface Project {
  id: string;
  name: string;
  due_date: string;
  customer: string;
  remarks: string;
  status: string;
  urgency?: "NORMAL" | "URGENT" | "CRITICAL";
  bq_updated_at?: string;
  est_budget?: number;
  actual_cost?: number;
  created_at: string;
  archived_at?: string;
  tasks: Task[];
}

interface PendingAction {
  type: string;
  title: string;
  description: string;
  link: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

interface Job {
  id: string;
  project: string;
  task: string;
  workCenterId: string;
  workCenterName: string;
  plannedWeek: number;
  requiredHours: number;
  materialStatus: "READY" | "PARTIAL" | "SHORTAGE";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
}

const INITIAL_JOBS: Job[] = [];

const CAPACITY_LIMITS: Record<string, number> = {};

const getWeekNumber = (d: Date) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return weekNo;
};

export default function Overview() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [monitorData, setMonitorData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState<WorkCenter[]>([]);
  const [isSubmittingConfig, setIsSubmittingConfig] = useState(false);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [userStatuses, setUserStatuses] = useState<any[]>([]);
  const [serverTime, setServerTime] = useState<string>(
    new Date().toISOString(),
  );
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);

  const { language } = useLanguage();

  // Production State
  const [selectedCenterId, setSelectedCenterId] = useState<string>("");
  const weeks = useMemo(() => {
    const currentWeek = getWeekNumber(new Date());
    return [
      { num: currentWeek, label: "This Week", sub: `W${currentWeek}` },
      { num: currentWeek + 1, label: "Next Week", sub: `W${currentWeek + 1}` },
      { num: currentWeek + 2, label: "Week +2", sub: `W${currentWeek + 2}` },
      { num: currentWeek + 3, label: "Week +3", sub: `W${currentWeek + 3}` },
      { num: currentWeek + 4, label: "Week +4", sub: `W${currentWeek + 4}` },
    ];
  }, []);

  const [selectedWeek, setSelectedWeek] = useState<number>(weeks[0].num);

  // Gantt State
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(),
  );
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isFullscreenGantt, setIsFullscreenGantt] = useState(false);
  const [ganttZoom, setGanttZoom] = useState(100);
  const ganttContainerRef = React.useRef<HTMLDivElement>(null);
  const [isDraggingGantt, setIsDraggingGantt] = useState(false);
  const [ganttStartX, setGanttStartX] = useState(0);
  const [ganttScrollLeft, setGanttScrollLeft] = useState(0);
  const [ganttStartY, setGanttStartY] = useState(0);
  const [ganttScrollTop, setGanttScrollTop] = useState(0);

  const handleScrollGantt = (direction: "LEFT" | "RIGHT" | "UP" | "DOWN") => {
    if (!ganttContainerRef.current) return;
    const scrollAmount = 180;
    if (direction === "LEFT") {
      ganttContainerRef.current.scrollLeft -= scrollAmount;
    } else if (direction === "RIGHT") {
      ganttContainerRef.current.scrollLeft += scrollAmount;
    } else if (direction === "UP") {
      ganttContainerRef.current.scrollTop -= scrollAmount;
    } else if (direction === "DOWN") {
      ganttContainerRef.current.scrollTop += scrollAmount;
    }
  };

  const ganttHandlers = {
    onMouseDown: (e: React.MouseEvent) => {
      if (!ganttContainerRef.current) return;
      setIsDraggingGantt(true);
      setGanttStartX(e.pageX - ganttContainerRef.current.offsetLeft);
      setGanttScrollLeft(ganttContainerRef.current.scrollLeft);
      setGanttStartY(e.pageY - ganttContainerRef.current.offsetTop);
      setGanttScrollTop(ganttContainerRef.current.scrollTop);
    },
    onMouseLeave: () => {
      setIsDraggingGantt(false);
    },
    onMouseUp: () => {
      setIsDraggingGantt(false);
    },
    onMouseMove: (e: React.MouseEvent) => {
      if (!isDraggingGantt || !ganttContainerRef.current) return;
      e.preventDefault();
      const x = e.pageX - ganttContainerRef.current.offsetLeft;
      const walkX = (x - ganttStartX) * 2;
      ganttContainerRef.current.scrollLeft = ganttScrollLeft - walkX;

      const y = e.pageY - ganttContainerRef.current.offsetTop;
      const walkY = (y - ganttStartY) * 2;
      ganttContainerRef.current.scrollTop = ganttScrollTop - walkY;
    },
  };

  const { user } = useAuth();
  const { showToast } = useToast();
  const { shareToForum } = useShare();

  // Confirm Modal States
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    action: () => {},
  });

  const handleCancelProject = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Cancel Project?",
      message:
        "Are you sure you want to cancel this project? This will archive it and release all pending resources.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/projects/${id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) {
            showToast("Project cancelled successfully", "success");
            fetchData();
          } else {
            showToast(res.error || "Failed to cancel project", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error cancelling project", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const refreshUserStatuses = useCallback(async () => {
    setIsRefreshingStatus(true);
    try {
      const email = user?.username || "";
      const usersRes = await apiFetch(
        "/api/users/status",
        { method: "GET" },
        email,
      );
      if (usersRes.ok && usersRes.data) {
        setUserStatuses(
          Array.isArray(usersRes.data.users) ? usersRes.data.users : [],
        );
        if (usersRes.data.server_time) {
          setServerTime(usersRes.data.server_time);
        }
      }
    } catch (err) {
      console.error("Failed to refresh user statuses", err);
    } finally {
      setIsRefreshingStatus(false);
    }
  }, [user?.username]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const email = user?.username || "";

      // Execute in parallel for speed
      const [
        projectsRes,
        inventoryRes,
        actionsRes,
        ganttRes,
        analyticsRes,
        workCentersRes,
        archivedRes,
        monitorRes,
        usersRes,
      ] = await Promise.all([
        apiFetch("/api/projects", {}, email),
        apiFetch("/api/inventory/summary", {}, email),
        apiFetch("/api/dashboard/pending-actions", {}, email),
        apiFetch("/api/gantt", {}, email),
        apiFetch("/api/production/analytics", {}, email),
        apiFetch("/api/work-centers", {}, email),
        apiFetch("/api/projects?archived=true", {}, email),
        apiFetch("/api/dashboard/active-projects-monitor", {}, email),
        apiFetch("/api/users/status", {}, email),
      ]);

      // Handle server warmup global state
      if (projectsRes.isStarting) {
        showToast("System is warming up, please wait...", "info");
        setTimeout(fetchData, 3000);
        return;
      }

      setWorkCenters(
        Array.isArray(workCentersRes.data) ? workCentersRes.data : [],
      );
      if (
        Array.isArray(workCentersRes.data) &&
        workCentersRes.data.length > 0 &&
        !selectedCenterId
      ) {
        setSelectedCenterId(workCentersRes.data[0].id);
      }

      if (Array.isArray(ganttRes.data)) {
        setProjects(ganttRes.data.filter((p: any) => !["CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(p.id)));
      } else {
        setProjects([]);
      }

      setSummary(inventoryRes.data);
      setPendingActions(Array.isArray(actionsRes.data) ? actionsRes.data : []);
      setAnalytics(analyticsRes.data);
      setArchivedProjects(
        Array.isArray(archivedRes.data)
          ? archivedRes.data.filter((p: any) => !["CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(p.id))
          : [],
      );
      if (Array.isArray(monitorRes.data)) {
        setMonitorData(monitorRes.data.filter((p: any) => !["CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(p.id)));
      } else {
        setMonitorData([]);
      }
      if (usersRes.ok && usersRes.data) {
        setUserStatuses(
          Array.isArray(usersRes.data.users) ? usersRes.data.users : [],
        );
        if (usersRes.data.server_time) {
          setServerTime(usersRes.data.server_time);
        }
      }

      // Individual error check for critical data
      const isAccessDenied = (err: string | null) =>
        err?.includes("Access denied") ||
        err?.includes("Insufficient permissions");

      if (!projectsRes.ok && !isAccessDenied(projectsRes.error)) {
        console.error("Dashboard Projects Error:", projectsRes);
        showToast(projectsRes.error || "Failed to load projects", "error");
      }
      if (!usersRes.ok && !isAccessDenied(usersRes.error)) {
        console.error("Dashboard Users Status Error:", usersRes);
        showToast(usersRes.error || "Failed to fetch user's status", "error");
      }
      if (!inventoryRes.ok && !isAccessDenied(inventoryRes.error)) {
        console.error("Dashboard Inventory Error:", inventoryRes);
        showToast(
          inventoryRes.error || "Failed to load inventory summary",
          "error",
        );
      }
      if (!actionsRes.ok && !isAccessDenied(actionsRes.error)) {
        console.error("Dashboard Actions Error:", actionsRes);
        showToast(
          actionsRes.error || "Failed to load pending actions",
          "error",
        );
      }
    } catch (err) {
      console.error("Dashboard: Failed to fetch data", err);
      showToast(
        "System encountered an error while updating dashboard",
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  }, [user, selectedCenterId, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshUserStatuses]);

  useInterval(refreshUserStatuses, 20000);

  const handleCloseProject = (projectId: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Close Project?",
      message: `Are you sure you want to close project ${projectId}? This will release all allocated resources.`,
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/projects/${projectId}/close`,
            { method: "POST" },
            user?.username,
          );
          if (res.ok) {
            fetchData();
            showToast("Project closed successfully", "success");
          } else {
            showToast(res.error || "Failed to close project", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error closing project", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // --- Production Derived Data ---
  const capacityData = useMemo(() => {
    return weeks.map((w) => {
      const week = w.num;
      const data: any = { week: w.label, weekNum: week, sub: w.sub };
      workCenters.forEach((wc) => {
        const load = projects.reduce((acc, p) => {
          const taskLoad =
            (p.tasks || [])
              .filter((t: any) => !!t)
              .filter((t) => {
                if (t.work_center_id !== wc.id) return false;
                const taskWeek = getWeekNumber(new Date(t.start_date));
                return taskWeek === week;
              })
              .reduce((sum, t) => sum + (t.required_hours || 0), 0) || 0;
          return acc + taskLoad;
        }, 0);
        data[wc.name] = load;
        const isOperational = (wc.status || "ACTIVE") === "ACTIVE";
        data[`${wc.name}_cap`] = isOperational
          ? wc.capacity_per_week * (wc.efficiency_index || 1.0)
          : 0;
      });
      return data;
    });
  }, [projects, workCenters, weeks]);

  const jobs = useMemo(() => {
    const allJobs: Job[] = [];
    projects.forEach((p) => {
      (p.tasks || [])
        .filter((t: any) => !!t)
        .forEach((t) => {
          allJobs.push({
            id: t.id,
            project: p.name,
            task: t.task_name,
            workCenterId: t.work_center_id || "",
            workCenterName: t.work_center_name || "N/A",
            plannedWeek: getWeekNumber(new Date(t.start_date)),
            requiredHours: t.required_hours || 0,
            materialStatus: "READY",
            status: t.status as any,
          });
        });
    });
    return allJobs;
  }, [projects]);

  const selectedCenter = useMemo(
    () => workCenters.find((wc) => wc.id === selectedCenterId),
    [workCenters, selectedCenterId],
  );

  const activeJobs = useMemo(() => {
    if (!selectedWeek || !selectedCenterId) return [];
    return jobs.filter(
      (j) =>
        j.plannedWeek === selectedWeek && j.workCenterId === selectedCenterId,
    );
  }, [jobs, selectedWeek, selectedCenterId]);

  const currentLoad =
    capacityData.find((d) => d.weekNum === selectedWeek)?.[
      selectedCenter?.name || ""
    ] || 0;
  const maxCapacity = selectedCenter?.capacity_per_week || 0;
  const isOverloaded = currentLoad > maxCapacity;

  const moveJob = async (jobId: string, targetWeek: number) => {
    try {
      // Find the existing task to preserve duration
      let existingTask: any = null;
      for (const p of projects) {
        const found = p.tasks?.find((t) => t.id === jobId);
        if (found) {
          existingTask = found;
          break;
        }
      }

      // Calculate new start date based on week number
      const now = new Date();
      const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
      const days = (targetWeek - 1) * 7;
      const newStartDate = new Date(
        firstDayOfYear.getTime() + days * 24 * 60 * 60 * 1000,
      );

      let newEndDate = new Date(newStartDate);
      if (existingTask && existingTask.start_date && existingTask.end_date) {
        const oldStart = new Date(existingTask.start_date);
        const oldEnd = new Date(existingTask.end_date);
        const durationMs = Math.max(0, oldEnd.getTime() - oldStart.getTime());
        newEndDate.setTime(newStartDate.getTime() + durationMs);
      }

      const startStr = newStartDate.toISOString().split("T")[0];
      const endStr = newEndDate.toISOString().split("T")[0];

      const res = await apiFetch(
        `/api/tasks/${jobId}`,
        {
          method: "POST",
          body: JSON.stringify({ start_date: startStr, end_date: endStr }),
        },
        user?.username,
      );

      if (res.ok) {
        fetchData();
        showToast("Job moved successfully", "success");
      } else {
        showToast(res.error || "Failed to move job", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error moving job", "error");
    }
  };

  const updateJobHours = async (jobId: string, hours: number) => {
    try {
      const res = await apiFetch(
        `/api/tasks/${jobId}`,
        {
          method: "POST",
          body: JSON.stringify({ required_hours: hours }),
        },
        user?.username,
      );
      if (res.ok) {
        fetchData();
        showToast("Job hours updated", "success");
      } else {
        showToast(res.error || "Failed to update job hours", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error updating job hours", "error");
    }
  };

  // --- Gantt Chart Logic ---
  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) newSet.delete(projectId);
      else newSet.add(projectId);
      return newSet;
    });
  };

  const ganttTimeline = useMemo(() => {
    const today = new Date();
    if (projects.length === 0) {
      const defaultStart = new Date(today);
      defaultStart.setDate(defaultStart.getDate() - 5);
      const defaultEnd = new Date(today);
      defaultEnd.setDate(defaultEnd.getDate() + 25);
      const days = [];
      let cur = new Date(defaultStart);
      for (let i = 0; i < 30; i++) {
        days.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      return { minDate: defaultStart, maxDate: defaultEnd, days };
    }

    let minDate = new Date(today);
    let maxDate = new Date(today);

    // Limit window bounds: at most 45 days in past and 90 days in future from today
    const earliestAllowed = new Date(today);
    earliestAllowed.setDate(earliestAllowed.getDate() - 45);
    const latestAllowed = new Date(today);
    latestAllowed.setDate(latestAllowed.getDate() + 90);

    projects.forEach((p) => {
      if (p.created_at) {
        const pStart = new Date(p.created_at);
        if (!isNaN(pStart.getTime()) && pStart >= earliestAllowed && pStart < minDate) {
          minDate = pStart;
        }
      }
      if (p.due_date) {
        const pEnd = new Date(p.due_date);
        if (!isNaN(pEnd.getTime()) && pEnd <= latestAllowed && pEnd > maxDate) {
          maxDate = pEnd;
        }
      }

      (p.tasks || [])
        .filter((t: any) => !!t)
        .forEach((t: any) => {
          if (t.start_date) {
            const tStart = new Date(t.start_date);
            if (!isNaN(tStart.getTime()) && tStart >= earliestAllowed && tStart < minDate) {
              minDate = tStart;
            }
          }
          if (t.end_date) {
            const tEnd = new Date(t.end_date);
            if (!isNaN(tEnd.getTime()) && tEnd <= latestAllowed && tEnd > maxDate) {
              maxDate = tEnd;
            }
          }
        });
    });

    // Add safe padding
    minDate.setDate(minDate.getDate() - 3);
    maxDate.setDate(maxDate.getDate() + 10);

    // Clamp strictly: minDate cannot be after maxDate, and max range is 90 days
    if (minDate > maxDate) {
      minDate = new Date(today);
      minDate.setDate(today.getDate() - 5);
      maxDate = new Date(today);
      maxDate.setDate(today.getDate() + 25);
    }

    const diffDays = Math.round((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 90) {
      maxDate = new Date(minDate);
      maxDate.setDate(minDate.getDate() + 90);
    }

    const days: Date[] = [];
    let current = new Date(minDate);
    let loopGuard = 0;
    while (current <= maxDate && loopGuard < 100) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
      loopGuard++;
    }

    return { minDate, maxDate, days };
  }, [projects]);

  const DAY_WIDTH = Math.round(48 * (ganttZoom / 100)); // Dynamic zoom width

  const getPositionStyle = (startDateStr: string, endDateStr: string) => {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const totalDays = ganttTimeline.days.length;

    if (totalDays === 0) return { left: "0px", width: "0px" };

    const minTime = ganttTimeline.minDate.getTime();

    // Using EXACT start date offset in days
    let startOffsetDays = Math.round(
      (start.getTime() - minTime) / (1000 * 60 * 60 * 24),
    );
    let durationDays =
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return {
      left: `${Math.max(0, startOffsetDays * DAY_WIDTH)}px`,
      width: `${Math.max(DAY_WIDTH, durationDays * DAY_WIDTH)}px`,
    };
  };

  const t = useMemo(() => {
    const isID = language === "id";
    return {
      purchasedItems: isID ? "Item ter-PR" : "Purchased Items",
      stockReady: isID ? "Item Stock (Ready)" : "Stock Availability",
      fulfillment: isID
        ? "Proses Pengadaan (PR ke GRN)"
        : "Supply Fulfillment (PR to GRN)",
      productionTimeline: isID ? "Timeline Produksi" : "Production Timeline",
      qtyReceived: isID ? "Qty Diterima" : "Qty Received",
      moreTasks: isID ? "Tugas Lainnya" : "More Tasks",
      noTasks: isID ? "Belum ada tugas." : "No tasks created yet.",
      resolve: isID ? "Selesaikan" : "Resolve",
      actionRequired: isID ? "Tindakan Diperlukan" : "Action Required",
      strategicControl: isID
        ? "Pusat Kendali Strategis"
        : "Strategic Control Center",
    };
  }, [language]);

  const filteredActions = useMemo(() => {
    return pendingActions.filter((a) => {
      if (a.type === "ACCOUNT_APPROVAL") return hasGodMode(user);

      if (user?.level === "MANAGER" || hasGodMode(user)) {
        if (a.type === "PR_AUTH") return hasPermission(user, Action.AUTH_PR);
        if (a.type === "PR_AUTH_URGENT")
          return hasPermission(user, Action.AUTH_PR_URGENT);
        if (a.type === "DELIVERY_AUTH")
          return hasPermission(user, Action.AUTH_DELIVERY);
        return false;
      }

      if (a.type === "PO_RECEIPT")
        return hasPermission(user, Action.RECEIVE_PO);
      if (a.type === "LOW_STOCK")
        return hasPermission(user, Action.VIEW_LOW_STOCK);

      return false;
    });
  }, [pendingActions, user]);

  const actionRequiredCount = filteredActions.length;

  const getInitials = (name: string) => {
    if (!name) return "??";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + (parts[parts.length - 1][0] || ""))
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <>
      <div className="space-y-6 md:space-y-12 pb-20 animate-in fade-in duration-500">
        <PageHeader
          title="Dashboard"
          subtitle={
            actionRequiredCount > 0
              ? `${actionRequiredCount} action items pending`
              : "Operations overview and key metrics"
          }
          icon={
            <div className="relative">
              <Home className="w-6 h-6" />
              {actionRequiredCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center animate-bounce shadow">
                  {actionRequiredCount}
                </span>
              )}
            </div>
          }
          actions={
            <>
              <Link
                to="/finance"
                className="p-2 md:p-3 bg-white border border-stone-200/90 hover:border-stone-300 hover:bg-stone-50 rounded-xl md:rounded-2xl text-emerald-600 transition-all active:scale-95 flex items-center justify-center shadow-xs group cursor-pointer"
                title="General Ledger"
              >
                <Landmark className="w-4 h-4 md:w-5 md:h-5 group-hover:scale-110 transition-transform" />
              </Link>
              <button
                onClick={fetchData}
                className="p-2 md:p-3 bg-stone-50 hover:bg-stone-100 rounded-xl md:rounded-2xl text-stone-400 hover:text-stone-600 transition-all active:scale-95 flex items-center justify-center shadow-sm cursor-pointer"
                title="Refresh Data"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  className="w-4 h-4 md:w-5 md:h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
              {/* "Create Project" button has been moved to the Quotation page */}
            </>
          }
        />

        <div className="space-y-6 md:space-y-12">
          {/* User's Status - Compact Widget */}
          <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide w-full pb-2 -mt-4 mb-8">
            <div className="flex items-center gap-2 shrink-0 pr-4 border-r border-stone-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">
                Team Status
              </span>
              <button
                onClick={refreshUserStatuses}
                disabled={isRefreshingStatus}
                className="p-1 text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded-md transition-all ml-1 disabled:opacity-50"
                title="Refresh Team Status"
              >
                <RefreshCw
                  className={cn(
                    "w-3 h-3",
                    isRefreshingStatus && "animate-spin",
                  )}
                />
              </button>
            </div>
            <div className="flex items-center gap-5 shrink-0 py-1">
              {userStatuses.length === 0 ? (
                <span className="text-[10px] text-stone-400 tracking-widest uppercase font-medium">
                  No team data
                </span>
              ) : null}
              {userStatuses.map((u) => {
                const lastSeenStr = u.last_seen_at
                  ? u.last_seen_at.includes("T")
                    ? u.last_seen_at
                    : u.last_seen_at.replace(" ", "T") + "Z"
                  : null;
                const lastSeen = lastSeenStr ? new Date(lastSeenStr) : null;
                const serverNow = new Date(serverTime);

                // Robust online check: within 5 minutes of server time
                const diffMs = lastSeen
                  ? Math.abs(serverNow.getTime() - lastSeen.getTime())
                  : Infinity;
                const isOnline = lastSeen && diffMs < 300000; // 5 mins

                return (
                  <div
                    key={u.username}
                    className="flex items-center gap-2.5 shrink-0 group"
                  >
                    <div className="relative">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold transition-transform group-hover:scale-105 ring-2 ring-white",
                          isOnline
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-stone-100 text-stone-500",
                        )}
                      >
                        {getInitials(u.name)}
                      </div>
                      <span className="relative flex h-3 w-3 absolute -bottom-0.5 -right-0.5">
                        {isOnline && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        )}
                        <span
                          className={cn(
                            "relative inline-flex rounded-full h-3 w-3 border-2 border-white",
                            isOnline ? "bg-emerald-500" : "bg-stone-300",
                          )}
                        ></span>
                      </span>
                    </div>
                    <div className="flex flex-col justify-center">
                      <span
                        className={cn(
                          "text-[11px] font-bold leading-none mb-1",
                          isOnline ? "text-emerald-900" : "text-stone-500",
                        )}
                      >
                        {u.name}
                      </span>
                      <span
                        className={cn(
                          "text-[9px] uppercase tracking-widest leading-none font-semibold",
                          isOnline ? "text-emerald-600" : "text-stone-400",
                        )}
                      >
                        {isOnline
                          ? `On ${u.device_type || "Device"}`
                          : "Offline"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                label: "Active Projects",
                value: isLoading ? "..." : projects.length,
                id: "01",
                icon: <ClipboardList className="w-6 h-6 text-stone-900" />,
                show: true,
              },
              {
                label: "Low Stock Items",
                value: summary?.low_stock || 0,
                id: "02",
                alert: (summary?.low_stock || 0) > 0,
                icon: (
                  <AlertTriangle
                    className={cn(
                      "w-6 h-6",
                      (summary?.low_stock || 0) > 0
                        ? "text-rose-500"
                        : "text-emerald-500",
                    )}
                  />
                ),
                show:
                  hasPermission(user, Action.VIEW_LOW_STOCK) ||
                  hasGodMode(user),
              },
              {
                label: "Pending Receipts",
                value: summary?.pending_grns || 0,
                id: "03",
                icon: <Package className="w-6 h-6 text-stone-900" />,
                show:
                  hasPermission(user, Action.VIEW_WAREHOUSE) ||
                  hasPermission(user, Action.RECEIVE_PO) ||
                  hasGodMode(user),
              },
            ]
              .filter((stat) => stat.show)
              .map((stat) => (
                <div
                  key={stat.id}
                  className="card-elegant p-4 md:p-8 relative rounded-[2rem]"
                >
                  <div className="flex items-start justify-between mb-8">
                    <div className="p-3 md:p-4 bg-stone-50 rounded-2xl ring-1 ring-stone-100">
                      {stat.icon}
                    </div>
                    <span className="text-[10px] font-bold text-stone-400 tracking-[0.3em] font-mono">
                      {stat.id}
                    </span>
                  </div>
                  <div className="text-[10px] text-stone-400 font-bold mb-1 uppercase tracking-[0.2em]">
                    {stat.label}
                  </div>
                  <div
                    className={`text-xl md:text-xl font-light tracking-tight ${stat.alert ? "text-rose-600" : "text-stone-900 font-sans"}`}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
          </div>

          {/* Active Projects Monitor Widget */}
          <HasRole
            allowedRoles={["MANAGER", "FC", "ENGINEERING", "PRODUCTION"]}
          >
            <div className="space-y-8">
              <div className="text-[10px] text-stone-400 font-bold flex items-center gap-2 uppercase tracking-[0.2em]">
                <FolderKanban className="w-4 h-4 text-stone-900" />
                Active Project Progress Monitor
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {monitorData.map((mon, i) => {
                  const grnProgress =
                    mon.prProgress.total_pr_qty > 0
                      ? Math.round(
                          (mon.prProgress.total_received_qty /
                            mon.prProgress.total_pr_qty) *
                            100,
                        )
                      : 0;

                  return (
                    <div
                      key={i}
                      className="card-elegant p-4 md:p-8 rounded-[2.5rem] flex flex-col gap-6 md:gap-8"
                    >
                      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                        <div>
                          <div className="flex items-center gap-3">
                            <h4 className="text-xl font-bold text-stone-900 tracking-tighter uppercase">
                              {mon.name}
                            </h4>
                            <span
                              className={cn(
                                "px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-widest ring-1 ring-inset",
                                mon.status === "DRAFT"
                                  ? "bg-stone-50 text-stone-400 ring-stone-100"
                                  : "bg-stone-200/40 text-stone-900 ring-stone-900/20",
                              )}
                            >
                              {mon.status}
                            </span>
                            {(mon.urgency === "URGENT" ||
                              mon.urgency === "CRITICAL") && (
                              <span
                                className={cn(
                                  "px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-widest",
                                  mon.urgency === "CRITICAL"
                                    ? "bg-rose-500 text-white"
                                    : "bg-amber-500 text-white",
                                )}
                              >
                                {mon.urgency}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-2">
                            UUID: {mon.id}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasPermission(user, Action.MANAGE_BOM) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelProject(mon.id);
                              }}
                              className="w-10 h-10 flex items-center justify-center text-rose-600 hover:text-white bg-rose-50/50 hover:bg-rose-600 border border-rose-100 hover:border-rose-600 rounded-2xl transition-all shadow-sm shrink-0"
                              title="Cancel Project"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          <Link
                            to={`/project/${mon.id}`}
                            state={{ from: "overview" }}
                            className="w-10 h-10 flex items-center justify-center bg-stone-800 text-white hover:bg-stone-900 rounded-2xl transition-all shadow-xl shadow-stone-900/10"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </Link>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-6 bg-stone-50/50 rounded-3xl ring-1 ring-stone-100/50 flex flex-col justify-center">
                          <div className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-2">
                            {t.purchasedItems}
                          </div>
                          <div className="text-xl font-light text-stone-900 leading-none">
                            {mon.prItemCount}{" "}
                            <span className="text-[10px] uppercase font-bold text-stone-400">
                              sku
                            </span>
                          </div>
                        </div>
                        <div className="p-6 bg-stone-50/50 rounded-3xl ring-1 ring-stone-100/50 flex flex-col justify-center">
                          <div className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-2">
                            {t.stockReady}
                          </div>
                          <div className="text-xl font-light text-stone-900 leading-none">
                            {mon.stockItemCount}{" "}
                            <span className="text-[10px] uppercase font-bold text-stone-400">
                              sku
                            </span>
                          </div>
                        </div>
                        <div className="col-span-2 p-6 bg-stone-50/50 rounded-3xl ring-1 ring-stone-100/50 flex flex-col justify-center">
                          <div className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-3 flex justify-between">
                            <span>{t.fulfillment}</span>
                            <span
                              className={cn(
                                "font-mono",
                                grnProgress === 100
                                  ? "text-emerald-500"
                                  : "text-stone-500",
                              )}
                            >
                              {grnProgress}%
                            </span>
                          </div>
                          <div className="h-2 w-full bg-stone-200/50 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${grnProgress}%` }}
                              className={cn(
                                "h-full transition-all duration-700 ease-out",
                                grnProgress === 100
                                  ? "bg-emerald-500"
                                  : "bg-stone-800",
                              )}
                            />
                          </div>
                          <div className="text-[10px] font-bold text-stone-400 mt-3 text-right tabular-nums">
                            {mon.prProgress.total_received_qty} /{" "}
                            {mon.prProgress.total_pr_qty} RECEIVED
                          </div>
                        </div>
                      </div>

                      <div className="bg-stone-50/30 rounded-[2rem] ring-1 ring-stone-100/50 p-6">
                        <div className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-5 flex items-center justify-between">
                          <span>{t.productionTimeline}</span>
                          <span className="bg-white ring-1 ring-stone-100 text-stone-500 px-2.5 py-1 rounded-xl text-[9px] font-bold">
                            {
                              mon.tasks.filter(
                                (tk: any) => tk.status !== "CANCELLED",
                              ).length
                            }{" "}
                            UNIT PROCESSES
                          </span>
                        </div>
                        {mon.tasks.length === 0 ? (
                          <div className="text-[11px] text-stone-400 font-bold uppercase tracking-widest py-4 text-center">
                            {t.noTasks}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {mon.tasks
                              .filter((t: any) => !!t)
                              .slice(0, 3)
                              .map((task: any) => (
                                <div
                                  key={task.id}
                                  className="flex justify-between items-center group"
                                >
                                  <div className="flex items-center gap-4 w-1/2">
                                    <div
                                      className={cn(
                                        "w-2 h-2 rounded-full shrink-0 shadow-sm",
                                        task.status === "COMPLETED"
                                          ? "bg-emerald-400 shadow-emerald-200"
                                          : task.status === "IN_PROGRESS"
                                            ? "bg-amber-400 shadow-amber-200"
                                            : task.status === "REJECTED"
                                              ? "bg-rose-500 shadow-rose-200 animate-pulse"
                                              : task.status === "CANCELLED"
                                                ? "bg-stone-100 shadow-stone-100"
                                                : "bg-stone-300 shadow-stone-100",
                                      )}
                                    />
                                    <span
                                      className={cn(
                                        "text-[13px] font-bold truncate tracking-tight transition-colors uppercase",
                                        task.status === "CANCELLED"
                                          ? "line-through text-stone-400 group-hover:text-stone-500"
                                          : "text-stone-800 group-hover:text-stone-950",
                                      )}
                                    >
                                      {task.task_name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-6 w-1/2 justify-end">
                                    <span
                                      className={cn(
                                        "text-[10px] uppercase tracking-tight tabular-nums",
                                        task.status === "CANCELLED"
                                          ? "text-stone-300 line-through font-bold"
                                          : "text-stone-400 font-bold",
                                      )}
                                    >
                                      {new Date(
                                        task.start_date,
                                      ).toLocaleDateString(undefined, {
                                        timeZone: "Asia/Jakarta",
                                        month: "short",
                                        day: "numeric",
                                      })}
                                    </span>
                                    <div
                                      className={cn(
                                        "w-20 h-1.5 rounded-full overflow-hidden shrink-0 ring-1",
                                        task.status === "CANCELLED"
                                          ? "bg-stone-50 ring-stone-100"
                                          : "bg-stone-100 ring-stone-200/20",
                                      )}
                                    >
                                      <div
                                        style={{
                                          width:
                                            task.status === "CANCELLED"
                                              ? "0%"
                                              : `${task.progress}%`,
                                        }}
                                        className={cn(
                                          "h-full transition-all duration-300",
                                          task.status === "COMPLETED"
                                            ? "bg-emerald-400"
                                            : "bg-stone-400",
                                        )}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            {mon.tasks.length > 3 && (
                              <div className="text-[9px] font-bold text-stone-400 text-center pt-4 border-t border-stone-100/50 uppercase tracking-[0.3em]">
                                + {mon.tasks.length - 3} {t.moreTasks}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {monitorData.length === 0 && (
                  <div className="col-span-full border border-stone-100 rounded-3xl p-10 text-center bg-stone-50 text-stone-400">
                    No active projects at this time.
                  </div>
                )}
              </div>
            </div>
          </HasRole>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Timeline Column (Span 2) */}
            <div className="lg:col-span-2 space-y-6">
              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest flex items-center justify-between">
                <span>Production Pipeline</span>
                <Button
                  variant="secondary"
                  onClick={() => setIsFullscreenGantt(!isFullscreenGantt)}
                  className="p-2"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-stone-400" />
                </Button>
              </div>

              <div
                className={cn(
                  "border border-stone-200/60 rounded-3xl bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all duration-500 flex flex-col",
                  isFullscreenGantt
                    ? "fixed inset-8 z-[60] shadow-[0_30px_100px_rgba(0,0,0,0.15)] border-stone-200"
                    : "h-[650px] relative overflow-hidden hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)]",
                )}
              >
                {isFullscreenGantt && (
                  <div className="p-6 border-b border-stone-100 flex flex-col lg:flex-row gap-4 justify-between items-center bg-white shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                      <h3 className="text-sm font-bold tracking-widest uppercase text-stone-900">
                        Master Gantt Timeline
                      </h3>
                    </div>

                    {/* Excel-style Zoom Controller */}
                    <div className="flex items-center gap-2 bg-stone-50 border border-stone-200/80 p-2 rounded-2xl">
                      <span className="text-[9px] font-bold uppercase text-stone-400 tracking-wider">
                        ZOOM:
                      </span>
                      <button
                        onClick={() =>
                          setGanttZoom((prev) => Math.max(50, prev - 25))
                        }
                        disabled={ganttZoom <= 50}
                        className="w-7 h-7 flex items-center justify-center bg-white hover:bg-stone-100 border border-stone-200 rounded-lg text-xs font-bold text-stone-700 transition disabled:opacity-40"
                        title="Zoom Out"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min="50"
                        max="200"
                        step="25"
                        value={ganttZoom}
                        onChange={(e) => setGanttZoom(parseInt(e.target.value))}
                        className="w-20 accent-stone-900 cursor-pointer h-1.5"
                      />
                      <button
                        onClick={() =>
                          setGanttZoom((prev) => Math.min(200, prev + 25))
                        }
                        disabled={ganttZoom >= 200}
                        className="w-7 h-7 flex items-center justify-center bg-white hover:bg-stone-100 border border-stone-200 rounded-lg text-xs font-bold text-stone-700 transition disabled:opacity-40"
                        title="Zoom In"
                      >
                        +
                      </button>
                      <span className="text-[10px] font-mono font-bold text-stone-600 bg-white border border-stone-200 px-2 py-0.5 rounded-md min-w-[45px] text-center">
                        {ganttZoom}%
                      </span>
                      <button
                        onClick={() => setGanttZoom(100)}
                        className="px-2 py-1 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg text-[8px] font-bold uppercase tracking-wider text-stone-500 transition"
                      >
                        Reset
                      </button>
                    </div>

                    <button
                      onClick={() => setIsFullscreenGantt(false)}
                      className="p-2 hover:bg-stone-100 rounded-full transition-colors shrink-0"
                    >
                      <X className="w-5 h-5 text-stone-400" />
                    </button>
                  </div>
                )}

                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  {/* Legends */}
                  <div className="p-3 border-b border-stone-50 flex items-center gap-6 bg-stone-50/30">
                    {[
                      { label: "PR Procurement", color: "bg-indigo-600" },
                      { label: "BOP Process", color: "bg-blue-600" },
                      { label: "Completed", color: "bg-emerald-600" },
                      { label: "Alert / QC Rejected", color: "bg-rose-600" },
                    ].map((l) => (
                      <div
                        key={l.label}
                        className="flex items-center gap-1.5 grayscale-[0.2]"
                      >
                        <div className={cn("w-2 h-2 rounded-full", l.color)} />
                        <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                          {l.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-1 overflow-hidden">
                    {/* Left: Project Names */}
                    <div className="w-56 border-r border-stone-100 flex flex-col bg-white shrink-0">
                      <div
                        className={cn(
                          "h-10 border-b border-stone-100 bg-stone-50/50 flex items-center px-4 text-[9px] font-semibold text-stone-400 uppercase tracking-[0.2em] sticky top-0 z-20",
                        )}
                      >
                        Active Workloads
                      </div>
                      <div
                        className={cn(
                          "flex-1 py-2",
                          isFullscreenGantt
                            ? "overflow-y-auto custom-scrollbar"
                            : "overflow-hidden",
                        )}
                      >
                        {projects.map((project) => (
                          <div key={project.id} className="group">
                            <div
                              className={cn(
                                "px-4 py-2 flex items-center justify-between hover:bg-stone-50 cursor-pointer transition-colors",
                                expandedProjects.has(project.id) &&
                                  "bg-stone-50/60",
                              )}
                              onClick={() => toggleProject(project.id)}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ChevronRight
                                  className={cn(
                                    "w-3 h-3 text-stone-400 transition-transform",
                                    expandedProjects.has(project.id) &&
                                      "rotate-90 text-stone-900",
                                  )}
                                />
                                <div className="truncate">
                                  <div className="text-[10px] font-semibold text-stone-900 truncate uppercase tracking-tight">
                                    {project.name}
                                  </div>
                                  <div className="text-[8px] text-stone-400 font-bold uppercase tracking-widest leading-none mt-0.5">
                                    {project.id}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {expandedProjects.has(project.id) &&
                              project.tasks && (
                                <div className="bg-stone-50/20 py-1">
                                  {project.tasks.map((task) => (
                                    <div
                                      key={task.id}
                                      className={cn(
                                        "pl-9 pr-3 py-1.5 text-[10px] flex justify-between items-center hover:bg-stone-100 cursor-pointer transition-colors",
                                        selectedTask?.id === task.id &&
                                          "bg-stone-100 border-r-2 border-stone-900",
                                      )}
                                      onClick={() => setSelectedTask(task)}
                                    >
                                      <span className="truncate text-stone-600 font-bold uppercase tracking-tighter">
                                        {task.task_name}
                                      </span>
                                      <span className="text-[8px] font-semibold text-stone-400">
                                        {task.progress}%
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: Timeline Visualization */}
                    <div
                      ref={ganttContainerRef}
                      className={cn(
                        "flex-1 flex flex-col relative bg-[#FCFCFB]",
                        isFullscreenGantt
                          ? "overflow-auto custom-scrollbar"
                          : "overflow-hidden",
                        isDraggingGantt ? "cursor-grabbing" : "cursor-grab",
                      )}
                      {...ganttHandlers}
                    >
                      {(() => {
                        const ganttMonths: {
                          month: string;
                          year: string;
                          days: number;
                        }[] = [];
                        ganttTimeline.days.forEach((day) => {
                          const month = day.toLocaleDateString("en-US", {
                            timeZone: "Asia/Jakarta",
                            month: "long",
                          });
                          const year = day.toLocaleDateString("en-US", {
                            timeZone: "Asia/Jakarta",
                            year: "numeric",
                          });
                          const last = ganttMonths[ganttMonths.length - 1];
                          if (
                            last &&
                            last.month === month &&
                            last.year === year
                          ) {
                            last.days++;
                          } else {
                            ganttMonths.push({ month, year, days: 1 });
                          }
                        });
                        return (
                          <div className="flex flex-col border-b border-stone-100 bg-stone-50/50 shrink-0 min-w-max sticky top-0 z-20">
                            <div className="flex border-b border-stone-100">
                              {ganttMonths.map((m, i) => (
                                <div
                                  key={i}
                                  className="py-1 text-center border-r border-stone-200 flex items-center justify-center bg-stone-100/30"
                                  style={{ width: `${m.days * DAY_WIDTH}px` }}
                                >
                                  <span className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">
                                    {m.month} {m.year}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center">
                              {ganttTimeline.days.map((day, i) => {
                                const isToday =
                                  day.toDateString() ===
                                  new Date().toDateString();
                                return (
                                  <div
                                    key={i}
                                    style={{ width: `${DAY_WIDTH}px` }}
                                    className={`shrink-0 border-r border-stone-200 p-2 text-center flex flex-col justify-center h-10 ${isToday ? "bg-stone-100" : ""}`}
                                  >
                                    <span
                                      className={`text-[8px] uppercase tracking-widest ${isToday ? "text-stone-900 font-bold" : "text-stone-400 font-semibold"}`}
                                    >
                                      {day.toLocaleDateString("en-US", {
                                        timeZone: "Asia/Jakarta",
                                        weekday: "short",
                                      })}
                                    </span>
                                    <span
                                      className={`text-[10px] font-medium ${isToday ? "text-stone-950" : "text-stone-700"}`}
                                    >
                                      {day.getDate()}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex-1 relative min-w-max py-2 flex">
                        {ganttTimeline.days.map((day, i) => {
                          const isToday =
                            day.toDateString() === new Date().toDateString();
                          return (
                            <div
                              key={i}
                              style={{ width: `${DAY_WIDTH}px` }}
                              className={`shrink-0 border-r border-stone-100/30 h-full pointer-events-none ${isToday ? "bg-stone-50/10" : ""}`}
                            />
                          );
                        })}

                        <div
                          className="absolute top-0 bottom-0 border-l-2 border-stone-900/10 pointer-events-none z-0"
                          style={{
                            left: getPositionStyle(
                              new Date().toISOString(),
                              new Date().toISOString(),
                            ).left,
                          }}
                        />

                        <div className="absolute top-0 left-0 right-0">
                          {projects.map((project, pIndex) => {
                            const pHeight = 35; // height of project row in list
                            const tHeight = 27; // height of task row in list

                            let yOffset = 0;
                            for (let i = 0; i < pIndex; i++) {
                              yOffset += pHeight;
                              if (expandedProjects.has(projects[i].id)) {
                                yOffset +=
                                  (projects[i].tasks?.length || 0) * tHeight;
                                yOffset += 8; // group padding
                              }
                            }

                            return (
                              <React.Fragment key={project.id}>
                                <div
                                  className="absolute bg-stone-200/40 hover:bg-stone-200/60 transition-all cursor-pointer group/project border-r border-stone-900/20"
                                  style={{
                                    ...getPositionStyle(
                                      project.created_at,
                                      project.due_date,
                                    ),
                                    top: `${yOffset}px`,
                                    height: `${pHeight}px`,
                                  }}
                                  onClick={() => toggleProject(project.id)}
                                >
                                  <div className="absolute top-1 left-1 text-[9px] font-bold text-stone-950 opacity-0 group-hover/project:opacity-100 transition-opacity uppercase tracking-widest whitespace-nowrap bg-white/80 px-1 rounded shadow-sm z-10">
                                    {project.name}
                                  </div>
                                </div>

                                {expandedProjects.has(project.id) &&
                                  (project.tasks || [])
                                    .filter((t: any) => !!t)
                                    .map((task: any, tIndex: number) => (
                                      <div
                                        key={task.id}
                                        className={cn(
                                          "absolute transition-all cursor-pointer border-r border-b group/task opacity-80 hover:opacity-100 overflow-hidden rounded-xs shadow-2xs",
                                          Boolean(task.pr_id || (task.task_name && task.task_name.includes("[Procurement]")))
                                            ? (task.status === "COMPLETED"
                                                ? "bg-indigo-600 border-indigo-700 text-white"
                                                : task.status === "REJECTED"
                                                  ? "bg-rose-600 border-rose-700 text-white animate-pulse"
                                                  : task.status === "IN_PROGRESS" || task.status === "RUNNING"
                                                    ? "bg-amber-500 border-amber-600 text-stone-900"
                                                    : "bg-purple-400 border-purple-500 text-white")
                                            : (task.status === "COMPLETED"
                                                ? "bg-emerald-600 border-emerald-700 text-white"
                                                : task.status === "RUNNING" || task.status === "IN_PROGRESS"
                                                  ? "bg-blue-600 border-blue-700 text-white"
                                                  : task.status === "PAUSED"
                                                    ? "bg-amber-500 border-amber-600 text-stone-900 animate-pulse"
                                                    : "bg-stone-400 border-stone-500 text-white"),
                                        )}
                                        style={{
                                          ...getPositionStyle(
                                            task.start_date,
                                            task.end_date,
                                          ),
                                          top: `${yOffset + pHeight + tIndex * tHeight}px`,
                                          height: `${tHeight}px`,
                                        }}
                                        onClick={() => setSelectedTask(task)}
                                      >
                                        <div
                                          className="h-full bg-white/30 transition-all border-r border-white/50"
                                          style={{ width: `${task.progress}%` }}
                                        />
                                        <div className="absolute top-1 left-1 text-[8px] font-bold text-stone-800 opacity-0 group-hover/task:opacity-100 transition-opacity uppercase whitespace-nowrap bg-white/90 px-1 rounded shadow-sm border border-stone-100 z-10">
                                          {task.task_name}
                                        </div>
                                      </div>
                                    ))}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Required Window (Span 1) */}
            <div className="space-y-6 flex flex-col h-full">
              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest flex items-center justify-between w-full">
                <span>Action Required</span>
                {actionRequiredCount > 0 && (
                  <span className="bg-red-500 text-white rounded-full text-[9px] px-2.5 py-1 font-bold tracking-normal animate-pulse shadow-sm">
                    {actionRequiredCount} REQUIRED
                  </span>
                )}
              </div>
              <div className="border border-stone-200/60 rounded-[2.5rem] overflow-hidden bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-shadow duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] h-[650px] flex flex-col">
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                  {filteredActions.map((action, i) => (
                    <Link
                      key={i}
                      to={action.link}
                      className={cn(
                        "p-6 rounded-[2rem] border transition-all hover:bg-stone-50 group flex flex-col justify-between shrink-0 card-elegant",
                        action.priority === "HIGH"
                          ? "border-red-100 ring-4 ring-red-50/50"
                          : "border-stone-100",
                      )}
                    >
                      <div>
                        <div
                          className={cn(
                            "w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center mb-4",
                            action.priority === "HIGH"
                              ? "bg-red-50 text-red-500"
                              : "bg-stone-50 text-stone-500",
                          )}
                        >
                          <AlertCircle className="w-5 h-5" />
                        </div>
                        <div className="text-[13px] font-bold text-stone-900 tracking-tight uppercase mb-1">
                          {action.title}
                        </div>
                        <p className="text-xs text-stone-500 leading-relaxed line-clamp-2">
                          {action.description}
                        </p>
                      </div>
                      <div className="mt-6 flex items-center gap-2 text-[9px] font-bold text-stone-900 group-hover:gap-3 transition-all uppercase tracking-[0.2em]">
                        {t.resolve} <ArrowRight className="w-3 h-3" />
                      </div>
                    </Link>
                  ))}
                  {filteredActions.length === 0 && (
                    <div className="flex flex-col items-center justify-center flex-1 text-center text-stone-400 min-h-[200px]">
                      <CheckCircle2 className="w-8 h-8 mb-3 text-stone-400" />
                      <div className="text-[10px] uppercase tracking-widest font-bold">
                        No Pending Actions
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Library & Archive */}
      <div className="space-y-6 pt-12 border-t border-stone-200/50 mt-12 block">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-stone-100 flex items-center justify-center border border-stone-200">
            <Library className="w-5 h-5 text-stone-600" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-stone-900 tracking-tight uppercase">
              Library & Archive
            </h3>
            <p className="text-xs font-bold text-stone-400 tracking-widest uppercase">
              Completed & Historical Projects
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {archivedProjects.map((p) => (
            <div
              key={p.id}
              className="bg-white border border-stone-200 p-4 md:p-6 rounded-[2rem] hover:border-stone-300 transition-all flex flex-col justify-between group shadow-sm hover:shadow-md"
            >
              <div>
                <div className="text-[10px] bg-stone-100 text-stone-500 font-bold px-2 py-0.5 rounded w-fit mb-3">
                  {p.id}
                </div>
                <h4 className="text-lg font-bold text-stone-900 mb-2 truncate">
                  {p.name}
                </h4>
                <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">
                  {p.remarks || "No remarks provided for this project."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-stone-50 text-stone-600 rounded-lg text-[10px] font-bold tracking-widest uppercase border border-stone-100">
                    CUST: {p.customer || "N/A"}
                  </span>
                  {(p.urgency === "URGENT" || p.urgency === "CRITICAL") && (
                    <span
                      className={cn(
                        "px-2 py-1 rounded-lg text-[10px] font-bold tracking-widest uppercase",
                        p.urgency === "CRITICAL"
                          ? "bg-rose-500 text-white"
                          : "bg-amber-500 text-white",
                      )}
                    >
                      {p.urgency}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-stone-100/60 flex items-center justify-between">
                <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                  Archived:{" "}
                  {p.archived_at
                    ? new Date(p.archived_at).toLocaleDateString("en-US", {
                        timeZone: "Asia/Jakarta",
                      })
                    : "N/A"}
                </div>
                <div className="flex items-center gap-2">
                  {hasPermission(user, Action.MANAGE_BOM) && (
                    <button
                      onClick={() => {
                        window.location.href = `/project/${p.id}?repeat=true`;
                      }}
                      className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors uppercase tracking-widest"
                    >
                      Repeat Order
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {archivedProjects.length === 0 && (
            <div className="col-span-full py-16 text-center border-2 border-dashed border-stone-200 rounded-[2rem] bg-stone-50">
              <div className="text-stone-400 font-bold tracking-widest uppercase text-xs">
                No projects in archive yet.
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Capacity Config Modal */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        maxWidth="2xl"
        title="Work Center Capacity Configuration"
        contentClassName="p-0 border border-stone-100"
      >
        <div className="absolute top-4 right-14">
          <Button
            size="sm"
            onClick={() =>
              setConfigForm([
                ...configForm,
                {
                  id: "WC-" + Math.random().toString(36).substr(2, 9),
                  name: "New Work Center",
                  manpower_count: 1,
                  hours_per_day: 8,
                  days_per_week: 5,
                  capacity_per_week: 40,
                },
              ])
            }
          >
            + Add Center
          </Button>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {configForm.map((wc, idx) => (
              <div
                key={wc.id}
                className="p-4 border border-stone-200 rounded-xl space-y-4 bg-stone-50/50 relative group"
              >
                <button
                  type="button"
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: "Delete Work Center?",
                      message: `Are you sure you want to delete ${wc.name}?`,
                      action: async () => {
                        if (
                          !wc.id.startsWith("WC-") &&
                          !wc.id.startsWith("NEW-")
                        ) {
                          try {
                            const response = await apiFetch(
                              `/api/work-centers/${wc.id}`,
                              { method: "DELETE" },
                              user?.username,
                            );
                            if (!response.ok) {
                              showToast(
                                response.error ||
                                  "Failed to delete work center",
                                "error",
                              );
                              setConfirmModal((prev) => ({
                                ...prev,
                                isOpen: false,
                              }));
                              return;
                            }
                          } catch (err) {
                            showToast("Network error while deleting", "error");
                            setConfirmModal((prev) => ({
                              ...prev,
                              isOpen: false,
                            }));
                            return;
                          }
                        }
                        setConfigForm((prev) =>
                          prev.filter((_, i) => i !== idx),
                        );
                        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                      },
                    });
                  }}
                  className="absolute top-3 right-3 text-stone-400 hover:text-red-500 bg-white hover:bg-red-50 border border-stone-200 p-1.5 rounded-lg transition-all"
                  title="Delete Work Center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="flex justify-between items-center pr-10">
                  <input
                    className="font-bold text-stone-900 uppercase tracking-wider text-xs bg-transparent border-b border-transparent focus:border-stone-300 outline-none"
                    value={wc.name}
                    onChange={(e) => {
                      const newForm = [...configForm];
                      newForm[idx] = { ...wc, name: e.target.value };
                      setConfigForm(newForm);
                    }}
                  />
                  <div className="text-[10px] bg-stone-200 px-2 py-0.5 rounded font-bold">
                    {(
                      wc.manpower_count *
                      wc.hours_per_day *
                      wc.days_per_week
                    ).toFixed(1)}{" "}
                    Hrs/Week
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Input
                    label="Manpower"
                    type="number"
                    min="1"
                    value={wc.manpower_count}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const newForm = [...configForm];
                      newForm[idx] = { ...wc, manpower_count: val };
                      setConfigForm(newForm);
                    }}
                  />
                  <Input
                    label="Hrs/Day"
                    type="number"
                    min="1"
                    max="24"
                    value={wc.hours_per_day}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const newForm = [...configForm];
                      newForm[idx] = { ...wc, hours_per_day: val };
                      setConfigForm(newForm);
                    }}
                  />
                  <Input
                    label="Days/Wk"
                    type="number"
                    min="1"
                    max="7"
                    value={wc.days_per_week}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const newForm = [...configForm];
                      newForm[idx] = { ...wc, days_per_week: val };
                      setConfigForm(newForm);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800 leading-relaxed">
              <strong>Capacity Formula:</strong> Manpower × Hours/Day ×
              Days/Week. Adjusting these values will immediately update the
              Capacity Planner's red limit lines after saving.
            </div>
          </div>
        </div>
        <div className="p-6 border-t border-stone-100 flex justify-end gap-3 bg-stone-50/20">
          <Button variant="secondary" onClick={() => setShowConfigModal(false)}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setIsSubmittingConfig(true);
              try {
                let allOk = true;
                for (const wc of configForm) {
                  const response = await apiFetch(
                    "/api/work-centers",
                    {
                      method: "POST",
                      body: JSON.stringify(wc),
                    },
                    user?.username,
                  );
                  if (!response.ok) allOk = false;
                }
                if (allOk) {
                  await fetchData();
                  setShowConfigModal(false);
                  showToast("Configuration saved successfully", "success");
                } else {
                  showToast("Failed to save configuration", "error");
                }
              } catch (err) {
                console.error(err);
                showToast("Error saving configuration", "error");
              } finally {
                setIsSubmittingConfig(false);
              }
            }}
            disabled={isSubmittingConfig}
          >
            {isSubmittingConfig ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </Modal>

      {/* ConfirmModal rendering outside other modals */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
}
