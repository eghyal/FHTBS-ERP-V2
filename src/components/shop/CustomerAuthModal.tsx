import React, { useState } from "react";
import {
  X,
  User,
  Phone,
  Mail,
  Building2,
  ShieldCheck,
  Loader2,
  ArrowRight,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { ShopProduct } from "@/types/shop";
import { formatIDR } from "@/lib/utils";
import { getVisitorSessionId } from "@/lib/tracker";
import { isCorporateBusinessEmail } from "@/lib/scoutIntelligence";

export interface PendingAuthAction {
  product: ShopProduct;
  qty: number;
  isInstantBuy?: boolean;
  actionType?: "VIEW_DETAIL" | "ADD_CART" | "INSTANT_BUY";
}

interface CustomerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingProduct?: PendingAuthAction | null;
  onSuccess: (customer: any) => void;
}

export function CustomerAuthModal({
  isOpen,
  onClose,
  pendingProduct,
  onSuccess,
}: CustomerAuthModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Fields (All 4 are strictly mandatory for B2B procurement & lead scoring)
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [consentTerms, setConsentTerms] = useState(true);
  const [consentProfiling, setConsentProfiling] = useState(true);

  if (!isOpen) return null;

  const isViewDetailAction = pendingProduct?.actionType === "VIEW_DETAIL";
  const { isCorporate: isCorporateEmail, domain: emailDomain } = isCorporateBusinessEmail(email);

  // 1-Click Native Google Sign-In via Firebase Auth
  const handleGoogleOneClick = async () => {
    if (!isFirebaseConfigured) {
      setErrorMsg("Login Google belum dikonfigurasi. Silakan gunakan formulir manual.");
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const derivedName =
        user.displayName || user.email?.split("@")[0] || "Customer";

      const payload = {
        customer_name: derivedName,
        email: user.email || null,
        phone: user.phoneNumber || null,
        company: null,
        auth_provider: "GOOGLE",
        session_id: getVisitorSessionId(),
        consents: {
          terms: consentTerms,
          marketing: true,
          profiling: consentProfiling,
        },
        avatar_url:
          user.photoURL ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
            derivedName
          )}&backgroundColor=b02524,1c1917,047857`,
        cart_items: pendingProduct
          ? [
              {
                product: pendingProduct.product,
                qty: pendingProduct.qty,
              },
            ]
          : [],
      };

      const res = await fetch("/api/shop/customer-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Gagal menyimpan akun Google.");
      }

      localStorage.setItem(
        "shop_customer_session_v1",
        JSON.stringify(json.data)
      );
      window.dispatchEvent(new Event("shop_customer_auth_changed"));
      onSuccess(json.data);
      onClose();
    } catch (err: any) {
      console.warn("Google One-Click sign-in note:", err);
      if (
        err.code === "auth/popup-closed-by-user" ||
        err.code === "auth/cancelled-popup-request"
      ) {
        return;
      }
      if (err.code === "auth/popup-blocked") {
        setErrorMsg(
          "Jendela login Google diblokir browser. Silakan izinkan pop-up atau isi formulir identitas bisnis di bawah."
        );
        return;
      }
      setErrorMsg(err.message || "Gagal masuk dengan akun Google.");
    } finally {
      setLoading(false);
    }
  };

  // Form Submit with Strict Validation for all required B2B fields
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanName = fullName.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim();
    const cleanCompany = company.trim();

    if (!cleanName) {
      setErrorMsg("Nama lengkap pemesan / PIC wajib diisi.");
      return;
    }
    if (!cleanPhone) {
      setErrorMsg("Nomor WhatsApp aktif wajib diisi.");
      return;
    }
    if (!cleanEmail) {
      setErrorMsg("Email bisnis / perusahaan wajib diisi.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg("Format email tidak valid (contoh: nama@perusahaan.com).");
      return;
    }
    if (!cleanCompany || cleanCompany.length < 2) {
      setErrorMsg("Nama perusahaan / instansi / proyek wajib diisi.");
      return;
    }
    if (!consentTerms) {
      setErrorMsg("Harap setujui syarat layanan dan kebijakan privasi.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        customer_name: cleanName,
        phone: cleanPhone,
        email: cleanEmail,
        company: cleanCompany,
        auth_provider: "FORM",
        session_id: getVisitorSessionId(),
        consents: {
          terms: consentTerms,
          marketing: true,
          profiling: consentProfiling,
        },
        avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          cleanName
        )}&backgroundColor=1c1917,b02524,2563eb`,
        cart_items: pendingProduct
          ? [
              {
                product: pendingProduct.product,
                qty: pendingProduct.qty,
              },
            ]
          : [],
      };

      const res = await fetch("/api/shop/customer-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Gagal memproses data identitas pemesan.");
      }

      localStorage.setItem(
        "shop_customer_session_v1",
        JSON.stringify(json.data)
      );
      window.dispatchEvent(new Event("shop_customer_auth_changed"));
      onSuccess(json.data);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memproses data pemesan.");
    } finally {
      setLoading(false);
    }
  };

  const productPrice = pendingProduct
    ? (pendingProduct.product.promo_price > 0
        ? pendingProduct.product.promo_price
        : pendingProduct.product.unit_price) * pendingProduct.qty
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div
        className="relative w-full max-w-md my-auto bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden text-stone-900 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Ribbon */}
        <div className="h-1.5 bg-gradient-to-r from-brand via-rose-600 to-amber-500" />

        <div className="p-5 sm:p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-stone-900 tracking-tight">
                {isViewDetailAction
                  ? "Sign-In untuk Melihat Detail"
                  : pendingProduct
                  ? "Lengkapi Kontak & Identitas Bisnis"
                  : "Masuk Akun Pelanggan"}
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                {isViewDetailAction
                  ? "Masuk dengan Google atau verifikasi kontak bisnis untuk membuka spesifikasi teknis dan detail lengkap produk."
                  : pendingProduct
                  ? "Dapatkan penawaran harga pabrik resmi, PPN, dan estimasi tonase pengiriman."
                  : "Akses riwayat pesanan, lacak pengiriman, dan katalog khusus."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-stone-400 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Pending Product Context (If Any) */}
          {pendingProduct && (
            <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={
                    pendingProduct.product.image_url ||
                    "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=800&auto=format&fit=crop&q=80"
                  }
                  alt={pendingProduct.product.name}
                  className="w-10 h-10 rounded-lg object-cover border border-stone-200 shrink-0 bg-white"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-stone-900 truncate">
                    {pendingProduct.product.name}
                  </p>
                  <p className="text-[10px] text-stone-500">
                    {isViewDetailAction
                      ? `Kategori: ${pendingProduct.product.category}`
                      : `${pendingProduct.qty} ${pendingProduct.product.uom}`}
                  </p>
                </div>
              </div>
              <span className="text-xs font-black text-stone-900 font-mono whitespace-nowrap shrink-0">
                {isViewDetailAction
                  ? formatIDR(
                      pendingProduct.product.promo_price > 0
                        ? pendingProduct.product.promo_price
                        : pendingProduct.product.unit_price
                    ) + `/${pendingProduct.product.uom}`
                  : formatIDR(productPrice)}
              </span>
            </div>
          )}

          {/* 1-Click Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleOneClick}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl border border-stone-300 hover:bg-stone-50 hover:border-stone-400 active:bg-stone-100 text-stone-700 font-semibold text-xs flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Lanjutkan dengan Google</span>
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-stone-200 w-full" />
            <span className="bg-white px-2 text-[10px] uppercase font-bold tracking-wider text-stone-400 absolute">
              Atau Isi Formulir Bisnis
            </span>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-700">
              {errorMsg}
            </div>
          )}

          {/* Mandatory Business Form */}
          <form onSubmit={handleFormSubmit} className="space-y-3">
            {/* Nama Lengkap */}
            <div>
              <label className="text-[11px] font-semibold text-stone-700 block mb-1">
                Nama Lengkap / PIC Proyek <span className="text-brand">*</span>
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nama Anda atau PIC Purchasing"
                  className="w-full pl-8.5 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 focus:bg-white focus:border-stone-900 focus:outline-hidden font-medium placeholder:text-stone-400"
                />
              </div>
            </div>

            {/* WhatsApp Phone */}
            <div>
              <label className="text-[11px] font-semibold text-stone-700 block mb-1">
                Nomor WhatsApp Aktif <span className="text-brand">*</span>
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08xxxxxxxxxx"
                  className="w-full pl-8.5 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 focus:bg-white focus:border-stone-900 focus:outline-hidden font-medium font-mono placeholder:text-stone-400"
                />
              </div>
            </div>

            {/* Email Bisnis & Perusahaan (Wajib) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-stone-700">
                    Email Bisnis <span className="text-brand">*</span>
                  </label>
                  {isCorporateEmail && (
                    <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> B2B Verified
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@perusahaan.com"
                    className="w-full pl-8 pr-2.5 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 focus:bg-white focus:border-stone-900 focus:outline-hidden font-medium placeholder:text-stone-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-stone-700 block mb-1">
                  Nama Perusahaan / Instansi <span className="text-brand">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    required
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="PT / CV / Dinas / Proyek"
                    className="w-full pl-8 pr-2.5 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 focus:bg-white focus:border-stone-900 focus:outline-hidden font-medium placeholder:text-stone-400"
                  />
                </div>
              </div>
            </div>

            {/* PDP Consent Checkboxes */}
            <div className="pt-1.5 space-y-2 border-t border-stone-100 mt-2">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consentTerms}
                  onChange={(e) => setConsentTerms(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 rounded text-brand border-stone-300 focus:ring-0 cursor-pointer"
                />
                <span className="text-[10.5px] text-stone-600 leading-tight">
                  Saya menyetujui Ketentuan Layanan & Kebijakan Privasi (UU PDP No. 27/2022). <span className="text-red-500">*</span>
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consentProfiling}
                  onChange={(e) => setConsentProfiling(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 rounded text-brand border-stone-300 focus:ring-0 cursor-pointer"
                />
                <span className="text-[10.5px] text-stone-500 leading-tight">
                  Dapatkan penawaran harga khusus proyek, kalkulasi estimasi kebutuhan material, dan rekomendasi teknis produk berstandar SNI.
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-3 py-2.5 px-4 rounded-xl bg-brand hover:bg-brand-dark active:bg-brand-dark text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Memproses Data...</span>
                </>
              ) : (
                <>
                  <span>Simpan & Lanjutkan</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Privacy Note */}
          <div className="pt-2 text-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-400">
              <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
              <span>Data aman & dilindungi UU PDP No. 27/2022</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
