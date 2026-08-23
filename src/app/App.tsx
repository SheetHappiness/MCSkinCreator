import { useShellStore } from './shellStore';

export function App() {
  const documentStatus = useShellStore((state) => state.documentStatus);

  return (
    <div className="application-shell">
      <header className="title-bar">
        <h1>Minecraft Skin Editor</h1>
        <span className="milestone">M0</span>
      </header>

      <main className="workspace" aria-label="Application workspace">
        <section className="workspace-placeholder">
          <h2>Application foundation</h2>
          <p>Editor functionality will be added in later milestones.</p>
        </section>
      </main>

      <footer className="status-bar" aria-label="Application status">
        {documentStatus}
      </footer>
    </div>
  );
}
