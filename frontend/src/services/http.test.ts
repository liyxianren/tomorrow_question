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

  it("does not block different endpoints behind a slow in-flight request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/api/v1/sessions/restore")) {
        return new Promise(() => {});
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, data: { roomCode: "ROOM01" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { apiRequest } = await loadHttpModule();
    void apiRequest("/api/v1/sessions/restore", {
      method: "POST",
      sessionId: null,
    }).catch(() => {});
    const waitingRooms = await apiRequest("/api/v1/lobby/waiting-rooms", {
      sessionId: null,
    });

    expect(waitingRooms).toEqual({ roomCode: "ROOM01" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("times out a hung request without rejecting unrelated successful requests", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => (
      _url.endsWith("/api/v1/lobby/waiting-rooms")
        ? new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          })
        : Promise.resolve(
            new Response(JSON.stringify({ ok: true, data: { roomCode: "ROOM01" } }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          )
    ));
    vi.stubGlobal("fetch", fetchMock);

    const { apiRequest } = await loadHttpModule();
    const first = apiRequest("/api/v1/lobby/waiting-rooms", { sessionId: null }).catch((error) => error);
    const second = await apiRequest("/api/v1/rooms", {
      method: "POST",
      body: { nickname: "tester" },
      sessionId: null,
    });

    await vi.advanceTimersByTimeAsync(30_000);

    expect(await first).toMatchObject({
      code: "BACKEND_UNAVAILABLE",
      status: 0,
    });
    expect(second).toEqual({ roomCode: "ROOM01" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
