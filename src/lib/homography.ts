/**
 * Homografi 2D → CSS matrix3d.
 *
 * Memetakan sebuah persegi (konten papan) ke segiempat sembarang
 * (area putih papan yang miring & berperspektif), sehingga konten
 * yang dirender mengikuti orientasi papan secara persis — bukan
 * sekadar rotate/skew perkiraan.
 */

export interface Point {
  x: number;
  y: number;
}

/** Selesaikan sistem linear 8×8 dengan eliminasi Gauss */
function solve8(a: number[][], b: number[]): number[] {
  const n = 8;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // pivot parsial
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[maxRow][col])) maxRow = r;
    }
    [m[col], m[maxRow]] = [m[maxRow], m[col]];

    const pivot = m[col][col] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / pivot;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }

  return m.map((row, i) => row[n] / (row[i] || 1e-12));
}

/**
 * Hitung matriks homografi H (h33 = 1) yang memetakan
 * keempat titik src ke dst (masing-masing 4 titik, urut konsisten).
 */
export function homography(src: Point[], dst: Point[]): number[] {
  const a: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  return solve8(a, b); // [h11..h23]
}

/**
 * Ubah hasil homography() menjadi string CSS matrix3d.
 * Matriks homografi baris-utama:
 *   | h11 h12 h13 |
 *   | h21 h22 h23 |
 *   | h31 h32  1  |
 * CSS matrix3d memakai urutan kolom-utama.
 */
export function toMatrix3d(h: number[]): string {
  const [h11, h12, h13, h21, h22, h23, h31, h32] = h;
  return `matrix3d(${[
    h11,
    h21,
    0,
    h31,
    h12,
    h22,
    0,
    h32,
    0,
    0,
    1,
    0,
    h13,
    h23,
    0,
    1,
  ]
    .map((v) => Number(v.toFixed(6)))
    .join(",")})`;
}
