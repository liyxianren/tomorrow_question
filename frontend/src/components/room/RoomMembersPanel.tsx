import type { CSSProperties } from "react";

import type { RoomMemberViewModel } from "../../features/room/roomPreparationViewModel";
import { getCountryLabel } from "../../features/room/roomPreparationViewModel";
import type { RoomContext } from "../../types";


type RoomMembersPanelViewModelProps = {
  members: RoomMemberViewModel[];
  isBusy?: boolean;
  onRemoveBot?: (playerId: string) => void;
};

type RoomMembersPanelLegacyProps = {
  room: RoomContext;
  currentPlayerId: string | null;
};

type RoomMembersPanelProps = RoomMembersPanelViewModelProps | RoomMembersPanelLegacyProps;

const itemStyle = {
  padding: "16px",
  borderRadius: 12,
  background: "linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)",
  borderLeft: "3px solid #d4af37",
  marginBottom: 8,
  display: "grid",
  gap: 6,
  boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
} satisfies CSSProperties;

export function RoomMembersPanel(props: RoomMembersPanelProps) {
  const members = "members" in props ? props.members : props.room.members.map((member) => ({
    playerId: member.playerId,
    nickname: member.nickname,
    identityLabel: [
      member.memberType === "bot" ? "AI 补位" : member.playerId === props.room.hostPlayerId ? "房主" : "成员",
      member.playerId === props.currentPlayerId ? "你" : null,
    ].filter(Boolean).join(" / "),
    countryLabel: getCountryLabel(member.selectedCountry),
    connectionLabel: member.memberType === "bot"
      ? "服务器托管"
      : member.connectionStatus === "online"
        ? "在线"
        : "离线后可恢复",
    readyLabel: member.isReady ? "已准备开局" : "尚未准备开局",
    memberTypeBadge: member.memberType === "bot" ? "AI" : null,
    canRemoveBot: false,
  }));
  const isBusy = "members" in props ? Boolean(props.isBusy) : false;
  const onRemoveBot = "members" in props ? props.onRemoveBot : undefined;

  return (
    <section className="panel" data-testid="room-members-panel" style={{ background: "rgba(30, 24, 20, 0.85)", border: "1px solid rgba(212, 175, 55, 0.3)", boxShadow: "inset 0 0 50px rgba(0,0,0,0.8)", borderRadius: 16, padding: 32 }}>
      <p className="panel__eyebrow" style={{ color: "rgba(212, 175, 55, 0.8)", letterSpacing: "0.2em", margin: "0 0 4px" }}>房间成员</p>
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 24, margin: "0 0 8px", color: "#fceb9c", borderBottom: "1px solid rgba(212, 175, 55, 0.2)", paddingBottom: 16 }}>房间内玩家</h2>

      <div style={{ marginTop: 20 }}>
        {members.length > 0 ? (
          members.map((member) => (
            <article data-testid={`room-member-${member.playerId}`} key={member.playerId} style={{ ...itemStyle, borderLeftColor: member.readyLabel.includes("已准备") ? "var(--color-success)" : "#d4af37" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 18, color: "#f4efe6", letterSpacing: "0.05em" }}>{member.nickname}</strong>
                  {member.memberTypeBadge ? (
                    <span
                      data-testid={`room-member-ai-badge-${member.playerId}`}
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "rgba(212, 175, 55, 0.16)",
                        color: "#fceb9c",
                        fontSize: 11,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {member.memberTypeBadge}
                    </span>
                  ) : null}
                </div>
                <span style={{ fontSize: 12, color: member.readyLabel.includes("已准备") ? "var(--color-success)" : "rgba(255,255,255,0.4)" }}>{member.readyLabel}</span>
              </div>
              
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4 }}>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>身份: <span style={{ color: "rgba(255,255,255,0.8)" }}>{member.identityLabel}</span></div>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>国家: <span style={{ color: "rgba(255,255,255,0.8)" }}>{member.countryLabel}</span></div>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>连接: <span style={{ color: "rgba(255,255,255,0.8)" }}>{member.connectionLabel}</span></div>
              </div>

              {member.canRemoveBot && onRemoveBot ? (
                <div style={{ marginTop: 10 }}>
                  <button
                    data-testid={`room-remove-bot-${member.playerId}`}
                    disabled={isBusy}
                    onClick={() => onRemoveBot(member.playerId)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: "1px solid rgba(240,138,113,0.35)",
                      background: "rgba(240,138,113,0.08)",
                      color: "#f0b9aa",
                      cursor: isBusy ? "not-allowed" : "pointer",
                    }}
                    type="button"
                  >
                    {isBusy ? "处理中..." : "踢出 AI"}
                  </button>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <article style={itemStyle}>当前还没有其他玩家进入房间。</article>
        )}
      </div>
    </section>
  );
}
