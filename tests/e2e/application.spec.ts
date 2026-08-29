import { _electron as electron, expect, test } from '@playwright/test';
import { decode, encode } from 'fast-png';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('launches the production Electron application shell', async () => {
  const application = await electron.launch({ args: ['.'] });

  try {
    const window = await application.firstWindow();
    const rendererBoundary = await window.evaluate(() => {
      const browserGlobal = globalThis as typeof globalThis & {
        skinFiles?: Record<string, unknown>;
        skinEdits?: Record<string, unknown>;
        appLifecycle?: Record<string, unknown>;
      };
      return {
        hasCommonJsRequire: 'require' in globalThis,
        hasElectronBridge: 'electron' in globalThis,
        fileApiMethods: Object.keys(browserGlobal.skinFiles ?? {}).sort(),
        editApiMethods: Object.keys(browserGlobal.skinEdits ?? {}).sort(),
        lifecycleApiMethods: Object.keys(
          browserGlobal.appLifecycle ?? {},
        ).sort(),
      };
    });
    const fileMenu = await application.evaluate(({ Menu }) =>
      ['file-open', 'file-save', 'file-save-as'].map((id) => {
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
    ).toBeVisible();
    await expect(window.getByLabel('Application status')).toHaveText(
      'No document open',
    );
    expect(rendererBoundary).toEqual({
      hasCommonJsRequire: false,
      hasElectronBridge: false,
      fileApiMethods: [
        'onFileCommand',
        'openSkinPng',
        'saveSkinPng',
        'saveSkinPngAs',
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
    const toolOptions = window.getByLabel('Tool options');
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
    const colorControls = window.getByLabel('Color controls');
    await expect(
      colors.getByRole('button', { name: 'Primary color', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      colors.getByRole('button', { name: 'Secondary color', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
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

    await colorControls
      .getByRole('button', { name: 'Color controls', exact: true })
      .click();
    const advancedColors = window.getByRole('dialog', {
      name: 'Advanced color controls',
    });
    await expect(
      advancedColors.getByRole('group', { name: 'RGB channels' }),
    ).toBeVisible();
    await expect(
      advancedColors.getByRole('group', { name: 'HSV channels' }),
    ).toBeVisible();
    await expect(
      advancedColors.getByLabel('Visual color picker'),
    ).toBeVisible();
    await colorControls
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
    await colorControls
      .getByRole('button', { name: 'Close color', exact: true })
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
    const toolOptions = window.getByLabel('Tool options');
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
    const toolOptions = window.getByLabel('Tool options');
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

test('guards dirty Open and window close without duplicate native dialogs', async () => {
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
      Menu.getApplicationMenu()?.getMenuItemById('file-open')?.click();
    });
    await expect(window).toHaveTitle('guarded.png • — Minecraft Skin Editor');
    await expect(
      window.getByRole('button', { name: 'Slim', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');

    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
      BrowserWindow.getAllWindows()[0]?.close();
    });
    await expect(window.locator('body')).toBeVisible();
    await expect(window).toHaveTitle('guarded.png • — Minecraft Skin Editor');
  } finally {
    await application.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
