import React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  endIcon?: React.ReactNode;
  label?: React.ReactNode;
  error?: string;
  helperText?: string;
  wrapperClassName?: string;
}

export const Input = React.memo(
  React.forwardRef<HTMLInputElement, InputProps>(
    (
      {
        className,
        icon,
        endIcon,
        label,
        error,
        helperText,
        wrapperClassName,
        id,
        ...props
      },
      ref,
    ) => {
      const generatedId = React.useId();
      const inputId = id || generatedId;

      return (
        <div className={cn("w-full space-y-1.5 text-left", wrapperClassName)}>
          {label && (
            <label
              htmlFor={inputId}
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
            <input
              id={inputId}
              ref={ref}
              className={cn(
                "input-elegant",
                icon ? "!pl-10" : "pl-3.5",
                endIcon ? "!pr-10" : "pr-3.5",
                error && "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10",
                className,
              )}
              {...props}
            />
            {endIcon && (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4">
                {endIcon}
              </div>
            )}
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
Input.displayName = "Input";

