import { useCallback } from "react";
import type { Phase1ProductionMode } from "../../../../types";
import { getTechnologyLabel } from "../../../../features/game/panelGlossary";
import "./Phase1ProductionPanel.css";

const PRODUCTIVE_MODE_ORDER = ["handicraft", "mechanized", "steam", "electrified"];

const MODE_ICON: Record<string, string> = {
  handicraft: "⚒",
  mechanized: "⚙",
  steam: "♨",
  electrified: "⚡",
};

const MODE_HINT: Record<string, string> = {
  handicraft: "基础工坊",
  mechanized: "机械化",
  steam: "蒸汽动力",
  electrified: "电气工业",
};

interface ProductionRouteViewModel {
  mode: Phase1ProductionMode;
  assigned: number;
  expectedOutput: number;
  isLocked: boolean;
  noCapacity: boolean;
  disabled: boolean;
  maxAlloc: number;
  requiredTechLabel: string | null;
}

export function Phase1ProductionPanel({
  modes,
  rawMaterials,
  factoryBudget,
  domesticDemand,
  equilibriumPrice,
  domesticPricePreview,
  goodsInventory,
  assignments,
  productionCapacityDelta = 0,
  outputMultiplier = 1,
  onAssignmentChange,
}: {
  modes: Phase1ProductionMode[];
  rawMaterials: number;
  factoryBudget: number;
  domesticDemand: number;
  equilibriumPrice: number;
  domesticPricePreview: number;
  goodsInventory: number;
  assignments: Record<string, number>;
  productionCapacityDelta?: number;
  outputMultiplier?: number;
  onAssignmentChange?: (mode: string, quantity: number) => void;
}) {
  const productiveModes = [...modes]
    .filter((mode) => mode.mode !== "idle")
    .sort((a, b) => {
      const left = PRODUCTIVE_MODE_ORDER.indexOf(a.mode);
      const right = PRODUCTIVE_MODE_ORDER.indexOf(b.mode);
      return (left === -1 ? PRODUCTIVE_MODE_ORDER.length : left)
        - (right === -1 ? PRODUCTIVE_MODE_ORDER.length : right);
    });
  const idleMode = modes.find((mode) => mode.mode === "idle");
  const baseTotalCapacity = productiveModes.reduce((sum, mode) => {
    return sum + (mode.isAvailable ? mode.currentCapacity : 0);
  }, 0);
  const totalCapacity = Math.max(0, baseTotalCapacity + productionCapacityDelta);
  const effectiveAssignments = clampAssignmentsForLimits(
    assignments,
    productiveModes,
    rawMaterials,
    factoryBudget,
    totalCapacity,
  );
  const totalAssigned = sumAssignmentsForModes(effectiveAssignments, productiveModes);
  const remainingRawMaterials = Math.max(rawMaterials - totalAssigned, 0);
  const remainingFactoryBudget = Math.max(factoryBudget - totalAssigned, 0);
  const totalOutput = productiveModes.reduce((sum, mode) => {
    const assigned = effectiveAssignments[mode.mode] ?? 0;
    return sum + assigned * mode.outputRatio;
  }, 0) * Math.max(1, outputMultiplier);
  const unusedProductiveCapacity = Math.max(totalCapacity - totalAssigned, 0);
  const idleCapacity = Math.max(0, idleMode?.currentCapacity ?? 0);
  const maxProcessableRawMaterials = Math.min(rawMaterials, totalCapacity, factoryBudget);
  const unprocessedRawMaterials = Math.max(rawMaterials - maxProcessableRawMaterials, 0);
  const capacityShortfall = unprocessedRawMaterials > 0;
  const rawMaterialProgress = rawMaterials > 0 ? (totalAssigned / rawMaterials) * 100 : 0;
  const budgetProgress = factoryBudget > 0 ? (totalAssigned / factoryBudget) * 100 : 0;
  const capacityProgress = totalCapacity > 0 ? (totalAssigned / totalCapacity) * 100 : 0;

  const routeViewModels: ProductionRouteViewModel[] = productiveModes.map((mode) => {
    const assigned = effectiveAssignments[mode.mode] ?? 0;
    const expectedOutput = assigned * mode.outputRatio;
    const isLocked = !mode.isAvailable;
    const noCapacity = mode.currentCapacity <= 0;
    const disabled = isLocked || noCapacity || !onAssignmentChange;
    const remainingGlobalCapacity = Math.max(0, totalCapacity - totalAssigned);
    const maxAlloc = Math.min(
      Math.max(0, mode.currentCapacity),
      remainingRawMaterials + assigned,
      remainingFactoryBudget + assigned,
      remainingGlobalCapacity + assigned,
    );

    return {
      mode,
      assigned,
      expectedOutput,
      isLocked,
      noCapacity,
      disabled,
      maxAlloc,
      requiredTechLabel: formatRequiredTech(mode.requiredTech),
    };
  });

  return (
    <section className="phase1-panel" data-testid="phase1-production-panel">
      <header className="phase1-panel__header">
        <div>
          <h4>本轮生产投料</h4>
          <p>原材料、工厂预算和投料上限共同限制本轮产出。</p>
        </div>
        <div className="phase1-panel__output-meter">
          <span>预计产出</span>
          <strong>{formatNumber(totalOutput)}</strong>
        </div>
      </header>

      <div className="phase1-panel__control-room" aria-label="工厂总览">
        <FactoryMeter
          label="原材料"
          value={remainingRawMaterials}
          total={rawMaterials}
          progress={rawMaterialProgress}
          tone={capacityShortfall ? "warning" : undefined}
        />
        <FactoryMeter
          label="工厂预算"
          value={remainingFactoryBudget}
          total={factoryBudget}
          progress={budgetProgress}
        />
        <FactoryMeter
          label="投料上限"
          value={totalAssigned}
          total={totalCapacity}
          progress={capacityProgress}
        />
      </div>

      <div className="phase1-panel__workspace">
        <div className="phase1-routes" aria-label="工厂生产线">
          <div className="phase1-routes__head">
            <div>
              <h5>生产路线</h5>
              <p>优先把原材料投向已解锁且产出倍率更高的路线。</p>
            </div>
            <span>{totalAssigned} / {rawMaterials} 已投料</span>
          </div>
          <div className="phase1-routes__list">
            {routeViewModels.map((route) => (
              <ProductionRouteNode
                key={route.mode.mode}
                route={route}
                onAssignmentChange={onAssignmentChange}
              />
            ))}
          </div>
        </div>

        <aside className="phase1-panel__status-card" aria-label="工厂状态">
          <h5>市场与产能核对</h5>
          <div className="phase1-panel__status-grid">
            <span className="phase1-panel__status-chip">
              库存 <strong>{goodsInventory}</strong>
            </span>
            <span className="phase1-panel__status-chip">
              国内需求 <strong>{formatNumber(domesticDemand)}</strong>
            </span>
            <span className="phase1-panel__status-chip" title={`均衡价 ${formatNumber(equilibriumPrice)}`}>
              预估价格 <strong>{formatNumber(domesticPricePreview)}</strong>
            </span>
            <span className="phase1-panel__status-chip phase1-panel__status-chip--idle" data-testid="idle-status-chip">
              空置产能 <strong>{idleCapacity}</strong>
            </span>
            <span className="phase1-panel__status-chip">
              未投入产能 <strong>{unusedProductiveCapacity}</strong>
            </span>
            {outputMultiplier > 1 ? (
              <span className="phase1-panel__status-chip">
                产出倍率 <strong>x{outputMultiplier}</strong>
              </span>
            ) : null}
          </div>
          {capacityShortfall ? (
            <p className="phase1-panel__status-warning" data-testid="capacity-warning">
              {unprocessedRawMaterials} 原材料会留到下回合，因为当前投料上限不足。
            </p>
          ) : null}
          {productionCapacityDelta < 0 ? (
            <p className="phase1-panel__status-warning">
              工厂调度占用 {-productionCapacityDelta} 投料上限。
            </p>
          ) : null}
        </aside>
      </div>

      <div className="phase1-panel__footer">
        <span className="phase1-panel__footer-row">
          <span className="phase1-panel__footer-label">总分配原材料</span>
          <span className="phase1-panel__footer-value">{totalAssigned} / {rawMaterials}</span>
        </span>
        <span className="phase1-panel__footer-row">
          <span className="phase1-panel__footer-label">总预计产出</span>
          <span className="phase1-panel__footer-value phase1-panel__footer-value--highlight">{formatNumber(totalOutput)}</span>
        </span>
      </div>
    </section>
  );
}

