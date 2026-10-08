import React, { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { getDailyAuthKey } from "@/utils/auth";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  RotateCcw,
  WalletCards,
  Clock,
  CheckCircle2,
  TrendingUp,
  KeyRound,
  Search,
  FileText,
  ChevronRight,
  Trash2,
  ArrowRight,
  Coins,
  Eye,
  Calendar,
  Key,
  Download,
  QrCode,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { Modal } from "@/components/ui/Modal";
import { formatIDR, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "motion/react";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { generatePDF } from "@/lib/pdfGenerator";

export default function Payroll() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [payrollReqs, setPayrollReqs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [confirmVoid, setConfirmVoid] = useState<{
    isOpen: boolean;
    id: string;
    amount: number;
  }>({ isOpen: false, id: "", amount: 0 });

  // PRq Review Modal for Finance
  const [selectedPrq, setSelectedPrq] = useState<any | null>(null);
  const [isPrqReviewModalOpen, setIsPrqReviewModalOpen] = useState(false);
  const [isProcessingPrq, setIsProcessingPrq] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [selectedPayrollToPay, setSelectedPayrollToPay] = useState<any>(null);
  const [selectedPayrollHeader, setSelectedPayrollHeader] = useState<any>(null);
  const [viewDetailsData, setViewDetailsData] = useState<any[]>([]);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);
  const [authPin, setAuthPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const exportPayrollPdf = async () => {
    if (!docRef.current) return;
    setIsExportingPdf(true);
    try {
      const monthStr = selectedPayrollHeader?.period_month ? (months[selectedPayrollHeader.period_month - 1] || "PERIOD") : "PERIOD";
      const yearStr = selectedPayrollHeader?.period_year || "";
      await generatePDF(
        docRef.current,
        `PAYROLL_SUMMARY_${monthStr}_${yearStr}.pdf`,
      );
      showToast("Payroll summary document exported successfully", "success");
    } catch (e) {
      console.error(e);
      showToast("Failed to export Payroll Summary PDF", "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const years = [
    new Date().getFullYear().toString(),
    (new Date().getFullYear() - 1).toString(),
    (new Date().getFullYear() - 2).toString(),
  ];

  const handleVoidPayment = async () => {
    if (!confirmVoid.id) return;
    try {
      const authUser = user?.username || (user as any)?.email || "";
      const authPin = getDailyAuthKey(authUser);
      const res = await apiFetch(
        `/api/finance/payrolls/${confirmVoid.id}/void`,
        {
          method: "PUT",
          body: JSON.stringify({
            pin: authPin,
            notes: "Voided by user via UI",
          }),
        },
        authUser,
      );

      if (res.ok) {
        showToast("Payroll voided successfully", "success");
        setConfirmVoid({ isOpen: false, id: "", amount: 0 });
        fetchPayrolls();
      } else {
        showToast(res.error || "Failed to void payroll", "error");
      }
    } catch (e) {
      showToast("Error voiding payroll", "error");
    }
  };

  const fetchPayrolls = async () => {
    setIsLoading(true);
    try {
      const [resPayrolls, resPrqs] = await Promise.all([
        apiFetch("/api/finance/payrolls", {}, user?.username),
        apiFetch("/api/hr/payroll-requisitions", {}, user?.username),
      ]);
      if (resPayrolls.ok) {
        setPayrolls(Array.isArray(resPayrolls.data) ? resPayrolls.data : []);
      }
      if (resPrqs.ok) {
        setPayrollReqs(Array.isArray(resPrqs.data) ? resPrqs.data : []);
      }
    } catch (err) {
      showToast("Error fetching payroll data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenPrqReview = async (prq: any) => {
    try {
      const res = await apiFetch(`/api/hr/payroll-requisitions/${prq.id}`, {}, user?.username);
      if (res.ok && res.data) {
        let parsedDetails = res.data.details || [];
        if (!Array.isArray(parsedDetails) && typeof res.data.details_json === 'string') {
          try { parsedDetails = JSON.parse(res.data.details_json); } catch (e) {}
        }
        setSelectedPrq({ ...res.data, details: parsedDetails });
        setShowRejectInput(false);
        setRejectionReason("");
        setPrqAuthPin("");
        setPrqAttachment(null);
        setIsPrqReviewModalOpen(true);
      } else {
        showToast("Failed to load PRq details", "error");
      }
    } catch (e) {
      showToast("Error loading PRq details", "error");
    }
  };

  const [prqAuthPin, setPrqAuthPin] = useState("");
  const [prqAttachment, setPrqAttachment] = useState<File | null>(null);

  const handleApproveAndConvertPrq = async (prqId: string) => {
    setIsProcessingPrq(true);
    try {
      const res = await apiFetch(
        `/api/hr/payroll-requisitions/${prqId}/convert`,
        {
          method: "POST",
          body: JSON.stringify({ approved: true }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast("PRq submission successfully approved & converted to Payroll Disbursement Order!", "success");
        setIsPrqReviewModalOpen(false);
        fetchPayrolls();
      } else {
        showToast(res.error || "Failed to convert PRq", "error");
      }
    } catch (e) {
      showToast("Error processing PRq conversion", "error");
    } finally {
      setIsProcessingPrq(false);
    }
  };

  const handleRejectPrq = async (prqId: string) => {
    if (!rejectionReason.trim()) {
      showToast("Alasan penolakan wajib diisi", "error");
      return;
    }
    setIsProcessingPrq(true);
    try {
      const res = await apiFetch(
        `/api/hr/payroll-requisitions/${prqId}/reject`,
        {
          method: "POST",
          body: JSON.stringify({ reason: rejectionReason }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast("PRq submission returned to HR for revision", "success");
        setIsPrqReviewModalOpen(false);
        fetchPayrolls();
      } else {
        showToast(res.error || "Failed to reject PRq", "error");
      }
    } catch (e) {
      showToast("Error processing PRq rejection", "error");
    } finally {
      setIsProcessingPrq(false);
    }
  };

  useEffect(() => {
    fetchPayrolls();
  }, []);


  const fetchPayrollDetails = async (payroll: any) => {
    setSelectedPayrollHeader(payroll);
    try {
      const res = await apiFetch(
        `/api/finance/payrolls/${payroll.id}/details`,
        {},
        user?.username,
      );
      if (res.ok) {
        const data = res.data || {};
        let detailsArr = data.details || [];
        if (!Array.isArray(detailsArr) && typeof data.details_json === 'string') {
          try { detailsArr = JSON.parse(data.details_json); } catch (e) {}
        }
        if (!Array.isArray(detailsArr) && Array.isArray(data)) {
          detailsArr = data;
        }
        setViewDetailsData(Array.isArray(detailsArr) ? detailsArr : []);
        if (data.id) {
          setSelectedPayrollHeader(data);
        }
        setIsDetailsModalOpen(true);
      } else {
        showToast("Failed to fetch details", "error");
      }
    } catch (err) {
      showToast("Error connecting to server", "error");
    }
  };

  const handlePay = async (submittedPin: string) => {
    if (!selectedPayrollToPay || !submittedPin) return;
    if (submittedPin !== getDailyAuthKey(user?.username)) {
      showToast("Invalid authorization PIN", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/finance/payrolls/${selectedPayrollToPay.id}/pay`,
        {
          method: "PUT",
          body: JSON.stringify({ pin: submittedPin }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Payroll marked as PAID (FINISHED)", "success");
        setSelectedPayrollToPay(null);
        setAuthPin("");
        fetchPayrolls();
      } else {
        showToast(res.error || "Failed", "error");
      }
    } catch (err) {
      showToast("Error processing payment", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPayrolls = payrolls.filter((p) => {
    const mStr = p.period_month != null ? String(p.period_month) : "";
    const yStr = p.period_year != null ? String(p.period_year) : "";
    const nameStr = p.period_name != null ? String(p.period_name).toLowerCase() : "";
    const term = (searchTerm || "").toLowerCase();
    return mStr.includes(term) || yStr.includes(term) || nameStr.includes(term);
  });

  const pendingPayrolls = filteredPayrolls.filter(
    (p) =>
      p.status === "DRAFTED" ||
      p.status === "ISSUED" ||
      p.status === "AUTHORIZED",
  );
  const paidPayrolls = filteredPayrolls.filter(
    (p) => p.status === "PAID" || p.status === "FINISHED",
  );

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-500">
      <ConfirmModal
        isOpen={confirmVoid.isOpen}
        title="Void Payroll Payment"
        message={`Are you sure you want to void this payroll payment? This will reverse the transaction and update the ledger. Amount to reverse: ${formatIDR(confirmVoid.amount)}`}
        onConfirm={handleVoidPayment}
        onCancel={() => setConfirmVoid({ isOpen: false, id: "", amount: 0 })}
      />

      <PageHeader
        title={t("Payroll Processing")}
        subtitle={t("Employee salaries and disbursement")}
        icon={<WalletCards className="w-6 h-6" />}
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              onClick={() => setIsGenerateModalOpen(true)}
              variant="primary"
              className="rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2"
            >
              <WalletCards className="w-4 h-4" />
              Issue Payroll PO
            </Button>
          </div>
        }
      />

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-lg">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder={t("Search by Month (1-12) or Year...")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-2xl text-sm focus:border-stone-400 outline-none transition-colors shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Pending Payroll Column */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              {t("Pending Authorization")}
              <span className="ml-2 bg-stone-100 text-stone-600 py-0.5 px-2 rounded-full text-[10px]">
                {pendingPayrolls.length}
              </span>
            </h3>
          </div>

          <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-4">
                <div className="w-8 h-8 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin"></div>
              </div>
            ) : pendingPayrolls.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-stone-50 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-sm font-bold text-stone-900">
                  {t("All Clear")}
                </p>
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500 mt-2">
                  {t("No pending payroll")}
                </p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-stone-50/50 border-b border-stone-100">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-stone-500">
                      {t("Period & Status")}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-stone-500 text-right">
                      {t("Total & Action")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  <AnimatePresence>
                    {pendingPayrolls.map((payroll, index) => (
                      <motion.tr
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ delay: index * 0.05 }}
                        key={payroll.id}
                        className="group hover:bg-stone-50/50 transition-colors"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                              <WalletCards className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-sm font-bold font-mono text-stone-900">
                                {payroll.period_name || `${months[(payroll.period_month || 1) - 1] || ""} ${payroll.period_year || ""}`}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-600">
                                  {payroll.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex flex-col items-end gap-3">
                            <div className="text-sm font-black font-mono tracking-tight text-amber-600">
                              {formatIDR(payroll.total_amount)}
                            </div>
                            <div className="flex items-center gap-2 w-full justify-end">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="rounded-xl px-2.5 py-1.5 shadow-sm text-stone-700 hover:bg-stone-100 flex items-center gap-1 cursor-pointer"
                                onClick={() => fetchPayrollDetails(payroll)}
                                title="View Document Details"
                              >
                                <Eye className="w-3.5 h-3.5 text-stone-600" />
                                
                              </Button>
                              <Button
                                size="sm"
                                className="rounded-xl text-xs font-bold px-3.5 py-1.5 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow transition-all shrink-0 cursor-pointer"
                                onClick={() => {
                                  setSelectedPayrollToPay(payroll);
                                  setAuthPin("");
                                }}
                              >
                                <Coins className="w-3.5 h-3.5" />
                                {t("Pay Now")}
                              </Button>
                            </div>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Paid Payroll Column */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {t("Settled Payments")}
              <span className="ml-2 bg-stone-100 text-stone-600 py-0.5 px-2 rounded-full text-[10px]">
                {paidPayrolls.length}
              </span>
            </h3>
          </div>

          <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-4">
                <div className="w-8 h-8 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin"></div>
              </div>
            ) : paidPayrolls.length === 0 ? (
              <div className="p-12 text-center text-[11px] font-bold uppercase tracking-widest text-stone-500">
                {t("No settled payroll")}
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-stone-50/50 border-b border-stone-100">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-stone-500">
                      {t("Period")}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-stone-500 text-right">
                      {t("Total")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {paidPayrolls.map((payroll, index) => (
                    <motion.tr
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      key={payroll.id}
                      className="group hover:bg-stone-50/50 transition-colors"
                    >
                      <td className="px-6 py-5">
                        <div className="text-xs font-bold font-mono text-stone-900 flex items-center gap-2">
                          {payroll.period_name || `${months[(payroll.period_month || 1) - 1] || ""} ${payroll.period_year || ""}`}
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                        <div className="text-[9px] font-bold text-stone-500 mt-1.5 tracking-widest uppercase">
                          ID: {payroll.id.split("-")[0]}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right font-mono font-bold text-stone-900">
                        <div>{formatIDR(payroll.total_amount)}</div>
                        <div className="flex items-center justify-end gap-2 mt-2">
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={() => fetchPayrollDetails(payroll)}
                            title="View Document Details"
                            className="px-2.5 py-1 shadow-sm border border-stone-200 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-stone-600" />
                            
                          </Button>
                          <Button
                            size="xs"
                            variant="danger_soft"
                            onClick={() =>
                              setConfirmVoid({
                                isOpen: true,
                                id: payroll.id,
                                amount: payroll.total_amount,
                              })
                            }
                            title={t("Void Payment")}
                            className="px-2"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Pay Modal */}
      <AuthorizeDocModal
        isOpen={!!selectedPayrollToPay}
        onClose={() => {
          setSelectedPayrollToPay(null);
          setAuthPin("");
        }}
        docType="Mass Payroll Disbursement"
        docNumber={selectedPayrollToPay?.id || ""}
        status={selectedPayrollToPay?.status}
        amount={selectedPayrollToPay?.total_amount}
        subtitle="Log payroll expense and centrally record it in the Finance Hub."
        isSubmitting={isSubmitting}
        onAuthorize={handlePay}
      />

      {/* PRq List Modal */}
      <Modal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        title="HR Payroll Submissions (PRq)"
        description="HR cost packing list submitted by the HR Division. Review and approve to convert into an official Payroll Disbursement Order."
        maxWidth="5xl"
        contentClassName="p-0 border-t border-stone-100"
      >
        <div className="p-6">
          {(!Array.isArray(payrollReqs) || payrollReqs.length === 0) ? (
            <div className="py-12 text-center text-xs font-bold tracking-wider uppercase text-stone-400 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
              No PRq documents submitted by the HR Team yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-stone-200/80 shadow-2xs max-h-[60vh] bg-white">
              <table className="w-full text-left font-sans text-xs border-collapse min-w-[750px]">
                <thead className="sticky top-0 bg-stone-50/95 backdrop-blur-xs text-stone-500 uppercase text-[10px] font-bold tracking-wider border-b border-stone-200 z-10">
                  <tr>
                    <th className="p-3.5 pl-5 whitespace-nowrap">No. Requisition</th>
                    <th className="p-3.5 whitespace-nowrap">Payroll Period</th>
                    <th className="p-3.5 whitespace-nowrap">Total Employees</th>
                    <th className="p-3.5 text-right whitespace-nowrap">Disbursement Request</th>
                    <th className="p-3.5 text-center whitespace-nowrap">HR Status</th>
                    <th className="p-3.5 text-center pr-5 whitespace-nowrap">Finance Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-700 font-medium">
                  {(Array.isArray(payrollReqs) ? payrollReqs : []).map((prq: any) => {
                    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                    const periodText = `${monthNames[(prq.period_month || 1) - 1]} ${prq.period_year || 2026}`;
                    let detailCount = 0;
                    try {
                      const parsedDet = typeof prq.details_json === 'string' ? JSON.parse(prq.details_json) : prq.details;
                      if (Array.isArray(parsedDet)) detailCount = parsedDet.length;
                    } catch (e) {
                      detailCount = 0;
                    }

                    return (
                      <tr key={prq.id} className="hover:bg-stone-50/60 transition-colors">
                        <td className="p-3.5 pl-5 font-mono font-bold text-stone-900 whitespace-nowrap">{prq.requisition_no || prq.requisition_number}</td>
                        <td className="p-3.5 text-stone-600 whitespace-nowrap">{periodText}</td>
                        <td className="p-3.5 text-stone-600 whitespace-nowrap">{prq.total_employees || detailCount} Employees</td>
                        <td className="p-3.5 text-right font-mono font-black text-brand whitespace-nowrap">{formatIDR(prq.total_net_pay || prq.total_net || 0)}</td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          {prq.status === "SUBMITTED" && (
                            <span className="px-2.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200/80 text-[10px] font-bold uppercase tracking-wider rounded-md">Needs Review</span>
                          )}
                          {prq.status === "CONVERTED" && (
                            <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-[10px] font-bold uppercase tracking-wider rounded-md">PO Issued</span>
                          )}
                          {prq.status === "REJECTED" && (
                            <span className="px-2.5 py-0.5 bg-rose-50 text-rose-800 border border-rose-200/80 text-[10px] font-bold uppercase tracking-wider rounded-md">Rejected</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center pr-5 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setIsGenerateModalOpen(false); // Close list modal
                              handleOpenPrqReview(prq); // Open review modal
                            }}
                            className="px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-white text-[11px] font-bold rounded-lg transition-all shadow-2xs cursor-pointer"
                          >
                            {prq.status === "SUBMITTED" ? "Review & Approve" : "PRq Details"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-stone-100 bg-stone-50/50 flex justify-end gap-3 rounded-b-2xl">
          <button
            type="button"
            onClick={() => setIsGenerateModalOpen(false)}
            className="px-5 py-2 text-stone-500 hover:text-stone-900 text-xs font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </Modal>

      {/* View Details / Payroll PDF Document Preview Modal */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title={`Payroll Summary Document: ${selectedPayrollHeader ? (selectedPayrollHeader.period_name || `${months[(selectedPayrollHeader.period_month || 1) - 1] || ""} ${selectedPayrollHeader.period_year || ""}`) : "PERIOD"}`}
        maxWidth="5xl"
        contentClassName="p-0 flex flex-col h-[85vh] border-t border-stone-100"
      >
        <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
          <PdfPreviewWrapper>
            <PrintTemplate
              ref={docRef}
              documentTitleId="EMPLOYEE PAYROLL SUMMARY"
              documentTitleEn="EMPLOYEE PAYROLL SUMMARY"
              documentNameId="PAYROLL SUMMARY SLIP"
              documentNameEn="PAYROLL MASTER DISBURSEMENT"
              date={
                selectedPayrollHeader?.created_at
                  ? new Date(selectedPayrollHeader.created_at).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })
                  : new Date().toLocaleDateString("id-ID")
              }
              referenceNumber={selectedPayrollHeader ? `PAYROLL-${selectedPayrollHeader.period_month || 1}-${selectedPayrollHeader.period_year || 2026}` : "PAYROLL-DOC"}
              documentId={selectedPayrollHeader?.id || "PAYROLL-ID"}
            >
              <div className="bg-white p-8 text-sm text-black flex flex-col h-full justify-between">
                <div>
                  {/* Header Subject */}
                  <div className="mb-6 p-4 bg-white rounded-lg border border-stone-200 grid grid-cols-2 gap-8">
                    <div>
                      <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1">
                        PAYROLL PERIOD
                      </div>
                      <div className="text-base font-black text-stone-900 tracking-tight leading-tight uppercase mb-1">
                        {selectedPayrollHeader ? (selectedPayrollHeader.period_name || `${months[(selectedPayrollHeader.period_month || 1) - 1] || ""} ${selectedPayrollHeader.period_year || ""}`) : "ACTIVE PERIOD"}
                      </div>
                      <div className="text-xs text-stone-600 font-medium">
                        Status Disbursed: <span className="font-bold text-emerald-600 uppercase tracking-wide">{selectedPayrollHeader?.status || "PAID"}</span>
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end justify-center">
                      <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1">
                        TOTAL DISBURSEMENT
                      </div>
                      <div className="text-xl font-black text-stone-900 font-mono">
                        {formatIDR(selectedPayrollHeader?.total_amount || selectedPayrollHeader?.total_net || (Array.isArray(viewDetailsData) ? viewDetailsData.reduce((acc, curr) => acc + Number(curr.net_salary || curr.net_pay || 0), 0) : 0))}
                      </div>
                      <div className="text-xs text-stone-500 font-semibold mt-1">
                        Total Employees: <span className="font-bold text-stone-900">{Array.isArray(viewDetailsData) ? viewDetailsData.length : 0} Personnel</span>
                      </div>
                    </div>
                  </div>

                  {/* Employee Salary Table */}
                  <div className="mb-6">
                    <div className="text-xl text-stone-900 uppercase tracking-widest font-black mb-4 ml-1">
                      Employee Salary Breakdown
                    </div>
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-stone-300 bg-white">
                          <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-sm w-12 text-center">
                            No
                          </th>
                          <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-sm">
                            Employee Name
                            <div className="text-[10px] font-bold text-stone-500 tracking-widest mt-1">
                              EMPLOYEE NAME
                            </div>
                          </th>
                          <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-sm">
                            Basic Salary
                            <div className="text-[10px] font-bold text-stone-500 tracking-widest mt-1">
                              BASE SALARY
                            </div>
                          </th>
                          <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-sm">
                            Allowances
                            <div className="text-[10px] font-bold text-stone-500 tracking-widest mt-1">
                              ALLOWANCES
                            </div>
                          </th>
                          <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-sm">
                            Deductions
                            <div className="text-[10px] font-bold text-stone-500 tracking-widest mt-1">
                              DEDUCTIONS
                            </div>
                          </th>
                          <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-sm">
                            Net Salary
                            <div className="text-[10px] font-bold text-stone-500 tracking-widest mt-1">
                              NET SALARY
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-150">
                        {(Array.isArray(viewDetailsData) ? viewDetailsData : []).map((d: any, idx: number) => {
                          const empName = d.employee_name || d.name || d.employee_username || d.username || "Employee";
                          const baseSal = Number(d.base_salary ?? d.basic_salary ?? 0);
                          const allowances = Number(d.allowances ?? 0) + Number(d.position_allowance ?? 0) + Number(d.overtime_pay ?? 0) + Number(d.travel_allowance ?? 0) + Number(d.reimbursement_amount ?? 0);
                          const deductions = Number(d.deductions ?? d.total_deductions ?? 0);
                          const netSal = Number(d.net_salary ?? d.net_pay ?? (baseSal + allowances - deductions));

                          return (
                            <tr key={d.id || idx}>
                              <td className="py-3 px-3 text-center font-bold text-stone-900 text-xs tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="py-3 px-3 text-sm font-black text-stone-900 uppercase tracking-tight">
                                {empName}
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-xs text-stone-700">
                                {formatIDR(baseSal)}
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-xs text-emerald-700">
                                +{formatIDR(allowances)}
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-xs text-rose-700">
                                -{formatIDR(deductions)}
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-black text-sm text-stone-900">
                                {formatIDR(netSal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="mt-6 flex justify-end">
                      <div className="w-[440px] space-y-2">
                        <div className="flex justify-between items-center pt-3 border-t-2 border-stone-900 px-3 font-black text-base uppercase tracking-wider gap-3">
                          <span className="text-stone-900 whitespace-nowrap">TOTAL DISBURSED</span>
                          <span className="font-mono text-base tracking-tight text-emerald-700 whitespace-nowrap">
                            {formatIDR(selectedPayrollHeader?.total_amount || selectedPayrollHeader?.total_net || (Array.isArray(viewDetailsData) ? viewDetailsData.reduce((acc, curr) => acc + Number(curr.net_salary || curr.net_pay || 0), 0) : 0))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Finance Manager Signature Block */}
                <div className="flex justify-end pt-6 border-t border-stone-200 mt-8 w-full">
                  <div className="flex flex-col items-center w-64 text-center">
                    <div className="text-[9px] text-stone-900 uppercase tracking-widest font-bold mb-2">
                      Approve by Finance Manager
                    </div>
                    <div className="h-14 flex items-center justify-center w-full mb-1">
                      <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg">
                        <QrCode className="w-6 h-6 text-emerald-600" />
                        <div className="text-left">
                          <div className="text-[9px] font-black text-emerald-800 uppercase">Validated Securely</div>
                          <div className="text-[8px] font-mono text-emerald-700">Digital Approval PIN</div>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] font-black text-stone-900 uppercase mt-1">Finance Manager</p>
                    <div className="pt-1 flex flex-col justify-center items-center w-full">
                      <div className="w-28 border-b border-stone-300 mb-1"></div>
                    </div>
                  </div>
                </div>
              </div>
            </PrintTemplate>
          </PdfPreviewWrapper>
        </div>

        <div className="p-6 border-t border-stone-100 bg-white flex justify-center gap-4">
          <Button
            variant="secondary"
            onClick={() => setIsDetailsModalOpen(false)}
            className="px-6 py-2.5 rounded-xl text-sm"
          >
            {t("Close")}
          </Button>
          <Button
            variant="primary"
            onClick={exportPayrollPdf}
            isLoading={isExportingPdf}
            className="px-6 py-2.5 rounded-xl text-sm shadow-md"
          >
            {!isExportingPdf && <Download className="w-4 h-4" />}
            {isExportingPdf ? "Mengekspor..." : "Ekspor PDF (A4)"}
          </Button>
        </div>
      </Modal>
      {/* PRq REVIEW & CONVERT MODAL FOR FINANCE */}
      <Modal
        isOpen={isPrqReviewModalOpen}
        onClose={() => setIsPrqReviewModalOpen(false)}
        title="Review HR Payroll Submission Document (PRq)"
        description="Verify HR cost component packing list before approving issuance of Payroll Disbursement Order."
        maxWidth="5xl"
      >
        {selectedPrq && (
          <div className="space-y-6 text-left">
            <div className="bg-stone-50/80 p-5 rounded-2xl border border-stone-200/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-2xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                    Requisition No
                  </span>
                  <span className="font-mono text-xs font-bold px-2.5 py-0.5 bg-stone-900 text-white rounded-md">
                    {selectedPrq.requisition_no || selectedPrq.requisition_number || "PRQ-DRAFT"}
                  </span>
                </div>
                <p className="text-xs font-medium text-stone-500">
                  Submitted By HR: <span className="font-bold text-stone-800">@{selectedPrq.prepared_by || "HR Team"}</span>
                </p>
              </div>

              <div className="md:text-right space-y-0.5 border-t md:border-t-0 pt-2 md:pt-0 border-stone-200 w-full md:w-auto">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">
                  Total Net Disbursement Request
                </span>
                <p className="text-2xl font-mono font-black text-brand">
                  {formatIDR(selectedPrq.total_net_pay || selectedPrq.total_net || 0)}
                </p>
                <div className="text-[11px] text-stone-500 font-medium">
                  Total Gross: <span className="font-mono font-bold text-stone-700">{formatIDR(selectedPrq.total_gross_pay || selectedPrq.total_gross || 0)}</span>
                  {" • "}
                  Deductions: <span className="font-mono font-bold text-rose-600">{formatIDR(selectedPrq.total_deductions || 0)}</span>
                </div>
              </div>
            </div>

            {/* DETAILS BREAKDOWN */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-2">
                  <span>Employee Packing List</span>
                  <span className="px-2 py-0.5 bg-stone-100 text-stone-600 rounded-full text-[10px] font-mono font-bold">
                    {selectedPrq.details?.length || 0} Employees
                  </span>
                </h4>
              </div>

              <div className="overflow-x-auto border border-stone-200/80 rounded-xl shadow-2xs max-h-80 bg-white">
                <table className="w-full text-left font-sans text-xs border-collapse min-w-[700px]">
                  <thead className="sticky top-0 bg-stone-50/95 backdrop-blur-xs text-stone-500 uppercase text-[10px] font-bold tracking-wider border-b border-stone-200 z-10">
                    <tr>
                      <th className="p-3 pl-4 whitespace-nowrap">Employee Name</th>
                      <th className="p-3 text-right whitespace-nowrap">Basic Salary</th>
                      <th className="p-3 text-right whitespace-nowrap">Overtime Pay</th>
                      <th className="p-3 text-right whitespace-nowrap">Business Trip & Reimburse</th>
                      <th className="p-3 text-right whitespace-nowrap">Deductions (Absence/Tax)</th>
                      <th className="p-3 pr-4 text-right whitespace-nowrap">Take Home Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700 font-medium">
                    {(selectedPrq.details || []).map((det: any, idx: number) => {
                      const empName = det.name || det.employee_name || det.username || det.employee_username || "Employee";
                      const empUser = det.username || det.employee_username || "";
                      const travelReimburse = Number(det.travel_allowance || 0) + Number(det.reimbursement_amount || 0);

                      return (
                        <tr key={det.id || det.employee_username || idx} className="hover:bg-stone-50/60 transition-colors">
                          <td className="p-3 pl-4 whitespace-nowrap">
                            <div className="font-bold text-stone-900">{empName}</div>
                            {empUser && <div className="text-[10px] font-mono text-stone-400">@{empUser}</div>}
                          </td>
                          <td className="p-3 text-right font-mono whitespace-nowrap text-stone-800">
                            {formatIDR(det.basic_salary)}
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <span className="font-mono text-[11px] text-amber-700 font-bold bg-amber-50/70 px-2 py-0.5 rounded-md inline-block">
                              +{formatIDR(det.overtime_pay)}
                            </span>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <span className="font-mono text-[11px] text-blue-700 font-bold bg-blue-50/70 px-2 py-0.5 rounded-md inline-block">
                              +{formatIDR(travelReimburse)}
                            </span>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <span className="font-mono text-[11px] text-rose-600 font-bold bg-rose-50/70 px-2 py-0.5 rounded-md inline-block">
                              -{formatIDR(det.total_deductions)}
                            </span>
                          </td>
                          <td className="p-3 pr-4 text-right font-mono font-black text-stone-900 whitespace-nowrap text-sm">
                            {formatIDR(det.net_pay)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedPrq.notes && (
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200/80 text-xs text-stone-700">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                  Submission Notes from HR:
                </span>
                <p className="font-medium text-stone-800">{selectedPrq.notes}</p>
              </div>
            )}

            {showRejectInput && (
              <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-xl space-y-2 animate-in fade-in">
                <label className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">
                  Reason for Rejection / Revision Notes to HR:
                </label>
                <textarea
                  rows={2}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Example: Overtime detail does not attach supervisor approval report, please fix."
                  className="w-full px-3 py-2 bg-white border border-rose-200 rounded-lg text-xs font-medium text-stone-800 focus:ring-1 focus:ring-rose-400 outline-none resize-none shadow-2xs"
                />
              </div>
            )}

            <div className="pt-4 border-t border-stone-100 flex flex-col sm:flex-row justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPrqReviewModalOpen(false)}
                className="px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
                {selectedPrq.status === "SUBMITTED" && (
                  <>
                    {!showRejectInput ? (
                      <button
                        type="button"
                        onClick={() => setShowRejectInput(true)}
                        className="px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        Reject & Return to HR
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isProcessingPrq}
                        onClick={() => handleRejectPrq(selectedPrq.id)}
                        className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isProcessingPrq ? "Processing..." : "Confirm Rejection"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isProcessingPrq}
                      onClick={() => handleApproveAndConvertPrq(selectedPrq.id)}
                      className="px-6 py-2.5 bg-brand hover:bg-[#8e1e1d] text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isProcessingPrq ? "Issuing..." : "Approve & Issue Disbursement Order (Payroll PO)"}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
