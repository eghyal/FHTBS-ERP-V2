/**
 * Tipe data untuk 3D Motion Mascot — Paving Joss
 */

/** Mode konten papan: ucapan selamat datang atau perayaan annual event */
export type MascotMode = "welcome" | "event";

/** Satu pesan yang tampil di papan mascot */
export interface BoardMessage {
  /** Label kecil di atas judul, mis. "Selamat Datang" */
  badge: string;
  /** Judul utama di papan */
  title: string;
  /** Kalimat pendukung di bawah judul */
  subtitle: string;
}

/** Koleksi pesan per mode */
export type MascotMessages = Record<MascotMode, BoardMessage[]>;
