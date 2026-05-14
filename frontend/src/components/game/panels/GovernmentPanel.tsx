import { useState } from "react";
import type { DecisionPlayerPhaseWorkspace, IdeologyKey } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
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
  freedom: "自由之路",
  equality: "平等之路",
  national: "民族之路",
};

const REFORM_PATH_ICONS: Record<ReformPath, string> = {
  freedom: "🗽",
  equality: "⚖️",
  national: "🛡️",
};

const IDEOLOGY_META: Record<IdeologyKey, { label: string; icon: string }> = {
  liberalism: { label: "自由主义", icon: "📈" },
  egalitarianism: { label: "平等主义", icon: "🤝" },
  nationalism: { label: "民族主义", icon: "🛡️" },
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
};

const MARKET_PREVIEW_EFFECT_KEYS = [
  "domesticMarketCapacityDelta",
  "domesticPriceBonusDelta",
  "handicraftCapacityDelta",
  "overseasMarketCapacityDelta",
] as const;

const MARKET_PREVIEW_EFFECT_LABELS: Record<(typeof MARKET_PREVIEW_EFFECT_KEYS)[number], string> = {
  domesticMarketCapacityDelta: "国内容量",
  domesticPriceBonusDelta: "国内价格",
  handicraftCapacityDelta: "手工业",
  overseasMarketCapacityDelta: "海外容量",
};

const IDEOLOGY_LABELS: Record<IdeologyKey, string> = {
  liberalism: "自由主义",
  egalitarianism: "平等主义",
  nationalism: "民族主义",
};

const ALLOCATION_LABELS: Record<string, string> = {
  consumption: "国民消费",
  domesticMarket: "国民消费",
  fiscal: "政府财政",
  governmentFiscal: "政府财政",
  factory: "工厂预算",
};

type IdeologyMilestone = {
  level: number;
  label: string;
  effects?: Record<string, unknown>;
  penalty?: Record<string, unknown>;
};

