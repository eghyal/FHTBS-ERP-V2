import React, { useState } from "react";
import {
  X,
  Search,
  CheckCircle2,
  Clock,
  Truck,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Send,
} from "lucide-react";
import { formatIDR } from "@/lib/utils";

interface OrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOrderNumber?: string;
}

export function OrderTrackingModal({ isOpen, onClose, initialOrderNumber }: OrderTrackingModalProps) {
  const [searchCode, setSearchCode] = useState(initialOrderNumber || "");
  const [isLoading, setIsLoading] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [paymentRefInput, setPaymentRefInput] = useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchCode.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shop/orders/${searchCode.trim()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Pesanan tidak ditemukan. Silakan periksa kembali nomor referensi pesanan Anda.");
      }
      setOrder(json.data);
    } catch (err: any) {
      setOrder(null);
      setError(err.message || "Gagal memuat status pesanan.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentRefInput.trim() || !order || isSubmittingPayment) return;

    setIsSubmittingPayment(true);
    setPaymentError(null);
    try {
      const res = await fetch(`/api/shop/orders/${order.order_number}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_ref: paymentRefInput.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Gagal mengirimkan konfirmasi pembayaran.");
      }
      setPaymentSuccess(true);
      handleSearch();
    } catch (err: any) {
      setPaymentError(err.message || "Gagal mengirimkan bukti pembayaran. Silakan coba lagi.");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const getStepStatus = (step: string) => {
    if (!order) return "pending";
    const status = order.order_status;
    const stages = ["PENDING_PAYMENT", "PROCESSING", "DISPATCHED", "COMPLETED"];
    const currentIndex = stages.indexOf(status);
    const stepIndex = stages.indexOf(step);

    if (order.payment_status === "PAID" && step === "PENDING_PAYMENT") return "done";
    if (currentIndex >= stepIndex) return "done";
    if (currentIndex === stepIndex - 1) return "active";
    return "pending";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Main Window */}
      <div
        className="relative bg-white rounded-2xl sm:rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-stone-200 flex flex-col p-5 sm:p-6 z-10 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-stone-800" />
            <h2 className="text-sm sm:text-base font-bold text-stone-900 tracking-tight">
              Pelacakan Status & Pengiriman
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Tutup pelacakan"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearch} className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              placeholder="Masukkan No. Pesanan (Contoh: SO-2609-8812)"
              className="w-full pl-9 pr-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono font-medium text-stone-900 focus:bg-white focus:border-stone-400 focus:outline-hidden"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !searchCode.trim()}
            className="px-4 py-2.5 bg-brand hover:bg-brand-dark active:bg-brand-dark text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>Lacak</span>
          </button>
        </form>

        {error && (
          <div className="mt-3.5 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Order Details Output */}
        {order && (
          <div className="mt-5 space-y-4 animate-in fade-in duration-200">
            {/* Header summary */}
            <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                  Pemesan / Tujuan
                </span>
                <span className="text-xs sm:text-sm font-bold text-stone-900 block">
                  {order.customer_name}
                </span>
                <span className="text-[11px] text-stone-500">
                  {order.delivery_city} ({order.delivery_method === "PICKUP" ? "Ambil di Pabrik" : "Kirim Armada"})
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                  Total Nilai Pesanan
                </span>
                <span className="text-sm sm:text-base font-black font-mono text-stone-900">
                  {formatIDR(order.total_amount)}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md inline-block mt-0.5 ${
                    order.payment_status === "PAID"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                >
                  {order.payment_status === "PAID" ? "Lunas" : "Menunggu Pembayaran"}
                </span>
              </div>
            </div>

            {/* Shipment Status Stepper */}
            <div className="py-1">
              <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block mb-2.5">
                Progres Pengiriman Pabrik
              </span>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                {/* Step 1: Order Placed */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center mb-1 text-xs ${
                      getStepStatus("PENDING_PAYMENT") === "done"
                        ? "bg-emerald-600 text-white"
                        : "bg-stone-200 text-stone-600"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-stone-800 leading-tight">
                    Pesanan Masuk
                  </span>
                </div>

                {/* Step 2: Processing */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center mb-1 text-xs ${
                      getStepStatus("PROCESSING") === "done"
                        ? "bg-emerald-600 text-white"
                        : getStepStatus("PROCESSING") === "active"
                        ? "bg-amber-500 text-white animate-pulse"
                        : "bg-stone-100 text-stone-400"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-stone-800 leading-tight">
                    Penyiapan Barang
                  </span>
                </div>

                {/* Step 3: Dispatched */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center mb-1 text-xs ${
                      getStepStatus("DISPATCHED") === "done"
                        ? "bg-emerald-600 text-white"
                        : getStepStatus("DISPATCHED") === "active"
                        ? "bg-sky-500 text-white animate-pulse"
                        : "bg-stone-100 text-stone-400"
                    }`}
                  >
                    <Truck className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-stone-800 leading-tight">
                    Pengiriman Armada
                  </span>
                </div>

                {/* Step 4: Completed */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center mb-1 text-xs ${
                      getStepStatus("COMPLETED") === "done"
                        ? "bg-emerald-600 text-white"
                        : "bg-stone-100 text-stone-400"
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-stone-800 leading-tight">
                    Selesai / Diterima
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Confirmation Form (If not paid) */}
            {order.payment_status !== "PAID" && (
              <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/60">
                <span className="text-[11px] font-bold text-stone-700 block mb-1">
                  Konfirmasi Bukti Transfer / Referensi Pembayaran
                </span>
                <p className="text-[11px] text-stone-500 mb-2">
                  Masukkan nomor referensi transfer atau nama pengirim untuk mempercepat verifikasi finance.
                </p>

                {paymentError && (
                  <div className="mb-2 p-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                    {paymentError}
                  </div>
                )}

                {paymentSuccess ? (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>Konfirmasi berhasil dikirimkan. Tim finance sedang memverifikasi.</span>
                  </div>
                ) : (
                  <form onSubmit={handleConfirmPayment} className="flex gap-2">
                    <input
                      type="text"
                      value={paymentRefInput}
                      onChange={(e) => setPaymentRefInput(e.target.value)}
                      placeholder="Contoh: Transfer BCA atas nama Budi"
                      className="flex-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs font-medium text-stone-900 focus:border-stone-400 focus:outline-hidden"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingPayment || !paymentRefInput.trim()}
                      className="px-3.5 py-2 bg-stone-800 hover:bg-stone-900 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmittingPayment ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>Kirim</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
