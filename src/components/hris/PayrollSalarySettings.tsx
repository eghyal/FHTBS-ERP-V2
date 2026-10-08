import React, { useState, useEffect } from "react";
import { Plus, Edit2, CheckCircle2, X, DollarSign, Settings, Search, Save, AlertCircle, Building2, Users, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { Modal } from "@/components/ui/Modal";
import { CurrencyInput } from "../ui/CurrencyInput";

interface PayrollSalarySettingsProps {
  users: any[];
  isOpen?: boolean;
  onClose?: () => void;
  isModal?: boolean;
}

export default function PayrollSalarySettings({ users, isOpen, onClose, isModal = false }: PayrollSalarySettingsProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [salaries, setSalaries] = useState<any[]>([]);
  const [fetchedUsers, setFetchedUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editBasic, setEditBasic] = useState("");
  const [editAllowances, setEditAllowances] = useState("");
  const [editDeductions, setEditDeductions] = useState("");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");

  // Confirmation Modal state
  const [confirmTarget, setConfirmTarget] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSalariesAndUsers = async () => {
    setIsLoading(true);
    try {
      const [resSal, resUsers] = await Promise.all([
        apiFetch("/api/hr/salaries", {}, user?.username),
        apiFetch("/api/users/directory", {}, user?.username)
      ]);

      if (resSal.ok && resSal.data) {
        setSalaries(resSal.data);
      }
      if (resUsers.ok && Array.isArray(resUsers.data)) {
        setFetchedUsers(resUsers.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSalariesAndUsers();
  }, []);

  const handleOpenConfirmSave = (u: any) => {
    const basic = Number(editBasic) || 0;
    const allow = Number(editAllowances) || 0;
    const ded = Number(editDeductions) || 0;
    const currentSal = salaries.find(s => s.employee_username?.toLowerCase() === u.username?.toLowerCase());

    setConfirmTarget({
      user: u,
      oldBasic: currentSal?.basic_salary || 0,
      oldAllow: currentSal?.allowances || 0,
      oldDed: currentSal?.deductions || 0,
      newBasic: basic,
      newAllow: allow,
      newDed: ded,
      newNet: basic + allow - ded
    });
  };

  const handleExecuteSave = async () => {
    if (!confirmTarget) return;
    setIsSaving(true);
    try {
      const res = await apiFetch("/api/hr/salaries", {
        method: "POST",
        body: JSON.stringify({
          employee_username: confirmTarget.user.username,
          basic_salary: confirmTarget.newBasic,
          allowances: confirmTarget.newAllow,
          deductions: confirmTarget.newDed
        })
      }, user?.username);
      
      if (res.ok) {
        showToast(`Salary configuration for ${confirmTarget.user.name} updated successfully`, "success");
        setIsEditing(null);
        setConfirmTarget(null);
        fetchSalariesAndUsers();
      } else {
        showToast(res.error || "Failed to save configuration", "error");
      }
    } catch (e) {
      showToast("Network error occurred", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Derive unified user list from props, API directory, and salaries table
  const baseUserList = (Array.isArray(users) && users.length > 0) ? users : fetchedUsers;
  const userMap = new Map<string, any>();

  baseUserList.forEach(u => {
    if (u && u.username) {
      userMap.set(u.username.toLowerCase(), u);
    }
  });

  salaries.forEach(s => {
    if (s && s.employee_username && !userMap.has(s.employee_username.toLowerCase())) {
      userMap.set(s.employee_username.toLowerCase(), {
        username: s.employee_username,
        name: s.employee_name || s.employee_username,
        role: s.employee_role || "STAFF",
        status: "APPROVED"
      });
    }
  });

  const mergedUsers = Array.from(userMap.values());
  const activeUsers = mergedUsers.filter(u => 
    u.role !== 'SYSTEM' && 
    (u.status === 'APPROVED' || u.status === 'ACTIVE' || !u.status || u.status === '')
  );

  const filteredUsers = activeUsers.filter(u => {
    const matchesSearch = u.name?.toLowerCase().includes(search.toLowerCase()) || 
      u.username?.toLowerCase().includes(search.toLowerCase()) ||
      u.role?.toLowerCase().includes(search.toLowerCase());
    const matchesDept = deptFilter === "ALL" || u.role === deptFilter;
    return matchesSearch && matchesDept;
  });

  const formatIDR = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  // Metrics calculation
  const totalPayrollCommitment = activeUsers.reduce((acc, u) => {
    const sal = salaries.find(s => s.employee_username?.toLowerCase() === u.username?.toLowerCase());
    return acc + (sal?.basic_salary || 0) + (sal?.allowances || 0) - (sal?.deductions || 0);
  }, 0);

  const avgBasicSalary = activeUsers.length > 0 ? activeUsers.reduce((acc, u) => {
    const sal = salaries.find(s => s.employee_username?.toLowerCase() === u.username?.toLowerCase());
    return acc + (sal?.basic_salary || 0);
  }, 0) / activeUsers.length : 0;

  const content = (
    <div className="space-y-6">
      {/* HEADER & SUMMARY METRICS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-stone-200/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Employee Salary Master
            </span>
            <h2 className="text-xl font-black text-stone-900">
              Basic Salary & Allowances Configuration
            </h2>
          </div>
          <p className="text-stone-500 text-xs mt-1">
            Official basic salary commitments, job allowances, & monthly fixed deductions for automatic PRq & Payslip calculations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-stone-500 bg-stone-100 px-3 py-1.5 rounded-full border border-stone-200">
            Access Role: <strong className="text-stone-900 uppercase">{user?.role || "HR/ADMIN"}</strong>
          </span>
        </div>
      </div>

      {/* METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
          <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block mb-1">
            Est. Total Payroll Commitment
          </span>
          <p className="text-xl font-black text-stone-900 font-mono">
            {formatIDR(totalPayrollCommitment)}
          </p>
          <span className="text-[10px] text-stone-500 mt-1 block">
            Based on salary master of {activeUsers.length} employees
          </span>
        </div>

        <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200/60">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800 block mb-1">
            Average Basic Salary
          </span>
          <p className="text-xl font-black text-emerald-950 font-mono">
            {formatIDR(avgBasicSalary)}
          </p>
          <span className="text-[10px] text-emerald-700/80 mt-1 block">
            Calculated per active employee
          </span>
        </div>

        <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
          <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block mb-1">
            Registered Employees
          </span>
          <p className="text-xl font-black text-stone-900">
            {activeUsers.length} Employees
          </p>
          <span className="text-[10px] text-stone-500 mt-1 block">
            Account status: APPROVED
          </span>
        </div>
      </div>

      {/* SEARCH & FILTERS */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-700 focus:outline-none focus:border-brand"
          >
            <option value="ALL">All Divisions / Roles</option>
            <option value="ENGINEERING">Engineering</option>
            <option value="HR">Human Resources (HR)</option>
            <option value="FC">Finance & Control (FC)</option>
            <option value="LOGISTICS">Logistics & Supply</option>
            <option value="SALES">Sales & Business</option>
          </select>
        </div>

        <div className="w-full sm:w-72">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search name or username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold focus:outline-none focus:border-brand transition-all"
            />
          </div>
        </div>
      </div>

      {/* SALARY TABLE */}
      <div className="overflow-hidden border border-stone-200 rounded-[2rem] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-stone-50 text-stone-500 font-bold uppercase tracking-wider text-[10px] border-b border-stone-200">
              <tr>
                <th className="p-4 pl-6">Employee</th>
                <th className="p-4">Basic Salary (Rp)</th>
                <th className="p-4">Fixed Allowance (Rp)</th>
                <th className="p-4">Fixed Deduction (Rp)</th>
                <th className="p-4">Take Home Pay (Est.)</th>
                <th className="p-4 pr-6 text-right">Edit Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-bold">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-stone-400 font-medium">Loading salary configuration data...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-stone-400 font-medium">No employee records found.</td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const currentSal = salaries.find(s => s.employee_username?.toLowerCase() === u.username?.toLowerCase());
                  const isEd = isEditing === u.username;
                  
                  return (
                    <tr key={u.username} className="hover:bg-stone-50/80 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-red-50 text-brand border border-red-100 flex items-center justify-center font-black text-xs">
                            {u.name?.charAt(0).toUpperCase() || "U"}
                          </div>
                          <div>
                            <p className="font-extrabold text-stone-900">{u.name}</p>
                            <p className="text-[10px] text-stone-400 font-semibold">@{u.username} • <span className="uppercase text-stone-500">{u.role}</span></p>
                          </div>
                        </div>
                      </td>
                      
                      <td className="p-4">
                        {isEd ? (
                          <CurrencyInput
                            value={editBasic}
                            onChange={(val) => setEditBasic(val.toString())}
                            placeholder="Basic Salary"
                            className="w-36"
                          />
                        ) : (
                          <span className="font-mono text-stone-800 text-xs font-bold">
                            {formatIDR(currentSal?.basic_salary ?? 0)}
                          </span>
                        )}
                      </td>
                      
                      <td className="p-4">
                        {isEd ? (
                          <CurrencyInput
                            value={editAllowances}
                            onChange={(val) => setEditAllowances(val.toString())}
                            placeholder="Allowance"
                            className="w-36"
                          />
                        ) : (
                          <span className="font-mono text-emerald-600 text-xs font-bold">
                            {formatIDR(currentSal?.allowances ?? 0)}
                          </span>
                        )}
                      </td>
                      
                      <td className="p-4">
                        {isEd ? (
                          <CurrencyInput
                            value={editDeductions}
                            onChange={(val) => setEditDeductions(val.toString())}
                            placeholder="Deduction"
                            className="w-36"
                          />
                        ) : (
                          <span className="font-mono text-rose-600 text-xs font-bold">
                            {formatIDR(currentSal?.deductions ?? 0)}
                          </span>
                        )}
                      </td>
                      
                      <td className="p-4">
                        {isEd ? (
                          <span className="font-mono font-black text-stone-500">
                            {formatIDR((Number(editBasic) || 0) + (Number(editAllowances) || 0) - (Number(editDeductions) || 0))}
                          </span>
                        ) : (
                          <span className="font-mono font-black text-stone-900 text-sm">
                            {formatIDR((currentSal?.basic_salary ?? 0) + (currentSal?.allowances ?? 0) - (currentSal?.deductions ?? 0))}
                          </span>
                        )}
                      </td>
                      
                      <td className="p-4 pr-6 text-right">
                        {isEd ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button 
                              onClick={() => setIsEditing(null)} 
                              className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                            <button 
                              onClick={() => handleOpenConfirmSave(u)} 
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" /> Save
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => {
                              setIsEditing(u.username);
                              const curBasic = currentSal?.basic_salary ?? 0;
                              const curAllow = currentSal?.allowances ?? 0;
                              const curDed = currentSal?.deductions ?? 0;
                              setEditBasic(curBasic.toString());
                              setEditAllowances(curAllow.toString());
                              setEditDeductions(curDed.toString());
                            }}
                            className="px-3 py-1.5 text-xs font-bold text-brand bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all flex items-center gap-1.5 ml-auto cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Set Basic Salary
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CONFIRMATION MODAL FOR SALARY UPDATE */}
      <Modal
        isOpen={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title="Confirm Salary Master Changes"
        maxWidth="md"
      >
        {confirmTarget && (
          <div className="p-2 space-y-4">
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>
                Changes to this salary master will immediately affect upcoming <strong>payroll PRq</strong> and <strong>payslip</strong> calculations.
              </span>
            </div>

            <div className="space-y-2 border border-stone-200 rounded-2xl p-4 bg-stone-50/50 text-xs">
              <div className="font-extrabold text-stone-900 text-sm">
                {confirmTarget.user.name} <span className="text-stone-400 font-normal">(@{confirmTarget.user.username})</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-200">
                <div>
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">New Basic Salary</span>
                  <span className="font-mono font-bold text-stone-900">{formatIDR(confirmTarget.newBasic)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">New Allowance</span>
                  <span className="font-mono font-bold text-emerald-600">{formatIDR(confirmTarget.newAllow)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">New Deduction</span>
                  <span className="font-mono font-bold text-rose-600">-{formatIDR(confirmTarget.newDed)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Take Home Pay</span>
                  <span className="font-mono font-black text-stone-900">{formatIDR(confirmTarget.newNet)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSave}
                disabled={isSaving}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all shadow-md shadow-emerald-200/50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSaving ? "Saving..." : "Yes, Save Changes"}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );

  if (isModal) {
    return (
      <Modal
        isOpen={!!isOpen}
        onClose={onClose || (() => {})}
        title="Employee Basic Salary Configuration"
        maxWidth="5xl"
      >
        <div className="p-2">
          {content}
        </div>
      </Modal>
    );
  }

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-[32px] p-8 border border-stone-200 shadow-xl mb-8">
      {content}
    </div>
  );
}
