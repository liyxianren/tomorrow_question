from __future__ import annotations

from datetime import datetime, timedelta

from .models import GameSnapshot


def calculate_phase_deadline(*, started_at: datetime, duration: timedelta) -> datetime:
    return started_at + duration


def assign_phase_deadline(snapshot: GameSnapshot, *, started_at: datetime, duration: timedelta) -> datetime:
    deadline = calculate_phase_deadline(started_at=started_at, duration=duration)
    snapshot.phase_deadline_at = deadline
    return deadline


def deadline_has_passed(*, deadline_at: datetime | None, now: datetime) -> bool:
    return deadline_at is not None and now > deadline_at


def remaining_seconds_until_deadline(*, deadline_at: datetime, now: datetime) -> int:
    remaining_seconds = int((deadline_at - now).total_seconds())
    return max(0, remaining_seconds)

