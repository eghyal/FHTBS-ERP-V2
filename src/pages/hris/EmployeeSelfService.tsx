import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { Loader } from "@/components/shared/Loader";
import { Modal } from "@/components/ui/Modal";
import { LeaveRequestModal } from "@/components/hris/ess/LeaveRequestModal";
import { PayslipModal } from "@/components/hris/ess/PayslipModal";
import {
  Clock,
  CalendarDays,
  ReceiptText,
  Plus,
  CheckCircle2,
  X,
  ArrowRight,
  AlertCircle,
  Download,
  UserCheck,
  Sliders,
  FileText,
  Briefcase,
  DollarSign,
  User,
  Coffee,
  Check,
  MapPin,
  HelpCircle,
  TrendingUp,
  Printer,
  ChevronRight,
  ShieldCheck,
  CheckSquare,
  MessageSquare,
  Eye,
  IdCard,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hasGodMode } from "@/utils/pbac";

export default function EmployeeSelfService() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<
    "ATTENDANCE" | "LEAVE" | "PAYSLIP"
  >("ATTENDANCE");
  const [isLoading, setIsLoading] = useState(true);

  const [attendances, setAttendances] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);

  // Manager state
  const isManager =
    user?.level === "MANAGER" ||
    user?.role === "HR" ||
    user?.role === "FC" ||
    hasGodMode(user);
  const [managerViewMode, setManagerViewMode] = useState<
    "PERSONAL" | "TEAM_APPROVALS"
  >("PERSONAL");
  const [managerNoteMap, setManagerNoteMap] = useState<Record<string, string>>(
    {},
  );

  const [currentLiveTime, setCurrentLiveTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentLiveTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatLiveTimeStr = (d: Date) => {
    try {
      return d.toLocaleTimeString("en-US", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch (e) {
      return d.toLocaleTimeString();
    }
  };

  // Modals state
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<any | null>(null);

  // Leave request forms state
  const [leaveType, setLeaveType] = useState("Annual Paid Leave");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [isClocking, setIsClocking] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);

  // Return formatted current Jakarta time
  const getTodayDateStr = () => {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = formatter.formatToParts(new Date());
      const year = parts.find((p) => p.type === "year")?.value;
      const month = parts.find((p) => p.type === "month")?.value;
      const day = parts.find((p) => p.type === "day")?.value;
      return `${year}-${month}-${day}`;
    } catch (e) {
      const todayStr = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Jakarta",
      });
      const dt = new Date(todayStr);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  };

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      // Parallel fetches from live ERP backend endpoints
      const [attendancesRes, leavesRes, payslipsRes] = await Promise.all([
        apiFetch("/api/hr/attendances", {}, user?.username),
        apiFetch("/api/hr/leaves", {}, user?.username),
        apiFetch("/api/hr/payslips", {}, user?.username),
      ]);

      if (attendancesRes.ok) {
        setAttendances(
          Array.isArray(attendancesRes.data) ? attendancesRes.data : [],
        );
      }
      if (leavesRes.ok) {
        setLeaves(Array.isArray(leavesRes.data) ? leavesRes.data : []);
      }
      if (payslipsRes.ok) {
        setPayslips(Array.isArray(payslipsRes.data) ? payslipsRes.data : []);
      }
    } catch (e) {
      console.error("Error loading self service data:", e);
      showToast("Failed to load staff self service data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.username) {
      fetchAllData();
    }
  }, [user]);

  if (!user) return null;

  // Filter records specifically for active logged-in employee username
  const myAttendances = React.useMemo(() => {
    return attendances.filter((a) => a.employee_username === user.username);
  }, [attendances, user.username]);

  const myLeaves = React.useMemo(() => {
    return leaves.filter((l) => l.employee_username === user.username);
  }, [leaves, user.username]);

  const myPayslips = React.useMemo(() => {
    return payslips.filter((p) => p.employee_username === user.username);
  }, [payslips, user.username]);

  // Determine current daily attendance clock status
  const todayDateStr = React.useMemo(() => getTodayDateStr(), []);
  
  const todayLog = React.useMemo(() => {
    return myAttendances.find((a) => a.date === todayDateStr);
  }, [myAttendances, todayDateStr]);
  
  const hasClockIn = !!todayLog;
  const hasClockOut = !!(todayLog && todayLog.clock_out);

  // Format Helper definitions
  const formatLocalDate = React.useCallback((isoOrString: string) => {
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
  }, []);

  const formatLocalTime = React.useCallback((isoOrString: string) => {
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
  }, []);

  const formatRupiah = React.useCallback((val: any) => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);
  }, []);

  // Clock In / Clock Out Action Handlers
  const handleClockInOut = async () => {
    if (isClocking) return;
    if (hasClockIn && hasClockOut) {
      showToast(
        "You have already completed your attendance (In & Out) today.",
        "info",
      );
      return;
    }

    setIsClocking(true);
    try {
      showToast("Requesting GPS location...", "info");
      let location = null;
      if (navigator.geolocation) {
        try {
          location = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) =>
                resolve(`${pos.coords.latitude},${pos.coords.longitude}`),
              (err) => resolve(null), // resolve null if err
              { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
            );
          });
        } catch (e) {}
      }

      if (!location) {
        showToast("Warning: Failed to obtain GPS location.", "error");
      }

      const clientTimeStr = new Date().toISOString();
      if (!hasClockIn) {
        // Clocking In
        const res = await apiFetch(
          "/api/hr/attendances/clock-in",
          {
            method: "POST",
            body: JSON.stringify({
              employee_username: user.username,
              clientTime: clientTimeStr,
              location,
            }),
          },
          user.username,
        );

        if (res.ok) {
          showToast("Successfully registered Clock In!", "success");
          fetchAllData();
        } else {
          showToast(res.error || "Failed to perform Clock In", "error");
        }
      } else {
        // Clocking Out
        const res = await apiFetch(
          "/api/hr/attendances/clock-out",
          {
            method: "PUT",
            body: JSON.stringify({
              employee_username: user.username,
              clientTime: clientTimeStr,
              location,
            }),
          },
          user.username,
        );

        if (res.ok) {
          showToast("Successfully registered Clock Out!", "success");
          fetchAllData();
        } else {
          showToast(res.error || "Failed to perform Clock Out", "error");
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Connection failed with attendance server.", "error");
    } finally {
      setIsClocking(false);
    }
  };

  // Create new Leave Request
  const handleRequestLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      showToast("Leave start and end dates are required", "error");
      return;
    }

    setIsSubmittingLeave(true);
    try {
      const res = await apiFetch(
        "/api/hr/leaves",
        {
          method: "POST",
          body: JSON.stringify({
            employee_username: user.username,
            leave_type: leaveType,
            start_date: startDate,
            end_date: endDate,
          }),
        },
        user.username,
      );

      if (res.ok) {
        if ((res as any).auto_approved) {
          showToast(
            "Leave request auto-approved instantly (Manager / Executive Level Access).",
            "success",
          );
        } else {
          showToast(
            "Leave request submitted successfully and sent to relevant Manager for approval.",
            "success",
          );
        }
        setIsRequestModalOpen(false);
        setStartDate("");
        setEndDate("");
        fetchAllData();
      } else {
        showToast(res.error || "Failed to submit leave request", "error");
      }
    } catch (err) {
      console.error(err);
      showToast(
        "An error occurred while submitting the leave request",
        "error",
      );
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  // Computes active standard annual leaves used & left
  const totalApprovedDays = myLeaves
    .filter((l) => l.status === "APPROVED")
    .reduce((acc, current) => {
      const s = new Date(current.start_date);
      const e = new Date(current.end_date);
      const diffTime = Math.abs(e.getTime() - s.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return acc + diffDays;
    }, 0);

  const remainingLeaveQuota = Math.max(0, 12 - totalApprovedDays);

  // Manager action for staff leave approvals directly on ESS
  const handleManagerStatusUpdate = async (
    id: string,
    newStatus: "APPROVED" | "REJECTED",
  ) => {
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(id);
    try {
      const note = managerNoteMap[id] || "";
      const res = await apiFetch(
        `/api/hr/leaves/${id}/status`,
        {
          method: "PUT",
          body: JSON.stringify({ status: newStatus, manager_note: note }),
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
      showToast("Error updating leave status", "error");
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const pendingLeavesForManager = leaves.filter((l) => l.status === "PENDING");

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Page Header standardizing the visual styling */}
      <PageHeader
        title={
          isManager
            ? "Manager Self-Service Portal"
            : "Staff Self-Service Portal"
        }
        subtitle={
          isManager
            ? "Staff approvals, attendance, and leave requests"
            : "Attendance records, leave requests, and payslips"
        }
        icon={<IdCard className="w-5 h-5" />}
      />

      {/* Manager Control Indicator */}
      {isManager && (
        <div className="bg-white border border-stone-200/80 rounded-xl p-3.5 px-4 shadow-2xs flex items-center justify-between gap-3 text-stone-800">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-200 shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-brand" />
              Manager Access ({user.level})
            </span>
            <p className="text-xs text-stone-600 font-medium">
              Staff Leave Approvals:{" "}
              <span className="font-semibold text-stone-900">
                {pendingLeavesForManager.length} request(s)
              </span>{" "}
              pending review
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <Loader text="Retrieving fhtbs Staff Portal data..." />
      ) : (
        <div className="space-y-8">
          {/* Top Bento Dashboard Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Kehadiran Hari ini (Clocking state) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between group relative overflow-hidden">
              <div className="relative z-10">
                <span className="text-xs font-medium text-slate-400 block mb-1">
                  Today's Attendance Status
                </span>
                <h4 className="text-lg font-bold text-slate-900">
                  Attendance Registry
                </h4>

                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                    <span>Date: {formatLocalDate(todayDateStr)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <span
                      className={cn(
                        "w-2.5 h-2.5 rounded-full inline-block",
                        hasClockIn
                          ? "bg-emerald-500 animate-pulse"
                          : "bg-slate-300",
                      )}
                    />
                    <span>
                      Clock In:{" "}
                      {todayLog
                        ? formatLocalTime(todayLog.clock_in)
                        : "Not Logged"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <span
                      className={cn(
                        "w-2.5 h-2.5 rounded-full inline-block",
                        hasClockOut ? "bg-slate-800" : "bg-slate-200",
                      )}
                    />
                    <span>
                      Clock Out:{" "}
                      {todayLog && todayLog.clock_out
                        ? formatLocalTime(todayLog.clock_out)
                        : "Not Logged Out"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Live Time (UTC+7 / Jakarta)
                  </span>
                  <span className="text-base font-bold text-slate-900 font-mono tracking-tight mt-0.5">
                    {formatLiveTimeStr(currentLiveTime)}
                  </span>
                  <span className="text-[9px] font-medium text-emerald-600 uppercase tracking-wider mt-0.5">
                    Server Sync Active
                  </span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 relative z-10">
                <button
                  onClick={handleClockInOut}
                  disabled={isClocking || (hasClockIn && hasClockOut)}
                  className={cn(
                    "w-full py-2.5 px-4 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center justify-center gap-2",
                    !hasClockIn
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xs disabled:opacity-60"
                      : !hasClockOut
                        ? "bg-brand hover:bg-brand-dark text-white shadow-2xs disabled:opacity-60"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200",
                  )}
                >
                  {isClocking ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : !hasClockIn ? (
                    "Clock In Now"
                  ) : !hasClockOut ? (
                    "Clock Out Now"
                  ) : (
                    "Attendance Recorded ✓"
                  )}
                </button>
              </div>
            </div>

            {/* Sisa Kuota Cuti */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between group relative overflow-hidden">
              <div className="relative z-10">
                <span className="text-xs font-medium text-slate-400 block mb-1">
                  Annual Leave Entitlement
                </span>
                <h4 className="text-lg font-bold text-slate-900">
                  Remaining Leave Quota
                </h4>

                <div className="flex items-end gap-2.5 mt-4">
                  <span className="text-4xl font-bold text-emerald-600 font-mono">
                    {remainingLeaveQuota}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 pb-1">
                    Days Remaining / <span className="font-mono">12</span> Days
                  </span>
                </div>

                {totalApprovedDays > 0 && (
                  <p className="text-xs text-slate-500 font-medium mt-2.5">
                    You have taken{" "}
                    <span className="text-emerald-600 font-semibold">
                      {totalApprovedDays} days
                    </span>{" "}
                    of approved leave.
                  </p>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 relative z-10">
                <button
                  onClick={() => setIsRequestModalOpen(true)}
                  className="w-full py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-4 h-4 text-indigo-600" />
                  Apply for Leave
                </button>
              </div>
            </div>

            {/* Slip Gaji Terbaru */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between group relative overflow-hidden">
              <div className="relative z-10">
                <span className="text-xs font-medium text-slate-400 block mb-1">
                  Employee Remuneration
                </span>
                <h4 className="text-lg font-bold text-slate-900">
                  Latest Payslip
                </h4>

                {myPayslips.length > 0 ? (
                  <div className="mt-4">
                    <span className="inline-block px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded mb-2 border border-indigo-200/60">
                      Issued: {myPayslips[0].period_month}
                    </span>
                    <p className="text-xs font-medium text-slate-500">
                      Total Net Salary:
                    </p>
                    <p className="text-xl font-bold text-slate-900 font-mono mt-0.5">
                      {formatRupiah(myPayslips[0].net_salary)}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 py-3 text-slate-400 text-xs italic">
                    No payslip records uploaded by HR yet.
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-stone-100 relative z-10">
                {myPayslips.length > 0 ? (
                  <button
                    onClick={() => {
                      setSelectedPayslip(myPayslips[0]);
                    }}
                    className="w-full py-3 px-5 bg-brand hover:bg-brand-dark text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <ReceiptText className="w-4 h-4" />
                    View Payslip Details
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full py-3 px-5 bg-stone-50 text-stone-300 border border-stone-200 rounded-2xl text-xs font-bold uppercase tracking-widest cursor-not-allowed"
                  >
                    No Payslips Available
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Neutral ERP-style Document Tab selectors */}
          <div className="flex border-b border-stone-200 gap-1.5 overflow-x-auto pb-px">
            <button
              onClick={() => setActiveTab("ATTENDANCE")}
              className={cn(
                "px-5 py-3 text-xs tracking-wider font-black uppercase transition-all whitespace-nowrap border-b-2 flex items-center gap-2 cursor-pointer",
                activeTab === "ATTENDANCE"
                  ? "border-brand text-brand"
                  : "border-transparent text-stone-500 hover:text-stone-800",
              )}
            >
              <Clock className="w-4 h-4" /> Attendance Logs (
              {myAttendances.length})
            </button>
            <button
              onClick={() => setActiveTab("LEAVE")}
              className={cn(
                "px-5 py-3 text-xs tracking-wider font-black uppercase transition-all whitespace-nowrap border-b-2 flex items-center gap-2 cursor-pointer",
                activeTab === "LEAVE"
                  ? "border-brand text-brand"
                  : "border-transparent text-stone-500 hover:text-stone-800",
              )}
            >
              <CalendarDays className="w-4 h-4" /> Leave History (
              {myLeaves.length})
            </button>
            <button
              onClick={() => setActiveTab("PAYSLIP")}
              className={cn(
                "px-5 py-3 text-xs tracking-wider font-black uppercase transition-all whitespace-nowrap border-b-2 flex items-center gap-2 cursor-pointer",
                activeTab === "PAYSLIP"
                  ? "border-brand text-brand"
                  : "border-transparent text-stone-500 hover:text-stone-800",
              )}
            >
              <ReceiptText className="w-4 h-4" /> Monthly Payslips (
              {myPayslips.length})
            </button>
          </div>

          {/* TAB 1: ATTENDANCE LOGS */}
          {activeTab === "ATTENDANCE" && (
            <div className="space-y-6">
              <div className="bg-stone-50 border border-stone-200 px-6 py-4 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-sm font-black text-stone-800 uppercase tracking-widest">
                    Your Attendance Records
                  </h3>
                  <p className="text-[11px] text-stone-500 font-medium">
                    Complete daily clock-in and clock-out history recorded in
                    the database.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-stone-600 font-bold bg-white px-3 py-1.5 rounded-xl border border-stone-200/60 shadow-inner">
                  <span>Total Shifts: </span>
                  <span className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono text-stone-800 text-[10px]">
                    {myAttendances.length} Days
                  </span>
                </div>
              </div>

              {myAttendances.length === 0 ? (
                <div className="py-20 text-center bg-white rounded-[2.5rem] border border-stone-200 flex flex-col items-center justify-center">
                  <div className="w-14 h-14 bg-stone-50 rounded-full flex items-center justify-center mb-4 text-stone-300">
                    <Clock className="w-6 h-6" />
                  </div>
                  <p className="text-stone-700 font-extrabold text-sm">
                    No attendance logs found.
                  </p>
                  <p className="text-xs text-stone-400 mt-1">
                    Click the "Clock In" button to start recording your shift
                    today.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-stone-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                  <div className="overflow-x-auto font-bold">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-stone-50/85 border-b border-stone-200 font-black text-stone-500 uppercase tracking-widest select-none">
                          <th className="py-4 px-6 text-stone-500">Log ID</th>
                          <th className="py-4 px-6 text-stone-500">Date</th>
                          <th className="py-4 px-6 text-stone-500">Clock In</th>
                          <th className="py-4 px-6 text-stone-500">
                            Location In
                          </th>
                          <th className="py-4 px-6 text-stone-500">
                            Clock Out
                          </th>
                          <th className="py-4 px-6 text-stone-500">
                            Location Out
                          </th>
                          <th className="py-4 px-6 text-stone-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-150 text-stone-700">
                        {myAttendances.map((att) => (
                          <tr
                            key={att.id}
                            className="hover:bg-stone-50/50 transition-colors"
                          >
                            <td className="py-4 px-6 font-mono text-stone-500">
                              {att.id}
                            </td>
                            <td className="py-4 px-6 font-bold text-stone-900">
                              {formatLocalDate(att.date)}
                            </td>
                            <td className="py-4 px-6 font-mono text-emerald-600 font-extrabold">
                              {formatLocalTime(att.clock_in)}
                            </td>

                            <td className="py-4 px-6">
                              {att.clock_in_location ? (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${att.clock_in_location}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-blue-600 hover:underline"
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

                            <td className="py-4 px-6 font-mono">
                              {att.clock_out ? (
                                <span className="text-stone-600 font-bold">
                                  {formatLocalTime(att.clock_out)}
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 text-[9px] uppercase font-black tracking-widest border border-amber-200 rounded animate-pulse">
                                  In Progress
                                </span>
                              )}
                            </td>

                            <td className="py-4 px-6">
                              {att.clock_out_location ? (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${att.clock_out_location}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-blue-600 hover:underline"
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

                            <td className="py-4 px-6">
                              <span className="px-2 py-0.5 bg-stone-100 border border-stone-200 text-stone-500 rounded text-[9px] uppercase tracking-wide font-black">
                                {att.clock_out ? "Completed" : "On Duty"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LEAVE REQUESTS */}
          {activeTab === "LEAVE" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-stone-50 border border-stone-200 px-6 py-4 rounded-2xl gap-4">
                <div>
                  <h3 className="text-sm font-black text-stone-800 uppercase tracking-widest flex items-center gap-2">
                    Leave & Time-Off Management
                    {isManager && (
                      <span className="bg-brand text-white text-[9px] px-2 py-0.5 rounded uppercase tracking-wider font-extrabold shadow-2xs">
                        Manager Mode
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-stone-500 font-medium">
                    Track leave history, approval status, and manager
                    authorization notes.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {isManager && (
                    <div className="flex items-center bg-stone-200/70 p-1 rounded-xl">
                      <button
                        onClick={() => setManagerViewMode("PERSONAL")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                          managerViewMode === "PERSONAL"
                            ? "bg-white text-stone-900 shadow-sm"
                            : "text-stone-600 hover:text-stone-900",
                        )}
                      >
                        My Requests
                      </button>
                      <button
                        onClick={() => setManagerViewMode("TEAM_APPROVALS")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                          managerViewMode === "TEAM_APPROVALS"
                            ? "bg-brand text-white shadow-sm"
                            : "text-stone-600 hover:text-stone-900",
                        )}
                      >
                        <span>Team Approvals</span>
                        {pendingLeavesForManager.length > 0 && (
                          <span className="w-4 h-4 rounded-full bg-amber-500 text-stone-950 text-[10px] font-black flex items-center justify-center">
                            {pendingLeavesForManager.length}
                          </span>
                        )}
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setIsRequestModalOpen(true)}
                    className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Apply for Leave
                  </button>
                </div>
              </div>

              {/* MANAGER TEAM APPROVALS VIEW */}
              {isManager && managerViewMode === "TEAM_APPROVALS" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <h4 className="text-xs font-black uppercase tracking-widest text-stone-500">
                      Staff Submissions Awaiting Approval ({leaves.length})
                    </h4>
                  </div>

                  {leaves.length === 0 ? (
                    <div className="py-16 text-center bg-white rounded-[2.5rem] border border-stone-200">
                      <CheckSquare className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                      <p className="text-stone-800 font-bold text-sm">
                        All caught up!
                      </p>
                      <p className="text-stone-400 text-xs mt-1">
                        There are no staff leave requests pending review.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {leaves.map((lv: any) => {
                        const s = new Date(lv.start_date);
                        const e = new Date(lv.end_date);
                        let daysCount = 1;
                        try {
                          const diffTime = Math.abs(e.getTime() - s.getTime());
                          daysCount =
                            Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                        } catch (_) {}

                        return (
                          <div
                            key={lv.id}
                            className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-sm space-y-4"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 text-stone-800 font-black flex items-center justify-center text-sm shadow-2xs">
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
                                    <span className="font-extrabold text-stone-900 text-sm">
                                      {lv.employee_name || lv.employee_username}
                                    </span>
                                    <span className="text-xs text-stone-400 font-mono">
                                      @{lv.employee_username}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-stone-500 font-bold uppercase tracking-wider mt-0.5">
                                    <span className="bg-stone-100 text-stone-700 px-2 py-0.5 rounded">
                                      {lv.employee_role || "Staff"}
                                    </span>
                                    <span>
                                      • Level: {lv.employee_level || "STAFF"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                    lv.status === "APPROVED"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : lv.status === "REJECTED"
                                        ? "bg-rose-50 text-rose-700 border-rose-200"
                                        : "bg-amber-50 text-amber-700 border-amber-200",
                                  )}
                                >
                                  {lv.status || "PENDING"}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              <div>
                                <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block mb-1">
                                  Request Details
                                </span>
                                <p className="font-bold text-stone-800">
                                  {lv.leave_type}
                                </p>
                                <p className="text-stone-600 mt-0.5">
                                  {formatLocalDate(lv.start_date)} -{" "}
                                  {formatLocalDate(lv.end_date)} ({daysCount}{" "}
                                  Working Days)
                                </p>

                              </div>

                              <div>
                                <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block mb-1">
                                  Manager Notes (Feedback)
                                </span>
                                {lv.status === "PENDING" ? (
                                  <textarea
                                    rows={2}
                                    placeholder="Enter manager notes (e.g. Approved, duties handed over to...)"
                                    value={managerNoteMap[lv.id] || ""}
                                    onChange={(e) =>
                                      setManagerNoteMap((prev) => ({
                                        ...prev,
                                        [lv.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-800 outline-none focus:ring-2 focus:ring-stone-400"
                                  />
                                ) : (
                                  <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 text-stone-700 font-medium">
                                    {lv.manager_note || (
                                      <span className="text-stone-400 italic">
                                        No manager notes provided.
                                      </span>
                                    )}
                                    {lv.approver_name && (
                                      <p className="text-[10px] text-stone-400 mt-1 font-bold">
                                        Authorizer: {lv.approver_name}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {lv.status === "PENDING" && (
                              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                                <button
                                  type="button"
                                  disabled={isUpdatingStatus === lv.id}
                                  onClick={() =>
                                    handleManagerStatusUpdate(lv.id, "REJECTED")
                                  }
                                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50"
                                >
                                  {isUpdatingStatus === lv.id ? "Processing..." : "Reject Request"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isUpdatingStatus === lv.id}
                                  onClick={() =>
                                    handleManagerStatusUpdate(lv.id, "APPROVED")
                                  }
                                  className="px-4 py-2 bg-brand hover:bg-[#8e1d1c] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50"
                                >
                                  {isUpdatingStatus === lv.id ? "Processing..." : "Approve Request"}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : /* PERSONAL LEAVE REQUESTS LIST */
              myLeaves.length === 0 ? (
                <div className="py-20 text-center bg-white rounded-[2.5rem] border border-stone-200 flex flex-col items-center justify-center">
                  <div className="w-14 h-14 bg-stone-50 rounded-full flex items-center justify-center mb-4 text-stone-300">
                    <CalendarDays className="w-6 h-6" />
                  </div>
                  <p className="text-stone-700 font-extrabold text-sm">
                    No leave history found.
                  </p>
                  <p className="text-xs text-stone-400 mt-1">
                    Submit a leave request when you plan to be away.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-stone-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                  <div className="overflow-x-auto font-bold">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-stone-50/85 border-b border-stone-200 font-black text-stone-500 uppercase tracking-widest select-none">
                          <th className="py-4 px-6 text-stone-500">
                            Request ID
                          </th>
                          <th className="py-4 px-6 text-stone-500">
                            Leave Category
                          </th>
                          <th className="py-4 px-6 text-stone-500">
                            Start Date
                          </th>
                          <th className="py-4 px-6 text-stone-500">End Date</th>
                          <th className="py-4 px-6 text-stone-500">
                            Approval Status
                          </th>
                          <th className="py-4 px-6 text-stone-500">
                            Approver / Manager Note
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-150 font-medium text-stone-700">
                        {myLeaves.map((leave) => {
                          const statusClass =
                            leave.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : leave.status === "REJECTED"
                                ? "bg-rose-50 text-rose-700 border-rose-100"
                                : "bg-amber-50 text-amber-700 border-amber-100";

                          return (
                            <tr
                              key={leave.id}
                              className="hover:bg-stone-50/50 transition-colors"
                            >
                              <td className="py-4 px-6 font-mono font-black text-stone-900">
                                {leave.id}
                              </td>
                              <td className="py-4 px-6 font-bold text-stone-800">
                                {leave.leave_type}
                              </td>
                              <td className="py-4 px-6">
                                {formatLocalDate(leave.start_date)}
                              </td>
                              <td className="py-4 px-6">
                                {formatLocalDate(leave.end_date)}
                              </td>
                              <td className="py-4 px-6">
                                <span
                                  className={cn(
                                    "px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black tracking-widest border",
                                    statusClass,
                                  )}
                                >
                                  {leave.status || "PENDING"}
                                </span>
                              </td>
                              <td className="py-4 px-6">
                                <div className="space-y-1">
                                  {!leave.approver_name && !leave.manager_note && (
                                    <span className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Waiting for Review</span>
                                  )}
                                  {leave.approver_name && (
                                    <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">
                                      Authorized by:{" "}
                                      <strong className="text-stone-700">
                                        {leave.approver_name}
                                      </strong>
                                    </p>
                                  )}
                                  {leave.manager_note && (
                                    <p className="text-[11px] text-stone-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80 mt-1 font-sans">
                                      <strong className="text-amber-900 font-extrabold">
                                        Manager Note:
                                      </strong>{" "}
                                      {leave.manager_note}
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PAYSLIPS */}
          {activeTab === "PAYSLIP" && (
            <div className="space-y-6">
              <div className="bg-stone-50 border border-stone-200 px-6 py-4 rounded-2xl">
                <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">
                  Official Financial Records
                </span>
                <h3 className="text-sm font-black text-stone-800 uppercase tracking-widest mt-0.5 font-bold">
                  Payslip Archive
                </h3>
                <p className="text-[11px] text-stone-500 font-medium">
                  Monthly salary, allowances, deductions, and system-verified
                  digital receipts.
                </p>
              </div>

              {myPayslips.length === 0 ? (
                <div className="py-20 text-center bg-white rounded-[2.5rem] border border-stone-200 flex flex-col items-center justify-center">
                  <div className="w-14 h-14 bg-stone-50 rounded-full flex items-center justify-center mb-4 text-stone-300">
                    <ReceiptText className="w-6 h-6" />
                  </div>
                  <p className="text-stone-700 font-extrabold text-sm">
                    No documents available.
                  </p>
                  <p className="text-xs text-stone-400 mt-1">
                    The finance team has not issued your payslips for this
                    period yet.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-bold">
                  {myPayslips.map((pay) => (
                    <div
                      key={pay.id}
                      className="bg-white border hover:border-stone-400 transition-all shadow-sm rounded-[2rem] p-6 flex flex-col justify-between group cursor-pointer"
                      onClick={() => setSelectedPayslip(pay)}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-6">
                          <div className="w-11 h-11 bg-stone-100 text-stone-700 border border-stone-200 rounded-xl flex items-center justify-center shadow-inner">
                            <ReceiptText className="w-5 h-5" />
                          </div>
                          <span
                            className={cn(
                              "px-2 py-0.5 border text-[9px] uppercase tracking-widest font-black rounded",
                              pay.status === "PAID"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : "bg-amber-50 text-amber-600 border-amber-200",
                            )}
                          >
                            {pay.status === "PAID" ? "PAID" : "PENDING PAYMENT"}
                          </span>
                        </div>

                        <h4 className="text-lg font-black text-stone-900 group-hover:text-stone-700 transition-colors">
                          {pay.period_month}
                        </h4>
                        <p className="text-stone-400 text-[11px] font-mono mt-0.5">
                          ID: {pay.id}
                        </p>

                        <div className="mt-4 pt-4 border-t border-stone-100 space-y-1 bg-stone-50/50 p-3 rounded-xl border border-stone-100">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400 block">
                            Total Net Salary
                          </span>
                          <span className="text-base font-black text-stone-900 font-mono tracking-tight block">
                            {formatRupiah(pay.net_salary)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-stone-150 flex items-center justify-between text-xs font-bold text-stone-500">
                        <Eye className="w-4 h-4" />
                        <ArrowRight className="w-4 h-4 text-stone-400 group-hover:translate-x-1.5 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <LeaveRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        isManager={isManager}
        isSubmittingLeave={isSubmittingLeave}
        leaveType={leaveType}
        setLeaveType={setLeaveType}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        handleRequestLeave={handleRequestLeave}
      />

      <PayslipModal
        selectedPayslip={selectedPayslip}
        onClose={() => setSelectedPayslip(null)}
        user={user}
        formatRupiah={formatRupiah}
      />
    </div>
  );
}
