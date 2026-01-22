# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the extension source (background, popup/options UI, utility JS, and images).
- `src/manifest/` contains per-browser and per-manifest-version manifests (MV2/MV3).
- `build/` is the output directory for packaged ZIP/XPI artifacts.
- `tests/` contains browser-based tests (see `tests/iputil_test.html`).
- `misc/` stores screenshots and project assets used in documentation.

## Build, Test, and Development Commands
- `make prepare`: verifies `src/manifest.json` matches a known manifest and creates `build/`.
- `make mv3`: build the MV3 package (default `BROWSER=chrome`).
- `make mv2`: build the MV2 package (default `BROWSER=chrome`).
- `make all`: build both MV2 and MV3 for the selected browser.
- `make clean`: remove `build/` outputs.

Example: `make mv2 BROWSER=firefox` writes `build/ipvfoo-<version>-mv2.xpi`.

## Coding Style & Naming Conventions
- JavaScript uses `"use strict"`, 2‑space indentation, and semicolons.
- Naming: `camelCase` for variables/functions, `PascalCase` for classes, `UPPER_SNAKE_CASE` for constants.
- JSON manifests are 2‑space indented. Keep files ASCII unless a file already uses Unicode.
- No automated formatter or linter is configured; keep changes consistent with existing style.

## Testing Guidelines
- Tests are browser-run via `tests/iputil_test.html` (TinyTest + `src/iputil.js`).
- Open the HTML file in a browser and check the console for pass/fail output.
- New unit tests should be added to `tests/iputil_test.html` with descriptive names like `valid_ipv6`.

## Commit & Pull Request Guidelines
- Commit messages are short, imperative sentences (e.g., “Update README.md”).
- PRs should include: a concise summary, affected browsers (Chrome/Firefox) and manifest versions (MV2/MV3), and test notes.
- Provide screenshots for UI changes (popup/options), and call out permission or manifest changes explicitly.

## Security & Configuration Tips
- Avoid adding new permissions unless required; document rationale in the PR.
- If you touch manifests, update both MV2 and MV3 variants when applicable.
