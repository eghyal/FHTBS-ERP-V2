import type Database from "better-sqlite3";
import { calculateTieredOvertimePay } from "../lib/hrisEngine.ts";

export interface ProjectLaborBreakdown {
  totalLaborCost: number;
  regularHours: number;
  overtimeHours: number;
  regularLaborCost: number;
  overtimeLaborCost: number;
  attendanceLaborCost: number;
  overtimeSchedulesCost: number;
  assignmentsCost: number;
  entries: Array<{
    type: "ATTENDANCE" | "OVERTIME_SCHEDULE" | "MANPOWER_ASSIGNMENT";
    sourceId: string;
    personName: string;
    username?: string;
    role?: string;
    date?: string;
    shift?: string;
    hours: number;
    overtimeHours: number;
    hourlyRate: number;
    cost: number;
    status: string;
  }>;
}

export interface ProjectMaterialItem {
  id: string;
  source: "PR_ITEM" | "BOM_ITEM";
  item_code?: string;
  item_name: string;
  qty: number;
  uom: string;
  unit_price: number;
  total_price: number;
  pr_number?: string;
  po_number?: string;
  supplier_name?: string;
}

export interface ProjectMaterialBreakdown {
  totalMaterialCost: number;
  itemCount: number;
  sourceType: "ACTUAL_PR_PO" | "BOM_ESTIMATE";
  items: ProjectMaterialItem[];
}

export interface ProjectHppBreakdown {
  projectId: string;
  projectName: string;
  projectQty: number;

  // OPTION 1: HPP Murni (Direct Material Only)
  materialOnly: {
    totalHpp: number;
    unitHpp: number;
    grossProfit: number;
    grossMarginPct: number;
    materialCount: number;
  };

  // OPTION 2: HPP Komprehensif (Material + Direct Labor + Factory Overhead)
  fullCosting: {
    totalHpp: number;
    unitHpp: number;
    grossProfit: number;
    grossMarginPct: number;
    totalMaterialCost: number;
    totalLaborCost: number;
    totalOverheadCost: number;
    materialPercentage: number;
    laborPercentage: number;
    overheadPercentage: number;
  };

  // Direct backwards-compatible properties
  totalBomCost: number;
  totalLaborCost: number;
  totalOverheadCost: number;
  totalHpp: number;
  unitHpp: number;
  totalRevenue: number;
  grossProfit: number;
  grossMarginPct: number;
  laborBreakdown: ProjectLaborBreakdown;
  materialBreakdown: ProjectMaterialBreakdown;
  lastUpdated: string;
}

/**
 * Calculates accurate Direct Labor Cost (BTKL) for a specific project
 * Integrating factory shifts, daily attendance, and approved overtime schedules.
 */
