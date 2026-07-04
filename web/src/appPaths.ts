declare global {
  interface Window {
    __TRIMBLE_ROOT_PATH__?: string;
  }
}

function normalizeBasePath(p: string | undefined): string {
  if (!p || p === "/") return "";
  let s = p.trim();
  if (!s.startsWith("/")) s = `/${s}`;
  return s.replace(/\/$/, "");
}

let runtimeBase = normalizeBasePath(
  typeof window !== "undefined" ? window.__TRIMBLE_ROOT_PATH__ : undefined,
);

/** Update the app base path (e.g. from /api/config). */
export function setAppBasePath(p: string): void {
  runtimeBase = normalizeBasePath(p);
}

/** Public URL prefix without trailing slash, or "" at site root. */
export function appBasePath(): string {
  return runtimeBase;
}

/** Prefix an app-relative path with the configured root path. */
export function appPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return runtimeBase ? `${runtimeBase}${p}` : p;
}

export function wsStreamUrl(groupId: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${appPath("/api/stream")}?group=${encodeURIComponent(groupId)}`;
}
