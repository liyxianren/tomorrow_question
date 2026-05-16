import { useTranslation } from "react-i18next";
import {
  eyebrowStyle,
  sectionCardStyle,
} from "./styles";
import type { CurrentIdentityCardViewModel } from "../../features/lobby/flow/viewModel";


type LobbyCurrentIdentityCardProps = {
  viewModel: CurrentIdentityCardViewModel;
  onChangeIdentity: () => void;
};

export function LobbyCurrentIdentityCard({
  viewModel,
  onChangeIdentity,
}: LobbyCurrentIdentityCardProps) {
  const { t } = useTranslation("lobby");

  return (
    <section
      aria-label={t("currentIdentity.ariaLabel")}
      className="panel lobby-identity-card"
      data-testid="lobby-current-identity-panel"
      style={{
        ...sectionCardStyle,
      }}
    >
      <p className="panel__eyebrow" style={eyebrowStyle}>
        {t("currentIdentity.eyebrow")}
      </p>
      <div className="lobby-identity-card__main">
        <strong
          className="lobby-identity-card__name"
          data-testid="lobby-current-identity"
        >
          {viewModel.displayName}
        </strong>
        <p>{viewModel.helperText}</p>
      </div>

      <div className="lobby-identity-card__code">
        <span>{viewModel.profileIdLabel}</span>
        <span
          data-testid="lobby-current-profile-id"
        >
          {viewModel.profileIdValue}
        </span>
      </div>

      <div className="lobby-identity-card__actions">
        <button
          className="lobby-secondary-button"
          data-testid="lobby-change-identity-button"
          onClick={onChangeIdentity}
          type="button"
        >
          {viewModel.actionLabel}
        </button>
      </div>
    </section>
  );
}
