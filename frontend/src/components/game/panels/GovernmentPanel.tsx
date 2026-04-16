import type { DecisionPlayerPhaseWorkspace, IdeologyKey } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import {
  buildEffectMetrics,
  buildTechResearchDescription,
  calculateDecisionSpendSummary,
  calculateGovernmentPointPreview,
  calculateRatioPreview,
  calculateTechResearchPreview,
  formatRatio,
  formatRatioDeltaSummary,
  getTechResearchLockedReason,
} from "../../../features/game/decisionShared";
import "./GovernmentPanel.css";

const STRATEGY_ICONS: Record<string, string> = {
  trade_agreement: "🤝",
  expand_shipping_lines: "🚢",
  domestic_stimulus: "📢",
  industrial_policy: "🏭",
  global_trade_dominance: "🌐",
  naval_modernization: "⚓",
};

const IDEOLOGY_OPTIONS: Array<{ key: IdeologyKey; label: string }> = [
  { key: "liberalism", label: "自由主义" },
  { key: "egalitarianism", label: "平等主义" },
  { key: "nationalism", label: "民族主义" },
];

export interface GovernmentPanelProps {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingGovernmentBudget: number;
  onAbilityTargetChange: (targetIdeology: IdeologyKey) => void;
  onResearchToggle: (techId: string, checked: boolean) => void;
  onStrategyToggle: (actionId: string, checked: boolean) => void;
  onTechPurchase: () => void;
  onTechRefund: () => void;
  onToggleAbility: (checked: boolean) => void;
}

