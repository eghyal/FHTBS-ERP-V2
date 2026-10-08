import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Truck,
  Building2,
  CreditCard,
  QrCode,
  Banknote,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Scale,
  Receipt,
} from "lucide-react";
import { CartItem, CheckoutFormState } from "@/types/shop";
import { formatIDR } from "@/lib/utils";
import { getDetailsByPostalCode } from "./OrderSuccessModal";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  subtotal: number;
  totalWeightKg: number;
  onOrderPlaced: (orderResponse: any) => void;
  customer?: any | null;
}

const calculateDistanceByPostalCode = (code: string): number => {
  const cleanCode = code.trim().replace(/[^0-9]/g, "");
  if (!cleanCode || cleanCode.length < 5) return 10; // Default distance

  // Origin is CV Batu Emas Group factory location at 68486
  if (cleanCode === "68486") return 0;

  // Known exact match lookup for high precision Banyuwangi Gambiran region
  const lookup: Record<string, number> = {
    "68486": 0,   // Gambiran (Factory Location)
    "68485": 5,   // Cluring
    "68461": 10,  // Genteng
    "68465": 15,  // Sempu
    "68482": 25,  // Tegaldlimo
    "68481": 22,  // Muncar
    "68484": 18,  // Purwoharjo
    "68483": 35,  // Pesanggaran
    "68431": 28,  // Rogojampi
    "68453": 30,  // Glenmore
    "68454": 40,  // Kalibaru
    "68411": 50,  // Banyuwangi City
  };

  if (lookup[cleanCode] !== undefined) {
    return lookup[cleanCode];
  }

  const numericCode = parseInt(cleanCode, 10);
  if (isNaN(numericCode)) return 10;

  const prefix1 = cleanCode[0];
  const prefix2 = cleanCode.slice(0, 2);
  const prefix3 = cleanCode.slice(0, 3);

  // 1. Banyuwangi Region (684xx)
  if (prefix3 === "684") {
    const diff = Math.abs(numericCode - 68486);
    return Math.max(5, Math.min(65, Math.round(diff * 0.75)));
  }

  // 2. Neighboring East Java regions (Jember, Bondowoso, Situbondo, Lumajang, Probolinggo)
  if (prefix2 === "68") {
    const diff = Math.abs(numericCode - 68486);
    return Math.max(70, Math.min(180, 70 + (diff % 110)));
  }

  // 3. Rest of East Java (6xxxx)
  if (prefix1 === "6") {
    const diff = Math.abs(numericCode - 68486);
    return Math.max(180, Math.min(450, 180 + (diff % 270)));
  }

  // 4. Bali, NTB, NTT (8xxxx)
  if (prefix1 === "8") {
    if (prefix2 === "82" || prefix2 === "80" || prefix2 === "81") {
      // Bali (Gilimanuk to Denpasar etc)
      return Math.max(60, Math.min(220, 60 + (numericCode % 160)));
    }
    if (prefix2 === "83" || prefix2 === "84") {
      // NTB (Lombok, Sumbawa)
      return Math.max(220, Math.min(450, 220 + (numericCode % 230)));
    }
    // NTT
    return Math.max(500, Math.min(1200, 500 + (numericCode % 700)));
  }

  // 5. Central Java & DIY Yogyakarta (5xxxx)
  if (prefix1 === "5") {
    return Math.max(450, Math.min(700, 450 + (Math.abs(numericCode - 50000) % 250)));
  }

  // 6. West Java & Banten (4xxxx)
  if (prefix1 === "4") {
    return Math.max(700, Math.min(1000, 700 + (Math.abs(numericCode - 40000) % 300)));
  }

  // 7. DKI Jakarta (1xxxx)
  if (prefix1 === "1") {
    return Math.max(950, Math.min(1100, 950 + (Math.abs(numericCode - 10000) % 150)));
  }

  // 8. Kalimantan (7xxxx)
  if (prefix1 === "7") {
    return Math.max(800, Math.min(1800, 800 + (numericCode % 1000)));
  }

  // 9. Sumatra (2xxxx or 3xxxx)
  if (prefix1 === "2" || prefix1 === "3") {
    return Math.max(1100, Math.min(2500, 1100 + (numericCode % 1400)));
  }

  // 10. Sulawesi, Maluku, Papua (9xxxx)
  if (prefix1 === "9") {
    const subNum = parseInt(prefix2, 10);
    if (subNum >= 90 && subNum <= 95) {
      // Sulawesi general fallback
      return Math.max(1000, Math.min(2000, 1000 + (numericCode % 1000)));
    }
    // Maluku & Papua general fallback
    return Math.max(2000, Math.min(3500, 2000 + (numericCode % 1500)));
  }

  return 350; // General Global Indonesia fallback
};