export function calculateProjectLaborCost(
  db: Database.Database,
  projectId: string,
): ProjectLaborBreakdown {
  const entries: ProjectLaborBreakdown["entries"] = [];
  let attendanceLaborCost = 0;
  let overtimeSchedulesCost = 0;
  let assignmentsCost = 0;
  let totalRegularHours = 0;
  let totalOvertimeHours = 0;
  let totalRegularCost = 0;
  let totalOvertimeCost = 0;

  // 1. Fetch attendance records directly linked to this project (from attendance_db shard)
  try {
    const attendances = db
      .prepare(
        `
      SELECT 
        a.id, a.employee_username, a.date, a.shift, a.work_hours, a.overtime_hours, 
        a.overtime_status, a.hourly_rate, a.labor_cost,
        u.name as employee_name, u.role as employee_role,
        pm.hourly_rate as pm_rate
      FROM attendance_db.hr_attendances a
      LEFT JOIN users u ON a.employee_username = u.username
      LEFT JOIN production_manpower pm ON pm.user_username = a.employee_username
      WHERE a.project_id = ?
      ORDER BY a.date DESC
    `,
      )
      .all(projectId) as any[];

    for (const att of attendances) {
      const rate = Number(att.hourly_rate) || Number(att.pm_rate) || 45000;
      const workHrs = Number(att.work_hours) || 8;
      const otHrs = Number(att.overtime_hours) || 0;
      const regHrs = Math.max(0, workHrs - otHrs);

      const regCost = regHrs * rate;
      const otCalc = calculateTieredOvertimePay(rate * 173, 0, otHrs);
      const otCost = otCalc.totalPay > 0 ? otCalc.totalPay : Math.round(otHrs * rate * 1.5);
      const totalCost = Number(att.labor_cost) > 0 ? Number(att.labor_cost) : regCost + otCost;

      attendanceLaborCost += totalCost;
      totalRegularHours += regHrs;
      totalOvertimeHours += otHrs;
      totalRegularCost += regCost;
      totalOvertimeCost += otCost;

      entries.push({
        type: "ATTENDANCE",
        sourceId: att.id,
        personName: att.employee_name || att.employee_username,
        username: att.employee_username,
        role: att.employee_role || "Factory Staff",
        date: att.date,
        shift: att.shift || "SHIFT_1",
        hours: regHrs,
        overtimeHours: otHrs,
        hourlyRate: rate,
        cost: totalCost,
        status: att.overtime_status || "PRESENT",
      });
    }
  } catch (e) {
    console.warn("Could not query attendance_db for project labor cost:", e);
  }

  // 2. Fetch approved Project Overtime Schedules
  try {
    const overtimeSchedules = db
      .prepare(
        `
      SELECT 
        pos.id, pos.project_id, pos.manpower_id, pos.date, pos.overtime_hours, pos.reason, pos.status,
        pos.hourly_rate, pos.estimated_cost,
        pm.name as operator_name, pm.role as operator_role, pm.user_username,
        COALESCE(pm.hourly_rate, 45000) as default_rate,
        ps.name as station_name
      FROM project_overtime_schedules pos
      LEFT JOIN production_manpower pm ON pos.manpower_id = pm.id
      LEFT JOIN project_stations ps ON pos.station_id = ps.id
      WHERE pos.project_id = ?
      ORDER BY pos.date DESC
    `,
      )
      .all(projectId) as any[];

    for (const ot of overtimeSchedules) {
      if (ot.status === "REJECTED") continue;
      const rate = Number(ot.hourly_rate) || Number(ot.default_rate) || 45000;
      const otHrs = Number(ot.overtime_hours) || 2;
      const otCalc = calculateTieredOvertimePay(rate * 173, 0, otHrs);
      const otCost = Number(ot.estimated_cost) > 0 ? Number(ot.estimated_cost) : (otCalc.totalPay > 0 ? otCalc.totalPay : Math.round(otHrs * rate * 1.5));

      // Avoid double-counting if already recorded by matching attendance record on the same date and username
      const alreadyCountedInAttendance = entries.some(
        (e) => e.type === "ATTENDANCE" && e.username === ot.user_username && e.date === ot.date && e.overtimeHours >= otHrs,
      );

      if (!alreadyCountedInAttendance) {
        overtimeSchedulesCost += otCost;
        totalOvertimeHours += otHrs;
        totalOvertimeCost += otCost;
      }

      entries.push({
        type: "OVERTIME_SCHEDULE",
        sourceId: ot.id,
        personName: ot.operator_name || "Operator",
        username: ot.user_username,
        role: ot.operator_role || "Production Operator",
        date: ot.date,
        hours: 0,
        overtimeHours: otHrs,
        hourlyRate: rate,
        cost: otCost,
        status: ot.status || "APPROVED",
      });
    }
  } catch (e) {
    console.warn("Could not query project_overtime_schedules for labor cost:", e);
  }

  // 3. Fetch completed production manpower assignments
  try {
    const assignments = db
      .prepare(
        `
      SELECT 
        pma.id, pma.assigned_date, pma.planned_hours, pma.actual_hours, pma.status, pma.shift,
        pm.name as operator_name, pm.role as operator_role, pm.user_username,
        COALESCE(pm.hourly_rate, 45000) as hourly_rate
      FROM production_manpower_assignments pma
      LEFT JOIN production_manpower pm ON pma.manpower_id = pm.id
      WHERE pma.project_id = ? AND pma.status IN ('COMPLETED', 'ACTIVE')
    `,
      )
      .all(projectId) as any[];

    for (const pma of assignments) {
      const rate = Number(pma.hourly_rate) || 45000;
      const hours = Number(pma.actual_hours) || Number(pma.planned_hours) || 8;
      const cost = Math.round(hours * rate);

      // Check if already captured in attendance
      const alreadyInAttendance = entries.some(
        (e) => e.type === "ATTENDANCE" && e.username === pma.user_username && e.date === pma.assigned_date,
      );

      if (!alreadyInAttendance) {
        assignmentsCost += cost;
        totalRegularHours += hours;
        totalRegularCost += cost;

        entries.push({
          type: "MANPOWER_ASSIGNMENT",
          sourceId: pma.id,
          personName: pma.operator_name || "Assigned Operator",
          username: pma.user_username,
          role: pma.operator_role || "Operator",
          date: pma.assigned_date,
          shift: pma.shift || "SHIFT_1",
          hours,
          overtimeHours: 0,
          hourlyRate: rate,
          cost,
          status: pma.status,
        });
      }
    }
  } catch (e) {
    console.warn("Could not query production_manpower_assignments for labor cost:", e);
  }

  // Combined total direct labor cost (BTKL)
  const totalLaborCost = totalRegularCost + totalOvertimeCost;

  return {
    totalLaborCost,
    regularHours: Number(totalRegularHours.toFixed(1)),
    overtimeHours: Number(totalOvertimeHours.toFixed(1)),
    regularLaborCost: totalRegularCost,
    overtimeLaborCost: totalOvertimeCost,
    attendanceLaborCost,
    overtimeSchedulesCost,
    assignmentsCost,
    entries,
  };
}

