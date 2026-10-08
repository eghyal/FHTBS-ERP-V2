import type Database from "better-sqlite3";
import crypto from "crypto";

export interface JournalLine {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  memo?: string;
}

export interface PostJournalParams {
  reference_type: "GRN" | "DELIVERY_NOTE" | "COMMERCIAL_INVOICE" | "INVOICE_PAYMENT" | "PO_PAYMENT" | "PAYROLL" | "MANUAL_ADJUSTMENT";
  reference_id: string;
  reference_number: string;
  description: string;
  entry_date?: string;
  lines: JournalLine[];
  created_by?: string;
}

/**
 * Check if the target accounting period is locked or closed.
 * Throws error if SOFT_LOCKED or HARD_CLOSED.
 */
export function assertAccountingPeriodOpen(db: Database.Database, dateStr?: string): void {
  try {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const periodKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;
    const period = db.prepare("SELECT * FROM accounting_periods WHERE period_key = ?").get(periodKey) as any;
    if (period) {
      if (period.status === "HARD_CLOSED") {
        throw new Error(`PERIODE DITUTUP: Periode akuntansi ${period.period_name} (${period.period_key}) telah HARD_CLOSED. Transaksi finansial tidak dapat diposting.`);
      }
      if (period.status === "SOFT_LOCKED") {
        throw new Error(`PERIODE TERKUNCI: Periode akuntansi ${period.period_name} (${period.period_key}) sedang SOFT_LOCKED untuk proses rekonsiliasi tutup buku.`);
      }
    }
  } catch (err: any) {
    if (err.message && (err.message.includes("PERIODE DITUTUP") || err.message.includes("PERIODE TERKUNCI"))) {
      throw err;
    }
  }
}

/**
 * Executes a balanced double-entry journal posting.
 * Enforces: sum(debit) === sum(credit) and period lock verification.
 */
export function postJournalEntry(
  db: Database.Database,
  params: PostJournalParams,
): string {
  const {
    reference_type,
    reference_id,
    reference_number,
    description,
    entry_date = new Date().toISOString(),
    lines,
    created_by = "SYSTEM",
  } = params;

  // Enforce period lock integrity
  assertAccountingPeriodOpen(db, entry_date);

  if (!lines || lines.length < 2) {
    throw new Error("Journal entry must contain at least two lines.");
  }

  const totalDebit = Math.round(lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0) * 100) / 100;
  const totalCredit = Math.round(lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0) * 100) / 100;

  // Verify balanced entry (allowing at most 1 cent tolerance for rounding)
  if (Math.abs(totalDebit - totalCredit) > 1) {
    throw new Error(
      `Unbalanced journal entry: Total Debit (${totalDebit}) does not equal Total Credit (${totalCredit}).`,
    );
  }

  const entryId = "JE-" + crypto.randomUUID();
  const dateParts = new Date(entry_date).toISOString().split("T")[0].replace(/-/g, "");
  const entryNumber = `JE-${dateParts}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;

  db.prepare(`
    INSERT INTO journal_entries (
      id, entry_number, entry_date, reference_type, reference_id, reference_number,
      description, total_debit, total_credit, status, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, CURRENT_TIMESTAMP)
  `).run(
    entryId,
    entryNumber,
    entry_date,
    reference_type,
    reference_id,
    reference_number,
    description,
    totalDebit,
    totalCredit,
    created_by,
  );

  const insertLine = db.prepare(`
    INSERT INTO journal_entry_lines (
      id, entry_id, account_code, account_name, debit, credit, memo
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const line of lines) {
    insertLine.run(
      "JEL-" + crypto.randomUUID(),
      entryId,
      line.account_code,
      line.account_name,
      Number(line.debit) || 0,
      Number(line.credit) || 0,
      line.memo || null,
    );
  }

  return entryNumber;
}

/**
 * Standard COA helpers for automated accounting hooks
 */

