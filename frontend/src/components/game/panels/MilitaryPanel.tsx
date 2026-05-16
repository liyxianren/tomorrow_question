import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import { buildEffectMetrics, calculateGovernmentPointPreview } from "../../../features/game/decisionShared";
import { DecisionStatStrip } from "./shared/DecisionStatStrip";
import { DecisionActionCard } from "./shared/DecisionActionCard";
import { MilitaryWorldMap, type MapSelection } from "./military/MilitaryWorldMap";
import { MilitaryNodeDrawer } from "./military/MilitaryNodeDrawer";
import "./MilitaryPanel.css";

const ACTION_ICONS: Record<string, string> = {
  recruit_infantry: "🛡️",
  train_artillery: "💣",
  naval_drill: "⛵",
  establish_americas: "🤝",
  establish_africa: "🤝",
  establish_middle_east: "🤝",
  establish_asia_pacific: "🤝",
};

export interface MilitaryPanelProps {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingGovernmentBudget: number;
  onAddMilitary: (actionId: string) => void;
  onRemoveMilitary: (actionId: string) => void;
  onToggleDiplomacy: (actionId: string, checked: boolean) => void;
  onToggleColonizationUnlock: (checked: boolean) => void;
  onColonize: (regionId: string) => void;
  onCancelColonize: (regionId: string) => void;
  onNavalDeploymentChange: (nodeId: string, count: number) => void;
  onConquestChange: (regionId: string, infantry: number, artillery: number) => void;
  onLootingToggle: (regionId: string, resourceType: string) => void;
}

