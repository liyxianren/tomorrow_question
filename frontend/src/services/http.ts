import type { ApiFailure, ApiResponse, ApiSuccess } from "../types";


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:5000" : "");
const BACKEND_UNAVAILABLE_COOLDOWN_MS = 3_000;

export const SESSION_STORAGE_KEY = "tomorrow-question.session-id";

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: HeadersInit;
  sessionId?: string | null;
};

const inFlightRequests = new Map<string, Promise<unknown>>();
let backendUnavailableUntil = 0;
let backendAvailabilityGate: {
  promise: Promise<{ ok: true } | { ok: false; error: ApiRequestError }>;
  resolve: (value: { ok: true } | { ok: false; error: ApiRequestError }) => void;
} | null = null;

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

  const availabilityGate = backendAvailabilityGate;
  const isAvailabilityLeader = availabilityGate === null;
  if (isAvailabilityLeader) {
    backendAvailabilityGate = createBackendAvailabilityGate();
  } else if (availabilityGate) {
    const availability = await availabilityGate.promise;
    if (!availability.ok) {
      throw availability.error;
    }
  }

  const requestPromise = runApiRequest<T>(path, {
    method,
    body,
    headers,
    sessionId,
    signalBackendAvailability: isAvailabilityLeader,
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
    signalBackendAvailability = false,
  }: RequestOptions & {
    signalBackendAvailability?: boolean;
  } = {},
): Promise<T> {
  const requestHeaders = new Headers(headers);

  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (sessionId) {
    requestHeaders.set("X-Session-Id", sessionId);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    backendUnavailableUntil = Date.now() + BACKEND_UNAVAILABLE_COOLDOWN_MS;
    const backendError = createBackendUnavailableError(error);
    if (signalBackendAvailability) {
      rejectBackendAvailabilityGate(backendError);
    }
    throw backendError;
  }

  if (signalBackendAvailability) {
    resolveBackendAvailabilityGate();
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
    "后端服务不可用，请确认本地 API 已启动。",
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

function createBackendAvailabilityGate() {
  let resolve!: (value: { ok: true } | { ok: false; error: ApiRequestError }) => void;
  const promise = new Promise<{ ok: true } | { ok: false; error: ApiRequestError }>((innerResolve) => {
    resolve = innerResolve;
  });

  return {
    promise,
    resolve,
  };
}

function resolveBackendAvailabilityGate(): void {
  backendAvailabilityGate?.resolve({ ok: true });
  backendAvailabilityGate = null;
}

function rejectBackendAvailabilityGate(error: ApiRequestError): void {
  backendAvailabilityGate?.resolve({ ok: false, error });
  backendAvailabilityGate = null;
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
