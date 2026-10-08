import React, { memo, useState, useRef, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  Clock,
  Users,
  ShieldCheck,
  Building2,
  Trash2,
  GitBranch,
  ArrowRight,
  Plus,
  Layers,
  Sparkles,
  Package,
  QrCode,
  ChevronDown,
  Workflow,
  RefreshCw,
  AlertTriangle,
  Wrench
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface BopNodeData extends Record<string, unknown> {
  id: string;
  step_sequence: number;
  process_name: string;
  node_type?: "PROCESS" | "PRODUCT";
  work_center_id?: string;
  work_center_name?: string;
  station_id?: string;
  station_name?: string;
  assigned_machine_id?: string;
  machine_code?: string;
  machine_name?: string;
  machine_category?: string;
  cycle_time_minutes?: number;
  is_unassigned_station?: boolean;
  sop_instruction?: string;
  qc_criteria?: string;
  notes?: string;
  bom_allocations?: { bom_id: string; fraction: number; bom_name?: string }[];
  stock_status?: "GREEN" | "YELLOW" | "RED";
  lifecycle_status?: string;
  expected_yield_rate?: number;
  is_dangling?: boolean;
  incomingCount: number;
  outgoingCount: number;
  isRoot: boolean;
  onAddChild?: (parentId: string, type?: "PROCESS" | "PRODUCT") => void;
  onAddParallel?: (siblingId: string, type?: "PROCESS" | "PRODUCT") => void;
  onDelete?: (id: string) => void;
  onSelectNode?: (id: string) => void;
}

export const BopFlowNode = memo(({ data, selected }: { data: BopNodeData; selected?: boolean }) => {
  const isProduct = data.node_type === "PRODUCT";
  const isParallelStart = !isProduct && data.incomingCount === 0;
  const isSerial = !isProduct && data.incomingCount === 1;
  const isJoinConvergence = !isProduct && data.incomingCount > 1;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as any)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  return (
    <div
      onClick={() => data.onSelectNode && data.onSelectNode(data.id)}
      className={cn(
        "relative bg-white border transition-all duration-200 cursor-pointer select-none text-left w-[290px] shadow-sm",
        isProduct
          ? `-skew-x-12 transform rounded-xl bg-amber-50/20 border-2 ${
              data.stock_status === "GREEN" ? "border-emerald-500 shadow-emerald-500/20" :
              data.stock_status === "YELLOW" ? "border-amber-400 shadow-amber-400/20" :
              data.stock_status === "RED" ? "border-red-500 shadow-red-500/20" :
              "border-amber-400"
            }`
          : "rounded-2xl border-stone-200 hover:border-stone-400 hover:shadow-md",
        selected
          ? "border-stone-900 ring-4 ring-stone-900/10 shadow-lg"
          : "hover:shadow-md",
        !isProduct && data.is_unassigned_station && "border-amber-400 ring-2 ring-amber-400/20",
        !isProduct && isParallelStart && "border-t-4 border-t-emerald-500",
        !isProduct && isSerial && "border-t-4 border-t-blue-500",
        !isProduct && isJoinConvergence && "border-t-4 border-t-purple-500"
      )}
    >
      <div className={cn("w-full h-full", isProduct && "skew-x-12 transform")}>
        {/* Target (Input) Handle */}
        <Handle
          type="target"
          position={Position.Left}
          className={cn(
            "!w-3.5 !h-3.5 !border-2 !border-white hover:!scale-125 transition-transform !-left-2",
            isProduct ? "!bg-amber-600" : "!bg-stone-600"
          )}
        />

        {/* Header Badge & Sequence */}
        <div className={cn(
          "p-3.5 pb-2 border-b flex items-center justify-between",
          isProduct ? "bg-amber-100/60 border-amber-200/80 rounded-t-xl" : "border-stone-100"
        )}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "w-6 h-6 rounded-lg text-white flex items-center justify-center text-[11px] font-black font-mono",
              isProduct ? "bg-amber-600" : "bg-stone-700"
            )}>
              {String(data.step_sequence || 1).padStart(2, "0")}
            </span>

            {isProduct ? (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-400/80 flex items-center gap-1 shadow-2xs">
                <Package className="w-3 h-3 text-amber-700" />
                PRODUCT OUTPUT <span className="bg-amber-900 text-amber-100 px-1.5 rounded-sm ml-1">{data.bom_allocations?.length || 0}</span>
              </span>
            ) : (
              <>
                {isParallelStart && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                    PARALLEL (Independent)
                  </span>
                )}
                {isSerial && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-300">
                    SERIAL (Dependent)
                  </span>
                )}
                {isJoinConvergence && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-300">
                    JOIN ({data.incomingCount} Branches)
                  </span>
                )}

              </>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onDelete && data.onDelete(data.id);
            }}
            className="text-stone-300 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors"
            title="Delete node"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body: Process or Product Name */}
        <div className="p-3.5 space-y-2">
          <div>
            <h4 className={cn(
              "text-xs font-black leading-snug line-clamp-2",
              isProduct ? "text-amber-950 font-bold" : "text-stone-900"
            )}>
              {data.process_name || <span className="text-stone-400 italic">{isProduct ? "Untitled Product Output" : "Untitled Process"}</span>}
            </h4>
          </div>

          {isProduct ? (
            <>
              {data.bom_allocations && data.bom_allocations.length > 0 && (
                <div className="flex flex-col gap-1 text-[10px] text-amber-900 bg-amber-50/50 border border-amber-200/80 rounded-lg p-1.5 px-2 font-medium">
                  <div className="font-bold flex items-center gap-1 opacity-70 mb-0.5">
                    <Layers className="w-3 h-3" />
                    Allocated Material:
                  </div>
                  {data.bom_allocations.map((a: any, i: number) => {
                    const valDisplay = a.qty !== undefined
                      ? `${a.qty % 1 === 0 ? a.qty : a.qty.toFixed(2)} ${a.uom || ''}`
                      : `${Math.round((a.fraction || 0) * 100)}%`;
                    return (
                      <div key={i} className="flex justify-between items-center text-[9px] bg-white px-1.5 py-0.5 rounded border border-amber-100">
                        <span className="truncate w-2/3">{a.bom_name || a.bom_id.substring(0,6)}</span>
                        <span className="font-mono font-black text-amber-900">{valDisplay}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[10px] text-amber-800 bg-amber-100/70 border border-amber-300/80 rounded-xl p-1.5 px-2 font-medium mt-1">
                <QrCode className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span className="line-clamp-1 flex-1">Auto QR Output</span>
                {data.expected_yield_rate !== undefined && (
                  <span className="font-mono font-black shrink-0 px-1.5 py-0.5 bg-amber-200 rounded border border-amber-400">
                    Yield: {data.expected_yield_rate}%
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              {/* Machine Assignment Badge */}
              {data.assigned_machine_id ? (
                <div className="flex items-center justify-between gap-1 text-[10px] text-blue-900 bg-blue-50/80 border border-blue-200/90 rounded-lg p-1 px-2 font-bold">
                  <div className="flex items-center gap-1 truncate">
                    <Wrench className="w-3 h-3 text-blue-600 shrink-0" />
                    <span className="truncate">{data.machine_name || data.machine_code || "Machine Bound"}</span>
                  </div>
                  {data.cycle_time_minutes ? (
                    <span className="font-mono text-[9px] text-blue-700 bg-blue-100/80 px-1 py-0.2 rounded shrink-0">
                      {data.cycle_time_minutes}m
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-1 text-[9px] text-stone-400 bg-stone-50 border border-stone-200/60 rounded-lg p-1 px-2 font-medium">
                  <Wrench className="w-3 h-3 text-stone-300 shrink-0" />
                  <span className="truncate italic">Unbound Machine Asset</span>
                </div>
              )}

              {data.is_unassigned_station ? (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-900 bg-amber-50 border border-amber-300 rounded-lg p-1.5 px-2 font-bold shadow-2xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 animate-pulse" />
                  <span className="truncate">Unassigned Station</span>
                </div>
              ) : data.station_name ? (
                <div className="flex items-center gap-1 text-[10px] text-stone-700 bg-stone-100 border border-stone-200/90 rounded-lg p-1 px-2 font-medium">
                  <Layers className="w-3 h-3 text-stone-500 shrink-0" />
                  <span className="truncate font-semibold">{data.station_name}</span>
                </div>
              ) : null}

              {data.qc_criteria && (
                <div className="flex items-start gap-1 text-[10px] text-stone-600 bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-1.5 px-2">
                  <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="line-clamp-1 italic">{data.qc_criteria}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Unified Quick Connect Action */}
        <div className="px-2.5 py-1.5 bg-stone-50/80 border-t border-stone-100 rounded-b-xl flex items-center justify-between text-[10px] gap-1 relative" ref={menuRef}>
          <div className="relative w-full">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="w-full flex items-center justify-between text-stone-700 hover:text-stone-950 font-bold hover:bg-stone-200/70 px-2.5 py-1 rounded-lg transition-colors border border-stone-200/60 bg-white"
              title="Connect node (Process or Product)"
            >
              <span className="flex items-center gap-1.5">
                <Plus className="w-3 h-3 text-blue-600" />
                <span>Connect Node</span>
              </span>
              <ChevronDown className={cn("w-3 h-3 text-stone-400 transition-transform", menuOpen && "rotate-180")} />
            </button>

            {/* Dropdown Menu for Connected Steps */}
            {menuOpen && (
              <div 
                className="absolute bottom-full left-0 mb-1.5 w-44 bg-white border border-stone-200 rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 text-left"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    data.onAddChild && data.onAddChild(data.id, "PROCESS");
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold text-stone-800 hover:bg-blue-50 hover:text-blue-900 rounded-lg transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Process</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    data.onAddChild && data.onAddChild(data.id, "PRODUCT");
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold text-stone-800 hover:bg-amber-50 hover:text-amber-950 rounded-lg transition-colors mt-0.5"
                >
                  <Package className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Product</span>
                </button>

                <div className="border-t border-stone-100 my-1"></div>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    data.onAddParallel && data.onAddParallel(data.id, "PROCESS");
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold text-stone-800 hover:bg-emerald-50 hover:text-emerald-900 rounded-lg transition-colors"
                >
                  <GitBranch className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Parallel Branch</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Source (Output) Handle */}
        <Handle
          type="source"
          position={Position.Right}
          className={cn(
            "!w-3.5 !h-3.5 !border-2 !border-white hover:!scale-125 transition-transform !-right-2",
            isProduct ? "!bg-amber-600" : "!bg-stone-600"
          )}
        />
      </div>
    </div>
  );
});

BopFlowNode.displayName = "BopFlowNode";

