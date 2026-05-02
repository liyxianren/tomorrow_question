import type { ReactNode } from "react";
import "./DecisionActionCard.css";

export type DecisionActionCardEffect = {
  label: string;
  value: string | number;
  temporary?: boolean;
};

export type DecisionActionCardStatus = "available" | "selected" | "disabled" | "danger" | "done";

export type DecisionActionCardControl =
  | {
      kind: "stepper";
      value: number;
      min?: number;
      max: number;
      onChange: (next: number) => void;
    }
  | {
      kind: "toggle";
      checked: boolean;
      onChange: (next: boolean) => void;
      label: string;
    }
  | {
      kind: "confirm-cancel";
      isSelected: boolean;
      isDisabled: boolean;
      onConfirm: () => void;
      onCancel: () => void;
      confirmLabel?: string;
    };

export type DecisionActionCardProps = {
  icon?: string;
  title: string;
  costLabel?: string;
  description?: string;
  effects?: DecisionActionCardEffect[];
  warning?: string;
  status: DecisionActionCardStatus;
  statusText?: string;
  control: DecisionActionCardControl;
  children?: ReactNode;
  testId?: string;
};

export function DecisionActionCard({
  icon,
  title,
  costLabel,
  description,
  effects,
  warning,
  status,
  statusText,
  control,
  children,
  testId,
}: DecisionActionCardProps) {
  const statusClass =
    status === "selected"
      ? " dac--selected"
      : status === "disabled"
        ? " dac--disabled"
        : status === "danger"
          ? " dac--danger"
          : status === "done"
            ? " dac--done"
            : "";

  return (
    <article className={`dac${statusClass}`} data-testid={testId}>
      <div className="dac__head">
        {icon ? <span className="dac__icon" aria-hidden="true">{icon}</span> : null}
        <span className="dac__title">{title}</span>
        {costLabel ? <span className="dac__cost">{costLabel}</span> : null}
      </div>
      {description ? <p className="dac__desc">{description}</p> : null}
      {effects && effects.length > 0 ? (
        <div className="dac__effects">
          {effects.map((effect, index) => (
            <span
              key={`${effect.label}-${index}`}
              className={`dac__effect-tag${effect.temporary ? " dac__effect-tag--temporary" : ""}`}
            >
              {effect.label} {effect.value}
            </span>
          ))}
        </div>
      ) : null}
      {warning ? <p className="dac__warning">{warning}</p> : null}
      {children}
      <div className="dac__footer">
        {statusText ? <span className="dac__status">{statusText}</span> : <span />}
        <DecisionActionCardControl control={control} />
      </div>
    </article>
  );
}

function DecisionActionCardControl({ control }: { control: DecisionActionCardControl }) {
  if (control.kind === "stepper") {
    const min = control.min ?? 0;
    const decrementDisabled = control.value <= min;
    const incrementDisabled = control.value >= control.max;
    return (
      <div className="dac__stepper">
        <button
          type="button"
          className="dac__btn"
          aria-label="减少"
          disabled={decrementDisabled}
          onClick={() => control.onChange(Math.max(min, control.value - 1))}
        >
          −
        </button>
        <span className="dac__stepper-value">{control.value}</span>
        <button
          type="button"
          className="dac__btn"
          aria-label="增加"
          disabled={incrementDisabled}
          onClick={() => control.onChange(Math.min(control.max, control.value + 1))}
        >
          +
        </button>
      </div>
    );
  }

  if (control.kind === "toggle") {
    return (
      <label className="dac__toggle">
        <input
          type="checkbox"
          checked={control.checked}
          onChange={(event) => control.onChange(event.target.checked)}
        />
        {control.label}
      </label>
    );
  }

  const confirmLabel = control.confirmLabel ?? "确认";
  return (
    <div className="dac__confirm-row">
      <button
        type="button"
        className={control.isSelected ? "dac__btn dac__btn--primary" : "dac__btn"}
        disabled={control.isDisabled}
        onClick={control.onConfirm}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        className="dac__btn"
        disabled={!control.isSelected}
        onClick={control.onCancel}
      >
        撤回
      </button>
    </div>
  );
}
