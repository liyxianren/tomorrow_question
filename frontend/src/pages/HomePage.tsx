import { useTranslation } from "react-i18next";
import { ActionBar } from "../components/ui/ActionBar";
import { HeroSection } from "../components/ui/HeroSection";
import { PageShell } from "../components/ui/PageShell";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";

export function HomePage() {
  const { t } = useTranslation("pages");
  return (
    <PageShell className="home-page" width="wide">
      <HeroSection
        backgroundImage="/hero-bg.png"
        actions={(
          <div className="home-page__hero-actions">
            <ActionBar>
              <PrimaryButton to="/lobby">{t("home.heroActions.enterLobby")}</PrimaryButton>
            </ActionBar>
            <div className="home-page__rule-strip" aria-label={t("home.heroActions.ariaLabel")}>
              <span className="home-page__rule-pill">{t("home.heroActions.rule1")}</span>
              <span className="home-page__rule-pill">{t("home.heroActions.rule2")}</span>
              <span className="home-page__rule-pill">{t("home.heroActions.rule3")}</span>
              <span className="home-page__rule-pill">{t("home.heroActions.rule4")}</span>
            </div>
          </div>
        )}
        aside={(
          <SectionCard
             description={t("home.asideCard.description")}
             eyebrow={t("home.asideCard.eyebrow")}
             title={t("home.asideCard.title")}
             tone="accent"
           >
            <ol className="home-page__step-list home-page__step-list--compact">
              <li>{t("home.asideCard.steps.0")}</li>
              <li>{t("home.asideCard.steps.1")}</li>
              <li>{t("home.asideCard.steps.2")}</li>
              <li>{t("home.asideCard.steps.3")}</li>
            </ol>
          </SectionCard>
        )}
        badges={(
          <>
            <StatusBadge>{t("home.badges.multiplayer")}</StatusBadge>
            <StatusBadge tone="muted">{t("home.badges.turns")}</StatusBadge>
            <StatusBadge tone="success">{t("home.badges.threePhase")}</StatusBadge>
          </>
        )}
        description={t("home.description")}
        eyebrow={t("home.eyebrow")}
        title={t("home.title")}
      />

      <section className="home-page__grid">
        <SectionCard
          description={t("home.cycleCard.description")}
          eyebrow={t("home.cycleCard.eyebrow")}
          title={t("home.cycleCard.title")}
        >
          <div className="home-page__feature-list">
            <article className="home-page__feature-item">
               <h4>{t("home.cycleCard.phases.decision.title")}</h4>
               <p>{t("home.cycleCard.phases.decision.desc")}</p>
            </article>
            <article className="home-page__feature-item">
               <h4>{t("home.cycleCard.phases.market.title")}</h4>
               <p>{t("home.cycleCard.phases.market.desc")}</p>
            </article>
            <article className="home-page__feature-item">
               <h4>{t("home.cycleCard.phases.settlement.title")}</h4>
               <p>{t("home.cycleCard.phases.settlement.desc")}</p>
            </article>
          </div>
        </SectionCard>

        <SectionCard
          description={t("home.lobbyCard.description")}
          eyebrow={t("home.lobbyCard.eyebrow")}
          title={t("home.lobbyCard.title")}
        >
          <ol className="home-page__step-list">
             <li>{t("home.lobbyCard.steps.0")}</li>
             <li>{t("home.lobbyCard.steps.1")}</li>
             <li>{t("home.lobbyCard.steps.2")}</li>
          </ol>
        </SectionCard>
      </section>
    </PageShell>
  );
}
