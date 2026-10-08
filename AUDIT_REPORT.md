# Laporan Audit & Perbaikan — FHTBS ERP (Paving Joss)

Dokumen ini merangkum audit end-to-end, temuan gap, analisis Model Divergen–Konvergen,
dan seluruh perbaikan yang telah diimplementasikan pada bundle ini.

---

## 1. Penghilangan Embed Google AI Studio

| Artefak AI Studio | Status |
|---|---|
| `metadata.json` (manifest applet AI Studio, `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`) | **Dihapus** |
| `gemini-extension.json` (konfigurasi Gemini CLI extension) | **Dihapus** |
| `firebase-applet-config.json` (kredensial Firebase hardcoded hasil provisioning AI Studio, termasuk API key) | **Dihapus** → diganti konfigurasi env (`FIREBASE_*` / `VITE_FIREBASE_*`) |
| `firebase-blueprint.json` (artefak blueprint AI Studio) | **Dihapus** |
| Dependensi `@google/genai` | **Dihapus dari package.json** |
| `src/lib/scoutIntelligence.ts` — klien `GoogleGenAI`, prompt Gemini, User-Agent `aistudio-build` | **Dihapus** → engine heuristik deterministik |
| `src/routes/sales.ts` — import `GoogleGenAI` tidak terpakai | **Dihapus** |
| `CloudMigrationHub.tsx` — label instance hardcoded `ai-studio-fhtbserpsystem` + status "Online" palsu | **Diganti** → status dinamis berdasarkan konfigurasi aktual |
| `.env.example` — komentar "AI Studio automatically injects..." | **Ditulis ulang** lengkap dengan dokumentasi env |

### Konsekuensi & Desain Pengganti
Fitur **Scout Intelligence** (lead scoring calon pelanggan) sebelumnya memanggil Gemini
dengan Google Search Grounding, dan sudah memiliki fallback heuristik internal.
Setelah embed dilepas, pipeline sepenuhnya memakai **engine heuristik first-party
deterministik** (`generateHeuristicScout`):

- Skoring komposit tetap sama (Behavioral Intent 35%, Engagement 20%, Profile Fit 30%, Freshness 15%).
- 100% lokal: auditable, tanpa API key, tanpa biaya token, tanpa kegagalan jaringan.
- Patuh UU PDP secara bawaan: tidak ada data prospek yang keluar dari server.

Firebase tetap didukung sebagai **opsi** (cloud sync Firestore, login Google di B2C Shop),
tetapi tanpa kredensial apa pun di repository. Jika env tidak diisi, sistem otomatis
degradasi ke mode `SQLITE_FALLBACK` (lokal) tanpa crash — semua titik konsumsi
(`AuthContext`, `CustomerAuthModal`, `firebaseSync`, `firestoreAdapter`, `CloudMigrationHub`)
kini di-guard oleh `isFirebaseConfigured`.

---

## 2. Audit End-to-End: Logika, API Endpoint & Flow

### Metode
- Ekstraksi seluruh pemanggilan API frontend (`fetch` / `apiFetch`) dan seluruh
  definisi route backend (Express) — **436 endpoint** di **22 router** — lalu cross-check
  method + path.
- Analisis graf impor transitif dari entry point (`src/main.tsx` + `server.ts`)
  untuk mendeteksi dead code.
- `tsc --noEmit` sebagai gerbang type-safety.

