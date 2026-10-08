import React, { memo } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState = memo(function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-stone-50/60 border border-stone-200/80 border-dashed rounded-2xl",
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-white border border-stone-200/80 shadow-2xs flex items-center justify-center text-stone-400 mb-4 [&>svg]:w-6 [&>svg]:h-6">
          {icon}
        </div>
      )}
      <h4 className="text-sm sm:text-base font-bold text-stone-800 tracking-tight">
        {title}
      </h4>
      {description && (
        <p className="mt-1 text-xs sm:text-sm text-stone-500 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
});
