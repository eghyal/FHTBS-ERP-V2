import { Router } from "express";
import db from "../../db/database.ts";
import { syncCollectionToFirestore, deleteDocFromFirestore } from "../../db/firebaseSync.ts";
import crypto from "crypto";
import QRCode from "qrcode";
import { requireRole } from "../../middleware/auth.ts";
import { logAudit } from "../../utils/audit.ts";
import { isValidDailyAuthKey } from "../../utils/auth.ts";
import { syncProjectGanttTasks } from "../../utils/ganttUtils.ts";
import { generateSignedWotQr, verifyAndParseWotQr, signWotPayload } from "../../utils/qrCrypto.ts";

import { computeNdpRippleAnalysis, handleCreateNdp, handleGetNdps, handleGetActiveNdps, handleGetNdpImpactAnalysis, handlePreviewImpact, handleRescheduleTrigger, handleResolveNdp, emitProductionUpdate, getHeijunkaThreshold, getBomProcurementPipelineStatus, checkRecursivePredecessorsCompleted, getAvailableInputWipForBop, checkPredecessorsReadyForPipelining, syncProjectMaterialAndWakeProcesses, autoResolveDownstreamProductNodes, preemptiveAutoPauseConflictingSteps, planningCache, CACHE_TTL_MS, invalidatePlanningCache, handleCalculateLoad, handleGetProductionLogs, handleAcknowledgeFr, handleFulfillFr, handleRejectFr, handleCloseFr, autoStartDownstreamProcesses } from "./production_utils.ts";

export const manpowerRouter = Router();

