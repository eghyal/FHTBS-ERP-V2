import React, { useState, useMemo } from "react";
import { Layers, CheckCircle2, Split, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

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

export type MergeStrategy = "COMBINE_REMARKS" | "STRICT_MATCH";

export function mergeBomRows(
  rows: BomRow[],
  strategy: MergeStrategy
): BomRow[] {
  if (strategy === "STRICT_MATCH") {
    const map = new Map<string, BomRow>();
    const result: BomRow[] = [];

    for (const row of rows) {
      const code = (row.item_code || "").trim().toUpperCase();
      if (!code) {
        result.push({ ...row });
        continue;
      }

      const refNorm = (row.reference || "").trim().toLowerCase();
      const specNorm = (row.spec || "").trim().toLowerCase();
      const key = `${code}:::${refNorm}:::${specNorm}`;

      const existing = map.get(key);
      if (existing) {
        existing.qty = String((Number(existing.qty) || 0) + (Number(row.qty) || 0));
      } else {
        const clone = { ...row, qty: String(Number(row.qty) || 0) };
        map.set(key, clone);
        result.push(clone);
      }
    }
    return result;
  }

  // Strategy: COMBINE_REMARKS
  const codeGroups = new Map<string, BomRow[]>();
  const nonCodeRows: BomRow[] = [];

  for (const row of rows) {
    const code = (row.item_code || "").trim().toUpperCase();
    if (code) {
      if (!codeGroups.has(code)) {
        codeGroups.set(code, []);
      }
      codeGroups.get(code)!.push({ ...row });
    } else {
      nonCodeRows.push({ ...row });
    }
  }

  const result: BomRow[] = [];

  for (const [code, groupRows] of codeGroups.entries()) {
    if (groupRows.length === 1) {
      result.push(groupRows[0]);
      continue;
    }

    const first = groupRows[0];
    const totalQty = groupRows.reduce((acc, r) => acc + (Number(r.qty) || 0), 0);
    const unit = first.unit || first.uom || "PCS";

    const distinctRefs = groupRows.map((r) => (r.reference || "").trim()).filter(Boolean);
    const uniqueRefs = Array.from(new Set(distinctRefs));

    let combinedReference = "";
    if (uniqueRefs.length === 0) {
      combinedReference = "";
    } else if (uniqueRefs.length === 1 && distinctRefs.length === groupRows.length) {
      combinedReference = uniqueRefs[0];
    } else {
      const parts: string[] = [];
      for (const r of groupRows) {
        const rQty = Number(r.qty) || 0;
        const rRef = (r.reference || "").trim();
        const rUnit = r.unit || unit;
        if (rRef) {
          parts.push(`${rRef} (${rQty} ${rUnit})`);
        } else {
          parts.push(`General (${rQty} ${rUnit})`);
        }
      }
      combinedReference = parts.join("; ");
    }

    const uniqueSpecs = Array.from(new Set(groupRows.map((r) => (r.spec || "").trim()).filter(Boolean)));
    const combinedSpec = uniqueSpecs.join("; ") || first.spec;

    const uniqueDims = Array.from(new Set(groupRows.map((r) => (r.dimension || "").trim()).filter(Boolean)));
    const combinedDim = uniqueDims.join("; ") || first.dimension;

    result.push({
      ...first,
      qty: String(totalQty),
      reference: combinedReference,
      spec: combinedSpec,
      dimension: combinedDim,
    });
  }

  return [...result, ...nonCodeRows];
}

interface BomMergeDuplicatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: BomRow[];
  onApply: (mergedRows: BomRow[]) => void;
}

