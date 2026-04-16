import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FlowTaskItem } from "../../features/flow/types";

import { FlowTaskList } from "./FlowTaskList";


const tasks: FlowTaskItem[] = [
  {
    id: "lobby",
    title: "大厅",
    description: "创建房间、加入房间或恢复既有会话。",
    status: "completed",
  },
  {
    id: "room",
    title: "房间",
    description: "确认成员、选国并完成开局准备。",
    status: "current",
  },
  {
    id: "game",
    title: "对局",
    description: "按阶段提交并等待结算。",
    status: "upcoming",
  },
];

describe("FlowTaskList", () => {
  it("renders a reusable task chain and marks the current step accessibly", () => {
    render(<FlowTaskList items={tasks} label="主流程" />);

    const list = screen.getByRole("list", { name: "主流程" });
    const [completedItem, currentItem, upcomingItem] = within(list).getAllByRole("listitem");

    expect(within(completedItem).getByText("大厅")).toBeInTheDocument();
    expect(within(completedItem).getByText("已完成")).toBeInTheDocument();
    expect(within(currentItem).getByText("房间")).toBeInTheDocument();
    expect(within(currentItem).getByText("当前")).toBeInTheDocument();
    expect(currentItem).toHaveAttribute("aria-current", "step");
    expect(within(upcomingItem).getByText("对局")).toBeInTheDocument();
    expect(within(upcomingItem).getByText("待开始")).toBeInTheDocument();
  });
});
