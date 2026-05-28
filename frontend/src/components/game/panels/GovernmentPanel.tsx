import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { translateBackend } from "../../../i18n";
import { getReformLabel } from "../../../features/game/panelGlossary";
import type { DecisionPlayerPhaseWorkspace, IdeologyKey } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import type { ParameterInspector } from "../../../features/game/parameterInspector";
import type { DecisionActionCardEffect } from "./shared/DecisionActionCard";
import { DecisionStatStrip } from "./shared/DecisionStatStrip";
import { DecisionActionCard } from "./shared/DecisionActionCard";
import {
  buildEffectMetrics,
  calculateDecisionMarketReferencePrice,
  calculateGovernmentFiscalState,
  calculateRatioPreview,
} from "../../../features/game/decisionShared";
import "./GovernmentPanel.css";

type ReformPath = "freedom" | "equality" | "national";

const REFORM_PATHS: ReformPath[] = ["freedom", "equality", "national"];

const REFORM_PATH_ICONS: Record<ReformPath, string> = {
  freedom: "🗽",
  equality: "⚖️",
  national: "🛡️",
};

const IDEOLOGY_ICONS: Record<IdeologyKey, string> = {
  liberalism: "📈",
  egalitarianism: "🤝",
  nationalism: "🛡️",
};

const IDEOLOGY_KEYS: IdeologyKey[] = ["liberalism", "egalitarianism", "nationalism"];

const MARKET_STRATEGY_ICONS: Record<string, string> = {
  trade_promotion: "⚓",
  expand_research: "🔬",
};

const MARKET_POLICY_ACTION_IDS = new Set(["trade_promotion"]);
const MARKET_POLICY_ADMIN_COST = 1;

const MARKET_PREVIEW_EFFECT_KEYS = [
  "domesticMarketCapacityDelta",
  "domesticPriceBonusDelta",
  "handicraftCapacityDelta",
  "overseasMarketCapacityDelta",
] as const;

const ALLOCATION_DISPLAY_ORDER = ["consumption", "domesticMarket", "factory", "fiscal", "governmentFiscal"];

type IdeologyMilestone = {
  level: number;
  label: string;
  effects?: Record<string, unknown>;
  penalty?: Record<string, unknown>;
};

type PolicyPreview = {
  policyId: string;
  effects?: Record<string, unknown>;
  adminCostPerTurn: number;
  budgetCost: number;
};

const POLICY_EFFECT_FALLBACKS: Record<string, Record<string, unknown>> = {
  raise_consumption_tax: {
    ratioDelta: { consumption: -1.0, fiscal: 1.0 },
    ideologyDelta: { egalitarianism: 1 },
  },
  lower_consumption_tax: {
    ratioDelta: { consumption: 1.0, fiscal: -1.0 },
    ideologyDelta: { egalitarianism: -1 },
  },
  expand_army: { militaryPointsDelta: 1 },
  reduce_army: { militaryPointsDelta: -1, fiscalRefund: 5 },
};

function formatSigned(delta: number): string {
  return `${delta > 0 ? "+" : ""}${delta}`;
}

function formatRatioValue(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
}

function formatIncomeRatio(ratio: { domesticMarket?: number; factory?: number; governmentFiscal?: number }): string {
  return [
    formatRatioValue(ratio.domesticMarket),
    formatRatioValue(ratio.factory),
    formatRatioValue(ratio.governmentFiscal),
  ].join(" / ");
}

function buildRatioDeltaLabel(
  baseRatio: { domesticMarket?: number; factory?: number; governmentFiscal?: number },
  projectedRatio: { domesticMarket?: number; factory?: number; governmentFiscal?: number },
): string {
  const parts = [
    ["domesticMarket", getAllocationLabel("domesticMarket")],
    ["factory", getAllocationLabel("factory")],
    ["governmentFiscal", getAllocationLabel("governmentFiscal")],
  ].flatMap(([key, label]) => {
    const delta = (projectedRatio[key as keyof typeof projectedRatio] ?? 0) - (baseRatio[key as keyof typeof baseRatio] ?? 0);
    return Math.abs(delta) > 0.0001 ? [`${label} ${formatSigned(Math.round(delta * 100) / 100)}`] : [];
  });
  return parts.length > 0 ? joinLocalized(parts) : i18n.t("game:government.noIncomeAllocationChange", "无变化");
}

function joinLocalized(parts: string[]): string {
  return parts.join(i18n.language.startsWith("zh") ? "，" : ", ");
}

function formatPolicyCostLabel(policy: Pick<PolicyPreview, "adminCostPerTurn" | "budgetCost">): string {
  const parts: string[] = [];
  if (policy.budgetCost > 0) {
    parts.push(i18n.t("game:government.policyCostFiscalOnly", "{{budget}} 政府财政", { budget: policy.budgetCost }));
  }
  if (policy.adminCostPerTurn > 0) {
    parts.push(i18n.t("game:government.policyCostAdminOnly", "消耗 {{admin}} 行政力", { admin: policy.adminCostPerTurn }));
  }
  return parts.length > 0 ? parts.join(" · ") : i18n.t("game:government.noDirectCost", "无直接消耗");
}

function getReformPathLabel(path: ReformPath): string {
  if (path === "freedom") return i18n.t("game:government.reformPath_free", "自由之路");
  if (path === "equality") return i18n.t("game:government.reformPath_equality", "平等之路");
  return i18n.t("game:government.reformPath_national", "民族之路");
}

function getIdeologyLabel(key: string): string {
  if (key === "liberalism") return i18n.t("game:government.ideology.liberalism", "自由主义");
  if (key === "egalitarianism") return i18n.t("game:government.ideology.egalitarianism", "平等主义");
  if (key === "nationalism") return i18n.t("game:government.ideology.nationalism", "民族主义");
  return translateBackend(key);
}

function getIdeologyMeta(key: IdeologyKey): { label: string; icon: string } {
  return {
    label: getIdeologyLabel(key),
    icon: IDEOLOGY_ICONS[key],
  };
}

function getAllocationLabel(key: string): string {
  if (key === "consumption" || key === "domesticMarket") {
    return i18n.t("game:government.allocation.consumption", "国民消费");
  }
  if (key === "fiscal" || key === "governmentFiscal") {
    return i18n.t("game:government.allocation.fiscal", "政府财政");
  }
  if (key === "factory") {
    return i18n.t("game:government.allocation.factory", "工厂预算");
  }
  return translateBackend(key);
}

function getAllocationLabels(): Record<string, string> {
  return {
    consumption: getAllocationLabel("consumption"),
    domesticMarket: getAllocationLabel("domesticMarket"),
    fiscal: getAllocationLabel("fiscal"),
    governmentFiscal: getAllocationLabel("governmentFiscal"),
    factory: getAllocationLabel("factory"),
  };
}

