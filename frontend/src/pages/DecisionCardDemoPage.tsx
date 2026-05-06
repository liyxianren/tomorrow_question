import { startTransition, useEffect, useMemo, useState } from "react";

import { restoreSessionContext } from "../app/sessionRecovery";
import { GameMapModal } from "../components/game/map/GameMapModal";
import { DecisionCommandDeck } from "../components/game/panels/DecisionCommandDeck";
import {
  addMilitaryActionSelection,
  removeMilitaryActionSelection,
  setAbilitySelectionTarget,
  setProductionOrderQuantity,
  setRouteDecisionOrderQuantity,
  toggleDiplomacyActionSelection,
  toggleDomesticMarketActionSelection,
  toggleGovernmentStrategySelection,
  toggleNationalAbilitySelection,
  toggleTechResearchSelection,
} from "../features/game/decisionDrafts";
import {
  buildDecisionCardDemoViewModel,
  createLiveDecisionCardDemoScenario,
  createSeedDecisionCardDemoScenario,
} from "../features/game/demo/decisionCardDemo";
import type {
  DecisionCardDemoVariant,
  DecisionCardViewModel,
  DecisionLocationId,
} from "../features/game/demo/types";
import { createInitialPhaseDraft, type PhaseDraftByPhase } from "../features/game/forms";
import type { IdeologyKey } from "../types";
import "./DecisionCardDemoPage.css";

const IDEOLOGY_OPTIONS: Array<{ key: IdeologyKey; label: string }> = [
  { key: "liberalism", label: "自由主义" },
  { key: "egalitarianism", label: "平等主义" },
  { key: "nationalism", label: "民族主义" },
];

