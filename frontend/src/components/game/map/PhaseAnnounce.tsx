import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../../../i18n";
import "./PhaseAnnounce.css";

type PhaseAnnounceProps = {
  phase: string | null;
  round: number;
};

function getPhaseTitle(phase: string): string {
  const key = (["decision", "market", "settlement"] as string[]).includes(phase) ? `game:phaseAnnounce.${phase}` : null;
  return key ? i18n.t(key) : phase;
}

function formatRoundPhase(roundLabel: string, round: number, phaseTitle: string): string {
  if (i18n.language?.startsWith("zh")) {
    return `第${round}${roundLabel}：${phaseTitle}`;
  }
  return `${roundLabel} ${round}: ${phaseTitle}`;
}

// Phases that need announce animation (decision and market need it; settlement follows market automatically)
const ANNOUNCE_PHASES = new Set(["decision", "market"]);

export function PhaseAnnounce({ phase, round }: PhaseAnnounceProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [displayPhase, setDisplayPhase] = useState<string | null>(null);
  const [displayRound, setDisplayRound] = useState(0);
  const [announcementVersion, setAnnouncementVersion] = useState(0);
  const lastAnnouncedKey = useRef("");

  useEffect(() => {
    if (!phase || !ANNOUNCE_PHASES.has(phase)) return;

    const key = `${phase}-${round}`;
    if (key === lastAnnouncedKey.current) return;

    lastAnnouncedKey.current = key;
    setDisplayPhase(phase);
    setDisplayRound(round);
    setAnnouncementVersion((previous) => previous + 1);
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2200);
    return () => clearTimeout(timer);
  }, [phase, round]);

  if (!visible || !displayPhase) return null;

  const phaseTitle = getPhaseTitle(displayPhase);

  return (
    <div
      key={announcementVersion}
      className="phase-announce"
      data-testid="phase-announce"
    >
      <div className="phase-announce__content">
        <h1 className="phase-announce__title">
          {formatRoundPhase(t("game:situation.roundText"), displayRound, phaseTitle)}
        </h1>
        <div className="phase-announce__line" />
      </div>
    </div>
  );
}
