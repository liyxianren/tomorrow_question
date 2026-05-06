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

export function RoomReadyPanel({
  isBusy,
  onToggleReady,
  onFillBots,
  ...rest
}: RoomReadyPanelProps) {
  const viewModel = "viewModel" in rest ? rest.viewModel : createLegacyPrimaryActionViewModel(rest);
  const aiControls = "viewModel" in rest ? rest.aiControls ?? null : null;

  return (
    <section className="room-panel room-ready-panel">
      <div className="room-ready-panel__head">
        <div>
          <p className="room-panel__eyebrow">第 2 步</p>
          <h2 className="room-panel__title">准备开局</h2>
        </div>
        <span className="room-chip">{viewModel.readySummary}</span>
      </div>

      <div className="room-ready-panel__action">
        <div>
          <strong>{viewModel.nextStepTitle}</strong>
          <p>{viewModel.nextStepDescription}</p>
        </div>
        <button
          className="room-button room-button--primary room-ready-panel__submit"
          data-testid="room-ready-button"
          disabled={isBusy || viewModel.buttonDisabled}
          onClick={onToggleReady}
          type="button"
        >
          {isBusy ? "准备状态更新中..." : viewModel.buttonLabel}
        </button>
      </div>

      <div className="room-ready-panel__status">
        <div>
          <span>你的当前状态</span>
          <strong>{viewModel.title}</strong>
        </div>
        <div>
          <span>当前国家</span>
          <strong>{viewModel.selectedCountrySummary}</strong>
        </div>
        <div>
          <span>进房人数</span>
          <strong>{viewModel.memberSummary}</strong>
        </div>
      </div>

      {aiControls ? (
        <div className="room-ready-panel__ai">
          <div>
            <strong>{aiControls.title}</strong>
            <p>{aiControls.helperText}</p>
            <span>{aiControls.description}</span>
          </div>
          {aiControls.showFillButton ? (
            <button
              className="room-button"
              data-testid="room-fill-bots-button"
              disabled={aiControls.fillButtonDisabled}
              onClick={onFillBots}
              type="button"
            >
              {aiControls.fillButtonLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      <details className="room-ready-panel__details">
        <summary>规则与待办</summary>
        <div className="room-ready-panel__details-body">
          <div className="room-ready-panel__checklist">
            <strong>{viewModel.startChecklistTitle}</strong>
            <ul>
              {viewModel.startChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="room-ready-panel__note">
            <strong>自动开局规则</strong>
            <p>{viewModel.autoStartRule}</p>
          </div>

          {viewModel.blockingReason ? (
            <div className="room-ready-panel__blocking">
              <strong>为什么现在还不能直接开局</strong>
              <p>{viewModel.blockingReason}</p>
            </div>
          ) : null}

          {viewModel.waitingItems.length > 0 ? (
            <div className="room-ready-panel__waiting">
              <strong>{viewModel.waitingTitle}</strong>
              <p>{viewModel.waitingDescription}</p>
              <ul>
                {viewModel.waitingItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
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
