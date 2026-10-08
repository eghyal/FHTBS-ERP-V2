import React, { memo } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "subtle" | "flat" | "elevated";
  padding?: "none" | "sm" | "md" | "lg";
}

const variantStyles: Record<string, string> = {
  default: "bg-white border border-stone-200/80 shadow-2xs",
  subtle: "bg-stone-50/60 border border-stone-200/60",
  flat: "bg-white border border-stone-200",
  elevated: "bg-white border border-stone-200/80 shadow-sm hover:shadow-md transition-shadow",
};

const paddingStyles: Record<string, string> = {
  none: "p-0",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-6",
  lg: "p-6 sm:p-8",
};

export const Card = memo(function Card({
  className,
  variant = "default",
  padding = "md",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl relative overflow-hidden transition-all duration-200",
        variantStyles[variant],
        paddingStyles[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export const CardHeader = memo(function CardHeader({
  className,
  title,
  subtitle,
  icon,
  actions,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-stone-100",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="w-8 h-8 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {title && (
            <h3 className="text-sm sm:text-base font-bold text-stone-900 tracking-tight truncate">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-[10px] sm:text-xs font-semibold text-stone-500 uppercase tracking-wider truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      {children}
    </div>
  );
});
