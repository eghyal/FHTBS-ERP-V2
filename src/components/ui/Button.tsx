import React, { memo } from "react";
import { cn } from "@/lib/utils";
import {
  Loader2,
  ShieldCheck,
  FileEdit,
  XCircle,
  Trash2,
  Edit2,
  Plus,
  Eye,
  CheckCircle2,
  Download,
  AlertCircle,
} from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "ghost"
    | "danger"
    | "danger_soft"
    | "success"
    | "success_soft"
    | "warning"
    | "warning_soft"
    | "info"
    | "info_soft";
  size?: "xs" | "sm" | "md" | "lg" | "icon";
  action?:
    | "authorize"
    | "revise"
    | "cancel"
    | "delete"
    | "edit"
    | "create"
    | "view"
    | "approve"
    | "reject";
  isLoading?: boolean;
}

const actionMap: Record<string, { variant: any; icon: any; text: string; tooltip?: string }> = {
  authorize: { variant: "success", icon: ShieldCheck, text: "", tooltip: "Authorize" },
  approve: { variant: "success", icon: ShieldCheck, text: "Approve" },
  revise: { variant: "warning_soft", icon: FileEdit, text: "", tooltip: "Revise" },
  cancel: { variant: "secondary", icon: null, text: "Cancel" },
  delete: { variant: "danger_soft", icon: Trash2, text: "Delete" },
  edit: { variant: "secondary", icon: Edit2, text: "Edit" },
  create: { variant: "primary", icon: Plus, text: "Create" },
  view: { variant: "secondary", icon: Eye, text: "" },
  reject: { variant: "danger_soft", icon: XCircle, text: "Reject" },
};

const variants: Record<string, string> = {
  primary:
    "bg-stone-900 text-white hover:bg-stone-800 shadow-xs border border-transparent focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none",
  secondary:
    "bg-white border border-stone-200 text-stone-800 hover:bg-stone-50 hover:text-stone-900 shadow-xs focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none",
  ghost:
    "bg-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-100/80 border border-transparent focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 shadow-xs border border-transparent focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none",
  danger_soft:
    "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/60 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none",
  success:
    "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs border border-transparent focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
  success_soft:
    "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
  warning:
    "bg-amber-600 text-white hover:bg-amber-700 shadow-xs border border-transparent focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none",
  warning_soft:
    "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none",
  info: "bg-blue-600 text-white hover:bg-blue-700 shadow-xs border border-transparent focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none",
  info_soft:
    "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/60 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none",
};

const sizes: Record<string, string> = {
  xs: "px-2.5 py-1 rounded-lg text-xs font-medium",
  "icon-xs": "p-1.5 rounded-lg",
  sm: "px-3 py-1.5 rounded-xl text-xs font-semibold",
  "icon-sm": "p-2 rounded-xl",
  md: "px-4 py-2 rounded-xl text-sm font-semibold",
  lg: "px-5 py-2.5 rounded-xl text-sm font-semibold",
  icon: "p-2 rounded-xl",
};

export const Button = memo(function Button({
  className,
  variant,
  size = "md",
  type = "button",
  action,
  isLoading,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const activeMapping = action ? actionMap[action] : null;
  const finalVariant = variant || activeMapping?.variant || "primary";
  const Icon = activeMapping?.icon;
  const defaultText = activeMapping?.text;
  const finalChildren = children ?? defaultText;
  const isIconOnly = !finalChildren && !!Icon;
  const tooltip = props.title || activeMapping?.tooltip;

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={cn(
        "transition-colors duration-150 whitespace-nowrap shrink-0 font-medium active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 select-none",
        variants[finalVariant],
        sizes[size],
        className,
        isIconOnly && size === "xs" ? "!p-1.5" : "",
        isIconOnly && size === "sm" ? "!p-2" : "",
      )}
      {...props}
      title={tooltip || props.title}
    >
      {isLoading && (
        <Loader2
          className={cn(
            "animate-spin shrink-0",
            size === "xs" ? "w-3 h-3" : "w-4 h-4",
          )}
        />
      )}
      {!isLoading && Icon && (
        <Icon
          className={cn(
            "shrink-0",
            size === "xs"
              ? "w-3 h-3"
              : size === "sm"
                ? "w-3.5 h-3.5"
                : "w-4 h-4",
          )}
        />
      )}
      {finalChildren}
    </button>
  );
});
