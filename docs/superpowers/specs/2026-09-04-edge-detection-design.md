# Edge Detection — Variante A (Maske + Snap)

Stand: 2026-09-04 · Freigaben: Produkt A, Dual-IPC, Button-only, Snap überall, Maske statt Punktliste.

Ersetzt für die Implementierung den Snapshot `docs/edge-detection-plan.md` (2026-05-23). Der Mai-Plan bleibt Historie.

## Ziel

Canny in einem isolierten Rust-Worker. Overlay auf dem Canvas. Snap-to-Edge beim Setzen von Kalibrier- und Messpunkten. Steuerung in der Sidebar.

Messungen sollen an sichtbaren Kanten einrasten, ohne dass der WebView Canny rechnet und ohne `CalibrationCanvas.svelte` wieder zur God-Datei wird.

## Nicht-Ziele

- Kanten-Parameter oder Maske in `ProjectState` / Save-Load
- Auto-Kalibrierung, Linien-Fit, Referenz automatisch legen
- Canny nach Bildladen oder Threshold-Slider (nur Button)
- Canny im Frontend (`getImageData` am Foto)
- `downsample` im IPC
- Shift-Override für Snap
- OpenCV, extra CV-Worker-Prozess, Stack-Wechsel
- Persistenz-P0, Koordinatenraum, Composable-Schnitt, Konva-Typen erneut anfassen

## Entscheidungen

| Thema | Festlegung |
|---|---|
| Worker | Rust `image` + `imageproc::edges::canny` |
| Pixel-Eingang | Dual: `path` XOR `imageBase64` |
| Trigger | Sidebar-Button „Kanten erkennen“ |
| Snap-Ort | Linie, Ebene (4 Punkte), neue Messung, Anchor-Drag |
| Ergebnis | PNG-Graustufen-Maske (Kante = 255), nicht `{x,y}[]` |
| Koordinaten | Originalbild-Pixel, wie der Rest der App |
| Radius | Sidebar in Bildschirm-Pixeln; intern `/ stageScale` |
| Nach Erfolg | Overlay an, Snap an; erneuter Lauf lässt Toggles |
| Bildwechsel | Maske, Overlay, Snap-Lookup verwerfen |
| Shortcuts | `E` Overlay, `S` Snap, nur mit Maske, nicht in Inputs |

## Architektur

```
WorkspaceSidebar  ──onDetectEdges──►  useEdgeDetection  ──invoke──►  detect_edges (Rust)
        ▲                                    │
        │ flags/stats                        ├── mask PNG → edgeLayer (Konva.Image, rot)
        │                                    ├── decode → Uint8Array
        │                                    └── findSnapPoint  ◄── edges.ts (UI-frei)
CalibrationCanvas verdrahtet nur
useKonva.snapPointer + Anchor-Drag nutzen dieselbe Snap-Funktion
MagnifierLoupe.snapActive
```

| Einheit | Datei | Tut | Hängt an |
|---|---|---|---|
| Worker | `src-tauri/src/edge_detection.rs` | Datei oder Bytes → Canny → PNG-Maske | `image`, `imageproc` |
| Command | `src-tauri/src/lib.rs` | `detect_edges` registrieren | Worker |
| Domain | `src/lib/edges.ts` | Typen, `findSnapPoint`, Screen→Bild-Radius | nichts UI |
| Composable | `src/lib/composables/useEdgeDetection.svelte.ts` | Invoke, Cache, Overlay-Image, Flags, Generation-Counter | Tauri invoke, `edges.ts` |
| Zeichen | `src/lib/actions/useKonva.ts` | `edgeLayer`; `snapPointer?: (pos) => pos` | Caller |
| Copy | `WorkspaceSidebar.svelte` | Sektion Kantenerkennung | Props |
| Loupe | `MagnifierLoupe.svelte` | `snapActive` | Prop |
| Tasten | `src/lib/keyboard.ts` | `E`/`S` analog zu Delete | `isTextEntryTarget` |

`CalibrationCanvas.svelte` orchestriert: Composable anlegen, Sidebar-Props, `snapPointer` in die Konva-Config, Anchor-Positionen vor `moveMeasurementAnchor` / Referenz-Update snappen, Loupe-Flag, Overlay auf `edgeLayer` legen, bei Bildwechsel `clearEdges()`. Keine Canny- oder Distanzmathe in der Svelte-Datei.

Domain bleibt UI-frei: kein Konva/Svelte in `edges.ts`.

## IPC

Kein Feld in `ProjectState`. Keine Änderung an `fixtures/project-*.camelCase.json`.

```text
invoke('detect_edges', { request }) → DetectEdgesResult
```

Fehler wie Save/Load: `Result<_, String>`.

### Request (`#[serde(rename_all = "camelCase")]`)

