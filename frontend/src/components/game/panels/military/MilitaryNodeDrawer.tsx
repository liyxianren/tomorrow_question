import { useTranslation } from "react-i18next";
import { translateBackend } from "../../../../i18n";
import type {
  CountryCode,
  RegionAccessStatus,
} from "../../../../types";
import {
  buildRegionAccessDescription,
  buildRegionRouteBlockadeDetail,
} from "../../../../features/game/decisionShared";
import { getCountryLabel, getGoodsLabel } from "../../../../features/game/panelGlossary";
import "./MilitaryNodeDrawer.css";

const REGION_ICONS: Record<string, string> = {
  europe: "🏰",
  americas: "🗽",
  africa: "🦁",
  middle_east: "🕌",
  asia_pacific: "🏯",
};

export type MilitaryNodeDrawerProps = {
  nodeType: "region";
  nodeId: string;
  open: boolean;
  onClose: () => void;
  region: RegionAccessStatus;
  myFleet: number;
  remainingFleets: number;
  blockadeThreshold: number;
  myCountry: CountryCode;
  onRegionBlockadeChange: (regionId: string, count: number) => void;
};

export function MilitaryNodeDrawer(props: MilitaryNodeDrawerProps) {
  return <RegionDrawer {...props} />;
}

function formatCountryWithPlayerMark(
  country: string,
  myCountry: CountryCode,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const label = getCountryLabel(country);
  return country === myCountry
    ? `${label}${t("game:military.youSuffix", { defaultValue: "（你）" })}`
    : label;
}

function RegionDrawer({
  nodeId,
  open,
  onClose,
  region,
  myFleet,
  remainingFleets,
  blockadeThreshold,
  myCountry,
  onRegionBlockadeChange,
}: MilitaryNodeDrawerProps) {
  const { t } = useTranslation();
  if (!open) {
    return null;
  }
  const icon = REGION_ICONS[nodeId] ?? "🌐";
  const accessBadge = region.isAccessible ? "✅" : "🔒";
  const goodsLine = region.acceptedGoods.map((g) => getGoodsLabel(g)).join("·");
  const routeBlockadeDetail = buildRegionRouteBlockadeDetail(region);
  const regionDescription = buildRegionAccessDescription(region, { includeRouteBlockadeDetail: false });
  const controllerLabel = region.blockadeController
    ? formatCountryWithPlayerMark(region.blockadeController, myCountry, t)
    : null;
  const maxFleetForThisRegion = myFleet + remainingFleets;
  const blockadeLine = region.blockadeController
    ? region.blockadeController === myCountry
      ? t("game:military.regionBlockadeByYou", "你正在封锁这个地区；你仍可向该地区出售，其他国家不能向该地区出售。")
      : t("game:military.regionBlockadeByOther", {
          country: controllerLabel,
          defaultValue: "{{country}} 正在封锁这个地区；除 {{country}} 外其他国家不能向该地区出售。",
        })
    : myFleet > 0
      ? t("game:military.regionBlockadeQueued", {
          count: myFleet,
          threshold: blockadeThreshold,
          defaultValue: "已向这个地区分配 {{count}} 支舰队；投入 {{threshold}} 支及以上并且唯一领先时，其他国家不能向该地区出售。",
        })
    : t("game:military.regionBlockadeNone", "当前没有国家封锁这个地区。");

  return (
    <aside
      className="mnd mnd--region mnd--open"
      aria-label={`${translateBackend(region.label)} ${t("game:military.regionDetail")}`}
    >
      <header className="mnd__head">
        <span className="mnd__title">
          {icon} {translateBackend(region.label)} {accessBadge}
        </span>
        <button
          type="button"
          className="mnd__close"
          aria-label={t("game:military.closeDetail")}
          onClick={onClose}
        >×</button>
      </header>

      <div className="mnd__body">
        <div className="mnd__row mnd__row--stacked">
          <span className="mnd__row-label">{t("game:military.regionAccess", "区域状态")}</span>
          <span className="mnd__hint">{regionDescription}</span>
        </div>
        {routeBlockadeDetail ? (
          <div className="mnd__section mnd__section--warning">
            <span className="mnd__section-label">{t("game:military.routeBlockade", "地区封锁")}</span>
            <span className="mnd__hint">{routeBlockadeDetail}</span>
          </div>
        ) : null}
        <div className={`mnd__section${region.isBlockaded ? " mnd__section--warning" : ""}`}>
          <span className="mnd__section-label">{t("game:military.regionBlockadeAction", "地区封锁")}</span>
          <span className="mnd__hint">{blockadeLine}</span>
          <span className="mnd__hint">
            {t(
              "game:military.regionBlockadeRule",
              {
                threshold: blockadeThreshold,
                defaultValue: "封锁判定：对同一地区投入舰队，投入 {{threshold}} 支及以上且舰队数唯一领先的国家独享该地区；多人同时封锁时比舰队数，平手不形成封锁。",
              },
            )}
          </span>
          <div className="mnd__deploy-title-row">
            <span className="mnd__deploy-label">{t("game:military.thisRegionFleet", "本地区舰队")}</span>
            <span className="mnd__deploy-limit">
              {t("game:military.thisRegionFleetLimit", {
                max: maxFleetForThisRegion,
                defaultValue: `可调 0-${maxFleetForThisRegion}`,
              })}
            </span>
          </div>
          <div className="mnd__deploy-controls">
            <button
              aria-label={t("game:military.regionBlockadeReduce", { label: translateBackend(region.label), defaultValue: `${translateBackend(region.label)}封锁-1` })}
              type="button"
              className="mnd__btn"
              disabled={myFleet <= 0}
              onClick={() => onRegionBlockadeChange(nodeId, myFleet - 1)}
            >−</button>
            <span className="mnd__deploy-value">{myFleet}</span>
            <button
              aria-label={t("game:military.regionBlockadeIncrease", { label: translateBackend(region.label), defaultValue: `${translateBackend(region.label)}封锁+1` })}
              type="button"
              className="mnd__btn"
              disabled={remainingFleets <= 0}
              onClick={() => onRegionBlockadeChange(nodeId, myFleet + 1)}
            >+</button>
          </div>
          <span className="mnd__hint">
            {t("game:military.availableFleets")} {remainingFleets}；{t("game:military.regionBlockadeSaleEffect", "形成封锁后，本国可出售，其他国家不能向该地区出售。")}
          </span>
        </div>
        {goodsLine && (
          <div className="mnd__row">
            <span className="mnd__row-label">{t("game:military.specialty")}</span>
            <span className="mnd__row-value">{goodsLine}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
