import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const router = Router();

    router.get(
      "/api/dashboard/active-projects-monitor",
      requireRole([
        "ENGINEERING",
        "PURCHASING",
        "PRODUCTION",
        "WAREHOUSE",
        "SALES",
      ]),
      (req, res) => {
        try {
          const activeProjects = db
            .prepare(
              `
        SELECT p.id, p.name, p.status, p.due_date 
        FROM projects p 
        WHERE 1=1 
        AND p.status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED')
        AND p.id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
      `,
            )
            .all() as any[];

          if (activeProjects.length === 0) {
            return res.json([]);
          }

          const projectIds = activeProjects.map((p) => p.id);
          const placeholders = projectIds.map(() => "?").join(",");

          const prItemsByProject = db
            .prepare(
              `
        SELECT pr.project_id, COUNT(DISTINCT pri.item_id) as count
        FROM purchase_requests pr 
        JOIN pr_items pri ON pr.id = pri.pr_id 
        WHERE pr.archived_at IS NULL AND pr.project_id IN (${placeholders})
        GROUP BY pr.project_id
      `,
            )
            .all(...projectIds) as any[];

          const stockItemsByProject = db
            .prepare(
              `
        SELECT b.project_id, COUNT(DISTINCT b.item_id) as count
        FROM boms b
        JOIN inventory inv ON b.item_id = inv.item_id
        WHERE b.project_id IN (${placeholders}) AND inv.free_stock > 0 AND b.required_qty > 0
        GROUP BY b.project_id
      `,
            )
            .all(...projectIds) as any[];

          const prQtyByProject = db
            .prepare(
              `
        SELECT pr.project_id, COALESCE(SUM(pri.qty), 0) as total
        FROM purchase_requests pr
        JOIN pr_items pri ON pr.id = pri.pr_id
        WHERE pr.project_id IN (${placeholders}) AND pr.status != 'CANCELLED'
        GROUP BY pr.project_id
      `,
            )
            .all(...projectIds) as any[];

          const receivedQtyByProject = db
            .prepare(
              `
        SELECT pr.project_id, COALESCE(SUM(gi.qty_received), 0) as total
        FROM purchase_requests pr
        JOIN pr_items pri ON pr.id = pri.pr_id
        JOIN purchase_orders po ON po.id = pri.po_id
        JOIN grns g ON g.po_id = po.id
        JOIN grn_items gi ON gi.grn_id = g.id AND gi.item_id = pri.item_id
        WHERE pr.project_id IN (${placeholders}) AND pr.status != 'CANCELLED' AND g.qc_status IN ('PASSED', 'CONDITIONAL')
        GROUP BY pr.project_id
      `,
            )
            .all(...projectIds) as any[];

          const tasksByProject = db
            .prepare(
              `
        SELECT project_id, id, task_name, start_date, end_date, progress, status, actual_start_date, actual_end_date 
        FROM project_tasks 
        WHERE project_id IN (${placeholders})
        ORDER BY start_date ASC
      `,
            )
            .all(...projectIds) as any[];

          const prMap = new Map(
            prItemsByProject.map((row) => [row.project_id, row.count]),
          );
          const stockMap = new Map(
            stockItemsByProject.map((row) => [row.project_id, row.count]),
          );
          const prQtyMap = new Map(
            prQtyByProject.map((row) => [row.project_id, row.total]),
          );
          const receivedQtyMap = new Map(
            receivedQtyByProject.map((row) => [row.project_id, row.total]),
          );

          const taskMap = new Map<string, any[]>();
          for (const t of tasksByProject) {
            if (!taskMap.has(t.project_id)) taskMap.set(t.project_id, []);
            taskMap.get(t.project_id)!.push(t);
          }

          const monitorData = activeProjects.map((p) => {
            return {
              id: p.id,
              name: p.name,
              status: p.status,
              dueDate: p.due_date,
              prItemCount: prMap.get(p.id) || 0,
              stockItemCount: stockMap.get(p.id) || 0,
              prProgress: {
                total_pr_qty: prQtyMap.get(p.id) || 0,
                total_received_qty: receivedQtyMap.get(p.id) || 0,
              },
              tasks: taskMap.get(p.id) || [],
            };
          });

          res.json(monitorData);
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ error: "Failed to fetch active projects monitor data" });
        }
      },
    );

    router.get(
      "/api/dashboard/pending-actions",
      requireRole([
        "ENGINEERING",
        "PURCHASING",
        "PRODUCTION",
        "WAREHOUSE",
        "SALES",
      ]),
      (req, res) => {
        try {
          const actions = [];

          // 1. URGENT PRs waiting for authorization
          const urgentPrs = db
            .prepare(
              "SELECT pr_number, project_id, urgency FROM purchase_requests WHERE status = 'DRAFTED' AND urgency IN ('URGENT', 'CRITICAL') LIMIT 30",
            )
            .all() as any[];
          urgentPrs.forEach((pr) => {
            actions.push({
              type: "PR_AUTH_URGENT",
              title: `${pr.urgency} PR Authorization`,
              description: `${pr.pr_number} requires IMMEDIATE approval.`,
              link: `/requests`,
              priority: "HIGH",
            });
          });

          // 1b. Normal PRs waiting for authorization
          const pendingPrs = db
            .prepare(
              "SELECT pr_number, project_id FROM purchase_requests WHERE status = 'DRAFTED' AND urgency = 'NORMAL' LIMIT 10",
            )
            .all() as any[];
          pendingPrs.forEach((pr) => {
            actions.push({
              type: "PR_AUTH",
              title: `PR Authorization Required`,
              description: `${pr.pr_number} is waiting for approval.`,
              link: `/requests`,
              priority: "HIGH",
            });
          });

          // 2. POs waiting for receipt (Issued but not received)
          const pendingPos = db
            .prepare(
              "SELECT po_number FROM purchase_orders WHERE status = 'ISSUED' LIMIT 20",
            )
            .all() as any[];
          pendingPos.forEach((po) => {
            actions.push({
              type: "PO_RECEIPT",
              title: `Pending Goods Receipt`,
              description: `${po.po_number} is issued. Awaiting delivery.`,
              link: `/procurement`,
              priority: "MEDIUM",
            });
          });

          // 3. Low stock alerts
          const lowStock = db
            .prepare(
              `
        SELECT i.item_code, inv.free_stock 
        FROM inventory inv 
        JOIN items i ON inv.item_id = i.id 
        WHERE inv.free_stock < 5 
        LIMIT 10
      `,
            )
            .all() as any[];
          lowStock.forEach((item) => {
            actions.push({
              type: "LOW_STOCK",
              title: `Low Stock Alert`,
              description: `${item.item_code} is low (${item.free_stock} left).`,
              link: `/warehouse`,
              priority: "HIGH",
            });
          });

          // 4. Pending Account Requests
          const pendingAccounts = db
            .prepare(
              "SELECT username, role FROM users WHERE status = 'PENDING'",
            )
            .all() as any[];
          pendingAccounts.forEach((account) => {
            actions.push({
              type: "ACCOUNT_APPROVAL",
              title: `Account Request: ${account.username}`,
              description: `${account.username} requested ${account.role} access.`,
              link: `/manage-accounts`,
              priority: "HIGH",
            });
          });

          // 5. Pending Deliveries
          const pendingDeliveries = db
            .prepare(
              "SELECT dn.dn_number, c.name as customer_name FROM delivery_notes dn LEFT JOIN customers c ON dn.customer_id = c.id WHERE dn.status = 'DRAFT'",
            )
            .all() as any[];
          pendingDeliveries.forEach((dn) => {
            actions.push({
              type: "DELIVERY_AUTH",
              title: `Delivery Authorization`,
              description: `${dn.dn_number} for ${dn.customer_name} is awaiting auth.`,
              link: `/deliveries`,
              priority: "HIGH",
            });
          });

          res.json(actions);
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch pending actions" });
        }
      },
    );