function getMarketPreviewEffectLabel(key: (typeof MARKET_PREVIEW_EFFECT_KEYS)[number]): string {
  if (key === "domesticMarketCapacityDelta") return i18n.t("game:government.effect.domesticCapacity", "国内容量");
  if (key === "domesticPriceBonusDelta") return i18n.t("game:government.effect.domesticPrice", "国内价格");
  if (key === "handicraftCapacityDelta") return i18n.t("game:government.effect.handicraft", "手工业");
  return i18n.t("game:government.effect.overseasCapacity", "海外容量");
}

function getProductionCapacityLabel(key: string): string {
  if (key === "all") return i18n.t("game:government.allCategories", "全品类");
  return i18n.t(`game:productionRoute.${key}`, translateBackend(key));
}

function getReformDescriptionFallback(reformId: string): string | undefined {
  return i18n.t(`game:reformDesc.${reformId}`, { defaultValue: "" }) || undefined;
}

function getDefaultIdeologyMilestones(key: IdeologyKey): IdeologyMilestone[] {
  const byKey: Record<IdeologyKey, IdeologyMilestone[]> = {
    liberalism: [
      { level: 3, label: i18n.t("game:milestone.tradeLicense", "贸易许可"), effects: { factoryBudgetDelta: 2 } },
      { level: 5, label: i18n.t("game:milestone.industryLiberalization", "产业自由化"), effects: { domesticPriceBonusDelta: 1 } },
      { level: 7, label: i18n.t("game:milestone.industrialParliament", "工业议会"), effects: { techPointsDelta: 1 } },
      {
        level: 10,
        label: i18n.t("game:milestone.representativeState", "代议制国家"),
        effects: { domesticMarketCapacityDelta: 3 },
        penalty: { governmentFiscalBudgetDelta: -3 },
      },
    ],
    egalitarianism: [
      { level: 3, label: i18n.t("game:milestone.laborProtection", "劳工保护"), effects: { domesticMarketCapacityDelta: 1 } },
      { level: 5, label: i18n.t("game:milestone.publicEducation", "公共教育"), effects: { techPointsDelta: 1 } },
      { level: 7, label: i18n.t("game:milestone.socialSecurity", "社会保障"), effects: { domesticMarketCapacityDelta: 2 } },
      {
        level: 10,
        label: i18n.t("game:milestone.socialState", "社会国家"),
        effects: { domesticPriceBonusDelta: 3 },
        penalty: { factoryBudgetDelta: -3 },
      },
    ],
    nationalism: [
      { level: 3, label: i18n.t("game:milestone.nationalDefense", "国防动员"), effects: { militaryPointsDelta: 1 } },
      { level: 5, label: i18n.t("game:milestone.customsUnion", "关税同盟"), effects: { overseasMarketCapacityDelta: 1 } },
      { level: 7, label: i18n.t("game:milestone.globalCommerce", "全球通商"), effects: {} },
      {
        level: 10,
        label: i18n.t("game:milestone.nationalRevival", "民族复兴"),
        effects: { overseasMarketCapacityDelta: 2 },
        penalty: { domesticMarketCapacityDelta: -2 },
      },
    ],
  };
  return byKey[key];
}

function formatRatioDeltaParts(
  ratioDelta: Record<string, number>,
  labels: Record<string, string>,
): string[] {
  return Object.entries(ratioDelta)
    .sort(([left], [right]) => {
      const leftIndex = ALLOCATION_DISPLAY_ORDER.indexOf(left);
      const rightIndex = ALLOCATION_DISPLAY_ORDER.indexOf(right);
      return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex)
        - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
    })
    .map(([key, delta]) => {
      const label = labels[key] ?? key;
      return `${label} ${formatSigned(delta)}`;
    });
}

function stripGeneratedEffectSummary(description: string | undefined): string | undefined {
  if (!description) return description;
  return description.replace(/\s*效果：.*。$/, "");
}

