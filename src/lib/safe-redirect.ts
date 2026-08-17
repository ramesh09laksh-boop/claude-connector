/**
 * Only ever redirect to a path on this app.
 *
 * The invite flow carries "come back here after signing in" through a query
 * parameter, and a query parameter is attacker-controlled. Without this check
 * `/sign-in?redirect=https://evil.example` turns the sign-in page into an open
 * redirect. Protocol-relative URLs (`//evil.example`) and backslash variants
 * are the two forms that slip past a naive `startsWith("/")`.
 */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function safeRedirect(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!value) return fallback;
  const path = value.trim();
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//")) return fallback;
  if (path.includes("\\")) return fallback;
  // A control character can be used to smuggle a header or confuse a parser.
  if (hasControlChar(path)) return fallback;
  return path;
}
