import type { ReactNode } from "react";


type StatusBadgeProps = {
  children: ReactNode;
  tone?: "accent" | "muted" | "success";
};

export function StatusBadge({ children, tone = "accent" }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}