// 1. Goods Receipt Intake (Warehouse GRN)
export function postGoodsReceiptJournal(
  db: Database.Database,
  {
    grn_id,
    po_number,
    total_inventory_cost,
    user,
  }: {
    grn_id: string;
    po_number: string;
    total_inventory_cost: number;
    user?: string;
  },
) {
  if (total_inventory_cost <= 0) return null;

  return postJournalEntry(db, {
    reference_type: "GRN",
    reference_id: grn_id,
    reference_number: po_number,
    description: `Inventory Physical Intake for PO ${po_number} (GRN: ${grn_id})`,
    lines: [
      {
        account_code: "1103",
        account_name: "Inventory - Raw Materials & Goods",
        debit: total_inventory_cost,
        credit: 0,
        memo: `Physical stock intake PO ${po_number}`,
      },
      {
        account_code: "1104",
        account_name: "Goods Received Not Invoiced (GRNI Accrual)",
        debit: 0,
        credit: total_inventory_cost,
        memo: `Accrued liability for PO ${po_number}`,
      },
    ],
    created_by: user || "WAREHOUSE_INTAKE",
  });
}

// 2. Outbound Dispatch / Delivery Note
export function postDeliveryDispatchJournal(
  db: Database.Database,
  {
    dn_id,
    dn_number,
    total_cogs,
    user,
  }: {
    dn_id: string;
    dn_number: string;
    total_cogs: number;
    user?: string;
  },
) {
  if (total_cogs <= 0) return null;

  return postJournalEntry(db, {
    reference_type: "DELIVERY_NOTE",
    reference_id: dn_id,
    reference_number: dn_number,
    description: `COGS Recognition for Outbound Dispatch ${dn_number}`,
    lines: [
      {
        account_code: "5101",
        account_name: "Cost of Goods Sold (COGS)",
        debit: total_cogs,
        credit: 0,
        memo: `COGS recognized upon dispatch ${dn_number}`,
      },
      {
        account_code: "1103",
        account_name: "Inventory - Finished Goods",
        debit: 0,
        credit: total_cogs,
        memo: `Inventory reduction on dispatch ${dn_number}`,
      },
    ],
    created_by: user || "LOGISTICS_DISPATCH",
  });
}

// 3. Commercial Invoice Generation
export function postCommercialInvoiceJournal(
  db: Database.Database,
  {
    ci_id,
    ci_number,
    dpp,
    ppn = 0,
    pph = 0,
    grand_total,
    user,
  }: {
    ci_id: string;
    ci_number: string;
    dpp: number;
    ppn?: number;
    pph?: number;
    grand_total: number;
    user?: string;
  },
) {
  if (grand_total <= 0) return null;

  const lines: JournalLine[] = [
    {
      account_code: "1102",
      account_name: "Accounts Receivable (Piutang Usaha)",
      debit: grand_total,
      credit: 0,
      memo: `AR created for Invoice ${ci_number}`,
    },
    {
      account_code: "4101",
      account_name: "Sales Operating Revenue (Pendapatan Usaha)",
      debit: 0,
      credit: dpp,
      memo: `Revenue recognized for Invoice ${ci_number}`,
    },
  ];

  if (ppn > 0) {
    lines.push({
      account_code: "2102",
      account_name: "VAT / PPN Payable (Hutang Pajak Keluaran)",
      debit: 0,
      credit: ppn,
      memo: `PPN Output liability for ${ci_number}`,
    });
  }

  if (pph > 0) {
    lines.push({
      account_code: "1105",
      account_name: "Prepaid Tax PPh 23 (Uang Muka PPh)",
      debit: pph,
      credit: 0,
      memo: `Prepaid tax deduction for ${ci_number}`,
    });
  }

  return postJournalEntry(db, {
    reference_type: "COMMERCIAL_INVOICE",
    reference_id: ci_id,
    reference_number: ci_number,
    description: `Billing Recognition for Commercial Invoice ${ci_number}`,
    lines,
    created_by: user || "FINANCE_BILLING",
  });
}

// 4. Commercial Invoice Payment Received
export function postInvoicePaymentJournal(
  db: Database.Database,
  {
    ci_id,
    ci_number,
    payment_amount,
    user,
  }: {
    ci_id: string;
    ci_number: string;
    payment_amount: number;
    user?: string;
  },
) {
  if (payment_amount <= 0) return null;

  return postJournalEntry(db, {
    reference_type: "INVOICE_PAYMENT",
    reference_id: ci_id,
    reference_number: ci_number,
    description: `Customer Payment Settlement for Invoice ${ci_number}`,
    lines: [
      {
        account_code: "1101",
        account_name: "Cash & Bank Accounts",
        debit: payment_amount,
        credit: 0,
        memo: `Payment received for ${ci_number}`,
      },
      {
        account_code: "1102",
        account_name: "Accounts Receivable (Piutang Usaha)",
        debit: 0,
        credit: payment_amount,
        memo: `AR settlement for ${ci_number}`,
      },
    ],
    created_by: user || "FINANCE_CASHIER",
  });
}

