import React, { memo } from "react";
import { cn } from "@/lib/utils";

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  required?: boolean;
  error?: string;
  helperText?: string;
  htmlFor?: string;
}

export const FormField = memo(function FormField({
  label,
  required,
  error,
  helperText,
  htmlFor,
  children,
  className,
  ...props
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5 w-full", className)} {...props}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-[11px] font-bold uppercase tracking-wider text-stone-600"
        >
          {label}
          {required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="text-[11px] font-medium text-rose-600">{error}</p>
      )}
      {!error && helperText && (
        <p className="text-[11px] text-stone-400 font-medium">{helperText}</p>
      )}
    </div>
  );
});
