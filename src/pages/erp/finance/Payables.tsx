import React, { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDailyAuthKey } from "@/utils/auth";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Landmark,
  ArrowRight,
  CheckCircle2,
  FileText,
  CheckCircle,
  Search,
  RotateCcw,
  Building2,
  Calendar,
  Coins,
  Key,
  Eye,
  Download,
  QrCode,
  AlertCircle,
  ShieldCheck,
  AlertTriangle,
  CreditCard,
} from "lucide-react";
import { formatIDR, cn, formatNumberWithDots } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { motion, AnimatePresence } from "motion/react";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { generatePDF } from "@/lib/pdfGenerator";

export default function Payables() {
  const [payables, setPayables] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [confirmVoid, setConfirmVoid] = useState<{
    isOpen: boolean;
    id: string;
    amount: number;
  }>({ isOpen: false, id: "", amount: 0 });
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [authPin, setAuthPin] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK TRANSFER");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState("");
  const [vendorInvoiceAmount, setVendorInvoiceAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [showDocModal, setShowDocModal] = useState(false);
  const [selectedPayableForDoc, setSelectedPayableForDoc] = useState<any>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  const { showToast } = useToast();
  const { user } = useAuth();
  const { language, t } = useLanguage();

  const exportPayablePdf = async () => {
    if (!docRef.current || !selectedPayableForDoc) return;
    setIsExportingPdf(true);
    try {
      await generatePDF(
        docRef.current,
        `KAS_KELUAR_${selectedPayableForDoc.po_number || "VOUCHER"}.pdf`,
      );
      showToast("Bukti Pembayaran Hutang berhasil diekspor", "success");
    } catch (e) {
      console.error(e);
      showToast("Gagal mengekspor PDF", "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const fetchPayables = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/finance/payables", {}, user?.username);
      if (res.ok) {
        setPayables(Array.isArray(res.data) ? res.data : res.data?.data || []);
      }
    } catch (err) {
      showToast("Error fetching payables", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayables();
  }, []);

  const handleVoidPayment = async () => {
    if (!confirmVoid.id) return;
    try {
      const authPin = getDailyAuthKey(user?.username);
      const res = await apiFetch(
        `/api/finance/payables/${confirmVoid.id}/void`,
        {
          method: "PUT",
          body: JSON.stringify({
            pin: authPin,
            notes: "Voided by user via UI",
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast("Payment voided successfully", "success");
        setConfirmVoid({ isOpen: false, id: "", amount: 0 });
        fetchPayables();
      } else {
        showToast(res.error || "Failed to void payment", "error");
      }
    } catch (e) {
      showToast("Error voiding payment", "error");
    }
  };

  const handlePayPO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPO || !authPin) return;
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/finance/payables/${selectedPO.id}/pay`,
        {
          method: "PUT",
          body: JSON.stringify({
            pin: authPin,
            amount: paymentAmount ? Number(paymentAmount) : undefined,
            payment_method: paymentMethod,
            notes: paymentNotes,
            vendor_invoice_number: vendorInvoiceNumber,
            vendor_invoice_amount: vendorInvoiceAmount ? Number(vendorInvoiceAmount) : undefined,
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast("Purchase Order marked as PAID (FINISHED)", "success");
        setShowPayModal(false);
        setAuthPin("");
        setPaymentAmount("");
        setPaymentNotes("");
        setVendorInvoiceNumber("");
        setVendorInvoiceAmount("");
        setSelectedPO(null);
        fetchPayables();
      } else {
        showToast(res.error || "Failed", "error");
      }
    } catch (err) {
      showToast("Error processing payment", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPayables = React.useMemo(() => {
    return (Array.isArray(payables) ? payables : []).filter(
      (po) =>
        (po.po_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (po.supplier_name || "").toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [payables, searchTerm]);

  const pendingPayables = React.useMemo(() => {
    return filteredPayables.filter(
      (p) =>
        p.status === "ISSUED" ||
        p.status === "AUTHORIZED" ||
        p.status === "RECEIVED" ||
        p.status === "PARTIAL",
    );
  }, [filteredPayables]);

  const paidPayables = React.useMemo(() => {
    return filteredPayables.filter(
      (p) => p.status === "FINISHED" || p.status === "PAID",
    );
  }, [filteredPayables]);

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-500">
      <ConfirmModal
        isOpen={confirmVoid.isOpen}
        title="Void Payment"
        message={`Are you sure you want to void this payment? This will reverse the transaction and update the ledger. Amount to reverse: ${confirmVoid.amount}`}
        onConfirm={handleVoidPayment}
        onCancel={() => setConfirmVoid({ isOpen: false, id: "", amount: 0 })}
      />

      <PageHeader
        title={t("Account Payables")}
        subtitle={t("Vendor bills and purchase order payments")}
        icon={<CreditCard className="w-5 h-5" />}
      />

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-lg">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder={t("Search by PO Number or Supplier Name...")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-2xl text-sm focus:border-stone-400 outline-none transition-colors shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
        {/* Pending Payables Column (60%) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-500" />
              {t("Pending Authorization")}
              <span className="ml-2 bg-stone-100 text-stone-600 py-0.5 px-2 rounded-full text-[10px]">
                {pendingPayables.length}
              </span>
            </h3>
          </div>

          <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-4">
                <div className="w-8 h-8 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin"></div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">
                  Loading...
                </p>
              </div>
            ) : pendingPayables.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-stone-50 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-sm font-bold text-stone-900">
                  {t("All Clear")}
                </p>
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500 mt-2">
                  {t("No pending payables")}
                </p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-stone-50/50 border-b border-stone-100">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-stone-500">
                      {t("Purchase Order")}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-stone-500">
                      Three-Way Match
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-stone-500 text-right">
                      {t("Action")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  <AnimatePresence>
                    {pendingPayables.map((po, index) => {
                      const poValue = po.total_amount || 0;
                      const grnValue = po.received_amount || 0;
                      const invValue = po.vendor_invoice_amount;
                      
                      const deviation = invValue !== undefined && invValue !== null
                        ? Math.abs(invValue - grnValue) / (grnValue || 1)
                        : null;
                      const isDeviated = deviation !== null && deviation > 0.05; // 5% tolerance

                      return (
                      <motion.tr
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ delay: index * 0.05 }}
                        key={po.id}
                        className="group hover:bg-stone-50/50 transition-colors"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-sm font-bold font-mono text-stone-900">
                                {po.po_number}
                              </div>
                              <div className="text-[10px] font-bold text-stone-500 mt-1 tracking-wider uppercase flex items-center gap-1.5">
                                <Building2 className="w-3 h-3" />
                                {po.supplier_name}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="grid grid-cols-3 gap-4 text-xs font-mono">
                            <div className="flex flex-col">
                              <span className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest">Ordered (PO)</span>
                              <span className="font-bold text-stone-700">{formatIDR(poValue)}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest">Received (GRN)</span>
                              <span className="font-bold text-emerald-600">{formatIDR(grnValue)}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest">Billed (INV)</span>
                              {invValue !== undefined && invValue !== null ? (
                                <span className={`font-bold ${isDeviated ? "text-red-600" : "text-stone-700"}`}>
                                  {formatIDR(invValue)}
                                </span>
                              ) : (
                                <span className="font-bold text-stone-400 italic">Pending...</span>
                              )}
                            </div>
                          </div>
                          {isDeviated && (
                            <div className="mt-2 text-[10px] font-bold text-red-600 bg-red-50 inline-block px-2 py-0.5 rounded-md uppercase tracking-wider">
                              Deviation exceeds 5% tolerance
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex flex-col items-end gap-2.5">
                            <div className="text-right">
                              <div className="text-sm font-black font-mono tracking-tight text-amber-600">
                                {formatIDR(invValue !== undefined && invValue !== null ? invValue : (grnValue > 0 ? grnValue : poValue))}
                              </div>
                              <div className="text-[10px] text-stone-500 font-bold mt-0.5">
                                Match Amount
                              </div>
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="rounded-xl px-2.5 py-1.5 shadow-sm text-stone-700 hover:bg-stone-100 flex items-center gap-1 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPayableForDoc(po);
                                  setShowDocModal(true);
                                }}
                                title="Pratinjau Voucher Kas Keluar"
                              >
                                <Eye className="w-3.5 h-3.5 text-stone-600" />
                                
                              </Button>
                              <Button
                                size="sm"
                                className="rounded-xl text-xs font-bold px-3.5 py-1.5 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow transition-all shrink-0 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPO(po);
                                  const rem = po.total_amount - (po.amount_paid || 0);
                                  setPaymentAmount(rem > 0 ? rem.toString() : (po.total_amount || 0).toString());
                                  setVendorInvoiceAmount((po.vendor_invoice_amount || po.total_amount || 0).toString());
                                  setAuthPin("");
                                  setShowPayModal(true);
                                }}
                              >
                                <Coins className="w-3.5 h-3.5" />
                                {t("Pay Now")}
                              </Button>
                            </div>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                  </AnimatePresence>
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Paid Payables Column (40%) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {t("Settled Payments")}
              <span className="ml-2 bg-stone-100 text-stone-600 py-0.5 px-2 rounded-full text-[10px]">
                {paidPayables.length}
              </span>
            </h3>
          </div>

          <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-4">
                <div className="w-8 h-8 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin"></div>
              </div>
            ) : paidPayables.length === 0 ? (
              <div className="p-12 text-center text-[11px] font-bold uppercase tracking-widest text-stone-500">
                {t("No settled payments")}
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-stone-50/50 border-b border-stone-100">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-stone-500">
                      {t("Supplier & PO")}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-stone-500 text-right">
                      {t("Total")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {paidPayables.map((po, index) => (
                    <motion.tr
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      key={po.id}
                      className="group hover:bg-stone-50/50 transition-colors"
                    >
                      <td className="px-6 py-5">
                        <div className="text-xs font-bold font-mono text-stone-900 flex items-center gap-2">
                          {po.po_number}
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                        <div className="text-[10px] font-bold text-stone-500 mt-1.5 tracking-wider uppercase flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 text-stone-400" />
                          {po.supplier_name}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right font-mono font-bold text-stone-900">
                        <div>{formatIDR(po.total_amount)}</div>
                        <div className="flex items-center justify-end gap-2 mt-2">
                          <span className="text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md font-sans font-bold uppercase tracking-widest">
                            Paid
                          </span>
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPayableForDoc(po);
                              setShowDocModal(true);
                            }}
                            title="Pratinjau Voucher Kas Keluar"
                            className="px-2.5 py-1 shadow-sm border border-stone-200 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-stone-600" />
                            
                          </Button>
                          <Button
                            size="xs"
                            variant="danger_soft"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmVoid({
                                isOpen: true,
                                id: po.id,
                                amount: po.total_amount,
                              });
                            }}
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

      <Modal
        isOpen={showPayModal && !!selectedPO}
        onClose={() => {
          setShowPayModal(false);
          setAuthPin("");
          setSelectedPO(null);
        }}
        title={t("Confirm Payment Disbursement")}
        description={t(
          "Log payment expense and centrally record it in the Finance Hub.",
        )}
        maxWidth="md"
        contentClassName="p-0 border-t border-stone-100"
      >
        {selectedPO && (
          <form
            onSubmit={handlePayPO}
            className="font-sans text-stone-900 bg-white"
          >
            <div className="p-6 md:p-8 space-y-6 text-sm">
              <div className="border border-stone-200 rounded-xl overflow-hidden mb-6">
                <div className="bg-stone-50 px-4 py-3 border-b border-stone-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-800 uppercase tracking-widest flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    3-Way Matching Validation
                  </span>
                  {selectedPO.total_amount === selectedPO.received_amount ? (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-wider border border-emerald-200">
                      Matched
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5" /> Discrepancy
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 divide-x divide-stone-200 text-center">
                  <div className="p-4 flex flex-col items-center justify-center bg-white relative">
                    <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">PO Amount</span>
                    <span className="text-sm font-black font-mono text-stone-900">{formatIDR(selectedPO.total_amount)}</span>
                  </div>
                  <div className="p-4 flex flex-col items-center justify-center bg-emerald-50/50">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Receipt (GRN)</span>
                    <span className="text-sm font-black font-mono text-emerald-950">{formatIDR(selectedPO.received_amount || 0)}</span>
                  </div>
                  <div className="p-4 flex flex-col items-center justify-center bg-blue-50/50">
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Vendor Invoice</span>
                    <span className="text-sm font-black font-mono text-blue-950">
                      {vendorInvoiceAmount ? formatIDR(Number(vendorInvoiceAmount)) : "Pending"}
                    </span>
                  </div>
                </div>
                <div className="bg-stone-50 border-t border-stone-200 px-4 py-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">
                    Previously Paid: <span className="font-mono text-stone-900">{formatIDR(selectedPO.amount_paid || 0)}</span>
                  </span>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-stone-700 bg-white border border-stone-200 px-2 py-1 rounded-md uppercase tracking-wider">
                    <Building2 className="w-3 h-3" />
                    {selectedPO.supplier_name} - {selectedPO.po_number}
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-stone-100">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Vendor Invoice No. (Optional)"
                    type="text"
                    placeholder="INV-..."
                    value={vendorInvoiceNumber}
                    onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                  />
                  <div>
                    <Input
                      label="Vendor Billed Amount (Optional)"
                      type="number"
                      placeholder="Amount..."
                      value={vendorInvoiceAmount}
                      onChange={(e) => setVendorInvoiceAmount(e.target.value)}
                      className="font-mono font-bold"
                    />
                    {vendorInvoiceAmount && selectedPO && (
                      (() => {
                        const billed = Number(vendorInvoiceAmount);
                        const expected = selectedPO.total_amount;
                        const dev = Math.abs(billed - expected);
                        const devPct = (dev / (expected || 1)) * 100;
                        const isExceeded = devPct > 5;
                        return (
                          <div className={`mt-1.5 p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${isExceeded ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {isExceeded 
                                ? `3-Way Match Alert: Deviasi ${devPct.toFixed(1)}% melebihi batas 5% (Hard-Stop)! Pembayaran akan ditolak.` 
                                : `3-Way Match Valid: Deviasi ${devPct.toFixed(1)}% dalam batas toleransi (<= 5%).`}
                            </span>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>

                <Input
                  label={t("Amount to Pay")}
                  type="number"
                  placeholder={String(
                    selectedPO.total_amount - (selectedPO.amount_paid || 0),
                  )}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="font-mono font-bold"
                  helperText={`Leave empty to pay remaining balance: ${formatIDR(
                    selectedPO.total_amount - (selectedPO.amount_paid || 0),
                  )}`}
                />

                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label={t("Payment Method")}
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="BANK TRANSFER">Bank Transfer</option>
                    <option value="CASH">Cash</option>
                    <option value="CREDIT CARD">Credit Card</option>
                    <option value="CHEQUE">Cheque</option>
                  </Select>
                  <Input
                    label={t("Notes")}
                    type="text"
                    placeholder="Optional notes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex items-start gap-4 mt-6">
                <div className="w-10 h-10 rounded-xl bg-white border border-emerald-100 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-stone-900 mb-1">
                    Embedded Smart e-Approval
                  </h4>
                  <p className="text-[10px] text-stone-500 leading-relaxed mb-3">
                    Please enter your 6-digit authorization PIN to digitally
                    sign and authorize this payment.
                  </p>
                  <input
                    type="password"
                    maxLength={6}
                    required
                    value={authPin}
                    onChange={(e) => setAuthPin(e.target.value.toUpperCase())}
                    placeholder="Enter 6-digit PIN"
                    className="w-full text-sm placeholder:text-stone-400 font-mono tracking-[0.5em] px-4 py-2.5 rounded-xl border border-stone-200 focus:border-emerald-500 focus:ring-emerald-500 transition-shadow bg-white outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 md:px-8 md:py-5 border-t border-stone-100 bg-stone-50 flex justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setShowPayModal(false);
                  setAuthPin("");
                }}
                className="px-6 py-2.5 text-stone-500 hover:text-stone-900 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-colors cursor-pointer"
              >
                {t("Cancel")}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !authPin}
                className="px-6 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:text-stone-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors shadow-sm cursor-pointer flex items-center gap-2"
              >
                {isSubmitting ? t("Processing...") : t("Authorize & Pay")}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Payable Document Preview Modal */}
      {selectedPayableForDoc && (
        <Modal
          isOpen={showDocModal}
          onClose={() => setShowDocModal(false)}
          title={`Bukti Pengeluaran Kas (Payable Voucher): ${selectedPayableForDoc.po_number}`}
          maxWidth="5xl"
          contentClassName="p-0 flex flex-col h-[85vh] border-t border-stone-100"
        >
          <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
            <PdfPreviewWrapper>
              <PrintTemplate
                ref={docRef}
                documentTitleId="BUKTI PENGELUARAN KAS"
                documentTitleEn="DISBURSEMENT VOUCHER"
                documentNameId="PEMBAYARAN HUTANG USAMA/PO"
                documentNameEn="ACCOUNTS PAYABLE DISBURSEMENT"
                date={
                  selectedPayableForDoc.created_at
                    ? new Date(selectedPayableForDoc.created_at).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : new Date().toLocaleDateString("id-ID")
                }
                referenceNumber={selectedPayableForDoc.po_number || ""}
                documentId={selectedPayableForDoc.po_number || selectedPayableForDoc.id || ""}
              >
                <div className="bg-white p-8 text-sm text-black flex flex-col h-full justify-between">
                  <div>
                    {/* Voucher Header Info (60:40 Ratio) */}
                    <div className="mb-6 p-4 bg-white rounded-lg border border-stone-200 grid grid-cols-5 gap-8">
                      <div className="col-span-3">
                        <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1">
                          PEMBAYARAN KEPADA / PAID TO (SUPPLIER)
                        </div>
                        <div className="text-base font-black text-stone-900 tracking-tight leading-tight uppercase mb-1">
                          {selectedPayableForDoc.supplier_name || "PEMASOK / VENDOR"}
                        </div>
                        <div className="text-xs text-stone-600 font-medium">
                          No. PO Referensi: <span className="font-mono font-bold text-stone-900">{selectedPayableForDoc.po_number}</span>
                        </div>
                      </div>

                      <div className="col-span-2 text-right flex flex-col items-end justify-center">
                        <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1">
                          METODE & STATUS
                        </div>
                        <div className="text-sm font-black text-emerald-600 uppercase tracking-wider">
                          DISBURSED & PAID
                        </div>
                        <div className="text-xs text-stone-600 font-semibold mt-1">
                          Metode: <span className="font-bold text-stone-900">{selectedPayableForDoc.payment_method || "BANK TRANSFER"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Transaction Details */}
                    <div className="mb-6">
                      <div className="text-xl text-stone-900 uppercase tracking-widest font-black mb-4 ml-1">
                        Rincian Pengeluaran Kas{" "}
                        <span className="text-sm text-stone-500 font-normal">
                          / Disbursement Details
                        </span>
                      </div>
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-stone-300 bg-white">
                            <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-sm w-12 text-center">
                              No
                            </th>
                            <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-sm">
                              Deskripsi Pembayaran
                              <div className="text-[10px] font-bold text-stone-500 tracking-widest mt-1">
                                PAYMENT DESCRIPTION
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
                              Pelunasan Tagihan PO #{selectedPayableForDoc.po_number} ({selectedPayableForDoc.supplier_name})
                            </td>
                            <td className="py-4 px-3 text-right text-stone-900 font-mono font-black text-base whitespace-nowrap">
                              {formatIDR(selectedPayableForDoc.total_amount)}
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      <div className="mt-6 flex justify-end">
                        <div className="w-[440px] space-y-2">
                          <div className="flex justify-between items-center pt-3 border-t-2 border-stone-900 px-3 font-black text-base uppercase tracking-wider gap-3">
                            <span className="text-stone-900 whitespace-nowrap">TOTAL DIBAYARKAN</span>
                            <span className="font-mono text-base tracking-tight text-emerald-700 whitespace-nowrap">
                              {formatIDR(selectedPayableForDoc.total_amount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Finance Manager Signature */}
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
              onClick={exportPayablePdf}
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
