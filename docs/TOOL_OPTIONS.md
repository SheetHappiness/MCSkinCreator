# Tool Options Contract

P05 establishes one typed application-state boundary for tool options in
`src/features/editor/toolOptions.ts`. `SkinDocument` and `DocumentHistory`
remain concerned only with document content and reversible document mutations.

The current Pencil, Eraser, Fill, and Eyedropper options describe their
existing fixed semantics. They are presented as read-only contextual facts;
the UI does not expose controls that cannot change behavior. The 2D and 3D
adapters read the same `getToolOptions()` source.

Options are session-scoped. Each tool owns its own option entry, so changing
the active tool does not overwrite another tool's options. `resetToolOptions()`
is an explicit application-state reset and does not dirty a document or add a
history operation. P05 does not persist options across restarts because no
current core option is user-configurable.

Future tools may add genuinely configurable, validated fields to the typed
map and use `setToolOptions()`; they must not turn fixed core semantics into
fake controls or store option state in `SkinDocument`.
