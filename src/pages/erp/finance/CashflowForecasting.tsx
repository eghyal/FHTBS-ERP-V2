import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { formatIDR } from "@/lib/utils";
import { RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ForecastWeek {
  week_label: string;
  inflows: number;
  outflows: number;
  net: number;
  projected_balance: number;
}

export default function CashflowForecasting() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const fetchForecast = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/finance/cashflow-forecast", {}, user?.username);
      if (res.ok && res.data) {
        setData(res.data);
      } else {
        showToast("Failed to load cash flow forecast", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Connection error", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
  }, []);

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <PageHeader
        title="Cash Flow & Treasury Forecasting"
        subtitle="Rolling liquidity and cash flow projection"
        icon={<TrendingUp className="w-5 h-5" />}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchForecast}
            disabled={isLoading}
            className="border-stone-200 text-stone-700 hover:bg-stone-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Recalculate Forecast
          </Button>
        }
      />

      {/* Primary Liquidity Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Verified Cash & Bank Balance
          </div>
          <div className="text-2xl font-bold font-mono text-stone-900 mt-1.5 tabular-nums">
            {formatIDR(data?.starting_cash || 0)}
          </div>
          <div className="text-[11px] text-stone-400 mt-1">Reconciled balance from GL 1101 accounts</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Average Weekly Outflow (Burn Rate)
          </div>
          <div className="text-2xl font-bold font-mono text-stone-900 mt-1.5 tabular-nums">
            {formatIDR(data?.burn_rate_weekly || 0)}
          </div>
          <div className="text-[11px] text-stone-400 mt-1">Vendor payables and payroll obligations</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Estimated Liquidity Runway
          </div>
          <div className="text-2xl font-bold font-mono text-stone-900 mt-1.5 tabular-nums">
            {data?.runway_weeks || 0} Weeks
          </div>
          <div className="text-[11px] text-stone-400 mt-1">Reserve coverage under current burn rate</div>
        </div>
      </div>

      {/* 4-Week Rolling Forecast Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200">
          <h3 className="font-semibold text-stone-900 text-sm">
            Rolling 4-Week Cash Flow Projection
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Forecasted net position combining customer invoice due dates and vendor disbursement schedules.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 uppercase text-[10px] font-semibold tracking-wider">
                <th className="py-3 px-5">Time Horizon</th>
                <th className="py-3 px-5 text-right">Projected Inflow (AR)</th>
                <th className="py-3 px-5 text-right">Projected Outflow (AP & Payroll)</th>
                <th className="py-3 px-5 text-right">Net Cash Flow</th>
                <th className="py-3 px-5 text-right">Projected Closing Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data?.forecast?.map((item: ForecastWeek, idx: number) => (
                <tr key={idx} className="hover:bg-stone-50/60 transition-colors">
                  <td className="py-4 px-5 font-semibold text-stone-900 text-xs">
                    {item.week_label}
                  </td>
                  <td className="py-4 px-5 text-right font-mono font-medium text-emerald-700 tabular-nums">
                    +{formatIDR(item.inflows)}
                  </td>
                  <td className="py-4 px-5 text-right font-mono font-medium text-rose-700 tabular-nums">
                    -{formatIDR(item.outflows)}
                  </td>
                  <td className={`py-4 px-5 text-right font-mono font-semibold tabular-nums ${
                    item.net >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}>
                    {item.net >= 0 ? "+" : ""}{formatIDR(item.net)}
                  </td>
                  <td className="py-4 px-5 text-right font-mono font-bold text-stone-900 text-sm tabular-nums">
                    {formatIDR(item.projected_balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
