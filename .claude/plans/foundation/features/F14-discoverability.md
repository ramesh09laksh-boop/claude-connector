# F14 — Discoverability

**Depends on:** F13 · **Blocks:** nothing

## Purpose

Lanes is a public product people sign up for, so it is meant to be found: a real
title in the browser tab, a sitemap, a `robots.txt`, an `llms.txt`, and a
preview card for when the link gets shared.

**This runs last in the build, and that is structural.** It writes the sitemap
and `llms.txt` from one list of public pages, and F13 added two of them. A
sitemap written before F13 is already wrong.

## Technical detail

> **Hard rule: never claim in metadata what the page doesn't contain.** The
> description is what the page *is*, in one sentence — not a list of words
> someone might search for. No invented feature in a title, and no
> `AggregateRating`, `Review` or `Offer` in structured data for a product with
> no customers and no price. F10 already bans fabricated credibility on the
> visible half; this is the same promise made to a machine, and inventing it is
> what gets a real domain manually penalised.

### One list — `src/lib/site.ts`

The spine of this feature. Three consumers need to know which pages a stranger
may see — the sitemap, `llms.txt` and the footer — and three separately
maintained lists drift within a week.

```ts
export const siteUrl = (
  process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export const site = {
  name: "Lanes",
  description: "One Kanban board per team — invite by link, drag to move, and everyone stays current.",
};

export const publicPages: PublicPage[] = [
  { path: "/",        title: "Lanes",   summary: site.description },
  { path: "/sign-up", title: "Sign up", summary: "Create a Lanes account and start a board for your team." },
  { path: "/privacy", title: "Privacy", summary: "What Lanes stores and who can see it." },
  { path: "/terms",   title: "Terms",   summary: "The terms of using Lanes." },
];
```

**Two variables, one value, resolved in one place.** `BETTER_AUTH_URL` already
means "where this app lives", so an app that has it set gets a correct sitemap
without a second setting to keep in step. They must never disagree.

**Only server code reads `siteUrl`.** A non-`NEXT_PUBLIC_` variable read in a
client component is `undefined` there, and the first symptom is a canonical tag
pointing at localhost.

**`/invite/[token]` and `/sign-in` are deliberately absent.** Invite pages are
`noindex` (F05) and a sign-in page is not something to invite a stranger to.

### The title — `src/app/layout.tsx`

```ts
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: site.name, template: `%s · Lanes` },
  description: site.description,
  openGraph: { /* … */ },
  twitter: { card: "summary_large_image" },
};
```

`create-next-app` writes `title: "Create Next App"` and it survives an
astonishing number of otherwise finished projects. It is what the browser tab
says, what a bookmark is named, and what gets pasted into a chat when the user
shows somebody. **F10 deliberately left it alone so there is exactly one owner
— this one.**

`metadataBase` turns every relative image and canonical path absolute; without
it Next warns at build and falls back to localhost. The `template` means each
page sets only its own half: `export const metadata = { title: "Members" }`
renders as `Members · Lanes`.

### `src/app/sitemap.ts`

Maps `publicPages` to absolute URLs. **Nothing behind sign-in goes in a
sitemap** — not `/dashboard`, not `/teams/…`, not `/settings`, not an API path.
A sitemap is a list of pages you are inviting a stranger to open, and every
entry that redirects to sign-in is an error in Search Console the user has to
learn to ignore.

Leave out `priority` and `changeFrequency`; Google ignores both.

### `src/app/robots.ts`

```ts
rules: [{ userAgent: "*", allow: "/",
          disallow: ["/api/", "/dashboard", "/teams", "/settings", "/invite"] }],
sitemap: `${siteUrl}/sitemap.xml`,
```

**AI crawlers are a separate, deliberate decision.** Lanes' content is not the
product — these are marketing pages for a tool — so all three kinds are allowed:
training crawlers, search/citation crawlers (this is how an assistant recommends
the app with a link), and user-initiated fetchers (blocking those blocks a
visitor who chose to come). The current user-agent tokens come from the Phase 0
research; a stale one is not a crash, it is a rule that silently matches
nothing.

**`robots.txt` is public, so it never names a path you'd rather nobody knew.**
Everything disallowed above is already guessable and protected by auth. Crawl
policy is not a security boundary — the session check is.

### `src/app/llms.txt/route.ts`

Plain markdown generated from the **same** `publicPages` list, so it cannot fall
behind: one heading, the summary, then a line per page.

Be honest about what it is at hand-off: a proposed convention that no major AI
crawler has publicly committed to reading. It costs a dozen lines and helps
anyone pointing an assistant at the app. **What a crawler is permitted to do
lives in `robots.txt` and nowhere else** — `llms.txt` neither grants nor
withholds anything.

Skip `llms-full.txt`.

### `src/app/opengraph-image.tsx`

`ImageResponse` at 1200×630, showing Lanes' name and description on the app's
own background and accent. **Inline styles only** — the satori runtime knows
nothing about Tailwind classes or CSS variables, so read the values out of
`globals.css` and write them literally.

No stock mockup and no fabricated screenshot.

### Structured data

One `WebSite` block in the root layout — name, url, description. Add
`Organization` **only** if `legal.entity` is actually set, because the entity is
one of F13's blanks and a build that invents one is writing a legal claim into
machine-readable form. Never `AggregateRating`, `Review`, or a `FAQPage` of
questions nobody asked.

### Ops row

Add the Canonical URL check to F12's health card. An unset `APP_URL` in
production is invisible until somebody reads the sitemap and finds it full of
`localhost`.

## Acceptance criteria

- [ ] `curl -s http://localhost:3000/ | grep -o '<title>[^<]*'` returns Lanes.
      **"Create Next App" is a failure, not a note.**
- [ ] `/robots.txt`, `/sitemap.xml` and `/llms.txt` each return `200`.
- [ ] **No line of the sitemap contains `/dashboard`, `/teams`, `/settings`,
      `/invite` or `/api`.**
- [ ] Every URL in the sitemap is absolute and shares one origin — no mix of
      `http` and `https`, no bare paths.
- [ ] Every sitemap entry is a page that exists and returns `200` when fetched
      cold, with no cookie — checked against F15's route sweep.
- [ ] The other direction too: no public page is missing from the sitemap.
- [ ] Neither `public/robots.txt` nor `public/sitemap.xml` exists — a static
      file silently shadows the generated one.
- [ ] `/opengraph-image` returns `200` and renders as an image showing Lanes'
      own name — not a placeholder, not a stock mockup.
- [ ] `llms.txt` lists exactly the pages in `publicPages`.
- [ ] No structured data claims a rating, review, price, or an entity that
      `legal.entity` doesn't hold.
- [ ] Each page's description describes that page — no keyword lists, no feature
      Lanes doesn't have.
- [ ] `grep -rn "siteUrl" src/` shows it read only in server code.
- [ ] The Canonical URL row appears on the system page health card.
