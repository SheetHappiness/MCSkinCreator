import { describe, expect, it, vi } from 'vitest';
import { BufferGeometry, MOUSE, Texture, Vector3 } from 'three';

import { SkinDocument } from '../../engine/document';
import { DocumentHistory } from '../../engine/history';
import {
  SkinPreviewRenderer,
  type SkinPreviewRendererEnvironment,
} from './SkinPreviewRenderer';
import type { SkinPickResult } from './SkinPicking';
import { SkinTexture } from './SkinTexture';

describe('Three.js preview lifecycle', () => {
  it('coalesces rendering and releases subscriptions, GPU resources, controls, and observers', () => {
    const mount = document.createElement('div');
    let mountWidth = 280;
    let mountHeight = 500;
    mount.getBoundingClientRect = () =>
      ({ width: mountWidth, height: mountHeight }) as DOMRect;
    const canvas = document.createElement('canvas');
    const renderer = {
      domElement: canvas,
      outputColorSpace: '',
      setClearColor: vi.fn(),
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      forceContextLoss: vi.fn(),
    };
    const controls = {
      target: new Vector3(),
      enablePan: true,
      enableDamping: true,
      minDistance: 0,
      maxDistance: 0,
      minPolarAngle: 0,
      maxPolarAngle: 0,
      mouseButtons: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      update: vi.fn(),
      dispose: vi.fn(),
    };
    const resizeObserver = { observe: vi.fn(), disconnect: vi.fn() };
    let resizeCallback: ResizeObserverCallback | undefined;
    let previewCamera:
      | Parameters<SkinPreviewRendererEnvironment['createControls']>[0]
      | undefined;
    let scheduledFrame: FrameRequestCallback | undefined;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 41;
    });
    const cancelFrame = vi.fn();
    const environment: SkinPreviewRendererEnvironment = {
      createRenderer: () => renderer,
      createControls: (camera) => {
        previewCamera = camera;
        return controls;
      },
      createResizeObserver: (callback) => {
        resizeCallback = callback;
        return resizeObserver;
      },
      requestFrame,
      cancelFrame,
      devicePixelRatio: () => 3,
    };
    const skinDocument = SkinDocument.createBlank({ id: 'lifecycle' });
    const disposeTexture = vi.spyOn(Texture.prototype, 'dispose');
    const disposeGeometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const updateTexture = vi.spyOn(SkinTexture.prototype, 'update');
    const preview = new SkinPreviewRenderer(mount, skinDocument, environment);

    expect(mount).toContainElement(canvas);
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(2);
    expect(renderer.setSize).toHaveBeenCalledWith(280, 500, false);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(controls.enablePan).toBe(false);
    expect(controls.mouseButtons).toEqual({
      LEFT: null,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.ROTATE,
    });
    expect(controls.minDistance).toBe(30);
    expect(controls.maxDistance).toBe(96);
    expect(previewCamera?.position.toArray()).toEqual([40, 27, 60]);

    mountWidth = 420;
    mountHeight = 210;
    resizeCallback?.([], {} as ResizeObserver);
    expect(renderer.setSize).toHaveBeenLastCalledWith(420, 210, false);
    expect(previewCamera?.aspect).toBe(2);

    previewCamera?.position.set(1, 2, 3);
    controls.target.set(9, 9, 9);
    preview.resetView();
    expect(previewCamera?.position.toArray()).toEqual([40, 27, 60]);
    expect(controls.target.toArray()).toEqual([0, 16, 0]);

    skinDocument.writePixel(1, 1, { r: 1, g: 2, b: 3, a: 4 });
    skinDocument.writePixel(2, 2, { r: 5, g: 6, b: 7, a: 8 });
    expect(canvas.dataset.documentRevision).toBe('2');
    expect(requestFrame).toHaveBeenCalledTimes(1);
    scheduledFrame?.(0);
    expect(updateTexture).toHaveBeenCalledOnce();
    expect(renderer.render).toHaveBeenCalledOnce();

    preview.setBaseVisible(false);
    preview.setOuterVisible(false);
    preview.setBodyPartVisible('leftArm', false);
    expect(canvas.dataset.baseVisible).toBe('false');
    expect(canvas.dataset.outerVisible).toBe('false');
    expect(canvas.dataset.visibleBodyParts).toBe(
      'head,torso,rightArm,rightLeg,leftLeg',
    );
    expect(skinDocument.revision).toBe(2);

    skinDocument.writePixel(3, 3, { r: 9, g: 10, b: 11, a: 12 });
    expect(canvas.dataset.documentRevision).toBe('3');
    expect(requestFrame).toHaveBeenCalledTimes(2);

    preview.dispose();
    expect(resizeObserver.disconnect).toHaveBeenCalledOnce();
    expect(controls.dispose).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledWith(41);
    expect(disposeGeometry).toHaveBeenCalledTimes(12);
    expect(disposeTexture).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
    expect(mount).not.toContainElement(canvas);

    skinDocument.writePixel(4, 4, { r: 13, g: 14, b: 15, a: 16 });
    expect(canvas.dataset.documentRevision).toBe('3');
  });

  it('reports hover picks without mutating the document or history', () => {
    const mount = document.createElement('div');
    mount.getBoundingClientRect = () =>
      ({ width: 280, height: 500 }) as DOMRect;
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 280,
        bottom: 500,
        width: 280,
        height: 500,
      }) as DOMRect;
    const renderer = {
      domElement: canvas,
      outputColorSpace: '',
      setClearColor: vi.fn(),
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      forceContextLoss: vi.fn(),
    };
    const controls = {
      target: new Vector3(),
      enablePan: true,
      enableDamping: true,
      minDistance: 0,
      maxDistance: 0,
      minPolarAngle: 0,
      maxPolarAngle: 0,
      mouseButtons: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      update: vi.fn(),
      dispose: vi.fn(),
    };
    const resizeObserver = { observe: vi.fn(), disconnect: vi.fn() };
    const requestFrame = vi.fn(() => 1);
    const environment: SkinPreviewRendererEnvironment = {
      createRenderer: () => renderer,
      createControls: (camera) => {
        camera.lookAt(0, 16, 0);
        return controls;
      },
      createResizeObserver: () => resizeObserver,
      requestFrame,
      cancelFrame: vi.fn(),
      devicePixelRatio: () => 1,
    };
    const skinDocument = SkinDocument.createBlank({ id: 'pick-hover' });
    const history = new DocumentHistory(skinDocument);
    const picks: (SkinPickResult | undefined)[] = [];
    const preview = new SkinPreviewRenderer(mount, skinDocument, environment, {
      onPickChange: (result) => picks.push(result),
    });

    canvas.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 140, clientY: 250 }),
    );
    expect(picks.at(-1)).toMatchObject({
      bodyPart: 'torso',
      layer: 'outer',
      face: 'front',
    });
    expect(skinDocument.revision).toBe(0);
    expect(skinDocument.isDirty).toBe(false);
    expect(history.canUndo).toBe(false);

    canvas.dispatchEvent(new Event('pointerleave'));
    expect(picks.at(-1)).toBeUndefined();
    preview.dispose();
  });
});
