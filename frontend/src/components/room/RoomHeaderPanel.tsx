import type { RoomHeaderViewModel } from "../../features/room/roomPreparationViewModel";
import { getCountryLabel } from "../../features/room/roomPreparationViewModel";
import type { RoomContext, RoomMember } from "../../types";


type RoomHeaderPanelViewModelProps = {
  viewModel: RoomHeaderViewModel;
  onCopyRoomCode: () => void;
  onCopyInviteLink: () => void;
  hasCopiedRoomCode: boolean;
  hasCopiedInviteLink: boolean;
  onReturnToLobby?: () => void;
  isReturningToLobby?: boolean;
};

type RoomHeaderPanelLegacyProps = {
  room: RoomContext;
  currentPlayer: RoomMember | null;
  socketState: "idle" | "connecting" | "connected" | "disconnected";
  isLoading: boolean;
  statusMessage: string;
};

type RoomHeaderPanelProps = RoomHeaderPanelViewModelProps | RoomHeaderPanelLegacyProps;

export function RoomHeaderPanel(props: RoomHeaderPanelProps) {
  const resolvedViewModel = "viewModel" in props ? props.viewModel : createLegacyHeaderViewModel(props);
  const resolvedOnCopyRoomCode = "onCopyRoomCode" in props ? props.onCopyRoomCode : () => undefined;
  const resolvedOnCopyInviteLink = "onCopyInviteLink" in props ? props.onCopyInviteLink : () => undefined;
  const resolvedHasCopiedRoomCode = "hasCopiedRoomCode" in props ? props.hasCopiedRoomCode : false;
  const resolvedHasCopiedInviteLink = "hasCopiedInviteLink" in props ? props.hasCopiedInviteLink : false;
  const resolvedOnReturnToLobby = "onReturnToLobby" in props ? props.onReturnToLobby : undefined;
  const resolvedIsReturningToLobby = "isReturningToLobby" in props ? Boolean(props.isReturningToLobby) : false;

  return (
    <section className="room-panel room-command-panel">
      <div className="room-command-panel__title-block">
        <p className="room-panel__eyebrow">房间准备</p>
        <h1>开局准备区</h1>
        <p>选定国家、确认席位，所有玩家准备后自动进入第 1 回合。</p>
      </div>

      <div
        aria-live="polite"
        className="room-command-panel__status"
        data-testid="room-status-banner"
        role="status"
      >
        <div className="room-command-panel__meta-card">
          <span>当前玩家</span>
          <strong>{resolvedViewModel.playerName}</strong>
          <small>{resolvedViewModel.roleLabel} · {resolvedViewModel.countryLabel}</small>
        </div>
        <div className="room-command-panel__meta-card">
          <span>你的状态</span>
          <strong>{resolvedViewModel.playerStatusLabel}</strong>
          <small>{resolvedViewModel.roomStatusLabel}</small>
        </div>

        <span className="room-chip" data-testid="room-code">
          房间码 <strong>{resolvedViewModel.roomCode || "待分配"}</strong>
        </span>
        <span className="room-chip">当前状态 <strong>{resolvedViewModel.roomStatusLabel}</strong></span>
      </div>

      <div className="room-command-panel__actions">
        <button
          className="room-button"
          onClick={resolvedOnCopyRoomCode}
          type="button"
        >
          {resolvedHasCopiedRoomCode ? "房间码已复制" : "复制房间码"}
        </button>
        <button
          className="room-button"
          onClick={resolvedOnCopyInviteLink}
          type="button"
        >
          {resolvedHasCopiedInviteLink ? "邀请链接已复制" : "复制邀请链接"}
        </button>
        {resolvedOnReturnToLobby ? (
          <button
            className="room-button room-button--danger"
            disabled={resolvedIsReturningToLobby}
            onClick={resolvedOnReturnToLobby}
            type="button"
          >
            {resolvedIsReturningToLobby ? "返回中..." : "回到大厅"}
          </button>
        ) : null}
      </div>

      {(resolvedViewModel.helperMessage) && (
        <div className="room-command-panel__message">
          <span className="room-chip">
            系统提示 <strong>{resolvedViewModel.helperMessage}</strong>
          </span>
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
