# ReferenzMaß — Kantendetektions-Plan

> Stand: 2026-05-23 | Feature: Edge Detection & Snap-to-Edge

---

## Motivation

Die aktuelle ReferenzMaß-Anwendung erfordert präzise manuelle Platzierung von Kalibrierungspunkten und Messlinien-Endpunkten. Gerade bei hochauflösenden Bildern oder feinen Strukturen ist es schwierig, den Cursor exakt auf die gewünschte Kante zu setzen. Eine Kantendetektion mit Snap-Funktionalität würde:

- Die Messgenauigkeit erhöhen (Pixel-perfekte Kantenplatzierung)
- Den Workflow beschleunigen (kein manuelles Heranzoomen nötig)
- Die Loupe-Funktionalität ergänzen (Edge-Snap + Loupe = präzises Arbeiten)

---

## Feature-Übersicht

| # | Feature | Beschreibung |
|---|---|---|
| E1 | Canny Edge Detection (Rust) | Bilder werden per Canny-Algorithmus analysiert; Edge-Map wird als binäre Maske/Set von Kantenpunkten berechnet |
| E2 | Edge-Overlay (Canvas) | Semi-transparente Visualisierung der detektierten Kanten auf dem Konva-Canvas (toggle via Sidebar/Keyboard) |
| E3 | Snap-to-Edge Modus | Beim Zeichnen von Referenzlinien, Plane-Punkten und Messlinien rastet der Cursor an die nächstgelegene Kante ein (konfigurierbarer Snap-Radius) |
| E4 | Snap-Indikator (Loupe) | Die Loupe zeigt visuell an, wenn ein Snap-Punkt aktiv ist (Fadenkreuz wechselt Farbe, Snap-Punkt wird markiert) |

---

## Architekturentscheidung: Rust vs. Frontend

### Option A: Rust-Backend (`image` crate) — **Empfohlen**

| Pro | Contra |
|---|---|
| Hochperformant, auch bei großen Bildern (12 MP+) | Neuer Tauri-Command + Boilerplate |
| Canny-Implementierung über `imageproc` crate (etabliert, kampferprobt) | Edge-Ergebnisse müssen serialisiert und ans Frontend übertragen werden |
| Entlastet den UI-Thread | ~15 MB zusätzliche Crate-Dependencies |
| Kann später für weitere CV-Features (Linien-Detektion, automatische Referenzerkennung) erweitert werden | |

### Option B: Reines Frontend (Canvas `getImageData`)

| Pro | Contra |
|---|---|
| Keine Rust-Änderungen nötig | Langsam bei großen Bildern (blockiert UI-Thread) |
| Einfachere Integration (kein IPC) | Canny muss manuell implementiert werden (kein std-lib-equivalent) |
| Direkter Zugriff auf Pixel-Daten im WebView | Weniger erweiterbar für zukünftige CV-Features |

**Entscheidung: Option A (Rust)**, da die App bereits Tauri nutzt, die Rust-Integration etabliert ist und die Performance für Produktiv-Workflows kritisch ist.

---

## Technisches Design

### Architektur-Überblick

```
┌────────────────────────────────────────────────┐
│  Frontend (Svelte 5 + Konva)                   │
│                                                 │
│  ┌──────────────────┐   ┌───────────────────┐  │
│  │ WorkspaceSidebar │   │ CalibrationCanvas │  │
│  │  - Edge Toggle   │   │  - EdgeOverlay    │  │
│  │  - Snap Radius   │   │  - Snap Logic     │  │
│  └────────┬─────────┘   │  - Loupe Snap-Ind │  │
│           │             └────────┬──────────┘  │
│           │                      │              │
│  ┌────────┴──────────────────────┴──────────┐  │
│  │         useEdgeDetection.svelte.ts        │  │
│  │  - detectEdges(path) → EdgePoint[]        │  │
│  │  - findSnapPoint(cursor, edges, radius)   │  │
│  │  - edgeLOD (Auflösungs-abhängig)          │  │
│  └──────────────────┬───────────────────────┘  │
│                     │ Tauri invoke()            │
└─────────────────────┼───────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────┐
│  Rust Backend (src-tauri/src/edge_detection.rs) │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  pub fn detect_edges(                       │  │
│  │    image_path: &str,                        │  │
│  │    low_threshold: f64,   // default 50.0    │  │
│  │    high_threshold: f64,  // default 150.0   │  │
│  │    downsample: u32,      // default 1       │  │
│  │  ) -> Result<EdgeDetectionResult, String>   │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Canny Pipeline:                                 │
│  1. image::open(path) → DynamicImage             │
│  2. .grayscale() → GrayImage                     │
│  3. Optional: .resize() bei downsample > 1       │
│  4. Gaussian blur (σ=1.4)                        │
│  5. Sobel gradients → magnitude + direction      │
│  6. Non-maximum suppression                      │
│  7. Double thresholding                          │
│  8. Edge tracking by hysteresis                  │
│  9. Ergebnis: Vec<EdgePoint> + Meta              │
└──────────────────────────────────────────────────┘
```