function FactoryMeter({
  label,
  value,
  total,
  progress,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  progress: number;
  tone?: "warning";
}) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  return (
    <div className={`phase1-panel__meter${tone === "warning" ? " phase1-panel__meter--warn" : ""}`}>
      <div className="phase1-panel__meter-head">
        <span>{label}</span>
        <strong>{formatNumber(value)} / {formatNumber(total)}</strong>
      </div>
      <div className="phase1-panel__meter-track" aria-hidden="true">
        <span style={{ width: `${clampedProgress}%` }} />
      </div>
    </div>
  );
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return `${Math.round(value * 100) / 100}`;
}

function ProductionRouteNode({
  route,
  onAssignmentChange,
}: {
  route: ProductionRouteViewModel;
  onAssignmentChange?: (mode: string, quantity: number) => void;
}) {
  const { mode, assigned, expectedOutput, isLocked, noCapacity, disabled, maxAlloc, requiredTechLabel } = route;
  const nodeClass = [
    "phase1-route-row",
    isLocked && "phase1-route-row--locked",
    noCapacity && !isLocked && "phase1-route-row--empty",
    assigned > 0 && "phase1-route-row--active",
  ]
    .filter(Boolean)
    .join(" ");
  const detailTitle = isLocked
    ? `解锁条件：${requiredTechLabel ?? "未解锁"}`
    : `${MODE_HINT[mode.mode] ?? mode.label} · 产能 ${formatNumber(mode.currentCapacity)} · 投入 1 原材料产出 ${formatNumber(mode.outputRatio)}`;

  const handleDelta = useCallback((delta: number) => {
    if (!onAssignmentChange) return;
    const next = Math.min(Math.max(0, assigned + delta), maxAlloc);
    onAssignmentChange(mode.mode, next);
  }, [assigned, maxAlloc, mode.mode, onAssignmentChange]);

  const handleMax = useCallback(() => {
    if (!onAssignmentChange) return;
    onAssignmentChange(mode.mode, maxAlloc);
  }, [maxAlloc, mode.mode, onAssignmentChange]);

  const handleZero = useCallback(() => {
    if (!onAssignmentChange) return;
    onAssignmentChange(mode.mode, 0);
  }, [mode.mode, onAssignmentChange]);

  return (
    <article
      className={nodeClass}
      data-testid={`production-route-${mode.mode}`}
      title={detailTitle}
    >
      <header className="phase1-route-row__route">
        <span className="phase1-route-row__icon" aria-hidden="true">
          {MODE_ICON[mode.mode] ?? "◆"}
        </span>
        <span className="phase1-route-row__copy">
          <strong>{mode.label}</strong>
          <small>
            {isLocked
              ? `需 ${requiredTechLabel ?? "解锁"}`
              : `${MODE_HINT[mode.mode] ?? mode.label} · 1 原料产出 ${formatNumber(mode.outputRatio)}`}
          </small>
        </span>
      </header>

      <div className="phase1-route-row__metrics" aria-label={`${mode.label}生产数据`}>
        <span>
          <strong>{assigned}</strong>
          <small>投入</small>
        </span>
        <span>
          <strong>{formatNumber(expectedOutput)}</strong>
          <small>产出</small>
        </span>
      </div>

      <div className="phase1-route-row__capacity">
        {isLocked ? (
          <span>未解锁</span>
        ) : (
          <>
            <span>产能 {formatNumber(mode.currentCapacity)}</span>
            {assigned > 0 && assigned === mode.currentCapacity ? <strong>已满</strong> : null}
          </>
        )}
      </div>

      {!isLocked ? (
        <div className="phase1-route-row__stepper">
          <button
            type="button"
            className="phase1-route-row__stepper-btn"
            disabled={disabled || assigned <= 0}
            onClick={() => handleDelta(-1)}
            aria-label={`${mode.label} 减少`}
          >
            −
          </button>
          <button
            type="button"
            className="phase1-route-row__stepper-zero"
            disabled={disabled || assigned <= 0}
            onClick={handleZero}
            aria-label={`${mode.label} 清零`}
          >
            清
          </button>
          <span className="phase1-route-row__stepper-value">{assigned}</span>
          <button
            type="button"
            className="phase1-route-row__stepper-btn"
            disabled={disabled || assigned >= maxAlloc}
            onClick={() => handleDelta(1)}
            aria-label={`${mode.label} 增加`}
          >
            +
          </button>
          <button
            type="button"
            className="phase1-route-row__stepper-max"
            disabled={disabled || assigned >= maxAlloc}
            onClick={handleMax}
            aria-label={`${mode.label} 最大`}
          >
            满
          </button>
        </div>
      ) : null}
    </article>
  );
}

