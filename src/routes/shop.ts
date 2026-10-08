import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import crypto from "crypto";
import { isCorporateBusinessEmail } from "../lib/scoutIntelligence.ts";

export const shopRouter = Router();

// Helper to generate unique order number e.g. SO-2609-AB482
const generateOrderNumber = () => {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let rand = "";
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const now = new Date();
  const yr = String(now.getFullYear()).slice(-2);
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  return `SO-${yr}${mo}-${rand}`;
};

// ==========================================
// 1. PUBLIC E-COMMERCE ENDPOINTS (NO AUTH)
// ==========================================

/**
 * GET /api/shop/products
 * Public catalog of published finished goods with active inventory
 */
shopRouter.get("/api/shop/products", (req, res) => {
  try {
    const category = (req.query.category as string || "").trim();
    const q = (req.query.q as string || "").trim();
    const sort = (req.query.sort as string || "popular").trim();
    const featuredOnly = req.query.featured === "true" || req.query.featured === "1";

    let sql = `
      SELECT 
        i.id,
        i.item_code,
        i.name,
        i.dimension,
        i.spec,
        i.category,
        i.description,
        i.uom,
        COALESCE(i.unit_price, 0) as unit_price,
        COALESCE(CASE WHEN i.shop_availability_type = 'MAKE_TO_ORDER' OR i.unit_price <= 0 THEN 0 ELSE i.shop_promo_price END, 0) as promo_price,
        COALESCE(i.shop_weight_kg, 2.5) as weight_kg,
        COALESCE(i.shop_image_url, 'https://images.unsplash.com/photo-1584463623578-3062b88137f4?w=800&auto=format&fit=crop&q=80') as image_url,
        COALESCE(i.shop_gallery_urls, '[]') as shop_gallery_urls,
        COALESCE(i.shop_badge, '') as badge,
        COALESCE(i.shop_featured, 0) as is_featured,
        COALESCE(CASE WHEN i.shop_availability_type = 'MAKE_TO_ORDER' OR i.unit_price <= 0 THEN 'MAKE_TO_ORDER' ELSE i.shop_availability_type END, 'AUTO') as availability_type,
        COALESCE(i.shop_lead_time_days, 3) as lead_time_days,
        COALESCE(i.shop_moq, 1) as moq,
        COALESCE(i.shop_specs, '') as technical_specs,
        COALESCE(inv.available_qty, 0) as available_qty,
        COALESCE(inv.physical_qty, 0) as physical_qty
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id
      WHERE i.deleted_at IS NULL
        AND (i.type = 'FINISHED' OR i.type = 'FINISH_GOOD')
        AND COALESCE(i.is_published_shop, 1) = 1
    `;

    const params: any[] = [];

    if (category && category !== "ALL" && category !== "Semua") {
      sql += ` AND i.category = ?`;
      params.push(category);
    }

    if (q) {
      sql += ` AND (i.name LIKE ? OR i.item_code LIKE ? OR i.description LIKE ? OR i.spec LIKE ?)`;
      const wildcard = `%${q}%`;
      params.push(wildcard, wildcard, wildcard, wildcard);
    }

    if (featuredOnly) {
      sql += ` AND i.shop_featured = 1`;
    }

    if (sort === "price_asc") {
      sql += ` ORDER BY CASE WHEN i.shop_promo_price > 0 THEN i.shop_promo_price ELSE i.unit_price END ASC`;
    } else if (sort === "price_desc") {
      sql += ` ORDER BY CASE WHEN i.shop_promo_price > 0 THEN i.shop_promo_price ELSE i.unit_price END DESC`;
    } else if (sort === "name_asc") {
      sql += ` ORDER BY i.name ASC`;
    } else {
      sql += ` ORDER BY i.shop_featured DESC, i.name ASC`;
    }

    const rawItems = db.prepare(sql).all(...params) as any[];
    const items = rawItems.map((item) => {
      let gallery: string[] = [];
      try {
        gallery = JSON.parse(item.shop_gallery_urls || "[]");
      } catch (e) {
        gallery = [];
      }
      if (!Array.isArray(gallery)) gallery = [];
      // Ensure primary image is always included in gallery
      if (item.image_url && !gallery.includes(item.image_url)) {
        gallery = [item.image_url, ...gallery];
      }
      return {
        ...item,
        gallery_urls: gallery,
      };
    });

    // Get list of distinct active categories for the filter bar
    const categoriesRows = db.prepare(`
      SELECT DISTINCT category 
      FROM items 
      WHERE (type = 'FINISHED' OR type = 'FINISH_GOOD')
        AND deleted_at IS NULL 
        AND category IS NOT NULL 
        AND category != ''
        AND COALESCE(is_published_shop, 1) = 1
      ORDER BY category ASC
    `).all() as any[];

    const categories = categoriesRows.map(c => c.category);

    res.json({
      success: true,
      data: items,
      categories,
    });
  } catch (err: any) {
    console.error("[Shop API] Error fetching products:", err);
    res.status(500).json({ success: false, error: "Failed to fetch shop products" });
  }
});

/**
 * GET /api/shop/products/:id
 * Single product detail
 */