### Datenfluss

```
1. Nutzer lädt Bild → loadImage(path)
2. Automatisch/Auf Knopfdruck: invoke('detect_edges', { imagePath, ... })
3. Rust: Bild laden → Canny → Edge-Punkte extrahieren
4. Response: { edges: [{x,y}], width, height, downsample, elapsed_ms }
5. Frontend: Edge-Punkte im useEdgeDetection-Composable cachen
6. Canvas: Edge-Overlay rendern (optional, toggle)
7. Bei Mausbewegung: findSnapPoint(cursorPos, edges, snapRadius)
8. Wenn Snap gefunden → Cursor-Position auf Snap-Punkt setzen
9. Loupe: Snap-Indikator anzeigen
```

---

## Datenstrukturen

### Rust

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EdgePoint {
    pub x: u32,
    pub y: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EdgeDetectionResult {
    pub edges: Vec<EdgePoint>,
    pub image_width: u32,
    pub image_height: u32,
    /// Downsample-Faktor (1 = Originalauflösung)
    pub downsample: u32,
    /// Verarbeitungszeit in Millisekunden
    pub elapsed_ms: u64,
    /// Anzahl gefundener Edge-Pixel
    pub edge_count: u32,
}
```

### TypeScript

```typescript
export interface EdgePoint {
  x: number;
  y: number;
}

export interface EdgeDetectionResult {
  edges: EdgePoint[];
  imageWidth: number;
  imageHeight: number;
  downsample: number;
  elapsedMs: number;
  edgeCount: number;
}

export interface SnapResult {
  point: Point;
  distance: number; // Pixel-Distanz vom Cursor zum Snap-Punkt
}
```

---

## Snap-Algorithmus

```
findSnapPoint(cursorPos, edges, snapRadius):
  1. Spatial Index aufbauen (Grid/Quadtree) — O(1) Lookup
  2. Nur Edge-Punkte im snapRadius-Fenster um cursorPos betrachten
  3. Nächstgelegenen Edge-Punkt per euklidischer Distanz finden
  4. Wenn Distanz ≤ snapRadius → { point, distance } zurückgeben
  5. Sonst → null (kein Snap)
```

### Spatial Index

Da Edge-Punkte statisch sind (ändern sich nur bei neuem Bild/neuem Threshold), wird ein Lookup-Grid vorberechnet:

```
Grid-Zellgröße = snapRadius (z.B. 10px)
grid: Map<string, EdgePoint[]>  // key = `${cellX},${cellY}`

findSnapPoint:
  cellX = floor(cursorPos.x / snapRadius)
  cellY = floor(cursorPos.y / snapRadius)
  candidates = grid[cellX,cellY] + 8 Nachbarzellen
  → min distance unter candidates
```

### Level-of-Detail (Downsampling)

Bei großen Bildern (>8 MP) werden die Edge-Punkte automatisch heruntergerechnet:

| Bildgröße | Downsample | Edge-Punkte (ca.) |
|---|---|---|
| ≤ 2 MP | 1 (Original) | ~50k–200k |
| 2–8 MP | 2 | ~25k–100k |
| 8–20 MP | 4 | ~12k–50k |
| > 20 MP | 8 | ~6k–25k |

Der Snap-Algorithmus rechnet die Cursor-Position entsprechend um.

---

## UI/UX Design

### Sidebar-Erweiterung

In `WorkspaceSidebar.svelte`, neue Sektion "Kantenerkennung":

```
┌─────────────────────────────┐
│ KANTENERKENNUNG             │
│                             │
│ [✓] Kanten-Overlay          │
│ [✓] Snap-to-Edge            │
│                             │
│ Snap-Radius: [───●───] 10px │
│                             │
│ Threshold Low:  [──●──] 50  │
│ Threshold High: [───●─] 150 │
│                             │
│ [  Kanten erkennen  ]       │
│ Edge-Punkte: 47.231         │
│ Verarbeitung: 342 ms        │
└─────────────────────────────┘
```

### Canvas-Integration

- **Edge Overlay**: Halbtransparente rote Linien auf einem eigenen Konva-Layer, unter den Messlinien, über dem Bild
- **Snap Cursor**: Beim Zeichnen wird der Cursor magnetisch an die nächste Kante gezogen; visuelles Feedback: temporärer Kreis am Snap-Punkt
- **Loupe**: Fadenkreuz wird grün (#10b981) wenn Snap aktiv; zeigt Snap-Punkt als kleinen grünen Kreis

### Keyboard-Shortcuts

| Shortcut | Aktion |
|---|---|
| `E` | Kanten-Overlay togglen |
| `S` | Snap-to-Edge togglen |
| `Shift + Ziehen` | Snap temporär deaktivieren (override) |

---

## Implementierungsplan

### Phase 1: Rust Edge Detection (3h)

#### E1.1 — `image` + `imageproc` Dependencies
**Datei:** `src-tauri/Cargo.toml`

```toml
image = "0.25"
imageproc = "0.25"
```

**Aufwand:** 15 min

#### E1.2 — `edge_detection.rs` Modul
**Datei:** `src-tauri/src/edge_detection.rs` (neu)

Implementierung:
- `fn detect_edges(image_path, low_threshold, high_threshold, downsample) -> EdgeDetectionResult`
- Canny-Pipeline: grayscale → gaussian blur → sobel → nms → hysteresis
- Downsampling vor Canny für Performance
- Fehlerbehandlung (Datei nicht gefunden, ungültiges Format)

**Aufwand:** 1.5h

#### E1.3 — Tauri Command registrieren
**Datei:** `src-tauri/src/lib.rs`

```rust
#[tauri::command]
fn detect_edges(
    image_path: String,
    low_threshold: f64,
    high_threshold: f64,
    downsample: u32,
) -> Result<EdgeDetectionResult, String> {
    edge_detection::detect_edges(&image_path, low_threshold, high_threshold, downsample)
}

// In run():
.manage(/* ... */)
.invoke_handler(tauri::generate_handler![detect_edges])
```

**Aufwand:** 15 min

#### E1.4 — Rust Unit Tests
**Datei:** `src-tauri/src/edge_detection.rs` (inline, `#[cfg(test)]`)

Tests:
- Testbild mit klaren Kanten (Schachbrett-ähnlich) → Edge-Punkte vorhanden
- Leeres/gleichfarbiges Bild → 0 Edge-Punkte
- `downsample` Parameter: weniger Punkte bei höherem Faktor
- Ungültiger Pfad → Error
- Roundtrip: Ergebnis serialisieren/deserialisieren

**Aufwand:** 45 min

---

### Phase 2: Frontend Integration (3h)

#### E2.1 — `useEdgeDetection.svelte.ts` Composable
**Datei:** `src/lib/composables/useEdgeDetection.svelte.ts` (neu)

```typescript
export function useEdgeDetection() {
  let edgeData = $state<EdgeDetectionResult | null>(null);
  let edgeOverlayVisible = $state(false);
  let snapEnabled = $state(false);
  let snapRadius = $state(10);
  let lowThreshold = $state(50);
  let highThreshold = $state(150);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // Spatial index für schnelle Snap-Lookups
  let spatialIndex: Map<string, EdgePoint[]> | null = $state(null);

  async function detectEdges(imagePath: string): Promise<void> { /* ... */ }
  function buildSpatialIndex(edges: EdgePoint[], cellSize: number): void { /* ... */ }
  function findSnapPoint(cursorX: number, cursorY: number): SnapResult | null { /* ... */ }
  function clearEdges(): void { /* ... */ }

  return {
    edgeData, edgeOverlayVisible, snapEnabled, snapRadius,
    lowThreshold, highThreshold, isLoading, error,
    detectEdges, findSnapPoint, clearEdges,
  };
}
```

**Aufwand:** 1.5h

#### E2.2 — Edge-Overlay in CalibrationCanvas integrieren
**Datei:** `src/lib/components/CalibrationCanvas.svelte`

- Neuer Konva-Layer (`edgeLayer`) für das Edge-Overlay
- Rendering der Edge-Punkte als `Konva.Line` mit `globalCompositeOperation: 'screen'`
- `$effect`-Block: wenn `edgeData` oder `edgeOverlayVisible` ändert → Overlay zeichnen/verstecken
- LOD: Bei `stageScale < 0.5` nur jede n-te Kante rendern (Performance)

**Aufwand:** 1h

#### E2.3 — Snap-to-Edge in `useKonva.ts` integrieren
**Datei:** `src/lib/actions/useKonva.ts`

- Neuer Config-Parameter: `snapEnabled`, `findSnapPoint`
- In `handleDrawingPointerMove`: wenn Snap aktiv, Cursor-Position durch `findSnapPoint` ersetzen
- In `startDrawing`: Snap-Punkt als Startpunkt verwenden
- In `finishDrawing`: Snap-Punkt als Endpunkt verwenden
- `Shift`-Key override in `handleKeyDown`/`handleKeyUp`

**Aufwand:** 1h

#### E2.4 — Loupe Snap-Indikator
**Datei:** `src/lib/components/MagnifierLoupe.svelte`

- Neue Prop: `snapActive: boolean`
- Wenn `snapActive === true`: Fadenkreuz grün, kleiner Snap-Punkt-Kreis
- CSS-Transition für Farbwechsel (0.15s)

**Aufwand:** 30 min

---

### Phase 3: Sidebar & UX (1.5h)

#### E3.1 — WorkspaceSidebar Kantenerkennungs-Sektion
**Datei:** `src/lib/components/WorkspaceSidebar.svelte`

- Neue Props: `edgeData`, `edgeOverlayVisible`, `snapEnabled`, `snapRadius`, `lowThreshold`, `highThreshold`, `edgeLoading`, `edgeError`
- Callbacks: `onToggleEdgeOverlay`, `onToggleSnap`, `onSnapRadiusChange`, `onThresholdChange`, `onDetectEdges`
- UI: Toggle-Switches, Range-Slider für Snap-Radius, Number-Inputs für Thresholds, "Kanten erkennen" Button, Stats-Anzeige

**Aufwand:** 1h

#### E3.2 — Verkabelung in CalibrationCanvas
**Datei:** `src/lib/components/CalibrationCanvas.svelte`

- `useEdgeDetection()` einbinden
- Props an WorkspaceSidebar durchreichen
- Edge-Daten aus `useEdgeDetection` an `useKonva` und `MagnifierLoupe` übergeben
- Auto-Detection: wenn `loadImage()` aufgerufen wird, nach 500ms Debounce automatisch `detectEdges` auslösen
- Keyboard-Shortcuts `E` und `S` registrieren

**Aufwand:** 30 min

---

### Phase 4: Tests (2h)

#### E4.1 — Rust Integrationstest
- Existierender `detect_edges` Tauri-Command Unit-Test erweitern
- Test mit realem Bild aus `pforte-fuersthof.jpg`

**Aufwand:** 30 min

#### E4.2 — `useEdgeDetection` Unit Tests
**Datei:** `src/lib/composables/useEdgeDetection.test.ts` (neu)

Tests (Vitest):
- `buildSpatialIndex`: korrekte Grid-Zellen
- `findSnapPoint`: Snap innerhalb Radius → gefunden
- `findSnapPoint`: Snap außerhalb Radius → null
- `findSnapPoint`: Grid-Lookup zieht Nachbarzellen heran
- `clearEdges` setzt alles zurück

**Aufwand:** 45 min

#### E4.3 — E2E Edge Detection Tests
**Datei:** `e2e/edge-detection.spec.ts` (neu)

Testfälle:
- **Edge Toggle:** Testbild laden → Kanten erkennen → Edge-Overlay Toggle auf sichtbar prüfen
- **Edge Overlay schaltet aus:** Toggle auf unsichtbar → kein Edge-Layer
- **Snap Toggle:** Edge-Erkennung + Snap aktivieren → Cursor snapped (via `window.__e2e` State prüfen)
- **Snap-Indikator in Loupe:** Zeichnen mit Snap → `.loupe` Fadenkreuz hat Snap-Klasse
- **Snap Override mit Shift:** Shift+Ziehen → kein Snap (Cursor exakt an Mausposition)
- **Ohne Bild kein Edge:** Kein Bild geladen → "Kanten erkennen" Button inaktiv / kein Error
- **Downsample-Performance:** Großes Testbild → Erkennung in < 2s

**Aufwand:** 45 min

---

### Phase 5: Polish (1h)

#### E5.1 — Performance-Optimierung
- Edge-Punkte als `Float32Array` statt Objekt-Array für weniger GC-Druck
- `requestIdleCallback` für Edge-Overlay Rendering bei >50k Punkten
- Edge-Detection läuft in Tauri async (nicht blockierend)

**Aufwand:** 30 min

#### E5.2 — Edge Visual Styling
- Farbe: `rgba(16, 185, 129, 0.35)` (grün, passend zum Snap-Indikator)
- Opazität dynamisch basierend auf Zoom-Level (bei starkem Zoom: transparenter)
- Glow-Effekt via `shadowBlur` und `shadowColor` für bessere Sichtbarkeit auf dunklen Bildern

**Aufwand:** 30 min

---

## Abhängigkeitsgraph

```
E1.1 → E1.2 → E1.3 → E1.4     (Rust Canny)
                           ↘
E2.1 ─────────────────────────→ (Frontend Composable)
                           ↘
E2.2, E2.3, E2.4 ─────────────→ (Canvas + Konva + Loupe)
                           ↘
E3.1, E3.2 ───────────────────→ (Sidebar + Verkabelung)
                           ↘
E4.1, E4.2, E4.3 ─────────────→ (Tests)
                           ↘
E5.1, E5.2 ───────────────────→ (Polish)
```

---

## Sprint-Planung

| Sprint | Phase | Tasks | Dauer | Meilenstein |
|---|---|---|---|---|
| **Edge-1** | Phase 1 | E1.1–E1.4 | ~3h | Rust Canny Edge Detection funktioniert |
| **Edge-2** | Phase 2–3 | E2.1–E2.4, E3.1–E3.2 | ~4.5h | Snap + Overlay + Sidebar integriert |
| **Edge-3** | Phase 4 | E4.1–E4.3 | ~2h | Vollständige Test-Coverage |
| **Edge-4** | Phase 5 | E5.1–E5.2 | ~1h | Performance & Visual Polish |

**Gesamtaufwand: ~10.5h**

---

## Risiken

| Risiko | Mitigation |
|---|---|
| `imageproc` Crate nicht mit aktueller `image`-Version kompatibel | `image = "0.24"` als Fallback, oder manuelle Canny-Implementierung (Sobel ist trivial) |
| Edge-Punkte-Daten zu groß für IPC-Transfer (>10 MB JSON) | Downsampling + `Float32Array` binary encoding über Tauri custom protocol |
| Konva Performance bei >100k Edge-Linien | LOD: bei Zoom <50% nur jede 2./4./8. Kante rendern; Edge-Overlay nur bei Zoom >25% sichtbar |
| Snap stört bei feinen Strukturen (falsche Kanten) | Snap-Radius konfigurierbar (Default 10px); Shift-Override; visuelles Feedback vor endgültigem Platzieren |
| Canny-Parameter schwer zu finden für unbedarfte Nutzer | Gute Defaults (50/150); Presets ("Fein", "Normal", "Grob"); Echtzeit-Preview bei Threshold-Änderung |

---

## Offene Fragen

1. **Soll die Kantenerkennung automatisch nach jedem Bild-Ladevorgang ausgeführt werden oder nur auf expliziten Button-Klick?**
   - Empfehlung: Auto-Detection mit 500ms Debounce nach `loadImage()`, plus manueller Button für Re-Detection mit neuen Parametern.

2. **Soll der Snap-Modus global (für alle Zeichenoperationen) oder nur für Messlinien gelten?**
   - Empfehlung: Global, aber für Plane-Punkte mit sanfterem Snap (größerer Radius, da Ecken oft unschärfer sind).

3. **Edge-Detection-Parameter pro Projekt speichern?**
   - Empfehlung: Ja, als Teil des `ProjectState` persistieren (Thresholds, Snap-Radius, Toggles).

4. **Soll es eine "Auto-Kalibrierung" geben (z.B. Referenzrechteck per Edge-Detection finden)?**
   - Empfehlung: Als Phase 6 / separates Feature planen. MVP = Snap-to-Edge.

---

## Nächste Schritte

1. Entscheidung über offene Fragen einholen
2. Sprint Edge-1 starten: `imageproc` Crate evaluieren, ggf. Alternativen prüfen
3. Rust-Prototyp mit `pforte-fuersthof.jpg` testen
4. Bei Problemen mit `imageproc`: manuelle Canny-Implementierung (ca. 200 Zeilen Rust, gut dokumentiert)
