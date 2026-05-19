<script lang="ts">
  import CalibrationCanvas from '../lib/components/CalibrationCanvas.svelte';
  import type { Calibration } from '../lib/calibration';

  // Reference length controls (passed to canvas for calibration)
  let realWorldLength: number = $state(10);
  let unit: 'mm' | 'cm' | 'm' = $state('cm');

  // Track current calibration (optional)
  let currentCalibration: Calibration | null = $state(null);

  function handleCalibrationChange(c: Calibration | null) {
    currentCalibration = c;
  }
</script>

<main>
  <header>
    <div class="header-content">
      <h1>ReferenzMaß</h1>
      <div class="reference-controls">
        <label>
          Referenzlänge:
          <input
            type="number"
            bind:value={realWorldLength}
            min="0.001"
            step="0.1"
          />
        </label>
        <select bind:value={unit}>
          <option value="mm">mm</option>
          <option value="cm">cm</option>
          <option value="m">m</option>
        </select>
        <span class="hint">← zuerst Referenzlinie auf dem Bild zeichnen</span>
      </div>
    </div>
  </header>

  <div class="canvas-wrapper">
    <CalibrationCanvas
      width={920}
      height={680}
      {realWorldLength}
      {unit}
      onCalibrationChange={handleCalibrationChange}
    />
  </div>
</main>

<style>
  :root {
    font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.5;
    color: #222;
    background-color: #f5f5f5;
  }

  main {
    padding: 12px 16px;
    max-width: 980px;
    margin: 0 auto;
  }

  header {
    margin-bottom: 10px;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
  }

  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    color: #111;
  }

  .reference-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }

  .reference-controls label {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .reference-controls input {
    width: 90px;
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
  }

  .reference-controls select {
    padding: 4px 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
  }

  .hint {
    color: #666;
    font-size: 13px;
    margin-left: 8px;
  }

  .canvas-wrapper {
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    padding: 12px;
  }

  /* Make sure the canvas component's internal buttons look decent */
  :global(.persistence-tools button),
  :global(.measurement-tools button) {
    font-size: 13px;
    padding: 4px 10px;
  }
</style>
