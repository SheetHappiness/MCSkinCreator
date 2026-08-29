# History Timeline

The editor exposes the existing transactional `DocumentHistory` through a
compact, session-scoped timeline. `SkinDocument` remains the only editable
pixel and model authority; the timeline stores reversible operations and
derives its display state from the same Undo/Redo controller.

Each committed operation has a concise label such as `Pencil Stroke`,
`Lighten Stroke`, `Fill`, or `Model → Slim`. The retained history is bounded
by the existing 100-operation capacity. The timeline also includes the
session baseline so the current position, undoable states, and redoable states
are unambiguous after navigation or capacity eviction.

Selecting a state calls `DocumentHistory.jumpTo`. It applies the existing
exact operation records in the required direction, creates no new operation,
and preserves normal redo-branch behavior when a new edit is committed from
an older state.

Successful Save and Save As operations mark the current history position as a
visual saved checkpoint. This is only timeline metadata: dirty state remains
derived from `SkinDocument`'s saved content checkpoint. A replacement document
receives a new history instance, while Save preserves the current session's
timeline.

Persistent history, branching history trees, snapshots, and cross-document
history are intentionally out of scope.
