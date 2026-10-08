# FHTBS ERP — Paving Joss

Sistem ERP, MES & HRIS terintegrasi untuk Paving Joss: produksi, gudang, procurement,
sales, finance, HRIS, B2C shop, dan portal publik dalam satu aplikasi full-stack.

## Stack

- **Frontend**: React 19, Vite 6, Tailwind CSS 4, React Router 7, Zustand, Motion, Recharts
- **Backend**: Express 4 (dijalankan via tsx), Socket.io, JWT auth, PBAC role guard
- **Database**: SQLite (better-sqlite3) sebagai engine utama, Firestore & PostgreSQL opsional
- **PWA**: vite-plugin-pwa (offline-capable)

## Menjalankan

```bash
npm install
cp .env.example .env

# Development — API + Vite dev server pada http://localhost:3000
npm run dev

# Production
npm run build
NODE_ENV=production JWT_SECRET=<secret-anda> npm start
```

## Konfigurasi

Seluruh konfigurasi via environment variable — lihat `.env.example`.
Tanpa kredensial Firebase, sistem otomatis berjalan penuh dalam mode lokal (SQLite).

## Kualitas

```bash
npm run lint   # type-check penuh (tsc --noEmit) — harus 0 error
npm run build  # production build
```

Lihat `AUDIT_REPORT.md` untuk hasil audit komprehensif, model pengambilan
keputusan perbaikan (Divergen–Konvergen), dan daftar perubahan.
