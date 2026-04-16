import { getCountryLabel as getPanelCountryLabel } from "./panelGlossary";
import type { FrontendSocketState } from "./runtime/types";
import type { GamePhase } from "../../types";

export function getPhaseLabel(phase: GamePhase | string): string {
  switch (phase) {
    case "decision":
      return "国家决策";
    case "market":
      return "市场出售";
    case "settlement":
      return "财政结算";
    default:
      return String(phase);
  }
}

export function getCountryLabel(country: string | null): string {
  return getPanelCountryLabel(country);
}

export function formatSeconds(value: number | null): string {
  if (value === null) {
    return "--:--";
  }

  const minutes = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.max(0, value % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export function getSocketStateLabel(socketState: FrontendSocketState): string {
  switch (socketState) {
    case "idle":
      return "等待连接";
    case "connecting":
      return "连接中";
    case "connected":
      return "已连接";
    case "disconnected":
      return "已断开";
    default:
      return socketState;
  }
}
