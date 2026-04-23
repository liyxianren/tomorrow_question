import { describe, expect, it } from "vitest";

import { resolveSocketConnectionOptions } from "./socket";


describe("resolveSocketConnectionOptions", () => {
  it("forces polling-only transport for loopback socket urls", () => {
    expect(resolveSocketConnectionOptions("http://127.0.0.1:5000")).toEqual({
      autoConnect: false,
      transports: ["polling"],
      upgrade: false,
    });

    expect(resolveSocketConnectionOptions("http://localhost:5000")).toEqual({
      autoConnect: false,
      transports: ["polling"],
      upgrade: false,
    });
  });

  it("forces websocket-only transport for non-loopback hosts", () => {
    expect(resolveSocketConnectionOptions("https://api.example.com")).toEqual({
      autoConnect: false,
      transports: ["websocket"],
      upgrade: false,
    });
  });

  it("forces websocket-only transport for same-origin (empty) urls", () => {
    expect(resolveSocketConnectionOptions("")).toEqual({
      autoConnect: false,
      transports: ["websocket"],
      upgrade: false,
    });
  });
});
