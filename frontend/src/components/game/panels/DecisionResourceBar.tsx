import { useTranslation } from "react-i18next";
import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import type { DecisionStepId } from "../../../features/game/flow/decisionFlow";
import {
  calculateDecisionSpendSummary,
  calculateGovernmentSpendBreakdown,
} from "../../../features/game/decisionShared";
import "./DecisionResourceBar.css";

type ChipKey = "factory" | "government" | "military";

type DecisionResourceBarProps = {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  activeStep: DecisionStepId;
};

function getVisibleArmyTotal(army: Record<string, number | undefined>): number {
  if (army.army !== undefined) {
    return Math.max(0, Math.floor(army.army));
  }
  return Object.values(army).reduce<number>(
    (sum, value) => sum + Math.max(0, Math.floor(value ?? 0)),
    0,
  );
}

export function DecisionResourceBar({ workspace, draft, activeStep }: DecisionResourceBarProps) {
  const { t } = useTranslation();
  const spendSummary = calculateDecisionSpendSummary(workspace, draft);
  const governmentBreakdown = calculateGovernmentSpendBreakdown(workspace, draft);
  const armyCount = getVisibleArmyTotal(workspace.militaryWorkspace.army);
  const baseFleetCount = Math.max(0, Math.floor(workspace.militaryWorkspace.navy.fleets ?? 0));
  const selectedFleetDelta = sumSelectedFleetDelta(workspace, draft);
  const totalFleetCount = Math.max(0, baseFleetCount + selectedFleetDelta);
  const deployedFleetCount = getDraftDeployedFleetCount(workspace, draft);
  const availableFleetCount = Math.max(0, totalFleetCount - deployedFleetCount);

  const activeChip = mapStepToChip(activeStep);

  return (
    <div className="drb" data-testid="decision-resource-bar">
      <ResourceChip
        label={t("game:factory.factoryBudget", "Factory Budget")}
        total={workspace.budgetPools.factory}
        spent={spendSummary.factorySpend}
        active={activeChip === "factory"}
      />
      <ResourceChip
        label={t("game:government.budget", "Government Fiscal")}
        total={governmentBreakdown.baseGovernmentBudget}
        spent={governmentBreakdown.baseGovernmentBudget - governmentBreakdown.baseGovernmentRemaining}
        active={activeChip === "government"}
      />
      <ResourceChip
        label={t("game:unit.army", "陆军")}
        total={armyCount}
        spent={0}
        active={activeChip === "military"}
        hideProgress
        valueOverride={String(armyCount)}
        breakdown={t("game:military.armyResourceHint", "市场争夺 / 军事力量")}
      />
      <ResourceChip
        label={t("game:military.fleetBlockadeResource", "舰队封锁")}
        total={totalFleetCount}
        spent={deployedFleetCount}
        active={activeChip === "military"}
        hideProgress
        valueOverride={`${availableFleetCount} / ${totalFleetCount}`}
        breakdown={t("game:military.fleetBlockadeResourceHint", "可部署 / 总舰队")}
      />
    </div>
  );
}

function sumSelectedFleetDelta(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): number {
  return draft.militaryPlan.militaryActions.reduce((sum, selection) => {
    const action = workspace.militaryWorkspace.availableMilitaryActions.find((item) => item.actionId === selection.actionId);
    const navyDelta = action?.effects?.navyDelta;
    if (!navyDelta || typeof navyDelta !== "object" || !("fleets" in navyDelta)) {
      return sum;
    }
    const fleets = (navyDelta as Record<string, unknown>).fleets;
    return sum + (typeof fleets === "number" ? fleets : 0);
  }, 0);
}

function getDraftDeployedFleetCount(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): number {
  const regionBlockades = draft.militaryPlan.regionBlockades ?? {};
  return workspace.militaryWorkspace.regionAccessStatus.reduce((sum, region) => {
    const draftCount = regionBlockades[region.regionId];
    return sum + Math.max(0, Math.floor(typeof draftCount === "number" ? draftCount : (region.myBlockadeFleet ?? 0)));
  }, 0);
}

function ResourceChip({
  label,
  total,
  spent,
  active,
  breakdown,
  valueOverride,
  hideProgress,
}: {
  label: string;
  total: number;
  spent: number;
  active: boolean;
  breakdown?: string;
  valueOverride?: string;
  hideProgress?: boolean;
}) {
  const remaining = total - spent;
  const exceeded = remaining < 0;
  const progressRatio = total > 0 ? Math.min(1, Math.max(0, spent / total)) : 0;
  const chipClasses = ["drb__chip"];
  if (active) chipClasses.push("drb__chip--active");
  if (exceeded) chipClasses.push("drb__chip--exceeded");

  return (
    <div className={chipClasses.join(" ")}>
      <div className="drb__head">
        <span className="drb__label">{label}</span>
        <span className="drb__value">{valueOverride ?? `${remaining} / ${total}`}</span>
      </div>
      {breakdown ? <span className="drb__breakdown">{breakdown}</span> : null}
      {hideProgress ? null : (
        <div className="drb__progress" aria-hidden="true">
          <div
            className={`drb__progress-fill${exceeded ? " drb__progress-fill--exceeded" : ""}`}
            style={{ width: `${progressRatio * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function mapStepToChip(step: DecisionStepId): ChipKey | null {
  switch (step) {
    case "factory":
      return "factory";
    case "government":
      return "government";
    case "military":
      return "military";
    case "research":
      return "government";
    default:
      return null;
  }
}
