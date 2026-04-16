import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PageStatusBannerState } from "../../features/flow/types";

import { PageStatusBanner } from "./PageStatusBanner";


const banner: PageStatusBannerState = {
  tone: "info",
  eyebrow: "Flow Status",
  title: "当前位于房间链路",
  detail: "页面只展示准备阶段所需信息，不在壳层内直接驱动业务提交。",
  tags: ["可恢复", "可演示"],
};

describe("PageStatusBanner", () => {
  it("renders title, detail, and optional tags from shared flow state", () => {
    render(<PageStatusBanner state={banner} />);

    expect(screen.getByText("Flow Status")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "当前位于房间链路" })).toBeInTheDocument();
    expect(screen.getByText("页面只展示准备阶段所需信息，不在壳层内直接驱动业务提交。")).toBeInTheDocument();
    expect(screen.getByText("可恢复")).toBeInTheDocument();
    expect(screen.getByText("可演示")).toBeInTheDocument();
  });
});
