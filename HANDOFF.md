# HANDOFF — ReferenzMaß

Stand: 2026-09-04 · Branch: `main` · Working Tree nach Commit/Push sauber (UI-Schicht + Edge-Spec).

## Einstieg (nächste Session) — Prompt

```
ReferenzMaß, Branch main, Working Tree clean.
Regeln: AGENTS.md. Stack bleibt Tauri 2 + Svelte 5 + Konva — kein Go, kein Lib-Wechsel, kein SvelteKit-Drop.
Erledigt und nicht erneut diskutieren: Persistenz-P0 (camelCase + restoreProject); P0-3 Originalpixel/fitView; P0-4 moveMeasurementAnchor; P0-5 shouldDeleteMeasurementOnKey; Composables useCanvasState/useImageManager/useProjectPersistence; Sidebar Calibration-Typ + deutsche Copy; svelte-check in useKonva.ts (Layer aus konva/lib/Layer, Stage-Container HTMLDivElement).
Nächstes Thema: Edge Detection laut docs/superpowers/specs/2026-09-04-edge-detection-design.md (nicht den Mai-Snapshot docs/edge-detection-plan.md).
Freigaben: Variante A, Dual-IPC (path XOR imageBase64), Canny nur per Button, Snap überall, Maske PNG statt Punktliste. Nächster Schritt: writing-plans, dann Code.
Optional klein: @types/node für die svelte-check-Warnung; tauri-plugin-opener + ping/commands.ts entfernen.
Nicht: Canvas wieder aufblasen, P0-1–5 erneut umbauen, Koordinatenraum, Commit/Push außer explizit verlangt.
```

## Entscheidungen (final — nicht wieder öffnen)

- Stack: Tauri 2 + Svelte 5 (Runes) + SvelteKit `adapter-static` + Konva 10 + Vitest + Playwright.
- Domain UI-frei: `src/lib/{geometry,calibration,homography,measurements,persistence}.ts`.
- Rust dünn: `ping`, `save_project`, `load_project`. JSON-Keys: **camelCase**.
- Messungs-Drag: `moveMeasurementAnchor()` → `measure()` (Plane = Homographie, nie `dist * scale`).
- Delete/Backspace: `shouldDeleteMeasurementOnKey()` — nicht in `input`/`textarea`/`select`/contenteditable.
- `CalibrationCanvas.svelte` orchestriert + `redrawMeasurements`. View/Bild/Persistenz in `src/lib/composables/`.
- Koordinatenraum: **Originalbild-Pixel**. Fit/Zoom/Pan = Stage-Transform (`fitView`).
- UI-Copy Deutsch. E2E: `getByRole('button', { name: 'Bild laden', exact: true })` — sonst matcht „Testbild laden“.
- `data-testid="konva-container"` und `data-testid="persistence-tools"` behalten.
- Konva-Typen: `import type { Layer } from 'konva/lib/Layer'`; `import type { Stage } from 'konva/lib/Stage'`; Action-Node `HTMLDivElement`.

## Edge Detection — Spec A, nicht implementiert

Datei: `docs/superpowers/specs/2026-09-04-edge-detection-design.md`

- Canny in Rust (`image` + `imageproc`), Command `detect_edges`
- Dual: `path` XOR `imageBase64` (Base64, kein `Vec<u8>`-JSON-Array)
- Trigger: Button „Kanten erkennen“, kein Auto nach Load
- Ergebnis: PNG-Graustufen-Maske; Overlay `edgeLayer`; Snap via `findSnapPoint` in `src/lib/edges.ts`
- Snap: Kalibrierung (Linie + Ebene) und Messungen inkl. Anchor-Drag
- Keine Persistenz der Maske/Parameter, kein Auto-Kalib, kein Downsample-IPC, kein Shift-Override
- Nächster Schritt: `writing-plans`, dann Implementierung. Kein Code vor Plan.

## Committed auf `main`

1. `fix: persist calibration in camelCase and measure in image pixels` (`28c30eb`)
2. UI-Schicht: P0-4, P0-5, Canvas-Composables, deutsche Copy, E2E-Selektoren, Konva-Typen
3. Spec Edge Detection Variante A

## Nächster Task — nur nach Auftrag

1. **writing-plans** für Edge Detection (Spec A), dann implementieren.
2. Optional klein: `@types/node` (svelte-check-Warnung); `tauri-plugin-opener` + `ping`/`commands.ts` entfernen.

## Nicht tun

- Stack-/Lib-Wechsel, SvelteKit droppen, Domain nach Rust
- `CalibrationCanvas.svelte` wieder aufblasen; neue God-Files
- P0-1–5, Koordinatenraum, Composable-Schnitt oder Konva-Typen erneut aufmachen
- `docs/improvement-plan.md` / `docs/status-2026-05-23.md` als Backlog
- Playwright als IPC-Beweis
- Mai-Plan `docs/edge-detection-plan.md` statt der Spec A
- Commit/Push ohne explizite Anweisung

## Verifikation (letzter Lauf, vor diesem Commit)

```bash
pnpm check:all     # check 0 errors / 1 warning (@types/node); Vitest 60/60; Rust 8/8
pnpm test:e2e      # 33/33 Chromium (UI-Schicht; Typ-Fix nicht erneut)
```

Native Save/Load im Tauri-Fenster nicht manuell verifiziert. Alte Projektdateien mit Display-Pixel-Koordinaten bleiben nach Reload falsch (kein Migrationspfad).
