import {
  MOUSE,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Camera,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { SkinDocument } from '../../engine/document';
import type { EditorTool } from '../../engine/tools';
import { SkinModelResources } from './SkinModelBuilder';
import { pickSkinAtClientPoint, type SkinPickResult } from './SkinPicking';
import { SkinTexture } from './SkinTexture';

const PREVIEW_BACKGROUND = 0x1b1d20;
const CAMERA_TARGET = new Vector3(0, 16, 0);
const CAMERA_POSITION = new Vector3(40, 27, 60);
export const MAX_PREVIEW_DPR = 2;

interface PreviewRendererAdapter {
  readonly domElement: HTMLCanvasElement;
  outputColorSpace: string;
  setClearColor(color: number, alpha?: number): void;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Scene, camera: Camera): void;
  dispose(): void;
  forceContextLoss?(): void;
}

interface PreviewControlsAdapter {
  readonly target: Vector3;
  enablePan: boolean;
  enableDamping: boolean;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  mouseButtons?: {
    LEFT?: MOUSE | null;
    MIDDLE?: MOUSE | null;
    RIGHT?: MOUSE | null;
  };
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
  update(): void;
  dispose(): void;
}

interface PreviewResizeObserver {
  observe(target: Element): void;
  disconnect(): void;
}

export interface SkinPreviewRendererEnvironment {
  readonly createRenderer: () => PreviewRendererAdapter;
  readonly createControls: (
    camera: PerspectiveCamera,
    canvas: HTMLCanvasElement,
  ) => PreviewControlsAdapter;
  readonly createResizeObserver: (
    callback: ResizeObserverCallback,
  ) => PreviewResizeObserver;
  readonly requestFrame: (callback: FrameRequestCallback) => number;
  readonly cancelFrame: (handle: number) => void;
  readonly devicePixelRatio: () => number;
}

export interface SkinPreviewRendererOptions {
  readonly onPickChange?: (result: SkinPickResult | undefined) => void;
  readonly onPointerDown?: SkinPreviewPointerHandler;
  readonly onPointerMove?: SkinPreviewPointerHandler;
  readonly onPointerUp?: SkinPreviewPointerHandler;
  readonly onPointerCancel?: SkinPreviewPointerHandler;
  readonly onPointerLeave?: SkinPreviewPointerHandler;
}

export type SkinPreviewPointerHandler = (
  event: PointerEvent,
  result: SkinPickResult | undefined,
) => void;

const DEFAULT_ENVIRONMENT: SkinPreviewRendererEnvironment = {
  createRenderer: () =>
    new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    }),
  createControls: (camera, canvas) => new OrbitControls(camera, canvas),
  createResizeObserver: (callback) => new ResizeObserver(callback),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  devicePixelRatio: () => window.devicePixelRatio || 1,
};

export class SkinPreviewRenderer {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(32, 1, 0.1, 200);
  private readonly renderer: PreviewRendererAdapter;
  private readonly controls: PreviewControlsAdapter;
  private readonly skinTexture: SkinTexture;
  private readonly raycaster = new Raycaster();
  private modelResources: SkinModelResources;
  private readonly resizeObserver: PreviewResizeObserver;
  private readonly unsubscribeDocument: () => void;
  private renderFrame: number | undefined;
  private textureDirty = false;
  private currentModel: SkinDocument['model'];
  private outerVisible = true;
  private disposed = false;
  private readonly activePointerIds = new Set<number>();
  private readonly ownerWindow: Window | null;
  private readonly onPickChange: SkinPreviewRendererOptions['onPickChange'];
  private readonly onPointerDown: SkinPreviewRendererOptions['onPointerDown'];
  private readonly onPointerMove: SkinPreviewRendererOptions['onPointerMove'];
  private readonly onPointerUp: SkinPreviewRendererOptions['onPointerUp'];
  private readonly onPointerCancel: SkinPreviewRendererOptions['onPointerCancel'];
  private readonly onPointerLeave: SkinPreviewRendererOptions['onPointerLeave'];
  private lastPickKey: string | undefined;

