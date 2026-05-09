import { afterEach, describe, expect, it, vi } from "vitest";

async function loadHttpModule() {
  vi.resetModules();
  return import("./http");
}

describe("http service", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("dedupes identical in-flight requests when the backend port is unreachable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const { apiRequest } = await loadHttpModule();
    const first = apiRequest("/api/v1/sessions/restore", {
      method: "POST",
      sessionId: null,
    });
    const second = apiRequest("/api/v1/sessions/restore", {
      method: "POST",
      sessionId: null,
    });
    const [firstResult, secondResult] = await Promise.allSettled([first, second]);

    expect(firstResult).toMatchObject({
      status: "rejected",
      reason: {
        code: "BACKEND_UNAVAILABLE",
        status: 0,
      },
    });
    expect(secondResult).toMatchObject({
      status: "rejected",
      reason: {
        code: "BACKEND_UNAVAILABLE",
        status: 0,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("short-circuits follow-up requests for a brief cooldown after a connection refusal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T17:05:00.000Z"));
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const { apiRequest } = await loadHttpModule();

    await expect(
      apiRequest("/api/v1/lobby/waiting-rooms", {
        sessionId: null,
      }),
    ).rejects.toMatchObject({
      code: "BACKEND_UNAVAILABLE",
      status: 0,
    });

    await expect(
      apiRequest("/api/v1/rooms", {
        method: "POST",
        body: { nickname: "tester" },
        sessionId: null,
      }),
    ).rejects.toMatchObject({
      code: "BACKEND_UNAVAILABLE",
      status: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the first in-flight backend availability check across different endpoints", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const { apiRequest } = await loadHttpModule();
    const requests = await Promise.allSettled([
      apiRequest("/api/v1/sessions/restore", {
        method: "POST",
        sessionId: null,
      }),
      apiRequest("/api/v1/lobby/waiting-rooms", {
        sessionId: null,
      }),
      apiRequest("/api/v1/rooms", {
        method: "POST",
        body: { nickname: "tester" },
        sessionId: null,
      }),
    ]);

    expect(requests).toEqual([
      expect.objectContaining({
        status: "rejected",
        reason: expect.objectContaining({
          code: "BACKEND_UNAVAILABLE",
          status: 0,
        }),
      }),
      expect.objectContaining({
        status: "rejected",
        reason: expect.objectContaining({
          code: "BACKEND_UNAVAILABLE",
          status: 0,
        }),
      }),
      expect.objectContaining({
        status: "rejected",
        reason: expect.objectContaining({
          code: "BACKEND_UNAVAILABLE",
          status: 0,
        }),
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out a hung availability leader and releases queued requests", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => (
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })
    ));
    vi.stubGlobal("fetch", fetchMock);

    const { apiRequest } = await loadHttpModule();
    const first = apiRequest("/api/v1/lobby/waiting-rooms", { sessionId: null });
    const second = apiRequest("/api/v1/rooms", {
      method: "POST",
      body: { nickname: "tester" },
      sessionId: null,
    });
    const settledRequests = Promise.allSettled([first, second]);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(await settledRequests).toEqual([
      expect.objectContaining({
        status: "rejected",
        reason: expect.objectContaining({
          code: "BACKEND_UNAVAILABLE",
          status: 0,
        }),
      }),
      expect.objectContaining({
        status: "rejected",
        reason: expect.objectContaining({
          code: "BACKEND_UNAVAILABLE",
          status: 0,
        }),
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
