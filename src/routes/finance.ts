import { isValidDailyAuthKey } from "../utils/auth.ts";
import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import { validateBody } from "../middleware/validate.ts";
import { CreateJournalEntrySchema, COAAccountSchema, InvoicePaymentSchema, ExpenseTransactionSchema } from "../schemas/index.ts";
import { financeService } from "../services/financeService.ts";
import { logAudit } from "../utils/audit.ts";
import { syncCollectionToFirestore } from "../db/firebaseSync.ts";
import { postInvoicePaymentJournal, postPurchaseOrderPaymentJournal, postPayrollDisbursementJournal, assertAccountingPeriodOpen } from "../utils/accountingBridge.ts";
import { calculateFinancialBreakdown } from "../lib/financialEngine.ts";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const router = Router();

    router.put(
      "/api/finance/payrolls/:id/void",
      requireRole(["FC", "BOD"]),
      (req, res) => {
        try {
          const { pin, notes } = req.body;
          if (
            pin &&
            !isValidDailyAuthKey(req.headers["x-user-email"] as string, pin)
          ) {
            return res.status(400).json({ error: "Invalid authorization PIN" });
          }

          const payroll = db
            .prepare("SELECT * FROM finance_payroll WHERE id = ?")
            .get(req.params.id) as any;
          if (!payroll)
            return res.status(404).json({ error: "Payroll not found" });
          if (payroll.status !== "PAID" && payroll.status !== "FINISHED") {
            return res
              .status(400)
              .json({ error: "Can only void paid payrolls." });
          }

          const userEmail = req.headers["x-user-email"] as string;

          db.transaction(() => {
            // 1. Revert Payroll Status
            db.prepare(
              "UPDATE finance_payroll SET status = 'DRAFTED', paid_at = NULL WHERE id = ?",
            ).run(req.params.id);

            // 2. Revert HR Payslips Status (valid values: DRAFT, PUBLISHED, PAID)
            db.prepare(
              "UPDATE hr_payslips SET status = 'PUBLISHED' WHERE period_month = ?",
            ).run(payroll.period_name);

            // 3. Insert Compensating Transaction (IN) to reverse the OUT
            const txId = "TX-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
            const nowIso = new Date().toISOString();
            db.prepare(
              `
             INSERT INTO finance_transactions (
                id, type, amount, category, reference_id, notes, created_by
             ) VALUES (?, ?, ?, ?, ?, ?, ?)
           `,
            ).run(
              txId,
              "IN",
              payroll.total_amount,
              "PAYROLL",
              req.params.id,
              "Void/Reversal of Payroll " +
                payroll.period_name +
                (notes ? " - " + notes : ""),
              userEmail,
            );

            syncCollectionToFirestore("finance_payroll", req.params.id, { id: req.params.id, status: 'DRAFTED', paid_at: null });
            syncCollectionToFirestore("finance_transactions", txId, {
              id: txId,
              type: "IN",
              amount: payroll.total_amount,
              category: "PAYROLL",
              reference_id: req.params.id,
              notes: "Void/Reversal of Payroll " + payroll.period_name + (notes ? " - " + notes : ""),
              created_by: userEmail,
              created_at: nowIso
            });

            logAudit(
              userEmail,
              "VOID_PAYROLL",
              "FINANCE",
              req.params.id,
              `Reversed Payroll payment of ${payroll.total_amount}`,
            );
          })();

          res.json({ success: true });
        } catch (e: any) {
          console.error("Void payroll failed:", e);
          res.status(500).json({ error: "Failed to void payroll" });
        }
      },
    );

    router.get("/api/finance/payrolls", requireRole(["FC", "HR"]), (req, res) => {
      try {
        const payrolls = db
          .prepare("SELECT * FROM finance_payroll ORDER BY created_at DESC")
          .all() as any[];

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const shortMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        const enriched = payrolls.map((p) => {
          let pm = p.period_month;
          let py = p.period_year;

          if (!pm || !py) {
            if (p.period_name) {
              const parts = String(p.period_name).trim().split(/[\s-]+/);
              if (parts.length >= 2) {
                if (!isNaN(Number(parts[0])) && Number(parts[0]) > 1900) {
                  py = Number(parts[0]);
                  pm = Number(parts[1]);
                } else if (!isNaN(Number(parts[1])) && Number(parts[1]) > 1900) {
                  py = Number(parts[1]);
                  const mIdx1 = monthNames.findIndex(m => m.toLowerCase() === parts[0].toLowerCase());
                  const mIdx2 = shortMonthNames.findIndex(m => m.toLowerCase() === parts[0].toLowerCase());
                  if (mIdx1 !== -1) pm = mIdx1 + 1;
                  else if (mIdx2 !== -1) pm = mIdx2 + 1;
                  else if (!isNaN(Number(parts[0]))) pm = Number(parts[0]);
                }
              }
            }
          }

          return {
            ...p,
            period_month: pm || 1,
            period_year: py || new Date().getFullYear(),
          };
        });

        res.json(enriched);
      } catch (e: any) {
        res.status(500).json({ error: "Failed to fetch payrolls" });
      }
    });

    router.get(
      ["/api/finance/payrolls/:id", "/api/finance/payrolls/:id/details"],
      requireRole(["FC", "HR"]),
      (req, res) => {
        try {
          const payroll = db
            .prepare("SELECT * FROM finance_payroll WHERE id = ?")
            .get(req.params.id) as any;
          if (!payroll)
            return res.status(404).json({ error: "Payroll record not found" });
          try {
            payroll.details = JSON.parse(payroll.details_json || "[]");
          } catch (e) {
            payroll.details = [];
          }
          res.json(payroll);
        } catch (e: any) {
          res.status(500).json({ error: "Failed to fetch payroll details" });
        }
      },
    );

    router.delete(
      "/api/finance/payrolls/:id",
      requireRole(["FC", "HR"]),
      (req, res) => {
        try {
          const payroll = db
            .prepare("SELECT * FROM finance_payroll WHERE id = ?")
            .get(req.params.id) as any;
          if (!payroll)
            return res.status(404).json({ error: "Payroll not found" });
          if (payroll.status === "PAID")
            return res
              .status(400)
              .json({ error: "Cannot delete paid payrolls" });

          db.transaction(() => {
            db.prepare(
              "DELETE FROM hr_payslips WHERE period_month = ? AND status != 'PAID'",
            ).run(payroll.period_name);
            db.prepare("DELETE FROM finance_payroll WHERE id = ?").run(
              req.params.id,
            );
          })();

          logAudit(
            (req.headers["x-user-email"] as string) || "System",
            "DELETE_PAYROLL",
            "FINANCE",
            req.params.id,
            "Drafted payroll deleted",
          );
          res.json({ success: true });
        } catch (e: any) {
          res.status(500).json({ error: "Failed to delete payroll" });
        }
      },
    );

    router.delete(
      "/api/finance/payrolls",
      requireRole(["FC", "HR"]),
      (req, res) => {
        try {
          const draftedPayrolls = db
            .prepare(
              "SELECT period_name FROM finance_payroll WHERE status = 'DRAFTED'",
            )
            .all() as any[];

          db.transaction(() => {
            for (const p of draftedPayrolls) {
              db.prepare(
                "DELETE FROM hr_payslips WHERE period_month = ? AND status != 'PAID'",
              ).run(p.period_name);
            }
            db.prepare(
              "DELETE FROM finance_payroll WHERE status = 'DRAFTED'",
            ).run();
          })();

          logAudit(
            (req.headers["x-user-email"] as string) || "System",
            "CLEAR_PAYROLLS",
            "FINANCE",
            "ALL_DRAFTS",
            "All drafted payrolls cleared",
          );
          res.json({ success: true });
        } catch (e: any) {
          res.status(500).json({ error: "Failed to clear payrolls" });
        }
      },
    );

    router.put(
      "/api/finance/payrolls/:id/pay",
      requireRole(["FC"]),
      (req, res) => {
        try {
          const { pin } = req.body;
          if (
            !pin ||
            !isValidDailyAuthKey(req.headers["x-user-email"] as string, pin)
          ) {
            return res.status(400).json({ error: "Invalid authorization PIN" });
          }
          const payroll = db
            .prepare("SELECT * FROM finance_payroll WHERE id = ?")
            .get(req.params.id) as any;
          if (!payroll)
            return res.status(404).json({ error: "Payroll not found" });

          const userEmail = req.headers["x-user-email"] as string;
          db.transaction(() => {
            db.prepare(
              "UPDATE finance_payroll SET status = 'PAID', paid_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(req.params.id);

            // PIPE: Mark HR payslips as PAID for this period
            db.prepare(
              "UPDATE hr_payslips SET status = 'PAID' WHERE period_month = ?",
            ).run(payroll.period_name);

            // INSERT GL TRANSACTION
            const txId =
              "TX-PRL-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
            const nowIso = new Date().toISOString();
            db.prepare(
              "INSERT INTO finance_transactions (id, type, category, reference_id, amount, payment_method, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ).run(
              txId,
              "OUT",
              "PAYROLL",
              payroll.id,
              payroll.total_amount,
              "BANK TRANSFER",
              "Payroll Disbursement for " + payroll.period_name,
              userEmail,
            );

            // POST BALANCED DOUBLE ENTRY JOURNAL (HPP Direct Labor vs OPEX)
            try {
              let details: any[] = [];
              try { details = JSON.parse(payroll.details_json || "[]"); } catch {}
              const totalDirectLabor = Number(payroll.total_direct_labor) || details.filter((d: any) => d.cost_category === "DIRECT_LABOR").reduce((sum: number, d: any) => sum + (Number(d.gross_pay) || 0), 0);
              const totalOpex = Number(payroll.total_opex) || details.filter((d: any) => d.cost_category !== "DIRECT_LABOR").reduce((sum: number, d: any) => sum + (Number(d.gross_pay) || 0), 0);
              const totalBpjs = details.reduce((sum: number, d: any) => sum + (Number(d.bpjs_deduction) || 0), 0);
              const totalPph21 = details.reduce((sum: number, d: any) => sum + (Number(d.pph21_deduction) || 0), 0);

              postPayrollDisbursementJournal(db, {
                payroll_id: payroll.id,
                voucher_number: payroll.voucher_number || payroll.id,
                period_name: payroll.period_name || "Payroll",
                total_direct_labor: totalDirectLabor,
                total_opex: totalOpex,
                total_net: Number(payroll.total_amount) || 0,
                total_bpjs: totalBpjs,
                total_pph21: totalPph21,
                user: userEmail,
              });
            } catch (journalErr) {
              console.warn("Posting payroll disbursement journal skipped:", journalErr);
            }

            syncCollectionToFirestore("finance_payroll", req.params.id, { id: req.params.id, status: 'PAID', paid_at: nowIso });
            syncCollectionToFirestore("finance_transactions", txId, {
              id: txId,
              type: "OUT",
              category: "PAYROLL",
              reference_id: payroll.id,
              amount: payroll.total_amount,
              payment_method: "BANK TRANSFER",
              notes: "Payroll Disbursement for " + payroll.period_name,
              created_by: userEmail,
              created_at: nowIso
            });
          })();

          logAudit(
            (req.headers["x-user-email"] as string) || "System",
            "PAYROLL_PAID",
            "FINANCE",
            req.params.id,
            "Payroll marked as disbursed (PAID)",
          );

          res.json({ success: true });
        } catch (e: any) {
          res
            .status(500)
            .json({ error: "Failed to process payroll disbursement" });
        }
      },
    );

    router.put(
      "/api/finance/payables/:id/void",
      requireRole(["FC", "BOD"]),
      (req, res) => {
        try {
          const { pin, notes } = req.body;
          if (
            !pin ||
            !isValidDailyAuthKey(req.headers["x-user-email"] as string, pin)
          ) {
            return res.status(400).json({ error: "Invalid authorization PIN" });
          }

          const po = db
            .prepare("SELECT * FROM purchase_orders WHERE id = ?")
            .get(req.params.id) as any;
          if (!po) return res.status(404).json({ error: "PO not found" });
          if (po.payment_status !== "PAID") {
            return res
              .status(400)
              .json({ error: "Can only void paid payables." });
          }

          const userEmail = req.headers["x-user-email"] as string;

          db.transaction(() => {
            // 1. Revert PO Status (Wait to recalculate PO status based on GRN, default to RECEIVED or ISSUED)
            // But we can just set amount_paid to 0, since status might be RECEIVED or ISSUED
            db.prepare(
              "UPDATE purchase_orders SET payment_status = 'UNPAID', amount_paid = 0 WHERE id = ?",
            ).run(req.params.id);
            
            // Re-evaluate main status based on GRNs
            const poData = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(req.params.id);
            const totalOrderedResult = db
              .prepare("SELECT COALESCE(SUM(qty), 0) as total FROM pr_items WHERE po_id = ?")
              .get(req.params.id);
            const totalReceivedResult = db
              .prepare("SELECT COALESCE(SUM(gi.qty_received), 0) as total FROM grn_items gi JOIN grns g ON gi.grn_id = g.id WHERE g.po_id = ? AND g.qc_status IN ('PASSED', 'CONDITIONAL')")
              .get(req.params.id);

            let newStatus = "ISSUED";
            const recTotal = (totalReceivedResult as any)?.total || 0;
            const ordTotal = (totalOrderedResult as any)?.total || 0;
            if (recTotal >= ordTotal && ordTotal > 0) {
               newStatus = "RECEIVED";
            } else if (recTotal > 0) {
               newStatus = "PARTIAL";
            }
            db.prepare("UPDATE purchase_orders SET status = ? WHERE id = ?").run(newStatus, req.params.id);
            

            // 2. Insert Compensating Transaction (IN) to reverse the OUT
            db.prepare(
              `
             INSERT INTO finance_transactions (
                id, type, amount, category, reference_id, notes, created_by
             ) VALUES (?, ?, ?, ?, ?, ?, ?)
           `,
            ).run(
              "TX-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
              "IN",
              po.total_amount, // Reverse exactly what was paid
              "GENERAL",
              req.params.id,
              "Void/Reversal of PO " +
                po.po_number +
                (notes ? " - " + notes : ""),
              userEmail,
            );

            logAudit(
              userEmail,
              "VOID_PAYABLE",
              "FINANCE",
              req.params.id,
              `Reversed PO payment of ${po.total_amount}`,
            );
          })();

          res.json({ success: true });
        } catch (e: any) {
          console.error("Void payable failed:", e);
          res.status(500).json({ error: "Failed to void payable" });
        }
      },
    );

    router.post(
      "/api/finance/expenses",
      requireRole(["FC", "BOD"]),
      validateBody(ExpenseTransactionSchema),
      (req, res) => {
        try {
          const { amount, category, payment_method, notes, pin } = req.body;
          const userEmail = req.headers["x-user-email"] as string;

          if (
            !isValidDailyAuthKey(userEmail, pin)
          ) {
            return res.status(400).json({ error: "Invalid authorization PIN" });
          }

          if (!amount || amount <= 0) {
            return res.status(400).json({ error: "Invalid amount" });
          }
          if (!["CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(category)) {
            return res.status(400).json({ error: "Invalid category" });
          }

          const txId =
            "TX-EXP-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
          const nowIso = new Date().toISOString();

          db.prepare(
            "INSERT INTO finance_transactions (id, type, category, amount, payment_method, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ).run(
            txId,
            "OUT",
            category,
            amount,
            payment_method || "BANK TRANSFER",
            notes || `General Expense - ${category}`,
            userEmail,
          );

          syncCollectionToFirestore("finance_transactions", txId, {
            id: txId,
            type: "OUT",
            category,
            amount,
            payment_method: payment_method || "BANK TRANSFER",
            notes: notes || `General Expense - ${category}`,
            created_by: userEmail,
            created_at: nowIso
          });

          logAudit(
            userEmail,
            "RECORD_EXPENSE",
            "FINANCE",
            txId,
            `Recorded expense ${category} of ${amount}`,
          );

          res.json({ success: true });
        } catch (e: any) {
          console.error("Record expense failed:", e);
          res.status(500).json({ error: "Failed to record expense" });
        }
      }
    );

    router.get(
      "/api/finance/analytics",
      requireRole(["FC", "SALES", "BOD"]),
      (req, res) => {
        try {
          const globalData = db.prepare("SELECT * FROM finance_global_summary WHERE id = 1").get() as any;
          const monthlyData = db.prepare("SELECT * FROM finance_monthly_summaries ORDER BY month_year ASC").all() as any[];
          
          const recent_transactions = db
            .prepare(
              "SELECT * FROM finance_transactions ORDER BY transaction_date DESC LIMIT 50",
            )
            .all();

          res.json({
            total_billed: globalData?.total_billed || 0,
            total_billed_gross: (globalData?.total_billed || 0) + (globalData?.total_tax_collected || 0),
            total_received: (globalData?.total_revenue_realized || 0) + (globalData?.total_tax_collected || 0),
            total_receivable: globalData?.total_receivable || 0,
            total_revenue_realized: globalData?.total_revenue_realized || 0,
            total_tax_collected: globalData?.total_tax_collected || 0,
            total_cogs: globalData?.total_cogs || 0,
            total_material_cogs: globalData?.total_material_cogs || globalData?.total_cogs || 0,
            total_labor_cogs: globalData?.total_labor_cogs || 0,
            total_full_cogs: (globalData?.total_material_cogs || globalData?.total_cogs || 0) + (globalData?.total_labor_cogs || 0),
            gross_margin_material: (globalData?.total_revenue_realized || 0) - (globalData?.total_material_cogs || globalData?.total_cogs || 0),
            gross_margin_full: (globalData?.total_revenue_realized || 0) - ((globalData?.total_material_cogs || globalData?.total_cogs || 0) + (globalData?.total_labor_cogs || 0)),
            total_opex: globalData?.total_opex || 0,
            gross_margin: globalData?.gross_margin || 0,
            net_profit: globalData?.net_profit || 0,
            chartData: monthlyData.map(m => ({
              name: m.month_year,
              revenue: m.revenue,
              tax: m.tax,
              cogs: m.cogs,
              material_cogs: m.material_cogs || m.cogs,
              labor_cogs: m.labor_cogs || 0,
              opex: m.opex,
              profit: m.profit
            })),
            recent_transactions,
          });
        } catch (e: any) {
          console.error("Analytics Error:", e);
          res.status(500).json({ error: "Failed to load analytics" });
        }
      },
    );

    router.put(
      "/api/finance/invoices/:id/pay",
      requireRole(["FC", "SALES", "BOD", "ADMIN"]),
      validateBody(InvoicePaymentSchema),
      (req, res) => {
        try {
          const { pin, amount, payment_method, notes } = req.body;
          const userEmail = (req.headers["x-user-email"] as string) || "System";

          if (
            !pin ||
            !isValidDailyAuthKey(userEmail, pin)
          ) {
            return res.status(400).json({ error: "Invalid authorization PIN" });
          }

          const invoice = db
            .prepare("SELECT * FROM commercial_invoices WHERE id = ?")
            .get(req.params.id) as any;
          if (!invoice)
            return res.status(404).json({ error: "Invoice not found" });

          const dpp = Number(invoice.dpp ?? invoice.amount) || 0;
          const ppnRate = invoice.ppn_rate !== undefined && invoice.ppn_rate !== null ? Number(invoice.ppn_rate) : 12;
          const pphRate = invoice.pph_rate !== undefined && invoice.pph_rate !== null ? Number(invoice.pph_rate) : 0;
          const breakdown = calculateFinancialBreakdown({
            dpp,
            taxRate: ppnRate,
            pphRate,
            taxScheme: invoice.tax_scheme || "DPP_NILAI_LAIN",
            roundingFactor: Number(invoice.rounding_factor) || 0,
          });

          const totalAmount = breakdown.grandTotal;
          const targetPayable = breakdown.pphRate > 0 ? breakdown.netPayable : breakdown.grandTotal;
          const payAmount = Number(amount) > 0 ? Number(amount) : Math.max(0, targetPayable - (Number(invoice.amount_paid) || 0));
          const newPaid = (Number(invoice.amount_paid) || 0) + payAmount;
          let paymentStatus = "PARTIAL";
          let mainStatus = invoice.status;

          if (newPaid >= targetPayable - 1) { // 1 Rupiah margin for rounding
            paymentStatus = "PAID";
            mainStatus = "PAID";
          }

          // Net Revenue calculation (Excluding tax/PPN liability)
          const netRatio = totalAmount > 0 ? (dpp / totalAmount) : 1;
          const netRevenue = Math.round(payAmount * netRatio);

          db.transaction(() => {
            db.prepare(
              "UPDATE commercial_invoices SET amount_paid = ?, total_amount = ?, grand_total = ?, ppn = ?, pph = ?, payment_status = ?, status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(newPaid, totalAmount, totalAmount, breakdown.ppnAmount, breakdown.pphAmount, paymentStatus, mainStatus, req.params.id);

            const txId =
              "TX-INV-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
            const nowIso = new Date().toISOString();
            db.prepare(
              "INSERT INTO finance_transactions (id, type, category, reference_id, amount, payment_method, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ).run(
              txId,
              "IN",
              "RECEIVABLE",
              invoice.id,
              netRevenue, // Recorded as Net Revenue (Gross/Paid minus Tax)
              payment_method || "BANK TRANSFER",
              (notes ? notes + " - " : "") + "Pelunasan Invoice " + invoice.ci_number + ` (Pendapatan Bersih DPP: ${netRevenue}, Tagihan Bruto: ${payAmount})`,
              userEmail,
            );

            syncCollectionToFirestore("commercial_invoices", req.params.id, {
              id: req.params.id,
              amount_paid: newPaid,
              total_amount: totalAmount,
              grand_total: totalAmount,
              ppn: breakdown.ppnAmount,
              pph: breakdown.pphAmount,
              payment_status: paymentStatus,
              status: mainStatus,
              paid_at: nowIso
            });
            syncCollectionToFirestore("finance_transactions", txId, {
              id: txId,
              type: "IN",
              category: "RECEIVABLE",
              reference_id: invoice.id,
              amount: netRevenue,
              payment_method: payment_method || "BANK TRANSFER",
              notes: (notes ? notes + " - " : "") + "Pelunasan Invoice " + invoice.ci_number,
              created_by: userEmail,
              created_at: nowIso
            });
          })();

          // Automated Accounting Bridge: Post Customer Payment Journal (Debit Bank/Cash, Credit Accounts Receivable)
          try {
            postInvoicePaymentJournal(db, {
              ci_id: invoice.id,
              ci_number: invoice.ci_number || invoice.id,
              payment_amount: payAmount,
              user: userEmail,
            });
          } catch (payAccErr) {
            console.error("Automated Accounting postInvoicePaymentJournal error:", payAccErr);
          }

          logAudit(
            userEmail,
            "INVOICE_PAID",
            "FINANCE",
            req.params.id,
            `Commercial Invoice payment recorded: ${payAmount} (Net Revenue: ${netRevenue})`,
          );
          res.json({ success: true, payment_status: paymentStatus });
        } catch (e: any) {
          console.error("Mark invoice paid failed:", e);
          res.status(500).json({ error: "Failed to mark as paid: " + (e.message || "Internal server error") });
        }
      },
    );

    router.put(
      "/api/finance/invoices/:id/void",
      requireRole(["FC", "BOD"]),
      (req, res) => {
        try {
          const { pin, notes } = req.body;
          if (
            !pin ||
            !isValidDailyAuthKey(req.headers["x-user-email"] as string, pin)
          ) {
            return res.status(400).json({ error: "Invalid authorization PIN" });
          }

          const invoice = db
            .prepare("SELECT * FROM commercial_invoices WHERE id = ?")
            .get(req.params.id) as any;
          if (!invoice)
            return res.status(404).json({ error: "Invoice not found" });
          if (
            invoice.status !== "PAID" &&
            invoice.payment_status !== "PARTIAL"
          ) {
            return res
              .status(400)
              .json({
                error:
                  "Can only void paid or partially paid invoices to reverse transactions.",
              });
          }

          const userEmail = req.headers["x-user-email"] as string;

          db.transaction(() => {
            // 1. Revert Invoice Status
            db.prepare(
              "UPDATE commercial_invoices SET amount_paid = 0, payment_status = 'UNPAID', status = 'SENT' WHERE id = ?",
            ).run(req.params.id);

            // 2. Insert Compensating Transaction (OUT) to reverse the IN
            db.prepare(
              `
             INSERT INTO finance_transactions (
                id, type, amount, category, reference_id, notes, created_by
             ) VALUES (?, ?, ?, ?, ?, ?, ?)
           `,
            ).run(
              "TX-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
              "OUT",
              invoice.amount_paid || invoice.amount, // Reverse exactly what was paid
              "GENERAL",
              req.params.id,
              "Void/Reversal of Invoice " +
                invoice.ci_number +
                (notes ? " - " + notes : ""),
              userEmail,
            );

            logAudit(
              userEmail,
              "VOID_INVOICE",
              "FINANCE",
              req.params.id,
              `Reversed invoice payment of ${invoice.amount_paid}`,
            );
          })();

          res.json({ success: true });
        } catch (e: any) {
          console.error("Void invoice failed:", e);
          res.status(500).json({ error: "Failed to void invoice" });
        }
      },
    );

    router.get(
      "/api/finance/payables",
      requireRole(["FC", "SALES", "PURCHASING"]),
      (req, res) => {
        try {
          const d = db
            .prepare(`
              SELECT po.*,
                COALESCE(
                  NULLIF(po.grand_total, 0),
                  po.total_amount
                ) as total_amount,
                COALESCE((
                  SELECT SUM(gi.qty_received * pri.unit_price) * (1 + (CASE WHEN po.tax_scheme = 'DPP_NILAI_LAIN' THEN 0.11 WHEN po.ppn_rate = 0 THEN 0 ELSE COALESCE(po.ppn_rate, 12)/100.0 END))
                  FROM grn_items gi
                  JOIN grns g ON gi.grn_id = g.id
                  JOIN pr_items pri ON gi.item_id = pri.item_id AND pri.po_id = po.id
                  WHERE g.po_id = po.id AND g.qc_status IN ('PASSED', 'CONDITIONAL')
                ), 0) as received_amount
              FROM purchase_orders po
              ORDER BY po.created_at DESC
            `)
            .all();
          res.json({ success: true, data: d });
        } catch (e: any) {
          console.error("Payables error:", e);
          res.status(500).json({ error: "Failed to load payables" });
        }
      },
    );

    router.put(
      "/api/finance/payables/:id/pay",
      requireRole(["FC", "SALES", "PURCHASING"]),
      (req, res) => {
        try {
          const { pin, amount, payment_method, notes, vendor_invoice_number, vendor_invoice_amount } = req.body;
          if (
            !pin ||
            !isValidDailyAuthKey(req.headers["x-user-email"] as string, pin)
          ) {
            return res.status(400).json({ error: "Invalid authorization PIN" });
          }

          const po = db
            .prepare("SELECT * FROM purchase_orders WHERE id = ?")
            .get(req.params.id) as any;
          if (!po) return res.status(404).json({ error: "PO not found" });

          const poBreakdown = calculateFinancialBreakdown({
            grossAmount: po.total_amount || 0,
            taxRate: po.ppn_rate,
            pphRate: po.pph_rate,
            taxScheme: po.tax_scheme || "DPP_NILAI_LAIN",
            roundingFactor: Number(po.rounding_factor) || 0,
          });
          const poTargetTotal = po.pph_rate > 0 ? poBreakdown.netPayable : poBreakdown.grandTotal;

          const receivedResult = db
            .prepare(`
              SELECT COALESCE(SUM(gi.qty_received * pri.unit_price), 0) as raw_received_amount
              FROM grn_items gi
              JOIN grns g ON gi.grn_id = g.id
              JOIN pr_items pri ON gi.item_id = pri.item_id AND pri.po_id = ?
              WHERE g.po_id = ? AND g.qc_status IN ('PASSED', 'CONDITIONAL')
            `)
            .get(req.params.id, req.params.id) as any;
          
          const rawReceived = receivedResult?.raw_received_amount || 0;
          const grnBreakdown = calculateFinancialBreakdown({
            grossAmount: rawReceived,
            taxRate: po.ppn_rate,
            pphRate: po.pph_rate,
            taxScheme: po.tax_scheme || "DPP_NILAI_LAIN",
          });
          const receivedAmt = po.pph_rate > 0 ? grnBreakdown.netPayable : grnBreakdown.grandTotal;

          if (rawReceived === 0 && po.status !== 'FINISHED') {
             return res.status(400).json({ error: "HARD STOP: Cannot process payment. No goods have been received (GR) for this PO yet (Three-Way Matching failed)." });
          }

          if (vendor_invoice_amount) {
            const billedAmt = Math.round(Number(vendor_invoice_amount) * 100) / 100;
            const deviation = Math.abs(billedAmt - receivedAmt);
            const deviationPercent = (deviation / (receivedAmt || 1)) * 100;
            if (deviationPercent > 5) {
               return res.status(400).json({ error: "HARD STOP: Billed amount deviates from physically received amount by more than 5%. Payment rejected." });
            }
          }

          const payAmount = Math.round((Number(amount) || (poTargetTotal - (po.amount_paid || 0))) * 100) / 100;
          
          if (payAmount > receivedAmt - (po.amount_paid || 0)) {
             return res.status(400).json({ error: `HARD STOP: Cannot pay more than what has been physically received. Max allowed payment is ${receivedAmt - (po.amount_paid || 0)}.` });
          }

          const newPaid = Math.round(((po.amount_paid || 0) + payAmount) * 100) / 100;
          let paymentStatus = "PARTIAL";
          let mainStatus = po.status;

          if (newPaid >= poTargetTotal - 1) {
            paymentStatus = "PAID";
            if (
              mainStatus !== "DRAFTED" &&
              mainStatus !== "REJECTED" &&
              mainStatus !== "CANCELLED"
            ) {
              mainStatus = "FINISHED";
            }
          }

          db.transaction(() => {
            db.prepare(
              "UPDATE purchase_orders SET amount_paid = ?, payment_status = ?, status = ?, vendor_invoice_number = COALESCE(?, vendor_invoice_number), vendor_invoice_amount = COALESCE(?, vendor_invoice_amount) WHERE id = ?",
            ).run(newPaid, paymentStatus, mainStatus, vendor_invoice_number || null, vendor_invoice_amount || null, req.params.id);

            const txId =
              "TX-PO-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
            const nowIso = new Date().toISOString();

            const categoryRow = db.prepare(`
              SELECT pr.project_id, pr.category
              FROM purchase_orders po
              JOIN pr_items pri ON po.id = pri.po_id
              JOIN purchase_requests pr ON pri.pr_id = pr.id
              WHERE po.id = ?
              LIMIT 1
            `).get(po.id) as any;

            let txCategory = "PAYABLE";
            if (categoryRow) {
               if (categoryRow.project_id === 'CONSUMABLE' || categoryRow.category === 'CONSUMABLE') txCategory = 'CONSUMABLE';
               else if (categoryRow.project_id === 'TRANSPORTATION' || categoryRow.category === 'TRANSPORTATION') txCategory = 'TRANSPORTATION';
               else if (categoryRow.project_id === 'OTHERS' || categoryRow.category === 'OTHERS') txCategory = 'OTHERS';
            }

            db.prepare(
              "INSERT INTO finance_transactions (id, type, category, reference_id, amount, payment_method, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ).run(
              txId,
              "OUT",
              txCategory,
              po.id,
              payAmount,
              payment_method || "BANK TRANSFER",
              notes || "Payment for PO " + po.po_number,
              req.headers["x-user-email"] as string,
            );

            syncCollectionToFirestore("purchase_orders", req.params.id, {
              id: req.params.id,
              amount_paid: newPaid,
              payment_status: paymentStatus,
              status: mainStatus,
              vendor_invoice_number: vendor_invoice_number || null,
              vendor_invoice_amount: vendor_invoice_amount || null
            });
            syncCollectionToFirestore("finance_transactions", txId, {
              id: txId,
              type: "OUT",
              category: txCategory,
              reference_id: po.id,
              amount: payAmount,
              payment_method: payment_method || "BANK TRANSFER",
              notes: notes || "Payment for PO " + po.po_number,
              created_by: req.headers["x-user-email"] as string,
              created_at: nowIso
            });
          })();

          // Automated Accounting Bridge: Post Vendor Payment Journal (Debit Accounts Payable, Credit Bank/Cash)
          try {
            postPurchaseOrderPaymentJournal(db, {
              po_id: po.id,
              po_number: po.po_number || po.id,
              payment_amount: payAmount,
              user: (req.headers["x-user-email"] as string) || "System",
            });
          } catch (vendAccErr) {
            console.error("Automated Accounting postPurchaseOrderPaymentJournal error:", vendAccErr);
          }

          logAudit(
            (req.headers["x-user-email"] as string) || "System",
            "PO_PAID",
            "FINANCE",
            req.params.id,
            "Purchase Order payment recorded: " + payAmount,
          );
          res.json({ success: true, payment_status: paymentStatus });
        } catch (e: any) {
          console.error("Mark PO paid failed:", e);
          res.status(500).json({ error: "Failed to mark as paid" });
        }
      },
    );

    router.get(
      "/api/finance/journals",
      requireRole(["FC", "BOD", "SALES", "PURCHASING", "ADMIN"]),
      async (req, res) => {
        try {
          const { reference_type, search, limit = 150 } = req.query;
          const result = await financeService.getJournalEntries({
            category: (reference_type as string) || "ALL",
            search: (search as string) || "",
            limit: Number(limit) || 150,
          });
          res.json({ success: true, data: result });
        } catch (e: any) {
          console.error("Fetch journals error:", e);
          res.status(500).json({ error: "Failed to fetch journal entries: " + (e as any).message });
        }
      }
    );

    router.get(
      "/api/finance/journal-entries",
      requireRole(["FC", "BOD", "SALES", "PURCHASING", "ADMIN"]),
      async (req, res) => {
        try {
          const { category, search, limit = 150 } = req.query;
          const result = await financeService.getJournalEntries({
            category: (category as string) || "ALL",
            search: (search as string) || "",
            limit: Number(limit) || 150,
          });
          res.json({ success: true, data: result });
        } catch (e: any) {
          console.error("Fetch journal entries error:", e);
          res.status(500).json({ error: "Failed to fetch journal entries: " + (e as any).message });
        }
      }
    );

    router.post(
      "/api/finance/journal-entries",
      requireRole(["FC", "BOD", "ADMIN"]),
      validateBody(CreateJournalEntrySchema),
      async (req, res) => {
        try {
          const userEmail = (req as any).userEmail || (req.headers["x-user-email"] as string) || "admin";
          const result = await financeService.postJournalEntry(req.body, userEmail);
          logAudit(
            userEmail,
            "CREATE_JOURNAL_ENTRY",
            "FINANCE",
            result.id,
            `Manual journal entry created: ${result.entry_number} (Debit: ${result.total_debit})`
          );
          res.status(201).json({ success: true, data: result });
        } catch (e: any) {
          res.status(400).json({ error: e.message || "Failed to create journal entry" });
        }
      }
    );

    router.post(
      "/api/finance/journals",
      requireRole(["FC", "BOD", "ADMIN"]),
      validateBody(CreateJournalEntrySchema),
      async (req, res) => {
        try {
          const userEmail = (req as any).userEmail || (req.headers["x-user-email"] as string) || "admin";
          const result = await financeService.postJournalEntry(req.body, userEmail);
          res.status(201).json({ success: true, data: result });
        } catch (e: any) {
          res.status(400).json({ error: e.message || "Failed to create journal entry" });
        }
      }
    );

    // --- CHART OF ACCOUNTS (COA) API ---
    router.get(
      "/api/finance/chart-of-accounts",
      requireRole(["FC", "BOD", "ADMIN", "SALES", "PURCHASING"]),
      async (req, res) => {
        try {
          const accounts = await financeService.getChartOfAccounts();
          res.json({ success: true, data: accounts });
        } catch (e: any) {
          res.status(500).json({ error: "Failed to fetch chart of accounts: " + e.message });
        }
      }
    );

    router.post(
      "/api/finance/chart-of-accounts",
      requireRole(["FC", "BOD", "ADMIN"]),
      validateBody(COAAccountSchema),
      async (req, res) => {
        try {
          const userEmail = (req as any).userEmail || (req.headers["x-user-email"] as string) || "admin";
          const result = await financeService.createAccount(req.body);
          logAudit(userEmail, "CREATE_COA", "FINANCE", result.id, `Created COA account ${req.body.code} - ${req.body.name}`);
          res.status(201).json({ success: true, data: result });
        } catch (e: any) {
          res.status(400).json({ error: e.message || "Failed to create COA account" });
        }
      }
    );

    // --- TRIAL BALANCE & FINANCIAL STATEMENTS API ---
    router.get(
      "/api/finance/trial-balance",
      requireRole(["FC", "BOD", "ADMIN"]),
      (req, res) => {
        try {
          const rows = db.prepare(`
            SELECT 
              coa.code, 
              coa.name, 
              coa.category, 
              coa.type, 
              coa.normal_balance,
              COALESCE(SUM(jel.debit), 0) as total_debit,
              COALESCE(SUM(jel.credit), 0) as total_credit
            FROM chart_of_accounts coa
            LEFT JOIN journal_entry_lines jel ON coa.code = jel.account_code
            GROUP BY coa.code, coa.name, coa.category, coa.type, coa.normal_balance
            ORDER BY coa.code ASC
          `).all() as any[];

          let totalDebit = 0;
          let totalCredit = 0;

          const trialBalance = rows.map((r) => {
            const rawDebit = Number(r.total_debit) || 0;
            const rawCredit = Number(r.total_credit) || 0;
            totalDebit += rawDebit;
            totalCredit += rawCredit;

            let balanceDebit = 0;
            let balanceCredit = 0;
            if (r.normal_balance === "DEBIT") {
              const diff = rawDebit - rawCredit;
              if (diff >= 0) balanceDebit = diff;
              else balanceCredit = Math.abs(diff);
            } else {
              const diff = rawCredit - rawDebit;
              if (diff >= 0) balanceCredit = diff;
              else balanceDebit = Math.abs(diff);
            }

            return {
              ...r,
              balance_debit: balanceDebit,
              balance_credit: balanceCredit,
            };
          });

          res.json({
            success: true,
            data: trialBalance,
            summary: {
              total_debit: totalDebit,
              total_credit: totalCredit,
              is_balanced: Math.abs(totalDebit - totalCredit) < 1,
            },
          });
        } catch (e: any) {
          res.status(500).json({ error: "Failed to generate trial balance: " + e.message });
        }
      }
    );

    // --- ACCOUNTING PERIODS & LOCKING API ---
    router.get(
      "/api/finance/periods",
      requireRole(["FC", "BOD", "ADMIN"]),
      (req, res) => {
        try {
          const periods = db.prepare(`
            SELECT ap.*,
              (SELECT COUNT(*) FROM journal_entries je WHERE strftime('%Y-%m', je.entry_date) = ap.period_key) as journal_count,
              (SELECT COALESCE(SUM(je.total_debit), 0) FROM journal_entries je WHERE strftime('%Y-%m', je.entry_date) = ap.period_key) as total_volume
            FROM accounting_periods ap
            ORDER BY ap.period_key DESC
          `).all();
          res.json({ success: true, data: periods });
        } catch (e: any) {
          res.status(500).json({ error: "Failed to fetch periods: " + e.message });
        }
      }
    );

    router.post(
      "/api/finance/periods",
      requireRole(["FC", "BOD", "ADMIN"]),
      (req, res) => {
        try {
          const { period_key, period_name, start_date, end_date, notes } = req.body;
          if (!period_key || !period_name || !start_date || !end_date) {
            return res.status(400).json({ error: "Semua data periode wajib diisi (key, name, start, end)." });
          }

          const id = `PER-${period_key}`;
          db.prepare(`
            INSERT INTO accounting_periods (id, period_key, period_name, start_date, end_date, status, notes)
            VALUES (?, ?, ?, ?, ?, 'OPEN', ?)
          `).run(id, period_key, period_name, start_date, end_date, notes || null);

          logAudit(
            (req.headers["x-user-email"] as string) || "System",
            "CREATE_PERIOD",
            "ACCOUNTING_PERIOD",
            id,
            `Created accounting period ${period_name} (${period_key})`
          );

          res.json({ success: true, id });
        } catch (e: any) {
          res.status(500).json({ error: "Failed to create period: " + e.message });
        }
      }
    );

    router.put(
      "/api/finance/periods/:id/status",
      requireRole(["FC", "BOD", "ADMIN"]),
      (req, res) => {
        try {
          const { status, pin, notes } = req.body;
          const userEmail = (req.headers["x-user-email"] as string) || "System";

          if (!["OPEN", "SOFT_LOCKED", "HARD_CLOSED"].includes(status)) {
            return res.status(400).json({ error: "Invalid status: Must be OPEN, SOFT_LOCKED, or HARD_CLOSED" });
          }

          if (
            (status === "HARD_CLOSED" || status === "OPEN") &&
            (!pin || !isValidDailyAuthKey(userEmail, pin))
          ) {
            return res.status(400).json({ error: "PIN otorisasi harian tidak valid untuk perubahan status periode kritis." });
          }

          const period = db.prepare("SELECT * FROM accounting_periods WHERE id = ?").get(req.params.id) as any;
          if (!period) return res.status(404).json({ error: "Periode akuntansi tidak ditemukan." });

          const now = new Date().toISOString();
          let lockedBy = period.locked_by;
          let lockedAt = period.locked_at;
          let closedBy = period.closed_by;
          let closedAt = period.closed_at;

          if (status === "SOFT_LOCKED") {
            lockedBy = userEmail;
            lockedAt = now;
          } else if (status === "HARD_CLOSED") {
            closedBy = userEmail;
            closedAt = now;
          } else if (status === "OPEN") {
            lockedBy = null;
            lockedAt = null;
            closedBy = null;
            closedAt = null;
          }

          db.prepare(`
            UPDATE accounting_periods 
            SET status = ?, locked_by = ?, locked_at = ?, closed_by = ?, closed_at = ?, notes = COALESCE(?, notes)
            WHERE id = ?
          `).run(status, lockedBy, lockedAt, closedBy, closedAt, notes || null, req.params.id);

          logAudit(
            userEmail,
            "CHANGE_PERIOD_STATUS",
            "ACCOUNTING_PERIOD",
            req.params.id,
            `Status periode ${period.period_key} diubah ke ${status}`
          );

          res.json({ success: true, status });
        } catch (e: any) {
          res.status(500).json({ error: "Failed to update period status: " + e.message });
        }
      }
    );

    // --- AR AGING & INTELLIGENT DUNNING API ---
    router.get(
      "/api/finance/ar-aging",
      requireRole(["FC", "SALES", "BOD", "ADMIN"]),
      (req, res) => {
        try {
          const invoices = db.prepare(`
            SELECT 
              ci.*,
              c.name as customer_name,
              c.phone as customer_phone,
              c.email as customer_email,
              dn.dn_number
            FROM commercial_invoices ci
            LEFT JOIN customers c ON ci.customer_id = c.id
            LEFT JOIN delivery_notes dn ON ci.dn_id = dn.id
            WHERE ci.status != 'PAID' AND ci.payment_status != 'PAID'
            ORDER BY ci.created_at ASC
          `).all() as any[];

          const today = new Date();
          let currentTotal = 0;
          let bucket1_30 = 0;
          let bucket31_60 = 0;
          let bucket61_90 = 0;
          let bucketOver90 = 0;

          const detailedInvoices = invoices.map(inv => {
            const grandTotal = Number(inv.grand_total || inv.total_amount || 0);
            const paid = Number(inv.amount_paid || 0);
            const outstanding = Math.max(0, grandTotal - paid);

            // Calculate due date based on payment terms
            let termDays = 30;
            if (inv.payment_terms === "Net 14") termDays = 14;
            else if (inv.payment_terms === "Net 45") termDays = 45;
            else if (inv.payment_terms === "Net 60") termDays = 60;
            else if (inv.payment_terms === "Due on Receipt") termDays = 0;

            const issueDate = new Date(inv.created_at || Date.now());
            const dueDate = new Date(issueDate);
            dueDate.setDate(dueDate.getDate() + termDays);

            const diffTime = today.getTime() - dueDate.getTime();
            const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            let agingBucket = "CURRENT";
            let dunningLevel = "NONE";

            if (daysOverdue <= 0) {
              agingBucket = "CURRENT";
              currentTotal += outstanding;
              dunningLevel = "NORMAL_REMINDER";
            } else if (daysOverdue <= 30) {
              agingBucket = "1-30_DAYS";
              bucket1_30 += outstanding;
              dunningLevel = "FIRST_NOTICE";
            } else if (daysOverdue <= 60) {
              agingBucket = "31-60_DAYS";
              bucket31_60 += outstanding;
              dunningLevel = "SECOND_WARNING";
            } else if (daysOverdue <= 90) {
              agingBucket = "61-90_DAYS";
              bucket61_90 += outstanding;
              dunningLevel = "LEGAL_PRE_NOTICE";
            } else {
              agingBucket = "OVER_90_DAYS";
              bucketOver90 += outstanding;
              dunningLevel = "CREDIT_HOLD_LEGAL";
            }

            return {
              ...inv,
              grand_total: grandTotal,
              amount_paid: paid,
              outstanding_amount: outstanding,
              days_overdue: Math.max(0, daysOverdue),
              due_date: dueDate.toISOString().split("T")[0],
              aging_bucket: agingBucket,
              dunning_level: dunningLevel,
            };
          });

          res.json({
            success: true,
            total_outstanding: currentTotal + bucket1_30 + bucket31_60 + bucket61_90 + bucketOver90,
            buckets: {
              current: currentTotal,
              days_1_30: bucket1_30,
              days_31_60: bucket31_60,
              days_61_90: bucket61_90,
              days_over_90: bucketOver90,
            },
            invoices: detailedInvoices,
          });
        } catch (e: any) {
          res.status(500).json({ error: "Failed to generate AR aging report: " + e.message });
        }
      }
    );

    // --- CASHFLOW FORECASTING ENGINE API ---
    router.get(
      "/api/finance/cashflow-forecast",
      requireRole(["FC", "BOD", "ADMIN"]),
      (req, res) => {
        try {
          // 1. Current Cash & Bank Balance
          const bankBalanceRow = db.prepare(`
            SELECT COALESCE(SUM(debit) - SUM(credit), 0) as current_cash
            FROM journal_entry_lines
            WHERE account_code = '1101'
          `).get() as any;
          const startingCash = Number(bankBalanceRow?.current_cash || 0);

          // 2. Expected Inflows (Unpaid Invoices)
          const unpaidInvoices = db.prepare(`
            SELECT id, ci_number, customer_id, total_amount, grand_total, amount_paid, payment_terms, created_at
            FROM commercial_invoices
            WHERE status != 'PAID' AND payment_status != 'PAID'
          `).all() as any[];

          // 3. Expected Outflows (Unpaid Approved/Finished POs)
          const unpaidPos = db.prepare(`
            SELECT id, po_number, supplier_id, total_amount, grand_total, amount_paid, payment_terms, created_at
            FROM purchase_orders
            WHERE status IN ('APPROVED', 'RECEIVED', 'FINISHED') AND payment_status != 'PAID'
          `).all() as any[];

          // 4. Pending Payroll Obligations
          const pendingPayrolls = db.prepare(`
            SELECT id, voucher_number, period_name, total_amount, created_at
            FROM finance_payroll
            WHERE status IN ('DRAFTED', 'AUTHORIZED')
          `).all() as any[];

          const weeks = [
            { week_label: "Minggu Ini (W+1)", inflows: 0, outflows: 0, net: 0, projected_balance: startingCash },
            { week_label: "Minggu Ke-2 (W+2)", inflows: 0, outflows: 0, net: 0, projected_balance: 0 },
            { week_label: "Minggu Ke-3 (W+3)", inflows: 0, outflows: 0, net: 0, projected_balance: 0 },
            { week_label: "Minggu Ke-4 (W+4)", inflows: 0, outflows: 0, net: 0, projected_balance: 0 },
          ];

          const now = Date.now();
          const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

          // Bucket Inflows
          for (const inv of unpaidInvoices) {
            const outstanding = Math.max(0, Number(inv.grand_total || inv.total_amount) - Number(inv.amount_paid || 0));
            const ageDays = (now - new Date(inv.created_at || now).getTime()) / (1000 * 60 * 60 * 24);
            if (ageDays > 30) {
              weeks[0].inflows += outstanding * 0.8; // High probability this week
            } else if (ageDays > 14) {
              weeks[1].inflows += outstanding;
            } else {
              weeks[2].inflows += outstanding;
            }
          }

          // Bucket Outflows (POs)
          for (const po of unpaidPos) {
            const remaining = Math.max(0, Number(po.grand_total || po.total_amount) - Number(po.amount_paid || 0));
            weeks[0].outflows += remaining * 0.5;
            weeks[1].outflows += remaining * 0.5;
          }

          // Bucket Payrolls (usually due end of month / W+1 or W+2)
          for (const pay of pendingPayrolls) {
            weeks[0].outflows += Number(pay.total_amount || 0);
          }

          // Cumulative Projection
          let runningBalance = startingCash;
          for (let i = 0; i < weeks.length; i++) {
            weeks[i].net = weeks[i].inflows - weeks[i].outflows;
            runningBalance += weeks[i].net;
            weeks[i].projected_balance = runningBalance;
          }

          res.json({
            success: true,
            starting_cash: startingCash,
            forecast: weeks,
            burn_rate_weekly: Math.round((weeks[0].outflows + weeks[1].outflows) / 2),
            runway_weeks: runningBalance > 0 ? Math.round(startingCash / ((weeks[0].outflows || 1) / 2)) : 0,
          });
        } catch (e: any) {
          res.status(500).json({ error: "Failed to generate cashflow forecast: " + e.message });
        }
      }
    );


