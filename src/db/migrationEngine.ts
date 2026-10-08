import crypto from "crypto";
import db from "./database.ts";
import { hybridDb } from "./firestoreAdapter.ts";

export interface TableMigrationResult {
  tableName: string;
  rowCount: number;
  migratedCount: number;
  checksum: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  durationMs: number;
  error?: string;
}

export interface MigrationSummary {
  batchId: string;
  startedAt: string;
  completedAt: string;
  totalTables: number;
  totalRows: number;
  results: TableMigrationResult[];
  overallStatus: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
}

// Ordered table list to preserve relational dependencies
export const MIGRATION_TABLES = [
  // 1. Core Master Data
  "system_settings",
  "users",
  "work_centers",
  "production_stations",
  "customers",
  "suppliers",
  "items",
  "inventory",
  "bank_accounts",
  // 2. Production & Manufacturing Domain
  "projects",
  "spks",
  "ntps",
  "boms",
  "bom_templates",
  "bom_template_items",
  "bop_versions",
  "bill_of_processes",
  "product_node_lifecycle",
  "production_manpower",
  "project_stations",
  "production_manpower_assignments",
  "production_lots",
  "lot_routing_executions",
  "task_travel_tags",
  "notice_to_down_processes",
  "finish_good_records",
  "wip_movements",
  "project_tasks",
  // 3. Commercial & Purchasing Domain
  "quotations",
  "quotation_items",
  "crm_leads",
  "purchase_requests",
  "pr_items",
  "purchase_orders",
  "grns",
  "grn_items",
  "stock_movements",
  "delivery_notes",
  "delivery_items",
  "commercial_invoices",
  // 4. Finance & HR Domain
  "finance_transactions",
  "journal_entries",
  "journal_entry_lines",
  "finance_payroll",
  "payroll_requisitions",
  "hr_jobs",
  "hr_applications",
  "hr_kpis",
  "hr_leaves",
  "hr_salaries",
  "hr_payslips",
  // 5. Workflows, Chat & Audit
  "workflow_matrices",
  "workflow_slas",
  "workflow_audit_logs",
  "chat_threads",
  "chat_participants",
  "chat_messages",
  "forum_posts",
  "forum_comments",
  "audit_trail"
];

let isMigrationRunning = false;
let lastMigrationSummary: MigrationSummary | null = null;

export async function runFullMigration(): Promise<MigrationSummary> {
  if (isMigrationRunning) {
    throw new Error("Migration is already in progress.");
  }

  isMigrationRunning = true;
  const batchId = `MIG_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const startedAt = new Date().toISOString();
  const results: TableMigrationResult[] = [];
  let totalRows = 0;

  console.log(`[MigrationEngine] === Starting Total Migration Batch ${batchId} ===`);

  try {
    for (const table of MIGRATION_TABLES) {
      const res = await migrateSingleTable(table, batchId);
      results.push(res);
      totalRows += res.rowCount;
    }

    const completedAt = new Date().toISOString();
    const hasFailures = results.some(r => r.status === "FAILED");
    const overallStatus = hasFailures ? "PARTIAL_SUCCESS" : "SUCCESS";

    const summary: MigrationSummary = {
      batchId,
      startedAt,
      completedAt,
      totalTables: results.length,
      totalRows,
      results,
      overallStatus
    };

    lastMigrationSummary = summary;

    // Record total summary in Firestore migration_logs
    await hybridDb.write("migration_logs", batchId, {
      batch_id: batchId,
      table_name: "_TOTAL_SUMMARY_",
      started_at: startedAt,
      completed_at: completedAt,
      row_count: totalRows,
      status: overallStatus,
      summary_data: summary
    });

    console.log(`[MigrationEngine] === Batch ${batchId} Completed with status: ${overallStatus}. Total records: ${totalRows} ===`);
    return summary;
  } finally {
    isMigrationRunning = false;
  }
}

export async function migrateSingleTable(tableName: string, batchId?: string): Promise<TableMigrationResult> {
  const effectiveBatchId = batchId || `MANUAL_${Date.now()}`;
  const startTimer = Date.now();

  try {
    // Check if table exists in SQLite
    const check = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tableName);
    if (!check) {
      return {
        tableName,
        rowCount: 0,
        migratedCount: 0,
        checksum: "NONE",
        status: "SKIPPED",
        durationMs: Date.now() - startTimer
      };
    }

    const rows = db.prepare(`SELECT * FROM "${tableName}"`).all();
    const rowCount = rows.length;

    if (rowCount === 0) {
      return {
        tableName,
        rowCount: 0,
        migratedCount: 0,
        checksum: "EMPTY",
        status: "SUCCESS",
        durationMs: Date.now() - startTimer
      };
    }

    // Calculate row data SHA-256 Checksum for immutability verification
    const jsonStr = JSON.stringify(rows);
    const checksum = crypto.createHash("sha256").update(jsonStr).digest("hex");

    // Format items for Firestore batch upload
    const items = rows.map((r: any, idx: number) => {
      const docId = String(r.id || r.code || r.uuid || r.po_number || r.username || `${tableName}_${idx + 1}`);
      const data: Record<string, any> = { ...r };

      // Parse JSON string fields automatically if present
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "string" && (v.startsWith("{") || v.startsWith("["))) {
          try {
            data[k] = JSON.parse(v);
          } catch {
            // keep as string if not valid JSON
          }
        }
      }

      return { id: docId, data };
    });

    // High throughput batch write to Firestore
    const migratedCount = await hybridDb.batchWrite(tableName, items);

    // Save individual table migration log
    const logId = `${effectiveBatchId}_${tableName}`;
    await hybridDb.write("migration_logs", logId, {
      batch_id: effectiveBatchId,
      table_name: tableName,
      started_at: new Date(startTimer).toISOString(),
      completed_at: new Date().toISOString(),
      row_count: rowCount,
      migrated_count: migratedCount,
      checksum,
      status: "SUCCESS"
    });

    return {
      tableName,
      rowCount,
      migratedCount,
      checksum,
      status: "SUCCESS",
      durationMs: Date.now() - startTimer
    };
  } catch (err: any) {
    console.error(`[MigrationEngine] Error migrating table ${tableName}:`, err);
    return {
      tableName,
      rowCount: 0,
      migratedCount: 0,
      checksum: "ERROR",
      status: "FAILED",
      durationMs: Date.now() - startTimer,
      error: err?.message || String(err)
    };
  }
}

export function getMigrationState() {
  return {
    isMigrationRunning,
    lastSummary: lastMigrationSummary
  };
}
