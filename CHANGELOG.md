# Changelog

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
