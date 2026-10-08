import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, Search, Truck, ArrowLeft, X, User, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShopHeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  cartItemCount: number;
  onOpenCart: () => void;
  onOpenTracking: () => void;
  customer?: any | null;
  onOpenAuth?: () => void;
  onLogoutCustomer?: () => void;
}

export function ShopHeader({
  searchQuery,
  onSearchChange,
  cartItemCount,
  onOpenCart,
  onOpenTracking,
  customer,
  onOpenAuth,
  onLogoutCustomer,
}: ShopHeaderProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200">
      {/* Main Navbar Row */}
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2.5 sm:gap-4">
        {/* Brand & Prominent Back Button (Always visible on mobile & desktop) */}
        <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 py-2 px-2.5 sm:px-3 rounded-xl bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-800 font-bold text-xs border border-stone-200/80 transition-all touch-manipulation cursor-pointer shrink-0 shadow-2xs"
            title="Kembali ke Halaman Sebelumnya atau Beranda"
            aria-label="Tombol Kembali"
          >
            <ArrowLeft className="w-4 h-4 text-stone-700" />
            <span className="text-xs font-bold">Kembali</span>
          </button>

          <Link to="/shop" className="flex items-center gap-2 group">
            <img
              src="/logo.png"
              alt="Logo Paving Joss"
              className="h-8 sm:h-9 w-auto object-contain transition-transform group-hover:scale-105"
            />
            <span className="text-sm sm:text-xl font-black text-stone-900 tracking-tight">
              Toko Pabrik
            </span>
          </Link>
        </div>

        {/* Global Product Search (Desktop and Tablet Row) */}
        <div className="hidden md:flex flex-1 max-w-xl mx-4 lg:mx-6">
          <div
            className={cn(
              "w-full relative flex items-center bg-stone-100/90 rounded-2xl border transition-all duration-200",
              isSearchFocused
                ? "bg-white border-stone-800 shadow-sm ring-2 ring-stone-900/5"
                : "border-stone-200 hover:border-stone-300"
            )}
          >
            <Search className="w-4 h-4 text-stone-400 ml-3.5 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="Cari paving block, kanstin, saluran drainase, batako..."
              className="w-full bg-transparent py-2.5 px-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-hidden"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="p-1 mr-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-200/60"
                aria-label="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Actions: Track, Customer Auth & Cart */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Lacak Pesanan (Touch friendly on mobile & desktop) */}
          <button
            onClick={onOpenTracking}
            className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl text-xs font-bold text-stone-700 hover:text-stone-900 hover:bg-stone-100 border border-stone-200/90 transition-all touch-manipulation cursor-pointer"
            title="Lacak Status Pesanan"
            aria-label="Lacak Pesanan"
          >
            <Truck className="w-4 h-4 text-stone-600" />
            <span className="hidden lg:inline">Lacak</span>
          </button>

          {/* Customer Authentication Chip / Button */}
          {customer ? (
            <div className="flex items-center gap-1.5 p-1 bg-stone-100/90 border border-stone-200 rounded-xl">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden bg-stone-200 shrink-0 border border-white">
                <img
                  src={
                    customer.avatar_url ||
                    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                      customer.customer_name || "C"
                    )}`
                  }
                  alt={customer.customer_name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="hidden lg:block text-left px-1 min-w-0 max-w-[120px]">
                <div className="text-[11px] font-bold text-stone-900 truncate">
                  {customer.customer_name}
                </div>
                <div className="text-[9px] text-stone-400 truncate">
                  {customer.company || "Pelanggan"}
                </div>
              </div>
              {onLogoutCustomer && (
                <button
                  onClick={onLogoutCustomer}
                  title="Keluar Akun"
                  aria-label="Keluar Akun"
                  className="p-1 sm:p-1.5 text-stone-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            onOpenAuth && (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl text-xs font-bold text-stone-700 hover:text-stone-900 hover:bg-stone-100 border border-stone-200/90 transition-all touch-manipulation cursor-pointer"
                title="Masuk Akun Pembeli"
                aria-label="Masuk Akun"
              >
                <User className="w-4 h-4 text-stone-600" />
                <span className="hidden sm:inline">Masuk</span>
              </button>
            )
          )}

          {/* Cart Button */}
          <button
            onClick={onOpenCart}
            className="relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-stone-900 hover:bg-brand text-white font-bold text-xs sm:text-sm shadow-sm hover:shadow-md transition-all active:scale-95 touch-manipulation cursor-pointer"
            aria-label="Lihat Keranjang Belanja"
            title="Keranjang Belanja"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Keranjang</span>
            {cartItemCount > 0 && (
              <span className="bg-brand text-white text-[10px] sm:text-[11px] font-black px-1.5 sm:px-2 py-0.5 rounded-full min-w-[18px] sm:min-w-[20px] text-center leading-tight">
                {cartItemCount > 99 ? "99+" : cartItemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Dedicated Mobile Search Row (Clean, unclipped, easy thumb input on < md screens) */}
      <div className="md:hidden px-3 pb-2.5 pt-0 bg-white">
        <div
          className={cn(
            "relative flex items-center bg-stone-100/90 rounded-xl border transition-all duration-200",
            isSearchFocused
              ? "bg-white border-stone-800 shadow-xs ring-2 ring-stone-900/5"
              : "border-stone-200 hover:border-stone-300"
          )}
        >
          <Search className="w-4 h-4 text-stone-400 ml-3 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder="Cari paving block, kanstin, batako..."
            className="w-full bg-transparent py-2 px-2.5 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-hidden"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="p-1 mr-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-200/60"
              aria-label="Hapus pencarian"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
