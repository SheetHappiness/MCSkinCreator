import {
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Camera,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { SkinDocument } from '../../engine/document';
import { SkinModelResources } from './SkinModelBuilder';
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
  private modelResources: SkinModelResources;
  private readonly resizeObserver: PreviewResizeObserver;
  private readonly unsubscribeDocument: () => void;
  private renderFrame: number | undefined;
  private textureDirty = false;
  private currentModel: SkinDocument['model'];
  private outerVisible = true;
  private disposed = false;

  constructor(
    private readonly mount: HTMLElement,
    private readonly document: SkinDocument,
    private readonly environment: SkinPreviewRendererEnvironment = DEFAULT_ENVIRONMENT,
  ) {
    this.renderer = environment.createRenderer();
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(PREVIEW_BACKGROUND, 1);
    this.renderer.domElement.className = 'skin-preview-canvas';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', '3D skin preview');
    this.renderer.domElement.setAttribute('data-preview-ready', 'true');
    this.mount.append(this.renderer.domElement);

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
    if (this.renderFrame !== undefined) {
      this.environment.cancelFrame(this.renderFrame);
      this.renderFrame = undefined;
    }
    this.modelResources.dispose();
    this.skinTexture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }

  private configureControls(): void {
    this.controls.enablePan = false;
    this.controls.enableDamping = false;
    this.controls.minDistance = 30;
    this.controls.maxDistance = 96;
    this.controls.minPolarAngle = 0.1;
    this.controls.maxPolarAngle = Math.PI - 0.1;
    this.controls.target.copy(CAMERA_TARGET);
    this.controls.addEventListener('change', this.handleControlsChange);
    this.controls.update();
  }

  private readonly handleControlsChange = () => this.requestRender();

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
