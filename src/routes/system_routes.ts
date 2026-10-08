import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { outboxService } from "../services/outboxService.ts";
import { cacheService } from "../services/cacheService.ts";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const router = Router();

    // --- OUTBOX QUEUE MONITORING & RETRY APIS (Phase 3) ---
    router.get("/api/sync/outbox/status", (req, res) => {
      try {
        const stats = outboxService.getStats();
        res.json({ success: true, stats });
      } catch (err: any) {
        res.status(500).json({ error: "Failed to get outbox stats: " + err.message });
      }
    });

    router.get("/api/sync/outbox/events", requireRole(["FC", "ADMIN", "SUPERADMIN"]), (req, res) => {
      try {
        const limit = Number(req.query.limit) || 50;
        const events = outboxService.getRecentEvents(limit);
        res.json({ success: true, events });
      } catch (err: any) {
        res.status(500).json({ error: "Failed to fetch outbox events: " + err.message });
      }
    });

    router.post("/api/sync/outbox/retry", requireRole(["FC", "ADMIN", "SUPERADMIN"]), async (req, res) => {
      try {
        const replayedCount = outboxService.retryFailed();
        const processed = await outboxService.processOutboxBatch(50);
        res.json({
          success: true,
          message: `Replayed ${replayedCount} failed events, processed ${processed} events now.`,
          stats: outboxService.getStats(),
        });
      } catch (err: any) {
        res.status(500).json({ error: "Failed to trigger outbox retry: " + err.message });
      }
    });

    // --- IN-MEMORY CACHE MONITORING & MANAGEMENT APIS (Phase 5) ---
    router.get("/api/system/cache-stats", (req, res) => {
      try {
        const stats = cacheService.getStats();
        res.json({ success: true, stats });
      } catch (err: any) {
        res.status(500).json({ error: "Failed to get cache stats: " + err.message });
      }
    });

    router.post("/api/system/cache-clear", requireRole(["FC", "ADMIN", "SUPERADMIN"]), (req, res) => {
      try {
        const { namespace } = req.body || {};
        if (namespace) {
          const count = cacheService.invalidateNamespace(namespace);
          return res.json({ success: true, message: `Cleared ${count} entries in namespace '${namespace}'` });
        }
        cacheService.clear();
        res.json({ success: true, message: "Cleared all in-memory master data caches." });
      } catch (err: any) {
        res.status(500).json({ error: "Failed to clear cache: " + err.message });
      }
    });

    router.get("/api/audit-trail", (req, res) => {
      try {
        const { resource_id } = req.query;
        let logs;
        if (resource_id) {
          logs = db
            .prepare(
              "SELECT * FROM audit_trail WHERE resource_id = ? ORDER BY created_at DESC LIMIT 200",
            )
            .all(resource_id);
        } else {
          logs = db
            .prepare(
              "SELECT * FROM audit_trail ORDER BY created_at DESC LIMIT 200",
            )
            .all();
        }
        res.json(logs);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch audit trail" });
      }
    });

    router.get("/api/user-drafts/:key", (req, res) => {
      try {
        const { key } = req.params;
        const username = (req.headers["x-user-email"] as string) || "default";
        const draft = db
          .prepare(
            "SELECT data FROM user_drafts WHERE key = ? AND username = ?",
          )
          .get(key, username) as any;

        if (draft) {
          res.json({ success: true, data: JSON.parse(draft.data) });
        } else {
          res.json({ success: true, data: null });
        }
      } catch (error) {
        console.error("Failed to get draft:", error);
        res.status(500).json({ error: "Failed to get draft" });
      }
    });

    router.post("/api/user-drafts/:key", (req, res) => {
      try {
        const { key } = req.params;
        const username = (req.headers["x-user-email"] as string) || "default";
        const { data } = req.body;

        db.prepare(
          `
        INSERT INTO user_drafts (key, username, data, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key, username) DO UPDATE SET 
        data = excluded.data, 
        updated_at = CURRENT_TIMESTAMP
      `,
        ).run(key, username, JSON.stringify(data));

        res.json({ success: true });
      } catch (error) {
        console.error("Failed to save draft:", error);
        res.status(500).json({ error: "Failed to save draft" });
      }
    });

    router.delete("/api/user-drafts/:key", (req, res) => {
      try {
        const { key } = req.params;
        const username = (req.headers["x-user-email"] as string) || "default";
        db.prepare(
          "DELETE FROM user_drafts WHERE key = ? AND username = ?",
        ).run(key, username);
        res.json({ success: true });
      } catch (error) {
        console.error("Failed to delete draft:", error);
        res.status(500).json({ error: "Failed to delete draft" });
      }
    });