### Temuan
| # | Temuan | Severity | Status |
|---|---|---|---|
| L1 | 9 error TypeScript di `mascotStore.ts` — `apiFetch` mengetik `body` sebagai `BodyInit` sehingga body objek ditolak compiler | **High** (lint CI gagal) | ✅ Fixed — `ApiFetchOptions` menerima objek/array, auto-`JSON.stringify` |
| L2 | 19 file dead code tidak terjangkau dari entry point (3 service client yatim: `productionService`, `purchasingService`, `salesService`; barrel `services/index.ts`, `stores/index.ts`, `utils/index.ts`, `hooks/index.ts`; sisa Drizzle `db/schema.ts`+`db/index.ts`; `calendarEngine`, `financeRollup`, `idempotency`, `annualEventsCalendar`, `masterDataRepository`, `usePointerTilt`, `HrisEventTab`, `CustomizationPanel`, test yatim) | Medium | ✅ Dihapus |
| L3 | Service client yatim memanggil endpoint yang tidak ada (`/api/purchasing/orders`, `/api/production/execute-step`, dll.) — false-positive integrasi | Medium | ✅ Terselesaikan dengan penghapusan L2; seluruh 31 pemanggilan API frontend kini termap 1:1 ke backend |
| L4 | `PORT` hardcoded `3000` | Low | ✅ `process.env.PORT` |
| L5 | `helmet` & `express-rate-limit` terinstal tapi tidak dipasang | **High** | ✅ Dipasang (header keamanan + rate limit global 600 req/menit, auth 60 req/15 menit) |
| L6 | CORS terbuka penuh (`cors()` default + Socket.io `origin: "*"`) | **High** | ✅ Allowlist via `ALLOWED_ORIGINS`, same-origin default, credentials-aware |
| L7 | `JWT_SECRET` fallback hardcoded `"your_jwt_secret_key"` | **Critical** | ✅ Fail-fast di production bila env kosong; fallback dev ditandai jelas |
| L8 | **Backdoor PIN master** di `isValidDailyAuthKey` — `123456/654321/000000/888888/2024` selalu valid untuk otorisasi transaksi finansial & proyek; fallback `"123456"` juga tersebar di `Payroll.tsx` & `HumanResource.tsx` | **Critical** | ✅ Seluruh backdoor dihapus; PIN harian murni derivatif username+tanggal |
| L9 | Dua manifest PWA konflik (`public/manifest.json` vs manifest yang dibangkitkan vite-plugin-pwa — nama, ikon, dan warna berbeda) | Medium | ✅ Manifest statis dihapus; vite-plugin-pwa menjadi sumber kebenaran tunggal |

### Flow Antar-Halaman
- Routing (`App.tsx`): 30+ rute terproteksi `ProtectedRoute` dengan PBAC (`hasPermission`/`hasGodMode`); redirect `/hris` → `/hr` konsisten; lazy-loading dengan retry chunk (`lazyRetry`) sudah baik.
- Guard frontend (`pbac.ts`) dan guard backend (`requireRole`) selaras per modul (Sales, Finance, Warehouse, Production, HR, Admin).
- Tidak ditemukan rute yatim (halaman tanpa route) maupun route tanpa halaman.

---

## 3. Audit UI/UX: Standarisasi & Pembersihan Micro-Component

### Temuan
| # | Temuan | Severity | Status |
|---|---|---|---|
| U1 | Warna brand `#b02524` di-hardcode sebagai arbitrary value di **377 lokasi / 45 file**, dengan **5 shade gelap berbeda** yang tidak konsisten (`#961f1e`, `#861d1c`, `#7e1a19`, `#921e1d`, `#991f1e`) | **High** | ✅ Token `@theme` `--color-brand*` + codemod seluruh arbitrary value → `bg-brand`, `text-brand`, `hover:bg-brand-dark`, dst. |
| U2 | Pustaka komponen standar `@/components/ui` (Button, Modal, Table, Input, dst.) berkualitas baik tetapi adopsi rendah — 541 `<button>` mentah di 102 file, `<table>` mentah di 47 file | Medium | ✅ Distandarisasi sebagai kanon (lihat catatan konvergen di bawah); CSS base global sudah menyelaraskan input/table |
| U3 | Font dimuat ganda: `<link>` di `index.html` **dan** `@import` di `index.css` — bahkan memuat Inter & Playfair Display yang tidak pernah dipakai | Medium | ✅ `@import` dihapus; font dimuat sekali via `index.html` |
| U4 | Blok `html {}` duplikat di `index.css` | Low | ✅ Digabung |
| U5 | Aset maskot duplikat: `public/assets/mascot/*` vs `src/assets/mascot/*`, plus `mascot-board.webp` ganda di root `public/` dan `src/assets/` | Low | ✅ Duplikat tak-terreferensi dihapus (7 file) |
| U6 | Komponen `UploadSlot` terdefinisi ganda (2 file) — keduanya lokal/internal | Low | ✅ Terselesaikan (satu file ikut terhapus sebagai dead code) |
| U7 | Kartu status Cloud Migration menampilkan "Online & Connected" secara statis | Medium | ✅ Dinamis berdasarkan status konfigurasi aktual |

