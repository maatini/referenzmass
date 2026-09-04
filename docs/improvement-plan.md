# ReferenzMaß — Verbesserungsplan

> **Historisch (2026-05-23), nicht die Quelle der Wahrheit.**
> Aktuell: [`HANDOFF.md`](../HANDOFF.md) (Stand/nächster Schritt), [`AGENTS.md`](../AGENTS.md) (Regeln).
>
> Abgleich 2026-09-04: **A1–A4 erledigt** — Serde camelCase, Referenzpunkte/`realWidth`/`realHeight` persistiert, `restoreProject` + Load-`$effect`. Koordinatenraum (Originalpixel, Fit nur Stage) erledigt. **B1–B5 weitgehend** in `e2e/`. **D–G offen.** Nächster P0: Messungs-Drag, Delete-in-Inputs.

---

## Übersicht der Verbesserungsbereiche

| # | Bereich | Priorität | Aufwand | Tasks |
|---|---|---|---|---|
| 1 | Plane-Persistenz-Bug | 🔴 P0 | 2h | A1–A4 |
| 2 | E2E-Test-Lücken | 🔴 P0 | 6h | B1–B5 |
| 3 | Code-Cleanup | 🟡 P1 | 1h | C1–C4 |
| 4 | CalibrationCanvas Refactoring | 🟡 P1 | 4h | D1–D4 |
| 5 | Unit-Tests für UI-Komponenten | 🟢 P2 | 3h | E1–E3 |
| 6 | CSV-Export E2E-Test | 🟢 P2 | 1h | F1 |
| 7 | Undo/Redo | 🔵 P3 | 4h | G1–G3 |

**Gesamtaufwand: ~21h**

---

## A: Plane-Persistenz-Bug (P0, ~2h)

**Problem:** `CalibrationState` in `persistence.ts` und `lib.rs` hat kein `type`-Feld und kein `homography`-Feld. Plane-Kalibrierungen gehen beim Speichern/Laden verloren.

### A1 — Rust `CalibrationState` erweitern
**Datei:** `src-tauri/src/lib.rs`
- Feld `calib_type: String` (Werte: `"line"` | `"plane"`)
- Feld `homography: Option<Vec<f64>>`
- Entsprechend in `ProjectState` ergänzen
- Roundtrip-Test um Plane-Daten erweitern (bestehenden Test updaten)
- `greet`-Boilerplate-Funktion entfernen

**Aufwand:** 30 min

### A2 — Frontend `CalibrationState` erweitern  
**Datei:** `src/lib/persistence.ts`
- `type: 'line' | 'plane'` hinzufügen
- `homography: number[] | null` hinzufügen
- `calibrationToState()` erweitern (Homographie-Matrix serialisieren)
- Neue Funktion `stateToCalibration()` schreiben (reverses Mapping)
- `ProjectState` Interface aktualisieren

**Aufwand:** 30 min

### A3 — `loadProjectState()` reparieren
**Datei:** `src/lib/components/CalibrationCanvas.svelte`
- `stateToCalibration()` nutzen, damit Plane-Kalibrierung korrekt rekonstruiert wird
- `calibrationType` aus geladener Kalibrierung wiederherstellen
- `planePoints` aus geladener Kalibrierung wiederherstellen (schwierig, da Punkte nicht gespeichert werden — Kompromiss: Plane-Modus aus `type`-Feld erkennen, Punkte nicht rekonstruieren, Nutzer muss neu kalibrieren)

**Aufwand:** 30 min

### A4 — Tests für den Fix
**Datei:** `src/lib/persistence.test.ts`
- Test: Plane-Kalibrierung serialisieren/deserialisieren
- Test: Roundtrip über `calibrationToState` → `stateToCalibration`
- Falls `persistence.test.ts` nicht existiert, neuen Test anlegen

**Aufwand:** 30 min

**Abhängigkeiten:** A1 → A2 → A3 → A4

---

## B: E2E-Test-Lücken (P0, ~6h)

### B1 — Neuer Spec: `interactions.spec.ts`
**Datei:** `e2e/interactions.spec.ts`

Testfälle:
- **Scroll-Zoom:** Mausrad auf Canvas → `stageScale` ändert sich (über `window.__e2e` oder indirekt über visuelle Änderung prüfen)
- **Space+Drag Pan:** `keyboard.down('Space')` → Cursor wird `grab` → `mouse.move` + `mouse.down` + `mouse.move` → Cursor `grabbing` → `mouse.up` → Position geändert
- **„Reset Ansicht"** Button: Nach Zoom/Pan → Button klicken → zurück zu scale=1, position=0,0
- **Anchor-Drag Referenzlinie:** Linie zeichnen → Start-Anker greifen → verschieben → Kalibrierung aktualisiert sich
- **Anchor-Drag Messung:** Messung zeichnen → auswählen → End-Anker verschieben → Länge ändert sich in Sidebar
- **Modus-Wechsel Plane → Line:** Plane auf „line" zurückschalten → UI zeigt wieder „Keine Referenzlinie"

