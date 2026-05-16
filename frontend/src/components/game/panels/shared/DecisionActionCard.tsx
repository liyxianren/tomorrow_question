import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
      incrementAriaLabel?: string;
      decrementAriaLabel?: string;
      incrementDisabled?: boolean;
      decrementDisabled?: boolean;
    }
  | {
      kind: "toggle";
      checked: boolean;
      onChange: (next: boolean) => void;
      label: string;
      ariaLabel?: string;
      disabled?: boolean;
    }
  | {
      kind: "confirm-cancel";
      isSelected: boolean;
      isDisabled: boolean;
      onConfirm: () => void;
      onCancel: () => void;
      confirmLabel?: string;
      cancelLabel?: string;
      confirmAriaLabel?: string;
      cancelAriaLabel?: string;
      hideCancelWhenNotSelected?: boolean;
    };

export type DecisionActionCardProps = {
  icon?: string;
  title: string;
  costLabel?: string;
  description?: ReactNode;
  effects?: DecisionActionCardEffect[];
  warning?: ReactNode;
  status: DecisionActionCardStatus;
  statusText?: string;
  control?: DecisionActionCardControl;
  doneBadge?: string;
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
  doneBadge,
  children,
  testId,
}: DecisionActionCardProps) {
  const { t } = useTranslation();
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
              {effect.label} {effect.value}{effect.temporary ? ` ${t("game:thisRound")}` : ""}
            </span>
          ))}
        </div>
      ) : null}
      {warning ? <p className="dac__warning">{warning}</p> : null}
      {children}
      <div className="dac__footer">
        {statusText ? <span className="dac__status">{statusText}</span> : <span />}
        {control ? (
          <DecisionActionCardControl control={control} />
        ) : doneBadge ? (
          <span className="dac__btn dac__btn--done">{doneBadge}</span>
        ) : null}
      </div>
    </article>
  );
}

function DecisionActionCardControl({ control }: { control: DecisionActionCardControl }) {
  const { t } = useTranslation();
  if (control.kind === "stepper") {
    const min = control.min ?? 0;
    const decrementDisabled = control.decrementDisabled ?? control.value <= min;
    const incrementDisabled = control.incrementDisabled ?? control.value >= control.max;
    return (
      <div className="dac__stepper">
        <button
          type="button"
          className="dac__btn"
          aria-label={control.decrementAriaLabel ?? t("common:decrease")}
          disabled={decrementDisabled}
          onClick={() => control.onChange(Math.max(min, control.value - 1))}
        >
          −
        </button>
        <span className="dac__stepper-value">{control.value}</span>
        <button
          type="button"
          className="dac__btn"
          aria-label={control.incrementAriaLabel ?? t("common:increase")}
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
      <button
        type="button"
        className={`dac__btn${control.checked ? " dac__btn--primary" : ""}`}
        aria-label={control.ariaLabel}
        disabled={control.disabled}
        onClick={() => control.onChange(!control.checked)}
      >
        {control.label}
      </button>
    );
  }

  const confirmLabel = control.confirmLabel ?? t("common:confirm");
  const cancelLabel = control.cancelLabel ?? t("common:revoke");
  const showCancel = !(control.hideCancelWhenNotSelected && !control.isSelected);
  return (
    <div className="dac__confirm-row">
      {showCancel ? (
        <button
          type="button"
          className="dac__btn"
          aria-label={control.cancelAriaLabel}
          disabled={!control.isSelected}
          onClick={control.onCancel}
        >
          {cancelLabel}
        </button>
      ) : null}
      <button
        type="button"
        className={control.isSelected ? "dac__btn dac__btn--primary" : "dac__btn"}
        aria-label={control.confirmAriaLabel}
        disabled={control.isDisabled}
        onClick={control.onConfirm}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
