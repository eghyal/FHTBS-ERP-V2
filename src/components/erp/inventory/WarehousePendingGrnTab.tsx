import React from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface WarehousePendingGrnTabProps {
  pendingGrns: any[];
  handleReturnGrn: (id: string) => void;
  handleIntakeGrn: (id: string) => void;
}

export const WarehousePendingGrnTab: React.FC<WarehousePendingGrnTabProps> = ({
  pendingGrns,
  handleReturnGrn,
  handleIntakeGrn,
}) => {
  return (
    <div className="px-10 pb-12">
      <div className="bg-white rounded-[2rem] border border-stone-100 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/30">
              <th className="py-8 px-10 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                Logistics Arrival
              </th>
              <th className="py-8 px-10 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                Origin / Document
              </th>
              <th className="py-8 px-10 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                Receiver & Inspector
              </th>
              <th className="py-8 px-10 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                Status
              </th>
              <th className="py-8 px-10 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em] text-right">
                Protocol
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100/60 transition-all">
            {pendingGrns.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-32 text-center text-stone-400 font-bold uppercase tracking-[0.2em]"
                  style={{ fontSize: "10px" }}
                >
                  All purchasing material logistics are currently
                  dispositioned.
                </td>
              </tr>
            ) : (
              pendingGrns.map((grn) => (
                <tr
                  key={grn.id}
                  className="hover:bg-stone-50/50 transition-colors"
                >
                  <td className="py-8 px-10">
                    <div className="text-sm font-bold text-stone-950 tracking-tight uppercase">
                      {new Date(grn.received_date).toLocaleDateString(
                        "en-US",
                        {
                          timeZone: "Asia/Jakarta",
                          month: "long",
                          day: "numeric",
                        },
                      )}
                    </div>
                  </td>
                  <td className="py-8 px-10">
                    <div className="text-sm font-bold text-stone-900 tracking-tight uppercase mb-1">
                      {grn.po_number}
                    </div>
                    <div className="text-[10px] uppercase font-bold tracking-[0.15em] text-stone-400 mt-1">
                      {grn.supplier_name}
                    </div>
                  </td>
                  <td className="py-8 px-10">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-900 font-bold text-[10px] uppercase">
                        {(grn.engineering_user || grn.qc_user || "U").charAt(0)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-stone-800 uppercase tracking-tight leading-none">
                          {grn.engineering_user || grn.qc_user || "Authorized Staff"}
                        </div>
                        <div className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest mt-1.5 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> Direct Verified
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-8 px-10">
                    <span
                      className={cn(
                        "inline-flex items-center px-3 py-1 rounded-xl text-[9px] font-bold tracking-[0.2em] border shadow-sm uppercase ring-1 ring-inset",
                        grn.qc_status === "PASSED"
                          ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
                          : grn.qc_status === "CONDITIONAL"
                            ? "bg-amber-50 text-amber-600 ring-amber-100"
                            : "bg-rose-50 text-rose-600 ring-rose-100",
                      )}
                    >
                      {grn.qc_status}
                    </span>
                  </td>
                  <td className="py-8 px-10 text-right">
                    {grn.qc_status === "REJECTED" ? (
                      <button
                        onClick={() => handleReturnGrn(grn.id)}
                        className="bg-rose-50 text-rose-600 ring-1 ring-rose-200 px-6 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-[0.1em] shadow-sm hover:bg-rose-100 transition-all active:scale-95"
                      >
                        Dispatch Reject
                      </button>
                    ) : (
                      <button
                        onClick={() => handleIntakeGrn(grn.id)}
                        className="bg-stone-900 hover:bg-stone-800 text-white px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-[0.1em] shadow-xs transition-all hover:-translate-y-0.5 active:translate-y-0"
                      >
                        Commit Intake
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
