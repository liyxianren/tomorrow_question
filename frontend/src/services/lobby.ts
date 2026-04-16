import type { WaitingRoomSummaryResponse } from "../types";

import { apiRequest } from "./http";


export async function fetchWaitingRooms(): Promise<WaitingRoomSummaryResponse[]> {
  return apiRequest<WaitingRoomSummaryResponse[]>("/api/v1/lobby/waiting-rooms");
}
