import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import { buildEffectMetrics } from "../../../features/game/decisionShared";
import "./MilitaryPanel.css";

const REGION_ICONS: Record<string, string> = {
  europe: "🏰",
  americas: "🗽",
  africa: "🦁",
  middle_east: "🕌",
  asia_pacific: "🏯",
};

const ACTION_ICONS: Record<string, string> = {
  recruit_infantry: "🛡️",
  train_artillery: "💣",
  naval_drill: "⛵",
  establish_americas: "🤝",
  establish_africa: "🤝",
  establish_middle_east: "🤝",
  establish_asia_pacific: "🤝",
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

const OCEAN_NODE_LABELS: Record<string, string> = {
  north_atlantic: "北大西洋",
  south_atlantic: "南大西洋",
  indian_ocean: "印度洋",
  pacific: "太平洋",
  mediterranean: "地中海",
};

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

  const accessibleRegionIds = new Set(
    mil.regionAccessStatus.filter((r) => r.isAccessible).map((r) => r.regionId),
  );
  const conquestActions = draft.militaryPlan.conquestActions ?? [];
  const lootingActions = draft.militaryPlan.lootingActions ?? [];
  const maxInfantryByPoints = Math.floor(mil.militaryPoints / 10);
  const maxArtilleryByBudget = Math.floor(remainingGovernmentBudget / 16);

  return (
    <div className="military-panel" data-testid="military-panel">
      <div className="military-panel__header">
        <h3 className="military-panel__title">⚔️ 军事要塞</h3>
        <span className="military-panel__budget">财政 {remainingGovernmentBudget}</span>
      </div>

      <div className="military-stats">
        <div className="military-stat">
          <span className="military-stat__icon">⚔️</span>
          <span className="military-stat__value">{mil.militaryPoints}</span>
          <span className="military-stat__label">军事点</span>
        </div>
        <div className="military-stat">
          <span className="military-stat__icon">⛵</span>
          <span className="military-stat__value">{mil.navy.fleets ?? 0}</span>
          <span className="military-stat__label">舰队</span>
        </div>
        <div className="military-stat">
          <span className="military-stat__icon">🌍</span>
          <span className="military-stat__value">{mil.overseasCapacity}</span>
          <span className="military-stat__label">海外承接</span>
        </div>
        <div className="military-stat">
          <span className="military-stat__icon">🏳️</span>
          <span className="military-stat__value">{mil.establishedDiplomacy.length}</span>
          <span className="military-stat__label">已建交</span>
        </div>
      </div>

      {oceanNodes.length > 0 && (
        <>
          <h4 className="military-section-label">
            🌊 海洋节点 <span style={{ fontSize: 12, color: "var(--game-text-muted, #b8a981)", marginLeft: 8 }}>
              已部署 {totalDeployed}/{totalFleets}
            </span>
          </h4>
          <div className="military-regions">
            {oceanNodes.map((node) => {
              const draftCount = navalDeployment[node.nodeId];
              const myFleet = typeof draftCount === "number" ? draftCount : node.myFleet;
              const canIncrement = remainingFleets > 0;
              const canDecrement = myFleet > 0;
              const label = OCEAN_NODE_LABELS[node.nodeId] ?? node.nodeId;
              return (
                <div
                  key={node.nodeId}
                  className="military-region military-region--accessible"
                  data-testid={`ocean-node-${node.nodeId}`}
                >
                  <span className="military-region__icon">🌊</span>
                  <span className="military-region__name">
                    {label}
                    {node.isBlockaded ? " 🚫" : ""}
                  </span>
                  <span className="military-region__goods-inline">
                    舰队 {myFleet}
                    {node.controller ? ` · 控制：${node.controller}` : ""}
                  </span>
                  <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                    <button
                      aria-label={`减少在${label}的舰队部署`}
                      className="military-action-card__btn"
                      type="button"
                      disabled={!canDecrement}
                      onClick={() => onNavalDeploymentChange(node.nodeId, myFleet - 1)}
                    >-</button>
                    <button
                      aria-label={`增加在${label}的舰队部署`}
                      className="military-action-card__btn"
                      type="button"
                      disabled={!canIncrement}
                      onClick={() => onNavalDeploymentChange(node.nodeId, myFleet + 1)}
                    >+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h4 className="military-section-label">🗺️ 海外区域</h4>
      <div className="military-regions">
        {mil.regionAccessStatus.map((region) => (
          <div
            key={region.regionId}
            className={`military-region ${region.isAccessible ? "military-region--accessible" : "military-region--locked"}`}
          >
            <span className="military-region__icon">{REGION_ICONS[region.regionId] ?? "🌐"}</span>
            <span className="military-region__name">
              {region.label}
              {region.isAccessible ? " ✅" : " 🔒"}
            </span>
            <span className="military-region__goods-inline">
              {region.acceptedGoods.map((g) => GOODS_LABELS[g] ?? g).join("·")}
            </span>
          </div>
        ))}
      </div>

      <h4 className="military-section-label">🛡️ 军事行动</h4>
      <div className="military-actions">
        {mil.availableMilitaryActions.map((action) => {
          const count = getCount(action.actionId);
          const canAdd = count < action.maxPerRound && remainingGovernmentBudget >= action.cost;

          return (
            <div
              key={action.actionId}
              className={`military-action-card ${count > 0 ? "military-action-card--selected" : ""} ${!canAdd && count === 0 ? "military-action-card--disabled" : ""}`}
            >
              <div className="military-action-card__head">
                <span className="military-action-card__icon">{ACTION_ICONS[action.actionId] ?? "⚙️"}</span>
                <span className="military-action-card__name">{action.label}</span>
                <span className="military-action-card__cost">{action.cost}</span>
              </div>
              <p className="military-action-card__desc">{action.description}</p>
              {(() => {
                const effectMetrics = buildEffectMetrics(action.effects);
                return effectMetrics.length > 0 ? (
                  <div className="military-action-card__effects">
                    {effectMetrics.map((em) => (
                      <span key={em.label} className="military-action-card__effect-tag">
                        {em.label} {em.value}{em.temporary ? " 本回合" : ""}
                      </span>
                    ))}
                  </div>
                ) : null;
              })()}
              <div className="military-action-card__footer">
                <span className="military-action-card__count">{count}/{action.maxPerRound}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {count > 0 && (
                    <button
                      aria-label={`撤回动作：${action.label}`}
                      className="military-action-card__btn"
                      type="button"
                      onClick={() => onRemoveMilitary(action.actionId)}
                    >-</button>
                  )}
                  <button
                    aria-label={`确认动作：${action.label}`}
                    className={`military-action-card__btn ${count > 0 ? "military-action-card__btn--active" : ""}`}
                    type="button"
                    disabled={!canAdd}
                    onClick={() => onAddMilitary(action.actionId)}
                  >+</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {mil.availableDiplomacyActions.length > 0 && (
        <>
          <h4 className="military-section-label">🤝 外交行动</h4>
          <div className="military-actions">
            {mil.availableDiplomacyActions.map((action) => {
              const selected = draft.militaryPlan.diplomacyActions.some((a) => a.actionId === action.actionId);
              const canAfford = remainingGovernmentBudget >= action.cost;

              return (
                <div
                  key={action.actionId}
                  className={`military-action-card ${action.isEstablished ? "military-action-card--disabled" : selected ? "military-action-card--selected" : ""}`}
                >
                  <div className="military-action-card__head">
                    <span className="military-action-card__icon">{ACTION_ICONS[action.actionId] ?? "🤝"}</span>
                    <span className="military-action-card__name">{action.label}</span>
                    <span className="military-action-card__cost">{action.cost}</span>
                  </div>
                  <p className="military-action-card__desc">
                    {action.isEstablished ? `${action.targetRegionLabel} 已建交` : `与${action.targetRegionLabel}建立外交关系`}
                  </p>
                  <div className="military-action-card__footer">
                    <span className="military-action-card__count">
                      {action.isEstablished ? "✅ 已完成" : selected ? "✓ 已选择" : "可发起"}
                    </span>
                    {action.isEstablished ? (
                      <span className="military-action-card__btn military-action-card__btn--done">已建交</span>
                    ) : (
                      <button
                        aria-label={action.label}
                        className={`military-action-card__btn ${selected ? "military-action-card__btn--active" : ""}`}
                        type="button"
                        disabled={!selected && !canAfford}
                        onClick={() => onToggleDiplomacy(action.actionId, !selected)}
                      >
                        {selected ? "取消" : "建交"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h4 className="military-section-label">👑 殖民扩张</h4>
      <div className="military-actions">
        <div
          className={`military-action-card ${previewIsUnlocked ? "military-action-card--selected" : ""} ${!capability.isUnlocked && !unlockSelected && remainingGovernmentBudget < capability.unlockCost ? "military-action-card--disabled" : ""}`}
        >
          <div className="military-action-card__head">
            <span className="military-action-card__icon">👑</span>
            <span className="military-action-card__name">殖民扩张</span>
            <span className="military-action-card__cost">{capability.unlockCost}</span>
          </div>
          <p className="military-action-card__desc">
            支付 {capability.unlockCost} 政府财政永久解锁殖民能力。解锁后，殖民执行只消耗 {capability.militaryPointCost} 军事点。
          </p>
          <div className="military-action-card__footer">
            <span className="military-action-card__count">
              {capability.isUnlocked ? "✅ 已永久解锁" : unlockSelected ? "✓ 本轮解锁" : "未解锁"}
            </span>
            {capability.isUnlocked ? (
              <span className="military-action-card__btn military-action-card__btn--done">已解锁</span>
            ) : (
              <button
                className={`military-action-card__btn ${unlockSelected ? "military-action-card__btn--active" : ""}`}
                type="button"
                disabled={!unlockSelected && remainingGovernmentBudget < capability.unlockCost}
                onClick={() => onToggleColonizationUnlock(!unlockSelected)}
              >
                {unlockSelected ? "取消" : "解锁"}
              </button>
            )}
          </div>
        </div>
      </div>

      {mil.colonizationOptions.length > 0 && (
        <>
          <h4 className="military-section-label">🏴 殖民目标</h4>
          <div className="military-actions">
            {mil.colonizationOptions.map((option) => {
              const isSelected = draft.militaryPlan.colonizationActions.some(
                (a) => a.targetRegionId === option.regionId,
              );
              const previewHasDiplomacy = previewEstablishedDiplomacy.has(option.regionId);
              const previewHasMilitary = mil.militaryPoints >= capability.militaryPointCost;
              const previewCanColonize = !option.isColonized && previewIsUnlocked && previewHasDiplomacy && previewHasMilitary;
              const lockReasonParts: string[] = [];
              if (!option.isColonized) {
                if (!previewIsUnlocked) lockReasonParts.push("需先解锁殖民");
                if (!previewHasDiplomacy) lockReasonParts.push("建立外交关系");
                if (!previewHasMilitary) lockReasonParts.push(`${capability.militaryPointCost}军事点`);
              }
              const previewLockedReason = option.isColonized
                ? "已被殖民"
                : lockReasonParts.length > 0
                  ? `🔒 ${lockReasonParts.join(" + ")}`
                  : null;
              const statusText = option.isColonized
                ? "👑 已殖民"
                : isSelected
                  ? "✓ 已选择"
                  : previewLockedReason ?? "可殖民";

              const isAccessible = accessibleRegionIds.has(option.regionId);
              const conquestEntry = conquestActions.find((a) => a.regionId === option.regionId);
              const infantry = conquestEntry?.infantry ?? 0;
              const artillery = conquestEntry?.artillery ?? 0;
              const power = infantry + artillery * 2;
              const garrisonEntries = Object.entries(option.garrison ?? {}).filter(([, n]) => n > 0);
              const garrisonInf = Number(option.garrison?.infantry ?? 0);
              const garrisonArt = Number(option.garrison?.artillery ?? 0);
              const defenderPower = garrisonInf + garrisonArt * 2;
              const conquestThreshold = Math.max(1, defenderPower * 2);
              const resourceEntries = Object.entries(option.resourceLimit ?? {}).filter(([, n]) => n > 0);
              const lootedSet = new Set(
                lootingActions.filter((a) => a.regionId === option.regionId).map((a) => a.resourceType),
              );

              return (
                <div
                  key={option.regionId}
                  className={`military-action-card ${option.isColonized ? "military-action-card--disabled" : isSelected ? "military-action-card--selected" : !previewCanColonize ? "military-action-card--disabled" : ""}`}
                >
                  <div className="military-action-card__head">
                    <span className="military-action-card__icon">{REGION_ICONS[option.regionId] ?? "👑"}</span>
                    <span className="military-action-card__name">{option.regionLabel}</span>
                  </div>
                  <p className="military-action-card__desc">
                    {option.isColonized
                      ? `${option.regionLabel}已被殖民`
                      : `殖民成功后，每回合获得 ${capability.incomePerColonyPerRound} 点国家收入，并按当前比例分配。`}
                  </p>
                  <div className="military-action-card__footer">
                    <span className="military-action-card__count">{statusText}</span>
                    {option.isColonized ? (
                      <span className="military-action-card__btn military-action-card__btn--done">已殖民</span>
                    ) : (
                      <button
                        aria-label={`殖民${option.regionLabel}`}
                        className={`military-action-card__btn ${isSelected ? "military-action-card__btn--active" : ""}`}
                        type="button"
                        disabled={!isSelected && !previewCanColonize}
                        onClick={() => (isSelected ? onCancelColonize(option.regionId) : onColonize(option.regionId))}
                      >
                        {isSelected ? "取消" : "殖民"}
                      </button>
                    )}
                  </div>

                  {option.isColonized && typeof option.independence === "number" && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ fontSize: 12 }}>
                        独立度 {option.independence}%
                        {option.independence >= 60 ? " ⚠️" : ""}
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: 6,
                          background: "rgba(255,255,255,0.1)",
                          borderRadius: 3,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.max(0, Math.min(100, option.independence))}%`,
                            height: "100%",
                            background: independenceColor(option.independence),
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {option.isColonized && garrisonEntries.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      驻军: {garrisonEntries.map(([country, n]) => `${country}×${n}`).join(" ")}
                    </div>
                  )}

                  {option.isColonized && resourceEntries.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ fontSize: 12 }}>
                        资源: {resourceEntries.map(([res, n]) => `${GOODS_LABELS[res] ?? res}×${n}`).join(" ")}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {resourceEntries.map(([res]) => {
                          const resLabel = GOODS_LABELS[res] ?? res;
                          const isLooted = lootedSet.has(res);
                          return (
                            <button
                              key={res}
                              aria-label={`掠夺${option.regionLabel}${resLabel}`}
                              className={`military-action-card__btn ${isLooted ? "military-action-card__btn--active" : ""}`}
                              type="button"
                              onClick={() => onLootingToggle(option.regionId, res)}
                            >
                              掠夺{resLabel}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: "#d4a017" }}>
                        ⚠️ 掠夺会增加殖民地独立倾向 (+2)
                      </div>
                    </div>
                  )}

                  {!option.isColonized && isAccessible && (
                    <div
                      data-testid={`conquest-${option.regionId}`}
                      style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600 }}>⚔️ 征服</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <span style={{ minWidth: 96 }}>步兵: {infantry} (消耗 {infantry * 10} 军事点)</span>
                        <button
                          aria-label={`减少${option.regionLabel}步兵`}
                          className="military-action-card__btn"
                          type="button"
                          disabled={infantry <= 0}
                          onClick={() => onConquestChange(option.regionId, infantry - 1, artillery)}
                        >-</button>
                        <button
                          aria-label={`增加${option.regionLabel}步兵`}
                          className="military-action-card__btn"
                          type="button"
                          disabled={infantry >= maxInfantryByPoints}
                          onClick={() => onConquestChange(option.regionId, infantry + 1, artillery)}
                        >+</button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <span style={{ minWidth: 96 }}>炮兵: {artillery} (消耗 {artillery * 16} 金币)</span>
                        <button
                          aria-label={`减少${option.regionLabel}炮兵`}
                          className="military-action-card__btn"
                          type="button"
                          disabled={artillery <= 0}
                          onClick={() => onConquestChange(option.regionId, infantry, artillery - 1)}
                        >-</button>
                        <button
                          aria-label={`增加${option.regionLabel}炮兵`}
                          className="military-action-card__btn"
                          type="button"
                          disabled={artillery >= maxArtilleryByBudget}
                          onClick={() => onConquestChange(option.regionId, infantry, artillery + 1)}
                        >+</button>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        战力 = {power}（步兵 {infantry} + 炮兵×2 {artillery * 2}）
                        {defenderPower > 0
                          ? ` · 守军战力 = ${defenderPower}（步兵 ${garrisonInf} + 炮兵×2 ${garrisonArt * 2}）· 需≥${conquestThreshold}`
                          : ""}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
