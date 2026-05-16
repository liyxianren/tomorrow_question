import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";


export function NotFoundPage() {
  const { t } = useTranslation("pages");
  return (
    <section className="panel">
      <p className="panel__eyebrow">404</p>
      <h2>{t("notFound.title")}</h2>
      <p>{t("notFound.hint")}</p>
      <Link className="text-link" to="/">
        {t("notFound.action")}
      </Link>
    </section>
  );
}
