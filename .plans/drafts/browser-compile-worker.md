# Plan: Browser compile in a Web Worker with lazy, code-split loading and size budgets

- **Value:** high
- **Priority:** P1
- **Slug:** browser-compile-worker
- **Preferred models:** reasoner, coding-agent
- **Assignee:** ai
- **Depends on:** docs-site-scaffold-pages-deploy

## Likely touch points
- `src/browser.ts` — new browser-safe entry (parse/resolve/compile/render; no Node imports)
- `src/worker.ts` — new worker module: message protocol `{id, source, options}` → `{id, svg, kicadSch?, netlist, diagnostics}`
- `src/compile.ts: compileNetlist()` — must stay free of Node-only imports for the browser path
- `scripts/build-demo.mjs` — `stubPlugin` list is the starting point for the bundler aliases
- `package.json` — `exports` gains `./browser` and `./worker`
- `website/plugins/circuitext-webpack.ts` — new Docusaurus plugin: `configureWebpack` aliases/fallbacks for Node-only modules
- `website/src/lib/compileClient.ts` — new: lazy worker client (single shared worker, request ids, cancellation)
- `scripts/check-bundle-size.mjs` — new budget check over `website/build/assets/js`

## Progress
- [ ] Step 1: Browser-safe library entry
- [ ] Step 2: Worker module and message protocol
- [ ] Step 3: Docusaurus webpack plugin for Node-only module stubs
- [ ] Step 4: Lazy worker client with cancellation
- [ ] Step 5: SSR safety (BrowserOnly / dynamic import boundaries)
- [ ] Step 6: Performance budgets in CI
- [ ] Step 7: Measure and record baseline numbers
- [ ] Done when holds

## Goal
Docs pages stay light. The tscircuit compile, about 9.4 MB minified and 2.4 MB gzip in the prototype demo bundle, downloads only when a live circuit actually needs it. It runs inside a Web Worker, so typing in an editor never blocks the main thread. CI fails when a budget is exceeded.

## Context read
- `.anchor/ANCHOR.md`, `.anchor/templates/plan.md`, `.plans/README.md`, `.anchor/conventions.md`
- On `feat/prototype`:
  - `scripts/build-demo.mjs`: esbuild with `splitting: true` and a stub plugin for `@resvg/resvg-js`, `circuit-json-to-gltf`, `fs`, `path`, `os`, `module`, `node:*`
  - `demo/main.ts`: a main-thread compile with a debounce and a sequence counter to drop stale results
  - `src/compile.ts`, `src/render.ts`, `src/mermaid.ts`: lazy `import()` of compile and render in the Mermaid loader
- Measured on the prototype demo build: the largest chunk is 9,391,658 bytes minified and 2,451,882 bytes gzip -9. The whole `demo/dist` is about 14 MB, including Mermaid's chunks.
- Docusaurus constraints:
  - SSR runs every page in Node at build time, so browser-only code must sit behind `<BrowserOnly>` or `useIsBrowser` plus dynamic `import()`.
  - Webpack 5 is configured through a plugin's `configureWebpack`.
  - Rspack comes with `@docusaurus/faster`, which is optional.

## Depends on (detail)
- `docs-site-scaffold-pages-deploy`: needs `website/` and its build to wire the webpack plugin and the budget check.

## Constraints
- No change to the library's Node API or CLI behaviour. `npm test` stays green, and the SVG snapshot stays byte-identical.
- The worker must work on GitHub Pages: same origin, no COOP/COEP, no `SharedArrayBuffer`, and module workers via `new Worker(new URL("./worker", import.meta.url), { type: "module" })`.
- Browser stubs throw a clear error if they're ever called. They must never silently return wrong data.
- Starting budgets (gzip; owner may change them, see Open questions):
  - A docs page with no live circuit adds **≤ 0 KB** of compile code. The compile chunk is never in the initial or prefetch set.
  - The editor UI chunk without the compiler is **≤ 250 KB**.
  - The compiler worker chunk is **≤ 3 MB** (today about 2.4 MB).
  - The first compile after the worker loads takes **≤ 1.5 s**, and recompiles of the examples take **≤ 1 s**, on a CI runner.
- Pin every new dependency exactly.

## Conventions
TypeScript, ESM, interfaces for the message protocol (`CompileRequest`, `CompileResponse`), and a small client object instead of a class hierarchy, per `.anchor/conventions.md`.

