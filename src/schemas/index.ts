import { z } from "zod";

// --- FINANCIAL TRANSACTION SCHEMAS ---

export const JournalLineSchema = z.object({
  id: z.string().optional(),
  account_code: z.string().min(1, "Kode akun wajib diisi"),
  account_name: z.string().min(1, "Nama akun wajib diisi"),
  debit: z.number().min(0, "Debit tidak boleh bernilai negatif"),
  credit: z.number().min(0, "Credit tidak boleh bernilai negatif"),
  memo: z.string().optional().default(""),
});

export const CreateJournalEntrySchema = z.object({
  entry_date: z.string().min(1, "Tanggal jurnal wajib diisi"),
  reference_number: z.string().optional().default(""),
  description: z.string().min(1, "Deskripsi jurnal wajib diisi"),
  category: z.string().optional().default("GENERAL"),
  lines: z.array(JournalLineSchema).min(2, "Jurnal minimal harus memiliki 2 baris (Debit & Kredit)"),
}).refine((data) => {
  const totalDebit = data.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const totalCredit = data.lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
  return Math.abs(totalDebit - totalCredit) < 0.01;
}, {
  message: "Total Debit harus seimbang (balance) dengan Total Credit",
  path: ["lines"],
});

export const InvoicePaymentSchema = z.object({
  invoice_id: z.string().optional(),
  pin: z.string().min(1, "PIN otorisasi harian wajib diisi"),
  amount: z.number().positive("Jumlah pembayaran harus lebih dari 0").optional(),
  payment_method: z.string().optional().default("BANK TRANSFER"),
  bank_account_code: z.string().optional(),
  payment_date: z.string().optional(),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
});

export const ExpenseTransactionSchema = z.object({
  pin: z.string().min(1, "PIN otorisasi harian wajib diisi"),
  amount: z.number().positive("Jumlah pengeluaran harus lebih besar dari 0"),
  category: z.enum(["CONSUMABLE", "TRANSPORTATION", "OTHERS"], {
    message: "Kategori pengeluaran harus CONSUMABLE, TRANSPORTATION, atau OTHERS",
  }),
  payment_method: z.string().optional().default("BANK TRANSFER"),
  notes: z.string().optional().default(""),
});

export const COAAccountSchema = z.object({
  code: z.string().min(1, "Kode akun wajib diisi").max(30),
  name: z.string().min(1, "Nama akun wajib diisi").max(100),
  category: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"], {
    message: "Kategori akun harus ASSET, LIABILITY, EQUITY, REVENUE, atau EXPENSE",
  }),
  type: z.string().min(1, "Tipe akun wajib diisi"),
  normal_balance: z.enum(["DEBIT", "CREDIT"]).default("DEBIT"),
  description: z.string().optional().default(""),
  parent_code: z.string().nullable().optional(),
});

export const FinanceDisbursementSchema = z.object({
  recipient_name: z.string().min(1, "Nama penerima wajib diisi"),
  amount: z.number().positive("Jumlah pencairan harus lebih dari 0"),
  category: z.string().min(1, "Kategori wajib diisi"),
  account_code: z.string().min(1, "Akun kas/bank sumber wajib diisi"),
  expense_account_code: z.string().min(1, "Akun beban tujuan wajib diisi"),
  payment_date: z.string().min(1, "Tanggal wajib diisi"),
  notes: z.string().optional().default(""),
});

// --- INVENTORY TRANSACTION SCHEMAS ---

export const StockAdjustmentSchema = z.object({
  item_id: z.string().min(1, "Item ID wajib diisi"),
  warehouse_id: z.string().optional().default("MAIN"),
  adjustment_type: z.enum(["INCREASE", "DECREASE", "SET"], {
    message: "Tipe penyesuaian harus INCREASE, DECREASE, atau SET",
  }),
  quantity: z.number().positive("Kuantitas penyesuaian harus lebih dari 0"),
  reason: z.string().min(1, "Alasan penyesuaian stok wajib diisi"),
  cost_per_unit: z.number().min(0).optional().default(0),
});

export const StockTransferSchema = z.object({
  item_id: z.string().min(1, "Item ID wajib diisi"),
  source_warehouse_id: z.string().min(1, "Gudang asal wajib diisi"),
  target_warehouse_id: z.string().min(1, "Gudang tujuan wajib diisi"),
  quantity: z.number().positive("Kuantitas transfer harus lebih dari 0"),
  notes: z.string().optional().default(""),
}).refine((data) => data.source_warehouse_id !== data.target_warehouse_id, {
  message: "Gudang tujuan tidak boleh sama dengan gudang asal",
  path: ["target_warehouse_id"],
});

export const CreateInventoryItemSchema = z.object({
  item_code: z.string().min(1, "Kode barang wajib diisi").max(50),
  name: z.string().min(1, "Nama barang wajib diisi").max(200),
  type: z.enum(["RAW", "WIP", "FG", "CONSUMABLE", "ASSET"]).default("RAW"),
  uom: z.string().min(1, "Satuan (UOM) wajib diisi").default("PCS"),
  dimension: z.string().optional().nullable(),
  spec: z.string().optional().nullable(),
  unit_price: z.number().min(0, "Harga satuan tidak boleh negatif").default(0),
  min_stock: z.number().min(0).default(0),
  reorder_point: z.number().min(0).default(0),
  lead_time_days: z.number().min(0).default(0),
  warehouse_id: z.string().optional().default("MAIN"),
  initial_stock: z.number().min(0).optional().default(0),
});

export const UpdateInventoryItemSchema = CreateInventoryItemSchema.partial();
