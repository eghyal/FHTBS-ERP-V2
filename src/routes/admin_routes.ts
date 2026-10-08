import { resetFactoryData, resetHrData } from "../db/database.ts";
import { clearAllCloudData, clearHrCloudData } from "../db/firebaseSync.ts";
import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const router = Router();

    router.post("/api/admin/reset-factory", requireRole(["FC"]), async (req, res) => {
      try {
        resetFactoryData();
        await clearAllCloudData();
        res.json({
          success: true,
          message:
            "System reset to factory defaults successfully. Please logout and login again.",
        });
      } catch (error) {
        console.error("Factory Reset Error:", error);
        res.status(500).json({ error: "Failed to perform factory reset" });
      }
    });

    router.post("/api/admin/reset-hris", requireRole(["FC", "HR"]), async (req, res) => {
      try {
        resetHrData();
        await clearHrCloudData();
        try {
          db.prepare(
            `
            INSERT INTO audit_trail (id, user_email, action, resource_type, resource_id, details)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          ).run(
            `AUDIT-${Date.now()}`,
            req.headers["x-user-email"] || "system",
            "DATABASE_RESET_HRIS",
            "SYSTEM",
            "ALL",
            "HRIS and Human Resource data was reset to factory defaults",
          );
        } catch (audErr) {
          console.error("Failed to log audit for resetHrData:", audErr);
        }
        res.json({
          success: true,
          message:
            "HRIS and Human Resource pages have been reset to factory defaults successfully.",
        });
      } catch (error) {
        console.error("HRIS Reset Error:", error);
        res
          .status(500)
          .json({
            error: "Failed to perform HRIS and Human Resource data reset",
          });
      }
    });

