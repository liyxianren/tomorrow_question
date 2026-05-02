import { getTechnologyLabel as fallbackTechLabel } from "../../../features/game/panelGlossary";
import type { TechTreeData, TechTreeChainTech } from "../../../types";
import { DecisionStatStrip } from "./shared/DecisionStatStrip";
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
  const activeTechLabel = activeResearch
    ? chains.flatMap((c) => c.techs).find((t) => t.techId === activeResearch)?.label
    : undefined;

  return (
    <div className="research-panel">
      <DecisionStatStrip
        items={[
          {
            icon: "🔬",
            value: `${researchFacilities} 所 · 每所 ${progressPerFacility} 进度/回合 · 维护 ${facilityCost} 财政/所`,
            label: "研究设施",
          },
          {
            icon: "⚡",
            value: activeResearch
              ? (activeTechLabel ?? fallbackTechLabel(activeResearch))
              : "点击下方科技选择研究目标，提交决策后开始研究",
            label: "当前研究",
          },
        ]}
      />

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
