import i18n from "../../i18n";
import { getCountryLabel as getPanelCountryLabel } from "./panelGlossary";
import type { FrontendSocketState } from "./runtime/types";
import type { GamePhase } from "../../types";

export function getPhaseLabel(phase: GamePhase | string): string {
  return i18n.t("game:phase." + phase, { defaultValue: String(phase) });
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
  return i18n.t("game:socketState." + socketState, { defaultValue: socketState });
}
