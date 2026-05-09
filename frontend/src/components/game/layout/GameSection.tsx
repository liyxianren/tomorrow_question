import type { ReactNode } from "react";


type GameSectionProps = {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  testId?: string;
};

export function GameSection({
  eyebrow,
  title,
  children,
  testId,
}: GameSectionProps) {
  return (
    <section>
      {eyebrow || title ? (
        <header
          style={{
            padding: "0 0 16px 0",
            marginBottom: 16,
            borderBottom: "1px solid rgba(226, 232, 240, 0.1)",
            display: "flex",
            flexDirection: "column",
            gap: 4
          }}
        >
          {eyebrow && <span style={{ color: "var(--game-text-feedback)", fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase" }}>{eyebrow}</span>}
          {title && <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: 28, color: "var(--game-text-primary)", textShadow: "0 2px 10px rgba(0,0,0,0.45)" }}>{title}</h2>}
        </header>
      ) : null}
      <div
        data-testid={testId}
        style={{
          display: "grid",
          gap: 16,
        }}
      >
        {children}
      </div>
    </section>
  );
}
