import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Renderer root element was not found.');
}
const root = rootElement;

const isPopoutPreview =
  new URLSearchParams(window.location.search).get('popout') === '1';

async function renderApplication(): Promise<void> {
  if (isPopoutPreview) {
    const { PopoutPreview } = await import('./features/preview/PopoutPreview');
    createRoot(root).render(
      <StrictMode>
        <PopoutPreview />
      </StrictMode>,
    );
    return;
  }

  const { App } = await import('./app/App');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void renderApplication();
