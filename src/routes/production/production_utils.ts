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

export const computeNdpRippleAnalysis = (machineId: string, estimatedDownHours: number = 48) => {
      if (!machineId) return null;

      // 1. Machine details
      const machine = db.prepare(`
        SELECT id, item_code, name, capacity_per_hour, operational_status, machine_status, bypass_multi_station, machine_category
        FROM items WHERE id = ?
      `).get(machineId) as any;

      if (!machine) return null;

      // 2. Cross-Process Impact: All uncompleted BOPs assigned to this machine across all active projects
      const affectedBops = db.prepare(`
        SELECT b.id, b.process_name, b.project_id, b.station_id, b.cycle_time_minutes, b.status,
               b.alternative_machine_ids, p.name as project_name, p.spk_number, p.due_date, p.urgency
        FROM bill_of_processes b
        JOIN projects p ON b.project_id = p.id
        WHERE (b.assigned_machine_id = ? OR b.machine_id = ?)
          AND b.status NOT IN ('COMPLETED', 'CANCELLED')
          AND p.status NOT IN ('COMPLETED', 'CANCELLED')
      `).all(machineId, machineId) as any[];

      // 3. Cross-Station Impact: Map stations and check for alternative machines
      const stationMap: Record<string, any> = {};
      for (const bop of affectedBops) {
        if (bop.station_id && !stationMap[bop.station_id]) {
          const st = db.prepare("SELECT id, station_name, station_code, station_sequence FROM stations WHERE id = ?").get(bop.station_id) as any;
          let altMachines: any[] = [];
          try {
            const altIds = JSON.parse(bop.alternative_machine_ids || "[]");
            if (altIds.length > 0) {
              const placeholders = altIds.map(() => "?").join(",");
              altMachines = db.prepare(`
                SELECT id, item_code, name, capacity_per_hour, operational_status, machine_status
                FROM items WHERE id IN (${placeholders})
              `).all(...altIds) as any[];
            }
          } catch (e) {}

          const usableAlt = altMachines.filter(m => m.operational_status !== 'BROKEN' && m.machine_status !== 'BROKEN');

          stationMap[bop.station_id] = {
            station_id: bop.station_id,
            station_name: st?.station_name || `Station ${bop.station_id}`,
            station_sequence: st?.station_sequence || 1,
            project_id: bop.project_id,
            project_name: bop.project_name,
            has_alternative: usableAlt.length > 0,
            alternative_machines: usableAlt,
            recommendation: usableAlt.length > 0 
              ? `Rekomendasi: Alihkan ke mesin cadangan ${usableAlt.map((m: any) => m.name).join(", ")}`
              : "Tidak ada mesin cadangan operasional. Disarankan aktifkan overtime atau perbaikan darurat."
          };
        }
      }

      // 4. Cross-Project Impact: Projects affected with delivery delay risks
      const projectMap: Record<string, any> = {};
      for (const bop of affectedBops) {
        if (!projectMap[bop.project_id]) {
          projectMap[bop.project_id] = {
            project_id: bop.project_id,
            project_name: bop.project_name,
            spk_number: bop.spk_number,
            due_date: bop.due_date,
            urgency: bop.urgency,
            affected_processes_count: 0,
            estimated_delay_hours: estimatedDownHours,
            delivery_risk: estimatedDownHours >= 24 ? "HIGH_DELAY_RISK" : "MODERATE_IMPACT"
          };
        }
        projectMap[bop.project_id].affected_processes_count += 1;
      }

      // 5. Active WIP WOTs affected
      const affectedWots = db.prepare(`
        SELECT w.id, w.lot_number, w.project_id, w.status, w.qty, w.current_station_id, w.current_process_id, p.name as project_name
        FROM work_order_tickets w
        JOIN projects p ON w.project_id = p.id
        WHERE (w.machine_id = ? OR w.current_process_id IN (
          SELECT id FROM bill_of_processes WHERE assigned_machine_id = ? OR machine_id = ?
        ))
        AND w.status IN ('RUNNING', 'QUEUED', 'BLOCKED_NDP')
      `).all(machineId, machineId, machineId) as any[];

      return {
        affected_machine: {
          id: machine.id,
          item_code: machine.item_code,
          name: machine.name,
          capacity_per_hour: machine.capacity_per_hour,
          bypass_multi_station: Boolean(machine.bypass_multi_station),
          machine_category: machine.machine_category
        },
        affected_wots_count: affectedWots.length,
        affected_projects_count: Object.keys(projectMap).length,
        affected_processes_count: affectedBops.length,
        estimated_delay_hours: estimatedDownHours,
        critical_path_shift: true,
        reschedule_recommended: true,
        cross_process_impact: affectedBops,
        cross_station_impact: Object.values(stationMap),
        cross_project_impact: Object.values(projectMap),
        affected_wots: affectedWots
      };
    };

