import React, { useState, useRef } from "react";
import {
  CheckCircle2,
  Copy,
  Check,
  Printer,
  Loader2,
  ShieldCheck,
  UploadCloud,
  CreditCard,
  QrCode,
  ArrowRight,
  ExternalLink,
  MapPin,
  AlertTriangle
} from "lucide-react";
import { formatIDR } from "@/lib/utils";
import { generatePDF } from "@/lib/pdfGenerator";

// Comprehensive Indonesian-wide postal details mapping & validation helper
interface PostalDetails {
  city: string;
  region: string;
  isValid: boolean;
}

export const getDetailsByPostalCode = (code: string): PostalDetails => {
  const clean = code.trim().replace(/[^0-9]/g, "");
  if (clean.length < 5) {
    return { city: "", region: "", isValid: false };
  }

  // Exact mappings for Banyuwangi (CV Batu Emas Origin: 68486)
  const banyuwangiMap: Record<string, string> = {
    "68486": "Gambiran, Banyuwangi",
    "68485": "Cluring, Banyuwangi",
    "68461": "Genteng, Banyuwangi",
    "68465": "Sempu, Banyuwangi",
    "68482": "Tegaldlimo, Banyuwangi",
    "68481": "Muncar, Banyuwangi",
    "68484": "Purwoharjo, Banyuwangi",
    "68483": "Pesanggaran, Banyuwangi",
    "68431": "Rogojampi, Banyuwangi",
    "68453": "Glenmore, Banyuwangi",
    "68454": "Kalibaru, Banyuwangi",
    "68411": "Banyuwangi Kota, Banyuwangi",
    "68412": "Giri, Banyuwangi",
    "68413": "Kabat, Banyuwangi",
    "68421": "Licin, Banyuwangi",
    "68422": "Wongsorejo, Banyuwangi",
    "68423": "Kalipuro, Banyuwangi",
    "68452": "Songgon, Banyuwangi",
    "68462": "Srono, Banyuwangi",
    "68471": "Siliragung, Banyuwangi",
    "68472": "Tegalsari, Banyuwangi",
    "68473": "Bangorejo, Banyuwangi",
    "68474": "Singojuruh, Banyuwangi",
  };

  if (banyuwangiMap[clean]) {
    return { city: banyuwangiMap[clean], region: "Jawa Timur", isValid: true };
  }

  const p1 = clean[0];
  const p2 = clean.slice(0, 2);
  const p3 = clean.slice(0, 3);

  // Banyuwangi general fallback
  if (p3 === "684") {
    return { city: "Banyuwangi", region: "Jawa Timur", isValid: true };
  }

  // Neighboring regencies
  if (p2 === "68") {
    const cities: Record<string, string> = {
      "681": "Jember",
      "682": "Bondowoso",
      "683": "Situbondo",
    };
    return { city: cities[p3] || "Kawasan Jember & Sekitarnya", region: "Jawa Timur", isValid: true };
  }

  if (p2 === "67") {
    const cities: Record<string, string> = {
      "671": "Pasuruan",
      "672": "Probolinggo",
      "673": "Lumajang",
    };
    return { city: cities[p3] || "Kawasan Pasuruan & Sekitarnya", region: "Jawa Timur", isValid: true };
  }

  // Malang
  if (p2 === "65") {
    return { city: "Malang", region: "Jawa Timur", isValid: true };
  }

  // Surabaya & Sidoarjo
  if (p2 === "60" || p2 === "61" || p2 === "62") {
    const cities: Record<string, string> = {
      "60": "Surabaya",
      "61": "Sidoarjo",
      "62": "Gresik",
    };
    return { city: cities[p2] || "Surabaya", region: "Jawa Timur", isValid: true };
  }

  // Rest of East Java
  if (p1 === "6") {
    return { city: "Jawa Timur Tengah", region: "Jawa Timur", isValid: true };
  }

  // Bali, NTB, NTT
  if (p1 === "8") {
    if (p2 === "80" || p2 === "81" || p2 === "82") {
      return { city: p2 === "82" ? "Jembrana / Negara" : "Denpasar / Badung", region: "Bali", isValid: true };
    }
    if (p2 === "83" || p2 === "84") {
      return { city: "Lombok / Mataram", region: "Nusa Tenggara Barat", isValid: true };
    }
    return { city: "Kupang / Flores", region: "Nusa Tenggara Timur", isValid: true };
  }

  // Central Java & DIY
  if (p1 === "5") {
    if (p2 === "55" || p2 === "56") return { city: "Sleman / Bantul", region: "DIY Yogyakarta", isValid: true };
    if (p2 === "50" || p2 === "51") return { city: "Semarang", region: "Jawa Tengah", isValid: true };
    return { city: "Surakarta / Solo", region: "Jawa Tengah", isValid: true };
  }

  // West Java & Banten
  if (p1 === "4") {
    if (p2 === "40" || p2 === "41") return { city: "Bandung", region: "Jawa Barat", isValid: true };
    if (p2 === "42" || p2 === "43") return { city: "Serang", region: "Banten", isValid: true };
    return { city: "Bekasi / Bogor", region: "Jawa Barat", isValid: true };
  }

  // Jakarta
  if (p1 === "1") {
    return { city: "DKI Jakarta", region: "DKI Jakarta", isValid: true };
  }

  // Sumatra
  if (p1 === "2" || p1 === "3") {
    if (p2 === "20" || p2 === "21") return { city: "Medan", region: "Sumatra Utara", isValid: true };
    if (p2 === "30" || p2 === "31") return { city: "Palembang", region: "Sumatra Selatan", isValid: true };
    return { city: "Padang / Jambi", region: "Sumatra", isValid: true };
  }

  // Kalimantan
  if (p1 === "7") {
    return { city: "Pontianak / Balikpapan", region: "Kalimantan", isValid: true };
  }

  // Sulawesi & Papua
  if (p1 === "9") {
    if (p2 === "90" || p2 === "91") return { city: "Makassar", region: "Sulawesi Selatan", isValid: true };
    return { city: "Jayapura / Ambon", region: "Sulawesi & Papua", isValid: true };
  }

  // General Indonesian numeric code
  return { city: "Wilayah Indonesia", region: "Indonesia", isValid: true };
};

