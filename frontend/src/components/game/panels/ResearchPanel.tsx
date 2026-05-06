import { useState } from "react";
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
  const { chains, researchFacilities, facilityCost, progressPerFacility, activeResearch } = techTree;
  const breakthroughDieSides = techTree.breakthroughDieSides ?? 10;
  const canAffordResearchFacility = remainingGovernmentBudget >= facilityCost;

  const activeTech = activeResearch
    ? chains.flatMap((c) => c.techs).find((t) => t.techId === activeResearch)
    : undefined;
  const activeTechLabel = activeTech?.label ?? (activeResearch ? fallbackTechLabel(activeResearch) : null);
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
    ? formatBreakthroughChance(activeTech.effectiveThreshold, breakthroughDieSides)
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
            <h4 className="research-status-card__heading">当前研究</h4>
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
                          ? "进度已满；每次结算都会尝试突破，失败会保留进度并下轮继续"
                          : `预计 ${activeEtaTurns} 回合后进入突破`}
                      </div>
                    ) : null}
                    <div className="research-status-card__meta">
                      正在研究会自动确认本步；不更换目标也可以直接提交决策。
                    </div>
                    <div className="research-status-card__meta">
                      当前突破判定：1D{breakthroughDieSides} 掷出 {activeTech.effectiveThreshold} 或以上成功
                      {activeSuccessChance ? `（${activeSuccessChance}）` : ""}。
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <div className="research-status-card__hint">
                点击右侧科技选择研究目标，提交决策后开始研究
              </div>
            )}
          </div>

          <div className="research-status-card">
            <h4 className="research-status-card__heading">突破规则</h4>
            <div className="research-status-card__metrics">
              <div className="research-status-card__metric">
                <span className="research-status-card__metric-label">推进方式</span>
                <span className="research-status-card__metric-value">
                  {progressPerFacility}/设施/回合
                </span>
              </div>
              <div className="research-status-card__metric">
                <span className="research-status-card__metric-label">突破骰</span>
                <span className="research-status-card__metric-value">
                  1D{breakthroughDieSides}
                </span>
              </div>
            </div>
            <div className="research-build-summary">
              <span>进度达到有效阈值后，在财政结算时尝试突破</span>
              <span>掷骰结果不低于有效阈值才会解锁</span>
              <span>失败保留进度，失败次数会让下次有效阈值降低 1，最低为 1</span>
              <span>若其他国家已发现该科技，进度达到原阈值 2 倍可直接解锁</span>
            </div>
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
                <span className="research-status-card__metric-label">建设条件</span>
                <span className="research-status-card__metric-value">
                  {facilityCost} 财政
                </span>
              </div>
            </div>
            <div className="research-build-summary">
              <span>财政余额 {remainingGovernmentBudget}</span>
              <span>建成后 {nextPerTurnProgress} 进度/回合</span>
              {isResearchFacilitySelected ? (
                <span>本轮已排入计划</span>
              ) : canAffordResearchFacility ? (
                <span>条件满足</span>
              ) : (
                <span className="research-build-summary__warn">财政不足</span>
              )}
            </div>
            <button
              type="button"
              className={`research-build-btn${isResearchFacilitySelected ? " research-build-btn--selected" : ""}`}
              disabled={!isResearchFacilitySelected && !canAffordResearchFacility}
              onClick={() => onToggleResearchFacility(!isResearchFacilitySelected)}
            >
              {isResearchFacilitySelected ? "取消建立研究院" : "🏗️ 建立研究院"}
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
              activeResearch={activeResearch}
            />
          ) : (
            <p className="talent-tree__hint">暂无科技链。</p>
          )}

        </div>
      </div>
    </div>
  );
}

function formatBreakthroughChance(effectiveThreshold: number, dieSides: number): string | null {
  if (effectiveThreshold <= 0 || dieSides <= 0) {
    return null;
  }
  const successOutcomes = Math.max(0, dieSides - effectiveThreshold + 1);
  const clamped = Math.min(successOutcomes, dieSides);
  return `${Math.round((clamped / dieSides) * 100)}% 成功率`;
}

const CHAIN_META: Record<string, { icon: string; color: string }> = {
  industrialization: { icon: "🏭", color: "#d4af37" },
  electrical: { icon: "⚡", color: "#4a9eff" },
  mechanical: { icon: "⚙️", color: "#68d391" },
  steam:      { icon: "♨️", color: "#fc8181" },
};

const TECH_UNLOCK_HINTS: Record<string, string> = {
  spinning_jenny: "机械化条件",
  lathe: "蒸汽条件",
  watt_engine: "蒸汽条件",
  power_generation: "电气条件",
  combustion_engine: "电气条件",
};

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
              ? `需先解锁「${chain.techs[index - 1]?.label ?? "前置"}」`
            : isActive
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
                  {tech.isUnlocked ? "✅" : isActive ? "⚡" : isSelected ? "◉" : tech.canResearch ? "🔓" : "🔒"}{" "}
                  {tech.label}
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
                    进度 {progressPercent}%
                  </span>
                  {TECH_UNLOCK_HINTS[tech.techId] ? (
                    <span className="talent-node__effect-tag">
                      {TECH_UNLOCK_HINTS[tech.techId]}
                    </span>
                  ) : null}
                  {tech.breakthroughAttempts > 0 && (
                    <span className="talent-node__effect-tag">
                      突破失败 {tech.breakthroughAttempts} 次
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
                  {tech.unlocksRoutes && tech.unlocksRoutes.length > 0 && (
                    <p className="talent-tree__hint">
                      解锁生产方式：{tech.unlocksRoutes.map(getRouteLabel).join("、")}
                    </p>
                  )}
                  {isActive && (
                    <p className="talent-tree__hint">⚡ 正在研究中</p>
                  )}
                  {tech.canResearch && !tech.isUnlocked && !isActive && (
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
              ) : isActive ? (
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

function getRouteLabel(routeId: string): string {
  return {
    handicraft: "手工业",
    mechanized: "机械化",
    steam: "蒸汽工业",
    electrified: "电气工业",
  }[routeId] ?? routeId;
}
