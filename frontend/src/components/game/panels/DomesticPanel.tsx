import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import { formatSignedValue } from "../../../features/game/decisionShared";
import { DecisionStatStrip } from "./shared/DecisionStatStrip";
import "./DomesticPanel.css";

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

function formatNumber(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100) / 100}`;
}

function sumEffect(
  actions: DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"],
  effectKey: (typeof EFFECT_KEYS)[number],
): number {
  return actions.reduce((sum, action) => {
    const value = action.effects?.[effectKey];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

function hasMarketPreviewEffect(action: DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"][number]): boolean {
  return EFFECT_KEYS.some((key) => typeof action.effects?.[key] === "number");
}

export interface DomesticPanelProps {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingDomesticBudget: number;
}

export function DomesticPanel({
  workspace,
  draft,
  remainingDomesticBudget,
}: DomesticPanelProps) {
  const queuedStrategyIds = new Set(
    draft.governmentPlan.strategySelections.map((item) => item.actionId),
  );
  const selectedMarketStrategies = workspace.governmentActions.strategies.filter((action) =>
    queuedStrategyIds.has(action.actionId) && hasMarketPreviewEffect(action),
  );
  const selectedCapacityDelta = sumEffect(selectedMarketStrategies, "domesticMarketCapacityDelta");
  const selectedPriceDelta = sumEffect(selectedMarketStrategies, "domesticPriceBonusDelta");
  const selectedEffectSummary = EFFECT_KEYS
    .map((key) => ({ key, value: sumEffect(selectedMarketStrategies, key) }))
    .filter((item) => item.value !== 0);

  const phase1Economy = workspace.phase1Economy;
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
    ? Math.max(1, Math.min(domesticPriceCeiling, projectedDomesticPriceBeforeCap))
    : undefined;
  const isProjectedPriceCapped = projectedDomesticPriceBeforeCap != null
    && projectedDomesticPriceBeforeCap > domesticPriceCeiling;
  const domesticPriceHint = phase1Economy
    ? [
        `基础 ${formatNumber(phase1Economy.domesticBasePricePreview ?? phase1Economy.equilibriumPrice)}`,
        `既有加成 ${formatSignedValue(phase1Economy.domesticPriceBonus ?? 0)}`,
        selectedPriceDelta !== 0 ? `政府调节 ${formatSignedValue(selectedPriceDelta)}` : null,
        `上限 ${domesticPriceCeiling}`,
        isProjectedPriceCapped ? "已按上限成交" : null,
      ].filter(Boolean).join("，")
    : null;

  return (
    <div className="domestic-panel" data-testid="domestic-panel">
      <div className="domestic-panel__header">
        <h3 className="domestic-panel__title">🏛️ 市民广场</h3>
        <span className="domestic-panel__budget">市场预览</span>
      </div>

      <DecisionStatStrip
        items={[
          {
            icon: "💰",
            value: remainingDomesticBudget,
            label: "民间购买力",
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
            <h4 className="domestic-section-label">📈 国内经济预览</h4>
            <p className="domestic-section-note">
              议会大厅已经同步显示这些市场数值；市民广场只保留出售阶段前的只读核对。
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
                    当前 {formatNumber(baseDomesticCapacity)}，政府调节 {selectedCapacityDelta > 0 ? "+" : ""}{selectedCapacityDelta}
                  </span>
                ) : null}
              </div>
              <div className="gp-metric">
                <span className="gp-metric__label">政府调节</span>
                <span className="gp-metric__value">
                  {selectedMarketStrategies.length > 0 ? `${selectedMarketStrategies.length} 项` : "未选择"}
                </span>
                {selectedEffectSummary.length > 0 ? (
                  <span className="gp-metric__hint">
                    {selectedEffectSummary
                      .map((item) => `${EFFECT_LABELS[item.key]} ${item.value > 0 ? "+" : ""}${item.value}`)
                      .join("，")}
                  </span>
                ) : (
                  <span className="gp-metric__hint">
                    可在议会大厅的“市场调节”中改变本轮承接量、售价或海外容量。
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="domestic-panel--v2__right">
          <h4 className="domestic-section-label">🏛️ 本轮政府调节</h4>
          <div className="domestic-selected-effects">
            {selectedMarketStrategies.length > 0 ? (
              selectedMarketStrategies.map((action) => (
                <div key={action.actionId} className="domestic-selected-effects__row">
                  <strong>{action.label}</strong>
                  <span>
                    {EFFECT_KEYS
                      .map((key) => {
                        const value = action.effects?.[key];
                        return typeof value === "number" && value !== 0
                          ? `${EFFECT_LABELS[key]} ${value > 0 ? "+" : ""}${value}`
                          : null;
                      })
                      .filter(Boolean)
                      .join("，")}
                  </span>
                </div>
              ))
            ) : (
              <p className="domestic-panel__empty">
                暂无市场调节。当前出售阶段将只使用基础供需、已有事件和既有效果计算价格。
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
