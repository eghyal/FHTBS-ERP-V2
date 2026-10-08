import React, { useState, useMemo } from "react";
import { X, Plus, Minus, ShoppingBag, ShieldCheck, Truck, ArrowRight, ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import { ShopProduct } from "@/types/shop";
import { formatIDR } from "@/lib/utils";

interface ProductDetailModalProps {
  product: ShopProduct | null;
  onClose: () => void;
  onAddToCart: (product: ShopProduct, qty: number) => void;
  onInstantBuy: (product: ShopProduct, qty: number) => void;
  onOpenContactSales?: (product: ShopProduct) => void;
}

export function ProductDetailModal({
  product,
  onClose,
  onAddToCart,
  onInstantBuy,
  onOpenContactSales,
}: ProductDetailModalProps) {
  const [qty, setQty] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const allImages = useMemo(() => {
    if (!product) return [];
    const list: string[] = [];
    if (product.image_url && product.image_url.trim()) {
      list.push(product.image_url.trim());
    }
    const rawGallery = Array.isArray(product.gallery_urls)
      ? product.gallery_urls
      : typeof product.shop_gallery_urls === "string"
      ? (() => {
          try {
            return JSON.parse(product.shop_gallery_urls);
          } catch {
            return [];
          }
        })()
      : Array.isArray(product.shop_gallery_urls)
      ? product.shop_gallery_urls
      : [];

    if (Array.isArray(rawGallery)) {
      rawGallery.forEach((u) => {
        if (u && typeof u === "string" && u.trim() && !list.includes(u.trim())) {
          list.push(u.trim());
        }
      });
    }

    return list.length > 0
      ? list
      : ["https://images.unsplash.com/photo-1584463623578-3062b88137f4?w=800&auto=format&fit=crop&q=80"];
  }, [product]);

  if (!product) return null;

  const currentImage = allImages[selectedImageIndex] || allImages[0];
  const hasDiscount = product.promo_price > 0 && product.promo_price < product.unit_price;
  const unitPrice = hasDiscount ? product.promo_price : product.unit_price;
  const isB2B =
    product.availability_type === "MAKE_TO_ORDER" ||
    (product.availability_type === "AUTO" && unitPrice <= 0);
  const totalPrice = unitPrice * qty;
  const totalWeight = (product.weight_kg || 2.5) * qty;

  const handleIncrement = () => setQty((prev) => prev + 1);
  const handleDecrement = () => setQty((prev) => (prev > 1 ? prev - 1 : 1));

  const handleNextImage = () => {
    setSelectedImageIndex((prev) => (prev + 1) % allImages.length);
  };

  const handlePrevImage = () => {
    setSelectedImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
  };

  const handleAdd = () => {
    onAddToCart(product, Math.max(1, qty));
    onClose();
  };

  const handleBuyNow = () => {
    onInstantBuy(product, Math.max(1, qty));
    onClose();
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
        className="relative bg-white rounded-2xl sm:rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-stone-200 flex flex-col z-10 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 z-30 p-1.5 text-stone-400 hover:text-stone-700 bg-white/90 hover:bg-stone-100 rounded-xl backdrop-blur-xs border border-stone-200/60 transition-colors cursor-pointer shadow-xs"
          aria-label="Tutup detail produk"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-12 min-h-full">
          {/* Left Column: Product Image Carousel & Thumbnails (5 cols) */}
          <div className="md:col-span-5 bg-stone-50 p-4 sm:p-5 flex flex-col justify-between border-b md:border-b-0 md:border-r border-stone-100">
            <div className="space-y-3">
              {/* Primary Image Viewer */}
              <div className="relative aspect-4/3 sm:aspect-square w-full rounded-2xl bg-stone-100 overflow-hidden border border-stone-200/80 shadow-xs flex items-center justify-center group">
                <img
                  src={currentImage}
                  alt={`${product.name} - foto ${selectedImageIndex + 1}`}
                  className="w-full h-full object-cover transition-all duration-300"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (!target.src.includes("1584463623578")) {
                      target.src = "https://images.unsplash.com/photo-1584463623578-3062b88137f4?w=800&auto=format&fit=crop&q=80";
                    }
                  }}
                />

                {/* Badge Overlay */}
                {product.badge && (
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-white/95 text-brand border border-rose-200 backdrop-blur-xs shadow-xs z-10">
                    {product.badge}
                  </span>
                )}

                {/* Photo Counter Pill */}
                {allImages.length > 1 && (
                  <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md text-[10px] font-bold bg-stone-900/80 text-white backdrop-blur-xs shadow-xs z-10">
                    {selectedImageIndex + 1} / {allImages.length}
                  </span>
                )}

                {/* Carousel Navigation Arrows */}
                {allImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrevImage();
                      }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-stone-800 shadow-md border border-stone-200 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                      aria-label="Foto sebelumnya"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNextImage();
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-stone-800 shadow-md border border-stone-200 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                      aria-label="Foto berikutnya"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {/* Multi-Photo Thumbnails Strip (if > 1 image) */}
              {allImages.length > 1 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                    <ImageIcon className="w-3 h-3 text-stone-400" />
                    <span>Galeri Foto ({allImages.length} Refrensi)</span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                    {allImages.map((imgUrl, idx) => (
                      <button
                        key={`${imgUrl}-${idx}`}
                        type="button"
                        onClick={() => setSelectedImageIndex(idx)}
                        className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                          selectedImageIndex === idx
                            ? "border-brand ring-2 ring-brand/20 scale-95 shadow-sm"
                            : "border-stone-200 hover:border-stone-400 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <img
                          src={imgUrl}
                          alt={`Thumbnail ${idx + 1}`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quality Note */}
            <div className="mt-4 pt-3 border-t border-stone-200/60 hidden md:flex items-center gap-2 text-[11px] text-stone-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Foto asli produksi dan fasilitas pabrik CV Batu Emas</span>
            </div>
          </div>

          {/* Right Column: Details & Order Controls (7 cols) */}
          <div className="md:col-span-7 p-5 sm:p-7 flex flex-col justify-between">
            <div>
              {/* Category & Item Code */}
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-stone-100 text-stone-700">
                  {product.category}
                </span>
                <span className="text-[11px] font-mono text-stone-400 font-bold">
                  {product.item_code}
                </span>
              </div>

              {/* Title */}
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight leading-snug">
                {product.name}
              </h2>

              {/* Price Banner */}
              <div className="mt-3.5 p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 flex items-baseline justify-between">
                <div>
                  {!isB2B && unitPrice > 0 ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl sm:text-3xl font-black text-stone-900 font-mono tracking-tight">
                        {formatIDR(unitPrice)}
                      </span>
                      <span className="text-xs font-bold text-stone-500">
                        / {product.uom}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl sm:text-2xl font-black text-amber-900 font-sans tracking-tight">
                          Made to Order
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                          Pesan Khusus
                        </span>
                      </div>
                      <span className="text-[11px] text-stone-500 font-medium">
                        Produksi khusus pabrik. Hubungi Tim Sales untuk penawaran harga &amp; spesifikasi proyek
                      </span>
                    </div>
                  )}
                  {hasDiscount && !isB2B && unitPrice > 0 && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-mono text-stone-400 line-through">
                        {formatIDR(product.unit_price)}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        Hemat {Math.round(((product.unit_price - product.promo_price) / product.unit_price) * 100)}%
                      </span>
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                    Berat Satuan
                  </span>
                  <span className="text-xs font-mono font-bold text-stone-700">
                    {product.weight_kg || 2.5} kg / {product.uom}
                  </span>
                </div>
              </div>

              {/* Specifications */}
              <div className="mt-4 space-y-2 text-xs">
                {product.dimension && (
                  <div className="flex justify-between py-1 border-b border-stone-100">
                    <span className="text-stone-500 font-medium">Dimensi / Ukuran</span>
                    <span className="font-bold text-stone-800">{product.dimension}</span>
                  </div>
                )}
                {product.spec && (
                  <div className="flex justify-between py-1 border-b border-stone-100">
                    <span className="text-stone-500 font-medium">Spesifikasi</span>
                    <span className="font-bold text-stone-800">{product.spec}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-stone-100">
                  <span className="text-stone-500 font-medium">Status Ketersediaan</span>
                  <span
                    className={`font-bold ${
                      isB2B
                        ? "text-amber-800"
                        : product.available_qty > 0
                        ? "text-emerald-700"
                        : "text-amber-800"
                    }`}
                  >
                    {isB2B
                      ? "Produksi Cepat Pabrik"
                      : product.available_qty > 0
                      ? "Ready Stock"
                      : "Back in Stock"}
                  </span>
                </div>
              </div>

              {/* Description */}
              {product.description && (
                <div className="mt-3.5">
                  <p className="text-xs text-stone-600 leading-relaxed font-medium">
                    {product.description}
                  </p>
                </div>
              )}
            </div>

            {/* Stepper & Action Controls */}
            <div className="mt-6 pt-4 border-t border-stone-200/80">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="w-52 flex items-center justify-between border border-stone-300 rounded-xl overflow-hidden bg-stone-50 focus-within:ring-2 focus-within:ring-brand/20 focus-within:border-brand transition-all">
                  <button
                    onClick={handleDecrement}
                    className="p-3 text-stone-600 hover:bg-stone-200 transition-colors cursor-pointer shrink-0"
                    aria-label="Kurangi jumlah"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="text"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    value={qty === 0 ? "" : qty}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9]/g, "");
                      if (clean === "") {
                        setQty(0);
                      } else {
                        const parsed = parseInt(clean, 10);
                        setQty(isNaN(parsed) ? 1 : Math.max(1, parsed));
                      }
                    }}
                    onBlur={() => {
                      if (qty <= 0) setQty(1);
                    }}
                    className="w-full text-center font-bold text-sm text-stone-900 font-mono bg-transparent border-none outline-none focus:ring-0 focus:outline-hidden py-1 cursor-text pointer-events-auto select-all"
                  />
                  <button
                    onClick={handleIncrement}
                    className="p-3 text-stone-600 hover:bg-stone-200 transition-colors cursor-pointer shrink-0"
                    aria-label="Tambah jumlah"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                    {isB2B ? "Kuantitas Proyek" : `Total (${totalWeight.toLocaleString()} kg)`}
                  </span>
                  <span className={`text-lg sm:text-xl font-black font-mono ${isB2B ? "text-amber-900 font-sans" : "text-stone-900"}`}>
                    {isB2B ? "Made to Order" : formatIDR(totalPrice)}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              {isB2B ? (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenContactSales) {
                      onOpenContactSales(product);
                    } else {
                      handleAdd();
                    }
                  }}
                  className="w-full py-3 px-3.5 rounded-xl bg-amber-800 hover:bg-amber-900 active:bg-amber-950 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer active:scale-98"
                >
                  <ShoppingBag className="w-4 h-4 text-amber-200" />
                  <span>Minta Penawaran / Hubungi Kontak Sales</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={handleAdd}
                    className="py-3 px-3.5 rounded-xl border border-stone-300 hover:border-stone-400 hover:bg-stone-50 text-stone-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-98 shadow-xs"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-stone-600" />
                    <span>Tambah Keranjang</span>
                  </button>

                  <button
                    onClick={handleBuyNow}
                    className="py-3 px-3.5 rounded-xl bg-brand hover:bg-brand-dark active:bg-brand-dark text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-98"
                  >
                    <span>Beli Sekarang</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Assurance strip */}
              <div className="mt-3.5 pt-2.5 flex items-center justify-between text-[11px] text-stone-500 border-t border-stone-100">
                <span className="flex items-center gap-1 font-medium">
                  <Truck className="w-3.5 h-3.5 text-stone-400" />
                  Kirim armada / ambil di pabrik
                </span>
                <span className="flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Standar Mutu SNI
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
