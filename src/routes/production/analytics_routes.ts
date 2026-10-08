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

export const analyticsRouter = Router();

analyticsRouter.get("/api/production/hub/:id/summary", (req, res) => {
      try {
        const { id } = req.params;
        
        // 1. Fetch Project & SPK
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
        if (!project) return res.status(404).json({ error: "Project not found" });
        let spk = null;
        if (project.spk_id) {
          spk = db.prepare("SELECT * FROM manufacturing_spks WHERE id = ?").get(project.spk_id);
        }

        // 2. Fetch BOP
        const bopList = db.prepare("SELECT * FROM bill_of_processes WHERE project_id = ? ORDER BY step_sequence ASC").all(id) as any[];
        const formattedBop = bopList.map((item: any) => ({
          ...item,
          predecessor_ids: JSON.parse(item.predecessor_ids || "[]")
        }));

        // 3. Fetch NDP
        const activeNdps = db.prepare("SELECT * FROM notice_to_down_processes WHERE project_id = ? AND status = 'ACTIVE'").all(id);

        // 4. Fetch Operator Allocations
        const assignments = db.prepare("SELECT * FROM production_manpower_assignments WHERE project_id = ?").all(id);

        // 5. Fetch Manpower Catalog
        const manpowerList = db.prepare("SELECT * FROM production_manpower WHERE status = 'ON_DUTY'").all();

        // 6. Fetch Items Catalog
        const items = db.prepare("SELECT * FROM items").all();

        // 7. Fetch Lots
        const lots = db.prepare("SELECT * FROM production_lots WHERE project_id = ? ORDER BY lot_number ASC").all(id) as any[];
        const executions = db.prepare(`
          SELECT le.*, bop.process_name 
          FROM lot_routing_executions le
          JOIN production_lots l ON le.lot_id = l.id
          JOIN bill_of_processes bop ON le.bop_id = bop.id
          WHERE l.project_id = ?
        `).all(id) as any[];
        
        const lotsWithExecs = lots.map((l: any) => ({
          ...l,
          executions: executions.filter((e: any) => e.lot_id === l.id)
        }));

        res.json({
          project,
          spk,
          bopSteps: formattedBop,
          activeNdps,
          manpowerAssignments: assignments,
          manpowerList,
          itemsCatalog: items,
          lots: lotsWithExecs
        });
      } catch (err) {
        console.error("Error in production hub summary:", err);
        res.status(500).json({ error: err.message });
      }
    });

