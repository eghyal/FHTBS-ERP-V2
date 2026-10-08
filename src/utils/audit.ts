import db from "../db/database.ts";

export function logAudit(
  userEmail: string | null,
  action: string,
  resourceType: string | null,
  resourceId: string | null,
  details: string | null,
) {
  const executeLog = async () => {
    try {
      const id = "AUD-" + Math.random().toString(36).substr(2, 9);
      let clockTime = new Date().toISOString();
      const endpoints = [
        {
          url: "https://timeapi.io/api/Time/current/zone?timeZone=Asia/Jakarta",
          parser: (d: any) => d.dateTime,
        },
        {
          url: "https://worldtimeapi.org/api/timezone/Asia/Jakarta",
          parser: (d: any) => d.datetime,
        },
      ];
      for (const endpoint of endpoints) {
        try {
          const controller = new AbortController();
          const tId = setTimeout(() => controller.abort(), 2000);
          const response = await fetch(endpoint.url, {
            signal: controller.signal,
          });
          clearTimeout(tId);
          if (response.ok) {
            const data = await response.json();
            const dtStr = endpoint.parser(data);
            if (dtStr) {
              const dt = new Date(dtStr);
              if (!isNaN(dt.getTime())) {
                clockTime = dt.toISOString();
                break;
              }
            }
          }
        } catch (e) {}
      }

      db.prepare(
        "INSERT INTO audit_trail (id, user_email, action, resource_type, resource_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        id,
        userEmail || "SYSTEM",
        action,
        resourceType,
        resourceId,
        details,
        clockTime,
      );
    } catch (err) {
      console.error("Audit logging failed:", err);
    }
  };
  executeLog();
}
