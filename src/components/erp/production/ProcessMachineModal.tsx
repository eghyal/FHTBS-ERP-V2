import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Cpu, Clock, Timer, Wrench, AlertCircle, ShieldAlert } from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";

interface ProcessMachineModalProps {
  isOpen: boolean;
  onClose: () => void;
  process: any | null;
  machines: any[];
  onSuccess: () => void;
}

export function ProcessMachineModal({
  isOpen,
  onClose,
  process,
  machines,
  onSuccess
}: ProcessMachineModalProps) {
  const { showToast } = useToast();
  const [assignedMachineId, setAssignedMachineId] = useState("");
  const [altMachineIds, setAltMachineIds] = useState<string[]>([]);
  const [cycleTime, setCycleTime] = useState<number>(60);
  const [setupTime, setSetupTime] = useState<number>(0);
  const [teardownTime, setTeardownTime] = useState<number>(0);
  const [forceBypass, setForceBypass] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (process) {
      setAssignedMachineId(process.assigned_machine_id || "");
      let parsedAlts: string[] = [];
      try {
        if (typeof process.alternative_machine_ids === "string") {
          parsedAlts = JSON.parse(process.alternative_machine_ids);
        } else if (Array.isArray(process.alternative_machine_ids)) {
          parsedAlts = process.alternative_machine_ids;
        }
      } catch (e) {
        parsedAlts = [];
      }
      setAltMachineIds(parsedAlts);
      setCycleTime(process.cycle_time_minutes || 60);
      setSetupTime(process.setup_time_minutes || 0);
      setTeardownTime(process.teardown_time_minutes || 0);
      setForceBypass(false);
    }
  }, [process]);

  if (!isOpen || !process) return null;

  const selectedMachine = machines.find((m) => m.id === assignedMachineId);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiFetch(`/api/production/bop/${process.id}/machine`, {
        method: "PUT",
        body: JSON.stringify({
          machine_id: assignedMachineId || null,
          alternative_machine_ids: altMachineIds,
          cycle_time_minutes: cycleTime,
          setup_time_minutes: setupTime,
          teardown_time_minutes: teardownTime,
          force_bypass: forceBypass
        })
      });
      showToast(`Machine configuration updated for ${process.process_name}`, "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || "Failed to update machine assignment", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAltMachine = (id: string) => {
    setAltMachineIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Machine & Timing — ${process.process_name}`}
      description="Configure primary machine, alternatives, and duration parameters"
      maxWidth="lg"
    >
      <div className="p-6 space-y-6">
        {/* Primary Machine Assignment */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-blue-600" />
            Primary Machine <span className="text-rose-500">*</span>
          </label>
          <select
            value={assignedMachineId}
            onChange={(e) => setAssignedMachineId(e.target.value)}
            className="w-full px-3 py-2 text-sm font-medium border border-stone-300 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-2xs focus:ring-2 focus:ring-stone-900"
          >
            <option value="">-- No Machine Assigned (Manual Process) --</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.item_code} — {m.name} ({m.machine_category || "GEN"} • {m.capacity_per_hour || 0} pcs/hr)
                {m.bypass_multi_station ? " [Multi-Station Allowed]" : ""}
              </option>
            ))}
          </select>
          {selectedMachine && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-stone-500">Asset:</span>
                <span className="font-bold text-stone-900 dark:text-stone-100">{selectedMachine.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Category & Capacity:</span>
                <span className="font-mono text-blue-800 dark:text-blue-300 font-bold">
                  {selectedMachine.machine_category || "CUSTOM"} • {selectedMachine.capacity_per_hour || 0} units/hr
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Multi-Station Policy:</span>
                <span className={selectedMachine.bypass_multi_station ? "text-emerald-700 font-bold" : "text-amber-700 font-bold"}>
                  {selectedMachine.bypass_multi_station ? "Bypass Allowed (Multi-Station)" : "Hard Lock (Single Active Assignment)"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Alternative Machines (Optional) */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300">
            Alternative Machines (Standby / Redundancy)
          </label>
          <div className="max-h-32 overflow-y-auto border border-stone-200 dark:border-stone-700 rounded-xl p-2 space-y-1.5 custom-scrollbar bg-stone-50/50 dark:bg-stone-900/50">
            {machines
              .filter((m) => m.id !== assignedMachineId)
              .map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg text-xs cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={altMachineIds.includes(m.id)}
                    onChange={() => toggleAltMachine(m.id)}
                    className="rounded border-stone-300 accent-stone-900 w-3.5 h-3.5"
                  />
                  <span className="font-mono font-bold text-stone-700 dark:text-stone-300">{m.item_code}</span>
                  <span className="text-stone-500 truncate">{m.name}</span>
                </label>
              ))}
            {machines.filter((m) => m.id !== assignedMachineId).length === 0 && (
              <p className="text-xs text-stone-400 py-2 text-center">No additional machines available in catalog.</p>
            )}
          </div>
        </div>

        {/* Timings */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase text-stone-500 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-stone-400" />
              Cycle Time (min/pc)
            </label>
            <input
              type="number"
              min={1}
              value={cycleTime}
              onChange={(e) => setCycleTime(Math.max(1, Number(e.target.value)))}
              className="w-full px-3 py-2 text-sm font-mono font-bold border border-stone-300 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase text-stone-500 flex items-center gap-1">
              <Timer className="w-3.5 h-3.5 text-stone-400" />
              Setup Time (min)
            </label>
            <input
              type="number"
              min={0}
              value={setupTime}
              onChange={(e) => setSetupTime(Math.max(0, Number(e.target.value)))}
              className="w-full px-3 py-2 text-sm font-mono font-bold border border-stone-300 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase text-stone-500 flex items-center gap-1">
              <Wrench className="w-3.5 h-3.5 text-stone-400" />
              Teardown Time (min)
            </label>
            <input
              type="number"
              min={0}
              value={teardownTime}
              onChange={(e) => setTeardownTime(Math.max(0, Number(e.target.value)))}
              className="w-full px-3 py-2 text-sm font-mono font-bold border border-stone-300 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
            />
          </div>
        </div>

        {/* Force Bypass Checkbox */}
        <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400 cursor-pointer">
            <input
              type="checkbox"
              checked={forceBypass}
              onChange={(e) => setForceBypass(e.target.checked)}
              className="rounded border-stone-300 accent-stone-900 w-4 h-4"
            />
            <span>Override multi-station conflict (Super Admin Force Bypass)</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-3">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-stone-900 hover:bg-stone-800 text-white flex items-center gap-2"
          >
            <Cpu className="w-4 h-4" />
            {isSaving ? "Saving..." : "Apply Configuration"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
