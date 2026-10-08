import React, { useState, useEffect } from "react";
import {
  X,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShoppingBag,
  Truck,
  Tag,
  ChevronLeft,
  ChevronRight,
  Award,
  Percent,
} from "lucide-react";
import { CartItem, ShopProduct } from "@/types/shop";
import { formatIDR } from "@/lib/utils";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  subtotal: number;
  totalWeightKg: number;
  onUpdateQty: (productId: string, qty: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onProceedCheckout: () => void;
  promoProducts?: ShopProduct[];
  onAddPromoItem?: (product: ShopProduct) => void;
}

interface CartItemStepperProps {
  productId: string;
  qty: number;
  onUpdateQty: (productId: string, qty: number) => void;
}

function CartItemStepper({ productId, qty, onUpdateQty }: CartItemStepperProps) {
  const [localVal, setLocalVal] = useState<string>(String(qty));

  useEffect(() => {
    setLocalVal(String(qty));
  }, [qty]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = e.target.value.replace(/[^0-9]/g, "");
    setLocalVal(clean);
    if (clean !== "") {
      const parsed = parseInt(clean, 10);
      if (parsed > 0) {
        onUpdateQty(productId, parsed);
      }
    }
  };

  const handleBlur = () => {
    if (localVal === "" || parseInt(localVal, 10) <= 0) {
      setLocalVal(String(qty));
    }
  };

  const handleDec = () => {
    if (qty > 1) {
      onUpdateQty(productId, qty - 1);
    }
  };

  const handleInc = () => {
    onUpdateQty(productId, qty + 1);
  };

  return (
    <div className="w-40 flex items-center justify-between border border-stone-200 rounded-lg bg-stone-50 overflow-hidden shrink-0 focus-within:ring-2 focus-within:ring-brand/20 focus-within:border-brand transition-all">
      <button
        onClick={handleDec}
        className="p-2 text-stone-600 hover:bg-stone-200 transition-colors cursor-pointer shrink-0"
        aria-label="Kurangi jumlah"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="text"
        pattern="[0-9]*"
        inputMode="numeric"
        value={localVal}
        onChange={handleInputChange}
        onBlur={handleBlur}
        className="w-full text-center font-bold text-xs text-stone-900 font-mono bg-transparent border-none outline-none focus:ring-0 focus:outline-hidden py-1 cursor-text pointer-events-auto select-all"
      />
      <button
        onClick={handleInc}
        className="p-2 text-stone-600 hover:bg-stone-200 transition-colors cursor-pointer shrink-0"
        aria-label="Tambah jumlah"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function CartDrawer({
  isOpen,
  onClose,
  items,
  subtotal,
  totalWeightKg,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onProceedCheckout,
  promoProducts = [],
  onAddPromoItem,
}: CartDrawerProps) {
  // State for top promo board banner carousel
  const [activePromoIndex, setActivePromoIndex] = useState(0);
  const [internalPromoItems, setInternalPromoItems] = useState<ShopProduct[]>([]);

  // Filter strictly for Retail Direct Sale (Ready Stock) items with valid positive price - Made to Order / B2B items cannot be advertised in cart
  const isEligibleForCartPromo = (p: ShopProduct) => {
    if (!p) return false;
    // Strictly exclude any Made to Order or unpriced items
    if (p.availability_type === "MAKE_TO_ORDER") {
      return false;
    }
    const regularPrice = Number(p.unit_price) || 0;
    if (regularPrice <= 0) {
      return false;
    }
    return true;
  };

  // If promoProducts is provided via props, use it; otherwise fetch fallback promo products
  useEffect(() => {
    if (promoProducts && promoProducts.length > 0) {
      const eligible = promoProducts.filter(isEligibleForCartPromo);
      setInternalPromoItems(eligible);
    } else {
      // Fetch discounted or featured products as fallback
      fetch("/api/shop/products")
        .then((res) => res.json())
        .then((json) => {
          if (json.success && Array.isArray(json.data)) {
            const eligible = json.data.filter(isEligibleForCartPromo);
            const discounted = eligible.filter(
              (p: ShopProduct) =>
                (p.promo_price > 0 && p.promo_price < p.unit_price) ||
                (p.badge && p.badge.trim() !== "") ||
                p.is_featured === 1
            );
            setInternalPromoItems(discounted.length > 0 ? discounted : eligible);
          }
        })
        .catch(() => {});
    }
  }, [promoProducts]);

  // Auto rotate promo billboard every 6 seconds
  useEffect(() => {
    if (internalPromoItems.length <= 1) return;
    const interval = setInterval(() => {
      setActivePromoIndex((prev) => (prev + 1) % internalPromoItems.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [internalPromoItems.length]);

  if (!isOpen) return null;

  const currentPromo = internalPromoItems[activePromoIndex] || null;

  const handlePrevPromo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (internalPromoItems.length === 0) return;
    setActivePromoIndex((prev) =>
      prev === 0 ? internalPromoItems.length - 1 : prev - 1
    );
  };

  const handleNextPromo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (internalPromoItems.length === 0) return;
    setActivePromoIndex((prev) => (prev + 1) % internalPromoItems.length);
  };

  const handleAddPromoToCart = (product: ShopProduct) => {
    if (onAddPromoItem) {
      onAddPromoItem(product);
    } else {
      // Fallback: update quantity if item already exists or add 1
      const existing = items.find((i) => i.product.id === product.id);
      if (existing) {
        onUpdateQty(product.id, existing.qty + 1);
      } else {
        onUpdateQty(product.id, 1);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden">
      {/* Soft Neutral Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Modern Window Modal Container */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-stone-200 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150 z-10">
        {/* Window Header */}
        <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-700 shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-stone-900 tracking-tight leading-none">
                Keranjang Belanja
              </h2>
              <span className="text-[11px] text-stone-500 mt-1 inline-block">
                Paving Joss &bull; CV Batu Emas Group
              </span>
            </div>
            <span className="ml-1 text-[11px] font-semibold bg-stone-100 text-stone-700 px-2.5 py-0.5 rounded-full">
              {items.length} Barang
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Tutup keranjang"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Papan Iklan Penawaran Spesial (Top Promotional Billboard) */}
        {currentPromo && (
          <div className="bg-gradient-to-r from-stone-50 via-rose-50/50 to-stone-50 border-b border-stone-200/90 p-3 sm:p-3.5 shrink-0">
            {/* Top Bar of Promo Billboard */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-brand">
                <Tag className="w-3 h-3 text-brand" />
                <span>Penawaran Spesial Pabrik</span>
                {currentPromo.badge && (
                  <span className="bg-white border border-rose-200 text-brand px-1.5 py-0.2 rounded font-semibold text-[9px] uppercase">
                    {currentPromo.badge}
                  </span>
                )}
              </div>

              {internalPromoItems.length > 1 && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-stone-400 font-mono mr-1">
                    {activePromoIndex + 1} / {internalPromoItems.length}
                  </span>
                  <button
                    onClick={handlePrevPromo}
                    className="p-1 rounded-lg bg-white border border-stone-200 text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
                    aria-label="Promo sebelumnya"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <button
                    onClick={handleNextPromo}
                    className="p-1 rounded-lg bg-white border border-stone-200 text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
                    aria-label="Promo berikutnya"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Promo Product Showcase Card */}
            <div className="bg-white rounded-xl border border-stone-200/80 p-2.5 sm:p-3 flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={currentPromo.image_url}
                  alt={currentPromo.name}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover border border-stone-200 bg-stone-50 shrink-0"
                />
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-stone-900 truncate">
                    {currentPromo.name}
                  </h4>
                  <p className="text-[10px] text-stone-500 truncate">
                    {currentPromo.dimension || currentPromo.spec || "Kualitas SNI Presisi"}
                  </p>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    {currentPromo.promo_price > 0 && currentPromo.promo_price < currentPromo.unit_price ? (
                      <>
                        <span className="text-xs font-mono font-black text-brand">
                          {formatIDR(currentPromo.promo_price)}
                        </span>
                        <span className="text-[10px] font-mono text-stone-400 line-through">
                          {formatIDR(currentPromo.unit_price)}
                        </span>
                        <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                          Hemat {Math.round(((currentPromo.unit_price - currentPromo.promo_price) / currentPromo.unit_price) * 100)}%
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-mono font-bold text-stone-900">
                        {formatIDR(currentPromo.unit_price)} / {currentPromo.uom}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleAddPromoToCart(currentPromo)}
                className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-dark text-white text-xs font-bold transition-all shadow-2xs flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah</span>
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 divide-y divide-stone-100 min-h-[160px]">
          {items.length === 0 ? (
            <div className="h-full py-10 flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mb-2.5 text-stone-400">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <p className="text-xs sm:text-sm font-bold text-stone-800 mb-1">
                Keranjang Belanja Masih Kosong
              </p>
              <p className="text-xs text-stone-400 max-w-sm mb-4 leading-relaxed">
                Pilih material paving block, kanstin, atau bata beton di katalog untuk memulai pemesanan.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Jelajahi Produk
              </button>
            </div>
          ) : (
            items.map(({ product, qty }) => {
              const hasDiscount =
                product.promo_price > 0 && product.promo_price < product.unit_price;
              const unitPrice = hasDiscount ? product.promo_price : product.unit_price;
              const lineTotal = unitPrice * qty;
              const lineWeight = (product.weight_kg || 2.5) * qty;

              return (
                <div
                  key={product.id}
                  className="py-3.5 first:pt-0 flex items-center justify-between gap-3 sm:gap-4"
                >
                  {/* Thumbnail & Product Details */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border border-stone-200 bg-stone-50 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs sm:text-sm font-bold text-stone-900 truncate">
                        {product.name}
                      </h4>
                      <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                        <span className="font-mono text-stone-400">{product.item_code}</span>
                        <span>&bull;</span>
                        <span>{lineWeight.toLocaleString()} kg</span>
                      </div>
                      <div className="text-[11px] text-stone-500 font-mono mt-0.5">
                        {formatIDR(unitPrice)} / {product.uom}
                      </div>
                    </div>
                  </div>

                  {/* Quantity Stepper & Line Total */}
                  <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    {/* Stepper */}
                    <CartItemStepper
                      productId={product.id}
                      qty={qty}
                      onUpdateQty={onUpdateQty}
                    />

                    {/* Line Total */}
                    <div className="text-right w-24 sm:w-28">
                      <span className="text-xs sm:text-sm font-mono font-bold text-stone-900 block">
                        {formatIDR(lineTotal)}
                      </span>
                    </div>

                    {/* Remove Action */}
                    <button
                      onClick={() => onRemoveItem(product.id)}
                      className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Hapus barang"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Window Footer & Checkout Action */}
        {items.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-stone-200 bg-stone-50/80 shrink-0 space-y-3">
            {/* Cargo Weight Summary */}
            <div className="flex items-center justify-between text-xs text-stone-600 py-1 border-b border-stone-200/60">
              <span className="flex items-center gap-1.5 font-medium">
                <Truck className="w-3.5 h-3.5 text-stone-500" />
                <span>Total Estimasi Berat Muatan</span>
              </span>
              <span className="font-mono font-bold text-stone-800">
                {totalWeightKg.toLocaleString()} kg ({Math.ceil(totalWeightKg / 1000)} Ton)
              </span>
            </div>

            {/* Subtotal Row */}
            <div className="flex items-baseline justify-between pt-1">
              <div>
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider block">
                  Total Nilai Barang
                </span>
                <span className="text-[11px] text-stone-400">
                  Belum termasuk biaya armada pengiriman ke lokasi
                </span>
              </div>
              <span className="text-xl sm:text-2xl font-black text-stone-900 font-mono">
                {formatIDR(subtotal)}
              </span>
            </div>

            {/* Checkout Action Button */}
            <button
              onClick={onProceedCheckout}
              className="w-full py-3 px-4 rounded-xl bg-brand hover:bg-brand-dark active:bg-brand-dark text-white font-bold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Lanjut ke Formulir Pemesanan</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Clear Cart Subtle Link */}
            <div className="text-center pt-0.5">
              <button
                onClick={onClearCart}
                className="text-[11px] font-semibold text-stone-400 hover:text-rose-600 transition-colors cursor-pointer"
              >
                Kosongkan Keranjang
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Named alias for backwards compatibility
export const CartModal = CartDrawer;
