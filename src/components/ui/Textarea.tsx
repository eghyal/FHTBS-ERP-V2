import React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = React.memo(
  React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, error, ...props }, ref) => {
      return (
        <textarea
          ref={ref}
          className={cn(
            "input-elegant min-h-[80px] py-2.5 px-3.5 text-xs sm:text-sm resize-y",
            error && "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10",
            className,
          )}
          {...props}
        />
      );
    },
  ),
);
Textarea.displayName = "Textarea";
