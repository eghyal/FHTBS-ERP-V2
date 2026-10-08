import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Dynamically synchronize client clock with authoritative global time APIs
const OriginalDate = window.Date;
let timeOffset = 0;

async function syncGlobalTime() {
  // 1. First priority: authoritative internal server time (same-origin, zero CORS issues)
  try {
    const res = await fetch("/api/time");
    if (res.ok) {
      const data = await res.json();
      if (data && (data.timestamp || data.time)) {
        const officialDate = data.timestamp
          ? new OriginalDate(data.timestamp)
          : new OriginalDate(data.time);
        if (!isNaN(officialDate.getTime())) {
          timeOffset = officialDate.getTime() - OriginalDate.now();
          return;
        }
      }
    }
  } catch {
    // Fallback to secondary sources
  }

  // 2. Secondary fallback: /api/health
  try {
    const res = await fetch("/api/health");
    if (res.ok) {
      const data = await res.json();
      if (data && data.time) {
        const officialDate = new OriginalDate(data.time);
        if (!isNaN(officialDate.getTime())) {
          timeOffset = officialDate.getTime() - OriginalDate.now();
          return;
        }
      }
    }
  } catch {
    // Fallback to external time services
  }

  // 3. Fallback: timeapi.io
  try {
    const res = await fetch(
      "https://timeapi.io/api/time/current/zone?timeZone=Asia/Jakarta",
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.dateTime) {
        const officialDate = new OriginalDate(data.dateTime + "+07:00");
        if (!isNaN(officialDate.getTime())) {
          timeOffset = officialDate.getTime() - OriginalDate.now();
          return;
        }
      }
    }
  } catch {
    // Fallback to worldtimeapi.org
  }

  // 4. Fallback: worldtimeapi.org
  try {
    const res = await fetch(
      "https://worldtimeapi.org/api/timezone/Asia/Jakarta",
    );
    if (res.ok) {
      const data = await res.json();
      if (data && (data.utc_datetime || data.datetime)) {
        const officialDate = new OriginalDate(
          data.utc_datetime || data.datetime,
        );
        if (!isNaN(officialDate.getTime())) {
          timeOffset = officialDate.getTime() - OriginalDate.now();
          return;
        }
      }
    }
  } catch {
    // Graceful fallback to client system time
  }
}

// Fire off background synchronization immediately
syncGlobalTime();

function CustomDate(...args: any[]) {
  if (!(this instanceof CustomDate)) {
    return new OriginalDate(OriginalDate.now() + timeOffset).toString();
  }
  if (args.length === 0) {
    return new OriginalDate(OriginalDate.now() + timeOffset);
  }
  return new (OriginalDate as any)(...args);
}

CustomDate.prototype = OriginalDate.prototype;
(CustomDate as any).now = function () {
  return OriginalDate.now() + timeOffset;
};
(CustomDate as any).UTC = OriginalDate.UTC;
(CustomDate as any).parse = OriginalDate.parse;

window.Date = CustomDate as any;

let cachedUserEmail: string | null = null;
let lastStorageCheck = 0;

function getUserEmail(): string | null {
  const now = Date.now();
  // Check localStorage at most once every 2 seconds to avoid overhead, or rely on storage events
  if (now - lastStorageCheck > 2000) {
    lastStorageCheck = now;
    try {
      const storedUser = localStorage.getItem("erp_user");
      if (storedUser) {
        const user = JSON.parse(storedUser);
        cachedUserEmail = user?.username || null;
      } else {
        cachedUserEmail = null;
      }
    } catch (e) {
      cachedUserEmail = null;
    }
  }
  return cachedUserEmail;
}

window.addEventListener("storage", (e) => {
  if (e.key === "erp_user") {
    lastStorageCheck = 0; // Force re-check on next fetch
  }
});

const originalFetch = window.fetch;
Object.defineProperty(window, "fetch", {
  configurable: true,
  enumerable: true,
  writable: true,
  value: async function (resource: RequestInfo | URL, config?: RequestInit) {
    if (typeof resource === "string" && resource.startsWith("/api/")) {
      config = config || {};
      const headers = { ...config.headers };

      const email = getUserEmail();
      if (email) {
        (headers as any)["x-user-email"] = email;
      }
      config.headers = headers;
    }

    return originalFetch.call(window, resource, config);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
