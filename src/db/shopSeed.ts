import db from "./database.ts";

export function initShopCatalogAndSeed() {
  try {
    // Ensure scout ICP config exists for marketing/CRM setup
    const icpCount = (db.prepare("SELECT COUNT(*) as cnt FROM scout_icp_config").get() as any)?.cnt || 0;
    if (icpCount === 0) {
      db.prepare(`
        INSERT INTO scout_icp_config (
          id, company_name, target_industries, target_buyer_personas, priority_products, scoring_weights, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        "ICP-DEFAULT",
        "Paving Joss (CV Batu Emas Group)",
        JSON.stringify(["Kontraktor Sipil", "Developer Properti", "Pabrik / Manufaktur", "Pekerjaan Umum / LPSE", "Toko Bangunan Retail"]),
        JSON.stringify(["Project Manager", "Site Engineer", "Procurement / Purchasing Lead", "Direktur Operasional", "Pemilik Workshop"]),
        JSON.stringify(["Paving Block K-300 / K-400 SNI", "Kanstin Trotoar DKI", "U-Ditch & Box Culvert", "Mesin Cetak Paving Hidrolik", "Vibrating Screen & Hopper"]),
        JSON.stringify({ behavioral_intent: 0.35, engagement: 0.20, profile_fit: 0.30, freshness: 0.15 }),
        new Date().toISOString()
      );
    }
  } catch (err) {
    console.error("[ShopSeed] Error initializing shop configuration:", err);
  }
}
