import React, { useState, useEffect } from "react";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ArrowRight,
  TrendingUp,
  Percent,
  RefreshCw,
  Zap,
  ShieldCheck,
  AlertCircle,
  FileSpreadsheet
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";

interface Props {
  projectId: string;
  projectName?: string;
  targetQty?: number;
  uom?: string;
}

export function ProductionOeeWipView({ projectId, projectName, targetQty = 100, uom = "UNIT" }: Props) {
  const { showToast } = useToast();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"OEE" | "WIP" | "HISTORY" | "DOWNTIME">("OEE");

  const loadData = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/production/projects/${projectId}/oee-wip`);
      if (res.ok) {
        setData(res);
      } else {
        throw new Error(res.error || "Failed to load OEE & WIP data");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  if (isLoading && !data) {
    return (
      <div className="py-12 flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 text-stone-400 animate-spin" />
        <p className="text-xs text-stone-500 font-medium">Calculating OEE metrics and aggregating WIP pipeline...</p>
      </div>
    );
  }

  const oee = data?.oee || {
    availability: 100,
    performance: 85,
    quality: 100,
    overall: 85,
    planned_hours: 0,
    downtime_hours: 0,
    good_qty: 0,
    scrap_qty: 0,
    total_qty: 0
  };

  const wipBreakdown: any[] = data?.wip_breakdown || [];
  const history: any[] = data?.history || [];
  const ndps: any[] = data?.ndps || [];

  // Identify bottleneck station (station with highest active WIP)
  const bottleneck = [...wipBreakdown].sort((a, b) => (b.wip_qty || 0) - (a.wip_qty || 0))[0];

  const getOeeGrade = (score: number) => {
    if (score >= 85) return { text: "World Class (≥85%)", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    if (score >= 70) return { text: "Good (70-84%)", color: "text-blue-700 bg-blue-50 border-blue-200" };
    if (score >= 50) return { text: "Acceptable (50-69%)", color: "text-amber-700 bg-amber-50 border-amber-200" };
    return { text: "Needs Attention (<50%)", color: "text-rose-700 bg-rose-50 border-rose-200" };
  };

  const oeeGrade = getOeeGrade(oee.overall);

  return (
    <div className="space-y-6">
      {/* Header controls & tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-0 border-b border-stone-200">
        <div className="flex items-center gap-3 pb-3">
          <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${oeeGrade.color}`}>
            {oeeGrade.text}
          </span>
          <p className="text-sm text-stone-500 hidden md:block">
            Real-time shopfloor analytics and tracking
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setActiveTab("OEE")}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "OEE" ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              OEE Analysis
            </button>
            <button
              onClick={() => setActiveTab("WIP")}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "WIP" ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              WIP Pipeline ({wipBreakdown.length})
            </button>
            <button
              onClick={() => setActiveTab("DOWNTIME")}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "DOWNTIME" ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              Downtime ({ndps.length})
            </button>
            <button
              onClick={() => setActiveTab("HISTORY")}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "HISTORY" ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              Audit Log ({history.length})
            </button>
          </div>
          <div className="pb-3 pl-2 border-l border-stone-200">
            <Button
              size="sm"
              variant="secondary"
              onClick={loadData}
              disabled={isLoading}
              className="h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Tab: OEE Cockpit */}
      {activeTab === "OEE" && (
        <div className="space-y-6">
          {/* Main 4 OEE Gauge Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Overall OEE Card */}
            <div className="p-5 bg-white border border-stone-200 rounded-xl shadow-none flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Total OEE</span>
                <Activity className="w-4 h-4 text-stone-400" />
              </div>
              <div className="my-4">
                <div className="text-3xl font-semibold tracking-tight text-stone-900">{oee.overall}%</div>
                <p className="text-xs text-stone-500 mt-1">Availability × Performance × Quality</p>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-stone-800 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, oee.overall)}%` }}
                />
              </div>
            </div>

            {/* Availability Card */}
            <div className="p-5 bg-white border border-stone-200 rounded-xl shadow-none flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Availability</span>
                <Clock className="w-4 h-4 text-stone-400" />
              </div>
              <div className="my-3">
                <div className="text-2xl font-semibold text-stone-900">{oee.availability}%</div>
                <div className="text-xs text-stone-500 mt-1 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Planned Time:</span>
                    <span className="font-medium text-stone-700">{oee.planned_hours}h</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>NDP Downtime:</span>
                    <span className="font-medium">-{oee.downtime_hours}h</span>
                  </div>
                </div>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, oee.availability)}%` }}
                />
              </div>
            </div>

            {/* Performance Card */}
            <div className="p-5 bg-white border border-stone-200 rounded-xl shadow-none flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Performance</span>
                <Zap className="w-4 h-4 text-stone-400" />
              </div>
              <div className="my-3">
                <div className="text-2xl font-semibold text-stone-900">{oee.performance}%</div>
                <div className="text-xs text-stone-500 mt-1 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Factory Factor:</span>
                    <span className="font-medium text-stone-700">{oee.performance}%</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Cycle Efficiency:</span>
                    <span className="font-medium">Rated</span>
                  </div>
                </div>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, oee.performance)}%` }}
                />
              </div>
            </div>

            {/* Quality Card */}
            <div className="p-5 bg-white border border-stone-200 rounded-xl shadow-none flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Quality (Yield)</span>
                <ShieldCheck className="w-4 h-4 text-stone-400" />
              </div>
              <div className="my-3">
                <div className="text-2xl font-semibold text-stone-900">{oee.quality}%</div>
                <div className="text-xs text-stone-500 mt-1 space-y-0.5">
                  <div className="flex justify-between text-stone-700">
                    <span>Good Units:</span>
                    <span className="font-medium">{oee.good_qty} {uom}</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Scrap Rejects:</span>
                    <span className="font-medium">{oee.scrap_qty} {uom}</span>
                  </div>
                </div>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, oee.quality)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Highlights Banner */}
          {bottleneck && bottleneck.wip_qty > 0 && (
            <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-semibold text-amber-900 block">Identified WIP Bottleneck: {bottleneck.process_name}</span>
                <span className="text-amber-800 mt-1 block">
                  Workstation <span className="font-semibold">{bottleneck.station_name || "Unassigned"}</span> currently holds {bottleneck.wip_qty} {uom} across {bottleneck.total_wots_at_station} lot(s). Prioritize operator allocation to this station to clear the backlog.
                </span>
              </div>
            </div>
          )}

          {/* Quick Summary of WIP Pipeline */}
          <div className="p-6 bg-white border border-stone-200 rounded-xl space-y-4">
            <h4 className="text-sm font-semibold text-stone-900">Active Workstation Summary</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {wipBreakdown.map((step: any) => (
                <div key={step.step_id} className="p-4 bg-stone-50/50 border border-stone-200 rounded-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-medium tracking-wider uppercase text-stone-500">
                      Step {step.step_number}
                    </span>
                    <span className="text-xs font-medium text-stone-600">
                      {step.completed_qty} / {targetQty} {uom}
                    </span>
                  </div>
                  <div>
                    <h5 className="font-semibold text-stone-900 text-sm truncate">{step.process_name}</h5>
                    <p className="text-xs text-stone-500 mt-1">{step.station_name || "Station"}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-stone-200 flex items-center justify-between text-xs">
                    <span className="text-stone-500">Active WIP:</span>
                    <span className={`font-semibold ${step.wip_qty > 0 ? "text-blue-700" : "text-stone-400"}`}>
                      {step.wip_qty} {uom} ({step.total_wots_at_station} lots)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: WIP Pipeline */}
      {activeTab === "WIP" && (
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 rounded-xl p-6">
            <h4 className="text-sm font-semibold text-stone-900 mb-1">Process Routing & WIP Pipeline</h4>
            <p className="text-sm text-stone-500 mb-6">Detailed status of units in progress and completed at each routing stage</p>

            <div className="space-y-4">
              {wipBreakdown.map((step: any, idx: number) => {
                const completedPct = targetQty > 0 ? Math.min(100, Math.round((step.completed_qty / targetQty) * 100)) : 0;
                const isBottleneck = bottleneck && bottleneck.step_id === step.step_id && step.wip_qty > 0;

                return (
                  <div
                    key={step.step_id}
                    className={`p-5 rounded-xl border ${
                      isBottleneck ? "border-amber-200 bg-amber-50/30" : "border-stone-200 bg-stone-50/40"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                      <div className="flex items-center gap-4">
                        <span className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200 text-stone-700 flex items-center justify-center font-medium text-xs">
                          {step.step_number || idx + 1}
                        </span>
                        <div>
                          <h5 className="font-semibold text-stone-900 text-sm flex items-center gap-2">
                            {step.process_name}
                            {isBottleneck && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-amber-100 text-amber-800">
                                Bottleneck
                              </span>
                            )}
                          </h5>
                          <p className="text-xs text-stone-500 mt-0.5">
                            Station: {step.station_name} {step.machine_name ? `• Machine: ${step.machine_name}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-8 text-sm">
                        <div>
                          <span className="text-stone-500 block text-[10px] uppercase tracking-wider mb-0.5">Active WIP</span>
                          <span className="font-semibold text-blue-600">{step.wip_qty} {uom}</span>
                        </div>
                        <div>
                          <span className="text-stone-500 block text-[10px] uppercase tracking-wider mb-0.5">Completed</span>
                          <span className="font-semibold text-stone-900">{step.completed_qty} {uom}</span>
                        </div>
                        <div>
                          <span className="text-stone-500 block text-[10px] uppercase tracking-wider mb-0.5">Scrap</span>
                          <span className="font-semibold text-rose-600">{step.scrap_qty} {uom}</span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden mt-4">
                      <div
                        className="bg-stone-800 h-full rounded-full transition-all duration-300"
                        style={{ width: `${completedPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Downtime / NDPs */}
      {activeTab === "DOWNTIME" && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-stone-900">Notice to Down Process (NDP) & Breakdown Events</h4>
              <p className="text-sm text-stone-500 mt-1">All registered machine and workstation stoppages affecting this project</p>
            </div>
            <span className="text-xs font-medium text-rose-700 bg-rose-50 px-3 py-1.5 rounded-md border border-rose-100">
              Total Downtime: {oee.downtime_hours} hrs
            </span>
          </div>

          {ndps.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="w-12 h-12 text-stone-300 mb-3" />
              <h5 className="text-sm font-medium text-stone-900">Zero Breakdown Incidents</h5>
              <p className="text-sm text-stone-500 max-w-sm mt-1">No machine stops or NDP downtime recorded for this project.</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100 mt-4 border-t border-stone-100">
              {ndps.map((n: any) => (
                <div key={n.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-sm text-stone-900">{n.ndp_number}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                          n.status === "ACTIVE"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {n.status}
                      </span>
                      <span className="text-xs font-medium text-stone-600">{n.reason_category}</span>
                    </div>
                    <p className="text-sm text-stone-500">{n.reason_detail}</p>
                    <p className="text-xs text-stone-400">
                      Machine: {n.machine_name || "Unspecified"} • Station: {n.station_name || "Floor"}
                    </p>
                  </div>
                  <div className="text-right text-sm text-stone-500">
                    <div>Duration: <span className="font-medium text-stone-900">{Number(n.downtime_hours || 0).toFixed(1)} hrs</span></div>
                    <div className="text-xs text-stone-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Full Audit History */}
      {activeTab === "HISTORY" && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-stone-900">WOT Completion Audit Trail</h4>
              <p className="text-sm text-stone-500 mt-1">Genealogy ledger of every completed scan event</p>
            </div>
            <span className="text-sm text-stone-500 font-medium">{history.length} events logged</span>
          </div>

          {history.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <Clock className="w-12 h-12 text-stone-300 mb-3" />
              <h5 className="text-sm font-medium text-stone-900">No History Recorded Yet</h5>
              <p className="text-sm text-stone-500 max-w-sm mt-1">
                Scan events logged from the Shop Floor Terminal will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto mt-4 border border-stone-200 rounded-xl">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-medium text-xs uppercase tracking-wider">
                    <th className="px-4 py-3">Lot Number</th>
                    <th className="px-4 py-3">Process / Station</th>
                    <th className="px-4 py-3">Operator</th>
                    <th className="px-4 py-3 text-center">Yield Qty</th>
                    <th className="px-4 py-3 text-center">Scrap Qty</th>
                    <th className="px-4 py-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {history.map((h: any) => (
                    <tr key={h.id} className="hover:bg-stone-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-stone-900">{h.lot_number}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-stone-800">{h.process_name}</span>
                        <span className="text-xs text-stone-500 block mt-0.5">{h.station_name}</span>
                      </td>
                      <td className="px-4 py-3 text-stone-600">{h.operator_name || "Operator"}</td>
                      <td className="px-4 py-3 text-center font-medium text-stone-900">+{h.qty}</td>
                      <td className="px-4 py-3 text-center font-medium text-stone-500">
                        {h.scrap_qty > 0 ? `-${h.scrap_qty}` : "0"}
                      </td>
                      <td className="px-4 py-3 text-right text-stone-500 text-xs">
                        {new Date(h.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
