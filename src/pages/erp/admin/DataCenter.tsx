import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Search,
  Database,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  Briefcase,
  ShoppingCart,
  Activity,
  RefreshCw,
  Scan,
  Clock,
  ArrowRight,
  CornerDownRight,
  CheckCircle,
  Package,
  FileText,
  Truck,
  Receipt,
  Calendar,
  DollarSign,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { motion, AnimatePresence } from "motion/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { lazy, Suspense } from "react";

const ScannerModal = lazy(() => import("@/components/shared/ScannerModal").then(m => ({ default: m.ScannerModal })));

import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/utils";

export default function DataCenter() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(),
  );
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  const location = useLocation();
  const navigate = useNavigate();

  const toggleDocExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(expandedDocs);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedDocs(newSet);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("q") || "";
    setQuery(q);
    performSearch(q);
  }, [location.search]);

  const performSearch = async (searchTerm: string) => {
    setIsSearching(true);
    try {
      const res = await apiFetch(
        `/api/datacenter/master-trace?q=${encodeURIComponent(searchTerm)}`,
      );
      if (res.ok) {
        const hits = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setResults(hits);
        // Expand all if searching
        if (searchTerm.length >= 2) {
          const ids = new Set(hits.map((p: any) => p.id));
          setExpandedProjects(ids as any);
        } else {
          setExpandedProjects(new Set());
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      const params = new URLSearchParams(location.search);
      const urlQ = params.get("q") || "";
      if (query !== urlQ) {
        navigate(
          query
            ? `/data-center?q=${encodeURIComponent(query)}`
            : "/data-center",
          { replace: true },
        );
      }
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [query, navigate, location.search]);

  const handleScanSuccess = (decodedText: string) => {
    let finalQuery = decodedText;
    try {
      if (decodedText.startsWith("http")) {
        const url = new URL(decodedText);
        const qParam = url.searchParams.get("q");
        if (qParam) finalQuery = qParam;
      }
    } catch (e) {}

    setQuery(finalQuery);
    navigate(`/data-center?q=${encodeURIComponent(finalQuery)}`, {
      replace: true,
    });
    setIsScannerOpen(false);
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedProjects);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedProjects(newSet);
  };

  return (
    <div className="space-y-12 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Master Data Hub"
        subtitle="Master records and data lineage"
        icon={<Database className="w-6 h-6" />}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/import")}
              className="px-6 py-3 bg-white border border-stone-200 text-stone-700 text-sm font-bold rounded-2xl hover:bg-stone-50 transition-all active:scale-95 flex items-center gap-2 shadow-sm"
            >
              <Database className="w-5 h-5" />
              <span className="hidden md:inline">Import Master Data</span>
            </button>
            <button
              onClick={() => setIsScannerOpen(true)}
              className="px-8 py-3 bg-stone-800 text-white text-sm font-bold rounded-2xl hover:bg-stone-900 transition-all active:scale-95 flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Scan className="w-5 h-5" />
              <span className="hidden md:inline">Scan Code</span>
            </button>
          </div>
        }
      />

      <div className="flex flex-col md:flex-row items-center gap-4 border-b border-stone-100 pb-8">
        <div className="flex items-center shadow-sm rounded-2xl bg-white border border-stone-200 overflow-hidden w-full lg:w-96 hover:border-stone-300 focus-within:ring-4 focus-within:ring-stone-900/5 focus-within:border-stone-900 transition-all">
          <div className="pl-4 text-stone-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search doc PR, PO, GRN..."
            className="w-full bg-transparent border-none text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-0 px-3 py-3 text-sm font-bold"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                navigate("/data-center");
              }}
              className="p-1.5 hover:bg-stone-50 text-stone-400 hover:text-stone-600 transition-colors mr-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <AnimatePresence mode="wait">
          {isSearching ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 bg-white/50 border border-stone-200/50 rounded-3xl"
            >
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                Tracing System Ledger...
              </span>
            </motion.div>
          ) : results.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-white border border-stone-200 rounded-3xl p-16 text-center shadow-sm"
            >
              <div className="w-16 h-16 bg-stone-50 rounded-2xl border border-stone-100 flex items-center justify-center mx-auto mb-6">
                <Database className="w-6 h-6 text-stone-300" />
              </div>
              <h4 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-2">
                No trace records found
              </h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
                We couldn't find any supply chain lineage matching your query.
                Try scanning a bar/QR code on materials or adjust search
                filters.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="card-elegant rounded-3xl overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200">
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-500">
                        Project / Identity
                      </th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-500">
                        Trace Activity
                      </th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-500">
                        Status
                      </th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-500">
                        BOM Count
                      </th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-500 text-right">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {results.map((proj) => {
                      const isExpanded = expandedProjects.has(proj.id);
                      const numPrs = proj.prs?.length || 0;
                      const numPos = proj.pos?.length || 0;
                      const numGrns = proj.grns?.length || 0;

                      return (
                        <React.Fragment key={proj.id}>
                          <tr
                            onClick={() => toggleExpand(proj.id)}
                            className="hover:bg-stone-50/40 transition-colors group cursor-pointer"
                          >
                            <td className="px-8 py-5 align-middle">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-center shrink-0">
                                  <Briefcase className="w-4 h-4 text-stone-500" />
                                </div>
                                <div className="min-w-0">
                                  <span className="font-bold text-stone-900 text-sm truncate block">
                                    {proj.id}
                                  </span>
                                  <div className="text-[10px] text-stone-500 font-bold uppercase tracking-wider truncate max-w-[220px]">
                                    {proj.name}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-5 align-middle">
                              <div className="flex items-center gap-4">
                                {numPrs > 0 && (
                                  <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                    <span className="text-[10px] font-bold text-blue-700 uppercase">
                                      {numPrs} PR
                                    </span>
                                  </div>
                                )}
                                {numPos > 0 && (
                                  <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-lg">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    <span className="text-[10px] font-bold text-amber-700 uppercase">
                                      {numPos} PO
                                    </span>
                                  </div>
                                )}
                                {numGrns > 0 && (
                                  <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-100 px-2.5 py-1 rounded-lg">
                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                                    <span className="text-[10px] font-bold text-teal-700 uppercase">
                                      {numGrns} GRN
                                    </span>
                                  </div>
                                )}
                                {numPrs === 0 &&
                                  numPos === 0 &&
                                  numGrns === 0 && (
                                    <span className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">
                                      No activity logs
                                    </span>
                                  )}
                              </div>
                            </td>
                            <td className="px-8 py-5 align-middle">
                              <span
                                className={cn(
                                  "inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border",
                                  proj.status === "ACTIVE"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                    : proj.status === "FINISHED"
                                      ? "bg-blue-50 text-blue-700 border-blue-100"
                                      : proj.status === "CANCELLED"
                                        ? "bg-rose-50 text-rose-700 border-rose-100"
                                        : "bg-stone-50 text-stone-700 border-stone-200",
                                )}
                              >
                                {proj.status}
                              </span>
                            </td>
                            <td className="px-8 py-5 align-middle">
                              <span className="text-xs font-bold text-stone-700">
                                {proj.bom_count || 0} Components
                              </span>
                            </td>
                            <td className="px-8 py-5 align-middle text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpand(proj.id);
                                }}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-stone-50 hover:bg-stone-100 text-stone-500 hover:text-stone-900 transition-colors border border-stone-200/50"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded lineage panel with modern clean horizontal stepper layout */}
                          {isExpanded && (
                            <tr className="bg-stone-50/20">
                              <td
                                colSpan={5}
                                className="px-8 py-8 border-b border-stone-100 bg-stone-50/10"
                              >
                                <div className="space-y-6">
                                  {/* MASTER ERP LINEAGE METRICS */}
                                  <div className="bg-white p-6 rounded-3xl border border-stone-200/90 shadow-3xs space-y-6">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-stone-100">
                                      <div>
                                        <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                                          End-to-End Operational Lineage Ledger
                                        </h4>
                                        <p className="text-[10px] text-stone-500 font-medium mt-1">
                                          Real-time trace integrity from initial
                                          Sales Quotation down to Commercial
                                          Invoice billing.
                                        </p>
                                      </div>
                                      <span className="text-[10px] text-stone-500 font-bold bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-xl uppercase tracking-[0.1em]">
                                        Linked Status Traceability
                                      </span>
                                    </div>

                                    {/* 6-Step Visual Bento Process Map */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                                      {/* STEP 1: QUOTATION */}
                                      <div
                                        className={cn(
                                          "p-4 rounded-2xl border text-xs transition-all flex flex-col justify-between space-y-3 shadow-3xs",
                                          proj.quotation
                                            ? "bg-emerald-50/15 border-emerald-200/60"
                                            : "bg-stone-50/20 border-stone-250/50",
                                        )}
                                      >
                                        <div className="space-y-1.5">
                                          <div className="flex justify-between items-start">
                                            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">
                                              1. Quotation
                                            </span>
                                            {proj.quotation ? (
                                              <span className="bg-emerald-50 text-emerald-700 text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase">
                                                Linked
                                              </span>
                                            ) : (
                                              <span className="bg-stone-100 text-stone-500 text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase">
                                                Pending
                                              </span>
                                            )}
                                          </div>
                                          {proj.quotation ? (
                                            <div className="space-y-1 text-stone-800">
                                              <div className="font-bold font-mono text-stone-900 truncate">
                                                {
                                                  proj.quotation
                                                    .quotation_number
                                                }
                                              </div>
                                              <div className="text-[9px] font-bold text-stone-600 truncate">
                                                {proj.quotation.title}
                                              </div>
                                              <div className="text-[9px] text-stone-500 font-medium truncate">
                                                Client:{" "}
                                                {proj.quotation.customer_name}
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="text-[9px] text-stone-400 font-medium">
                                              No associated sales quotation was
                                              found.
                                            </div>
                                          )}
                                        </div>
                                        {proj.quotation && (
                                          <div className="text-[10px] font-mono font-bold text-stone-600 bg-emerald-50/45 px-2 py-1 rounded w-fit mt-1">
                                            {formatIDR(
                                              proj.quotation.amount || 0,
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {/* STEP 2: NOTICE TO PROCEED (NTP) */}
                                      <div
                                        className={cn(
                                          "p-4 rounded-2xl border text-xs transition-all flex flex-col justify-between space-y-3 shadow-3xs",
                                          proj.ntp
                                            ? "bg-emerald-50/15 border-emerald-200/60"
                                            : "bg-stone-50/20 border-stone-250/50",
                                        )}
                                      >
                                        <div className="space-y-1.5">
                                          <div className="flex justify-between items-start">
                                            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">
                                              2. Notice to Proceed (NTP)
                                            </span>
                                            {proj.ntp ? (
                                              <span className="bg-emerald-50 text-emerald-700 text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase font-mono">
                                                Released
                                              </span>
                                            ) : (
                                              <span className="bg-stone-100 text-stone-500 text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase font-mono">
                                                Pending
                                              </span>
                                            )}
                                          </div>
                                          {proj.ntp ? (
                                            <div className="space-y-1 text-stone-800">
                                              <div className="font-bold font-mono text-stone-900 truncate">
                                                {proj.ntp.ntp_number}
                                              </div>
                                              <div className="text-[9px] text-stone-500 font-medium font-mono">
                                                Issued:{" "}
                                                {new Date(
                                                  proj.ntp.created_at,
                                                ).toLocaleDateString("en-US", {
                                                  timeZone: "Asia/Jakarta",
                                                })}
                                              </div>
                                              <div className="text-[8px] text-stone-400 uppercase font-bold tracking-wider mt-1">
                                                OFFICIAL DOCUMENT
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="text-[9px] text-stone-400 font-medium">
                                              Awaiting Notice to Proceed (NTP)
                                              authorization.
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* STEP 3: MANUFACTURING / PURCHASING */}
                                      <div
                                        className={cn(
                                          "p-4 rounded-2xl border text-xs transition-all flex flex-col justify-between space-y-3 shadow-3xs",
                                          (proj.prs?.length || 0) > 0
                                            ? "bg-emerald-50/15 border-emerald-200/60"
                                            : "bg-stone-50/20 border-stone-250/50",
                                        )}
                                      >
                                        <div className="space-y-1.5">
                                          <div className="flex justify-between items-start">
                                            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">
                                              3. Materials
                                            </span>
                                            {(proj.prs?.length || 0) > 0 ? (
                                              <span className="bg-emerald-50 text-emerald-700 text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase">
                                                Procuring
                                              </span>
                                            ) : (
                                              <span className="bg-stone-100 text-stone-500 text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase">
                                                None
                                              </span>
                                            )}
                                          </div>
                                          <div className="space-y-1 font-mono text-[9px] text-stone-600 font-bold">
                                            <div className="flex justify-between items-center text-stone-700">
                                              <span>Requisitions:</span>
                                              <span className="text-stone-900">
                                                {proj.prs?.length || 0} PR
                                              </span>
                                            </div>
                                            <div className="flex justify-between items-center text-stone-700">
                                              <span>Purchases:</span>
                                              <span className="text-stone-900">
                                                {proj.pos?.length || 0} PO
                                              </span>
                                            </div>
                                            <div className="flex justify-between items-center text-stone-700">
                                              <span>Receipts:</span>
                                              <span className="text-stone-900">
                                                {proj.grns?.length || 0} GRN
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* STEP 4: FINISHED GOODS */}
                                      <div
                                        className={cn(
                                          "p-4 rounded-2xl border text-xs transition-all flex flex-col justify-between space-y-3 shadow-3xs",
                                          proj.finished_goods &&
                                            proj.finished_goods.length > 0
                                            ? "bg-emerald-50/15 border-emerald-200/60"
                                            : "bg-stone-50/20 border-stone-250/50",
                                        )}
                                      >
                                        <div className="space-y-1.5">
                                          <div className="flex justify-between items-start">
                                            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">
                                              4. Finished Goods
                                            </span>
                                            {proj.finished_goods &&
                                            proj.finished_goods.length > 0 ? (
                                              <span className="bg-emerald-50 text-emerald-700 text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase">
                                                Recorded
                                              </span>
                                            ) : (
                                              <span className="bg-stone-100 text-stone-500 text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase">
                                                Awaiting
                                              </span>
                                            )}
                                          </div>
                                          {proj.finished_goods &&
                                          proj.finished_goods.length > 0 ? (
                                            <div className="space-y-1 text-stone-805 font-sans">
                                              <div className="font-bold font-mono text-stone-900 truncate">
                                                {proj.finished_goods[0]
                                                  .item_code ||
                                                  proj.finished_goods[0].id}
                                              </div>
                                              <div className="text-[9px] text-stone-600 truncate font-semibold">
                                                {
                                                  proj.finished_goods[0]
                                                    .item_name
                                                }
                                              </div>
                                              <div className="text-[9px] font-bold text-emerald-800 bg-emerald-50/50 px-1.5 py-0.5 rounded w-fit mt-1">
                                                Produced:{" "}
                                                {proj.finished_goods[0]
                                                  .free_stock ||
                                                  proj.finished_goods[0].qty ||
                                                  0}{" "}
                                                units
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="text-[9px] text-stone-400 font-medium font-sans">
                                              No production outputs registered.
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* STEP 5: DELIVERY NOTE */}
                                      <div
                                        className={cn(
                                          "p-4 rounded-2xl border text-xs transition-all flex flex-col justify-between space-y-3 shadow-3xs",
                                          proj.delivery_notes &&
                                            proj.delivery_notes.length > 0
                                            ? "bg-emerald-50/15 border-emerald-200/60"
                                            : "bg-stone-50/20 border-stone-250/50",
                                        )}
                                      >
                                        <div className="space-y-1.5">
                                          <div className="flex justify-between items-start">
                                            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">
                                              5. Delivery Note
                                            </span>
                                            {proj.delivery_notes &&
                                            proj.delivery_notes.length > 0 ? (
                                              <span className="bg-emerald-50 text-emerald-700 text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase">
                                                Shipped
                                              </span>
                                            ) : (
                                              <span className="bg-stone-100 text-stone-500 text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase">
                                                Awaiting
                                              </span>
                                            )}
                                          </div>
                                          {proj.delivery_notes &&
                                          proj.delivery_notes.length > 0 ? (
                                            <div className="space-y-1 text-stone-800">
                                              <div className="font-bold font-mono text-stone-900 truncate">
                                                {
                                                  proj.delivery_notes[0]
                                                    .delivery_note_number
                                                }
                                              </div>
                                              <div className="text-[9px] text-stone-500 font-medium font-mono">
                                                Sent:{" "}
                                                {new Date(
                                                  proj.delivery_notes[0]
                                                    .created_at ||
                                                    proj.delivery_notes[0]
                                                      .delivery_date,
                                                ).toLocaleDateString("en-US", {
                                                  timeZone: "Asia/Jakarta",
                                                })}
                                              </div>
                                              <div className="text-[9px] text-stone-600 truncate font-semibold">
                                                Recipient:{" "}
                                                {proj.delivery_notes[0]
                                                  .recipient_name || "N/A"}
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="text-[9px] text-stone-400 font-medium">
                                              No shipping records verified.
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* STEP 6: COMMERCIAL INVOICE */}
                                      <div
                                        className={cn(
                                          "p-4 rounded-2xl border text-xs transition-all flex flex-col justify-between space-y-3 shadow-3xs",
                                          proj.commercial_invoices &&
                                            proj.commercial_invoices.length > 0
                                            ? "bg-emerald-50/15 border-emerald-200/60"
                                            : "bg-stone-50/20 border-stone-250/50",
                                        )}
                                      >
                                        <div className="space-y-1.5">
                                          <div className="flex justify-between items-start">
                                            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">
                                              6. Invoice
                                            </span>
                                            {proj.commercial_invoices &&
                                            proj.commercial_invoices.length >
                                              0 ? (
                                              <span
                                                className={cn(
                                                  "text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase",
                                                  proj.commercial_invoices[0]
                                                    .status === "PAID"
                                                    ? "bg-emerald-100 text-emerald-800"
                                                    : "bg-amber-100 text-amber-800",
                                                )}
                                              >
                                                {
                                                  proj.commercial_invoices[0]
                                                    .status
                                                }
                                              </span>
                                            ) : (
                                              <span className="bg-stone-100 text-stone-500 text-[8px] px-1.5 py-0.5 rounded font-extrabold uppercase">
                                                Unbilled
                                              </span>
                                            )}
                                          </div>
                                          {proj.commercial_invoices &&
                                          proj.commercial_invoices.length >
                                            0 ? (
                                            <div className="space-y-1 text-stone-800">
                                              <div className="font-bold font-mono text-stone-900 truncate">
                                                {
                                                  proj.commercial_invoices[0]
                                                    .invoice_number
                                                }
                                              </div>
                                              <div className="text-[9px] text-stone-550 font-mono font-medium">
                                                Due:{" "}
                                                {new Date(
                                                  proj.commercial_invoices[0]
                                                    .due_date,
                                                ).toLocaleDateString("en-US", {
                                                  timeZone: "Asia/Jakarta",
                                                })}
                                              </div>
                                              <div className="text-[9.5px] font-bold text-stone-800 font-mono mt-1">
                                                {formatIDR(
                                                  proj.commercial_invoices[0]
                                                    .total_amount || 0,
                                                )}
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="text-[9px] text-stone-400 font-medium">
                                              Invoicing has not been completed.
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex justify-between border-b border-stone-200/55 pb-4 mt-8">
                                    <span className="text-[10px] text-stone-500 font-bold bg-white border border-stone-200 px-4 py-2 rounded-full shadow-sm uppercase tracking-[0.2em]">
                                      Manufacturing flow details: PR &rarr; PO
                                      &rarr; GRN
                                    </span>
                                  </div>

                                  {(() => {
                                    const prAssociatedIds = new Set<string>();
                                    const flows: Array<{
                                      prs: any[];
                                      po: any | null;
                                      grns: any[];
                                    }> = [];

                                    // 1. Group PO-driven transactions
                                    proj.pos?.forEach((po: any) => {
                                      const associatedPrs =
                                        proj.prs?.filter((pr: any) => {
                                          if (po.pr_numbers) {
                                            return po.pr_numbers
                                              .toLowerCase()
                                              .includes(
                                                pr.pr_number.toLowerCase(),
                                              );
                                          }
                                          const poCodes =
                                            po.items?.map(
                                              (it: any) => it.item_code,
                                            ) || [];
                                          const prCodes =
                                            pr.items?.map(
                                              (it: any) => it.item_code,
                                            ) || [];
                                          return prCodes.some((c: string) =>
                                            poCodes.includes(c),
                                          );
                                        }) || [];

                                      associatedPrs.forEach((pr: any) =>
                                        prAssociatedIds.add(pr.id),
                                      );

                                      const associatedGrns =
                                        proj.grns?.filter(
                                          (grn: any) => grn.po_id === po.id,
                                        ) || [];

                                      flows.push({
                                        prs: associatedPrs,
                                        po: po,
                                        grns: associatedGrns,
                                      });
                                    });

                                    // 2. Fetch standalone/waiting PR transactions
                                    proj.prs?.forEach((pr: any) => {
                                      if (!prAssociatedIds.has(pr.id)) {
                                        flows.push({
                                          prs: [pr],
                                          po: null,
                                          grns: [],
                                        });
                                      }
                                    });

                                    if (flows.length === 0) {
                                      return (
                                        <div className="border border-dashed border-stone-200 rounded-3xl p-8 text-center bg-white">
                                          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                                            No Lineage Flow Found
                                          </span>
                                        </div>
                                      );
                                    }

                                    return (
                                      <div className="space-y-6">
                                        {flows.map((flow, idx) => (
                                          <div
                                            key={idx}
                                            className="bg-white border border-stone-200 rounded-3xl p-6 shadow-3xs relative overflow-hidden"
                                          >
                                            {/* Flow Index badge */}
                                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-100">
                                              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-100/50 px-2.5 py-1 rounded-lg">
                                                Flow Transaction #{idx + 1}
                                              </span>
                                              <span className="text-[9px] font-mono text-stone-400 font-bold">
                                                {flow.po
                                                  ? `Linked: PO ${flow.po.po_number}`
                                                  : "Draft Phase"}
                                              </span>
                                            </div>

                                            {/* Responsive horizontal flow stepper column wrapper */}
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                                              {/* Component 1: PR columns details */}
                                              <div className="bg-stone-50/50 rounded-2xl p-4 border border-stone-100 flex flex-col justify-between">
                                                <div>
                                                  <div className="flex items-center gap-2 mb-3">
                                                    <div className="w-5.5 h-5.5 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                                      <ClipboardList className="w-3.5 h-3.5" />
                                                    </div>
                                                    <h4 className="text-[9px] font-bold uppercase tracking-widest text-stone-400">
                                                      1. Purchase Requests (
                                                      {flow.prs.length})
                                                    </h4>
                                                  </div>

                                                  <div className="space-y-3">
                                                    {flow.prs.map((pr: any) => {
                                                      const isDocExpanded =
                                                        expandedDocs.has(pr.id);
                                                      return (
                                                        <div
                                                          key={pr.id}
                                                          onClick={(e) =>
                                                            toggleDocExpand(
                                                              pr.id,
                                                              e,
                                                            )
                                                          }
                                                          className={cn(
                                                            "bg-white border rounded-2xl p-3.5 shadow-3xs cursor-pointer select-none transition-all",
                                                            isDocExpanded
                                                              ? "border-blue-400 ring-2 ring-blue-900/[0.02]"
                                                              : "border-stone-200/80 hover:border-stone-300",
                                                          )}
                                                        >
                                                          <div className="flex justify-between items-start mb-1">
                                                            <span className="text-xs font-bold text-stone-900">
                                                              {pr.pr_number}
                                                            </span>
                                                            <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md bg-stone-150/70 text-stone-600 uppercase tracking-widest">
                                                              {pr.status}
                                                            </span>
                                                          </div>
                                                          <div className="flex items-center gap-1.5 text-[9px] text-stone-550 font-bold uppercase tracking-wider mt-2.5">
                                                            <Clock className="w-3 h-3 text-stone-400" />
                                                            Urgency:{" "}
                                                            <span
                                                              className={cn(
                                                                pr.urgency ===
                                                                  "URGENT"
                                                                  ? "text-amber-600 font-bold"
                                                                  : "text-stone-500",
                                                              )}
                                                            >
                                                              {pr.urgency}
                                                            </span>
                                                          </div>

                                                          {pr.items &&
                                                            pr.items.length >
                                                              0 && (
                                                              <div className="mt-3 flex items-center justify-between text-[8px] font-bold uppercase tracking-wider text-stone-400 hover:text-stone-600 border-t border-stone-100 pt-2.5 transition-colors">
                                                                <span>
                                                                  Items (
                                                                  {
                                                                    pr.items
                                                                      .length
                                                                  }
                                                                  )
                                                                </span>
                                                                <ChevronDown
                                                                  className={cn(
                                                                    "w-3 h-3 transition-transform duration-250",
                                                                    isDocExpanded &&
                                                                      "rotate-180 text-stone-900",
                                                                  )}
                                                                />
                                                              </div>
                                                            )}

                                                          {isDocExpanded &&
                                                            pr.items && (
                                                              <div className="mt-2.5 space-y-1.5">
                                                                {pr.items.map(
                                                                  (
                                                                    item: any,
                                                                  ) => (
                                                                    <div
                                                                      key={
                                                                        item.id
                                                                      }
                                                                      className="text-[9px] bg-stone-50 rounded-xl p-2 border border-stone-100 font-sans"
                                                                    >
                                                                      <div className="font-extrabold text-stone-800 line-clamp-2">
                                                                        {
                                                                          item.item_name
                                                                        }
                                                                      </div>
                                                                      <div className="text-[7.5px] text-stone-400 font-mono mt-0.5 uppercase tracking-wide">
                                                                        {
                                                                          item.item_code
                                                                        }
                                                                      </div>
                                                                      <div className="flex items-center justify-between mt-1.5 text-[8px] font-bold text-stone-500">
                                                                        <span className="bg-white border border-stone-200/50 px-1 py-0.5 rounded text-stone-700">
                                                                          Qty:{" "}
                                                                          {
                                                                            item.qty
                                                                          }
                                                                        </span>
                                                                      </div>
                                                                      {(item.dimension ||
                                                                        item.spec) && (
                                                                        <div className="text-[7.5px] text-stone-405 bg-stone-100/50 p-1 rounded mt-1.5 font-medium truncate">
                                                                          {item.dimension && (
                                                                            <span>
                                                                              Dim:{" "}
                                                                              {
                                                                                item.dimension
                                                                              }
                                                                            </span>
                                                                          )}
                                                                          {item.dimension &&
                                                                            item.spec && (
                                                                              <span className="mx-1">
                                                                                |
                                                                              </span>
                                                                            )}
                                                                          {item.spec && (
                                                                            <span>
                                                                              Spec:{" "}
                                                                              {
                                                                                item.spec
                                                                              }
                                                                            </span>
                                                                          )}
                                                                        </div>
                                                                      )}
                                                                    </div>
                                                                  ),
                                                                )}
                                                              </div>
                                                            )}
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                </div>
                                              </div>

                                              {/* Component 2: PO Details */}
                                              <div className="bg-stone-50/50 rounded-2xl p-4 border border-stone-100 flex flex-col justify-between">
                                                <div>
                                                  <div className="flex items-center gap-2 mb-3">
                                                    <div className="w-5.5 h-5.5 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                                                      <ShoppingCart className="w-3.5 h-3.5" />
                                                    </div>
                                                    <h4 className="text-[9px] font-bold uppercase tracking-widest text-stone-400">
                                                      2. Purchase Order
                                                    </h4>
                                                  </div>

                                                  {flow.po ? (
                                                    (() => {
                                                      const po = flow.po;
                                                      const isDocExpanded =
                                                        expandedDocs.has(po.id);
                                                      return (
                                                        <div
                                                          onClick={(e) =>
                                                            toggleDocExpand(
                                                              po.id,
                                                              e,
                                                            )
                                                          }
                                                          className={cn(
                                                            "bg-white border rounded-2xl p-3.5 shadow-3xs cursor-pointer select-none transition-all",
                                                            isDocExpanded
                                                              ? "border-amber-400 ring-2 ring-amber-900/[0.02]"
                                                              : "border-stone-200/80 hover:border-stone-300",
                                                          )}
                                                        >
                                                          <div className="flex justify-between items-start mb-1">
                                                            <span className="text-xs font-bold text-stone-900">
                                                              {po.po_number}
                                                            </span>
                                                            <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md bg-stone-150/70 text-stone-600 uppercase tracking-widest">
                                                              {po.status}
                                                            </span>
                                                          </div>
                                                          <div className="text-[9px] text-stone-550 font-bold uppercase tracking-wider mt-2.5 truncate">
                                                            Vendor:{" "}
                                                            <span className="text-stone-850 font-bold">
                                                              {po.supplier_name ||
                                                                "N/A"}
                                                            </span>
                                                          </div>

                                                          {po.items &&
                                                            po.items.length >
                                                              0 && (
                                                              <div className="mt-3 flex items-center justify-between text-[8px] font-bold uppercase tracking-wider text-stone-400 hover:text-stone-600 border-t border-stone-100 pt-2.5 transition-colors">
                                                                <span>
                                                                  Items (
                                                                  {
                                                                    po.items
                                                                      .length
                                                                  }
                                                                  )
                                                                </span>
                                                                <ChevronDown
                                                                  className={cn(
                                                                    "w-3 h-3 transition-transform duration-250",
                                                                    isDocExpanded &&
                                                                      "rotate-180 text-stone-900",
                                                                  )}
                                                                />
                                                              </div>
                                                            )}

                                                          {isDocExpanded &&
                                                            po.items && (
                                                              <div className="mt-2.5 space-y-1.5">
                                                                {po.items.map(
                                                                  (
                                                                    item: any,
                                                                  ) => (
                                                                    <div
                                                                      key={
                                                                        item.id
                                                                      }
                                                                      className="text-[9px] bg-stone-50 rounded-xl p-2 border border-stone-100 font-sans"
                                                                    >
                                                                      <div className="font-extrabold text-stone-800 line-clamp-2">
                                                                        {
                                                                          item.item_name
                                                                        }
                                                                      </div>
                                                                      <div className="text-[7.5px] text-stone-400 font-mono mt-0.5 uppercase tracking-wide">
                                                                        {
                                                                          item.item_code
                                                                        }
                                                                      </div>
                                                                      <div className="flex items-center justify-between mt-1.5 text-[8px] font-bold text-stone-500">
                                                                        <span className="bg-white border border-stone-200/50 px-1 py-0.5 rounded text-stone-700">
                                                                          Qty:{" "}
                                                                          {
                                                                            item.qty
                                                                          }
                                                                        </span>
                                                                      </div>
                                                                      {(item.dimension ||
                                                                        item.spec) && (
                                                                        <div className="text-[7.5px] text-stone-405 bg-stone-100/50 p-1 rounded mt-1.5 font-medium truncate">
                                                                          {item.dimension && (
                                                                            <span>
                                                                              Dim:{" "}
                                                                              {
                                                                                item.dimension
                                                                              }
                                                                            </span>
                                                                          )}
                                                                          {item.dimension &&
                                                                            item.spec && (
                                                                              <span className="mx-1">
                                                                                |
                                                                              </span>
                                                                            )}
                                                                          {item.spec && (
                                                                            <span>
                                                                              Spec:{" "}
                                                                              {
                                                                                item.spec
                                                                              }
                                                                            </span>
                                                                          )}
                                                                        </div>
                                                                      )}
                                                                    </div>
                                                                  ),
                                                                )}
                                                              </div>
                                                            )}
                                                        </div>
                                                      );
                                                    })()
                                                  ) : (
                                                    <div className="border border-dashed border-stone-200 rounded-2xl p-5 text-center bg-stone-100/20 py-8">
                                                      <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400 block mb-1">
                                                        Awaiting PO Output
                                                      </span>
                                                      <p className="text-[8px] text-stone-400 font-bold max-w-[180px] mx-auto leading-normal">
                                                        The engineering
                                                        requisition is
                                                        registered but vendor
                                                        purchase orders have not
                                                        been created.
                                                      </p>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Component 3: Consolidated GRN Details */}
                                              <div className="bg-stone-50/50 rounded-2xl p-4 border border-stone-100 flex flex-col justify-between">
                                                <div>
                                                  <div className="flex items-center gap-2 mb-3">
                                                    <div className="w-5.5 h-5.5 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shrink-0">
                                                      <Package className="w-3.5 h-3.5" />
                                                    </div>
                                                    <h4 className="text-[9px] font-bold uppercase tracking-widest text-stone-400">
                                                      3. Goods Receipts
                                                      (Unified)
                                                    </h4>
                                                  </div>

                                                  {flow.grns &&
                                                  flow.grns.length > 0 ? (
                                                    <div className="space-y-3">
                                                      {flow.grns.map(
                                                        (grn: any) => {
                                                          const isDocExpanded =
                                                            expandedDocs.has(
                                                              grn.id,
                                                            );
                                                          const isRejected =
                                                            grn.qc_status ===
                                                            "REJECTED";
                                                          return (
                                                            <div
                                                              key={grn.id}
                                                              onClick={(e) =>
                                                                toggleDocExpand(
                                                                  grn.id,
                                                                  e,
                                                                )
                                                              }
                                                              className={cn(
                                                                "border rounded-2xl p-3.5 shadow-3xs cursor-pointer select-none transition-all",
                                                                isDocExpanded
                                                                  ? isRejected
                                                                    ? "border-rose-450 ring-2 ring-rose-950/[0.01] bg-white text-stone-900"
                                                                    : "border-teal-400 ring-2 ring-teal-900/[0.02] bg-white"
                                                                  : "border-stone-200/80 bg-white hover:border-stone-300",
                                                                isRejected
                                                                  ? "bg-rose-50/30 border-rose-200"
                                                                  : "",
                                                              )}
                                                            >
                                                              <div className="flex justify-between items-start mb-1">
                                                                <div>
                                                                  <span className="text-xs font-bold text-stone-900 block">
                                                                    {grn.grn_id}
                                                                  </span>
                                                                  {grn.rejected_grn_doc && (
                                                                    <span className="inline-flex mt-0.5 text-[7px] bg-amber-50 text-amber-705 border border-amber-200 px-1 py-0.2 rounded font-bold font-mono">
                                                                      REISSUE OF{" "}
                                                                      {
                                                                        grn.rejected_grn_doc
                                                                      }
                                                                    </span>
                                                                  )}
                                                                </div>
                                                                <span
                                                                  className={cn(
                                                                    "text-[8px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-widest",
                                                                    grn.qc_status ===
                                                                      "PASSED"
                                                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                                                      : grn.qc_status ===
                                                                          "REJECTED"
                                                                        ? "bg-red-50 text-red-700 border border-red-155"
                                                                        : "bg-stone-100 text-stone-600",
                                                                  )}
                                                                >
                                                                  {grn.qc_status ||
                                                                    "PENDING"}
                                                                </span>
                                                              </div>
                                                              <div className="text-[9px] text-stone-550 font-bold uppercase tracking-wider mt-2.5 flex items-center gap-1.5">
                                                                <CheckCircle className="w-3.5 h-3.5 text-stone-400" />
                                                                Received:{" "}
                                                                <span className="text-stone-850 font-bold">
                                                                  {grn.received_date
                                                                    ? new Date(
                                                                        grn.received_date,
                                                                      ).toLocaleDateString(
                                                                        "en-US",
                                                                        {
                                                                          timeZone:
                                                                            "Asia/Jakarta",
                                                                        },
                                                                      )
                                                                    : "-"}
                                                                </span>
                                                              </div>

                                                              {grn.items &&
                                                                grn.items
                                                                  .length >
                                                                  0 && (
                                                                  <div className="mt-3 flex items-center justify-between text-[8px] font-bold uppercase tracking-wider text-stone-400 hover:text-stone-600 border-t border-stone-100 pt-2.5 transition-colors">
                                                                    <span>
                                                                      Items (
                                                                      {
                                                                        grn
                                                                          .items
                                                                          .length
                                                                      }
                                                                      )
                                                                    </span>
                                                                    <ChevronDown
                                                                      className={cn(
                                                                        "w-3 h-3 transition-transform duration-250",
                                                                        isDocExpanded &&
                                                                          "rotate-180 text-stone-900",
                                                                      )}
                                                                    />
                                                                  </div>
                                                                )}

                                                              {isDocExpanded &&
                                                                grn.items && (
                                                                  <div className="mt-2.5 space-y-1.5">
                                                                    {grn.items.map(
                                                                      (
                                                                        item: any,
                                                                      ) => (
                                                                        <div
                                                                          key={
                                                                            item.id
                                                                          }
                                                                          className="text-[9px] bg-stone-50 rounded-xl p-2 border border-stone-100 font-sans"
                                                                        >
                                                                          <div className="font-extrabold text-stone-800 line-clamp-2">
                                                                            {
                                                                              item.item_name
                                                                            }
                                                                          </div>
                                                                          <div className="text-[7.5px] text-stone-400 font-mono mt-0.5 uppercase tracking-wide">
                                                                            {
                                                                              item.item_code
                                                                            }
                                                                          </div>
                                                                          <div className="flex items-center justify-between mt-1.5 text-[8px] font-bold text-stone-500">
                                                                            <span className="bg-white border border-stone-200/50 px-1 py-0.5 rounded text-stone-700">
                                                                              Qty
                                                                              Recv:{" "}
                                                                              {
                                                                                item.qty
                                                                              }
                                                                            </span>
                                                                          </div>
                                                                        </div>
                                                                      ),
                                                                    )}
                                                                  </div>
                                                                )}
                                                            </div>
                                                          );
                                                        },
                                                      )}
                                                    </div>
                                                  ) : (
                                                    <div className="border border-dashed border-stone-200 rounded-2xl p-5 text-center bg-stone-100/20 py-8">
                                                      <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400 block mb-1">
                                                        Awaiting Delivery
                                                      </span>
                                                      <p className="text-[8px] text-stone-400 font-bold max-w-[180px] mx-auto leading-normal">
                                                        Supplier has not
                                                        delivery components. GRN
                                                        record will instantiate
                                                        upon physical quality
                                                        check.
                                                      </p>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isScannerOpen && (
          <Suspense fallback={<div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50"><div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div></div>}>
            <ScannerModal
              isOpen={isScannerOpen}
              onScan={handleScanSuccess}
              onClose={() => setIsScannerOpen(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
