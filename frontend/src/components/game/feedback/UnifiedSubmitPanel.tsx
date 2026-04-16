import { useEffect, useMemo, useState } from "react";

import type { SubmitPhaseResponse } from "../../../services/game";
import { submitPhase } from "../../../services/game";
import { ApiRequestError } from "../../../services/http";
import type { ApiErrorCode, GamePhase, PlayerSubmissionStatus } from "../../../types";


type UnifiedSubmitPanelProps = {
  gameId: string;
  phase: GamePhase;
  playerId: string;
  draftPayload: object;
  canSubmit: boolean;
  submissionStatus: PlayerSubmissionStatus;
  submissionStatusByPlayerId?: Record<string, PlayerSubmissionStatus>;
  onSubmitted?: (response: SubmitPhaseResponse) => void;
};

type SubmitErrorState = {
  code: string | null;
  message: string;
};

function formatSubmitError(error: unknown): SubmitErrorState {
  if (error instanceof ApiRequestError) {
    const code = (error.code ?? null) as ApiErrorCode | null;

    switch (code) {
      case "ALREADY_SUBMITTED":
        return { code, message: "你已提交过本阶段，等待结算即可。" };
      case "DEADLINE_PASSED":
        return { code, message: "提交截止时间已过。" };
      case "PHASE_MISMATCH":
        return { code, message: "当前阶段已切换，请刷新页面。" };
      case "GAME_NOT_FOUND":
        return { code, message: "对局不存在或已结束。" };
      default:
        return { code, message: error.message || "提交失败，请稍后再试。" };
    }
  }

  return { code: null, message: error instanceof Error ? error.message : "提交失败。" };
}

function resolveButtonLabel({
  canSubmit,
  currentStatus,
  isSubmitting,
}: {
  canSubmit: boolean;
  currentStatus: PlayerSubmissionStatus;
  isSubmitting: boolean;
}): string {
  if (isSubmitting) return "提交中...";
  if (currentStatus === "timeout_auto_submitted") return "系统已代为确认";
  if (currentStatus === "submitted") return "已提交";
  return canSubmit ? "确认提交" : "当前不可提交";
}

export function UnifiedSubmitPanel({
  gameId,
  phase,
  playerId,
  draftPayload,
  canSubmit,
  submissionStatus,
  submissionStatusByPlayerId,
  onSubmitted,
}: UnifiedSubmitPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitErrorState | null>(null);
  const [localStatusByPlayerId, setLocalStatusByPlayerId] = useState<
    Record<string, PlayerSubmissionStatus> | null
  >(null);

  useEffect(() => {
    setIsSubmitting(false);
    setSubmitError(null);
    setLocalStatusByPlayerId(null);
  }, [gameId, phase, playerId]);

  const effectiveStatusByPlayerId = useMemo(() => {
    if (localStatusByPlayerId && Object.keys(localStatusByPlayerId).length > 0) {
      return localStatusByPlayerId;
    }
    return submissionStatusByPlayerId ?? {};
  }, [localStatusByPlayerId, submissionStatusByPlayerId]);

  const currentStatus = effectiveStatusByPlayerId[playerId] ?? submissionStatus;
  const hasSubmitted = currentStatus === "submitted" || currentStatus === "timeout_auto_submitted";
  const pendingOtherPlayers = Object.entries(effectiveStatusByPlayerId).filter(
    ([id, status]) => id !== playerId && status === "pending",
  ).length;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit || hasSubmitted || isSubmitting) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const response = await submitPhase(gameId, phase, draftPayload);
      setLocalStatusByPlayerId(response.submissionStatus);
      onSubmitted?.(response);
    } catch (error) {
      setSubmitError(formatSubmitError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="gp-submit">
      <button
        className="gp-submit__button"
        data-testid="game-submit-button"
        disabled={isSubmitting || hasSubmitted || !canSubmit}
        onClick={() => { void handleSubmit(); }}
        type="button"
      >
        {resolveButtonLabel({ canSubmit, currentStatus, isSubmitting })}
      </button>

      {hasSubmitted ? (
        <p className="gp-submit__status gp-submit__status--done">
          {currentStatus === "timeout_auto_submitted"
            ? "系统已代为确认。"
            : pendingOtherPlayers > 0
              ? `等待其他 ${pendingOtherPlayers} 名玩家...`
              : "全部玩家已提交，等待结算。"}
        </p>
      ) : null}

      {submitError ? (
        <p className="gp-submit__status gp-submit__status--error">{submitError.message}</p>
      ) : null}
    </section>
  );
}
