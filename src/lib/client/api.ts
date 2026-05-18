import { base } from "$app/paths";
import { env } from "$env/dynamic/public";

const importEnv = import.meta.env as ImportMetaEnv &
  Record<string, string | undefined>;
const publicEnv = env as Record<string, string | undefined>;

function readPublicEnv(key: string): string {
  return (
    publicEnv[key] ??
    importEnv[key] ??
    importEnv[`VITE_${key}`] ??
    ""
  ).trim();
}

export function isDesktopBuild(): boolean {
  return importEnv.VITE_BUILD_TARGET === "desktop";
}

export function apiBaseUrl(): string {
  const configured =
    readPublicEnv("PUBLIC_BESMIR_API_BASE_URL") ||
    readPublicEnv("BESMIR_API_BASE_URL");
  return configured.replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const configuredBase = apiBaseUrl();

  if (configuredBase) {
    return new URL(normalizedPath.replace(/^\//, ""), `${configuredBase}/`).toString();
  }

  return `${base}${normalizedPath}`;
}

export function syncApiToken(): string {
  return (
    readPublicEnv("PUBLIC_BESMIR_SYNC_API_TOKEN") ||
    readPublicEnv("BESMIR_SYNC_API_TOKEN")
  );
}
