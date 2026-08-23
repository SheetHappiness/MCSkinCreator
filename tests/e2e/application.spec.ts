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
      };
      return {
        hasCommonJsRequire: 'require' in globalThis,
        hasElectronBridge: 'electron' in globalThis,
        fileApiMethods: Object.keys(browserGlobal.skinFiles ?? {}).sort(),
        editApiMethods: Object.keys(browserGlobal.skinEdits ?? {}).sort(),
      };
    });
    const fileMenu = await application.evaluate(({ Menu }) =>
      ['file-open', 'file-save', 'file-save-as'].map((id) => {
        const item = Menu.getApplicationMenu()?.getMenuItemById(id);
        return { id, label: item?.label, accelerator: item?.accelerator };
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
    });
    expect(fileMenu).toEqual([
      { id: 'file-open', label: 'Open…', accelerator: 'CmdOrCtrl+O' },
      { id: 'file-save', label: 'Save', accelerator: 'CmdOrCtrl+S' },
      {
        id: 'file-save-as',
        label: 'Save As…',
        accelerator: 'CmdOrCtrl+Shift+S',
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
  pixels.set([12, 34, 56, 78], 0);
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

    const initialZoom = await zoomValue.textContent();
    expect(initialZoom).not.toBeNull();
    await window.getByRole('button', { name: 'Zoom in' }).click();
    await expect(zoomValue).not.toHaveText(initialZoom!);

    const pencil = window.getByRole('button', { name: 'Pencil' });
    await expect(pencil).toHaveAttribute('aria-pressed', 'true');
    await window.getByLabel('Paint color', { exact: true }).fill('#123456');
    await window.getByLabel('Paint alpha').fill('128');
    await expect(window.getByLabel('Selected RGBA color')).toHaveText(
      '#123456 · A 128',
    );

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    const zoom =
      Number.parseInt((await zoomValue.textContent()) ?? '', 10) / 100;
    const textureLeft = (canvasBox!.width - 64 * zoom) / 2;
    const textureTop = (canvasBox!.height - 64 * zoom) / 2;
    const texturePoint = (x: number, y: number) => ({
      x: canvasBox!.x + textureLeft + (x + 0.5) * zoom,
      y: canvasBox!.y + textureTop + (y + 0.5) * zoom,
    });
    const center = texturePoint(32, 32);
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
    const eraserTarget = texturePoint(40, 40);
    await window.mouse.click(eraserTarget.x, eraserTarget.y);

    await window.getByRole('button', { name: 'Save As…' }).click();
    await expect(editorStatus.getByText('saved-copy.png')).toBeVisible();

    const saved = decode(await readFile(outputPath), { checkCrc: true });
    expect(saved.width).toBe(64);
    expect(saved.height).toBe(64);
    pixels.set([0x12, 0x34, 0x56, 128], (32 * 64 + 32) * 4);
    pixels.set([0, 0, 0, 0], eraserPixelOffset);
    expect(new Uint8Array(saved.data.buffer)).toEqual(pixels);
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
