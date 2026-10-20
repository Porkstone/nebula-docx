# Releasing Nebula DOCX

1. Update the version in `package.json`, the UI version label and `packaging/chocolatey/nebula-docx.nuspec`.
2. Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`, `pnpm notices`, and `pnpm dist:win` on Windows x64.
3. Run the smoke test against the packaged binary:

   ```powershell
   $env:NEBULA_TEST_EXECUTABLE = (Resolve-Path 'release/win-unpacked/Nebula DOCX.exe').Path
   pnpm test
   Remove-Item Env:NEBULA_TEST_EXECUTABLE
   ```

4. Test silent install with `/S /allusers` and silent uninstall with `/S`. Check the Start menu entry, Windows Open with registration and installed app launch. The installer is unsigned unless an appropriate signing certificate is supplied to electron-builder through its supported signing configuration.
5. Commit and push the verified source. Create a GitHub release tag matching `v<version>` and upload `Nebula-DOCX-Setup-<version>-x64.exe`.
6. Generate the Chocolatey package with `powershell -File scripts/package-chocolatey.ps1`. This calculates the installer's SHA-256 and pins the exact public GitHub release download URL. Upload the generated `.nupkg` and `SHA256SUMS.txt` to the GitHub release.
7. Test `choco install nebula-docx --source <absolute-path-to-release> -y` and `choco uninstall nebula-docx -y` on a clean Windows machine or VM. This downloads the public GitHub release and checks its SHA-256.
8. Sign in to [Chocolatey Community](https://community.chocolatey.org/users/account/LogOn) and upload `release/nebula-docx.<version>.nupkg` through the package upload form. Alternatively, after securely configuring the Chocolatey CLI API key yourself, run:

   ```powershell
   choco push release/nebula-docx.1.0.0.nupkg --source https://push.chocolatey.org/
   ```

9. Confirm the submitted version is pending moderation. Respond to validation, verification and moderator feedback. Never claim the package is approved until Chocolatey reports approval.

Do not commit API keys, certificates or credentials. The repository includes no automatic Chocolatey push workflow, so package publication remains an explicit release action.
