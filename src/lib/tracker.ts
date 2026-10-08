/**
 * Client Activity Tracker for Paving Joss (Public, Shop, Careers)
 * Tracks user engagement and feeds behavioral signals into Scout AI.
 */

const SESSION_KEY = "paving_visitor_session_v1";
const CUSTOMER_SESSION_KEY = "shop_customer_session_v1";

// Cache to prevent duplicate bursts (e.g. strict mode or rapid duplicate clicks)
const recentTrackCache = new Map<string, number>();

export function getVisitorSessionId(): string {
  if (typeof window === "undefined") return "SERVER-SESSION";
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = `VIS-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .substring(2, 7)
      .toUpperCase()}`;
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function rotateVisitorSession(): string {
  if (typeof window === "undefined") return "SERVER-SESSION";
  localStorage.removeItem(SESSION_KEY);
  recentTrackCache.clear();
  return getVisitorSessionId();
}

export function getCurrentCustomerId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CUSTOMER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.id || null;
  } catch {
    return null;
  }
}

export interface TrackActivityOptions {
  module: "PUBLIC" | "SHOP" | "CAREERS";
  activity_type:
    | "PAGE_VIEW"
    | "PRODUCT_VIEW"
    | "SEARCH"
    | "FILTER"
    | "CART_ADD"
    | "CART_CHANGE"
    | "JOB_VIEW"
    | "JOB_APPLY_CLICK"
    | "CONTACT_CLICK"
    | "BROCHURE_DOWNLOAD"
    | "SECTION_VIEW";
  title: string;
  details?: Record<string, any> | string;
  page_url?: string;
}

export async function trackActivity(options: TrackActivityOptions): Promise<void> {
  if (typeof window === "undefined") return;

  const sessionId = getVisitorSessionId();
  const customerId = getCurrentCustomerId();
  const pageUrl = options.page_url || window.location.pathname + window.location.search;

  // Deduplication check: ignore identical event within 1500ms
  const cacheKey = `${options.module}:${options.activity_type}:${options.title}:${pageUrl}`;
  const now = Date.now();
  const lastSent = recentTrackCache.get(cacheKey) || 0;
  if (now - lastSent < 1500) {
    return;
  }
  recentTrackCache.set(cacheKey, now);

  const payload = {
    session_id: sessionId,
    customer_id: customerId,
    module: options.module,
    activity_type: options.activity_type,
    title: options.title,
    details: options.details ? JSON.stringify(options.details) : null,
    page_url: pageUrl,
    user_agent: navigator.userAgent,
  };

  try {
    const bodyString = JSON.stringify(payload);
    // Use sendBeacon if supported and page might be unloading, else fetch
    if (navigator.sendBeacon) {
      const blob = new Blob([bodyString], { type: "application/json" });
      navigator.sendBeacon("/api/track/activity", blob);
    } else {
      await fetch("/api/track/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyString,
        keepalive: true,
      });
    }
  } catch (err) {
    // Silent fail so customer experience is never interrupted
    console.debug("[Tracker] Activity tracking notice:", err);
  }
}

// Convenience Helpers
export function trackPageView(
  module: "PUBLIC" | "SHOP" | "CAREERS",
  pageTitle: string,
  urlPath?: string
) {
  trackActivity({
    module,
    activity_type: "PAGE_VIEW",
    title: `Melihat Laman: ${pageTitle}`,
    page_url: urlPath,
  });
}

export function trackProductView(product: {
  id: string;
  name: string;
  category?: string;
  unit_price?: number;
  promo_price?: number;
}) {
  const price = product.promo_price && product.promo_price > 0 ? product.promo_price : product.unit_price;
  trackActivity({
    module: "SHOP",
    activity_type: "PRODUCT_VIEW",
    title: `Melihat Produk: ${product.name}`,
    details: {
      product_id: product.id,
      category: product.category,
      price,
    },
  });
}

export function trackSearch(query: string, module: "PUBLIC" | "SHOP" | "CAREERS" = "SHOP") {
  if (!query.trim()) return;
  trackActivity({
    module,
    activity_type: "SEARCH",
    title: `Pencarian: ${query.trim()}`,
    details: { query: query.trim() },
  });
}

export function trackFilter(filterName: string, value: string, module: "SHOP" | "CAREERS" = "SHOP") {
  trackActivity({
    module,
    activity_type: "FILTER",
    title: `Filter ${filterName}: ${value}`,
    details: { filter: filterName, value },
  });
}

export function trackCartAdd(
  product: { id: string; name: string; uom?: string; unit_price?: number; promo_price?: number },
  qty: number
) {
  const price = product.promo_price && product.promo_price > 0 ? product.promo_price : product.unit_price;
  trackActivity({
    module: "SHOP",
    activity_type: "CART_ADD",
    title: `Tambah ke Keranjang: ${product.name} (${qty} ${product.uom || "Unit"})`,
    details: {
      product_id: product.id,
      qty,
      unit_price: price,
      total_price: (price || 0) * qty,
    },
  });
}

export function trackJobView(job: { id: string; title: string; department?: string; location?: string }) {
  trackActivity({
    module: "CAREERS",
    activity_type: "JOB_VIEW",
    title: `Melihat Lowongan Karir: ${job.title}`,
    details: {
      job_id: job.id,
      department: job.department,
      location: job.location,
    },
  });
}

export function trackJobApplyClick(job: { id: string; title: string }) {
  trackActivity({
    module: "CAREERS",
    activity_type: "JOB_APPLY_CLICK",
    title: `Klik Lamaran Pekerjaan: ${job.title}`,
    details: {
      job_id: job.id,
      job_title: job.title,
    },
  });
}

export function trackContactClick(channel: "WHATSAPP" | "MAPS" | "PHONE" | "EMAIL", info?: string) {
  trackActivity({
    module: "PUBLIC",
    activity_type: "CONTACT_CLICK",
    title: `Klik Kontak: ${channel} ${info ? `(${info})` : ""}`,
    details: { channel, info },
  });
}

export function trackBrochureDownload(docName: string) {
  trackActivity({
    module: "PUBLIC",
    activity_type: "BROCHURE_DOWNLOAD",
    title: `Unduh Dokumen / Katalog: ${docName}`,
    details: { document_name: docName },
  });
}
