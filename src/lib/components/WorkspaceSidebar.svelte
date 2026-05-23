<script lang="ts">
  import type { Unit, CalibrationType } from '../calibration';
  import type { Measurement } from '../measurements';
  import type { Point } from '../geometry';

  interface Props {
    realWorldLength: number;
    unit: Unit;
    calibration: { scale: number; unit: Unit } | null;
    measurements: Measurement[];
    selectedMeasurementId: string | null;
    currentProjectName: string | null;
    currentImagePath: string | null;
    saveStatus: string | null;
    hasReferenceLine: boolean;
    calibrationType: CalibrationType;
    realWorldHeight: number;
    planePoints: Point[];

    onSaveProject: () => void;
    onLoadProject: () => void;
    onExportMeasurements: () => void;
    onLoadImage: () => void;
    onLoadTestImage: () => void;
    onClearReferenceLine: () => void;
    onSelectMeasurement: (id: string | null) => void;
    onDeleteMeasurement: (id: string) => void;
  }

  let {
    realWorldLength = $bindable(),
    unit = $bindable(),
    calibration,
    measurements = $bindable(),
    selectedMeasurementId = $bindable(),
    currentProjectName,
    currentImagePath,
    saveStatus,
    hasReferenceLine,
    calibrationType = $bindable(),
    realWorldHeight = $bindable(),
    planePoints,
    onSaveProject,
    onLoadProject,
    onExportMeasurements,
    onLoadImage,
    onLoadTestImage,
    onClearReferenceLine,
    onSelectMeasurement,
    onDeleteMeasurement
  }: Props = $props();
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <h2 class="app-title">ReferenzMaß</h2>
    <div class="status-indicator">
      {#if currentProjectName}
        <span class="badge project-badge" title={currentProjectName}>
          📄 {currentProjectName}
        </span>
      {/if}
      {#if currentImagePath}
        <span class="badge image-badge" title={currentImagePath}>
          🖼️ {currentImagePath.split('/').pop()}
        </span>
      {/if}
    </div>
  </div>

  <div class="sidebar-scroll">
    <!-- File Actions Section -->
    <section class="section">
      <h3 class="section-title">Projekt & Datei</h3>
      <div class="button-grid" data-testid="persistence-tools">
        <button onclick={onLoadImage} class="btn btn-secondary">
          Load Image
        </button>
        <button onclick={onLoadTestImage} class="btn btn-secondary">
          Testbild laden
        </button>
        <button onclick={onSaveProject} class="btn btn-primary">
          Save Project
        </button>
        <button onclick={onLoadProject} class="btn btn-secondary">
          Load Project
        </button>
      </div>

      {#if saveStatus}
        <div class="toast-message">{saveStatus}</div>
      {/if}
    </section>

    <!-- Calibration Settings Section -->
    <section class="section">
      <h3 class="section-title">Kalibrierung</h3>
      
      <div class="input-group" style="margin-bottom: 8px;">
        <label for="calib-type">Kalibrierungsmodus</label>
        <select id="calib-type" bind:value={calibrationType} class="select-unit" style="width: 100%;">
          <option value="line">2D Line (Linearer Maßstab)</option>
          <option value="plane">3D Plane (Flächen-Homographie)</option>
        </select>
      </div>

      {#if calibrationType === 'line'}
        <div class="input-group">
          <label for="ref-len">Referenzlänge</label>
          <div class="input-row">
            <input
              id="ref-len"
              type="number"
              bind:value={realWorldLength}
              min="0.001"
              step="0.1"
              class="input-number"
              aria-label="Referenzlänge"
            />
            <select bind:value={unit} class="select-unit" aria-label="Einheit">
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </div>
        </div>
      {:else}
        <div class="input-group">
          <label for="ref-width">Referenz-Breite (X)</label>
          <div class="input-row">
            <input
              id="ref-width"
              type="number"
              bind:value={realWorldLength}
              min="0.001"
              step="0.1"
              class="input-number"
              aria-label="Referenz-Breite"
            />
            <select bind:value={unit} class="select-unit" aria-label="Einheit">
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </div>
        </div>
        <div class="input-group" style="margin-top: 8px;">
          <label for="ref-height">Referenz-Höhe (Y)</label>
          <input
            id="ref-height"
            type="number"
            bind:value={realWorldHeight}
            min="0.001"
            step="0.1"
            class="input-number"
            aria-label="Referenz-Höhe"
          />
        </div>
      {/if}

      <div class="calibration-state">
        {#if calibrationType === 'line'}
          {#if hasReferenceLine}
            <div class="state-indicator success">
              <span class="dot"></span> ✓ Reference line drawn
            </div>
            <button onclick={onClearReferenceLine} class="btn btn-danger btn-xs">
              Clear line
            </button>
          {:else}
            <div class="state-indicator warning">
              <span class="dot"></span> Keine Referenzlinie
            </div>
            <p class="hint">Klicke und ziehe eine Linie auf dem Bild, um den Maßstab zu kalibrieren.</p>
          {/if}
        {:else}
          {#if planePoints.length === 4}
            <div class="state-indicator success">
              <span class="dot"></span> ✓ Reference plane calibrated
            </div>
            <button onclick={onClearReferenceLine} class="btn btn-danger btn-xs">
              Clear plane
            </button>
          {:else}
            <div class="state-indicator warning">
              <span class="dot"></span> Keine Referenzfläche ({planePoints.length}/4)
            </div>
            <p class="hint">Klicke auf die 4 Ecken der Referenzfläche im Bild (Reihenfolge: oben-links, oben-rechts, unten-rechts, unten-links).</p>
          {/if}
        {/if}

        {#if calibration}
          <div class="scale-display">
            {#if calibration.type === 'plane'}
              Mode: <strong>3D Plane (Homography)</strong>
            {:else}
              Scale: <strong>{calibration.scale.toFixed(4)}</strong> {calibration.unit}/px
            {/if}
          </div>
        {/if}
      </div>
    </section>

    <!-- Measurements List Section -->
    <section class="section flex-grow">
      <div class="section-header">
        <h3 class="section-title">Messungen ({measurements.length})</h3>
        {#if measurements.length > 0}
          <button onclick={onExportMeasurements} class="btn btn-success btn-xs">
            Export CSV
          </button>
        {/if}
      </div>

      {#if measurements.length === 0}
        <div class="empty-state">
          {#if calibration}
            <p>Klicke oben auf "Messung hinzufügen" und ziehe Linien auf dem Bild, um Abstände zu messen.</p>
          {:else}
            <p>Zeichne zuerst die Referenzlinie, um Messungen durchzuführen.</p>
          {/if}
        </div>
      {:else}
        <div class="measurements-list">
          {#each measurements as m, i (m.id)}
            <div
              class="measurement-card"
              class:selected={m.id === selectedMeasurementId}
              onclick={() => onSelectMeasurement(m.id)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { onSelectMeasurement(m.id); } }}
              role="button"
              tabindex="0"
            >
              <div class="card-header">
                <span class="card-index">#{i + 1}</span>
                <input
                  type="text"
                  class="card-label-input"
                  placeholder="Bezeichnung..."
                  bind:value={m.label}
                  onclick={(e) => e.stopPropagation()}
                  aria-label="Bezeichnung"
                />
                <strong class="card-length">
                  {m.realLength.toFixed(2)} {m.unit}
                </strong>
                <button
                  onclick={(e) => { e.stopPropagation(); onDeleteMeasurement(m.id); }}
                  class="btn-delete"
                  title="Löschen"
                  aria-label="Löschen"
                >
                  ✕
                </button>
              </div>
              <textarea
                class="card-notes-input"
                placeholder="Notizen hinzufügen..."
                bind:value={m.notes}
                onclick={(e) => e.stopPropagation()}
                rows={2}
                aria-label="Notizen"
              ></textarea>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</aside>

<style>
  .sidebar {
    width: 320px;
    height: 100vh;
    background: var(--bg-panel);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-right: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-lg);
    box-sizing: border-box;
    z-index: 10;
  }

  .sidebar-header {
    padding: 16px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .app-title {
    font-family: var(--font-heading);
    font-size: 22px;
    font-weight: 800;
    margin: 0 0 8px 0;
    background: linear-gradient(135deg, var(--brand-hover), var(--accent));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: -0.5px;
  }

  .status-indicator {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .badge {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    max-width: 100%;
    box-sizing: border-box;
  }

  .project-badge {
    background: rgba(59, 130, 246, 0.15);
    color: var(--brand-hover);
    border: 1px solid rgba(59, 130, 246, 0.25);
  }

  .image-badge {
    background: rgba(255, 87, 34, 0.15);
    color: var(--accent-hover);
    border: 1px solid rgba(255, 87, 34, 0.25);
  }

  .sidebar-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    box-sizing: border-box;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-title {
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
    margin: 0;
  }

  .button-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  /* Premium Buttons */
  .btn {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    outline: none;
    text-align: center;
  }

  .btn-primary {
    background: var(--brand);
    color: white;
  }
  .btn-primary:hover {
    background: var(--brand-hover);
    box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
  }

  .btn-secondary {
    background: var(--bg-element);
    color: var(--text-primary);
    border-color: var(--border-subtle);
  }
  .btn-secondary:hover {
    background: var(--bg-element-hover);
    border-color: var(--text-secondary);
  }

  .btn-danger {
    background: rgba(239, 68, 68, 0.15);
    color: var(--error);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  .btn-danger:hover {
    background: rgba(239, 68, 68, 0.25);
  }

  .btn-success {
    background: rgba(16, 185, 129, 0.15);
    color: var(--success);
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
  .btn-success:hover {
    background: rgba(16, 185, 129, 0.25);
  }

  .btn-xs {
    padding: 3px 8px;
    font-size: 11px;
    border-radius: 4px;
  }

  .toast-message {
    font-size: 11px;
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.05);
    padding: 6px 10px;
    border-radius: 4px;
    border-left: 3px solid var(--brand);
  }

  /* Form Elements */
  .input-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .input-group label {
    font-size: 11px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .input-row {
    display: flex;
    gap: 6px;
  }

  .input-number {
    flex: 1;
    background: var(--bg-element);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    color: var(--text-primary);
    padding: 6px 8px;
    font-size: 13px;
    outline: none;
  }
  .input-number:focus {
    border-color: var(--border-focus);
  }

  .select-unit {
    background: var(--bg-element);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    color: var(--text-primary);
    padding: 6px;
    font-size: 13px;
    outline: none;
    cursor: pointer;
  }
  .select-unit:focus {
    border-color: var(--border-focus);
  }

  /* Calibration states */
  .calibration-state {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
    background: rgba(255, 255, 255, 0.02);
    padding: 10px;
    border-radius: 6px;
    border: 1px solid var(--border-subtle);
  }

  .state-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 500;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .success .dot { background: var(--success); }
  .success { color: var(--success); }

  .warning .dot { background: var(--accent); }
  .warning { color: var(--accent); }

  .hint {
    font-size: 11px;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.4;
  }

  .scale-display {
    font-size: 12px;
    background: rgba(59, 130, 246, 0.1);
    padding: 6px 8px;
    border-radius: 4px;
    border-left: 2px solid var(--brand);
  }

  /* Measurement Cards */
  .measurements-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .measurement-card {
    background: var(--bg-element);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-sizing: border-box;
    width: 100%;
  }
  .measurement-card:hover {
    border-color: var(--text-muted);
    transform: translateY(-1px);
  }

  .measurement-card.selected {
    background: rgba(245, 158, 11, 0.08);
    border-color: var(--accent-selected);
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.15);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .card-index {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
  }

  .card-label-input {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 1px dashed var(--text-muted);
    color: var(--text-primary);
    font-size: 12px;
    padding: 1px 2px;
    outline: none;
    min-width: 0;
  }
  .card-label-input:focus {
    border-bottom-style: solid;
    border-color: var(--brand);
  }

  .card-length {
    font-size: 12px;
    color: var(--text-primary);
    white-space: nowrap;
  }
  .measurement-card.selected .card-length {
    color: var(--accent-selected);
  }

  .btn-delete {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    padding: 0 4px;
    transition: color 0.2s;
  }
  .btn-delete:hover {
    color: var(--error);
  }

  .card-notes-input {
    background: rgba(0, 0, 0, 0.15);
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: 11px;
    padding: 4px;
    outline: none;
    resize: none;
    width: 100%;
    box-sizing: border-box;
  }
  .card-notes-input:focus {
    border-color: var(--border-subtle);
    background: rgba(0, 0, 0, 0.25);
  }

  .empty-state {
    text-align: center;
    padding: 24px 12px;
    color: var(--text-muted);
    font-size: 12px;
    border: 1px dashed var(--border-subtle);
    border-radius: 8px;
  }

  .empty-state p {
    margin: 0;
    line-height: 1.4;
  }

  .flex-grow {
    flex: 1;
  }
</style>
