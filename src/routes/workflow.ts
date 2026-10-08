import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const router = Router();

    router.get("/api/workflow/matrices", (req, res) => {
      try {
        const rows = db
          .prepare("SELECT * FROM workflow_matrices ORDER BY created_at DESC")
          .all() as any[];
        const matrices = rows.map((r) => ({
          ...r,
          roles: JSON.parse(r.roles),
        }));
        res.json(matrices);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch matrices" });
      }
    });

    router.post(
      "/api/workflow/matrices",
      requireRole(["FC", "Director"]),
      (req, res) => {
        try {
          const {
            id,
            document_type,
            min_amount,
            max_amount,
            roles,
            is_parallel,
          } = req.body;
          const targetId = id || crypto.randomUUID();
          const existing = db
            .prepare("SELECT * FROM workflow_matrices WHERE id = ?")
            .get(targetId);

          db.prepare(
            `
          INSERT INTO workflow_matrices (id, document_type, min_amount, max_amount, roles, is_parallel)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            document_type = excluded.document_type,
            min_amount = excluded.min_amount,
            max_amount = excluded.max_amount,
            roles = excluded.roles,
            is_parallel = excluded.is_parallel
        `,
          ).run(
            targetId,
            document_type,
            min_amount,
            max_amount,
            JSON.stringify(roles),
            is_parallel ? 1 : 0,
          );

          db.prepare(
            `
          INSERT INTO workflow_audit_logs (id, username, action, target_type, target_id, changes)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
          ).run(
            crypto.randomUUID(),
            (req.headers["x-user-email"] as string) || "SYSTEM",
            existing ? "UPDATE" : "CREATE",
            "MATRIX",
            targetId,
            JSON.stringify(req.body),
          );

          res.json({ success: true });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to save matrix" });
        }
      },
    );

    router.delete(
      "/api/workflow/matrices/:id",
      requireRole(["FC", "Director"]),
      (req, res) => {
        try {
          const existing = db
            .prepare("SELECT * FROM workflow_matrices WHERE id = ?")
            .get(req.params.id);
          db.prepare("DELETE FROM workflow_matrices WHERE id = ?").run(
            req.params.id,
          );

          db.prepare(
            `
          INSERT INTO workflow_audit_logs (id, username, action, target_type, target_id, changes)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
          ).run(
            crypto.randomUUID(),
            (req.headers["x-user-email"] as string) || "SYSTEM",
            "DELETE",
            "MATRIX",
            req.params.id,
            JSON.stringify(existing),
          );

          res.json({ success: true });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to delete matrix" });
        }
      },
    );

    router.get("/api/workflow/slas", (req, res) => {
      try {
        const slas = db
          .prepare("SELECT * FROM workflow_slas ORDER BY created_at DESC")
          .all();
        res.json(slas);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch slas" });
      }
    });

    router.post(
      "/api/workflow/slas",
      requireRole(["FC", "Director"]),
      (req, res) => {
        try {
          const { id, document_type, step, sla_hours, escalate_to } = req.body;
          const targetId = id || crypto.randomUUID();
          const existing = db
            .prepare("SELECT * FROM workflow_slas WHERE id = ?")
            .get(targetId);

          db.prepare(
            `
          INSERT INTO workflow_slas (id, document_type, step, sla_hours, escalate_to)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            document_type = excluded.document_type,
            step = excluded.step,
            sla_hours = excluded.sla_hours,
            escalate_to = excluded.escalate_to
        `,
          ).run(targetId, document_type, step, sla_hours, escalate_to);

          db.prepare(
            `
          INSERT INTO workflow_audit_logs (id, username, action, target_type, target_id, changes)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
          ).run(
            crypto.randomUUID(),
            (req.headers["x-user-email"] as string) || "SYSTEM",
            existing ? "UPDATE" : "CREATE",
            "SLA",
            targetId,
            JSON.stringify(req.body),
          );

          res.json({ success: true });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to save SLA" });
        }
      },
    );

    router.delete(
      "/api/workflow/slas/:id",
      requireRole(["FC", "Director"]),
      (req, res) => {
        try {
          const existing = db
            .prepare("SELECT * FROM workflow_slas WHERE id = ?")
            .get(req.params.id);
          db.prepare("DELETE FROM workflow_slas WHERE id = ?").run(
            req.params.id,
          );

          db.prepare(
            `
          INSERT INTO workflow_audit_logs (id, username, action, target_type, target_id, changes)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
          ).run(
            crypto.randomUUID(),
            (req.headers["x-user-email"] as string) || "SYSTEM",
            "DELETE",
            "SLA",
            req.params.id,
            JSON.stringify(existing),
          );

          res.json({ success: true });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to delete sla" });
        }
      },
    );

    router.get("/api/workflow/audit_logs", (req, res) => {
      try {
        const logs = db
          .prepare(
            "SELECT * FROM workflow_audit_logs ORDER BY created_at DESC LIMIT 100",
          )
          .all();
        res.json(logs);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch audit logs" });
      }
    });