---

## 4. Analisis Model Divergen–Konvergen

Untuk setiap klaster masalah, dieksplorasi beberapa kandidat solusi (divergen),
lalu dikerucutkan ke satu solusi ideal (konvergen) berdasarkan risiko, dampak,
dan keberlanjutan.

### Klaster A — Pengganti AI Studio/Gemini
- **A1.** Hapus fitur Scout Intelligence sepenuhnya → kehilangan nilai bisnis lead scoring.
- **A2.** Pertahankan `@google/genai`, pindahkan key ke env → masih bergantung layanan eksternal, biaya, dan risiko privasi (UU PDP).
- **A3.** Engine heuristik deterministik murni (fallback yang sudah ada).
- **🏆 Konvergen: A3.** Deterministik, auditable, nol dependensi, kepatuhan privasi bawaan, dan output schema identik sehingga UI tidak berubah sama sekali.

### Klaster B — Standarisasi UI (541 tombol mentah vs pustaka komponen)
- **B1.** Rewrite seluruh halaman ke komponen `@/components/ui` → konsistensi maksimal, tetapi ratusan titik edit berisiko regresi fungsional.
- **B2.** Standardisasi murni via CSS global → murah, tetapi tidak modular.
- **B3.** *Design-token-first*: palet brand menjadi token Tailwind (`@theme`), codemod hex→token otomatis, komponen `@/components/ui` ditetapkan sebagai kanon untuk pengembangan baru, CSS base global merapikan elemen mentah yang tersisa.
- **🏆 Konvergen: B3.** Menghilangkan inkonsistensi terbesar (377 hardcode warna) dengan risiko minimal — tidak ada perubahan struktur JSX, hanya substitusi kelas semantik yang setara nilainya.

### Klaster C — Keamanan
- **C1.** Rewrite arsitektur auth (OAuth/OIDC penuh) → benar secara ideal, tetapi di luar scope dan berisiko merusak flow yang berjalan.
- **C2.** Hardening terarah: hapus backdoor PIN, wajibkan `JWT_SECRET` di production, pasang helmet + rate limit, CORS allowlist.
- **🏆 Konvergen: C2.** Menutup seluruh celah kritis yang teridentifikasi tanpa mengubah kontrak API.

### Klaster D — Dead Code
- **D1.** Pertahankan "untuk masa depan" → membingungkan audit berikutnya, membengkakkan bundle & surface area.
- **D2.** Hapus seluruh file tak-terjangkau (terverifikasi graf impor transitif).
- **🏆 Konvergen: D2.** 19 file dihapus; riwayat tetap ada di Git upstream bila dibutuhkan.

---

## 5. Verifikasi Akhir

| Gerbang | Sebelum | Sesudah |
|---|---|---|
| `tsc --noEmit` | ❌ 9 error | ✅ 0 error |
| `vite build` (production) | ✅ sukses | ✅ sukses (bundle lebih ramping) |
| Boot server production + `/api/health` + SPA serving | — | ✅ HTTP 200 |
| Referensi Google AI Studio / `@google/genai` | 8+ lokasi | ✅ 0 |
| PIN master hardcoded | 5 PIN + 3 fallback | ✅ 0 |
| Hardcode warna brand arbitrary | 377 lokasi | ✅ 0 (token semantik) |
| Dead code | 19 file | ✅ 0 |

## 6. Cara Menjalankan

```bash
npm install
cp .env.example .env        # isi JWT_SECRET (wajib untuk production)

# Development (Vite middleware + API di port yang sama)
npm run dev

# Production
npm run build
NODE_ENV=production JWT_SECRET=<secret> npm start
```

Integrasi opsional:
- **Firebase/Firestore**: isi `FIREBASE_*` (server) dan `VITE_FIREBASE_*` (client bundle). Kosong = mode lokal SQLite otomatis.
- **PostgreSQL replication**: isi `DATABASE_URL`.
- **CORS tambahan**: isi `ALLOWED_ORIGINS` (default same-origin).
