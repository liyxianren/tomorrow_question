import type {
  ColonizationOption,
  CountryCode,
  OceanNodeOption,
  RegionAccessStatus,
} from "../../../../types";
import "./MilitaryWorldMap.css";

const OCEAN_NODE_LABELS: Record<string, string> = {
  north_atlantic: "北大西洋",
  south_atlantic: "南大西洋",
  indian_ocean: "印度洋",
  pacific: "太平洋",
  mediterranean: "地中海",
};

const REGION_ICONS: Record<string, string> = {
  europe: "🏰",
  americas: "🗽",
  africa: "🦁",
  middle_east: "🕌",
  asia_pacific: "🏯",
};

const GOODS_LABELS: Record<string, string> = {
  coal: "煤炭", steel: "钢铁", grain: "粮食", cotton: "棉花",
  oil: "石油", rubber: "橡胶", minerals: "矿产", tea: "茶叶", silk: "丝绸",
  iron: "铁矿",
};

const OCEAN_POSITIONS: Record<string, { left: string; top: string }> = {
  north_atlantic: { left: "25%", top: "25%" },
  south_atlantic: { left: "28%", top: "55%" },
  mediterranean: { left: "48%", top: "30%" },
  indian_ocean: { left: "60%", top: "55%" },
  pacific: { left: "75%", top: "45%" },
};

const REGION_POSITIONS: Record<string, { left: string; top: string }> = {
  europe: { left: "45%", top: "20%" },
  americas: { left: "15%", top: "50%" },
  africa: { left: "48%", top: "60%" },
  middle_east: { left: "58%", top: "42%" },
  asia_pacific: { left: "75%", top: "50%" },
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
  onPinSelect: (selection: MapSelection) => void;
  onNavalDeploymentChange: (nodeId: string, count: number) => void;
}

export function MilitaryWorldMap({
  oceanNodes,
  regionAccessStatus,
  colonizationOptions,
  navalDeployment,
  selectedNode,
  totalFleets,
  remainingFleets,
  onPinSelect,
  onNavalDeploymentChange,
}: MilitaryWorldMapProps) {
  const colonizationByRegion = new Map(colonizationOptions.map((o) => [o.regionId, o]));
  const totalDeployed = totalFleets - remainingFleets;

  return (
    <div className="mwm">
      <img className="mwm__bg" src="/images/world-map-placeholder.svg" alt="" aria-hidden />

      {oceanNodes.map((node) => {
        const pos = OCEAN_POSITIONS[node.nodeId];
        if (!pos) return null;
        const draftCount = navalDeployment[node.nodeId];
        const myFleet = typeof draftCount === "number" ? draftCount : node.myFleet;
        const label = OCEAN_NODE_LABELS[node.nodeId] ?? node.nodeId;
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
                {label}{node.isBlockaded ? " 🚫" : ""}
              </span>
            </span>
            <span className="mwm-pin__sub">
              舰队 {myFleet}{node.controller ? ` · ${node.controller}` : ""}
            </span>
            <span
              className="mwm-pin__buttons"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <button
                aria-label={`${label}部署-1`}
                className="mwm-pin__btn"
                type="button"
                disabled={myFleet <= 0}
                onClick={() => onNavalDeploymentChange(node.nodeId, myFleet - 1)}
              >−</button>
              <button
                aria-label={`${label}部署+1`}
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
                {region.label} {statusBadge}
              </span>
            </span>
            {region.acceptedGoods.length > 0 && (
              <span className="mwm-pin__sub">
                {region.acceptedGoods.map((g) => GOODS_LABELS[g] ?? g).join("·")}
              </span>
            )}
          </div>
        );
      })}

      {oceanNodes.length > 0 && (
        <div className="mwm__legend">
          ⛵ 舰队部署 {totalDeployed}/{totalFleets}
        </div>
      )}
    </div>
  );
}
