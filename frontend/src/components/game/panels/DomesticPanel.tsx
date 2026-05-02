import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import {
  buildEffectMetrics,
} from "../../../features/game/decisionShared";
import { DecisionStatStrip } from "./shared/DecisionStatStrip";
import "./DomesticPanel.css";

const ACTION_ICONS: Record<string, string> = {
  market_fair: "🎪",
  consumer_subsidy: "💰",
  public_works: "🏗️",
  education_reform: "📚",
  healthcare: "🏥",
  urban_development: "🏘️",
  trade_promotion: "📈",
};

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

  const phase1Economy = workspace.phase1Economy;
  const domesticStatsLegacy = (workspace as DecisionPlayerPhaseWorkspace & {
    domesticStats?: { demand?: string | number; supply?: string | number };
  }).domesticStats;

  return (
    <div className="domestic-panel" data-testid="domestic-panel">
      <div className="domestic-panel__header">
        <h3 className="domestic-panel__title">🏛️ 市民广场</h3>
        <span className="domestic-panel__budget">国内预算 {remainingDomesticBudget}</span>
      </div>

      <DecisionStatStrip
        items={[
          {
            icon: "📊",
            value: domesticStatsLegacy?.demand ?? "—",
            label: "国内需求",
          },
          {
            icon: "📦",
            value: domesticStatsLegacy?.supply ?? "—",
            label: "国内供给",
          },
          {
            icon: "✅",
            value: draft.domesticMarketPlan.domesticMarketActions.length,
            label: "已选动作",
          },
        ]}
      />

      <div className="domestic-panel--v2">
        <div className="domestic-panel--v2__left">
          <div className="gp-card">
            <h4 className="domestic-section-label">📈 国内经济</h4>
            <div className="domestic-panel--v2__metrics">
              <div className="gp-metric">
                <span className="gp-metric__label">均衡价格</span>
                <span className="gp-metric__value">
                  {phase1Economy ? phase1Economy.equilibriumPrice : "—"}
                </span>
                {phase1Economy ? (
                  <span className="gp-metric__hint">
                    本轮预测 {phase1Economy.domesticPricePreview}
                  </span>
                ) : null}
              </div>
              <div className="gp-metric">
                <span className="gp-metric__label">国内需求</span>
                <span className="gp-metric__value">
                  {phase1Economy ? phase1Economy.domesticDemand : "—"}
                </span>
              </div>
              <div className="gp-metric">
                <span className="gp-metric__label">消费池</span>
                <span className="gp-metric__value">
                  {phase1Economy?.consumptionPool ?? "—"}
                </span>
                {phase1Economy?.poolDeltaPreview ? (
                  <span className="gp-metric__hint">
                    本轮 Δ {phase1Economy.poolDeltaPreview.consumption > 0 ? "+" : ""}
                    {phase1Economy.poolDeltaPreview.consumption}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="domestic-panel--v2__right">
          <h4 className="domestic-section-label">🏪 民生政策</h4>
          <div className="domestic-actions">
            {workspace.domesticMarketActions.map((action) => {
              const selected = selectedActionIds.has(action.actionId);
              const canAfford = remainingDomesticBudget >= action.cost;
              const lockedReason = action.lockedReason
                ?? (!selected && !canAfford ? "国内预算不足" : null);
              const effectMetrics = buildEffectMetrics(action.effects);

              return (
                <div
                  key={action.actionId}
                  className={`domestic-action-card ${selected ? "domestic-action-card--selected" : ""} ${!selected && lockedReason ? "domestic-action-card--disabled" : ""}`}
                >
                  <div className="domestic-action-card__head">
                    <span className="domestic-action-card__icon">{ACTION_ICONS[action.actionId] ?? "⚙️"}</span>
                    <span className="domestic-action-card__name">{action.label}</span>
                    <span className="domestic-action-card__cost">{action.cost}</span>
                  </div>
                  {action.description ? (
                    <p className="domestic-action-card__desc">{action.description}</p>
                  ) : null}
                  {effectMetrics.length > 0 ? (
                    <div className="domestic-action-card__effects">
                      {effectMetrics.map((em) => (
                        <span key={em.label} className="domestic-action-card__effect-tag">
                          {em.label} {em.value}{em.temporary ? " 本回合" : ""}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="domestic-action-card__footer">
                    <span className="domestic-action-card__status">
                      {selected ? "✓ 已部署" : lockedReason ?? "可部署"}
                    </span>
                    <button
                      aria-label={`${selected ? "取消" : "选择"} ${action.label}`}
                      className={`domestic-action-card__btn ${selected ? "domestic-action-card__btn--active" : ""}`}
                      type="button"
                      disabled={!selected && lockedReason !== null}
                      onClick={() => onActionToggle(action.actionId, !selected)}
                    >
                      {selected ? "取消" : "选择"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
