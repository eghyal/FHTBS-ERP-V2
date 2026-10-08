import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Boxes,
  ShoppingBag,
  Eye,
  EyeOff,
  Search,
  RefreshCw,
  ExternalLink,
  Check,
  X,
  Layers,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Truck,
  ShieldCheck,
  Tag,
  FileText,
  AlertCircle,
  Loader2,
  Settings2,
  Calendar,
  User,
  Phone,
  MapPin,
  CheckSquare,
  ArrowRight,
  Store,
  Warehouse,
  PackageCheck,
  Factory,
  ChevronDown,
  SlidersHorizontal,
  Sparkles,
  Receipt,
  Package
} from "lucide-react";
import { formatIDR } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/contexts/ToastContext";
import { ShopOrder } from "@/types/shop";
import { ProductImageUploader } from "@/components/shared/ProductImageUploader";

interface CatalogItem {
  id: string;
  item_code: string;
  name: string;
  dimension?: string | null;
  spec?: string | null;
  category: string;
  description?: string | null;
  uom: string;
  unit_price: number;
  shop_promo_price: number;
  shop_weight_kg: number;
  shop_image_url: string;
  shop_gallery_urls?: string[] | string;
  shop_badge?: string | null;
  shop_featured: number;
  is_published_shop: number;
  shop_availability_type?: "AUTO" | "READY_STOCK" | "MAKE_TO_ORDER" | "PRE_ORDER";
  shop_lead_time_days?: number;
  shop_moq?: number;
  shop_specs?: string;
  available_qty: number;
  physical_qty: number;
}