/**
 * Calculates Direct Materials Cost for the Project
 */
export function calculateProjectMaterialCost(
  db: Database.Database,
  projectId: string,
): number {
  // 1. Try actual purchased / allocated PR items
  const actualPR = db
    .prepare(
      `
    SELECT COALESCE(SUM(pri.qty * pri.unit_price), 0) as total_actual
    FROM pr_items pri
    JOIN purchase_requests pr ON pri.pr_id = pr.id
    WHERE pr.project_id = ? AND pr.status != 'CANCELLED'
  `,
    )
    .get(projectId) as { total_actual: number };

  const actualMaterial = Number(actualPR?.total_actual || 0);
  if (actualMaterial > 0) return actualMaterial;

  // 2. Fallback to BOM planned budget
  const bomBudget = db
    .prepare(
      `
    SELECT COALESCE(SUM(b.required_qty * COALESCE(p.qty, 1) * b.unit_price), 0) as total_bom
    FROM boms b
    JOIN projects p ON b.project_id = p.id
    WHERE b.project_id = ?
  `,
    )
    .get(projectId) as { total_bom: number };

  return Number(bomBudget?.total_bom || 0);
}

/**
 * Detailed breakdown of direct materials (PR items or BOM budget fallback)
 */
export function getProjectMaterialBreakdown(
  db: Database.Database,
  projectId: string,
): ProjectMaterialBreakdown {
  const items: ProjectMaterialItem[] = [];
  let totalMaterialCost = 0;

  // 1. Try actual PR Items linked to this project
  try {
    const prRows = db
      .prepare(
        `
      SELECT 
        pri.id, pri.item_id, pri.qty, pri.unit_price, pri.uom,
        pr.pr_number,
        po.po_number,
        s.name as supplier_name,
        COALESCE(i.code, pri.item_id) as item_code,
        COALESCE(i.name, pri.item_id) as item_name
      FROM pr_items pri
      JOIN purchase_requests pr ON pri.pr_id = pr.id
      LEFT JOIN items i ON pri.item_id = i.id
      LEFT JOIN purchase_orders po ON pri.po_id = po.id
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      WHERE pr.project_id = ? AND pr.status != 'CANCELLED'
      ORDER BY pri.id ASC
    `,
      )
      .all(projectId) as any[];

    if (prRows.length > 0) {
      for (const row of prRows) {
        const qty = Number(row.qty || 0);
        const unitPrice = Number(row.unit_price || 0);
        const totalPrice = Math.round(qty * unitPrice);
        totalMaterialCost += totalPrice;

        items.push({
          id: String(row.id),
          source: "PR_ITEM",
          item_code: row.item_code,
          item_name: row.item_name || "Material Item",
          qty,
          uom: row.uom || "PCS",
          unit_price: unitPrice,
          total_price: totalPrice,
          pr_number: row.pr_number,
          po_number: row.po_number,
          supplier_name: row.supplier_name,
        });
      }

      return {
        totalMaterialCost,
        itemCount: items.length,
        sourceType: "ACTUAL_PR_PO",
        items,
      };
    }
  } catch (e) {
    console.warn("Could not fetch PR items for material breakdown:", e);
  }

  // 2. Fallback to BOM item definitions
  try {
    const bomRows = db
      .prepare(
        `
      SELECT 
        b.id, b.item_id, b.required_qty, b.unit_price, b.uom,
        p.qty as project_qty,
        COALESCE(i.code, b.item_id) as item_code,
        COALESCE(i.name, b.item_id) as item_name
      FROM boms b
      JOIN projects p ON b.project_id = p.id
      LEFT JOIN items i ON b.item_id = i.id
      WHERE b.project_id = ?
      ORDER BY b.id ASC
    `,
      )
      .all(projectId) as any[];

    for (const row of bomRows) {
      const projQty = Math.max(1, Number(row.project_qty || 1));
      const qty = Number(row.required_qty || 0) * projQty;
      const unitPrice = Number(row.unit_price || 0);
      const totalPrice = Math.round(qty * unitPrice);
      totalMaterialCost += totalPrice;

      items.push({
        id: String(row.id),
        source: "BOM_ITEM",
        item_code: row.item_code,
        item_name: row.item_name || "BOM Component",
        qty,
        uom: row.uom || "PCS",
        unit_price: unitPrice,
        total_price: totalPrice,
      });
    }

    return {
      totalMaterialCost,
      itemCount: items.length,
      sourceType: "BOM_ESTIMATE",
      items,
    };
  } catch (e) {
    console.warn("Could not fetch BOM items for material breakdown:", e);
  }

  return {
    totalMaterialCost: 0,
    itemCount: 0,
    sourceType: "BOM_ESTIMATE",
    items: [],
  };
}

