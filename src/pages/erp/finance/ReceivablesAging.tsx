import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { formatIDR } from "@/lib/utils";
import {
  Clock,
  Send,
  MessageSquare,
  RefreshCw,
  Search,
  Filter,
  Phone,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface AgingInvoice {
  id: string;
  ci_number: string;
  dn_number?: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  grand_total: number;
  amount_paid: number;
  outstanding_amount: number;
  days_overdue: number;
  due_date: string;
  aging_bucket: "CURRENT" | "1-30_DAYS" | "31-60_DAYS" | "61-90_DAYS" | "OVER_90_DAYS";
  dunning_level: "NORMAL_REMINDER" | "FIRST_NOTICE" | "SECOND_WARNING" | "LEGAL_PRE_NOTICE" | "CREDIT_HOLD_LEGAL" | "NONE";
  payment_terms: string;
  created_at: string;
}

export default function ReceivablesAging() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [agingData, setAgingData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBucket, setSelectedBucket] = useState("ALL");
  const [selectedInvoiceForDunning, setSelectedInvoiceForDunning] = useState<AgingInvoice | null>(null);
  const [customDunningMessage, setCustomDunningMessage] = useState("");

  const fetchAgingData = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/finance/ar-aging", {}, user?.username);
      if (res.ok && res.data) {
        setAgingData(res.data);
      } else {
        showToast("Failed to load receivables aging data", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Connection error", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgingData();
  }, []);

  const openDunningModal = (inv: AgingInvoice) => {
    setSelectedInvoiceForDunning(inv);
    let defaultMsg = "";
    if (inv.dunning_level === "NORMAL_REMINDER") {
      defaultMsg = `Dear ${inv.customer_name || "Valued Customer"},\n\nThis is a friendly reminder regarding Invoice ${inv.ci_number} for the amount of ${formatIDR(inv.outstanding_amount)}, due on ${inv.due_date}. Please let us know when payment is scheduled. Thank you.`;
    } else if (inv.dunning_level === "FIRST_NOTICE") {
      defaultMsg = `FIRST NOTICE: Dear ${inv.customer_name || "Valued Customer"},\n\nInvoice ${inv.ci_number} for ${formatIDR(inv.outstanding_amount)} is now ${inv.days_overdue} days past due. We kindly request that you settle this invoice at your earliest convenience.`;
    } else if (inv.dunning_level === "SECOND_WARNING") {
      defaultMsg = `URGENT NOTICE (CREDIT SUSPENSION WARNING): Dear ${inv.customer_name || "Valued Customer"},\n\nInvoice ${inv.ci_number} is now ${inv.days_overdue} days past due with an outstanding balance of ${formatIDR(inv.outstanding_amount)}. New purchase orders may be placed on hold until settled. Please contact our finance department immediately.`;
    } else {
      defaultMsg = `FINAL NOTICE / LEGAL ESCALATION: Dear ${inv.customer_name || "Valued Customer"},\n\nInvoice ${inv.ci_number} is significantly past due (${inv.days_overdue} days) for ${formatIDR(inv.outstanding_amount)}. This account is subject to legal escalation. Please resolve immediately.`;
    }
    setCustomDunningMessage(defaultMsg);
  };

  const handleSendWhatsApp = () => {
    if (!selectedInvoiceForDunning) return;
    const phone = selectedInvoiceForDunning.customer_phone?.replace(/[^0-9]/g, "");
    if (!phone) {
      showToast("Customer contact number is not provided", "error");
      return;
    }
    const cleanPhone = phone.startsWith("0") ? "62" + phone.substring(1) : phone;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(customDunningMessage)}`;
    window.open(url, "_blank");
    showToast("Opened WhatsApp Web for notice dispatch", "info");
    setSelectedInvoiceForDunning(null);
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(customDunningMessage);
    showToast("Notice message copied to clipboard", "success");
  };

  const filteredInvoices: AgingInvoice[] = (agingData?.invoices || []).filter((inv: AgingInvoice) => {
    const matchesBucket = selectedBucket === "ALL" || inv.aging_bucket === selectedBucket;
    const matchesSearch =
      inv.ci_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.customer_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.dn_number || "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchesBucket && matchesSearch;
  });

  const totalReceivables =
    (agingData?.buckets?.current || 0) +
    (agingData?.buckets?.days_1_30 || 0) +
    (agingData?.buckets?.days_31_60 || 0) +
    (agingData?.buckets?.days_61_90 || 0) +
    (agingData?.buckets?.days_over_90 || 0);

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title="Accounts Receivable Aging"
        subtitle="Outstanding invoices and aging breakdown"
        icon={<Clock className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider">
                Total Outstanding
              </div>
              <div className="text-sm font-bold font-mono text-stone-900 tabular-nums">
                {formatIDR(totalReceivables)}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchAgingData}
              disabled={isLoading}
              className="border-stone-200 text-stone-700 hover:bg-stone-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Aging Bucket Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div
          onClick={() => setSelectedBucket(selectedBucket === "CURRENT" ? "ALL" : "CURRENT")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            selectedBucket === "CURRENT"
              ? "bg-stone-900 text-white border-stone-900 shadow-sm"
              : "bg-white border-stone-200 hover:border-stone-300 shadow-xs"
          }`}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${selectedBucket === "CURRENT" ? "text-stone-300" : "text-stone-500"}`}>
            Current (Not Due)
          </div>
          <div className={`text-lg font-bold font-mono mt-1.5 tabular-nums ${selectedBucket === "CURRENT" ? "text-white" : "text-stone-900"}`}>
            {formatIDR(agingData?.buckets?.current || 0)}
          </div>
          <div className={`text-[11px] mt-1 ${selectedBucket === "CURRENT" ? "text-stone-400" : "text-stone-400"}`}>
            Standard payment term
          </div>
        </div>

        <div
          onClick={() => setSelectedBucket(selectedBucket === "1-30_DAYS" ? "ALL" : "1-30_DAYS")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            selectedBucket === "1-30_DAYS"
              ? "bg-stone-900 text-white border-stone-900 shadow-sm"
              : "bg-white border-stone-200 hover:border-stone-300 shadow-xs"
          }`}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${selectedBucket === "1-30_DAYS" ? "text-stone-300" : "text-stone-500"}`}>
            1 – 30 Days Overdue
          </div>
          <div className={`text-lg font-bold font-mono mt-1.5 tabular-nums ${selectedBucket === "1-30_DAYS" ? "text-white" : "text-stone-900"}`}>
            {formatIDR(agingData?.buckets?.days_1_30 || 0)}
          </div>
          <div className={`text-[11px] mt-1 ${selectedBucket === "1-30_DAYS" ? "text-stone-400" : "text-stone-400"}`}>
            Tier 1 Follow-up
          </div>
        </div>

        <div
          onClick={() => setSelectedBucket(selectedBucket === "31-60_DAYS" ? "ALL" : "31-60_DAYS")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            selectedBucket === "31-60_DAYS"
              ? "bg-stone-900 text-white border-stone-900 shadow-sm"
              : "bg-white border-stone-200 hover:border-stone-300 shadow-xs"
          }`}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${selectedBucket === "31-60_DAYS" ? "text-stone-300" : "text-stone-500"}`}>
            31 – 60 Days Overdue
          </div>
          <div className={`text-lg font-bold font-mono mt-1.5 tabular-nums ${selectedBucket === "31-60_DAYS" ? "text-white" : "text-stone-900"}`}>
            {formatIDR(agingData?.buckets?.days_31_60 || 0)}
          </div>
          <div className={`text-[11px] mt-1 ${selectedBucket === "31-60_DAYS" ? "text-stone-400" : "text-stone-400"}`}>
            Tier 2 Warning
          </div>
        </div>

        <div
          onClick={() => setSelectedBucket(selectedBucket === "61-90_DAYS" ? "ALL" : "61-90_DAYS")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            selectedBucket === "61-90_DAYS"
              ? "bg-stone-900 text-white border-stone-900 shadow-sm"
              : "bg-white border-stone-200 hover:border-stone-300 shadow-xs"
          }`}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${selectedBucket === "61-90_DAYS" ? "text-stone-300" : "text-stone-500"}`}>
            61 – 90 Days Overdue
          </div>
          <div className={`text-lg font-bold font-mono mt-1.5 tabular-nums ${selectedBucket === "61-90_DAYS" ? "text-white" : "text-stone-900"}`}>
            {formatIDR(agingData?.buckets?.days_61_90 || 0)}
          </div>
          <div className={`text-[11px] mt-1 ${selectedBucket === "61-90_DAYS" ? "text-stone-400" : "text-stone-400"}`}>
            Pre-legal Escalate
          </div>
        </div>

        <div
          onClick={() => setSelectedBucket(selectedBucket === "OVER_90_DAYS" ? "ALL" : "OVER_90_DAYS")}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            selectedBucket === "OVER_90_DAYS"
              ? "bg-stone-900 text-white border-stone-900 shadow-sm"
              : "bg-white border-stone-200 hover:border-stone-300 shadow-xs"
          }`}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${selectedBucket === "OVER_90_DAYS" ? "text-stone-300" : "text-stone-500"}`}>
            90+ Days (Critical)
          </div>
          <div className={`text-lg font-bold font-mono mt-1.5 tabular-nums ${selectedBucket === "OVER_90_DAYS" ? "text-white" : "text-stone-900"}`}>
            {formatIDR(agingData?.buckets?.days_over_90 || 0)}
          </div>
          <div className={`text-[11px] mt-1 ${selectedBucket === "OVER_90_DAYS" ? "text-stone-400" : "text-stone-400"}`}>
            Credit Suspension
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-stone-200 shadow-xs">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Search invoice number, customer name, or delivery note..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-stone-400" />
          <select
            value={selectedBucket}
            onChange={(e) => setSelectedBucket(e.target.value)}
            className="text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-stone-400"
          >
            <option value="ALL">All Aging Buckets</option>
            <option value="CURRENT">Current (Not Due)</option>
            <option value="1-30_DAYS">1 – 30 Days Past Due</option>
            <option value="31-60_DAYS">31 – 60 Days Past Due</option>
            <option value="61-90_DAYS">61 – 90 Days Past Due</option>
            <option value="OVER_90_DAYS">90+ Days Past Due (Critical)</option>
          </select>
        </div>
      </div>

      {/* Table of Receivables Invoices */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 uppercase text-[10px] font-semibold tracking-wider">
                <th className="py-3 px-4">Invoice & DN</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4 text-right">Invoice Amount</th>
                <th className="py-3 px-4 text-right">Balance Due</th>
                <th className="py-3 px-4 text-center">Aging Status</th>
                <th className="py-3 px-4 text-center">Notice Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400 text-xs">
                    No outstanding invoices found matching the current criteria.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-stone-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-stone-900">
                        {inv.ci_number}
                      </div>
                      <div className="text-[11px] text-stone-400 font-mono mt-0.5">
                        DN: {inv.dn_number || "-"}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-stone-800">
                        {inv.customer_name || inv.customer_id}
                      </div>
                      {inv.customer_phone && (
                        <div className="text-[11px] text-stone-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-2.5 h-2.5" />
                          <span>{inv.customer_phone}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-stone-700">
                        {inv.due_date}
                      </div>
                      <div className="text-[10px] text-stone-400 mt-0.5">
                        {inv.payment_terms || "Net 30"}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-stone-600 tabular-nums">
                      {formatIDR(inv.grand_total)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-stone-900 tabular-nums">
                      {formatIDR(inv.outstanding_amount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {inv.days_overdue <= 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          Current
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                            inv.days_overdue > 60
                              ? "bg-rose-50 text-rose-700 border border-rose-200/60"
                              : "bg-amber-50 text-amber-700 border border-amber-200/60"
                          }`}
                        >
                          +{inv.days_overdue}d Overdue
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => openDunningModal(inv)}
                        className="text-stone-700 hover:text-stone-900 text-xs"
                      >
                        <MessageSquare className="w-3 h-3 mr-1" />
                        Send Notice
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: DUNNING NOTICE */}
      {selectedInvoiceForDunning && (
        <Modal
          isOpen={!!selectedInvoiceForDunning}
          onClose={() => setSelectedInvoiceForDunning(null)}
          title={`Dunning Notice: ${selectedInvoiceForDunning.ci_number}`}
        >
          <div className="space-y-4">
            <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-stone-500">Customer:</span>
                <span className="font-semibold text-stone-800">
                  {selectedInvoiceForDunning.customer_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Outstanding Balance:</span>
                <span className="font-mono font-bold text-stone-900 tabular-nums">
                  {formatIDR(selectedInvoiceForDunning.outstanding_amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Dunning Tier:</span>
                <span className="font-medium text-stone-700">
                  {selectedInvoiceForDunning.dunning_level}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Notice Message Content:
              </label>
              <textarea
                rows={5}
                value={customDunningMessage}
                onChange={(e) => setCustomDunningMessage(e.target.value)}
                className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-stone-400 font-sans leading-relaxed"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyMessage}
                className="text-stone-600 hover:text-stone-900"
              >
                <Copy className="w-3.5 h-3.5 mr-1" />
                Copy Text
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedInvoiceForDunning(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSendWhatsApp}
                  className="bg-stone-900 hover:bg-stone-800 text-white"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Dispatch via WhatsApp
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
