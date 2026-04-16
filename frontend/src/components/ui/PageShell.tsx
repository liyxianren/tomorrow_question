import type { ReactNode } from "react";


type PageShellProps = {
  children: ReactNode;
  className?: string;
  width?: "default" | "wide" | "workbench";
};

export function PageShell({ children, className, width = "default" }: PageShellProps) {
  const classes = ["page-shell", `page-shell--${width}`, className].filter(Boolean).join(" ");

  return <div className={classes}>{children}</div>;
}
