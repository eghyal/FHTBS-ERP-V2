/**
 * Geometri kanvas mascot — diekstrak dari gambar referensi.
 * Semua koordinat dalam fraksi (0..1) terhadap ukuran kanvas,
 * sehingga konsisten di berapa pun ukuran render.
 *
 * Setiap layer (base, head, arm, eyes, pupils) adalah gambar
 * full-kanvas yang ditumpuk absolute inset-0, jadi titik pivot
 * dan posisi cukup dinyatakan dalam persen kanvas.
 */

/** Ukuran kanvas asli gambar referensi (px) — untuk aspect-ratio stage */
export const MASCOT_CANVAS = { width: 2528, height: 1686 } as const;

/** Pivot rotasi kepala (di pangkal dagu) — fraksi kanvas */
export const HEAD_PIVOT = { x: 0.3481, y: 0.4982 } as const;

/** Pivot rotasi lengan penunjuk (di bahu) — fraksi kanvas */
export const ARM_PIVOT = { x: 0.2017, y: 0.516 } as const;

/** Titik tengah putih mata — origin animasi kedip (scaleY) */
export const EYE_CENTER = {
  left: { x: 0.3159, y: 0.3256 },
  right: { x: 0.4223, y: 0.2809 },
} as const;

/** Posisi netral pupil — fraksi kanvas */
export const PUPIL_HOME = {
  left: { x: 0.3152, y: 0.3324 },
  right: { x: 0.4094, y: 0.2959 },
} as const;

/**
 * Batas gerak pupil agar tetap di dalam putih mata.
 * Dalam fraksi ukuran layer (1% translateX = 1% lebar kanvas).
 */
export const PUPIL_RANGE = { x: 1.1, y: 1.0 } as const;

/**
 * Empat sudut area putih di dalam bingkai papan (fraksi kanvas),
 * urut: kiri-atas, kanan-atas, kanan-bawah, kiri-bawah.
 * Dipakai untuk memetakan konten (teks / gambar unggahan) ke bidang
 * papan via homografi matrix3d — konten mengikuti rotasi & perspektif
 * papan sehingga tampak menempel nyata.
 */
export const BOARD_QUAD = [
  { x: 0.548, y: 0.211 }, // kiri atas
  { x: 0.902, y: 0.272 }, // kanan atas (dikalibrasi presisi agar tidak menimpa bingkai kanan papan)
  { x: 0.871, y: 0.661 }, // kanan bawah (dikalibrasi presisi di dalam bingkai)
  { x: 0.518, y: 0.595 }, // kiri bawah
] as const;
