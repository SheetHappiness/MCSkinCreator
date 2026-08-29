import type { RgbaColor, SkinDocument } from '../../engine/document';
import {
  ERASER_COLOR,
  beginPixelStroke,
  fillAt,
  samplePixel,
  type EditorTool,
  type PixelStroke,
} from '../../engine/tools';
import type { DocumentHistory } from '../../engine/history';
import type { SkinPickResult } from '../../renderers/three';
import type { ColorSlot } from '../editor/editorToolStore';
import { getToolOptions } from '../editor/toolOptions';

interface SurfaceIdentity {
  readonly model: SkinPickResult['model'];
  readonly bodyPart: SkinPickResult['bodyPart'];
  readonly layer: SkinPickResult['layer'];
  readonly face: SkinPickResult['face'];
}

function surfaceIdentity(pick: SkinPickResult): SurfaceIdentity {
  return {
    model: pick.model,
    bodyPart: pick.bodyPart,
    layer: pick.layer,
    face: pick.face,
  };
}

function sameSurface(
  left: SurfaceIdentity | undefined,
  right: SkinPickResult,
): boolean {
  return (
    left !== undefined &&
    left.model === right.model &&
    left.bodyPart === right.bodyPart &&
    left.layer === right.layer &&
    left.face === right.face
  );
}

/**
 * Adapts P00 structural hits to the existing exact 2D tool semantics. A
 * single drag owns one PixelStroke transaction, while interpolation is reset
 * whenever the hit leaves its canonical cube surface.
 */
export class ThreeDToolInteraction {
  private stroke: PixelStroke | undefined;
  private pointerId: number | undefined;
  private previousSurface: SurfaceIdentity | undefined;

  constructor(
    private readonly document: SkinDocument,
    private readonly history: DocumentHistory,
    private readonly setColor: (slot: ColorSlot, color: RgbaColor) => void,
  ) {}

  pointerDown(
    pointerId: number,
    button: number,
    pick: SkinPickResult | undefined,
    tool: EditorTool,
    color: RgbaColor,
    colorSlot: ColorSlot = 'primary',
  ): boolean {
    if (button !== 0 || pick === undefined) return false;

    this.cancel();

    if (tool === 'eyedropper') {
      const options = getToolOptions('eyedropper');
      if (
        options.sample === 'single-texel' &&
        options.target === 'active-color'
      ) {
        this.setColor(colorSlot, samplePixel(this.document, pick));
      }
      return true;
    }

    if (tool === 'fill') {
      const options = getToolOptions('fill');
      if (options.mode === 'contiguous' && options.match === 'exact-rgba') {
        fillAt(this.document, this.history, pick, color);
      }
      return true;
    }

    const strokeColor =
      tool === 'eraser' && getToolOptions('eraser').output === 'transparent'
        ? ERASER_COLOR
        : color;
    this.stroke = beginPixelStroke(this.history, strokeColor, pick);
    this.pointerId = pointerId;
    this.previousSurface = surfaceIdentity(pick);
    return true;
  }

  pointerMove(pointerId: number, pick: SkinPickResult | undefined): void {
    if (this.stroke === undefined || this.pointerId !== pointerId) return;

    if (pick === undefined) {
      this.stroke.extend(undefined);
      this.previousSurface = undefined;
      return;
    }

    if (!sameSurface(this.previousSurface, pick)) {
      this.stroke.extend(undefined);
    }
    this.stroke.extend({ x: pick.x, y: pick.y });
    this.previousSurface = surfaceIdentity(pick);
  }

  pointerUp(pointerId: number): void {
    if (this.stroke === undefined || this.pointerId !== pointerId) return;
    this.stroke.commit();
    this.clearStroke();
  }

  cancel(pointerId?: number): void {
    if (
      this.stroke === undefined ||
      (pointerId !== undefined && this.pointerId !== pointerId)
    ) {
      return;
    }
    this.stroke.cancel();
    this.clearStroke();
  }

  get isActive(): boolean {
    return this.stroke !== undefined && this.stroke.isActive;
  }

  private clearStroke(): void {
    this.stroke = undefined;
    this.pointerId = undefined;
    this.previousSurface = undefined;
  }
}
