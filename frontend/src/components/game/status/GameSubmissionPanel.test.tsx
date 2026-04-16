import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PhaseActionStatusViewModel } from "../../../features/game/flow/gameFlow";

import { GameSubmissionPanel } from "./GameSubmissionPanel";


function createStatus(overrides: Partial<PhaseActionStatusViewModel>): PhaseActionStatusViewModel {
  return {
    badge: "可提交",
    description: "确认本阶段操作无误后即可提交，系统会在所有玩家完成后统一结算。",
    kind: "actionable",
    showSubmitAction: true,
    title: "现在轮到你完成市场阶段安排",
    ...overrides,
  };
}

describe("GameSubmissionPanel", () => {
  it("collapses actionable state into a player-facing submit status", () => {
    render(<GameSubmissionPanel status={createStatus({})} />);

    expect(screen.getByTestId("game-phase-status-badge")).toHaveTextContent("当前状态：可提交");
    expect(screen.getByText("现在轮到你完成市场阶段安排")).toBeInTheDocument();
  });

  it("collapses submitted state into waiting feedback wording", () => {
    render(
      <GameSubmissionPanel
        status={createStatus({
          badge: "已提交",
          description: "还有 1 名玩家尚未完成本阶段操作，系统会在全部提交后给出结果。",
          kind: "submitted",
          showSubmitAction: false,
          title: "你已提交，正在等待其他玩家",
        })}
      />,
    );

    expect(screen.getByTestId("game-phase-status-badge")).toHaveTextContent("当前状态：已提交");
    expect(screen.getByText("你已提交，正在等待其他玩家")).toBeInTheDocument();
  });

  it("surfaces a distinct system-settling status after all players have submitted", () => {
    render(
      <GameSubmissionPanel
        status={createStatus({
          badge: "系统结算中",
          description: "所有玩家都已完成操作，系统正在汇总本阶段结果。",
          kind: "submitted",
          showSubmitAction: false,
          title: "所有玩家已提交，系统正在结算",
        })}
      />,
    );

    expect(screen.getByTestId("game-phase-status-badge")).toHaveTextContent("当前状态：系统结算中");
    expect(screen.getByText("所有玩家已提交，系统正在结算")).toBeInTheDocument();
  });

  it("collapses settled state into a result-ready wording", () => {
    render(
      <GameSubmissionPanel
        status={createStatus({
          badge: "已结算",
          description: "先阅读下方结果反馈，再准备当前阶段的新安排。",
          kind: "settled",
          showSubmitAction: false,
          title: "上一阶段已经结算完成",
        })}
      />,
    );

    expect(screen.getByTestId("game-phase-status-badge")).toHaveTextContent("当前状态：阶段已结算");
    expect(screen.getByText("上一阶段已经结算完成")).toBeInTheDocument();
  });
});
