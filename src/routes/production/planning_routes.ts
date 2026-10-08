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

export const planningRouter = Router();

planningRouter.get("/api/planning/schedule", (req, res) => {
      try {
        const { project_id } = req.query;
        
        // Fetch all active projects
        const projects = db.prepare("SELECT id, name, qty, lot_size, factory_factor, due_date, urgency, status FROM projects WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'ON_HOLD')").all() as any[];
        
        let allProcesses: any[] = [];
        for (const proj of projects) {
          const procs = db.prepare(`
            SELECT b.*, 
                   i.name as machine_name, i.item_code as machine_code, i.capacity_per_hour, 
                   i.operational_status, i.machine_status, i.bypass_multi_station, i.machine_category,
                   i.alternative_machine_ids as item_alt_machine_ids,
                   p.name as proj_name, p.qty as proj_qty, p.factory_factor as proj_ff, p.due_date as proj_due_date, p.urgency as proj_urgency, p.status as proj_status
            FROM bill_of_processes b
            LEFT JOIN items i ON (b.assigned_machine_id = i.id OR b.machine_id = i.id)
            JOIN projects p ON b.project_id = p.id
            WHERE b.project_id = ? AND UPPER(b.node_type) NOT IN ('PRODUCT', 'START', 'END')
            ORDER BY b.step_sequence ASC
          `).all(proj.id) as any[];
          allProcesses = allProcesses.concat(procs);
        }

        // Active machine NDPs to factor in downtime
        const activeNdps = db.prepare(`
          SELECT machine_id, affected_machine_id, estimated_down_hours, down_started_at, created_at, reschedule_required, ndp_code, description
          FROM notice_to_down_processes
          WHERE status IN ('ACTIVE', 'BLOCKED_PENDING_PROCUREMENT')
        `).all() as any[];

        const machineDowntimeUntil: Record<string, Date> = {};
        const machineDowntimeNdp: Record<string, string> = {};
        for (const ndp of activeNdps) {
          const mId = ndp.machine_id || ndp.affected_machine_id;
          if (mId) {
            const downHours = Number(ndp.estimated_down_hours) || 48;
            const downStart = new Date(ndp.down_started_at || ndp.created_at || Date.now()).getTime();
            const downEnd = new Date(downStart + (downHours * 3600000));
            if (!machineDowntimeUntil[mId] || downEnd > machineDowntimeUntil[mId]) {
              machineDowntimeUntil[mId] = downEnd;
              machineDowntimeNdp[mId] = ndp.ndp_code || "NDP";
            }
          }
        }

        // Sort processes: prioritize requested project, then by urgency & sequence
        allProcesses.sort((a, b) => {
          if (project_id) {
            if (a.project_id === project_id && b.project_id !== project_id) return -1;
            if (b.project_id === project_id && a.project_id !== project_id) return 1;
          }
          const urgOrder: Record<string, number> = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
          const uA = urgOrder[a.proj_urgency] || 3;
          const uB = urgOrder[b.proj_urgency] || 3;
          if (uA !== uB) return uA - uB;
          return a.step_sequence - b.step_sequence || a.id.localeCompare(b.id);
        });

        const now = new Date();
        const machineLoadTimeline: Record<string, Date> = {};
        const projectStepTimeline: Record<string, Date> = {};
        const machineUtilization: Record<string, any> = {};

        const fullGanttData = allProcesses.map((p, idx) => {
          const machineId = p.assigned_machine_id || p.machine_id || `manual_station_${idx}`;
          const machineName = p.machine_name || 'Manual Station';
          const totalQty = Number(p.proj_qty) || 100;
          const factoryFactor = Number(p.proj_ff) || 0.85;

          // Check machine availability
          let machineFreeTime = machineLoadTimeline[machineId] || new Date(now.getTime());
          
          const isMachineUnderNdp = Boolean(machineDowntimeUntil[machineId]);
          if (isMachineUnderNdp && machineDowntimeUntil[machineId] > machineFreeTime) {
            machineFreeTime = new Date(machineDowntimeUntil[machineId].getTime());
          } else if (p.operational_status === 'BROKEN' || p.machine_status === 'BROKEN') {
            const fallbackDownEnd = new Date(now.getTime() + (48 * 3600000));
            if (fallbackDownEnd > machineFreeTime) machineFreeTime = fallbackDownEnd;
          }

          const projectReadyTime = projectStepTimeline[p.project_id] || new Date(now.getTime());

          // Respect bypass_multi_station
          const canBypass = Boolean(p.bypass_multi_station);
          const earliestStart = canBypass 
            ? new Date(Math.max(now.getTime(), projectReadyTime.getTime()))
            : new Date(Math.max(now.getTime(), machineFreeTime.getTime(), projectReadyTime.getTime()));

          // Cycle Time & Capacity calculation (7.2.1)
          const cycleTimeMinutes = Number(p.cycle_time_minutes) || 60;
          const capacityPerHour = Number(p.capacity_per_hour) || 10;
          const setupMins = Number(p.setup_time_minutes) || 15;
          const teardownMins = Number(p.teardown_time_minutes) || 10;

          const capacityUnitsPerMin = Math.max(0.05, capacityPerHour / 60);
          const effectiveCtMinutes = cycleTimeMinutes / (capacityUnitsPerMin * factoryFactor);
          const totalDurationHours = Math.max(0.5, ((effectiveCtMinutes * totalQty) + setupMins + teardownMins) / 60);

          const endDate = new Date(earliestStart.getTime() + (totalDurationHours * 3600000));

          // Update timelines
          if (!canBypass) {
            machineLoadTimeline[machineId] = new Date(endDate.getTime());
          } else {
            machineLoadTimeline[machineId] = new Date(Math.max(machineFreeTime.getTime(), earliestStart.getTime() + (totalDurationHours * 0.4 * 3600000)));
          }
          projectStepTimeline[p.project_id] = new Date(endDate.getTime());

          // Track machine utilization
          if (!machineUtilization[machineId]) {
            machineUtilization[machineId] = {
              machine_id: machineId,
              machine_name: machineName,
              machine_code: p.machine_code || 'MCH',
              machine_category: p.machine_category || 'General',
              total_hours: 0,
              capacity_per_hour: capacityPerHour,
              is_broken: Boolean(p.operational_status === 'BROKEN' || p.machine_status === 'BROKEN' || isMachineUnderNdp),
              ndp_code: machineDowntimeNdp[machineId] || null,
              bypass_multi_station: canBypass,
              assigned_tasks: []
            };
          }
          machineUtilization[machineId].total_hours += totalDurationHours;
          machineUtilization[machineId].assigned_tasks.push({
            process_id: p.id,
            process_name: p.process_name,
            project_name: p.proj_name,
            duration_hours: Math.round(totalDurationHours * 10) / 10
          });

          return {
            id: p.id,
            project_id: p.project_id,
            process_name: p.process_name,
            name: `[${p.proj_name}] ${p.process_name}`,
            machine: machineName,
            machine_id: machineId,
            machine_code: p.machine_code,
            capacity_per_hour: capacityPerHour,
            bypass_multi_station: canBypass,
            is_machine_down: Boolean(isMachineUnderNdp || p.operational_status === 'BROKEN'),
            ndp_code: machineDowntimeNdp[machineId] || null,
            startDate: earliestStart.toISOString(),
            endDate: endDate.toISOString(),
            durationHours: Math.round(totalDurationHours * 10) / 10,
            progress: p.status === 'COMPLETED' ? 100 : (p.status === 'RUNNING' ? 40 : 0),
            is_critical: false
          };
        });

        // Compute Critical Path: tasks directly on the longest end dates
        const projectMaxEnd: Record<string, number> = {};
        for (const item of fullGanttData) {
          const endT = new Date(item.endDate).getTime();
          if (!projectMaxEnd[item.project_id] || endT > projectMaxEnd[item.project_id]) {
            projectMaxEnd[item.project_id] = endT;
          }
        }

        for (const item of fullGanttData) {
          const endT = new Date(item.endDate).getTime();
          if (Math.abs(endT - projectMaxEnd[item.project_id]) < (item.durationHours * 3600000) + 1000) {
            item.is_critical = true;
          }
        }

        const ganttData = project_id ? fullGanttData.filter(g => g.project_id === project_id) : fullGanttData;

        // Calculate Executive Summary Metrics (Section 7.4.4)
        const allFleetMachines = db.prepare("SELECT count(*) as c FROM items WHERE type = 'MACHINE' OR item_type = 'MACHINE'").get() as any;
        const totalFleetCount = Math.max(1, Number(allFleetMachines?.c) || Object.keys(machineUtilization).length);
        const utilizedCount = Object.keys(machineUtilization).filter(k => machineUtilization[k].total_hours > 0).length;
        
        let sumUtilizationPercent = 0;
        let maxLoadedMachine: any = null;
        Object.values(machineUtilization).forEach((m: any) => {
          const pct = Math.min(150, Math.round((m.total_hours / 160) * 100));
          sumUtilizationPercent += pct;
          if (!maxLoadedMachine || pct > maxLoadedMachine.pct) {
            maxLoadedMachine = { ...m, pct };
          }
        });
        const avgMachineLoad = totalFleetCount > 0 ? Math.round(sumUtilizationPercent / totalFleetCount) : 0;

        // Project On Track / At Risk / Delayed
        let onTrack = 0;
        let atRisk = 0;
        let delayed = 0;
        projects.forEach(proj => {
          const finishTime = projectMaxEnd[proj.id];
          if (proj.due_date && finishTime) {
            const dueTime = new Date(proj.due_date).getTime();
            if (finishTime > dueTime) delayed++;
            else if (dueTime - finishTime < 3 * 86400000) atRisk++;
            else onTrack++;
          } else {
            onTrack++;
          }
        });

        const rootToFinishAvgHours = fullGanttData.length > 0 
          ? (fullGanttData.reduce((acc, curr) => acc + curr.durationHours, 0) / Math.max(1, projects.length)).toFixed(1)
          : "0.0";

        const nextBottleneck = maxLoadedMachine && maxLoadedMachine.pct > 70 ? {
          machine_name: maxLoadedMachine.machine_name,
          machine_code: maxLoadedMachine.machine_code,
          load_percent: maxLoadedMachine.pct,
          message: `${maxLoadedMachine.machine_name} (${maxLoadedMachine.machine_code}) projected at ${maxLoadedMachine.pct}% capacity.`
        } : null;

        const criticalPathShiftMsg = activeNdps.length > 0 
          ? `${activeNdps[0].ndp_code || 'Active NDP'} impacted critical path by ~${activeNdps[0].estimated_down_hours || 48}h.`
          : null;

        res.json({ 
          success: true, 
          schedule: ganttData, 
          gantt_data: ganttData,
          all_schedule: fullGanttData,
          machine_utilizations: Object.values(machineUtilization),
          reschedule_required: activeNdps.some(n => Boolean(n.reschedule_required)),
          active_ndps_count: activeNdps.length,
          summary: {
            total_active_projects: projects.length,
            total_fleet_machines: totalFleetCount,
            utilized_machines: utilizedCount,
            average_machine_load: avgMachineLoad,
            projects_on_track: onTrack,
            projects_at_risk: atRisk,
            projects_delayed: delayed,
            next_bottleneck: nextBottleneck,
            root_to_finish_avg_hours: rootToFinishAvgHours,
            critical_path_shift_msg: criticalPathShiftMsg
          }
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

planningRouter.get("/api/planning/calculate-load", handleCalculateLoad);

planningRouter.post("/api/planning/calculate-load", handleCalculateLoad);

planningRouter.post("/api/planning/generate-wots", (req, res) => {
      try {
        const { project_id, target_shift_hours = 8, custom_lot_size } = req.body;
        if (!project_id) return res.status(400).json({ error: "project_id is required" });

        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(project_id) as any;
        if (!project) return res.status(404).json({ error: "Project not found" });

        const processes = db.prepare(`
          SELECT * FROM bill_of_processes 
          WHERE project_id = ? AND UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END')
          ORDER BY step_sequence ASC
        `).all(project_id) as any[];

        if (processes.length === 0) {
          return res.status(400).json({ error: "No BOP processes defined for this project." });
        }

        // 1. Calculate bottleneck cycle time
        let maxCtMinutes = 15;
        processes.forEach(p => {
          const ct = Number(p.cycle_time_minutes) || 15;
          if (ct > maxCtMinutes) maxCtMinutes = ct;
        });

        // 2. Optimal WOT Size formula: (Shift hours * 60) / Bottleneck CT
        const shiftMinutes = Number(target_shift_hours) * 60;
        const calculatedOptimalLot = Math.max(1, Math.min(project.qty || 100, Math.round(shiftMinutes / maxCtMinutes)));
        const finalLotSize = custom_lot_size ? Number(custom_lot_size) : calculatedOptimalLot;

        // Save lot_size to project
        db.prepare("UPDATE projects SET lot_size = ? WHERE id = ?").run(finalLotSize, project_id);

        // 3. Clear existing planned WOTs if not yet started
        db.prepare("DELETE FROM work_order_tickets WHERE project_id = ? AND status = 'PLANNED'").run(project_id);

        // 4. Generate WOT entities
        const totalUnits = Number(project.qty) || 100;
        const wotCount = Math.ceil(totalUnits / finalLotSize);
        const firstProcess = processes[0];
        const firstStation = db.prepare("SELECT * FROM stations WHERE id = ? OR project_id = ? ORDER BY station_sequence ASC LIMIT 1").get(firstProcess.station_id || '', project_id) as any;

        const generatedWots: any[] = [];
        let remainingQty = totalUnits;

        for (let i = 1; i <= wotCount; i++) {
          const wotId = `WOT-${project.spk_number || project.id.slice(0, 8)}-${String(i).padStart(3, '0')}`;
          const currentQty = Math.min(remainingQty, finalLotSize);
          remainingQty -= currentQty;

          db.prepare(`
            INSERT INTO work_order_tickets (
              id, lot_number, project_id, current_station_id, current_process_id,
              qty, status, machine_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'PLANNED', ?, CURRENT_TIMESTAMP)
          `).run(
            wotId, 
            wotId, 
            project_id, 
            firstStation?.id || firstProcess.station_id || null, 
            firstProcess.id,
            currentQty,
            firstProcess.assigned_machine_id || firstProcess.machine_id || null
          );

          // Insert travel log entry for WOT creation
          try {
            db.prepare(`
              INSERT INTO wot_travel_logs (
                wot_id, event_type, station_id, process_id, machine_id, user_name, timestamp, metadata
              ) VALUES (?, 'CREATED', ?, ?, ?, 'Production Planner', CURRENT_TIMESTAMP, ?)
            `).run(
              wotId,
              firstStation?.id || firstProcess.station_id || null,
              firstProcess.id,
              firstProcess.assigned_machine_id || firstProcess.machine_id || null,
              JSON.stringify({ lot_size: finalLotSize, total_qty: currentQty, sequence: i })
            );
          } catch (e) {}

          generatedWots.push({
            id: wotId,
            lot_number: wotId,
            qty: currentQty,
            status: 'PLANNED',
            current_station_name: firstStation?.station_name || 'Station 1',
            current_process_name: firstProcess.process_name
          });
        }

        emitProductionUpdate("WOTS_GENERATED", { project_id, total_wots: generatedWots.length, lot_size: finalLotSize });

        res.json({
          success: true,
          message: `Generated ${generatedWots.length} Work Order Tickets (Lot size: ${finalLotSize} pcs)`,
          lot_size: finalLotSize,
          bottleneck_cycle_time_mins: maxCtMinutes,
          total_wots: generatedWots.length,
          wots: generatedWots
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

planningRouter.post("/api/planning/apply-ndp-impact", (req, res) => {
      try {
        const { ndp_id, auto_reallocate = true, use_alternative_machine = true } = req.body;
        
        let targetNdps: any[] = [];
        if (ndp_id) {
          const ndp = db.prepare("SELECT * FROM notice_to_down_processes WHERE id = ?").get(ndp_id) as any;
          if (ndp) targetNdps.push(ndp);
          else {
            const ndp2 = db.prepare("SELECT * FROM ndps WHERE id = ?").get(ndp_id) as any;
            if (ndp2) targetNdps.push(ndp2);
          }
        } else if (auto_reallocate) {
          targetNdps = db.prepare(`
            SELECT * FROM notice_to_down_processes
            WHERE status IN ('ACTIVE', 'BLOCKED_PENDING_PROCUREMENT')
          `).all() as any[];
        }

        const reallocated: any[] = [];
        const affectedProjects = new Set<string>();

        for (const ndp of targetNdps) {
          const brokenMachineId = ndp.machine_id || ndp.affected_machine_id;
          if (brokenMachineId && use_alternative_machine) {
            // Find processes assigned to this broken machine that have alternative machines available
            const affectedBops = db.prepare(`
              SELECT id, process_name, project_id, alternative_machine_ids
              FROM bill_of_processes
              WHERE (assigned_machine_id = ? OR machine_id = ?)
                AND status NOT IN ('COMPLETED', 'CANCELLED')
            `).all(brokenMachineId, brokenMachineId) as any[];

            for (const bop of affectedBops) {
              affectedProjects.add(bop.project_id);
              try {
                const altIds = Array.isArray(bop.alternative_machine_ids)
                  ? bop.alternative_machine_ids
                  : JSON.parse(bop.alternative_machine_ids || "[]");

                if (altIds.length > 0) {
                  const placeholders = altIds.map(() => "?").join(",");
                  const altMachine = db.prepare(`
                    SELECT id, name, item_code, operational_status, machine_status
                    FROM items 
                    WHERE id IN (${placeholders}) 
                      AND (operational_status IS NULL OR operational_status != 'BROKEN')
                      AND (machine_status IS NULL OR machine_status != 'BROKEN')
                    LIMIT 1
                  `).get(...altIds) as any;

                  if (altMachine) {
                    db.prepare(`
                      UPDATE bill_of_processes
                      SET assigned_machine_id = ?, machine_id = ?
                      WHERE id = ?
                    `).run(altMachine.id, altMachine.id, bop.id);

                    // Also reassign blocked WOTs
                    db.prepare(`
                      UPDATE work_order_tickets
                      SET machine_id = ?, status = 'QUEUED'
                      WHERE current_process_id = ? AND status = 'BLOCKED_NDP'
                    `).run(altMachine.id, bop.id);

                    reallocated.push({
                      bop_id: bop.id,
                      process_name: bop.process_name,
                      project_id: bop.project_id,
                      previous_machine: brokenMachineId,
                      reallocated_machine_id: altMachine.id,
                      reallocated_machine_name: altMachine.name
                    });
                  }
                }
              } catch (e) {}
            }
          }

          // Mark reschedule_required as resolved
          if (ndp.id) {
            try { db.prepare("UPDATE notice_to_down_processes SET reschedule_required = 0 WHERE id = ?").run(ndp.id); } catch (e) {}
            try { db.prepare("UPDATE ndps SET reschedule_required = 0 WHERE id = ?").run(ndp.id); } catch (e) {}
          }
        }

        emitProductionUpdate("PLANNING_RESCHEDULED", { reallocated, affected_projects: Array.from(affectedProjects) });

        res.json({
          success: true,
          message: reallocated.length > 0 
            ? `NDP schedule impact applied. Reallocated ${reallocated.length} process(es) to alternative machines.`
            : "No processes required reallocation or no alternative machines were defined.",
          reallocated,
          affected_projects: Array.from(affectedProjects)
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

planningRouter.patch("/api/planning/reschedule", (req, res) => {
      try {
        const { project_id, manual_adjustments = [] } = req.body;
        const conflicts: any[] = [];
        const warnings: any[] = [];
        const applied: any[] = [];

        for (const adj of manual_adjustments) {
          const { wot_id, bop_id, new_machine_id, new_start } = adj;
          
          if (bop_id && new_machine_id) {
            // Check if machine is down
            const mch = db.prepare("SELECT * FROM items WHERE id = ?").get(new_machine_id) as any;
            if (mch && (mch.operational_status === 'BROKEN' || mch.machine_status === 'BROKEN')) {
              conflicts.push({
                bop_id,
                machine_id: new_machine_id,
                message: `Target machine ${mch.name} is currently down under NDP.`
              });
              continue;
            }

            // Check if machine has conflict with other projects (unless bypass is allowed)
            if (mch && !mch.bypass_multi_station) {
              const activeConflict = db.prepare(`
                SELECT b.id, b.process_name, p.name as project_name
                FROM bill_of_processes b
                JOIN projects p ON b.project_id = p.id
                WHERE (b.assigned_machine_id = ? OR b.machine_id = ?)
                  AND b.id != ?
                  AND p.status IN ('IN_PROGRESS', 'PLANNING')
                LIMIT 1
              `).get(new_machine_id, new_machine_id, bop_id) as any;

              if (activeConflict) {
                warnings.push({
                  bop_id,
                  machine_id: new_machine_id,
                  message: `Machine ${mch.name} is also assigned to '${activeConflict.process_name}' in '${activeConflict.project_name}'.`
                });
              }
            }

            db.prepare(`
              UPDATE bill_of_processes
              SET assigned_machine_id = ?, machine_id = ?
              WHERE id = ?
            `).run(new_machine_id, new_machine_id, bop_id);

            applied.push({ bop_id, new_machine_id, new_start });
          }

          if (wot_id && new_machine_id) {
            db.prepare(`
              UPDATE work_order_tickets
              SET machine_id = ?
              WHERE id = ?
            `).run(new_machine_id, wot_id);
            applied.push({ wot_id, new_machine_id });
          }
        }

        emitProductionUpdate("PLANNING_RESCHEDULED", { project_id, applied });

        res.json({
          success: true,
          message: `Applied ${applied.length} manual adjustments.`,
          applied,
          conflicts,
          warnings
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

planningRouter.get("/api/setup-master/machines/availability", (req, res) => {
      try {
        const { category } = req.query;
        let query = `
          SELECT 
            i.id,
            i.item_code,
            i.name,
            i.type,
            i.machine_category,
            i.capacity_per_hour,
            COALESCE(i.operational_status, 'AVAILABLE') as operational_status,
            i.serial_number,
            i.manufacturer,
            (
              SELECT json_object(
                'project_id', b.project_id,
                'project_name', p.name,
                'process_id', b.id,
                'process_name', b.process_name,
                'station_name', b.work_center_name
              )
              FROM bill_of_processes b
              JOIN projects p ON b.project_id = p.id
              WHERE b.assigned_machine_id = i.id AND p.status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED', 'ARCHIVED')
              LIMIT 1
            ) as current_assignment
          FROM items i
          WHERE i.type = 'MACHINE' AND i.deleted_at IS NULL
        `;
        const params: any[] = [];
        if (category) {
          query += ` AND i.machine_category = ?`;
          params.push(category);
        }
        query += ` ORDER BY i.item_code ASC`;

        const rawMachines = db.prepare(query).all(...params) as any[];
        const machines = rawMachines.map((m: any) => ({
          ...m,
          current_assignment: m.current_assignment ? JSON.parse(m.current_assignment) : null
        }));

        res.json({ ok: true, data: machines });
      } catch (err: any) {
        console.error("Error fetching machine availability:", err);
        res.status(500).json({ error: err.message });
      }
    });

planningRouter.post("/api/setup-master/processes/:processId/assign-machine", (req, res) => {
      try {
        const { processId } = req.params;
        const { machine_id, cycle_time_minutes, setup_time_minutes, teardown_time_minutes, force_bypass } = req.body;

        const process = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(processId) as any;
        if (!process) {
          return res.status(404).json({ error: "Process not found" });
        }

        if (!machine_id) {
          // Unassigning machine
          db.prepare(`
            UPDATE bill_of_processes 
            SET assigned_machine_id = NULL,
                cycle_time_minutes = COALESCE(?, cycle_time_minutes)
            WHERE id = ?
          `).run(cycle_time_minutes || null, processId);
          return res.json({ ok: true, message: "Machine unassigned from process" });
        }

        const machine = db.prepare("SELECT * FROM items WHERE id = ? AND type = 'MACHINE'").get(machine_id) as any;
        if (!machine) {
          return res.status(404).json({ error: "Machine asset not found" });
        }

        // Check if machine is broken or under maintenance
        if (machine.operational_status === "BROKEN") {
          return res.status(400).json({ 
            error: `Mesin [${machine.item_code}] sedang dalam kondisi RUSAK (NDP Aktif) dan tidak dapat ditugaskan.` 
          });
        }

        // Check active assignment conflict (Section 2.1 Rule 1)
        const existingAssignment = db.prepare(`
          SELECT b.*, p.name as project_name, s.name as station_name 
          FROM bill_of_processes b
          JOIN projects p ON b.project_id = p.id
          LEFT JOIN stations s ON b.station_id = s.id
          WHERE b.assigned_machine_id = ? 
            AND b.id != ? 
            AND p.status IN ('IN_PROGRESS', 'PLANNING')
          LIMIT 1
        `).get(machine_id, processId) as any;

        const allowsMultiStation = Boolean(machine.bypass_multi_station);
        if (existingAssignment && !allowsMultiStation && !force_bypass) {
          return res.status(409).json({
            conflict: true,
            machine_id: machine.id,
            machine_code: machine.item_code,
            machine_name: machine.name,
            active_in: {
              project_id: existingAssignment.project_id,
              project_name: existingAssignment.project_name,
              station_id: existingAssignment.station_id,
              station_name: existingAssignment.station_name || "Unassigned Station",
              process_id: existingAssignment.id,
              process_name: existingAssignment.process_name,
              process_status: existingAssignment.status || "QUEUED"
            },
            options: [
              "Lepaskan dari proses lama",
              "Pilih mesin lain",
              "Bypass jika mesin bertipe multi-station"
            ],
            error: `Mesin [${machine.item_code} - ${machine.name}] sedang aktif di Project [${existingAssignment.project_name}], Station [${existingAssignment.station_name || 'N/A'}], Process [${existingAssignment.process_name}] (Status: ${existingAssignment.status || 'QUEUED'}).`
          });
        }

        // Calculate cycle time if not provided, based on capacity
        let effectiveCt = cycle_time_minutes;
        if ((!effectiveCt || Number(effectiveCt) <= 0) && machine.capacity_per_hour && Number(machine.capacity_per_hour) > 0) {
          effectiveCt = Number((60 / machine.capacity_per_hour).toFixed(2));
        }

        // Perform assignment
        db.prepare(`
          UPDATE bill_of_processes 
          SET assigned_machine_id = ?,
              cycle_time_minutes = COALESCE(?, cycle_time_minutes),
              setup_time_minutes = COALESCE(?, setup_time_minutes, 0),
              teardown_time_minutes = COALESCE(?, teardown_time_minutes, 0)
          WHERE id = ?
        `).run(machine_id, effectiveCt || 10, setup_time_minutes || 0, teardown_time_minutes || 0, processId);

        // Update machine status to IN_USE if not already maintenance
        if (machine.operational_status === "AVAILABLE") {
          db.prepare("UPDATE items SET operational_status = 'IN_USE' WHERE id = ?").run(machine_id);
        }

        // Insert audit log
        try {
          db.prepare(`
            INSERT INTO production_logs (id, log_type, project_id, process_id, machine_id, user_role, details)
            VALUES (?, 'MACHINE_ASSIGN', ?, ?, ?, 'SUPERVISOR', ?)
          `).run(
            crypto.randomUUID(),
            process.project_id,
            processId,
            machine_id,
            JSON.stringify({ 
              process_name: process.process_name, 
              machine_code: machine.item_code,
              cycle_time_minutes: effectiveCt 
            })
          );
        } catch (logErr) {
          console.warn("Could not insert production log for machine assignment", logErr);
        }
        
        invalidatePlanningCache();

        res.json({
          ok: true,
          message: `Mesin ${machine.item_code} berhasil di-assign ke proses ${process.process_name}.`,
          warning: existingAssignment ? "Peringatan: Mesin digunakan bersama (Bypass aktif)." : undefined,
          assigned_machine: {
            id: machine.id,
            code: machine.item_code,
            name: machine.name,
            cycle_time_minutes: effectiveCt
          }
        });
      } catch (err: any) {
        console.error("Error assigning machine:", err);
        res.status(500).json({ error: err.message });
      }
    });

planningRouter.delete("/api/setup-master/processes/:processId/unassign-machine", (req, res) => {
      try {
        const { processId } = req.params;
        const process = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(processId) as any;
        if (!process) return res.status(404).json({ error: "Process not found" });

        const machineId = process.assigned_machine_id;
        db.prepare("UPDATE bill_of_processes SET assigned_machine_id = NULL WHERE id = ?").run(processId);

        if (machineId) {
          // Check if machine still assigned to another active process
          const otherAssignment = db.prepare(`
            SELECT b.id FROM bill_of_processes b
            JOIN projects p ON b.project_id = p.id
            WHERE b.assigned_machine_id = ? AND p.status IN ('IN_PROGRESS', 'PLANNING')
          `).get(machineId);

          if (!otherAssignment) {
            db.prepare("UPDATE items SET operational_status = 'AVAILABLE' WHERE id = ? AND operational_status = 'IN_USE'").run(machineId);
          }
        }
        
        invalidatePlanningCache();

        res.json({ ok: true, message: "Machine unassigned successfully" });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

