from __future__ import annotations

from datetime import datetime, timedelta
from typing import Callable

from .models import GameSnapshot


_DeadlineChangeListener = Callable[[], None]
_deadline_change_listeners: list[_DeadlineChangeListener] = []


def register_phase_deadline_change_listener(listener: _DeadlineChangeListener) -> None:
    _deadline_change_listeners.append(listener)


def unregister_phase_deadline_change_listener(listener: _DeadlineChangeListener) -> None:
    try:
        _deadline_change_listeners.remove(listener)
    except ValueError:
        pass


def _notify_phase_deadline_change_listeners() -> None:
    for listener in list(_deadline_change_listeners):
        try:
            listener()
        except Exception:
            pass


def calculate_phase_deadline(*, started_at: datetime, duration: timedelta) -> datetime:
    return started_at + duration


def assign_phase_deadline(snapshot: GameSnapshot, *, started_at: datetime, duration: timedelta) -> datetime:
    deadline = calculate_phase_deadline(started_at=started_at, duration=duration)
    snapshot.phase_deadline_at = deadline
    _notify_phase_deadline_change_listeners()
    return deadline


def deadline_has_passed(*, deadline_at: datetime | None, now: datetime) -> bool:
    return deadline_at is not None and now > deadline_at


def remaining_seconds_until_deadline(*, deadline_at: datetime, now: datetime) -> int:
    remaining_seconds = int((deadline_at - now).total_seconds())
    return max(0, remaining_seconds)