analyticsRouter.get("/api/production/wip-summary", (req, res) => {
      try {
        const workCenters = db.prepare(`
          SELECT wc.*, 
            (
              SELECT COUNT(*) 
              FROM work_orders wo 
              WHERE wo.current_work_center_id = wc.id 
                AND wo.status IN ('RELEASED', 'IN_PROGRESS')
            ) as active_wip
          FROM work_centers wc
          ORDER BY wc.name ASC
        `).all() as any[];

        const activeWipRow = db.prepare(`
          SELECT COUNT(*) as total_active_wip 
          FROM work_orders 
          WHERE status IN ('RELEASED', 'IN_PROGRESS')
        `).get() as { total_active_wip: number };
        const activeWipCount = activeWipRow?.total_active_wip || 0;

        const completed30dRow = db.prepare(`
          SELECT COUNT(*) as completed_qty
          FROM work_orders
          WHERE status = 'COMPLETED' 
            AND completed_at >= datetime('now', '-30 days')
        `).get() as { completed_qty: number };
        
        const totalCompleted30d = completed30dRow?.completed_qty || 0;
        const dailyThroughput = Math.max(0.1, Math.round((totalCompleted30d / 30) * 100) / 100);
        const leadTimeDays = Math.round((activeWipCount / dailyThroughput) * 10) / 10;

        let maxRatio = -1;
        let bottleneckWc = "None";

        const workCenterDetails = workCenters.map((wc) => {
          const activeWip = Number(wc.active_wip || 0);
          const wipLimit = Number(wc.wip_limit || 20);
          const ratio = activeWip / wipLimit;

          if (ratio > maxRatio && activeWip > 0) {
            maxRatio = ratio;
            bottleneckWc = wc.name;
          }

          let status = "NORMAL";
          if (ratio >= 1.0) status = "OVERFLOW_BOTTLENECK";
          else if (ratio >= 0.75) status = "WARNING";

          const woList = db.prepare(`
            SELECT wo.id, wo.wo_number, wo.status, wo.current_step_sequence, wo.created_at,
                   p.name as project_name, p.customer
            FROM work_orders wo
            JOIN projects p ON wo.project_id = p.id
            WHERE wo.current_work_center_id = ? AND wo.status IN ('RELEASED', 'IN_PROGRESS')
            ORDER BY wo.created_at ASC
          `).all(wc.id);

          return {
            ...wc,
            active_wip: activeWip,
            wip_limit: wipLimit,
            utilization_pct: Math.min(100, Math.round(ratio * 100)),
            status,
            work_orders: woList,
          };
        });

        const allActiveWos = db.prepare(`
          SELECT wo.id, wo.wo_number, wo.project_id, wo.status, wo.wip_status,
                 wo.current_work_center_id, wo.current_step_sequence, wo.created_at,
                 p.name as project_name, wc.name as current_work_center_name
          FROM work_orders wo
          JOIN projects p ON wo.project_id = p.id
          LEFT JOIN work_centers wc ON wo.current_work_center_id = wc.id
          WHERE wo.status IN ('RELEASED', 'IN_PROGRESS')
          ORDER BY wo.created_at DESC
        `).all() as any[];

        const activeWosWithRoutings = allActiveWos.map((wo) => {
          const routings = db.prepare(`
            SELECT r.*, wc.name as work_center_name, wc.wip_limit
            FROM work_center_routings r
            JOIN work_centers wc ON r.work_center_id = wc.id
            WHERE r.project_id = ?
            ORDER BY r.step_sequence ASC
          `).all(wo.project_id);

          return {
            ...wo,
            routings,
          };
        });

        res.json({
          summaryMetrics: {
            activeWipCount,
            completed30d: totalCompleted30d,
            dailyThroughput,
            leadTimeDays,
            bottleneckWc,
          },
          workCenters: workCenterDetails,
          activeWorkOrders: activeWosWithRoutings,
        });
      } catch (error: any) {
        console.error("Error fetching WIP summary:", error);
        res.status(500).json({ error: "Failed to fetch WIP summary: " + error.message });
      }
    });

