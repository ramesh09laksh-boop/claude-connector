# F10 — Landing page & app shell

**Depends on:** F04, F07 · **Blocks:** F11, F13

## Purpose

The front door for a stranger, and the frame everything signed-in sits inside.
This is the feature that decides whether the result looks like *Lanes* or like a
scaffold with the boxes ticked.

## Technical detail

### Front door

Lanes is a product other people sign up for, so `/` is a **real landing page**,
not a redirect to sign-in.

Structure:

1. **Header** — Lanes, Sign in, Get started.
2. **Hero** — what it is in one sentence a stranger understands ("Every team's
   work, in its lane"), one supporting line, one primary action.
3. **What you can do** — three or four *real* capabilities named concretely:
   "One board per team", "Invite by link — paste it in your group chat", "Drag a
   card to move it", "Owners, admins and members". Not "Powerful. Fast.
   Simple."
4. **Footer** — Lanes, the year, and only links that exist. F13 adds Privacy and
   Terms here; leave it somewhere they can be added and **add nothing on spec**.

**Never fabricate credibility.** No testimonials, customer quotes, company
logos, star ratings, user counts, "trusted by 200 teams", or press mentions. The
app has no users and everyone reading knows it. If a section would need social
proof to work, leave the section out. Same rule for screenshots: the actual UI
or nothing — no stock mockups.

**Page titles are not set here.** F14 owns everything in `<head>` because it runs
last and is the only step that sees every public page. Leave
`src/app/layout.tsx`'s metadata alone.

### Styling

One direction, set in **one place** — the CSS variables shadcn wrote into
`src/app/globals.css` — never scattered through components.

Lanes is a work tool used all day: **cool slate neutrals, a single saturated
accent as `--primary`, `--radius: 0.5rem`.** Calm, legible, slightly technical,
dense enough to show a full board without scrolling. Both `:root` and `.dark`
blocks get the treatment; an accent legible on white and invisible on near-black
is a bug users will hit.

Give the app real spacing. Cramped edge-to-edge content is the clearest tell of
a scaffold.

### Dashboard shell

`src/app/(dashboard)/layout.tsx` — the sign-in check is written **once**, here:

```tsx
const session = await auth.api.getSession({ headers: await headers() });
if (!session) redirect("/sign-in");
```

**Check the session on the server.** Middleware is fine as an optimistic
redirect to avoid a flash of the dashboard, but it is not the security boundary
— anything reading or writing data re-checks where it runs.

The shell contains:

- Organisation switcher (F04)
- Team switcher / team list
- The user menu: name, Settings, Sign out
- Room in the navigation for **Settings**, which F11 hangs off it — a place, not
  a placeholder page
- Room above the content for the unverified-email banner F11 adds

### Routes

| Route | Who |
| --- | --- |
| `/` | public — landing |
| `/sign-in`, `/sign-up` | public |
| `/invite/[token]` | public (F05) |
| `/onboarding` | signed in, no organisation yet |
| `/dashboard` | signed in — redirects to the active team's board, or `/onboarding` |
| `/teams/[teamId]` | the board (F07) |
| `/teams/[teamId]/members` | Owner/Admin |
| `/settings/*` | signed in (F11) |

`/dashboard` is a router, not a page: active organisation → active team → board.
Nobody should land on a page that only says "Welcome back".

## Gotchas

- Do not reflexively build a pricing table. There are no payments.
- Every footer link must resolve. A link to a Privacy page that does not exist
  yet is worse than no footer link.
- The board route must stay dynamic. A `○` in the build's route table means a
  team's board was prerendered and is being served to everyone.
- Check both light and dark, and one narrow viewport, before calling it done.

## Acceptance criteria

- [ ] Signed out, `/` renders the landing page and every visible string is about
      Lanes.
- [ ] No invented testimonials, logos, ratings, user counts or press anywhere.
- [ ] Every footer link resolves; there is no link to a page that doesn't exist.
- [ ] Signed out, `/dashboard` and `/teams/<id>` redirect to `/sign-in` (`307`).
- [ ] Signing in lands on the active team's board — not a generic welcome page.
- [ ] A signed-in user with no organisation lands on `/onboarding`.
- [ ] Signing out returns to the signed-out state and `/dashboard` is protected
      again.
- [ ] The organisation and team switchers both work and their choice survives a
      reload.
- [ ] The navigation has a visible route to Settings.
- [ ] The app is legible in both light and dark mode.
- [ ] The app is usable at a phone-width viewport — nothing overlapping,
      illegible or cut off.
- [ ] Colour is set only via `globals.css` variables: `grep -rn "#[0-9a-fA-F]\{6\}" src/components` finds nothing outside the intentional exceptions.
- [ ] `npm run build`: `/` is static or dynamic as appropriate, and every
      team-scoped route is `ƒ`.
