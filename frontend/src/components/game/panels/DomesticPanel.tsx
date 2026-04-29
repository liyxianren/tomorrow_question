import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import {
  buildEffectMetrics,
  buildTechResearchDescription,
  calculateDecisionSpendSummary,
  calculateTechResearchPreview,
  getTechResearchLockedReason,
  flattenTechTree,
} from "../../../features/game/decisionShared";
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
  onResearchToggle: (techId: string, checked: boolean) => void;
}

export function DomesticPanel({
  workspace,
  draft,
  remainingDomesticBudget,
  onActionToggle,
  onResearchToggle,
}: DomesticPanelProps) {
  const selectedActionIds = new Set(
    draft.domesticMarketPlan.domesticMarketActions.map((item) => item.actionId),
  );
  const spendSummary = calculateDecisionSpendSummary(workspace, draft);
  const techResearchPreview = calculateTechResearchPreview(workspace, draft);
  const queuedResearchIds = new Set(
    draft.governmentPlan.techResearch
      .filter((item) => { const t = flattenTechTree(workspace.techTree).find((tech) => tech.techId === item.techId); return t && "budgetPool" in t && t.budgetPool === "domesticMarket"; })
      .map((item) => item.techId),
  );
  const domesticTechs = flattenTechTree(workspace.techTree).filter((tech) => "budgetPool" in tech && tech.budgetPool === "domesticMarket");

  return (
    <div className="domestic-panel" data-testid="domestic-panel">
      <div className="domestic-panel__header">
        <h3 className="domestic-panel__title">🏛️ 市民广场</h3>
        <span className="domestic-panel__budget">国内预算 {remainingDomesticBudget}</span>
      </div>

      <div className="domestic-stats">
        <div className="domestic-stat">
          <span className="domestic-stat__icon">💰</span>
          <span className="domestic-stat__value">{remainingDomesticBudget}</span>
          <span className="domestic-stat__label">预算剩余</span>
        </div>
        <div className="domestic-stat">
          <span className="domestic-stat__icon">📋</span>
          <span className="domestic-stat__value">{selectedActionIds.size}</span>
          <span className="domestic-stat__label">已选动作</span>
        </div>
        <div className="domestic-stat">
          <span className="domestic-stat__icon">🔬</span>
          <span className="domestic-stat__value">{queuedResearchIds.size}</span>
          <span className="domestic-stat__label">已排研究</span>
        </div>
        <div className="domestic-stat">
          <span className="domestic-stat__icon">📊</span>
          <span className="domestic-stat__value">{spendSummary.domesticSpend}</span>
          <span className="domestic-stat__label">本轮消耗</span>
        </div>
      </div>

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

      {domesticTechs.length > 0 && (
        <>
          <h4 className="domestic-section-label">🔬 消费研究</h4>
          <div className="domestic-actions">
            {domesticTechs.map((tech) => {
              const queued = queuedResearchIds.has(tech.techId);
              const lockedReason = getTechResearchLockedReason(tech, techResearchPreview, workspace);
              const description = buildTechResearchDescription(tech, lockedReason, workspace, queued);

              return (
                <div
                  key={tech.techId}
                  className={`domestic-action-card ${tech.isUnlocked ? "domestic-action-card--disabled" : queued ? "domestic-action-card--selected" : lockedReason ? "domestic-action-card--disabled" : ""}`}
                >
                  <div className="domestic-action-card__head">
                    <span className="domestic-action-card__icon">🔬</span>
                    <span className="domestic-action-card__name">{tech.label}</span>
                    <span className="domestic-action-card__cost">{tech.budgetCost}</span>
                  </div>
                  <p className="domestic-action-card__desc">{description}</p>
                  <div className="domestic-action-card__footer">
                    <span className="domestic-action-card__status">
                      {tech.isUnlocked ? "✅ 已研究" : queued ? "✓ 已选择" : lockedReason ?? "可研究"}
                    </span>
                    {tech.isUnlocked ? (
                      <span className="domestic-action-card__btn domestic-action-card__btn--done">已研究</span>
                    ) : (
                      <button
                        aria-label={`${queued ? "取消" : "研究"} ${tech.label}`}
                        className={`domestic-action-card__btn ${queued ? "domestic-action-card__btn--active" : ""}`}
                        type="button"
                        disabled={!queued && lockedReason !== null}
                        onClick={() => onResearchToggle(tech.techId, !queued)}
                      >
                        {queued ? "取消" : "研究"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
