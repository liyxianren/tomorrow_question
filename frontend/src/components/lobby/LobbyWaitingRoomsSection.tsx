import { useTranslation } from "react-i18next";
import type { WaitingRoomCardViewModel } from "../../features/lobby/flow/viewModel";
import {
  bodyTextStyle,
  createBadgeStyle,
  eyebrowStyle,
  sectionCardStyle,
  sectionTitleStyle,
} from "./styles";


type LobbyWaitingRoomsSectionProps = {
  rooms: WaitingRoomCardViewModel[];
  isBusy: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  onJoinRoom: (roomCode: string) => void;
  onRefresh: () => void;
};

export function LobbyWaitingRoomsSection({
  rooms,
  isBusy,
  isLoading,
  errorMessage,
  onJoinRoom,
  onRefresh,
}: LobbyWaitingRoomsSectionProps) {
  const { t } = useTranslation("lobby");
  let content: JSX.Element;

  if (errorMessage) {
    content = (
      <div className="lobby-waiting-empty lobby-waiting-empty--error">
        <strong>{t("roomsSection.errorTitle")}</strong>
        <p>{t("roomsSection.errorDetail")}</p>
        <button className="lobby-secondary-button" onClick={onRefresh} type="button">
          {t("roomsSection.retry")}
        </button>
      </div>
    );
  } else if (isLoading && rooms.length === 0) {
    content = (
      <div className="lobby-waiting-empty">
        <strong>{t("roomsSection.loadingTitle")}</strong>
        <p>{t("roomsSection.loadingDetail")}</p>
      </div>
    );
  } else if (rooms.length === 0) {
    content = (
      <div className="lobby-waiting-empty">
        <strong>{t("roomsSection.emptyTitle")}</strong>
        <p>{t("roomsSection.emptyDetail")}</p>
      </div>
    );
  } else {
    content = (
      <div className="lobby-waiting-list">
        {rooms.map((room) => (
          <article
            className="lobby-waiting-room"
            data-testid={`lobby-waiting-room-${room.roomCode}`}
            key={room.roomCode}
          >
            <div className="lobby-waiting-room__head">
              <div>
                <strong>{room.roomCode}</strong>
                <p>{room.hostLabel}</p>
              </div>
              <span style={createBadgeStyle(room.isJoinable ? "success" : "neutral")}>{room.statusLabel}</span>
            </div>

            <div
              aria-label={`${room.memberCountLabel}，${room.availableSeatLabel}`}
              className="lobby-waiting-room__meter"
            >
              <span style={{ width: `${room.occupancyPercent}%` }} />
            </div>

            <div className="lobby-waiting-room__stats">
              <span>{room.memberCountLabel}</span>
              <span>{room.availableSeatLabel}</span>
              <span>{room.readyCountLabel}</span>
              <span>{room.selectedCountriesLabel}</span>
            </div>

            <div className="lobby-waiting-room__members" aria-label={t("roomsSection.membersLabel")}>
              {room.memberPreview.map((member) => (
                <span key={`${room.roomCode}-${member}`}>{member}</span>
              ))}
            </div>

            <div>
              <button
                className="lobby-action-button lobby-action-button--ready"
                disabled={isBusy || !room.isJoinable}
                onClick={() => onJoinRoom(room.roomCode)}
                type="button"
              >
                {room.joinLabel}
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <section
      aria-label={t("roomsSection.title")}
      className="panel lobby-waiting-panel"
      data-testid="lobby-waiting-rooms-panel"
      style={sectionCardStyle}
    >
      <div className="lobby-waiting-panel__head">
        <div>
          <p className="panel__eyebrow" style={eyebrowStyle}>{t("roomsSection.eyebrow")}</p>
          <h2 style={sectionTitleStyle}>{t("roomsSection.title")}</h2>
          <p style={bodyTextStyle}>{t("roomsSection.listHint")}</p>
        </div>
        <button className="lobby-secondary-button" disabled={isLoading} onClick={onRefresh} type="button">
          {isLoading ? t("roomsSection.reading") : t("roomsSection.refresh")}
        </button>
      </div>
      {content}
    </section>
  );
}
