# Nebula DOCX

A quiet, offline home for Word documents. Open and preview `.docx` files, print them, or take their content into Markdown. No Microsoft Word installation, account, upload, or internet connection is required.

![Nebula DOCX showing the sample Word document](docs/images/viewer.png)

## Download

Download the Windows x64 installer from [GitHub Releases](https://github.com/Porkstone/nebula-docx/releases/latest). Supports Windows 10 and Windows 11, x64. The initial release is unsigned; Windows may show an unknown-publisher prompt.

Once the Chocolatey package has been approved:

```powershell
choco install nebula-docx
```

## Features

- Open through the file picker, drag and drop, command-line file argument, or Windows **Open with**.
- Preview document pages, headings, tables, embedded images, headers, footers, and footnotes.
- Search text, navigate pages and the heading outline, zoom, and fit the document to the window.
- Print the document through the Windows print dialog, including **Microsoft Print to PDF**.
- Export a `.md` file with embedded images, or a ZIP containing Markdown and an `images/` folder.
- Reopen the eight most recent documents. Only file locations are saved locally; document contents are not cached.

Keyboard shortcuts: **Ctrl+O** open, **Ctrl+F** find, **Ctrl+P** print, **Ctrl+S** export Markdown. **Enter/Shift+Enter** advances through search results.

## Format support and limitations

DOCX is supported; legacy `.doc`, `.docm`, and encrypted/password-protected documents are not. Files are limited to 40 MB compressed, 120 MB expanded, and 3,000 ZIP entries.

This is a viewer and converter, not an editor or a Microsoft Word rendering engine. Layouts, fonts, floating shapes, charts, equations, tracked changes, text boxes and complex tables may differ from Word. Preview pagination follows saved/manual page breaks and section settings; it does not reproduce Word's automatic page layout. Print pagination can also depend on the chosen printer and paper size.

Markdown preserves supported headings, emphasis, lists, hyperlinks, images and simple tables. The first row of a table becomes its Markdown header; paragraph breaks inside cells become `<br>`. Page layout, headers and footers do not map into Markdown. Some Markdown readers do not display embedded data images; use the ZIP export for those readers. Review conversion notes and exported content for complex documents.

## Privacy and security

All processing is local. The installed app blocks network requests, does not run macros, disables Node.js in the renderer, and uses Electron sandboxing and context isolation. The document preview runs in a scriptless iframe and is sanitised with DOMPurify. Embedded HTML chunks and external-file access are disabled. OS file and export dialogs are handled through a narrow, sender-validated preload bridge.

Recent file locations are stored in `%APPDATA%/Nebula DOCX/recent-files.json`. To clear history, close the app and delete that file. Uninstalling keeps these preferences.

## Development

Requires Node.js 24 or newer and pnpm 11. On Windows:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

The frontend uses React, TypeScript, Vite, Tailwind CSS and Lucide. Electron provides native open/save and print dialogs. `docx-preview` renders documents; Mammoth and Turndown convert their structure to Markdown. No backend or authentication is needed.

```powershell
pnpm build          # TypeScript and production renderer
pnpm test           # Actual Electron integration test against the built renderer
pnpm notices        # Regenerate third-party license notices
pnpm dist:win       # Build the Windows x64 NSIS installer
```

The integration test exercises opening, two-page layout, tables, images, Unicode, search, pagination, zoom, Markdown, native save dialogs, both export formats, isolated printing to a two-page PDF, renderer isolation and recovery after a corrupt file. It stubs file dialogs and the final OS print dialog; it does not send paper to a physical printer.

Regenerate test fixtures with `pnpm fixtures`. The fixture includes an intentional page break, table, embedded image, hyperlink, Unicode, headers and footers. Regenerate the application icon on Windows with `powershell -File scripts/create-icon.ps1`.

## Release and Chocolatey

See [RELEASING.md](RELEASING.md) for reproducible build, checksum, installer verification and submission instructions. Chocolatey submissions require automated checks and moderator approval; a pending submission is not an approved package.

## License

MIT. Third-party licenses are included in `THIRD-PARTY-NOTICES.txt`; Electron and Chromium notices also ship with the app. Nebula DOCX is independent of Microsoft and is not affiliated with or endorsed by Microsoft.
