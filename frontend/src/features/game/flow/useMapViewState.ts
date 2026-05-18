import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import i18n from "../../../i18n";

import type {
  CountryCode,
  DecisionPlayerPhaseWorkspace,
  GamePhase,
  PlayerPhaseWorkspace,
  PlayerState,
} from "../../../types";
import type { DecisionFlowState, DecisionStepId } from "./decisionFlow";
import { setDecisionActiveStep } from "./decisionFlow";

export type MapBuildingDef = {
  id: string;
  label: string;
  subtitle: string;
  metric: string;
  x?: number;
  y?: number;
};

type UseMapViewStateArgs = {
  currentPhase: GamePhase | null;
  currentPlayerWorkspace: PlayerPhaseWorkspace | null;
  currentPlayerState: PlayerState | null;
  onDecisionFlowChange: Dispatch<SetStateAction<DecisionFlowState>>;
};

const DECISION_BUILDING_STEP_MAP: Record<string, DecisionStepId> = {
  factory: "factory",
  domestic: "domestic",
  government: "government",
  military: "military",
  research: "research",
};

type BuildingPositions = {
  factory: { x: number; y: number };
  domestic: { x: number; y: number };
  government: { x: number; y: number };
  military: { x: number; y: number };
  research: { x: number; y: number };
  market: { x: number; y: number };
};

export const MAP_IMAGE_BY_COUNTRY: Record<string, string> = {
  britain: "/images/map-uk.png",
  france: "/images/map-france.png",
  prussia: "/images/map-prussia.png",
  austria: "/images/map-austria.png",
  russia: "/images/map-russia.png",
};

// Building positions as % of map canvas. Keep y >= 25 to avoid topbar overlap.
const POSITIONS_BY_COUNTRY: Record<string, BuildingPositions> = {
  britain: {
    factory: { x: 20, y: 35 },
    domestic: { x: 48, y: 45 },
    government: { x: 75, y: 35 },
    military: { x: 72, y: 72 },
    research: { x: 28, y: 72 },
    market: { x: 50, y: 65 },
  },
  france: {
    factory: { x: 25, y: 75 },
    domestic: { x: 52, y: 52 },
    government: { x: 50, y: 28 },
    military: { x: 78, y: 72 },
    research: { x: 22, y: 50 },
    market: { x: 48, y: 68 },
  },
  prussia: {
    factory: { x: 50, y: 28 },
    domestic: { x: 75, y: 75 },
    government: { x: 22, y: 58 },
    military: { x: 78, y: 32 },
    research: { x: 22, y: 32 },
    market: { x: 50, y: 55 },
  },
  austria: {
    factory: { x: 25, y: 72 },
    domestic: { x: 72, y: 32 },
    government: { x: 50, y: 52 },
    military: { x: 75, y: 78 },
    research: { x: 35, y: 78 },
    market: { x: 52, y: 65 },
  },
  russia: {
    factory: { x: 78, y: 32 },
    domestic: { x: 45, y: 72 },
    government: { x: 28, y: 48 },
    military: { x: 72, y: 75 },
    research: { x: 22, y: 75 },
    market: { x: 52, y: 58 },
  },
};

const DEFAULT_POSITIONS: BuildingPositions = POSITIONS_BY_COUNTRY.britain;

export function useMapViewState({
  currentPhase,
  currentPlayerWorkspace,
  currentPlayerState,
  onDecisionFlowChange,
}: UseMapViewStateArgs) {
  const [activeModalId, setActiveModalId] = useState<string | null>(null);

  // Close modal when phase changes
  useEffect(() => {
    setActiveModalId(null);
  }, [currentPhase]);

  const openModal = useCallback(
    (buildingId: string) => {
      setActiveModalId(buildingId);
      if (currentPhase === "decision" && DECISION_BUILDING_STEP_MAP[buildingId]) {
        onDecisionFlowChange((prev) =>
          setDecisionActiveStep(prev, DECISION_BUILDING_STEP_MAP[buildingId]),
        );
      }
    },
    [currentPhase, onDecisionFlowChange],
  );

  const closeModal = useCallback(() => {
    setActiveModalId(null);
  }, []);

  const countryId = currentPlayerState?.countryId ?? "britain";
  const decisionWorkspace =
    currentPhase === "decision" && currentPlayerWorkspace && "militaryWorkspace" in currentPlayerWorkspace
      ? (currentPlayerWorkspace as DecisionPlayerPhaseWorkspace)
      : null;
  const buildings = buildBuildingDefs(currentPhase, currentPlayerState, countryId, decisionWorkspace);
  const mapImage = MAP_IMAGE_BY_COUNTRY[countryId] ?? MAP_IMAGE_BY_COUNTRY.britain;

  const activeBuilding = buildings.find((b) => b.id === activeModalId) ?? null;
  const modalTitle = activeBuilding?.label ?? "";

  return {
    buildings,
    activeModalId,
    modalTitle,
    mapImage,
    openModal,
    closeModal,
  };
}

