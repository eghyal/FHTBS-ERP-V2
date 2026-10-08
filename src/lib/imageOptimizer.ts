/**
 * Client-Side Product Image Optimizer
 * Resizes, rescales, and compresses high-resolution raw photos into
 * web-optimized lightweight images (WebP/JPEG) before uploading to cloud storage.
 */

export interface OptimizeImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.0 - 1.0
  format?: "image/webp" | "image/jpeg";
}

export interface OptimizeImageResult {
  file: File;
  blob: Blob;
  previewUrl: string;
  originalSize: number;
  optimizedSize: number;
  reductionPercentage: number;
  originalWidth: number;
  originalHeight: number;
  optimizedWidth: number;
  optimizedHeight: number;
  format: string;
}

export async function optimizeProductImage(
  file: File,
  options: OptimizeImageOptions = {}
): Promise<OptimizeImageResult> {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.82,
    format = "image/webp",
  } = options;

  return new Promise((resolve, reject) => {
    // Validate that it's an image
    if (!file.type.startsWith("image/")) {
      reject(new Error("File yang dipilih bukan merupakan format gambar yang valid."));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const originalWidth = img.naturalWidth || img.width;
          const originalHeight = img.naturalHeight || img.height;

          // Calculate scaling while preserving aspect ratio
          let targetWidth = originalWidth;
          let targetHeight = originalHeight;

          if (targetWidth > maxWidth || targetHeight > maxHeight) {
            const widthRatio = maxWidth / targetWidth;
            const heightRatio = maxHeight / targetHeight;
            const scale = Math.min(widthRatio, heightRatio);

            targetWidth = Math.round(targetWidth * scale);
            targetHeight = Math.round(targetHeight * scale);
          }

          // Create canvas for rendering and downsampling
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;

          const ctx = canvas.getContext("2d", { alpha: false });
          if (!ctx) {
            reject(new Error("Gagal menginisialisasi canvas rendering context."));
            return;
          }

          // Configure high quality downsampling
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          // Draw image
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          // Test WebP support or fallback to JPEG
          let outputFormat = format;
          const testCanvas = document.createElement("canvas");
          testCanvas.width = 1;
          testCanvas.height = 1;
          if (outputFormat === "image/webp" && !testCanvas.toDataURL("image/webp").startsWith("data:image/webp")) {
            outputFormat = "image/jpeg";
          }

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Gagal mengompresi gambar."));
                return;
              }

              // Determine output file name
              const ext = outputFormat === "image/webp" ? ".webp" : ".jpg";
              const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
              const optimizedFileName = `${baseName}_optimized${ext}`;

              const optimizedFile = new File([blob], optimizedFileName, {
                type: outputFormat,
                lastModified: Date.now(),
              });

              const originalSize = file.size;
              const optimizedSize = blob.size;
              const reductionPercentage = Math.max(
                0,
                Math.round(((originalSize - optimizedSize) / originalSize) * 100)
              );

              const previewUrl = URL.createObjectURL(blob);

              resolve({
                file: optimizedFile,
                blob,
                previewUrl,
                originalSize,
                optimizedSize,
                reductionPercentage,
                originalWidth,
                originalHeight,
                optimizedWidth: targetWidth,
                optimizedHeight: targetHeight,
                format: outputFormat,
              });
            },
            outputFormat,
            quality
          );
        } catch (err: any) {
          reject(new Error(err?.message || "Terjadi kesalahan saat memproses gambar."));
        }
      };

      img.onerror = () => {
        reject(new Error("Gagal membaca data gambar. Pastikan file gambar tidak rusak."));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error("Gagal memuat file gambar dari penyimpanan lokal."));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Format bytes to readable string (e.g. 1.2 MB or 340 KB)
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
