import { Router } from "express";
import db from "../../db/database.ts";
import { syncCollectionToFirestore, deleteDocFromFirestore } from "../../db/firebaseSync.ts";
import crypto from "crypto";
import QRCode from "qrcode";
import { requireRole } from "../../middleware/auth.ts";
import { logAudit } from "../../utils/audit.ts";
import { isValidDailyAuthKey } from "../../utils/auth.ts";
import { syncProjectGanttTasks } from "../../utils/ganttUtils.ts";
import { generateSignedWotQr, verifyAndParseWotQr, signWotPayload } from "../../utils/qrCrypto.ts";

import { computeNdpRippleAnalysis, handleCreateNdp, handleGetNdps, handleGetActiveNdps, handleGetNdpImpactAnalysis, handlePreviewImpact, handleRescheduleTrigger, handleResolveNdp, emitProductionUpdate, getHeijunkaThreshold, getBomProcurementPipelineStatus, checkRecursivePredecessorsCompleted, getAvailableInputWipForBop, checkPredecessorsReadyForPipelining, syncProjectMaterialAndWakeProcesses, autoResolveDownstreamProductNodes, preemptiveAutoPauseConflictingSteps, planningCache, CACHE_TTL_MS, invalidatePlanningCache, handleCalculateLoad, handleGetProductionLogs, handleAcknowledgeFr, handleFulfillFr, handleRejectFr, handleCloseFr, autoStartDownstreamProcesses } from "./production_utils.ts";

export const ndpRouter = Router();

ndpRouter.post("/api/production/ndp", handleCreateNdp);

ndpRouter.post("/api/ndps", handleCreateNdp);

ndpRouter.get("/api/production/ndp", handleGetNdps);

ndpRouter.get("/api/ndps", handleGetNdps);

ndpRouter.get("/api/production/ndp/active", handleGetActiveNdps);

ndpRouter.get("/api/ndps/active", handleGetActiveNdps);

ndpRouter.get("/api/ndps/:id/impact-analysis", handleGetNdpImpactAnalysis);

ndpRouter.get("/api/production/ndp/:id/impact-analysis", handleGetNdpImpactAnalysis);

ndpRouter.get("/api/ndps/preview-impact", handlePreviewImpact);

ndpRouter.get("/api/production/ndp/preview-impact", handlePreviewImpact);

ndpRouter.post("/api/ndps/:id/reschedule-trigger", handleRescheduleTrigger);

ndpRouter.post("/api/production/ndp/:id/reschedule-trigger", handleRescheduleTrigger);

ndpRouter.post("/api/production/ndp/:id/resolve", handleResolveNdp);

ndpRouter.patch("/api/ndps/:id/resolve", handleResolveNdp);

ndpRouter.get("/api/lean/heijunka/threshold", (req, res) => {
      res.json({ threshold: getHeijunkaThreshold() });
    });

