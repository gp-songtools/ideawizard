# CLAUDE.md

## Project
- Idea Wizard: song ideas from GP Blueprint's style prompt + song structure and Earprint's analysis; one of the GP Song Tools
- Live: https://gp-songtools.github.io/ideawizard/ (GitHub Pages, `main` branch, root)
- Static ES modules, no build step, no package.json; `tests/` holds the song spec tests

## Directory map
- `index.html`, `styles.css`, `app.js` — page, styles (violet accent, light/dark via `prefers-color-scheme`), UI and state
- `prompts.js` — system prompt, the three request prompts (ideas → plan → line by line), JSON schemas, `parseStructure`, `clean*` validators, hand-off text; no DOM
- `providers.js` — `ask()` for Claude (bundled SDK, structured outputs), Gemini (REST `responseSchema` via `toGeminiSchema`), Groq (OpenAI-compatible, `json_object` + schema in the prompt); `listModels`, `defaultModel`
- `spec.js` — song spec: offers Style/Structure/Analysis to the boxes, writes Idea + Idea structure (no DOM); `songspec.js` — copy of gp-songtools/toolsmenu `songspec/songspec.js`, never edit here; `tests/spec.test.mjs`
- `vendor/anthropic-sdk-1.3.0.js` — official Anthropic SDK, unmodified (same file as Lyricpad's); it sends the API key as `Authorization: Bearer`
- `changelog.html` (renders `CHANGELOG.md`; edit only the `.md`), `README.md`, `.nojekyll`

## Commands
- Serve: `python3 -m http.server 8092 >/dev/null 2>&1 &` → `http://localhost:8092/`
- Song spec tests: `node --test tests/*.test.mjs` (no dependencies)
- Syntax check (ES modules): `for f in app.js prompts.js providers.js spec.js; do cp $f /tmp/x.mjs && node --check /tmp/x.mjs || echo "FAIL $f"; done`
- UI check: Playwright + Chromium preinstalled; mock `api.anthropic.com`, `generativelanguage.googleapis.com` and `api.groq.com` with `page.route` (pick the reply by the prompt text: "Come up with exactly 3", "Develop this idea", "Zoom in on"); never make real AI calls; fail on `pageerror`/console errors

## Rules
- Song spec (format: gp-songtools/toolsmenu `songspec/SPEC.md`): Idea Wizard owns only Idea and Idea structure; it only reads Style, Structure and Analysis, and must work unchanged without them. A save without a plan empties Idea structure. Update `songspec.js` only by copying it from toolsmenu (`node toolsmenu/songspec/check-copies.js`).
- Claude default model `claude-opus-5-5` (owner can choose Sonnet 5.5 / Haiku 5.5 in the menu); `output_config: {effort: "medium", format: json_schema}`; server-side refusal fallback (`server-side-fallback-2026-07-01`, `fallbacks: "default"`) except on Haiku; check `stop_reason` `refusal` / `max_tokens`
- Gemini: key only in the `x-goog-api-key` header, never in a URL; default model = newest stable `gemini-N-flash` from ListModels
- Groq: `Authorization: Bearer`; default model from a preference list (`defaultModel`), else the first suitable one
- Keys: in memory by default; `localStorage` `ideawizard.key.<provider>.v1` only while "Remember key on this device" (`#keyRemember`, off by default) is ticked; never in logs or error text
- Other storage: `ideawizard.ui.v1` (provider, model per provider, inputs); wrap every access in try/catch (`store`)
- All model text goes into the DOM via `textContent`; run model output through the `clean*` functions before rendering
- `structureText()` writes the plan in GP Blueprint's structure format for Lyricpad (sections, bars, lines, rhyme, syllables; story/images/line-by-line go in the description); keep it parseable by Lyricpad's `js/structure.js` and by `parseStructure` here
- Structure text is GP Blueprint's contract (`gp-songtools/gp-blueprint` `docs/structure-format.md`); Earprint's "Copy for Idea Wizard" text is plain labelled lines starting `Earprint analysis`; both are prompt context, so wording changes there don't break parsing beyond the hints
- Prompts: US English; no real artist or song names; concepts and directions, not finished lyrics (Lyricpad writes lyrics)
- Add a `CHANGELOG.md` entry in the same commit as every user-facing change: today's date heading (reuse it if already at the top), Added / Changed / Fixed, plain user wording; update `README.md` when behavior changes
- `index.html` and `changelog.html` end with the Cloudflare Web Analytics snippet (same token as all GP Song Tools); tab icon 🧙 matches the GP Song Tools menu card; footer links to Changelog, the suite Privacy & credits page and the tools menu
- Privacy & credits live on the suite page `gp-songtools.github.io/toolsmenu/privacy.html` (repo `gp-songtools/toolsmenu`); update it and README "Privacy & credits" when changing what is sent, stored or credited
- Check layout at 390 px and 1280 px; `document.documentElement.scrollWidth` must equal the viewport width

## Git workflow
- Owner's standing instruction: open a pull request to `main` and merge it yourself once the checks below pass; no need to ask
- Run the syntax check and a mocked UI check before every push

# Multi-Agent Delegation Rules
When acting as the primary session (Opus), operate as a **Tech Lead and Architect**. Conserve primary context and rate limits by delegating execution work to specialized subagents whenever possible.
## Available Subagents
1. **`haiku-helper` (Fast Scout & Clerk)**
- **When to delegate:** File discovery, searching across the codebase (`Grep`/`Glob`), checking git status or commit logs, reading configuration files, and summarizing documentation.
- **Constraint:** Read-only tasks. Do not ask `haiku-helper` to write or edit code.
2. **`sonnet-worker` (Builder & Tester)**
- **When to delegate:** Implementing features from a finalized specification, writing unit or integration tests, refactoring isolated modules, fixing localized bugs, and running test/build suites.
- **Constraint:** Always provide clear requirements, target file paths, and expected behavior when invoking `sonnet-worker`.
## Orchestration Workflow
1. **Explore First:** Before planning changes, dispatch `haiku-helper` to locate relevant files and summarize existing patterns.
2. **Design & Plan:** Synthesize the findings in the main session and outline the architectural plan or edge cases.
3. **Delegate Implementation:** Hand off well-scoped coding, refactoring, and test-writing tasks to `sonnet-worker`. You may launch multiple `sonnet-worker` instances in parallel for independent modules.
4. **Review & Verify:** Inspect the changes made by `sonnet-worker` (or have `haiku-helper` summarize `git diff`) to ensure architectural alignment before concluding the task.
