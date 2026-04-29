import type { DecisionPlayerPhaseWorkspace, FactoryExpansionOption, FactoryNewFactoryOption, FactoryProductionOption, FactoryUpgradeOption, TechTreeNode } from "../../../../types";
import type { PhaseDraftByPhase } from "../../../../features/game/forms";
import {
  getAllocatedProductionBatchesForRoute,
  getProductionOrderQuantity,
  getRouteOrderQuantity,
} from "../../../../features/game/decisionDrafts";
import {
  calculateDecisionSpendSummary,
  calculateTechResearchPreview,
  flattenTechTree,
  formatPriceTrendText,
} from "../../../../features/game/decisionShared";
import { FactoryRouteLane } from "./FactoryRouteLane";
import { FactoryConstructionPanel } from "./FactoryConstructionPanel";
import { FactoryTechPanel } from "./FactoryTechPanel";
import { FactoryIntelPanel } from "./FactoryIntelPanel";
import { Phase1ProductionPanel } from "./Phase1ProductionPanel";
import "./FactoryPanel.css";

export function FactoryPanel({
  workspace,
  draft,
  remainingFactoryBudget,
  onProductionQuantityChange,
  onConstructionQuantityChange,
  onTechnologyToggle,
  onPhase1RawMaterialAssignmentChange,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingFactoryBudget: number;
  onProductionQuantityChange: (goodsId: string, quantity: number) => void;
  onConstructionQuantityChange: (
    routeId: string,
    kind: "expansion" | "upgrade" | "newFactory",
    quantity: number,
  ) => void;
  onTechnologyToggle: (techId: string, checked: boolean) => void;
  onPhase1RawMaterialAssignmentChange?: (mode: string, quantity: number) => void;
}) {
  const techPreview = calculateTechResearchPreview(workspace, draft);
  const scheduledBatches = draft.factoryPlan.productionOrders.reduce((sum, item) => sum + item.quantity, 0);
  const constructionOrders =
    draft.factoryPlan.expansionOrders.reduce((sum, item) => sum + item.quantity, 0)
    + draft.factoryPlan.upgradeOrders.reduce((sum, item) => sum + item.quantity, 0)
    + draft.factoryPlan.newFactoryOrders.reduce((sum, item) => sum + item.quantity, 0);
  const nextCapacityDelta = calculateNextCapacityDelta(workspace, draft);

  const routeSignals = workspace.routeSummaries.map((summary) => {
    const allocated = getAllocatedProductionBatchesForRoute(draft, workspace.productionOptions, summary.routeId);
    return {
      routeId: summary.routeId,
      routeLabel: summary.routeLabel,
      currentCapacity: summary.currentCapacity,
      pendingCapacity: summary.pendingCapacity,
      remainingBatches: Math.max(summary.availableBatchesThisRound - allocated, 0),
      totalBatches: summary.availableBatchesThisRound,
    };
  });

  const availableProductionOptions = workspace.productionOptions.filter(
    (option) => resolveProductionLockedReason(option, workspace, techPreview.unlockedTechIds) === null,
  );
  const lockedProductionOptions = workspace.productionOptions.filter(
    (option) => resolveProductionLockedReason(option, workspace, techPreview.unlockedTechIds) !== null,
  );

  const factoryTechs = flattenTechTree(workspace.techTree).filter((tech) => "budgetPool" in tech && tech.budgetPool === "factory");

  const phase1Economy = workspace.phase1Economy;
  const phase1Assignments = draft.phase1Production?.rawMaterialAssignments ?? {};

  return (
    <section className="factory-panel" data-testid="factory-panel">
      <div className="factory-panel__header">
        <h3 className="factory-panel__title">🏭 工业区</h3>
        <span className="factory-panel__budget">工厂预算 {remainingFactoryBudget}</span>
      </div>

      {phase1Economy && phase1Economy.productionModes && phase1Economy.productionModes.length > 0 ? (
        <>
          <h3 className="factory-section-label">🏭 产能结构（2.0）</h3>
          <Phase1ProductionPanel
            modes={phase1Economy.productionModes}
            rawMaterials={phase1Economy.rawMaterials}
            investmentPool={phase1Economy.investmentPool}
            domesticDemand={phase1Economy.domesticDemand}
            equilibriumPrice={phase1Economy.equilibriumPrice}
            domesticPricePreview={phase1Economy.domesticPricePreview}
            goodsInventory={phase1Economy.goodsInventory}
            assignments={phase1Assignments}
            onAssignmentChange={onPhase1RawMaterialAssignmentChange}
          />
        </>
      ) : null}

      <h3 className="factory-section-label">工业总览</h3>
      <div className="factory-stats">
        <div className="factory-stat">
          <span className="factory-stat__icon">💰</span>
          <span className="factory-stat__value">{`工厂预算剩余 ${remainingFactoryBudget}`}</span>
        </div>
        <div className="factory-stat">
          <span className="factory-stat__icon">📦</span>
          <span className="factory-stat__value">{scheduledBatches}</span>
          <span className="factory-stat__label">排产批次</span>
        </div>
        <div className="factory-stat">
          <span className="factory-stat__icon">🏗️</span>
          <span className="factory-stat__value">{constructionOrders}</span>
          <span className="factory-stat__label">建设订单</span>
        </div>
        <div className="factory-stat">
          <span className="factory-stat__icon">📈</span>
          <span className="factory-stat__value">{`下回合产能变化 ${formatSignedValue(nextCapacityDelta)}`}</span>
        </div>
      </div>

      <div className="factory-route-pills">
        {routeSignals.map((route) => (
          <article key={route.routeId} className="factory-route-pill">
            <span className="factory-route-pill__name">{route.routeLabel}</span>
            <span className="factory-route-pill__batches">{`${route.routeLabel}剩余 ${route.remainingBatches} / ${route.totalBatches} 批`}</span>
            <span className="factory-route-pill__meta">
              当前产能 {route.currentCapacity} · 下回合 {route.pendingCapacity >= 0 ? `+${route.pendingCapacity}` : route.pendingCapacity}
            </span>
          </article>
        ))}
      </div>

      <h3 className="factory-section-label">产线排程</h3>
      {routeSignals.map((route) => {
        const routeOptions = availableProductionOptions.filter((opt) => opt.routeId === route.routeId);
        return (
          <FactoryRouteLane
            key={route.routeId}
            routeId={route.routeId}
            routeLabel={route.routeLabel}
            currentCapacity={route.currentCapacity}
            pendingCapacity={route.pendingCapacity}
            remainingBatches={route.remainingBatches}
            totalBatches={route.totalBatches}
            productionOptions={routeOptions}
            draft={draft}
            remainingBudget={remainingFactoryBudget}
            onQuantityChange={onProductionQuantityChange}
          />
        );
      })}

      <FactoryConstructionPanel
        expansionOptions={workspace.expansionOptions}
        upgradeOptions={workspace.upgradeOptions}
        newFactoryOptions={workspace.newFactoryOptions}
        draft={draft}
        remainingBudget={remainingFactoryBudget}
        unlockedTechIds={techPreview.unlockedTechIds}
        workspace={workspace}
        onQuantityChange={onConstructionQuantityChange}
      />

      <FactoryTechPanel
        techs={factoryTechs}
        techPreview={techPreview}
        workspace={workspace}
        draft={draft}
        onToggle={onTechnologyToggle}
      />

      <FactoryIntelPanel
        items={lockedProductionOptions.map((option) => ({
          id: `intel-${option.goodsId}`,
          title: option.label,
          routeLabel: option.routeLabel,
          lockedReason: resolveProductionLockedReason(option, workspace, techPreview.unlockedTechIds) ?? "",
          description: option.usageHint,
          badges: [
            `适配路线 ${option.routeLabel}`,
            `国内 ${option.domesticReferencePrice}`,
            `海外 ${option.overseasReferencePriceMin}-${option.overseasReferencePriceMax}`,
            formatPriceTrendText(option.priceTrend, option.priceAdjustment),
          ],
        }))}
      />
    </section>
  );
}

