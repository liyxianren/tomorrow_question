import { useState } from "react";
import { useTranslation } from "react-i18next";
import { translateBackend } from "../../../i18n";
import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import type { ParameterInspector } from "../../../features/game/parameterInspector";
import { buildEffectMetrics } from "../../../features/game/decisionShared";
import { visibleMilitaryActions } from "../../../features/game/militaryActions";
import { DecisionActionCard } from "./shared/DecisionActionCard";
import { MilitaryWorldMap, type MapSelection } from "./military/MilitaryWorldMap";
import { MilitaryNodeDrawer } from "./military/MilitaryNodeDrawer";
import "./MilitaryPanel.css";

const ACTION_ICONS: Record<string, string> = {
  recruit_infantry: "🛡️",
  recruit_army: "🛡️",
  train_artillery: "💣",
  build_fleet: "⚓",
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
  onToggleColonizationUnlock?: (checked: boolean) => void;
  onColonize?: (regionId: string) => void;
  onCancelColonize?: (regionId: string) => void;
  onRegionBlockadeChange: (regionId: string, count: number) => void;
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
  onRegionBlockadeChange,
  parameterInspector,
}: MilitaryPanelProps) {
  const mil = workspace.militaryWorkspace;
  const availableMilitaryActions = visibleMilitaryActions(mil.availableMilitaryActions);
  const getCount = (actionId: string) =>
    draft.militaryPlan.militaryActions.filter((a) => a.actionId === actionId).length;

  const totalFleets = mil.navy.fleets ?? 0;
  const armyTotal = getVisibleArmyTotal(mil.army);
  const regionBlockades = draft.militaryPlan.regionBlockades ?? {};
  const selectedFleetDelta = sumSelectedFleetDelta(availableMilitaryActions, draft);
  const effectiveTotalFleets = Math.max(0, totalFleets + selectedFleetDelta);
  const blockadeThreshold = mil.oceanControlThreshold ?? 4;
  const totalDeployed = mil.regionAccessStatus.reduce((sum, region) => {
    const draftCount = regionBlockades[region.regionId];
    return sum + (typeof draftCount === "number" ? draftCount : (region.myBlockadeFleet ?? 0));
  }, 0);
  const remainingFleets = Math.max(0, effectiveTotalFleets - totalDeployed);

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

      <div className="military-panel__overview" data-testid="military-overview">
        <MilitaryOverviewItem
          icon="🛡️"
          label={t("game:military.armyTotalLabel", "陆军总数 / 上限")}
          value={`${armyTotal} / ${mil.armyCap ?? 3}`}
          hint={t("game:military.armyTotalHint", "用于市场竞争和后续军事对抗。")}
        />
        <MilitaryOverviewItem
          icon="⛵"
          label={t("game:military.fleetRemainingLabel", "可部署舰队 / 本轮总舰队")}
          value={`${remainingFleets} / ${effectiveTotalFleets}`}
          hint={t("game:military.fleetRemainingHint", "剩余舰队可继续投入地区封锁。")}
        />
        <MilitaryOverviewItem
          icon="🌍"
          label={t("game:military.overseasCapacityClearLabel", "海外市场承接容量")}
          value={mil.overseasCapacity}
          hint={t("game:military.overseasCapacityHint", "出售阶段共享海外可售数量。")}
        />
      </div>
      <p className="military-panel__rule-note">
        {t("game:military.fleetRuleNote")}
      </p>

      <h4 className="military-section-label">🌐 {t("game:military.worldMap")}</h4>
      <div className="military-panel__deployment-summary">
        <strong>{t("game:military.regionBlockadeDeployment", "地区封锁部署")}</strong>
        <span>
          {t("game:military.regionBlockadeDeploymentCount", {
            deployed: totalDeployed,
            total: effectiveTotalFleets,
            remaining: remainingFleets,
            defaultValue: `已投入 ${totalDeployed} / ${effectiveTotalFleets} 支舰队，剩余 ${remainingFleets} 支。`,
          })}
        </span>
        <span>
          {t("game:military.regionBlockadeDeploymentRule", {
            threshold: blockadeThreshold,
            defaultValue: `点击地图地区后用 + / - 调整；同一地区投入 ${blockadeThreshold} 支及以上并且唯一领先，才会形成封锁。`,
          })}
        </span>
      </div>
      <div className="mwm-stage">
        <MilitaryWorldMap
          regionAccessStatus={mil.regionAccessStatus}
          selectedNode={selectedNode}
          totalFleets={effectiveTotalFleets}
          remainingFleets={remainingFleets}
          onPinSelect={setSelectedNode}
        />
        <div className="mnd-overlay" aria-label={t("game:military.regionDetail")}>
          {mil.regionAccessStatus.map((region) => {
            const isOpen = selectedNode?.type === "region" && selectedNode?.id === region.regionId;
            return (
              <MilitaryNodeDrawer
                key={`region-${region.regionId}`}
                nodeType="region"
                nodeId={region.regionId}
                open={isOpen}
                onClose={() => setSelectedNode(null)}
                region={region}
                myFleet={typeof regionBlockades[region.regionId] === "number" ? regionBlockades[region.regionId] : (region.myBlockadeFleet ?? 0)}
                remainingFleets={remainingFleets}
                blockadeThreshold={blockadeThreshold}
                myCountry={workspace.countryCode}
                onRegionBlockadeChange={onRegionBlockadeChange}
              />
            );
          })}
        </div>
      </div>

      <h4 className="military-section-label">🛡️ {t("game:military.militaryActions")}</h4>
      <div className="military-actions">
        {availableMilitaryActions.map((action) => {
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

function MilitaryOverviewItem({
  icon,
  label,
  value,
  hint,
}: {
  icon: string;
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="military-panel__overview-item">
      <span className="military-panel__overview-icon" aria-hidden="true">{icon}</span>
      <span className="military-panel__overview-label">{label}</span>
      <strong className="military-panel__overview-value">{value}</strong>
      <small className="military-panel__overview-hint">{hint}</small>
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
