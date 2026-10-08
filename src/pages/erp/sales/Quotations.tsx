import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { getDailyAuthKey } from "@/utils/auth";
import {
  FileText,
  Plus,
  Search,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Filter,
  RefreshCw,
  Briefcase,
  TrendingUp,
  FolderKanban,
  FileSpreadsheet,
  Send,
  ShoppingBag,
  Printer,
  Building2,
  Zap,
  Calculator,
} from "lucide-react";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { ReviseDocModal } from "@/components/erp/ReviseDocModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { CreateQuotationModal } from "@/components/erp/CreateQuotationModal";
import { QuotationPreviewModal } from "@/components/erp/QuotationPreviewModal";
import { ThermalReceiptModal } from "@/components/erp/ThermalReceiptModal";
import { CreateProjectModal } from "@/components/erp/CreateProjectModal";
import { NtpPreviewModal } from "@/components/erp/NtpPreviewModal";
import { SendEmailModal } from "@/components/erp/SendEmailModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { HasRole } from "@/components/shared/HasRole";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { generatePDF } from "@/lib/pdfGenerator";
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/utils";

export default function Quotations() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [quotations, setQuotations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterChannel, setFilterChannel] = useState<string>("ALL");
  const [initialModalSettlement, setInitialModalSettlement] = useState<"IMMEDIATE" | "CREDIT_TERM">("CREDIT_TERM");
  const [selectedReceiptForPrint, setSelectedReceiptForPrint] = useState<any>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<any>(null);
  const [revisingQuotation, setRevisingQuotation] = useState<any>(null);
  const [confirmModal, setConfirmModal] = useState<any>(null);

  const [showAuthorizeModal, setShowAuthorizeModal] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [selectedQuoToAuth, setSelectedQuoToAuth] = useState<any>(null);
  const [authPin, setAuthPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [createProjectQuotationId, setCreateProjectQuotationId] = useState("");
  const [selectedNtpForPreview, setSelectedNtpForPreview] = useState<any>(null);
  
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedDocForEmail, setSelectedDocForEmail] = useState<any>(null);
  const [selectedProjectForNtp, setSelectedProjectForNtp] = useState<any>(null);

  const exportPdfRef = React.useRef<HTMLDivElement>(null);

  const handleDownloadPdf = async () => {
    if (!exportPdfRef.current || !selectedDocForEmail) return;
    try {
      await generatePDF(
        exportPdfRef.current,
        `Quotation_${selectedDocForEmail.quotation_number}.pdf`
      );
      showToast("PDF Downloaded. Please attach it to your message.", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to generate PDF", "error");
    }
  };

  const fetchQuotations = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/quotations", {}, user?.username);
      if (res.ok) {
        setQuotations(
          Array.isArray(res.data) ? res.data : res.data?.data || [],
        );
      } else {
        showToast("Failed to fetch quotations", "error");
      }
    } catch (err) {
      showToast("Connection error", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteQuotation = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Quotation?",
      message:
        "Are you sure you want to delete this quotation? This action cannot be undone.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/quotations/${id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) {
            fetchQuotations();
            showToast("Quotation deleted successfully", "success");
          } else {
            showToast(res.error || "Failed to delete quotation", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error deleting quotation", "error");
        }
      },
    });
  };

  const handleAuthorize = async (pin: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/quotations/${selectedQuoToAuth.id}/authorize`,
        {
          method: "POST",
          body: JSON.stringify({ pin }),
        },
        user?.username,
      );
      if (res.ok) {
        setShowAuthorizeModal(false);
        setAuthPin("");
        fetchQuotations();
        showToast("Quotation authorized successfully", "success");
        setSelectedDocForEmail(selectedQuoToAuth);
        setShowEmailModal(true);
      } else {
        showToast(res.error || "Failed to authorize quotation", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Server error while authorizing", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevise = async (note: string) => {
    if (!note.trim()) {
      showToast("Validation Failed: Revision note is required.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/quotations/${selectedQuoToAuth.id}/revise`,
        {
          method: "POST",
          body: JSON.stringify({
            pin: getDailyAuthKey(user?.username),
            revision_note: note,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        setShowReviseModal(false);
        setRevisionNote("");
        fetchQuotations();
        showToast("Quotation marked for revision", "success");
      } else {
        showToast(
          res.error || "Failed to marking quotation for revision",
          "error",
        );
      }
    } catch (err) {
      console.error(err);
      showToast("Server error while revising quotation", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  const filtered = useMemo(() => {
    return quotations.filter((q) => {
      const qNum = (q.quotation_number || "").toLowerCase();
      const rNum = (q.receipt_number || "").toLowerCase();
      const title = (q.title || "").toLowerCase();
      const cust = (q.customer_name || "").toLowerCase();
      const manualCust = (q.customer_name_manual || "").toLowerCase();
      const s = searchQuery.toLowerCase();

      const matchesSearch =
        title.includes(s) ||
        qNum.includes(s) ||
        rNum.includes(s) ||
        cust.includes(s) ||
        manualCust.includes(s);

      const matchesFilter = filterStatus === "ALL" || q.status === filterStatus;

      const isRetail = q.sales_channel === "DIRECT_RETAIL" || q.settlement_type === "IMMEDIATE";
      const matchesChannel =
        filterChannel === "ALL" ||
        (filterChannel === "DIRECT_RETAIL" && isRetail) ||
        (filterChannel === "B2B_PROJECT" && !isRetail);

      return matchesSearch && matchesFilter && matchesChannel;
    });
  }, [quotations, searchQuery, filterStatus, filterChannel]);

  const totalAmount = useMemo(
    () =>
      quotations
        .filter((q) =>
          ["PENDING", "APPROVED", "REVISION", "PROCESSED"].includes(q.status),
        )
        .reduce(
          (sum, q) =>
            sum +
            (Number(q.grand_total) > 0
              ? Number(q.grand_total)
              : Number(q.net_amount) || Number(q.amount) || 0),
          0,
        ),
    [quotations],
  );
  const pendingCount = quotations.filter((q) => q.status === "PENDING").length;
  const retailCount = quotations.filter((q) => q.sales_channel === "DIRECT_RETAIL" || q.settlement_type === "IMMEDIATE").length;
  const b2bCount = quotations.filter((q) => q.sales_channel !== "DIRECT_RETAIL" && q.settlement_type !== "IMMEDIATE").length;

  const getQuotationEmailBody = (doc: any) => {
    if (!doc) return "";
    const discountRate = Number(doc.discount_rate) || 0;
    const discountAmount = Number(doc.discount_amount) || 0;
    const hasDiscount = discountRate > 0 || discountAmount > 0;

    const issueDate = doc.created_at
      ? new Date(doc.created_at).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";
    const totalVal = doc.grand_total || doc.amount;
    const validityDays = doc.validity_days || 14;
    const projectTitle = doc.title && doc.title.trim() ? doc.title.trim() : null;
    const itemCount = Array.isArray(doc.items) && doc.items.length > 0 ? doc.items.length : null;

    return `Kepada Yth. Bapak/Ibu ${doc.customer_name || "Pelanggan"},

Dengan hormat,

Terima kasih atas minat dan kepercayaan yang diberikan kepada 𝗖𝗩 𝗕𝗮𝘁𝘂 𝗘𝗺𝗮𝘀 𝗚𝗿𝗼𝘂𝗽.

Menindaklanjuti permintaan kebutuhan pengadaan Anda, bersama surel ini kami melampirkan surat resmi 𝗣𝗲𝗻𝗮𝘄𝗮𝗿𝗮𝗻 𝗛𝗮𝗿𝗴𝗮 (𝗤𝘂𝗼𝘁𝗮𝘁𝗶𝗼𝗻) dengan rincian sebagai berikut:

𝗥𝗶𝗻𝗰𝗶𝗮𝗻 𝗣𝗲𝗻𝗮𝘄𝗮𝗿𝗮𝗻:
• No. Referensi : ${doc.quotation_number}${issueDate ? `\n• Tanggal Terbit: ${issueDate}` : ""}${projectTitle ? `\n• Perihal / Proyek: ${projectTitle}` : ""}${totalVal ? `\n• Total Nilai   : ${formatIDR(totalVal)}` : ""}${itemCount ? `\n• Rincian Item  : ${itemCount} jenis produk / layanan (detail spesifikasi terlampir)` : ""}${hasDiscount ? `\n• Penawaran Khusus : Tersedia p̶o̶t̶o̶n̶g̶a̶n̶ ̶h̶a̶r̶g̶a̶ ̶r̶e̶g̶u̶l̶e̶r̶ ➔ 𝗗𝗜𝗦𝗞𝗢𝗡 𝗦𝗣𝗘𝗦𝗜𝗔𝗟${discountRate > 0 ? ` (${discountRate}%)` : ""} yang telah diaplikasikan langsung pada penawaran ini.` : ""}
• Masa Berlaku  : ${validityDays} hari kalender sejak tanggal penawaran diterbitkan

𝗖𝗮𝘁𝗮𝘁𝗮𝗻 & 𝗦𝗽𝗲𝘀𝗶𝗳𝗶𝗸𝗮𝘀𝗶:
Rincian deskripsi produk, kuantitas, harga satuan, spesifikasi teknis, serta syarat dan ketentuan pembayaran telah kami cantumkan secara lengkap pada berkas PDF terlampir.

𝗧𝗶𝗻𝗱𝗮𝗸 𝗟𝗮𝗻𝗷𝘂𝘁:
Apabila penawaran ini telah sesuai dengan kebutuhan Bapak/Ibu, mohon dapat menyampaikan konfirmasi pesanan atau menerbitkan Purchase Order (PO). Jika ada hal teknis yang perlu didiskusikan lebih lanjut, klarifikasi spesifikasi, maupun negosiasi, tim kami siap berkoordinasi.

Atas perhatian, waktu, dan kerja sama yang baik, kami ucapkan terima kasih.

Hormat kami,`;
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="Quotations & Sales Orders"
        subtitle="Sales quotations and customer proposals"
        icon={<FileSpreadsheet className="w-5 h-5" />}
        actions={
          <div className="flex flex-wrap gap-2.5">
            {(user?.role === "SALES" || user?.role === "FC") && (
              <button
                onClick={() => {
                  setCreateProjectQuotationId("");
                  setShowCreateProjectModal(true);
                }}
                className="h-12 px-5 bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-xs font-bold rounded-2xl hover:bg-stone-200 dark:hover:bg-stone-700 transition-all border border-stone-200 dark:border-stone-700 flex items-center gap-2"
              >
                <FolderKanban className="w-4 h-4 text-emerald-600" /> Create Project
              </button>
            )}
            {hasPermission(user, Action.SALES_ACTION) && (
              <button
                onClick={() => {
                  setInitialModalSettlement("CREDIT_TERM");
                  setShowCreateModal(true);
                }}
                className="h-12 px-5 bg-stone-900 text-white text-xs font-bold rounded-2xl hover:bg-stone-800 transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> New Quotation
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 border-b border-stone-100 dark:border-stone-800 pb-8">
        <div className="bg-white dark:bg-stone-900 p-4 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-stone-50 dark:bg-stone-800 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-stone-600 dark:text-stone-300" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest truncate">
              Total Quotations
            </div>
            <div className="text-lg font-bold text-stone-900 dark:text-white">
              {quotations.length}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest truncate">
              Direct Sales (B2C)
            </div>
            <div className="text-lg font-bold text-emerald-600">
              {retailCount}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-blue-700 uppercase tracking-widest truncate">
              B2B Projects (Terms)
            </div>
            <div className="text-lg font-bold text-blue-600">
              {b2bCount}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest truncate">
              Total Volume
            </div>
            <div className="text-sm font-black font-mono text-stone-900 truncate">
              {formatIDR(totalAmount)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-stone-200/80 shadow-2xs">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Search quotation number, receipt, customer, subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-elegant pl-10 font-medium w-full"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Channel Filter */}
          <div className="flex items-center gap-1.5 bg-stone-50 px-3 py-1.5 border border-stone-200 rounded-xl shrink-0">
            <Filter className="w-3.5 h-3.5 text-stone-400" />
            <select
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              className="text-xs font-bold text-stone-700 bg-transparent outline-none cursor-pointer uppercase tracking-wider border-none py-0.5"
            >
              <option value="ALL">All Channels</option>
              <option value="DIRECT_RETAIL">Direct Retail (B2C)</option>
              <option value="B2B_PROJECT">B2B Corporate Project</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-stone-50 px-3 py-1.5 border border-stone-200 rounded-xl shrink-0">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs font-bold text-stone-700 bg-transparent outline-none cursor-pointer uppercase tracking-wider border-none py-0.5"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING">Pending Approval</option>
              <option value="APPROVED">Approved / Settled</option>
              <option value="PROCESSED">Processed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          <button
            onClick={fetchQuotations}
            className="p-2 border border-stone-200 rounded-xl bg-white text-stone-500 hover:text-stone-900 transition-colors shrink-0 shadow-2xs"
            title="Refresh Data"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="card-elegant rounded-3xl overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="w-10 h-10 animate-pulse rounded-xl bg-stone-200/80"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-stone-200/80 rounded w-1/3 animate-pulse"></div>
                  <div className="h-3 bg-stone-100/80 rounded w-1/4 animate-pulse"></div>
                </div>
                <div className="h-6 w-20 bg-stone-100/80 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state m-8 animate-in fade-in duration-300 flex flex-col items-center justify-center p-12">
            <FileText className="w-12 h-12 text-stone-300 mb-4" />
            <div className="text-[10px] text-stone-400 font-bold uppercase tracking-[0.2em]">
              No Quotations Found
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 text-[10px] font-bold uppercase tracking-widest">
                  <th className="px-6 py-4 rounded-tl-3xl">Quotation & Reference</th>
                  <th className="px-6 py-4">Customer & Channel</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Total Amount</th>
                  <th className="px-6 py-4 text-right rounded-tr-3xl">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((q) => {
                  const isApproved =
                    q.status === "APPROVED" || q.status === "PROCESSED";
                  const isRetail =
                    q.sales_channel === "DIRECT_RETAIL" || q.settlement_type === "IMMEDIATE";

                  return (
                    <tr
                      key={q.id}
                      className="group hover:bg-stone-50/50 transition-colors cursor-pointer"
                      onClick={() => {
                        if (isRetail || q.receipt_number) {
                          setSelectedReceiptForPrint(q);
                        } else {
                          setSelectedQuotation(q);
                        }
                      }}
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-4">
                          <div
                            className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                              isRetail
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : isApproved
                                  ? "bg-blue-50 text-blue-600 border-blue-200"
                                  : "bg-stone-100 text-stone-400 border-stone-200/50"
                            )}
                          >
                            {isRetail ? (
                              <ShoppingBag className="w-5 h-5" />
                            ) : isApproved ? (
                              <CheckCircle2 className="w-5 h-5" />
                            ) : (
                              <FileText className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[10px] font-bold font-mono text-stone-400 uppercase tracking-wider">
                                {q.quotation_number}
                              </span>
                              {q.receipt_number && (
                                <span className="text-[9px] font-bold font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                                  {q.receipt_number}
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-bold text-stone-900 group-hover:text-emerald-600 transition-colors">
                              {q.title}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 align-middle">
                        <div className="text-sm font-bold text-stone-800">
                          {q.customer_name_manual || q.customer_name || "Walk-In Customer"}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          {isRetail ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              Direct Retail (B2C)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                              <Building2 className="w-2.5 h-2.5" /> B2B Project ({q.payment_terms || "Terms"})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 align-middle">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest flex w-fit items-center gap-1.5",
                            q.status === "APPROVED"
                              ? "bg-emerald-100 text-emerald-700 border-none"
                              : q.status === "PROCESSED"
                                ? "bg-indigo-100 text-indigo-700 border-none"
                                : q.status === "PENDING"
                                  ? "bg-amber-100 text-amber-700"
                                  : q.status === "REVISION"
                                    ? "bg-rose-100 text-rose-700"
                                    : q.status === "DRAFT"
                                      ? "bg-stone-200 text-stone-600"
                                      : "bg-stone-100 text-stone-500",
                          )}
                        >
                          {q.status === "APPROVED" ||
                          q.status === "PROCESSED" ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <AlertTriangle className="w-3 h-3" />
                          )}
                          {q.status === "APPROVED" && isRetail ? "SETTLED" : q.status}
                        </span>
                        {q.status === "REVISION" && q.revision_note && (
                          <div className="mt-1.5 flex items-start gap-1 p-2 bg-rose-50 border border-rose-100 rounded-md text-xs text-rose-700">
                            <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span className="italic">"{q.revision_note}"</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-5 align-middle text-right">
                        <div className="text-sm font-black font-mono text-stone-900">
                          {formatIDR(q.grand_total || q.amount || 0)}
                        </div>
                        {Number(q.pph_rate) > 0 && (
                          <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                            WHT {q.pph_rate}%
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-5 align-middle text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Thermal receipt print for retail or receipts */}
                          {(isRetail || q.receipt_number) && (
                            <button
                              title="Print Thermal Receipt"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedReceiptForPrint(q);
                              }}
                              className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-all flex items-center justify-center border border-emerald-200 dark:border-emerald-800"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {q.status === "PENDING" &&
                            (user?.role === "FC" || user?.role === "SALES" || hasGodMode(user)) && (
                              <>
                                <Button
                                  size="xs"
                                  action="authorize"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedQuoToAuth(q);
                                    setShowAuthorizeModal(true);
                                  }}
                                />
                                <Button
                                  size="xs"
                                  action="revise"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedQuoToAuth(q);
                                    setShowReviseModal(true);
                                  }}
                                />
                              </>
                            )}
                          {(q.status === "REVISION" || q.status === "DRAFT") &&
                            hasPermission(user, Action.CREATE_QUOTATION) && (
                              <Button
                                size="xs"
                                action="revise"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRevisingQuotation(q);
                                  setShowCreateModal(true);
                                }}
                              />
                            )}
                          {(q.status === "APPROVED" || q.status === "AUTHORIZED" || q.status === "PROCESSED") && (
                            <button
                              title="Send to Partner"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDocForEmail(q);
                                setShowEmailModal(true);
                              }}
                              className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all flex items-center justify-center border border-blue-200/50"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(q.status === "APPROVED" || q.status === "AUTHORIZED") && !isRetail &&
                            (user?.role === "FC" || user?.role === "SALES" || hasGodMode(user)) && (
                              <button
                                title="Create Project"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCreateProjectQuotationId(q.id);
                                  setShowCreateProjectModal(true);
                                }}
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all flex items-center justify-center border border-emerald-200/50"
                              >
                                <FolderKanban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          <Button
                            size="xs"
                            action="view"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedQuotation(q);
                            }}
                          />
                          {(user?.role === "FC" ||
                            hasGodMode(user) ||
                            (user?.role === "SALES" &&
                              hasPermission(
                                user,
                                Action.CREATE_QUOTATION,
                              ))) && q.status !== "PROCESSED" && (
                            <Button
                              size="xs"
                              action="delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteQuotation(q.id);
                              }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateQuotationModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setRevisingQuotation(null);
        }}
        revisingData={revisingQuotation}
        initialSettlementType={initialModalSettlement}
        onOpenReceipt={(receiptData) => {
          setSelectedReceiptForPrint(receiptData);
        }}
        onSuccess={(quo) => {
          setShowCreateModal(false);
          setRevisingQuotation(null);
          fetchQuotations();
          if (quo?.sales_channel !== "DIRECT_RETAIL" && quo?.settlement_type !== "IMMEDIATE") {
            setSelectedQuotation(quo);
          }
        }}
      />

      <ThermalReceiptModal
        isOpen={!!selectedReceiptForPrint}
        onClose={() => setSelectedReceiptForPrint(null)}
        quotationId={selectedReceiptForPrint?.id}
        initialData={selectedReceiptForPrint}
      />

      <QuotationPreviewModal
        isOpen={!!selectedQuotation}
        onClose={() => setSelectedQuotation(null)}
        quotation={selectedQuotation}
        onOpenReceipt={(quo) => setSelectedReceiptForPrint(quo)}
        onAuthorize={
          (user?.role === "FC" || user?.role === "SALES" || hasGodMode(user))
            ? (quo) => {
                setSelectedQuoToAuth(quo);
                setShowAuthorizeModal(true);
              }
            : undefined
        }
        onCreateProject={
          (user?.role === "FC" || user?.role === "SALES" || hasGodMode(user))
            ? (quo) => {
                setSelectedQuotation(null);
                setCreateProjectQuotationId(quo.id);
                setShowCreateProjectModal(true);
              }
            : undefined
        }
      />

      <CreateProjectModal
        isOpen={showCreateProjectModal}
        onClose={() => {
          setShowCreateProjectModal(false);
          setCreateProjectQuotationId("");
        }}
        onSuccess={(ntpData, projectData) => {
          fetchQuotations();
          if (ntpData) {
            setSelectedNtpForPreview(ntpData);
            setSelectedProjectForNtp(projectData);
          }
        }}
        initialQuotationId={createProjectQuotationId}
      />

      <AuthorizeDocModal
        isOpen={showAuthorizeModal && selectedQuoToAuth !== null}
        onClose={() => setShowAuthorizeModal(false)}
        docType="Quotation"
        docNumber={selectedQuoToAuth?.quotation_number || ""}
        status={selectedQuoToAuth?.status || "DRAFT"}
        partnerLabel="Customer"
        partnerName={selectedQuoToAuth?.customer_name}
        amount={selectedQuoToAuth?.amount}
        isSubmitting={isSubmitting}
        onAuthorize={handleAuthorize}
      />

      <ReviseDocModal
        isOpen={showReviseModal && selectedQuoToAuth !== null}
        onClose={() => setShowReviseModal(false)}
        docType="Quotation"
        docNumber={selectedQuoToAuth?.quotation_number || ""}
        status={selectedQuoToAuth?.status || "DRAFT"}
        partnerLabel="Customer"
        partnerName={selectedQuoToAuth?.customer_name}
        amount={selectedQuoToAuth?.amount}
        isSubmitting={isSubmitting}
        onRevise={handleRevise}
      />

      <SendEmailModal
        isOpen={showEmailModal && selectedDocForEmail !== null}
        onClose={() => setShowEmailModal(false)}
        docType="Quotation"
        docNumber={selectedDocForEmail?.quotation_number || ""}
        defaultRecipientEmail={selectedDocForEmail?.customer_email || ""}
        defaultRecipientPhone={selectedDocForEmail?.customer_phone || ""}
        defaultRecipientName={selectedDocForEmail?.customer_name || ""}
        defaultSubject={`Quotation - ${selectedDocForEmail?.quotation_number}`}
        defaultBody={getQuotationEmailBody(selectedDocForEmail)}
        onDownloadPdf={handleDownloadPdf}
        onSend={async (data) => {
          let logoSrc = `${window.location.origin}/logo.png`;
          try {
            const response = await fetch('/logo.png');
            const blob = await response.blob();
            const base64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
            if (base64) logoSrc = base64 as string;
          } catch (err) {
            console.warn("Failed to convert logo to base64", err);
          }

          const htmlSignature = `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; max-width: 650px; background-color: #ffffff; margin-top: 24px; border-top: 2px solid #b02524; padding-top: 16px;">
  <tr>
    <td colspan="3" style="padding-bottom: 15px;">
      <strong style="font-size: 18px; color: #b02524; letter-spacing: 0.5px;">
        <span style="color: #b02524;"><font color="#b02524">ADMIN SALES</font></span>
      </strong>
      <br/>
      <span style="font-size: 13px; color: #666666;">
        <span style="color: #666666;"><font color="#666666">Sales &amp; Marketing</font></span>
      </span>
    </td>
  </tr>
  <tr>
    <td style="vertical-align: middle; padding-right: 20px; width: 80px;">
      <img src="${logoSrc}" alt="CV Batu Emas Group Logo" width="80" style="display: block; width: 80px; max-width: 80px; height: auto; border: 0;" />
    </td>
    <td style="vertical-align: middle; padding: 0 20px; border-left: 2px solid #e0e0e0; width: 220px; font-size: 12px; color: #555555; line-height: 1.5;">
      <span style="color: #555555;">
        <font color="#555555">Dusun Petahunan, Gambiran,<br/>Banyuwangi, Jawa Timur<br/>Indonesia</font>
      </span>
    </td>
    <td style="vertical-align: middle; padding-left: 20px; border-left: 2px solid #e0e0e0;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align: middle; padding-right: 10px; padding-bottom: 6px;">
            <img src="https://img.icons8.com/material-outlined/24/555555/mail.png" width="14" height="14" alt="email" style="display: block; border: 0;" />
          </td>
          <td style="vertical-align: middle; font-size: 12px; color: #555555; padding-bottom: 6px;">
            <a href="mailto:pavingjoss@gmail.com" style="color: #555555; text-decoration: none;">
              <span style="color: #555555;"><font color="#555555">pavingjoss@gmail.com</font></span>
            </a>
          </td>
        </tr>
        <tr>
          <td style="vertical-align: middle; padding-right: 10px; padding-bottom: 6px;">
            <img src="https://img.icons8.com/material-outlined/24/555555/phone.png" width="14" height="14" alt="phone" style="display: block; border: 0;" />
          </td>
          <td style="vertical-align: middle; font-size: 12px; color: #555555; padding-bottom: 6px;">
            <span style="color: #555555;"><font color="#555555">(+62) 811 1111 3993</font></span>
          </td>
        </tr>
        <tr>
          <td style="vertical-align: middle; padding-right: 10px;">
            <img src="https://img.icons8.com/material-outlined/24/555555/domain.png" width="14" height="14" alt="web" style="display: block; border: 0;" />
          </td>
          <td style="vertical-align: middle; font-size: 12px; color: #555555;">
            <a href="https://www.pavingjoss.com" style="color: #555555; text-decoration: none;">
              <span style="color: #555555;"><font color="#555555">www.pavingjoss.com</font></span>
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="3" style="padding-top: 20px; font-size: 9px; color: #999999; line-height: 1.4; text-align: justify;">
      <span style="color: #999999;">
        <font color="#999999">The content of this email is confidential and intended for the recipient specified in message only. It is strictly forbidden to share any part of this message with any third party, without a written consent of the sender. If you received this message by mistake, please reply to this message and follow with its deletion, so that we can ensure such a mistake does not occur in the future.</font>
      </span>
    </td>
  </tr>
</table>
          `;

          const plainSignature = `\n\nAdmin Sales\nSales & Marketing\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCV. Batu Emas Group\nDusun Petahunan, Gambiran, Banyuwangi,\nJawa Timur, Indonesia\nm: (+62) 811 1111 3993\ne: pavingjoss@gmail.com\n\nwww.pavingjoss.com`;

          let copied = false;
          try {
            if (typeof window !== 'undefined' && window.ClipboardItem) {
              const htmlBlob = new Blob([htmlSignature], { type: "text/html" });
              const textBlob = new Blob([plainSignature], { type: "text/plain" });
              const item = new window.ClipboardItem({
                "text/html": htmlBlob,
                "text/plain": textBlob,
              });
              await navigator.clipboard.write([item]);
              copied = true;
            }
          } catch (err) {
            console.warn("Failed to copy rich signature", err);
          }

          const bodyWithPrompt = data.body + (copied ? "\n\n[PASTE (CTRL+V) YOUR EMAIL SIGNATURE HERE]" : plainSignature);

          const mailtoUrl = `mailto:${data.to}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(bodyWithPrompt)}`;
          const a = document.createElement("a");
          a.href = mailtoUrl;
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          if (copied) {
            showToast("Signature copied! Press Ctrl+V in your email composer.", "success");
          } else {
            showToast("Opening default email application...", "success");
          }
        }}
      />

      <ConfirmModal
        isOpen={confirmModal?.isOpen || false}
        onCancel={() => setConfirmModal(null)}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        onConfirm={() => {
           if (confirmModal?.action) {
             confirmModal.action();
           }
           setConfirmModal(null);
        }}
      />

      <NtpPreviewModal
        isOpen={!!selectedNtpForPreview}
        onClose={() => {
          setSelectedNtpForPreview(null);
          setSelectedProjectForNtp(null);
        }}
        ntp={selectedNtpForPreview}
        project={selectedProjectForNtp}
      />

      {/* Hidden renderer for PDF export from list view */}
      {selectedDocForEmail && (
        <QuotationPreviewModal
          isOpen={true}
          onClose={() => {}}
          quotation={selectedDocForEmail}
          isPrintModeHidden={true}
          exportPdfRef={exportPdfRef}
        />
      )}
    </div>
  );
}
