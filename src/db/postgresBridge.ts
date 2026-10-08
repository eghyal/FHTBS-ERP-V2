import { postgresQuery, postgresExecute, isPostgresReady, getPostgresMode } from "./postgresClient.ts";

interface ReplicationQueueItem {
  table: string;
  id: string | number;
  data?: any;
  type: "UPSERT" | "DELETE";
  timestamp: number;
}

const replicationQueue: ReplicationQueueItem[] = [];
let isProcessing = false;
let totalReplicated = 0;
let totalReplicationErrors = 0;
let lastReplicationTime: string | null = null;

async function processReplicationQueue() {
  if (isProcessing || replicationQueue.length === 0 || !isPostgresReady()) return;
  isProcessing = true;

  try {
    while (replicationQueue.length > 0) {
      const item = replicationQueue.shift();
      if (!item) continue;

      try {
        if (item.type === "UPSERT" && item.data) {
          const keys = Object.keys(item.data);
          if (keys.length === 0) continue;

          const colNames = keys.map((k) => `"${k}"`).join(", ");
          const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(", ");
          const values = keys.map((k) => {
            let val = item.data[k];
            if (val !== null && typeof val === "object" && !(val instanceof Date)) {
              return JSON.stringify(val);
            }
            return val ?? null;
          });

          const updateClauses = keys
            .filter((k) => k !== "id")
            .map((k) => `"${k}" = EXCLUDED."${k}"`)
            .join(", ");

          let sql = `INSERT INTO "${item.table}" (${colNames}) VALUES (${placeholders})`;
          if (updateClauses.length > 0) {
            sql += ` ON CONFLICT ("id") DO UPDATE SET ${updateClauses}`;
          } else {
            sql += ` ON CONFLICT ("id") DO NOTHING`;
          }

          await postgresQuery(sql, values);
          totalReplicated++;
          lastReplicationTime = new Date().toISOString();
        } else if (item.type === "DELETE") {
          await postgresQuery(`DELETE FROM "${item.table}" WHERE "id" = $1`, [item.id]);
          totalReplicated++;
          lastReplicationTime = new Date().toISOString();
        }
      } catch (err: any) {
        totalReplicationErrors++;
        console.warn(`[PostgreSQL Bridge] Replication error on ${item.table}:${item.id}:`, err.message);
      }
    }
  } finally {
    isProcessing = false;
  }
}

export function replicateToPostgres(table: string, id: string | number, data: any): void {
  replicationQueue.push({
    table,
    id,
    data,
    type: "UPSERT",
    timestamp: Date.now(),
  });
  setImmediate(processReplicationQueue);
}

export function deleteFromPostgres(table: string, id: string | number): void {
  replicationQueue.push({
    table,
    id,
    type: "DELETE",
    timestamp: Date.now(),
  });
  setImmediate(processReplicationQueue);
}

export function getPostgresBridgeStats() {
  return {
    engineMode: getPostgresMode(),
    isReady: isPostgresReady(),
    queuedItems: replicationQueue.length,
    totalReplicated,
    totalReplicationErrors,
    lastReplicationTime,
  };
}
