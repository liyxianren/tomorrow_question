import { useTranslation } from "react-i18next";
import { translateBackend } from "../../../../i18n";
import type {
  ColonizationCapability,
  ColonizationOption,
  ConquestActionSelection,
  CountryCode,
  DiplomacyActionOption,
  OceanNodeOption,
  RegionAccessStatus,
} from "../../../../types";
import { getOceanNodeLabel, getGoodsLabel } from "../../../../features/game/panelGlossary";
import "./MilitaryNodeDrawer.css";

const REGION_ICONS: Record<string, string> = {
  europe: "🏰",
  americas: "🗽",
  africa: "🦁",
  middle_east: "🕌",
  asia_pacific: "🏯",
};

function independenceColor(value: number): string {
  if (value >= 60) return "#c0392b";
  if (value >= 40) return "#d4a017";
  return "#2e7d32";
}

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
  colonizationOption: ColonizationOption | null;
  capability: ColonizationCapability;
  previewIsUnlocked: boolean;
  previewHasDiplomacy: boolean;
  remainingGovernmentBudget: number;
  colonizationSelected: boolean;
  conquestEntry: ConquestActionSelection | null;
  lootedSet: Set<string>;
  maxArmyAvailable: number;
  onToggleDiplomacy: (actionId: string, checked: boolean) => void;
  onColonize: (regionId: string) => void;
  onCancelColonize: (regionId: string) => void;
  onConquestChange: (regionId: string, army: number) => void;
  onLootingToggle: (regionId: string, resourceType: string) => void;
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
  colonizationOption,
  capability,
  previewIsUnlocked,
  previewHasDiplomacy,
  remainingGovernmentBudget,
  colonizationSelected,
  conquestEntry,
  lootedSet,
  maxArmyAvailable,
  onToggleDiplomacy,
  onColonize,
  onCancelColonize,
  onConquestChange,
  onLootingToggle,
}: RegionDrawerProps) {
  const { t } = useTranslation();
  const icon = REGION_ICONS[nodeId] ?? "🌐";
  const accessBadge = region.isAccessible ? "✅" : "🔒";
  const goodsLine = region.acceptedGoods.map((g) => getGoodsLabel(g)).join("·");

  // Colonization preview logic (mirrors original MilitaryPanel)
  const opt = colonizationOption;
  const previewHasMilitary = remainingGovernmentBudget >= capability.budgetCost;
  const previewCanColonize = !!opt && !opt.isColonized && previewIsUnlocked && previewHasDiplomacy && previewHasMilitary;
  const lockReasonParts: string[] = [];
  if (opt && !opt.isColonized) {
    if (!previewIsUnlocked) lockReasonParts.push(t("game:military.needUnlockColonization"));
    if (!previewHasDiplomacy) lockReasonParts.push(t("game:military.establishDiplomacyRequired"));
    if (!previewHasMilitary) lockReasonParts.push(t("game:military.militaryPointsRequired", { points: capability.budgetCost }));
  }
  const previewLockedReason = !opt
    ? null
    : opt.isColonized
      ? t("game:military.alreadyColonized")
      : lockReasonParts.length > 0
        ? `🔒 ${lockReasonParts.join(" + ")}`
        : null;
  const colStatusText = !opt
    ? null
    : opt.isColonized
      ? `👑 ${t("game:military.alreadyColonized")}`
      : colonizationSelected
        ? `✓ ${t("common:selected")}`
        : previewLockedReason ?? t("game:military.canColonize");

  // Conquest data
  const army = conquestEntry?.army ?? 0;
  const power = army * 3;
  const garrisonInf = Number(opt?.garrison?.infantry ?? 0);
  const garrisonArt = Number(opt?.garrison?.artillery ?? 0);
  const defenderPower = garrisonInf + garrisonArt * 2;
  const conquestThreshold = Math.max(1, defenderPower * 2);
  const garrisonEntries = Object.entries(opt?.garrison ?? {}).filter(([, n]) => n > 0);
  const resourceEntries = Object.entries(opt?.resourceLimit ?? {}).filter(([, n]) => n > 0);

  const showConquest = !!opt && !opt.isColonized && region.isAccessible;
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
                <div className="mnd__diplo-controls">
                  {diplomacySelected ? (
                    <button
                      type="button"
                      className="mnd__btn mnd__btn--cancel"
                      onClick={() => onToggleDiplomacy(diplomacyAction.actionId, false)}
                    >{t("common:cancel")}</button>
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

        {opt && (
          <div className="mnd__section">
            <div className="mnd__section-label">👑 {t("game:military.colony")}</div>
            <div className="mnd__row">
              <span className="mnd__row-label">{t("common:statusLabels.current")}</span>
              <span className="mnd__row-value">{colStatusText}</span>
            </div>

            {!opt.isColonized && (
              <div className="mnd__diplo">
                <span className="mnd__hint">
                  {t("game:military.colonizationBenefit", { income: capability.incomePerColonyPerRound })}
                </span>
                <div className="mnd__diplo-controls">
                  {colonizationSelected ? (
                    <button
                      type="button"
                      className="mnd__btn mnd__btn--cancel"
                      onClick={() => onCancelColonize(opt.regionId)}
                    >{t("common:cancel")}</button>
                  ) : (
                    <button
                      type="button"
                      className="mnd__btn mnd__btn--primary"
                      disabled={!previewCanColonize}
                      aria-label={`${t("game:military.colonize")}${translateBackend(opt.regionLabel)}`}
                      onClick={() => onColonize(opt.regionId)}
                    >{t("game:military.colonize")}</button>
                  )}
                </div>
              </div>
            )}

            {opt.isColonized && typeof opt.independence === "number" && (
              <div className="mnd__indep">
                <div className="mnd__indep-text">
                  {t("game:military.independence")} {opt.independence}%
                  {opt.independence >= 60 ? " ⚠️" : ""}
                </div>
                <div className="mnd__indep-bar">
                  <div
                    className="mnd__indep-bar-fill"
                    style={{
                      width: `${Math.max(0, Math.min(100, opt.independence))}%`,
                      background: independenceColor(opt.independence),
                    }}
                  />
                </div>
                <div className="mnd__indep-hint">
                  {t("game:military.independenceHint")}
                </div>
              </div>
            )}

            {opt.isColonized && garrisonEntries.length > 0 && (
              <div className="mnd__garrison">
                {t("game:military.garrison")}: {garrisonEntries.map(([country, n]) => `${country}×${n}`).join(" ")}
              </div>
            )}

            {opt.isColonized && resourceEntries.length > 0 && (
              <div className="mnd__loot">
                <div className="mnd__loot-line">
                  {t("game:military.resources")}: {resourceEntries.map(([res, n]) => `${getGoodsLabel(res)}×${n}`).join(" ")}
                </div>
                <div className="mnd__loot-buttons">
                  {resourceEntries.map(([res]) => {
                    const resLabel = getGoodsLabel(res);
                    const isLooted = lootedSet.has(res);
                    return (
                      <button
                        key={res}
                        aria-label={t("game:military.lootResource", { resource: resLabel })}
                        className={`mnd__btn${isLooted ? " mnd__btn--active" : ""}`}
                        type="button"
                        onClick={() => onLootingToggle(opt.regionId, res)}
                      >
                        {t("game:military.lootResource", { resource: resLabel })}
                      </button>
                    );
                  })}
                </div>
                <div className="mnd__loot-hint">
                  {t("game:military.lootHint")}
                </div>
              </div>
            )}
          </div>
        )}

        {showConquest && opt && (
          <div
            className="mnd__section"
            data-testid={`conquest-${opt.regionId}`}
          >
            <div className="mnd__section-label">⚔️ {t("game:military.conquest")}</div>
            <div className="mnd__conquest-row">
              <span className="mnd__conquest-label">{t("game:military.army")}: {army} / {maxArmyAvailable}</span>
              <button
                aria-label={`${t("game:market.reduceDomestic")}${translateBackend(opt.regionLabel)}${t("game:military.army")}`}
                className="mnd__btn"
                type="button"
                disabled={army <= 0}
                onClick={() => onConquestChange(opt.regionId, army - 1)}
              >−</button>
              <button
                aria-label={`${t("game:market.increaseDomestic")}${translateBackend(opt.regionLabel)}${t("game:military.army")}`}
                className="mnd__btn"
                type="button"
                disabled={army >= maxArmyAvailable}
                onClick={() => onConquestChange(opt.regionId, army + 1)}
              >+</button>
            </div>
            <div className="mnd__conquest-power">
              {t("game:military.militaryPoints")} = {power}（{t("game:military.army")} {army} × 3）
              {defenderPower > 0
                ? ` · ${t("game:military.garrison")}${t("game:military.militaryPoints")} = ${defenderPower}（${t("game:military.infantry")} ${garrisonInf} + ${t("game:military.artillery")}×2 ${garrisonArt * 2}）· ≥${conquestThreshold}`
                : ""}
            </div>
            <div className="mnd__conquest-benefit">
              {t("game:military.conquestBenefit")}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
