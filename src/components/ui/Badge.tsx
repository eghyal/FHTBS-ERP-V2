import React, { memo } from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "default"
    | "neutral"
    | "primary"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "purple";
  size?: "sm" | "md" | "lg";
  dot?: boolean;
}

const variantStyles: Record<string, string> = {
  default: "bg-stone-100 text-stone-700 border-stone-200/80",
  neutral: "bg-stone-100 text-stone-700 border-stone-200",
  primary: "bg-stone-900 text-stone-50 border-stone-800",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  warning: "bg-amber-50 text-amber-800 border-amber-200/80",
  danger: "bg-rose-50 text-rose-700 border-rose-200/80",
  info: "bg-blue-50 text-blue-700 border-blue-200/80",
  purple: "bg-purple-50 text-purple-700 border-purple-200/80",
};

const dotColors: Record<string, string> = {
  default: "bg-stone-400",
  neutral: "bg-stone-500",
  primary: "bg-stone-200",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-blue-500",
  purple: "bg-purple-500",
};

const sizeStyles: Record<string, string> = {
  sm: "text-[10px] px-2 py-0.5 font-bold tracking-wider",
  md: "text-xs px-2.5 py-1 font-semibold tracking-wide",
  lg: "text-sm px-3 py-1.5 font-semibold tracking-normal",
};

export const Badge = memo(function Badge({
  className,
  variant = "default",
  size = "sm",
  dot = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border uppercase transition-colors select-none whitespace-nowrap",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColors[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
});
