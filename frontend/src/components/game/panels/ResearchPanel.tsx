import { getTechnologyLabel } from "../../../features/game/panelGlossary";
import type { TechTreeData, TechTreeChainTech } from "../../../types";
import "./ResearchPanel.css";

interface ResearchPanelProps {
  techTree: TechTreeData;
  selectedTechIds: Set<string>;
  onToggleTech: (techId: string, checked: boolean) => void;
}

export function ResearchPanel({
  techTree,
  selectedTechIds,
  onToggleTech,
}: ResearchPanelProps) {
  const { chains, researchFacilities, facilityCost, progressPerFacility, activeResearch } = techTree;

  return (
    <div className="research-panel">
      <div className="research-panel__header">
        <span className="research-panel__header-label">🔬 研究设施</span>
        <span className="research-panel__header-value">
          {researchFacilities} 所 · 每所 {progressPerFacility} 进度/回合 · 维护 {facilityCost} 财政/所
        </span>
      </div>

      {activeResearch && (
        <div className="research-panel__header">
          <span className="research-panel__header-label">⚡ 当前研究</span>
          <span className="research-panel__header-value">{getTechnologyLabel(activeResearch)}</span>
        </div>
      )}

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
        {tech.isUnlocked ? "✓" : tech.isActive ? "⚡" : isSelected ? "◉" : ""}
      </div>

      <div className="research-panel__tech-info">
        <div className="research-panel__tech-label">{getTechnologyLabel(tech.techId)}</div>

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

        {!tech.isDiscovered && !tech.isUnlocked && (
          <div className="research-panel__tech-meta">🔍 尚未发现</div>
        )}
      </div>
    </div>
  );
}