shopRouter.get("/api/shop/products/:id", (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare(`
      SELECT 
        i.id,
        i.item_code,
        i.name,
        i.dimension,
        i.spec,
        i.category,
        i.description,
        i.uom,
        COALESCE(i.unit_price, 0) as unit_price,
        COALESCE(CASE WHEN i.shop_availability_type = 'MAKE_TO_ORDER' OR i.unit_price <= 0 THEN 0 ELSE i.shop_promo_price END, 0) as promo_price,
        COALESCE(i.shop_weight_kg, 2.5) as weight_kg,
        COALESCE(i.shop_image_url, 'https://images.unsplash.com/photo-1584463623578-3062b88137f4?w=800&auto=format&fit=crop&q=80') as image_url,
        COALESCE(i.shop_gallery_urls, '[]') as shop_gallery_urls,
        COALESCE(i.shop_badge, '') as badge,
        COALESCE(i.shop_featured, 0) as is_featured,
        COALESCE(CASE WHEN i.shop_availability_type = 'MAKE_TO_ORDER' OR i.unit_price <= 0 THEN 'MAKE_TO_ORDER' ELSE i.shop_availability_type END, 'AUTO') as availability_type,
        COALESCE(i.shop_lead_time_days, 3) as lead_time_days,
        COALESCE(i.shop_moq, 1) as moq,
        COALESCE(i.shop_specs, '') as technical_specs,
        COALESCE(inv.available_qty, 0) as available_qty,
        COALESCE(inv.physical_qty, 0) as physical_qty
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id
      WHERE i.id = ? AND i.deleted_at IS NULL
    `).get(id) as any;

    if (!item) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    let gallery: string[] = [];
    try {
      gallery = JSON.parse(item.shop_gallery_urls || "[]");
    } catch (e) {
      gallery = [];
    }
    if (!Array.isArray(gallery)) gallery = [];
    if (item.image_url && !gallery.includes(item.image_url)) {
      gallery = [item.image_url, ...gallery];
    }

    res.json({
      success: true,
      data: {
        ...item,
        gallery_urls: gallery,
      },
    });
  } catch (err: any) {
    console.error("[Shop API] Error fetching product detail:", err);
    res.status(500).json({ success: false, error: "Failed to fetch product detail" });
  }
});

/**
 * POST /api/shop/checkout
 * Public checkout endpoint
 */
shopRouter.post("/api/shop/checkout", (req, res) => {
  try {
    const {
      customer_name,
      customer_phone,
      customer_email,
      delivery_address,
      delivery_city,
      delivery_method, // 'PICKUP' | 'DELIVERY'
      payment_method, // 'TRANSFER_MANUAL' | 'QRIS' | 'COD'
      customer_notes,
      items, // Array of { item_id, qty }
      delivery_distance = 0,
      is_dp = 0,
      dp_amount = 0,
      payment_proof_url = null,
    } = req.body;

    if (!customer_name || !customer_phone || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Customer name, phone number, and at least one item are required.",
      });
    }

    const orderId = `SO-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const orderNumber = generateOrderNumber();

    // Calculate items, prices, and total
    let subtotal = 0;
    let totalWeight = 0;
    const resolvedItems: any[] = [];

    for (const line of items) {
      const itemRow = db.prepare(`
        SELECT id, item_code, name, uom, unit_price, shop_promo_price, shop_weight_kg
        FROM items
        WHERE id = ? AND deleted_at IS NULL
      `).get(line.item_id) as any;

      if (!itemRow) {
        return res.status(400).json({
          success: false,
          error: `Item with ID ${line.item_id} was not found.`,
        });
      }

      const effectivePrice = itemRow.shop_promo_price > 0 ? itemRow.shop_promo_price : itemRow.unit_price;
      const qty = Number(line.qty) || 1;
      const lineTotal = effectivePrice * qty;
      const weight = (itemRow.shop_weight_kg || 2.5) * qty;

      subtotal += lineTotal;
      totalWeight += weight;

      resolvedItems.push({
        id: `SOI-${orderId}-${resolvedItems.length + 1}`,
        order_id: orderId,
        item_id: itemRow.id,
        item_code: itemRow.item_code,
        item_name: itemRow.name,
        uom: itemRow.uom,
        qty: qty,
        unit_price: effectivePrice,
        total_price: lineTotal,
        weight_kg: weight,
      });
    }

    // Determine shipping cost based on actual distance (10.000 IDR per km)
    let shippingCost = 0;
    if (delivery_method === "DELIVERY") {
      const dist = Number(delivery_distance) || 0;
      shippingCost = dist * 10000; // Rp 10.000,- per km
    } else {
      shippingCost = 0; // Pickup is always free
    }

    const grandTotal = subtotal + shippingCost;
    
    // Set status to PAID/DP_PAID since proof of payment is compulsory upon checkout
    const initialPaymentStatus = payment_method === "COD" 
      ? "UNPAID" 
      : is_dp === 1 || Number(is_dp) === 1
      ? "DP_PAID" 
      : "PAID";
      
    // Set directly to PROCESSING since pending payment status is skipped (compulsory payment)
    const initialOrderStatus = "PROCESSING";

    // Insert order in a transaction
    db.transaction(() => {
      db.prepare(`
        INSERT INTO shop_orders (
          id, order_number, customer_name, customer_phone, customer_email,
          delivery_address, delivery_city, delivery_method, shipping_cost,
          subtotal_amount, total_amount, payment_method, payment_status,
          order_status, customer_notes, payment_proof_url, is_dp, dp_amount, delivery_distance, created_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
        )
      `).run(
        orderId,
        orderNumber,
        customer_name.trim(),
        customer_phone.trim(),
        customer_email ? customer_email.trim() : null,
        delivery_address.trim(),
        delivery_city ? delivery_city.trim() : "Banyuwangi",
        delivery_method || "DELIVERY",
        shippingCost,
        subtotal,
        grandTotal,
        payment_method || "TRANSFER_MANUAL",
        initialPaymentStatus,
        initialOrderStatus,
        customer_notes ? customer_notes.trim() : null,
        payment_proof_url || null,
        Number(is_dp) || 0,
        Number(dp_amount) || 0,
        Number(delivery_distance) || 0
      );

      const itemInsert = db.prepare(`
        INSERT INTO shop_order_items (
          id, order_id, item_id, item_code, item_name, uom, qty, unit_price, total_price, weight_kg
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);

      for (const item of resolvedItems) {
        itemInsert.run(
          item.id,
          item.order_id,
          item.item_id,
          item.item_code,
          item.item_name,
          item.uom,
          item.qty,
          item.unit_price,
          item.total_price,
          item.weight_kg
        );

        // Update inventory reservation / available stock
        db.prepare(`
          UPDATE inventory
          SET reserved_qty = COALESCE(reserved_qty, 0) + ?,
              available_qty = MAX(0, COALESCE(available_qty, 0) - ?)
          WHERE item_id = ?
        `).run(item.qty, item.qty, item.item_id);
      }

      // Mark potential customer as CONVERTED if matched by email or phone
      try {
        const cleanEmail = customer_email ? customer_email.trim().toLowerCase() : "";
        const cleanPhone = customer_phone ? customer_phone.trim() : "";
        if (cleanEmail || cleanPhone) {
          db.prepare(`
            UPDATE potential_customers
            SET status = 'CONVERTED',
                converted_order_id = ?,
                last_active_at = ?
            WHERE (email = ? AND email IS NOT NULL AND email != '')
               OR (phone = ? AND phone IS NOT NULL AND phone != '')
          `).run(orderNumber, new Date().toISOString(), cleanEmail, cleanPhone);
        }
      } catch (convErr) {
        console.warn("[Shop API] Potential customer conversion sync note:", convErr);
      }
    })();

    // Payment Instructions details
    const paymentInstructions = {
      bank_transfer: {
        bank_name: "BCA (Bank Central Asia)",
        account_number: "8920-1111-3993",
        account_holder: "CV. Batu Emas Group (Paving Joss)",
      },
      qris: {
        merchant_name: "PAVING JOSS - CV BATU EMAS",
        nmid: "ID1020039201928",
      },
      pickup_location: "Pabrik Utama Paving Joss: Dusun Petahunan, Gambiran, Kab. Banyuwangi, Jawa Timur 68486",
      whatsapp_support: "+6281111113993",
    };

    res.json({
      success: true,
      data: {
        order_id: orderId,
        order_number: orderNumber,
        subtotal,
        shipping_cost: shippingCost,
        total_amount: grandTotal,
        total_weight_kg: totalWeight,
        payment_method,
        payment_status: initialPaymentStatus,
        order_status: initialOrderStatus,
        items: resolvedItems,
        payment_instructions: paymentInstructions,
      },
    });
  } catch (err: any) {
    console.error("[Shop API] Checkout error:", err);
    res.status(500).json({ success: false, error: "Checkout failed: " + err.message });
  }
});

