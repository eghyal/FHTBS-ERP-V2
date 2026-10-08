import React, { useState, useEffect, useCallback, useRef } from "react";
import { useProductionHubStore } from "@/stores/productionHubStore";
import { LogTable } from "./LogTable";
import { SidePanel } from "./SidePanel";
import { apiFetch } from "@/utils/api";
import { Activity, ShieldCheck, QrCode, FileText, Cpu, AlertTriangle, Layers, Radio } from "lucide-react";
import { io } from "socket.io-client";

export function ProductionLogger() {
  const store = useProductionHubStore();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [dashboardStats, setDashboardStats] = useState<any | null>(null);

  // Audio Chime Synthesizer via Web Audio API
  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // AudioContext might be blocked before user gesture
    }
  }, [soundEnabled]);

  const fetchDashboardStats = useCallback(async () => {
    try {
      const res: any = await apiFetch('/api/production-logger/dashboard');
      if (res.ok) {
        setDashboardStats(res);
      }
    } catch (e) {
      console.error("Failed to fetch dashboard summary:", e);
    }
  }, []);

  const fetchLogs = useCallback(async (page = 1, append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      
      const limit = 200;
      const url = store.project?.id 
        ? `/api/production-logger/logs?project_id=${store.project.id}&limit=${limit}&page=${page}` 
        : `/api/production-logger/logs?limit=${limit}&page=${page}`;
        
      const res: any = await apiFetch(url);
      if (res.ok) {
        const fetchedData = res.data || [];
        if (append) {
          setLogs(prev => [...prev, ...fetchedData]);
        } else {
          setLogs(fetchedData);
        }
        
        // If we received fewer records than the limit, there are no more records to load
        setHasMore(fetchedData.length === limit);
        setCurrentPage(page);
      }
    } catch (e) {
      console.error("Failed to fetch production logs:", e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [store.project?.id]);

  const loadMoreLogs = () => {
    if (!loadingMore && hasMore) {
      fetchLogs(currentPage + 1, true);
    }
  };

  useEffect(() => {
    fetchLogs(1, false);
    fetchDashboardStats();

    const socket = io();
    socket.on('production_update', (data: any) => {
      const { action, payload, id } = data || {};
      
      // If a new log is created or relevant action occurred
      if (
        action === 'NEW_PRODUCTION_LOG' || 
        action === 'WOT_SCANNED' || 
        action === 'WOT_COMPLETED' || 
        action === 'NDP_TRIGGERED' || 
        action === 'FLOOR_REQUEST_UPDATED' ||
        action === 'FLOOR_REQUEST_CREATED' ||
        action === 'WOT_COMPLETED_STEP' ||
        action === 'BOP_INCREMENT' ||
        action === 'STATION_STARTED'
      ) {
        const logId = id || payload?.id;
        if (logId) {
          setNewLogIds(prev => new Set(prev).add(logId));
          // Clear highlight after 3.5 seconds
          setTimeout(() => {
            setNewLogIds(prev => {
              const next = new Set(prev);
              next.delete(logId);
              return next;
            });
          }, 3500);
        }

        playChime();
        fetchLogs(1, false);
        fetchDashboardStats();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchLogs, fetchDashboardStats, playChime]);

  const toggleSound = () => {
    setSoundEnabled(prev => !prev);
  };

  return (
    <div className="flex flex-col space-y-4 h-full min-h-[800px]">
      {/* Top Real-time Summary Cards (Section 4.1 & 13.1) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white border border-stone-200 rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400">Today's Logs</span>
            <div className="text-xl font-black text-stone-900 mt-0.5">
              {dashboardStats?.today_stats?.total_logs_today || logs.length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600">
            <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
          </div>
        </div>

        <div className="p-3.5 bg-white border border-stone-200 rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">WOTs Finished</span>
            <div className="text-xl font-black text-emerald-700 mt-0.5">
              {dashboardStats?.today_stats?.wots_completed_today || logs.filter(l => l.log_type === 'WOT_COMPLETE').length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <QrCode className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 bg-white border border-stone-200 rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">Active NDPs</span>
            <div className="text-xl font-black text-rose-700 mt-0.5">
              {dashboardStats?.active_ndps || 0}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 bg-white border border-stone-200 rounded-2xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">Pending Requests</span>
            <div className="text-xl font-black text-amber-700 mt-0.5">
              {dashboardStats?.pending_requests || 0}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <Layers className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Grid: 70% Log Table & 30% Side Panel */}
      <div className="flex flex-col lg:flex-row gap-6 flex-1">
        {/* 70% Log Table Main Stream */}
        <div className="flex-1 bg-white rounded-3xl p-6 border border-stone-200 shadow-xs flex flex-col space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-stone-900 tracking-tight">Production Logger</h2>
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Stream Active
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Immutable event-driven audit trail across machine constraints, QR tickets, and floor actions
              </p>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <span className="font-mono font-bold bg-stone-100 px-3 py-1 rounded-xl text-stone-700">
                {logs.length} events logged
              </span>
            </div>
          </div>

          <LogTable 
            logs={logs} 
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onLoadMore={loadMoreLogs}
            onRefresh={() => {
              fetchLogs(1, false);
              fetchDashboardStats();
            }}
            newLogIds={newLogIds}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSound}
          />
        </div>

        {/* 30% Side Panel (NDP & Floor Requests) */}
        <div className="w-full lg:w-[380px] shrink-0">
          <SidePanel 
            onActionComplete={() => {
              fetchLogs();
              fetchDashboardStats();
            }} 
          />
        </div>
      </div>
    </div>
  );
}
