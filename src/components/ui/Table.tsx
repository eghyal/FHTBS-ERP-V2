import React, { memo } from "react";
import { cn } from "@/lib/utils";

export const Table = memo(
  React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
    ({ className, ...props }, ref) => (
      <div className="relative w-full overflow-x-auto custom-scrollbar rounded-xl border border-stone-200/80 bg-white">
        <table
          ref={ref}
          className={cn("w-full caption-bottom text-xs sm:text-sm border-collapse", className)}
          {...props}
        />
      </div>
    ),
  ),
);
Table.displayName = "Table";

export const TableHeader = memo(
  React.forwardRef<
    HTMLTableSectionElement,
    React.HTMLAttributes<HTMLTableSectionElement>
  >(({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn("bg-stone-50 border-b border-stone-200/80 sticky top-0 z-10", className)}
      {...props}
    />
  )),
);
TableHeader.displayName = "TableHeader";

export const TableBody = memo(
  React.forwardRef<
    HTMLTableSectionElement,
    React.HTMLAttributes<HTMLTableSectionElement>
  >(({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn("divide-y divide-stone-100 bg-white", className)}
      {...props}
    />
  )),
);
TableBody.displayName = "TableBody";

export const TableFooter = memo(
  React.forwardRef<
    HTMLTableSectionElement,
    React.HTMLAttributes<HTMLTableSectionElement>
  >(({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn(
        "border-t border-stone-200 bg-stone-50/50 font-medium text-stone-900",
        className,
      )}
      {...props}
    />
  )),
);
TableFooter.displayName = "TableFooter";

export const TableRow = memo(
  React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
    ({ className, ...props }, ref) => (
      <tr
        ref={ref}
        className={cn(
          "transition-colors hover:bg-stone-50/70 data-[state=selected]:bg-stone-100",
          className,
        )}
        {...props}
      />
    ),
  ),
);
TableRow.displayName = "TableRow";

export const TableHead = memo(
  React.forwardRef<
    HTMLTableCellElement,
    React.ThHTMLAttributes<HTMLTableCellElement>
  >(({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-10 px-3.5 sm:px-4 text-left align-middle font-extrabold text-stone-600 text-[10px] sm:text-[11px] uppercase tracking-wider select-none whitespace-nowrap",
        className,
      )}
      {...props}
    />
  )),
);
TableHead.displayName = "TableHead";

export const TableCell = memo(
  React.forwardRef<
    HTMLTableCellElement,
    React.TdHTMLAttributes<HTMLTableCellElement>
  >(({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn("p-3 sm:p-4 align-middle text-stone-700 font-normal leading-relaxed", className)}
      {...props}
    />
  )),
);
TableCell.displayName = "TableCell";

export const TableEmpty = memo(function TableEmpty({
  colSpan,
  message = "Tidak ada data yang tersedia",
  icon,
}: {
  colSpan: number;
  message?: string;
  icon?: React.ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="h-32 text-center p-8 text-stone-400 font-medium select-none"
      >
        <div className="flex flex-col items-center justify-center gap-2">
          {icon && <div className="text-stone-300 [&>svg]:w-8 [&>svg]:h-8">{icon}</div>}
          <p className="text-xs sm:text-sm font-semibold">{message}</p>
        </div>
      </td>
    </tr>
  );
});