/**
 * POST /api/track/activity
 * Records user activity across Public, Shop, and Careers for Scout AI intelligence
 */
shopRouter.post("/api/track/activity", (req, res) => {
  try {
    const {
      session_id,
      customer_id,
      module,
      activity_type,
      title,
      details,
      page_url,
      user_agent,
    } = req.body;

    if (!session_id || !module || !activity_type || !title) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const activityId = `ACT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();

    // If customer_id not explicitly passed, try inferring from session_id
    let resolvedCustomerId = customer_id || null;
    if (!resolvedCustomerId) {
      const matched = db.prepare("SELECT id FROM potential_customers WHERE visitor_session_id = ?").get(session_id) as any;
      if (matched) {
        resolvedCustomerId = matched.id;
      }
    }

    db.prepare(`
      INSERT INTO visitor_activities (
        id, session_id, customer_id, module, activity_type, title, details, page_url, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      activityId,
      session_id,
      resolvedCustomerId,
      module,
      activity_type,
      title,
      typeof details === "string" ? details : details ? JSON.stringify(details) : null,
      page_url || null,
      user_agent || null,
      now
    );

    // If customer is known, update their last active and activity count
    if (resolvedCustomerId) {
      db.prepare(`
        UPDATE potential_customers
        SET last_active_at = ?,
            activity_count = COALESCE(activity_count, 0) + 1
        WHERE id = ?
      `).run(now, resolvedCustomerId);
    }

    res.json({ success: true, activity_id: activityId });
  } catch (err: any) {
    console.error("[Shop API] Activity tracking error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to record activity" });
  }
});

/**
 * POST /api/shop/customer-auth
 * Collects and stores customer intent when signing in from Add to Cart trigger
 * Adheres strictly to UU PDP (UU No. 27/2022) with multi-dimensional consent
 */
