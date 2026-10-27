# Plan: `<CircuitEditor>` live editor and `<Circuit>` read-only embed

- **Value:** high
- **Priority:** P1
- **Slug:** circuit-editor-component
- **Preferred models:** mid, coding-agent
- **Assignee:** ai
- **Depends on:** browser-compile-worker

## Likely touch points
- `website/src/components/CircuitEditor/index.tsx` — new; editor + preview + toolbar
- `website/src/components/CircuitEditor/language.ts` — new; CodeMirror 6 `StreamLanguage` for circuitext (keywords `circuit`/`part`/`net`, refs, `--`, pins, `key=value`, comments `#` `//` `%%`, strings)
- `website/src/components/CircuitEditor/lint.ts` — new; maps `Diagnostic{severity,message,loc}` to `@codemirror/lint` diagnostics
- `website/src/components/CircuitEditor/shareState.ts` — new; `lz-string` URL-hash encode/decode
- `website/src/components/Circuit/index.tsx` — new; read-only embed (SVG + "Open in playground" + download)
- `website/src/theme/MDXComponents.tsx` — register `CircuitEditor` and `Circuit` globally
- `src/parts.ts: PART_TYPES`, `src/errors.ts: Diagnostic`, `src/parser.ts: parseWithDiagnostics()` — sources for completion and diagnostics (read-only use)
- `website/e2e/editor.spec.ts`, `website/playwright.config.ts` — new smoke test
- `.github/workflows/ci.yml` — Playwright job

## Progress
- [ ] Step 1: CodeMirror 6 circuitext language and highlighting
- [ ] Step 2: Diagnostics as lint markers with file:line:col
- [ ] Step 3: Live SVG preview via the worker client
- [ ] Step 4: .kicad_sch download
- [ ] Step 5: Shareable URL-encoded state
- [ ] Step 6: `<Circuit>` read-only embed
- [ ] Step 7: Autocomplete from the part registry
- [ ] Step 8: Accessibility, theming and layout
- [ ] Step 9: Playwright smoke test in CI
- [ ] Done when holds

## Goal
Docs authors can drop `<CircuitEditor>` (editable) or `<Circuit>` (read-only) into any MDX page. Readers get syntax-highlighted circuitext, inline `line:col` diagnostics, a live schematic preview, a `.kicad_sch` download, and a link that reopens exactly what they typed.

## Context read
- `.anchor/ANCHOR.md`, `.anchor/templates/plan.md`, `.plans/README.md`, `.anchor/conventions.md`
- On `feat/prototype`:
  - `demo/index.html` and `demo/main.ts`: textarea editor, 250 ms debounce, `#src=` URL hash state, status line "N parts, M nets, T ms", kicad download via a Blob
  - `src/errors.ts`: `Diagnostic` with a 1-based `loc {line, col}` and `formatDiagnostic` producing `file:line:col: severity: msg`
  - `src/parser.ts`: tokens are words, strings, `--`, `:`, `,`, `=`, plus `#`, `//` and `%%` comments
  - `src/parts.ts`: `PART_TYPES` with aliases and pin aliases
- npm: `codemirror` 6.0.2, `@codemirror/language` 6.13.1, `@codemirror/lint` 6.9.7, `lz-string` 1.5.0, `@playwright/test` 1.64.1

## Depends on (detail)
- `browser-compile-worker`: provides `compileClient` (worker compile, latest-wins), the `./browser` entry, SSR boundaries and budgets. The editor UI chunk must fit its 250 KB budget.

## Constraints
- The component props are a public docs contract. Keep them small and typed:
  - `CircuitEditor{ source: string; title?: string; height?: number; readOnly?: boolean; showKicad?: boolean; share?: boolean }`
  - `Circuit{ source: string; svg?: string; caption?: string; editable?: boolean }`
  - The `svg` prop is what build-time prerender (`mdx-circuit-fences-prerender`) fills in.
- Rendering happens client-only, behind `<BrowserOnly>`. Before the worker answers, show the prerendered `svg` when it's given, otherwise a fixed-height skeleton, so there's no layout shift.
- Diagnostics display uses the library's own `loc`; don't re-parse in the UI. The message format matches the CLI (`<name>.ckt:line:col: severity: message`).
- Share links store the state only in the URL hash (`#ckt=<lz-string>`), never in query params, so Pages caching and server logs never see circuits. Hashes over 8 KB show a "too large to share" notice instead of a broken link.
- Never use `dangerouslySetInnerHTML` with unsanitised input. The SVG comes from our own compiler, but it's still inserted via DOMParser plus `importNode`, as in `src/mermaid.ts`, with `<script>` and `on*` attributes stripped.
- Pin all versions exactly. No editor dependency outside CodeMirror 6 and `lz-string`.

## Conventions
React function components with hooks. CodeMirror is wrapped in a small `useCodeMirror` hook rather than a third-party React wrapper. Use interfaces for props, per `.anchor/conventions.md`.