function formatRequiredTech(requiredTech: Phase1ProductionMode["requiredTech"]): string | null {
  if (!requiredTech) {
    return null;
  }
  return (Array.isArray(requiredTech) ? requiredTech : [requiredTech])
    .map((techId) => getTechnologyLabel(techId))
    .join(" + ");
}

function sumAssignmentsForModes(
  values: Record<string, number>,
  modes: Phase1ProductionMode[],
): number {
  return modes.reduce(
    (sum, mode) => {
      const value = values[mode.mode] ?? 0;
      return sum + (Number.isFinite(value) ? value : 0);
    },
    0,
  );
}

function clampAssignmentsForLimits(
  values: Record<string, number>,
  modes: Phase1ProductionMode[],
  rawMaterials: number,
  factoryBudget: number,
  totalCapacity: number,
): Record<string, number> {
  let remainingRaw = Math.max(0, rawMaterials);
  let remainingBudget = Math.max(0, factoryBudget);
  let remainingCapacity = Math.max(0, totalCapacity);
  const next: Record<string, number> = {};

  for (const mode of modes) {
    const requested = Math.max(0, Math.floor(values[mode.mode] ?? 0));
    const assigned = Math.min(
      requested,
      Math.max(0, mode.currentCapacity),
      remainingRaw,
      remainingBudget,
      remainingCapacity,
    );
    if (assigned > 0) {
      next[mode.mode] = assigned;
      remainingRaw -= assigned;
      remainingBudget -= assigned;
      remainingCapacity -= assigned;
    }
  }

  return next;
}