shopRouter.post("/api/shop/customer-auth", (req, res) => {
  try {
    const {
      customer_name,
      email,
      phone,
      company,
      auth_provider = "FORM",
      avatar_url,
      cart_items = [],
      session_id,
      consents = {},
    } = req.body;

    if (!customer_name || !customer_name.trim()) {
      return res.status(400).json({ success: false, error: "Nama lengkap wajib diisi." });
    }

    const cleanEmail = email && typeof email === "string" ? email.trim().toLowerCase() : null;
    const cleanPhone = phone && typeof phone === "string" ? phone.trim() : null;
    const cleanCompany = company && typeof company === "string" ? company.trim() : null;
    const cleanSessionId = session_id && typeof session_id === "string" ? session_id.trim() : null;

    // Consent flags
    const marketingConsent = consents.marketing !== false ? 1 : 0;
    const profilingConsent = consents.profiling !== false ? 1 : 0;
    const policyVersion = "v1.0";
    const now = new Date().toISOString();

    // Check existing customer by email or phone
    let existing: any = null;
    if (cleanEmail) {
      existing = db.prepare("SELECT * FROM potential_customers WHERE email = ?").get(cleanEmail);
    }
    if (!existing && cleanPhone) {
      existing = db.prepare("SELECT * FROM potential_customers WHERE phone = ?").get(cleanPhone);
    }
    if (!existing && cleanSessionId) {
      existing = db.prepare("SELECT * FROM potential_customers WHERE visitor_session_id = ?").get(cleanSessionId);
    }

    // Process cart snapshot
    const items = Array.isArray(cart_items) ? cart_items : [];
    let cartTotalValue = 0;
    let cartTotalItems = 0;
    const snapshotItems = items.map((i: any) => {
      const qty = Number(i.qty) || 1;
      const price = Number(i.product?.promo_price > 0 ? i.product.promo_price : i.product?.unit_price) || 0;
      cartTotalValue += price * qty;
      cartTotalItems += qty;
      return {
        item_id: i.product?.id || i.item_id || "",
        item_code: i.product?.item_code || i.item_code || "",
        name: i.product?.name || i.name || "Item",
        qty: qty,
        uom: i.product?.uom || i.uom || "Unit",
        price: price,
        total: price * qty,
        image_url: i.product?.image_url || i.image_url || null,
      };
    });

    let customerId: string;

    if (existing) {
      customerId = existing.id;
      db.prepare(`
        UPDATE potential_customers
        SET customer_name = COALESCE(?, customer_name),
            email = COALESCE(?, email),
            phone = COALESCE(?, phone),
            company = COALESCE(?, company),
            avatar_url = COALESCE(?, avatar_url),
            cart_snapshot = ?,
            cart_total_value = ?,
            cart_total_items = ?,
            visitor_session_id = COALESCE(?, visitor_session_id),
            profiling_consent = ?,
            marketing_consent = ?,
            customer_segment = 'CART_ACTIVE',
            last_active_at = ?
        WHERE id = ?
      `).run(
        customer_name.trim(),
        cleanEmail,
        cleanPhone,
        cleanCompany,
        avatar_url || null,
        JSON.stringify(snapshotItems),
        cartTotalValue,
        cartTotalItems,
        cleanSessionId,
        profilingConsent,
        marketingConsent,
        now,
        customerId
      );
    } else {
      customerId = `POT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      // Calculate initial baseline heuristic score with corporate domain priority
      let initialScore = 45;
      let initialPersona = "Retail Homeowner";
      let initialBuyingPower = "Skala Retail";
      
      const { isCorporate: hasCorporateEmail, domain } = isCorporateBusinessEmail(cleanEmail);

      if (hasCorporateEmail) {
        initialScore = 88; // Priority Grade A corporate lead
        initialPersona = cleanCompany ? "Enterprise Corporate" : "B2B Verified Partner";
        initialBuyingPower = cleanCompany ? "Skala Korporat / Kontraktor Utama" : `Skala Menengah - Besar (@${domain})`;
      } else if (cleanCompany) {
        initialScore = 75;
        initialPersona = "Kontraktor Sipil / Instansi";
        initialBuyingPower = "Skala Menengah / Proyek";
      } else if (cartTotalValue > 15000000) {
        initialScore = 68;
        initialPersona = "Developer Properti";
        initialBuyingPower = "Skala Menengah";
      }

      const initialGrade = initialScore >= 80 ? "A" : initialScore >= 60 ? "B" : initialScore >= 40 ? "C" : "D";

      db.prepare(`
        INSERT INTO potential_customers (
          id, customer_name, email, phone, company, auth_provider, avatar_url,
          cart_snapshot, cart_total_value, cart_total_items, status, potential_score,
          lead_grade, customer_segment, lifecycle_stage, scout_status,
          profiling_consent, marketing_consent, terms_accepted_at, privacy_policy_version,
          persona_tag, buying_power_est, visitor_session_id, created_at, last_active_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW_INTENT', ?, ?, 'CART_ACTIVE', 'LEAD', 'NOT_SCOUTED', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        customerId,
        customer_name.trim(),
        cleanEmail,
        cleanPhone,
        cleanCompany,
        auth_provider,
        avatar_url || null,
        JSON.stringify(snapshotItems),
        cartTotalValue,
        cartTotalItems,
        initialScore,
        initialGrade,
        profilingConsent,
        marketingConsent,
        now,
        policyVersion,
        initialPersona,
        initialBuyingPower,
        cleanSessionId,
        now,
        now
      );
    }

    // Record immutable customer consents
    try {
      db.prepare(`
        INSERT INTO customer_consents (id, customer_id, consent_type, granted, policy_version, granted_at)
        VALUES (?, ?, 'TERMS', 1, ?, ?)
      `).run(`CST-${Date.now()}-1`, customerId, policyVersion, now);

      db.prepare(`
        INSERT INTO customer_consents (id, customer_id, consent_type, granted, policy_version, granted_at)
        VALUES (?, ?, 'MARKETING', ?, ?, ?)
      `).run(`CST-${Date.now()}-2`, customerId, marketingConsent, policyVersion, now);

      db.prepare(`
        INSERT INTO customer_consents (id, customer_id, consent_type, granted, policy_version, granted_at)
        VALUES (?, ?, 'PROFILING', ?, ?, ?)
      `).run(`CST-${Date.now()}-3`, customerId, profilingConsent, policyVersion, now);
    } catch (e) {
      console.warn("[Shop API] Consent record insert note:", e);
    }

    // Retrospectively link all past visitor_activities with this session_id to this customer
    if (cleanSessionId) {
      db.prepare(`
        UPDATE visitor_activities
        SET customer_id = ?
        WHERE session_id = ? AND (customer_id IS NULL OR customer_id = '')
      `).run(customerId, cleanSessionId);
    }

    // Count and update total activity count
    const actCountRow = db.prepare(`
      SELECT COUNT(*) as cnt FROM visitor_activities
      WHERE customer_id = ? OR (session_id = ? AND session_id IS NOT NULL)
    `).get(customerId, cleanSessionId) as any;
    const totalActivities = actCountRow ? actCountRow.cnt : 0;

    db.prepare(`
      UPDATE potential_customers
      SET activity_count = ?
      WHERE id = ?
    `).run(totalActivities, customerId);

    const saved = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(customerId) as any;
    let parsedCart = [];
    try {
      if (saved.cart_snapshot) {
        parsedCart = JSON.parse(saved.cart_snapshot);
      }
    } catch (e) {}

    res.json({
      success: true,
      data: {
        id: saved.id,
        customer_name: saved.customer_name,
        email: saved.email,
        phone: saved.phone,
        company: saved.company,
        auth_provider: saved.auth_provider,
        avatar_url: saved.avatar_url,
        activity_count: saved.activity_count || 0,
        customer_segment: saved.customer_segment || "CART_ACTIVE",
        profiling_consent: saved.profiling_consent === 1,
        marketing_consent: saved.marketing_consent === 1,
        cart_snapshot: parsedCart,
      },
    });
  } catch (err: any) {
    console.error("[Shop API] Error in customer-auth:", err);
    res.status(500).json({ success: false, error: err.message || "Gagal autentikasi customer" });
  }
});

