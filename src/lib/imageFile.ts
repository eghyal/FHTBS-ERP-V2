/**
 * Utilitas upload gambar untuk kustomisasi mascot.
 *
 * File dibaca menjadi data URL dan diperkecil (default maks. 1000px)
 * supaya muat disimpan di localStorage browser.
 */

const MAX_DIMENSION = 1000;
const WEBP_QUALITY = 0.85;

export class ImageUploadError extends Error {}

/**
 * Baca file gambar → data URL WebP yang sudah di-downscale.
 * Menolak file non-gambar atau gambar yang tidak bisa didekode.
 */
export function fileToDataUrl(
  file: File,
  maxDimension = MAX_DIMENSION,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new ImageUploadError("File harus berupa gambar (PNG/JPG/WebP)."));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(
        1,
        maxDimension / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new ImageUploadError("Canvas tidak tersedia di browser ini."));
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);
      // WebP menjaga transparansi sekaligus berukuran kecil
      const dataUrl = canvas.toDataURL("image/webp", WEBP_QUALITY);
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new ImageUploadError("Gambar tidak dapat dibaca."));
    };

    img.src = objectUrl;
  });
}
