import path from "path";
import fs from "fs";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

let pgPool: Pool | null = null;
let pgliteInstance: PGlite | null = null;
let isInitialized = false;
let postgresMode: "MANAGED_POSTGRES" | "PGLITE_EMBEDDED" = "PGLITE_EMBEDDED";

export async function initPostgresDb(): Promise<void> {
  if (isInitialized) return;

  const sqlHost = process.env.SQL_HOST;
  const sqlUser = process.env.SQL_USER;
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl || (sqlHost && sqlUser)) {
    try {
      console.log("[PostgreSQL] Connecting to managed PostgreSQL database...");
      pgPool = dbUrl
        ? new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 10000 })
        : new Pool({
            host: sqlHost,
            user: sqlUser,
            password: process.env.SQL_PASSWORD,
            database: process.env.SQL_DB_NAME,
            connectionTimeoutMillis: 10000,
          });

      // Test connection
      await pgPool.query("SELECT 1");
      postgresMode = "MANAGED_POSTGRES";
      console.log("[PostgreSQL] Connected to managed PostgreSQL successfully.");
      isInitialized = true;
      return;
    } catch (err: any) {
      console.warn(
        `[PostgreSQL] Failed to connect to managed PostgreSQL: ${err.message}. Falling back to persistent PGlite PostgreSQL v16 engine.`,
      );
      pgPool = null;
    }
  }

  // Fallback to high-performance persistent PGlite PostgreSQL engine
  try {
    const pgDataDir = path.join(process.cwd(), "data", "postgres");
    if (!fs.existsSync(pgDataDir)) {
      fs.mkdirSync(pgDataDir, { recursive: true });
    }

    console.log(`[PostgreSQL] Initializing persistent PGlite PostgreSQL engine at: ${pgDataDir}`);
    pgliteInstance = new PGlite(pgDataDir);
    const verRes = await pgliteInstance.query("SELECT version()");
    postgresMode = "PGLITE_EMBEDDED";
    console.log(`[PostgreSQL] Engine active: ${(verRes.rows[0] as any)?.version || "PostgreSQL v16"}`);
    isInitialized = true;
  } catch (err: any) {
    console.error("[PostgreSQL] Critical error initializing PGlite:", err);
    throw err;
  }
}

export async function postgresQuery<T = any>(
  sql: string,
  params: any[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  if (!isInitialized) {
    await initPostgresDb();
  }

  if (pgPool) {
    const res = await pgPool.query(sql, params);
    return { rows: res.rows, rowCount: res.rowCount || res.rows.length };
  } else if (pgliteInstance) {
    const res = await pgliteInstance.query(sql, params);
    return { rows: res.rows as T[], rowCount: res.rows.length };
  }

  throw new Error("[PostgreSQL] No active PostgreSQL client instance.");
}

export async function postgresExecute(sql: string): Promise<void> {
  if (!isInitialized) {
    await initPostgresDb();
  }

  if (pgPool) {
    await pgPool.query(sql);
  } else if (pgliteInstance) {
    await pgliteInstance.exec(sql);
  }
}

export function isPostgresReady(): boolean {
  return isInitialized;
}

export function getPostgresMode(): "MANAGED_POSTGRES" | "PGLITE_EMBEDDED" {
  return postgresMode;
}
