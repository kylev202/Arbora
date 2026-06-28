# ADR-0007: Disable WebView2 drag-drop so the native file picker can't crash the app

- **Status:** Accepted
- **Date:** 2026-06-29

## Context

Adding a source or importing a syllabus opens a native file picker via
`@tauri-apps/plugin-dialog` (`open(...)`). On Windows the app would crash the
moment the picker appeared, making both flows unusable.

The cause is a COM/OLE apartment conflict. Tauri windows ship with
`dragDropEnabled: true` by default; that makes WebView2 register an OLE drag-drop
handler (`RegisterDragDrop`) on the window thread. The native file dialog
(`IFileOpenDialog`) also runs on that thread and initialises COM for its own
purposes; the two handlers collide and take the process down. It only manifests
on Windows, which is why it slipped past earlier work.

Arbora does not use webview drag-and-drop anywhere — every file enters through an
explicit "Choose file" button. The `dropzone`/`dropText` class names in the two
modals are visual styling only, not drop targets. So the drag-drop handler is
pure liability here.

## Decision

We will set `"dragDropEnabled": false` on the main window in
[`tauri.conf.json`](../../src-tauri/tauri.conf.json). The native file picker then
owns COM on the window thread without contention, and the picker stops crashing.

## Alternatives considered

- **Open the dialog off the main thread / in a spawned task.** Rejected: the
  Windows file dialog must run on a thread with the right COM apartment; moving it
  fights the platform and the plugin already manages threading. Disabling the
  competing handler is the supported fix.
- **Build an in-webview drag-drop uploader and keep drag-drop enabled.** Rejected:
  more surface area for a feature nobody asked for, and it would not fix the
  button-triggered native dialog that is the actual entry point.

## Consequences

- The file picker works on Windows; "Add source" and "Import from syllabus" are
  usable again. No behaviour change on macOS/Linux, where the bug did not occur.
- We give up OS-level drag-and-drop of files onto the window. Arbora never offered
  it, so there is no regression. If we later want drop-to-upload, it must be
  reintroduced deliberately — re-enabling `dragDropEnabled` would bring this crash
  back, so a drop feature would need its own handling of the dialog interaction.
- This line looks innocuous and removable; it is load-bearing. Don't drop it
  without reading this ADR.
