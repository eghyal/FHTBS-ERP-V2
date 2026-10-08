import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { PublicFooter } from "@/components/layouts/PublicLayout";
import { ProductCard } from "@/components/shop/ProductCard";
import { ProductDetailModal } from "@/components/shop/ProductDetailModal";
import { CartDrawer } from "@/components/shop/CartDrawer";
import { CheckoutModal } from "@/components/shop/CheckoutModal";
import { OrderSuccessModal } from "@/components/shop/OrderSuccessModal";
import { OrderTrackingModal } from "@/components/shop/OrderTrackingModal";
import { CustomerAuthModal, PendingAuthAction } from "@/components/shop/CustomerAuthModal";
import { Modal } from "@/components/ui/Modal";
import { useShopCart } from "@/hooks/useShopCart";
import { ShopProduct } from "@/types/shop";
import { formatIDR } from "@/lib/utils";
import {
  ShieldCheck,
  Truck,
  Sparkles,
  Filter,
  ChevronDown,
  RefreshCw,
  Send,
  CheckCircle2,
  Phone,
  Mail,
  Building2,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  Copy,
  Check,
} from "lucide-react";
import { trackPageView, trackSearch, trackFilter, trackProductView, trackCartAdd, rotateVisitorSession } from "@/lib/tracker";

