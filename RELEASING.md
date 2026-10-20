# Releasing Nebula DOCX

CI builds the Windows installer and runs the application and installer tests. Chocolatey packaging and publication are manual release steps, using the exact installer already uploaded to GitHub.

1. Update the version in `package.json`, the download examples in `README.md` and `CHANGELOG.md`. The UI version label and installer filename use `package.json` automatically.
2. Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`, `pnpm notices`, and `pnpm dist:win` on Windows x64.
3. Run the tests against the packaged binary:

   ```powershell
   $env:NEBULA_TEST_EXECUTABLE = (Resolve-Path 'release/win-unpacked/nebula-docx.exe').Path
   pnpm test
   Remove-Item Env:NEBULA_TEST_EXECUTABLE
   ```

4. Verify the installer on a clean machine with `powershell -File scripts/test-installer.ps1`. This checks silent all-users installation, the lowercase executable, Start menu and Open with registration, preservation of the default DOCX app, the installed application tests, silent uninstall and registry cleanup. The installer is unsigned unless an appropriate signing certificate is supplied through electron-builder's signing configuration.
5. Commit and push the verified source. Create a GitHub release tag matching `v<version>` and upload `release/nebula-docx-<version>.exe` (for example, `nebula-docx-1.2.0.exe`). Generate and upload a SHA-256 checksum file for that exact installer. The installed executable remains `nebula-docx.exe`.
6. Verify the uploaded asset's digest matches the local installer. Do not upload old release assets to a newer release.
7. Run `powershell -File scripts/package-chocolatey.ps1` against that same installer. The helper synchronizes the package version, release/icon URLs and installer SHA-256 with `package.json` and `release/nebula-docx-<version>.exe`, then creates `release/nebula-docx.<version>.nupkg`.
8. Test `choco install nebula-docx --version <version> --source <absolute-release-folder> -y` and `choco uninstall nebula-docx -y` on a clean Windows machine. Confirm the download checksum and install/uninstall results. Upload the tested `.nupkg` to the matching GitHub release and commit the generated packaging metadata.
9. Configure the Chocolatey CLI API key privately using the instructions on the [account page](https://community.chocolatey.org/account). Submit using `choco push release/nebula-docx.<version>.nupkg --source https://push.chocolatey.org/`. Browser-based package uploads are no longer supported. Confirm the package version appears as pending moderation, and respond to automated checks or moderator feedback.

Do not commit API keys, certificates or credentials. A successful upload is a submission for review, not approval. Publish only after testing the exact package and released installer.
