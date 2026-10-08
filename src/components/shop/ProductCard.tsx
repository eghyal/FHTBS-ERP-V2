import React, { useState } from "react";
import { Plus, Check, Eye, Lock } from "lucide-react";
import { ShopProduct } from "@/types/shop";
import { formatIDR } from "@/lib/utils";

interface ProductCardProps {
  product: ShopProduct;
  onAddToCart: (product: ShopProduct, qty: number) => void;
  onViewDetail: (product: ShopProduct) => void;
  onContactSales?: (product: ShopProduct) => void;
  isAuthenticated?: boolean;
}

export function ProductCard({
  product,
  onAddToCart,
  onViewDetail,
  onContactSales,
  isAuthenticated = false,
}: ProductCardProps) {
  const [isAdded, setIsAdded] = useState(false);

  const hasDiscount = product.promo_price > 0 && product.promo_price < product.unit_price;
  const displayPrice = hasDiscount ? product.promo_price : product.unit_price;
  const isB2B =
    product.availability_type === "MAKE_TO_ORDER" ||
    (product.availability_type === "AUTO" && displayPrice <= 0);

  const photoCount = React.useMemo(() => {
    let count = product.image_url ? 1 : 0;
    if (Array.isArray(product.gallery_urls)) {
      count = Math.max(count, product.gallery_urls.length);
    } else if (typeof product.shop_gallery_urls === "string") {
      try {
        const parsed = JSON.parse(product.shop_gallery_urls);
        if (Array.isArray(parsed)) count = Math.max(count, parsed.length);
      } catch {}
    }
    return count;
  }, [product]);

  const handleCardClick = () => {
    onViewDetail(product);
  };

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isB2B) {
      if (onContactSales) {
        onContactSales(product);
      } else {
        onViewDetail(product);
      }
      return;
    }
    onAddToCart(product, product.moq || 1);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1400);
  };

  return (
    <div
      onClick={() => onViewDetail(product)}
      className="group bg-white rounded-2xl border border-stone-200 hover:border-stone-400/80 shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden cursor-pointer relative"
    >
      {/* Top Image Container */}
      <div className="relative aspect-4/3 w-full bg-stone-100 overflow-hidden">
        <img
          src={product.image_url}
          alt={product.name}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          referrerPolicy="no-referrer"
        />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          {product.badge && (
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-stone-900/90 text-white backdrop-blur-xs shadow-xs">
              {product.badge}
            </span>
          )}
          {hasDiscount && (
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-brand text-white shadow-xs">
              Hemat {Math.round(((product.unit_price - product.promo_price) / product.unit_price) * 100)}%
            </span>
          )}
        </div>

        {/* Photo Count Indicator */}
        {photoCount > 1 && (
          <div className="absolute top-3 right-3 z-10">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-stone-900/80 text-white backdrop-blur-xs shadow-xs flex items-center gap-1">
              <span>{photoCount} Foto</span>
            </span>
          </div>
        )}

        {/* Category Tag on Image */}
        <div className="absolute bottom-3 left-3 z-10">
          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/95 text-stone-800 backdrop-blur-xs shadow-xs">
            {product.category}
          </span>
        </div>

        {/* Hover Quick View Button */}
        <div className="absolute inset-0 bg-stone-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="px-3.5 py-2 rounded-xl bg-white text-stone-900 text-xs font-bold shadow-md flex items-center gap-2 transform translate-y-2 group-hover:translate-y-0 transition-transform">
            <Eye className="w-4 h-4 text-stone-700" />
            <span>Lihat Spesifikasi</span>
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1">
            {product.item_code}
          </div>
          <h3 className="text-sm sm:text-base font-bold text-stone-900 group-hover:text-brand transition-colors line-clamp-2 leading-snug">
            {product.name}
          </h3>

          {product.dimension && (
            <p className="text-xs text-stone-500 mt-1.5 line-clamp-1">
              Ukuran: <span className="font-medium text-stone-700">{product.dimension}</span>
            </p>
          )}
        </div>

        {/* Price & Action Section */}
        <div className="pt-3 border-t border-stone-100 mt-auto">
          <div className="flex items-baseline justify-between gap-2 mb-2.5">
            <div>
              {isB2B ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-amber-900 bg-amber-100/80 border border-amber-300 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    Made to Order
                  </span>
                  <span className="text-[10px] font-semibold text-stone-500">
                    ({product.uom})
                  </span>
                </div>
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base sm:text-lg font-black text-stone-900 font-mono">
                    {formatIDR(displayPrice)}
                  </span>
                  <span className="text-[11px] font-semibold text-stone-500">
                    /{product.uom}
                  </span>
                </div>
              )}
              {hasDiscount && !isB2B && (
                <div className="text-[11px] text-stone-400 line-through font-mono">
                  {formatIDR(product.unit_price)}
                </div>
              )}
            </div>

            {/* Stock / Mode indicator - No numerical stock quantities displayed */}
            <div className="text-right">
              {isB2B ? (
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                  Fabrikasi Pabrik
                </span>
              ) : product.available_qty > 0 ? (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                  Ready Stock
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                  Back in Stock
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleQuickAdd}
            className={`w-full py-3 sm:py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation ${
              isAdded
                ? "bg-emerald-600 text-white shadow-xs"
                : isB2B
                ? "bg-amber-800 hover:bg-amber-900 text-white shadow-xs active:scale-95"
                : "bg-stone-900 hover:bg-brand text-white shadow-xs active:scale-95"
            }`}
          >
            {isAdded ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Dimasukkan ke Keranjang</span>
              </>
            ) : isB2B ? (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Minta Penawaran / Kontak Sales</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah ke Keranjang</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
