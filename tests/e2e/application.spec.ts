import { _electron as electron, expect, test } from '@playwright/test';
import { decode, encode } from 'fast-png';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('launches the production Electron application shell', async () => {
  const application = await electron.launch({ args: ['.'] });

  try {
    const window = await application.firstWindow();
    const rendererBoundary = await window.evaluate(() => {
      const browserGlobal = globalThis as typeof globalThis & {
        skinFiles?: Record<string, unknown>;
        skinLibrary?: Record<string, unknown>;
        preview?: Record<string, unknown>;
        skinEdits?: Record<string, unknown>;
        appLifecycle?: Record<string, unknown>;
      };
      return {
        hasCommonJsRequire: 'require' in globalThis,
        hasElectronBridge: 'electron' in globalThis,
        fileApiMethods: Object.keys(browserGlobal.skinFiles ?? {}).sort(),
        libraryApiMethods: Object.keys(browserGlobal.skinLibrary ?? {}).sort(),
        previewApiMethods: Object.keys(browserGlobal.preview ?? {}).sort(),
        editApiMethods: Object.keys(browserGlobal.skinEdits ?? {}).sort(),
        lifecycleApiMethods: Object.keys(
          browserGlobal.appLifecycle ?? {},
        ).sort(),
      };
    });
    const fileMenu = await application.evaluate(({ Menu }) =>
      [
        'file-new',
        'file-open',
        'file-save',
        'file-save-as',
        'file-save-all',
      ].map((id) => {
        const item = Menu.getApplicationMenu()?.getMenuItemById(id);
        return {
          id,
          label: item?.label,
          accelerator: item?.accelerator,
          enabled: item?.enabled,
        };
      }),
    );
    const editMenu = await application.evaluate(({ Menu }) =>
      ['edit-undo', 'edit-redo'].map((id) => {
        const item = Menu.getApplicationMenu()?.getMenuItemById(id);
        return {
          id,
          label: item?.label,
          accelerator: item?.accelerator,
          enabled: item?.enabled,
        };
      }),
    );

    await expect(window).toHaveTitle('Minecraft Skin Editor');
    await expect(
      window.getByRole('heading', { name: 'Minecraft Skin Editor' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(window.getByLabel('Application status')).toHaveText(
      'No document open',
    );
    expect(rendererBoundary).toEqual({
      hasCommonJsRequire: false,
      hasElectronBridge: false,
      fileApiMethods: [
        'getPathForDroppedFile',
        'listRecentSkins',
        'onFileCommand',
        'openRecentSkin',
        'openSkinPng',
        'recordRecentSkin',
        'removeRecentSkin',
        'saveSkinPng',
        'saveSkinPngAs',
      ],
      libraryApiMethods: [
        'copySkinToLibrary',
        'createLibraryCollection',
        'deleteLibraryCollection',
        'deleteLibrarySkin',
        'duplicateLibrarySkin',
        'listLibrarySkins',
        'openLibrarySkin',
        'renameLibraryCollection',
        'renameLibrarySkin',
        'revealLibrarySkin',
        'setLibraryEntryCollections',
      ],
      previewApiMethods: [
        'notifyPopoutPreviewReady',
        'onPopoutPreviewClosed',
        'onPopoutPreviewState',
        'openPopoutPreview',
        'publishPopoutPreview',
        'savePreviewSnapshot',
      ],
      editApiMethods: ['onEditCommand', 'setCommandState'],
      lifecycleApiMethods: [
        'confirmUnsavedChanges',
        'onCloseRequest',
        'respondToCloseRequest',
        'setDocumentState',
      ],
    });
    expect(fileMenu).toEqual([
      {
        id: 'file-new',
        label: 'New',
        accelerator: 'CmdOrCtrl+N',
        enabled: true,
      },
      {
        id: 'file-open',
        label: 'Open…',
        accelerator: 'CmdOrCtrl+O',
        enabled: true,
      },
      {
        id: 'file-save',
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        enabled: false,
      },
      {
        id: 'file-save-as',
        label: 'Save As…',
        accelerator: 'CmdOrCtrl+Shift+S',
        enabled: false,
      },
      {
        id: 'file-save-all',
        label: 'Save All',
        accelerator: 'CmdOrCtrl+Alt+S',
        enabled: false,
      },
    ]);
    expect(editMenu).toEqual([
      {
        id: 'edit-undo',
        label: 'Undo',
        accelerator: 'CmdOrCtrl+Z',
        enabled: false,
      },
      {
        id: 'edit-redo',
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Y',
        enabled: false,
      },
    ]);
  } finally {
    await application.close();
  }
});

test('creates a new skin and opens one controlled dropped PNG', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-new-drop-e2e-'),
  );
  const requestedOutputPath = path.join(temporaryDirectory, 'new-skin');
  const dropBytes = encode({
    width: 64,
    height: 64,
    data: new Uint8Array(64 * 64 * 4),
    channels: 4,
    depth: 8,
  });
  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_SAVE_AS_PATH: requestedOutputPath,
    },
  });

  try {
    const window = await application.firstWindow();
    await expect(window).toHaveTitle('Minecraft Skin Editor');
    await expect(
      window.getByRole('heading', { name: 'Minecraft Skin Editor' }),
    ).toBeVisible({ timeout: 15_000 });
    await window.bringToFront();
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('file-new')?.click();
    });
    const dialog = window.getByRole('dialog', { name: 'New Skin' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Classic skin model', exact: true }),
    ).toBeFocused();
    await dialog
      .getByRole('button', { name: 'Slim skin model', exact: true })
      .click();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    const canvas = window.getByRole('img', { name: '2D skin canvas' });
    const preview = window.getByRole('img', { name: '3D skin preview' });
    const editorStatus = window.getByLabel('Editor status');
    await expect(canvas).toBeVisible();
    await expect(preview).toHaveAttribute('data-skin-model', 'slim');
    await expect(
      editorStatus.getByText('Untitled.png', { exact: true }),
    ).toBeVisible();

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    await window.mouse.click(
      canvasBox!.x + canvasBox!.width / 2,
      canvasBox!.y + canvasBox!.height / 2,
    );
    await expect(window).toHaveTitle('Untitled.png • — Minecraft Skin Editor');
    await window.getByRole('button', { name: 'Save As…' }).click();
    await expect(editorStatus.getByText('new-skin.png')).toBeVisible();
    await expect(window).toHaveTitle('new-skin.png — Minecraft Skin Editor');

    const dispatchDrop = async () =>
      window.evaluate((bytes) => {
        interface BrowserDataTransfer {
          readonly items: {
            add(file: unknown): void;
          };
        }
        interface BrowserElement {
          dispatchEvent(event: unknown): boolean;
        }
        const browser = globalThis as unknown as {
          readonly DataTransfer: new () => BrowserDataTransfer;
          readonly File: new (
            parts: readonly Uint8Array[],
            name: string,
            options: { readonly type: string },
          ) => unknown;
          readonly DragEvent: new (
            type: string,
            init: {
              readonly bubbles: boolean;
              readonly cancelable: boolean;
              readonly dataTransfer: BrowserDataTransfer;
            },
          ) => unknown;
          readonly document: {
            querySelector(selector: string): BrowserElement | null;
          };
        };
        const dataTransfer = new browser.DataTransfer();
        dataTransfer.items.add(
          new browser.File([new Uint8Array(bytes)], 'dropped.png', {
            type: 'image/png',
          }),
        );
        const target = browser.document.querySelector('.application-shell');
        if (target === null) throw new Error('Application shell not found.');
        target.dispatchEvent(
          new browser.DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer,
          }),
        );
      }, Array.from(dropBytes));

    await dispatchDrop();
    await expect(
      editorStatus.getByText('dropped.png', { exact: true }),
    ).toBeVisible();
    await expect(window).toHaveTitle('dropped.png — Minecraft Skin Editor');
    await expect(preview).toHaveAttribute('data-skin-model', 'classic');
    await expect(window.getByRole('dialog', { name: 'New Skin' })).toHaveCount(
      0,
    );
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('exposes UV semantics, layer-aware focus, and a non-blocking overlay', async () => {
  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
    },
  });

  try {
    const window = await application.firstWindow();
    await expect(window).toHaveTitle('Minecraft Skin Editor');
    await expect(
      window.getByRole('heading', { name: 'Minecraft Skin Editor' }),
    ).toBeVisible({ timeout: 15_000 });
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('file-new')?.click();
    });
    const dialog = window.getByRole('dialog', { name: 'New Skin' });
    await dialog
      .getByRole('button', { name: 'Classic skin model', exact: true })
      .click();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    const canvas = window.getByRole('img', { name: '2D skin canvas' });
    const structure = window.getByRole('group', {
      name: 'Canvas structure',
    });
    const editorStatus = window.getByLabel('Editor status');
    const focus = structure.getByLabel('Canvas focus');
    const zoomValue = window.getByTestId('zoom-value');

    await expect(canvas).toBeVisible();
    await expect(
      editorStatus.getByText('Untitled.png', { exact: true }),
    ).toBeVisible();
    await expect(focus).toHaveValue('whole');
    await expect(
      structure.getByRole('button', { name: 'UV boundaries' }),
    ).toHaveAttribute('aria-pressed', 'false');

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    const wholeZoom =
      Number.parseInt((await zoomValue.textContent()) ?? '', 10) / 100;
    const wholeTexturePoint = (x: number, y: number) => ({
      x:
        canvasBox!.x +
        (canvasBox!.width - 64 * wholeZoom) / 2 +
        (x + 0.5) * wholeZoom,
      y:
        canvasBox!.y +
        (canvasBox!.height - 64 * wholeZoom) / 2 +
        (y + 0.5) * wholeZoom,
    });

    await window.mouse.move(
      wholeTexturePoint(8, 8).x,
      wholeTexturePoint(8, 8).y,
    );
    await expect(window.getByLabel('Canvas semantic')).toHaveText(
      'Head · Front · Base',
    );

    const overlay = structure.getByRole('button', {
      name: 'UV boundaries',
    });
    await overlay.click();
    await expect(overlay).toHaveAttribute('aria-pressed', 'true');
    await structure.getByRole('button', { name: 'Base', exact: true }).click();
    await expect(
      structure.getByRole('button', { name: 'Base', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');

    await focus.selectOption('head');
    await expect(focus).toHaveValue('head');
    await expect(zoomValue).not.toHaveText(`${wholeZoom * 100}%`);
    for (const target of [
      'torso',
      'arms',
      'rightArm',
      'leftArm',
      'legs',
      'rightLeg',
      'leftLeg',
    ] as const) {
      await focus.selectOption(target);
      await expect(focus).toHaveValue(target);
    }
    await focus.selectOption('whole');
    await expect(focus).toHaveValue('whole');

    // UV controls are view state only; creating the skin remains clean.
    await expect(
      editorStatus.getByText('Untitled.png', { exact: true }),
    ).toBeVisible();
    await expect(
      editorStatus.getByText('Untitled.png •', { exact: true }),
    ).toHaveCount(0);
  } finally {
    await application.close();
  }
});

