# Pop-out Preview and Snapshot Export

P10 adds two compact utilities to the existing Three.js preview: a separate
read-only preview window and a PNG snapshot command.

## Pop-out binding

`Pop Out` binds the new window to the document that is active when the command
is invoked. The binding remains stable while the user switches document tabs.
The pop-out therefore continues to show the same document rather than
silently following whichever tab is active later. Opening `Pop Out` again
while it is open focuses the existing window; it does not create a second
window or retarget the binding. After the window is closed, the next open
binds to the then-active document.

The main renderer keeps the only editable `SkinDocument`. It publishes typed,
read-only preview states containing the document's encoded 64×64 PNG, model,
revision, and current body-part/layer visibility. The pop-out decodes that
state only to drive its derived Three.js renderer. It does not expose editing
tools, write to the document, or send camera state back to the editor.

Skin pixels, model changes, and visibility changes are live while the bound
document remains open. The pop-out owns its camera, so orbit, zoom, and reset
view are local to that window. If the bound tab is closed, the last published
preview remains visible until the pop-out is closed; it is no longer updated
because its source document no longer exists.

The pop-out uses the same safe Electron defaults as the main window:
`contextIsolation`, disabled Node integration, sandboxing, blocked navigation,
and a typed preview-only interaction surface. Closing the window disposes its
Three.js renderer, controls, texture, subscriptions, and WebGL context.

## Snapshot contract

`Snapshot` captures the current Three.js preview canvas after rendering the
current frame. Its output is a PNG at the canvas's physical pixel resolution
(the visible viewport multiplied by the capped device-pixel ratio). It
includes the current model, layer/body-part visibility, camera angle, and the
preview's neutral `#1b1d20` background. It is intentionally not a render
studio: there are no pose, lighting, scene, animation, or background controls.

The native Save dialog is limited to PNG and suggests `<skin>-preview.png`.
The selected path receives a `.png` suffix when necessary. Canceling the
dialog or a failed write leaves the document and its history unchanged.
Snapshot export never calls `markSaved()` and never changes the skin dirty
state.

The same command is available in the main preview and in the pop-out. A
pop-out snapshot uses that window's current camera and viewport resolution.
