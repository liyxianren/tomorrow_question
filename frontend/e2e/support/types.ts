import type { Browser, BrowserContext, Page } from "@playwright/test";


export type CountryCode = "britain" | "france" | "prussia" | "austria" | "russia";

export type BrowserPlayerPage = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

export type BackgroundPlayerSeed = {
  nickname: string;
  country: CountryCode;
};

export type BackgroundPlayer = BackgroundPlayerSeed & {
  playerId: string;
  sessionId: string;
};

export type RoomContext = {
  roomCode: string;
};

export type PlayerSession = {
  playerId: string;
  sessionId: string;
};

export type SessionContextResponse = {
  room: RoomContext;
  session: PlayerSession;
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiFailure = {
  ok: false;
  error: {
    code?: string;
    message: string;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const SESSION_STORAGE_KEY = "tomorrow-question.session-id";

export function getAppBaseUrl(): string {
  return process.env.PLAYWRIGHT_BASE_URL ?? process.env.TQ_FRONTEND_URL ?? "http://127.0.0.1:5173";
}

export function getApiBaseUrl(): string {
  return process.env.PLAYWRIGHT_API_URL ?? process.env.TQ_BACKEND_URL ?? "http://127.0.0.1:5000";
}
