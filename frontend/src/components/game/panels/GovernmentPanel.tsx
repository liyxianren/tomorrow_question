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
} from "../../../features/game/decisionShared";
import "./GovernmentPanel.css";

type ReformPath = "freedom" | "equality" | "national";

const REFORM_PATHS: ReformPath[] = ["freedom", "equality", "national"];

const REFORM_PATH_LABELS: Record<ReformPath, string> = {
  freedom: i18n.t("game:government.reformPath_free", "自由之路"),
  equality: i18n.t("game:government.reformPath_equality", "平等之路"),
  national: i18n.t("game:government.reformPath_national", "民族之路"),
};

const REFORM_PATH_ICONS: Record<ReformPath, string> = {
  freedom: "🗽",
  equality: "⚖️",
  national: "🛡️",
};

const IDEOLOGY_META: Record<IdeologyKey, { label: string; icon: string }> = {
  liberalism: { label: i18n.t("game:government.ideology.liberalism", "自由主义"), icon: "📈" },
  egalitarianism: { label: i18n.t("game:government.ideology.egalitarianism", "平等主义"), icon: "🤝" },
  nationalism: { label: i18n.t("game:government.ideology.nationalism", "民族主义"), icon: "🛡️" },
};

const IDEOLOGY_KEYS: IdeologyKey[] = ["liberalism", "egalitarianism", "nationalism"];

const MARKET_STRATEGY_ICONS: Record<string, string> = {
  expand_workshop: "⚙️",
  market_fair: "🎪",
  rural_development: "🌾",
  consumer_subsidy: "💰",
  import_substitution: "🧱",
  public_works: "🏗️",
  luxury_promotion: "💎",
  infrastructure_investment: "🏭",
  trade_hub: "⚓",
  market_subsidy: "🏛️",
  price_control: "⚖️",
  trade_promotion: "⚓",
};

const MARKET_POLICY_ACTION_IDS = new Set(["market_subsidy", "price_control", "trade_promotion"]);
const MARKET_POLICY_ADMIN_COST = 1;

const MARKET_PREVIEW_EFFECT_KEYS = [
  "domesticMarketCapacityDelta",
  "domesticPriceBonusDelta",
  "handicraftCapacityDelta",
  "overseasMarketCapacityDelta",
] as const;

const MARKET_PREVIEW_EFFECT_LABELS: Record<(typeof MARKET_PREVIEW_EFFECT_KEYS)[number], string> = {
  domesticMarketCapacityDelta: i18n.t("game:government.effect.domesticCapacity", "国内容量"),
  domesticPriceBonusDelta: i18n.t("game:government.effect.domesticPrice", "国内价格"),
  handicraftCapacityDelta: i18n.t("game:government.effect.handicraft", "手工业"),
  overseasMarketCapacityDelta: i18n.t("game:government.effect.overseasCapacity", "海外容量"),
};

const IDEOLOGY_LABELS: Record<IdeologyKey, string> = {
  liberalism: i18n.t("game:government.ideology.liberalism", "自由主义"),
  egalitarianism: i18n.t("game:government.ideology.egalitarianism", "平等主义"),
  nationalism: i18n.t("game:government.ideology.nationalism", "民族主义"),
};

const ALLOCATION_LABELS: Record<string, string> = {
  consumption: i18n.t("game:government.allocation.consumption", "国民消费"),
  domesticMarket: i18n.t("game:government.allocation.consumption", "国民消费"),
  fiscal: i18n.t("game:government.allocation.fiscal", "政府财政"),
  governmentFiscal: i18n.t("game:government.allocation.fiscal", "政府财政"),
  factory: i18n.t("game:government.allocation.factory", "工厂预算"),
};
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

const DEFAULT_IDEOLOGY_MILESTONES: Record<IdeologyKey, IdeologyMilestone[]> = {
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
    { level: 7, label: i18n.t("game:milestone.globalCommerce", "全球通商"), effects: { overseasPriceBonusDelta: 1 } },
    {
      level: 10,
      label: i18n.t("game:milestone.nationalRevival", "民族复兴"),
      effects: { overseasMarketCapacityDelta: 2 },
      penalty: { domesticMarketCapacityDelta: -2 },
    },
  ],
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

