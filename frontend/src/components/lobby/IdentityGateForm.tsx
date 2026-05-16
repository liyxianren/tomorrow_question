import { useTranslation } from "react-i18next";
import {
  fieldStyle,
  mutedMonoStyle,
} from "./styles";


type IdentityGateFormProps = {
  nickname: string;
  profileId: string | null;
  onNicknameChange: (value: string) => void;
  onContinue: () => void;
  onClearIdentity: () => void;
  onCancel?: () => void;
  canCancel?: boolean;
  message: string | null;
};

export function IdentityGateForm({
  nickname,
  profileId,
  onNicknameChange,
  onContinue,
  onClearIdentity,
  onCancel,
  canCancel = false,
  message,
}: IdentityGateFormProps) {
  const { t } = useTranslation("lobby");

  return (
    <section className="identity-gate-form">
      <div className="identity-gate-form__header">
        <h3>{t("identityCard.formTitle")}</h3>
        <p>{t("identityCard.formDescription")}</p>
      </div>

      <div className="identity-gate-form__body">
        <label>
          <span>{t("identityCard.nicknameLabel")}</span>
          <input
            aria-label={t("identityCard.nicknameLabel")}
            autoComplete="nickname"
            data-testid="identity-nickname-input"
            maxLength={24}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder={t("identityCard.nicknamePlaceholder")}
            style={fieldStyle}
            value={nickname}
          />
        </label>

        <div className="identity-gate-form__profile">
          <strong>{t("identityCard.profileIdLabel")}</strong>
          <span data-testid="identity-profile-id" style={{ ...mutedMonoStyle, color: "var(--color-accent)" }}>
             {profileId ?? t("identityCard.noProfileIdValue")}
          </span>
        </div>

        <div className="identity-gate-form__actions">
          <button
            className="identity-gate-form__button identity-gate-form__button--primary"
            data-testid="identity-continue-button"
            onClick={onContinue}
            type="button"
          >
            {t("identityCard.actionSaveAndEnter")}
          </button>

          {canCancel ? (
            <button
              className="identity-gate-form__button identity-gate-form__button--secondary"
              data-testid="identity-cancel-button"
              onClick={onCancel}
              type="button"
            >
              {t("common:cancel")}
            </button>
          ) : null}
        </div>

        <div className="identity-gate-form__status" data-testid="identity-status-message">
          {message ?? t("identityCard.statusHint")}
        </div>

        {profileId ? (
          <button
            className="identity-gate-form__clear"
            data-testid="identity-clear-profile-button"
            onClick={onClearIdentity}
            type="button"
          >
            {t("identityCard.clearIdentity")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
