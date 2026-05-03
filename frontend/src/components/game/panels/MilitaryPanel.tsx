import { useState } from "react";
import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import { buildEffectMetrics } from "../../../features/game/decisionShared";
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
  const totalDeployed = oceanNodes.reduce((sum, node) => {
    const draftCount = navalDeployment[node.nodeId];
    return sum + (typeof draftCount === "number" ? draftCount : node.myFleet);
  }, 0);
  const remainingFleets = Math.max(0, totalFleets - totalDeployed);

  const conquestActions = draft.militaryPlan.conquestActions ?? [];
  const lootingActions = draft.militaryPlan.lootingActions ?? [];
  const colonizationByRegion = new Map(mil.colonizationOptions.map((o) => [o.regionId, o]));
  const diplomacyByRegion = new Map(
    mil.availableDiplomacyActions.map((a) => [a.targetRegion, a]),
  );
  const conquestByRegion = new Map(conquestActions.map((a) => [a.regionId, a]));
  const maxInfantryByPoints = Math.floor(mil.militaryPoints / 10);
  const maxArtilleryByBudget = Math.floor(remainingGovernmentBudget / 16);

  const [selectedNode, setSelectedNode] = useState<MapSelection>(null);

  return (
    <div className="military-panel" data-testid="military-panel">
      <div className="military-panel__header">
        <h3 className="military-panel__title">⚔️ 军事要塞</h3>
        <span className="military-panel__budget">财政 {remainingGovernmentBudget}</span>
      </div>

      <DecisionStatStrip
        items={[
          { icon: "⚔️", value: mil.militaryPoints, label: "军事点" },
          { icon: "⛵", value: mil.navy.fleets ?? 0, label: "舰队" },
          { icon: "🌍", value: mil.overseasCapacity, label: "海外承接" },
          { icon: "🏳️", value: mil.establishedDiplomacy.length, label: "已建交" },
        ]}
      />

      <h4 className="military-section-label">🌐 世界地图</h4>
      <div className="mwm-stage">
        <MilitaryWorldMap
          oceanNodes={oceanNodes}
          regionAccessStatus={mil.regionAccessStatus}
          colonizationOptions={mil.colonizationOptions}
          navalDeployment={navalDeployment}
          myCountry={workspace.countryCode}
          selectedNode={selectedNode}
          totalFleets={totalFleets}
          remainingFleets={remainingFleets}
          onPinSelect={setSelectedNode}
          onNavalDeploymentChange={onNavalDeploymentChange}
        />
        <div className="mnd-overlay" aria-label="区域详情">
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
                militaryPoints={mil.militaryPoints}
                remainingGovernmentBudget={remainingGovernmentBudget}
                colonizationSelected={colonizationSelected}
                conquestEntry={conquestEntry}
                lootedSet={lootedSet}
                maxInfantryByPoints={maxInfantryByPoints}
                maxArtilleryByBudget={maxArtilleryByBudget}
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
            const isOpen = selectedNode?.type === "ocean" && selectedNode?.id === node.nodeId;
            return (
              <MilitaryNodeDrawer
                key={`ocean-${node.nodeId}`}
                nodeType="ocean"
                nodeId={node.nodeId}
                open={isOpen}
                onClose={() => setSelectedNode(null)}
                oceanNode={node}
                myFleet={myFleet}
                remainingFleets={remainingFleets}
                myCountry={workspace.countryCode}
                onNavalDeploymentChange={onNavalDeploymentChange}
              />
            );
          })}
        </div>
      </div>

      <h4 className="military-section-label">👑 殖民扩张</h4>
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
            ? "✅ 已永久解锁"
            : unlockSelected
              ? "✓ 本轮解锁"
              : "未解锁";
          return (
            <DecisionActionCard
              icon="👑"
              title="殖民扩张"
              costLabel={`${capability.unlockCost} 政府财政`}
              description={`支付 ${capability.unlockCost} 政府财政永久解锁殖民能力。解锁后，殖民执行只消耗 ${capability.militaryPointCost} 军事点。`}
              status={unlockStatus}
              statusText={statusText}
              control={capability.isUnlocked ? undefined : {
                kind: "toggle",
                checked: unlockSelected,
                onChange: (next) => onToggleColonizationUnlock(next),
                label: unlockSelected ? "取消" : "解锁",
                disabled: !unlockSelected && remainingGovernmentBudget < capability.unlockCost,
              }}
              doneBadge={capability.isUnlocked ? "已解锁" : undefined}
            />
          );
        })()}
      </div>

      <h4 className="military-section-label">🛡️ 军事行动</h4>
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
              title={action.label}
              costLabel={`${action.cost} 军事点`}
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
                confirmAriaLabel: `确认动作：${action.label}`,
                cancelAriaLabel: `撤回动作：${action.label}`,
                hideCancelWhenNotSelected: true,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