/**
 * Calculates Factory Overhead (BOP) from machine hours and standard rates
 */
export function calculateProjectOverheadCost(
  db: Database.Database,
  projectId: string,
): number {
  const bopResult = db
    .prepare(
      `
    SELECT COALESCE(SUM(bop.standard_hours * 25000), 0) as total_overhead
    FROM bill_of_processes bop
    WHERE bop.project_id = ?
  `,
    )
    .get(projectId) as { total_overhead: number };

  return Number(bopResult?.total_overhead || 0);
}

/**
 * Complete Project HPP (Harga Pokok Produksi) & Financial Summary Recalculation
 * Calculates both:
 * 1. HPP Murni (Material Only)
 * 2. HPP Komprehensif (+ Variable Lain: Direct Labor & Overhead)
 */
export function recalculateProjectFinancialSummary(
  db: Database.Database,
  projectId: string,
): ProjectHppBreakdown {
  const project = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(projectId) as any;

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const projectQty = Math.max(1, Number(project.qty || 1));
  const projectName = project.name || projectId;

  // 1. Direct Material Breakdown & Cost (Murni)
  const materialBreakdown = getProjectMaterialBreakdown(db, projectId);
  const totalBomCost = materialBreakdown.totalMaterialCost > 0
    ? materialBreakdown.totalMaterialCost
    : calculateProjectMaterialCost(db, projectId);

  // 2. Direct Labor (BTKL) from Shifts, Attendance, and Overtime
  const laborBreakdown = calculateProjectLaborCost(db, projectId);
  const totalLaborCost = laborBreakdown.totalLaborCost;

  // 3. Factory Overhead (BOP)
  const totalOverheadCost = calculateProjectOverheadCost(db, projectId);

  // 4. Total Revenue (from Commercial Invoices or Quotation)
  const invoiceRevenue = db
    .prepare(
      `
    SELECT COALESCE(SUM(grand_total), 0) as total_rev
    FROM commercial_invoices
    WHERE project_id = ? AND status != 'VOID'
  `,
    )
    .get(projectId) as { total_rev: number };

  let totalRevenue = Number(invoiceRevenue?.total_rev || 0);
  if (totalRevenue === 0) {
    const quotePrice = db
      .prepare(
        `
      SELECT COALESCE(SUM(qi.qty * qi.unit_price), 0) as quote_total
      FROM quotation_items qi
      JOIN quotations q ON qi.quotation_id = q.id
      WHERE q.id = ?
    `,
      )
      .get(project.quotation_id || "") as { quote_total: number };
    totalRevenue = Number(quotePrice?.quote_total || 0);
  }

  // --- DUAL OPTION CALCULATIONS ---

  // OPTION 1: HPP Murni (Direct Material Only)
  const materialOnlyHpp = totalBomCost;
  const materialOnlyUnitHpp = Math.round(materialOnlyHpp / projectQty);
  const materialOnlyGrossProfit = totalRevenue - materialOnlyHpp;
  const materialOnlyGrossMarginPct = totalRevenue > 0
    ? Number(((materialOnlyGrossProfit / totalRevenue) * 100).toFixed(2))
    : 0;

  // OPTION 2: HPP Komprehensif (Full Costing: Material + Labor + Overhead)
  const fullHpp = totalBomCost + totalLaborCost + totalOverheadCost;
  const fullUnitHpp = Math.round(fullHpp / projectQty);
  const fullGrossProfit = totalRevenue - fullHpp;
  const fullGrossMarginPct = totalRevenue > 0
    ? Number(((fullGrossProfit / totalRevenue) * 100).toFixed(2))
    : 0;

  const materialPercentage = fullHpp > 0 ? Number(((totalBomCost / fullHpp) * 100).toFixed(1)) : 100;
  const laborPercentage = fullHpp > 0 ? Number(((totalLaborCost / fullHpp) * 100).toFixed(1)) : 0;
  const overheadPercentage = fullHpp > 0 ? Number(((totalOverheadCost / fullHpp) * 100).toFixed(1)) : 0;

  const nowIso = new Date().toISOString();

  // Upsert into project_financial_summaries
  db.prepare(
    `
    INSERT INTO project_financial_summaries (
      project_id, total_revenue, total_bom_cost, total_labor_cost, total_overhead_cost,
      total_cogs, gross_profit, gross_margin_pct,
      material_cogs, full_cogs, gross_profit_material, gross_margin_material_pct,
      gross_profit_full, gross_margin_full_pct, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      total_revenue = excluded.total_revenue,
      total_bom_cost = excluded.total_bom_cost,
      total_labor_cost = excluded.total_labor_cost,
      total_overhead_cost = excluded.total_overhead_cost,
      total_cogs = excluded.total_cogs,
      gross_profit = excluded.gross_profit,
      gross_margin_pct = excluded.gross_margin_pct,
      material_cogs = excluded.material_cogs,
      full_cogs = excluded.full_cogs,
      gross_profit_material = excluded.gross_profit_material,
      gross_margin_material_pct = excluded.gross_margin_material_pct,
      gross_profit_full = excluded.gross_profit_full,
      gross_margin_full_pct = excluded.gross_margin_full_pct,
      last_updated = excluded.last_updated
  `,
  ).run(
    projectId,
    totalRevenue,
    totalBomCost,
    totalLaborCost,
    totalOverheadCost,
    fullHpp,
    fullGrossProfit,
    fullGrossMarginPct,
    materialOnlyHpp,
    fullHpp,
    materialOnlyGrossProfit,
    materialOnlyGrossMarginPct,
    fullGrossProfit,
    fullGrossMarginPct,
    nowIso,
  );

  return {
    projectId,
    projectName,
    projectQty,

    // OPTION 1: Murni (Material Only)
    materialOnly: {
      totalHpp: materialOnlyHpp,
      unitHpp: materialOnlyUnitHpp,
      grossProfit: materialOnlyGrossProfit,
      grossMarginPct: materialOnlyGrossMarginPct,
      materialCount: materialBreakdown.itemCount,
    },

    // OPTION 2: Komprehensif (Full Variable)
    fullCosting: {
      totalHpp: fullHpp,
      unitHpp: fullUnitHpp,
      grossProfit: fullGrossProfit,
      grossMarginPct: fullGrossMarginPct,
      totalMaterialCost: totalBomCost,
      totalLaborCost,
      totalOverheadCost,
      materialPercentage,
      laborPercentage,
      overheadPercentage,
    },

    // Direct backwards-compatible fields
    totalBomCost,
    totalLaborCost,
    totalOverheadCost,
    totalHpp: fullHpp,
    unitHpp: fullUnitHpp,
    totalRevenue,
    grossProfit: fullGrossProfit,
    grossMarginPct: fullGrossMarginPct,
    laborBreakdown,
    materialBreakdown,
    lastUpdated: nowIso,
  };
}
