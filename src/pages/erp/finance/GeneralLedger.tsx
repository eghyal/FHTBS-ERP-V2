import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { formatIDR } from "@/lib/utils";
import {
  BookOpen,
  Scale,
  Calendar,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Layers,
  ArrowRight,
  ShieldCheck,
  Plus,
  Eye,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  reference_type: string;
  reference_number: string;
  description: string;
  total_debit: number;
  total_credit: number;
  status: string;
  created_by: string;
  lines: Array<{
    id: string;
    account_code: string;
    account_name: string;
    debit: number;
    credit: number;
    memo?: string;
  }>;
}

interface Period {
  id: string;
  period_key: string;
  period_name: string;
  start_date: string;
  end_date: string;
  status: "OPEN" | "SOFT_LOCKED" | "HARD_CLOSED";
  locked_by?: string;
  locked_at?: string;
  closed_by?: string;
  closed_at?: string;
  notes?: string;
  journal_count: number;
  total_volume: number;
}

interface TrialBalanceItem {
  code: string;
  name: string;
  category: string;
  type: string;
  normal_balance: string;
  total_debit: number;
  total_credit: number;
  balance_debit: number;
  balance_credit: number;
}

interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  category: string;
  type?: string;
  normal_balance: "DEBIT" | "CREDIT";
  description?: string;
  net_balance?: number;
}

