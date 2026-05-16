import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
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

export function RoomMembersPanel(props: RoomMembersPanelProps) {
  const { t } = useTranslation("room");
  const members = "members" in props ? props.members : props.room.members.map((member) => ({
    playerId: member.playerId,
    nickname: member.nickname,
    identityLabel: [
      member.memberType === "bot" ? "AI" : member.playerId === props.room.hostPlayerId ? i18n.t("room:members.host") : i18n.t("room:members.you"),
      member.playerId === props.currentPlayerId ? i18n.t("room:members.you") : null,
    ].filter(Boolean).join(" / "),
    countryLabel: getCountryLabel(member.selectedCountry),
    connectionLabel: member.memberType === "bot"
      ? "server"
      : member.connectionStatus === "online"
        ? "online"
        : "offline",
    readyLabel: member.isReady ? i18n.t("room:actions.ready") : i18n.t("room:actions.unready"),
    memberTypeBadge: member.memberType === "bot" ? "AI" : null,
    canRemoveBot: false,
  }));
  const isBusy = "members" in props ? Boolean(props.isBusy) : false;
  const onRemoveBot = "members" in props ? props.onRemoveBot : undefined;
  const visibleSeatCount = Math.max(5, members.length);
  const memberRows = Array.from({ length: visibleSeatCount }, (_, index) => members[index] ?? null);

  return (
    <section className="room-panel room-roster-panel" data-testid="room-members-panel">
      <div className="room-roster-panel__head">
        <p className="room-panel__eyebrow">{t("members.title")}</p>
        <h2 className="room-panel__title">{t("members.title")}</h2>
        <span className="room-roster-panel__legend">{t("members.title")}</span>
      </div>

      <div className="room-roster-list">
        {memberRows.map((member, index) => {
          if (!member) {
            return (
              <article
                className="room-member-card room-member-card--empty"
                data-testid={`room-member-empty-${index + 1}`}
                key={`empty-${index}`}
              >
                <div className="room-member-card__summary">
                  <div className="room-member-card__id">
                    <strong>{t("members.empty")} {index + 1}</strong>
                  </div>
                  <strong className="room-member-card__country">{t("members.empty")}</strong>
                  <span className="room-member-card__ready">{t("actions.unready")}</span>
                </div>
              </article>
            );
          }

          return (
            <article
              className={`room-member-card${member.readyLabel.includes(t("actions.ready")) ? " room-member-card--ready" : ""}`}
              data-testid={`room-member-${member.playerId}`}
              key={member.playerId}
            >
              <div className="room-member-card__summary">
                <div className="room-member-card__id">
                  <strong title={member.playerId}>{member.nickname}</strong>
                  <span>{member.identityLabel}</span>
                  {member.memberTypeBadge ? (
                    <span
                      className="room-member-card__badge"
                      data-testid={`room-member-ai-badge-${member.playerId}`}
                    >
                      {member.memberTypeBadge}
                    </span>
                  ) : null}
                </div>
                <strong className="room-member-card__country">{member.countryLabel}</strong>
                <span className="room-member-card__ready">{member.readyLabel}</span>

                {member.canRemoveBot && onRemoveBot ? (
                  <button
                    className="room-member-card__remove"
                    data-testid={`room-remove-bot-${member.playerId}`}
                    disabled={isBusy}
                    onClick={() => onRemoveBot(member.playerId)}
                    type="button"
                  >
                  {isBusy ? "..." : i18n.t("room:actions.leave")}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
