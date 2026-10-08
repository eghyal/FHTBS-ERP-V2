import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import { isValidDailyAuthKey } from "../utils/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { syncCollectionToFirestore } from "../db/firebaseSync.ts";
import { calculateFinancialBreakdown } from "../lib/financialEngine.ts";
import { postDeliveryDispatchJournal, postCommercialInvoiceJournal, postJournalEntry } from "../utils/accountingBridge.ts";
import { runScoutIntelligence } from "../lib/scoutIntelligence.ts";
import { cacheService } from "../services/cacheService.ts";
import { outboxService } from "../services/outboxService.ts";
import crypto from "crypto";

export const salesRouter = Router();

    // --- OUTBOUND / DELIVERY API ---
    const generateDNNumber = () => {
      const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      let result = "";
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return `DN-${new Date().toISOString().slice(2, 4)}${new Date().toISOString().slice(5, 7)}-${result}`;
    };

    salesRouter.get(
      "/api/sales/leads",
      requireRole(["SALES", "FC", "WAREHOUSE"]),
      (req, res) => {
        try {
          const leads = db
            .prepare("SELECT * FROM crm_leads ORDER BY created_at DESC")
            .all();
          res.json(leads);
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to fetch leads" });
        }
      },
    );

    salesRouter.post(
      "/api/sales/leads/:id/convert",
      requireRole(["SALES", "FC", "WAREHOUSE"]),
      (req, res) => {
        try {
          const leadId = req.params.id;
          const lead = db
            .prepare("SELECT * FROM crm_leads WHERE id = ?")
            .get(leadId) as any;
          if (!lead) return res.status(404).json({ error: "Lead not found" });
          if (lead.status === "CONVERTED")
            return res.status(400).json({ error: "Lead already converted" });

          const transaction = db.transaction(() => {
            db.prepare(
              "UPDATE crm_leads SET status = 'CONVERTED' WHERE id = ?",
            ).run(leadId);
            const customerId = "CUS-" + crypto.randomUUID().substring(0, 8);
            const code =
              lead.name.slice(0, 3).toUpperCase() +
              "-" +
              Math.floor(Math.random() * 1000)
                .toString()
                .padStart(3, "0");
            db.prepare(
              `
            INSERT INTO customers (id, name, code, contact_person, phone)
            VALUES (?, ?, ?, ?, ?)
          `,
            ).run(customerId, lead.name, code, lead.name, lead.contact_info);
            
            syncCollectionToFirestore("crm_leads", leadId, { id: leadId, status: 'CONVERTED' });
            syncCollectionToFirestore("customers", customerId, {
              id: customerId,
              name: lead.name,
              code,
              contact_person: lead.name,
              phone: lead.contact_info,
            });
          });
          transaction();
          res.json({ success: true, message: "Lead converted to Customer" });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to convert lead" });
        }
      },
    );

    salesRouter.delete(
      "/api/sales/leads/:id",
      requireRole(["SALES", "FC", "WAREHOUSE"]),
      (req, res) => {
        try {
          db.prepare("DELETE FROM crm_leads WHERE id = ?").run(req.params.id);
          res.json({ success: true });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to delete lead" });
        }
      },
    );

    // =========================================================================
    // POTENTIAL CUSTOMERS & AI SCOUT ENGINE ENDPOINTS (SCOUT AI - UU PDP ALIGNED)
    // =========================================================================

    /**
     * GET /api/sales/potential-customers
     * Fetch list of leads captured from storefront with advanced filtering, scoring, and KPI aggregation
     */
    salesRouter.get(
      "/api/sales/potential-customers",
      requireRole(["SALES", "FC", "WAREHOUSE", "ADMIN", "GOD_MODE"]),
      (req, res) => {
        try {
          const search = ((req.query.search as string) || "").trim().toLowerCase();
          const status = ((req.query.status as string) || "ALL").trim();
          const persona = ((req.query.persona as string) || "ALL").trim();
          const segment = ((req.query.segment as string) || "ALL").trim();
          const grade = ((req.query.grade as string) || "ALL").trim();
          const consent = ((req.query.consent as string) || "ALL").trim();
          const scoutStatus = ((req.query.scout_status as string) || "ALL").trim();
          const cartMin = Number(req.query.cart_min) || 0;
          const sort = ((req.query.sort as string) || "recent").trim();

          let sql = "SELECT * FROM potential_customers WHERE 1=1";
          const params: any[] = [];

          if (search) {
            sql += " AND (LOWER(customer_name) LIKE ? OR LOWER(COALESCE(email, '')) LIKE ? OR LOWER(COALESCE(phone, '')) LIKE ? OR LOWER(COALESCE(company, '')) LIKE ?)";
            const term = `%${search}%`;
            params.push(term, term, term, term);
          }

          if (status && status !== "ALL") {
            sql += " AND status = ?";
            params.push(status);
          }

          if (persona && persona !== "ALL") {
            sql += " AND persona_tag = ?";
            params.push(persona);
          }

          if (segment && segment !== "ALL") {
            sql += " AND customer_segment = ?";
            params.push(segment);
          }

          if (grade && grade !== "ALL") {
            sql += " AND lead_grade = ?";
            params.push(grade);
          }

          if (consent && consent !== "ALL") {
            if (consent === "CONSENT_ACTIVE") {
              sql += " AND profiling_consent = 1";
            } else if (consent === "NO_CONSENT") {
              sql += " AND (profiling_consent = 0 OR profiling_consent IS NULL)";
            }
          }

          if (scoutStatus && scoutStatus !== "ALL") {
            sql += " AND scout_status = ?";
            params.push(scoutStatus);
          }

          if (cartMin > 0) {
            sql += " AND cart_total_value >= ?";
            params.push(cartMin);
          }

          if (sort === "score_desc") {
            sql += " ORDER BY potential_score DESC, created_at DESC";
          } else if (sort === "value_desc") {
            sql += " ORDER BY cart_total_value DESC, created_at DESC";
          } else if (sort === "activity_desc") {
            sql += " ORDER BY activity_count DESC, created_at DESC";
          } else {
            sql += " ORDER BY created_at DESC";
          }

          const rawLeads = db.prepare(sql).all(...params) as any[];

          const leads = rawLeads.map((row) => {
            let parsedCart: any[] = [];
            let parsedSources: string[] = [];
            let sourcesJson: any[] = [];
            let keyTalkingPoints: string[] = [];
            let recommendedProducts: string[] = [];
            let riskFlags: string[] = [];
            let leadScoreBreakdown: any = null;

            try { parsedCart = row.cart_snapshot ? JSON.parse(row.cart_snapshot) : []; } catch { parsedCart = []; }
            try { parsedSources = row.scout_sources ? JSON.parse(row.scout_sources) : []; } catch { parsedSources = []; }
            try { sourcesJson = row.sources_json ? JSON.parse(row.sources_json) : []; } catch { sourcesJson = []; }
            try { keyTalkingPoints = row.key_talking_points ? JSON.parse(row.key_talking_points) : []; } catch { keyTalkingPoints = []; }
            try { recommendedProducts = row.recommended_products ? JSON.parse(row.recommended_products) : []; } catch { recommendedProducts = []; }
            try { riskFlags = row.risk_flags ? JSON.parse(row.risk_flags) : []; } catch { riskFlags = []; }
            try { leadScoreBreakdown = row.lead_score_breakdown ? JSON.parse(row.lead_score_breakdown) : null; } catch { leadScoreBreakdown = null; }

            const gradeVal = row.lead_grade || (row.potential_score >= 80 ? "A" : row.potential_score >= 60 ? "B" : row.potential_score >= 40 ? "C" : "D");

            return {
              ...row,
              lead_grade: gradeVal,
              cart_snapshot: parsedCart,
              scout_sources: parsedSources,
              sources_json: sourcesJson,
              key_talking_points: keyTalkingPoints,
              recommended_products: recommendedProducts,
              risk_flags: riskFlags,
              lead_score_breakdown: leadScoreBreakdown,
            };
          });

          // Aggregate KPI Stats
          const allRows = db.prepare("SELECT potential_score, cart_total_value, status, lead_grade, profiling_consent, scout_status FROM potential_customers").all() as any[];
          const stats = {
            total_leads: allRows.length,
            grade_a_count: allRows.filter((r) => (r.lead_grade === "A" || r.potential_score >= 80)).length,
            grade_b_count: allRows.filter((r) => (r.lead_grade === "B" || (r.potential_score >= 60 && r.potential_score < 80))).length,
            grade_c_count: allRows.filter((r) => (r.lead_grade === "C" || (r.potential_score >= 40 && r.potential_score < 60))).length,
            grade_d_count: allRows.filter((r) => (r.lead_grade === "D" || (r.potential_score < 40))).length,
            scouted_count: allRows.filter((r) => r.scout_status === "SCOUTED").length,
            consented_count: allRows.filter((r) => r.profiling_consent === 1).length,
            total_cart_pipeline_value: allRows.reduce((sum, r) => sum + (Number(r.cart_total_value) || 0), 0),
            converted_count: allRows.filter((r) => r.status === "CONVERTED").length,
            contacted_count: allRows.filter((r) => r.status === "CONTACTED").length,
          };

          res.json({
            success: true,
            data: leads,
            stats,
          });
        } catch (err: any) {
          console.error("[Sales API] Error fetching potential customers:", err);
          res.status(500).json({ success: false, error: err.message || "Failed to fetch potential customers" });
        }
      }
    );

    /**
     * GET /api/sales/potential-customers/:id
     * Single lead details including full website activity trail, consents, and outreach
     */
    salesRouter.get(
      "/api/sales/potential-customers/:id",
      requireRole(["SALES", "FC", "WAREHOUSE", "ADMIN", "GOD_MODE"]),
      (req, res) => {
        try {
          const row = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(req.params.id) as any;
          if (!row) {
            return res.status(404).json({ success: false, error: "Potential customer not found" });
          }

          let parsedCart = [];
          let parsedSources = [];
          let sourcesJson = [];
          let keyTalkingPoints = [];
          let recommendedProducts = [];
          let riskFlags = [];
          let leadScoreBreakdown = null;

          try { parsedCart = row.cart_snapshot ? JSON.parse(row.cart_snapshot) : []; } catch {}
          try { parsedSources = row.scout_sources ? JSON.parse(row.scout_sources) : []; } catch {}
          try { sourcesJson = row.sources_json ? JSON.parse(row.sources_json) : []; } catch {}
          try { keyTalkingPoints = row.key_talking_points ? JSON.parse(row.key_talking_points) : []; } catch {}
          try { recommendedProducts = row.recommended_products ? JSON.parse(row.recommended_products) : []; } catch {}
          try { riskFlags = row.risk_flags ? JSON.parse(row.risk_flags) : []; } catch {}
          try { leadScoreBreakdown = row.lead_score_breakdown ? JSON.parse(row.lead_score_breakdown) : null; } catch {}

          // Fetch associated website browsing activities
          const activities = db.prepare(`
            SELECT id, module, activity_type, title, details, page_url, user_agent, created_at
            FROM visitor_activities
            WHERE customer_id = ? OR (session_id = ? AND session_id IS NOT NULL AND session_id != '')
            ORDER BY created_at DESC
            LIMIT 150
          `).all(row.id, row.visitor_session_id || "") as any[];

          const parsedActivities = activities.map((a) => {
            let detailsObj = null;
            try {
              detailsObj = a.details ? JSON.parse(a.details) : null;
            } catch {
              detailsObj = a.details;
            }
            return {
              ...a,
              details: detailsObj,
            };
          });

          // Fetch consents history
          const consents = db.prepare(`
            SELECT * FROM customer_consents
            WHERE customer_id = ?
            ORDER BY created_at DESC
          `).all(row.id) as any[];

          // Fetch outreach history
          const outreach = db.prepare(`
            SELECT * FROM outreach_activities
            WHERE customer_id = ?
            ORDER BY sent_at DESC
          `).all(row.id) as any[];

          // Fetch AI feedback
          const feedback = db.prepare(`
            SELECT * FROM ai_feedback
            WHERE customer_id = ?
            ORDER BY created_at DESC
          `).all(row.id) as any[];

          const gradeVal = row.lead_grade || (row.potential_score >= 80 ? "A" : row.potential_score >= 60 ? "B" : row.potential_score >= 40 ? "C" : "D");

          res.json({
            success: true,
            data: {
              ...row,
              lead_grade: gradeVal,
              cart_snapshot: parsedCart,
              scout_sources: parsedSources,
              sources_json: sourcesJson,
              key_talking_points: keyTalkingPoints,
              recommended_products: recommendedProducts,
              risk_flags: riskFlags,
              lead_score_breakdown: leadScoreBreakdown,
              activities: parsedActivities,
              consents,
              outreach,
              feedback,
            },
          });
        } catch (err: any) {
          console.error("[Sales API] Error getting potential customer:", err);
          res.status(500).json({ success: false, error: err.message });
        }
      }
    );

    /**
     * GET /api/sales/potential-customers/:id/activities
     * Direct endpoint to fetch timeline of website activities (Public, Shop, Careers)
     */
    salesRouter.get(
      "/api/sales/potential-customers/:id/activities",
      requireRole(["SALES", "FC", "WAREHOUSE", "ADMIN", "GOD_MODE"]),
      (req, res) => {
        try {
          const row = db.prepare("SELECT id, visitor_session_id FROM potential_customers WHERE id = ?").get(req.params.id) as any;
          if (!row) {
            return res.status(404).json({ success: false, error: "Potential customer not found" });
          }

          const activities = db.prepare(`
            SELECT id, module, activity_type, title, details, page_url, user_agent, created_at
            FROM visitor_activities
            WHERE customer_id = ? OR (session_id = ? AND session_id IS NOT NULL AND session_id != '')
            ORDER BY created_at DESC
            LIMIT 200
          `).all(row.id, row.visitor_session_id || "") as any[];

          const parsed = activities.map((a) => {
            let detailsObj = null;
            try {
              detailsObj = a.details ? JSON.parse(a.details) : null;
            } catch {
              detailsObj = a.details;
            }
            return {
              ...a,
              details: detailsObj,
            };
          });

          res.json({ success: true, data: parsed });
        } catch (err: any) {
          console.error("[Sales API] Error getting lead activities:", err);
          res.status(500).json({ success: false, error: err.message });
        }
      }
    );

    /**
     * POST /api/sales/potential-customers/:id/scout
     * Run deterministic first-party intelligence & scoring pipeline with UU PDP compliance check
     */
    salesRouter.post(
      "/api/sales/potential-customers/:id/scout",
      requireRole(["SALES", "FC", "WAREHOUSE", "ADMIN", "GOD_MODE"]),
      async (req, res) => {
        try {
          const row = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(req.params.id) as any;
          if (!row) {
            return res.status(404).json({ success: false, error: "Calon pelanggan tidak ditemukan." });
          }

          let parsedCart = [];
          try {
            parsedCart = row.cart_snapshot ? JSON.parse(row.cart_snapshot) : [];
          } catch {}

          // Fetch all recorded activities across website (Public, Shop, Careers)
          const rawActivities = db.prepare(`
            SELECT module, activity_type, title, details, page_url, created_at
            FROM visitor_activities
            WHERE customer_id = ? OR (session_id = ? AND session_id IS NOT NULL AND session_id != '')
            ORDER BY created_at ASC
            LIMIT 150
          `).all(row.id, row.visitor_session_id || "") as any[];

          const parsedActivities = rawActivities.map((a) => {
            let detailsObj = null;
            try {
              detailsObj = a.details ? JSON.parse(a.details) : null;
            } catch {
              detailsObj = a.details;
            }
            return {
              module: a.module,
              activity_type: a.activity_type,
              title: a.title,
              details: detailsObj,
              page_url: a.page_url,
              created_at: a.created_at,
            };
          });

          // Check UU PDP Profiling Consent
          const hasProfilingConsent = row.profiling_consent !== 0;

          // Set status to SCOUTING temporarily
          db.prepare("UPDATE potential_customers SET scout_status = 'SCOUTING' WHERE id = ?").run(row.id);

          // Execute Scout Intelligence dengan heuristic engine deterministik (first-party, patuh UU PDP)
          const analysis = await runScoutIntelligence({
            id: row.id,
            customer_name: row.customer_name,
            email: row.email,
            phone: row.phone,
            company: row.company,
            cart_snapshot: parsedCart,
            cart_total_value: row.cart_total_value,
            cart_total_items: row.cart_total_items,
            activities: parsedActivities,
            profiling_consent: hasProfilingConsent,
          });

          const now = new Date().toISOString();
          const newStatus = row.status === "NEW_INTENT" ? "SCOUTED" : row.status;
          const userSub = (req as any).user?.name || (req as any).user?.email || "Sales Agent";

          db.prepare(`
            UPDATE potential_customers
            SET potential_score = ?,
                lead_grade = ?,
                fit_score = ?,
                intent_score = ?,
                reachability_score = ?,
                persona_tag = ?,
                buying_power_est = ?,
                scout_company = ?,
                scout_role = ?,
                scout_summary = ?,
                scout_sources = ?,
                sources_json = ?,
                scout_recommendations = ?,
                key_talking_points = ?,
                recommended_products = ?,
                risk_flags = ?,
                scout_confidence = ?,
                lead_score_breakdown = ?,
                scout_status = 'SCOUTED',
                scout_triggered_by = ?,
                scouted_at = ?,
                status = ?
            WHERE id = ?
          `).run(
            analysis.potential_score,
            analysis.lead_grade,
            analysis.fit_score,
            analysis.intent_score,
            analysis.reachability_score,
            analysis.persona_tag,
            analysis.buying_power_est,
            analysis.scout_company,
            analysis.scout_role,
            analysis.scout_summary,
            JSON.stringify(analysis.scout_sources),
            JSON.stringify(analysis.sources_json),
            analysis.scout_recommendations,
            JSON.stringify(analysis.key_talking_points),
            JSON.stringify(analysis.recommended_products),
            JSON.stringify(analysis.risk_flags),
            analysis.confidence_level,
            JSON.stringify({ dimensions: analysis.dimensions, explanation: analysis.explanation, deep_osint: analysis.deep_osint }),
            userSub,
            now,
            newStatus,
            row.id
          );

          const updated = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(row.id) as any;
          res.json({
            success: true,
            message: hasProfilingConsent
              ? "Analisis Scout AI berhasil dijalankan dengan OSINT & web grounding."
              : "Analisis Scout First-Party berhasil. (Data enrichment publik dibatasi sesuai preferensi consent UU PDP).",
            data: {
              ...updated,
              lead_grade: analysis.lead_grade,
              cart_snapshot: parsedCart,
              scout_sources: analysis.scout_sources,
              sources_json: analysis.sources_json,
              key_talking_points: analysis.key_talking_points,
              recommended_products: analysis.recommended_products,
              risk_flags: analysis.risk_flags,
              lead_score_breakdown: { dimensions: analysis.dimensions, explanation: analysis.explanation },
              activities: parsedActivities,
            },
          });
        } catch (err: any) {
          console.error("[Sales API] Error running scout:", err);
          db.prepare("UPDATE potential_customers SET scout_status = 'SCOUT_FAILED' WHERE id = ?").run(req.params.id);
          res.status(500).json({ success: false, error: err.message || "Gagal menjalankan analisis Scout" });
        }
      }
    );

    /**
     * POST /api/sales/potential-customers/bulk-scout
     * Run batch scout for multiple selected customer candidates
     */
    salesRouter.post(
      "/api/sales/potential-customers/bulk-scout",
      requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
      async (req, res) => {
        try {
          const { customer_ids = [] } = req.body;
          if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
            return res.status(400).json({ success: false, error: "customer_ids array required" });
          }

          const limit = Math.min(25, customer_ids.length);
          const targetIds = customer_ids.slice(0, limit);
          let scoutedCount = 0;
          let skippedNoConsent = 0;
          const userSub = (req as any).user?.name || (req as any).user?.email || "Sales Agent";

          for (const id of targetIds) {
            const row = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(id) as any;
            if (!row) continue;

            const hasConsent = row.profiling_consent !== 0;
            if (!hasConsent) {
              skippedNoConsent++;
            }

            let parsedCart = [];
            try { parsedCart = row.cart_snapshot ? JSON.parse(row.cart_snapshot) : []; } catch {}

            const rawActivities = db.prepare(`
              SELECT module, activity_type, title, details, page_url, created_at
              FROM visitor_activities
              WHERE customer_id = ? OR (session_id = ? AND session_id IS NOT NULL AND session_id != '')
              ORDER BY created_at ASC
              LIMIT 80
            `).all(row.id, row.visitor_session_id || "") as any[];

            const parsedActivities = rawActivities.map((a) => {
              let detailsObj = null;
              try { detailsObj = a.details ? JSON.parse(a.details) : null; } catch { detailsObj = a.details; }
              return { module: a.module, activity_type: a.activity_type, title: a.title, details: detailsObj, page_url: a.page_url, created_at: a.created_at };
            });

            try {
              const analysis = await runScoutIntelligence({
                id: row.id,
                customer_name: row.customer_name,
                email: row.email,
                phone: row.phone,
                company: row.company,
                cart_snapshot: parsedCart,
                cart_total_value: row.cart_total_value,
                cart_total_items: row.cart_total_items,
                activities: parsedActivities,
                profiling_consent: hasConsent,
              });

              const now = new Date().toISOString();
              db.prepare(`
                UPDATE potential_customers
                SET potential_score = ?,
                    lead_grade = ?,
                    fit_score = ?,
                    intent_score = ?,
                    reachability_score = ?,
                    persona_tag = ?,
                    buying_power_est = ?,
                    scout_company = ?,
                    scout_role = ?,
                    scout_summary = ?,
                    scout_sources = ?,
                    sources_json = ?,
                    scout_recommendations = ?,
                    key_talking_points = ?,
                    recommended_products = ?,
                    risk_flags = ?,
                    scout_confidence = ?,
                    scout_status = 'SCOUTED',
                    scout_triggered_by = ?,
                    scouted_at = ?
                WHERE id = ?
              `).run(
                analysis.potential_score,
                analysis.lead_grade,
                analysis.fit_score,
                analysis.intent_score,
                analysis.reachability_score,
                analysis.persona_tag,
                analysis.buying_power_est,
                analysis.scout_company,
                analysis.scout_role,
                analysis.scout_summary,
                JSON.stringify(analysis.scout_sources),
                JSON.stringify(analysis.sources_json),
                analysis.scout_recommendations,
                JSON.stringify(analysis.key_talking_points),
                JSON.stringify(analysis.recommended_products),
                JSON.stringify(analysis.risk_flags),
                analysis.confidence_level,
                userSub,
                now,
                row.id
              );
              scoutedCount++;
            } catch (err) {
              console.error(`[Bulk Scout] Error scouting ${id}:`, err);
            }
          }

          res.json({
            success: true,
            total_requested: targetIds.length,
            scouted: scoutedCount,
            skipped_no_consent: skippedNoConsent,
            message: `Berhasil memproses Scout untuk ${scoutedCount} calon pelanggan.${skippedNoConsent > 0 ? ` (${skippedNoConsent} diproses terbatas first-party karena belum ada profiling consent).` : ""}`,
          });
        } catch (err: any) {
          console.error("[Sales API] Bulk scout error:", err);
          res.status(500).json({ success: false, error: err.message });
        }
      }
    );

    /**
     * POST /api/sales/potential-customers/:id/request-consent
     * Queues an email/WA invitation for customer to opt-in for Scout AI personalization
     */
    salesRouter.post(
      "/api/sales/potential-customers/:id/request-consent",
      requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
      (req, res) => {
        try {
          const lead = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(req.params.id) as any;
          if (!lead) return res.status(404).json({ success: false, error: "Lead not found" });

          const now = new Date().toISOString();
          const outreachId = `OUT-${Date.now()}`;
          const userSub = (req as any).user?.name || (req as any).user?.email || "Sales Agent";

          db.prepare(`
            INSERT INTO outreach_activities (id, customer_id, channel, template_id, custom_note, sent_by, sent_at, status)
            VALUES (?, ?, 'EMAIL', 'CONSENT_REQUEST', 'Undangan persetujuan personalisasi penawaran proyek & kalkulasi mutu SNI', ?, ?, 'SENT')
          `).run(outreachId, lead.id, userSub, now);

          res.json({
            success: true,
            message: `Undangan persetujuan (Consent Request) telah dijadwalkan ke ${lead.email || lead.phone || lead.customer_name}.`,
          });
        } catch (err: any) {
          console.error("[Sales API] Error requesting consent:", err);
          res.status(500).json({ success: false, error: err.message });
        }
      }
    );

    /**
     * POST /api/sales/outreach
     * Log communication outreach (WhatsApp, Email, Telepon)
     */
    salesRouter.post(
      "/api/sales/outreach",
      requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
      (req, res) => {
        try {
          const { customer_id, channel = "WA", template_id, custom_note } = req.body;
          if (!customer_id) return res.status(400).json({ success: false, error: "customer_id required" });

          const now = new Date().toISOString();
          const outreachId = `OUT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
          const userSub = (req as any).user?.name || (req as any).user?.email || "Sales Agent";

          db.prepare(`
            INSERT INTO outreach_activities (id, customer_id, channel, template_id, custom_note, sent_by, sent_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'SENT')
          `).run(outreachId, customer_id, channel, template_id || "CUSTOM", custom_note || "Outreach dikirim", userSub, now);

          // Update status to CONTACTED if NEW_INTENT or SCOUTED
          db.prepare(`
            UPDATE potential_customers
            SET status = 'CONTACTED',
                last_active_at = ?
            WHERE id = ? AND status IN ('NEW_INTENT', 'SCOUTED')
          `).run(now, customer_id);

          res.json({
            success: true,
            outreach_id: outreachId,
            message: "Aktivitas outreach berhasil dicatat.",
          });
        } catch (err: any) {
          console.error("[Sales API] Error logging outreach:", err);
          res.status(500).json({ success: false, error: err.message });
        }
      }
    );

    /**
     * POST /api/sales/feedback
     * AI Feedback Loop (Anti-hallucination tracking)
     */
    salesRouter.post(
      "/api/sales/feedback",
      requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
      (req, res) => {
        try {
          const { customer_id, field, flag = "HELPFUL", note } = req.body;
          if (!customer_id || !field) {
            return res.status(400).json({ success: false, error: "customer_id and field required" });
          }

          const now = new Date().toISOString();
          const feedbackId = `FB-${Date.now()}`;
          const userSub = (req as any).user?.name || (req as any).user?.email || "Sales Agent";

          db.prepare(`
            INSERT INTO ai_feedback (id, customer_id, field, flag, note, flagged_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(feedbackId, customer_id, field, flag, note || null, userSub, now);

          res.json({
            success: true,
            feedback_id: feedbackId,
            message: flag === "WRONG_INFO" ? "Laporan info salah dicatat untuk evaluasi AI." : "Feedback positif berhasil dicatat.",
          });
        } catch (err: any) {
          console.error("[Sales API] Error logging AI feedback:", err);
          res.status(500).json({ success: false, error: err.message });
        }
      }
    );

    /**
     * GET /api/sales/scout/icp & GET /api/scout/templates/icp
     * Retrieve ICP Configuration
     */
    const handleGetICP = (req: any, res: any) => {
      try {
        let config = db.prepare("SELECT * FROM scout_icp_config WHERE id = 'ICP-DEFAULT'").get() as any;
        if (!config) {
          config = {
            id: "ICP-DEFAULT",
            company_name: "Enterprise Commerce & Operations",
            target_industries: JSON.stringify(["Contractors & Construction", "Property Developers", "Manufacturing Plants", "Commercial Entities", "Distributors & Wholesalers"]),
            target_buyer_personas: JSON.stringify(["Project Manager", "Procurement Lead", "Purchasing Manager", "Operations Director", "Business Owner"]),
            priority_products: JSON.stringify(["Standard Industrial Products", "Custom Fabrications", "Specialized Components", "Bulk Wholesale Orders"]),
            scoring_weights: JSON.stringify({ behavioral_intent: 0.35, engagement: 0.20, profile_fit: 0.30, freshness: 0.15 }),
          };
        }

        res.json({
          success: true,
          data: {
            ...config,
            target_industries: JSON.parse(config.target_industries || "[]"),
            target_buyer_personas: JSON.parse(config.target_buyer_personas || "[]"),
            priority_products: JSON.parse(config.priority_products || "[]"),
            scoring_weights: JSON.parse(config.scoring_weights || "{}"),
          },
        });
      } catch (err: any) {
        console.error("[Sales API] Error getting ICP config:", err);
        res.status(500).json({ success: false, error: err.message });
      }
    };

    salesRouter.get("/api/sales/scout/icp", requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]), handleGetICP);
    salesRouter.get("/api/scout/templates/icp", requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]), handleGetICP);

    /**
     * PATCH /api/sales/scout/icp & PATCH /api/scout/templates/icp
     * Update ICP Configuration
     */
    const handlePatchICP = (req: any, res: any) => {
      try {
        const payload = req.body.icp_config || req.body;
        const { target_industries, target_buyer_personas, priority_products, scoring_weights, company_name } = payload;
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO scout_icp_config (id, company_name, target_industries, target_buyer_personas, priority_products, scoring_weights, updated_at)
          VALUES ('ICP-DEFAULT', ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            company_name = COALESCE(excluded.company_name, scout_icp_config.company_name),
            target_industries = excluded.target_industries,
            target_buyer_personas = excluded.target_buyer_personas,
            priority_products = excluded.priority_products,
            scoring_weights = excluded.scoring_weights,
            updated_at = excluded.updated_at
        `).run(
          company_name || "Enterprise Commerce & Operations",
          JSON.stringify(target_industries || []),
          JSON.stringify(target_buyer_personas || []),
          JSON.stringify(priority_products || []),
          JSON.stringify(scoring_weights || {}),
          now
        );

        res.json({ success: true, message: "ICP Scout AI configuration updated successfully." });
      } catch (err: any) {
        console.error("[Sales API] Error updating ICP config:", err);
        res.status(500).json({ success: false, error: err.message });
      }
    };

    salesRouter.patch("/api/sales/scout/icp", requireRole(["SALES", "ADMIN", "GOD_MODE", "FC"]), handlePatchICP);
    salesRouter.patch("/api/scout/templates/icp", requireRole(["SALES", "ADMIN", "GOD_MODE", "FC"]), handlePatchICP);

    /**
     * PATCH /api/sales/potential-customers/:id
     * Update status, sales notes, assignment
     */
    salesRouter.patch(
      "/api/sales/potential-customers/:id",
      requireRole(["SALES", "FC", "WAREHOUSE", "ADMIN", "GOD_MODE"]),
      (req, res) => {
        try {
          const { status, sales_notes, assigned_to } = req.body;
          const lead = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(req.params.id) as any;
          if (!lead) {
            return res.status(404).json({ success: false, error: "Potential customer not found" });
          }

          db.prepare(`
            UPDATE potential_customers
            SET status = COALESCE(?, status),
                sales_notes = COALESCE(?, sales_notes),
                assigned_to = COALESCE(?, assigned_to)
            WHERE id = ?
          `).run(
            status !== undefined ? status : null,
            sales_notes !== undefined ? sales_notes : null,
            assigned_to !== undefined ? assigned_to : null,
            req.params.id
          );

          const updated = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(req.params.id);
          res.json({ success: true, data: updated });
        } catch (err: any) {
          console.error("[Sales API] Error updating lead:", err);
          res.status(500).json({ success: false, error: err.message });
        }
      }
    );

    /**
     * DELETE /api/sales/potential-customers/:id
     * Delete lead (Spam cleanup or UU PDP Right to be forgotten)
     */
    salesRouter.delete(
      "/api/sales/potential-customers/:id",
      requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
      (req, res) => {
        try {
          db.prepare("DELETE FROM potential_customers WHERE id = ?").run(req.params.id);
          res.json({ success: true, message: "Data calon pelanggan berhasil dihapus." });
        } catch (err: any) {
          console.error("[Sales API] Error deleting lead:", err);
          res.status(500).json({ success: false, error: err.message });
        }
      }
    );

    /**
     * POST /api/sales/potential-customers/:id/convert-to-quotation
     * Creates customer and initial draft quotation from potential customer cart
     */
    salesRouter.post(
      "/api/sales/potential-customers/:id/convert-to-quotation",
      requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
      (req, res) => {
        try {
          const lead = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(req.params.id) as any;
          if (!lead) {
            return res.status(404).json({ success: false, error: "Lead not found" });
          }

          let cartItems: any[] = [];
          try {
            cartItems = lead.cart_snapshot ? JSON.parse(lead.cart_snapshot) : [];
          } catch {}

          const userEmail = ((req.headers["x-user-email"] || "SALES") as string);
          const nowIso = new Date().toISOString();

          // 1. Find or create customer
          let customer = db.prepare("SELECT * FROM customers WHERE (phone = ? AND phone IS NOT NULL) OR (email = ? AND email IS NOT NULL)").get(lead.phone, lead.email) as any;
          let customerId = customer?.id;

          if (!customer) {
            customerId = "CUS-" + crypto.randomUUID().substring(0, 8);
            const prefix = (lead.customer_name || "CUS").slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "CUS");
            const code = `${prefix}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
            db.prepare(`
              INSERT INTO customers (id, code, name, contact_person, email, phone, address)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              customerId,
              code,
              lead.company || lead.customer_name,
              lead.customer_name,
              lead.email || null,
              lead.phone || null,
              "Dari Storefront Lead"
            );
          }

          // 2. Create Quotation
          const quotationId = "QUO-" + crypto.randomUUID().substring(0, 8);
          const year = new Date().getFullYear();
          const count = ((db.prepare("SELECT COUNT(*) as cnt FROM quotations").get() as any)?.cnt || 0) + 1;
          const quotationNumber = `Q-${year}-${String(count).padStart(4, "0")}`;

          let totalVal = 0;
          for (const item of cartItems) {
            totalVal += (Number(item.price) || 0) * (Number(item.qty) || 1);
          }

          db.prepare(`
            INSERT INTO quotations (
              id, quotation_number, customer_id, title, valid_until, status,
              tax_rate, discount_rate, payment_terms, payment_method, notes,
              created_by, created_at, dpp, dpp_nilai_lain, tax_scheme
            ) VALUES (
              ?, ?, ?, ?, ?, 'DRAFT', 11, 0, '14 Hari', 'Transfer Bank',
              ?, ?, ?, ?, 0, 'REGULAR_11'
            )
          `).run(
            quotationId,
            quotationNumber,
            customerId,
            `Penawaran Prospek Online: ${lead.customer_name}`,
            new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
            `Dikonversi dari prospek online shop (Skor Potensi: ${lead.potential_score || 50}/100, Persona: ${lead.persona_tag || 'Unverified'}). Catatan AI: ${lead.scout_recommendations || 'Follow-up standar.'}`,
            userEmail,
            nowIso,
            totalVal
          );

          // Insert quotation items
          const qiStmt = db.prepare(`
            INSERT INTO quotation_items (
              id, quotation_id, title, description, qty, uom, unit_price, cost_price
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          let idx = 1;
          for (const item of cartItems) {
            qiStmt.run(
              `QI-${quotationId}-${idx++}`,
              quotationId,
              item.name,
              `Kode: ${item.item_code || "-"}`,
              item.qty || 1,
              item.uom || "Unit",
              item.price || 0,
              (item.price || 0) * 0.75
            );
          }

          // Update lead status to CONVERTED
          db.prepare(`
            UPDATE potential_customers
            SET status = 'CONVERTED',
                last_active_at = ?
            WHERE id = ?
          `).run(nowIso, lead.id);

          res.json({
            success: true,
            message: `Berhasil membuat Surat Penawaran ${quotationNumber}`,
            data: {
              quotation_id: quotationId,
              quotation_number: quotationNumber,
              customer_id: customerId,
            },
          });
        } catch (err: any) {
          console.error("[Sales API] Error converting to quotation:", err);
          res.status(500).json({ success: false, error: err.message });
        }
      }
    );

    salesRouter.get(
      ["/api/sales/customers", "/api/customers"],
      requireRole(["WAREHOUSE", "FC", "SALES", "ENGINEERING"]),
      (req, res) => {
        try {
          const cacheKey = "customers:overview_list";
          const cached = cacheService.get<any[]>(cacheKey);
          if (cached) {
            return res.json(cached);
          }

          const customers = db
            .prepare(
              `
        SELECT c.*,
          (SELECT COUNT(*) FROM delivery_notes dn WHERE dn.customer_id = c.id) as total_deliveries,
          (SELECT COUNT(*) FROM delivery_notes dn WHERE dn.customer_id = c.id AND dn.status = 'DELIVERED') as delivered_count,
          (SELECT COUNT(*) FROM delivery_notes dn WHERE dn.customer_id = c.id AND dn.status != 'DELIVERED') as pending_count,
          (SELECT COUNT(*) FROM quotations q WHERE q.archived_at IS NULL AND q.customer_id = c.id) as total_quotations,
          (SELECT COALESCE(SUM((SELECT COALESCE(SUM(qty * unit_price), 0) * (1 - COALESCE(q.discount_rate, 0) / 100) FROM quotation_items qi WHERE qi.quotation_id = q.id)), 0) FROM quotations q WHERE q.archived_at IS NULL AND q.customer_id = c.id AND q.status = 'APPROVED') as total_quotation_value,
          (SELECT COUNT(*) FROM quotations q WHERE q.archived_at IS NULL AND q.customer_id = c.id AND q.status = 'PENDING') as pending_quotations_count
        FROM customers c WHERE c.archived_at IS NULL
        ORDER BY c.created_at DESC
      `,
            )
            .all();

          cacheService.set(cacheKey, customers, 180, "customers");
          res.json(customers);
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to fetch customers" });
        }
      },
    );

    salesRouter.get(
      "/api/sales/customers/:id/details",
      requireRole(["WAREHOUSE", "FC", "SALES", "ENGINEERING"]),
      (req, res) => {
        try {
          const { id } = req.params;
          const customer = db
            .prepare("SELECT * FROM customers WHERE id = ? AND archived_at IS NULL")
            .get(id) as any;

          if (!customer) {
            return res.status(404).json({ error: "Customer not found" });
          }

          // Fetch all quotations for this customer
          const quotations = db
            .prepare(
              `SELECT q.*, c.name as customer_name 
               FROM quotations q 
               LEFT JOIN customers c ON q.customer_id = c.id 
               WHERE q.archived_at IS NULL AND q.customer_id = ?
               ORDER BY q.created_at DESC`
            )
            .all(id) as any[];

          const processedQuotations = quotations.map((q) => {
            q.items = db
              .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
              .all(q.id);
            return q;
          });

          // Fetch delivery notes
          const deliveries = db
            .prepare(
              `SELECT * FROM delivery_notes WHERE customer_id = ? ORDER BY created_at DESC`
            )
            .all(id);

          // Fetch commercial invoices
          const invoices = db
            .prepare(
              `SELECT * FROM commercial_invoices WHERE customer_id = ? ORDER BY created_at DESC`
            )
            .all(id);

          // Fetch projects
          const projects = db
            .prepare(
              `SELECT p.* FROM projects p 
               JOIN quotations q ON p.quotation_id = q.id 
               WHERE q.customer_id = ? ORDER BY p.created_at DESC`
            )
            .all(id);

          res.json({
            success: true,
            customer,
            quotations: processedQuotations,
            deliveries,
            invoices,
            projects,
          });
        } catch (err: any) {
          console.error(err);
          res.status(500).json({ error: "Failed to fetch customer details", details: err.message });
        }
      }
    );

    salesRouter.get(
      "/api/sales/customers/:id/quotations",
      requireRole(["WAREHOUSE", "FC", "SALES", "ENGINEERING"]),
      (req, res) => {
        try {
          const { id } = req.params;
          const quotations = db
            .prepare(
              `SELECT q.*, c.name as customer_name 
               FROM quotations q 
               LEFT JOIN customers c ON q.customer_id = c.id 
               WHERE q.archived_at IS NULL AND q.customer_id = ?
               ORDER BY q.created_at DESC`
            )
            .all(id) as any[];

          const processedQuotations = quotations.map((q) => {
            q.items = db
              .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
              .all(q.id);
            return q;
          });

          res.json({ success: true, data: processedQuotations });
        } catch (err: any) {
          console.error(err);
          res.status(500).json({ error: "Failed to fetch customer quotations", details: err.message });
        }
      }
    );

    salesRouter.post(
      ["/api/sales/customers", "/api/customers"],
      requireRole(["FC", "SALES"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (
          userRole !== "FC" &&
          (userRole !== "SALES" || userLevel !== "MANAGER")
        ) {
          return res
            .status(403)
            .json({
              error:
                "Access denied. Only FC or Sales Manager can manage customers.",
            });
        }
        try {
          const { code, name, contact_person, email, phone, address, npwp } = req.body;
          const id = "CUS-" + crypto.randomUUID();
          db.prepare(
            "INSERT INTO customers (id, code, name, contact_person, email, phone, address, npwp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          ).run(
            id,
            code || `C-${Math.floor(Math.random() * 10000)}`,
            name,
            contact_person || null,
            email || null,
            phone || null,
            address || null,
            npwp || null,
          );
          
          syncCollectionToFirestore("customers", id, {
            id,
            code: code || `C-${Math.floor(Math.random() * 10000)}`,
            name,
            contact_person: contact_person || null,
            email: email || null,
            phone: phone || null,
            address: address || null,
            npwp: npwp || null,
          });

          cacheService.invalidateNamespace("customers");
          outboxService.enqueue(
            db,
            "CUSTOMERS",
            id,
            "CREATE",
            { id, code, name, contact_person, email, phone, address, created_at: new Date().toISOString() },
            "BOTH"
          );

          res.json({ success: true, id });
        } catch (err: any) {
          if (err.message?.includes("UNIQUE")) {
            return res
              .status(400)
              .json({ error: "Customer code must be unique" });
          }
          res.status(500).json({ error: "Failed to create customer" });
        }
      },
    );

    salesRouter.put(
      "/api/sales/customers/:id",
      requireRole(["FC", "SALES"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (
          userRole !== "FC" &&
          (userRole !== "SALES" || userLevel !== "MANAGER")
        ) {
          return res
            .status(403)
            .json({
              error:
                "Access denied. Only FC or Sales Manager can manage customers.",
            });
        }
        try {
          const { id } = req.params;
          const { code, name, contact_person, email, phone, address, npwp } = req.body;
          db.prepare(
            "UPDATE customers SET code = ?, name = ?, contact_person = ?, email = ?, phone = ?, address = ?, npwp = ? WHERE id = ?",
          ).run(code, name, contact_person || null, email || null, phone || null, address || null, npwp || null, id);
          cacheService.invalidateNamespace("customers");
          res.json({ success: true });
        } catch (err: any) {
          if (err.message?.includes("UNIQUE")) {
            return res
              .status(400)
              .json({ error: "Customer code must be unique" });
          }
          res.status(500).json({ error: "Failed to update customer" });
        }
      },
    );

    salesRouter.delete(
      "/api/sales/customers/:id",
      requireRole(["FC", "SALES"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (
          userRole !== "FC" &&
          (userRole !== "SALES" || userLevel !== "MANAGER")
        ) {
          return res
            .status(403)
            .json({
              error:
                "Access denied. Only FC or Sales Manager can manage customers.",
            });
        }
        try {
          const { id } = req.params;

          const dnCount = db
            .prepare(
              "SELECT COUNT(*) as count FROM delivery_notes WHERE customer_id = ?",
            )
            .get(id) as any;
          if (dnCount && dnCount.count > 0) {
            return res.status(400).json({
              error: "Cannot delete customer. Active delivery records exist.",
            });
          }

          const quoCount = db
            .prepare(
              "SELECT COUNT(*) as count FROM quotations WHERE customer_id = ?",
            )
            .get(id) as any;
          if (quoCount && quoCount.count > 0) {
            return res.status(400).json({
              error: "Cannot delete customer. Active quotation records exist.",
            });
          }

          const invCount = db
            .prepare(
              "SELECT COUNT(*) as count FROM commercial_invoices WHERE customer_id = ?",
            )
            .get(id) as any;
          if (invCount && invCount.count > 0) {
            return res.status(400).json({
              error:
                "Cannot delete customer. Active commercial invoices exist.",
            });
          }

          db.prepare(
            "UPDATE customers SET archived_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(id);
          cacheService.invalidateNamespace("customers");
          res.json({ success: true });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to delete customer" });
        }
      },
    );

    // Quotation Modul Endpoints

    salesRouter.get(["/api/quotations", "/api/sales/quotations"], (req, res) => {
      try {
        const quotations = db
          .prepare(
            `
        SELECT q.*, 
          c.name as customer_name, c.npwp as customer_npwp, c.phone as customer_phone, c.email as customer_email,
          COALESCE(NULLIF(q.customer_name_manual, ''), c.name, 'Pelanggan Umum (Walk-in)') as display_customer_name,
          COALESCE(NULLIF(q.customer_phone_manual, ''), c.phone, '-') as display_customer_phone,
          (SELECT COALESCE(SUM(qty * unit_price), 0) * (1 - COALESCE(q.discount_rate, 0) / 100) FROM quotation_items qi WHERE qi.quotation_id = q.id) as net_amount
        FROM quotations q 
        LEFT JOIN customers c ON q.customer_id = c.id 
        WHERE q.archived_at IS NULL
        ORDER BY q.created_at DESC
      `,
          )
          .all() as any[];

        const now = new Date();
        const processedQuotations = quotations.map((q) => {
          // Any status other than PROCESSED or EXPIRED should be checked for auto-expiration
          if (q.status === "APPROVED" || q.status === "PENDING") {
            const createdDate = new Date(q.created_at);
            const diffTime = Math.abs(now.getTime() - createdDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > (q.validity_days || 20)) {
              q.status = "EXPIRED";
              db.prepare(
                "UPDATE quotations SET status = 'EXPIRED' WHERE id = ?",
              ).run(q.id);
            }
          }

          // Fetch items for each quotation
          q.items = db
            .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
            .all(q.id);
          return q;
        });

        res.json({ success: true, data: processedQuotations });
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({ error: "Failed to fetch quotations", details: err.message });
      }
    });

    salesRouter.post(
      ["/api/quotations", "/api/sales/quotations"],
      requireRole(["FC", "SALES", "ENGINEERING", "DIRECTOR", "ADMIN", "SUPERADMIN", "BOD"]),
      (req, res) => {
        console.log("QUOTATION_DEBUG:", JSON.stringify(req.body));
        const userRole = ((req as any).userRole || "").toString().toUpperCase();
        const userEmail = ((req.headers["x-user-email"] || req.headers["remote-user"] || req.headers["x-forwarded-user"] || "") as string).toLowerCase();
        const GOD_ROLES = ["FC", "BOD", "DIRECTOR", "SYSTEM_ADMIN", "SUPERADMIN", "ADMIN"];
        const isGod = GOD_ROLES.includes(userRole);
        const isSales = userRole.includes("SALES");
        const isEngineering = userRole.includes("ENGINEERING");
        const isExecutive = !userEmail || userEmail === "eghy" || userEmail === "ludy" || userEmail === "admin" || userEmail.includes("@");

        if (!isGod && !isSales && !isEngineering && !isExecutive) {
          return res.status(403).json({
            error:
              "Access denied. Only Sales, Engineering, or Management accounts can create Quotations.",
          });
        }
        try {
          const { customer_id, title, amount, validity_days, remarks, items } =
            req.body;
          if (
            !customer_id ||
            !title ||
            !items ||
            !Array.isArray(items) ||
            items.length === 0
          ) {
            console.log("QUOTATION_DEBUG_ERROR: Missing fields", req.body);
            return res.status(400).json({
              error:
                "Missing required fields: customer_id, title, and items are required",
            });
          }

          const id =
            "QUO-" + Math.random().toString(36).substr(2, 6).toUpperCase();
          const dParts = new Date().toISOString().split("T")[0].split("-");
          const quotation_number = `QUO/${dParts[0]}/${Math.floor(
            Math.random() * 1000,
          )
            .toString()
            .padStart(3, "0")}/${id.substring(4, 6)}`;

          const newStatus =
            req.body.status && ["DRAFT", "PENDING"].includes(req.body.status)
              ? req.body.status
              : "PENDING";

          const discountRateVal = Number(req.body.discount_rate) || 0;
          const taxRateVal = Number(req.body.tax_rate) || 0;
          const pphRateVal = Number(req.body.pph_rate) || 0;
          const taxSchemeVal = req.body.tax_scheme || (taxRateVal > 0 ? "DPP_NILAI_LAIN" : "NON_PKP");
          const paymentTermsVal = req.body.payment_terms || req.body.payment_method || "Net 30 Days";

          const breakdown = calculateFinancialBreakdown({
            items: items.map((it: any) => ({
              qty: Number(it.qty || it.quantity || 1),
              unit_price: Number(it.unit_price || it.price || 0),
            })),
            discountRate: discountRateVal,
            taxRate: taxRateVal,
            pphRate: pphRateVal,
            taxScheme: taxSchemeVal,
            roundingFactor: Number(req.body.rounding_factor) || 0,
          });

          const salesChannelVal = req.body.sales_channel || "B2B_PROJECT";
          const settlementTypeVal = req.body.settlement_type || (salesChannelVal === "DIRECT_RETAIL" ? "IMMEDIATE" : "CREDIT_TERM");
          const receiptNumberVal = req.body.receipt_number || null;
          const customerNameManual = req.body.customer_name_manual || null;
          const customerPhoneManual = req.body.customer_phone_manual || null;
          const paymentRefVal = req.body.payment_reference || null;
          const cashTenderedVal = Number(req.body.cash_tendered) || 0;
          const changeDueVal = Number(req.body.change_due) || 0;
          const paidAtVal = req.body.paid_at || (settlementTypeVal === "IMMEDIATE" ? new Date().toISOString() : null);

          const transaction = db.transaction(() => {
            // Insert Quotation with requested status (defaults to PENDING)
            db.prepare(
              `
          INSERT INTO quotations (
            id, quotation_number, customer_id, title, amount, validity_days, remarks, status,
            tax_rate, discount_rate, npwp_tax_id, pph_rate, dpp, dpp_nilai_lain, tax_scheme,
            payment_terms, payment_method, rounding_factor, grand_total,
            sales_channel, settlement_type, receipt_number, customer_name_manual,
            customer_phone_manual, payment_reference, cash_tendered, change_due, paid_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
            ).run(
              id,
              quotation_number,
              customer_id,
              title,
              breakdown.dpp,
              validity_days ? Number(validity_days) : 20,
              remarks || null,
              newStatus,
              taxRateVal,
              discountRateVal,
              req.body.npwp_tax_id || null,
              pphRateVal,
              breakdown.dpp,
              breakdown.dppNilaiLain,
              taxSchemeVal,
              paymentTermsVal,
              paymentTermsVal,
              breakdown.roundingFactor,
              breakdown.grandTotal,
              salesChannelVal,
              settlementTypeVal,
              receiptNumberVal,
              customerNameManual,
              customerPhoneManual,
              paymentRefVal,
              cashTenderedVal,
              changeDueVal,
              paidAtVal,
            );

            // Insert items
            const itemStmt = db.prepare(`
          INSERT INTO quotation_items (id, quotation_id, title, qty, uom, unit_price, item_id, barcode, discount_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
            for (const item of items) {
              const itemId =
                "QI-" + Math.random().toString(36).substr(2, 6).toUpperCase();
              const itemTitle = item.title || item.item_name || item.name || "Commercial Item";
              const itemQty = Number(item.qty || item.quantity || 1);
              const itemUom = item.uom || "Unit";
              const itemUnitPrice = Number(item.unit_price || item.price || 0);

              itemStmt.run(
                itemId,
                id,
                itemTitle,
                itemQty,
                itemUom,
                itemUnitPrice,
                item.item_id || null,
                item.barcode || null,
                Number(item.discount_amount) || 0,
              );
              
              syncCollectionToFirestore("quotation_items", itemId, {
                id: itemId,
                quotation_id: id,
                title: itemTitle,
                qty: itemQty,
                uom: itemUom,
                unit_price: itemUnitPrice
              });
            }
          });
          transaction();
          
          syncCollectionToFirestore("quotations", id, {
            id,
            quotation_number,
            customer_id,
            title,
            amount: breakdown.dpp,
            validity_days: validity_days ? Number(validity_days) : 20,
            remarks: remarks || null,
            status: newStatus,
            tax_rate: taxRateVal,
            discount_rate: discountRateVal,
            npwp_tax_id: req.body.npwp_tax_id || null,
            pph_rate: pphRateVal,
            dpp: breakdown.dpp,
            dpp_nilai_lain: breakdown.dppNilaiLain,
            tax_scheme: taxSchemeVal,
            payment_terms: paymentTermsVal,
            payment_method: paymentTermsVal,
            rounding_factor: breakdown.roundingFactor,
            grand_total: breakdown.grandTotal,
            sales_channel: salesChannelVal,
            settlement_type: settlementTypeVal,
            receipt_number: receiptNumberVal,
            created_at: new Date().toISOString()
          });

          // Fetch the full newly created quotation for the frontend preview
          const fullQuotation = db
            .prepare(
              `
        SELECT q.*, c.name as customer_name,
          COALESCE(NULLIF(q.customer_name_manual, ''), c.name, 'Pelanggan Umum (Walk-in)') as display_customer_name
        FROM quotations q
        LEFT JOIN customers c ON q.customer_id = c.id
        WHERE q.id = ?
      `,
            )
            .get(id) as any;

          if (fullQuotation) {
            fullQuotation.items = db
              .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
              .all(id);
          }

          logAudit(
            (req.headers["x-user-email"] as string) || null,
            "CREATE_QUOTATION",
            "QUOTATION",
            id,
            `Created quotation ${quotation_number}`,
          );
          res.json({
            success: true,
            data: fullQuotation || { id, quotation_number },
          });
        } catch (err: any) {
          console.error(err);
          res.status(500).json({
            error: "Failed to create quotation",
            details: err.message,
          });
        }
      },
    );

    // ==========================================
    // UNIFIED ADAPTIVE ENGINE: RETAIL & B2C QUICK SETTLE
    // ==========================================
    salesRouter.post(
      "/api/sales/orders/quick-settle",
      requireRole(["FC", "SALES", "ENGINEERING", "DIRECTOR", "ADMIN", "SUPERADMIN", "BOD", "WAREHOUSE"]),
      (req, res) => {
        try {
          const {
            customer_id = "CUS-WALKIN",
            customer_name_manual,
            customer_phone_manual,
            title = "Penjualan Langsung / Retail Kasir",
            payment_method = "CASH",
            payment_reference,
            cash_tendered = 0,
            discount_rate = 0,
            tax_rate = 0,
            pph_rate = 0,
            tax_scheme = "NON_PKP",
            remarks,
            items,
          } = req.body;

          if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "Daftar barang penjualan tidak boleh kosong" });
          }

          const userEmail = ((req.headers["x-user-email"] || req.headers["remote-user"] || "KASIR") as string);
          const nowIso = new Date().toISOString();
          const dParts = nowIso.split("T")[0].split("-");
          const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();

          // Generated Numbers
          const quotationId = "QUO-RTL-" + crypto.randomUUID().substring(0, 8).toUpperCase();
          const quotationNumber = `QUO/RTL/${dParts[0]}/${dParts[1]}/${randomSuffix}`;
          const receiptNumber = `RCP/${dParts[0]}${dParts[1]}/${randomSuffix}`;
          const dnId = "DN-RTL-" + crypto.randomUUID().substring(0, 8).toUpperCase();
          const dnNumber = `DN/RTL/${dParts[0]}${dParts[1]}/${randomSuffix}`;
          const ciId = "INV-RTL-" + crypto.randomUUID().substring(0, 8).toUpperCase();
          const ciNumber = `INV/RTL/${dParts[0]}${dParts[1]}/${randomSuffix}`;

          // Calculate Financials via Central Financial Precision Engine
          const breakdown = calculateFinancialBreakdown({
            items: items.map((it: any) => ({
              qty: Number(it.qty || 1),
              unit_price: Number(it.unit_price || 0),
            })),
            discountRate: Number(discount_rate) || 0,
            taxRate: Number(tax_rate) || 0,
            pphRate: Number(pph_rate) || 0,
            taxScheme: tax_scheme,
            roundingFactor: 0,
          });

          const effectiveCashTendered = payment_method === "CASH" 
            ? Math.max(breakdown.grandTotal, Number(cash_tendered) || breakdown.grandTotal)
            : breakdown.grandTotal;
          const effectiveChangeDue = payment_method === "CASH"
            ? Math.max(0, effectiveCashTendered - breakdown.grandTotal)
            : 0;

          const transaction = db.transaction(() => {
            // 1. Insert Quotation directly as APPROVED & PAID
            db.prepare(`
              INSERT INTO quotations (
                id, quotation_number, customer_id, title, amount, validity_days, remarks,
                status, tax_rate, discount_rate, pph_rate, dpp, dpp_nilai_lain, tax_scheme,
                payment_terms, payment_method, rounding_factor, grand_total,
                sales_channel, settlement_type, receipt_number,
                customer_name_manual, customer_phone_manual, payment_reference,
                cash_tendered, change_due, paid_at, created_at
              ) VALUES (?, ?, ?, ?, ?, 30, ?, 'APPROVED', ?, ?, ?, ?, ?, ?, 'Tunai / Lunas', ?, ?, ?, 'DIRECT_RETAIL', 'IMMEDIATE', ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              quotationId,
              quotationNumber,
              customer_id,
              title,
              breakdown.dpp,
              remarks || 'Transaksi Penjualan Ritel Langsung (POS/Kasir)',
              Number(tax_rate) || 0,
              Number(discount_rate) || 0,
              Number(pph_rate) || 0,
              breakdown.dpp,
              breakdown.dppNilaiLain,
              tax_scheme,
              payment_method,
              breakdown.roundingFactor,
              breakdown.grandTotal,
              receiptNumber,
              customer_name_manual || null,
              customer_phone_manual || null,
              payment_reference || null,
              effectiveCashTendered,
              effectiveChangeDue,
              nowIso,
              nowIso
            );

            // 2. Insert Quotation Items & Auto-Deduct Inventory
            const itemStmt = db.prepare(`
              INSERT INTO quotation_items (id, quotation_id, title, qty, uom, unit_price, item_id, barcode, discount_amount)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const it of items) {
              const qiId = "QI-" + crypto.randomUUID().substring(0, 8).toUpperCase();
              const qtyVal = Number(it.qty || 1);
              const priceVal = Number(it.unit_price || 0);

              itemStmt.run(
                qiId,
                quotationId,
                it.title || "Item Retail",
                qtyVal,
                it.uom || "PCS",
                priceVal,
                it.item_id || null,
                it.barcode || null,
                Number(it.discount_amount) || 0
              );

              // Stock deduction & movement if linked to stock catalog
              if (it.item_id) {
                db.prepare(`
                  UPDATE inventory
                  SET physical_qty = MAX(0, COALESCE(physical_qty, 0) - ?),
                      available_qty = MAX(0, COALESCE(available_qty, 0) - ?),
                      free_stock = MAX(0, COALESCE(free_stock, 0) - ?)
                  WHERE item_id = ?
                `).run(qtyVal, qtyVal, qtyVal, it.item_id);

                db.prepare(`
                  INSERT INTO stock_movements (id, item_id, type, qty, reference_id, recorded_by, created_at)
                  VALUES (?, ?, 'CONSUMPTION', ?, ?, ?, ?)
                `).run(
                  "SM-" + crypto.randomUUID().substring(0, 8),
                  it.item_id,
                  qtyVal,
                  receiptNumber,
                  userEmail,
                  nowIso
                );
              }
            }

            // 3. Instant Delivery Note (Delivered On The Spot / Carryout)
            db.prepare(`
              INSERT INTO delivery_notes (
                id, dn_number, customer_id, status, authorized_by, shipped_at, delivered_at, remarks, created_at
              ) VALUES (?, ?, ?, 'DELIVERED', ?, ?, ?, 'Serah terima langsung kasir / Direct carry-out', ?)
            `).run(dnId, dnNumber, customer_id, userEmail, nowIso, nowIso, nowIso);

            for (const it of items) {
              if (it.item_id) {
                db.prepare(`
                  INSERT INTO delivery_items (id, dn_id, item_id, qty, uom, remarks)
                  VALUES (?, ?, ?, ?, ?, 'Retail hand-over')
                `).run(
                  "DNI-" + crypto.randomUUID().substring(0, 8),
                  dnId,
                  it.item_id,
                  Number(it.qty || 1),
                  it.uom || "PCS"
                );
              }
            }

            // 4. Instant Commercial Invoice (Status: PAID)
            db.prepare(`
              INSERT INTO commercial_invoices (
                id, ci_number, dn_id, customer_id, amount, status, created_at, paid_at,
                sales_channel, receipt_number, payment_method, payment_reference, is_direct_settled
              ) VALUES (?, ?, ?, ?, ?, 'PAID', ?, ?, 'DIRECT_RETAIL', ?, ?, ?, 1)
            `).run(
              ciId,
              ciNumber,
              dnId,
              customer_id,
              breakdown.grandTotal,
              nowIso,
              nowIso,
              receiptNumber,
              payment_method,
              payment_reference || null
            );

            // 5. Automatic Double-Entry Ledger Posting
            try {
              const ppnAmt = breakdown.ppnAmount || 0;
              const revenueDpp = breakdown.dpp || breakdown.grandTotal;

              const journalLines = [
                {
                  account_code: payment_method === "TRANSFER" ? "1102" : "1101",
                  account_name: payment_method === "TRANSFER" ? "Bank Utama (Penjualan Retail)" : "Kas Kasir / Retail (Penjualan Tunai)",
                  debit: breakdown.grandTotal,
                  credit: 0,
                  memo: `Penerimaan Kas No. Struk: ${receiptNumber}`
                },
                {
                  account_code: "4101",
                  account_name: "Pendapatan Penjualan Ritel / Direct Sales",
                  debit: 0,
                  credit: revenueDpp,
                  memo: `DPP Penjualan Ritel ${receiptNumber}`
                }
              ];

              if (ppnAmt > 0) {
                journalLines.push({
                  account_code: "2150",
                  account_name: "Hutang PPN Keluaran",
                  debit: 0,
                  credit: ppnAmt,
                  memo: `PPN Penjualan Ritel ${receiptNumber}`
                });
              }

              postJournalEntry(db, {
                reference_type: "INVOICE_PAYMENT",
                reference_id: ciId,
                reference_number: receiptNumber,
                description: `Penerimaan Kas & Penyerahan Barang Ritel (${receiptNumber})`,
                entry_date: nowIso,
                lines: journalLines,
                created_by: userEmail
              });
            } catch (jErr) {
              console.warn("Accounting journal posting skipped or warning:", jErr);
            }

            // Sync to Firebase
            syncCollectionToFirestore("quotations", quotationId, {
              id: quotationId,
              quotation_number: quotationNumber,
              customer_id,
              receipt_number: receiptNumber,
              status: 'APPROVED',
              grand_total: breakdown.grandTotal,
              sales_channel: 'DIRECT_RETAIL',
              paid_at: nowIso
            });
          });

          transaction();

          logAudit(userEmail, "QUICK_RETAIL_SALE", "QUOTATION", quotationId, `Direct retail sale ${receiptNumber} IDR ${breakdown.grandTotal}`);

          res.json({
            success: true,
            data: {
              quotation_id: quotationId,
              quotation_number: quotationNumber,
              receipt_number: receiptNumber,
              ci_number: ciNumber,
              dn_number: dnNumber,
              grand_total: breakdown.grandTotal,
              payment_method,
              cash_tendered: effectiveCashTendered,
              change_due: effectiveChangeDue,
              paid_at: nowIso,
              customer_name: customer_name_manual || "Pelanggan Umum (Walk-in)"
            }
          });
        } catch (err: any) {
          console.error("QUICK_SETTLE_ERROR:", err);
          res.status(500).json({ error: "Gagal memproses transaksi retail", details: err.message });
        }
      }
    );

    // Endpoint to retrieve complete receipt details for thermal printing
    salesRouter.get("/api/sales/receipts/:id", (req, res) => {
      try {
        const { id } = req.params;
        const quotation = db.prepare(`
          SELECT q.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
          FROM quotations q
          LEFT JOIN customers c ON q.customer_id = c.id
          WHERE q.id = ? OR q.receipt_number = ? OR q.quotation_number = ?
        `).get(id, id, id) as any;

        if (!quotation) {
          return res.status(404).json({ error: "Sales receipt not found" });
        }

        quotation.items = db.prepare(`
          SELECT qi.*, i.item_code, COALESCE(qi.barcode, i.barcode, '') as item_barcode
          FROM quotation_items qi
          LEFT JOIN items i ON qi.item_id = i.id
          WHERE qi.quotation_id = ?
        `).all(quotation.id);

        res.json({ success: true, data: quotation });
      } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: "Failed to load receipt details", details: err.message });
      }
    });

    // Endpoint for instant catalog lookup in Sales Modal (filtered for Finished Goods or general catalog)
    salesRouter.get("/api/sales/retail-catalog", (req, res) => {
      try {
        const q = (req.query.q as string || "").trim();
        const typeFilter = (req.query.type as string || "").trim();
        let query = `
          SELECT i.id, i.item_code, i.name, i.uom, i.type,
                 COALESCE(i.unit_price, 0) as material_cost,
                 COALESCE(i.selling_price, i.unit_price, 0) as selling_price,
                 COALESCE(i.selling_price, i.unit_price, 0) as unit_price,
                 COALESCE(inv.physical_qty, 0) as physical_qty,
                 COALESCE(inv.available_qty, 0) as available_qty
          FROM items i
          LEFT JOIN inventory inv ON i.id = inv.item_id
          WHERE i.deleted_at IS NULL
        `;
        const params: any[] = [];
        if (typeFilter === "FINISHED") {
          query += ` AND (i.type = 'FINISHED' OR i.type = 'FINISH_GOOD' OR i.type = 'FINISH_GOODS')`;
        } else if (typeFilter) {
          query += ` AND i.type = ?`;
          params.push(typeFilter);
        }
        if (q) {
          query += ` AND (i.name LIKE ? OR i.item_code LIKE ? OR COALESCE(i.barcode, '') LIKE ?)`;
          const wildcard = `%${q}%`;
          params.push(wildcard, wildcard, wildcard);
        }
        query += ` ORDER BY i.name ASC LIMIT 500`;

        const items = db.prepare(query).all(...params);
        res.json({ success: true, data: items });
      } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: "Failed to retrieve product catalog", details: err.message });
      }
    });

    salesRouter.post(
      "/api/quotations/:id/authorize",
      requireRole(["FC", "SALES", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN"]),
      (req, res) => {
        try {
          const params = req.params as any;
          const { id } = params;
          const { pin } = req.body;

          if (
            !pin ||
            !isValidDailyAuthKey(req.headers["x-user-email"] as string, pin)
          ) {
            return res.status(400).json({ error: "Invalid authorization PIN" });
          }

          const quotation = db
            .prepare("SELECT * FROM quotations WHERE id = ?")
            .get(id) as any;

          if (!quotation) {
            return res.status(404).json({ error: "Quotation not found" });
          }

          if (quotation.status !== "PENDING" && quotation.status !== "DRAFT") {
            return res
              .status(400)
              .json({ error: `Quotation is already in ${quotation.status} status` });
          }

          db.prepare(
            "UPDATE quotations SET status = 'APPROVED' WHERE id = ?",
          ).run(id);
          
          syncCollectionToFirestore("quotations", id, { id, status: 'APPROVED' });

          logAudit(
            (req.headers["x-user-email"] as string) || null,
            "AUTHORIZE_QUOTATION",
            "QUOTATION",
            id,
            `Authorized quotation ${quotation.quotation_number}`,
          );

          res.json({
            success: true,
            message: "Quotation authorized successfully",
          });
        } catch (err: any) {
          console.error(err);
          res
            .status(500)
            .json({
              error: "Failed to authorize quotation",
              details: err.message,
            });
        }
      },
    );

    salesRouter.put(
      "/api/quotations/:id",
      requireRole(["FC", "SALES", "ENGINEERING"]),
      (req, res) => {
        try {
          const params = req.params as any;
          const { id } = params;
          const {
            title,
            amount,
            validity_days,
            remarks,
            items,
            tax_rate,
            discount_rate,
            npwp_tax_id,
            pph_rate,
          } = req.body;

          if (
            !title ||
            !items ||
            !Array.isArray(items) ||
            items.length === 0
          ) {
            return res.status(400).json({ error: "Missing required fields: title and items are required" });
          }

          const quotation = db
            .prepare("SELECT * FROM quotations WHERE id = ?")
            .get(id) as any;

          if (!quotation) {
            return res.status(404).json({ error: "Quotation not found" });
          }

          if (quotation.status === "PROCESSED") {
            return res.status(400).json({ error: "Cannot delete a processed quotation as it is linked to active projects." });
          }

          db.transaction(() => {
            // Restore status to PENDING (or custom status) and clear revision_note
            const newStatus =
              req.body.status && ["DRAFT", "PENDING"].includes(req.body.status)
                ? req.body.status
                : "PENDING";
            const discountRateVal = Number(discount_rate) || 0;
            const taxRateVal = Number(tax_rate) || 0;
            const pphRateVal = Number(pph_rate) || 0;
            const taxSchemeVal = req.body.tax_scheme || (taxRateVal > 0 ? "DPP_NILAI_LAIN" : "NON_PKP");
            const paymentTermsVal = req.body.payment_terms || req.body.payment_method || quotation.payment_terms || "Net 30 Days";

            const breakdown = calculateFinancialBreakdown({
              items: (items || []).map((it: any) => ({
                qty: Number(it.qty || 1),
                unit_price: Number(it.unit_price || 0),
              })),
              discountRate: discountRateVal,
              taxRate: taxRateVal,
              pphRate: pphRateVal,
              taxScheme: taxSchemeVal,
              roundingFactor: Number(req.body.rounding_factor) || 0,
            });

            db.prepare(
              `
              UPDATE quotations 
              SET title = ?, amount = ?, validity_days = ?, remarks = ?, status = ?, revision_note = NULL,
                  tax_rate = ?, discount_rate = ?, npwp_tax_id = ?, pph_rate = ?,
                  dpp = ?, dpp_nilai_lain = ?, tax_scheme = ?, payment_terms = ?, payment_method = ?,
                  rounding_factor = ?, grand_total = ?
              WHERE id = ?
            `,
            ).run(
              title,
              breakdown.dpp,
              validity_days ? Number(validity_days) : 20,
              remarks || null,
              newStatus,
              taxRateVal,
              discountRateVal,
              npwp_tax_id || null,
              pphRateVal,
              breakdown.dpp,
              breakdown.dppNilaiLain,
              taxSchemeVal,
              paymentTermsVal,
              paymentTermsVal,
              breakdown.roundingFactor,
              breakdown.grandTotal,
              id,
            );

            // Delete old items
            db.prepare(
              "DELETE FROM quotation_items WHERE quotation_id = ?",
            ).run(id);

            // Insert new items
            const itemStmt = db.prepare(`
              INSERT INTO quotation_items (id, quotation_id, title, qty, uom, unit_price)
              VALUES (?, ?, ?, ?, ?, ?)
            `);
            for (const item of items) {
              const itemId =
                "QI-" + Math.random().toString(36).substr(2, 6).toUpperCase();
              const itemTitle = item.title || item.item_name || item.name || "Commercial Item";
              const itemQty = Number(item.qty || item.quantity || 1);
              const itemUom = item.uom || "Unit";
              const itemUnitPrice = Number(item.unit_price || item.price || 0);

              itemStmt.run(
                itemId,
                id,
                itemTitle,
                itemQty,
                itemUom,
                itemUnitPrice,
              );
            }
          })();

          logAudit(
            (req.headers["x-user-email"] as string) || null,
            "UPDATE_QUOTATION",
            "QUOTATION",
            id,
            `Revised quotation ${quotation.quotation_number}`,
          );

          res.json({
            success: true,
            message: "Quotation updated successfully",
          });
        } catch (err: any) {
          console.error(err);
          res
            .status(500)
            .json({
              error: "Failed to update quotation",
              details: err.message,
            });
        }
      },
    );

    salesRouter.delete(
      "/api/quotations/:id",
      requireRole(["FC", "SALES", "ENGINEERING"]),
      (req, res) => {
        try {
          const params = req.params as any;
          const { id } = params;

          const quotation = db
            .prepare("SELECT * FROM quotations WHERE id = ?")
            .get(id) as any;
          if (!quotation) {
            return res.status(404).json({ error: "Quotation not found" });
          }

          if (quotation.status === "PROCESSED") {
            return res.status(400).json({ error: "Cannot delete a processed quotation as it is linked to active projects." });
          }

          db.transaction(() => {
            db.prepare(
              "UPDATE spks SET quotation_id = NULL WHERE quotation_id = ?",
            ).run(id);
            db.prepare(
              "UPDATE ntps SET quotation_id = NULL WHERE quotation_id = ?",
            ).run(id);
            db.prepare(
              "UPDATE projects SET quotation_id = NULL WHERE quotation_id = ?",
            ).run(id);
            db.prepare(
              "DELETE FROM quotation_items WHERE quotation_id = ?",
            ).run(id);
            db.prepare(
              "UPDATE quotations SET archived_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(id);
          })();

          logAudit(
            (req.headers["x-user-email"] as string) || null,
            "DELETE_QUOTATION",
            "QUOTATION",
            id,
            `Deleted quotation ${quotation.quotation_number}`,
          );

          res.json({
            success: true,
            message: "Quotation deleted successfully",
          });
        } catch (err: any) {
          console.error(err);
          res
            .status(500)
            .json({
              error: "Failed to delete quotation",
              details: err.message,
            });
        }
      },
    );

    salesRouter.post("/api/quotations/:id/revise", requireRole(["FC"]), (req, res) => {
      try {
        const params = req.params as any;
        const { id } = params;
        const { pin, revision_note } = req.body;

        if (
          !pin ||
          !isValidDailyAuthKey(req.headers["x-user-email"] as string, pin)
        ) {
          return res.status(400).json({ error: "Invalid authorization PIN" });
        }
        if (!revision_note) {
          return res.status(400).json({ error: "Revision note is required" });
        }

        const quotation = db
          .prepare("SELECT * FROM quotations WHERE id = ?")
          .get(id) as any;

        if (!quotation) {
          return res.status(404).json({ error: "Quotation not found" });
        }

        db.prepare(
          "UPDATE quotations SET status = 'REVISION', revision_note = ? WHERE id = ?",
        ).run(revision_note, id);
        
        syncCollectionToFirestore("quotations", id, { id, status: 'REVISION', revision_note });

        logAudit(
          (req.headers["x-user-email"] as string) || null,
          "REVISE_QUOTATION",
          "QUOTATION",
          id,
          `Revise quotation ${quotation.quotation_number} with note: ${revision_note}`,
        );

        res.json({ success: true, message: "Quotation marked for revision" });
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({ error: "Failed to revise quotation", details: err.message });
      }
    });

    salesRouter.get("/api/spks", (req, res) => {
      try {
        const spks = db
          .prepare(
            `
        SELECT 
          s.*, 
          p.name as project_name, 
          q.quotation_number,
          (SELECT COUNT(*) FROM projects WHERE spk_id = s.id OR id = s.project_id) as project_count,
          (SELECT SUM(COALESCE(qty, 1)) FROM projects WHERE spk_id = s.id OR id = s.project_id) as total_qty,
          (SELECT GROUP_CONCAT(name, ', ') FROM projects WHERE spk_id = s.id OR id = s.project_id) as project_names,
          EXISTS(SELECT 1 FROM purchase_requests WHERE (spk_id = s.id OR project_id = s.project_id) AND status != 'CANCELLED') as has_pr
        FROM spks s
        LEFT JOIN projects p ON s.project_id = p.id
        LEFT JOIN quotations q ON s.quotation_id = q.id
        ORDER BY s.created_at DESC
      `,
          )
          .all();
        res.json({ success: true, data: spks });
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({ error: "Failed to fetch SPKs", details: err.message });
      }
    });

    salesRouter.get(
      "/api/sales/deliveries",
      requireRole(["WAREHOUSE", "FC", "SALES"]),
      (req, res) => {
        try {
          const { status } = req.query;
          let query = `
        SELECT dn.*, 
               c.name as customer_name, 
               q.quotation_number, 
               q.title as quotation_title,
               p.name as project_name,
               (SELECT GROUP_CONCAT(p2.id, ', ') FROM projects p2 WHERE (dn.quotation_id IS NOT NULL AND p2.quotation_id = dn.quotation_id) OR (dn.project_id IS NOT NULL AND p2.id = dn.project_id)) as project_ids,
               (SELECT GROUP_CONCAT(p2.name, ', ') FROM projects p2 WHERE (dn.quotation_id IS NOT NULL AND p2.quotation_id = dn.quotation_id) OR (dn.project_id IS NOT NULL AND p2.id = dn.project_id)) as project_names
        FROM delivery_notes dn
        LEFT JOIN customers c ON dn.customer_id = c.id
        LEFT JOIN quotations q ON dn.quotation_id = q.id
        LEFT JOIN projects p ON dn.project_id = p.id
      `;
          let data;
          if (status) {
            query += ` WHERE dn.status = ? ORDER BY dn.created_at DESC`;
            data = db.prepare(query).all(status);
          } else {
            query += ` ORDER BY dn.created_at DESC`;
            data = db.prepare(query).all();
          }
          res.json(data);
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to fetch delivery notes" });
        }
      },
    );

    salesRouter.post(
      "/api/sales/deliveries",
      requireRole(["FC", "SALES"]),
      (req, res) => {
        try {
          const { customer_id, quotation_id, project_id, remarks, items, police_number, delivery_type, is_partial } =
            req.body;
          if (
            !customer_id ||
            !items ||
            !Array.isArray(items) ||
            items.length === 0
          ) {
            return res.status(400).json({ error: "Missing customer or items" });
          }

          const isPartialDelivery = Boolean(is_partial || delivery_type === "PARTIAL");

          if (!isPartialDelivery) {
            if (quotation_id) {
              const q = db
                .prepare("SELECT * FROM quotations WHERE id = ?")
                .get(quotation_id) as any;
              const relatedProjects = db
                .prepare("SELECT * FROM projects WHERE quotation_id = ?")
                .all(quotation_id) as any[];

              if (relatedProjects.length > 0) {
                const unfinished = relatedProjects.filter(
                  (p) =>
                    p.status !== "FINISHED" &&
                    p.status !== "COMPLETED" &&
                    p.status !== "CLOSED",
                );
                if (unfinished.length > 0) {
                  const unfinishedList = unfinished
                    .map((p) => `'${p.name}' (${p.status})`)
                    .join(", ");
                  return res.status(400).json({
                    error: `Cannot issue Full Delivery Note: Quotation '${q?.quotation_number || quotation_id}' has unfinished project(s): ${unfinishedList}. You may issue a Partial Delivery Note instead if partial shipments are accepted.`,
                  });
                }
              }
            } else if (project_id) {
              const proj = db
                .prepare("SELECT * FROM projects WHERE id = ?")
                .get(project_id) as any;
              if (proj) {
                const isProjectFinished =
                  proj.status === "FINISHED" ||
                  proj.status === "COMPLETED" ||
                  proj.status === "CLOSED";
                if (!isProjectFinished) {
                  let quoItemCount = 0;
                  if (proj.quotation_id) {
                    const qCnt = db
                      .prepare(
                        "SELECT COUNT(*) as cnt FROM quotation_items WHERE quotation_id = ?",
                      )
                      .get(proj.quotation_id) as any;
                    quoItemCount = qCnt?.cnt || 0;
                  }
                  return res.status(400).json({
                    error: `Cannot issue Full Delivery Note: Project '${proj.name}' is currently in '${proj.status}' status. You may issue a Partial Delivery Note instead for completed lots.`,
                  });
                }
              }
            }
          }

          const dnId = "DN-" + crypto.randomUUID();
          const dnNumber = generateDNNumber();

          db.transaction(() => {
            db.prepare(
              "INSERT INTO delivery_notes (id, dn_number, customer_id, quotation_id, project_id, remarks, police_number, delivery_type, is_partial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ).run(
              dnId,
              dnNumber,
              customer_id,
              quotation_id || null,
              project_id || null,
              remarks || null,
              police_number || null,
              isPartialDelivery ? "PARTIAL" : "FULL",
              isPartialDelivery ? 1 : 0
            );

            const insertItem = db.prepare(
              "INSERT INTO delivery_items (id, dn_id, item_id, qty, uom, remarks) VALUES (?, ?, ?, ?, ?, ?)",
            );
            for (const item of items) {
              let targetItemId = item.item_id;
              const itemName = item.item_name || item.name || item.title || "Commercial Item";
              const itemQty = Number(item.qty_delivered || item.qty || item.quantity || 1);
              const itemUom = item.uom || "Unit";

              if (!targetItemId) {
                targetItemId = "ITM-FG-" + crypto.randomUUID().substring(0, 8);
                db.prepare(
                  "INSERT OR IGNORE INTO items (id, item_code, name, uom, type, unit_price, selling_price) VALUES (?, ?, ?, ?, 'FINISHED', 0, 0)",
                ).run(
                  targetItemId,
                  item.item_code || `FG-${targetItemId}`,
                  itemName,
                  itemUom,
                );
                db.prepare("INSERT OR IGNORE INTO inventory (item_id, physical_qty, available_qty, free_stock) VALUES (?, 0, 0, 0)").run(targetItemId);
              } else {
                const existingItem = db
                  .prepare("SELECT id, name FROM items WHERE id = ?")
                  .get(targetItemId) as any;
                if (!existingItem) {
                  db.prepare(
                    "INSERT INTO items (id, item_code, name, uom, type, unit_price, selling_price) VALUES (?, ?, ?, ?, 'FINISHED', 0, 0)",
                  ).run(
                    targetItemId,
                    item.item_code || `FG-${targetItemId}`,
                    itemName,
                    itemUom,
                  );
                  db.prepare("INSERT OR IGNORE INTO inventory (item_id, physical_qty, available_qty, free_stock) VALUES (?, 0, 0, 0)").run(targetItemId);
                } else if (itemName && (existingItem.name === "Commercial Item" || existingItem.name !== itemName)) {
                  db.prepare("UPDATE items SET name = ?, uom = ? WHERE id = ?").run(
                    itemName,
                    itemUom,
                    targetItemId,
                  );
                }
              }

              insertItem.run(
                "DNI-" + crypto.randomUUID(),
                dnId,
                targetItemId,
                itemQty,
                itemUom,
                item.remarks || null,
              );
            }
          })();

          try {
            const dnRow = db.prepare("SELECT * FROM delivery_notes WHERE id = ?").get(dnId) as any;
            if (dnRow) {
              syncCollectionToFirestore("delivery_notes", dnId, dnRow);
            }
            const dnItemRows = db.prepare("SELECT * FROM delivery_items WHERE dn_id = ?").all(dnId) as any[];
            for (const di of dnItemRows) {
              syncCollectionToFirestore("delivery_items", di.id, di);
            }
          } catch (syncErr) {
            console.error("Firestore sync error for Delivery Note:", syncErr);
          }

          res.json({ success: true, id: dnId });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to create Delivery Note" });
        }
      },
    );

    function batchGetDeliveryNoteItemsWithPrices(dnIds: string[]): Map<string, any[]> {
      const resultMap = new Map<string, any[]>();
      try {
        if (!dnIds || dnIds.length === 0) return resultMap;
        const uniqueDnIds = Array.from(new Set(dnIds.filter(Boolean)));
        if (uniqueDnIds.length === 0) return resultMap;

        const dnPlaceholders = uniqueDnIds.map(() => "?").join(",");

        // 1. Batch query Delivery Notes
        const dns = db
          .prepare(
            `
          SELECT dn.*, p.quotation_id as p_quotation_id 
          FROM delivery_notes dn 
          LEFT JOIN projects p ON dn.project_id = p.id 
          WHERE dn.id IN (${dnPlaceholders})
        `,
          )
          .all(...uniqueDnIds) as any[];

        const dnMap = new Map<string, any>();
        const allQuoIds = new Set<string>();
        const allProjIds = new Set<string>();

        for (const dn of dns) {
          dnMap.set(dn.id, dn);
          const qId = dn.quotation_id || dn.p_quotation_id;
          if (qId) allQuoIds.add(qId);
          if (dn.project_id) allProjIds.add(dn.project_id);
        }

        // 2. Batch query Quotations & Quotation Items
        const quoMap = new Map<string, any>();
        const qiMap = new Map<string, any[]>();
        if (allQuoIds.size > 0) {
          const quoIdsArr = Array.from(allQuoIds);
          const quoPlaceholders = quoIdsArr.map(() => "?").join(",");
          const quots = db.prepare(`SELECT * FROM quotations WHERE id IN (${quoPlaceholders})`).all(...quoIdsArr) as any[];
          for (const q of quots) quoMap.set(q.id, q);

          const qis = db.prepare(`SELECT * FROM quotation_items WHERE quotation_id IN (${quoPlaceholders})`).all(...quoIdsArr) as any[];
          for (const qi of qis) {
            if (!qiMap.has(qi.quotation_id)) qiMap.set(qi.quotation_id, []);
            qiMap.get(qi.quotation_id)!.push(qi);
          }
        }

        // 3. Batch query Related Projects
        const projectsByQuo = new Map<string, any[]>();
        const projectsById = new Map<string, any>();
        const projClauses: string[] = [];
        const projParams: any[] = [];
        if (allQuoIds.size > 0) {
          const qArr = Array.from(allQuoIds);
          projClauses.push(`quotation_id IN (${qArr.map(() => "?").join(",")})`);
          projParams.push(...qArr);
        }
        if (allProjIds.size > 0) {
          const pArr = Array.from(allProjIds);
          projClauses.push(`id IN (${pArr.map(() => "?").join(",")})`);
          projParams.push(...pArr);
        }

        if (projClauses.length > 0) {
          const projs = db.prepare(`SELECT * FROM projects WHERE ${projClauses.join(" OR ")}`).all(...projParams) as any[];
          for (const p of projs) {
            projectsById.set(p.id, p);
            if (p.quotation_id) {
              if (!projectsByQuo.has(p.quotation_id)) projectsByQuo.set(p.quotation_id, []);
              projectsByQuo.get(p.quotation_id)!.push(p);
            }
          }
        }

        // 4. Batch query Delivery Items
        const rawDeliveryItems = db
          .prepare(
            `
          SELECT di.*, i.item_code as i_item_code, i.name as i_name, i.unit_price as i_unit_price, i.uom as i_uom
          FROM delivery_items di
          LEFT JOIN items i ON di.item_id = i.id
          WHERE di.dn_id IN (${dnPlaceholders})
        `,
          )
          .all(...uniqueDnIds) as any[];

        const diByDn = new Map<string, any[]>();
        for (const di of rawDeliveryItems) {
          if (!diByDn.has(di.dn_id)) diByDn.set(di.dn_id, []);
          diByDn.get(di.dn_id)!.push(di);
        }

        // 5. In-Memory Resolution for all DNs (O(1) lookups, constant 4 queries total)
        for (const dnId of uniqueDnIds) {
          const dn = dnMap.get(dnId);
          if (!dn) {
            resultMap.set(dnId, []);
            continue;
          }

          const quoId = dn.quotation_id || dn.p_quotation_id;
          const quotation = quoId ? quoMap.get(quoId) : null;
          const quotationItems = quoId ? (qiMap.get(quoId) || []) : [];
          const relatedProjects = quoId
            ? (projectsByQuo.get(quoId) || [])
            : (dn.project_id && projectsById.has(dn.project_id) ? [projectsById.get(dn.project_id)] : []);
          const dnItems = diByDn.get(dnId) || [];

          const itemsWithPrices = dnItems.map((di: any, idx: number) => {
            const cleanItemId = (di.item_id || "").toString();
            const cleanItemCode = (di.i_item_code || "").toString();
            const cleanName = (di.i_name || di.remarks || "").toString().toLowerCase().trim();

            let matchedProject = relatedProjects.find((p: any) => {
              if (!p) return false;
              const cleanProjId = (p.id || "").toString();
              const cleanProjName = (p.name || "").toString().toLowerCase().trim();

              if (
                cleanProjId === cleanItemId ||
                cleanItemId === `ITEM-${cleanProjId}` ||
                cleanItemId === `FG-${cleanProjId}` ||
                cleanItemCode === `FG-${cleanProjId}` ||
                cleanItemCode === `FG-${cleanProjId}-SUB`
              ) {
                return true;
              }

              if (cleanProjName.length > 2 && cleanName.length > 2) {
                if (cleanName === cleanProjName || cleanName.includes(cleanProjName) || cleanProjName.includes(cleanName)) {
                  return true;
                }
              }
              return false;
            });

            if (!matchedProject && relatedProjects.length === dnItems.length) {
              matchedProject = relatedProjects[idx];
            }

            let matchedQi: any = null;
            if (matchedProject && matchedProject.quotation_item_id) {
              matchedQi = quotationItems.find((qi: any) => qi.id === matchedProject.quotation_item_id);
            }
            if (!matchedQi) {
              matchedQi = quotationItems.find((qi: any) => {
                const cleanQiId = (qi.id || "").toString();
                return (
                  cleanQiId === cleanItemId ||
                  cleanQiId === cleanItemCode ||
                  cleanItemCode === `QI-${cleanQiId.slice(0, 8)}` ||
                  cleanItemId === `QI-${cleanQiId.slice(0, 8)}`
                );
              });
            }
            if (!matchedQi && cleanName.length > 2) {
              matchedQi = quotationItems.find((qi: any) => {
                const cleanQiTitle = (qi.title || "").toString().toLowerCase().trim();
                if (!cleanQiTitle) return false;
                return (
                  cleanQiTitle === cleanName ||
                  cleanName.includes(cleanQiTitle) ||
                  cleanQiTitle.includes(cleanName)
                );
              });
            }
            if (!matchedQi && matchedProject) {
              const projIdx = relatedProjects.findIndex((p: any) => p.id === matchedProject.id);
              if (projIdx >= 0 && quotationItems[projIdx]) {
                matchedQi = quotationItems[projIdx];
              }
            }
            if (!matchedQi) {
              if (quotationItems.length === dnItems.length) {
                matchedQi = quotationItems[idx];
              } else if (quotationItems[idx]) {
                matchedQi = quotationItems[idx];
              } else if (quotationItems.length === 1) {
                matchedQi = quotationItems[0];
              }
            }

            let itemName = "";
            const isGenericName = (name: string) => {
              if (!name) return true;
              const l = name.toLowerCase().trim();
              return l === "commercial item" || l === "commercial trade item" || l === "item delivery" || l === "unit" || l === "fg-item" || l === "finish good";
            };

            if (matchedQi?.title) {
              itemName = matchedQi.title;
            } else if (matchedProject?.name) {
              itemName = matchedProject.name;
            } else if (di.i_name && !isGenericName(di.i_name)) {
              itemName = di.i_name;
            } else if (di.remarks && !isGenericName(di.remarks)) {
              itemName = di.remarks;
            } else {
              itemName = "Commercial Trade Item";
            }

            const itemCode =
              di.i_item_code ||
              (matchedQi ? `QI-${matchedQi.id.slice(0, 8)}` : `FG-${(di.item_id || "").slice(0, 8)}`);
            const uom = di.uom || matchedQi?.uom || di.i_uom || matchedProject?.uom || "Unit";
            const qty = Number(di.qty) || 1;

            let unitPrice = 0;
            if (matchedQi && Number(matchedQi.unit_price) > 0) {
              unitPrice = Number(matchedQi.unit_price);
            } else if (Number(di.i_unit_price) > 0) {
              unitPrice = Number(di.i_unit_price);
            } else if (quotationItems[idx] && Number(quotationItems[idx].unit_price) > 0) {
              unitPrice = Number(quotationItems[idx].unit_price);
            } else if (
              quotation &&
              Number(quotation.amount) > 0 &&
              dnItems.length > 0
            ) {
              const discountRate = Number(quotation.discount_rate) || 0;
              const grossQuotationAmount = discountRate > 0 && Number(quotation.dpp) > 0
                ? Math.round(Number(quotation.dpp) / (1 - discountRate / 100))
                : Number(quotation.amount);
              const totalQty = dnItems.reduce(
                (acc: number, cur: any) => acc + (Number(cur.qty) || 1),
                0,
              );
              unitPrice = Math.round(grossQuotationAmount / (totalQty || 1));
            }

            const subtotal = Math.round(qty * unitPrice);

            return {
              ...di,
              item_name: itemName,
              item_code: itemCode,
              uom,
              qty,
              unit_price: unitPrice,
              subtotal,
            };
          });

          resultMap.set(dnId, itemsWithPrices);
        }

        return resultMap;
      } catch (e) {
        console.error("Error resolving batch delivery items with prices:", e);
        return resultMap;
      }
    }

    function getDeliveryNoteItemsWithPrices(dnId: string) {
      if (!dnId) return [];
      const map = batchGetDeliveryNoteItemsWithPrices([dnId]);
      return map.get(dnId) || [];
    }

    salesRouter.get(
      "/api/sales/deliveries/:id",
      requireRole(["WAREHOUSE", "FC", "SALES"]),
      (req, res) => {
        try {
          const dn = db
            .prepare(
              `
        SELECT dn.*, 
               c.name as customer_name, c.address as customer_address, c.code as customer_code, c.phone as customer_phone, c.email as customer_email,
               q.quotation_number, q.title as quotation_title,
               p.name as project_name,
               (SELECT GROUP_CONCAT(p2.name, ', ') FROM projects p2 WHERE (dn.quotation_id IS NOT NULL AND p2.quotation_id = dn.quotation_id) OR (dn.project_id IS NOT NULL AND p2.id = dn.project_id)) as project_names
        FROM delivery_notes dn
        LEFT JOIN customers c ON dn.customer_id = c.id
        LEFT JOIN quotations q ON dn.quotation_id = q.id
        LEFT JOIN projects p ON dn.project_id = p.id
        WHERE dn.id = ?
      `,
            )
            .get(req.params.id) as any;

          if (!dn) return res.status(404).json({ error: "Delivery not found" });

          dn.items = getDeliveryNoteItemsWithPrices(dn.id);

          dn.signatures = db
            .prepare(
              `
        SELECT * FROM dn_signatures WHERE dn_id = ?
      `,
            )
            .all(req.params.id);

          res.json(dn);
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to fetch Dn details" });
        }
      },
    );

    salesRouter.put(
      "/api/sales/deliveries/:id",
      requireRole(["SALES", "FC"]),
      (req, res) => {
        try {
          const { customer_id, quotation_id, project_id, remarks, police_number, items } =
            req.body;
          const dnId = req.params.id;

          const dn = db
            .prepare("SELECT * FROM delivery_notes WHERE id = ?")
            .get(dnId) as any;
          if (!dn) return res.status(404).json({ error: "Delivery not found" });

          if (quotation_id) {
            const q = db
              .prepare("SELECT * FROM quotations WHERE id = ?")
              .get(quotation_id) as any;
            const relatedProjects = db
              .prepare("SELECT * FROM projects WHERE quotation_id = ?")
              .all(quotation_id) as any[];

            if (relatedProjects.length > 0) {
              const unfinished = relatedProjects.filter(
                (p) =>
                  p.status !== "FINISHED" &&
                  p.status !== "COMPLETED" &&
                  p.status !== "CLOSED",
              );
              if (unfinished.length > 0) {
                const unfinishedList = unfinished
                  .map((p) => `'${p.name}' (${p.status})`)
                  .join(", ");
                return res.status(400).json({
                  error: `Cannot issue Delivery Note: Quotation '${q?.quotation_number || quotation_id}' has unfinished project(s): ${unfinishedList}. All projects in the quotation must reach FINISHED state before a Delivery Note can be issued.`,
                });
              }
            }
          } else if (project_id) {
            const proj = db
              .prepare("SELECT * FROM projects WHERE id = ?")
              .get(project_id) as any;
            if (proj) {
              const isProjectFinished =
                proj.status === "FINISHED" ||
                proj.status === "COMPLETED" ||
                proj.status === "CLOSED";
              if (!isProjectFinished) {
                let quoItemCount = 0;
                if (proj.quotation_id) {
                  const qCnt = db
                    .prepare(
                      "SELECT COUNT(*) as cnt FROM quotation_items WHERE quotation_id = ?",
                    )
                    .get(proj.quotation_id) as any;
                  quoItemCount = qCnt?.cnt || 0;
                }
                return res.status(400).json({
                  error: `Cannot issue Delivery Note: Project '${proj.name}' is currently in '${proj.status}' status. All ${quoItemCount > 0 ? quoItemCount + " items in the quotation" : "project items"} must reach FINISHED state before a Delivery Note can be issued.`,
                });
              }
            }
          }

          db.transaction(() => {
            db.prepare(
              `
              UPDATE delivery_notes 
              SET customer_id = ?, quotation_id = ?, project_id = ?, remarks = ?, police_number = ?, status = 'DRAFT', revision_note = NULL
              WHERE id = ?
            `,
            ).run(
              customer_id,
              quotation_id || null,
              project_id || null,
              remarks || null,
              police_number || null,
              dnId,
            );

            db.prepare("DELETE FROM delivery_items WHERE dn_id = ?").run(dnId);

            const insertItem = db.prepare(
              "INSERT INTO delivery_items (id, dn_id, item_id, qty, uom, remarks) VALUES (?, ?, ?, ?, ?, ?)",
            );

            for (const item of items) {
              const existingItem = db
                .prepare("SELECT id FROM items WHERE id = ?")
                .get(item.item_id);
              if (!existingItem) {
                db.prepare(
                  "INSERT INTO items (id, item_code, name, uom, category) VALUES (?, ?, ?, ?, 'FG')",
                ).run(
                  item.item_id,
                  item.item_code || `FG-${item.item_id}`,
                  item.item_name || "Commercial Item",
                  item.uom || "Unit",
                );
              }

              insertItem.run(
                "DNI-" + Math.random().toString(36).substr(2, 9),
                dnId,
                item.item_id,
                item.qty,
                item.uom || "Unit",
                item.remarks || null,
              );
            }
          })();

          logAudit(
            (req.headers["x-user-email"] as string) || null,
            "UPDATE_DELIVERY",
            "DELIVERY_NOTE",
            dnId,
            `Revised delivery note ${dn.dn_number}`,
          );

          res.json({ success: true, id: dnId });
        } catch (error: any) {
          console.error(error);
          res
            .status(500)
            .json({
              error: "Failed to update delivery note",
              details: error.message,
            });
        }
      },
    );

    salesRouter.post(
      "/api/sales/deliveries/:id/authorize",
      requireRole(["SALES", "FC"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        const username = (req.headers["x-user-email"] ||
          req.headers["remote-user"] ||
          req.headers["x-forwarded-user"] ||
          "Sales Manager") as string;

        if (
          userRole !== "FC" &&
          !(userRole === "SALES" && userLevel === "MANAGER") &&
          !["eghy", "ludy"].includes(username.toLowerCase())
        ) {
          return res.status(403).json({
            error:
              "Access denied. Only Sales Managers or FC accounts can authorize delivery notes.",
          });
        }

        try {
          const dnId = req.params.id;
          const dn = db
            .prepare("SELECT * FROM delivery_notes WHERE id = ?")
            .get(dnId) as any;

          if (!dn) {
            return res.status(404).json({ error: "Delivery note not found" });
          }

          if (dn.status !== "DRAFT") {
            return res.status(400).json({
              error: `Cannot authorize delivery note in '${dn.status}' status. Only DRAFT notes can be authorized.`,
            });
          }

          db.prepare(
            "UPDATE delivery_notes SET status = 'AUTHORIZED', authorized_at = CURRENT_TIMESTAMP, authorized_by = ?, revision_note = NULL WHERE id = ?",
          ).run(username, dnId);

          logAudit(
            username,
            "AUTHORIZE_DELIVERY",
            "DELIVERY_NOTE",
            dnId,
            `Authorized delivery note ${dn.dn_number} by Sales Manager`,
          );

          res.json({
            success: true,
            message: "Delivery note authorized successfully and forwarded to Warehouse.",
          });
        } catch (err: any) {
          console.error(err);
          res.status(500).json({
            error: "Failed to authorize delivery note",
            details: err.message,
          });
        }
      },
    );

    salesRouter.post(
      "/api/sales/deliveries/revise-dn",
      requireRole(["WAREHOUSE", "SALES", "FC"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (
          userRole !== "FC" &&
          (userRole !== "WAREHOUSE" || userLevel !== "MANAGER") &&
          (userRole !== "SALES" || userLevel !== "MANAGER")
        ) {
          return res.status(403).json({
            error:
              "Access denied. Only Managers or FC accounts can revise deliveries.",
          });
        }
        try {
          const { dn_id, revision_note } = req.body;
          if (!revision_note) {
            return res.status(400).json({ error: "Revision note is required" });
          }

          const dn = db
            .prepare("SELECT * FROM delivery_notes WHERE id = ?")
            .get(dn_id) as any;
          if (!dn) {
            return res.status(404).json({ error: "Delivery not found" });
          }

          db.prepare(
            "UPDATE delivery_notes SET status = 'REVISION', revision_note = ? WHERE id = ?",
          ).run(revision_note, dn_id);

          logAudit(
            (req.headers["x-user-email"] as string) || null,
            "REVISE_DELIVERY",
            "DELIVERY_NOTE",
            dn_id,
            `Revise delivery note ${dn.dn_number} with note: ${revision_note}`,
          );

          res.json({ success: true, message: "Delivery marked for revision" });
        } catch (err: any) {
          console.error(err);
          res
            .status(500)
            .json({ error: "Failed to revise delivery", details: err.message });
        }
      },
    );

    salesRouter.post(
      "/api/sales/deliveries/:id/upload-dispatch",
      requireRole(["WAREHOUSE", "FC", "SALES"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        if (
          userRole !== "FC" &&
          userRole !== "WAREHOUSE" &&
          userRole !== "SALES"
        ) {
          return res.status(403).json({
            error:
              "Access denied. Warehouse, Sales or FC accounts can authorize delivery dispatch approvals.",
          });
        }
        try {
          const { file_url } = req.body;
          const username = (req.headers["x-user-email"] ||
            req.headers["remote-user"] ||
            req.headers["x-forwarded-user"]) as string;
          const dn = db
            .prepare("SELECT * FROM delivery_notes WHERE id = ?")
            .get(req.params.id) as any;
          if (!dn) return res.status(404).json({ error: "Delivery not found" });
          if (dn.status === "DELIVERED")
            return res
              .status(400)
              .json({
                error:
                  "Delivery note is already marked as DELIVERED.",
              });

          const items = db
            .prepare("SELECT * FROM delivery_items WHERE dn_id = ?")
            .all(req.params.id) as any[];

          db.transaction(() => {
            // Deduct Stock
            const moveHist = db.prepare(
              "INSERT INTO stock_movements (id, item_id, type, qty, reference_id, recorded_by, project_id) VALUES (?, ?, 'RELEASE', ?, ?, ?, ?)",
            );

            for (const item of items) {
              const targetItem = db
                .prepare("SELECT id, item_code FROM items WHERE id = ? OR item_code = ?")
                .get(item.item_id, item.item_id) as any;
              const actualItemId = targetItem ? targetItem.id : item.item_id;

              // Ensure inventory record exists for the item
              db.prepare(
                "INSERT OR IGNORE INTO inventory (item_id, physical_qty, reserved_qty, available_qty, free_stock, allocated_stock) VALUES (?, 0, 0, 0, 0, 0)",
              ).run(actualItemId);

              // Deduct stock (Dual-Stock: physical & free/available)
              const updateInv = db.prepare(
                `UPDATE inventory 
                 SET free_stock = free_stock - ?,
                     available_qty = available_qty - ?,
                     physical_qty = physical_qty - ?
                 WHERE item_id = ? AND free_stock >= ?`
              ).run(item.qty, item.qty, item.qty, actualItemId, item.qty);
              
              if (updateInv.changes === 0) {
                throw new Error(`Insufficient stock for item ${actualItemId}`);
              }

              moveHist.run(
                "SMV-" + crypto.randomUUID(),
                actualItemId,
                item.qty,
                dn.id,
                username,
                dn.project_id || null,
              );
            }

            db.prepare(
              `
            INSERT INTO dn_signatures (id, dn_id, role, signer_name, file_url) 
            VALUES (?, ?, ?, ?, ?)
         `,
            ).run(
              "DNS-" + crypto.randomUUID(),
              dn.id,
              "DISPATCH_PHASE",
              username,
              file_url,
            );

            db.prepare(
              "UPDATE delivery_notes SET status = 'IN_DELIVERY', shipped_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(req.params.id);
          })();

          // Automated Accounting Bridge: Post Delivery Note COGS Journal (Debit COGS, Credit Finished Goods / Inventory Asset)
          try {
            const dnCostRow = db.prepare(`
              SELECT COALESCE(SUM(di.qty * COALESCE(i.unit_price, 0)), 0) as total_cogs
              FROM delivery_items di
              LEFT JOIN items i ON di.item_id = i.id
              WHERE di.dn_id = ?
            `).get(req.params.id) as { total_cogs: number };

            const totalCogs = Number(dnCostRow?.total_cogs || 0);
            if (totalCogs > 0) {
              postDeliveryDispatchJournal(db, {
                dn_id: req.params.id,
                dn_number: dn.dn_number || req.params.id,
                total_cogs: totalCogs,
                user: username || "WAREHOUSE",
              });
            }
          } catch (dnAccErr) {
            console.error("Automated Accounting postDeliveryDispatchJournal error:", dnAccErr);
          }

          res.json({ success: true });
        } catch (err: any) {
          console.error(err);
          res
            .status(500)
            .json({ error: err.message || "Failed to dispatch delivery" });
        }
      },
    );

    salesRouter.post(
      "/api/sales/deliveries/:id/start-delivery",
      requireRole(["FC", "SALES", "WAREHOUSE"]),
      (req, res) => {
        try {
          const username = (req.headers["x-user-email"] ||
            req.headers["remote-user"] ||
            req.headers["x-forwarded-user"]) as string;
          const dn = db
            .prepare("SELECT * FROM delivery_notes WHERE id = ?")
            .get(req.params.id) as any;
          if (!dn) return res.status(404).json({ error: "Delivery not found" });

          if (dn.status !== "PENDING_DELIVERY") {
            return res.status(400).json({
              error:
                "Cannot start delivery. Warehouse must authorize dispatch first.",
            });
          }

          db.transaction(() => {
            db.prepare(
              "UPDATE delivery_notes SET status = 'IN_DELIVERY', shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP) WHERE id = ?",
            ).run(req.params.id);
          })();
          res.json({ success: true });
        } catch (err: any) {
          console.error(err);
          res
            .status(500)
            .json({ error: err.message || "Failed to start delivery" });
        }
      },
    );

    salesRouter.post(
      "/api/sales/deliveries/:id/finish-delivery",
      requireRole(["FC", "SALES", "WAREHOUSE"]),
      (req, res) => {
        try {
          const { file_url } = req.body;
          const username = (req.headers["x-user-email"] ||
            req.headers["remote-user"] ||
            req.headers["x-forwarded-user"]) as string;
          const dn = db
            .prepare("SELECT * FROM delivery_notes WHERE id = ?")
            .get(req.params.id) as any;
          if (!dn) return res.status(404).json({ error: "Delivery not found" });
          if (dn.status !== "IN_DELIVERY" && dn.status !== "PENDING_DELIVERY")
            return res.status(400).json({ error: "DN must be IN_DELIVERY or PENDING_DELIVERY" });

          db.transaction(() => {
            db.prepare(
              `
            INSERT INTO dn_signatures (id, dn_id, role, signer_name, file_url) 
            VALUES (?, ?, ?, ?, ?)
         `,
            ).run(
              "DNS-" + crypto.randomUUID(),
              dn.id,
              "PARTY_2",
              username,
              file_url,
            );

            db.prepare(
              "UPDATE delivery_notes SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(req.params.id);
          })();
          res.json({ success: true });
        } catch (err) {
          res.status(500).json({ error: "Failed to finish delivery" });
        }
      },
    );

    // --- BANK ACCOUNTS ----
    salesRouter.get("/api/bank-accounts", (req, res) => {
      try {
        const accounts = db
          .prepare("SELECT * FROM bank_accounts ORDER BY created_at DESC")
          .all();
        res.json(accounts);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch bank accounts" });
      }
    });

    salesRouter.post(
      "/api/bank-accounts",
      requireRole(["FC", "SALES", "PURCHASING", "WAREHOUSE", "ENGINEERING"]),
      (req, res) => {
        try {
          const { bank_name, account_number, account_holder, branch } =
            req.body;
          if (!bank_name || !account_number || !account_holder) {
            return res.status(400).json({ error: "Missing required fields" });
          }
          const id =
            "BNK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
          db.prepare(
            "INSERT INTO bank_accounts (id, bank_name, account_number, account_holder, branch) VALUES (?, ?, ?, ?, ?)",
          ).run(id, bank_name, account_number, account_holder, branch || null);

          logAudit(
            (req.headers["x-user-username"] as string) || null,
            "REGISTER_BANK_ACCOUNT",
            "BANK_ACCOUNT",
            id,
            `Registered bank ${bank_name} - ${account_number}`,
          );
          res.json({ success: true, id });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to register bank account" });
        }
      },
    );

    salesRouter.delete(
      "/api/bank-accounts/:id",
      requireRole(["FC", "SALES", "PURCHASING", "WAREHOUSE", "ENGINEERING"]),
      (req, res) => {
        try {
          db.prepare("DELETE FROM bank_accounts WHERE id = ?").run(
            req.params.id,
          );
          res.json({ success: true });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to delete bank account" });
        }
      },
    );

    // --- COMMERCIAL INVOICES ----
    salesRouter.get("/api/sales/invoices", requireRole(["FC", "SALES"]), (req, res) => {
      try {
        const invoices = db
          .prepare(
            `
         SELECT ci.*, dn.dn_number, COALESCE(c.name, ci.customer_id) as customer_name, p.name as project_name,
                (SELECT GROUP_CONCAT(p2.name, ', ') FROM projects p2 WHERE (dn.quotation_id IS NOT NULL AND p2.quotation_id = dn.quotation_id) OR (dn.project_id IS NOT NULL AND p2.id = dn.project_id) OR (ci.project_id IS NOT NULL AND p2.id = ci.project_id)) as project_names,
                bk.bank_name, bk.account_number, bk.account_holder, bk.branch,
                c.address as customer_address, c.email as customer_email, c.phone as customer_phone,
                COALESCE(q.discount_rate, q2.discount_rate, ci.discount_rate, 0) as quotation_discount_rate,
                COALESCE(q.tax_rate, q2.tax_rate, ci.ppn_rate, 12) as quotation_tax_rate,
                COALESCE(q.pph_rate, q2.pph_rate, ci.pph_rate, 2) as quotation_pph_rate,
                COALESCE(q.rounding_factor, q2.rounding_factor, ci.rounding_factor, 0) as quotation_rounding_factor,
                COALESCE(q.dpp, q2.dpp, ci.dpp, ci.amount) as quotation_dpp,
                COALESCE(q.grand_total, q2.grand_total, ci.grand_total, ci.total_amount) as quotation_grand_total
         FROM commercial_invoices ci
         JOIN delivery_notes dn ON ci.dn_id = dn.id
         LEFT JOIN customers c ON ci.customer_id = c.id
         LEFT JOIN projects p ON ci.project_id = p.id
         LEFT JOIN quotations q ON p.quotation_id = q.id
         LEFT JOIN quotations q2 ON dn.quotation_id = q2.id
         LEFT JOIN bank_accounts bk ON ci.bank_account_id = bk.id
         ORDER BY ci.created_at DESC
       `,
          )
          .all() as any[];

        // Batch fetch all delivery note items in constant queries (N+1 eliminated)
        const allDnIds = invoices.map((inv) => inv.dn_id).filter(Boolean);
        const batchItemsMap = batchGetDeliveryNoteItemsWithPrices(allDnIds);

        for (let inv of invoices) {
          inv.items = batchItemsMap.get(inv.dn_id) || [];

          const breakdown = calculateFinancialBreakdown({
            items: inv.items,
            grossAmount: Number(inv.gross_amount),
            discountRate: inv.discount_rate !== undefined && inv.discount_rate !== null ? Number(inv.discount_rate) : Number(inv.quotation_discount_rate || 0),
            discountAmount: inv.discount_amount !== undefined && inv.discount_amount !== null && Number(inv.discount_amount) > 0 ? Number(inv.discount_amount) : undefined,
            taxRate: inv.ppn_rate !== undefined && inv.ppn_rate !== null ? Number(inv.ppn_rate) : Number(inv.quotation_tax_rate || 12),
            pphRate: inv.pph_rate !== undefined && inv.pph_rate !== null ? Number(inv.pph_rate) : Number(inv.quotation_pph_rate || 0),
            dpp: inv.dpp !== undefined && Number(inv.dpp) > 0 ? Number(inv.dpp) : Number(inv.quotation_dpp || 0),
            roundingFactor: inv.rounding_factor !== undefined && inv.rounding_factor !== null && Number(inv.rounding_factor) !== 0 ? Number(inv.rounding_factor) : Number(inv.quotation_rounding_factor || 0),
            grandTotal: Number(inv.grand_total) || Number(inv.total_amount) || Number(inv.quotation_grand_total),
          });

          const amountPaid = Number(inv.amount_paid) || 0;

          inv.gross_amount = breakdown.grossAmount;
          inv.discount_rate = breakdown.discountRate;
          inv.discount_amount = breakdown.discountAmount;
          inv.rounding_factor = breakdown.roundingFactor;
          inv.dpp = breakdown.dpp;
          inv.amount = breakdown.dpp;
          inv.ppn_rate = breakdown.taxRate;
          inv.pph_rate = breakdown.pphRate;
          inv.ppn = breakdown.ppnAmount;
          inv.pph = breakdown.pphAmount;
          inv.grand_total = breakdown.grandTotal;
          inv.total_amount = breakdown.grandTotal;
          inv.amount_paid = amountPaid;
          inv.remaining_amount = Math.max(0, breakdown.grandTotal - amountPaid);
          inv.issue_date = inv.created_at || new Date().toISOString();

          let days = 30;
          if (inv.payment_terms === "Net 14") days = 14;
          else if (inv.payment_terms === "Net 30") days = 30;
          else if (inv.payment_terms === "Net 45") days = 45;
          else if (inv.payment_terms === "Net 60") days = 60;
          else if (inv.payment_terms === "Net 90") days = 90;
          else if (inv.payment_terms === "Due on Receipt") days = 0;

          const issueDateObj = new Date(inv.created_at || Date.now());
          issueDateObj.setDate(issueDateObj.getDate() + days);
          inv.due_date = issueDateObj.toISOString();
        }

        res.json(invoices);
      } catch (err) {
        console.error("Invoices Query Error: ", err);
        res.status(500).json({ error: "Query failed" });
      }
    });

    salesRouter.get(
      "/api/sales/unbilled-deliveries",
      requireRole(["FC", "SALES"]),
      (req, res) => {
        try {
          const unbilled = db
            .prepare(
              `
          SELECT dn.*, COALESCE(c.name, dn.customer_id) as customer_name, p.name as project_name,
                 (SELECT GROUP_CONCAT(p2.name, ', ') FROM projects p2 WHERE (dn.quotation_id IS NOT NULL AND p2.quotation_id = dn.quotation_id) OR (dn.project_id IS NOT NULL AND p2.id = dn.project_id)) as project_names, 
                 COALESCE(NULLIF(q.dpp, 0), q.amount, q2.dpp, q2.amount) as quotation_amount, 
                 COALESCE(q.discount_rate, q2.discount_rate, 0) as quotation_discount_rate,
                 COALESCE(q.rounding_factor, q2.rounding_factor, 0) as quotation_rounding_factor,
                 COALESCE(q.title, q2.title) as quotation_title, 
                 COALESCE(q.tax_rate, q2.tax_rate, 12) as quotation_tax_rate,
                 COALESCE(q.pph_rate, q2.pph_rate, 2) as quotation_pph_rate,
                 COALESCE(q.grand_total, q2.grand_total) as quotation_grand_total,
                 COALESCE(q.dpp, q2.dpp) as quotation_dpp
          FROM delivery_notes dn
          LEFT JOIN customers c ON dn.customer_id = c.id
          LEFT JOIN projects p ON dn.project_id = p.id
          LEFT JOIN quotations q ON p.quotation_id = q.id
          LEFT JOIN quotations q2 ON dn.quotation_id = q2.id
          WHERE dn.status = 'DELIVERED' AND dn.invoiced_at IS NULL
          ORDER BY dn.created_at DESC
       `,
            )
            .all() as any[];

          const unbilledDnIds = unbilled.map((dn) => dn.id).filter(Boolean);
          const unbilledBatchItems = batchGetDeliveryNoteItemsWithPrices(unbilledDnIds);

          for (let dn of unbilled) {
            dn.items = unbilledBatchItems.get(dn.id) || [];
            const breakdown = calculateFinancialBreakdown({
              items: dn.items,
              discountRate: Number(dn.quotation_discount_rate) || 0,
              taxRate: Number(dn.quotation_tax_rate) || 12,
              pphRate: Number(dn.quotation_pph_rate) || 0,
              dpp: Number(dn.quotation_dpp) || undefined,
              roundingFactor: Number(dn.quotation_rounding_factor) || undefined,
              grandTotal: Number(dn.quotation_grand_total) || undefined,
            });

            dn.gross_amount = breakdown.grossAmount;
            dn.quotation_gross_amount = breakdown.grossAmount;
            dn.discount_rate = breakdown.discountRate;
            dn.discount_amount = breakdown.discountAmount;
            dn.rounding_factor = breakdown.roundingFactor;
            dn.calculated_dpp = breakdown.dpp;
            dn.calculated_ppn = breakdown.ppnAmount;
            dn.calculated_pph = breakdown.pphAmount;
            dn.calculated_grand_total = breakdown.grandTotal;
          }

          res.json(unbilled);
        } catch (err) {
          console.error("Error fetching unbilled deliveries:", err);
          res.status(500).json({ error: "Query failed" });
        }
      },
    );

    salesRouter.post(
      "/api/sales/invoice/:dn_id",
      requireRole(["FC", "SALES"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (
          userRole !== "FC" &&
          (userRole !== "SALES" || userLevel !== "MANAGER")
        ) {
          return res
            .status(403)
            .json({
              error:
                "Access denied. Only FC or Sales Manager can generate commercial invoices.",
            });
        }
        try {
          const {
            amount,
            gross_amount,
            discount_rate,
            discount_amount,
            rounding_factor,
            grand_total,
            bank_account_id,
            payment_terms,
            ppn_rate,
            pph_rate,
            job_description,
          } = req.body;
          const dnId = req.params.dn_id;
          const dn = db
            .prepare("SELECT * FROM delivery_notes WHERE id = ?")
            .get(dnId) as any;
          if (!dn) return res.status(404).json({ error: "Delivery not found" });
          if (dn.status !== "DELIVERED")
            return res
              .status(400)
              .json({ error: "Only DELIVERED notes can be invoiced." });
          if (dn.invoiced_at)
            return res
              .status(400)
              .json({ error: "Delivery already invoiced." });

          // Resolve linked quotation if available
          const quoId = dn.quotation_id;
          let quotation = quoId
            ? (db.prepare("SELECT * FROM quotations WHERE id = ?").get(quoId) as any)
            : (dn.project_id ? (db.prepare("SELECT q.* FROM quotations q JOIN projects p ON p.quotation_id = q.id WHERE p.id = ?").get(dn.project_id) as any) : null);

          if (!quotation && dn.customer_id) {
            quotation = db.prepare("SELECT * FROM quotations WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1").get(dn.customer_id) as any;
          }

          let finalJobDesc = job_description;
          if (!finalJobDesc) {
            if (quotation?.title) {
              finalJobDesc = quotation.title;
            } else if (dn.project_id) {
              const proj = db
                .prepare("SELECT name FROM projects WHERE id = ?")
                .get(dn.project_id) as any;
              finalJobDesc =
                proj?.name || `Commercial Trade Delivery (DN: ${dn.dn_number})`;
            } else {
              finalJobDesc = `Commercial Trade Delivery (DN: ${dn.dn_number})`;
            }
          }

          let ciId = "CI-" + crypto.randomUUID();
          let dParts = new Date().toISOString().split("T")[0].split("-");
          let ciNumber = `CI-${dParts[0]}${dParts[1]}-${Math.floor(
            Math.random() * 1000,
          )
            .toString()
            .padStart(3, "0")}`;

          const items = getDeliveryNoteItemsWithPrices(dn.id);

          const breakdown = calculateFinancialBreakdown({
            items,
            grossAmount: Number(gross_amount) > 0 ? Number(gross_amount) : undefined,
            discountRate: discount_rate !== undefined && discount_rate !== null ? Number(discount_rate) : (Number(quotation?.discount_rate) || 0),
            discountAmount: discount_amount !== undefined && discount_amount !== null && Number(discount_amount) > 0 ? Number(discount_amount) : undefined,
            taxRate: ppn_rate !== undefined && ppn_rate !== null ? Number(ppn_rate) : (Number(quotation?.tax_rate) || 12),
            pphRate: pph_rate !== undefined && pph_rate !== null ? Number(pph_rate) : (Number(quotation?.pph_rate) || 0),
            dpp: req.body.dpp !== undefined && Number(req.body.dpp) > 0 ? Number(req.body.dpp) : (Number(amount) > 0 ? Number(amount) : Number(quotation?.dpp || 0)),
            roundingFactor: rounding_factor !== undefined && rounding_factor !== null ? Number(rounding_factor) : Number(quotation?.rounding_factor || 0),
            grandTotal: Number(grand_total) > 0 ? Number(grand_total) : Number(quotation?.grand_total || 0),
          });

          db.transaction(() => {
            db.prepare(
              `
              INSERT INTO commercial_invoices (
                id, ci_number, dn_id, customer_id, project_id,
                amount, gross_amount, discount_rate, discount_amount, dpp, rounding_factor,
                ppn, pph, total_amount, grand_total,
                bank_account_id, payment_terms, ppn_rate, pph_rate, job_description
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           `,
            ).run(
              ciId,
              ciNumber,
              dn.id,
              dn.customer_id,
              dn.project_id || null,
              breakdown.dpp,
              breakdown.grossAmount,
              breakdown.discountRate,
              breakdown.discountAmount,
              breakdown.dpp,
              breakdown.roundingFactor,
              breakdown.ppnAmount,
              breakdown.pphAmount,
              breakdown.grandTotal,
              breakdown.grandTotal,
              bank_account_id || null,
              payment_terms || "Net 30",
              breakdown.taxRate,
              breakdown.pphRate,
              finalJobDesc,
            );

            db.prepare(
              "UPDATE delivery_notes SET invoiced_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(dn.id);
          })();

          try {
            const ciRow = db.prepare("SELECT * FROM commercial_invoices WHERE id = ?").get(ciId) as any;
            if (ciRow) {
              syncCollectionToFirestore("commercial_invoices", ciId, ciRow);
            }
            const dnUpdated = db.prepare("SELECT * FROM delivery_notes WHERE id = ?").get(dn.id) as any;
            if (dnUpdated) {
              syncCollectionToFirestore("delivery_notes", dn.id, dnUpdated);
            }
          } catch (syncErr) {
            console.error("Firestore sync error for Commercial Invoice:", syncErr);
          }

          // Automated Accounting Bridge: Post Customer Commercial Invoice Journal (Debit AR, Credit Sales Revenue & VAT Payable)
          try {
            postCommercialInvoiceJournal(db, {
              ci_id: ciId,
              ci_number: ciNumber,
              dpp: breakdown.dpp,
              ppn: breakdown.ppnAmount,
              pph: breakdown.pphAmount,
              grand_total: breakdown.grandTotal,
              user: (req.headers["x-user-email"] as string) || "SALES",
            });
          } catch (invAccErr) {
            console.error("Automated Accounting postCommercialInvoiceJournal error:", invAccErr);
          }

          res.json({ success: true, id: ciId });
        } catch (err: any) {
          console.error("Invoicing Error: ", err);
          res.status(500).json({ error: "Failed to generate invoice." });
        }
      },
    );

    // ==========================================
    // --- STANDALONE RECEIPT ACKNOWLEDGEMENTS (TANDA TERIMA) API ---
    // ==========================================



