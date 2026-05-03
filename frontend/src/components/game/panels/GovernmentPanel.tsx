import type { DecisionPlayerPhaseWorkspace, IdeologyKey } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import type { DecisionActionCardEffect } from "./shared/DecisionActionCard";
import { DecisionStatStrip } from "./shared/DecisionStatStrip";
import { DecisionActionCard } from "./shared/DecisionActionCard";
import { buildEffectMetrics } from "../../../features/game/decisionShared";
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

const RATIO_NAME_MAP: Record<string, string> = {
  domesticMarket: "国内",
  governmentFiscal: "政府",
  factory: "工厂",
  consumption: "消费",
  fiscal: "财政",
};

function formatStrategyEffects(
  strategy: { effects?: Record<string, number | Record<string, number>>; ratioDelta?: Record<string, number> },
): DecisionActionCardEffect[] {
  const effects: DecisionActionCardEffect[] = [];

  if (strategy.effects) {
    effects.push(...buildEffectMetrics(strategy.effects));
  }

  if (strategy.ratioDelta) {
    const parts = Object.entries(strategy.ratioDelta).map(([key, delta]) => {
      const label = RATIO_NAME_MAP[key] ?? key;
      const sign = delta > 0 ? "+" : "";
      return `${label} ${sign}${delta}`;
    });
    if (parts.length > 0) {
      effects.push({ label: `分配偏移：${parts.join(", ")}`, value: "", temporary: true });
    }
  }

  return effects;
}

function formatPolicyEffects(
  policy: { effects?: Record<string, unknown>; adminCostPerTurn: number; budgetCost: number },
): DecisionActionCardEffect[] {
  const effects: DecisionActionCardEffect[] = [];

  if (!policy.effects) return effects;

  const e = policy.effects;
  const ratioDelta = e.ratioDelta as Record<string, number> | undefined;
  if (ratioDelta) {
    const names: Record<string, string> = { consumption: "消费池", fiscal: "财政池", factory: "工厂池", domesticMarket: "国内", governmentFiscal: "政府" };
    for (const [key, delta] of Object.entries(ratioDelta)) {
      effects.push({ label: `${names[key] ?? key}分配 ${delta > 0 ? "+" : ""}${delta}`, value: "" });
    }
  }

  const ideologyDelta = e.ideologyDelta as Record<string, number> | undefined;
  if (ideologyDelta) {
    for (const [key, delta] of Object.entries(ideologyDelta)) {
      effects.push({ label: `${IDEOLOGY_LABELS[key as IdeologyKey] ?? key}思潮 ${delta > 0 ? "+" : ""}${delta}`, value: "" });
    }
  }

  if (e.militaryPointsDelta !== undefined) {
    const delta = e.militaryPointsDelta as number;
    effects.push({ label: `军事点数 ${delta > 0 ? "+" : ""}${delta}`, value: "" });
  }

  if (e.fiscalRefund !== undefined) {
    effects.push({ label: `返还政府财政 ${e.fiscalRefund}`, value: "" });
  }

  if (e.administrationCapacityDelta !== undefined) {
    const delta = e.administrationCapacityDelta as number;
    effects.push({ label: `行政力上限 ${delta > 0 ? "+" : ""}${delta}`, value: "" });
  }

  const permanent = e.permanent as Record<string, unknown> | undefined;
  if (permanent) {
    if (permanent.techPointsPerTurn !== undefined) {
      effects.push({ label: `每回合 +${permanent.techPointsPerTurn} 科技点`, value: "" });
    }
  }

  return effects;
}

export interface GovernmentPanelProps {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingGovernmentBudget: number;
  onAdminPurchase: (quantity: number) => void;
  onTechPurchase: (quantity: number) => void;
  onMilitaryPurchase: (quantity: number) => void;
  onEnactReform: (reformId: string, queued: boolean) => void;
  onTogglePolicy: (policyId: string, active: boolean) => void;
  onToggleStrategy: (actionId: string, checked: boolean) => void;
}

