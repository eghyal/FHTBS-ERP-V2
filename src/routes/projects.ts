import { isValidDailyAuthKey } from "../utils/auth.ts";
import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { syncCollectionToFirestore } from "../db/firebaseSync.ts";
import { validateManpowerSequentialAssignment } from "../utils/bopGraph.ts";
import { syncProjectGanttTasks } from "../utils/ganttUtils.ts";
import {
  calculateProjectLaborCost,
  calculateProjectMaterialCost,
  calculateProjectOverheadCost,
  recalculateProjectFinancialSummary,
} from "../services/projectHppService.ts";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const router = Router();

function checkQuotationExpired(quotation: any) {
  if (!quotation) return true;
  if (quotation.status === "PROCESSED") return false;
  if (quotation.status === "EXPIRED") return true;
  const createdDate = new Date(quotation.created_at);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - createdDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > (quotation.validity_days || 20);
}


// Helper to calculate true remaining material requirement using BOP fractional allocations and physical shop floor progress
function calculateFractionalBomRemaining(db: any, projectId: string, bomId: string, defaultRequired: number, defaultConsumed: number, projectQty: number, unitRequiredQty: number) {
  const bops = db.prepare("SELECT id, completed_qty, bom_allocations FROM bill_of_processes WHERE project_id = ? AND node_type = 'PRODUCT'").all(projectId) as any[];
  if (bops.length === 0) {
     return Math.max(0, defaultRequired - defaultConsumed);
  }

  let isAllocated = false;
  let trueRemaining = 0;

  for (const bop of bops) {
    let allocs: any[] = [];
    try { allocs = typeof bop.bom_allocations === 'string' ? JSON.parse(bop.bom_allocations) : bop.bom_allocations || []; } catch(e){}
    const alloc = allocs.find((a: any) => a.bom_id === bomId);
    if (alloc) {
      isAllocated = true;
      const fraction = Number(alloc.fraction) || 1;
      const completed = Number(bop.completed_qty) || 0;
      const nodeNeeded = Math.max(0, projectQty - completed);
      trueRemaining += (nodeNeeded * unitRequiredQty * fraction);
    }
  }

  if (isAllocated) {
     return trueRemaining;
  }
  return Math.max(0, defaultRequired - defaultConsumed);
}

