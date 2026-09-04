import { fitView } from '../geometry';
import type { Size } from '../geometry';

type StageLike = {
  scale: (value: { x: number; y: number }) => void;
  position: (value: { x: number; y: number }) => void;
  width: (value: number) => void;
  height: (value: number) => void;
  scaleX: () => number;
  x: () => number;
  y: () => number;
  draw: () => void;
  batchDraw: () => void;
};

export function useCanvasState() {
  let stageScale = $state(1);
  let stageX = $state(0);
  let stageY = $state(0);
  let stageRef = $state<StageLike | null>(null);

  let loupePointerX = $state(0);
  let loupePointerY = $state(0);
  let loupeVisible = $state(false);
  let isDraggingAnchor = false;

  let canvasWidth = $state(800);
  let canvasHeight = $state(600);

  function handleStageTransform(scale: number, x: number, y: number) {
    stageScale = scale;
    stageX = x;
    stageY = y;
  }

  function handleDrawingPointerMove(pos: { x: number; y: number } | null) {
    if (isDraggingAnchor) return;
    if (pos) {
      loupePointerX = pos.x;
      loupePointerY = pos.y;
      loupeVisible = true;
    } else {
      loupeVisible = false;
    }
  }

  function updateLoupeFromAnchor(anchor: { position: () => { x: number; y: number } }) {
    const pos = anchor.position();
    loupePointerX = pos.x * stageScale + stageX;
    loupePointerY = pos.y * stageScale + stageY;
    loupeVisible = true;
  }

  function applyView(scale: number, x: number, y: number, after?: () => void) {
    stageScale = scale;
    stageX = x;
    stageY = y;
    if (stageRef) {
      stageRef.scale({ x: scale, y: scale });
      stageRef.position({ x, y });
      stageRef.batchDraw();
    }
    after?.();
  }

  function resetZoomPan(after?: () => void) {
    applyView(1, 0, 0, after);
  }

  function fitImageToCanvas(imageSize: Size, after?: () => void) {
    if (!stageRef || !imageSize.width || !imageSize.height) return;
    const view = fitView(
      { width: canvasWidth, height: canvasHeight },
      imageSize
    );
    applyView(view.scale, view.x, view.y, after);
  }

  function resizeStage(width: number, height: number) {
    canvasWidth = width;
    canvasHeight = height;
    if (!stageRef) return;
    stageRef.width(width);
    stageRef.height(height);
    stageRef.draw();
  }

  function attachStage(stage: StageLike) {
    stageRef = stage;
    stageScale = stage.scaleX();
    stageX = stage.x();
    stageY = stage.y();
  }

  return {
    get stageScale() {
      return stageScale;
    },
    get stageX() {
      return stageX;
    },
    get stageY() {
      return stageY;
    },
    get stageRef() {
      return stageRef;
    },
    get loupePointerX() {
      return loupePointerX;
    },
    get loupePointerY() {
      return loupePointerY;
    },
    get loupeVisible() {
      return loupeVisible;
    },
    set loupeVisible(value: boolean) {
      loupeVisible = value;
    },
    get isDraggingAnchor() {
      return isDraggingAnchor;
    },
    set isDraggingAnchor(value: boolean) {
      isDraggingAnchor = value;
    },
    get canvasWidth() {
      return canvasWidth;
    },
    get canvasHeight() {
      return canvasHeight;
    },
    handleStageTransform,
    handleDrawingPointerMove,
    updateLoupeFromAnchor,
    resetZoomPan,
    fitImageToCanvas,
    resizeStage,
    attachStage,
  };
}
