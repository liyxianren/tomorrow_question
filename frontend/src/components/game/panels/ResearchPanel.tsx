import { useState } from "react";
import { getTechnologyLabel as fallbackTechLabel } from "../../../features/game/panelGlossary";
import type { TechTreeData, TechTreeChainTech } from "../../../types";
import "./ResearchPanel.css";

interface ResearchPanelProps {
  techTree: TechTreeData;
  selectedTechIds: Set<string>;
  onToggleTech: (techId: string, checked: boolean) => void;
  onBuildResearchFacility: () => void;
  canAffordResearchFacility: boolean;
  isResearchFacilitySelected: boolean;
}

export function ResearchPanel({
  techTree,
  selectedTechIds,
  onToggleTech,
  onBuildResearchFacility,
  canAffordResearchFacility,
  isResearchFacilitySelected,
}: ResearchPanelProps) {
  const { chains, researchFacilities, facilityCost, progressPerFacility, activeResearch } = techTree;

  const activeTech = activeResearch
    ? chains.flatMap((c) => c.techs).find((t) => t.techId === activeResearch)
    : undefined;
  const activeTechLabel = activeTech?.label ?? (activeResearch ? fallbackTechLabel(activeResearch) : null);
  const activeProgressPercent = activeTech && activeTech.effectiveThreshold > 0
    ? Math.min(100, Math.round((activeTech.progress / activeTech.effectiveThreshold) * 100))
    : 0;
  const perTurnProgress = researchFacilities * progressPerFacility;
  const activeEtaTurns = activeTech && perTurnProgress > 0
    ? Math.max(0, Math.ceil((activeTech.effectiveThreshold - activeTech.progress) / perTurnProgress))
    : null;
  const totalMaintenance = researchFacilities * facilityCost;

  // Branch selection state
  const [activeChainId, setActiveChainId] = useState<string | null>(null);
  const activeChain = activeChainId
    ? chains.find((c) => c.chainId === activeChainId) ?? chains[0] ?? null
    : chains[0] ?? null;

  return (
    <div className="research-panel">
      <div className="talent-tree talent-tree--v2">
        <div className="talent-tree--v2__left">
          {/* Active Research Status Card */}
          <div className="research-status-card">
            <h4 className="research-status-card__heading">⚡ 当前研究</h4>
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
                        {activeTech.progress}/{activeTech.effectiveThreshold}
                      </span>
                    </div>
                    {activeEtaTurns !== null ? (
                      <div className="research-status-card__meta">
                        预计 {activeEtaTurns} 回合后完成
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : (
              <div className="research-status-card__hint">
                点击右侧科技选择研究目标，提交决策后开始研究
              </div>
            )}
          </div>

          {/* Research Facilities Card */}
          <div className="research-status-card">
            <h4 className="research-status-card__heading">🔬 研究设施</h4>
            <div className="research-status-card__metrics">
              <div className="research-status-card__metric">
                <span className="research-status-card__metric-label">设施数</span>
                <span className="research-status-card__metric-value">{researchFacilities} 所</span>
              </div>
              <div className="research-status-card__metric">
                <span className="research-status-card__metric-label">单所产出</span>
                <span className="research-status-card__metric-value">
                  {progressPerFacility} 进度/回合
                </span>
              </div>
              <div className="research-status-card__metric">
                <span className="research-status-card__metric-label">本轮总进度</span>
                <span className="research-status-card__metric-value">
                  {perTurnProgress}
                </span>
              </div>
              <div className="research-status-card__metric">
                <span className="research-status-card__metric-label">维护成本</span>
                <span className="research-status-card__metric-value">
                  {totalMaintenance} 财政（{facilityCost}/所）
                </span>
              </div>
            </div>
            <button
              type="button"
              className={`research-build-btn${isResearchFacilitySelected ? " research-build-btn--selected" : ""}`}
              disabled={!canAffordResearchFacility || isResearchFacilitySelected}
              onClick={onBuildResearchFacility}
            >
              {isResearchFacilitySelected ? "✓ 已选择建立研究院" : "🏗️ 建立研究院"}
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
                  <span className="talent-branch-card__name">{chain.label}</span>
                  <div className="talent-branch-card__progress-bar">
                    <div
                      className="talent-branch-card__progress-fill"
                      style={{ width: `${chain.techs.length > 0 ? (unlockedCount / chain.techs.length) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="talent-branch-card__info">
                    {unlockedCount}/{chain.techs.length} 已解锁
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
            />
          ) : (
            <p className="talent-tree__hint">暂无科技链。</p>
          )}
        </div>
      </div>
    </div>
  );
}

const CHAIN_META: Record<string, { icon: string; color: string }> = {
  electrical: { icon: "⚡", color: "#4a9eff" },
  mechanical: { icon: "⚙️", color: "#68d391" },
  steam:      { icon: "♨️", color: "#fc8181" },
};

function ChainDetail({
  chain,
  selectedTechIds,
  onToggleTech,
}: {
  chain: { chainId: string; label: string; techs: TechTreeChainTech[] };
  selectedTechIds: Set<string>;
  onToggleTech: (techId: string, checked: boolean) => void;
}) {
  const meta = CHAIN_META[chain.chainId] ?? { icon: "🔬", color: "#888" };
  const [expandedTechId, setExpandedTechId] = useState<string | null>(null);

  return (
    <div className="talent-detail" style={{ "--branch-color": meta.color } as React.CSSProperties}>
      <h4 className="talent-detail__branch-title">
        {meta.icon} {chain.label}
      </h4>

      <div className="talent-detail__chain">
      {chain.techs.map((tech, index) => {
        const isSelected = selectedTechIds.has(tech.techId);
        const prerequisiteMet = index === 0
          || tech.isUnlocked
          || chain.techs[index - 1]?.isUnlocked
          || selectedTechIds.has(chain.techs[index - 1]?.techId ?? "");

        const stateClass = tech.isUnlocked
          ? "talent-node--unlocked"
          : tech.isActive
            ? "talent-node--available"
            : tech.canResearch
              ? "talent-node--available"
              : "talent-node--locked";

        const isExpanded = expandedTechId === tech.techId;
        const progressPercent = tech.effectiveThreshold > 0
          ? Math.min(100, Math.round((tech.progress / tech.effectiveThreshold) * 100))
          : 0;

        const lockReason = tech.isUnlocked
          ? null
          : !prerequisiteMet
            ? `需先解锁「${chain.techs[index - 1]?.label ?? "前置"}」`
            : tech.isActive
              ? null
              : !tech.canResearch
                ? "需先完成前置科技"
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
                  {tech.isUnlocked ? "✅" : tech.isActive ? "⚡" : isSelected ? "◉" : tech.canResearch ? "🔓" : "🔒"}{" "}
                  {tech.label}
                </h4>
                {!tech.isUnlocked && (
                  <span className="talent-node__cost">
                    {tech.progress}/{tech.effectiveThreshold}
                  </span>
                )}
              </div>

              {!tech.isUnlocked && (
                <div className="talent-node__effects">
                  <span className="talent-node__effect-tag">
                    进度 {progressPercent}%
                  </span>
                  {tech.breakthroughAttempts > 0 && (
                    <span className="talent-node__effect-tag">
                      突破 {tech.breakthroughAttempts} 次
                    </span>
                  )}
                </div>
              )}

              {isExpanded && (
                <div style={{ marginTop: 8 }}>
                  {tech.unlocksGoods && tech.unlocksGoods.length > 0 && (
                    <p className="talent-tree__hint">
                      解锁商品：{tech.unlocksGoods.join("、")}
                    </p>
                  )}
                  {tech.isActive && (
                    <p className="talent-tree__hint">⚡ 正在研究中</p>
                  )}
                  {tech.canResearch && !tech.isUnlocked && !tech.isActive && (
                    <p className="talent-tree__hint">
                      {isSelected ? "已选中，提交决策后开始研究" : "点击解锁按钮选择研究"}
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
                  ✓ 已解锁
                </span>
              ) : tech.isActive ? (
                <span className="talent-node__btn talent-node__btn--unlocked" style={{ color: "#fceb9c" }}>
                  ⚡ 研究中
                </span>
              ) : isSelected ? (
                <button
                  className="talent-node__btn talent-node__btn--selected"
                  onClick={(e) => { e.stopPropagation(); onToggleTech(tech.techId, false); }}
                  type="button"
                >
                  ✓ 已选择
                </button>
              ) : (
                <button
                  className="talent-node__btn"
                  disabled={!tech.canResearch}
                  onClick={(e) => { e.stopPropagation(); onToggleTech(tech.techId, true); }}
                  type="button"
                >
                  研究
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
