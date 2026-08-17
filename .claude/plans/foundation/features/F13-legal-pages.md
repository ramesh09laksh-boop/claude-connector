# F13 — Legal pages

**Depends on:** F10 · **Blocks:** F14

## Purpose

The pages Lanes owes the people who use it. This was **decided, not asked**:
Lanes is a public product strangers can sign up for, which means a privacy policy
and terms. It gets **no cookie banner**.

## What this app owes, and why

| | Verdict |
| --- | --- |
| Privacy policy | **Yes** — strangers sign up and it holds their data and their colleagues' |
| Terms | **Yes** — there is a second party to agree with |
| Cookie banner | **No** — see below |
| `/cookies` page | **No** — the two paragraphs go in a "what we store" section of the privacy page |

### Why no banner

Consent is owed for what is **not essential** to the thing the person asked for,
not for the machinery that makes it work. Lanes loads none of the things that
require one: no analytics, no session replay, no third-party embeds, no
marketing or attribution pixels, no A/B testing, no Stripe.js.

What it does set is the Better Auth session cookie — somebody asked to sign in,
and the cookie is how that request is honoured. Resend and Postgres are
sub-processors the privacy page must **name**, and neither sets anything in
anybody's browser. **Disclosure and consent are different obligations**;
confusing them is how an app ends up asking permission for its own back end.

A banner over nothing but a session cookie is a dead control — the Reject button
either lies or breaks sign-in. Not building one is the correct outcome, and the
hand-off says so in one line, along with what would change it: add analytics
later and it needs one.

## Technical detail

### Routes

`src/app/(legal)/privacy/page.tsx` and `src/app/(legal)/terms/page.tsx` — their
own route group with a plain readable layout, reachable **signed out**. Never
inside the dashboard group. Both linked from the footer F10 left room in.

### What the privacy page must disclose

Written from the branches that actually ran, in **Lanes' own nouns** —
organisations, teams, boards, columns, cards, members. A privacy policy about
"user-generated items" in an app whose every screen says "cards" reads as
boilerplate because it is.

| Because | It must say |
| --- | --- |
| Postgres (F02) | What Lanes stores — organisations, teams, boards, columns, cards, who's a member and their role — and that it lives in its own database |
| Better Auth (F03) | That an email address and a password hash are held, and a session cookie is set |
| Invite links (F05) | That anyone holding a team's invite link can join that team and see its board |
| Resend (F09) | That Resend delivers the mail, and that a password reset is not marketing |

The invite-link row is Lanes-specific and matters: it is a real consequence for
somebody's data that no generic policy would mention.

### Claim only what the code keeps

Each of these sentences is allowed **only** because something in the build
performs it. Check the finished pages against this list:

- **Deletion** — allowed; F11 builds it, and it is immediate and permanent.
  Describe what it actually removes, and say that cards they created stay on
  their team's board. Do not invent a grace period.
- **Export** — allowed; F11 builds Download my data. Say where it is.
- **Rectification** — only for fields that are actually editable: name, avatar,
  email, and their own cards.
- **Retention periods** — **not allowed.** Nothing prunes `activity_log` or
  `email_log`, so any number here would be false.
- **Security claims** — "encrypted in transit" is true and safe. "Encrypted at
  rest", SOC 2, ISO, "bank-level security" are claims about infrastructure
  nobody has provisioned.
- **An age limit** — **not allowed.** Nothing asks for one.
- **A named entity or jurisdiction** — never invented. See below.

### The blanks

`src/lib/legal.ts` — the facts that exist only in the user's head:

```ts
export const legal = {
  appName: "Lanes",
  entity: null as string | null,        // who operates it
  contactEmail: null as string | null,  // where privacy requests go
  jurisdiction: null as string | null,  // whose law governs the terms
  lastUpdated: "…",                     // and it moves when the pages do
};
```

**An unset value renders a loud marker, never a plausible placeholder.** `[Your
Company Name]` in a live privacy policy is the legal form of lorem ipsum — it
survives because nobody notices it. `src/components/legal-blank.tsx` renders a
yellow `<mark>` reading *"Needs your details — set `contactEmail` in
`src/lib/legal.ts`"*.

That exact string is what F15 greps the served page for, so it cannot ship in
silence. A hardcoded colour here is right rather than a lapse — the marker is
meant to look like something that doesn't belong.

Where a clause depends entirely on a blank — a governing-law sentence with no
jurisdiction — **omit the clause and mark it**, rather than writing a sentence
that means nothing.

### Terms

Shorter than people expect, and it should stay that way: what Lanes is, what an
account holder may and may not do with it, who owns what they put in (they do),
that the service can be changed or withdrawn, and one clause on organisation
data — that an organisation's Owner controls its board and can remove members.
No billing clauses; there are no payments.

## Acceptance criteria

- [ ] `/privacy` and `/terms` return `200` **from a cold client with no cookie**
      — not a redirect to sign-in.
- [ ] `/cookies` returns `404`. Building it would be the same failure as an
      orphan page.
- [ ] There is no cookie banner anywhere in the served HTML.
- [ ] Both pages are linked from the footer, and every footer link resolves.
- [ ] Every branch that ran appears in the privacy page — database, auth,
      Resend, and the invite-link consequence — in Lanes' own nouns.
- [ ] Nothing claims a retention period, an age limit, encryption at rest, or a
      certification.
- [ ] Deletion and export are described as they actually behave, including that
      a deleted user's cards remain.
- [ ] Every unset field in `src/lib/legal.ts` shows as a visible marker on the
      page: `curl -s .../privacy | grep -o "Needs your details[^<]*"` prints
      them.
- [ ] No plausible placeholder anywhere:
      `grep -rniE '\[your |lorem ipsum|company name\]|example\.com' src/app/\(legal\) src/lib/legal.ts`
      returns nothing.
- [ ] The pages read as though they describe Lanes and not a different product.
