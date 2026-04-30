import { useCallback } from "react";
import type { Phase1ProductionMode } from "../../../../types";
import { getTechnologyLabel } from "../../../../features/game/panelGlossary";
import "./Phase1ProductionPanel.css";

export function Phase1ProductionPanel({
  modes,
  rawMaterials,
  investmentPool,
  domesticDemand,
  equilibriumPrice,
  domesticPricePreview,
  goodsInventory,
  assignments,
  onAssignmentChange,
}: {
  modes: Phase1ProductionMode[];
  rawMaterials: number;
  investmentPool: number;
  domesticDemand: number;
  equilibriumPrice: number;
  domesticPricePreview: number;
  goodsInventory: number;
  assignments: Record<string, number>;
  onAssignmentChange?: (mode: string, quantity: number) => void;
}) {
  const totalAssigned = sumValues(assignments);
  const remainingRawMaterials = Math.max(rawMaterials - totalAssigned, 0);
  const totalOutput = modes.reduce((sum, mode) => {
    const assigned = assignments[mode.mode] ?? 0;
    return sum + assigned * mode.outputRatio;
  }, 0);

  const totalCapacity = modes.reduce((sum, mode) => {
    return sum + (mode.isAvailable ? mode.currentCapacity : 0);
  }, 0);
  const capacityShortfall = totalCapacity < rawMaterials;

  return (
    <section className="phase1-panel" data-testid="phase1-production-panel">
      {/* ── Summary Bar ── */}
      <div className="phase1-panel__summary">
        <div className="phase1-panel__stat">
          <span className="phase1-panel__stat-value">
            {remainingRawMaterials}
            <span className="phase1-panel__stat-unit"> / {rawMaterials}</span>
          </span>
          <span className="phase1-panel__stat-label">原材料</span>
        </div>
        <div className="phase1-panel__stat">
          <span className="phase1-panel__stat-value">{goodsInventory}</span>
          <span className="phase1-panel__stat-label">商品库存</span>
        </div>
        <div className="phase1-panel__stat">
          <span className="phase1-panel__stat-value">{investmentPool}</span>
          <span className="phase1-panel__stat-label">投资池</span>
        </div>
        <div className="phase1-panel__stat">
          <span className={`phase1-panel__stat-value${capacityShortfall ? ' phase1-panel__stat-value--warn' : ''}`}>{totalCapacity}</span>
          <span className="phase1-panel__stat-label">总产能</span>
        </div>
      </div>

      {capacityShortfall && (
        <div className="phase1-panel__capacity-warning" data-testid="capacity-warning">
          ℹ️ 产能限制：当前总产能 {totalCapacity}，最多消耗 {totalCapacity} 件原材料（剩余 {rawMaterials - totalCapacity} 件保留至下回合）
        </div>
      )}

      {/* ── Production Mode Cards ── */}
      <div className="phase1-panel__grid">
        {modes.map((mode) => {
          const assigned = assignments[mode.mode] ?? 0;
          const expectedOutput = assigned * mode.outputRatio;
          const isLocked = !mode.isAvailable;
          const noCapacity = mode.currentCapacity <= 0;
          const disabled = isLocked || noCapacity || !onAssignmentChange;

          const maxAlloc = Math.min(mode.currentCapacity, remainingRawMaterials + assigned);

          function handleDelta(delta: number) {
            if (!onAssignmentChange) return;
            const next = Math.min(Math.max(0, assigned + delta), maxAlloc);
            onAssignmentChange(mode.mode, next);
          }

          function handleMax() {
            if (!onAssignmentChange) return;
            onAssignmentChange(mode.mode, maxAlloc);
          }

          function handleZero() {
            if (!onAssignmentChange) return;
            onAssignmentChange(mode.mode, 0);
          }

          const cardClass = [
            "phase1-card",
            isLocked && "phase1-card--locked",
            assigned > 0 && "phase1-card--active",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <article key={mode.mode} className={cardClass}>
              {/* Header: name + lock */}
              <header className="phase1-card__header">
                <span className="phase1-card__name">{mode.label}</span>
                {isLocked ? (
                  <span className="phase1-card__lock" title={
                    mode.requiredTech
                      ? (Array.isArray(mode.requiredTech) ? mode.requiredTech : [mode.requiredTech])
                          .map((t: string) => getTechnologyLabel(t)).join("、")
                      : "未解锁"
                  }>
                    <svg className="phase1-card__lock-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="7" width="10" height="7" rx="1.5" />
                      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                    </svg>
                    {mode.requiredTech
                      ? (Array.isArray(mode.requiredTech) ? mode.requiredTech : [mode.requiredTech])
                          .map((t: string) => getTechnologyLabel(t)).join("、")
                      : "未解锁"}
                  </span>
                ) : null}
              </header>

              {/* Capacity */}
            {!isLocked && (
              <div className="phase1-card__capacity">
                <span className="phase1-card__capacity-label">产能</span>
                <span className="phase1-card__capacity-value">
                  {mode.currentCapacity}
                  {assigned > 0 && assigned === mode.currentCapacity && (
                    <span className="phase1-card__capacity-full">已满</span>
                  )}
                </span>
              </div>
            )}

              {/* Stepper */}
              {!isLocked && (
                <div className="phase1-card__stepper">
                  <button
                    type="button"
                    className="phase1-card__stepper-btn"
                    disabled={disabled || assigned <= 0}
                    onClick={() => handleDelta(-1)}
                    aria-label={`${mode.label} 减少`}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="phase1-card__stepper-zero"
                    disabled={disabled || assigned <= 0}
                    onClick={handleZero}
                    aria-label={`${mode.label} 清零`}
                  >
                    0
                  </button>
                  <span className="phase1-card__stepper-value">{assigned}</span>
                  <button
                    type="button"
                    className="phase1-card__stepper-btn"
                    disabled={disabled || assigned >= maxAlloc}
                    onClick={() => handleDelta(1)}
                    aria-label={`${mode.label} 增加`}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="phase1-card__stepper-max"
                    disabled={disabled || assigned >= maxAlloc}
                    onClick={handleMax}
                    aria-label={`${mode.label} 最大`}
                  >
                    MAX
                  </button>
                </div>
              )}

              {/* Expected output */}
              {!isLocked && assigned > 0 && (
                <div className="phase1-card__output">
                  <span className="phase1-card__output-label">预计产出</span>
                  <span className="phase1-card__output-value">{expectedOutput}</span>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div className="phase1-panel__footer">
        <span className="phase1-panel__footer-row">
          <span className="phase1-panel__footer-label">总分配原材料</span>
          <span className="phase1-panel__footer-value">{totalAssigned} / {rawMaterials}</span>
        </span>
        <span className="phase1-panel__footer-row">
          <span className="phase1-panel__footer-label">总预计产出</span>
          <span className="phase1-panel__footer-value phase1-panel__footer-value--highlight">{totalOutput}</span>
        </span>
      </div>
    </section>
  );
}

function sumValues(values: Record<string, number>): number {
  return Object.values(values).reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0,
  );
}
