# ReferenzMaß — Agent-Regeln

Photogrammetrie-Desktop-App: Foto laden, kalibrieren (Linie oder 4-Punkt-Homographie), Strecken messen, CSV exportieren.

Identifier: `de.referenzmass.app` · Version: `0.1.0` · Branch: `main`

## Stack — nicht wechseln

Tauri 2 + Svelte 5 (Runes) + SvelteKit `adapter-static` + Konva 10 + Vitest + Playwright.

Rust-Backend ist dünn (`ping`, `save_project`, `load_project`). Domain liegt in TypeScript (`src/lib/*`), UI-frei.

**Kein Rewrite** (Go, Wails, Fyne, Gio). Begründung: `HANDOFF.md`. Optionaler isolierter CV-Worker in Rust/Go erst nach P0.

## Befehle

Immer One-Shot, nie Watch (außer explizit `*:watch`):

| Zweck | Befehl |
|---|---|
| Unit/Component | `pnpm test` (`vitest run`) |
| Watch lokal | `pnpm test:watch` |
| Typen | `pnpm check` — **derzeit rot**, 3 vorbestehende Fehler (`useKonva.ts` Layer/Stage-container, `WorkspaceSidebar` `calibration.type`) |
| Rust | `pnpm test:rust` |
| Alles außer E2E | `pnpm check:all` — scheitert aktuell an `pnpm check` |
| Frontend-E2E | `pnpm test:e2e` (Vite, kein natives Tauri) |
| App | `pnpm tauri dev` oder `devbox run dev` |

Paketmanager: **pnpm** (siehe `packageManager` in `package.json`). Nicht npm/yarn.

## Layout

```
src/lib/                  Domain + UI
  geometry.ts             Punkte, Distanz
  calibration.ts          Line-Scale
  homography.ts           8×8 DLT + Gauß
  measurements.ts         Messungen (kein eigenes Testfile)
  persistence.ts          camelCase-DTOs, restoreProject, invoke
  project.ts              Dialoge, CSV
  actions/useKonva.ts     Zeichen, Zoom, Space-Pan
  components/
    CalibrationCanvas.svelte   God-Component — nicht weiter aufblasen
    WorkspaceSidebar.svelte
src-tauri/src/lib.rs      IPC, camelCase via serde rename_all
fixtures/                 Vertrag JSON für TS + Rust
e2e/                      Playwright gegen Vite :1420
docs/                     Historisch — aktuelle Wahrheit: diese Datei + HANDOFF.md
```

Crate-Name `tauri-app` / Lib `tauri_app_lib` ist Template-Rest. Nicht umbenennen, solange kein Release-Blocker.

## P0 — bekannt, nicht „nebenbei“ anfassen

1. ~~**Serde-Mismatch.**~~ Erledigt 2026-09-04: `#[serde(rename_all = "camelCase")]` auf `ProjectState` / `CalibrationState` / `MeasurementState`. Tests ohne Mock: `serialized_project_state_uses_camel_case_keys`, `deserializes_frontend_camel_case_json`, Fixtures `fixtures/project-*.camelCase.json`.
2. ~~**Load löscht Kalibrierung.**~~ Erledigt 2026-09-04: Referenzgeometrie (`referenceStart`/`End`, `planePoints`, `realWidth`/`realHeight`) wird persistiert. `restoreProject()` + `loadProjectState` stellen sie wieder her. `$effect` nutzt `shouldClearLiveCalibration` (Legacy-Dateien ohne Punkte behalten die Scale).
3. ~~**Koordinaten = Display-Pixel.**~~ Erledigt 2026-09-04: Geometrie in Originalbild-Pixeln. `loadImageIntoLayer` platziert das Bild bei `(0,0)` in Natural Size; Fit/Zoom/Pan nur Stage-Transform (`fitView` in `geometry.ts`). Persistierte Punkte sind Originalpixel, kein Extra-Mapping in `persistence.ts`.
4. **Messungs-Drag nutzt `dist * calibration.scale`**, nicht `measure()` / `projectDistance()`. Bei Plane-Kalibrierung falsch.
5. **Global Delete/Backspace** löscht die selektierte Messung auch in Inputs.

Reihenfolge für Produktarbeit: 4 → 5. Danach Canvas schneiden, danach erst Edge Detection (`docs/edge-detection-plan.md`).

## Constraints

- Keine neuen God-Files. Änderungen an `CalibrationCanvas.svelte` klein halten oder ins geplante Composable-Split (`useCanvasState`, `useImageManager`, `useProjectPersistence`).
- Domain bleibt UI-frei: keine Konva-/Svelte-Imports in `src/lib/{geometry,calibration,homography,measurements,persistence}.ts`.
- Neue IPC-Felder: Frontend-DTO, Rust-Struct, Serde-Rename (`camelCase`) und Roundtrip-Test in **einem** Schritt. JSON-Keys in `fixtures/project-*.camelCase.json` mitziehen.
- Persistierte Geometrie muss Originalbild-Pixel sein, sobald Koordinatenraum gefixt wird — nicht Display-Fit.
- `csp: null` und Asset-Scope `**/*` nicht weiter aufweichen; enger machen ist ok.
- `pforte-fuersthof.jpg` im Repo-Root ist E2E-Fixture (`window.__e2e.loadImage`). Nicht löschen, nicht in den Prompt laden.
- E2E: `data-testid="konva-container"` und `data-testid="persistence-tools"` behalten. Native Dialoge sind out of scope (siehe `e2e/README.md`).
- `docs/improvement-plan.md` und `docs/status-2026-05-23.md` sind Snapshots vom 2026-05-23, **kein** aktuelles Backlog.

## Tests

- `pnpm check` (Stand 2026-09-04): `Layer` nicht aus `konva/lib/Stage`; `Konva.Stage({ container: HTMLElement })`; `WorkspaceSidebar` liest `calibration.type`, Prop-Typ hat nur `{ scale, unit }`. Measurement-`label`/`notes` in `persistence.test.ts` ist gefixt. Vitest 55 grün. CI lässt `svelte-check` nicht den Job killen.
- Vitest: Default-Environment `node`. DOM-Tests brauchen `/** @vitest-environment jsdom */` oben in der Datei.
- Playwright startet `pnpm dev` auf Port 1420. Flakes: Canvas-Timing, nicht „Selector fehlt also Feature fehlt“. E2E trifft natives IPC nicht.
- Rust-Tests: File-Roundtrips **und** camelCase-JSON-Keys plus `fixtures/project-*.camelCase.json`.

## Session-Stand

Kurzfristiger Stand und nächster Schritt: `HANDOFF.md`. Nach abgeschlossener Aufgabe HANDOFF aktualisieren.
