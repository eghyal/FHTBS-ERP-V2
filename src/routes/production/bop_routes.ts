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

export const bopRouter = Router();

bopRouter.get("/api/production/bop", async (req, res) => {
      try {
        const { project_id } = req.query;
        if (!project_id) {
          return res.status(400).json({ error: "project_id is required" });
        }

        const nonMfgIds = ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"];
        if (typeof project_id === "string" && nonMfgIds.includes(project_id.toUpperCase())) {
          return res.json([]);
        }

        // Run auto-resolve and integrity check on product nodes first
        autoResolveDownstreamProductNodes(project_id as string, "System Auto-Check");

        // Primary: Fetch from local SQLite to guarantee zero node loss
        let bopList = db.prepare(
          `SELECT * FROM bill_of_processes 
           WHERE project_id = ? 
              OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
              OR project_id = (SELECT id FROM projects WHERE spk_number = ?)
           ORDER BY step_sequence ASC`
        ).all(project_id, project_id, project_id) as any[];

        if (!bopList || bopList.length === 0) {
          // Fallback to Firestore (HybridDB) if SQLite has no records for this project
          try {
            const { hybridDb } = await import("../../db/firestoreAdapter.ts");
            const fsList = await hybridDb.query("bill_of_processes", [
              { field: "project_id", op: "==", value: String(project_id) }
            ], 1000);
            if (fsList && fsList.length > 0) {
              bopList = fsList;
              bopList.sort((a, b) => (Number(a.step_sequence) || 0) - (Number(b.step_sequence) || 0));
            }
          } catch (fsErr) {
            console.warn("Firestore fallback warning fetching BOP list:", fsErr);
          }
        } else {
          // Asynchronously sync local records to Firestore so Firestore is completely updated
          bopList.forEach((item) => {
            syncCollectionToFirestore("bill_of_processes", item.id, item);
          });
        }

        const formatted = (bopList || []).map(item => ({
          ...item,
          lifecycle_status: item.node_type === 'PRODUCT' && item.product_node_lifecycle_status ? item.product_node_lifecycle_status : item.lifecycle_status,
          completed_qty: item.node_type === 'PRODUCT' && item.product_node_qty !== null ? Math.max(Number(item.completed_qty || 0), Number(item.product_node_qty || 0)) : item.completed_qty,
          predecessor_ids: typeof item.predecessor_ids === "string" ? JSON.parse(item.predecessor_ids || "[]") : (item.predecessor_ids || [])
        }));

        res.json(formatted);
      } catch (err: any) {
        console.error("Error fetching BoP list:", err);
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.get("/api/production/bop/:id/wip-status", (req, res) => {
      try {
        const { id } = req.params;
        const bop = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id) as any;
        if (!bop) return res.status(404).json({ error: "BOP not found" });

        const wipInfo = getAvailableInputWipForBop(id, bop.project_id);
        res.json(wipInfo);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.post("/api/production/bop/:id/status", (req, res) => {
      try {
        const { id } = req.params;
        const { status, progress, actual_start_date, actual_end_date } = req.body;

        const current = db.prepare(`SELECT * FROM bill_of_processes WHERE id = ?`).get(id) as any;
        if (!current) {
          return res.status(404).json({ error: "BoP item not found" });
        }

        const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || (req as any).userEmail || (req as any).username || "Production Operator";

        // Validate Seri Dependency & Active NDPs
        if (status === 'RUNNING' || status === 'COMPLETED' || status === 'PAUSED') {
          // Check for active NDPs
          const activeNdp = db.prepare(`SELECT COUNT(*) as count FROM notice_to_down_processes WHERE bop_id = ? AND status = 'ACTIVE'`).get(id) as any;
          if (activeNdp && activeNdp.count > 0) {
            return res.status(400).json({ error: "Cannot change status while there is an ACTIVE downtime notice (NDP). Resolve it first." });
          }

          if (status === 'RUNNING' && current.node_type !== 'PRODUCT') {
            const assignmentsForThisStep = db.prepare(`
              SELECT manpower_id FROM production_manpower_assignments 
              WHERE (bop_id = ? OR (bop_id IS NULL AND project_id = ? AND task_name = ?))
                AND status NOT IN ('CANCELLED', 'COMPLETED')
            `).all(id, current.project_id, current.process_name) as any[];

            if (assignmentsForThisStep.length === 0) {
              return res.status(400).json({ error: "Cannot start task! No manpower is assigned to this process. Please assign an operator first." });
            }

            preemptiveAutoPauseConflictingSteps(id, current.project_id, userIdentifier);
          }

          // Predecessor & Material Buffer (WIP) Check:
          // For RUNNING: Pipelining check (at least 1 completed WOT from predecessors) AND Material Availability
          if (status === 'RUNNING') {
            const predCheck = checkPredecessorsReadyForPipelining(id, current.project_id);
            if (!predCheck.isReady) {
              return res.status(400).json({
                error: `Tidak dapat memulai tahapan '${current.process_name}'! Belum ada WOT (Work Order Ticket) yang selesai pada proses prasyarat: ${predCheck.incompleteNodeNames.join(", ")}`
              });
            }

            const wipCheck = getAvailableInputWipForBop(id, current.project_id);
            if (wipCheck.isStarved) {
              return res.status(400).json({
                error: `Tidak dapat menjalankan '${current.process_name}'! Stok bahan setengah jadi (WIP) dari '${wipCheck.bottleneckProcess}' belum tersedia (Input minimum selesai: ${wipCheck.minInputProduced}, sudah diolah: ${wipCheck.currentConsumed}).`
              });
            }
          } else if (status === 'COMPLETED') {
            // For full completion: All predecessors must be 100% completed
            const predCheck = checkRecursivePredecessorsCompleted(id, current.project_id);
            if (!predCheck.isCompleted) {
              return res.status(400).json({
                error: `Tidak dapat menyelesaikan tahapan! Tahapan sebelumnya belum selesai secara menyeluruh: ${predCheck.incompleteNodeNames.join(", ")}`
              });
            }
          }
        }

        const projectObj = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(current.project_id) as any;
        const totalProjectQty = projectObj?.qty || 1;

        const newActualStart = actual_start_date || (status === 'RUNNING' && !current.actual_start_date ? new Date().toISOString() : current.actual_start_date);
        const newActualEnd = actual_end_date || (status === 'COMPLETED' ? new Date().toISOString() : current.actual_end_date);
        const newProgress = progress !== undefined ? progress : (status === 'COMPLETED' ? 100 : (status === 'RUNNING' ? (current.progress || 25) : current.progress));
        const newCompletedQty = status === 'COMPLETED' ? totalProjectQty : current.completed_qty;

        let predIds: string[] = [];
        try {
          predIds = Array.isArray(current.predecessor_ids)
            ? current.predecessor_ids
            : JSON.parse(current.predecessor_ids || "[]");
        } catch (e) {
          predIds = [];
        }

        const requestedPauseType = req.body.pause_type;
        const requestedIsManual = req.body.is_manual_pause;

        let newIsManualPause = 0;
        let newPauseType = 'NONE';

        if (status === 'PAUSED') {
          if (requestedIsManual !== undefined) {
            newIsManualPause = requestedIsManual ? 1 : 0;
          } else if (requestedPauseType !== undefined) {
            newIsManualPause = requestedPauseType === 'MANUAL' ? 1 : 0;
          } else {
            newIsManualPause = 1;
          }
          newPauseType = requestedPauseType || (newIsManualPause ? 'MANUAL' : 'AUTO');
        } else {
          newIsManualPause = 0;
          newPauseType = 'NONE';
        }

        const executeStatusChangeTransaction = db.transaction(() => {
          db.prepare(`
            UPDATE bill_of_processes
            SET status = ?, is_manual_pause = ?, pause_type = ?, progress = ?, completed_qty = ?, actual_start_date = ?, actual_end_date = ?,
                completed_by_operator = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_by_operator END,
                completed_at_timestamp = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE completed_at_timestamp END
            WHERE id = ?
          `).run(status, newIsManualPause, newPauseType, newProgress, newCompletedQty, newActualStart, newActualEnd, status, userIdentifier, status, id);

          db.prepare(`
            UPDATE project_tasks
            SET status = ?, is_manual_pause = ?, pause_type = ?, progress = ?, actual_start_date = ?, actual_end_date = ?
            WHERE id = ?
          `).run(status, newIsManualPause, newPauseType, newProgress, newActualStart, newActualEnd, id);

          // Update operator allocation status accordingly
          if (status === 'RUNNING') {
            db.prepare(`
              UPDATE production_manpower_assignments
              SET status = 'ACTIVE'
              WHERE (bop_id = ? OR (bop_id IS NULL AND project_id = ? AND task_name = ?)) AND status IN ('SCHEDULED', 'PAUSED')
            `).run(id, current.project_id, current.process_name);
          } else if (status === 'PAUSED') {
            db.prepare(`
              UPDATE production_manpower_assignments
              SET status = 'PAUSED'
              WHERE (bop_id = ? OR (bop_id IS NULL AND project_id = ? AND task_name = ?)) AND status = 'ACTIVE'
            `).run(id, current.project_id, current.process_name);
          } else if (status === 'COMPLETED') {
            db.prepare(`
              UPDATE production_manpower_assignments
              SET status = 'COMPLETED'
              WHERE (bop_id = ? OR (bop_id IS NULL AND project_id = ? AND task_name = ?)) AND status IN ('ACTIVE', 'SCHEDULED', 'PAUSED_NDP', 'PAUSED')
            `).run(id, current.project_id, current.process_name);
          }

          // Also sync lot_routing_executions so the tickets move!
          const projectLots = db.prepare(`SELECT * FROM production_lots WHERE project_id = ? ORDER BY lot_number ASC`).all(current.project_id) as any[];
          
          let cumulativeStartOffsetMs = 0;
          const cycleTimeMins = current.cycle_time_minutes || 10;
          const assignment = db.prepare(`SELECT planned_hours FROM production_manpower_assignments WHERE bop_id = ? AND status IN ('ACTIVE', 'SCHEDULED', 'PAUSED') LIMIT 1`).get(current.id) as any;
          const workingHoursPerDay = assignment?.planned_hours || 8;
          const realTimeMultiplier = 24 / workingHoursPerDay;
          const nowMs = Date.now();

          for (const lot of projectLots) {
             const lotStartMs = nowMs + cumulativeStartOffsetMs;
             const lotStartIso = new Date(lotStartMs).toISOString();
             
             const workMs = (lot.target_qty || 1) * cycleTimeMins * 60 * 1000;
             cumulativeStartOffsetMs += (workMs * realTimeMultiplier);

             let lotTargetStatus = status;
             if (status === 'RUNNING') {
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
               lotTargetStatus = isLotUnlocked ? 'RUNNING' : 'LOCKED';
             }

             const exec = db.prepare(`SELECT id FROM lot_routing_executions WHERE lot_id = ? AND bop_id = ?`).get(lot.id, id) as any;
             if (exec) {
                db.prepare(`
                  UPDATE lot_routing_executions 
                  SET status = ?, 
                      operator_name = COALESCE(NULLIF(operator_name, ''), ?), 
                      good_qty = CASE WHEN ? = 'COMPLETED' THEN ? ELSE good_qty END,
                      start_time = COALESCE(start_time, ?), 
                      end_time = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE end_time END 
                  WHERE id = ?
                `).run(lotTargetStatus, userIdentifier, status, lot.target_qty || 0, lotStartIso, status, exec.id);
             } else {
                const newId = "LEX-" + Math.random().toString(36).substr(2, 9);
                db.prepare(`
                  INSERT INTO lot_routing_executions (id, lot_id, bop_id, status, good_qty, operator_name, start_time, end_time) 
                  VALUES (?, ?, ?, ?, CASE WHEN ? = 'COMPLETED' THEN ? ELSE 0 END, ?, ?, CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END)
                `).run(newId, lot.id, id, lotTargetStatus, status, lot.target_qty || 0, userIdentifier, lotStartIso, status);
             }
          }

          if (status === 'COMPLETED') {
            autoResolveDownstreamProductNodes(current.project_id, userIdentifier);
            autoStartDownstreamProcesses(current.project_id, userIdentifier);
          } else if (status === 'RUNNING') {
            autoStartDownstreamProcesses(current.project_id, userIdentifier);
          }

          logAudit(userIdentifier, "BOP_STATUS_UPDATE", "BOP", id, `BoP step '${current.process_name}' status changed from ${current.status} to ${status}`);
        });

        executeStatusChangeTransaction();

        emitProductionUpdate("BOP_STATUS_CHANGED", { bopId: id, status, projectId: current.project_id });

        res.json({ success: true, message: `Task updated to ${status}` });
      } catch (err: any) {
        console.error("Error updating BoP status:", err);
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.post("/api/production/bop/:id/increment", (req, res) => {
      try {
        const { id } = req.params;
        const { increment = 1, set_completed_qty } = req.body || {};

        const current = db.prepare(`SELECT * FROM bill_of_processes WHERE id = ?`).get(id) as any;
        if (!current) {
          return res.status(404).json({ error: "BoP item not found" });
        }

        const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(current.project_id) as any;
        const targetQty = project?.qty || 1;

        const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || (req as any).userEmail || (req as any).username || "Production Operator";

        // Check for active NDPs
        const activeNdp = db.prepare(`SELECT COUNT(*) as count FROM notice_to_down_processes WHERE bop_id = ? AND status = 'ACTIVE'`).get(id) as any;
        if (activeNdp && activeNdp.count > 0) {
          return res.status(400).json({ error: "Cannot process units while downtime notice (NDP) is active." });
        }

        // Validate Material Availability (WIP Ledger Buffer)
        // If this process has predecessors, it cannot produce more units than min(completed_qty of predecessors)
        const wipCheck = getAvailableInputWipForBop(id, current.project_id);
        const requestedQtyToAdd = set_completed_qty !== undefined ? (Number(set_completed_qty) - Number(current.completed_qty || 0)) : Number(increment);
        
        if (requestedQtyToAdd > 0 && wipCheck.availableQty < requestedQtyToAdd) {
          // Auto-pause station to STARVED state if no input material is available
          db.prepare(`UPDATE bill_of_processes SET status = 'PAUSED', is_manual_pause = 0, pause_type = 'STARVED' WHERE id = ?`).run(id);
          db.prepare(`UPDATE project_tasks SET status = 'PAUSED', is_manual_pause = 0, pause_type = 'STARVED' WHERE id = ?`).run(id);
          db.prepare(`UPDATE lot_routing_executions SET status = 'PAUSED' WHERE bop_id = ? AND status = 'RUNNING'`).run(id);
          
          emitProductionUpdate("BOP_STATUS_CHANGED", { bopId: id, status: "PAUSED", projectId: current.project_id, reason: "STARVED" });

          return res.status(400).json({ 
            error: `Stok bahan setengah jadi (WIP) tidak mencukupi! Stasiun '${current.process_name}' memerlukan input dari '${wipCheck.bottleneckProcess}' (Tersedia: ${wipCheck.availableQty} unit, Butuh: ${requestedQtyToAdd} unit).`,
            isStarved: true,
            bottleneckProcess: wipCheck.bottleneckProcess,
            availableQty: wipCheck.availableQty,
            minInputProduced: wipCheck.minInputProduced,
            currentConsumed: wipCheck.currentConsumed
          });
        }

        let newCompletedQty = set_completed_qty !== undefined ? Number(set_completed_qty) : ((current.completed_qty || 0) + Number(increment));
        if (isNaN(newCompletedQty) || newCompletedQty < 0) newCompletedQty = 0;
        if (newCompletedQty > targetQty) newCompletedQty = targetQty;

        const newProgress = Math.min(100, Math.round((newCompletedQty / targetQty) * 100));
        let newStatus = current.status;
        if (current.status === 'PENDING' && newCompletedQty > 0) {
          newStatus = 'RUNNING';
        }
        if (newCompletedQty >= targetQty) {
          newStatus = 'COMPLETED';
        }

        const now = new Date().toISOString();
        const newActualStart = current.actual_start_date || now;
        const newActualEnd = newStatus === 'COMPLETED' ? (current.actual_end_date || now) : current.actual_end_date;

        db.transaction(() => {
          db.prepare(`
            UPDATE bill_of_processes
            SET completed_qty = ?,
                progress = ?,
                status = ?,
                actual_start_date = ?,
                actual_end_date = ?,
                completed_by_operator = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_by_operator END,
                completed_at_timestamp = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE completed_at_timestamp END
            WHERE id = ?
          `).run(newCompletedQty, newProgress, newStatus, newActualStart, newActualEnd, newStatus, userIdentifier, newStatus, id);

          db.prepare(`
            UPDATE project_tasks
            SET progress = ?, status = ?, actual_start_date = ?, actual_end_date = ?
            WHERE id = ?
          `).run(newProgress, newStatus, newActualStart, newActualEnd, id);

          // Update Lots execution dynamically for piece flow
          const projectLots = db.prepare(`SELECT * FROM production_lots WHERE project_id = ? ORDER BY lot_number ASC`).all(current.project_id) as any[];
          let remainingQtyToAllocate = newCompletedQty;

          for (const lot of projectLots) {
            const lotTarget = lot.target_qty || 1;
            const lotGoodQty = Math.min(lotTarget, Math.max(0, remainingQtyToAllocate));
            remainingQtyToAllocate -= lotGoodQty;

            const lotStatus = lotGoodQty >= lotTarget ? 'COMPLETED' : (lotGoodQty > 0 ? 'RUNNING' : 'PENDING');

            const exec = db.prepare(`SELECT id FROM lot_routing_executions WHERE lot_id = ? AND bop_id = ?`).get(lot.id, id) as any;
            if (exec) {
              db.prepare(`
                UPDATE lot_routing_executions
                SET good_qty = ?, status = ?, operator_name = ?,
                    start_time = COALESCE(start_time, ?),
                    end_time = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE end_time END
                WHERE id = ?
              `).run(lotGoodQty, lotStatus, userIdentifier, now, lotStatus, exec.id);
            } else if (lotGoodQty > 0) {
              const newExecId = "LEX-" + Math.random().toString(36).substr(2, 9);
              db.prepare(`
                INSERT INTO lot_routing_executions (id, lot_id, bop_id, status, good_qty, operator_name, start_time, end_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END)
              `).run(newExecId, lot.id, id, lotStatus, lotGoodQty, userIdentifier, now, lotStatus);
            }
          }

          // Trigger pipelining: If at least 1 WOT / unit is finished, downstream dependent steps can start!
          if (newCompletedQty > 0) {
            autoStartDownstreamProcesses(current.project_id, userIdentifier);
          }

          if (newStatus === 'COMPLETED') {
            autoResolveDownstreamProductNodes(current.project_id, userIdentifier);
          }
        })();

        emitProductionUpdate("BOP_INCREMENT", { bopId: id, completedQty: newCompletedQty, progress: newProgress, status: newStatus, projectId: current.project_id });

        res.json({
          success: true,
          completed_qty: newCompletedQty,
          target_qty: targetQty,
          progress: newProgress,
          status: newStatus,
          process_name: current.process_name
        });
      } catch (err: any) {
        console.error("Error incrementing BoP unit:", err);
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.post("/api/production/bop/:id/schedule", (req, res) => {
      try {
        const { id } = req.params;
        const { start_date, end_date, standard_hours, cycle_time_minutes, shift_mode } = req.body;

        const current = db.prepare(`SELECT * FROM bill_of_processes WHERE id = ?`).get(id) as any;
        if (!current) {
          return res.status(404).json({ error: "BoP item not found" });
        }

        const hoursNum = Number(standard_hours) || current.standard_hours || 8;
        const cycleTimeNum = Number(cycle_time_minutes) || current.cycle_time_minutes || (hoursNum * 60);
        const shiftModeNum = Number(shift_mode) || current.shift_mode || 1;

        db.prepare(`
          UPDATE bill_of_processes
          SET start_date = COALESCE(?, start_date),
              end_date = COALESCE(?, end_date),
              standard_hours = ?,
              cycle_time_minutes = ?,
              shift_mode = ?
          WHERE id = ?
        `).run(start_date || null, end_date || null, hoursNum, cycleTimeNum, shiftModeNum, id);

        db.prepare(`
          UPDATE project_tasks
          SET start_date = COALESCE(?, start_date),
              end_date = COALESCE(?, end_date),
              required_hours = ?
          WHERE id = ? OR (project_id = ? AND task_name = ?)
        `).run(start_date || null, end_date || null, hoursNum, id, current.project_id, current.process_name);

        logAudit("admin", "BOP_SCHEDULE_UPDATE", "BOP", id, `Updated schedule & cycle time plan for '${current.process_name}': Cycle Time ${cycleTimeNum}m/unit, Std Hours ${hoursNum}h`);

        res.json({ success: true, message: "Schedule & cycle time plan updated successfully" });
      } catch (err: any) {
        console.error("Error updating BoP schedule:", err);
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.patch("/api/production/bop/:id", (req, res) => {
      try {
        const { id } = req.params;
        const { cycle_time_minutes, station_id, process_name, standard_hours } = req.body;

        const current = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id) as any;
        if (!current) {
          return res.status(404).json({ error: "BoP item not found" });
        }

        const newCycle = cycle_time_minutes !== undefined ? Number(cycle_time_minutes) : current.cycle_time_minutes;
        const newStation = station_id !== undefined ? station_id : current.station_id;
        const newProcessName = process_name !== undefined ? process_name : current.process_name;
        const newStdHours = standard_hours !== undefined ? Number(standard_hours) : (newCycle ? Number((newCycle / 60).toFixed(2)) : current.standard_hours);

        db.prepare(`
          UPDATE bill_of_processes
          SET cycle_time_minutes = ?,
              station_id = ?,
              process_name = ?,
              standard_hours = ?
          WHERE id = ?
        `).run(newCycle, newStation, newProcessName, newStdHours, id);

        const updated = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id);
        try {
          syncCollectionToFirestore("bill_of_processes", id, updated);
        } catch (syncErr) {}
        res.json({ success: true, data: updated });
      } catch (err: any) {
        console.error("Error updating BoP step:", err);
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.put("/api/production/bop/:id/machine", (req, res) => {
      try {
        const { id } = req.params;
        const { 
          machine_id, 
          alternative_machine_ids, 
          setup_time_minutes, 
          teardown_time_minutes, 
          cycle_time_minutes,
          force_bypass 
        } = req.body;
        
        const current = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id) as any;
        if (!current) {
          return res.status(404).json({ error: "BoP process item not found" });
        }
        
        const targetMachineId = machine_id || req.body.assigned_machine_id || null;

        if (targetMachineId) {
          const machine = db.prepare("SELECT * FROM items WHERE id = ?").get(targetMachineId) as any;
          if (!machine) {
            return res.status(404).json({ error: "Machine not found" });
          }

          const allowsBypass = Boolean(machine.bypass_multi_station || force_bypass);
          
          if (!allowsBypass) {
            // Check across all active projects/processes
            const conflict = db.prepare(`
              SELECT b.id, b.process_name, p.id as project_id, p.name as project_name
              FROM bill_of_processes b
              JOIN projects p ON b.project_id = p.id
              WHERE b.assigned_machine_id = ?
                AND b.id != ?
                AND p.status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED')
                AND COALESCE(b.lifecycle_status, 'ACTIVE') NOT IN ('COMPLETED', 'FINISHED', 'CANCELLED')
              LIMIT 1
            `).get(targetMachineId, id) as any;

            if (conflict) {
              return res.status(400).json({ 
                error: `Machine [${machine.name || machine.item_code}] is currently assigned to Project [${conflict.project_name}] Process [${conflict.process_name}]. Cannot double-assign.` 
              });
            }
          }
        }
        
        // Format alternative machines
        let altJson = '[]';
        if (Array.isArray(alternative_machine_ids)) {
          altJson = JSON.stringify(alternative_machine_ids);
        } else if (typeof alternative_machine_ids === 'string') {
          altJson = alternative_machine_ids;
        }

        // Release previous machine schedule if changing
        if (current.assigned_machine_id && current.assigned_machine_id !== targetMachineId) {
          db.prepare(`
            UPDATE machine_schedules
            SET is_active = 0, released_at = CURRENT_TIMESTAMP
            WHERE machine_id = ? AND process_id = ? AND is_active = 1
          `).run(current.assigned_machine_id, id);
        }

        // Update bill_of_processes
        db.prepare(`
          UPDATE bill_of_processes 
          SET assigned_machine_id = ?,
              alternative_machine_ids = ?,
              setup_time_minutes = COALESCE(?, setup_time_minutes, 0),
              teardown_time_minutes = COALESCE(?, teardown_time_minutes, 0),
              cycle_time_minutes = COALESCE(?, cycle_time_minutes)
          WHERE id = ?
        `).run(
          targetMachineId, 
          altJson, 
          setup_time_minutes !== undefined ? Number(setup_time_minutes) : null,
          teardown_time_minutes !== undefined ? Number(teardown_time_minutes) : null,
          cycle_time_minutes !== undefined ? Number(cycle_time_minutes) : null,
          id
        );

        // Record in machine_schedules if assigned
        if (targetMachineId) {
          const existingSched = db.prepare(`
            SELECT id FROM machine_schedules 
            WHERE machine_id = ? AND process_id = ? AND is_active = 1
          `).get(targetMachineId, id);

          if (!existingSched) {
            db.prepare(`
              INSERT INTO machine_schedules (
                id, machine_id, project_id, station_id, process_id, assigned_at, is_active, bypass_station_lock
              ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1, ?)
            `).run(
              "SCHED-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
              targetMachineId,
              current.project_id,
              current.station_id || "STATION-DEFAULT",
              id,
              req.body.force_bypass ? 1 : 0
            );
          }

          // Update machine status to ASSIGNED if AVAILABLE
          db.prepare(`
            UPDATE items 
            SET machine_status = 'ASSIGNED'
            WHERE id = ? AND (machine_status = 'AVAILABLE' OR machine_status IS NULL)
          `).run(targetMachineId);
        }
        
        const updated = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id);
        res.json(updated);
      } catch (err: any) {
        console.error("Error updating machine assignment:", err);
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.put("/api/production/bop/:id/station", (req, res) => {
      try {
        const { id } = req.params;
        const { station_id } = req.body;

        const current = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id) as any;
        if (!current) {
          return res.status(404).json({ error: "BoP process item not found" });
        }

        // Validate station exists if provided
        let targetStationId: string | null = station_id ? String(station_id).trim() : null;
        if (targetStationId && targetStationId !== "") {
          const stn = db.prepare("SELECT * FROM project_stations WHERE id = ? OR station_code = ?").get(targetStationId, targetStationId) as any;
          if (stn) {
            targetStationId = stn.id;
          }
        } else {
          targetStationId = null;
        }

        db.prepare(`
          UPDATE bill_of_processes
          SET station_id = ?
          WHERE id = ?
        `).run(targetStationId, id);

        const updated = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id);
        try {
          syncCollectionToFirestore("bill_of_processes", id, updated);
        } catch (syncErr) {}

        res.json({ success: true, data: updated });
      } catch (err: any) {
        console.error("Error updating BoP process station:", err);
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.post("/api/production/bop/:id/increment-lot", (req, res) => {
      try {
        const { id } = req.params;
        const current = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id) as any;
        if (!current) return res.status(404).json({ error: "BoP item not found" });

        const firstLot = db.prepare("SELECT target_qty FROM production_lots WHERE project_id = ? ORDER BY lot_number ASC LIMIT 1").get(current.project_id) as any;
        const lotSize = Math.max(1, Number(firstLot?.target_qty || 10));

        const project = db.prepare("SELECT qty FROM projects WHERE id = ?").get(current.project_id) as any;
        const targetQty = project?.qty || 1;

        const currentQty = Number(current.completed_qty || 0);
        const nextLotTarget = Math.min(targetQty, (Math.floor(currentQty / lotSize) + 1) * lotSize);
        const qtyToAdd = nextLotTarget - currentQty;

        if (qtyToAdd <= 0) {
          return res.json({ success: true, message: "All lots already completed for this step", completed_qty: currentQty });
        }

        // Call internal increment with qtyToAdd
        const wipCheck = getAvailableInputWipForBop(id, current.project_id);
        if (wipCheck.availableQty < qtyToAdd) {
          return res.status(400).json({
            error: `Stok WIP tidak mencukupi untuk memproses 1 lot penuh (${qtyToAdd} unit). Tersedia: ${wipCheck.availableQty} unit.`,
            availableQty: wipCheck.availableQty,
            bottleneckProcess: wipCheck.bottleneckProcess
          });
        }

        const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || "Production Operator";
        const now = new Date().toISOString();
        const newCompletedQty = nextLotTarget;
        const newProgress = Math.min(100, Math.round((newCompletedQty / targetQty) * 100));
        const newStatus = newCompletedQty >= targetQty ? 'COMPLETED' : 'RUNNING';

        db.transaction(() => {
          db.prepare(`
            UPDATE bill_of_processes
            SET completed_qty = ?, progress = ?, status = ?,
                actual_start_date = COALESCE(actual_start_date, ?),
                actual_end_date = CASE WHEN ? = 'COMPLETED' THEN ? ELSE actual_end_date END,
                completed_by_operator = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_by_operator END
            WHERE id = ?
          `).run(newCompletedQty, newProgress, newStatus, now, newStatus, now, newStatus, userIdentifier, id);

          db.prepare(`
            UPDATE project_tasks
            SET progress = ?, status = ?, actual_start_date = COALESCE(actual_start_date, ?),
                actual_end_date = CASE WHEN ? = 'COMPLETED' THEN ? ELSE actual_end_date END
            WHERE id = ?
          `).run(newProgress, newStatus, now, newStatus, now, id);

          autoStartDownstreamProcesses(current.project_id, userIdentifier);
          if (newStatus === 'COMPLETED') {
            autoResolveDownstreamProductNodes(current.project_id, userIdentifier);
          }
        })();

        emitProductionUpdate("BOP_INCREMENT", { bopId: id, completedQty: newCompletedQty, progress: newProgress, status: newStatus, projectId: current.project_id });
        res.json({ success: true, completed_qty: newCompletedQty, progress: newProgress, status: newStatus, added_qty: qtyToAdd });
      } catch (err: any) {
        console.error("Increment lot error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // ==========================================
    // PROJECT STATIONS MANAGEMENT ENDPOINTS
    // ==========================================

    // Get all stations for a specific project
    bopRouter.get("/api/production/projects/:projectId/stations", (req, res) => {
      try {
        const { projectId } = req.params;
        if (!projectId) {
          return res.status(400).json({ error: "projectId is required" });
        }

        const stations = db.prepare(`
          SELECT * FROM project_stations 
          WHERE project_id = ? 
             OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
             OR project_id = (SELECT id FROM projects WHERE spk_number = ?)
          ORDER BY station_sequence ASC, station_code ASC
        `).all(projectId, projectId, projectId) as any[];

        res.json({ ok: true, stations });
      } catch (err: any) {
        console.error("Error fetching project stations:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Create a new station for a project
    bopRouter.post("/api/production/projects/:projectId/stations", (req, res) => {
      try {
        const { projectId } = req.params;
        const { station_code, station_name, station_type, max_manpower, work_center_id, description } = req.body;

        if (!projectId || !station_code || !station_name) {
          return res.status(400).json({ error: "projectId, station_code, and station_name are required" });
        }

        const cleanCode = String(station_code).trim().toUpperCase();
        const cleanName = String(station_name).trim();

        // Check uniqueness of station_code in project
        const existing = db.prepare(`
          SELECT id FROM project_stations 
          WHERE project_id = ? AND UPPER(station_code) = UPPER(?)
        `).get(projectId, cleanCode);

        if (existing) {
          return res.status(400).json({ error: `Station code '${cleanCode}' is already used in this project.` });
        }

        // Determine next sequence
        const maxSeqRow = db.prepare(`
          SELECT MAX(station_sequence) as max_seq FROM project_stations WHERE project_id = ?
        `).get(projectId) as any;
        const nextSeq = (maxSeqRow?.max_seq || 0) + 1;

        const stationId = `STATION-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        db.prepare(`
          INSERT INTO project_stations (
            id, project_id, station_code, station_name, station_type, max_manpower, work_center_id, description, station_sequence, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'IDLE')
        `).run(
          stationId,
          projectId,
          cleanCode,
          cleanName,
          station_type || 'SERIAL',
          Math.max(1, Number(max_manpower) || 3),
          work_center_id || null,
          description || null,
          nextSeq
        );

        const created = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId);
        try {
          syncCollectionToFirestore("project_stations", stationId, created);
        } catch (e) {}

        res.json({ ok: true, success: true, station: created });
      } catch (err: any) {
        console.error("Error creating project station:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Update an existing station
    bopRouter.put("/api/production/projects/:projectId/stations/:stationId", (req, res) => {
      try {
        const { projectId, stationId } = req.params;
        const { station_code, station_name, station_type, max_manpower, work_center_id, description } = req.body;

        const current = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId) as any;
        if (!current) {
          return res.status(404).json({ error: "Station not found" });
        }

        const cleanCode = station_code ? String(station_code).trim().toUpperCase() : current.station_code;
        const cleanName = station_name ? String(station_name).trim() : current.station_name;

        // Check uniqueness if code changed
        if (cleanCode !== current.station_code) {
          const duplicate = db.prepare(`
            SELECT id FROM project_stations 
            WHERE project_id = ? AND UPPER(station_code) = UPPER(?) AND id != ?
          `).get(projectId, cleanCode, stationId);

          if (duplicate) {
            return res.status(400).json({ error: `Station code '${cleanCode}' is already used in this project.` });
          }
        }

        db.prepare(`
          UPDATE project_stations 
          SET station_code = ?,
              station_name = ?,
              station_type = COALESCE(?, station_type),
              max_manpower = COALESCE(?, max_manpower),
              work_center_id = COALESCE(?, work_center_id),
              description = COALESCE(?, description),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          cleanCode,
          cleanName,
          station_type,
          max_manpower ? Math.max(1, Number(max_manpower)) : null,
          work_center_id,
          description,
          stationId
        );

        const updated = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId);
        try {
          syncCollectionToFirestore("project_stations", stationId, updated);
        } catch (e) {}

        res.json({ ok: true, success: true, station: updated });
      } catch (err: any) {
        console.error("Error updating project station:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Delete a station
    bopRouter.delete("/api/production/projects/:projectId/stations/:stationId", (req, res) => {
      try {
        const { projectId, stationId } = req.params;

        const current = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId) as any;
        if (!current) {
          return res.status(404).json({ error: "Station not found" });
        }

        db.transaction(() => {
          // Unlink station from any associated BOP processes
          db.prepare("UPDATE bill_of_processes SET station_id = NULL WHERE station_id = ?").run(stationId);
          // Clean up manpower assignments on this station
          db.prepare("DELETE FROM production_manpower_assignments WHERE station_id = ?").run(stationId);
          // Delete station
          db.prepare("DELETE FROM project_stations WHERE id = ?").run(stationId);
        })();

        try {
          deleteDocFromFirestore("project_stations", stationId);
        } catch (e) {}

        res.json({ ok: true, success: true, message: "Station deleted successfully" });
      } catch (err: any) {
        console.error("Error deleting project station:", err);
        res.status(500).json({ error: err.message });
      }
    });

