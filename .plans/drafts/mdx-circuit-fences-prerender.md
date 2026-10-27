# Plan: ```circuit MDX fences with build-time SVG prerender and client hydration

- **Value:** high
- **Priority:** P2
- **Slug:** mdx-circuit-fences-prerender
- **Preferred models:** reasoner, coding-agent
- **Assignee:** ai
- **Depends on:** circuit-editor-component

## Likely touch points
- `website/plugins/remark-circuitext.ts` — new remark plugin: ```` ```circuit ```` / ```` ```circuitext ```` fences → `<Circuit>` / `<CircuitEditor>` MDX JSX nodes with `svg` prerendered
- `website/docusaurus.config.ts` — register under `presets.classic.docs.beforeDefaultRemarkPlugins` (and `pages`, `blog` if enabled)
- `website/src/components/Circuit/index.tsx` — consume `svg`, hydrate to live on interaction
- `src/render.ts: renderSvg()`, `src/compile.ts: compile()` — Node-side compile at build time (read-only use)
- `website/.cache/circuitext/` — new on-disk cache keyed by source hash + library version (gitignored)
- `test/remark-circuitext.test.ts` or `website/plugins/__tests__/` — fixture-based tests

## Progress
- [ ] Step 1: Fence syntax and meta options
- [ ] Step 2: Remark plugin transforms fences into MDX JSX
- [ ] Step 3: Build-time SVG prerender with Node compile
- [ ] Step 4: Content-hash cache
- [ ] Step 5: Build-time diagnostics fail the build
- [ ] Step 6: Client hydration
- [ ] Step 7: Tests and docs for authors
- [ ] Done when holds

## Goal
Docs authors write circuits as plain fenced code blocks:

````md
```circuit title="Voltage divider" editable
part R1 resistor 10k
...
```
````

Each block ships as a static, prerendered schematic SVG that shows with JavaScript off, is indexed by search, and never shifts the layout. It becomes a live, editable `<CircuitEditor>` when the reader clicks Edit, or immediately for `live` blocks. A circuit with errors fails the site build with `file:line:col`.

## Context read
- `.anchor/ANCHOR.md`, `.anchor/templates/plan.md`, `.plans/README.md`, `.anchor/conventions.md`
- On `feat/prototype`:
  - `src/render.ts` (`renderSvg`, `renderKicadSch`)
  - `src/compile.ts` (`compile`, about 0.2–1 s per circuit in Node)
  - `src/errors.ts` (`CircuitextError.diagnostics`, `formatDiagnostic`)
  - `src/mermaid.ts` (detector `/^\s*circuitext\b/i`, which is a different integration path)
- Docusaurus 3.10 MDX v3 pipeline:
  - Remark plugins get the mdast with `code` nodes (`lang`, `meta`, `value`).
  - `beforeDefaultRemarkPlugins` runs before Docusaurus's own code-block handling.
  - JSX is emitted as `mdxJsxFlowElement` nodes.
  - Async transformers are supported.

## Depends on (detail)
- `circuit-editor-component`: `<Circuit>` and `<CircuitEditor>` exist with the `svg`, `editable` and `source` props, and are registered in `MDXComponents`. This plan only produces nodes that target that contract.

## Constraints
- Fence languages: `circuit` and `circuitext`. Meta options: `title="…"`, `editable` (show Edit), `live` (mount the editor immediately), `height=NNN`, `kicad` (show the download), and `noprerender` (escape hatch).
- Prerender runs in Node at build time with the library's own `compile`. No headless browser.
- The output must be deterministic. The same source and library version give a byte-identical SVG, which the circuit-to-svg output already is. The cache key is `sha256(source + circuitext version + tscircuit core version + options)`.
- Build-time errors stop the build with `docs/<path>.mdx:<fenceLine+line>:<col>`. Map fence-relative `loc` to the MDX file line. Warnings only print.
- The inlined SVG is sanitised: no `<script>`, no `on*` attributes, and `id`s prefixed per block to avoid collisions between several SVGs on one page.
- Keep the build fast. Compile fences concurrently with a small pool (`os.availableParallelism()`, max 4) and reuse cached results across builds (`website/.cache/`, plus cached in CI via `actions/cache`).
- Don't touch ```` ```mermaid ```` blocks. The Mermaid adapter is a separate integration.

## Conventions
The remark plugin is a pure function `(options) => transformer` using `unist-util-visit` with typed mdast nodes. No class hierarchy, per `.anchor/conventions.md`.