  constructor(
    private readonly mount: HTMLElement,
    private readonly document: SkinDocument,
    private readonly environment: SkinPreviewRendererEnvironment = DEFAULT_ENVIRONMENT,
    options: SkinPreviewRendererOptions = {},
  ) {
    this.onPickChange = options.onPickChange;
    this.onPointerDown = options.onPointerDown;
    this.onPointerMove = options.onPointerMove;
    this.onPointerUp = options.onPointerUp;
    this.onPointerCancel = options.onPointerCancel;
    this.onPointerLeave = options.onPointerLeave;
    this.renderer = environment.createRenderer();
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(PREVIEW_BACKGROUND, 1);
    this.renderer.domElement.className = 'skin-preview-canvas';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      '3D skin preview; left drag edits, right drag orbits',
    );
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('data-preview-ready', 'true');
    this.mount.append(this.renderer.domElement);
    this.ownerWindow = mount.ownerDocument.defaultView;
    this.renderer.domElement.addEventListener(
      'pointerdown',
      this.handlePointerDown,
    );
    this.renderer.domElement.addEventListener(
      'pointerup',
      this.handlePointerUp,
    );
    this.renderer.domElement.addEventListener(
      'pointercancel',
      this.handlePointerCancel,
    );
    this.renderer.domElement.addEventListener(
      'pointermove',
      this.handlePointerMove,
    );
    this.renderer.domElement.addEventListener(
      'pointerleave',
      this.handlePointerLeave,
    );
    this.ownerWindow?.addEventListener('blur', this.cancelActivePointers);

    this.camera.position.copy(CAMERA_POSITION);
    this.controls = environment.createControls(
      this.camera,
      this.renderer.domElement,
    );
    this.configureControls();

    this.skinTexture = new SkinTexture(document);
    this.currentModel = document.model;
    this.modelResources = new SkinModelResources(
      document.model,
      this.skinTexture.texture,
    );
    this.scene.add(this.modelResources.root);
    this.syncDebugState();