manpowerRouter.get("/api/production/manpower", (req, res) => {
      try {
        const { shift, status, specialization, search } = req.query;
        let query = `
          SELECT mp.*, 
                 p.name as active_project_name, 
                 COALESCE(p.spk_number, s.spk_number, p.spk_id, p.id) as active_spk_number,
                 p.customer as active_customer,
                 u.role as hris_role,
                 u.level as hris_level,
                 u.status as hris_status
          FROM production_manpower mp
          LEFT JOIN projects p ON mp.active_project_id = p.id
          LEFT JOIN spks s ON (p.spk_id = s.id OR p.id = s.project_id)
          LEFT JOIN users u ON mp.user_username = u.username
          WHERE mp.archived_at IS NULL
        `;
        const params: any[] = [];

        if (shift && shift !== "ALL") {
          query += ` AND mp.shift = ?`;
          params.push(shift);
        }
        if (status && status !== "ALL") {
          query += ` AND mp.status = ?`;
          params.push(status);
        }
        if (specialization && specialization !== "ALL") {
          query += ` AND mp.specialization = ?`;
          params.push(specialization);
        }
        if (search) {
          query += ` AND (mp.name LIKE ? OR mp.nik LIKE ? OR mp.role_title LIKE ? OR mp.specialization LIKE ?)`;
          const searchTerm = `%${search}%`;
          params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        query += ` ORDER BY 
          CASE mp.status 
            WHEN 'ON_DUTY' THEN 1 
            WHEN 'AVAILABLE' THEN 2 
            WHEN 'REST' THEN 3 
            WHEN 'ON_LEAVE' THEN 4 
            ELSE 5 
          END, mp.name ASC`;

        const rows = db.prepare(query).all(...params) as any[];

        const formatted = rows.map((r) => {
          let certs = [];
          try {
            certs = typeof r.certifications === "string" ? JSON.parse(r.certifications) : r.certifications || [];
          } catch (e) {
            certs = [];
          }
          return {
            ...r,
            certifications: certs,
          };
        });

        res.json(formatted);
      } catch (err: any) {
        console.error("Error fetching manpower:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.post("/api/production/manpower/reset-defaults", (req, res) => {
      try {
        const defaultOperators = [
          {
            id: "mp-001",
            user_username: "bambang_cnc",
            nik: "MP-2024-001",
            name: "Bambang Sudirman",
            role_title: "Senior CNC Machinist & Programmer",
            skill_level: "MASTER",
            specialization: "Machining (CNC / Milling)",
            shift: "SHIFT_1",
            status: "ON_DUTY",
            phone: "+62 812-3456-7801",
            email: "bambang.cnc@factory.local",
            hourly_rate: 65000,
            certifications: JSON.stringify(["Fanuc 5-Axis Certified", "ISO 9001:2015 Machining"]),
            active_project_id: null,
            active_task_name: "CNC Milling Impeller Shaft Housing",
            total_hours_worked: 320.5,
            completed_tasks_count: 48,
            efficiency_rating: 98.4,
            notes: "Lead machinist for high-precision components and turbine casings."
          },
          {
            id: "mp-002",
            user_username: "agus_welder",
            nik: "MP-2024-002",
            name: "Agus Pratama",
            role_title: "Certified ASME TIG/MIG Welder",
            skill_level: "SENIOR",
            specialization: "Welding & Fabrication",
            shift: "SHIFT_1",
            status: "AVAILABLE",
            phone: "+62 813-9876-5402",
            email: "agus.welder@factory.local",
            hourly_rate: 55000,
            certifications: JSON.stringify(["ASME Section IX 6G 6GR", "MIG/MAG Heavy Structure"]),
            active_project_id: null,
            active_task_name: null,
            total_hours_worked: 245.0,
            completed_tasks_count: 36,
            efficiency_rating: 96.2,
            notes: "Expert in stainless steel piping and pressure vessel welding."
          },
          {
            id: "mp-003",
            user_username: "dedi_fitter",
            nik: "MP-2024-003",
            name: "Dedi Supriyanto",
            role_title: "Mechanical Assembly Technician",
            skill_level: "SENIOR",
            specialization: "Assembly & Fitting",
            shift: "SHIFT_2",
            status: "ON_DUTY",
            phone: "+62 818-1234-5603",
            email: "dedi.assembly@factory.local",
            hourly_rate: 48000,
            certifications: JSON.stringify(["Hydraulic Systems Specialist", "Torque Tightening QA"]),
            active_project_id: null,
            active_task_name: "Hydraulic Pump Sub-assembly & Torque Alignment",
            total_hours_worked: 210.0,
            completed_tasks_count: 29,
            efficiency_rating: 94.8,
            notes: "Precision gearbox alignment and bearing press-fitting specialist."
          },
          {
            id: "mp-004",
            user_username: "rian_qc",
            nik: "MP-2024-004",
            name: "Rian Hidayat",
            role_title: "Quality Control & NDT Inspector",
            skill_level: "SENIOR",
            specialization: "Quality Control",
            shift: "SHIFT_1",
            status: "AVAILABLE",
            phone: "+62 819-5566-7704",
            email: "rian.qc@factory.local",
            hourly_rate: 52000,
            certifications: JSON.stringify(["NDT Ultrasonic Testing Level II", "CMM Mitutoyo Operator"]),
            active_project_id: null,
            active_task_name: null,
            total_hours_worked: 180.0,
            completed_tasks_count: 52,
            efficiency_rating: 99.1,
            notes: "Authorized final dimensional report and CMM coordinate verifier."
          },
          {
            id: "mp-005",
            user_username: "hendra_finishing",
            nik: "MP-2024-005",
            name: "Hendra Wijaya",
            role_title: "Surface Finishing & Epoxy Specialist",
            skill_level: "JUNIOR",
            specialization: "Finishing & Coating",
            shift: "SHIFT_2",
            status: "AVAILABLE",
            phone: "+62 811-9988-3305",
            email: "hendra.finishing@factory.local",
            hourly_rate: 42000,
            certifications: JSON.stringify(["Sandblasting Safety SA 2.5", "High-Solid Polyurethane Painting"]),
            active_project_id: null,
            active_task_name: null,
            total_hours_worked: 140.0,
            completed_tasks_count: 18,
            efficiency_rating: 91.5,
            notes: "Expert in heavy duty marine-grade blasting and primer spray."
          },
          {
            id: "mp-006",
            user_username: "fajar_electric",
            nik: "MP-2024-006",
            name: "Fajar Nugroho",
            role_title: "Electrical & Control Wiring Tech",
            skill_level: "SENIOR",
            specialization: "Electrical & Wiring",
            shift: "GENERAL",
            status: "ON_DUTY",
            phone: "+62 812-7711-4406",
            email: "fajar.electric@factory.local",
            hourly_rate: 58000,
            certifications: JSON.stringify(["PLC Schneider Wiring", "K3 Listrik Kemnaker RI"]),
            active_project_id: null,
            active_task_name: "Control Panel Terminal Termination & Wire Harnessing",
            total_hours_worked: 310.0,
            completed_tasks_count: 41,
            efficiency_rating: 97.0,
            notes: "Control panel layout wiring and PLC I/O loop verification."
          },
          {
            id: "mp-007",
            user_username: "wahyu_lathe",
            nik: "MP-2024-007",
            name: "Wahyu Setiawan",
            role_title: "Junior CNC Lathe Operator",
            skill_level: "JUNIOR",
            specialization: "Machining (CNC / Milling)",
            shift: "SHIFT_3",
            status: "AVAILABLE",
            phone: "+62 856-1122-3307",
            email: "wahyu.s@factory.local",
            hourly_rate: 38000,
            certifications: JSON.stringify(["Basic G-Code Machining", "Tool Offset Calibration"]),
            active_project_id: null,
            active_task_name: null,
            total_hours_worked: 95.0,
            completed_tasks_count: 14,
            efficiency_rating: 89.2,
            notes: "Third shift CNC night turning operator under supervision."
          },
          {
            id: "mp-008",
            user_username: "tri_toolmaker",
            nik: "MP-2024-008",
            name: "Tri Wibowo",
            role_title: "Tool & Die Maker",
            skill_level: "MASTER",
            specialization: "Machining (CNC / Milling)",
            shift: "SHIFT_1",
            status: "ON_LEAVE",
            phone: "+62 813-2233-4408",
            email: "tri.wibowo@factory.local",
            hourly_rate: 62000,
            certifications: JSON.stringify(["Progressive Die Design", "Jig & Fixture Prototyping"]),
            active_project_id: null,
            active_task_name: null,
            total_hours_worked: 410.0,
            completed_tasks_count: 65,
            efficiency_rating: 98.9,
            notes: "Jig & fixture fabrication expert with 15+ years experience."
          }
        ];

        const tx = db.transaction(() => {
          // Clear existing manpower and assignments
          db.prepare(`DELETE FROM production_manpower_assignments`).run();
          db.prepare(`DELETE FROM production_manpower`).run();

          const insertStmt = db.prepare(`
            INSERT INTO production_manpower (
              id, user_username, nik, name, role_title, skill_level, specialization, shift, status,
              phone, email, hourly_rate, certifications, active_project_id, active_task_name,
              total_hours_worked, completed_tasks_count, efficiency_rating, notes
            ) VALUES (
              @id, @user_username, @nik, @name, @role_title, @skill_level, @specialization, @shift, @status,
              @phone, @email, @hourly_rate, @certifications, @active_project_id, @active_task_name,
              @total_hours_worked, @completed_tasks_count, @efficiency_rating, @notes
            )
          `);

          for (const op of defaultOperators) {
            insertStmt.run(op);
          }
        });

        tx();

        res.json({ success: true, message: "Manpower data reset to standard default production roster." });
      } catch (err: any) {
        console.error("Error resetting manpower defaults:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.get("/api/production/manpower/hris-candidates", (req, res) => {
      try {
        // Query users with production-related roles
        const candidates = db.prepare(`
          SELECT u.id, u.username, u.name, u.role, u.level, u.status, u.created_at,
                 mp.id as linked_manpower_id,
                 mp.nik as linked_nik,
                 mp.role_title as linked_role_title,
                 mp.shift as linked_shift,
                 mp.status as linked_status
          FROM users u
          LEFT JOIN production_manpower mp ON u.username = mp.user_username AND mp.archived_at IS NULL
          WHERE u.role IN ('PRODUCTION', 'OPERATOR', 'TECHNICIAN', 'ENGINEERING', 'QC', 'MAINTENANCE')
             OR u.username LIKE '%cnc%' 
             OR u.username LIKE '%welder%' 
             OR u.username LIKE '%fitter%' 
             OR u.username LIKE '%qc%' 
             OR u.username LIKE '%finishing%' 
             OR u.username LIKE '%electric%' 
             OR u.username LIKE '%lathe%' 
             OR u.username LIKE '%toolmaker%' 
             OR u.username LIKE '%operator%'
          ORDER BY u.name ASC
        `).all() as any[];

        res.json(candidates);
      } catch (err: any) {
        console.error("Error fetching HRIS production candidates:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.post("/api/production/manpower/sync-hris", (req, res) => {
      try {
        const prodUsers = db.prepare(`
          SELECT u.*, mp.id as mp_id
          FROM users u
          LEFT JOIN production_manpower mp ON u.username = mp.user_username AND mp.archived_at IS NULL
          WHERE u.role IN ('PRODUCTION', 'OPERATOR', 'TECHNICIAN', 'ENGINEERING', 'QC', 'MAINTENANCE')
             OR u.username LIKE '%cnc%' 
             OR u.username LIKE '%welder%' 
             OR u.username LIKE '%fitter%' 
             OR u.username LIKE '%qc%' 
             OR u.username LIKE '%finishing%' 
             OR u.username LIKE '%electric%' 
             OR u.username LIKE '%lathe%' 
             OR u.username LIKE '%toolmaker%'
        `).all() as any[];

        let importedCount = 0;
        let updatedCount = 0;

        const syncTx = db.transaction(() => {
          const insertStmt = db.prepare(`
            INSERT INTO production_manpower (
              id, user_username, nik, name, role_title, skill_level, specialization, shift, status,
              phone, email, hourly_rate, certifications, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const user of prodUsers) {
            if (!user.mp_id) {
              const id = `mp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
              const generatedNik = `MP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
              
              let spec = "Machining (CNC / Milling)";
              let title = "Production Operator / Technician";
              const uLower = (user.username + " " + user.name).toLowerCase();
              if (uLower.includes("weld")) { spec = "Welding & Fabrication"; title = "Welder / Fabricator"; }
              else if (uLower.includes("fitter") || uLower.includes("assembl")) { spec = "Assembly & Fitting"; title = "Assembly Technician"; }
              else if (uLower.includes("qc") || uLower.includes("inspect")) { spec = "Quality Control"; title = "QC Inspector"; }
              else if (uLower.includes("finish") || uLower.includes("paint") || uLower.includes("coat")) { spec = "Finishing & Coating"; title = "Finishing Specialist"; }
              else if (uLower.includes("electr") || uLower.includes("wire")) { spec = "Electrical & Wiring"; title = "Electrical Technician"; }
              else if (uLower.includes("tool") || uLower.includes("die")) { spec = "Machining (CNC / Milling)"; title = "Tool & Die Specialist"; }

              insertStmt.run(
                id,
                user.username,
                generatedNik,
                user.name,
                title,
                user.level === "MANAGER" ? "MASTER" : "SENIOR",
                spec,
                "SHIFT_1",
                "AVAILABLE",
                "+62 812-0000-0000",
                `${user.username}@factory.local`,
                48000,
                JSON.stringify(["HRIS Onboarded", "Safety Induction Certified"]),
                "Automatically synchronized from HRIS Production Directory."
              );
              importedCount++;
            } else {
              // Update user name / details if modified in users
              db.prepare(`
                UPDATE production_manpower
                SET name = COALESCE(?, name),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(user.name, user.mp_id);
              updatedCount++;
            }
          }
        });

        syncTx();

        res.json({
          success: true,
          importedCount,
          updatedCount,
          message: `HRIS Sync complete: ${importedCount} production operators imported, ${updatedCount} profiles refreshed.`
        });
      } catch (err: any) {
        console.error("Error syncing with HRIS:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.get("/api/production/manpower/stats", (req, res) => {
      try {
        const allMp = db.prepare(`SELECT * FROM production_manpower WHERE archived_at IS NULL`).all() as any[];
        const totalCount = allMp.length;
        const onDutyCount = allMp.filter((m) => m.status === "ON_DUTY").length;
        const availableCount = allMp.filter((m) => m.status === "AVAILABLE").length;
        const onLeaveCount = allMp.filter((m) => m.status === "ON_LEAVE").length;
        const restCount = allMp.filter((m) => m.status === "REST").length;

        const totalHours = allMp.reduce((acc, m) => acc + (Number(m.total_hours_worked) || 0), 0);
        const avgEfficiency = totalCount > 0
          ? Math.round((allMp.reduce((acc, m) => acc + (Number(m.efficiency_rating) || 90), 0) / totalCount) * 10) / 10
          : 0;

        const shifts = {
          SHIFT_1: allMp.filter((m) => m.shift === "SHIFT_1").length,
          SHIFT_2: allMp.filter((m) => m.shift === "SHIFT_2").length,
          SHIFT_3: allMp.filter((m) => m.shift === "SHIFT_3").length,
          GENERAL: allMp.filter((m) => m.shift === "GENERAL").length,
        };

        const skillTiers = {
          MASTER: allMp.filter((m) => m.skill_level === "MASTER").length,
          SENIOR: allMp.filter((m) => m.skill_level === "SENIOR").length,
          JUNIOR: allMp.filter((m) => m.skill_level === "JUNIOR").length,
          APPRENTICE: allMp.filter((m) => m.skill_level === "APPRENTICE").length,
        };

        res.json({
          total: totalCount,
          onDuty: onDutyCount,
          available: availableCount,
          onLeave: onLeaveCount,
          rest: restCount,
          totalHours: Math.round(totalHours * 10) / 10,
          avgEfficiency,
          utilizationRate: totalCount > 0 ? Math.round((onDutyCount / totalCount) * 100) : 0,
          shifts,
          skillTiers
        });
      } catch (err: any) {
        console.error("Error fetching manpower stats:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.post("/api/production/manpower", (req, res) => {
      try {
        const {
          user_username,
          nik,
          name,
          role_title,
          skill_level,
          specialization,
          shift,
          status,
          phone,
          email,
          hourly_rate,
          certifications,
          notes,
        } = req.body;

        if (!name || !role_title || !specialization) {
          return res.status(400).json({ error: "Name, Role Title, and Specialization are required" });
        }

        const generatedNik = nik?.trim() || `MP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
        const id = `mp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const certsStr = Array.isArray(certifications) ? JSON.stringify(certifications) : "[]";

        db.prepare(`
          INSERT INTO production_manpower (
            id, user_username, nik, name, role_title, skill_level, specialization, shift, status,
            phone, email, hourly_rate, certifications, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          user_username || null,
          generatedNik,
          name,
          role_title,
          skill_level || "SENIOR",
          specialization,
          shift || "SHIFT_1",
          status || "AVAILABLE",
          phone || null,
          email || null,
          Number(hourly_rate) || 45000,
          certsStr,
          notes || null
        );

        const created = db.prepare(`SELECT * FROM production_manpower WHERE id = ?`).get(id);
        res.json({ success: true, manpower: created, message: "New manpower registered successfully" });
      } catch (err: any) {
        console.error("Error adding manpower:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.put("/api/production/manpower/:id", (req, res) => {
      try {
        const { id } = req.params;
        const {
          user_username,
          nik,
          name,
          role_title,
          skill_level,
          specialization,
          shift,
          status,
          phone,
          email,
          hourly_rate,
          certifications,
          notes,
          efficiency_rating,
          total_hours_worked,
        } = req.body;

        const existing = db.prepare(`SELECT * FROM production_manpower WHERE id = ?`).get(id);
        if (!existing) {
          return res.status(404).json({ error: "Manpower not found" });
        }

        const certsStr = Array.isArray(certifications) ? JSON.stringify(certifications) : (typeof certifications === "string" ? certifications : "[]");

        db.transaction(() => {
          db.prepare(`
            UPDATE production_manpower
            SET user_username = COALESCE(?, user_username),
                nik = COALESCE(?, nik),
                name = COALESCE(?, name),
                role_title = COALESCE(?, role_title),
                skill_level = COALESCE(?, skill_level),
                specialization = COALESCE(?, specialization),
                shift = COALESCE(?, shift),
                status = COALESCE(?, status),
                phone = ?,
                email = ?,
                hourly_rate = COALESCE(?, hourly_rate),
                certifications = ?,
                notes = ?,
                efficiency_rating = COALESCE(?, efficiency_rating),
                total_hours_worked = COALESCE(?, total_hours_worked),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            user_username,
            nik,
            name,
            role_title,
            skill_level,
            specialization,
            shift,
            status,
            phone || null,
            email || null,
            hourly_rate !== undefined ? Number(hourly_rate) : null,
            certsStr,
            notes || null,
            efficiency_rating !== undefined ? Number(efficiency_rating) : null,
            total_hours_worked !== undefined ? Number(total_hours_worked) : null,
            id
          );

          if (status === 'ON_LEAVE' || status === 'INACTIVE') {
            db.prepare(`
              UPDATE production_manpower_assignments
              SET status = 'CANCELLED'
              WHERE manpower_id = ? AND status IN ('ACTIVE', 'SCHEDULED')
            `).run(id);
          }
        })();

        const updated = db.prepare(`SELECT * FROM production_manpower WHERE id = ?`).get(id);
        res.json({ success: true, manpower: updated, message: "Manpower updated successfully" });
      } catch (err: any) {
        console.error("Error updating manpower:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.delete("/api/production/manpower/:id", (req, res) => {
      try {
        const { id } = req.params;

        const activeAssgn = db.prepare(`SELECT COUNT(*) as count FROM production_manpower_assignments WHERE manpower_id = ? AND status = 'ACTIVE'`).get(id) as any;
        if (activeAssgn && activeAssgn.count > 0) {
          return res.status(400).json({ error: "Cannot delete operator while they have an ACTIVE assignment. Please release them first." });
        }

        db.prepare(`
          UPDATE production_manpower
          SET archived_at = CURRENT_TIMESTAMP, status = 'ON_LEAVE'
          WHERE id = ?
        `).run(id);

        res.json({ success: true, message: "Manpower record archived successfully" });
      } catch (err: any) {
        console.error("Error archiving manpower:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.post("/api/production/manpower/:id/assign", (req, res) => {
      try {
        const { id } = req.params;
        const { project_id, task_name, bop_id, planned_hours, remarks, shift } = req.body;

        const mp = db.prepare(`SELECT * FROM production_manpower WHERE id = ?`).get(id) as any;
        if (!mp) {
          return res.status(404).json({ error: "Manpower not found" });
        }

        if (mp.status === 'ON_DUTY') {
          return res.status(400).json({ error: `Operator ${mp.name} is already assigned to a task. Release them first.` });
        }

        const assignId = `asgn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const assignDate = new Date().toISOString().slice(0, 10);

        const runTx = db.transaction(() => {
          // Record assignment
          db.prepare(`
            INSERT INTO production_manpower_assignments (
              id, manpower_id, project_id, task_name, bop_id, shift,
              assigned_date, planned_hours, status, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
          `).run(
            assignId,
            id,
            project_id || null,
            task_name || "Production Operation",
            bop_id || null,
            shift || mp.shift,
            assignDate,
            Number(planned_hours) || 8,
            remarks || null
          );

          // Update manpower state to ON_DUTY
          db.prepare(`
            UPDATE production_manpower
            SET status = 'ON_DUTY',
                active_project_id = ?,
                active_task_name = ?,
                shift = COALESCE(?, shift),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(project_id || null, task_name || "Active Operation", shift || null, id);
        });

        runTx();

        res.json({ success: true, message: `Assigned ${mp.name} to operation successfully.` });
      } catch (err: any) {
        console.error("Error assigning manpower:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.post("/api/production/manpower/:id/release", (req, res) => {
      try {
        const { id } = req.params;
        const { actual_hours, notes } = req.body;

        const mp = db.prepare(`SELECT * FROM production_manpower WHERE id = ?`).get(id) as any;
        if (!mp) {
          return res.status(404).json({ error: "Manpower not found" });
        }

        const workedHours = Number(actual_hours) || 8;

        const runTx = db.transaction(() => {
          // Close active assignment if any
          db.prepare(`
            UPDATE production_manpower_assignments
            SET status = 'COMPLETED',
                actual_hours = ?,
                remarks = CASE WHEN remarks IS NOT NULL THEN remarks || ' | ' || ? ELSE ? END
            WHERE manpower_id = ? AND status = 'ACTIVE'
          `).run(workedHours, notes || "Released normally", notes || "Released normally", id);

          // Update manpower state to AVAILABLE and increment stats
          db.prepare(`
            UPDATE production_manpower
            SET status = 'AVAILABLE',
                active_project_id = NULL,
                active_task_name = NULL,
                total_hours_worked = total_hours_worked + ?,
                completed_tasks_count = completed_tasks_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(workedHours, id);
        });

        runTx();

        res.json({ success: true, message: `${mp.name} has been released and is now Available.` });
      } catch (err: any) {
        console.error("Error releasing manpower:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.get("/api/production/manpower/:id/assignments", (req, res) => {
      try {
        const { id } = req.params;
        const rows = db.prepare(`
          SELECT a.*, p.name as project_name, COALESCE(p.spk_number, s.spk_number, p.spk_id, p.id) as spk_number
          FROM production_manpower_assignments a
          LEFT JOIN projects p ON a.project_id = p.id
          LEFT JOIN spks s ON (p.spk_id = s.id OR p.id = s.project_id)
          WHERE a.manpower_id = ?
          ORDER BY a.created_at DESC
          LIMIT 25
        `).all(id);
        res.json(rows);
      } catch (err: any) {
        console.error("Error fetching assignments:", err);
        res.status(500).json({ error: err.message });
      }
    });

