from enum import Enum


class StrEnum(str, Enum):
    def __str__(self) -> str:
        return self.value


class CountryCode(StrEnum):
    BRITAIN = "britain"
    FRANCE = "france"
    PRUSSIA = "prussia"
    AUSTRIA = "austria"
    RUSSIA = "russia"


class RoomStatus(StrEnum):
    WAITING = "waiting"
    READYING = "readying"
    IN_GAME = "in_game"
    FINISHED = "finished"


class GamePhase(StrEnum):
    DECISION = "decision"
    MARKET = "market"
    SETTLEMENT = "settlement"


class PlayerSubmissionStatus(StrEnum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    TIMEOUT_AUTO_SUBMITTED = "timeout_auto_submitted"


class ConnectionStatus(StrEnum):
    ONLINE = "online"
    OFFLINE_RECOVERABLE = "offline_recoverable"


class RegionAccessLevel(StrEnum):
    CLOSED = "closed"
    OPEN = "open"
    CONCESSION = "concession"
    COLONY = "colony"


class ErrorCode(StrEnum):
    INVALID_SUBMISSION = "INVALID_SUBMISSION"
    INVALID_SESSION = "INVALID_SESSION"
    ROOM_NOT_FOUND = "ROOM_NOT_FOUND"
    ROOM_FULL = "ROOM_FULL"
    ROOM_ALREADY_IN_GAME = "ROOM_ALREADY_IN_GAME"
    ROOM_ACTION_FORBIDDEN = "ROOM_ACTION_FORBIDDEN"
    COUNTRY_TAKEN = "COUNTRY_TAKEN"
    NOT_ROOM_MEMBER = "NOT_ROOM_MEMBER"
    NOT_READYABLE = "NOT_READYABLE"
    GAME_NOT_FOUND = "GAME_NOT_FOUND"
    PHASE_MISMATCH = "PHASE_MISMATCH"
    DEADLINE_PASSED = "DEADLINE_PASSED"
    ALREADY_SUBMITTED = "ALREADY_SUBMITTED"
    RECOVERY_NOT_AVAILABLE = "RECOVERY_NOT_AVAILABLE"


class SocketEventName(StrEnum):
    ROOM_UPDATED = "room.updated"
    GAME_STARTED = "game.started"
    GAME_PHASE_STARTED = "game.phase_started"
    GAME_PHASE_TIMER = "game.phase_timer"
    GAME_PHASE_SETTLED = "game.phase_settled"
    GAME_FINISHED = "game.finished"
    GAME_SNAPSHOT_SYNC = "game.snapshot_sync"
