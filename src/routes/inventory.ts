import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import { validateBody } from "../middleware/validate.ts";
import { StockAdjustmentSchema, StockTransferSchema } from "../schemas/index.ts";
import { inventoryService } from "../services/inventoryService.ts";
import { cacheService } from "../services/cacheService.ts";
import { outboxService } from "../services/outboxService.ts";
import { logAudit } from "../utils/audit.ts";
import { syncCollectionToFirestore } from "../db/firebaseSync.ts";
import { postJournalEntry } from "../utils/accountingBridge.ts";

export const inventoryRouter = Router();

    // Dedicated Secure Stock Adjustment API with Zod Schema Validation & Outbox
    inventoryRouter.post(
      "/api/inventory/adjust",
      requireRole(["WAREHOUSE", "FC", "ADMIN", "SUPERADMIN"]),
      validateBody(StockAdjustmentSchema),
      async (req, res) => {
        try {
          const userEmail = (req as any).userEmail || (req.headers["x-user-email"] as string) || "admin";
          const result = await inventoryService.adjustStock(req.body, userEmail);
          logAudit(
            userEmail,
            "STOCK_ADJUSTMENT",
            "INVENTORY",
            req.body.item_id,
            `Stock adjusted for ${result.item_name}: delta ${result.delta} (New: ${result.new_stock}) - Reason: ${req.body.reason}`
          );
          res.json({ success: true, data: result });
        } catch (err: any) {
          res.status(400).json({ error: err.message || "Failed to adjust stock" });
        }
      }
    );

    inventoryRouter.post(
      "/api/inventory/adjustments",
      requireRole(["WAREHOUSE", "FC", "ADMIN", "SUPERADMIN"]),
      validateBody(StockAdjustmentSchema),
      async (req, res) => {
        try {
          const userEmail = (req as any).userEmail || (req.headers["x-user-email"] as string) || "admin";
          const result = await inventoryService.adjustStock(req.body, userEmail);
          res.json({ success: true, data: result });
        } catch (err: any) {
          res.status(400).json({ error: err.message || "Failed to adjust stock" });
        }
      }
    );

    // Dedicated Secure Stock Transfer API with Zod Schema Validation & Outbox
    inventoryRouter.post(
      ["/api/inventory/transfer", "/api/inventory/transfers"],
      requireRole(["WAREHOUSE", "FC", "ADMIN", "SUPERADMIN"]),
      validateBody(StockTransferSchema),
      async (req, res) => {
        try {
          const userEmail = (req as any).user?.username || (req as any).userEmail || (req.headers["x-user-email"] as string) || "admin";
          const result = await inventoryService.transferStock(req.body, userEmail);
          logAudit(
            userEmail,
            "STOCK_TRANSFER",
            "INVENTORY",
            req.body.item_id,
            `Stock transferred for ${result.item_name}: ${req.body.quantity} units from ${req.body.source_warehouse_id} to ${req.body.target_warehouse_id}`
          );
          res.json({ success: true, data: result });
        } catch (err: any) {
          res.status(400).json({ error: err.message || "Failed to transfer stock" });
        }
      }
    );

    inventoryRouter.get(
      "/api/inventory/movements",
      requireRole(["WAREHOUSE", "PURCHASING", "PRODUCTION", "ENGINEERING"]),
      (req, res) => {
        try {
          const limit = parseInt(req.query.limit as string) || 100;
          const offset = parseInt(req.query.offset as string) || 0;
          const movements = db
            .prepare(
              `
        SELECT m.*, i.item_code, i.name as item_name, i.uom, p.name as project_name,
               po.po_number, po.supplier_name, pr_info.pr_numbers
        FROM stock_movements m
        JOIN items i ON m.item_id = i.id
        LEFT JOIN projects p ON m.project_id = p.id
        LEFT JOIN grns g ON (m.reference_id = g.id AND m.type = 'GRN')
        LEFT JOIN purchase_orders po ON g.po_id = po.id
        LEFT JOIN (
          SELECT pri.po_id, GROUP_CONCAT(DISTINCT pr.pr_number) as pr_numbers
          FROM pr_items pri
          JOIN purchase_requests pr ON pri.pr_id = pr.id
          GROUP BY pri.po_id
        ) pr_info ON po.id = pr_info.po_id
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
      `,
            )
            .all(limit, offset);

          const totalCount = db
            .prepare("SELECT COUNT(*) as count FROM stock_movements")
            .get() as any;

          res.json({ movements, total: totalCount.count });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch movements" });
        }
      },
    );

    inventoryRouter.get("/api/items", (req, res) => {
      try {
        const page = parseInt(req.query.page as string) || 0;
        const limit = parseInt(req.query.limit as string) || 0;
        const search = req.query.search ? `%${req.query.search}%` : null;
        const type = req.query.type as string;

        const isDefaultList = !search && (!type || type === "ALL") && (!limit || limit >= 500);
        const cacheKey = "items:default_list";

        if (isDefaultList) {
          const cached = cacheService.get<any[]>(cacheKey);
          if (cached) return res.json(cached);
        }

        let queryStr = `
          SELECT i.*, 
                 COALESCE(inv.free_stock, 0) as free_stock, 
                 COALESCE(inv.allocated_stock, 0) as allocated_stock
          FROM items i
          LEFT JOIN inventory inv ON i.id = inv.item_id
          WHERE i.deleted_at IS NULL
        `;

        const params: any[] = [];
        if (search) {
          queryStr += ` AND (i.item_code LIKE ? OR i.name LIKE ? OR i.spec LIKE ? OR i.machine_category LIKE ?)`;
          params.push(search, search, search, search);
        }
        if (type) {
          queryStr += ` AND i.type = ?`;
          params.push(type);
        }

        queryStr += ` ORDER BY i.item_code ASC`;

        if (limit > 0) {
          const offset = page > 0 ? (page - 1) * limit : 0;
          queryStr += ` LIMIT ? OFFSET ?`;
          params.push(limit, offset);
        }

        const items = db.prepare(queryStr).all(...params);

        if (isDefaultList) {
          cacheService.set(cacheKey, items, 180, "items");
        }

        res.json(items);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch items" });
      }
    });

    // Get single item by code or ID
    inventoryRouter.get("/api/items/code/:code", (req, res) => {
      try {
        const rawCode = (req.params.code || "").trim();
        const item = db
          .prepare(`
            SELECT i.*, 
                   COALESCE(inv.free_stock, 0) as free_stock, 
                   COALESCE(inv.allocated_stock, 0) as allocated_stock
            FROM items i
            LEFT JOIN inventory inv ON i.id = inv.item_id
            WHERE (UPPER(TRIM(i.item_code)) = UPPER(TRIM(?)) OR i.id = ?)
              AND i.deleted_at IS NULL
          `)
          .get(rawCode, rawCode);
        if (!item) return res.status(404).json({ error: "Item not found" });
        res.json(item);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch item" });
      }
    });

    // Search items by query
    inventoryRouter.get("/api/items/search", (req, res) => {
      try {
        const q = req.query.q as string;
        if (!q) return res.json([]);
        const searchTerm = `%${q}%`;
        const items = db
          .prepare(
            `
        SELECT i.*, 
               COALESCE(inv.free_stock, 0) as free_stock, 
               COALESCE(inv.allocated_stock, 0) as allocated_stock
        FROM items i
        LEFT JOIN inventory inv ON i.id = inv.item_id
        WHERE i.name LIKE ? OR i.item_code LIKE ? OR i.dimension LIKE ? OR i.spec LIKE ?
        LIMIT 50
      `,
          )
          .all(searchTerm, searchTerm, searchTerm, searchTerm);
        res.json(items);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Search failed" });
      }
    });

    // Create new item
    inventoryRouter.post(
      "/api/items",
      requireRole(["ENGINEERING", "PURCHASING", "WAREHOUSE", "FC", "ADMIN"]),
      (req, res) => {
        try {
          const { 
            item_code, 
            name, 
            uom, 
            dimension, 
            spec, 
            type, 
            unit_price,
            selling_price,
            category,
            description,
            min_stock,
            max_stock,
            machine_category,
            capacity_per_hour,
            operational_status,
            serial_number,
            manufacturer,
            machine_specifications,
            item_type,
            bypass_multi_station,
            is_published_shop,
            shop_image_url,
            shop_promo_price,
            shop_weight_kg,
            shop_badge,
            shop_featured,
            shop_availability_type,
            shop_lead_time_days,
            shop_moq,
            shop_specs,
            shop_gallery_urls
          } = req.body;

          const code = (item_code || "").toString().trim().toUpperCase();
          const itemName = (name || "").toString().trim();
          const itemUom = (uom || "").toString().trim().toUpperCase();

          if (!code || !itemName || !itemUom) {
            return res.status(400).json({
              error: "Kode SKU, Nama Barang, dan Satuan (UOM) wajib diisi.",
            });
          }

          // Check if item_code already exists in database
          const existing = db
            .prepare("SELECT id, item_code, name, deleted_at FROM items WHERE item_code = ? COLLATE NOCASE")
            .get(code) as any;

          if (existing) {
            if (!existing.deleted_at) {
              return res.status(400).json({
                error: `Kode SKU '${code}' sudah terdaftar (${existing.name}). Gunakan kode SKU lain yang unik.`,
              });
            } else {
              // Hard-delete soft-deleted item with same code to prevent UNIQUE constraint conflict
              db.prepare("DELETE FROM stock_movements WHERE item_id = ?").run(existing.id);
              db.prepare("DELETE FROM inventory WHERE item_id = ?").run(existing.id);
              db.prepare("DELETE FROM item_supplier_prices WHERE item_id = ?").run(existing.id);
              db.prepare("DELETE FROM item_price_history WHERE item_id = ?").run(existing.id);
              db.prepare("DELETE FROM items WHERE id = ?").run(existing.id);
            }
          }

          const itemId =
            "ITEM-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();

          const rawType = (type || "RAW").toString().trim().toUpperCase();
          let resolvedType = rawType;
          if (rawType === "FINISH_GOOD" || rawType === "FINISHED_GOOD") {
            resolvedType = "FINISHED";
          } else if (["CONSUMABLE", "GENERAL", "SPAREPART"].includes(rawType)) {
            resolvedType = "RAW";
          } else if (!["RAW", "WIP", "FINISHED", "TOOL", "MACHINE"].includes(rawType)) {
            resolvedType = "RAW";
          }

          const resolvedItemType = item_type || (resolvedType === "MACHINE" ? "MACHINE" : "MATERIAL");
          const resolvedCategory =
            category ||
            (rawType === "FINISH_GOOD" || resolvedType === "FINISHED"
              ? "Paving & Precast"
              : resolvedType === "MACHINE"
              ? "Machine Equipment"
              : "General");
          const bypass = bypass_multi_station ? 1 : 0;

          db.transaction(() => {
            db.prepare(
              `INSERT INTO items (
                id, item_code, name, uom, dimension, spec, type, unit_price, selling_price,
                category, description, min_stock, max_stock, machine_category,
                capacity_per_hour, operational_status, serial_number, manufacturer,
                machine_specifications, item_type, bypass_multi_station,
                is_published_shop, shop_image_url, shop_promo_price, shop_weight_kg,
                shop_badge, shop_featured, shop_availability_type, shop_lead_time_days,
                shop_moq, shop_specs, shop_gallery_urls
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              itemId,
              code,
              itemName,
              itemUom,
              dimension || "",
              spec || "",
              resolvedType,
              unit_price || 0,
              selling_price || unit_price || 0,
              resolvedCategory,
              description || "",
              min_stock || 0,
              max_stock || 0,
              machine_category || null,
              capacity_per_hour || null,
              operational_status || "AVAILABLE",
              serial_number || null,
              manufacturer || null,
              machine_specifications ? JSON.stringify(machine_specifications) : null,
              resolvedItemType,
              bypass,
              is_published_shop !== undefined ? (is_published_shop ? 1 : 0) : (rawType === "FINISH_GOOD" || resolvedType === "FINISHED" ? 1 : 0),
              shop_image_url || null,
              shop_promo_price || 0,
              shop_weight_kg || 2.5,
              shop_badge || null,
              shop_featured ? 1 : 0,
              shop_availability_type || "AUTO",
              shop_lead_time_days || 3,
              shop_moq || 1,
              shop_specs || null,
              shop_gallery_urls ? (typeof shop_gallery_urls === "string" ? shop_gallery_urls : JSON.stringify(shop_gallery_urls)) : "[]"
            );

            db.prepare(
              `INSERT OR REPLACE INTO inventory (item_id, physical_qty, reserved_qty, available_qty, free_stock, allocated_stock, min_stock, max_stock)
               VALUES (?, 0, 0, 0, 0, 0, ?, ?)`
            ).run(itemId, min_stock || 0, max_stock || 0);
          })();

          logAudit(
            (req.headers["x-user-email"] as string) || "SYSTEM",
            "CREATE_ITEM",
            "ITEM",
            itemId,
            `Registered new SKU ${code} (${itemName})`
          );

          // Invalidate Master Data cache and enqueue outbox event
          cacheService.invalidateNamespace("items");
          outboxService.enqueue(
            db,
            "INVENTORY_ITEMS",
            itemId,
            "CREATE",
            { id: itemId, item_code: code, name: itemName, uom: itemUom, type: type || "RAW", created_at: new Date().toISOString() },
            "BOTH"
          );

          res.json({ success: true, id: itemId, message: "Item created successfully" });
        } catch (error: any) {
          console.error("[Inventory API] Create item error:", error);
          res.status(400).json({ error: error?.message || "Failed to create item" });
        }
      },
    );

    // Update existing item
    inventoryRouter.put(
      "/api/items/:id",
      requireRole(["ENGINEERING", "PURCHASING", "WAREHOUSE", "FC", "ADMIN"]),
      (req, res) => {
        try {
          const { id } = req.params;
          const {
            item_code,
            name,
            uom,
            dimension,
            spec,
            type,
            unit_price,
            machine_category,
            capacity_per_hour,
            operational_status,
            serial_number,
            manufacturer,
            machine_specifications,
            item_type,
            bypass_multi_station
          } = req.body;

          const existing = db.prepare("SELECT * FROM items WHERE id = ?").get(id) as any;
          if (!existing) {
            return res.status(404).json({ error: "Item not found" });
          }

          db.transaction(() => {
            const rawType = (type || existing.type || "RAW").toString().trim().toUpperCase();
            let resolvedType = rawType;
            if (rawType === "FINISH_GOOD" || rawType === "FINISHED_GOOD") {
              resolvedType = "FINISHED";
            } else if (["CONSUMABLE", "GENERAL", "SPAREPART"].includes(rawType)) {
              resolvedType = "RAW";
            } else if (!["RAW", "WIP", "FINISHED", "TOOL", "MACHINE"].includes(rawType)) {
              resolvedType = "RAW";
            }

            const resolvedItemType = item_type || (resolvedType === "MACHINE" ? "MACHINE" : "MATERIAL");
            const resolvedBypass = bypass_multi_station !== undefined ? (bypass_multi_station ? 1 : 0) : (existing.bypass_multi_station || 0);

            // One-Gate Policy: Price on inventory items (except Finish Goods) is the exclusive authority of Purchasing
            const isFinishGood = rawType === "FINISH_GOOD" || resolvedType === "FINISHED" || (existing.item_code && existing.item_code.startsWith("FG-"));
            const userRoleUpper = ((req as any).userRole || "").toUpperCase();
            const isPurchasingOrAdmin = ["PURCHASING", "ADMIN", "SUPER_ADMIN", "FC"].includes(userRoleUpper);
            const canEditPrice = isFinishGood || isPurchasingOrAdmin;
            const finalUnitPrice = canEditPrice && unit_price !== undefined ? Number(unit_price) : (existing.unit_price || 0);

            db.prepare(
              `UPDATE items SET
                item_code = ?,
                name = ?,
                uom = ?,
                dimension = ?,
                spec = ?,
                type = ?,
                unit_price = ?,
                machine_category = ?,
                capacity_per_hour = ?,
                operational_status = ?,
                serial_number = ?,
                manufacturer = ?,
                machine_specifications = ?,
                item_type = ?,
                bypass_multi_station = ?
              WHERE id = ?`
            ).run(
              item_code || existing.item_code,
              name || existing.name,
              uom || existing.uom,
              dimension !== undefined ? dimension : existing.dimension,
              spec !== undefined ? spec : existing.spec,
              resolvedType,
              finalUnitPrice,
              machine_category !== undefined ? machine_category : existing.machine_category,
              capacity_per_hour !== undefined ? (capacity_per_hour ? Number(capacity_per_hour) : null) : existing.capacity_per_hour,
              operational_status || existing.operational_status || "AVAILABLE",
              serial_number !== undefined ? serial_number : existing.serial_number,
              manufacturer !== undefined ? manufacturer : existing.manufacturer,
              machine_specifications ? JSON.stringify(machine_specifications) : existing.machine_specifications,
              resolvedItemType,
              resolvedBypass,
              id
            );

            // Ensure inventory row exists
            db.prepare(
              `INSERT OR IGNORE INTO inventory (item_id, physical_qty, free_stock, allocated_stock, available_qty)
               VALUES (?, 0, 0, 0, 0)`
            ).run(id);
          })();

          logAudit(
            (req.headers["x-user-email"] as string) || "SYSTEM",
            "UPDATE_ITEM",
            "ITEM",
            id,
            `Updated item ${item_code || existing.item_code} (${name || existing.name})`
          );

          cacheService.invalidateNamespace("items");
          res.json({ success: true, message: "Item updated successfully" });
        } catch (error: any) {
          console.error(error);
          res.status(500).json({ error: error?.message || "Failed to update item" });
        }
      }
    );

    // Delete item
    inventoryRouter.delete(
      "/api/items/:id",
      requireRole(["ENGINEERING", "PURCHASING", "WAREHOUSE", "FC", "ADMIN"]),
      (req, res) => {
        try {
          const { id } = req.params;
          const item = db.prepare("SELECT * FROM items WHERE id = ?").get(id) as any;
          if (!item) {
            return res.status(404).json({ error: "Item not found" });
          }

          // Check if item is used in BOMs
          const bomCount = db.prepare("SELECT COUNT(*) as count FROM boms WHERE item_id = ?").get(id) as any;
          if (bomCount && bomCount.count > 0) {
            return res.status(400).json({
              error: `Cannot delete item ${item.item_code}: It is currently referenced in ${bomCount.count} Bill of Materials (BOM).`,
            });
          }

          // Check if item has allocated or reserved stock in production
          const stock = db.prepare("SELECT COALESCE(allocated_stock, 0) as allocated, COALESCE(reserved_qty, 0) as reserved FROM inventory WHERE item_id = ?").get(id) as any;
          if (stock && (stock.allocated > 0 || stock.reserved > 0)) {
            return res.status(400).json({
              error: `Cannot delete item ${item.item_code}: It has active allocated/reserved production stock (${stock.allocated || stock.reserved}).`,
            });
          }

          db.transaction(() => {
            db.prepare("DELETE FROM stock_movements WHERE item_id = ?").run(id);
            db.prepare("DELETE FROM inventory WHERE item_id = ?").run(id);
            db.prepare("DELETE FROM item_supplier_prices WHERE item_id = ?").run(id);
            db.prepare("DELETE FROM item_price_history WHERE item_id = ?").run(id);
            db.prepare("DELETE FROM bom_template_items WHERE item_id = ?").run(id);
            db.prepare("DELETE FROM items WHERE id = ?").run(id);
          })();

          logAudit(
            (req.headers["x-user-email"] as string) || "SYSTEM",
            "DELETE_ITEM",
            "ITEM",
            id,
            `Deleted item ${item.item_code} (${item.name})`
          );

          cacheService.invalidateNamespace("items");
          res.json({ success: true, message: `Item ${item.item_code} deleted successfully` });
        } catch (error: any) {
          console.error(error);
          res.status(500).json({ error: error?.message || "Failed to delete item" });
        }
      }
    );

    // Endpoint to sync ALL matrix prices across all active project BOMs
    inventoryRouter.post(
      "/api/inventory/sync-all-matrix-boms",
      requireRole(["PURCHASING", "ENGINEERING", "FC"]),
      (req, res) => {
        try {
          const itemsWithPrices = db.prepare(
            `SELECT i.id, COALESCE((SELECT MIN(unit_price) FROM item_supplier_prices WHERE item_id = i.id), i.unit_price, 0) as matrix_price
             FROM items i`
          ).all() as any[];

          let totalUpdatedBoms = 0;
          const stmtUpdateItems = db.prepare("UPDATE items SET unit_price = ? WHERE id = ?");
          const stmtBom = db.prepare(
            `UPDATE boms 
             SET unit_price = ? 
             WHERE item_id = ? 
             AND project_id IN (SELECT id FROM projects WHERE status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED'))`
          );
          const stmtTpl = db.prepare("UPDATE bom_template_items SET unit_price = ? WHERE item_id = ?");

          db.transaction(() => {
            for (const item of itemsWithPrices) {
              if (item.matrix_price > 0) {
                stmtUpdateItems.run(item.matrix_price, item.id);
                const resBom = stmtBom.run(item.matrix_price, item.id);
                stmtTpl.run(item.matrix_price, item.id);
                totalUpdatedBoms += resBom.changes;
              }
            }
          })();

          res.json({ success: true, updated_boms: totalUpdatedBoms });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to sync all matrix prices to BOMs" });
        }
      },
    );

    // Endpoint to sync a single item's matrix price to all active project BOMs
    inventoryRouter.post(
      "/api/inventory/items/:id/sync-bom",
      requireRole(["PURCHASING", "ENGINEERING", "FC", "ADMIN"]),
      (req, res) => {
        try {
          const { id } = req.params;
          const bestPriceRow = db.prepare(
            "SELECT MIN(unit_price) as min_p FROM item_supplier_prices WHERE item_id = ?"
          ).get(id) as any;
          const itemRow = db.prepare("SELECT unit_price FROM items WHERE id = ?").get(id) as any;
          const matrixPrice = bestPriceRow?.min_p ?? itemRow?.unit_price ?? 0;

          if (matrixPrice > 0) {
            db.prepare("UPDATE items SET unit_price = ? WHERE id = ?").run(matrixPrice, id);
            const resBom = db.prepare(
              `UPDATE boms SET unit_price = ? WHERE item_id = ? AND project_id IN (SELECT id FROM projects WHERE status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED'))`
            ).run(matrixPrice, id);
            db.prepare("UPDATE bom_template_items SET unit_price = ? WHERE item_id = ?").run(matrixPrice, id);
            return res.json({ success: true, matrix_price: matrixPrice, updated_boms: resBom.changes });
          }
          res.json({ success: true, matrix_price: 0, updated_boms: 0 });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to sync price with BOM" });
        }
      }
    );

    // One-Gate Purchasing: Direct Standard Unit Price update from Sourcing & Pricing
    inventoryRouter.put(
      "/api/inventory/items/:id/standard-price",
      requireRole(["PURCHASING", "FC", "ADMIN", "SUPER_ADMIN"]),
      (req, res) => {
        try {
          const { id } = req.params;
          const { unit_price, remarks } = req.body;
          const email = (req.headers["x-user-email"] as string) || "PURCHASING";

          if (unit_price === undefined || isNaN(Number(unit_price)) || Number(unit_price) < 0) {
            return res.status(400).json({ error: "Valid unit price is required" });
          }

          const priceVal = Number(unit_price);
          const defaultSupp = db.prepare(
            "SELECT supplier_id FROM item_supplier_prices WHERE item_id = ? LIMIT 1"
          ).get(id) as any;
          let suppId = req.body.supplier_id || defaultSupp?.supplier_id;
          if (!suppId) {
            const anySupp = db.prepare("SELECT id FROM suppliers LIMIT 1").get() as any;
            suppId = anySupp?.id;
          }
          if (!suppId) {
            db.prepare(
              "INSERT OR IGNORE INTO suppliers (id, name, code, contact_person) VALUES ('SUP-INTERNAL', 'Internal / General Sourcing', 'INT-SRC', 'Purchasing Dept')"
            ).run();
            suppId = "SUP-INTERNAL";
          }

          db.transaction(() => {
            db.prepare("UPDATE items SET unit_price = ? WHERE id = ?").run(priceVal, id);
            db.prepare(
              `INSERT INTO item_price_history (id, item_id, supplier_id, unit_price, recorded_by)
               VALUES (?, ?, ?, ?, ?)`
            ).run("IPH-" + Math.random().toString(36).substr(2, 9), id, suppId, priceVal, `${email} (Manual Sourcing Standard Price)`);
            db.prepare(
              `UPDATE boms SET unit_price = ? WHERE item_id = ? AND project_id IN (SELECT id FROM projects WHERE status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED'))`
            ).run(priceVal, id);
            db.prepare("UPDATE bom_template_items SET unit_price = ? WHERE item_id = ?").run(priceVal, id);
          })();

          res.json({ success: true, unit_price: priceVal });
        } catch (error: any) {
          console.error(error);
          res.status(500).json({ error: error.message || "Failed to update standard unit price" });
        }
      }
    );

    // Endpoint to sync a specific project's BOM items with matrix prices
    inventoryRouter.post(
      "/api/projects/:id/boms/sync-matrix",
      requireRole(["ENGINEERING", "PURCHASING", "FC"]),
      (req, res) => {
        try {
          const projectId = req.params.id;
          const projectBoms = db.prepare("SELECT id, item_id FROM boms WHERE project_id = ?").all(projectId) as any[];

          let updatedCount = 0;
          const stmtUpdate = db.prepare("UPDATE boms SET unit_price = ? WHERE id = ?");

          db.transaction(() => {
            for (const bom of projectBoms) {
              const best = db.prepare("SELECT MIN(unit_price) as min_p FROM item_supplier_prices WHERE item_id = ?").get(bom.item_id) as any;
              const item = db.prepare("SELECT unit_price FROM items WHERE id = ?").get(bom.item_id) as any;
              const matrixPrice = best?.min_p ?? item?.unit_price ?? 0;
              if (matrixPrice > 0) {
                stmtUpdate.run(matrixPrice, bom.id);
                updatedCount++;
              }
            }
          })();

          res.json({ success: true, updated_count: updatedCount });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to sync project BOM with matrix prices" });
        }
      },
    );

    inventoryRouter.get(
      "/api/inventory/supplier-prices",
      requireRole(["PURCHASING", "ENGINEERING", "PRODUCTION", "WAREHOUSE", "FC", "SALES", "ADMIN"]),
      (req, res) => {
        try {
          const prices = db
            .prepare(
              `
        SELECT isp.*, s.name as supplier_name, s.code as supplier_code, i.item_code
        FROM item_supplier_prices isp
        LEFT JOIN suppliers s ON isp.supplier_id = s.id
        LEFT JOIN items i ON isp.item_id = i.id
        ORDER BY i.item_code ASC, isp.unit_price ASC
      `,
            )
            .all();
          res.json(prices);
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ error: "Failed to fetch all supplier prices" });
        }
      },
    );

    inventoryRouter.get(
      "/api/inventory/items/:id/supplier-prices",
      requireRole(["PURCHASING", "ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        try {
          const { id } = req.params;
          const prices = db
            .prepare(
              `
        SELECT isp.*, s.name as supplier_name, s.code as supplier_code
        FROM item_supplier_prices isp
        JOIN suppliers s ON isp.supplier_id = s.id
        WHERE isp.item_id = ?
        ORDER BY isp.updated_at DESC
      `,
            )
            .all(id);
          res.json(prices);
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ error: "Failed to fetch item supplier prices" });
        }
      },
    );

    inventoryRouter.put(
      "/api/inventory/items/:id/supplier-prices",
      requireRole(["PURCHASING", "ADMIN", "SUPER_ADMIN", "FC", "GOD_MODE", "ENGINEERING", "WAREHOUSE"]),
      (req, res) => {
        try {
          const { id } = req.params;
          const { supplier_id, unit_price } = req.body;
          const email = (req.headers["x-user-email"] as string) || "system";

          if (!supplier_id || !unit_price) {
            return res
              .status(400)
              .json({ error: "Supplier ID and Unit Price are required" });
          }

          db.transaction(() => {
            // 1. Upsert into item_supplier_prices
            db.prepare(
              `
          INSERT INTO item_supplier_prices (item_id, supplier_id, unit_price, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(item_id, supplier_id) DO UPDATE SET
            unit_price = excluded.unit_price,
            updated_at = excluded.updated_at
        `,
            ).run(id, supplier_id, unit_price);

            // 2. Also log to history
            db.prepare(
              `
          INSERT INTO item_price_history (id, item_id, supplier_id, unit_price, recorded_by)
          VALUES (?, ?, ?, ?, ?)
        `,
            ).run(
              "IPH-" + Math.random().toString(36).substr(2, 9),
              id,
              supplier_id,
              unit_price,
              email,
            );

            // 3. Find lowest/best matrix unit price for this item
            const best = db
              .prepare(
                "SELECT MIN(unit_price) as min_p FROM item_supplier_prices WHERE item_id = ?",
              )
              .get(id) as any;
            const matrixPrice = best?.min_p ?? unit_price;

            // 4. Update the global price in items table
            db.prepare("UPDATE items SET unit_price = ? WHERE id = ?").run(
              matrixPrice,
              id,
            );

            // 5. Update BOMs of active projects with matrix price
            db.prepare(
              `
          UPDATE boms 
          SET unit_price = ? 
          WHERE item_id = ? 
          AND project_id IN (SELECT id FROM projects WHERE status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED'))
        `,
            ).run(matrixPrice, id);

            // 6. Update BOM templates with matrix price
            db.prepare(
              "UPDATE bom_template_items SET unit_price = ? WHERE item_id = ?",
            ).run(matrixPrice, id);
          })();

          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to update supplier price" });
        }
      },
    );

    // Get suppliers that have prices for ALL given items (or partial matches if requested)
    inventoryRouter.get(
      "/api/purchasing/suppliers-by-items",
      requireRole(["PURCHASING", "FC"]),
      (req, res) => {
        try {
          const { item_ids, allow_partial } = req.query; // Expecting comma separated string
          if (!item_ids) {
            // If no items specified, return all suppliers as fallback
            const allSuppliers = db
              .prepare(
                `
          SELECT s.*,
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
          ORDER BY s.name
        `,
              )
              .all();
            return res.json(allSuppliers);
          }

          const itemIdsArray = (item_ids as string).split(",");
          const placeholders = itemIdsArray.map(() => "?").join(",");

          let suppliers;
          if (allow_partial === "true") {
            // Return suppliers that have pricing for AT LEAST ONE item in the list
            suppliers = db
              .prepare(
                `
          SELECT s.*,
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
          WHERE s.id IN (
            SELECT supplier_id 
            FROM item_supplier_prices 
            WHERE item_id IN (${placeholders})
          )
          ORDER BY s.name ASC
        `,
              )
              .all(...itemIdsArray) as any[];
          } else {
            // Find suppliers that have pricing for EVERY item in the list
            suppliers = db
              .prepare(
                `
          SELECT s.*,
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
          WHERE s.id IN (
            SELECT supplier_id 
            FROM item_supplier_prices 
            WHERE item_id IN (${placeholders})
            GROUP BY supplier_id
            HAVING COUNT(DISTINCT item_id) = ?
          )
          ORDER BY s.name ASC
        `,
              )
              .all(...itemIdsArray, itemIdsArray.length) as any[];
          }

          // If no perfect matching or partial matching suppliers found in prices matrix, load all suppliers as fallback
          if (suppliers.length === 0) {
            suppliers = db
              .prepare(
                `
          SELECT s.*,
            0 as rejected_count,
            0 as passed_count,
            0 as total_orders
          FROM suppliers s
          ORDER BY s.name ASC
        `,
              )
              .all() as any[];
          }

          // Now fetch and append the unit prices of these items for each of the matching suppliers
          for (const supplier of suppliers) {
            const prices = db
              .prepare(
                `
          SELECT item_id, unit_price 
          FROM item_supplier_prices 
          WHERE supplier_id = ? AND item_id IN (${placeholders})
        `,
              )
              .all(supplier.id, ...itemIdsArray) as any[];

            supplier.item_prices = prices;
          }

          res.json(suppliers);
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch suppliers by items" });
        }
      },
    );

    inventoryRouter.delete(
      "/api/inventory/items/:id/supplier-prices/:supplierId",
      requireRole(["PURCHASING", "ADMIN", "SUPER_ADMIN", "FC", "GOD_MODE", "ENGINEERING", "WAREHOUSE"]),
      (req, res) => {
        try {
          const { id, supplierId } = req.params;

          db.transaction(() => {
            db.prepare(
              `
          DELETE FROM item_supplier_prices 
          WHERE item_id = ? AND supplier_id = ?
        `,
            ).run(id, supplierId);

            // Re-evaluate lowest matrix price
            const best = db
              .prepare(
                "SELECT MIN(unit_price) as min_p FROM item_supplier_prices WHERE item_id = ?",
              )
              .get(id) as any;
            const newMatrixPrice = best?.min_p ?? 0;

            db.prepare("UPDATE items SET unit_price = ? WHERE id = ?").run(
              newMatrixPrice,
              id,
            );
          })();

          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to delete supplier price" });
        }
      },
    );

    inventoryRouter.put(
      "/api/inventory/items/:id/price",
      requireRole(["PURCHASING"]),
      (req, res) => {
        try {
          const { id } = req.params;
          const { unit_price, supplier_id } = req.body;
          const email = (req.headers["x-user-email"] as string) || "system";

          db.transaction(() => {
            db.prepare("UPDATE items SET unit_price = ? WHERE id = ?").run(
              unit_price,
              id,
            );

            // Sync with BOMs for non-finished projects
            db.prepare(
              `
          UPDATE boms 
          SET unit_price = ? 
          WHERE item_id = ? 
          AND project_id IN (SELECT id FROM projects WHERE status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED'))
        `,
            ).run(unit_price, id);

            // Sync with BOM Templates
            db.prepare(
              "UPDATE bom_template_items SET unit_price = ? WHERE item_id = ?",
            ).run(unit_price, id);

            if (supplier_id) {
              db.prepare(
                `
               INSERT INTO item_price_history (id, item_id, supplier_id, unit_price, recorded_by)
               VALUES (?, ?, ?, ?, ?)
            `,
              ).run(
                "IPH-" + Math.random().toString(36).substr(2, 9),
                id,
                supplier_id,
                unit_price,
                email,
              );
            }
          })();

          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to update price" });
        }
      },
    );

    inventoryRouter.get(
      "/api/inventory/items/:id/price-history",
      requireRole(["PURCHASING", "ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        try {
          const { id } = req.params;
          const history = db
            .prepare(
              `
        SELECT h.unit_price, h.created_at, h.recorded_by, s.name as supplier_name, h.supplier_id
        FROM item_price_history h
        JOIN suppliers s ON h.supplier_id = s.id
        WHERE h.item_id = ?
        ORDER BY h.created_at DESC
      `,
            )
            .all(id) as any[];

          // Calculate lowest price active across all suppliers in chronological order
          const chronHistory = [...history].reverse();
          const latestSupplierPrices: { [key: string]: number } = {};
          const processed = chronHistory.map((record) => {
            latestSupplierPrices[record.supplier_id] = record.unit_price;
            const lowestPrice = Math.min(
              ...Object.values(latestSupplierPrices),
            );
            return {
              ...record,
              actual_unit_price: record.unit_price,
              lowest_price: lowestPrice,
            };
          });

          // Return newest first (desc order)
          res.json(processed.reverse());
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch price history" });
        }
      },
    );

    // Update inventory stock (Manual Adjustment)
    inventoryRouter.post(
      "/api/inventory/adjust",
      requireRole(["WAREHOUSE", "FC", "ENGINEERING", "ADMIN"]),
      (req, res) => {
        try {
          const item_id = req.body.item_id;
          const qty = req.body.qty !== undefined ? Number(req.body.qty) : (req.body.new_qty !== undefined ? Number(req.body.new_qty) : (req.body.new_free_stock !== undefined ? Number(req.body.new_free_stock) : 0));
          const type = req.body.type || (req.body.new_qty !== undefined || req.body.new_free_stock !== undefined ? "SET" : "ADD");
          const item_details = req.body.item_details;

          const transaction = db.transaction(() => {
            db.prepare(`
              INSERT OR IGNORE INTO inventory (item_id, physical_qty, free_stock, allocated_stock, available_qty)
              VALUES (?, 0, 0, 0, 0)
            `).run(item_id);

            const current = db
              .prepare("SELECT COALESCE(free_stock, 0) as free_stock FROM inventory WHERE item_id = ?")
              .get(item_id) as { free_stock: number } | undefined;
            const currentQty = current ? current.free_stock : 0;
            let diff = 0;

            // Update stock
            if (type === "ADD") {
              db.prepare(
                `UPDATE inventory 
                 SET free_stock = free_stock + ?,
                     available_qty = available_qty + ?,
                     physical_qty = physical_qty + ?
                 WHERE item_id = ?`,
              ).run(qty, qty, qty, item_id);
              diff = qty;
            } else {
              const currentPhys = db.prepare("SELECT COALESCE(physical_qty, free_stock + allocated_stock, 0) as p, COALESCE(reserved_qty, allocated_stock, 0) as r FROM inventory WHERE item_id = ?").get(item_id) as any;
              const resQty = currentPhys ? Number(currentPhys.r) : 0;
              const newPhys = Number(qty) + resQty;
              db.prepare(
                `UPDATE inventory 
                 SET free_stock = ?,
                     available_qty = ?,
                     physical_qty = ?
                 WHERE item_id = ?`,
              ).run(qty, qty, newPhys, item_id);
              diff = qty - currentQty;
            }

            if (diff !== 0) {
              const movId = "MOV-" + Math.random().toString(36).substr(2, 9);
              const nowIso = new Date().toISOString();
              db.prepare(
                "INSERT INTO stock_movements (id, item_id, type, qty, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
              ).run(
                movId,
                item_id,
                "ADJUSTMENT",
                diff,
              );
              
              syncCollectionToFirestore("stock_movements", movId, {
                id: movId,
                item_id,
                type: "ADJUSTMENT",
                qty: diff,
                created_at: nowIso
              });
            }

            logAudit(
              req.headers["x-user-email"] as string,
              "INVENTORY_ADJUST",
              "ITEM",
              item_id,
              `Stock adjusted by ${diff} (${type}). New free stock: ${currentQty + diff}`,
            );

            // Update item details if provided
            if (item_details) {
              const { item_code, name, uom, type: itemType } = item_details;
              db.prepare(
                "UPDATE items SET item_code = ?, name = ?, uom = ?, type = ? WHERE id = ?",
              ).run(item_code, name, uom, itemType || "RAW", item_id);
            }
          });

          transaction();
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to adjust inventory" });
        }
      },
    );

    // Check Stock (MRP Logic)
    inventoryRouter.post(
      "/api/mrp/check-stock",
      requireRole(["PRODUCTION", "ENGINEERING", "WAREHOUSE", "PURCHASING"]),
      (req, res) => {
        try {
          const { items, project_id } = req.body; // Array of { item_code, qty, ... }, optional project_id
          const results = [];

          const getItem = db.prepare(`
        SELECT 
          i.id, i.item_code, i.name, i.dimension, i.spec, i.uom, 
          COALESCE(inv.free_stock, 0) as free_stock,
          COALESCE(inv.allocated_stock, 0) as total_allocated
        FROM items i
        LEFT JOIN inventory inv ON i.id = inv.item_id
        WHERE i.item_code = ?
      `);

          const getProjectAlloc = db.prepare(`
        SELECT COALESCE(SUM(qty), 0) as alloc
        FROM stock_movements
        WHERE project_id = ? AND item_id = ? AND type IN ('ALLOCATION', 'GRN_ALLOCATION')
      `);

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

          for (const reqItem of items) {
            const dbItem = getItem.get(reqItem.item_code) as any;
            if (dbItem) {
              const required = Number(reqItem.qty);
              const free = Number(dbItem.free_stock);

              let incoming = 0;
              if (project_id) {
                const res = getProjectIncoming.get(
                  project_id,
                  dbItem.id,
                  project_id,
                  dbItem.id,
                ) as any;
                incoming = Math.max(0, res.incoming);
              }

              // Available = Free + Pending Purchase Requests for this project
              const available = free + incoming;
              const shortage = Math.max(0, required - available);

              results.push({
                ...dbItem,
                allocated_for_this_project: incoming, // Using this existing field to display incoming
                required_qty: required,
                shortage_qty: shortage,
              });
            } else {
              // If item not found, it should have been caught by frontend,
              // but we return a safe default just in case.
              results.push({
                item_code: reqItem.item_code,
                name: reqItem.name || "Unknown Item",
                uom: reqItem.unit || "PCS",
                free_stock: 0,
                required_qty: Number(reqItem.qty),
                shortage_qty: Number(reqItem.qty),
                notFound: true,
              });
            }
          }
          res.json(results);
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to check stock" });
        }
      },
    );

    // Project urgency levels
    // Delete BOM Item
    inventoryRouter.get(
      "/api/inventory/summary",
      requireRole(["PURCHASING", "WAREHOUSE", "PRODUCTION", "ENGINEERING"]),
      (req, res) => {
        try {
          const summary = {
            total_skus: (
              db
                .prepare("SELECT COUNT(*) as count FROM items WHERE 1=1")
                .get() as any
            ).count,
            low_stock: (
              db
                .prepare(
                  "SELECT COUNT(*) as count FROM inventory WHERE free_stock < 5",
                )
                .get() as any
            ).count,
            pending_grns: (
              db
                .prepare(
                  "SELECT COUNT(*) as count FROM grns WHERE inventory_updated_at IS NULL AND qc_status IN ('PASSED', 'CONDITIONAL', 'REJECTED')",
                )
                .get() as any
            ).count,
            recent_movements: db
              .prepare(
                `
          SELECT m.*, i.item_code, i.name as item_name 
          FROM stock_movements m 
          JOIN items i ON m.item_id = i.id 
          ORDER BY m.created_at DESC LIMIT 5
        `,
              )
              .all(),
          };
          res.json(summary);
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch summary" });
        }
      },
    );

    // Get Inventory (Comprehensive items & stock ledger)
    inventoryRouter.get(
      "/api/inventory",
      requireRole(["PRODUCTION", "WAREHOUSE", "ENGINEERING", "PURCHASING", "FC", "ADMIN"]),
      (req, res) => {
        try {
          const items = db
            .prepare(
              `
        SELECT i.*, 
               COALESCE(inv.physical_qty, COALESCE(inv.free_stock, 0) + COALESCE(inv.allocated_stock, 0), 0) as physical_qty,
               COALESCE(inv.reserved_qty, COALESCE(inv.allocated_stock, 0), 0) as reserved_qty,
               COALESCE(inv.available_qty, COALESCE(inv.free_stock, 0), 0) as available_qty,
               COALESCE(inv.free_stock, 0) as free_stock, 
               COALESCE(inv.allocated_stock, 0) as allocated_stock,
               COALESCE(inv.min_stock, 0) as min_stock,
               COALESCE(inv.max_stock, 0) as max_stock
        FROM items i
        LEFT JOIN inventory inv ON i.id = inv.item_id
        WHERE i.deleted_at IS NULL
        ORDER BY i.item_code ASC
      `,
            )
            .all();
          res.json(items);
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch inventory" });
        }
      },
    );

    // Alias for /api/inventory/full
    inventoryRouter.get(
      "/api/inventory/full",
      requireRole(["PRODUCTION", "WAREHOUSE", "ENGINEERING", "PURCHASING", "FC", "ADMIN"]),
      (req, res) => {
        try {
          const items = db
            .prepare(
              `
        SELECT i.*, 
               COALESCE(inv.physical_qty, COALESCE(inv.free_stock, 0) + COALESCE(inv.allocated_stock, 0), 0) as physical_qty,
               COALESCE(inv.reserved_qty, COALESCE(inv.allocated_stock, 0), 0) as reserved_qty,
               COALESCE(inv.available_qty, COALESCE(inv.free_stock, 0), 0) as available_qty,
               COALESCE(inv.free_stock, 0) as free_stock, 
               COALESCE(inv.allocated_stock, 0) as allocated_stock,
               COALESCE(inv.min_stock, 0) as min_stock,
               COALESCE(inv.max_stock, 0) as max_stock,
               (SELECT COUNT(DISTINCT pb.project_id) FROM boms pb WHERE pb.item_id = i.id) as bom_projects_count
        FROM items i
        LEFT JOIN inventory inv ON i.id = inv.item_id
        WHERE i.deleted_at IS NULL
        ORDER BY i.item_code ASC
      `,
            )
            .all();
          res.json(items);
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to fetch inventory" });
        }
      },
    );

    inventoryRouter.post(
      "/api/inventory/adjust-v2",
      requireRole(["WAREHOUSE", "FC", "ENGINEERING", "PRODUCTION", "ADMIN"]),
      (req, res) => {
        const { item_id, new_free_stock, reason, username, item_name, uom } =
          req.body;
        try {
          db.transaction(() => {
            const oldStock = db
              .prepare("SELECT COALESCE(free_stock, 0) as free_stock, COALESCE(allocated_stock, 0) as allocated_stock, COALESCE(reserved_qty, 0) as reserved_qty FROM inventory WHERE item_id = ?")
              .get(item_id) as any;

            const resQty = oldStock ? (Number(oldStock.reserved_qty) || Number(oldStock.allocated_stock) || 0) : 0;
            const newPhys = Number(new_free_stock) + resQty;

            db.prepare(
              `UPDATE inventory 
               SET free_stock = ?,
                   available_qty = ?,
                   physical_qty = ?
               WHERE item_id = ?`,
            ).run(new_free_stock, new_free_stock, newPhys, item_id);

            // Update item metadata if provided
            if (item_name || uom) {
              const updates: string[] = [];
              const params: any[] = [];
              if (item_name) {
                updates.push("name = ?");
                params.push(item_name);
              }
              if (uom) {
                updates.push("uom = ?");
                params.push(uom);
              }
              params.push(item_id);
              db.prepare(`UPDATE items SET ${updates.join(", ")} WHERE id = ?`).run(...params);
            }

            const diff =
              Number(new_free_stock) -
              (oldStock ? Number(oldStock.free_stock) : 0);
            if (diff !== 0) {
              const movId = "MOV-" + Math.random().toString(36).substr(2, 9);
              const nowIso = new Date().toISOString();
              db.prepare(
                "INSERT INTO stock_movements (id, item_id, type, qty, recorded_by, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
              ).run(
                movId,
                item_id,
                "ADJUSTMENT",
                diff,
                username,
                reason,
              );
              
              syncCollectionToFirestore("stock_movements", movId, {
                id: movId,
                item_id,
                type: "ADJUSTMENT",
                qty: diff,
                recorded_by: username,
                reference_id: reason,
                created_at: nowIso
              });

              // MACRO GAP FIX: Post Accounting Journal for Inventory Adjustment
              try {
                const itemInfo = db.prepare("SELECT item_code, unit_price FROM items WHERE id = ?").get(item_id) as any;
                const unitPrice = Number(itemInfo?.unit_price || 0);
                const adjValue = Math.abs(diff) * unitPrice;
                
                if (adjValue > 0) {
                  postJournalEntry(db, {
                    reference_type: "MANUAL_ADJUSTMENT",
                    reference_id: movId,
                    reference_number: `ADJ-${movId.slice(-6)}`,
                    description: `Inventory Adjustment for Item ${itemInfo?.item_code || item_id}`,
                    lines: [
                      {
                        account_code: "1103",
                        account_name: "Inventory - Raw Materials & Goods",
                        debit: diff > 0 ? adjValue : 0,
                        credit: diff < 0 ? adjValue : 0,
                        memo: `Stock ${diff > 0 ? "gain" : "loss"} of ${Math.abs(diff)} units`,
                      },
                      {
                        account_code: "5102",
                        account_name: "Inventory Adjustment (Gain/Loss)",
                        debit: diff < 0 ? adjValue : 0,
                        credit: diff > 0 ? adjValue : 0,
                        memo: `Financial impact of stock ${diff > 0 ? "gain" : "loss"}`,
                      }
                    ],
                    created_by: username || "WAREHOUSE",
                  });
                }
              } catch (accErr) {
                console.error("Accounting Bridge Error on Stock Adjustment:", accErr);
              }
            }

            logAudit(
              username,
              "STOCK_ADJUSTMENT",
              null,
              null,
              `${username} adjusted stock for ${item_id} from ${oldStock?.free_stock} to ${new_free_stock}${item_name ? ` (Name updated to ${item_name})` : ""}${uom ? ` (UOM updated to ${uom})` : ""}. Reason: ${reason}`,
            );
          })();

          res.json({ success: true });
        } catch (err: any) {
          console.error(err);
          res.status(500).json({ error: err.message });
        }
      },
    );

    inventoryRouter.post(
      "/api/inventory/reset",
      requireRole(["FC", "WAREHOUSE"]),
      (req, res) => {
        try {
          db.transaction(() => {
            db.prepare(
              "UPDATE inventory SET free_stock = 0, allocated_stock = 0, physical_qty = 0, reserved_qty = 0, available_qty = 0",
            ).run();
            logAudit(
              (req.headers["x-user-email"] as string) || "System",
              "WAREHOUSE_RESET",
              null,
              null,
              "All inventory stock levels reset to zero.",
            );
          })();
          res.json({ success: true });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      },
    );

    // --- BOM TEMPLATES ---
    inventoryRouter.get("/api/bom-templates", (req, res) => {
      try {
        const templates = db
          .prepare("SELECT * FROM bom_templates ORDER BY created_at DESC")
          .all();
        res.json(templates);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch templates" });
      }
    });

    inventoryRouter.get("/api/bom-templates/:id", (req, res) => {
      try {
        const template = db
          .prepare("SELECT * FROM bom_templates WHERE id = ?")
          .get(req.params.id) as any;
        if (!template)
          return res.status(404).json({ error: "Template not found" });
        const items = db
          .prepare(
            `
        SELECT ti.*, i.item_code, i.name as item_name, i.uom
        FROM bom_template_items ti
        JOIN items i ON ti.item_id = i.id
        WHERE ti.template_id = ?
      `,
          )
          .all(req.params.id);
        res.json({ ...template, items });
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch template details" });
      }
    });

    inventoryRouter.post(
      "/api/projects/:id/save-as-template",
      requireRole(["ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        const { id } = req.params;
        const { name, description } = req.body;
        try {
          const templateId = "BMT-" + Math.random().toString(36).substr(2, 9);
          db.transaction(() => {
            db.prepare(
              "INSERT INTO bom_templates (id, name, description) VALUES (?, ?, ?)",
            ).run(templateId, name, description);

            const boms = db
              .prepare("SELECT * FROM boms WHERE project_id = ?")
              .all(id) as any[];
            const insertItem = db.prepare(`
          INSERT INTO bom_template_items (id, template_id, item_id, dimension, spec, required_qty, unit_price)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

            for (const bom of boms) {
              insertItem.run(
                "BTI-" + Math.random().toString(36).substr(2, 9),
                templateId,
                bom.item_id,
                bom.dimension,
                bom.spec,
                bom.required_qty,
                bom.unit_price,
              );
            }
          })();
          res.json({ success: true, id: templateId });
        } catch (error) {
          res.status(500).json({ error: "Failed to save template" });
        }
      },
    );

    inventoryRouter.post(
      "/api/projects/:id/clone-bom",
      requireRole(["ENGINEERING", "PRODUCTION"]),
      (req, res) => {
        const { id } = req.params;
        const { reference_project_id } = req.body;
        try {
          db.transaction(() => {
            const items = db
              .prepare("SELECT * FROM boms WHERE project_id = ?")
              .all(reference_project_id) as any[];
            const insertBom = db.prepare(`
          INSERT INTO boms (id, project_id, item_id, dimension, spec, required_qty, unit_price)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

            for (const item of items) {
              insertBom.run(
                "BOM-" + Math.random().toString(36).substr(2, 9),
                id,
                item.item_id,
                item.dimension,
                item.spec,
                item.required_qty,
                item.unit_price,
              );
            }
            db.prepare(
              "UPDATE projects SET bq_updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(id);
          })();
          res.json({ success: true });
        } catch (error) {
          res.status(500).json({ error: "Failed to clone BOM" });
        }
      },
    );
