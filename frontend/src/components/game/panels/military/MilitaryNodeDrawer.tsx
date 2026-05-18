import { useTranslation } from "react-i18next";
import { translateBackend } from "../../../../i18n";
import type {
  CountryCode,
  DiplomacyActionOption,
  OceanNodeOption,
  RegionAccessStatus,
} from "../../../../types";
import type { ParameterInspector } from "../../../../features/game/parameterInspector";
import { getOceanNodeLabel, getGoodsLabel } from "../../../../features/game/panelGlossary";
import "./MilitaryNodeDrawer.css";

const REGION_ICONS: Record<string, string> = {
  europe: "🏰",
  americas: "🗽",
  africa: "🦁",
  middle_east: "🕌",
  asia_pacific: "🏯",
};

type OceanDrawerProps = {
  nodeType: "ocean";
  nodeId: string;
  open: boolean;
  onClose: () => void;
  oceanNode: OceanNodeOption;
  myFleet: number;
  remainingFleets: number;
  myCountry: CountryCode;
  onNavalDeploymentChange: (nodeId: string, count: number) => void;
};

type RegionDrawerProps = {
  nodeType: "region";
  nodeId: string;
  open: boolean;
  onClose: () => void;
  region: RegionAccessStatus;
  diplomacyAction: DiplomacyActionOption | null;
  diplomacySelected: boolean;
  remainingGovernmentBudget: number;
  onToggleDiplomacy: (actionId: string, checked: boolean) => void;
  parameterInspector?: ParameterInspector;
};

export type MilitaryNodeDrawerProps = OceanDrawerProps | RegionDrawerProps;

export function MilitaryNodeDrawer(props: MilitaryNodeDrawerProps) {
  if (props.nodeType === "ocean") {
    return <OceanDrawer {...props} />;
  }
  return <RegionDrawer {...props} />;
}

function OceanDrawer({
  nodeId,
  open,
  onClose,
  oceanNode,
  myFleet,
  remainingFleets,
  myCountry,
  onNavalDeploymentChange,
}: OceanDrawerProps) {
  const { t } = useTranslation();
  const label = getOceanNodeLabel(nodeId);
  const breakdown = Object.entries(oceanNode.navyByCountry ?? {})
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a);
  const controllerText = oceanNode.controller
    ? oceanNode.controller === myCountry
      ? t("game:military.oceanControlledByYou", { controller: oceanNode.controller })
      : t("game:military.oceanControl", { controller: oceanNode.controller })
    : t("game:military.oceanNone");

  return (
    <aside
      className={`mnd mnd--ocean${open ? " mnd--open" : ""}`}
      aria-label={`${label} ${t("game:military.regionDetail")}`}
    >
      <header className="mnd__head">
        <span className="mnd__title">
          🌊 {label}
          {oceanNode.isBlockaded ? ` 🚫 ${t("game:military.regionDetail")}` : ""}
        </span>
        <button
          type="button"
          className="mnd__close"
          aria-label={t("game:military.closeDetail")}
          onClick={onClose}
        >×</button>
      </header>

      <div className="mnd__body">
        <div className="mnd__row">
          <span className="mnd__row-label">{t("game:military.myFleet")}</span>
          <span className="mnd__row-value">{myFleet}</span>
        </div>
        <div className="mnd__row">
          <span className="mnd__row-label">{controllerText}</span>
        </div>

        {breakdown.length > 0 && (
          <div className="mnd__breakdown">
            <div className="mnd__breakdown-label">{t("game:military.nationsDeployed")}</div>
            <ul className="mnd__breakdown-list">
              {breakdown.map(([country, count]) => (
                <li key={country}>
                  <span>{country}{country === myCountry ? t("game:military.oceanControlledByYou", { controller: "" }).replace(/Control: \(You\)/, " (You)") : ""}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mnd__deploy">
          <span className="mnd__deploy-label">{t("game:military.adjustDeployment")}</span>
          <div className="mnd__deploy-controls">
            <button
              aria-label={t("game:military.navalDeployReduce", { label })}
              type="button"
              className="mnd__btn"
              disabled={myFleet <= 0}
              onClick={() => onNavalDeploymentChange(nodeId, myFleet - 1)}
            >−</button>
            <span className="mnd__deploy-value">{myFleet}</span>
            <button
              aria-label={t("game:military.navalDeployIncrease", { label })}
              type="button"
              className="mnd__btn"
              disabled={remainingFleets <= 0}
              onClick={() => onNavalDeploymentChange(nodeId, myFleet + 1)}
            >+</button>
          </div>
          <span className="mnd__hint">
            {t("game:military.availableFleets")} {remainingFleets}
          </span>
        </div>
      </div>
    </aside>
  );
}

function RegionDrawer({
  nodeId,
  open,
  onClose,
  region,
  diplomacyAction,
  diplomacySelected,
  remainingGovernmentBudget,
  onToggleDiplomacy,
  parameterInspector,
}: RegionDrawerProps) {
  const { t } = useTranslation();
  const icon = REGION_ICONS[nodeId] ?? "🌐";
  const accessBadge = region.isAccessible ? "✅" : "🔒";
  const goodsLine = region.acceptedGoods.map((g) => getGoodsLabel(g)).join("·");

  const diploEstablished = !!diplomacyAction?.isEstablished;
  const diploCanAfford = diplomacyAction ? remainingGovernmentBudget >= diplomacyAction.cost : false;

  return (
    <aside
      className={`mnd mnd--region${open ? " mnd--open" : ""}`}
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
        {goodsLine && (
          <div className="mnd__row">
            <span className="mnd__row-label">{t("game:military.specialty")}</span>
            <span className="mnd__row-value">{goodsLine}</span>
          </div>
        )}

        {diplomacyAction && (
          <div className="mnd__section">
            <div className="mnd__section-label">🤝 {t("game:military.diplomacy")}</div>
            {diploEstablished ? (
              <div className="mnd__inline-status mnd__inline-status--done">
                {t("game:military.diplomacyEstablished", { region: diplomacyAction.targetRegionLabel })}
              </div>
            ) : (
              <div className="mnd__diplo">
                <span className="mnd__hint">
                  {diplomacyAction.description ?? `${t("game:military.diplomacy")}${translateBackend(diplomacyAction.targetRegionLabel)}`} · {t("game:government.budget")} {diplomacyAction.cost}
                </span>
                <span className="mnd__hint mnd__hint--benefit">
                  {t("game:military.diplomacyBenefit")}
                </span>
                {parameterInspector?.render(`military.diplomacy.${diplomacyAction.actionId}`, {
                  title: translateBackend(diplomacyAction.label),
                  currentEffect: translateBackend(diplomacyAction.description),
                })}
                <div className="mnd__diplo-controls">
                  {diplomacySelected ? (
                    <>
                      <span className="mnd__inline-status mnd__inline-status--done">
                        {t("game:military.plannedThisRound", "已纳入本轮建交计划。")}
                      </span>
                      <button
                        type="button"
                        className="mnd__btn mnd__btn--cancel"
                        onClick={() => onToggleDiplomacy(diplomacyAction.actionId, false)}
                      >{t("common:cancel")}</button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="mnd__btn mnd__btn--primary"
                      disabled={!diploCanAfford}
                      aria-label={translateBackend(diplomacyAction.label)}
                      onClick={() => onToggleDiplomacy(diplomacyAction.actionId, true)}
                    >{t("game:military.establishDiplomacy")}</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
