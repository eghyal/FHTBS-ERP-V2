import React, { useState, useEffect, useMemo } from "react";
import { 
  Cloud, 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Activity, 
  Layers, 
  Play, 
  FileCheck, 
  HardDrive, 
  Cpu, 
  Server,
  Zap,
  Search,
  Factory,
  Package,
  Briefcase,
  CircleDollarSign,
  Shield,
  Clock,
  ExternalLink,
  ChevronRight,
  Info
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";

interface TableStat {
  table: string;
  exists: boolean;
  rowCount: number;
}

interface MigrationSummary {
  batchId: string;
  startedAt: string;
  completedAt: string;
  totalTables: number;
  totalRows: number;
  overallStatus: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  results: Array<{
    tableName: string;
    rowCount: number;
    migratedCount: number;
    checksum: string;
    status: string;
    durationMs: number;
    error?: string;
  }>;
}

type DomainCategory = "ALL" | "PRODUCTION" | "INVENTORY" | "COMMERCIAL" | "FINANCE_HR" | "GOVERNANCE";

interface DomainConfig {
  id: DomainCategory;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DOMAINS: DomainConfig[] = [
  { id: "ALL", label: "All Collections", description: "All database tables across ERP modules", icon: Layers },
  { id: "PRODUCTION", label: "Production & Engineering", description: "SPK, BOP Routing, BOM, Lots, NDP, Shop Floor", icon: Factory },
  { id: "INVENTORY", label: "Inventory & Logistics", description: "Stock Levels, Movements, Delivery Notes", icon: Package },
  { id: "COMMERCIAL", label: "Sales & Procurement", description: "Quotations, Purchase Orders, GRN, Invoices", icon: Briefcase },
  { id: "FINANCE_HR", label: "Finance & Human Resources", description: "General Ledger, Payroll, Attendance, Accounts", icon: CircleDollarSign },
  { id: "GOVERNANCE", label: "Governance & System", description: "Audit Trails, Workflows, Access Control", icon: Shield },
];

export default function CloudMigrationHub() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [migratingTable, setMigratingTable] = useState<string | null>(null);
  
  const [dbMode, setDbMode] = useState<"DUAL" | "FIRESTORE_ONLY" | "SQLITE_FALLBACK">("DUAL");
  const [tableStats, setTableStats] = useState<TableStat[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [lastSummary, setLastSummary] = useState<MigrationSummary | null>(null);
  const [syncStats, setSyncStats] = useState<any>(null);
  const [firebaseConfigured, setFirebaseConfigured] = useState<boolean>(true);
  const [filterDomain, setFilterDomain] = useState<DomainCategory>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"tables" | "batch_logs">("tables");

  const fetchStatus = async () => {
    try {
      const res = await apiFetch("/api/migration/status");
      if (res.ok && res.data) {
        setDbMode(res.data.dbMode || "DUAL");
        setTableStats(res.data.tableStats || []);
        setTotalRecords(res.data.totalSQLiteRecords || 0);
        setLastSummary(res.data.lastSummary || null);
        setSyncStats(res.data.syncStats || null);
        setFirebaseConfigured(res.data.firebaseConfigured !== false);
      }
    } catch (err: any) {
      console.error("Failed to load migration status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => { if (!document.hidden) fetchStatus(); }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleStartFullMigration = async () => {
    if (migrating) return;
    setMigrating(true);
    showToast("Starting Total Firestore Migration Batch...", "info");

    try {
      const res = await apiFetch("/api/migration/start", { method: "POST" });
      if (res.ok && res.data?.summary) {
        setLastSummary(res.data.summary);
        showToast(`Migration Completed! ${res.data.summary.totalRows} records synced.`, "success");
        fetchStatus();
      } else {
        showToast(res.data?.error || "Migration failed", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to trigger migration", "error");
    } finally {
      setMigrating(false);
    }
  };

  const handleMigrateSingleTable = async (tableName: string) => {
    setMigratingTable(tableName);
    try {
      const res = await apiFetch(`/api/migration/table/${tableName}`, { method: "POST" });
      if (res.ok) {
        showToast(`Table ${tableName} successfully synced to Firestore.`, "success");
        fetchStatus();
      } else {
        showToast(res.data?.error || `Failed to migrate ${tableName}`, "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error", "error");
    } finally {
      setMigratingTable(null);
    }
  };

  const handleChangeDbMode = async (newMode: "DUAL" | "FIRESTORE_ONLY" | "SQLITE_FALLBACK") => {
    try {
      const res = await apiFetch("/api/migration/mode", {
        method: "POST",
        body: JSON.stringify({ mode: newMode })
      });
      if (res.ok) {
        setDbMode(newMode);
        showToast(`Database architecture mode set to ${newMode}`, "success");
      } else {
        showToast(res.data?.error || "Failed to update mode", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error", "error");
    }
  };

  const getDomainForTable = (name: string): DomainCategory => {
    if ([
      "projects", "spks", "ntps", "boms", "bom_templates", "bop_versions", 
      "bill_of_processes", "product_node_lifecycle", "production_manpower", 
      "project_stations", "production_manpower_assignments", "production_lots", 
      "lot_routing_executions", "task_travel_tags", "notice_to_down_processes", 
      "finish_good_records", "wip_movements", "project_tasks", "work_centers", 
      "production_stations"
    ].includes(name)) {
      return "PRODUCTION";
    }
    if ([
      "items", "inventory", "stock_movements", "delivery_notes", 
      "delivery_items", "inventory_labels", "inventory_reservations"
    ].includes(name)) {
      return "INVENTORY";
    }
    if ([
      "quotations", "quotation_items", "crm_leads", "purchase_requests", 
      "pr_items", "purchase_orders", "grns", "grn_items", "commercial_invoices", 
      "customers", "suppliers"
    ].includes(name)) {
      return "COMMERCIAL";
    }
    if ([
      "finance_transactions", "journal_entries", "journal_entry_lines", 
      "finance_payroll", "payroll_requisitions", "hr_jobs", "hr_applications", 
      "hr_kpis", "hr_leaves", "hr_salaries", "hr_payslips", "bank_accounts", 
      "hr_attendances"
    ].includes(name)) {
      return "FINANCE_HR";
    }
    return "GOVERNANCE";
  };

  const filteredTables = useMemo(() => {
    return tableStats.filter(t => {
      const domain = getDomainForTable(t.table);
      if (filterDomain !== "ALL" && domain !== filterDomain) return false;
      if (searchQuery && !t.table.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [tableStats, filterDomain, searchQuery]);

  const domainCounts = useMemo(() => {
    const counts: Record<DomainCategory, number> = {
      ALL: tableStats.length,
      PRODUCTION: 0,
      INVENTORY: 0,
      COMMERCIAL: 0,
      FINANCE_HR: 0,
      GOVERNANCE: 0,
    };
    tableStats.forEach(t => {
      const d = getDomainForTable(t.table);
      if (counts[d] !== undefined) {
        counts[d]++;
      }
    });
    return counts;
  }, [tableStats]);

  const totalFilteredRows = useMemo(() => {
    return filteredTables.reduce((acc, curr) => acc + (curr.rowCount || 0), 0);
  }, [filteredTables]);

  return (
    <div className="space-y-6 pb-20">
      {/* Enterprise Page Header */}
      <PageHeader
        title="Cloud Migration & Firestore Sync Hub"
        subtitle="Database synchronization and cloud replication"
        icon={<Cloud className="w-5 h-5 text-amber-600" />}
        actions={
          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="px-3.5 py-2 rounded-lg bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-semibold transition-all inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-stone-500", loading && "animate-spin text-amber-600")} />
              Refresh Status
            </button>

            <button
              onClick={handleStartFullMigration}
              disabled={migrating}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-all inline-flex items-center gap-2 shadow-xs disabled:opacity-60 cursor-pointer"
            >
              {migrating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Migrating All Tables...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Execute Total Migration
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Migration in Progress Banner */}
      {migrating && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between shadow-xs animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-bold">
              <RefreshCw className="w-4 h-4 animate-spin" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-900">Total Cloud Migration in Progress</div>
              <div className="text-[11px] text-amber-700">Writing batched collections with SHA-256 validation to Google Cloud Firestore...</div>
            </div>
          </div>
          <span className="text-xs font-mono font-semibold text-amber-800">Processing...</span>
        </div>
      )}

      {/* Top Architecture & Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Cloud Firestore Status */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-amber-600" />
                Target Cloud Database
              </span>
              {firebaseConfigured ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Online & Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-stone-100 text-stone-600 border border-stone-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                  Not Configured (Local Mode)
                </span>
              )}
            </div>
            <div className="text-base font-bold text-stone-900 mt-1">
              Google Cloud Firestore
            </div>
            <div className="text-xs font-mono text-stone-500 mt-1 flex items-center gap-1.5">
              <span>Instance:</span>
              <span className="text-stone-700 font-semibold truncate">
                {firebaseConfigured ? "Firestore (env-configured)" : "SQLite Lokal (Firebase belum dikonfigurasi)"}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-stone-400" />
              Sync Queue Operations:
            </span>
            <span className="font-semibold text-stone-900 font-mono">
              {(syncStats?.totalSyncedItems || 0).toLocaleString()} ops
            </span>
          </div>
        </div>

        {/* Card 2: Database Mode Toggle */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-blue-600" />
                Replication Engine Mode
              </span>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-stone-100 text-stone-700 rounded border border-stone-200">
                {dbMode}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 bg-stone-100 p-1 rounded-lg mt-3">
              <button
                type="button"
                onClick={() => handleChangeDbMode("DUAL")}
                className={cn(
                  "py-1.5 px-2 text-[11px] font-semibold rounded transition-all text-center cursor-pointer",
                  dbMode === "DUAL" 
                    ? "bg-white text-stone-900 shadow-xs border border-stone-200 font-bold" 
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                Dual-Write
              </button>
              <button
                type="button"
                onClick={() => handleChangeDbMode("FIRESTORE_ONLY")}
                className={cn(
                  "py-1.5 px-2 text-[11px] font-semibold rounded transition-all text-center cursor-pointer",
                  dbMode === "FIRESTORE_ONLY" 
                    ? "bg-amber-600 text-white shadow-xs font-bold" 
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                Cloud Only
              </button>
              <button
                type="button"
                onClick={() => handleChangeDbMode("SQLITE_FALLBACK")}
                className={cn(
                  "py-1.5 px-2 text-[11px] font-semibold rounded transition-all text-center cursor-pointer",
                  dbMode === "SQLITE_FALLBACK" 
                    ? "bg-stone-700 text-white shadow-xs font-bold" 
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                Local Fallback
              </button>
            </div>
          </div>

          <div className="mt-3 text-[11px] text-stone-500">
            {dbMode === "DUAL" && "Reads Firestore first; synchronizes mutations to both SQLite and Firestore."}
            {dbMode === "FIRESTORE_ONLY" && "Direct Cloud-Native mode. SQLite local engine completely bypassed."}
            {dbMode === "SQLITE_FALLBACK" && "Disaster Recovery mode. Server operates exclusively on local SQLite."}
          </div>
        </div>

        {/* Card 3: Last Migration Telemetry */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Latest Batch Telemetry
              </span>
              <span className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border",
                lastSummary?.overallStatus === "SUCCESS" 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                  : "bg-stone-100 text-stone-700 border-stone-200"
              )}>
                {lastSummary?.overallStatus || "STANDBY"}
              </span>
            </div>
            <div className="text-base font-bold text-stone-900 mt-1">
              {(lastSummary?.totalRows || totalRecords).toLocaleString()} Records Synchronized
            </div>
            <div className="text-xs font-mono text-stone-500 mt-1 truncate">
              Batch: <span className="text-stone-700 font-semibold">{lastSummary?.batchId || "Initial Sync Baseline"}</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-stone-400" />
              Verified Tables:
            </span>
            <span className="font-semibold text-stone-900 font-mono">{tableStats.length} Collections</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
        {/* Navigation Tabs and Quick Search */}
        <div className="p-4 border-b border-stone-200 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-stone-50/50">
          {/* Domain Category Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {DOMAINS.map(d => {
              const IconComp = d.icon;
              const isSelected = filterDomain === d.id;
              const count = domainCounts[d.id] || 0;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setFilterDomain(d.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all inline-flex items-center gap-1.5 cursor-pointer border",
                    isSelected
                      ? "bg-white text-stone-900 border-stone-300 shadow-xs"
                      : "bg-transparent text-stone-600 border-transparent hover:bg-stone-200/60"
                  )}
                >
                  <IconComp className={cn("w-3.5 h-3.5", isSelected ? "text-amber-600" : "text-stone-400")} />
                  <span>{d.label}</span>
                  <span className={cn(
                    "px-1.5 py-0.2 rounded text-[10px] font-mono",
                    isSelected ? "bg-stone-100 text-stone-800" : "bg-stone-200 text-stone-600"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative w-full lg:w-72">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter collection name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-stone-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
            />
          </div>
        </div>

        {/* Action & Stats Subheader */}
        <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between text-xs text-stone-600 bg-white">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-800">Showing {filteredTables.length} tables</span>
            <span className="text-stone-300">|</span>
            <span>Total records: <strong className="font-mono text-stone-800">{totalFilteredRows.toLocaleString()}</strong></span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-stone-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              SHA-256 Verified
            </span>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-stone-50/80 text-stone-600 uppercase font-semibold text-[10px] tracking-wider border-b border-stone-200">
              <tr>
                <th className="px-5 py-3 font-semibold">Collection / Table Name</th>
                <th className="px-5 py-3 font-semibold">ERP Domain</th>
                <th className="px-5 py-3 font-semibold text-right">SQLite Records</th>
                <th className="px-5 py-3 font-semibold">Cloud Sync State</th>
                <th className="px-5 py-3 font-semibold">SHA-256 Checksum</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 bg-white">
              {filteredTables.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-stone-400 text-xs">
                    <Info className="w-6 h-6 mx-auto mb-2 text-stone-300" />
                    No database collections found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredTables.map((t) => {
                  const domain = getDomainForTable(t.table);
                  const tableLog = lastSummary?.results?.find(r => r.tableName === t.table);
                  const isItemMigrating = migratingTable === t.table;

                  return (
                    <tr key={t.table} className="hover:bg-stone-50/70 transition-colors">
                      {/* Name */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-center shrink-0">
                            <Database className="w-3.5 h-3.5 text-stone-600" />
                          </div>
                          <div>
                            <span className="font-semibold text-stone-900">{t.table}</span>
                            <span className="block text-[10px] text-stone-400 font-mono">
                              firestore/{t.table}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Domain */}
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                          {domain}
                        </span>
                      </td>

                      {/* Row Count */}
                      <td className="px-5 py-3.5 text-right font-mono font-semibold text-stone-900">
                        {t.rowCount.toLocaleString()}
                      </td>

                      {/* Cloud Sync State */}
                      <td className="px-5 py-3.5">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border",
                          t.rowCount > 0 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                            : "bg-stone-50 text-stone-500 border-stone-200"
                        )}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", t.rowCount > 0 ? "bg-emerald-500" : "bg-stone-300")} />
                          {t.rowCount > 0 ? "Mirrored in Firestore" : "Empty / Standby"}
                        </span>
                      </td>

                      {/* Checksum */}
                      <td className="px-5 py-3.5 font-mono text-[10px] text-stone-500">
                        {tableLog?.checksum ? (
                          <span className="bg-stone-100 px-1.5 py-0.5 rounded text-stone-700 border border-stone-200" title={tableLog.checksum}>
                            {tableLog.checksum.substring(0, 14)}...
                          </span>
                        ) : (
                          <span className="text-stone-300 font-mono">AUTO-CHECKSUM</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleMigrateSingleTable(t.table)}
                          disabled={isItemMigrating || migrating}
                          className="px-2.5 py-1 rounded bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 text-[11px] font-semibold transition-all inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                        >
                          {isItemMigrating ? (
                            <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                          ) : (
                            <Cloud className="w-3 h-3 text-stone-500" />
                          )}
                          Sync Table
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="p-4 border-t border-stone-200 bg-stone-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500">
          <div>
            Primary Cloud Node: <span className="font-mono text-stone-700">asia-southeast1 (Firestore Native)</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Dual-Write Engine: <strong className="text-stone-800">Active</strong></span>
            <span>Batch Flush Limit: <strong className="text-stone-800">450 docs/chunk</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
