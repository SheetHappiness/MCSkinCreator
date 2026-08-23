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

test('opens and saves a 64x64 PNG through the native file lifecycle', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'minecraft-skin-editor-e2e-'),
  );
  const inputPath = path.join(temporaryDirectory, 'input-skin.png');
  const requestedOutputPath = path.join(temporaryDirectory, 'saved-copy');
  const outputPath = `${requestedOutputPath}.png`;
  const pixels = new Uint8Array(64 * 64 * 4);
  pixels.set([12, 34, 56, 78], 0);
  pixels.set([210, 220, 230, 255], pixels.length - 4);
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
    const zoomValue = window.getByTestId('zoom-value');

    await expect(canvas).toBeVisible();
    await expect(editorStatus.getByText('input-skin.png')).toBeVisible();
    await expect(editorStatus.getByText('64×64')).toBeVisible();
    await expect(window.getByLabel('Texture coordinates')).toHaveText(
      'X: — Y: —',
    );
    await expect(zoomValue).not.toHaveText('100%');

    const initialZoom = await zoomValue.textContent();
    expect(initialZoom).not.toBeNull();
    await window.getByRole('button', { name: 'Zoom in' }).click();
    await expect(zoomValue).not.toHaveText(initialZoom!);

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    const zoom =
      Number.parseInt((await zoomValue.textContent()) ?? '', 10) / 100;
    const textureLeft = (canvasBox!.width - 64 * zoom) / 2;
    const textureTop = (canvasBox!.height - 64 * zoom) / 2;
    await window.mouse.move(
      canvasBox!.x + textureLeft + 32.5 * zoom,
      canvasBox!.y + textureTop + 32.5 * zoom,
    );
    await expect(window.getByLabel('Texture coordinates')).toHaveText(
      'X: 32 Y: 32',
    );
    await window.mouse.click(
      canvasBox!.x + textureLeft + 32.5 * zoom,
      canvasBox!.y + textureTop + 32.5 * zoom,
    );

    await window.getByRole('button', { name: 'Save As…' }).click();
    await expect(editorStatus.getByText('saved-copy.png')).toBeVisible();

    const saved = decode(await readFile(outputPath), { checkCrc: true });
    expect(saved.width).toBe(64);
    expect(saved.height).toBe(64);
    expect(new Uint8Array(saved.data.buffer)).toEqual(pixels);
  } finally {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