## Steps
| # | Task | Touches | Verify by | Route to |
|---|------|---------|-----------|----------|
| 1 | Build a `StreamLanguage` for circuitext (keywords, part types from `PART_TYPES`, refs, `REF.PIN`, `--`, `key=value`, strings, three comment styles) with a highlight style that works in light and dark themes | `CircuitEditor/language.ts` | Unit test: tokenizing `examples/*.ckt` yields the expected token classes for sample lines | mid |
| 2 | Run `parseWithDiagnostics` and `resolveWithDiagnostics` on the main thread (debounced at 150 ms) to get instant lint markers. Add the worker's compile warnings when they arrive. Map `loc` to CodeMirror positions, and show a status line with `file:line:col` entries | `CircuitEditor/lint.ts`, `index.tsx` | Unit test: `part R1 bogus` gives one error on line 1 whose range covers `bogus`. If `loc` only points at line start, tighten it in the resolver (library change plus test) | mid |
| 3 | Live preview: on change, post to `compileClient`; render the SVG with pan and zoom (CSS `transform`, no extra dependency); show "N parts, M nets, T ms"; keep the last good SVG while the source is invalid | `CircuitEditor/index.tsx` | Manual check on a dev build. The Playwright test in Step 9 asserts the SVG updates after editing | mid |
| 4 | Add a "Download .kicad_sch" button that requests `kicadSch` from the worker on click and saves `<title or circuit>.kicad_sch`, plus "Copy SVG" and "Download SVG" | `CircuitEditor/index.tsx` | Playwright: clicking produces a download whose content starts with `(kicad_sch` | small |
| 5 | Share state: a `shareState.ts` encode/decode using lz-string `compressToEncodedURIComponent` under `#ckt=`. Add a "Copy link" button. The playground reads the hash on load, and embedded editors link "Open in playground" with the hash | `CircuitEditor/shareState.ts`, `index.tsx` | Unit test round-trips all examples. Playwright: opening the copied link restores the source | small |
| 6 | Add `<Circuit>`, a read-only embed. It shows `svg` immediately if provided, otherwise compiles client-side. It has "Edit" (turns into `<CircuitEditor>` in place when `editable`) and "Open in playground". Register both in `MDXComponents` | `Circuit/index.tsx`, `website/src/theme/MDXComponents.tsx` | `site:build` passes. A demo MDX page renders both components | mid |
| 7 | Autocomplete: part types after `part REF `, and pins after `REF.` (from the resolved part's labels and aliases), using `@codemirror/autocomplete` | `CircuitEditor/complete.ts` | Unit test of the completion source on fixture docs | mid |
| 8 | Accessibility and layout: a keyboard-only flow, an `aria-label` on the preview with a text netlist alternative (`netlist` output) in a `<details>`, responsive stacked layout under 768 px, and colours that follow the Docusaurus theme | `CircuitEditor/*.module.css`, `index.tsx` | Playwright axe check (`@axe-core/playwright`) reports no serious violations | mid |
| 9 | Playwright smoke test (Chromium plus WebKit) against the `site:serve` build. It loads the playground, waits for the SVG, types an invalid line and sees a `line:col` diagnostic, fixes it and sees the SVG update, downloads the kicad file, then round-trips a share link. Add it as a CI job with cached browsers | `website/e2e/editor.spec.ts`, `website/playwright.config.ts`, `.github/workflows/ci.yml` | The CI `e2e` job is green, and a deliberately broken compile makes it fail | mid |

## Risks
- **A `StreamLanguage` is less precise than a Lezer grammar.** Mitigation: diagnostics come from the real parser anyway, so the highlighter only needs to look right. A Lezer grammar is a possible later plan.
- **Main-thread parse and worker compile disagree on errors.** Mitigation: both run the same library code. The worker's diagnostics win, and the main-thread pass only adds early markers.
- **Pan and zoom on large SVGs is sluggish.** Mitigation: transform the wrapper, not the SVG nodes, and cap the preview size.
- **Playwright flakiness from the 9 MB worker download on CI.** Mitigation: wait on a `data-state="ready"` attribute instead of timeouts, and retry once only in CI.
- **CodeMirror's bundle weight pushes the editor UI chunk past its budget.** Mitigation: import only the needed `@codemirror/*` packages, not the `codemirror` meta bundle's basicSetup, if it's too large.

## Open questions
1. CodeMirror 6 or Monaco? The plan assumes CodeMirror 6, which is smaller, has better mobile support and is easier to theme.
2. Is the share format `#ckt=<lz-string>` fine? Should share links also carry options (grid, width), or only the source?
3. Should the editor offer a "Copy as tscircuit TSX" button (the existing `toTsx`) next to the KiCad download?
4. Is WebKit required in the smoke test from day one? It adds about 1–2 minutes of CI time.

## Escalation triggers
- Ambiguous requirement discovered → back to planner
- Task fails verification twice → bigger model
- Architectural decision needed → bigger model / human
- Component props need a breaking change after content pages use them → owner decides
- Step looks overqualified for its assigned tier (boilerplate/rename/formatting on a frontier route) → downgrade to smaller/local model instead

## Done when
- `npm run lint && npm test` pass at the root, including the new language, lint-mapping, share-state and completion unit tests
- `npm run site:build` passes, and `node scripts/check-bundle-size.mjs` still passes, with the editor UI chunk within budget
- The CI `e2e` Playwright job is green on Chromium (and WebKit if Open question 4 is answered yes): load, diagnostics with `line:col`, live SVG update, `.kicad_sch` download, share-link round trip
- The axe check shows no serious or critical violations on the playground page