router.get("/api/projects/:id/cost-summary", (req, res) => {
      try {
        const projectId = req.params.id;
        
        // Material Budget (Base BOM Qty * Project Qty * Unit Price)
        const materialBudget = db
          .prepare(
            `
        SELECT SUM(b.required_qty * COALESCE(p.qty, 1) * b.unit_price) as total_budget
        FROM boms b
        JOIN projects p ON b.project_id = p.id
        WHERE b.project_id = ?
      `,
          )
          .get(projectId) as { total_budget: number };

        // Labor Budget (Standard Hours * Manpower * Rp 50,000)
        const laborBudget = db
          .prepare(
            `
        SELECT SUM(standard_hours * COALESCE(manpower_allocated, 1) * 50000) as total_labor_budget
        FROM bill_of_processes
        WHERE project_id = ?
      `,
          )
          .get(projectId) as { total_labor_budget: number };

        // Actual Material from PR items
        const actualMaterialCost = calculateProjectMaterialCost(db, projectId);

        // Actual Direct Labor (BTKL) integrating shifts, attendances, and overtime schedules
        const laborBreakdown = calculateProjectLaborCost(db, projectId);
        const actualLaborCost = laborBreakdown.totalLaborCost;
        const actualOverheadCost = calculateProjectOverheadCost(db, projectId);

        // Recalculate summary in DB asynchronously
        let hppBreakdown = null;
        try {
          hppBreakdown = recalculateProjectFinancialSummary(db, projectId);
        } catch (reErr) {
          console.warn("Auto-recalculation of project financial summary skipped:", reErr);
        }

        res.json({
          budget: (materialBudget.total_budget || 0) + (laborBudget.total_labor_budget || 0),
          actual: actualMaterialCost + actualLaborCost + actualOverheadCost,
          material_budget: materialBudget.total_budget || 0,
          labor_budget: laborBudget.total_labor_budget || 0,
          actual_material: actualMaterialCost,
          actual_labor: actualLaborCost,
          actual_overhead: actualOverheadCost,
          actual_cost_material: actualMaterialCost,
          actual_cost_full: actualMaterialCost + actualLaborCost + actualOverheadCost,
          material_only_hpp: actualMaterialCost,
          full_absorption_hpp: actualMaterialCost + actualLaborCost + actualOverheadCost,
          labor_breakdown: laborBreakdown,
          hpp_breakdown: hppBreakdown,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch cost summary" });
      }
    });

    // Comprehensive Project HPP (Harga Pokok Produksi) Endpoint
    router.get("/api/projects/:id/hpp", (req, res) => {
      try {
        const projectId = req.params.id;
        const hppBreakdown = recalculateProjectFinancialSummary(db, projectId);
        res.json({ ok: true, data: hppBreakdown });
      } catch (error: any) {
        console.error("Failed to fetch project HPP:", error);
        res.status(500).json({ error: error.message || "Failed to calculate project HPP" });
      }
    });

    router.post("/api/projects/:id/recalculate-hpp", (req, res) => {
      try {
        const projectId = req.params.id;
        const hppBreakdown = recalculateProjectFinancialSummary(db, projectId);
        res.json({ ok: true, message: "Project HPP successfully recalculated", data: hppBreakdown });
      } catch (error: any) {
        console.error("Failed to recalculate project HPP:", error);
        res.status(500).json({ error: error.message || "Failed to recalculate project HPP" });
      }
    });

    router.get("/api/projects", (req, res) => {
      try {
        const { archived } = req.query;
        let query = `
        SELECT p.*,
               (SELECT COUNT(*) FROM project_stations ps WHERE ps.project_id = p.id) as station_count, 
               (SELECT COUNT(*) FROM work_order_tickets w WHERE w.project_id = p.id) as total_wots,
               (SELECT COUNT(*) FROM work_order_tickets w WHERE w.project_id = p.id AND w.status IN ('COMPLETED', 'FINISHED')) as completed_wots,
               COALESCE((SELECT SUM(b.required_qty * COALESCE(p.qty, 1) * b.unit_price) FROM boms b WHERE b.project_id = p.id), 0) +
               COALESCE((SELECT SUM(standard_hours * COALESCE(manpower_allocated, 1) * 50000) FROM bill_of_processes WHERE project_id = p.id), 0) as est_budget,
               COALESCE((SELECT SUM(b.required_qty * COALESCE(p.qty, 1) * b.unit_price) FROM boms b WHERE b.project_id = p.id), 0) as est_material_budget,
               COALESCE((SELECT SUM(pri.qty * pri.unit_price) FROM pr_items pri JOIN purchase_requests pr ON pri.pr_id = pr.id WHERE pr.project_id = p.id AND pr.status != 'CANCELLED'), 
                        (SELECT SUM(b.required_qty * COALESCE(p.qty, 1) * b.unit_price) FROM boms b WHERE b.project_id = p.id), 0) as actual_cost_material,
               COALESCE((SELECT pfs.total_labor_cost FROM project_financial_summaries pfs WHERE pfs.project_id = p.id), (SELECT SUM(COALESCE(actual_hours, 0) * 50000) FROM production_manpower_assignments WHERE project_id = p.id AND status = 'COMPLETED'), 0) as actual_cost_labor,
               COALESCE((SELECT pfs.total_overhead_cost FROM project_financial_summaries pfs WHERE pfs.project_id = p.id), 0) as actual_cost_overhead,
               COALESCE((SELECT pfs.full_cogs FROM project_financial_summaries pfs WHERE pfs.project_id = p.id), (SELECT pfs.total_cogs FROM project_financial_summaries pfs WHERE pfs.project_id = p.id), 0) as actual_cost_full,
               COALESCE((SELECT SUM(pri.qty * pri.unit_price) FROM pr_items pri JOIN purchase_requests pr ON pri.pr_id = pr.id WHERE pr.project_id = p.id AND pr.status != 'CANCELLED'), 0) +
               COALESCE((SELECT pfs.total_labor_cost FROM project_financial_summaries pfs WHERE pfs.project_id = p.id), (SELECT SUM(COALESCE(actual_hours, 0) * 50000) FROM production_manpower_assignments WHERE project_id = p.id AND status = 'COMPLETED'), 0) as actual_cost,
               COALESCE(p.qty, (SELECT SUM(qty) FROM quotation_items WHERE quotation_id = p.quotation_id), 1) as quotation_qty
        FROM projects p 
      `;
        if (archived === "true") {
          query += " WHERE p.archived_at IS NOT NULL";
        } else if (archived === "all") {
          query += " WHERE p.status != 'PENDING_NTP'";
        } else {
          query += " WHERE p.archived_at IS NULL AND p.status != 'PENDING_NTP'";
        }
        
        // Hide system projects from standard project listings
        query += " AND p.id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')";
        query += " ORDER BY p.due_date ASC, p.created_at DESC";
        const projects = db.prepare(query).all();
        res.json(projects);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch projects" });
      }
    });

    router.post("/api/tasks/:id", (req, res) => {
      try {
        const {
          start_date,
          end_date,
          required_hours,
          progress,
          status,
          actual_start_date,
          actual_end_date,
          work_center_id,
        } = req.body;
        const { id } = req.params;

        const updates = [];
        const params = [];

        if (start_date !== undefined) {
          updates.push("start_date = ?");
          params.push(start_date);
        }
        if (end_date !== undefined) {
          updates.push("end_date = ?");
          params.push(end_date);
        }
        if (required_hours !== undefined) {
          updates.push("required_hours = ?");
          params.push(required_hours);
        }
        if (progress !== undefined) {
          updates.push("progress = ?");
          params.push(progress);
        }
        if (status !== undefined) {
          updates.push("status = ?");
          params.push(status);
        }
        if (actual_start_date !== undefined) {
          updates.push("actual_start_date = ?");
          params.push(actual_start_date);
        }
        if (actual_end_date !== undefined) {
          updates.push("actual_end_date = ?");
          params.push(actual_end_date);
        }
        if (work_center_id !== undefined) {
          updates.push("work_center_id = ?");
          params.push(work_center_id);
        }

        if (updates.length === 0) return res.json({ success: true });

        params.push(id);
        db.prepare(
          `UPDATE project_tasks SET ${updates.join(", ")} WHERE id = ?`,
        ).run(...params);

        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update task" });
      }
    });

    router.get("/api/gantt", (req, res) => {
      try {
        const projects = db
          .prepare(
            "SELECT * FROM projects WHERE archived_at IS NULL AND status != 'PENDING_NTP' ORDER BY due_date ASC",
          )
          .all() as any[];

        for (const p of projects) {
          syncProjectGanttTasks(p.id);
        }

        const tasks = db
          .prepare(
            `
        SELECT t.*, wc.name as work_center_name 
        FROM project_tasks t
        LEFT JOIN work_centers wc ON t.work_center_id = wc.id
        WHERE t.status != 'CANCELLED'
        ORDER BY t.start_date ASC
      `,
          )
          .all() as any[];

        const tasksByProject: Record<string, any[]> = {};
        for (const t of tasks) {
          if (!tasksByProject[t.project_id]) tasksByProject[t.project_id] = [];
          tasksByProject[t.project_id].push(t);
        }

        // Batch fetch consumption status
        if (projects.length === 0) return res.json([]);

        const counts = db
          .prepare(
            `
        SELECT 
          p.id as project_id,
          (SELECT SUM(required_qty * COALESCE(p.qty, 1)) FROM boms WHERE project_id = p.id) as total_bom,
          (SELECT SUM(qty_consumed) FROM bom_item_consumption bic JOIN boms b ON b.id = bic.bom_id WHERE b.project_id = p.id) as total_consumed
        FROM projects p
        WHERE p.archived_at IS NULL
      `,
          )
          .all() as any[];

        const countMap: Record<string, any> = {};
        for (const count of counts) {
          countMap[count.project_id] = count;
        }

        const projectsWithTasks = projects.map((p) => {
          const count = countMap[p.id];
          const totalBom = count?.total_bom || 0;
          const totalConsumed = count?.total_consumed || 0;

          let materialStatus: "UNAVAILABLE" | "READY" = "READY";
          if (totalBom > 0 && totalConsumed <= 0) {
            materialStatus = "UNAVAILABLE";
          }

          return {
            ...p,
            material_status: materialStatus,
            tasks: tasksByProject[p.id] || [],
          };
        });

        res.json(projectsWithTasks);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch gantt data" });
      }
    });

    
    router.put("/api/projects/:id/factory-factor", (req, res) => {
      try {
        const { factory_factor } = req.body;
        if (typeof factory_factor !== 'number') {
          return res.status(400).json({ error: "Invalid factory_factor" });
        }
        db.prepare("UPDATE projects SET factory_factor = ? WHERE id = ?").run(factory_factor, req.params.id);
        res.json({ success: true, factory_factor });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update factory factor" });
      }
    });

    router.get("/api/projects/:id", (req, res) => {
      try {
        const projectId = req.params.id;
        syncProjectGanttTasks(projectId);

        const project = db
          .prepare("SELECT * FROM projects WHERE id = ?")
          .get(projectId) as any;
        if (!project)
          return res.status(404).json({ error: "Project not found" });

        // Fetch all project tasks (both PR procurement tasks and BOP manufacturing tasks)
        const tasks = db
          .prepare(
            `SELECT t.*, wc.name as work_center_name 
             FROM project_tasks t
             LEFT JOIN work_centers wc ON t.work_center_id = wc.id
             WHERE t.project_id = ? AND t.status != 'CANCELLED'
             ORDER BY t.start_date ASC`,
          )
          .all(projectId);

        const bop = db
          .prepare(
            `SELECT * FROM bill_of_processes 
             WHERE project_id = ? OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
             ORDER BY step_sequence ASC`
          )
          .all(projectId, projectId);

        const bopSteps = db
          .prepare(
            "SELECT id, project_id, process_name as task_name, start_date, end_date, actual_start_date, actual_end_date, progress, status, work_center_id, standard_hours as required_hours FROM bill_of_processes WHERE project_id = ? OR project_id = (SELECT spk_number FROM projects WHERE id = ?) ORDER BY step_sequence ASC",
          )
          .all(projectId, projectId);

        const prs = db
          .prepare(
            `
        SELECT 
          pr.pr_number, 
          pr.status, 
          pr.created_at, 
          COUNT(pri.id) as item_count,
          EXISTS(SELECT 1 FROM pr_items pri2 WHERE pri2.pr_id = pr.id AND pri2.po_id IS NOT NULL) as has_po
        FROM purchase_requests pr
        LEFT JOIN pr_items pri ON pr.id = pri.pr_id
        WHERE pr.project_id = ?
        GROUP BY pr.id
        ORDER BY pr.created_at DESC
      `,
          )
          .all(req.params.id);

        const bom = db
          .prepare(
            `
        SELECT 
          b.*, 
          (b.required_qty * COALESCE((SELECT qty FROM projects WHERE id = b.project_id), 1)) as total_required_qty,
          COALESCE(i.item_code, (SELECT item_code FROM items WHERE id = b.item_id), 'N/A') as item_code, 
          COALESCE(i.name, (SELECT name FROM items WHERE id = b.item_id), 'Unknown Item') as item_name, 
          COALESCE(i.uom, (SELECT uom FROM items WHERE id = b.item_id), 'PCS') as uom, 
          COALESCE(b.dimension, i.dimension) as dimension,
          COALESCE(b.spec, i.spec) as spec,
          COALESCE(
            (SELECT MIN(unit_price) FROM item_supplier_prices WHERE item_id = i.id),
            i.unit_price,
            b.unit_price,
            0
          ) as matrix_unit_price,
          COALESCE(inv.free_stock, 0) as free_stock,
          COALESCE(inv.allocated_stock, 0) as allocated_stock,
          bic.qty_consumed,
          (
            SELECT GROUP_CONCAT(pr.pr_number || ' (' || pri.qty || ')', ', ')
            FROM pr_items pri
            JOIN purchase_requests pr ON pri.pr_id = pr.id
            WHERE (pri.item_id = b.item_id OR pri.item_id = i.id) AND pr.project_id = b.project_id AND pr.status != 'CANCELLED'
          ) as pr_numbers,
          (
            SELECT SUM(pri.qty)
            FROM pr_items pri
            JOIN purchase_requests pr ON pri.pr_id = pr.id
            WHERE (pri.item_id = b.item_id OR pri.item_id = i.id) AND pr.project_id = b.project_id AND pr.status != 'CANCELLED'
          ) as total_pr_qty
        FROM boms b
        LEFT JOIN items i ON (b.item_id = i.id OR b.item_id = i.item_code)
        LEFT JOIN inventory inv ON (b.item_id = inv.item_id OR i.id = inv.item_id)
        LEFT JOIN bom_item_consumption bic ON b.id = bic.bom_id
        WHERE b.project_id = ?
      `,
          )
          .all(req.params.id);

        const deliveries = db
          .prepare(
            `
         SELECT dn.*, COALESCE(c.name, dn.customer_id) as customer_name 
         FROM delivery_notes dn 
         LEFT JOIN customers c ON dn.customer_id = c.id
         WHERE dn.project_id = ? 
         ORDER BY dn.created_at DESC
      `,
          )
          .all(req.params.id);

        const fgs = db
          .prepare(
            `
         SELECT * FROM items WHERE (type = 'FINISHED' OR type = 'FINISH_GOOD') AND item_code LIKE ?
      `,
          )
          .all(`FG-${req.params.id}%`);

        const invoices = db
          .prepare(
            `
         SELECT ci.*, COALESCE(c.name, ci.customer_id) as customer_name
         FROM commercial_invoices ci
         LEFT JOIN customers c ON ci.customer_id = c.id
         WHERE ci.project_id = ?
         ORDER BY ci.created_at DESC
      `,
          )
          .all(req.params.id) as any[];

        for (let inv of invoices) {
          inv.items = db
            .prepare(
              `
              SELECT di.*, 
                     COALESCE(i.item_code, 'FG-' || dn.project_id) as item_code, 
                     COALESCE(i.name, p.name, 'Commercial Trade Item') as item_name
              FROM delivery_items di
              JOIN delivery_notes dn ON di.dn_id = dn.id
              LEFT JOIN items i ON di.item_id = i.id
              LEFT JOIN projects p ON dn.project_id = p.id
              WHERE di.dn_id = ?
            `,
            )
            .all(inv.dn_id);
        }

        let quotation_items = project.quotation_id
          ? (db
              .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
              .all(project.quotation_id) as any[])
          : [];

        if (quotation_items.length > 0) {
          const matchedItem = quotation_items.find(
            (qi) =>
              qi.id === project.quotation_item_id ||
              (qi.title &&
                project.name &&
                qi.title.toLowerCase().trim() === project.name.toLowerCase().trim()),
          );
          if (matchedItem) {
            matchedItem.qty = Number(project.qty) > 0 ? Number(project.qty) : matchedItem.qty;
            matchedItem.uom = project.uom || matchedItem.uom;
            quotation_items = [
              matchedItem,
              ...quotation_items.filter((qi) => qi.id !== matchedItem.id),
            ];
          }
        }

        const work_orders = db
          .prepare("SELECT * FROM work_orders WHERE project_id = ?")
          .all(req.params.id);

        const wots = db
          .prepare(`
            SELECT w.*, 
                   COALESCE(i.name, 'Unassigned') as machine_name,
                   COALESCE(b.process_name, 'Process') as current_process_name
            FROM work_order_tickets w
            LEFT JOIN items i ON w.machine_id = i.id
            LEFT JOIN bill_of_processes b ON w.current_process_id = b.id
            WHERE w.project_id = ?
            ORDER BY w.created_at ASC
          `)
          .all(req.params.id);

        const recent_production_logs = db
          .prepare(`
            SELECT pl.*, 
                   COALESCE(i.name, 'N/A') as machine_name,
                   COALESCE(u.name, 'Operator') as user_name
            FROM production_logs pl
            LEFT JOIN items i ON pl.machine_id = i.id
            LEFT JOIN users u ON pl.user_id = u.id
            WHERE pl.project_id = ?
            ORDER BY pl.timestamp DESC
            LIMIT 10
          `)
          .all(req.params.id);

        const active_ndps = db
          .prepare(`
            SELECT n.*, i.name as machine_name, i.item_code as machine_code
            FROM ndps n
            LEFT JOIN items i ON n.affected_machine_id = i.id
            WHERE (n.status = 'ACTIVE' OR n.status = 'ACKNOWLEDGED')
              AND (
                n.affected_machine_id IN (
                  SELECT assigned_machine_id FROM bill_of_processes WHERE project_id = ?
                )
                OR n.affected_machine_id IN (
                  SELECT machine_id FROM work_order_tickets WHERE project_id = ?
                )
              )
          `)
          .all(req.params.id, req.params.id);

        const active_floor_requests = db
          .prepare(`
            SELECT fr.*, u.name as requester_name
            FROM floor_requests fr
            LEFT JOIN users u ON fr.requested_by = u.id
            WHERE fr.project_id = ? AND fr.status IN ('PENDING', 'ACKNOWLEDGED', 'IN_PROGRESS')
            ORDER BY fr.requested_at DESC
          `)
          .all(req.params.id);

        const manpower_assignments = db
          .prepare(`
            SELECT 
              pma.*, 
              pm.name as manpower_name, 
              pm.role_title, 
              pm.nik,
              pm.skill_level
            FROM production_manpower_assignments pma
            JOIN production_manpower pm ON pma.manpower_id = pm.id
            WHERE pma.project_id = ?
            ORDER BY pma.created_at DESC
          `)
          .all(req.params.id);

        let spk = null;
        if (project.spk_id) {
          spk = db.prepare("SELECT * FROM spks WHERE id = ?").get(project.spk_id) as any;
        } else if (project.spk_number) {
          spk = db.prepare("SELECT * FROM spks WHERE spk_number = ?").get(project.spk_number) as any;
        } else {
          spk = db.prepare("SELECT * FROM spks WHERE project_id = ?").get(project.id) as any;
        }

        let sibling_projects: any[] = [];
        if (spk) {
          sibling_projects = db
            .prepare("SELECT id, name, COALESCE(qty, 1) as qty, uom, status, spk_number FROM projects WHERE spk_id = ? OR id = ? OR spk_number = ?")
            .all(spk.id, spk.project_id, spk.spk_number) as any[];
        } else {
          sibling_projects = [{ id: project.id, name: project.name, qty: project.qty || 1, uom: project.uom || "Unit", status: project.status, spk_number: project.spk_number }];
        }

        let hpp_breakdown = null;
        try {
          hpp_breakdown = recalculateProjectFinancialSummary(db, projectId);
        } catch (hppErr) {
          console.warn("Could not calculate HPP breakdown for project:", hppErr);
        }

        res.json({
          project,
          spk,
          sibling_projects,
          tasks,
          bop,
          processes: bop,
          bopSteps,
          prs,
          bom,
          deliveries,
          fgs,
          invoices,
          quotation_items,
          work_orders,
          wots,
          recent_production_logs,
          active_ndps,
          active_floor_requests,
          manpower_assignments,
          hpp_breakdown,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch project details" });
      }
    });

    router.get("/api/projects/:id/manpower-assignments", (req, res) => {
      try {
        const { id } = req.params;

        // Clean up any historical duplicate active assignments
        try {
          db.prepare(`
            DELETE FROM production_manpower_assignments 
            WHERE project_id = ? 
              AND status NOT IN ('COMPLETED', 'CANCELLED')
              AND id NOT IN (
                SELECT MIN(id) 
                FROM production_manpower_assignments 
                WHERE project_id = ? AND status NOT IN ('COMPLETED', 'CANCELLED')
                GROUP BY manpower_id, COALESCE(station_id, ''), COALESCE(bop_id, ''), COALESCE(task_name, '')
              )
          `).run(id, id);
        } catch (e) {
          // ignore cleanup errors
        }

        const assignments = db
          .prepare(`
            SELECT 
              pma.*, 
              pm.name as manpower_name, 
              pm.role_title, 
              pm.nik,
              pm.skill_level,
              pm.phone,
              pm.status as operator_status
            FROM production_manpower_assignments pma
            JOIN production_manpower pm ON pma.manpower_id = pm.id
            WHERE pma.project_id = ?
            ORDER BY pma.created_at DESC
          `)
          .all(id);

        res.json(assignments);
      } catch (err: any) {
        console.error("Error fetching operator allocations:", err);
        res.status(500).json({ error: err.message });
      }
    });

    router.post("/api/projects/:id/manpower-assignments", (req, res) => {
      try {
        const { id } = req.params;
        const { manpower_id, task_name, bop_id, station_id, start_date, end_date, planned_hours, remarks, shift } = req.body;

        const mp = db.prepare(`SELECT * FROM production_manpower WHERE id = ?`).get(manpower_id) as any;
        if (!mp) {
          return res.status(404).json({ error: "Manpower not found" });
        }

        // Check Duplicate Assignment and Validate Sequential Lineage vs Parallel Conflict
        const existingAssignments = db.prepare(`
          SELECT pma.*, bop.process_name, bop.step_sequence, bop.id as bop_step_id, ps.station_name, ps.station_code
          FROM production_manpower_assignments pma
          LEFT JOIN bill_of_processes bop ON (pma.bop_id = bop.id OR (pma.bop_id IS NULL AND pma.task_name = bop.process_name AND bop.project_id = pma.project_id))
          LEFT JOIN project_stations ps ON pma.station_id = ps.id
          WHERE pma.project_id = ? AND pma.manpower_id = ? 
            AND pma.status NOT IN ('COMPLETED', 'CANCELLED')
        `).all(id, manpower_id) as any[];

        const anyActiveAssignment = db.prepare(`
          SELECT pma.*, ps.station_name, ps.station_code
          FROM production_manpower_assignments pma
          LEFT JOIN project_stations ps ON pma.station_id = ps.id
          WHERE pma.manpower_id = ? AND pma.status NOT IN ('COMPLETED', 'CANCELLED')
        `).get(manpower_id) as any;

        if (anyActiveAssignment) {
          const stepLabel = (anyActiveAssignment.station_code ? `${anyActiveAssignment.station_code} - ${anyActiveAssignment.station_name}` : null) || 
                            anyActiveAssignment.task_name || 
                            "stasiun lain";
          return res.status(400).json({ 
            error: `Operator "${mp.name}" sudah aktif ditugaskan pada "${stepLabel}". Tidak bisa ditugaskan ke stasiun/proses lain sebelum tugas sebelumnya diselesaikan.`
          });
        }

        // Validate Sequential Lineage (A -> B) vs Parallel Conflict (A // C)
        if (bop_id && existingAssignments.length > 0) {
          const allBopSteps = db.prepare(`SELECT * FROM bill_of_processes WHERE project_id = ?`).all(id) as any[];
          const existingBopIds = existingAssignments
            .map(a => a.bop_step_id || a.bop_id)
            .filter(Boolean);

          const validation = validateManpowerSequentialAssignment(bop_id, existingBopIds, allBopSteps);
          if (!validation.isValid) {
            return res.status(400).json({
              error: validation.message
            });
          }
        }

        const assignId = `asgn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const plannedHoursNum = Number(planned_hours) || 8;
        
        const runTx = db.transaction(() => {
          db.prepare(`
            INSERT INTO production_manpower_assignments (
              id, manpower_id, project_id, task_name, bop_id, station_id, shift,
              assigned_date, target_end_date, planned_hours, status, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?)
          `).run(
            assignId,
            manpower_id,
            id,
            task_name || "Production Operation",
            bop_id || null,
            station_id || null,
            shift || mp.shift || "SHIFT_1",
            start_date || new Date().toISOString().slice(0, 10),
            end_date || null,
            plannedHoursNum,
            remarks || null
          );

          // If linked to a BoP step or task, sync dates to BoP & Project Tasks for Gantt timeline
          if (bop_id) {
            db.prepare(`
              UPDATE bill_of_processes 
              SET start_date = COALESCE(?, start_date),
                  end_date = COALESCE(?, end_date),
                  standard_hours = CASE WHEN ? > 0 THEN ? ELSE standard_hours END
              WHERE id = ?
            `).run(start_date || null, end_date || null, plannedHoursNum, plannedHoursNum, bop_id);

            db.prepare(`
              UPDATE project_tasks 
              SET start_date = COALESCE(?, start_date),
                  end_date = COALESCE(?, end_date),
                  required_hours = CASE WHEN ? > 0 THEN ? ELSE required_hours END
              WHERE id = ? OR (project_id = ? AND task_name = ?)
            `).run(start_date || null, end_date || null, plannedHoursNum, plannedHoursNum, bop_id, id, task_name);
          } else if (task_name) {
            db.prepare(`
              UPDATE project_tasks 
              SET start_date = COALESCE(?, start_date),
                  end_date = COALESCE(?, end_date),
                  required_hours = CASE WHEN ? > 0 THEN ? ELSE required_hours END
              WHERE project_id = ? AND task_name = ?
            `).run(start_date || null, end_date || null, plannedHoursNum, plannedHoursNum, id, task_name);

            db.prepare(`
              UPDATE bill_of_processes 
              SET start_date = COALESCE(?, start_date),
                  end_date = COALESCE(?, end_date),
                  standard_hours = CASE WHEN ? > 0 THEN ? ELSE standard_hours END
              WHERE project_id = ? AND process_name = ?
            `).run(start_date || null, end_date || null, plannedHoursNum, plannedHoursNum, id, task_name);
          }
        });

        runTx();

        res.json({ success: true, assignment_id: assignId });
      } catch (err: any) {
        console.error("Error creating capacity plan:", err);
        res.status(500).json({ error: err.message });
      }
    });

    router.delete("/api/projects/:id/manpower-assignments/:assignmentId", (req, res) => {
      try {
        db.prepare("DELETE FROM production_manpower_assignments WHERE id = ?").run(req.params.assignmentId);

        res.json({ success: true });
      } catch (err: any) {
        console.error("Error deleting assignment:", err);
        res.status(500).json({ error: err.message });
      }
    });

    router.post("/api/projects/:id/tasks", (req, res) => {
      try {
        const project = db
          .prepare("SELECT status FROM projects WHERE id = ?")
          .get(req.params.id) as any;
        if (
          project &&
          (project.status === "FINISHED" || project.status === "CLOSED")
        ) {
          return res.status(400).json({
            error: "Cannot add task to a finished or closed project.",
          });
        }
        const { task_name, start_date, end_date, progress, status } = req.body;
        const taskId = "TSK-" + Math.random().toString(36).substr(2, 9);
        const sDate = start_date || new Date().toISOString().split("T")[0];
        const eDate = end_date || sDate;
        const insert = db.prepare(
          "INSERT INTO project_tasks (id, project_id, task_name, start_date, end_date, progress, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        );
        insert.run(
          taskId,
          req.params.id,
          task_name || "Task",
          sDate,
          eDate,
          progress || 0,
          status || "PENDING",
        );
        res.json({ success: true, id: taskId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add task" });
      }
    });

    router.put("/api/tasks/:id/progress", (req, res) => {
      try {
        const {
          progress,
          status,
          actual_start_date,
          actual_end_date,
          work_center_id,
          required_hours,
        } = req.body;
        const taskId = req.params.id;

        db.transaction(() => {
          const currentTask = db
            .prepare("SELECT * FROM project_tasks WHERE id = ?")
            .get(taskId) as any;
          if (!currentTask) return;

          let finalStartDate =
            actual_start_date !== undefined
              ? actual_start_date
              : currentTask.actual_start_date;
          let finalEndDate =
            actual_end_date !== undefined
              ? actual_end_date
              : currentTask.actual_end_date;

          let finalWorkCenter =
            work_center_id !== undefined
              ? work_center_id
              : currentTask.work_center_id;
          let finalRequiredHours =
            required_hours !== undefined
              ? required_hours
              : currentTask.required_hours;

          if (status === "IN_PROGRESS" && !finalStartDate) {
            finalStartDate = new Date().toISOString();
          }
          if (status === "COMPLETED" && !finalEndDate) {
            finalEndDate = new Date().toISOString();
            if (!finalStartDate) finalStartDate = new Date().toISOString(); // Fallback
          }

          let validWorkCenter: string | null = null;
          if (finalWorkCenter && typeof finalWorkCenter === "string" && finalWorkCenter.trim() !== "") {
            const wcCheck = db.prepare("SELECT id FROM work_centers WHERE id = ?").get(finalWorkCenter.trim()) as any;
            if (wcCheck) validWorkCenter = finalWorkCenter.trim();
          }

          db.prepare(
            "UPDATE project_tasks SET progress = ?, status = ?, actual_start_date = ?, actual_end_date = ?, work_center_id = ?, required_hours = ? WHERE id = ?",
          ).run(
            progress,
            status,
            finalStartDate,
            finalEndDate,
            validWorkCenter,
            finalRequiredHours || null,
            taskId,
          );

          // Auto-Archive Logic: If all tasks are completed, mark project as finished
          const task = db
            .prepare("SELECT project_id FROM project_tasks WHERE id = ?")
            .get(taskId) as any;
          if (task) {
            const allTasks = db
              .prepare("SELECT status FROM project_tasks WHERE project_id = ?")
              .all(task.project_id) as any[];
            if (
              allTasks.length > 0 &&
              allTasks.every((t) => t.status === "COMPLETED")
            ) {
              // Check if project is already finished to avoid redundant work
              const project = db
                .prepare("SELECT status FROM projects WHERE id = ?")
                .get(task.project_id) as any;
              if (project && project.status !== "FINISHED") {
                // We can't easily call another route handler, so we repeat the finish logic or trigger it
                db.prepare(
                  "UPDATE projects SET status = 'FINISHED' WHERE id = ?",
                ).run(task.project_id);

                // Release unconsumed allocated stock
                const uniqueItems = db
                  .prepare(
                    "SELECT DISTINCT item_id FROM boms WHERE project_id = ?",
                  )
                  .all(task.project_id) as { item_id: string }[];
                for (const { item_id } of uniqueItems) {
                  const allocResult = db
                    .prepare(
                      `
                  SELECT COALESCE(SUM(qty), 0) as total_alloc
                  FROM stock_movements
                  WHERE project_id = ? AND item_id = ? AND type IN ('ALLOCATION', 'GRN_ALLOCATION')
                `,
                    )
                    .get(task.project_id, item_id) as any;

                  const consumeResult = db
                    .prepare(
                      `
                  SELECT COALESCE(SUM(ABS(qty)), 0) as total_consumed
                  FROM stock_movements
                  WHERE project_id = ? AND item_id = ? AND type = 'CONSUMPTION'
                `,
                    )
                    .get(task.project_id, item_id) as any;

                  const remaining =
                    (allocResult.total_alloc || 0) -
                    (consumeResult.total_consumed || 0);
                  const projectAllocated = Math.max(0, remaining);
                  if (projectAllocated > 0) {
                    db.prepare(
                      "INSERT INTO stock_movements (id, item_id, project_id, type, qty, reference_id) VALUES (?, ?, ?, 'RELEASE', ?, ?)",
                    ).run(
                      "MOV-" + Math.random().toString(36).substr(2, 9),
                      item_id,
                      task.project_id,
                      projectAllocated,
                      "Auto-release on auto-archive",
                    );
                  }
                }
                logAudit(
                  null,
                  "AUTO_ARCHIVE",
                  "PROJECT",
                  task.project_id,
                  "Project automatically finished as all tasks are completed.",
                );
              }
            }
          }
        })();

        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update task" });
      }
    });

    router.get("/api/projects/:id/shortage-analysis", (req, res) => {
      try {
        const projectId = req.params.id;

        const project = db.prepare("SELECT bom_status, bop_status FROM projects WHERE id = ?").get(projectId) as any;
        if (!project) return res.status(404).json({ error: "Project not found" });
        if (project.bom_status !== 'AUTHORIZED') {
          // If BOM is not authorized, return empty array without triggering client error notifications
          return res.json([]);
        }

        // 1. Get BOM items for THIS project (factoring in project target quantity)
        const boms = db.prepare(`
        SELECT 
          b.id as bom_id,
          b.item_id, 
          i.item_code,
          i.name as item_name,
          b.dimension, 
          b.spec, 
          b.required_qty as unit_required_qty,
          COALESCE(p.qty, 1) as project_qty,
          (b.required_qty * COALESCE(p.qty, 1)) as required_qty,
          i.uom,
          COALESCE(bic.qty_consumed, 0) as consumed
        FROM boms b
        JOIN items i ON b.item_id = i.id
        JOIN projects p ON b.project_id = p.id
        LEFT JOIN bom_item_consumption bic ON b.id = bic.bom_id
        WHERE b.project_id = ?
      `).all(projectId) as any[];

      // calculate product node allocations
      const bops = db.prepare("SELECT * FROM bill_of_processes WHERE project_id = ? AND node_type = 'PRODUCT'").all(projectId) as any[];
      const bopAllocMap = new Map(); // bom_id -> total fraction
      bops.forEach(b => {
         let allocs = [];
         try { allocs = typeof b.bom_allocations === 'string' ? JSON.parse(b.bom_allocations) : b.bom_allocations || []; } catch(e){}
         allocs.forEach(a => {
            const current = bopAllocMap.get(a.bom_id) || 0;
            bopAllocMap.set(a.bom_id, current + (a.fraction || 1));
         });
      });
      

        // 2. Get Allocations for THIS project
        const projectAllocations = db
          .prepare(
            `
        SELECT item_id, SUM(qty) as total_alloc
        FROM stock_movements
        WHERE project_id = ? AND type IN ('ALLOCATION', 'GRN_ALLOCATION', 'GRN')
        GROUP BY item_id
      `,
          )
          .all(projectId) as any[];
        const projectAllocMap = new Map(
          projectAllocations.map((a) => [a.item_id, a.total_alloc]),
        );

        // 3. Get Active PRs/POs for THIS project
        const projectPrs = db
          .prepare(
            `
        SELECT pri.item_id, SUM(pri.qty) as total_pr_qty, GROUP_CONCAT(DISTINCT pr.pr_number) as pr_numbers
        FROM pr_items pri
        JOIN purchase_requests pr ON pri.pr_id = pr.id
        WHERE pr.project_id = ? AND pr.status != 'CANCELLED' AND pr.status != 'COMPLETED'
        GROUP BY pri.item_id
      `,
          )
          .all(projectId) as any[];
        const projectPrMap = new Map(
          projectPrs.map((p) => [
            p.item_id,
            { qty: p.total_pr_qty, numbers: p.pr_numbers },
          ]),
        );

        // 4. Calculate Net Available Stock
        if (boms.length === 0) return res.json([]);
        const itemIds = [...new Set(boms.map((b) => b.item_id))];
        const placeholders = itemIds.map(() => "?").join(",");

        // True Free Stock = Inventory Table Free Stock - (Sum of unmet dependencies of OTHER active projects)
        const inventory = db
          .prepare(
            `SELECT item_id, free_stock FROM inventory WHERE item_id IN (${placeholders})`,
          )
          .all(...itemIds) as any[];

        const otherCommitments = db
          .prepare(
            `
        SELECT item_id, SUM(qty) as allocated
        FROM stock_movements
        WHERE type IN ('ALLOCATION', 'GRN_ALLOCATION', 'GRN') AND project_id != ? AND project_id IS NOT NULL AND item_id IN (${placeholders})
        GROUP BY item_id
      `,
          )
          .all(projectId, ...itemIds) as any[];
        const otherCommitMap = new Map(
          otherCommitments.map((c) => [c.item_id, c.allocated]),
        );

        const invMap = new Map(
          inventory.map((i) => {
            const otherComm = otherCommitMap.get(i.item_id) || 0;
            return [i.item_id, Math.max(0, i.free_stock - otherComm)];
          }),
        );

        const analysis = boms.map((bom) => {
          const prData = projectPrMap.get(bom.item_id) || {
            qty: 0,
            numbers: null,
          };
          const pr_numbers = prData.numbers ? prData.numbers.split(",") : [];
          const stock = invMap.get(bom.item_id) || 0;
          const allocated = projectAllocMap.get(bom.item_id) || 0;

          const ordered = prData.qty;

          const remainingToBuild = calculateFractionalBomRemaining(db, projectId, bom.bom_id, bom.required_qty, bom.consumed, bom.project_qty, bom.unit_required_qty);

          // received_by_production is determined by what the warehouse has consumed via terminal ops for this project
          const receivedQty = bom.consumed || 0;

          // Shortage = Requirement - (What we have + What is coming for US + What is free to take + What is already received)
          const shortage = Math.max(
            0,
            remainingToBuild - (allocated + stock + ordered + receivedQty),
          );
          const can_allocate = Math.min(stock, shortage);

          const fractionAllocated = bopAllocMap.get(bom.bom_id) || 0;
          return {
            ...bom,
            allocated,
            ordered,
            pr_numbers,
            free_stock: stock,
            shortage,
            can_allocate,
            received_by_production: receivedQty,
            fraction_allocated: fractionAllocated,
          };
        });

        res.json(analysis);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch shortage analysis" });
      }
    });

    // SPK-Level MRP Shortage Analysis (Aggregates across all projects under 1 SPK)
    router.get("/api/spks/:id/shortage-analysis", (req, res) => {
      try {
        const spkId = req.params.id;

        const spk = db
          .prepare("SELECT * FROM spks WHERE id = ?")
          .get(spkId) as any;
        if (!spk) {
          return res.status(404).json({ error: "SPK not found" });
        }

        const projects = db
          .prepare(
            `
          SELECT p.id, p.name, COALESCE(p.qty, 1) as qty, p.uom, p.status, p.spk_id
          FROM projects p
          WHERE (p.spk_id = ? OR p.id = ?) AND p.bom_status = 'AUTHORIZED'
          ORDER BY p.name ASC
        `,
          )
          .all(spkId, spk.project_id) as any[];

        if (projects.length === 0) {
          return res.json({ spk, projects: [], items: [] });
        }

        const projectIds = projects.map((p) => p.id);
        const pPlaceholders = projectIds.map(() => "?").join(",");

        const bomRows = db
          .prepare(
            `
          SELECT 
            b.id as bom_id,
            b.project_id,
            p.name as project_name,
            COALESCE(p.qty, 1) as project_qty,
            COALESCE(p.uom, 'Unit') as project_uom,
            b.item_id,
            i.item_code,
            i.name as item_name,
            i.uom,
            b.dimension,
            b.spec,
            b.required_qty as unit_required_qty,
            (b.required_qty * COALESCE(p.qty, 1)) as total_required,
            COALESCE(
              (SELECT MIN(unit_price) FROM item_supplier_prices WHERE item_id = i.id),
              i.unit_price,
              b.unit_price,
              0
            ) as unit_price,
            COALESCE(bic.qty_consumed, 0) as consumed
          FROM boms b
          JOIN items i ON b.item_id = i.id
          JOIN projects p ON b.project_id = p.id
          LEFT JOIN bom_item_consumption bic ON b.id = bic.bom_id
          WHERE b.project_id IN (${pPlaceholders})
          ORDER BY i.item_code ASC
        `,
          )
          .all(...projectIds) as any[];

        if (bomRows.length === 0) {
          return res.json({ spk, projects, items: [] });
        }

        const itemIds = [...new Set(bomRows.map((b) => b.item_id))];
        const itemPlaceholders = itemIds.map(() => "?").join(",");

        const inventory = db
          .prepare(
            `SELECT item_id, free_stock FROM inventory WHERE item_id IN (${itemPlaceholders})`,
          )
          .all(...itemIds) as any[];
        const invMap = new Map(
          inventory.map((i) => [i.item_id, i.free_stock || 0]),
        );

        const allocations = db
          .prepare(
            `
          SELECT item_id, SUM(qty) as total_alloc
          FROM stock_movements
          WHERE project_id IN (${pPlaceholders}) AND type IN ('ALLOCATION', 'GRN_ALLOCATION', 'GRN')
          GROUP BY item_id
        `,
          )
          .all(...projectIds) as any[];
        const allocMap = new Map(
          allocations.map((a) => [a.item_id, a.total_alloc]),
        );

        const prs = db
          .prepare(
            `
          SELECT pri.item_id, SUM(pri.qty) as total_pr_qty, GROUP_CONCAT(DISTINCT pr.pr_number) as pr_numbers
          FROM pr_items pri
          JOIN purchase_requests pr ON pri.pr_id = pr.id
          WHERE (pr.project_id IN (${pPlaceholders}) OR pr.spk_id = ?) AND pr.status != 'CANCELLED' AND pr.status != 'COMPLETED'
          GROUP BY pri.item_id
        `,
          )
          .all(...projectIds, spkId) as any[];
        const prMap = new Map(
          prs.map((p) => [
            p.item_id,
            { qty: p.total_pr_qty, numbers: p.pr_numbers },
          ]),
        );

        const aggregatedMap = new Map<string, any>();

        for (const row of bomRows) {
          if (!aggregatedMap.has(row.item_id)) {
            aggregatedMap.set(row.item_id, {
              item_id: row.item_id,
              item_code: row.item_code,
              item_name: row.item_name,
              uom: row.uom,
              dimension: row.dimension,
              spec: row.spec,
              unit_price: row.unit_price,
              total_required: 0,
              total_consumed: 0,
              project_breakdown: [] as any[],
            });
          }

          const item = aggregatedMap.get(row.item_id);
          const trueRemaining = calculateFractionalBomRemaining(db, row.project_id, row.bom_id, row.total_required, row.consumed, row.project_qty, row.unit_required_qty);
          item.total_required += Number(row.total_required);
          item.total_consumed += Number(row.consumed);
          item.true_remaining = (item.true_remaining || 0) + trueRemaining;
          item.project_breakdown.push({
            project_id: row.project_id,
            project_name: row.project_name,
            project_qty: row.project_qty,
            project_uom: row.project_uom,
            unit_required_qty: row.unit_required_qty,
            required_qty: row.total_required,
            consumed: row.consumed,
          });
        }

        const items = Array.from(aggregatedMap.values()).map((item) => {
          const stock = invMap.get(item.item_id) || 0;
          const allocated = allocMap.get(item.item_id) || 0;
          const prData = prMap.get(item.item_id) || { qty: 0, numbers: null };
          const ordered = prData.qty;
          const pr_numbers = prData.numbers ? prData.numbers.split(",") : [];

          const remainingToBuild = item.true_remaining !== undefined ? item.true_remaining : Math.max(0, item.total_required - item.total_consumed);
          const shortage = Math.max(
            0,
            remainingToBuild - (allocated + stock + ordered),
          );
          const can_allocate = Math.min(stock, shortage);

          return {
            ...item,
            free_stock: stock,
            allocated,
            ordered,
            pr_numbers,
            shortage,
            can_allocate,
            qty_to_order: shortage,
          };
        });

        res.json({
          spk,
          projects,
          items,
        });
      } catch (error: any) {
        console.error(error);
        res.status(500).json({
          error: "Failed to fetch SPK shortage analysis",
          details: error.message,
        });
      }
    });

    // SPK-Level Bulk PR Generation (Consolidated for all projects in the SPK)
    router.post(
      "/api/spks/:id/generate-prs",
      requireRole(["PRODUCTION", "ENGINEERING", "WAREHOUSE"]),
      (req, res) => {
        try {
          const spkId = req.params.id;
          const {
            items: customItems,
            item_expected_dates = {},
            expected_delivery_date,
            drawing_reference,
            urgency,
            category,
          } = req.body || {};

          const spk = db
            .prepare("SELECT * FROM spks WHERE id = ?")
            .get(spkId) as any;
          if (!spk) {
            return res.status(404).json({ error: "SPK not found" });
          }

          const projects = db
            .prepare(
              `
            SELECT id, name, COALESCE(qty, 1) as qty, bom_status, bop_status FROM projects WHERE spk_id = ? OR id = ?
          `,
            )
            .all(spkId, spk.project_id) as any[];

          if (projects.length === 0) {
            return res
              .status(400)
              .json({ error: "No projects found under this SPK" });
          }

          const unauthorizedProjects = projects.filter(p => p.bom_status !== 'AUTHORIZED');
          if (unauthorizedProjects.length > 0) {
             const names = unauthorizedProjects.map(p => p.name).join(", ");
             return res.status(400).json({ error: `Cannot generate PRs. The following projects are missing BOM authorization: ${names}` });
          }

          const primaryProjectId = spk.project_id || projects[0].id;
          const projectIds = projects.map((p) => p.id);
          const pPlaceholders = projectIds.map(() => "?").join(",");

          const transaction = db.transaction(() => {
            let prId = null;
            let prNumber = null;
            let itemsToPr: any[] = [];

            if (Array.isArray(customItems) && customItems.length > 0) {
              itemsToPr = customItems.filter(
                (it: any) => Number(it.qty_to_order) > 0,
              );
            } else {
              const rawBomRows = db
                .prepare(
                  `
                SELECT 
                  b.id as bom_id,
                  b.project_id,
                  b.item_id,
                  b.dimension,
                  b.spec,
                  COALESCE(i.unit_price, b.unit_price, 0) as unit_price,
                  b.required_qty as unit_required_qty,
                  COALESCE(p.qty, 1) as project_qty,
                  (b.required_qty * COALESCE(p.qty, 1)) as total_required,
                  COALESCE(bic.qty_consumed, 0) as consumed
                FROM boms b
                JOIN items i ON b.item_id = i.id
                JOIN projects p ON b.project_id = p.id
                LEFT JOIN bom_item_consumption bic ON b.id = bic.bom_id
                WHERE b.project_id IN (${pPlaceholders})
              `,
                )
                .all(...projectIds) as any[];
                
              const aggregatedBomMap = new Map();
              for (const r of rawBomRows) {
                 const trueRemaining = calculateFractionalBomRemaining(db, r.project_id, r.bom_id, r.total_required, r.consumed, r.project_qty, r.unit_required_qty);
                 if (!aggregatedBomMap.has(r.item_id)) {
                    aggregatedBomMap.set(r.item_id, {
                       item_id: r.item_id,
                       dimension: r.dimension,
                       spec: r.spec,
                       unit_price: r.unit_price,
                       total_required: 0,
                       total_consumed: 0,
                       true_remaining: 0
                    });
                 }
                 const agg = aggregatedBomMap.get(r.item_id);
                 agg.total_required += r.total_required;
                 agg.total_consumed += r.consumed;
                 agg.true_remaining += trueRemaining;
              }
              const bomRows = Array.from(aggregatedBomMap.values());

              const itemIds = bomRows.map((b) => b.item_id);
              let invMap = new Map();
              if (itemIds.length > 0) {
                const placeholders = itemIds.map(() => "?").join(",");
                const inventory = db
                  .prepare(
                    `SELECT item_id, free_stock FROM inventory WHERE item_id IN (${placeholders})`,
                  )
                  .all(...itemIds) as any[];
                invMap = new Map(
                  inventory.map((i) => [i.item_id, i.free_stock || 0]),
                );
              }

              const activeSupply = db
                .prepare(
                  `
                SELECT item_id, SUM(qty) as total_qty FROM (
                  SELECT pri.item_id, pri.qty 
                  FROM pr_items pri
                  JOIN purchase_requests pr ON pri.pr_id = pr.id
                  WHERE (pr.project_id IN (${pPlaceholders}) OR pr.spk_id = ?) AND pr.status IN ('DRAFTED', 'AUTHORIZED') AND pri.po_id IS NULL
                  UNION ALL
                  SELECT pri.item_id, pri.qty
                  FROM pr_items pri
                  JOIN purchase_requests pr ON pri.pr_id = pr.id
                  JOIN purchase_orders po ON pri.po_id = po.id
                  WHERE (pr.project_id IN (${pPlaceholders}) OR pr.spk_id = ?) AND po.archived = 0 AND po.status IN ('ISSUED', 'PARTIAL')
                ) GROUP BY item_id
              `,
                )
                .all(...projectIds, spkId, ...projectIds, spkId) as any[];
              const supplyMap = new Map(
                activeSupply.map((s) => [s.item_id, s.total_qty]),
              );

              for (const bom of bomRows) {
                const required = bom.total_required;
                const consumed = bom.total_consumed;
                const trueRemaining = bom.true_remaining;
                const stock = invMap.get(bom.item_id) || 0;
                const pipeSupply = supplyMap.get(bom.item_id) || 0;

                const remainingToBuild = trueRemaining !== undefined ? trueRemaining : Math.max(0, required - consumed);
                const shortage = Math.max(
                  0,
                  remainingToBuild - (stock + pipeSupply),
                );

                const stockToAllocate = Math.min(
                  stock,
                  Math.max(0, remainingToBuild - pipeSupply),
                );
                if (stockToAllocate > 0) {
                  const info = db
                    .prepare(
                      "UPDATE inventory SET free_stock = free_stock - ?, allocated_stock = COALESCE(allocated_stock, 0) + ? WHERE item_id = ? AND free_stock >= ?",
                    )
                    .run(
                      stockToAllocate,
                      stockToAllocate,
                      bom.item_id,
                      stockToAllocate,
                    );

                  if (info.changes > 0) {
                    const movId =
                      "MOV-" + Math.random().toString(36).substr(2, 9);
                    db.prepare(
                      "INSERT INTO stock_movements (id, item_id, project_id, type, qty, recorded_by) VALUES (?, ?, ?, 'ALLOCATION', ?, 'SYSTEM_SPK_MRP')",
                    ).run(movId, bom.item_id, primaryProjectId, stockToAllocate);
                    // **LIVE STOCK RESERVATION ENGINE**
                    const resId = "RES-" + Math.random().toString(36).substr(2, 9);
                    db.prepare(
                      "INSERT INTO inventory_reservations (id, item_id, project_id, spk_id, qty, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')"
                    ).run(resId, bom.item_id, primaryProjectId, spkId, stockToAllocate);


                    const labelId =
                      "LBL-" + Math.random().toString(36).substr(2, 9);
                    db.prepare(
                      "INSERT INTO inventory_labels (id, item_id, grn_id, original_qty, current_qty, project_id) VALUES (?, ?, NULL, ?, ?, ?)",
                    ).run(
                      labelId,
                      bom.item_id,
                      stockToAllocate,
                      stockToAllocate,
                      primaryProjectId,
                    );
                  } else {
                     throw new Error(`Concurrency error: Not enough stock to allocate for item ${bom.item_id}. Please refresh and try again.`);
                  }
                }

                  // Note: SPK authorization allocates free stock to project.
                  // Shortages are tracked in Procurement Waves / Shortage Analysis without auto-generating draft PRs.
              }
            }

            if (itemsToPr.length > 0) {
              prId = "PR-" + Math.random().toString(36).substr(2, 9);
              prNumber =
                "PR-" +
                new Date().getFullYear() +
                "-" +
                Math.floor(100000 + Math.random() * 900000);

              let deliveryDateStr = expected_delivery_date;
              if (!deliveryDateStr) {
                const d = new Date();
                d.setDate(d.getDate() + 14);
                deliveryDateStr = d.toISOString().split("T")[0];
              }

              db.prepare(
                "INSERT INTO purchase_requests (id, pr_number, project_id, spk_id, drawing_reference, status, urgency, category) VALUES (?, ?, ?, ?, ?, 'DRAFTED', ?, ?)",
              ).run(
                prId,
                prNumber,
                primaryProjectId,
                spkId,
                drawing_reference ||
                  `Bulk PR for SPK ${spk.spk_number || spk.title}`,
                urgency || "NORMAL",
                category || "PROJECT",
              );

              const insertPrItem = db.prepare(
                "INSERT INTO pr_items (id, pr_id, item_id, dimension, spec, qty, unit_price, expected_delivery_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              );

              for (const item of itemsToPr) {
                insertPrItem.run(
                  "PRI-" + Math.random().toString(36).substr(2, 9),
                  prId,
                  item.item_id,
                  item.dimension || null,
                  item.spec || null,
                  item.qty_to_order,
                  item.unit_price || 0,
                  item.expected_delivery_date || null,
                );
              }

              // Also create a Gantt task on primary project for material tracking
              const taskId = "TSK-" + Math.random().toString(36).substr(2, 9);
              db.prepare(
                "INSERT INTO project_tasks (id, project_id, task_name, start_date, end_date, progress, status, pr_id) VALUES (?, ?, ?, ?, ?, 0, 'PENDING', ?)",
              ).run(
                taskId,
                primaryProjectId,
                `SPK Material Procurement (${spk.spk_number || "Bulk"})`,
                new Date().toISOString().split("T")[0],
                deliveryDateStr,
                prId,
              );
            }

            return {
              success: true,
              pr_created: itemsToPr.length > 0,
              pr_number: prNumber,
              pr_id: prId,
              spk_number: spk.spk_number,
            };
          });

          const result = transaction();
          res.json(result);
        } catch (error: any) {
          console.error(error);
          res.status(500).json({
            error: error.message || "Failed to generate SPK Bulk PR",
          });
        }
      },
    );

    router.get("/api/projects/:id/work-orders", (req, res) => {
      try {
        const wos = db
          .prepare(
            `
        SELECT wo.*, 
          (SELECT COUNT(*) FROM work_order_items WHERE wo_id = wo.id) as item_count
        FROM work_orders wo
        WHERE wo.project_id = ?
        ORDER BY wo.created_at DESC
      `,
          )
          .all(req.params.id);
        res.json(wos);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch work orders" });
      }
    });

    router.post("/api/projects/:id/work-orders", (req, res) => {
      try {
        const projectId = req.params.id;
        const project = db
          .prepare("SELECT status FROM projects WHERE id = ?")
          .get(projectId) as any;
        if (
          project &&
          (project.status === "FINISHED" || project.status === "CLOSED")
        ) {
          return res.status(400).json({
            error: "Cannot create Work Order for a finished or closed project.",
          });
        }

        const { items } = req.body; // Array of { bom_id, qty_to_consume }

        const woId = "WO-" + Math.random().toString(36).substr(2, 9);
        const woNumber =
          "WO-" +
          new Date().getFullYear() +
          "-" +
          Math.floor(100000 + Math.random() * 900000);

        db.transaction(() => {
          db.prepare(
            "INSERT INTO work_orders (id, wo_number, project_id, status) VALUES (?, ?, ?, 'DRAFT')",
          ).run(woId, woNumber, projectId);

          const insertItem = db.prepare(
            "INSERT INTO work_order_items (id, wo_id, bom_id, qty_to_consume) VALUES (?, ?, ?, ?)",
          );
          for (const item of items) {
            insertItem.run(
              "WOI-" + Math.random().toString(36).substr(2, 9),
              woId,
              item.bom_id,
              item.qty_to_consume,
            );
          }
        })();

        res.json({ success: true, wo_id: woId, wo_number: woNumber });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to create work order" });
      }
    });

    router.post(
      "/api/projects/:id/generate-prs",
      requireRole(["ENGINEERING", "FC"]),
      (req, res) => {
        try {
          const projectId = req.params.id;
          const project = db
            .prepare("SELECT status, bom_status, bop_status FROM projects WHERE id = ?")
            .get(projectId) as any;
          if (!project) return res.status(404).json({ error: "Project not found" });
          if (
            project.status === "FINISHED" || project.status === "CLOSED"
          ) {
            return res.status(400).json({
              error: "Cannot generate PRs for a finished or closed project.",
            });
          }
          if (project.bom_status !== 'AUTHORIZED') {
            return res.status(400).json({ error: "Cannot generate PR: Bill of Materials (BOM) is not authorized." });
          }

          const {
            expected_delivery_date,
            drawing_reference,
            items: customItems,
            item_expected_dates = {},
            urgency,
            category,
            remarks,
            wave_number,
          } = req.body || {};

          const projectInfo = db
            .prepare("SELECT spk_id FROM projects WHERE id = ?")
            .get(projectId) as any;

          const transaction = db.transaction(() => {
            let prId = null;
            let prNumber = null;
            let itemsToPr = [];

            // Always evaluate existing allocations/stock for auto-allocation
            const boms = db
              .prepare(
                `
          SELECT 
            b.item_id, 
            MAX(b.dimension) as dimension, 
            MAX(b.spec) as spec, 
            MAX(i.unit_price) as unit_price,
            SUM(b.required_qty * COALESCE(p.qty, 1)) as total_required,
            COALESCE(SUM(bic.qty_consumed), 0) as total_consumed
          FROM boms b
          JOIN items i ON b.item_id = i.id
          JOIN projects p ON b.project_id = p.id
          LEFT JOIN bom_item_consumption bic ON b.id = bic.bom_id
          WHERE b.project_id = ?
          GROUP BY b.item_id
        `,
              )
              .all(projectId) as any[];

            let invMap = new Map();
            if (boms.length > 0) {
              const itemIds = [...new Set(boms.map((b) => b.item_id))];
              const placeholders = itemIds.map(() => "?").join(",");
              const inventory = db
                .prepare(
                  `SELECT item_id, free_stock FROM inventory WHERE item_id IN (${placeholders})`,
                )
                .all(...itemIds) as any[];
              invMap = new Map(inventory.map((i) => [i.item_id, i.free_stock]));
            }

            // FIX: Account for item_id specifically ordered for THIS project in current PRs or POs
            const currentProjectSupply = db
              .prepare(
                `
          SELECT item_id, SUM(qty) as total_qty FROM (
            SELECT pri.item_id, pri.qty 
            FROM pr_items pri
            JOIN purchase_requests pr ON pri.pr_id = pr.id
            WHERE pr.project_id = ? AND pr.status IN ('DRAFTED', 'AUTHORIZED') AND pri.po_id IS NULL
            UNION ALL
            SELECT pri.item_id, pri.qty
            FROM pr_items pri
            JOIN purchase_requests pr ON pri.pr_id = pr.id
            JOIN purchase_orders po ON pri.po_id = po.id
            WHERE pr.project_id = ? AND po.archived = 0 AND po.status IN ('ISSUED', 'PARTIAL')
          ) GROUP BY item_id
        `,
              )
              .all(projectId, projectId) as any[];
            const projectSupplyMap = new Map(
              currentProjectSupply.map((s) => [s.item_id, s.total_qty]),
            );

            if (Array.isArray(customItems) && customItems.length > 0) {
              itemsToPr = customItems.filter((it) => it.qty_to_order > 0);
            } else {
              // Automatic logic
              for (const bom of boms) {
                const required = bom.total_required;
                const consumed = bom.total_consumed;
                const trueRemaining = bom.true_remaining;
                const stock = invMap.get(bom.item_id) || 0;
                const pipeSupply = projectSupplyMap.get(bom.item_id) || 0;

                const remainingToBuild = typeof trueRemaining !== 'undefined' ? trueRemaining : Math.max(0, required - consumed);

                // Shortage is remaining need minus (free stock + what we already have in pipe for this project)
                let shortage = Math.max(
                  0,
                  remainingToBuild - (stock + pipeSupply),
                );

                // ATOMIC LOCK FIX: allocate the free stock we are assuming to use!
                const stockToAllocate = Math.min(stock, Math.max(0, remainingToBuild - pipeSupply));
                if (stockToAllocate > 0) {
                  const info = db.prepare(
                    "UPDATE inventory SET free_stock = free_stock - ?, allocated_stock = COALESCE(allocated_stock, 0) + ? WHERE item_id = ? AND free_stock >= ?"
                  ).run(stockToAllocate, stockToAllocate, bom.item_id, stockToAllocate);
                  
                  if (info.changes === 0) {
                    throw new Error(`Insufficient stock for allocation of item ${bom.item_id}`);
                  }
                  
                  // Create stock movement to track this allocation
                  const movId = "MOV-" + Math.random().toString(36).substr(2, 9);
                  db.prepare(
                    "INSERT INTO stock_movements (id, item_id, project_id, type, qty, recorded_by) VALUES (?, ?, ?, 'ALLOCATION', ?, 'SYSTEM_MRP')"
                  ).run(movId, bom.item_id, projectId, stockToAllocate);
                  
                  // Also create a label so that it can be consumed properly later
                  const labelId = "LBL-" + Math.random().toString(36).substr(2, 9);
                  db.prepare(
                    "INSERT INTO inventory_labels (id, item_id, grn_id, original_qty, current_qty, project_id) VALUES (?, ?, NULL, ?, ?, ?)"
                  ).run(labelId, bom.item_id, stockToAllocate, stockToAllocate, projectId);
                }

                if (shortage > 0) {
                  itemsToPr.push({
                    item_id: bom.item_id,
                    dimension: bom.dimension,
                    spec: bom.spec,
                    unit_price: bom.unit_price,
                    qty_to_order: shortage,
                    target_project_id: bom.target_project_id,
                    expected_delivery_date:
                      item_expected_dates[bom.item_id] ||
                      expected_delivery_date,
                  });
                }
              }
            }

            if (itemsToPr.length > 0) {
              prId = "PR-" + Math.random().toString(36).substr(2, 9);
              prNumber =
                "PR-" +
                new Date().getFullYear() +
                "-" +
                Math.floor(100000 + Math.random() * 900000);

              let deliveryDateStr = expected_delivery_date;
              if (!deliveryDateStr) {
                const d = new Date();
                d.setDate(d.getDate() + 14);
                deliveryDateStr = d.toISOString().split("T")[0];
              }

              const finalRemarks = remarks || (wave_number ? `Procurement Wave ${wave_number}` : null);
              db.prepare(
                "INSERT INTO purchase_requests (id, pr_number, project_id, spk_id, drawing_reference, status, urgency, category, remarks, expected_delivery_date) VALUES (?, ?, ?, ?, ?, 'DRAFTED', ?, ?, ?, ?)",
              ).run(
                prId,
                prNumber,
                projectId,
                projectInfo?.spk_id || null,
                drawing_reference || null,
                urgency || "NORMAL",
                category || "PROJECT",
                finalRemarks,
                deliveryDateStr,
              );

              if (urgency === "URGENT" || urgency === "CRITICAL") {
                const threadId = "THREAD-GENERAL";
                const msgId = "SYS-" + Math.random().toString(36).substr(2, 9);
                const projectName = db
                  .prepare("SELECT name FROM projects WHERE id = ?")
                  .get(projectId) as { name: string };
                db.prepare(
                  "INSERT INTO chat_messages (id, thread_id, sender_username, content) VALUES (?, ?, ?, ?)",
                ).run(
                  msgId,
                  threadId,
                  "SYSTEM",
                  `⚠️ **Urgent Procurement Alert!** ⚠️**Urgency:** 🚨 ${urgency}**Project:** 🏗️ ${projectName?.name || "Unknown"}**PR Number:** 📜 ${prNumber}Immediate attention required! ⚡`,
                );
              }

              const insertPrItem = db.prepare(
                "INSERT INTO pr_items (id, pr_id, item_id, dimension, spec, qty, unit_price, expected_delivery_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              );
              const insertTask = db.prepare(
                "INSERT INTO project_tasks (id, project_id, task_name, start_date, end_date, progress, status, pr_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              );

              for (const item of itemsToPr) {
                insertPrItem.run(
                  "PRI-" + Math.random().toString(36).substr(2, 9),
                  prId,
                  item.item_id,
                  item.dimension || null,
                  item.spec || null,
                  item.qty_to_order,
                  item.unit_price || 0,
                  item.expected_delivery_date || null,
                );
              }

              // Generate Gantt tasks
              if (!["CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(projectId)) {
                const todayStr = new Date().toISOString().split("T")[0];
                const itemsWithDeliveries = itemsToPr.filter(
                  (i) => i.expected_delivery_date,
                );

                if (itemsWithDeliveries.length > 0) {
                  const deliveryGroups = new Map();
                  for (const i of itemsWithDeliveries) {
                    if (!deliveryGroups.has(i.expected_delivery_date))
                      deliveryGroups.set(i.expected_delivery_date, []);
                    deliveryGroups.get(i.expected_delivery_date).push(i);
                  }

                  for (const [date, grp] of deliveryGroups.entries()) {
                    const taskId =
                      "TSK-" + Math.random().toString(36).substr(2, 9);
                    // Fetch item code for task name
                    let names = [];
                    for (const g of grp) {
                      const itm = db
                        .prepare("SELECT item_code FROM items WHERE id = ?")
                        .get(g.item_id) as any;
                      if (itm) names.push(itm.item_code);
                    }
                    let details = names.join(", ");
                    if (details.length > 40)
                      details = details.substring(0, 37) + "...";
                    insertTask.run(
                      taskId,
                      projectId,
                      `Materials: ${details}`,
                      todayStr,
                      date,
                      0,
                      "PENDING",
                      prId,
                    );
                  }
                } else {
                  const taskId =
                    "TSK-" + Math.random().toString(36).substr(2, 9);
                  insertTask.run(
                    taskId,
                    projectId,
                    `Material Procurement (PR Generated)`,
                    todayStr,
                    deliveryDateStr,
                    0,
                    "PENDING",
                    prId,
                  );
                }
              }
            }

            return {
              success: true,
              pr_created: itemsToPr.length > 0,
              pr_number: prNumber,
            };
          });

          const result = transaction();
          res.json(result);
        } catch (error: any) {
          console.error(error);
          res
            .status(500)
            .json({ error: error.message || "Failed to generate PRs" });
        }
      },
    );

    router.post(
      "/api/projects/:id/finish",
      requireRole(["ENGINEERING", "PRODUCTION", "WAREHOUSE", "FC", "ADMIN", "SUPERADMIN", "DIRECTOR", "BOD"]),
      (req, res) => {
        try {
          const projectId = req.params.id;
          
          const project: any = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
          if (!project) return res.status(404).json({ error: "Project not found" });

          let itemId = null;
          let totalQty = project.qty || 1;
          const isGeneral = ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"].includes(projectId);
          const fgCode = `FG-${project.id}`;
          const fgName = `[FG] ${project.name}`;
          const firstUom = project.uom || "Unit";
          const fgrNumber = `FGR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${project.spk_number || project.id.slice(-6)}`;
          const fgrId = `fgr_${Date.now()}`;
          const sn = `SN-${Date.now().toString().slice(-6)}`;

          const transaction = db.transaction(() => {
            // 1. Mark all BoP process steps as completed
            db.prepare(`
              UPDATE bill_of_processes
              SET status = 'COMPLETED', progress = 100, actual_end_date = COALESCE(actual_end_date, CURRENT_TIMESTAMP)
              WHERE project_id = ? AND status != 'COMPLETED'
            `).run(projectId);

            // Auto-resolve any active downtime notices
            db.prepare(`
              UPDATE notice_to_down_processes
              SET status = 'RESOLVED', resumed_at = CURRENT_TIMESTAMP
              WHERE project_id = ? AND status = 'ACTIVE'
            `).run(projectId);

            // 2. Update Project Status & Auto-Archive
            db.prepare(
              "UPDATE projects SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, archived_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(projectId);

            // 3. Automagically transition related undelivered delivery notes to DELIVERED status for billing readiness
            db.prepare(
              "UPDATE delivery_notes SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP WHERE project_id = ? AND status != 'DELIVERED'",
            ).run(projectId);
            
            // 4. Auto-create FG if applicable
            if (!isGeneral) {
              const existingItem = db.prepare("SELECT * FROM items WHERE item_code = ?").get(fgCode) as any;
              
              if (!existingItem) {
                itemId = "ITM-" + crypto.randomUUID();
                db.prepare(
                  "INSERT INTO items (id, item_code, name, spec, uom, type, category, min_stock, max_stock, description) VALUES (?, ?, ?, ?, ?, 'FINISHED', 'MANUFACTURED_FG', 1, 100, ?)",
                ).run(
                  itemId,
                  fgCode,
                  fgName,
                  `Finished Good for Project ${project.name}`,
                  firstUom,
                  `Manufactured Finish Good from SPK ${project.spk_number || project.id}`
                );
                db.prepare(
                  "INSERT INTO inventory (item_id, physical_qty, free_stock, allocated_stock, available_qty) VALUES (?, ?, ?, 0, ?) ON CONFLICT(item_id) DO UPDATE SET physical_qty = physical_qty + excluded.physical_qty, free_stock = free_stock + excluded.free_stock, available_qty = available_qty + excluded.available_qty",
                ).run(itemId, totalQty, totalQty, totalQty);
              } else {
                itemId = existingItem.id;
                db.prepare(
                  "UPDATE inventory SET physical_qty = physical_qty + ?, free_stock = free_stock + ?, available_qty = available_qty + ? WHERE item_id = ?",
                ).run(totalQty, totalQty, totalQty, itemId);
              }

              db.prepare(
                "INSERT INTO stock_movements (id, item_id, type, qty, reference_id, project_id) VALUES (?, ?, ?, ?, ?, ?)",
              ).run(
                "SMV-" + crypto.randomUUID(),
                itemId,
                "ADJUSTMENT",
                totalQty,
                project.id,
                project.id,
              );

              // 5. Ensure FGR table and insert record
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
                  INSERT OR REPLACE INTO finish_good_records (
                    id, fgr_number, project_id, item_code, item_name, serial_number,
                    quantity, uom, status, notes, inspected_by, target_warehouse
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?)
                `).run(
                  fgrId,
                  fgrNumber,
                  projectId,
                  fgCode,
                  fgName,
                  sn,
                  totalQty,
                  firstUom,
                  `Finished Good handover from Project ${project.name}`,
                  (req.headers["x-user-email"] as string) || "Production Manager",
                  "WAREHOUSE_FG_1"
                );
              } catch (fgrErr) {
                console.error("Error saving FGR:", fgrErr);
              }
              
              const userEmailHeader = req.headers["x-user-email"];
              const userEmailStr = Array.isArray(userEmailHeader) ? userEmailHeader[0] : userEmailHeader;
              logAudit(
                userEmailStr || "SYSTEM",
                "RECORD_FINISHED_GOOD",
                "PROJECT",
                project.id,
                `Recorded ${totalQty} ${firstUom} as Finished Good for project ${project.id}`,
              );
            }

            logAudit(
              null,
              "FINISH_PROJECT",
              "PROJECT",
              projectId,
              "Project finished, archived, and related delivery notes updated to DELIVERED status.",
            );
          });

          transaction();
          res.json({ 
            success: true, 
            item_id: itemId, 
            qty: totalQty, 
            fg_code: fgCode,
            fgr_number: fgrNumber,
            fgr: {
              id: fgrId,
              fgr_number: fgrNumber,
              item_code: fgCode,
              item_id: itemId,
              quantity: totalQty,
              uom: firstUom,
              serial_number: sn
            }
          });
        } catch (error: any) {
          console.error(error);
          res.status(500).json({ error: error.message || "Failed to finish project" });
        }
      },
    );

    router.post(
      "/api/projects/:id/archive",
      requireRole(["ENGINEERING", "FC", "SALES", "PRODUCTION", "WAREHOUSE", "PURCHASING", "BOD", "ADMIN"]),
      (req, res) => {
        try {
          const projectId = req.params.id;
          const project = db
            .prepare("SELECT * FROM projects WHERE id = ?")
            .get(projectId) as any;
          if (!project)
            return res.status(404).json({ error: "Project not found" });

          db.prepare(
            "UPDATE projects SET archived_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(projectId);

          logAudit(
            (req.headers["x-user-email"] as string) || (req as any).userName || "System",
            "ARCHIVE_PROJECT",
            "PROJECT",
            projectId,
            "Project manually archived.",
          );
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to archive project" });
        }
      },
    );

    router.post(
      "/api/projects",
      requireRole(["SALES", "FC"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        if (userRole !== "FC" && userRole !== "SALES") {
          return res.status(403).json({
            error:
              "Access denied. Only Sales or FC accounts can create Projects.",
          });
        }
        try {
          const {
            id,
            name,
            due_date,
            customer,
            remarks,
            tasks,
            parent_project_id,
            urgency,
            quotation_id,
          } = req.body;

          if (!quotation_id) {
            return res.status(400).json({
              error: "Quotation reference is required to create a project",
            });
          }
          const quotation = db
            .prepare("SELECT * FROM quotations WHERE id = ?")
            .get(quotation_id) as any;
          if (!quotation) {
            return res
              .status(400)
              .json({ error: "Referenced Quotation not found" });
          }

          if (quotation.status !== "APPROVED" && quotation.status !== "AUTHORIZED") {
            return res
              .status(400)
              .json({ error: "Referenced Quotation is not APPROVED or AUTHORIZED yet" });
          }

          if (checkQuotationExpired(quotation)) {
            db.prepare(
              "UPDATE quotations SET status = 'EXPIRED' WHERE id = ?",
            ).run(quotation_id);
            return res.status(400).json({
              error:
                "Referenced Quotation has expired and is no longer valid for project creation",
            });
          }

          const customerObj = db
            .prepare("SELECT name FROM customers WHERE id = ?")
            .get(quotation.customer_id) as any;
          const finalCustomer =
            customerObj?.name || customer || quotation.customer_id;

          let projectId =
            id?.trim() ||
            "PRJ-" + Math.random().toString(36).substr(2, 9).toUpperCase();

          const checkStmt = db.prepare("SELECT id FROM projects WHERE id = ?");
          let counter = 1;
          let originalId = projectId;
          while (checkStmt.get(projectId) && counter < 100) {
            projectId = `${originalId}-${counter}`;
            counter++;
          }

          const spkId =
            "SPK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
          const dParts = new Date().toISOString().split("T")[0].split("-");
          const spkNumber = `SPK/${dParts[0]}/${Math.floor(Math.random() * 1000)
            .toString()
            .padStart(3, "0")}/${spkId.substring(4, 6)}`;
          const spkTitle = `SPK for Project - ${name}`;

          const transaction = db.transaction(() => {
            if (quotation_id) {
               const checkProject = db.prepare("SELECT id FROM projects WHERE quotation_id = ?").get(quotation_id) as any;
               if (checkProject) {
                  throw new Error(`Quotation already converted to project (ID: ${checkProject.id})`);
               }
            }

            const quotationItems = db
              .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
              .all(quotation_id) as any[];
            const firstUom = quotationItems[0]?.uom || "Unit";

            const matchingQuoItem = quotationItems.find(
              (qi) =>
                qi.id === req.body.quotation_item_id ||
                (qi.title &&
                  name &&
                  qi.title.toLowerCase().trim() === name.toLowerCase().trim()),
            );

            const actualQty =
              req.body.qty !== undefined && req.body.qty !== null && Number(req.body.qty) > 0
                ? Number(req.body.qty)
                : matchingQuoItem
                  ? Number(matchingQuoItem.qty)
                  : quotationItems.length === 1
                    ? Number(quotationItems[0].qty)
                    : 1;

            const actualUom =
              req.body.uom || matchingQuoItem?.uom || firstUom || "Unit";
            const actualQuoItemId =
              req.body.quotation_item_id || matchingQuoItem?.id || null;

            // Projects start as PENDING_NTP (Active only after NTP issuance)
            db.prepare(
              "INSERT INTO projects (id, name, due_date, customer, remarks, parent_project_id, urgency, quotation_id, spk_id, status, qty, uom, quotation_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ).run(
              projectId,
              name,
              due_date,
              finalCustomer,
              remarks,
              parent_project_id || null,
              urgency || "NORMAL",
              quotation_id,
              spkId,
              "PENDING_NTP",
              actualQty,
              actualUom,
              actualQuoItemId,
            );

            // Create SPK
            db.prepare(
              `
          INSERT INTO spks (id, spk_number, project_id, quotation_id, title)
          VALUES (?, ?, ?, ?, ?)
        `,
            ).run(spkId, spkNumber, projectId, quotation_id, spkTitle);

            // Mark Quotation as processed
            db.prepare(
              "UPDATE quotations SET status = 'PROCESSED' WHERE id = ?",
            ).run(quotation_id);

            // Auto-create NTP
            const ntpId =
              "NTP-" + Math.random().toString(36).substr(2, 9).toUpperCase();
            const ntpNumber = `NTP/${new Date().getFullYear()}/${Math.floor(
              Math.random() * 10000,
            )
              .toString()
              .padStart(4, "0")}`;
            db.prepare(
              "INSERT INTO ntps (id, ntp_number, project_id, quotation_id, created_at, status) VALUES (?, ?, ?, ?, ?, 'ISSUED')",
            ).run(
              ntpId,
              ntpNumber,
              projectId,
              quotation_id,
              new Date().toISOString(),
            );
            db.prepare(
              "UPDATE projects SET status = 'ACTIVE', ntp_id = ? WHERE id = ?",
            ).run(ntpId, projectId);

            // Broadcast to Forum
            const msgId = "MSG-" + Math.random().toString(36).substr(2, 9);
            db.prepare(
              `
          INSERT INTO chat_messages (id, thread_id, sender_username, content) 
          VALUES (?, ?, ?, ?)
        `,
            ).run(
              msgId,
              "THREAD-GENERAL",
              (req.headers["x-user-email"] as string) || "system",
              `🚀 **Pekerjaan Proyek Dimulai!** 🚀**NTP:** ${ntpNumber}**Proyek:** ${name} (${projectId})**Klien:** 🏢 ${finalCustomer}NTP telah resmi diterbitkan. Proyek kini berstatus ACTIVE dan sah dikerjakan.`,
            );

            // Inherit BOM if parent project exists
            if (parent_project_id) {
              const parentBoms = db
                .prepare(
                  "SELECT item_id, dimension, spec, required_qty, unit_price, reference FROM boms WHERE project_id = ?",
                )
                .all(parent_project_id) as any[];
              const bomInsert = db.prepare(`
            INSERT INTO boms (id, project_id, item_id, dimension, spec, required_qty, unit_price, reference)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
              for (const item of parentBoms) {
                bomInsert.run(
                  "BOM-" + Math.random().toString(36).substr(2, 9),
                  projectId,
                  item.item_id,
                  item.dimension,
                  item.spec,
                  item.required_qty,
                  item.unit_price,
                  item.reference,
                );
              }

              // Initial consumption records for new BOM
              const newBoms = db
                .prepare("SELECT id FROM boms WHERE project_id = ?")
                .all(projectId) as { id: string }[];
              for (const b of newBoms) {
                db.prepare(
                  "INSERT INTO bom_item_consumption (id, bom_id, qty_consumed) VALUES (?, ?, ?)",
                ).run(
                  "BIC-" + Math.random().toString(36).substr(2, 9),
                  b.id,
                  0,
                );
              }
            }

            if (Array.isArray(tasks) && tasks.length > 0) {
              const taskInsert = db.prepare(`
            INSERT INTO project_tasks (id, project_id, task_name, work_center_id, required_hours, start_date, end_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
              for (const task of tasks) {
                const taskId = "TSK-" + Math.random().toString(36).substr(2, 9);
                const sDate = task.start_date || new Date().toISOString().split("T")[0];
                const eDate = task.end_date || sDate;
                taskInsert.run(
                  taskId,
                  projectId,
                  task.task_name || "Task",
                  task.work_center_id || null,
                  task.required_hours || 0,
                  sDate,
                  eDate,
                  "PENDING",
                );
              }
            } else if (parent_project_id) {
              // Inherit tasks from parent if none provided
              const parentTasks = db
                .prepare(
                  "SELECT task_name, work_center_id, required_hours FROM project_tasks WHERE project_id = ?",
                )
                .all(parent_project_id) as any[];
              const taskInsert = db.prepare(`
            INSERT INTO project_tasks (id, project_id, task_name, work_center_id, required_hours, start_date, end_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
              const todayStr = new Date().toISOString().split("T")[0];
              const nextWeekStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0];
              for (const task of parentTasks) {
                const taskId = "TSK-" + Math.random().toString(36).substr(2, 9);
                taskInsert.run(
                  taskId,
                  projectId,
                  task.task_name,
                  task.work_center_id,
                  task.required_hours,
                  todayStr,
                  nextWeekStr,
                  "PENDING",
                );
              }
            }
          });

          transaction();

          try {
            const projectRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
            if (projectRow) syncCollectionToFirestore("projects", projectId, projectRow);
            const spkRow = db.prepare("SELECT * FROM spks WHERE id = ?").get(spkId) as any;
            if (spkRow) syncCollectionToFirestore("spks", spkId, spkRow);
            const ntpRow = db.prepare("SELECT * FROM ntps WHERE project_id = ?").get(projectId) as any;
            if (ntpRow) syncCollectionToFirestore("ntps", ntpRow.id, ntpRow);
            syncCollectionToFirestore("quotations", quotation_id, { id: quotation_id, status: 'PROCESSED' });
          } catch (syncErr) {
            console.error("Firestore sync error for project creation:", syncErr);
          }

          const ntpDoc = db
            .prepare(`
              SELECT n.*, p.due_date, p.name as project_name, p.qty, p.uom, q.quotation_number, s.spk_number
              FROM ntps n
              LEFT JOIN projects p ON p.id = n.project_id
              LEFT JOIN quotations q ON q.id = n.quotation_id
              LEFT JOIN spks s ON s.project_id = n.project_id
              WHERE n.project_id = ?
            `)
            .get(projectId);
          logAudit(
            (req.headers["x-user-email"] as string) || null,
            "CREATE_PROJECT",
            "PROJECT",
            projectId,
            `Created project ${name} referenced to quotation ${quotation.quotation_number}`,
          );
          res.json({ success: true, data: { id: projectId, ntp: ntpDoc } });
        } catch (err: any) {
          console.error(err);
          res
            .status(500)
            .json({ error: "Failed to create project", details: err.message });
        }
      },
    );

    router.post(
      "/api/projects/:id/ntp",
      requireRole(["ENGINEERING", "FC", "SALES"]),
      (req, res) => {
        try {
          const { id } = req.params;
          const project = db
            .prepare("SELECT * FROM projects WHERE id = ?")
            .get(id) as any;
          if (!project)
            return res.status(404).json({ error: "Project not found" });

          const ntpId =
            "NTP-" + Math.random().toString(36).substr(2, 6).toUpperCase();
          const dParts = new Date().toISOString().split("T")[0].split("-");
          const ntpNumber = `NTP/${dParts[0]}/${Math.floor(Math.random() * 1000)
            .toString()
            .padStart(3, "0")}/${ntpId.substring(4, 6)}`;

          const transaction = db.transaction(() => {
            db.prepare(
              `
          INSERT INTO ntps (id, ntp_number, project_id, quotation_id, status)
          VALUES (?, ?, ?, ?, 'ISSUED')
        `,
            ).run(ntpId, ntpNumber, id, project.quotation_id);

            db.prepare(
              "UPDATE projects SET status = 'ACTIVE', ntp_id = ? WHERE id = ?",
            ).run(ntpId, id);

            // Automatic broadcast to forum
            const userEmail =
              (req.headers["x-user-email"] as string) || "system";
            const userObj = db
              .prepare(
                "SELECT username, name, role FROM users WHERE username = ? OR id = ?",
              )
              .get(userEmail, userEmail) as any;
            const author = userObj?.username || "system";
            const authorRole = userObj?.role || "FC";

            const forumId = "POST-" + Math.random().toString(36).substr(2, 9);
            db.prepare(
              `
          INSERT INTO forum_posts (id, title, content, author_username, author_role, category, shared_resource_type, shared_resource_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
            ).run(
              forumId,
              `Broadcast: Project Activation - ${project.name}`,
              `Notice to Proceed (NTP) has been officially issued for project **${project.name}** (NTP No: ${ntpNumber}). 
          
The project is now set to **ACTIVE** and manufacturing processes (PR, PO, Production) are cleared to proceed. 
Referenced Quotation ID: ${project.quotation_id || "N/A"}.`,
              author,
              authorRole,
              "ANNOUNCEMENT",
              "PROJECT",
              id,
            );

            // Also add to chat if it exists
            const messageId = "MSG-" + Math.random().toString(36).substr(2, 9);
            db.prepare(
              `
          INSERT INTO chat_messages (id, thread_id, sender_username, content)
          VALUES (?, 'THREAD-GENERAL', ?, ?)
        `,
            ).run(
              messageId,
              author,
              `📢 **NTP ISSUED**: Project [${project.name}] is now ACTIVE. (Ref: ${ntpNumber})`,
            );
          });

          transaction();

          logAudit(
            (req.headers["x-user-email"] as string) || null,
            "ISSUE_NTP",
            "PROJECT",
            id,
            `Issued NTP ${ntpNumber} for project ${project.name}`,
          );
          res.json({
            success: true,
            data: { ntp_id: ntpId, ntp_number: ntpNumber },
          });
        } catch (err: any) {
          console.error(err);
          res
            .status(500)
            .json({ error: "Failed to issue NTP", details: err.message });
        }
      },
    );

    router.get("/api/ntps", (req, res) => {
      try {
        const ntps = db
          .prepare(
            `
        SELECT n.*, p.name as project_name, q.quotation_number
        FROM ntps n
        LEFT JOIN projects p ON n.project_id = p.id
        LEFT JOIN quotations q ON n.quotation_id = q.id
        ORDER BY n.created_at DESC
      `,
          )
          .all();
        res.json({ success: true, data: ntps });
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({ error: "Failed to fetch NTPs", details: err.message });
      }
    });

    router.post(
      "/api/projects/bulk",
      requireRole(["SALES", "FC"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        if (userRole !== "FC" && userRole !== "SALES") {
          return res
            .status(403)
            .json({
              error:
                "Access denied. Only Sales or FC accounts can bulk create projects.",
            });
        }
        try {
          const { common, projects } = req.body;
          if (!Array.isArray(projects) || projects.length === 0) {
            return res.status(400).json({ error: "No projects provided" });
          }

          if (!common.quotation_id) {
            return res.status(400).json({
              error:
                "Common Quotation reference is required for bulk project creation",
            });
          }

          const transaction = db.transaction(() => {
            const quotation = db
              .prepare("SELECT * FROM quotations WHERE id = ?")
              .get(common.quotation_id) as any;
            if (!quotation) {
              throw new Error("Referenced Quotation not found");
            }

            if (quotation.status !== "APPROVED" && quotation.status !== "AUTHORIZED") {
              throw new Error("Referenced Quotation is not APPROVED or AUTHORIZED yet");
            }

            if (checkQuotationExpired(quotation)) {
              db.prepare(
                "UPDATE quotations SET status = 'EXPIRED' WHERE id = ?",
              ).run(common.quotation_id);
              throw new Error("Referenced Quotation has expired");
            }

            // Mark Quotation as processed
            db.prepare(
              "UPDATE quotations SET status = 'PROCESSED' WHERE id = ?",
            ).run(common.quotation_id);

            const projectInsert = db.prepare(
              "INSERT INTO projects (id, name, due_date, customer, remarks, parent_project_id, urgency, quotation_id, status, qty, uom, quotation_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            );
            const bomSelect = db.prepare(
              "SELECT item_id, dimension, spec, required_qty, unit_price, reference FROM boms WHERE project_id = ?",
            );
            const bomInsert = db.prepare(`
          INSERT INTO boms (id, project_id, item_id, dimension, spec, required_qty, unit_price, reference)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
            const consumptionInsert = db.prepare(
              "INSERT INTO bom_item_consumption (id, bom_id, qty_consumed) VALUES (?, ?, ?)",
            );
            const existStmt = db.prepare(
              "SELECT id FROM projects WHERE id = ?",
            );

            const quotationItems = db
              .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
              .all(common.quotation_id) as any[];
            const firstUom = quotationItems[0]?.uom || "Unit";

            for (const p of projects) {
              let pId =
                p.id?.trim() ||
                "PRJ-" + Math.random().toString(36).substr(2, 9).toUpperCase();

              let counter = 1;
              let originalPId = pId;
              while (existStmt.get(pId) && counter < 100) {
                pId = `${originalPId}-${counter}`;
                counter++;
              }

              const parentId = p.parent_project_id || common.parent_project_id;

              const spkId =
                "SPK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
              const dParts = new Date().toISOString().split("T")[0].split("-");
              const spkNumber = `SPK/${dParts[0]}/${Math.floor(
                Math.random() * 1000,
              )
                .toString()
                .padStart(3, "0")}/${spkId.substring(4, 6)}`;

              const matchingQuoItem = quotationItems.find(
                (qi) =>
                  qi.id === p.quotation_item_id ||
                  (qi.title &&
                    p.name &&
                    qi.title.toLowerCase().trim() === p.name.toLowerCase().trim()),
              );

              const projectQty =
                p.qty !== undefined && p.qty !== null && Number(p.qty) > 0
                  ? Number(p.qty)
                  : matchingQuoItem
                    ? Number(matchingQuoItem.qty)
                    : 1;

              const projectUom = p.uom || matchingQuoItem?.uom || firstUom || "Unit";
              const quoItemId = p.quotation_item_id || matchingQuoItem?.id || null;

              projectInsert.run(
                pId,
                p.name,
                common.due_date,
                common.customer,
                p.remarks || common.remarks,
                parentId || null,
                common.urgency || "NORMAL",
                common.quotation_id,
                "ACTIVE",
                projectQty,
                projectUom,
                quoItemId,
              );

              db.prepare(
                `INSERT INTO spks (id, spk_number, project_id, quotation_id, title) VALUES (?, ?, ?, ?, ?)`,
              ).run(
                spkId,
                spkNumber,
                pId,
                common.quotation_id,
                `SPK for Project - ${p.name}`,
              );

              const ntpId =
                "NTP-" + Math.random().toString(36).substr(2, 9).toUpperCase();
              const ntpNumber = `NTP/${new Date().getFullYear()}/${Math.floor(
                Math.random() * 10000,
              )
                .toString()
                .padStart(4, "0")}`;
              db.prepare(
                "INSERT INTO ntps (id, ntp_number, project_id, quotation_id, created_at, status) VALUES (?, ?, ?, ?, ?, 'ISSUED')",
              ).run(
                ntpId,
                ntpNumber,
                pId,
                common.quotation_id,
                new Date().toISOString(),
              );
              db.prepare("UPDATE projects SET ntp_id = ? WHERE id = ?").run(
                ntpId,
                pId,
              );

              if (parentId) {
                const parentBoms = bomSelect.all(parentId) as any[];
                for (const item of parentBoms) {
                  const bomId =
                    "BOM-" + Math.random().toString(36).substr(2, 9);
                  bomInsert.run(
                    bomId,
                    pId,
                    item.item_id,
                    item.dimension,
                    item.spec,
                    item.required_qty,
                    item.unit_price,
                    item.reference,
                  );
                  consumptionInsert.run(
                    "BIC-" + Math.random().toString(36).substr(2, 9),
                    bomId,
                    0,
                  );
                }
              }

              logAudit(
                req.headers["x-user-email"] as string,
                "BULK_CREATE_PROJECT",
                "PROJECT",
                pId,
                `Project ${p.name} created via bulk.`,
              );

              // Broadcast to Forum
              const msgId = "MSG-" + Math.random().toString(36).substr(2, 9);
              db.prepare(
                `
            INSERT INTO chat_messages (id, thread_id, sender_username, content) 
            VALUES (?, ?, ?, ?)
          `,
              ).run(
                msgId,
                "THREAD-GENERAL",
                "SYSTEM",
                `📦 **Bulk Project Created!** 📦**Project Name:** ${p.name}**Client:** 🏢 ${common.customer || "N/A"}**Target Date:** 📅 ${common.due_date}Ready for action! ⚡`,
              );
            }
          });

          let firstProjectId = null;
          transaction();
          try {
            // To easily grab the first project id if we need to
            const firstProjName = projects[0]?.name;
            firstProjectId = db
              .prepare(
                "SELECT id FROM projects WHERE name = ? ORDER BY created_at DESC LIMIT 1",
              )
              .get(firstProjName) as any;
          } catch (e) {}

          const ntpDoc = firstProjectId
            ? db
                .prepare(`
                  SELECT n.*, p.due_date, p.name as project_name, p.qty, p.uom, q.quotation_number, s.spk_number
                  FROM ntps n
                  LEFT JOIN projects p ON p.id = n.project_id
                  LEFT JOIN quotations q ON q.id = n.quotation_id
                  LEFT JOIN spks s ON s.project_id = n.project_id
                  WHERE n.project_id = ?
                `)
                .get(firstProjectId.id)
            : null;
          res.json({
            success: true,
            count: projects.length,
            data: { ntp: ntpDoc },
          });
        } catch (error: any) {
          console.error(error);
          res.status(500).json({
            error: "Failed to create projects in bulk",
            details: error.message,
          });
        }
      },
    );

    router.delete(
      "/api/projects/:projectId/bom/:bomId",
      requireRole(["ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (userRole !== "FC" && userLevel !== "MANAGER") {
          return res
            .status(403)
            .json({
              error:
                "Access denied. Only FC or Engineering/Production Manager can delete BOM items.",
            });
        }
        try {
          const { projectId, bomId } = req.params;
          // Check if item has consumption
          const consumption = db
            .prepare(
              "SELECT SUM(qty_consumed) as total FROM bom_item_consumption WHERE bom_id = ?",
            )
            .get(bomId) as { total: number };
          if (consumption && consumption.total > 0) {
            return res
              .status(400)
              .json({ error: "Cannot delete item with recorded consumption." });
          }

          db.transaction(() => {
            db.prepare("DELETE FROM bom_item_consumption WHERE bom_id = ?").run(
              bomId,
            );
            db.prepare("DELETE FROM work_order_items WHERE bom_id = ?").run(
              bomId,
            );
            db.prepare("DELETE FROM boms WHERE id = ? AND project_id = ?").run(
              bomId,
              projectId,
            );
          })();

          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to delete BOM item" });
        }
      },
    );

    router.delete(
      "/api/projects/:projectId/tasks/:taskId",
      requireRole(["ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        try {
          const { projectId, taskId } = req.params;
          const project = db
            .prepare("SELECT status FROM projects WHERE id = ?")
            .get(projectId) as any;
          if (
            project &&
            (project.status === "FINISHED" || project.status === "CLOSED")
          ) {
            return res.status(400).json({
              error: "Cannot delete task from a finished or closed project.",
            });
          }
          db.prepare(
            "DELETE FROM project_tasks WHERE id = ? AND project_id = ?",
          ).run(taskId, projectId);
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to delete task" });
        }
      },
    );

    router.get("/api/projects/:id/eco-history", (req, res) => {
      try {
        const projectId = req.params.id;
        const type = req.query.type as string;
        let query = "SELECT * FROM eco_logs WHERE project_id = ?";
        const params: any[] = [projectId];
        if (type) {
          query += " AND (UPPER(doc_type) = ? OR (doc_type IS NULL AND ? = 'BOM'))";
          params.push(type.toUpperCase(), type.toUpperCase());
        }
        query += " ORDER BY created_at DESC";
        const logs = db.prepare(query).all(...params) as any[];
        const parsed = logs.map((l) => {
          const prevData = l.previous_bom ? JSON.parse(l.previous_bom) : [];
          const currData = l.current_bom ? JSON.parse(l.current_bom) : [];
          return {
            ...l,
            previous_bom: prevData,
            current_bom: currData,
            previous_bop: prevData,
            current_bop: currData,
          };
        });
        res.json(parsed);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    router.post(
      "/api/projects/:id/boms/authorize",
      requireRole(["ENGINEERING", "PRODUCTION", "FC"]),
      (req, res) => {
        try {
          const userRole = (req as any).userRole;
          const userLevel = (req as any).userLevel;
          if (userRole !== "FC" && userLevel !== "MANAGER" && !(req as any).userEmail?.includes("admin")) {
            return res.status(403).json({ error: "Access denied. Only Manager or FC can authorize BOM." });
          }

          const projectId = req.params.id;
          const { pin } = req.body;
          if (!pin) return res.status(400).json({ error: "PIN is required" });

          const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || (req as any).userEmail || (req as any).username || "admin";
          if (!isValidDailyAuthKey(userIdentifier, pin)) {
            return res.status(400).json({ error: "Invalid Daily Internal Auth Key." });
          }

          const now = new Date().toISOString();
          db.prepare("UPDATE projects SET bom_status = 'AUTHORIZED', bom_authorized_by = ?, bom_authorized_at = ?, bom_revision_note = NULL WHERE id = ?").run(userIdentifier, now, projectId);

          logAudit(userIdentifier, "BOM_AUTHORIZED", "BOM", projectId, `BOM Document Authorized by ${userIdentifier}`);
          res.json({ success: true, bom_status: 'AUTHORIZED', bom_authorized_by: userIdentifier, bom_authorized_at: now });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    router.post(
      "/api/projects/:id/boms/revise",
      requireRole(["ENGINEERING", "PRODUCTION", "FC"]),
      (req, res) => {
        try {
          const userRole = (req as any).userRole;
          const userLevel = (req as any).userLevel;
          if (userRole !== "FC" && userLevel !== "MANAGER" && !(req as any).userEmail?.includes("admin")) {
            return res.status(403).json({ error: "Access denied. Only Manager or FC can revise BOM." });
          }

          const projectId = req.params.id;
          const { note } = req.body;
          if (!note) return res.status(400).json({ error: "Revision note is required" });

          const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || (req as any).userEmail || (req as any).username || "admin";

          db.prepare("UPDATE projects SET bom_status = 'REVISION', bom_revision_note = ? WHERE id = ?").run(note, projectId);

          logAudit(userIdentifier, "BOM_REVISION", "BOM", projectId, "BOM Marked for Revision. Note: " + note);
          res.json({ success: true, bom_status: 'REVISION', bom_revision_note: note });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    router.post(
      "/api/projects/:id/boms/sync",
      requireRole(["ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;

        try {
          const projectId = req.params.id;
          const { items, auth_pin, eco_reason, is_draft } = req.body;

          const project = db
            .prepare("SELECT status, bom_status, bom_prepared_by, bom_prepared_at FROM projects WHERE id = ?")
            .get(projectId) as any;
          if (!project || project.status !== "ACTIVE") {
            return res.status(400).json({
              error:
                "Cannot modify BOM of a project that is not ACTIVE. Current status: " +
                (project?.status || "NOT FOUND"),
            });
          }

          // ECO Logic: check if the project is in manufacturing phase
          const hasManufacturing = db.prepare("SELECT count(*) as c FROM work_orders WHERE project_id = ?").get(projectId) as any;
          const hasStartedTasks = db.prepare("SELECT count(*) as c FROM project_tasks WHERE project_id = ? AND progress > 0").get(projectId) as any;
          const isManufacturing = hasManufacturing.c > 0 || hasStartedTasks.c > 0;

          const existingBomsSnapshot = db
            .prepare(`
              SELECT 
          b.*, 
          (b.required_qty * COALESCE((SELECT qty FROM projects WHERE id = b.project_id), 1)) as total_required_qty,
          i.item_code, i.name, i.uom
              FROM boms b
              LEFT JOIN items i ON b.item_id = i.id
              WHERE b.project_id = ?
            `)
            .all(projectId);

          
          const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || (req as any).userEmail || (req as any).username || "admin";
          const now = new Date().toISOString();
          const isAuthorizedState = project.bom_status === 'AUTHORIZED';
          const isEco = !is_draft && (isAuthorizedState || !!auth_pin || !!eco_reason);

          let ecoId = "";
          let ecoNum = "";

          if (is_draft) {
            const currentBomStatus = project.bom_status || 'DRAFT';
            if (!isManufacturing && currentBomStatus !== 'PENDING' && currentBomStatus !== 'AUTHORIZED') {
               db.prepare("UPDATE projects SET bom_status = 'DRAFT', bq_updated_at = ? WHERE id = ?").run(now, projectId);
            } else {
               db.prepare("UPDATE projects SET bq_updated_at = ? WHERE id = ?").run(now, projectId);
            }
          } else if (isEco) {
            if (!auth_pin) {
              return res.status(400).json({ error: "BOM telah diotorisasi sebelumnya. Perubahan memerlukan otorisasi ECO dengan Daily Internal Auth Key (PIN).", require_eco: true });
            }
            if (!isValidDailyAuthKey(userIdentifier, auth_pin)) {
              return res.status(400).json({ error: "Daily Internal Auth Key tidak valid atau salah." });
            }
            if (!eco_reason || !eco_reason.trim()) {
              return res.status(400).json({ error: "Alasan perubahan teknis (ECO Reason) wajib diisi." });
            }
            db.prepare("UPDATE projects SET bom_status = 'AUTHORIZED', bom_authorized_by = ?, bom_authorized_at = ?, bom_revision_note = NULL, bq_updated_at = ? WHERE id = ?").run(userIdentifier, now, now, projectId);
            logAudit(userIdentifier, "ECO_SUBMITTED", "BOM", projectId, `BOM changed via ECO revision. Reason: ${eco_reason}`);
          } else {
            // Standard initial submission or re-submission from REVISION
            db.prepare("UPDATE projects SET bom_status = 'PENDING', bom_submitted_by = ?, bom_submitted_at = ?, bom_prepared_by = COALESCE(bom_prepared_by, ?), bom_prepared_at = COALESCE(bom_prepared_at, ?), bom_revision_note = NULL, bq_updated_at = ? WHERE id = ?").run(userIdentifier, now, userIdentifier, now, now, projectId);
            logAudit(userIdentifier, "BOM_SUBMITTED", "BOM", projectId, `BOM submitted for approval by ${userIdentifier}`);
          }


          const transaction = db.transaction(() => {
            // We will update existing items, insert new ones, and delete removed ones.
            // However, deleting might violate foreign keys if there's consumption.
            // For simplicity, we can just delete BOM items that have 0 consumption and are not in the new list.

            const existingBoms = db
              .prepare("SELECT * FROM boms WHERE project_id = ?")
              .all(projectId) as any[];
            const existingBomIds = new Set(existingBoms.map((b) => b.id));
            const newItemsMap = new Map();

            const insertBom = db.prepare(
              "INSERT INTO boms (id, project_id, item_id, dimension, spec, required_qty, unit_price, reference, target_project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            );
            const insertBomConsumption = db.prepare(
              "INSERT INTO bom_item_consumption (id, bom_id, qty_consumed) VALUES (?, ?, ?)",
            );
            const updateBom = db.prepare(
              "UPDATE boms SET required_qty = ?, dimension = ?, spec = ?, unit_price = ?, reference = ?, target_project_id = ? WHERE id = ?",
            );

            // Update project bq_updated_at
            db.prepare(
              "UPDATE projects SET bq_updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(projectId);

            for (const item of items) {
              let itemId = item.item_id;
              let existingItem: any = null;

              if (itemId) {
                existingItem = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
              }
              if (!existingItem && item.item_code) {
                existingItem = db.prepare("SELECT * FROM items WHERE item_code = ?").get(item.item_code.trim());
                if (existingItem) {
                  itemId = existingItem.id;
                }
              }

              if (!existingItem) {
                // Create the new item in items table
                itemId = "ITEM-" + Math.random().toString(36).substr(2, 5).toUpperCase();
                db.prepare(
                  "INSERT INTO items (id, item_code, name, uom, dimension, spec, type, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ).run(
                  itemId,
                  (item.item_code || itemId).trim(),
                  item.name || "New Item",
                  item.uom || "PCS",
                  item.dimension || "",
                  item.spec || "",
                  "RAW",
                  Number(item.unit_price) || 0,
                );
                db.prepare(
                  "INSERT OR IGNORE INTO inventory (item_id, free_stock, allocated_stock) VALUES (?, 0, 0)",
                ).run(itemId);
              } else {
                // Update item attributes if present
                db.prepare(
                  "UPDATE items SET name = COALESCE(NULLIF(?, ''), name), uom = COALESCE(NULLIF(?, ''), uom), dimension = COALESCE(?, dimension), spec = COALESCE(?, spec), unit_price = CASE WHEN ? > 0 THEN ? ELSE unit_price END WHERE id = ?"
                ).run(
                  item.name || "",
                  item.uom || "",
                  item.dimension || "",
                  item.spec || "",
                  Number(item.unit_price) || 0,
                  Number(item.unit_price) || 0,
                  itemId
                );
                db.prepare(
                  "INSERT OR IGNORE INTO inventory (item_id, free_stock, allocated_stock) VALUES (?, 0, 0)",
                ).run(itemId);
              }

              newItemsMap.set(itemId, item);

              // Check if it already exists in project BOM
              const existing = existingBoms.find((b) => b.item_id === itemId);
              let bomId = "";
              if (existing) {
                bomId = existing.id;
                updateBom.run(
                  Number(item.required_qty) || 0,
                  item.dimension || "",
                  item.spec || "",
                  Number(item.unit_price) || 0,
                  item.reference || "",
                  item.target_project_id || null,
                  existing.id,
                );
                existingBomIds.delete(existing.id);
              } else {
                bomId = "BOM-" + Math.random().toString(36).substr(2, 9);
                insertBom.run(
                  bomId,
                  projectId,
                  itemId,
                  item.dimension || "",
                  item.spec || "",
                  Number(item.required_qty) || 0,
                  Number(item.unit_price) || 0,
                  item.reference || "",
                  item.target_project_id || null,
                );
                insertBomConsumption.run(
                  "BIC-" + Math.random().toString(36).substr(2, 9),
                  bomId,
                  0,
                );
              }
            }

            // --- EVENT-DRIVEN MRP SYNC FOR ECO ---
            if (isManufacturing) {
              const getProjectIncoming = db.prepare(`
                SELECT COALESCE(SUM(pri.qty), 0) - COALESCE((
                  SELECT SUM(gi.qty_received)
                  FROM grn_items gi
                  JOIN grns g ON gi.grn_id = g.id
                  JOIN purchase_orders po ON g.po_id = po.id
                  JOIN pr_items pri2 ON po.id = pri2.po_id AND gi.item_id = pri2.item_id
                  JOIN purchase_requests pr2 ON pri2.pr_id = pr2.id
                  WHERE pr2.project_id = ? AND gi.item_id = ? AND g.qc_status IN ('PASSED', 'CONDITIONAL')
                ), 0) as incoming
                FROM pr_items pri
                JOIN purchase_requests pr ON pri.pr_id = pr.id
                WHERE pr.project_id = ? AND pri.item_id = ? AND pr.status != 'CANCELLED'
              `);
              
              const getFreeStock = db.prepare(`SELECT COALESCE(free_stock, 0) as f FROM inventory WHERE item_id = ?`);
              
              let prId = null;
              let hasShortage = false;

              for (const item of items) {
                const itemId = item.item_id || Array.from(newItemsMap.keys()).find(k => newItemsMap.get(k) === item);
                if (!itemId) continue;

                const required = Number(item.required_qty);
                const freeStockRow = getFreeStock.get(itemId) as any;
                const freeStock = freeStockRow ? Number(freeStockRow.f) : 0;
                
                const incomingRow = getProjectIncoming.get(projectId, itemId, projectId, itemId) as any;
                const incoming = incomingRow ? Number(incomingRow.incoming) : 0;

                const existingAllocRow = db.prepare(`SELECT COALESCE(SUM(qty), 0) as alloc FROM stock_movements WHERE project_id = ? AND item_id = ? AND type IN ('ALLOCATION', 'GRN_ALLOCATION')`).get(projectId, itemId) as any;
                const existingAlloc = existingAllocRow ? Number(existingAllocRow.alloc) : 0;

                const shortage = Math.max(0, required - (freeStock + incoming + existingAlloc));

                if (shortage > 0) {
                  hasShortage = true;
                }
              }
              
              if (hasShortage) {
                 const todayStr = new Date().toISOString().split("T")[0];
                 const nextWeekStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
                 db.prepare(
                   "INSERT INTO project_tasks (id, project_id, task_name, start_date, end_date, progress, status, pr_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                 ).run(
                   "TSK-" + Math.random().toString(36).substr(2, 9),
                   projectId,
                   "ECO Procurement Revision",
                   todayStr,
                   nextWeekStr,
                   0,
                   "PENDING",
                   prId
                 );
              }
            }
            // --- END ECO SYNC ---

            // Delete BOMs that are no longer in the list, IF they have 0 consumption
            for (const bomId of existingBomIds) {
              const consumption = db
                .prepare(
                  "SELECT qty_consumed FROM bom_item_consumption WHERE bom_id = ?",
                )
                .get(bomId) as any;
              if (!consumption || consumption.qty_consumed === 0) {
                db.prepare(
                  "DELETE FROM bom_item_consumption WHERE bom_id = ?",
                ).run(bomId);
                db.prepare("DELETE FROM work_order_items WHERE bom_id = ?").run(
                  bomId,
                );
                db.prepare("DELETE FROM boms WHERE id = ?").run(bomId);
              }
            }
          });

          transaction();

          if (isEco) {
            try {
              ecoId = "ECO-" + Math.random().toString(36).substr(2, 9);
              ecoNum = `ECO-${projectId}-${Date.now().toString().slice(-4)}`;
              const currentBoms = db.prepare(`
                SELECT 
          b.*, 
          (b.required_qty * COALESCE((SELECT qty FROM projects WHERE id = b.project_id), 1)) as total_required_qty,
          i.item_code, i.name, i.uom
                FROM boms b
                LEFT JOIN items i ON b.item_id = i.id
                WHERE b.project_id = ?
              `).all(projectId);

              db.prepare(`
                INSERT INTO eco_logs (id, project_id, doc_type, eco_number, eco_reason, authorized_by, authorized_at, previous_bom, current_bom)
                VALUES (?, ?, 'BOM', ?, ?, ?, ?, ?, ?)
              `).run(
                ecoId,
                projectId,
                ecoNum,
                eco_reason || "BOM Technical Revision & Material Re-allocation",
                userIdentifier,
                now,
                JSON.stringify(existingBomsSnapshot || []),
                JSON.stringify(currentBoms || [])
              );
            } catch (ecoErr) {
              console.error("Failed to insert ECO log:", ecoErr);
            }
          }

          res.json({
            success: true,
            is_eco: isEco,
            is_draft: !!is_draft,
            bom_status: is_draft ? (project.bom_status || 'DRAFT') : (isEco ? 'AUTHORIZED' : 'PENDING'),
            eco_number: ecoNum || null,
            eco_id: ecoId || null,
            updated_at: now
          });
        } catch (error: any) {
          console.error("Error during BOM sync:", error);
          res.status(500).json({ error: error?.message || "Failed to sync BQ" });
        }
      },
    );

    router.post(
      "/api/boms/submit",
      requireRole(["ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        try {
          const {
            project_id,
            items,
            expected_delivery_date,
            drawing_reference,
            urgency,
          } = req.body;
          // items: { item_id, item_code, name, dimension, spec, required_qty, shortage_qty, reference, is_new }

          const insertBom = db.prepare(
            "INSERT INTO boms (id, project_id, item_id, dimension, spec, required_qty, reference, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          );
          const insertBomConsumption = db.prepare(
            "INSERT INTO bom_item_consumption (id, bom_id, qty_consumed) VALUES (?, ?, ?)",
          );
          const insertPr = db.prepare(
            "INSERT INTO purchase_requests (id, pr_number, project_id, drawing_reference, urgency) VALUES (?, ?, ?, ?, ?)",
          );
          const insertPrItem = db.prepare(
            "INSERT INTO pr_items (id, pr_id, item_id, dimension, spec, qty, unit_price, expected_delivery_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          );
          const insertMovement = db.prepare(
            "INSERT INTO stock_movements (id, item_id, project_id, type, qty, reference_id) VALUES (?, ?, ?, ?, ?, ?)",
          );
          const insertTask = db.prepare(
            "INSERT INTO project_tasks (id, project_id, task_name, start_date, end_date, progress, status, pr_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          );

          const transaction = db.transaction(() => {
            let prId = null;
            let hasShortage = false;

            for (const item of items) {
              let itemId = item.item_id;

              if (!itemId || item.is_new) {
                // Create the new item
                itemId =
                  "ITEM-" +
                  Math.random().toString(36).substr(2, 5).toUpperCase();
                db.prepare(
                  "INSERT INTO items (id, item_code, name, uom, dimension, spec, type, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ).run(
                  itemId,
                  item.item_code,
                  item.name || "New Item",
                  item.uom || "PCS",
                  item.dimension || "",
                  item.spec || "",
                  "RAW",
                  item.unit_price || 0,
                );
                db.prepare(
                  "INSERT INTO inventory (item_id, free_stock, allocated_stock) VALUES (?, 0, 0)",
                ).run(itemId);
              }

              const bomId = "BOM-" + Math.random().toString(36).substr(2, 9);
              insertBom.run(
                bomId,
                project_id,
                itemId,
                item.dimension,
                item.spec,
                item.required_qty,
                item.reference,
                item.unit_price || 0,
              );
              insertBomConsumption.run(
                "BIC-" + Math.random().toString(36).substr(2, 9),
                bomId,
                0,
              );

              let currentFreeStock = 0;
              if (itemId && !item.is_new) {
                const inv = db
                  .prepare("SELECT free_stock FROM inventory WHERE item_id = ?")
                  .get(itemId) as any;
                currentFreeStock = inv ? inv.free_stock : 0;
              }

              // Calculate total required by all OTHER active projects for this item
              const otherBomsReq = db
                .prepare(
                  `
            SELECT COALESCE(SUM(b.required_qty), 0) as total_req
            FROM boms b
            JOIN projects p ON b.project_id = p.id
            WHERE b.item_id = ? AND p.status IN ('DRAFT', 'ACTIVE')
          `,
                )
                .get(itemId) as any;
              const totalOtherReq = otherBomsReq.total_req;

              // Calculate incoming pending from active POs
              const incomingSupply = db
                .prepare(
                  `
            SELECT COALESCE(SUM(doi.qty_received), 0) as total_incoming
            FROM grn_items doi
            JOIN grns d ON doi.grn_id = d.id
            WHERE doi.item_id = ? AND d.inventory_updated_at IS NULL
          `,
                )
                .get(itemId) as any;
              const totalIncoming = incomingSupply.total_incoming;

              const pendingPoSupply = db
                .prepare(
                  `
             SELECT COALESCE(SUM(poi.qty), 0) as total_po
             FROM pr_items poi
             JOIN purchase_requests pr ON poi.pr_id = pr.id
             WHERE poi.item_id = ? AND pr.status IN ('DRAFTED', 'AUTHORIZED', 'PO_ISSUED')
          `,
                )
                .get(itemId) as any;
              const totalPoIncoming = pendingPoSupply.total_po;

              // Effective availability = Physical Stock + Pending Incoming + Pipeline POs - Other Project Requirements
              // Note: totalOtherReq includes past BOM requirements, so it calculates exactly what's "left" for this new BOM
              const effectiveAvailable = Math.max(
                0,
                currentFreeStock +
                  totalIncoming +
                  totalPoIncoming -
                  totalOtherReq,
              );

              const actualShortage = Math.max(
                0,
                item.required_qty - effectiveAvailable,
              );

              if (actualShortage > 0) {
                hasShortage = true;
              }

              item.final_item_id = itemId; // Store for PR
              item.actual_shortage = actualShortage;
            }

            // Note: BOM Submission saves/updates BOM entries and tracks shortages for Procurement Waves.
            // Draft PRs are created explicitly by user action via Procurement Waves / Shortage Wizard.

            // Create Gantt Task for Material Procurement
            const todayStr = new Date().toISOString().split("T")[0];

            // Ensure unique tasks for different expected deliveries or one fallback
            const itemsWithDeliveries = items.filter(
              (i: any) => i.actual_shortage > 0 && i.expected_delivery_date,
            );

            if (itemsWithDeliveries.length > 0) {
              // Group by delivery date
              const deliveryGroups = new Map();
              for (const i of itemsWithDeliveries) {
                if (!deliveryGroups.has(i.expected_delivery_date))
                  deliveryGroups.set(i.expected_delivery_date, []);
                deliveryGroups.get(i.expected_delivery_date).push(i);
              }

              for (const [date, grp] of deliveryGroups.entries()) {
                const taskId = "TSK-" + Math.random().toString(36).substr(2, 9);
                let details = grp.map((g: any) => g.item_code).join(", ");
                if (details.length > 40)
                  details = details.substring(0, 37) + "...";
                insertTask.run(
                  taskId,
                  project_id,
                  `Arrival: ${details}`,
                  todayStr,
                  date,
                  0,
                  "PENDING",
                  prId,
                );
              }
            }

            if (!hasShortage || itemsWithDeliveries.length === 0) {
              // Default procurement task if none specified
              const taskId = "TSK-" + Math.random().toString(36).substr(2, 9);
              let endDateStr = expected_delivery_date || "";
              if (!endDateStr) {
                const d = new Date();
                d.setDate(d.getDate() + 3);
                endDateStr = d.toISOString().split("T")[0];
              }
              const prText = prId ? `(PR Generated)` : `(Stock Fulfilled)`;
              insertTask.run(
                taskId,
                project_id,
                `Material Procurement ${prText}`,
                todayStr,
                endDateStr,
                0,
                "PENDING",
                prId,
              );
            }

            return prId;
          });

          const generatedPrId = transaction();
          logAudit(
            req.headers["x-user-email"] as string,
            "BOM_SYNC",
            "PROJECT",
            project_id,
            `BOM synchronized with ${items.length} items. PR ID: ${generatedPrId || "None"}`,
          );
          res.json({ success: true, pr_id: generatedPrId });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to submit BOM" });
        }
      },
    );

    router.post(
      "/api/projects/:id/close",
      requireRole(["ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        const { id } = req.params;
        try {
          db.transaction(() => {
            // 1. Audit check for unconsumed allocations
            // 2. Auto-cancel any un-ordered PRs
            db.prepare(
              "UPDATE purchase_requests SET status = 'CANCELLED' WHERE project_id = ? AND status IN ('DRAFTED', 'AUTHORIZED')",
            ).run(id);

            // Update project status
            db.prepare(
              'UPDATE projects SET status = "CLOSED", archived_at = CURRENT_TIMESTAMP WHERE id = ?',
            ).run(id);

            // Automagically transition related undelivered delivery notes to DELIVERED status for billing readiness
            db.prepare(
              "UPDATE delivery_notes SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP WHERE project_id = ? AND status != 'DELIVERED'",
            ).run(id);

            // Log audit
            logAudit(
              (req.headers["x-user-email"] as string) || "SYSTEM",
              "PROJECT_CLOSED",
              "PROJECT",
              id,
              `Project ${id} closed. Net allocations reclaimed, and related delivery notes updated to DELIVERED status.`,
            );
          })();

          res.json({ success: true });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      },
    );

    router.post("/api/projects/:id/reserve-stock", (req, res) => {
      res.json({ success: true, message: "Reservation is disabled." });
    });

    router.post(
      "/api/projects/:id/repeat",
      requireRole(["ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        const { id } = req.params;
        const { new_name, new_due_date } = req.body;

        try {
          let newProjectId = "";
          db.transaction(() => {
            const parentProject = db
              .prepare("SELECT * FROM projects WHERE id = ?")
              .get(id) as any;
            if (!parentProject) throw new Error("Parent project not found");

            newProjectId = "PRJ-" + Math.random().toString(36).substr(2, 9);

            // 1. Create new project
            db.prepare(
              `
          INSERT INTO projects (id, name, due_date, customer, remarks, parent_project_id, status, quotation_id, qty, uom, urgency)
          VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)
        `,
            ).run(
              newProjectId,
              new_name || `Repeat of ${parentProject.name}`,
              new_due_date || parentProject.due_date,
              parentProject.customer,
              parentProject.remarks,
              id,
              parentProject.quotation_id || null,
              parentProject.qty || 1,
              parentProject.uom || "Unit",
              parentProject.urgency || "NORMAL",
            );

            // 2. Copy BOM
            const boms = db
              .prepare("SELECT * FROM boms WHERE project_id = ?")
              .all(id) as any[];
            const insertBom = db.prepare(`
          INSERT INTO boms (id, project_id, item_id, dimension, spec, required_qty, unit_price)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
            for (const bom of boms) {
              const newBomId = "BOM-" + Math.random().toString(36).substr(2, 9);
              insertBom.run(
                newBomId,
                newProjectId,
                bom.item_id,
                bom.dimension,
                bom.spec,
                bom.required_qty,
                bom.unit_price,
              );
            }

            // 3. Copy Tasks
            const tasks = db
              .prepare("SELECT * FROM project_tasks WHERE project_id = ?")
              .all(id) as any[];
            const insertTask = db.prepare(`
          INSERT INTO project_tasks (id, project_id, task_name, work_center_id, required_hours, start_date, end_date, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);

            // Calculate date shift
            const parentStart = new Date(
              parentProject.created_at || Date.now(),
            );
            const newStart = new Date();
            const shiftMs = newStart.getTime() - parentStart.getTime();

            for (const task of tasks) {
              const newTaskId =
                "TSK-" + Math.random().toString(36).substr(2, 9);

              let newStartDate = task.start_date;
              let newEndDate = task.end_date;

              if (task.start_date && task.end_date) {
                const sd = new Date(task.start_date);
                const ed = new Date(task.end_date);
                if (!isNaN(sd.getTime()) && !isNaN(ed.getTime())) {
                  sd.setTime(sd.getTime() + shiftMs);
                  ed.setTime(ed.getTime() + shiftMs);
                  newStartDate = sd.toISOString().split("T")[0];
                  newEndDate = ed.toISOString().split("T")[0];
                }
              }

              const finalStart = newStartDate || new Date().toISOString().split("T")[0];
              const finalEnd = newEndDate || finalStart;

              insertTask.run(
                newTaskId,
                newProjectId,
                task.task_name || "Task",
                task.work_center_id || null,
                task.required_hours || 0,
                finalStart,
                finalEnd,
              );
            }
          })();

          logAudit(
            req.headers["x-user-email"] as string,
            "REPEAT_PROJECT",
            "PROJECT",
            newProjectId,
            `Created repeat of project ${id}`,
          );
          res.json({ success: true, id: newProjectId });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to repeat project" });
        }
      },
    );

    router.delete(
      "/api/projects/:id",
      requireRole(["FC", "ENGINEERING"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (
          userRole !== "FC" &&
          (userRole !== "ENGINEERING" || userLevel !== "MANAGER")
        ) {
          return res
            .status(403)
            .json({
              error:
                "Access denied. Only FC or Engineering Manager can delete projects.",
            });
        }
        try {
          const projectId = req.params.id;
          db.transaction(() => {
            db.prepare(
              "UPDATE projects SET status = 'CANCELLED', archived_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(projectId);

            // Auto-cancel any un-ordered PRs
            db.prepare(
              "UPDATE purchase_requests SET status = 'CANCELLED' WHERE project_id = ? AND status IN ('DRAFTED', 'AUTHORIZED')",
            ).run(projectId);

            // Release unconsumed allocated stock
            const uniqueItems = db
              .prepare("SELECT DISTINCT item_id FROM boms WHERE project_id = ?")
              .all(projectId) as { item_id: string }[];
            for (const { item_id } of uniqueItems) {
              const allocResult = db
                .prepare(
                  `
            SELECT COALESCE(SUM(qty), 0) as total_alloc
            FROM stock_movements
            WHERE project_id = ? AND item_id = ? AND type IN ('ALLOCATION', 'GRN_ALLOCATION')
          `,
                )
                .get(projectId, item_id) as any;

              const consumeResult = db
                .prepare(
                  `
            SELECT COALESCE(SUM(ABS(qty)), 0) as total_consumed
            FROM stock_movements
            WHERE project_id = ? AND item_id = ? AND type = 'CONSUMPTION'
          `,
                )
                .get(projectId, item_id) as any;

              const remaining =
                (allocResult.total_alloc || 0) -
                (consumeResult.total_consumed || 0);
              const projectAllocated = Math.max(0, remaining);
              if (projectAllocated > 0) {
                db.prepare(
                  "INSERT INTO stock_movements (id, item_id, project_id, type, qty, reference_id) VALUES (?, ?, ?, 'RELEASE', ?, ?)",
                ).run(
                  "MOV-" + Math.random().toString(36).substr(2, 9),
                  item_id,
                  projectId,
                  projectAllocated,
                  "Auto-release on cancel",
                );
              }
            }

            // Cancel pending/in-progress tasks
            db.prepare(
              "UPDATE project_tasks SET status = 'COMPLETED' WHERE project_id = ? AND status != 'COMPLETED'",
            ).run(projectId);

            logAudit(
              req.headers["x-user-email"] as string,
              "CANCEL_PROJECT",
              "PROJECT",
              projectId,
              "Project cancelled and resources released.",
            );
          })();
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to cancel project" });
        }
      },
    );

    router.post(
      "/api/projects/:id/create-fg-sku",
      requireRole(["FC", "PRODUCTION", "ENGINEERING", "WAREHOUSE"]),
      (req, res) => {
        try {
          if (["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"].includes(req.params.id)) {
            return res.status(400).json({
              error: "Cannot create finished good for general procurement",
            });
          }
          const project = db
            .prepare("SELECT * FROM projects WHERE id = ?")
            .get(req.params.id) as any;
          if (!project)
            return res.status(404).json({ error: "Project not found" });

          // Validate Production BoP
          const incompleteBoP = db.prepare(`SELECT COUNT(*) as count FROM bill_of_processes WHERE project_id = ? AND status != 'COMPLETED'`).get(project.id) as any;
          if (incompleteBoP && incompleteBoP.count > 0) {
             return res.status(400).json({ error: `Cannot generate FGR: There are ${incompleteBoP.count} incomplete production steps (BoP).` });
          }

          // Validate active NDPs
          const activeNdp = db.prepare(`SELECT COUNT(*) as count FROM notice_to_down_processes WHERE project_id = ? AND status = 'ACTIVE'`).get(project.id) as any;
          if (activeNdp && activeNdp.count > 0) {
             return res.status(400).json({ error: `Cannot generate FGR: There are ${activeNdp.count} active downtime notices (NDP). Resolve them first.` });
          }

          const existingFg = db.prepare("SELECT * FROM items WHERE item_code = ?").get(`FG-${project.id}`);
          if (existingFg)
            return res.status(400).json({ error: "Finished goods have already been created for this project." });

          // Attempt to find original quotation to derive quantities
          const quotation = project.quotation_id
            ? (db
                .prepare("SELECT * FROM quotations WHERE id = ?")
                .get(project.quotation_id) as any)
            : null;
          const quotationItems = quotation
            ? (db
                .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
                .all(quotation.id) as any[])
            : [];

          const itemId = "ITM-" + crypto.randomUUID();
          const fgCode = `FG-${project.id}`;
          const fgName = project.name;

          const totalQty = project.qty || 1;
          const firstUom = project.uom || "Unit";

          db.transaction(() => {
            db.prepare(
              "INSERT INTO items (id, item_code, name, spec, uom, type) VALUES (?, ?, ?, ?, ?, ?)",
            ).run(
              itemId,
              fgCode,
              fgName,
              `Finished Good for Project ${project.name}`,
              firstUom,
              "FINISHED",
            );
            db.prepare(
              "INSERT INTO inventory (item_id, free_stock, allocated_stock) VALUES (?, ?, ?)",
            ).run(itemId, totalQty, 0);
            db.prepare(
              "INSERT INTO stock_movements (id, item_id, type, qty, reference_id, project_id) VALUES (?, ?, ?, ?, ?, ?)",
            ).run(
              "SMV-" + crypto.randomUUID(),
              itemId,
              "ADJUSTMENT",
              totalQty,
              project.id,
              project.id,
            );

            // Log completion
            db.prepare(
              "UPDATE projects SET status = 'FINISHED', archived_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'FINISHED'",
            ).run(project.id);
          })();

          logAudit(
            (req.headers["x-user-email"] as string) || "SYSTEM",
            "RECORD_FINISHED_GOOD",
            "PROJECT",
            project.id,
            `Recorded ${totalQty} ${firstUom} as Finished Good for project ${project.id}`,
          );
          res.json({ success: true, item_id: itemId, qty: totalQty });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to record finished goods" });
        }
      },
    );

export default router;