export default function ShopManagement() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"catalog" | "orders">("catalog");
  const [stats, setStats] = useState<any>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters for Catalog
  const [catalogSearch, setCatalogSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [availabilityFilter, setAvailabilityFilter] = useState<"ALL" | "READY" | "MTO" | "PUBLISHED" | "HIDDEN">("ALL");

  // Filters for Orders
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("ALL");

  // Modals
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ShopOrder | null>(null);

  // Fetch KPI statistics
  const fetchStats = async () => {
    try {
      const res = await fetch("/api/erp/shop-management/stats");
      const json = await res.json();
      if (json.success) {
        setStats(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch shop stats:", err);
    }
  };

  // Fetch Finished Goods catalog
  const fetchCatalog = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/erp/shop-management/catalog");
      const json = await res.json();
      if (json.success) {
        setCatalog(json.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch catalog:", err);
      showToast("Failed to load finished goods catalog", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch retail orders
  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (orderStatusFilter !== "ALL") params.append("status", orderStatusFilter);
      if (orderSearch.trim()) params.append("q", orderSearch.trim());

      const res = await fetch(`/api/erp/shop-management/orders?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setOrders(json.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
      showToast("Failed to load storefront retail orders", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    if (activeTab === "catalog") {
      fetchCatalog();
    } else {
      fetchOrders();
    }
  }, [activeTab, orderStatusFilter]);

  // Toggle publish state directly
  const handleTogglePublish = async (item: CatalogItem) => {
    try {
      const newState = item.is_published_shop === 1 ? 0 : 1;
      const res = await fetch(`/api/erp/shop-management/catalog/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published_shop: newState }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(
          newState === 1
            ? `SKU ${item.item_code} published on storefront`
            : `SKU ${item.item_code} hidden from storefront`,
          "success"
        );
        setCatalog((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, is_published_shop: newState } : it))
        );
        fetchStats();
      } else {
        showToast(json.error || "Failed to update publication status", "error");
      }
    } catch {
      showToast("Connection error while updating status", "error");
    }
  };

  // Save detailed item display settings
  const handleSaveItemDisplay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const availType = editingItem.shop_availability_type || "AUTO";
    const basePrice = Number(editingItem.unit_price || 0);

    // Validation: B2C Direct Sale requires a valid Base Unit Price > 0
    if (availType === "READY_STOCK" && basePrice <= 0) {
      showToast("Base Unit Price is required for B2C Direct Sale products (must be greater than 0).", "error");
      return;
    }

    // For B2B Made to Order, enforce zero unit price and zero promo price
    const finalUnitPrice = availType === "MAKE_TO_ORDER" ? 0 : basePrice;
    const finalPromoPrice = availType === "MAKE_TO_ORDER" ? 0 : Number(editingItem.shop_promo_price || 0);

    setIsSavingItem(true);
    try {
      const res = await fetch(`/api/erp/shop-management/catalog/${editingItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_price: finalUnitPrice,
          is_published_shop: editingItem.is_published_shop,
          shop_promo_price: finalPromoPrice,
          shop_weight_kg: Number(editingItem.shop_weight_kg || 2.5),
          shop_badge: editingItem.shop_badge,
          shop_featured: editingItem.shop_featured,
          shop_availability_type: availType,
          shop_lead_time_days: Number(editingItem.shop_lead_time_days || 3),
          shop_moq: Number(editingItem.shop_moq || 1),
          shop_specs: editingItem.shop_specs,
          shop_image_url: editingItem.shop_image_url,
          shop_gallery_urls:
            typeof editingItem.shop_gallery_urls === "string"
              ? editingItem.shop_gallery_urls
              : JSON.stringify(editingItem.shop_gallery_urls || []),
          category: editingItem.category,
          description: editingItem.description,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save configuration");
      }

      showToast("Showroom display settings saved successfully", "success");
      setEditingItem(null);
      fetchCatalog();
      fetchStats();
    } catch (err: any) {
      showToast(err.message || "Failed to save changes", "error");
    } finally {
      setIsSavingItem(false);
    }
  };

  // Update order status (Cancel, Mark Paid, etc.)
  const handleUpdateOrderStatus = async (orderId: string, newStatus: string, newPaymentStatus?: string) => {
    try {
      const res = await fetch(`/api/erp/shop-management/orders/${orderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_status: newStatus,
          payment_status: newPaymentStatus,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Order status updated successfully", "success");
        fetchOrders();
        fetchStats();
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder((prev) =>
            prev
              ? {
                  ...prev,
                  order_status: newStatus as any,
                  payment_status: (newPaymentStatus as any) || prev.payment_status,
                }
              : null
          );
        }
      } else {
        showToast(json.error || "Failed to update order status", "error");
      }
    } catch {
      showToast("Network error while updating order", "error");
    }
  };

  // Filtered Catalog List
  const filteredCatalog = useMemo(() => {
    return catalog.filter((item) => {
      const s = catalogSearch.toLowerCase().trim();
      const matchesSearch =
        !s ||
        item.name.toLowerCase().includes(s) ||
        item.item_code.toLowerCase().includes(s) ||
        (item.category && item.category.toLowerCase().includes(s)) ||
        (item.spec && item.spec.toLowerCase().includes(s));

      const matchesCat = categoryFilter === "ALL" || item.category === categoryFilter;

      let matchesAvail = true;
      const isReady = (item.physical_qty || 0) > 0;
      if (availabilityFilter === "READY") {
        matchesAvail = isReady;
      } else if (availabilityFilter === "MTO") {
        matchesAvail = !isReady || item.shop_availability_type === "MAKE_TO_ORDER";
      } else if (availabilityFilter === "PUBLISHED") {
        matchesAvail = item.is_published_shop === 1;
      } else if (availabilityFilter === "HIDDEN") {
        matchesAvail = item.is_published_shop === 0;
      }

      return matchesSearch && matchesCat && matchesAvail;
    });
  }, [catalog, catalogSearch, categoryFilter, availabilityFilter]);

  // Extract unique categories from catalog
  const categories = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((it) => {
      if (it.category) set.add(it.category);
    });
    return Array.from(set).sort();
  }, [catalog]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Top Header */}
      <PageHeader
        title="Finished Goods & Storefront"
        subtitle="Product catalog and retail orders"
        icon={<Store className="w-5 h-5 text-stone-700" />}
        actions={
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                fetchStats();
                if (activeTab === "catalog") fetchCatalog();
                else fetchOrders();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 shadow-xs transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-stone-500" />
              <span>Refresh</span>
            </button>
            <a
              href="/shop"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-brand hover:bg-brand-dark text-white shadow-xs transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>View Storefront</span>
            </a>
          </div>
        }
      />

      {/* KPI Cards (Refined Industrial ERP Palette - Harmonious & Elegant) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {/* Card 1: Finished Goods */}
        <div className="bg-white p-4 rounded-xl border border-stone-200/90 shadow-3xs flex flex-col justify-between hover:border-stone-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
              Finished Goods
            </span>
            <div className="w-7 h-7 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center">
              <PackageCheck className="w-4 h-4 text-stone-700" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold text-stone-900 font-mono tracking-tight">
              {stats?.total_skus || catalog.length}
            </div>
            <div className="text-[11px] text-stone-500 font-medium mt-0.5">
              Active Catalog SKUs
            </div>
          </div>
        </div>

        {/* Card 2: Published */}
        <div className="bg-white p-4 rounded-xl border border-stone-200/90 shadow-3xs flex flex-col justify-between hover:border-stone-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
              Published
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100/80 flex items-center justify-center">
              <Store className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold text-stone-900 font-mono tracking-tight">
              {stats?.published_skus || catalog.filter((c) => c.is_published_shop === 1).length}
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>Live on Storefront</span>
            </div>
          </div>
        </div>

        {/* Card 3: Ready Stock */}
        <div className="bg-white p-4 rounded-xl border border-stone-200/90 shadow-3xs flex flex-col justify-between hover:border-stone-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
              Ready Stock
            </span>
            <div className="w-7 h-7 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center">
              <Warehouse className="w-4 h-4 text-stone-700" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold text-stone-900 font-mono tracking-tight">
              {stats?.ready_stock_skus || catalog.filter((c) => c.is_published_shop === 1 && (c.physical_qty || 0) > 0).length}
            </div>
            <div className="text-[11px] text-stone-500 font-medium mt-0.5">
              Gambiran Stockyard
            </div>
          </div>
        </div>

        {/* Card 4: Make to Order */}
        <div className="bg-white p-4 rounded-xl border border-stone-200/90 shadow-3xs flex flex-col justify-between hover:border-stone-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
              Make to Order
            </span>
            <div className="w-7 h-7 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center">
              <Factory className="w-4 h-4 text-stone-700" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold text-stone-900 font-mono tracking-tight">
              {stats?.mto_skus || catalog.filter((c) => c.is_published_shop === 1 && (c.physical_qty || 0) <= 0).length}
            </div>
            <div className="text-[11px] text-stone-500 font-medium mt-0.5">
              Custom Press / Inden
            </div>
          </div>
        </div>

        {/* Card 5: Retail Orders */}
        <div className="bg-white p-4 rounded-xl border border-stone-200/90 shadow-3xs flex flex-col justify-between hover:border-stone-300 transition-all col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
              Retail Orders
            </span>
            <div className="w-7 h-7 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-stone-700" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold text-stone-900 font-mono tracking-tight">
              {stats?.total_orders || orders.length}
            </div>
            <div className="text-[11px] text-stone-500 font-medium mt-0.5">
              Direct Consumer Channel
            </div>
          </div>
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex items-center justify-between border-b border-stone-200 pb-3">
        <div className="inline-flex p-1 bg-stone-100 rounded-xl border border-stone-200/80">
          <button
            onClick={() => setActiveTab("catalog")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "catalog"
                ? "bg-white text-stone-900 shadow-xs"
                : "text-stone-500 hover:text-stone-900"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-stone-600" />
            <span>Finished Goods Catalog</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-stone-100 text-stone-700 font-bold border border-stone-200/60">
              {catalog.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("orders")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "orders"
                ? "bg-white text-stone-900 shadow-xs"
                : "text-stone-500 hover:text-stone-900"
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-stone-600" />
            <span>Retail Orders & Fulfillment</span>
          </button>
        </div>
      </div>

      {/* TAB 1: FINISHED GOODS CATALOG */}
      {activeTab === "catalog" && (
        <div className="space-y-4">
          {/* Controls Bar: Unified Search & Structured Filters */}
          <div className="bg-white p-3 rounded-xl border border-stone-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-lg">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search SKU code, item name, specification, dimension..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-stone-400 text-stone-900 placeholder-stone-400 font-medium"
              />
              {catalogSearch && (
                <button
                  onClick={() => setCatalogSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Section: Category + Availability Pills in one neat line */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Category Dropdown */}
              <div className="relative min-w-[160px]">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg pl-3 pr-8 py-2 text-stone-700 font-semibold focus:bg-white focus:outline-hidden appearance-none cursor-pointer"
                >
                  <option value="ALL">All Categories ({categories.length})</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Availability Filter Chips */}
              <div className="inline-flex items-center gap-1 bg-stone-100 p-1 rounded-lg border border-stone-200/70 overflow-x-auto">
                <button
                  onClick={() => setAvailabilityFilter("ALL")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap ${
                    availabilityFilter === "ALL"
                      ? "bg-white text-stone-900 shadow-xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setAvailabilityFilter("READY")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap ${
                    availabilityFilter === "READY"
                      ? "bg-white text-stone-900 shadow-xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  Ready Stock
                </button>
                <button
                  onClick={() => setAvailabilityFilter("MTO")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap ${
                    availabilityFilter === "MTO"
                      ? "bg-white text-stone-900 shadow-xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  Make to Order
                </button>
                <button
                  onClick={() => setAvailabilityFilter("PUBLISHED")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap ${
                    availabilityFilter === "PUBLISHED"
                      ? "bg-white text-emerald-700 shadow-xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  Published
                </button>
                <button
                  onClick={() => setAvailabilityFilter("HIDDEN")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap ${
                    availabilityFilter === "HIDDEN"
                      ? "bg-white text-stone-700 shadow-xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  Hidden
                </button>
              </div>
            </div>
          </div>

          {/* Catalog Table */}
          <div className="bg-white rounded-xl border border-stone-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4 min-w-[260px]">SKU & Item Details</th>
                    <th className="py-3 px-4 min-w-[160px]">Warehouse Stock & Mode</th>
                    <th className="py-3 px-4 min-w-[130px]">Storefront Pricing</th>
                    <th className="py-3 px-4 text-center min-w-[100px]">Storefront</th>
                    <th className="py-3 px-4 text-right w-16">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-700">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-stone-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-stone-400" />
                        Loading catalog data...
                      </td>
                    </tr>
                  ) : filteredCatalog.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-stone-400">
                        <Boxes className="w-8 h-8 mx-auto mb-2 text-stone-300" />
                        No Finished Goods matching the current criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredCatalog.map((item) => {
                      const isReadyStock = (item.physical_qty || 0) > 0;
                      const hasDiscount = item.shop_promo_price > 0 && item.shop_promo_price < item.unit_price;
                      const galleryList: string[] = (() => {
                        try {
                          if (Array.isArray(item.shop_gallery_urls)) return item.shop_gallery_urls;
                          if (typeof item.shop_gallery_urls === "string") return JSON.parse(item.shop_gallery_urls);
                          return item.shop_image_url ? [item.shop_image_url] : [];
                        } catch {
                          return item.shop_image_url ? [item.shop_image_url] : [];
                        }
                      })();
                      const photoCount = Math.max(item.shop_image_url ? 1 : 0, galleryList.length);

                      return (
                        <tr key={item.id} className="hover:bg-stone-50/70 transition-colors">
                          {/* SKU & Product */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              {/* Dedicated Thumbnail with graceful fallback */}
                              <div className="w-10 h-10 rounded-lg bg-stone-100 border border-stone-200/80 overflow-hidden shrink-0 flex items-center justify-center relative">
                                {item.shop_image_url ? (
                                  <img
                                    src={item.shop_image_url}
                                    alt={item.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLElement).style.display = "none";
                                      const fallback = (e.currentTarget.parentElement?.querySelector(".fallback-icon") as HTMLElement);
                                      if (fallback) fallback.style.display = "flex";
                                    }}
                                  />
                                ) : null}
                                <div
                                  className="fallback-icon items-center justify-center text-stone-400 w-full h-full"
                                  style={{ display: item.shop_image_url ? "none" : "flex" }}
                                >
                                  <Package className="w-4 h-4 text-stone-400" />
                                </div>
                                {photoCount > 1 && (
                                  <span className="absolute bottom-0.5 right-0.5 bg-stone-900/85 text-white text-[8px] font-bold px-1 rounded">
                                    {photoCount}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-stone-900 truncate max-w-[280px]">
                                    {item.name}
                                  </span>
                                  {item.shop_featured === 1 && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                                      <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                                      <span>Featured</span>
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-stone-500 mt-1 flex-wrap">
                                  <span className="font-mono text-stone-700 bg-stone-100 px-1.5 py-0.2 rounded border border-stone-200/70 text-[10px] font-semibold">
                                    {item.item_code}
                                  </span>
                                  <span className="text-stone-300">•</span>
                                  <span>{item.category || "General"}</span>
                                  {photoCount > 1 && (
                                    <>
                                      <span className="text-stone-300">•</span>
                                      <span className="text-brand font-medium">{photoCount} foto</span>
                                    </>
                                  )}
                                  {item.dimension && (
                                    <>
                                      <span className="text-stone-300">•</span>
                                      <span className="text-stone-600">{item.dimension}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Warehouse Stock & Availability Mode */}
                          <td className="py-3.5 px-4">
                            {isReadyStock ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Ready: {item.physical_qty?.toLocaleString()} {item.uom}
                                </span>
                                <span className="text-[10px] text-stone-400 block font-medium">
                                  Gambiran Stockyard
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                  Make to Order
                                </span>
                                <span className="text-[10px] text-stone-400 block font-medium">
                                  MOQ: {item.shop_moq || 1} {item.uom}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Pricing (B2C Fixed Price vs B2B RFQ Quotation) */}
                          <td className="py-3.5 px-4">
                            {item.unit_price <= 0 || item.shop_availability_type === "MAKE_TO_ORDER" || item.shop_availability_type === "PRE_ORDER" ? (
                              <div className="space-y-0.5">
                                {item.unit_price > 0 ? (
                                  <div className="font-bold text-stone-900 font-mono text-xs">
                                    {formatIDR(item.unit_price)}
                                  </div>
                                ) : null}
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80 whitespace-nowrap">
                                  <span>B2B Quotation</span>
                                </span>
                              </div>
                            ) : hasDiscount ? (
                              <div>
                                <div className="font-bold text-stone-900 font-mono text-xs">
                                  {formatIDR(item.shop_promo_price)}
                                </div>
                                <div className="text-[10px] text-stone-400 font-mono line-through mt-0.5">
                                  {formatIDR(item.unit_price)}
                                </div>
                              </div>
                            ) : (
                              <div className="font-bold text-stone-900 font-mono text-xs">
                                {formatIDR(item.unit_price)}
                              </div>
                            )}
                          </td>

                          {/* Storefront Visibility Switch */}
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => handleTogglePublish(item)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95 whitespace-nowrap ${
                                item.is_published_shop === 1
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 shadow-3xs"
                                  : "bg-stone-100 text-stone-500 border border-stone-200 hover:bg-stone-200/80"
                              }`}
                              title={item.is_published_shop === 1 ? "Click to unpublish" : "Click to publish live"}
                            >
                              {item.is_published_shop === 1 ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Live</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3 h-3 text-stone-400" />
                                  <span>Hidden</span>
                                </>
                              )}
                            </button>
                          </td>

                          {/* Actions - Icon Button Only */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              id={`btn-config-item-${item.id}`}
                              onClick={() => setEditingItem(item)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-stone-600 bg-white border border-stone-200 hover:bg-stone-100 hover:text-stone-900 hover:border-stone-300 shadow-3xs transition-all active:scale-95"
                              title={`Configure ${item.name}`}
                              aria-label={`Configure ${item.name}`}
                            >
                              <SlidersHorizontal className="w-4 h-4 text-stone-600" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RETAIL ORDERS & ERP FULFILLMENT */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          {/* Search and Status Filters */}
          <div className="bg-white p-3 rounded-xl border border-stone-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-lg">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search order #, customer name, phone, city..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-stone-400 text-stone-900 placeholder-stone-400 font-medium"
              />
              {orderSearch && (
                <button
                  onClick={() => setOrderSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="inline-flex items-center gap-1 bg-stone-100 p-1 rounded-lg border border-stone-200/70 overflow-x-auto">
              {[
                { id: "ALL", label: "All Orders" },
                { id: "PROCESSING", label: "Processing" },
                { id: "DISPATCHED", label: "Dispatched" },
                { id: "COMPLETED", label: "Completed" }
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setOrderStatusFilter(st.id)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap ${
                    orderStatusFilter === st.id
                      ? "bg-white text-stone-900 shadow-xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white rounded-xl border border-stone-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4 min-w-[150px]">Order # & Date</th>
                    <th className="py-3 px-4 min-w-[180px]">Customer & Contact</th>
                    <th className="py-3 px-4 min-w-[190px]">Items Summary</th>
                    <th className="py-3 px-4 min-w-[140px]">Total & Dispatch</th>
                    <th className="py-3 px-4 min-w-[130px]">Payment Status</th>
                    <th className="py-3 px-4 min-w-[120px]">Fulfillment</th>
                    <th className="py-3 px-4 text-right min-w-[170px]">ERP Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-700">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-stone-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-stone-400" />
                        Loading retail orders...
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-stone-400">
                        <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-stone-300" />
                        No retail orders found in this filter.
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => {
                      const isPaid = order.payment_status === "PAID" || order.payment_status === "VERIFIED";

                      return (
                        <tr key={order.id} className="hover:bg-stone-50/70 transition-colors">
                          {/* Order Number & Timestamp */}
                          <td className="py-3.5 px-4 font-mono">
                            <div className="font-bold text-stone-900">{order.order_number}</div>
                            <div className="text-[10px] text-stone-400 font-sans flex items-center gap-1.5 mt-0.5">
                              <Calendar className="w-3 h-3 text-stone-400 shrink-0" />
                              <span>
                                {new Date(order.created_at).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </td>

                          {/* Customer */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-stone-900">{order.customer_name}</div>
                            <div className="text-[11px] text-stone-500 flex items-center gap-1.5 mt-0.5">
                              <Phone className="w-3 h-3 text-stone-400 shrink-0" />
                              <span>{order.customer_phone}</span>
                            </div>
                            {order.delivery_city && (
                              <div className="text-[10px] text-stone-400 flex items-center gap-1.5 mt-0.5">
                                <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                                <span className="truncate max-w-[150px]">{order.delivery_city}</span>
                              </div>
                            )}
                          </td>

                          {/* Items Summary */}
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-stone-800">
                              {order.items && order.items.length > 0 ? (
                                <span className="truncate max-w-[180px] block">
                                  {order.items[0].item_name}{" "}
                                  {order.items.length > 1 && (
                                    <span className="text-stone-400 font-normal">
                                      +{order.items.length - 1} more
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span>{order.item_count || 1} Item(s)</span>
                              )}
                            </div>
                            <div className="text-[10px] text-stone-400 mt-0.5">
                              {order.items
                                ? `${order.items.reduce((acc, it) => acc + (it.qty || 0), 0)} units total`
                                : "Direct retail"}
                            </div>
                          </td>

                          {/* Total & Delivery */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-stone-900 font-mono text-xs">
                              {formatIDR(order.total_amount)}
                            </div>
                            <div className="text-[10px] text-stone-500 font-sans flex items-center gap-1.5 mt-0.5">
                              <Truck className="w-3 h-3 text-stone-400 shrink-0" />
                              <span className="whitespace-nowrap">
                                {order.delivery_method === "PICKUP" ? "Stockyard Pickup" : "Fleet Delivery"}
                              </span>
                            </div>
                          </td>

                          {/* Payment */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                                isPaid
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                  : "bg-amber-50 text-amber-800 border border-amber-200"
                              }`}
                            >
                              {isPaid ? <Check className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3 text-amber-600" />}
                              <span>{order.payment_status}</span>
                            </span>
                            <div className="text-[10px] text-stone-400 mt-1 uppercase font-semibold tracking-wider">
                              {order.payment_method.replace("_", " ")}
                            </div>
                            {order.payment_proof_url && (
                              <div className="mt-1.5">
                                <a
                                  href={order.payment_proof_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-brand hover:text-brand-dark hover:underline"
                                >
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                  <span>Lihat Bukti</span>
                                </a>
                              </div>
                            )}
                          </td>

                          {/* Order Status */}
                          <td className="py-3.5 px-4">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-stone-100 text-stone-700 border border-stone-200 whitespace-nowrap">
                              {order.order_status.replace("_", " ")}
                            </span>
                            {order.tracking_number && (
                              <div className="inline-flex items-center gap-1 font-mono text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60 font-semibold mt-1">
                                DO: {order.tracking_number}
                              </div>
                            )}
                          </td>

                          {/* ERP Handoff Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setSelectedOrder(order)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-stone-200 hover:bg-stone-50 hover:border-stone-300 text-stone-700 shadow-3xs transition-all active:scale-95 whitespace-nowrap"
                              >
                                <FileText className="w-3.5 h-3.5 text-stone-500" />
                                <span>Details</span>
                              </button>

                              {/* Direct Handoff Link to Deliveries */}
                              <Link
                                to="/deliveries"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-stone-50 border border-stone-200 hover:bg-stone-100 hover:border-stone-300 text-stone-800 shadow-3xs transition-all active:scale-95 whitespace-nowrap"
                                title="Open in Official ERP Deliveries module"
                              >
                                <Truck className="w-3.5 h-3.5 text-stone-600" />
                                <span>Deliveries</span>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURE FINISHED GOODS SHOWROOM DISPLAY */}
      {editingItem && (
        <Modal
          isOpen={true}
          onClose={() => setEditingItem(null)}
          title={`Configure Showroom Display: ${editingItem.name}`}
          maxWidth="5xl"
        >
          <form onSubmit={handleSaveItemDisplay} className="space-y-4 text-xs text-stone-700">
            {/* Read-only Item Master Bar */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">SKU Code</span>
                <span className="font-bold text-stone-900 font-mono">{editingItem.item_code}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Base Price</span>
                <span className="font-bold text-stone-900 font-mono">{formatIDR(editingItem.unit_price)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Stockyard Qty</span>
                <span className={`font-bold font-mono ${editingItem.physical_qty > 0 ? "text-emerald-700" : "text-stone-500"}`}>
                  {editingItem.physical_qty || 0} {editingItem.uom}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Dimension</span>
                <span className="font-medium text-stone-800">{editingItem.dimension || "Standard"}</span>
              </div>
            </div>

            {/* Visibility and Featured Switches */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 cursor-pointer">
                <div>
                  <span className="font-bold text-stone-900 block">Publish on Public Storefront</span>
                  <span className="text-[11px] text-stone-500">Enable visibility for retail buyers</span>
                </div>
                <input
                  type="checkbox"
                  checked={editingItem.is_published_shop === 1}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      is_published_shop: e.target.checked ? 1 : 0,
                    })
                  }
                  className="w-4 h-4 text-brand rounded-md border-stone-300 focus:ring-brand"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 cursor-pointer">
                <div>
                  <span className="font-bold text-stone-900 block">Featured on Homepage</span>
                  <span className="text-[11px] text-stone-500">Highlight in showroom recommendations</span>
                </div>
                <input
                  type="checkbox"
                  checked={editingItem.shop_featured === 1}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      shop_featured: e.target.checked ? 1 : 0,
                    })
                  }
                  className="w-4 h-4 text-brand rounded-md border-stone-300 focus:ring-brand"
                />
              </label>
            </div>

            {/* Availability Strategy & Production Parameters */}
            <div className="p-3.5 bg-blue-50/40 rounded-xl border border-blue-100 space-y-3">
              <div className="font-bold text-blue-900 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>Availability &amp; Production Mode</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">
                    STRATEGY AVAILABILITY &amp; SALES MODEL
                  </label>
                  <select
                    value={editingItem.shop_availability_type || "AUTO"}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        shop_availability_type: e.target.value as any,
                      })
                    }
                    className="w-full text-xs bg-white border border-stone-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-400 focus:outline-hidden text-stone-800 font-medium"
                  >
                    <option value="AUTO">Smart Auto (B2C Fixed Price if Priced, B2B Made to Order if Unpriced)</option>
                    <option value="READY_STOCK">B2C - Retail Direct Sale (Fixed Price Required)</option>
                    <option value="MAKE_TO_ORDER">B2B - Project Made to Order (Quotation Only / No Price Shown)</option>
                  </select>
                  <span className="text-[10px] text-blue-700 mt-1 block font-medium">
                    {editingItem.shop_availability_type === "MAKE_TO_ORDER"
                      ? "• B2B Mode: No price shown on storefront (Made to Order / RFQ Quotation)"
                      : editingItem.shop_availability_type === "READY_STOCK"
                      ? "• B2C Mode: Fixed price mandatory for direct storefront purchase"
                      : "• Auto Mode: Displays fixed price if set, or Made to Order if unpriced"}
                  </span>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">
                    MINIMUM ORDER QTY (MOQ)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editingItem.shop_moq || 1}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        shop_moq: parseFloat(e.target.value) || 1,
                      })
                    }
                    className="w-full text-xs bg-white border border-stone-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-400 focus:outline-hidden font-mono"
                    placeholder="1"
                  />
                  <span className="text-[10px] text-stone-400 mt-1 block">Minimum order quantity per request</span>
                </div>
              </div>
            </div>

            {/* Pricing, Category, Weight & Marketing Badge */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">
                  PRODUCT CATEGORY
                </label>
                <select
                  value={editingItem.category || "Paving & Precast"}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      category: e.target.value,
                    })
                  }
                  className="w-full text-xs bg-white border border-stone-200 rounded-lg p-2.5 focus:ring-2 focus:ring-stone-400 focus:outline-hidden"
                >
                  <option value="Paving & Precast">Paving &amp; Precast</option>
                  <option value="Drainase & Kanstin">Drainase &amp; Kanstin</option>
                  <option value="Fabrikasi Baja">Fabrikasi Baja</option>
                  <option value="General">General</option>
                </select>
                <span className="text-[10px] text-stone-400 mt-1 block">Showroom classification</span>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-900 uppercase tracking-wider block mb-1">
                  BASE UNIT PRICE (IDR)
                </label>
                <input
                  type="text"
                  value={(() => {
                    const val = editingItem.unit_price;
                    if (val === undefined || val === null || String(val) === "" || isNaN(Number(val))) return "0";
                    const num = typeof val === "number" ? val : parseInt(String(val).replace(/\D/g, ""), 10) || 0;
                    return new Intl.NumberFormat("id-ID").format(num);
                  })()}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, "");
                    const num = clean ? parseInt(clean, 10) : 0;
                    setEditingItem({
                      ...editingItem,
                      unit_price: num,
                    });
                  }}
                  className="w-full text-xs bg-white border border-stone-300 rounded-lg p-2.5 focus:ring-2 focus:ring-stone-500 focus:outline-hidden font-mono font-bold text-stone-900"
                  placeholder="0"
                />
                <span className="text-[10px] text-stone-500 mt-1 block">
                  B2C Price (Set 0 for B2B Custom Quotation)
                </span>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">
                  PROMOTIONAL PRICE (IDR)
                </label>
                <input
                  type="text"
                  disabled={editingItem.shop_availability_type === "MAKE_TO_ORDER"}
                  value={(() => {
                    if (editingItem.shop_availability_type === "MAKE_TO_ORDER") return "0";
                    const val = editingItem.shop_promo_price;
                    if (val === undefined || val === null || String(val) === "" || isNaN(Number(val))) return "0";
                    const num = typeof val === "number" ? val : parseInt(String(val).replace(/\D/g, ""), 10) || 0;
                    return new Intl.NumberFormat("id-ID").format(num);
                  })()}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, "");
                    const num = clean ? parseInt(clean, 10) : 0;
                    setEditingItem({
                      ...editingItem,
                      shop_promo_price: num,
                    });
                  }}
                  className="w-full text-xs bg-white border border-stone-200 rounded-lg p-2.5 focus:ring-2 focus:ring-stone-400 focus:outline-hidden font-mono disabled:bg-stone-100 disabled:text-stone-400 disabled:cursor-not-allowed"
                  placeholder="0"
                />
                <span className="text-[10px] text-stone-400 mt-1 block">
                  {editingItem.shop_availability_type === "MAKE_TO_ORDER"
                    ? "Disabled for Made to Order (Retail promos only)"
                    : "Set 0 if no active promo"}
                </span>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">
                  UNIT WEIGHT (KG/{editingItem.uom || "PCS"})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={editingItem.shop_weight_kg || 2.5}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      shop_weight_kg: parseFloat(e.target.value) || 2.5,
                    })
                  }
                  className="w-full text-xs bg-white border border-stone-200 rounded-lg p-2.5 focus:ring-2 focus:ring-stone-400 focus:outline-hidden font-mono"
                  placeholder="2.5"
                />
                <span className="text-[10px] text-stone-400 mt-1 block">Used for freight estimation</span>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">
                  MARKETING BADGE
                </label>
                <select
                  value={editingItem.shop_badge || ""}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      shop_badge: e.target.value,
                    })
                  }
                  className="w-full text-xs bg-white border border-stone-200 rounded-lg p-2.5 focus:ring-2 focus:ring-stone-400 focus:outline-hidden"
                >
                  <option value="">No Badge</option>
                  <option value="SNI Certified">SNI Certified</option>
                  <option value="Bestseller">Bestseller</option>
                  <option value="Heavy Duty">Heavy Duty</option>
                  <option value="Custom Press">Custom Press</option>
                  <option value="Top Rated">Top Rated</option>
                </select>
                <span className="text-[10px] text-stone-400 mt-1 block">Showroom promo tag</span>
              </div>
            </div>

            {/* Product Image Uploader with Multi-Photo Gallery Support (>=1 Photo) */}
            <ProductImageUploader
              id="showroom-image-uploader"
              label="PRODUCT GALLERY & PORTFOLIO PHOTOS (MULTI-UPLOAD SUPPORTED >= 1)"
              value={editingItem.shop_image_url || ""}
              galleryUrls={(() => {
                try {
                  if (Array.isArray(editingItem.shop_gallery_urls)) return editingItem.shop_gallery_urls;
                  if (typeof editingItem.shop_gallery_urls === "string") return JSON.parse(editingItem.shop_gallery_urls);
                  return [];
                } catch {
                  return [];
                }
              })()}
              onImagesChange={(primaryUrl, allGalleryUrls) => {
                setEditingItem({
                  ...editingItem,
                  shop_image_url: primaryUrl,
                  shop_gallery_urls: allGalleryUrls,
                });
              }}
              pathPrefix="catalog_products"
            />

            {/* Description & Technical Notes */}
            <div>
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">
                STOREFRONT DESCRIPTION / MATERIAL NOTES
              </label>
              <textarea
                rows={3}
                value={editingItem.description || ""}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    description: e.target.value,
                  })
                }
                placeholder="Compressive strength, application area, laying pattern..."
                className="w-full text-xs bg-white border border-stone-200 rounded-lg p-2.5 focus:ring-2 focus:ring-stone-400 focus:outline-hidden text-stone-800"
              />
            </div>

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingItem}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-brand hover:bg-brand-dark text-white shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSavingItem ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Configuration</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: ORDER DETAILS & ERP HANDOFF */}
      {selectedOrder && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedOrder(null)}
          title={`Order Details: ${selectedOrder.order_number}`}
          maxWidth="2xl"
        >
          <div className="space-y-4 text-xs text-stone-700">
            {/* Header Status Bar */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Order Placed</span>
                <span className="font-bold text-stone-900">
                  {new Date(selectedOrder.created_at).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Payment Status</span>
                <span className="font-bold text-emerald-700">{selectedOrder.payment_status}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Fulfillment Status</span>
                <span className="font-bold text-blue-700">{selectedOrder.order_status.replace("_", " ")}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Grand Total</span>
                <span className="font-black text-stone-900 font-mono text-sm">
                  {formatIDR(selectedOrder.total_amount)}
                </span>
              </div>
            </div>

            {/* Customer & Shipping Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-white rounded-xl border border-stone-200 space-y-1">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Customer</span>
                <div className="font-bold text-stone-900">{selectedOrder.customer_name}</div>
                <div className="text-stone-600 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-stone-400" />
                  <span>{selectedOrder.customer_phone}</span>
                </div>
                {selectedOrder.customer_email && (
                  <div className="text-stone-500">{selectedOrder.customer_email}</div>
                )}
              </div>

              <div className="p-3 bg-white rounded-xl border border-stone-200 space-y-1">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
                  Shipping & Destination
                </span>
                <div className="font-bold text-stone-900">
                  {selectedOrder.delivery_method === "PICKUP" ? "Customer Stockyard Pickup" : "Fleet Delivery"}
                </div>
                <div className="text-stone-600 leading-relaxed">{selectedOrder.delivery_address}</div>
                {selectedOrder.customer_notes && (
                  <div className="text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 text-[11px] mt-2">
                    <span className="font-bold">Note: </span>
                    {selectedOrder.customer_notes}
                  </div>
                )}
              </div>
            </div>

            {/* Payment Verification & Proof (Required except COD) */}
            {selectedOrder.payment_method !== "COD" && (
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                  Payment Verification & Uploaded Proof
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="mb-1">
                      <span className="text-stone-500 font-medium mr-1.5">Tipe Pembayaran:</span>
                      <span className="font-bold text-stone-800">
                        {selectedOrder.is_dp === 1 ? (
                          <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Down Payment (DP) - 50%
                          </span>
                        ) : (
                          <span className="text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Pembayaran Lunas (100%)
                          </span>
                        )}
                      </span>
                    </div>
                    {selectedOrder.is_dp === 1 && (
                      <div className="mt-1.5">
                        <span className="text-stone-500 font-medium mr-1.5">Nilai DP Terbayar:</span>
                        <span className="font-mono font-bold text-stone-900">{formatIDR(selectedOrder.dp_amount || 0)}</span>
                      </div>
                    )}
                    {selectedOrder.delivery_distance ? (
                      <div className="mt-1.5">
                        <span className="text-stone-500 font-medium mr-1.5">Jarak Pengiriman:</span>
                        <span className="font-semibold text-stone-900">{selectedOrder.delivery_distance} km</span>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <span className="text-stone-500 font-medium block mb-1.5">Bukti Transfer / QRIS:</span>
                    {selectedOrder.payment_proof_url ? (
                      <div className="space-y-2">
                        <a
                          href={selectedOrder.payment_proof_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-stone-50 border border-stone-200 text-brand hover:text-brand-dark font-bold text-[11px] transition-colors cursor-pointer shadow-3xs"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Buka Bukti Pembayaran</span>
                        </a>
                        <div className="mt-2 border border-stone-200 rounded-lg overflow-hidden max-w-[120px] aspect-square bg-white flex items-center justify-center">
                          <img
                            src={selectedOrder.payment_proof_url}
                            alt="Bukti Transfer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-stone-400 italic">Bukti transfer belum diunggah</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Line Items Table */}
            <div className="border border-stone-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Item Name</th>
                    <th className="py-2.5 px-3 text-right">Quantity</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {selectedOrder.items?.map((it) => (
                    <tr key={it.id}>
                      <td className="py-2 px-3">
                        <span className="font-bold text-stone-900">{it.item_name}</span>
                        <span className="text-[10px] text-stone-400 block font-mono">{it.item_code}</span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold">
                        {it.qty} {it.uom}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-stone-600">
                        {formatIDR(it.unit_price)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-stone-900">
                        {formatIDR(it.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Status Update & ERP Handoff Actions */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Quick Status:</span>
                {selectedOrder.payment_status !== "PAID" && (
                  <button
                    onClick={() => handleUpdateOrderStatus(selectedOrder.id, "PROCESSING", "PAID")}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                  >
                    Mark as Paid
                  </button>
                )}
                {selectedOrder.order_status !== "COMPLETED" && (
                  <button
                    onClick={() => handleUpdateOrderStatus(selectedOrder.id, "COMPLETED")}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-stone-800 hover:bg-stone-900 text-white shadow-2xs"
                  >
                    Mark Completed
                  </button>
                )}
                {selectedOrder.order_status !== "CANCELLED" && (
                  <button
                    onClick={() => handleUpdateOrderStatus(selectedOrder.id, "CANCELLED")}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to="/deliveries"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Dispatch in Deliveries Module</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