const REFORM_DESCRIPTION_FALLBACKS: Record<string, string> = {
  constitution: i18n.t("game:reformDesc.constitution", "以宪法约束国家权力，降低三类激进思潮，减少革命风险。"),
  stock_market: i18n.t("game:reformDesc.stock_market", "建立资本市场和股份融资框架；当前不会立刻给预算或点数，主要作为自由路线的早期制度基础。"),
  parliament: i18n.t("game:reformDesc.parliament", "建立议会程序，开放请愿与国会系政策空间，让后续政策能通过制度渠道处理。"),
  patent_system: i18n.t("game:reformDesc.patent_system", "保护发明和技术产权，为私人研发与工业升级政策提供制度基础。"),
  representative_state: i18n.t("game:reformDesc.representative_state", "完成代议制转型，大幅缓和三类思潮压力，降低接近革命阈值的风险。"),
  universal_suffrage: i18n.t("game:reformDesc.universal_suffrage", "扩大选举权，提高大众政治参与和民族动员；会推高民族主义压力。"),
  trust_system: i18n.t("game:reformDesc.trust_system", "扶持大型企业集团，把收入分配推向工厂并降低升级成本，但会显著激化平等主义。"),
  social_relief: i18n.t("game:reformDesc.social_relief", "建立救济制度，作为平等路线基础；当前不会立刻给预算或点数，主要铺垫福利与再分配改革。"),
  eight_hour_day: i18n.t("game:reformDesc.eight_hour_day", "限制工时以缓和劳工激进情绪，但全品类产能下降，短期工业能力会受损。"),
  social_redistribution: i18n.t("game:reformDesc.social_redistribution", "建立再分配制度，解锁资本税相关政策，后续可调节财政与阶级压力。"),
  labor_union: i18n.t("game:reformDesc.labor_union", "承认工会组织，形成劳资谈判渠道；当前不会立刻给预算或点数，主要铺垫平等路线深化。"),
  soviet_state: i18n.t("game:reformDesc.soviet_state", "转向苏维埃国家形态，锁定平等路线，并排斥自由与民族终局路线。"),
  collective_farms: i18n.t("game:reformDesc.collective_farms", "推动农业集体化，大幅降低升级成本，但会刺激自由主义反弹。"),
  planned_economy: i18n.t("game:reformDesc.planned_economy", "改为计划经济，锁定收入分配到国民消费与政府财政，牺牲工厂预算并刺激自由主义。"),
  compulsory_education: i18n.t("game:reformDesc.compulsory_education", "建立义务教育体系，作为长期研发和国家治理能力的制度基础。"),
  state_media: i18n.t("game:reformDesc.state_media", "建设国家媒体机器，解锁政治鼓动类政策，用于主动调节思潮。"),
  modern_customs: i18n.t("game:reformDesc.modern_customs", "建立现代海关体系，解锁贸易开闭政策，用于控制海外贸易和收入结构。"),
  keynesianism: i18n.t("game:reformDesc.keynesianism", "建立国家干预经济框架，解锁以工代赈等政策，用财政稳定内需和就业。"),
  fascist_state: i18n.t("game:reformDesc.fascist_state", "转向法西斯国家形态，压低民族主义革命压力，同时封锁自由和平等终局路线。"),
  total_mobilization: i18n.t("game:reformDesc.total_mobilization", "建立全民动员体制，作为民族路线后期军事化基础；当前不会立刻给预算或点数。"),
  secret_police: i18n.t("game:reformDesc.secret_police", "建立秘密警察体系，作为压制与控制思潮的后期制度基础；当前不会立刻给预算或点数。"),
};

