import type { ApiFailure, ApiResponse, ApiSuccess } from "../types";
import i18n from "../i18n";


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:5000" : "");
const BACKEND_UNAVAILABLE_COOLDOWN_MS = 3_000;
const REQUEST_TIMEOUT_MS = 10_000;

export const SESSION_STORAGE_KEY = "tomorrow-question.session-id";

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: HeadersInit;
  sessionId?: string | null;
};

const inFlightRequests = new Map<string, Promise<unknown>>();
let backendUnavailableUntil = 0;

export class ApiRequestError extends Error {
  code?: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}


export function getSessionId(): string | null {
  return window.localStorage.getItem(SESSION_STORAGE_KEY);
}


export function setSessionId(sessionId: string): void {
  window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
}


export function clearSessionId(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}


export async function apiRequest<T>(
  path: string,
  { method = "GET", body, headers, sessionId = getSessionId() }: RequestOptions = {},
): Promise<T> {
  if (Date.now() < backendUnavailableUntil) {
    throw createBackendUnavailableError();
  }

  const requestKey = buildRequestKey(path, method, body, sessionId);
  const pendingRequest = inFlightRequests.get(requestKey) as Promise<T> | undefined;
  if (pendingRequest) {
    return pendingRequest;
  }

  const requestPromise = runApiRequest<T>(path, {
    method,
    body,
    headers,
    sessionId,
  }).finally(() => {
    inFlightRequests.delete(requestKey);
  });

  inFlightRequests.set(requestKey, requestPromise);
  return requestPromise;
}

async function runApiRequest<T>(
  path: string,
  {
    method = "GET",
    body,
    headers,
    sessionId = getSessionId(),
  }: RequestOptions = {},
): Promise<T> {
  const requestHeaders = new Headers(headers);

  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  requestHeaders.set("Accept-Language", i18n.language);

  if (sessionId) {
    requestHeaders.set("X-Session-Id", sessionId);
  }

  let response: Response;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: abortController.signal,
    });
  } catch (error) {
    backendUnavailableUntil = Date.now() + BACKEND_UNAVAILABLE_COOLDOWN_MS;
    const backendError = createBackendUnavailableError(error);
    throw backendError;
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = (await response.json()) as ApiResponse<T>;
  backendUnavailableUntil = 0;

  if (!response.ok) {
    const errorPayload = payload as ApiFailure;
    throw new ApiRequestError(
      errorPayload.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      errorPayload.error?.code,
      errorPayload.error?.details,
    );
  }

  return unwrapApiResponse(payload as ApiSuccess<T>);
}

function createBackendUnavailableError(cause?: unknown): ApiRequestError {
  const error = new ApiRequestError(
    i18n.t("common:backendUnavailable", "Unable to reach the server right now. This may be cloud startup or network delay; wait a few seconds and retry."),
    0,
    "BACKEND_UNAVAILABLE",
  );

  if (cause) {
    (error as ApiRequestError & { cause?: unknown }).cause = cause;
  }

  return error;
}

function buildRequestKey(
  path: string,
  method: string,
  body: unknown,
  sessionId: string | null,
): string {
  return JSON.stringify({
    path,
    method,
    body: body ?? null,
    sessionId: sessionId ?? null,
  });
}

export function unwrapApiResponse<T>(payload: ApiResponse<T>): T {
  if (!payload.ok) {
    throw new ApiRequestError(
      payload.error.message,
      400,
      payload.error.code,
      payload.error.details,
    );
  }

  return payload.data;
}
