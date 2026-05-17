import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../components/i18n/LanguageSwitcher";
import { IdentityGateForm } from "../components/lobby/IdentityGateForm";
import { useIdentityGateController } from "../features/lobby/flow/useIdentityGateController";
import "./IdentityPage.css";


type IdentityPageProps = {
  onIdentityConfirmed?: () => void;
  onCancel?: () => void;
  canCancel?: boolean;
};

export function IdentityPage({ onIdentityConfirmed, onCancel, canCancel = false }: IdentityPageProps) {
  const { t } = useTranslation("lobby");
  const {
    nickname,
    profileId,
    message,
    setNickname,
    handleContinue,
    handleClearIdentity,
  } = useIdentityGateController({
    onIdentityConfirmed,
  });

  return (
    <div
      className="identity-gate-overlay"
    >
      <section
        aria-labelledby="identity-gate-title"
        aria-modal="true"
        className="identity-gate-modal"
        data-testid="identity-gate-modal"
        role="dialog"
      >
        <div className="identity-gate-modal__scene" aria-hidden="true">
          <div className="identity-gate-modal__scene-copy">
            <p>{t("eyebrow")}</p>
            <strong>{t("title")}</strong>
          </div>
        </div>

        <div className="identity-gate-modal__form">
          <LanguageSwitcher className="identity-gate-modal__language" compact />
          <div>
            <p className="panel__eyebrow">{t("identityCard.noProfileDisplayName")}</p>
            <h2 id="identity-gate-title">{t("identityCard.nicknameLabel")}</h2>
            <p>{t("identityCard.formDescription")}</p>
          </div>
          <IdentityGateForm
            canCancel={canCancel}
            message={message?.text ?? null}
            nickname={nickname}
            onCancel={onCancel}
            onContinue={handleContinue}
            onNicknameChange={setNickname}
            onClearIdentity={handleClearIdentity}
            profileId={profileId}
          />
        </div>
      </section>
    </div>
  );
}
