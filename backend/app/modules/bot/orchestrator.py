from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from app.contracts.enums import GamePhase, PlayerSubmissionStatus
from app.modules.game_state.phase_state import PhaseSubmissionState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.persistence import RecoveryRepository
from app.modules.room.models import Room

from .models import BotPlanningContext, BotSubmissionBatch
from .planner import plan_bot_payload


@dataclass(slots=True)
class BotTurnOrchestrator:
    recovery_repository: RecoveryRepository

    def auto_submit_for_snapshot(
        self,
        *,
        room: Room,
        snapshot,
        submitted_at: datetime | None = None,
        commit: bool = True,
    ) -> BotSubmissionBatch:
        normalized_submitted_at = submitted_at or datetime.now(UTC)
        phase_state = PhaseSubmissionState.from_snapshot(snapshot)
        if snapshot.phase == GamePhase.SETTLEMENT:
            return BotSubmissionBatch(
                snapshot=snapshot,
                generated_inputs=[],
                phase_state=phase_state,
                submitted_at=normalized_submitted_at,
            )
        for payload in self.recovery_repository.turn_inputs.list_for_phase(
            snapshot.game_id,
            snapshot.round_no,
            snapshot.phase,
        ):
            phase_state = phase_state.with_submission(PlayerTurnInput.from_payload(payload))

        players_workspace = snapshot.phase_workspace.get("players", {}) if isinstance(snapshot.phase_workspace, dict) else {}
        generated_inputs: list[PlayerTurnInput] = []
        for member in room.members:
            if member.member_type != "bot":
                continue
            if phase_state.has_submitted(member.player_id):
                continue
            player_workspace = players_workspace.get(member.player_id)
            if not isinstance(player_workspace, dict):
                continue

            turn_input = PlayerTurnInput(
                game_id=snapshot.game_id,
                round_no=snapshot.round_no,
                phase=snapshot.phase,
                player_id=member.player_id,
                submission_status=PlayerSubmissionStatus.SUBMITTED,
                payload=plan_bot_payload(
                    BotPlanningContext(
                        room=room,
                        room_member=member,
                        snapshot=snapshot,
                        player_workspace=player_workspace,
                    )
                ),
                submitted_at=normalized_submitted_at,
                is_timeout_generated=False,
            )
            self.recovery_repository.turn_inputs.save(turn_input.to_payload(), commit=False)
            phase_state = phase_state.with_submission(turn_input)
            generated_inputs.append(turn_input)

        if commit:
            self.recovery_repository.turn_inputs.connection.commit()
        return BotSubmissionBatch(
            snapshot=snapshot,
            generated_inputs=generated_inputs,
            phase_state=phase_state,
            submitted_at=normalized_submitted_at,
        )


def auto_submit_bot_turns(
    *,
    room: Room,
    snapshot,
    recovery_repository: RecoveryRepository,
    submitted_at: datetime | None = None,
    commit: bool = True,
) -> BotSubmissionBatch:
    return BotTurnOrchestrator(recovery_repository).auto_submit_for_snapshot(
        room=room,
        snapshot=snapshot,
        submitted_at=submitted_at,
        commit=commit,
    )
