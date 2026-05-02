import { useState } from "react";
import type { TalentBranchOption } from "../../../types";
import { buildEffectMetrics } from "../../../features/game/decisionShared";
import "./TalentTreePanel.css";

const BRANCH_META: Record<string, { icon: string; color: string }> = {
  industry:   { icon: "⚒️", color: "#4a9eff" },
  domestic:   { icon: "🏘️", color: "#68d391" },
  government: { icon: "🏛️", color: "#d4af37" },
  military:   { icon: "⚔️", color: "#fc8181" },
};

export interface TalentTreePanelProps {
  branches: TalentBranchOption[];
  projectedTechPoints: number;
  techCostPerPoint: number;
  unlockedTalentCount: number;
  selectedNodeIds: Set<string>;
  activeBranchId: string | null;
  onSelectBranch: (branchId: string | null) => void;
  onToggleNode: (nodeId: string, checked: boolean) => void;
}

export function TalentTreePanel({
  branches,
  projectedTechPoints,
  techCostPerPoint,
  selectedNodeIds,
  activeBranchId,
  onSelectBranch,
  onToggleNode,
}: TalentTreePanelProps) {
  const activeBranch = activeBranchId
    ? branches.find((b) => b.branchId === activeBranchId) ?? branches[0] ?? null
    : branches[0] ?? null;
  const effectiveBranchId = activeBranch?.branchId ?? null;

  return (
    <div className="talent-tree talent-tree--v2">
      <div className="talent-tree--v2__left">
        <div className="talent-tree__header">
          <h3 className="talent-tree__title">天赋分支</h3>
          <span className="talent-tree__budget">{projectedTechPoints} 科技点</span>
        </div>
        <p className="talent-tree__hint">
          科技点可在议会厅购买（{techCostPerPoint} 预算/点）。
        </p>
        <BranchList
          branches={branches}
          activeBranchId={effectiveBranchId}
          onSelect={onSelectBranch}
        />
      </div>

      <div className="talent-tree--v2__right">
        {activeBranch ? (
          <BranchDetail
            branch={activeBranch}
            projectedTechPoints={projectedTechPoints}
            selectedNodeIds={selectedNodeIds}
            onToggleNode={onToggleNode}
          />
        ) : (
          <p className="talent-tree__hint">暂无可用天赋分支。</p>
        )}
      </div>
    </div>
  );
}

function BranchList({
  branches,
  activeBranchId,
  onSelect,
}: {
  branches: TalentBranchOption[];
  activeBranchId: string | null;
  onSelect: (branchId: string) => void;
}) {
  return (
    <div className="talent-branches talent-branches--vertical">
      {branches.map((branch) => {
        const meta = BRANCH_META[branch.branchId] ?? { icon: "🔬", color: "#888" };
        const unlockedCount = branch.nodes.filter((n) => n.isUnlocked).length;
        const totalCost = branch.nodes.reduce((s, n) => s + n.techPointCost, 0);
        const capstone = branch.nodes[branch.nodes.length - 1];
        const progress = branch.nodes.length > 0 ? (unlockedCount / branch.nodes.length) * 100 : 0;
        const isActive = branch.branchId === activeBranchId;

        return (
          <button
            key={branch.branchId}
            className={`talent-branch-card ${isActive ? "talent-branch-card--active" : ""}`}
            style={{ "--branch-color": meta.color } as React.CSSProperties}
            onClick={() => onSelect(branch.branchId)}
            type="button"
            aria-pressed={isActive}
          >
            <span className="talent-branch-card__icon">{meta.icon}</span>
            <span className="talent-branch-card__name">{branch.label}</span>
            <div className="talent-branch-card__progress-bar">
              <div
                className="talent-branch-card__progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="talent-branch-card__info">
              {unlockedCount}/{branch.nodes.length} 已解锁 · {totalCost} 点
            </span>
            {capstone ? (
              <span className="talent-branch-card__info">
                终极：{capstone.label}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function BranchDetail({
  branch,
  projectedTechPoints,
  selectedNodeIds,
  onToggleNode,
}: {
  branch: TalentBranchOption;
  projectedTechPoints: number;
  selectedNodeIds: Set<string>;
  onToggleNode: (nodeId: string, checked: boolean) => void;
}) {
  const meta = BRANCH_META[branch.branchId] ?? { icon: "🔬", color: "#888" };
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  return (
    <div className="talent-detail" style={{ "--branch-color": meta.color } as React.CSSProperties}>
      <h4 className="talent-detail__branch-title">
        {meta.icon} {branch.label}分支
      </h4>

      {branch.nodes.map((node, index) => {
        const isSelected = selectedNodeIds.has(node.nodeId);
        const prerequisiteMet = index === 0
          || node.isUnlocked
          || branch.nodes[index - 1]?.isUnlocked
          || selectedNodeIds.has(branch.nodes[index - 1]?.nodeId ?? "");
        const canAfford = projectedTechPoints >= node.techPointCost;
        const canUnlock = !node.isUnlocked && prerequisiteMet && canAfford;

        const stateClass = node.isUnlocked
          ? "talent-node--unlocked"
          : canUnlock || isSelected
            ? "talent-node--available"
            : "talent-node--locked";

        const effectMetrics = buildEffectMetrics(node.permanentEffects);
        const isExpanded = expandedNodeId === node.nodeId;

        const lockReason = node.isUnlocked
          ? null
          : !prerequisiteMet
            ? `需先解锁「${branch.nodes[index - 1]?.label ?? "前置"}」`
            : !canAfford
              ? "科技点不足"
              : null;

        return (
          <div
            key={node.nodeId}
            className={`talent-node ${stateClass}`}
            onClick={() => setExpandedNodeId(isExpanded ? null : node.nodeId)}
          >
            <div className="talent-node__dot" />

            <div className="talent-node__body">
              <div className="talent-node__head">
                <h4 className="talent-node__name">
                  {node.isUnlocked ? "✅" : canUnlock ? "🔓" : "🔒"}{" "}
                  {node.label}
                </h4>
                <span className="talent-node__cost">{node.techPointCost} 点</span>
              </div>

              <div className="talent-node__effects">
                {effectMetrics.map((em) => (
                  <span key={em.label} className="talent-node__effect-tag">
                    {em.label} {em.value}
                  </span>
                ))}
              </div>

              {isExpanded && node.description ? (
                <p className="talent-tree__hint" style={{ marginTop: 8 }}>
                  {node.description}
                </p>
              ) : null}

              {lockReason ? (
                <p className="talent-node__lock-reason">{lockReason}</p>
              ) : null}
            </div>

            <div className="talent-node__action">
              {node.isUnlocked ? (
                <span className="talent-node__btn talent-node__btn--unlocked">
                  {"✓"} 已解锁
                </span>
              ) : isSelected ? (
                <button
                  className="talent-node__btn talent-node__btn--selected"
                  onClick={(e) => { e.stopPropagation(); onToggleNode(node.nodeId, false); }}
                  type="button"
                >
                  {"✓"} 已选择
                </button>
              ) : (
                <button
                  className="talent-node__btn"
                  disabled={!canUnlock}
                  onClick={(e) => { e.stopPropagation(); onToggleNode(node.nodeId, true); }}
                  type="button"
                >
                  解锁
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
