from __future__ import annotations

from dataclasses import dataclass, field

from app.contracts.enums import GamePhase, PlayerSubmissionStatus

from .models import GameSnapshot
from .turn_input import PlayerTurnInput


@dataclass(slots=True)
class PhaseSubmissionState:
    game_id: str
    round_no: int
    phase: GamePhase
    expected_player_ids: tuple[str, ...]
    submissions_by_player_id: dict[str, PlayerTurnInput] = field(default_factory=dict)

    @classmethod
    def from_snapshot(cls, snapshot: GameSnapshot) -> "PhaseSubmissionState":
        return cls(
            game_id=snapshot.game_id,
            round_no=snapshot.round_no,
            phase=snapshot.phase,
            expected_player_ids=tuple(player_state.player_id for player_state in snapshot.player_states),
            submissions_by_player_id={},
        )

    @property
    def submission_status_by_player_id(self) -> dict[str, PlayerSubmissionStatus]:
        statuses = {player_id: PlayerSubmissionStatus.PENDING for player_id in self.expected_player_ids}
        for player_id, turn_input in self.submissions_by_player_id.items():
            statuses[player_id] = turn_input.submission_status
        return statuses

    @property
    def pending_player_ids(self) -> list[str]:
        statuses = self.submission_status_by_player_id
        return [player_id for player_id in self.expected_player_ids if statuses[player_id] == PlayerSubmissionStatus.PENDING]

    @property
    def all_players_submitted(self) -> bool:
        return len(self.pending_player_ids) == 0

    def has_submitted(self, player_id: str) -> bool:
        return player_id in self.submissions_by_player_id

    def with_submission(self, turn_input: PlayerTurnInput) -> "PhaseSubmissionState":
        if turn_input.game_id != self.game_id or turn_input.round_no != self.round_no or turn_input.phase != self.phase:
            raise ValueError("PlayerTurnInput does not match the current phase submission state.")

        updated = dict(self.submissions_by_player_id)
        updated[turn_input.player_id] = turn_input
        return PhaseSubmissionState(
            game_id=self.game_id,
            round_no=self.round_no,
            phase=self.phase,
            expected_player_ids=self.expected_player_ids,
            submissions_by_player_id=updated,
        )

