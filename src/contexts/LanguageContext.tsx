import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";

type Language = "id" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, overrideLang?: Language) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

const dictionary: Record<string, Record<Language, string>> = {
  // Navigation & Layout
  Dashboard: { en: "Dashboard", id: "Dasbor" },
  Messages: { en: "Messages", id: "Pesan" },
  "Core Data": { en: "Core Data", id: "Data Inti" },
  "Master Data Hub": { en: "Master Data Hub", id: "Pusat Data Utama" },
  "Supplier Profiles": { en: "Supplier Profiles", id: "Profil Pemasok" },
  "Customer Profiles": { en: "Customer Profiles", id: "Profil Pelanggan" },
  Engineering: { en: "Engineering", id: "Teknik" },
  "Design Requests": { en: "Design Requests", id: "Permintaan Desain" },
  "Bill of Materials": { en: "Bill of Materials", id: "Daftar Material" },
  "Bill of Process (BoP)": { en: "Bill of Process (BoP)", id: "Alur Proses (BoP)" },
  Purchasing: { en: "Purchasing", id: "Pembelian" },
  "Sourcing & Pricing": { en: "Sourcing & Pricing", id: "Pengadaan & Harga" },
  "Purchase Orders": { en: "Purchase Orders", id: "Pesanan Pembelian" },
  Manufacturing: { en: "Manufacturing", id: "Manufaktur" },
  "Production Hub": { en: "Production Hub", id: "Pusat Produksi" },
  "Man Power": { en: "Man Power", id: "Tenaga Kerja" },
  Warehouse: { en: "Warehouse", id: "Gudang" },
  "Warehouse Inventory": { en: "Warehouse Inventory", id: "Inventaris Gudang" },
  Outbound: { en: "Outbound", id: "Barang Keluar" },
  "Delivery Manifests": { en: "Delivery Manifests", id: "Manifes Pengiriman" },
  "Account Receivables (Piutang)": {
    en: "Account Receivables (Piutang)",
    id: "Piutang Usaha",
  },
  "Account Receivables": { en: "Account Receivables", id: "Piutang Usaha" },
  "Account Payables (Hutang)": {
    en: "Account Payables (Hutang)",
    id: "Hutang Usaha",
  },
  Payroll: { en: "Payroll Disbursements", id: "Penggajian" },
  "General Ledger": { en: "General Ledger", id: "Buku Besar" },
  "General Ledger Overview & Reports": {
    en: "General Ledger Overview & Reports",
    id: "Ikhtisar & Laporan Buku Besar",
  },
  System: { en: "System", id: "Sistem" },
  "Access Control": { en: "Access Control", id: "Kontrol Akses" },
  "System Logs": { en: "System Logs", id: "Log Sistem" },
  "Activity & Notifications": {
    en: "Activity & Notifications",
    id: "Aktivitas & Notifikasi",
  },
  "Mark all Read": { en: "Mark all Read", id: "Tandai Dibaca" },
  "Clear All": { en: "Clear All", id: "Hapus Semua" },
  "No activity history": {
    en: "No activity history",
    id: "Tidak ada riwayat aktivitas",
  },
  "Sign Out": { en: "Sign Out", id: "Keluar" },
  "Session Exit": { en: "Session Exit", id: "Akhiri Sesi" },
  "Systems Operational": { en: "Systems Operational", id: "Sistem Berjalan" },

  // Invoice
  "Transform completed logistics into financial billing": {
    en: "Transform completed logistics into financial billing",
    id: "Ubah logistik selesai menjadi tagihan finansial",
  },
  "Unbilled Deliveries": {
    en: "Unbilled Deliveries",
    id: "Pengiriman Belum Ditagih",
  },
  "Ready for commercial invoicing": {
    en: "Ready for commercial invoicing",
    id: "Siap untuk penagihan komersial",
  },
  PENDING: { en: "PENDING", id: "TUNDA" },
  "All deliveries are billed": {
    en: "All deliveries are billed",
    id: "Semua pengiriman telah ditagih",
  },
  DELIVERED: { en: "DELIVERED", id: "TERKIRIM" },
  "Issued billing records": {
    en: "Issued billing records",
    id: "Catatan tagihan diterbitkan",
  },
  "Register Account Bank": {
    en: "Register Account Bank",
    id: "Daftar Rekening Bank",
  },
  "No invoices issued yet": {
    en: "No invoices issued yet",
    id: "Belum ada faktur yang diterbitkan",
  },
  "Invoice Ref": { en: "Invoice Ref", id: "Ref Faktur" },
  "Amount (IDR)": { en: "Amount (IDR)", id: "Jumlah (IDR)" },
  Action: { en: "Action", id: "Aksi" },
  "Preview Document": { en: "Preview Document", id: "Pratinjau Dokumen" },
  Cancel: { en: "Cancel", id: "Batal" },
  "Generating...": { en: "Generating...", id: "Membuat..." },
  Close: { en: "Close", id: "Tutup" },
  "Export PDF (A4)": { en: "Export PDF (A4)", id: "Ekspor PDF (A4)" },
  "Exporting...": { en: "Exporting...", id: "Mengekspor..." },

  // Invoices Modals
  "Konfirmasi Pembuatan Invoice": {
    en: "Invoice Generation Confirmation",
    id: "Konfirmasi Pembuatan Invoice",
  },
  "Silakan lengkapi parameter perpajakan, syarat pembayaran, serta rekening bank tujuan transfer.":
    {
      en: "Please complete tax parameters, payment terms, and destination bank account.",
      id: "Silakan lengkapi parameter perpajakan, syarat pembayaran, serta rekening bank tujuan transfer.",
    },
  "Base Delivery Note": { en: "Base Delivery Note", id: "Surat Jalan Dasar" },
  "Nilai Tagihan Pokok (Rp)": {
    en: "Base Invoice Amount (Rp)",
    id: "Nilai Tagihan Pokok (Rp)",
  },
  "Syarat Pembayaran (Payment Terms)": {
    en: "Payment Terms",
    id: "Syarat Pembayaran (Payment Terms)",
  },
  "Tarif PPN (%)": { en: "VAT / PPN Rate (%)", id: "Tarif PPN (%)" },
  "Tarif PPh (%)": { en: "Income Tax / PPh Rate (%)", id: "Tarif PPh (%)" },
  "Tujuan Rekening Bank": {
    en: "Destination Bank Account",
    id: "Tujuan Rekening Bank",
  },
  "Simulasi Perhitungan Faktur Pajak/Invoice": {
    en: "Invoice / Tax Calculation Simulation",
    id: "Simulasi Perhitungan Faktur Pajak/Invoice",
  },
  "Subtotal DPP (Dasar Pengenaan Pajak):": {
    en: "Tax Base Subtotal (DPP):",
    id: "Subtotal DPP (Dasar Pengenaan Pajak):",
  },
  "Nilai Akhir Tagihan (Grand Total):": {
    en: "Grand Total Amount:",
    id: "Nilai Akhir Tagihan (Grand Total):",
  },
  "Buat Invoice Resmi": {
    en: "Generate Official Invoice",
    id: "Buat Invoice Resmi",
  },
  "Daftarkan rekening bank tujuan sebagai media transfer pembayaran invoice resmi Anda.":
    {
      en: "Register a destination bank account for your official invoice payments.",
      id: "Daftarkan rekening bank tujuan sebagai media transfer pembayaran invoice resmi Anda.",
    },
  "Nama Bank (Bank Name)": { en: "Bank Name", id: "Nama Bank (Bank Name)" },
  "Nomor Rekening (Account Number)": {
    en: "Account Number",
    id: "Nomor Rekening (Account Number)",
  },
  "Nama Pemilik Rekening (Account Holder)": {
    en: "Account Holder",
    id: "Nama Pemilik Rekening (Account Holder)",
  },
  "Kantor Cabang (Branch - Optional)": {
    en: "Branch Office (Optional)",
    id: "Kantor Cabang (Branch - Optional)",
  },
  "Mendaftarkan...": { en: "Registering...", id: "Mendaftarkan..." },
  "Daftarkan Account": { en: "Register Account", id: "Daftarkan Account" },

  // Invoice Export PDF Strings
  "COMMERCIAL INVOICE": { en: "COMMERCIAL INVOICE", id: "FAKTUR KOMERSIAL" },
  "Official Document": { en: "Official Document", id: "Dokumen Resmi" },
  "Date:": { en: "Date:", id: "Tanggal:" },
  "Ditujukan Kepada (Customer)": {
    en: "Billed To (Customer)",
    id: "Ditujukan Kepada (Customer)",
  },
  "Referensi Administrasi": {
    en: "Administrative Reference",
    id: "Referensi Administrasi",
  },
  "NPWP Pelanggan:": { en: "Customer Tax ID (NPWP):", id: "NPWP Pelanggan:" },
  "Surat Jalan Ref:": { en: "Delivery Note Ref:", id: "Surat Jalan Ref:" },
  "Syarat Pembayaran:": { en: "Payment Terms:", id: "Syarat Pembayaran:" },
  "Sistem Otoritas:": { en: "Authority System:", id: "Sistem Otoritas:" },

  No: { en: "No", id: "No" },
  "Deskripsi Transaksi Pekerjaan": {
    en: "Job Transaction Description",
    id: "Deskripsi Transaksi Pekerjaan",
  },
  "Outbound Shipment Logistics Reclaim (No. Surat Jalan:": {
    en: "Outbound Shipment Logistics Reclaim (DN No.:",
    id: "Klaim Logistik Pengiriman Keluar (No. Surat Jalan:",
  },
  "Proyek:": { en: "Project:", id: "Proyek:" },
  "Subtotal DPP:": { en: "Tax Base Subtotal:", id: "Subtotal DPP:" },
  "Total Tagihan Bersih:": {
    en: "Net Total Billing:",
    id: "Total Tagihan Bersih:",
  },
  "Instruksi Pembayaran (Bank Transfer)": {
    en: "Payment Instructions (Bank Transfer)",
    id: "Instruksi Pembayaran (Bank Transfer)",
  },
  "Silakan lakukan pembayaran transfer bank penuh ke rekening berikut:": {
    en: "Please make a full bank transfer payment to the following account:",
    id: "Silakan lakukan pembayaran transfer bank penuh ke rekening berikut:",
  },
  "Nama Bank:": { en: "Bank Name:", id: "Nama Bank:" },
  "Cabang:": { en: "Branch:", id: "Cabang:" },
  "Nomor Rekening:": { en: "Account Number:", id: "Nomor Rekening:" },
  "Atas Nama:": { en: "Account Name:", id: "Atas Nama:" },
  "Service Provider Info:": {
    en: "Service Provider Info:",
    id: "Informasi Penyedia Jasa:",
  },
  "Nama Penyedia:": { en: "Provider Name:", id: "Nama Penyedia:" },
  "Alamat:": { en: "Address:", id: "Alamat:" },
  "Dibuat Oleh": { en: "Created By", id: "Dibuat Oleh" },
  "Disetujui Oleh (Sistem Keuangan)": {
    en: "Approved By (Financial System)",
    id: "Disetujui Oleh (Sistem Keuangan)",
  },
  "DEPARTEMEN KEUANGAN": {
    en: "FINANCE DEPARTMENT",
    id: "DEPARTEMEN KEUANGAN",
  },
  "MANAJEMEN KAS KORPORAT": {
    en: "CORPORATE CASH MANAGEMENT",
    id: "MANAJEMEN KAS KORPORAT",
  },
  Batal: { en: "Cancel", id: "Batal" },
  Hapus: { en: "Delete", id: "Hapus" },
  "Bank account deleted": {
    en: "Bank account deleted successfully",
    id: "Akun bank berhasil dihapus",
  },

  // FINISHED GOOD RECORD strings
  "Finished Goods Certificate / Record": {
    en: "Finished Goods Certificate / Record",
    id: "Sertifikat / Dokumen Barang Jadi",
  },
  "FINISH GOOD RECORD": {
    en: "FINISHED GOOD RECORD",
    id: "DOKUMEN BARANG JADI (FGR)",
  },
  "Record ID": { en: "Record ID", id: "Nomor Dokumen" },
  Date: { en: "Date", id: "Tanggal" },

  // Warehouse/FGR Strings
  "Warehouse Hub": { en: "Warehouse Hub", id: "Pusat Gudang" },
  "Manage inventory, goods receipt, and storage": {
    en: "Manage inventory, goods receipt, and storage",
    id: "Kelola inventaris, penerimaan barang, dan penyimpanan",
  },
  "Intake Flow": { en: "Intake Flow", id: "Alur Masuk" },
  "Current Stock": { en: "Current Stock", id: "Stok Saat Ini" },
  "Pending GRN Intakes": {
    en: "Pending GRN Intakes",
    id: "Menunggu Penerimaan GRN",
  },
  "No pending intakes items": {
    en: "No pending intakes items",
    id: "Tidak ada barang menunggu penerimaan",
  },
  "Item Name": { en: "Item Name", id: "Nama Barang" },
  "Origin Doc": { en: "Origin Doc", id: "Dok. Asal" },
  Qty: { en: "Qty", id: "Jml" },
  "Inventory Assets": { en: "Inventory Assets", id: "Aset Inventaris" },
  "All locations": { en: "All locations", id: "Semua lokasi" },
  "No inventory items found": {
    en: "No inventory items found",
    id: "Tidak ada barang inventaris",
  },
  Storage: { en: "Storage", id: "Penyimpanan" },
  "Cost/Unit": { en: "Cost/Unit", id: "Biaya/Unit" },
  "Last Update": { en: "Last Update", id: "Update Terakhir" },
  "Internal Inventory": { en: "Internal Inventory", id: "Internal Inventory" },
  "GRN Ref": { en: "GRN Ref", id: "Ref GRN" },
  "PO Ref": { en: "PO Ref", id: "Ref PO" },
  "Inspected By": { en: "Inspected By", id: "Diperiksa Oleh" },
  "QC Passed": { en: "QC Passed", id: "Lulus QC" },
  "ITEM IDENTIFICATION": {
    en: "ITEM IDENTIFICATION",
    id: "IDENTIFIKASI BARANG",
  },
  "Product Code": { en: "Product Code", id: "Kode Produk" },
  Spesification: { en: "Specification", id: "Spesifikasi" },
  "Intake Quantity": { en: "Intake Quantity", id: "Jumlah Masuk" },
  "Storage Info": { en: "Storage Info", id: "Info Penyimpanan" },
  Location: { en: "Location", id: "Lokasi" },
  Remarks: { en: "Remarks", id: "Catatan" },
  "WAREHOUSE ADMIN": { en: "WAREHOUSE ADMIN", id: "ADMIN GUDANG" },
  "Print Label (A4)": { en: "Print Label (A4)", id: "Cetak Label (A4)" },
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const stored = localStorage.getItem("app-language");
      return stored === "id" || stored === "en" ? stored : "en";
    } catch (_) {
      return "en";
    }
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("app-language", lang);
    } catch (_) {}
  }, []);

  const t = useCallback((key: string, overrideLang?: Language) => {
    const targetLang = overrideLang || language;
    if (dictionary[key]) {
      return dictionary[key][targetLang] || key;
    }
    return key;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
