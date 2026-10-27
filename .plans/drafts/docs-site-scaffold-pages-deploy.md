# Plan: Docusaurus docs site scaffold with GitHub Pages deploy

- **Value:** high
- **Priority:** P1
- **Slug:** docs-site-scaffold-pages-deploy
- **Preferred models:** mid, coding-agent
- **Assignee:** ai
- **Depends on:** none

## Likely touch points
- `website/docusaurus.config.ts` — new; `url`, `baseUrl`, `organizationName`, `projectName`, `trailingSlash`, search plugin, `onBrokenLinks`
- `website/sidebars.ts`, `website/docs/intro.md`, `website/src/pages/index.tsx` — new skeleton content
- `website/package.json` — new; Docusaurus deps pinned exactly
- `package.json` (root) — npm workspaces entry and `site:*` scripts
- `.github/workflows/pages.yml` — new; build and deploy with `actions/deploy-pages`
- `.github/workflows/ci.yml` — add a site build and link-check job
- `biome.json`, `tsconfig.json` — exclude or include `website/` deliberately

## Progress
- [ ] Step 1: Scaffold Docusaurus in `website/` as an npm workspace
- [ ] Step 2: Configure Pages URL, baseUrl and trailing slashes
- [ ] Step 3: Pages deploy workflow
- [ ] Step 4: Local search plugin
- [ ] Step 5: Versioning policy wiring (no versions cut yet)
- [ ] Step 6: CI site build and link check
- [ ] Step 7: Contributor docs for the site
- [ ] Done when holds

## Goal
`https://carefreeinv.github.io/circuitext/` serves a Docusaurus site that is built and deployed from `main` by GitHub Actions. It has working local search and a CI job that fails on broken links. This is the shell the live-editor plans build on.

