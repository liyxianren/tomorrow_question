import { useState } from "react";
import type { TalentBranchOption } from "../../../types";
import { buildEffectMetrics } from "../../../features/game/decisionShared";
import "./TalentTreePanel.css";

const BRANCH_META: Record<string, { icon: string; color: string }> = {
  industry:   { icon: "\u2692\uFE0F", color: "#4a9eff" },
  domestic:   { icon: "\uD83C\uDFD8\uFE0F", color: "#68d391" },
  government: { icon: "\uD83C\uDFDB\uFE0F", color: "#d4af37" },
  military:   { icon: "\u2694\uFE0F", color: "#fc8181" },
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
  unlockedTalentCount,
  selectedNodeIds,
  activeBranchId,
  onSelectBranch,
  onToggleNode,
}: TalentTreePanelProps) {
  const activeBranch = activeBranchId
    ? branches.find((b) => b.branchId === activeBranchId) ?? null
    : null;

  return (
    <div className="talent-tree">
      {/* Header */}
      <div className="talent-tree__header">
        <h3 className="talent-tree__title">
          {activeBranch ? `${BRANCH_META[activeBranch.branchId]?.icon ?? ""} ${activeBranch.label}分支` : "天赋树"}
        </h3>
        <span className="talent-tree__budget">
          {projectedTechPoints} 科技点
        </span>
      </div>

      <p className="talent-tree__hint">
        {activeBranch
          ? "按顺序解锁天赋节点，每个节点提供永久增益。"
          : `选择一条研究方向查看天赋详情。科技点可在议会厅购买（${techCostPerPoint}预算/点）。`}
      </p>

      {/* Branch selection or detail */}
      {activeBranch ? (
        <BranchDetail
          branch={activeBranch}
          projectedTechPoints={projectedTechPoints}
          selectedNodeIds={selectedNodeIds}
          onBack={() => onSelectBranch(null)}
          onToggleNode={onToggleNode}
        />
      ) : (
        <BranchGrid
          branches={branches}
          onSelect={(id) => onSelectBranch(id)}
        />
      )}
    </div>
  );
}

/* ── Branch Selection Grid ── */

function BranchGrid({
  branches,
  onSelect,
}: {
  branches: TalentBranchOption[];
  onSelect: (branchId: string) => void;
}) {
  return (
    <div className="talent-branches">
      {branches.map((branch) => {
        const meta = BRANCH_META[branch.branchId] ?? { icon: "\uD83D\uDD2C", color: "#888" };
        const unlockedCount = branch.nodes.filter((n) => n.isUnlocked).length;
        const totalCost = branch.nodes.reduce((s, n) => s + n.techPointCost, 0);
        const capstone = branch.nodes[branch.nodes.length - 1];
        const progress = branch.nodes.length > 0 ? (unlockedCount / branch.nodes.length) * 100 : 0;

        return (
          <button
            key={branch.branchId}
            className="talent-branch-card"
            style={{ "--branch-color": meta.color } as React.CSSProperties}
            onClick={() => onSelect(branch.branchId)}
            type="button"
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

/* ── Branch Detail: Node Chain ── */

function BranchDetail({
  branch,
  projectedTechPoints,
  selectedNodeIds,
  onBack,
  onToggleNode,
}: {
  branch: TalentBranchOption;
  projectedTechPoints: number;
  selectedNodeIds: Set<string>;
  onBack: () => void;
  onToggleNode: (nodeId: string, checked: boolean) => void;
}) {
  const meta = BRANCH_META[branch.branchId] ?? { icon: "\uD83D\uDD2C", color: "#888" };
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  return (
    <div className="talent-detail" style={{ "--branch-color": meta.color } as React.CSSProperties}>
      <button className="talent-detail__back" onClick={onBack} type="button">
        {"<"} 返回分支选择
      </button>

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
                  {node.isUnlocked ? "\u2705" : canUnlock ? "\uD83D\uDD13" : "\uD83D\uDD12"}{" "}
                  {node.label}
                </h4>
                <span className="talent-node__cost">{node.techPointCost} 点</span>
              </div>

              {/* Effect tags - always visible */}
              <div className="talent-node__effects">
                {effectMetrics.map((em) => (
                  <span key={em.label} className="talent-node__effect-tag">
                    {em.label} {em.value}
                  </span>
                ))}
              </div>

              {/* Expanded detail */}
              {isExpanded && node.description ? (
                <p className="talent-tree__hint" style={{ marginTop: 8 }}>
                  {node.description}
                </p>
              ) : null}

              {/* Lock reason */}
              {lockReason ? (
                <p className="talent-node__lock-reason">{lockReason}</p>
              ) : null}
            </div>

            {/* Action button */}
            <div className="talent-node__action">
              {node.isUnlocked ? (
                <span className="talent-node__btn talent-node__btn--unlocked">
                  {"\u2713"} 已解锁
                </span>
              ) : isSelected ? (
                <button
                  className="talent-node__btn talent-node__btn--selected"
                  onClick={(e) => { e.stopPropagation(); onToggleNode(node.nodeId, false); }}
                  type="button"
                >
                  {"\u2713"} 已选择
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