export function CheckoutModal({
  isOpen,
  onClose,
  items,
  subtotal,
  totalWeightKg,
  onOrderPlaced,
  customer,
}: CheckoutModalProps) {
  const [formData, setFormData] = useState<CheckoutFormState>({
    customer_name: customer?.customer_name || "",
    customer_phone: customer?.phone || "",
    customer_email: customer?.email || "",
    delivery_address: "",
    delivery_city: "Banyuwangi",
    delivery_method: "DELIVERY",
    payment_method: "TRANSFER_MANUAL",
    customer_notes: "",
  });

  // Additional payment states
  const [postalCode, setPostalCode] = useState<string>("68486");
  const [paymentType, setPaymentType] = useState<"FULL" | "DP">("FULL");
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const deliveryDistance = useMemo(() => {
    return calculateDistanceByPostalCode(postalCode);
  }, [postalCode]);

  const postalDetails = useMemo(() => {
    return getDetailsByPostalCode(postalCode);
  }, [postalCode]);

  useEffect(() => {
    if (customer && isOpen) {
      setFormData((prev) => ({
        ...prev,
        customer_name: prev.customer_name || customer.customer_name || "",
        customer_phone: prev.customer_phone || customer.phone || "",
        customer_email: prev.customer_email || customer.email || "",
      }));
    }
  }, [customer, isOpen]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const shippingCost =
    formData.delivery_method === "PICKUP" ? 0 : deliveryDistance * 10000;
  const grandTotal = subtotal + shippingCost;
  const dpAmount = grandTotal * 0.5;

  const handleChange = (field: keyof CheckoutFormState, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
          throw new Error(json.error || "Gagal mengunggah berkas ke server.");
        }
      } catch (err: any) {
        console.error("Payment proof upload failed:", err);
        setErrorMsg(err.message || "Gagal mengunggah bukti pembayaran. Silakan coba berkas lain.");
      } finally {
        setIsUploading(false);
      }
    };

    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMsg(null);

    if (!formData.customer_name.trim()) {
      setErrorMsg("Mohon masukkan nama lengkap Anda.");
      return;
    }
    if (!formData.customer_phone.trim()) {
      setErrorMsg("Mohon masukkan nomor WhatsApp atau telepon yang aktif.");
      return;
    }
    if (formData.delivery_method === "DELIVERY" && !formData.delivery_address.trim()) {
      setErrorMsg("Mohon lengkapi alamat tujuan pengiriman proyek / rumah Anda.");
      return;
    }
    if (formData.delivery_method === "DELIVERY" && (!postalCode || postalCode.length < 5)) {
      setErrorMsg("Mohon lengkapi 5 digit Kode POS alamat tujuan.");
      return;
    }

    const postalDetails = getDetailsByPostalCode(postalCode);
    if (formData.delivery_method === "DELIVERY" && !postalDetails.isValid) {
      setErrorMsg("Mohon masukkan 5 digit Kode POS Indonesia yang valid untuk pengiriman.");
      return;
    }



    setIsSubmitting(true);
    try {
      const payload = {
        customer_name: formData.customer_name.trim(),
        customer_phone: formData.customer_phone.trim(),
        customer_email: formData.customer_email ? formData.customer_email.trim() : null,
        delivery_address:
          formData.delivery_method === "PICKUP"
            ? "Ambil Sendiri di Pabrik - Dusun Petahunan, Gambiran, Banyuwangi"
            : `${formData.delivery_address.trim()} (Kode POS: ${postalCode})`,
        delivery_city: formData.delivery_method === "PICKUP" ? "Banyuwangi" : postalDetails.city,
        delivery_method: formData.delivery_method,
        payment_method: formData.payment_method,
        customer_notes: formData.customer_notes ? formData.customer_notes.trim() : null,
        delivery_distance: formData.delivery_method === "PICKUP" ? 0 : deliveryDistance,
        is_dp: formData.payment_method === "COD" ? 0 : paymentType === "DP" ? 1 : 0,
        dp_amount: formData.payment_method === "COD" ? 0 : paymentType === "DP" ? dpAmount : 0,
        payment_proof_url: formData.payment_method === "COD" ? null : paymentProofUrl,
        items: items.map((i) => ({
          item_id: i.product.id,
          qty: i.qty,
        })),
      };

      const res = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Gagal membuat pesanan.");
      }

      onOrderPlaced(json.data);
    } catch (err: any) {
      console.error("[Checkout] Order submission failed:", err);
      setErrorMsg(err.message || "Terjadi kendala saat memproses pesanan. Silakan coba kembali.");
    } finally {
      setIsSubmitting(false);
    }
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
        className="relative bg-white rounded-2xl sm:rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-stone-200 flex flex-col z-10 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-20">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight leading-none">
              Penyelesaian Pesanan
            </h2>
            <p className="text-[11px] text-stone-500 mt-1">
              Lengkapi data pengiriman dan pilih metode pembayaran resmi Paving Joss
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Tutup form checkout"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-xl animate-bounce">
            {errorMsg}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
          {/* Left Column (Inputs) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Section 1: Customer Contact */}
            <div>
              <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-2.5">
                1. Data Pembeli
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Nama Lengkap / Perusahaan <span className="text-brand">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.customer_name}
                    onChange={(e) => handleChange("customer_name", e.target.value)}
                    placeholder="Contoh: Budi Santoso / PT. Graha Mandiri"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:bg-white focus:border-stone-400 focus:outline-hidden transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      No. WhatsApp / Telepon <span className="text-brand">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.customer_phone}
                      onChange={(e) => handleChange("customer_phone", e.target.value)}
                      placeholder="Contoh: 081234567890"
                      className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:bg-white focus:border-stone-400 focus:outline-hidden transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Email (Opsional)
                    </label>
                    <input
                      type="email"
                      value={formData.customer_email}
                      onChange={(e) => handleChange("customer_email", e.target.value)}
                      placeholder="Contoh: budi@gmail.com"
                      className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:bg-white focus:border-stone-400 focus:outline-hidden transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Delivery Method */}
            <div className="pt-4 border-t border-stone-100">
              <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-2.5">
                2. Metode Pengiriman
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3.5">
                <label
                  className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                    formData.delivery_method === "DELIVERY"
                      ? "border-brand bg-rose-50/40 text-stone-900 shadow-2xs"
                      : "border-stone-200 bg-stone-50/60 text-stone-700 hover:bg-stone-100/60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-2 text-xs font-bold">
                      <Truck className={`w-4 h-4 ${formData.delivery_method === "DELIVERY" ? "text-brand" : "text-stone-500"}`} />
                      Kirim Armada Pabrik
                    </span>
                    <input
                      type="radio"
                      name="delivery_method"
                      checked={formData.delivery_method === "DELIVERY"}
                      onChange={() => handleChange("delivery_method", "DELIVERY")}
                      className="accent-brand"
                    />
                  </div>
                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    Diantar langsung ke lokasi proyek / rumah Anda. Bebas biaya kirim belanja min. Rp 10 Juta.
                  </p>
                </label>

                <label
                  className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                    formData.delivery_method === "PICKUP"
                      ? "border-brand bg-rose-50/40 text-stone-900 shadow-2xs"
                      : "border-stone-200 bg-stone-50/60 text-stone-700 hover:bg-stone-100/60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-2 text-xs font-bold">
                      <Building2 className={`w-4 h-4 ${formData.delivery_method === "PICKUP" ? "text-brand" : "text-stone-500"}`} />
                      Ambil Sendiri di Pabrik
                    </span>
                    <input
                      type="radio"
                      name="delivery_method"
                      checked={formData.delivery_method === "PICKUP"}
                      onChange={() => handleChange("delivery_method", "PICKUP")}
                      className="accent-brand"
                    />
                  </div>
                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    Ambil langsung di pabrik Gambiran Banyuwangi dengan armada sendiri (bebas ongkir).
                  </p>
                </label>
              </div>

              {formData.delivery_method === "DELIVERY" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Kode POS <span className="text-brand">*</span>
                      </label>
                      <input
                        type="text"
                        maxLength={5}
                        pattern="[0-9]*"
                        inputMode="numeric"
                        required={formData.delivery_method === "DELIVERY"}
                        value={postalCode}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, "");
                          setPostalCode(val);
                        }}
                        placeholder="68486"
                        className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:bg-white focus:border-stone-400 focus:outline-hidden text-center tracking-widest font-mono"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Kota & Provinsi
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          readOnly
                          value={postalDetails.isValid ? `${postalDetails.city}, ${postalDetails.region}` : "Harap isi POS"}
                          className="w-full px-3 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-xs font-semibold text-stone-400 cursor-not-allowed text-center truncate"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Alamat Tujuan / Proyek <span className="text-brand">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.delivery_address}
                        onChange={(e) => handleChange("delivery_address", e.target.value)}
                        placeholder="Contoh: Jl. Raya Genteng No. 12"
                        className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:bg-white focus:border-stone-400 focus:outline-hidden"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 3: Payment Method */}
            <div className="pt-4 border-t border-stone-100">
              <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-2.5">
                3. Metode Pembayaran
              </h3>
              <div className="space-y-2">
                <label
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    formData.payment_method === "TRANSFER_MANUAL"
                      ? "border-brand bg-rose-50/40 text-stone-900 shadow-2xs"
                      : "border-stone-200 bg-white hover:bg-stone-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className={`w-4 h-4 ${formData.payment_method === "TRANSFER_MANUAL" ? "text-brand" : "text-stone-500"}`} />
                    <div>
                      <span className="text-xs font-bold text-stone-900 block">
                        Transfer Rekening Resmi Perusahaan (BCA)
                      </span>
                      <span className="text-[11px] text-stone-500">
                        Transfer aman ke CV. Batu Emas Group, verifikasi instan
                      </span>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="payment_method"
                    checked={formData.payment_method === "TRANSFER_MANUAL"}
                    onChange={() => handleChange("payment_method", "TRANSFER_MANUAL")}
                    className="accent-brand"
                  />
                </label>

                <label
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    formData.payment_method === "QRIS"
                      ? "border-brand bg-rose-50/40 text-stone-900 shadow-2xs"
                      : "border-stone-200 bg-white hover:bg-stone-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <QrCode className={`w-4 h-4 ${formData.payment_method === "QRIS" ? "text-brand" : "text-stone-500"}`} />
                    <div>
                      <span className="text-xs font-bold text-stone-900 block">
                        QRIS Dinamis Instan
                      </span>
                      <span className="text-[11px] text-stone-500">
                        Scan via M-Banking, GoPay, OVO, ShopeePay, Dana, dll.
                      </span>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="payment_method"
                    checked={formData.payment_method === "QRIS"}
                    onChange={() => handleChange("payment_method", "QRIS")}
                    className="accent-brand"
                  />
                </label>

                <label
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    formData.payment_method === "COD"
                      ? "border-brand bg-rose-50/40 text-stone-900 shadow-2xs"
                      : "border-stone-200 bg-white hover:bg-stone-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Banknote className={`w-4 h-4 ${formData.payment_method === "COD" ? "text-brand" : "text-stone-500"}`} />
                    <div>
                      <span className="text-xs font-bold text-stone-900 block">
                        Bayar di Tempat (COD) / Bayar di Pabrik
                      </span>
                      <span className="text-[11px] text-stone-500">
                        Bayar tunai/transfer saat barang sampai atau saat ambil di pabrik
                      </span>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="payment_method"
                    checked={formData.payment_method === "COD"}
                    onChange={() => handleChange("payment_method", "COD")}
                    className="accent-brand"
                  />
                </label>
              </div>
            </div>

            {/* Section 3.5: Down Payment & Proof of Payment Upload */}
            {formData.payment_method !== "COD" && (
              <div className="pt-4 border-t border-stone-100 space-y-4">
                <div>
                  <h3 className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-2.5">
                    3a. Pilihan Pembayaran & Uang Muka (DP)
                  </h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    <label
                      className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                        paymentType === "FULL"
                          ? "border-brand bg-rose-50/40 text-stone-900 shadow-2xs"
                          : "border-stone-200 bg-white hover:bg-stone-50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-stone-900">Pembayaran Penuh (100%)</span>
                        <input
                          type="radio"
                          name="payment_type"
                          checked={paymentType === "FULL"}
                          onChange={() => setPaymentType("FULL")}
                          className="accent-brand"
                        />
                      </div>
                      <span className="text-[10px] text-stone-500">Bayar penuh seluruh pesanan langsung di awal</span>
                    </label>

                    <label
                      className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                        paymentType === "DP"
                          ? "border-brand bg-rose-50/40 text-stone-900 shadow-2xs"
                          : "border-stone-200 bg-white hover:bg-stone-50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-stone-900">Uang Muka / DP (50%)</span>
                        <input
                          type="radio"
                          name="payment_type"
                          checked={paymentType === "DP"}
                          onChange={() => setPaymentType("DP")}
                          className="accent-brand"
                        />
                      </div>
                      <span className="text-[10px] text-stone-500">Membayar minimal uang muka 50% untuk mulai diproduksi</span>
                    </label>
                  </div>
                </div>


              </div>
            )}

            {/* Section 4: Notes */}
            <div className="pt-4 border-t border-stone-100">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Catatan Pengiriman / Arahan Khusus (Opsional)
              </label>
              <textarea
                rows={2}
                value={formData.customer_notes}
                onChange={(e) => handleChange("customer_notes", e.target.value)}
                placeholder="Contoh: Titik bongkar dekat gerbang timur, tolong konfirmasi 1 jam sebelum jalan..."
                className="w-full px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:bg-white focus:border-stone-400 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Right Column: Order Summary */}
          <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-stone-200/95 shadow-xs flex flex-col justify-between relative overflow-hidden">
            {/* Elegant top red indicator strip */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-brand" />

            <div className="space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-stone-100">
                <div className="p-1.5 rounded-lg bg-rose-50 text-brand">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">
                    Ringkasan Pesanan
                  </h3>
                  <p className="text-[10px] text-stone-500 font-medium">
                    Faktur resmi retail & proyek ({items.length} Barang)
                  </p>
                </div>
              </div>

              {/* Items Mini List */}
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {items.map(({ product, qty }) => {
                  const effectivePrice = product.promo_price > 0 ? product.promo_price : product.unit_price;
                  return (
                    <div key={product.id} className="p-3 bg-stone-50/60 hover:bg-stone-50 rounded-xl border border-stone-100 flex items-center justify-between gap-3 transition-colors">
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-xs text-stone-900 line-clamp-1">
                          {product.name}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-medium text-stone-500 font-mono">
                          <span className="bg-white px-1.5 py-0.5 rounded border border-stone-200/60 font-sans font-bold text-stone-700">
                            {qty.toLocaleString()} {product.uom}
                          </span>
                          <span>&times;</span>
                          <span>{formatIDR(effectivePrice)}</span>
                        </div>
                      </div>
                      <span className="font-extrabold font-mono text-xs text-stone-900 shrink-0 bg-white px-2.5 py-1 rounded-lg border border-stone-150">
                        {formatIDR(effectivePrice * qty)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Cost Summary Section */}
              <div className="bg-stone-50/50 rounded-xl p-3.5 border border-stone-150/60 space-y-3">
                {/* Total Weight Row */}
                <div className="flex items-center justify-between text-xs text-stone-600 pb-2.5 border-b border-stone-200/50">
                  <span className="flex items-center gap-2 font-medium">
                    <Scale className="w-3.5 h-3.5 text-stone-400" />
                    Berat Muatan
                  </span>
                  <span className="font-mono font-bold text-stone-800">
                    {totalWeightKg.toLocaleString()} kg <span className="text-[10px] font-sans font-medium text-stone-500">({Math.ceil(totalWeightKg / 1000)} Ton)</span>
                  </span>
                </div>

                {/* Subtotal Row */}
                <div className="flex justify-between text-xs text-stone-600">
                  <span className="font-medium">Subtotal Nilai Barang</span>
                  <span className="font-mono font-bold text-stone-800">{formatIDR(subtotal)}</span>
                </div>

                {/* Shipping Row */}
                <div className="flex justify-between text-xs text-stone-600">
                  <span className="font-medium">Biaya Pengiriman</span>
                  <span className="font-mono font-bold text-stone-900">
                    {shippingCost === 0 ? (
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                        GRATIS (Armada Pabrik)
                      </span>
                    ) : (
                      formatIDR(shippingCost)
                    )}
                  </span>
                </div>

                {/* Distance Meta Indicator */}
                {formData.delivery_method === "DELIVERY" && (
                  <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-stone-200/60 text-[11px] font-medium text-stone-500">
                    <span className="flex items-center gap-1">
                      <Truck className="w-3 h-3 text-brand" />
                      Estimasi Jarak (POS {postalCode})
                    </span>
                    <span className="font-mono font-bold text-stone-800 bg-stone-100 px-1.5 py-0.2 rounded">{deliveryDistance} km</span>
                  </div>
                )}
              </div>

              {/* Total Billing */}
              <div className="bg-rose-50/60 border border-rose-100 text-stone-900 rounded-xl p-4 flex items-center justify-between shadow-3xs">
                <div>
                  <span className="text-[9px] font-black text-brand uppercase tracking-widest block">
                    TOTAL TAGIHAN
                  </span>
                  <span className="text-[11px] text-stone-500 font-medium">Termasuk armada & PPN</span>
                </div>
                <span className="font-mono text-xl font-black text-brand tracking-tight">
                  {formatIDR(grandTotal)}
                </span>
              </div>

              {/* Secure Down Payment Highlight */}
              {paymentType === "DP" && formData.payment_method !== "COD" && (
                <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/5 border border-amber-300/85 rounded-xl p-4 flex flex-col gap-2.5 relative overflow-hidden">
                  <div className="absolute -top-3 -right-3 w-12 h-12 bg-amber-500/5 rounded-full" />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-amber-100 text-amber-800">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider block">
                          Uang Muka / DP (50%)
                        </span>
                        <span className="text-[10px] text-amber-700/90 font-medium">
                          Syarat masuk antrean produksi pabrik
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-amber-200/50 flex items-center justify-between">
                    <span className="text-xs font-extrabold text-amber-900">
                      Wajib Bayar Sekarang
                    </span>
                    <span className="font-mono text-lg font-black text-amber-800 tracking-tight">
                      {formatIDR(dpAmount)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Submission Action */}
            <div className="mt-5 pt-4 border-t border-stone-200">
              <button
                type="submit"
                disabled={isSubmitting || isUploading}
                className="w-full py-3 px-4 rounded-xl bg-brand hover:bg-brand-dark active:bg-brand-dark text-white font-bold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memproses Pesanan...</span>
                  </>
                ) : (
                  <>
                    <span>Konfirmasi & Buat Pesanan</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-500 mt-2.5 text-center">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Pesanan resmi langsung terhubung ke sales & gudang pabrik</span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