export const BomMergeDuplicatesModal: React.FC<BomMergeDuplicatesModalProps> = ({
  isOpen,
  onClose,
  rows,
  onApply,
}) => {
  const [strategy, setStrategy] = useState<MergeStrategy>("COMBINE_REMARKS");

  const duplicateGroups = useMemo(() => {
    const map = new Map<string, BomRow[]>();
    for (const row of rows) {
      const code = (row.item_code || "").trim().toUpperCase();
      if (code) {
        if (!map.has(code)) map.set(code, []);
        map.get(code)!.push(row);
      }
    }

    const groups: { code: string; name: string; rows: BomRow[] }[] = [];
    for (const [code, items] of map.entries()) {
      if (items.length > 1) {
        groups.push({
          code,
          name: items[0].name || code,
          rows: items,
        });
      }
    }
    return groups;
  }, [rows]);

  const previewRows = useMemo(() => {
    return mergeBomRows(rows, strategy);
  }, [rows, strategy]);

  const handleConfirm = () => {
    onApply(previewRows);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-stone-900">
              Merge Duplicate BOM Items
            </h3>
            <p className="text-xs text-stone-500 font-normal">
              {duplicateGroups.length} duplicate items found across {rows.length} BOM lines
            </p>
          </div>
        </div>
      }
      maxWidth="3xl"
      contentClassName="p-0 flex flex-col max-h-[80vh]"
    >
      <div className="p-6 overflow-y-auto space-y-5">
        {/* Strategy Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
            Select Merge Mode
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Mode 1: Combine & Preserve Remarks */}
            <div
              onClick={() => setStrategy("COMBINE_REMARKS")}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                strategy === "COMBINE_REMARKS"
                  ? "border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-600/20"
                  : "border-stone-200 hover:border-stone-300 bg-white"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                    Combine Qty & Append Remarks
                  </span>
                  {strategy === "COMBINE_REMARKS" && (
                    <Check className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Consolidates into 1 line, sums quantities, and appends unique remarks per line quantity.
                </p>
              </div>
              <span className="mt-2 text-[10px] font-semibold text-emerald-700">
                Recommended
              </span>
            </div>

            {/* Mode 2: Strict Matching */}
            <div
              onClick={() => setStrategy("STRICT_MATCH")}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                strategy === "STRICT_MATCH"
                  ? "border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-600/20"
                  : "border-stone-200 hover:border-stone-300 bg-white"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                    <Split className="w-3.5 h-3.5 text-stone-600" />
                    Exact Matches Only
                  </span>
                  {strategy === "STRICT_MATCH" && (
                    <Check className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Only merges lines where code and remarks are identical. Differing remarks remain separate.
                </p>
              </div>
              <span className="mt-2 text-[10px] font-semibold text-stone-500">
                Strict
              </span>
            </div>
          </div>
        </div>

        {/* Preview Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
              Affected Items ({duplicateGroups.length})
            </label>
            <span className="text-[11px] text-stone-500 font-medium">
              {rows.length} lines → {previewRows.length} lines
            </span>
          </div>

          <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-[10px] uppercase font-bold text-stone-500 border-b border-stone-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Item</th>
                    <th className="py-2.5 px-3">Original</th>
                    <th className="py-2.5 px-3">Merged Qty</th>
                    <th className="py-2.5 px-3">Resulting Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {duplicateGroups.map((group) => {
                    const totalGroupQty = group.rows.reduce(
                      (acc, r) => acc + (Number(r.qty) || 0),
                      0
                    );
                    const unit = group.rows[0]?.unit || "PCS";
                    const matchingResult = previewRows.filter(
                      (r) => (r.item_code || "").trim().toUpperCase() === group.code
                    );

                    return (
                      <tr key={group.code} className="hover:bg-stone-50/50">
                        <td className="py-2.5 px-3 align-top">
                          <div className="font-mono font-bold text-stone-800 text-[11px]">
                            {group.code}
                          </div>
                          <div className="text-stone-500 text-[11px] truncate max-w-[160px]">
                            {group.name}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 align-top text-stone-500 font-mono text-[11px]">
                          {group.rows.length} lines ({totalGroupQty} {unit})
                        </td>
                        <td className="py-2.5 px-3 align-top font-mono font-bold text-emerald-700 text-[11px]">
                          {strategy === "COMBINE_REMARKS"
                            ? `${totalGroupQty} ${unit}`
                            : `${matchingResult.length} line(s)`}
                        </td>
                        <td className="py-2.5 px-3 align-top text-[11px] text-stone-600">
                          {strategy === "COMBINE_REMARKS" ? (
                            matchingResult[0]?.reference ? (
                              <span className="bg-stone-100 px-1.5 py-0.5 rounded text-[10px] font-medium text-stone-700">
                                {matchingResult[0].reference}
                              </span>
                            ) : (
                              <span className="text-stone-400 italic">None</span>
                            )
                          ) : (
                            <div className="space-y-1">
                              {matchingResult.map((m, idx) => (
                                <div key={idx} className="text-[10px] text-stone-600">
                                  {m.qty} {unit} — {m.reference || <em className="text-stone-400">None</em>}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
        <Button
          onClick={onClose}
          variant="secondary"
          className="text-xs font-semibold"
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs"
        >
          <CheckCircle2 className="w-4 h-4" />
          Apply Merge ({previewRows.length} lines)
        </Button>
      </div>
    </Modal>
  );
};
