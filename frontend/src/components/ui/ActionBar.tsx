import type { ReactNode } from "react";


type ActionBarProps = {
  children: ReactNode;
  className?: string;
};

export function ActionBar({ children, className }: ActionBarProps) {
  const classes = ["action-bar", className].filter(Boolean).join(" ");

  return <div className={classes}>{children}</div>;
}
