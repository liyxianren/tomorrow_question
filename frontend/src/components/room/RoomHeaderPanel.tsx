import type { CSSProperties } from "react";

import type { RoomHeaderViewModel } from "../../features/room/roomPreparationViewModel";
import { getCountryLabel } from "../../features/room/roomPreparationViewModel";
import type { RoomContext, RoomMember } from "../../types";


type RoomHeaderPanelViewModelProps = {
  viewModel: RoomHeaderViewModel;
  onCopyRoomCode: () => void;
  onCopyInviteLink: () => void;
  hasCopiedRoomCode: boolean;
  hasCopiedInviteLink: boolean;
};

type RoomHeaderPanelLegacyProps = {
  room: RoomContext;
  currentPlayer: RoomMember | null;
  socketState: "idle" | "connecting" | "connected" | "disconnected";
  isLoading: boolean;
  statusMessage: string;
};

type RoomHeaderPanelProps = RoomHeaderPanelViewModelProps | RoomHeaderPanelLegacyProps;

const badgeStyle = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(212, 160, 95, 0.14)",
  color: "#f1c98c",
} satisfies CSSProperties;

export function RoomHeaderPanel(props: RoomHeaderPanelProps) {
  const resolvedViewModel = "viewModel" in props ? props.viewModel : createLegacyHeaderViewModel(props);
  const resolvedOnCopyRoomCode = "onCopyRoomCode" in props ? props.onCopyRoomCode : () => undefined;
  const resolvedOnCopyInviteLink = "onCopyInviteLink" in props ? props.onCopyInviteLink : () => undefined;
  const resolvedHasCopiedRoomCode = "hasCopiedRoomCode" in props ? props.hasCopiedRoomCode : false;
  const resolvedHasCopiedInviteLink = "hasCopiedInviteLink" in props ? props.hasCopiedInviteLink : false;

  return (
    <section className="panel" style={{ 
      padding: "24px 32px", 
      borderRadius: 16, 
      background: "linear-gradient(90deg, rgba(20, 24, 30, 0.95) 0%, rgba(10, 14, 20, 0.8) 100%)", 
      border: "1px solid rgba(212, 175, 55, 0.4)", 
      borderTop: "4px solid #d4af37",
      boxShadow: "0 10px 30px rgba(0,0,0,0.5)", 
      display: "flex", 
      flexDirection: "column",
      gap: 20
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 24 }}>
        <div>
          <p className="panel__eyebrow" style={{ color: "#fceb9c", letterSpacing: "0.2em", margin: 0 }}>房间状态</p>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 32, margin: "8px 0 0", color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.8)" }}>开局准备区</h2>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ textAlign: "right", paddingRight: 16, borderRight: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>当前玩家</div>
            <strong style={{ fontSize: 16, color: "#fceb9c" }}>{resolvedViewModel.playerName}</strong>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{resolvedViewModel.roleLabel} · {resolvedViewModel.countryLabel}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>你的状态</div>
            <div style={{ fontSize: 14, color: resolvedViewModel.playerStatusLabel.includes("已准备") ? "var(--color-success)" : "#f1c98c" }}>{resolvedViewModel.playerStatusLabel}</div>
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: "rgba(212, 175, 55, 0.2)" }} />

      <div
        aria-live="polite"
        data-testid="room-status-banner"
        role="status"
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}
      >
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span data-testid="room-code" style={{ ...badgeStyle, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontFamily: "monospace", letterSpacing: "0.1em", fontSize: 16 }}>
            房间码: <span style={{ color: "#fceb9c" }}>{resolvedViewModel.roomCode || "待分配"}</span>
          </span>
          <span style={{ ...badgeStyle, background: "rgba(212, 160, 95, 0.1)", border: "1px solid rgba(212, 160, 95, 0.3)" }}>当前状态: {resolvedViewModel.roomStatusLabel}</span>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={resolvedOnCopyRoomCode}
            style={{ ...buttonStyle, background: resolvedHasCopiedRoomCode ? "rgba(212, 160, 95, 0.24)" : "rgba(255, 255, 255, 0.05)" }}
            type="button"
          >
            {resolvedHasCopiedRoomCode ? "房间码已复制" : "复制房间码"}
          </button>
          <button
            onClick={resolvedOnCopyInviteLink}
            style={{ ...buttonStyle, background: resolvedHasCopiedInviteLink ? "rgba(212, 160, 95, 0.24)" : "rgba(255, 255, 255, 0.05)" }}
            type="button"
          >
            {resolvedHasCopiedInviteLink ? "邀请链接已复制" : "复制邀请链接"}
          </button>
        </div>
      </div>

      {(resolvedViewModel.helperMessage) && (
        <div style={{ padding: "8px 16px", background: "rgba(255,255,255,0.05)", borderRadius: 8, fontSize: 13, color: "var(--color-text-muted)" }}>
          <span style={{ color: "#fceb9c" }}>系统提示：</span>{resolvedViewModel.helperMessage || "把房间码或邀请链接发给其他玩家。所有人选好国家并准备后，房间会自动开局。"}
        </div>
      )}
    </section>
  );
}

function createLegacyHeaderViewModel({
  room,
  currentPlayer,
  statusMessage,
}: RoomHeaderPanelLegacyProps): RoomHeaderViewModel {
  return {
    roomCode: room.roomCode,
    roomStatusLabel: room.status === "in_game" ? "房间已开局，正在进入游戏" : "等待其他玩家",
    playerName: currentPlayer?.nickname ?? "等待识别",
    roleLabel: currentPlayer?.playerId === room.hostPlayerId ? "房主" : "成员",
    playerStatusLabel: room.status === "in_game"
      ? "房间已开局，正在进入游戏"
      : currentPlayer?.isReady
        ? "已准备开局"
        : currentPlayer?.selectedCountry
          ? "已选国家"
          : "未选国家",
    countryLabel: getCountryLabel(currentPlayer?.selectedCountry ?? null),
    helperMessage: statusMessage || null,
  };
}

const buttonStyle = {
  padding: "8px 14px",
  borderRadius: 999,
  border: "1px solid rgba(255, 224, 180, 0.14)",
  background: "rgba(255, 255, 255, 0.04)",
  color: "#f4efe6",
  cursor: "pointer",
} satisfies CSSProperties;
