import type { CSSProperties } from "react";

import type { RoomAiControlsViewModel, RoomPrimaryActionViewModel } from "../../features/room/roomPreparationViewModel";
import type { RoomContext, RoomMember } from "../../types";


type RoomReadyPanelViewModelProps = {
  viewModel: RoomPrimaryActionViewModel;
  aiControls?: RoomAiControlsViewModel | null;
  isBusy: boolean;
  onToggleReady: () => void;
  onFillBots?: () => void;
};

type RoomReadyPanelLegacyProps = {
  room: RoomContext;
  currentPlayer: RoomMember | null;
  isBusy: boolean;
  onToggleReady: () => void;
  onFillBots?: () => void;
  statusMessage: string;
};

type RoomReadyPanelProps = RoomReadyPanelViewModelProps | RoomReadyPanelLegacyProps;

const buttonStyle = {
  padding: "14px 28px",
  borderRadius: 999,
  border: "1px solid rgba(212, 175, 55, 0.4)",
  background: "linear-gradient(135deg, rgba(212, 175, 55, 0.15) 0%, rgba(26, 32, 44, 0.6) 100%)",
  backdropFilter: "blur(8px)",
  color: "var(--color-accent-strong)",
  cursor: "pointer",
  fontWeight: 600,
  fontFamily: "var(--font-sans)",
  letterSpacing: "0.05em",
  transition: "all 0.2s ease",
} satisfies CSSProperties;

