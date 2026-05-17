import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
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
  const { t } = useTranslation("room");
  const viewModel = "viewModel" in rest ? rest.viewModel : createLegacyPrimaryActionViewModel(rest);
  const aiControls = "viewModel" in rest ? rest.aiControls ?? null : null;

  return (
    <section className="room-panel room-ready-panel">
      <div className="room-ready-panel__head">
        <div>
          <p className="room-panel__eyebrow">{t("eyebrow")}</p>
          <h2 className="room-panel__title">{t("actions.ready")}</h2>
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
          {isBusy ? t("common:loading") : viewModel.buttonLabel}
        </button>
      </div>

      <div className="room-ready-panel__status">
        <div>
          <span>{viewModel.title}</span>
          <strong>{viewModel.title}</strong>
        </div>
        <div>
          <span>{t("countrySelection.title")}</span>
          <strong>{viewModel.selectedCountrySummary}</strong>
        </div>
        <div>
          <span>{t("members.title")}</span>
          <strong>{viewModel.memberSummary}</strong>
        </div>
      </div>

      {aiControls ? (
        <div className={`room-ready-panel__ai${aiControls.isHighlighted ? " room-ready-panel__ai--highlight" : ""}`}>
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
        <summary>{t("status.readying")}</summary>
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
            <strong>{t("status.readying")}</strong>
            <p>{viewModel.autoStartRule}</p>
          </div>

          {viewModel.blockingReason ? (
            <div className="room-ready-panel__blocking">
              <strong>{t("status.waiting")}</strong>
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
    ? i18n.t("room:status.in_game")
    : currentPlayer?.isReady
      ? i18n.t("room:actions.ready")
      : currentPlayer?.selectedCountry
        ? i18n.t("room:countrySelection.title")
        : i18n.t("room:countrySelection.noSelection");

  return {
    title,
    nextStepTitle: i18n.t("room:countrySelection.confirm"),
    nextStepDescription: statusMessage,
    buttonLabel: currentPlayer?.isReady ? i18n.t("room:actions.unready") : i18n.t("room:actions.ready"),
    buttonDisabled: !currentPlayer?.selectedCountry,
    canToggleReady: Boolean(currentPlayer?.selectedCountry),
    readySummary: i18n.t("room:readyCount", { ready: readyCount, total: room.members.length || 5 }),
    memberSummary: i18n.t("room:memberCount", { count: room.members.length, max: 5 }),
    selectedCountrySummary: currentPlayer?.selectedCountry
      ? `${i18n.t("room:countrySelection.title")}: ${currentPlayer.selectedCountry}`
      : i18n.t("room:countrySelection.noSelection"),
    readyStateSummary: currentPlayer?.isReady
      ? i18n.t("room:actions.ready")
      : i18n.t("room:actions.unready"),
    waitingTitle: i18n.t("room:status.waiting"),
    waitingDescription: statusMessage,
    waitingItems: [],
    startChecklistTitle: i18n.t("room:status.readying"),
    startChecklist: [],
    autoStartRule: i18n.t("room:status.readying"),
    blockingReason: null,
  };
}
