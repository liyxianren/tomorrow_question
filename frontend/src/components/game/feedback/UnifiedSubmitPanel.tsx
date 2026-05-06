import { useEffect, useMemo, useState } from "react";

import type { SubmitPhaseResponse } from "../../../services/game";
import { submitPhase } from "../../../services/game";
import { ApiRequestError } from "../../../services/http";
import {
  extractDetailReason,
  extractRejectedActions,
  translateSubmitErrorMessage,
  type SubmitErrorRejection,
} from "../../../features/game/forms";
import type { GamePhase, PlayerSubmissionStatus } from "../../../types";


type UnifiedSubmitPanelProps = {
  gameId: string;
  phase: GamePhase;
  roundNo: number;
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
  detailReason: string | null;
  rejectedActions: SubmitErrorRejection[];
};

type LocalStatusState = {
  phase: GamePhase;
  roundNo: number;
  statusByPlayerId: Record<string, PlayerSubmissionStatus>;
};

function formatSubmitError(error: unknown): SubmitErrorState {
  if (error instanceof ApiRequestError) {
    const code = error.code ?? null;
    const message = translateSubmitErrorMessage(code, error.message);
    return {
      code,
      message,
      detailReason: extractDetailReason(error.details),
      rejectedActions: extractRejectedActions(error.details),
    };
  }

  return {
    code: null,
    message: error instanceof Error ? error.message : "提交失败。",
    detailReason: null,
    rejectedActions: [],
  };
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
  roundNo,
  playerId,
  draftPayload,
  canSubmit,
  submissionStatus,
  submissionStatusByPlayerId,
  onSubmitted,
}: UnifiedSubmitPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitErrorState | null>(null);
  const [localStatus, setLocalStatus] = useState<LocalStatusState | null>(null);

  useEffect(() => {
    setIsSubmitting(false);
    setSubmitError(null);
    setLocalStatus(null);
  }, [gameId, phase, roundNo, playerId]);

  const effectiveStatusByPlayerId = useMemo(() => {
    if (
      localStatus &&
      localStatus.phase === phase &&
      localStatus.roundNo === roundNo &&
      Object.keys(localStatus.statusByPlayerId).length > 0
    ) {
      return localStatus.statusByPlayerId;
    }
    return submissionStatusByPlayerId ?? {};
  }, [localStatus, phase, roundNo, submissionStatusByPlayerId]);

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
      setLocalStatus({
        phase: response.phase,
        roundNo: response.roundNo,
        statusByPlayerId: response.submissionStatus,
      });
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
        <div className="gp-submit__status gp-submit__status--error" data-testid="submit-error">
          <p style={{ margin: 0 }}>{submitError.message}</p>
          {submitError.detailReason ? (
            <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.85 }}>{submitError.detailReason}</p>
          ) : null}
          {submitError.rejectedActions.length > 0 ? (
            <div style={{ marginTop: 6, fontSize: 13 }}>
              <span>以下操作被拒绝：</span>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {submitError.rejectedActions.map((rejection, index) => (
                  <li key={`${rejection.actionId ?? "rejected"}-${index}`}>
                    {rejection.actionId ? `${rejection.actionId} · ` : ""}
                    {rejection.reason}
                    {rejection.count != null && rejection.maxPerRound != null
                      ? `（${rejection.count}/${rejection.maxPerRound}）`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