function formatSigned(delta: number): string {
  return `${delta > 0 ? "+" : ""}${delta}`;
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
    || REFORM_DESCRIPTION_FALLBACKS[reform.reformId]
    || i18n.t("game:government.reformDefaultDesc", "{{path}}改革。当前暂无额外说明。", { path: REFORM_PATH_LABELS[reform.path] });
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
): string[] {
  const tags: string[] = [];

  const ideologyDelta = effects.ideologyDelta as Record<string, number> | undefined;
  if (ideologyDelta) {
    for (const [key, delta] of Object.entries(ideologyDelta)) {
      const label = IDEOLOGY_LABELS[key as IdeologyKey] ?? key;
      tags.push(`${label} ${i18n.t("game:government.ideologySuffix")} ${formatSigned(delta)}`);
    }
  }

  const ratioDelta = effects.ratioDelta as Record<string, number> | undefined;
  if (ratioDelta) {
    const names: Record<string, string> = {
      factory: i18n.t("game:government.allocation.factory", "工厂"),
      consumption: i18n.t("game:government.allocation.consumption", "国民消费"),
      fiscal: i18n.t("game:government.allocation.fiscal", "政府财政"),
      domesticMarket: i18n.t("game:government.allocation.consumption", "国民消费"),
      governmentFiscal: i18n.t("game:government.allocation.fiscal", "政府财政"),
    };
    for (const [key, delta] of Object.entries(ratioDelta)) {
      const label = names[key] ?? key;
      tags.push(`${label} ${i18n.t("game:government.distributionSuffix")} ${formatSigned(delta)}`);
    }
  }

  const ratioOverride = effects.ratioOverride as Record<string, number> | undefined;
  if (ratioOverride) {
    const names: Record<string, string> = {
      factory: i18n.t("game:government.allocation.factory", "工厂"),
      consumption: i18n.t("game:government.allocation.domesticMarket", "国内市场"),
      fiscal: i18n.t("game:government.allocation.fiscal", "政府财政"),
    };
    const parts = Object.entries(ratioOverride).map(
      ([k, v]) => `${names[k] ?? k}:${v}`,
    );
    tags.push(i18n.t("game:government.allocationLock", "分配锁定 {{parts}}", { parts: parts.join("/") }));
  }

  if (effects.upgradeCostMultiplier !== undefined) {
    tags.push(i18n.t("game:government.upgradeCostMultiplier", "升级成本 ×{{multiplier}}", { multiplier: effects.upgradeCostMultiplier }));
  }

  if (effects.administrationCapacityDelta !== undefined) {
    const delta = Number(effects.administrationCapacityDelta);
    tags.push(i18n.t("game:government.administrationCapacityDelta", "行政力上限 {{delta}}", { delta: formatSigned(delta) }));
  }

  if (effects.productionCapacityDelta !== undefined) {
    const delta = effects.productionCapacityDelta as Record<string, number>;
    for (const [key, val] of Object.entries(delta)) {
      tags.push(i18n.t("game:government.productionCapacityChange", "{{key}}产能 {{val}}", { key: key === "all" ? i18n.t("game:government.allCategories", "全品类") : key, val: val > 0 ? `+${val}` : `${val}` }));
    }
  }

  if (unlocksPolicies.length > 0) {
    tags.push(i18n.t("game:government.unlocksPolicies", "解锁 {{count}} 项政策", { count: unlocksPolicies.length }));
  }

  return tags;
}

const RATIO_NAME_MAP: Record<string, string> = {
  domesticMarket: i18n.t("game:government.allocation.consumption", "国民消费"),
  governmentFiscal: i18n.t("game:government.allocation.fiscal", "政府财政"),
  factory: i18n.t("game:government.allocation.factory", "工厂预算"),
  consumption: i18n.t("game:government.allocation.consumption", "国民消费"),
  fiscal: i18n.t("game:government.allocation.fiscal", "政府财政"),
};

