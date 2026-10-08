import React from "react";
import { Users, Award, TrendingUp, ShoppingBag, ShieldCheck } from "lucide-react";
import { StatsSummary } from "@/types/scout";
import { formatIDR } from "@/lib/utils";

interface PotentialCustomersStatsProps {
  stats: StatsSummary;
}

export function PotentialCustomersStats({ stats }: PotentialCustomersStatsProps) {
  const conversionRate =
    stats.total_leads > 0
      ? Math.round((stats.converted_count / stats.total_leads) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
      {/* 1. Total Leads */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Total Leads</span>
          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
            <Users className="w-3.5 h-3.5" />
          </div>
        </div>
        <div>
          <span className="text-2xl font-bold font-mono text-slate-900 leading-none block">
            {stats.total_leads.toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">
            {stats.scouted_count} profiled
          </span>
        </div>
      </div>

      {/* 2. Grade A (Hot) */}
      <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-rose-700 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Grade A (High)</span>
          <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center text-brand">
            <Award className="w-3.5 h-3.5" />
          </div>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-brand leading-none">
              {stats.grade_a_count}
            </span>
            <span className="text-[10px] font-semibold bg-rose-50 text-brand px-1.5 py-0.5 rounded border border-rose-200/60">
              Immediate
            </span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">
            Ready for closing
          </span>
        </div>
      </div>

      {/* 3. Grade B (Warm) */}
      <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-amber-700 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Grade B (Medium)</span>
          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
        </div>
        <div>
          <span className="text-2xl font-bold font-mono text-amber-900 leading-none block">
            {stats.grade_b_count}
          </span>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">
            Nurturing pipeline
          </span>
        </div>
      </div>

      {/* 4. Cart Pipeline Value */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Pipeline Value</span>
          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
            <ShoppingBag className="w-3.5 h-3.5" />
          </div>
        </div>
        <div>
          <span className="text-xl sm:text-2xl font-bold font-mono text-slate-900 leading-none block truncate">
            {formatIDR(stats.total_cart_pipeline_value)}
          </span>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">
            Active cart intent
          </span>
        </div>
      </div>

      {/* 5. Consent & Conversion */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between col-span-2 lg:col-span-1">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Conversions</span>
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-900 leading-none">
              {stats.converted_count}
            </span>
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
              {conversionRate}% Rate
            </span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">
            {stats.consented_count} consented
          </span>
        </div>
      </div>
    </div>
  );
}