export default function Shop() {
  const navigate = useNavigate();

  const handleBackNavigation = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };
  const [copiedVoucher, setCopiedVoucher] = useState(false);
  // Customer authentication state
  const [customer, setCustomer] = useState<any | null>(() => {
    try {
      const raw = localStorage.getItem("shop_customer_session_v1");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const {
    items: cartItems,
    totalItems,
    subtotal,
    totalWeightKg,
    addToCart,
    updateQty,
    removeFromCart,
    clearCart,
  } = useShopCart(customer?.id);

  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("popular");
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAuthAction, setPendingAuthAction] = useState<PendingAuthAction | null>(null);

  // Modals state
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [lastPlacedOrder, setLastPlacedOrder] = useState<any>(null);
  const [trackingOrderNumber, setTrackingOrderNumber] = useState<string>("");

  // Contact Person Modal State
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [selectedProductForContact, setSelectedProductForContact] = useState<ShopProduct | null>(null);

  // Sync cart updates to server if customer is authenticated
  const syncCustomerCart = async (customerId: string, updatedItems: any[]) => {
    if (!customerId) return;
    try {
      await fetch("/api/shop/customer-cart-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          cart_items: updatedItems,
        }),
      });
    } catch (err) {
      console.warn("Background cart sync note:", err);
    }
  };

  useEffect(() => {
    if (customer?.id && cartItems.length >= 0) {
      syncCustomerCart(customer.id, cartItems);
    }
  }, [cartItems, customer?.id]);

  const fetchProducts = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== "ALL") {
        params.append("category", selectedCategory);
      }
      if (searchQuery.trim()) {
        params.append("q", searchQuery.trim());
      }
      if (sortBy) {
        params.append("sort", sortBy);
      }

      const res = await fetch(`/api/shop/products?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.success) {
        setProducts(json.data || []);
        if (json.categories && json.categories.length > 0) {
          setCategories(json.categories);
        }
      } else {
        setProducts([]);
      }
    } catch (err) {
      console.error("Failed to load shop products:", err);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    trackPageView("SHOP", "Katalog Produk & Toko Online Paving Joss", "/shop");
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, sortBy]);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchProducts();
      if (searchQuery.trim().length >= 2) {
        trackSearch(searchQuery.trim(), "SHOP");
      }
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const handleViewDetail = (product: ShopProduct) => {
    setSelectedProduct(product);
    trackProductView(product);
  };

  const handleAddToCart = (product: ShopProduct, qty: number) => {
    const isMto =
      product.availability_type === "MAKE_TO_ORDER" ||
      (product.availability_type === "AUTO" && (product.promo_price > 0 ? product.promo_price : product.unit_price) <= 0);

    if (isMto) {
      // Made to Order items DO NOT enter retail cart! Open Contact Person window
      setSelectedProductForContact(product);
      setIsContactModalOpen(true);
      return;
    }

    trackCartAdd(product, qty);
    addToCart(product, qty);
  };

  const handleInstantBuy = (product: ShopProduct, qty: number) => {
    trackCartAdd(product, qty);
    addToCart(product, qty);
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const handleAuthSuccess = (newCustomer: any) => {
    rotateVisitorSession();
    setCustomer(newCustomer);
    if (pendingAuthAction) {
      if (pendingAuthAction.actionType === "VIEW_DETAIL") {
        setSelectedProduct(pendingAuthAction.product);
        trackProductView(pendingAuthAction.product);
      } else if (pendingAuthAction.isInstantBuy || pendingAuthAction.actionType === "INSTANT_BUY") {
        addToCart(pendingAuthAction.product, pendingAuthAction.qty);
        setIsCheckoutOpen(true);
      } else {
        addToCart(pendingAuthAction.product, pendingAuthAction.qty);
      }
      setPendingAuthAction(null);
    }
  };

  const handleLogoutCustomer = () => {
    rotateVisitorSession();
    // Explicitly clean active session and guest cart to guarantee absolute data isolation
    localStorage.removeItem("shop_customer_session_v1");
    localStorage.removeItem("pavingjoss_shop_cart_guest");
    setCustomer(null);
  };

  const handleProceedToCheckout = () => {
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const handleOrderPlaced = (orderData: any) => {
    setLastPlacedOrder(orderData);
    clearCart();
    setIsCheckoutOpen(false);
    setIsSuccessOpen(true);
  };

  const handleOpenTrackingWithOrder = (orderNumber: string) => {
    setTrackingOrderNumber(orderNumber);
    setIsTrackingOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] text-stone-900 flex flex-col font-sans antialiased">
      {/* Clean Navigation Header */}
      <ShopHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        cartItemCount={totalItems}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenTracking={() => {
          setTrackingOrderNumber("");
          setIsTrackingOpen(true);
        }}
        customer={customer}
        onOpenAuth={() => {
          setPendingAuthAction(null);
          setIsAuthModalOpen(true);
        }}
        onLogoutCustomer={handleLogoutCustomer}
      />

      {/* Sleek, Clean & Simple Header with Responsive Breadcrumbs and Back Action */}
      <section className="bg-white border-b border-stone-200/70 py-4 sm:py-6">
        <div className="max-w-[1280px] mx-auto px-3 sm:px-6 lg:px-8">
          {/* Breadcrumbs & Quick Back Navigation */}
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <button
              type="button"
              onClick={handleBackNavigation}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-stone-900 transition-colors py-1 px-2 rounded-lg hover:bg-stone-100 touch-manipulation cursor-pointer border border-stone-200/60 sm:border-none"
              title="Kembali ke Beranda Utama atau Halaman Sebelumnya"
              aria-label="Kembali ke Beranda"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-stone-700" />
              <span>Kembali ke Beranda</span>
            </button>
            <span className="text-stone-300">/</span>
            <span className="text-xs font-semibold text-stone-900">Katalog Toko Pabrik</span>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-3xl font-black text-stone-900 tracking-tight">
                Katalog &amp; Toko Resmi
              </h1>
              <p className="text-xs sm:text-sm text-stone-500 mt-0.5 sm:mt-1">
                Material beton presisi dan fabrikasi langsung dari pabrik.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-stone-600 font-medium">
              <span className="flex items-center gap-1.5 font-semibold text-stone-800 bg-stone-50 sm:bg-transparent px-2.5 py-1 sm:p-0 rounded-lg sm:rounded-none border border-stone-200/60 sm:border-none">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                Standar SNI Teruji
              </span>
              <span aria-hidden="true" className="text-stone-300 hidden sm:inline">·</span>
              <span className="flex items-center gap-1.5 font-semibold text-stone-800 bg-stone-50 sm:bg-transparent px-2.5 py-1 sm:p-0 rounded-lg sm:rounded-none border border-stone-200/60 sm:border-none">
                <Truck className="w-4 h-4 text-brand shrink-0" />
                Armada Mandiri
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Catalog Viewport */}
      <main className="max-w-[1280px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 flex-1 w-full pb-28 md:pb-12">
        {/* Controls Bar: Categories & Sorting */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3.5 sm:gap-4 pb-4 sm:pb-6 border-b border-stone-200/80 mb-6 sm:mb-8">
          {/* Category Chips with smooth touch swipe */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto w-full md:w-auto pb-1.5 md:pb-0 scrollbar-none touch-pan-x">
            <button
              onClick={() => {
                setSelectedCategory("ALL");
                trackFilter("Kategori Produk", "Semua Produk", "SHOP");
              }}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all touch-manipulation cursor-pointer ${
                selectedCategory === "ALL"
                  ? "bg-stone-900 text-white shadow-xs"
                  : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200/80"
              }`}
            >
              Semua Produk
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  trackFilter("Kategori Produk", cat, "SHOP");
                }}
                className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all touch-manipulation cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-stone-900 text-white shadow-xs"
                    : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Sort Selector & Product Count */}
          <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 w-full md:w-auto shrink-0">
            <span className="text-xs font-medium text-stone-500">
              Menampilkan <span className="font-bold text-stone-900">{products.length}</span> Produk
            </span>

            <div className="relative flex items-center">
              <Filter className="w-3.5 h-3.5 text-stone-400 absolute left-3 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="pl-8 pr-8 py-2 bg-white border border-stone-200/90 rounded-xl text-xs font-bold text-stone-800 appearance-none hover:border-stone-400 focus:outline-hidden cursor-pointer shadow-2xs touch-manipulation"
              >
                <option value="popular">Paling Populer</option>
                <option value="price_asc">Harga: Terendah ke Tertinggi</option>
                <option value="price_desc">Harga: Tertinggi ke Terendah</option>
                <option value="name_asc">Nama: A ke Z</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-stone-400 absolute right-3 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Product Cards Grid or Simple Elegant Empty State */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div
                key={n}
                className="bg-white rounded-2xl border border-stone-200/80 p-4 animate-pulse flex flex-col gap-3"
              >
                <div className="w-full aspect-4/3 bg-stone-100 rounded-xl" />
                <div className="h-4 bg-stone-100 rounded w-3/4" />
                <div className="h-3 bg-stone-100 rounded w-1/2" />
                <div className="h-8 bg-stone-100 rounded-xl mt-auto" />
              </div>
            ))}
          </div>
        ) : hasError ? (
          <div className="max-w-md mx-auto py-12 px-6 bg-white rounded-3xl border border-stone-200/80 shadow-xs text-center my-6">
            <h3 className="text-lg font-bold text-stone-900 mb-2">
              Gagal Memuat Katalog Produk
            </h3>
            <p className="text-xs text-stone-500 mb-6">
              Terjadi kendala saat menyinkronkan data katalog dari server pabrik.
            </p>
            <button
              type="button"
              onClick={() => fetchProducts()}
              className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Coba Muat Ulang</span>
            </button>
          </div>
        ) : products.length === 0 ? (
          /* Simple, Elegant, Non-Overinformative Showcase */
          <div className="max-w-xl mx-auto py-12 px-6 sm:px-8 bg-white rounded-3xl border border-stone-200/80 shadow-xs text-center my-6">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-brand flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-6 h-6" />
            </div>

            <span className="text-[10px] font-bold text-brand uppercase tracking-widest bg-red-50 px-3 py-1 rounded-full border border-red-100 inline-block mb-3">
              Made-to-Order &amp; Custom Fabrication
            </span>

            <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              Katalog Sedang Dipersiapkan
            </h2>

            <p className="text-xs sm:text-sm text-stone-500 mt-2.5 max-w-md mx-auto leading-relaxed">
              Saat ini seluruh pemesanan material beton presisi dan fabrikasi baja dilayani secara custom sesuai spesifikasi teknis dan kebutuhan proyek Anda.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
              <a
                href="https://wa.me/6281111113993?text=Halo%20Paving%20Joss,%20saya%20ingin%20konsultasi%20spesifikasi%20dan%20permintaan%20penawaran%20harga%20custom."
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95 inline-flex items-center justify-center gap-2"
              >
                <span>Konsultasi via WhatsApp (0811-1111-3993)</span>
              </a>
              <button
                type="button"
                onClick={() => setIsContactModalOpen(true)}
                className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-stone-50 text-stone-800 border border-stone-200 rounded-xl font-bold text-xs uppercase tracking-wider transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Kontak Sales &amp; Penawaran</span>
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-stone-100 flex flex-wrap items-center justify-center gap-3 text-[11px] font-medium text-stone-400">
              <span>✓ Standar Mutu SNI &amp; Teruji</span>
              <span>•</span>
              <span>✓ Custom Dimensi &amp; CAD</span>
              <span>•</span>
              <span>✓ Pengiriman Langsung ke Site</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isAuthenticated={!!customer}
                onAddToCart={handleAddToCart}
                onViewDetail={handleViewDetail}
                onContactSales={(p) => {
                  setSelectedProductForContact(p);
                  setIsContactModalOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Mobile Floating Sticky Cart Bar (Easy checkout navigation on responsive mobile) */}
      {totalItems > 0 && (
        <div className="md:hidden fixed bottom-4 left-3 right-3 z-30 animate-in slide-in-from-bottom-3 duration-200">
          <div className="bg-stone-950/95 backdrop-blur-md text-white rounded-2xl p-3 shadow-2xl border border-stone-800/90 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-4 h-4 text-white" />
                <span className="absolute -top-1 -right-1 bg-brand text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-stone-300 font-medium truncate">
                  {totalItems} barang di keranjang
                </div>
                <div className="text-sm font-black font-mono text-white tracking-tight">
                  {formatIDR(subtotal)}
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsCartOpen(true)}
              className="py-2.5 px-3.5 rounded-xl bg-brand hover:bg-red-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-sm transition-transform cursor-pointer touch-manipulation"
              aria-label="Lihat Keranjang Belanja"
            >
              <span>Keranjang</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-16">
        <PublicFooter />
      </div>

      {/* Contact Person Window (Simple, Elegant & Clean) */}
      <Modal
        isOpen={isContactModalOpen}
        onClose={() => {
          setIsContactModalOpen(false);
          setSelectedProductForContact(null);
        }}
        maxWidth="md"
        title="Kontak Sales & Penawaran"
      >
        <div className="p-6 space-y-5 text-stone-800">
          {/* Selected Product Pill if opened from a specific product */}
          {selectedProductForContact && (
            <div className="flex items-center gap-3 p-3 bg-stone-50 border border-stone-200/80 rounded-2xl">
              <img
                src={selectedProductForContact.image_url || "https://images.unsplash.com/photo-1584463623578-3062b88137f4?w=800&auto=format&fit=crop&q=80"}
                alt={selectedProductForContact.name}
                className="w-12 h-12 rounded-xl object-cover border border-stone-200 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-mono text-stone-400 font-bold">
                  {selectedProductForContact.item_code}
                </div>
                <div className="text-xs font-bold text-stone-900 truncate">
                  {selectedProductForContact.name}
                </div>
                <div className="text-[11px] text-amber-800 font-semibold mt-0.5">
                  Made to Order
                </div>
              </div>
            </div>
          )}

          {/* 2 Primary Contact Channels: Phone & Email */}
          <div className="space-y-3">
            {/* 1. Phone / WhatsApp */}
            <div className="p-4 rounded-2xl border border-stone-200 bg-white hover:border-emerald-300 transition-colors flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                    Telepon / WhatsApp
                  </span>
                  <div className="text-sm sm:text-base font-bold text-stone-900 font-mono tracking-tight truncate">
                    0811-1111-3993
                  </div>
                </div>
              </div>

              <a
                href={`https://wa.me/6281111113993?text=${encodeURIComponent(
                  `Halo Sales Paving Joss, saya ingin meminta penawaran harga untuk produk: ${
                    selectedProductForContact?.name || "Material Made to Order"
                  } (${selectedProductForContact?.item_code || "-"})`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 transition-colors shadow-2xs inline-flex items-center gap-1.5"
              >
                <span>WhatsApp</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* 2. Email */}
            <div className="p-4 rounded-2xl border border-stone-200 bg-white hover:border-blue-300 transition-colors flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                    Email Resmi
                  </span>
                  <div className="text-sm sm:text-base font-bold text-stone-900 font-mono tracking-tight truncate">
                    pavingjoss@gmail.com
                  </div>
                </div>
              </div>

              <a
                href={`mailto:pavingjoss@gmail.com?subject=${encodeURIComponent(
                  `Permintaan Penawaran Harga - ${selectedProductForContact?.name || "Material Made to Order"}`
                )}&body=${encodeURIComponent(
                  `Halo Tim Sales Paving Joss,\n\nSaya ingin mengajukan permintaan penawaran harga untuk produk:\nNama Produk: ${
                    selectedProductForContact?.name || "-"
                  }\nKode SKU: ${selectedProductForContact?.item_code || "-"}\n\nNama / Perusahaan: \nNo. Telp / WhatsApp: \nEstimasi Kebutuhan Volume: \n\nTerima kasih.`
                )}`}
                className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold shrink-0 transition-colors shadow-2xs inline-flex items-center gap-1.5"
              >
                <span>Kirim Email</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </Modal>

      {/* Cart Window */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        subtotal={subtotal}
        totalWeightKg={totalWeightKg}
        onUpdateQty={updateQty}
        onRemoveItem={removeFromCart}
        onClearCart={clearCart}
        onProceedCheckout={handleProceedToCheckout}
        promoProducts={products.filter(
          (p) =>
            p.availability_type !== "MAKE_TO_ORDER" &&
            Number(p.unit_price) > 0 &&
            ((Number(p.promo_price) > 0 && Number(p.promo_price) < Number(p.unit_price)) || (p.badge && p.badge.trim() !== "") || p.is_featured === 1)
        )}
        onAddPromoItem={(promoProduct) => handleAddToCart(promoProduct, 1)}
      />

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onInstantBuy={handleInstantBuy}
        onOpenContactSales={(p) => {
          setSelectedProduct(null);
          setSelectedProductForContact(p);
          setIsContactModalOpen(true);
        }}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cartItems}
        subtotal={subtotal}
        totalWeightKg={totalWeightKg}
        onOrderPlaced={handleOrderPlaced}
        customer={customer}
      />

      {/* Customer Auth / Progressive Gating Modal */}
      <CustomerAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setPendingAuthAction(null);
        }}
        pendingProduct={pendingAuthAction}
        onSuccess={handleAuthSuccess}
      />

      {/* Order Confirmation Screen */}
      <OrderSuccessModal
        orderData={lastPlacedOrder}
        onClose={() => {
          setIsSuccessOpen(false);
          setLastPlacedOrder(null);
        }}
        onTrackOrder={handleOpenTrackingWithOrder}
      />

      {/* Order Tracking Modal */}
      <OrderTrackingModal
        isOpen={isTrackingOpen}
        onClose={() => setIsTrackingOpen(false)}
        initialOrderNumber={trackingOrderNumber}
      />
    </div>
  );
}
