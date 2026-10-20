import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

// Tables scroll sideways inside their own box on small screens, never the page.
export function TableWrap({ children, className = "", maxHeight }: { children: ReactNode; className?: string; maxHeight?: string }) {
  return (
    <div className={cn("overflow-auto", className)} style={maxHeight ? { maxHeight } : undefined}>
      {children}
    </div>
  );
}

export function Table({ children, className = "", minWidth }: { children: ReactNode; className?: string; minWidth?: number }) {
  return (
    <table className={cn("w-full border-separate border-spacing-0 text-sm", className)} style={minWidth ? { minWidth } : undefined}>
      {children}
    </table>
  );
}

export function Th({ children, className = "", align = "left", sticky = false, ...rest }: { align?: "left" | "right" | "center"; sticky?: boolean } & ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-line bg-surface-2 px-3 py-2 text-xs font-medium whitespace-nowrap text-muted first:pl-4 last:pr-4",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        sticky && "sticky top-0 z-10",
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "", align = "left", ...rest }: { align?: "left" | "right" | "center" } & TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "border-b border-line px-3 py-2.5 align-middle first:pl-4 last:pr-4 [tr:last-child_&]:border-b-0",
        align === "right" ? "text-right tabular-nums" : align === "center" ? "text-center" : "",
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return <tr className={cn("transition-colors hover:bg-surface-2", onClick && "cursor-pointer", className)} onClick={onClick}>{children}</tr>;
}
