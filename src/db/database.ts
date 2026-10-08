import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Tentukan direktori penyimpanan lokal untuk database (agar data aman dari script/kode)
const dbDirectory = process.env.DB_DIR || path.join(process.cwd(), "data");
const dbPath = process.env.DB_PATH || path.join(dbDirectory, "erp.db");
const attendanceDbPath = path.join(dbDirectory, "hr_attendance.db");

// Pastikan folder penyimpanan lokal sudah dibuat
if (!fs.existsSync(dbDirectory)) {
  fs.mkdirSync(dbDirectory, { recursive: true });
}

const isDev = process.env.NODE_ENV !== "production";
console.log(
  `[Database] Menyimpan data di lokal disk pada direktori: ${path.resolve(dbPath)}`,
);
const db = new Database(dbPath, { timeout: 15000 });

// Enable WAL mode & high-concurrency performance tuning for multi-user production
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 20000"); // 20s lock wait to prevent busy exceptions
db.pragma("cache_size = -64000"); // 64MB memory cache for fast indexing
db.pragma("temp_store = MEMORY"); // In-memory temp tables for fast joins & subqueries
db.pragma("mmap_size = 268435456"); // 256MB memory map I/O for lightning reads

// Helper to safely execute schema migrations without noisy error logs for duplicate columns/indexes
const safeExec = (targetDb: any, sql: string) => {
  try {
    if (typeof targetDb.exec === "function") {
      targetDb.exec(sql);
    } else if (typeof targetDb.prepare === "function") {
      targetDb.prepare(sql).run();
    }
  } catch (e: any) {
    // Silently ignore duplicate column/index or already applied migrations
    if (
      e.message &&
      (e.message.includes("duplicate column name") ||
        e.message.includes("already exists") ||
        e.message.includes("no such table") ||
        e.message.includes("no such column"))
    ) {
      return;
    }
  }
};

// Initialize standalone HR Attendance Database (Sharding for high concurrency writes)
const initAttendanceDb = () => {
  const hrDb = new Database(attendanceDbPath, { timeout: 15000 });
  hrDb.pragma("journal_mode = WAL");
  hrDb.pragma("synchronous = NORMAL");
  hrDb.exec(`
    CREATE TABLE IF NOT EXISTS hr_attendances (
      id TEXT PRIMARY KEY,
      employee_username TEXT NOT NULL,
      date TEXT NOT NULL,
      clock_in TEXT,
      clock_in_location TEXT,
      clock_out TEXT,
      clock_out_location TEXT,
      status TEXT CHECK(status IN ('PRESENT', 'ABSENT', 'LATE', 'LEAVE')) DEFAULT 'PRESENT',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_attendances_emp ON hr_attendances(employee_username);
    CREATE INDEX IF NOT EXISTS idx_attendances_date ON hr_attendances(date);
  `);
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN clock_in_location TEXT;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN clock_out_location TEXT;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN shift TEXT DEFAULT 'SHIFT_1';");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN project_id TEXT;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN work_hours REAL DEFAULT 0;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN overtime_hours REAL DEFAULT 0;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN overtime_status TEXT DEFAULT 'NONE';");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN overtime_reason TEXT;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN hourly_rate REAL DEFAULT 0;");
  safeExec(hrDb, "ALTER TABLE hr_attendances ADD COLUMN labor_cost REAL DEFAULT 0;");
  hrDb.close();
};

initAttendanceDb();

// Attach the attendance shard to the main connection so cross-joins (e.g., users) still work elegantly
db.exec(`ATTACH DATABASE '${attendanceDbPath}' AS attendance_db;`);

