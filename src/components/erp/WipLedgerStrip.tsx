import React from "react";
import { ArrowRight, AlertTriangle, PackageCheck } from "lucide-react";

interface WipLedgerStripProps {
  upstreamName: string;
  downstreamName: string;
  availableWip: number;
  isStarved: boolean;
}

export const WipLedgerStrip: React.FC<WipLedgerStripProps> = ({
  upstreamName,
  downstreamName,
  availableWip,
  isStarved
}) => {
  return (
    <div className="flex flex-col items-center justify-center px-2 py-3 shrink-0">
      <div className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider flex items-center gap-1 shadow-2xs border transition-all ${
        isStarved
          ? "bg-amber-50 text-amber-800 border-amber-300 animate-pulse"
          : availableWip > 0
          ? "bg-emerald-50 text-emerald-800 border-emerald-300"
          : "bg-stone-100 text-stone-600 border-stone-200"
      }`}>
        {isStarved ? (
          <>
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>0 pcs WIP (STARVED)</span>
          </>
        ) : (
          <>
            <PackageCheck className="w-3 h-3 text-emerald-600" />
            <span>{availableWip} pcs Buffer</span>
          </>
        )}
      </div>
      <ArrowRight className={`w-4 h-4 my-1 ${isStarved ? "text-amber-400" : "text-stone-400"}`} />
    </div>
  );
};