analyticsRouter.get("/api/production/projects/:id/oee-wip", (req, res) => {
      try {
        const projectId = req.params.id;
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
        if (!project) return res.status(404).json({ error: "Project not found" });

        const wots = db.prepare(`
          SELECT w.*, b.process_name as current_process_name, COALESCE(s.station_name, 'Station') as current_station_name
          FROM work_order_tickets w
          LEFT JOIN bill_of_processes b ON w.current_process_id = b.id
          LEFT JOIN project_stations s ON w.current_station_id = s.id
          WHERE w.project_id = ?
        `).all(projectId) as any[];

        const bopSteps = db.prepare(`
          SELECT b.*, COALESCE(s.station_name, 'Station') as station_name,
                 i.name as machine_name, i.item_code as machine_code,
                 (SELECT COUNT(*) FROM work_order_tickets w WHERE w.current_process_id = b.id) as active_wots_count,
                 (SELECT COALESCE(SUM(qty), 0) FROM work_order_tickets w WHERE w.current_process_id = b.id) as wip_qty
          FROM bill_of_processes b
          LEFT JOIN project_stations s ON b.station_id = s.id
          LEFT JOIN items i ON COALESCE(b.assigned_machine_id, b.machine_id) = i.id
          WHERE b.project_id = ? AND UPPER(b.node_type) NOT IN ('PRODUCT', 'START', 'END')
          ORDER BY b.step_sequence ASC
        `).all(projectId) as any[];

        const ndps = db.prepare(`
          SELECT n.*, i.name as machine_name, i.item_code as machine_code
          FROM notice_to_down_processes n
          LEFT JOIN items i ON COALESCE(n.affected_machine_id, n.machine_id) = i.id
          WHERE n.project_id = ?
          ORDER BY n.created_at DESC
        `).all(projectId) as any[];

        const history = db.prepare(`
          SELECT h.*, b.process_name, COALESCE(s.station_name, 'Station') as station_name
          FROM wot_history h
          LEFT JOIN bill_of_processes b ON h.process_id = b.id
          LEFT JOIN project_stations s ON h.station_id = s.id
          WHERE h.project_id = ? AND h.notes != 'Lot ticket generated'
          ORDER BY h.completed_at DESC
          LIMIT 50
        `).all(projectId) as any[];

        const totalDownHours = ndps.reduce((sum: number, n: any) => sum + (Number(n.estimated_down_hours) || (n.status === 'ACTIVE' ? 4 : 0)), 0);
        const plannedHours = bopSteps.reduce((sum: number, b: any) => sum + ((Number(b.standard_hours) || 1) * (Number(project.qty) || 1)), 0) || 40;

        // Availability %
        const operatingHours = Math.max(0, plannedHours - totalDownHours);
        const availability = plannedHours > 0 ? Math.min(100, Math.max(0, (operatingHours / plannedHours) * 100)) : 100;

        // Quality % (good vs scrap)
        const qualityStats = db.prepare(`
          SELECT COALESCE(SUM(qty), 0) as good_units, COALESCE(SUM(scrap_qty), 0) as scrap_units
          FROM wot_history 
          WHERE project_id = ? AND notes != 'Lot ticket generated'
        `).get(projectId) as any;

        const goodUnits = Number(qualityStats?.good_units) || 0;
        const scrapUnits = Number(qualityStats?.scrap_units) || 0;
        const totalProduced = goodUnits + scrapUnits;
        const quality = totalProduced > 0 ? ((goodUnits / totalProduced) * 100) : 100;

        // Performance %
        const factoryFactor = Number(project.factory_factor) || 85;
        const performance = Math.min(100, Math.max(60, factoryFactor));

        // Overall OEE %
        const oeeScore = Number(((availability * performance * quality) / 10000).toFixed(1));

        const wipBreakdown = bopSteps.map((b: any) => ({
          bop_id: b.id,
          step_sequence: b.step_sequence,
          process_name: b.process_name,
          station_name: b.station_name || 'Workstation',
          machine_name: b.machine_name || null,
          machine_code: b.machine_code || null,
          wip_qty: b.wip_qty || 0,
          wots_count: b.active_wots_count || 0,
          cycle_time_minutes: b.cycle_time_minutes || 0,
          status: b.status || 'ACTIVE',
          completed_qty: b.completed_qty || 0
        }));

        res.json({
          ok: true,
          oee: {
            score: oeeScore,
            overall: oeeScore,
            availability: Number(availability.toFixed(1)),
            performance: Number(performance.toFixed(1)),
            quality: Number(quality.toFixed(1)),
            planned_hours: Number(plannedHours.toFixed(1)),
            plannedHours: Number(plannedHours.toFixed(1)),
            downtime_hours: Number(totalDownHours.toFixed(1)),
            downtimeHours: Number(totalDownHours.toFixed(1)),
            good_qty: goodUnits,
            goodUnits,
            scrap_qty: scrapUnits,
            scrapUnits,
            total_qty: totalProduced
          },
          wip_breakdown: wipBreakdown,
          wip: {
            totalWots: wots.length,
            completedWots: wots.filter((w: any) => w.status === 'COMPLETED').length,
            inProgressWots: wots.filter((w: any) => w.status === 'IN_PROGRESS' || w.status === 'QUEUED').length,
            byStation: wipBreakdown
          },
          history,
          ndps
        });
      } catch (err: any) {
        console.error("OEE WIP analytics error:", err);
        res.status(500).json({ error: err.message });
      }
    });

analyticsRouter.get("/api/production-logger/logs", handleGetProductionLogs);

analyticsRouter.get("/api/production-logs", handleGetProductionLogs);

