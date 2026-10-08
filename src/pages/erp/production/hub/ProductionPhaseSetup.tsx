import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProductionHubStore } from "@/stores/productionHubStore";
import { useProductionStore } from "@/stores/productionStore";
import { 
  Layers, Lock, Package, Users, Save, Edit3, X, Clock, 
  ShieldCheck, Wrench, Box, Zap, Plus, Trash2, CheckCircle2,
  AlertTriangle, Settings2, Cpu, Share2
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { ProcessMachineModal } from "@/components/erp/production/ProcessMachineModal";

export function ProductionPhaseSetup({ actions, user }: { actions: any; user: any }) {
  const navigate = useNavigate();
  const store = useProductionHubStore();
  const { showToast } = useToast();
  const rawBopSteps = useProductionStore(state => state.bopData);
  const safeBopSteps = Array.isArray(rawBopSteps) ? rawBopSteps : [];
  
  const [editingStation, setEditingStation] = useState<any | null>(null);
  const [reassigningProcessId, setReassigningProcessId] = useState<string | null>(null);
  const [bypassMachine, setBypassMachine] = useState<Record<string, boolean>>({});
  const [selectedProcessForMachineModal, setSelectedProcessForMachineModal] = useState<any | null>(null);
  const [showMachineModal, setShowMachineModal] = useState(false);

  const {
    handleUpdateCycleTimeInline = () => {},
    handleLockMaster = () => {},
    handleUnlockMaster = () => {},
    fetchData = () => {},
  } = actions || {};

  const handleReassignProcessStation = async (processId: string, targetStationId: string) => {
    try {
      setReassigningProcessId(processId);
      const res = await apiFetch(`/api/production/bop/${processId}/station`, {
        method: "PUT",
        body: JSON.stringify({ station_id: targetStationId || null })
      });
      if (res.ok) {
        showToast("Process workstation updated successfully", "success");
        if (actions?.fetchData) {
          await actions.fetchData(true);
        }
      } else {
        showToast(res.data?.error || "Failed to update process workstation", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to update process workstation", "error");
    } finally {
      setReassigningProcessId(null);
    }
  };

  const isMasterSet = actions?.isMasterSet ?? Boolean(store.project?.is_master_set);
  
  const processSteps = React.useMemo(() => {
    if (actions?.processSteps && actions.processSteps.length > 0) {
      return actions.processSteps;
    }
    return safeBopSteps
      .filter((s: any) => {
        if (!s) return false;
        const nodeType = String(s.node_type || "").toUpperCase();
        if (nodeType === "PRODUCT" || nodeType === "START" || nodeType === "END") return false;
        const name = s.process_name || s.step_name || s.name || s.task_name;
        return Boolean(name && String(name).trim() !== "");
      })
      .map((s: any, idx: number) => ({
        ...s,
        id: s.id || `bop_${idx}`,
        process_name: s.process_name || s.step_name || s.name || s.task_name || `Process ${idx + 1}`,
        step_sequence: s.step_sequence ?? (idx + 1),
        cycle_time_minutes: s.cycle_time_minutes || (s.cycle_time_seconds ? Math.round(s.cycle_time_seconds / 60) : 0) || Math.round((Number(s.standard_hours) || 1) * 60) || 60,
        standard_hours: s.standard_hours || (s.cycle_time_minutes ? Number((s.cycle_time_minutes / 60).toFixed(2)) : 1.0),
        node_type: s.node_type || "PROCESS"
      }));
  }, [actions?.processSteps, safeBopSteps]);

  const {
    factoryFactor, setFactoryFactor,
    isSettingMaster,
    stations: rawStations,
    itemsCatalog,
    editingCtStepId, setEditingCtStepId,
    editingCtValue, setEditingCtValue,
    stationEtas, cpmData
  } = store;

  const stations = Array.isArray(rawStations) ? rawStations : [];
  const machines = Array.isArray(itemsCatalog) ? itemsCatalog.filter((i: any) => i.type === 'MACHINE' || i.category === 'MACHINE' || i.item_type === 'MACHINE' || i.machine_category !== null || i.capacity_per_hour !== null) : [];

  // Group processes by station
  const { stationList, unassignedProcesses } = React.useMemo(() => {
    const listMap = new Map();

    stations.forEach((s: any, idx: number) => {
      if (s && s.id) {
        listMap.set(s.id, {
          id: s.id,
          station_code: s.station_code || `ST-${String(s.station_sequence || idx + 1).padStart(2, '0')}`,
          station_name: s.station_name || s.name || "Station",
          station_sequence: s.station_sequence ?? (idx + 1),
          work_center: s.work_center || "Factory Floor",
          
          working_hours: s.working_hours || 8.0,
          processes: []
        });
      }
    });

    const unassigned: any[] = [];

    processSteps.forEach((step: any, idx: number) => {
      let targetStationId: string | null = null;
      if (step.station_id && listMap.has(step.station_id)) {
        targetStationId = step.station_id;
      } else if (step.station_id) {
        const match = stations.find((s: any) => 
          s.id === step.station_id || 
          (s.station_code && String(s.station_code).trim().toLowerCase() === String(step.station_id).trim().toLowerCase()) ||
          (s.station_name && String(s.station_name).trim().toLowerCase() === String(step.station_id).trim().toLowerCase())
        );
        if (match) targetStationId = match.id;
      } else if (step.station_name || step.station_code) {
        const match = stations.find((s: any) => 
          (s.station_code && String(s.station_code).trim().toLowerCase() === String(step.station_code || '').trim().toLowerCase()) ||
          (s.station_name && String(s.station_name).trim().toLowerCase() === String(step.station_name || '').trim().toLowerCase())
        );
        if (match) targetStationId = match.id;
      }

      if (targetStationId && listMap.has(targetStationId)) {
        listMap.get(targetStationId).processes.push({
          ...step,
          station_id: targetStationId
        });
      } else {
        if (stations.length === 0) {
          const fallbackId = step.station_id || step.id;
          if (!listMap.has(fallbackId)) {
            listMap.set(fallbackId, {
              id: fallbackId,
              station_code: step.station_code || `ST-${String(idx + 1).padStart(2, '0')}`,
              station_name: step.station_name || step.process_name || "Station",
              station_sequence: idx + 1,
              work_center: step.work_center || "Factory Floor",
              
              working_hours: 8.0,
              processes: [step]
            });
          } else {
            listMap.get(fallbackId).processes.push(step);
          }
        } else {
          unassigned.push(step);
        }
      }
    });

    return {
      stationList: Array.from(listMap.values()).sort((a: any, b: any) => (a.station_sequence || 0) - (b.station_sequence || 0)),
      unassignedProcesses: unassigned
    };
  }, [stations, processSteps]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-6 border border-stone-200 dark:border-stone-800 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-stone-100 dark:border-stone-800">
          <div>
            <h2 className="text-lg font-black text-stone-900 dark:text-stone-100">
              Station & Machine Assignment Setup
            </h2>
            <p className="text-xs text-stone-500">
              Configure Station Clusters, Assign Machines with Process Eligibility, and Lock Master Data
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700">
              <span className="text-xs font-bold text-stone-700 dark:text-stone-300">Factory Factor:</span>
              <input
                type="number"
                min={10}
                max={100}
                value={factoryFactor || 85}
                onChange={(e) => setFactoryFactor(Number(e.target.value))}
                className="w-16 px-2 py-0.5 text-xs font-black text-center border border-stone-300 rounded-lg bg-white dark:bg-stone-900 focus:outline-hidden focus:ring-2 focus:ring-stone-900"
              />
              <span className="text-xs font-bold text-stone-500">%</span>
            </div>

            {isMasterSet ? (
              <Button
                onClick={handleUnlockMaster}
                variant="secondary"
                size="sm"
                className="bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 font-black text-xs h-9 rounded-xl"
              >
                <Lock className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> Master Data Locked
              </Button>
            ) : (
              <Button
                onClick={handleLockMaster}
                disabled={isSettingMaster || processSteps.length === 0}
                className="bg-stone-900 hover:bg-stone-800 text-white font-black text-xs h-9 rounded-xl px-4"
              >
                <Lock className="w-3.5 h-3.5 mr-1.5" /> Lock & Freeze Master Data
              </Button>
            )}
          </div>
        </div>

        {/* Unassigned BOP Processes Banner if any */}
        {unassignedProcesses.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h4 className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                Unassigned BOP Processes ({unassignedProcesses.length})
              </h4>
              <span className="text-[11px] text-amber-700 dark:text-amber-300">
                These processes are not mapped to any station. Assign them to a workstation for production logging.
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {unassignedProcesses.map((p: any) => (
                <div key={p.id} className="p-3 bg-white dark:bg-stone-900 border border-amber-200 dark:border-amber-800/80 rounded-xl flex items-center justify-between gap-2 shadow-2xs">
                  <div className="min-w-0">
                    <span className="font-bold text-stone-900 dark:text-stone-100 block text-xs truncate">
                      {p.process_name}
                    </span>
                    <span className="text-[10px] text-stone-500 font-mono">
                      Step #{p.step_sequence || 1} • {p.cycle_time_minutes || 60} min
                    </span>
                  </div>
                  <select
                    disabled={reassigningProcessId === p.id}
                    value=""
                    onChange={(e) => handleReassignProcessStation(p.id, e.target.value)}
                    className="text-xs font-bold px-2.5 py-1 rounded-lg bg-stone-900 text-white hover:bg-stone-800 cursor-pointer shadow-2xs shrink-0"
                  >
                    <option value="" disabled>Assign Station...</option>
                    {stationList.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        #{s.station_sequence} {s.station_name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Station Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stationList.map((station: any, idx: number) => {
            const etaObj = Array.isArray(stationEtas) ? stationEtas.find((e: any) => e.station_id === station.id) : null;

            return (
              <div
                key={station.id}
                className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 flex flex-col justify-between space-y-4 hover:border-stone-400 transition-colors shadow-2xs"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-stone-200 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-mono font-black text-[11px] rounded">
                        #{station.station_sequence || idx + 1}
                      </span>
                      <div>
                        <h3 className="text-xs font-black text-stone-900 dark:text-stone-100">
                          {station.station_name}
                        </h3>
                        <span className="text-[10px] text-stone-500 font-mono">{station.station_code} • {station.work_center}</span>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono font-bold bg-white dark:bg-stone-800 px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-700">
                      {station.working_hours}h/day
                    </span>
                  </div>

                  {/* Processes Mapped to this Station (Dashed border per spec) */}
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 block">
                        Mapped BOP Processes ({station.processes.length})
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {station.processes.length === 0 ? (
                        <div className="p-3 bg-white dark:bg-stone-900 border border-dashed border-stone-300 dark:border-stone-700 rounded-xl text-center">
                          <p className="text-[11px] text-stone-400 italic">No processes mapped to this workstation yet.</p>
                        </div>
                      ) : (
                        station.processes.map((p: any) => (
                          <div
                            key={p.id}
                            className="p-2.5 bg-white dark:bg-stone-900 border border-dashed border-stone-300 dark:border-stone-700 rounded-xl space-y-2 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-stone-800 dark:text-stone-200 truncate max-w-[140px]" title={p.process_name}>
                                #{p.step_sequence || 1} {p.process_name}
                              </span>
                              
                              {/* Station Reassignment Dropdown */}
                              <select
                                value={station.id}
                                disabled={reassigningProcessId === p.id}
                                onChange={(e) => handleReassignProcessStation(p.id, e.target.value)}
                                className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 hover:border-stone-400 cursor-pointer transition-colors shrink-0"
                                title="Change workstation for this process"
                              >
                                <option value={station.id}>Station: {station.station_code}</option>
                                {stationList.filter((s: any) => s.id !== station.id).map((other: any) => (
                                  <option key={other.id} value={other.id}>
                                    Move to #{other.station_sequence} ({other.station_code})
                                  </option>
                                ))}
                                <option value="">Move to Unassigned</option>
                              </select>
                            </div>

                            <div className="pt-2 mt-2 border-t border-stone-100 dark:border-stone-800 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1">
                                  <Cpu className="w-3 h-3 text-blue-600"/> Machine
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedProcessForMachineModal(p);
                                    setShowMachineModal(true);
                                  }}
                                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 flex items-center gap-1 hover:underline cursor-pointer"
                                  title="Configure Machine, Alternatives & Timing"
                                >
                                  <Settings2 className="w-3 h-3" />
                                  Config
                                </button>
                              </div>

                              <div className="flex items-center gap-2">
                                <select
                                  value={p.assigned_machine_id || ""}
                                  onChange={async (e) => {
                                    try {
                                      await apiFetch(`/api/production/bop/${p.id}/machine`, {
                                        method: "PUT",
                                        body: JSON.stringify({ 
                                          machine_id: e.target.value || null, 
                                          force_bypass: !!bypassMachine[p.id] 
                                        })
                                      });
                                      if (actions?.fetchData) actions.fetchData(true);
                                    } catch (err: any) {
                                      showToast(err.message || "Failed to assign machine", "error");
                                    }
                                  }}
                                  className="w-full text-[10px] font-bold px-1.5 py-1 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 cursor-pointer truncate"
                                >
                                  <option value="">No Machine (Manual)</option>
                                  {machines.map((m: any) => (
                                    <option key={m.id} value={m.id}>
                                      {m.item_code || m.name} ({m.machine_category || "GEN"} • {m.capacity_per_hour || 0}/hr)
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {p.assigned_machine_id && (
                                <div className="text-[9px] text-stone-500 font-mono flex items-center justify-between px-1">
                                  <span>Setup: {p.setup_time_minutes || 0}m • Teardown: {p.teardown_time_minutes || 0}m</span>
                                  {p.alternative_machine_ids && p.alternative_machine_ids !== "[]" && (
                                    <span className="text-blue-600 font-bold">Has Alts</span>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-stone-100 dark:border-stone-800">
                              <span className="text-[10px] text-stone-400 font-mono">Cycle Time</span>
                              {editingCtStepId === p.id ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={1}
                                    autoFocus
                                    value={editingCtValue}
                                    onChange={(e) => setEditingCtValue(Number(e.target.value))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleUpdateCycleTimeInline(p.id, editingCtValue);
                                      if (e.key === 'Escape') setEditingCtStepId(null);
                                    }}
                                    className="w-16 px-2 py-0.5 text-xs font-mono font-bold border border-stone-400 rounded bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-2xs"
                                  />
                                  <span className="text-[10px] font-mono text-stone-400">min</span>
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateCycleTimeInline(p.id, editingCtValue)}
                                    className="h-6 px-2 text-[10px] font-bold bg-stone-900 hover:bg-stone-800 text-white rounded shadow-2xs"
                                  >
                                    Save
                                  </Button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingCtStepId(null)}
                                    className="text-[10px] text-stone-400 hover:text-stone-600 px-1"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCtStepId(p.id);
                                    setEditingCtValue(p.cycle_time_minutes || 60);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 transition-colors font-mono text-[10px] font-bold cursor-pointer group"
                                  title="Click to edit cycle time for this process"
                                >
                                  <Clock className="w-3 h-3 text-stone-400 group-hover:text-stone-700 transition-colors" />
                                  <span>{p.cycle_time_minutes || 60} min/pc</span>
                                  <span className="text-[9px] font-sans text-stone-400 opacity-60 group-hover:opacity-100 uppercase tracking-tight">Edit</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>


                </div>

                {/* Station Lead Time Footer */}
                {etaObj && (
                  <div className="pt-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between text-[11px] font-mono text-stone-500">
                    <span>Est. Lead Time:</span>
                    <span className="font-bold text-stone-900 dark:text-stone-100">
                      {etaObj.leadTimeDays} Days ({etaObj.leadTimeMinutes} min)
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>


      {/* Process Machine & Timing Modal */}
      <ProcessMachineModal
        isOpen={showMachineModal}
        onClose={() => setShowMachineModal(false)}
        process={selectedProcessForMachineModal}
        machines={machines}
        onSuccess={() => {
          if (actions?.fetchData) actions.fetchData(true);
        }}
      />
    </div>
  );
}
