import { useTranslation } from "react-i18next";
import i18n, { translateBackend } from "../../../../i18n";
import type { RegionAccessStatus } from "../../../../types";
import { getCountryLabel, getGoodsLabel } from "../../../../features/game/panelGlossary";
import "./MilitaryWorldMap.css";

const REGION_ICONS: Record<string, string> = {
  europe: "🏰",
  americas: "🗽",
  africa: "🦁",
  middle_east: "🕌",
  asia_pacific: "🏯",
};

const REGION_POSITIONS: Record<string, { left: string; top: string }> = {
  europe: { left: "47%", top: "26%" },
  americas: { left: "15%", top: "47%" },
  africa: { left: "48%", top: "61%" },
  middle_east: { left: "58%", top: "43%" },
  asia_pacific: { left: "78%", top: "49%" },
};

export type MapSelection = { type: "region"; id: string } | null;

export interface MilitaryWorldMapProps {
  regionAccessStatus: RegionAccessStatus[];
  colonizationOptions?: unknown[];
  selectedNode: MapSelection;
  totalFleets: number;
  remainingFleets: number;
  onPinSelect: (selection: MapSelection) => void;
}

export function MilitaryWorldMap({
  regionAccessStatus,
  selectedNode,
  totalFleets,
  remainingFleets,
  onPinSelect,
}: MilitaryWorldMapProps) {
  const { t } = useTranslation();
  const totalDeployed = totalFleets - remainingFleets;

  return (
    <div className="mwm">
      <img className="mwm__bg" src="/images/military-world-map.png" alt="" aria-hidden />

      {regionAccessStatus.map((region) => {
        const pos = REGION_POSITIONS[region.regionId];
        if (!pos) return null;
        const isSelected = selectedNode?.type === "region" && selectedNode?.id === region.regionId;
        const pinStatus = buildRegionPinStatus(region);
        return (
          <div
            key={region.regionId}
            role="button"
            tabIndex={0}
            data-testid={`region-node-${region.regionId}`}
            className={`mwm-pin mwm-pin--region${isSelected ? " mwm-pin--selected" : ""}${
              region.isAccessible ? " mwm-pin--accessible" : " mwm-pin--locked"
            } mwm-pin--${pinStatus.tone}`}
            style={{ left: pos.left, top: pos.top }}
            onClick={() => onPinSelect(isSelected ? null : { type: "region", id: region.regionId })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPinSelect(isSelected ? null : { type: "region", id: region.regionId });
              }
            }}
          >
            <span className="mwm-pin__head">
              <span className="mwm-pin__icon">{REGION_ICONS[region.regionId] ?? "🌐"}</span>
              <span className="mwm-pin__label">
                {translateBackend(region.label)} - {pinStatus.label}
              </span>
            </span>
            {region.acceptedGoods.length > 0 && (
              <span className="mwm-pin__sub">
                {region.acceptedGoods.map((g) => getGoodsLabel(g)).join("·")}
              </span>
            )}
            {region.myBlockadeFleet && region.myBlockadeFleet > 0 ? (
              <span className="mwm-pin__fleet">
                {t("game:military.myRegionFleetShort", { count: region.myBlockadeFleet, defaultValue: `Your Fleets ${region.myBlockadeFleet}` })}
              </span>
            ) : null}
          </div>
        );
      })}

      <div className="mwm__legend">
        ⛵ {t("game:military.regionFleetDeployment", { deployed: totalDeployed, total: totalFleets, defaultValue: `Region Blockade Fleets ${totalDeployed}/${totalFleets}` })}
      </div>
    </div>
  );
}

function buildRegionPinStatus(region: RegionAccessStatus): { label: string; tone: "open" | "exclusive" | "blocked" } {
  if (region.isAccessible && region.isBlockaded) {
    return { label: i18n.t("game:military.regionPinExclusive", "Your Blockade"), tone: "exclusive" };
  }
  if (!region.isAccessible && region.isBlockaded) {
    return {
      label: region.blockadeController
        ? i18n.t("game:military.regionPinBlockedByCountry", {
          country: getCountryLabel(region.blockadeController),
          defaultValue: "{{country}} Blockade",
        })
        : i18n.t("game:military.regionPinBlocked", "Blockaded"),
      tone: "blocked",
    };
  }
  return { label: i18n.t("game:military.regionPinOpen", "Open"), tone: "open" };
}
