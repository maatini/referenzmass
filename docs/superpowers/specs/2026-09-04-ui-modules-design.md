# UI-Module — Korrektheit + Schnitt

Stand: 2026-09-04 · Option A (freigegeben)

## Ziel

Messungs-Drag und Delete-in-Inputs korrigieren, `CalibrationCanvas.svelte` in Composables schneiden, Sidebar-Typ und deutsche Copy angleichen. Kein visuelles Redesign, keine neuen Features.

## Phasen

1. **P0-4** — Messungs-Anchor-Drag nutzt `measure()` / `moveMeasurementAnchor()` (Homographie bei Plane).
2. **P0-5** — Delete/Backspace nur außerhalb von `input`/`textarea`/`select`/contenteditable.
3. **Composables** — `useCanvasState`, `useImageManager`, `useProjectPersistence` unter `src/lib/composables/`. `redrawMeasurements` bleibt im Canvas.
4. **Copy/Typ** — `calibration: Calibration | null`; EN/DE vereinheitlichen; E2E-Selektoren mitziehen.

## Nicht

Edge Detection, Undo, IPC-Felder, Stack-Wechsel, Konva `Layer`/`Stage`-Import-Fehler in `useKonva.ts`.
