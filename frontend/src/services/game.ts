import { apiRequest } from "./http";
import type { FinalResultResponse, GamePhase, PlayerTurnInput, PlayerSubmissionStatus } from "../types";


export interface SubmitPhaseResponse {
  submission: PlayerTurnInput;
  submissionStatus: Record<string, PlayerSubmissionStatus>;
  phase: GamePhase;
  roundNo: number;
  allSubmitted: boolean;
  settlementTriggered: boolean;
}

export async function submitPhase(
  gameId: string,
  phase: GamePhase,
  payload: object,
): Promise<SubmitPhaseResponse> {
  return apiRequest<SubmitPhaseResponse>(`/api/v1/games/${gameId}/phases/${phase}/submit`, {
    method: "POST",
    body: {
      payload,
    },
  });
}

export async function fetchFinalResult(gameId: string): Promise<FinalResultResponse> {
  return apiRequest<FinalResultResponse>(`/api/v1/games/${gameId}/final-result`);
}
