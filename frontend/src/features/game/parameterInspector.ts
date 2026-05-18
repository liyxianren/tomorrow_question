import type { ReactNode } from "react";

export type ParameterBindingSource = {
  fileName: string;
  path: Array<string | number>;
  pathLabel: string;
  label?: string;
  contextLabel?: string;
  fieldLabel?: string;
  value: number;
};

export type ParameterBinding = {
  targetKey: string;
  title: string;
  currentEffect: string;
  sources: ParameterBindingSource[];
};

export type ParameterInspector = {
  render: (targetKey: string, options?: { title?: string; currentEffect?: string }) => ReactNode;
};
