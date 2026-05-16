import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n, { translateBackend } from "../../../../i18n";
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

function getModeHint(mode: string, fallback: string): string {
  return i18n.t(`game:factory.modeHints.${mode}`, fallback);
}

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
  const { t } = useTranslation();
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
          <h4>{t("game:factory.productionTitle")}</h4>
          <p>{t("game:factory.productionDesc")}</p>
        </div>
        <div className="phase1-panel__output-meter">
          <span>{t("game:factory.expectedOutput")}</span>
          <strong>{formatNumber(totalOutput)}</strong>
        </div>
      </header>

      <div className="phase1-panel__control-room" aria-label={t("game:factory.factoryOverview")}>
        <FactoryMeter
          label={t("game:factory.rawMaterials")}
          value={remainingRawMaterials}
          total={rawMaterials}
          progress={rawMaterialProgress}
          tone={capacityShortfall ? "warning" : undefined}
        />
        <FactoryMeter
          label={t("game:factory.factoryBudget")}
          value={remainingFactoryBudget}
          total={factoryBudget}
          progress={budgetProgress}
        />
        <FactoryMeter
          label={t("game:factory.capacityLimit")}
          value={totalAssigned}
          total={totalCapacity}
          progress={capacityProgress}
        />
      </div>

      <div className="phase1-panel__workspace">
        <div className="phase1-routes" aria-label={t("game:factory.productionRoutes")}>
          <div className="phase1-routes__head">
            <div>
              <h5>{t("game:factory.productionRoutes")}</h5>
              <p>{t("game:factory.productionRoutesHint")}</p>
            </div>
            <span>{t("game:factory.allocatedCount", { assigned: totalAssigned, total: rawMaterials })}</span>
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

        <aside className="phase1-panel__status-card" aria-label={t("game:factory.factoryOverview")}>
          <h5>{t("game:factory.marketAndCapacityCheck")}</h5>
          <div className="phase1-panel__status-grid">
            <span className="phase1-panel__status-chip">
              {t("game:factory.inventory")} <strong>{goodsInventory}</strong>
            </span>
            <span className="phase1-panel__status-chip">
              {t("game:factory.domesticDemand")} <strong>{formatNumber(domesticDemand)}</strong>
            </span>
            <span className="phase1-panel__status-chip" title={`${t("game:domestic.equilibriumPriceLabel")} ${formatNumber(equilibriumPrice)}`}>
              {t("game:factory.estimatedPrice")} <strong>{formatNumber(domesticPricePreview)}</strong>
            </span>
            <span className="phase1-panel__status-chip phase1-panel__status-chip--idle" data-testid="idle-status-chip">
              {t("game:factory.idleCapacity")} <strong>{idleCapacity}</strong>
            </span>
            <span className="phase1-panel__status-chip">
              {t("game:factory.unusedCapacity")} <strong>{unusedProductiveCapacity}</strong>
            </span>
            {outputMultiplier > 1 ? (
              <span className="phase1-panel__status-chip">
                {t("game:factory.outputMultiplier")} <strong>x{outputMultiplier}</strong>
              </span>
            ) : null}
          </div>
          {capacityShortfall ? (
            <p className="phase1-panel__status-warning" data-testid="capacity-warning">
              {t("game:factory.capacityWarning", { count: unprocessedRawMaterials })}
            </p>
          ) : null}
          {productionCapacityDelta < 0 ? (
            <p className="phase1-panel__status-warning">
              {t("game:factory.dispatchCapacityWarning", { count: -productionCapacityDelta })}
            </p>
          ) : null}
        </aside>
      </div>

      <div className="phase1-panel__footer">
        <span className="phase1-panel__footer-row">
          <span className="phase1-panel__footer-label">{t("game:factory.totalAllocatedMaterials")}</span>
          <span className="phase1-panel__footer-value">{totalAssigned} / {rawMaterials}</span>
        </span>
        <span className="phase1-panel__footer-row">
          <span className="phase1-panel__footer-label">{t("game:factory.totalExpectedOutput")}</span>
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
  const { t } = useTranslation();
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
    ? `${t("game:factory.lockedByTech", { tech: requiredTechLabel ?? t("game:factory.notUnlocked") })}`
    : `${getModeHint(mode.mode, mode.label)} · ${t("game:factory.capacityLimit")} ${formatNumber(mode.currentCapacity)} · ${t("game:factory.input")} 1 ${t("game:factory.output")} ${formatNumber(mode.outputRatio)}`;

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
          <strong>{translateBackend(mode.label)}</strong>
          <small>
            {isLocked
              ? t("game:factory.lockedByTech", { tech: requiredTechLabel ?? "" })
              : `${getModeHint(mode.mode, mode.label)} · 1 ${t("game:factory.input")} ${t("game:factory.output")} ${formatNumber(mode.outputRatio)}`}
          </small>
        </span>
      </header>

      <div className="phase1-route-row__metrics" aria-label={`${translateBackend(mode.label)} ${t("game:production")}`}>
        <span>
          <strong>{assigned}</strong>
          <small>{t("game:factory.input")}</small>
        </span>
        <span>
          <strong>{formatNumber(expectedOutput)}</strong>
          <small>{t("game:factory.output")}</small>
        </span>
      </div>

      <div className="phase1-route-row__capacity">
        {isLocked ? (
          <span>{t("game:factory.notUnlocked")}</span>
        ) : (
          <>
            <span>{t("game:factory.capacityLimit")} {formatNumber(mode.currentCapacity)}</span>
            {assigned > 0 && assigned === mode.currentCapacity ? <strong>{t("game:factory.full")}</strong> : null}
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
            aria-label={`${translateBackend(mode.label)} ${t("common:decrease")}`}
          >
            −
          </button>
          <button
            type="button"
            className="phase1-route-row__stepper-zero"
            disabled={disabled || assigned <= 0}
            onClick={handleZero}
            aria-label={`${translateBackend(mode.label)} ${t("common:clear")}`}
          >
            {t("game:factory.clear")}
          </button>
          <span className="phase1-route-row__stepper-value">{assigned}</span>
          <button
            type="button"
            className="phase1-route-row__stepper-btn"
            disabled={disabled || assigned >= maxAlloc}
            onClick={() => handleDelta(1)}
            aria-label={`${translateBackend(mode.label)} ${t("common:increase")}`}
          >
            +
          </button>
          <button
            type="button"
            className="phase1-route-row__stepper-max"
            disabled={disabled || assigned >= maxAlloc}
            onClick={handleMax}
            aria-label={`${translateBackend(mode.label)} ${t("common:max")}`}
          >
            {t("game:factory.full")}
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
