# Changelog

## 1.2.0

- Apply the Nebula Applications brand guide: teal surfaces, cyan selection and focus, orange primary actions, Segoe UI and clearer text sizes.
- Add Light, Dark and System appearance across the app, with a saved local preference and live Windows appearance updates in System mode.
- Keep document page colours independent of the interface theme and preserve printed output.
- Improve control wrapping and long document titles at smaller window sizes.
- Include the release version in installer filenames (`nebula-docx-1.2.0.exe`), while retaining `nebula-docx.exe` for the installed application.
- Synchronize installer tests, release documentation and Chocolatey download URLs with the versioned filename.

## 1.1.0

- Rename the installed application and installer download to `nebula-docx.exe`.
- Add edit mode with text, headings, formatting, alignment, lists, links, tables, images and manual page breaks.
- Save edited DOCX copies while keeping original headers, footers and final page/section settings.
- Protect unsaved changes and support undo/redo, including exact original copies when all edits are undone.
- Preview, print and export the current draft.
- Pause Chocolatey package creation and submission.

## 1.0.0

Initial Windows x64 release.

- Offline DOCX opening through a native dialog, drag and drop, file arguments and Windows Open with.
- Paginated document preview with a heading outline, search, zoom and fit to width.
- Native printing with the document's page dimensions.
- Markdown export as a single file or a ZIP with extracted images; copy Markdown to the clipboard.
- Recent document history stored locally.
- Sandboxed document viewing, external-resource blocking and archive size limits.

Known limitations: preview pagination follows saved/manual breaks rather than Word's automatic layout. Complex shapes, charts, equations, text boxes and fonts may differ. Legacy DOC and encrypted files are unsupported. The Windows installer is unsigned.