export function GovernmentPanel({
  workspace,
  draft,
  remainingGovernmentBudget,
  onAbilityTargetChange,
  onResearchToggle,
  onStrategyToggle,
  onTechPurchase,
  onTechRefund,
  onToggleAbility,
}: GovernmentPanelProps) {
  const ratioPreview = calculateRatioPreview(workspace, draft);
  const pointPreview = calculateGovernmentPointPreview(workspace, draft);
  const techResearchPreview = calculateTechResearchPreview(workspace, draft);
  const selectedStrategyIds = new Set(
    draft.governmentPlan.strategySelections.map((item) => item.actionId),
  );
  const selectedAbility =
    workspace.nationalAbility && draft.abilitySelection?.abilityId === workspace.nationalAbility.abilityId
      ? draft.abilitySelection
      : null;

  const techPurchaseCount = draft.governmentPlan.pointPurchases
    .filter((item) => item.pointType === "tech")
    .reduce((sum, item) => sum + item.quantity, 0);
  const techCost = workspace.governmentActions.pointPurchaseCosts.tech;
  const canBuyTech = remainingGovernmentBudget >= techCost;

  const queuedResearchIds = new Set(
    draft.governmentPlan.techResearch
      .filter((item) => workspace.techTree.find((tech) => tech.techId === item.techId)?.budgetPool === "governmentFiscal")
      .map((item) => item.techId),
  );
  const governmentTechs = workspace.techTree.filter((tech) => tech.budgetPool === "governmentFiscal");

  const abilityStatusLabel = !workspace.nationalAbility
    ? "无"
    : !workspace.nationalAbility.isAvailable
      ? "已使用"
      : selectedAbility
        ? "已启用"
        : "待命";

  return (
    <section className="government-panel" data-testid="government-panel">
      <div className="government-panel__header">
        <h3 className="government-panel__title">🏛️ 议会厅</h3>
        <span className="government-panel__budget">政府财政 {remainingGovernmentBudget}</span>
      </div>

      <div className="government-stats">
        <div className="government-stat">
          <span className="government-stat__icon">💰</span>
          <span className="government-stat__value">{remainingGovernmentBudget}</span>
          <span className="government-stat__label">财政剩余</span>
        </div>
        <div className="government-stat">
          <span className="government-stat__icon">📊</span>
          <span className="government-stat__value">{formatRatio(ratioPreview)}</span>
          <span className="government-stat__label">比例预告</span>
        </div>
        <div className="government-stat">
          <span className="government-stat__icon">🔬</span>
          <span className="government-stat__value">{pointPreview.techPoints}</span>
          <span className="government-stat__label">科技点</span>
        </div>
        <div className="government-stat">
          <span className="government-stat__icon">👑</span>
          <span className="government-stat__value">{abilityStatusLabel}</span>
          <span className="government-stat__label">国家能力</span>
        </div>
      </div>

      {/* ── 财政拨款 ── */}
      <h4 className="government-section-label">💎 财政拨款</h4>
      <div className="government-actions">
        <div
          className={`government-action-card ${techPurchaseCount > 0 ? "government-action-card--selected" : ""} ${!canBuyTech && techPurchaseCount === 0 ? "government-action-card--disabled" : ""}`}
        >
          <div className="government-action-card__head">
            <span className="government-action-card__icon">💎</span>
            <span className="government-action-card__name">科技点拨款</span>
            <span className="government-action-card__cost">{techCost}/点</span>
          </div>
          <p className="government-action-card__desc">
            把政府财政转成科技点，为研究院的永久天赋解锁预备资源。
          </p>
          <div className="government-action-card__effects">
            <span className="government-action-card__effect-tag">
              已购 {techPurchaseCount} 点
            </span>
            <span className="government-action-card__effect-tag">
              预计科技点 {pointPreview.techPoints}
            </span>
          </div>
          <div className="government-action-card__footer">
            <span className="government-action-card__status">
              {techPurchaseCount > 0 ? `✓ 本轮 -${techPurchaseCount * techCost} 财政` : !canBuyTech ? "预算不足" : "可购买"}
            </span>
            <div className="government-action-card__stepper">
              {techPurchaseCount > 0 && (
                <button
                  aria-label="退回科技点"
                  className="government-action-card__btn"
                  type="button"
                  onClick={onTechRefund}
                >
                  −
                </button>
              )}
              <button
                aria-label="购买科技点"
                className={`government-action-card__btn ${techPurchaseCount > 0 ? "government-action-card__btn--active" : ""}`}
                type="button"
                disabled={!canBuyTech}
                onClick={onTechPurchase}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 执政议程 ── */}
      <h4 className="government-section-label">📜 执政议程</h4>
      <div className="government-actions">
        {workspace.governmentActions.strategies.map((action) => {
          const selected = selectedStrategyIds.has(action.actionId);
          const canAfford = remainingGovernmentBudget >= action.cost;
          const lockedReason = action.lockedReason
            ?? (!selected && !canAfford ? "政府预算不足" : null);
          const effectMetrics = buildEffectMetrics(action.effects)
            .filter((metric) => !["科技点", "军事点"].includes(metric.label));
          const ratioDeltaText = Object.keys(action.ratioDelta ?? {}).length > 0
            ? formatRatioDeltaSummary(action.ratioDelta ?? {})
            : null;

          return (
            <div
              key={action.actionId}
              className={`government-action-card ${selected ? "government-action-card--selected" : ""} ${!selected && lockedReason ? "government-action-card--disabled" : ""}`}
            >
              <div className="government-action-card__head">
                <span className="government-action-card__icon">{STRATEGY_ICONS[action.actionId] ?? "⚙️"}</span>
                <span className="government-action-card__name">{action.label}</span>
                <span className="government-action-card__cost">{action.cost}</span>
              </div>
              {action.description ? (
                <p className="government-action-card__desc">{action.description}</p>
              ) : null}
              <div className="government-action-card__effects">
                {(action.techPointDelta ?? 0) !== 0 && (
                  <span className="government-action-card__effect-tag">
                    科技点 {(action.techPointDelta ?? 0) > 0 ? "+" : ""}{action.techPointDelta}
                  </span>
                )}
                {(action.militaryPointDelta ?? 0) !== 0 && (
                  <span className="government-action-card__effect-tag">
                    军事点 {(action.militaryPointDelta ?? 0) > 0 ? "+" : ""}{action.militaryPointDelta}
                  </span>
                )}
                {ratioDeltaText ? (
                  <span className="government-action-card__effect-tag">{ratioDeltaText}</span>
                ) : null}
                {effectMetrics.map((em) => (
                  <span key={em.label} className="government-action-card__effect-tag">
                    {em.label} {em.value}{em.temporary ? " 本回合" : ""}
                  </span>
                ))}
              </div>
              <div className="government-action-card__footer">
                <span className="government-action-card__status">
                  {selected ? "✓ 已纳入" : lockedReason ?? "可纳入"}
                </span>
                <button
                  aria-label={action.label}
                  className={`government-action-card__btn ${selected ? "government-action-card__btn--active" : ""}`}
                  type="button"
                  disabled={!selected && lockedReason !== null}
                  onClick={() => onStrategyToggle(action.actionId, !selected)}
                >
                  {selected ? "取消" : "纳入"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 国家权柄 ── */}
      {workspace.nationalAbility && (
        <>
          <h4 className="government-section-label">👑 国家权柄</h4>
          <div className="government-actions">
            <div
              className={`government-action-card ${selectedAbility ? "government-action-card--selected" : ""} ${!workspace.nationalAbility.isAvailable ? "government-action-card--disabled" : ""}`}
            >
              <div className="government-action-card__head">
                <span className="government-action-card__icon">👑</span>
                <span className="government-action-card__name">{workspace.nationalAbility.label}</span>
              </div>
              <p className="government-action-card__desc">{workspace.nationalAbility.description}</p>
              <div className="government-action-card__effects">
                <span className="government-action-card__effect-tag">
                  {workspace.nationalAbility.requiresTargetIdeology ? "需指定意识形态目标" : "即时生效"}
                </span>
                <span className="government-action-card__effect-tag">
                  比例预告 {formatRatio(ratioPreview)}
                </span>
              </div>

              {selectedAbility && workspace.nationalAbility.requiresTargetIdeology && (
                <fieldset className="government-action-card__targets">
                  <legend>意识形态目标</legend>
                  <div className="government-action-card__target-grid">
                    {IDEOLOGY_OPTIONS.map((option) => (
                      <label key={option.key} className="government-action-card__target-pill">
                        <input
                          aria-label={`${workspace.nationalAbility!.label} ${option.label}`}
                          checked={selectedAbility.targetIdeology === option.key}
                          name="government-ability-target"
                          type="radio"
                          onChange={() => onAbilityTargetChange(option.key)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <div className="government-action-card__footer">
                <span className="government-action-card__status">
                  {!workspace.nationalAbility.isAvailable
                    ? "本局已使用"
                    : selectedAbility
                      ? "✓ 已启用"
                      : "待命"}
                </span>
                {workspace.nationalAbility.isAvailable ? (
                  <button
                    aria-label={`启用国家能力：${workspace.nationalAbility.label}`}
                    className={`government-action-card__btn ${selectedAbility ? "government-action-card__btn--active" : ""}`}
                    type="button"
                    onClick={() => onToggleAbility(!selectedAbility)}
                  >
                    {selectedAbility ? "取消" : "启用"}
                  </button>
                ) : (
                  <span className="government-action-card__btn government-action-card__btn--done">已使用</span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 政策研究 ── */}
      {governmentTechs.length > 0 && (
        <>
          <h4 className="government-section-label">🔬 政策研究</h4>
          <div className="government-actions">
            {governmentTechs.map((tech) => {
              const queued = queuedResearchIds.has(tech.techId);
              const lockedReason = getTechResearchLockedReason(tech, techResearchPreview, workspace);
              const description = buildTechResearchDescription(tech, lockedReason, workspace, queued);

              return (
                <div
                  key={tech.techId}
                  className={`government-action-card ${tech.isUnlocked ? "government-action-card--disabled" : queued ? "government-action-card--selected" : lockedReason ? "government-action-card--disabled" : ""}`}
                >
                  <div className="government-action-card__head">
                    <span className="government-action-card__icon">🔬</span>
                    <span className="government-action-card__name">{tech.label}</span>
                    <span className="government-action-card__cost">{tech.budgetCost}</span>
                  </div>
                  <p className="government-action-card__desc">{description}</p>
                  <div className="government-action-card__footer">
                    <span className="government-action-card__status">
                      {tech.isUnlocked ? "✅ 已研究" : queued ? "✓ 已选择" : lockedReason ?? "可研究"}
                    </span>
                    {tech.isUnlocked ? (
                      <span className="government-action-card__btn government-action-card__btn--done">已研究</span>
                    ) : (
                      <button
                        aria-label={tech.label}
                        className={`government-action-card__btn ${queued ? "government-action-card__btn--active" : ""}`}
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
    </section>
  );
}
