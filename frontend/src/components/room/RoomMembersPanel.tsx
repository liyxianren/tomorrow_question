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
  const visibleSeatCount = Math.max(5, members.length);
  const memberRows = Array.from({ length: visibleSeatCount }, (_, index) => members[index] ?? null);

  return (
    <section className="room-panel room-roster-panel" data-testid="room-members-panel">
      <div className="room-roster-panel__head">
        <p className="room-panel__eyebrow">房间成员</p>
        <h2 className="room-panel__title">房间内玩家</h2>
        <span className="room-roster-panel__legend">玩家ID / 国家 / 状态</span>
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
                    <strong>空位 {index + 1}</strong>
                  </div>
                  <strong className="room-member-card__country">待入席</strong>
                  <span className="room-member-card__ready">未准备</span>
                </div>
              </article>
            );
          }

          return (
            <article
              className={`room-member-card${member.readyLabel.includes("已准备") ? " room-member-card--ready" : ""}`}
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
                  {isBusy ? "..." : "移除"}
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
