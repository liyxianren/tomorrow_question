import type { DecisionPlayerPhaseWorkspace, FactoryExpansionOption, FactoryNewFactoryOption, FactoryUpgradeOption } from "../../../../types";
import type { PhaseDraftByPhase } from "../../../../features/game/forms";
import {
  getProductionOrderQuantity,
  getRouteOrderQuantity,
} from "../../../../features/game/decisionDrafts";
import {
  calculateTechResearchPreview,
  flattenTechTree,
} from "../../../../features/game/decisionShared";
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
  const phase1Economy = workspace.phase1Economy;
  const phase1Assignments = draft.phase1Production?.rawMaterialAssignments ?? {};

  return (
    <section className="factory-panel" data-testid="factory-panel">
      <div className="factory-panel__header">
        <h3 className="factory-panel__title">🏭 工业区</h3>
        <span className="factory-panel__budget">工厂预算 {remainingFactoryBudget}</span>
      </div>

      {phase1Economy && phase1Economy.productionModes && phase1Economy.productionModes.length > 0 ? (
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
      ) : null}
    </section>
  );
}

/* ── Helpers (kept for external use) ── */

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

