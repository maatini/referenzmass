import { convertFileSrc } from '@tauri-apps/api/core';
import Konva from 'konva';
import { createTestCalibrationImage } from '../testImage';

export function useImageManager(opts: {
  getMainLayer: () => Konva.Layer | null;
  getCanvasSize: () => { width: number; height: number };
  fitToImage: (size: { width: number; height: number }) => void;
  flashStatus: (message: string | null, timeoutMs?: number) => void;
}) {
  let currentImagePath = $state<string | null>(null);
  let currentKonvaImage = $state<Konva.Image | null>(null);
  let loadedImageSrc = $state<string | null>(null);
  let imageX = $state(0);
  let imageY = $state(0);
  let imageWidth = $state(0);
  let imageHeight = $state(0);

  function loadImageIntoLayer(src: string) {
    const mainLayer = opts.getMainLayer();
    if (!mainLayer) return;
    loadedImageSrc = src;

    if (currentKonvaImage) {
      currentKonvaImage.destroy();
      currentKonvaImage = null;
    }

    const kContainer = document.querySelector('[data-testid="konva-container"]');
    if (kContainer) kContainer.removeAttribute('data-has-bg-image');

    const img = new Image();
    img.onload = () => {
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;

      imageX = 0;
      imageY = 0;
      imageWidth = naturalW;
      imageHeight = naturalH;

      const konvaImage = new Konva.Image({
        image: img,
        x: 0,
        y: 0,
        width: naturalW,
        height: naturalH,
      });
      mainLayer.add(konvaImage);
      currentKonvaImage = konvaImage;
      opts.fitToImage({ width: naturalW, height: naturalH });

      const marker = document.querySelector('[data-testid="konva-container"]');
      if (marker) marker.setAttribute('data-has-bg-image', 'true');
    };
    img.onerror = () => {
      console.error('Image load failed for src:', src);
      opts.flashStatus('Bild konnte nicht geladen werden (evtl. Berechtigungsproblem)', 3500);
    };
    img.src = src;
  }

  function loadImage(pathOrDataUrl: string) {
    const looksLikeWebSrc =
      pathOrDataUrl.startsWith('data:') ||
      pathOrDataUrl.startsWith('http://') ||
      pathOrDataUrl.startsWith('https://') ||
      pathOrDataUrl.startsWith('blob:');

    if (looksLikeWebSrc) {
      currentImagePath = null;
      loadImageIntoLayer(pathOrDataUrl);
      return;
    }

    currentImagePath = pathOrDataUrl;
    loadImageIntoLayer(convertFileSrc(pathOrDataUrl));
  }

  async function handleLoadImage() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp'] },
        ],
      });

      if (selected && !Array.isArray(selected)) {
        loadImage(selected);
        opts.flashStatus('Bild geladen', 2000);
      }
    } catch (err) {
      console.error(err);
      opts.flashStatus(`Bild laden fehlgeschlagen: ${err}`, 2000);
    }
  }

  function loadTestImage() {
    const { width, height } = opts.getCanvasSize();
    const dataUrl = createTestCalibrationImage(width, height);
    loadImage(dataUrl);
    currentImagePath = null;
    opts.flashStatus('Testbild geladen', 1500);
  }

  function rememberPath(path: string | null) {
    currentImagePath = path;
  }

  return {
    get currentImagePath() {
      return currentImagePath;
    },
    get currentKonvaImage() {
      return currentKonvaImage;
    },
    get loadedImageSrc() {
      return loadedImageSrc;
    },
    get imageX() {
      return imageX;
    },
    get imageY() {
      return imageY;
    },
    get imageWidth() {
      return imageWidth;
    },
    get imageHeight() {
      return imageHeight;
    },
    loadImage,
    loadImageIntoLayer,
    handleLoadImage,
    loadTestImage,
    rememberPath,
  };
}
