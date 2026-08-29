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

Available actions are:

- open a library skin in a new or existing tab;
- rename a PNG entry;
- duplicate an entry with a collision-safe name;
- delete an entry after an explicit in-panel confirmation;
- copy the active canonical document into the library with a collision-safe
  name;
- refresh the listing.

The preload exposes only typed library operations. Main-process handlers
validate that every entry is a direct PNG child of the app-managed library,
reject traversal and unsafe names, and limit copied encoded PNG size. The
renderer never receives a generic filesystem bridge.

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

Recent-folder persistence and session restoration are intentionally deferred.
