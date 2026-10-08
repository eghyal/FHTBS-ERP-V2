import db from "../db/database.ts";
import { outboxService } from "../services/outboxService.ts";
import { cacheService } from "../services/cacheService.ts";
import crypto from "crypto";

export interface JournalLineDto {
  id?: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  memo?: string;
}

export interface JournalEntryDto {
  entry_date: string;
  reference_number?: string;
  description: string;
  category?: string;
  lines: JournalLineDto[];
}

export class FinanceRepository {
  /**
   * Fetch journal entries with JSON aggregation for child lines.
   * Eliminates N+1 sub-queries into a single constant query!
   */
  getJournalEntries(filter: { search?: string; category?: string; limit?: number }) {
    let query = `
      SELECT
        je.id,
        je.entry_number,
        je.entry_date,
        je.reference_number,
        je.description,
        je.category,
        je.created_by,
        je.created_at,
        je.total_debit,
        je.total_credit,
        COALESCE(
          (
            SELECT json_group_array(
              json_object(
                'id', jel.id,
                'entry_id', jel.entry_id,
                'account_code', jel.account_code,
                'account_name', jel.account_name,
                'debit', jel.debit,
                'credit', jel.credit,
                'memo', jel.memo,
                'account_category', coa.category,
                'account_type', coa.type
              )
            )
            FROM journal_entry_lines jel
            LEFT JOIN chart_of_accounts coa ON jel.account_code = coa.code
            WHERE jel.entry_id = je.id
            ORDER BY jel.debit DESC
          ),
          '[]'
        ) as lines_json
      FROM journal_entries je
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filter.category && filter.category !== "ALL") {
      query += " AND je.category = ?";
      params.push(filter.category);
    }

    if (filter.search && filter.search.trim()) {
      const searchParam = `%${filter.search.trim()}%`;
      query += ` AND (je.entry_number LIKE ? OR je.reference_number LIKE ? OR je.description LIKE ?)`;
      params.push(searchParam, searchParam, searchParam);
    }

    query += ` ORDER BY je.entry_date DESC, je.created_at DESC LIMIT ${Math.min(filter.limit || 150, 500)}`;

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((row) => ({
      ...row,
      lines: JSON.parse(row.lines_json || "[]"),
    }));
  }

  /**
   * Atomic transactional insert for Journal Entry with Outbox Event
   */
  createJournalEntry(entry: JournalEntryDto, userEmail: string) {
    const entryId = "JE-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    const entryNumber = "JN-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.floor(1000 + Math.random() * 9000);
    const nowIso = new Date().toISOString();

    const totalDebit = entry.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
    const totalCredit = entry.lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);

    const result = db.transaction(() => {
      // 1. Insert header
      db.prepare(`
        INSERT INTO journal_entries (
          id, entry_number, entry_date, reference_number, description,
          category, total_debit, total_credit, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entryId,
        entryNumber,
        entry.entry_date,
        entry.reference_number || "",
        entry.description,
        entry.category || "GENERAL",
        totalDebit,
        totalCredit,
        userEmail,
        nowIso
      );

      // 2. Insert lines
      const insertLineStmt = db.prepare(`
        INSERT INTO journal_entry_lines (
          id, entry_id, account_code, account_name, debit, credit, memo
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const line of entry.lines) {
        const lineId = "JEL-" + crypto.randomBytes(6).toString("hex").toUpperCase();
        insertLineStmt.run(
          lineId,
          entryId,
          line.account_code,
          line.account_name,
          Number(line.debit) || 0,
          Number(line.credit) || 0,
          line.memo || ""
        );
      }

      // 3. Atomically enqueue outbox event for cloud sync
      outboxService.enqueue(
        db,
        "FINANCE_JOURNALS",
        entryId,
        "CREATE",
        {
          id: entryId,
          entry_number: entryNumber,
          entry_date: entry.entry_date,
          description: entry.description,
          total_debit: totalDebit,
          total_credit: totalCredit,
          lines: entry.lines,
          created_at: nowIso,
          created_by: userEmail,
        },
        "BOTH"
      );

      return {
        id: entryId,
        entry_number: entryNumber,
        total_debit: totalDebit,
        total_credit: totalCredit,
      };
    })();

    // Invalidate COA cache as balances might have shifted
    cacheService.invalidateNamespace("coa");

    return result;
  }

  /**
   * Retrieve Chart of Accounts with cached balances
   */
  getChartOfAccounts() {
    const cacheKey = "coa:all_accounts";
    const cached = cacheService.get<any[]>(cacheKey);
    if (cached) return cached;

    const accounts = db.prepare(`
      SELECT
        coa.*,
        COALESCE(
          (SELECT SUM(jel.debit) - SUM(jel.credit) FROM journal_entry_lines jel WHERE jel.account_code = coa.code),
          0
        ) as net_balance,
        COALESCE(
          (SELECT SUM(jel.debit) FROM journal_entry_lines jel WHERE jel.account_code = coa.code),
          0
        ) as total_debit,
        COALESCE(
          (SELECT SUM(jel.credit) FROM journal_entry_lines jel WHERE jel.account_code = coa.code),
          0
        ) as total_credit
      FROM chart_of_accounts coa
      ORDER BY coa.code ASC
    `).all() as any[];

    cacheService.set(cacheKey, accounts, 120, "coa");
    return accounts;
  }

  /**
   * Insert new COA account with atomic cache invalidation
   */
  createAccount(account: {
    code: string;
    name: string;
    category: string;
    type: string;
    normal_balance?: string;
    description?: string;
  }) {
    const existing = db.prepare("SELECT code FROM chart_of_accounts WHERE code = ?").get(account.code);
    if (existing) {
      throw new Error(`Akun dengan kode ${account.code} sudah ada.`);
    }

    const id = "COA-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    db.prepare(`
      INSERT INTO chart_of_accounts (id, code, name, category, type, normal_balance, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      account.code,
      account.name,
      account.category,
      account.type,
      account.normal_balance || "DEBIT",
      account.description || ""
    );

    // Invalidate COA cache
    cacheService.invalidateNamespace("coa");

    return { id, code: account.code, name: account.name };
  }
}

export const financeRepository = new FinanceRepository();
