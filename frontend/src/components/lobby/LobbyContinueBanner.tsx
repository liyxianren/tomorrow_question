import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { RecoverableGameBannerViewModel } from "../../features/lobby/flow/viewModel";
import {
  eyebrowStyle,
  sectionCardStyle,
} from "./styles";


type LobbyContinueBannerProps = {
  viewModel: RecoverableGameBannerViewModel | null;
};

export function LobbyContinueBanner({ viewModel }: LobbyContinueBannerProps) {
  const { t } = useTranslation("lobby");

  if (!viewModel) {
    return null;
  }

  return (
    <section
      className="panel lobby-continue-banner"
      data-testid="lobby-continue-banner"
      style={{
        ...sectionCardStyle,
      }}
    >
      <div>
        <p className="panel__eyebrow" style={eyebrowStyle}>
          {t("continueBanner.eyebrow")}
        </p>
        <h2>{viewModel.title}</h2>
        <p>{viewModel.description}</p>
      </div>

      <div>
        <Link
          className="lobby-primary-link"
          to={viewModel.targetPath}
        >
          {viewModel.actionLabel}
        </Link>
      </div>
    </section>
  );
}
