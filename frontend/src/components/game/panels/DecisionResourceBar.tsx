import { useTranslation } from "react-i18next";
import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import type { DecisionStepId } from "../../../features/game/flow/decisionFlow";
import {
  calculateDecisionSpendSummary,
  calculateGovernmentSpendBreakdown,
} from "../../../features/game/decisionShared";
import "./DecisionResourceBar.css";

type ChipKey = "factory" | "government" | "army";

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
        breakdown={governmentBreakdown.policyBudgetSupplement > 0
          ? t(
            "game:government.policyBudgetBreakdown",
            "Policy allowance {{remaining}} / {{total}}; not counted as fiscal",
            {
              remaining: governmentBreakdown.policyBudgetSupplementRemaining,
              total: governmentBreakdown.policyBudgetSupplement,
            },
          )
          : undefined}
      />
      <ResourceChip
        label={t("game:military.army", "Army")}
        total={armyCount}
        spent={0}
        active={activeChip === "army"}
        hideProgress
        valueOverride={String(armyCount)}
      />
    </div>
  );
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
      return "army";
    case "research":
      return "government";
    default:
      return null;
  }
}