/**
 * POST /api/auth/consent
 * Allows updating consent preferences (UU PDP compliance)
 * Automatically anonymizes/purges enrichment data if profiling is withdrawn
 */
shopRouter.post("/api/auth/consent", (req, res) => {
  try {
    const { customer_id, marketing, profiling } = req.body;
    if (!customer_id) {
      return res.status(400).json({ success: false, error: "customer_id required" });
    }

    const row = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(customer_id) as any;
    if (!row) {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }

    const now = new Date().toISOString();
    const newMarketing = marketing !== undefined ? (marketing ? 1 : 0) : row.marketing_consent;
    const newProfiling = profiling !== undefined ? (profiling ? 1 : 0) : row.profiling_consent;

    // If profiling consent is WITHDRAWN, execute UU PDP anonymization protocol
    if (row.profiling_consent === 1 && newProfiling === 0) {
      db.prepare(`
        UPDATE potential_customers
        SET profiling_consent = 0,
            marketing_consent = ?,
            consent_withdrawn_at = ?,
            scout_summary = 'Data dianonimkan atas penarikan persetujuan profiling (UU PDP No. 27/2022)',
            scout_sources = '[]',
            sources_json = '[]',
            key_talking_points = '[]',
            scout_confidence = 'LOW'
        WHERE id = ?
      `).run(newMarketing, now, customer_id);

      db.prepare(`
        INSERT INTO customer_consents (id, customer_id, consent_type, granted, policy_version, withdrawn_at)
        VALUES (?, ?, 'PROFILING', 0, 'v1.0', ?)
      `).run(`CST-${Date.now()}-WITHDRAW`, customer_id, now);
    } else {
      db.prepare(`
        UPDATE potential_customers
        SET profiling_consent = ?,
            marketing_consent = ?
        WHERE id = ?
      `).run(newProfiling, newMarketing, customer_id);

      db.prepare(`
        INSERT INTO customer_consents (id, customer_id, consent_type, granted, policy_version, granted_at)
        VALUES (?, ?, 'PROFILING', ?, 'v1.0', ?)
      `).run(`CST-${Date.now()}-UPDATE`, customer_id, newProfiling, now);
    }

    res.json({
      success: true,
      message: "Preferensi persetujuan privasi berhasil diperbarui.",
      consent_state: {
        marketing: Boolean(newMarketing),
        profiling: Boolean(newProfiling),
      },
    });
  } catch (err: any) {
    console.error("[Shop API] Error updating consent:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/auth/erasure-request
 * UU PDP Right to Erasure (Hak Penghapusan Data Pribadi - UU No. 27/2022)
 */
shopRouter.post("/api/auth/erasure-request", (req, res) => {
  try {
    const { customer_id, reason = "Permohonan mandiri penghapusan data" } = req.body;
    if (!customer_id) {
      return res.status(400).json({ success: false, error: "customer_id required" });
    }

    const row = db.prepare("SELECT id, customer_name, visitor_session_id FROM potential_customers WHERE id = ?").get(customer_id) as any;
    if (!row) {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }

    const now = new Date().toISOString();
    const requestId = `ERA-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Record erasure request
    db.prepare(`
      INSERT INTO erasure_requests (id, customer_id, reason, requested_at, status, completed_at, propagated_tables)
      VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?)
    `).run(requestId, customer_id, reason, now, now, JSON.stringify(["potential_customers", "visitor_activities", "customer_consents", "outreach_activities"]));

    // Anonymize & clean tables
    db.prepare(`
      DELETE FROM visitor_activities
      WHERE customer_id = ? OR (session_id = ? AND session_id IS NOT NULL AND session_id != '')
    `).run(customer_id, row.visitor_session_id || "");

    db.prepare(`
      DELETE FROM outreach_activities
      WHERE customer_id = ?
    `).run(customer_id);

    db.prepare(`
      DELETE FROM potential_customers
      WHERE id = ?
    `).run(customer_id);

    res.json({
      success: true,
      request_id: requestId,
      status: "COMPLETED",
      message: "Data pribadi dan seluruh jejak penelusuran berhasil dihapus permanen sesuai hak UU PDP.",
    });
  } catch (err: any) {
    console.error("[Shop API] Erasure request error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/shop/customer-cart-sync
 * Keeps customer cart snapshot synchronized in real-time
 */
shopRouter.post("/api/shop/customer-cart-sync", (req, res) => {
  try {
    const { customer_id, cart_items = [] } = req.body;
    if (!customer_id) {
      return res.status(400).json({ success: false, error: "customer_id required" });
    }

    const items = Array.isArray(cart_items) ? cart_items : [];
    let cartTotalValue = 0;
    let cartTotalItems = 0;
    const snapshotItems = items.map((i: any) => {
      const qty = Number(i.qty) || 1;
      const price = Number(i.product?.promo_price > 0 ? i.product.promo_price : i.product?.unit_price) || 0;
      cartTotalValue += price * qty;
      cartTotalItems += qty;
      return {
        item_id: i.product?.id || i.item_id || "",
        item_code: i.product?.item_code || i.item_code || "",
        name: i.product?.name || i.name || "Item",
        qty: qty,
        uom: i.product?.uom || i.uom || "Unit",
        price: price,
        total: price * qty,
        image_url: i.product?.image_url || i.image_url || null,
      };
    });

    db.prepare(`
      UPDATE potential_customers
      SET cart_snapshot = ?,
          cart_total_value = ?,
          cart_total_items = ?,
          last_active_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(snapshotItems),
      cartTotalValue,
      cartTotalItems,
      new Date().toISOString(),
      customer_id
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error("[Shop API] Error syncing cart snapshot:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/shop/orders/:orderNumber
 * Public tracking lookup
 */
shopRouter.get("/api/shop/orders/:orderNumber", (req, res) => {
  try {
    const { orderNumber } = req.params;
    const order = db.prepare(`
      SELECT * FROM shop_orders WHERE order_number = ? OR id = ?
    `).get(orderNumber, orderNumber) as any;

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    const items = db.prepare(`
      SELECT * FROM shop_order_items WHERE order_id = ?
    `).all(order.id);

    res.json({
      success: true,
      data: {
        ...order,
        items,
      },
    });
  } catch (err: any) {
    console.error("[Shop API] Tracking error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch order details" });
  }
});

/**
 * POST /api/shop/orders/:orderNumber/confirm-payment
 * Public payment proof submission
 */
shopRouter.post("/api/shop/orders/:orderNumber/confirm-payment", (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { payment_ref, payment_proof_url, sender_name } = req.body;

    const order = db.prepare(`
      SELECT id, order_status, payment_status FROM shop_orders WHERE order_number = ? OR id = ?
    `).get(orderNumber, orderNumber) as any;

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    db.prepare(`
      UPDATE shop_orders
      SET payment_ref = COALESCE(?, payment_ref),
          payment_proof_url = COALESCE(?, payment_proof_url),
          payment_status = 'PAID',
          order_status = 'PROCESSING',
          paid_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payment_ref || (sender_name ? `Trf by ${sender_name}` : "Payment confirmed by customer"),
      payment_proof_url || null,
      order.id
    );

    res.json({
      success: true,
      message: "Payment confirmation submitted successfully. Our team will verify and dispatch.",
    });
  } catch (err: any) {
    console.error("[Shop API] Payment confirm error:", err);
    res.status(500).json({ success: false, error: "Failed to confirm payment" });
  }
});

// ====================================================
// 2. ERP MANAGEMENT ENDPOINTS (SALES & BUSINESS ROLES)
// ====================================================

/**
 * GET /api/erp/shop-management/orders
 * List orders for ERP back-office
 */
shopRouter.get(
  "/api/erp/shop-management/orders",
  requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
  (req, res) => {
    try {
      const status = (req.query.status as string || "ALL").trim();
      const q = (req.query.q as string || "").trim();

      let sql = `
        SELECT 
          o.*,
          (SELECT COUNT(*) FROM shop_order_items WHERE order_id = o.id) as item_count
        FROM shop_orders o
        WHERE 1=1
      `;
      const params: any[] = [];

      if (status && status !== "ALL") {
        sql += ` AND o.order_status = ?`;
        params.push(status);
      }

      if (q) {
        sql += ` AND (o.order_number LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.delivery_city LIKE ?)`;
        const wildcard = `%${q}%`;
        params.push(wildcard, wildcard, wildcard, wildcard);
      }

      sql += ` ORDER BY o.created_at DESC`;

      const orders = db.prepare(sql).all(...params) as any[];

      // Populate line items
      const itemStmt = db.prepare(`SELECT * FROM shop_order_items WHERE order_id = ?`);
      const enrichedOrders = orders.map((ord) => ({
        ...ord,
        items: itemStmt.all(ord.id),
      }));

      res.json({
        success: true,
        data: enrichedOrders,
      });
    } catch (err: any) {
      console.error("[ERP Shop API] Orders list error:", err);
      res.status(500).json({ success: false, error: "Failed to fetch orders" });
    }
  }
);

/**
 * GET /api/erp/shop-management/stats
 * Real-time KPI summaries for B2C shop
 */
shopRouter.get(
  "/api/erp/shop-management/stats",
  requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
  (req, res) => {
    try {
      const totals = db.prepare(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN order_status = 'PENDING_PAYMENT' THEN 1 ELSE 0 END) as pending_payment_count,
          SUM(CASE WHEN order_status = 'PROCESSING' OR payment_status = 'PAID' AND order_status != 'DISPATCHED' AND order_status != 'COMPLETED' THEN 1 ELSE 0 END) as ready_to_dispatch_count,
          SUM(CASE WHEN order_status = 'DISPATCHED' THEN 1 ELSE 0 END) as dispatched_count,
          SUM(CASE WHEN order_status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN payment_status = 'PAID' OR order_status IN ('PROCESSING', 'DISPATCHED', 'COMPLETED') THEN total_amount ELSE 0 END) as total_revenue,
          AVG(CASE WHEN payment_status = 'PAID' OR order_status IN ('PROCESSING', 'DISPATCHED', 'COMPLETED') THEN total_amount ELSE NULL END) as avg_order_value
        FROM shop_orders
      `).get() as any;

      const catalogStats = db.prepare(`
        SELECT 
          COUNT(i.id) as total_skus,
          SUM(CASE WHEN i.is_published_shop = 1 THEN 1 ELSE 0 END) as published_skus,
          SUM(CASE WHEN i.is_published_shop = 1 AND COALESCE(inv.physical_qty, 0) > 0 THEN 1 ELSE 0 END) as ready_stock_skus,
          SUM(CASE WHEN i.is_published_shop = 1 AND (COALESCE(inv.physical_qty, 0) <= 0 OR i.shop_availability_type = 'MAKE_TO_ORDER') THEN 1 ELSE 0 END) as mto_skus
        FROM items i
        LEFT JOIN inventory inv ON i.id = inv.item_id
        WHERE i.deleted_at IS NULL AND i.type = 'FINISHED'
      `).get() as any;

      res.json({
        success: true,
        data: {
          total_skus: catalogStats?.total_skus || 0,
          published_skus: catalogStats?.published_skus || 0,
          ready_stock_skus: catalogStats?.ready_stock_skus || 0,
          mto_skus: catalogStats?.mto_skus || 0,
          total_orders: totals?.total_orders || 0,
          pending_payment: totals?.pending_payment_count || 0,
          ready_to_dispatch: totals?.ready_to_dispatch_count || 0,
          dispatched: totals?.dispatched_count || 0,
          completed: totals?.completed_count || 0,
          total_revenue: totals?.total_revenue || 0,
          avg_order_value: totals?.avg_order_value || 0,
        },
      });
    } catch (err: any) {
      console.error("[ERP Shop API] Stats error:", err);
      res.status(500).json({ success: false, error: "Failed to fetch shop stats" });
    }
  }
);

/**
 * PUT /api/erp/shop-management/orders/:id/status
 * Update order or payment status
 */
shopRouter.put(
  "/api/erp/shop-management/orders/:id/status",
  requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
  (req, res) => {
    try {
      const { id } = req.params;
      const { order_status, payment_status, tracking_number, fleet_notes } = req.body;

      const order = db.prepare("SELECT * FROM shop_orders WHERE id = ?").get(id) as any;
      if (!order) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }

      db.prepare(`
        UPDATE shop_orders
        SET order_status = COALESCE(?, order_status),
            payment_status = COALESCE(?, payment_status),
            tracking_number = COALESCE(?, tracking_number),
            fleet_notes = COALESCE(?, fleet_notes),
            dispatched_at = CASE WHEN ? = 'DISPATCHED' AND dispatched_at IS NULL THEN CURRENT_TIMESTAMP ELSE dispatched_at END,
            paid_at = CASE WHEN ? = 'PAID' AND paid_at IS NULL THEN CURRENT_TIMESTAMP ELSE paid_at END
        WHERE id = ?
      `).run(
        order_status || null,
        payment_status || null,
        tracking_number || null,
        fleet_notes || null,
        order_status,
        payment_status,
        id
      );

      res.json({
        success: true,
        message: `Order ${order.order_number} status updated successfully.`,
      });
    } catch (err: any) {
      console.error("[ERP Shop API] Status update error:", err);
      res.status(500).json({ success: false, error: "Failed to update order status" });
    }
  }
);

/**
 * POST /api/erp/shop-management/orders/:id/dispatch-do
 * 1-click dispatch to official ERP Delivery Note (DO)
 */
shopRouter.post(
  "/api/erp/shop-management/orders/:id/dispatch-do",
  requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
  (req, res) => {
    try {
      const { id } = req.params;
      const { driver_name, vehicle_plate, dispatch_notes } = req.body;

      const order = db.prepare("SELECT * FROM shop_orders WHERE id = ?").get(id) as any;
      if (!order) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }

      const items = db.prepare("SELECT * FROM shop_order_items WHERE order_id = ?").all(id) as any[];

      // Generate Delivery Note Number
      const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      let rand = "";
      for (let i = 0; i < 4; i++) {
        rand += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const now = new Date();
      const yr = String(now.getFullYear()).slice(-2);
      const mo = String(now.getMonth() + 1).padStart(2, "0");
      const dnNumber = `DN-${yr}${mo}-B2C-${rand}`;
      const dnId = `DN-${Date.now()}-${rand}`;

      db.transaction(() => {
        // Insert into delivery_notes
        db.prepare(`
          INSERT INTO delivery_notes (
            id, dn_number, project_id, quotation_id, delivery_date, status,
            vehicle_plate, driver_name, shipping_address, recipient_contact, notes, created_at
          ) VALUES (
            ?, ?, NULL, NULL, CURRENT_DATE, 'DISPATCHED',
            ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
          )
        `).run(
          dnId,
          dnNumber,
          vehicle_plate || "Internal Fleet",
          driver_name || "Factory Driver",
          order.delivery_address,
          `${order.customer_name} (${order.customer_phone})`,
          dispatch_notes || `B2C Shop Order ${order.order_number}`
        );

        // Insert items into delivery_items and decrement inventory
        const dnItemInsert = db.prepare(`
          INSERT INTO delivery_items (
            id, delivery_id, item_id, item_code, item_name, uom, qty_delivered, notes
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?
          )
        `);

        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          dnItemInsert.run(
            `DNI-${dnId}-${i + 1}`,
            dnId,
            it.item_id,
            it.item_code,
            it.item_name,
            it.uom,
            it.qty,
            `From B2C Order ${order.order_number}`
          );

          // Decrement physical stock and clear reserved qty
          db.prepare(`
            UPDATE inventory
            SET physical_qty = MAX(0, physical_qty - ?),
                reserved_qty = MAX(0, reserved_qty - ?)
            WHERE item_id = ?
          `).run(it.qty, it.qty, it.item_id);
        }

        // Update shop_orders
        db.prepare(`
          UPDATE shop_orders
          SET order_status = 'DISPATCHED',
              tracking_number = ?,
              fleet_notes = ?,
              delivery_note_id = ?,
              dispatched_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          dnNumber,
          `${vehicle_plate ? vehicle_plate + " - " : ""}${driver_name || "Dispatch Driver"}`,
          dnId,
          id
        );
      })();

      res.json({
        success: true,
        message: `Delivery Note ${dnNumber} created and order marked as DISPATCHED.`,
        data: {
          dn_id: dnId,
          dn_number: dnNumber,
        },
      });
    } catch (err: any) {
      console.error("[ERP Shop API] Dispatch error:", err);
      res.status(500).json({ success: false, error: "Failed to dispatch order: " + err.message });
    }
  }
);

/**
 * GET /api/erp/shop-management/catalog
 * List all Finished Goods to manage Shop display
 */
shopRouter.get(
  "/api/erp/shop-management/catalog",
  requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
  (req, res) => {
    try {
      const q = (req.query.q as string || "").trim();
      let sql = `
        SELECT 
          i.id,
          i.item_code,
          i.name,
          i.dimension,
          i.spec,
          i.category,
          i.description,
          i.uom,
          COALESCE(i.unit_price, 0) as unit_price,
          COALESCE(i.shop_promo_price, 0) as shop_promo_price,
          COALESCE(i.shop_weight_kg, 2.5) as shop_weight_kg,
          COALESCE(i.shop_image_url, '') as shop_image_url,
          COALESCE(i.shop_gallery_urls, '[]') as shop_gallery_urls,
          COALESCE(i.shop_badge, '') as shop_badge,
          COALESCE(i.shop_featured, 0) as shop_featured,
          COALESCE(i.is_published_shop, 0) as is_published_shop,
          COALESCE(i.shop_availability_type, 'AUTO') as shop_availability_type,
          COALESCE(i.shop_lead_time_days, 3) as shop_lead_time_days,
          COALESCE(i.shop_moq, 1) as shop_moq,
          COALESCE(i.shop_specs, '') as shop_specs,
          COALESCE(inv.available_qty, 0) as available_qty,
          COALESCE(inv.physical_qty, 0) as physical_qty
        FROM items i
        LEFT JOIN inventory inv ON i.id = inv.item_id
        WHERE i.deleted_at IS NULL AND (i.type = 'FINISHED' OR i.type = 'FINISH_GOOD')
      `;
      const params: any[] = [];

      if (q) {
        sql += ` AND (i.name LIKE ? OR i.item_code LIKE ? OR i.category LIKE ?)`;
        const wildcard = `%${q}%`;
        params.push(wildcard, wildcard, wildcard);
      }

      sql += ` ORDER BY i.is_published_shop DESC, i.name ASC`;

      const catalog = db.prepare(sql).all(...params);

      res.json({
        success: true,
        data: catalog,
      });
    } catch (err: any) {
      console.error("[ERP Shop API] Catalog error:", err);
      res.status(500).json({ success: false, error: "Failed to fetch catalog" });
    }
  }
);

/**
 * PUT /api/erp/shop-management/catalog/:id
 * Update product shop display configuration
 */
shopRouter.put(
  "/api/erp/shop-management/catalog/:id",
  requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
  (req, res) => {
    try {
      const { id } = req.params;
      const {
        unit_price,
        is_published_shop,
        shop_image_url,
        shop_gallery_urls,
        shop_promo_price,
        shop_weight_kg,
        shop_badge,
        shop_featured,
        shop_availability_type,
        shop_lead_time_days,
        shop_moq,
        shop_specs,
        category,
        description,
      } = req.body;

      const item = db.prepare("SELECT id, name FROM items WHERE id = ?").get(id) as any;
      if (!item) {
        return res.status(404).json({ success: false, error: "Item not found" });
      }

      const galleryJson = Array.isArray(shop_gallery_urls)
        ? JSON.stringify(shop_gallery_urls)
        : typeof shop_gallery_urls === "string"
        ? shop_gallery_urls
        : null;

      db.prepare(`
        UPDATE items
        SET unit_price = COALESCE(?, unit_price),
            is_published_shop = COALESCE(?, is_published_shop),
            shop_image_url = COALESCE(?, shop_image_url),
            shop_gallery_urls = COALESCE(?, shop_gallery_urls),
            shop_promo_price = COALESCE(?, shop_promo_price),
            shop_weight_kg = COALESCE(?, shop_weight_kg),
            shop_badge = COALESCE(?, shop_badge),
            shop_featured = COALESCE(?, shop_featured),
            shop_availability_type = COALESCE(?, shop_availability_type),
            shop_lead_time_days = COALESCE(?, shop_lead_time_days),
            shop_moq = COALESCE(?, shop_moq),
            shop_specs = COALESCE(?, shop_specs),
            category = COALESCE(?, category),
            description = COALESCE(?, description)
        WHERE id = ?
      `).run(
        unit_price !== undefined ? Number(unit_price) : null,
        is_published_shop !== undefined ? (is_published_shop ? 1 : 0) : null,
        shop_image_url !== undefined ? shop_image_url : null,
        galleryJson !== null ? galleryJson : null,
        shop_promo_price !== undefined ? Number(shop_promo_price) : null,
        shop_weight_kg !== undefined ? Number(shop_weight_kg) : null,
        shop_badge !== undefined ? shop_badge : null,
        shop_featured !== undefined ? (shop_featured ? 1 : 0) : null,
        shop_availability_type !== undefined ? shop_availability_type : null,
        shop_lead_time_days !== undefined ? Number(shop_lead_time_days) : null,
        shop_moq !== undefined ? Number(shop_moq) : null,
        shop_specs !== undefined ? shop_specs : null,
        category !== undefined ? category : null,
        description !== undefined ? description : null,
        id
      );

      res.json({
        success: true,
        message: `Product ${item.name} shop configuration updated.`,
      });
    } catch (err: any) {
      console.error("[ERP Shop API] Catalog update error:", err);
      res.status(500).json({ success: false, error: "Failed to update catalog item" });
    }
  }
);
