const configured = import.meta.env.VITE_API_URL?.trim();

/** Backend origin. Empty string keeps same-origin fetches for local gateway serving. */
export const API_URL = configured ? configured.replace(/\/$/, "") : "";

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`apiUrl path must start with "/": ${path}`);
  }
  return `${API_URL}${path}`;
}
