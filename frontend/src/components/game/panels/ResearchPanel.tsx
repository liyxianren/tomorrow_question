import { useState } from "react";
import { useTranslation } from "react-i18next";
import { translateBackend } from "../../../i18n";
import { getTechnologyLabel as fallbackTechLabel } from "../../../features/game/panelGlossary";
import type { TechTreeData, TechTreeChainTech } from "../../../types";
import "./ResearchPanel.css";

interface ResearchPanelProps {
  techTree: TechTreeData;
  selectedTechIds: Set<string>;
  onToggleTech: (techId: string, checked: boolean) => void;
  onToggleResearchFacility: (checked: boolean) => void;
  remainingGovernmentBudget: number;
  isResearchFacilitySelected: boolean;
}

export function ResearchPanel({
  techTree,
  selectedTechIds,
  onToggleTech,
  onToggleResearchFacility,
  remainingGovernmentBudget,
  isResearchFacilitySelected,
}: ResearchPanelProps) {
  const { t } = useTranslation();
  const { chains, researchFacilities, facilityCost, progressPerFacility, activeResearch } = techTree;
  const breakthroughDieSides = techTree.breakthroughDieSides ?? 10;
  const canAffordResearchFacility = remainingGovernmentBudget >= facilityCost;

  const activeTech = activeResearch
    ? chains.flatMap((c) => c.techs).find((t) => t.techId === activeResearch)
    : undefined;
  const activeTechLabel = translateBackend(activeTech?.label ?? "") ?? (activeResearch ? fallbackTechLabel(activeResearch) : null);
  const activeProgressDisplay = activeTech
    ? Math.min(activeTech.progress, activeTech.effectiveThreshold)
    : 0;
  const activeProgressPercent = activeTech && activeTech.effectiveThreshold > 0
    ? Math.min(100, Math.round((activeProgressDisplay / activeTech.effectiveThreshold) * 100))
    : 0;
  const perTurnProgress = researchFacilities * progressPerFacility;
  const activeEtaTurns = activeTech && perTurnProgress > 0
    ? Math.max(0, Math.ceil((activeTech.effectiveThreshold - activeTech.progress) / perTurnProgress))
    : null;
  const activeSuccessChance = activeTech
    ? formatBreakthroughChance(activeTech.effectiveThreshold, breakthroughDieSides, t)
    : null;
  const nextPerTurnProgress = (researchFacilities + 1) * progressPerFacility;

  // Branch selection state
  const [activeChainId, setActiveChainId] = useState<string | null>(null);
  const highlightedTechId = activeResearch ?? [...selectedTechIds][0] ?? null;
  const defaultChain = highlightedTechId
    ? chains.find((chain) => chain.techs.some((tech) => tech.techId === highlightedTechId)) ?? chains[0] ?? null
    : chains[0] ?? null;
  const activeChain = activeChainId
    ? chains.find((c) => c.chainId === activeChainId) ?? defaultChain
    : defaultChain;

  return (
    <div className="research-panel">
      <div className="talent-tree talent-tree--v2">
        <div className="talent-tree--v2__left">
          {/* Active Research Status Card */}
          <div className="research-status-card">
            <h4 className="research-status-card__heading">{t("game:research.currentResearch")}</h4>
            {activeResearch ? (
              <>
                <div className="research-status-card__title">{activeTechLabel}</div>
                {activeTech ? (
                  <>
                    <div className="research-status-card__progress">
                      <div className="research-status-card__bar">
                        <div
                          className="research-status-card__bar-fill"
                          style={{ width: `${activeProgressPercent}%` }}
                        />
                      </div>
                      <span className="research-status-card__progress-text">
                        {activeProgressDisplay}/{activeTech.effectiveThreshold}
                      </span>
                    </div>
                    {activeEtaTurns !== null ? (
                      <div className="research-status-card__meta">
                        {activeTech.progress >= activeTech.effectiveThreshold
                          ? t("game:research.progressFull")
                          : t("game:research.etaRounds", { turns: activeEtaTurns })}
                      </div>
                    ) : null}
                    <div className="research-status-card__meta">
                      {t("game:research.autoConfirm")}
                    </div>
                    <div className="research-status-card__meta">
                      {t("game:research.breakthroughCheck", { die: breakthroughDieSides, threshold: activeTech.effectiveThreshold })}
                      {activeSuccessChance ? `（${activeSuccessChance}）` : ""}。
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <div className="research-status-card__hint">
                {t("game:research.notResearching")}
              </div>
            )}
          </div>

          <div className="research-status-card">
            <h4 className="research-status-card__heading">{t("game:research.breakthroughRules")}</h4>
            <div className="research-status-card__metrics">
              <div className="research-status-card__metric">
                <span className="research-status-card__metric-label">{t("game:research.advanceMethod")}</span>
                <span className="research-status-card__metric-value">
                  {t("game:research.advanceMethodValue", { progress: progressPerFacility })}
                </span>
              </div>
              <div className="research-status-card__metric">
                <span className="research-status-card__metric-label">{t("game:research.breakthroughDie")}</span>
                <span className="research-status-card__metric-value">
                  1D{breakthroughDieSides}
                </span>
              </div>
            </div>
            <div className="research-build-summary">
              <span>{t("game:research.breakthroughSummary1")}</span>
              <span>{t("game:research.breakthroughSummary2")}</span>
              <span>{t("game:research.breakthroughSummary3")}</span>
              <span>{t("game:research.breakthroughSummary4")}</span>
            </div>
          </div>

          {/* Research Facilities Card */}
          <div className="research-status-card">
            <h4 className="research-status-card__heading">🔬 {t("game:research.researchFacilities")}</h4>
            <div className="research-status-card__metrics">
              <div className="research-status-card__metric">
                <span className="research-status-card__metric-label">{t("game:research.facilityCount")}</span>
                <span className="research-status-card__metric-value">{researchFacilities} {t("game:flow.items")}</span>
              </div>
              <div className="research-status-card__metric">
                <span className="research-status-card__metric-label">{t("game:research.perFacilityOutput")}</span>
                <span className="research-status-card__metric-value">
                  {t("game:research.advanceMethodValue", { progress: progressPerFacility })}
                </span>
              </div>
              <div className="research-status-card__metric">
                <span className="research-status-card__metric-label">{t("game:research.perRoundProgress")}</span>
                <span className="research-status-card__metric-value">
                  {perTurnProgress}
                </span>
              </div>
              <div className="research-status-card__metric">
                <span className="research-status-card__metric-label">{t("game:research.buildCondition")}</span>
                <span className="research-status-card__metric-value">
                  {t("game:research.buildConditionFiscal", { cost: facilityCost })}
                </span>
              </div>
            </div>
            <div className="research-build-summary">
              <span>{t("game:research.fiscalBalance")} {remainingGovernmentBudget}</span>
              <span>{t("game:research.projectedAfterBuild", { progress: nextPerTurnProgress })}</span>
              {isResearchFacilitySelected ? (
                <span>{t("game:research.plannedThisRound")}</span>
              ) : canAffordResearchFacility ? (
                <span>{t("game:research.conditionMet")}</span>
              ) : (
                <span className="research-build-summary__warn">{t("game:research.fiscalInsufficient")}</span>
              )}
            </div>
            <button
              type="button"
              className={`research-build-btn${isResearchFacilitySelected ? " research-build-btn--selected" : ""}`}
              disabled={!isResearchFacilitySelected && !canAffordResearchFacility}
              onClick={() => onToggleResearchFacility(!isResearchFacilitySelected)}
            >
              {isResearchFacilitySelected ? t("game:research.cancelBuildFacility") : "🏗️ " + t("game:research.buildFacility")}
            </button>
          </div>
        </div>

        <div className="talent-tree--v2__right">
          {/* Branch Selection (horizontal tab pills) */}
          <div className="talent-branches talent-branches--tabs">
            {chains.map((chain) => {
              const meta = CHAIN_META[chain.chainId] ?? { icon: "🔬", color: "#888" };
              const unlockedCount = chain.techs.filter((t) => t.isUnlocked).length;
              const isActive = chain.chainId === (activeChain?.chainId ?? null);

              return (
                <button
                  key={chain.chainId}
                  className={`talent-branch-card ${isActive ? "talent-branch-card--active" : ""}`}
                  style={{ "--branch-color": meta.color } as React.CSSProperties}
                  onClick={() => setActiveChainId(chain.chainId)}
                  type="button"
                  aria-pressed={isActive}
                >
                  <span className="talent-branch-card__icon">{meta.icon}</span>
                  <span className="talent-branch-card__name">{translateBackend(chain.label)}</span>
                  <div className="talent-branch-card__progress-bar">
                    <div
                      className="talent-branch-card__progress-fill"
                      style={{ width: `${chain.techs.length > 0 ? (unlockedCount / chain.techs.length) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="talent-branch-card__info">
                    {unlockedCount}/{chain.techs.length} {t("game:research.unlocked")}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Branch Detail (Tech Nodes) */}
          {activeChain ? (
            <ChainDetail
              chain={activeChain}
              selectedTechIds={selectedTechIds}
              onToggleTech={onToggleTech}
              activeResearch={activeResearch}
            />
          ) : (
            <p className="talent-tree__hint">{t("game:research.noTechChains")}</p>
          )}

        </div>
      </div>
    </div>
  );
}

function formatBreakthroughChance(effectiveThreshold: number, dieSides: number, t: (key: string, options?: Record<string, unknown>) => string): string | null {
  if (effectiveThreshold <= 0 || dieSides <= 0) {
    return null;
  }
  const successOutcomes = Math.max(0, dieSides - effectiveThreshold + 1);
  const clamped = Math.min(successOutcomes, dieSides);
  const percent = Math.round((clamped / dieSides) * 100);
  return t("game:research.breakthroughPercent", { percent: `${percent}%` });
}

const CHAIN_META: Record<string, { icon: string; color: string }> = {
  industrialization: { icon: "🏭", color: "#d4af37" },
  electrical: { icon: "⚡", color: "#4a9eff" },
  mechanical: { icon: "⚙️", color: "#68d391" },
  steam:      { icon: "♨️", color: "#fc8181" },
};

function getTechUnlockHint(techId: string, t: (key: string, options?: Record<string, unknown>) => string): string | undefined {
  const map: Record<string, string> = {
    spinning_jenny: t("game:factory.modeHints.mechanized", { defaultValue: "Mechanized" }),
    lathe: t("game:factory.modeHints.steam", { defaultValue: "Steam Power" }),
    watt_engine: t("game:factory.modeHints.steam", { defaultValue: "Steam Power" }),
    power_generation: t("game:factory.modeHints.electrified", { defaultValue: "Electrified Industry" }),
    combustion_engine: t("game:factory.modeHints.electrified", { defaultValue: "Electrified Industry" }),
  };
  return map[techId];
}

function ChainDetail({
  chain,
  selectedTechIds,
  onToggleTech,
  activeResearch,
}: {
  chain: { chainId: string; label: string; techs: TechTreeChainTech[] };
  selectedTechIds: Set<string>;
  onToggleTech: (techId: string, checked: boolean) => void;
  activeResearch: string | null;
}) {
  const { t } = useTranslation();
  const meta = CHAIN_META[chain.chainId] ?? { icon: "🔬", color: "#888" };
  const [expandedTechId, setExpandedTechId] = useState<string | null>(null);

  return (
    <div className="talent-detail" style={{ "--branch-color": meta.color } as React.CSSProperties}>
      <h4 className="talent-detail__branch-title">
        {meta.icon} {translateBackend(chain.label)}
      </h4>

      <div className="talent-detail__chain">
      {chain.techs.map((tech, index) => {
        const isSelected = selectedTechIds.has(tech.techId);
        const isActive = activeResearch === tech.techId;
        const prerequisiteMet = index === 0
          || tech.isUnlocked
          || chain.techs[index - 1]?.isUnlocked
          || selectedTechIds.has(chain.techs[index - 1]?.techId ?? "");

        const stateClass = tech.isUnlocked
          ? "talent-node--unlocked"
          : isActive
            ? "talent-node--available"
            : tech.canResearch
              ? "talent-node--available"
              : "talent-node--locked";

        const isExpanded = expandedTechId === tech.techId;
        const progressPercent = tech.effectiveThreshold > 0
          ? Math.min(100, Math.round((Math.min(tech.progress, tech.effectiveThreshold) / tech.effectiveThreshold) * 100))
          : 0;
        const progressDisplay = Math.min(tech.progress, tech.effectiveThreshold);

        const lockReason = tech.isUnlocked
          ? null
            : !prerequisiteMet
              ? t("game:research.prerequisiteNeeded", { tech: translateBackend(chain.techs[index - 1]?.label ?? "") ?? "???" })
            : isActive
              ? null
              : !tech.canResearch
                ? t("game:research.prerequisiteTechNeeded")
                : null;

        return (
          <div
            key={tech.techId}
            className={`talent-node ${stateClass}`}
            onClick={() => setExpandedTechId(isExpanded ? null : tech.techId)}
          >
            <div className="talent-node__dot" />

            <div className="talent-node__body">
              <div className="talent-node__head">
                <h4 className="talent-node__name">
                  {tech.isUnlocked ? "✅" : isActive ? "⚡" : isSelected ? "◉" : tech.canResearch ? "🔓" : "🔒"}{" "}
                  {translateBackend(tech.label)}
                </h4>
                {!tech.isUnlocked && (
                  <span className="talent-node__cost">
                    {progressDisplay}/{tech.effectiveThreshold}
                  </span>
                )}
              </div>

              {!tech.isUnlocked && (
                <div className="talent-node__effects">
                  <span className="talent-node__effect-tag">
                    {t("game:research.advanceMethod")} {progressPercent}%
                  </span>
                  {getTechUnlockHint(tech.techId, t) ? (
                    <span className="talent-node__effect-tag">
                      {getTechUnlockHint(tech.techId, t)}
                    </span>
                  ) : null}
                  {tech.breakthroughAttempts > 0 && (
                    <span className="talent-node__effect-tag">
                      {t("game:research.breakthroughDie")} {tech.breakthroughAttempts} {t("game:flow.times")}
                    </span>
                  )}
                </div>
              )}

              {isExpanded && (
                <div style={{ marginTop: 8 }}>
                  {tech.unlocksGoods && tech.unlocksGoods.length > 0 && (
                    <p className="talent-tree__hint">
                      {t("game:research.unlocksGoods", { goods: tech.unlocksGoods.join("、") })}
                    </p>
                  )}
                  {tech.unlocksRoutes && tech.unlocksRoutes.length > 0 && (
                    <p className="talent-tree__hint">
                      {t("game:research.unlocksRoutes", { routes: tech.unlocksRoutes.map(getRouteLabel).join("、") })}
                    </p>
                  )}
                  {isActive && (
                    <p className="talent-tree__hint">⚡ {t("game:research.currentlyResearching")}</p>
                  )}
                  {tech.canResearch && !tech.isUnlocked && !isActive && (
                    <p className="talent-tree__hint">
                      {isSelected ? t("game:research.selectedAndSubmit") : t("game:research.clickToResearch")}
                    </p>
                  )}
                </div>
              )}

              {lockReason ? (
                <p className="talent-node__lock-reason">{lockReason}</p>
              ) : null}
            </div>

            <div className="talent-node__action">
              {tech.isUnlocked ? (
                <span className="talent-node__btn talent-node__btn--unlocked">
                  ✓ {t("game:research.unlocked")}
                </span>
              ) : isActive ? (
                <span className="talent-node__btn talent-node__btn--unlocked" style={{ color: "#fceb9c" }}>
                  ⚡ {t("game:research.researching")}
                </span>
              ) : isSelected ? (
                <button
                  className="talent-node__btn talent-node__btn--selected"
                  onClick={(e) => { e.stopPropagation(); onToggleTech(tech.techId, false); }}
                  type="button"
                >
                  ✓ {t("game:research.selected")}
                </button>
              ) : (
                <button
                  className="talent-node__btn"
                  disabled={!tech.canResearch}
                  onClick={(e) => { e.stopPropagation(); onToggleTech(tech.techId, true); }}
                  type="button"
                >
                  {t("game:research.research")}
                </button>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function getRouteLabel(routeId: string): string {
  const { t } = useTranslation();
  const map: Record<string, string> = {
    handicraft: t("game:productionRoute.handicraft", "Handicraft"),
    mechanized: t("game:productionRoute.mechanized", "Mechanized Industry"),
    steam: t("game:productionRoute.steam", "Steam Industry"),
    electrified: t("game:productionRoute.electrified", "Electrified Industry"),
  };
  return map[routeId] ?? routeId;
}