const DEFAULT_IDEOLOGY_MILESTONES: Record<IdeologyKey, IdeologyMilestone[]> = {
  liberalism: [
    { level: 3, label: "贸易许可", effects: { factoryBudgetDelta: 2 } },
    { level: 5, label: "产业自由化", effects: { domesticPriceBonusDelta: 1 } },
    { level: 7, label: "工业议会", effects: { techPointsDelta: 1 } },
    {
      level: 10,
      label: "代议制国家",
      effects: { domesticMarketCapacityDelta: 3 },
      penalty: { governmentFiscalBudgetDelta: -3 },
    },
  ],
  egalitarianism: [
    { level: 3, label: "劳工保护", effects: { domesticMarketCapacityDelta: 1 } },
    { level: 5, label: "公共教育", effects: { techPointsDelta: 1 } },
    { level: 7, label: "社会保障", effects: { domesticMarketCapacityDelta: 2 } },
    {
      level: 10,
      label: "社会国家",
      effects: { domesticPriceBonusDelta: 3 },
      penalty: { factoryBudgetDelta: -3 },
    },
  ],
  nationalism: [
    { level: 3, label: "国防动员", effects: { militaryPointsDelta: 1 } },
    { level: 5, label: "关税同盟", effects: { overseasMarketCapacityDelta: 1 } },
    { level: 7, label: "殖民扩张", effects: { overseasPriceBonusDelta: 1 } },
    {
      level: 10,
      label: "帝国主义",
      effects: { controlledRegionsDelta: 2 },
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
  expand_administration: { administrationCapacityDelta: 1 },
};

const REFORM_DESCRIPTION_FALLBACKS: Record<string, string> = {
  constitution: "以宪法约束国家权力，降低三类激进思潮，减少革命风险。",
  stock_market: "建立资本市场和股份融资框架；当前不会立刻给预算或点数，主要作为自由路线的早期制度基础。",
  parliament: "建立议会程序，开放请愿与国会系政策空间，让后续政策能通过制度渠道处理。",
  patent_system: "保护发明和技术产权，为私人研发与工业升级政策提供制度基础。",
  representative_state: "完成代议制转型，大幅缓和三类思潮压力，降低接近革命阈值的风险。",
  universal_suffrage: "扩大选举权，提高大众政治参与和民族动员；会推高民族主义压力。",
  trust_system: "扶持大型企业集团，把收入分配推向工厂并降低升级成本，但会显著激化平等主义。",
  social_relief: "建立救济制度，作为平等路线基础；当前不会立刻给预算或点数，主要铺垫福利与再分配改革。",
  eight_hour_day: "限制工时以缓和劳工激进情绪，但全品类产能下降，短期工业能力会受损。",
  social_redistribution: "建立再分配制度，解锁资本税相关政策，后续可调节财政与阶级压力。",
  labor_union: "承认工会组织，形成劳资谈判渠道；当前不会立刻给预算或点数，主要铺垫平等路线深化。",
  soviet_state: "转向苏维埃国家形态，锁定平等路线，并排斥自由与民族终局路线。",
  collective_farms: "推动农业集体化，大幅降低升级成本，但会刺激自由主义反弹。",
  planned_economy: "改为计划经济，锁定收入分配到国民消费与政府财政，牺牲工厂预算并刺激自由主义。",
  compulsory_education: "建立义务教育体系，作为长期研发和国家治理能力的制度基础。",
  state_media: "建设国家媒体机器，解锁政治鼓动类政策，用于主动调节思潮。",
  modern_customs: "建立现代海关体系，解锁贸易开闭政策，用于控制海外贸易和收入结构。",
  keynesianism: "建立国家干预经济框架，解锁以工代赈等政策，用财政稳定内需和就业。",
  fascist_state: "转向法西斯国家形态，压低民族主义革命压力，同时封锁自由和平等终局路线。",
  total_mobilization: "建立全民动员体制，作为民族路线后期军事化基础；当前不会立刻给预算或点数。",
  secret_police: "建立秘密警察体系，作为压制与控制思潮的后期制度基础；当前不会立刻给预算或点数。",
};

function formatSigned(delta: number): string {
  return `${delta > 0 ? "+" : ""}${delta}`;
}

function formatShortfall(cost: number, remaining: number): string {
  return `还差 ${Math.max(0, cost - remaining)} 财政`;
}

function buildPurchaseEffects(
  quantity: number,
  cost: number,
  pointLabel: string,
): DecisionActionCardEffect[] {
  if (quantity <= 0) return [];
  return [
    { label: "政府财政", value: `-${quantity * cost}` },
    { label: pointLabel, value: `+${quantity}` },
  ];
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
  return reform.description
    || REFORM_DESCRIPTION_FALLBACKS[reform.reformId]
    || `${REFORM_PATH_LABELS[reform.path]}改革。当前暂无额外说明。`;
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
      tags.push(`${label}思潮 ${formatSigned(delta)}`);
    }
  }

  const ratioDelta = effects.ratioDelta as Record<string, number> | undefined;
  if (ratioDelta) {
    const names: Record<string, string> = {
      factory: "工厂",
      consumption: "国民消费",
      fiscal: "政府财政",
      domesticMarket: "国民消费",
      governmentFiscal: "政府财政",
    };
    for (const [key, delta] of Object.entries(ratioDelta)) {
      const label = names[key] ?? key;
      tags.push(`${label}分配 ${formatSigned(delta)}`);
    }
  }

  const ratioOverride = effects.ratioOverride as Record<string, number> | undefined;
  if (ratioOverride) {
    const names: Record<string, string> = {
      factory: "工厂",
      consumption: "国内市场",
      fiscal: "政府财政",
    };
    const parts = Object.entries(ratioOverride).map(
      ([k, v]) => `${names[k] ?? k}:${v}`,
    );
    tags.push(`分配锁定 ${parts.join("/")}`);
  }

  if (effects.upgradeCostMultiplier !== undefined) {
    tags.push(`升级成本 ×${effects.upgradeCostMultiplier}`);
  }

  if (effects.productionCapacityDelta !== undefined) {
    const delta = effects.productionCapacityDelta as Record<string, number>;
    for (const [key, val] of Object.entries(delta)) {
      tags.push(`${key === "all" ? "全品类" : key}产能 ${val > 0 ? "+" : ""}${val}`);
    }
  }

  if (unlocksPolicies.length > 0) {
    tags.push(`解锁 ${unlocksPolicies.length} 项政策`);
  }

  return tags;
}

