# E2E Tests (Playwright)

These tests exercise the real running UI (Svelte 5 + Konva canvas) in a browser.

They are **frontend E2E** tests: they start the Vite dev server (`pnpm dev`) and drive the application exactly like a user would. They do **not** launch the packaged Tauri desktop binary or invoke real native dialogs (those are out of scope for the current macOS-friendly test suite).

## Running the tests

```bash
# Headless (CI / quick feedback)
pnpm test:e2e

# Interactive UI mode (highly recommended while developing)
pnpm test:e2e:ui

# Headed (see the browser window)
pnpm test:e2e:headed
```

The first run will download the Playwright browsers (Chromium).

## What is covered today

- Main screen loads (title, reference length input, unit selector, canvas)
- Drawing a reference line with the mouse
- Calibration feedback appears (scale, "Linie löschen" button)
- Changing reference length / unit updates the result
- Switching to measurement mode
- Drawing measurements and seeing the list + "CSV exportieren" button
- All persistence toolbar buttons are present

## Adding new tests

- Use `data-testid="konva-container"` for the drawing surface.
- Use `data-testid="persistence-tools"` for the bottom button bar.
- Prefer semantic selectors (`getByRole('button', { name: /Bild laden/ })`) when possible.
- Drawing interactions are done via `page.mouse` or `locator.click({ position })`.

## Future work (documented)

- Proper Tauri API mocking layer so "Bild laden", Save/Projekt laden and CSV export can be fully exercised without native dialogs.
- Optionally add WebdriverIO desktop E2E for Windows/Linux CI (true binary + webview testing).

## Relation to unit tests

Vitest (`pnpm test`, einmalig via `vitest run`) continues to be the place for fast pure logic and component surface tests.  
Playwright complements it by testing the integrated Konva drawing experience that is very hard to simulate in jsdom.