import React from "react";

interface WarehouseReservationsTabProps {
  reservations: any[];
}

export const WarehouseReservationsTab: React.FC<WarehouseReservationsTabProps> = ({
  reservations,
}) => {
  return (
    <div className="px-10 pb-12">
      <div className="bg-white rounded-[2rem] border border-stone-100 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/30">
              <th className="py-8 px-10 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                Reservation ID
              </th>
              <th className="py-8 px-10 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                Material
              </th>
              <th className="py-8 px-10 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                Project / SPK
              </th>
              <th className="py-8 px-10 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em] text-right">
                Allocated Qty
              </th>
              <th className="py-8 px-10 text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em] text-center">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {reservations.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-stone-400 text-sm">
                  No active stock reservations
                </td>
              </tr>
            ) : (
              reservations.map((res) => (
                <tr key={res.id} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
                  <td className="py-5 px-10">
                    <span className="text-xs font-mono font-medium text-stone-600 bg-stone-100 px-2 py-1 rounded-md">
                      {res.id}
                    </span>
                  </td>
                  <td className="py-5 px-10">
                    <div className="text-sm font-bold text-stone-900">{res.name}</div>
                    <div className="text-[11px] text-stone-500">{res.item_code}</div>
                  </td>
                  <td className="py-5 px-10">
                    <div className="text-sm font-medium text-stone-900">{res.project_name || res.project_id}</div>
                    {res.spk_id && <div className="text-[11px] text-stone-500">{res.spk_id}</div>}
                  </td>
                  <td className="py-5 px-10 text-right text-sm font-bold text-stone-900">
                    {res.qty.toLocaleString()}
                  </td>
                  <td className="py-5 px-10 text-center">
                    <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-600">
                      {res.status}
                    </span>
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
