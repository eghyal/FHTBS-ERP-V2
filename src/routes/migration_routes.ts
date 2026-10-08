import { Router } from "express";
import db from "../db/database.ts";
import { hybridDb, type DatabaseMode } from "../db/firestoreAdapter.ts";
import { 
  runFullMigration, 
  migrateSingleTable, 
  getMigrationState, 
  MIGRATION_TABLES 
} from "../db/migrationEngine.ts";
import { getSyncQueueStats } from "../db/firebaseSync.ts";
import { isFirebaseConfigured } from "../lib/firebase.ts";
import {
  runFullPostgresMigration,
  migrateTableToPostgres,
  getPostgresMigrationState,
} from "../db/postgresMigrationEngine.ts";
import { getPostgresBridgeStats } from "../db/postgresBridge.ts";
import { isPostgresReady, getPostgresMode, postgresQuery } from "../db/postgresClient.ts";

export const router = Router();

// ==========================================
// POSTGRESQL MIGRATION & TELEMETRY ENDPOINTS
// ==========================================

router.get("/api/postgres/status", async (req, res) => {
  try {
    const bridgeStats = getPostgresBridgeStats();
    const migrationState = getPostgresMigrationState();
    const ready = isPostgresReady();
    const mode = getPostgresMode();

    let postgresTables: any[] = [];
    if (ready) {
      try {
        const tableQuery = await postgresQuery(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
        );
        postgresTables = tableQuery.rows.map((r: any) => r.table_name);
      } catch (err) {
        console.warn("[PostgreSQL] Error querying tables:", err);
      }
    }

    res.json({
      status: "ok",
      isReady: ready,
      engineMode: mode,
      tableCount: postgresTables.length,
      tables: postgresTables,
      bridgeStats,
      migrationState,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to retrieve PostgreSQL status" });
  }
});

router.post("/api/postgres/migrate", async (req, res) => {
  try {
    const summary = await runFullPostgresMigration();
    res.json({
      message: "PostgreSQL full migration completed successfully.",
      summary,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "PostgreSQL migration failed" });
  }
});

router.post("/api/postgres/table/:tableName", async (req, res) => {
  try {
    const { tableName } = req.params;
    const result = await migrateTableToPostgres(tableName);
    res.json({
      message: `Table ${tableName} migrated to PostgreSQL with status: ${result.status}`,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to migrate table to PostgreSQL" });
  }
});

// 1. Get complete migration and sync telemetry status
router.get("/api/migration/status", async (req, res) => {
  try {
    const state = getMigrationState();
    const syncStats = getSyncQueueStats();

    // Query table row counts from SQLite for live dashboard comparison
    const tableStats = MIGRATION_TABLES.map(table => {
      let rowCount = 0;
      let exists = false;
      try {
        const check = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
        if (check) {
          exists = true;
          const countRes = db.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get() as any;
          rowCount = countRes?.count || 0;
        }
      } catch {
        // Table not present or error
      }
      return { table, exists, rowCount };
    });

    // Attempt to fetch latest migration summary from Firestore if not in memory
    let lastSummary = state.lastSummary;
    if (!lastSummary) {
      try {
        const logs = await hybridDb.query("migration_logs", [
          { field: "table_name", op: "==", value: "_TOTAL_SUMMARY_" }
        ], 1);
        if (logs.length > 0) {
          lastSummary = logs[0].summary_data || logs[0];
        }
      } catch {
        // Fallback gracefully
      }
    }

    res.json({
      dbMode: hybridDb.getMode(),
      firebaseConfigured: isFirebaseConfigured,
      isMigrationRunning: state.isMigrationRunning,
      lastSummary,
      syncStats,
      tableStats,
      totalSQLiteRecords: tableStats.reduce((acc, t) => acc + t.rowCount, 0)
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// 2. Trigger Total Migration Execution
router.post("/api/migration/start", async (req, res) => {
  try {
    const state = getMigrationState();
    if (state.isMigrationRunning) {
      return res.status(409).json({ error: "Migration is already running." });
    }

    // Execute migration in background if requested, or await
    const asyncMode = req.query.async === "true";

    if (asyncMode) {
      runFullMigration().catch(err => console.error("[Migration] Background run failed:", err));
      return res.json({ message: "Full migration triggered asynchronously in background." });
    }

    const summary = await runFullMigration();
    res.json({
      message: "Full migration completed successfully.",
      summary
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// 3. Migrate a single specific table
router.post("/api/migration/table/:tableName", async (req, res) => {
  try {
    const { tableName } = req.params;
    const result = await migrateSingleTable(tableName);
    res.json({
      message: `Table ${tableName} migration ${result.status.toLowerCase()}`,
      result
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// 4. Update Database Mode (DUAL, FIRESTORE_ONLY, SQLITE_FALLBACK)
router.post("/api/migration/mode", (req, res) => {
  try {
    const { mode } = req.body;
    if (!["DUAL", "FIRESTORE_ONLY", "SQLITE_FALLBACK"].includes(mode)) {
      return res.status(400).json({ error: "Invalid mode. Allowed: DUAL, FIRESTORE_ONLY, SQLITE_FALLBACK" });
    }

    hybridDb.setMode(mode as DatabaseMode);
    res.json({
      message: `Database mode changed to ${mode}`,
      currentMode: hybridDb.getMode()
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

export default router;