export function RoomReadyPanel({
  isBusy,
  onToggleReady,
  onFillBots,
  ...rest
}: RoomReadyPanelProps) {
  const viewModel = "viewModel" in rest ? rest.viewModel : createLegacyPrimaryActionViewModel(rest);
  const aiControls = "viewModel" in rest ? rest.aiControls ?? null : null;

  return (
    <section className="panel" style={{ background: "rgba(10, 15, 20, 0.9)", border: "1px solid rgba(220, 50, 50, 0.3)", boxShadow: "0 20px 40px rgba(0,0,0,0.6), inset 0 0 60px rgba(220, 50, 50, 0.1)", borderRadius: 16, padding: 32, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg, transparent, rgba(220, 50, 50, 0.8), transparent)" }} />
      
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <p className="panel__eyebrow" style={{ color: "rgba(220, 50, 50, 0.8)", letterSpacing: "0.2em", margin: "0 0 8px" }}>第 2 步</p>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 32, margin: 0, color: "#fff", textShadow: "0 0 20px rgba(220, 50, 50, 0.4)" }}>准备开局</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>你的当前状态</span>
            <span style={{ color: "#fceb9c", fontSize: 13, fontWeight: "bold" }}>{viewModel.title}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>当前国家</span>
            <span style={{ color: "#fff", fontSize: 13 }}>{viewModel.selectedCountrySummary}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>准备进度</span>
            <span style={{ color: "#d9f0db", fontSize: 13 }}>{viewModel.readySummary}</span>
          </div>
        </div>

        <div style={{ padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
          <strong style={{ color: "#fff", display: "block", marginBottom: 8 }}>{viewModel.nextStepTitle}</strong>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", fontSize: 13, lineHeight: 1.6 }}>{viewModel.nextStepDescription}</p>
        </div>

        <div style={{ padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
          <strong style={{ color: "#fff", display: "block", marginBottom: 10 }}>{viewModel.startChecklistTitle}</strong>
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6, color: "rgba(255,255,255,0.78)", fontSize: 13 }}>
            {viewModel.startChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div style={{ padding: 16, background: "rgba(242, 195, 122, 0.08)", borderRadius: 12, borderLeft: "3px solid #fceb9c" }}>
          <strong style={{ color: "#fceb9c", display: "block", marginBottom: 8 }}>自动开局规则</strong>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.76)", fontSize: 13, lineHeight: 1.6 }}>{viewModel.autoStartRule}</p>
        </div>

        {aiControls ? (
          <div style={{ padding: 16, background: "rgba(89, 139, 222, 0.08)", borderRadius: 12, borderLeft: "3px solid #7ba7ff" }}>
            <strong style={{ color: "#dbe7ff", display: "block", marginBottom: 8 }}>{aiControls.title}</strong>
            <p style={{ margin: "0 0 10px", color: "rgba(255,255,255,0.76)", fontSize: 13, lineHeight: 1.6 }}>{aiControls.description}</p>
            <p style={{ margin: "0 0 12px", color: "rgba(255,255,255,0.62)", fontSize: 13, lineHeight: 1.6 }}>{aiControls.helperText}</p>
            {aiControls.showFillButton ? (
              <button
                data-testid="room-fill-bots-button"
                disabled={aiControls.fillButtonDisabled}
                onClick={onFillBots}
                style={{
                  ...buttonStyle,
                  width: "100%",
                  cursor: aiControls.fillButtonDisabled ? "not-allowed" : "pointer",
                  opacity: aiControls.fillButtonDisabled ? 0.55 : 1,
                }}
                type="button"
              >
                {aiControls.fillButtonLabel}
              </button>
            ) : null}
          </div>
        ) : null}

        <div style={{ textAlign: "center" }}>
          <button
            data-testid="room-ready-button"
            disabled={isBusy || viewModel.buttonDisabled}
            onClick={onToggleReady}
            style={{
              width: "100%",
              padding: "20px 0",
              borderRadius: 12,
              border: viewModel.buttonDisabled ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(220, 50, 50, 0.6)",
              background: viewModel.buttonDisabled ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, rgba(220,50,50,0.4) 0%, rgba(180,30,30,0.8) 100%)",
              color: viewModel.buttonDisabled ? "rgba(255,255,255,0.4)" : "#fff",
              fontSize: 22,
              fontFamily: "var(--font-serif)",
              letterSpacing: "0.1em",
              cursor: viewModel.buttonDisabled ? "not-allowed" : "pointer",
              boxShadow: viewModel.buttonDisabled ? "none" : "0 10px 30px rgba(220,50,50,0.3), inset 0 2px 0 rgba(255,255,255,0.3)",
              transition: "all 0.3s ease",
            }}
            type="button"
          >
            {isBusy ? "准备状态更新中..." : viewModel.buttonLabel}
          </button>
        </div>

        {viewModel.blockingReason ? (
          <div style={{ padding: 14, background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
            <strong style={{ color: "#fceb9c", display: "block", marginBottom: 8, fontSize: 14 }}>为什么现在还不能直接开局</strong>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: 1.6 }}>{viewModel.blockingReason}</p>
          </div>
        ) : null}

        {viewModel.waitingItems.length > 0 && (
          <div style={{ marginTop: 8, padding: 16, background: "rgba(240, 138, 113, 0.1)", borderRadius: 12, border: "1px dashed rgba(240, 138, 113, 0.3)" }}>
            <strong style={{ color: "var(--color-error)", fontSize: 14, display: "block", marginBottom: 8 }}>{viewModel.waitingTitle}</strong>
            <p style={{ margin: "0 0 8px", color: "rgba(255,255,255,0.72)", fontSize: 13 }}>{viewModel.waitingDescription}</p>
            <ul style={{ margin: 0, paddingLeft: 20, color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
              {viewModel.waitingItems.map((item) => (
                <li key={item} style={{ marginBottom: 4 }}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function createLegacyPrimaryActionViewModel({
  room,
  currentPlayer,
  statusMessage,
}: Pick<RoomReadyPanelLegacyProps, "room" | "currentPlayer" | "statusMessage">): RoomPrimaryActionViewModel {
  const readyCount = room.members.filter((member) => member.isReady).length;
  const title = room.status === "in_game"
    ? "房间已开局，正在进入游戏"
    : currentPlayer?.isReady
      ? "已准备"
      : currentPlayer?.selectedCountry
        ? "已选国家"
        : "未选国家";

  return {
    title,
    nextStepTitle: "下一步",
    nextStepDescription: statusMessage,
    buttonLabel: currentPlayer?.isReady ? "取消准备" : "准备开局",
    buttonDisabled: !currentPlayer?.selectedCountry,
    canToggleReady: Boolean(currentPlayer?.selectedCountry),
    readySummary: `${readyCount} / ${room.members.length || 5} 人已准备开局`,
    memberSummary: `${room.members.length} / 5 人已进入房间`,
    selectedCountrySummary: currentPlayer?.selectedCountry
      ? `已选国家：${currentPlayer.selectedCountry}`
      : "你尚未选定国家",
    readyStateSummary: currentPlayer?.isReady ? "你已准备开局" : "你尚未准备开局",
    waitingTitle: "等待开局",
    waitingDescription: statusMessage,
    waitingItems: [],
    startChecklistTitle: "开局前检查清单",
    startChecklist: [],
    autoStartRule: "自动开局规则：所有玩家选好国家并全部点下准备后，系统会自动进入第 1 回合。",
    blockingReason: null,
  };
}
