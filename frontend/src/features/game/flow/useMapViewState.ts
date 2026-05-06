import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

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

const MAP_IMAGE_BY_COUNTRY: Record<string, string> = {
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

function buildBuildingDefs(
  phase: GamePhase | null,
  playerState: PlayerState | null,
  countryId: string,
  decisionWorkspace: DecisionPlayerPhaseWorkspace | null = null,
): MapBuildingDef[] {
  if (!playerState) return [];

  const pos = POSITIONS_BY_COUNTRY[countryId] ?? DEFAULT_POSITIONS;
  const budgetPools = decisionWorkspace?.budgetPools ?? playerState.budgetPools;
  const militaryPoints = decisionWorkspace?.militaryWorkspace.militaryPoints ?? playerState.militaryPoints;

  if (phase === "decision") {
    return [
      {
        id: "factory",
        label: "工业区",
        subtitle: "工厂决策",
        metric: `预算 ${budgetPools.factory}`,
        x: pos.factory.x,
        y: pos.factory.y,
      },
      {
        id: "domestic",
        label: "市民广场",
        subtitle: "国民消费",
        metric: `消费池 ${budgetPools.domesticMarket}`,
        x: pos.domestic.x,
        y: pos.domestic.y,
      },
      {
        id: "government",
        label: "议会厅",
        subtitle: "政府政策",
        metric: `预算 ${budgetPools.governmentFiscal}`,
        x: pos.government.x,
        y: pos.government.y,
      },
      {
        id: "military",
        label: "军事要塞",
        subtitle: "军事行动",
        metric: `军力 ${militaryPoints}`,
        x: pos.military.x,
        y: pos.military.y,
      },
      {
        id: "research",
        label: "研究院",
        subtitle: "科学研究",
        metric: "政府财政研究",
        x: pos.research.x,
        y: pos.research.y,
      },
    ];
  }

  if (phase === "market") {
    return [
      {
        id: "market",
        label: "贸易港",
        subtitle: "市场出售",
        metric: "库存待售",
        x: pos.market.x,
        y: pos.market.y,
      },
    ];
  }

  return [];
}
