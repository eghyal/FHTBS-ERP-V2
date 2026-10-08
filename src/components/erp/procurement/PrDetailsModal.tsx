import React, { memo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPrDetails: any;
}

export const PrDetailsModal = memo(function PrDetailsModal({
  isOpen,
  onClose,
  selectedPrDetails,
}: PrDetailsModalProps) {
  if (!selectedPrDetails) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      contentClassName="p-0 flex flex-col h-[90vh] bg-stone-50"
    >
      <div className="p-5 border-b border-stone-200 flex justify-between items-center bg-white shrink-0">
        <div>
          <span className="text-[9px] font-black tracking-widest text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase">
            Official Purchase Request
          </span>
          <h3 className="text-base font-black text-stone-900 tracking-tight mt-1">
            {selectedPrDetails.pr_number}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-stone-400 hover:text-stone-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* PR Information Block */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs grid grid-cols-3 gap-6">
          <div>
            <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block mb-1">
              Project Name
            </span>
            <div className="text-xs font-bold text-stone-900 uppercase">
              {selectedPrDetails.project_name || "-"}
            </div>
          </div>
          <div>
            <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block mb-1">
              Expected Delivery Date
            </span>
            <div className="text-xs font-bold text-emerald-700 font-mono">
              {selectedPrDetails.expected_delivery_date || "As soon as possible"}
            </div>
          </div>
          <div>
            <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block mb-1">
              Document Status
            </span>
            <div>
              <span
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase border",
                  selectedPrDetails.status === "ORDERED"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-700 border-amber-200",
                )}
              >
                {selectedPrDetails.status}
              </span>
            </div>
          </div>

          {selectedPrDetails.drawing_reference && (
            <div className="col-span-3 pt-3 border-t border-stone-100 flex items-center justify-between">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                Technical Drawing Attachment
              </span>
              <a
                href={selectedPrDetails.drawing_reference}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
              >
                <FileText className="w-3.5 h-3.5" /> View Drawing
              </a>
            </div>
          )}
        </div>

        {/* PR Items Table Card */}
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-5 py-3 bg-stone-50 border-b border-stone-200/80">
            <h4 className="text-[10px] font-black text-stone-600 uppercase tracking-widest">
              Requested Materials & Components
            </h4>
          </div>
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/30 text-[9px] font-extrabold text-stone-400 uppercase tracking-widest">
                <th className="py-2.5 px-5">Material Item</th>
                <th className="py-2.5 px-5">Expected Delivery</th>
                <th className="py-2.5 px-5 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {selectedPrDetails.items &&
                selectedPrDetails.items.map((item: any) => (
                  <tr key={item.id} className="hover:bg-stone-50/30">
                    <td className="py-3.5 px-5">
                      <div className="font-mono font-bold text-stone-900 text-[10.5px]">
                        {item.item_code}
                      </div>
                      <div className="text-[11px] font-extrabold text-stone-800 uppercase tracking-tight mt-0.5">
                        {item.item_name}
                      </div>
                      {(item.dimension || item.spec) && (
                        <div className="text-[9px] text-stone-500 mt-0.5 leading-snug">
                          {[item.dimension, item.spec]
                            .filter(Boolean)
                            .join(" • ")}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="text-[10.5px] font-bold text-stone-600 font-mono">
                        {item.expected_delivery_date || "Consolidated"}
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-right font-black text-stone-950 text-[11px] font-mono">
                      {item.qty}{" "}
                      <span className="text-[9px] text-stone-500 font-sans tracking-widest ml-0.5 uppercase">
                        {item.uom}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-4 border-t border-stone-100 flex justify-end bg-white shrink-0">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
});
