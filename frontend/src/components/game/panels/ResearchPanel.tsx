import { getTechnologyLabel as fallbackTechLabel } from "../../../features/game/panelGlossary";
import type { TalentBranchOption, TechTreeData, TechTreeChainTech } from "../../../types";
import type { DecisionResearchView } from "../../../features/game/flow/decisionFlow";
import { TalentTreePanel } from "./TalentTreePanel";
import "./ResearchPanel.css";

interface ResearchPanelProps {
  techTree: TechTreeData;
  selectedTechIds: Set<string>;
  onToggleTech: (techId: string, checked: boolean) => void;
  view: DecisionResearchView;
  onViewChange: (view: DecisionResearchView) => void;
  talentBranches: TalentBranchOption[];
  projectedTechPoints: number;
  techCostPerPoint: number;
  unlockedTalentCount: number;
  selectedTalentNodeIds: Set<string>;
  activeBranchId: string | null;
  onSelectBranch: (branchId: string | null) => void;
  onToggleTalentNode: (nodeId: string, checked: boolean) => void;
}

export function ResearchPanel({
  techTree,
  selectedTechIds,
  onToggleTech,
  view,
  onViewChange,
  talentBranches,
  projectedTechPoints,
  techCostPerPoint,
  unlockedTalentCount,
  selectedTalentNodeIds,
  activeBranchId,
  onSelectBranch,
  onToggleTalentNode,
}: ResearchPanelProps) {
  return (
    <div className="research-panel">
      <div className="research-sub-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === "tech"}
          className={`research-sub-tab ${view === "tech" ? "research-sub-tab--active" : ""}`}
          onClick={() => onViewChange("tech")}
        >
          🔬 科技研究
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "talent"}
          className={`research-sub-tab ${view === "talent" ? "research-sub-tab--active" : ""}`}
          onClick={() => onViewChange("talent")}
        >
          🌳 天赋树
        </button>
      </div>

      {view === "tech" ? (
        <TechResearchView
          techTree={techTree}
          selectedTechIds={selectedTechIds}
          onToggleTech={onToggleTech}
        />
      ) : (
        <TalentTreePanel
          branches={talentBranches}
          projectedTechPoints={projectedTechPoints}
          techCostPerPoint={techCostPerPoint}
          unlockedTalentCount={unlockedTalentCount}
          selectedNodeIds={selectedTalentNodeIds}
          activeBranchId={activeBranchId}
          onSelectBranch={onSelectBranch}
          onToggleNode={onToggleTalentNode}
        />
      )}
    </div>
  );
}

function TechResearchView({
  techTree,
  selectedTechIds,
  onToggleTech,
}: {
  techTree: TechTreeData;
  selectedTechIds: Set<string>;
  onToggleTech: (techId: string, checked: boolean) => void;
}) {
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

  return (
    <div className="research-panel--v2">
      <div className="research-panel--v2__left">
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
        </div>
      </div>

      <div className="research-panel--v2__right">
        <div className="research-panel__chains">
          {chains.map((chain) => (
            <div key={chain.chainId} className="research-panel__chain">
              <div className="research-panel__chain-header">{chain.label}</div>
              <div className="research-panel__techs">
                {chain.techs.map((tech) => (
                  <TechRow
                    key={tech.techId}
                    tech={tech}
                    isSelected={selectedTechIds.has(tech.techId)}
                    onToggle={(checked) => onToggleTech(tech.techId, checked)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TechRow({
  tech,
  isSelected,
  onToggle,
}: {
  tech: TechTreeChainTech;
  isSelected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const statusClass = tech.isUnlocked
    ? "research-panel__tech-status--unlocked"
    : tech.isActive
      ? "research-panel__tech-status--active"
      : tech.canResearch
        ? "research-panel__tech-status--selectable"
        : "";

  const rowClass = [
    "research-panel__tech",
    tech.isActive ? "research-panel__tech--active" : "",
    tech.isUnlocked ? "research-panel__tech--unlocked" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const progressPercent = tech.effectiveThreshold > 0
    ? Math.min(100, Math.round((tech.progress / tech.effectiveThreshold) * 100))
    : 0;

  return (
    <div className={rowClass}>
      <div
        className={`research-panel__tech-status ${statusClass}`}
        onClick={() => {
          if (tech.canResearch && !tech.isUnlocked) {
            onToggle(!isSelected);
          }
        }}
        role={tech.canResearch && !tech.isUnlocked ? "checkbox" : undefined}
        aria-checked={tech.canResearch && !tech.isUnlocked ? isSelected : undefined}
      >
        {tech.isUnlocked ? "✓" : tech.isActive ? "⚡" : isSelected ? "◉" : "○"}
      </div>

      <div className="research-panel__tech-info">
        <div className="research-panel__tech-label">{tech.label}</div>

        {!tech.isUnlocked && (
          <div className="research-panel__tech-progress">
            <div className="research-panel__tech-bar">
              <div
                className={`research-panel__tech-bar-fill ${progressPercent >= 100 ? "research-panel__tech-bar-fill--complete" : ""}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="research-panel__tech-text">
              {tech.progress}/{tech.effectiveThreshold}
            </span>
          </div>
        )}

        {!tech.isUnlocked && tech.breakthroughAttempts > 0 && (
          <div className="research-panel__tech-meta">
            突破尝试 {tech.breakthroughAttempts} 次
            {tech.effectiveThreshold < tech.threshold && ` · 软保底生效 (${tech.threshold}→${tech.effectiveThreshold})`}
          </div>
        )}

        {tech.canResearch && !tech.isUnlocked && !tech.isActive && (
          <div className="research-panel__tech-meta">
            {isSelected ? "已选中，提交决策后开始研究" : "点击左侧 ○ 选择研究"}
          </div>
        )}

        {tech.isActive && (
          <div className="research-panel__tech-meta">⚡ 正在研究中</div>
        )}

        {!tech.canResearch && !tech.isUnlocked && (
          <div className="research-panel__tech-meta">🔒 需先完成前置科技</div>
        )}
      </div>
    </div>
  );
}