test('links semantic hover, inspect focus, selection, and isolation across 2D and 3D', async () => {
  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_UNSAVED_DECISION: 'discard',
    },
  });

  try {
    const window = await application.firstWindow();
    await expect(window).toHaveTitle('Minecraft Skin Editor');
    await expect(
      window.getByRole('heading', { name: 'Minecraft Skin Editor' }),
    ).toBeVisible({ timeout: 15_000 });
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('file-new')?.click();
    });
    const dialog = window.getByRole('dialog', { name: 'New Skin' });
    await dialog
      .getByRole('button', { name: 'Classic skin model', exact: true })
      .click();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    const canvas = window.getByRole('img', { name: '2D skin canvas' });
    const preview = window.getByRole('img', { name: '3D skin preview' });
    const visibility = window.getByLabel('Visibility and focus');
    const editorStatus = window.getByLabel('Editor status');
    await expect(preview).toHaveAttribute('data-preview-ready', 'true');

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    const zoom =
      Number.parseInt(
        (await window.getByTestId('zoom-value').textContent()) ?? '',
        10,
      ) / 100;
    const texturePoint = (x: number, y: number) => ({
      x: canvasBox!.x + (canvasBox!.width - 64 * zoom) / 2 + (x + 0.5) * zoom,
      y: canvasBox!.y + (canvasBox!.height - 64 * zoom) / 2 + (y + 0.5) * zoom,
    });

    await window.mouse.move(texturePoint(8, 8).x, texturePoint(8, 8).y);
    await expect(preview).toHaveAttribute(
      'data-highlight-target',
      'classic:head:base:front',
    );

    const previewBox = await preview.boundingBox();
    expect(previewBox).not.toBeNull();
    const previewPoint = {
      x: previewBox!.x + previewBox!.width / 2,
      y: previewBox!.y + previewBox!.height / 2,
    };
    await window.mouse.move(previewPoint.x, previewPoint.y);
    await expect(preview).toHaveAttribute('data-pick', /.+:.+:.+:.+,\d+$/);
    const pickData = await preview.getAttribute('data-pick');
    const pickParts = pickData?.split(':');
    expect(pickParts).toHaveLength(4);
    const [bodyPart, layer, face] = pickParts!;
    const targetKey = `classic:${bodyPart}:${layer}:${face}`;
    await expect(canvas).toHaveAttribute('data-semantic-highlight', targetKey);
    await expect(preview).toHaveAttribute('data-highlight-target', targetKey);

    await window.keyboard.down('Control');
    await window.mouse.click(previewPoint.x, previewPoint.y);
    await window.keyboard.up('Control');
    await expect(canvas).toHaveAttribute('data-semantic-selection', targetKey);
    await expect(canvas).toHaveAttribute('data-focus-target', bodyPart!);
    await expect(preview).toHaveAttribute('data-selected-target', targetKey);
    await expect(
      editorStatus.getByText('Untitled.png •', { exact: true }),
    ).toHaveCount(0);

    await visibility
      .getByRole('button', { name: 'Target outer layer', exact: true })
      .click();
    await visibility
      .getByRole('button', { name: 'Select Left Arm', exact: true })
      .click();
    const leftArmOuterTarget = 'classic:leftArm:outer:front';
    await expect(canvas).toHaveAttribute(
      'data-semantic-selection',
      leftArmOuterTarget,
    );
    await expect(canvas).toHaveAttribute('data-focus-target', 'leftArm');
    await expect(preview).toHaveAttribute(
      'data-selected-target',
      leftArmOuterTarget,
    );

    await visibility
      .getByRole('button', { name: 'Isolate Left Arm', exact: true })
      .click();
    await expect(preview).toHaveAttribute('data-visible-body-parts', 'leftArm');
    await expect(canvas).toHaveAttribute('data-isolated-body-part', 'leftArm');
    await expect(canvas).toHaveAttribute('data-focus-target', 'leftArm');

    await visibility
      .getByRole('button', { name: 'Restore all visibility', exact: true })
      .click();
    await expect(preview).toHaveAttribute(
      'data-visible-body-parts',
      'head,torso,rightArm,leftArm,rightLeg,leftLeg',
    );
    await expect(canvas).not.toHaveAttribute('data-isolated-body-part', /.+/);
    await expect(canvas).toHaveAttribute('data-focus-target', 'whole');
    await expect(canvas).not.toHaveAttribute('data-semantic-selection', /.+/);
    await expect(
      editorStatus.getByText('Untitled.png •', { exact: true }),
    ).toHaveCount(0);
  } finally {
    await application.close();
  }
});