function formatMarketNumber(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}`;
}

function resolveReformDescription(
  reform: { reformId: string; description?: string; path: ReformPath },
): string {
  const raw = reform.description
    || getReformDescriptionFallback(reform.reformId)
    || i18n.t("game:government.reformDefaultDesc", "{{path}}改革。当前暂无额外说明。", { path: getReformPathLabel(reform.path) });
  return translateBackend(raw);
}

function projectIdeologyAfterReform(
  current: Record<string, number>,
  effects: Record<string, unknown>,
  maxLevel = 10,
): Record<string, number> {
  const projected: Record<string, number> = { ...current };
  const delta = effects.ideologyDelta as Record<string, number> | undefined;
  if (delta) {
    for (const [key, val] of Object.entries(delta)) {
      projected[key] = Math.max(0, Math.min(maxLevel, (projected[key] ?? 0) + val));
    }
  }
  return projected;
}

function formatReformEffects(
  effects: Record<string, unknown>,
  unlocksPolicies: string[],
  lockDescription?: string,
): string[] {
  const tags: string[] = [];

  const ideologyDelta = effects.ideologyDelta as Record<string, number> | undefined;
  if (ideologyDelta) {
    for (const [key, delta] of Object.entries(ideologyDelta)) {
      const label = getIdeologyLabel(key);
      tags.push(`${label} ${i18n.t("game:government.ideologySuffix")} ${formatSigned(delta)}`);
    }
  }

  const ratioDelta = effects.ratioDelta as Record<string, number> | undefined;
  if (ratioDelta) {
    for (const [key, delta] of Object.entries(ratioDelta)) {
      const label = getAllocationLabel(key);
      tags.push(`${i18n.t("game:government.permanentIncomeAllocation", "永久收入分配")} ${label} ${formatSigned(delta)}`);
    }
  }

  const ratioOverride = effects.ratioOverride as Record<string, number> | undefined;
  if (ratioOverride) {
    const parts = Object.entries(ratioOverride).map(
      ([k, v]) => `${getAllocationLabel(k)}:${v}`,
    );
    tags.push(i18n.t("game:government.allocationLock", "分配锁定 {{parts}}", { parts: parts.join("/") }));
  }

  if (effects.upgradeCostMultiplier !== undefined) {
    tags.push(i18n.t("game:government.upgradeCostMultiplier", "升级成本 ×{{multiplier}}", { multiplier: effects.upgradeCostMultiplier }));
  }

  if (effects.factoryUpgradeCostReductionPercent !== undefined) {
    const percent = Number(effects.factoryUpgradeCostReductionPercent);
    tags.push(i18n.t("game:government.factoryUpgradeCostReduction", "工厂升级成本 -{{percent}}%", { percent }));
  }

  if (effects.techPointsDelta !== undefined) {
    const delta = Number(effects.techPointsDelta);
    tags.push(i18n.t("game:common.techPoints", "科技点") + ` ${formatSigned(delta)}`);
  }

  const permanent = effects.permanent as Record<string, unknown> | undefined;
  if (permanent?.techPointsPerTurn !== undefined) {
    const delta = Number(permanent.techPointsPerTurn);
    tags.push(i18n.t("game:government.techPointsPerTurn", "每回合科技点 {{delta}}", { delta: formatSigned(delta) }));
  }

  if (effects.administrationCapacityDelta !== undefined) {
    const delta = Number(effects.administrationCapacityDelta);
    tags.push(i18n.t("game:government.administrationCapacityDelta", "行政力上限 {{delta}}", { delta: formatSigned(delta) }));
  }

  if (effects.armyCapDelta !== undefined) {
    const delta = Number(effects.armyCapDelta);
    tags.push(i18n.t("game:government.armyCapMax", "军事力量上限") + ` ${formatSigned(delta)}`);
  }

  if (effects.domesticMarketCapacityDelta !== undefined) {
    const delta = Number(effects.domesticMarketCapacityDelta);
    tags.push(i18n.t("game:government.effect.domesticCapacity", "国内容量") + ` ${formatSigned(delta)}`);
  }

  if (effects.overseasMarketCapacityDelta !== undefined) {
    const delta = Number(effects.overseasMarketCapacityDelta);
    tags.push(i18n.t("game:government.effect.overseasCapacity", "海外容量") + ` ${formatSigned(delta)}`);
  }

  if (effects.productionCapacityDelta !== undefined) {
    const delta = effects.productionCapacityDelta as Record<string, number>;
    for (const [key, val] of Object.entries(delta)) {
      tags.push(i18n.t("game:government.productionCapacityChange", "{{key}}产能 {{val}}", { key: getProductionCapacityLabel(key), val: val > 0 ? `+${val}` : `${val}` }));
    }
  }

  if (unlocksPolicies.length > 0) {
    tags.push(i18n.t("game:government.unlocksPolicies", "解锁 {{count}} 项政策", { count: unlocksPolicies.length }));
  }

  if (lockDescription) {
    tags.push(translateBackend(lockDescription));
  }

  return tags;
}

function formatStrategyEffects(
  strategy: { effects?: Record<string, number | Record<string, number>>; ratioDelta?: Record<string, number> },
): DecisionActionCardEffect[] {
  const effects: DecisionActionCardEffect[] = [];

  if (strategy.effects) {
    effects.push(...buildEffectMetrics(strategy.effects).filter((effect) => effect.label !== "科技点" && effect.label !== "Tech Points"));
  }

  if (strategy.ratioDelta) {
    const parts = formatRatioDeltaParts(strategy.ratioDelta, getAllocationLabels());
    if (parts.length > 0) {
      effects.push({ label: i18n.t("game:government.incomeAllocationPerTurn", "本轮收入分配"), value: joinLocalized(parts), temporary: true });
    }
  }

  return effects;
}

function hasMarketPreviewEffect(
  strategy: DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"][number],
): boolean {
  return MARKET_PREVIEW_EFFECT_KEYS.some((key) => typeof strategy.effects?.[key] === "number");
}

function sumMarketEffect(
  strategies: DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"],
  effectKey: (typeof MARKET_PREVIEW_EFFECT_KEYS)[number],
): number {
  return strategies.reduce((sum, strategy) => {
    const value = strategy.effects?.[effectKey];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

function formatPolicyEffects(
  policy: PolicyPreview,
  revolutionThreshold: number,
): DecisionActionCardEffect[] {
  const effects: DecisionActionCardEffect[] = [];

  const e = policy.effects ?? POLICY_EFFECT_FALLBACKS[policy.policyId];
  if (!e) return effects;

  const ratioDelta = e.ratioDelta as Record<string, number> | undefined;
  if (ratioDelta) {
    const parts = formatRatioDeltaParts(ratioDelta, getAllocationLabels());
    if (parts.length > 0) {
      effects.push({ label: i18n.t("game:government.incomeAllocationPerTurn", "本轮收入分配"), value: joinLocalized(parts), temporary: true });
    }
  }

  const ideologyDelta = e.ideologyDelta as Record<string, number> | undefined;
  if (ideologyDelta) {
    const parts = Object.entries(ideologyDelta).map(([key, delta]) => {
      const label = getIdeologyLabel(key);
      return `${label} ${formatSigned(delta)}`;
    });
    if (parts.length > 0) {
      effects.push({
        label: i18n.t("game:government.ideologyPressure", "思潮压力"),
        value: i18n.t("game:government.ideologyPressureValue", "{{parts}}（{{threshold}} 最高警戒）", { parts: joinLocalized(parts), threshold: revolutionThreshold }),
        temporary: true,
      });
    }
  }

  if (e.militaryPointsDelta !== undefined) {
    const delta = e.militaryPointsDelta as number;
    effects.push({ label: i18n.t("game:government.militaryPointsPerSettlement", "结算后每回合军事点"), value: formatSigned(delta), temporary: true });
  }

  if (e.armyCapDelta !== undefined) {
    const delta = e.armyCapDelta as number;
    effects.push({ label: i18n.t("game:government.armyCapMax", "军事力量上限"), value: formatSigned(delta), temporary: true });
  }

  if (e.domesticMarketCapacityDelta !== undefined) {
    const delta = e.domesticMarketCapacityDelta as number;
    effects.push({ label: i18n.t("game:government.effect.domesticCapacity", "国内容量"), value: formatSigned(delta), temporary: true });
  }

  if (e.overseasMarketCapacityDelta !== undefined) {
    const delta = e.overseasMarketCapacityDelta as number;
    effects.push({ label: i18n.t("game:government.effect.overseasCapacity", "海外容量"), value: formatSigned(delta), temporary: true });
  }

  if (e.fiscalRefund !== undefined) {
    effects.push({ label: i18n.t("game:government.allocation.fiscal", "政府财政"), value: `+${e.fiscalRefund}` });
  }

  if (e.productionOutputMultiplier !== undefined) {
    effects.push({
      label: i18n.t("game:effect.productionOutputMultiplier", "产出倍率"),
      value: `x${e.productionOutputMultiplier}`,
      temporary: true,
    });
  }

  const mobilizeCapacityToMilitary = e.mobilizeCapacityToMilitary as
    | { ratio?: number; militaryPerUnit?: number }
    | undefined;
  if (mobilizeCapacityToMilitary) {
    const ratio = typeof mobilizeCapacityToMilitary.ratio === "number"
      ? Math.round(mobilizeCapacityToMilitary.ratio * 100)
      : 0;
    effects.push({
      label: i18n.t("game:government.mobilizeCapacity", "产能转军力"),
      value: i18n.t("game:government.mobilizeCapacityValue", "{{ratio}}% 非闲置产能转为陆军", { ratio }),
      temporary: true,
    });
  }

  const suppressIdeology = e.suppressIdeology as
    | { target?: string; targetIdeology?: string; delta?: number; militaryCost?: number }
    | undefined;
  const suppressionTarget = suppressIdeology?.targetIdeology ?? suppressIdeology?.target;
  if (suppressionTarget) {
    const suppressionDelta = Number(suppressIdeology?.delta ?? 0);
    const suppressionCost = suppressIdeology?.militaryCost ?? 0;
    effects.push({
      label: i18n.t("game:government.suppressIdeology", "镇压思潮"),
      value: i18n.t("game:government.suppressIdeologyValue", "{{target}} {{delta}}，消耗 {{cost}} 陆军", {
        target: getIdeologyLabel(suppressionTarget),
        delta: formatSigned(suppressionDelta),
        cost: suppressionCost,
      }),
    });
  }

  const researchFacilityDelta = e.researchFacilityDelta as Record<string, number> | undefined;
  if (researchFacilityDelta) {
    const total = Object.values(researchFacilityDelta).reduce((sum, delta) => sum + Number(delta || 0), 0);
    if (total !== 0) {
      effects.push({ label: i18n.t("game:government.researchFacilities", "研究设施"), value: formatSigned(total), temporary: true });
    }
  }

  const productionCapacityDelta = e.productionCapacityDelta as Record<string, number> | undefined;
  if (productionCapacityDelta) {
    const parts = Object.entries(productionCapacityDelta).map(([key, delta]) => {
      const label = getProductionCapacityLabel(key);
      return `${label} ${formatSigned(delta)}`;
    });
    if (parts.length > 0) {
      effects.push({ label: i18n.t("game:government.productionCapacity", "产能"), value: joinLocalized(parts), permanent: true });
    }
  }

  return effects;
}

function buildMarketPolicyStrategies(
  strategies: DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"],
): DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"] {
  const configured = strategies.filter((strategy) => MARKET_POLICY_ACTION_IDS.has(strategy.actionId));
  if (configured.length > 0) {
    return configured;
  }

  return [
    {
      actionId: "trade_promotion",
      label: i18n.t("game:government.strategy.tradePromotion", "贸易促进"),
      cost: 0,
      description: i18n.t("game:government.strategy.tradePromotionDesc", "动用行政力协调贸易渠道，永久提高海外市场承接上限。"),
      techPointDelta: 0,
      militaryPointDelta: 0,
      lockedReason: null,
      effects: { overseasMarketCapacityDelta: 2 },
    },
  ];
}

function formatMilestoneSummary(milestone: IdeologyMilestone): string {
  const effectMetrics = buildEffectMetrics(
    milestone.effects as Record<string, number | Record<string, number>> | undefined,
  )
    .filter((effect) => effect.label !== "科技点" && effect.label !== "Tech Points")
    .map((effect) => `${translateBackend(effect.label)} ${effect.value}`);
  const penaltyMetrics = buildEffectMetrics(
    milestone.penalty as Record<string, number | Record<string, number>> | undefined,
  ).map((effect) => `${translateBackend(effect.label)} ${effect.value}`);
  const parts = [...effectMetrics, ...penaltyMetrics.map((text) => i18n.t("game:government.costPenalty", "代价 {{text}}", { text }))];
  return parts.length > 0 ? joinLocalized(parts) : i18n.t("game:government.stageEffect", "阶段效果");
}

function getNextIdeologyMilestone(
  milestones: IdeologyMilestone[] | undefined,
  currentLevel: number,
): IdeologyMilestone | null {
  return [...(milestones ?? [])]
    .sort((a, b) => a.level - b.level)
    .find((milestone) => milestone.level > currentLevel) ?? null;
}

function formatMilestoneTitle(milestones: IdeologyMilestone[] | undefined): string {
  if (!milestones || milestones.length === 0) return i18n.t("game:government.noMilestoneConfig", "暂无阶段效果配置");
  return [...milestones]
    .sort((a, b) => a.level - b.level)
    .map((milestone) => i18n.t("game:government.milestoneTitleLine", "Lv{{level}}: {{label}} ({{summary}})", {
      level: milestone.level,
      label: translateBackend(milestone.label),
      summary: formatMilestoneSummary(milestone),
    }))
    .join("\n");
}

function resolveIdeologyMilestones(
  configured: Record<string, IdeologyMilestone[]> | undefined,
  key: IdeologyKey,
): IdeologyMilestone[] {
  const milestones = configured?.[key];
  return milestones && milestones.length > 0 ? milestones : getDefaultIdeologyMilestones(key);
}

export interface GovernmentPanelProps {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingGovernmentBudget: number;
  onAdminPurchasesChange: (quantity: number) => void;
  onEnactReform: (reformId: string, queued: boolean) => void;
  onTogglePolicy: (policyId: string, active: boolean) => void;
  onToggleStrategy: (actionId: string, checked: boolean) => void;
  onToggleAbility?: (checked: boolean) => void;
  onAbilityTargetChange?: (ideology: IdeologyKey) => void;
  parameterInspector?: ParameterInspector;
}

export function GovernmentPanel({
  workspace,
  draft,
  remainingGovernmentBudget,
  onAdminPurchasesChange,
  onEnactReform,
  onTogglePolicy,
  onToggleStrategy,
  onToggleAbility,
  onAbilityTargetChange,
  parameterInspector,
}: GovernmentPanelProps) {
  const { t } = useTranslation();
  const [activeReformPath, setActiveReformPath] = useState<ReformPath>("freedom");
  const reforms = workspace.governmentReforms;
  if (!reforms) {
    return (
      <section className="government-panel" data-testid="government-panel">
        <div className="government-panel__header">
          <h3 className="government-panel__title">🏛️ {t("game:government.title")}</h3>
          <span className="government-panel__budget">{t("game:government.budget")} {remainingGovernmentBudget}</span>
        </div>
        <p>{t("game:government.dataNotReady")}</p>
      </section>
    );
  }

  const queuedReformIds = new Set(draft.reforms ?? []);
  const queuedActivateIds = new Set(draft.activatePolicies ?? []);
  const queuedDeactivateIds = new Set(draft.deactivatePolicies ?? []);
  const adminPurchases = Math.max(0, draft.governmentPlan.adminPurchases ?? 0);

  const strategies = buildMarketPolicyStrategies(workspace.governmentActions?.strategies ?? []);
  const queuedStrategyIds = new Set(
    (draft.governmentPlan.strategySelections ?? []).map((selection) => selection.actionId),
  );
  const selectedMarketStrategies = strategies.filter((strategy) =>
    queuedStrategyIds.has(strategy.actionId) && hasMarketPreviewEffect(strategy),
  );
  const selectedDomesticCapacityDelta = sumMarketEffect(selectedMarketStrategies, "domesticMarketCapacityDelta");
  const selectedDomesticPriceDelta = sumMarketEffect(selectedMarketStrategies, "domesticPriceBonusDelta");
  const selectedOverseasCapacityDelta = sumMarketEffect(selectedMarketStrategies, "overseasMarketCapacityDelta");
  const selectedMarketEffectSummary = MARKET_PREVIEW_EFFECT_KEYS
    .map((key) => ({ key, value: sumMarketEffect(selectedMarketStrategies, key) }))
    .filter((item) => item.value !== 0);
  const phase1Economy = workspace.phase1Economy;
  const baseDomesticCapacity = phase1Economy?.domesticSoftCap ?? workspace.domesticMarketCapacity ?? phase1Economy?.domesticDemand;
  const projectedDomesticCapacity = baseDomesticCapacity != null
    ? Math.max(0, baseDomesticCapacity + selectedDomesticCapacityDelta)
    : undefined;
  const baseOverseasCapacity = workspace.overseasMarketCapacity;
  const projectedOverseasCapacity = baseOverseasCapacity != null
    ? Math.max(0, baseOverseasCapacity + selectedOverseasCapacityDelta)
    : undefined;
  const referencePrice = calculateDecisionMarketReferencePrice(phase1Economy, selectedDomesticPriceDelta);
  const ability = workspace.nationalAbility;
  const abilitySelected = Boolean(ability && draft.abilitySelection?.abilityId === ability.abilityId);
  const abilityTarget = IDEOLOGY_KEYS.includes(draft.abilitySelection?.targetIdeology as IdeologyKey)
    ? draft.abilitySelection?.targetIdeology as IdeologyKey
    : "liberalism";
  const fiscalState = calculateGovernmentFiscalState(workspace, draft);
  const baseIncomeRatio = workspace.baseIncomeAllocationRatio ?? workspace.incomeAllocationRatio;
  const projectedIncomeRatio = calculateRatioPreview(workspace, draft);
  const incomeRatioDeltaLabel = buildRatioDeltaLabel(baseIncomeRatio, projectedIncomeRatio);

  const queuedReformAdminCost = reforms.availableReforms
    .filter((reform) => queuedReformIds.has(reform.reformId))
    .reduce((sum, reform) => sum + reform.adminCost, 0);
  const queuedMarketPolicyAdminCost = selectedMarketStrategies.length * MARKET_POLICY_ADMIN_COST;
  const projectedActivePolicyUpkeep = reforms.availablePolicies
    .filter((policy) => {
      if (queuedActivateIds.has(policy.policyId)) return true;
      if (queuedDeactivateIds.has(policy.policyId)) return false;
      return policy.isActive;
    })
    .reduce((sum, policy) => sum + policy.adminCostPerTurn, 0);
  const projectedPolicyAdminUse = projectedActivePolicyUpkeep + queuedMarketPolicyAdminCost;
  const rawProjectedAdmin =
    reforms.administrationCapacity
    + adminPurchases
    - queuedReformAdminCost
    - projectedActivePolicyUpkeep
    - queuedMarketPolicyAdminCost;
  const projectedAdmin = Math.max(0, rawProjectedAdmin);
  const projectedAdminTotal = Math.max(0, reforms.administrationCapacity + adminPurchases - queuedReformAdminCost);
  const adminPurchaseCost = Math.max(0, reforms.adminPurchaseCost ?? 0);
  const adminPurchaseSpend = adminPurchases * adminPurchaseCost;
  const maxAdminPurchases = adminPurchaseCost > 0
    ? adminPurchases + Math.max(0, Math.floor(fiscalState.effectiveGovernmentRemaining / adminPurchaseCost))
    : adminPurchases + 99;
  const canBuyMoreAdmin = maxAdminPurchases > adminPurchases;
  const adminPurchaseStatus = adminPurchases > 0
    ? "selected"
    : canBuyMoreAdmin
      ? "available"
      : "disabled";

  const isPolicyActiveAfter = (policyId: string, currentlyActive: boolean): boolean => {
    if (queuedActivateIds.has(policyId)) return true;
    if (queuedDeactivateIds.has(policyId)) return false;
    return currentlyActive;
  };

  const reformsByPath: Record<ReformPath, typeof reforms.availableReforms> = {
    freedom: [],
    equality: [],
    national: [],
  };
  for (const reform of reforms.availableReforms) {
    reformsByPath[reform.path].push(reform);
  }
  const activeReformList = reformsByPath[activeReformPath];

  const activePolicies = reforms.availablePolicies.filter((policy) => policy.isActive);
  const inactivePolicies = reforms.availablePolicies.filter((policy) => !policy.isActive);

  const canAddMarketPolicy = () => projectedAdmin >= MARKET_POLICY_ADMIN_COST;
  const marketPolicySection = strategies.length > 0 ? (
    <>
      <h4 className="government-section-label">🎯 {t("game:government.marketPolicyActions", "市场政策")}</h4>
      <div
        className="government-market-policy-summary"
        aria-label={t("game:government.marketRegulationPreview", "市场调节预览")}
        data-testid="government-market-policy-summary"
      >
        <span>
          {selectedMarketStrategies.length > 0
            ? t("game:government.selectedMarketPolicies", "已选 {{count}} 项", { count: selectedMarketStrategies.length })
            : t("game:government.usingBaseSupply")}
        </span>
        <span>{t("game:government.domesticCapacityRef", "定价软上限")} {formatMarketNumber(baseDomesticCapacity)}→{formatMarketNumber(projectedDomesticCapacity)}</span>
        <span>{
          referencePrice.isFloored
            ? t("game:government.priceFloored", "最低价触发")
            : referencePrice.isCapped
              ? t("game:government.priceCapped", "最高价触发")
              : t("game:government.equilibriumPriceLabel")
        } {formatMarketNumber(referencePrice.price)}</span>
        <span>{t("game:government.overseasExport")} {formatMarketNumber(baseOverseasCapacity)}→{formatMarketNumber(projectedOverseasCapacity)}</span>
        {selectedMarketEffectSummary.length > 0
          ? selectedMarketEffectSummary.map((item) => (
              <span key={item.key}>
                {getMarketPreviewEffectLabel(item.key)} {formatSigned(item.value)}
              </span>
            ))
          : null}
      </div>
      <div className="government-actions gov-policy-market-actions">
        {strategies.map((strategy) => {
          const queued = queuedStrategyIds.has(strategy.actionId);
          const overCapacity = !queued && !canAddMarketPolicy();
          const lockedReason = strategy.lockedReason ?? (overCapacity ? t("game:government.insufficientAdminCapacity", "行政力不足") : null);
          const isDisabled = !queued && lockedReason !== null;
          const status = queued ? "selected" : lockedReason ? "disabled" : "available";
          return (
            <DecisionActionCard
              key={strategy.actionId}
              icon={MARKET_STRATEGY_ICONS[strategy.actionId] ?? "🎯"}
              title={translateBackend(strategy.label)}
              costLabel={`${MARKET_POLICY_ADMIN_COST} ${t("game:government.adminPower", "行政力")}`}
              description={stripGeneratedEffectSummary(translateBackend(strategy.description) ?? undefined)}
              effects={formatStrategyEffects(strategy)}
              status={status}
              statusText={queued ? "✓ " + t("game:government.executeThisRound") : lockedReason ?? t("game:government.availableOption")}
              control={{
                kind: "toggle",
                checked: queued,
                onChange: (next) => onToggleStrategy(strategy.actionId, next),
                label: queued ? t("common:revoke") : t("common:select"),
                ariaLabel: `${t("common:select")}：${translateBackend(strategy.label)}`,
                disabled: isDisabled,
              }}
            >
              {parameterInspector?.render(`government.strategy.${strategy.actionId}`, {
                title: translateBackend(strategy.label),
                currentEffect: stripGeneratedEffectSummary(translateBackend(strategy.description) ?? undefined),
              })}
            </DecisionActionCard>
          );
        })}
      </div>
    </>
  ) : null;

  return (
    <section className="government-panel" data-testid="government-panel">
      <div className="government-panel__header">
        <h3 className="government-panel__title">🏛️ {t("game:government.title")}</h3>
        <div className="government-panel__budget-stack">
          <span className="government-panel__budget">{t("game:government.budget")} {fiscalState.baseGovernmentRemaining} / {fiscalState.baseGovernmentBudget}</span>
        </div>
      </div>

      <DecisionStatStrip
        testId="government-resource-strip"
        items={[
          {
            icon: "💰",
            value: `${fiscalState.baseGovernmentRemaining} / ${fiscalState.baseGovernmentBudget}`,
            label: t("game:government.budget"),
          },
          {
            icon: "🏛️",
            value: `${projectedAdmin} / ${projectedAdminTotal}`,
            label: t("game:government.adminCapacity"),
            tone: rawProjectedAdmin < 0 ? "critical" : projectedAdmin === 0 ? "warning" : undefined,
          },
          {
            icon: "📋",
            value: projectedPolicyAdminUse,
            label: t("game:government.policyAdminUpkeep", "政策占用"),
            tone: rawProjectedAdmin < 0 ? "critical" : undefined,
          },
          {
            icon: "⚖️",
            value: formatIncomeRatio(baseIncomeRatio),
            label: t("game:government.baseIncomeRatio", "基础比例"),
          },
          {
            icon: "↔",
            value: formatIncomeRatio(projectedIncomeRatio),
            label: t("game:government.effectiveIncomeRatio", "本轮比例"),
          },
          {
            icon: "∆",
            value: incomeRatioDeltaLabel,
            label: t("game:government.incomeRatioChange", "已选变化"),
          },
        ]}
      />

      <div className="government-admin-purchase" data-testid="government-admin-purchase">
        <DecisionActionCard
          icon="🏛️"
          title={t("game:government.buyAdmin", "购买行政力")}
          costLabel={`${adminPurchaseCost} ${t("game:government.budget", "政府财政")} / +1 ${t("game:government.adminCapacity", "行政力")}`}
          description={t("game:government.buyAdminDesc", "把政府财政永久转为行政力上限，本回合立刻可用于改革或选择政策。")}
          effects={[
            {
              label: t("game:government.adminCapacityPermanent", "行政力上限"),
              value: adminPurchases > 0 ? `+${adminPurchases}` : "+1",
            },
            ...(adminPurchases > 0
              ? [{
                  label: t("game:government.budget", "政府财政"),
                  value: `-${adminPurchaseSpend}`,
                  temporary: true,
                }]
              : []),
          ]}
          status={adminPurchaseStatus}
          statusText={
            adminPurchases > 0
              ? t("game:government.purchasedThisRound", "本轮：财政 -{{cost}}，行政力 +{{quantity}}", {
                  cost: adminPurchaseSpend,
                  quantity: adminPurchases,
                })
              : canBuyMoreAdmin
                ? t("game:government.canPurchase", "可兑换")
                : t("game:government.insufficientBudget", "财政不足")
          }
          control={{
            kind: "stepper",
            value: adminPurchases,
            min: 0,
            max: maxAdminPurchases,
            onChange: onAdminPurchasesChange,
            incrementAriaLabel: t("game:government.buyAdmin", "购买行政力"),
            decrementAriaLabel: t("common:decrease"),
          }}
        >
          {parameterInspector?.render("government.adminPurchase", {
            title: t("game:government.buyAdmin", "购买行政力"),
            currentEffect: t("game:government.buyAdminDesc", "把政府财政永久转为行政力上限，本回合立刻可用于改革或选择政策。"),
          })}
        </DecisionActionCard>
      </div>

      {/* ── 思潮信号 ── */}
      <h4 className="government-section-label">
        🧭 {t("game:government.ideologySignal")}
        <span
          className="government-section-hint"
          title={t("game:government.ideologyHighestAlert", { threshold: reforms.revolutionThreshold })}
        >
          {i18n.language.startsWith("zh")
            ? `（${t("game:government.ideologyHighestAlertShort", { threshold: reforms.revolutionThreshold })}）`
            : `(${t("game:government.ideologyHighestAlertShort", { threshold: reforms.revolutionThreshold })})`}
        </span>
      </h4>
      <div className="government-stats">
        {IDEOLOGY_KEYS.map((key) => {
          const meta = getIdeologyMeta(key);
          const rawLevel = reforms.ideologyLevels[key] ?? 0;
          const level = Math.max(reforms.ideologyMin, Math.min(rawLevel, reforms.revolutionThreshold));
          const isCritical = rawLevel >= reforms.revolutionThreshold;
          return (
            <div
              key={key}
              className={`government-stat ${isCritical ? "government-stat--critical" : ""}`}
              data-testid={`ideology-${key}`}
            >
              <span className="government-stat__icon">{meta.icon}</span>
              <span className="government-stat__value">
                {level} / {reforms.revolutionThreshold}
              </span>
              <span className="government-stat__label">{meta.label}</span>
            </div>
          );
        })}
      </div>
      <div className="government-ideology-guide" aria-label={t("game:government.ideologyStageEffect", "思潮阶段效果")}>
        {IDEOLOGY_KEYS.map((key) => {
          const meta = getIdeologyMeta(key);
          const rawLevel = reforms.ideologyLevels[key] ?? 0;
          const level = Math.max(reforms.ideologyMin, Math.min(rawLevel, reforms.revolutionThreshold));
          const milestones = resolveIdeologyMilestones(
            reforms.ideologyMilestones as Record<string, IdeologyMilestone[]> | undefined,
            key,
          );
          const nextMilestone = getNextIdeologyMilestone(milestones, level);
          return (
            <div
              key={key}
              className="government-ideology-guide__item"
              title={formatMilestoneTitle(milestones)}
            >
              <div className="government-ideology-guide__head">
                <span>{meta.icon} {meta.label}</span>
                <span>{level}/{reforms.revolutionThreshold}</span>
              </div>
              <p>
                {nextMilestone
                  ? t("game:government.nextMilestone", { level: nextMilestone.level, label: translateBackend(nextMilestone.label), summary: formatMilestoneSummary(nextMilestone) })
                  : t("game:government.atMaxStage")}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── 改革路径 ── */}
      <div className="gov-reform-workbench">
        <div className="gov-reform-workbench__header">
          <div>
            <h4 className="government-section-label">🧭 {t("game:government.reformPath")}</h4>
            <p className="government-section-note">
              {t("game:government.reformPathNote", {
                admin: projectedAdmin,
                threshold: reforms.revolutionThreshold,
                overflow: rawProjectedAdmin < 0 ? t("game:government.adminOverflow") : "",
              })}
            </p>
          </div>
          <div className="gov-reform-tabs" role="tablist" aria-label={t("game:government.reformPath")}>
            {REFORM_PATHS.map((path) => {
              const isActive = path === activeReformPath;
              return (
                <button
                  key={path}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`gov-reform-tab${isActive ? " gov-reform-tab--active" : ""}`}
                  onClick={() => setActiveReformPath(path)}
                >
                  <span aria-hidden="true">{REFORM_PATH_ICONS[path]}</span>
                  <span>{getReformPathLabel(path)}</span>
                  <span className="gov-reform-tab__count">{reformsByPath[path].length}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="government-actions gov-reform-list">
          {activeReformList.length === 0 ? (
            <p className="gov-reform-track__empty">{t("game:government.noReformsAvailable")}</p>
          ) : activeReformList.map((reform) => {
            const path = reform.path;
            const queued = queuedReformIds.has(reform.reformId);
            const overCapacity = !queued && projectedAdmin < reform.adminCost;
            const lockedReason = reform.isCompleted
              ? t("game:government.alreadyImplemented")
              : reform.isBlocked
                ? t("game:government.pathBlocked")
                : overCapacity
                  ? t("game:government.adminInsufficient")
                  : null;
            const isDisabled = reform.isCompleted || reform.isBlocked;
            const reformEffects = (reform.effects ?? {}) as Record<string, unknown>;
            const projectedIdeology = projectIdeologyAfterReform(
              reforms.ideologyLevels,
              reformEffects,
              reforms.revolutionThreshold,
            );
            const criticalIdeologies = reform.isCompleted
              ? []
              : IDEOLOGY_KEYS.filter(
                  (key) => (projectedIdeology[key] ?? 0) >= reforms.revolutionThreshold,
                );
            const wouldReachCritical = criticalIdeologies.length > 0;
            const productionCapacityDelta = reformEffects.productionCapacityDelta as
              | Record<string, number>
              | undefined;
            const globalProductionPenalty =
              productionCapacityDelta?.all !== undefined && productionCapacityDelta.all < 0
                ? productionCapacityDelta.all
                : null;
            const effectTags = formatReformEffects(
              reformEffects,
              reform.unlocksPolicies ?? [],
              reform.lockDescription,
            );
            const status = wouldReachCritical
              ? "danger"
              : queued
                ? "selected"
                : lockedReason
                  ? "disabled"
                  : "available";
            const warningNode = wouldReachCritical || globalProductionPenalty !== null ? (
              <>
                {wouldReachCritical && (
                  <span data-testid={`reform-revolution-warning-${reform.reformId}`}>
                    ⚠️ {t("game:government.ideologyHighestAlert", { threshold: reforms.revolutionThreshold })}
                    {i18n.language.startsWith("zh") ? "：" : ": "}
                    {criticalIdeologies
                      .map(
                        (key) =>
                          `${getIdeologyLabel(key)} ${reforms.ideologyLevels[key] ?? 0}→${projectedIdeology[key]} ≥ ${reforms.revolutionThreshold}`,
                      )
                      .join(i18n.language.startsWith("zh") ? "，" : ", ")}
                  </span>
                )}
                {globalProductionPenalty !== null && (
                  <span style={{ display: "block", marginTop: wouldReachCritical ? 4 : 0 }}>
                    ⚠️ {t("game:government.globalProduction")} {globalProductionPenalty}
                  </span>
                )}
              </>
            ) : null;
            return (
              <DecisionActionCard
                key={reform.reformId}
                icon={wouldReachCritical ? "⚠️" : REFORM_PATH_ICONS[path]}
                title={translateBackend(reform.label)}
                costLabel={`${reform.adminCost} ${t("game:government.adminCapacity")}`}
                description={resolveReformDescription(reform)}
                warning={warningNode}
                effects={effectTags.map((tag) => ({ label: tag, value: "" }))}
                status={status}
                statusText={queued ? "✓ " + t("game:government.queuedThisRound") : lockedReason ?? t("game:government.canImplementWithAdmin", { cost: reform.adminCost })}
                control={{
                  kind: "toggle",
                  checked: queued,
                  onChange: (next) => onEnactReform(reform.reformId, next),
                  label: reform.isCompleted ? t("game:government.alreadyImplemented") : queued ? t("common:revoke") : t("game:government.implement"),
                  ariaLabel: t("game:government.implementReform", { label: reform.label }),
                  disabled: isDisabled || (!queued && lockedReason !== null),
                }}
              >
                {parameterInspector?.render(`government.reform.${reform.reformId}`, {
                  title: translateBackend(reform.label),
                  currentEffect: resolveReformDescription(reform),
                })}
              </DecisionActionCard>
            );
          })}
        </div>
      </div>

      {/* ── 政策与策略 二分布局 ── */}
      <div className="gov-policy-split">
        <div className="gov-policy-split__left">
          {/* 本轮已选政策 */}
          {activePolicies.length > 0 || selectedMarketStrategies.length > 0 ? (
            <>
              <h4 className="government-section-label">⚙️ {t("game:government.activePoliciesTitle")}</h4>
              <div className="government-actions">
                {selectedMarketStrategies.map((strategy) => (
                  <DecisionActionCard
                    key={`market-policy-selected-${strategy.actionId}`}
                    icon={MARKET_STRATEGY_ICONS[strategy.actionId] ?? "🎯"}
                    title={translateBackend(strategy.label)}
                    costLabel={`${MARKET_POLICY_ADMIN_COST} ${t("game:government.adminPower", "行政力")}`}
                    description={stripGeneratedEffectSummary(translateBackend(strategy.description) ?? undefined)}
                    effects={formatStrategyEffects(strategy)}
                    status="selected"
                    statusText={"✓ " + t("game:government.executeThisRound")}
                    doneBadge={t("game:government.marketPolicyActions", "市场政策")}
                  >
                    {parameterInspector?.render(`government.strategy.${strategy.actionId}`, {
                      title: translateBackend(strategy.label),
                      currentEffect: stripGeneratedEffectSummary(translateBackend(strategy.description) ?? undefined),
                    })}
                  </DecisionActionCard>
                ))}
                {activePolicies.map((policy) => {
                  const active = isPolicyActiveAfter(policy.policyId, policy.isActive);
                  const restoreLockedReason = !active && projectedAdmin < policy.adminCostPerTurn
                    ? t("game:government.insufficientAdminCapacity", "行政力不足")
                    : null;
                  return (
                    <DecisionActionCard
                      key={policy.policyId}
                      icon="📋"
                      title={translateBackend(policy.label)}
                      costLabel={formatPolicyCostLabel(policy)}
                      description={translateBackend(policy.description)}
                      effects={formatPolicyEffects(policy, reforms.revolutionThreshold)}
                      status={active ? "selected" : restoreLockedReason ? "disabled" : "available"}
                      statusText={active ? t("game:government.policyInEffect", "本轮已选") : restoreLockedReason ?? t("game:government.policyDeactivated")}
                      control={{
                        kind: "toggle",
                        checked: active,
                        onChange: (next) => onTogglePolicy(policy.policyId, next),
                        label: active ? t("common:deactivate") : t("common:activate"),
                        ariaLabel: `${active ? t("game:government.deactivatePolicy", { label: policy.label }) : t("game:government.activatePolicy", { label: policy.label })}`,
                        disabled: restoreLockedReason !== null,
                      }}
                    >
                      {parameterInspector?.render(`government.policy.${policy.policyId}`, {
                        title: translateBackend(policy.label),
                        currentEffect: translateBackend(policy.description),
                      })}
                    </DecisionActionCard>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <h4 className="government-section-label">⚙️ {t("game:government.activePoliciesTitle")}</h4>
              <p className="gov-policy-split__empty">{t("game:government.noActivePolicies")}</p>
            </>
          )}
        </div>

        <div className="gov-policy-split__right">
          {/* 国家能力 */}
          {ability && (
            <>
              <h4 className="government-section-label">🎴 {t("game:government.nationalAbility")}</h4>
              <div className="government-actions">
                <DecisionActionCard
                  icon="🎴"
                  title={translateBackend(ability.label)}
                  costLabel={t("game:government.nationalAbility")}
                  description={translateBackend(ability.description)}
                  effects={ability.requiresTargetIdeology ? [{ label: t("game:government.abilityNeedsTarget"), value: "" }] : [{ label: t("game:government.abilityInstant"), value: "" }]}
                  status={
                    abilitySelected
                      ? "selected"
                      : !ability.isAvailable
                        ? "disabled"
                        : "available"
                  }
                  statusText={
                    abilitySelected
                      ? "✓ " + t("game:government.abilityEnabledThisRound")
                      : !ability.isAvailable
                        ? t("game:government.abilityAlreadyUsed")
                        : t("game:government.canEnable")
                  }
                  control={{
                    kind: "toggle",
                    checked: abilitySelected,
                    onChange: (next) => onToggleAbility?.(next),
                    label: abilitySelected ? t("common:revoke") : t("game:government.enable"),
                    ariaLabel: t("game:government.enableAbility", { label: ability.label }),
                    disabled: !ability.isAvailable || !onToggleAbility,
                  }}
                >
                  {parameterInspector?.render(`government.ability.${ability.abilityId}`, {
                    title: translateBackend(ability.label),
                    currentEffect: translateBackend(ability.description),
                  })}
                  {ability.requiresTargetIdeology && abilitySelected ? (
                    <div className="government-ability-targets" role="radiogroup" aria-label={t("game:government.abilityTargetIdeology", "{{label}} 目标意识形态", { label: ability.label })}>
                      {IDEOLOGY_KEYS.map((key) => (
                        <label key={key} className="government-ability-target">
                          <input
                            type="radio"
                            name={`ability-target-${ability.abilityId}`}
                            checked={abilityTarget === key}
                            aria-label={`${translateBackend(ability.label)} ${getIdeologyLabel(key)}`}
                            onChange={() => onAbilityTargetChange?.(key)}
                          />
                          <span>{IDEOLOGY_ICONS[key]} {getIdeologyLabel(key)}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </DecisionActionCard>
              </div>
            </>
          )}

          {marketPolicySection}

          {/* 政策（可激活） */}
          {inactivePolicies.length > 0 && (
            <>
              <h4 className="government-section-label">🆕 {t("game:government.activablePolicies")}</h4>
              <div className="government-actions">
                {inactivePolicies.map((policy) => {
                  const active = isPolicyActiveAfter(policy.policyId, policy.isActive);
                  const policyBudgetCost = policy.budgetCost;
                  const budgetLockedReason = !active && policyBudgetCost > 0 && fiscalState.effectiveGovernmentRemaining < policyBudgetCost
                    ? t("game:government.insufficientBudget", "财政不足")
                    : null;
                  const adminLockedReason = !active && projectedAdmin < policy.adminCostPerTurn
                    ? t("game:government.insufficientAdminCapacity", "行政力不足")
                    : null;
                  const lockedReason = !policy.isUnlocked
                    ? policy.isBlocked
                      ? policy.lockedReason ?? t("game:government.pathBlocked")
                      : policy.requiresReform
                      ? t("game:government.needsReform", { reform: getReformLabel(policy.requiresReform) })
                      : t("game:government.lockedPolicy")
                    : budgetLockedReason ?? adminLockedReason;
                  const isDisabled = lockedReason !== null && !active;
                  const status = active ? "selected" : lockedReason ? "disabled" : "available";
                  const effects = formatPolicyEffects(policy, reforms.revolutionThreshold);
                  return (
                    <DecisionActionCard
                      key={policy.policyId}
                      icon="🆕"
                      title={translateBackend(policy.label)}
                      costLabel={formatPolicyCostLabel(policy)}
                      description={
                        policy.effects?.militaryPointsDelta !== undefined
                          ? t("game:government.policyDescWithMilitaryDelay", "{{desc}} 效果从本回合结算后开始，不会立刻增加本轮军事行动点。", { desc: translateBackend(policy.description) })
                          : translateBackend(policy.description)
                      }
                      effects={effects}
                      status={status}
                      statusText={active ? "✓ " + t("game:government.policyActivateThisRound") : lockedReason ?? t("game:government.readyToActivate", "可激活")}
                      control={{
                        kind: "toggle",
                        checked: active,
                        onChange: (next) => onTogglePolicy(policy.policyId, next),
                        label: active ? t("common:revoke") : t("common:activate"),
                        ariaLabel: t("game:government.activatePolicy", { label: policy.label }),
                        disabled: isDisabled,
                      }}
                    >
                      {parameterInspector?.render(`government.policy.${policy.policyId}`, {
                        title: translateBackend(policy.label),
                        currentEffect: translateBackend(policy.description),
                      })}
                    </DecisionActionCard>
                  );
                })}
              </div>
            </>
          )}

        </div>
      </div>
    </section>
  );
}
