import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import {
  buildEffectMetrics,
  formatSignedValue,
} from "../../../features/game/decisionShared";
import { DecisionStatStrip } from "./shared/DecisionStatStrip";
import { DecisionActionCard } from "./shared/DecisionActionCard";
import "./DomesticPanel.css";

const ACTION_ICONS: Record<string, string> = {
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

const ACTION_DESCRIPTION_FALLBACKS: Record<string, string> = {
  expand_workshop: "扩建民间手工作坊，增加后续手工业产能。",
  market_fair: "举办商品博览会，低成本扩大本回合国内承接量。",
  rural_development: "投资乡村基建，大幅扩大本回合国内承接量。",
  consumer_subsidy: "追加消费补贴，同时提高本回合国内承接量和收购价格。",
  import_substitution: "限制进口替代品，提高本回合国内承接量和收购价格。",
  public_works: "投入公共工程，同时抬高本回合内需承接和价格。",
  luxury_promotion: "培育高端消费市场，显著提高本回合国内收购价格。",
  infrastructure_investment: "投资基础设施，增加后续手工业产能。",
  trade_hub: "建设临时商贸枢纽，本回合扩展海外市场承接能力。",
};

const ACTION_GROUPS = [
  {
    id: "capacity",
    title: "扩大承接",
    hint: "提高国内市场能吃下的商品数量。",
    actionIds: ["market_fair", "rural_development"],
  },
  {
    id: "value",
    title: "提价增收",
    hint: "抬高国内收购价格，适合有库存时兑现收入。",
    actionIds: ["consumer_subsidy", "import_substitution", "public_works", "luxury_promotion"],
  },
  {
    id: "supply",
    title: "供给建设",
    hint: "增加手工业产能，影响后续生产能力。",
    actionIds: ["expand_workshop", "infrastructure_investment"],
  },
  {
    id: "overseas",
    title: "海外商贸",
    hint: "把国内消费预算转向外部承接空间。",
    actionIds: ["trade_hub"],
  },
];

const EFFECT_KEYS = [
  "domesticMarketCapacityDelta",
  "domesticPriceBonusDelta",
  "handicraftCapacityDelta",
  "overseasMarketCapacityDelta",
] as const;

const EFFECT_LABELS: Record<(typeof EFFECT_KEYS)[number], string> = {
  domesticMarketCapacityDelta: "国内容量",
  domesticPriceBonusDelta: "国内价格",
  handicraftCapacityDelta: "手工业",
  overseasMarketCapacityDelta: "海外容量",
};

function stripGeneratedEffectSummary(description: string | undefined): string | undefined {
  if (!description) return description;
  return description.replace(/\s*效果：.*。$/, "");
}

function resolveActionDescription(
  action: DecisionPlayerPhaseWorkspace["domesticMarketActions"][number],
): string | undefined {
  const cleaned = stripGeneratedEffectSummary(action.description);
  if (action.actionId === "trade_hub" && cleaned?.includes("永久")) {
    return ACTION_DESCRIPTION_FALLBACKS.trade_hub;
  }
  return ACTION_DESCRIPTION_FALLBACKS[action.actionId] ?? cleaned;
}

function formatNumber(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100) / 100}`;
}

function sumEffect(
  actions: DecisionPlayerPhaseWorkspace["domesticMarketActions"],
  effectKey: (typeof EFFECT_KEYS)[number],
): number {
  return actions.reduce((sum, action) => {
    const value = action.effects?.[effectKey];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

export interface DomesticPanelProps {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingDomesticBudget: number;
  onActionToggle: (actionId: string, checked: boolean) => void;
  onResearchToggle?: (techId: string, checked: boolean) => void;
}

export function DomesticPanel({
  workspace,
  draft,
  remainingDomesticBudget,
  onActionToggle,
}: DomesticPanelProps) {
  const selectedActionIds = new Set(
    draft.domesticMarketPlan.domesticMarketActions.map((item) => item.actionId),
  );
  const selectedActions = workspace.domesticMarketActions.filter((action) =>
    selectedActionIds.has(action.actionId),
  );
  const selectedSpend = selectedActions.reduce((sum, action) => sum + action.cost, 0);
  const actionById = new Map(workspace.domesticMarketActions.map((action) => [action.actionId, action]));
  const groupedActionIds = new Set(ACTION_GROUPS.flatMap((group) => group.actionIds));
  const actionGroups = [
    ...ACTION_GROUPS.map((group) => ({
      ...group,
      actions: group.actionIds
        .map((actionId) => actionById.get(actionId))
        .filter((action): action is DecisionPlayerPhaseWorkspace["domesticMarketActions"][number] => Boolean(action)),
    })).filter((group) => group.actions.length > 0),
    {
      id: "other",
      title: "其他动作",
      hint: "未归类的国民消费动作。",
      actionIds: [],
      actions: workspace.domesticMarketActions.filter((action) => !groupedActionIds.has(action.actionId)),
    },
  ].filter((group) => group.actions.length > 0);
  const selectedEffectSummary = EFFECT_KEYS
    .map((key) => ({ key, value: sumEffect(selectedActions, key) }))
    .filter((item) => item.value !== 0);

  const phase1Economy = workspace.phase1Economy;
  const selectedCapacityDelta = sumEffect(selectedActions, "domesticMarketCapacityDelta");
  const selectedPriceDelta = sumEffect(selectedActions, "domesticPriceBonusDelta");
  const baseDomesticCapacity = workspace.domesticMarketCapacity
    ?? phase1Economy?.domesticDemand
    ?? undefined;
  const projectedDomesticCapacity = baseDomesticCapacity != null
    ? Math.max(0, baseDomesticCapacity + selectedCapacityDelta)
    : undefined;
  const domesticPriceCeiling = phase1Economy?.domesticPriceCeiling ?? 12;
  const existingPriceBeforeCap = phase1Economy?.domesticPriceBeforeCap
    ?? phase1Economy?.domesticPricePreview
    ?? undefined;
  const projectedDomesticPriceBeforeCap = existingPriceBeforeCap != null
    ? Math.max(1, existingPriceBeforeCap + selectedPriceDelta)
    : undefined;
  const projectedDomesticDemand = phase1Economy?.domesticDemand != null
    ? Math.max(0, phase1Economy.domesticDemand)
    : undefined;
  const projectedDomesticPrice = projectedDomesticPriceBeforeCap != null
    ? Math.max(
        1,
        Math.min(
          domesticPriceCeiling,
          projectedDomesticPriceBeforeCap,
        ),
      )
    : undefined;
  const isProjectedPriceCapped = projectedDomesticPriceBeforeCap != null
    && projectedDomesticPriceBeforeCap > domesticPriceCeiling;
  const domesticPriceHint = phase1Economy
    ? [
        `基础 ${formatNumber(phase1Economy.domesticBasePricePreview ?? phase1Economy.equilibriumPrice)}`,
        `既有加成 ${formatSignedValue(phase1Economy.domesticPriceBonus ?? 0)}`,
        selectedPriceDelta !== 0 ? `本轮动作 ${formatSignedValue(selectedPriceDelta)}` : null,
        `上限 ${domesticPriceCeiling}`,
        isProjectedPriceCapped ? "已按上限成交" : null,
      ].filter(Boolean).join("，")
    : null;

  return (
    <div className="domestic-panel" data-testid="domestic-panel">
      <div className="domestic-panel__header">
        <h3 className="domestic-panel__title">🏛️ 市民广场</h3>
        <span className="domestic-panel__budget">国内预算 {remainingDomesticBudget}</span>
      </div>

      <DecisionStatStrip
        items={[
          {
            icon: "💰",
            value: remainingDomesticBudget,
            label: "剩余预算",
          },
          {
            icon: "🧺",
            value: projectedDomesticDemand != null ? formatNumber(projectedDomesticDemand) : "—",
            label: "市场需求",
          },
          {
            icon: "📦",
            value: projectedDomesticCapacity != null ? formatNumber(projectedDomesticCapacity) : "—",
            label: "投放上限",
          },
          {
            icon: "🏷️",
            value: projectedDomesticPrice != null ? formatNumber(projectedDomesticPrice) : "—",
            label: isProjectedPriceCapped ? "参考售价已封顶" : "参考售价",
          },
        ]}
      />

      <div className="domestic-panel--v2">
        <div className="domestic-panel--v2__left">
          <div className="domestic-market-card">
            <h4 className="domestic-section-label">📈 国内经济</h4>
            <p className="domestic-section-note">
              这些动作主要影响本回合国内出售的承接量、价格，以及后续手工业供给。
            </p>
            <div className="domestic-panel--v2__metrics">
              <div className="gp-metric">
                <span className="gp-metric__label">均衡价格</span>
                <span className="gp-metric__value">
                  {phase1Economy?.equilibriumPrice != null ? `${formatNumber(phase1Economy.equilibriumPrice)} 财政/件` : "—"}
                </span>
                {phase1Economy ? (
                  <span className="gp-metric__hint">
                    {domesticPriceHint}；贸易港会按实际投放量重算成交价
                  </span>
                ) : null}
              </div>
              <div className="gp-metric">
                <span className="gp-metric__label">投放上限</span>
                <span className="gp-metric__value">
                  {projectedDomesticCapacity != null ? `${formatNumber(projectedDomesticCapacity)} 件` : "—"}
                </span>
                {selectedCapacityDelta !== 0 ? (
                  <span className="gp-metric__hint">
                    当前 {formatNumber(baseDomesticCapacity)}，本轮动作 {selectedCapacityDelta > 0 ? "+" : ""}{selectedCapacityDelta}
                  </span>
                ) : null}
              </div>
              <div className="gp-metric">
                <span className="gp-metric__label">本轮投入</span>
                <span className="gp-metric__value">
                  {selectedSpend > 0 ? `${selectedSpend} 国内预算` : "未选择"}
                </span>
                {selectedEffectSummary.length > 0 ? (
                  <span className="gp-metric__hint">
                    {selectedEffectSummary
                      .map((item) => `${EFFECT_LABELS[item.key]} ${item.value > 0 ? "+" : ""}${item.value}`)
                      .join("，")}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="domestic-panel--v2__right">
          <h4 className="domestic-section-label">🏪 民生政策</h4>
          <div className="domestic-action-groups">
            {actionGroups.map((group) => (
              <section key={group.id} className="domestic-action-group">
                <div className="domestic-action-group__head">
                  <span>{group.title}</span>
                  <small>{group.hint}</small>
                </div>
                <div className="domestic-actions">
                  {group.actions.map((action) => {
                    const selected = selectedActionIds.has(action.actionId);
                    const canAfford = remainingDomesticBudget >= action.cost;
                    const lockedReason = action.lockedReason
                      ?? (!selected && !canAfford ? "国内预算不足" : null);
                    const effectMetrics = buildEffectMetrics(action.effects);
                    const status = selected
                      ? "selected"
                      : lockedReason
                        ? "disabled"
                        : "available";

                    return (
                      <DecisionActionCard
                        key={action.actionId}
                        icon={ACTION_ICONS[action.actionId] ?? "⚙️"}
                        title={action.label}
                        costLabel={`${action.cost} 国内预算`}
                        description={resolveActionDescription(action)}
                        effects={effectMetrics}
                        status={status}
                        statusText={selected ? "✓ 已部署" : lockedReason ?? "可部署"}
                        control={{
                          kind: "toggle",
                          checked: selected,
                          onChange: (next) => onActionToggle(action.actionId, next),
                          label: selected ? "取消" : "选择",
                          ariaLabel: `${selected ? "取消" : "选择"} ${action.label}`,
                          disabled: !selected && lockedReason !== null,
                        }}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
