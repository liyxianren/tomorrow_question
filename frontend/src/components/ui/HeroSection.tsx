import type { ReactNode } from "react";


type HeroSectionProps = {
  eyebrow?: string;
  title: string;
  description: string;
  badges?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  backgroundImage?: string;
};

export function HeroSection({
  eyebrow,
  title,
  description,
  badges,
  actions,
  aside,
  backgroundImage,
}: HeroSectionProps) {
  return (
    <section className="hero-section">
      {backgroundImage ? (
        <div className="hero-section__backdrop">
          <img alt="Hero background" className="hero-section__backdrop-image" src={backgroundImage} />
          <div className="hero-section__backdrop-overlay" />
        </div>
      ) : null}
      <div className="hero-section__content">
        {eyebrow ? <p className="hero-section__eyebrow">{eyebrow}</p> : null}
        <h2 className="hero-section__title">{title}</h2>
        <p className="hero-section__description">{description}</p>
        {badges ? <div className="hero-section__badges">{badges}</div> : null}
        {actions ? <div className="hero-section__actions">{actions}</div> : null}
      </div>

      {aside ? <div className="hero-section__aside">{aside}</div> : null}
    </section>
  );
}
