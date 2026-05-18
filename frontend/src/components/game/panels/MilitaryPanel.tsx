import { useState } from "react";
import { useTranslation } from "react-i18next";
import { translateBackend } from "../../../i18n";
import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import type { ParameterInspector } from "../../../features/game/parameterInspector";
import { buildEffectMetrics } from "../../../features/game/decisionShared";
import { DecisionStatStrip } from "./shared/DecisionStatStrip";
import { DecisionActionCard } from "./shared/DecisionActionCard";
import { MilitaryWorldMap, type MapSelection } from "./military/MilitaryWorldMap";
import { MilitaryNodeDrawer } from "./military/MilitaryNodeDrawer";
import "./MilitaryPanel.css";

const ACTION_ICONS: Record<string, string> = {
  recruit_infantry: "🛡️",
  recruit_army: "🛡️",
  train_artillery: "💣",
  naval_drill: "⛵",
  build_fleet: "⚓",
  establish_americas: "🤝",
  establish_africa: "🤝",
  establish_middle_east: "🤝",
  establish_asia_pacific: "🤝",
};

function getVisibleArmyTotal(army: Record<string, number | undefined>): number {
  if (army.army !== undefined) {
    return Math.max(0, Math.floor(army.army));
  }
  return Object.values(army).reduce<number>(
    (sum, value) => sum + Math.max(0, Math.floor(value ?? 0)),
    0,
  );
}

export interface MilitaryPanelProps {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingGovernmentBudget: number;
  onAddMilitary: (actionId: string) => void;
  onRemoveMilitary: (actionId: string) => void;
  onToggleDiplomacy: (actionId: string, checked: boolean) => void;
  onToggleColonizationUnlock?: (checked: boolean) => void;
  onColonize?: (regionId: string) => void;
  onCancelColonize?: (regionId: string) => void;
  onNavalDeploymentChange: (nodeId: string, count: number) => void;
  onConquestChange?: (regionId: string, army: number) => void;
  onLootingToggle?: (regionId: string, resourceType: string) => void;
  parameterInspector?: ParameterInspector;
}