test('selects exact pixels, previews paste and move, supports rollback, and cleans selection per document', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-selection-e2e-'),
  );
  const inputPath = path.join(temporaryDirectory, 'selection.png');
  const pixels = new Uint8Array(64 * 64 * 4);
  const setPixel = (x: number, y: number, rgba: number[]) => {
    pixels.set(rgba, (y * 64 + x) * 4);
  };
  setPixel(10, 10, [0xa1, 0xb2, 0xc3, 0x40]);
  setPixel(11, 10, [0x11, 0x22, 0x33, 0xff]);
  setPixel(10, 11, [0x44, 0x55, 0x66, 0x80]);
  setPixel(11, 11, [0, 0, 0, 0]);
  await writeFile(
    inputPath,
    encode({ width: 64, height: 64, data: pixels, channels: 4, depth: 8 }),
  );

  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH: inputPath,
      MINECRAFT_SKIN_EDITOR_E2E_UNSAVED_DECISION: 'discard',
    },
  });

  try {
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Open PNG' }).click();
    const canvas = window.getByRole('img', { name: '2D skin canvas' });
    const editorStatus = window.getByLabel('Editor status');
    await expect(canvas).toBeVisible();
    await window.getByRole('button', { name: 'Fit' }).click();

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    const zoom =
      Number.parseInt(
        (await window.getByTestId('zoom-value').textContent()) ?? '',
        10,
      ) / 100;
    const textureLeft = (canvasBox!.width - 64 * zoom) / 2;
    const textureTop = (canvasBox!.height - 64 * zoom) / 2;
    const texturePoint = (x: number, y: number) => ({
      x: canvasBox!.x + textureLeft + (x + 0.5) * zoom,
      y: canvasBox!.y + textureTop + (y + 0.5) * zoom,
    });
    const dragSelection = async () => {
      const first = texturePoint(10, 10);
      const last = texturePoint(11, 11);
      await window.mouse.move(first.x, first.y);
      await window.mouse.down();
      await window.mouse.move(last.x, last.y);
      await window.mouse.up();
    };

    await window
      .getByRole('button', { name: 'Selection', exact: true })
      .click();
    await dragSelection();
    await expect(canvas).toHaveAttribute('data-selection-state', 'selected');
    await expect(canvas).toHaveAttribute('data-selection-rect', '10,10,2,2');
    await expect(
      editorStatus.getByText('selection.png', { exact: true }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Zoom in' }).click();
    await expect(canvas).toHaveAttribute('data-selection-rect', '10,10,2,2');
    await window.getByRole('button', { name: 'Fit' }).click();
    const panAnchor = {
      x: canvasBox!.x + canvasBox!.width / 2,
      y: canvasBox!.y + canvasBox!.height / 2,
    };
    await window.mouse.move(panAnchor.x, panAnchor.y);
    await window.mouse.down({ button: 'middle' });
    await window.mouse.move(panAnchor.x + 24, panAnchor.y + 12);
    await window.mouse.up({ button: 'middle' });
    await expect(canvas).toHaveAttribute('data-selection-rect', '10,10,2,2');
    await window.getByRole('button', { name: 'Fit' }).click();

    await canvas.focus();
    await window.keyboard.press('Control+C');
    await window.keyboard.press('Control+V');
    await expect(canvas).toHaveAttribute('data-selection-state', 'floating');
    await expect(
      editorStatus.getByText('selection.png', { exact: true }),
    ).toBeVisible();
    await window.keyboard.press('ArrowRight');
    await expect(canvas).toHaveAttribute('data-selection-rect', '11,10,2,2');
    await window.keyboard.press('Escape');
    await expect(canvas).toHaveAttribute('data-selection-state', 'selected');
    await expect(
      editorStatus.getByText('selection.png', { exact: true }),
    ).toBeVisible();

    await window.keyboard.press('Control+V');
    await expect(canvas).toHaveAttribute('data-selection-state', 'floating');
    const floatingActions = window.getByTestId('selection-floating-actions');
    await floatingActions.getByRole('button', { name: 'Cancel' }).focus();
    await expect(canvas).toHaveAttribute('data-selection-state', 'floating');
    await floatingActions
      .getByRole('button', { name: 'Cancel' })
      .press('Enter');
    await expect(canvas).toHaveAttribute('data-selection-state', 'selected');
    await canvas.focus();
    await window.keyboard.press('Control+V');
    await expect(canvas).toHaveAttribute('data-selection-state', 'floating');
    await window.getByRole('button', { name: 'Pencil', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-selection-state', 'selected');
    await window
      .getByRole('button', { name: 'Selection', exact: true })
      .click();

    await canvas.focus();
    await window.keyboard.press('Control+V');
    await window.keyboard.press('ArrowRight');
    await window.keyboard.press('Enter');
    await expect(canvas).toHaveAttribute('data-selection-state', 'selected');
    await expect(editorStatus.getByText('selection.png •')).toBeVisible();
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-undo')?.click();
    });
    await expect(
      editorStatus.getByText('selection.png', { exact: true }),
    ).toBeVisible();
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-redo')?.click();
    });
    await expect(editorStatus.getByText('selection.png •')).toBeVisible();

    await dragSelection();
    await window.keyboard.press('Control+X');
    await expect(editorStatus.getByText('selection.png •')).toBeVisible();
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-undo')?.click();
    });

    const moveStart = texturePoint(10, 10);
    const moveEnd = texturePoint(12, 12);
    await window.mouse.move(moveStart.x, moveStart.y);
    await window.mouse.down();
    await window.mouse.move(moveEnd.x, moveEnd.y);
    await window.mouse.up();
    await expect(canvas).toHaveAttribute('data-selection-state', 'floating');
    await expect(canvas).toHaveAttribute('data-selection-rect', '12,12,2,2');
    await window.keyboard.press('Escape');
    await expect(canvas).toHaveAttribute('data-selection-state', 'selected');
    await expect(editorStatus.getByText('selection.png •')).toBeVisible();

    await canvas.focus();
    await window.keyboard.press('Delete');
    await expect(editorStatus.getByText('selection.png •')).toBeVisible();

    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('file-new')?.click();
    });
    const newSkinDialog = window.getByRole('dialog', { name: 'New Skin' });
    await expect(newSkinDialog).toBeVisible();
    await newSkinDialog.getByRole('button', { name: 'Create' }).click();
    const newCanvas = window.getByRole('img', { name: '2D skin canvas' });
    await expect(newCanvas).toHaveAttribute('data-selection-state', 'empty');
    await window.getByRole('tab', { name: /selection\.png/ }).click();
    await expect(
      window.getByRole('img', { name: '2D skin canvas' }),
    ).toHaveAttribute('data-selection-state', 'empty');
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('runs selection flips, duplicate, and explicit paired-limb transfer from the contextual menu', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-transform-e2e-'),
  );
  const inputPath = path.join(temporaryDirectory, 'transform.png');
  const pixels = new Uint8Array(64 * 64 * 4);
  const setPixel = (x: number, y: number, rgba: number[]) => {
    pixels.set(rgba, (y * 64 + x) * 4);
  };
  setPixel(10, 10, [10, 20, 30, 255]);
  setPixel(11, 10, [40, 50, 60, 0]);
  setPixel(12, 10, [70, 80, 90, 255]);
  setPixel(10, 11, [100, 110, 120, 255]);
  setPixel(11, 11, [130, 140, 150, 255]);
  setPixel(12, 11, [160, 170, 180, 255]);
  setPixel(44, 20, [201, 32, 32, 255]);
  setPixel(47, 20, [32, 201, 32, 255]);
  await writeFile(
    inputPath,
    encode({ width: 64, height: 64, data: pixels, channels: 4, depth: 8 }),
  );

  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH: inputPath,
      MINECRAFT_SKIN_EDITOR_E2E_UNSAVED_DECISION: 'discard',
    },
  });

  try {
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Open PNG' }).click();
    const canvas = window.getByRole('img', { name: '2D skin canvas' });
    await expect(canvas).toBeVisible();
    await window.getByRole('button', { name: 'Fit' }).click();

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    const zoom =
      Number.parseInt(
        (await window.getByTestId('zoom-value').textContent()) ?? '',
        10,
      ) / 100;
    const textureLeft = (canvasBox!.width - 64 * zoom) / 2;
    const textureTop = (canvasBox!.height - 64 * zoom) / 2;
    const texturePoint = (x: number, y: number) => ({
      x: canvasBox!.x + textureLeft + (x + 0.5) * zoom,
      y: canvasBox!.y + textureTop + (y + 0.5) * zoom,
    });

    await window
      .getByRole('button', { name: 'Selection', exact: true })
      .click();
    const first = texturePoint(10, 10);
    const last = texturePoint(12, 11);
    await window.mouse.move(first.x, first.y);
    await window.mouse.down();
    await window.mouse.move(last.x, last.y);
    await window.mouse.up();

    const transforms = window.getByTestId('selection-transform-menu');
    const history = window.getByLabel('History timeline');
    await expect(transforms).toBeVisible();
    await transforms.getByRole('button', { name: 'Flip Horizontal' }).click();
    await transforms.getByRole('button', { name: 'Flip Vertical' }).click();
    await expect(history).toContainText('Flip Vertical');

    await transforms
      .getByRole('button', { name: 'Duplicate selection' })
      .click();
    await expect(canvas).toHaveAttribute('data-selection-state', 'floating');
    await expect(transforms).toBeVisible();
    await transforms.getByRole('button', { name: 'Flip Horizontal' }).click();
    await canvas.focus();
    await window.keyboard.press('ArrowRight');
    await window.keyboard.press('Enter');
    await expect(canvas).toHaveAttribute('data-selection-state', 'selected');
    await expect(history).toContainText('Duplicate');

    await transforms.getByText('Transfer', { exact: true }).click();
    await transforms.getByLabel('Transfer layer').selectOption('base');
    await transforms
      .getByLabel('Body transfer pair')
      .selectOption('right-arm-to-left-arm');
    await transforms
      .getByRole('button', { name: 'Transfer Right Arm → Left Arm' })
      .click();
    await expect(history).toContainText('Transfer Right Arm');

    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-undo')?.click();
    });
    await expect(history).toContainText('Duplicate');
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-redo')?.click();
    });
    await expect(history).toContainText('Transfer Right Arm');
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('paints, erases, undoes, redoes, and saves exact RGBA pixels', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-e2e-'),
  );
  const inputPath = path.join(temporaryDirectory, 'input-skin.png');
  const requestedOutputPath = path.join(temporaryDirectory, 'saved-copy');
  const outputPath = `${requestedOutputPath}.png`;
  const pixels = new Uint8Array(64 * 64 * 4);
  const eraserPixelOffset = (40 * 64 + 40) * 4;
  const secondaryPixelOffset = (20 * 64 + 20) * 4;
  pixels.set([12, 34, 56, 78], 0);
  pixels.set([12, 34, 56, 78], (10 * 64 + 10) * 4);
  pixels.set([210, 220, 230, 255], eraserPixelOffset);
  await writeFile(
    inputPath,
    encode({ width: 64, height: 64, data: pixels, channels: 4, depth: 8 }),
  );

  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH: inputPath,
      MINECRAFT_SKIN_EDITOR_E2E_SAVE_AS_PATH: requestedOutputPath,
      MINECRAFT_SKIN_EDITOR_E2E_UNSAVED_DECISION: 'discard',
    },
  });

  try {
    const window = await application.firstWindow();

    await window.getByRole('button', { name: 'Open PNG' }).click();
    const editorStatus = window.getByLabel('Editor status');
    const canvas = window.getByRole('img', { name: '2D skin canvas' });
    const preview = window.getByRole('img', { name: '3D skin preview' });
    const zoomValue = window.getByTestId('zoom-value');

    await expect(canvas).toBeVisible();
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('data-preview-ready', 'true');
    await expect(preview).toHaveAttribute('data-skin-model', 'classic');
    await expect(editorStatus.getByText('input-skin.png')).toBeVisible();
    await expect(window).toHaveTitle('input-skin.png — Minecraft Skin Editor');
    await expect(editorStatus.getByText('64×64')).toBeVisible();
    await expect(window.getByLabel('Texture coordinates')).toHaveText(
      'X: — Y: —',
    );
    await expect(zoomValue).not.toHaveText('100%');

    await window.getByRole('button', { name: 'Slim' }).click();
    await expect(preview).toHaveAttribute('data-skin-model', 'slim');
    await expect(editorStatus.getByText('input-skin.png •')).toBeVisible();
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-undo')?.click();
    });
    await expect(preview).toHaveAttribute('data-skin-model', 'classic');
    await expect(
      editorStatus.getByText('input-skin.png', { exact: true }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Classic' }).click();
    await expect(window).toHaveTitle('input-skin.png — Minecraft Skin Editor');
    const outerLayer = window.getByRole('button', {
      name: 'Show outer layer',
    });
    await outerLayer.click();
    await expect(preview).toHaveAttribute('data-outer-visible', 'false');
    await expect(window).toHaveTitle('input-skin.png — Minecraft Skin Editor');
    await outerLayer.click();

    const initialZoom = await zoomValue.textContent();
    expect(initialZoom).not.toBeNull();
    await window.getByRole('button', { name: 'Zoom in' }).click();
    await expect(zoomValue).not.toHaveText(initialZoom!);

    const grid = window.getByRole('button', { name: 'Grid' });
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    await grid.click();
    await expect(grid).toHaveAttribute('aria-pressed', 'false');
    await grid.click();

    const pencil = window.getByRole('button', { name: 'Pencil' });
    await expect(pencil).toHaveAttribute('aria-pressed', 'true');
    const toolOptions = window.getByRole('region', { name: 'Tool options' });
    await expect(toolOptions).toHaveAttribute('data-tool', 'pencil');
    await expect(toolOptions.getByLabel('Size option')).toHaveText('1 px');
    await window.getByRole('button', { name: 'Fill' }).click();
    await expect(toolOptions).toHaveAttribute('data-tool', 'fill');
    await expect(toolOptions.getByLabel('Match option')).toHaveText(
      'Exact RGBA',
    );
    await window.keyboard.press('p');
    await expect(toolOptions).toHaveAttribute('data-tool', 'pencil');
    await window.getByLabel('Paint color', { exact: true }).fill('#123456');
    await window.getByLabel('Paint alpha').fill('128');
    await expect(window.getByLabel('Selected RGBA color')).toHaveText(
      '#123456 · A 128',
    );

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();

    const panAnchor = {
      x: canvasBox!.x + canvasBox!.width / 2,
      y: canvasBox!.y + canvasBox!.height / 2,
    };
    await window.mouse.move(panAnchor.x, panAnchor.y);
    const coordinatesBeforePan = await window
      .getByLabel('Texture coordinates')
      .textContent();
    await window.mouse.down({ button: 'middle' });
    await window.mouse.move(panAnchor.x + 48, panAnchor.y + 24);
    await window.mouse.up({ button: 'middle' });
    const coordinatesAfterPan = await window
      .getByLabel('Texture coordinates')
      .textContent();
    expect(coordinatesAfterPan).not.toBe(coordinatesBeforePan);
    await window.getByRole('button', { name: 'Fit' }).click();

    const fittedZoom =
      Number.parseInt((await zoomValue.textContent()) ?? '', 10) / 100;
    const fittedTextureLeft = (canvasBox!.width - 64 * fittedZoom) / 2;
    const fittedTextureTop = (canvasBox!.height - 64 * fittedZoom) / 2;
    const fittedTexturePoint = (x: number, y: number) => ({
      x: canvasBox!.x + fittedTextureLeft + (x + 0.5) * fittedZoom,
      y: canvasBox!.y + fittedTextureTop + (y + 0.5) * fittedZoom,
    });
    await canvas.focus();
    await window.keyboard.press('i');
    await expect(
      window.getByRole('button', { name: 'Eyedropper' }),
    ).toHaveAttribute('aria-pressed', 'true');
    const sampleTarget = fittedTexturePoint(10, 10);
    await window.mouse.click(sampleTarget.x, sampleTarget.y);
    await expect(window.getByLabel('Selected RGBA color')).toHaveText(
      '#0C2238 · A 78',
    );
    await window.getByLabel('Paint hex color').fill('#123456');
    await window.getByLabel('Paint hex color').press('Enter');
    await window.getByLabel('Paint alpha').fill('128');
    await canvas.focus();
    await window.keyboard.press('p');
    const center = fittedTexturePoint(32, 32);
    await window.mouse.move(center.x, center.y);
    await expect(window.getByLabel('Texture coordinates')).toHaveText(
      'X: 32 Y: 32',
    );
    const previewRevisionBeforeStroke = await preview.getAttribute(
      'data-document-revision',
    );
    expect(previewRevisionBeforeStroke).not.toBeNull();
    await window.mouse.down();
    await expect(preview).not.toHaveAttribute(
      'data-document-revision',
      previewRevisionBeforeStroke!,
    );
    await window.mouse.up();
    await expect(editorStatus.getByText('input-skin.png •')).toBeVisible();
    await expect(window).toHaveTitle(
      'input-skin.png • — Minecraft Skin Editor',
    );

    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-undo')?.click();
    });
    await expect(
      editorStatus.getByText('input-skin.png', { exact: true }),
    ).toBeVisible();
    await expect(editorStatus.getByText('input-skin.png •')).toHaveCount(0);

    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-redo')?.click();
    });
    await expect(editorStatus.getByText('input-skin.png •')).toBeVisible();

    await window.getByRole('button', { name: 'Expand Library' }).click();
    const librarySearch = window.getByLabel('Search local library');
    await librarySearch.fill('input');
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-undo')?.click();
    });
    await expect(editorStatus.getByText('input-skin.png •')).toBeVisible();
    await expect(librarySearch).toHaveValue('input');
    await canvas.focus();
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-undo')?.click();
    });
    await expect(
      editorStatus.getByText('input-skin.png', { exact: true }),
    ).toBeVisible();
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-redo')?.click();
    });
    await expect(editorStatus.getByText('input-skin.png •')).toBeVisible();

    await window.keyboard.press('e');
    await expect(
      window.getByRole('button', { name: 'Eraser' }),
    ).toHaveAttribute('aria-pressed', 'true');
    const eraserTarget = fittedTexturePoint(40, 40);
    await window.mouse.click(eraserTarget.x, eraserTarget.y);

    const previewBox = await preview.boundingBox();
    expect(previewBox).not.toBeNull();
    await window.mouse.move(
      previewBox!.x + previewBox!.width / 2,
      previewBox!.y + previewBox!.height / 2,
    );
    const editorZoomBeforePreview = await zoomValue.textContent();
    await window.mouse.down({ button: 'right' });
    await window.mouse.move(
      previewBox!.x + previewBox!.width * 0.65,
      previewBox!.y + previewBox!.height * 0.45,
    );
    await window.mouse.up({ button: 'right' });
    await window.mouse.wheel(0, -120);
    await expect(zoomValue).toHaveText(editorZoomBeforePreview!);
    await window.getByRole('button', { name: 'Reset view' }).click();

    await window.keyboard.press('p');
    const colors = window.getByLabel('Paint colors');
    await colors
      .getByRole('button', { name: 'Secondary color', exact: true })
      .click();
    await expect(
      window.getByLabel('Exact secondary paint color'),
    ).toBeVisible();
    await window.getByLabel('Paint hex color').fill('#A1B2C3');
    await window.getByLabel('Paint hex color').press('Enter');
    await window.getByLabel('Paint alpha').fill('64');
    const secondaryTarget = fittedTexturePoint(20, 20);
    await window.mouse.click(secondaryTarget.x, secondaryTarget.y, {
      button: 'right',
    });
    await expect(window.getByLabel('Selected RGBA color')).toHaveText(
      '#A1B2C3 · A 64',
    );

    await window.getByRole('button', { name: 'Save As…' }).click();
    await expect(editorStatus.getByText('saved-copy.png')).toBeVisible();

    const saved = decode(await readFile(outputPath), { checkCrc: true });
    expect(saved.width).toBe(64);
    expect(saved.height).toBe(64);
    pixels.set([0x12, 0x34, 0x56, 128], (32 * 64 + 32) * 4);
    pixels.set([0, 0, 0, 0], eraserPixelOffset);
    pixels.set([0xa1, 0xb2, 0xc3, 64], secondaryPixelOffset);
    expect(new Uint8Array(saved.data.buffer)).toEqual(pixels);
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('paints one picked 3D texel, undoes, redoes, and saves it exactly', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-3d-e2e-'),
  );
  const inputPath = path.join(temporaryDirectory, 'input-skin.png');
  const requestedOutputPath = path.join(temporaryDirectory, 'saved-3d-copy');
  const outputPath = `${requestedOutputPath}.png`;
  const pixels = new Uint8Array(64 * 64 * 4);
  await writeFile(
    inputPath,
    encode({ width: 64, height: 64, data: pixels, channels: 4, depth: 8 }),
  );

  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH: inputPath,
      MINECRAFT_SKIN_EDITOR_E2E_SAVE_AS_PATH: requestedOutputPath,
      MINECRAFT_SKIN_EDITOR_E2E_UNSAVED_DECISION: 'discard',
    },
  });

  try {
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Open PNG' }).click();
    const preview = window.getByRole('img', { name: '3D skin preview' });
    const editorStatus = window.getByLabel('Editor status');
    const visibility = window.getByLabel('Visibility and focus');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('data-base-visible', 'true');
    await expect(preview).toHaveAttribute(
      'data-visible-body-parts',
      'head,torso,rightArm,leftArm,rightLeg,leftLeg',
    );

    const colors = window.getByLabel('Paint colors');
    const colorWorkspace = window.getByLabel('Color Workspace', {
      exact: true,
    });
    const colorControls = window.getByRole('region', {
      name: 'Color controls',
    });
    await expect(
      colors.getByRole('button', { name: 'Primary color', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      colors.getByRole('button', { name: 'Secondary color', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(
      colors.locator('.color-slot-button--primary').getByText('#000000', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      colors.locator('.color-slot-button--secondary').getByText('Alpha 255', {
        exact: true,
      }),
    ).toBeVisible();
    await colors
      .getByRole('button', { name: 'Secondary color', exact: true })
      .click();
    await expect(
      window.getByLabel('Exact secondary paint color'),
    ).toBeVisible();
    await window.getByLabel('Paint hex color').fill('#ABCDEF');
    await window.getByLabel('Paint hex color').press('Enter');
    await window.getByLabel('Paint alpha').fill('64');
    await expect(window.getByLabel('Selected RGBA color')).toHaveText(
      '#ABCDEF · A 64',
    );
    await colors
      .getByRole('button', { name: 'Primary color', exact: true })
      .click();
    await expect(window.getByLabel('Exact primary paint color')).toBeVisible();
    await expect(window.getByLabel('Selected RGBA color')).toHaveText(
      '#000000 · A 255',
    );
    await window.keyboard.press('x');
    await expect(window.getByLabel('Selected RGBA color')).toHaveText(
      '#ABCDEF · A 64',
    );
    await window.keyboard.press('d');
    await expect(window.getByLabel('Selected RGBA color')).toHaveText(
      '#000000 · A 255',
    );
    await window.getByLabel('Paint hex color').fill('#123456');
    await window.getByLabel('Paint hex color').press('Enter');
    await window.getByLabel('Paint alpha').fill('128');

    const advancedColors = colorControls;
    await expect(
      advancedColors.getByRole('group', { name: 'RGB channels' }),
    ).toBeVisible();
    await expect(
      advancedColors.getByRole('group', { name: 'HSV channels' }),
    ).toBeVisible();
    await expect(
      advancedColors.getByLabel('Visual color picker'),
    ).toBeVisible();
    await expect(advancedColors.getByLabel('Alpha slider')).toBeVisible();
    await expect(advancedColors.getByLabel('Advanced hex color')).toHaveValue(
      '#12345680',
    );
    await expect(
      advancedColors
        .getByLabel('Recent colors')
        .locator('[data-color="#12345680"]'),
    ).toBeVisible();
    await colorWorkspace
      .getByRole('button', {
        name: 'Add current color to swatches',
        exact: true,
      })
      .click();
    await expect(
      advancedColors.getByRole('button', {
        name: 'Apply #123456 swatch to Secondary',
        exact: true,
      }),
    ).toBeVisible();
    await advancedColors
      .getByRole('button', {
        name: 'Apply #123456 swatch to Secondary',
        exact: true,
      })
      .click();
    await colors
      .getByRole('button', { name: 'Secondary color', exact: true })
      .click();
    await expect(window.getByLabel('Selected RGBA color')).toHaveText(
      '#123456 · A 128',
    );
    await colors
      .getByRole('button', { name: 'Primary color', exact: true })
      .click();

    await visibility
      .getByRole('button', { name: 'Hide Head', exact: true })
      .click();
    await expect(preview).toHaveAttribute(
      'data-visible-body-parts',
      'torso,rightArm,leftArm,rightLeg,leftLeg',
    );
    await visibility
      .getByRole('button', { name: 'Isolate Left Arm', exact: true })
      .click();
    await expect(preview).toHaveAttribute('data-visible-body-parts', 'leftArm');
    await expect(
      visibility.getByRole('button', { name: 'Isolate Left Arm', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await visibility
      .getByRole('button', { name: 'Restore all visibility', exact: true })
      .click();
    await expect(preview).toHaveAttribute(
      'data-visible-body-parts',
      'head,torso,rightArm,leftArm,rightLeg,leftLeg',
    );
    await visibility
      .getByRole('button', { name: 'Show base layer', exact: true })
      .click();
    await expect(preview).toHaveAttribute('data-base-visible', 'false');
    await visibility
      .getByRole('button', { name: 'Restore all visibility', exact: true })
      .click();

    const previewBox = await preview.boundingBox();
    expect(previewBox).not.toBeNull();
    const pointer = {
      x: previewBox!.x + previewBox!.width / 2,
      y: previewBox!.y + previewBox!.height / 2,
    };
    await window.mouse.move(pointer.x, pointer.y);
    await expect(preview).toHaveAttribute('data-pick', /\d+,\d+$/);
    const pickData = await preview.getAttribute('data-pick');
    const pickMatch = pickData?.match(/:(\d+),(\d+)$/);
    expect(pickMatch).not.toBeNull();
    const pickedX = Number.parseInt(pickMatch![1]!, 10);
    const pickedY = Number.parseInt(pickMatch![2]!, 10);

    const revisionBeforePaint = await preview.getAttribute(
      'data-document-revision',
    );
    await window.mouse.down();
    await window.mouse.up();
    await expect(preview).not.toHaveAttribute(
      'data-document-revision',
      revisionBeforePaint!,
    );
    await expect(editorStatus.getByText('input-skin.png •')).toBeVisible();

    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-undo')?.click();
    });
    await expect(
      editorStatus.getByText('input-skin.png', { exact: true }),
    ).toBeVisible();
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-redo')?.click();
    });
    await expect(editorStatus.getByText('input-skin.png •')).toBeVisible();

    await colors
      .getByRole('button', { name: 'Secondary color', exact: true })
      .click();
    await window.getByLabel('Paint hex color').fill('#ABCDEF');
    await window.getByLabel('Paint hex color').press('Enter');
    await window.getByLabel('Paint alpha').fill('64');
    await window.mouse.move(pointer.x, pointer.y);
    await window.keyboard.down('Shift');
    await window.mouse.down();
    await window.mouse.up();
    await window.keyboard.up('Shift');
    await expect(editorStatus.getByText('input-skin.png •')).toBeVisible();

    await window.getByRole('button', { name: 'Save As…' }).click();
    await expect(editorStatus.getByText('saved-3d-copy.png')).toBeVisible();

    const saved = decode(await readFile(outputPath), { checkCrc: true });
    expect(saved.width).toBe(64);
    expect(saved.height).toBe(64);
    pixels.set([0xab, 0xcd, 0xef, 64], (pickedY * 64 + pickedX) * 4);
    expect(new Uint8Array(saved.data.buffer)).toEqual(pixels);
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('applies advanced paint tools through the contextual 2D inspector', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-advanced-e2e-'),
  );
  const inputPath = path.join(temporaryDirectory, 'advanced.png');
  const requestedOutputPath = path.join(temporaryDirectory, 'advanced-copy');
  const outputPath = `${requestedOutputPath}.png`;
  const pixels = new Uint8Array(64 * 64 * 4);
  const setPixel = (x: number, y: number, color: readonly number[]) => {
    pixels.set(color, (y * 64 + x) * 4);
  };
  setPixel(10, 10, [100, 100, 100, 128]);
  setPixel(11, 10, [100, 100, 100, 64]);
  setPixel(12, 10, [100, 100, 100, 91]);
  await writeFile(
    inputPath,
    encode({ width: 64, height: 64, data: pixels, channels: 4, depth: 8 }),
  );

  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH: inputPath,
      MINECRAFT_SKIN_EDITOR_E2E_SAVE_AS_PATH: requestedOutputPath,
      MINECRAFT_SKIN_EDITOR_E2E_UNSAVED_DECISION: 'discard',
    },
  });

  try {
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Open PNG' }).click();
    const canvas = window.getByRole('img', { name: '2D skin canvas' });
    const editorStatus = window.getByLabel('Editor status');
    const toolOptions = window.getByRole('region', { name: 'Tool options' });
    const zoomValue = window.getByTestId('zoom-value');
    await expect(canvas).toBeVisible();

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    await window.getByRole('button', { name: 'Fit' }).click();
    const fittedZoom =
      Number.parseInt((await zoomValue.textContent()) ?? '', 10) / 100;
    const fittedTextureLeft = (canvasBox!.width - 64 * fittedZoom) / 2;
    const fittedTextureTop = (canvasBox!.height - 64 * fittedZoom) / 2;
    const fittedTexturePoint = (x: number, y: number) => ({
      x: canvasBox!.x + fittedTextureLeft + (x + 0.5) * fittedZoom,
      y: canvasBox!.y + fittedTextureTop + (y + 0.5) * fittedZoom,
    });

    await window.getByRole('button', { name: 'Lighten' }).click();
    await expect(toolOptions).toHaveAttribute('data-tool', 'lighten');
    await window.getByLabel('Lighten strength').press('End');
    await expect(window.getByLabel('Strength value')).toHaveText('100%');
    const lightenTarget = fittedTexturePoint(10, 10);
    await window.mouse.click(lightenTarget.x, lightenTarget.y);

    await window.getByRole('button', { name: 'Darken' }).click();
    await expect(toolOptions).toHaveAttribute('data-tool', 'darken');
    await window.getByLabel('Darken strength').press('End');
    const darkenTarget = fittedTexturePoint(11, 10);
    await window.mouse.click(darkenTarget.x, darkenTarget.y);

    await window.getByRole('button', { name: 'Noise' }).click();
    await expect(toolOptions).toHaveAttribute('data-tool', 'noise');
    await window.getByLabel('Noise strength').press('End');
    await window.getByLabel('Noise seed').fill('7');
    const noiseTarget = fittedTexturePoint(12, 10);
    await window.mouse.click(noiseTarget.x, noiseTarget.y);
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('edit-undo')?.click();
    });

    await window.getByRole('button', { name: 'Stamp' }).click();
    await expect(toolOptions).toHaveAttribute('data-tool', 'stamp');
    const stampTarget = fittedTexturePoint(20, 20);
    await window.mouse.click(stampTarget.x, stampTarget.y);
    await expect(editorStatus.getByText('advanced.png •')).toBeVisible();

    const historySummary = window.getByRole('button', { name: /^History/ });
    await historySummary.click();
    await expect(
      window.getByRole('button', { name: 'Lighten Stroke · Undo' }),
    ).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Darken Stroke · Undo' }),
    ).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Stamp · Current' }),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Darken Stroke · Undo' }).click();
    await expect(
      window.getByRole('button', { name: 'Stamp · Redo' }),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Stamp · Redo' }).click();
    await expect(
      window.getByRole('button', { name: 'Stamp · Current' }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Save As…' }).click();
    await expect(editorStatus.getByText('advanced-copy.png')).toBeVisible();

    const saved = decode(await readFile(outputPath), { checkCrc: true });
    expect(saved.width).toBe(64);
    expect(saved.height).toBe(64);
    setPixel(10, 10, [255, 255, 255, 128]);
    setPixel(11, 10, [0, 0, 0, 64]);
    setPixel(20, 20, [0, 0, 0, 255]);
    setPixel(21, 20, [255, 255, 255, 255]);
    setPixel(20, 21, [255, 255, 255, 255]);
    setPixel(21, 21, [0, 0, 0, 255]);
    expect(new Uint8Array(saved.data.buffer)).toEqual(pixels);
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('applies Lighten to one exact picked 3D texel', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-advanced-3d-e2e-'),
  );
  const inputPath = path.join(temporaryDirectory, 'advanced-3d.png');
  const requestedOutputPath = path.join(temporaryDirectory, 'advanced-3d-copy');
  const outputPath = `${requestedOutputPath}.png`;
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels.set([100, 100, 100, 128], offset);
  }
  await writeFile(
    inputPath,
    encode({ width: 64, height: 64, data: pixels, channels: 4, depth: 8 }),
  );

  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH: inputPath,
      MINECRAFT_SKIN_EDITOR_E2E_SAVE_AS_PATH: requestedOutputPath,
      MINECRAFT_SKIN_EDITOR_E2E_UNSAVED_DECISION: 'discard',
    },
  });

  try {
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Open PNG' }).click();
    const preview = window.getByRole('img', { name: '3D skin preview' });
    const toolOptions = window.getByRole('region', { name: 'Tool options' });
    const editorStatus = window.getByLabel('Editor status');
    await expect(preview).toBeVisible();

    await window.getByRole('button', { name: 'Lighten' }).click();
    await window.getByLabel('Lighten strength').press('End');
    const previewBox = await preview.boundingBox();
    expect(previewBox).not.toBeNull();
    const pointer = {
      x: previewBox!.x + previewBox!.width / 2,
      y: previewBox!.y + previewBox!.height / 2,
    };
    await window.mouse.move(pointer.x, pointer.y);
    await expect(preview).toHaveAttribute('data-pick', /\d+,\d+$/);
    const pickData = await preview.getAttribute('data-pick');
    const pickMatch = pickData?.match(/:(\d+),(\d+)$/);
    expect(pickMatch).not.toBeNull();
    const pickedX = Number.parseInt(pickMatch![1]!, 10);
    const pickedY = Number.parseInt(pickMatch![2]!, 10);
    const revisionBeforePaint = await preview.getAttribute(
      'data-document-revision',
    );
    await window.mouse.click(pointer.x, pointer.y);
    await expect(preview).not.toHaveAttribute(
      'data-document-revision',
      revisionBeforePaint!,
    );
    await expect(toolOptions).toHaveAttribute('data-tool', 'lighten');
    await expect(editorStatus.getByText('advanced-3d.png •')).toBeVisible();

    await window.getByRole('button', { name: 'Save As…' }).click();
    const saved = decode(await readFile(outputPath), { checkCrc: true });
    expect(saved.width).toBe(64);
    expect(saved.height).toBe(64);
    pixels.set([255, 255, 255, 128], (pickedY * 64 + pickedX) * 4);
    expect(new Uint8Array(saved.data.buffer)).toEqual(pixels);
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('keeps multiple documents independent and manages the local library', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-library-e2e-'),
  );
  const libraryDirectory = path.join(temporaryDirectory, 'library');
  const firstPath = path.join(temporaryDirectory, 'first.png');
  const secondSaveAsPath = path.join(temporaryDirectory, 'second-saved');
  const libraryEntryPath = path.join(libraryDirectory, 'library-one.png');
  const firstPixels = new Uint8Array(64 * 64 * 4);
  firstPixels.set([11, 22, 33, 255], 0);
  const libraryPixels = new Uint8Array(64 * 64 * 4);
  libraryPixels.set([44, 55, 66, 255], 0);
  await mkdir(libraryDirectory, { recursive: true });
  await writeFile(
    firstPath,
    encode({
      width: 64,
      height: 64,
      data: firstPixels,
      channels: 4,
      depth: 8,
    }),
  );
  await writeFile(
    libraryEntryPath,
    encode({
      width: 64,
      height: 64,
      data: libraryPixels,
      channels: 4,
      depth: 8,
    }),
  );

  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH: firstPath,
      MINECRAFT_SKIN_EDITOR_E2E_SAVE_AS_PATH: secondSaveAsPath,
      MINECRAFT_SKIN_EDITOR_E2E_LIBRARY_DIR: libraryDirectory,
    },
  });

  try {
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Expand Library' }).click();
    await expect(
      window.getByRole('button', { name: 'Open library-one.png' }),
    ).toBeVisible({ timeout: 15_000 });

    await window.getByRole('button', { name: 'Open PNG' }).click();
    const firstTab = window.getByRole('tab', { name: /first\.png/ });
    await expect(firstTab).toBeVisible();
    await window.getByRole('button', { name: 'Slim', exact: true }).click();

    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('file-new')?.click();
    });
    const newSkinDialog = window.getByRole('dialog', { name: 'New Skin' });
    await expect(newSkinDialog).toBeVisible();
    await newSkinDialog
      .getByRole('button', { name: 'Create', exact: true })
      .click();
    const secondTab = window.getByRole('tab', { name: /Untitled\.png/ });
    await expect(secondTab).toBeVisible();

    const canvas = window.getByRole('img', { name: '2D skin canvas' });
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    await window.mouse.click(
      canvasBox!.x + canvasBox!.width / 2,
      canvasBox!.y + canvasBox!.height / 2,
    );
    await expect(secondTab).toContainText('•');

    await firstTab.click();
    await expect(
      window.getByRole('img', { name: '3D skin preview' }),
    ).toHaveAttribute('data-skin-model', 'slim');
    await expect(window.locator('.skin-preview-canvas')).toHaveCount(1);
    await secondTab.click();
    await expect(
      window.getByRole('img', { name: '3D skin preview' }),
    ).toHaveAttribute('data-skin-model', 'classic');
    await expect(window.locator('.skin-preview-canvas')).toHaveCount(1);

    await window.getByRole('button', { name: 'Save All', exact: true }).click();
    await expect(firstTab).not.toContainText('•');
    const savedSecondTab = window.getByRole('tab', {
      name: /second-saved\.png/,
    });
    await expect(savedSecondTab).not.toContainText('•');
    const savedSecond = decode(await readFile(`${secondSaveAsPath}.png`), {
      checkCrc: true,
    });
    expect(savedSecond.width).toBe(64);
    expect(savedSecond.height).toBe(64);

    const invalidLibraryPath = await window.evaluate(async () => {
      const browser = globalThis as typeof globalThis & {
        skinLibrary?: {
          openLibrarySkin(filePath: string): Promise<unknown>;
        };
      };
      return browser.skinLibrary?.openLibrarySkin('../outside.png');
    });
    expect(invalidLibraryPath).toEqual({
      status: 'error',
      error: {
        code: 'read_failed',
        message:
          'The selected library entry is not a valid PNG in the application library.',
      },
    });

    await window
      .getByRole('button', { name: 'Open library-one.png' })
      .dragTo(window.locator('.application-shell'));
    const libraryTab = window.getByRole('tab', { name: /library-one\.png/ });
    await expect(libraryTab).toBeVisible();
    await window
      .getByRole('button', { name: 'Rename library-one.png' })
      .click();
    await window
      .getByLabel('New name for library-one.png')
      .fill('library-renamed.png');
    await window
      .getByRole('button', { name: 'Save rename for library-one.png' })
      .click();
    await expect(
      window.getByRole('button', { name: 'Open library-renamed.png' }),
    ).toBeVisible();

    await window
      .getByRole('button', { name: 'Duplicate library-renamed.png' })
      .click();
    await expect(
      window.getByRole('button', { name: 'Open library-renamed Copy.png' }),
    ).toBeVisible();

    await window
      .getByRole('button', { name: 'Delete library-renamed.png' })
      .click();
    await window
      .getByRole('button', { name: 'Confirm delete library-renamed.png' })
      .click();
    await expect(
      window.getByRole('button', { name: 'Open library-renamed.png' }),
    ).toHaveCount(0);
    expect(await readdir(libraryDirectory)).toEqual([
      'library-renamed Copy.png',
    ]);
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('organizes library skins with thumbnails, search, collections, recents, and reveal', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-library-ux-e2e-'),
  );
  const libraryDirectory = path.join(temporaryDirectory, 'library');
  const recentStorePath = path.join(temporaryDirectory, 'recent-skins.json');
  const libraryPath = path.join(libraryDirectory, 'artist.png');
  const recentSourceDirectory = path.join(temporaryDirectory, 'recent-sources');
  const savedRecentPath = path.join(temporaryDirectory, 'saved-recent.png');
  const initialPixels = new Uint8Array(64 * 64 * 4);
  initialPixels.set([15, 25, 35, 255], 0);
  const initialBytes = encode({
    width: 64,
    height: 64,
    data: initialPixels,
    channels: 4,
    depth: 8,
  });
  await mkdir(libraryDirectory, { recursive: true });
  await mkdir(recentSourceDirectory, { recursive: true });
  await writeFile(libraryPath, initialBytes);
  const initialMetadata = await stat(libraryPath);

  let application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_LIBRARY_DIR: libraryDirectory,
      MINECRAFT_SKIN_EDITOR_RECENTS_PATH: recentStorePath,
    },
  });

  try {
    let window = await application.firstWindow();
    await window.getByRole('button', { name: 'Expand Library' }).click();
    await expect(window.getByAltText('artist.png thumbnail')).toBeVisible({
      timeout: 15_000,
    });
    const initialListing = await window.evaluate(async () => {
      const browser = globalThis as typeof globalThis & {
        skinLibrary?: {
          listLibrarySkins(): Promise<{
            status: string;
            entries: Array<{ displayName: string; thumbnailDataUrl?: string }>;
          }>;
        };
      };
      return browser.skinLibrary?.listLibrarySkins();
    });
    expect(initialListing?.status).toBe('success');
    expect(initialListing?.entries[0]?.thumbnailDataUrl).toMatch(
      /^data:image\/png;base64,/,
    );

    const cacheUpdatedPixels = new Uint8Array(initialPixels);
    cacheUpdatedPixels.set([16, 25, 35, 255], 0);
    const cacheUpdatedBytes = encode({
      width: 64,
      height: 64,
      data: cacheUpdatedPixels,
      channels: 4,
      depth: 8,
    });
    expect(cacheUpdatedBytes.byteLength).toBe(initialBytes.byteLength);
    const updatedLibrarySave = await window.evaluate(
      async ({ bytes, filePath }) => {
        const browser = globalThis as typeof globalThis & {
          skinFiles?: {
            saveSkinPng(request: {
              filePath: string;
              bytes: Uint8Array;
            }): Promise<{ status: string }>;
          };
        };
        return browser.skinFiles?.saveSkinPng({
          filePath,
          bytes: Uint8Array.from(bytes),
        });
      },
      { bytes: Array.from(cacheUpdatedBytes), filePath: libraryPath },
    );
    expect(updatedLibrarySave).toEqual({ status: 'success' });
    await utimes(libraryPath, initialMetadata.atime, initialMetadata.mtime);
    await window.getByRole('button', { name: 'Refresh local library' }).click();
    const updatedSaveListing = await window.evaluate(async () => {
      const browser = globalThis as typeof globalThis & {
        skinLibrary?: {
          listLibrarySkins(): Promise<{
            status: string;
            entries: Array<{ displayName: string; thumbnailDataUrl?: string }>;
          }>;
        };
      };
      return browser.skinLibrary?.listLibrarySkins();
    });
    expect(updatedSaveListing?.entries[0]?.thumbnailDataUrl).not.toBe(
      initialListing?.entries[0]?.thumbnailDataUrl,
    );

    const restoredLibrarySave = await window.evaluate(
      async ({ bytes, filePath }) => {
        const browser = globalThis as typeof globalThis & {
          skinFiles?: {
            saveSkinPng(request: {
              filePath: string;
              bytes: Uint8Array;
            }): Promise<{ status: string }>;
          };
        };
        return browser.skinFiles?.saveSkinPng({
          filePath,
          bytes: Uint8Array.from(bytes),
        });
      },
      { bytes: Array.from(initialBytes), filePath: libraryPath },
    );
    expect(restoredLibrarySave).toEqual({ status: 'success' });
    await utimes(libraryPath, initialMetadata.atime, initialMetadata.mtime);
    await window.getByRole('button', { name: 'Refresh local library' }).click();

    const recentSourcePaths = Array.from({ length: 13 }, (_, index) =>
      path.join(recentSourceDirectory, `recent-${index + 1}.png`),
    );
    const recentSourceBytes = encode({
      width: 64,
      height: 64,
      data: new Uint8Array(64 * 64 * 4),
      channels: 4,
      depth: 8,
    });
    for (const recentSourcePath of recentSourcePaths) {
      await writeFile(recentSourcePath, recentSourceBytes);
    }
    const recordedRecent = await window.evaluate(async (filePaths) => {
      const browser = globalThis as typeof globalThis & {
        skinFiles?: {
          recordRecentSkin(request: {
            filePath: string;
            displayName: string;
          }): Promise<{ status: string }>;
          listRecentSkins(): Promise<{
            status: string;
            entries: Array<{ filePath: string }>;
          }>;
        };
      };
      const api = browser.skinFiles!;
      const results = await Promise.all(
        filePaths.map((filePath) =>
          api.recordRecentSkin({
            filePath,
            displayName: filePath.split(/[\\/]/).pop() ?? filePath,
          }),
        ),
      );
      return {
        results,
        listing: await api.listRecentSkins(),
      };
    }, recentSourcePaths);
    expect(
      recordedRecent.results.every((result) => result.status === 'success'),
    ).toBe(true);
    expect(recordedRecent.listing.entries).toHaveLength(12);
    expect(
      new Set(recordedRecent.listing.entries.map((entry) => entry.filePath))
        .size,
    ).toBe(12);

    const savedRecent = await window.evaluate(
      async ({ filePath, bytes }) => {
        const browser = globalThis as typeof globalThis & {
          skinFiles?: {
            saveSkinPng(request: {
              filePath: string;
              bytes: Uint8Array;
            }): Promise<{ status: string }>;
            listRecentSkins(): Promise<{
              status: string;
              entries: Array<{ filePath: string }>;
            }>;
          };
        };
        const api = browser.skinFiles!;
        const result = await api.saveSkinPng({
          filePath,
          bytes: Uint8Array.from(bytes),
        });
        return { result, listing: await api.listRecentSkins() };
      },
      { filePath: savedRecentPath, bytes: Array.from(recentSourceBytes) },
    );
    expect(savedRecent.result).toEqual({ status: 'success' });
    expect(savedRecent.listing.entries[0]?.filePath).toBe(savedRecentPath);

    await window
      .getByRole('button', { name: 'Create library collection' })
      .click();
    await window.getByLabel('New collection name').fill('Characters');
    await window
      .getByRole('button', { name: 'Create collection', exact: true })
      .click();
    await expect(
      window.getByRole('option', { name: /Characters \(0\)/ }),
    ).toBeAttached();

    await window
      .locator('[data-testid="library-entry"]')
      .filter({ hasText: 'artist.png' })
      .getByText(/Collections/)
      .click();
    await window.getByLabel('Add artist.png to Characters').click();
    await expect(
      window.getByRole('option', { name: /Characters \(1\)/ }),
    ).toBeAttached();
    const invalidRename = await window.evaluate(async (filePath) => {
      const browser = globalThis as typeof globalThis & {
        skinLibrary?: {
          renameLibrarySkin(request: {
            filePath: string;
            displayName: string;
          }): Promise<unknown>;
        };
      };
      return browser.skinLibrary?.renameLibrarySkin({
        filePath,
        displayName: 'CON.png',
      });
    }, libraryPath);
    expect(invalidRename).toEqual({
      status: 'error',
      error: {
        code: 'write_failed',
        message: 'Choose a safe PNG filename within the application library.',
      },
    });
    await window.getByRole('button', { name: 'Open artist.png' }).click();
    await expect(
      window.getByRole('tab', { name: /artist\.png/ }),
    ).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Open recent artist.png' }),
    ).toBeVisible();

    await window.getByLabel('Search local library').fill('characters');
    await expect(
      window.getByRole('button', { name: 'Open artist.png' }),
    ).toBeVisible();
    await window.getByLabel('Search local library').fill('');
    await window
      .getByLabel('Filter local library by collection')
      .selectOption({ label: 'Characters (1)' });
    await expect(
      window.getByRole('button', { name: 'Open artist.png' }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Rename artist.png' }).click();
    await window
      .getByLabel('New name for artist.png')
      .fill('artist-renamed.png');
    await window
      .getByRole('button', { name: 'Save rename for artist.png' })
      .click();
    const renamedPath = path.join(libraryDirectory, 'artist-renamed.png');
    await expect(
      window.getByRole('button', { name: 'Open artist-renamed.png' }),
    ).toBeVisible();
    await expect(
      window.getByRole('tab', { name: /artist-renamed\.png/ }),
    ).toBeVisible();

    const renamedListing = await window.evaluate(async () => {
      const browser = globalThis as typeof globalThis & {
        skinLibrary?: {
          listLibrarySkins(): Promise<{
            status: string;
            entries: Array<{
              displayName: string;
              collectionIds: string[];
            }>;
            collections: Array<{ displayName: string; entryCount: number }>;
          }>;
        };
      };
      return browser.skinLibrary?.listLibrarySkins();
    });
    expect(renamedListing?.entries[0]?.displayName).toBe('artist-renamed.png');
    expect(renamedListing?.entries[0]?.collectionIds).toHaveLength(1);
    expect(renamedListing?.collections[0]).toMatchObject({
      displayName: 'Characters',
      entryCount: 1,
    });

    await window
      .getByRole('button', { name: 'Duplicate artist-renamed.png' })
      .click();
    await expect(
      window.getByRole('button', { name: 'Open artist-renamed Copy.png' }),
    ).toBeVisible();
    await expect(
      window
        .locator(
          'select[aria-label="Filter local library by collection"] option',
        )
        .filter({ hasText: /Characters \(2\)/ }),
    ).toBeAttached();
    const duplicatedListing = await window.evaluate(async () => {
      const browser = globalThis as typeof globalThis & {
        skinLibrary?: {
          listLibrarySkins(): Promise<{
            status: string;
            entries: Array<{
              displayName: string;
              collectionIds: string[];
            }>;
          }>;
        };
      };
      return browser.skinLibrary?.listLibrarySkins();
    });
    expect(
      duplicatedListing?.entries.find(
        (entry) => entry.displayName === 'artist-renamed Copy.png',
      )?.collectionIds,
    ).toHaveLength(1);
    await window
      .getByRole('button', { name: 'Open artist-renamed Copy.png' })
      .click();
    await expect(
      window.getByRole('tab', { name: /artist-renamed Copy\.png/ }),
    ).toBeVisible();

    await application.close();
    application = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        MINECRAFT_SKIN_EDITOR_E2E: '1',
        MINECRAFT_SKIN_EDITOR_E2E_LIBRARY_DIR: libraryDirectory,
        MINECRAFT_SKIN_EDITOR_RECENTS_PATH: recentStorePath,
      },
    });
    window = await application.firstWindow();
    await window.getByRole('button', { name: 'Expand Library' }).click();
    await expect(
      window
        .locator(
          'select[aria-label="Filter local library by collection"] option',
        )
        .filter({ hasText: /Characters \(2\)/ }),
    ).toBeAttached();
    await expect(
      window.getByRole('button', { name: 'Open recent artist-renamed.png' }),
    ).toBeVisible();
    await expect(
      window.getByRole('button', {
        name: 'Open recent artist-renamed Copy.png',
      }),
    ).toBeVisible();

    const revealResult = await window.evaluate(async (filePath) => {
      const browser = globalThis as typeof globalThis & {
        skinLibrary?: {
          revealLibrarySkin(filePath: string): Promise<unknown>;
        };
      };
      return browser.skinLibrary?.revealLibrarySkin(filePath);
    }, renamedPath);
    expect(revealResult).toEqual({ status: 'success' });

    const updatedPixels = new Uint8Array(64 * 64 * 4);
    updatedPixels.set([210, 120, 30, 255], 0);
    await writeFile(
      renamedPath,
      encode({
        width: 64,
        height: 64,
        data: updatedPixels,
        channels: 4,
        depth: 8,
      }),
    );
    await window.getByRole('button', { name: 'Refresh local library' }).click();
    const updatedListing = await window.evaluate(async () => {
      const browser = globalThis as typeof globalThis & {
        skinLibrary?: {
          listLibrarySkins(): Promise<{
            status: string;
            entries: Array<{
              displayName: string;
              thumbnailDataUrl?: string;
            }>;
          }>;
        };
      };
      return browser.skinLibrary?.listLibrarySkins();
    });
    const updatedThumbnail = updatedListing?.entries.find(
      (entry) => entry.displayName === 'artist-renamed.png',
    )?.thumbnailDataUrl;
    expect(updatedThumbnail).toBeDefined();
    expect(updatedThumbnail).not.toBe(
      initialListing?.entries[0]?.thumbnailDataUrl,
    );

    const recentListing = await window.evaluate(async () => {
      const browser = globalThis as typeof globalThis & {
        skinFiles?: {
          listRecentSkins(): Promise<{
            status: string;
            entries: Array<{ filePath: string }>;
          }>;
        };
      };
      return browser.skinFiles?.listRecentSkins();
    });
    expect(
      recentListing?.entries.filter((entry) => entry.filePath === renamedPath),
    ).toHaveLength(1);

    await rm(renamedPath, { force: true });
    await window.getByRole('button', { name: 'Refresh local library' }).click();
    await expect(window.getByText('Missing', { exact: true })).toBeVisible();
    await window
      .getByRole('button', { name: 'Remove recent artist-renamed.png' })
      .click();
    await window
      .getByRole('button', { name: 'Remove recent artist-renamed Copy.png' })
      .click();
    await expect(
      window.getByRole('button', {
        name: 'Remove recent artist-renamed.png',
      }),
    ).toHaveCount(0);
    await expect(
      window.getByRole('button', {
        name: 'Remove recent artist-renamed Copy.png',
      }),
    ).toHaveCount(0);
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('exports a current 3D preview snapshot without dirtying the skin', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-snapshot-e2e-'),
  );
  const inputPath = path.join(temporaryDirectory, 'snapshot-source.png');
  const snapshotPath = path.join(temporaryDirectory, 'preview-snapshot');
  const canceledSnapshotPath = path.join(
    temporaryDirectory,
    'canceled-snapshot',
  );
  await writeFile(
    inputPath,
    encode({
      width: 64,
      height: 64,
      data: new Uint8Array(64 * 64 * 4),
      channels: 4,
      depth: 8,
    }),
  );

  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH: inputPath,
      MINECRAFT_SKIN_EDITOR_E2E_SNAPSHOT_PATH: snapshotPath,
    },
  });

  try {
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Open PNG' }).click();
    const preview = window.getByRole('img', { name: '3D skin preview' });
    const editorStatus = window.getByLabel('Editor status');
    await expect(preview).toHaveAttribute('data-preview-ready', 'true');
    const viewportSize = await preview.evaluate((element) => {
      interface BrowserCanvas {
        readonly width: number;
        readonly height: number;
      }
      const canvas = element as unknown as BrowserCanvas;
      return {
        width: canvas.width,
        height: canvas.height,
        revision: element.getAttribute('data-document-revision'),
      };
    });

    await window.getByRole('button', { name: 'Show outer layer' }).click();
    const previewBox = await preview.boundingBox();
    expect(previewBox).not.toBeNull();
    await window.mouse.move(
      previewBox!.x + previewBox!.width / 2,
      previewBox!.y + previewBox!.height / 2,
    );
    await window.mouse.down({ button: 'right' });
    await window.mouse.move(
      previewBox!.x + previewBox!.width * 0.68,
      previewBox!.y + previewBox!.height * 0.42,
    );
    await window.mouse.up({ button: 'right' });

    await window.getByRole('button', { name: 'Snapshot', exact: true }).click();
    await expect(
      window.getByText('Snapshot saved as preview-snapshot.png.', {
        exact: true,
      }),
    ).toBeVisible();
    const saved = decode(await readFile(`${snapshotPath}.png`), {
      checkCrc: true,
    });
    expect(saved.width).toBe(viewportSize.width);
    expect(saved.height).toBe(viewportSize.height);
    expect(await preview.getAttribute('data-document-revision')).toBe(
      viewportSize.revision,
    );
    await expect(
      editorStatus.getByText('snapshot-source.png', { exact: true }),
    ).toBeVisible();
    await expect(editorStatus.getByText('snapshot-source.png •')).toHaveCount(
      0,
    );
    await expect(
      window.getByRole('button', { name: /^History/ }),
    ).toContainText('1 / 1');
  } finally {
    await application.close();
  }

  const cancellationApplication = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH: inputPath,
      MINECRAFT_SKIN_EDITOR_E2E_SNAPSHOT_PATH: canceledSnapshotPath,
      MINECRAFT_SKIN_EDITOR_E2E_SNAPSHOT_CANCEL: '1',
    },
  });
  try {
    const window = await cancellationApplication.firstWindow();
    await window.getByRole('button', { name: 'Open PNG' }).click();
    await window.getByRole('button', { name: 'Snapshot', exact: true }).click();
    await expect(
      window.getByText('Snapshot saved as canceled-snapshot.png.', {
        exact: true,
      }),
    ).toHaveCount(0);
    expect(await readdir(temporaryDirectory)).not.toContain(
      'canceled-snapshot.png',
    );
  } finally {
    await cancellationApplication.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('opens a bound pop-out preview, propagates updates, and disposes on close', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-popout-e2e-'),
  );
  const inputPath = path.join(temporaryDirectory, 'bound-source.png');
  const snapshotPath = path.join(temporaryDirectory, 'popout-snapshot');
  await writeFile(
    inputPath,
    encode({
      width: 64,
      height: 64,
      data: new Uint8Array(64 * 64 * 4),
      channels: 4,
      depth: 8,
    }),
  );

  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH: inputPath,
      MINECRAFT_SKIN_EDITOR_E2E_SNAPSHOT_PATH: snapshotPath,
      MINECRAFT_SKIN_EDITOR_E2E_UNSAVED_DECISION: 'discard',
    },
  });

  try {
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Open PNG' }).click();
    const firstTab = window.getByRole('tab', { name: /bound-source\.png/ });
    const popoutPromise = application.waitForEvent('window');
    await window.getByRole('button', { name: 'Pop Out' }).click();
    const popout = await popoutPromise;
    const popoutPreview = popout.getByRole('img', {
      name: '3D skin preview',
    });
    await expect(popoutPreview).toBeVisible();
    await expect(popout).toHaveTitle('bound-source.png — 3D Preview');
    await expect(popoutPreview).toHaveAttribute('data-skin-model', 'classic');
    await expect(popoutPreview).toHaveAttribute('data-bound-document-id', /.+/);
    const security = await popout.evaluate(() => ({
      hasCommonJsRequire: 'require' in globalThis,
      hasElectronBridge: 'electron' in globalThis,
    }));
    expect(security).toEqual({
      hasCommonJsRequire: false,
      hasElectronBridge: false,
    });

    await window.getByRole('button', { name: 'Show outer layer' }).click();
    await expect(popoutPreview).toHaveAttribute('data-outer-visible', 'false');

    await window.bringToFront();
    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('file-new')?.click();
    });
    const dialog = window.getByRole('dialog', { name: 'New Skin' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    const secondTab = window.getByRole('tab', { name: /Untitled\.png/ });
    await expect(secondTab).toBeVisible();
    await window.getByRole('button', { name: 'Slim', exact: true }).click();
    await expect(popoutPreview).toHaveAttribute('data-skin-model', 'classic');
    await expect(popout).toHaveTitle('bound-source.png — 3D Preview');

    await firstTab.click();
    await window.getByRole('button', { name: 'Slim', exact: true }).click();
    await expect(popoutPreview).toHaveAttribute('data-skin-model', 'slim');

    const popoutBox = await popoutPreview.boundingBox();
    expect(popoutBox).not.toBeNull();
    await popout.mouse.move(
      popoutBox!.x + popoutBox!.width / 2,
      popoutBox!.y + popoutBox!.height / 2,
    );
    await popout.mouse.down({ button: 'right' });
    await popout.mouse.move(
      popoutBox!.x + popoutBox!.width * 0.64,
      popoutBox!.y + popoutBox!.height * 0.46,
    );
    await popout.mouse.up({ button: 'right' });
    await popout.getByRole('button', { name: 'Snapshot', exact: true }).click();
    await expect(popout.getByRole('status')).toHaveText(
      'Snapshot saved as popout-snapshot.png.',
    );
    const popoutSaved = decode(await readFile(`${snapshotPath}.png`), {
      checkCrc: true,
    });
    const popoutSize = await popoutPreview.evaluate((element) => {
      interface BrowserCanvas {
        readonly width: number;
        readonly height: number;
      }
      const canvas = element as unknown as BrowserCanvas;
      return { width: canvas.width, height: canvas.height };
    });
    expect(popoutSaved.width).toBe(popoutSize.width);
    expect(popoutSaved.height).toBe(popoutSize.height);

    await window.bringToFront();
    await window.getByRole('button', { name: 'Pop Out' }).click();
    expect(application.windows()).toHaveLength(2);
    await popout.close();
    await expect.poll(() => application.windows().length).toBe(1);

    const reopenedPromise = application.waitForEvent('window');
    await window.bringToFront();
    await window.getByRole('button', { name: 'Pop Out' }).click();
    const reopened = await reopenedPromise;
    await expect(
      reopened.getByRole('img', { name: '3D skin preview' }),
    ).toBeVisible();
    await expect(reopened).toHaveTitle('bound-source.png — 3D Preview');
    await reopened.close();
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('keeps the 2D-first layout coherent across supported desktop sizes', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-layout-e2e-'),
  );
  const inputPath = path.join(temporaryDirectory, 'layout.png');
  await writeFile(
    inputPath,
    encode({
      width: 64,
      height: 64,
      data: new Uint8Array(64 * 64 * 4),
      channels: 4,
      depth: 8,
    }),
  );
  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH: inputPath,
    },
  });

  try {
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Open PNG' }).click();

    for (const [width, height] of [
      [1600, 900],
      [1200, 760],
      [800, 560],
    ] as const) {
      await application.evaluate(
        ({ BrowserWindow }, size) => {
          BrowserWindow.getAllWindows()[0]?.setContentSize(
            size.width,
            size.height,
          );
        },
        { width, height },
      );
      await expect(
        window.getByRole('img', { name: '3D skin preview' }),
      ).toBeVisible();

      const metrics = await window.evaluate(() => {
        interface BrowserElement {
          readonly scrollWidth: number;
          readonly clientWidth: number;
          getBoundingClientRect(): { readonly width: number };
        }
        const browser = globalThis as unknown as {
          readonly innerWidth: number;
          readonly innerHeight: number;
          readonly document: {
            readonly documentElement: {
              readonly scrollWidth: number;
              readonly scrollHeight: number;
            };
            querySelector(selector: string): BrowserElement | null;
          };
        };
        const bounds = (selector: string) =>
          browser.document.querySelector(selector)!.getBoundingClientRect();
        const preview = browser.document.querySelector('.skin-preview-panel')!;
        const previewToolbar = browser.document.querySelector(
          '.skin-preview-toolbar',
        )!;
        const previewControls = browser.document.querySelector(
          '.skin-preview-controls',
        )!;
        const status = browser.document.querySelector('.editor-status-bar')!;
        return {
          bodyFits:
            browser.document.documentElement.scrollWidth ===
              browser.innerWidth &&
            browser.document.documentElement.scrollHeight ===
              browser.innerHeight,
          stageWidth: bounds('.canvas-stage').width,
          previewWidth: preview.getBoundingClientRect().width,
          previewToolbarFits:
            previewToolbar.scrollWidth <= previewToolbar.clientWidth,
          previewControlsFit:
            previewControls.scrollWidth <= previewControls.clientWidth,
          statusFits: status.scrollWidth <= status.clientWidth,
        };
      });

      expect(metrics).toMatchObject({
        bodyFits: true,
        previewToolbarFits: true,
        previewControlsFit: true,
        statusFits: true,
      });
      expect(metrics.previewWidth).toBeGreaterThanOrEqual(244);
      expect(metrics.stageWidth).toBeGreaterThan(metrics.previewWidth);
    }
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('resizes, collapses, restores, persists, and resets the artist workspace', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-workspace-e2e-'),
  );
  const inputPath = path.join(temporaryDirectory, 'workspace.png');
  await writeFile(
    inputPath,
    encode({
      width: 64,
      height: 64,
      data: new Uint8Array(64 * 64 * 4),
      channels: 4,
      depth: 8,
    }),
  );
  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH: inputPath,
    },
  });

  try {
    const window = await application.firstWindow();
    const resetLayout = window.getByRole('button', { name: 'Reset Layout' });
    await expect(resetLayout).toBeVisible({ timeout: 15_000 });
    await resetLayout.click();
    await window.getByRole('button', { name: 'Open PNG' }).click();

    const preview = window.getByRole('img', { name: '3D skin preview' });
    const previewCanvas = window.locator('.skin-preview-canvas');
    const canvas = window.getByRole('img', { name: '2D skin canvas' });
    const leftSlot = window.locator('.workspace-side-slot--left');
    const rightSlot = window.locator('.workspace-side-slot--right');
    const leftSplitter = window.getByTestId('workspace-splitter-left');
    const rightSplitter = window.getByTestId('workspace-splitter-right');
    const inspectorSplitter = window.getByTestId(
      'workspace-splitter-inspector',
    );
    const colorSplitter = window.getByTestId('workspace-splitter-color');
    const colorWorkspace = window.getByLabel('Color Workspace', {
      exact: true,
    });

    await expect(canvas).toBeVisible();
    await expect(preview).toHaveAttribute('data-document-revision', '0');
    await expect(leftSplitter).toHaveAttribute('aria-valuenow', '200');
    await expect(rightSplitter).toHaveAttribute('aria-valuenow', '300');
    await expect(inspectorSplitter).toHaveAttribute('aria-valuenow', '260');
    await expect(colorSplitter).toHaveAttribute('aria-valuenow', '220');
    await expect(colorSplitter).toHaveAttribute(
      'aria-label',
      'Resize Library and Tool Options',
    );
    await expect(
      window.getByRole('button', { name: 'Expand Library' }),
    ).toHaveAttribute('aria-expanded', 'false');
    await expect(window.getByLabel('Search local library')).toHaveCount(0);

    const compactColorBefore = await colorWorkspace.boundingBox();
    const compactLeftSlot = await leftSlot.boundingBox();
    expect(compactColorBefore).not.toBeNull();
    expect(compactLeftSlot).not.toBeNull();
    expect(compactColorBefore!.height).toBeGreaterThan(
      compactLeftSlot!.height / 2,
    );

    await window.getByRole('button', { name: 'Expand Library' }).click();
    await expect(
      window.getByRole('button', { name: 'Collapse Library' }),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(window.getByLabel('Search local library')).toBeVisible();
    await expect(colorSplitter).toHaveAttribute('aria-valuenow', '400');
    await expect(colorSplitter).toHaveAttribute(
      'aria-label',
      'Resize Color Workspace',
    );
    const expandedColor = await colorWorkspace.boundingBox();
    expect(expandedColor).not.toBeNull();
    expect(compactColorBefore!.height).toBeGreaterThan(expandedColor!.height);
    await window.getByRole('button', { name: 'Collapse Library' }).click();
    await expect(window.getByLabel('Search local library')).toHaveCount(0);
    await expect(colorSplitter).toHaveAttribute('aria-valuenow', '220');
    await expect(preview).toHaveAttribute('data-document-revision', '0');

    const leftBefore = await leftSlot.boundingBox();
    expect(leftBefore).not.toBeNull();
    const leftHandle = await leftSplitter.boundingBox();
    expect(leftHandle).not.toBeNull();
    await window.mouse.move(
      leftHandle!.x + leftHandle!.width / 2,
      leftHandle!.y + leftHandle!.height / 2,
    );
    await window.mouse.down();
    await window.mouse.move(
      leftHandle!.x + leftHandle!.width / 2 + 40,
      leftHandle!.y + leftHandle!.height / 2,
    );
    await window.mouse.up();
    await expect(leftSplitter).toHaveAttribute('aria-valuenow', '240');
    const leftAfter = await leftSlot.boundingBox();
    expect(leftAfter?.width).toBeGreaterThan(leftBefore!.width);

    const rightBefore = await rightSlot.boundingBox();
    expect(rightBefore).not.toBeNull();
    const rightHandle = await rightSplitter.boundingBox();
    expect(rightHandle).not.toBeNull();
    await window.mouse.move(
      rightHandle!.x + rightHandle!.width / 2,
      rightHandle!.y + rightHandle!.height / 2,
    );
    await window.mouse.down();
    await window.mouse.move(
      rightHandle!.x + rightHandle!.width / 2 - 32,
      rightHandle!.y + rightHandle!.height / 2,
    );
    await window.mouse.up();
    await expect(rightSplitter).toHaveAttribute('aria-valuenow', '332');
    const rightAfter = await rightSlot.boundingBox();
    expect(rightAfter?.width).toBeGreaterThan(rightBefore!.width);

    const inspectorBefore = await window
      .getByTestId('workspace-splitter-inspector')
      .boundingBox();
    expect(inspectorBefore).not.toBeNull();
    await window.mouse.move(
      inspectorBefore!.x + inspectorBefore!.width / 2,
      inspectorBefore!.y + inspectorBefore!.height / 2,
    );
    await window.mouse.down();
    await window.mouse.move(
      inspectorBefore!.x + inspectorBefore!.width / 2,
      inspectorBefore!.y + inspectorBefore!.height / 2 + 32,
    );
    await window.mouse.up();
    await expect(inspectorSplitter).toHaveAttribute('aria-valuenow', '292');

    const revisionBeforeCollapse = await preview.getAttribute(
      'data-document-revision',
    );
    await window
      .getByRole('button', { name: 'Collapse Local Library' })
      .click();
    await expect(
      window.getByRole('button', { name: 'Expand Local Library' }),
    ).toBeVisible();
    await expect(leftSplitter).toHaveAttribute('aria-disabled', 'true');
    await expect(previewCanvas).toHaveAttribute(
      'data-document-revision',
      revisionBeforeCollapse!,
    );
    await window.getByRole('button', { name: 'Expand Local Library' }).click();
    await expect(
      window.getByRole('button', { name: 'Collapse Local Library' }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Collapse 3D Preview' }).click();
    await expect(
      window.getByRole('button', { name: 'Expand 3D Preview' }),
    ).toBeVisible();
    await expect(rightSplitter).toHaveAttribute('aria-disabled', 'true');
    await expect(previewCanvas).toHaveAttribute(
      'data-document-revision',
      revisionBeforeCollapse!,
    );
    await window.getByRole('button', { name: 'Expand 3D Preview' }).click();

    const persisted = await window.evaluate(() =>
      JSON.parse(
        localStorage.getItem('minecraft-skin-editor.workspace-layout.v1') ??
          '{}',
      ),
    );
    expect(persisted).toMatchObject({
      version: 1,
      leftPanelWidth: 240,
      rightPanelWidth: 332,
      rightInspectorHeight: 292,
      leftUpperHeight: 220,
      libraryExpanded: false,
      leftCollapsed: false,
      rightCollapsed: false,
    });

    await resetLayout.click();
    await expect(leftSplitter).toHaveAttribute('aria-valuenow', '200');
    await expect(rightSplitter).toHaveAttribute('aria-valuenow', '300');
    await expect(inspectorSplitter).toHaveAttribute('aria-valuenow', '260');
    await expect(
      window.getByRole('button', { name: 'Collapse Local Library' }),
    ).toBeVisible();
    await expect(
      window.getByRole('button', { name: 'Collapse 3D Preview' }),
    ).toBeVisible();
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('guards quit with multiple dirty documents without duplicate native dialogs', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-guard-e2e-'),
  );
  const inputPath = path.join(temporaryDirectory, 'guarded.png');
  const pixels = new Uint8Array(64 * 64 * 4);
  await writeFile(
    inputPath,
    encode({ width: 64, height: 64, data: pixels, channels: 4, depth: 8 }),
  );

  const application = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MINECRAFT_SKIN_EDITOR_E2E: '1',
      MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH: inputPath,
      MINECRAFT_SKIN_EDITOR_E2E_UNSAVED_DECISION: 'cancel',
    },
  });

  try {
    const window = await application.firstWindow();
    await window.getByRole('button', { name: 'Open PNG' }).click();
    await window.getByRole('button', { name: 'Slim' }).click();
    await expect(window).toHaveTitle('guarded.png • — Minecraft Skin Editor');

    await application.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById('file-new')?.click();
    });
    const dialog = window.getByRole('dialog', { name: 'New Skin' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await window.getByRole('button', { name: 'Slim', exact: true }).click();
    await expect(window).toHaveTitle('Untitled.png • — Minecraft Skin Editor');
    await expect(window.getByRole('tab')).toHaveCount(2);
    await expect(
      window.getByRole('button', { name: 'Slim', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');

    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
      BrowserWindow.getAllWindows()[0]?.close();
    });
    await expect(window.locator('body')).toBeVisible();
    await expect(window).toHaveTitle('Untitled.png • — Minecraft Skin Editor');
    await expect(window.getByRole('tab')).toHaveCount(2);
  } finally {
    await application.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