**Aufwand:** 2h

### B2 — Neuer Spec: `loupe.spec.ts`
**Datei:** `e2e/loupe.spec.ts`

Testfälle:
- **Loupe erscheint beim Zeichnen:** Testbild laden → `mouse.move` auf Canvas → `.loupe`-Element wird sichtbar
- **Loupe folgt Cursor:** Position des `.loupe`-Elements ändert sich bei Mausbewegung
- **Loupe verschwindet nach mouseup:** Linie fertig → `.loupe` nicht mehr sichtbar
- **Loupe bei Anchor-Drag:** Referenzlinie gezeichnet → Anchor greifen (`mousedown` auf Anchor-Koordinaten) → Loupe sichtbar → `mouseup` → Loupe weg
- **Loupe-Struktur:** `.loupe` enthält `.crosshair`-Element

**Aufwand:** 1.5h

### B3 — Neuer Spec: `edge-cases.spec.ts`
**Datei:** `e2e/edge-cases.spec.ts`

Testfälle:
- **Zero-length Referenzlinie:** Kurzer Drag (< 5px) → kein „✓ Reference line drawn" (wird von `useKonva` gefiltert)
- **realWorldLength = 0:** Eingabe `0` → keine Scale-Anzeige (Kalibrierung wird nicht berechnet)
- **„Clear line"** Button: Linie zeichnen → Clear klicken → „Keine Referenzlinie" sichtbar
- **„Clear plane"** Button: 4 Punkte setzen → Clear klicken → „Keine Referenzfläche (0/4)"
- **Messmodus ohne Kalibrierung:** Keine Referenzlinie → „Add Measurement Line" Button ist nicht sichtbar
- **Export-Button nur mit Messungen:** Ohne Messungen → kein „Export CSV" Button → Messungen hinzufügen → Button erscheint
- **Delete via Keyboard bei keiner Selektion:** `Delete` drücken ohne selektierte Messung → keine Änderung

**Aufwand:** 1.5h

### B4 — Sidebar-Zustände in bestehende Specs integrieren
**Datei:** `e2e/app.spec.ts` erweitern

