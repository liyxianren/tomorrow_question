import type { BrowserContext, Request, Route } from "@playwright/test";

import { getApiBaseUrl, getAppBaseUrl } from "./types";


function buildCorsHeaders(request: Request): Record<string, string> {
  const requestHeaders = request.headers();

  return {
    "access-control-allow-origin": getAppBaseUrl(),
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": requestHeaders["access-control-request-headers"] ?? "content-type,x-session-id",
    "access-control-allow-credentials": "false",
  };
}

async function fulfillPreflight(route: Route, request: Request): Promise<void> {
  await route.fulfill({
    status: 204,
    headers: buildCorsHeaders(request),
  });
}

async function fulfillProxiedRequest(route: Route, request: Request): Promise<void> {
  const upstreamHeaders = new Headers();

  for (const [key, value] of Object.entries(request.headers())) {
    if (value === undefined || key === "origin" || key === "referer" || key === "host") {
      continue;
    }

    upstreamHeaders.set(key, value);
  }

  const upstreamResponse = await fetch(request.url(), {
    method: request.method(),
    headers: upstreamHeaders,
    body: request.postData() ?? undefined,
  });
  const responseHeaders = Object.fromEntries(upstreamResponse.headers.entries());
  const body = Buffer.from(await upstreamResponse.arrayBuffer());

  await route.fulfill({
    status: upstreamResponse.status,
    headers: {
      ...responseHeaders,
      ...buildCorsHeaders(request),
    },
    body,
  });
}

export async function installApiProxy(context: BrowserContext): Promise<void> {
  await context.route(`${getApiBaseUrl()}/**`, async (route, request) => {
    if (request.method() === "OPTIONS") {
      await fulfillPreflight(route, request);
      return;
    }

    await fulfillProxiedRequest(route, request);
  });
}