// Initialize Core Tables
export function initDb() {
  // Temporarily disable foreign keys to allow schema creation with dependencies
  db.pragma("foreign_keys = OFF");

  // Performance and Safety Pragmas
  db.pragma("synchronous = NORMAL");
  db.pragma("temp_store = MEMORY");
  db.pragma("cache_size = -64000"); // 64 MB of page cache

  db.transaction(() => {
    // Migrate existing attendances from main DB to shard if necessary
    try {
      db.exec(`
        INSERT OR IGNORE INTO attendance_db.hr_attendances
        SELECT * FROM main.hr_attendances;
        DROP TABLE IF EXISTS main.hr_attendances;
      `);
    } catch (e) {
      // Ignored if migration already done or table doesn't exist
    }

    // 1. Schema Migrations (Add missing columns to existing tables)
    safeExec(db, "DROP TABLE IF EXISTS job_queue;");
    
    // Core system settings table
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS stations (
        id TEXT PRIMARY KEY,
        station_name TEXT NOT NULL,
        station_code TEXT,
        station_sequence INTEGER DEFAULT 1,
        project_id TEXT,
        machine_ids TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS project_manpower (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        station_id TEXT,
        employee_id TEXT,
        employee_name TEXT,
        role TEXT,
        status TEXT DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS material_requests (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        station_id TEXT,
        item_id TEXT,
        item_name TEXT,
        qty REAL DEFAULT 1,
        status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS material_dispatches (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        station_id TEXT,
        dispatch_qty REAL NOT NULL,
        status TEXT DEFAULT 'RECEIVED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    safeExec(db, "ALTER TABLE items ADD COLUMN item_type TEXT DEFAULT 'MATERIAL';");
    safeExec(db, "ALTER TABLE items ADD COLUMN machine_category TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN capacity_per_hour REAL;");
    safeExec(db, "ALTER TABLE items ADD COLUMN machine_status TEXT DEFAULT 'AVAILABLE';");
    safeExec(db, "ALTER TABLE items ADD COLUMN bypass_multi_station INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE items ADD COLUMN serial_number TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN manufacturer TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN machine_specifications TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN alternative_machine_ids TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE items ADD COLUMN operational_status TEXT DEFAULT 'AVAILABLE';");
    safeExec(db, "ALTER TABLE items ADD COLUMN selling_price REAL;");
    safeExec(db, "ALTER TABLE items ADD COLUMN barcode TEXT;");

    safeExec(db, "ALTER TABLE stations ADD COLUMN machine_ids TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE stations ADD COLUMN station_sequence INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE stations ADD COLUMN station_code TEXT;");

    safeExec(db, "ALTER TABLE production_stations ADD COLUMN station_sequence INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE production_stations ADD COLUMN station_code TEXT;");
    safeExec(db, "ALTER TABLE production_stations ADD COLUMN station_name TEXT;");
    safeExec(db, "ALTER TABLE production_stations ADD COLUMN machine_ids TEXT DEFAULT '[]';");

    safeExec(db, "ALTER TABLE project_stations ADD COLUMN station_sequence INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN station_code TEXT;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN station_name TEXT;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN machine_ids TEXT DEFAULT '[]';");

    safeExec(db, "ALTER TABLE processes ADD COLUMN cycle_time_minutes REAL;");
    safeExec(db, "ALTER TABLE processes ADD COLUMN assigned_machine_id TEXT;");
    safeExec(db, "ALTER TABLE processes ADD COLUMN alternative_machine_ids TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE processes ADD COLUMN setup_time_minutes REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE processes ADD COLUMN teardown_time_minutes REAL DEFAULT 0;");

    safeExec(db, "ALTER TABLE wots ADD COLUMN qr_payload TEXT;");
    safeExec(db, "ALTER TABLE wots ADD COLUMN qr_image_url TEXT;");
    safeExec(db, "ALTER TABLE wots ADD COLUMN machine_id TEXT;");
    safeExec(db, "ALTER TABLE wots ADD COLUMN good_units INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE wots ADD COLUMN reject_units INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE wots ADD COLUMN rework_units INTEGER DEFAULT 0;");

    safeExec(db, "ALTER TABLE projects ADD COLUMN urgency TEXT DEFAULT 'NORMAL';");
    safeExec(db, "ALTER TABLE projects ADD COLUMN lot_size REAL DEFAULT 1;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN qty REAL DEFAULT 1;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN factory_factor REAL DEFAULT 85;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_status TEXT DEFAULT 'DRAFT';");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_authorized_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_authorized_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_revision_note TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_status TEXT DEFAULT 'DRAFT';");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_authorized_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_authorized_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_revision_note TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN is_master_set INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN master_set_at DATETIME;");

    safeExec(db, "ALTER TABLE work_centers ADD COLUMN code TEXT;");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN efficiency_index REAL DEFAULT 1.0;");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN status TEXT DEFAULT 'ACTIVE';");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN wip_limit INTEGER DEFAULT 20;");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN current_wip_count INTEGER DEFAULT 0;");

    safeExec(db, "ALTER TABLE lot_routing_executions ADD COLUMN scrap_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE lot_routing_executions ADD COLUMN good_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE lot_routing_executions ADD COLUMN operator_name TEXT;");
    safeExec(db, "ALTER TABLE lot_routing_executions ADD COLUMN end_time DATETIME;");
    safeExec(db, "ALTER TABLE lot_routing_executions ADD COLUMN start_time DATETIME;");

    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN machine_id TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN affected_machine_id TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN ndp_number TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN ndp_code TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN reschedule_required INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN estimated_down_hours REAL DEFAULT 48;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN down_started_at DATETIME;");

    safeExec(db, "ALTER TABLE ndps ADD COLUMN project_id TEXT;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN reschedule_required INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN affected_machine_id TEXT;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN machine_id TEXT;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN estimated_down_hours REAL DEFAULT 48;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN down_started_at DATETIME;");

    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN delivery_date TEXT;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN quotation_id TEXT;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN vehicle_plate TEXT;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN driver_name TEXT;");

    safeExec(db, "ALTER TABLE delivery_items ADD COLUMN delivery_id TEXT;");
    safeExec(db, "ALTER TABLE delivery_items ADD COLUMN item_code TEXT;");
    safeExec(db, "ALTER TABLE delivery_items ADD COLUMN item_name TEXT;");
    safeExec(db, "ALTER TABLE delivery_items ADD COLUMN qty_delivered REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE inventory ADD COLUMN min_stock REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE inventory ADD COLUMN max_stock REAL DEFAULT 0;");

    safeExec(db, `
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id TEXT PRIMARY KEY,
        bank_name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        account_holder TEXT NOT NULL,
        branch TEXT,
        account_type TEXT DEFAULT 'OPERATIONAL',
        currency TEXT DEFAULT 'IDR',
        balance REAL DEFAULT 0,
        is_primary INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN description TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN photo_urls TEXT;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN bop_id TEXT;");
    safeExec(db, "ALTER TABLE ndps ADD COLUMN station_id TEXT;");
    safeExec(db, "CREATE TABLE IF NOT EXISTS manufacturing_spks (id TEXT PRIMARY KEY, spk_number TEXT, project_id TEXT, customer_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);");

    safeExec(db, "ALTER TABLE material_dispatches ADD COLUMN station_id TEXT;");

    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN request_date TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN requested_by TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN notes TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN cancelled_at DATETIME;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN archived INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN urgency TEXT DEFAULT 'NORMAL';");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN category TEXT DEFAULT 'PROJECT';");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN archived_at DATETIME;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN remarks TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN escalated_to TEXT;");
    try {
      db.exec(`
        UPDATE quotations
        SET grand_total = CASE WHEN (grand_total IS NULL OR grand_total = 0) THEN amount ELSE grand_total END,
            dpp = CASE 
              WHEN tax_rate > 0 AND (grand_total > 0 OR amount > 0) THEN CAST((COALESCE(NULLIF(grand_total, 0), amount) / (1 + tax_rate/100.0)) AS REAL)
              ELSE COALESCE(NULLIF(dpp, 0), amount)
            END,
            amount = CASE 
              WHEN tax_rate > 0 AND (grand_total > 0 OR amount > 0) THEN CAST((COALESCE(NULLIF(grand_total, 0), amount) / (1 + tax_rate/100.0)) AS REAL)
              ELSE amount
            END
        WHERE (dpp IS NULL OR dpp = 0 OR grand_total IS NULL OR grand_total = 0);
      `);
    } catch (e) {}
    safeExec(db, "ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE users ADD COLUMN level TEXT DEFAULT 'STAFF';");
    safeExec(db, "ALTER TABLE users ADD COLUMN last_seen_at TEXT;");
    safeExec(db, "ALTER TABLE users ADD COLUMN device_type TEXT DEFAULT 'Desktop';");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN archived_at DATETIME;");
    safeExec(db, "ALTER TABLE hr_jobs ADD COLUMN archived_at DATETIME;");
    safeExec(db, "ALTER TABLE customers ADD COLUMN archived_at DATETIME;");
    safeExec(db, "ALTER TABLE customers ADD COLUMN contact_person TEXT;");
    safeExec(db, "ALTER TABLE customers ADD COLUMN npwp TEXT;");
    safeExec(db, "ALTER TABLE suppliers ADD COLUMN npwp TEXT;");
    safeExec(db, "ALTER TABLE suppliers ADD COLUMN tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN';");
    safeExec(db, "ALTER TABLE suppliers ADD COLUMN payment_terms TEXT DEFAULT 'Net 30 Days';");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN archived_at DATETIME;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN payment_terms TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN payment_method TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN';");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN dpp_nilai_lain REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN';");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN dpp_nilai_lain REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN payment_terms TEXT DEFAULT 'Net 30 Days';");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN supplier_npwp TEXT;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN rounding_factor REAL DEFAULT 0;");
    safeExec(db, "UPDATE users SET is_approved = 1 WHERE status = 'APPROVED';");

    // NEW: Machine-Centric & QR-Driven Migrations
    safeExec(db, "ALTER TABLE items ADD COLUMN item_type TEXT DEFAULT 'MATERIAL' CHECK (item_type IN ('MATERIAL', 'TOOL', 'MACHINE', 'CONSUMABLE', 'OTHER'));");
    safeExec(db, "ALTER TABLE items ADD COLUMN machine_category TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN capacity_per_hour REAL;");
    safeExec(db, "ALTER TABLE items ADD COLUMN machine_status TEXT DEFAULT 'AVAILABLE' CHECK (machine_status IN ('AVAILABLE', 'ASSIGNED', 'RUNNING', 'MAINTENANCE', 'BROKEN', 'RETIRED'));");
    safeExec(db, "ALTER TABLE items ADD COLUMN bypass_multi_station INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE items ADD COLUMN serial_number TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN manufacturer TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN machine_specifications TEXT;");
    
    // Stations - add machine_ids array (JSON)
    safeExec(db, "ALTER TABLE production_stations ADD COLUMN machine_ids TEXT DEFAULT '[]';");
    // Bill of Processes - add machine assignments
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN cycle_time_minutes REAL;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN manpower_allocated REAL DEFAULT 1;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN assigned_machine_id TEXT REFERENCES items(id);");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN alternative_machine_ids TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN setup_time_minutes REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN teardown_time_minutes REAL DEFAULT 0;");
    // WOTs - add QR and travel log fields
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN qr_payload TEXT;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN qr_image_url TEXT;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN machine_id TEXT REFERENCES items(id);");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN good_units INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN reject_units INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN rework_units INTEGER DEFAULT 0;");

    // Enhance NDPs
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN severity TEXT DEFAULT 'MEDIUM';");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN affected_machine_id TEXT REFERENCES items(id);");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN machine_lockdown_scope TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN material_request TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN ripple_analysis TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN resolution_type TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN resolution_notes TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN verified_by_qc INTEGER DEFAULT 0;");

    // Performance Indexing
    safeExec(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_consumption_unique ON bom_item_consumption(bom_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_hr_applications_email ON hr_applications(email);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_hr_attendances_emp ON hr_attendances(employee_username);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_hr_kpis_emp ON hr_kpis(employee_username);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pr_project ON purchase_requests(project_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_po_pr ON purchase_orders(pr_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_projects_quotation ON projects(quotation_id);");

    safeExec(db, "ALTER TABLE work_centers ADD COLUMN efficiency_index REAL DEFAULT 1.0;");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN status TEXT DEFAULT 'ACTIVE';");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN wip_limit INTEGER DEFAULT 20;");
    safeExec(db, "ALTER TABLE work_centers ADD COLUMN current_wip_count INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_orders ADD COLUMN current_work_center_id TEXT;");
    safeExec(db, "ALTER TABLE work_orders ADD COLUMN current_step_sequence INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_orders ADD COLUMN wip_status TEXT DEFAULT 'IN_BUFFER';");
    safeExec(db, "ALTER TABLE pr_items ADD COLUMN expected_delivery_date TEXT;");
    safeExec(db, "ALTER TABLE project_tasks ADD COLUMN pr_id TEXT;");
    safeExec(db, "ALTER TABLE project_tasks ADD COLUMN po_id TEXT;");
    safeExec(db, "ALTER TABLE project_tasks ADD COLUMN station_id TEXT;");
    safeExec(db, "ALTER TABLE quotation_items ADD COLUMN unit_price REAL DEFAULT 0;");

    // Unified B2B & B2C Sales Migrations
    safeExec(db, "ALTER TABLE items ADD COLUMN barcode TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN selling_price REAL;");
    safeExec(db, "ALTER TABLE customers ADD COLUMN customer_type TEXT DEFAULT 'B2B';");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN sales_channel TEXT DEFAULT 'B2B_PROJECT';");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN settlement_type TEXT DEFAULT 'CREDIT_TERM';");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN receipt_number TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN customer_name_manual TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN customer_phone_manual TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN payment_reference TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN cash_tendered REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN change_due REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN paid_at DATETIME;");
    safeExec(db, "ALTER TABLE quotation_items ADD COLUMN item_id TEXT;");
    safeExec(db, "ALTER TABLE quotation_items ADD COLUMN barcode TEXT;");
    safeExec(db, "ALTER TABLE quotation_items ADD COLUMN discount_amount REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN sales_channel TEXT DEFAULT 'B2B_PROJECT';");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN receipt_number TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN payment_method TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN payment_reference TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN is_direct_settled INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN bank_account_id TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN payment_terms TEXT DEFAULT 'Net 30';");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN job_description TEXT;");

    // Add revision notes for Revise feature
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN remarks TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN escalated_to TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN category TEXT DEFAULT 'PROJECT';");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN escalated_to TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE quotation_items ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE pr_items ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN tax_rate REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN discount_rate REAL DEFAULT 0;");

    // NTP Migrations (Renaming NTC to NTP)
    safeExec(db, "ALTER TABLE ntcs RENAME TO ntps;");
    safeExec(db, "ALTER TABLE ntps RENAME COLUMN ntc_number TO ntp_number;");
    safeExec(db, "ALTER TABLE projects RENAME COLUMN ntc_id TO ntp_id;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN is_master_set INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN master_set_at DATETIME;");

    // Items Column Migrations
    safeExec(db, "ALTER TABLE items ADD COLUMN category TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN description TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN min_stock REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE items ADD COLUMN max_stock REAL DEFAULT 0;");

    // Inventory Dual-Stock Migrations
    safeExec(db, "ALTER TABLE inventory ADD COLUMN physical_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE inventory ADD COLUMN reserved_qty REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE inventory ADD COLUMN available_qty REAL DEFAULT 0;");
    safeExec(db, `
      UPDATE inventory 
      SET physical_qty = COALESCE(NULLIF(physical_qty, 0), COALESCE(free_stock, 0) + COALESCE(allocated_stock, 0)),
          reserved_qty = COALESCE(NULLIF(reserved_qty, 0), COALESCE(allocated_stock, 0)),
          available_qty = COALESCE(NULLIF(available_qty, 0), COALESCE(free_stock, 0))
      WHERE (physical_qty IS NULL OR physical_qty = 0) AND (free_stock > 0 OR allocated_stock > 0);
    `);

    // 2. Main Table Creations
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        level TEXT DEFAULT 'STAFF',
        name TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        is_approved INTEGER DEFAULT 0,
        last_seen_at TEXT,
        device_type TEXT DEFAULT 'Desktop',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS work_centers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        manpower_count INTEGER DEFAULT 1,
        hours_per_day REAL DEFAULT 8,
        days_per_week INTEGER DEFAULT 5,
        capacity_per_week REAL DEFAULT 40,
        efficiency_index REAL DEFAULT 1.0,
        status TEXT DEFAULT 'ACTIVE'
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        due_date TEXT NOT NULL,
        customer TEXT,
        remarks TEXT,
        status TEXT DEFAULT 'DRAFT',
        urgency TEXT DEFAULT 'NORMAL',
        bq_updated_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        archived_at DATETIME,
        deleted_at DATETIME,
        parent_project_id TEXT,
        factory_factor REAL DEFAULT 85,
        FOREIGN KEY (parent_project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS bom_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bom_template_items (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        dimension TEXT,
        spec TEXT,
        required_qty REAL NOT NULL,
        unit_price REAL DEFAULT 0,
        FOREIGN KEY (template_id) REFERENCES bom_templates(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      
      CREATE TABLE IF NOT EXISTS production_logs (
        id TEXT PRIMARY KEY,
        log_type TEXT NOT NULL,
        project_id TEXT,
        wot_id TEXT,
        station_id TEXT,
        process_id TEXT,
        machine_id TEXT,
        user_id TEXT,
        user_role TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        device_info TEXT,
        gps_location TEXT,
        details TEXT,
        photo_urls TEXT,
        is_verified INTEGER DEFAULT 0,
        verified_by TEXT,
        verified_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS floor_requests (
        id TEXT PRIMARY KEY,
        request_code TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        category TEXT DEFAULT 'NORMAL',
        status TEXT DEFAULT 'PENDING',
        requested_by TEXT NOT NULL,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        station_id TEXT,
        project_id TEXT,
        process_id TEXT,
        wot_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        photo_urls TEXT,
        qty_required REAL,
        unit TEXT,
        bom_item_id TEXT,
        item_name TEXT,
        auto_pr INTEGER DEFAULT 0,
        pr_id TEXT,
        tool_item_id TEXT,
        requested_machine_category TEXT,
        reason TEXT,
        fulfilled_by TEXT,
        fulfilled_at DATETIME,
        fulfillment_notes TEXT,
        fulfillment_photo_urls TEXT,
        acknowledged_at DATETIME,
        acknowledged_by TEXT,
        in_progress_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS ndps (
        id TEXT PRIMARY KEY,
        ndp_code TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        severity TEXT DEFAULT 'MEDIUM',
        status TEXT DEFAULT 'ACTIVE',
        reported_by TEXT NOT NULL,
        reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_by TEXT,
        resolved_at DATETIME,
        description TEXT NOT NULL,
        photo_urls TEXT,
        affected_machine_id TEXT,
        machine_lockdown_scope TEXT,
        material_request TEXT,
        ripple_analysis TEXT,
        resolution_type TEXT,
        resolution_notes TEXT,
        verified_by_qc INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS machine_schedules (
        id TEXT PRIMARY KEY,
        machine_id TEXT NOT NULL,
        project_id TEXT,
        station_id TEXT,
        process_id TEXT,
        wot_id TEXT,
        assigned_at DATETIME NOT NULL,
        released_at DATETIME,
        is_active INTEGER DEFAULT 1,
        bypass_station_lock INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS wot_travel_logs (
        id TEXT PRIMARY KEY,
        wot_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        station_id TEXT,
        process_id TEXT,
        machine_id TEXT,
        user_id TEXT,
        user_name TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        item_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        dimension TEXT,
        spec TEXT,
        type TEXT CHECK (type IN ('RAW', 'WIP', 'FINISHED', 'TOOL', 'MACHINE')),
        uom TEXT NOT NULL,
        unit_price REAL DEFAULT 0,
        lead_time_days INTEGER DEFAULT 0,
        category TEXT,
        description TEXT,
        min_stock REAL DEFAULT 0,
        max_stock REAL DEFAULT 0,
        machine_category TEXT,
        capacity_per_hour REAL,
        operational_status TEXT DEFAULT 'AVAILABLE',
        bypass_multi_station INTEGER DEFAULT 0,
        serial_number TEXT,
        manufacturer TEXT,
        machine_specifications TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE,
        contact_person TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        npwp TEXT,
        tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN',
        payment_terms TEXT DEFAULT 'Net 30 Days',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS inventory (
        item_id TEXT PRIMARY KEY,
        physical_qty REAL DEFAULT 0,
        reserved_qty REAL DEFAULT 0,
        available_qty REAL DEFAULT 0,
        free_stock REAL DEFAULT 0,
        allocated_stock REAL DEFAULT 0,
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        entry_number TEXT UNIQUE NOT NULL,
        entry_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        reference_type TEXT NOT NULL,
        reference_id TEXT,
        reference_number TEXT,
        description TEXT NOT NULL,
        total_debit REAL DEFAULT 0,
        total_credit REAL DEFAULT 0,
        status TEXT DEFAULT 'POSTED',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS journal_entry_lines (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        account_code TEXT NOT NULL,
        account_name TEXT NOT NULL,
        debit REAL DEFAULT 0,
        credit REAL DEFAULT 0,
        memo TEXT,
        FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS boms (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        dimension TEXT,
        spec TEXT,
        required_qty REAL NOT NULL,
        unit_price REAL DEFAULT 0,
        reference TEXT,
        target_project_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS purchase_requests (
        id TEXT PRIMARY KEY,
        pr_number TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        expected_delivery_date TEXT,
        drawing_reference TEXT,
        total_estimated_cost REAL DEFAULT 0,
        status TEXT DEFAULT 'DRAFTED',
        authorized_at DATETIME,
        authorized_doc TEXT,
        cancelled_at DATETIME,
        archived INTEGER DEFAULT 0,
        urgency TEXT DEFAULT 'NORMAL',
        revision_note TEXT,
        remarks TEXT,
        escalated_to TEXT,
        category TEXT DEFAULT 'PROJECT',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        po_number TEXT UNIQUE NOT NULL,
        supplier_id TEXT,
        supplier_name TEXT NOT NULL,
        supplier_npwp TEXT,
        expected_date TEXT,
        auth_doc_name TEXT,
        total_amount REAL DEFAULT 0,
        tax_category TEXT DEFAULT 'GOODS',
        tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN',
        ppn_rate REAL DEFAULT 12,
        pph_rate REAL DEFAULT 0,
        dpp REAL DEFAULT 0,
        dpp_nilai_lain REAL DEFAULT 0,
        ppn REAL DEFAULT 0,
        pph REAL DEFAULT 0,
        rounding_factor REAL DEFAULT 0,
        grand_total REAL DEFAULT 0,
        payment_terms TEXT DEFAULT 'Net 30 Days',
        status TEXT DEFAULT 'DRAFTED',
        authorized_at DATETIME,
        cancelled_at DATETIME,
        archived INTEGER DEFAULT 0,
        urgency TEXT DEFAULT 'NORMAL',
        revision_note TEXT,
        escalated_to TEXT,
        amount_paid REAL DEFAULT 0,
        payment_status TEXT DEFAULT 'UNPAID',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      );

      CREATE TABLE IF NOT EXISTS project_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_name TEXT NOT NULL,
        work_center_id TEXT,
        required_hours REAL DEFAULT 0,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        actual_start_date TEXT,
        actual_end_date TEXT,
        progress INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PENDING',
        pr_id TEXT,
        po_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (work_center_id) REFERENCES work_centers(id)
      );

      CREATE TABLE IF NOT EXISTS pr_items (
        id TEXT PRIMARY KEY,
        pr_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        dimension TEXT,
        spec TEXT,
        expected_delivery_date TEXT,
        qty REAL NOT NULL,
        unit_price REAL DEFAULT 0,
        po_id TEXT,
        revision_note TEXT,
        FOREIGN KEY (pr_id) REFERENCES purchase_requests(id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
      );

      CREATE TABLE IF NOT EXISTS grns (
        id TEXT PRIMARY KEY,
        po_id TEXT NOT NULL,
        received_date TEXT NOT NULL,
        engineering_user TEXT,
        qc_user TEXT,
        qc_status TEXT CHECK (qc_status IN ('PASSED', 'REJECTED', 'CONDITIONAL')),
        remarks TEXT,
        rejected_grn_doc TEXT,
        is_reissue BOOLEAN DEFAULT 0,
        inventory_updated_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
      );

      CREATE TABLE IF NOT EXISTS grn_items (
        id TEXT PRIMARY KEY,
        grn_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        dimension TEXT,
        spec TEXT,
        qty_received REAL NOT NULL,
        FOREIGN KEY (grn_id) REFERENCES grns(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        project_id TEXT,
        type TEXT CHECK (type IN ('ALLOCATION', 'GRN', 'CONSUMPTION', 'ADJUSTMENT', 'RELEASE', 'GRN_ALLOCATION', 'RETURN')),
        qty REAL NOT NULL,
        reference_id TEXT,
        recorded_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS bom_item_consumption (
        id TEXT PRIMARY KEY,
        bom_id TEXT UNIQUE NOT NULL,
        qty_consumed REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bom_id) REFERENCES boms(id)
      );

      CREATE TABLE IF NOT EXISTS work_orders (
        id TEXT PRIMARY KEY,
        wo_number TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        status TEXT DEFAULT 'DRAFT',
        current_work_center_id TEXT,
        current_step_sequence INTEGER DEFAULT 0,
        wip_status TEXT DEFAULT 'IN_BUFFER',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS work_order_items (
        id TEXT PRIMARY KEY,
        wo_id TEXT NOT NULL,
        bom_id TEXT NOT NULL,
        qty_to_consume REAL NOT NULL,
        qty_actually_consumed REAL DEFAULT 0,
        FOREIGN KEY (wo_id) REFERENCES work_orders(id),
        FOREIGN KEY (bom_id) REFERENCES boms(id)
      );

      CREATE TABLE IF NOT EXISTS work_center_routings (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        item_id TEXT,
        step_sequence INTEGER NOT NULL,
        work_center_id TEXT NOT NULL,
        operation_name TEXT NOT NULL,
        standard_cycle_time_mins REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_center_id) REFERENCES work_centers(id)
      );

      CREATE TABLE IF NOT EXISTS bop_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        version_number TEXT NOT NULL,
        routing_json TEXT NOT NULL,
        published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        published_by TEXT,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS production_stations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        station_code TEXT NOT NULL,
        station_name TEXT NOT NULL,
        station_type TEXT DEFAULT 'SERIAL',
        machine_ids TEXT DEFAULT '[]',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bill_of_processes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        step_sequence INTEGER NOT NULL,
        process_name TEXT NOT NULL,
        node_type TEXT DEFAULT 'PROCESS', -- 'PROCESS' or 'PRODUCT'
        work_center_id TEXT,
        work_center_name TEXT,
        execution_type TEXT DEFAULT 'SERIAL', -- 'SERIAL' or 'PARALLEL'
        predecessor_ids TEXT DEFAULT '[]', -- JSON Array of IDs
        standard_hours REAL DEFAULT 8.0,
        manpower_allocated REAL DEFAULT 1,
        station_id TEXT,
        cycle_time_minutes REAL DEFAULT 0,
        assigned_machine_id TEXT,
        alternative_machine_ids TEXT DEFAULT '[]',
        setup_time_minutes REAL DEFAULT 0,
        teardown_time_minutes REAL DEFAULT 0,
        shift_mode INTEGER DEFAULT 1, -- 1, 2, or 3
        start_date TEXT,
        end_date TEXT,
        actual_start_date TEXT,
        actual_end_date TEXT,
        status TEXT DEFAULT 'PENDING', -- 'PENDING', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED'
        progress INTEGER DEFAULT 0,
        notes TEXT,
        completed_by_operator TEXT,
        completed_at_timestamp DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS product_node_lifecycle (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        bop_step_id TEXT NOT NULL,
        status TEXT DEFAULT 'PLANNED', -- 'PLANNED', 'ALLOCATED', 'AVAILABLE', 'CONSUMED', 'PRODUCED', 'SCRAPPED'
        qty REAL DEFAULT 0,
        location TEXT,
        scanned_by TEXT,
        scanned_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (bop_step_id) REFERENCES bill_of_processes(id)
      );

      CREATE TABLE IF NOT EXISTS notice_to_down_processes (
        id TEXT PRIMARY KEY,
        ndp_number TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        bop_id TEXT NOT NULL,
        reason_category TEXT NOT NULL, -- 'MATERIAL_DELAY', 'MACHINE_BREAKDOWN', 'QUALITY_REWORK', 'DESIGN_REVISION', 'FORCE_MAJEURE'
        reason_detail TEXT NOT NULL,
        estimated_down_hours REAL DEFAULT 0,
        actual_down_minutes REAL DEFAULT 0,
        authorized_by TEXT NOT NULL,
        authorized_role TEXT,
        pin_verified INTEGER DEFAULT 1,
        status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE' or 'RESOLVED'
        down_started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resumed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (bop_id) REFERENCES bill_of_processes(id)
      );

      CREATE TABLE IF NOT EXISTS task_travel_tags (
        id TEXT PRIMARY KEY,
        tag_number TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        bop_id TEXT NOT NULL,
        qr_payload TEXT NOT NULL,
        operator_name TEXT NOT NULL,
        operator_team TEXT,
        qc_inspector TEXT,
        qc_status TEXT DEFAULT 'PASSED',
        good_qty REAL DEFAULT 1,
        scrap_qty REAL DEFAULT 0,
        started_at TEXT,
        completed_at TEXT,
        total_downtime_minutes REAL DEFAULT 0,
        verified_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (bop_id) REFERENCES bill_of_processes(id)
      );

      CREATE TABLE IF NOT EXISTS finish_good_records (
        id TEXT PRIMARY KEY,
        fgr_number TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        item_code TEXT NOT NULL,
        item_name TEXT,
        serial_number TEXT,
        quantity REAL DEFAULT 1,
        uom TEXT DEFAULT 'UNIT',
        status TEXT DEFAULT 'APPROVED',
        notes TEXT,
        inspected_by TEXT,
        target_warehouse TEXT DEFAULT 'WAREHOUSE_FG_1',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS wip_movements (
        id TEXT PRIMARY KEY,
        work_order_id TEXT NOT NULL,
        from_work_center_id TEXT,
        to_work_center_id TEXT NOT NULL,
        step_sequence INTEGER NOT NULL,
        good_qty REAL NOT NULL DEFAULT 1,
        scrap_qty REAL DEFAULT 0,
        operator_email TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_order_id) REFERENCES work_orders(id),
        FOREIGN KEY (from_work_center_id) REFERENCES work_centers(id),
        FOREIGN KEY (to_work_center_id) REFERENCES work_centers(id)
      );

      CREATE TABLE IF NOT EXISTS audit_trail (
        id TEXT PRIMARY KEY,
        user_email TEXT,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS forum_posts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author_username TEXT NOT NULL,
        author_role TEXT NOT NULL,
        category TEXT NOT NULL,
        pinned_until DATETIME,
        shared_resource_type TEXT, -- 'PROJECT', 'PR', 'PO'
        shared_resource_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS forum_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        content TEXT NOT NULL,
        author_username TEXT NOT NULL,
        author_role TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES forum_posts(id)
      );

      CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY,
        name TEXT,
        is_group BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT 
      );

      CREATE TABLE IF NOT EXISTS chat_participants (
        thread_id TEXT NOT NULL,
        username TEXT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (thread_id, username)
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        sender_username TEXT NOT NULL,
        content TEXT,
        file_url TEXT,
        file_name TEXT,
        file_size INTEGER,
        file_type TEXT,
        read_by TEXT DEFAULT '',
        is_deleted BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
      );

      CREATE TABLE IF NOT EXISTS user_drafts (
        key TEXT NOT NULL,
        username TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (key, username)
      );

      CREATE TABLE IF NOT EXISTS inventory_labels (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        grn_id TEXT,
        original_qty REAL NOT NULL,
        current_qty REAL NOT NULL,
        project_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS inventory_reservations (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        spk_id TEXT,
        qty REAL NOT NULL,
        status TEXT DEFAULT 'ACTIVE', -- ACTIVE, CONSUMED, CANCELLED
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      DROP TABLE IF EXISTS warehouse_bin_transfers;
      DROP TABLE IF EXISTS warehouse_bin_allocations;
      DROP TABLE IF EXISTS warehouse_bins;
      DROP TABLE IF EXISTS warehouse_zones;

      CREATE TABLE IF NOT EXISTS item_price_history (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        unit_price REAL NOT NULL,
        recorded_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      );
      CREATE TABLE IF NOT EXISTS item_supplier_prices (
        item_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        unit_price REAL NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (item_id, supplier_id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        contact_person TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        npwp TEXT,
        customer_type TEXT DEFAULT 'B2B',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS delivery_notes (
        id TEXT PRIMARY KEY,
        dn_number TEXT UNIQUE NOT NULL,
        customer_id TEXT NOT NULL,
        project_id TEXT,
        status TEXT DEFAULT 'DRAFT', -- DRAFT, PENDING_DELIVERY, IN_DELIVERY, DELIVERED
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        authorized_by TEXT,
        police_number TEXT,
        shipped_at DATETIME,
        delivered_at DATETIME,
        invoiced_at DATETIME,
        remarks TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS delivery_items (
        id TEXT PRIMARY KEY,
        dn_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        qty REAL NOT NULL,
        uom TEXT NOT NULL,
        remarks TEXT,
        FOREIGN KEY (dn_id) REFERENCES delivery_notes(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS dn_signatures (
        id TEXT PRIMARY KEY,
        dn_id TEXT NOT NULL,
        role TEXT NOT NULL,
        signer_name TEXT,
        file_url TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dn_id) REFERENCES delivery_notes(id)
      );

      CREATE TABLE IF NOT EXISTS delivery_receipts (
        id TEXT PRIMARY KEY,
        receipt_number TEXT UNIQUE NOT NULL,
        dn_id TEXT,
        customer_id TEXT,
        customer_name TEXT,
        received_by TEXT NOT NULL,
        delivered_by TEXT,
        authorized_by TEXT,
        receipt_date TEXT NOT NULL,
        status TEXT DEFAULT 'VALIDATED',
        condition_summary TEXT DEFAULT 'Goods received in complete count and good condition.',
        notes TEXT,
        digital_signature TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dn_id) REFERENCES delivery_notes(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );

      CREATE TABLE IF NOT EXISTS delivery_receipt_items (
        id TEXT PRIMARY KEY,
        receipt_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        qty REAL NOT NULL,
        uom TEXT DEFAULT 'PCS',
        condition TEXT DEFAULT 'GOOD',
        remarks TEXT,
        FOREIGN KEY (receipt_id) REFERENCES delivery_receipts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS commercial_invoices (
        id TEXT PRIMARY KEY,
        ci_number TEXT UNIQUE NOT NULL,
        dn_id TEXT NOT NULL UNIQUE,
        customer_id TEXT NOT NULL,
        project_id TEXT,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'UNPAID', -- UNPAID, PAID
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        paid_at DATETIME,
        bank_account_id TEXT,
        payment_terms TEXT DEFAULT 'Net 30',
        job_description TEXT,
        amount_paid REAL DEFAULT 0,
        payment_status TEXT DEFAULT 'UNPAID',
        ppn REAL DEFAULT 0,
        pph REAL DEFAULT 0,
        ppn_rate REAL DEFAULT 12,
        pph_rate REAL DEFAULT 2,
        total_amount REAL DEFAULT 0,
        gross_amount REAL DEFAULT 0,
        discount_rate REAL DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        dpp REAL DEFAULT 0,
        rounding_factor REAL DEFAULT 0,
        grand_total REAL DEFAULT 0,
        sales_channel TEXT DEFAULT 'B2B_PROJECT',
        receipt_number TEXT,
        payment_method TEXT,
        payment_reference TEXT,
        is_direct_settled INTEGER DEFAULT 0,
        FOREIGN KEY (dn_id) REFERENCES delivery_notes(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id)
      );
    `);

    // 2.1 Human Resource Tables
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_jobs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        department TEXT NOT NULL,
        location TEXT DEFAULT 'Head Office',
        status TEXT CHECK(status IN ('OPEN', 'CLOSED')) DEFAULT 'OPEN',
        type TEXT DEFAULT 'Full-time',
        description TEXT NOT NULL,
        requirements TEXT,
        benefits TEXT,
        salary_string TEXT,
        pamphlet_bg_color TEXT DEFAULT '#1c1917',
        pamphlet_accent_color TEXT DEFAULT '#ca8a04',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_applications (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        linkedin_url TEXT,
        experience TEXT,
        resume_text TEXT,
        status TEXT CHECK(status IN ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER_MADE', 'ACCEPTED', 'REJECTED')) DEFAULT 'APPLIED',
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        onboarding_token TEXT,
        token_used INTEGER DEFAULT 0,
        archived_at DATETIME,
        FOREIGN KEY (job_id) REFERENCES hr_jobs(id) ON DELETE CASCADE
      );
    `,
    ).run();

    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN onboarding_token TEXT;");
    safeExec(db, "ALTER TABLE hr_applications ADD COLUMN token_used INTEGER DEFAULT 0;");

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_kpis (
        id TEXT PRIMARY KEY,
        employee_username TEXT NOT NULL,
        evaluator_username TEXT NOT NULL,
        period_name TEXT NOT NULL,
        score_communication INTEGER DEFAULT 0,
        score_productivity INTEGER DEFAULT 0,
        score_reliability INTEGER DEFAULT 0,
        score_leadership INTEGER DEFAULT 0,
        score_technical INTEGER DEFAULT 0,
        overall_score REAL DEFAULT 0,
        evaluation_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_username) REFERENCES users(username),
        FOREIGN KEY (evaluator_username) REFERENCES users(username)
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS finance_transactions (
        id TEXT PRIMARY KEY,
        transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        type TEXT NOT NULL CHECK(type IN ('IN', 'OUT')),
        category TEXT NOT NULL CHECK(category IN ('RECEIVABLE', 'PAYABLE', 'PAYROLL', 'GENERAL', 'CONSUMABLE', 'OTHERS', 'TRANSPORTATION')),
        reference_id TEXT,
        amount REAL NOT NULL,
        payment_method TEXT,
        notes TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS accounting_periods (
        id TEXT PRIMARY KEY,
        period_key TEXT UNIQUE NOT NULL, -- e.g. "2026-09"
        period_name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT CHECK(status IN ('OPEN', 'SOFT_LOCKED', 'HARD_CLOSED')) DEFAULT 'OPEN',
        locked_by TEXT,
        locked_at DATETIME,
        closed_by TEXT,
        closed_at DATETIME,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
        type TEXT DEFAULT 'CURRENT',
        normal_balance TEXT CHECK(normal_balance IN ('DEBIT', 'CREDIT')) DEFAULT 'DEBIT',
        description TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS finance_payroll (
        id TEXT PRIMARY KEY,
        prq_id TEXT,
        voucher_number TEXT,
        period_name TEXT NOT NULL,
        period_month INTEGER,
        period_year INTEGER,
        total_amount REAL NOT NULL,
        status TEXT CHECK(status IN ('DRAFTED', 'AUTHORIZED', 'PAID')) DEFAULT 'DRAFTED',
        details_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        paid_at DATETIME
      );
    `,
    ).run();

    safeExec(db, "ALTER TABLE finance_payroll ADD COLUMN prq_id TEXT;");
    safeExec(db, "ALTER TABLE finance_payroll ADD COLUMN voucher_number TEXT;");
    safeExec(db, "ALTER TABLE finance_payroll ADD COLUMN period_month INTEGER;");
    safeExec(db, "ALTER TABLE finance_payroll ADD COLUMN period_year INTEGER;");

    // Create Payroll Requisitions (PRq) table for HR Submission Workflow
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS payroll_requisitions (
        id TEXT PRIMARY KEY,
        requisition_number TEXT UNIQUE NOT NULL,
        period_month INTEGER NOT NULL,
        period_year INTEGER NOT NULL,
        period_name TEXT NOT NULL,
        submitted_by TEXT NOT NULL,
        submitted_at DATETIME,
        status TEXT CHECK(status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONVERTED')) DEFAULT 'DRAFT',
        total_gross REAL NOT NULL DEFAULT 0,
        total_deductions REAL NOT NULL DEFAULT 0,
        total_net REAL NOT NULL DEFAULT 0,
        notes TEXT,
        rejection_reason TEXT,
        details_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_handovers (
        id TEXT PRIMARY KEY,
        resigning_username TEXT NOT NULL,
        successor_username TEXT NOT NULL,
        target_last_date TEXT NOT NULL,
        status TEXT CHECK(status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')) DEFAULT 'PENDING',
        handover_notes TEXT,
        checklist_json TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (resigning_username) REFERENCES users(username),
        FOREIGN KEY (successor_username) REFERENCES users(username)
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_leaves (
        id TEXT PRIMARY KEY,
        employee_username TEXT NOT NULL,
        leave_type TEXT NOT NULL, -- SICK, ANNUAL, MATERNITY, UNPAID
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        reason TEXT,
        status TEXT CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
        approved_by TEXT,
        manager_note TEXT,
        updated_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_username) REFERENCES users(username),
        FOREIGN KEY (approved_by) REFERENCES users(username)
      );
    `,
    ).run();

    safeExec(db, "ALTER TABLE hr_leaves ADD COLUMN manager_note TEXT;");
    safeExec(db, "ALTER TABLE hr_leaves ADD COLUMN updated_at DATETIME;");

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_salaries (
        employee_username TEXT PRIMARY KEY,
        basic_salary REAL DEFAULT 0,
        allowances REAL DEFAULT 0,
        deductions REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_username) REFERENCES users(username) ON DELETE CASCADE
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS hr_payslips (
        id TEXT PRIMARY KEY,
        employee_username TEXT NOT NULL,
        period_month TEXT NOT NULL, -- YYYY-MM
        basic_salary REAL DEFAULT 0,
        allowances REAL DEFAULT 0,
        deductions REAL DEFAULT 0,
        net_salary REAL DEFAULT 0,
        status TEXT CHECK(status IN ('DRAFT', 'PUBLISHED', 'PAID')) DEFAULT 'DRAFT',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_username) REFERENCES users(username)
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS cms_settings (
        page TEXT PRIMARY KEY,
        content_json TEXT NOT NULL
      );
    `,
    ).run();

    // Default CMS content
    try {
      const existingCms = db
        .prepare("SELECT * FROM cms_settings WHERE page = 'careers'")
        .get();
      if (!existingCms) {
        db.prepare(
          "INSERT INTO cms_settings (page, content_json) VALUES (?, ?)",
        ).run(
          "careers",
          JSON.stringify({
            hero_title: "Join Our Innovative Team",
            hero_subtitle:
              "Build the future with us. We are looking for passionate individuals.",
            benefits: [
              "Flexible Hours",
              "Health Insurance",
              "Remote Work Options",
              "Continuous Learning",
            ],
          }),
        );
      }
    } catch (e) {}

    // Create quotations, spks, and ntps tables
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS quotations (
        id TEXT PRIMARY KEY,
        quotation_number TEXT UNIQUE NOT NULL,
        customer_id TEXT NOT NULL,
        title TEXT NOT NULL,
        amount REAL NOT NULL,
        validity_days INTEGER DEFAULT 20,
        status TEXT DEFAULT 'APPROVED', -- APPROVED, PROCESSED, EXPIRED
        revision_note TEXT,
        tax_rate REAL DEFAULT 0,
        discount_rate REAL DEFAULT 0,
        npwp_tax_id TEXT,
        pph_rate REAL DEFAULT 0,
        dpp REAL DEFAULT 0,
        dpp_nilai_lain REAL DEFAULT 0,
        tax_scheme TEXT DEFAULT 'DPP_NILAI_LAIN',
        payment_terms TEXT,
        payment_method TEXT,
        rounding_factor REAL DEFAULT 0,
        grand_total REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        remarks TEXT,
        archived_at DATETIME,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS quotation_items (
        id TEXT PRIMARY KEY,
        quotation_id TEXT NOT NULL,
        title TEXT NOT NULL,
        qty REAL DEFAULT 1,
        uom TEXT DEFAULT 'Unit',
        unit_price REAL DEFAULT 0,
        revision_note TEXT,
        FOREIGN KEY (quotation_id) REFERENCES quotations(id)
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS spks (
        id TEXT PRIMARY KEY,
        spk_number TEXT UNIQUE NOT NULL,
        project_id TEXT,
        quotation_id TEXT,
        title TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'APPROVED',
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (quotation_id) REFERENCES quotations(id)
      );
    `,
    ).run();

    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS ntps (
        id TEXT PRIMARY KEY,
        ntp_number TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        quotation_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'ISSUED',
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (quotation_id) REFERENCES quotations(id)
      );
    `,
    ).run();

    db.exec(
      `
      CREATE TABLE IF NOT EXISTS crm_leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact_info TEXT NOT NULL,
        intent TEXT,
        status TEXT DEFAULT 'NEW',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS potential_customers (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company TEXT,
        auth_provider TEXT DEFAULT 'FORM',
        avatar_url TEXT,
        cart_snapshot TEXT,
        cart_total_value REAL DEFAULT 0,
        cart_total_items INTEGER DEFAULT 0,
        status TEXT DEFAULT 'NEW_INTENT',
        potential_score INTEGER DEFAULT 0,
        persona_tag TEXT DEFAULT 'Unverified',
        buying_power_est TEXT,
        scout_summary TEXT,
        scout_company TEXT,
        scout_role TEXT,
        scout_sources TEXT,
        scout_recommendations TEXT,
        scouted_at DATETIME,
        last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sales_notes TEXT,
        assigned_to TEXT,
        converted_order_id TEXT,
        visitor_session_id TEXT,
        activity_count INTEGER DEFAULT 0,
        customer_segment TEXT DEFAULT 'CART_ACTIVE',
        lifecycle_stage TEXT DEFAULT 'LEAD',
        lead_grade TEXT DEFAULT 'C',
        scout_status TEXT DEFAULT 'NOT_SCOUTED',
        fit_score INTEGER DEFAULT 0,
        intent_score INTEGER DEFAULT 0,
        reachability_score INTEGER DEFAULT 0,
        profiling_consent INTEGER DEFAULT 1,
        marketing_consent INTEGER DEFAULT 1,
        terms_accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        privacy_policy_version TEXT DEFAULT 'v1.0',
        consent_withdrawn_at DATETIME,
        lead_score_breakdown TEXT,
        scout_confidence TEXT DEFAULT 'MEDIUM',
        key_talking_points TEXT,
        recommended_products TEXT,
        risk_flags TEXT,
        sources_json TEXT,
        scout_triggered_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS customer_consents (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        consent_type TEXT NOT NULL,
        granted INTEGER NOT NULL,
        policy_version TEXT NOT NULL,
        granted_at DATETIME,
        withdrawn_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS scout_jobs (
        id TEXT PRIMARY KEY,
        job_type TEXT DEFAULT 'MANUAL',
        status TEXT DEFAULT 'QUEUED',
        customer_ids TEXT NOT NULL,
        triggered_by TEXT,
        progress INTEGER DEFAULT 0,
        error_log TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS outreach_activities (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        template_id TEXT,
        custom_note TEXT,
        sent_by TEXT NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'SENT',
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS ai_feedback (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        field TEXT NOT NULL,
        flag TEXT NOT NULL,
        note TEXT,
        flagged_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS erasure_requests (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        reason TEXT,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'QUEUED',
        completed_at DATETIME,
        propagated_tables TEXT
      );

      CREATE TABLE IF NOT EXISTS scout_icp_config (
        id TEXT PRIMARY KEY,
        company_name TEXT,
        target_industries TEXT,
        target_buyer_personas TEXT,
        priority_products TEXT,
        scoring_weights TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS visitor_activities (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        customer_id TEXT,
        module TEXT NOT NULL,
        activity_type TEXT NOT NULL,
        title TEXT NOT NULL,
        details TEXT,
        page_url TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `,
    );

    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_status ON potential_customers(status);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_score ON potential_customers(potential_score);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_grade ON potential_customers(lead_grade);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_segment ON potential_customers(customer_segment);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_scout_status ON potential_customers(scout_status);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_consent ON potential_customers(profiling_consent);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_created ON potential_customers(created_at);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pot_cust_session ON potential_customers(visitor_session_id);");

    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_cust_consents_cust ON customer_consents(customer_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_outreach_cust ON outreach_activities(customer_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_feedback_cust ON ai_feedback(customer_id);");

    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_vis_act_session ON visitor_activities(session_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_vis_act_customer ON visitor_activities(customer_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_vis_act_created ON visitor_activities(created_at);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_vis_act_module ON visitor_activities(module);");

    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN visitor_session_id TEXT;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN activity_count INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN customer_segment TEXT DEFAULT 'CART_ACTIVE';");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN lifecycle_stage TEXT DEFAULT 'LEAD';");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN lead_grade TEXT DEFAULT 'C';");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN scout_status TEXT DEFAULT 'NOT_SCOUTED';");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN fit_score INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN intent_score INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN reachability_score INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN profiling_consent INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN marketing_consent INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN terms_accepted_at DATETIME;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN privacy_policy_version TEXT DEFAULT 'v1.0';");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN consent_withdrawn_at DATETIME;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN lead_score_breakdown TEXT;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN scout_confidence TEXT DEFAULT 'MEDIUM';");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN key_talking_points TEXT;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN recommended_products TEXT;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN risk_flags TEXT;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN sources_json TEXT;");
    safeExec(db, "ALTER TABLE potential_customers ADD COLUMN scout_triggered_by TEXT;");

    // Migrate existing projects table to add quotation_id, spk_id, and ntp_id columns
    safeExec(db, "ALTER TABLE projects ADD COLUMN quotation_id TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN spk_id TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN ntp_id TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN qty REAL DEFAULT 1;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN uom TEXT DEFAULT 'Unit';");
    safeExec(db, "ALTER TABLE projects ADD COLUMN quotation_item_id TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_status TEXT DEFAULT 'DRAFT';");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_revision_note TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_authorized_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_authorized_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_prepared_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_prepared_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_submitted_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bom_submitted_at DATETIME;");
    
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN station_id TEXT;");
    safeExec(db, "ALTER TABLE production_manpower_assignments ADD COLUMN station_id TEXT;");
    safeExec(db, "ALTER TABLE production_manpower ADD COLUMN default_station_id TEXT;");
    
    // Add indices for new relations
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_bop_station ON bill_of_processes(station_id);");
    safeExec(db, "CREATE INDEX IF NOT EXISTS idx_manpower_assign_station ON production_manpower_assignments(station_id);");

    // BOP Approval & ECO tracking
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_status TEXT DEFAULT 'DRAFT';");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_revision_note TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_authorized_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_authorized_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_prepared_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_prepared_at DATETIME;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_submitted_by TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN bop_submitted_at DATETIME;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN police_number TEXT;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN authorized_at DATETIME;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN authorized_by TEXT;");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN quotation_id TEXT;");

    // Post-creation fallback schema checks to guarantee columns exist
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN spk_id TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN cancelled_at DATETIME;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN archived INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN urgency TEXT DEFAULT 'NORMAL';");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN remarks TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN escalated_to TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN category TEXT DEFAULT 'PROJECT';");

    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN cancelled_at DATETIME;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN archived INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN urgency TEXT DEFAULT 'NORMAL';");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN escalated_to TEXT;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN amount_paid REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN payment_status TEXT DEFAULT 'UNPAID';");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN vendor_invoice_number TEXT;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN vendor_invoice_amount REAL;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN tax_category TEXT DEFAULT 'GOODS';");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN ppn_rate REAL DEFAULT 12;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN pph_rate REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN dpp REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN ppn REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN pph REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE purchase_orders ADD COLUMN grand_total REAL DEFAULT 0;");

    safeExec(db, "ALTER TABLE quotations ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN tax_rate REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE quotations ADD COLUMN discount_rate REAL DEFAULT 0;");

    safeExec(db, "ALTER TABLE quotation_items ADD COLUMN revision_note TEXT;");
    safeExec(db, "ALTER TABLE pr_items ADD COLUMN revision_note TEXT;");

    // Add missing commercial_invoices columns
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN bank_account_id TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN payment_terms TEXT DEFAULT 'Net 30';");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN job_description TEXT;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN amount_paid REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN payment_status TEXT DEFAULT 'UNPAID';");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN ppn REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN pph REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN ppn_rate REAL DEFAULT 12;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN pph_rate REAL DEFAULT 2;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN total_amount REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN gross_amount REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN discount_rate REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN discount_amount REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN dpp REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN rounding_factor REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE commercial_invoices ADD COLUMN grand_total REAL DEFAULT 0;");

    // Workflow Rules Engine Tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_matrices (
        id TEXT PRIMARY KEY,
        document_type TEXT NOT NULL,
        min_amount REAL DEFAULT 0,
        max_amount REAL,
        roles TEXT NOT NULL,
        is_parallel INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workflow_slas (
        id TEXT PRIMARY KEY,
        document_type TEXT NOT NULL,
        step TEXT NOT NULL,
        sla_hours REAL NOT NULL,
        escalate_to TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workflow_audit_logs (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        changes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Index Optimizations for SLA and Workflow
      CREATE INDEX IF NOT EXISTS idx_po_status_date ON purchase_orders(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_pr_status_date ON purchase_requests(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_workflow_matrices_type ON workflow_matrices(document_type);
      CREATE INDEX IF NOT EXISTS idx_workflow_slas_type ON workflow_slas(document_type);

      -- Manufacturing Manpower Management Tables
      CREATE TABLE IF NOT EXISTS production_manpower (
        id TEXT PRIMARY KEY,
        user_username TEXT,
        nik TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role_title TEXT NOT NULL,
        skill_level TEXT DEFAULT 'SENIOR', -- MASTER, SENIOR, JUNIOR, APPRENTICE
        specialization TEXT NOT NULL, -- Machining, Welding & Fabrication, Assembly & Fitting, Quality Control, Finishing & Coating, Electrical & Wiring
        shift TEXT DEFAULT 'SHIFT_1', -- SHIFT_1, SHIFT_2, SHIFT_3, GENERAL
        status TEXT DEFAULT 'AVAILABLE', -- AVAILABLE, ON_DUTY, ON_LEAVE, REST
        phone TEXT,
        email TEXT,
        hourly_rate REAL DEFAULT 45000,
        certifications TEXT, -- JSON array
        active_project_id TEXT,
        active_task_name TEXT,
        total_hours_worked REAL DEFAULT 0,
        completed_tasks_count INTEGER DEFAULT 0,
        efficiency_rating REAL DEFAULT 95.0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS project_stations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        station_code TEXT NOT NULL,
        station_name TEXT NOT NULL,
        station_type TEXT DEFAULT 'SERIAL', -- 'SERIAL' or 'PARALLEL'
        max_manpower INTEGER DEFAULT 3,
        work_center_id TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS production_manpower_assignments (
        id TEXT PRIMARY KEY,
        manpower_id TEXT NOT NULL,
        project_id TEXT,
        task_name TEXT,
        bop_id TEXT,
        station_id TEXT,
        shift TEXT,
        assigned_date TEXT NOT NULL,
        target_end_date TEXT,
        planned_hours REAL DEFAULT 8,
        actual_hours REAL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE', -- ACTIVE, COMPLETED, CANCELLED, SCHEDULED
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (manpower_id) REFERENCES production_manpower(id)
      );

    `);

    // Safe column migrations

    // Production Logger & Machine Resource Scheduling (Section 12)
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN station_sequence INTEGER DEFAULT 1;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN working_hours REAL DEFAULT 8.0;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN status TEXT DEFAULT 'IDLE';");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN current_oee REAL DEFAULT 100.0;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN is_paused INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_stations ADD COLUMN work_center TEXT;");

    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN completed_units INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN total_downtime_minutes REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE work_order_tickets ADD COLUMN running_elapsed_seconds REAL DEFAULT 0;");

    safeExec(db, "ALTER TABLE production_manpower_assignments ADD COLUMN eligible_processes TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE production_manpower_assignments ADD COLUMN current_process_id TEXT;");
    safeExec(db, "ALTER TABLE production_manpower_assignments ADD COLUMN task_progress TEXT DEFAULT 'IDLE';");

    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN related_pr_id TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN requires_procurement INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN station_id TEXT;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN resolved_by TEXT;");

    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN related_ndp_id TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN station_id TEXT;");
    safeExec(db, "ALTER TABLE purchase_requests ADD COLUMN source TEXT DEFAULT 'PROJECT';");

    safeExec(db, `
      CREATE TABLE IF NOT EXISTS production_wot_genealogy (
        id TEXT PRIMARY KEY,
        wot_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        station_id TEXT,
        process_id TEXT,
        operator_id TEXT,
        operator_name TEXT,
        timestamp_in DATETIME DEFAULT CURRENT_TIMESTAMP,
        timestamp_out DATETIME,
        yield_qty REAL DEFAULT 1,
        scrap_qty REAL DEFAULT 0,
        material_batch TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wot_id) REFERENCES work_order_tickets(id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
      CREATE INDEX IF NOT EXISTS idx_genealogy_wot ON production_wot_genealogy(wot_id);
      CREATE INDEX IF NOT EXISTS idx_genealogy_proj ON production_wot_genealogy(project_id);

      CREATE TABLE IF NOT EXISTS wot_history (
        id TEXT PRIMARY KEY,
        wot_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        process_id TEXT NOT NULL,
        station_id TEXT,
        operator_name TEXT,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        qty INTEGER DEFAULT 1,
        scrap_qty INTEGER DEFAULT 0,
        notes TEXT,
        FOREIGN KEY (wot_id) REFERENCES work_order_tickets(id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
      CREATE INDEX IF NOT EXISTS idx_wot_history_wot ON wot_history(wot_id);
      CREATE INDEX IF NOT EXISTS idx_wot_history_proj ON wot_history(project_id);

      CREATE TABLE IF NOT EXISTS project_overtime_schedules (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        manpower_id TEXT NOT NULL,
        station_id TEXT,
        date TEXT NOT NULL,
        overtime_hours REAL NOT NULL DEFAULT 2,
        reason TEXT,
        status TEXT DEFAULT 'APPROVED',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (manpower_id) REFERENCES production_manpower(id)
      );
      CREATE INDEX IF NOT EXISTS idx_overtime_proj ON project_overtime_schedules(project_id);
      CREATE INDEX IF NOT EXISTS idx_overtime_mp ON project_overtime_schedules(manpower_id);
    `);

    safeExec(db, "ALTER TABLE production_manpower ADD COLUMN user_username TEXT;");
    safeExec(db, "ALTER TABLE project_overtime_schedules ADD COLUMN hourly_rate REAL DEFAULT 45000;");
    safeExec(db, "ALTER TABLE project_overtime_schedules ADD COLUMN estimated_cost REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE payroll_requisitions ADD COLUMN total_direct_labor REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE payroll_requisitions ADD COLUMN total_opex REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE finance_payroll ADD COLUMN total_direct_labor REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE finance_payroll ADD COLUMN total_opex REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE production_manpower ADD COLUMN archived_at DATETIME;");
    safeExec(db, "ALTER TABLE production_manpower_assignments ADD COLUMN target_end_date TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN spk_number TEXT;");
    safeExec(db, "ALTER TABLE projects ADD COLUMN completed_at DATETIME;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN resolved_at DATETIME;");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN resumed_at DATETIME;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN node_type TEXT DEFAULT 'PROCESS';");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN completed_by_operator TEXT;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN completed_at_timestamp DATETIME;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN cycle_time_minutes REAL DEFAULT 10.0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN completed_qty INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN qc_criteria TEXT;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN sop_instruction TEXT;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN bom_allocations TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN machine_id TEXT;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN is_machine_shared INTEGER DEFAULT 0;");
        safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN lifecycle_status TEXT DEFAULT 'Planned';");
        safeExec(db, "ALTER TABLE project_stations ADD COLUMN station_sequence INTEGER DEFAULT 0;");
        safeExec(db, "ALTER TABLE project_stations ADD COLUMN cycle_time_minutes REAL DEFAULT 0;");


        safeExec(db, "ALTER TABLE product_node_lifecycle ADD COLUMN dispatch_id TEXT;");
        safeExec(db, "ALTER TABLE product_node_lifecycle ADD COLUMN received_by_production_at DATETIME;");
        safeExec(db, "ALTER TABLE product_node_lifecycle ADD COLUMN received_by_production_user TEXT;");

    safeExec(db, "ALTER TABLE boms ADD COLUMN received_by_production REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN expected_yield_rate REAL DEFAULT 100.0;");
    
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN is_manual_pause INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN pause_type TEXT DEFAULT 'NONE';");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN lot_size INTEGER DEFAULT 50;");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN transfer_mode TEXT DEFAULT 'INTER_STATION';");
    safeExec(db, "ALTER TABLE bill_of_processes ADD COLUMN process_status TEXT DEFAULT 'PLANNED';");
    safeExec(db, "ALTER TABLE notice_to_down_processes ADD COLUMN bop_step_id TEXT;");
    safeExec(db, "ALTER TABLE project_tasks ADD COLUMN is_manual_pause INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_tasks ADD COLUMN pause_type TEXT DEFAULT 'NONE';");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN delivery_type TEXT DEFAULT 'FULL';");
    safeExec(db, "ALTER TABLE delivery_notes ADD COLUMN is_partial INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE production_lots ADD COLUMN notes TEXT;");
    safeExec(db, "ALTER TABLE production_lots ADD COLUMN eco_revision TEXT;");
    safeExec(db, "ALTER TABLE task_travel_tags ADD COLUMN lot_id TEXT;");
    safeExec(db, "ALTER TABLE task_travel_tags ADD COLUMN lot_number TEXT;");

    // Project HPP (Pure Material vs Full Costing) columns
    safeExec(db, "ALTER TABLE project_financial_summaries ADD COLUMN material_cogs REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_financial_summaries ADD COLUMN full_cogs REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_financial_summaries ADD COLUMN gross_profit_material REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_financial_summaries ADD COLUMN gross_margin_material_pct REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_financial_summaries ADD COLUMN gross_profit_full REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE project_financial_summaries ADD COLUMN gross_margin_full_pct REAL DEFAULT 0;");

    // Finance Rollup COGS breakdown (Material vs Full)
    safeExec(db, "ALTER TABLE finance_global_summary ADD COLUMN total_material_cogs REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE finance_global_summary ADD COLUMN total_labor_cogs REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE finance_monthly_summaries ADD COLUMN material_cogs REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE finance_monthly_summaries ADD COLUMN labor_cogs REAL DEFAULT 0;");

    // B2C E-Commerce Shop columns on items
    safeExec(db, "ALTER TABLE items ADD COLUMN is_published_shop INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_image_url TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_gallery_urls TEXT DEFAULT '[]';");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_promo_price REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_weight_kg REAL DEFAULT 2.5;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_badge TEXT;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_featured INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_availability_type TEXT DEFAULT 'AUTO';");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_lead_time_days INTEGER DEFAULT 3;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_moq REAL DEFAULT 1;");
    safeExec(db, "ALTER TABLE items ADD COLUMN shop_specs TEXT;");

    // Alter shop_orders safe column expansions
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN is_dp INTEGER DEFAULT 0;");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN dp_amount REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN delivery_distance REAL DEFAULT 0;");
    safeExec(db, "ALTER TABLE shop_orders ADD COLUMN payment_proof_url TEXT;");

    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_orders (
        id TEXT PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        delivery_address TEXT NOT NULL,
        delivery_city TEXT,
        delivery_method TEXT NOT NULL DEFAULT 'DELIVERY',
        shipping_cost REAL DEFAULT 0,
        subtotal_amount REAL NOT NULL,
        total_amount REAL NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'TRANSFER_MANUAL',
        payment_status TEXT NOT NULL DEFAULT 'UNPAID',
        order_status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
        payment_proof_url TEXT,
        payment_ref TEXT,
        tracking_number TEXT,
        fleet_notes TEXT,
        delivery_note_id TEXT,
        customer_notes TEXT,
        is_dp INTEGER DEFAULT 0,
        dp_amount REAL DEFAULT 0,
        delivery_distance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        paid_at DATETIME,
        dispatched_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS shop_order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_code TEXT NOT NULL,
        item_name TEXT NOT NULL,
        uom TEXT NOT NULL,
        qty REAL NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        weight_kg REAL DEFAULT 0,
        FOREIGN KEY (order_id) REFERENCES shop_orders(id) ON DELETE CASCADE
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS eco_logs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        doc_type TEXT NOT NULL DEFAULT 'BOM',
        eco_number TEXT NOT NULL,
        eco_reason TEXT,
        authorized_by TEXT,
        authorized_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        previous_bom TEXT,
        current_bom TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      
      CREATE TABLE IF NOT EXISTS work_order_tickets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        lot_number TEXT NOT NULL,
        qty INTEGER NOT NULL DEFAULT 1,
        status TEXT DEFAULT 'PLANNED', -- PLANNED, QUEUED, RUNNING, COMPLETED, TRANSFERRED, FINISHED
        current_station_id TEXT,
        current_process_id TEXT,
        target_station_id TEXT,
        target_process_id TEXT,
        source_station_id TEXT,
        consumed_at DATETIME,
        started_at DATETIME,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS production_lots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        spk_id TEXT,
        lot_number TEXT NOT NULL,
        target_qty INTEGER NOT NULL DEFAULT 1,
        status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS lot_routing_executions (
        id TEXT PRIMARY KEY,
        lot_id TEXT NOT NULL,
        bop_id TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        good_qty INTEGER DEFAULT 0,
        reject_qty INTEGER DEFAULT 0,
        start_time DATETIME,
        end_time DATETIME,
        operator_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lot_id) REFERENCES production_lots(id),
        FOREIGN KEY (bop_id) REFERENCES bill_of_processes(id)
      );
      
      CREATE TABLE IF NOT EXISTS unit_process_progress (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        spk_id TEXT,
        unit_code TEXT NOT NULL,
        bop_id TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        start_time DATETIME,
        completed_time DATETIME,
        completed_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (bop_id) REFERENCES bill_of_processes(id)
      );

      CREATE INDEX IF NOT EXISTS idx_unit_prog_proj ON unit_process_progress(project_id);
      CREATE INDEX IF NOT EXISTS idx_unit_prog_bop ON unit_process_progress(bop_id);
      CREATE INDEX IF NOT EXISTS idx_unit_prog_unit ON unit_process_progress(unit_code);
    `);

    db.exec(`
            CREATE TABLE IF NOT EXISTS material_dispatches (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        bop_step_id TEXT,
        product_node_id TEXT,
        bom_id TEXT,
        item_id TEXT NOT NULL,
        dispatch_qty REAL NOT NULL,
        dispatched_by TEXT,
        dispatched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        received_by_production TEXT,
        received_at DATETIME,
        status TEXT DEFAULT 'DISPATCHED'
      );

      CREATE TABLE IF NOT EXISTS project_financial_summaries (
        project_id TEXT PRIMARY KEY,
        total_revenue REAL DEFAULT 0,
        total_bom_cost REAL DEFAULT 0,
        total_labor_cost REAL DEFAULT 0,
        total_overhead_cost REAL DEFAULT 0,
        total_cogs REAL DEFAULT 0,
        gross_profit REAL DEFAULT 0,
        gross_margin_pct REAL DEFAULT 0,
        material_cogs REAL DEFAULT 0,
        full_cogs REAL DEFAULT 0,
        gross_profit_material REAL DEFAULT 0,
        gross_margin_material_pct REAL DEFAULT 0,
        gross_profit_full REAL DEFAULT 0,
        gross_margin_full_pct REAL DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );
      
      CREATE TABLE IF NOT EXISTS finance_monthly_summaries (
        month_year TEXT PRIMARY KEY, -- e.g. "Aug 26"
        revenue REAL DEFAULT 0,
        tax REAL DEFAULT 0,
        cogs REAL DEFAULT 0,
        material_cogs REAL DEFAULT 0,
        labor_cogs REAL DEFAULT 0,
        opex REAL DEFAULT 0,
        profit REAL DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS finance_global_summary (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        total_receivable REAL DEFAULT 0,
        total_payable REAL DEFAULT 0,
        total_billed REAL DEFAULT 0,
        total_revenue_realized REAL DEFAULT 0,
        total_tax_collected REAL DEFAULT 0,
        total_cogs REAL DEFAULT 0,
        total_material_cogs REAL DEFAULT 0,
        total_labor_cogs REAL DEFAULT 0,
        total_opex REAL DEFAULT 0,
        gross_margin REAL DEFAULT 0,
        net_profit REAL DEFAULT 0,
        operating_margin REAL DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS production_logs (
        id TEXT PRIMARY KEY,
        log_type TEXT NOT NULL,
        project_id TEXT,
        wot_id TEXT,
        station_id TEXT,
        process_id TEXT,
        machine_id TEXT,
        user_id TEXT,
        user_role TEXT NOT NULL,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        device_info TEXT,
        gps_location TEXT,
        details TEXT,
        photo_urls TEXT,
        is_verified INTEGER DEFAULT 0,
        verified_by TEXT,
        verified_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS floor_requests (
        id TEXT PRIMARY KEY,
        request_code TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'NORMAL',
        status TEXT NOT NULL DEFAULT 'PENDING',
        requested_by TEXT NOT NULL,
        requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        station_id TEXT,
        project_id TEXT,
        process_id TEXT,
        wot_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        photo_urls TEXT,
        qty_required REAL,
        unit TEXT,
        bom_item_id TEXT,
        item_name TEXT,
        auto_pr INTEGER DEFAULT 0,
        pr_id TEXT,
        tool_item_id TEXT,
        requested_machine_category TEXT,
        reason TEXT,
        fulfilled_by TEXT,
        fulfilled_at DATETIME,
        fulfillment_notes TEXT,
        fulfillment_photo_urls TEXT,
        acknowledged_at DATETIME,
        acknowledged_by TEXT,
        in_progress_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS machine_schedules (
        id TEXT PRIMARY KEY,
        machine_id TEXT NOT NULL,
        project_id TEXT,
        station_id TEXT,
        process_id TEXT,
        wot_id TEXT,
        assigned_at DATETIME NOT NULL,
        released_at DATETIME,
        is_active INTEGER DEFAULT 1,
        bypass_station_lock INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS wot_travel_logs (
        id TEXT PRIMARY KEY,
        wot_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        station_id TEXT,
        process_id TEXT,
        machine_id TEXT,
        user_id TEXT,
        user_name TEXT,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS stations (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        station_code TEXT,
        station_name TEXT,
        name TEXT,
        station_type TEXT DEFAULT 'SERIAL',
        machine_ids TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_manpower_status ON production_manpower(status);
      CREATE INDEX IF NOT EXISTS idx_manpower_shift ON production_manpower(shift);
      CREATE INDEX IF NOT EXISTS idx_manpower_spec ON production_manpower(specialization);
      CREATE INDEX IF NOT EXISTS idx_manpower_user ON production_manpower(user_username);
      CREATE INDEX IF NOT EXISTS idx_manpower_assign_mp ON production_manpower_assignments(manpower_id);
      CREATE INDEX IF NOT EXISTS idx_manpower_assign_proj ON production_manpower_assignments(project_id);
    `);

    // Production manpower table is kept clean for real HRIS & workshop input

    // 3. Seed data
    db.prepare(
      `
        INSERT OR IGNORE INTO projects (id, name, due_date, customer, remarks, status)
        VALUES ('CONSUMABLE', 'Consumable Procurement', '2099-12-31', 'Internal', 'Konsumabel (Listrik dan Air)', 'ACTIVE'),
               ('TRANSPORTATION', 'Transportation Procurement', '2099-12-31', 'Internal', 'Transportasi (BBM, Tol, Tiket)', 'ACTIVE'),
               ('OTHERS', 'Others Procurement', '2099-12-31', 'Internal', 'Others / General', 'ACTIVE')
    `,
    ).run();

    // Default Workflow Seed
    db.prepare(
      `
      INSERT OR IGNORE INTO workflow_matrices (id, document_type, min_amount, max_amount, roles, is_parallel)
      VALUES ('MATRIX-1', 'Purchase Order', 0, 10000000, '["Procurement Manager"]', 0)
    `,
    ).run();

    db.prepare(
      `
      INSERT OR IGNORE INTO workflow_matrices (id, document_type, min_amount, max_amount, roles, is_parallel)
      VALUES ('MATRIX-2', 'Purchase Order', 10000000, 50000000, '["Procurement Manager", "Finance Manager"]', 0)
    `,
    ).run();

    db.prepare(
      `
      INSERT OR IGNORE INTO workflow_matrices (id, document_type, min_amount, max_amount, roles, is_parallel)
      VALUES ('MATRIX-3', 'Purchase Order', 50000000, NULL, '["Procurement Manager", "Finance Manager", "Director"]', 1)
    `,
    ).run();

    db.prepare(
      `
      INSERT OR IGNORE INTO workflow_slas (id, document_type, step, sla_hours, escalate_to)
      VALUES ('SLA-1', 'Purchase Order', 'Pending Approval', 24, 'Director')
    `,
    ).run();

    const stmt = db.prepare(`
        INSERT INTO users (id, username, password, role, level, name, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
          password = excluded.password,
          role = excluded.role,
          level = excluded.level,
          name = excluded.name,
          status = excluded.status
    `);
    stmt.run(
      "MASTER-1",
      "Eghy",
      "eghyalvandi",
      "FC",
      "MANAGER",
      "Eghy Al Vandi",
      "APPROVED",
    );
    stmt.run(
      "MASTER-2",
      "Ludy",
      "bachtiarludy",
      "FC",
      "MANAGER",
      "Bachtiar Ludy",
      "APPROVED",
    );
    stmt.run(
      "admin",
      "admin",
      "admin",
      "FC",
      "MANAGER",
      "System Admin",
      "APPROVED",
    );

    // Setup Forum Group
    const generalThreadId = "THREAD-GENERAL";
    db.prepare(
      `
    INSERT OR IGNORE INTO chat_threads (id, name, is_group, created_by)
    VALUES (?, ?, 1, 'system')
    `,
    ).run(generalThreadId, "Forum");

    // Migration: Update existing name to Forum
    db.prepare(
      "UPDATE chat_threads SET name = 'Forum' WHERE id = 'THREAD-GENERAL'",
    ).run();

    // Auto-assign existing users to general discussion
    db.prepare(
      `
    INSERT OR IGNORE INTO chat_participants (thread_id, username)
    SELECT ?, username FROM users
    `,
    ).run(generalThreadId);

    // Create Indices
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_inventory_labels_item ON inventory_labels(item_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_labels_grn ON inventory_labels(grn_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_labels_project ON inventory_labels(project_id);
      CREATE INDEX IF NOT EXISTS idx_items_code ON items(item_code);
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
      CREATE INDEX IF NOT EXISTS idx_projects_deleted ON projects(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_boms_project ON boms(project_id);
      CREATE INDEX IF NOT EXISTS idx_boms_item ON boms(item_id);
      CREATE INDEX IF NOT EXISTS idx_pr_project ON purchase_requests(project_id);
      CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requests(status);
      CREATE INDEX IF NOT EXISTS idx_pr_items_pr ON pr_items(pr_id);
      CREATE INDEX IF NOT EXISTS idx_po_items_po ON pr_items(po_id);
      CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
      CREATE INDEX IF NOT EXISTS idx_grns_po ON grns(po_id);
      CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON grn_items(grn_id);
      CREATE INDEX IF NOT EXISTS idx_grn_items_item ON grn_items(item_id);
      CREATE INDEX IF NOT EXISTS idx_movements_item ON stock_movements(item_id);
      CREATE INDEX IF NOT EXISTS idx_movements_project ON stock_movements(project_id);
      CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_wo_project ON work_orders(project_id);
      CREATE INDEX IF NOT EXISTS idx_wo_station_status ON work_orders(current_work_center_id, status);
      CREATE INDEX IF NOT EXISTS idx_wo_items_wo ON work_order_items(wo_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_item ON inventory(item_id);
      CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_trail(resource_type, resource_id);
      CREATE INDEX IF NOT EXISTS idx_forum_comments_post ON forum_comments(post_id);
      CREATE INDEX IF NOT EXISTS idx_project_tasks_wc ON project_tasks(work_center_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_chat_participants_username ON chat_participants(username);
      CREATE INDEX IF NOT EXISTS idx_item_price_history ON item_price_history(item_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
      CREATE INDEX IF NOT EXISTS idx_bom_template_items_template ON bom_template_items(template_id);
      CREATE INDEX IF NOT EXISTS idx_bom_template_items_item ON bom_template_items(item_id);
      CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
      CREATE INDEX IF NOT EXISTS idx_journal_entries_ref ON journal_entries(reference_type, reference_id);
      CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_entry_lines(entry_id);
      CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_entry_lines(account_code);
      CREATE INDEX IF NOT EXISTS idx_lot_exec_status_start ON lot_routing_executions(status, start_time);
      CREATE INDEX IF NOT EXISTS idx_lot_exec_lot_bop ON lot_routing_executions(lot_id, bop_id);
      CREATE INDEX IF NOT EXISTS idx_bop_project_status ON bill_of_processes(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_bop_status ON bill_of_processes(status);
      CREATE INDEX IF NOT EXISTS idx_prod_lots_project ON production_lots(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_ndp_project_status ON notice_to_down_processes(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_inv_res_project ON inventory_reservations(project_id);
      CREATE INDEX IF NOT EXISTS idx_inv_res_item ON inventory_reservations(item_id);
      CREATE INDEX IF NOT EXISTS idx_wot_project_station ON work_order_tickets(project_id, current_station_id, status);
      CREATE INDEX IF NOT EXISTS idx_wot_status ON work_order_tickets(status);
      CREATE INDEX IF NOT EXISTS idx_stn_project_seq ON project_stations(project_id, station_sequence);
      CREATE INDEX IF NOT EXISTS idx_prod_manpower_assign ON production_manpower_assignments(project_id, station_id, status);

      -- High Performance Composite Indexes for Elimination of N+1 & Query Latency Optimization
      CREATE INDEX IF NOT EXISTS idx_comm_invoices_dn_status ON commercial_invoices(dn_id, status);
      CREATE INDEX IF NOT EXISTS idx_comm_invoices_created ON commercial_invoices(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_del_items_dn_item ON delivery_items(dn_id, item_id);
      CREATE INDEX IF NOT EXISTS idx_del_notes_quot_proj ON delivery_notes(quotation_id, project_id, status);
      CREATE INDEX IF NOT EXISTS idx_quot_items_quot ON quotation_items(quotation_id, id);
      CREATE INDEX IF NOT EXISTS idx_projects_quot_spk ON projects(quotation_id, spk_id, status);
      CREATE INDEX IF NOT EXISTS idx_pr_items_po_pr ON pr_items(po_id, pr_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_item_created ON stock_movements(item_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_finance_trans_date_cat ON finance_transactions(transaction_date DESC, category);
      CREATE INDEX IF NOT EXISTS idx_jel_account_entry ON journal_entry_lines(account_code, entry_id);
      CREATE INDEX IF NOT EXISTS idx_jel_entry_account ON journal_entry_lines(entry_id, account_code);
      CREATE INDEX IF NOT EXISTS idx_je_date_created ON journal_entries(entry_date, created_at);
      CREATE INDEX IF NOT EXISTS idx_ci_status_due ON commercial_invoices(status, payment_status, created_at);
      CREATE INDEX IF NOT EXISTS idx_items_type_code ON items(type, item_code);
      CREATE INDEX IF NOT EXISTS idx_inventory_item ON inventory(item_id);
      CREATE INDEX IF NOT EXISTS idx_customers_code_name ON customers(code, name);
      CREATE INDEX IF NOT EXISTS idx_suppliers_code_name ON suppliers(code, name);

      -- Transactional Outbox Queue Table for Phase 3 (Outbox Pattern)
      CREATE TABLE IF NOT EXISTS outbox_events (
        id TEXT PRIMARY KEY,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        destination TEXT NOT NULL DEFAULT 'BOTH',
        status TEXT NOT NULL DEFAULT 'PENDING',
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 5,
        last_error TEXT,
        created_at TEXT NOT NULL,
        processed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox_events(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON outbox_events(aggregate_type, aggregate_id);
    `);

    // Seed master baseline data
    seedMasterBaseline(db);
  })();

  // Re-enable foreign keys
  db.pragma("foreign_keys = ON");
}

// Master Baseline Data Seeding - Guaranteed for both Initial Setup and Virgin State Factory Reset
export function seedMasterBaseline(targetDb: any = db) {
  try {
    // 1. Exactly 3 Core Baseline Enterprise Users (Eghy, Ludy, System Admin)
    const userStmt = targetDb.prepare(`
      INSERT OR REPLACE INTO users (id, username, password, role, level, name, status, is_approved)
      VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 1)
    `);
    userStmt.run("MASTER-1", "Eghy", "eghyalvandi", "FC", "MANAGER", "Eghy Al Vandi");
    userStmt.run("MASTER-2", "Ludy", "bachtiarludy", "FC", "MANAGER", "Bachtiar Ludy");
    userStmt.run("USR-ADMIN", "admin", "admin", "FC", "MANAGER", "System Administrator");

    // 2. Default Internal Projects (Mandatory for internal operational procurement overhead)
    const defaultProjects = [
      { id: 'CONSUMABLE', name: 'Internal Consumables & Factory Supplies', customer: 'Internal Operational' },
      { id: 'TRANSPORTATION', name: 'Transportation & Logistics Fleet', customer: 'Internal Logistics' },
      { id: 'OTHERS', name: 'General Operational & Facility Overhead', customer: 'Internal Management' },
      { id: 'GENERAL', name: 'General Procurement & Administrative', customer: 'Internal Procurement' },
    ];
    for (const p of defaultProjects) {
      targetDb.prepare(`
        INSERT OR IGNORE INTO projects (id, name, customer, due_date, status, urgency, factory_factor)
        VALUES (?, ?, ?, '2099-12-31', 'ACTIVE', 'NORMAL', 85)
      `).run(p.id, p.name, p.customer);
    }

    // 3. Default Work Centers
    const defaultWorkCenters = [
      { id: 'WC-CUT', name: 'Cutting & Material Prep', code: 'WC-CUT', manpower: 2, hours: 8, days: 5, capacity: 80 },
      { id: 'WC-FAB', name: 'Fabrication & Welding', code: 'WC-FAB', manpower: 4, hours: 8, days: 5, capacity: 160 },
      { id: 'WC-FIN', name: 'Surface Finishing & Coating', code: 'WC-FIN', manpower: 2, hours: 8, days: 5, capacity: 80 },
      { id: 'WC-ASSY', name: 'Final Assembly & Fitting', code: 'WC-ASSY', manpower: 3, hours: 8, days: 5, capacity: 120 },
      { id: 'WC-QC', name: 'Quality Control & Inspection', code: 'WC-QC', manpower: 1, hours: 8, days: 5, capacity: 40 },
    ];
    for (const wc of defaultWorkCenters) {
      targetDb.prepare(`
        INSERT OR IGNORE INTO work_centers (id, name, code, manpower_count, hours_per_day, days_per_week, capacity_per_week, efficiency_index, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1.0, 'ACTIVE')
      `).run(wc.id, wc.name, wc.code, wc.manpower, wc.hours, wc.days, wc.capacity);
    }

    // 4. Default Stations
    const defaultStations = [
      { id: 'STN-01', name: 'Station 1 - Raw Material Cutting', code: 'STN-01', seq: 1 },
      { id: 'STN-02', name: 'Station 2 - Fit-up & Tacking', code: 'STN-02', seq: 2 },
      { id: 'STN-03', name: 'Station 3 - Main Fabrication & Welding', code: 'STN-03', seq: 3 },
      { id: 'STN-04', name: 'Station 4 - Surface Treatment & Painting', code: 'STN-04', seq: 4 },
      { id: 'STN-05', name: 'Station 5 - Final Assembly', code: 'STN-05', seq: 5 },
      { id: 'STN-06', name: 'Station 6 - QC Inspection & Packaging', code: 'STN-06', seq: 6 },
    ];
    for (const st of defaultStations) {
      targetDb.prepare(`
        INSERT OR IGNORE INTO stations (id, station_name, station_code, station_sequence, machine_ids)
        VALUES (?, ?, ?, ?, '[]')
      `).run(st.id, st.name, st.code, st.seq);

      targetDb.prepare(`
        INSERT OR IGNORE INTO production_stations (id, station_name, station_code, station_sequence, machine_ids)
        VALUES (?, ?, ?, ?, '[]')
      `).run(st.id, st.name, st.code, st.seq);
    }

    // 5. Standard Chart of Accounts (COA) for Enterprise Double-Entry
    const standardAccounts = [
      { code: "1101", name: "Kas & Rekening Bank (Cash & Bank)", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Kas operasional dan saldo bank perusahaan" },
      { code: "1102", name: "Piutang Usaha (Accounts Receivable)", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Tagihan pelanggan atas penjualan kredit" },
      { code: "1103", name: "Persediaan Barang Jadi (Finished Goods)", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Stok produk siap jual" },
      { code: "1104", name: "Persediaan Bahan Baku (Raw Materials)", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Stok material fabrikasi dan produksi" },
      { code: "1105", name: "Pekerjaan Dalam Proses (WIP Inventory)", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Barang setengah jadi dalam lini produksi" },
      { code: "1106", name: "PPN Masukan (Prepaid VAT / Input VAT)", category: "ASSET", type: "CURRENT", normal: "DEBIT", desc: "Pajak masukan atas pembelian material" },
      { code: "2101", name: "Hutang Usaha (Accounts Payable)", category: "LIABILITY", type: "CURRENT", normal: "CREDIT", desc: "Kewajiban pembayaran kepada vendor supplier" },
      { code: "2102", name: "PPN Keluaran (VAT Payable / Output VAT)", category: "LIABILITY", type: "CURRENT", normal: "CREDIT", desc: "Pajak keluaran atas faktur komersial penjualan" },
      { code: "2103", name: "Hutang BPJS Ketenagakerjaan & Kesehatan", category: "LIABILITY", type: "CURRENT", normal: "CREDIT", desc: "Titipan iuran BPJS karyawan" },
      { code: "2104", name: "Hutang PPh 21 / PPh 23 (Withholding Tax)", category: "LIABILITY", type: "CURRENT", normal: "CREDIT", desc: "Potongan pajak penghasilan yang belum disetor" },
      { code: "3101", name: "Modal Disetor (Paid-in Capital)", category: "EQUITY", type: "EQUITY", normal: "CREDIT", desc: "Ekuitas modal pemilik" },
      { code: "3102", name: "Laba Ditahan (Retained Earnings)", category: "EQUITY", type: "EQUITY", normal: "CREDIT", desc: "Akumulasi saldo laba bersih periode lampau" },
      { code: "4101", name: "Pendapatan Usaha (Sales Revenue)", category: "REVENUE", type: "OPERATING", normal: "CREDIT", desc: "Omset penjualan produk dan jasa fabrikasi" },
      { code: "5101", name: "Beban Pokok Penjualan Material (COGS Material)", category: "EXPENSE", type: "DIRECT_COST", normal: "DEBIT", desc: "HPP pemakaian bahan baku langsung" },
      { code: "5102", name: "Beban Tenaga Kerja Langsung (Direct Labor)", category: "EXPENSE", type: "DIRECT_COST", normal: "DEBIT", desc: "Upah operator produksi pabrik" },
      { code: "6101", name: "Beban Gaji & Upah Kantor (Opex Salaries)", category: "EXPENSE", type: "OPERATING", normal: "DEBIT", desc: "Beban gaji staf manajemen dan administrasi" },
      { code: "6102", name: "Beban Operasional & Umum (General & Admin)", category: "EXPENSE", type: "OPERATING", normal: "DEBIT", desc: "Listrik, air, sewa, internet, dan operasional kantor" },
      { code: "6103", name: "Beban Logistik & Pengiriman (Freight Out)", category: "EXPENSE", type: "OPERATING", normal: "DEBIT", desc: "Beban armada, BBM, dan distribusi" },
    ];

    const insertCoa = targetDb.prepare(`
      INSERT OR IGNORE INTO chart_of_accounts (id, code, name, category, type, normal_balance, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const a of standardAccounts) {
      insertCoa.run(`COA-${a.code}`, a.code, a.name, a.category, a.type, a.normal, a.desc);
    }

    // 6. Default Accounting Period
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0");
    const currentPeriodKey = `${currentYear}-${currentMonth}`;
    const periodExists = targetDb.prepare("SELECT id FROM accounting_periods WHERE period_key = ?").get(currentPeriodKey);
    if (!periodExists) {
      const lastDay = new Date(currentYear, new Date().getMonth() + 1, 0).getDate();
      targetDb.prepare(`
        INSERT OR IGNORE INTO accounting_periods (id, period_key, period_name, start_date, end_date, status, notes)
        VALUES (?, ?, ?, ?, ?, 'OPEN', 'Default active financial period')
      `).run(
        `PER-${currentPeriodKey}`,
        currentPeriodKey,
        `Periode ${currentMonth}/${currentYear}`,
        `${currentYear}-${currentMonth}-01`,
        `${currentYear}-${currentMonth}-${lastDay}`
      );
    }

    // 7. System Settings
    targetDb.prepare(`
      INSERT OR IGNORE INTO system_settings (key, value)
      VALUES ('heijunka_threshold', '0.85'), ('default_tax_rate', '11'), ('default_tax_scheme', 'DPP_NILAI_LAIN'), ('currency', 'IDR')
    `).run();

  } catch (e) {
    console.error("[MASTER BASELINE SEED ERROR]", e);
  }
}

// Factory Reset Helper - Complete Virgin State
export function resetFactoryData() {
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      // Helper for reset execution
      const safeResetRun = (sql: string) => {
        try {
          db.prepare(sql).run();
        } catch (e: any) {}
      };

      // 1. Clear Shop & E-Commerce Data
      safeResetRun("DELETE FROM shop_orders");
      safeResetRun("DELETE FROM shop_order_items");
      safeResetRun("DELETE FROM potential_customers");
      safeResetRun("DELETE FROM visitor_activities");
      safeResetRun("DELETE FROM customer_consents");
      safeResetRun("DELETE FROM erasure_requests");
      safeResetRun("DELETE FROM scout_jobs");

      // 2. Clear CRM, Sales, Deliveries & Billing Data
      safeResetRun("DELETE FROM crm_leads");
      safeResetRun("DELETE FROM ntps");
      safeResetRun("DELETE FROM spks");
      safeResetRun("DELETE FROM quotation_items");
      safeResetRun("DELETE FROM quotations");
      safeResetRun("DELETE FROM commercial_invoices");
      safeResetRun("DELETE FROM finance_transactions");
      safeResetRun("DELETE FROM dn_signatures");
      safeResetRun("DELETE FROM delivery_items");
      safeResetRun("DELETE FROM delivery_notes");
      safeResetRun("DELETE FROM customers");
      safeResetRun("DELETE FROM outreach_activities");

      // 3. Clear Procurement, Production, Genealogy & Movements
      safeResetRun("DELETE FROM journal_entries");
      safeResetRun("DELETE FROM journal_entry_lines");
      safeResetRun("DELETE FROM work_center_routings");
      safeResetRun("DELETE FROM bop_versions");
      safeResetRun("DELETE FROM bill_of_processes");
      safeResetRun("DELETE FROM product_node_lifecycle");
      safeResetRun("DELETE FROM notice_to_down_processes");
      safeResetRun("DELETE FROM ndps");
      safeResetRun("DELETE FROM task_travel_tags");
      safeResetRun("DELETE FROM finish_good_records");
      safeResetRun("DELETE FROM wip_movements");
      safeResetRun("DELETE FROM inventory_reservations");
      safeResetRun("DELETE FROM delivery_receipts");
      safeResetRun("DELETE FROM delivery_receipt_items");
      safeResetRun("DELETE FROM workflow_audit_logs");
      safeResetRun("DELETE FROM production_manpower");
      safeResetRun("DELETE FROM project_stations");
      safeResetRun("DELETE FROM production_manpower_assignments");
      safeResetRun("DELETE FROM eco_logs");
      safeResetRun("DELETE FROM production_lots");
      safeResetRun("DELETE FROM lot_routing_executions");
      safeResetRun("DELETE FROM unit_process_progress");
      safeResetRun("DELETE FROM project_financial_summaries");
      safeResetRun("DELETE FROM finance_monthly_summaries");
      safeResetRun("DELETE FROM finance_global_summary");
      safeResetRun("DELETE FROM stock_movements");
      safeResetRun("DELETE FROM grn_items");
      safeResetRun("DELETE FROM grns");
      safeResetRun("DELETE FROM pr_items");
      safeResetRun("DELETE FROM purchase_orders");
      safeResetRun("DELETE FROM purchase_requests");
      safeResetRun("DELETE FROM suppliers");
      safeResetRun("DELETE FROM work_order_tickets");
      safeResetRun("DELETE FROM work_order_items");
      safeResetRun("DELETE FROM work_orders");
      safeResetRun("DELETE FROM bom_item_consumption");
      safeResetRun("DELETE FROM boms");
      safeResetRun("DELETE FROM production_wot_genealogy");
      safeResetRun("DELETE FROM wot_history");
      safeResetRun("DELETE FROM wot_travel_logs");
      safeResetRun("DELETE FROM floor_requests");
      safeResetRun("DELETE FROM machine_schedules");
      safeResetRun("DELETE FROM material_requests");
      safeResetRun("DELETE FROM material_dispatches");
      safeResetRun("DELETE FROM project_manpower");

      // 4. Clear Projects & Tasks
      safeResetRun("DELETE FROM project_tasks");
      safeResetRun("DELETE FROM project_overtime_schedules");
      safeResetRun("DELETE FROM projects WHERE id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')");

      // 5. Clear Inventory Items, Supplier Pricing & BOM Templates
      safeResetRun("DELETE FROM item_supplier_prices");
      safeResetRun("DELETE FROM item_price_history");
      safeResetRun("DELETE FROM inventory_labels");
      safeResetRun("DELETE FROM bom_template_items");
      safeResetRun("DELETE FROM bom_templates");
      safeResetRun("DELETE FROM inventory");
      safeResetRun("DELETE FROM items");

      // 6. Clear HRIS & Personnel Data (Retain exactly 3 Core Baseline Users: Eghy, Ludy, and admin)
      safeResetRun("DELETE FROM users WHERE username NOT IN ('Eghy', 'Ludy', 'admin')");
      safeResetRun("DELETE FROM hr_jobs");
      safeResetRun("DELETE FROM hr_applications");
      safeResetRun("DELETE FROM hr_kpis");
      safeResetRun("DELETE FROM finance_payroll");
      safeResetRun("DELETE FROM payroll_requisitions");
      safeResetRun("DELETE FROM hr_handovers");
      safeResetRun("DELETE FROM hr_leaves");
      safeResetRun("DELETE FROM hr_payslips");
      safeResetRun("DELETE FROM hr_salaries");

      // 7. Clear Social/Chat/Forum/Audit
      safeResetRun("DELETE FROM chat_messages");
      safeResetRun("DELETE FROM chat_participants WHERE thread_id != 'THREAD-GENERAL'");
      safeResetRun("DELETE FROM chat_threads WHERE id != 'THREAD-GENERAL'");
      safeResetRun("DELETE FROM forum_comments");
      safeResetRun("DELETE FROM forum_posts");
      safeResetRun("DELETE FROM user_drafts");
      safeResetRun("DELETE FROM audit_trail");
      safeResetRun("DELETE FROM ai_feedback");

      // 8. Re-seed & Guarantee Master Baseline Operational Data (Exactly 3 users, COA, settings)
      seedMasterBaseline(db);

      console.log("[Database] Virgin state factory reset executed successfully with baseline master intact.");
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

export function resetHrData() {
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      const safeResetRun = (sql: string) => {
        try {
          db.prepare(sql).run();
        } catch (e: any) {}
      };

      // Clear HRIS and Human Resource Data
      safeResetRun("DELETE FROM attendance_db.hr_attendances");
      safeResetRun("DELETE FROM hr_jobs");
      safeResetRun("DELETE FROM hr_applications");
      safeResetRun("DELETE FROM hr_kpis");
      safeResetRun("DELETE FROM finance_payroll");
      safeResetRun("DELETE FROM payroll_requisitions");
      safeResetRun("DELETE FROM finance_transactions WHERE category = 'PAYROLL'");
      safeResetRun("DELETE FROM audit_trail WHERE action LIKE '%HR%' OR action LIKE '%PAYROLL%'");
      safeResetRun("DELETE FROM hr_handovers");
      safeResetRun("DELETE FROM hr_leaves");
      safeResetRun("DELETE FROM hr_payslips");
      safeResetRun("DELETE FROM hr_salaries");
      // Composite Indexes for Phase 2 (N+1 Elimination & Query Optimization)
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_jel_entry_account ON journal_entry_lines(entry_id, account_code);");
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_je_date_created ON journal_entries(entry_date, created_at);");
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_ci_status_due ON commercial_invoices(status, payment_status, created_at);");
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pr_project_created ON purchase_requests(project_id, created_at);");
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_pri_pr_po ON pr_items(pr_id, po_id);");
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_poi_po_id ON po_items(po_id);");
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_grn_po_id ON grns(po_id);");
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_boms_project ON boms(project_id);");
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_spk_project ON spks(project_id);");
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_dn_project ON delivery_notes(project_id);");
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_ci_project ON commercial_invoices(project_id);");
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_items_type_code ON items(type, item_code);");
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_inventory_item ON inventory(item_id);");

      // Transactional Outbox Queue Table for Phase 3 (Outbox Pattern)
      safeExec(db, `
        CREATE TABLE IF NOT EXISTS outbox_events (
          id TEXT PRIMARY KEY,
          aggregate_type TEXT NOT NULL,
          aggregate_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          destination TEXT NOT NULL DEFAULT 'BOTH',
          status TEXT NOT NULL DEFAULT 'PENDING',
          retry_count INTEGER DEFAULT 0,
          max_retries INTEGER DEFAULT 5,
          last_error TEXT,
          created_at TEXT NOT NULL,
          processed_at TEXT
        );
      `);
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox_events(status, created_at);");
      safeExec(db, "CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON outbox_events(aggregate_type, aggregate_id);");
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

// Auto-initialize schema & tables on module load
try {
  initDb();
  console.log("[Database] Database initialized and schema verified.");
} catch (e) {
  console.error("[Database] Auto-initialize database error:", e);
}

try {
  db.prepare("ALTER TABLE projects ADD COLUMN factory_factor REAL DEFAULT 85").run();
} catch (e) {
  // column might already exist
}

export { db };
export default db;

