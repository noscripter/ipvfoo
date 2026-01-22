# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the extension source (background, popup/options UI, utility JS, and images).
- `src/manifest/` contains per-browser and per-manifest-version manifests (MV2/MV3).
- `build/` is the output directory for packaged ZIP/XPI artifacts.
- `tests/` contains unit tests, browser-based tests, and e2e scripts.
- `misc/` stores screenshots and project assets used in documentation.

## Build, Test, and Development Commands
- `make prepare`: verifies `src/manifest.json` matches a known manifest and creates `build/`.
- `make mv3`: build the MV3 package (default `BROWSER=chrome`).
- `make mv2`: build the MV2 package (default `BROWSER=chrome`).
- Chrome builds also emit an unpacked directory for loading (`UNPACKED=0` disables).
- `make all`: build both MV2 and MV3 for the selected browser.
- `make clean`: remove `build/` outputs.
- `npm install`: install dev dependencies for unit/e2e tests.

Example: `make mv3` writes `build/ipvfoo-<version>-mv3.zip` and `build/ipvfoo-<version>-mv3-unpacked/`.

## Coding Style & Naming Conventions
- JavaScript uses `"use strict"`, 2‑space indentation, and semicolons.
- Naming: `camelCase` for variables/functions, `PascalCase` for classes, `UPPER_SNAKE_CASE` for constants.
- JSON manifests are 2‑space indented. Keep files ASCII unless a file already uses Unicode.
- No automated formatter or linter is configured; keep changes consistent with existing style.

## Testing Guidelines
- Unit tests: `npm run test:unit` (Node + JSDOM + c8 coverage, 100% threshold for `src/iputil.js`, `src/common.js`, `src/options.js`, `src/popup.js`).
- E2E: `npm run test:e2e:chrome` and `npm run test:e2e:firefox` (extension loaded in Chromium/Firefox).
- Legacy browser-only tests: `tests/iputil_test.html` (TinyTest) still available for quick manual checks.
- Playwright requires browser installs: `npx playwright install` (once).

## Commit & Pull Request Guidelines
- Commit messages are short, imperative sentences (e.g., “Update README.md”).
- PRs should include: a concise summary, affected browsers (Chrome/Firefox) and manifest versions (MV2/MV3), and test notes.
- Provide screenshots for UI changes (popup/options), and call out permission or manifest changes explicitly.

## Security & Configuration Tips
- Avoid adding new permissions unless required; document rationale in the PR.
- If you touch manifests, update both MV2 and MV3 variants when applicable.
