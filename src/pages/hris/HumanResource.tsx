import { copyToClipboard } from "@/utils/clipboard";
import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Action, hasPermission } from "@/utils/pbac";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import PayrollSalarySettings from "@/components/hris/PayrollSalarySettings";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Modal } from "@/components/ui/Modal";
import { JobVacancyModal } from "@/components/hris/modals/JobVacancyModal";
import { CandidateEvaluationModal } from "@/components/hris/modals/CandidateEvaluationModal";
import { KpiAppraisalModal } from "@/components/hris/modals/KpiAppraisalModal";
import { HandoverModal } from "@/components/hris/modals/HandoverModal";
import { PayrollRequisitionModal } from "@/components/hris/modals/PayrollRequisitionModal";
import { PrqViewModal } from "@/components/hris/modals/PrqViewModal";
import { PrqConfirmModal } from "@/components/hris/modals/PrqConfirmModal";
import { GeneratePayslipModal } from "@/components/hris/modals/GeneratePayslipModal";
import EventManagement from "./EventManagement";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import {
  Briefcase,
  Users,
  Award,
  Repeat,
  Plus,
  Trash2,
  MapPin,
  Clock,
  Calendar,
  CalendarDays,
  TrendingDown,
  RefreshCw,
  DollarSign,
  Download,
  FileText,
  CheckCircle,
  X,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Send,
  Lock,
  Sliders,
  Shield,
  ShieldCheck,
  CheckCircle2,
  Globe,
  Loader2,
  CheckSquare,
  Square,
  UserCheck,
  Search,
  ClipboardList,
  ShoppingCart,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  UserMinus,
  Mail,
  Copy,
  Receipt,
  Printer,
  Eye,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { getDailyAuthKey } from "@/utils/auth";
import { motion, AnimatePresence } from "motion/react";
import { PageHeader } from "@/components/shared/PageHeader";

interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  status: "OPEN" | "CLOSED";
  type: string;
  description: string;
  requirements: string; // JSON Array of strings
  benefits: string; // JSON Array of strings
  salary_string: string;
  pamphlet_bg_color: string;
  pamphlet_accent_color: string;
  created_at: string;
}

interface Application {
  id: string;
  job_id: string;
  job_title?: string;
  job_department?: string;
  name: string;
  email: string;
  phone: string;
  linkedin_url?: string;
  experience?: string;
  resume_text?: string;
  status:
    | "APPLIED"
    | "SCREENING"
    | "INTERVIEW"
    | "OFFER_MADE"
    | "ACCEPTED"
    | "REJECTED";
  applied_at: string;
  notes?: string;
  onboarding_token?: string;
  token_used?: number;
}

interface KPI {
  id: string;
  employee_username: string;
  employee_name?: string;
  evaluator_username: string;
  evaluator_name?: string;
  period_name: string;
  score_communication: number;
  score_productivity: number;
  score_reliability: number;
  score_leadership: number;
  score_technical: number;
  overall_score: number;
  evaluation_notes: string;
  created_at: string;
}

interface HandoverItem {
  id: string;
  title: string;
  status: "PENDING" | "COMPLETED";
}

interface Handover {
  id: string;
  resigning_username: string;
  resigning_name?: string;
  successor_username: string;
  successor_name?: string;
  target_last_date: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  handover_notes: string;
  checklist_json: string; // JSON Array of HandoverItem
  created_at: string;
}

interface UserDirectoryItem {
  username: string;
  name: string;
  role: string;
}

