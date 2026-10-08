import { financeRepository, type JournalEntryDto } from "../repositories/financeRepository.ts";
import { assertAccountingPeriodOpen } from "../utils/accountingBridge.ts";
import db from "../db/database.ts";

export class FinanceService {
  /**
   * Fetch journal entries with filter
   */
  async getJournalEntries(filter: { search?: string; category?: string; limit?: number }) {
    return financeRepository.getJournalEntries(filter);
  }

  /**
   * Post new Journal Entry with balance validation and accounting period check
   */
  async postJournalEntry(entry: JournalEntryDto, userEmail: string) {
    // 1. Check accounting period lock
    assertAccountingPeriodOpen(db, entry.entry_date);

    // 2. Validate Debit / Credit Balance
    const totalDebit = entry.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
    const totalCredit = entry.lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Jurnal tidak balance. Total Debit: ${totalDebit}, Total Credit: ${totalCredit}`);
    }

    if (entry.lines.length < 2) {
      throw new Error("Jurnal harus memiliki setidaknya 2 baris (Debit & Kredit).");
    }

    // 3. Verify that all account codes exist in COA
    for (const line of entry.lines) {
      const coa = db.prepare("SELECT code, name FROM chart_of_accounts WHERE code = ?").get(line.account_code);
      if (!coa) {
        throw new Error(`Akun dengan kode '${line.account_code}' tidak ditemukan di Chart of Accounts.`);
      }
    }

    return financeRepository.createJournalEntry(entry, userEmail);
  }

  /**
   * Get Chart of Accounts
   */
  async getChartOfAccounts() {
    return financeRepository.getChartOfAccounts();
  }

  /**
   * Create new account
   */
  async createAccount(data: {
    code: string;
    name: string;
    category: string;
    type: string;
    normal_balance?: string;
    description?: string;
  }) {
    return financeRepository.createAccount(data);
  }
}

export const financeService = new FinanceService();
