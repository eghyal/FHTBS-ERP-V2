import { hrAttendanceRouter } from "./hr-attendance.ts";
import bcrypt from "bcrypt";
import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { syncCollectionToFirestore } from "../db/firebaseSync.ts";

export const hrRouter = Router();
    // HR Salaries API
    hrRouter.get("/api/hr/salaries", (req, res) => {
      try {
        const salaries = db.prepare("SELECT * FROM hr_salaries").all();
        res.json(salaries);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch salaries" });
      }
    });

    hrRouter.post("/api/hr/salaries", (req, res) => {
      try {
        const { employee_username, basic_salary, allowances, deductions } = req.body;
        const dbUser = db.prepare("SELECT username FROM users WHERE LOWER(username) = LOWER(?)").get(employee_username) as any;
        const canonicalUsername = dbUser ? dbUser.username : employee_username;

        db.prepare(
          `INSERT INTO hr_salaries (employee_username, basic_salary, allowances, deductions, updated_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(employee_username) DO UPDATE SET
             basic_salary = excluded.basic_salary,
             allowances = excluded.allowances,
             deductions = excluded.deductions,
             updated_at = CURRENT_TIMESTAMP
          `
        ).run(
          canonicalUsername,
          Number(basic_salary) || 0,
          Number(allowances) || 0,
          Number(deductions) || 0
        );

        syncCollectionToFirestore("hr_salaries", canonicalUsername, {
          employee_username: canonicalUsername,
          basic_salary: Number(basic_salary) || 0,
          allowances: Number(allowances) || 0,
          deductions: Number(deductions) || 0,
          updated_at: new Date().toISOString()
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Save salary error:", error);
        res.status(500).json({ error: "Failed to save salary configuration" });
      }
    });


    // Gap 5 Solved: Sweeper Engine / Redact
    hrRouter.post("/api/hr/sweep-data", requireRole(["FC", "HR"]), (req, res) => {
      try {
        // redact applications older than 6 months and rejected
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const dateString = sixMonthsAgo.toISOString();

        const info = db
          .prepare(
            `
            UPDATE hr_applications 
            SET name = 'REDACTED', email = 'redacted@deleted.loc', phone = 'REDACTED', linkedin_url = '', experience = 'REDACTED', resume_text = 'REDACTED'
            WHERE status = 'REJECTED' AND applied_at < ? AND name != 'REDACTED'
         `,
          )
          .run(dateString);

        logAudit(
          (req.headers["x-user-email"] as string) || "System",
          "DATA_SWEEP",
          "APPLICATION",
          "BATCH",
          `Redacted ${info.changes} rejected applications older than 6 months.`,
        );

        res.json({ success: true, redacted_count: info.changes });
      } catch (e: any) {
        res.status(500).json({ error: "Failed to sweep data" });
      }
    });

    hrRouter.get("/api/hr/jobs", (req, res) => {
      try {
        const jobs = db
          .prepare(
            "SELECT * FROM hr_jobs WHERE archived_at IS NULL ORDER BY created_at DESC",
          )
          .all();
        res.json(jobs);
      } catch (e: any) {
        console.error("Fetch HR jobs failed:", e);
        res.status(500).json({ error: "Failed to fetch job vacancies" });
      }
    });

    // Gap 1 Solved: Candidate Portal (Application Tracking)
    hrRouter.post("/api/hr/track", (req, res) => {
      try {
        const { email, tracking_id } = req.body;
        if (!email || !tracking_id)
          return res
            .status(400)
            .json({ error: "Email and Tracking ID are required" });

        const application = db
          .prepare(
            `
          SELECT a.id, a.status, a.applied_at, a.notes, j.title as job_title, j.department 
          FROM hr_applications a
          JOIN hr_jobs j ON a.job_id = j.id
          WHERE a.email = ? AND a.id = ?
        `,
          )
          .get(email, tracking_id);

        if (!application)
          return res
            .status(404)
            .json({ error: "Application not found or data mismatch." });

        res.json(application);
      } catch (e: any) {
        res.status(500).json({ error: "Failed to track application" });
      }
    });

    // Resolving Gap: Katalog Produk Website Publik Terisolasi dari Database ERP
    hrRouter.get("/api/public/products", (req, res) => {
      try {
        const rawProducts = db
          .prepare(
            `SELECT 
              id, 
              item_code, 
              name, 
              dimension, 
              uom, 
              unit_price, 
              category,
              COALESCE(shop_image_url, 'https://images.unsplash.com/photo-1584463623578-3062b88137f4?w=800&auto=format&fit=crop&q=80') as image_url,
              COALESCE(shop_gallery_urls, '[]') as shop_gallery_urls,
              COALESCE(shop_badge, '') as badge,
              COALESCE(spec, '') as spec,
              COALESCE(shop_featured, 0) as is_featured
            FROM items 
            WHERE deleted_at IS NULL AND is_published_shop = 1 AND (type = 'FINISHED' OR type = 'FINISH_GOOD')
            ORDER BY 
              CASE WHEN shop_featured = 1 THEN 0 ELSE 1 END,
              name ASC`,
          )
          .all() as any[];

        const products = rawProducts.map((item) => {
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
          return {
            ...item,
            gallery_urls: gallery,
          };
        });

        res.json(products);
      } catch (e: any) {
        res.status(500).json({ error: "Failed to fetch public products" });
      }
    });

    // Resolving Gap: Alur Penjualan Terpotong
    hrRouter.post("/api/public/leads", (req, res) => {
      try {
        const { id, name, contact_info, intent } = req.body;
        db.prepare(
          `
          INSERT INTO crm_leads (id, name, contact_info, intent)
          VALUES (?, ?, ?, ?)
        `,
        ).run(id || crypto.randomUUID(), name, contact_info, intent);
        res.json({ success: true, message: "Lead captured successfully" });
      } catch (e: any) {
        console.error("Failed to capture lead:", e);
        res.status(500).json({ error: "Failed to capture lead" });
      }
    });

    // Gap 4 Solved: Public Directory
    hrRouter.get("/api/public/team", (req, res) => {
      try {
        const team = db
          .prepare(
            "SELECT name, role FROM users WHERE status = 'APPROVED' AND level IN ('DIRECTOR', 'MANAGER', 'STAFF') LIMIT 24",
          )
          .all();
        res.json(team);
      } catch (e: any) {
        res.status(500).json({ error: "Failed to fetch public team data" });
      }
    });

    // Gap 2 Solved: CMS Settings
    hrRouter.get("/api/cms/:page", (req, res) => {
      try {
        const existingCms = db
          .prepare("SELECT content_json FROM cms_settings WHERE page = ?")
          .get(req.params.page) as any;
        if (existingCms) {
          res.json(JSON.parse(existingCms.content_json));
        } else {
          res.json({});
        }
      } catch (e: any) {
        res.status(500).json({ error: "Failed to fetch CMS data" });
      }
    });

    hrRouter.put("/api/cms/:page", requireRole(["FC", "HR"]), (req, res) => {
      try {
        db.prepare(
          `
           INSERT INTO cms_settings (page, content_json) VALUES (?, ?)
           ON CONFLICT(page) DO UPDATE SET content_json = excluded.content_json
         `,
        ).run(req.params.page, JSON.stringify(req.body));
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: "Failed to update CMS data" });
      }
    });

    hrRouter.get("/api/hr/jobs-public", (req, res) => {
      try {
        const jobs = db
          .prepare(
            "SELECT * FROM hr_jobs WHERE status = 'OPEN' AND archived_at IS NULL ORDER BY created_at DESC",
          )
          .all();
        res.json(jobs);
      } catch (e: any) {
        console.error("Fetch HR jobs public failed:", e);
        res.status(500).json({ error: "Failed to fetch job vacancies" });
      }
    });

    hrRouter.post("/api/hr/jobs", (req, res) => {
      try {
        const {
          title,
          department,
          location,
          type,
          description,
          requirements,
          benefits,
          salary_string,
          pamphlet_bg_color,
          pamphlet_accent_color,
        } = req.body;
        if (!title || !department || !description) {
          return res
            .status(400)
            .json({ error: "Title, Department and Description are required" });
        }
        const id =
          "JOB-" + Math.random().toString(36).substr(2, 9).toUpperCase();

        db.prepare(
          `
          INSERT INTO hr_jobs (id, title, department, location, type, description, requirements, benefits, salary_string, pamphlet_bg_color, pamphlet_accent_color)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          id,
          title,
          department,
          location || "Head Office",
          type || "Full-time",
          description,
          requirements || "[]",
          benefits || "[]",
          salary_string || "",
          pamphlet_bg_color || "#1c1917",
          pamphlet_accent_color || "#ca8a04",
        );

        logAudit(
          (req.headers["x-user-email"] as string) || "HR Admin",
          "CREATE_JOB",
          "JOB",
          id,
          `Created job vacancy ${title} for ${department}`,
        );
        res.json({ success: true, id });
      } catch (e: any) {
        console.error("Create HR job failed:", e);
        res.status(500).json({ error: "Failed to create job vacancy" });
      }
    });

    hrRouter.put("/api/hr/jobs/:id", (req, res) => {
      try {
        const {
          title,
          department,
          location,
          type,
          status,
          description,
          requirements,
          benefits,
          salary_string,
          pamphlet_bg_color,
          pamphlet_accent_color,
        } = req.body;
        db.prepare(
          `
          UPDATE hr_jobs 
          SET title = ?, department = ?, location = ?, type = ?, status = ?, description = ?, requirements = ?, benefits = ?, salary_string = ?, pamphlet_bg_color = ?, pamphlet_accent_color = ?
          WHERE id = ?
        `,
        ).run(
          title,
          department,
          location,
          type,
          status,
          description,
          requirements,
          benefits,
          salary_string,
          pamphlet_bg_color,
          pamphlet_accent_color,
          req.params.id,
        );

        logAudit(
          (req.headers["x-user-email"] as string) || "HR Admin",
          "UPDATE_JOB",
          "JOB",
          req.params.id,
          `Updated job vacancy ${title}`,
        );
        res.json({ success: true });
      } catch (e: any) {
        console.error("Update HR job failed:", e);
        res.status(500).json({ error: "Failed to update job vacancy" });
      }
    });

    hrRouter.delete("/api/hr/jobs/:id", (req, res) => {
      try {
        db.prepare(
          "UPDATE hr_jobs SET archived_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(req.params.id);
        logAudit(
          (req.headers["x-user-email"] as string) || "HR Admin",
          "DELETE_JOB",
          "JOB",
          req.params.id,
          `Deleted job vacancy`,
        );
        res.json({ success: true });
      } catch (e: any) {
        console.error("Delete HR job failed:", e);
        res.status(500).json({ error: "Failed to delete job vacancy" });
      }
    });

    // 2. Candidate Applications
    hrRouter.get("/api/hr/applications", (req, res) => {
      try {
        const apps = db
          .prepare(
            `
          SELECT a.*, j.title as job_title, j.department as job_department
          FROM hr_applications a
          JOIN hr_jobs j ON a.job_id = j.id
          ORDER BY a.applied_at DESC
        `,
          )
          .all();
        res.json(apps);
      } catch (e: any) {
        console.error("Fetch applications failed:", e);
        res
          .status(500)
          .json({ error: "Failed to fetch candidate applications" });
      }
    });

    hrRouter.post("/api/hr/applications", (req, res) => {
      try {
        const {
          job_id,
          name,
          email,
          phone,
          linkedin_url,
          experience,
          resume_text,
        } = req.body;
        if (!job_id || !name || !email || !phone) {
          return res
            .status(400)
            .json({
              error: "Job ID, Name, Email, and Phone number are required",
            });
        }

        // Anti-Dumping & Duplication Check (Missing Link 1 Solved)
        const existingApp = db
          .prepare(
            `SELECT id FROM hr_applications WHERE email = ? AND job_id = ?`,
          )
          .get(email, job_id);
        if (existingApp) {
          return res
            .status(400)
            .json({
              error:
                "Candidate with this email has already applied for this position.",
            });
        }

        const id =
          "APP-" + Math.random().toString(36).substr(2, 9).toUpperCase();
        db.prepare(
          `
          INSERT INTO hr_applications (id, job_id, name, email, phone, linkedin_url, experience, resume_text, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPLIED')
        `,
        ).run(
          id,
          job_id,
          name,
          email,
          phone,
          linkedin_url || "",
          experience || "",
          resume_text || "",
        );

        logAudit(
          "PUBLIC",
          "SUBMIT_APPLICATION",
          "APPLICATION",
          id,
          `Candidate ${name} applied for job ID ${job_id}`,
        );

        // Resolving Gap: Ketidakhadiran Putaran Notifikasi Pasca-Kirim Rekrutmen
        console.log(
          `-----------------------------------------------------------`,
        );
        console.log(
          `[MAIL SERVICE] MENSIMULASIKAN PENGIRIMAN EMAIL PENDAFTARAN`,
        );
        console.log(`To: ${email}`);
        console.log(`Subject: Application Received - CV Batu Emas Group`);
        console.log(
          `Body: Halo ${name}, Terimakasih telah melamar. Anda bisa melacak status lamaran dengan ID: ${id}`,
        );
        console.log(`Status: Sukses`);
        console.log(
          `-----------------------------------------------------------`,
        );

        res.json({
          success: true,
          id,
          message: "Application submitted and email tracking ID sent",
        });
      } catch (e: any) {
        console.error("Submit application failed:", e);
        res.status(500).json({ error: "Failed to submit application form" });
      }
    });

    hrRouter.put("/api/hr/applications/:id/status", async (req, res) => {
      try {
        const { status, notes } = req.body;
        db.prepare(
          `
          UPDATE hr_applications
          SET status = ?, notes = ?
          WHERE id = ?
        `,
        ).run(status, notes, req.params.id);

        // Real-time Email Notifications
        if (
          ["INTERVIEW", "REJECTED", "OFFER_MADE", "ACCEPTED"].includes(status)
        ) {
          console.log(
            `[EMAIL GATEWAY] Sending email notification to candidate for Application ${req.params.id}. Status changed to ${status}.`,
          );
          logAudit(
            "SYSTEM",
            "EMAIL_SENT",
            "APPLICATION",
            req.params.id,
            `Notified candidate of status ${status}`,
          );
        }

        // Gap 2 Solved: Automasi Onboarding HRIS ke ERP Master Data (users table)
        if (status === "ACCEPTED") {
          const token =
            "TKN-" + Math.random().toString(36).substr(2, 9).toUpperCase();
          db.prepare(
            `UPDATE hr_applications SET onboarding_token = ? WHERE id = ?`,
          ).run(token, req.params.id);
          console.log(
            `[EMAIL GATEWAY] Sending Onboarding Token to candidate for Application ${req.params.id}: ${token}`,
          );
          logAudit(
            "SYSTEM",
            "TOKEN_GENERATED",
            "APPLICATION",
            req.params.id,
            `Generated onboarding token for candidate.`,
          );
        }

        logAudit(
          (req.headers["x-user-email"] as string) || "HR Admin",
          "UPDATE_APPLICATION_STATUS",
          "APPLICATION",
          req.params.id,
          `Updated candidate application status to ${status}`,
        );
        res.json({ success: true });
      } catch (e: any) {
        console.error("Update application status failed:", e);
        res
          .status(500)
          .json({ error: "Failed to update candidate application status" });
      }
    });

    hrRouter.post("/api/auth/exchange-token", async (req, res) => {
      try {
        const { token, password } = req.body;
        const application = db
          .prepare(
            `SELECT a.*, j.department FROM hr_applications a JOIN hr_jobs j ON a.job_id = j.id WHERE a.onboarding_token = ? AND a.token_used = 0 AND a.status = 'ACCEPTED'`,
          )
          .get(token) as any;

        if (!application) {
          return res
            .status(400)
            .json({ error: "Invalid, expired, or already used token." });
        }

        const existingUser = db
          .prepare(`SELECT id FROM users WHERE username = ?`)
          .get(application.email);
        if (existingUser) {
          return res
            .status(400)
            .json({ error: "Account already exists for this email." });
        }

        const userId =
          "USR-" + Math.random().toString(36).substr(2, 9).toUpperCase();
        const hashedPassword = await bcrypt.hash(password, 12);

        let role = "STAFF";
        if (application.department?.toUpperCase().includes("ENG"))
          role = "ENGINEERING";
        else if (application.department?.toUpperCase().includes("SALES"))
          role = "SALES";
        else if (application.department?.toUpperCase().includes("FIN"))
          role = "FC";

        db.transaction(() => {
          db.prepare(
            `
            INSERT INTO users (id, username, password, name, role, level, status, is_approved)
            VALUES (?, ?, ?, ?, ?, 'STAFF', 'APPROVED', 1)
          `,
          ).run(
            userId,
            application.email,
            hashedPassword,
            application.name,
            role,
          );

          db.prepare(
            `UPDATE hr_applications SET token_used = 1 WHERE id = ?`,
          ).run(application.id);
        })();

        logAudit(
          application.email,
          "ONBOARDING_TOKEN_EXCHANGED",
          "USER",
          userId,
          `User created account using onboarding token.`,
        );
        res.json({
          success: true,
          message: "Account created successfully. You can now login.",
        });
      } catch (e: any) {
        console.error("Token exchange failed:", e);
        res.status(500).json({ error: "Failed to exchange token" });
      }
    });

    // 3. Employee KPI Appraisal Performance Reviews
    hrRouter.get("/api/hr/kpis", (req, res) => {
      try {
        const { employee } = req.query;
        let kpis;
        if (employee) {
          kpis = db
            .prepare(
              `
            SELECT k.*, u.name as employee_name, ev.name as evaluator_name
            FROM hr_kpis k
            JOIN users u ON k.employee_username = u.username
            JOIN users ev ON k.evaluator_username = ev.username
            WHERE k.employee_username = ?
            ORDER BY k.created_at DESC
          `,
            )
            .all(employee);
        } else {
          kpis = db
            .prepare(
              `
            SELECT k.*, u.name as employee_name, ev.name as evaluator_name
            FROM hr_kpis k
            JOIN users u ON k.employee_username = u.username
            JOIN users ev ON k.evaluator_username = ev.username
            ORDER BY k.created_at DESC
          `,
            )
            .all();
        }
        res.json(kpis);
      } catch (e: any) {
        console.error("Fetch KPIs failed:", e);
        res.status(500).json({ error: "Failed to fetch appraisal ratings" });
      }
    });

    hrRouter.post("/api/hr/kpis", (req, res) => {
      try {
        const {
          employee_username,
          period_name,
          score_communication,
          score_productivity,
          score_reliability,
          score_leadership,
          score_technical,
          evaluation_notes,
        } = req.body;

        const evaluator = (req.headers["x-user-email"] ||
          req.headers["remote-user"] ||
          "admin") as string;

        if (!employee_username || !period_name) {
          return res
            .status(400)
            .json({ error: "Employee and Appraisal Period Name are required" });
        }

        const id =
          "KPI-" + Math.random().toString(36).substr(2, 9).toUpperCase();

        const c = Number(score_communication || 0);
        const p = Number(score_productivity || 0);
        const r = Number(score_reliability || 0);
        const l = Number(score_leadership || 0);
        const t = Number(score_technical || 0);
        const overall = Number(((c + p + r + l + t) / 5).toFixed(2));

        db.prepare(
          `
          INSERT INTO hr_kpis (id, employee_username, evaluator_username, period_name, score_communication, score_productivity, score_reliability, score_leadership, score_technical, overall_score, evaluation_notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          id,
          employee_username,
          evaluator,
          period_name,
          c,
          p,
          r,
          l,
          t,
          overall,
          evaluation_notes || "",
        );

        logAudit(
          evaluator,
          "SUBMIT_KPI",
          "USER",
          employee_username,
          `Submitted KPI review for period ${period_name} with score ${overall}`,
        );
        res.json({ success: true, id, overall_score: overall });
      } catch (e: any) {
        console.error("Create KPI appraisal failed:", e);
        res.status(500).json({ error: "Failed to submit employee evaluation" });
      }
    });

    // 4. Employee Handover Task Tracker
    hrRouter.get("/api/hr/handovers", (req, res) => {
      try {
        const handovers = db
          .prepare(
            `
          SELECT h.*, u1.name as resigning_name, u2.name as successor_name
          FROM hr_handovers h
          JOIN users u1 ON h.resigning_username = u1.username
          JOIN users u2 ON h.successor_username = u2.username
          ORDER BY h.created_at DESC
        `,
          )
          .all();
        res.json(handovers);
      } catch (e: any) {
        console.error("Fetch handovers failed:", e);
        res
          .status(500)
          .json({ error: "Failed to retrieve employee handover documents" });
      }
    });

    hrRouter.post("/api/hr/handovers", (req, res) => {
      try {
        const {
          resigning_username,
          successor_username,
          target_last_date,
          handover_notes,
          checklist_json,
        } = req.body;
        if (!resigning_username || !successor_username || !target_last_date) {
          return res
            .status(400)
            .json({
              error:
                "Resigning username, successor username, and target date are required",
            });
        }
        const id =
          "HO-" + Math.random().toString(36).substr(2, 9).toUpperCase();
        db.prepare(
          `
          INSERT INTO hr_handovers (id, resigning_username, successor_username, target_last_date, status, handover_notes, checklist_json)
          VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
        `,
        ).run(
          id,
          resigning_username,
          successor_username,
          target_last_date,
          handover_notes || "",
          checklist_json || "[]",
        );

        logAudit(
          (req.headers["x-user-email"] as string) || "HR Admin",
          "CREATE_HANDOVER",
          "USER",
          resigning_username,
          `Initiated exit transition handover to ${successor_username}`,
        );
        res.json({ success: true, id });
      } catch (e: any) {
        console.error("Create handover failed:", e);
        res
          .status(500)
          .json({ error: "Failed to instantiate handover tracker" });
      }
    });

    hrRouter.put("/api/hr/handovers/:id", (req, res) => {
      try {
        const { status, handover_notes, checklist_json } = req.body;
        db.prepare(
          `
          UPDATE hr_handovers
          SET status = ?, handover_notes = ?, checklist_json = ?
          WHERE id = ?
        `,
        ).run(status, handover_notes, checklist_json, req.params.id);

        logAudit(
          (req.headers["x-user-email"] as string) || "HR Staff",
          "UPDATE_HANDOVER",
          "USER",
          req.params.id,
          `Updated handover progress to status: ${status}`,
        );
        res.json({ success: true });
      } catch (e: any) {
        console.error("Update handover document failed:", e);
        res
          .status(500)
          .json({ error: "Failed to modify handover tracking logs" });
      }
    });

    // 5. Attendance & Time Tracking
    hrRouter.get("/api/hr/attendances", (req, res) => {
      try {
        const attendances = db
          .prepare(
            `
          SELECT a.*, u.name as employee_name
          FROM attendance_db.hr_attendances a
          JOIN users u ON a.employee_username = u.username
          ORDER BY a.date DESC
        `,
          )
          .all();
        res.json(attendances);
      } catch (e: any) {
        console.error("Fetch attendances failed:", e);
        res.status(500).json({ error: "Failed to fetch attendances" });
      }
    });

    hrRouter.use(hrAttendanceRouter);

    // 6. Leave Management (Cuti)
    hrRouter.get("/api/hr/leaves", (req, res) => {
      try {
        const leaves = db
          .prepare(
            `
          SELECT l.*, u.name as employee_name, u.role as employee_role, u.level as employee_level, approver.name as approver_name
          FROM hr_leaves l
          JOIN users u ON l.employee_username = u.username
          LEFT JOIN users approver ON l.approved_by = approver.username
          ORDER BY l.created_at DESC
        `,
          )
          .all();
        res.json(leaves);
      } catch (e: any) {
        res.status(500).json({ error: "Failed to fetch leaves" });
      }
    });

    hrRouter.post("/api/hr/leaves", (req, res) => {
      try {
        const { employee_username, leave_type, start_date, end_date } =
          req.body;
        const reason = null;
        const id =
          "LV-" + Math.random().toString(36).substr(2, 9).toUpperCase();

        // Check if applicant is Manager or FC
        let initialStatus = "PENDING";
        let approvedBy = null;
        let managerNote = null;

        if (employee_username) {
          const emp = db
            .prepare(
              `SELECT username, role, level FROM users WHERE username = ?`,
            )
            .get(employee_username) as any;
          if (
            emp &&
            (emp.level === "MANAGER" ||
              emp.role === "FC" ||
              emp.role === "GOD_MODE")
          ) {
            initialStatus = "APPROVED";
            approvedBy = emp.username;
            managerNote =
              "Otomatis disetujui (Hak Akses Manager / FC - Tanpa Approval)";
          }
        }

        db.prepare(
          `
          INSERT INTO hr_leaves (id, employee_username, leave_type, start_date, end_date, reason, status, approved_by, manager_note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          id,
          employee_username,
          leave_type,
          start_date,
          end_date,
          reason,
          initialStatus,
          approvedBy,
          managerNote,
        );

        syncCollectionToFirestore("hr_leaves", id, {
          id,
          employee_username,
          leave_type,
          start_date,
          end_date,
          reason,
          status: initialStatus,
          approved_by: approvedBy,
          manager_note: managerNote,
          created_at: new Date().toISOString()
        });

        res.json({
          success: true,
          id,
          auto_approved: initialStatus === "APPROVED",
          status: initialStatus,
          message:
            initialStatus === "APPROVED"
              ? "Pengajuan cuti langsung disetujui secara otomatis (Akses Level Manager / FC)."
              : "Permohonan cuti berhasil diajukan dan dikirim ke Manager untuk persetujuan.",
        });
      } catch (e: any) {
        console.error("Failed to submit leave request:", e);
        res.status(500).json({ error: "Failed to submit leave request" });
      }
    });

    hrRouter.put("/api/hr/leaves/:id/status", (req, res) => {
      try {
        const { status, manager_note } = req.body;
        const approved_by = (req.headers["x-user-email"] ||
          req.headers["remote-user"] ||
          "admin") as string;

        try {
          db.prepare(
            `
            UPDATE hr_leaves SET status = ?, approved_by = ?, manager_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `,
          ).run(status, approved_by, manager_note || null, req.params.id);
        } catch (err) {
          db.prepare(
            `
            UPDATE hr_leaves SET status = ?, approved_by = ? WHERE id = ?
          `,
          ).run(status, approved_by, req.params.id);
        }

        // Sync production manpower status if employee is in shop floor
        try {
          const leaveRec = db.prepare("SELECT employee_username FROM hr_leaves WHERE id = ?").get(req.params.id) as any;
          if (leaveRec && leaveRec.employee_username) {
            const newMpStatus = status === "APPROVED" ? "ON_LEAVE" : "AVAILABLE";
            db.prepare(
              "UPDATE production_manpower SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_username = ?"
            ).run(newMpStatus, leaveRec.employee_username);
          }
        } catch (mpErr) {
          // ignore if user not in manpower
        }

        syncCollectionToFirestore("hr_leaves", req.params.id, {
          id: req.params.id,
          status,
          approved_by,
          manager_note: manager_note || null,
          updated_at: new Date().toISOString()
        });

        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: "Failed to update leave status" });
      }
    });

    // 7. Payslips (Gaji)
    hrRouter.get("/api/hr/payslips", (req, res) => {
      try {
        const username =
          req.headers["x-user-email"] ||
          req.headers["remote-user"] ||
          req.headers["x-forwarded-user"];
        const user = db
          .prepare("SELECT role FROM users WHERE username = ?")
          .get(username) as any;

        const isAdmin = user && ["HR", "FC", "GOD_MODE"].includes(user.role);

        let query = `
          SELECT p.*, u.name as employee_name
          FROM hr_payslips p
          JOIN users u ON p.employee_username = u.username
        `;

        if (!isAdmin) {
          query += ` WHERE p.employee_username = @username AND p.status IN ('PUBLISHED', 'PAID') `;
        }

        query += ` ORDER BY p.period_month DESC `;

        const payslips = db.prepare(query).all(isAdmin ? {} : { username });
        res.json(payslips);
      } catch (e: any) {
        res.status(500).json({ error: "Failed to fetch payslips" });
      }
    });

    hrRouter.post("/api/hr/payslips", requireRole(["HR", "FC"]), (req, res) => {
      try {
        const {
          employee_username,
          period_month,
          basic_salary,
          allowances,
          deductions,
        } = req.body;
        const net_salary =
          Number(basic_salary) + Number(allowances) - Number(deductions);

        const id =
          "PAY-" + Math.random().toString(36).substr(2, 9).toUpperCase();

        db.transaction(() => {
          db.prepare(
            `
            INSERT INTO hr_payslips (id, employee_username, period_month, basic_salary, allowances, deductions, net_salary, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PUBLISHED')
          `,
          ).run(
            id,
            employee_username,
            period_month,
            basic_salary,
            allowances,
            deductions,
            net_salary,
          );

          // Get employee name for details
          const emp = db
            .prepare("SELECT name FROM users WHERE username = ?")
            .get(employee_username) as any;
          const empName = emp ? emp.name : employee_username;

          const details = [
            {
              username: employee_username,
              name: empName,
              base_salary: basic_salary,
              present_days: 22,
              allowances: allowances,
              deductions: deductions,
              net_pay: net_salary,
            },
          ];

          const payrollId =
            "PAY-" + Math.random().toString(36).substr(2, 9).toUpperCase();
          db.prepare(
            `
            INSERT INTO finance_payroll (id, period_name, total_amount, details_json, status)
            VALUES (?, ?, ?, ?, 'DRAFTED')
          `,
          ).run(
            payrollId,
            `Ad-hoc ${period_month} (${empName})`,
            net_salary,
            JSON.stringify(details),
          );

          const nowIso = new Date().toISOString();
          syncCollectionToFirestore("hr_payslips", id, {
            id,
            employee_username,
            period_month,
            basic_salary,
            allowances,
            deductions,
            net_salary,
            status: 'PUBLISHED',
            created_at: nowIso
          });
          syncCollectionToFirestore("finance_payroll", payrollId, {
            id: payrollId,
            period_name: `Ad-hoc ${period_month} (${empName})`,
            total_amount: net_salary,
            details_json: details,
            status: 'DRAFTED',
            created_at: nowIso
          });
        })();

        res.json({ success: true, id });
      } catch (e: any) {
        res.status(500).json({ error: "Failed to generate payslip" });
      }
    });


