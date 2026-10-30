function parseUrl(
  value: string | null | undefined,
  origin: string,
): URL | null {
  if (!value) return null;
  try {
    return new URL(value, origin);
  } catch {
    return null;
  }
}

export function safeSameOriginPath(
  value: string | null | undefined,
  origin = window.location.origin,
): string | null {
  const url = parseUrl(value, origin);
  if (!url || url.origin !== origin) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function safeAuthNavigation(
  value: string | null | undefined,
  origin = window.location.origin,
): string | null {
  const url = parseUrl(value, origin);
  if (!url) return null;
  if (url.origin === origin) {
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return url.protocol === "https:" ? url.toString() : null;
}

export function safeHttpsUrl(
  value: string | null | undefined,
  origin = window.location.origin,
): string | null {
  const url = parseUrl(value, origin);
  return url?.protocol === "https:" ? url.toString() : null;
}
