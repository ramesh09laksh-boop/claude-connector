/**
 * The one list of pages a stranger may see.
 *
 * The sitemap, llms.txt and the footer all need to know this, and three
 * separately maintained lists drift within a week.
 */

const LOCAL_URL = "http://localhost:3000";

/**
 * Two variables, one value, resolved in one place. `BETTER_AUTH_URL` already
 * means "where this app lives", so an app that sets it gets a correct sitemap
 * without a second setting to keep in step. They must never disagree.
 *
 * Server code only: this is not a NEXT_PUBLIC_ variable, so in a client
 * component it is `undefined` and the first symptom is a canonical tag
 * pointing at localhost.
 *
 * The value is normalised rather than trusted. A host typed without a scheme
 * ("lanes.example.com") is the ordinary way people fill these in, and Vercel's
 * own `VERCEL_URL` is scheme-less by definition — but `new URL()` throws on it,
 * and `metadataBase` calls `new URL()` at module scope, so one missing `https:`
 * failed the entire production build with the offending value redacted out of
 * the error. Normalise here, once, and every caller gets an absolute URL.
 */
function resolveSiteUrl(): { url: string; configured: boolean } {
  const raw =
    process.env.APP_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    // Vercel sets both without a scheme. The production domain is preferred
    // because VERCEL_URL is a per-deployment address that changes every push,
    // which is not something to write into a sitemap or a canonical tag.
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (!raw) return { url: LOCAL_URL, configured: false };

  const withScheme = /^https?:\/\//i.test(raw)
    ? raw
    : `${/^localhost\b|^127\.0\.0\.1\b/.test(raw) ? "http" : "https"}://${raw}`;

  try {
    // `href` normalises (adds the root path, lowercases the host); stripping the
    // trailing slash keeps `${siteUrl}/invite/…` from doubling it.
    return { url: new URL(withScheme).href.replace(/\/$/, ""), configured: true };
  } catch {
    // Falling back beats throwing: a bad value should not be able to fail a
    // build. The system page reports this as unconfigured, so it stays visible.
    console.warn(
      "[site] APP_URL is not a usable URL; falling back to localhost. " +
        "Set it to a full address, e.g. https://lanes.example.com",
    );
    return { url: LOCAL_URL, configured: false };
  }
}

const resolved = resolveSiteUrl();

export const siteUrl = resolved.url;

/**
 * False when nothing usable was configured and `siteUrl` fell back to
 * localhost — including when a value *was* set but could not be parsed.
 */
export const siteUrlConfigured = resolved.configured;

export const site = {
  name: "Lanes",
  tagline: "Every team's work, in its lane.",
  description:
    "One Kanban board per team — invite by link, drag to move, and everyone stays current.",
};

export type PublicPage = {
  path: string;
  title: string;
  summary: string;
};

/**
 * `/invite/[token]` and `/sign-in` are deliberately absent: invite pages are
 * noindex, and a sign-in page is not something to invite a stranger to.
 */
export const publicPages: PublicPage[] = [
  { path: "/", title: "Lanes", summary: site.description },
  {
    path: "/sign-up",
    title: "Sign up",
    summary: "Create a Lanes account and start a board for your team.",
  },
  {
    path: "/privacy",
    title: "Privacy",
    summary: "What Lanes stores and who can see it.",
  },
  { path: "/terms", title: "Terms", summary: "The terms of using Lanes." },
];
