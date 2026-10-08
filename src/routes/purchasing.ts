import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { syncCollectionToFirestore } from "../db/firebaseSync.ts";
import { syncProcurementTaskGantt } from "../utils/ganttUtils.ts";
import { calculateFinancialBreakdown, type TaxScheme } from "../lib/financialEngine.ts";
import { postGoodsReceiptJournal } from "../utils/accountingBridge.ts";
import { syncProjectMaterialAndWakeProcesses } from "./production/production_utils.ts";
import { cacheService } from "../services/cacheService.ts";
import { outboxService } from "../services/outboxService.ts";

export const purchasingRouter = Router();

    purchasingRouter.get(
      "/api/suppliers",
      requireRole(["PURCHASING", "WAREHOUSE", "FC", "ENGINEERING", "PRODUCTION", "SALES", "ADMIN"]),
      (req, res) => {
        try {
          const cacheKey = "suppliers:all";
          const cached = cacheService.get<any[]>(cacheKey);
          if (cached) return res.json(cached);

          const suppliers = db
            .prepare(
              `
        SELECT 
          s.*,
          (
            SELECT COUNT(g.id) 
            FROM grns g 
            JOIN purchase_orders po ON po.id = g.po_id 
            WHERE po.supplier_id = s.id AND g.qc_status = 'REJECTED'
          ) as rejected_count,
          (
            SELECT COUNT(g.id) 
            FROM grns g 
            JOIN purchase_orders po ON po.id = g.po_id 
            WHERE po.supplier_id = s.id AND g.qc_status = 'PASSED'
          ) as passed_count,
          (
            SELECT COUNT(po.id) 
            FROM purchase_orders po
            WHERE po.supplier_id = s.id
          ) as total_orders
        FROM suppliers s 
        ORDER BY s.name ASC
      `,
            )
            .all();

          cacheService.set(cacheKey, suppliers, 180, "suppliers");
          res.json(suppliers);
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch suppliers" });
        }
      },
    );

    purchasingRouter.get(
      "/api/purchasing/suppliers-by-items",
      requireRole(["PURCHASING", "WAREHOUSE", "FC", "ENGINEERING"]),
      (req, res) => {
        try {
          const itemIdsQuery = req.query.item_ids as string;
          const itemIds = itemIdsQuery
            ? itemIdsQuery.split(",").map((s) => s.trim()).filter(Boolean)
            : [];

          const suppliers = db
            .prepare(
              `
              SELECT 
                s.*,
                (
                  SELECT COUNT(g.id) 
                  FROM grns g 
                  JOIN purchase_orders po ON po.id = g.po_id 
                  WHERE po.supplier_id = s.id AND g.qc_status = 'REJECTED'
                ) as rejected_count,
                (
                  SELECT COUNT(g.id) 
                  FROM grns g 
                  JOIN purchase_orders po ON po.id = g.po_id 
                  WHERE po.supplier_id = s.id AND g.qc_status = 'PASSED'
                ) as passed_count,
                (
                  SELECT COUNT(po.id) 
                  FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id 
                  WHERE po.supplier_id = s.id
                ) as total_orders
              FROM suppliers s 
              ORDER BY s.name ASC
            `,
            )
            .all() as any[];

          const mappedSuppliers = suppliers.map((sup) => {
            const passed = sup.passed_count || 0;
            const rejected = sup.rejected_count || 0;
            const totalGrns = passed + rejected;
            const onTimeScore =
              totalGrns > 0 ? Math.round((passed / totalGrns) * 100) : 95;

            // Fetch custom item prices for this supplier
            const item_prices: { item_id: string; unit_price: number }[] = [];
            if (itemIds.length > 0) {
              const placeholders = itemIds.map(() => "?").join(",");
              const prices = db
                .prepare(
                  `SELECT item_id, unit_price FROM item_supplier_prices WHERE supplier_id = ? AND item_id IN (${placeholders})`,
                )
                .all(sup.id, ...itemIds) as {
                item_id: string;
                unit_price: number;
              }[];
              prices.forEach((p) => {
                item_prices.push(p);
              });
            }

            const fulfilledCount = item_prices.length;
            const totalItemsInBatch = itemIds.length || 1;
            const matchPercent = Math.min(
              100,
              Math.round((fulfilledCount / totalItemsInBatch) * 100),
            );
            const proximityKm =
              (parseInt(sup.id.replace(/\D/g, ""), 10) % 25) + 3 || 12;
            const leadTimeDays = Math.max(2, Math.round(proximityKm / 5));
            const compositeScore = Math.round(
              matchPercent * 0.5 +
                onTimeScore * 0.4 +
                Math.max(0, 100 - proximityKm * 2) * 0.1,
            );

            return {
              ...sup,
              item_prices,
              matchPercent,
              fulfilledCount,
              totalItemsInBatch,
              proximityKm,
              leadTimeDays,
              onTimeScore,
              compositeScore,
            };
          });

          res.json(mappedSuppliers);
        } catch (error) {
          console.error("Failed to fetch suppliers by items:", error);
          res.status(500).json({ error: "Failed to fetch suppliers by items" });
        }
      },
    );

    purchasingRouter.post(
      "/api/suppliers",
      requireRole(["FC", "PURCHASING"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (
          userRole !== "FC" &&
          (userRole !== "PURCHASING" || userLevel !== "MANAGER")
        ) {
          return res
            .status(403)
            .json({
              error:
                "Access denied. Only FC or Purchasing Manager can manage vendors.",
            });
        }
        try {
          const { name, code, contact_person, email, phone, address, npwp, tax_scheme, payment_terms } =
            req.body;
          const id = "SUP-" + Math.random().toString(36).substr(2, 9);
          db.prepare(
            "INSERT INTO suppliers (id, name, code, contact_person, email, phone, address, npwp, tax_scheme, payment_terms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ).run(
            id,
            name,
            code || null,
            contact_person || null,
            email || null,
            phone || null,
            address || null,
            npwp || null,
            tax_scheme || "DPP_NILAI_LAIN",
            payment_terms || "Net 30 Days",
          );
          
          syncCollectionToFirestore("suppliers", id, {
            id,
            name,
            code: code || null,
            contact_person: contact_person || null,
            email: email || null,
            phone: phone || null,
            address: address || null,
            npwp: npwp || null,
            tax_scheme: tax_scheme || "DPP_NILAI_LAIN",
            payment_terms: payment_terms || "Net 30 Days",
          });

          cacheService.invalidateNamespace("suppliers");
          outboxService.enqueue(
            db,
            "SUPPLIERS",
            id,
            "CREATE",
            { id, name, code, contact_person, email, phone, address, created_at: new Date().toISOString() },
            "BOTH"
          );

          res.json({ success: true, id });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to create supplier" });
        }
      },
    );

    purchasingRouter.put(
      "/api/suppliers/:id",
      requireRole(["FC", "PURCHASING"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (
          userRole !== "FC" &&
          (userRole !== "PURCHASING" || userLevel !== "MANAGER")
        ) {
          return res
            .status(403)
            .json({
              error:
                "Access denied. Only FC or Purchasing Manager can manage vendors.",
            });
        }
        try {
          const { name, code, contact_person, email, phone, address, npwp, tax_scheme, payment_terms } =
            req.body;
          db.prepare(
            `
          UPDATE suppliers 
          SET name = ?, code = ?, contact_person = ?, email = ?, phone = ?, address = ?, npwp = ?, tax_scheme = ?, payment_terms = ?
          WHERE id = ?
        `,
          ).run(
            name,
            code,
            contact_person,
            email,
            phone,
            address,
            npwp || null,
            tax_scheme || "DPP_NILAI_LAIN",
            payment_terms || "Net 30 Days",
            req.params.id,
          );
          
          syncCollectionToFirestore("suppliers", req.params.id, {
            id: req.params.id,
            name,
            code,
            contact_person,
            email,
            phone,
            address,
            npwp: npwp || null,
            tax_scheme: tax_scheme || "DPP_NILAI_LAIN",
            payment_terms: payment_terms || "Net 30 Days",
          });
          cacheService.invalidateNamespace("suppliers");
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to update supplier" });
        }
      },
    );

    purchasingRouter.delete(
      "/api/suppliers/:id",
      requireRole(["FC", "PURCHASING"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (
          userRole !== "FC" &&
          (userRole !== "PURCHASING" || userLevel !== "MANAGER")
        ) {
          return res
            .status(403)
            .json({
              error:
                "Access denied. Only FC or Purchasing Manager can manage vendors.",
            });
        }
        try {
          // Check if supplier has any POs
          const poCount = (
            db
              .prepare(
                "SELECT COUNT(*) as count FROM purchase_orders WHERE supplier_id = ?",
              )
              .get(req.params.id) as any
          ).count;
          if (poCount > 0) {
            return res.status(400).json({
              error: "Cannot delete supplier with active purchase orders.",
            });
          }
          db.transaction(() => {
            db.prepare(
              "DELETE FROM item_supplier_prices WHERE supplier_id = ?",
            ).run(req.params.id);
            db.prepare(
              "DELETE FROM item_price_history WHERE supplier_id = ?",
            ).run(req.params.id);
            db.prepare("DELETE FROM suppliers WHERE id = ?").run(req.params.id);
          })();
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to delete supplier" });
        }
      },
    );

    // Project Cost Summary
    purchasingRouter.post(
      "/api/purchasing/pr/:id/cancel",
      requireRole(["PURCHASING", "ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        try {
          const pr = db
            .prepare("SELECT status FROM purchase_requests WHERE id = ?")
            .get(req.params.id) as any;
          if (pr && pr.status === "ORDERED") {
            return res.status(400).json({
              error:
                "Cannot cancel a PR that has already been converted to a PO.",
            });
          }
          db.transaction(() => {
            db.prepare(
              "UPDATE purchase_requests SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(req.params.id);
            db.prepare(
              "UPDATE project_tasks SET status = 'CANCELLED' WHERE pr_id = ?",
            ).run(req.params.id);
          })();
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to cancel PR" });
        }
      },
    );

    // Update/Revise PR
    purchasingRouter.put(
      "/api/purchasing/pr/:id",
      requireRole(["PURCHASING", "ENGINEERING", "PRODUCTION", "FC"]),
      (req, res) => {
        try {
          const { urgency, expected_delivery_date, remarks, items } = req.body;
          const prId = req.params.id;

          const pr = db
            .prepare("SELECT * FROM purchase_requests WHERE id = ?")
            .get(prId) as any;
          if (!pr) return res.status(404).json({ error: "PR not found" });

          db.transaction(() => {
            db.prepare(
              `
              UPDATE purchase_requests 
              SET urgency = COALESCE(?, urgency), 
                  status = 'DRAFTED', 
                  revision_note = NULL,
                  expected_delivery_date = COALESCE(?, expected_delivery_date),
                  remarks = COALESCE(?, remarks)
              WHERE id = ?
            `,
            ).run(
              urgency || null,
              expected_delivery_date || null,
              remarks || null,
              prId,
            );

            if (items && Array.isArray(items)) {
              const itemIds = items.map((i: any) => i.item_id);
              if (itemIds.length > 0) {
                const placeholders = itemIds.map(() => "?").join(",");
                db.prepare(
                  `DELETE FROM pr_items WHERE pr_id = ? AND item_id NOT IN (${placeholders})`,
                ).run(prId, ...itemIds);
              } else {
                db.prepare(`DELETE FROM pr_items WHERE pr_id = ?`).run(prId);
              }
              for (const item of items) {
                if (!item.item_id) continue;
                const existingItem = db
                  .prepare("SELECT id FROM items WHERE id = ?")
                  .get(item.item_id);
                if (!existingItem) {
                  db.prepare(
                    "INSERT INTO items (id, item_code, name, uom, category) VALUES (?, ?, ?, ?, 'RAW')",
                  ).run(
                    item.item_id,
                    item.item_code || `RAW-${item.item_id}`,
                    item.name || "Custom Item",
                    item.uom || "Unit",
                  );
                }

                const updated = db
                  .prepare(
                    `
                  UPDATE pr_items
                  SET qty = ?, expected_delivery_date = ?, unit_price = COALESCE(?, unit_price)
                  WHERE pr_id = ? AND item_id = ?
                `,
                  )
                  .run(
                    item.qty_to_order,
                    item.expected_delivery_date || null,
                    item.unit_price || null,
                    prId,
                    item.item_id,
                  );

                if (updated.changes === 0) {
                  db.prepare(
                    `
                        INSERT INTO pr_items (id, pr_id, item_id, dimension, spec, qty, unit_price, expected_delivery_date) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                     `,
                  ).run(
                    "PRI-" + Math.random().toString(36).substr(2, 9),
                    prId,
                    item.item_id,
                    item.dimension || "",
                    item.spec || "",
                    item.qty_to_order,
                    item.unit_price || 0,
                    item.expected_delivery_date || null,
                  );
                }
              }
            }
          })();

          logAudit(
            (req.headers["x-user-email"] as string) || null,
            "UPDATE_PR",
            "PURCHASE_REQUEST",
            prId,
            `Revised PR ${pr.pr_number}`,
          );

          res.json({ success: true, message: "PR updated successfully" });
        } catch (error: any) {
          console.error(error);
          res
            .status(500)
            .json({ error: "Failed to update PR", details: error.message });
        }
      },
    );

    // Delete PR
    purchasingRouter.delete(
      "/api/purchasing/pr/:id",
      requireRole(["PURCHASING", "ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        try {
          const pr = db
            .prepare("SELECT status FROM purchase_requests WHERE id = ?")
            .get(req.params.id) as any;
          if (pr && pr.status === "ORDERED") {
            return res.status(400).json({
              error:
                "Cannot delete a PR that has already been converted to a PO.",
            });
          }
          const transaction = db.transaction(() => {
            db.prepare(
              "UPDATE purchase_requests SET archived_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(req.params.id);
          });
          transaction();
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to delete PR" });
        }
      },
    );

    // Clear PRs
    purchasingRouter.post(
      "/api/purchasing/clear-prs",
      requireRole(["PURCHASING"]),
      (req, res) => {
        try {
          db.prepare(
            "UPDATE purchase_requests SET archived = 1 WHERE status IN ('ORDERED', 'CANCELLED')",
          ).run();
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to clear PRs" });
        }
      },
    );

    // Archive Single PR
    purchasingRouter.post(
      "/api/purchasing/archive-pr/:id",
      requireRole(["PURCHASING"]),
      (req, res) => {
        try {
          db.prepare(
            "UPDATE purchase_requests SET archived = 1 WHERE id = ?",
          ).run(req.params.id);
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to archive individual PR" });
        }
      },
    );

    // Clear POs
    purchasingRouter.post(
      "/api/purchasing/clear-pos",
      requireRole(["PURCHASING"]),
      (req, res) => {
        try {
          db.prepare(
            "UPDATE purchase_orders SET archived = 1 WHERE status IN ('FINISHED', 'CANCELLED', 'RECEIVED')",
          ).run();
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to clear POs" });
        }
      },
    );

    // Archive Single PO
    purchasingRouter.post(
      "/api/purchasing/archive-po/:id",
      requireRole(["PURCHASING"]),
      (req, res) => {
        try {
          db.prepare(
            "UPDATE purchase_orders SET archived = 1 WHERE id = ?",
          ).run(req.params.id);
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to archive individual PO" });
        }
      },
    );

    // Get all PRs (for BOM page)
    purchasingRouter.get(
      "/api/purchasing/prs",
      requireRole(["PURCHASING", "ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        try {
          const prs = db
            .prepare(
              `
        SELECT 
          pr.*, 
          COALESCE(p.name, pr.project_id) as project_name, 
          s.spk_number,
          COUNT(pri.id) as item_count
        FROM purchase_requests pr
        LEFT JOIN projects p ON pr.project_id = p.id
        LEFT JOIN spks s ON pr.spk_id = s.id OR p.spk_id = s.id
        LEFT JOIN pr_items pri ON pr.id = pri.pr_id
        WHERE pr.archived = 0 AND (pr.status != 'CANCELLED' OR (pr.status = 'CANCELLED' AND pr.cancelled_at >= datetime('now', '-1 day')))
        GROUP BY pr.id
        ORDER BY pr.created_at DESC
      `,
            )
            .all();
          res.json(prs);
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch PRs" });
        }
      },
    );

    // Get PR details (supports lookup by internal UUID ID or public PR number)
    purchasingRouter.get(
      "/api/purchasing/pr/:id",
      requireRole(["PURCHASING", "ENGINEERING", "PRODUCTION", "WAREHOUSE"]),
      (req, res) => {
        try {
          let pr = db
            .prepare(
              `
        SELECT 
          pr.*, 
          COALESCE(p.name, pr.project_id) as project_name,
          s.spk_number
        FROM purchase_requests pr
        LEFT JOIN projects p ON pr.project_id = p.id
        LEFT JOIN spks s ON pr.spk_id = s.id OR p.spk_id = s.id
        WHERE pr.id = ?
      `,
            )
            .get(req.params.id) as any;

          // Fallback: If not found by primary ID, try looking up by the public PR Number
          if (!pr) {
            pr = db
              .prepare(
                `
          SELECT 
            pr.*, 
            COALESCE(p.name, pr.project_id) as project_name,
            s.spk_number
          FROM purchase_requests pr
          LEFT JOIN projects p ON pr.project_id = p.id
          LEFT JOIN spks s ON pr.spk_id = s.id OR p.spk_id = s.id
          WHERE pr.pr_number = ?
        `,
              )
              .get(req.params.id) as any;
          }

          if (!pr) return res.status(404).json({ error: "PR not found" });

          const items = db
            .prepare(
              `
        SELECT pri.*, i.item_code, i.name as item_name, i.uom
        FROM pr_items pri
        LEFT JOIN items i ON pri.item_id = i.id
        WHERE pri.pr_id = ?
      `,
            )
            .all(pr.id);

          res.json({ ...pr, items });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch PR details" });
        }
      },
    );

    // Revise PR
    purchasingRouter.post(
      "/api/purchasing/revise-pr",
      requireRole(["ENGINEERING", "FC"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (
          userRole !== "FC" &&
          (userRole !== "ENGINEERING" || userLevel !== "MANAGER")
        ) {
          return res.status(403).json({
            error:
              "Access denied. Only Engineering Managers or FC accounts can revise Purchase Requisitions.",
          });
        }
        try {
          const { pr_id, revision_note } = req.body;
          if (!revision_note) {
            return res.status(400).json({ error: "Revision note is required" });
          }

          db.prepare(
            "UPDATE purchase_requests SET status = 'REVISION', revision_note = ? WHERE id = ?",
          ).run(revision_note, pr_id);

          const pr = db
            .prepare("SELECT pr_number FROM purchase_requests WHERE id = ?")
            .get(pr_id) as any;

          logAudit(
            req.headers["x-user-email"] as string,
            "REVISE_PR",
            "PR",
            pr_id,
            `PR ${pr?.pr_number} marked for revision. Note: ${revision_note}`,
          );

          res.json({ success: true, message: "PR marked for revision" });
        } catch (error) {
          console.error("Failed to revise PR:", error);
          res.status(500).json({ error: "Failed to revise PR" });
        }
      },
    );

    // Authorize PR
    purchasingRouter.post("/api/purchasing/authorize-pr", (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;

      try {
        const { pr_id, authorized_doc } = req.body;

        const prDoc = db
          .prepare("SELECT * FROM purchase_requests WHERE id = ?")
          .get(pr_id) as any;
        if (!prDoc) return res.status(404).json({ error: "PR not found" });

        const isDirectlyAuthorized =
          userRole === "FC" ||
          (userRole === "ENGINEERING" && userLevel === "MANAGER");
        const isEscalatedAuthority =
          prDoc.escalated_to && userRole === prDoc.escalated_to;

        if (!isDirectlyAuthorized && !isEscalatedAuthority) {
          return res.status(403).json({
            error:
              "Access denied. Only Engineering Managers, FC accounts or Escalated personnel can authorize Purchase Requisitions.",
          });
        }

        db.prepare(
          "UPDATE purchase_requests SET status = 'AUTHORIZED', authorized_at = CURRENT_TIMESTAMP, authorized_doc = ? WHERE id = ?",
        ).run(authorized_doc, pr_id);

        const pr = db
          .prepare("SELECT pr_number FROM purchase_requests WHERE id = ?")
          .get(pr_id) as any;
        logAudit(
          req.headers["x-user-email"] as string,
          "AUTHORIZE_PR",
          "PR",
          pr_id,
          `PR ${pr?.pr_number} authorized with doc: ${authorized_doc}`,
        );

        // Update Gantt Chart adapts to newly authorized PR
        syncProcurementTaskGantt(pr_id);

        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to authorize PR" });
      }
    });

    // Get all pending PR items (Only Authorized ones)
    purchasingRouter.get(
      "/api/purchasing/pending-prs",
      requireRole(["PURCHASING", "WAREHOUSE"]),
      (req, res) => {
        try {
          const pendingPrs = db
            .prepare(
              `
        SELECT 
          pri.id as pr_item_id,
          pr.id as pr_id,
          i.id as item_id,
          pr.pr_number,
          pr.project_id,
          p.name as project_name,
          i.item_code,
          i.name as item_name,
          i.type as item_type,
          pri.dimension,
          pri.spec,
          pri.qty,
          i.uom,
          i.unit_price,
          pr.created_at,
          pri.expected_delivery_date,
          pr.drawing_reference,
          pr.status,
          pr.urgency
        FROM pr_items pri
        JOIN purchase_requests pr ON pri.pr_id = pr.id
        JOIN projects p ON pr.project_id = p.id
        JOIN items i ON pri.item_id = i.id
        WHERE pri.po_id IS NULL AND pr.archived = 0 AND p.status = 'ACTIVE' AND 
          (pr.status NOT IN ('DRAFTED', 'CANCELLED') OR (pr.status = 'CANCELLED' AND pr.cancelled_at >= datetime('now', '-1 day')))
        ORDER BY pr.created_at ASC
      `,
            )
            .all();
          res.json(pendingPrs);
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch pending PRs" });
        }
      },
    );

    // Create Purchase Order (PO) - Starts as DRAFTED
    purchasingRouter.post(
      "/api/purchasing/create-po",
      requireRole(["PURCHASING"]),
      (req, res) => {
        try {
          const {
            supplier_id,
            supplier_name,
            pr_item_ids,
            auth_doc_name,
            urgency,
            tax_category,
            tax_scheme,
            ppn_rate,
            pph_rate,
            service_amount,
            payment_terms,
            supplier_npwp,
            rounding_factor,
          } = req.body;
          let { expected_date } = req.body;

          const category = tax_category || "GOODS";
          const parsedPpnRate = ppn_rate !== undefined && ppn_rate !== null ? Number(ppn_rate) : 12;
          const parsedPphRate = pph_rate !== undefined && pph_rate !== null ? Number(pph_rate) : (category === "SERVICES" ? 2 : 0);

          // Retrieve supplier defaults if available
          let defaultNpwp = supplier_npwp || null;
          let defaultTaxScheme = tax_scheme || (parsedPpnRate === 0 ? "NON_PKP" : "DPP_NILAI_LAIN");
          let defaultPaymentTerms = payment_terms || "Net 30 Days";

          if (supplier_id) {
            const supRow = db.prepare("SELECT npwp, tax_scheme, payment_terms FROM suppliers WHERE id = ?").get(supplier_id) as any;
            if (supRow) {
              if (!defaultNpwp && supRow.npwp) defaultNpwp = supRow.npwp;
              if (!tax_scheme && supRow.tax_scheme) defaultTaxScheme = supRow.tax_scheme;
              if (!payment_terms && supRow.payment_terms) defaultPaymentTerms = supRow.payment_terms;
            }
          }

          const poId = "PO-" + Math.random().toString(36).substr(2, 9);
          const poNumber =
            "PO-" +
            new Date().getFullYear() +
            "-" +
            Math.floor(100000 + Math.random() * 900000);

          const insertPo = db.prepare(
            `INSERT INTO purchase_orders (
              id, po_number, supplier_id, supplier_name, supplier_npwp, expected_date, auth_doc_name, 
              status, urgency, tax_category, tax_scheme, ppn_rate, pph_rate, payment_terms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFTED', ?, ?, ?, ?, ?, ?)`,
          );
          const updatePrItem = db.prepare(
            "UPDATE pr_items SET po_id = ? WHERE id = ?",
          );
          const checkPrStatus = db.prepare(`
        SELECT COUNT(*) as pending_count 
        FROM pr_items 
        WHERE pr_id = (SELECT pr_id FROM pr_items WHERE id = ?) AND po_id IS NULL
      `);
          const updatePrStatus = db.prepare(
            "UPDATE purchase_requests SET status = 'ORDERED' WHERE id = (SELECT pr_id FROM pr_items WHERE id = ?)",
          );

          const transaction = db.transaction(() => {
            // Safety check: ensure all PR items belong to ACTIVE projects
            if (pr_item_ids && pr_item_ids.length > 0) {
              const placeholders = pr_item_ids.map(() => "?").join(",");
              const inactiveProjects = db
                .prepare(
                  `
            SELECT DISTINCT p.id, p.name, p.status 
            FROM pr_items pri
            JOIN purchase_requests pr ON pri.pr_id = pr.id
            JOIN projects p ON pr.project_id = p.id
            WHERE pri.id IN (${placeholders}) AND p.status != 'ACTIVE' AND pr.project_id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
          `,
                )
                .all(...pr_item_ids) as any[];

              if (inactiveProjects.length > 0) {
                throw new Error(
                  `Cannot create PO for projects that are not ACTIVE: ${inactiveProjects.map((p) => `${p.name} (${p.status})`).join(", ")}`,
                );
              }
            }

            if (!expected_date && pr_item_ids && pr_item_ids.length > 0) {
              const placeholders = pr_item_ids.map(() => "?").join(",");
              const minDateRow = db
                .prepare(
                  `SELECT MIN(expected_delivery_date) as min_date FROM pr_items WHERE id IN (${placeholders}) AND expected_delivery_date IS NOT NULL`,
                )
                .get(...pr_item_ids) as { min_date: string };
              expected_date = minDateRow?.min_date || null;
            }

            insertPo.run(
              poId,
              poNumber,
              supplier_id || null,
              supplier_name,
              defaultNpwp,
              expected_date || null,
              auth_doc_name || null,
              urgency || "NORMAL",
              category,
              defaultTaxScheme,
              parsedPpnRate,
              parsedPphRate,
              defaultPaymentTerms,
            );

            let totalAmount = 0;
            for (const prItemId of pr_item_ids) {
              // Get the item_id and requested qty for this PR item
              const prItemInfo = db
                .prepare(
                  "SELECT item_id, qty, unit_price as requested_price, po_id FROM pr_items WHERE id = ?",
                )
                .get(prItemId) as any;
                
              if (prItemInfo.po_id) {
                 throw new Error("One or more PR items are already assigned to another PO.");
              }

              // Get the supplier specific price from the matrix
              const supplierPriceRow = db
                .prepare(
                  "SELECT unit_price FROM item_supplier_prices WHERE item_id = ? AND supplier_id = ?",
                )
                .get(prItemInfo.item_id, supplier_id) as
                { unit_price: number } | undefined;

              // Use supplier price if found, otherwise fallback to item's current price, then finally PR's requested price
              let finalUnitPrice = supplierPriceRow?.unit_price;
              if (finalUnitPrice === undefined) {
                const globalItemPrice = db
                  .prepare("SELECT unit_price FROM items WHERE id = ?")
                  .get(prItemInfo.item_id) as { unit_price: number };
                finalUnitPrice =
                  globalItemPrice?.unit_price ||
                  prItemInfo.requested_price ||
                  0;
              }

              updatePrItem.run(poId, prItemId);

              // Update the PR item with the FINAL unit price used in the PO
              db.prepare("UPDATE pr_items SET unit_price = ? WHERE id = ?").run(
                finalUnitPrice,
                prItemId,
              );

              totalAmount += Number(prItemInfo.qty) * finalUnitPrice;

              // Check if all items in the PR are ordered, if so update PR status
              const { pending_count } = checkPrStatus.get(prItemId) as any;
              if (pending_count === 0) {
                updatePrStatus.run(prItemId);
              } else {
                db.prepare(
                  "UPDATE purchase_requests SET status = 'PARTIAL_ORDERED' WHERE id = (SELECT pr_id FROM pr_items WHERE id = ?)",
                ).run(prItemId);
              }
            }

            const breakdown = calculateFinancialBreakdown({
              dpp: totalAmount,
              taxRate: parsedPpnRate,
              pphRate: parsedPphRate,
              taxScheme: defaultTaxScheme as TaxScheme,
              roundingFactor: rounding_factor !== undefined && rounding_factor !== null ? Number(rounding_factor) : 0,
            });

            db.prepare(
              `UPDATE purchase_orders 
               SET total_amount = ?, dpp = ?, dpp_nilai_lain = ?, ppn = ?, pph = ?, rounding_factor = ?, grand_total = ?, tax_scheme = ? 
               WHERE id = ?`,
            ).run(
              breakdown.dpp, 
              breakdown.dpp, 
              breakdown.dppNilaiLain, 
              breakdown.ppnAmount, 
              breakdown.pphAmount, 
              breakdown.roundingFactor, 
              breakdown.grandTotal, 
              breakdown.taxScheme, 
              poId
            );
            return poNumber;
          });

          const finalPoNumber = transaction();
          
          try {
            const poRow = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(poId) as any;
            if (poRow) {
              syncCollectionToFirestore("purchase_orders", poId, poRow);
            }
            if (pr_item_ids && pr_item_ids.length > 0) {
              for (const prItemId of pr_item_ids) {
                const prItemRow = db.prepare("SELECT * FROM pr_items WHERE id = ?").get(prItemId) as any;
                if (prItemRow) {
                  syncCollectionToFirestore("pr_items", prItemId, prItemRow);
                }
              }
            }
          } catch (syncErr) {
            console.error("Firestore sync error for PO creation:", syncErr);
          }

          logAudit(
            req.headers["x-user-email"] as string,
            "CREATE_PO",
            "PO",
            poId,
            `PO ${finalPoNumber} created for ${supplier_name}`,
          );

          // Update affected PR tasks in Gantt
          try {
            if (pr_item_ids && pr_item_ids.length > 0) {
              const placeholders = pr_item_ids.map(() => "?").join(",");
              const prIds = db
                .prepare(
                  `SELECT DISTINCT pr_id FROM pr_items WHERE id IN (${placeholders})`,
                )
                .all(...pr_item_ids) as { pr_id: string }[];
              for (const { pr_id } of prIds) {
                syncProcurementTaskGantt(pr_id);
              }
            }
          } catch (err) {
            console.error("Post-PO Gantt sync failed:", err);
          }

          res.json({ success: true, id: poId, po_number: finalPoNumber });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to create PO" });
        }
      },
    );

    // Cancel PO
    purchasingRouter.post(
      "/api/purchasing/po/:id/cancel",
      requireRole(["PURCHASING"]),
      (req, res) => {
        try {
          const poId = req.params.id;

          const hasGrns =
            (
              db
                .prepare("SELECT COUNT(*) as count FROM grns WHERE po_id = ?")
                .get(poId) as any
            ).count > 0;
          if (hasGrns) {
            return res.status(400).json({
              error:
                "Cannot cancel a PO that has receipt records (GRN). Please contact warehouse to revert first.",
            });
          }

          db.transaction(() => {
            db.prepare(
              "UPDATE purchase_orders SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(poId);

            // Find PRs that were ordered via this PO
            const prIds = db
              .prepare("SELECT DISTINCT pr_id FROM pr_items WHERE po_id = ?")
              .all(poId) as { pr_id: string }[];

            // Reset PR items po_id so they can be ordered again
            db.prepare("UPDATE pr_items SET po_id = NULL WHERE po_id = ?").run(
              poId,
            );

            // Revert PR status to AUTHORIZED if they have any pending items now
            const updatePrStatus = db.prepare(
              "UPDATE purchase_requests SET status = 'AUTHORIZED' WHERE id = ?",
            );
            for (const { pr_id } of prIds) {
              updatePrStatus.run(pr_id);
              syncProcurementTaskGantt(pr_id);
            }
          })();
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to cancel PO" });
        }
      },
    );

    // Update/Revise PO
    purchasingRouter.put(
      "/api/purchasing/po/:id",
      requireRole(["PURCHASING", "FC"]),
      (req, res) => {
        try {
          const poId = req.params.id;
          const {
            supplier_name,
            supplier_npwp,
            currency,
            exchange_rate,
            vat_rate,
            ppn_rate,
            pph_rate,
            tax_category,
            tax_scheme,
            shipping_fee,
            expected_date,
            remarks,
            payment_terms,
            rounding_factor,
          } = req.body;

          const po = db
            .prepare("SELECT * FROM purchase_orders WHERE id = ?")
            .get(poId) as any;
          if (!po) return res.status(404).json({ error: "PO not found" });

          const category = tax_category || po.tax_category || "GOODS";
          const finalPpnRate = ppn_rate !== undefined && ppn_rate !== null ? Number(ppn_rate) : (vat_rate !== undefined && vat_rate !== null ? Number(vat_rate) : Number(po.ppn_rate ?? 12));
          const finalPphRate = pph_rate !== undefined && pph_rate !== null ? Number(pph_rate) : Number(po.pph_rate ?? (category === "SERVICES" ? 2 : 0));
          const finalTaxScheme = (tax_scheme || po.tax_scheme || (finalPpnRate === 0 ? "NON_PKP" : "DPP_NILAI_LAIN")) as TaxScheme;

          const baseAmount = po.dpp > 0 ? po.dpp : (po.total_amount || 0);

          const breakdown = calculateFinancialBreakdown({
            dpp: baseAmount,
            taxRate: finalPpnRate,
            pphRate: finalPphRate,
            taxScheme: finalTaxScheme,
            roundingFactor: rounding_factor !== undefined && rounding_factor !== null ? Number(rounding_factor) : (po.rounding_factor !== undefined && po.rounding_factor !== null ? Number(po.rounding_factor) : 0),
          });

          db.transaction(() => {
            db.prepare(
              `
              UPDATE purchase_orders 
              SET supplier_name = ?, 
                  supplier_npwp = ?,
                  currency = ?, 
                  exchange_rate = ?, 
                  vat_rate = ?, 
                  ppn_rate = ?, 
                  pph_rate = ?, 
                  tax_category = ?,
                  tax_scheme = ?,
                  shipping_fee = ?, 
                  expected_date = ?, 
                  remarks = ?, 
                  payment_terms = ?,
                  dpp = ?,
                  dpp_nilai_lain = ?,
                  ppn = ?,
                  pph = ?,
                  rounding_factor = ?,
                  grand_total = ?,
                  status = 'PENDING',
                  revision_note = NULL
              WHERE id = ?
            `,
            ).run(
              supplier_name || po.supplier_name,
              supplier_npwp !== undefined ? supplier_npwp : po.supplier_npwp,
              currency || po.currency,
              exchange_rate || po.exchange_rate,
              finalPpnRate,
              finalPpnRate,
              finalPphRate,
              category,
              breakdown.taxScheme,
              shipping_fee ?? po.shipping_fee,
              expected_date || po.expected_date,
              remarks || po.remarks,
              payment_terms || po.payment_terms,
              breakdown.dpp,
              breakdown.dppNilaiLain,
              breakdown.ppnAmount,
              breakdown.pphAmount,
              breakdown.roundingFactor,
              breakdown.grandTotal,
              poId,
            );
          })();

          logAudit(
            (req.headers["x-user-email"] as string) || null,
            "UPDATE_PO",
            "PURCHASE_ORDER",
            poId,
            `Revised PO ${po.po_number}`,
          );

          res.json({ success: true, message: "PO updated successfully" });
        } catch (error: any) {
          console.error(error);
          res
            .status(500)
            .json({ error: "Failed to update PO", details: error.message });
        }
      },
    );

    // Delete PO
    purchasingRouter.delete(
      "/api/purchasing/po/:id",
      requireRole(["PURCHASING"]),
      (req, res) => {
        try {
          const poId = req.params.id;
          const po = db
            .prepare("SELECT status FROM purchase_orders WHERE id = ?")
            .get(poId) as { status: string };
          if (po && po.status !== "DRAFTED" && po.status !== "CANCELLED") {
            return res
              .status(400)
              .json({ error: "Only drafted or cancelled POs can be deleted." });
          }

          db.transaction(() => {
            // Handle GRNs associated with this PO to prevent foreign key constraint errors
            const grns = db
              .prepare("SELECT id FROM grns WHERE po_id = ?")
              .all(poId) as { id: string }[];
            for (const { id: grnId } of grns) {
              db.prepare("DELETE FROM inventory_labels WHERE grn_id = ?").run(
                grnId,
              );
              db.prepare("DELETE FROM grn_items WHERE grn_id = ?").run(grnId);
            }
            db.prepare("DELETE FROM grns WHERE po_id = ?").run(poId);

            const prIds = db
              .prepare("SELECT DISTINCT pr_id FROM pr_items WHERE po_id = ?")
              .all(poId) as { pr_id: string }[];
            // Reset PR items po_id
            db.prepare("UPDATE pr_items SET po_id = NULL WHERE po_id = ?").run(
              poId,
            );

            for (const { pr_id } of prIds) {
              db.prepare(
                "UPDATE purchase_requests SET status = 'AUTHORIZED' WHERE id = ?",
              ).run(pr_id);
              syncProcurementTaskGantt(pr_id);
            }
            db.prepare(
              "UPDATE purchase_orders SET archived_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(poId);
          })();
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to delete PO" });
        }
      },
    );

    // Get all POs
    purchasingRouter.get(
      "/api/purchasing/pos",
      requireRole(["PURCHASING", "WAREHOUSE", "PRODUCTION", "ENGINEERING"]),
      (req, res) => {
        try {
          const pos = db
            .prepare(
              `
        SELECT 
          po.id,
          po.po_number,
          po.supplier_name,
          s.phone as supplier_phone,
          s.email as supplier_email,
          po.expected_date,
          po.auth_doc_name,
          po.status,
          po.escalated_to,
          po.urgency,
          po.created_at,
          COUNT(pri.id) as item_count,
          GROUP_CONCAT(DISTINCT pr.pr_number) as pr_numbers,
          MAX(CASE WHEN pr.status = 'CANCELLED' THEN 1 ELSE 0 END) as has_cancelled_pr,
          (SELECT COUNT(id) FROM grns WHERE po_id = po.id AND qc_status = 'REJECTED') as has_rejected_grn,
          COALESCE(SUM(pri.qty), 0) - COALESCE((
            SELECT SUM(gi.qty_received)
            FROM grn_items gi
            JOIN grns g ON gi.grn_id = g.id
            WHERE g.po_id = po.id AND g.qc_status IN ('PASSED', 'CONDITIONAL')
          ), 0) as pending_qty
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN pr_items pri ON po.id = pri.po_id
        LEFT JOIN purchase_requests pr ON pri.pr_id = pr.id
        WHERE po.archived = 0 AND (po.status != 'CANCELLED' OR (po.status = 'CANCELLED' AND po.cancelled_at >= datetime('now', '-1 day')))
        GROUP BY po.id
        ORDER BY po.created_at DESC
      `,
            )
            .all();
          res.json(pos);
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch POs" });
        }
      },
    );

    // Get Pending Receipts (POs that are ISSUED or PARTIAL and have remaining items to receive)
    purchasingRouter.get(
      "/api/purchasing/pending-receipts",
      requireRole(["WAREHOUSE", "PURCHASING"]),
      (req, res) => {
        try {
          const items = db
            .prepare(
              `
        SELECT 
          i.id as item_id,
          i.item_code,
          i.name as item_name,
          i.uom,
          po.id as po_id,
          po.po_number,
          po.supplier_name,
          s.phone as supplier_phone,
          s.email as supplier_email,
          pri.qty as ordered_qty,
          COALESCE((
            SELECT SUM(gi.qty_received) 
            FROM grn_items gi 
            JOIN grns g ON gi.grn_id = g.id 
            WHERE g.po_id = po.id AND gi.item_id = i.id AND g.qc_status IN ('PASSED', 'CONDITIONAL')
          ), 0) as received_qty
        FROM pr_items pri
        JOIN items i ON pri.item_id = i.id
        JOIN purchase_orders po ON pri.po_id = po.id
        WHERE po.status IN ('ISSUED', 'PARTIAL')
        GROUP BY i.id, i.item_code, i.name, i.uom, po.id, po.po_number, po.supplier_name,
          s.phone as supplier_phone,
          s.email as supplier_email, pri.qty
        HAVING ordered_qty - received_qty > 0
        ORDER BY po.created_at ASC
      `,
            )
            .all();

          // Calculate pending_qty
          const result = items.map((item: any) => ({
            ...item,
            pending_qty: item.ordered_qty - item.received_qty,
          }));

          res.json(result);
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch pending receipts" });
        }
      },
    );

    // Get PO Details with Items
    purchasingRouter.get(
      "/api/purchasing/po/:id",
      requireRole(["PURCHASING", "WAREHOUSE", "PRODUCTION", "ENGINEERING"]),
      (req, res) => {
        try {
          const po = db
            .prepare(
              `
        SELECT po.*, 
               s.phone as supplier_phone,
               s.email as supplier_email,
               GROUP_CONCAT(DISTINCT pr.pr_number) as pr_numbers,
               GROUP_CONCAT(DISTINCT pr.project_id) as project_ids
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN pr_items pri ON po.id = pri.po_id
        LEFT JOIN purchase_requests pr ON pri.pr_id = pr.id
        WHERE po.id = ?
        GROUP BY po.id
      `,
            )
            .get(req.params.id);

          if (!po) return res.status(404).json({ error: "PO not found" });

          const items = db
            .prepare(
              `
        SELECT 
          i.id as item_id,
          i.item_code,
          i.name as item_name,
          i.uom,
          i.unit_price as db_unit_price,
          MAX(pri.dimension) as dimension,
          MAX(pri.spec) as spec,
          SUM(pri.qty) as qty,
          MAX(pri.unit_price) as unit_price,
          COALESCE((
            SELECT SUM(gi.qty_received) 
            FROM grn_items gi 
            JOIN grns g ON gi.grn_id = g.id 
            WHERE g.po_id = ? AND gi.item_id = i.id AND g.qc_status IN ('PASSED', 'CONDITIONAL')
          ), 0) as received_qty
        FROM pr_items pri
        JOIN items i ON pri.item_id = i.id
        WHERE pri.po_id = ?
        GROUP BY i.id, i.item_code, i.name, i.uom, i.unit_price
      `,
            )
            .all(req.params.id, req.params.id);

          res.json({ ...(po as any), items });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch PO details" });
        }
      },
    );

    // Issue Reject Status for PO
    purchasingRouter.post(
      "/api/purchasing/po/:id/issue-reject",
      requireRole(["PURCHASING", "WAREHOUSE"]),
      (req, res) => {
        try {
          const poId = req.params.id;
          const { reject_doc_name } = req.body;
          db.transaction(() => {
            db.prepare(
              "UPDATE purchase_orders SET status = 'ISSUED' WHERE id = ?",
            ).run(poId);
          })();
          logAudit(
            req.headers["x-user-email"] as string,
            "ISSUE_REJECT",
            "PO",
            poId,
            `Reject document ${reject_doc_name} issued. PO is now back to ISSUED status.`,
          );
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to issue reject" });
        }
      },
    );

    // Finish PO (Force close)
    purchasingRouter.post(
      "/api/purchasing/po/:id/finish",
      requireRole(["PURCHASING"]),
      (req, res) => {
        try {
          const poId = req.params.id;
          db.prepare(
            "UPDATE purchase_orders SET status = 'FINISHED' WHERE id = ?",
          ).run(poId);
          logAudit(
            req.headers["x-user-email"] as string,
            "FINISH_PO",
            "PO",
            poId,
            `PO forced finished`,
          );
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to finish PO" });
        }
      },
    );
    purchasingRouter.post(
      "/api/purchasing/complete-grn",
      requireRole(["WAREHOUSE", "ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        try {
          const {
            po_id,
            received_date,
            engineering_user,
            qc_user,
            qc_status,
            remarks,
            rejected_grn_doc,
            items,
          } = req.body;
          const grnId = "GRN-" + Math.random().toString(36).substr(2, 9);
          const isReissue = rejected_grn_doc ? 1 : 0;

          const insertGrn = db.prepare(`
        INSERT INTO grns (id, po_id, received_date, engineering_user, qc_user, qc_status, remarks, rejected_grn_doc, is_reissue)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
          const insertGrnItem = db.prepare(`
        INSERT INTO grn_items (id, grn_id, item_id, dimension, spec, qty_received)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
          const updatePoStatus = db.prepare(
            "UPDATE purchase_orders SET status = ? WHERE id = ?",
          );

          const transaction = db.transaction(() => {
            insertGrn.run(
              grnId,
              po_id,
              received_date,
              engineering_user || (req as any).user?.name || (req as any).user?.username || "Authorized Staff",
              qc_user || engineering_user || (req as any).user?.name || (req as any).user?.username || "Authorized Staff",
              qc_status,
              remarks || null,
              rejected_grn_doc || null,
              isReissue,
            );

            for (const item of items) {
              const grnItemId =
                "GRI-" + Math.random().toString(36).substr(2, 9);
              insertGrnItem.run(
                grnItemId,
                grnId,
                item.item_id,
                item.dimension || null,
                item.spec || null,
                item.qty_received || 0,
              );
            }

            // P2P Robustness: Item-level verification to prevent over-receiving and accurate PO status
            const poItems = db
              .prepare(
                "SELECT item_id, SUM(qty) as ordered_qty FROM pr_items WHERE po_id = ? GROUP BY item_id"
              )
              .all(po_id) as { item_id: string, ordered_qty: number }[];
              
            const grnItems = db
              .prepare(
                `SELECT gi.item_id, SUM(gi.qty_received) as received_qty
                 FROM grn_items gi
                 JOIN grns g ON gi.grn_id = g.id
                 WHERE g.po_id = ? AND g.qc_status IN ('PASSED', 'CONDITIONAL')
                 GROUP BY gi.item_id`
              )
              .all(po_id) as { item_id: string, received_qty: number }[];

            let allItemsFullyReceived = true;
            let anyItemReceived = false;
            let totalReceivedGlobal = 0;

            const receivedMap = new Map();
            grnItems.forEach(g => {
              receivedMap.set(g.item_id, g.received_qty);
              totalReceivedGlobal += g.received_qty;
            });

            poItems.forEach(p => {
              const recQty = receivedMap.get(p.item_id) || 0;
              if (recQty < p.ordered_qty) {
                allItemsFullyReceived = false;
              }
              if (recQty > 0) {
                anyItemReceived = true;
              }
            });

            let newStatus = "ISSUED";
            if (poItems.length > 0 && allItemsFullyReceived) {
              newStatus = "RECEIVED";
            } else if (anyItemReceived) {
              newStatus = "PARTIAL";
            } else if (qc_status === "REJECTED" && totalReceivedGlobal === 0) {
              newStatus = "REJECTED";
            }

            updatePoStatus.run(newStatus, po_id);
            return grnId;
          });

          transaction();
          logAudit(
            req.headers["x-user-email"] as string,
            "COMPLETE_GRN",
            "GRN",
            po_id,
            `GRN completed for PO ${po_id}. Status: ${qc_status}`,
          );

          // Sync affected PR tasks in Gantt (accurate & adaptive check)
          try {
            const prs = db
              .prepare("SELECT DISTINCT pr_id FROM pr_items WHERE po_id = ?")
              .all(po_id) as { pr_id: string }[];
            for (const { pr_id } of prs) {
              syncProcurementTaskGantt(pr_id);
              
              // NEW: Trigger sync for production engine auto-resume
              const reqData = db.prepare("SELECT project_id FROM purchase_requests WHERE id = ?").get(pr_id) as any;
              if (reqData && reqData.project_id) {
                syncProjectMaterialAndWakeProcesses(
                  reqData.project_id, 
                  (req.headers["x-user-email"] as string) || "SYSTEM_GRN"
                );
              }
            }
          } catch (err) {
            console.error("Post-GRN Gantt sync failed:", err);
          }

          // Dual-write to Firestore
          try {
            const grnRow = db.prepare("SELECT * FROM grns WHERE id = ?").get(grnId) as any;
            if (grnRow) {
              syncCollectionToFirestore("grns", grnId, grnRow);
            }
            const grnItemRows = db.prepare("SELECT * FROM grn_items WHERE grn_id = ?").all(grnId) as any[];
            for (const gi of grnItemRows) {
              syncCollectionToFirestore("grn_items", gi.id, gi);
            }
            const poRow = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(po_id) as any;
            if (poRow) {
              syncCollectionToFirestore("purchase_orders", po_id, poRow);
            }
          } catch (syncErr) {
            console.error("Firestore sync error for GRN completion:", syncErr);
          }

          res.json({ success: true, grn_id: grnId });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to complete GRN" });
        }
      },
    );

    purchasingRouter.get(
      "/api/warehouse/pending-incoming",
      requireRole(["WAREHOUSE", "PURCHASING"]),
      (req, res) => {
        try {
          const pendingGRNs = db
            .prepare(
              `
        SELECT 
          g.*,
          po.po_number,
          po.supplier_name
        FROM grns g
        JOIN purchase_orders po ON g.po_id = po.id
        WHERE g.inventory_updated_at IS NULL AND g.qc_status IN ('PASSED', 'CONDITIONAL')
        ORDER BY g.received_date ASC
      `,
            )
            .all();

          const grnItems = db
            .prepare(
              `
        SELECT gi.*, i.item_code, i.name as item_name
        FROM grn_items gi
        JOIN items i ON gi.item_id = i.id
        WHERE gi.grn_id IN (
          SELECT id FROM grns WHERE inventory_updated_at IS NULL AND qc_status IN ('PASSED', 'CONDITIONAL')
        )
      `,
            )
            .all() as any[];

          const formatted = pendingGRNs.map((g: any) => ({
            ...g,
            items: grnItems.filter((i) => i.grn_id === g.id),
          }));

          res.json(formatted);
        } catch (err: any) {
          console.error(err);
          res
            .status(500)
            .json({ error: "Failed to fetch pending incoming GRNs" });
        }
      },
    );

    purchasingRouter.post(
      "/api/warehouse/intake-grn",
      requireRole(["WAREHOUSE"]),
      (req, res) => {
        try {
          const { grn_id } = req.body;

          const grn = db
            .prepare("SELECT * FROM grns WHERE id = ?")
            .get(grn_id) as any;
          if (!grn) return res.status(404).json({ error: "GRN not found" });
          if (grn.inventory_updated_at)
            return res
              .status(400)
              .json({ error: "GRN already intaken into inventory" });

          const items = db
            .prepare("SELECT * FROM grn_items WHERE grn_id = ?")
            .all(grn_id) as any[];

          const updateInventory = db.prepare(
            `INSERT INTO inventory (item_id, physical_qty, reserved_qty, available_qty, free_stock, allocated_stock) 
             VALUES (?, ?, 0, ?, ?, 0) 
             ON CONFLICT(item_id) DO UPDATE SET 
               physical_qty = COALESCE(inventory.physical_qty, 0) + excluded.physical_qty,
               available_qty = COALESCE(inventory.available_qty, 0) + excluded.available_qty,
               free_stock = COALESCE(inventory.free_stock, 0) + excluded.free_stock`,
          );
          const updateAllocatedInventory = db.prepare(
            "INSERT INTO inventory (item_id, free_stock, allocated_stock) VALUES (?, 0, ?) ON CONFLICT(item_id) DO UPDATE SET allocated_stock = COALESCE(inventory.allocated_stock, 0) + excluded.allocated_stock",
          );
          const insertMovement = db.prepare(
            "INSERT INTO stock_movements (id, item_id, project_id, type, qty, reference_id) VALUES (?, ?, ?, ?, ?, ?)",
          );
          const insertLabel = db.prepare(
            "INSERT INTO inventory_labels (id, item_id, grn_id, original_qty, current_qty, project_id) VALUES (?, ?, ?, ?, ?, ?)",
          );

          let createdLabels: any[] = [];
          db.transaction(() => {
            // Mark GRN as updated
            db.prepare(
              "UPDATE grns SET inventory_updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(grn_id);

            // Auto-Resolve NDPs caused by MATERIAL_SHORTAGE when inventory is received
            db.prepare(`
              UPDATE notice_to_down_processes
              SET status = 'RESOLVED', resumed_at = CURRENT_TIMESTAMP, reason_detail = reason_detail || ' [AUTO-RESOLVED by Warehouse Scan]'
              WHERE reason_category = 'MATERIAL_SHORTAGE' AND status = 'ACTIVE'
              AND project_id IN (
                SELECT project_id FROM purchase_orders WHERE id = ?
              )
            `).run(grn.po_id);


            for (const item of items) {
              // Find how many PR items needed this item associated with this PO to set project_id accurately
              const prevReceivedResult = db
                .prepare(
                  `
            SELECT COALESCE(SUM(gi.qty_received), 0) as total
            FROM grn_items gi
            JOIN grns g ON gi.grn_id = g.id
            WHERE g.po_id = ? AND gi.item_id = ? AND g.id != ? AND g.qc_status IN ('PASSED', 'CONDITIONAL')
          `,
                )
                .get(grn.po_id, item.item_id, grn_id) as { total: number };

              let remainingToSkip = prevReceivedResult.total;
              let remainingQty = item.qty_received;

              const prItems = db
                .prepare(
                  `
            SELECT pri.id, pri.qty, pr.project_id 
            FROM pr_items pri
            JOIN purchase_requests pr ON pri.pr_id = pr.id
            WHERE pri.po_id = ? AND pri.item_id = ?
            ORDER BY pr.created_at ASC
          `,
                )
                .all(grn.po_id, item.item_id) as {
                id: string;
                qty: number;
                project_id: string;
              }[];

              for (const prItem of prItems) {
                if (remainingQty <= 0) break;

                let prItemRemainingQty = prItem.qty;
                if (remainingToSkip > 0) {
                  const skipAmount = Math.min(
                    remainingToSkip,
                    prItemRemainingQty,
                  );
                  prItemRemainingQty -= skipAmount;
                  remainingToSkip -= skipAmount;
                }

                if (prItemRemainingQty > 0) {
                  const allocateQty = Math.min(
                    remainingQty,
                    prItemRemainingQty,
                  );
                  const labelId =
                    "LBL-" +
                    Math.random().toString(36).substr(2, 9).toUpperCase();

                  updateInventory.run(item.item_id, allocateQty, allocateQty, allocateQty);

                  insertMovement.run(
                    "MOV-" + Math.random().toString(36).substr(2, 9),
                    item.item_id,
                    prItem.project_id || null,
                    "GRN",
                    allocateQty,
                    grn_id,
                  );
                  insertLabel.run(
                    labelId,
                    item.item_id,
                    grn_id,
                    allocateQty,
                    allocateQty,
                    prItem.project_id || null,
                  );
                  createdLabels.push({
                    id: labelId,
                    item_id: item.item_id,
                    qty: allocateQty,
                    project_id: prItem.project_id || null,
                  });
                  remainingQty -= allocateQty;
                }
              }

              if (remainingQty > 0) {
                updateInventory.run(item.item_id, remainingQty, remainingQty, remainingQty);
                insertMovement.run(
                  "MOV-" + Math.random().toString(36).substr(2, 9),
                  item.item_id,
                  null,
                  "GRN",
                  remainingQty,
                  grn_id,
                );
                const labelId =
                  "LBL-" +
                  Math.random().toString(36).substr(2, 9).toUpperCase();
                insertLabel.run(
                  labelId,
                  item.item_id,
                  grn_id,
                  remainingQty,
                  remainingQty,
                  null,
                );
                createdLabels.push({
                  id: labelId,
                  item_id: item.item_id,
                  qty: remainingQty,
                  project_id: null,
                });
              }
            }
          })();

          // Automated Accounting Bridge: Post Goods Receipt Journal (Debit Inventory Asset, Credit Unbilled GR/IR Clearing)
          const poRow = grn.po_id
            ? (db
                .prepare(
                  "SELECT po_number, supplier_name FROM purchase_orders WHERE id = ? OR po_number = ?",
                )
                .get(grn.po_id, grn.po_id) as any)
            : null;
          const poNumber = poRow?.po_number || grn.po_id || "N/A";
          const supplierName = poRow?.supplier_name || "Supplier Partner";

          try {
            const grnValRow = db.prepare(`
              SELECT COALESCE(SUM(gi.qty_received * COALESCE(i.unit_price, 0)), 0) as total_val
              FROM grn_items gi
              JOIN items i ON gi.item_id = i.id
              WHERE gi.grn_id = ?
            `).get(grn_id) as { total_val: number };

            const grnValue = Number(grnValRow?.total_val || 0);
            if (grnValue > 0) {
              postGoodsReceiptJournal(db, {
                grn_id,
                po_number: poNumber,
                total_inventory_cost: grnValue,
                user: (req.headers["x-user-email"] as string) || "WAREHOUSE",
              });
            }
          } catch (accErr) {
            console.error("Automated Accounting postGoodsReceiptJournal error:", accErr);
          }

          // Fetch the full label details with item codes so the frontend can print them immediately
          const fullLabels = createdLabels.map((lbl) => {
            const itemInfo = db
              .prepare(
                "SELECT item_code, name, uom, dimension, spec, asset_class FROM items WHERE id = ?",
              )
              .get(lbl.item_id) as any;
            return {
              ...lbl,
              ...itemInfo,
              po_number: poNumber,
              supplier_name: supplierName,
              grn_id,
              received_date: grn.received_date || new Date().toISOString(),
            };
          });

          // Trigger production auto-resume for affected projects
          try {
            const projectIds = Array.from(new Set(createdLabels.map(l => l.project_id).filter(Boolean)));
            for (const pid of projectIds) {
              syncProjectMaterialAndWakeProcesses(pid, (req.headers["x-user-email"] as string) || "WAREHOUSE_INTAKE");
            }
          } catch (syncErr) {
            console.error("Error syncing project material wake after GRN intake:", syncErr);
          }

          // Dual-write to Firestore for inventory, labels, and GRN update
          try {
            const grnUpdated = db.prepare("SELECT * FROM grns WHERE id = ?").get(grn_id) as any;
            if (grnUpdated) {
              syncCollectionToFirestore("grns", grn_id, grnUpdated);
            }
            for (const lbl of createdLabels) {
              const labelRow = db.prepare("SELECT * FROM inventory_labels WHERE id = ?").get(lbl.id) as any;
              if (labelRow) {
                syncCollectionToFirestore("inventory_labels", lbl.id, labelRow);
              }
              const invRow = db.prepare("SELECT * FROM inventory WHERE item_id = ?").get(lbl.item_id) as any;
              if (invRow) {
                syncCollectionToFirestore("inventory", lbl.item_id, invRow);
              }
            }
          } catch (syncErr) {
            console.error("Firestore sync error for GRN intake:", syncErr);
          }

          logAudit(
            req.headers["x-user-email"] as string,
            "WAREHOUSE_INTAKE",
            "GRN",
            grn_id,
            `GRN ${grn_id} intaken to warehouse.`,
          );
          res.json({
            success: true,
            labels: fullLabels,
            po_number: poNumber,
            supplier_name: supplierName,
            grn_id,
            received_date: grn.received_date || new Date().toISOString(),
          });
        } catch (error: any) {
          console.error(error);
          res
            .status(500)
            .json({ error: error.message || "Failed to intake GRN" });
        }
      },
    );

    purchasingRouter.post(
      "/api/warehouse/return-grn",
      requireRole(["WAREHOUSE", "PURCHASING"]),
      (req, res) => {
        try {
          const id = req.body.grn_id || req.body.id;
          if (!id) return res.status(400).json({ error: "Missing GRN ID" });

          const grn = db
            .prepare("SELECT * FROM grns WHERE id = ?")
            .get(id) as any;
          if (!grn) return res.status(404).json({ error: "GRN not found" });
          if (grn.inventory_updated_at)
            return res.status(400).json({ error: "GRN already processed" });

          db.prepare(
            "UPDATE grns SET inventory_updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(id);

          logAudit(
            req.headers["x-user-email"] as string,
            "WAREHOUSE_RETURN",
            "GRN",
            id,
            `Rejected GRN ${id} marked as returned to supplier.`,
          );
          res.json({ success: true });
        } catch (e: any) {
          console.error(e);
          res
            .status(500)
            .json({ error: e.message || "Failed to process return" });
        }
      },
    );

    // Revise PO
    purchasingRouter.post(
      "/api/purchasing/revise-po",
      requireRole(["PURCHASING", "FC"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (
          userRole !== "FC" &&
          (userRole !== "PURCHASING" || userLevel !== "MANAGER")
        ) {
          return res.status(403).json({
            error:
              "Access denied. Only Purchasing Managers or FC accounts can revise POs.",
          });
        }
        try {
          const { po_id, revision_note } = req.body;
          if (!revision_note) {
            return res.status(400).json({ error: "Revision note is required" });
          }

          db.prepare(
            "UPDATE purchase_orders SET status = 'REVISION', revision_note = ? WHERE id = ?",
          ).run(revision_note, po_id);

          const po = db
            .prepare("SELECT po_number FROM purchase_orders WHERE id = ?")
            .get(po_id) as any;
          logAudit(
            req.headers["x-user-email"] as string,
            "REVISE_PO",
            "PO",
            po_id,
            `PO ${po?.po_number} marked for revision. Note: ${revision_note}`,
          );

          res.json({ success: true, message: "PO marked for revision" });
        } catch (error) {
          console.error("Failed to revise PO:", error);
          res.status(500).json({ error: "Failed to revise PO" });
        }
      },
    );

    // Authorize PO
    purchasingRouter.post("/api/purchasing/authorize-po", (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      try {
        const { po_id, auth_doc_name } = req.body;

        const po = db
          .prepare("SELECT * FROM purchase_orders WHERE id = ?")
          .get(po_id) as any;
        if (!po) return res.status(404).json({ error: "PO not found" });

        const isDirectlyAuthorized =
          userRole === "FC" ||
          (userRole === "PURCHASING" && userLevel === "MANAGER");
        const isEscalatedAuthority =
          po.escalated_to && userRole === po.escalated_to;

        if (!isDirectlyAuthorized && !isEscalatedAuthority) {
          return res.status(403).json({
            error:
              "Access denied. Only Purchasing Managers, FC accounts or Escalated personnel can authorize Purchase Orders.",
          });
        }

        const transaction = db.transaction(() => {
          // 1. Update PO status
          db.prepare(
            "UPDATE purchase_orders SET status = 'ISSUED', authorized_at = CURRENT_TIMESTAMP, auth_doc_name = ? WHERE id = ?",
          ).run(auth_doc_name || null, po_id);
        });

        transaction();
        logAudit(
          req.headers["x-user-email"] as string,
          "AUTHORIZE_PO",
          "PO",
          po_id,
          `PO authorized with document: ${auth_doc_name}.`,
        );

        // Update affected Gantt tasks on PO authorization
        try {
          const prs = db
            .prepare("SELECT DISTINCT pr_id FROM pr_items WHERE po_id = ?")
            .all(po_id) as { pr_id: string }[];
          for (const { pr_id } of prs) {
            syncProcurementTaskGantt(pr_id);
          }
        } catch (err) {
          console.error("Post-authorization Gantt sync failed:", err);
        }

        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to authorize PO" });
      }
    });

    purchasingRouter.post(
      "/api/inventory/return",
      requireRole(["PRODUCTION", "WAREHOUSE"]),
      (req, res) => {
        try {
          const { item_id, qty, project_id, recorded_by } = req.body;

          const transaction = db.transaction(() => {
            if (project_id) {
              const project = db
                .prepare("SELECT status FROM projects WHERE id = ?")
                .get(project_id) as { status: string } | undefined;
              if (project && project.status === "FINISHED") {
                throw new Error("Cannot return items for a finished project.");
              }
            }

            // Return stock back to free inventory
            db.prepare(
              "UPDATE inventory SET free_stock = free_stock + ? WHERE item_id = ?",
            ).run(qty, item_id);

            const movId = "MOV-" + Math.random().toString(36).substr(2, 9);
            db.prepare(
              "INSERT INTO stock_movements (id, item_id, project_id, type, qty, recorded_by) VALUES (?, ?, ?, ?, ?, ?)",
            ).run(
              movId,
              item_id,
              project_id || null,
              "RETURN",
              qty,
              recorded_by || "SHOP_FLOOR",
            );

            if (project_id) {
              const bom = db
                .prepare(
                  "SELECT id FROM boms WHERE project_id = ? AND item_id = ?",
                )
                .get(project_id, item_id) as { id: string } | undefined;
              if (bom) {
                db.prepare(
                  "UPDATE bom_item_consumption SET qty_consumed = MAX(0, qty_consumed - ?), updated_at = CURRENT_TIMESTAMP WHERE bom_id = ?",
                ).run(qty, bom.id);
                
                db.prepare(
                  "UPDATE boms SET received_by_production = MAX(0, COALESCE(received_by_production, 0) - ?) WHERE id = ?",
                ).run(qty, bom.id);
              }
            }
          });

          transaction();
          res.json({ success: true });
        } catch (err: any) {
          console.error(err);
          res
            .status(400)
            .json({ error: err.message || "Failed to return item" });
        }
      },
    );

    // Shop Floor: Consume Item
    purchasingRouter.post(
      "/api/inventory/consume",
      requireRole(["PRODUCTION", "WAREHOUSE"]),
      (req, res) => {
        try {
          const { item_id, qty, project_id, recorded_by } = req.body;

          const transaction = db.transaction(() => {
            if (project_id) {
              const project = db
                .prepare("SELECT id, name, qty, status FROM projects WHERE id = ?")
                .get(project_id) as { id: string; name: string; qty: number; status: string } | undefined;
              if (!project) {
                throw new Error("Target project not found.");
              }
              if (project.status === "FINISHED") {
                throw new Error("Cannot consume items for a finished project.");
              }

              // Validate engineering constraint from BOM & SPK
              const bom = db
                .prepare(
                  `SELECT b.id, b.required_qty, COALESCE(i.name, i.item_code, b.item_id) as item_name, COALESCE(i.uom, 'PCS') as uom
                   FROM boms b
                   LEFT JOIN items i ON (b.item_id = i.id OR b.item_id = i.item_code)
                   WHERE b.project_id = ? AND (b.item_id = ? OR b.item_id = (SELECT item_code FROM items WHERE id = ?))`
                )
                .get(project_id, item_id, item_id) as { id: string; required_qty: number; item_name: string; uom: string } | undefined;

              if (!bom) {
                throw new Error(
                  `Item is not allocated in the Bill of Materials (BOM) for Project ${project.name || project_id}. Checkout is restricted.`
                );
              }

              const spkQty = Number(project.qty) || 1;
              const totalSpkRequired = Number(bom.required_qty) * spkQty;
              const bic = db
                .prepare("SELECT qty_consumed FROM bom_item_consumption WHERE bom_id = ?")
                .get(bom.id) as { qty_consumed: number } | undefined;
              const currentConsumed = Number(bic?.qty_consumed || 0);
              const remainingAllowed = Math.max(0, totalSpkRequired - currentConsumed);

              if (qty > remainingAllowed) {
                throw new Error(
                  `Checkout of ${qty} ${bom.uom} exceeds SPK engineering limit! Total SPK required: ${totalSpkRequired} ${bom.uom} (BOM ${bom.required_qty} × ${spkQty} SPK Qty), already consumed: ${currentConsumed} ${bom.uom}. Maximum remaining allowed: ${remainingAllowed} ${bom.uom}.`
                );
              }
            }

            const inv = db
              .prepare("SELECT free_stock, allocated_stock FROM inventory WHERE item_id = ?")
              .get(item_id) as { free_stock: number; allocated_stock: number };

            let remainingQtyToConsume = qty;

            if (project_id) {
              // Try to consume from allocated_stock first
              const labelAllocations = db.prepare(
                "SELECT SUM(current_qty) as total FROM inventory_labels WHERE item_id = ? AND project_id = ?"
              ).get(item_id, project_id) as { total: number };
              
              const allocAvailable = Math.min(inv.allocated_stock, labelAllocations.total || 0);
              
              if (allocAvailable > 0) {
                const toConsumeFromAlloc = Math.min(allocAvailable, remainingQtyToConsume);
                db.prepare(
                  "UPDATE inventory SET allocated_stock = allocated_stock - ? WHERE item_id = ?"
                ).run(toConsumeFromAlloc, item_id);
                
                // Deduct from labels
                const labels = db.prepare(
                   "SELECT id, current_qty FROM inventory_labels WHERE item_id = ? AND project_id = ? AND current_qty > 0 ORDER BY created_at ASC"
                ).all(item_id, project_id) as any[];
                
                let labelDeduct = toConsumeFromAlloc;
                for (const lbl of labels) {
                   if (labelDeduct <= 0) break;
                   const deduct = Math.min(lbl.current_qty, labelDeduct);
                   db.prepare("UPDATE inventory_labels SET current_qty = current_qty - ? WHERE id = ?").run(deduct, lbl.id);
                   labelDeduct -= deduct;
                }
                
                remainingQtyToConsume -= toConsumeFromAlloc;
              }
            }

            // Consume remaining from free stock
            if (remainingQtyToConsume > 0) {
              const info = db.prepare(
                "UPDATE inventory SET free_stock = free_stock - ? WHERE item_id = ? AND free_stock >= ?"
              ).run(remainingQtyToConsume, item_id, remainingQtyToConsume);
              if (info.changes === 0) {
                throw new Error(`Insufficient stock for item ${item_id}`);
              }
            }

            // 3. Record Movement
            const movId = "MOV-" + Math.random().toString(36).substr(2, 9);
            db.prepare(
              "INSERT INTO stock_movements (id, item_id, project_id, type, qty, recorded_by) VALUES (?, ?, ?, ?, ?, ?)",
            ).run(
              movId,
              item_id,
              project_id || null,
              "CONSUMPTION",
              -qty,
              recorded_by || "SHOP_FLOOR",
            );

            if (project_id) {
              // 4. Update BOM Consumption if exists for this project/item
              const bom = db
                .prepare(
                  "SELECT id FROM boms WHERE project_id = ? AND (item_id = ? OR item_id = (SELECT item_code FROM items WHERE id = ?))",
                )
                .get(project_id, item_id, item_id) as { id: string } | undefined;
              if (bom) {
                const bicId = "BIC-" + Math.random().toString(36).substr(2, 9);
                db.prepare(`
                  INSERT INTO bom_item_consumption (id, bom_id, qty_consumed, updated_at)
                  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(bom_id) DO UPDATE SET qty_consumed = qty_consumed + excluded.qty_consumed, updated_at = CURRENT_TIMESTAMP
                `).run(bicId, bom.id, qty);
                
                db.prepare(
                  "UPDATE boms SET received_by_production = COALESCE(received_by_production, 0) + ? WHERE id = ?",
                ).run(qty, bom.id);
              }
            }
          });

          transaction();
          if (project_id) {
            try {
              syncProjectMaterialAndWakeProcesses(project_id, recorded_by || (req.headers["x-user-email"] as string) || "WAREHOUSE_STAFF");
            } catch (e) {
              console.error("Error in syncProjectMaterialAndWakeProcesses on consume:", e);
            }
          }
          logAudit(
            req.headers["x-user-email"] as string,
            "CONSUME_STOCK",
            "ITEM",
            item_id,
            `Consumed ${qty} for project ${project_id || "OTHERS"}. Recorded by ${recorded_by}`,
          );
          res.json({ success: true });
        } catch (error: any) {
          console.error(error);
          res
            .status(400)
            .json({ error: error.message || "Failed to consume item" });
        }
      },
    );

    // Get Stock Movements
    purchasingRouter.get(
      "/api/warehouse/item-allocation-info",
      requireRole(["WAREHOUSE", "PURCHASING", "PRODUCTION", "ENGINEERING"]),
      (req, res) => {
        try {
          const { po_number, item_id } = req.query;
          // Get the PO ID from po_number
          const po = db
            .prepare("SELECT id FROM purchase_orders WHERE po_number = ?")
            .get(po_number) as { id: string } | undefined;

          if (!po) {
            return res.json({ projects: [] });
          }

          // Find all projects that had a PR for this item in this PO
          const prItems = db
            .prepare(
              `
        SELECT DISTINCT pr.project_id
        FROM pr_items pri
        JOIN purchase_requests pr ON pri.pr_id = pr.id
        WHERE pri.po_id = ? AND pri.item_id = ? AND pr.project_id IS NOT NULL
      `,
            )
            .all(po.id, item_id) as { project_id: string }[];

          res.json({ projects: prItems.map((p) => p.project_id) });
        } catch (err: any) {
          console.error(err);
          res.status(500).json({ error: err.message });
        }
      },
    );

    // --- RECENT ACTIVITY ---
