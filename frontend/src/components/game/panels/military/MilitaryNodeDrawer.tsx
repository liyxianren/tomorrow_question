import type {
  ColonizationCapability,
  ColonizationOption,
  ConquestActionSelection,
  CountryCode,
  DiplomacyActionOption,
  OceanNodeOption,
  RegionAccessStatus,
} from "../../../../types";
import "./MilitaryNodeDrawer.css";

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
  militaryPoints: number;
  remainingGovernmentBudget: number;
  colonizationSelected: boolean;
  conquestEntry: ConquestActionSelection | null;
  lootedSet: Set<string>;
  maxInfantryByPoints: number;
  maxArtilleryByBudget: number;
  onToggleDiplomacy: (actionId: string, checked: boolean) => void;
  onColonize: (regionId: string) => void;
  onCancelColonize: (regionId: string) => void;
  onConquestChange: (regionId: string, infantry: number, artillery: number) => void;
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
  const label = OCEAN_NODE_LABELS[nodeId] ?? nodeId;
  const breakdown = Object.entries(oceanNode.navyByCountry ?? {})
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a);
  const controllerText = oceanNode.controller
    ? oceanNode.controller === myCountry
      ? `控制：${oceanNode.controller}（你）`
      : `控制：${oceanNode.controller}`
    : "控制：无";

  return (
    <aside
      className={`mnd mnd--ocean${open ? " mnd--open" : ""}`}
      aria-label={`${label} 详情`}
    >
      <header className="mnd__head">
        <span className="mnd__title">
          🌊 {label}
          {oceanNode.isBlockaded ? " 🚫 封锁中" : ""}
        </span>
        <button
          type="button"
          className="mnd__close"
          aria-label="关闭详情"
          onClick={onClose}
        >×</button>
      </header>

      <div className="mnd__body">
        <div className="mnd__row">
          <span className="mnd__row-label">我方舰队</span>
          <span className="mnd__row-value">{myFleet}</span>
        </div>
        <div className="mnd__row">
          <span className="mnd__row-label">{controllerText}</span>
        </div>

        {breakdown.length > 0 && (
          <div className="mnd__breakdown">
            <div className="mnd__breakdown-label">各国部署</div>
            <ul className="mnd__breakdown-list">
              {breakdown.map(([country, count]) => (
                <li key={country}>
                  <span>{country}{country === myCountry ? "（你）" : ""}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mnd__deploy">
          <span className="mnd__deploy-label">调整部署</span>
          <div className="mnd__deploy-controls">
            <button
              aria-label={`减少在${label}的舰队部署`}
              type="button"
              className="mnd__btn"
              disabled={myFleet <= 0}
              onClick={() => onNavalDeploymentChange(nodeId, myFleet - 1)}
            >−</button>
            <span className="mnd__deploy-value">{myFleet}</span>
            <button
              aria-label={`增加在${label}的舰队部署`}
              type="button"
              className="mnd__btn"
              disabled={remainingFleets <= 0}
              onClick={() => onNavalDeploymentChange(nodeId, myFleet + 1)}
            >+</button>
          </div>
          <span className="mnd__hint">
            可用舰队 {remainingFleets}
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
  militaryPoints,
  remainingGovernmentBudget,
  colonizationSelected,
  conquestEntry,
  lootedSet,
  maxInfantryByPoints,
  maxArtilleryByBudget,
  onToggleDiplomacy,
  onColonize,
  onCancelColonize,
  onConquestChange,
  onLootingToggle,
}: RegionDrawerProps) {
  const icon = REGION_ICONS[nodeId] ?? "🌐";
  const accessBadge = region.isAccessible ? "✅" : "🔒";
  const goodsLine = region.acceptedGoods.map((g) => GOODS_LABELS[g] ?? g).join("·");

  // Colonization preview logic (mirrors original MilitaryPanel)
  const opt = colonizationOption;
  const previewHasMilitary = militaryPoints >= capability.militaryPointCost;
  const previewCanColonize = !!opt && !opt.isColonized && previewIsUnlocked && previewHasDiplomacy && previewHasMilitary;
  const lockReasonParts: string[] = [];
  if (opt && !opt.isColonized) {
    if (!previewIsUnlocked) lockReasonParts.push("需先解锁殖民");
    if (!previewHasDiplomacy) lockReasonParts.push("建立外交关系");
    if (!previewHasMilitary) lockReasonParts.push(`${capability.militaryPointCost}军事点`);
  }
  const previewLockedReason = !opt
    ? null
    : opt.isColonized
      ? "已被殖民"
      : lockReasonParts.length > 0
        ? `🔒 ${lockReasonParts.join(" + ")}`
        : null;
  const colStatusText = !opt
    ? null
    : opt.isColonized
      ? "👑 已殖民"
      : colonizationSelected
        ? "✓ 已选择"
        : previewLockedReason ?? "可殖民";

  // Conquest data
  const infantry = conquestEntry?.infantry ?? 0;
  const artillery = conquestEntry?.artillery ?? 0;
  const power = infantry + artillery * 2;
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
      aria-label={`${region.label} 详情`}
    >
      <header className="mnd__head">
        <span className="mnd__title">
          {icon} {region.label} {accessBadge}
        </span>
        <button
          type="button"
          className="mnd__close"
          aria-label="关闭详情"
          onClick={onClose}
        >×</button>
      </header>

      <div className="mnd__body">
        {goodsLine && (
          <div className="mnd__row">
            <span className="mnd__row-label">特产</span>
            <span className="mnd__row-value">{goodsLine}</span>
          </div>
        )}

        {diplomacyAction && (
          <div className="mnd__section">
            <div className="mnd__section-label">🤝 外交</div>
            {diploEstablished ? (
              <div className="mnd__inline-status mnd__inline-status--done">
                {diplomacyAction.targetRegionLabel} 已建交
              </div>
            ) : (
              <div className="mnd__diplo">
                <span className="mnd__hint">
                  {diplomacyAction.description ?? `与${diplomacyAction.targetRegionLabel}建立外交关系`} · 花费 {diplomacyAction.cost}
                </span>
                <div className="mnd__diplo-controls">
                  {diplomacySelected ? (
                    <button
                      type="button"
                      className="mnd__btn mnd__btn--cancel"
                      onClick={() => onToggleDiplomacy(diplomacyAction.actionId, false)}
                    >取消</button>
                  ) : (
                    <button
                      type="button"
                      className="mnd__btn mnd__btn--primary"
                      disabled={!diploCanAfford}
                      aria-label={diplomacyAction.label}
                      onClick={() => onToggleDiplomacy(diplomacyAction.actionId, true)}
                    >建交</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {opt && (
          <div className="mnd__section">
            <div className="mnd__section-label">👑 殖民</div>
            <div className="mnd__row">
              <span className="mnd__row-label">状态</span>
              <span className="mnd__row-value">{colStatusText}</span>
            </div>

            {!opt.isColonized && (
              <div className="mnd__diplo">
                <span className="mnd__hint">
                  殖民成功后，每回合获得 {capability.incomePerColonyPerRound} 点国家收入。
                </span>
                <div className="mnd__diplo-controls">
                  {colonizationSelected ? (
                    <button
                      type="button"
                      className="mnd__btn mnd__btn--cancel"
                      onClick={() => onCancelColonize(opt.regionId)}
                    >取消</button>
                  ) : (
                    <button
                      type="button"
                      className="mnd__btn mnd__btn--primary"
                      disabled={!previewCanColonize}
                      aria-label={`殖民${opt.regionLabel}`}
                      onClick={() => onColonize(opt.regionId)}
                    >殖民</button>
                  )}
                </div>
              </div>
            )}

            {opt.isColonized && typeof opt.independence === "number" && (
              <div className="mnd__indep">
                <div className="mnd__indep-text">
                  独立度 {opt.independence}%
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
              </div>
            )}

            {opt.isColonized && garrisonEntries.length > 0 && (
              <div className="mnd__garrison">
                驻军: {garrisonEntries.map(([country, n]) => `${country}×${n}`).join(" ")}
              </div>
            )}

            {opt.isColonized && resourceEntries.length > 0 && (
              <div className="mnd__loot">
                <div className="mnd__loot-line">
                  资源: {resourceEntries.map(([res, n]) => `${GOODS_LABELS[res] ?? res}×${n}`).join(" ")}
                </div>
                <div className="mnd__loot-buttons">
                  {resourceEntries.map(([res]) => {
                    const resLabel = GOODS_LABELS[res] ?? res;
                    const isLooted = lootedSet.has(res);
                    return (
                      <button
                        key={res}
                        aria-label={`掠夺${opt.regionLabel}${resLabel}`}
                        className={`mnd__btn${isLooted ? " mnd__btn--active" : ""}`}
                        type="button"
                        onClick={() => onLootingToggle(opt.regionId, res)}
                      >
                        掠夺{resLabel}
                      </button>
                    );
                  })}
                </div>
                <div className="mnd__loot-hint">
                  ⚠️ 掠夺会增加殖民地独立倾向 (+2)
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
            <div className="mnd__section-label">⚔️ 征服</div>
            <div className="mnd__conquest-row">
              <span className="mnd__conquest-label">步兵: {infantry} (消耗 {infantry * 10} 军事点)</span>
              <button
                aria-label={`减少${opt.regionLabel}步兵`}
                className="mnd__btn"
                type="button"
                disabled={infantry <= 0}
                onClick={() => onConquestChange(opt.regionId, infantry - 1, artillery)}
              >−</button>
              <button
                aria-label={`增加${opt.regionLabel}步兵`}
                className="mnd__btn"
                type="button"
                disabled={infantry >= maxInfantryByPoints}
                onClick={() => onConquestChange(opt.regionId, infantry + 1, artillery)}
              >+</button>
            </div>
            <div className="mnd__conquest-row">
              <span className="mnd__conquest-label">炮兵: {artillery} (消耗 {artillery * 16} 金币)</span>
              <button
                aria-label={`减少${opt.regionLabel}炮兵`}
                className="mnd__btn"
                type="button"
                disabled={artillery <= 0}
                onClick={() => onConquestChange(opt.regionId, infantry, artillery - 1)}
              >−</button>
              <button
                aria-label={`增加${opt.regionLabel}炮兵`}
                className="mnd__btn"
                type="button"
                disabled={artillery >= maxArtilleryByBudget}
                onClick={() => onConquestChange(opt.regionId, infantry, artillery + 1)}
              >+</button>
            </div>
            <div className="mnd__conquest-power">
              战力 = {power}（步兵 {infantry} + 炮兵×2 {artillery * 2}）
              {defenderPower > 0
                ? ` · 守军战力 = ${defenderPower}（步兵 ${garrisonInf} + 炮兵×2 ${garrisonArt * 2}）· 需≥${conquestThreshold}`
                : ""}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