    this.unsubscribeDocument = document.subscribeToMutations(() =>
      this.handleDocumentMutation(),
    );
    this.resizeObserver = environment.createResizeObserver(() => this.resize());
    this.resizeObserver.observe(mount);
    this.resize();
  }

  resetView(): void {
    if (this.disposed) return;
    this.camera.position.copy(CAMERA_POSITION);
    this.controls.target.copy(CAMERA_TARGET);
    this.controls.update();
    this.requestRender();
  }

  pickAt(clientX: number, clientY: number): SkinPickResult | undefined {
    if (this.disposed) return undefined;
    return pickSkinAtClientPoint(
      {
        canvas: this.renderer.domElement,
        camera: this.camera,
        meshes: this.modelResources.getPickableMeshes(),
      },
      clientX,
      clientY,
      this.raycaster,
    );
  }

  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  setEditingTool(tool: EditorTool): void {
    if (this.disposed) return;
    this.renderer.domElement.dataset.editingTool = tool;
  }

  cancelPointerInteractions(): void {
    if (this.disposed) return;
    this.cancelActivePointers();
  }

  setOuterVisible(visible: boolean): void {
    if (this.disposed || visible === this.outerVisible) return;
    this.outerVisible = visible;
    this.modelResources.setOuterVisible(visible);
    this.syncDebugState();
    this.requestRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeDocument();
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('change', this.handleControlsChange);
    this.controls.dispose();
    this.ownerWindow?.removeEventListener('blur', this.cancelActivePointers);
    this.renderer.domElement.removeEventListener(
      'pointermove',
      this.handlePointerMove,
    );
    this.renderer.domElement.removeEventListener(
      'pointerleave',
      this.handlePointerLeave,
    );
    this.renderer.domElement.removeEventListener(
      'pointerdown',
      this.handlePointerDown,
    );
    this.renderer.domElement.removeEventListener(
      'pointerup',
      this.handlePointerUp,
    );
    this.renderer.domElement.removeEventListener(
      'pointercancel',
      this.handlePointerCancel,
    );
    this.activePointerIds.clear();
    if (this.renderFrame !== undefined) {
      this.environment.cancelFrame(this.renderFrame);
      this.renderFrame = undefined;
    }
    this.modelResources.dispose();
    this.skinTexture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
    this.publishPick(undefined);
  }

  private configureControls(): void {
    this.controls.enablePan = false;
    this.controls.enableDamping = false;
    this.controls.minDistance = 30;
    this.controls.maxDistance = 96;
    this.controls.minPolarAngle = 0.1;
    this.controls.maxPolarAngle = Math.PI - 0.1;
    if (this.controls.mouseButtons !== undefined) {
      this.controls.mouseButtons.LEFT = null;
      this.controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
      this.controls.mouseButtons.RIGHT = MOUSE.ROTATE;
    }
    this.controls.target.copy(CAMERA_TARGET);
    this.controls.addEventListener('change', this.handleControlsChange);
    this.controls.update();
  }

  private readonly handleControlsChange = () => this.requestRender();

  private readonly handlePointerDown = (event: PointerEvent) => {
    this.activePointerIds.add(event.pointerId);
    this.renderer.domElement.focus({ preventScroll: true });
    this.onPointerDown?.(event, this.pickAt(event.clientX, event.clientY));
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
    this.activePointerIds.delete(event.pointerId);
    this.onPointerUp?.(event, this.pickAt(event.clientX, event.clientY));
  };

  private readonly handlePointerCancel = (event: PointerEvent) => {
    this.activePointerIds.delete(event.pointerId);
    this.onPointerCancel?.(event, undefined);
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    const result = this.pickAt(event.clientX, event.clientY);
    this.publishPick(result);
    this.onPointerMove?.(event, result);
  };

  private readonly handlePointerLeave = (event: PointerEvent) => {
    this.publishPick(undefined);
    this.onPointerLeave?.(event, undefined);
  };

  private publishPick(result: SkinPickResult | undefined): void {
    const key =
      result === undefined
        ? undefined
        : [
            result.model,
            result.bodyPart,
            result.layer,
            result.face,
            result.x,
            result.y,
          ].join(':');
    if (key === this.lastPickKey) return;
    this.lastPickKey = key;
    const canvas = this.renderer.domElement;
    if (result === undefined) {
      delete canvas.dataset.pick;
    } else {
      canvas.dataset.pick = `${result.bodyPart}:${result.layer}:${result.face}:${result.x},${result.y}`;
    }
    this.onPickChange?.(result);
  }

  private readonly cancelActivePointers = () => {
    const PointerEventConstructor = globalThis.PointerEvent;
    if (PointerEventConstructor === undefined) {
      this.activePointerIds.clear();
      return;
    }

    for (const pointerId of this.activePointerIds) {
      this.renderer.domElement.dispatchEvent(
        new PointerEventConstructor('pointercancel', { pointerId }),
      );
    }
    this.activePointerIds.clear();
  };

  private handleDocumentMutation(): void {
    if (this.disposed) return;

    if (this.document.model !== this.currentModel) {
      this.modelResources.dispose();
      this.currentModel = this.document.model;
      this.modelResources = new SkinModelResources(
        this.currentModel,
        this.skinTexture.texture,
      );
      this.modelResources.setOuterVisible(this.outerVisible);
      this.scene.add(this.modelResources.root);
    } else {
      this.textureDirty = true;
    }

    this.syncDebugState();
    this.requestRender();
  }

  private resize(): void {
    if (this.disposed) return;
    const bounds = this.mount.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const dpr = Math.min(
      MAX_PREVIEW_DPR,
      Math.max(1, this.environment.devicePixelRatio()),
    );
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private requestRender(): void {
    if (this.disposed || this.renderFrame !== undefined) return;
    this.renderFrame = this.environment.requestFrame(() => {
      this.renderFrame = undefined;
      if (this.disposed) return;
      if (this.textureDirty) {
        this.skinTexture.update(this.document);
        this.textureDirty = false;
      }
      this.renderer.render(this.scene, this.camera);
    });
  }

  private syncDebugState(): void {
    const canvas = this.renderer.domElement;
    canvas.dataset.skinModel = this.currentModel;
    canvas.dataset.documentRevision = String(this.document.revision);
    canvas.dataset.outerVisible = String(this.outerVisible);
  }
}