## Context read
- `.anchor/ANCHOR.md`, `.anchor/templates/plan.md`, `.plans/README.md`, `.anchor/conventions.md` (framework **node**, orchestrator **grok**)
- `README.md` on `main`; the prototype on branch `feat/prototype` (PR #1): `package.json` (ESM, Node >= 20, exact pins), `tsconfig.json`, `biome.json`, `.github/workflows/ci.yml`, `scripts/build-demo.mjs`, `demo/`
- Docusaurus 3.10.2 on npm (`engines.node >= 20`, React 18 or 19 peer); `@easyops-cn/docusaurus-search-local` 0.55.3
- GitHub Pages project-site rules: served under `/<repo>/`, so `baseUrl: "/circuitext/"`, `url: "https://carefreeinv.github.io"`

## Depends on (detail)
- No other plan. **Non-plan prerequisite:** the library code lands on `main` with PR #1 (`feat/prototype`). Until then, branch this work from `feat/prototype` or rebase after the merge. Steps 1–4 do not import the library and can start on `main`.

## Constraints
- Node >= 20, ESM, TypeScript config files (`docusaurus.config.ts`), and exact version pins (`--save-exact`), matching the repo convention.
- The site lives in `website/` as an npm workspace, so `npm ci` at the root installs everything and the lockfile stays single. The library's published `files` must not include `website/`.
- GitHub Pages only: static output, with no server functions and no custom headers. That means no COOP/COEP, so no `SharedArrayBuffer`.
- Deploy with the official `actions/configure-pages`, `actions/upload-pages-artifact` and `actions/deploy-pages` (Pages source = GitHub Actions). Do not use the `gh-pages` branch push.
- Local search only (no Algolia account and no external service).
- Docs describe shipped behaviour only. Never copy `.plans/` contents into the site (`.plans/README.md` hard rule).

## Conventions
Node/TypeScript per `.anchor/conventions.md`: interfaces and small composable modules, not class hierarchies. Use React function components. Biome handles lint and format, and `tsc` typechecks. Commits outside `.plans/` go through `/commit-prep`.

## Steps
| # | Task | Touches | Verify by | Route to |
|---|------|---------|-----------|----------|
| 1 | Scaffold `website/` with the Docusaurus classic preset (TypeScript) as an npm workspace. Pin `@docusaurus/*` 3.10.2 exactly. Add root scripts `site:start`, `site:build`, `site:serve` | `website/**`, `package.json`, `package-lock.json` | `npm ci && npm run site:build` exits 0 | small |
| 2 | Set `url: "https://carefreeinv.github.io"`, `baseUrl: "/circuitext/"`, `organizationName: "carefreeinv"`, `projectName: "circuitext"`, `trailingSlash: false`, `onBrokenLinks: "throw"`, `onBrokenMarkdownLinks: "throw"` | `website/docusaurus.config.ts` | `npm run site:build && npx serve website/build`, then check that `/circuitext/` loads with assets under `/circuitext/assets/` | small |
| 3 | Add `.github/workflows/pages.yml`: on push to `main` plus `workflow_dispatch`, with `permissions: pages: write, id-token: write`, a `concurrency: pages` group, Node 20, `npm ci`, `npm run site:build`, upload `website/build`, deploy | `.github/workflows/pages.yml` | actionlint passes. After merge, the workflow run is green and the URL returns 200 | mid |
| 4 | Add the `@easyops-cn/docusaurus-search-local` theme (pinned) with `hashed: true`, `indexBlog: false`, `docsRouteBasePath: "/docs"` | `website/docusaurus.config.ts`, `website/package.json` | `site:build` emits `search-index*.json`. The search box finds "kicad" on the built site | small |
| 5 | Versioning: keep `docs/` as "Next (unreleased)" and add a `website/VERSIONING.md` note. The rule: cut `docusaurus docs:version X.Y` only when a library release is tagged (see `/release`). Do not cut a version now | `website/VERSIONING.md`, `website/docusaurus.config.ts` (`lastVersion`/`versions` labels) | `site:build` passes, the navbar shows no version dropdown yet, and the note exists | small |
| 6 | CI job `site`: `npm ci`, `npm run site:build` (fails on broken links via `onBrokenLinks: "throw"`), then an external link check of the built HTML with `lychee` (offline mode for internal links; external links on schedule only) | `.github/workflows/ci.yml` | A PR with an intentionally broken link fails the job; after reverting it, the job is green | mid |
| 7 | Document `npm run site:start` and the Pages setup (repo Settings → Pages → Source: GitHub Actions) in `website/README.md` and a short README section | `website/README.md`, `README.md` | Docs render; links resolve in `site:build` | small |

## Risks
- **The Pages source isn't switched to "GitHub Actions" in repo settings.** The deploy job would fail. Mitigation: Step 7 documents it, and the owner flips the setting once (manual prerequisite; see Open questions).
- **The `baseUrl` is wrong, so assets 404 on Pages but work locally.** Mitigation: Step 2 verifies with `serve` under `/circuitext/`, and the post-deploy check requests a hashed asset URL.
- **The workspace install pulls Docusaurus into library CI time.** Mitigation: cache npm, and keep library jobs running `npm ci --workspaces=false` if build time doubles.
- **The `@docusaurus/*` and React 19 peer combination drifts.** Mitigation: exact pins, and dependency updates go through their own PR.

## Open questions
1. Is `website/` acceptable as the directory, or do you prefer `docs-site/`? The plan assumes `website/`, which is the Docusaurus default.
2. ~~Can you switch the repo's Pages source to "GitHub Actions"?~~ **Resolved (2026-10-27): manual prerequisite, Daniel's admin step.** Daniel will switch Settings → Pages → Source to "GitHub Actions" himself (reminder set for Nov 5). The first deploy can't succeed until this is done; agents must not attempt it.
3. Should the site be the README's home link? And should the npm `homepage` field point at it once it's live?
4. ~~Should a `dev` branch be created from `main` now?~~ **Resolved (2026-10-27):** a `dev` branch now exists in this repo, created from `main`. New feature branches come from and target `dev`. Existing PRs are not retargeted.

## Escalation triggers
- Ambiguous requirement discovered → back to planner
- Task fails verification twice → bigger model
- Architectural decision needed → bigger model / human
- The deploy needs repo settings or permissions an agent cannot change → owner (human) step; park in `blocked/` with the exact setting named
- Step looks overqualified for its assigned tier (boilerplate/rename/formatting on a frontier route) → downgrade to smaller/local model instead

## Done when
- `npm ci && npm run site:build` exits 0 at the repo root on Node 20
- `npm run lint && npm test` still pass at the root (library unaffected)
- `.github/workflows/pages.yml` and the CI `site` job exist, and the `site` job is green on the PR
- The built site under `website/build` contains a search index and only references assets under `/circuitext/`
- After merge to `main`, `https://carefreeinv.github.io/circuitext/` returns HTTP 200 (requires the manual prerequisite: Daniel has switched the Pages source to GitHub Actions)
