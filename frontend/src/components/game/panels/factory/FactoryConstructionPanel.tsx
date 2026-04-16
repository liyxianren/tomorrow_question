import type { DecisionPlayerPhaseWorkspace, FactoryExpansionOption, FactoryNewFactoryOption, FactoryUpgradeOption } from "../../../../types";
import type { PhaseDraftByPhase } from "../../../../features/game/forms";
import { getConstructionQuantity, getConstructionTitle, getConstructionKindLabel, resolveRouteLockedReason } from "./FactoryPanel";

function formatSignedValue(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

export function FactoryConstructionPanel({
  expansionOptions,
  upgradeOptions,
  newFactoryOptions,
  draft,
  remainingBudget,
  unlockedTechIds,
  workspace,
  onQuantityChange,
}: {
  expansionOptions: FactoryExpansionOption[];
  upgradeOptions: FactoryUpgradeOption[];
  newFactoryOptions: FactoryNewFactoryOption[];
  draft: PhaseDraftByPhase["decision"];
  remainingBudget: number;
  unlockedTechIds: Set<string>;
  workspace: DecisionPlayerPhaseWorkspace;
  onQuantityChange: (routeId: string, kind: "expansion" | "upgrade" | "newFactory", quantity: number) => void;
}) {
  type ConstructionEntry = {
    option: FactoryExpansionOption | FactoryUpgradeOption | FactoryNewFactoryOption;
    kind: "expansion" | "upgrade" | "newFactory";
  };

  const entries: ConstructionEntry[] = [
    ...expansionOptions.map((option) => ({ option, kind: "expansion" as const })),
    ...upgradeOptions.map((option) => ({ option, kind: "upgrade" as const })),
    ...newFactoryOptions.map((option) => ({ option, kind: "newFactory" as const })),
  ];

  return (
    <section data-testid="factory-construction-panel">
      <h3 className="factory-section-label">建设改造</h3>
      <div className="factory-actions">
        {entries.map(({ option, kind }) => {
          const quantity = getConstructionQuantity(draft, option.routeId, kind);
          const lockedReason = resolveRouteLockedReason(option.routeId, option.lockedReason, workspace, unlockedTechIds);
          const canIncrease = lockedReason === null
            && quantity < option.maxQuantity
            && remainingBudget >= option.unitBudgetCost;
          const title = getConstructionTitle(option, kind);
          const kindLabel = getConstructionKindLabel(kind);

          return (
            <div
              key={`${kind}-${option.routeId}`}
              className={`factory-action-card ${quantity > 0 ? "factory-action-card--selected" : ""} ${lockedReason && quantity === 0 ? "factory-action-card--disabled" : ""}`}
            >
              <div className="factory-action-card__head">
                <span className="factory-action-card__icon">🏗️</span>
                <span className="factory-action-card__name">{title}</span>
                <span className="factory-action-card__cost">{option.unitBudgetCost}</span>
              </div>
              <p className="factory-action-card__desc">
                {kind === "upgrade"
                  ? `将 ${(option as FactoryUpgradeOption).sourceRouteLabel} 产能转化为 ${option.routeLabel} 产能。`
                  : `${kindLabel} ${option.routeLabel}，下回合产能 ${formatSignedValue(option.capacityDelta)}。`}
              </p>
              <div className="factory-action-card__effects">
                <span className="factory-action-card__effect-tag">消耗 {option.unitBudgetCost}</span>
                {kind === "upgrade" ? (
                  <>
                    <span className="factory-action-card__effect-tag">{(option as FactoryUpgradeOption).sourceRouteLabel}产能 -1</span>
                    <span className="factory-action-card__effect-tag">{option.routeLabel}产能 +1</span>
                  </>
                ) : (
                  <span className="factory-action-card__effect-tag">{option.routeLabel}产能 {formatSignedValue(option.capacityDelta)}</span>
                )}
              </div>
              {lockedReason ? (
                <p className="factory-action-card__desc" style={{ color: "var(--game-text-warn, #ffcfbd)" }}>
                  🔒 {lockedReason}
                </p>
              ) : null}
              <div className="factory-action-card__footer">
                <span className="factory-action-card__count">{quantity}/{option.maxQuantity}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    aria-label={`减少建设 ${title}`}
                    className="factory-action-card__btn"
                    disabled={quantity <= 0}
                    type="button"
                    onClick={() => onQuantityChange(option.routeId, kind, quantity - 1)}
                  >
                    −
                  </button>
                  <button
                    aria-label={`增加建设 ${title}`}
                    className={`factory-action-card__btn ${quantity > 0 ? "factory-action-card__btn--active" : ""}`}
                    disabled={!canIncrease}
                    type="button"
                    onClick={() => onQuantityChange(option.routeId, kind, quantity + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
