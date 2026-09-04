# HANDOFF — ReferenzMaß

Stand: 2026-09-04 · Branch: `main` · Agent-Schicht + Persistenz-P0 + Koordinaten-P0-3 committed.

## Einstieg (nächste Session) — Prompt

```
ReferenzMaß, Branch main. Regeln: AGENTS.md. Stack bleibt Tauri 2 + Svelte 5 + Konva — kein Go, kein Lib-Wechsel, kein SvelteKit-Drop.
Erledigt und nicht erneut diskutieren: Agent-Schicht; Persistenz-P0 (camelCase + restoreProject); P0-3 (Geometrie in Originalpixeln, Fit nur Stage via fitView).
Nächster Task nur P0-4: Messungs-Drag muss measure() / recalculateMeasurement() nutzen, nicht dist * calibration.scale. Plane sonst falsch.
Ort: CalibrationCanvas.svelte, vier Stellen um anchorStart/anchorEnd dragmove+dragend (ca. Zeilen 836–874). Domain schon korrekt in measurements.ts.
Nicht: Canvas-Split, Delete-in-Inputs (P0-5), Edge Detection, Commit außer explizit verlangt.
```

## Entscheidungen (final — nicht wieder öffnen)

- Stack: Tauri 2 + Svelte 5 (Runes) + SvelteKit `adapter-static` + Konva 10 + Vitest + Playwright.
- Domain in TypeScript (`src/lib/{geometry,calibration,homography,measurements,persistence}.ts`), UI-frei.
- Rust bleibt dünn: `ping`, `save_project`, `load_project`. JSON-Keys: **camelCase**.
- Kein Rewrite (Go/Wails/Fyne/Gio). Keine neuen Runtime-Libs.
- `CalibrationCanvas.svelte` nicht aufblasen. Composable-Split erst nach P0-4–5.
- Koordinatenraum: **Originalbild-Pixel**. Fit/Zoom/Pan = Stage-Transform (`fitView`). Persistierte Punkte sind Originalpixel — kein Mapping in `persistence.ts`.

## Erledigt (committed)

**Agent-Schicht:** `AGENTS.md`, `HANDOFF.md`, `package.json` (`test` = `vitest run`, `test:rust`, `check:all`, `packageManager`), `.github/workflows/ci.yml`, `README.md`, Banner in `docs/*`, `devbox.json`, `e2e/README.md`.

**Persistenz-P0:** Serde `rename_all = "camelCase"`; Referenzgeometrie in DTO; `restoreProject()` + `shouldClearLiveCalibration()`; Fixtures `fixtures/project-*.camelCase.json`.

**P0-3 Koordinatenraum:**

- `geometry.ts`: `fitView`, `imageToScreenPoint`, `screenToImagePoint`, `screenLengthToImage`.
- Ein Fit-Pfad: Konva-Image bei `(0,0)` in Natural Size; Stage-Scale/Position = View. Loupe = Natural Size × Stage-Scale.
- Handles/Labels über `screenLengthToImage`; Linien `strokeScaleEnabled: false`.
- `useKonva.ts`: Min-Drag in Bildschirm-Pixeln (`dist * stage.scaleX() > 5`).

## Nächster Task — P0-4 Messungs-Drag

**Bug:** Beim Ziehen eines Messungs-Anchors wird `realLength = dist * calibration.scale` gesetzt. Für `type === 'plane'` falsch — dort gilt Homographie (`measure()` → `projectDistance()`).

Neu gezeichnete Messungen sind schon korrekt (`createMeasurement` → `measure`). Nur der Drag-Pfad umgeht die Domain.

**Vier Stellen** in `CalibrationCanvas.svelte` (Messungs-Anchors, nicht Referenzlinie/Plane-Punkte):

| Event | Ist | Soll |
|---|---|---|
| `anchorStart.dragmove` ~837 | `dist * calibration!.scale` → Label | `measure(calibration, dist, start, end)` |
| `anchorStart.dragend` ~847 | `...item, start, realLength: hypot * scale` | `recalculateMeasurement({ ...item, start }, calibration)` — `id`/`label`/`notes` behalten |
| `anchorEnd.dragmove` ~864 | analog | analog |
| `anchorEnd.dragend` ~874 | analog | analog |

`measure(calibration, pixelDistance, start?, end?)` und `recalculateMeasurement()` existieren. Keine neue Längenformel erfinden. `measurements.ts` hat kein eigenes Testfile — P0-4 dort oder in `calibration.test.ts` mit Plane-Kalibrierung zuerst rot schreiben.

Constraints: Canvas nicht aufblasen; P0-5 nicht mischen; keine neuen IPC-Felder.

## Danach (nicht jetzt)

5. Global Delete/Backspace nur außerhalb von Inputs (`handleKeyDown` in `CalibrationCanvas.svelte`, prüft nicht `input`/`textarea`).
6. Canvas-Composables — `docs/improvement-plan.md` D, historisch.
7. Edge Detection in Rust, isolierter Worker.

Optional klein: `tauri-plugin-opener` + `ping`/`commands.ts` entfernen; `svelte-check` (Konva `Layer`-Import, `Stage` container, `WorkspaceSidebar` `calibration.type`).

## Nicht tun

- Stack-/Lib-Wechsel, SvelteKit droppen, Domain nach Rust
- God-Component aufblasen oder Canvas-Split vor P0-4/5
- `docs/improvement-plan.md` / `docs/status-2026-05-23.md` als Backlog
- Playwright als IPC-Beweis
- P0-3 Koordinatenraum erneut umbauen

## Verifikation (letzter Lauf, P0-3)

```bash
pnpm test          # 55/55 (+7 geometry fit/mapping gegenüber 48)
pnpm test:rust     # 8/8
pnpm check         # 3 vorbestehende Fehler, nicht angefasst
```

Vite `:1420` kompiliert `CalibrationCanvas.svelte`. Playwright-Browser lokal nicht installiert. Native Save/Load im Tauri-Fenster nicht manuell verifiziert. Alte Projektdateien mit Display-Pixel-Koordinaten bleiben nach Reload falsch (kein Migrationspfad).

## Working Tree

Nach diesem Commit sollte `main` die drei Schichten enthalten. Push nur auf explizite Anweisung.