export function GovernmentPanel({
  workspace,
  draft,
  remainingGovernmentBudget,
  onAdminPurchase,
  onTechPurchase,
  onMilitaryPurchase,
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

  const pointPurchaseCosts = workspace.governmentActions?.pointPurchaseCosts ?? { tech: 0, military: 0 };
  const techCost = pointPurchaseCosts.tech;
  const militaryCost = pointPurchaseCosts.military;
  const queuedTechPurchases = draft.governmentPlan.pointPurchases.find((p) => p.pointType === "tech")?.quantity ?? 0;
  const queuedMilitaryPurchases = draft.governmentPlan.pointPurchases.find((p) => p.pointType === "military")?.quantity ?? 0;
  const pointSpend = queuedTechPurchases * techCost + queuedMilitaryPurchases * militaryCost;
  const budgetAfterPointSpend = remainingGovernmentBudget - pointSpend;
  const canBuyTech = remainingGovernmentBudget >= techCost;
  const canBuyMilitary = remainingGovernmentBudget >= militaryCost;

  return (
    <section className="government-panel" data-testid="government-panel">
      <div className="government-panel__header">
        <h3 className="government-panel__title">🏛️ 议会大厅</h3>
        <span className="government-panel__budget">政府财政 {remainingGovernmentBudget}</span>
      </div>

      <DecisionStatStrip
        items={[
          { icon: "📜", value: reforms.administrationCapacity, label: "行政力" },
          { icon: "🧮", value: projectedAdmin, label: "剩余行政力" },
          { icon: "📚", value: reforms.completedReforms.length, label: "已完成改革" },
          { icon: "⚙️", value: activePolicies.length, label: "现行政策" },
        ]}
      />

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

      {/* ── 改革路径（三列对比） ── */}
      <div className="gov-reform-tracks">
        {(["freedom", "equality", "national"] as const).map((path) => {
          const list = reformsByPath[path];
          return (
            <div key={path} className="gov-reform-track">
              <h4 className="government-section-label gov-reform-track__header">
                {REFORM_PATH_ICONS[path]} {REFORM_PATH_LABELS[path]}
              </h4>
              <div className="government-actions gov-reform-track__list">
                {list.length === 0 ? (
                  <p className="gov-reform-track__empty">暂无可选改革</p>
                ) : list.map((reform) => {
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
                const effectTags = formatReformEffects(
                  reformEffects,
                  reform.unlocksPolicies ?? [],
                );
                const status = wouldTriggerRevolution
                  ? "danger"
                  : queued
                    ? "selected"
                    : lockedReason
                      ? "disabled"
                      : "available";
                const warningNode = wouldTriggerRevolution || globalProductionPenalty !== null ? (
                  <>
                    {wouldTriggerRevolution && (
                      <span data-testid={`reform-revolution-warning-${reform.reformId}`}>
                        ⚠️ 实施将触发革命：
                        {triggeringIdeologies
                          .map(
                            (key) =>
                              `${IDEOLOGY_LABELS[key]} ${reforms.ideologyLevels[key] ?? 0}→${projectedIdeology[key]} ≥ ${reforms.revolutionThreshold}`,
                          )
                          .join("，")}
                      </span>
                    )}
                    {globalProductionPenalty !== null && (
                      <span style={{ display: "block", marginTop: wouldTriggerRevolution ? 4 : 0 }}>
                        ⚠️ 全局产能 {globalProductionPenalty}
                      </span>
                    )}
                  </>
                ) : null;
                return (
                  <DecisionActionCard
                    key={reform.reformId}
                    icon={wouldTriggerRevolution ? "⚠️" : REFORM_PATH_ICONS[path]}
                    title={reform.label}
                    costLabel={`消耗 ${reform.adminCost} 行政力`}
                    description={`${REFORM_PATH_LABELS[path]} · 实施后永久改变国家结构。`}
                    warning={warningNode}
                    effects={effectTags.map((tag) => ({ label: tag, value: "" }))}
                    status={status}
                    statusText={queued ? "✓ 已排队" : lockedReason ?? "可实施"}
                    control={{
                      kind: "toggle",
                      checked: queued,
                      onChange: (next) => onEnactReform(reform.reformId, next),
                      label: reform.isCompleted ? "已实施" : queued ? "撤回" : "实施",
                      ariaLabel: `实施改革：${reform.label}`,
                      disabled: isDisabled || (!queued && lockedReason !== null),
                    }}
                  />
                );
              })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 政策与策略 二分布局 ── */}
      <div className="gov-policy-split">
        <div className="gov-policy-split__left">
          {/* 政策（生效中） */}
          {activePolicies.length > 0 ? (
            <>
              <h4 className="government-section-label">⚙️ 现行政策</h4>
              <div className="government-actions">
                {activePolicies.map((policy) => {
                  const active = isPolicyActiveAfter(policy.policyId, policy.isActive);
                  return (
                    <DecisionActionCard
                      key={policy.policyId}
                      icon="📋"
                      title={policy.label}
                      costLabel={`消耗 ${policy.adminCostPerTurn} 行政力/回合`}
                      description={policy.description}
                      effects={formatPolicyEffects(policy)}
                      status={active ? "selected" : "available"}
                      statusText={`每回合消耗 ${policy.adminCostPerTurn} 行政力`}
                      control={{
                        kind: "toggle",
                        checked: active,
                        onChange: (next) => onTogglePolicy(policy.policyId, next),
                        label: active ? "停用" : "恢复",
                        ariaLabel: `${active ? "停用政策" : "恢复政策"}：${policy.label}`,
                      }}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <h4 className="government-section-label">⚙️ 现行政策</h4>
              <p className="gov-policy-split__empty">暂未启用政策</p>
            </>
          )}
        </div>

        <div className="gov-policy-split__right">
          {/* 行政力购买 */}
          <h4 className="government-section-label">💰 提升行政力</h4>
          <div className="government-actions">
            <DecisionActionCard
              icon="📜"
              title="购买行政力"
              costLabel={`${adminCost}/点`}
              description="动用政府财政扩张文官系统，立刻获得行政力以推进改革或维系政策。"
              effects={[
                { label: "已购", value: `${queuedAdminPurchases} 点` },
                { label: "本轮花费", value: `${queuedAdminPurchases * adminCost} 财政` },
              ]}
              status={
                queuedAdminPurchases > 0
                  ? "selected"
                  : !canBuyAdmin
                    ? "disabled"
                    : "available"
              }
              statusText={
                queuedAdminPurchases > 0
                  ? `✓ 本轮 -${queuedAdminPurchases * adminCost} 财政 / +${queuedAdminPurchases} 行政力`
                  : !canBuyAdmin
                    ? "财政不足"
                    : "可购买"
              }
              control={{
                kind: "stepper",
                value: queuedAdminPurchases,
                min: 0,
                max: adminCost > 0 ? Math.floor((remainingGovernmentBudget + queuedAdminPurchases * adminCost) / adminCost) : 0,
                onChange: onAdminPurchase,
                incrementAriaLabel: "增加行政力购买",
                decrementAriaLabel: "减少行政力购买",
                incrementDisabled: !canBuyAdmin,
              }}
            />
          </div>

          {/* 点数购买 */}
          {(techCost > 0 || militaryCost > 0) && (
            <>
              <h4 className="government-section-label">🎫 点数购买</h4>
              <div className="government-actions">
                {techCost > 0 && (
                  <DecisionActionCard
                    icon="🔬"
                    title="购买科技点"
                    costLabel={`${techCost}/点`}
                    description="使用政府财政购买科技点数，用于研究和天赋解锁。"
                    effects={[
                      { label: "已购", value: `${queuedTechPurchases} 点` },
                      { label: "本轮花费", value: `${queuedTechPurchases * techCost} 财政` },
                    ]}
                    status={
                      queuedTechPurchases > 0
                        ? "selected"
                        : !canBuyTech
                          ? "disabled"
                          : "available"
                    }
                    statusText={
                      queuedTechPurchases > 0
                        ? `✓ 本轮 -${queuedTechPurchases * techCost} 财政 / +${queuedTechPurchases} 科技点`
                        : !canBuyTech
                          ? "财政不足"
                          : "可购买"
                    }
                    control={{
                      kind: "stepper",
                      value: queuedTechPurchases,
                      min: 0,
                      max: techCost > 0 ? Math.floor((remainingGovernmentBudget + queuedTechPurchases * techCost) / techCost) : 0,
                      onChange: onTechPurchase,
                      incrementAriaLabel: "增加科技点购买",
                      decrementAriaLabel: "减少科技点购买",
                      incrementDisabled: !canBuyTech,
                    }}
                  />
                )}
                {militaryCost > 0 && (
                  <DecisionActionCard
                    icon="⚔️"
                    title="购买军事点"
                    costLabel={`${militaryCost}/点`}
                    description="使用政府财政购买军事点数，用于军事行动。"
                    effects={[
                      { label: "已购", value: `${queuedMilitaryPurchases} 点` },
                      { label: "本轮花费", value: `${queuedMilitaryPurchases * militaryCost} 财政` },
                    ]}
                    status={
                      queuedMilitaryPurchases > 0
                        ? "selected"
                        : !canBuyMilitary
                          ? "disabled"
                          : "available"
                    }
                    statusText={
                      queuedMilitaryPurchases > 0
                        ? `✓ 本轮 -${queuedMilitaryPurchases * militaryCost} 财政 / +${queuedMilitaryPurchases} 军事点`
                        : !canBuyMilitary
                          ? "财政不足"
                          : "可购买"
                    }
                    control={{
                      kind: "stepper",
                      value: queuedMilitaryPurchases,
                      min: 0,
                      max: militaryCost > 0 ? Math.floor((remainingGovernmentBudget + queuedMilitaryPurchases * militaryCost) / militaryCost) : 0,
                      onChange: onMilitaryPurchase,
                      incrementAriaLabel: "增加军事点购买",
                      decrementAriaLabel: "减少军事点购买",
                      incrementDisabled: !canBuyMilitary,
                    }}
                  />
                )}
              </div>
            </>
          )}

          {/* 政策（可激活） */}
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
                  const status = active ? "selected" : lockedReason ? "disabled" : "available";
                  const effects = formatPolicyEffects(policy);
                  if (policy.budgetCost > 0) {
                    effects.unshift({ label: `花费 ${policy.budgetCost} 政府财政`, value: "" });
                  }
                  if (lockedReason) {
                    effects.push({ label: lockedReason, value: "" });
                  }
                  return (
                    <DecisionActionCard
                      key={policy.policyId}
                      icon="🆕"
                      title={policy.label}
                      costLabel={`消耗 ${policy.adminCostPerTurn} 行政力/回合`}
                      description={policy.description}
                      effects={effects}
                      status={status}
                      statusText={active ? "✓ 本轮激活" : lockedReason ?? "可激活"}
                      control={{
                        kind: "toggle",
                        checked: active,
                        onChange: (next) => onTogglePolicy(policy.policyId, next),
                        label: active ? "撤回" : "激活",
                        ariaLabel: `激活政策：${policy.label}`,
                        disabled: isDisabled,
                      }}
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* 本回合策略（一次性） */}
          {strategies.length > 0 && (
            <>
              <h4 className="government-section-label">🎯 本回合策略</h4>
              <div className="government-actions">
                {strategies.map((strategy) => {
                  const queued = queuedStrategyIds.has(strategy.actionId);
                  const overBudget = !queued && remainingGovernmentBudget < strategy.cost;
                  const lockedReason = strategy.lockedReason ?? (overBudget ? "财政不足" : null);
                  const isDisabled = !queued && lockedReason !== null;
                  const status = queued ? "selected" : lockedReason ? "disabled" : "available";
                  return (
                    <DecisionActionCard
                      key={strategy.actionId}
                      icon="🎯"
                      title={strategy.label}
                      costLabel={`${strategy.cost} 财政`}
                      description={strategy.description ?? undefined}
                      effects={formatStrategyEffects(strategy)}
                      status={status}
                      statusText={queued ? "✓ 本轮执行" : lockedReason ?? "可选"}
                      control={{
                        kind: "toggle",
                        checked: queued,
                        onChange: (next) => onToggleStrategy(strategy.actionId, next),
                        label: queued ? "撤回" : "选择",
                        ariaLabel: `选择策略：${strategy.label}`,
                        disabled: isDisabled,
                      }}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