export function MilitaryPanel({
  workspace,
  draft,
  remainingGovernmentBudget,
  onAddMilitary,
  onRemoveMilitary,
  onToggleDiplomacy,
  onNavalDeploymentChange,
  parameterInspector,
}: MilitaryPanelProps) {
  const mil = workspace.militaryWorkspace;
  const getCount = (actionId: string) =>
    draft.militaryPlan.militaryActions.filter((a) => a.actionId === actionId).length;

  const totalFleets = mil.navy.fleets ?? 0;
  const armyTotal = getVisibleArmyTotal(mil.army);
  const oceanNodes = mil.oceanNodes ?? [];
  const navalDeployment = draft.militaryPlan.navalDeployment ?? {};
  const selectedFleetDelta = sumSelectedFleetDelta(mil.availableMilitaryActions, draft);
  const effectiveTotalFleets = Math.max(0, totalFleets + selectedFleetDelta);
  const totalDeployed = oceanNodes.reduce((sum, node) => {
    const draftCount = navalDeployment[node.nodeId];
    return sum + (typeof draftCount === "number" ? draftCount : node.myFleet);
  }, 0);
  const remainingFleets = Math.max(0, effectiveTotalFleets - totalDeployed);

  const diplomacyByRegion = new Map(
    mil.availableDiplomacyActions.map((a) => [a.targetRegion, a]),
  );

  const { t } = useTranslation();
  const [selectedNode, setSelectedNode] = useState<MapSelection>(null);

  return (
    <div className="military-panel" data-testid="military-panel">
      <div className="military-panel__header">
        <h3 className="military-panel__title">⚔️ {t("game:military.title")}</h3>
        <span className="military-panel__budget">
          {t("game:government.budget", "政府财政")} {remainingGovernmentBudget}
        </span>
      </div>

      <DecisionStatStrip
        items={[
          { icon: "🛡️", value: `${armyTotal}/${mil.armyCap ?? 3}`, label: t("game:military.army") },
          { icon: "⛵", value: `${remainingFleets}/${effectiveTotalFleets}`, label: t("game:military.availableFleets", "可用舰队") },
          { icon: "🌍", value: mil.overseasCapacity, label: t("game:military.overseasCapacity") },
          { icon: "🏳️", value: mil.establishedDiplomacy.length, label: t("game:military.establishedDiplomacy") },
        ]}
      />
      <p className="military-panel__rule-note">
        {t("game:military.fleetRuleNote")}
      </p>

      <h4 className="military-section-label">🌐 {t("game:military.worldMap")}</h4>
      <div className="mwm-stage">
        <MilitaryWorldMap
          oceanNodes={oceanNodes}
          regionAccessStatus={mil.regionAccessStatus}
          navalDeployment={navalDeployment}
          myCountry={workspace.countryCode}
          selectedNode={selectedNode}
          totalFleets={effectiveTotalFleets}
          remainingFleets={remainingFleets}
          oceanControlThreshold={mil.oceanControlThreshold ?? 2}
          onPinSelect={setSelectedNode}
          onNavalDeploymentChange={onNavalDeploymentChange}
        />
        <div className="mnd-overlay" aria-label={t("game:military.regionDetail")}>
          {mil.regionAccessStatus.map((region) => {
            const diplomacyAction = diplomacyByRegion.get(region.regionId) ?? null;
            const diplomacySelected = diplomacyAction
              ? draft.militaryPlan.diplomacyActions.some((a) => a.actionId === diplomacyAction.actionId)
              : false;
            const isOpen = selectedNode?.type === "region" && selectedNode?.id === region.regionId;
            return (
              <MilitaryNodeDrawer
                key={`region-${region.regionId}`}
                nodeType="region"
                nodeId={region.regionId}
                open={isOpen}
                onClose={() => setSelectedNode(null)}
                region={region}
                diplomacyAction={diplomacyAction}
                diplomacySelected={diplomacySelected}
                remainingGovernmentBudget={remainingGovernmentBudget}
                onToggleDiplomacy={onToggleDiplomacy}
                parameterInspector={parameterInspector}
              />
            );
          })}
          {oceanNodes.map((node) => {
            const draftCount = navalDeployment[node.nodeId];
            const myFleet = typeof draftCount === "number" ? draftCount : node.myFleet;
            const previewNode = createOceanNodeDeploymentPreview(
              node,
              workspace.countryCode,
              myFleet,
              mil.oceanControlThreshold ?? 2,
            );
            const isOpen = selectedNode?.type === "ocean" && selectedNode?.id === node.nodeId;
            return (
              <MilitaryNodeDrawer
                key={`ocean-${node.nodeId}`}
                nodeType="ocean"
                nodeId={node.nodeId}
                open={isOpen}
                onClose={() => setSelectedNode(null)}
                oceanNode={previewNode}
                myFleet={myFleet}
                remainingFleets={remainingFleets}
                myCountry={workspace.countryCode}
                onNavalDeploymentChange={onNavalDeploymentChange}
              />
            );
          })}
        </div>
      </div>

      <h4 className="military-section-label">🛡️ {t("game:military.militaryActions")}</h4>
      <div className="military-actions">
        {mil.availableMilitaryActions.map((action) => {
          const count = getCount(action.actionId);
          const canAdd = count < action.maxPerRound && remainingGovernmentBudget >= action.cost;
          const effectMetrics = buildEffectMetrics(action.effects);
          const status = count > 0
            ? "selected"
            : !canAdd
              ? "disabled"
              : "available";

          return (
            <DecisionActionCard
              key={action.actionId}
              icon={ACTION_ICONS[action.actionId] ?? "⚙️"}
              title={translateBackend(action.label)}
              costLabel={`${action.cost} ${t("game:government.budget")}`}
              description={translateBackend(action.description)}
              effects={effectMetrics}
              status={status}
              statusText={`${count}/${action.maxPerRound}`}
              control={{
                kind: "confirm-cancel",
                isSelected: count > 0,
                isDisabled: !canAdd,
                onConfirm: () => onAddMilitary(action.actionId),
                onCancel: () => onRemoveMilitary(action.actionId),
                confirmLabel: "+",
                cancelLabel: "-",
                confirmAriaLabel: t("game:military.confirmAction", { label: translateBackend(action.label) }),
                cancelAriaLabel: t("game:military.revokeAction", { label: translateBackend(action.label) }),
                hideCancelWhenNotSelected: true,
              }}
            >
              {parameterInspector?.render(`military.action.${action.actionId}`, {
                title: translateBackend(action.label),
                currentEffect: translateBackend(action.description),
              })}
            </DecisionActionCard>
          );
        })}
      </div>
    </div>
  );
}

function sumSelectedFleetDelta(
  actions: DecisionPlayerPhaseWorkspace["militaryWorkspace"]["availableMilitaryActions"],
  draft: PhaseDraftByPhase["decision"],
): number {
  return draft.militaryPlan.militaryActions.reduce((sum, selection) => {
    const action = actions.find((item) => item.actionId === selection.actionId);
    const navyDelta = action?.effects?.navyDelta;
    if (!navyDelta || typeof navyDelta !== "object" || !("fleets" in navyDelta)) {
      return sum;
    }
    const fleets = (navyDelta as Record<string, unknown>).fleets;
    return sum + (typeof fleets === "number" ? fleets : 0);
  }, 0);
}

function createOceanNodeDeploymentPreview(
  node: NonNullable<DecisionPlayerPhaseWorkspace["militaryWorkspace"]["oceanNodes"]>[number],
  myCountry: DecisionPlayerPhaseWorkspace["countryCode"],
  myFleet: number,
  controlThreshold: number,
) {
  const navyByCountry = { ...(node.navyByCountry ?? {}) };
  if (myFleet > 0) {
    navyByCountry[myCountry] = myFleet;
  } else {
    delete navyByCountry[myCountry];
  }

  const ranked = Object.entries(navyByCountry)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);
  const [topCountry, topCount] = ranked[0] ?? [null, 0];
  const runnerUpCount = ranked[1]?.[1] ?? 0;
  const controller = topCountry && topCount >= controlThreshold && topCount > runnerUpCount
    ? topCountry
    : null;

  return {
    ...node,
    myFleet,
    navyByCountry,
    controller,
    isBlockaded: controller !== null,
  };
}
