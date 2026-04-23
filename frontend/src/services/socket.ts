import { io, Socket, type ManagerOptions, type SocketOptions } from "socket.io-client";

import { getSessionId } from "./http";
import { SOCKET_EVENT_NAMES } from "../types";


const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:5000" : "");

let socketInstance: Socket | null = null;


export function resolveSocketConnectionOptions(socketUrl: string): Partial<ManagerOptions & SocketOptions> {
  const baseOptions: Partial<ManagerOptions & SocketOptions> = {
    autoConnect: false,
  };

  try {
    const hostname = new URL(socketUrl).hostname.toLowerCase();
    if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1") {
      return {
        ...baseOptions,
        transports: ["polling"],
        upgrade: false,
      };
    }
  }
  catch {
    // Empty or relative URL → same-origin production deployment, fall through to websocket-only.
  }

  return {
    ...baseOptions,
    transports: ["websocket"],
    upgrade: false,
  };
}


export function getSocket(): Socket {
  if (socketInstance) {
    return socketInstance;
  }

  socketInstance = io(SOCKET_URL, resolveSocketConnectionOptions(SOCKET_URL));

  return socketInstance;
}


export function connectSocket(): Socket {
  const socket = getSocket();
  const sessionId = getSessionId();

  socket.auth = sessionId ? { sessionId } : {};

  if (!socket.connected) {
    socket.connect();
  }

  return socket;
}


export function disconnectSocket(): void {
  if (!socketInstance) {
    return;
  }

  socketInstance.disconnect();
}


export { SOCKET_EVENT_NAMES };
