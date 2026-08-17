# F01 — Project scaffold & toolchain

**Depends on:** nothing · **Blocks:** everything

## Purpose

Create the Next.js project every other feature builds on, in the current working
directory, with the app's real identity rather than the framework's defaults.

## Technical detail

### Scaffold

The app is created **in the current working directory** — `claude-connector` is
the project root. `package.json`, `src/` and `next.config.ts` sit at its top
level. There is no subfolder and no `cd` afterwards.

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --turbopack --use-npm
npm pkg set name=lanes
```

`.` makes `create-next-app` derive the package name from the folder, which would
give `claude-connector` — hence the explicit `npm pkg set`.

If the command refuses because the directory isn't empty (`.claude/` is present
and will be), scaffold into a temp directory and move the result up rather than
falling back to a subfolder:

```bash
npx create-next-app@latest .scaffold-tmp --typescript --tailwind --eslint \
  --app --src-dir --import-alias "@/*" --turbopack --use-npm
shopt -s dotglob && mv .scaffold-tmp/* . && rmdir .scaffold-tmp
```

Resolve collisions deliberately — **`.claude/` must survive intact**, since it
holds these plans. Merge `.gitignore` by hand if both exist.

### shadcn/ui

```bash
npx shadcn@latest init -d
```

Components are added on demand as pages need them, never speculatively. The
first batch is likely `button card input label dialog dropdown-menu select
avatar badge textarea sonner`.

### Layout

```
src/
├── app/           # routes: page.tsx, layout.tsx, api/
├── components/    # shared components (shadcn/ui lands in components/ui)
├── emails/        # React Email templates (F09)
└── lib/           # db, auth, guards, utilities
```

### Environment

Create `.env` at the project root (empty is fine — later features append to it)
and confirm `.env*` is in `.gitignore`. **Nothing in this project ever writes a
real secret into a committed file.**

### Git

The directory is not currently a git repository. Initialise one — F15 diffs
against a known commit to prove no suppression was added during fix rounds, and
`drizzle/` needs to be committed as source code.

## Gotchas

- **Do not pin versions.** Every install takes current stable, established by
  the Phase 0 currency check. A version written into a plan is a lie with a
  timestamp on it.
- If `create-next-app` prompts for something the flags don't cover, accept the
  default.
- The generated `src/app/layout.tsx` carries `title: "Create Next App"`. **Leave
  it for now** — F14 owns everything in `<head>` so there is exactly one owner
  and the two don't drift. It is a defect only if it survives to F15.

## Acceptance criteria

- [ ] `package.json` is at the project root with `"name": "lanes"` — there is no
      nested project folder.
- [ ] `.claude/plans/` survived the scaffold with all files intact.
- [ ] `npm run dev` starts without errors and `http://localhost:3000` renders.
- [ ] A shadcn `Button` imported into `src/app/page.tsx` renders styled, proving
      Tailwind and the shadcn config are wired.
- [ ] `.env` exists at the project root and `.env*` is matched by `.gitignore`.
- [ ] `git rev-parse HEAD` succeeds — the repository is initialised with an
      initial commit.
- [ ] `npx tsc --noEmit` is clean.
