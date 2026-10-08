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
import { recalculateProjectFinancialSummary } from "../../services/projectHppService.ts";
import { calculateTieredOvertimePay } from "../../lib/hrisEngine.ts";
import { calculateWotCycleEstimation, computeStationManpowerBalancing } from "../../utils/wotCycleEngine.ts";

import { computeNdpRippleAnalysis, handleCreateNdp, handleGetNdps, handleGetActiveNdps, handleGetNdpImpactAnalysis, handlePreviewImpact, handleRescheduleTrigger, handleResolveNdp, emitProductionUpdate, getHeijunkaThreshold, getBomProcurementPipelineStatus, checkRecursivePredecessorsCompleted, getAvailableInputWipForBop, checkPredecessorsReadyForPipelining, syncProjectMaterialAndWakeProcesses, autoResolveDownstreamProductNodes, preemptiveAutoPauseConflictingSteps, planningCache, CACHE_TTL_MS, invalidatePlanningCache, handleCalculateLoad, handleGetProductionLogs, handleAcknowledgeFr, handleFulfillFr, handleRejectFr, handleCloseFr, autoStartDownstreamProcesses } from "./production_utils.ts";

export const executionRouter = Router();

executionRouter.get(
      "/api/production/analytics",
      requireRole(["PRODUCTION", "ENGINEERING"]),
      (req, res) => {
        try {
          // 1. Vendor Reliability (Lead Time Analysis)
          const vendorReliability = db
            .prepare(
              `
        SELECT 
          po.supplier_name,
          AVG(julianday(g.received_date) - julianday(po.created_at)) as avg_lead_time,
          COUNT(g.id) as total_deliveries
        FROM purchase_orders po 
        JOIN grns g ON po.id = g.po_id
        WHERE po.archived_at IS NULL AND po.status IN ('RECEIVED', 'PARTIAL')
        GROUP BY po.supplier_name
      `,
            )
            .all() as any[];

          // 2. Consumption Habits (BOM vs Actual)
          const consumptionHabits = db
            .prepare(
              `
        SELECT 
          p.name as project_name,
          SUM(b.required_qty * COALESCE(p.qty, 1)) as total_required,
          SUM(COALESCE(bic.qty_consumed, 0)) as total_consumed
        FROM projects p
        JOIN boms b ON p.id = b.project_id
        LEFT JOIN bom_item_consumption bic ON b.id = bic.bom_id
        WHERE p.status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED')
        GROUP BY p.id
      `,
            )
            .all() as any[];

          // 3. Current Active Personnel
          const activePersonnel = db
            .prepare(
              `
        SELECT COUNT(DISTINCT lre.operator_name) as count
        FROM lot_routing_executions lre
        WHERE lre.status IN ('RUNNING', 'IN_PROGRESS') AND lre.operator_name IS NOT NULL AND lre.operator_name != ''
      `,
            )
            .get() as any;

          

          res.json({ vendorReliability, consumptionHabits, activePersonnel: activePersonnel?.count || 0 });
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ error: "Failed to fetch production insights" });
        }
      },
    );

executionRouter.get("/api/work-centers", (req, res) => {
      try {
        const wcs = db.prepare("SELECT * FROM work_centers").all();
        res.json(wcs);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch work centers" });
      }
    });

executionRouter.post("/api/work-centers", (req, res) => {
      try {
        const {
          id,
          name,
          manpower_count,
          hours_per_day,
          days_per_week,
          efficiency_index,
          status,
        } = req.body;
        const capacity_per_week =
          manpower_count * hours_per_day * days_per_week;
        db.prepare(
          `
        INSERT INTO work_centers (id, name, manpower_count, hours_per_day, days_per_week, capacity_per_week, efficiency_index, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          manpower_count = excluded.manpower_count,
          hours_per_day = excluded.hours_per_day,
          days_per_week = excluded.days_per_week,
          capacity_per_week = excluded.capacity_per_week,
          efficiency_index = excluded.efficiency_index,
          status = excluded.status
      `,
        ).run(
          id,
          name,
          manpower_count,
          hours_per_day,
          days_per_week,
          capacity_per_week,
          efficiency_index || 1.0,
          status || "ACTIVE",
        );
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update work center" });
      }
    });

