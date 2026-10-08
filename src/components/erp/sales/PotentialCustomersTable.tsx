import React from "react";
import {
  CheckSquare,
  Square,
  Loader2,
  ExternalLink,
  MessageSquare,
  FileText,
  Clock,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Award,
  TrendingUp,
  UserCheck,
  UserSearch,
} from "lucide-react";
import { PotentialCustomer } from "@/types/scout";
import { formatIDR } from "@/lib/utils";

interface PotentialCustomersTableProps {
  customers: PotentialCustomer[];
  selectedIds: string[];
  onSelectAll: () => void;
  onToggleSelect: (id: string) => void;
  onViewDetail: (customer: PotentialCustomer) => void;
  onScoutSingle: (id: string) => void;
  scoutingIds: string[];
  onQuickWhatsApp: (customer: PotentialCustomer) => void;
  onConvertToQuotation: (customer: PotentialCustomer) => void;
}

export function PotentialCustomersTable({
  customers,
  selectedIds,
  onSelectAll,
  onToggleSelect,
  onViewDetail,
  onScoutSingle,
  scoutingIds,
  onQuickWhatsApp,
  onConvertToQuotation,
}: PotentialCustomersTableProps) {
  const isAllSelected = customers.length > 0 && selectedIds.length === customers.length;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-3.5 w-10 text-center">
                <button
                  type="button"
                  onClick={onSelectAll}
                  aria-label="Select All"
                  className="text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
                >
                  {isAllSelected ? (
                    <CheckSquare className="w-4 h-4 text-brand" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="py-3 px-3">Lead / Customer</th>
              <th className="py-3 px-3">Priority Grade</th>
              <th className="py-3 px-3">Cart Value</th>
              <th className="py-3 px-3">Scout Status</th>
              <th className="py-3 px-3">Privacy Consent</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {customers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 px-4 text-center">
                  <div className="max-w-md mx-auto flex flex-col items-center justify-center animate-in fade-in duration-300">
                    <div className="w-12 h-12 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-center justify-center mb-3.5 shadow-2xs text-stone-400">
                      <UserSearch className="w-5 h-5 text-stone-400 stroke-[1.75]" />
                    </div>
                    <p className="font-bold text-stone-800 text-sm tracking-tight mb-1">
                      No Potential Customers Found
                    </p>
                    <p className="text-xs text-stone-400 leading-relaxed max-w-sm">
                      We couldn't find any customer leads matching your active filters. Try adjusting your search query or broadening the filter options.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              customers.map((c) => {
                const isSelected = selectedIds.includes(c.id);
                const isScouting = scoutingIds.includes(c.id);

                return (
                  <tr
                    key={c.id}
                    className={`hover:bg-stone-50/70 transition-colors ${
                      isSelected ? "bg-rose-50/30" : ""
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3.5 px-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => onToggleSelect(c.id)}
                        aria-label={`Select ${c.customer_name}`}
                        className="text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-brand" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Customer Info */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-700 text-xs shrink-0">
                          {c.avatar_url ? (
                            <img
                              src={c.avatar_url}
                              alt={c.customer_name}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            c.customer_name.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onViewDetail(c)}
                            className="font-bold text-stone-900 hover:text-brand transition-colors text-left block truncate max-w-[200px] sm:max-w-xs cursor-pointer"
                          >
                            {c.customer_name}
                          </button>
                          <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                            {c.phone && <span>{c.phone}</span>}
                            {c.phone && c.email && <span>&bull;</span>}
                            {c.email && <span className="truncate max-w-[140px]">{c.email}</span>}
                          </div>
                          {c.company && (
                            <div className="text-[10px] text-stone-400 font-medium mt-0.5 truncate">
                              {c.company}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Lead Grade */}
                    <td className="py-3.5 px-3">
                      {c.lead_grade === "A" ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200 text-brand font-bold text-xs">
                          <Award className="w-3.5 h-3.5" />
                          <span>Grade A</span>
                        </div>
                      ) : c.lead_grade === "B" ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-bold text-xs">
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>Grade B</span>
                        </div>
                      ) : c.lead_grade === "C" ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-xs font-semibold">
                          <span>Grade C</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-50 text-stone-400 text-xs font-medium">
                          <span>Grade D</span>
                        </div>
                      )}
                      <div className="text-[10px] text-stone-400 mt-1 font-mono">
                        Score: {c.potential_score || 0}/100
                      </div>
                    </td>

                    {/* Cart Pipeline */}
                    <td className="py-3.5 px-3">
                      <span className="font-mono font-bold text-stone-900 block">
                        {formatIDR(c.cart_total_value)}
                      </span>
                      <span className="text-[11px] text-stone-400">
                        {c.cart_total_items || 0} items
                      </span>
                    </td>

                    {/* Scout Status */}
                    <td className="py-3.5 px-3">
                      {isScouting ? (
                        <span className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border border-amber-200">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Profiling...
                        </span>
                      ) : c.scout_status === "SCOUTED" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Profiled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md text-[11px] font-medium">
                          <Clock className="w-3 h-3" />
                          Pending
                        </span>
                      )}
                      {c.scouted_at && (
                        <span className="block text-[10px] text-stone-400 mt-0.5">
                          {new Date(c.scouted_at).toLocaleDateString("en-US", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      )}
                    </td>

                    {/* Consent */}
                    <td className="py-3.5 px-3">
                      {c.profiling_consent ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-semibold border border-emerald-200">
                          <ShieldCheck className="w-3 h-3" />
                          Consented
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-stone-500 bg-stone-100 px-2 py-0.5 rounded text-[10px] font-medium border border-stone-200">
                          <ShieldAlert className="w-3 h-3 text-stone-400" />
                          First-Party Only
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Single Scout Trigger */}
                        <button
                          type="button"
                          onClick={() => onScoutSingle(c.id)}
                          disabled={isScouting}
                          className="p-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 transition-colors disabled:opacity-50 cursor-pointer"
                          title="Run Scout AI Analysis"
                        >
                          {isScouting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5 text-stone-600" />
                          )}
                        </button>

                        {/* WhatsApp Outreach */}
                        {c.phone && (
                          <button
                            type="button"
                            onClick={() => onQuickWhatsApp(c)}
                            className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer"
                            title="Contact via WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Convert to Quotation */}
                        <button
                          type="button"
                          onClick={() => onConvertToQuotation(c)}
                          className="p-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 transition-colors cursor-pointer"
                          title="Convert to Official Quotation"
                        >
                          <FileText className="w-3.5 h-3.5 text-stone-600" />
                        </button>

                        {/* Detail Modal Trigger */}
                        <button
                          type="button"
                          onClick={() => onViewDetail(c)}
                          className="px-2.5 py-1.5 rounded-lg bg-brand hover:bg-brand-dark text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                        >
                          <span>Details</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
