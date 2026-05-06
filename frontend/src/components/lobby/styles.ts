import type { CSSProperties } from "react";


const borderColor = "rgba(212, 175, 55, 0.25)";
const mutedText = "var(--color-text-muted)";

export const pageStackStyle = {
  display: "grid",
  gap: 24,
} satisfies CSSProperties;

export const heroCardStyle = {
  position: "relative",
  overflow: "hidden",
  padding: 32,
  borderRadius: 8,
  border: `1px solid ${borderColor}`,
  background: "rgba(22, 28, 38, 0.6)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "0 24px 56px rgba(0, 0, 0, 0.5)",
} satisfies CSSProperties;

export const sectionCardStyle = {
  borderRadius: 8,
} satisfies CSSProperties;

export const subCardStyle = {
  padding: 24,
  borderRadius: 8,
  border: `1px solid rgba(212, 175, 55, 0.12)`,
  background: "rgba(22, 28, 38, 0.5)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  transition: "all 0.3s ease",
} satisfies CSSProperties;

export const eyebrowStyle = {
  margin: 0,
  fontSize: 12,
  letterSpacing: 0,
  textTransform: "none",
  color: "rgba(244, 239, 230, 0.58)",
} satisfies CSSProperties;

export const titleStyle = {
  margin: "12px 0 0",
  fontSize: 34,
  lineHeight: 1.15,
  fontFamily: "var(--font-serif)",
  color: "var(--color-accent-strong)",
} satisfies CSSProperties;

export const sectionTitleStyle = {
  margin: "12px 0 0",
  fontSize: 26,
  lineHeight: 1.2,
  fontFamily: "var(--font-serif)",
  color: "#fff",
} satisfies CSSProperties;

export const bodyTextStyle = {
  margin: "12px 0 0",
  color: mutedText,
  lineHeight: 1.6,
} satisfies CSSProperties;

export const helperTextStyle = {
  margin: 0,
  color: mutedText,
  lineHeight: 1.55,
} satisfies CSSProperties;

export const mutedMonoStyle = {
  color: mutedText,
  fontFamily: "monospace",
  fontSize: 12,
} satisfies CSSProperties;

export const fieldStyle = {
  width: "100%",
  marginTop: 8,
  padding: "14px 16px",
  borderRadius: 8,
  border: `1px solid rgba(212, 175, 55, 0.3)`,
  background: "rgba(10, 13, 19, 0.7)",
  color: "#fceb9c",
  boxShadow: "inset 0 4px 10px rgba(0,0,0,0.6)",
  outline: "none",
  transition: "border-color 0.3s ease, box-shadow 0.3s ease",
} satisfies CSSProperties;

export const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
} satisfies CSSProperties;

export const listStyle = {
  display: "grid",
  gap: 12,
  marginTop: 18,
} satisfies CSSProperties;

export const infoGridStyle = {
  display: "grid",
  gap: 16,
  marginTop: 18,
} satisfies CSSProperties;

export function createButtonStyle({
  variant,
  active = false,
}: {
  variant: "primary" | "secondary";
  active?: boolean;
}): CSSProperties {
  if (variant === "primary") {
    return {
      padding: "12px 24px",
      borderRadius: 8,
      border: "1px solid rgba(255, 215, 0, 0.4)",
      background: active ? "#ffd700" : "linear-gradient(135deg, #fceb9c 0%, var(--color-accent) 100%)",
      color: "#1a1508",
      cursor: "pointer",
      fontWeight: 600,
      fontFamily: "var(--font-sans)",
      boxShadow: "0 8px 16px rgba(0,0,0,0.4)",
    };
  }

  return {
    padding: "12px 24px",
    borderRadius: 8,
    border: `1px solid ${borderColor}`,
    background: active ? "rgba(212, 175, 55, 0.25)" : "rgba(26, 32, 44, 0.6)",
    color: "var(--color-accent-strong)",
    cursor: "pointer",
    fontWeight: 600,
    fontFamily: "var(--font-sans)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  };
}

export function createBadgeStyle(tone: "neutral" | "success" | "error"): CSSProperties {
  const tones = {
    neutral: {
      background: "rgba(255, 248, 239, 0.08)",
      color: "#f4efe6",
    },
    success: {
      background: "rgba(131, 196, 138, 0.16)",
      color: "#d9f0db",
    },
    error: {
      background: "rgba(240, 138, 113, 0.16)",
      color: "#ffc8bc",
    },
  } satisfies Record<string, { background: string; color: string }>;

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 1,
    ...tones[tone],
  };
}
