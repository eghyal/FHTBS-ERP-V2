import { firestore, isFirebaseConfigured } from "../lib/firebase.ts";
import { 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc, 
  getDocs, 
  collection, 
  query, 
  where, 
  limit as fsLimit, 
  writeBatch,
  type WhereFilterOp
} from "firebase/firestore";
import db from "./database.ts";

export type DatabaseMode = "DUAL" | "FIRESTORE_ONLY" | "SQLITE_FALLBACK";

export interface FilterCondition {
  field: string;
  op: WhereFilterOp;
  value: any;
}

export class HybridDatabase {
  private mode: DatabaseMode = "DUAL";
  private syncCount: number = 0;
  private lastSyncTimestamp: string | null = null;
  private activeErrors: string[] = [];

  constructor() {
    // Mode can also be driven by environment variable
    if (process.env.DB_MODE) {
      this.mode = process.env.DB_MODE as DatabaseMode;
    }
    // Without Firebase credentials the cloud layer is unavailable:
    // degrade transparently to the local SQLite engine.
    if (!isFirebaseConfigured && this.mode !== "SQLITE_FALLBACK") {
      this.mode = "SQLITE_FALLBACK";
      console.warn("[HybridDatabase] Firebase not configured. Mode forced to SQLITE_FALLBACK.");
    }
  }

  public getMode(): DatabaseMode {
    return this.mode;
  }

  public setMode(mode: DatabaseMode) {
    if (!isFirebaseConfigured && mode !== "SQLITE_FALLBACK") {
      console.warn("[HybridDatabase] Cannot switch to cloud mode: Firebase is not configured.");
      this.mode = "SQLITE_FALLBACK";
      return;
    }
    this.mode = mode;
    console.log(`[HybridDatabase] Mode switched to: ${mode}`);
  }

  public getStats() {
    return {
      mode: this.mode,
      syncCount: this.syncCount,
      lastSyncTimestamp: this.lastSyncTimestamp,
      recentErrors: this.activeErrors.slice(-5)
    };
  }