export function MilitaryPanel({
  workspace,
  draft,
  remainingGovernmentBudget,
  onAddMilitary,
  onRemoveMilitary,
  onToggleDiplomacy,
  onToggleColonizationUnlock,
  onColonize,
  onCancelColonize,
  onNavalDeploymentChange,
  onConquestChange,
  onLootingToggle,
}: MilitaryPanelProps) {
  const mil = workspace.militaryWorkspace;
  const capability = mil.colonizationCapability;
  const unlockSelected = draft.militaryPlan.unlockColonization;
  const previewIsUnlocked = capability.isUnlocked || unlockSelected;
  const previewEstablishedDiplomacy = new Set([
    ...mil.establishedDiplomacy,
    ...mil.availableDiplomacyActions
      .filter((action) => draft.militaryPlan.diplomacyActions.some((selection) => selection.actionId === action.actionId))
      .map((action) => action.targetRegion),
  ]);
  const getCount = (actionId: string) =>
    draft.militaryPlan.militaryActions.filter((a) => a.actionId === actionId).length;

  const totalFleets = mil.navy.fleets ?? 0;
  const oceanNodes = mil.oceanNodes ?? [];
  const navalDeployment = draft.militaryPlan.navalDeployment ?? {};
  const selectedFleetDelta = sumSelectedFleetDelta(mil.availableMilitaryActions, draft);
  const effectiveTotalFleets = Math.max(0, totalFleets + selectedFleetDelta);
  const availableMilitaryPoints = calculateGovernmentPointPreview(workspace, draft).militaryPoints;
  const selectedMilitaryPointSpend = draft.militaryPlan.militaryActions.reduce((sum, selection) => {
    const action = mil.availableMilitaryActions.find((item) => item.actionId === selection.actionId);
    return sum + (action?.cost ?? 0);
  }, 0);
  const selectedColonizationPointSpend = draft.militaryPlan.colonizationActions.length * capability.militaryPointCost;
  const remainingMilitaryPoints = Math.max(
    0,
    availableMilitaryPoints - selectedMilitaryPointSpend - selectedColonizationPointSpend,
  );
  const totalDeployed = oceanNodes.reduce((sum, node) => {
    const draftCount = navalDeployment[node.nodeId];
    return sum + (typeof draftCount === "number" ? draftCount : node.myFleet);
  }, 0);
  const remainingFleets = Math.max(0, effectiveTotalFleets - totalDeployed);

  const conquestActions = draft.militaryPlan.conquestActions ?? [];
  const lootingActions = draft.militaryPlan.lootingActions ?? [];
  const colonizationByRegion = new Map(mil.colonizationOptions.map((o) => [o.regionId, o]));
  const diplomacyByRegion = new Map(
    mil.availableDiplomacyActions.map((a) => [a.targetRegion, a]),
  );
  const conquestByRegion = new Map(conquestActions.map((a) => [a.regionId, a]));
  const maxInfantryAvailable = Math.max(0, Math.floor(mil.army.infantry ?? 0));
  const maxArtilleryAvailable = Math.max(0, Math.floor(mil.army.artillery ?? 0));

  const { t } = useTranslation();
  const [selectedNode, setSelectedNode] = useState<MapSelection>(null);

  return (
    <div className="military-panel" data-testid="military-panel">
      <div className="military-panel__header">
        <h3 className="military-panel__title">⚔️ {t("game:military.title")}</h3>
        <span className="military-panel__budget">{t("game:military.militaryPointsRemaining")} {remainingMilitaryPoints}</span>
      </div>

      <DecisionStatStrip
        items={[
          { icon: "⚔️", value: availableMilitaryPoints, label: t("game:military.militaryPoints") },
          { icon: "⛵", value: selectedFleetDelta > 0 ? `${totalFleets}+${selectedFleetDelta}` : totalFleets, label: t("game:military.deployableFleets") },
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
          colonizationOptions={mil.colonizationOptions}
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
            const opt = colonizationByRegion.get(region.regionId) ?? null;
            const diplomacyAction = diplomacyByRegion.get(region.regionId) ?? null;
            const diplomacySelected = diplomacyAction
              ? draft.militaryPlan.diplomacyActions.some((a) => a.actionId === diplomacyAction.actionId)
              : false;
            const colonizationSelected = draft.militaryPlan.colonizationActions.some(
              (a) => a.targetRegionId === region.regionId,
            );
            const previewHasDiplomacy = previewEstablishedDiplomacy.has(region.regionId);
            const conquestEntry = conquestByRegion.get(region.regionId) ?? null;
            const lootedSet = new Set(
              lootingActions.filter((a) => a.regionId === region.regionId).map((a) => a.resourceType),
            );
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
                colonizationOption={opt}
                capability={capability}
                previewIsUnlocked={previewIsUnlocked}
                previewHasDiplomacy={previewHasDiplomacy}
                militaryPoints={remainingMilitaryPoints}
                remainingGovernmentBudget={remainingGovernmentBudget}
                colonizationSelected={colonizationSelected}
                conquestEntry={conquestEntry}
                lootedSet={lootedSet}
                maxInfantryAvailable={maxInfantryAvailable}
                maxArtilleryAvailable={maxArtilleryAvailable}
                onToggleDiplomacy={onToggleDiplomacy}
                onColonize={onColonize}
                onCancelColonize={onCancelColonize}
                onConquestChange={onConquestChange}
                onLootingToggle={onLootingToggle}
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

      <h4 className="military-section-label">👑 {t("game:military.colonizationTitle")}</h4>
      <div className="military-actions">
        {(() => {
          const unlockStatus = capability.isUnlocked
            ? "done"
            : previewIsUnlocked
              ? "selected"
              : remainingGovernmentBudget < capability.unlockCost
                ? "disabled"
                : "available";
          const statusText = capability.isUnlocked
            ? "✅ " + t("game:military.permanentlyUnlocked")
            : unlockSelected
              ? "✓ " + t("game:military.unlockThisRound")
              : t("game:military.notUnlocked");
          return (
            <DecisionActionCard
              icon="👑"
              title={t("game:military.colonizationTitle")}
              costLabel={`${capability.unlockCost} ${t("game:government.budget")}`}
              description={t("game:military.colonizationDesc", { cost: capability.unlockCost, pointCost: capability.militaryPointCost })}
              status={unlockStatus}
              statusText={statusText}
              control={capability.isUnlocked ? undefined : {
                kind: "toggle",
                checked: unlockSelected,
                onChange: (next) => onToggleColonizationUnlock(next),
                label: unlockSelected ? t("common:cancel") : t("common:unlock"),
                disabled: !unlockSelected && remainingGovernmentBudget < capability.unlockCost,
              }}
              doneBadge={capability.isUnlocked ? t("common:unlock") : undefined}
            />
          );
        })()}
      </div>

      <h4 className="military-section-label">🛡️ {t("game:military.militaryActions")}</h4>
      <div className="military-actions">
        {mil.availableMilitaryActions.map((action) => {
          const count = getCount(action.actionId);
          const canAdd = count < action.maxPerRound && remainingMilitaryPoints >= action.cost;
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
              title={action.label}
              costLabel={`${action.cost} ${t("game:military.militaryPoints")}`}
              description={action.description}
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
                confirmAriaLabel: t("game:military.confirmAction", { label: action.label }),
                cancelAriaLabel: t("game:military.revokeAction", { label: action.label }),
                hideCancelWhenNotSelected: true,
              }}
            />
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
