import { safeFetchJson, apiFetch } from "@/utils/api";
import React, { useState, useEffect, useMemo } from "react";
import { useToast } from "@/contexts/ToastContext";
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  History,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  BarChart2,
  Tag,
  DollarSign,
  Maximize,
  Minimize,
  Plus,
  Trash2,
  Edit,
  Layers,
  DatabaseZap,
  ArrowUpDown,
  ChevronDown,
  X,
  Building2,
  Sparkles,
} from "lucide-react";
import { cn, formatCurrency, parseCurrency, formatIDR } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";

export default function Pricing() {
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<{
    [itemId: string]: any[];
  }>({});
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "ALL" | "NEEDS_PRICE" | "HAS_PRICE"
  >("ALL");
  const [sortBy, setSortBy] = useState<
    "CODE" | "NAME" | "PRICE_ASC" | "PRICE_DESC" | "QUOTES_DESC"
  >("CODE");

  // Modals
  const [historyModal, setHistoryModal] = useState<{
    isOpen: boolean;
    itemId: string | null;
    itemName: string;
    history: any[];
  }>({ isOpen: false, itemId: null, itemName: "", history: [] });
  const [isHistoryFullscreen, setIsHistoryFullscreen] = useState(false);
  const [manageQuotesModal, setManageQuotesModal] = useState<{
    isOpen: boolean;
    item: any | null;
  }>({ isOpen: false, item: null });
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({ isOpen: false, title: "", message: "", action: () => {} });

  // Quote Form
  const [newQuoteSupplierId, setNewQuoteSupplierId] = useState("");
  const [newQuotePrice, setNewQuotePrice] = useState("");
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);
  const [isDeletingQuote, setIsDeletingQuote] = useState(false);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [itemsRes, suppliersRes, pricesRes] = await Promise.all([
        apiFetch("/api/inventory/full", {}, user?.username),
        apiFetch("/api/suppliers", {}, user?.username),
        apiFetch("/api/inventory/supplier-prices", {}, user?.username),
      ]);

      if (itemsRes.ok && Array.isArray(itemsRes.data)) {
        setItems(
          itemsRes.data.filter(
            (item: any) =>
              item.type !== "FINISHED" &&
              item.type !== "FINISH_GOOD" &&
              item.category !== "FG" &&
              !item.item_code?.startsWith("FG-") &&
              !item.item_code?.startsWith("QI-"),
          ),
        );
      } else {
        console.warn("Failed to load inventory items:", itemsRes.error);
      }

      if (suppliersRes.ok && Array.isArray(suppliersRes.data)) {
        setSuppliers(suppliersRes.data);
      } else {
        console.warn("Failed to load suppliers:", suppliersRes.error);
      }

      if (pricesRes.ok && Array.isArray(pricesRes.data)) {
        const pricesByItem: { [key: string]: any[] } = {};
        pricesRes.data.forEach((p: any) => {
          if (!pricesByItem[p.item_id]) pricesByItem[p.item_id] = [];
          pricesByItem[p.item_id].push(p);
        });
        setSupplierPrices(pricesByItem);
      } else {
        console.warn("Failed to load supplier prices:", pricesRes.error);
      }

      if (!itemsRes.ok && !suppliersRes.ok && !pricesRes.ok) {
        showToast("Error fetching pricing data. Please try again.", "error");
      }
    } catch (err) {
      console.error("Pricing fetchData error:", err);
      showToast("Error fetching data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddOrUpdateQuote = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!manageQuotesModal.item) return;
    const itemId = manageQuotesModal.item.id;
    const price = parseCurrency(newQuotePrice);

    if (!price || price <= 0) {
      showToast("Please enter a valid price", "error");
      return;
    }
    if (!newQuoteSupplierId) {
      showToast("Please select a vendor", "error");
      return;
    }

    setIsSubmittingQuote(true);
    try {
      const res = await apiFetch(
        `/api/inventory/items/${itemId}/supplier-prices`,
        {
          method: "PUT",
          body: JSON.stringify({
            unit_price: price,
            supplier_id: newQuoteSupplierId,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Quote added/updated successfully", "success");
        setNewQuotePrice("");
        setNewQuoteSupplierId("");
        await fetchData(); // Refresh all data to get updated quotes
      } else {
        showToast(res.error || "Failed to update quote", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error updating quote", "error");
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  const [isSyncingBOM, setIsSyncingBOM] = useState<string | null>(null);
  const [isSyncingAllBOMs, setIsSyncingAllBOMs] = useState(false);

  const syncItemToBOM = async (item: any) => {
    try {
      setIsSyncingBOM(item.id);
      const res = await apiFetch(
        `/api/inventory/items/${item.id}/sync-bom`,
        { method: "POST" },
        user?.username,
      );
      if (res.ok) {
        showToast(
          `Synced matrix price (${formatIDR(res.data.matrix_price)}) to ${res.data.updated_boms} project BOM(s).`,
          "success",
        );
        fetchData();
      } else {
        showToast(res.error || "Failed to sync price with BOM", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error syncing price to BOM", "error");
    } finally {
      setIsSyncingBOM(null);
    }
  };

  const syncAllMatrixToBOMs = async () => {
    try {
      setIsSyncingAllBOMs(true);
      const res = await apiFetch(
        `/api/inventory/sync-all-matrix-boms`,
        { method: "POST" },
        user?.username,
      );
      if (res.ok) {
        showToast(
          `Connected & synced matrix prices across ${res.data.updated_boms} active project BOM item(s)!`,
          "success",
        );
        fetchData();
      } else {
        showToast(res.error || "Failed to sync matrix prices to BOMs", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error syncing matrix prices to BOMs", "error");
    } finally {
      setIsSyncingAllBOMs(false);
    }
  };

  const handleDeleteQuote = async (itemId: string, supplierId: string) => {
    if (isDeletingQuote) return;
    setIsDeletingQuote(true);
    try {
      const res = await apiFetch(
        `/api/inventory/items/${itemId}/supplier-prices/${supplierId}`,
        {
          method: "DELETE",
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Quote removed successfully", "success");
        await fetchData();
      } else {
        showToast(res.error || "Failed to remove quote", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error removing quote", "error");
    } finally {
      setIsDeletingQuote(false);
    }
  };

  const viewHistory = async (itemId: string, itemName: string) => {
    try {
      const res = await apiFetch(
        `/api/inventory/items/${itemId}/price-history`,
        {},
        user?.username,
      );
      if (res.ok) {
        setHistoryModal({ isOpen: true, itemId, itemName, history: res.data });
      }
    } catch (err) {
      console.error(err);
      showToast("Error fetching history", "error");
    }
  };

  const getLowestPrice = (itemId: string): number | null => {
    const quotes = supplierPrices[itemId];
    if (!quotes || quotes.length === 0) return null;
    let min = Infinity;
    for (const q of quotes) {
      if (typeof q.unit_price === "number" && q.unit_price < min) {
        min = q.unit_price;
      }
    }
    return min === Infinity ? null : min;
  };

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        const query = searchQuery.toLowerCase().trim();
        const matchesSearch =
          !query ||
          item.name?.toLowerCase().includes(query) ||
          item.item_code?.toLowerCase().includes(query);

        const hasPrices =
          supplierPrices[item.id] && supplierPrices[item.id].length > 0;
        const matchesFilter =
          filterStatus === "ALL" ||
          (filterStatus === "NEEDS_PRICE" && !hasPrices) ||
          (filterStatus === "HAS_PRICE" && hasPrices);
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        if (sortBy === "NAME") return (a.name || "").localeCompare(b.name || "");
        if (sortBy === "PRICE_ASC") {
          const pA = getLowestPrice(a.id) ?? Infinity;
          const pB = getLowestPrice(b.id) ?? Infinity;
          return pA - pB;
        }
        if (sortBy === "PRICE_DESC") {
          const pA = getLowestPrice(a.id) ?? -1;
          const pB = getLowestPrice(b.id) ?? -1;
          return pB - pA;
        }
        if (sortBy === "QUOTES_DESC") {
          const qA = supplierPrices[a.id]?.length || 0;
          const qB = supplierPrices[b.id]?.length || 0;
          return qB - qA;
        }
        return (a.item_code || "").localeCompare(b.item_code || "");
      });
  }, [items, searchQuery, filterStatus, sortBy, supplierPrices]);

  const itemsNeedingPrice = useMemo(() => {
    return items.filter((i) => {
      const hasAnyPrice = supplierPrices[i.id] && supplierPrices[i.id].length > 0;
      return !hasAnyPrice;
    }).length;
  }, [items, supplierPrices]);

  const sourcedItemsCount = items.length - itemsNeedingPrice;
  const coveragePercentage =
    items.length > 0 ? Math.round((sourcedItemsCount / items.length) * 100) : 0;

  const totalActiveQuotes = useMemo(() => {
    return Object.values(supplierPrices).reduce(
      (acc, quotes) => acc + (Array.isArray(quotes) ? quotes.length : 0),
      0
    );
  }, [supplierPrices]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const bestPrice = payload[0].payload.lowest_price ?? payload[0].value;
      const actualPrice =
        payload[0].payload.actual_unit_price ?? payload[0].payload.unit_price;
      return (
        <div className="bg-white p-4 border border-stone-100 shadow-xl rounded-xl shrink-0 text-left min-w-[240px]">
          <p className="text-[10px] text-stone-500 font-bold mb-1 uppercase tracking-widest">
            {new Date(label).toLocaleDateString("en-US", {
              timeZone: "Asia/Jakarta",
            })}
          </p>
          <div className="space-y-1.5 mt-2">
            <div>
              <div className="text-[9px] text-emerald-600 font-extrabold uppercase tracking-widest">
                Calculated Best Price
              </div>
              <div className="text-sm font-bold text-emerald-700">
                {formatIDR(bestPrice)}
              </div>
            </div>
            <div className="border-t border-stone-100 pt-1.5">
              <div className="text-[9px] text-stone-400 font-extrabold uppercase tracking-widest">
                Supplier Update
              </div>
              <div className="text-xs font-bold text-stone-900">
                {formatIDR(actualPrice)}
              </div>
              <p className="text-[10px] text-stone-500 font-medium">
                {payload[0].payload.supplier_name}
              </p>
            </div>
          </div>
          <p className="text-[9px] text-stone-400 mt-2.5 pt-1.5 border-t border-stone-100 font-bold uppercase tracking-wider">
            Auth: {payload[0].payload.recorded_by || "System"}
          </p>
        </div>
      );
    }
    return null;
  };

  const openManageQuotes = (item: any) => {
    setManageQuotesModal({ isOpen: true, item });
    setNewQuotePrice("");
    setNewQuoteSupplierId("");
  };

  const closeManageQuotes = () => {
    setManageQuotesModal({ isOpen: false, item: null });
  };

  if (
    !hasPermission(user, Action.VIEW_PRICING) &&
    !hasPermission(user, Action.MANAGE_PRICING) &&
    !hasGodMode(user)
  ) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-stone-900 mb-2">
          Access Denied
        </h2>
        <p className="text-stone-500 max-w-md mx-auto">
          You do not have permission to access the Pricing Matrix.
        </p>
      </div>
    );
  }

  const currentItemQuotes = manageQuotesModal.item
    ? supplierPrices[manageQuotesModal.item.id] || []
    : [];
  // Sort quotes by price asc
  currentItemQuotes.sort((a, b) => a.unit_price - b.unit_price);

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Sourcing & Pricing"
        subtitle="Vendor pricing, market quotes, and item price matrix"
        icon={<Tag className="w-6 h-6" />}
      />

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Total Catalog Items */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/80 shadow-2xs flex items-center gap-3.5 transition-all hover:border-stone-300">
          <div className="w-11 h-11 rounded-xl bg-stone-100/90 text-stone-700 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest truncate">
              Katalog Barang
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight">
              {items.length}
            </div>
            <div className="text-[11px] text-stone-500 font-medium">
              Item terdaftar
            </div>
          </div>
        </div>

        {/* Sourced Items */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/80 shadow-2xs flex items-center gap-3.5 transition-all hover:border-stone-300">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest truncate">
              Sudah Bersumber
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 tracking-tight">
              {sourcedItemsCount}
            </div>
            <div className="text-[11px] text-stone-500 font-medium">
              {coveragePercentage}% cakupan harga
            </div>
          </div>
        </div>

        {/* Needs Sourcing */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/80 shadow-2xs flex items-center gap-3.5 transition-all hover:border-stone-300">
          <div
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
              itemsNeedingPrice > 0
                ? "bg-amber-50 text-amber-600"
                : "bg-emerald-50 text-emerald-600",
            )}
          >
            {itemsNeedingPrice > 0 ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest truncate">
              Perlu Sourcing
            </div>
            <div
              className={cn(
                "text-xl sm:text-2xl font-extrabold tracking-tight",
                itemsNeedingPrice > 0 ? "text-amber-600" : "text-emerald-700",
              )}
            >
              {itemsNeedingPrice}
            </div>
            <div className="text-[11px] text-stone-500 font-medium">
              {itemsNeedingPrice > 0 ? "Belum ada penawaran" : "Semua item siap"}
            </div>
          </div>
        </div>

        {/* Total Active Quotes */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/80 shadow-2xs flex items-center gap-3.5 transition-all hover:border-stone-300">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Tag className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest truncate">
              Penawaran Aktif
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-blue-700 tracking-tight">
              {totalActiveQuotes}
            </div>
            <div className="text-[11px] text-stone-500 font-medium">
              Dari {suppliers.length} vendor rekanan
            </div>
          </div>
        </div>
      </div>

      {/* Elegant Filter & Search Toolbar */}
      <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
        {/* Search input with leading icon and clear button */}
        <div className="relative flex-1 max-w-full xl:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search items by code or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9.5 pr-8 bg-stone-50/70 hover:bg-stone-50 focus:bg-white text-stone-800 placeholder-stone-400 text-xs font-medium rounded-xl border border-stone-200/90 transition-all outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-400/15"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 rounded-md transition-colors"
              title="Hapus pencarian"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Integrated Filter Controls Row in Single Crisp Horizontal Cluster */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 justify-end">
          {/* Status Filter */}
          <div className="relative inline-flex items-center min-w-[135px] sm:min-w-[150px] flex-1 sm:flex-initial">
            <Filter className="absolute left-3 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full h-10 pl-8 pr-7 bg-stone-50/70 hover:bg-stone-100/60 text-stone-700 text-xs font-semibold rounded-xl border border-stone-200/90 transition-all cursor-pointer outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-400/15 appearance-none"
            >
              <option value="ALL">ALL ITEMS ({items.length})</option>
              <option value="NEEDS_PRICE">NEEDS SOURCING ({itemsNeedingPrice})</option>
              <option value="HAS_PRICE">SOURCED ({sourcedItemsCount})</option>
            </select>
            <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
          </div>

          {/* Sort Selector */}
          <div className="relative inline-flex items-center min-w-[130px] sm:min-w-[145px] flex-1 sm:flex-initial">
            <ArrowUpDown className="absolute left-3 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full h-10 pl-8 pr-7 bg-stone-50/70 hover:bg-stone-100/60 text-stone-700 text-xs font-semibold rounded-xl border border-stone-200/90 transition-all cursor-pointer outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-400/15 appearance-none"
            >
              <option value="CODE">SORT: CODE</option>
              <option value="NAME">SORT: NAME</option>
              <option value="PRICE_ASC">SORT: PRICE (LOW)</option>
              <option value="PRICE_DESC">SORT: PRICE (HIGH)</option>
              <option value="QUOTES_DESC">SORT: MOST QUOTES</option>
            </select>
            <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
          </div>

          {/* Separator on desktop */}
          <div className="hidden sm:block h-6 w-[1px] bg-stone-200 mx-0.5 shrink-0" />

          {/* Sync All Matrix Prices to BOM Button */}
          <button
            onClick={syncAllMatrixToBOMs}
            disabled={isSyncingAllBOMs}
            className={cn(
              "h-10 px-3.5 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 shadow-2xs active:scale-[0.98]",
              isSyncingAllBOMs
                ? "bg-emerald-50 border-emerald-300 text-emerald-700 opacity-75 cursor-not-allowed"
                : "bg-emerald-50/80 hover:bg-emerald-100 border-emerald-200/90 text-emerald-700 hover:border-emerald-300",
            )}
            title="Sync all matrix prices to active project BOMs"
          >
            <DatabaseZap
              className={cn(
                "w-3.5 h-3.5 text-emerald-600",
                isSyncingAllBOMs && "animate-pulse",
              )}
            />
            <span className="hidden md:inline font-bold">Sync BOMs</span>
          </button>

          {/* Refresh Data Button */}
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-stone-200/90 bg-stone-50/70 hover:bg-stone-100 text-stone-600 hover:text-stone-900 transition-all shadow-2xs shrink-0 active:scale-[0.98] disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw
              className={cn(
                "w-3.5 h-3.5",
                isLoading && "animate-spin text-stone-800",
              )}
            />
          </button>
        </div>
      </div>

      {/* Active Filter Helper Bar (if filtered) */}
      {(searchQuery || filterStatus !== "ALL") && (
        <div className="flex items-center justify-between px-1 text-xs text-stone-500 font-medium">
          <span>
            Menampilkan <strong className="text-stone-900">{filteredItems.length}</strong> dari {items.length} item katalog
          </span>
          <button
            onClick={() => {
              setSearchQuery("");
              setFilterStatus("ALL");
            }}
            className="text-stone-600 hover:text-stone-950 font-semibold underline underline-offset-2 transition-colors cursor-pointer"
          >
            Reset filter
          </button>
        </div>
      )}

      {/* Pricing Matrix Table Card */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="py-24 text-center text-stone-400 font-medium">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-stone-400" />
            Loading pricing matrix...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-state m-8 py-16 text-center animate-in fade-in duration-300">
            <Package className="w-10 h-10 text-stone-300 mx-auto mb-3" />
            <div className="text-sm font-bold text-stone-700 mb-1">
              Tidak Ada Item Ditemukan
            </div>
            <p className="text-xs text-stone-400 max-w-sm mx-auto mb-4">
              Tidak ada data yang cocok dengan kriteria pencarian atau status filter saat ini.
            </p>
            {(searchQuery || filterStatus !== "ALL") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilterStatus("ALL");
                }}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Reset Pencarian & Filter
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-stone-50/90 border-b border-stone-200 text-stone-500 text-[10px] font-bold uppercase tracking-widest">
                  <th className="px-6 py-4">Item Details</th>
                  <th className="px-6 py-4">Status Sourcing</th>
                  <th className="px-6 py-4">Best Ref. Price</th>
                  <th className="px-6 py-4">Active Quotes</th>
                  <th className="px-6 py-4">BOM Linkage</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredItems.map((item) => {
                  const itemQuotes = supplierPrices[item.id] || [];
                  const sortedQuotes = [...itemQuotes].sort(
                    (a, b) => a.unit_price - b.unit_price,
                  );
                  const bestQuote =
                    sortedQuotes.length > 0 ? sortedQuotes[0] : null;

                  return (
                    <tr
                      key={item.id}
                      className="group hover:bg-stone-50/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3.5">
                          <div
                            className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                              bestQuote
                                ? "bg-emerald-50/70 border-emerald-100 text-emerald-600"
                                : "bg-stone-100 border-stone-200/60 text-stone-400",
                            )}
                          >
                            {bestQuote ? (
                              <CheckCircle2 className="w-5 h-5" />
                            ) : (
                              <Package className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded border border-stone-200/60 uppercase">
                                {item.item_code}
                              </span>
                            </div>
                            <div className="text-sm font-semibold text-stone-900 group-hover:text-stone-950 transition-colors">
                              {item.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-middle">
                        {bestQuote ? (
                          <span className="px-2.5 py-1 rounded-lg text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70 uppercase tracking-wider inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Sourced
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200/70 uppercase tracking-wider inline-flex items-center gap-1.5">
                            <AlertTriangle className="w-3 h-3 text-amber-600" /> Needs Price
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 align-middle">
                        {bestQuote ? (
                          <div>
                            <div className="text-sm font-bold text-stone-900 tracking-tight">
                              {formatIDR(bestQuote.unit_price)}
                            </div>
                            <div className="text-[11px] text-stone-500 font-medium mt-0.5 max-w-[180px] truncate flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-stone-400 shrink-0" />
                              <span className="truncate">{bestQuote.supplier_name}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs font-medium text-stone-400 italic">
                            Belum ada harga
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 align-middle">
                        <button
                          onClick={() => openManageQuotes(item)}
                          className="group/q inline-flex items-center gap-1.5 text-xs font-bold text-stone-700 hover:text-stone-950 transition-colors"
                          title="Lihat penawaran vendor"
                        >
                          <span className="px-2 py-0.5 rounded-md bg-stone-100 group-hover/q:bg-stone-200 border border-stone-200/60 font-mono text-[11px]">
                            {itemQuotes.length}
                          </span>
                          <span className="text-[11px] text-stone-500 group-hover/q:text-stone-800">
                            {itemQuotes.length === 1 ? "quote" : "quotes"}
                          </span>
                        </button>
                      </td>
                      <td className="px-6 py-4 align-middle">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 border",
                              (item.bom_projects_count || 0) > 0
                                ? "bg-blue-50 text-blue-700 border-blue-200/70"
                                : "bg-stone-100 text-stone-500 border-stone-200/60",
                            )}
                          >
                            <Layers className="w-3 h-3" />
                            {(item.bom_projects_count || 0) > 0
                              ? `${item.bom_projects_count} Active BOMs`
                              : "Unlinked"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {bestQuote && (
                            <button
                              onClick={() => syncItemToBOM(item)}
                              disabled={isSyncingBOM === item.id}
                              className="p-2 text-emerald-600 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl transition-all shadow-2xs active:scale-95"
                              title="Sync Harga Matriks ke BOM Proyek"
                            >
                              <DatabaseZap
                                className={cn(
                                  "w-3.5 h-3.5",
                                  isSyncingBOM === item.id && "animate-pulse",
                                )}
                              />
                            </button>
                          )}
                          <button
                            onClick={() => viewHistory(item.id, item.name)}
                            className="p-2 text-stone-500 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200/80 rounded-xl transition-all shadow-2xs active:scale-95"
                            title="Riwayat Fluktuasi Harga"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openManageQuotes(item)}
                            className="h-8 px-3 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition-all flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer ml-1"
                          >
                            <DollarSign className="w-3.5 h-3.5 text-stone-400" />
                            <span>Set Price</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manage Quotes Modal */}
      <Modal
        isOpen={manageQuotesModal.isOpen}
        onClose={closeManageQuotes}
        title={
          <div>
            <div className="text-xl font-bold text-stone-900 tracking-tight">
              Manage Vendor Quotes
            </div>
            <div className="text-sm text-stone-500 font-medium mt-1">
              <span className="font-bold">
                {manageQuotesModal.item?.item_code}
              </span>{" "}
              &bull; {manageQuotesModal.item?.name}
            </div>
          </div>
        }
        maxWidth="3xl"
        contentClassName="p-0 border-t border-stone-100"
      >
        <div className="flex flex-col md:flex-row h-full md:max-h-[70vh]">
          {/* Add Quote Form */}
          <div className="w-full md:w-2/5 p-6 bg-stone-50 border-r border-stone-100">
            <h4 className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" /> Add New Quote
            </h4>
            <form onSubmit={handleAddOrUpdateQuote} className="space-y-5">
              <Select
                label="Vendor / Supplier"
                value={newQuoteSupplierId}
                onChange={(e) => setNewQuoteSupplierId(e.target.value)}
                required
              >
                <option value="">Select a vendor...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>

              <Input
                label="Unit Price (IDR)"
                icon={<span className="text-[10px] font-bold text-stone-500">IDR</span>}
                required
                value={formatCurrency(newQuotePrice)}
                onChange={(e) =>
                  setNewQuotePrice(e.target.value.replace(/[^\d]/g, ""))
                }
                placeholder="0"
                className="text-right font-bold"
              />

              <Button
                type="submit"
                disabled={
                  isSubmittingQuote || !newQuotePrice || !newQuoteSupplierId
                }
                isLoading={isSubmittingQuote}
                className="w-full"
              >
                Save Quote
              </Button>
            </form>
          </div>

          {/* Active Quotes List */}
          <div className="w-full md:w-3/5 p-6 bg-white overflow-y-auto custom-scrollbar flex flex-col">
            <h4 className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-6 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" /> Active Quotes (
              {currentItemQuotes.length})
            </h4>

            {currentItemQuotes.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-stone-400 opacity-60 min-h-[200px]">
                <Package className="w-12 h-12 mb-4" />
                <p className="font-medium text-sm">
                  No active quotes for this item.
                </p>
              </div>
            ) : (
              <div className="space-y-3 pr-2">
                {currentItemQuotes.map((quote, idx) => {
                  const isBest = idx === 0;
                  return (
                    <div
                      key={quote.supplier_id}
                      className={cn(
                        "group relative p-4 rounded-2xl border transition-all flex justify-between items-center",
                        isBest
                          ? "border-emerald-200 bg-emerald-50/30"
                          : "border-stone-100 bg-white hover:border-stone-300 hover:shadow-sm",
                      )}
                    >
                      <div>
                        {isBest && (
                          <div className="mb-2 w-fit px-2 py-0.5 rounded text-[8px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-widest flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Best Price
                          </div>
                        )}
                        <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1 leading-tight">
                          {quote.supplier_name}
                        </div>
                        <div
                          className={cn(
                            "text-lg font-bold tracking-tight leading-none",
                            isBest ? "text-emerald-950" : "text-stone-900",
                          )}
                        >
                          {formatIDR(quote.unit_price)}
                        </div>
                        {quote.updated_at && (
                          <div className="text-[9px] text-stone-400 mt-2 font-bold">
                            Updated:{" "}
                            {new Date(quote.updated_at).toLocaleDateString([], {
                              timeZone: "Asia/Jakarta",
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <button
                          onClick={() => {
                            setNewQuoteSupplierId(quote.supplier_id);
                            setNewQuotePrice(String(quote.unit_price));
                          }}
                          className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                          title="Edit Quote"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: "Remove Quote",
                              message: `Are you sure you want to remove the quote of ${formatIDR(quote.unit_price)} from ${quote.supplier_name}?`,
                              action: () =>
                                handleDeleteQuote(
                                  manageQuotesModal.item.id,
                                  quote.supplier_id,
                                ),
                            });
                          }}
                          className="p-2 text-stone-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove Quote"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={() => {
          confirmModal.action();
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Confirm"
        isDestructive={true}
      />

      {/* History Modal */}
      <Modal
        isOpen={historyModal.isOpen}
        onClose={() => {
          setHistoryModal({
            isOpen: false,
            itemId: null,
            itemName: "",
            history: [],
          });
          setIsHistoryFullscreen(false);
        }}
        maxWidth={isHistoryFullscreen ? "full" : "4xl"}
        className={isHistoryFullscreen ? "max-h-[calc(100vh-2rem)] h-full" : ""}
        contentClassName="p-0 flex flex-col min-h-0"
        title={
          <div className="flex justify-between items-start w-full pr-4">
            <div>
              <h3 className="text-xl font-bold text-stone-900 tracking-tight">
                Market Price Fluctuation
              </h3>
              <p className="text-stone-500 font-medium text-sm mt-1 flex items-center gap-2">
                <Package className="w-4 h-4" /> {historyModal.itemName}
              </p>
            </div>
            <button
              onClick={() => setIsHistoryFullscreen(!isHistoryFullscreen)}
              className="mt-1 text-stone-500 hover:text-stone-900 bg-white shadow-sm p-2 rounded-xl transition-all hover:scale-105 active:scale-95 border border-stone-200"
              title={
                isHistoryFullscreen ? "Exit Fullscreen" : "Fullscreen History"
              }
            >
              {isHistoryFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>
          </div>
        }
      >
        <div className="p-8 overflow-y-auto bg-stone-50/30 flex-1 min-h-0 custom-scrollbar">
          {historyModal.history.length === 0 ? (
            <div className="text-center text-stone-400 py-20 font-medium flex flex-col items-center">
              <BarChart2 className="w-12 h-12 text-stone-400 mb-4" />
              No historical quotation data available for building trend lines.
            </div>
          ) : (
            <div className="space-y-8 flex flex-col h-full">
              <div className="h-[300px] shrink-0 w-full bg-white p-6 rounded-3xl border border-stone-100 shadow-sm relative overflow-x-auto custom-scrollbar">
                <div className="min-w-[700px] h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={historyModal.history.slice().reverse()}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#E7E5E4"
                      />
                      <XAxis
                        dataKey="created_at"
                        tickFormatter={(val) =>
                          new Date(val).toLocaleDateString([], {
                            timeZone: "Asia/Jakarta",
                            month: "short",
                            day: "numeric",
                          })
                        }
                        stroke="#A8A29E"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                      />
                      <YAxis
                        stroke="#A8A29E"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) => `Rp${val / 1000}k`}
                        dx={-10}
                      />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend
                        iconType="circle"
                        wrapperStyle={{ fontSize: "10px", fontWeight: "bold" }}
                      />
                      <Line
                        type="monotone"
                        name="Best Active Price (IDR)"
                        dataKey="lowest_price"
                        stroke="#16a34a"
                        strokeWidth={3}
                        dot={{
                          r: 4,
                          fill: "#16a34a",
                          strokeWidth: 2,
                          stroke: "#FFFFFF",
                        }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="flex-1 min-h-0 flex flex-col">
                <h4 className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-4 px-2 shrink-0">
                  Detailed Log
                </h4>
                <div className="overflow-x-auto custom-scrollbar flex-1">
                  <div className="space-y-3 min-w-[700px] px-1 pb-6">
                    {historyModal.history.map((record, idx) => {
                      const isLatest = idx === 0;
                      const actualPrice =
                        record.actual_unit_price ?? record.unit_price;
                      const prevPrice =
                        idx < historyModal.history.length - 1
                          ? (historyModal.history[idx + 1].actual_unit_price ??
                            historyModal.history[idx + 1].unit_price)
                          : null;
                      const diff =
                        prevPrice !== null ? actualPrice - prevPrice : 0;

                      return (
                        <div
                          key={idx}
                          className={cn(
                            "bg-white border rounded-2xl p-5 flex items-center justify-between transition-all",
                            isLatest
                              ? "border-stone-400 shadow-md ring-1 ring-stone-900/5"
                              : "border-stone-100 shadow-sm opacity-80",
                          )}
                        >
                          <div className="flex gap-4 items-center">
                            <div
                              className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-[10px]",
                                prevPrice !== null && diff > 0
                                  ? "bg-red-50 text-red-600"
                                  : prevPrice !== null && diff < 0
                                    ? "bg-emerald-50 text-emerald-600"
                                    : "bg-stone-50 text-stone-400",
                              )}
                            >
                              {prevPrice !== null && diff > 0 ? (
                                <TrendingUp className="w-5 h-5" />
                              ) : prevPrice !== null && diff < 0 ? (
                                <TrendingDown className="w-5 h-5" />
                              ) : (
                                <BarChart2 className="w-5 h-5" />
                              )}
                            </div>
                            <div>
                              <div className="text-[10px] font-bold text-stone-950 uppercase tracking-widest mb-1">
                                {record.supplier_name}
                              </div>
                              <div className="text-lg font-bold text-stone-900 leading-none">
                                {formatIDR(actualPrice)}
                              </div>
                              {prevPrice !== null && (
                                <div
                                  className={cn(
                                    "text-[9px] font-bold mt-1.5",
                                    diff > 0
                                      ? "text-red-500"
                                      : diff < 0
                                        ? "text-emerald-500"
                                        : "text-stone-400",
                                  )}
                                >
                                  {diff > 0
                                    ? `▲ +${formatIDR(diff)}`
                                    : diff < 0
                                      ? `▼ -${formatIDR(Math.abs(diff))}`
                                      : "■ No change"}{" "}
                                  from last recorded quote
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-stone-500 font-bold">
                              {new Date(record.created_at).toLocaleDateString(
                                [],
                                {
                                  timeZone: "Asia/Jakarta",
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </div>
                            <div className="text-[9px] text-stone-500 font-bold uppercase tracking-widest mt-1.5 bg-stone-50 inline-block px-2 py-0.5 rounded-sm">
                              Auth: {record.recorded_by || "System"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
