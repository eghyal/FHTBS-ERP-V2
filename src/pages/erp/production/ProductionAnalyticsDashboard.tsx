import React, { useState, useEffect } from "react";
import { apiFetch } from "@/utils/api";
import { 
  Activity, 
  BarChart3, 
  TrendingUp, 
  AlertTriangle,
  Factory,
  Layers,
  CheckCircle2,
  Clock,
  Cpu,
  Zap,
  ArrowRight,
  ShieldCheck,
  Wrench,
  AlertCircle
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { Button } from "@/components/ui/Button";
import { ProductionOeeWipModal } from "@/components/erp/ProductionOeeWipModal";

export function ProductionAnalyticsDashboard() {
  const { language } = useLanguage();
  const { showToast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Selected project for OEE & WIP deep dive
  const [selectedProjectForOee, setSelectedProjectForOee] = useState<any>(null);

  const loadGlobalStats = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/production/global-analytics");
      if (res.ok) {
        setData(res.data);
      }
    } catch (e) {
      console.error("Failed to load global analytics", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGlobalStats();
  }, []);

  const handleResolveNdp = async (ndpId: string) => {
    try {
      const res: any = await apiFetch(`/api/production/ndp/${ndpId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolved_by: "Production Manager / Dispatcher" })
      });
      if (res.ok || res.success) {
        showToast("NDP successfully resolved and equipment unblocked!", "success");
        loadGlobalStats();
      } else {
        throw new Error(res.error || "Failed to resolve NDP");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500 text-sm">
        <Activity className="w-5 h-5 animate-spin mr-2" />
        Loading Factory Analytics...
      </div>
    );
  }

  if (!data) return null;

  const mStats = data.machineStats;
  const yieldTotal = (data.yieldData?.good_units || 0) + (data.yieldData?.scrap_units || 0);
  const yieldPct = yieldTotal > 0 ? ((data.yieldData?.good_units || 0) / yieldTotal) * 100 : 100;
  const machineFleet = data.machineFleet || [];
  const activeProjectsList = data.activeProjectsList || [];
  const activeNdpsList = data.activeNdpsList || [];
  const bottlenecks = data.bottlenecks || [];

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      
      {/* Overview Headline */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-stone-900 tracking-tight">Factory Performance Overview</h2>
          <p className="text-xs text-stone-500">Real-time machine fleet health, WIP bottleneck tracking, and OEE intelligence</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={loadGlobalStats}
          className="rounded-xl border-stone-200"
        >
          <Activity className="w-4 h-4 mr-1.5" /> Refresh Analytics
        </Button>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Machine Utilization */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
               <Factory className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Equip. Util</span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-light tracking-tighter text-stone-900">{mStats?.in_use || 0}</span>
              <span className="text-sm font-bold text-stone-500">/ {mStats?.total_machines || 0}</span>
            </div>
            <p className="text-xs text-stone-500 mt-1 font-medium">Machines actively running</p>
          </div>
          <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between text-[10px] font-bold">
            <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">{mStats?.broken || 0} broken</span>
            <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">{mStats?.maintenance || 0} maint</span>
          </div>
        </div>

        {/* Global Yield */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
               <TrendingUp className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Global Yield</span>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-light tracking-tighter text-emerald-700">{yieldPct.toFixed(1)}</span>
              <span className="text-sm font-bold text-emerald-700">%</span>
            </div>
            <p className="text-xs text-stone-500 mt-1 font-medium">Last 30 days production quality</p>
          </div>
          <div className="mt-4 pt-4 border-t border-stone-100 flex items-center gap-3 text-[10px] font-bold">
             <div><span className="text-stone-400">Good:</span> <span className="text-stone-700">{data.yieldData?.good_units || 0}</span></div>
             <div><span className="text-stone-400">Scrap:</span> <span className="text-rose-600">{data.yieldData?.scrap_units || 0}</span></div>
          </div>
        </div>

        {/* Active Downtime */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
               <AlertTriangle className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Active Down</span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-light tracking-tighter text-rose-700">{data.activeNdps?.count || 0}</span>
              <span className="text-sm font-bold text-rose-700">Incidents</span>
            </div>
            <p className="text-xs text-stone-500 mt-1 font-medium">Unresolved Notice to Down Processes</p>
          </div>
          <div className="mt-4 pt-4 border-t border-stone-100 flex items-center gap-1.5 text-[10px] font-bold">
             <Clock className="w-3.5 h-3.5 text-stone-400" />
             <span className="text-stone-600">{Number(data.activeNdps?.total_hours || 0).toFixed(1)} hrs est. downtime</span>
          </div>
        </div>

        {/* Floor Requests Pipeline */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
               <Layers className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Floor Pipeline</span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-light tracking-tighter text-amber-700">{data.floorRequests?.pending || 0}</span>
              <span className="text-sm font-bold text-stone-500">Pending</span>
            </div>
            <p className="text-xs text-stone-500 mt-1 font-medium">Material/Tool requests from shop floor</p>
          </div>
          <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between text-[10px] font-bold">
             <span className="text-stone-500">Total Requests: {data.floorRequests?.total || 0}</span>
             <span className="text-emerald-600 flex items-center"><CheckCircle2 className="w-3 h-3 mr-1" /> {data.floorRequests?.fulfilled || 0} Fulfilled</span>
          </div>
        </div>
      </div>

      {/* Active Projects & OEE Deep-Dive Hub */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-stone-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-600" /> Active Production Lines & OEE Cockpit
            </h3>
            <p className="text-xs text-stone-500">Select any project to inspect station-by-station WIP flow, availability, and quality</p>
          </div>
        </div>

        {activeProjectsList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeProjectsList.map((p: any) => {
              const progressPct = p.total_wots > 0 ? Math.round((p.completed_wots / p.total_wots) * 100) : 0;
              return (
                <div 
                  key={p.id}
                  className="p-4 rounded-2xl border border-stone-200 bg-stone-50/60 hover:bg-stone-50 hover:border-stone-300 transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-stone-900 text-sm line-clamp-1">{p.name}</h4>
                      <p className="text-[11px] text-stone-500 mt-0.5 font-mono">Target: {p.qty} {p.uom || "PCS"}</p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {p.status}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-stone-600 mb-1">
                      <span>WOT Progress</span>
                      <span>{p.completed_wots} / {p.total_wots} ({progressPct}%)</span>
                    </div>
                    <div className="w-full bg-stone-200 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedProjectForOee(p)}
                    className="w-full h-8 text-xs font-bold rounded-xl border-stone-200 bg-white hover:bg-stone-100"
                  >
                    Open OEE & WIP Cockpit <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-stone-400">No active projects found.</div>
        )}
      </div>

      {/* Machine Fleet Live Status & Breakdown Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Machine Fleet Status (2 cols) */}
        <div className="lg:col-span-2 bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-stone-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-600" /> Machine Asset Fleet Matrix
              </h3>
              <p className="text-xs text-stone-500">Live operational condition, capacity per hour, and active process allocations</p>
            </div>
            <span className="text-xs font-mono font-bold text-stone-500 bg-stone-100 px-2.5 py-1 rounded-xl">
              {machineFleet.length} Machines
            </span>
          </div>

          <div className="divide-y divide-stone-100 max-h-[380px] overflow-y-auto pr-1">
            {machineFleet.length > 0 ? (
              machineFleet.map((m: any) => {
                const isBroken = m.operational_status === 'BROKEN' || Boolean(m.active_ndp);
                const isMaint = m.operational_status === 'MAINTENANCE';
                const isInUse = m.operational_status === 'IN_USE';

                return (
                  <div key={m.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isBroken ? 'bg-rose-100 text-rose-600' :
                        isMaint ? 'bg-amber-100 text-amber-600' :
                        isInUse ? 'bg-blue-100 text-blue-600' :
                        'bg-emerald-100 text-emerald-600'
                      }`}>
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-stone-900">{m.item_code}</span>
                          <span className="font-bold text-stone-800 truncate">{m.name}</span>
                          {m.machine_category && (
                            <span className="text-[10px] font-medium bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
                              {m.machine_category}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone-500 mt-0.5">
                          {m.active_assignment 
                            ? `Bound to: ${m.active_assignment.project_name} (${m.active_assignment.process_name})`
                            : m.capacity_per_hour ? `Capacity: ${m.capacity_per_hour} units/hr` : "Standby / Unallocated"}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                        isBroken ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        isMaint ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        isInUse ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {isBroken ? 'BROKEN / NDP' : m.operational_status}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-stone-400">No machine assets configured.</div>
            )}
          </div>
        </div>

        {/* Top Bottlenecks & Incidents (1 col) */}
        <div className="space-y-6">
          {/* Active Incidents & NDPs */}
          <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-black text-stone-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" /> Active Downtime Incidents
            </h3>

            {activeNdpsList.length > 0 ? (
              <div className="space-y-2.5">
                {activeNdpsList.map((n: any) => (
                  <div key={n.id} className="p-3 bg-rose-50 border border-rose-200 rounded-2xl space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-rose-900">{n.ndp_number} • {n.reason_category}</div>
                        <p className="text-[11px] text-rose-700 mt-0.5">{n.reason_detail}</p>
                      </div>
                      <span className="text-[9px] font-bold bg-rose-200 text-rose-800 px-2 py-0.5 rounded">
                        {n.severity || 'HIGH'}
                      </span>
                    </div>
                    {n.machine_name && (
                      <p className="text-[10px] font-mono text-rose-800 font-bold">
                        Machine: [{n.machine_code || "M"}] {n.machine_name}
                      </p>
                    )}
                    <Button
                      size="sm"
                      onClick={() => handleResolveNdp(n.id)}
                      className="w-full h-7 text-[11px] bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl"
                    >
                      Resolve & Unblock
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-stone-400 flex flex-col items-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-1" />
                <span>All lines operational (No active NDPs)</span>
              </div>
            )}
          </div>

          {/* Top Bottlenecks */}
          <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-3">
            <h3 className="text-sm font-black text-stone-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-600" /> WIP Bottleneck Stations
            </h3>
            {bottlenecks.length > 0 ? (
              <div className="divide-y divide-stone-100">
                {bottlenecks.map((b: any, idx: number) => (
                  <div key={idx} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-bold text-stone-800">{b.station_name}</span>
                    <span className="font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                      {b.total_wip_qty} units ({b.wot_count} WOTs)
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-stone-400 text-center py-3">No backlog detected.</div>
            )}
          </div>
        </div>
      </div>

      {/* OEE & WIP Modal */}
      {selectedProjectForOee && (
        <ProductionOeeWipModal
          isOpen={Boolean(selectedProjectForOee)}
          onClose={() => setSelectedProjectForOee(null)}
          projectId={selectedProjectForOee.id}
          projectName={selectedProjectForOee.name}
          targetQty={selectedProjectForOee.qty}
          uom={selectedProjectForOee.uom}
        />
      )}
      
    </div>
  );
}
