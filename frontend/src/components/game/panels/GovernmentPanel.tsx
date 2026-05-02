import type { DecisionPlayerPhaseWorkspace, IdeologyKey } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import { DecisionStatStrip } from "./shared/DecisionStatStrip";
import "./GovernmentPanel.css";

const REFORM_PATH_LABELS: Record<"freedom" | "equality" | "national", string> = {
  freedom: "自由之路",
  equality: "平等之路",
  national: "民族之路",
};

const REFORM_PATH_ICONS: Record<"freedom" | "equality" | "national", string> = {
  freedom: "🗽",
  equality: "⚖️",
  national: "🛡️",
};

const IDEOLOGY_META: Record<IdeologyKey, { label: string; icon: string }> = {
  liberalism: { label: "自由主义", icon: "📈" },
  egalitarianism: { label: "平等主义", icon: "🤝" },
  nationalism: { label: "民族主义", icon: "🛡️" },
};

const IDEOLOGY_KEYS: IdeologyKey[] = ["liberalism", "egalitarianism", "nationalism"];

const IDEOLOGY_LABELS: Record<IdeologyKey, string> = {
  liberalism: "自由主义",
  egalitarianism: "平等主义",
  nationalism: "民族主义",
};

function projectIdeologyAfterReform(
  current: Record<string, number>,
  effects: Record<string, unknown>,
): Record<string, number> {
  const projected: Record<string, number> = { ...current };
  const delta = effects.ideologyDelta as Record<string, number> | undefined;
  if (delta) {
    for (const [key, val] of Object.entries(delta)) {
      projected[key] = (projected[key] ?? 0) + val;
    }
  }
  return projected;
}

function formatReformEffects(
  effects: Record<string, unknown>,
  unlocksPolicies: string[],
): string[] {
  const tags: string[] = [];

  const ideologyDelta = effects.ideologyDelta as Record<string, number> | undefined;
  if (ideologyDelta) {
    for (const [key, delta] of Object.entries(ideologyDelta)) {
      const label = IDEOLOGY_LABELS[key as IdeologyKey] ?? key;
      tags.push(`${label} ${delta > 0 ? "+" : ""}${delta}`);
    }
  }

  const ratioDelta = effects.ratioDelta as Record<string, number> | undefined;
  if (ratioDelta) {
    const names: Record<string, string> = {
      factory: "工厂",
      consumption: "国内市场",
      fiscal: "政府财政",
      domesticMarket: "国内",
      governmentFiscal: "政府",
    };
    for (const [key, delta] of Object.entries(ratioDelta)) {
      const label = names[key] ?? key;
      tags.push(`${label}分配 ${delta > 0 ? "+" : ""}${delta}`);
    }
  }

  const ratioOverride = effects.ratioOverride as Record<string, number> | undefined;
  if (ratioOverride) {
    const names: Record<string, string> = {
      factory: "工厂",
      consumption: "国内市场",
      fiscal: "政府财政",
    };
    const parts = Object.entries(ratioOverride).map(
      ([k, v]) => `${names[k] ?? k}:${v}`,
    );
    tags.push(`分配锁定 ${parts.join("/")}`);
  }

  if (effects.upgradeCostMultiplier !== undefined) {
    tags.push(`升级成本 ×${effects.upgradeCostMultiplier}`);
  }

  if (effects.productionCapacityDelta !== undefined) {
    const delta = effects.productionCapacityDelta as Record<string, number>;
    for (const [key, val] of Object.entries(delta)) {
      tags.push(`${key === "all" ? "全品类" : key}产能 ${val > 0 ? "+" : ""}${val}`);
    }
  }

  const permanent = effects.permanent as Record<string, unknown> | undefined;
  if (permanent) {
    if (permanent.techPointsPerTurn !== undefined) {
      tags.push(`每回合 +${permanent.techPointsPerTurn} 科技点`);
    }
  }

  if (unlocksPolicies.length > 0) {
    tags.push(`解锁 ${unlocksPolicies.length} 项政策`);
  }

  return tags;
}

