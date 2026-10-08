import React, { memo } from "react";
import { cn } from "@/lib/utils";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  iconBgColor?: string;
  trend?: {
    value: string | number;
    isPositive?: boolean;
    label?: string;
  };
  isLoading?: boolean;
}

export const StatCard = memo(function StatCard({
  title,
  value,
  subtitle,
  icon,
  iconBgColor = "bg-stone-100 text-stone-700",
  trend,
  isLoading,
  className,
  ...props
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-stone-200/80 bg-white p-4 sm:p-5 shadow-2xs transition-all hover:shadow-xs",
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500 truncate">
            {title}
          </p>
          <div className="mt-1.5 flex items-baseline gap-2">
            {isLoading ? (
              <div className="h-7 w-24 animate-pulse rounded-lg bg-stone-200" />
            ) : (
              <h4 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 tabular-nums truncate">
                {value}
              </h4>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 text-xs text-stone-500 font-medium truncate">
              {subtitle}
            </p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
              <span
                className={cn(
                  "tabular-nums",
                  trend.isPositive ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {trend.isPositive ? "+" : ""}
                {trend.value}
              </span>
              {trend.label && (
                <span className="text-stone-400 font-normal">{trend.label}</span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 [&>svg]:w-5 [&>svg]:h-5",
              iconBgColor,
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
});
