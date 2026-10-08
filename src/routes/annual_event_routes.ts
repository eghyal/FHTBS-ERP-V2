import { Router } from "express";
import db from "../db/database.ts";
import { DEFAULT_ANNUAL_EVENT_CONFIG, type AnnualEventConfig } from "../types/annualEvent.ts";

export const router = Router();

/**
 * Helper to get annual event configuration from SQLite database
 */
export function getAnnualEventConfigFromDb(): AnnualEventConfig {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'annual_event_config'").get() as
      | { value: string }
      | undefined;

    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return { ...DEFAULT_ANNUAL_EVENT_CONFIG, ...parsed };
    }
  } catch (err) {
    console.error("[AnnualEvent] Error reading config from system_settings:", err);
  }

  // If not found, persist default config
  try {
    const defaultJson = JSON.stringify(DEFAULT_ANNUAL_EVENT_CONFIG);
    db.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value, updated_at)
      VALUES ('annual_event_config', ?, CURRENT_TIMESTAMP)
    `).run(defaultJson);
  } catch (saveErr) {
    console.warn("[AnnualEvent] Failed to initialize default config in system_settings:", saveErr);
  }

  return DEFAULT_ANNUAL_EVENT_CONFIG;
}

/**
 * GET /api/annual-event
 * Public endpoint to fetch active Annual Event configuration & theme
 */
router.get("/api/annual-event", (_req, res) => {
  try {
    const config = getAnnualEventConfigFromDb();
    res.json({
      success: true,
      config,
    });
  } catch (err: any) {
    console.error("[AnnualEvent] GET /api/annual-event error:", err);
    res.status(500).json({
      success: false,
      error: "Gagal memuat konfigurasi Annual Event",
      config: DEFAULT_ANNUAL_EVENT_CONFIG,
    });
  }
});

/**
 * POST /api/annual-event
 * Admin endpoint to update Annual Event configuration
 */
router.post("/api/annual-event", (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ success: false, error: "Payload tidak valid" });
    }

    const currentConfig = getAnnualEventConfigFromDb();
    const updatedConfig: AnnualEventConfig = {
      ...currentConfig,
      ...payload,
      updatedAt: new Date().toISOString(),
      updatedBy: (req.headers["x-user-email"] as string) || (req as any).user?.username || "Admin",
    };

    const jsonString = JSON.stringify(updatedConfig);
    db.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value, updated_at)
      VALUES ('annual_event_config', ?, CURRENT_TIMESTAMP)
    `).run(jsonString);

    // Broadcast real-time update to all connected clients if Socket.IO is initialized
    if ((global as any).io) {
      (global as any).io.emit("annual_event_updated", updatedConfig);
    }

    return res.json({
      success: true,
      message: "Konfigurasi Annual Event berhasil disimpan",
      config: updatedConfig,
    });
  } catch (err: any) {
    console.error("[AnnualEvent] POST /api/annual-event error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Gagal menyimpan konfigurasi Annual Event",
    });
  }
});

/**
 * GET /api/mascot
 * Get 3D mascot image, board, shirt pattern and greeting configuration
 */
router.get("/api/mascot", (_req, res) => {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'mascot_config'").get() as
      | { value: string }
      | undefined;

    let config: any = {
      isVisibleOnPublic: true,
      mascotImageUrl: "/assets/mascot/mascot-board.webp",
      boardImage: null,
      shirtPattern: null,
      greetingImageUrl: "",
      mode: "welcome",
      messages: null,
    };

    if (row && row.value) {
      try {
        config = { ...config, ...JSON.parse(row.value) };
      } catch (e) {}
    }

    return res.json({ success: true, ...config });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      isVisibleOnPublic: true,
      mascotImageUrl: "/assets/mascot/mascot-board.webp",
      boardImage: null,
      shirtPattern: null,
      mode: "welcome",
    });
  }
});

/**
 * POST /api/mascot
 * Update 3D mascot image, board image, shirt pattern, and greeting board configuration
 */
router.post("/api/mascot", (req, res) => {
  try {
    const {
      isVisibleOnPublic,
      mascotImageUrl,
      greetingImageUrl,
      boardImage,
      shirtPattern,
      mode,
      messages,
    } = req.body || {};

    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'mascot_config'").get() as
      | { value: string }
      | undefined;

    let current: any = {
      isVisibleOnPublic: true,
      mascotImageUrl: "/assets/mascot/mascot-board.webp",
      boardImage: null,
      shirtPattern: null,
      greetingImageUrl: "",
      mode: "welcome",
      messages: null,
    };

    if (row && row.value) {
      try {
        current = { ...current, ...JSON.parse(row.value) };
      } catch (e) {}
    }

    const updated = {
      ...current,
      ...(isVisibleOnPublic !== undefined && { isVisibleOnPublic: Boolean(isVisibleOnPublic) }),
      ...(mascotImageUrl !== undefined && { mascotImageUrl }),
      ...(greetingImageUrl !== undefined && { greetingImageUrl }),
      ...(boardImage !== undefined && { boardImage }),
      ...(shirtPattern !== undefined && { shirtPattern }),
      ...(mode !== undefined && { mode }),
      ...(messages !== undefined && { messages }),
      updatedAt: new Date().toISOString(),
    };

    db.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value, updated_at)
      VALUES ('mascot_config', ?, CURRENT_TIMESTAMP)
    `).run(JSON.stringify(updated));

    if ((global as any).io) {
      (global as any).io.emit("mascot_updated", updated);
    }

    return res.json({ success: true, ...updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