export interface GovernmentPanelProps {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingGovernmentBudget: number;
  onAdminPurchase: (quantity: number) => void;
  onEnactReform: (reformId: string, queued: boolean) => void;
  onTogglePolicy: (policyId: string, active: boolean) => void;
  onToggleStrategy: (actionId: string, checked: boolean) => void;
}

export function GovernmentPanel({
  workspace,
  draft,
  remainingGovernmentBudget,
  onAdminPurchase,
  onEnactReform,
  onTogglePolicy,
  onToggleStrategy,
}: GovernmentPanelProps) {
  const reforms = workspace.governmentReforms;
  if (!reforms) {
    return (
      <section className="government-panel" data-testid="government-panel">
        <div className="government-panel__header">
          <h3 className="government-panel__title">🏛️ 议会大厅</h3>
          <span className="government-panel__budget">政府财政 {remainingGovernmentBudget}</span>
        </div>
        <p>议会数据未就绪。</p>
      </section>
    );
  }

  const queuedAdminPurchases = Math.max(0, draft.governmentPlan.adminPurchases ?? 0);
  const adminCost = reforms.adminPurchaseCost;
  const queuedReformIds = new Set(draft.reforms ?? []);
  const queuedActivateIds = new Set(draft.activatePolicies ?? []);
  const queuedDeactivateIds = new Set(draft.deactivatePolicies ?? []);

  const strategies = workspace.governmentActions?.strategies ?? [];
  const queuedStrategyIds = new Set(
    (draft.governmentPlan.strategySelections ?? []).map((selection) => selection.actionId),
  );

  const queuedReformAdminCost = reforms.availableReforms
    .filter((reform) => queuedReformIds.has(reform.reformId))
    .reduce((sum, reform) => sum + reform.adminCost, 0);
  const projectedActivePolicyUpkeep = reforms.availablePolicies
    .filter((policy) => {
      if (queuedActivateIds.has(policy.policyId)) return true;
      if (queuedDeactivateIds.has(policy.policyId)) return false;
      return policy.isActive;
    })
    .reduce((sum, policy) => sum + policy.adminCostPerTurn, 0);
  const projectedAdmin =
    reforms.administrationCapacity
    + queuedAdminPurchases
    - queuedReformAdminCost
    - projectedActivePolicyUpkeep;

  const isPolicyActiveAfter = (policyId: string, currentlyActive: boolean): boolean => {
    if (queuedActivateIds.has(policyId)) return true;
    if (queuedDeactivateIds.has(policyId)) return false;
    return currentlyActive;
  };

  const reformsByPath: Record<"freedom" | "equality" | "national", typeof reforms.availableReforms> = {
    freedom: [],
    equality: [],
    national: [],
  };
  for (const reform of reforms.availableReforms) {
    reformsByPath[reform.path].push(reform);
  }

  const activePolicies = reforms.availablePolicies.filter((policy) => policy.isActive);
  const inactivePolicies = reforms.availablePolicies.filter((policy) => !policy.isActive);

  const canBuyAdmin = remainingGovernmentBudget >= adminCost;

  return (
    <section className="government-panel" data-testid="government-panel">
      <div className="government-panel__header">
        <h3 className="government-panel__title">🏛️ 议会大厅</h3>
        <span className="government-panel__budget">政府财政 {remainingGovernmentBudget}</span>
      </div>

      <DecisionStatStrip
        items={[
          { icon: "📜", value: reforms.administrationCapacity, label: "行政力" },
          { icon: "🧮", value: projectedAdmin, label: "本轮剩余" },
          { icon: "📚", value: reforms.completedReforms.length, label: "已完成改革" },
          { icon: "⚙️", value: activePolicies.length, label: "现行政策" },
        ]}
      />

      {/* ── 行政力购买 ── */}
      <h4 className="government-section-label">💰 提升行政力</h4>
      <div className="government-actions">
        <div
          className={`government-action-card ${queuedAdminPurchases > 0 ? "government-action-card--selected" : ""} ${!canBuyAdmin && queuedAdminPurchases === 0 ? "government-action-card--disabled" : ""}`}
        >
          <div className="government-action-card__head">
            <span className="government-action-card__icon">📜</span>
            <span className="government-action-card__name">购买行政力</span>
            <span className="government-action-card__cost">{adminCost}/点</span>
          </div>
          <p className="government-action-card__desc">
            动用政府财政扩张文官系统，立刻获得行政力以推进改革或维系政策。
          </p>
          <div className="government-action-card__effects">
            <span className="government-action-card__effect-tag">已购 {queuedAdminPurchases} 点</span>
            <span className="government-action-card__effect-tag">
              本轮花费 {queuedAdminPurchases * adminCost} 财政
            </span>
          </div>
          <div className="government-action-card__footer">
            <span className="government-action-card__status">
              {queuedAdminPurchases > 0
                ? `✓ 本轮 -${queuedAdminPurchases * adminCost} 财政 / +${queuedAdminPurchases} 行政力`
                : !canBuyAdmin
                  ? "财政不足"
                  : "可购买"}
            </span>
            <div className="government-action-card__stepper">
              {queuedAdminPurchases > 0 && (
                <button
                  aria-label="减少行政力购买"
                  className="government-action-card__btn"
                  type="button"
                  onClick={() => onAdminPurchase(queuedAdminPurchases - 1)}
                >
                  −
                </button>
              )}
              <button
                aria-label="增加行政力购买"
                className={`government-action-card__btn ${queuedAdminPurchases > 0 ? "government-action-card__btn--active" : ""}`}
                type="button"
                disabled={!canBuyAdmin}
                onClick={() => onAdminPurchase(queuedAdminPurchases + 1)}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 思潮信号 ── */}
      <h4 className="government-section-label">
        🧭 思潮信号
        <span
          className="government-section-hint"
          title={`任一意识形态达到 ${reforms.revolutionThreshold} 将触发革命`}
        >
          （达到 {reforms.revolutionThreshold} 触发革命）
        </span>
      </h4>
      <div className="government-stats">
        {IDEOLOGY_KEYS.map((key) => {
          const meta = IDEOLOGY_META[key];
          const level = reforms.ideologyLevels[key] ?? 0;
          const isCritical = level >= reforms.revolutionThreshold;
          return (
            <div
              key={key}
              className={`government-stat ${isCritical ? "government-stat--critical" : ""}`}
              data-testid={`ideology-${key}`}
            >
              <span className="government-stat__icon">{meta.icon}</span>
              <span className="government-stat__value">
                {level} / {reforms.revolutionThreshold}
              </span>
              <span className="government-stat__label">{meta.label}</span>
            </div>
          );
        })}
      </div>

      {/* ── 改革路径 ── */}
      {(["freedom", "equality", "national"] as const).map((path) => {
        const list = reformsByPath[path];
        if (list.length === 0) return null;
        return (
          <div key={path}>
            <h4 className="government-section-label">
              {REFORM_PATH_ICONS[path]} {REFORM_PATH_LABELS[path]}
            </h4>
            <div className="government-actions">
              {list.map((reform) => {
                const queued = queuedReformIds.has(reform.reformId);
                const overCapacity = !queued && projectedAdmin < reform.adminCost;
                const lockedReason = reform.isCompleted
                  ? "已实施"
                  : reform.isBlocked
                    ? "路径已封锁"
                    : overCapacity
                      ? "行政力不足"
                      : null;
                const isDisabled = reform.isCompleted || reform.isBlocked;
                const reformEffects = (reform.effects ?? {}) as Record<string, unknown>;
                const projectedIdeology = projectIdeologyAfterReform(
                  reforms.ideologyLevels,
                  reformEffects,
                );
                const triggeringIdeologies = reform.isCompleted
                  ? []
                  : IDEOLOGY_KEYS.filter(
                      (key) => (projectedIdeology[key] ?? 0) >= reforms.revolutionThreshold,
                    );
                const wouldTriggerRevolution = triggeringIdeologies.length > 0;
                const productionCapacityDelta = reformEffects.productionCapacityDelta as
                  | Record<string, number>
                  | undefined;
                const globalProductionPenalty =
                  productionCapacityDelta?.all !== undefined && productionCapacityDelta.all < 0
                    ? productionCapacityDelta.all
                    : null;
                return (
                  <div
                    key={reform.reformId}
                    className={`government-action-card ${queued ? "government-action-card--selected" : ""} ${!queued && lockedReason ? "government-action-card--disabled" : ""} ${wouldTriggerRevolution ? "government-action-card--danger" : ""}`}
                  >
                    <div className="government-action-card__head">
                      <span className="government-action-card__icon">
                        {wouldTriggerRevolution ? "⚠️" : REFORM_PATH_ICONS[path]}
                      </span>
                      <span className="government-action-card__name">{reform.label}</span>
                      <span className="government-action-card__cost">{reform.adminCost} 行政</span>
                    </div>
                    <p className="government-action-card__desc">
                      {REFORM_PATH_LABELS[path]} · 实施后永久改变国家结构。
                    </p>
                    {wouldTriggerRevolution && (
                      <p
                        className="government-action-card__warning"
                        data-testid={`reform-revolution-warning-${reform.reformId}`}
                      >
                        ⚠️ 实施将触发革命：
                        {triggeringIdeologies
                          .map(
                            (key) =>
                              `${IDEOLOGY_LABELS[key]} ${reforms.ideologyLevels[key] ?? 0}→${projectedIdeology[key]} ≥ ${reforms.revolutionThreshold}`,
                          )
                          .join("，")}
                      </p>
                    )}
                    {globalProductionPenalty !== null && (
                      <p className="government-action-card__warning government-action-card__warning--soft">
                        ⚠️ 全局产能 {globalProductionPenalty}
                      </p>
                    )}
                    {(() => {
                      const effectTags = formatReformEffects(
                        reformEffects,
                        reform.unlocksPolicies ?? [],
                      );
                      if (effectTags.length === 0) return null;
                      return (
                        <div className="government-action-card__effects">
                          {effectTags.map((tag) => (
                            <span key={tag} className="government-action-card__effect-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                    <div className="government-action-card__footer">
                      <span className="government-action-card__status">
                        {queued ? "✓ 已排队" : lockedReason ?? "可实施"}
                      </span>
                      <button
                        aria-label={`实施改革：${reform.label}`}
                        className={`government-action-card__btn ${queued ? "government-action-card__btn--active" : ""}`}
                        type="button"
                        disabled={isDisabled || (!queued && lockedReason !== null)}
                        onClick={() => onEnactReform(reform.reformId, !queued)}
                      >
                        {reform.isCompleted ? "已实施" : queued ? "撤回" : "实施"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── 政策（生效中） ── */}
      {activePolicies.length > 0 && (
        <>
          <h4 className="government-section-label">⚙️ 现行政策</h4>
          <div className="government-actions">
            {activePolicies.map((policy) => {
              const active = isPolicyActiveAfter(policy.policyId, policy.isActive);
              return (
                <div
                  key={policy.policyId}
                  className={`government-action-card ${active ? "government-action-card--selected" : ""}`}
                >
                  <div className="government-action-card__head">
                    <span className="government-action-card__icon">📋</span>
                    <span className="government-action-card__name">{policy.label}</span>
                    <span className="government-action-card__cost">{policy.adminCostPerTurn}/回合</span>
                  </div>
                  <p className="government-action-card__desc">{policy.description}</p>
                  <div className="government-action-card__effects">
                    <span className="government-action-card__effect-tag">
                      {active ? "持续生效" : "本轮停用"}
                    </span>
                  </div>
                  <div className="government-action-card__footer">
                    <span className="government-action-card__status">
                      每回合行政 {policy.adminCostPerTurn}
                    </span>
                    <button
                      aria-label={`${active ? "停用政策" : "恢复政策"}：${policy.label}`}
                      className={`government-action-card__btn ${!active ? "government-action-card__btn--active" : ""}`}
                      type="button"
                      onClick={() => onTogglePolicy(policy.policyId, !active)}
                    >
                      {active ? "停用" : "恢复"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── 政策（可激活） ── */}
      {inactivePolicies.length > 0 && (
        <>
          <h4 className="government-section-label">🆕 可激活政策</h4>
          <div className="government-actions">
            {inactivePolicies.map((policy) => {
              const active = isPolicyActiveAfter(policy.policyId, policy.isActive);
              const lockedReason = !policy.isUnlocked
                ? policy.requiresReform
                  ? `需改革：${policy.requiresReform}`
                  : "未解锁"
                : null;
              const isDisabled = lockedReason !== null && !active;
              return (
                <div
                  key={policy.policyId}
                  className={`government-action-card ${active ? "government-action-card--selected" : ""} ${!active && lockedReason ? "government-action-card--disabled" : ""}`}
                >
                  <div className="government-action-card__head">
                    <span className="government-action-card__icon">🆕</span>
                    <span className="government-action-card__name">{policy.label}</span>
                    <span className="government-action-card__cost">{policy.adminCostPerTurn}/回合</span>
                  </div>
                  <p className="government-action-card__desc">{policy.description}</p>
                  <div className="government-action-card__effects">
                    <span className="government-action-card__effect-tag">
                      行政 {policy.adminCostPerTurn} · 预算 {policy.budgetCost}
                    </span>
                    {lockedReason ? (
                      <span className="government-action-card__effect-tag">{lockedReason}</span>
                    ) : null}
                  </div>
                  <div className="government-action-card__footer">
                    <span className="government-action-card__status">
                      {active ? "✓ 本轮激活" : lockedReason ?? "可激活"}
                    </span>
                    <button
                      aria-label={`激活政策：${policy.label}`}
                      className={`government-action-card__btn ${active ? "government-action-card__btn--active" : ""}`}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => onTogglePolicy(policy.policyId, !active)}
                    >
                      {active ? "撤回" : "激活"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── 本回合策略（一次性） ── */}
      {strategies.length > 0 && (
        <>
          <h4 className="government-section-label">🎯 本回合策略</h4>
          <div className="government-actions">
            {strategies.map((strategy) => {
              const queued = queuedStrategyIds.has(strategy.actionId);
              const overBudget = !queued && remainingGovernmentBudget < strategy.cost;
              const lockedReason = strategy.lockedReason ?? (overBudget ? "财政不足" : null);
              const isDisabled = !queued && lockedReason !== null;
              return (
                <div
                  key={strategy.actionId}
                  className={`government-action-card ${queued ? "government-action-card--selected" : ""} ${!queued && lockedReason ? "government-action-card--disabled" : ""}`}
                >
                  <div className="government-action-card__head">
                    <span className="government-action-card__icon">🎯</span>
                    <span className="government-action-card__name">{strategy.label}</span>
                    <span className="government-action-card__cost">{strategy.cost} 财政</span>
                  </div>
                  {strategy.description && (
                    <p className="government-action-card__desc">{strategy.description}</p>
                  )}
                  <div className="government-action-card__footer">
                    <span className="government-action-card__status">
                      {queued ? "✓ 本轮执行" : lockedReason ?? "可选"}
                    </span>
                    <button
                      aria-label={`选择策略：${strategy.label}`}
                      className={`government-action-card__btn ${queued ? "government-action-card__btn--active" : ""}`}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => onToggleStrategy(strategy.actionId, !queued)}
                    >
                      {queued ? "撤回" : "选择"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