| JSON | Rust | Regel |
|---|---|---|
| `path` | `Option<String>` | Dateipfad, wenn `currentImagePath` gesetzt |
| `imageBase64` | `Option<String>` | Bilddatei-Bytes (JPEG/PNG/…) Base64, **ohne** `data:`-Prefix |
| `lowThreshold` | `f32` | Default 50 |
| `highThreshold` | `f32` | Default 150 |

Genau eines von `path` / `imageBase64`. Beide oder keines → `"provide exactly one of path or imageBase64"`.

`low > high` → intern tauschen.

Base64, nicht `Vec<u8>`: Serde/JSON würde Bytes als Zahlenarray serialisieren.

Frontend-Bytes: `loadedImageSrc` ist `data:` → Prefix strippen. Sonst Originalpixel der `HTMLImage` (Natural Size, nicht Stage-Fit) als PNG/JPEG Base64. Nie die gefittete Konva-Ansicht.

### Response (`camelCase`)

| JSON | Bedeutung |
|---|---|
| `width` / `height` | Maske = Quellbild in Originalpixeln |
| `maskBase64` | PNG 8-bit Luma, Kante 255, Rest 0 |
| `edgeCount` | Anzahl Pixel ≠ 0 |
| `elapsedMs` | Canny-Zeit in ms |

Kein `downsample`.

### Rust-Pipeline

1. `image::open(path)` oder `image::load_from_memory(decoded_base64)`
2. Graustufen
3. `imageproc::edges::canny(&gray, low, high)` — intern Gaussian σ=1.4, Sobel, NMS, Hysterese
4. PNG der Binary-Maske encoden, `edge_count` zählen, Zeit messen

Thresholds sind **imageproc-Einheiten** (Gradientstärke bis ~1140), nicht OpenCV-0–255. Defaults 50/150 wie im Mai-Plan; ein Fixture-Test muss auf dem synthetischen Testbild sichtbare Kanten liefern. Defaults nicht an die 0–255-Skala „anpassen“, ohne den Test zu ändern.

Command-Signatur:

```rust
#[tauri::command]
fn detect_edges(request: DetectEdgesRequest) -> Result<DetectEdgesResult, String>
```

`invoke_handler![ping, save_project, load_project, detect_edges]`.

### Fehlerstrings (Englisch, wie bestehende Commands)

- `"provide exactly one of path or imageBase64"`
- Datei unlesbar / Decode fehlgeschlagen (bestehende `format!(...)`-Form)
- `"image has zero size"`

Frontend ohne geladenes Bild: kein Invoke, Status „Kein Bild geladen“. Invoke-/Decode-Fehler: `flashStatus` mit der Meldung. In Vite ohne Tauri (E2E) darf der Button nicht uncaught crashen.

### Race

Jedes Invoke erhöht einen Generation-Counter. Bildwechsel oder `clearEdges` invalidiert. Antwort mit alter Generation verwerfen. Antwort, deren `width`/`height` nicht zum aktuellen Bild passen, verwerfen und Status setzen.

## Snap, Overlay, Sidebar

### `findSnapPoint`

```ts
findSnapPoint(cursor: Point, mask: EdgeMask, radiusImagePx: number): Point | null
```

`EdgeMask`: `{ data: Uint8Array, width: number, height: number }` — 1 Byte/Pixel, 255 = Kante.

Suche im achsenparallelen Fenster um den Cursor, Distanz euklidisch, Treffer nur wenn Distanz ≤ Radius. Gleichstand: kleinere `y`, dann kleinere `x`. Integer-Pixel. Kein Spatial-Index (Fenster ist klein).

`radiusImagePx = snapRadiusScreen / stageScale` (Default Screen-Radius **10**), analog zur 5-px-Ziehschwelle. `stageScale <= 0` → kein Snap.

Ohne Maske, Snap aus, oder kein Treffer → `null`; Caller behält den Originalpunkt.

### Wo Snap sitzt

`useKonvaConfig.snapPointer?: (pos: Point) => Point` — Identität, wenn nicht gesetzt. Aufruf in `startDrawing`, `updateDrawing`, `finishDrawing` und vor `onPlanePointAdded`.

Anchor-Drag in `CalibrationCanvas` (Referenzlinie, Plane-Punkte, Messungs-Anker): dieselbe Funktion, **bevor** `moveMeasurementAnchor` / Referenz-State geschrieben wird. Live-Vorschau snapt ebenfalls.

Kein Snap während Space-Pan.

### Overlay

`useKonva` legt drei Layer an: `mainLayer` (Bild), `edgeLayer` (Maske), `drawingLayer` (Linien/Anker). `UseKonvaReturn` bekommt `edgeLayer`.

Nach Decode: Offscreen-Canvas, rote Pixel wo Maske ≠ 0, `Konva.Image` auf `edgeLayer`, Opacity ~0.6, `listening: false`. Das `getImageData` hier liest die **Maske**, nicht das Foto.

Toggle setzt `edgeLayer.visible`. Canny läuft nicht neu. Kein Overlay ohne Maske.

### Loupe