function formatStrategyEffects(
  strategy: { effects?: Record<string, number | Record<string, number>>; ratioDelta?: Record<string, number> },
): DecisionActionCardEffect[] {
  const effects: DecisionActionCardEffect[] = [];

  if (strategy.effects) {
    effects.push(...buildEffectMetrics(strategy.effects).filter((effect) => effect.label !== "科技点" && effect.label !== "Tech Points"));
  }

  if (strategy.ratioDelta) {
    const parts = formatRatioDeltaParts(strategy.ratioDelta, RATIO_NAME_MAP);
    if (parts.length > 0) {
      effects.push({ label: i18n.t("game:government.incomeAllocation", "收入分配"), value: parts.join("，"), temporary: true });
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
    const parts = formatRatioDeltaParts(ratioDelta, ALLOCATION_LABELS);
    if (parts.length > 0) {
      effects.push({ label: i18n.t("game:government.incomeAllocationPerTurn", "本轮收入分配"), value: parts.join("，") });
    }
  }

  const ideologyDelta = e.ideologyDelta as Record<string, number> | undefined;
  if (ideologyDelta) {
    const parts = Object.entries(ideologyDelta).map(([key, delta]) => {
      const label = IDEOLOGY_LABELS[key as IdeologyKey] ?? key;
      return `${label} ${formatSigned(delta)}`;
    });
    if (parts.length > 0) {
      effects.push({ label: i18n.t("game:government.ideologyPressure", "思潮压力"), value: i18n.t("game:government.ideologyPressureValue", "{{parts}}（{{threshold}} 最高警戒）", { parts: parts.join("，"), threshold: revolutionThreshold }) });
    }
  }

  if (e.militaryPointsDelta !== undefined) {
    const delta = e.militaryPointsDelta as number;
    effects.push({ label: i18n.t("game:government.militaryPointsPerSettlement", "结算后每回合军事点"), value: formatSigned(delta) });
  }

  if (e.armyCapDelta !== undefined) {
    const delta = e.armyCapDelta as number;
    effects.push({ label: i18n.t("game:government.armyCapMax", "军事力量上限"), value: formatSigned(delta) });
  }

  if (e.fiscalRefund !== undefined) {
    effects.push({ label: i18n.t("game:government.allocation.fiscal", "政府财政"), value: `+${e.fiscalRefund}` });
  }

  const researchFacilityDelta = e.researchFacilityDelta as Record<string, number> | undefined;
  if (researchFacilityDelta) {
    const total = Object.values(researchFacilityDelta).reduce((sum, delta) => sum + Number(delta || 0), 0);
    if (total !== 0) {
      effects.push({ label: i18n.t("game:government.researchFacilities", "研究设施"), value: formatSigned(total) });
    }
  }

  const productionCapacityDelta = e.productionCapacityDelta as Record<string, number> | undefined;
  if (productionCapacityDelta) {
    const parts = Object.entries(productionCapacityDelta).map(([key, delta]) => {
      const label = key === "all" ? i18n.t("game:government.allCategories", "全品类") : translateBackend(key);
      return `${label} ${formatSigned(delta)}`;
    });
    if (parts.length > 0) {
      effects.push({ label: i18n.t("game:government.productionCapacity", "产能"), value: parts.join("，") });
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
      actionId: "market_subsidy",
      label: i18n.t("game:government.strategy.marketSubsidy", "市场补贴"),
      cost: 0,
      description: i18n.t("game:government.strategy.marketSubsidyDesc", "动用行政力组织本轮内需补贴，扩大国内承接量。"),
      techPointDelta: 0,
      militaryPointDelta: 0,
      lockedReason: null,
      effects: { domesticMarketCapacityDelta: 2 },
    },
    {
      actionId: "price_control",
      label: i18n.t("game:government.strategy.priceControl", "价格管制"),
      cost: 0,
      description: i18n.t("game:government.strategy.priceControlDesc", "动用行政力调控本轮国内收购价格。"),
      techPointDelta: 0,
      militaryPointDelta: 0,
      lockedReason: null,
      effects: { domesticPriceBonusDelta: 2 },
    },
    {
      actionId: "trade_promotion",
      label: i18n.t("game:government.strategy.tradePromotion", "贸易促进"),
      cost: 0,
      description: i18n.t("game:government.strategy.tradePromotionDesc", "动用行政力协调贸易渠道，扩大本回合海外市场容量。"),
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
  return parts.length > 0 ? parts.join("，") : i18n.t("game:government.stageEffect", "阶段效果");
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
    .map((milestone) => `${milestone.level}：${translateBackend(milestone.label)}（${formatMilestoneSummary(milestone)}）`)
    .join("\n");
}

function resolveIdeologyMilestones(
  configured: Record<string, IdeologyMilestone[]> | undefined,
  key: IdeologyKey,
): IdeologyMilestone[] {
  const milestones = configured?.[key];
  return milestones && milestones.length > 0 ? milestones : DEFAULT_IDEOLOGY_MILESTONES[key];
}

export interface GovernmentPanelProps {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingGovernmentBudget: number;
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
  const baseDomesticCapacity = workspace.domesticMarketCapacity ?? phase1Economy?.domesticDemand;
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
    - queuedReformAdminCost
    - projectedActivePolicyUpkeep
    - queuedMarketPolicyAdminCost;
  const projectedAdmin = Math.max(0, rawProjectedAdmin);
  const projectedAdminTotal = reforms.administrationCapacity;

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
  const fiscalState = calculateGovernmentFiscalState(workspace, draft);
  const policyBudgetSupplementItem = fiscalState.policyBudgetSupplement > 0
    ? [{
        icon: "🧾",
        value: `${fiscalState.policyBudgetSupplementRemaining} / ${fiscalState.policyBudgetSupplement}`,
        label: t("game:government.policyBudgetAllowance", "Policy allowance"),
      }]
    : [];

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
        <span>{t("game:government.domesticCapacityRef")} {formatMarketNumber(baseDomesticCapacity)}→{formatMarketNumber(projectedDomesticCapacity)}</span>
        <span>{referencePrice.isCapped ? t("game:government.priceCapped") : t("game:government.equilibriumPriceLabel")} {formatMarketNumber(referencePrice.price)}</span>
        <span>{t("game:government.overseasExport")} {formatMarketNumber(baseOverseasCapacity)}→{formatMarketNumber(projectedOverseasCapacity)}</span>
        {selectedMarketEffectSummary.length > 0
          ? selectedMarketEffectSummary.map((item) => (
              <span key={item.key}>
                {MARKET_PREVIEW_EFFECT_LABELS[item.key]} {formatSigned(item.value)}
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
          ...policyBudgetSupplementItem,
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
        ]}
      />

      {/* ── 思潮信号 ── */}
      <h4 className="government-section-label">
        🧭 {t("game:government.ideologySignal")}
        <span
          className="government-section-hint"
          title={t("game:government.ideologyHighestAlert", { threshold: reforms.revolutionThreshold })}
        >
          （{t("game:government.ideologyHighestAlertShort", { threshold: reforms.revolutionThreshold })}）
        </span>
      </h4>
      <div className="government-stats">
        {IDEOLOGY_KEYS.map((key) => {
          const meta = IDEOLOGY_META[key];
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
          const meta = IDEOLOGY_META[key];
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
                  <span>{REFORM_PATH_LABELS[path]}</span>
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
                    ⚠️ {t("game:government.ideologyHighestAlert", { threshold: reforms.revolutionThreshold })}：
                    {criticalIdeologies
                      .map(
                        (key) =>
                          `${IDEOLOGY_LABELS[key]} ${reforms.ideologyLevels[key] ?? 0}→${projectedIdeology[key]} ≥ ${reforms.revolutionThreshold}`,
                      )
                      .join("，")}
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
                            aria-label={`${ability.label} ${IDEOLOGY_LABELS[key]}`}
                            onChange={() => onAbilityTargetChange?.(key)}
                          />
                          <span>{IDEOLOGY_META[key].icon} {IDEOLOGY_LABELS[key]}</span>
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
                    ? policy.requiresReform
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