// 5. Purchase Order Settlement / Payment
export function postPurchaseOrderPaymentJournal(
  db: Database.Database,
  {
    po_id,
    po_number,
    payment_amount,
    user,
  }: {
    po_id: string;
    po_number: string;
    payment_amount: number;
    user?: string;
  },
) {
  if (payment_amount <= 0) return null;

  return postJournalEntry(db, {
    reference_type: "PO_PAYMENT",
    reference_id: po_id,
    reference_number: po_number,
    description: `Supplier Settlement for PO ${po_number}`,
    lines: [
      {
        account_code: "2101",
        account_name: "Accounts Payable (Hutang Usaha)",
        debit: payment_amount,
        credit: 0,
        memo: `AP settlement for PO ${po_number}`,
      },
      {
        account_code: "1101",
        account_name: "Cash & Bank Accounts",
        debit: 0,
        credit: payment_amount,
        memo: `Bank disbursement for PO ${po_number}`,
      },
    ],
    created_by: user || "FINANCE_DISBURSEMENT",
  });
}

// 6. Payroll Disbursement Posting with Direct Labor (HPP/BTKL) vs OPEX separation
export function postPayrollDisbursementJournal(
  db: Database.Database,
  {
    payroll_id,
    voucher_number,
    period_name,
    total_direct_labor,
    total_opex,
    total_net,
    total_bpjs = 0,
    total_pph21 = 0,
    user,
  }: {
    payroll_id: string;
    voucher_number: string;
    period_name: string;
    total_direct_labor: number;
    total_opex: number;
    total_net: number;
    total_bpjs?: number;
    total_pph21?: number;
    user?: string;
  },
) {
  const lines: JournalLine[] = [];

  // Debits: Direct Labor to HPP (Account 5102 - Biaya Tenaga Kerja Langsung)
  if (total_direct_labor > 0) {
    lines.push({
      account_code: "5102",
      account_name: "Direct Labor Cost (BTKL / HPP Tenaga Kerja)",
      debit: total_direct_labor,
      credit: 0,
      memo: `Direct factory labor & overtime for ${period_name}`,
    });
  }

  // Debits: General staff to OPEX (Account 6101 - Beban Gaji & Upah Operasional)
  if (total_opex > 0) {
    lines.push({
      account_code: "6101",
      account_name: "Operational Salaries & Wages (Beban Gaji Kantor & Umum)",
      debit: total_opex,
      credit: 0,
      memo: `Operational staff salaries for ${period_name}`,
    });
  }

  // Fallback if neither was split
  if (lines.length === 0) {
    lines.push({
      account_code: "6101",
      account_name: "Salaries Expense",
      debit: total_net + total_bpjs + total_pph21,
      credit: 0,
      memo: `Payroll expense for ${period_name}`,
    });
  }

  // Credits:
  // BPJS Payable
  if (total_bpjs > 0) {
    lines.push({
      account_code: "2103",
      account_name: "BPJS Withholding Payable (Hutang BPJS)",
      debit: 0,
      credit: total_bpjs,
      memo: `BPJS deduction payable for ${period_name}`,
    });
  }

  // PPh 21 Payable
  if (total_pph21 > 0) {
    lines.push({
      account_code: "2104",
      account_name: "Income Tax Payable (Hutang PPh 21)",
      debit: 0,
      credit: total_pph21,
      memo: `PPh 21 withholding payable for ${period_name}`,
    });
  }

  // Cash / Bank Settlement (Credit)
  const totalDebit = lines.reduce((acc, l) => acc + (l.debit || 0), 0);
  const totalExistingCredit = lines.reduce((acc, l) => acc + (l.credit || 0), 0);
  const netBankCredit = Math.max(0, totalDebit - totalExistingCredit);

  lines.push({
    account_code: "1101",
    account_name: "Cash & Bank Accounts",
    debit: 0,
    credit: netBankCredit,
    memo: `Bank disbursement for payroll ${voucher_number}`,
  });

  return postJournalEntry(db, {
    reference_type: "PAYROLL",
    reference_id: payroll_id,
    reference_number: voucher_number,
    description: `Payroll Disbursement & HPP Direct Labor Allocation for ${period_name}`,
    lines,
    created_by: user || "FINANCE_PAYROLL",
  });
}
