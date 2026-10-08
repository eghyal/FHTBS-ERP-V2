import db from "../db/database.ts";
import { parsePredecessorIds } from "./bopGraph.ts";
import { autoResolveDownstreamProductNodes } from "../routes/production/production_utils.ts";

export function syncProjectGanttTasks(projectId: string) {
  try {
    autoResolveDownstreamProductNodes(projectId, "Gantt Sync");

    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
    if (!project) return;

    const projStartDateStr = project.created_at ? project.created_at.split("T")[0] : new Date().toISOString().split("T")[0];
    const projectQty = Number(project.qty) || 1;
    const factoryFactor = Number(project.factory_factor) || 85;

    // 1. Sync PR / Procurement Tasks
    const prs = db.prepare(`
      SELECT pr.*, 
        (SELECT MIN(pri.expected_delivery_date) FROM pr_items pri WHERE pri.pr_id = pr.id AND pri.expected_delivery_date IS NOT NULL) as min_item_delivery,
        (SELECT COUNT(*) FROM pr_items pri WHERE pri.pr_id = pr.id) as item_count
      FROM purchase_requests pr
      WHERE pr.project_id = ? AND pr.status != 'CANCELLED'
    `).all(projectId) as any[];

    let maxPrArrivalDate = projStartDateStr;

    for (const pr of prs) {
      const prCreatedDate = pr.created_at ? pr.created_at.split("T")[0] : projStartDateStr;
      let targetDelivery = pr.expected_delivery_date || pr.min_item_delivery;
      
      if (!targetDelivery) {
        const d = new Date(prCreatedDate);
        d.setDate(d.getDate() + 7);
        targetDelivery = d.toISOString().split("T")[0];
      }

      if (pr.status !== 'RECEIVED' && pr.status !== 'COMPLETED' && targetDelivery > maxPrArrivalDate) {
        maxPrArrivalDate = targetDelivery;
      }

      const existingTask = db.prepare("SELECT id FROM project_tasks WHERE pr_id = ?").get(pr.id) as any;
      const taskName = `[Procurement] PR ${pr.pr_number} (${pr.urgency || 'NORMAL'}) - ${pr.item_count || 0} Items`;

      let progress = 0;
      let status = "PENDING";
      if (pr.status === "RECEIVED" || pr.status === "COMPLETED") {
        status = "COMPLETED";
        progress = 100;
      } else if (pr.status === "ORDERED" || pr.status === "PARTIAL_ORDERED" || pr.status === "PARTIAL") {
        status = "IN_PROGRESS";
        progress = pr.status === "PARTIAL" ? 75 : 50;
      } else if (pr.status === "AUTHORIZED") {
        status = "IN_PROGRESS";
        progress = 25;
      } else if (pr.status === "REJECTED") {
        status = "REJECTED";
        progress = 10;
      }

      if (existingTask) {
        db.prepare(`
          UPDATE project_tasks 
          SET task_name = ?, start_date = ?, end_date = ?, status = ?, progress = ?
          WHERE id = ?
        `).run(taskName, prCreatedDate, targetDelivery, status, progress, existingTask.id);
      } else {
        const newTaskId = "TSK-PR-" + Math.random().toString(36).substr(2, 9);
        db.prepare(`
          INSERT INTO project_tasks (id, project_id, task_name, start_date, end_date, progress, status, pr_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newTaskId, projectId, taskName, prCreatedDate, targetDelivery, progress, status, pr.id);
      }
    }

    // 2. Sync Manufacturing BOP Tasks using DAG Precedence Analysis
    const bopSteps = db.prepare(`
      SELECT * FROM bill_of_processes 
      WHERE project_id = ? AND node_type != 'PRODUCT' AND node_type != 'START' AND node_type != 'END'
      ORDER BY step_sequence ASC
    `).all(projectId) as any[];

    if (bopSteps.length === 0) return;

    const bopStepIds = new Set(bopSteps.map((s) => s.id));
    const stepPredsMap = new Map<string, string[]>();
    const stepDurations = new Map<string, number>();

    bopSteps.forEach((step) => {
      const rawPreds = parsePredecessorIds(step.predecessor_ids);
      const validPreds = rawPreds.filter((pId) => bopStepIds.has(pId));
      stepPredsMap.set(step.id, validPreds);

      const cycleMin =
        Number(step.cycle_time_minutes) ||
        (Number(step.cycle_time_seconds)
          ? Number(step.cycle_time_seconds) / 60
          : Number(step.standard_hours)
          ? Number(step.standard_hours) * 60
          : 60);
      const totalMinutes = cycleMin * (Number(step.target_qty) || projectQty);
      const hoursPerDay = 8 * (factoryFactor / 100);
      const durationDays = Math.max(1, Math.ceil(totalMinutes / (hoursPerDay * 60)));
      stepDurations.set(step.id, durationDays);
    });

    const scheduleMap = new Map<
      string,
      { startStr: string; endStr: string; startDateObj: Date; endDateObj: Date }
    >();
    const visitingSet = new Set<string>();
    const baseDateObj = new Date(maxPrArrivalDate);

    function calculateStepSchedule(stepId: string): {
      startDateObj: Date;
      endDateObj: Date;
      startStr: string;
      endStr: string;
    } {
      if (scheduleMap.has(stepId)) {
        return scheduleMap.get(stepId)!;
      }

      if (visitingSet.has(stepId)) {
        // Cycle fallback
        const startDateObj = new Date(baseDateObj);
        const durationDays = stepDurations.get(stepId) || 1;
        const endDateObj = new Date(startDateObj);
        endDateObj.setDate(endDateObj.getDate() + durationDays);
        return {
          startDateObj,
          endDateObj,
          startStr: startDateObj.toISOString().split("T")[0],
          endStr: endDateObj.toISOString().split("T")[0],
        };
      }

      visitingSet.add(stepId);

      const preds = stepPredsMap.get(stepId) || [];
      let maxPredEndDate = new Date(baseDateObj);

      for (const predId of preds) {
        if (predId === stepId) continue;
        const predSched = calculateStepSchedule(predId);
        if (predSched.endDateObj > maxPredEndDate) {
          maxPredEndDate = new Date(predSched.endDateObj);
        }
      }

      visitingSet.delete(stepId);

      const startDateObj = new Date(maxPredEndDate);
      const durationDays = stepDurations.get(stepId) || 1;
      const endDateObj = new Date(startDateObj);
      endDateObj.setDate(endDateObj.getDate() + durationDays);

      const sched = {
        startDateObj,
        endDateObj,
        startStr: startDateObj.toISOString().split("T")[0],
        endStr: endDateObj.toISOString().split("T")[0],
      };

      scheduleMap.set(stepId, sched);
      return sched;
    }

    bopSteps.forEach((step) => calculateStepSchedule(step.id));

    for (const step of bopSteps) {
      const sched = scheduleMap.get(step.id)!;

      db.prepare(`
        UPDATE bill_of_processes
        SET start_date = ?, end_date = ?
        WHERE id = ?
      `).run(sched.startStr, sched.endStr, step.id);

      const existingTask = db
        .prepare(
          "SELECT id FROM project_tasks WHERE id = ? OR (project_id = ? AND task_name = ?)",
        )
        .get(step.id, projectId, step.process_name) as any;

      const taskStatus =
        step.status === "COMPLETED"
          ? "COMPLETED"
          : step.status === "RUNNING"
          ? "RUNNING"
          : step.status === "PAUSED_MANUAL" || step.status === "PAUSED_NDP"
          ? "PAUSED"
          : "PENDING";
      const taskProgress = Number(step.progress) || (step.status === "COMPLETED" ? 100 : 0);

      // Sanitize work_center_id against work_centers table to prevent FOREIGN KEY constraint violations
      let validWorkCenterId: string | null = null;
      const candidateWc = step.work_center_id;
      if (candidateWc && typeof candidateWc === "string" && candidateWc.trim() !== "" && candidateWc !== "null" && candidateWc !== "undefined") {
        const cleanWc = candidateWc.trim();
        const wcCheck = db.prepare("SELECT id FROM work_centers WHERE id = ?").get(cleanWc) as any;
        if (wcCheck) {
          validWorkCenterId = cleanWc;
        }
      }

      const stationId = step.station_id || null;

      if (existingTask) {
        db.prepare(`
          UPDATE project_tasks
          SET start_date = ?, end_date = ?, status = ?, progress = ?, work_center_id = ?, station_id = ?
          WHERE id = ?
        `).run(
          sched.startStr,
          sched.endStr,
          taskStatus,
          taskProgress,
          validWorkCenterId,
          stationId,
          existingTask.id,
        );
      } else {
        db.prepare(`
          INSERT INTO project_tasks (id, project_id, task_name, start_date, end_date, progress, status, work_center_id, station_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          step.id,
          projectId,
          step.process_name,
          sched.startStr,
          sched.endStr,
          taskProgress,
          taskStatus,
          validWorkCenterId,
          stationId,
        );
      }
    }
  } catch (err) {
    console.error("Project Gantt Sync failed:", err);
  }
}

export function syncProcurementTaskGantt(prId: string) {
  try {
    const pr = db
      .prepare("SELECT status, project_id FROM purchase_requests WHERE id = ?")
      .get(prId) as { status: string; project_id: string } | undefined;

    if (!pr) return;

    const prItems = db
      .prepare(
        `
      SELECT pri.qty, COALESCE(SUM(gi.qty_received), 0) as total_received
      FROM pr_items pri
      LEFT JOIN purchase_orders po ON pri.po_id = po.id
      LEFT JOIN grns g ON g.po_id = po.id AND g.qc_status IN ('PASSED', 'CONDITIONAL')
      LEFT JOIN grn_items gi ON gi.grn_id = g.id AND gi.item_id = pri.item_id
      WHERE pri.pr_id = ?
      GROUP BY pri.id
    `,
      )
      .all(prId) as { qty: number; total_received: number }[];

    const totalOrdered = prItems.reduce(
      (sum, item) => sum + (item.qty || 0),
      0,
    );
    const totalReceived = prItems.reduce(
      (sum, item) => sum + (item.total_received || 0),
      0,
    );

    const hasRejections = db
      .prepare(
        `
      SELECT 1 FROM grns g
      JOIN pr_items pri ON pri.po_id = g.po_id
      WHERE pri.pr_id = ? AND g.qc_status = 'REJECTED'
      LIMIT 1
    `,
      )
      .get(prId) as any;

    let progress = 0;
    let status = "PENDING";

    if (pr.status === "CANCELLED") {
      status = "CANCELLED";
      progress = 0;
    } else if (hasRejections) {
      status = "REJECTED";
      const percent = totalOrdered > 0 ? totalReceived / totalOrdered : 0;
      progress = Math.min(95, Math.round(50 + percent * 45));
    } else if (totalReceived >= totalOrdered && totalOrdered > 0) {
      status = "COMPLETED";
      progress = 100;
    } else if (totalReceived > 0) {
      status = "IN_PROGRESS";
      const percent = totalReceived / totalOrdered;
      progress = Math.min(99, Math.round(50 + percent * 49));
    } else if (
      pr.status === "ORDERED" ||
      pr.status === "PARTIAL" ||
      pr.status === "RECEIVED"
    ) {
      status = "IN_PROGRESS";
      progress = 50;
    } else if (pr.status === "AUTHORIZED") {
      status = "IN_PROGRESS";
      progress = 25;
    } else {
      status = "PENDING";
      progress = 0;
    }

    db.prepare(
      "UPDATE project_tasks SET status = ?, progress = ? WHERE pr_id = ?",
    ).run(status, progress, prId);

    let prNewStatus = pr.status;
    if (pr.status !== "CANCELLED") {
      if (hasRejections) {
        prNewStatus = "REJECTED";
      } else if (totalReceived >= totalOrdered && totalOrdered > 0) {
        prNewStatus = "RECEIVED";
      } else if (totalReceived > 0) {
        prNewStatus = "PARTIAL";
      } else {
        const totalItemsCountRow = db
          .prepare("SELECT COUNT(*) as cnt FROM pr_items WHERE pr_id = ?")
          .get(prId) as { cnt: number };
        const orderedItemsCountRow = db
          .prepare(
            "SELECT COUNT(*) as cnt FROM pr_items WHERE pr_id = ? AND po_id IS NOT NULL",
          )
          .get(prId) as { cnt: number };

        if (
          orderedItemsCountRow &&
          totalItemsCountRow &&
          orderedItemsCountRow.cnt === totalItemsCountRow.cnt &&
          totalItemsCountRow.cnt > 0
        ) {
          prNewStatus = "ORDERED";
        } else if (orderedItemsCountRow && orderedItemsCountRow.cnt > 0) {
          prNewStatus = "PARTIAL_ORDERED";
        } else {
          prNewStatus = "AUTHORIZED";
        }
      }
    }
    db.prepare("UPDATE purchase_requests SET status = ? WHERE id = ?").run(
      prNewStatus,
      prId,
    );

    if (pr.project_id) {
      syncProjectGanttTasks(pr.project_id);
    }
  } catch (err) {
    console.error("Gantt Procurement Sync failed:", err);
  }
}

