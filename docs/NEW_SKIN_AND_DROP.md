# New Skin and Drag-and-Drop

The core editor supports two ways to replace the active document: `File → New`
and dropping a PNG onto the application shell. Both are renderer-owned
document-session operations and use the same serialized lifecycle guard as
Open, Save, Save As, and window close.

## New Skin

`New` offers the two supported Minecraft models:

- Classic — standard four-pixel arms;
- Slim — narrow three-pixel arms.

Creation produces a transparent blank 64×64 RGBA `SkinDocument`. The new
session has no file path, is initially clean, and is displayed as
`Untitled.png`. The first edit makes it dirty; `Save` therefore uses Save As.
Successful Save As replaces the untitled metadata and marks the document and
history checkpoint clean.

`Ctrl+N` invokes the same New flow. Canceling the model dialog has no effect.
When the current document is dirty, New uses the existing Save / Don't Save /
Cancel decision before replacing the session.

## Drag and drop

Only files whose display name ends in `.png` are accepted. The dropped bytes
then pass through the canonical 64×64 PNG decoder used by Open. Unsupported
dimensions, corrupt PNG data, and read failures leave the current
`SkinDocument` and its history untouched while reporting the error.

The renderer reads the dropped `File` bytes directly and may resolve an
OS-backed path through the narrow preload helper for session metadata. No raw
Electron or generic filesystem API is exposed to the renderer. A dirty current
document receives the same Save / Don't Save / Cancel guard before the drop is
read or replaces the session.

When several files are dropped, only one deterministic candidate is
considered. Multi-document management is deferred to the local library stage.

Multi-document tabs, recent files, online templates, and cloud storage remain
out of scope.
