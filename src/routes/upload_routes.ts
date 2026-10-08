import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

export const uploadRouter = Router();

// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Disk Storage Configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(6).toString("hex");
    const parsedExt = path.extname(file.originalname) || (file.mimetype.includes("webp") ? ".webp" : file.mimetype.includes("png") ? ".png" : file.mimetype.includes("pdf") ? ".pdf" : ".jpg");
    const cleanExt = parsedExt.toLowerCase().replace(/[^a-z0-9.]/g, "");
    const safeBaseName = path.basename(file.originalname, parsedExt).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30) || "upload";
    
    cb(null, `${safeBaseName}_${timestamp}_${randomHex}${cleanExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max limit
  },
});

// Preset catalogue photos for standard concrete products
export const PRESET_CATALOG_IMAGES = [
  {
    category: "Batako",
    name: "Batako Press Semen Pasir Super K-200",
    url: "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=800&auto=format&fit=crop&q=80",
    description: "Batako pres semen abu batu padat untuk dinding dan pagar",
  },
  {
    category: "Batako",
    name: "Batako Buntu / Solid Block Heavy Duty",
    url: "https://images.unsplash.com/photo-1584463623578-3062b88137f4?w=800&auto=format&fit=crop&q=80",
    description: "Batako tanpa rongga kuat tekan tinggi",
  },
  {
    category: "Paving",
    name: "Paving Block Hexagon / Segi Enam K-300",
    url: "https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?w=800&auto=format&fit=crop&q=80",
    description: "Paving hexagon abu-abu dan merah untuk pelataran parkir",
  },
  {
    category: "Paving",
    name: "Paving Block Truepave Bata 20x10x6 cm K-300",
    url: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=800&auto=format&fit=crop&q=80",
    description: "Paving persegi panjang interlocking jalan perumahan & trotoar",
  },
  {
    category: "Drainase",
    name: "Saluran Drainase U-Ditch Beton Precast 40x40x120",
    url: "https://images.unsplash.com/photo-1541888946425-d0fbb180ef6f?w=800&auto=format&fit=crop&q=80",
    description: "Saluran drainase U-ditch pracetak dengan cover tutup",
  },
  {
    category: "Kanstin",
    name: "Kanstin Taman / Curbstone Beton 40x20x10 cm",
    url: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&auto=format&fit=crop&q=80",
    description: "Pembatas trotoar dan taman jalan perumahan",
  },
  {
    category: "Buis Beton",
    name: "Buis Beton Sumur / Pipa Gorong-gorong Diameter 80 cm",
    url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80",
    description: "Pipa sumur resapan dan gorong-gorong drainase silinder",
  },
  {
    category: "Roster",
    name: "Roster Beton Minimalis Motif Silang Bintang",
    url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80",
    description: "Ventilasi udara roster dinding estetik arsitektural",
  },
];

/**
 * GET /api/upload/presets
 * Returns curated high-resolution preset photos for concrete catalog
 */
uploadRouter.get("/api/upload/presets", (_req, res) => {
  res.json({
    success: true,
    data: PRESET_CATALOG_IMAGES,
  });
});

/**
 * POST /api/upload
 * Standard Multipart File Upload endpoint
 */
uploadRouter.post(
  "/api/upload",
  (req, res, next) => {
    // Accepts any single file field: 'file', 'image', 'manifest', 'attachment'
    upload.any()(req, res, (err) => {
      if (err) {
        console.error("[Upload API] Multer error:", err);
        return res.status(400).json({
          success: false,
          error: err.message || "Failed to process file upload",
        });
      }
      next();
    });
  },
  (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      const singleFile = req.file || (files && files.length > 0 ? files[0] : null);

      if (!singleFile) {
        return res.status(400).json({
          success: false,
          error: "No file was uploaded in request payload",
        });
      }

      const relativeUrl = `/uploads/${singleFile.filename}`;
      const fullUrl = `${req.protocol}://${req.get("host")}${relativeUrl}`;

      return res.json({
        success: true,
        url: relativeUrl,
        fileUrl: relativeUrl,
        fullUrl: fullUrl,
        filename: singleFile.filename,
        originalName: singleFile.originalname,
        size: singleFile.size,
        mimetype: singleFile.mimetype,
      });
    } catch (err: any) {
      console.error("[Upload API] Unexpected error:", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "Internal server error during upload handling",
      });
    }
  }
);

/**
 * POST /api/upload/base64
 * Uploads client-optimized base64 Data URLs and persists them to disk
 */
uploadRouter.post("/api/upload/base64", (req, res) => {
  try {
    const { dataUrl, filename, prefix = "img" } = req.body;

    if (!dataUrl || typeof dataUrl !== "string") {
      return res.status(400).json({
        success: false,
        error: "dataUrl is required and must be a valid string",
      });
    }

    // Parse Data URL e.g. "data:image/webp;base64,AAAA..."
    const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({
        success: false,
        error: "Invalid data URL format",
      });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    const ext = mimeType.includes("webp")
      ? ".webp"
      : mimeType.includes("png")
      ? ".png"
      : mimeType.includes("pdf")
      ? ".pdf"
      : ".jpg";

    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(6).toString("hex");
    const safeName = (filename ? filename.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_") : prefix) || "upload";
    const finalFilename = `${safeName}_${timestamp}_${randomHex}${ext}`;
    const filePath = path.join(uploadsDir, finalFilename);

    fs.writeFileSync(filePath, buffer);

    const relativeUrl = `/uploads/${finalFilename}`;

    return res.json({
      success: true,
      url: relativeUrl,
      fileUrl: relativeUrl,
      filename: finalFilename,
      size: buffer.length,
      mimetype: mimeType,
    });
  } catch (err: any) {
    console.error("[Upload API] Base64 upload error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to process base64 upload",
    });
  }
});
