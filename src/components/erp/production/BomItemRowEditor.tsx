import React, { memo } from "react";
import { Link } from "react-router-dom";
import { Search, AlertCircle, AlertTriangle, Trash2 } from "lucide-react";
import { cn, formatNumberWithDots } from "@/lib/utils";
import { Select } from "@/components/ui/Select";

export interface BomRow {
  id: string;
  item_code: string;
  name: string;
  dimension: string;
  spec: string;
  qty: string;
  unit: string;
  unit_price: string;
  matrix_unit_price?: string;
  reference: string;
  target_project_id?: string;
  item_id?: string;
  uom?: string;
  free_stock?: number;
  allocated_stock?: number;
  shortage_qty?: number;
  notFound?: boolean;
  pr_numbers?: string;
  total_pr_qty?: number;
}

interface BomItemRowEditorProps {
  row: BomRow;
  index: number;
  isEngineering: boolean;
  isCategoryProject: boolean;
  projects: any[];
  updateRow: (id: string, field: string, value: any) => void;
  removeRow: (id: string) => void;
  onOpenSearchModal: (rowId: string) => void;
}

export const BomItemRowEditor = memo(function BomItemRowEditor({
  row,
  index,
  isEngineering,
  isCategoryProject,
  projects,
  updateRow,
  removeRow,
  onOpenSearchModal,
}: BomItemRowEditorProps) {
  return (
    <div className="px-8 py-6 hover:bg-stone-50 transition-colors group relative flex gap-6 items-start">
      <div className="text-[10px] font-bold text-stone-400 w-10 pt-4 text-center shrink-0 font-mono">
        {String(index + 1).padStart(2, "0")}
      </div>

      <div className="flex-1 space-y-5">
        {/* Row 1: Primary Identification */}
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-4 space-y-1.5">
            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1">
              Item Code
            </label>
            <div className="relative group/input">
              <input
                type="text"
                list="warehouse-item-codes-datalist"
                value={row.item_code}
                readOnly={!isEngineering}
                onChange={(e) => updateRow(row.id, "item_code", e.target.value)}
                className={cn(
                  "w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm uppercase outline-none focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5 transition-all font-bold tracking-tight",
                  row.notFound
                    ? "text-rose-600 border-rose-300 bg-rose-50"
                    : "text-stone-950",
                  !isEngineering && "border-transparent bg-transparent",
                )}
                placeholder="SKU-XXXXX"
              />
              <button
                type="button"
                onClick={() => onOpenSearchModal(row.id)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 transition-all cursor-pointer"
                title="Search Warehouse SKU"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>
            {row.notFound && (
              <Link
                to="/warehouse"
                className="text-[9px] text-rose-600 font-bold uppercase mt-1 flex items-center gap-1 hover:underline ml-1"
              >
                <AlertCircle className="w-3 h-3" /> Create New Items
              </Link>
            )}
          </div>

          <div className="col-span-8 space-y-1.5">
            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1">
              Component Name & Description
            </label>
            <input
              type="text"
              value={row.name}
              readOnly={!!row.item_id || !isEngineering}
              onChange={(e) => updateRow(row.id, "name", e.target.value)}
              className={cn(
                "w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5 font-bold text-stone-900",
                (!!row.item_id || !isEngineering) &&
                  "border-transparent bg-transparent",
              )}
              placeholder="Internal System Component Name"
            />
          </div>
        </div>

        {/* Row 2: Specifications & Logistics */}
        <div className="grid grid-cols-12 gap-5 py-3 px-4 bg-stone-50/50 rounded-2xl border border-stone-100/50">
          <div className="col-span-3 space-y-1.5">
            <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1">
              Dimensions
            </label>
            <input
              type="text"
              value={row.dimension}
              readOnly={!isEngineering}
              onChange={(e) => updateRow(row.id, "dimension", e.target.value)}
              className={cn(
                "w-full bg-white border border-stone-100 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-stone-400 font-medium text-stone-900",
                !isEngineering && "border-transparent bg-transparent",
              )}
              placeholder="L x W x H"
            />
          </div>

          <div className="col-span-3 space-y-1.5">
            <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1">
              Technical Spec
            </label>
            <input
              type="text"
              value={row.spec}
              readOnly={!isEngineering}
              onChange={(e) => updateRow(row.id, "spec", e.target.value)}
              className={cn(
                "w-full bg-white border border-stone-100 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-stone-400 font-medium text-stone-900",
                !isEngineering && "border-transparent bg-transparent",
              )}
              placeholder="Standard Configuration"
            />
          </div>

          <div className="col-span-2 space-y-1.5">
            <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1">
              Quantity
            </label>
            <input
              type="number"
              value={row.qty}
              readOnly={!isEngineering}
              onChange={(e) => updateRow(row.id, "qty", e.target.value)}
              className={cn(
                "w-full bg-white border border-stone-100 rounded-lg px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-900 font-bold text-center",
                !isEngineering && "border-transparent bg-transparent",
              )}
            />
          </div>

          <div className="col-span-2 space-y-1.5">
            <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1">
              Uom
            </label>
            <input
              type="text"
              value={row.unit || row.uom || ""}
              readOnly={!!row.item_id || !isEngineering}
              onChange={(e) => updateRow(row.id, "unit", e.target.value)}
              className="w-full bg-white border border-stone-100 rounded-lg px-3 py-2 text-[13px] text-stone-900 outline-none focus:border-stone-400 font-bold text-center uppercase"
              placeholder="PCS"
            />
          </div>

          <div className="col-span-2 space-y-1.5">
            <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1 text-center block">
              Stock
            </label>
            <div
              className={cn(
                "w-full border rounded-lg px-3 py-2 text-center text-xs font-bold font-mono",
                (row.free_stock || 0) > 0
                  ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                  : "bg-stone-100 border-stone-200 text-stone-400",
              )}
            >
              {row.free_stock || 0}
            </div>
          </div>
        </div>

        {/* Row 3: Financials & Reference */}
        <div className="grid grid-cols-12 gap-5 px-1">
          <div className="col-span-4 space-y-1.5 opacity-80">
            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1 flex justify-between">
              Matrix Unit Price (IDR)
              {row.item_id &&
                row.matrix_unit_price &&
                row.unit_price !== row.matrix_unit_price && (
                  <span className="text-amber-600 animate-pulse lowercase font-bold tracking-normal italic flex items-center gap-1.5 font-mono">
                    <AlertTriangle className="w-3.5 h-3.5" /> Out of Sync
                  </span>
                )}
            </label>
            <div
              className={cn(
                "w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold text-stone-900 flex items-center justify-between",
                row.item_id &&
                  row.matrix_unit_price &&
                  row.unit_price !== row.matrix_unit_price &&
                  "border-amber-300 bg-amber-50/50",
              )}
            >
              <span>{formatNumberWithDots(Number(row.unit_price || 0))}</span>
              {row.item_id && (
                <span className="text-[8px] text-stone-400 font-bold uppercase tracking-widest bg-white px-2 py-1 rounded-lg border border-stone-100">
                  Fixed Matrix
                </span>
              )}
            </div>
          </div>
          {isCategoryProject ? (
            <>
              <div className="col-span-4 space-y-1.5">
                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1">
                  Target Project
                </label>
                <Select
                  value={row.target_project_id || ""}
                  onChange={(e) =>
                    updateRow(row.id, "target_project_id", e.target.value)
                  }
                  disabled={!isEngineering}
                  className={cn(
                    "w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5 font-bold text-stone-900",
                    !isEngineering && "border-transparent bg-transparent",
                  )}
                >
                  <option value="">-- Optional --</option>
                  {projects
                    .filter(
                      (p) =>
                        (p.status === "ACTIVE" || p.status === "HOLD") &&
                        !["CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(p.id),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id} - {p.name}
                      </option>
                    ))}
                </Select>
              </div>
              <div className="col-span-4 space-y-1.5">
                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1">
                  Reference / Remarks
                </label>
                <input
                  type="text"
                  value={row.reference}
                  readOnly={!isEngineering}
                  onChange={(e) => updateRow(row.id, "reference", e.target.value)}
                  className={cn(
                    "w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5 font-bold text-stone-900 placeholder:text-stone-400",
                    !isEngineering && "border-transparent bg-transparent",
                  )}
                  placeholder="Drawing Ref, or Note"
                />
              </div>
            </>
          ) : (
            <div className="col-span-8 space-y-1.5">
              <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1">
                Reference / Remarks
              </label>
              <input
                type="text"
                value={row.reference}
                readOnly={!isEngineering}
                onChange={(e) => updateRow(row.id, "reference", e.target.value)}
                className={cn(
                  "w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5 font-bold text-stone-900 placeholder:text-stone-400",
                  !isEngineering && "border-transparent bg-transparent",
                )}
                placeholder="Drawing Ref, Revision, or Note"
              />
            </div>
          )}
        </div>
      </div>

      <div className="w-10 shrink-0 pt-10 flex justify-end">
        {isEngineering && (
          <button
            type="button"
            onClick={() => removeRow(row.id)}
            className="w-10 h-10 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 hover:text-rose-700 transition-all flex items-center justify-center shadow-3xs cursor-pointer"
            title="Delete Item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
});
