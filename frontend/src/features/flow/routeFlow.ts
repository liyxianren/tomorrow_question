import type { FlowTaskItem, PageFlowState, PageStatusBannerState } from "./types";


type FlowStageId = "lobby" | "room" | "game" | "settlement" | "unknown";

const FLOW_STAGES = [
  {
    id: "lobby",
    title: "大厅",
    description: "创建房间、加入房间或恢复既有会话。",
  },
  {
    id: "room",
    title: "房间",
    description: "确认成员、选国并完成开局准备。",
  },
  {
    id: "game",
    title: "对局",
    description: "按阶段提交并等待结算。",
  },
  {
    id: "settlement",
    title: "结算",
    description: "查看最终排名，并返回大厅或房间继续下一局。",
  },
] satisfies Array<Pick<FlowTaskItem, "id" | "title" | "description">>;

const BANNERS_BY_STAGE: Record<FlowStageId, PageStatusBannerState> = {
  lobby: {
    tone: "info",
    eyebrow: "Flow Status",
    title: "当前位于大厅阶段",
    detail: "壳层只提供流程入口说明与恢复提示，创建、加入、恢复等动作仍由页面自身负责。",
    tags: ["可测试", "可演示"],
  },
  room: {
    tone: "info",
    eyebrow: "Flow Status",
    title: "当前位于房间阶段",
    detail: "页面只展示准备阶段所需信息，房间同步和开局仍由房间页自身消费上下文完成。",
    tags: ["可恢复", "无壳层副作用"],
  },
  game: {
    tone: "info",
    eyebrow: "Flow Status",
    title: "当前位于对局阶段",
    detail: "壳层只表达流程位置，不直接驱动阶段提交、快照同步或结算跳转。",
    tags: ["阶段链路", "页面自消费 flow 输出"],
  },
  settlement: {
    tone: "success",
    eyebrow: "Flow Status",
    title: "当前位于结算阶段",
    detail: "结算页应只消费最终结果与恢复态，壳层保持纯展示，不额外创建会话副作用。",
    tags: ["可回退大厅", "结果只读"],
  },
  unknown: {
    tone: "warning",
    eyebrow: "Flow Status",
    title: "当前位于未识别页面",
    detail: "该页面不在标准主流程内，壳层仅保留导航与流程说明。",
    tags: ["待确认路由"],
  },
};

function resolveFlowStage(pathname: string): FlowStageId {
  if (pathname === "/") {
    return "lobby";
  }

  if (pathname.startsWith("/room/")) {
    return "room";
  }

  if (pathname.startsWith("/game/")) {
    return "game";
  }

  if (pathname.startsWith("/settlement/")) {
    return "settlement";
  }

  return "unknown";
}

export function createRouteFlowState(pathname: string): PageFlowState {
  const activeStage = resolveFlowStage(pathname);
  const activeIndex = FLOW_STAGES.findIndex((stage) => stage.id === activeStage);

  return {
    banner: BANNERS_BY_STAGE[activeStage],
    tasks: FLOW_STAGES.map((stage, index) => ({
      ...stage,
      status: activeIndex === -1 ? "upcoming" : index < activeIndex ? "completed" : index === activeIndex ? "current" : "upcoming",
    })),
  };
}