interface OrderSuccessModalProps {
  orderData: any;
  onClose: () => void;
  onTrackOrder: (orderNumber: string) => void;
}

export function OrderSuccessModal({ orderData, onClose, onTrackOrder }: OrderSuccessModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!orderData) return null;

  const {
    order_number,
    total_amount,
    payment_method,
    payment_instructions,
    is_dp = 0,
    dp_amount = 0,
    items = [],
    delivery_address = "",
    customer_name = "",
    customer_phone = "",
    shipping_cost = 0,
    subtotal_amount = total_amount - shipping_cost,
    created_at = new Date().toISOString()
  } = orderData;

  const [step, setStep] = useState<"PAYMENT_CONFIRMATION" | "THANK_YOU">(
    payment_method === "COD" ? "THANK_YOU" : "PAYMENT_CONFIRMATION"
  );

  const [copied, setCopied] = useState(false);
  const [copiedAcc, setCopiedAcc] = useState(false);
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmittingProof, setIsSubmittingProof] = useState<boolean>(false);
  const [proofSubmitted, setProofSubmitted] = useState<boolean>(false);
  const [senderName, setSenderName] = useState<string>("");
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleCopyOrder = () => {
    navigator.clipboard.writeText(order_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCopyAccount = (acc: string) => {
    navigator.clipboard.writeText(acc);
    setCopiedAcc(true);
    setTimeout(() => setCopiedAcc(false), 1500);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        setErrorMsg("Gagal membaca berkas.");
        setIsUploading(false);
        return;
      }

      try {
        const res = await fetch("/api/upload/base64", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataUrl,
            filename: file.name,
            prefix: "proof",
          }),
        });

        const json = await res.json();
        if (json.success && json.url) {
          setPaymentProofUrl(json.url);
        } else {
          throw new Error(json.error || "Gagal mengunggah berkas.");
        }
      } catch (err: any) {
        console.error("Payment proof upload failed:", err);
        setErrorMsg(err.message || "Gagal mengunggah bukti pembayaran.");
      } finally {
        setIsUploading(false);
      }
    };

    reader.readAsDataURL(file);
  };

  const handleConfirmPayment = async () => {
    if (!paymentProofUrl) return;
    setIsSubmittingProof(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/shop/orders/${order_number}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_proof_url: paymentProofUrl,
          sender_name: senderName.trim() || "Customer Upload",
        }),
      });

      const json = await res.json();
      if (json.success) {
        setProofSubmitted(true);
        setTimeout(() => {
          setStep("THANK_YOU");
        }, 1200);
      } else {
        throw new Error(json.error || "Gagal mengirim bukti ke server.");
      }
    } catch (err: any) {
      console.error("Confirm payment error:", err);
      setErrorMsg(err.message || "Gagal mengirim konfirmasi pembayaran.");
    } finally {
      setIsSubmittingProof(false);
    }
  };

  const handleExportPDF = async () => {
    if (payment_method === "COD" || !receiptRef.current) return;
    setIsExportingPdf(true);
    try {
      await generatePDF(receiptRef.current, `Invoice-${order_number}.pdf`, { format: "a4" });
    } catch (err) {
      console.error("PDF Export failed:", err);
      alert("Gagal mengunduh berkas PDF. Silakan coba kembali.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const waText = encodeURIComponent(
    `Halo Paving Joss, saya ingin konfirmasi pesanan online dengan nomor order: ${order_number} sebesar ${formatIDR(total_amount)}. Mohon segera diproses.`
  );
  const waUrl = `https://wa.me/6281111113993?text=${waText}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Hidden high-fidelity A4 Invoice for ERP PDF Generation */}
      <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
        <div
          ref={receiptRef}
          className="w-[794px] bg-white p-12 text-stone-900 font-sans"
          style={{ minHeight: "1123px", boxSizing: "border-box" }}
        >
          {/* Invoice Header */}
          <div className="flex justify-between items-start pb-8 border-b-2 border-stone-200">
            <div>
              <h1 className="text-2xl font-black text-stone-900 tracking-tight">CV. BATU EMAS GROUP</h1>
              <p className="text-xs text-stone-500 font-bold uppercase tracking-wider mt-1">Produsen Paving Block SNI Bergaransi</p>
              <div className="text-[11px] text-stone-500 mt-2 space-y-0.5 leading-relaxed font-medium">
                <div>Dusun Petahunan, Gambiran, Banyuwangi, Jawa Timur</div>
                <div>Telepon / WhatsApp: +62 811-1111-3993</div>
                <div>Situs: pavingjoss.com</div>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-extrabold text-brand tracking-tight">FAKTUR DIGITAL</h2>
              <div className="text-[11px] text-stone-500 mt-2 space-y-1 font-medium">
                <div>No. Transaksi: <span className="font-mono font-bold text-stone-900">{order_number}</span></div>
                <div>Tanggal Cetak: {new Date().toLocaleDateString("id-ID")}</div>
                <div>Metode Bayar: {payment_method === "TRANSFER_MANUAL" ? "Transfer Bank" : "QRIS"}</div>
                <div>Status Bayar: <span className="text-emerald-700 font-bold">{is_dp === 1 ? "UANG MUKA (DP 50%) DITERIMA" : "LUNAS"}</span></div>
              </div>
            </div>
          </div>

          {/* Customer & Logistic Info */}
          <div className="grid grid-cols-2 gap-8 py-8 border-b border-stone-200 text-xs">
            <div>
              <h3 className="font-bold text-stone-400 uppercase tracking-widest text-[10px] mb-2">IDENTITAS PELANGGAN</h3>
              <div className="space-y-1.5 font-medium text-stone-800">
                <div className="text-stone-900 font-bold text-sm">{customer_name}</div>
                <div>Telepon: {customer_phone}</div>
                <div>Email: {orderData.customer_email || "-"}</div>
              </div>
            </div>
            <div>
              <h3 className="font-bold text-stone-400 uppercase tracking-widest text-[10px] mb-2">INFORMASI PENGIRIMAN</h3>
              <div className="space-y-1.5 font-medium text-stone-850">
                <div>Metode: <span className="font-bold">{payment_method === "COD" ? "Cash On Delivery" : is_dp === 1 ? "DP 50% Scheduled Production" : "Lunas / Diproses"}</span></div>
                <div>Tujuan: {delivery_address || "Ambil Sendiri di Pabrik"}</div>
                {orderData.delivery_distance ? <div>Estimasi Jarak Pabrik: {orderData.delivery_distance} km</div> : null}
              </div>
            </div>
          </div>

          {/* Product Items Table */}
          <div className="py-8">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-stone-300 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 pr-4">NAMA PRODUK</th>
                  <th className="py-3 px-4 text-center">UOM</th>
                  <th className="py-3 px-4 text-right">KUANTITAS</th>
                  <th className="py-3 px-4 text-right">HARGA SATUAN</th>
                  <th className="py-3 pl-4 text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-150 text-stone-800 font-medium">
                {items.map((it: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-3.5 pr-4 text-stone-950 font-bold">{it.item_name}</td>
                    <td className="py-3.5 px-4 text-center">{it.uom}</td>
                    <td className="py-3.5 px-4 text-right font-mono">{it.qty?.toLocaleString()}</td>
                    <td className="py-3.5 px-4 text-right font-mono">{formatIDR(it.unit_price || it.total_price / it.qty)}</td>
                    <td className="py-3.5 pl-4 text-right font-mono font-bold text-stone-900">{formatIDR(it.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pricing Totals Section */}
          <div className="flex justify-end pt-6 border-t-2 border-stone-100">
            <div className="w-80 text-xs space-y-2.5">
              <div className="flex justify-between text-stone-600 font-medium">
                <span>Subtotal Nilai Barang:</span>
                <span className="font-mono font-bold text-stone-800">{formatIDR(subtotal_amount)}</span>
              </div>
              <div className="flex justify-between text-stone-600 font-medium">
                <span>Biaya Pengiriman Proyek:</span>
                <span className="font-mono font-bold text-stone-800">{formatIDR(shipping_cost)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-stone-950 pt-2.5 border-t border-stone-200">
                <span>TOTAL TAGIHAN:</span>
                <span className="font-mono text-base font-black text-brand">{formatIDR(total_amount)}</span>
              </div>
              {is_dp === 1 || Number(is_dp) === 1 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5 mt-2">
                  <div className="flex justify-between font-bold text-amber-900">
                    <span>Uang Muka (DP 50%):</span>
                    <span className="font-mono">{formatIDR(dp_amount || total_amount * 0.5)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-amber-800 font-medium pt-1.5 border-t border-amber-200/50">
                    <span>Sisa Pelunasan di Lokasi:</span>
                    <span className="font-mono">{formatIDR(total_amount - (dp_amount || total_amount * 0.5))}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Footer Note */}
          <div className="mt-20 pt-8 border-t border-stone-200 flex justify-between items-end">
            <div className="text-[10px] text-stone-400 font-medium leading-relaxed max-w-sm">
              * Dokumen ini dibuat otomatis oleh sistem ERP CV. Batu Emas Group dan valid secara hukum sebagai bukti pemesanan formal produk Paving Joss SNI.
            </div>
            <div className="flex gap-16 text-center text-xs">
              <div className="w-28 pb-16 border-b border-stone-300 font-medium text-stone-400">Tim Sales Pabrik</div>
              <div className="w-28 pb-16 border-b border-stone-300 font-bold text-stone-800">{customer_name}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Window Container */}
      <div
        className="relative bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-stone-200 flex flex-col p-5 sm:p-6 z-10 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Red elegant top line indicator */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-brand" />

        {step === "PAYMENT_CONFIRMATION" ? (
          /* ==============================================================
             STEP 1: PAYMENT GATEWAY & RECEIPT CONFIRMATION
             ============================================================== */
          <div className="space-y-4 pt-1">
            <div className="text-center">
              <div className="w-11 h-11 bg-rose-50 text-brand rounded-xl border border-rose-100 flex items-center justify-center mx-auto mb-2 shadow-2xs">
                <CreditCard className="w-5.5 h-6" />
              </div>
              <h2 className="text-base font-black text-stone-900 uppercase tracking-tight">
                Konfirmasi Pembayaran
              </h2>
              <p className="text-xs text-stone-500 max-w-xs mx-auto mt-1 leading-normal font-medium">
                Selesaikan pembayaran agar pesanan Anda masuk antrean cetak / produksi pabrik.
              </p>
            </div>

            {/* Order Reference Strip */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-150 flex items-center justify-between text-xs">
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">No. Referensi Order</span>
                <span className="font-mono font-bold text-stone-800">{order_number}</span>
              </div>
              <button
                onClick={handleCopyOrder}
                className="px-2.5 py-1 rounded-lg bg-white border border-stone-200 hover:border-stone-400 font-bold text-[10px] text-stone-700 flex items-center gap-1 cursor-pointer transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-stone-400" />}
                <span>{copied ? "Tersalin" : "Salin No"}</span>
              </button>
            </div>

            {/* Price to transfer details */}
            <div className="p-3.5 bg-rose-50/50 border border-rose-100 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black text-brand uppercase tracking-wider block">
                  {is_dp === 1 ? "UANG MUKA / DP (50%)" : "PEMBAYARAN LUNAS (100%)"}
                </span>
                <span className="text-[10px] text-stone-500 font-semibold">
                  {is_dp === 1 ? `Total Tagihan: ${formatIDR(total_amount)}` : "Sesuai rincian pesanan"}
                </span>
              </div>
              <span className="font-mono text-base font-black text-brand">
                {is_dp === 1 ? formatIDR(dp_amount) : formatIDR(total_amount)}
              </span>
            </div>

            {/* Payment Details Box */}
            <div className="p-3.5 bg-white border border-stone-200 rounded-xl space-y-3">
              <span className="text-[10px] font-black text-stone-500 uppercase tracking-wider block border-b border-stone-100 pb-1.5">
                Pilihan Pengiriman Pembayaran
              </span>

              {payment_method === "TRANSFER_MANUAL" ? (
                <div className="space-y-2.5">
                  <p className="text-xs text-stone-600 leading-normal font-medium">
                    Silakan lakukan transfer bank ke rekening resmi CV Batu Emas Group berikut:
                  </p>
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs text-stone-900 block">Bank BCA (Central Asia)</span>
                      <span className="font-mono font-bold text-sm text-brand tracking-wider">8920-1111-3993</span>
                      <span className="text-[9px] text-stone-400 block font-medium">a.n. CV. Batu Emas Group</span>
                    </div>
                    <button
                      onClick={() => handleCopyAccount("892011113993")}
                      className="px-2.5 py-1 rounded-lg bg-white border border-stone-200 hover:border-stone-450 font-bold text-[10px] text-stone-750 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      {copiedAcc ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-stone-400" />}
                      <span>{copiedAcc ? "Tersalin" : "Salin Rek"}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-1">
                  <div className="w-32 h-32 mx-auto bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-center p-2 mb-2">
                    <img
                      src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=00020101021226580014ID.LINKAJA.WWW01189360091400000000000215ID10200392019280303UMI51440014ID.GO.QRIS.WWW0215ID10200392019280303UMI520458125303360540840500005802ID5920PAVING JOSS BATU EMAS6010BANYUWANGI61056848662070703A016304D6B5"
                      alt="QRIS Code"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="text-xs font-extrabold text-stone-800 block">
                    {payment_instructions?.qris?.merchant_name || "PAVING JOSS - CV BATU EMAS"}
                  </span>
                  <span className="text-[10px] text-stone-500">
                    NMID: {payment_instructions?.qris?.nmid || "ID1020039201928"}
                  </span>
                </div>
              )}
            </div>

            {/* File Upload Box */}
            <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 space-y-3">
              {proofSubmitted ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center flex flex-col items-center justify-center gap-1 animate-in fade-in duration-150">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-800">Bukti Unggah Tersimpan!</span>
                  <p className="text-[10px] text-emerald-600">Menghubungkan ke halaman terima kasih...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[9px] font-extrabold text-stone-500 uppercase tracking-wider mb-1">
                      Nama Pengirim / Atas Nama Rekening (Opsional)
                    </label>
                    <input
                      type="text"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Contoh: Budi Santoso"
                      className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs font-bold text-stone-900 focus:outline-hidden focus:border-stone-400 focus:ring-0"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-extrabold text-stone-500 uppercase tracking-wider mb-1.5">
                      Unggah Bukti Transfer / SS QRIS <span className="text-brand">*</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileChange}
                        disabled={isUploading}
                        className="hidden"
                        id="success-proof-upload"
                      />
                      <label
                        htmlFor="success-proof-upload"
                        className="px-3 py-2 rounded-lg border border-stone-300 hover:border-stone-450 bg-white hover:bg-stone-50 text-stone-800 text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-500" />
                            <span>Mengunggah...</span>
                          </>
                        ) : (
                          <>
                            <UploadCloud className="w-3.5 h-3.5 text-stone-500" />
                            <span>Pilih Bukti Pembayaran</span>
                          </>
                        )}
                      </label>

                      {paymentProofUrl ? (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px] font-bold">
                            Berhasil Diunggah!
                          </span>
                          <a
                            href={paymentProofUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-stone-500 hover:text-stone-800 text-[11px] font-bold underline"
                          >
                            Lihat Berkas
                          </a>
                        </div>
                      ) : (
                        <span className="text-stone-400 text-[10px] italic font-medium">Belum ada bukti terpilih</span>
                      )}
                    </div>
                  </div>

                  {paymentProofUrl && (
                    <button
                      onClick={handleConfirmPayment}
                      disabled={isSubmittingProof}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50 mt-1"
                    >
                      {isSubmittingProof ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Mengirim Konfirmasi...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>KIRIM KONFIRMASI & SELESAIKAN ORDER</span>
                        </>
                      )}
                    </button>
                  )}

                  {errorMsg && (
                    <p className="text-[10px] text-rose-600 font-bold bg-rose-50 p-2 rounded border border-rose-100">
                      {errorMsg}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ==============================================================
             STEP 2: THANK YOU WINDOW (MINIMALIST & HIGHLY ELEGANT)
             ============================================================== */
          <div className="space-y-5 pt-2">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 flex items-center justify-center mx-auto shadow-3xs animate-in zoom-in-75 duration-300">
                <CheckCircle2 className="w-6.5 h-6.5" />
              </div>
              <h2 className="text-lg font-black text-stone-900 tracking-tight">
                Pemesanan Berhasil!
              </h2>
              <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed font-semibold">
                Terima kasih atas pesanan Anda. Transaksi resmi telah dicatatkan ke dalam sistem logistik CV Batu Emas Group.
              </p>
            </div>

            {/* Compact Reference Banner */}
            <div className="px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">No. Referensi Pesanan</span>
                <span className="font-mono font-bold text-stone-800 text-sm">{order_number}</span>
              </div>
              <button
                onClick={handleCopyOrder}
                className="px-2.5 py-1 rounded-lg bg-white border border-stone-200 hover:border-stone-400 font-bold text-[10px] text-stone-700 flex items-center gap-1 cursor-pointer transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-stone-400" />}
                <span>{copied ? "Salin" : "Salin"}</span>
              </button>
            </div>

            {/* Concise status strip */}
            <div className="p-3 bg-stone-50/50 rounded-xl border border-stone-150 text-[11px] leading-relaxed text-stone-600 text-center font-medium">
              {payment_method === "COD" ? (
                <span>Pesanan **COD (Bayar di Tempat)** Anda telah terdaftar dan akan dikonfirmasi oleh driver pabrik sebelum dikirim.</span>
              ) : (
                <span>Bukti transfer digital berhasil diverifikasi. Dokumen ERP format PDF telah dijadwalkan secara otomatis untuk diunduh.</span>
              )}
            </div>

            {/* Actions Stack */}
            <div className="space-y-2.5">
              {/* BRANDED WHATSAPP BUTTON (NO CAPS, VERY CLEAN) */}
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] active:bg-[#1ca34f] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs hover:shadow-md transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current text-white shrink-0" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.03 11.966.03c3.184.001 6.177 1.24 8.426 3.492 2.249 2.252 3.484 5.247 3.481 8.432-.007 6.613-5.344 11.93-11.912 11.93-2.007-.001-3.978-.507-5.714-1.472L0 24zm6.59-4.846c1.6.95 3.18 1.448 4.74 1.449 5.43-.001 9.85-4.366 9.85-9.727.002-2.599-1.01-5.043-2.85-6.886-1.84-1.841-4.29-2.855-6.89-2.856-5.42 0-9.84 4.367-9.84 9.728-.001 1.705.509 3.371 1.47 4.814l-.99 3.616 3.7-.972zm11.13-6.974c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-1.12-.56-1.92-.98-2.68-1.68-.65-.6-1.15-1.28-1.28-1.5-.13-.22-.01-.35.11-.47.11-.12.3-.35.45-.53.15-.17.2-.3.3-.5.1-.2.05-.38-.02-.53-.07-.15-.67-1.62-.92-2.22-.24-.6-.5-1.06-.67-1.07l-.57-.01c-.2 0-.52.07-.79.38-.27.3-1.03 1-1.03 2.44s1.05 2.83 1.2 3.03c.15.2 2.06 3.15 5 4.43.7.3 1.25.48 1.68.62.7.22 1.34.19 1.84.11.56-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.08-.12-.28-.19-.58-.34z" />
                </svg>
                <span>WhatsApp Sales (Konfirmasi Cepat)</span>
              </a>

              <div className="grid grid-cols-2 gap-2.5">
                {/* PDF EXPORT BUTTON (DISABLED FOR COD) */}
                <button
                  onClick={handleExportPDF}
                  disabled={payment_method === "COD" || isExportingPdf}
                  className="py-2 px-3 rounded-xl border border-stone-200 hover:border-stone-400 bg-white hover:bg-stone-50 font-bold text-stone-750 text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:bg-stone-50 disabled:border-stone-150 disabled:cursor-not-allowed"
                  title={payment_method === "COD" ? "Dokumen PDF tidak tersedia untuk opsi COD" : "Unduh Dokumen PDF"}
                >
                  {isExportingPdf ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Mengunduh...</span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-3.5 h-3.5 text-stone-500" />
                      <span>Unduh PDF</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    onTrackOrder(order_number);
                    onClose();
                  }}
                  className="py-2 px-3 rounded-xl bg-brand hover:bg-brand-dark active:bg-brand-dark text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span>Lacak Pesanan</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* FIX CLOSE & RETURN ACTION */}
              <button
                onClick={onClose}
                className="w-full py-2 text-center text-xs font-extrabold text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
              >
                Tutup & Kembali ke Toko
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
