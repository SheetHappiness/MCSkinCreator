# New Skin and Drag-and-Drop

The core editor supports two ways to add a document: `File → New` and dropping
a PNG onto the application shell. Both are renderer-owned document-session
operations. They are serialized with Save and other file operations, but they
do not replace or discard an already open document.

## New Skin

`New` offers the two supported Minecraft models:

- Classic — standard four-pixel arms;
- Slim — narrow three-pixel arms.

Creation produces a transparent blank 64×64 RGBA `SkinDocument` in a new tab.
The new session has no file path, is initially clean, and is displayed as
`Untitled.png`. The first edit makes it dirty; `Save` therefore uses Save As.
Successful Save As replaces the untitled metadata and marks the document and
history checkpoint clean. Existing tabs remain open and retain their own
pixels and history.

`Ctrl+N` invokes the same New flow. Canceling the model dialog has no effect.
New does not prompt about a dirty existing tab because it is additive. The
dirty-tab guard applies when a tab is closed or when the application quits.

## Drag and drop

Only files whose display name ends in `.png` are accepted. The dropped bytes
then pass through the canonical 64×64 PNG decoder used by Open. Unsupported
dimensions, corrupt PNG data, and read failures leave the current
`SkinDocument` and its history untouched while reporting the error.

The renderer reads the dropped `File` bytes directly and may resolve an
OS-backed path through the narrow preload helper for session metadata. No raw
Electron or generic filesystem API is exposed to the renderer. A valid drop
opens in a new tab; a dirty current document remains untouched.

When several files are dropped, only one deterministic candidate is
considered. Use the local library to manage more than one existing skin at a
time; see [`docs/LOCAL_LIBRARY_MULTI_DOCUMENT.md`](LOCAL_LIBRARY_MULTI_DOCUMENT.md).

When the dropped file exposes an OS-backed path, a successful open promotes it
in the bounded Recently Opened list described in
[`docs/LOCAL_LIBRARY_MULTI_DOCUMENT.md`](LOCAL_LIBRARY_MULTI_DOCUMENT.md).
Browser-constructed files without a stable path remain session-only. Online
templates and cloud storage remain out of scope.
