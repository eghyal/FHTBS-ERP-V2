import React, { useState, useEffect } from "react";
import { Play, CheckCircle2, AlertTriangle, ShieldAlert, ShieldCheck, Users, Layers } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface BatchStartPreviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  stations: any[];
  activeNdps: any[];
  assignments: any[];
  onConfirmStart: (selectedStepIds: string[]) => Promise<void>;
  getIncompletePredecessors: (step: any) => string[];
  getAvailableInputWip: (step: any) => { availableQty: number; isStarved: boolean; bottleneckProcess: string };
}

export const BatchStartPreviewPanel: React.FC<BatchStartPreviewPanelProps> = ({
  isOpen,
  onClose,
  stations,
  activeNdps,
  assignments,
  onConfirmStart,
  getIncompletePredecessors,
  getAvailableInputWip
}) => {
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && stations.length > 0) {
      const initialSelection: Record<string, boolean> = {};
      stations.forEach((s) => {
        const incomplete = getIncompletePredecessors(s);
        const hasNdp = activeNdps.some((n) => n.bop_id === s.id && n.status === "ACTIVE");
        const hasOperator = assignments.some(
          (a) => (a.station_id === s.station_id || a.bop_id === s.id) && (a.status === 'ACTIVE' || a.status === 'SCHEDULED')
        );
        const isEligible = s.status !== "COMPLETED" && s.status !== "RUNNING" && incomplete.length === 0 && !hasNdp && hasOperator;
        initialSelection[s.id] = isEligible;
      });
      setSelectedIds(initialSelection);
    }
  }, [isOpen, stations, activeNdps, assignments]);

  if (!isOpen) return null;

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  const handleConfirm = async () => {
    const toStart = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    if (toStart.length === 0) return;
    try {
      setIsSubmitting(true);
      await onConfirmStart(toStart);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      contentClassName="p-0 overflow-hidden flex flex-col max-h-[85vh]"
      title={
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-stone-900 text-white rounded-2xl">
            <Play className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h3 className="text-base font-black text-stone-900">Batch Start Preview Window</h3>
            <p className="text-xs text-stone-500 font-medium">Review workstation prerequisites before line activation</p>
          </div>
        </div>
      }
    >
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Station Evaluation List */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3">

          {stations.map((step) => {
            const incompletePreds = getIncompletePredecessors(step);
            const hasNdp = activeNdps.some((n) => n.bop_id === step.id && n.status === "ACTIVE");
            const stepAssignments = assignments.filter(
              (a) => (a.station_id === step.station_id || a.bop_id === step.id) && (a.status === 'ACTIVE' || a.status === 'SCHEDULED')
            );
            const hasOperator = stepAssignments.length > 0;
            const wipInfo = getAvailableInputWip(step);

            const isAlreadyRunning = step.status === "RUNNING";
            const isCompleted = step.status === "COMPLETED";
            const isReady = !isAlreadyRunning && !isCompleted && incompletePreds.length === 0 && !hasNdp && hasOperator;

            return (
              <div
                key={step.id}
                onClick={() => isReady && handleToggle(step.id)}
                className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-4 cursor-pointer ${
                  selectedIds[step.id]
                    ? "bg-emerald-50/60 border-emerald-300 shadow-xs"
                    : isAlreadyRunning || isCompleted
                    ? "bg-stone-50/50 border-stone-200 opacity-60 cursor-not-allowed"
                    : "bg-white border-stone-200 hover:border-stone-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedIds[step.id])}
                    onChange={() => isReady && handleToggle(step.id)}
                    disabled={!isReady}
                    className="mt-1 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-stone-100 text-stone-600">
                        Step #{step.step_sequence || 1}
                      </span>
                      <h4 className="text-sm font-black text-stone-900">{step.process_name}</h4>
                    </div>

                    {/* Prerequisite Breakdown */}
                    <div className="flex items-center gap-3 mt-2 text-[11px]">
                      <span className={`flex items-center gap-1 font-bold ${hasOperator ? "text-emerald-700" : "text-amber-700"}`}>
                        <Users className="w-3.5 h-3.5" />
                        {hasOperator ? `${stepAssignments.length} Operator(s)` : "No Operator Assigned"}
                      </span>
                      <span className={`flex items-center gap-1 font-bold ${incompletePreds.length === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                        <Layers className="w-3.5 h-3.5" />
                        {incompletePreds.length === 0 ? "Prerequisites Ready" : `Waiting: ${incompletePreds.join(", ")}`}
                      </span>
                      {hasNdp && (
                        <span className="flex items-center gap-1 font-bold text-rose-700">
                          <ShieldAlert className="w-3.5 h-3.5" /> Downtime Active
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="shrink-0 text-right">
                  {isAlreadyRunning && (
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-[10px] font-black uppercase tracking-wider">
                      Running
                    </span>
                  )}
                  {isCompleted && (
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-black uppercase tracking-wider">
                      Completed
                    </span>
                  )}
                  {!isAlreadyRunning && !isCompleted && isReady && (
                    <span className="px-2.5 py-1 bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-2xs">
                      Ready to Start
                    </span>
                  )}
                  {!isAlreadyRunning && !isCompleted && !isReady && (
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg text-[10px] font-black uppercase tracking-wider">
                      Blocked
                    </span>
                  )}
                  <p className="text-[10px] text-stone-500 font-mono mt-1">Available WIP: {wipInfo.availableQty} pcs</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
          <p className="text-xs font-bold text-stone-600">
            Selected: <span className="text-stone-900 font-black">{selectedCount}</span> workstation(s)
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} variant="secondary" size="sm" className="text-xs font-bold">
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selectedCount === 0 || isSubmitting}
              size="sm"
              className="bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs"
            >
              {isSubmitting ? "Activating..." : `Activate ${selectedCount} Workstation(s)`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