export function buildBuildingDefs(
  phase: GamePhase | null,
  playerState: PlayerState | null,
  countryId: string,
  decisionWorkspace: DecisionPlayerPhaseWorkspace | null = null,
): MapBuildingDef[] {
  if (!playerState) return [];

  const pos = POSITIONS_BY_COUNTRY[countryId] ?? DEFAULT_POSITIONS;
  const budgetPools = decisionWorkspace?.baseBudgetPools ?? decisionWorkspace?.budgetPools ?? playerState.budgetPools;
  const fleetCount = decisionWorkspace?.militaryWorkspace?.navy?.fleets ?? (playerState as any)?.navy?.fleets ?? 0;
  const army: Record<string, number> = decisionWorkspace?.militaryWorkspace.army ?? playerState.army ?? {};
  const armyTotal = army.army !== undefined
    ? Math.max(0, Math.floor(army.army))
    : Object.values(army).reduce((sum, value) => sum + Math.max(0, Math.floor(value)), 0);
  const governmentBudgetMetric = `${budgetPools.governmentFiscal}`;

  if (phase === "decision") {
    return [
      {
        id: "factory",
        label: i18n.t("game:building.factory", "工业区"),
        subtitle: i18n.t("game:buildingSubtitle.factory", "工厂决策"),
        metric: i18n.t("game:buildingMetric.factory", "预算") + ` ${budgetPools.factory}`,
        x: pos.factory.x,
        y: pos.factory.y,
      },
      {
        id: "government",
        label: i18n.t("game:building.government", "议会厅"),
        subtitle: i18n.t("game:buildingSubtitle.government", "政府政策"),
        metric: i18n.t("game:buildingMetric.government", "预算") + ` ${governmentBudgetMetric}`,
        x: pos.domestic.x,
        y: pos.domestic.y,
      },
      {
        id: "domestic",
        label: i18n.t("game:building.domestic", "市民广场"),
        subtitle: i18n.t("game:buildingSubtitle.domestic", "市场预览"),
        metric: i18n.t("game:buildingMetric.domestic", "购买力") + ` ${budgetPools.domesticMarket}`,
        x: pos.government.x,
        y: pos.government.y,
      },
      {
        id: "military",
        label: i18n.t("game:building.military", "军事要塞"),
        subtitle: i18n.t("game:buildingSubtitle.military", "军事行动"),
        metric: i18n.t("game:unit.fleets", "舰队") + ` ${fleetCount} / ` + i18n.t("game:unit.army", "陆军") + ` ${armyTotal}`,
        x: pos.military.x,
        y: pos.military.y,
      },
      {
        id: "research",
        label: i18n.t("game:building.research", "研究院"),
        subtitle: i18n.t("game:buildingSubtitle.research", "科学研究"),
        metric: i18n.t("game:government.budget", "政府财政研究"),
        x: pos.research.x,
        y: pos.research.y,
      },
    ];
  }

  if (phase === "market") {
    return [
      {
        id: "market",
        label: i18n.t("game:building.market", "贸易港"),
        subtitle: i18n.t("game:buildingSubtitle.market", "市场出售"),
        metric: i18n.t("game:buildingMetric.market", "库存待售"),
        x: pos.market.x,
        y: pos.market.y,
      },
    ];
  }

  return [];
}