analyticsRouter.patch("/api/production-logger/logs/:id/verify", (req, res) => {
      try {
        const { id } = req.params;
        const { verified_by = "QC Inspector" } = req.body;
        
        db.prepare(`
          UPDATE production_logs 
          SET is_verified = 1, verified_by = ?, verified_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(verified_by, id);

        emitProductionUpdate("NEW_PRODUCTION_LOG", { id, action: "VERIFIED" });
        res.json({ ok: true, message: "Production log entry verified by QC" });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

analyticsRouter.post("/api/production-logger/logs/:id/correct", (req, res) => {
      try {
        const { id } = req.params;
        const { note, user_id = "Supervisor", user_role = "SUPERVISOR" } = req.body;
        
        const original = db.prepare("SELECT * FROM production_logs WHERE id = ?").get(id) as any;
        if (!original) {
          return res.status(404).json({ error: "Original log entry not found" });
        }

        const correctionId = crypto.randomUUID();
        const detailsObj = {
          correction_of_log_id: id,
          original_log_type: original.log_type,
          supervisor_note: note,
          created_at: new Date().toISOString()
        };

        db.prepare(`
          INSERT INTO production_logs 
          (id, log_type, project_id, wot_id, station_id, process_id, machine_id, user_id, user_role, details, timestamp)
          VALUES (?, 'CORRECTION', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          correctionId, 
          original.project_id, 
          original.wot_id, 
          original.station_id, 
          original.process_id, 
          original.machine_id, 
          user_id, 
          user_role, 
          JSON.stringify(detailsObj)
        );

        emitProductionUpdate("NEW_PRODUCTION_LOG", { id: correctionId, log_type: "CORRECTION" });
        res.json({ ok: true, id: correctionId, message: "Correction note logged immutably" });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

analyticsRouter.get("/api/production-logger/dashboard", (req, res) => {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        
        const todayStats = db.prepare(`
          SELECT 
            COUNT(*) as total_logs_today,
            SUM(CASE WHEN log_type = 'WOT_COMPLETE' THEN 1 ELSE 0 END) as wots_completed_today,
            SUM(CASE WHEN log_type = 'QR_SCAN' THEN 1 ELSE 0 END) as qr_scans_today,
            SUM(CASE WHEN log_type LIKE 'NDP%' THEN 1 ELSE 0 END) as ndp_events_today,
            SUM(CASE WHEN log_type LIKE 'FLOOR_REQUEST%' THEN 1 ELSE 0 END) as fr_events_today
          FROM production_logs
          WHERE date(timestamp) = date(?)
        `).get(todayStr) as any;

        const activeNdpsCount = db.prepare(`
          SELECT COUNT(*) as count FROM ndps WHERE status = 'ACTIVE' OR status = 'BLOCKED' OR status = 'RESOLVING'
        `).get() as any;

        const pendingRequestsCount = db.prepare(`
          SELECT COUNT(*) as count FROM floor_requests WHERE status = 'PENDING' OR status = 'ACKNOWLEDGED'
        `).get() as any;

        const machineSummary = db.prepare(`
          SELECT 
            COUNT(*) as total_machines,
            SUM(CASE WHEN COALESCE(machine_status, operational_status, 'AVAILABLE') = 'AVAILABLE' THEN 1 ELSE 0 END) as available,
            SUM(CASE WHEN COALESCE(machine_status, operational_status) IN ('RUNNING', 'ASSIGNED', 'IN_USE') THEN 1 ELSE 0 END) as running,
            SUM(CASE WHEN COALESCE(machine_status, operational_status) = 'MAINTENANCE' THEN 1 ELSE 0 END) as maintenance,
            SUM(CASE WHEN COALESCE(machine_status, operational_status) = 'BROKEN' THEN 1 ELSE 0 END) as broken
          FROM items WHERE item_type = 'MACHINE' OR machine_category IS NOT NULL
        `).get() as any;

        res.json({
          ok: true,
          today_stats: todayStats || {},
          active_ndps: activeNdpsCount?.count || 0,
          pending_requests: pendingRequestsCount?.count || 0,
          machine_status_summary: machineSummary || {}
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

analyticsRouter.get("/api/production-logger/logs/export", (req, res) => {
      try {
        const { project_id, station_id, format = 'csv' } = req.query;
        let query = `
          SELECT 
            pl.timestamp, pl.log_type, p.name as project_name, p.spk_number, 
            COALESCE(ps.station_name, st.station_name, pl.station_id) as station_name,
            COALESCE(bs.process_name, pr.name, pl.process_id) as process_name, 
            m.name as machine_name, m.item_code as machine_code, 
            u.name as user_name, pl.user_role,
            wot.lot_number, pl.details, pl.is_verified
          FROM production_logs pl
          LEFT JOIN users u ON pl.user_id = u.id 
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
        if (project_id && project_id !== 'ALL') { query += " AND pl.project_id = ?"; params.push(project_id); }
        if (station_id && station_id !== 'ALL') { query += " AND (pl.station_id = ? OR ps.id = ?)"; params.push(station_id, station_id); }
        query += " ORDER BY pl.timestamp DESC LIMIT 5000";
        
        const rows = db.prepare(query).all(...params) as any[];

        if (format === 'json') {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Content-Disposition", `attachment; filename=production_logs_${Date.now()}.json`);
          return res.json({ ok: true, total: rows.length, exported_at: new Date().toISOString(), logs: rows });
        }

        const headers = ["Timestamp", "Event Type", "Project", "SPK", "Lot (WOT)", "Station", "Process", "Machine", "User", "Role", "Verified", "Details"];
        const csvRows = rows.map(r => [
          r.timestamp ? new Date(r.timestamp).toISOString() : "",
          r.log_type || "",
          `"${(r.project_name || "").replace(/"/g, '""')}"`,
          r.spk_number || "",
          r.lot_number || "",
          `"${(r.station_name || "").replace(/"/g, '""')}"`,
          `"${(r.process_name || "").replace(/"/g, '""')}"`,
          r.machine_code || r.machine_name || "",
          `"${(r.user_name || "").replace(/"/g, '""')}"`,
          r.user_role || "",
          r.is_verified ? "YES" : "NO",
          `"${(r.details || "").replace(/"/g, '""')}"`
        ]);
        const csv = [headers.join(","), ...csvRows.map(e => e.join(","))].join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=production_logs_${Date.now()}.csv`);
        res.send(csv);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

analyticsRouter.post("/api/production-logger/logs", (req, res) => {
      try {
        const { log_type, project_id, wot_id, station_id, process_id, machine_id, user_id, user_role, details } = req.body;
        const id = crypto.randomUUID();
        db.prepare(`
          INSERT INTO production_logs 
          (id, log_type, project_id, wot_id, station_id, process_id, machine_id, user_id, user_role, details, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(id, log_type, project_id, wot_id, station_id, process_id, machine_id, user_id, user_role || 'OPERATOR', typeof details === 'string' ? details : JSON.stringify(details));
        
        emitProductionUpdate("NEW_PRODUCTION_LOG", { id, log_type });
        res.json({ ok: true, id });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

analyticsRouter.get("/api/production/global-analytics", (req, res) => {
      try {
        // 1. Machine Status & Utilization
        const machineStats = db.prepare(`
          SELECT 
            COUNT(*) as total_machines,
            SUM(CASE WHEN operational_status = 'AVAILABLE' THEN 1 ELSE 0 END) as available,
            SUM(CASE WHEN operational_status = 'IN_USE' THEN 1 ELSE 0 END) as in_use,
            SUM(CASE WHEN operational_status = 'MAINTENANCE' THEN 1 ELSE 0 END) as maintenance,
            SUM(CASE WHEN operational_status = 'BROKEN' THEN 1 ELSE 0 END) as broken
          FROM items WHERE machine_category IS NOT NULL OR capacity_per_hour IS NOT NULL
        `).get() as any;

        const machineFleet = db.prepare(`
          SELECT 
            i.id, i.item_code, i.name, i.machine_category, i.capacity_per_hour,
            COALESCE(i.operational_status, 'AVAILABLE') as operational_status,
            i.serial_number, i.manufacturer,
            (SELECT json_object('id', n.id, 'ndp_number', n.ndp_number, 'reason_category', n.reason_category, 'severity', n.severity)
             FROM notice_to_down_processes n 
             WHERE (n.machine_id = i.id OR n.affected_machine_id = i.id) AND n.status = 'ACTIVE' LIMIT 1) as active_ndp,
            (SELECT json_object('project_id', p.id, 'project_name', p.name, 'process_name', b.process_name)
             FROM bill_of_processes b
             JOIN projects p ON b.project_id = p.id
             WHERE (b.assigned_machine_id = i.id OR b.machine_id = i.id) AND p.status IN ('IN_PROGRESS', 'PLANNING')
             LIMIT 1) as active_assignment
          FROM items i
          WHERE (i.machine_category IS NOT NULL OR i.capacity_per_hour IS NOT NULL) AND i.deleted_at IS NULL
          ORDER BY i.name ASC
        `).all().map((m: any) => ({
          ...m,
          active_ndp: m.active_ndp ? JSON.parse(m.active_ndp) : null,
          active_assignment: m.active_assignment ? JSON.parse(m.active_assignment) : null
        }));

        // 2. Active Projects count and list with WIP
        const activeProjects = db.prepare(`
          SELECT p.id, p.name, p.status, p.qty, p.uom, p.created_at,
                 (SELECT COUNT(*) FROM work_order_tickets w WHERE w.project_id = p.id) as total_wots,
                 (SELECT COUNT(*) FROM work_order_tickets w WHERE w.project_id = p.id AND w.status = 'COMPLETED') as completed_wots
          FROM projects p 
          WHERE p.status IN ('IN_PROGRESS', 'PLANNING')
          ORDER BY p.created_at DESC
        `).all() as any[];

        // 3. Active NDPs (Downtime)
        const activeNdps = db.prepare(`
          SELECT COUNT(*) as count, COALESCE(SUM(estimated_down_hours), 0) as total_hours 
          FROM notice_to_down_processes WHERE status = 'ACTIVE'
        `).get() as any;

        const activeNdpsList = db.prepare(`
          SELECT n.*, i.name as machine_name, i.item_code as machine_code, p.name as project_name
          FROM notice_to_down_processes n
          LEFT JOIN items i ON COALESCE(n.affected_machine_id, n.machine_id) = i.id
          LEFT JOIN projects p ON n.project_id = p.id
          WHERE n.status = 'ACTIVE'
          ORDER BY n.created_at DESC
        `).all() as any[];

        // 4. Floor Requests Performance
        const floorRequests = db.prepare(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'FULFILLED' THEN 1 ELSE 0 END) as fulfilled
          FROM floor_requests
        `).get() as any;

        // 5. Global Yield Rate (Last 30 days)
        const yieldData = db.prepare(`
          SELECT 
            COALESCE(SUM(qty), 0) as good_units,
            COALESCE(SUM(scrap_qty), 0) as scrap_units
          FROM wot_history
          WHERE completed_at >= date('now', '-30 days')
        `).get() as any;

        // 6. Top WIP Station Bottlenecks
        const bottlenecks = db.prepare(`
          SELECT COALESCE(s.station_name, 'Station') as station_name, COUNT(w.id) as wot_count, COALESCE(SUM(w.qty), 0) as total_wip_qty
          FROM work_order_tickets w
          JOIN project_stations s ON w.current_station_id = s.id
          WHERE w.status IN ('IN_PROGRESS', 'QUEUED')
          GROUP BY s.id
          ORDER BY total_wip_qty DESC
          LIMIT 5
        `).all() as any[];

        res.json({ 
          ok: true, 
          data: {
            machineStats,
            machineFleet,
            activeProjects: activeProjects.length,
            activeProjectsList: activeProjects,
            activeNdps,
            activeNdpsList,
            floorRequests,
            yieldData,
            bottlenecks
          }
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

