import type { Handle } from "@sveltejs/kit";

const corsPaths = [
  "/sync/",
  "/employee-excel",
  "/download",
  "/windows-download",
];

const defaultAllowedOrigins = [
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "http://localhost:5173",
];

function isCorsPath(pathname: string): boolean {
  const appBase = process.env.APP_BASE_PATH ?? "/besmir";
  const normalizedPathname = pathname.startsWith(`${appBase}/`)
    ? pathname.slice(appBase.length)
    : pathname;
  return corsPaths.some(
    (path) =>
      normalizedPathname === path || normalizedPathname.startsWith(path),
  );
}

function allowedOrigins(): Set<string> {
  const configured =
    process.env.BESMIR_ALLOWED_APP_ORIGINS?.split(",") ?? defaultAllowedOrigins;
  return new Set(configured.map((origin) => origin.trim()).filter(Boolean));
}

function corsOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (origin.startsWith("tauri://")) return origin;
  return allowedOrigins().has(origin) ? origin : null;
}

function applyCorsHeaders(headers: Headers, origin: string): void {
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "origin");
  headers.set("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
  headers.set("access-control-allow-headers", "authorization,content-type");
  headers.set("access-control-max-age", "86400");
}

export const handle: Handle = async ({ event, resolve }) => {
  const origin = corsOrigin(event.request.headers.get("origin"));
  const shouldApplyCors = origin && isCorsPath(event.url.pathname);

  if (shouldApplyCors && event.request.method === "OPTIONS") {
    const headers = new Headers();
    applyCorsHeaders(headers, origin);
    return new Response(null, { status: 204, headers });
  }

  const response = await resolve(event);
  if (shouldApplyCors) {
    applyCorsHeaders(response.headers, origin);
  }

  return response;
};