## Steps
| # | Task | Touches | Verify by | Route to |
|---|------|---------|-----------|----------|
| 1 | Specify the fence grammar and meta parsing (`title`, `editable`, `live`, `height`, `kicad`, `noprerender`) with a typed `FenceOptions` parser | `website/plugins/remark-circuitext.ts` | Unit tests of the meta parser on valid and invalid strings | small |
| 2 | Write a remark transformer that replaces matching `code` nodes with an `mdxJsxFlowElement` (`Circuit` or `CircuitEditor`), passing `source`, `title` and flags as attributes. Register it in `beforeDefaultRemarkPlugins` for docs and pages | `remark-circuitext.ts`, `website/docusaurus.config.ts` | A fixture test with input mdast produces the expected JSX node. `site:build` renders a test page | mid |
| 3 | Prerender: for each fence, `await compile(source)` and `circuitJsonToSvg`, sanitise, prefix ids, and attach the result as the `svg` attribute (or as an imported asset if it's over 100 KB, to keep the HTML small). Bound concurrency with a pool | `remark-circuitext.ts` | Built HTML for the test page contains `<svg` inside the `Circuit` wrapper, and the page renders with JS disabled (Playwright `javaScriptEnabled: false`) | reasoner |
| 4 | Add an on-disk cache under `website/.cache/circuitext/<hash>.svg` with versioned keys, gitignored, plus an `actions/cache` step in the Pages and CI workflows | `remark-circuitext.ts`, `.gitignore`, `.github/workflows/*.yml` | The second `site:build` reports cache hits and is measurably faster (logged) | small |
| 5 | Errors: catch `CircuitextError` and rethrow with MDX-file-relative positions (`fence start line + loc.line`). Print warnings without failing | `remark-circuitext.ts` | A fixture with a bad pin fails the build with `docs/x.mdx:12:5: error: unknown pin …` | mid |
| 6 | Hydration: `<Circuit>` renders the prerendered SVG as SSR markup, so it shows without JS. On client mount it doesn't recompile until Edit is clicked or the block is `live`. Then it swaps in `<CircuitEditor>` inside the same fixed-height box. React warns on hydration mismatch, so the SSR and first client render must be identical | `website/src/components/Circuit/index.tsx` | Playwright: no hydration warnings in the console, no compile chunk downloaded until Edit is clicked, and the editor appears after the click | reasoner |
| 7 | Add an authoring guide page (fence options, error output, when to use `<CircuitEditor>` directly) and test the plugin from root `npm test` (or a `website` test script that CI runs) | `website/docs/authoring/circuit-blocks.mdx`, tests | `site:build` and the tests pass | small |

## Risks
- **Build time grows with many fences (0.2–1 s each).** Mitigation: the cache, the concurrency pool, and a CI cache. Measure on the content plan's page count.
- **Hydration mismatch from non-deterministic ids in SVG output.** Mitigation: per-block deterministic id prefixes, and the SVG is passed through unchanged at hydration.
- **MDX v3 and the Docusaurus remark ordering changes in a minor release.** Mitigation: exact pins and a fixture test that runs the real Docusaurus MDX loader on one page.
- **Large inline SVGs bloat the HTML and search index.** Mitigation: switch to an asset import over 100 KB, and exclude SVG text from the search index via the plugin's `ignoreCssSelectors`.
- **tscircuit core needs a newer Node in some build environment.** Mitigation: Pages workflow uses Node 20, matching `engines`.

## Open questions
1. Is the fence keyword `circuit` (with `circuitext` as an alias) right? Some Markdown tools already use `circuit` for other things, so should the canonical one be `circuitext`?
2. Should a fence error fail the build (the plan's default) or render an error box and warn, at least in `site:start` dev mode?
3. Should every block be editable by default, or opt-in via `editable`? The plan assumes opt-in, to keep pages calm and light.
4. Should KiCad downloads also be prerendered at build time as static `.kicad_sch` assets, so they work without the worker? This adds build time but no JS weight.

## Escalation triggers
- Ambiguous requirement discovered → back to planner
- Task fails verification twice → bigger model
- Architectural decision needed → bigger model / human
- Hydration cannot be made mismatch-free without changing the SVG renderer output → owner decides (renderer change is a library change with snapshot impact)
- Step looks overqualified for its assigned tier (boilerplate/rename/formatting on a frontier route) → downgrade to smaller/local model instead

## Done when
- `npm run lint && npm test` pass, including the remark plugin unit and fixture tests
- `npm run site:build` passes with circuit fences on at least one page, and a fixture with an invalid pin fails the build with an MDX-relative `file:line:col`
- Built HTML contains the prerendered `<svg>` for each fence, and that page shows the schematic in Playwright with JavaScript disabled
- Playwright shows no hydration warnings, and no compile chunk is requested until Edit is clicked on a non-`live` block
- A second `site:build` run reports cache hits
