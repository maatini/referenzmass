<script lang="ts">
  import '../lib/theme.css';
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

<main class="app-container">
  <CalibrationCanvas
    bind:realWorldLength
    bind:unit
    onCalibrationChange={handleCalibrationChange}
  />
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
    background-color: var(--bg-app);
  }

  .app-container {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
</style>