## Steps
| # | Task | Touches | Verify by | Route to |
|---|------|---------|-----------|----------|
| 1 | Add `src/browser.ts` re-exporting parse, resolve, compile and render without any Node import, plus a `./browser` export. Add a test that bundles it with esbuild for `platform: "browser"` with the same stub list and asserts no `node:` import remains | `src/browser.ts`, `package.json`, `test/browser-bundle.test.ts` | `npm test` | mid |
| 2 | Add `src/worker.ts`, which handles `CompileRequest` and posts `CompileResponse`. Make kicad generation opt-in per request, so the KiCad converter only runs on download | `src/worker.ts`, `src/index.ts` types | Unit test that drives the handler function directly (no real Worker) | mid |
| 3 | Add a Docusaurus plugin `website/plugins/circuitext-webpack.ts` that sets `resolve.fallback`/`alias` stubs for the Node-only modules (mirroring `build-demo.mjs`) and the `.ckt` raw loader. Register it in the config | `website/plugins/**`, `website/docusaurus.config.ts` | `npm run site:build` succeeds with a test page importing `circuitext/browser` lazily | reasoner |
| 4 | Add `website/src/lib/compileClient.ts`: one lazily created shared worker, request ids, a "latest wins" policy (stale responses dropped) and `terminate()` on page unload. Include a fallback to main-thread compile if `Worker` is unavailable | `website/src/lib/compileClient.ts` | A unit test with a fake Worker covers the ordering, a stale drop and an error | mid |
| 5 | SSR boundaries: every component that touches the client lives behind `<BrowserOnly fallback>`, and the compiler is only reachable via `import()`. Add a build-time guard: `site:build` must not evaluate the compile module, which is asserted by a sentinel `throw` when `typeof window === "undefined"` | `website/src/lib/**`, `website/src/components/**` | `npm run site:build` passes, and grep shows the compile chunk is not referenced from any page's initial `<script>` list | reasoner |
| 6 | Add `scripts/check-bundle-size.mjs`. It reads the webpack stats or build assets, classifies the chunks, checks the gzip sizes against the budgets in `website/budgets.json`, and runs as a CI step after `site:build` | `scripts/check-bundle-size.mjs`, `website/budgets.json`, `.github/workflows/ci.yml` | Inflating a budget breach (temporarily importing the compiler eagerly) fails CI. After reverting, it's green | mid |
| 7 | Record the baseline sizes and compile timings (Playwright timing from `circuit-editor-component` once it exists, or a manual script now) in `website/docs/contributing/performance.md` | `website/docs/contributing/performance.md` | The page builds and the numbers match the CI output | small |

## Risks
- **tscircuit core pulls more Node-only modules in a future pin.** Webpack fails at build time, which is good, or a stub throws at runtime. Mitigation: the bundle test in Step 1 runs in library CI, and version bumps are their own PRs.
- **Rspack (`@docusaurus/faster`) and webpack resolve differently.** Mitigation: use webpack first, and treat Rspack as a follow-up measured against the same budgets.
- **Module workers in older Safari.** Mitigation: the main-thread fallback in Step 4, and the smoke test covers Chromium plus WebKit (`circuit-editor-component`).
- **The worker chunk is cached poorly across deploys.** Mitigation: webpack contenthash file names, which Pages serves with ETags.
- **The 3 MB worker budget is too tight after a tscircuit bump.** Mitigation: the budget lives in `budgets.json` and changing it is a reviewed one-line diff.

## Decisions
- **Editor library (2026-10-27):** not final yet — awaiting Daniel's call. Recommended default is CodeMirror 6, which fits the 250 KB editor UI budget; Monaco would not. See `circuit-editor-component`.

## Open questions
1. Are the budget numbers right (0 KB compiler on plain pages, 250 KB editor UI, 3 MB gzip worker, about 1.5 s first compile)? Or do you want a stricter worker budget that would force deeper tree-shaking of `@tscircuit/core`?
2. Should a parse-and-validate-only path (parser plus resolver, a few KB) run on the main thread for instant diagnostics, with the worker doing only layout and SVG? The plan assumes yes.
3. Is a precompiled fallback acceptable when the worker fails to load (for example a corporate proxy blocking a 9 MB file)? That would be a build-time SVG plus an error banner.

## Escalation triggers
- Ambiguous requirement discovered → back to planner
- Task fails verification twice → bigger model
- Architectural decision needed → bigger model / human
- A budget can only be met by forking or patching `@tscircuit/core` → owner decides
- Step looks overqualified for its assigned tier (boilerplate/rename/formatting on a frontier route) → downgrade to smaller/local model instead

## Done when
- `npm run lint && npm test` pass at the root, and the browser-bundle test asserts no `node:` imports in the `./browser` entry
- `npm run site:build` passes, and the compile code is absent from every page's initial JS
- `node scripts/check-bundle-size.mjs` passes in CI against `website/budgets.json`
- The worker client unit tests pass, covering ordering, stale-result drop and error propagation