- **Project-Badge:** `saveStatus`-Text nach Testbild laden prüfen („Testbild geladen")
- **Image-Badge:** Bild-Pfad erscheint in Badge
- **Empty-State:** Message erscheint wenn keine Messungen vorhanden („Zeichne zuerst die Referenzlinie")
- **Calibration-Hinweis:** Nach Kalibrierung erscheint „Klicke oben auf Messung hinzufügen"

**Aufwand:** 30 min

### B5 — Loupe/Interaction-Tests in `app.spec.ts` integrieren
**Datei:** `e2e/app.spec.ts`

- Testbild-Laden-Test: zusätzlich Loupe-Sichtbarkeit prüfen
- `pforte-fuersthof.jpg`-Test: Loupe prüfen

**Aufwand:** 30 min

**Abhängigkeiten:** B3 und B4 benötigen den Plane-Persistenz-Fix (A) für korrekte States. B1 und B2 sind unabhängig.

---

## C: Code-Cleanup (P1, ~1h)

### C1 — `greet`-Boilerplate entfernen
**Datei:** `src-tauri/src/lib.rs`
- `greet`-Funktion und Handler-Registrierung entfernen
- Entsprechendes `invoke('greet')` im Frontend suchen und entfernen (falls vorhanden)

**Aufwand:** 10 min

### C2 — `jsconfig Kopie.json` löschen
**Datei:** `jsconfig Kopie.json`
- Datei löschen
- Prüfen ob in `.gitignore` (falls nicht, hinzufügen)

**Aufwand:** 5 min

### C3 — Ungenutzte Imports prüfen
**Dateien:** alle `.ts`/`.svelte` Dateien
- `pnpm check` ausführen (svelte-check + TypeScript)
- Warnungen beheben

**Aufwand:** 15 min

### C4 — Rust-Clippy-Warnungen beheben
**Datei:** `src-tauri/src/lib.rs`
- `cargo clippy` ausführen
- Warnungen beheben
- `cargo fmt` ausführen

**Aufwand:** 15 min

### C5 — `tauri.conf.json` aufräumen
- `identifier` prüfen (aktuell: `de.referenzmass.app` — korrekt)
- Fenster-Icon-Pfade prüfen

**Aufwand:** 5 min

**Abhängigkeiten:** Keine. Parallelisierbar.

---

## D: CalibrationCanvas Refactoring (P1, ~4h)

**Problem:** 1100 Zeilen Monolith — Canvas-Logik, Persistenz, Bild-Handling, Keyboard-Handling in einer Datei.

### D1 — Canvas-Composable extrahieren: `useCanvasState.svelte.ts`
**Datei:** `src/lib/composables/useCanvasState.svelte.ts` (neu)

Herausziehen:
- Zoom/pan State (`stageScale`, `stageX`, `stageY`, `stageRef`)
- `handleStageTransform()`
- `resetZoomPan()`
- Loupe State (`loupePointerX`, `loupePointerY`, `loupeVisible`, `isDraggingAnchor`)
- `handleDrawingPointerMove()`
- `updateLoupeFromAnchor()`

**Aufwand:** 1h

### D2 — Bild-Manager extrahieren: `useImageManager.svelte.ts`
**Datei:** `src/lib/composables/useImageManager.svelte.ts` (neu)

Herausziehen:
- `currentImagePath`, `currentKonvaImage`, `loadedImageSrc`
- `imageX`, `imageY`, `imageWidth`, `imageHeight`
- `loadImage()`
- `loadImageIntoLayer()`
- `handleLoadImage()`
- `loadTestImage()`

**Aufwand:** 1h

### D3 — Persistenz-Logik extrahieren: `useProjectPersistence.svelte.ts`
**Datei:** `src/lib/composables/useProjectPersistence.svelte.ts` (neu)

Herausziehen:
- `saveStatus`, `currentProjectName`
- `handleSaveProject()`
- `handleLoadProject()`
- `handleExportMeasurements()`
- `loadProjectState()`

**Aufwand:** 1h

### D4 — CalibrationCanvas.svelte verschlanken
**Datei:** `src/lib/components/CalibrationCanvas.svelte`

Nach Extraktion verbleiben:
- Core State: `referenceStart`, `referenceEnd`, `calibration`, `error`
- `calibrationType`, `planePoints`, `realWorldHeight`
- Measurements State: `measurements`, `measurementMode`, `selectedMeasurementId`
- `redrawMeasurements()` — größte verbleibende Funktion (~200 Zeilen)
- `handleReferenceLineComplete()`, `handlePlanePointAdded()`, etc.
- `$effect`-Blöcke für Reaktivität

Ziel: ~400–500 Zeilen

**Aufwand:** 1h

**Abhängigkeiten:** D1, D2, D3 parallel → D4 als Integration. B1–B5 sollten vorher geschrieben sein, da Refactoring bestehende Selektoren beeinflussen kann.

---

## E: Unit-Tests für UI-Komponenten (P2, ~3h)

### E1 — WorkspaceSidebar Unit-Tests
**Datei:** `src/lib/components/WorkspaceSidebar.test.ts` (neu)

Testfälle (Vitest + jsdom):
- Rendert alle Buttons (Load Image, Testbild, Save, Load Project)
- Rendert Calibration-Controls (Referenzlänge, Unit-Select)
- Calibration-Mode-Select funktioniert
- Zeigt „Keine Referenzlinie" wenn `hasReferenceLine=false`
- Zeigt „✓ Reference line drawn" wenn `hasReferenceLine=true`
- Zeigt Messungen-Liste mit korrekter Anzahl
- Export-Button nur sichtbar wenn `measurements.length > 0`
- Empty-State wenn keine Messungen
- `onSelectMeasurement` wird bei Klick aufgerufen
- `onDeleteMeasurement` wird bei ✕-Klick aufgerufen
- `onClearReferenceLine` wird bei Button-Klick aufgerufen
- Projekt-Badge zeigt Dateinamen
- Image-Badge zeigt Dateinamen

**Aufwand:** 1.5h

### E2 — MagnifierLoupe Unit-Tests
**Datei:** `src/lib/components/MagnifierLoupe.test.ts` (neu)

Testfälle (Vitest + jsdom):
- Nicht gerendert wenn `visible=false`
- Nicht gerendert wenn `imageSrc=null`
- Gerendert wenn `visible=true` und `imageSrc` gesetzt
- Enthält `.crosshair`-Element
- `background-image` CSS enthält korrekte URL
- Position (`left`, `top`) entspricht `pointerX`, `pointerY`
- `background-size` entspricht `dispW * magnification`, `dispH * magnification`

**Aufwand:** 45 min

### E3 — Homographie-Edge-Case-Tests (ergänzend)
**Datei:** `src/lib/homography.test.ts` (falls nicht existent) oder in bestehenden Test integrieren

- Test: 4 kollineare Punkte → `computeHomography` wirft Error
- Test: 3 identische Punkte → Error
- Test: `projectPoint` mit Punkt im Unendlichen → Error
- Test: Umkehrbarkeit (roundtrip) src→dst→src

**Aufwand:** 45 min

**Abhängigkeiten:** E1 und E2 erfordern D (Refactoring), falls API-Signaturen sich ändern. Sonst unabhängig.

---

## F: CSV-Export E2E-Test (P2, ~1h)

### F1 — Download-Handler für Export testen
**Datei:** `e2e/measurements.spec.ts` erweitern

- Playwright `page.waitForEvent('download')` vor Export-Button-Klick
- `page.on('download', ...)` registrieren
- Exportierten Dateiinhalt parsen und validieren:
  - Header-Zeilen beginnen mit `#`
  - CSV-Header: `ID,Start X,Start Y,End X,End Y,Length,Unit,Label,Notes`
  - Anzahl Datenzeilen = Anzahl Messungen
  - Werte innerhalb plausibler Bereiche

**Aufwand:** 1h

**Abhängigkeiten:** Keine. Läuft im Browser, kein Tauri-Dialog nötig.

---

## G: Undo/Redo (P3, optional, ~4h)

### G1 — Command-Pattern Stack
**Datei:** `src/lib/history.ts` (neu)

- `HistoryEntry` Interface: `{ undo: () => void; redo: () => void; description: string }`
- `HistoryStack` Klasse: `push()`, `undo()`, `redo()`, `clear()`, `canUndo`, `canRedo`
- In CalibrationCanvas integrieren (als Composable oder direkt)

**Aufwand:** 1h

### G2 — Undoable Actions definieren
- Referenzlinie setzen / ändern
- Plane-Punkt setzen
- Messung hinzufügen / löschen / verschieben
- Messung Label/Notes ändern (debounced)
- Calibration-Parameter ändern (debounced)

**Aufwand:** 1.5h

### G3 — Keyboard-Shortcuts & UI
- `Ctrl+Z` / `Cmd+Z` → Undo
- `Ctrl+Shift+Z` / `Cmd+Shift+Z` → Redo
- Undo/Redo Buttons in Toolbar (optional)
- Footer-Hint erweitern

**Aufwand:** 1.5h

**Abhängigkeiten:** G1 → G2 → G3. Unabhängig von anderen Tasks.

---

## Abhängigkeitsgraph

```
A1 → A2 → A3 → A4     (Plane-Persistenz)
                    ↘
B3, B4 ───────────────→ (Edge-Case E2E-Tests, brauchen korrekte States)
                    
B1, B2, B5              (Interactions, Loupe — unabhängig)

C1-C5                   (Cleanup — unabhängig, jederzeit)

D1, D2, D3 → D4        (Refactoring)
                  ↘
E1, E2 ───────────────→ (Unit-Tests für Komponenten)

F1                      (CSV-Export — unabhängig)

G1 → G2 → G3           (Undo/Redo — unabhängig)
```

---

## Reihenfolge-Empfehlung

| Sprint | Tasks | Dauer | Ziel |
|---|---|---|---|
| **1** | A1–A4, C1–C5 | ~3h | Bug-Fix + Cleanup |
| **2** | B1–B5 | ~6h | E2E-Coverage schließen |
| **3** | F1, E3 | ~2h | CSV-Export-Test + Homographie-Tests |
| **4** | D1–D4 | ~4h | Refactoring |
| **5** | E1–E2 | ~2h | Komponenten-Tests |
| **6** | G1–G3 | ~4h | Undo/Redo (optional) |

**Kritischer Pfad:** Sprint 1 → Sprint 2 (B3, B4 brauchen A)

---

## Risiken

| Risiko | Mitigation |
|---|---|
| Anchor-Dragging in E2E schwer zu simulieren | Exakte Koordinaten mit `boundingBox` berechnen, `{ force: true }` für `mouse.down` |
| Loupe-Sichtbarkeit timing-sensitiv | `waitForTimeout` + `waitForSelector` kombinieren |
| Refactoring bricht bestehende E2E-Tests | E2E-Tests vor Refactoring schreiben (Sprint 2 vor Sprint 4) |
| Plane-Punkt-Rekonstruktion aus gespeichertem State nicht möglich | Akzeptieren: Plane-Modus wird erkannt, aber Nutzer muss neu kalibrieren nach Load |
| Playwright `page.on('download')` funktioniert nicht mit Tauri-Dialogen | CSV-Export verwendet `writeTextFile` + `save` Dialog — Download-Handler greift nicht, da kein HTTP-Download. Stattdessen: Export-Button-Klick + visuelle Bestätigung prüfen, oder Mock-Layer für `save`-Dialog einbauen. |
