import { _electron as electron, expect, test } from '@playwright/test';

test('launches the production Electron application shell', async () => {
  const application = await electron.launch({ args: ['.'] });

  try {
    const window = await application.firstWindow();
    const rendererBoundary = await window.evaluate(() => {
      return {
        hasCommonJsRequire: 'require' in window,
        hasElectronBridge: 'electron' in window,
      };
    });

    await expect(window).toHaveTitle('Minecraft Skin Editor');
    await expect(
      window.getByRole('heading', { name: 'Minecraft Skin Editor' }),
    ).toBeVisible();
    await expect(window.getByText('No document open')).toBeVisible();
    expect(rendererBoundary).toEqual({
      hasCommonJsRequire: false,
      hasElectronBridge: false,
    });
  } finally {
    await application.close();
  }
});
