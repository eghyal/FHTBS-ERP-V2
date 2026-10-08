import db from "./database.ts";
import { postgresQuery, postgresExecute, initPostgresDb, getPostgresMode } from "./postgresClient.ts";

export interface PostgresTableMigrationResult {
  tableName: string;
  sourceRowCount: number;
  migratedRowCount: number;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  durationMs: number;
  error?: string;
}

export interface PostgresMigrationSummary {
  batchId: string;
  startedAt: string;
  completedAt: string;
  engineMode: string;
  totalTables: number;
  totalSourceRows: number;
  totalMigratedRows: number;
  results: PostgresTableMigrationResult[];
  overallStatus: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
}

let isMigrationRunning = false;
let lastPostgresSummary: PostgresMigrationSummary | null = null;

// Map SQLite column types to standard PostgreSQL types
function mapSqliteTypeToPostgres(type: string): string {
  const upper = (type || "").toUpperCase().trim();
  if (upper.includes("INT")) return "BIGINT";
  if (upper.includes("CHAR") || upper.includes("CLOB") || upper.includes("TEXT")) return "TEXT";
  if (upper.includes("BLOB")) return "BYTEA";
  if (upper.includes("REAL") || upper.includes("FLOA") || upper.includes("DOUB") || upper.includes("NUMERIC") || upper.includes("DECIMAL")) return "NUMERIC";
  if (upper.includes("BOOL")) return "BOOLEAN";
  if (upper.includes("DATE") || upper.includes("TIME")) return "TEXT";
  return "TEXT";
}

export async function migrateTableToPostgres(tableName: string): Promise<PostgresTableMigrationResult> {
  const startTime = Date.now();
  try {
    // 1. Get SQLite table info
    const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
    if (!columns || columns.length === 0) {
      return {
        tableName,
        sourceRowCount: 0,
        migratedRowCount: 0,
        status: "SKIPPED",
        durationMs: Date.now() - startTime,
        error: "No column metadata found in SQLite",
      };
    }

    // 2. Build PostgreSQL CREATE TABLE statement
    const colDefs = columns.map((col) => {
      const colName = `"${col.name}"`;
      const pgType = mapSqliteTypeToPostgres(col.type);
      const isPk = col.pk > 0 ? " PRIMARY KEY" : "";
      return `${colName} ${pgType}${isPk}`;
    });

    const createTableSql = `CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(", ")})`;
    await postgresExecute(createTableSql);

    // 2b. Ensure all columns exist in PostgreSQL even if table was created previously with older schema
    for (const col of columns) {
      try {
        const pgType = mapSqliteTypeToPostgres(col.type);
        await postgresExecute(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${col.name}" ${pgType}`);
      } catch (colErr: any) {
        // column may already exist or syntax variance
      }
    }

    // 3. Fetch source records from SQLite
    const rows = db.prepare(`SELECT * FROM "${tableName}"`).all() as any[];
    const sourceRowCount = rows.length;

    if (sourceRowCount === 0) {
      return {
        tableName,
        sourceRowCount: 0,
        migratedRowCount: 0,
        status: "SUCCESS",
        durationMs: Date.now() - startTime,
      };
    }

    // 4. Batch insert into PostgreSQL
    const pkCol = columns.find((c) => c.pk > 0)?.name;
    const colNames = columns.map((c) => `"${c.name}"`).join(", ");

    let insertedCount = 0;
    const batchSize = 100;

    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      for (const row of chunk) {
        const values: any[] = [];
        const placeholders: string[] = [];

        columns.forEach((col, idx) => {
          placeholders.push(`$${idx + 1}`);
          let val = row[col.name];
          if (val === undefined) val = null;
          // Format objects or arrays as JSON string for text storage
          if (val !== null && typeof val === "object" && !(val instanceof Date)) {
            val = JSON.stringify(val);
          }
          values.push(val);
        });

        const insertSql = `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders.join(", ")})`;

        if (pkCol) {
          try {
            await postgresQuery(insertSql + ` ON CONFLICT ("${pkCol}") DO NOTHING`, values);
            insertedCount++;
          } catch (conflictErr: any) {
            if (
              conflictErr.message &&
              (conflictErr.message.includes("no unique or exclusion constraint") ||
                conflictErr.message.includes("ON CONFLICT"))
            ) {
              try {
                await postgresQuery(insertSql, values);
                insertedCount++;
              } catch (fallbackErr: any) {
                // Ignore duplicate errors on fallback
              }
            } else {
              console.warn(`[PostgreSQL Migration] Row skip in ${tableName}:`, conflictErr.message);
            }
          }
        } else {
          try {
            await postgresQuery(insertSql, values);
            insertedCount++;
          } catch (rowErr: any) {
            console.warn(`[PostgreSQL Migration] Row skip in ${tableName}:`, rowErr.message);
          }
        }
      }
    }

    return {
      tableName,
      sourceRowCount,
      migratedRowCount: insertedCount,
      status: "SUCCESS",
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    console.error(`[PostgreSQL Migration] Failed table ${tableName}:`, err);
    return {
      tableName,
      sourceRowCount: 0,
      migratedRowCount: 0,
      status: "FAILED",
      durationMs: Date.now() - startTime,
      error: err.message,
    };
  }
}

export async function runFullPostgresMigration(): Promise<PostgresMigrationSummary> {
  if (isMigrationRunning) {
    throw new Error("PostgreSQL migration is already currently running.");
  }

  isMigrationRunning = true;
  await initPostgresDb();

  const batchId = `PG_MIG_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const results: PostgresTableMigrationResult[] = [];

  console.log(`[PostgreSQL Migration] === Starting Full Migration Batch ${batchId} ===`);

  try {
    // Fetch all user tables from SQLite
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];

    let totalSourceRows = 0;
    let totalMigratedRows = 0;

    for (const { name } of tables) {
      const res = await migrateTableToPostgres(name);
      results.push(res);
      totalSourceRows += res.sourceRowCount;
      totalMigratedRows += res.migratedRowCount;
      if (res.sourceRowCount > 0) {
        console.log(`[PostgreSQL Migration] ${name}: ${res.migratedRowCount}/${res.sourceRowCount} rows (${res.durationMs}ms)`);
      }
    }

    const completedAt = new Date().toISOString();
    const hasFailures = results.some((r) => r.status === "FAILED");
    const overallStatus = hasFailures ? "PARTIAL_SUCCESS" : "SUCCESS";

    lastPostgresSummary = {
      batchId,
      startedAt,
      completedAt,
      engineMode: getPostgresMode(),
      totalTables: tables.length,
      totalSourceRows,
      totalMigratedRows,
      results,
      overallStatus,
    };

    console.log(
      `[PostgreSQL Migration] Finished with status: ${overallStatus}. Migrated ${totalMigratedRows} rows across ${tables.length} tables.`,
    );

    return lastPostgresSummary;
  } finally {
    isMigrationRunning = false;
  }
}

export function getPostgresMigrationState() {
  return {
    isMigrationRunning,
    lastSummary: lastPostgresSummary,
  };
}
