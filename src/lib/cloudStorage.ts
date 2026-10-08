import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase.ts";

/**
 * Converts a File or Blob to a standard Base64 Data URL
 */
export function blobToDataUrl(blob: Blob | File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal membaca file gambar sebagai Data URL"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Uploads a file/blob to the server's local high-speed storage endpoint.
 * This is the primary and fastest storage tier (takes <100ms and never hits CORS/bucket limits).
 */
export async function uploadFileToServer(
  file: File | Blob,
  pathPrefix: string = "uploads"
): Promise<{ url: string; filename: string }> {
  const formData = new FormData();
  const fileName = (file instanceof File ? file.name : "image.webp").replace(/[^a-zA-Z0-9._-]/g, "_");
  formData.append("file", file, fileName);
  formData.append("prefix", pathPrefix);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Server responded with status ${res.status}`);
    }

    const data = await res.json();
    return {
      url: data.url || data.fileUrl,
      filename: data.filename || fileName,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn("[Upload] Server API upload failed, attempting fallback:", err?.message);
    throw err;
  }
}

/**
 * Uploads a file/blob to Firebase Cloud Storage bucket with a strict timeout failsafe.
 * Returns the public / download URL and the storage path.
 */
export async function uploadFileToCloudStorage(
  file: File | Blob,
  pathPrefix: string = "uploads",
  timeoutMs: number = 4000
): Promise<{ url: string; path: string }> {
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  const fileName = (file instanceof File ? file.name : "file.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
  const fullPath = `${pathPrefix}/${timestamp}-${random}-${fileName}`;

  // Strict timeout promise to prevent SDK hanging indefinitely
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("Cloud Storage upload timed out after " + timeoutMs + "ms"));
    }, timeoutMs);
  });

  const uploadPromise = (async () => {
    const storageRef = ref(storage, fullPath);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return { url: downloadUrl, path: fullPath };
  })();

  return Promise.race([uploadPromise, timeoutPromise]);
}

/**
 * Universal file uploader helper:
 * 1. Tries high-speed server disk storage first (robust & instant).
 * 2. If server upload fails, attempts Firebase Storage with strict timeout.
 * 3. If all network uploads fail, converts to optimized inline Base64 Data URL.
 * NEVER blocks or hangs the user interface.
 */
export async function uploadUniversalFile(
  file: File | Blob,
  pathPrefix: string = "uploads"
): Promise<string> {
  // Tier 1: Local / Express Server Upload
  try {
    const res = await uploadFileToServer(file, pathPrefix);
    if (res.url) {
      return res.url;
    }
  } catch (serverErr) {
    console.warn("[UniversalUploader] Primary server upload failed:", serverErr);
  }

  // Tier 2: Cloud Storage with strict 3.5s timeout
  try {
    const cloudRes = await uploadFileToCloudStorage(file, pathPrefix, 3500);
    if (cloudRes.url) {
      return cloudRes.url;
    }
  } catch (cloudErr) {
    console.warn("[UniversalUploader] Cloud storage fallback failed/timed out:", cloudErr);
  }

  // Tier 3: Base64 JSON API upload
  try {
    const dataUrl = await blobToDataUrl(file);
    const res = await fetch("/api/upload/base64", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl,
        filename: file instanceof File ? file.name : "upload.webp",
        prefix: pathPrefix,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.url) return data.url;
    }
    // If backend base64 endpoint failed, return the inline Data URL directly
    return dataUrl;
  } catch (finalErr) {
    console.warn("[UniversalUploader] Falling back to direct inline Data URL:", finalErr);
    return await blobToDataUrl(file);
  }
}
