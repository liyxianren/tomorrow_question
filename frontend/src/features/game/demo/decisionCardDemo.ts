import type { SessionContextResponse } from "../../../types";
import i18n from "../../../i18n";
import {
  calculateDecisionSpendSummary,
  calculateGovernmentPointPreview,
  calculateRatioPreview,
} from "../decisionShared";
import type { PhaseDraftByPhase } from "../forms";
import { buildDecisionCommandDeckViewModel } from "../commandDeck/viewModel";
import { AUSTRIA_DECISION_DEMO_WORKSPACE } from "./seed";
import type {
  DecisionCardDemoScenario,
  DecisionCardDemoVariantMeta,
  DecisionCardDemoViewModel,
} from "./types";

export const DECISION_CARD_DEMO_VARIANTS: DecisionCardDemoVariantMeta[] = [
  {
    id: "command-deck",
    label: i18n.t("pages:decisionCardDemo.variantALabel", "方案 A：指挥台卡组"),
    summary: i18n.t("pages:decisionCardDemo.variantASummary", "预算反馈最强，最接近正式可用稿。"),
    accent: i18n.t("pages:decisionCardDemo.variantAAccent", "预算先行"),
  },
  {
    id: "archive-folio",
    label: i18n.t("pages:decisionCardDemo.variantBLabel", "方案 B：档案册卡组"),
    summary: i18n.t("pages:decisionCardDemo.variantBSummary", "强调解锁条件、说明文案和研究链路。"),
    accent: i18n.t("pages:decisionCardDemo.variantBAccent", "信息密度"),
  },
  {
    id: "action-stack",
    label: i18n.t("pages:decisionCardDemo.variantCLabel", "方案 C：行动栈卡组"),
    summary: i18n.t("pages:decisionCardDemo.variantCSummary", "更像桌游行动牌，单卡更大、更有戏剧性。"),
    accent: i18n.t("pages:decisionCardDemo.variantCAccent", "决策氛围"),
  },
];

export function createDecisionCardDemoScenario({
  source,
  workspace,
}: {
  source: "seed" | "live";
  workspace: DecisionCardDemoScenario["workspace"];
}): DecisionCardDemoScenario {
  return {
    source,
    sourceLabel: source === "live" ? i18n.t("pages:decisionCardDemo.liveSource", "实时对局") : i18n.t("pages:decisionCardDemo.seedSource", "内置种子"),
    countryCode: workspace.countryCode,
    countryLabel: workspace.countryLabel,
    workspace,
  };
}

export function createSeedDecisionCardDemoScenario(): DecisionCardDemoScenario {
  return createDecisionCardDemoScenario({
    source: "seed",
    workspace: AUSTRIA_DECISION_DEMO_WORKSPACE,
  });
}

export function createLiveDecisionCardDemoScenario(
  session: SessionContextResponse | null,
): DecisionCardDemoScenario | null {
  if (!session?.activeGame || !session.activeSnapshot) {
    return null;
  }
  if (session.activeGame.currentPhase !== "decision" || session.activeSnapshot.phase !== "decision") {
    return null;
  }
  if (session.activeSnapshot.phaseWorkspace.phase !== "decision") {
    return null;
  }

  const workspace = session.activeSnapshot.phaseWorkspace.players[session.session.playerId];
  if (!workspace) {
    return null;
  }

  return createDecisionCardDemoScenario({
    source: "live",
    workspace,
  });
}

export function buildDecisionCardDemoViewModel({
  activeStep,
  draft,
  scenario,
}: {
  activeStep: keyof DecisionCardDemoViewModel["locations"];
  draft: PhaseDraftByPhase["decision"];
  scenario: DecisionCardDemoScenario;
}): DecisionCardDemoViewModel {
  const workspace = scenario.workspace;
  const spendSummary = calculateDecisionSpendSummary(workspace, draft);
  const ratioPreview = calculateRatioPreview(workspace, draft);
  const governmentPointPreview = calculateGovernmentPointPreview(workspace, draft);

  return {
    countryCode: scenario.countryCode,
    countryLabel: scenario.countryLabel,
    sourceLabel: scenario.sourceLabel,
    summary: {
      remainingBudgets: {
        domesticMarket: workspace.budgetPools.domesticMarket - spendSummary.domesticSpend,
        factory: workspace.budgetPools.factory - spendSummary.factorySpend,
        governmentFiscal: workspace.budgetPools.governmentFiscal - spendSummary.governmentSpend,
      },
      ratioPreview,
      militaryPoints: governmentPointPreview.militaryPoints,
    },
    variants: DECISION_CARD_DEMO_VARIANTS,
    locations: buildDecisionCommandDeckViewModel({
      workspace,
      draft,
      activeStep,
    }).locations,
  };
}
