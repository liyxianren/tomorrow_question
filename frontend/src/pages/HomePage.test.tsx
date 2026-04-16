import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { HomePage } from "./HomePage";


function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe("HomePage", () => {
  it("keeps the homepage as a product entry with only one lobby CTA", () => {
    renderHomePage();

    expect(screen.getByRole("heading", { name: "第一次进入也能顺着玩完一局" })).toBeInTheDocument();
    expect(screen.getByText("5 人回合制列强经营对局")).toBeInTheDocument();
    expect(screen.getByText("5 人固定局")).toBeInTheDocument();
    expect(screen.getByText("选国家")).toBeInTheDocument();
    expect(screen.getByText("全员准备")).toBeInTheDocument();
    expect(screen.getByText("自动开局")).toBeInTheDocument();
    expect(screen.getByText("这局怎么玩")).toBeInTheDocument();
    expect(screen.getByText("进入大厅后会发生什么")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "进入大厅" })).toHaveAttribute("href", "/lobby");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("keeps room creation join and recovery logic out of the homepage", () => {
    renderHomePage();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/继续游戏|恢复/)).not.toBeInTheDocument();
    expect(screen.queryByText(/测试/)).not.toBeInTheDocument();
  });
});
