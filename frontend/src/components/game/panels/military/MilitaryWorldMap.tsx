import { useTranslation } from "react-i18next";
import i18n, { translateBackend } from "../../../../i18n";
import type {
  ColonizationOption,
  CountryCode,
  OceanNodeOption,
  RegionAccessStatus,
} from "../../../../types";
import "./MilitaryWorldMap.css";

function getOceanNodeLabel(nodeId: string): string {
  return i18n.t(`game:oceanNode.${nodeId}`, nodeId);
}

function getGoodsLabel(goodsId: string): string {
  return i18n.t(`game:goods.${goodsId}`, goodsId);
}

const REGION_ICONS: Record<string, string> = {
  europe: "🏰",
  americas: "🗽",
  africa: "🦁",
  middle_east: "🕌",
  asia_pacific: "🏯",
};

const OCEAN_POSITIONS: Record<string, { left: string; top: string }> = {
  north_atlantic: { left: "31%", top: "33%" },
  south_atlantic: { left: "31%", top: "61%" },
  mediterranean: { left: "48%", top: "42%" },
  indian_ocean: { left: "65%", top: "67%" },
  pacific: { left: "86%", top: "55%" },
};

const REGION_POSITIONS: Record<string, { left: string; top: string }> = {
  europe: { left: "47%", top: "26%" },
  americas: { left: "15%", top: "47%" },
  africa: { left: "48%", top: "61%" },
  middle_east: { left: "58%", top: "43%" },
  asia_pacific: { left: "78%", top: "49%" },
};

export type MapSelection = { type: "ocean" | "region"; id: string } | null;

export interface MilitaryWorldMapProps {
  oceanNodes: OceanNodeOption[];
  regionAccessStatus: RegionAccessStatus[];
  colonizationOptions: ColonizationOption[];
  navalDeployment: Record<string, number>;
  myCountry: CountryCode;
  selectedNode: MapSelection;
  totalFleets: number;
  remainingFleets: number;
  oceanControlThreshold: number;
  onPinSelect: (selection: MapSelection) => void;
  onNavalDeploymentChange: (nodeId: string, count: number) => void;
}

export function MilitaryWorldMap({
  oceanNodes,
  regionAccessStatus,
  colonizationOptions,
  navalDeployment,
  myCountry,
  selectedNode,
  totalFleets,
  remainingFleets,
  oceanControlThreshold,
  onPinSelect,
  onNavalDeploymentChange,
}: MilitaryWorldMapProps) {
  const { t } = useTranslation();
  const colonizationByRegion = new Map(colonizationOptions.map((o) => [o.regionId, o]));
  const totalDeployed = totalFleets - remainingFleets;

  return (
    <div className="mwm">
      <img className="mwm__bg" src="/images/military-world-map.png" alt="" aria-hidden />

      {oceanNodes.map((node) => {
        const pos = OCEAN_POSITIONS[node.nodeId];
        if (!pos) return null;
        const draftCount = navalDeployment[node.nodeId];
        const myFleet = typeof draftCount === "number" ? draftCount : node.myFleet;
        const previewNode = previewOceanNode(node, myCountry, myFleet, oceanControlThreshold);
        const label = getOceanNodeLabel(node.nodeId);
        const isSelected = selectedNode?.type === "ocean" && selectedNode?.id === node.nodeId;
        const isOpen = isSelected;
        return (
          <div
            key={node.nodeId}
            role="button"
            tabIndex={0}
            className={`mwm-pin mwm-pin--ocean${isOpen ? " mwm-pin--selected" : ""}`}
            style={{ left: pos.left, top: pos.top }}
            data-testid={`ocean-node-${node.nodeId}`}
            onClick={() => onPinSelect(isOpen ? null : { type: "ocean", id: node.nodeId })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPinSelect(isOpen ? null : { type: "ocean", id: node.nodeId });
              }
            }}
          >
            <span className="mwm-pin__head">
              <span className="mwm-pin__icon">🌊</span>
              <span className="mwm-pin__label">
                {label}{previewNode.isBlockaded ? " 🚫" : ""}
              </span>
            </span>
            <span className="mwm-pin__sub">
              {t("game:military.myFleet")} {myFleet}{previewNode.controller ? ` · ${previewNode.controller}` : ""}
            </span>
            <span
              className="mwm-pin__buttons"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <button
                aria-label={t("game:military.ariaDeployMinus", { label, defaultValue: `${label}部署-1` })}
                className="mwm-pin__btn"
                type="button"
                disabled={myFleet <= 0}
                onClick={() => onNavalDeploymentChange(node.nodeId, myFleet - 1)}
              >−</button>
              <button
                aria-label={t("game:military.ariaDeployPlus", { label, defaultValue: `${label}部署+1` })}
                className="mwm-pin__btn"
                type="button"
                disabled={remainingFleets <= 0}
                onClick={() => onNavalDeploymentChange(node.nodeId, myFleet + 1)}
              >+</button>
            </span>
          </div>
        );
      })}

      {regionAccessStatus.map((region) => {
        const pos = REGION_POSITIONS[region.regionId];
        if (!pos) return null;
        const isSelected = selectedNode?.type === "region" && selectedNode?.id === region.regionId;
        const colony = colonizationByRegion.get(region.regionId);
        const statusBadge = colony?.isColonized ? "👑" : region.isAccessible ? "✅" : "🔒";
        return (
          <div
            key={region.regionId}
            role="button"
            tabIndex={0}
            className={`mwm-pin mwm-pin--region${isSelected ? " mwm-pin--selected" : ""}${
              region.isAccessible ? " mwm-pin--accessible" : " mwm-pin--locked"
            }`}
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
                {translateBackend(region.label)} {statusBadge}
              </span>
            </span>
            {region.acceptedGoods.length > 0 && (
              <span className="mwm-pin__sub">
                {region.acceptedGoods.map((g) => getGoodsLabel(g)).join("·")}
              </span>
            )}
          </div>
        );
      })}

      {oceanNodes.length > 0 && (
        <div className="mwm__legend">
          ⛵ {t("game:military.navalDeployment", { deployed: totalDeployed, total: totalFleets })}
        </div>
      )}
    </div>
  );
}

function previewOceanNode(
  node: OceanNodeOption,
  myCountry: CountryCode,
  myFleet: number,
  controlThreshold: number,
): OceanNodeOption {
  const navyByCountry = { ...(node.navyByCountry ?? {}) };
  if (myFleet > 0) {
    navyByCountry[myCountry] = myFleet;
  } else {
    delete navyByCountry[myCountry];
  }
  const ranked = Object.entries(navyByCountry)
    .filter(([country, count]) => country && count > 0)
    .sort(([, a], [, b]) => b - a);
  const [topCountry, topCount] = ranked[0] ?? [null, 0];
  const runnerUpCount = ranked[1]?.[1] ?? 0;
  const controller = topCountry && topCount >= controlThreshold && topCount > runnerUpCount ? topCountry : null;
  return {
    ...node,
    myFleet,
    navyByCountry,
    controller,
    isBlockaded: controller !== null,
  };
}