ndpRouter.post("/api/lean/heijunka/threshold", (req, res) => {
      try {
        const { threshold } = req.body;
        const num = parseFloat(threshold);
        if (isNaN(num) || num < 0) {
          return res.status(400).json({ error: "Invalid threshold value." });
        }
        db.prepare(`
          INSERT INTO system_settings (key, value) VALUES ('heijunka_threshold', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(num.toString());

        logAudit(
          (req.headers["x-user-email"] as string) || "SYSTEM",
          "UPDATE_HEIJUNKA_THRESHOLD",
          "SETTINGS",
          "heijunka_threshold",
          `Updated Heijunka Fast-Track threshold to IDR ${num.toLocaleString('id-ID')}`
        );

        res.json({ success: true, threshold: num });
      } catch (err: any) { console.error("HEIJUNKA THRESHOLD POST ERROR", err); res.status(500).json({ error: err.message }); }
    });

ndpRouter.get("/api/lean/andon-summary", (req, res) => {
      try {
        const currentThreshold = getHeijunkaThreshold();

        // 1. Critical shortages (available stock <= 0)
        const criticalShortages = db.prepare(`
          SELECT COUNT(*) as count FROM items i
          LEFT JOIN inventory inv ON i.id = inv.item_id
          WHERE (COALESCE(inv.free_stock, 0) - COALESCE(inv.allocated_stock, 0)) <= 0
        `).get() as { count: number };

        // 2. ROP alerts (available stock <= min safety threshold)
        const ropAlerts = db.prepare(`
          SELECT COUNT(*) as count FROM items i
          LEFT JOIN inventory inv ON i.id = inv.item_id
          WHERE (COALESCE(inv.free_stock, 0) - COALESCE(inv.allocated_stock, 0)) <= 10
        `).get() as { count: number };

        // 3. Pending approval overdue (> 24 hours)
        const pendingOverdue = db.prepare(`
          SELECT COUNT(*) as count FROM purchase_requests
          WHERE status = 'DRAFTED' AND (julianday('now') - julianday(created_at)) * 24 > 24
        `).get() as { count: number };

        // 4. Unbilled delivered notes
        const unbilled = db.prepare(`
          SELECT COUNT(*) as count FROM delivery_notes dn
          LEFT JOIN commercial_invoices ci ON dn.id = ci.dn_id
          WHERE dn.status = 'DELIVERED' AND ci.id IS NULL
        `).get() as { count: number };

        // 5. Heijunka fast-track eligible PRs (< currentThreshold)
        const fasttrackEligible = db.prepare(`
          SELECT COUNT(*) as count FROM purchase_requests
          WHERE status = 'DRAFTED' AND total_estimated_cost <= ?
        `).get(currentThreshold) as { count: number };

        // Detail items needing replenishment
        const itemsNeedingReplenish = db.prepare(`
          SELECT i.id, i.item_code as code, i.name, COALESCE(inv.free_stock, 0) as free_stock, i.uom, COALESCE(i.unit_price, 0) as unit_price
          FROM items i
          LEFT JOIN inventory inv ON i.id = inv.item_id
          WHERE (COALESCE(inv.free_stock, 0) - COALESCE(inv.allocated_stock, 0)) <= 10
          LIMIT 10
        `).all() as any[];

        // Detail unbilled delivery notes
        const unbilledDns = db.prepare(`
          SELECT dn.id, dn.dn_number, COALESCE(c.name, 'Customer') as customer_name
          FROM delivery_notes dn
          LEFT JOIN customers c ON dn.customer_id = c.id
          LEFT JOIN commercial_invoices ci ON dn.id = ci.dn_id
          WHERE dn.status = 'DELIVERED' AND ci.id IS NULL
          LIMIT 5
        `).all() as any[];

        // Detail fasttrack PRs
        const fasttrackPrs = db.prepare(`
          SELECT id, pr_number, total_estimated_cost
          FROM purchase_requests
          WHERE status = 'DRAFTED' AND total_estimated_cost <= ?
          LIMIT 5
        `).all(currentThreshold) as any[];

        res.json({
          critical_shortages: criticalShortages.count || 0,
          rop_alerts: ropAlerts.count || 0,
          pending_approval_overdue: pendingOverdue.count || 0,
          unbilled_deliveries: unbilled.count || 0,
          heijunka_fasttrack_eligible: fasttrackEligible.count || 0,
          heijunka_threshold: currentThreshold,
          items_needing_replenish: itemsNeedingReplenish,
          unbilled_dns: unbilledDns,
          fasttrack_prs: fasttrackPrs,
        });
      } catch (err: any) {
        console.error("Error fetching Andon summary:", err);
        res.status(500).json({ error: err.message });
      }
    });

ndpRouter.get("/api/production/ndp", async (req, res) => {
      try {
        const { project_id } = req.query;
        const { hybridDb } = await import("../../db/firestoreAdapter.ts");

        // Fetch NDPs from Cloud
        const filters: any[] = [];
        if (project_id) {
          filters.push({ field: "project_id", op: "==", value: String(project_id) });
        }
        
        let ndps = await hybridDb.query("notice_to_down_processes", filters, 500);
        
        // Sort DESC by created_at
        ndps.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

        // Hydrate relations (bop.process_name, p.name as project_name, p.spk_number)
        // using local SQLite for the joined master data
        const enrichedNdps = ndps.map(ndp => {
          try {
            const bop = db.prepare(`SELECT process_name FROM bill_of_processes WHERE id = ?`).get(ndp.bop_id) as any;
            const proj = db.prepare(`SELECT name, spk_number FROM projects WHERE id = ?`).get(ndp.project_id) as any;
            return {
              ...ndp,
              process_name: bop?.process_name || "Unknown Process",
              project_name: proj?.name || "Unknown Project",
              spk_number: proj?.spk_number || "Unknown SPK"
            };
          } catch {
            return ndp;
          }
        });

        res.json(enrichedNdps);
      } catch (err: any) {
        console.error("Error fetching NDPs:", err);
        res.status(500).json({ error: err.message });
      }
    });

ndpRouter.post("/api/production/ndp/:id/resume", (req, res) => {
      try {
        const { id } = req.params;
        const ndp = db.prepare(`SELECT * FROM notice_to_down_processes WHERE id = ?`).get(id) as any;
        if (!ndp) {
          return res.status(404).json({ error: "NDP not found" });
        }

        const startTime = new Date(ndp.down_started_at).getTime();
        const now = Date.now();
        const downMinutes = Math.max(1, Math.round((now - startTime) / (1000 * 60)));
        const userIdentifier = req.headers["x-user-email"] as string || (req as any).userEmail || "Supervisor";

        const runTransaction = db.transaction(() => {
          db.prepare(`
            UPDATE notice_to_down_processes
            SET status = 'RESOLVED', resumed_at = CURRENT_TIMESTAMP, actual_down_minutes = ?
            WHERE id = ?
          `).run(downMinutes, id);

          // Apply preemptive auto-pause for conflicting running steps assigned to the same operator
          preemptiveAutoPauseConflictingSteps(ndp.bop_id, ndp.project_id, userIdentifier);

          // Return task to RUNNING
          db.prepare(`UPDATE bill_of_processes SET status = 'RUNNING', is_manual_pause = 0, pause_type = 'NONE' WHERE id = ?`).run(ndp.bop_id);
          db.prepare(`UPDATE project_tasks SET status = 'RUNNING', is_manual_pause = 0, pause_type = 'NONE' WHERE id = ?`).run(ndp.bop_id);

          // Dual-write to Firestore
          const nowIso = new Date().toISOString();
          syncCollectionToFirestore("notice_to_down_processes", id, {
             id, status: 'RESOLVED', resumed_at: nowIso, actual_down_minutes: downMinutes
          });
          syncCollectionToFirestore("bill_of_processes", ndp.bop_id, {
             id: ndp.bop_id, project_id: ndp.project_id, status: 'RUNNING', is_manual_pause: 0, pause_type: 'NONE'
          });

          // Resume operator allocations
          db.prepare(`
            UPDATE production_manpower_assignments
            SET status = 'ACTIVE'
            WHERE bop_id = ? AND status = 'PAUSED_NDP'
          `).run(ndp.bop_id);

          logAudit(userIdentifier, "NDP_RESOLVED", "NDP", id, `Resolved downtime NDP ${ndp.ndp_number}. Task resumed.`);
        });

        runTransaction();

        emitProductionUpdate("BOP_STATUS_CHANGED", { bopId: ndp.bop_id, status: "RUNNING", projectId: ndp.project_id });
        emitProductionUpdate("NDP_RESOLVED", { ndpId: id, bopId: ndp.bop_id, projectId: ndp.project_id });

        res.json({ success: true, message: `Task resumed. Total downtime recorded: ${downMinutes} minutes.` });
      } catch (err: any) {
        console.error("Error resuming NDP:", err);
        res.status(500).json({ error: err.message });
      }
    });

ndpRouter.post("/api/production/ndp/procure", (req, res) => {
      try {
        const { project_id, ndp_number, item_id, qty, expected_delivery_date, urgency } = req.body;

        if (!project_id || !ndp_number || !item_id || !qty) {
          return res.status(400).json({ error: "Missing required fields for downtime procurement" });
        }

        // Retrieve item info
        const item = db.prepare("SELECT * FROM items WHERE id = ?").get(item_id) as any;
        if (!item) {
          return res.status(404).json({ error: "Selected item not found in catalog" });
        }

        const prId = "PR-" + Math.random().toString(36).substr(2, 9);
        const prNumber = "PR-" + new Date().getFullYear() + "-" + Math.floor(100000 + Math.random() * 900000);

        let deliveryDateStr = expected_delivery_date;
        if (!deliveryDateStr) {
          const d = new Date();
          d.setDate(d.getDate() + 5); // 5 days delivery for downtime recovery
          deliveryDateStr = d.toISOString().split("T")[0];
        }

        const activeUrgency = urgency || "CRITICAL";

        const runTx = db.transaction(() => {
          // 1. Insert into purchase_requests
          db.prepare(`
            INSERT INTO purchase_requests (
              id, pr_number, project_id, drawing_reference, status, urgency, category, expected_delivery_date
            ) VALUES (?, ?, ?, ?, 'DRAFTED', ?, 'PROJECT', ?)
          `).run(
            prId,
            prNumber,
            project_id,
            `Downtime Procurement recovery for NDP: ${ndp_number}`,
            activeUrgency,
            deliveryDateStr
          );

          // 2. Insert into pr_items
          db.prepare(`
            INSERT INTO pr_items (
              id, pr_id, item_id, qty, unit_price, expected_delivery_date, spec
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            "PRI-" + Math.random().toString(36).substr(2, 9),
            prId,
            item_id,
            Number(qty),
            Number(item.unit_price) || 0,
            deliveryDateStr,
            `Required to resolve downtime NDP: ${ndp_number}`
          );

          // 3. Post notification to general thread
          const threadId = "THREAD-GENERAL";
          const msgId = "SYS-" + Math.random().toString(36).substr(2, 9);
          const projectName = db.prepare("SELECT name FROM projects WHERE id = ?").get(project_id) as { name: string };
          
          db.prepare(`
            INSERT INTO chat_messages (id, thread_id, sender_username, content)
            VALUES (?, ?, ?, ?)
          `).run(
            msgId,
            threadId,
            "SYSTEM",
            `**CRITICAL PRODUCTION DOWNTIME PURCHASE REQUEST**\n\n**Downtime Event:** ${ndp_number}\n**Required Item:** ${item.name} (${item.item_code})\n**Quantity:** ${qty} ${item.uom}\n**Project:** ${projectName?.name || "Unknown"}\n**Urgency:** ${activeUrgency}\n\nImmediate procurement action is required to resume manufacturing operations!`
          );
        });

        runTx();

        res.json({ success: true, pr_number: prNumber, message: `Procurement request ${prNumber} created and linked to project.` });
      } catch (err: any) {
        console.error("Error creating downtime PR:", err);
        res.status(500).json({ error: err.message });
      }
    });

