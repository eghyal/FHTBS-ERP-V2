import express from "express";
import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { cacheService } from "../services/cacheService.ts";
import { outboxService } from "../services/outboxService.ts";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const router = Router();

    router.post(
      "/api/datacenter/import",
      express.json({ limit: "50mb" }),
      requireRole(["FC", "ADMIN", "SUPERADMIN"]),
      (req, res) => {
        try {
          const { type, data } = req.body;
          if (!type || !data || !Array.isArray(data)) {
            return res.status(400).json({ error: "Invalid payload" });
          }

          const username = req.headers["x-user-email"] as string;

          db.transaction(() => {
            if (type === "ITEMS") {
              const stmt = db.prepare(`
              INSERT OR REPLACE INTO items (id, item_code, name, dimension, spec, type, uom, unit_price, lead_time_days)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
              const invStmt = db.prepare(`
              INSERT OR IGNORE INTO inventory (item_id, free_stock, allocated_stock) VALUES (?, 0, 0)
            `);
              for (const row of data) {
                if (row.item_code && row.name) {
                  const id =
                    "ITM-" +
                    Math.random().toString(36).substr(2, 9).toUpperCase();
                  stmt.run(
                    id,
                    row.item_code,
                    row.name,
                    row.dimension || null,
                    row.spec || null,
                    row.type || "RAW",
                    row.uom || "Unit",
                    parseFloat(row.unit_price) || 0,
                    parseInt(row.lead_time_days) || 0,
                  );
                  invStmt.run(id);
                }
              }
            } else if (type === "SUPPLIERS") {
              const stmt = db.prepare(`
               INSERT OR REPLACE INTO suppliers (id, code, name, contact_person, email, phone, address)
               VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
              for (const row of data) {
                if (row.name) {
                  const id =
                    "SUP-" +
                    Math.random().toString(36).substr(2, 9).toUpperCase();
                  stmt.run(
                    id,
                    row.code || null,
                    row.name,
                    row.contact_person || null,
                    row.email || null,
                    row.phone || null,
                    row.address || null,
                  );
                }
              }
            } else if (type === "CUSTOMERS") {
              const stmt = db.prepare(`
               INSERT OR REPLACE INTO customers (id, code, name, email, phone, address)
               VALUES (?, ?, ?, ?, ?, ?)
            `);
              for (const row of data) {
                if (row.name) {
                  const id =
                    "CUST-" +
                    Math.random().toString(36).substr(2, 9).toUpperCase();
                  stmt.run(
                    id,
                    row.code || null,
                    row.name,
                    row.email || null,
                    row.phone || null,
                    row.address || null,
                  );
                }
              }
            }
          })();

          if (type === "ITEMS") cacheService.invalidateNamespace("items");
          if (type === "SUPPLIERS") cacheService.invalidateNamespace("suppliers");
          if (type === "CUSTOMERS") cacheService.invalidateNamespace("customers");

          logAudit(
            username,
            "IMPORT_DATA",
            "DATACENTER",
            type,
            `Imported ${data.length} records logic.`,
          );
          res.json({ success: true, count: data.length });
        } catch (err: any) {
          console.error(err);
          res.status(500).json({ error: err.message });
        }
      },
    );

    router.get(
      "/api/datacenter/master-trace",
      requireRole(["FC", "ADMIN", "SUPERADMIN", "ENGINEERING", "PURCHASING", "WAREHOUSE", "PRODUCTION", "SALES"]),
      (req, res) => {
      try {
        const q = (req.query.q as string) || "";
        const searchTerm = q ? `%${q.trim().toLowerCase()}%` : null;

        // Find relevant project IDs if there's a search term
        let relevantProjectIds = new Set<string>();
        if (searchTerm) {
          // Match Projects
          db.prepare(
            "SELECT id FROM projects WHERE LOWER(name) LIKE ? OR LOWER(id) LIKE ?",
          )
            .all(searchTerm, searchTerm)
            .forEach((row: any) => relevantProjectIds.add(row.id));
          // Match PRs
          db.prepare(
            "SELECT project_id FROM purchase_requests WHERE LOWER(pr_number) LIKE ?",
          )
            .all(searchTerm)
            .forEach((row: any) => {
              if (row.project_id) relevantProjectIds.add(row.project_id);
            });
          // Match POs (through PRs)
          db.prepare(
            `
          SELECT pr.project_id 
          FROM purchase_orders po 
          JOIN pr_items pri ON po.id = pri.po_id 
          JOIN purchase_requests pr ON pri.pr_id = pr.id 
          WHERE LOWER(po.po_number) LIKE ?
        `,
          )
            .all(searchTerm)
            .forEach((row: any) => {
              if (row.project_id) relevantProjectIds.add(row.project_id);
            });
          // Match GRNs (through POs -> PRs)
          db.prepare(
            `
          SELECT pr.project_id 
          FROM grns g 
          JOIN purchase_orders po ON g.po_id = po.id
          JOIN pr_items pri ON po.id = pri.po_id 
          JOIN purchase_requests pr ON pri.pr_id = pr.id 
          WHERE LOWER(g.id) LIKE ?
        `,
          )
            .all(searchTerm)
            .forEach((row: any) => {
              if (row.project_id) relevantProjectIds.add(row.project_id);
            });
          // Match Quotations
          try {
            db.prepare(
              "SELECT id FROM projects WHERE quotation_id IN (SELECT id FROM quotations WHERE LOWER(quotation_number) LIKE ?)",
            )
              .all(searchTerm)
              .forEach((row: any) => relevantProjectIds.add(row.id));
          } catch (e) {}
          // Match SPKs
          try {
            db.prepare(
              "SELECT project_id FROM spks WHERE LOWER(spk_number) LIKE ?",
            )
              .all(searchTerm)
              .forEach((row: any) => {
                if (row.project_id) relevantProjectIds.add(row.project_id);
              });
          } catch (e) {}
          // Match Delivery Notes
          try {
            db.prepare(
              "SELECT project_id FROM delivery_notes WHERE LOWER(dn_number) LIKE ?",
            )
              .all(searchTerm)
              .forEach((row: any) => {
                if (row.project_id) relevantProjectIds.add(row.project_id);
              });
          } catch (e) {}
          // Match Commercial Invoices
          try {
            db.prepare(
              "SELECT project_id FROM commercial_invoices WHERE LOWER(ci_number) LIKE ?",
            )
              .all(searchTerm)
              .forEach((row: any) => {
                if (row.project_id) relevantProjectIds.add(row.project_id);
              });
          } catch (e) {}
        }

        // Fetch base projects
        let projectsQuery = `SELECT id, name, status, created_at, quotation_id, spk_id FROM projects WHERE id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL') ORDER BY created_at DESC`;
        let projectsArgs: any[] = [];
        if (searchTerm) {
          if (relevantProjectIds.size > 0) {
            const placeholders = Array.from(relevantProjectIds)
              .map(() => "?")
              .join(",");
            projectsQuery = `SELECT id, name, status, created_at, quotation_id, spk_id FROM projects WHERE id IN (${placeholders}) AND id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL') ORDER BY created_at DESC`;
            projectsArgs = Array.from(relevantProjectIds);
          } else {
            return res.json({ success: true, data: [] });
          }
        }

        const projects = db
          .prepare(projectsQuery)
          .all(...projectsArgs) as any[];

        if (projects.length === 0) {
          return res.json({ success: true, data: [] });
        }

        const projectIds = projects.map((p) => p.id);
        const placeholders = projectIds.map(() => "?").join(",");

        // 1. Batch BOM counts
        const bomCountMap = new Map<string, number>();
        try {
          const bomCounts = db
            .prepare(`SELECT project_id, COUNT(*) as count FROM boms WHERE project_id IN (${placeholders}) GROUP BY project_id`)
            .all(...projectIds) as any[];
          bomCounts.forEach((r) => bomCountMap.set(r.project_id, Number(r.count)));
        } catch (e) {}

        // 2. Batch PRs with items via JSON aggregation
        const prsByProject = new Map<string, any[]>();
        try {
          const prs = db
            .prepare(`
              SELECT
                pr.id, pr.project_id, pr.pr_number, pr.status, pr.urgency, pr.created_at,
                COALESCE(
                  (
                    SELECT json_group_array(
                      json_object(
                        'id', pri.id,
                        'dimension', pri.dimension,
                        'spec', pri.spec,
                        'qty', pri.qty,
                        'unit_price', pri.unit_price,
                        'item_name', i.name,
                        'item_code', i.item_code
                      )
                    )
                    FROM pr_items pri
                    JOIN items i ON pri.item_id = i.id
                    WHERE pri.pr_id = pr.id
                  ),
                  '[]'
                ) as items_json
              FROM purchase_requests pr
              WHERE pr.project_id IN (${placeholders})
              ORDER BY pr.created_at DESC
            `)
            .all(...projectIds) as any[];

          prs.forEach((pr) => {
            pr.items = JSON.parse(pr.items_json || "[]");
            if (!prsByProject.has(pr.project_id)) prsByProject.set(pr.project_id, []);
            prsByProject.get(pr.project_id)!.push(pr);
          });
        } catch (e) {}

        // 3. Batch POs with items
        const posByProject = new Map<string, any[]>();
        const allPos: any[] = [];
        try {
          const pos = db
            .prepare(`
              SELECT DISTINCT
                po.id, po.po_number, po.status, po.supplier_name, po.created_at, pr.project_id,
                COALESCE(
                  (
                    SELECT json_group_array(
                      json_object(
                        'id', pri.id,
                        'dimension', pri.dimension,
                        'spec', pri.spec,
                        'qty', pri.qty,
                        'unit_price', pri.unit_price,
                        'item_name', i.name,
                        'item_code', i.item_code
                      )
                    )
                    FROM pr_items pri
                    JOIN items i ON pri.item_id = i.id
                    WHERE pri.po_id = po.id
                  ),
                  '[]'
                ) as items_json,
                COALESCE(
                  (
                    SELECT GROUP_CONCAT(DISTINCT pr2.pr_number)
                    FROM purchase_requests pr2
                    JOIN pr_items pri2 ON pr2.id = pri2.pr_id
                    WHERE pri2.po_id = po.id
                  ),
                  ''
                ) as pr_numbers
              FROM purchase_orders po
              JOIN pr_items pri ON po.id = pri.po_id
              JOIN purchase_requests pr ON pri.pr_id = pr.id
              WHERE pr.project_id IN (${placeholders})
            `)
            .all(...projectIds) as any[];

          pos.forEach((po) => {
            po.items = JSON.parse(po.items_json || "[]");
            allPos.push(po);
            if (!posByProject.has(po.project_id)) posByProject.set(po.project_id, []);
            posByProject.get(po.project_id)!.push(po);
          });
        } catch (e) {}

        // 4. Batch GRNs
        const grnsByPo = new Map<string, any[]>();
        if (allPos.length > 0) {
          try {
            const poPlaceholders = allPos.map(() => "?").join(",");
            const poIds = allPos.map((p) => p.id);
            const grns = db
              .prepare(`
                SELECT
                  g.id, g.id as grn_id, g.po_id, g.qc_status, g.received_date, g.rejected_grn_doc, g.is_reissue, g.remarks,
                  COALESCE(
                    (
                      SELECT json_group_array(
                        json_object(
                          'id', gi.id,
                          'dimension', gi.dimension,
                          'spec', gi.spec,
                          'qty', gi.qty_received,
                          'item_name', i.name,
                          'item_code', i.item_code
                        )
                      )
                      FROM grn_items gi
                      JOIN items i ON gi.item_id = i.id
                      WHERE gi.grn_id = g.id
                    ),
                    '[]'
                  ) as items_json
                FROM grns g
                WHERE g.po_id IN (${poPlaceholders})
              `)
              .all(...poIds) as any[];

            grns.forEach((grn) => {
              grn.items = JSON.parse(grn.items_json || "[]");
              if (!grnsByPo.has(grn.po_id)) grnsByPo.set(grn.po_id, []);
              grnsByPo.get(grn.po_id)!.push(grn);
            });
          } catch (e) {}
        }

        // 5. Batch Quotations
        const quotationsMap = new Map<string, any>();
        try {
          const quotations = db
            .prepare(`
              SELECT q.*, c.name as customer_name
              FROM quotations q
              LEFT JOIN customers c ON q.customer_id = c.id
              WHERE q.archived_at IS NULL
            `)
            .all() as any[];
          quotations.forEach((q) => quotationsMap.set(q.id, q));
        } catch (e) {}

        // 6. Batch SPKs & NTPs
        const spksByProject = new Map<string, any>();
        const ntpsByProject = new Map<string, any>();
        try {
          const spks = db.prepare(`SELECT * FROM spks WHERE project_id IN (${placeholders})`).all(...projectIds) as any[];
          spks.forEach((s) => spksByProject.set(s.project_id, s));
        } catch (e) {}
        try {
          const ntps = db.prepare(`SELECT * FROM ntps WHERE project_id IN (${placeholders})`).all(...projectIds) as any[];
          ntps.forEach((n) => ntpsByProject.set(n.project_id, n));
        } catch (e) {}

        // 7. Batch Delivery Notes
        const dnsByProject = new Map<string, any[]>();
        try {
          const dns = db
            .prepare(`
              SELECT
                dn.*, c.name as customer_name,
                COALESCE(
                  (
                    SELECT json_group_array(
                      json_object(
                        'id', di.id,
                        'qty', di.qty,
                        'uom', di.uom,
                        'remarks', di.remarks,
                        'item_code', COALESCE(i.item_code, 'FG-' || dn.project_id),
                        'item_name', COALESCE(i.name, p.name, 'Commercial Trade Item')
                      )
                    )
                    FROM delivery_items di
                    LEFT JOIN items i ON di.item_id = i.id
                    LEFT JOIN projects p ON dn.project_id = p.id
                    WHERE di.dn_id = dn.id
                  ),
                  '[]'
                ) as items_json
              FROM delivery_notes dn
              LEFT JOIN customers c ON dn.customer_id = c.id
              WHERE dn.project_id IN (${placeholders})
            `)
            .all(...projectIds) as any[];

          dns.forEach((dn) => {
            dn.items = JSON.parse(dn.items_json || "[]");
            if (!dnsByProject.has(dn.project_id)) dnsByProject.set(dn.project_id, []);
            dnsByProject.get(dn.project_id)!.push(dn);
          });
        } catch (e) {}

        // 8. Batch Commercial Invoices
        const cisByProject = new Map<string, any[]>();
        try {
          const cis = db
            .prepare(`
              SELECT
                ci.*, bk.bank_name, bk.account_number, bk.account_holder,
                COALESCE(
                  (
                    SELECT json_group_array(
                      json_object(
                        'id', di.id,
                        'qty', di.qty,
                        'uom', di.uom,
                        'item_code', COALESCE(i.item_code, 'FG-' || dn.project_id),
                        'item_name', COALESCE(i.name, p.name, 'Commercial Trade Item')
                      )
                    )
                    FROM delivery_items di
                    JOIN delivery_notes dn ON di.dn_id = dn.id
                    LEFT JOIN items i ON di.item_id = i.id
                    LEFT JOIN projects p ON dn.project_id = p.id
                    WHERE di.dn_id = ci.dn_id
                  ),
                  '[]'
                ) as items_json
              FROM commercial_invoices ci
              LEFT JOIN bank_accounts bk ON ci.bank_account_id = bk.id
              WHERE ci.project_id IN (${placeholders})
            `)
            .all(...projectIds) as any[];

          cis.forEach((ci) => {
            ci.items = JSON.parse(ci.items_json || "[]");
            if (!cisByProject.has(ci.project_id)) cisByProject.set(ci.project_id, []);
            cisByProject.get(ci.project_id)!.push(ci);
          });
        } catch (e) {}

        // Assembled response in O(N) in-memory without extra DB queries
        const data = projects.map((proj) => {
          const pos = posByProject.get(proj.id) || [];
          const projectGrns: any[] = [];
          pos.forEach((po) => {
            const grns = grnsByPo.get(po.id) || [];
            projectGrns.push(...grns);
          });

          return {
            ...proj,
            bom_count: bomCountMap.get(proj.id) || 0,
            prs: prsByProject.get(proj.id) || [],
            pos,
            grns: projectGrns,
            quotation: proj.quotation_id ? (quotationsMap.get(proj.quotation_id) || null) : null,
            spk: spksByProject.get(proj.id) || null,
            ntp: ntpsByProject.get(proj.id) || null,
            finished_goods: [],
            delivery_notes: dnsByProject.get(proj.id) || [],
            commercial_invoices: cisByProject.get(proj.id) || [],
          };
        });

        res.json({ success: true, data });
      } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
      }
    });

    router.get(
      "/api/datacenter/search",
      requireRole(["FC", "ADMIN", "SUPERADMIN", "ENGINEERING", "PURCHASING", "WAREHOUSE", "PRODUCTION", "SALES"]),
      (req, res) => {
      try {
        const q = (req.query.q as string) || "";
        if (!q || q.trim().length < 2) {
          return res.json({ success: true, data: [] });
        }

        const searchTerm = `%${q.trim().toLowerCase()}%`;
        const results: any[] = [];

        // Items
        const items = db
          .prepare(
            `SELECT id, item_code, name, category as type, spec FROM items WHERE LOWER(item_code) LIKE ? OR LOWER(name) LIKE ? OR LOWER(spec) LIKE ? LIMIT 10`,
          )
          .all(searchTerm, searchTerm, searchTerm) as any[];
        items.forEach((i) =>
          results.push({
            id: i.id,
            type: "ITEM",
            title: i.name,
            code: i.item_code,
            subtitle: i.spec,
            meta: i.type,
            link: "/warehouse",
          }),
        );

        // Projects
        const projects = db
          .prepare(
            `SELECT id, name, status, type FROM projects WHERE (LOWER(name) LIKE ? OR LOWER(id) LIKE ?) AND id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL') LIMIT 10`,
          )
          .all(searchTerm, searchTerm) as any[];
        projects.forEach((p) =>
          results.push({
            id: p.id,
            type: "PROJECT",
            title: p.name,
            code: p.id,
            subtitle: `Status: ${p.status}`,
            meta: p.type,
            link: `/project/${p.id}`,
          }),
        );

        // PRs
        const prs = db
          .prepare(
            `SELECT id, pr_number, project_id, status FROM purchase_requests WHERE LOWER(pr_number) LIKE ? LIMIT 10`,
          )
          .all(searchTerm) as any[];
        prs.forEach((p) =>
          results.push({
            id: p.id,
            type: "PR",
            title: p.pr_number,
            code: p.pr_number,
            subtitle: `Project ID: ${p.project_id || "-"}`,
            meta: p.status,
            link: `/requests?pr=${p.id}`,
          }),
        );

        // POs
        const pos = db
          .prepare(
            `SELECT po.id, po.po_number, po.status, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE LOWER(po.po_number) LIKE ? OR LOWER(s.name) LIKE ? LIMIT 10`,
          )
          .all(searchTerm, searchTerm) as any[];
        pos.forEach((p) =>
          results.push({
            id: p.id,
            type: "PO",
            title: p.po_number,
            code: p.po_number,
            subtitle: `Supplier: ${p.supplier_name || "-"}`,
            meta: p.status,
            link: `/procurement?po=${p.id}`,
          }),
        );

        // GRNs
        const grns = db
          .prepare(
            `SELECT grn.id, grn.id as grn_id, grn.po_id, p.po_number FROM grns grn JOIN purchase_orders p ON grn.po_id = p.id WHERE LOWER(grn.id) LIKE ? OR LOWER(p.po_number) LIKE ? LIMIT 10`,
          )
          .all(searchTerm, searchTerm) as any[];
        grns.forEach((g) =>
          results.push({
            id: g.id,
            type: "GRN",
            title: g.grn_id,
            code: g.grn_id,
            subtitle: `PO: ${g.po_number}`,
            meta: "RECEIVED",
            link: `/warehouse?grn=${g.id}`,
          }),
        );

        // Customers
        const customers = db
          .prepare(
            `SELECT id, code, name, contact_person FROM customers WHERE LOWER(code) LIKE ? OR LOWER(name) LIKE ? OR LOWER(contact_person) LIKE ? LIMIT 10`,
          )
          .all(searchTerm, searchTerm, searchTerm) as any[];
        customers.forEach((c) =>
          results.push({
            id: c.id,
            type: "CUSTOMER",
            title: c.name,
            code: c.code,
            subtitle: `Contact: ${c.contact_person || "-"}`,
            meta: "CUSTOMER",
            link: "/crm",
          }),
        );

        // Suppliers
        const suppliers = db
          .prepare(
            `SELECT id, supplier_code, name, category FROM suppliers WHERE LOWER(supplier_code) LIKE ? OR LOWER(name) LIKE ? LIMIT 10`,
          )
          .all(searchTerm, searchTerm) as any[];
        suppliers.forEach((s) =>
          results.push({
            id: s.id,
            type: "SUPPLIER",
            title: s.name,
            code: s.supplier_code,
            subtitle: `Category: ${s.category || "-"}`,
            meta: "SUPPLIER",
            link: "/vendors",
          }),
        );

        res.json({ success: true, data: results });
      } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
      }
    });