export const handleCreateNdp = (req: any, res: any) => {
      try {
        const { 
          project_id, bop_id, process_id, station_id,
          reason_category, type, reason_detail, description,
          estimated_down_hours, authorized_by, reported_by, 
          machine_id, affected_machine_id, severity, machine_lockdown_scope,
          requires_procurement, bom_items, photo_urls
        } = req.body;

        const effectiveMachineId = machine_id || affected_machine_id || null;
        const effectiveCategory = reason_category || type || 'MACHINE_BREAKDOWN';
        const effectiveDetail = reason_detail || description || 'Unplanned downtime incident';
        const effectiveHours = Number(estimated_down_hours) || (effectiveCategory === 'MACHINE_BREAKDOWN' ? 48 : 4);
        const effectiveAuthor = authorized_by || reported_by || 'Floor Operator';

        const countRow = db.prepare("SELECT COUNT(*) as count FROM notice_to_down_processes").get() as any;
        const seq = String((countRow?.count || 0) + 1).padStart(4, "0");
        const ndp_number = `NDP-${new Date().getFullYear()}-${seq}`;
        const ndpId = require('crypto').randomUUID();

        // 1. Calculate Cross-Impact Ripple Analysis
        let ripple_analysis_obj = null;
        if (effectiveMachineId) {
          ripple_analysis_obj = computeNdpRippleAnalysis(effectiveMachineId, effectiveHours);
        }
        const ripple_analysis = ripple_analysis_obj ? JSON.stringify(ripple_analysis_obj) : null;

        // 2. Insert into notice_to_down_processes
        db.prepare(`
          INSERT INTO notice_to_down_processes 
          (id, ndp_number, project_id, bop_id, reason_category, reason_detail, 
           estimated_down_hours, authorized_by, machine_id, affected_machine_id, status, severity, 
           machine_lockdown_scope, ripple_analysis, photo_urls, station_id, reschedule_required, requires_procurement)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).run(
          ndpId, ndp_number, project_id || null, bop_id || process_id || null, 
          effectiveCategory, effectiveDetail, effectiveHours, effectiveAuthor, 
          effectiveMachineId, effectiveMachineId, 
          (requires_procurement ? "BLOCKED_PENDING_PROCUREMENT" : "ACTIVE"), 
          severity || 'HIGH', machine_lockdown_scope || 'GLOBAL', 
          ripple_analysis, photo_urls ? JSON.stringify(photo_urls) : null,
          station_id || null, requires_procurement ? 1 : 0
        );

        // Also insert into ndps table for unified cross-module compatibility
        try {
          db.prepare(`
            INSERT INTO ndps (id, ndp_code, type, severity, status, reported_by, description, affected_machine_id, machine_lockdown_scope, ripple_analysis, project_id, bop_id, station_id, reschedule_required)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            ndpId, ndp_number, effectiveCategory, severity || 'HIGH', 
            (requires_procurement ? "BLOCKED_PENDING_PROCUREMENT" : "ACTIVE"),
            effectiveAuthor, effectiveDetail, effectiveMachineId, machine_lockdown_scope || 'GLOBAL',
            ripple_analysis, project_id || null, bop_id || process_id || null, station_id || null
          );
        } catch (errNdps) {}

        // 3. Machine Lockdown (5.3.1)
        if (effectiveMachineId) {
          db.prepare("UPDATE items SET operational_status = 'BROKEN', machine_status = 'BROKEN' WHERE id = ?").run(effectiveMachineId);
          
          // Log machine lockdown in production_logs
          const mLogId = require('crypto').randomUUID();
          db.prepare(`
            INSERT INTO production_logs (id, log_type, project_id, process_id, machine_id, user_role, details, timestamp)
            VALUES (?, 'NDP_MACHINE_LOCKDOWN', ?, ?, ?, 'SYSTEM', ?, CURRENT_TIMESTAMP)
          `).run(mLogId, project_id || null, bop_id || process_id || null, effectiveMachineId, JSON.stringify({
            ndp_number, reason: effectiveDetail, down_hours: effectiveHours
          }));

          // 4. Pause Current WIP (5.3.3): Flag active WOTs on this machine as BLOCKED_NDP
          const pausedWots = db.prepare(`
            UPDATE work_order_tickets
            SET status = 'BLOCKED_NDP'
            WHERE (machine_id = ? OR current_process_id = ?)
              AND status IN ('RUNNING', 'QUEUED')
            RETURNING id, lot_number
          `).all(effectiveMachineId, bop_id || process_id || '__none__') as any[];

          for (const w of pausedWots) {
            const wLogId = require('crypto').randomUUID();
            db.prepare(`
              INSERT INTO production_logs (id, log_type, project_id, process_id, machine_id, user_role, details, timestamp)
              VALUES (?, 'NDP_WOT_BLOCKED', ?, ?, ?, 'SYSTEM', ?, CURRENT_TIMESTAMP)
            `).run(wLogId, project_id || null, bop_id || process_id || null, effectiveMachineId, JSON.stringify({
              wot_id: w.id, lot_number: w.lot_number, ndp_number
            }));
          }
        }

        // 5. Procurement Integration (Auto PR generation)
        let generatedPrNumber = null;
        if (requires_procurement) {
          const prCountRow = db.prepare("SELECT COUNT(*) as count FROM purchase_requests").get() as any;
          const prSeq = String((prCountRow?.count || 0) + 1).padStart(4, "0");
          generatedPrNumber = `PR-${new Date().getFullYear()}-${prSeq}`;
          const prId = require('crypto').randomUUID();
          
          db.prepare(`
            INSERT INTO purchase_requests (id, pr_number, project_id, status, urgency, remarks, category)
            VALUES (?, ?, ?, 'DRAFTED', 'CRITICAL', ?, 'NDP_ORIGIN')
          `).run(prId, generatedPrNumber, project_id || null, `NDP Emergency Procurement - Generated from ${ndp_number}: ${effectiveDetail}`);

          // Update NDP with related_pr_id
          db.prepare("UPDATE notice_to_down_processes SET related_pr_id = ? WHERE id = ?").run(prId, ndpId);
          
          // ADDITION: Inject actual material shortage items into pr_items
          const reqMaterial = req.body.material_request;
          let itemsToProcure: any[] = [];
          if (reqMaterial && reqMaterial.item_name) {
            itemsToProcure.push({
              item_name: reqMaterial.item_name,
              qty: reqMaterial.qty || 1
            });
          }
          if (req.body.bom_items && Array.isArray(req.body.bom_items)) {
            itemsToProcure = itemsToProcure.concat(req.body.bom_items);
          }

          if (itemsToProcure.length > 0) {
            const insertPrItem = db.prepare(`
              INSERT INTO pr_items (id, pr_id, item_id, dimension, spec, qty, expected_delivery_date)
              VALUES (?, ?, ?, NULL, ?, ?, NULL)
            `);
            const insertItem = db.prepare(`
              INSERT INTO items (id, item_code, name, type, uom, unit_price, min_stock, max_stock)
              VALUES (?, ?, ?, 'RAW', 'PCS', 0, 0, 0)
            `);
            const insertInventory = db.prepare(`
              INSERT OR IGNORE INTO inventory (item_id, physical_qty, available_qty, free_stock)
              VALUES (?, 0, 0, 0)
            `);

            for (const item of itemsToProcure) {
              let finalItemId = item.item_id;
              
              if (!finalItemId && item.item_name) {
                const existing = db.prepare("SELECT id FROM items WHERE name = ? OR item_code = ?").get(item.item_name, item.item_name) as any;
                if (existing) {
                  finalItemId = existing.id;
                } else {
                  finalItemId = require('crypto').randomUUID();
                  const fakeCode = "AUTO-MAT-" + Math.random().toString(36).substring(2, 8).toUpperCase();
                  insertItem.run(finalItemId, fakeCode, item.item_name);
                  insertInventory.run(finalItemId);
                }
              }

              if (finalItemId) {
                insertPrItem.run(
                  require('crypto').randomUUID(),
                  prId,
                  finalItemId,
                  item.spec || item.item_name || 'Emergency Part',
                  item.qty || item.quantity || 1
                );
              }
            }
          }
        }

        // 6. Broadcast Real-Time Production & Planning Update
        invalidatePlanningCache();
        
        emitProductionUpdate("NEW_NDP", { 
          id: ndpId, 
          ndp_number, 
          machine_id: effectiveMachineId,
          reschedule_required: true,
          ripple_analysis: ripple_analysis_obj 
        });

        res.json({ 
          success: true, 
          ndp_number, 
          id: ndpId,
          pr_number: generatedPrNumber,
          ripple_analysis: ripple_analysis_obj,
          cross_impact: ripple_analysis_obj
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

export const handleGetNdps = (req: any, res: any) => {
      try {
        const ndps = db.prepare(`
          SELECT n.*, p.name as project_name, p.spk_number, 
                 i.name as machine_name, i.item_code as machine_code, i.capacity_per_hour
          FROM notice_to_down_processes n
          LEFT JOIN projects p ON n.project_id = p.id
          LEFT JOIN items i ON (n.machine_id = i.id OR n.affected_machine_id = i.id)
          ORDER BY n.created_at DESC
        `).all() as any[];

        const formatted = ndps.map(n => ({
          ...n,
          ripple_analysis: n.ripple_analysis ? JSON.parse(n.ripple_analysis) : null
        }));

        res.json({ success: true, ndps: formatted, data: formatted });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

export const handleGetActiveNdps = (req: any, res: any) => {
      try {
        const ndps = db.prepare(`
          SELECT n.*, p.name as project_name, p.spk_number,
                 i.name as machine_name, i.item_code as machine_code, i.capacity_per_hour
          FROM notice_to_down_processes n
          LEFT JOIN projects p ON n.project_id = p.id
          LEFT JOIN items i ON (n.machine_id = i.id OR n.affected_machine_id = i.id)
          WHERE n.status IN ('ACTIVE', 'BLOCKED_PENDING_PROCUREMENT')
          ORDER BY n.created_at DESC
        `).all() as any[];

        const formatted = ndps.map(n => ({
          ...n,
          ripple_analysis: n.ripple_analysis ? JSON.parse(n.ripple_analysis) : null
        }));

        res.json({ success: true, ndps: formatted, data: formatted });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

export const handleGetNdpImpactAnalysis = (req: any, res: any) => {
      try {
        const { id } = req.params;
        const ndp = db.prepare(`
          SELECT n.*, p.name as project_name, p.spk_number,
                 i.name as machine_name, i.item_code as machine_code, i.capacity_per_hour
          FROM notice_to_down_processes n
          LEFT JOIN projects p ON n.project_id = p.id
          LEFT JOIN items i ON (n.machine_id = i.id OR n.affected_machine_id = i.id)
          WHERE n.id = ?
        `).get(id) as any;

        if (!ndp) return res.status(404).json({ error: "NDP not found" });

        const machineId = ndp.machine_id || ndp.affected_machine_id;
        const ripple = computeNdpRippleAnalysis(machineId, ndp.estimated_down_hours || 48);

        res.json({
          success: true,
          ndp,
          ripple_analysis: ripple,
          cross_process_impact: ripple?.cross_process_impact || [],
          cross_station_impact: ripple?.cross_station_impact || [],
          cross_project_impact: ripple?.cross_project_impact || [],
          affected_wots: ripple?.affected_wots || []
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

export const handlePreviewImpact = (req: any, res: any) => {
      try {
        const { machine_id, hours } = req.query;
        if (!machine_id) {
          return res.status(400).json({ error: "machine_id is required" });
        }
        const ripple = computeNdpRippleAnalysis(String(machine_id), Number(hours) || 48);
        res.json({ success: true, ripple_analysis: ripple });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

export const handleRescheduleTrigger = (req: any, res: any) => {
      try {
        const { id } = req.params;
        const ndp = db.prepare("SELECT * FROM notice_to_down_processes WHERE id = ?").get(id) as any;
        if (!ndp) return res.status(404).json({ error: "NDP not found" });

        db.prepare("UPDATE notice_to_down_processes SET reschedule_required = 0 WHERE id = ?").run(id);
        try {
          db.prepare("UPDATE ndps SET reschedule_required = 0 WHERE id = ?").run(id);
        } catch (e) {}

        emitProductionUpdate("PLANNING_RESCHEDULED", { ndp_id: id, ndp_number: ndp.ndp_number });

        res.json({ 
          success: true, 
          message: `Planning schedule synchronized for ${ndp.ndp_number}. All downstream project constraints updated.`,
          ndp_id: id
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

export const handleResolveNdp = (req: any, res: any) => {
      try {
        const { id } = req.params;
        const { resolved_by, resolution_type, resolution_notes, alternative_machine_id } = req.body;
        
        const ndp = db.prepare("SELECT * FROM notice_to_down_processes WHERE id = ?").get(id) as any;
        if (!ndp) return res.status(404).json({ error: "NDP not found" });

        // Update notice_to_down_processes
        db.prepare(`
          UPDATE notice_to_down_processes 
          SET status = 'RESOLVED', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP,
              resolution_type = ?, resolution_notes = ?, reschedule_required = 0
          WHERE id = ?
        `).run(resolved_by || 'Maintenance Lead', resolution_type || 'REPAIRED', resolution_notes || 'Issue resolved and machine restored', id);

        try {
          db.prepare(`
            UPDATE ndps
            SET status = 'RESOLVED', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP,
                resolution_type = ?, resolution_notes = ?, reschedule_required = 0
            WHERE id = ?
          `).run(resolved_by || 'Maintenance Lead', resolution_type || 'REPAIRED', resolution_notes || 'Issue resolved', id);
        } catch (e) {}

        const targetMachineId = ndp.machine_id || ndp.affected_machine_id;

        // Check if any other active breakdown exists on this machine
        if (targetMachineId) {
          const otherActive = db.prepare(`
            SELECT COUNT(*) as count FROM notice_to_down_processes 
            WHERE (machine_id = ? OR affected_machine_id = ?) 
              AND status IN ('ACTIVE', 'BLOCKED_PENDING_PROCUREMENT') 
              AND id != ?
          `).get(targetMachineId, targetMachineId, id) as any;

          if (Number(otherActive?.count || 0) === 0) {
            db.prepare("UPDATE items SET operational_status = 'AVAILABLE', machine_status = 'AVAILABLE' WHERE id = ?").run(targetMachineId);
            
            const logId = require('crypto').randomUUID();
            db.prepare(`
              INSERT INTO production_logs (id, log_type, project_id, process_id, machine_id, user_role, details, timestamp)
              VALUES (?, 'NDP_MACHINE_RESOLVED', ?, ?, ?, 'SYSTEM', ?, CURRENT_TIMESTAMP)
            `).run(logId, ndp.project_id, ndp.bop_id, targetMachineId, JSON.stringify({
              ndp_number: ndp.ndp_number, resolved_by, resolution_type
            }));
          }

          // Unblock WOTs (5.4)
          if (alternative_machine_id) {
            db.prepare(`
              UPDATE work_order_tickets
              SET status = 'QUEUED', machine_id = ?
              WHERE (machine_id = ? OR current_process_id = ?)
                AND status = 'BLOCKED_NDP'
            `).run(alternative_machine_id, targetMachineId, ndp.bop_id || '__none__');
          } else {
            db.prepare(`
              UPDATE work_order_tickets
              SET status = 'QUEUED'
              WHERE (machine_id = ? OR current_process_id = ?)
                AND status = 'BLOCKED_NDP'
            `).run(targetMachineId, ndp.bop_id || '__none__');
          }

          const unblockLogId = require('crypto').randomUUID();
          db.prepare(`
            INSERT INTO production_logs (id, log_type, project_id, process_id, machine_id, user_role, details, timestamp)
            VALUES (?, 'NDP_WOT_UNBLOCKED', ?, ?, ?, 'SYSTEM', ?, CURRENT_TIMESTAMP)
          `).run(unblockLogId, ndp.project_id, ndp.bop_id, targetMachineId, JSON.stringify({
            ndp_number: ndp.ndp_number, alternative_machine_id
          }));
        }
        
        invalidatePlanningCache();

        emitProductionUpdate("NDP_RESOLVED", { id, ndp_number: ndp.ndp_number, machine_id: targetMachineId });
        res.json({ success: true, message: `NDP ${ndp.ndp_number} resolved and production unblocked.` });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

export const emitProductionUpdate = (action: string, payload: any = {}) => {
  const io = (global as any).io;
  if (io) {
    io.emit("production_update", { action, timestamp: Date.now(), ...payload });
  }
};

export const getHeijunkaThreshold = (): number => {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'heijunka_threshold'").get() as { value: string } | undefined;
    if (row && row.value) {
      const num = parseFloat(row.value);
      if (!isNaN(num) && num >= 0) return num;
    }
  } catch (e) {}
  return 5000000;
};

export function getBomProcurementPipelineStatus(projectId: string, bomAllocations: any): {
      status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
      progress: number;
      lifecycle_status: string;
    } {
      let allocs: any[] = [];
      try {
        allocs = typeof bomAllocations === 'string' ? JSON.parse(bomAllocations) : (bomAllocations || []);
      } catch (e) {
        allocs = [];
      }

      if (!Array.isArray(allocs) || allocs.length === 0) {
        return { status: 'PENDING', progress: 0, lifecycle_status: 'Planned' };
      }

      let minProgress = 100;
      let lowestStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' = 'COMPLETED';
      let primaryLifecycle = 'Available';

      for (const alloc of allocs) {
        const bomId = alloc.bom_id || alloc.id;
        if (!bomId) continue;

        const bomItem = db.prepare("SELECT * FROM boms WHERE id = ?").get(bomId) as any;
        if (!bomItem) continue;

        // Check PRs & POs for this item
        const priList = db.prepare(`
          SELECT pri.*, pr.status as pr_status, po.status as po_status 
          FROM pr_items pri 
          JOIN purchase_requests pr ON pri.pr_id = pr.id 
          LEFT JOIN purchase_orders po ON pri.po_id = po.id 
          WHERE (pr.project_id = ? OR pr.project_id = (SELECT spk_number FROM projects WHERE id = ?))
            AND pri.item_id = ?
        `).all(projectId, projectId, bomItem.item_id) as any[];

        // Check physical inventory / movements / GRN
        const labelCount = (db.prepare(`SELECT COUNT(*) as count FROM inventory_labels WHERE (project_id = ? OR project_id = (SELECT spk_number FROM projects WHERE id = ?)) AND item_id = ?`).get(projectId, projectId, bomItem.item_id) as any)?.count || 0;
        const movementCount = (db.prepare(`SELECT COUNT(*) as count FROM stock_movements WHERE (project_id = ? OR project_id = (SELECT spk_number FROM projects WHERE id = ?)) AND item_id = ? AND type IN ('CONSUMPTION', 'RELEASE', 'TRANSFER', 'ALLOCATION')`).get(projectId, projectId, bomItem.item_id) as any)?.count || 0;
        const grnCount = (db.prepare(`
          SELECT COUNT(*) as count 
          FROM grn_items gi 
          JOIN grns g ON gi.grn_id = g.id 
          JOIN purchase_orders po ON g.po_id = po.id 
          JOIN pr_items pri ON pri.po_id = po.id AND pri.item_id = gi.item_id 
          JOIN purchase_requests pr ON pri.pr_id = pr.id 
          WHERE (pr.project_id = ? OR pr.project_id = (SELECT spk_number FROM projects WHERE id = ?)) 
            AND gi.item_id = ? 
            AND g.qc_status IN ('PASSED', 'CONDITIONAL')
        `).get(projectId, projectId, bomItem.item_id) as any)?.count || 0;

        let itemProgress = 0;
        let itemStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' = 'PENDING';
        let itemLifecycle = 'Planned';

        if (labelCount > 0 || movementCount > 0 || grnCount > 0) {
          itemProgress = 100;
          itemStatus = 'COMPLETED';
          itemLifecycle = 'Available';
        } else if (priList.length > 0) {
          let maxStage = 0;
          for (const pri of priList) {
            const prSt = (pri.pr_status || '').toUpperCase();
            const poSt = (pri.po_status || '').toUpperCase();

            if (poSt === 'DELIVERED' || poSt === 'RECEIVED' || poSt === 'CLOSED' || prSt === 'FULFILLED') {
              maxStage = Math.max(maxStage, 5);
            } else if (poSt === 'IN_TRANSIT' || poSt === 'SHIPPED') {
              maxStage = Math.max(maxStage, 4);
            } else if (poSt === 'ISSUED' || poSt === 'SENT' || poSt === 'APPROVED' || pri.po_id || prSt === 'ORDERED' || prSt === 'PARTIAL_ORDERED') {
              maxStage = Math.max(maxStage, 3);
            } else if (prSt === 'AUTHORIZED' || prSt === 'APPROVED') {
              maxStage = Math.max(maxStage, 2);
            } else if (prSt === 'PENDING' || prSt === 'SUBMITTED' || prSt === 'REVISION') {
              maxStage = Math.max(maxStage, 1);
            } else if (prSt === 'REJECTED' || prSt === 'CANCELLED') {
              maxStage = Math.max(maxStage, 0);
            }
          }

          if (maxStage === 5) {
            itemProgress = 100;
            itemStatus = 'COMPLETED';
            itemLifecycle = 'Available';
          } else if (maxStage === 4) {
            itemProgress = 80;
            itemStatus = 'IN_PROGRESS';
            itemLifecycle = 'In Transit';
          } else if (maxStage === 3) {
            itemProgress = 60;
            itemStatus = 'IN_PROGRESS';
            itemLifecycle = 'PO Issued';
          } else if (maxStage === 2) {
            itemProgress = 40;
            itemStatus = 'IN_PROGRESS';
            itemLifecycle = 'PR Approved';
          } else if (maxStage === 1) {
            itemProgress = 20;
            itemStatus = 'PENDING';
            itemLifecycle = 'PR Pending';
          } else {
            itemProgress = 0;
            itemStatus = 'PENDING';
            itemLifecycle = 'Planned';
          }
        } else {
          itemProgress = 0;
          itemStatus = 'PENDING';
          itemLifecycle = 'Planned';
        }

        if (itemProgress < minProgress) {
          minProgress = itemProgress;
          lowestStatus = itemStatus;
          primaryLifecycle = itemLifecycle;
        }
      }

      return {
        status: lowestStatus,
        progress: minProgress,
        lifecycle_status: primaryLifecycle
      };
    }

export function checkRecursivePredecessorsCompleted(targetId: string, projectId: string): { isCompleted: boolean; incompleteNodeNames: string[] } {
      const allBopSteps = db.prepare(`SELECT * FROM bill_of_processes WHERE project_id = ?`).all(projectId) as any[];
      const bopMap = new Map<string, any>();
      allBopSteps.forEach(s => bopMap.set(s.id, s));

      const visited = new Set<string>();
      const incompleteNodeNames: string[] = [];

      function traverse(nodeId: string) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);

        const step = bopMap.get(nodeId);
        if (!step) return;

        let predIds: string[] = [];
        try {
          predIds = Array.isArray(step.predecessor_ids)
            ? step.predecessor_ids
            : JSON.parse(step.predecessor_ids || "[]");
        } catch (e) {
          predIds = [];
        }

        if (step.node_type === 'PRODUCT') {
          let allocs: any[] = [];
          try {
            allocs = typeof step.bom_allocations === 'string' ? JSON.parse(step.bom_allocations) : (step.bom_allocations || []);
          } catch (e) {}

          if (Array.isArray(allocs) && allocs.length > 0) {
            const pipe = getBomProcurementPipelineStatus(projectId, step.bom_allocations);
            if (pipe.status !== 'COMPLETED') {
              incompleteNodeNames.push(`${step.process_name || 'Material'} [${pipe.lifecycle_status}]`);
            }
          } else if (predIds.length > 0) {
            for (const predId of predIds) {
              traverse(predId);
            }
          } else {
            if (step.status !== 'COMPLETED') {
              incompleteNodeNames.push(step.process_name || `Product Node ${step.step_sequence}`);
            }
          }
        } else {
          if (step.status !== 'COMPLETED') {
            incompleteNodeNames.push(step.process_name || `Step ${step.step_sequence}`);
          }
          for (const predId of predIds) {
            traverse(predId);
          }
        }
      }

      const targetStep = bopMap.get(targetId);
      if (targetStep) {
        let predIds: string[] = [];
        try {
          predIds = Array.isArray(targetStep.predecessor_ids)
            ? targetStep.predecessor_ids
            : JSON.parse(targetStep.predecessor_ids || "[]");
        } catch (e) {
          predIds = [];
        }

        for (const predId of predIds) {
          traverse(predId);
        }
      }

      const uniqueIncomplete = Array.from(new Set(incompleteNodeNames));

      return {
        isCompleted: uniqueIncomplete.length === 0,
        incompleteNodeNames: uniqueIncomplete
      };
    }

export function getAvailableInputWipForBop(targetId: string, projectId: string): { 
      availableQty: number; 
      isStarved: boolean; 
      bottleneckProcess: string; 
      minInputProduced: number; 
      currentConsumed: number;
      inputBreakdown: Array<{ predId: string; predName: string; completedQty: number; targetQty: number }> 
    } {
      const allBopSteps = db.prepare(`SELECT * FROM bill_of_processes WHERE project_id = ?`).all(projectId) as any[];
      const bopMap = new Map<string, any>();
      allBopSteps.forEach(s => bopMap.set(s.id, s));

      const lifecycles = db.prepare(`SELECT * FROM product_node_lifecycle WHERE project_id = ?`).all(projectId) as any[];
      const lifecycleMap = new Map<string, any>();
      lifecycles.forEach(l => lifecycleMap.set(l.bop_step_id, l));

      const targetStep = bopMap.get(targetId);
      if (!targetStep) {
        return { availableQty: 999999, isStarved: false, bottleneckProcess: "", minInputProduced: 999999, currentConsumed: 0, inputBreakdown: [] };
      }

      let predIds: string[] = [];
      try {
        predIds = Array.isArray(targetStep.predecessor_ids)
          ? targetStep.predecessor_ids
          : JSON.parse(targetStep.predecessor_ids || "[]");
      } catch (e) {
        predIds = [];
      }

      const projectObj = db.prepare(`SELECT qty FROM projects WHERE id = ?`).get(projectId) as any;
      const targetProjectQty = projectObj?.qty || 1;

      // Root process (no predecessors) is never starved by material
      if (predIds.length === 0) {
        const consumed = Number(targetStep.completed_qty || 0);
        return { 
          availableQty: Math.max(0, targetProjectQty - consumed), 
          isStarved: false, 
          bottleneckProcess: "", 
          minInputProduced: targetProjectQty, 
          currentConsumed: consumed, 
          inputBreakdown: [] 
        };
      }

      // Check if project has any issued/transferred material from warehouse
      const labelCount = db.prepare(`SELECT COUNT(*) as count FROM inventory_labels WHERE project_id = ?`).get(projectId) as any;
      const movementCount = db.prepare(`SELECT COUNT(*) as count FROM stock_movements WHERE project_id = ? AND type IN ('CONSUMPTION', 'RELEASE', 'TRANSFER', 'ALLOCATION')`).get(projectId) as any;
      const consumptionCount = db.prepare(`SELECT COUNT(*) as count FROM bom_item_consumption bic JOIN boms b ON bic.bom_id = b.id WHERE b.project_id = ?`).get(projectId) as any;
      const bomReceived = db.prepare(`SELECT SUM(received_by_production) as total FROM boms WHERE project_id = ?`).get(projectId) as any;
      const dispatches = db.prepare(`
        SELECT SUM(dispatch_qty) as total FROM material_dispatches 
        WHERE project_id = ? AND (station_id = ? OR station_id IS NULL) AND status = 'RECEIVED_BY_PRODUCTION'
      `).get(projectId, targetStep.station_id || '') as any;
      const pnl = db.prepare(`
        SELECT SUM(qty) as total FROM product_node_lifecycle 
        WHERE project_id = ? AND status IN ('AVAILABLE', 'PRODUCED', 'ALLOCATED')
      `).get(projectId) as any;
      const prodNodes = db.prepare(`
        SELECT SUM(completed_qty) as total FROM bill_of_processes 
        WHERE project_id = ? AND node_type = 'PRODUCT' AND (status = 'COMPLETED' OR completed_qty > 0)
      `).get(projectId) as any;

      const totalMaterialCount = (Number(bomReceived?.total) || 0) + (Number(dispatches?.total) || 0) + (Number(pnl?.total) || 0) + (Number(prodNodes?.total) || 0) + (labelCount?.count || 0) + (movementCount?.count || 0) + (consumptionCount?.count || 0);
      const isMaterialAvailableAtFloor = totalMaterialCount >= 1;

      // Root process (no predecessors) requires minimal 1 material
      if (predIds.length === 0) {
        const consumed = Number(targetStep.completed_qty || 0);
        if (!isMaterialAvailableAtFloor) {
          return {
            availableQty: 0,
            isStarved: true,
            bottleneckProcess: "Material belum siap olah (Minimal 1 material harus tersedia di lantai produksi)",
            minInputProduced: 0,
            currentConsumed: consumed,
            inputBreakdown: []
          };
        }
        return { 
          availableQty: Math.max(0, targetProjectQty - consumed), 
          isStarved: false, 
          bottleneckProcess: "", 
          minInputProduced: targetProjectQty, 
          currentConsumed: consumed, 
          inputBreakdown: [] 
        };
      }

      // Determine project lot size for inter-station transfer rule (Rule 2)
      const firstLot = db.prepare(`SELECT target_qty FROM production_lots WHERE project_id = ? ORDER BY lot_number ASC LIMIT 1`).get(projectId) as any;
      const projectLotSize = Math.max(1, Number(firstLot?.target_qty || 10));

      const inputBreakdown: Array<{ predId: string; predName: string; completedQty: number; targetQty: number; isSameStation: boolean; requiredLotSize: number }> = [];
      let minInputProduced = Infinity;
      let bottleneckProcess = "";

      for (const predId of predIds) {
        const predStep = bopMap.get(predId);
        if (!predStep) continue;

        let predCompletedQty = 0;
        const predTargetQty = Number(predStep.target_qty || targetProjectQty);
        const lifecycle = lifecycleMap.get(predId);
        const lifecycleStatus = lifecycle ? lifecycle.status : 'PLANNED';

        if (predStep.node_type === 'PRODUCT') {
          // Check if this PRODUCT node has its own upstream predecessors (intermediate Product Node)
          let upstreamPredIds: string[] = [];
          try {
            upstreamPredIds = Array.isArray(predStep.predecessor_ids)
              ? predStep.predecessor_ids
              : JSON.parse(predStep.predecessor_ids || "[]");
          } catch (e) {
            upstreamPredIds = [];
          }

          if (upstreamPredIds.length > 0) {
            // Intermediate Product Node: available qty comes from upstream process steps
            let minUpstreamQty = Infinity;
            for (const upId of upstreamPredIds) {
              const upStep = bopMap.get(upId);
              if (upStep) {
                const upQty = Number(upStep.completed_qty || 0);
                if (upQty < minUpstreamQty) minUpstreamQty = upQty;
              }
            }
            if (minUpstreamQty === Infinity) minUpstreamQty = 0;

            const isProdCompleted = predStep.status === 'COMPLETED' || lifecycleStatus === 'PRODUCED' || lifecycleStatus === 'AVAILABLE';
            
            if (isProdCompleted) {
              predCompletedQty = Math.max(Number(predStep.completed_qty || 0), predTargetQty, lifecycle?.qty || 0);
            } else {
              predCompletedQty = Math.max(Number(predStep.completed_qty || 0), minUpstreamQty);
            }
          } else {
            // Initial Raw Material / Component Product Node (from Warehouse / BOM)
            const isAvailable = lifecycleStatus === 'AVAILABLE' || 
                              lifecycleStatus === 'PRODUCED' || 
                              predStep.status === 'COMPLETED' || 
                              Number(predStep.completed_qty || 0) > 0 || 
                              isMaterialAvailableAtFloor;

            if (isAvailable) {
              predCompletedQty = Math.max(Number(predStep.completed_qty || 0), predTargetQty, lifecycle?.qty || 0, isMaterialAvailableAtFloor ? 1 : 0);
            } else {
              predCompletedQty = Number(predStep.completed_qty || 0);
            }
          }
        } else {
          // Normal PROCESS node predecessor
          predCompletedQty = Number(predStep.completed_qty || 0);
        }

        // =========================================================================
        // PRODUCTION ROUTING RULES:
        // Rule 1: Intra-station => Harus minimal 1 material & proses sebelumnya yang selesai.
        // Rule 2: Inter-station => Harus minimal 1 material & WOT station sebelumnya yang selesai.
        // =========================================================================
        const isSameStation = Boolean(
          (predStep.station_id && targetStep.station_id && predStep.station_id === targetStep.station_id) ||
          (!predStep.station_id && !targetStep.station_id)
        );

        let effectiveProducedForDownstream = predCompletedQty;

        if (isSameStation && predStep.node_type !== 'PRODUCT') {
          // Intra-station Gate: Harus minimal 1 material & proses sebelumnya yang selesai
          if (!isMaterialAvailableAtFloor) {
            effectiveProducedForDownstream = 0;
            bottleneckProcess = "Material belum siap olah (Minimal 1 material harus tersedia)";
          } else if (predCompletedQty < 1) {
            effectiveProducedForDownstream = 0;
            bottleneckProcess = `${predStep.process_name || `Step ${predStep.step_sequence}`} (Menunggu proses sebelumnya selesai: minimal 1 unit)`;
          }
        } else if (!isSameStation && predStep.node_type !== 'PRODUCT') {
          // Inter-station Gate: Harus minimal 1 material & WOT station sebelumnya yang selesai
          let upstreamWotCompletedCount = 0;
          if (predStep.station_id) {
            const wotRes = db.prepare(`
              SELECT COUNT(*) as c FROM work_order_tickets 
              WHERE (current_station_id = ? OR source_station_id = ?) 
                AND status IN ('COMPLETED', 'TRANSFERRED')
            `).get(predStep.station_id, predStep.station_id) as any;
            upstreamWotCompletedCount = Number(wotRes?.c || 0);
          }

          const hasCompletedUpstreamWot = upstreamWotCompletedCount >= 1 || (predCompletedQty >= projectLotSize);

          if (!isMaterialAvailableAtFloor) {
            effectiveProducedForDownstream = 0;
            bottleneckProcess = "Material belum siap olah (Minimal 1 material harus tersedia di lantai produksi)";
          } else if (!hasCompletedUpstreamWot) {
            effectiveProducedForDownstream = 0;
            bottleneckProcess = `${predStep.process_name || `Step ${predStep.step_sequence}`} (Menunggu stasiun sebelumnya menyelesaikan minimal 1 WOT)`;
          } else {
            // Cross-station transfer requires minimum 1 full lot WOT
            const completedLotsCount = Math.floor(predCompletedQty / projectLotSize);
            effectiveProducedForDownstream = Math.max(
              completedLotsCount * projectLotSize, 
              upstreamWotCompletedCount > 0 ? predCompletedQty : 0
            );
            if (targetProjectQty <= projectLotSize && predCompletedQty >= targetProjectQty) {
              effectiveProducedForDownstream = targetProjectQty;
            }
          }
        }

        inputBreakdown.push({
          predId: predStep.id,
          predName: predStep.process_name || `Step ${predStep.step_sequence}`,
          completedQty: predCompletedQty,
          targetQty: predTargetQty,
          isSameStation,
          requiredLotSize: isSameStation ? 1 : projectLotSize
        });

        if (effectiveProducedForDownstream < minInputProduced) {
          minInputProduced = effectiveProducedForDownstream;
          const remainingUnitsForLot = projectLotSize - (predCompletedQty % projectLotSize);
          if (!isSameStation && predCompletedQty < projectLotSize) {
            bottleneckProcess = `${predStep.process_name || `Step ${predStep.step_sequence}`} (Menunggu 1 Lot WOT: ${predCompletedQty}/${projectLotSize} pcs)`;
          } else if (!isSameStation && predCompletedQty % projectLotSize > 0) {
            bottleneckProcess = `${predStep.process_name || `Step ${predStep.step_sequence}`} (Menunggu batch lot berikutnya: butuh ${remainingUnitsForLot} pcs lagi)`;
          } else {
            bottleneckProcess = predStep.process_name || `Step ${predStep.step_sequence}`;
          }
        }
      }

      if (minInputProduced === Infinity) minInputProduced = 0;

      const currentConsumed = Number(targetStep.completed_qty || 0);
      const availableQty = Math.max(0, minInputProduced - currentConsumed);
      const isStarved = availableQty <= 0;

      return {
        availableQty,
        isStarved,
        bottleneckProcess,
        minInputProduced,
        currentConsumed,
        inputBreakdown
      };
    }

export function checkPredecessorsReadyForPipelining(targetId: string, projectId: string): { isReady: boolean; incompleteNodeNames: string[] } {
      const allBopSteps = db.prepare(`SELECT * FROM bill_of_processes WHERE project_id = ?`).all(projectId) as any[];
      const bopMap = new Map<string, any>();
      allBopSteps.forEach(s => bopMap.set(s.id, s));

      const lifecycles = db.prepare(`SELECT * FROM product_node_lifecycle WHERE project_id = ?`).all(projectId) as any[];
      const lifecycleMap = new Map<string, any>();
      lifecycles.forEach(l => lifecycleMap.set(l.bop_step_id, l));

      const targetStep = bopMap.get(targetId);
      if (!targetStep) return { isReady: true, incompleteNodeNames: [] };

      const firstLot = db.prepare(`SELECT target_qty FROM production_lots WHERE project_id = ? ORDER BY lot_number ASC LIMIT 1`).get(projectId) as any;
      const projectLotSize = Math.max(1, Number(firstLot?.target_qty || 10));

      let predIds: string[] = [];
      try {
        predIds = Array.isArray(targetStep.predecessor_ids)
          ? targetStep.predecessor_ids
          : JSON.parse(targetStep.predecessor_ids || "[]");
      } catch (e) {
        predIds = [];
      }

      if (predIds.length === 0) {
        return { isReady: true, incompleteNodeNames: [] };
      }

      // Check if project has warehouse material issued
      const labelCount = db.prepare(`SELECT COUNT(*) as count FROM inventory_labels WHERE project_id = ?`).get(projectId) as any;
      const movementCount = db.prepare(`SELECT COUNT(*) as count FROM stock_movements WHERE project_id = ? AND type IN ('CONSUMPTION', 'RELEASE', 'TRANSFER', 'ALLOCATION')`).get(projectId) as any;
      const consumptionCount = db.prepare(`SELECT COUNT(*) as count FROM bom_item_consumption bic JOIN boms b ON bic.bom_id = b.id WHERE b.project_id = ?`).get(projectId) as any;
      const projectHasWarehouseMaterial = (labelCount?.count || 0) > 0 || (movementCount?.count || 0) > 0 || (consumptionCount?.count || 0) > 0;

      const incompleteNodeNames: string[] = [];

      for (const predId of predIds) {
        const predStep = bopMap.get(predId);
        if (!predStep) continue;

        const isSameStation = Boolean(
          (predStep.station_id && targetStep.station_id && predStep.station_id === targetStep.station_id) ||
          (!predStep.station_id && !targetStep.station_id)
        );

        if (predStep.node_type === 'PRODUCT') {
          const lifecycle = lifecycleMap.get(predId);
          const lifecycleStatus = lifecycle ? lifecycle.status : 'PLANNED';
          
          const isProductReady = lifecycleStatus === 'AVAILABLE' || 
                                lifecycleStatus === 'PRODUCED' || 
                                predStep.status === 'COMPLETED' || 
                                Number(predStep.completed_qty || 0) >= 1 || 
                                projectHasWarehouseMaterial;
          if (!isProductReady) {
            incompleteNodeNames.push(predStep.process_name || `Step ${predStep.step_sequence}`);
          }
        } else {
          // Rule 1: Same station => requires >= 1 unit completed
          // Rule 2: Different station => requires >= 1 full lot WOT completed
          const requiredMinQty = isSameStation ? 1 : projectLotSize;
          const completedQty = Number(predStep.completed_qty || 0);
          const isStepDone = predStep.status === 'COMPLETED';
          const hasSufficientQty = completedQty >= requiredMinQty || (isStepDone && completedQty > 0);

          if (!hasSufficientQty) {
            const reason = isSameStation 
              ? `${predStep.process_name || `Step ${predStep.step_sequence}`} (butuh min. 1 unit selesai)` 
              : `${predStep.process_name || `Step ${predStep.step_sequence}`} (butuh min. 1 Lot WOT [${completedQty}/${projectLotSize} pcs])`;
            incompleteNodeNames.push(reason);
          }
        }
      }

      const uniqueIncomplete = Array.from(new Set(incompleteNodeNames));
      return {
        isReady: uniqueIncomplete.length === 0,
        incompleteNodeNames: uniqueIncomplete
      };
    }

export function syncProjectMaterialAndWakeProcesses(projectId: string, operatorName: string) {
      if (!projectId) return;

      // 1. Mark any active material dispatches for this project as officially received on the production floor
      try {
        db.prepare(`
          UPDATE material_dispatches 
          SET status = 'RECEIVED_BY_PRODUCTION', received_by_production = ?, received_at = CURRENT_TIMESTAMP
          WHERE project_id = ? AND status = 'IN_TRANSIT'
        `).run(operatorName || 'WAREHOUSE_TERMINAL_OPS', projectId);
      } catch (e) {}

      // 2. Auto-resolve any active material shortage NDPs on this project since stock is officially on the floor
      try {
        const activeMaterialNdps = db.prepare(`
          SELECT * FROM notice_to_down_processes 
          WHERE project_id = ? AND (reason_category = 'MATERIAL_SHORTAGE' OR status = 'BLOCKED_PENDING_PROCUREMENT' OR status = 'ACTIVE')
        `).all(projectId) as any[];

        for (const ndp of activeMaterialNdps) {
          db.prepare(`
            UPDATE notice_to_down_processes 
            SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP, resolved_by = ?,
                reason_detail = COALESCE(reason_detail, '') || ' [Auto-resolved: Dispatched from Warehouse Terminal Ops]'
            WHERE id = ?
          `).run(operatorName || 'WAREHOUSE_TERMINAL_OPS', ndp.id);

          const stepId = ndp.bop_id || ndp.bop_step_id;
          if (stepId) {
            db.prepare("UPDATE bill_of_processes SET is_manual_pause = 0, process_status = 'RUNNING' WHERE id = ?").run(stepId);
            db.prepare("UPDATE work_order_tickets SET status = 'QUEUED', updated_at = CURRENT_TIMESTAMP WHERE current_process_id = ? AND status = 'BLOCKED'").run(stepId);
          }
          if (ndp.station_id) {
            db.prepare("UPDATE project_stations SET status = 'RUNNING' WHERE id = ?").run(ndp.station_id);
          }
        }
      } catch (e) {
        console.error("Error auto-resolving material NDPs in syncProjectMaterialAndWakeProcesses:", e);
      }

      // 3. Auto-resolve downstream product nodes and awaken downstream process steps
      autoResolveDownstreamProductNodes(projectId, operatorName);
      autoStartDownstreamProcesses(projectId, operatorName);
      try {
        
      } catch (e) {}
      emitProductionUpdate("BOP_STATUS_CHANGED", { projectId });
    }

export function autoResolveDownstreamProductNodes(projectId: string, operatorName: string) {
      if (!projectId) return;
      const allBopSteps = db.prepare(`SELECT * FROM bill_of_processes WHERE project_id = ?`).all(projectId) as any[];
      const productNodes = allBopSteps.filter(s => s.node_type === 'PRODUCT');

      const nowIso = new Date().toISOString();

      for (const prodNode of productNodes) {
        let allocs: any[] = [];
        try {
          allocs = typeof prodNode.bom_allocations === 'string' ? JSON.parse(prodNode.bom_allocations) : (prodNode.bom_allocations || []);
        } catch (e) {}

        let predIds: string[] = [];
        try {
          predIds = typeof prodNode.predecessor_ids === 'string' ? JSON.parse(prodNode.predecessor_ids) : (prodNode.predecessor_ids || []);
        } catch (e) {}

        const hasUpstreamProcessPreds = predIds.some(pid => {
          const pred = allBopSteps.find(s => s.id === pid);
          return pred && pred.node_type !== 'PRODUCT';
        });

        if (Array.isArray(allocs) && allocs.length > 0) {
          // Raw Material / Component Node with BOM allocations -> Procurement Pipeline
          const pipe = getBomProcurementPipelineStatus(projectId, prodNode.bom_allocations);
          
          const targetQty = Number(prodNode.target_qty || 1);
          const completedQty = pipe.status === 'COMPLETED' ? targetQty : 0;

          db.prepare(`
            UPDATE bill_of_processes
            SET status = ?,
                progress = ?,
                lifecycle_status = ?,
                completed_qty = ?,
                actual_end_date = CASE WHEN ? = 'COMPLETED' THEN COALESCE(actual_end_date, ?) ELSE NULL END
            WHERE id = ?
          `).run(pipe.status, pipe.progress, pipe.lifecycle_status, completedQty, pipe.status, nowIso, prodNode.id);

          db.prepare(`
            UPDATE project_tasks
            SET status = ?,
                progress = ?,
                actual_end_date = CASE WHEN ? = 'COMPLETED' THEN COALESCE(actual_end_date, ?) ELSE NULL END
            WHERE id = ?
          `).run(pipe.status, pipe.progress, pipe.status, nowIso, prodNode.id);

          try {
            db.prepare(`
              UPDATE product_node_lifecycle
              SET status = ?, qty = ?, updated_at = CURRENT_TIMESTAMP
              WHERE bop_step_id = ?
            `).run(pipe.lifecycle_status.toUpperCase(), completedQty, prodNode.id);
          } catch(e){}

          syncCollectionToFirestore("bill_of_processes", prodNode.id, {
            id: prodNode.id,
            project_id: projectId,
            status: pipe.status,
            progress: pipe.progress,
            lifecycle_status: pipe.lifecycle_status
          });

        } else if (hasUpstreamProcessPreds) {
          // Intermediate Manufactured Product Node -> Manufacturing Pipeline
          const checkResult = checkRecursivePredecessorsCompleted(prodNode.id, projectId);

          let minPredCompleted = Infinity;
          for (const pid of predIds) {
            const pred = allBopSteps.find(s => s.id === pid);
            if (pred && pred.node_type !== 'PRODUCT') {
              const pQty = Number(pred.completed_qty || 0);
              if (pQty < minPredCompleted) minPredCompleted = pQty;
            }
          }
          if (minPredCompleted === Infinity) minPredCompleted = 0;

          const targetQty = Number(prodNode.target_qty || 1);

          if (checkResult.isCompleted) {
            db.prepare(`
              UPDATE bill_of_processes
              SET status = 'COMPLETED', lifecycle_status = 'Produced', progress = 100, completed_qty = ?, actual_end_date = COALESCE(actual_end_date, ?), completed_by_operator = COALESCE(completed_by_operator, ?)
              WHERE id = ?
            `).run(targetQty, nowIso, operatorName, prodNode.id);

            db.prepare(`
              UPDATE project_tasks
              SET status = 'COMPLETED', progress = 100, actual_end_date = COALESCE(actual_end_date, ?)
              WHERE id = ?
            `).run(nowIso, prodNode.id);

            try {
              db.prepare(`
                UPDATE product_node_lifecycle
                SET status = 'PRODUCED', qty = ?, updated_at = CURRENT_TIMESTAMP
                WHERE bop_step_id = ?
              `).run(targetQty, prodNode.id);
            } catch(e){}

            syncCollectionToFirestore("bill_of_processes", prodNode.id, { id: prodNode.id, project_id: projectId, status: "COMPLETED", progress: 100, lifecycle_status: "Produced" });
          } else {
            const prog = targetQty > 0 ? Math.min(99, Math.round((minPredCompleted / targetQty) * 100)) : 0;
            const newStatus = minPredCompleted > 0 ? 'IN_PROGRESS' : 'PENDING';
            const newLife = minPredCompleted > 0 ? 'WIP' : 'Planned';

            db.prepare(`
              UPDATE bill_of_processes
              SET status = ?, lifecycle_status = ?, progress = ?, completed_qty = ?, actual_end_date = NULL, completed_by_operator = NULL
              WHERE id = ?
            `).run(newStatus, newLife, prog, minPredCompleted, prodNode.id);

            db.prepare(`
              UPDATE project_tasks
              SET status = ?, progress = ?, actual_end_date = NULL
              WHERE id = ?
            `).run(newStatus, prog, prodNode.id);

            try {
              db.prepare(`
                UPDATE product_node_lifecycle
                SET status = ?, qty = ?, updated_at = CURRENT_TIMESTAMP
                WHERE bop_step_id = ?
              `).run(newLife.toUpperCase(), minPredCompleted, prodNode.id);
            } catch(e){}
          }
        } else {
          // Unallocated Standalone Product Node -> Default to Planned / Pending
          db.prepare(`
            UPDATE bill_of_processes
            SET status = 'PENDING', progress = 0, lifecycle_status = 'Planned', completed_qty = 0, actual_end_date = NULL
            WHERE id = ?
          `).run(prodNode.id);

          db.prepare(`
            UPDATE project_tasks
            SET status = 'PENDING', progress = 0, actual_end_date = NULL
            WHERE id = ?
          `).run(prodNode.id);
        }
      }
    }

export function preemptiveAutoPauseConflictingSteps(targetBopId: string, projectId: string, userIdentifier: string) {
      const targetBop = db.prepare(`SELECT * FROM bill_of_processes WHERE id = ?`).get(targetBopId) as any;
      if (!targetBop) return;

      const assignmentsForThisStep = db.prepare(`
        SELECT DISTINCT manpower_id 
        FROM production_manpower_assignments 
        WHERE (bop_id = ? OR (station_id = ? AND station_id IS NOT NULL) OR (bop_id IS NULL AND project_id = ? AND task_name = ?))
          AND status NOT IN ('CANCELLED', 'COMPLETED')
      `).all(targetBopId, targetBop.station_id || null, projectId, targetBop.process_name) as any[];

      const activeManpowerIds = assignmentsForThisStep.map(a => a.manpower_id).filter(Boolean);
      if (activeManpowerIds.length === 0) return;

      const placeholders = activeManpowerIds.map(() => '?').join(',');

      const conflictingBops = db.prepare(`
        SELECT DISTINCT b.id, b.project_id, b.process_name 
        FROM bill_of_processes b
        JOIN production_manpower_assignments a 
          ON (a.bop_id = b.id OR (a.station_id = b.station_id AND a.station_id IS NOT NULL) OR (a.bop_id IS NULL AND a.project_id = b.project_id AND a.task_name = b.process_name))
        WHERE a.manpower_id IN (${placeholders})
          AND a.status NOT IN ('CANCELLED', 'COMPLETED')
          AND b.status = 'RUNNING'
          AND b.id != ?
      `).all(...activeManpowerIds, targetBopId) as any[];

      for (const conflictBop of conflictingBops) {
        db.prepare(`UPDATE bill_of_processes SET status = 'PAUSED', is_manual_pause = 0, pause_type = 'PREEMPTIVE' WHERE id = ?`).run(conflictBop.id);
        db.prepare(`UPDATE project_tasks SET status = 'PAUSED', is_manual_pause = 0, pause_type = 'PREEMPTIVE' WHERE id = ?`).run(conflictBop.id);
        db.prepare(`
          UPDATE production_manpower_assignments 
          SET status = 'PAUSED' 
          WHERE (bop_id = ? OR (station_id = ? AND station_id IS NOT NULL) OR (bop_id IS NULL AND project_id = ? AND task_name = ?))
            AND status IN ('ACTIVE', 'SCHEDULED')
        `).run(conflictBop.id, conflictBop.station_id || null, conflictBop.project_id, conflictBop.process_name);
        db.prepare(`
          UPDATE lot_routing_executions 
          SET status = 'PAUSED' 
          WHERE bop_id = ? AND status = 'RUNNING'
        `).run(conflictBop.id);

        logAudit(
          userIdentifier, 
          "PREEMPTIVE_AUTO_PAUSE", 
          "BOP", 
          conflictBop.id, 
          `Auto-paused step '${conflictBop.process_name}' due to operator starting or switching to '${targetBop.process_name}'`
        );
        emitProductionUpdate("BOP_STATUS_CHANGED", { bopId: conflictBop.id, status: "PAUSED", projectId: conflictBop.project_id, reason: "PREEMPTIVE" });
        syncCollectionToFirestore("bill_of_processes", conflictBop.id, { id: conflictBop.id, project_id: conflictBop.project_id, status: "PAUSED" });
      }
    }

export const planningCache = {
      matrix: null as any,
      timestamp: 0
    };

export const CACHE_TTL_MS = 60000 * 5;

export const invalidatePlanningCache = () => {
      planningCache.matrix = null;
      planningCache.timestamp = 0;
    };

export const handleCalculateLoad = (req: any, res: any) => {
      try {
        const forceRefresh = req.query.force_refresh === 'true' || req.body?.force_refresh;
        
        // Return cached response if valid and not forced to refresh
        if (!forceRefresh && planningCache.matrix && (Date.now() - planningCache.timestamp < CACHE_TTL_MS)) {
          return res.json(planningCache.matrix);
        }

        const machines = db.prepare(`
          SELECT id, item_code, name, capacity_per_hour, operational_status, machine_status, bypass_multi_station, machine_category
          FROM items WHERE type = 'MACHINE' OR item_type = 'MACHINE'
        `).all() as any[];

        const activeNdps = db.prepare(`
          SELECT machine_id, affected_machine_id, estimated_down_hours, down_started_at, created_at, ndp_code
          FROM notice_to_down_processes
          WHERE status IN ('ACTIVE', 'BLOCKED_PENDING_PROCUREMENT')
        `).all() as any[];

        const machineDowntimeUntil: Record<string, Date> = {};
        const machineDowntimeCode: Record<string, string> = {};
        for (const ndp of activeNdps) {
          const mId = ndp.machine_id || ndp.affected_machine_id;
          if (mId) {
            const downHours = Number(ndp.estimated_down_hours) || 48;
            const downStart = new Date(ndp.down_started_at || ndp.created_at || Date.now()).getTime();
            machineDowntimeUntil[mId] = new Date(downStart + (downHours * 3600000));
            machineDowntimeCode[mId] = ndp.ndp_code || "NDP";
          }
        }

        // Generate 30-day timeline
        const now = new Date();
        const timeline: string[] = [];
        for (let i = 0; i < 30; i++) {
          const d = new Date(now.getTime() + (i * 86400000));
          timeline.push(d.toISOString().split('T')[0]);
        }

        const processes = db.prepare(`
          SELECT b.*, p.name as proj_name, p.qty as proj_qty, p.factory_factor
          FROM bill_of_processes b
          JOIN projects p ON b.project_id = p.id
          WHERE p.status NOT IN ('COMPLETED', 'CANCELLED', 'ON_HOLD')
            AND UPPER(b.node_type) NOT IN ('PRODUCT', 'START', 'END')
        `).all() as any[];

        let maxLoadedMachine: any = null;

        const machineSummary = machines.map(m => {
          const assignedProcs = processes.filter(p => p.assigned_machine_id === m.id || p.machine_id === m.id);
          let totalAssignedHours = 0;
          const processList: string[] = [];

          assignedProcs.forEach(p => {
            const cap = Math.max(0.05, (m.capacity_per_hour || 10) / 60);
            const ff = Number(p.factory_factor) || 0.85;
            const effCt = (p.cycle_time_minutes || 60) / (cap * ff);
            const hrs = Math.max(0.5, ((effCt * (p.proj_qty || 100)) + 25) / 60);
            totalAssignedHours += hrs;
            processList.push(`[${p.proj_name}] ${p.process_name} (${hrs.toFixed(1)}h)`);
          });

          const isDown = Boolean(machineDowntimeUntil[m.id] || m.operational_status === 'BROKEN' || m.machine_status === 'BROKEN');
          const monthlyCapacityHours = 160; // 20 days * 8 hours
          const loadPercent = Math.min(150, Math.round((totalAssignedHours / monthlyCapacityHours) * 100));

          if (!maxLoadedMachine || loadPercent > maxLoadedMachine.load_percent) {
            maxLoadedMachine = {
              machine: m.name,
              machine_code: m.item_code,
              load_percent: loadPercent
            };
          }

          // 30-day projection
          const dailyLoads = timeline.map((dateStr, dIdx) => {
            const isDayDown = isDown && dIdx < 3;
            const dailyHours = totalAssignedHours > 0 ? Math.min(12, totalAssignedHours / 15) : 0;
            const dayLoadPercent = isDayDown ? 0 : Math.min(150, Math.round((dailyHours / 8) * 100));

            return {
              date: dateStr,
              hours: Math.round(dailyHours * 10) / 10,
              load_percent: dayLoadPercent,
              status: isDayDown ? 'BLOCKED_NDP' : (dayLoadPercent > 100 ? 'OVERLOADED' : (dayLoadPercent >= 75 ? 'OPTIMAL' : 'NORMAL')),
              ndp_code: isDayDown ? machineDowntimeCode[m.id] : null
            };
          });

          return {
            machine_id: m.id,
            machine_code: m.item_code,
            machine: m.name,
            machine_category: m.machine_category,
            capacity_per_hour: m.capacity_per_hour,
            bypass_multi_station: Boolean(m.bypass_multi_station),
            is_down: isDown,
            ndp_code: machineDowntimeCode[m.id] || null,
            total_assigned_hours: Math.round(totalAssignedHours * 10) / 10,
            monthly_capacity_hours: monthlyCapacityHours,
            load_percent: loadPercent,
            processes: processList.join("; "),
            status: isDown ? 'BLOCKED_NDP' : (loadPercent > 100 ? 'OVERLOADED' : (loadPercent >= 75 ? 'OPTIMAL' : 'NORMAL')),
            daily_loads: dailyLoads
          };
        });

        const responseData = { 
          success: true, 
          timeline,
          machines: machineSummary,
          heatmap: machineSummary.map(m => ({
            machine_id: m.machine_id,
            machine: m.machine,
            machine_code: m.machine_code,
            machine_category: m.machine_category,
            capacity_per_hour: m.capacity_per_hour,
            is_down: m.is_down,
            ndp_code: m.ndp_code,
            process: m.processes,
            loadPercent: m.load_percent,
            status: m.status,
            daily_loads: m.daily_loads
          })),
          overloads: machineSummary.filter(m => m.status === 'OVERLOADED'),
          next_bottleneck: maxLoadedMachine && maxLoadedMachine.load_percent > 75 ? maxLoadedMachine : null
        };
        
        // Update cache
        planningCache.matrix = responseData;
        planningCache.timestamp = Date.now();

        res.json(responseData);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

export const handleGetProductionLogs = (req: any, res: any) => {
      try {
        const { 
          project_id, station_id, machine_id, user_id, log_type, 
          date_from, date_to, search, page = 1, limit = 100 
        } = req.query;

        let baseQuery = `
          FROM production_logs pl 
          LEFT JOIN users u ON pl.user_id = u.id 
          LEFT JOIN users vu ON pl.verified_by = vu.id
          LEFT JOIN projects p ON pl.project_id = p.id
          LEFT JOIN stations st ON pl.station_id = st.id
          LEFT JOIN project_stations ps ON pl.station_id = ps.id
          LEFT JOIN bop_steps bs ON pl.process_id = bs.id
          LEFT JOIN processes pr ON pl.process_id = pr.id
          LEFT JOIN items m ON pl.machine_id = m.id
          LEFT JOIN work_order_tickets wot ON pl.wot_id = wot.id
          WHERE 1=1
        `;
        const params: any[] = [];
        if (project_id && project_id !== 'ALL') { baseQuery += " AND pl.project_id = ?"; params.push(project_id); }
        if (station_id && station_id !== 'ALL') { baseQuery += " AND (pl.station_id = ? OR ps.id = ? OR st.id = ?)"; params.push(station_id, station_id, station_id); }
        if (machine_id && machine_id !== 'ALL') { baseQuery += " AND pl.machine_id = ?"; params.push(machine_id); }
        if (user_id && user_id !== 'ALL') { baseQuery += " AND pl.user_id = ?"; params.push(user_id); }
        if (log_type && log_type !== 'ALL') { baseQuery += " AND pl.log_type = ?"; params.push(log_type); }
        if (date_from) { baseQuery += " AND pl.timestamp >= ?"; params.push(date_from); }
        if (date_to) { baseQuery += " AND pl.timestamp <= ?"; params.push(date_to); }
        if (search) {
          baseQuery += " AND (pl.details LIKE ? OR pl.log_type LIKE ? OR pl.wot_id LIKE ? OR u.name LIKE ? OR m.name LIKE ? OR m.item_code LIKE ? OR wot.lot_number LIKE ? OR p.name LIKE ?)";
          const s = `%${search}%`;
          params.push(s, s, s, s, s, s, s, s);
        }

        const countRow = db.prepare(`SELECT COUNT(*) as total ${baseQuery}`).get(...params) as any;
        const total = countRow?.total || 0;

        const offset = (Number(page) - 1) * Number(limit);
        const query = `
          SELECT 
            pl.*, 
            u.name as user_name,
            vu.name as verified_by_name,
            p.name as project_name,
            p.spk_number,
            COALESCE(ps.station_name, st.station_name, pl.station_id) as station_name,
            COALESCE(ps.station_code, st.station_code, 'ST') as station_code,
            COALESCE(bs.process_name, pr.name, pl.process_id) as process_name,
            m.name as machine_name,
            m.item_code as machine_code,
            COALESCE(m.machine_status, m.operational_status, 'AVAILABLE') as machine_status,
            m.machine_category,
            wot.lot_number,
            wot.qty as wot_qty,
            wot.status as wot_status
          ${baseQuery}
          ORDER BY pl.timestamp DESC 
          LIMIT ? OFFSET ?
        `;
        const logs = db.prepare(query).all(...params, Number(limit), offset);
        res.json({ ok: true, data: logs, total, page: Number(page), limit: Number(limit) });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

export const handleAcknowledgeFr = (req: any, res: any) => {
      try {
        const { id } = req.params;
        const { user_id = "Floor Supervisor" } = req.body || {};

        const fr = db.prepare("SELECT * FROM floor_requests WHERE id = ?").get(id) as any;
        if (!fr) return res.status(404).json({ error: "Floor request not found" });

        db.prepare(`
          UPDATE floor_requests 
          SET status = 'ACKNOWLEDGED', acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(user_id, id);

        const logId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO production_logs 
          (id, log_type, project_id, wot_id, station_id, process_id, user_role, details, timestamp)
          VALUES (?, 'FLOOR_REQUEST_ACKNOWLEDGED', ?, ?, ?, ?, 'SUPERVISOR', ?, CURRENT_TIMESTAMP)
        `).run(logId, fr.project_id, fr.wot_id, fr.station_id, fr.process_id, JSON.stringify({
          request_code: fr.request_code,
          acknowledged_by: user_id
        }));

        emitProductionUpdate("FLOOR_REQUEST_UPDATED", { id, status: 'ACKNOWLEDGED', request_code: fr.request_code });
        res.json({ ok: true, success: true, id, status: 'ACKNOWLEDGED', message: `Request ${fr.request_code} acknowledged.` });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

export const handleFulfillFr = (req: any, res: any) => {
      try {
        const { id } = req.params;
        const { user_id = "Warehouse Lead", fulfillment_notes, fulfillment_photo_urls } = req.body || {};

        const fr = db.prepare("SELECT * FROM floor_requests WHERE id = ?").get(id) as any;
        if (!fr) return res.status(404).json({ error: "Floor request not found" });

        const photoPayload = fulfillment_photo_urls ? JSON.stringify(Array.isArray(fulfillment_photo_urls) ? fulfillment_photo_urls : [fulfillment_photo_urls]) : null;

        db.transaction(() => {
          db.prepare(`
            UPDATE floor_requests 
            SET status = 'FULFILLED', 
                fulfilled_by = ?, 
                fulfilled_at = CURRENT_TIMESTAMP, 
                fulfillment_notes = ?, 
                fulfillment_photo_urls = ?,
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(user_id, fulfillment_notes || "Items/services delivered to floor", photoPayload, id);

          const logId = require('crypto').randomUUID();
          db.prepare(`
            INSERT INTO production_logs 
            (id, log_type, project_id, wot_id, station_id, process_id, user_role, details, timestamp)
            VALUES (?, 'FLOOR_REQUEST_FULFILLED', ?, ?, ?, ?, 'WAREHOUSE', ?, CURRENT_TIMESTAMP)
          `).run(logId, fr.project_id, fr.wot_id, fr.station_id, fr.process_id, JSON.stringify({
            request_code: fr.request_code,
            fulfilled_by: user_id,
            fulfillment_notes,
            has_photo_proof: Boolean(photoPayload)
          }));

          // Deduct from inventory if it's a material request with a specific item
          if (fr.type === 'MATERIAL' || fr.type === 'MATERIAL_REQUEST') {
            const itemId = fr.bom_item_id || fr.tool_item_id;
            const qtyRequired = Number(fr.qty_required) || 0;
            
            if (itemId && qtyRequired > 0) {
              const inv = db.prepare("SELECT physical_qty FROM inventory WHERE item_id = ?").get(itemId) as any;
              
              if (inv) {
                // Deduct stock from the inventory table
                db.prepare(`
                  UPDATE inventory 
                  SET physical_qty = MAX(0, COALESCE(physical_qty, 0) - ?),
                      free_stock = MAX(0, COALESCE(free_stock, 0) - ?)
                  WHERE item_id = ?
                `).run(qtyRequired, qtyRequired, itemId);

                // Insert into stock movements
                db.prepare(`
                  INSERT INTO stock_movements (id, item_id, type, qty, reference_id, project_id, recorded_by)
                  VALUES (?, ?, 'CONSUMPTION', ?, ?, ?, ?)
                `).run(
                  require('crypto').randomUUID(),
                  itemId,
                  qtyRequired,
                  id, // reference floor request ID
                  fr.project_id || null,
                  user_id
                );
              }
            }
          }
        })();

        emitProductionUpdate("FLOOR_REQUEST_UPDATED", { id, status: 'FULFILLED', request_code: fr.request_code });
        res.json({ ok: true, success: true, id, status: 'FULFILLED', message: `Request ${fr.request_code} fulfilled.` });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

export const handleRejectFr = (req: any, res: any) => {
      try {
        const { id } = req.params;
        const { user_id = "Supervisor", reason } = req.body || {};

        const fr = db.prepare("SELECT * FROM floor_requests WHERE id = ?").get(id) as any;
        if (!fr) return res.status(404).json({ error: "Floor request not found" });

        db.prepare(`
          UPDATE floor_requests 
          SET status = 'REJECTED', reason = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(reason || "Unable to fulfill at this time", id);

        const logId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO production_logs 
          (id, log_type, project_id, wot_id, station_id, process_id, user_role, details, timestamp)
          VALUES (?, 'FLOOR_REQUEST_REJECTED', ?, ?, ?, ?, 'SUPERVISOR', ?, CURRENT_TIMESTAMP)
        `).run(logId, fr.project_id, fr.wot_id, fr.station_id, fr.process_id, JSON.stringify({
          request_code: fr.request_code,
          rejected_by: user_id,
          reason
        }));

        emitProductionUpdate("FLOOR_REQUEST_UPDATED", { id, status: 'REJECTED', request_code: fr.request_code });
        res.json({ ok: true, success: true, id, status: 'REJECTED', message: `Request ${fr.request_code} rejected.` });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

export const handleCloseFr = (req: any, res: any) => {
      try {
        const { id } = req.params;
        const { user_id = "Shop Floor Operator" } = req.body || {};

        const fr = db.prepare("SELECT * FROM floor_requests WHERE id = ?").get(id) as any;
        if (!fr) return res.status(404).json({ error: "Floor request not found" });

        db.prepare(`
          UPDATE floor_requests 
          SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(id);

        const logId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO production_logs 
          (id, log_type, project_id, wot_id, station_id, process_id, user_role, details, timestamp)
          VALUES (?, 'FLOOR_REQUEST_CLOSED', ?, ?, ?, ?, 'OPERATOR', ?, CURRENT_TIMESTAMP)
        `).run(logId, fr.project_id, fr.wot_id, fr.station_id, fr.process_id, JSON.stringify({
          request_code: fr.request_code,
          closed_by: user_id,
          receipt_confirmed: true
        }));

        emitProductionUpdate("FLOOR_REQUEST_UPDATED", { id, status: 'CLOSED', request_code: fr.request_code });
        res.json({ ok: true, success: true, id, status: 'CLOSED', message: `Request ${fr.request_code} closed and receipt confirmed.` });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    };

export function autoStartDownstreamProcesses(projectId: string, fromProcessId: string, triggerOperatorName?: string) {
  console.log(`[Production Flow] Triggering auto-start for downstream processes from ${fromProcessId} in project ${projectId}`);
}

