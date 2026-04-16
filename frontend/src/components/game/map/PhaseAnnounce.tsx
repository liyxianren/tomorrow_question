import { useEffect, useRef, useState } from "react";
import "./PhaseAnnounce.css";

type PhaseAnnounceProps = {
  phase: string | null;
  round: number;
};

const PHASE_TITLE: Record<string, string> = {
  decision: "决策",
  market: "出售",
  settlement: "结算中",
};

// 需要显示特效的阶段（decision 和 market 需要特效，settlement 跟随 market 之后自动进入）
const ANNOUNCE_PHASES = new Set(["decision", "market"]);

export function PhaseAnnounce({ phase, round }: PhaseAnnounceProps) {
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

  const title = PHASE_TITLE[displayPhase] ?? displayPhase;

  return (
    <div
      key={announcementVersion}
      className="phase-announce"
      data-testid="phase-announce"
    >
      <div className="phase-announce__content">
        <h1 className="phase-announce__title">
          第{displayRound}回合：{title}
        </h1>
        <div className="phase-announce__line" />
      </div>
    </div>
  );
}