/* ── Helpers (moved from viewModel.ts) ── */

export function resolveProductionLockedReason(
  option: FactoryProductionOption,
  workspace: DecisionPlayerPhaseWorkspace,
  unlockedTechIds: Set<string>,
): string | null {
  if (!option.lockedReason) {
    return null;
  }
  const unlockedByResearch = flattenTechTree(workspace.techTree).some(
    (tech) =>
      unlockedTechIds.has(tech.techId)
      && (tech.unlocksGoods.includes(option.goodsId) || tech.unlocksRoutes.includes(option.routeId)),
  );
  return unlockedByResearch ? null : option.lockedReason;
}

export function resolveRouteLockedReason(
  routeId: string,
  lockedReason: string | null,
  workspace: DecisionPlayerPhaseWorkspace,
  unlockedTechIds: Set<string>,
): string | null {
  if (!lockedReason) {
    return null;
  }
  const unlockedByResearch = flattenTechTree(workspace.techTree).some(
    (tech) => unlockedTechIds.has(tech.techId) && tech.unlocksRoutes.includes(routeId),
  );
  return unlockedByResearch ? null : lockedReason;
}

export function getConstructionQuantity(
  draft: PhaseDraftByPhase["decision"],
  routeId: string,
  kind: "expansion" | "upgrade" | "newFactory",
): number {
  if (kind === "expansion") {
    return getRouteOrderQuantity(draft.factoryPlan.expansionOrders, routeId);
  }
  if (kind === "upgrade") {
    return getRouteOrderQuantity(draft.factoryPlan.upgradeOrders, routeId);
  }
  return getRouteOrderQuantity(draft.factoryPlan.newFactoryOrders, routeId);
}

export function getConstructionTitle(
  option: FactoryExpansionOption | FactoryUpgradeOption | FactoryNewFactoryOption,
  kind: "expansion" | "upgrade" | "newFactory",
): string {
  if (kind === "expansion") {
    return `扩产 ${option.routeLabel}`;
  }
  if (kind === "upgrade") {
    return `升级到 ${option.routeLabel}`;
  }
  return `新建 ${option.routeLabel} 工厂`;
}

export function getConstructionKindLabel(kind: "expansion" | "upgrade" | "newFactory"): string {
  switch (kind) {
    case "expansion": return "扩产";
    case "upgrade": return "升级";
    case "newFactory": return "新建";
    default: return kind;
  }
}

function calculateNextCapacityDelta(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): number {
  const expansionDelta = draft.factoryPlan.expansionOrders.reduce((sum, item) => {
    const option = workspace.expansionOptions.find((c) => c.routeId === item.routeId);
    return sum + item.quantity * (option?.capacityDelta ?? 0);
  }, 0);
  const upgradeDelta = draft.factoryPlan.upgradeOrders.reduce((sum, item) => {
    const option = workspace.upgradeOptions.find((c) => c.routeId === item.routeId);
    return sum + item.quantity * (option?.capacityDelta ?? 0);
  }, 0);
  const newFactoryDelta = draft.factoryPlan.newFactoryOrders.reduce((sum, item) => {
    const option = workspace.newFactoryOptions.find((c) => c.routeId === item.routeId);
    return sum + item.quantity * (option?.capacityDelta ?? 0);
  }, 0);
  return expansionDelta + upgradeDelta + newFactoryDelta;
}

function formatSignedValue(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
