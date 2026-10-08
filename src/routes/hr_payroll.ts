import { isValidDailyAuthKey } from "../utils/auth.ts";
import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { calculateEmployeePayroll } from "../lib/hrisEngine.ts";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const router = Router();

    router.get(
      "/api/hr/payroll-requisitions",
      requireRole(["HR", "FC", "BOD"]),
      (req, res) => {
        try {
          const reqs = db
            .prepare(
              "SELECT * FROM payroll_requisitions ORDER BY created_at DESC",
            )
            .all();
          res.json(reqs);
        } catch (e: any) {
          console.error("Fetch PRq failed:", e);
          res.status(500).json({ error: "Failed to fetch payroll requisitions" });
        }
      },
    );

    router.get(
      "/api/hr/payroll-requisitions/:id",
      requireRole(["HR", "FC", "BOD"]),
      (req, res) => {
        try {
          const row = db
            .prepare("SELECT * FROM payroll_requisitions WHERE id = ?")
            .get(req.params.id) as any;
          if (!row) {
            return res.status(404).json({ error: "Payroll requisition not found" });
          }
          let details = [];
          try {
            details = JSON.parse(row.details_json || "[]");
          } catch (err) {
            details = [];
          }
          res.json({ ...row, details });
        } catch (e: any) {
          console.error("Fetch single PRq failed:", e);
          res.status(500).json({ error: "Failed to fetch payroll requisition" });
        }
      },
    );

    router.post(
      "/api/hr/payroll-requisitions/prepare",
      requireRole(["HR", "FC"]),
      (req, res) => {
        try {
          const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
          ];
          const pMonth = Number(req.body.month) || (new Date().getMonth() + 1);
          const pYear = Number(req.body.year) || new Date().getFullYear();
          const periodName = `${monthNames[pMonth - 1] || pMonth} ${pYear}`;

          const monthPrefix = `${pYear}-${String(pMonth).padStart(2, "0")}`;

          const employees = db
            .prepare(
              "SELECT username, name, role, level FROM users WHERE status = 'APPROVED' OR status IS NULL OR status = '' OR status = 'ACTIVE'",
            )
            .all() as any[];

          const monthAttendances = db
            .prepare(
              `SELECT 
                employee_username, 
                COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) as present_count,
                SUM(COALESCE(work_hours, 0)) as total_work_hours,
                SUM(COALESCE(overtime_hours, 0)) as total_ot_hours,
                SUM(COALESCE(labor_cost, 0)) as total_labor_cost
              FROM attendance_db.hr_attendances 
              WHERE date LIKE ? 
              GROUP BY employee_username`,
            )
            .all(`${monthPrefix}%`) as any[];
          const attendanceMap = new Map(
            monthAttendances.map((a) => [String(a.employee_username).toLowerCase(), a]),
          );

          // Pull approved factory project overtime schedules for this month
          const overtimeSchedules = db
            .prepare(
              `SELECT 
                pm.user_username,
                SUM(COALESCE(pos.overtime_hours, 0)) as total_sched_ot_hours
              FROM project_overtime_schedules pos
              JOIN production_manpower pm ON pos.manpower_id = pm.id
              WHERE pos.date LIKE ? AND pos.status = 'APPROVED'
              GROUP BY pm.user_username`,
            )
            .all(`${monthPrefix}%`) as any[];
          const otScheduleMap = new Map(
            overtimeSchedules.map((o) => [String(o.user_username).toLowerCase(), Number(o.total_sched_ot_hours) || 0]),
          );

          // Identify factory direct labor workers
          const allProductionStaff = db.prepare("SELECT user_username FROM production_manpower").all() as any[];
          const productionStaffSet = new Set(allProductionStaff.map((p) => String(p.user_username).toLowerCase()));

          const allKpis = db
            .prepare(
              "SELECT employee_username, MAX(overall_score) as max_score FROM hr_kpis GROUP BY employee_username",
            )
            .all() as any[];
          const kpiMap = new Map(
            allKpis.map((k) => [String(k.employee_username).toLowerCase(), k.max_score]),
          );

          const allSalaries = db
            .prepare("SELECT * FROM hr_salaries")
            .all() as any[];
          const salaryMap = new Map(
            allSalaries.map((s) => [String(s.employee_username).toLowerCase(), s]),
          );

          const details = employees.map((emp) => {
            const empUsernameLower = String(emp.username || "").toLowerCase();
            const customSalary = salaryMap.get(empUsernameLower);

            const baseSalary = customSalary?.basic_salary !== undefined && customSalary?.basic_salary !== null
              ? Number(customSalary.basic_salary)
              : 0;

            const attData = attendanceMap.get(empUsernameLower);
            const presentDays = attData?.present_count !== undefined && attData.present_count > 0 
              ? attData.present_count 
              : 22;
            const expectedDays = 22;

            const schedOt = otScheduleMap.get(empUsernameLower) || 0;
            const attOt = Number(attData?.total_ot_hours) || 0;
            const totalOtHours = Number((attOt + schedOt).toFixed(1));

            const isProduction = emp.role === "PRODUCTION" || productionStaffSet.has(empUsernameLower);

            const positionAllowance = customSalary?.allowances !== undefined && customSalary?.allowances !== null
              ? Number(customSalary.allowances)
              : 0;
            const kpiScore = kpiMap.get(empUsernameLower) || 0;
            const otherDeductions = customSalary?.deductions || 0;

            const calc = calculateEmployeePayroll({
              username: emp.username,
              name: emp.name || emp.username,
              role: emp.role || "STAFF",
              level: emp.level || "STAFF",
              basicSalary: baseSalary,
              positionAllowance,
              kpiScore,
              presentDays,
              expectedDays,
              overtimeHours: totalOtHours,
              otherDeductions,
              costCategory: isProduction ? "DIRECT_LABOR" : undefined,
            });

            return {
              employee_username: emp.username,
              employee_name: emp.name || emp.username,
              department: emp.role || "Staff",
              position: emp.level || "Employee",
              username: emp.username,
              name: emp.name || emp.username,
              role: emp.role,
              level: emp.level,
              cost_category: isProduction ? "DIRECT_LABOR" : calc.costCategory,
              basic_salary: calc.basicSalary,
              present_days: presentDays,
              absent_days: Math.max(0, expectedDays - presentDays),
              absence_deduction: calc.absenceDeduction,
              overtime_hours: calc.overtimeHours,
              overtime_pay: calc.overtimePay,
              travel_days: 0,
              travel_allowance: calc.travelAllowance,
              reimbursement_amount: calc.reimbursementAmount,
              position_allowance: calc.positionAllowance,
              kpi_bonus: calc.kpiBonus,
              bpjs_deduction: calc.totalBPJSEmployeeDeduction,
              bpjs_kes_employee: calc.bpjsKesehatanEmployee,
              bpjs_kes_employer: calc.bpjsKesehatanEmployer,
              bpjs_tk_employee: calc.bpjsTKTotalEmployee,
              bpjs_tk_employer: calc.bpjsTKTotalEmployer,
              pph21_deduction: calc.pph21Deduction,
              other_deductions: calc.otherDeductions,
              gross_pay: calc.grossPay,
              total_deductions: calc.totalDeductions,
              net_pay: calc.netPay,
            };
          });

          res.json({
            period_month: pMonth,
            period_year: pYear,
            period_name: periodName,
            details,
          });
        } catch (e: any) {
          console.error("Prepare PRq failed:", e);
          res.status(500).json({ error: "Failed to prepare payroll requisition" });
        }
      },
    );

    router.post(
      "/api/hr/payroll-requisitions",
      requireRole(["HR", "FC"]),
      (req, res) => {
        try {
          const { period_month, period_year, notes, details, submit } = req.body;
          const pMonth = Number(period_month) || new Date().getMonth() + 1;
          const pYear = Number(period_year) || new Date().getFullYear();

          const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
          ];
          const periodName = `${monthNames[pMonth - 1] || pMonth} ${pYear}`;

          const existing = db
            .prepare(
              "SELECT id FROM payroll_requisitions WHERE period_month = ? AND period_year = ? AND status != 'REJECTED'",
            )
            .get(pMonth, pYear);

          const userEmail = (req.headers["x-user-email"] as string) || "HR Admin";

          if (submit && req.body.pin) {
            if (!isValidDailyAuthKey(userEmail, req.body.pin)) {
              return res.status(400).json({
                error: "PIN Otorisasi / Auth Key Harian tidak valid. Silakan periksa PIN otorisasi Anda.",
              });
            }
          }

          const id = "PRQ-" + Date.now() + "-" + Math.floor(1000 + Math.random() * 9000);
          const reqNum = `PRQ/HR/${pYear}/${String(pMonth).padStart(2, "0")}/${Math.floor(100 + Math.random() * 900)}`;

          let totalGross = 0;
          let totalDeductions = 0;
          let totalNet = 0;
          let totalDirectLabor = 0;
          let totalOpex = 0;

          const sanitizedDetails = (details || []).map((d: any) => {
            const basic = Number(d.basic_salary || 0);
            const posAllow = Number(d.position_allowance || 0);
            const kpiBonus = Number(d.kpi_bonus || 0);
            const otPay = Number(d.overtime_pay || (Number(d.overtime_hours || 0) * 50000));
            const travelAllow = Number(d.travel_allowance || (Number(d.travel_days || 0) * 250000));
            const reimburse = Number(d.reimbursement_amount || 0);

            const gross = basic + posAllow + kpiBonus + otPay + travelAllow + reimburse;

            const absDed = Number(d.absence_deduction || 0);
            const bpjsDed = Number(d.bpjs_deduction || Math.round(basic * 0.03));
            const pph21Ded = Number(d.pph21_deduction || Math.round(basic * 0.02));
            const otherDed = Number(d.other_deductions || 0);

            const ded = absDed + bpjsDed + pph21Ded + otherDed;
            const net = Math.max(0, gross - ded);

            totalGross += gross;
            totalDeductions += ded;
            totalNet += net;

            const isDirectLabor = d.cost_category === "DIRECT_LABOR" || d.role === "PRODUCTION";
            if (isDirectLabor) {
              totalDirectLabor += gross;
            } else {
              totalOpex += gross;
            }

            return {
              ...d,
              cost_category: isDirectLabor ? "DIRECT_LABOR" : "OPERATIONAL_EXPENSE",
              gross_pay: gross,
              total_deductions: ded,
              net_pay: net,
            };
          });

          const status = submit ? "SUBMITTED" : "DRAFT";
          const submittedAt = submit ? new Date().toISOString() : null;

          db.prepare(
            `
            INSERT INTO payroll_requisitions (
              id, requisition_number, period_month, period_year, period_name,
              submitted_by, submitted_at, status, total_gross, total_deductions,
              total_net, notes, details_json, total_direct_labor, total_opex
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          ).run(
            id,
            reqNum,
            pMonth,
            pYear,
            periodName,
            userEmail,
            submittedAt,
            status,
            totalGross,
            totalDeductions,
            totalNet,
            notes || "",
            JSON.stringify(sanitizedDetails),
            totalDirectLabor,
            totalOpex,
          );

          logAudit(
            userEmail,
            submit ? "SUBMIT_PAYROLL_REQUISITION" : "CREATE_PAYROLL_REQUISITION",
            "HR",
            id,
            `Created Payroll Requisition ${reqNum} (${periodName}) - Total Net: ${totalNet}`,
          );

          res.json({
            success: true,
            id,
            requisition_number: reqNum,
            status,
            total_net: totalNet,
          });
        } catch (e: any) {
          console.error("Create PRq failed:", e);
          res.status(500).json({ error: "Failed to create payroll requisition" });
        }
      },
    );

    router.put(
      "/api/hr/payroll-requisitions/:id",
      requireRole(["HR", "FC"]),
      (req, res) => {
        try {
          const { notes, details, submit } = req.body;
          const prq = db
            .prepare("SELECT * FROM payroll_requisitions WHERE id = ?")
            .get(req.params.id) as any;

          if (!prq) return res.status(404).json({ error: "PRq not found" });

          let totalGross = 0;
          let totalDeductions = 0;
          let totalNet = 0;

          const sanitizedDetails = (details || []).map((d: any) => {
            const basic = Number(d.basic_salary || 0);
            const posAllow = Number(d.position_allowance || 0);
            const kpiBonus = Number(d.kpi_bonus || 0);
            const otPay = Number(d.overtime_pay || (Number(d.overtime_hours || 0) * 50000));
            const travelAllow = Number(d.travel_allowance || (Number(d.travel_days || 0) * 250000));
            const reimburse = Number(d.reimbursement_amount || 0);

            const gross = basic + posAllow + kpiBonus + otPay + travelAllow + reimburse;

            const absDed = Number(d.absence_deduction || 0);
            const bpjsDed = Number(d.bpjs_deduction || Math.round(basic * 0.03));
            const pph21Ded = Number(d.pph21_deduction || Math.round(basic * 0.02));
            const otherDed = Number(d.other_deductions || 0);

            const ded = absDed + bpjsDed + pph21Ded + otherDed;
            const net = Math.max(0, gross - ded);

            totalGross += gross;
            totalDeductions += ded;
            totalNet += net;

            return {
              ...d,
              gross_pay: gross,
              total_deductions: ded,
              net_pay: net,
            };
          });

          const status = submit ? "SUBMITTED" : "DRAFT";
          const userEmail = (req.headers["x-user-email"] as string) || "HR Admin";

          if (submit && req.body.pin) {
            if (!isValidDailyAuthKey(userEmail, req.body.pin)) {
              return res.status(400).json({
                error: "PIN Otorisasi / Auth Key Harian tidak valid. Silakan periksa PIN otorisasi Anda.",
              });
            }
          }

          db.prepare(
            `
            UPDATE payroll_requisitions
            SET notes = ?,
                details_json = ?,
                total_gross = ?,
                total_deductions = ?,
                total_net = ?,
                status = ?,
                submitted_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE submitted_at END,
                rejection_reason = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          ).run(
            notes || "",
            JSON.stringify(sanitizedDetails),
            totalGross,
            totalDeductions,
            totalNet,
            status,
            submit ? 1 : 0,
            req.params.id,
          );

          logAudit(
            userEmail,
            "UPDATE_PAYROLL_REQUISITION",
            "HR",
            req.params.id,
            `Updated PRq ${prq.requisition_number} to status ${status}`,
          );

          res.json({ success: true, status });
        } catch (e: any) {
          console.error("Update PRq failed:", e);
          res.status(500).json({ error: "Failed to update payroll requisition" });
        }
      },
    );

    router.post(
      "/api/hr/payroll-requisitions/:id/reject",
      requireRole(["FC", "BOD", "HR", "ADMIN"]),
      (req, res) => {
        try {
          const reasonText = req.body.rejection_reason || req.body.reason;
          if (!reasonText) {
            return res.status(400).json({ error: "Alasan penolakan harus diisi." });
          }

          db.prepare(
            `
            UPDATE payroll_requisitions
            SET status = 'REJECTED',
                rejection_reason = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          ).run(reasonText, req.params.id);

          res.json({ success: true, message: "Pengajuan PRq berhasil ditolak." });
        } catch (e: any) {
          console.error("Reject PRq failed:", e);
          res.status(500).json({ error: "Failed to reject payroll requisition" });
        }
      },
    );

    router.post(
      "/api/hr/payroll-requisitions/:id/cancel",
      requireRole(["HR", "FC", "BOD", "ADMIN"]),
      (req, res) => {
        try {
          const userEmail = (req.headers["x-user-email"] as string) || "HR Admin";
          const { pin } = req.body;
          if (pin && !isValidDailyAuthKey(userEmail, pin)) {
            return res.status(400).json({
              error: "PIN Otorisasi / Auth Key Harian tidak valid.",
            });
          }

          const reasonText = req.body.cancel_reason || req.body.reason || "Dibatalkan oleh HR/Pemohon";
          const prq = db
            .prepare("SELECT * FROM payroll_requisitions WHERE id = ?")
            .get(req.params.id) as any;

          if (!prq) {
            return res.status(404).json({ error: "PRq tidak ditemukan." });
          }
          if (prq.status === "CONVERTED") {
            return res.status(400).json({
              error: "PRq yang sudah diterbitkan ke order pencairan Finance tidak dapat dibatalkan.",
            });
          }

          db.prepare(
            `
            UPDATE payroll_requisitions
            SET status = 'CANCELLED',
                rejection_reason = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          ).run(`[CANCELED] ${reasonText}`, req.params.id);

          res.json({ success: true, message: "Pengajuan PRq berhasil dibatalkan." });
        } catch (e: any) {
          console.error("Cancel PRq failed:", e);
          res.status(500).json({ error: "Gagal membatalkan pengajuan PRq" });
        }
      },
    );

    router.delete(
      "/api/hr/payroll-requisitions/:id",
      requireRole(["HR", "FC", "BOD", "ADMIN"]),
      (req, res) => {
        try {
          const prq = db
            .prepare("SELECT * FROM payroll_requisitions WHERE id = ?")
            .get(req.params.id) as any;

          if (!prq) {
            return res.status(404).json({ error: "PRq tidak ditemukan." });
          }

          if (prq.status !== "DRAFT" && prq.status !== "CANCELLED" && prq.status !== "REJECTED") {
            return res.status(400).json({
              error: "Hanya Draf atau PRq yang Dibatalkan/Ditolak yang dapat dihapus dari basis data.",
            });
          }

          db.prepare("DELETE FROM payroll_requisitions WHERE id = ?").run(req.params.id);
          res.json({ success: true, message: "Pengajuan PRq berhasil dihapus." });
        } catch (e: any) {
          console.error("Delete PRq failed:", e);
          res.status(500).json({ error: "Gagal menghapus pengajuan PRq" });
        }
      },
    );

    router.post(
      "/api/hr/payroll-requisitions/:id/convert",
      requireRole(["FC", "BOD"]),
      (req, res) => {
        try {
          const { pin } = req.body;
          const userEmail = (req.headers["x-user-email"] as string) || "Finance Admin";
          
          // Verify PIN if provided
          if (pin && !isValidDailyAuthKey(userEmail, pin)) {
            return res.status(400).json({ error: "Invalid authorization PIN" });
          }

          const prq = db
            .prepare("SELECT * FROM payroll_requisitions WHERE id = ?")
            .get(req.params.id) as any;

          if (!prq) {
            return res.status(404).json({ error: "Payroll requisition not found" });
          }
          if (prq.status !== "SUBMITTED" && prq.status !== "APPROVED") {
            return res.status(400).json({
              error: "Hanya pengajuan dengan status SUBMITTED yang dapat dikonversi ke Order Pencairan Finance.",
            });
          }

          const payrollId = "PAY-" + Date.now() + "-" + Math.floor(1000 + Math.random() * 9000);
          const voucherNumber = `PDV/FIN/${prq.period_year}/${String(prq.period_month).padStart(2, "0")}/${Math.floor(100 + Math.random() * 900)}`;

          let details = [];
          try {
            details = JSON.parse(prq.details_json || "[]");
          } catch (e) {
            details = [];
          }

          db.transaction(() => {
            // 1. Create Finance Payroll Disbursement Order (PDV)
            db.prepare(
              `
              INSERT INTO finance_payroll (
                id, prq_id, voucher_number, period_name, period_month, period_year,
                total_amount, details_json, status, total_direct_labor, total_opex
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFTED', ?, ?)
            `,
            ).run(
              payrollId,
              prq.id,
              voucherNumber,
              prq.period_name,
              prq.period_month,
              prq.period_year,
              prq.total_net,
              prq.details_json,
              prq.total_direct_labor || 0,
              prq.total_opex || 0,
            );

            // 2. Mark PRq as CONVERTED
            db.prepare(
              "UPDATE payroll_requisitions SET status = 'CONVERTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(prq.id);

            // 3. Generate individual employee payslips
            const insertPayslip = db.prepare(`
              INSERT INTO hr_payslips (id, employee_username, period_month, basic_salary, allowances, deductions, net_salary, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'PUBLISHED')
            `);

            details.forEach((d: any) => {
              const slipId = "SLIP-" + Math.random().toString(36).substr(2, 9).toUpperCase();
              insertPayslip.run(
                slipId,
                d.username,
                prq.period_name,
                d.basic_salary || 0,
                d.gross_pay ? (d.gross_pay - (d.basic_salary || 0)) : 0,
                d.total_deductions || 0,
                d.net_pay || 0,
              );
            });

            logAudit(
              userEmail,
              "CONVERT_PRQ_TO_PAYROLL_ORDER",
              "FINANCE",
              payrollId,
              `Converted PRq ${prq.requisition_number} to Finance Order ${voucherNumber}`,
            );
          })();

          res.json({
            success: true,
            id: payrollId,
            voucher_number: voucherNumber,
            total_amount: prq.total_net,
          });
        } catch (e: any) {
          console.error("Convert PRq failed:", e);
          res.status(500).json({ error: "Failed to convert PRq to payroll order" });
        }
      },
    );

