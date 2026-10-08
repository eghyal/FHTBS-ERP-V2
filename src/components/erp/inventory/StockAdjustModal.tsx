import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Sliders, ArrowUpRight, ArrowDownRight, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StockAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItem: any;
  adjustName: string;
  setAdjustName: (val: string) => void;
  adjustUom: string;
  setAdjustUom: (val: string) => void;
  adjustQty: string;
  setAdjustQty: (val: string) => void;
  adjustReason: string;
  setAdjustReason: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
}

export function StockAdjustModal({
  isOpen,
  onClose,
  selectedItem,
  adjustName,
  setAdjustName,
  adjustUom,
  setAdjustUom,
  adjustQty,
  setAdjustQty,
  adjustReason,
  setAdjustReason,
  onSubmit,
  isSubmitting,
}: StockAdjustModalProps) {
  if (!selectedItem) return null;

  const currentFreeStock = Number(selectedItem.free_stock || 0);
  const currentAllocated = Number(selectedItem.allocated_stock || selectedItem.reserved_qty || 0);
  const newQtyNum = parseFloat(adjustQty) || 0;
  const diff = newQtyNum - currentFreeStock;

  const handleQuickAdd = (delta: number) => {
    const current = parseFloat(adjustQty) || currentFreeStock;
    const nextVal = Math.max(0, current + delta);
    setAdjustQty(nextVal.toString());
  };

  return (
    <Modal
      isOpen={isOpen && !!selectedItem}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-stone-700" />
          <span>Stock Adjustment & Balance Correction</span>
        </div>
      }
      description={`Perform physical stock count correction for ${selectedItem.item_code} (${selectedItem.name})`}
      maxWidth="2xl"
      contentClassName="p-0 border-t border-stone-100"
    >
      <form onSubmit={onSubmit} className="p-6 space-y-5">
        {/* Current State Indicator */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200/80">
            <span className="text-[10px] text-stone-400 font-bold uppercase tracking-widest block mb-1">
              Current Free Stock
            </span>
            <span className="text-xl font-bold text-stone-900 font-mono">
              {currentFreeStock.toLocaleString("id-ID")}{" "}
              <span className="text-xs font-semibold text-stone-400">
                {selectedItem.uom}
              </span>
            </span>
          </div>

          <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200/80">
            <span className="text-[10px] text-stone-400 font-bold uppercase tracking-widest block mb-1">
              Allocated / Reserved
            </span>
            <span className="text-xl font-bold text-amber-700 font-mono">
              {currentAllocated.toLocaleString("id-ID")}{" "}
              <span className="text-xs font-semibold text-stone-400">
                {selectedItem.uom}
              </span>
            </span>
          </div>

          <div className={cn(
            "p-3.5 rounded-2xl border transition-colors",
            diff > 0
              ? "bg-emerald-50 border-emerald-200"
              : diff < 0
              ? "bg-rose-50 border-rose-200"
              : "bg-stone-50 border-stone-200/80"
          )}>
            <span className="text-[10px] text-stone-400 font-bold uppercase tracking-widest block mb-1">
              Adjustment Impact
            </span>
            <div className="flex items-center gap-1 font-mono font-bold text-xl">
              {diff > 0 ? (
                <>
                  <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">+{diff.toLocaleString("id-ID")}</span>
                </>
              ) : diff < 0 ? (
                <>
                  <ArrowDownRight className="w-4 h-4 text-rose-600" />
                  <span className="text-rose-700">{diff.toLocaleString("id-ID")}</span>
                </>
              ) : (
                <span className="text-stone-500">No Change</span>
              )}
            </div>
          </div>
        </div>

        {/* Quantity Input with Quick Actions */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
            New Physical / Available Free Count
          </label>
          <div className="flex gap-2">
            <input
              required
              type="number"
              min="0"
              step="any"
              value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)}
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200/90 text-stone-900 rounded-xl text-xl font-bold outline-none focus:bg-white focus:border-stone-400 focus:ring-2 focus:ring-stone-100 transition-all font-mono"
              placeholder="0"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider self-center mr-1">
              Quick Adjust:
            </span>
            {[-10, -5, -1, 1, 5, 10, 50, 100].map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => handleQuickAdd(step)}
                className="px-2.5 py-1 text-xs font-mono font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition-all active:scale-95"
              >
                {step > 0 ? `+${step}` : step}
              </button>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider ml-1">
            Adjustment Reason / Reference
          </label>
          <Select
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            className="w-full px-4 py-3 bg-stone-50 border border-stone-200/80 hover:bg-white hover:border-stone-300 rounded-xl text-sm font-bold text-stone-900 focus:bg-white focus:border-stone-400 focus:ring-2 focus:ring-stone-100 outline-none transition-all cursor-pointer"
          >
            <option value="STOCK_TAKE">Periodic Physical Stock Take (Opname)</option>
            <option value="DAMAGE">Damaged / Defect / Scrapped</option>
            <option value="CORRECTION">Data Entry / System Quantity Correction</option>
            <option value="RETURN">Customer Return / Re-stocking</option>
            <option value="SAMPLE">Sample / Testing Usage</option>
            <option value="INVENTORY_GAIN">Physical Inventory Gain / Found Stock</option>
          </Select>
        </div>

        {/* Optional Metadata Update */}
        <div className="border-t border-stone-100 pt-3">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-2">
            Optional Metadata Correction
          </span>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">
                Item Name
              </label>
              <input
                value={adjustName}
                onChange={(e) => setAdjustName(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200/80 rounded-xl text-xs font-medium text-stone-900 focus:bg-white focus:border-stone-400 outline-none transition-all"
                placeholder={selectedItem.name}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">
                Unit (UOM)
              </label>
              <input
                value={adjustUom}
                onChange={(e) => setAdjustUom(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200/80 rounded-xl text-xs font-bold text-stone-900 focus:bg-white focus:border-stone-400 outline-none transition-all"
                placeholder={selectedItem.uom}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-3 border-t border-stone-100">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-1/3 text-xs font-bold"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={adjustQty === ""}
            isLoading={isSubmitting}
            className="flex-1 text-xs font-bold"
          >
            Confirm Stock Adjustment
          </Button>
        </div>
      </form>
    </Modal>
  );
}
