import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/contexts/NotificationContext";
import {
  Users,
  Briefcase,
  Award,
  Repeat,
  ChevronDown,
  LogOut,
  ExternalLink,
  Clock,
  User,
  Home,
  Menu,
  X,
  Bell,
  CheckCircle2,
  CheckCheck,
  AlertCircle,
  Info,
  MessageSquare,
  ShoppingCart,
  ClipboardList,
  Trash2,
  CalendarDays,
  DollarSign,
  UserCheck,
  PieChart,
  Pencil,
  ArrowUp,
  ArrowDown,
  Settings,
  Sparkles,
} from "lucide-react";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const {
    notifications,
    unreadCount: historyCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications();

  const [time, setTime] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const [isVisible, setIsVisible] = useState(false);
  const [isFooterHovered, setIsFooterHovered] = useState(false);

  // Live WIB clock updates matching the main ERP clock implementation
  const updateTime = useCallback(() => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };
    const formatter = new Intl.DateTimeFormat("en-GB", options);
    const parts = formatter.formatToParts(now);
    const dateObj: any = {};
    parts.forEach(({ type, value }) => {
      dateObj[type] = value;
    });
    setTime(
      `${dateObj.year}-${dateObj.month}-${dateObj.day} ${dateObj.hour}:${dateObj.minute}:${dateObj.second} WIB`,
    );
  }, []);

  useEffect(() => {
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [updateTime]);

  // Handle activity for auto hide/show
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleActivity = () => {
      setIsVisible(true);
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsVisible(false);
      }, 3000);
    };

    handleActivity(); // Initial trigger

    const mainEl = mainRef.current;

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);
    if (mainEl)
      mainEl.addEventListener("scroll", handleActivity, { passive: true });

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      if (mainEl) mainEl.removeEventListener("scroll", handleActivity);
    };
  }, []);

  // Click outside to close user dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = () => {
    logout();
    window.location.href = "/hr-login";
  };

  // Setup current active tab indicator based on query parameters
  const params = new URLSearchParams(location.search);
  const currentTab = params.get("tab") || "dashboard";

  const menuItems = [
    {
      id: "dashboard",
      name: "Analytics",
      icon: <PieChart className="w-[28px] h-[28px]" />,
    },
    {
      id: "directory",
      name: "Directory",
      icon: <Users className="w-[28px] h-[28px]" />,
    },
    {
      id: "attendance",
      name: "Attendance",
      icon: <Clock className="w-[28px] h-[28px]" />,
    },
    {
      id: "leave",
      name: "Leave",
      icon: <CalendarDays className="w-[28px] h-[28px]" />,
    },
    {
      id: "payroll",
      name: "Payroll",
      icon: <DollarSign className="w-[28px] h-[28px]" />,
    },
    {
      id: "vacancies",
      name: "Positions",
      icon: <Briefcase className="w-[28px] h-[28px]" />,
    },
    {
      id: "candidates",
      name: "Candidates",
      icon: <UserCheck className="w-[28px] h-[28px]" />,
    },
    {
      id: "kpi",
      name: "Appraisals",
      icon: <Award className="w-[28px] h-[28px]" />,
    },
    {
      id: "handover",
      name: "Transitions",
      icon: <Repeat className="w-[28px] h-[28px]" />,
    },
    {
      id: "settings",
      name: "Settings",
      icon: <Settings className="w-[28px] h-[28px]" />,
    },
    {
      id: "event",
      name: "Event",
      icon: <Sparkles className="w-[28px] h-[28px]" />,
    },
  ];

  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [menuOrder, setMenuOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem("hr_menu_order");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          let updated = [...parsed];
          if (!updated.includes("settings")) updated.push("settings");
          if (!updated.includes("event")) updated.push("event");
          return updated;
        }
      } catch (e) {}
    }
    return menuItems.map((m) => m.id);
  });

  useEffect(() => {
    localStorage.setItem("hr_menu_order", JSON.stringify(menuOrder));
  }, [menuOrder]);

  const tabsToDisplay = menuOrder
    .map((id) => menuItems.find((i) => i.id === id)!)
    .filter(Boolean);

  const moveCustomItem = (index: number, direction: "up" | "down") => {
    const newOrder = [...menuOrder];
    if (direction === "up" && index > 0) {
      [newOrder[index - 1], newOrder[index]] = [
        newOrder[index],
        newOrder[index - 1],
      ];
    } else if (direction === "down" && index < newOrder.length - 1) {
      [newOrder[index + 1], newOrder[index]] = [
        newOrder[index],
        newOrder[index + 1],
      ];
    }
    setMenuOrder(newOrder);
  };

  return (
    <div className="h-screen bg-[#F6F5F2] text-slate-800 font-sans selection:bg-violet-200 selection:text-violet-900 flex overflow-hidden relative">
      {/* Abstract Background Blobs */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] bg-stone-200 rounded-full mix-blend-multiply filter blur-[100px] opacity-40 animate-blob pointer-events-none" />
      <div className="fixed top-[20%] right-[-10%] w-[400px] h-[400px] bg-red-100 rounded-full mix-blend-multiply filter blur-[100px] opacity-40 animate-blob animation-delay-2000 pointer-events-none" />
      <div className="fixed bottom-[-20%] left-[20%] w-[600px] h-[600px] bg-stone-200 rounded-full mix-blend-multiply filter blur-[120px] opacity-40 animate-blob animation-delay-4000 pointer-events-none" />

      {/* Main Content Area */}
      <main
        ref={mainRef}
        className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar relative z-10 w-full mb-0"
      >
        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-[#F6F5F2]/80 backdrop-blur-3xl border-b border-stone-200/50 w-full px-4 py-3 md:px-8 md:py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-stone-900">
                Enterprise <span className="text-brand">HRIS & HCM</span>
              </h1>
              <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider bg-stone-100 text-stone-600 px-2 py-0.5 rounded border border-stone-200">
                Human Capital
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-12 h-12 rounded-full bg-white border border-stone-200 shadow-sm flex items-center justify-center text-brand text-base font-black hover:scale-105 transition-all duration-300 relative overflow-hidden group cursor-pointer"
            >
              <div className="absolute inset-0 bg-stone-50 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative z-10">
                {String(user?.username || "US").substring(0, 2).toUpperCase()}
              </span>
              {historyCount > 0 && (
                <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full animate-bounce z-20" />
              )}
            </button>

            {/* User Menu Dropdown */}
            {showUserMenu && user && (
              <div className="absolute top-[calc(100%+8px)] right-0 w-80 bg-white/90 backdrop-blur-3xl rounded-[2.5rem] border border-white/80 shadow-[0_20px_60px_rgba(0,0,0,0.08)] z-[100] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="p-6 pb-4 flex items-center justify-between bg-stone-50/80 border-b border-stone-200">
                  <div>
                    <p className="text-lg font-black text-stone-800">
                      {String(user?.username || "User")}
                    </p>
                    <span className="inline-flex items-center mt-1 px-2.5 py-0.5 rounded-full bg-red-50 text-[10px] font-black text-brand uppercase tracking-widest">
                      Team Success
                    </span>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="p-3 bg-white text-rose-500 rounded-full hover:bg-rose-50 transition-colors shadow-sm cursor-pointer group"
                    title="Logout"
                  >
                    <LogOut className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                  </button>
                </div>

                {/* Notifications Actions Header */}
                <div className="px-5 py-2.5 bg-stone-50/50 border-b border-stone-200/60 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-stone-500" />
                    <span>Activity {historyCount > 0 && `(${historyCount})`}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {historyCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-[10px] font-bold text-brand hover:text-red-700 uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1"
                        title="Mark all notifications as read"
                      >
                        <CheckCheck className="w-3 h-3" />
                        <span>Mark All Read</span>
                      </button>
                    )}
                    {notifications && notifications.length > 0 && (
                      <button
                        onClick={clearAll}
                        className="text-[10px] font-bold text-stone-400 hover:text-rose-600 uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 ml-1"
                        title="Clear all notifications"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Clear All</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {(!notifications || notifications.length === 0) ? (
                    <div className="text-center py-6">
                      <p className="text-sm font-bold text-stone-400">
                        All notifications caught up!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {notifications.map((notif, index) => {
                        if (!notif) return null;
                        const safeId = notif.id || `notif-${index}`;
                        const safeTitle = typeof notif.title === "string" ? notif.title : String(notif.title || "Notification");
                        const safeMsg = typeof notif.message === "string" ? notif.message : String(notif.message || "");
                        
                        let formattedTime = "--:--";
                        try {
                          const d = notif.timestamp instanceof Date ? notif.timestamp : new Date(notif.timestamp);
                          if (!isNaN(d.getTime())) {
                            formattedTime = d.toLocaleTimeString("en-US", {
                              timeZone: "Asia/Jakarta",
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                          }
                        } catch {
                          formattedTime = "--:--";
                        }

                        return (
                          <div
                            key={safeId}
                            onClick={() => notif.id && markAsRead(notif.id)}
                            className={cn(
                              "p-3 rounded-2xl border transition-all flex gap-3 group relative cursor-pointer",
                              notif.isRead
                                ? "bg-transparent border-transparent grayscale-[0.5] opacity-60 hover:bg-stone-50"
                                : "bg-white border-stone-100 shadow-sm ring-1 ring-stone-900/5 hover:scale-[1.02]",
                            )}
                          >
                            {!notif.isRead && (
                              <div className="absolute top-3 right-3 w-1.5 h-1.5 bg-stone-800 rounded-full" />
                            )}
                            <div
                              className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border",
                                notif.type === "SUCCESS"
                                  ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                                  : notif.type === "ERROR"
                                    ? "bg-rose-50 border-rose-100 text-rose-600"
                                    : notif.type === "CHAT"
                                      ? "bg-amber-50 border-amber-100 text-amber-600"
                                      : "bg-blue-50 border-blue-100 text-blue-600",
                              )}
                            >
                              {notif.type === "SUCCESS" && (
                                <CheckCircle2 className="w-4 h-4" />
                              )}
                              {notif.type === "ERROR" && (
                                <AlertCircle className="w-4 h-4" />
                              )}
                              {notif.type === "CHAT" && (
                                <MessageSquare className="w-4 h-4" />
                              )}
                              {notif.type !== "SUCCESS" && notif.type !== "ERROR" && notif.type !== "CHAT" && (
                                <Info className="w-4 h-4" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                              <p className="text-[11px] font-bold text-stone-900 mb-0.5">
                                {safeTitle}
                              </p>
                              <div
                                className="text-[10px] text-stone-500 line-clamp-2 leading-relaxed mb-1.5"
                                title={safeMsg}
                              >
                                {safeMsg}
                              </div>
                              <div className="flex items-center justify-between mt-auto">
                                <span className="text-[9px] text-stone-400 font-bold uppercase tracking-tight font-mono">
                                  {formattedTime}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Main Application Area */}
        <div className="flex-1 relative z-10 pt-4 pb-20 px-3 md:pt-8 md:pb-32 md:px-8">
          <div className="max-w-[1200px] mx-auto w-full">{children}</div>
        </div>
      </main>

      {/* Floating App Drawer Navigation */}
      <div
        className={cn(
          "fixed left-1/2 z-50 px-4 w-full max-w-[420px] transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-bottom bottom-8",
          !isVisible && !isFooterHovered && !isEditDrawerOpen
            ? "-translate-x-1/2 translate-y-[150%] opacity-0 pointer-events-none scale-90"
            : "-translate-x-1/2 translate-y-0 opacity-100 scale-100",
        )}
        onMouseEnter={() => setIsFooterHovered(true)}
        onMouseLeave={() => setIsFooterHovered(false)}
      >
        <nav
          className={cn(
            "bg-white/90 backdrop-blur-3xl p-3 shadow-[0_40px_80px_rgba(0,0,0,0.15)] border border-white mx-auto transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] overflow-hidden",
            isFooterHovered || isEditDrawerOpen
              ? "max-h-[500px] rounded-[3.5rem]"
              : "max-h-[105px] rounded-[3.5rem]",
          )}
        >
          {(isFooterHovered || isEditDrawerOpen) && (
            <div className="flex items-center justify-center mb-3 mt-2 animate-in fade-in slide-in-from-top-2 duration-300 relative px-4">
              <span className="text-[11px] font-black uppercase tracking-widest text-stone-400">
                {isEditDrawerOpen ? "Reorder Modules" : "All Modules"}
              </span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setIsEditDrawerOpen(!isEditDrawerOpen);
                }}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-colors",
                  isEditDrawerOpen
                    ? "bg-brand text-white"
                    : "bg-stone-50 text-stone-500 hover:text-stone-900 border border-stone-100 shadow-sm",
                )}
              >
                {isEditDrawerOpen ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Pencil className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}

          {isEditDrawerOpen ? (
            <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto custom-scrollbar px-2 pb-2">
              {tabsToDisplay.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 bg-stone-50 rounded-2xl border border-stone-100"
                >
                  <div className="text-stone-400 [&_svg]:w-5 [&_svg]:h-5">
                    {item.icon}
                  </div>
                  <div className="flex-1 font-bold text-sm text-stone-700">
                    {item.name}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveCustomItem(index, "up")}
                      disabled={index === 0}
                      className="p-2 bg-white rounded-xl shadow-sm text-stone-500 hover:text-stone-900 disabled:opacity-30 transition-colors"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveCustomItem(index, "down")}
                      disabled={index === tabsToDisplay.length - 1}
                      className="p-2 bg-white rounded-xl shadow-sm text-stone-500 hover:text-stone-900 disabled:opacity-30 transition-colors"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 w-full max-w-[360px] mx-auto">
              {tabsToDisplay.map((item, index) => {
                const isActive = currentTab === item.id;

                return (
                  <Link
                    key={item.id}
                    to={`/hr?tab=${item.id}`}
                    className={cn(
                      "relative group flex flex-col items-center justify-center pt-[14px] pb-2.5 rounded-[2rem] transition-all duration-300 outline-none h-[80px]",
                      isActive
                        ? "bg-brand text-white shadow-md shadow-red-900/20 transform scale-[1.02]"
                        : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/80",
                    )}
                  >
                    <div className="mb-1 group-hover:-translate-y-1 transition-transform duration-300">
                      {item.icon}
                    </div>
                    <span className="text-[11px] sm:text-[12px] font-bold text-center tracking-widest whitespace-nowrap overflow-hidden text-ellipsis w-full px-1">
                      {item.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