Neue optionale Prop `snapActive = false`. Wenn true: Fadenkreuz `#10b981`, kleiner Kreis am Mittelpunkt.

### Sidebar

Sektion „Kantenerkennung“, `data-testid="edge-tools"`:

- Button „Kanten erkennen“ (Disabled + Loading-Text während Invoke)
- Checkbox Overlay
- Checkbox Snap-to-Edge
- Slider Snap-Radius (Screen-px)
- Slider/Number Low + High Threshold (nur lokaler State bis zum Button)
- Zeile `Kantenpixel` und `ms`, sobald ein Ergebnis da ist

Copy Deutsch. Checkboxen ohne Maske erlaubt, aber wirkungslos.

Nach **erfolgreichem** ersten Lauf in einer Bild-Session: Overlay an, Snap an. Weiteres Erkennen ändert Toggles nicht.

### Tastatur

In `keyboard.ts`, gleiches Duck-Typing wie Delete:

- `shouldToggleEdgeOverlayOnKey(event, hasMask)` — Taste `e`/`E`, keine Ctrl/Meta/Alt, nicht in Textfeldern, nur `hasMask`
- `shouldToggleSnapOnKey` — analog `s`/`S`

Canvas registriert die Listener neben Delete.

## Tests

Playwright gegen Vite beweist **kein** natives Canny. Nicht so tun.

### Rust (`edge_detection` + Serde)

Synthetisches Bild im Test bauen (z. B. schwarzes Feld, weißes Rechteck). **Nicht** `pforte-fuersthof.jpg`.

- Bytes-Zweig: PNG in Memory → `detect_edges` → `edgeCount > 0`, PNG-Maske dekodierbar, `width`/`height` = Quelle
- Pfad-Zweig: dieselbe PNG in Tempdatei
- weder / beide Quellen → Fehler
- unlesbarer Pfad / Müll-Bytes → Fehler
- einfarbiges Bild → `edgeCount == 0`
- `low > high` → vertauscht, trotzdem Ok
- JSON-Keys Request **und** Result: `path`, `imageBase64`, `lowThreshold`, `highThreshold`, `maskBase64`, `edgeCount`, `elapsedMs` — analog `serialized_project_state_uses_camel_case_keys`

### Vitest

- `edges.test.ts`: Treffer, Miss außerhalb Radius, Gleichstand (y dann x), leere Maske, `radiusImagePx` aus Screen/Scale
- `keyboard.test.ts`: `E`/`S` togglen mit Maske; nicht in input/textarea/select/contenteditable; nicht ohne Maske; nicht mit Ctrl/Meta/Alt
Kein jsdom-Zwang für `edges.ts` (pure Funktionen, Default-Environment `node`).

### E2E

- Sektion `edge-tools` sichtbar (Button „Kanten erkennen“)
- Bestehende Flows (Laden, Kalibrieren, Messen, Delete) dürfen nicht brechen
- Button nicht als IPC-Beweis klicken, oder Klick muss den fehlenden Tauri-Command schlucken
- Keine neuen Tests, die natives `detect_edges` erwarten
- `E`/`S` nicht in bestehenden Specs drücken

## Dateien (Implementierung)

**Neu:** `src-tauri/src/edge_detection.rs`, `src/lib/edges.ts`, `src/lib/edges.test.ts`, `src/lib/composables/useEdgeDetection.svelte.ts`, Keyboard-Tests erweitern.

**Ändern:** `Cargo.toml` (`image`, `imageproc` kompatibel, Ziel 0.25), `lib.rs`, `useKonva.ts`, `CalibrationCanvas.svelte` (nur verdrahten), `WorkspaceSidebar.svelte`, `MagnifierLoupe.svelte`, `keyboard.ts`, nach Landung `HANDOFF.md` / `AGENTS.md`.

**Nicht anfassen:** `persistence.ts` / Rust `ProjectState`, Fixtures `project-*.camelCase.json`, `pforte-fuersthof.jpg`, Composable-Schnitt der bestehenden drei Canvas-Composables außer Aufruf von `clearEdges` bei Load.

## Reihenfolge

1. Domain `findSnapPoint` + Vitest (ohne Rust)
2. Rust Canny Dual + Serde-Tests, Command registrieren
3. `useEdgeDetection` Invoke + Generation-Counter
4. `edgeLayer` + Overlay, Sidebar-Sektion, Button
5. `snapPointer` + Anchor-Snap + Loupe
6. Keyboard `E`/`S`
7. `pnpm check:all`; gezieltes E2E für Sidebar-Sichtbarkeit plus Regression

## Erfolg

- Native App: Foto oder Testbild → Button → Overlay → Punkte rasten an Kanten; Kalibrierung und Messung
- `pnpm test` und `pnpm test:rust` grün; `pnpm check` nicht schlechter als jetzt
- E2E-Suite bleibt grün ohne nativen Worker
- `CalibrationCanvas.svelte` wächst nur um Verdrahtung, nicht um Algorithmus
