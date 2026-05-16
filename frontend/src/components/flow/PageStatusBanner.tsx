import { useTranslation } from "react-i18next";
import type { PageStatusBannerState } from "../../features/flow/types";


type PageStatusBannerProps = {
  state: PageStatusBannerState;
};

export function PageStatusBanner({ state }: PageStatusBannerProps) {
  const { t } = useTranslation();
  return (
    <section className={`page-status-banner page-status-banner--${state.tone}`}>
      {state.eyebrow ? <p className="panel__eyebrow">{state.eyebrow}</p> : null}
      <h2>{state.title}</h2>
      <p className="page-status-banner__detail">{state.detail}</p>

      {state.tags && state.tags.length > 0 ? (
        <ul aria-label={t("common:statusTags")} className="page-status-banner__tags">
          {state.tags.map((tag) => (
            <li key={tag} className="page-status-banner__tag">
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
