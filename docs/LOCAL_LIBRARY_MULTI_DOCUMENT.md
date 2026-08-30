# Local Library and Multiple Documents

P09 extends the core editor from one replaceable session to a small local
workspace. The feature remains offline and filesystem-scoped: it does not add
accounts, cloud storage, online templates, or a whole-disk index.

## Open documents

Each open tab owns a separate `SkinDocument`, `DocumentHistory`, file path,
display name, and dirty state. `activeDocumentId` selects which session is
connected to the 2D editor, 3D preview, status bar, title, Undo/Redo, and Save
commands. Switching tabs never copies pixels or history between sessions.

The editor workspace is remounted for the selected document. The 2D viewport,
3D camera, visibility state, hover state, and other view-local state therefore
start from their normal defaults when a tab is activated. Tool, color, and
tool-option state remains application-global. Closing a tab releases its
history subscription and its 3D renderer resources.

Tabs show the display name and a dirty marker. Closing a dirty tab uses the
same serialized `Save / Don't Save / Cancel` decision as application close:

- `Save` persists the current path, or opens Save As for an untitled tab;
- `Don't Save` closes the tab without persistence;
- `Cancel`, a canceled Save As, or a save failure leaves the tab open.

Opening, creating, or dropping a valid PNG adds or activates a tab. Opening a
path that is already open activates the existing session instead of creating a
second copy. Invalid input leaves all existing sessions unchanged.

## Local library

The Local Library panel uses an app-managed folder. It lists only regular PNG
files directly inside that folder, sorted by display name. It does not scan
the rest of the computer and does not follow a user-supplied path through the
renderer.

Each entry includes a derived pixel-art thumbnail. The thumbnail is cached in
the main process by file path, modification time, and byte length; it is never
used as document state. A successful save or a refresh invalidates the visible
thumbnail when the source PNG changes. Invalid or unsupported PNGs remain
addressable as files but do not receive a thumbnail and still fail through the
canonical 64×64 decoder when opened.

Collections are virtual folders. Their names and file membership are stored in
the library's atomic sidecar file
`.minecraft-skin-editor-library.json`; the PNG files remain directly in the
app-managed folder. This keeps the existing flat storage model, avoids moving
user files, and allows a skin to belong to more than one collection. Renaming
or deleting a library entry updates its membership metadata, and duplicating an
entry copies its collection membership. Missing metadata is treated as empty
metadata, so the PNG library remains usable if the sidecar is removed or
damaged.

Library search is case-insensitive and matches a filename/display name or the
name of any collection assigned to the entry. The collection filter can be
combined with the search field.

Recently opened file-backed skins are kept in a bounded app-local index of at
most 12 entries. Opening or saving a local PNG, opening a library entry, and a
path-backed drop promote an entry to the front and de-duplicate by normalized
path. Missing recent files remain visible as `Missing` until dismissed, rather
than causing startup failure. A recent path can only be opened through the
intent-specific native recent-file operation after it has been recorded by the
application.

Available actions are:

- open a library skin in a new or existing tab;
- rename a PNG entry;
- duplicate an entry with a collision-safe name;
- reveal an entry in Explorer;
- delete an entry after an explicit in-panel confirmation;
- create, rename, delete, and assign virtual collections;
- copy the active canonical document into the library with a collision-safe
  name;
- refresh the listing.

The preload exposes only typed library operations. Main-process handlers
validate that every entry is a direct PNG child of the app-managed library,
reject traversal, unsafe Windows names, and untrusted collection identifiers,
and limit copied encoded PNG size. Reveal uses only the validated
`showItemInFolder` intent. The renderer never receives a generic filesystem or
shell bridge.

## Save All and application close

`Save All` processes dirty sessions in tab order. Sessions with a file path use
Save; untitled sessions use Save As with their current display name as the
suggestion. The first canceled Save As or failed write stops the sequence.
Earlier successful saves remain successful and are reported in
`savedDocumentIds`; remaining sessions stay dirty. With no dirty sessions,
Save All is a no-op.

Application close checks every dirty tab in tab order through one serialized
guard. A cancellation or failed save keeps the window open. Repeated native
close requests while a decision is pending do not create duplicate dialogs.

Session restoration and unsaved untitled-document persistence are intentionally
deferred. Opening a library or recent entry is additive: it creates or
activates a tab and never replaces a dirty active document. The Duplicate
action creates and opens a new filesystem object; it is decoded into a new
session with a new document/history identity and no shared mutable pixel
buffer.
