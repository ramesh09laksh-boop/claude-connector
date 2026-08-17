/**
 * The one list of pages a stranger may see.
 *
 * The sitemap, llms.txt and the footer all need to know this, and three
 * separately maintained lists drift within a week.
 */

/**
 * Two variables, one value, resolved in one place. `BETTER_AUTH_URL` already
 * means "where this app lives", so an app that sets it gets a correct sitemap
 * without a second setting to keep in step. They must never disagree.
 *
 * Server code only: this is not a NEXT_PUBLIC_ variable, so in a client
 * component it is `undefined` and the first symptom is a canonical tag
 * pointing at localhost.
 */
export const siteUrl = (
  process.env.APP_URL?.trim() ||
  process.env.BETTER_AUTH_URL?.trim() ||
  "http://localhost:3000"
).replace(/\/$/, "");

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
