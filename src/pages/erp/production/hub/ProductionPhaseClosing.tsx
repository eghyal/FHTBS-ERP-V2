import React from "react";
import { useProductionHubStore } from "@/stores/productionHubStore";
import { useProductionStore } from "@/stores/productionStore";
import { PackageCheck, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProductionOeeWipView } from "@/components/erp/ProductionOeeWipView";

export function ProductionPhaseClosing({ actions, user }: { actions: any, user: any }) {
  const store = useProductionHubStore();
  const {
    factoryFactor,
    project,
    setShowFgrModal,
    isFinishing
  } = store;
  
  const safeWots = Array.isArray(store.wots) ? store.wots : [];
  const completedWots = safeWots.filter(w => w.status === 'COMPLETED');
  const actualOutputQty = completedWots.reduce((sum, w) => sum + (w.qty || 0), 0);
  const targetQty = project?.qty || 1;

  const {
    handleFinishProject = () => {}
  } = actions || {};

  const rawBopSteps = useProductionStore(state => state.bopData);
  const safeBopSteps = Array.isArray(rawBopSteps) ? rawBopSteps : [];

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

  const completedCount = actions?.completedCount ?? processSteps.filter((s: any) => s && s.status === "COMPLETED").length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-stone-900">Project Production Closing & Stock Inbound</h2>
            <p className="text-xs text-stone-500">Final production verification, Finished Goods Record (FGR), and warehouse stock receipt</p>
          </div>
          {(project?.status === "COMPLETED" || project?.status === "FINISHED") ? (
            <Button onClick={() => setShowFgrModal(true)} variant="secondary" size="sm" className="font-bold text-xs h-9">
              <PackageOpen className="w-4 h-4 mr-1.5 text-stone-600" /> View FGR
            </Button>
          ) : (
            <Button
              onClick={handleFinishProject}
              disabled={isFinishing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10 px-6 rounded-xl shadow-sm"
            >
              <PackageCheck className="w-4 h-4 mr-2" />
              {isFinishing ? "Finishing & Inbounding..." : "Finish Project & Inbound Stock"}
            </Button>
          )}
        </div>

        {/* Summary Statistics Matrix */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 block">Completed WOTs</span>
            <span className="text-xl font-black text-stone-900">{completedWots.length} Lots</span>
          </div>
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 block">Completed Workstations</span>
            <span className="text-xl font-black text-emerald-700">{completedCount} / {processSteps.length}</span>
          </div>
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 block">Actual Output Qty</span>
            <span className="text-xl font-black text-stone-900">{actualOutputQty} / {targetQty} {project?.uom || "UNIT"}</span>
          </div>
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 block">Factory Factor</span>
            <span className="text-xl font-black text-stone-900">{factoryFactor || 85}% Efficiency</span>
          </div>
        </div>
      </div>

      {/* Comprehensive OEE & WIP Analytics Section */}
      {project?.id && (
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs">
          <ProductionOeeWipView
            projectId={project.id}
            projectName={project.name}
            targetQty={targetQty}
            uom={project.uom || "UNIT"}
          />
        </div>
      )}
    </div>
  );
}
