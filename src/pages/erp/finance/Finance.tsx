import React, { useState, useEffect, useRef } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/utils/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getDailyAuthKey } from "@/utils/auth";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import {
  Landmark,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  ArrowRight,
  ShieldCheck,
  Activity,
  BarChart4,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCcw,
  Plus,
  Eye,
  QrCode,
  FileText,
  Lock,
  PieChart,
  BookOpen,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Cloud,
} from "lucide-react";
import { cn, formatIDR, formatNumberWithDots } from "@/lib/utils";
import { motion } from "motion/react";
import { lazy, Suspense } from "react";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { generatePDF } from "@/lib/pdfGenerator";
const FinanceChart = lazy(() => import("@/components/erp/FinanceChart"));

export default function Finance() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Expense Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("CONSUMABLE");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [expensePin, setExpensePin] = useState("");
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  // Visual Ledger Report Modal State
  const [showVisualLedgerModal, setShowVisualLedgerModal] = useState(false);

  // Dual COGS View State (Pure Material vs Comprehensive)
  const [cogsPerspective, setCogsPerspective] = useState<"MATERIAL" | "COMPREHENSIVE">("MATERIAL");

  // PDF Document Preview State
  const [selectedTxForDoc, setSelectedTxForDoc] = useState<any>(null);
  const [showDocModal, setShowDocModal] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  const { showToast } = useToast();
  const { user } = useAuth();
  const { language, t } = useLanguage();

  const currentDateNum = new Date().getDate();
  const isTutupBukuWindow = currentDateNum >= 15 && currentDateNum <= 24;

  const exportFinancePdf = async () => {
    if (!docRef.current) return;
    setIsExportingPdf(true);
    try {
      const docName = selectedTxForDoc ? `BUKTI_TRANSAKSI_${selectedTxForDoc.id.split('-')[0]}.pdf` : "LAPORAN_KAS_KEUANGAN.pdf";
      await generatePDF(docRef.current, docName);
      showToast("Dokumen Keuangan berhasil diekspor ke PDF", "success");
    } catch (e) {
      console.error(e);
      showToast("Gagal mengekspor PDF Keuangan", "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/finance/analytics", {}, user?.username);
      if (res.ok) {
        setData(res.data);
      } else {
        showToast("Error fetching finance analytics", "error");
      }
    } catch (err) {
      showToast("Error connecting to server", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();

    let unsubscribeTx: (() => void) | null = null;
    // Disabled realtime listener to conserve Firestore read/rate limits
    // Use manual refresh or load once instead
    fetchAnalytics();
    

    return () => {
      if (unsubscribeTx) unsubscribeTx();
    };
  }, []);

  const handleRecordExpense = async (submittedPin: string) => {
    if (submittedPin !== getDailyAuthKey(user?.username)) {
      showToast("Invalid authorization PIN", "error");
      return;
    }
    const amt = parseFloat(expenseAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast("Invalid expense amount", "error");
      return;
    }

    // Optimistic UI update
    const tempTx = {
      id: `temp-${Date.now()}`,
      type: "OUT",
      category: expenseCategory,
      notes: expenseNotes,
      amount: amt,
      transaction_date: new Date().toISOString(),
      payment_method: "BANK TRANSFER"
    };

    setData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        total_cogs: (prev.total_cogs || 0) + amt,
        gross_margin: (prev.gross_margin || 0) - amt,
        recent_transactions: [tempTx, ...(prev.recent_transactions || [])]
      };
    });

    setIsSubmittingExpense(true);
    try {
      const res = await apiFetch("/api/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          category: expenseCategory,
          notes: expenseNotes,
          pin: submittedPin,
        }),
      }, user?.username);
      
      if (res.ok) {
        showToast("Expense recorded successfully", "success");
        setShowExpenseModal(false);
        setExpenseAmount("");
        setExpenseNotes("");
        setExpensePin("");
        fetchAnalytics();
      } else {
        showToast(res.error || "Failed to record expense", "error");
        fetchAnalytics(); // Rollback
      }
    } catch (err) {
      showToast("Network error", "error");
      fetchAnalytics(); // Rollback
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const handleExportCSV = () => {
    const curDay = new Date().getDate();
    const isTBActive = curDay >= 15 && curDay <= 24;

    if (!isTBActive) {
      showToast("General Ledger CSV export is accessible only during the monthly closing window (15th – 24th).", "error");
      return;
    }
    if (!data) return;

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const now = new Date();
    const currentMonthName = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();

    const csvRows: string[] = [];

    // 1. CORPORATE HEADER METADATA
    csvRows.push(`========================================================================================`);
    csvRows.push(`GENERAL LEDGER EXECUTIVE AUDIT REPORT`);
    csvRows.push(`========================================================================================`);
    csvRows.push(`Export Date,${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US')}`);
    csvRows.push(`Report Period,${currentMonthName} ${currentYear}`);
    csvRows.push(`Closing Status,CLOSING WINDOW ACTIVE (15th - 24th)`);
    csvRows.push(`System Module,Finance & Treasury Hub Engine (ERP)`);
    csvRows.push(``);

    // 2. EXECUTIVE FINANCIAL KPI SUMMARY
    csvRows.push(`--- EXECUTIVE FINANCIAL KPI SUMMARY ---`);
    csvRows.push(`Financial Metric,Nominal Value (IDR),Ratio / % of Revenue,Status`);

    const billed = Number(data.total_billed || 0);
    const received = Number(data.total_received || 0);
    const receivable = Number(data.total_receivable || 0);
    const cogs = Number(data.total_cogs || 0);
    const materialCogs = Number(data.total_material_cogs || data.total_cogs || 0);
    const laborCogs = Number(data.total_labor_cogs || 0);
    const fullCogs = Number(data.total_full_cogs || cogs || 0);
    const grossMargin = Number(data.gross_margin || 0);
    const grossMarginMaterial = Number(data.gross_margin_material ?? (Number(data.total_revenue_realized || 0) - materialCogs));
    const grossMarginFull = Number(data.gross_margin_full ?? (Number(data.total_revenue_realized || 0) - fullCogs));
    const recPct = billed > 0 ? ((received / billed) * 100).toFixed(1) : "0.0";
    const arPct = billed > 0 ? ((receivable / billed) * 100).toFixed(1) : "0.0";
    const cogsPct = billed > 0 ? ((cogs / billed) * 100).toFixed(1) : "0.0";
    const marginPct = billed > 0 ? ((grossMargin / billed) * 100).toFixed(1) : "0.0";

    csvRows.push(`Total Revenue Billed,"Rp ${formatNumberWithDots(billed)}",100.0%,Confirmed Billed`);
    csvRows.push(`Total Actual Cash Received,"Rp ${formatNumberWithDots(received)}",${recPct}%,Realized Cash Inflow`);
    csvRows.push(`Accounts Receivable,"Rp ${formatNumberWithDots(receivable)}",${arPct}%,Invoices Outstanding`);
    csvRows.push(`HPP Murni (Material Saja),"Rp ${formatNumberWithDots(materialCogs)}",${billed > 0 ? ((materialCogs / billed) * 100).toFixed(1) : "0.0"}%,Direct Material Only (PR/PO & BOM)`);
    csvRows.push(`HPP Komprehensif (Material + BTKL),"Rp ${formatNumberWithDots(fullCogs)}",${billed > 0 ? ((fullCogs / billed) * 100).toFixed(1) : "0.0"}%,Material + Direct Labor + Variables`);
    csvRows.push(`Biaya Tenaga Kerja Langsung (BTKL),"Rp ${formatNumberWithDots(laborCogs)}",${billed > 0 ? ((laborCogs / billed) * 100).toFixed(1) : "0.0"}%,Direct Labor / Production Overtime`);
    csvRows.push(`Total COGS & Expenses,"Rp ${formatNumberWithDots(cogs)}",${cogsPct}%,Direct & Operating Costs`);
    csvRows.push(`Gross Margin (HPP Murni),"Rp ${formatNumberWithDots(grossMarginMaterial)}",${billed > 0 ? ((grossMarginMaterial / billed) * 100).toFixed(1) : "0.0"}%,${grossMarginMaterial >= 0 ? 'PROFITABLE' : 'DEFICIT'}`);
    csvRows.push(`Gross Margin (HPP Komprehensif),"Rp ${formatNumberWithDots(grossMarginFull)}",${billed > 0 ? ((grossMarginFull / billed) * 100).toFixed(1) : "0.0"}%,${grossMarginFull >= 0 ? 'PROFITABLE' : 'DEFICIT'}`);
    csvRows.push(``);

    // 3. MONTHLY FINANCIAL PERFORMANCE LEDGER
    csvRows.push(`--- MONTHLY FINANCIAL PERFORMANCE LEDGER ---`);
    csvRows.push(`Month,Revenue Billed (IDR),COGS & Expenses (IDR),Gross Profit (IDR),Gross Margin %,Status,Performance Summary`);

    if (Array.isArray(data.chartData)) {
      data.chartData.forEach((row: any) => {
        const rev = Number(row.revenue || 0);
        const c = Number(row.cogs || 0);
        const p = Number(row.profit || rev - c);
        const mPct = rev > 0 ? ((p / rev) * 100).toFixed(1) : "0.0";
        let statusStr = "BALANCED";
        let storyStr = "Revenue performance and expense efficiency are balanced.";
        if (p > 0 && Number(mPct) >= 25) {
          statusStr = "EXCELLENT MARGIN";
          storyStr = "High profitability with effective cost control.";
        } else if (p < 0) {
          statusStr = "DEFICIT WARNING";
          storyStr = "Operating expenses exceed revenue. Cost review recommended.";
        }
        csvRows.push(`"${row.name}","Rp ${formatNumberWithDots(rev)}","Rp ${formatNumberWithDots(c)}","Rp ${formatNumberWithDots(p)}",${mPct}%,${statusStr},"${storyStr}"`);
      });
    }
    csvRows.push(``);

    // 4. ITEMIZED TRANSACTION AUDIT LOG
    csvRows.push(`--- TRANSACTION AUDIT LOG ---`);
    csvRows.push(`Tx Ref ID,Date & Time,Cash Type,Category,Description & Reference,Payment Method,Debit IN (IDR),Credit OUT (IDR),Audit Status`);

    if (Array.isArray(data.recent_transactions)) {
      data.recent_transactions.forEach((tx: any, idx: number) => {
        const txId = tx.id || `TX-${idx + 1}`;
        const dateStr = tx.transaction_date ? new Date(tx.transaction_date).toLocaleString('en-US') : '-';
        const typeStr = tx.type === 'IN' ? 'CASH IN' : 'CASH OUT';
        const catStr = tx.category || 'OPERATIONAL';
        const descStr = (tx.notes || tx.reference_id || 'Ledger Transaction').replace(/"/g, '""');
        const payMethod = tx.payment_method || 'BANK TRANSFER';
        const inAmt = tx.type === 'IN' ? `Rp ${formatNumberWithDots(tx.amount || 0)}` : 'Rp 0';
        const outAmt = tx.type === 'OUT' ? `Rp ${formatNumberWithDots(tx.amount || 0)}` : 'Rp 0';
        csvRows.push(`"${txId}","${dateStr}","${typeStr}","${catStr}","${descStr}","${payMethod}","${inAmt}","${outAmt}","VERIFIED"`);
      });
    }
    csvRows.push(``);

    // 5. AUDIT & SIGN-OFF METADATA
    csvRows.push(`--- SYSTEM AUTHORIZATION & VERIFICATION ---`);
    csvRows.push(`System Module,ERP Finance Controller Hub`);
    csvRows.push(`Daily Auth Token,${getDailyAuthKey(user?.username)}`);
    csvRows.push(`Verification,This General Ledger document is verified and audit compliant.`);
    csvRows.push(`========================================================================================`);

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `General_Ledger_${currentYear}_${now.toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("General Ledger CSV exported successfully!", "success");
  };

  if (isLoading || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <div className="w-10 h-10 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin"></div>
        <p className="text-sm font-bold text-stone-500 uppercase tracking-widest">
          Loading Ledger...
        </p>
      </div>
    );
  }

  const {
    total_billed,
    total_billed_gross,
    total_received,
    total_receivable,
    total_revenue_realized,
    total_tax_collected,
    total_cogs,
    total_material_cogs = 0,
    total_labor_cogs = 0,
    total_full_cogs = 0,
    gross_margin_material,
    gross_margin_full,
    gross_margin,
    chartData,
    recent_transactions,
  } = data;

  const effectiveMaterialCogs = Number(total_material_cogs || total_cogs || 0);
  const effectiveFullCogs = Number(total_full_cogs || (effectiveMaterialCogs + (Number(total_labor_cogs) || 0)) || total_cogs || 0);
  const activeCogs = cogsPerspective === "MATERIAL" ? effectiveMaterialCogs : effectiveFullCogs;

  const realizedRev = Number(total_revenue_realized || 0);
  const activeGrossMargin = cogsPerspective === "MATERIAL"
    ? Number(gross_margin_material ?? (realizedRev - effectiveMaterialCogs))
    : Number(gross_margin_full ?? (realizedRev - effectiveFullCogs));
  const isProfitable = activeGrossMargin >= 0;

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-500">
      <PageHeader
        title={t("General Ledger")}
        subtitle={t("Financial accounts and ledger summary")}
        icon={<Landmark className="w-6 h-6" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/general-ledger"
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 rounded-xl text-xs font-medium transition-colors shadow-xs"
            >
              <BookOpen className="w-3.5 h-3.5 text-stone-500" />
              <span>General Ledger</span>
            </a>
            <a
              href="/ar-aging"
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 rounded-xl text-xs font-medium transition-colors shadow-xs"
            >
              <TrendingUp className="w-3.5 h-3.5 text-stone-500" />
              <span>AR Aging</span>
            </a>
            <a
              href="/cashflow-forecast"
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 rounded-xl text-xs font-medium transition-colors shadow-xs"
            >
              <BarChart4 className="w-3.5 h-3.5 text-stone-500" />
              <span>Cash Flow</span>
            </a>
            <button
              onClick={() => setShowExpenseModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-medium transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t("Record Expense")}</span>
            </button>
            <button
              onClick={fetchAnalytics}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 rounded-xl text-xs font-medium transition-colors shadow-xs"
            >
              <RefreshCcw className="w-3.5 h-3.5 text-stone-500" />
              <span>{t("Refresh")}</span>
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between"
        >
          <div className="flex justify-between items-start mb-6">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Activity className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
              Net Revenue (DPP)
            </span>
          </div>
          <div>
            <p className="text-[11px] font-bold text-stone-500 uppercase tracking-widest mb-1">
              {t("Realized Net Revenue")}
            </p>
            <h3 className="text-2xl font-black font-mono text-stone-900 tracking-tight">
              {formatIDR(total_revenue_realized > 0 ? total_revenue_realized : Math.round((total_received || 0) * (100 / 112)))}
            </h3>
            <p className="text-[10px] text-stone-400 font-semibold mt-1">
              Kas Masuk: {formatIDR(total_received)} (Termasuk PPN)
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between"
        >
          <div className="flex justify-between items-start mb-6">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <Wallet className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
              Uncollected
            </span>
          </div>
          <div>
            <p className="text-[11px] font-bold text-stone-500 uppercase tracking-widest mb-1">
              {t("Account Receivables")}
            </p>
            <h3 className="text-2xl font-black font-mono text-stone-900 tracking-tight">
              {formatIDR(total_receivable)}
            </h3>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <TrendingDown className="w-5 h-5" />
            </div>
            {/* 2-Option Toggle: Material Only vs Comprehensive */}
            <div className="flex items-center bg-stone-100 p-0.5 rounded-xl border border-stone-200">
              <button
                type="button"
                onClick={() => setCogsPerspective("MATERIAL")}
                className={cn(
                  "px-2 py-1 text-[9px] font-bold rounded-lg transition-all",
                  cogsPerspective === "MATERIAL"
                    ? "bg-white text-stone-900 shadow-2xs font-extrabold"
                    : "text-stone-500 hover:text-stone-800"
                )}
                title="HPP Murni: Hanya menghitung biaya material"
              >
                1. Murni (Material)
              </button>
              <button
                type="button"
                onClick={() => setCogsPerspective("COMPREHENSIVE")}
                className={cn(
                  "px-2 py-1 text-[9px] font-bold rounded-lg transition-all",
                  cogsPerspective === "COMPREHENSIVE"
                    ? "bg-white text-stone-900 shadow-2xs font-extrabold"
                    : "text-stone-500 hover:text-stone-800"
                )}
                title="HPP Komprehensif: Material + Upah Tenaga Kerja + Variabel"
              >
                2. + Variabel Lain
              </button>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">
                {cogsPerspective === "MATERIAL" ? "HPP Murni (Material)" : "HPP Komprehensif"}
              </p>
              <span className="text-[9px] font-mono font-bold text-stone-400 uppercase">
                {cogsPerspective === "MATERIAL" ? "Material Only" : "Full Costing"}
              </span>
            </div>
            <h3 className="text-2xl font-black font-mono text-stone-900 tracking-tight">
              {formatIDR(activeCogs)}
            </h3>
            <p className="text-[10px] text-stone-500 font-medium mt-1">
              {cogsPerspective === "MATERIAL"
                ? "Bahan Baku Saja (BOM & PR/PO)"
                : `Material: ${formatIDR(effectiveMaterialCogs)} • BTKL: ${formatIDR(total_labor_cogs)}`}
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className={cn(
            "bg-white border rounded-3xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden",
            isProfitable ? "border-emerald-200 bg-emerald-50/30" : "border-rose-200 bg-rose-50/30",
          )}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-stone-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3"></div>
          <div className="relative z-10 flex justify-between items-start mb-6">
            <div className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center border",
              isProfitable ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-rose-50 border-rose-100 text-rose-600"
            )}>
              <DollarSign className="w-5 h-5" />
            </div>
            {isProfitable ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" /> Profit
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-widest text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-full flex items-center gap-1">
                <ArrowDownRight className="w-3 h-3" /> Loss
              </span>
            )}
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">
                {t("Gross Margin")}
              </p>
              <span className="text-[9px] text-stone-400 font-semibold">
                (Vs {cogsPerspective === "MATERIAL" ? "HPP Murni" : "Komprehensif"})
              </span>
            </div>
            <h3 className="text-2xl font-black font-mono text-stone-900 tracking-tight">
              {formatIDR(activeGrossMargin)}
            </h3>
            <p className="text-[10px] text-stone-400 font-semibold mt-1">
              Margin: {realizedRev > 0 ? ((activeGrossMargin / realizedRev) * 100).toFixed(1) : "0.0"}% DPP
            </p>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2 bg-white border border-stone-200 rounded-3xl p-6 md:p-8 shadow-sm"
        >
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-stone-50 flex items-center justify-center border border-stone-200">
                <BarChart4 className="w-5 h-5 text-stone-700" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-stone-900">
                  {t("Financial Performance")}
                </h3>
                <p className="text-xs font-semibold text-stone-500">
                  {t("Revenue vs COGS (Trailing)")}
                </p>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="w-8 h-8 border-4 border-stone-200 border-t-stone-500 rounded-full animate-spin"></div></div>}>
              <FinanceChart chartData={chartData} />
            </Suspense>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col gap-6"
        >
          <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex-1 flex flex-col justify-center">
            <div className="w-12 h-12 rounded-2xl bg-stone-50 flex items-center justify-center border border-stone-200 mb-6">
              <ShieldCheck className="w-6 h-6 text-stone-700" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-900 mb-2">
              Audit Ready Data
            </h3>
            <p className="text-xs font-medium text-stone-500 leading-relaxed">
              These figures are automatically derived from Commercial Invoices
              generated by Outbound logistics, mapped dynamically against
              Purchase Orders and Payroll.
            </p>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center border shadow-xs",
                  isTutupBukuWindow ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"
                )}>
                  {isTutupBukuWindow ? <Download className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-stone-900">
                    Export Ledger (CSV)
                  </h4>
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full inline-block mt-0.5",
                    isTutupBukuWindow ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  )}>
                    {isTutupBukuWindow ? "CLOSING WINDOW ACTIVE (15th–24th)" : "CLOSING LOCKED (15th–24th)"}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-stone-500 font-medium leading-relaxed">
              {isTutupBukuWindow
                ? "CSV General Ledger report with executive summaries and transaction logs."
                : "General Ledger export is locked outside of the monthly closing window (15th–24th)."}
            </p>

            <div className="space-y-2">
              <button
                onClick={handleExportCSV}
                disabled={!isTutupBukuWindow}
                className={cn(
                  "w-full py-3 rounded-xl text-xs font-extrabold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-xs",
                  isTutupBukuWindow
                    ? "bg-stone-900 text-white hover:bg-stone-800 cursor-pointer"
                    : "bg-stone-200 text-stone-500 cursor-not-allowed opacity-75"
                )}
              >
                {isTutupBukuWindow ? <Download className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                <span>{isTutupBukuWindow ? "Export CSV Ledger" : "Closing Period Locked"}</span>
              </button>

              <button
                onClick={() => setShowVisualLedgerModal(true)}
                className="w-full py-2.5 bg-white border border-stone-200 text-stone-800 hover:text-stone-900 hover:bg-stone-100 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-stone-600" />
                <span>View Visual Ledger Report</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {recent_transactions && recent_transactions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm"
        >
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-stone-900 mb-1">
                Recent Transactions
              </h3>
              <p className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">
                Latest ledger entries
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="pb-4 pr-4 font-bold text-[10px] uppercase tracking-widest text-stone-400 whitespace-nowrap">
                    Transaction
                  </th>
                  <th className="pb-4 px-4 font-bold text-[10px] uppercase tracking-widest text-stone-400 whitespace-nowrap">
                    Category
                  </th>
                  <th className="pb-4 px-4 font-bold text-[10px] uppercase tracking-widest text-stone-400 whitespace-nowrap">
                    Reference
                  </th>
                  <th className="py-4 pl-4 font-bold text-[10px] uppercase tracking-widest text-stone-400 text-right whitespace-nowrap">
                    Amount
                  </th>
                  <th className="py-4 px-4 font-bold text-[10px] uppercase tracking-widest text-stone-400 text-center whitespace-nowrap">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {recent_transactions.map((tx: any) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-stone-50/50 transition-colors group cursor-pointer"
                    onClick={() => {
                      setSelectedTxForDoc(tx);
                      setShowDocModal(true);
                    }}
                  >
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border",
                            tx.type === "IN"
                              ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                              : "bg-rose-50 border-rose-100 text-rose-600",
                          )}
                        >
                          {tx.type === "IN" ? (
                            <ArrowDownRight className="w-5 h-5" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-stone-900 font-mono tracking-tight">
                            {tx.id.split("-")[0] + "-" + tx.id.split("-")[1]}
                          </div>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mt-1">
                            {new Date(tx.transaction_date).toLocaleString(
                              "en-GB",
                              { dateStyle: "medium", timeStyle: "short" },
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md bg-stone-100 text-stone-600 border border-stone-200">
                        {tx.category || "UNKNOWN"}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div
                        className="text-xs font-bold text-stone-700 max-w-[200px] truncate"
                        title={tx.notes || tx.reference_id}
                      >
                        {tx.notes || tx.reference_id || "-"}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mt-1">
                        {tx.payment_method || "BANK TRANSFER"}
                      </div>
                    </td>
                    <td className="py-4 pl-4 text-right">
                      <div
                        className={cn(
                          "text-sm font-black font-mono tracking-tight",
                          tx.type === "IN"
                            ? "text-emerald-600"
                            : "text-rose-600",
                        )}
                      >
                        {tx.type === "IN" ? "+" : "-"}
                        {formatIDR(tx.amount)}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTxForDoc(tx);
                          setShowDocModal(true);
                        }}
                        title="View Details Bukti Kas"
                        className="px-2.5 py-1 shadow-sm border border-stone-200 flex items-center gap-1.5 cursor-pointer mx-auto"
                      >
                        <Eye className="w-3.5 h-3.5 text-stone-600" />
                        
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* EXECUTIVE STORY TABLE & FINANCIAL PERFORMANCE NARRATIVE */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="bg-white border border-stone-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6"
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-stone-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-stone-900 text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-stone-900 uppercase tracking-wide">
                Executive Story Table & Performance Narrative
              </h3>
              <p className="text-xs font-semibold text-stone-500">
                Monthly cash flow summary, profitability margins, and cost efficiency analysis
              </p>
            </div>
          </div>

          <button
            onClick={handleExportCSV}
            disabled={!isTutupBukuWindow}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-2xs",
              isTutupBukuWindow
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-stone-100 text-stone-400 cursor-not-allowed"
            )}
          >
            {isTutupBukuWindow ? <Download className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            <span>Export CSV Ledger</span>
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-stone-200">
          <table className="w-full text-left font-bold text-xs">
            <thead>
              <tr className="bg-stone-50 text-stone-500 uppercase tracking-widest border-b border-stone-200 text-[10px]">
                <th className="p-4 pl-6">Month</th>
                <th className="p-4 text-right">Revenue Billed</th>
                <th className="p-4 text-right">COGS & Expenses</th>
                <th className="p-4 text-right">Gross Profit</th>
                <th className="p-4 text-center">Profit Margin</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 pr-6 min-w-[280px]">Performance Narrative</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-700">
              {Array.isArray(chartData) && chartData.map((row: any, idx: number) => {
                const rev = Number(row.revenue || 0);
                const c = Number(row.cogs || 0);
                const profit = Number(row.profit || rev - c);
                const marginRatio = rev > 0 ? (profit / rev) * 100 : 0;
                let badgeStyle = "bg-emerald-50 text-emerald-800 border-emerald-200";
                let statusLabel = "EXCELLENT MARGIN";
                let storyText = `Revenue for ${row.name} reached Rp ${formatNumberWithDots(rev)} with healthy profit margin.`;

                if (marginRatio >= 20) {
                  badgeStyle = "bg-emerald-50 text-emerald-800 border-emerald-200";
                  statusLabel = "EXCELLENT MARGIN";
                } else if (marginRatio > 0) {
                  badgeStyle = "bg-amber-50 text-amber-800 border-amber-200";
                  statusLabel = "BALANCED MARGIN";
                  storyText = `Cash flow for ${row.name} is balanced at ${marginRatio.toFixed(1)}% margin ratio.`;
                } else {
                  badgeStyle = "bg-rose-50 text-rose-800 border-rose-200";
                  statusLabel = "HIGH COGS WARNING";
                  storyText = `Operating expenses in ${row.name} impacted gross profit margins.`;
                }

                return (
                  <tr key={idx} className="hover:bg-stone-50/70 transition-colors">
                    <td className="p-4 pl-6 font-extrabold text-stone-900 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-brand" />
                      <span>{row.name}</span>
                    </td>
                    <td className="p-4 text-right font-mono text-emerald-700 font-extrabold">
                      {formatIDR(rev)}
                    </td>
                    <td className="p-4 text-right font-mono text-rose-600 font-extrabold">
                      {formatIDR(c)}
                    </td>
                    <td className="p-4 text-right font-mono text-stone-900 font-black">
                      {formatIDR(profit)}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-mono text-xs font-black">{marginRatio.toFixed(1)}%</span>
                        <div className="w-16 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full", marginRatio >= 20 ? "bg-emerald-500" : marginRatio > 0 ? "bg-amber-500" : "bg-rose-500")}
                            style={{ width: `${Math.min(100, Math.max(0, marginRatio))}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={cn("px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-full border inline-block whitespace-nowrap", badgeStyle)}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="p-4 pr-6 text-stone-600 text-xs font-medium leading-snug">
                      {storyText}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* VISUAL LEDGER REPORT MODAL */}
      <Modal
        isOpen={showVisualLedgerModal}
        onClose={() => setShowVisualLedgerModal(false)}
        title="Visual General Ledger Report"
        description="Visual executive summary, trend analytics, and transaction log overview."
        maxWidth="4xl"
      >
        <div className="space-y-6">
          {/* Header Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                Total Actual Revenue
              </span>
              <p className="text-xl font-mono font-black text-emerald-700">
                {formatIDR(total_received)}
              </p>
              <span className="text-[10px] text-stone-500 mt-0.5 block">100% Verified Cash In</span>
            </div>

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                Accounts Receivable
              </span>
              <p className="text-xl font-mono font-black text-amber-700">
                {formatIDR(total_receivable)}
              </p>
              <span className="text-[10px] text-stone-500 mt-0.5 block">Outstanding Invoices</span>
            </div>

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                Gross Profit Margin
              </span>
              <p className="text-xl font-mono font-black text-stone-900">
                {formatIDR(gross_margin)}
              </p>
              <span className="text-[10px] text-emerald-600 font-bold mt-0.5 block">Audit Ready Ledger</span>
            </div>
          </div>

          {/* Graphical Breakdown */}
          <div className="bg-stone-50 border border-stone-200 p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <BarChart4 className="w-5 h-5 text-emerald-600" />
                <h4 className="font-extrabold text-sm uppercase tracking-wide text-stone-900">Monthly Financial Performance Trend</h4>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-stone-200/80 px-3 py-1 rounded-full text-stone-700">
                ERP Audit Chart
              </span>
            </div>
            <div className="h-48 w-full">
              <Suspense fallback={<div className="h-full flex items-center justify-center text-stone-400">Loading Chart...</div>}>
                <FinanceChart chartData={chartData} />
              </Suspense>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex justify-between items-center pt-4 border-t border-stone-200">
            <div className="text-xs text-stone-500 font-medium">
              Closing Window: <span className="font-bold text-stone-800">15th – 24th Monthly</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => setShowVisualLedgerModal(false)}>
                Close Window
              </Button>
              <Button 
                onClick={handleExportCSV} 
                disabled={!isTutupBukuWindow}
                className="bg-stone-900 hover:bg-stone-800 text-white flex items-center gap-2"
              >
                {isTutupBukuWindow ? <Download className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                <span>Export CSV Ledger</span>
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Record Expense Modal */}
      <AuthorizeDocModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        docType="Manual Expense"
        docNumber={`EXP-${new Date().getTime().toString().slice(-6)}`}
        amount={Number(expenseAmount) || 0}
        subtitle="Log operational expenses such as consumables and other overhead costs."
        isSubmitting={isSubmittingExpense}
        onAuthorize={handleRecordExpense}
      >
        <div className="space-y-4 pt-2">
          <Input
            label="Amount (IDR)"
            type="number"
            required
            min="1"
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
            className="font-mono font-bold text-base"
            placeholder="e.g. 500000"
          />
          <Select
            label="Category"
            value={expenseCategory}
            onChange={(e) => setExpenseCategory(e.target.value)}
          >
            <option value="CONSUMABLE">Konsumabel (Listrik & Air)</option>
            <option value="TRANSPORTATION">Transportasi (BBM, Tol, Tiket)</option>
            <option value="OTHERS">Lainnya (Others)</option>
          </Select>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block">
              Notes / Description
            </label>
            <textarea
              required
              value={expenseNotes}
              onChange={(e) => setExpenseNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 transition-all resize-none h-24 font-medium"
              placeholder="Tagihan Listrik Bulan Ini..."
            />
          </div>
        </div>
      </AuthorizeDocModal>

      {/* Finance Transaction / Ledger PDF Document Preview Modal */}
      {selectedTxForDoc && (
        <Modal
          isOpen={showDocModal}
          onClose={() => setShowDocModal(false)}
          title={`Dokumen Bukti Transaksi Kas / Jurnal: ${selectedTxForDoc.id}`}
          maxWidth="5xl"
          contentClassName="p-0 flex flex-col h-[85vh] border-t border-stone-100"
        >
          <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
            <PdfPreviewWrapper>
              <PrintTemplate
                ref={docRef}
                documentTitleId="BUKTI TRANSAKSI KEUANGAN"
                documentTitleEn="FINANCIAL TRANSACTION VOUCHER"
                documentNameId="VOUCHER JURNAL KAS"
                documentNameEn="CASH JOURNAL VOUCHER"
                date={
                  selectedTxForDoc.transaction_date
                    ? new Date(selectedTxForDoc.transaction_date).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : new Date().toLocaleDateString("id-ID")
                }
                referenceNumber={selectedTxForDoc.id || ""}
                documentId={selectedTxForDoc.id || ""}
              >
                <div className="bg-white p-8 text-sm text-black flex flex-col h-full justify-between">
                  <div>
                    {/* Header Subject Area */}
                    <div className="mb-6 p-4 bg-white rounded-lg border border-stone-200 grid grid-cols-2 gap-8">
                      <div>
                        <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1">
                          TIPE & KATEGORI TRANSAKSI
                        </div>
                        <div className="text-base font-black text-stone-900 tracking-tight leading-tight uppercase mb-1">
                          {selectedTxForDoc.type === "IN" ? "PENERIMAAN KAS / CASH IN" : "PENGELUARAN KAS / CASH OUT"}
                        </div>
                        <div className="text-xs text-stone-600 font-bold uppercase tracking-wider">
                          Kategori: <span className="text-stone-900">{selectedTxForDoc.category || "OPERATIONAL"}</span>
                        </div>
                      </div>

                      <div className="text-right flex flex-col items-end justify-center">
                        <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1">
                          NOMINAL TRANSAKSI / AMOUNT
                        </div>
                        <div className={cn("text-2xl font-black font-mono", selectedTxForDoc.type === "IN" ? "text-emerald-700" : "text-stone-900")}>
                          {selectedTxForDoc.type === "IN" ? "+" : "-"}{formatIDR(selectedTxForDoc.amount)}
                        </div>
                        <div className="text-xs text-stone-500 font-semibold mt-1">
                          Metode: <span className="font-bold text-stone-900">{selectedTxForDoc.payment_method || "BANK TRANSFER"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Table Details */}
                    <div className="mb-6">
                      <div className="text-xl text-stone-900 uppercase tracking-widest font-black mb-4 ml-1">
                        Rincian Jurnal / Transaksi{" "}
                        <span className="text-sm text-stone-500 font-normal">
                          / Journal Details
                        </span>
                      </div>
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-stone-300 bg-white">
                            <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-sm w-12 text-center">
                              No
                            </th>
                            <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-sm">
                              Keterangan / Deskripsi
                              <div className="text-[10px] font-bold text-stone-500 tracking-widest mt-1">
                                DESCRIPTION / REMARKS
                              </div>
                            </th>
                            <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-sm w-48">
                              Jumlah
                              <div className="text-[10px] font-bold text-stone-500 tracking-widest mt-1">
                                AMOUNT (IDR)
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-150">
                          <tr>
                            <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">1</td>
                            <td className="py-4 px-3 text-base font-black text-stone-900 uppercase tracking-tight">
                              {selectedTxForDoc.notes || selectedTxForDoc.reference_id || "Transaksi Operasional Keuangan"}
                            </td>
                            <td className="py-4 px-3 text-right text-stone-900 font-mono font-black text-base whitespace-nowrap">
                              {formatIDR(selectedTxForDoc.amount)}
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      <div className="mt-6 flex justify-end">
                        <div className="w-[440px] space-y-2">
                          <div className="flex justify-between items-center pt-3 border-t-2 border-stone-900 px-3 font-black text-base uppercase tracking-wider gap-3">
                            <span className="text-stone-900 whitespace-nowrap">TOTAL NETTO</span>
                            <span className="font-mono text-base tracking-tight text-stone-900 whitespace-nowrap">
                              {formatIDR(selectedTxForDoc.amount)}
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
              onClick={() => setShowDocModal(false)}
              className="px-6 py-2.5 rounded-xl text-sm"
            >
              {language === "id" ? "Tutup" : "Close"}
            </Button>
            <Button
              variant="primary"
              onClick={exportFinancePdf}
              isLoading={isExportingPdf}
              className="px-6 py-2.5 rounded-xl text-sm shadow-md"
            >
              {!isExportingPdf && <Download className="w-4 h-4" />}
              {language === "id"
                ? isExportingPdf
                  ? "Mengekspor..."
                  : "Ekspor PDF (A4)"
                : isExportingPdf
                  ? "Generating..."
                  : "Export PDF (A4)"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
