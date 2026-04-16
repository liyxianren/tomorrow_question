import type { DecisionPlayerPhaseWorkspace, TechTreeNode } from "../../../../types";
import type { PhaseDraftByPhase } from "../../../../features/game/forms";
import {
  buildTechResearchDescription,
  buildTechUnlockSummary,
  getTechResearchLockedReason,
  type TechResearchPreview,
} from "../../../../features/game/decisionShared";

export function FactoryTechPanel({
  techs,
  techPreview,
  workspace,
  draft,
  onToggle,
}: {
  techs: TechTreeNode[];
  techPreview: TechResearchPreview;
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  onToggle: (techId: string, checked: boolean) => void;
}) {
  return (
    <section data-testid="factory-tech-panel">
      <h3 className="factory-section-label">工业研究</h3>
      {techs.length > 0 ? (
        <div className="factory-actions">
          {techs.map((tech) => {
            const queued = draft.governmentPlan.techResearch.some((item) => item.techId === tech.techId);
            const selected = tech.isUnlocked || queued;
            const lockedReason = getTechResearchLockedReason(tech, techPreview, workspace);
            const description = buildTechResearchDescription(tech, lockedReason, workspace, queued);
            const unlockSummary = buildTechUnlockSummary(tech, workspace);

            return (
              <div
                key={tech.techId}
                className={`factory-action-card ${tech.isUnlocked ? "factory-action-card--disabled" : selected ? "factory-action-card--selected" : lockedReason ? "factory-action-card--disabled" : ""}`}
              >
                <div className="factory-action-card__head">
                  <span className="factory-action-card__icon">🔬</span>
                  <span className="factory-action-card__name">{tech.label}</span>
                  <span className="factory-action-card__cost">{tech.budgetCost}</span>
                </div>
                <p className="factory-action-card__desc">{description}</p>
                {unlockSummary ? (
                  <div className="factory-action-card__effects">
                    <span className="factory-action-card__effect-tag">{unlockSummary}</span>
                  </div>
                ) : null}
                <div className="factory-action-card__footer">
                  <span className="factory-action-card__status">
                    {tech.isUnlocked ? "✅ 已研究" : queued ? "✓ 已选择" : lockedReason ?? "可研究"}
                  </span>
                  {tech.isUnlocked ? (
                    <span className="factory-action-card__btn factory-action-card__btn--done">已研究</span>
                  ) : (
                    <button
                      aria-label={`${queued ? "取消研究" : "研究"} ${tech.label}`}
                      className={`factory-action-card__btn ${queued ? "factory-action-card__btn--active" : ""}`}
                      type="button"
                      disabled={!queued && lockedReason !== null}
                      onClick={() => onToggle(tech.techId, !queued)}
                    >
                      {queued ? "取消研究" : "研究"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="factory-panel__empty">当前没有可推进的工业研究。</p>
      )}
    </section>
  );
}
