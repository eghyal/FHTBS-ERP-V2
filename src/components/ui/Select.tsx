import React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  icon?: React.ReactNode;
  label?: React.ReactNode;
  error?: string;
  helperText?: string;
  wrapperClassName?: string;
}

export const Select = React.memo(
  React.forwardRef<HTMLSelectElement, SelectProps>(
    (
      {
        className,
        icon,
        label,
        error,
        helperText,
        wrapperClassName,
        children,
        id,
        ...props
      },
      ref,
    ) => {
      const generatedId = React.useId();
      const selectId = id || generatedId;
      const [isFocused, setIsFocused] = React.useState(false);

      return (
        <div className={cn("w-full space-y-1.5 text-left", wrapperClassName)}>
          {label && (
            <label
              htmlFor={selectId}
              className="block text-[10px] font-bold text-stone-500 uppercase tracking-widest select-none"
            >
              {label}
            </label>
          )}
          <div className="relative flex items-center w-full">
            {icon && (
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4">
                {icon}
              </div>
            )}
            <select
              id={selectId}
              ref={ref}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className={cn(
                "input-elegant appearance-none cursor-pointer",
                icon ? "!pl-10 pr-10" : "pl-3.5 pr-10",
                error && "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10",
                className,
              )}
              {...props}
            >
              {children}
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none flex items-center justify-center">
              <ChevronDown
                className={cn(
                  "w-4 h-4 transition-transform duration-200",
                  isFocused && "rotate-180 text-stone-700",
                )}
              />
            </div>
          </div>
          {error ? (
            <p className="text-[11px] font-medium text-rose-600 tracking-tight">
              {error}
            </p>
          ) : helperText ? (
            <p className="text-[10px] font-medium text-stone-400 tracking-tight">
              {helperText}
            </p>
          ) : null}
        </div>
      );
    },
  ),
);
Select.displayName = "Select";