export default function GeneralLedger() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"JOURNALS" | "TRIAL_BALANCE" | "PERIODS" | "COA">("JOURNALS");
  const [isLoading, setIsLoading] = useState(true);

  // Journals State
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [selectedJournal, setSelectedJournal] = useState<JournalEntry | null>(null);

  // Trial Balance State
  const [trialBalance, setTrialBalance] = useState<TrialBalanceItem[]>([]);
  const [trialSummary, setTrialSummary] = useState<any>({ total_debit: 0, total_credit: 0, is_balanced: true });

  // Accounting Periods State
  const [periods, setPeriods] = useState<Period[]>([]);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [selectedPeriodForStatus, setSelectedPeriodForStatus] = useState<Period | null>(null);
  const [newStatus, setNewStatus] = useState<"OPEN" | "SOFT_LOCKED" | "HARD_CLOSED">("SOFT_LOCKED");
  const [statusPin, setStatusPin] = useState("");
  const [statusNotes, setStatusNotes] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Form New Period
  const [newPeriodKey, setNewPeriodKey] = useState("");
  const [newPeriodName, setNewPeriodName] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [isCreatingPeriod, setIsCreatingPeriod] = useState(false);

  // Chart of Accounts State
  const [coaList, setCoaList] = useState<ChartOfAccount[]>([]);
  const [coaCategoryFilter, setCoaCategoryFilter] = useState("ALL");

  const fetchJournals = async () => {
    try {
      const q = new URLSearchParams();
      if (filterType !== "ALL") q.append("type", filterType);
      if (searchTerm) q.append("search", searchTerm);
      const res = await apiFetch(`/api/finance/journals?${q.toString()}`, {}, user?.username);
      if (res.ok && res.data?.data) {
        setJournals(res.data.data);
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const fetchTrialBalance = async () => {
    try {
      const res = await apiFetch("/api/finance/trial-balance", {}, user?.username);
      if (res.ok && res.data?.data) {
        setTrialBalance(res.data.data);
        setTrialSummary(res.data.summary || {});
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const fetchPeriods = async () => {
    try {
      const res = await apiFetch("/api/finance/periods", {}, user?.username);
      if (res.ok && res.data?.data) {
        setPeriods(res.data.data);
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const fetchCoa = async () => {
    try {
      const res = await apiFetch("/api/finance/chart-of-accounts", {}, user?.username);
      if (res.ok && res.data?.data) {
        setCoaList(res.data.data);
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    await Promise.all([fetchJournals(), fetchTrialBalance(), fetchPeriods(), fetchCoa()]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [filterType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchJournals();
  };

  const handleUpdatePeriodStatus = async () => {
    if (!selectedPeriodForStatus) return;
    if ((newStatus === "HARD_CLOSED" || newStatus === "OPEN") && !statusPin) {
      showToast("Daily authorization PIN is required for this action", "error");
      return;
    }

    setIsUpdatingStatus(true);
    try {
      const res = await apiFetch(
        `/api/finance/periods/${selectedPeriodForStatus.id}/status`,
        {
          method: "PUT",
          body: JSON.stringify({
            status: newStatus,
            pin: statusPin,
            notes: statusNotes,
          }),
        },
        user?.username
      );

      if (res.ok) {
        showToast(`Period status updated to ${newStatus}`, "success");
        setSelectedPeriodForStatus(null);
        setStatusPin("");
        setStatusNotes("");
        fetchPeriods();
      } else {
        showToast(res.data?.error || "Failed to update period status", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Connection error", "error");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPeriodKey || !newPeriodName || !newStartDate || !newEndDate) {
      showToast("Please fill in all required fields", "error");
      return;
    }

    setIsCreatingPeriod(true);
    try {
      const res = await apiFetch(
        "/api/finance/periods",
        {
          method: "POST",
          body: JSON.stringify({
            period_key: newPeriodKey,
            period_name: newPeriodName,
            start_date: newStartDate,
            end_date: newEndDate,
          }),
        },
        user?.username
      );

      if (res.ok) {
        showToast("Accounting period created successfully", "success");
        setShowPeriodModal(false);
        setNewPeriodKey("");
        setNewPeriodName("");
        setNewStartDate("");
        setNewEndDate("");
        fetchPeriods();
      } else {
        showToast(res.data?.error || "Failed to create accounting period", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Connection error", "error");
    } finally {
      setIsCreatingPeriod(false);
    }
  };

  const filteredCoa = coaList.filter((item) => {
    if (coaCategoryFilter === "ALL") return true;
    return item.category.toUpperCase() === coaCategoryFilter;
  });

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <PageHeader
        title="General Ledger & Accounting Periods"
        subtitle="Journal entries and trial balance"
        icon={<BookOpen className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
              className="border-stone-200 text-stone-700 hover:bg-stone-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            {["FC", "BOD", "ADMIN"].includes(user?.role || "") && (
              <Button
                size="sm"
                onClick={() => setShowPeriodModal(true)}
                className="bg-stone-900 hover:bg-stone-800 text-white"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New Accounting Period
              </Button>
            )}
          </div>
        }
      />

      {/* Primary KPI Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Total Journal Entries
          </div>
          <div className="text-2xl font-bold font-mono text-stone-900 mt-1 tabular-nums">
            {journals.length}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">Recorded in current ledger</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Trial Balance Status
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                trialSummary.is_balanced
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-rose-50 text-rose-700 border border-rose-200"
              }`}
            >
              {trialSummary.is_balanced ? "Balanced" : "Out of Balance"}
            </span>
            <span className="text-xs font-mono text-stone-500 tabular-nums">
              Δ {formatIDR(trialSummary.discrepancy || 0)}
            </span>
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">Debits equal credits verification</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Accounting Periods
          </div>
          <div className="text-2xl font-bold font-mono text-stone-900 mt-1 tabular-nums">
            {periods.length}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            {periods.filter((p) => p.status === "OPEN").length} currently open
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Chart of Accounts
          </div>
          <div className="text-2xl font-bold font-mono text-stone-900 mt-1 tabular-nums">
            {coaList.length}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">Standard financial accounts</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-stone-200 space-x-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab("JOURNALS")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "JOURNALS"
              ? "border-stone-900 text-stone-900 font-semibold"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Journal Entries</span>
          <span className="px-1.5 py-0.5 rounded text-[11px] bg-stone-100 text-stone-600 font-mono tabular-nums">
            {journals.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("TRIAL_BALANCE")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "TRIAL_BALANCE"
              ? "border-stone-900 text-stone-900 font-semibold"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Trial Balance</span>
        </button>

        <button
          onClick={() => setActiveTab("PERIODS")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "PERIODS"
              ? "border-stone-900 text-stone-900 font-semibold"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Accounting Periods</span>
          <span className="px-1.5 py-0.5 rounded text-[11px] bg-stone-100 text-stone-600 font-mono tabular-nums">
            {periods.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("COA")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "COA"
              ? "border-stone-900 text-stone-900 font-semibold"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Chart of Accounts</span>
          <span className="px-1.5 py-0.5 rounded text-[11px] bg-stone-100 text-stone-600 font-mono tabular-nums">
            {coaList.length}
          </span>
        </button>
      </div>

      {/* TAB 1: JOURNAL ENTRIES */}
      {activeTab === "JOURNALS" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-stone-200 shadow-xs">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-auto flex-1">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Search entry number, reference, or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>
              <Button type="submit" variant="secondary" size="sm" className="text-xs">
                Search
              </Button>
            </form>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-stone-400" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-stone-400"
              >
                <option value="ALL">All Transaction Types</option>
                <option value="COMMERCIAL_INVOICE">Sales Invoices (AR)</option>
                <option value="INVOICE_PAYMENT">Receivable Receipts</option>
                <option value="GRN">Goods Receipt Note (GRN)</option>
                <option value="PO_PAYMENT">Vendor PO Payments (AP)</option>
                <option value="PAYROLL">Payroll Disbursements</option>
                <option value="DELIVERY_NOTE">Cost of Goods Sold (DN)</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 uppercase text-[10px] font-semibold tracking-wider">
                    <th className="py-3 px-4">Entry Number & Date</th>
                    <th className="py-3 px-4">Source & Reference</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4 text-right">Debit</th>
                    <th className="py-3 px-4 text-right">Credit</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {journals.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-stone-400 text-xs">
                        No journal entries found matching current filter.
                      </td>
                    </tr>
                  ) : (
                    journals.map((j) => (
                      <tr key={j.id} className="hover:bg-stone-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-mono font-semibold text-stone-900">
                            {j.entry_number}
                          </div>
                          <div className="text-[11px] text-stone-400 mt-0.5">
                            {new Date(j.entry_date).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-[10px] font-mono font-medium text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                            {j.reference_type}
                          </span>
                          <div className="font-mono text-[11px] text-stone-500 mt-0.5">
                            {j.reference_number || "-"}
                          </div>
                        </td>
                        <td className="py-3 px-4 max-w-sm">
                          <div className="text-stone-800 truncate">{j.description}</div>
                          <div className="text-[10px] text-stone-400 mt-0.5">By: {j.created_by}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-stone-900 tabular-nums">
                          {formatIDR(j.total_debit)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-stone-900 tabular-nums">
                          {formatIDR(j.total_credit)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            {j.status || "POSTED"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => setSelectedJournal(j)}
                            className="text-stone-600 hover:text-stone-900"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TRIAL BALANCE */}
      {activeTab === "TRIAL_BALANCE" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="font-semibold text-stone-900 text-sm">Trial Balance Summary</h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Verification of double-entry ledger balance across all active accounts
              </p>
            </div>
            <div className="flex items-center gap-6 text-xs">
              <div>
                <span className="text-stone-400 block">Total Debits</span>
                <span className="font-mono font-bold text-stone-900 text-sm tabular-nums">
                  {formatIDR(trialSummary.total_debit || 0)}
                </span>
              </div>
              <div>
                <span className="text-stone-400 block">Total Credits</span>
                <span className="font-mono font-bold text-stone-900 text-sm tabular-nums">
                  {formatIDR(trialSummary.total_credit || 0)}
                </span>
              </div>
              <div>
                <span className="text-stone-400 block">Ledger Status</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                    trialSummary.is_balanced
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  {trialSummary.is_balanced ? "Balanced" : "Unbalanced"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 uppercase text-[10px] font-semibold tracking-wider">
                    <th className="py-3 px-4">Account Code</th>
                    <th className="py-3 px-4">Account Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-center">Normal Balance</th>
                    <th className="py-3 px-4 text-right">Debit Balance</th>
                    <th className="py-3 px-4 text-right">Credit Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {trialBalance.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-stone-400 text-xs">
                        No balances recorded in current ledger.
                      </td>
                    </tr>
                  ) : (
                    trialBalance.map((item) => (
                      <tr key={item.code} className="hover:bg-stone-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-stone-900">
                          {item.code}
                        </td>
                        <td className="py-3 px-4 font-medium text-stone-800">
                          {item.name}
                        </td>
                        <td className="py-3 px-4 text-stone-500">
                          {item.category}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-[11px] text-stone-500">
                          {item.normal_balance}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-stone-900 tabular-nums">
                          {item.balance_debit > 0 ? formatIDR(item.balance_debit) : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-stone-900 tabular-nums">
                          {item.balance_credit > 0 ? formatIDR(item.balance_credit) : "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ACCOUNTING PERIODS */}
      {activeTab === "PERIODS" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 uppercase text-[10px] font-semibold tracking-wider">
                    <th className="py-3 px-4">Period Key</th>
                    <th className="py-3 px-4">Period Name</th>
                    <th className="py-3 px-4">Date Range</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Entries</th>
                    <th className="py-3 px-4 text-right">Transaction Volume</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {periods.map((p) => (
                    <tr key={p.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-stone-900">
                        {p.period_key}
                      </td>
                      <td className="py-3 px-4 font-medium text-stone-800">
                        {p.period_name}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-stone-500">
                        {p.start_date} to {p.end_date}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {p.status === "OPEN" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            <Unlock className="w-3 h-3" />
                            OPEN
                          </span>
                        )}
                        {p.status === "SOFT_LOCKED" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
                            <Lock className="w-3 h-3" />
                            SOFT_LOCKED
                          </span>
                        )}
                        {p.status === "HARD_CLOSED" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">
                            <Lock className="w-3 h-3" />
                            HARD_CLOSED
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-stone-600 tabular-nums">
                        {p.journal_count || 0}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-stone-900 tabular-nums">
                        {formatIDR(p.total_volume || 0)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => {
                            setSelectedPeriodForStatus(p);
                            setNewStatus(p.status === "OPEN" ? "SOFT_LOCKED" : "OPEN");
                          }}
                          className="text-stone-700 hover:text-stone-900"
                        >
                          Change Status
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CHART OF ACCOUNTS */}
      {activeTab === "COA" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-3.5 rounded-xl border border-stone-200 shadow-xs">
            <span className="text-xs font-semibold text-stone-700">Account Classification</span>
            <div className="flex items-center gap-1 text-xs">
              {["ALL", "ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCoaCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                    coaCategoryFilter === cat
                      ? "bg-stone-900 text-white"
                      : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 uppercase text-[10px] font-semibold tracking-wider">
                    <th className="py-3 px-4">Account Code</th>
                    <th className="py-3 px-4">Account Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-center">Normal Balance</th>
                    <th className="py-3 px-4 text-right">Net Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredCoa.map((a) => (
                    <tr key={a.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-stone-900">
                        {a.code}
                      </td>
                      <td className="py-3 px-4 font-medium text-stone-800">
                        {a.name}
                        {a.description && (
                          <div className="text-[11px] text-stone-400 font-normal">{a.description}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[11px] text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                          {a.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-stone-500 font-mono text-[11px]">
                        {a.type || "-"}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-[11px] text-stone-600">
                        {a.normal_balance}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-stone-900 tabular-nums">
                        {formatIDR(a.net_balance || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: JOURNAL DETAIL */}
      {selectedJournal && (
        <Modal
          isOpen={!!selectedJournal}
          onClose={() => setSelectedJournal(null)}
          title={`Journal Entry: ${selectedJournal.entry_number}`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs bg-stone-50 p-3 rounded-lg border border-stone-200">
              <div>
                <span className="text-stone-400 block text-[10px]">Reference</span>
                <span className="font-mono font-medium text-stone-800">
                  {selectedJournal.reference_type}: {selectedJournal.reference_number || "-"}
                </span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px]">Date</span>
                <span className="text-stone-800">
                  {new Date(selectedJournal.entry_date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-stone-400 block text-[10px]">Description</span>
                <span className="text-stone-800">{selectedJournal.description}</span>
              </div>
            </div>

            <div className="border border-stone-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 text-[10px] uppercase font-semibold">
                  <tr>
                    <th className="py-2 px-3">Account</th>
                    <th className="py-2 px-3 text-right">Debit</th>
                    <th className="py-2 px-3 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {selectedJournal.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="py-2 px-3">
                        <div className="font-mono font-semibold text-stone-900">
                          {line.account_code} - {line.account_name}
                        </div>
                        {line.memo && <div className="text-[10px] text-stone-400">{line.memo}</div>}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-stone-800">
                        {line.debit > 0 ? formatIDR(line.debit) : "-"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-stone-800">
                        {line.credit > 0 ? formatIDR(line.credit) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-stone-50 border-t border-stone-200 font-semibold text-stone-900">
                  <tr>
                    <td className="py-2 px-3 text-right text-[11px]">Total</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">
                      {formatIDR(selectedJournal.total_debit)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">
                      {formatIDR(selectedJournal.total_credit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedJournal(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: CHANGE PERIOD STATUS */}
      {selectedPeriodForStatus && (
        <Modal
          isOpen={!!selectedPeriodForStatus}
          onClose={() => setSelectedPeriodForStatus(null)}
          title={`Update Accounting Period: ${selectedPeriodForStatus.period_key}`}
        >
          <div className="space-y-4">
            <div className="text-xs text-stone-600 bg-stone-50 p-3 rounded-lg border border-stone-200">
              <div className="flex justify-between py-0.5">
                <span className="text-stone-400">Period Name:</span>
                <span className="font-medium text-stone-800">{selectedPeriodForStatus.period_name}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-stone-400">Current Status:</span>
                <span className="font-semibold text-stone-800">{selectedPeriodForStatus.status}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                New Period Status:
              </label>
              <select
                value={newStatus}
                onChange={(e: any) => setNewStatus(e.target.value)}
                className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
              >
                <option value="OPEN">OPEN (Normal Posting Active)</option>
                <option value="SOFT_LOCKED">SOFT_LOCKED (Reconciliation / Restrict New Postings)</option>
                <option value="HARD_CLOSED">HARD_CLOSED (Permanently Closed & Sealed)</option>
              </select>
            </div>

            {(newStatus === "HARD_CLOSED" || newStatus === "OPEN") && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Daily Authorization PIN:
                </label>
                <input
                  type="password"
                  value={statusPin}
                  onChange={(e) => setStatusPin(e.target.value)}
                  placeholder="Enter 4-6 digit authorization PIN"
                  className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Audit Notes:
              </label>
              <textarea
                rows={2}
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                placeholder="Reason for period status adjustment..."
                className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedPeriodForStatus(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleUpdatePeriodStatus}
                disabled={isUpdatingStatus}
                className="bg-stone-900 hover:bg-stone-800 text-white"
              >
                {isUpdatingStatus ? "Updating..." : "Save Status"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: CREATE NEW PERIOD */}
      {showPeriodModal && (
        <Modal
          isOpen={showPeriodModal}
          onClose={() => setShowPeriodModal(false)}
          title="Create Accounting Period"
        >
          <form onSubmit={handleCreatePeriod} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Period Key (e.g. 2026-10):
              </label>
              <input
                type="text"
                required
                value={newPeriodKey}
                onChange={(e) => setNewPeriodKey(e.target.value)}
                placeholder="YYYY-MM"
                className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Period Name:
              </label>
              <input
                type="text"
                required
                value={newPeriodName}
                onChange={(e) => setNewPeriodName(e.target.value)}
                placeholder="e.g. October 2026 Fiscal Month"
                className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Start Date:
                </label>
                <input
                  type="date"
                  required
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  End Date:
                </label>
                <input
                  type="date"
                  required
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPeriodModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isCreatingPeriod}
                className="bg-stone-900 hover:bg-stone-800 text-white"
              >
                {isCreatingPeriod ? "Creating..." : "Create Period"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
