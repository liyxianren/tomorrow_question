import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import type { DecisionStepId } from "../../../features/game/flow/decisionFlow";
import {
  calculateDecisionSpendSummary,
  calculateGovernmentPointPreview,
  calculateGovernmentSpendBreakdown,
} from "../../../features/game/decisionShared";
import "./DecisionResourceBar.css";

type ChipKey = "domestic" | "factory" | "government" | "tech";

type DecisionResourceBarProps = {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  activeStep: DecisionStepId;
};

export function DecisionResourceBar({ workspace, draft, activeStep }: DecisionResourceBarProps) {
  const spendSummary = calculateDecisionSpendSummary(workspace, draft);
  const governmentBreakdown = calculateGovernmentSpendBreakdown(workspace, draft);
  const techPreview = calculateGovernmentPointPreview(workspace, draft);

  const activeChip = mapStepToChip(activeStep);

  return (
    <div className="drb" data-testid="decision-resource-bar">
      <ResourceChip
        label="国内消费"
        total={workspace.budgetPools.domesticMarket}
        spent={spendSummary.domesticSpend}
        active={activeChip === "domestic"}
      />
      <ResourceChip
        label="工厂预算"
        total={workspace.budgetPools.factory}
        spent={spendSummary.factorySpend}
        active={activeChip === "factory"}
      />
      <ResourceChip
        label="政府财政"
        total={workspace.budgetPools.governmentFiscal}
        spent={spendSummary.governmentSpend}
        active={activeChip === "government"}
        breakdown={`政府 ${governmentBreakdown.government} · 军事 ${governmentBreakdown.military}`}
      />
      <ResourceChip
        label="科技点预览"
        total={techPreview.techPoints}
        spent={0}
        active={activeChip === "tech"}
        valueOverride={`${techPreview.techPoints}`}
        hideProgress
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
    case "domestic":
      return "domestic";
    case "government":
      return "government";
    case "military":
      return "government";
    case "research":
      return "tech";
    default:
      return null;
  }
}
