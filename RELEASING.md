# Releasing Nebula DOCX

Chocolatey package creation and submission are on hold. CI builds the Windows installer and runs the application and installer tests; it does not create or publish Chocolatey packages. The retained `packaging/chocolatey/` metadata describes version 1.0.0 only and must be updated explicitly if Chocolatey distribution is resumed.

1. Update the version in `package.json`, the UI version label and `CHANGELOG.md`.
2. Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`, `pnpm notices`, and `pnpm dist:win` on Windows x64.
3. Run the tests against the packaged binary:

   ```powershell
   $env:NEBULA_TEST_EXECUTABLE = (Resolve-Path 'release/win-unpacked/nebula-docx.exe').Path
   pnpm test
   Remove-Item Env:NEBULA_TEST_EXECUTABLE
   ```

4. Verify the installer on a clean machine with `powershell -File scripts/test-installer.ps1`. This checks silent all-users installation, the lowercase executable, Start menu and Open with registration, preservation of the default DOCX app, the installed application tests, silent uninstall and registry cleanup. The installer is unsigned unless an appropriate signing certificate is supplied through electron-builder's signing configuration.
5. Commit and push the verified source. Create a GitHub release tag matching `v<version>` and upload `release/nebula-docx.exe`. Generate and upload a SHA-256 checksum file for that exact installer.
6. Verify the uploaded asset's digest matches the local installer. Do not upload old release assets or the legacy Chocolatey package to a newer release.

Do not commit API keys, certificates or credentials. Any future Chocolatey work requires an explicit instruction to resume it, updated download URLs/version/checksum metadata and fresh package installation tests.
