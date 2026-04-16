import type { ReactNode } from "react";


type SectionCardProps = {
  children?: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  id?: string;
  title: string;
  tone?: "default" | "accent" | "muted";
};

export function SectionCard({
  children,
  className,
  description,
  eyebrow,
  id,
  title,
  tone = "default",
}: SectionCardProps) {
  const classes = ["section-card", `section-card--${tone}`, className].filter(Boolean).join(" ");

  return (
    <section className={classes} id={id}>
      {eyebrow ? <p className="section-card__eyebrow">{eyebrow}</p> : null}
      <h3 className="section-card__title">{title}</h3>
      {description ? <p className="section-card__description">{description}</p> : null}
      {children ? <div className="section-card__body">{children}</div> : null}
    </section>
  );
}
