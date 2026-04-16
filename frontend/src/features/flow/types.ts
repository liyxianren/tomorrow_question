export type FlowTaskStatus = "completed" | "current" | "upcoming";

export type PageStatusTone = "neutral" | "info" | "success" | "warning";

export type FlowTaskItem = {
  id: string;
  title: string;
  description: string;
  status: FlowTaskStatus;
};

export type PageStatusBannerState = {
  tone: PageStatusTone;
  eyebrow?: string;
  title: string;
  detail: string;
  tags?: string[];
};

export type PageFlowState = {
  banner: PageStatusBannerState;
  tasks: FlowTaskItem[];
};
