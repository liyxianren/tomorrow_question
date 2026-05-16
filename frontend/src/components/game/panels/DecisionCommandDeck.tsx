import { useTranslation } from "react-i18next";
import i18n from "../../../i18n";
import type { IdeologyKey } from "../../../types";
import type {
  DecisionCardViewModel,
  DecisionCommandDeckViewModel,
  DecisionLocationId,
} from "../../../features/game/commandDeck/types";
import "./DecisionCommandDeck.css";

function getIdeologyOptionLabel(key: IdeologyKey): string {
  return i18n.t(`game:ideology.${key}`, key);
}

export function DecisionCommandDeck({
  viewModel,
  selectedAbilityTarget,
  onAbilityTargetChange,
  onConfirm,
  onQuantityChange,
  onRevoke,
  onTabSelect,
  onToggleChange,
}: {
  viewModel: DecisionCommandDeckViewModel;
  selectedAbilityTarget?: IdeologyKey;
  onTabSelect: (locationId: DecisionLocationId) => void;
  onQuantityChange: (card: DecisionCardViewModel, quantity: number) => void;
  onToggleChange: (card: DecisionCardViewModel, checked: boolean) => void;
  onConfirm: (card: DecisionCardViewModel) => void;
  onRevoke: (card: DecisionCardViewModel) => void;
  onAbilityTargetChange: (abilityId: string, ideology: IdeologyKey) => void;
}) {
  const { t } = useTranslation();
  const activeLocation = viewModel.locations[viewModel.activeLocationId];

  return (
    <section className="decision-command-deck" data-testid="decision-command-deck">
      <nav className="decision-command-deck__nav" aria-label={t("game:decisionStep.tabsAriaLabel")}>
        {viewModel.tabs.map((tab) => (
          <button
            key={tab.id}
            aria-label={tab.label}
            className={`decision-command-deck__tab${tab.id === viewModel.activeLocationId ? " decision-command-deck__tab--active" : ""}`}
            data-testid={`decision-command-deck-tab-${tab.id}`}
            type="button"
            onClick={() => onTabSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="decision-command-deck__hero">
        <div>
          <p className="decision-command-deck__eyebrow">{activeLocation.eyebrow}</p>
          <h3>{activeLocation.label}</h3>
          <p>{activeLocation.subtitle}</p>
          <p>{activeLocation.description}</p>
        </div>
        <div className="decision-command-deck__budget">
          <span>{activeLocation.budgetLabel}</span>
          <strong>{activeLocation.remainingBudget}</strong>
        </div>
      </section>

      <div className="decision-command-deck__pill-row">
        {activeLocation.summaryPills.map((pill) => (
          <span key={`${activeLocation.id}-${pill}`} className="decision-command-deck__pill">
            {pill}
          </span>
        ))}
      </div>

      <div className="decision-command-deck__section-stack">
        {activeLocation.sections.map((section) => (
          <section key={section.id} className="decision-command-deck__section">
            <div className="decision-command-deck__section-header">
              <div>
                <h4>{section.title}</h4>
                {section.description ? <p>{section.description}</p> : null}
              </div>
              <span>{section.cards.length} {t("game:flow.items")}</span>
            </div>
            <div className="decision-command-deck__card-grid">
              {section.cards.map((card) => (
                <DecisionCommandDeckCard
                  key={card.id}
                  card={card}
                  selectedAbilityTarget={selectedAbilityTarget}
                  showAbilityTargets={card.interaction?.type === "ability" && Boolean(card.selected)}
                  onAbilityTargetChange={onAbilityTargetChange}
                  onConfirm={onConfirm}
                  onQuantityChange={onQuantityChange}
                  onRevoke={onRevoke}
                  onToggleChange={onToggleChange}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function DecisionCommandDeckCard({
  card,
  selectedAbilityTarget,
  showAbilityTargets,
  onAbilityTargetChange,
  onConfirm,
  onQuantityChange,
  onRevoke,
  onToggleChange,
}: {
  card: DecisionCardViewModel;
  selectedAbilityTarget?: IdeologyKey;
  showAbilityTargets: boolean;
  onAbilityTargetChange: (abilityId: string, ideology: IdeologyKey) => void;
  onQuantityChange: (card: DecisionCardViewModel, quantity: number) => void;
  onToggleChange: (card: DecisionCardViewModel, checked: boolean) => void;
  onConfirm: (card: DecisionCardViewModel) => void;
  onRevoke: (card: DecisionCardViewModel) => void;
}) {
  const { t } = useTranslation();
  const toneClass =
    card.tone === "accent"
      ? "decision-command-deck-card--accent"
      : card.tone === "locked"
        ? "decision-command-deck-card--locked"
        : "";
  const abilityInteraction = card.interaction?.type === "ability" ? card.interaction : null;
  const confirmCount = card.control.kind === "confirm" && card.control.mode === "count"
    ? card.control.count ?? 0
    : 0;
  const selectedFlagText =
    confirmCount > 0
      ? `${t("common:decision.scheduled", { count: confirmCount })}`
      : card.selected
        ? t("common:decision.alreadyScheduled")
        : null;

  return (
    <article className={`decision-command-deck-card ${toneClass}`}>
      <header className="decision-command-deck-card__header">
        <div>
          <h5>{card.title}</h5>
          {card.subtitle ? <p className="decision-command-deck-card__subtitle">{card.subtitle}</p> : null}
        </div>
        {selectedFlagText ? <span className="decision-command-deck-card__flag">{selectedFlagText}</span> : null}
      </header>

      {card.description ? <p className="decision-command-deck-card__description">{card.description}</p> : null}

      {card.badges.length > 0 ? (
        <div className="decision-command-deck-card__badge-row">
          {card.badges.map((badge) => (
            <span key={`${card.id}-${badge}`} className="decision-command-deck-card__badge">
              {badge}
            </span>
          ))}
        </div>
      ) : null}

      {card.metrics.length > 0 ? (
        <dl className="decision-command-deck-card__metrics">
          {card.metrics.map((metric) => (
            <div
              key={`${card.id}-${metric.label}`}
              className={`decision-command-deck-card__metric${metric.tone ? ` decision-command-deck-card__metric--${metric.tone}` : ""}`}
            >
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {card.control.kind === "quantity" ? (() => {
        const ctrl = card.control;
        return (
          <div className="decision-command-deck-card__stepper">
          <button
            aria-label={`${t("common:decrease")}${ctrl.label}`}
            className="decision-command-deck-card__stepper-btn"
            disabled={ctrl.disabled || ctrl.value <= 0}
            type="button"
            onClick={() => onQuantityChange(card, ctrl.value - 1)}
          >
            −
          </button>
          <span className="decision-command-deck-card__stepper-value">
            {ctrl.value} {ctrl.unitLabel ?? t("game:batches")}
          </span>
          <button
            aria-label={`${t("common:increase")}${ctrl.label}`}
            className="decision-command-deck-card__stepper-btn"
            disabled={ctrl.disabled || ctrl.value >= ctrl.max}
            type="button"
            onClick={() => onQuantityChange(card, ctrl.value + 1)}
          >
            +
          </button>
          </div>
        );
      })() : null}

      {card.control.kind === "confirm" ? (() => {
        const ctrl = card.control;
        return ctrl.mode === "count" ? (
          <div className="decision-command-deck-card__confirm-row">
            <button
              aria-label={ctrl.confirmLabel}
              className="decision-command-deck-card__confirm-btn"
              disabled={ctrl.disabled}
              type="button"
              onClick={() => onConfirm(card)}
            >
              {t("common:confirm")}
            </button>
            <button
              aria-label={ctrl.cancelLabel ?? `${t("common:revoke")}${card.title}`}
              className="decision-command-deck-card__confirm-btn decision-command-deck-card__confirm-btn--subtle"
              disabled={ctrl.revokeDisabled}
              type="button"
              onClick={() => onRevoke(card)}
            >
              {t("common:revoke")}
            </button>
          </div>
        ) : (
          <button
            className={`decision-command-deck-card__confirm-btn ${ctrl.confirmed ? "decision-command-deck-card__confirm-btn--active" : ""}`}
            disabled={ctrl.disabled}
            type="button"
            onClick={() => (ctrl.confirmed ? onRevoke(card) : onConfirm(card))}
          >
            {ctrl.confirmed ? (ctrl.cancelLabel ?? t("common:cancel")) : ctrl.confirmLabel}
          </button>
        );
      })() : null}

      {card.control.kind === "toggle" ? (
        <label className="decision-command-deck-card__toggle">
          <input
            aria-label={card.control.label}
            checked={card.control.checked}
            disabled={card.control.disabled}
            type="checkbox"
            onChange={(event) => onToggleChange(card, event.target.checked)}
          />
          <span>
            {card.control.checked
              ? card.control.activeText ?? t("common:selected")
              : card.control.disabled
                ? card.control.disabledText ?? t("common:notAvailable")
                : card.control.inactiveText ?? t("common:select")}
          </span>
        </label>
      ) : null}

      {showAbilityTargets && abilityInteraction ? (
        <fieldset className="decision-command-deck-card__radio-group">
          <legend>{t("game:government.ideologyTarget")}</legend>
          {(["liberalism", "egalitarianism", "nationalism"] as IdeologyKey[]).map((ideologyKey) => {
            const ideologyLabel = getIdeologyOptionLabel(ideologyKey);
            return (
            <label key={`${card.id}-${ideologyKey}`} className="decision-command-deck-card__radio">
              <input
                aria-label={`${card.title} ${ideologyLabel}`}
                checked={(selectedAbilityTarget ?? "liberalism") === ideologyKey}
                name={`ability-target-${abilityInteraction.abilityId}`}
                type="radio"
                onChange={() => onAbilityTargetChange(abilityInteraction.abilityId, ideologyKey)}
              />
              <span>{ideologyLabel}</span>
            </label>
          );})}
        </fieldset>
      ) : null}

      {card.feedback ? <p className="decision-command-deck-card__feedback">{card.feedback}</p> : null}
      {card.lockedReason ? <p className="decision-command-deck-card__locked-reason">{card.lockedReason}</p> : null}
    </article>
  );
}
