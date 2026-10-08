import React from "react";
import { QrCode, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface WarehouseHistoryTabProps {
  movements: any[];
  movementPage: number;
  totalMovements: number;
  setMovementPage: React.Dispatch<React.SetStateAction<number>>;
  setSelectedLabelItem: React.Dispatch<React.SetStateAction<any>>;
  setShowLabelModal: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenPoLabel?: (mov: any) => void;
}

export const WarehouseHistoryTab: React.FC<WarehouseHistoryTabProps> = ({
  movements,
  movementPage,
  totalMovements,
  setMovementPage,
  setSelectedLabelItem,
  setShowLabelModal,
  onOpenPoLabel,
}) => {
  return (
    <div className="px-10 pb-12">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-stone-100">
              <th className="py-8 pr-6 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                Temporal Marker
              </th>
              <th className="py-8 px-6 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                Material Asset
              </th>
              <th className="py-8 px-6 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em] text-center">
                Movement Type
              </th>
              <th className="py-8 px-6 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                Operational Nexus
              </th>
              <th className="py-8 px-6 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                Initiator
              </th>
              <th className="py-8 pl-6 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em] text-right">
                Delta
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100/60">
            {movements.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-32 text-center text-stone-400 font-bold uppercase tracking-[0.2em]"
                  style={{ fontSize: "10px" }}
                >
                  No logistical records detected in the local repository.
                </td>
              </tr>
            ) : (
              movements.map((mov) => (
                <tr
                  key={mov.id}
                  className="hover:bg-stone-50/50 transition-colors"
                >
                  <td className="py-8 pr-6">
                    <div className="text-sm font-bold text-stone-900 tracking-tight uppercase">
                      {new Date(mov.created_at).toLocaleDateString("en-US", {
                        timeZone: "Asia/Jakarta",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <div className="text-[10px] font-bold text-stone-400 tracking-[0.2em] uppercase mt-2 tabular-nums">
                      {new Date(mov.created_at).toLocaleTimeString([], {
                        timeZone: "Asia/Jakarta",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>
                  <td className="py-8 px-6">
                    <div className="text-sm font-bold text-stone-900 tracking-tight uppercase mb-1">
                      {mov.item_code}
                    </div>
                    <div className="text-[10px] text-stone-400 font-bold tracking-tight uppercase truncate max-w-[180px]">
                      {mov.item_name}
                    </div>
                  </td>
                  <td className="py-8 px-6 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center px-3 py-1 rounded-xl text-[9px] font-bold tracking-[0.2em] uppercase ring-1 ring-inset",
                        mov.type === "ALLOCATION"
                          ? "bg-stone-100 text-stone-900 ring-stone-900/10"
                          : mov.type === "GRN"
                            ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
                            : mov.type === "CONSUMPTION"
                              ? "bg-amber-50 text-amber-600 ring-amber-100"
                              : mov.type === "RECLAIM"
                                ? "bg-rose-50 text-rose-600 ring-rose-100"
                                : "bg-stone-50 text-stone-500 ring-stone-100",
                      )}
                    >
                      {mov.type}
                    </span>
                  </td>
                  <td className="py-8 px-6">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-stone-700 tracking-tight uppercase mb-1">
                        {mov.project_name || "CENTRAL REPOSITORY"}
                      </span>
                      <span className="text-[10px] text-stone-400 font-bold tracking-widest uppercase font-mono">
                        {mov.id.slice(0, 8)}
                      </span>
                    </div>
                  </td>
                  <td className="py-8 px-6">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-xl bg-white ring-1 ring-stone-100 flex items-center justify-center text-stone-900 font-bold text-xs uppercase shadow-sm">
                        {(mov.recorded_by || "S").charAt(0)}
                      </div>
                      <span className="text-xs font-bold text-stone-900 tracking-tight uppercase leading-none">
                        {mov.recorded_by || "SYSTEM AUTH"}
                      </span>
                    </div>
                  </td>
                  <td className="py-8 pl-6 text-right">
                    <div className="flex items-center justify-end gap-4">
                      <div className="flex flex-col items-end">
                        <div
                          className={cn(
                            "text-xl font-light tabular-nums leading-none",
                            mov.qty > 0 ? "text-emerald-500" : "text-stone-900",
                          )}
                        >
                          {mov.qty > 0 ? "+" : ""}
                          {mov.qty}
                        </div>
                        <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-stone-400 mt-2 leading-none">
                          {mov.uom}
                        </span>
                      </div>
                      {mov.type === "GRN" && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setSelectedLabelItem(mov);
                              setShowLabelModal(true);
                            }}
                            className="w-8 h-8 flex items-center justify-center text-stone-500 hover:text-stone-950 hover:bg-stone-100 rounded-lg transition-all border border-stone-200"
                            title="Cetak Label QR Barang"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                          {onOpenPoLabel && (
                            <button
                              onClick={() => onOpenPoLabel(mov)}
                              className="w-8 h-8 flex items-center justify-center text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-all border border-amber-200"
                              title="Cetak Label PO Penerimaan"
                            >
                              <Tag className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-8 border-t border-stone-100 pt-6">
        <div className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">
          Showing {movements.length > 0 ? movementPage * 100 + 1 : 0} to{" "}
          {Math.min((movementPage + 1) * 100, totalMovements)} of {totalMovements}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMovementPage((p) => Math.max(0, p - 1))}
            disabled={movementPage === 0}
            className="px-4 py-2 border border-stone-200 rounded-xl text-[10px] uppercase font-bold tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-50 transition-colors bg-white shadow-sm"
          >
            Previous
          </button>
          <button
            onClick={() => setMovementPage((p) => p + 1)}
            disabled={(movementPage + 1) * 100 >= totalMovements}
            className="px-4 py-2 border border-stone-200 rounded-xl text-[10px] uppercase font-bold tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-50 transition-colors bg-white shadow-sm"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