export default function HumanResource() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const formatRupiah = (val: any) => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatLocalDate = (isoOrString: string) => {
    if (!isoOrString) return "-";
    try {
      const d = new Date(isoOrString);
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "Asia/Jakarta",
      });
    } catch (e) {
      return isoOrString;
    }
  };

  const formatLocalTime = (isoOrString: string) => {
    if (!isoOrString) return "-";
    try {
      const d = new Date(isoOrString);
      return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      });
    } catch (e) {
      return isoOrString;
    }
  };

  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, action: () => Promise<void>, isDestructive?: boolean}>({
    isOpen: false,
    title: "",
    message: "",
    action: async () => {},
  });

  // Admin Tabs
  const [adminTab, setAdminTab] = useState<
    | "DASHBOARD"
    | "DIRECTORY"
    | "ATTENDANCE"
    | "LEAVE"
    | "PAYROLL"
    | "VACANCIES"
    | "CANDIDATES"
    | "KPI"
    | "HANDOVER"
    | "SETTINGS"
    | "EVENT"
  >("DASHBOARD");

  // Synchronize URL search params with active tab
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let tabParam = params.get("tab")?.toUpperCase();
    if (location.pathname === "/hr/event" || location.pathname.endsWith("/event")) {
      tabParam = "EVENT";
    }
    if (
      tabParam &&
      [
        "DASHBOARD",
        "DIRECTORY",
        "ATTENDANCE",
        "LEAVE",
        "PAYROLL",
        "VACANCIES",
        "CANDIDATES",
        "KPI",
        "HANDOVER",
        "SETTINGS",
        "EVENT",
      ].includes(tabParam)
    ) {
      setAdminTab(tabParam as any);
    } else if (!tabParam) {
      setAdminTab("DASHBOARD");
    }
  }, [location.search, location.pathname]);

  const handleTabChange = (
    tab:
      | "DASHBOARD"
      | "DIRECTORY"
      | "ATTENDANCE"
      | "LEAVE"
      | "PAYROLL"
      | "VACANCIES"
      | "CANDIDATES"
      | "KPI"
      | "HANDOVER"
      | "SETTINGS"
      | "EVENT",
  ) => {
    setAdminTab(tab);
    setSearchQuery("");
    const params = new URLSearchParams(location.search);
    params.set("tab", tab.toLowerCase());
    navigate({ search: params.toString() }, { replace: true });
  };

  // Database States
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [users, setUsers] = useState<UserDirectoryItem[]>([]);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [payrollReqs, setPayrollReqs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResettingHris, setIsResettingHris] = useState(false);

  // Payroll Requisition (PRq) States
  const [isPrqModalOpen, setIsPrqModalOpen] = useState(false);
  const [prqMonth, setPrqMonth] = useState<number>(new Date().getMonth() + 1);
  const [prqYear, setPrqYear] = useState<number>(new Date().getFullYear());
  const [prqNotes, setPrqNotes] = useState("");
  const [prqDetails, setPrqDetails] = useState<any[]>([]);
  const [prqEditingId, setPrqEditingId] = useState<string | null>(null);
  const [isPreparingPrq, setIsPreparingPrq] = useState(false);
  const [isSavingPrq, setIsSavingPrq] = useState(false);
  const [selectedPrqView, setSelectedPrqView] = useState<any | null>(null);
  const [isPrqViewModalOpen, setIsPrqViewModalOpen] = useState(false);
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [payrollSubTab, setPayrollSubTab] = useState<"DASHBOARD" | "SALARIES">("DASHBOARD");
  const [prqStatusFilter, setPrqStatusFilter] = useState<string>("ALL");
  const [prqSearchQuery, setPrqSearchQuery] = useState<string>("");

  // Confirmation Modal state for critical PRq and Payroll actions
  const [prqConfirmModal, setPrqConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "SUBMIT_PRQ" | "CANCEL_PRQ" | "DELETE_PRQ" | "CONVERT_PRQ" | "PAYSLIP";
    data?: any;
    reasonInput?: string;
    authPin?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "SUBMIT_PRQ",
    authPin: "",
  });

  // Leave & Manager Approval states
  const [leaveDeptFilter, setLeaveDeptFilter] = useState<string>("ALL");
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<string>("ALL");
  const [hrManagerNotes, setHrManagerNotes] = useState<Record<string, string>>(
    {},
  );
  const [processingLeaveId, setProcessingLeaveId] = useState<string | null>(null);
  const [isProcessingPrqAction, setIsProcessingPrqAction] = useState(false);

  // Form Inputs - Payslips
  const [isPayslipModalOpen, setIsPayslipModalOpen] = useState(false);
  const [payslipEmployee, setPayslipEmployee] = useState("");
  const [payslipMonth, setPayslipMonth] = useState("June 2026");
  const [payslipBasic, setPayslipBasic] = useState(4500000);
  const [payslipAllowances, setPayslipAllowances] = useState(500000);
  const [payslipDeductions, setPayslipDeductions] = useState(100000);
  const [isSubmittingPayslip, setIsSubmittingPayslip] = useState(false);

  // Modal States
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [isKpiModalOpen, setIsKpiModalOpen] = useState(false);
  const [isHandoverModalOpen, setIsHandoverModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);

  // Form Inputs - Jobs
  const [jobTitle, setJobTitle] = useState("");
  const [jobDept, setJobDept] = useState("Production");
  const [jobLoc, setJobLoc] = useState("Central Factory");
  const [jobType, setJobType] = useState("Full-time");
  const [jobDesc, setJobDesc] = useState("");
  const [jobReqs, setJobReqs] = useState(""); // Textarea split with lines
  const [jobBens, setJobBens] = useState(""); // Textarea split with lines
  const [jobSalary, setJobSalary] = useState("");
  const [jobBg, setJobBg] = useState("#fafaf9");
  const [jobAccent, setJobAccent] = useState("#006097");

  // Form Inputs - Appraisals (KPI)
  const [kpiEmployee, setKpiEmployee] = useState("");
  const [kpiPeriod, setKpiPeriod] = useState("Q2 2026");
  const [scComm, setScComm] = useState(80);
  const [scProd, setScProd] = useState(80);
  const [scRel, setScRel] = useState(80);
  const [scLead, setScLead] = useState(80);
  const [scTech, setScTech] = useState(80);
  const [kpiNotes, setKpiNotes] = useState("");

  // Form Inputs - Handover
  const [hoResigning, setHoResigning] = useState("");
  const [hoSuccessor, setHoSuccessor] = useState("");
  const [hoDate, setHoDate] = useState("");
  const [hoNotes, setHoNotes] = useState("");
  const [hoItemsText, setHoItemsText] = useState(
    "SOP Operasional Peralatan\nDokumen Serah Terima Kredensial\nInventarisasi Fisik Bahan",
  );

  // CMS Settings
  const [cmsHeroTitle, setCmsHeroTitle] = useState("");
  const [cmsHeroSubtitle, setCmsHeroSubtitle] = useState("");
  const [cmsBenefits, setCmsBenefits] = useState("");
  const [isSavingCms, setIsSavingCms] = useState(false);
  const [isSweeping, setIsSweeping] = useState(false);

  // Candidate review
  const [reviewStatus, setReviewStatus] =
    useState<Application["status"]>("APPLIED");
  const [reviewNotes, setReviewNotes] = useState("");

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterJobId, setFilterJobId] = useState<string>("ALL");
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>("ALL");

  // Canvas Ref for pamphlet rendering
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fetch all database records
  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const [
        resJobs,
        resApps,
        resKpis,
        resHandovers,
        resUsers,
        resCms,
        resAttendances,
        resLeaves,
        resPayslips,
        resPrqs,
      ] = await Promise.all([
        apiFetch("/api/hr/jobs", {}, user?.username),
        apiFetch("/api/hr/applications", {}, user?.username),
        apiFetch("/api/hr/kpis", {}, user?.username),
        apiFetch("/api/hr/handovers", {}, user?.username),
        apiFetch("/api/users/directory", {}, user?.username),
        apiFetch("/api/cms/careers", {}, user?.username),
        apiFetch("/api/hr/attendances", {}, user?.username),
        apiFetch("/api/hr/leaves", {}, user?.username),
        apiFetch("/api/hr/payslips", {}, user?.username),
        apiFetch("/api/hr/payroll-requisitions", {}, user?.username),
      ]);

      if (resJobs.ok) setJobs(Array.isArray(resJobs.data) ? resJobs.data : []);
      if (resApps.ok) setApplications(Array.isArray(resApps.data) ? resApps.data : []);
      if (resKpis.ok) setKpis(Array.isArray(resKpis.data) ? resKpis.data : []);
      if (resHandovers.ok) setHandovers(Array.isArray(resHandovers.data) ? resHandovers.data : []);
      if (resUsers.ok) setUsers(Array.isArray(resUsers.data) ? resUsers.data : []);
      if (resAttendances.ok) setAttendances(Array.isArray(resAttendances.data) ? resAttendances.data : []);
      if (resLeaves.ok) setLeaves(Array.isArray(resLeaves.data) ? resLeaves.data : []);
      if (resPayslips.ok) setPayslips(Array.isArray(resPayslips.data) ? resPayslips.data : []);
      if (resPrqs.ok) setPayrollReqs(Array.isArray(resPrqs.data) ? resPrqs.data : []);
      if (resCms.ok && resCms.data) {
        setCmsHeroTitle(resCms.data.hero_title || "");
        setCmsHeroSubtitle(resCms.data.hero_subtitle || "");
        setCmsBenefits(
          Array.isArray(resCms.data.benefits)
            ? resCms.data.benefits.join("\n")
            : resCms.data.benefits || "",
        );
      }
    } catch (err) {
      console.error(err);
      showToast("Error loading Human Resource records", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const saveCms = async () => {
    try {
      setIsSavingCms(true);
      const res = await apiFetch(
        "/api/cms/careers",
        {
          method: "PUT",
          body: JSON.stringify({
            hero_title: cmsHeroTitle,
            hero_subtitle: cmsHeroSubtitle,
            benefits: cmsBenefits
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean),
          }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("CMS updated successfully", "success");
      } else {
        showToast("Failed to update CMS", "error");
      }
    } catch (err) {
      showToast("Failed to update CMS", "error");
    } finally {
      setIsSavingCms(false);
    }
  };

  const handleSweepData = async () => {
    setConfirmModal({
      isOpen: true,
      title: "Sweep Legacy PI Data",
      message: "This action will permanently delete all applicant Personal Intelligence (PI) rejected over 6 months ago to comply with Privacy regulations. Proceed?",
      isDestructive: true,
      action: async () => {
        try {
          setIsSweeping(true);
          const res = await apiFetch(
            "/api/hr/sweep-data",
            { method: "POST" },
            user?.username,
          );
          if (res.ok) {
            showToast(
              `Privacy protected: Successfully redacted ${res.data?.redacted_count || 0} legacy files.`,
              "success",
            );
            fetchAllData();
          } else {
            showToast("Failed to perform redaction.", "error");
          }
        } catch (err) {
          showToast("Failed to perform redaction.", "error");
        } finally {
          setIsSweeping(false);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Initial Form resets
  const resetJobForm = (job: Job | null = null) => {
    if (job) {
      setSelectedJob(job);
      setJobTitle(job.title);
      setJobDept(job.department);
      setJobLoc(job.location);
      setJobType(job.type);
      setJobDesc(job.description);
      try {
        setJobReqs(JSON.parse(job.requirements).join("\n"));
        setJobBens(JSON.parse(job.benefits).join("\n"));
      } catch (e) {
        setJobReqs(job.requirements);
        setJobBens(job.benefits);
      }
      setJobSalary(job.salary_string);
      setJobBg(job.pamphlet_bg_color || "#fafaf9");
      setJobAccent(job.pamphlet_accent_color || "#006097");
    } else {
      setSelectedJob(null);
      setJobTitle("");
      setJobDept("Production");
      setJobLoc("Central Factory");
      setJobType("Full-time");
      setJobDesc("");
      setJobReqs(
        "Minimum Bachelor Degree in Engineering or equivalent\nMinimum 1 year of relevant experience\nProficient in computer operations & systems",
      );
      setJobBens(
        "Competitive Basic Salary\nTransport Allowance & Insurance (BPJS)\nPerformance Bonus",
      );
      setJobSalary("Rp 6,000,000 - Rp 8,500,000");
      setJobBg("#fafaf9");
      setJobAccent("#006097");
    }
  };

  // Update Leave request status (Approve / Reject) with Manager Notes
  const handleLeaveStatusUpdate = async (
    id: string,
    newStatus: "APPROVED" | "REJECTED",
    customNote?: string,
  ) => {
    if (processingLeaveId) return;
    setProcessingLeaveId(id);
    try {
      const noteToSubmit =
        customNote !== undefined ? customNote : hrManagerNotes[id] || "";
      const res = await apiFetch(
        `/api/hr/leaves/${id}/status`,
        {
          method: "PUT",
          body: JSON.stringify({
            status: newStatus,
            manager_note: noteToSubmit,
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast(
          `Staff leave request ${newStatus === "APPROVED" ? "approved" : "rejected"} successfully`,
          "success",
        );
        fetchAllData();
      } else {
        showToast(
          res.error || "Failed to update leave request status",
          "error",
        );
      }
    } catch (e) {
      console.error(e);
      showToast("Error updating leave connection", "error");
    } finally {
      setProcessingLeaveId(null);
    }
  };

  // Create single payslip (Build Cycle Run item)
  const handleCreatePayslip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payslipEmployee) {
      showToast("Please select an employee", "error");
      return;
    }

    setIsSubmittingPayslip(true);
    try {
      const res = await apiFetch(
        "/api/hr/payslips",
        {
          method: "POST",
          body: JSON.stringify({
            employee_username: payslipEmployee,
            period_month: payslipMonth,
            basic_salary: Number(payslipBasic),
            allowances: Number(payslipAllowances),
            deductions: Number(payslipDeductions),
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast(
          "Official employee payslip generated successfully",
          "success",
        );
        setIsPayslipModalOpen(false);
        fetchAllData();
      } else {
        showToast(res.error || "Failed to generate payslip", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error communicating with payroll server", "error");
    } finally {
      setIsSubmittingPayslip(false);
    }
  };

  // ==========================================
  // PAYROLL REQUISITION (PRq) HANDLERS
  // ==========================================

  const handlePreparePrqMatrix = async (m: number, y: number) => {
    setIsPreparingPrq(true);
    try {
      const res = await apiFetch(
        "/api/hr/payroll-requisitions/prepare",
        {
          method: "POST",
          body: JSON.stringify({ month: m, year: y }),
        },
        user?.username,
      );
      if (res.ok && res.data) {
        setPrqDetails(res.data.details || []);
      } else {
        showToast(res.error || "Failed to load payroll details", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Error loading payroll details", "error");
    } finally {
      setIsPreparingPrq(false);
    }
  };

  const handleOpenCreatePrq = () => {
    const curDay = new Date().getDate();
    const isTutupBukuWindow = curDay >= 15 && curDay <= 24;
    if (!isTutupBukuWindow) {
      showToast("Payroll creation is only accessible during the monthly closing window (15th – 24th).", "error");
      return;
    }
    const curMonth = new Date().getMonth() + 1;
    const curYear = new Date().getFullYear();
    setPrqEditingId(null);
    setPrqMonth(curMonth);
    setPrqYear(curYear);
    setPrqNotes("");
    setIsPrqModalOpen(true);
    handlePreparePrqMatrix(curMonth, curYear);
  };

  const handleOpenEditPrq = async (prq: any) => {
    try {
      const res = await apiFetch(`/api/hr/payroll-requisitions/${prq.id}`, {}, user?.username);
      if (res.ok && res.data) {
        setPrqEditingId(prq.id);
        setPrqMonth(res.data.period_month);
        setPrqYear(res.data.period_year);
        setPrqNotes(res.data.notes || "");
        setPrqDetails(res.data.details || []);
        setIsPrqModalOpen(true);
      }
    } catch (e) {
      showToast("Failed to load requisition data", "error");
    }
  };

  const handleOpenViewPrq = async (prq: any) => {
    try {
      const res = await apiFetch(`/api/hr/payroll-requisitions/${prq.id}`, {}, user?.username);
      if (res.ok && res.data) {
        setSelectedPrqView(res.data);
        setIsPrqViewModalOpen(true);
      }
    } catch (e) {
      showToast("Failed to load requisition details", "error");
    }
  };

  const handleUpdatePrqItem = (index: number, field: string, value: number) => {
    setPrqDetails((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      const basic = Number(item.basic_salary || 0);
      const posAllow = Number(item.position_allowance || 0);
      const kpiBonus = Number(item.kpi_bonus || 0);
      const otPay = Number(item.overtime_pay || (Number(item.overtime_hours || 0) * 50000));
      const travelAllow = Number(item.travel_allowance || (Number(item.travel_days || 0) * 250000));
      const reimburse = Number(item.reimbursement_amount || 0);

      item.gross_pay = basic + posAllow + kpiBonus + otPay + travelAllow + reimburse;

      const absDed = Number(item.absence_deduction || 0);
      const bpjsDed = Number(item.bpjs_deduction || Math.round(basic * 0.03));
      const pph21Ded = Number(item.pph21_deduction || Math.round(basic * 0.02));
      const otherDed = Number(item.other_deductions || 0);

      item.total_deductions = absDed + bpjsDed + pph21Ded + otherDed;
      item.net_pay = Math.max(0, item.gross_pay - item.total_deductions);

      updated[index] = item;
      return updated;
    });
  };

  const handleSavePayrollRequisition = async (submit: boolean) => {
    setIsSavingPrq(true);
    try {
      const url = prqEditingId
        ? `/api/hr/payroll-requisitions/${prqEditingId}`
        : "/api/hr/payroll-requisitions";
      const method = prqEditingId ? "PUT" : "POST";

      const res = await apiFetch(
        url,
        {
          method,
          body: JSON.stringify({
            period_month: prqMonth,
            period_year: prqYear,
            notes: prqNotes,
            details: prqDetails,
            submit,
            allow_overwrite: true,
            pin: prqConfirmModal.authPin || getDailyAuthKey(user?.username),
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast(
          submit
            ? "Payroll Requisition (PRq) successfully submitted to Finance!"
            : "Payroll Requisition draft successfully saved.",
          "success",
        );
        setIsPrqModalOpen(false);
        setPrqConfirmModal({ ...prqConfirmModal, isOpen: false });
        fetchAllData();
      } else {
        showToast(res.error || "Failed to save payroll requisition", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Error saving payroll requisition", "error");
    } finally {
      setIsSavingPrq(false);
    }
  };

  // Open confirm modal for submitting PRq
  const handleRequestSubmitPrq = () => {
    if (prqDetails.length === 0) {
      showToast("Employee payroll details cannot be empty.", "error");
      return;
    }
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const periodName = `${monthNames[prqMonth - 1]} ${prqYear}`;
    const totalNet = prqDetails.reduce((acc, item) => acc + Number(item.net_pay || 0), 0);

    setPrqConfirmModal({
      isOpen: true,
      title: `Confirm Submission for PRq Period ${periodName}`,
      message: `You are about to submit a PRq Payroll document for ${prqDetails.length} employees with total disbursement request of ${formatRupiah(totalNet)}. Once submitted, this document will be reviewed by Finance Division (FC).`,
      type: "SUBMIT_PRQ",
      authPin: getDailyAuthKey(user?.username),
    });
  };

  // Open confirm modal for cancelling PRq
  const handleOpenCancelPrqModal = (prq: any) => {
    setPrqConfirmModal({
      isOpen: true,
      title: `Cancel PRq Requisition (${prq.requisition_no || prq.requisition_number})`,
      message: `Cancelled PRq requisitions cannot be processed by Finance. Please enter the reason for cancellation and ERP Authorization PIN:`,
      type: "CANCEL_PRQ",
      data: prq,
      reasonInput: "",
      authPin: getDailyAuthKey(user?.username),
    });
  };

  // Execute cancel PRq API
  const handleExecuteCancelPrq = async (prqId: string, reason: string) => {
    if (isProcessingPrqAction) return;
    setIsProcessingPrqAction(true);
    try {
      const res = await apiFetch(
        `/api/hr/payroll-requisitions/${prqId}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({
            cancel_reason: reason || "Cancelled by HR",
            pin: prqConfirmModal.authPin || getDailyAuthKey(user?.username),
          }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("PRq requisition successfully cancelled.", "success");
        setPrqConfirmModal((prev) => ({ ...prev, isOpen: false }));
        setIsPrqViewModalOpen(false);
        fetchAllData();
      } else {
        showToast(res.error || "Failed to cancel PRq requisition", "error");
      }
    } catch (e) {
      showToast("Error cancelling PRq requisition", "error");
    } finally {
      setIsProcessingPrqAction(false);
    }
  };

  // Open confirm modal for deleting draft PRq
  const handleOpenDeletePrqModal = (prq: any) => {
    setPrqConfirmModal({
      isOpen: true,
      title: `Delete PRq Draft (${prq.requisition_no || prq.requisition_number})`,
      message: `Are you sure you want to permanently delete this PRq draft? Draft data cannot be restored.`,
      type: "DELETE_PRQ",
      data: prq,
    });
  };

  // Execute delete PRq API
  const handleExecuteDeletePrq = async (prqId: string) => {
    if (isProcessingPrqAction) return;
    setIsProcessingPrqAction(true);
    try {
      const res = await apiFetch(
        `/api/hr/payroll-requisitions/${prqId}`,
        { method: "DELETE" },
        user?.username,
      );
      if (res.ok) {
        showToast("PRq draft successfully deleted.", "success");
        setPrqConfirmModal((prev) => ({ ...prev, isOpen: false }));
        setIsPrqViewModalOpen(false);
        fetchAllData();
      } else {
        showToast(res.error || "Failed to delete PRq draft", "error");
      }
    } catch (e) {
      showToast("Error deleting PRq draft", "error");
    } finally {
      setIsProcessingPrqAction(false);
    }
  };

  // Create or Update Job Vacancy
  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle || !jobDesc) {
      showToast("Please fill out the essential fields", "error");
      return;
    }

    const reqArray = jobReqs
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const benArray = jobBens
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const payload = {
      title: jobTitle,
      department: jobDept,
      location: jobLoc,
      type: jobType,
      status: selectedJob ? selectedJob.status : "OPEN",
      description: jobDesc,
      requirements: JSON.stringify(reqArray),
      benefits: JSON.stringify(benArray),
      salary_string: jobSalary,
      pamphlet_bg_color: jobBg,
      pamphlet_accent_color: jobAccent,
    };

    try {
      const url = selectedJob
        ? `/api/hr/jobs/${selectedJob.id}`
        : "/api/hr/jobs";
      const method = selectedJob ? "PUT" : "POST";
      const res = await apiFetch(
        url,
        {
          method,
          body: JSON.stringify(payload),
        },
        user?.username,
      );

      if (res.ok) {
        showToast(
          selectedJob ? "Job position updated" : "New job position posted",
          "success",
        );
        setIsJobModalOpen(false);
        fetchAllData();
      } else {
        showToast(res.error || "Failed to save job post", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to connect to server", "error");
    }
  };

  // Toggle Job Open/Closed Status
  const handleToggleJobStatus = async (job: Job) => {
    const nextStatus = job.status === "OPEN" ? "CLOSED" : "OPEN";

    // Optimistic UI Update
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, status: nextStatus } : j)),
    );
    showToast(
      `Job recruitment ${nextStatus === "OPEN" ? "Opened" : "Archived"}`,
      "success",
    );

    try {
      const res = await apiFetch(
        `/api/hr/jobs/${job.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            ...job,
            status: nextStatus,
          }),
        },
        user?.username,
      );

      if (res.ok) {
        fetchAllData();
      } else {
        showToast(res.error || "Failed to toggle status", "error");
        fetchAllData();
      }
    } catch (err) {
      console.error(err);
      fetchAllData();
    }
  };

  // Delete Job Vacancy
  const handleDeleteJob = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Job Vacancy",
      message:
        "Are you sure you want to delete this job vacancy? All associated applicant candidates will be permanently removed.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/hr/jobs/${id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) {
            showToast("Job vacancy permanently deleted.", "success");
            fetchAllData();
          } else {
            showToast(res.error || "Failed to delete vacancy", "error");
          }
        } catch (err) {
          console.error(err);
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Save Candidate review update
  const handleSaveAppReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    // Optimistic UI Update
    setApplications((prev) =>
      prev.map((a) =>
        a.id === selectedApp.id
          ? { ...a, status: reviewStatus, notes: reviewNotes }
          : a,
      ),
    );
    showToast("Candidate evaluation profile updated", "success");

    try {
      const res = await apiFetch(
        `/api/hr/applications/${selectedApp.id}/status`,
        {
          method: "PUT",
          body: JSON.stringify({
            status: reviewStatus,
            notes: reviewNotes,
          }),
        },
        user?.username,
      );

      if (res.ok) {
        if (adminTab !== "CANDIDATES") {
          setSelectedApp(null);
        }
        fetchAllData();
      } else {
        showToast(res.error || "Failed to update candidate state", "error");
        fetchAllData();
      }
    } catch (e) {
      console.error(e);
      fetchAllData();
    }
  };

  // Quick state movement handler for recruitment workflow cards
  const handleQuickStatusChange = async (
    app: Application,
    nextStatus: Application["status"],
  ) => {
    // Optimistic UI Update to remove perceived latency
    setApplications((prev) =>
      prev.map((a) => (a.id === app.id ? { ...a, status: nextStatus } : a)),
    );
    showToast(
      `Moved candidate ${app.name} to ${nextStatus.replace("_", " ")}`,
      "success",
    );

    try {
      const res = await apiFetch(
        `/api/hr/applications/${app.id}/status`,
        {
          method: "PUT",
          body: JSON.stringify({
            status: nextStatus,
            notes: app.notes || "",
          }),
        },
        user?.username,
      );

      if (res.ok) {
        fetchAllData();
      } else {
        showToast(res.error || "Failed to transition candidate state", "error");
        fetchAllData();
      }
    } catch (e) {
      console.error(e);
      showToast("Internal communication error transitioning state", "error");
      fetchAllData();
    }
  };

  // Submit KPI Performance Appraisal Assessment
  const handleSubmitKpi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kpiEmployee || !kpiPeriod) {
      showToast("Please specify the Employee and Appraisal period", "error");
      return;
    }

    try {
      const res = await apiFetch(
        "/api/hr/kpis",
        {
          method: "POST",
          body: JSON.stringify({
            employee_username: kpiEmployee,
            period_name: kpiPeriod,
            score_communication: scComm,
            score_productivity: scProd,
            score_reliability: scRel,
            score_leadership: scLead,
            score_technical: scTech,
            evaluation_notes: kpiNotes,
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast(
          `KPI assessment successfully logged. Score: ${res.data.overall_score}`,
          "success",
        );
        setIsKpiModalOpen(false);
        // Reset fields
        setKpiEmployee("");
        setKpiNotes("");
        setScComm(80);
        setScProd(80);
        setScRel(80);
        setScLead(80);
        setScTech(80);
        fetchAllData();
      } else {
        showToast(res.error || "Failed to log KPI scorecard", "error");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Submit exit transition Handover sheet
  const handleSubmitHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hoResigning || !hoSuccessor || !hoDate) {
      showToast(
        "Identify leaving staff member, their successor, and the transit last date",
        "error",
      );
      return;
    }

    const items = hoItemsText
      .split("\n")
      .map((item, idx) => ({
        id: `task-${idx + 1}-${Date.now()}`,
        title: item.trim(),
        status: "PENDING",
      }))
      .filter((t) => t.title.length > 0);

    try {
      const res = await apiFetch(
        "/api/hr/handovers",
        {
          method: "POST",
          body: JSON.stringify({
            resigning_username: hoResigning,
            successor_username: hoSuccessor,
            target_last_date: hoDate,
            handover_notes: hoNotes,
            checklist_json: JSON.stringify(items),
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast(
          "Exit transit transition initialized successfully",
          "success",
        );
        setIsHandoverModalOpen(false);
        setHoResigning("");
        setHoSuccessor("");
        setHoNotes("");
        setHoDate("");
        fetchAllData();
      } else {
        showToast(
          res.error || "Failed to create handover transit tracker",
          "error",
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Un/check handover items
  const handleToggleHandoverItem = async (
    handover: Handover,
    clickedItemId: string,
  ) => {
    let checklist: HandoverItem[] = [];
    try {
      checklist = JSON.parse(handover.checklist_json);
    } catch (e) {
      console.error(e);
    }

    const updatedChecklist = checklist.map((item) => {
      if (item.id === clickedItemId) {
        return {
          ...item,
          status:
            item.status === "COMPLETED" ? "PENDING" : ("COMPLETED" as const),
        };
      }
      return item;
    });

    const totalCount = updatedChecklist.length;
    const completedCount = updatedChecklist.filter(
      (item) => item.status === "COMPLETED",
    ).length;

    // Auto-update overarching transit phase status
    let nextHandoverStatus = handover.status;
    if (completedCount === totalCount && totalCount > 0) {
      nextHandoverStatus = "COMPLETED";
    } else if (completedCount > 0) {
      nextHandoverStatus = "IN_PROGRESS";
    } else {
      nextHandoverStatus = "PENDING";
    }

    // Optimistic UI Update
    setHandovers((prev) =>
      prev.map((h) =>
        h.id === handover.id
          ? {
              ...h,
              status: nextHandoverStatus,
              checklist_json: JSON.stringify(updatedChecklist),
            }
          : h,
      ),
    );

    try {
      const res = await apiFetch(
        `/api/hr/handovers/${handover.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            status: nextHandoverStatus,
            handover_notes: handover.handover_notes,
            checklist_json: JSON.stringify(updatedChecklist),
          }),
        },
        user?.username,
      );

      if (res.ok) {
        fetchAllData();
      } else {
        showToast("Error saving item change", "error");
        fetchAllData();
      }
    } catch (err) {
      console.error(err);
      fetchAllData();
    }
  };

  // Convert Job details to professional brochure / pamphlet and export PNG
  // Filter systems
  const filteredJobs = React.useMemo(
    () =>
      (Array.isArray(jobs) ? jobs : []).filter(
        (j) =>
          j.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          j.department?.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [jobs, searchQuery],
  );

  const filteredApps = React.useMemo(
    () =>
      (Array.isArray(applications) ? applications : []).filter((a) => {
        const matchesSearch =
          a.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.job_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.experience?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesJob = filterJobId === "ALL" || a.job_id === filterJobId;
        return matchesSearch && matchesJob;
      }),
    [applications, searchQuery, filterJobId],
  );

  const filteredKpis = React.useMemo(
    () =>
      (Array.isArray(kpis) ? kpis : []).filter(
        (k) =>
          k.employee_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          k.employee_username
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          k.period_name?.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [kpis, searchQuery],
  );

  const filteredHandovers = React.useMemo(
    () =>
      (Array.isArray(handovers) ? handovers : []).filter(
        (h) =>
          h.resigning_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          h.successor_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          h.status?.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [handovers, searchQuery],
  );

  const filteredUsers = React.useMemo(
    () =>
      (Array.isArray(users) ? users : []).filter(
        (usr) =>
          usr.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          usr.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          usr.role?.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [users, searchQuery],
  );

  const avgKpi = React.useMemo(
    () =>
      Array.isArray(kpis) && kpis.length > 0
        ? (
            kpis.reduce((acc, current) => acc + (Number(current.overall_score) || 0), 0) /
            kpis.length
          ).toFixed(1)
        : "87.5",
    [kpis],
  );

  const activeTransitions = React.useMemo(
    () => (Array.isArray(handovers) ? handovers : []).filter((h) => h.status !== "COMPLETED").length,
    [handovers],
  );

  return (
    <div className="min-h-screen bg-transparent pb-16">
      {/* Invisible Canvas for pamphlet Generation */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="w-full flex flex-col gap-8 pb-32">
        {/* Playful & Abstract Page Header (Asymmetrical blob design) */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* Main Hero Banner */}
          <div className="flex-1 bg-white rounded-3xl p-8 md:p-10 relative overflow-hidden border border-stone-200/80 shadow-2xs flex flex-col justify-end min-h-[280px]">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-stone-100 border border-stone-200 text-stone-700 mb-4 w-fit">
                <span className="text-xs font-bold uppercase tracking-wider">
                  People & Culture
                </span>
              </div>

              <h1 className="text-4xl md:text-5xl font-black text-stone-900 tracking-tight mb-3 leading-none">
                HRIS by Paving Joss
              </h1>
              <p className="text-stone-600 font-medium max-w-lg text-sm md:text-base leading-relaxed">
                Directory, recruitment, KPI milestones, and employee culture hub.
              </p>
            </div>
          </div>

          {/* Action Required Widget */}
          <div className="md:w-[320px] shrink-0 bg-white/80 backdrop-blur-3xl rounded-[3rem] md:rounded-tr-[5rem] p-8 border border-white shadow-xl shadow-stone-200/50 flex flex-col gap-4 relative overflow-hidden h-[320px]">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-100 rounded-full blur-3xl opacity-50" />

            <div className="flex items-center gap-3 z-10 mt-2">
              <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-black text-stone-900 tracking-tight leading-tight">
                Action Required
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar z-10 mt-1 pb-2">
              {applications.filter((a) => a.status === "APPLIED").length > 0 ? (
                <div
                  onClick={() => handleTabChange("CANDIDATES")}
                  className="bg-stone-50 p-4 rounded-[1.5rem] border border-stone-100 cursor-pointer hover:bg-stone-100 transition-colors flex justify-between items-center group"
                >
                  <div>
                    <p className="font-bold text-stone-900 text-sm">
                      New Candidates
                    </p>
                    <p className="text-[10px] font-medium text-stone-500 mt-0.5">
                      Initial screening
                    </p>
                  </div>
                  <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-black flex items-center justify-center text-xs shadow-sm group-hover:scale-110 transition-transform">
                    {applications.filter((a) => a.status === "APPLIED").length}
                  </span>
                </div>
              ) : null}

              {applications.filter((a) => a.status === "INTERVIEW").length >
              0 ? (
                <div
                  onClick={() => handleTabChange("CANDIDATES")}
                  className="bg-stone-50 p-4 rounded-[1.5rem] border border-stone-100 cursor-pointer hover:bg-stone-100 transition-colors flex justify-between items-center group"
                >
                  <div>
                    <p className="font-bold text-stone-900 text-sm">
                      Interviews
                    </p>
                    <p className="text-[10px] font-medium text-stone-500 mt-0.5">
                      Pending decisions
                    </p>
                  </div>
                  <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-black flex items-center justify-center text-xs shadow-sm group-hover:scale-110 transition-transform">
                    {
                      applications.filter((a) => a.status === "INTERVIEW")
                        .length
                    }
                  </span>
                </div>
              ) : null}

              {jobs.filter((j) => j.status === "CLOSED").length > 0 ? (
                <div
                  onClick={() => handleTabChange("VACANCIES")}
                  className="bg-stone-50 p-4 rounded-[1.5rem] border border-stone-100 cursor-pointer hover:bg-stone-100 transition-colors flex justify-between items-center group"
                >
                  <div>
                    <p className="font-bold text-stone-900 text-sm">
                      Draft Vacancies
                    </p>
                    <p className="text-[10px] font-medium text-stone-500 mt-0.5">
                      Pending publication
                    </p>
                  </div>
                  <span className="w-8 h-8 rounded-full bg-stone-200 text-stone-600 font-black flex items-center justify-center text-xs shadow-sm group-hover:scale-110 transition-transform">
                    {jobs.filter((j) => j.status === "CLOSED").length}
                  </span>
                </div>
              ) : null}

              {applications.filter(
                (a) => a.status === "APPLIED" || a.status === "INTERVIEW",
              ).length === 0 &&
                jobs.filter((j) => j.status === "CLOSED").length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center px-2 py-6">
                    <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
                      <CheckSquare className="w-6 h-6 text-emerald-500" />
                    </div>
                    <p className="text-stone-900 font-bold text-sm">
                      All caught up!
                    </p>
                    <p className="text-stone-500 text-xs mt-1">
                      No pending actions required.
                    </p>
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* INTERACTIVE ADMIN CONTROL PANEL */}
        <div>
          {/* SEARCH & FILTER BAR */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={`Search ${adminTab.toLowerCase()} records...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-2xs transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center bg-white border border-slate-200/80 rounded-2xl">
              <Loader2 className="h-8 w-8 animate-spin mb-3 text-indigo-500" />
              <p className="font-medium text-xs text-slate-600">
                Loading HRIS records...
              </p>
            </div>
          ) : (
            <div className="min-h-[500px]">
              {/* DASHBOARD TAB */}
              {adminTab === "DASHBOARD" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-stone-100 flex flex-col justify-between hover:shadow-xl hover:-translate-y-2 transition-all">
                      <div className="flex justify-between items-start">
                        <Users className="w-8 h-8 text-brand" />
                        <span className="px-3 py-1 bg-stone-100 text-stone-600 rounded-full text-xs font-black uppercase tracking-widest">
                          Active
                        </span>
                      </div>
                      <div className="mt-4">
                        <h4 className="text-slate-500 font-medium text-xs mb-0.5">
                          Total Headcount
                        </h4>
                        <p className="text-3xl font-bold text-slate-900 tracking-tight">
                          {users.length}
                        </p>
                      </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-all">
                      <div className="flex justify-between items-start">
                        <Clock className="w-6 h-6 text-emerald-600" />
                        <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-semibold uppercase tracking-wider">
                          Attendance
                        </span>
                      </div>
                      <div className="mt-4">
                        <h4 className="text-slate-500 font-medium text-xs mb-0.5">
                          On Time Today
                        </h4>
                        <p className="text-3xl font-bold text-slate-900 tracking-tight">
                          {users.length > 0 ? 96 : 0}
                          <span className="text-lg text-slate-400 font-normal">%</span>
                        </p>
                      </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-all">
                      <div className="flex justify-between items-start">
                        <CalendarDays className="w-6 h-6 text-amber-500" />
                        <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-semibold uppercase tracking-wider">
                          Time Off
                        </span>
                      </div>
                      <div className="mt-4">
                        <h4 className="text-slate-500 font-medium text-xs mb-0.5">
                          Currently on Leave
                        </h4>
                        <p className="text-3xl font-bold text-slate-900 tracking-tight">
                          {users.length > 0
                            ? Math.max(1, Math.floor(users.length * 0.05))
                            : 0}
                        </p>
                      </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-all">
                      <div className="flex justify-between items-start">
                        <Briefcase className="w-6 h-6 text-indigo-600" />
                        <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-semibold uppercase tracking-wider">
                          Vacancies
                        </span>
                      </div>
                      <div className="mt-4">
                        <h4 className="text-slate-500 font-medium text-xs mb-0.5">
                          Open Positions
                        </h4>
                        <p className="text-3xl font-bold text-slate-900 tracking-tight">
                          {jobs.filter((j) => j.status === "OPEN").length}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Charts Row */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs h-[380px] flex flex-col">
                      <div className="mb-4">
                        <h3 className="font-bold text-base text-slate-900">
                          Recruitment Pipeline
                        </h3>
                        <p className="text-xs font-normal text-slate-500">
                          Applicant conversion funnel across all open positions.
                        </p>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            {
                              name: "Applied",
                              count: applications.filter(
                                (a) => a.status === "APPLIED",
                              ).length,
                            },
                            {
                              name: "Screening",
                              count: applications.filter(
                                (a) => a.status === "SCREENING",
                              ).length,
                            },
                            {
                              name: "Interview",
                              count: applications.filter(
                                (a) => a.status === "INTERVIEW",
                              ).length,
                            },
                            {
                              name: "Offered",
                              count: applications.filter(
                                (a) => a.status === "OFFER_MADE",
                              ).length,
                            },
                            {
                              name: "Hired",
                              count: applications.filter(
                                (a) => a.status === "ACCEPTED",
                              ).length,
                            },
                          ]}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="#F1F5F9"
                          />
                          <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{
                              fill: "#64748B",
                              fontSize: 11,
                              fontWeight: 500,
                            }}
                            dy={10}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{
                              fill: "#64748B",
                              fontSize: 11,
                              fontWeight: 500,
                            }}
                            dx={-10}
                            allowDecimals={false}
                          />
                          <RechartsTooltip
                            cursor={{ fill: "#F8FAFC" }}
                            contentStyle={{
                              borderRadius: "12px",
                              border: "1px solid #E2E8F0",
                              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
                              fontWeight: 500,
                              fontSize: "12px",
                            }}
                          />
                          <Bar
                            dataKey="count"
                            fill="#4F46E5"
                            radius={[6, 6, 0, 0]}
                            barSize={36}
                          >
                            {[
                              { name: "Applied" },
                              { name: "Screening" },
                              { name: "Interview" },
                              { name: "Offered" },
                              { name: "Hired" },
                            ].map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={
                                  [
                                    "#6366F1",
                                    "#F59E0B",
                                    "#3B82F6",
                                    "#10B981",
                                    "#EC4899",
                                  ][index % 5]
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs h-[380px] flex flex-col">
                      <div className="mb-4">
                        <h3 className="font-bold text-base text-slate-900">
                          Headcount by Department
                        </h3>
                        <p className="text-xs font-normal text-slate-500">
                          Distribution of active staff across operational divisions.
                        </p>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              {
                                name: "Finance (FC)",
                                value: users.filter((u) => u.role === "FC")
                                  .length,
                              },
                              {
                                name: "Commercial (Sales)",
                                value: users.filter((u) => u.role === "SALES")
                                  .length,
                              },
                              {
                                name: "Production",
                                value: users.filter(
                                  (u) => u.role === "PRODUCTION",
                                ).length,
                              },
                              {
                                name: "Engineering",
                                value: users.filter(
                                  (u) => u.role === "ENGINEERING",
                                ).length,
                              },
                              {
                                name: "Warehouse",
                                value: users.filter(
                                  (u) => u.role === "WAREHOUSE",
                                ).length,
                              },
                            ].filter((d) => d.value > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={105}
                            paddingAngle={4}
                            dataKey="value"
                            stroke="none"
                          >
                            {[
                              { name: "FC" },
                              { name: "Sales" },
                              { name: "Prod" },
                              { name: "Eng" },
                              { name: "Warehouse" },
                            ].map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={
                                  [
                                    "#10B981",
                                    "#3B82F6",
                                    "#6366F1",
                                    "#F59E0B",
                                    "#8B5CF6",
                                  ][index % 5]
                                }
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            contentStyle={{
                              borderRadius: "12px",
                              border: "1px solid #E2E8F0",
                              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
                              fontWeight: 500,
                              fontSize: "12px",
                            }}
                          />
                          <Legend
                            iconType="circle"
                            wrapperStyle={{
                              fontSize: "12px",
                              fontWeight: 500,
                              color: "#64748B",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs w-full mb-6">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                      <div>
                        <h3 className="font-bold text-base text-slate-900">
                          Enterprise KPI Trend
                        </h3>
                        <p className="text-xs font-normal text-slate-500">
                          Historical employee performance scores across evaluation periods.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                          Q1 - Q4 2026
                        </span>
                      </div>
                    </div>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={[
                            { month: "Jan", score: 72 },
                            { month: "Feb", score: 75 },
                            { month: "Mar", score: 81 },
                            { month: "Apr", score: 80 },
                            { month: "May", score: 86 },
                            {
                              month: "Jun",
                              score:
                                kpis.length > 0
                                  ? Math.round(
                                      kpis.reduce(
                                        (acc, kpi) =>
                                          acc +
                                          (kpi.score_communication +
                                            kpi.score_productivity +
                                            kpi.score_reliability +
                                            kpi.score_leadership +
                                            kpi.score_technical) /
                                            5,
                                        0,
                                      ) / kpis.length,
                                    )
                                  : 89,
                            },
                          ]}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="colorScore"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="5%"
                                stopColor="#4F46E5"
                                stopOpacity={0.2}
                              />
                              <stop
                                offset="95%"
                                stopColor="#4F46E5"
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="#F1F5F9"
                          />
                          <XAxis
                            dataKey="month"
                            axisLine={false}
                            tickLine={false}
                            tick={{
                              fill: "#64748B",
                              fontSize: 11,
                              fontWeight: 500,
                            }}
                            dy={10}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{
                              fill: "#64748B",
                              fontSize: 11,
                              fontWeight: 500,
                            }}
                            dx={-10}
                            domain={[0, 100]}
                          />
                          <RechartsTooltip
                            contentStyle={{
                              borderRadius: "12px",
                              border: "1px solid #E2E8F0",
                              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
                              fontWeight: 500,
                              fontSize: "12px",
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="score"
                            stroke="#4F46E5"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorScore)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: TEAM DIRECTORY */}
              {adminTab === "DIRECTORY" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  {/* Clean Executive Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900 leading-none">
                          {users.length}
                        </p>
                        <p className="text-xs font-medium text-slate-500 mt-1">
                          Active Employees
                        </p>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <Briefcase className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900 leading-none">
                          {jobs.length}
                        </p>
                        <p className="text-xs font-medium text-slate-500 mt-1">
                          Job Positions
                        </p>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                        <Award className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900 leading-none">
                          {avgKpi} <span className="text-xs text-slate-400 font-normal">/100</span>
                        </p>
                        <p className="text-xs font-medium text-slate-500 mt-1">
                          Avg KPI Performance
                        </p>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                        <Repeat className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900 leading-none">
                          {activeTransitions}
                        </p>
                        <p className="text-xs font-medium text-slate-500 mt-1">
                          Active Handovers
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Staff Directory Grid */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">
                          Team Members
                        </h3>
                        <p className="text-xs font-normal text-slate-500">
                          Active workforce directory and organizational structure.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredUsers.length === 0 ? (
                        <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200/80">
                          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-slate-700 font-semibold text-sm">
                            No team members found matching search query.
                          </p>
                        </div>
                      ) : (
                        filteredUsers.map((usr) => (
                          <div
                            key={usr.username}
                            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-slate-300 transition-all flex flex-col items-center text-center relative"
                          >
                            <div className="relative mb-3 mt-1">
                              <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-2xl font-bold shadow-2xs border border-indigo-100">
                                {usr.name
                                  ? usr.name.substring(0, 1).toUpperCase()
                                  : usr.username.substring(0, 1).toUpperCase()}
                              </div>
                              {usr.username === user?.username && (
                                <div className="absolute -bottom-1 -right-1 bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md border border-white">
                                  YOU
                                </div>
                              )}
                            </div>

                            <h4 className="text-sm font-bold text-slate-900 line-clamp-1">
                              {usr.name || "Team Member"}
                            </h4>
                            <p className="text-xs font-normal text-slate-400 mt-0.5 mb-4">
                              @{usr.username}
                            </p>

                            <div className="mt-auto pt-2 flex w-full justify-center">
                              <span
                                className={cn(
                                  "px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide inline-flex items-center gap-1.5",
                                  usr.role === "FC"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                    : usr.role === "GOD_MODE"
                                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200/60"
                                      : "bg-slate-100 text-slate-700 border border-slate-200/60",
                                )}
                              >
                                {usr.role === "FC" && "Finance"}
                                {usr.role === "GOD_MODE" && "Super Admin"}
                                {usr.role === "HR_OFFICER" && "HR Officer"}
                                {usr.role !== "FC" &&
                                  usr.role !== "GOD_MODE" &&
                                  usr.role !== "HR_OFFICER" &&
                                  usr.role}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* ATTENDANCE TAB */}
              {adminTab === "ATTENDANCE" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-500 mt-6">
                  <div className="bg-white/80 backdrop-blur-md rounded-[32px] p-8 border border-stone-200">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-black text-stone-900">
                        Attendance Timesheets
                      </h2>
                      <div className="text-xs bg-stone-100 px-4 py-2 rounded-xl text-stone-700 font-bold uppercase tracking-wider">
                        {attendances.length} Logs Saved
                      </div>
                    </div>

                    {attendances.length === 0 ? (
                      <div className="col-span-full py-20 text-center bg-stone-50 rounded-[2.5rem] border border-stone-200 border-dashed">
                        <div className="w-16 h-16 bg-stone-250 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-400">
                          <Clock className="w-8 h-8" />
                        </div>
                        <p className="text-stone-500 font-bold mb-1 font-sans">
                          No attendance records found
                        </p>
                        <p className="text-xs text-stone-450">
                          Staff members have not registered any attendance
                          clock-ins yet.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-[1.5rem] border border-stone-150">
                        <table className="w-full text-left font-bold text-xs border-collapse">
                          <thead>
                            <tr className="bg-stone-50 text-stone-500 uppercase tracking-widest border-b border-stone-150">
                              <th className="p-4 pl-6 text-[10px]">Date</th>
                              <th className="p-4 text-[10px]">Staff Name</th>
                              <th className="p-4 text-[10px]">Clock-In Time</th>
                              <th className="p-4 text-[10px]">
                                Clock-In Location
                              </th>
                              <th className="p-4 text-[10px]">
                                Clock-Out Time
                              </th>
                              <th className="p-4 text-[10px]">
                                Clock-Out Location
                              </th>
                              <th className="p-4 text-[10px] text-right pr-6">
                                Duration
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100 text-stone-705">
                            {attendances.map((att: any) => {
                              let durStr = "-";
                              if (att.clock_in && att.clock_out) {
                                try {
                                  const s = new Date(att.clock_in);
                                  const e = new Date(att.clock_out);
                                  const hrs =
                                    Math.abs(e.getTime() - s.getTime()) / 36e5;
                                  durStr = hrs.toFixed(1) + " Hrs";
                                } catch (e) {
                                  durStr = "Error";
                                }
                              } else if (att.clock_in) {
                                durStr = "In Progress";
                              }

                              return (
                                <tr
                                  key={
                                    att.id || att.date + att.employee_username
                                  }
                                  className="hover:bg-stone-50/50 transition-colors"
                                >
                                  <td className="p-4 pl-6 font-mono font-medium text-stone-500">
                                    {formatLocalDate(att.date)}
                                  </td>
                                  <td className="p-4">
                                    <div className="font-extrabold text-stone-900">
                                      {att.employee_name ||
                                        att.employee_username}
                                    </div>
                                    <div className="text-[10px] text-stone-400 font-bold">
                                      @{att.employee_username}
                                    </div>
                                  </td>
                                  <td className="p-4 font-mono font-medium text-emerald-600">
                                    {formatLocalTime(att.clock_in)}
                                  </td>
                                  <td className="p-4">
                                    {att.clock_in_location ? (
                                      <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${att.clock_in_location}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-1 text-blue-500 hover:underline"
                                      >
                                        <MapPin className="w-3 h-3" />
                                        <span className="text-[10px] font-mono">
                                          {att.clock_in_location}
                                        </span>
                                      </a>
                                    ) : (
                                      <span className="text-stone-300 text-[10px]">
                                        N/A
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-4 font-mono font-medium text-stone-500">
                                    {att.clock_out ? (
                                      formatLocalTime(att.clock_out)
                                    ) : (
                                      <span className="bg-amber-50 text-amber-600 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                        Active
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-4">
                                    {att.clock_out_location ? (
                                      <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${att.clock_out_location}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-1 text-blue-500 hover:underline"
                                      >
                                        <MapPin className="w-3 h-3" />
                                        <span className="text-[10px] font-mono">
                                          {att.clock_out_location}
                                        </span>
                                      </a>
                                    ) : (
                                      <span className="text-stone-300 text-[10px]">
                                        N/A
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-4 text-right pr-6 font-mono text-stone-800">
                                    {durStr}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* LEAVE TAB - MANAGER APPROVAL HUB */}
              {adminTab === "LEAVE" &&
                (() => {
                  const pendingCount = leaves.filter(
                    (l) => l.status === "PENDING",
                  ).length;
                  const approvedCount = leaves.filter(
                    (l) => l.status === "APPROVED",
                  ).length;
                  const rejectedCount = leaves.filter(
                    (l) => l.status === "REJECTED",
                  ).length;

                  // Filter logic for manager view
                  const filteredLeaves = leaves.filter((lv: any) => {
                    const matchesSearch =
                      (lv.employee_name || "")
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase()) ||
                      (lv.employee_username || "")
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase()) ||
                      (lv.leave_type || "")
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase()) ||
                      (lv.reason || "")
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase());

                    const matchesDept =
                      leaveDeptFilter === "ALL" ||
                      (lv.employee_role || "").toUpperCase() ===
                        leaveDeptFilter.toUpperCase();

                    const matchesStatus =
                      leaveStatusFilter === "ALL" ||
                      (lv.status || "PENDING").toUpperCase() ===
                        leaveStatusFilter.toUpperCase();

                    return matchesSearch && matchesDept && matchesStatus;
                  });

                  return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-500 mt-6">
                      {/* Header Banner for Manager View */}
                      <div className="bg-white text-stone-900 p-6 md:p-8 rounded-[2rem] shadow-xs border border-stone-200 relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-1 bg-brand" />
                        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="bg-rose-50 text-brand border border-rose-200 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                                <ShieldCheck className="w-3.5 h-3.5 text-brand" /> Manager
                                Approval Portal
                              </span>
                              <span className="text-xs font-bold text-stone-500">
                                Logged in as: {user?.name || user?.username} (
                                {user?.level || "MANAGER"})
                              </span>
                            </div>
                            <h2 className="text-xl md:text-2xl font-black text-stone-900 tracking-tight">
                              Staff Leave Authorization & Approvals (Manager Hub)
                            </h2>
                            <p className="text-xs text-stone-600 font-medium max-w-xl leading-relaxed">
                              ERP Standard: Leave authorization and approvals are handled by the respective Manager/FC (Not Human Resources). Leave requested by Manager & FC is automatically approved by the system.
                            </p>
                          </div>

                          {/* Quick KPI stats */}
                          <div className="grid grid-cols-3 gap-3 w-full md:w-auto shrink-0">
                            <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 text-center">
                              <span className="text-[10px] font-black uppercase tracking-widest text-amber-800 block">
                                Pending Review
                              </span>
                              <span className="text-2xl font-black font-mono text-amber-700 mt-1 block">
                                {pendingCount}
                              </span>
                            </div>
                            <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200 text-center">
                              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800 block">
                                Approved
                              </span>
                              <span className="text-2xl font-black font-mono text-emerald-700 mt-1 block">
                                {approvedCount}
                              </span>
                            </div>
                            <div className="bg-rose-50/70 p-4 rounded-2xl border border-rose-200 text-center">
                              <span className="text-[10px] font-black uppercase tracking-widest text-rose-800 block">
                                Rejected
                              </span>
                              <span className="text-2xl font-black font-mono text-rose-700 mt-1 block">
                                {rejectedCount}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Filter Toolbars */}
                      <div className="bg-white/80 backdrop-blur-md rounded-[2rem] p-6 border border-stone-200 shadow-sm space-y-4">
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                          {/* Department Filters */}
                          <div className="space-y-1.5 w-full lg:w-auto">
                            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block">
                              Filter By Department
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                "ALL",
                                "PRODUCTION",
                                "ENGINEERING",
                                "PURCHASING",
                                "WAREHOUSE",
                                "SALES",
                                "HR",
                              ].map((dept) => (
                                <button
                                  key={dept}
                                  onClick={() => setLeaveDeptFilter(dept)}
                                  className={cn(
                                    "px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all border cursor-pointer",
                                    leaveDeptFilter === dept
                                      ? "bg-brand text-white border-brand shadow-xs"
                                      : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100",
                                  )}
                                >
                                  {dept === "ALL" ? "All Departments" : dept}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Status Filters */}
                          <div className="space-y-1.5 w-full lg:w-auto">
                            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block">
                              Filter By Status
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                { id: "ALL", label: "All Statuses" },
                                {
                                  id: "PENDING",
                                  label: `Pending (${pendingCount})`,
                                },
                                { id: "APPROVED", label: "Approved" },
                                { id: "REJECTED", label: "Rejected" },
                              ].map((st) => (
                                <button
                                  key={st.id}
                                  onClick={() => setLeaveStatusFilter(st.id)}
                                  className={cn(
                                    "px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all border cursor-pointer",
                                    leaveStatusFilter === st.id
                                      ? st.id === "PENDING"
                                        ? "bg-amber-500 text-stone-950 border-amber-500 shadow-sm"
                                        : st.id === "APPROVED"
                                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                          : st.id === "REJECTED"
                                            ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                                            : "bg-brand text-white border-brand shadow-xs"
                                      : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100",
                                  )}
                                >
                                  {st.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Staff Requests List */}
                      <div className="bg-white/80 backdrop-blur-md rounded-[32px] p-8 border border-stone-200 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                          <h3 className="text-lg font-black text-stone-900">
                            Submissions List ({filteredLeaves.length})
                          </h3>
                          {pendingCount > 0 && (
                            <div className="px-3.5 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 font-bold text-xs rounded-xl flex items-center gap-2 animate-pulse">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              <span>
                                {pendingCount} Staff Request(s) Require Manager
                                Action
                              </span>
                            </div>
                          )}
                        </div>

                        {filteredLeaves.length === 0 ? (
                          <div className="py-20 text-center bg-stone-50/80 rounded-[2.5rem] border border-stone-200 border-dashed">
                            <CheckSquare className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                            <p className="text-stone-700 font-bold text-sm">
                              No leave requests match the selected filters.
                            </p>
                            <p className="text-xs text-stone-400 mt-1">
                              Try adjusting your department or status filter
                              above.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {filteredLeaves.map((lv: any) => {
                              const s = new Date(lv.start_date);
                              const e = new Date(lv.end_date);
                              let daysCount = 1;
                              try {
                                const diffTime = Math.abs(
                                  e.getTime() - s.getTime(),
                                );
                                daysCount =
                                  Math.ceil(diffTime / (1000 * 60 * 60 * 24)) +
                                  1;
                              } catch (_) {}

                              const isPending = lv.status === "PENDING";

                              return (
                                <div
                                  key={lv.id}
                                  className={cn(
                                    "p-6 rounded-[2.5rem] border transition-all space-y-4",
                                    isPending
                                      ? "bg-amber-50/40 border-amber-200/80 shadow-sm hover:border-amber-300"
                                      : "bg-stone-50/60 border-stone-200/80",
                                  )}
                                >
                                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-stone-200/60">
                                    <div className="flex items-center gap-3">
                                      <div className="w-11 h-11 rounded-2xl bg-stone-100 border border-stone-200 text-stone-700 font-black flex items-center justify-center text-base shadow-xs">
                                        {(
                                          lv.employee_name ||
                                          lv.employee_username ||
                                          "U"
                                        )
                                          .substring(0, 2)
                                          .toUpperCase()}
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-base font-extrabold text-stone-900">
                                            {lv.employee_name ||
                                              lv.employee_username}
                                          </span>
                                          <span className="text-xs font-bold text-stone-400 font-mono">
                                            @{lv.employee_username}
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider text-stone-600 items-center mt-1">
                                          <span className="bg-stone-200 px-2.5 py-0.5 rounded-lg text-stone-800">
                                            Department:{" "}
                                            {lv.employee_role || "Staff"}
                                          </span>
                                          <span className="bg-stone-150 px-2 py-0.5 rounded text-stone-600">
                                            Level:{" "}
                                            {lv.employee_level || "STAFF"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <span
                                        className={cn(
                                          "px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest border shadow-sm",
                                          lv.status === "APPROVED"
                                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                            : lv.status === "REJECTED"
                                              ? "bg-rose-50 text-rose-800 border-rose-200"
                                              : "bg-amber-100 text-amber-900 border-amber-300",
                                        )}
                                      >
                                        {lv.status || "PENDING"}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
                                    <div className="space-y-2">
                                      <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block">
                                        Leave Information
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="bg-brand text-white px-2.5 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider shadow-2xs">
                                          {lv.leave_type}
                                        </span>
                                        <span className="font-extrabold text-stone-800">
                                          {formatLocalDate(lv.start_date)} -{" "}
                                          {formatLocalDate(lv.end_date)} (
                                          {daysCount} Working Days)
                                        </span>
                                      </div>
                                      {lv.reason && (
                                        <div className="bg-white p-3 rounded-xl border border-stone-200/80 text-stone-600 font-medium italic mt-2">
                                          &ldquo;{lv.reason}&rdquo;
                                        </div>
                                      )}
                                    </div>

                                    <div className="space-y-2">
                                      <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block">
                                        Manager Notes (Feedback / Approval Instructions)
                                      </span>
                                      {isPending ? (
                                        <textarea
                                          rows={2}
                                          placeholder="Add manager notes for this employee (e.g. Approved, please complete task handover prior to leave date)..."
                                          value={hrManagerNotes[lv.id] || ""}
                                          onChange={(e) =>
                                            setHrManagerNotes((prev) => ({
                                              ...prev,
                                              [lv.id]: e.target.value,
                                            }))
                                          }
                                          className="w-full p-3 bg-white border border-stone-300 rounded-2xl text-xs font-medium text-stone-900 outline-none focus:ring-2 focus:ring-stone-900 transition-all shadow-inner"
                                        />
                                      ) : (
                                        <div className="bg-white p-3 rounded-2xl border border-stone-200 text-stone-700 font-medium space-y-1">
                                          <p className="text-xs text-stone-800 font-semibold">
                                            {lv.manager_note || (
                                              <span className="text-stone-400 italic">
                                                No manager notes provided.
                                              </span>
                                            )}
                                          </p>
                                          {lv.approver_name && (
                                            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-1">
                                              Authorized By:{" "}
                                              <strong className="text-stone-700">
                                                {lv.approver_name}
                                              </strong>{" "}
                                              (@{lv.approved_by})
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {isPending && (
                                    <div className="flex justify-end items-center gap-3 pt-3 border-t border-stone-200/60">
                                      <button
                                        onClick={() =>
                                          handleLeaveStatusUpdate(
                                            lv.id,
                                            "REJECTED",
                                          )
                                        }
                                        className="px-5 py-2.5 hover:bg-stone-200 border border-stone-300 bg-stone-100 text-stone-800 text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                                      >
                                        Reject Request
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleLeaveStatusUpdate(
                                            lv.id,
                                            "APPROVED",
                                          )
                                        }
                                        className="px-5 py-2.5 bg-brand text-white hover:bg-brand-dark text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5"
                                      >
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>Approve Request</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

              {/* PAYROLL TAB */}
              {adminTab === "PAYROLL" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-500 mt-6">
                  {/* SUB-TAB NAVIGATION BAR (STRICTLY 2 PANELS) */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white/90 backdrop-blur-md p-3 rounded-[2.5rem] border border-stone-200 shadow-lg">
                    <div className="flex items-center gap-2 p-1.5 bg-stone-100 rounded-2xl w-full sm:w-auto overflow-x-auto">
                      <button
                        onClick={() => setPayrollSubTab("DASHBOARD")}
                        className={cn(
                          "px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap",
                          payrollSubTab === "DASHBOARD"
                            ? "bg-brand text-white shadow-md shadow-red-200/50"
                            : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/60"
                        )}
                      >
                        <FileText className="w-4 h-4" />
                        <span>1. Dashboard Expense HR</span>
                      </button>

                      <button
                        onClick={() => setPayrollSubTab("SALARIES")}
                        className={cn(
                          "px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap",
                          payrollSubTab === "SALARIES"
                            ? "bg-brand text-white shadow-md shadow-red-200/50"
                            : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/60"
                        )}
                      >
                        <DollarSign className="w-4 h-4" />
                        <span>2. Employee Salary Master</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-3 pr-2 w-full sm:w-auto justify-end">
                      {payrollSubTab === "DASHBOARD" && (() => {
                        const curDay = new Date().getDate();
                        const isTBActive = curDay >= 15 && curDay <= 24;
                        return (
                          <button
                            onClick={handleOpenCreatePrq}
                            disabled={!isTBActive}
                            className={cn(
                              "px-6 py-2.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer shadow-sm",
                              isTBActive
                                ? "bg-brand text-white hover:bg-brand-dark shadow-red-200/50"
                                : "bg-stone-200 text-stone-500 cursor-not-allowed opacity-75"
                            )}
                            title={!isTBActive ? "Payroll creation is accessible only during monthly closing window (15th – 24th)" : "Create New Payroll Requisition"}
                          >
                            {!isTBActive ? <Lock className="w-4 h-4 text-stone-500" /> : <Plus className="w-4 h-4" />}
                            <span>Create New PRq</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>

                  {/* PANEL 1: DASHBOARD EXPENSE HR (PRQ MANAGEMENT) */}
                  {payrollSubTab === "DASHBOARD" && (() => {
                    const curDay = new Date().getDate();
                    const isTBActive = curDay >= 15 && curDay <= 24;

                    return (
                      <div className="bg-white/90 backdrop-blur-md rounded-[32px] p-8 border border-stone-200 shadow-xl space-y-8">
                        {/* CORPORATE TUTUP BUKU POLICY BANNER */}
                        <div className={cn(
                          "p-4 rounded-2xl border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs",
                          isTBActive 
                            ? "bg-emerald-50/80 border-emerald-200/90 text-emerald-950" 
                            : "bg-amber-50/90 border-amber-200/90 text-amber-950"
                        )}>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs",
                              isTBActive ? "bg-emerald-100 border-emerald-300 text-emerald-800" : "bg-amber-100 border-amber-300 text-amber-800"
                            )}>
                              {isTBActive ? <CheckCircle2 className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md border",
                                  isTBActive ? "bg-emerald-200/70 text-emerald-900 border-emerald-300" : "bg-amber-200/70 text-amber-900 border-amber-300"
                                )}>
                                  {isTBActive ? "CLOSING WINDOW ACTIVE" : "PAYROLL PERIOD LOCKED"}
                                </span>
                                <span className="text-[11px] font-extrabold opacity-75">
                                  Today: Day {curDay}
                                </span>
                              </div>
                              <p className="text-xs font-bold leading-tight">
                                {isTBActive
                                  ? "Payroll Requisition (PRq) processing is currently open."
                                  : "Payroll creation is closed. Access is available from the 15th to 24th."}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            <div className="px-3 py-1 bg-white/80 rounded-xl border border-stone-200 text-[11px] font-black text-stone-700 shadow-2xs">
                              Access Window: <span className="text-brand">15th – 24th Monthly</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-3">
                            <span className="px-3 py-1 bg-red-100 text-brand text-[10px] font-black uppercase tracking-widest rounded-full">
                              HR Expense Dashboard
                            </span>
                            <h2 className="text-2xl font-black text-stone-900">
                              Payroll Requisitions & Expenses List (PRq)
                            </h2>
                          </div>
                          <p className="text-stone-500 text-sm mt-1">
                            Preparation of HR payroll expense list to be submitted to Finance Division with Auth System verification & Confirmation Modal.
                          </p>
                        </div>

                      {/* PRq STATS OVERVIEW */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-stone-50 p-5 rounded-[2rem] border border-stone-200">
                          <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block mb-1">
                            Total Submitted PRq
                          </span>
                          <p className="text-2xl font-black text-stone-900">
                            {payrollReqs.length} Documents
                          </p>
                          <span className="text-xs text-stone-500 mt-1 block">
                            Current Period 2026
                          </span>
                        </div>

                        <div className="bg-amber-50/60 p-5 rounded-[2rem] border border-amber-200/60">
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 block mb-1">
                            Draft / Needs Revision
                          </span>
                          <p className="text-2xl font-black text-amber-900">
                            {payrollReqs.filter((r) => r.status === "DRAFT" || r.status === "REJECTED").length}
                          </p>
                          <span className="text-xs text-amber-700/80 mt-1 block">
                            Awaiting HR action
                          </span>
                        </div>

                        <div className="bg-blue-50/60 p-5 rounded-[2rem] border border-blue-200/60">
                          <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 block mb-1">
                            Awaiting Finance
                          </span>
                          <p className="text-2xl font-black text-blue-900">
                            {payrollReqs.filter((r) => r.status === "SUBMITTED").length}
                          </p>
                          <span className="text-xs text-blue-700/80 mt-1 block">
                            Under Finance review
                          </span>
                        </div>

                        <div className="bg-emerald-50/60 p-5 rounded-[2rem] border border-emerald-200/60">
                          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 block mb-1">
                            Approved & Issued
                          </span>
                          <p className="text-2xl font-black text-emerald-900">
                            {payrollReqs.filter((r) => r.status === "CONVERTED").length}
                          </p>
                          <span className="text-xs text-emerald-700/80 mt-1 block">
                            Active Disbursement Order
                          </span>
                        </div>
                      </div>

                      {/* PRq SEARCH BAR */}
                      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2 border-t border-stone-200/60">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-stone-700 uppercase tracking-wider">
                            HR Payroll Expenses List ({payrollReqs.length} Documents)
                          </span>
                        </div>

                        <div className="w-full sm:w-72">
                          <div className="relative">
                            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                            <input
                              type="text"
                              placeholder="Search PRq No. / Period..."
                              value={prqSearchQuery}
                              onChange={(e) => setPrqSearchQuery(e.target.value)}
                              className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold focus:outline-none focus:border-brand transition-all"
                            />
                          </div>
                        </div>
                      </div>

                      {/* PRq TABLE LIST */}
                      {(() => {
                        const filteredPRqs = (Array.isArray(payrollReqs) ? payrollReqs : []).filter((req: any) => {
                          const reqNo = String(req.requisition_no || req.requisition_number || "").toLowerCase();
                          const notes = String(req.notes || "").toLowerCase();
                          const period = String(req.period_name || "").toLowerCase();
                          const query = prqSearchQuery.toLowerCase();
                          return !query || reqNo.includes(query) || notes.includes(query) || period.includes(query);
                        });

                        if (filteredPRqs.length === 0) {
                          return (
                            <div className="py-12 text-center bg-stone-50/50 rounded-[2.5rem] border border-dashed border-stone-200">
                              <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-400">
                                <DollarSign className="w-8 h-8" />
                              </div>
                              <p className="text-stone-700 font-bold text-base">
                                No PRq Requisition Documents Found
                              </p>
                              <p className="text-sm mt-1 text-stone-400 max-w-md mx-auto">
                                No payroll expense documents exist yet or try adjusting your search terms.
                              </p>
                            </div>
                          );
                        }

                        return (
                          <div className="overflow-x-auto rounded-[1.5rem] border border-stone-200">
                            <table className="w-full text-left font-bold text-xs border-collapse">
                              <thead>
                                <tr className="bg-stone-50 text-stone-500 uppercase tracking-widest border-b border-stone-200">
                                  <th className="p-4 pl-6 text-[10px]">PRq No.</th>
                                  <th className="p-4 text-[10px]">Period</th>
                                  <th className="p-4 text-[10px]">Staff Count</th>
                                  <th className="p-4 text-right text-[10px]">Total Gross</th>
                                  <th className="p-4 text-right text-[10px]">Total Deductions</th>
                                  <th className="p-4 text-right text-[10px]">Disbursement Amount</th>
                                  <th className="p-4 text-center text-[10px]">Flow Status</th>
                                  <th className="p-4 text-center pr-6 text-[10px]">ERP Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-stone-100 text-stone-700">
                                {filteredPRqs.map((req: any) => {
                                  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                                  const periodText = `${monthNames[(req.period_month || 1) - 1]} ${req.period_year || 2026}`;
                                  let detailCount = 0;
                                  try {
                                    const parsedDet = typeof req.details_json === 'string' ? JSON.parse(req.details_json) : req.details;
                                    if (Array.isArray(parsedDet)) detailCount = parsedDet.length;
                                  } catch (e) {
                                    detailCount = 0;
                                  }

                                  return (
                                    <tr key={req.id} className="hover:bg-stone-50/80 transition-colors">
                                      <td className="p-4 pl-6 font-mono font-bold text-stone-900">
                                        {req.requisition_no || req.requisition_number}
                                      </td>
                                      <td className="p-4 font-bold text-stone-800">
                                        {periodText}
                                      </td>
                                      <td className="p-4 font-bold text-stone-600">
                                        {req.total_employees || detailCount} Employees
                                      </td>
                                      <td className="p-4 text-right font-mono text-stone-600">
                                        {formatRupiah(req.total_gross_pay || req.total_gross || 0)}
                                      </td>
                                      <td className="p-4 text-right font-mono text-rose-600">
                                        -{formatRupiah(req.total_deductions || 0)}
                                      </td>
                                      <td className="p-4 text-right font-mono font-black text-stone-900 text-sm">
                                        {formatRupiah(req.total_net_pay || req.total_net || 0)}
                                      </td>
                                      <td className="p-4 text-center">
                                        {req.status === "DRAFT" && (
                                          <span className="px-3 py-1 bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider rounded-full inline-flex items-center gap-1">
                                            Draft Requisition
                                          </span>
                                        )}
                                        {req.status === "SUBMITTED" && (
                                          <span className="px-3 py-1 bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wider rounded-full inline-flex items-center gap-1">
                                            Awaiting Finance
                                          </span>
                                        )}
                                        {req.status === "CONVERTED" && (
                                          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider rounded-full inline-flex items-center gap-1">
                                            Approved & Issued
                                          </span>
                                        )}
                                        {req.status === "REJECTED" && (
                                          <span className="px-3 py-1 bg-rose-100 text-rose-800 text-[10px] font-black uppercase tracking-wider rounded-full inline-flex items-center gap-1">
                                            Rejected by Finance
                                          </span>
                                        )}
                                        {req.status === "CANCELLED" && (
                                          <span className="px-3 py-1 bg-stone-200 text-stone-700 text-[10px] font-black uppercase tracking-wider rounded-full inline-flex items-center gap-1">
                                            Cancelled
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-4 text-center pr-6">
                                        <div className="flex items-center justify-center gap-1.5">
                                          <button
                                            onClick={() => handleOpenViewPrq(req)}
                                            className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg transition-all cursor-pointer"
                                            title="View Details"
                                          >
                                            <Eye className="w-4 h-4" />
                                          </button>

                                          {(req.status === "DRAFT" || req.status === "REJECTED") && (
                                            <button
                                              onClick={() => handleOpenEditPrq(req)}
                                              className="px-2.5 py-1.5 bg-brand hover:bg-brand-dark text-white text-xs font-bold rounded-lg transition-all shadow-sm cursor-pointer"
                                              title="Edit & Submit Requisition"
                                            >
                                              Edit
                                            </button>
                                          )}

                                          {(req.status === "DRAFT" || req.status === "SUBMITTED") && (
                                            <button
                                              onClick={() => handleOpenCancelPrqModal(req)}
                                              className="px-2.5 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-bold rounded-lg transition-all cursor-pointer"
                                              title="Cancel PRq Document"
                                            >
                                              Cancel
                                            </button>
                                          )}

                                          {(req.status === "DRAFT" || req.status === "CANCELLED" || req.status === "REJECTED") && (
                                            <button
                                              onClick={() => handleOpenDeletePrqModal(req)}
                                              className="px-2.5 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-lg transition-all cursor-pointer"
                                              title="Permanently Delete Draft"
                                            >
                                              Delete
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                  {/* PANEL 2: SALARY MASTER (MASTER GAJI SDM) */}
                  {payrollSubTab === "SALARIES" && (
                    <PayrollSalarySettings users={users} />
                  )}
                </div>
              )}

              {/* 1. TAB: JOB VACANCIES */}
              {adminTab === "VACANCIES" && (
                <div className="mt-8">
                  {filteredJobs.length === 0 ? (
                    <div className="col-span-full py-20 text-center bg-white/50 rounded-[40px] border border-white">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                        <Briefcase className="w-8 h-8" />
                      </div>
                      <p className="text-slate-500 font-medium">
                        No active vacancies listed.
                      </p>
                      <p className="text-xs mt-1 text-slate-400">
                        Time to hunt for new talent!
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {filteredJobs.map((job) => {
                        let reqs: string[] = [];
                        let bens: string[] = [];
                        try {
                          reqs = JSON.parse(job.requirements);
                          bens = JSON.parse(job.benefits);
                        } catch (e) {
                          reqs = job.requirements ? [job.requirements] : [];
                          bens = job.benefits ? [job.benefits] : [];
                        }

                        return (
                          <div
                            key={job.id}
                            className="bg-white/80 backdrop-blur-md rounded-[32px] border border-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between overflow-hidden group"
                          >
                            <div className="p-6">
                              <div className="flex justify-between items-start mb-4">
                                <div className="flex flex-wrap gap-2">
                                  <span className="px-3 py-1.5 bg-violet-100 text-violet-700 text-xs font-bold rounded-full border border-violet-200">
                                    {job.department}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleToggleJobStatus(job)}
                                  className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold rounded-full transition-all flex items-center gap-1.5 ${job.status === "OPEN" ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}
                                >
                                  <span
                                    className={`w-2 h-2 rounded-full ${job.status === "OPEN" ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`}
                                  ></span>
                                  {job.status}
                                </button>
                              </div>

                              <h3 className="text-xl font-bold text-slate-800 leading-tight mb-3 group-hover:text-violet-600 transition-colors">
                                {job.title}
                              </h3>

                              <div className="flex flex-wrap text-xs text-slate-500 gap-3 mb-5 bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                                <span className="flex items-center gap-1 font-medium">
                                  <MapPin className="h-3.5 w-3.5 text-slate-400" />{" "}
                                  {job.location}
                                </span>
                                <span className="flex items-center gap-1 font-medium">
                                  <Clock className="h-3.5 w-3.5 text-slate-400" />{" "}
                                  {job.type}
                                </span>
                                {job.salary_string && (
                                  <span className="flex items-center gap-1 font-bold text-slate-700">
                                    <DollarSign className="h-3.5 w-3.5 text-emerald-500" />{" "}
                                    {job.salary_string}
                                  </span>
                                )}
                              </div>

                              <p className="text-sm text-slate-600 line-clamp-3 mb-5 leading-relaxed">
                                {job.description}
                              </p>

                              <div className="space-y-2 mb-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                  Core Requirements
                                </span>
                                <ul className="text-xs text-slate-700 space-y-1.5">
                                  {reqs.slice(0, 3).map((r, i) => (
                                    <li
                                      key={i}
                                      className="flex items-start gap-1.5 font-medium"
                                    >
                                      <ChevronRight className="h-3 w-3 text-violet-400 shrink-0 mt-0.5" />{" "}
                                      <span className="line-clamp-1">{r}</span>
                                    </li>
                                  ))}
                                  {reqs.length > 3 && (
                                    <li className="text-[10px] text-violet-500 font-bold ml-5">
                                      +{reqs.length - 3} MORE SKILLS
                                    </li>
                                  )}
                                </ul>
                              </div>
                            </div>

                            {/* ACTIONS GRID */}
                            <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
                              <button
                                type="button"
                                onClick={() => {
                                  resetJobForm(job);
                                  setIsJobModalOpen(true);
                                }}
                                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-full transition-colors border border-slate-200 shadow-sm w-full"
                              >
                                Edit Listing
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteJob(job.id)}
                                className="p-2.5 bg-white hover:bg-rose-50 text-rose-500 rounded-full transition-colors border border-slate-200 shadow-sm shrink-0"
                                title="Delete Vacancy"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 2. TAB: CANDIDATES PIPELINE (KANBAN) */}
              {adminTab === "CANDIDATES" && (
                <div className="mt-8 space-y-6">
                  {/* Pipeline Info & Quick-Filters Bar */}
                  <div className="bg-white p-6 rounded-[2rem] border border-stone-200/80 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                    <div>
                      <h3 className="text-lg font-black text-stone-800 flex items-center gap-2">
                        <span>Sourced Talent Pipeline</span>
                        <span className="px-3 py-1 bg-brand/10 text-brand text-[10px] rounded-full uppercase tracking-widest font-extrabold font-mono">
                          {filteredApps.length} Candidates
                        </span>
                      </h3>
                      <p className="text-stone-500 text-xs mt-1 font-medium">
                        Evaluate applications, track background screening,
                        arrange panels, and move hires with instant stage
                        controls.
                      </p>
                    </div>

                    {/* Dropdown position selector & statistics summary */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-2xl px-3 py-2 shrink-0">
                        <Briefcase className="w-3.5 h-3.5 text-stone-400" />
                        <select
                          value={filterJobId}
                          onChange={(e) => setFilterJobId(e.target.value)}
                          className="bg-transparent border-none text-xs font-black text-stone-700 focus:outline-none cursor-pointer p-0"
                        >
                          <option value="ALL">
                            All Open & Closed Vacancies
                          </option>
                          {jobs.map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.title} ({j.department})
                            </option>
                          ))}
                        </select>
                      </div>

                      {filterJobId !== "ALL" && (
                        <button
                          onClick={() => setFilterJobId("ALL")}
                          className="text-[10px] font-extrabold text-brand uppercase tracking-wider hover:underline"
                        >
                          Reset Filter
                        </button>
                      )}
                    </div>
                  </div>

                  {filteredApps.length === 0 ? (
                    <div className="py-24 text-center bg-white/50 rounded-[2.5rem] border border-stone-200 flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-4 text-stone-300">
                        <Users className="w-8 h-8" />
                      </div>
                      <p className="text-stone-600 font-extrabold text-base">
                        No matches found in candidate pool.
                      </p>
                      <p className="text-xs text-stone-400 mt-1 max-w-sm">
                        Try searching for different keywords, clear the search
                        filter, or change the Vacancy target selector.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                      {/* LEFT COLUMN: Candidate Directory & Phase Filtering */}
                      <div className="lg:col-span-5 bg-white border border-stone-200 p-5 rounded-[2.5rem] shadow-sm space-y-5 flex flex-col">
                        {/* Mini Header & Stage selection */}
                        <div>
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-[11px] font-black uppercase tracking-widest text-stone-400">
                              Recruitment Stages
                            </span>
                            <span className="px-2.5 py-0.5 bg-stone-100 text-[10px] rounded-full text-stone-600 font-bold border border-stone-150">
                              {filteredApps.length} Total Sourced
                            </span>
                          </div>

                          {/* Colorful stage selection grid */}
                          <div className="grid grid-cols-3 gap-1.5 bg-stone-50 p-2 rounded-2xl border border-stone-150 text-[10px] font-black">
                            {[
                              { key: "ALL", label: "All Pool" },
                              { key: "APPLIED", label: "Applied" },
                              { key: "SCREENING", label: "Screening" },
                              { key: "INTERVIEW", label: "Interview" },
                              { key: "OFFER_MADE", label: "Proposal" },
                              { key: "ACCEPTED", label: "Hired" },
                              { key: "REJECTED", label: "Archived" },
                            ].map((stageItem) => {
                              // Count of candidates matching this status
                              const stageCount =
                                stageItem.key === "ALL"
                                  ? filteredApps.length
                                  : filteredApps.filter(
                                      (a) => a.status === stageItem.key,
                                    ).length;

                              const isActive =
                                selectedStageFilter === stageItem.key;

                              return (
                                <button
                                  key={stageItem.key}
                                  type="button"
                                  onClick={() =>
                                    setSelectedStageFilter(stageItem.key)
                                  }
                                  className={cn(
                                    "px-2 py-2 rounded-xl text-center transition-all flex flex-col items-center justify-between gap-1 border cursor-pointer",
                                    isActive
                                      ? "bg-brand border-brand text-white shadow-xs font-black"
                                      : "bg-white border-stone-200 text-stone-600 hover:text-stone-900 hover:border-stone-400",
                                  )}
                                >
                                  <span className="truncate max-w-full leading-tight">
                                    {stageItem.label}
                                  </span>
                                  <span
                                    className={cn(
                                      "px-1.5 py-0.2 px-1 text-[9px] rounded-full font-mono font-bold",
                                      isActive
                                        ? "bg-white text-brand"
                                        : "bg-stone-100 text-stone-500 border border-stone-200",
                                    )}
                                  >
                                    {stageCount}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Candidates Directory Vertical List */}
                        <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-1.5">
                          <AnimatePresence mode="popLayout">
                            {(() => {
                              const pool = filteredApps.filter(
                                (a) =>
                                  selectedStageFilter === "ALL" ||
                                  a.status === selectedStageFilter,
                              );

                              if (pool.length === 0) {
                                return (
                                  <motion.div
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className="py-20 text-center text-stone-400 italic text-xs bg-stone-50 rounded-2xl border border-stone-150"
                                  >
                                    No candidates currently in this stage.
                                  </motion.div>
                                );
                              }

                              return pool.map((app) => {
                                const isSelected = selectedApp?.id === app.id;

                                // Color helper for status badget/borders
                                const colMeta: Record<
                                  string,
                                  {
                                    label: string;
                                    text: string;
                                    bg: string;
                                    dot: string;
                                  }
                                > = {
                                  APPLIED: {
                                    label: "Applied",
                                    text: "text-stone-700",
                                    bg: "bg-stone-100/80 border-stone-200",
                                    dot: "bg-stone-400",
                                  },
                                  SCREENING: {
                                    label: "Screening",
                                    text: "text-indigo-800",
                                    bg: "bg-indigo-50 border-indigo-150",
                                    dot: "bg-indigo-500",
                                  },
                                  INTERVIEW: {
                                    label: "Interview",
                                    text: "text-sky-800",
                                    bg: "bg-sky-50 border-sky-150",
                                    dot: "bg-sky-500",
                                  },
                                  OFFER_MADE: {
                                    label: "Proposal",
                                    text: "text-amber-800",
                                    bg: "bg-amber-50 border-amber-150",
                                    dot: "bg-amber-500",
                                  },
                                  ACCEPTED: {
                                    label: "Hired ✓",
                                    text: "text-emerald-850",
                                    bg: "bg-emerald-50 border-emerald-150",
                                    dot: "bg-emerald-500",
                                  },
                                  REJECTED: {
                                    label: "Archived ✕",
                                    text: "text-rose-850",
                                    bg: "bg-rose-50 border-rose-150",
                                    dot: "bg-rose-500",
                                  },
                                };
                                const meta =
                                  colMeta[app.status] || colMeta.APPLIED;

                                return (
                                  <motion.button
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{
                                      opacity: 0,
                                      scale: 0.9,
                                      transition: { duration: 0.15 },
                                    }}
                                    transition={{ duration: 0.2 }}
                                    key={app.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedApp(app);
                                      setReviewStatus(app.status);
                                      setReviewNotes(app.notes || "");
                                    }}
                                    className={cn(
                                      "w-full text-left p-4 rounded-3xl border transition-all duration-300 flex items-start gap-3 group relative overflow-hidden cursor-pointer",
                                      isSelected
                                        ? "bg-white border-brand ring-2 ring-brand/10 shadow-md"
                                        : "bg-stone-50 hover:bg-white border-stone-200 hover:border-stone-400 shadow-sm",
                                    )}
                                  >
                                    {/* Accent colored vertical line marker */}
                                    <div
                                      className={cn(
                                        "absolute top-0 left-0 w-1 h-full",
                                        meta.dot,
                                      )}
                                    />

                                    {/* Candidate initials circle */}
                                    <div
                                      className={cn(
                                        "w-9 h-9 rounded-full font-black text-xs flex items-center justify-center shrink-0 border",
                                        isSelected
                                          ? "bg-brand/10 border-brand/20 text-brand"
                                          : "bg-white border-stone-250 text-stone-500",
                                      )}
                                    >
                                      {app.name.substring(0, 2).toUpperCase()}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <div className="flex justify-between items-start gap-2">
                                        <p className="font-extrabold text-stone-900 text-xs truncate group-hover:text-brand transition-colors">
                                          {app.name}
                                        </p>
                                        <span
                                          className={cn(
                                            "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border shrink-0",
                                            meta.bg,
                                            meta.text,
                                          )}
                                        >
                                          {meta.label}
                                        </span>
                                      </div>

                                      <p className="text-[10px] text-stone-500 font-extrabold truncate mt-0.5">
                                        {app.job_title}
                                      </p>

                                      <div className="flex justify-between items-center text-[10px] text-stone-400 font-bold mt-2 pt-2 border-t border-stone-200/50">
                                        <span className="bg-white px-1.5 py-0.5 rounded border border-stone-150 text-stone-500 text-[9px] shrink-0 font-mono">
                                          Exp: {app.experience || "None"}
                                        </span>
                                        <span>
                                          {new Date(
                                            app.applied_at,
                                          ).toLocaleDateString("id-ID", {
                                            day: "numeric",
                                            month: "short",
                                            year: "numeric",
                                          })}
                                        </span>
                                      </div>
                                    </div>
                                  </motion.button>
                                );
                              });
                            })()}
                          </AnimatePresence>
                        </div>
                      </div>

                      {/* RIGHT COLUMN: Active Selected Candidate Workspace & Evaluation Panel */}
                      {(() => {
                        const activeApp = selectedApp
                          ? applications.find((a) => a.id === selectedApp.id) ||
                            selectedApp
                          : null;

                        if (!activeApp) {
                          return (
                            <div className="lg:col-span-7 bg-white border border-stone-200 rounded-[2.5rem] p-10 flex flex-col items-center justify-center text-center space-y-4 min-h-[460px]">
                              <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center text-stone-300 border border-stone-150 shadow-inner">
                                <ClipboardList className="w-8 h-8" />
                              </div>
                              <div className="max-w-md">
                                <h4 className="text-sm font-black text-stone-850 uppercase tracking-widest">
                                  Select Candidate Dossier
                                </h4>
                                <p className="text-xs text-stone-500 mt-2 leading-relaxed font-bold">
                                  Click any applicant on the directory list to
                                  examine their background, view qualifications,
                                  advance recruitment steps, and launch
                                  automated follow-up messages inline.
                                </p>
                              </div>

                              {/* Recruitment overview pipeline funnel metric card */}
                              <div className="grid grid-cols-3 gap-3 w-full max-w-sm pt-6 mt-4 border-t border-stone-200">
                                <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-150 text-center">
                                  <span className="text-[9px] text-stone-400 uppercase tracking-wider font-extrabold block">
                                    Applied
                                  </span>
                                  <span className="text-xs font-mono font-black text-stone-700">
                                    {
                                      filteredApps.filter(
                                        (a) => a.status === "APPLIED",
                                      ).length
                                    }
                                  </span>
                                </div>
                                <div className="bg-amber-50 border border-amber-200/50 p-2.5 rounded-xl text-center">
                                  <span className="text-[9px] text-amber-700 uppercase tracking-wider font-extrabold block">
                                    Interviews
                                  </span>
                                  <span className="text-xs font-mono font-black text-amber-800">
                                    {
                                      filteredApps.filter(
                                        (a) => a.status === "INTERVIEW",
                                      ).length
                                    }
                                  </span>
                                </div>
                                <div className="bg-emerald-50 border border-emerald-200/50 p-2.5 rounded-xl text-center">
                                  <span className="text-[9px] text-emerald-700 uppercase tracking-wider font-extrabold block">
                                    Hired
                                  </span>
                                  <span className="text-xs font-mono font-black text-emerald-800">
                                    {
                                      filteredApps.filter(
                                        (a) => a.status === "ACCEPTED",
                                      ).length
                                    }
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        const STATUS_FLOW = [
                          "APPLIED",
                          "SCREENING",
                          "INTERVIEW",
                          "OFFER_MADE",
                          "ACCEPTED",
                          "REJECTED",
                        ] as const;
                        const curIdx = STATUS_FLOW.indexOf(activeApp.status);

                        return (
                          <div className="lg:col-span-7 bg-white border border-stone-200 p-6 rounded-[2.5rem] shadow-sm space-y-6">
                            {/* Master Candidate Profile Banner Card */}
                            <div className="p-5 bg-stone-50 border border-stone-200 rounded-[2rem] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden">
                              <div className="absolute top-0 right-0 w-24 h-24 bg-white/60 rounded-full blur-xl -mr-6 -mt-6 pointer-events-none" />

                              <div className="flex items-center gap-3.5 relative z-10 min-w-0">
                                <div className="w-11 h-11 rounded-2xl bg-stone-100 border border-stone-200 text-stone-800 font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs leading-none">
                                  {activeApp.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-black text-stone-900 text-sm leading-none truncate">
                                      {activeApp.name}
                                    </h4>
                                    <span className="px-2 py-0.5 bg-stone-250 text-stone-600 rounded text-[9px] font-black uppercase tracking-widest font-mono shrink-0">
                                      ID: {activeApp.id}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-stone-500 font-extrabold mt-1">
                                    Sourced:{" "}
                                    {new Date(
                                      activeApp.applied_at,
                                    ).toLocaleDateString("id-ID", {
                                      dateStyle: "long",
                                      timeZone: "Asia/Jakarta",
                                    })}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 relative z-10 sm:self-center">
                                <a
                                  href={`mailto:${activeApp.email}`}
                                  className="px-3 py-1.5 bg-white hover:bg-stone-100 border border-stone-250 text-stone-700 hover:text-stone-950 rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1 leading-none"
                                  title="Send Direct Email"
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                  <span>Mail Applicant</span>
                                </a>
                                {activeApp.linkedin_url && (
                                  <a
                                    href={
                                      activeApp.linkedin_url.startsWith("http")
                                        ? activeApp.linkedin_url
                                        : `https://${activeApp.linkedin_url}`
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 bg-white hover:bg-stone-50 border border-stone-250 text-sky-600 rounded-xl transition-all shadow-sm flex items-center justify-center"
                                    title="Open LinkedIn Portfolio"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Target Vacancy & Qualification Snapshot */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="p-4 bg-stone-10/50 border border-stone-200 rounded-2xl text-xs font-bold space-y-1">
                                <span className="text-[9px] uppercase tracking-wider text-stone-400 font-black block">
                                  Target Position
                                </span>
                                <p className="text-stone-850 font-black text-xs leading-none">
                                  {activeApp.job_title}
                                </p>
                                <p className="text-[10px] uppercase tracking-widest font-black text-brand">
                                  {activeApp.job_department || "Factory"}
                                </p>
                              </div>
                              <div className="p-4 bg-stone-10/50 border border-stone-200 rounded-2xl text-xs font-bold space-y-1">
                                <span className="text-[9px] uppercase tracking-wider text-stone-400 font-black block">
                                  Candidate Background
                                </span>
                                <p className="text-stone-850 font-black text-xs">
                                  {activeApp.experience ||
                                    "No Specified Background"}
                                </p>
                                <p className="text-[10px] text-stone-400 font-mono">
                                  Contact: {activeApp.phone}
                                </p>
                              </div>
                            </div>

                            {/* CV / Resume Text and Attached File Viewer */}
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">
                                  Docs & Motivation Letter
                                </span>
                              </div>
                              <div className="p-4 bg-white border border-stone-200 rounded-2xl max-h-[140px] overflow-y-auto custom-scrollbar text-xs leading-relaxed text-stone-600 font-medium">
                                {(() => {
                                  const text = activeApp.resume_text;
                                  if (!text)
                                    return (
                                      <p className="italic text-stone-400">
                                        No application letters entered.
                                      </p>
                                    );

                                  const fileRegex =
                                    /\[RESUME FILE\]:\s*(\/uploads\/[^\n]+)/;
                                  const match = text.match(fileRegex);

                                  if (match) {
                                    const fileUrl = match[1];
                                    const cleanText = text
                                      .replace(fileRegex, "")
                                      .trim();
                                    return (
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl p-2.5">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <div className="p-1.5 bg-red-50 rounded text-brand flex-shrink-0 border border-red-100">
                                              <FileText className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                              <p className="text-xs font-black text-stone-900 truncate">
                                                Resume_Candidate.pdf
                                              </p>
                                              <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider">
                                                PDF document
                                              </p>
                                            </div>
                                          </div>
                                          <a
                                            href={fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3 py-1.5 bg-brand hover:bg-brand-dark text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1 leading-none shadow-xs shrink-0 cursor-pointer"
                                          >
                                            <Download className="w-3.5 h-3.5" />
                                            Download
                                          </a>
                                        </div>
                                        {cleanText && (
                                          <p className="whitespace-pre-wrap text-[11px] font-semibold text-stone-500 pt-2 border-t border-stone-100">
                                            {cleanText}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  }
                                  return (
                                    <p className="whitespace-pre-wrap text-[11px] font-semibold">
                                      {text}
                                    </p>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Recruitment MILONES & Progression Panel */}
                            <div className="border-t border-stone-150 pt-4 space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block font-bold">
                                  Step Milestones Process
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-700 text-[10px] uppercase tracking-widest font-black font-mono">
                                  Current: {activeApp.status.replace("_", " ")}
                                </span>
                              </div>

                              {/* Timeline Stepper dots */}
                              <div className="bg-stone-50 border border-stone-200/60 p-4 rounded-2xl">
                                <div className="grid grid-cols-5 gap-1 relative select-none">
                                  <div className="absolute top-[14px] left-[10%] right-[10%] h-0.5 bg-stone-200 -z-0" />

                                  {[
                                    {
                                      key: "APPLIED",
                                      num: 1,
                                      label: "Applied",
                                    },
                                    {
                                      key: "SCREENING",
                                      num: 2,
                                      label: "Screening",
                                    },
                                    {
                                      key: "INTERVIEW",
                                      num: 3,
                                      label: "Interview",
                                    },
                                    {
                                      key: "OFFER_MADE",
                                      num: 4,
                                      label: "Proposal",
                                    },
                                    { key: "ACCEPTED", num: 5, label: "Hired" },
                                  ].map((step, idx) => {
                                    const statusOrder = [
                                      "APPLIED",
                                      "SCREENING",
                                      "INTERVIEW",
                                      "OFFER_MADE",
                                      "ACCEPTED",
                                      "REJECTED",
                                    ];
                                    const curActiveIdx = statusOrder.indexOf(
                                      activeApp.status,
                                    );
                                    const isCompleted = curActiveIdx >= idx;
                                    const isActive =
                                      activeApp.status === step.key;

                                    return (
                                      <div
                                        key={step.key}
                                        className="flex flex-col items-center text-center relative z-10"
                                      >
                                        <div
                                          className={cn(
                                            "w-7.5 h-7.5 rounded-full flex items-center justify-center font-black text-[11px] transition-all duration-300 border",
                                            isCompleted && !isActive
                                              ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                                              : "",
                                            isActive
                                              ? "bg-brand border-brand text-white shadow-md scale-105"
                                              : "",
                                            !isCompleted && !isActive
                                              ? "bg-white text-stone-400 border-stone-250"
                                              : "",
                                          )}
                                        >
                                          {isCompleted && !isActive
                                            ? "✓"
                                            : step.num}
                                        </div>
                                        <span
                                          className={cn(
                                            "text-[9px] font-extrabold mt-1.5 block tracking-tight line-clamp-1",
                                            isActive
                                              ? "text-brand"
                                              : "text-stone-500",
                                          )}
                                        >
                                          {step.label}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Flow-progression quick triggers - Ideal for 1-Screen flow */}
                              <div className="flex flex-wrap items-center gap-2 bg-stone-50 p-2.5 rounded-2xl border border-stone-200/80">
                                <span className="text-[10px] font-black uppercase text-stone-400 tracking-wider block mr-auto pl-1">
                                  Promote Candidate:
                                </span>

                                <div className="flex items-center gap-1.5">
                                  {/* Demote */}
                                  {curIdx > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const prevStatus =
                                          STATUS_FLOW[curIdx - 1];
                                        handleQuickStatusChange(
                                          activeApp,
                                          prevStatus,
                                        );
                                      }}
                                      className="px-3 py-1.5 bg-white hover:bg-stone-250 text-stone-700 hover:text-stone-900 rounded-xl border border-stone-250 text-xs font-black transition-all flex items-center gap-1 hover:-translate-y-0.5 shadow-sm active:translate-y-0 leading-none cursor-pointer"
                                      title={`Back to ${STATUS_FLOW[curIdx - 1]}`}
                                    >
                                      <ArrowLeft className="w-3.5 h-3.5" />
                                      <span>Demote</span>
                                    </button>
                                  )}

                                  {/* Advance */}
                                  {curIdx < 4 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextStatus =
                                          STATUS_FLOW[curIdx + 1];
                                        handleQuickStatusChange(
                                          activeApp,
                                          nextStatus,
                                        );
                                      }}
                                      className="px-3.5 py-1.5 bg-brand hover:bg-[#8e1d1c] text-white rounded-xl border-none text-xs font-black transition-all flex items-center gap-1 hover:-translate-y-0.5 shadow-md active:translate-y-0 leading-none cursor-pointer"
                                      title={`Advance to ${STATUS_FLOW[curIdx + 1]}`}
                                    >
                                      <span>Advance Stage</span>
                                      <ArrowRight className="w-3.5 h-3.5 font-bold" />
                                    </button>
                                  )}

                                  {/* Reject / Sift Out toggle button */}
                                  {activeApp.status !== "REJECTED" ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleQuickStatusChange(
                                          activeApp,
                                          "REJECTED",
                                        )
                                      }
                                      className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-black transition-all flex items-center gap-1 hover:-translate-y-0.5 shadow-sm cursor-pointer"
                                    >
                                      <UserMinus className="w-3.5 h-3.5" />
                                      <span>Reject</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleQuickStatusChange(
                                          activeApp,
                                          "APPLIED",
                                        )
                                      }
                                      className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-250 text-emerald-800 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                                    >
                                      <Users className="w-3.5 h-3.5" />
                                      <span>Reactivate</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Detailed Score card & Saving Notes Form */}
                            <div className="border-t border-stone-200 pt-4 space-y-3">
                              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block font-bold">
                                Dossier Valuation & Evaluation logs
                              </span>

                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  handleSaveAppReview(e);
                                }}
                                className="space-y-4"
                              >
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="space-y-1.5 flex flex-col">
                                    <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-1">
                                      Stage Milestones Selector
                                    </label>
                                    <select
                                      value={reviewStatus}
                                      onChange={(e) =>
                                        setReviewStatus(e.target.value as any)
                                      }
                                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-black text-stone-800 focus:border-stone-400 focus:outline-none cursor-pointer"
                                    >
                                      <option value="APPLIED">
                                        APPLIED / SOURCED
                                      </option>
                                      <option value="SCREENING">
                                        SCREENING / EVALUATION
                                      </option>
                                      <option value="INTERVIEW">
                                        SCHEDULED INTERVIEW
                                      </option>
                                      <option value="OFFER_MADE">
                                        PROPOSAL CONTRACT SENT
                                      </option>
                                      <option value="ACCEPTED">
                                        ACCEPTED / STAFF ONBOARDED
                                      </option>
                                      <option value="REJECTED">
                                        PASSED OVER / ARCHIVED
                                      </option>
                                    </select>
                                  </div>
                                  <div className="space-y-1.5 flex flex-col">
                                    <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block ml-1">
                                      Aprovals & Interviewer Feedback
                                    </label>
                                    <textarea
                                      rows={1}
                                      placeholder="Add notes, candidate background screening, reference check..."
                                      value={reviewNotes}
                                      onChange={(e) =>
                                        setReviewNotes(e.target.value)
                                      }
                                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-700 focus:border-stone-400 focus:outline-none resize-none"
                                    />
                                  </div>
                                </div>

                                <div className="flex justify-end pt-1">
                                  <button
                                    type="submit"
                                    className="px-5 py-2 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs hover:-translate-y-0.5"
                                  >
                                    Commit Assessment Data
                                  </button>
                                </div>
                              </form>
                            </div>

                            {/* AUTOMATIC COMMUNICATIONS templates portal */}
                            {(() => {
                              let subject = "";
                              let bodyTemplate = "";

                              if (reviewStatus === "INTERVIEW") {
                                subject = `Job Interview Invitation - fhtbs HR Recruitment: ${activeApp.name}`;
                                bodyTemplate = `Dear ${activeApp.name},\n\nThank you for applying for the ${activeApp.job_title} position at our company. Your profile is very impressive.\n\nWe would like to invite you to a Technical Panel Interview:\n- Date: [Fill Date]\n- Time: [Fill Time]\n- Platform: Google Meet\n\nPlease let us know if you are available to attend.\n\nWarm regards,\nHR Recruitment fhtbs ERP`;
                              } else if (reviewStatus === "OFFER_MADE") {
                                subject = `Employment Agreement Offer - ${activeApp.job_title}: ${activeApp.name}`;
                                bodyTemplate = `Dear ${activeApp.name},\n\nCongratulations! Based on the evaluation results, we are pleased to extend a Job Offer for the ${activeApp.job_title} position.\n\nWe offer a comprehensive compensation package including operational allowances. The terms and detailed employment contract attachments can be downloaded in the portal dashboard.\n\nPlease respond by [Deadline Date].\n\nBest regards,\nHuman Resources Directorate fhtbs ERP`;
                              } else if (reviewStatus === "REJECTED") {
                                subject = `Job Application Update - fhtbs Recruitment: ${activeApp.name}`;
                                bodyTemplate = `Dear ${activeApp.name},\n\nThank you for your time and interest in applying for the ${activeApp.job_title} position at our company.\n\nAfter careful consideration, we have decided to move forward with another candidate whose qualifications align more closely with our current operational needs.\n\nWe will keep your profile in our talent pool for future opportunities.\n\nWe wish you the best of luck in your career journey.\n\nBest regards,\nHR fhtbs ERP`;
                              } else if (reviewStatus === "ACCEPTED") {
                                subject = `Welcome to fhtbs ERP! Onboarding Checklist: ${activeApp.name}`;
                                bodyTemplate = `Dear ${activeApp.name},\n\nWelcome to our team! Starting your first day, please complete your personal data documents in the Staff Service Center.\n\nFirst Day Onboarding Schedule:\n- Time: Starts 08:00 WIB\n- Location: Head Office fhtbs ERP\n\nWish you all the best in your new journey!\n\nBest regards,\nHR Operations`;
                              }

                              if (!bodyTemplate) return null;

                              return (
                                <div className="bg-amber-50/40 rounded-2xl border border-amber-200/60 p-4 space-y-2 animate-in fade-in duration-300">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-xs font-black text-amber-800">
                                      <Mail className="w-4 h-4 text-amber-600" />
                                      <span>
                                        Candidate Communication Automatic Mail
                                        Template Draft
                                      </span>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const success = await copyToClipboard(
                                          `Subyek: ${subject}\n\n${bodyTemplate}`,
                                        );
                                        if (success) {
                                          showToast("Communication template copied to clipboard!", "success");
                                        } else {
                                          showToast("Failed to copy", "error");
                                        }
                                      }}
                                      className="text-[10px] font-black uppercase text-amber-950 bg-amber-100 hover:bg-amber-250 px-3 py-1 bg-amber-200 border-none rounded-lg transition-colors cursor-pointer"
                                    >
                                      Copy Draft Email
                                    </button>
                                  </div>

                                  <div className="bg-white/85 p-3 rounded-xl border border-amber-100 text-[11px] font-mono whitespace-pre-wrap leading-relaxed max-h-[120px] overflow-y-auto text-stone-700">
                                    <strong>Subject:</strong> {subject}
                                    <br />
                                    <br />
                                    {bodyTemplate}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* 3. TAB: APPRAISAL KPI SCORECARDS */}
              {adminTab === "KPI" && (
                <div className="mt-8">
                  {filteredKpis.length === 0 ? (
                    <div className="col-span-full py-20 text-center bg-white/50 rounded-[40px] border border-white">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                        <Award className="w-8 h-8" />
                      </div>
                      <p className="text-slate-500 font-medium">
                        No performance reviews recorded yet.
                      </p>
                      <p className="text-xs mt-1 text-slate-400 font-normal">
                        Assess and score standard personnel performance with
                        overall KPI matrixes.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {filteredKpis.map((k) => (
                        <div
                          key={k.id}
                          className="bg-white/80 backdrop-blur-md rounded-[40px] border border-white p-6 md:p-8 shadow-sm flex flex-col lg:flex-row gap-8 items-center transition-all hover:shadow-md"
                        >
                          {/* Summary Gauge Left */}
                          <div className="w-full lg:w-[280px] flex flex-col justify-center items-center p-6 bg-gradient-to-b from-slate-50 to-white rounded-[32px] border border-slate-100 text-center shadow-inner relative overflow-hidden">
                            <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-100 rounded-full blur-2xl opacity-60 pointer-events-none" />
                            <span className="px-3 py-1 rounded-full bg-white shadow-sm border border-slate-100 text-[10px] font-bold text-violet-500 uppercase tracking-widest">
                              {k.period_name}
                            </span>
                            <div className="mt-4 mb-1">
                              <h4 className="text-xl font-bold text-slate-800 leading-tight">
                                {k.employee_name}
                              </h4>
                              <p className="text-sm text-slate-400 font-medium font-mono mt-1">
                                @{k.employee_username}
                              </p>
                            </div>

                            <div className="my-6 relative flex items-center justify-center">
                              <span
                                className={`text-[56px] leading-[1] font-black tracking-tight ${
                                  k.overall_score >= 85
                                    ? "text-emerald-500"
                                    : k.overall_score >= 70
                                      ? "text-amber-500"
                                      : "text-rose-500"
                                }`}
                              >
                                {k.overall_score}
                              </span>
                            </div>

                            <span
                              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider ${
                                k.overall_score >= 85
                                  ? "bg-emerald-100 text-emerald-700"
                                  : k.overall_score >= 70
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-rose-100 text-rose-700"
                              }`}
                            >
                              {k.overall_score >= 85
                                ? "Top Talent"
                                : k.overall_score >= 70
                                  ? "Consistent"
                                  : "Needs Help"}
                            </span>
                          </div>

                          {/* Scores detail Right */}
                          <div className="flex-1 flex flex-col justify-between w-full h-full">
                            <div>
                              <h4 className="text-sm font-bold text-slate-700 mb-4 px-2">
                                Performance Breakdown
                              </h4>
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                                {[
                                  {
                                    label: "Comms",
                                    score: k.score_communication,
                                    color: "bg-sky-500",
                                    bg: "bg-sky-50",
                                  },
                                  {
                                    label: "Productivity",
                                    score: k.score_productivity,
                                    color: "bg-emerald-500",
                                    bg: "bg-emerald-50",
                                  },
                                  {
                                    label: "Reliability",
                                    score: k.score_reliability,
                                    color: "bg-violet-500",
                                    bg: "bg-violet-50",
                                  },
                                  {
                                    label: "Leadership",
                                    score: k.score_leadership,
                                    color: "bg-amber-500",
                                    bg: "bg-amber-50",
                                  },
                                  {
                                    label: "Technical",
                                    score: k.score_technical,
                                    color: "bg-rose-500",
                                    bg: "bg-rose-50",
                                  },
                                ].map((metric, idx) => (
                                  <div
                                    key={idx}
                                    className={`${metric.bg} p-4 rounded-3xl border border-white shadow-sm flex flex-col justify-center items-center text-center`}
                                  >
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                      {metric.label}
                                    </span>
                                    <p className="text-xl font-black text-slate-800 mt-1 mb-2">
                                      {metric.score}
                                    </p>
                                    <div className="w-full bg-white h-2 rounded-full overflow-hidden shadow-inner">
                                      <div
                                        className={`${metric.color} h-2 rounded-full`}
                                        style={{ width: `${metric.score}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="bg-slate-50/80 p-5 rounded-3xl border border-slate-100">
                              <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <span>📝</span> Evaluator Comments
                              </h5>
                              <p className="text-sm text-slate-700 leading-relaxed font-medium">
                                "
                                {k.evaluation_notes ||
                                  "No additional comments."}
                                "
                              </p>
                              <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-3">
                                <p className="text-[11px] text-slate-400 font-bold">
                                  Evaluator:{" "}
                                  <span className="text-slate-600">
                                    {k.evaluator_name || k.evaluator_username}
                                  </span>
                                </p>
                                <p className="text-[11px] text-slate-400 font-bold">
                                  {new Date(k.created_at).toLocaleDateString(
                                    "en-US",
                                    { timeZone: "Asia/Jakarta" },
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. TAB: RESIGNATION TRANSITIONS HANDOVER */}
              {adminTab === "HANDOVER" && (
                <div>
                  {filteredHandovers.length === 0 ? (
                    <div className="bg-white py-16 text-center border rounded-2xl text-stone-400">
                      <Repeat className="h-10 w-10 mx-auto opacity-30 mb-2" />
                      <p className="text-sm font-medium">
                        No active resignation hand-overs registered.
                      </p>
                      <p className="text-xs mt-1 font-normal">
                        Initiate track sheets to pass tasks / keys from
                        resigning to new personnel easily.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {filteredHandovers.map((ho) => {
                        let checklist: HandoverItem[] = [];
                        try {
                          checklist = JSON.parse(ho.checklist_json);
                        } catch (e) {
                          checklist = [];
                        }

                        const totalCount = checklist.length;
                        const completedCount = checklist.filter(
                          (item) => item.status === "COMPLETED",
                        ).length;
                        const progressPct =
                          totalCount > 0
                            ? Math.round((completedCount / totalCount) * 100)
                            : 0;

                        return (
                          <div
                            key={ho.id}
                            className="bg-white/80 backdrop-blur-md rounded-[32px] border border-white p-6 shadow-sm flex flex-col justify-between transition-all hover:translate-y-[-2px] hover:shadow-lg"
                          >
                            <div>
                              <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold border-2 border-white shadow-sm z-10 relative">
                                    {ho.resigning_name
                                      ?.substring(0, 1)
                                      .toUpperCase() || "L"}
                                  </div>
                                  <div className="w-8 h-0.5 bg-slate-200 -ml-4 -mr-4 relative z-0">
                                    <div
                                      className="absolute inset-0 bg-gradient-to-r from-rose-400 to-emerald-400"
                                      style={{ width: `${progressPct}%` }}
                                    />
                                  </div>
                                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold border-2 border-white shadow-sm z-10 relative">
                                    {ho.successor_name
                                      ?.substring(0, 1)
                                      .toUpperCase() || "N"}
                                  </div>
                                </div>

                                <span
                                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm ${
                                    ho.status === "COMPLETED"
                                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                      : ho.status === "IN_PROGRESS"
                                        ? "bg-sky-100 text-sky-700 border-sky-200"
                                        : "bg-amber-100 text-amber-700 border-amber-200"
                                  }`}
                                >
                                  {ho.status}
                                </span>
                              </div>

                              {/* Resigning -> Successor Flow card */}
                              <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50 shadow-inner">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                    Leaving
                                  </p>
                                  <p className="font-bold text-slate-800 line-clamp-1">
                                    {ho.resigning_name}
                                  </p>
                                  <p className="text-[10px] font-medium text-slate-500">
                                    @{ho.resigning_username}
                                  </p>
                                </div>
                                <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50 shadow-inner">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                    Successor
                                  </p>
                                  <p className="font-bold text-slate-800 line-clamp-1">
                                    {ho.successor_name}
                                  </p>
                                  <p className="text-[10px] font-medium text-slate-500">
                                    @{ho.successor_username}
                                  </p>
                                </div>
                              </div>

                              <div className="mb-6 bg-violet-50/50 p-4 rounded-3xl border border-violet-100/50">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-xs font-bold text-violet-800 uppercase tracking-widest">
                                    Handover Checklists
                                  </span>
                                  <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded-full text-violet-600 shadow-sm">
                                    {progressPct}% DONE
                                  </span>
                                </div>
                                <div className="w-full bg-white h-2 rounded-full overflow-hidden mb-4 shadow-inner border border-slate-100/50">
                                  <div
                                    className="bg-gradient-to-r from-violet-400 to-fuchsia-400 h-full transition-all duration-500"
                                    style={{ width: `${progressPct}%` }}
                                  />
                                </div>

                                {/* Checklist details */}
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-1 mt-4">
                                  {checklist.map((item) => (
                                    <button
                                      type="button"
                                      key={item.id}
                                      onClick={() =>
                                        handleToggleHandoverItem(ho, item.id)
                                      }
                                      className={`flex items-center text-left w-full focus:outline-none p-2.5 rounded-xl border shadow-sm transition-all ${
                                        item.status === "COMPLETED"
                                          ? "bg-white border-white grayscale opacity-50"
                                          : "bg-white border-violet-100 hover:border-violet-300"
                                      }`}
                                    >
                                      <div
                                        className={`mr-3 shrink-0 flex items-center justify-center w-5 h-5 rounded border ${item.status === "COMPLETED" ? "bg-emerald-500 border-emerald-500 text-white" : "bg-slate-50 border-slate-300"}`}
                                      >
                                        {item.status === "COMPLETED" && (
                                          <CheckSquare className="w-3.5 h-3.5" />
                                        )}
                                      </div>
                                      <span
                                        className={`text-xs font-medium ${item.status === "COMPLETED" ? "text-slate-500 line-through" : "text-slate-700"}`}
                                      >
                                        {item.title}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {ho.handover_notes && (
                                <div className="bg-amber-50/50 p-3 rounded-2xl border border-amber-100/50">
                                  <p className="text-[11px] text-slate-600 leading-relaxed">
                                    <span className="font-bold text-amber-600 uppercase tracking-widest text-[9px] block mb-1">
                                      Notes
                                    </span>{" "}
                                    {ho.handover_notes}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="flex justify-between items-center pt-4 border-t border-slate-100 text-[11px] font-medium text-slate-400 mt-4">
                              <div>
                                Target:{" "}
                                <span className="text-slate-600 font-bold">
                                  {ho.target_last_date}
                                </span>
                              </div>
                              <div>Creator: {user?.username}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 5. TAB: HR SETTINGS (CMS & Privasi) */}
              {adminTab === "SETTINGS" && (
                <div className="space-y-6">
                  <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-stone-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 text-stone-100 pointer-events-none">
                      <Globe className="w-40 h-40" />
                    </div>
                    <h3 className="text-xl font-black text-stone-900 mb-2 relative z-10">
                      Headless CMS - Portal Karir
                    </h3>
                    <p className="text-sm text-stone-500 mb-6 relative z-10">
                      Perbarui konten utama yang ditampilkan pada halaman portal
                      publik.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block mb-2">
                            Pesan Panggilan (Hero Title)
                          </label>
                          <input
                            type="text"
                            value={cmsHeroTitle}
                            onChange={(e) => setCmsHeroTitle(e.target.value)}
                            placeholder="Membangun Masa Depan Bersama"
                            className="w-full bg-stone-50 border border-stone-200 p-4 rounded-xl text-sm font-bold focus:outline-none focus:border-red-200"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block mb-2">
                            Subjudul Panggilan (Hero Subtitle)
                          </label>
                          <textarea
                            rows={3}
                            value={cmsHeroSubtitle}
                            onChange={(e) => setCmsHeroSubtitle(e.target.value)}
                            placeholder="Kami percaya bahwa kekuatan kami..."
                            className="w-full bg-stone-50 border border-stone-200 p-4 rounded-xl text-sm font-medium focus:outline-none focus:border-red-200 resize-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest block mb-2">
                            Benefits (Satu per baris)
                          </label>
                          <textarea
                            rows={7}
                            value={cmsBenefits}
                            onChange={(e) => setCmsBenefits(e.target.value)}
                            placeholder="- Competitive Compensation&#10;- Health Insurance (BPJS)&#10;- Operational Transport"
                            className="w-full bg-stone-50 border border-stone-200 p-4 rounded-xl text-sm font-medium focus:outline-none focus:border-red-200 resize-none"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex justify-end relative z-10">
                      <button
                        onClick={saveCms}
                        disabled={isSavingCms}
                        className="bg-brand hover:bg-brand-dark text-white px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest shadow-md transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isSavingCms ? "Saving..." : "Save CMS Changes"}
                      </button>
                    </div>
                  </div>

                  <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-red-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 text-red-50 pointer-events-none">
                      <Shield className="w-40 h-40" />
                    </div>
                    <h3 className="text-xl font-black text-red-900 mb-2 relative z-10">
                      Sweeper Engine (Data Privacy)
                    </h3>
                    <p className="text-sm text-stone-600 mb-6 max-w-2xl relative z-10">
                      Bulk deletion and anonymization (redaction) of personal candidate data whose status is <b>REJECTED</b> and application documents are older than <b>6 months</b>. Complies with GDPR and Applicant Privacy Management Standards.
                    </p>
                    <div className="relative z-10">
                      <button
                        onClick={handleSweepData}
                        disabled={isSweeping}
                        className="bg-red-600 text-white px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest shadow-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        {isSweeping
                          ? "Processing Legacy Data..."
                          : "Purge External Legacy Documents"}
                      </button>
                    </div>
                  </div>

                  <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-orange-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 text-orange-50 pointer-events-none">
                      <Trash2 className="w-40 h-40" />
                    </div>
                    <h3 className="text-xl font-black text-orange-900 mb-2 relative z-10">
                      Factory Data Reset - HRIS & HR Portal
                    </h3>
                    <p className="text-sm text-stone-600 mb-6 max-w-2xl relative z-10">
                      Reset all data in the HRIS module back to initial factory settings. This action will erase all attendance logs, leave claims, payslips, KPI appraisals, incoming applications, job postings, and restore default initial demo data instantly.
                    </p>
                    <div className="relative z-10">
                      <button
                        onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: "Factory Reset HRIS",
                            message: "CRITICAL WARNING: Are you sure you want to reset all HRIS data and Human Resource portal back to factory defaults? This action is permanent and cannot be undone.",
                            isDestructive: true,
                            action: async () => {
                              setIsResettingHris(true);
                              apiFetch(
                                "/api/admin/reset-hris",
                                { method: "POST" },
                                user?.username,
                              )
                                .then((res) => {
                                  if (res.ok) {
                                    showToast(
                                      "HRIS data successfully reset to factory default.",
                                      "success",
                                    );
                                    setTimeout(
                                      () => window.location.reload(),
                                      1500,
                                    );
                                  } else {
                                    showToast(
                                      res.error || "Failed to reset HRIS data.",
                                      "error",
                                    );
                                  }
                                })
                                .catch(() =>
                                  showToast(
                                    "Failed to reach server for reset.",
                                    "error",
                                  ),
                                )
                                .finally(() => {
                                  setIsResettingHris(false);
                                  setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                                });
                            }
                          });
                        }}
                        disabled={isResettingHris}
                        className="bg-orange-600 text-white px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest shadow-md hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        {isResettingHris ? "Reset..." : "Reset"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 6. TAB: EVENT & 3D MASCOT CUSTOMIZATION */}
              {adminTab === "EVENT" && (
                <EventManagement />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ==================================================== */}
      {/* 1. MODAL: CREATE / EDIT VACANCIES */}
      {/* ==================================================== */}
      <JobVacancyModal
        isOpen={isJobModalOpen}
        onClose={() => setIsJobModalOpen(false)}
        selectedJob={selectedJob}
        handleSaveJob={handleSaveJob}
        jobTitle={jobTitle}
        setJobTitle={setJobTitle}
        jobDept={jobDept}
        setJobDept={setJobDept}
        jobLoc={jobLoc}
        setJobLoc={setJobLoc}
        jobType={jobType}
        setJobType={setJobType}
        jobSalary={jobSalary}
        setJobSalary={setJobSalary}
        jobDesc={jobDesc}
        setJobDesc={setJobDesc}
        jobReqs={jobReqs}
        setJobReqs={setJobReqs}
        jobBens={jobBens}
        setJobBens={setJobBens}
      />

      {/* ==================================================== */}
      {/* 2. MODAL: EVALUATE CANDIDATE APPLICATION */}
      {/* ==================================================== */}
      <CandidateEvaluationModal
        isOpen={!!selectedApp && adminTab !== "CANDIDATES"}
        onClose={() => setSelectedApp(null)}
        selectedApp={selectedApp}
        reviewStatus={reviewStatus}
        setReviewStatus={setReviewStatus}
        reviewNotes={reviewNotes}
        setReviewNotes={setReviewNotes}
        handleSaveAppReview={handleSaveAppReview}
      />

      {/* ==================================================== */}
      {/* 3. MODAL: KPI PERFORMANCE ASSESSMENTS */}
      {/* ==================================================== */}
      <KpiAppraisalModal
        isOpen={isKpiModalOpen}
        onClose={() => setIsKpiModalOpen(false)}
        handleSubmitKpi={handleSubmitKpi}
        kpiEmployee={kpiEmployee}
        setKpiEmployee={setKpiEmployee}
        users={users}
        kpiPeriod={kpiPeriod}
        setKpiPeriod={setKpiPeriod}
        scComm={scComm}
        setScComm={setScComm}
        scProd={scProd}
        setScProd={setScProd}
        scRel={scRel}
        setScRel={setScRel}
        scLead={scLead}
        setScLead={setScLead}
        scTech={scTech}
        setScTech={setScTech}
        kpiNotes={kpiNotes}
        setKpiNotes={setKpiNotes}
      />

      {/* ==================================================== */}
      {/* 4. MODAL: CREATE HANDOVER TRANSIT SHEET */}
      {/* ==================================================== */}
      <HandoverModal
        isOpen={isHandoverModalOpen}
        onClose={() => setIsHandoverModalOpen(false)}
        handleSubmitHandover={handleSubmitHandover}
        hoResigning={hoResigning}
        setHoResigning={setHoResigning}
        users={users}
        hoSuccessor={hoSuccessor}
        setHoSuccessor={setHoSuccessor}
        hoDate={hoDate}
        setHoDate={setHoDate}
        hoItemsText={hoItemsText}
        setHoItemsText={setHoItemsText}
        hoNotes={hoNotes}
        setHoNotes={setHoNotes}
      />

      {/* ==================================================== */}
      {/* 4.5. MODAL: PAYROLL REQUISITION (PRq) BUILDER MATRIX */}
      {/* ==================================================== */}
      <PayrollRequisitionModal
        isOpen={isPrqModalOpen}
        onClose={() => setIsPrqModalOpen(false)}
        prqEditingId={prqEditingId}
        prqDetails={prqDetails}
        prqMonth={prqMonth}
        prqYear={prqYear}
        isPreparingPrq={isPreparingPrq}
        users={users}
        handleUpdatePrqItem={handleUpdatePrqItem}
        prqNotes={prqNotes}
        setPrqNotes={setPrqNotes}
        isSavingPrq={isSavingPrq}
        handleSavePayrollRequisition={handleSavePayrollRequisition}
        handleRequestSubmitPrq={handleRequestSubmitPrq}
      />

      {/* ==================================================== */}
      {/* 4.6. MODAL: VIEW PRq DETAILS */}
      {/* ==================================================== */}
      <PrqViewModal
        isOpen={isPrqViewModalOpen}
        onClose={() => setIsPrqViewModalOpen(false)}
        selectedPrqView={selectedPrqView}
        handleOpenCancelPrqModal={handleOpenCancelPrqModal}
        handleOpenDeletePrqModal={handleOpenDeletePrqModal}
      />

      {/* ==================================================== */}
      {/* 4.7. MODAL: PRQ CONFIRMATION & CANCEL DIALOG */}
      {/* ==================================================== */}
      <PrqConfirmModal
        prqConfirmModal={prqConfirmModal}
        setPrqConfirmModal={setPrqConfirmModal}
        dailyAuthKey={getDailyAuthKey(user?.username)}
        handleSavePayrollRequisition={handleSavePayrollRequisition}
        isSavingPrq={isSavingPrq}
        handleExecuteCancelPrq={handleExecuteCancelPrq}
        handleExecuteDeletePrq={handleExecuteDeletePrq}
      />

      {/* ==================================================== */}
      {/* 5. MODAL: PAYROLL GENERATOR */}
      {/* ==================================================== */}
      <GeneratePayslipModal
        isOpen={isPayslipModalOpen}
        onClose={() => setIsPayslipModalOpen(false)}
        handleCreatePayslip={handleCreatePayslip}
        users={users}
        payslipEmployee={payslipEmployee}
        setPayslipEmployee={setPayslipEmployee}
        apiFetch={apiFetch}
        user={user}
        setPayslipBasic={setPayslipBasic}
        setPayslipAllowances={setPayslipAllowances}
        setPayslipDeductions={setPayslipDeductions}
        payslipMonth={payslipMonth}
        setPayslipMonth={setPayslipMonth}
        payslipBasic={payslipBasic}
        payslipAllowances={payslipAllowances}
        payslipDeductions={payslipDeductions}
        isSubmittingPayslip={isSubmittingPayslip}
      />

      {/* Modal Confirm */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
