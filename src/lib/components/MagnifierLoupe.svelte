<script lang="ts">
  interface Props {
    imageSrc: string | null;
    pointerX: number; // Cursor X relative to container
    pointerY: number; // Cursor Y relative to container
    imageX: number; // Left position of image inside stage
    imageY: number; // Top position of image inside stage
    imageWidth: number; // Rendered width of image inside stage
    imageHeight: number; // Rendered height of image inside stage
    stageScale: number; // Current canvas zoom scale
    stageX: number; // Current canvas pan X
    stageY: number; // Current canvas pan Y
    visible: boolean;
    magnification?: number;
  }

  let {
    imageSrc,
    pointerX,
    pointerY,
    imageX,
    imageY,
    imageWidth,
    imageHeight,
    stageScale,
    stageX,
    stageY,
    visible,
    magnification = 3
  }: Props = $props();

  // Derive display values of the image in container space
  const dispX = $derived(imageX * stageScale + stageX);
  const dispY = $derived(imageY * stageScale + stageY);
  const dispW = $derived(imageWidth * stageScale);
  const dispH = $derived(imageHeight * stageScale);

  // Offset of cursor relative to the image
  const offsetX = $derived(pointerX - dispX);
  const offsetY = $derived(pointerY - dispY);

  // Loupe dimensions
  const loupeWidth = 130;
  const loupeHeight = 130;
  const halfW = loupeWidth / 2;
  const halfH = loupeHeight / 2;

  // Background CSS values
  const bgSizeX = $derived(dispW * magnification);
  const bgSizeY = $derived(dispH * magnification);
  const bgPosX = $derived(-(offsetX * magnification - halfW));
  const bgPosY = $derived(-(offsetY * magnification - halfH));

  // Determine positioning of loupe container so it doesn't cover the cursor itself
  // Typically offset slightly up and to the right/left
  const loupeLeft = $derived(pointerX - halfW);
  const loupeTop = $derived(pointerY - loupeHeight - 20); // 20px above cursor
</script>

{#if visible && imageSrc && dispW > 0 && dispH > 0}
  <div
    class="loupe"
    style="
      left: {loupeLeft}px;
      top: {loupeTop}px;
      width: {loupeWidth}px;
      height: {loupeHeight}px;
      background-image: url('{imageSrc}');
      background-size: {bgSizeX}px {bgSizeY}px;
      background-position: {bgPosX}px {bgPosY}px;
    "
  >
    <!-- Crosshair in the center of the loupe -->
    <div class="crosshair"></div>
  </div>
{/if}

<style>
  .loupe {
    position: absolute;
    border-radius: 50%;
    border: 3px solid var(--brand, #3b82f6);
    box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.3));
    pointer-events: none; /* Let clicks pass through */
    background-repeat: no-repeat;
    background-color: #111;
    z-index: 100;
    box-sizing: border-box;
  }

  .crosshair {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 8px;
    height: 8px;
    border: 1.5px solid #fff;
    background: #ff5722;
    border-radius: 50%;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
  }
</style>