const RATIO_NAME_MAP: Record<string, string> = {
  domesticMarket: "国民消费",
  governmentFiscal: "政府财政",
  factory: "工厂预算",
  consumption: "国民消费",
  fiscal: "政府财政",
};

function formatStrategyEffects(
  strategy: { effects?: Record<string, number | Record<string, number>>; ratioDelta?: Record<string, number> },
): DecisionActionCardEffect[] {
  const effects: DecisionActionCardEffect[] = [];

  if (strategy.effects) {
    effects.push(...buildEffectMetrics(strategy.effects).filter((effect) => effect.label !== "科技点"));
  }

  if (strategy.ratioDelta) {
    const parts = Object.entries(strategy.ratioDelta).map(([key, delta]) => {
      const label = RATIO_NAME_MAP[key] ?? key;
      return `${label} ${formatSigned(delta)}`;
    });
    if (parts.length > 0) {
      effects.push({ label: "收入分配", value: parts.join("，"), temporary: true });
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
  policy: { policyId: string; effects?: Record<string, unknown>; adminCostPerTurn: number; budgetCost: number },
  revolutionThreshold: number,
): DecisionActionCardEffect[] {
  const effects: DecisionActionCardEffect[] = [];

  const e = policy.effects ?? POLICY_EFFECT_FALLBACKS[policy.policyId];
  if (!e) return effects;

  const ratioDelta = e.ratioDelta as Record<string, number> | undefined;
  if (ratioDelta) {
    const parts = Object.entries(ratioDelta).map(([key, delta]) => {
      const label = ALLOCATION_LABELS[key] ?? key;
      return `${label} ${formatSigned(delta)}`;
    });
    if (parts.length > 0) {
      effects.push({ label: "每回合收入分配", value: parts.join("，") });
    }
  }

  const ideologyDelta = e.ideologyDelta as Record<string, number> | undefined;
  if (ideologyDelta) {
    const parts = Object.entries(ideologyDelta).map(([key, delta]) => {
      const label = IDEOLOGY_LABELS[key as IdeologyKey] ?? key;
      return `${label} ${formatSigned(delta)}`;
    });
    if (parts.length > 0) {
      effects.push({ label: "思潮压力", value: `${parts.join("，")}（${revolutionThreshold} 最高警戒）` });
    }
  }

  if (e.militaryPointsDelta !== undefined) {
    const delta = e.militaryPointsDelta as number;
    effects.push({ label: "结算后每回合军事点", value: formatSigned(delta) });
  }

  if (e.fiscalRefund !== undefined) {
    effects.push({ label: "政府财政", value: `+${e.fiscalRefund}` });
  }

  if (e.administrationCapacityDelta !== undefined) {
    const delta = e.administrationCapacityDelta as number;
    effects.push({ label: "行政力上限", value: formatSigned(delta) });
  }

  return effects;
}

function formatMilestoneSummary(milestone: IdeologyMilestone): string {
  const effectMetrics = buildEffectMetrics(
    milestone.effects as Record<string, number | Record<string, number>> | undefined,
  )
    .filter((effect) => effect.label !== "科技点")
    .map((effect) => `${effect.label} ${effect.value}`);
  const penaltyMetrics = buildEffectMetrics(
    milestone.penalty as Record<string, number | Record<string, number>> | undefined,
  ).map((effect) => `${effect.label} ${effect.value}`);
  const parts = [...effectMetrics, ...penaltyMetrics.map((text) => `代价 ${text}`)];
  return parts.length > 0 ? parts.join("，") : "阶段效果";
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
  if (!milestones || milestones.length === 0) return "暂无阶段效果配置";
  return [...milestones]
    .sort((a, b) => a.level - b.level)
    .map((milestone) => `${milestone.level}：${milestone.label}（${formatMilestoneSummary(milestone)}）`)
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
  onAdminPurchase: (quantity: number) => void;
  onMilitaryPurchase: (quantity: number) => void;
  onEnactReform: (reformId: string, queued: boolean) => void;
  onTogglePolicy: (policyId: string, active: boolean) => void;
  onToggleStrategy: (actionId: string, checked: boolean) => void;
  onToggleAbility?: (checked: boolean) => void;
  onAbilityTargetChange?: (ideology: IdeologyKey) => void;
}

export function GovernmentPanel({
  workspace,
  draft,
  remainingGovernmentBudget,
  onAdminPurchase,
  onMilitaryPurchase,
  onEnactReform,
  onTogglePolicy,
  onToggleStrategy,
  onToggleAbility,
  onAbilityTargetChange,
}: GovernmentPanelProps) {
  const [activeReformPath, setActiveReformPath] = useState<ReformPath>("freedom");
  const reforms = workspace.governmentReforms;
  if (!reforms) {
    return (
      <section className="government-panel" data-testid="government-panel">
        <div className="government-panel__header">
          <h3 className="government-panel__title">🏛️ 议会大厅</h3>
          <span className="government-panel__budget">政府财政 {remainingGovernmentBudget}</span>
        </div>
        <p>议会数据未就绪。</p>
      </section>
    );
  }

  const queuedAdminPurchases = Math.max(0, draft.governmentPlan.adminPurchases ?? 0);
  const adminCost = reforms.adminPurchaseCost;
  const queuedReformIds = new Set(draft.reforms ?? []);
  const queuedActivateIds = new Set(draft.activatePolicies ?? []);
  const queuedDeactivateIds = new Set(draft.deactivatePolicies ?? []);

  const strategies = (workspace.governmentActions?.strategies ?? [])
    .filter((strategy) => strategy.actionId !== "expand_research");
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
  const marketPriceHint = phase1Economy
    ? [
        `均衡 ${formatMarketNumber(referencePrice.basePrice)}`,
        `既有加成 ${formatSigned(referencePrice.existingPriceBonus)}`,
        selectedDomesticPriceDelta !== 0 ? `本轮调节 ${formatSigned(selectedDomesticPriceDelta)}` : null,
        `上限 ${referencePrice.priceCeiling}`,
        referencePrice.isCapped ? "已触顶" : null,
      ].filter(Boolean).join("，")
    : "等待市场数据同步";
  const ability = workspace.nationalAbility;
  const abilitySelected = Boolean(ability && draft.abilitySelection?.abilityId === ability.abilityId);
  const abilityTarget = IDEOLOGY_KEYS.includes(draft.abilitySelection?.targetIdeology as IdeologyKey)
    ? draft.abilitySelection?.targetIdeology as IdeologyKey
    : "liberalism";

  const queuedReformAdminCost = reforms.availableReforms
    .filter((reform) => queuedReformIds.has(reform.reformId))
    .reduce((sum, reform) => sum + reform.adminCost, 0);
  const projectedActivePolicyUpkeep = reforms.availablePolicies
    .filter((policy) => {
      if (queuedActivateIds.has(policy.policyId)) return true;
      if (queuedDeactivateIds.has(policy.policyId)) return false;
      return policy.isActive;
    })
    .reduce((sum, policy) => sum + policy.adminCostPerTurn, 0);
  const rawProjectedAdmin =
    reforms.administrationCapacity
    + queuedAdminPurchases
    - queuedReformAdminCost
    - projectedActivePolicyUpkeep;
  const projectedAdmin = Math.max(0, rawProjectedAdmin);

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
  const baseGovernmentRemaining = fiscalState.baseGovernmentRemaining;
  const marketRegulationRemaining = Math.max(
    0,
    fiscalState.marketRegulationAllowance - fiscalState.marketRegulationSpend,
  );

  const canBuyAdmin = adminCost > 0 && baseGovernmentRemaining >= adminCost;

  const pointPurchaseCosts = workspace.governmentActions?.pointPurchaseCosts ?? { tech: 0, military: 0 };
  const militaryCost = pointPurchaseCosts.military;
  const queuedMilitaryPurchases = draft.governmentPlan.pointPurchases.find((p) => p.pointType === "military")?.quantity ?? 0;
  const canBuyMilitary = militaryCost > 0 && baseGovernmentRemaining >= militaryCost;
  const canAddMarketStrategy = (cost: number) => {
    const nextMarketSpend = fiscalState.marketRegulationSpend + cost;
    const nextMarketOverflow = Math.max(0, nextMarketSpend - fiscalState.marketRegulationAllowance);
    const nextBaseFiscalSpend = fiscalState.coreGovernmentSpend + fiscalState.militaryFiscalSpend + nextMarketOverflow;
    return nextBaseFiscalSpend <= fiscalState.baseGovernmentBudget;
  };
  const marketRegulationSection = strategies.length > 0 ? (
    <section className="government-market-section">
      <div className="government-market-section__head">
        <div>
          <h4 className="government-section-label">🎯 市场调节</h4>
          <p className="government-section-note">
            民间购买力转化为本轮市场调节额度，优先支付补贴、博览会、进口替代和公共工程。
          </p>
        </div>
        <span className="government-market-section__summary">
          额度 {marketRegulationRemaining}/{fiscalState.marketRegulationAllowance}
        </span>
      </div>
      <div className="government-market-preview" aria-label="市场调节预览" data-testid="government-market-preview">
        <div className="government-market-preview__heading">
          <div>
            <strong>市场基线</strong>
            <span>选择下方策略后，承接量、均衡参考价和和平外销容量会即时更新。</span>
          </div>
          <span className="government-market-preview__status">
            {selectedMarketStrategies.length > 0 ? "已纳入本轮政府策略" : "使用基础供需"}
          </span>
        </div>
        <div className="government-market-preview__grid">
          <div className="government-market-preview__metric">
            <span>市场需求</span>
            <strong>{formatMarketNumber(phase1Economy?.domesticDemand)}</strong>
            <small>出售阶段国内承接参考</small>
          </div>
          <div className="government-market-preview__metric">
            <span>投放上限</span>
            <strong>{formatMarketNumber(projectedDomesticCapacity)}</strong>
            <small>
              基础 {formatMarketNumber(baseDomesticCapacity)}
              {selectedDomesticCapacityDelta !== 0 ? `，调节 ${formatSigned(selectedDomesticCapacityDelta)}` : ""}
            </small>
          </div>
          <div className="government-market-preview__metric">
            <span>{referencePrice.isCapped ? "均衡参考价已封顶" : "均衡参考价"}</span>
            <strong>{formatMarketNumber(referencePrice.price)}</strong>
            <small>{marketPriceHint}</small>
          </div>
          <div className="government-market-preview__metric">
            <span>和平外销</span>
            <strong>{formatMarketNumber(projectedOverseasCapacity)}</strong>
            <small>
              基础外销 {formatMarketNumber(baseOverseasCapacity)}
              {selectedOverseasCapacityDelta !== 0 ? `，调节 ${formatSigned(selectedOverseasCapacityDelta)}` : ""}
            </small>
          </div>
        </div>
        <div className="government-market-preview__effects">
          {selectedMarketEffectSummary.length > 0 ? (
            selectedMarketEffectSummary.map((item) => (
              <span key={item.key}>
                {MARKET_PREVIEW_EFFECT_LABELS[item.key]} {formatSigned(item.value)}
              </span>
            ))
          ) : (
            <span>出售阶段会按实际投放、基础供需和既有效果重新定价。</span>
          )}
        </div>
      </div>
      <div className="government-actions government-actions--market">
        {strategies.map((strategy) => {
          const queued = queuedStrategyIds.has(strategy.actionId);
          const overBudget = !queued && !canAddMarketStrategy(strategy.cost);
          const lockedReason = strategy.lockedReason ?? (overBudget ? "财政不足" : null);
          const isDisabled = !queued && lockedReason !== null;
          const status = queued ? "selected" : lockedReason ? "disabled" : "available";
          return (
            <DecisionActionCard
              key={strategy.actionId}
              icon={MARKET_STRATEGY_ICONS[strategy.actionId] ?? "🎯"}
              title={strategy.label}
              costLabel={`${strategy.cost} 市场调节`}
              description={stripGeneratedEffectSummary(strategy.description ?? undefined)}
              effects={formatStrategyEffects(strategy)}
              status={status}
              statusText={queued ? "✓ 本轮执行" : lockedReason ?? "可选"}
              control={{
                kind: "toggle",
                checked: queued,
                onChange: (next) => onToggleStrategy(strategy.actionId, next),
                label: queued ? "撤回" : "选择",
                ariaLabel: `选择策略：${strategy.label}`,
                disabled: isDisabled,
              }}
            />
          );
        })}
      </div>
    </section>
  ) : null;

  return (
    <section className="government-panel" data-testid="government-panel">
      <div className="government-panel__header">
        <h3 className="government-panel__title">🏛️ 议会大厅</h3>
        <div className="government-panel__budget-stack">
          <span className="government-panel__budget">政府财政 {fiscalState.effectiveGovernmentRemaining}</span>
          <span className="government-panel__budget-detail">
            基础 {baseGovernmentRemaining}/{fiscalState.baseGovernmentBudget} · 市场调节 {marketRegulationRemaining}/{fiscalState.marketRegulationAllowance}
          </span>
        </div>
      </div>

      <DecisionStatStrip
        items={[
          { icon: "📜", value: reforms.administrationCapacity, label: "行政力" },
          { icon: "🧮", value: projectedAdmin, label: "剩余行政力" },
          { icon: "📚", value: reforms.completedReforms.length, label: "已完成改革" },
          { icon: "⚙️", value: activePolicies.length, label: "现行政策" },
        ]}
      />

      {marketRegulationSection}

      {/* ── 思潮信号 ── */}
      <h4 className="government-section-label">
        🧭 思潮信号
        <span
          className="government-section-hint"
          title={`任一意识形态达到 ${reforms.revolutionThreshold} 会进入最高警戒阶段；革命机制尚未开放。`}
        >
          （{reforms.revolutionThreshold} 为最高警戒）
        </span>
      </h4>
      <div className="government-stats">
        {IDEOLOGY_KEYS.map((key) => {
          const meta = IDEOLOGY_META[key];
          const rawLevel = reforms.ideologyLevels[key] ?? 0;
          const level = Math.min(rawLevel, reforms.revolutionThreshold);
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
      <div className="government-ideology-guide" aria-label="思潮阶段效果">
        {IDEOLOGY_KEYS.map((key) => {
          const meta = IDEOLOGY_META[key];
          const rawLevel = reforms.ideologyLevels[key] ?? 0;
          const level = Math.min(rawLevel, reforms.revolutionThreshold);
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
                  ? `下一阶 ${nextMilestone.level}：${nextMilestone.label} · ${formatMilestoneSummary(nextMilestone)}`
                  : `已到最高阶段，后续革命机制尚未开放`}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── 改革路径 ── */}
      <div className="gov-reform-workbench">
        <div className="gov-reform-workbench__header">
          <div>
            <h4 className="government-section-label">🧭 改革路径</h4>
            <p className="government-section-note">
              本轮行政余量 {projectedAdmin} · 最高警戒 {reforms.revolutionThreshold}
              {rawProjectedAdmin < 0 ? " · 政策占用超出行政力" : ""}
            </p>
          </div>
          <div className="gov-reform-tabs" role="tablist" aria-label="改革路径">
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
            <p className="gov-reform-track__empty">暂无可选改革</p>
          ) : activeReformList.map((reform) => {
            const path = reform.path;
            const queued = queuedReformIds.has(reform.reformId);
            const overCapacity = !queued && projectedAdmin < reform.adminCost;
            const lockedReason = reform.isCompleted
              ? "已实施"
              : reform.isBlocked
                ? "路径已封锁"
                : overCapacity
                  ? "行政力不足"
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
                    ⚠️ 实施后进入最高警戒：
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
                    ⚠️ 全局产能 {globalProductionPenalty}
                  </span>
                )}
              </>
            ) : null;
            return (
              <DecisionActionCard
                key={reform.reformId}
                icon={wouldReachCritical ? "⚠️" : REFORM_PATH_ICONS[path]}
                title={reform.label}
                costLabel={`消耗 ${reform.adminCost} 行政力`}
                description={resolveReformDescription(reform)}
                warning={warningNode}
                effects={effectTags.map((tag) => ({ label: tag, value: "" }))}
                status={status}
                statusText={queued ? "✓ 已排队" : lockedReason ?? "可实施"}
                control={{
                  kind: "toggle",
                  checked: queued,
                  onChange: (next) => onEnactReform(reform.reformId, next),
                  label: reform.isCompleted ? "已实施" : queued ? "撤回" : "实施",
                  ariaLabel: `实施改革：${reform.label}`,
                  disabled: isDisabled || (!queued && lockedReason !== null),
                }}
              />
            );
          })}
        </div>
      </div>

      {/* ── 政策与策略 二分布局 ── */}
      <div className="gov-policy-split">
        <div className="gov-policy-split__left">
          {/* 政策（生效中） */}
          {activePolicies.length > 0 ? (
            <>
              <h4 className="government-section-label">⚙️ 现行政策</h4>
              <div className="government-actions">
                {activePolicies.map((policy) => {
                  const active = isPolicyActiveAfter(policy.policyId, policy.isActive);
                  const restoreLockedReason = !active && projectedAdmin < policy.adminCostPerTurn
                    ? "行政力不足"
                    : null;
                  return (
                    <DecisionActionCard
                      key={policy.policyId}
                      icon="📋"
                      title={policy.label}
                      costLabel={`占用 ${policy.adminCostPerTurn} 行政力/回合`}
                      description={policy.description}
                      effects={formatPolicyEffects(policy, reforms.revolutionThreshold)}
                      status={active ? "selected" : restoreLockedReason ? "disabled" : "available"}
                      statusText={active ? `每回合消耗 ${policy.adminCostPerTurn} 行政力` : restoreLockedReason ?? "本轮停用"}
                      control={{
                        kind: "toggle",
                        checked: active,
                        onChange: (next) => onTogglePolicy(policy.policyId, next),
                        label: active ? "停用" : "恢复",
                        ariaLabel: `${active ? "停用政策" : "恢复政策"}：${policy.label}`,
                        disabled: restoreLockedReason !== null,
                      }}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <h4 className="government-section-label">⚙️ 现行政策</h4>
              <p className="gov-policy-split__empty">暂未启用政策</p>
            </>
          )}
        </div>

        <div className="gov-policy-split__right">
          {/* 行政力购买 */}
          <h4 className="government-section-label">💰 提升行政力</h4>
          <div className="government-actions">
            <DecisionActionCard
              icon="📜"
              title="购买行政力"
              costLabel={`${adminCost} 财政/行政力`}
              description="把政府财政转为本轮行政力，用来推进改革或维持政策。"
              effects={buildPurchaseEffects(queuedAdminPurchases, adminCost, "行政力")}
              status={
                queuedAdminPurchases > 0
                  ? "selected"
                  : !canBuyAdmin
                    ? "disabled"
                    : "available"
              }
              statusText={
                queuedAdminPurchases > 0
                  ? `本轮：财政 -${queuedAdminPurchases * adminCost}，行政力 +${queuedAdminPurchases}`
                  : !canBuyAdmin
                    ? formatShortfall(adminCost, baseGovernmentRemaining)
                    : "可兑换"
              }
              control={{
                kind: "stepper",
                value: queuedAdminPurchases,
                min: 0,
                max: adminCost > 0 ? Math.floor((baseGovernmentRemaining + queuedAdminPurchases * adminCost) / adminCost) : 0,
                onChange: onAdminPurchase,
                incrementAriaLabel: "增加行政力购买",
                decrementAriaLabel: "减少行政力购买",
                incrementDisabled: !canBuyAdmin,
              }}
            />
          </div>

          {/* 点数购买 */}
          {militaryCost > 0 && (
            <>
              <h4 className="government-section-label">🎫 点数购买</h4>
              <div className="government-actions">
                {militaryCost > 0 && (
                  <DecisionActionCard
                    icon="⚔️"
                    title="购买军事点"
                    costLabel={`${militaryCost} 财政/军事点`}
                    description="把财政转成军事点，提交后可用于招募、舰队和要塞行动。"
                    effects={buildPurchaseEffects(queuedMilitaryPurchases, militaryCost, "军事点")}
                    status={
                      queuedMilitaryPurchases > 0
                        ? "selected"
                        : !canBuyMilitary
                          ? "disabled"
                          : "available"
                    }
                    statusText={
                      queuedMilitaryPurchases > 0
                        ? `本轮：财政 -${queuedMilitaryPurchases * militaryCost}，军事点 +${queuedMilitaryPurchases}`
                        : !canBuyMilitary
                          ? formatShortfall(militaryCost, baseGovernmentRemaining)
                          : "可兑换"
                    }
                    control={{
                      kind: "stepper",
                      value: queuedMilitaryPurchases,
                      min: 0,
                      max: militaryCost > 0 ? Math.floor((baseGovernmentRemaining + queuedMilitaryPurchases * militaryCost) / militaryCost) : 0,
                      onChange: onMilitaryPurchase,
                      incrementAriaLabel: "增加军事点购买",
                      decrementAriaLabel: "减少军事点购买",
                      incrementDisabled: !canBuyMilitary,
                    }}
                  />
                )}
              </div>
            </>
          )}

          {/* 国家能力 */}
          {ability && (
            <>
              <h4 className="government-section-label">🎴 国家能力</h4>
              <div className="government-actions">
                <DecisionActionCard
                  icon="🎴"
                  title={ability.label}
                  costLabel="国家能力"
                  description={ability.description}
                  effects={ability.requiresTargetIdeology ? [{ label: "需要选择意识形态目标", value: "" }] : [{ label: "即时生效", value: "" }]}
                  status={
                    abilitySelected
                      ? "selected"
                      : !ability.isAvailable
                        ? "disabled"
                        : "available"
                  }
                  statusText={
                    abilitySelected
                      ? "✓ 本轮启用"
                      : !ability.isAvailable
                        ? "本局已使用"
                        : "可启用"
                  }
                  control={{
                    kind: "toggle",
                    checked: abilitySelected,
                    onChange: (next) => onToggleAbility?.(next),
                    label: abilitySelected ? "撤回" : "启用",
                    ariaLabel: `启用国家能力：${ability.label}`,
                    disabled: !ability.isAvailable || !onToggleAbility,
                  }}
                >
                  {ability.requiresTargetIdeology && abilitySelected ? (
                    <div className="government-ability-targets" role="radiogroup" aria-label={`${ability.label} 目标意识形态`}>
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

          {/* 政策（可激活） */}
          {inactivePolicies.length > 0 && (
            <>
              <h4 className="government-section-label">🆕 可激活政策</h4>
              <div className="government-actions">
                {inactivePolicies.map((policy) => {
                  const active = isPolicyActiveAfter(policy.policyId, policy.isActive);
                  const policyBudgetCost = policy.budgetCost;
                  const budgetLockedReason = !active && policyBudgetCost > 0 && baseGovernmentRemaining < policyBudgetCost
                    ? "财政不足"
                    : null;
                  const adminLockedReason = !active && projectedAdmin < policy.adminCostPerTurn
                    ? "行政力不足"
                    : null;
                  const lockedReason = !policy.isUnlocked
                    ? policy.requiresReform
                      ? `需改革：${policy.requiresReform}`
                      : "未解锁"
                    : budgetLockedReason ?? adminLockedReason;
                  const isDisabled = lockedReason !== null && !active;
                  const status = active ? "selected" : lockedReason ? "disabled" : "available";
                  const effects = formatPolicyEffects(policy, reforms.revolutionThreshold);
                  return (
                    <DecisionActionCard
                      key={policy.policyId}
                      icon="🆕"
                      title={policy.label}
                      costLabel={
                        policyBudgetCost > 0
                          ? `${policyBudgetCost} 财政 · 占 ${policy.adminCostPerTurn} 行政力/回合`
                          : `占 ${policy.adminCostPerTurn} 行政力/回合`
                      }
                      description={
                        policy.effects?.militaryPointsDelta !== undefined
                          ? `${policy.description} 效果从本回合结算后开始，不会立刻增加本轮军事行动点。`
                          : policy.description
                      }
                      effects={effects}
                      status={status}
                      statusText={active ? "✓ 本轮激活" : lockedReason ?? "可激活"}
                      control={{
                        kind: "toggle",
                        checked: active,
                        onChange: (next) => onTogglePolicy(policy.policyId, next),
                        label: active ? "撤回" : "激活",
                        ariaLabel: `激活政策：${policy.label}`,
                        disabled: isDisabled,
                      }}
                    />
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