executionRouter.post(
      "/api/work-centers/bulk",
      requireRole(["FC", "PRODUCTION", "ENGINEERING"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (userRole !== "FC" && userLevel !== "MANAGER") {
          return res
            .status(403)
            .json({
              error:
                "Access denied. Only FC or production/engineering managers can configure work centers.",
            });
        }
        try {
          const { centers } = req.body;
          const stmt = db.prepare(`
        INSERT INTO work_centers (id, name, manpower_count, hours_per_day, days_per_week, capacity_per_week, efficiency_index, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          manpower_count = excluded.manpower_count,
          hours_per_day = excluded.hours_per_day,
          days_per_week = excluded.days_per_week,
          capacity_per_week = excluded.capacity_per_week,
          efficiency_index = excluded.efficiency_index,
          status = excluded.status
      `);

          const transaction = db.transaction(() => {
            for (const wc of centers) {
              const capacity =
                wc.manpower_count * wc.hours_per_day * wc.days_per_week;
              stmt.run(
                wc.id,
                wc.name,
                wc.manpower_count,
                wc.hours_per_day,
                wc.days_per_week,
                capacity,
                wc.efficiency_index || 1.0,
                wc.status || "ACTIVE",
              );
            }
          });
          transaction();
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to bulk update work centers" });
        }
      },
    );

executionRouter.delete("/api/work-centers/:id", (req, res) => {
      try {
        const tasksCountRow = db
          .prepare(
            "SELECT COUNT(*) as count FROM project_tasks WHERE work_center_id = ?",
          )
          .get(req.params.id) as { count: number };
        if (tasksCountRow.count > 0) {
          return res.status(400).json({
            error:
              "Cannot delete work center because it is assigned to existing tasks.",
          });
        }
        db.prepare("DELETE FROM work_centers WHERE id = ?").run(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete work center" });
      }
    });

executionRouter.post("/api/work-orders/:id/release", (req, res) => {
      try {
        const woId = req.params.id;
        const wo = db
          .prepare("SELECT * FROM work_orders WHERE id = ?")
          .get(woId) as any;
        if (!wo) return res.status(404).json({ error: "Work order not found" });

        const transaction = db.transaction(() => {
          // Hard Stock Reservation on Release with Pre-Flight Check
          const woItems = db
            .prepare("SELECT * FROM work_order_items WHERE wo_id = ?")
            .all(woId) as any[];

          // 1. Pre-flight check: Verify sufficient available free stock for all components
          for (const item of woItems) {
            const stockRow = db.prepare(`
              SELECT COALESCE(inv.available_qty, inv.free_stock, 0) as available_qty, i.name as item_name
              FROM inventory inv
              JOIN items i ON inv.item_id = i.id
              WHERE inv.item_id = (SELECT item_id FROM boms WHERE id = ?)
            `).get(item.bom_id) as { available_qty: number; item_name: string } | undefined;

            const freeStock = stockRow ? Number(stockRow.available_qty || 0) : 0;
            const required = Number(item.qty_to_consume || 0);

            if (freeStock < required) {
              throw new Error(
                `Insufficient stock for component "${stockRow?.item_name || 'Material'}". Required: ${required}, Available Free Stock: ${freeStock}`
              );
            }
          }

          const updateInventory = db.prepare(`
            UPDATE inventory 
            SET free_stock = free_stock - ?, 
                available_qty = available_qty - ?,
                allocated_stock = allocated_stock + ?,
                reserved_qty = reserved_qty + ?
            WHERE item_id = (SELECT item_id FROM boms WHERE id = ?) AND free_stock >= ?
          `);

          const recordMovement = db.prepare(`
            INSERT INTO stock_movements (id, item_id, project_id, type, qty, reference_id, recorded_by)
            VALUES (?, (SELECT item_id FROM boms WHERE id = ?), ?, 'ALLOCATION', ?, ?, ?)
          `);

          for (const item of woItems) {
            const info = updateInventory.run(
              item.qty_to_consume,
              item.qty_to_consume,
              item.qty_to_consume,
              item.qty_to_consume,
              item.bom_id,
              item.qty_to_consume
            );
            if (info.changes === 0) {
              throw new Error(`Insufficient stock for allocation of BOM item ${item.bom_id}`);
            }
            recordMovement.run(
              "MOV-" + Math.random().toString(36).substr(2, 9),
              item.bom_id,
              wo.project_id || null,
              item.qty_to_consume,
              woId,
              (req as any).headers?.["x-user-email"] || "PRODUCTION",
            );
          }

          // Assign initial Work Center from routing if defined, or create auto-routing if missing
          let firstRouting = db.prepare(`
            SELECT work_center_id, step_sequence 
            FROM work_center_routings 
            WHERE project_id = ? 
            ORDER BY step_sequence ASC 
            LIMIT 1
          `).get(wo.project_id) as { work_center_id: string; step_sequence: number } | undefined;

          if (!firstRouting) {
            // Auto-generate project routing sequence from existing work centers
            const allCenters = db.prepare("SELECT id, name FROM work_centers ORDER BY name ASC").all() as any[];
            if (allCenters.length > 0) {
              const insertRouting = db.prepare(`
                INSERT INTO work_center_routings (id, project_id, step_sequence, work_center_id, operation_name, standard_cycle_time_mins)
                VALUES (?, ?, ?, ?, ?, ?)
              `);
              allCenters.forEach((center, idx) => {
                const routId = "ROUT-AUTO-" + Date.now() + "-" + idx + "-" + Math.random().toString(36).substring(2, 5);
                insertRouting.run(
                  routId,
                  wo.project_id,
                  idx + 1,
                  center.id,
                  `${center.name} Operation`,
                  30
                );
              });
              firstRouting = { work_center_id: allCenters[0].id, step_sequence: 1 };
            }
          }

          if (firstRouting) {
            db.prepare(
              "UPDATE work_orders SET status = 'RELEASED', current_work_center_id = ?, current_step_sequence = ?, wip_status = 'IN_BUFFER' WHERE id = ?",
            ).run(firstRouting.work_center_id, firstRouting.step_sequence, woId);

            db.prepare(`
              UPDATE work_centers 
              SET current_wip_count = (
                SELECT COUNT(*) FROM work_orders WHERE current_work_center_id = ? AND status IN ('RELEASED', 'IN_PROGRESS')
              ) WHERE id = ?
            `).run(firstRouting.work_center_id, firstRouting.work_center_id);
          } else {
            db.prepare(
              "UPDATE work_orders SET status = 'RELEASED', wip_status = 'IN_BUFFER' WHERE id = ?",
            ).run(woId);
          }
        });

        transaction();
        if (wo.project_id) {
          try {
            syncProjectMaterialAndWakeProcesses(wo.project_id, (req as any).headers?.["x-user-email"] || "PRODUCTION");
          } catch (e) {
            console.error("Error in syncProjectMaterialAndWakeProcesses on WO release:", e);
          }
        }
        res.json({ success: true });
      } catch (error: any) {
        console.error(error);
        res
          .status(400)
          .json({ error: error.message || "Failed to release work order" });
      }
    });

executionRouter.post("/api/work-orders/:id/complete", (req, res) => {
      try {
        const woId = req.params.id;
        const wo = db
          .prepare("SELECT * FROM work_orders WHERE id = ?")
          .get(woId) as any;
        if (!wo) return res.status(404).json({ error: "Work order not found" });

        const prevWorkCenterId = wo.current_work_center_id;

        const transaction = db.transaction(() => {
          // Consume Allocated & Reserved Stock on Complete
          const woItems = db
            .prepare("SELECT * FROM work_order_items WHERE wo_id = ?")
            .all(woId) as any[];

          const updateInventory = db.prepare(`
            UPDATE inventory 
            SET allocated_stock = allocated_stock - ?,
                reserved_qty = reserved_qty - ?,
                physical_qty = physical_qty - ?
            WHERE item_id = (SELECT item_id FROM boms WHERE id = ?)
          `);

          const recordConsumption = db.prepare(`
            INSERT INTO stock_movements (id, item_id, project_id, type, qty, reference_id, recorded_by)
            VALUES (?, (SELECT item_id FROM boms WHERE id = ?), ?, 'CONSUMPTION', ?, ?, ?)
          `);

          const upsertBOMConsumption = db.prepare(`
            INSERT INTO bom_item_consumption (id, bom_id, qty_consumed)
            VALUES (?, ?, ?)
            ON CONFLICT(bom_id) DO UPDATE SET
              qty_consumed = bom_item_consumption.qty_consumed + excluded.qty_consumed,
              updated_at = CURRENT_TIMESTAMP
          `);

          for (const item of woItems) {
            const consumeQty = Number(item.qty_to_consume || 0);
            updateInventory.run(consumeQty, consumeQty, consumeQty, item.bom_id);
            recordConsumption.run(
              "MOV-" + Math.random().toString(36).substr(2, 9),
              item.bom_id,
              wo.project_id || null,
              -consumeQty,
              woId,
              (req as any).headers?.["x-user-email"] || "PRODUCTION",
            );
            upsertBOMConsumption.run(
              "BIC-" + Math.random().toString(36).substr(2, 9),
              item.bom_id,
              consumeQty,
            );
          }

          db.prepare(
            "UPDATE work_orders SET status = 'COMPLETED', wip_status = 'COMPLETED', current_work_center_id = NULL, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(woId);

          if (prevWorkCenterId) {
            db.prepare(`
              UPDATE work_centers 
              SET current_wip_count = (
                SELECT COUNT(*) FROM work_orders WHERE current_work_center_id = ? AND status IN ('RELEASED', 'IN_PROGRESS')
              ) WHERE id = ?
            `).run(prevWorkCenterId, prevWorkCenterId);
          }
        });

        transaction();
        res.json({ success: true });
      } catch (error: any) {
        console.error(error);
        res
          .status(400)
          .json({ error: error.message || "Failed to complete work order" });
      }
    });

executionRouter.post("/api/production/work-orders/:id/move-wip", (req, res) => {
      try {
        const woId = req.params.id;
        const { to_work_center_id, step_sequence, operation_name, good_qty, scrap_qty, notes } = req.body;

        if (!to_work_center_id || step_sequence === undefined) {
          return res.status(400).json({ error: "Missing required fields: to_work_center_id, step_sequence" });
        }

        const wo = db.prepare("SELECT * FROM work_orders WHERE id = ?").get(woId) as any;
        if (!wo) return res.status(404).json({ error: "Work Order not found" });

        const from_work_center_id = wo.current_work_center_id;

        const destWc = db.prepare("SELECT * FROM work_centers WHERE id = ?").get(to_work_center_id) as any;
        if (!destWc) return res.status(404).json({ error: "Destination Work Center not found" });

        const currentWipRow = db.prepare(`
          SELECT COUNT(*) as count 
          FROM work_orders 
          WHERE current_work_center_id = ? AND status IN ('RELEASED', 'IN_PROGRESS') AND id != ?
        `).get(to_work_center_id, woId) as { count: number };

        const currentDestWip = currentWipRow?.count || 0;
        const wipLimit = Number(destWc.wip_limit || 20);

        if (currentDestWip >= wipLimit) {
          return res.status(400).json({
            error: `CONWIP Limit Reached: Work Center "${destWc.name}" is at maximum WIP capacity (${currentDestWip}/${wipLimit} units). Clear downstream bottlenecks before advancing.`,
            destWcName: destWc.name,
            currentDestWip,
            wipLimit,
          });
        }

        const transaction = db.transaction(() => {
          const movementId = "WIP-MOV-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
          db.prepare(`
            INSERT INTO wip_movements (id, work_order_id, from_work_center_id, to_work_center_id, step_sequence, good_qty, scrap_qty, operator_email, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            movementId,
            woId,
            from_work_center_id || null,
            to_work_center_id,
            step_sequence,
            good_qty || 1,
            scrap_qty || 0,
            (req.headers["x-user-email"] as string) || "OPERATOR",
            notes || `Moved to ${destWc.name} (Step ${step_sequence}: ${operation_name || 'Processing'})`
          );

          db.prepare(`
            UPDATE work_orders 
            SET current_work_center_id = ?, 
                current_step_sequence = ?, 
                status = 'IN_PROGRESS', 
                wip_status = 'IN_PROCESS' 
            WHERE id = ?
          `).run(to_work_center_id, step_sequence, woId);

          if (from_work_center_id) {
            db.prepare(`
              UPDATE work_centers 
              SET current_wip_count = (
                SELECT COUNT(*) FROM work_orders WHERE current_work_center_id = ? AND status IN ('RELEASED', 'IN_PROGRESS')
              ) WHERE id = ?
            `).run(from_work_center_id, from_work_center_id);
          }

          db.prepare(`
            UPDATE work_centers 
            SET current_wip_count = (
              SELECT COUNT(*) FROM work_orders WHERE current_work_center_id = ? AND status IN ('RELEASED', 'IN_PROGRESS')
            ) WHERE id = ?
          `).run(to_work_center_id, to_work_center_id);

          logAudit(
            (req.headers["x-user-email"] as string) || "SYSTEM",
            "MOVE_WIP_STAGE",
            "WORK_ORDER",
            woId,
            `Moved WO ${wo.wo_number} to ${destWc.name} (Step ${step_sequence})`
          );
        });

        transaction();
        res.json({ success: true, message: `Work Order ${wo.wo_number} moved to ${destWc.name}` });
      } catch (error: any) {
        console.error("Error moving WIP stage:", error);
        res.status(500).json({ error: error.message || "Failed to move WIP stage" });
      }
    });

executionRouter.post("/api/production/work-centers/:id/wip-limit", (req, res) => {
      try {
        const wcId = req.params.id;
        const { wip_limit } = req.body;
        const num = parseInt(wip_limit, 10);
        if (isNaN(num) || num < 1) {
          return res.status(400).json({ error: "Invalid CONWIP limit value. Must be a positive integer." });
        }

        db.prepare("UPDATE work_centers SET wip_limit = ? WHERE id = ?").run(num, wcId);

        logAudit(
          (req.headers["x-user-email"] as string) || "SYSTEM",
          "UPDATE_CONWIP_LIMIT",
          "WORK_CENTER",
          wcId,
          `Updated CONWIP limit to ${num} units for Work Center ${wcId}`
        );

        res.json({ success: true, wip_limit: num });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

executionRouter.get("/api/production/work-center-routings", (req, res) => {
      try {
        const { project_id } = req.query;
        let query = `
          SELECT r.*, wc.name as work_center_name, wc.wip_limit, p.name as project_name
          FROM work_center_routings r
          JOIN work_centers wc ON r.work_center_id = wc.id
          LEFT JOIN projects p ON r.project_id = p.id
        `;
        const params: any[] = [];
        if (project_id) {
          query += " WHERE r.project_id = ?";
          params.push(project_id);
        }
        query += " ORDER BY r.step_sequence ASC";

        const routings = db.prepare(query).all(...params);
        res.json(routings);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

executionRouter.post("/api/production/work-center-routings", (req, res) => {
      try {
        const { project_id, routings } = req.body;
        if (!project_id || !Array.isArray(routings)) {
          return res.status(400).json({ error: "Invalid payload: project_id and routings array required." });
        }

        const transaction = db.transaction(() => {
          db.prepare("DELETE FROM work_center_routings WHERE project_id = ?").run(project_id);

          const stmt = db.prepare(`
            INSERT INTO work_center_routings (id, project_id, step_sequence, work_center_id, operation_name, standard_cycle_time_mins)
            VALUES (?, ?, ?, ?, ?, ?)
          `);

          routings.forEach((r: any, idx: number) => {
            const id = "ROUT-" + Date.now() + "-" + idx + "-" + Math.random().toString(36).substring(2, 5);
            stmt.run(
              id,
              project_id,
              r.step_sequence || (idx + 1),
              r.work_center_id,
              r.operation_name || `Step ${idx + 1}`,
              r.standard_cycle_time_mins || 30
            );
          });
        });

        transaction();
        res.json({ success: true, count: routings.length });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

executionRouter.post(["/api/production/bop", "/api/production/bop/sync"], (req, res) => {
      try {
        const { project_id, steps, auth_pin, eco_reason, is_draft } = req.body;
        if (!project_id || !Array.isArray(steps)) {
          return res.status(400).json({ error: "project_id and steps array are required" });
        }

        const nonMfgIds = ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"];
        if (typeof project_id === "string" && nonMfgIds.includes(project_id.toUpperCase())) {
          return res.status(400).json({ error: "Internal procurement categories cannot have BoP records." });
        }

        const project = db.prepare("SELECT status, bop_status, bom_status FROM projects WHERE id = ?").get(project_id) as any;
        
        if (!project || project.status !== "ACTIVE") {
          return res.status(400).json({
            error: "Cannot modify BOP of a project that is not ACTIVE. Current status: " + (project?.status || "NOT FOUND"),
          });
        }

        // Enforce: Cannot submit BOP for approval if BOM is not authorized yet
        if (!is_draft) {
          const currentBomStatus = (project.bom_status || 'DRAFT').toUpperCase();
          if (currentBomStatus !== 'AUTHORIZED') {
            return res.status(400).json({
              error: `Tidak dapat mengajukan (submit) BOP untuk otorisasi karena Bill of Materials (BOM/BOQ) proyek ini belum ter-otorisasi (Status BOM saat ini: ${project.bom_status || 'DRAFT'}). Anda tetap dapat menyimpan alur proses sebagai Draft (SAVE DRAFT) sampai BOM disetujui.`,
              bom_not_authorized: true,
              current_bom_status: project.bom_status || 'DRAFT'
            });
          }

          // Enforce: Station requirement (>= 1 station) and all processes assigned
          const projectStations = db.prepare("SELECT id, station_code, station_name FROM project_stations WHERE project_id = ?").all(project_id) as any[];
          if (projectStations.length < 1) {
            return res.status(400).json({
              error: "Validation Failed: At least 1 workstation must be registered (>= 1) before submitting BOP for approval.",
              no_stations: true
            });
          }

          const processSteps = steps.filter((s: any) => (s.node_type || "PROCESS") === "PROCESS");
          if (processSteps.length === 0) {
            return res.status(400).json({
              error: "Validation Failed: At least 1 manufacturing process step is required before submitting BOP for approval."
            });
          }

          const validStationIds = new Set(projectStations.map((st: any) => st.id));
          const unassignedSteps = processSteps.filter((s: any) => !s.station_id || !validStationIds.has(s.station_id));
          if (unassignedSteps.length > 0) {
            const unassignedNames = unassignedSteps.map((s: any) => s.process_name || 'Unnamed Process').join(", ");
            return res.status(400).json({
              error: `Validation Failed: All processes must be assigned to a station before submitting for approval. Found ${unassignedSteps.length} unassigned process(es): ${unassignedNames}.`,
              unassigned_processes: unassignedSteps.map((s: any) => s.id)
            });
          }
        }

        const hasManufacturing = db.prepare("SELECT count(*) as c FROM work_orders WHERE project_id = ?").get(project_id) as any;
        const hasStartedTasks = db.prepare("SELECT count(*) as c FROM project_tasks WHERE project_id = ? AND progress > 0").get(project_id) as any;
        const isManufacturing = hasManufacturing.c > 0 || hasStartedTasks.c > 0 || project.status === "MANUFACTURING";

        const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || (req as any).userEmail || (req as any).username || "admin";
        const now = new Date().toISOString();
        const isAuthorizedState = project.bop_status === 'AUTHORIZED';
        const isEco = !is_draft && (isAuthorizedState || !!auth_pin || !!eco_reason);

        if (is_draft) {
          const currentBopStatus = project.bop_status || 'DRAFT';
          if (currentBopStatus !== 'PENDING' && currentBopStatus !== 'AUTHORIZED') {
            db.prepare("UPDATE projects SET bop_status = 'DRAFT' WHERE id = ?").run(project_id);
          }
        } else if (isEco) {
          if (!auth_pin) {
            return res.status(400).json({
              error: "BOP telah diotorisasi sebelumnya. Perubahan memerlukan otorisasi ECO dengan Daily Internal Auth Key (PIN).",
              require_eco: true,
            });
          }
          if (!isValidDailyAuthKey(userIdentifier, auth_pin)) {
            return res.status(400).json({ error: "Daily Internal Auth Key tidak valid atau salah." });
          }
          if (!eco_reason || !eco_reason.trim()) {
            return res.status(400).json({ error: "Alasan perubahan teknis (ECO Reason) wajib diisi." });
          }
          db.prepare("UPDATE projects SET bop_status = 'AUTHORIZED', bop_authorized_by = ?, bop_authorized_at = ?, bop_revision_note = NULL WHERE id = ?").run(userIdentifier, now, project_id);
          logAudit(userIdentifier, "ECO_SUBMITTED", "BOP", project_id, `BOP changed via ECO. Reason: ${eco_reason || "N/A"}`);
        } else {
          // Standard initial submission or re-submission from REVISION/DRAFT
          db.prepare("UPDATE projects SET bop_status = 'PENDING', bop_submitted_by = ?, bop_submitted_at = ?, bop_prepared_by = COALESCE(bop_prepared_by, ?), bop_prepared_at = COALESCE(bop_prepared_at, ?), bop_revision_note = NULL WHERE id = ?").run(userIdentifier, now, userIdentifier, now, project_id);
          logAudit(userIdentifier, "BOP_SUBMITTED", "BOP", project_id, `BOP submitted for approval by ${userIdentifier}`);
        }

        // Validate BOM Allocations
        const totalAllocations: Record<string, number> = {};
        for (const step of steps) {
          if (step.node_type === 'PRODUCT' && step.bom_allocations) {
            let allocations: any[] = [];
            try {
              allocations = typeof step.bom_allocations === 'string' ? JSON.parse(step.bom_allocations) : step.bom_allocations;
            } catch (e) {}
            if (Array.isArray(allocations)) {
              for (const alloc of allocations) {
                if (alloc.bom_id && alloc.fraction) {
                  totalAllocations[alloc.bom_id] = (totalAllocations[alloc.bom_id] || 0) + Number(alloc.fraction);
                  // Float precision fix
                  if (totalAllocations[alloc.bom_id] > 1.0001) {
                     return res.status(400).json({ error: `Total allocation for BOM item ${alloc.bom_id} exceeds 100%.` });
                  }
                }
              }
            }
          }
        }

        const runTransaction = db.transaction(() => {
          // Keep existing actual progress/status if updating
          const existing = db.prepare(`SELECT * FROM bill_of_processes WHERE project_id = ?`).all(project_id) as any[];
          const existingMap = new Map(existing.map(e => [e.id, e]));

          // Get new IDs
          const newStepIds = steps.map((s: any) => s.id).filter(Boolean);
          
          // Clean up dependent child tables first to avoid FOREIGN KEY constraint failed
          if (newStepIds.length > 0) {
            const placeholders = newStepIds.map(() => '?').join(',');
            try {
              db.prepare(`DELETE FROM task_travel_tags WHERE project_id = ? AND bop_id NOT IN (${placeholders})`).run(project_id, ...newStepIds);
            } catch (e) { console.warn("Travel tags clean error:", e); }
            try {
              db.prepare(`DELETE FROM notice_to_down_processes WHERE project_id = ? AND bop_id NOT IN (${placeholders})`).run(project_id, ...newStepIds);
            } catch (e) { console.warn("NDP clean error:", e); }
            try {
              db.prepare(`DELETE FROM production_manpower_assignments WHERE project_id = ? AND bop_id NOT IN (${placeholders})`).run(project_id, ...newStepIds);
            } catch (e) { console.warn("Manpower clean error:", e); }
            try {
              db.prepare(`DELETE FROM lot_routing_executions WHERE bop_id IN (SELECT id FROM bill_of_processes WHERE project_id = ? AND id NOT IN (${placeholders}))`).run(project_id, ...newStepIds);
            } catch (e) { console.warn("Lot exec clean error:", e); }

            db.prepare(`DELETE FROM bill_of_processes WHERE project_id = ? AND id NOT IN (${placeholders})`).run(project_id, ...newStepIds);
            db.prepare(`DELETE FROM project_tasks WHERE project_id = ? AND id NOT IN (${placeholders})`).run(project_id, ...newStepIds);
          } else {
            try { db.prepare(`DELETE FROM task_travel_tags WHERE project_id = ?`).run(project_id); } catch (e) {}
            try { db.prepare(`DELETE FROM notice_to_down_processes WHERE project_id = ?`).run(project_id); } catch (e) {}
            try { db.prepare(`DELETE FROM production_manpower_assignments WHERE project_id = ?`).run(project_id); } catch (e) {}
            try { db.prepare(`DELETE FROM lot_routing_executions WHERE bop_id IN (SELECT id FROM bill_of_processes WHERE project_id = ?)`).run(project_id); } catch (e) {}

            db.prepare(`DELETE FROM bill_of_processes WHERE project_id = ?`).run(project_id);
            db.prepare(`DELETE FROM project_tasks WHERE project_id = ?`).run(project_id);
          }

          const insertStmt = db.prepare(`
            INSERT INTO bill_of_processes (
              id, project_id, step_sequence, process_name, node_type, work_center_id, work_center_name,
              execution_type, predecessor_ids, standard_hours, manpower_allocated, shift_mode,
              start_date, end_date, actual_start_date, actual_end_date, status, progress, notes,
              completed_by_operator, completed_at_timestamp, cycle_time_minutes, qc_criteria, sop_instruction,
              bom_allocations, lifecycle_status, expected_yield_rate, station_id, assigned_machine_id, setup_time_minutes, teardown_time_minutes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              step_sequence = excluded.step_sequence,
              process_name = excluded.process_name,
              node_type = excluded.node_type,
              work_center_id = excluded.work_center_id,
              work_center_name = excluded.work_center_name,
              execution_type = excluded.execution_type,
              predecessor_ids = excluded.predecessor_ids,
              standard_hours = excluded.standard_hours,
              manpower_allocated = excluded.manpower_allocated,
              shift_mode = excluded.shift_mode,
              start_date = excluded.start_date,
              end_date = excluded.end_date,
              notes = excluded.notes,
              cycle_time_minutes = excluded.cycle_time_minutes,
              qc_criteria = excluded.qc_criteria,
              sop_instruction = excluded.sop_instruction,
              bom_allocations = excluded.bom_allocations,
              lifecycle_status = excluded.lifecycle_status,
              expected_yield_rate = excluded.expected_yield_rate,
              station_id = excluded.station_id,
              assigned_machine_id = excluded.assigned_machine_id,
              setup_time_minutes = excluded.setup_time_minutes,
              teardown_time_minutes = excluded.teardown_time_minutes
          `);

          // Also mirror to project_tasks so existing Gantt charts/reporting stay in sync automatically
          const insertTaskStmt = db.prepare(`
            INSERT INTO project_tasks (
              id, project_id, task_name, work_center_id, required_hours, start_date, end_date,
              actual_start_date, actual_end_date, progress, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              task_name = excluded.task_name,
              work_center_id = excluded.work_center_id,
              required_hours = excluded.required_hours,
              start_date = excluded.start_date,
              end_date = excluded.end_date
          `);

          let cumulativeDayOffset = 0;
          const today = new Date();
          const todayIso = today.toISOString().split("T")[0];

          steps.forEach((step: any, index: number) => {
            const bopId = step.id || `bop_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`;
            const prev = existingMap.get(bopId);
            
            const nodeType = step.node_type || 'PROCESS';
            const standardHours = nodeType === 'PRODUCT' ? 0 : (Number(step.standard_hours) || 1);
            const manpower = nodeType === 'PRODUCT' ? 0 : (Number(step.manpower_allocated) || 1);
            const shiftMode = nodeType === 'PRODUCT' ? 0 : (Number(step.shift_mode) || 1);
            const durationDays = Math.max(1, Math.ceil(standardHours / 8));

            let startDate = step.start_date;
            let endDate = step.end_date;

            if (!startDate || startDate === "" || startDate === "null" || startDate === "undefined") {
              const startObj = new Date(today);
              if (step.execution_type === 'SERIAL') {
                startObj.setDate(startObj.getDate() + cumulativeDayOffset);
              }
              startDate = !isNaN(startObj.getTime()) ? startObj.toISOString().split("T")[0] : todayIso;
            }

            if (!endDate || endDate === "" || endDate === "null" || endDate === "undefined") {
              const startParsed = new Date(startDate);
              const endObj = !isNaN(startParsed.getTime()) ? new Date(startParsed) : new Date(today);
              endObj.setDate(endObj.getDate() + durationDays);
              endDate = !isNaN(endObj.getTime()) ? endObj.toISOString().split("T")[0] : todayIso;
            }

            // Guaranteed non-null fallback dates
            if (!startDate) startDate = todayIso;
            if (!endDate) endDate = startDate || todayIso;

            if (step.execution_type === 'SERIAL') {
              cumulativeDayOffset += durationDays;
            }

            const status = prev?.status || step.status || 'PENDING';
            const progress = prev?.progress || step.progress || 0;

            const cycleTimeMins = Number(step.cycle_time_minutes) || (standardHours > 0 ? standardHours * 60 : 10);

            // Sanitize work_center_id against work_centers foreign key constraint
            let targetWcId: string | null = step.work_center_id ? String(step.work_center_id).trim() : null;
            if (!targetWcId || targetWcId === "" || targetWcId === "undefined" || targetWcId === "null") {
              targetWcId = null;
            } else {
              const wcCheck = db.prepare("SELECT id FROM work_centers WHERE id = ?").get(targetWcId) as any;
              if (!wcCheck) {
                if (step.work_center_name && String(step.work_center_name).trim() !== "") {
                  const wcNameStr = String(step.work_center_name).trim();
                  const wcNameCheck = db.prepare("SELECT id FROM work_centers WHERE name = ? OR code = ?").get(wcNameStr, wcNameStr) as any;
                  if (wcNameCheck) {
                    targetWcId = wcNameCheck.id;
                  } else {
                    try {
                      db.prepare("INSERT OR IGNORE INTO work_centers (id, name, manpower_count, hours_per_day) VALUES (?, ?, 1, 8)")
                        .run(targetWcId, wcNameStr);
                    } catch (e) {
                      console.warn("Could not auto-insert work_center:", e);
                      targetWcId = null;
                    }
                  }
                } else {
                  targetWcId = null;
                }
              }
            }

            let bomAllocationsStr = '[]';
            if (step.bom_allocations) {
              bomAllocationsStr = typeof step.bom_allocations === 'string' ? step.bom_allocations : JSON.stringify(step.bom_allocations);
            }

            insertStmt.run(
              bopId,
              project_id,
              index + 1,
              step.process_name,
              nodeType,
              targetWcId,
              step.work_center_name || null,
              step.execution_type || 'SERIAL',
              JSON.stringify(step.predecessor_ids || []),
              standardHours,
              manpower,
              shiftMode,
              startDate,
              endDate,
              prev?.actual_start_date || null,
              prev?.actual_end_date || null,
              status,
              progress,
              step.notes || null,
              prev?.completed_by_operator || null,
              prev?.completed_at_timestamp || null,
              cycleTimeMins,
              step.qc_criteria || null,
              step.sop_instruction || null,
              bomAllocationsStr,
              
              step.lifecycle_status || prev?.lifecycle_status || 'Planned',
              step.expected_yield_rate ?? 100.0,
              
              step.station_id || null,
              step.assigned_machine_id || null,
              Number(step.setup_time_minutes) || 0,
              Number(step.teardown_time_minutes) || 0
            );

            // Mirror into project_tasks
            insertTaskStmt.run(
              bopId,
              project_id,
              step.process_name,
              targetWcId,
              standardHours,
              startDate,
              endDate,
              prev?.actual_start_date || null,
              prev?.actual_end_date || null,
              progress,
              status
            );
          });
        });

        const existingBefore = db.prepare(`SELECT id FROM bill_of_processes WHERE project_id = ?`).all(project_id) as any[];
        const existingIdsBefore = new Set(existingBefore.map(e => e.id));

        try {
          db.pragma("foreign_keys = OFF;");
          runTransaction();
        } finally {
          db.pragma("foreign_keys = ON;");
        }

        // --- COMPREHENSIVE DUAL-WRITE & FIRESTORE SYNC ---
        const currentSavedRows = db.prepare("SELECT * FROM bill_of_processes WHERE project_id = ? ORDER BY step_sequence ASC").all(project_id) as any[];
        const currentSavedIds = new Set(currentSavedRows.map(r => r.id));

        // Insert ECO log entry if this update is an authorized ECO revision
        if (isEco) {
          try {
            const ecoId = `eco_bop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const ecoCount = (db.prepare("SELECT count(*) as c FROM eco_logs WHERE project_id = ? AND doc_type = 'BOP'").get(project_id) as any)?.c || 0;
            const ecoNum = `ECO-BOP-${project_id}-REV${String(ecoCount + 1).padStart(2, "0")}`;

            db.prepare(`
              INSERT INTO eco_logs (id, project_id, doc_type, eco_number, eco_reason, authorized_by, authorized_at, previous_bom, current_bom)
              VALUES (?, ?, 'BOP', ?, ?, ?, ?, ?, ?)
            `).run(
              ecoId,
              project_id,
              ecoNum,
              eco_reason || "BOP Process Routing & Workflow Technical Revision",
              userIdentifier,
              now,
              JSON.stringify(existingBefore || []),
              JSON.stringify(currentSavedRows || [])
            );
          } catch (ecoErr) {
            console.error("Failed to insert BOP ECO log:", ecoErr);
          }
        }

        // 1. Delete removed steps from Firestore
        for (const oldId of existingIdsBefore) {
          if (!currentSavedIds.has(oldId)) {
            deleteDocFromFirestore("bill_of_processes", oldId);
          }
        }

        // 2. Sync all current saved steps to Firestore
        for (const bopRow of currentSavedRows) {
          syncCollectionToFirestore("bill_of_processes", bopRow.id, bopRow);
        }

        // 3. Sync project record to Firestore
        const projRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(project_id) as any;
        if (projRow) {
          syncCollectionToFirestore("projects", project_id, projRow);
        }

        // 4. Recalculate Gantt Tasks based on updated BOP DAG Precedence Graph
        syncProjectGanttTasks(project_id);

        res.json({ success: true, message: "Bill of Process saved successfully", count: currentSavedRows.length });
      } catch (err: any) {
        console.error("Error saving BoP:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post(
      "/api/projects/:id/bop/authorize",
      requireRole(["ENGINEERING", "PRODUCTION", "FC"]),
      (req, res) => {
        try {
          const userRole = (req as any).userRole;
          const userLevel = (req as any).userLevel;
          if (userRole !== "FC" && userLevel !== "MANAGER" && !(req as any).userEmail?.includes("admin")) {
            return res.status(403).json({ error: "Access denied. Only Manager or FC can authorize BOP." });
          }

          const projectId = req.params.id;
          const { pin } = req.body;
          if (!pin) return res.status(400).json({ error: "PIN is required" });

          const proj = db.prepare("SELECT bom_status FROM projects WHERE id = ?").get(projectId) as any;
          if (proj && (proj.bom_status || 'DRAFT').toUpperCase() !== 'AUTHORIZED') {
            return res.status(400).json({
              error: `Tidak dapat mengotorisasi BOP karena Bill of Materials (BOM/BOQ) proyek ini belum ter-otorisasi (Status BOM saat ini: ${proj.bom_status || 'DRAFT'}). Otorisasi BOM terlebih dahulu.`,
              bom_not_authorized: true
            });
          }

          const projStations = db.prepare("SELECT id FROM project_stations WHERE project_id = ?").all(projectId) as any[];
          if (projStations.length < 1) {
            return res.status(400).json({
              error: "Cannot authorize BOP: At least 1 workstation must be registered (>= 1) for this project."
            });
          }

          const bopProcessSteps = db.prepare("SELECT id, process_name, station_id FROM bill_of_processes WHERE project_id = ? AND (node_type = 'PROCESS' OR node_type IS NULL)").all(projectId) as any[];
          if (bopProcessSteps.length === 0) {
            return res.status(400).json({
              error: "Cannot authorize BOP: At least 1 manufacturing process step is required."
            });
          }

          const validStationIds = new Set(projStations.map((st: any) => st.id));
          const unassignedSteps = bopProcessSteps.filter(s => !s.station_id || !validStationIds.has(s.station_id));
          if (unassignedSteps.length > 0) {
            const unassignedNames = unassignedSteps.map((s: any) => s.process_name || 'Unnamed Process').join(", ");
            return res.status(400).json({
              error: `Cannot authorize BOP: All processes must be assigned to a station. Found ${unassignedSteps.length} unassigned process(es): ${unassignedNames}.`
            });
          }

          const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || (req as any).userEmail || (req as any).username || "admin";
          if (!isValidDailyAuthKey(userIdentifier, pin)) {
            return res.status(400).json({ error: "Invalid Daily Internal Auth Key." });
          }

          const now = new Date().toISOString();
          db.prepare("UPDATE projects SET bop_status = 'AUTHORIZED', bop_authorized_by = ?, bop_authorized_at = ?, bop_revision_note = NULL WHERE id = ?").run(userIdentifier, now, projectId);

          logAudit(userIdentifier, "BOP_AUTHORIZED", "BOP", projectId, `BOP Document Authorized by ${userIdentifier}`);
          res.json({ success: true, bop_status: 'AUTHORIZED', bop_authorized_by: userIdentifier, bop_authorized_at: now });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      }
    );

executionRouter.post(
      "/api/projects/:id/bop/revise",
      requireRole(["ENGINEERING", "PRODUCTION", "FC"]),
      (req, res) => {
        try {
          const userRole = (req as any).userRole;
          const userLevel = (req as any).userLevel;
          if (userRole !== "FC" && userLevel !== "MANAGER" && !(req as any).userEmail?.includes("admin")) {
            return res.status(403).json({ error: "Access denied. Only Manager or FC can revise BOP." });
          }

          const projectId = req.params.id;
          const { note } = req.body;
          if (!note) return res.status(400).json({ error: "Revision note is required" });

          const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || (req as any).userEmail || (req as any).username || "admin";

          db.prepare("UPDATE projects SET bop_status = 'REVISION', bop_revision_note = ? WHERE id = ?").run(note, projectId);

          logAudit(userIdentifier, "BOP_REVISION", "BOP", projectId, "BOP Marked for Revision. Note: " + note);
          res.json({ success: true, bop_status: 'REVISION', bop_revision_note: note });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      }
    );

executionRouter.post("/api/production/projects/:id/set-master", (req, res) => {
      try {
        const { id } = req.params;
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }

        const bopSteps = db.prepare("SELECT * FROM bill_of_processes WHERE project_id = ? AND node_type != 'PRODUCT'").all(id) as any[];
        if (bopSteps.length === 0) {
          return res.status(400).json({ error: "No Bill of Process (BoP) steps found for this project. Please build routing first." });
        }

        const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || (req as any).userEmail || (req as any).username || "Production Planner";

        // Initialize Product Node Lifecycles
        const productNodes = db.prepare("SELECT * FROM bill_of_processes WHERE project_id = ? AND node_type = 'PRODUCT'").all(id) as any[];
        const insertLifecycle = db.prepare(`
          INSERT INTO product_node_lifecycle (id, project_id, bop_step_id, status, qty, location)
          VALUES (?, ?, ?, 'PLANNED', 0, 'STAGING')
        `);

        for (const node of productNodes) {
          const existing = db.prepare("SELECT id FROM product_node_lifecycle WHERE bop_step_id = ?").get(node.id);
          if (!existing) {
            insertLifecycle.run(crypto.randomUUID(), id, node.id);
          }
        }

        db.prepare(`
          UPDATE projects
          SET is_master_set = 1, master_set_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(id);

        logAudit(userIdentifier, "MASTER_DATA_SET", "PROJECT", id, `Master Data & Operator Assignments set and locked for project ${project.name}`);

        res.json({ success: true, message: "Master Data & Assignments set successfully" });
      } catch (err: any) {
        console.error("Error setting master data:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/production/projects/:id/unlock-master", (req, res) => {
      try {
        const { id } = req.params;
        db.prepare(`UPDATE projects SET is_master_set = 0 WHERE id = ?`).run(id);
        res.json({ success: true, message: "Master Data unlocked for editing" });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/production/projects/:id/start-all", (req, res) => {
      try {
        const { id } = req.params;
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }

        const activeNdp = db.prepare(`SELECT COUNT(*) as count FROM notice_to_down_processes WHERE project_id = ? AND status = 'ACTIVE'`).get(id) as any;
        if (activeNdp && activeNdp.count > 0) {
          return res.status(400).json({ error: "Cannot start production line while there is an ACTIVE downtime notice (NDP). Resolve it first." });
        }

        const bopSteps = db.prepare("SELECT * FROM bill_of_processes WHERE project_id = ? AND node_type != 'PRODUCT' ORDER BY step_sequence ASC").all(id) as any[];
        if (bopSteps.length === 0) {
          return res.status(400).json({ error: "No routing process steps found." });
        }

        const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || (req as any).userEmail || (req as any).username || "Production Supervisor";
        const nowIso = new Date().toISOString();

        let startedCount = 0;
        const projectLots = db.prepare(`SELECT * FROM production_lots WHERE project_id = ? ORDER BY lot_number ASC`).all(id) as any[];

        db.transaction(() => {
          for (let i = 0; i < bopSteps.length; i++) {
            const step = bopSteps[i];
            if (step.status === 'COMPLETED' || step.status === 'RUNNING') continue;

            const predCheck = checkPredecessorsReadyForPipelining(step.id, id);
            
            // Check step predecessors specifically for lots
            let predIds: string[] = [];
            if (step.predecessor_ids) {
              try {
                const parsed = JSON.parse(step.predecessor_ids);
                if (Array.isArray(parsed)) predIds = parsed;
              } catch (e) {
                predIds = [];
              }
            } else if (i > 0) {
              predIds = [bopSteps[i - 1].id];
            }

            for (const lot of projectLots) {
              let isLotUnlocked = true;
              const procPredIds = predIds.filter(pId => {
                const pNode = db.prepare(`SELECT node_type FROM bill_of_processes WHERE id = ?`).get(pId) as any;
                return !pNode || pNode.node_type !== 'PRODUCT';
              });
              if (procPredIds.length > 0) {
                for (const predId of procPredIds) {
                  const predExec = db.prepare(`SELECT status, good_qty FROM lot_routing_executions WHERE lot_id = ? AND bop_id = ?`).get(lot.id, predId) as any;
                  if (!predExec || (predExec.status !== 'COMPLETED' && (predExec.good_qty || 0) < (lot.target_qty || 1))) {
                    isLotUnlocked = false;
                    break;
                  }
                }
              }

              const lotInitialStatus = isLotUnlocked && predCheck.isReady ? 'RUNNING' : 'LOCKED';

              const exec = db.prepare(`SELECT id, status FROM lot_routing_executions WHERE lot_id = ? AND bop_id = ?`).get(lot.id, step.id) as any;
              if (exec) {
                if (exec.status !== 'COMPLETED') {
                  db.prepare(`
                    UPDATE lot_routing_executions
                    SET status = ?,
                        operator_name = COALESCE(NULLIF(operator_name, ''), ?),
                        start_time = CASE WHEN ? = 'RUNNING' THEN COALESCE(start_time, ?) ELSE start_time END
                    WHERE id = ?
                  `).run(lotInitialStatus, userIdentifier, lotInitialStatus, nowIso, exec.id);
                }
              } else {
                const newId = "LEX-" + Math.random().toString(36).substr(2, 9);
                db.prepare(`
                  INSERT INTO lot_routing_executions (id, lot_id, bop_id, status, good_qty, operator_name, start_time)
                  VALUES (?, ?, ?, ?, 0, ?, ?)
                `).run(newId, lot.id, step.id, lotInitialStatus, userIdentifier, lotInitialStatus === 'RUNNING' ? nowIso : null);
              }
            }

            // Only start the actual station if predecessors are ready for pipelining
            if (!predCheck.isReady) {
               continue; 
            }

            // Check if any assigned operator for this step is ALREADY active on a station running in this project
            const stepAssignments = db.prepare(`
              SELECT DISTINCT manpower_id 
              FROM production_manpower_assignments 
              WHERE (bop_id = ? OR (bop_id IS NULL AND project_id = ? AND task_name = ?))
                AND status NOT IN ('CANCELLED', 'COMPLETED')
            `).all(step.id, id, step.process_name) as any[];

            const activeMpIds = stepAssignments.map(a => a.manpower_id).filter(Boolean);
            let isOperatorAlreadyRunning = false;
            if (activeMpIds.length > 0) {
              const placeholders = activeMpIds.map(() => '?').join(',');
              const alreadyRunningCount = db.prepare(`
                SELECT COUNT(*) as count
                FROM bill_of_processes b
                JOIN production_manpower_assignments a 
                  ON (a.bop_id = b.id OR (a.bop_id IS NULL AND a.project_id = b.project_id AND a.task_name = b.process_name))
                WHERE a.manpower_id IN (${placeholders})
                  AND b.project_id = ?
                  AND b.status = 'RUNNING'
                  AND b.id != ?
              `).get(...activeMpIds, id, step.id) as any;

              if (alreadyRunningCount && alreadyRunningCount.count > 0) {
                isOperatorAlreadyRunning = true;
              }
            }

            // If operator is already busy on an earlier station, leave downstream station ready for when operator switches
            if (isOperatorAlreadyRunning) {
              continue;
            }

            preemptiveAutoPauseConflictingSteps(step.id, id, userIdentifier);

            // At this point, the station is ready to start
            db.prepare(`
              UPDATE bill_of_processes
              SET status = 'RUNNING',
                  progress = CASE WHEN progress = 0 THEN 25 ELSE progress END,
                  actual_start_date = COALESCE(actual_start_date, ?)
              WHERE id = ?
            `).run(nowIso, step.id);

            db.prepare(`
              UPDATE project_tasks
              SET status = 'RUNNING',
                  progress = CASE WHEN progress = 0 THEN 25 ELSE progress END,
                  actual_start_date = COALESCE(actual_start_date, ?)
              WHERE id = ?
            `).run(nowIso, step.id);

            db.prepare(`
              UPDATE production_manpower_assignments
              SET status = 'ACTIVE'
              WHERE (bop_id = ? OR (bop_id IS NULL AND project_id = ? AND task_name = ?)) AND status IN ('SCHEDULED', 'PAUSED')
            `).run(step.id, id, step.process_name);

            startedCount++;
          }

          logAudit(userIdentifier, "BOP_START_READY", "PROJECT", id, `Started ${startedCount} available production stations for project ${project.name}`);
        })();

        res.json({ success: true, message: `Activated ${startedCount} ready stations based on dependency constraints.`, started_count: startedCount });
      } catch (err: any) {
        console.error("Error starting available production stations:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.get("/api/production/unit-progress", (req, res) => {
      try {
        const { project_id, spk_id } = req.query;
        if (!project_id && !spk_id) {
          return res.status(400).json({ error: "project_id or spk_id required" });
        }
        let list: any[] = [];
        if (project_id) {
          list = db.prepare("SELECT * FROM unit_process_progress WHERE project_id = ?").all(project_id);
        } else if (spk_id) {
          list = db.prepare("SELECT * FROM unit_process_progress WHERE spk_id = ?").all(spk_id);
        }
        res.json(list);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/production/unit-progress", (req, res) => {
      try {
        const { project_id, spk_id, unit_code, bop_id, status, completed_by } = req.body;
        if (!project_id || !unit_code || !bop_id) {
          return res.status(400).json({ error: "project_id, unit_code, and bop_id are required" });
        }

        const existing = db.prepare("SELECT * FROM unit_process_progress WHERE project_id = ? AND unit_code = ? AND bop_id = ?")
          .get(project_id, unit_code, bop_id) as any;

        const now = new Date().toISOString();
        if (existing) {
          db.prepare(`
            UPDATE unit_process_progress
            SET status = ?,
                completed_time = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_time END,
                completed_by = COALESCE(?, completed_by)
            WHERE id = ?
          `).run(status || 'COMPLETED', status || 'COMPLETED', now, completed_by || 'Operator', existing.id);
        } else {
          const newId = `upp_${Date.now()}_${Math.random().toString(36).substring(2,6)}`;
          db.prepare(`
            INSERT INTO unit_process_progress (id, project_id, spk_id, unit_code, bop_id, status, start_time, completed_time, completed_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(newId, project_id, spk_id || null, unit_code, bop_id, status || 'COMPLETED', now, status === 'COMPLETED' ? now : null, completed_by || 'Operator');
        }

        res.json({ success: true, message: `Unit ${unit_code} status updated to ${status}` });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.get("/api/production/travel-tags", (req, res) => {
      try {
        const { bop_id, project_id, lot_id } = req.query;
        let query = `
          SELECT tt.*, bop.process_name, p.name as project_name, p.spk_number
          FROM task_travel_tags tt
          LEFT JOIN bill_of_processes bop ON tt.bop_id = bop.id
          LEFT JOIN projects p ON tt.project_id = p.id
        `;
        const params: any[] = [];
        const whereClauses: string[] = [];

        if (lot_id) {
          whereClauses.push(`tt.lot_id = ?`);
          params.push(lot_id);
        }
        if (bop_id) {
          whereClauses.push(`tt.bop_id = ?`);
          params.push(bop_id);
        }
        if (project_id) {
          whereClauses.push(`tt.project_id = ?`);
          params.push(project_id);
        }

        if (whereClauses.length > 0) {
          query += ` WHERE ` + whereClauses.join(" AND ");
        }
        query += ` ORDER BY tt.created_at DESC`;

        const tags = db.prepare(query).all(...params);
        res.json(tags);
      } catch (err: any) {
        console.error("Error fetching travel tags:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/production/travel-tags/verify", (req, res) => {
      try {
        const { qr_payload, tag_number, lot_id } = req.body;
        let query = `
          SELECT tt.*, bop.process_name, bop.step_sequence, p.name as project_name, p.spk_number
          FROM task_travel_tags tt
          LEFT JOIN bill_of_processes bop ON tt.bop_id = bop.id
          LEFT JOIN projects p ON tt.project_id = p.id
        `;
        let tag = null;

        if (tag_number) {
          tag = db.prepare(query + ` WHERE tt.tag_number = ?`).get(tag_number);
        } else if (lot_id) {
          tag = db.prepare(query + ` WHERE tt.lot_id = ? ORDER BY tt.created_at DESC LIMIT 1`).get(lot_id);
        } else if (qr_payload) {
          let parsed: any = null;
          try {
            parsed = typeof qr_payload === 'string' ? JSON.parse(qr_payload) : qr_payload;
          } catch (e) {
            // raw string search
          }
          if (parsed?.tag_number) {
            tag = db.prepare(query + ` WHERE tt.tag_number = ?`).get(parsed.tag_number);
          } else if (parsed?.lot_id) {
            tag = db.prepare(query + ` WHERE tt.lot_id = ? ORDER BY tt.created_at DESC LIMIT 1`).get(parsed.lot_id);
          } else {
            tag = db.prepare(query + ` WHERE tt.qr_payload LIKE ?`).get(`%${qr_payload}%`);
          }
        }

        if (!tag) {
          return res.status(404).json({ valid: false, error: "QR Tag tidak ditemukan atau belum terdaftar dalam sistem." });
        }

        res.json({ valid: true, tag, message: "QR Tag terverifikasi resmi dan otentik." });
      } catch (err: any) {
        console.error("Error verifying travel tag:", err);
        res.status(500).json({ valid: false, error: err.message });
      }
    });

executionRouter.post("/api/production/travel-tags", (req, res) => {
      try {
        const {
          project_id,
          bop_id,
          lot_id,
          lot_number,
          operator_name,
          operator_team,
          qc_inspector,
          qc_status,
          good_qty,
          scrap_qty,
          verified_by
        } = req.body;

        if (!project_id || !bop_id || !operator_name) {
          return res.status(400).json({ error: "project_id, bop_id, and operator_name are required" });
        }

        const bop = db.prepare(`SELECT * FROM bill_of_processes WHERE id = ?`).get(bop_id) as any;
        const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(project_id) as any;

        // Calculate total downtime for this bop if any
        const downtimeSum = db.prepare(`
          SELECT SUM(actual_down_minutes) as total_down
          FROM notice_to_down_processes
          WHERE bop_id = ?
        `).get(bop_id) as { total_down: number };

        const lotSuffix = lot_number ? `-${lot_number.split('-').pop()}` : '';
        const tagNumber = `TAG-${project?.spk_number || 'SPK'}${lotSuffix}-S${bop?.step_sequence || '1'}-${Date.now().toString().slice(-4)}`;
        const tagId = `tag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const startedAt = bop?.actual_start_date || new Date().toISOString();
        const completedAt = new Date().toISOString();

        const qrPayloadObj = {
          tag_number: tagNumber,
          spk_number: project?.spk_number || "N/A",
          project_name: project?.name || "N/A",
          lot_id: lot_id || null,
          lot_number: lot_number || null,
          step_sequence: bop?.step_sequence,
          process_name: bop?.process_name,
          work_center: bop?.work_center_name || "Factory Floor",
          operator: operator_name,
          team: operator_team || "Production Crew",
          started_at: startedAt,
          completed_at: completedAt,
          total_downtime_minutes: downtimeSum?.total_down || 0,
          qc_inspector: qc_inspector || verified_by || "QC Department",
          qc_status: qc_status || "PASSED",
          good_qty: Number(good_qty) || 1,
          scrap_qty: Number(scrap_qty) || 0
        };

        const qrPayloadStr = JSON.stringify(qrPayloadObj);

        const runTransaction = db.transaction(() => {
          db.prepare(`
            INSERT INTO task_travel_tags (
              id, tag_number, project_id, bop_id, lot_id, lot_number, qr_payload, operator_name, operator_team,
              qc_inspector, qc_status, good_qty, scrap_qty, started_at, completed_at,
              total_downtime_minutes, verified_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            tagId,
            tagNumber,
            project_id,
            bop_id,
            lot_id || null,
            lot_number || null,
            qrPayloadStr,
            operator_name,
            operator_team || null,
            qc_inspector || verified_by || null,
            qc_status || 'PASSED',
            Number(good_qty) || 1,
            Number(scrap_qty) || 0,
            startedAt,
            completedAt,
            downtimeSum?.total_down || 0,
            verified_by || null
          );

          // If lot_id is provided, mark that lot execution as COMPLETED and unlock next step for this lot
          if (lot_id) {
            db.prepare(`
              UPDATE lot_routing_executions
              SET status = 'COMPLETED', good_qty = ?, scrap_qty = ?, end_time = ?, operator_name = ?
              WHERE lot_id = ? AND bop_id = ?
            `).run(Number(good_qty) || 1, Number(scrap_qty) || 0, completedAt, operator_name, lot_id, bop_id);

            // Increment completed_qty on the bop step
            db.prepare(`
              UPDATE bill_of_processes
              SET completed_qty = COALESCE(completed_qty, 0) + ?
              WHERE id = ?
            `).run(Number(good_qty) || 1, bop_id);

            // Check any dependent downstream steps for this lot and unlock them if all their predecessors are completed for this lot
            const allSteps = db.prepare(`SELECT * FROM bill_of_processes WHERE project_id = ? AND node_type != 'PRODUCT' ORDER BY step_sequence ASC`).all(project_id) as any[];
            for (const otherStep of allSteps) {
              if (otherStep.id === bop_id) continue;
              let otherPredIds: string[] = [];
              try {
                otherPredIds = Array.isArray(otherStep.predecessor_ids)
                  ? otherStep.predecessor_ids
                  : JSON.parse(otherStep.predecessor_ids || "[]");
              } catch (e) {
                otherPredIds = [];
              }

              if (otherPredIds.includes(bop_id)) {
                // Check if all predecessors for this lot are completed
                let allPredsDoneForLot = true;
                for (const pId of otherPredIds) {
                  const pExec = db.prepare(`SELECT status, good_qty FROM lot_routing_executions WHERE lot_id = ? AND bop_id = ?`).get(lot_id, pId) as any;
                  if (!pExec || (pExec.status !== 'COMPLETED' && (pExec.good_qty || 0) < 1)) {
                    allPredsDoneForLot = false;
                    break;
                  }
                }

                if (allPredsDoneForLot) {
                  const nextStatus = otherStep.status === 'RUNNING' ? 'RUNNING' : 'READY';
                  const otherExec = db.prepare(`SELECT id, status FROM lot_routing_executions WHERE lot_id = ? AND bop_id = ?`).get(lot_id, otherStep.id) as any;
                  if (otherExec) {
                    if (otherExec.status !== 'COMPLETED') {
                      db.prepare(`UPDATE lot_routing_executions SET status = ? WHERE id = ?`).run(nextStatus, otherExec.id);
                    }
                  } else {
                    const newLexId = "LEX-" + Math.random().toString(36).substr(2, 9);
                    db.prepare(`
                      INSERT INTO lot_routing_executions (id, lot_id, bop_id, status, good_qty, operator_name, start_time)
                      VALUES (?, ?, ?, ?, 0, ?, ?)
                    `).run(newLexId, lot_id, otherStep.id, nextStatus, operator_name, nextStatus === 'RUNNING' ? completedAt : null);
                  }
                }
              }
            }
          }

          // Mark BoP and Task as COMPLETED, recording operator details if not already completed
          const bopCheck = db.prepare(`SELECT completed_qty, standard_hours FROM bill_of_processes WHERE id = ?`).get(bop_id) as any;
          if (!lot_id || (bopCheck && project && bopCheck.completed_qty >= (project.qty || 1))) {
            db.prepare(`
              UPDATE bill_of_processes
              SET status = 'COMPLETED', progress = 100, actual_end_date = ?, completed_by_operator = ?, completed_at_timestamp = ?
              WHERE id = ?
            `).run(completedAt, operator_name, completedAt, bop_id);

            db.prepare(`
              UPDATE project_tasks
              SET status = 'COMPLETED', progress = 100, actual_end_date = ?
              WHERE id = ?
            `).run(completedAt, bop_id);
          }

          // Auto-start downstream processes via pipelining (1 WOT completed is enough)
          autoStartDownstreamProcesses(project_id, operator_name);
          // Auto-complete any successor PRODUCT nodes if all their preceding processes are completed
          autoResolveDownstreamProductNodes(project_id, operator_name);
          logAudit(operator_name, "TRAVEL_TAG_ISSUED", "TRAVEL_TAG", tagId, `Issued Travel Tag ${tagNumber} for BoP step ${bop_id}`);
        });

        runTransaction();

        const createdTag = db.prepare(`SELECT * FROM task_travel_tags WHERE id = ?`).get(tagId);
        res.json({ success: true, tag: createdTag, message: "Travel Tag & QR-Code generated. Task completed." });
      } catch (err: any) {
        console.error("Error creating travel tag:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/production/projects/:id/finish-and-inbound", (req, res) => {
      try {
        const { id } = req.params;
        const { notes, fg_location, serial_number, total_fg_qty } = req.body;

        const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as any;
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }

        // 1. Check or Auto-Complete remaining steps during handover
        // Any remaining BoP steps will be marked completed during final handover
        const bopSteps = db.prepare(`
          SELECT * FROM bill_of_processes
          WHERE project_id = ? AND node_type != 'PRODUCT'
        `).all(id) as any[];

        const fgItemCode = `FG-${project.id}`;
        let createdItemId = "";
        let fgrNumber = `FGR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${project.spk_number || project.id.slice(-6)}`;
        let fgrId = `fgr_${Date.now()}`;
        const totalQty = total_fg_qty !== undefined ? Number(total_fg_qty) : (Number(project.qty) || 1);
        const uom = project.uom || "UNIT";
        const sn = serial_number || `SN-${Date.now().toString().slice(-6)}`;

        const runTransaction = db.transaction(() => {
          // 1. Mark all BoP process steps for this project as COMPLETED
          db.prepare(`
            UPDATE bill_of_processes
            SET status = 'COMPLETED', progress = 100, actual_end_date = COALESCE(actual_end_date, CURRENT_TIMESTAMP)
            WHERE project_id = ? AND status != 'COMPLETED'
          `).run(id);

          // Auto-resolve any active downtime notices
          db.prepare(`
            UPDATE notice_to_down_processes
            SET status = 'RESOLVED', resumed_at = CURRENT_TIMESTAMP
            WHERE project_id = ? AND status = 'ACTIVE'
          `).run(id);

          // 2. Update Project Status to COMPLETED
          db.prepare(`
            UPDATE projects
            SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, archived_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(id);

          // 2. Check or Create Finish Good SKU in Items table
          let existingItem = db.prepare(`SELECT * FROM items WHERE item_code = ?`).get(fgItemCode) as any;

          if (!existingItem) {
            createdItemId = `item_fg_${Date.now()}`;
            db.prepare(`
              INSERT INTO items (
                id, item_code, name, spec, uom, type, category, min_stock, max_stock, unit_price, description
              ) VALUES (?, ?, ?, ?, ?, 'FINISHED', 'MANUFACTURED_FG', 1, 100, ?, ?)
            `).run(
              createdItemId,
              fgItemCode,
              `[FG] ${project.name}`,
              `Finished Good for Project ${project.name}`,
              uom,
              project.budget || 0,
              `Manufactured Finish Good from SPK ${project.spk_number || project.id}`
            );

            // Add Initial Inventory Record
            db.prepare(`
              INSERT INTO inventory (
                item_id, physical_qty, free_stock, allocated_stock, reserved_qty, available_qty
              ) VALUES (?, ?, ?, 0, 0, ?)
              ON CONFLICT(item_id) DO UPDATE SET
                physical_qty = physical_qty + excluded.physical_qty,
                free_stock = free_stock + excluded.free_stock,
                available_qty = available_qty + excluded.available_qty
            `).run(createdItemId, totalQty, totalQty, totalQty);
          } else {
            createdItemId = existingItem.id;
            // Increment Inventory Stock
            db.prepare(`
              UPDATE inventory
              SET physical_qty = physical_qty + ?,
                  free_stock = free_stock + ?,
                  available_qty = available_qty + ?
              WHERE item_id = ?
            `).run(totalQty, totalQty, totalQty, existingItem.id);
          }

          // Stock movement log
          try {
            db.prepare(`
              INSERT INTO stock_movements (id, item_id, type, qty, reference_id, project_id)
              VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?)
            `).run(
              `SMV-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              createdItemId,
              totalQty,
              project.id,
              project.id
            );
          } catch (e) {}

          // 3. Create or replace Finish Good Record (FGR)
          try {
            db.prepare(`
              CREATE TABLE IF NOT EXISTS finish_good_records (
                id TEXT PRIMARY KEY,
                fgr_number TEXT UNIQUE NOT NULL,
                project_id TEXT NOT NULL,
                item_code TEXT NOT NULL,
                item_name TEXT,
                serial_number TEXT,
                quantity REAL DEFAULT 1,
                uom TEXT DEFAULT 'UNIT',
                status TEXT DEFAULT 'APPROVED',
                notes TEXT,
                inspected_by TEXT,
                target_warehouse TEXT DEFAULT 'WAREHOUSE_FG_1',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
              )
            `).run();

            db.prepare(`
              INSERT INTO finish_good_records (
                id, fgr_number, project_id, item_code, item_name, serial_number,
                quantity, uom, status, notes, inspected_by, target_warehouse
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?)
            `).run(
              fgrId,
              fgrNumber,
              id,
              fgItemCode,
              `[FG] ${project.name}`,
              sn,
              totalQty,
              uom,
              notes || `Handover from Production Hub. Location: ${fg_location || 'Warehouse FG-01'}`,
              (req.headers["x-user-email"] as string) || "Production Manager",
              fg_location || "WAREHOUSE_FG_1"
            );
          } catch (fgrErr) {
            console.error("Error creating FGR record:", fgrErr);
          }
        });

        runTransaction();

        res.json({
          success: true,
          message: `Project ${project.name} successfully finished!`,
          item_id: createdItemId,
          fg_code: fgItemCode,
          fgr_number: fgrNumber,
          fgr: {
            id: fgrId,
            fgr_number: fgrNumber,
            project_id: id,
            item_code: fgItemCode,
            item_id: createdItemId,
            item_name: `[FG] ${project.name}`,
            serial_number: sn,
            quantity: totalQty,
            uom: uom,
            target_warehouse: fg_location || "WAREHOUSE_FG_1",
            created_at: new Date().toISOString()
          }
        });
      } catch (err: any) {
        console.error("Error finishing project:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.get("/api/production/projects/:id/fgr", (req, res) => {
      try {
        const { id } = req.params;
        try {
          db.prepare(`
            CREATE TABLE IF NOT EXISTS finish_good_records (
              id TEXT PRIMARY KEY,
              fgr_number TEXT UNIQUE NOT NULL,
              project_id TEXT NOT NULL,
              item_code TEXT NOT NULL,
              item_name TEXT,
              serial_number TEXT,
              quantity REAL DEFAULT 1,
              uom TEXT DEFAULT 'UNIT',
              status TEXT DEFAULT 'APPROVED',
              notes TEXT,
              inspected_by TEXT,
              target_warehouse TEXT DEFAULT 'WAREHOUSE_FG_1',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (project_id) REFERENCES projects(id)
            )
          `).run();
        } catch (e) {}

        const fgr = db.prepare(`SELECT * FROM finish_good_records WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`).get(id) as any;
        const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as any;
        const fgItem = db.prepare(`SELECT * FROM items WHERE item_code LIKE ?`).get(`FG-${id}%`) as any;

        res.json({
          fgr: fgr || null,
          project: project || null,
          fg_item: fgItem || null
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.get("/api/production/stations/list", (req, res) => {
      try {
        const stations = db.prepare(`
          SELECT s.*, p.name as project_name, p.spk_number
          FROM project_stations s
          LEFT JOIN projects p ON s.project_id = p.id
          ORDER BY s.station_sequence ASC, s.station_name ASC
        `).all();
        res.json({ ok: true, data: stations });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.get("/api/production/stations/:stationId/preflight", (req, res) => {
      try {
        const { stationId } = req.params;
        const station = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId) as any
          || db.prepare("SELECT * FROM stations WHERE id = ?").get(stationId) as any;

        if (!station) {
          return res.status(404).json({ error: "Station not found" });
        }

        const projectId = station.project_id;

        // 1. Manpower check
        const manpowerCount = db.prepare(`
          SELECT COUNT(*) as count FROM production_manpower_assignments 
          WHERE (station_id = ? OR (project_id = ? AND status = 'ACTIVE'))
        `).get(stationId, projectId) as any;

        const hasManpower = (manpowerCount?.count || 0) > 0;

        // 2. Active NDP check for this station or assigned machine
        const activeNdps = db.prepare(`
          SELECT n.* FROM notice_to_down_processes n
          LEFT JOIN bill_of_processes b ON (n.bop_id = b.id OR n.affected_machine_id = b.assigned_machine_id)
          WHERE (b.station_id = ? OR n.bop_id = ?) AND n.status = 'ACTIVE'
        `).all(stationId, stationId) as any[];

        const noActiveNdp = activeNdps.length === 0;

        // 3. Queued WOTs
        const queuedWots = db.prepare(`
          SELECT COUNT(*) as count FROM work_order_tickets 
          WHERE (current_station_id = ? OR target_station_id = ? OR project_id = ?) 
          AND status IN ('QUEUED', 'IN_PROGRESS', 'RUNNING', 'TRANSFERRED', 'PLANNED')
        `).get(stationId, stationId, projectId) as any;

        const queuedWotCount = queuedWots?.count || 0;

        // 4. Material ready check
        const pendingMatReq = db.prepare(`
          SELECT COUNT(*) as count FROM floor_requests
          WHERE project_id = ? AND status IN ('PENDING', 'IN_PROGRESS')
        `).get(projectId) as any;

        const isMaterialReady = (pendingMatReq?.count || 0) === 0;

        // 5. Upstream sequence check
        const allStations = db.prepare(`
          SELECT id, station_sequence FROM project_stations 
          WHERE project_id = ? ORDER BY station_sequence ASC
        `).all(projectId) as any[];

        const currIdx = allStations.findIndex((s: any) => s.id === stationId);
        let previousStationOk = true;
        if (currIdx > 0) {
          const prevStation = allStations[currIdx - 1];
          const prevWotCount = db.prepare(`
            SELECT COUNT(*) as count FROM wot_history 
            WHERE station_id = ?
          `).get(prevStation.id) as any;
          previousStationOk = (prevWotCount?.count || 0) > 0 || queuedWotCount > 0;
        }

        const ready = hasManpower && noActiveNdp && (queuedWotCount > 0 || isMaterialReady);

        res.json({
          ok: true,
          ready,
          station,
          checklist: {
            hasManpower,
            isMaterialReady,
            noActiveNdp,
            previousStationOk
          },
          details: {
            activeManpowerCount: manpowerCount?.count || 0,
            queuedWotCount,
            activeNdpCount: activeNdps.length
          }
        });
      } catch (err: any) {
        console.error("Preflight error:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/production/stations/:stationId/start-production", (req, res) => {
      try {
        const { stationId } = req.params;
        const station = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId) as any
          || db.prepare("SELECT * FROM stations WHERE id = ?").get(stationId) as any;

        if (!station) return res.status(404).json({ error: "Station not found" });

        // Unqueue or start first WOT
        const eligibleWot = db.prepare(`
          SELECT * FROM work_order_tickets 
          WHERE (current_station_id = ? OR target_station_id = ? OR (project_id = ? AND current_station_id IS NULL))
          AND status IN ('QUEUED', 'TRANSFERRED', 'PLANNED')
          ORDER BY lot_number ASC LIMIT 1
        `).get(stationId, stationId, station.project_id) as any;

        if (eligibleWot) {
          db.prepare(`
            UPDATE work_order_tickets 
            SET status = 'IN_PROGRESS', current_station_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(stationId, eligibleWot.id);
        }

        emitProductionUpdate("STATION_STARTED", { stationId, wotId: eligibleWot?.id });

        res.json({
          ok: true,
          success: true,
          message: `Station ${station.name || station.station_name || stationId} started successfully`,
          wot_id: eligibleWot?.id || null
        });
      } catch (err: any) {
        console.error("Start production error:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/production/stations/:stationId/start", (req, res) => {
      try {
        const { stationId } = req.params;
        
        // 1. Check for blocking NDPs
        const activeNdps = db.prepare(`
          SELECT id FROM notice_to_down_processes 
          WHERE bop_id = ? AND status = 'ACTIVE' AND reason_category IN ('MATERIAL_SHORTAGE', 'MACHINE_BREAKDOWN')
        `).all(stationId);
        
        if (activeNdps.length > 0) {
          return res.status(400).json({ error: "Station is blocked by an active NDP." });
        }

        // 2. Find the next eligible WOT in queue
        // A WOT is eligible if it's currently at this station and is QUEUED, TRANSFERRED, or PLANNED (if first station)
        const eligibleWot = db.prepare(`
          SELECT * FROM work_order_tickets 
          WHERE (current_station_id = ? OR target_station_id = ?) 
          AND status IN ('QUEUED', 'TRANSFERRED', 'PLANNED')
          ORDER BY lot_number ASC LIMIT 1
        `).get(stationId, stationId) as any;

        if (!eligibleWot) {
          return res.status(404).json({ error: "No WOT in queue for this station." });
        }

        db.prepare(`
          UPDATE work_order_tickets 
          SET status = 'RUNNING', current_station_id = ?, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(stationId, eligibleWot.id);

        res.json({ success: true, message: "Station started processing WOT", wot_id: eligibleWot.id });
      } catch (err: any) {
        console.error("WOT Start Error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Human Control: Pause Station Processing
    executionRouter.post("/api/production/stations/:stationId/pause", (req, res) => {
      try {
        const { stationId } = req.params;
        const { reason } = req.body;

        const updated = db.prepare(`
          UPDATE work_order_tickets
          SET status = 'PAUSED', updated_at = CURRENT_TIMESTAMP
          WHERE (current_station_id = ? OR target_station_id = ?) AND status IN ('RUNNING', 'IN_PROGRESS')
        `).run(stationId, stationId);

        emitProductionUpdate("STATION_PAUSED", { stationId, reason });

        res.json({
          ok: true,
          success: true,
          message: `Station execution paused (${updated.changes} active WOTs paused)`,
          pausedCount: updated.changes
        });
      } catch (err: any) {
        console.error("Station Pause Error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Human Control: Resume / Continue Station Processing
    executionRouter.post("/api/production/stations/:stationId/resume", (req, res) => {
      try {
        const { stationId } = req.params;

        // Check if blocked by active NDPs
        const activeNdps = db.prepare(`
          SELECT id FROM notice_to_down_processes 
          WHERE bop_id = ? AND status = 'ACTIVE' AND reason_category IN ('MATERIAL_SHORTAGE', 'MACHINE_BREAKDOWN')
        `).all(stationId);

        if (activeNdps.length > 0) {
          return res.status(400).json({ error: "Cannot resume: Station is blocked by active NDP. Resolve NDP first." });
        }

        const updated = db.prepare(`
          UPDATE work_order_tickets
          SET status = 'RUNNING', updated_at = CURRENT_TIMESTAMP
          WHERE (current_station_id = ? OR target_station_id = ?) AND status = 'PAUSED'
        `).run(stationId, stationId);

        emitProductionUpdate("STATION_RESUMED", { stationId });

        res.json({
          ok: true,
          success: true,
          message: `Station execution continued (${updated.changes} WOTs resumed)`,
          resumedCount: updated.changes
        });
      } catch (err: any) {
        console.error("Station Resume Error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Mathematical Cycle Estimation for 1 WOT from Root to Finish & Per Station
    executionRouter.get("/api/production/projects/:id/wot-cycle-estimation", (req, res) => {
      try {
        const { id: projectId } = req.params;
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
        if (!project) return res.status(404).json({ error: "Project not found" });

        const factoryFactor = project.factory_factor || 85;
        const wotQty = req.query.wot_qty ? Number(req.query.wot_qty) : (project.lot_size || 10);

        // Fetch Bill of Processes with Station info
        const bops = db.prepare(`
          SELECT b.*, 
                 COALESCE(s.id, 'STATION_DEFAULT') as station_id,
                 COALESCE(s.station_name, 'Station 1') as station_name,
                 COALESCE(s.station_sequence, 1) as station_sequence
          FROM bill_of_processes b
          LEFT JOIN project_stations s ON b.station_id = s.id
          WHERE b.project_id = ?
          ORDER BY COALESCE(s.station_sequence, 1) ASC, b.sequence_number ASC
        `).all(projectId) as any[];

        // Fetch operator assignments
        const assignments = db.prepare(`
          SELECT * FROM bop_operator_assignments
          WHERE project_id = ?
        `).all(projectId) as any[];

        const nodes: any[] = bops.map((b) => {
          let predIds: string[] = [];
          try {
            predIds = b.predecessor_ids ? JSON.parse(b.predecessor_ids) : [];
          } catch (e) {
            predIds = [];
          }

          const opIds = assignments
            .filter((a: any) => a.bop_id === b.id)
            .map((a: any) => a.operator_id || a.user_id);

          return {
            id: b.id,
            name: b.process_name,
            stationId: b.station_id,
            stationName: b.station_name,
            stationSequence: b.station_sequence,
            cycleTimeMinutes: b.cycle_time_minutes || 10,
            predecessorIds: predIds,
            assignedOperatorIds: opIds,
            manpowerCount: Math.max(1, opIds.length || b.manpower_required || 1),
            targetQty: project.target_quantity || 100,
            completedQty: b.completed_quantity || 0,
            wipBufferQty: b.wip_quantity || 0,
            status: b.status || "PENDING",
          };
        });

        const estimation = calculateWotCycleEstimation({
          projectId,
          wotQty,
          factoryFactor,
          workingHoursPerDay: 8,
          nodes,
        });

        res.json({ ok: true, success: true, estimation });
      } catch (err: any) {
        console.error("WOT Cycle Estimation Error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Station-Scoped Manpower Auto-Balancing Algorithm
    executionRouter.post("/api/production/stations/:stationId/rebalance-manpower", (req, res) => {
      try {
        const { stationId } = req.params;
        const station = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId) as any;
        if (!station) return res.status(404).json({ error: "Station not found" });

        const projectId = station.project_id;
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
        const wotQty = project?.lot_size || 10;

        const bops = db.prepare(`
          SELECT * FROM bill_of_processes 
          WHERE station_id = ? OR (project_id = ? AND station_id IS NULL)
          ORDER BY sequence_number ASC
        `).all(stationId, projectId) as any[];

        const assignments = db.prepare(`
          SELECT a.*, u.name as user_name
          FROM bop_operator_assignments a
          LEFT JOIN users u ON a.user_id = u.id OR a.operator_id = u.id
          WHERE a.project_id = ?
        `).all(projectId) as any[];

        // Extract station operators
        const operatorMap = new Map<string, string>();
        assignments.forEach((a: any) => {
          const opId = a.operator_id || a.user_id;
          if (opId) {
            operatorMap.set(opId, a.user_name || a.operator_name || opId);
          }
        });

        const operators = Array.from(operatorMap.entries()).map(([id, name]) => ({ id, name }));

        const nodes: any[] = bops.map((b) => {
          let predIds: string[] = [];
          try {
            predIds = b.predecessor_ids ? JSON.parse(b.predecessor_ids) : [];
          } catch (e) {
            predIds = [];
          }

          const opIds = assignments
            .filter((a: any) => a.bop_id === b.id)
            .map((a: any) => a.operator_id || a.user_id);

          return {
            id: b.id,
            name: b.process_name,
            stationId,
            stationName: station.station_name,
            stationSequence: station.station_sequence || 1,
            cycleTimeMinutes: b.cycle_time_minutes || 10,
            predecessorIds: predIds,
            assignedOperatorIds: opIds,
            manpowerCount: Math.max(1, opIds.length || 1),
            targetQty: project?.target_quantity || 100,
            completedQty: b.completed_quantity || 0,
            wipBufferQty: b.wip_quantity || 0,
            status: b.status || "PENDING",
          };
        });

        const result = computeStationManpowerBalancing({
          stationId,
          wotQty,
          processes: nodes,
          operators,
        });

        emitProductionUpdate("MANPOWER_REBALANCED", { stationId, result });

        res.json({ ok: true, success: true, result });
      } catch (err: any) {
        console.error("Manpower Rebalance Error:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/production/wot/:id/complete", (req, res) => {
      try {
        const { id } = req.params;
        const wot = db.prepare("SELECT * FROM work_order_tickets WHERE id = ?").get(id) as any;
        if (!wot) return res.status(404).json({ error: "WOT not found" });

        // Find current station sequence
        const currentStation = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(wot.current_station_id) as any;
        if (!currentStation) return res.status(400).json({ error: "WOT has no valid current station" });

        // Find next station in sequence
        const nextStation = db.prepare(`
          SELECT * FROM project_stations 
          WHERE project_id = ? AND station_sequence > ? 
          ORDER BY station_sequence ASC LIMIT 1
        `).get(wot.project_id, currentStation.station_sequence) as any;

        if (nextStation) {
          // Transfer to next station
          db.prepare(`
            UPDATE work_order_tickets 
            SET status = 'TRANSFERRED', target_station_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(nextStation.id, id);
        } else {
          // Last station, mark completed
          db.prepare(`
            UPDATE work_order_tickets 
            SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(id);
        }

        res.json({ success: true, message: "WOT completed and transferred" });
      } catch (err: any) {
        console.error("WOT Complete Error:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/production/stations/:stationId/transfer-ready-wot", (req, res) => {
      try {
        const { stationId } = req.params;
        const currentStation = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId) as any;
        if (!currentStation) return res.status(404).json({ error: "Station not found" });

        const nextStation = db.prepare(`
          SELECT * FROM project_stations 
          WHERE project_id = ? AND station_sequence > ? 
          ORDER BY station_sequence ASC LIMIT 1
        `).get(currentStation.project_id, currentStation.station_sequence) as any;

        // Find running or queued WOT at this station
        const readyWot = db.prepare(`
          SELECT * FROM work_order_tickets 
          WHERE project_id = ? AND (current_station_id = ? OR (target_station_id = ? AND status = 'TRANSFERRED'))
            AND status IN ('RUNNING', 'QUEUED')
          ORDER BY lot_number ASC LIMIT 1
        `).get(currentStation.project_id, stationId, stationId) as any;

        if (!readyWot) {
          return res.status(400).json({ error: "No active WOT found to transfer at this station" });
        }

        if (nextStation) {
          db.prepare(`
            UPDATE work_order_tickets 
            SET status = 'TRANSFERRED', current_station_id = ?, target_station_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(stationId, nextStation.id, readyWot.id);
        } else {
          db.prepare(`
            UPDATE work_order_tickets 
            SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(readyWot.id);
        }

        emitProductionUpdate("WOT_UPDATED", { projectId: currentStation.project_id, stationId, wotId: readyWot.id });
        res.json({ success: true, message: `WOT ${readyWot.lot_number} successfully transferred to ${nextStation ? nextStation.station_name : 'Finished Goods'}`, wot: readyWot });
      } catch (err: any) {
        console.error("Transfer ready WOT error:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.get("/api/production/projects/:id/wots", (req, res) => {
      try {
        const wots = db.prepare(`
          SELECT w.*, 
                 b.process_name as current_process_name, 
                 COALESCE(s.station_name, 'Station') as current_station_name,
                 (SELECT COUNT(*) FROM wot_history h WHERE h.wot_id = w.id AND h.notes != 'Lot ticket generated') as completed_steps_count
          FROM work_order_tickets w
          LEFT JOIN bill_of_processes b ON w.current_process_id = b.id
          LEFT JOIN project_stations s ON w.current_station_id = s.id
          WHERE w.project_id = ? 
          ORDER BY w.lot_number ASC
        `).all(req.params.id);
        res.json({ wots });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/production/projects/:id/wots/generate", async (req, res) => {
      try {
        const projectId = req.params.id;
        const { lot_size } = req.body;
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
        if (!project) return res.status(404).json({ error: "Project not found" });

        const totalQty = Number(project.qty) || 1;
        const lotSize = Math.max(1, Number(lot_size) || Number(project.lot_size) || 50);
        const numLots = Math.ceil(totalQty / lotSize);

        const processes = db.prepare(`
          SELECT * FROM bill_of_processes 
          WHERE project_id = ? AND UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END')
          ORDER BY step_sequence ASC
        `).all(projectId) as any[];

        const firstProcess = processes[0] || null;
        const existingCount = db.prepare("SELECT COUNT(*) as count FROM work_order_tickets WHERE project_id = ?").get(projectId) as any;
        const startIdx = existingCount?.count || 0;

        const codePrefix = project.spk_number?.replace(/[^A-Za-z0-9]/g, '') || project.name?.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PRJ';
        const createdWots: any[] = [];

        for (let i = 0; i < numLots; i++) {
          const lotNum = `WOT-${codePrefix}-${String(startIdx + i + 1).padStart(3, '0')}`;
          const wotId = crypto.randomUUID();
          const lotQty = (i === numLots - 1 && (totalQty % lotSize !== 0)) ? (totalQty % lotSize) : lotSize;
          
          const qrInfo = generateSignedWotQr({
            wot_id: wotId,
            lot: lotNum,
            prj: project.spk_number || project.name,
            st: firstProcess?.station_name || "ST-01",
            proc: firstProcess?.process_name || "General",
            mch: firstProcess?.assigned_machine_id || "MANUAL",
            qty: lotQty
          });

          let qrDataUrl = "";
          try {
            qrDataUrl = await QRCode.toDataURL(qrInfo.rawJson, {
              width: 256,
              margin: 1,
              errorCorrectionLevel: 'M'
            });
          } catch (e) {
            console.warn("QR code data URL generation error", e);
          }

          db.prepare(`
            INSERT INTO work_order_tickets 
            (id, project_id, lot_number, qty, status, current_station_id, current_process_id, machine_id, qr_payload, qr_image_url, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'QUEUED', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(
            wotId, 
            projectId, 
            lotNum, 
            lotQty, 
            firstProcess?.station_id || null, 
            firstProcess?.id || null, 
            firstProcess?.assigned_machine_id || null,
            qrInfo.rawJson,
            qrDataUrl
          );

          db.prepare(`
            INSERT INTO wot_history 
            (id, wot_id, project_id, process_id, station_id, operator_name, completed_at, qty, scrap_qty, notes)
            VALUES (?, ?, ?, ?, ?, 'System', CURRENT_TIMESTAMP, ?, 0, 'Lot ticket generated')
          `).run(crypto.randomUUID(), wotId, projectId, firstProcess?.id || 'INIT', firstProcess?.station_id || null, lotQty);

          // Initial travel log entry
          try {
            db.prepare(`
              INSERT INTO wot_travel_logs (id, wot_id, event_type, station_id, process_id, machine_id, user_name, metadata)
              VALUES (?, ?, 'START', ?, ?, ?, 'System', ?)
            `).run(
              crypto.randomUUID(),
              wotId,
              firstProcess?.station_id || null,
              firstProcess?.id || null,
              firstProcess?.assigned_machine_id || null,
              JSON.stringify({ action: 'Lot ticket generated with signed QR', qty: lotQty })
            );
          } catch (_) {}

          createdWots.push({
            id: wotId,
            lot_number: lotNum,
            qty: lotQty,
            status: 'QUEUED',
            qr_payload: qrInfo.rawJson,
            qr_image_url: qrDataUrl
          });
        }

        emitProductionUpdate("WOTS_GENERATED", { projectId, count: createdWots.length });
        res.json({ ok: true, success: true, count: createdWots.length, wots: createdWots });

      } catch (err: any) {
        console.error("Generate WOTs error:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.get(["/api/production/scan-wot", "/api/production/wots/validate-process"], (req, res) => {
      try {
        const rawLot = req.query.lot_number || req.query.lot || req.query.wot_id || req.query.id || "";
        const lotNumber = String(rawLot).trim();
        if (!lotNumber) {
          return res.status(400).json({ error: "Lot number is required" });
        }

        let target = lotNumber;
        let isEncryptedPayload = false;
        try {
          // Check if it's base64 encoded JSON (the secure payload we generate)
          if (!lotNumber.startsWith('{')) {
            const decodedStr = Buffer.from(lotNumber, 'base64').toString('utf8');
            if (decodedStr.startsWith('{')) {
              isEncryptedPayload = true;
              const parsed = JSON.parse(decodedStr);
              target = parsed.lot_number || parsed.lot || parsed.wot_id || parsed.id || lotNumber;
              
              // Verify HMAC signature
              if (parsed.sig) {
                const secretKey = process.env.QR_SECRET_KEY || 'AI_STUDIO_ERP_SECURE_QR_2026';
                const hmac = crypto.createHmac('sha256', secretKey);
                const { sig, ...payloadWithoutSig } = parsed;
                hmac.update(JSON.stringify(payloadWithoutSig));
                const expectedSignature = hmac.digest('hex');
                if (expectedSignature !== sig) {
                   return res.status(403).json({ error: "Invalid QR Security Signature. This QR Code may be forged." });
                }
              }
            }
          }
          if (lotNumber.startsWith('{') && lotNumber.endsWith('}')) {
            const parsed = JSON.parse(lotNumber);
            target = parsed.lot_number || parsed.lot || parsed.tag_number || parsed.wot_id || parsed.id || lotNumber;
          }
        } catch (e) {}

        const wot = db.prepare(`
          SELECT w.*, p.name as project_name, p.qty as project_qty, p.uom as project_uom,
                 b.process_name as current_process_name,
                 COALESCE(s.station_name, 'Station') as current_station_name,
                 i.name as machine_name, i.item_code as machine_code,
                 COALESCE(b.assigned_machine_id, b.machine_id) as effective_machine_id
          FROM work_order_tickets w
          LEFT JOIN projects p ON w.project_id = p.id
          LEFT JOIN bill_of_processes b ON w.current_process_id = b.id
          LEFT JOIN project_stations s ON w.current_station_id = s.id
          LEFT JOIN items i ON COALESCE(b.assigned_machine_id, b.machine_id) = i.id
          WHERE w.lot_number = ? OR w.id = ? OR w.lot_number LIKE ?
        `).get(target, target, `%${target}%`) as any;

        if (!wot) {
          return res.status(404).json({ error: `WOT tidak ditemukan dengan kode: "${target}"` });
        }

        const bopSteps = db.prepare(`
          SELECT b.*, COALESCE(s.station_name, 'Station') as station_name, i.name as machine_name, i.item_code as machine_code, 
                 COALESCE(i.operational_status, i.machine_status, 'AVAILABLE') as machine_status,
                 COALESCE(b.assigned_machine_id, b.machine_id) as effective_machine_id
          FROM bill_of_processes b
          LEFT JOIN project_stations s ON b.station_id = s.id
          LEFT JOIN items i ON COALESCE(b.assigned_machine_id, b.machine_id) = i.id
          WHERE b.project_id = ? AND UPPER(b.node_type) NOT IN ('PRODUCT', 'START', 'END')
          ORDER BY b.step_sequence ASC
        `).all(wot.project_id) as any[];

        const history = db.prepare(`
          SELECT h.*, b.process_name, COALESCE(s.station_name, 'Station') as station_name
          FROM wot_history h
          LEFT JOIN bill_of_processes b ON h.process_id = b.id
          LEFT JOIN project_stations s ON h.station_id = s.id
          WHERE h.wot_id = ?
          ORDER BY h.completed_at ASC
        `).all(wot.id) as any[];

        const completedProcessIds = new Set(
          history
            .filter((h: any) => h.notes !== 'Lot ticket generated')
            .map((h: any) => h.process_id)
        );

        const activeProcess = bopSteps.find((step: any) => !completedProcessIds.has(step.id)) || null;

        let activeNdp: any = null;
        const targetMachineId = activeProcess ? (activeProcess.assigned_machine_id || activeProcess.machine_id) : null;
        if (targetMachineId) {
          activeNdp = db.prepare(`
            SELECT * FROM notice_to_down_processes 
            WHERE (machine_id = ? OR affected_machine_id = ?) AND status = 'ACTIVE'
          `).get(targetMachineId, targetMachineId) as any;
        }

        res.json({
          ok: true,
          wot: {
            ...wot,
            process_name: activeProcess ? activeProcess.process_name : wot.current_process_name,
            station_name: activeProcess ? activeProcess.station_name : wot.current_station_name,
            machine_code: activeProcess ? activeProcess.machine_code : wot.machine_code,
            machine_name: activeProcess ? activeProcess.machine_name : wot.machine_name,
            effective_machine_id: activeProcess ? activeProcess.effective_machine_id : wot.effective_machine_id,
            is_completed: !activeProcess
          },
          activeProcess: activeProcess ? {
            ...activeProcess,
            is_machine_down: Boolean(activeNdp || activeProcess.machine_status === 'BROKEN'),
            active_ndp: activeNdp || null
          } : null,
          history,
          allSteps: bopSteps
        });
      } catch (err: any) {
        console.error("Scan WOT error:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/production/wots/:id/complete-process", (req, res) => {
      try {
        const wotId = req.params.id;
        const { process_id, operator_name, scrap_qty, rework_qty, good_qty, reject_qty, reject_reason, notes } = req.body;

        const wot = db.prepare("SELECT * FROM work_order_tickets WHERE id = ?").get(wotId) as any;
        if (!wot) return res.status(404).json({ error: "WOT not found" });

        const effectiveProcessId = process_id || wot.current_process_id;
        let process = effectiveProcessId ? db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(effectiveProcessId) as any : null;
        
        if (!process) {
          // Fallback to first incomplete process
          const historyIds = (db.prepare("SELECT process_id FROM wot_history WHERE wot_id = ?").all(wot.id) as any[]).map(h => h.process_id);
          const candidate = db.prepare(`
            SELECT * FROM bill_of_processes 
            WHERE project_id = ? AND UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END')
            ORDER BY step_sequence ASC
          `).all(wot.project_id) as any[];
          process = candidate.find(c => !historyIds.includes(c.id)) || candidate[0];
        }

        if (!process) return res.status(404).json({ error: "No active process step found for this WOT" });

        const procMachineId = process.assigned_machine_id || process.machine_id;
        if (procMachineId) {
          const activeNdp = db.prepare("SELECT * FROM notice_to_down_processes WHERE (machine_id = ? OR affected_machine_id = ?) AND status = 'ACTIVE'").get(procMachineId, procMachineId) as any;
          if (activeNdp) {
            return res.status(400).json({
              error: `Mesin [${procMachineId}] sedang mengalami breakdown (NDP: ${activeNdp.ndp_number}). Selesaikan NDP terlebih dahulu!`
            });
          }
        }

        const scrapCount = Math.max(0, Number(scrap_qty || reject_qty) || 0);
        const reworkCount = Math.max(0, Number(rework_qty) || 0);
        const completedQty = Math.max(1, Number(good_qty) || (Number(wot.qty) || 1) - scrapCount);
        const opName = operator_name || "Floor Operator";

        const allProcesses = db.prepare(`
          SELECT id, step_sequence, station_id FROM bill_of_processes 
          WHERE project_id = ? AND UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END')
          ORDER BY step_sequence ASC
        `).all(wot.project_id) as any[];

        const currIdx = allProcesses.findIndex((p: any) => p.id === process.id);
        const nextProcess = (currIdx !== -1 && currIdx < allProcesses.length - 1) ? allProcesses[currIdx + 1] : null;

        let travelTagNumber = `TAG-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

        db.transaction(() => {
          db.prepare(`
            INSERT INTO wot_history 
            (id, wot_id, project_id, process_id, station_id, operator_name, completed_at, qty, scrap_qty, notes)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
          `).run(
            crypto.randomUUID(), 
            wot.id, 
            wot.project_id, 
            process.id, 
            process.station_id || null, 
            opName, 
            completedQty, 
            scrapCount, 
            reject_reason || notes || `Completed process: ${process.process_name}`
          );

          db.prepare(`
            INSERT INTO production_wot_genealogy
            (id, wot_id, project_id, station_id, process_id, operator_name, yield_qty, scrap_qty, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            crypto.randomUUID(),
            wot.id,
            wot.project_id,
            process.station_id || null,
            process.id,
            opName,
            completedQty,
            scrapCount,
            reject_reason || notes || 'Verified process completion'
          );

          // Auto-generate task travel tag record
          try {
            const tagId = crypto.randomUUID();
            const qrPayload = JSON.stringify({
              tag_number: travelTagNumber,
              wot_id: wot.id,
              lot_number: wot.lot_number,
              project_id: wot.project_id,
              process_id: process.id,
              station_id: process.station_id,
              good_qty: completedQty,
              scrap_qty: scrapCount,
              rework_qty: reworkCount,
              completed_at: new Date().toISOString()
            });
            db.prepare(`
              INSERT INTO task_travel_tags
              (id, tag_number, project_id, bop_id, lot_id, operator_name, good_qty, scrap_qty, qc_status, qr_payload, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PASSED', ?, CURRENT_TIMESTAMP)
            `).run(
              tagId,
              travelTagNumber,
              wot.project_id,
              process.id,
              wot.lot_number || wot.id,
              opName,
              completedQty,
              scrapCount,
              qrPayload
            );
          } catch (tagErr) {
            console.warn("Could not insert travel tag:", tagErr);
          }

          try {
            db.prepare(`
              INSERT INTO wot_travel_logs
              (id, wot_id, event_type, station_id, process_id, machine_id, user_name, metadata)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              crypto.randomUUID(),
              wot.id,
              nextProcess ? (process.station_id === nextProcess.station_id ? 'INTRA_STATION_TRANSFER' : 'INTER_STATION_TRANSFER') : 'WOT_COMPLETED',
              process.station_id || null,
              process.id,
              procMachineId || null,
              opName,
              JSON.stringify({
                good_qty: completedQty,
                scrap_qty: scrapCount,
                rework_qty: reworkCount,
                next_process_id: nextProcess?.id,
                next_station_id: nextProcess?.station_id
              })
            );
          } catch (logErr) {
            console.warn("Could not insert wot_travel_log:", logErr);
          }

          // Update WOT state
          if (nextProcess) {
            const isSameStation = process.station_id === nextProcess.station_id;
            const nextStatus = isSameStation ? 'QUEUED' : 'TRANSFERRED';
            db.prepare(`
              UPDATE work_order_tickets 
              SET status = ?,
                  current_process_id = ?,
                  current_station_id = ?,
                  good_units = COALESCE(good_units, 0) + ?,
                  reject_units = COALESCE(reject_units, 0) + ?,
                  rework_units = COALESCE(rework_units, 0) + ?,
                  machine_id = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(nextStatus, nextProcess.id, nextProcess.station_id || null, completedQty, scrapCount, reworkCount, procMachineId || null, wot.id);
          } else {
            db.prepare(`
              UPDATE work_order_tickets 
              SET status = 'COMPLETED',
                  current_process_id = NULL,
                  good_units = COALESCE(good_units, 0) + ?,
                  reject_units = COALESCE(reject_units, 0) + ?,
                  rework_units = COALESCE(rework_units, 0) + ?,
                  machine_id = ?,
                  completed_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(completedQty, scrapCount, reworkCount, procMachineId || null, wot.id);
          }

          const totalDone = db.prepare(`
            SELECT COALESCE(SUM(qty), 0) as total 
            FROM wot_history 
            WHERE process_id = ? AND notes != 'Lot ticket generated'
          `).get(process.id) as any;

          const project = db.prepare("SELECT qty FROM projects WHERE id = ?").get(wot.project_id) as any;
          const prjQty = project?.qty || 1;
          const bopTotal = totalDone?.total || completedQty;
          const bopStatus = bopTotal >= prjQty ? 'COMPLETED' : 'RUNNING';
          const bopProgress = Math.min(100, Math.round((bopTotal / prjQty) * 100));

          db.prepare(`
            UPDATE bill_of_processes 
            SET completed_qty = ?, status = ?, progress = ?,
                actual_end_date = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE actual_end_date END
            WHERE id = ?
          `).run(bopTotal, bopStatus, bopProgress, bopStatus, process.id);

          // Insert production log entry
          try {
            db.prepare(`
              INSERT INTO production_logs
              (id, log_type, project_id, wot_id, station_id, process_id, user_role, details, timestamp)
              VALUES (?, 'WOT_COMPLETE', ?, ?, ?, ?, 'OPERATOR', ?, CURRENT_TIMESTAMP)
            `).run(
              crypto.randomUUID(),
              wot.project_id,
              wot.id,
              process.station_id || null,
              process.id,
              JSON.stringify({
                lot_number: wot.lot_number,
                process_name: process.process_name,
                good_qty: completedQty,
                reject_qty: scrapCount,
                is_final_step: !nextProcess
              })
            );
          } catch (logErr) {
            console.warn("Could not insert log entry", logErr);
          }
        })();
        
        invalidatePlanningCache();

        emitProductionUpdate("WOT_COMPLETED_STEP", {
          wotId: wot.id,
          processId: process.id,
          projectId: wot.project_id,
          nextProcessId: nextProcess?.id || null,
          isFinished: !nextProcess
        });

        res.json({
          ok: true,
          success: true,
          is_final_step: !nextProcess,
          next_process_id: nextProcess ? nextProcess.id : null,
          message: nextProcess 
            ? `Proses "${process.process_name}" selesai. WOT dialihkan ke langkah berikutnya.` 
            : `WOT telah menyelesaikan seluruh langkah produksi (Root-to-Finish)!`
        });
      } catch (err: any) {
        console.error("Complete WOT error:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/wots/generate-qr-batch", async (req, res) => {
      try {
        const { project_id, wot_ids } = req.body;
        if (!project_id) return res.status(400).json({ error: "project_id is required" });

        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(project_id) as any;
        if (!project) return res.status(404).json({ error: "Project not found" });

        let wotsQuery = `
          SELECT w.*, p.name as project_name, p.spk_number,
                 s.station_name, b.process_name,
                 i.name as machine_name, i.item_code as machine_code
          FROM work_order_tickets w
          LEFT JOIN projects p ON w.project_id = p.id
          LEFT JOIN project_stations s ON w.current_station_id = s.id
          LEFT JOIN bill_of_processes b ON w.current_process_id = b.id
          LEFT JOIN items i ON w.machine_id = i.id
          WHERE w.project_id = ?
        `;
        const params: any[] = [project_id];
        if (Array.isArray(wot_ids) && wot_ids.length > 0) {
          const placeholders = wot_ids.map(() => '?').join(',');
          wotsQuery += ` AND w.id IN (${placeholders})`;
          params.push(...wot_ids);
        }
        wotsQuery += " ORDER BY w.lot_number ASC";

        const wots = db.prepare(wotsQuery).all(...params) as any[];

        const updatedWots = [];

        for (const wot of wots) {
          const qrInfo = generateSignedWotQr({
            wot_id: wot.id,
            lot: wot.lot_number,
            prj: project.spk_number || project.name,
            st: wot.station_name || "ST-01",
            proc: wot.process_name || "General",
            mch: wot.machine_code || wot.machine_name || "MANUAL",
            qty: wot.qty
          });
          
          const payloadStr = qrInfo.rawJson;
          const qrDataUrl = await QRCode.toDataURL(payloadStr, { width: 256, margin: 1, errorCorrectionLevel: 'M' });

          db.prepare(`
            UPDATE work_order_tickets
            SET qr_payload = ?, qr_image_url = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(payloadStr, qrDataUrl, wot.id);

          // Travel log entry for QR generation if not yet created
          const hasLog = db.prepare("SELECT id FROM wot_travel_logs WHERE wot_id = ? AND event_type = 'START'").get(wot.id);
          if (!hasLog) {
            db.prepare(`
              INSERT INTO wot_travel_logs (id, wot_id, event_type, station_id, process_id, machine_id, user_name, metadata)
              VALUES (?, ?, 'START', ?, ?, ?, 'System', ?)
            `).run(crypto.randomUUID(), wot.id, wot.current_station_id || null, wot.current_process_id || null, wot.machine_id || null, JSON.stringify({ action: 'QR Generated with HMAC-SHA256 signature' }));
          }

          updatedWots.push({
            ...wot,
            qr_payload: payloadStr,
            qr_image_url: qrDataUrl
          });
        }

        res.json({ ok: true, success: true, count: updatedWots.length, wots: updatedWots });
      } catch (err: any) {
        console.error("Batch QR generate error:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/wots/scan", (req, res) => {
      try {
        const { qr_payload, user_id, device_info, station_id } = req.body;
        if (!qr_payload) return res.status(400).json({ error: "qr_payload is required" });

        const verification = verifyAndParseWotQr(String(qr_payload).trim());
        if (!verification.isValid) {
          // Log security audit for rejected scan
          try {
            db.prepare(`
              INSERT INTO production_logs 
              (id, log_type, project_id, user_id, user_role, device_info, details, timestamp)
              VALUES (?, 'REJECTED_SCAN', NULL, ?, 'OPERATOR', ?, ?, CURRENT_TIMESTAMP)
            `).run(
              crypto.randomUUID(),
              user_id || null,
              device_info || 'ShopFloorTerminal',
              JSON.stringify({ raw_input: String(qr_payload).substring(0, 200), reason: verification.reason })
            );
          } catch (_) {}

          return res.status(400).json({
            ok: true,
            is_valid: false,
            reason: verification.reason,
            message: "Tanda tangan keamanan QR tidak valid (HMAC Mismatch atau data rusak). Pindai ditolak.",
            next_action: "SCAN_REJECTED"
          });
        }

        const lotIdentifier = verification.payload?.lot || verification.payload?.wot_id || String(qr_payload).trim();

        const wot = db.prepare(`
          SELECT w.*, p.name as project_name, p.spk_number,
                 s.station_name, s.id as station_id,
                 b.process_name, b.id as bop_id, b.cycle_time_minutes,
                 i.name as machine_name, i.item_code as machine_code,
                 COALESCE(i.operational_status, i.machine_status, 'AVAILABLE') as machine_status
          FROM work_order_tickets w
          LEFT JOIN projects p ON w.project_id = p.id
          LEFT JOIN project_stations s ON w.current_station_id = s.id
          LEFT JOIN bill_of_processes b ON w.current_process_id = b.id
          LEFT JOIN items i ON w.machine_id = i.id
          WHERE w.lot_number = ? OR w.id = ? OR w.lot_number LIKE ?
        `).get(lotIdentifier, lotIdentifier, `%${lotIdentifier}%`) as any;

        if (!wot) {
          return res.status(404).json({ is_valid: false, message: `WOT tidak ditemukan: "${lotIdentifier}"` });
        }

        // Check if machine has active breakdown / NDP
        let isMachineDown = false;
        let ndpReason = "";
        if (wot.machine_id) {
          const activeNdp = db.prepare(`
            SELECT * FROM notice_to_down_processes 
            WHERE (machine_id = ? OR affected_machine_id = ?) AND status = 'ACTIVE'
          `).get(wot.machine_id, wot.machine_id) as any;
          if (activeNdp) {
            isMachineDown = true;
            ndpReason = activeNdp.reason_detail || activeNdp.reason_category || "Breakdown";
          }
        }

        if (isMachineDown) {
          return res.json({
            ok: true,
            is_valid: false,
            wot,
            message: `Mesin ${wot.machine_code || wot.machine_name} sedang dalam status NDP LOCKDOWN (${ndpReason}). Tidak dapat memproses WOT saat ini.`,
            next_action: "MACHINE_BLOCKED"
          });
        }

        // Check station mismatch if station_id provided by terminal
        if (station_id && wot.current_station_id && station_id !== wot.current_station_id) {
          return res.json({
            ok: true,
            is_valid: false,
            wot,
            message: `WOT ini terdaftar di ${wot.station_name || 'Station lain'}, Anda memindai di stasiun yang berbeda.`,
            next_action: "STATION_MISMATCH"
          });
        }

        // Insert immutable production log for QR scan
        const logId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO production_logs 
          (id, log_type, project_id, wot_id, station_id, process_id, machine_id, user_id, user_role, device_info, details, timestamp)
          VALUES (?, 'QR_SCAN', ?, ?, ?, ?, ?, ?, 'OPERATOR', ?, ?, CURRENT_TIMESTAMP)
        `).run(
          logId,
          wot.project_id,
          wot.id,
          wot.current_station_id,
          wot.current_process_id,
          wot.machine_id,
          user_id || null,
          device_info || 'ShopFloorTerminal',
          JSON.stringify({ lot: wot.lot_number, scanned_at: new Date().toISOString() })
        );

        // Insert into wot_travel_logs
        db.prepare(`
          INSERT INTO wot_travel_logs
          (id, wot_id, event_type, station_id, process_id, machine_id, user_name, metadata)
          VALUES (?, ?, 'QR_SCAN', ?, ?, ?, 'Operator', ?)
        `).run(
          crypto.randomUUID(),
          wot.id,
          wot.current_station_id,
          wot.current_process_id,
          wot.machine_id,
          JSON.stringify({ device: device_info || 'ShopFloorTerminal' })
        );

        emitProductionUpdate("WOT_SCANNED", { wot_id: wot.id, lot_number: wot.lot_number });

        return res.json({
          ok: true,
          is_valid: true,
          wot,
          message: `WOT [${wot.lot_number}] valid untuk stasiun ${wot.station_name || 'General'}.`,
          next_action: "CONFIRM_COMPLETION"
        });
      } catch (err: any) {
        console.error("Scan error:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/wots/confirm-completion", (req, res) => {
      try {
        const { wot_id, user_id, user_name, good_units, reject_units, rework_units, reject_reason, notes, device_info } = req.body;
        if (!wot_id) return res.status(400).json({ error: "wot_id is required" });

        const wot = db.prepare("SELECT * FROM work_order_tickets WHERE id = ?").get(wot_id) as any;
        if (!wot) return res.status(404).json({ error: "WOT not found" });

        const goodQty = Math.max(0, Number(good_units) || Number(wot.qty) || 1);
        const rejectQty = Math.max(0, Number(reject_units) || 0);
        const reworkQty = Math.max(0, Number(rework_units) || 0);
        const completedTotal = goodQty + rejectQty;
        const opName = user_name || "Shop Floor Operator";

        // Find current process
        const process = wot.current_process_id 
          ? db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(wot.current_process_id) as any
          : null;

        // Find all processes for this project ordered by sequence
        const allProcesses = db.prepare(`
          SELECT * FROM bill_of_processes 
          WHERE project_id = ? AND UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END')
          ORDER BY step_sequence ASC
        `).all(wot.project_id) as any[];

        const currIdx = process ? allProcesses.findIndex((p: any) => p.id === process.id) : -1;
        const nextProcess = (currIdx !== -1 && currIdx < allProcesses.length - 1) ? allProcesses[currIdx + 1] : null;

        let gateStatus = "TRANSFER_GATE_OPEN";
        let newStatus = "COMPLETED";
        let nextStationId = null;
        let nextProcessId = null;

        if (nextProcess) {
          const isSameStation = process && process.station_id === nextProcess.station_id;
          if (isSameStation) {
            // Intra-station transfer: piece flow / instant advance to next process
            gateStatus = "INTRA_STATION_ADVANCED";
            newStatus = "RUNNING";
            nextStationId = process.station_id;
            nextProcessId = nextProcess.id;
          } else {
            // Inter-station transfer: gate rule minimal 1 WOT completed
            gateStatus = "TRANSFER_GATE_OPEN";
            newStatus = "TRANSFERRED";
            nextStationId = nextProcess.station_id;
            nextProcessId = nextProcess.id;
          }
        } else {
          // Final process completed
          gateStatus = "FINAL_PRODUCT_READY";
          newStatus = "FINISHED";
        }

        const logId = crypto.randomUUID();

        db.transaction(() => {
          // Update WOT
          db.prepare(`
            UPDATE work_order_tickets
            SET status = ?,
                current_station_id = ?,
                current_process_id = ?,
                good_units = COALESCE(good_units, 0) + ?,
                reject_units = COALESCE(reject_units, 0) + ?,
                rework_units = COALESCE(rework_units, 0) + ?,
                completed_units = COALESCE(completed_units, 0) + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newStatus, nextStationId, nextProcessId, goodQty, rejectQty, reworkQty, completedTotal, wot.id);

          // Insert production log
          db.prepare(`
            INSERT INTO production_logs
            (id, log_type, project_id, wot_id, station_id, process_id, machine_id, user_id, user_role, device_info, details, timestamp)
            VALUES (?, 'WOT_COMPLETE', ?, ?, ?, ?, ?, ?, 'OPERATOR', ?, ?, CURRENT_TIMESTAMP)
          `).run(
            logId,
            wot.project_id,
            wot.id,
            wot.current_station_id,
            wot.current_process_id,
            wot.machine_id,
            user_id || null,
            device_info || 'ShopFloorTerminal',
            JSON.stringify({ good_units: goodQty, reject_units: rejectQty, rework_units: reworkQty, reject_reason, notes, gate_status: gateStatus })
          );

          // Insert wot_travel_logs
          db.prepare(`
            INSERT INTO wot_travel_logs
            (id, wot_id, event_type, station_id, process_id, machine_id, user_name, metadata)
            VALUES (?, ?, 'WOT_COMPLETE', ?, ?, ?, ?, ?)
          `).run(
            crypto.randomUUID(),
            wot.id,
            wot.current_station_id,
            wot.current_process_id,
            wot.machine_id,
            opName,
            JSON.stringify({ good_units: goodQty, reject_units: rejectQty, rework_units: reworkQty, gate_status: gateStatus })
          );

          if (gateStatus === 'TRANSFER_GATE_OPEN' || gateStatus === 'INTRA_STATION_ADVANCED') {
            db.prepare(`
              INSERT INTO wot_travel_logs
              (id, wot_id, event_type, station_id, process_id, machine_id, user_name, metadata)
              VALUES (?, ?, 'TRANSFER', ?, ?, ?, ?, ?)
            `).run(
              crypto.randomUUID(),
              wot.id,
              nextStationId,
              nextProcessId,
              null,
              opName,
              JSON.stringify({ type: gateStatus === 'INTRA_STATION_ADVANCED' ? 'INTRA_STATION' : 'INTER_STATION' })
            );
          }
        })();
        
        invalidatePlanningCache();

        emitProductionUpdate("WOT_COMPLETED", { wot_id: wot.id, gate_status: gateStatus });

        const updatedWot = db.prepare("SELECT * FROM work_order_tickets WHERE id = ?").get(wot.id);
        res.json({ ok: true, success: true, wot: updatedWot, log_id: logId, gate_status: gateStatus });
      } catch (err: any) {
        console.error("Confirm completion error:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.get("/api/wots/:id/travel-log", (req, res) => {
      try {
        const wotId = req.params.id;
        const logs = db.prepare(`
          SELECT tl.*, s.station_name, b.process_name, i.item_code as machine_code, i.name as machine_name
          FROM wot_travel_logs tl
          LEFT JOIN project_stations s ON tl.station_id = s.id
          LEFT JOIN bill_of_processes b ON tl.process_id = b.id
          LEFT JOIN items i ON tl.machine_id = i.id
          WHERE tl.wot_id = ?
          ORDER BY tl.created_at ASC, tl.timestamp ASC
        `).all(wotId);
        res.json({ ok: true, data: logs });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.get("/api/production/projects/:id/wots/history", (req, res) => {
      try {
        const history = db.prepare(`
          SELECT h.*, w.lot_number, b.process_name, COALESCE(s.station_name, 'Station') as station_name
          FROM wot_history h
          JOIN work_order_tickets w ON h.wot_id = w.id
          LEFT JOIN bill_of_processes b ON h.process_id = b.id
          LEFT JOIN project_stations s ON h.station_id = s.id
          WHERE h.project_id = ?
          ORDER BY h.completed_at DESC
        `).all(req.params.id);
        res.json({ ok: true, history });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

// Overtime Management & Direct Labor Integration with Project HPP
executionRouter.get("/api/production/projects/:id/overtime", (req, res) => {
  try {
    const projectId = req.params.id;
    const query = `
      SELECT 
        pos.*,
        pm.name as operator_name,
        pm.role as operator_role,
        pm.user_username,
        COALESCE(pos.hourly_rate, pm.hourly_rate, 45000) as hourly_rate,
        ps.name as station_name
      FROM project_overtime_schedules pos
      LEFT JOIN production_manpower pm ON pos.manpower_id = pm.id
      LEFT JOIN project_stations ps ON pos.station_id = ps.id
      WHERE pos.project_id = ?
      ORDER BY pos.date DESC, pos.created_at DESC
    `;
    const rows = db.prepare(query).all(projectId) as any[];

    const data = rows.map((r: any) => {
      const rate = Number(r.hourly_rate) || 45000;
      const otHrs = Number(r.overtime_hours) || 2;
      const otCalc = calculateTieredOvertimePay(rate * 173, 0, otHrs);
      const estCost = Number(r.estimated_cost) > 0 
        ? Number(r.estimated_cost) 
        : (otCalc.totalPay > 0 ? otCalc.totalPay : Math.round(otHrs * rate * 1.5));
      return {
        ...r,
        hourly_rate: rate,
        estimated_overtime_cost: estCost,
      };
    });

    res.json({ ok: true, data });
  } catch (err: any) {
    console.error("Failed to fetch project overtime schedules:", err);
    res.status(500).json({ error: err.message });
  }
});

executionRouter.post("/api/production/projects/:id/overtime", (req, res) => {
  try {
    const projectId = req.params.id;
    const { manpower_id, station_id, date, overtime_hours, reason, status = "APPROVED" } = req.body;

    if (!manpower_id || !date) {
      return res.status(400).json({ error: "Manpower and date are required" });
    }

    const mp = db.prepare("SELECT * FROM production_manpower WHERE id = ?").get(manpower_id) as any;
    const rate = Number(mp?.hourly_rate) || 45000;
    const otHrs = Number(overtime_hours) || 2;
    const otCalc = calculateTieredOvertimePay(rate * 173, 0, otHrs);
    const estCost = otCalc.totalPay > 0 ? otCalc.totalPay : Math.round(otHrs * rate * 1.5);
    const id = "OT-" + Math.random().toString(36).substring(2, 9).toUpperCase();
    const userEmail = (req.headers["x-user-email"] as string) || "SUPERVISOR";

    db.prepare(`
      INSERT INTO project_overtime_schedules (
        id, project_id, manpower_id, station_id, date, overtime_hours, reason, status, created_by, hourly_rate, estimated_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      projectId,
      manpower_id,
      station_id || null,
      date,
      otHrs,
      reason || "Pengejaran target deadline SPK",
      status,
      userEmail,
      rate,
      estCost,
    );

    // Synchronize to Project HPP & Financial Summaries directly
    try {
      recalculateProjectFinancialSummary(db, projectId);
    } catch (hppErr) {
      console.warn("Auto-recalculation of HPP on overtime creation skipped:", hppErr);
    }

    res.json({
      ok: true,
      message: "Overtime schedule created successfully",
      data: {
        id,
        project_id: projectId,
        manpower_id,
        station_id,
        date,
        overtime_hours: otHrs,
        reason,
        status,
        hourly_rate: rate,
        estimated_overtime_cost: estCost,
        operator_name: mp?.name,
        operator_role: mp?.role,
      },
    });
  } catch (err: any) {
    console.error("Failed to create overtime schedule:", err);
    res.status(500).json({ error: err.message });
  }
});

executionRouter.delete("/api/production/projects/:id/overtime/:overtimeId", (req, res) => {
      try {
        const { id: projectId, overtimeId } = req.params;
        db.prepare("DELETE FROM project_overtime_schedules WHERE id = ?").run(overtimeId);

        // Recalculate Project HPP
        try {
          recalculateProjectFinancialSummary(db, projectId);
        } catch (hppErr) {
          console.warn("Auto-recalculation of HPP on overtime deletion skipped:", hppErr);
        }

        res.json({ success: true, message: "Overtime schedule deleted and HPP updated" });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.get("/api/floor-requests", (req, res) => {
      try {
        const { status, type, project_id, station_id, requested_by, limit = 100, page = 1 } = req.query;
        let query = `
          SELECT 
            fr.*,
            p.name as project_name,
            p.spk_number,
            st.station_name,
            st.station_code,
            pr.pr_number,
            pr.status as pr_status,
            bom_item.name as bom_item_name,
            bom_item.item_code as bom_item_code,
            tool_item.name as tool_item_name,
            tool_item.item_code as tool_item_code
          FROM floor_requests fr
          LEFT JOIN projects p ON fr.project_id = p.id
          LEFT JOIN stations st ON fr.station_id = st.id
          LEFT JOIN purchase_requests pr ON fr.pr_id = pr.id
          LEFT JOIN items bom_item ON fr.bom_item_id = bom_item.id
          LEFT JOIN items tool_item ON fr.tool_item_id = tool_item.id
          WHERE 1=1
        `;
        const params: any[] = [];
        if (status && status !== 'ALL') { query += " AND fr.status = ?"; params.push(status); }
        if (type && type !== 'ALL') { query += " AND fr.type = ?"; params.push(type); }
        if (project_id) { query += " AND fr.project_id = ?"; params.push(project_id); }
        if (station_id) { query += " AND fr.station_id = ?"; params.push(station_id); }
        if (requested_by) { query += " AND fr.requested_by = ?"; params.push(requested_by); }
        
        query += " ORDER BY fr.created_at DESC LIMIT ? OFFSET ?";
        const limitNum = Number(limit);
        const offsetNum = (Number(page) - 1) * limitNum;
        params.push(limitNum, offsetNum);
        
        const rawData = db.prepare(query).all(...params) as any[];
        const data = rawData.map(r => ({
          ...r,
          photo_urls: typeof r.photo_urls === 'string' ? JSON.parse(r.photo_urls || "[]") : (r.photo_urls || []),
          fulfillment_photo_urls: typeof r.fulfillment_photo_urls === 'string' ? JSON.parse(r.fulfillment_photo_urls || "[]") : (r.fulfillment_photo_urls || [])
        }));

        // Compute aggregate statistics for the side panel header & KPI widgets
        const statsRow = db.prepare(`
          SELECT 
            COUNT(*) as total_all,
            SUM(CASE WHEN DATE(created_at) = DATE('now') THEN 1 ELSE 0 END) as total_today,
            SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN status IN ('ACKNOWLEDGED', 'IN_PROGRESS') THEN 1 ELSE 0 END) as in_progress_count,
            SUM(CASE WHEN status IN ('FULFILLED', 'RESOLVED', 'CLOSED') THEN 1 ELSE 0 END) as fulfilled_count,
            AVG(CASE WHEN fulfilled_at IS NOT NULL THEN (julianday(fulfilled_at) - julianday(created_at)) * 24 * 60 ELSE NULL END) as avg_response_minutes
          FROM floor_requests
        `).get() as any;

        const totalAll = Number(statsRow?.total_all || 0);
        const fulfilledCount = Number(statsRow?.fulfilled_count || 0);
        const fulfillmentRate = totalAll > 0 ? Math.round((fulfilledCount / totalAll) * 100) : 100;

        res.json({ 
          ok: true, 
          data,
          total: totalAll,
          stats: {
            total_today: Number(statsRow?.total_today || 0),
            pending_count: Number(statsRow?.pending_count || 0),
            in_progress_count: Number(statsRow?.in_progress_count || 0),
            fulfilled_count: fulfilledCount,
            avg_response_minutes: Math.round(Number(statsRow?.avg_response_minutes || 14)),
            fulfillment_rate: fulfillmentRate
          }
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.get("/api/floor-requests/:id", (req, res) => {
      try {
        const { id } = req.params;
        const r = db.prepare(`
          SELECT 
            fr.*,
            p.name as project_name,
            p.spk_number,
            st.station_name,
            pr.pr_number,
            pr.status as pr_status,
            bom_item.name as bom_item_name,
            tool_item.name as tool_item_name
          FROM floor_requests fr
          LEFT JOIN projects p ON fr.project_id = p.id
          LEFT JOIN stations st ON fr.station_id = st.id
          LEFT JOIN purchase_requests pr ON fr.pr_id = pr.id
          LEFT JOIN items bom_item ON fr.bom_item_id = bom_item.id
          LEFT JOIN items tool_item ON fr.tool_item_id = tool_item.id
          WHERE fr.id = ?
        `).get(id) as any;

        if (!r) return res.status(404).json({ error: "Floor request not found" });

        res.json({
          ok: true,
          data: {
            ...r,
            photo_urls: typeof r.photo_urls === 'string' ? JSON.parse(r.photo_urls || "[]") : (r.photo_urls || []),
            fulfillment_photo_urls: typeof r.fulfillment_photo_urls === 'string' ? JSON.parse(r.fulfillment_photo_urls || "[]") : (r.fulfillment_photo_urls || [])
          }
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.post("/api/floor-requests", (req, res) => {
      try {
        const { 
          type, category, station_id, project_id, process_id, wot_id, 
          title, description, qty_required, unit, requested_by, photo_urls,
          bom_item_id, item_name, tool_item_id, requested_machine_category, reason,
          auto_pr
        } = req.body;

        const id = crypto.randomUUID();
        const codeRow = db.prepare("SELECT COUNT(*) as count FROM floor_requests").get() as any;
        const seq = String((codeRow?.count || 0) + 1).padStart(4, "0");
        const request_code = `FR-${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2, '0')}-${seq}`;

        const reqType = type || 'MATERIAL';
        const reqCategory = category || 'NORMAL';
        const reqTitle = title || `${reqType} Request at Station`;
        const reqBy = requested_by || 'Floor Operator';

        // Check if material shortage requires auto-PR (Section 6.3)
        let generatedPrId = null;
        let generatedPrNumber = null;
        let finalStatus = 'PENDING';

        const shouldTriggerAutoPr = Boolean(auto_pr) || reqType === 'MATERIAL' || reqType === 'MATERIAL_REQUEST';

        if (shouldTriggerAutoPr && Number(qty_required) > 0) {
          try {
            const prId = crypto.randomUUID();
            const prNumRow = db.prepare("SELECT COUNT(*) as count FROM purchase_requests").get() as any;
            const prSeq = String((prNumRow?.count || 0) + 1).padStart(4, "0");
            generatedPrNumber = `PR-${new Date().getFullYear()}-${prSeq}`;
            generatedPrId = prId;

            const prUrgency = reqCategory === 'URGENT' ? 'CRITICAL' : 'HIGH';
            const prRemarks = `Auto-generated from Floor Request ${request_code}: ${reqTitle}. Qty: ${qty_required} ${unit || 'units'}. Reason: ${description || reason || 'Production Floor Shortage'}`;

            db.transaction(() => {
              db.prepare(`
                INSERT INTO purchase_requests (id, pr_number, project_id, request_date, status, requested_by, notes, urgency, category)
                VALUES (?, ?, ?, CURRENT_DATE, 'DRAFT', ?, ?, ?, 'FLOOR_REQUEST')
              `).run(prId, generatedPrNumber, project_id || null, reqBy, prRemarks, prUrgency);

              // Extract actual requested items to create PR items
              let itemIdToProcure = bom_item_id || tool_item_id;
              
              if (!itemIdToProcure && item_name) {
                // If item doesn't exist, create an ad-hoc catalog item to track procurement
                const existing = db.prepare("SELECT id FROM items WHERE name = ? OR item_code = ?").get(item_name, item_name) as any;
                if (existing) {
                  itemIdToProcure = existing.id;
                } else {
                  itemIdToProcure = crypto.randomUUID();
                  const fakeCode = "AUTO-MAT-" + Math.random().toString(36).substring(2, 8).toUpperCase();
                  db.prepare(`
                    INSERT INTO items (id, item_code, name, type, uom, unit_price, min_stock, max_stock)
                    VALUES (?, ?, ?, 'RAW', ?, 0, 0, 0)
                  `).run(itemIdToProcure, fakeCode, item_name, unit || 'PCS');
                  db.prepare(`
                    INSERT OR IGNORE INTO inventory (item_id, physical_qty, available_qty, free_stock)
                    VALUES (?, 0, 0, 0)
                  `).run(itemIdToProcure);
                }
              }

              if (itemIdToProcure) {
                db.prepare(`
                  INSERT INTO pr_items (id, pr_id, item_id, dimension, spec, qty, expected_delivery_date)
                  VALUES (?, ?, ?, NULL, ?, ?, NULL)
                `).run(
                  crypto.randomUUID(), 
                  prId, 
                  itemIdToProcure, 
                  description || reqTitle || 'Floor Shortage Request', 
                  Number(qty_required) || 1
                );
              }
            })();

            finalStatus = 'IN_PROGRESS'; // Mark as in-progress because procurement requisition was raised
          } catch (prErr) {
            console.error("Auto PR Generation failed:", prErr);
          }
        }

        db.prepare(`
          INSERT INTO floor_requests 
          (id, request_code, type, category, status, requested_by, station_id, project_id, process_id, wot_id, 
           title, description, qty_required, unit, photo_urls, bom_item_id, item_name, tool_item_id, 
           requested_machine_category, reason, auto_pr, pr_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, request_code, reqType, reqCategory, finalStatus, reqBy, 
          station_id || null, project_id || null, process_id || null, wot_id || null, 
          reqTitle, description || null, qty_required ? Number(qty_required) : null, unit || null, 
          photo_urls ? JSON.stringify(photo_urls) : null,
          bom_item_id || null, item_name || null, tool_item_id || null,
          requested_machine_category || null, reason || null,
          generatedPrId ? 1 : 0, generatedPrId
        );
        
        // Audit log in production_logs (Section 2.4)
        const logId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO production_logs 
          (id, log_type, project_id, wot_id, station_id, process_id, user_role, details, timestamp)
          VALUES (?, 'FLOOR_REQUEST_CREATED', ?, ?, ?, ?, 'OPERATOR', ?, CURRENT_TIMESTAMP)
        `).run(logId, project_id || null, wot_id || null, station_id || null, process_id || null, JSON.stringify({ 
          title: reqTitle, 
          description, 
          request_code, 
          type: reqType,
          category: reqCategory,
          qty_required, 
          unit,
          auto_pr_generated: Boolean(generatedPrId),
          pr_number: generatedPrNumber,
          photo_urls 
        }));
        
        emitProductionUpdate("NEW_FLOOR_REQUEST", { 
          id, 
          request_code, 
          type: reqType, 
          category: reqCategory,
          title: reqTitle,
          status: finalStatus,
          pr_id: generatedPrId,
          pr_number: generatedPrNumber
        });

        res.json({ 
          ok: true, 
          success: true,
          id, 
          request_code,
          status: finalStatus,
          pr_id: generatedPrId,
          pr_number: generatedPrNumber,
          message: generatedPrId ? `Floor Request ${request_code} created and Emergency Purchase Request ${generatedPrNumber} dispatched to Procurement.` : `Floor Request ${request_code} dispatched.`
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.patch("/api/floor-requests/:id/acknowledge", handleAcknowledgeFr);

executionRouter.post("/api/floor-requests/:id/acknowledge", handleAcknowledgeFr);

executionRouter.patch("/api/floor-requests/:id/fulfill", handleFulfillFr);

executionRouter.post("/api/floor-requests/:id/fulfill", handleFulfillFr);

executionRouter.patch("/api/floor-requests/:id/reject", handleRejectFr);

executionRouter.post("/api/floor-requests/:id/reject", handleRejectFr);

executionRouter.patch("/api/floor-requests/:id/close", handleCloseFr);

executionRouter.post("/api/floor-requests/:id/close", handleCloseFr);

executionRouter.patch("/api/floor-requests/:id", (req, res) => {
      try {
        const { id } = req.params;
        const { status, user_id, fulfillment_notes, fulfillment_photo_urls, reason } = req.body;
        
        if (status === 'ACKNOWLEDGED') return handleAcknowledgeFr(req, res);
        if (status === 'FULFILLED' || status === 'RESOLVED') return handleFulfillFr(req, res);
        if (status === 'REJECTED') return handleRejectFr(req, res);
        if (status === 'CLOSED') return handleCloseFr(req, res);

        db.prepare("UPDATE floor_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status || 'PENDING', id);
        emitProductionUpdate("FLOOR_REQUEST_UPDATED", { id, status });
        res.json({ ok: true, id, status });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.patch("/api/floor-requests/:id/:action", (req, res) => {
      const { action } = req.params;
      if (action === 'acknowledge') return handleAcknowledgeFr(req, res);
      if (action === 'fulfill') return handleFulfillFr(req, res);
      if (action === 'reject') return handleRejectFr(req, res);
      if (action === 'close') return handleCloseFr(req, res);
      res.status(400).json({ error: `Unknown action: ${action}` });
    });

executionRouter.post("/api/warehouse/scan-to-production", (req, res) => {
      try {
        const { qr_code } = req.body;
        // In a real scenario, this would parse the QR to find a specific dispatch or GRN ID.
        // For now, we simulate receiving the material and automatically resolving pending procurement NDPs.
        
        // Find all NDPs that are pending procurement
        const pendingNdps = db.prepare(`
          SELECT * FROM notice_to_down_processes 
          WHERE status = 'BLOCKED_PENDING_PROCUREMENT'
        `).all() as any[];

        let resolvedCount = 0;
        const now = new Date().toISOString();

        for (const ndp of pendingNdps) {
           db.prepare(`
             UPDATE notice_to_down_processes 
             SET status = 'RESOLVED', resolved_by = 'SYSTEM_AUTO', resolved_at = ?
             WHERE id = ?
           `).run(now, ndp.id);
           resolvedCount++;
           
           // Optionally, also resume the related BOP if needed.
        }

        res.json({ ok: true, message: `Material Received. ${resolvedCount} pending NDPs resolved automatically.` });
      } catch (err: any) {
        console.error("Error in scan-to-production:", err);
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.put("/api/production/wots/:id/status", (req, res) => {
      try {
        const { status, operator_name, notes, process_id } = req.body;
        const wotId = req.params.id;
        
        const wot = db.prepare("SELECT * FROM work_order_tickets WHERE id = ?").get(wotId) as any;
        if (!wot) return res.status(404).json({ error: "WOT not found" });

        db.prepare(`
          UPDATE work_order_tickets 
          SET status = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(status, wotId);

        if (notes || operator_name) {
           db.prepare(`
             INSERT INTO wot_history 
             (id, wot_id, project_id, process_id, station_id, operator_name, completed_at, qty, scrap_qty, notes)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 0, ?)
           `).run(
             crypto.randomUUID(), 
             wot.id, 
             wot.project_id, 
             process_id || wot.current_process_id || 'UNKNOWN', 
             wot.current_station_id || null, 
             operator_name || 'System', 
             wot.qty || 1, 
             notes || `Status changed to ${status}`
           );
        }

        emitProductionUpdate("WOT_STATUS_CHANGED", { wotId, status });
        res.json({ ok: true, status });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

executionRouter.get("/api/production/wots/:id/genealogy", (req, res) => {
      try {
        const wotId = req.params.id;
        const wot = db.prepare("SELECT * FROM work_order_tickets WHERE id = ?").get(wotId) as any;
        if (!wot) return res.status(404).json({ error: "WOT not found" });

        const history = db.prepare(`
          SELECT * FROM wot_history WHERE wot_id = ? ORDER BY completed_at ASC
        `).all(wotId);
        
        let logs = [];
        try {
          logs = db.prepare(`
            SELECT * FROM wot_travel_logs WHERE wot_id = ? ORDER BY created_at ASC
          `).all(wotId);
        } catch(e) {}
        
        let tags = [];
        try {
          tags = db.prepare(`
            SELECT * FROM task_travel_tags WHERE lot_id = ? OR lot_id = ? ORDER BY created_at ASC
          `).all(wotId, wot.lot_number);
        } catch(e) {}
        
        res.json({ wot, history, logs, tags });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