  /**
   * Reads a single document.
   * In DUAL or FIRESTORE_ONLY mode, queries Firestore first.
   * If not found or on failure in DUAL, falls back to SQLite.
   */
  public async read(collectionName: string, id: string): Promise<any | null> {
    if (this.mode === "SQLITE_FALLBACK") {
      return this.readFromSqlite(collectionName, id);
    }

    try {
      const docRef = doc(firestore, collectionName, String(id));
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() };
      }
    } catch (err: any) {
      this.recordError(`Read error on ${collectionName}/${id}: ${err?.message}`);
      if (this.mode === "FIRESTORE_ONLY") throw err;
    }

    // Fallback to SQLite
    return this.readFromSqlite(collectionName, id);
  }

  /**
   * Writes a document according to current mode.
   * Sanitizes payload, converts Dates, and dual-writes if mode is DUAL.
   */
  public async write(collectionName: string, id: string, data: Record<string, any>): Promise<void> {
    const cleanData = this.sanitizeForFirestore(data);
    cleanData._updatedAt = new Date().toISOString();

    if (this.mode === "DUAL" || this.mode === "SQLITE_FALLBACK") {
      this.writeToSqlite(collectionName, id, data);
    }

    if (this.mode === "DUAL" || this.mode === "FIRESTORE_ONLY") {
      try {
        const docRef = doc(firestore, collectionName, String(id));
        await setDoc(docRef, cleanData, { merge: true });
        this.syncCount++;
        this.lastSyncTimestamp = new Date().toISOString();
      } catch (err: any) {
        this.recordError(`Write error on ${collectionName}/${id}: ${err?.message}`);
        if (this.mode === "FIRESTORE_ONLY") throw err;
      }
    }
  }

  /**
   * Deletes a document from both databases or current target.
   */
  public async delete(collectionName: string, id: string): Promise<void> {
    if (this.mode === "DUAL" || this.mode === "SQLITE_FALLBACK") {
      this.deleteFromSqlite(collectionName, id);
    }

    if (this.mode === "DUAL" || this.mode === "FIRESTORE_ONLY") {
      try {
        const docRef = doc(firestore, collectionName, String(id));
        await deleteDoc(docRef);
        this.syncCount++;
        this.lastSyncTimestamp = new Date().toISOString();
      } catch (err: any) {
        this.recordError(`Delete error on ${collectionName}/${id}: ${err?.message}`);
        if (this.mode === "FIRESTORE_ONLY") throw err;
      }
    }
  }

  /**
   * High-throughput batched write for bulk syncing & seeding.
   * Splits into batches of max 450 operations to conform with Firestore limits.
   */
  public async batchWrite(collectionName: string, items: Array<{ id: string; data: Record<string, any> }>): Promise<number> {
    const BATCH_SIZE = 450;
    let written = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(firestore);

      for (const item of chunk) {
        const docRef = doc(firestore, collectionName, String(item.id));
        const clean = this.sanitizeForFirestore(item.data);
        clean._syncedAt = new Date().toISOString();
        batch.set(docRef, clean, { merge: true });
      }

      await batch.commit();
      written += chunk.length;
      this.syncCount += chunk.length;
    }

    this.lastSyncTimestamp = new Date().toISOString();
    return written;
  }

  /**
   * Queries documents with filters and limit.
   */
  public async query(collectionName: string, filters: FilterCondition[] = [], maxResults: number = 100): Promise<any[]> {
    if (this.mode === "SQLITE_FALLBACK") {
      return this.querySqlite(collectionName, filters, maxResults);
    }

    try {
      let q = query(collection(firestore, collectionName));
      for (const f of filters) {
        q = query(q, where(f.field, f.op, f.value));
      }
      q = query(q, fsLimit(maxResults));

      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err: any) {
      this.recordError(`Query error on ${collectionName}: ${err?.message}`);
      if (this.mode === "FIRESTORE_ONLY") throw err;
      return this.querySqlite(collectionName, filters, maxResults);
    }
  }

  // --- Helper Methods ---

  private sanitizeForFirestore(obj: any): any {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== "object") return obj;
    if (obj instanceof Date) return obj.toISOString();

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeForFirestore(item));
    }

    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        clean[key] = this.sanitizeForFirestore(value);
      }
    }
    return clean;
  }

  private readFromSqlite(table: string, id: string): any | null {
    try {
      const check = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (!check) return null;
      return db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id) || null;
    } catch {
      return null;
    }
  }

  private writeToSqlite(table: string, id: string, data: Record<string, any>): void {
    try {
      const check = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (!check) return;

      const keys = Object.keys(data);
      if (keys.length === 0) return;

      const placeholders = keys.map(() => "?").join(",");
      const columns = keys.map(k => `"${k}"`).join(",");
      const values = keys.map(k => {
        const val = data[k];
        return typeof val === "object" && val !== null ? JSON.stringify(val) : val;
      });

      db.prepare(`INSERT OR REPLACE INTO "${table}" (${columns}) VALUES (${placeholders})`).run(...values);
    } catch (err: any) {
      // Ignore schema divergence on legacy write
    }
  }

  private deleteFromSqlite(table: string, id: string): void {
    try {
      const check = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (!check) return;
      db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id);
    } catch {
      // Ignore
    }
  }

  private querySqlite(table: string, filters: FilterCondition[], maxResults: number): any[] {
    try {
      const check = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (!check) return [];

      let sql = `SELECT * FROM "${table}"`;
      const params: any[] = [];

      if (filters.length > 0) {
        const clauses = filters.map(f => {
          params.push(f.value);
          const op = f.op === "==" ? "=" : f.op;
          return `"${f.field}" ${op} ?`;
        });
        sql += ` WHERE ${clauses.join(" AND ")}`;
      }

      sql += ` LIMIT ${maxResults}`;
      return db.prepare(sql).all(...params);
    } catch {
      return [];
    }
  }

  private recordError(msg: string) {
    console.warn(`[HybridDatabase] ${msg}`);
    this.activeErrors.push(`[${new Date().toISOString()}] ${msg}`);
    if (this.activeErrors.length > 20) this.activeErrors.shift();
  }
}

export const hybridDb = new HybridDatabase();
export default hybridDb;