export function DecisionCardDemoPage() {
  const seedScenario = useMemo(() => createSeedDecisionCardDemoScenario(), []);
  const [scenario, setScenario] = useState(seedScenario);
  const [selectedVariant, setSelectedVariant] = useState<DecisionCardDemoVariant>("command-deck");
  const [draft, setDraft] = useState(() => createInitialPhaseDraft("decision"));
  const [activeLocation, setActiveLocation] = useState<DecisionLocationId | null>(null);
  const [isResolvingLiveData, setIsResolvingLiveData] = useState(true);
  const viewModel = useMemo(
    () =>
      buildDecisionCardDemoViewModel({
        activeStep: activeLocation ?? "factory",
        draft,
        scenario,
      }),
    [activeLocation, draft, scenario],
  );

  useEffect(() => {
    let cancelled = false;

    void restoreSessionContext()
      .then((session) => {
        if (cancelled) {
          return;
        }

        const liveScenario = createLiveDecisionCardDemoScenario(session);
        startTransition(() => {
          setScenario(liveScenario ?? seedScenario);
          setIsResolvingLiveData(false);
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setScenario(seedScenario);
          setIsResolvingLiveData(false);
        });
      });

    return () => {
      cancelled = true;
    };
  }, [seedScenario]);

  const activeLocationViewModel = activeLocation ? viewModel.locations[activeLocation] : null;
  const selectedVariantMeta = viewModel.variants.find((variant) => variant.id === selectedVariant) ?? viewModel.variants[0];
  const selectedAbilityTarget =
    draft.abilitySelection
    && draft.abilitySelection.abilityId === scenario.workspace.nationalAbility?.abilityId
      ? draft.abilitySelection.targetIdeology
      : undefined;

  function updateDraft(updater: (previous: PhaseDraftByPhase["decision"]) => PhaseDraftByPhase["decision"]) {
    startTransition(() => {
      setDraft((previous) => updater(previous));
    });
  }

  function handleQuantityChange(card: DecisionCardViewModel, quantity: number) {
    if (!card.interaction) {
      return;
    }

    updateDraft((previous) => {
      switch (card.interaction?.type) {
        case "production":
          return setProductionOrderQuantity(previous, card.interaction.goodsId, quantity);
        case "expansion":
          return setRouteDecisionOrderQuantity(previous, "expansionOrders", card.interaction.routeId, quantity);
        case "upgrade":
          return setRouteDecisionOrderQuantity(previous, "upgradeOrders", card.interaction.routeId, quantity);
        case "newFactory":
          return setRouteDecisionOrderQuantity(previous, "newFactoryOrders", card.interaction.routeId, quantity);
        default:
          return previous;
      }
    });
  }

  function handleToggleChange(card: DecisionCardViewModel, checked: boolean) {
    if (!card.interaction) {
      return;
    }

    updateDraft((previous) => {
      switch (card.interaction?.type) {
        case "domesticAction":
          return toggleDomesticMarketActionSelection(previous, card.interaction.actionId, checked);
        case "governmentStrategy":
          return toggleGovernmentStrategySelection(previous, card.interaction.actionId, checked);
        case "technology":
          return toggleTechResearchSelection(previous, card.interaction.techId, checked);
        case "ability":
          return scenario.workspace.nationalAbility
            ? toggleNationalAbilitySelection(previous, scenario.workspace.nationalAbility, checked)
            : previous;
        default:
          return previous;
      }
    });
  }

  function handleConfirm(card: DecisionCardViewModel) {
    if (!card.interaction) {
      return;
    }

    updateDraft((previous) => {
      switch (card.interaction?.type) {
        case "expansion":
          return setRouteDecisionOrderQuantity(previous, "expansionOrders", card.interaction.routeId, 1);
        case "upgrade":
          return setRouteDecisionOrderQuantity(previous, "upgradeOrders", card.interaction.routeId, 1);
        case "newFactory":
          return setRouteDecisionOrderQuantity(previous, "newFactoryOrders", card.interaction.routeId, 1);
        case "militaryAction":
          return addMilitaryActionSelection(previous, card.interaction.actionId);
        case "diplomacyAction":
          return toggleDiplomacyActionSelection(previous, card.interaction.actionId, true);
        default:
          return previous;
      }
    });
  }

  function handleRevoke(card: DecisionCardViewModel) {
    if (!card.interaction) {
      return;
    }

    updateDraft((previous) => {
      switch (card.interaction?.type) {
        case "expansion":
          return setRouteDecisionOrderQuantity(previous, "expansionOrders", card.interaction.routeId, 0);
        case "upgrade":
          return setRouteDecisionOrderQuantity(previous, "upgradeOrders", card.interaction.routeId, 0);
        case "newFactory":
          return setRouteDecisionOrderQuantity(previous, "newFactoryOrders", card.interaction.routeId, 0);
        case "militaryAction":
          return removeMilitaryActionSelection(previous, card.interaction.actionId);
        case "diplomacyAction":
          return toggleDiplomacyActionSelection(previous, card.interaction.actionId, false);
        default:
          return previous;
      }
    });
  }

  function handleAbilityTargetChange(abilityId: string, ideology: IdeologyKey) {
    updateDraft((previous) => setAbilitySelectionTarget(previous, abilityId, ideology));
  }

  return (
    <section className={`decision-demo decision-demo--${selectedVariant}`}>
      <header className="decision-demo__hero">
        <div className="decision-demo__hero-copy">
          <p className="decision-demo__eyebrow">Decision Card Demo</p>
          <h1>决策卡片 DEMO</h1>
          <p className="decision-demo__lead">
            这页只比较选择方式，不接真实提交。当前用同一份奥地利决策数据，横向演示 3 套卡片组织方式。
          </p>
        </div>

        <aside className="decision-demo__status-stack">
          <div className="decision-demo__status-card decision-demo__status-card--accent">
            <span className="decision-demo__status-label">当前数据</span>
            <strong>{viewModel.countryLabel}</strong>
            <p>
              {viewModel.sourceLabel}
              {isResolvingLiveData ? " · 正在尝试恢复实时对局" : ""}
            </p>
          </div>
          <div className="decision-demo__status-card">
            <span className="decision-demo__status-label">比例预告</span>
            <strong>
              {viewModel.summary.ratioPreview.domesticMarket} / {viewModel.summary.ratioPreview.factory} / {viewModel.summary.ratioPreview.governmentFiscal}
            </strong>
            <p>内需 / 工厂 / 政府</p>
          </div>
        </aside>
      </header>

      <section className="decision-demo__summary-grid">
        <article className="decision-demo__summary-card">
          <span>国内消费市场</span>
          <strong>{viewModel.summary.remainingBudgets.domesticMarket}</strong>
          <p>剩余预算</p>
        </article>
        <article className="decision-demo__summary-card">
          <span>工业区</span>
          <strong>{viewModel.summary.remainingBudgets.factory}</strong>
          <p>剩余预算</p>
        </article>
        <article className="decision-demo__summary-card">
          <span>议会厅</span>
          <strong>{viewModel.summary.remainingBudgets.governmentFiscal}</strong>
          <p>剩余预算</p>
        </article>
        <article className="decision-demo__summary-card">
          <span>军事储备</span>
          <strong>{viewModel.summary.militaryPoints}</strong>
          <p>可用军事点</p>
        </article>
      </section>

      {activeLocation === null ? (
        <>
          <DecisionVariantPicker
            selectedVariant={selectedVariant}
            variants={viewModel.variants}
            onSelect={setSelectedVariant}
          />

          <section className="decision-demo__stage">
            <div className="decision-demo__stage-intro panel">
              <p className="decision-demo__eyebrow">当前预览</p>
              <div className="decision-demo__stage-heading">
                <div>
                  <h2>{selectedVariantMeta.label}</h2>
                  <p>{selectedVariantMeta.summary}</p>
                </div>
                <span className="decision-demo__accent-tag">{selectedVariantMeta.accent}</span>
              </div>
              <p className="decision-demo__stage-note">
                点击任一地点，会进入大弹窗。不同方案共用同一份 draft，本轮输入不会因为切换样式而丢失。
              </p>
            </div>

            <div className="decision-demo__location-grid">
              {Object.values(viewModel.locations).map((location) => (
                <button
                  key={location.id}
                  aria-label={location.label}
                  className="decision-demo__location-button"
                  type="button"
                  onClick={() => setActiveLocation(location.id)}
                >
                  <span className="decision-demo__location-kicker">{location.subtitle}</span>
                  <strong>{location.label}</strong>
                  <p>{location.description}</p>
                  <div className="decision-demo__pill-row" aria-hidden="true">
                    {location.summaryPills.slice(0, 3).map((pill) => (
                      <span key={`${location.id}-${pill}`} className="decision-demo__pill">
                        {pill}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <GameMapModal
        isOpen={activeLocationViewModel !== null}
        title={activeLocationViewModel?.label ?? "决策卡片 DEMO"}
        onClose={() => setActiveLocation(null)}
      >
        {activeLocationViewModel ? (
          <div className="decision-demo__modal-shell">
            <DecisionVariantPicker
              selectedVariant={selectedVariant}
              variants={viewModel.variants}
              onSelect={setSelectedVariant}
            />

            <nav className="decision-demo__modal-nav" aria-label="地点切换">
              {Object.values(viewModel.locations).map((location) => (
                <button
                  key={`modal-${location.id}`}
                  aria-label={location.label}
                  className={`decision-demo__modal-tab${location.id === activeLocationViewModel.id ? " decision-demo__modal-tab--active" : ""}`}
                  type="button"
                  onClick={() => setActiveLocation(location.id)}
                >
                  {location.label}
                </button>
              ))}
            </nav>

            {selectedVariant === "command-deck" ? (
              <DecisionCommandDeck
                viewModel={{
                  activeLocationId: activeLocationViewModel.id,
                  countryCode: viewModel.countryCode,
                  countryLabel: viewModel.countryLabel,
                  tabs: Object.values(viewModel.locations).map((location) => ({
                    id: location.id,
                    label: location.label,
                  })),
                  locations: viewModel.locations,
                }}
                selectedAbilityTarget={selectedAbilityTarget}
                onAbilityTargetChange={handleAbilityTargetChange}
                onConfirm={handleConfirm}
                onQuantityChange={handleQuantityChange}
                onRevoke={handleRevoke}
                onTabSelect={setActiveLocation}
                onToggleChange={handleToggleChange}
              />
            ) : (
              <>
                <section className="decision-demo__location-hero">
                  <div>
                    <p className="decision-demo__eyebrow">{activeLocationViewModel.eyebrow}</p>
                    <h3>{activeLocationViewModel.label}</h3>
                    <p>{activeLocationViewModel.subtitle}</p>
                    <p>{activeLocationViewModel.description}</p>
                  </div>
                  <div className="decision-demo__location-budget">
                    <span>{activeLocationViewModel.budgetLabel}</span>
                    <strong>{activeLocationViewModel.remainingBudget}</strong>
                  </div>
                </section>

                <div className="decision-demo__pill-row decision-demo__pill-row--full">
                  {activeLocationViewModel.summaryPills.map((pill) => (
                    <span key={`${activeLocationViewModel.id}-${pill}`} className="decision-demo__pill">
                      {pill}
                    </span>
                  ))}
                </div>

                <div className="decision-demo__section-stack">
                  {activeLocationViewModel.sections.map((section) => (
                    <section key={section.id} className="decision-demo__section">
                      <div className="decision-demo__section-header">
                        <div>
                          <h4>{section.title}</h4>
                          {section.description ? <p>{section.description}</p> : null}
                        </div>
                        <span>{section.cards.length} 张</span>
                      </div>
                      <div className="decision-demo__card-grid">
                        {section.cards.map((card) => (
                          <DecisionDemoCard
                            key={card.id}
                            card={card}
                            selectedAbilityTarget={selectedAbilityTarget}
                            selectedVariant={selectedVariant}
                            showAbilityTargets={
                              card.interaction?.type === "ability"
                              && Boolean(card.selected)
                              && Boolean(scenario.workspace.nationalAbility?.requiresTargetIdeology)
                            }
                            onAbilityTargetChange={handleAbilityTargetChange}
                            onConfirm={handleConfirm}
                            onQuantityChange={handleQuantityChange}
                            onRevoke={handleRevoke}
                            onToggleChange={handleToggleChange}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}
      </GameMapModal>
    </section>
  );
}

function DecisionVariantPicker({
  selectedVariant,
  variants,
  onSelect,
}: {
  selectedVariant: DecisionCardDemoVariant;
  variants: ReturnType<typeof buildDecisionCardDemoViewModel>["variants"];
  onSelect: (variant: DecisionCardDemoVariant) => void;
}) {
  return (
    <section className="decision-demo__variant-grid" aria-label="卡片方案切换">
      {variants.map((variant) => (
        <button
          key={variant.id}
          aria-label={variant.label}
          aria-pressed={variant.id === selectedVariant}
          className={`decision-demo__variant-button${variant.id === selectedVariant ? " decision-demo__variant-button--active" : ""}`}
          type="button"
          onClick={() => onSelect(variant.id)}
        >
          <span className="decision-demo__variant-accent">{variant.accent}</span>
          <strong>{variant.label}</strong>
          <p>{variant.summary}</p>
        </button>
      ))}
    </section>
  );
}

function DecisionDemoCard({
  card,
  selectedAbilityTarget,
  selectedVariant,
  showAbilityTargets,
  onAbilityTargetChange,
  onConfirm,
  onQuantityChange,
  onRevoke,
  onToggleChange,
}: {
  card: DecisionCardViewModel;
  selectedAbilityTarget?: IdeologyKey;
  selectedVariant: DecisionCardDemoVariant;
  showAbilityTargets: boolean;
  onAbilityTargetChange: (abilityId: string, ideology: IdeologyKey) => void;
  onConfirm: (card: DecisionCardViewModel) => void;
  onQuantityChange: (card: DecisionCardViewModel, quantity: number) => void;
  onRevoke: (card: DecisionCardViewModel) => void;
  onToggleChange: (card: DecisionCardViewModel, checked: boolean) => void;
}) {
  const toneClass =
    card.tone === "accent"
      ? "decision-demo-card--accent"
      : card.tone === "locked"
        ? "decision-demo-card--locked"
        : "";
  const abilityInteraction = card.interaction?.type === "ability" ? card.interaction : null;

  return (
    <article className={`decision-demo-card decision-demo-card--${selectedVariant} ${toneClass}`}>
      <header className="decision-demo-card__header">
        <div>
          <h5>{card.title}</h5>
          {card.subtitle ? <p className="decision-demo-card__subtitle">{card.subtitle}</p> : null}
        </div>
        {card.selected ? <span className="decision-demo-card__flag">已纳入</span> : null}
      </header>

      {card.description ? <p className="decision-demo-card__description">{card.description}</p> : null}

      <div className="decision-demo-card__badge-row">
        {card.badges.map((badge) => (
          <span key={`${card.id}-${badge}`} className="decision-demo-card__badge">
            {badge}
          </span>
        ))}
      </div>

      <dl className="decision-demo-card__metrics">
        {card.metrics.map((metric) => (
          <div
            key={`${card.id}-${metric.label}`}
            className={`decision-demo-card__metric${metric.tone ? ` decision-demo-card__metric--${metric.tone}` : ""}`}
          >
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>

      {card.control.kind === "quantity" ? (
        <div className="decision-demo-card__stepper">
          <button
            aria-label={`减少${card.control.label}`}
            className="decision-demo-card__stepper-btn"
            disabled={card.control.disabled || card.control.value <= 0}
            type="button"
            onClick={() => onQuantityChange(card, card.control.kind === "quantity" ? card.control.value - 1 : 0)}
          >
            −
          </button>
          <span className="decision-demo-card__stepper-value">
            {card.control.value} 批
          </span>
          <button
            aria-label={`增加${card.control.label}`}
            className="decision-demo-card__stepper-btn"
            disabled={card.control.disabled || card.control.value >= card.control.max}
            type="button"
            onClick={() => onQuantityChange(card, card.control.kind === "quantity" ? card.control.value + 1 : 0)}
          >
            +
          </button>
        </div>
      ) : null}

      {card.control.kind === "confirm" ? (() => {
        const ctrl = card.control as Extract<typeof card.control, { kind: "confirm" }>;
        return (
          ctrl.mode === "count" ? (
            <div className="decision-demo-card__confirm-row">
              <button
                aria-label={ctrl.confirmLabel}
                className="decision-demo-card__confirm-btn"
                disabled={ctrl.disabled}
                type="button"
                onClick={() => onConfirm(card)}
              >
                确认
              </button>
              <button
                aria-label={ctrl.cancelLabel ?? `撤回${card.title}`}
                className="decision-demo-card__confirm-btn decision-demo-card__confirm-btn--subtle"
                disabled={ctrl.revokeDisabled}
                type="button"
                onClick={() => onRevoke(card)}
              >
                撤回
              </button>
            </div>
          ) : (
            <button
              className={`decision-demo-card__confirm-btn ${ctrl.confirmed ? "decision-demo-card__confirm-btn--active" : ""}`}
              disabled={ctrl.disabled}
              type="button"
              onClick={() => (ctrl.confirmed ? onRevoke(card) : onConfirm(card))}
            >
              {ctrl.confirmed ? ctrl.cancelLabel : ctrl.confirmLabel}
            </button>
          )
        );
      })() : null}

      {card.control.kind === "toggle" ? (
        <label className="decision-demo-card__toggle">
          <input
            aria-label={card.control.label}
            checked={card.control.checked}
            disabled={card.control.disabled}
            type="checkbox"
            onChange={(event) => onToggleChange(card, event.target.checked)}
          />
          <span aria-hidden="true">
            {card.control.checked ? "已选择" : card.control.disabled ? "暂不可用" : "选择"}
          </span>
        </label>
      ) : null}

      {showAbilityTargets && abilityInteraction ? (
        <fieldset className="decision-demo-card__radio-group">
          <legend>意识形态目标</legend>
          {IDEOLOGY_OPTIONS.map((ideology) => (
            <label key={`${card.id}-${ideology.key}`} className="decision-demo-card__radio">
              <input
                aria-label={`${card.title} ${ideology.label}`}
                checked={(selectedAbilityTarget ?? "liberalism") === ideology.key}
                name={`ability-target-${abilityInteraction.abilityId}`}
                type="radio"
                onChange={() => onAbilityTargetChange(abilityInteraction.abilityId, ideology.key)}
              />
              <span>{ideology.label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {card.feedback ? <p className="decision-demo-card__feedback">{card.feedback}</p> : null}
      {card.lockedReason ? <p className="decision-demo-card__locked-reason">{card.lockedReason}</p> : null}
    </article>
  );
}
