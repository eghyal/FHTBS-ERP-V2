import React, { useEffect, useState } from "react";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { History, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface AuditLog {
  id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string;
  created_at: string;
}

export function AuditTimeline({
  resourceType,
  resourceId,
}: {
  resourceType?: string;
  resourceId?: string;
}) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { language } = useLanguage();

  useEffect(() => {
    let mounted = true;
    const fetchLogs = async () => {
      const url = resourceId
        ? `/api/audit-trail?resource_id=${resourceId}`
        : `/api/audit-trail`;

      try {
        const res = await apiFetch(url, {}, user?.username);
        if (res.ok && mounted) {
          setLogs(res.data);
        }
      } catch (err) {
        console.error("Failed to fetch audit trail", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchLogs();

    // Auto-refresh every 30 seconds for real-time observability
    const interval = setInterval(() => { if (!document.hidden) fetchLogs(); }, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [resourceId, user?.username]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32 text-stone-400">
        <Activity className="w-5 h-5 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6 border-b border-stone-100 pb-4">
        <History className="w-4 h-4 text-stone-900" />
        <h3 className="text-sm font-bold text-stone-900 uppercase tracking-widest">
          {language === "id" ? "Histori Aktivitas" : "Activity Journal"}
        </h3>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-6 text-stone-400 text-xs font-bold uppercase tracking-widest border border-stone-100 rounded-2xl bg-stone-50/50">
          No activity logs found.
        </div>
      ) : (
        <div className="relative border-l-2 border-stone-100 ml-4 space-y-8 pl-6">
          {logs.map((log) => (
            <div key={log.id} className="relative">
              <span className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-white border-2 border-stone-300 shadow-sm" />
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                  {new Date(log.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-sm text-stone-900 font-medium">
                  {log.action}
                </span>
                <span className="text-xs text-stone-500">
                  by{" "}
                  <span className="font-bold text-stone-700">
                    {log.user_email}
                  </span>
                </span>
                {log.details && (
                  <p className="text-xs font-mono text-stone-500 mt-2 bg-stone-50 p-2 rounded-lg border border-stone-100">
                    {log.details}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
