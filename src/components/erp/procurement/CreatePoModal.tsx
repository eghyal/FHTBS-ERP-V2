import React, { memo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  AlertTriangle,
  RotateCcw,
  AlertCircle,
  Percent,
} from "lucide-react";
import { cn, formatIDR, formatIDRWithDecimals } from "@/lib/utils";
import {
  calculateFinancialBreakdown,
} from "@/lib/financialEngine";

interface CreatePoModalProps {
  isOpen: boolean;
  onClose: () => void;
  revisingPo: any;
  handleCancelPo: (id: string) => void;
  selectedPrItems: Set<string>;
  pendingPrs: any[];
  handleCreatePo: (e: React.FormEvent) => void;
  isFetchingSuppliers: boolean;
  sortedSuppliers: any[];
  poForm: any;
  setPoForm: React.Dispatch<React.SetStateAction<any>>;
  handleSelectSupplierInModal: (rec: any) => void;
  getSupplierTotalAndPrices: (
    sup: any,
    items: any[],
  ) => { total: number; breakdown: Record<string, number> };
  selectedItemsDetails: any[];
  validSuppliers: any[];
  handlePoTaxCategoryChange: (category: string) => void;
  isSubmitting: boolean;
}

export const CreatePoModal = memo(function CreatePoModal({
  isOpen,
  onClose,
  revisingPo,
  handleCancelPo,
  selectedPrItems,
  pendingPrs,
  handleCreatePo,
  isFetchingSuppliers,
  sortedSuppliers,
  poForm,
  setPoForm,
  handleSelectSupplierInModal,
  getSupplierTotalAndPrices,
  selectedItemsDetails,
  validSuppliers,
  handlePoTaxCategoryChange,
  isSubmitting,
}: CreatePoModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title={
        <div>
          <h3 className="text-lg font-bold text-stone-900">
            {revisingPo
              ? `Revise Purchase Order: ${revisingPo.po_number}`
              : "Generate Purchase Order"}
          </h3>
          <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">
            Supplier Procurement Batch
          </p>
        </div>
      }
    >
      {revisingPo && revisingPo.revision_note && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm mb-6 w-full -mt-2">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-bold text-rose-800 uppercase tracking-widest mb-1">
                Revision Requested by Manager
              </div>
              <div className="text-xs font-medium text-rose-700 leading-relaxed">
                "{revisingPo.revision_note}"
              </div>
            </div>
          </div>
          <Button
            variant="danger_soft"
            size="xs"
            type="button"
            className="shrink-0 whitespace-nowrap"
            onClick={() => {
              onClose();
              handleCancelPo(revisingPo.id);
            }}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Un-bulk / Batalkan PO
          </Button>
        </div>
      )}

      <div className="px-6 py-5 bg-stone-50 border-b border-stone-100 -mx-6 -mt-2 mb-4">
        <div className="flex justify-between items-start mb-1.5">
          <div>
            <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-1.5">
              Bundling Summary
            </div>
            <div className="text-sm font-bold text-stone-900 leading-tight">
              Batch creation for{" "}
              <span className="text-stone-900 uppercase tracking-widest">
                {revisingPo ? revisingPo.items?.length : selectedPrItems.size}{" "}
                items
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-1.5 text-right">
              Est. Aggregate Value
            </div>
            <div className="text-sm font-bold text-emerald-600 font-mono">
              {formatIDR(
                revisingPo
                  ? (revisingPo.items || []).reduce(
                      (sum: number, i: any) =>
                        sum + i.qty * (i.unit_price || 0),
                      0,
                    )
                  : pendingPrs
                      .filter((p) => selectedPrItems.has(p.pr_item_id))
                      .reduce(
                        (sum, p) => sum + p.qty * (p.unit_price || 0),
                        0,
                      ),
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {revisingPo
            ? (revisingPo.pr_numbers || "")
                .split(", ")
                .map((prNum: string) => (
                  <span
                    key={prNum}
                    className="text-[9px] bg-stone-200/60 px-2 py-0.5 rounded text-stone-700 font-bold tracking-tight"
                  >
                    {prNum}
                  </span>
                ))
            : Array.from(
                new Set(
                  pendingPrs
                    .filter((p) => selectedPrItems.has(p.pr_item_id))
                    .map((p) => p.pr_number),
                ),
              ).map((prNum) => (
                <span
                  key={prNum}
                  className="text-[9px] bg-stone-200/60 px-2 py-0.5 rounded text-stone-700 font-bold tracking-tight"
                >
                  {prNum}
                </span>
              ))}
        </div>
      </div>

      <form onSubmit={handleCreatePo} className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-widest">
              Optimization Matrix
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-stone-400"></span>
          </div>
          <label className="block text-xs font-bold text-stone-900 uppercase tracking-wider mb-2">
            Vendor Proposals (Ranked by Matrix Score)
          </label>

          {isFetchingSuppliers ? (
            <div className="py-8 text-center bg-stone-50 border border-stone-200 rounded-xl">
              <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-dashed border-stone-400 mr-2 align-middle"></span>
              <span className="text-[10px] text-stone-500 align-middle font-mono">
                Processing matrix algorithm scores...
              </span>
            </div>
          ) : sortedSuppliers.length === 0 ? (
            <div className="p-6 text-center bg-stone-50 border border-stone-200 rounded-xl">
              <AlertCircle className="w-5 h-5 text-stone-400 mx-auto mb-2" />
              <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest font-mono">
                No Active Suppliers Configured
              </div>
              <p className="text-[9px] text-stone-400 mt-1 font-sans">
                To configure recommendations, add supplier unit costs to
                catalog items under Master Data.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
              {sortedSuppliers.map((rec, index) => {
                const isSelected = poForm.supplier_id === rec.id;
                const { total } = getSupplierTotalAndPrices(
                  rec,
                  selectedItemsDetails,
                );
                return (
                  <div
                    key={rec.id}
                    onClick={() => handleSelectSupplierInModal(rec)}
                    className={cn(
                      "p-3 rounded-xl border cursor-pointer transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 text-left relative overflow-hidden",
                      isSelected
                        ? "bg-white text-stone-900 border-stone-800 shadow-sm ring-1 ring-stone-800"
                        : "bg-white hover:bg-stone-50 border-stone-200 text-stone-600",
                    )}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-stone-900">
                          {rec.name}
                        </span>
                        <span className="text-[9px] font-mono text-stone-400">
                          ({rec.code || "CODE"})
                        </span>
                        {index === 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[7px] font-bold tracking-widest bg-emerald-100 text-emerald-700 uppercase border border-emerald-200 font-mono">
                            Rank 1: Optimal Cost
                          </span>
                        )}
                        {(rec as any).compositeScore >= 80 && index > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[7px] font-bold tracking-widest bg-stone-100 text-stone-600 uppercase border border-stone-200 font-mono">
                            Highly Compatible
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-3 mt-2.5 pt-2.5 border-t border-stone-100 text-[9px] leading-none text-stone-500 font-mono">
                        <div>
                          <span className="block text-[7px] uppercase tracking-widest text-stone-400 font-sans mb-1 font-bold">
                            Catalog Compliance
                          </span>
                          <span className="font-bold text-stone-700">
                            {Math.round((rec as any).matchPercent)}% Catalog
                            Match
                          </span>{" "}
                          <span className="text-[8px] text-stone-400">
                            ({(rec as any).fulfilledCount}/
                            {(rec as any).totalItemsInBatch})
                          </span>
                        </div>
                        <div>
                          <span className="block text-[7px] uppercase tracking-widest text-stone-400 font-sans mb-1 font-bold">
                            Logistics & Lead-Time
                          </span>
                          <span className="font-bold text-stone-700">
                            {(rec as any).proximityKm} km dist
                          </span>{" "}
                          <span className="text-[8px] text-stone-400">
                            (~{(rec as any).leadTimeDays}d ETA)
                          </span>
                        </div>
                        <div>
                          <span className="block text-[7px] uppercase tracking-widest text-stone-400 font-sans mb-1 font-bold">
                            QA On-Time Rate
                          </span>
                          <span className="font-bold text-stone-700">
                            {(rec as any).onTimeScore}% Performance
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="md:text-right flex md:flex-col justify-between items-center md:items-end shrink-0 md:pl-3 border-t md:border-t-0 md:border-l border-stone-100 p-1 md:p-0 font-mono">
                      <div>
                        <span className="block text-[7px] uppercase tracking-widest text-stone-400 font-bold mb-1 font-sans text-left md:text-right">
                          Index Coefficient
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold font-mono text-stone-800">
                            {(rec as any).compositeScore}
                          </span>
                          <div className="w-10 h-1 bg-stone-100 rounded-full overflow-hidden shrink-0 border border-stone-200">
                            <div
                              className="h-full rounded-full transition-all bg-stone-700"
                              style={{
                                width: `${(rec as any).compositeScore}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-2.5 leading-none text-left md:text-right">
                        <span className="block text-[7px] uppercase tracking-widest text-stone-400 font-bold mb-1 font-sans text-left md:text-right">
                          Est. Aggregate Cost
                        </span>
                        <div className="text-xs font-bold text-stone-900 font-mono">
                          {formatIDR(total)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {poForm.supplier_id && (
            <div className="mt-3 bg-stone-50 border border-stone-200/60 rounded-xl p-4 transition-all">
              <div className="text-[10px] text-stone-500 font-extrabold uppercase tracking-widest mb-2.5">
                Selected Supplier Itemized Prices
              </div>
              <div className="space-y-2">
                {revisingPo
                  ? (revisingPo.items || []).map((p: any) => {
                      const sup = validSuppliers.find(
                        (s) => s.id === poForm.supplier_id,
                      );
                      const breakdown = sup
                        ? getSupplierTotalAndPrices(
                            sup,
                            revisingPo.items || [],
                          ).breakdown
                        : {};
                      const unitPrice =
                        breakdown[p.item_id] ?? p.unit_price ?? 0;
                      return (
                        <div
                          key={p.id}
                          className="flex justify-between items-center text-xs"
                        >
                          <span className="text-stone-600 font-medium">
                            {p.item_name}{" "}
                            <span className="font-mono text-stone-400 text-[10px]">
                              ({p.qty} {p.uom || "qty"})
                            </span>
                          </span>
                          <div className="text-right">
                            <span className="font-mono font-bold text-stone-900">
                              {formatIDR(unitPrice)} / {p.uom || "unit"}
                            </span>
                            <span className="block text-[10px] text-stone-400 font-medium font-mono">
                              Subtotal: {formatIDR(p.qty * unitPrice)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  : pendingPrs
                      .filter((p) => selectedPrItems.has(p.pr_item_id))
                      .map((p) => {
                        const sup = validSuppliers.find(
                          (s) => s.id === poForm.supplier_id,
                        );
                        const breakdown = sup
                          ? getSupplierTotalAndPrices(
                              sup,
                              selectedItemsDetails,
                            ).breakdown
                          : {};
                        const unitPrice =
                          breakdown[p.item_id] ?? p.unit_price ?? 0;
                        return (
                          <div
                            key={p.pr_item_id}
                            className="flex justify-between items-center text-xs"
                          >
                            <span className="text-stone-600 font-medium">
                              {p.item_name}{" "}
                              <span className="font-mono text-stone-400 text-[10px]">
                                ({p.qty} {p.uom || "qty"})
                              </span>
                            </span>
                            <div className="text-right">
                              <span className="font-mono font-bold text-stone-900">
                                {formatIDR(unitPrice)} / {p.uom || "unit"}
                              </span>
                              <span className="block text-[10px] text-stone-400 font-medium font-mono">
                                Subtotal: {formatIDR(p.qty * unitPrice)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
              </div>
            </div>
          )}
        </div>

        {/* Supplier Tax Profile & Payment Terms */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-stone-900 uppercase tracking-wider mb-1.5">
              NPWP Supplier / Vendor
            </label>
            <input
              type="text"
              value={poForm.supplier_npwp}
              onChange={(e) =>
                setPoForm({ ...poForm, supplier_npwp: e.target.value })
              }
              placeholder="Contoh: 01.234.567.8-901.000 / 16 Digit"
              className="w-full border border-stone-200 rounded-lg px-3.5 py-2.5 text-xs font-mono focus:border-stone-400 outline-none"
            />
            <p className="mt-1 text-[10px] text-stone-400 font-medium">
              Loaded from Vendor profile or customized per Purchase Order.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-900 uppercase tracking-wider mb-1.5">
              Payment Terms
            </label>
            <select
              value={poForm.payment_terms}
              onChange={(e) =>
                setPoForm({ ...poForm, payment_terms: e.target.value })
              }
              className="w-full border border-stone-200 rounded-lg px-3.5 py-2.5 text-xs font-medium focus:border-stone-400 outline-none"
            >
              <option value="Cash Before Delivery (CBD)">Cash Before Delivery (CBD)</option>
              <option value="Cash on Delivery (COD)">Cash on Delivery (COD)</option>
              <option value="Net 7 Days">Net 7 Days</option>
              <option value="Net 14 Days">Net 14 Days</option>
              <option value="Net 30 Days">Net 30 Days</option>
              <option value="Net 45 Days">Net 45 Days</option>
              <option value="Net 60 Days">Net 60 Days</option>
              <option value="Net 90 Days">Net 90 Days</option>
              <option value="Custom">Custom Payment Terms...</option>
            </select>
            {poForm.payment_terms === "Custom" && (
              <input
                type="text"
                value={poForm.custom_payment_terms}
                onChange={(e) =>
                  setPoForm({ ...poForm, custom_payment_terms: e.target.value })
                }
                placeholder="Enter custom payment terms..."
                className="w-full mt-2 border border-stone-200 rounded-lg px-3 py-2 text-xs focus:border-stone-400 outline-none"
              />
            )}
          </div>
        </div>

        {/* Tax Configuration Section */}
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-stone-600" />
              Indonesian Tax Regulation & Tax Schemes
            </label>
            <span className="text-[9px] font-mono bg-stone-200 text-stone-700 font-bold px-2 py-0.5 rounded uppercase">
              UU HPP & PMK
            </span>
          </div>

          {/* Scheme Selector */}
          <div>
            <label className="block text-[10px] font-bold text-stone-600 uppercase tracking-wider mb-1">
              Select Tax Category / Scheme
            </label>
            <select
              value={poForm.tax_category}
              onChange={(e) => handlePoTaxCategoryChange(e.target.value)}
              className="w-full border border-stone-200 bg-white rounded-lg px-3 py-2 text-xs font-semibold focus:border-stone-400 outline-none"
            >
              <option value="GOODS_DPP_LAIN">
                Goods: VAT 12% with Other Base Value (DPP Nilai Lain 11/12)
              </option>
              <option value="SERVICES_DPP_LAIN">
                Services: VAT 12% (DPP Nilai Lain 11/12) + Withholding Tax (PPh 23 2%)
              </option>
              <option value="NON_PKP">
                Non-PKP / Exempt: VAT 0% & No Withholding Tax
              </option>
              <option value="CUSTOM">
                Custom: Manual VAT & WHT Rates
              </option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col justify-end">
              <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1 whitespace-nowrap">
                VAT Rate (%)
              </label>
              <input
                type="number"
                value={poForm.ppn_rate}
                onChange={(e) => setPoForm({ ...poForm, ppn_rate: e.target.value })}
                className="w-full border border-stone-200 bg-white rounded-lg px-3 py-2 text-xs font-mono font-bold focus:border-stone-400 outline-none"
                placeholder="12"
              />
            </div>

            <div className="flex flex-col justify-end">
              <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1 whitespace-nowrap">
                PPh 23 WHT Rate (%)
              </label>
              <input
                type="number"
                value={poForm.pph_rate}
                onChange={(e) => setPoForm({ ...poForm, pph_rate: e.target.value })}
                className="w-full border border-stone-200 bg-white rounded-lg px-3 py-2 text-xs font-mono font-bold focus:border-stone-400 outline-none"
                placeholder="0"
              />
            </div>

            <div className="flex flex-col justify-end">
              <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1 whitespace-nowrap">
                Rounding Factor (Rp)
              </label>
              <input
                type="number"
                step="any"
                value={poForm.rounding_factor ?? 0}
                onChange={(e) =>
                  setPoForm({
                    ...poForm,
                    rounding_factor: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
                className="w-full border border-stone-200 bg-white rounded-lg px-3 py-2 text-xs font-mono font-bold focus:border-stone-400 outline-none"
                placeholder="0"
              />
            </div>
          </div>
          <p className="text-[10px] text-stone-400">
            * Enter Rounding Factor manually if supplier quotation includes rounding adjustments (e.g., -500, +250). Leave as 0 if no rounding.
          </p>

          {/* Explanation Note for DPP Nilai Lain */}
          {poForm.tax_scheme === "DPP_NILAI_LAIN" && (
            <div className="bg-amber-50/80 border border-amber-200/80 rounded-lg p-2.5 text-[11px] text-amber-900 leading-relaxed">
              <span className="font-bold">Other Base Value Mechanism (DPP Nilai Lain):</span> The formal statutory rate is <strong>12%</strong> applied to an Other Tax Base (DPP Lain-Lain) of <strong>(11/12)</strong> of transaction value.
            </div>
          )}

          {/* Live Calculation Summary */}
          {poForm.supplier_id && (
            <div className="pt-2 border-t border-stone-200 font-mono text-xs space-y-1">
              {(() => {
                const sup = validSuppliers.find((s) => s.id === poForm.supplier_id);
                const { total: calculatedDpp } = sup
                  ? getSupplierTotalAndPrices(
                      sup,
                      revisingPo ? (revisingPo.items || []) : selectedItemsDetails,
                    )
                  : { total: 0 };

                const breakdown = calculateFinancialBreakdown({
                  grossAmount: calculatedDpp,
                  taxScheme: poForm.tax_scheme,
                  taxRate: parseFloat(poForm.ppn_rate) || 0,
                  pphRate: parseFloat(poForm.pph_rate) || 0,
                  roundingFactor: Number(poForm.rounding_factor) || 0,
                });

                return (
                  <div className="bg-white p-3 rounded-lg border border-stone-200 space-y-1.5 text-right">
                    <div className="flex justify-between text-stone-600">
                      <span>Subtotal DPP (Net Base):</span>
                      <span className="font-bold">{formatIDR(breakdown.dpp)}</span>
                    </div>

                    {breakdown.isDppNilaiLain && (
                      <div className="flex justify-between text-stone-500 bg-stone-50 px-2 py-0.5 rounded text-[10px]">
                        <span>Other Tax Base / DPP Nilai Lain (11/12):</span>
                        <span className="font-bold text-stone-700">
                          {formatIDRWithDecimals(breakdown.dppNilaiLain, 2)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>
                        VAT / PPN {breakdown.isDppNilaiLain ? `12%` : `${breakdown.taxRate}%`}:
                      </span>
                      <span>+ {formatIDR(breakdown.ppnAmount)}</span>
                    </div>

                    {breakdown.roundingFactor !== 0 && (
                      <div className="flex justify-between text-stone-500 font-medium text-xs">
                        <span>Rounding Adjustment:</span>
                        <span className="font-mono">
                          {breakdown.roundingFactor > 0 ? "+" : ""}
                          {formatIDR(breakdown.roundingFactor)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-stone-900 border-t border-stone-200 pt-1 text-xs font-black">
                      <span>ESTIMATED PO TOTAL:</span>
                      <span className="text-stone-900">{formatIDR(breakdown.grandTotal)}</span>
                    </div>

                    {breakdown.pphRate > 0 && (
                      <div className="mt-2 p-2 bg-stone-50 border border-stone-200 rounded text-xs space-y-1">
                        <div className="flex justify-between text-stone-600">
                          <span>Potongan PPh 23 ({breakdown.pphRate}%):</span>
                          <span className="font-bold text-rose-600">- {formatIDR(breakdown.pphAmount)}</span>
                        </div>
                        <div className="flex justify-between text-stone-900 font-black border-t border-stone-200 pt-1">
                          <span>Estimasi Bersih Dibayar (Net Payable):</span>
                          <span className="text-emerald-700">{formatIDR(breakdown.netPayable)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">
            Urgency Level
          </label>
          <select
            value={poForm.urgency}
            onChange={(e) =>
              setPoForm({ ...poForm, urgency: e.target.value as any })
            }
            className="w-full border border-stone-200 rounded-lg px-4 py-2.5 text-sm focus:border-stone-400 outline-none"
          >
            <option value="NORMAL">Normal</option>
            <option value="URGENT">Urgent</option>
            <option value="CRITICAL">Critical</option>
          </select>
          <p className="mt-2 text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
            Note: Expected delivery date will be inherited from the selected
            PR items.
          </p>
        </div>

        <div className="pt-4 flex flex-wrap justify-between items-center gap-3 mt-4 border-t border-stone-200">
          {revisingPo ? (
            <Button
              variant="danger_soft"
              type="button"
              onClick={() => {
                onClose();
                handleCancelPo(revisingPo.id);
              }}
            >
              <RotateCcw className="w-4 h-4 mr-1.5" /> Un-bulk & Reset ke PR Items
            </Button>
          ) : (
            <div></div>
          )}
          <div className="flex gap-3 ml-auto">
            <Button
              variant="secondary"
              type="button"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Processing..." : revisingPo ? "Simpan Revisi PO" : "Issue PO"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
});
