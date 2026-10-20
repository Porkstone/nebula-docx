$ErrorActionPreference = 'Stop'
$entries = @(Get-UninstallRegistryKey -SoftwareName 'Nebula DOCX*')
if ($entries.Count -eq 0) { Write-Warning 'Nebula DOCX is already uninstalled.'; return }
foreach ($entry in $entries) {
  $uninstaller = $entry.UninstallString
  if ($uninstaller -match '^"([^"]+)"') { $uninstaller = $Matches[1] }
  else { $uninstaller = $uninstaller.Trim() }
  if (-not (Test-Path -LiteralPath $uninstaller)) { throw "Uninstaller not found: $uninstaller" }
  Uninstall-ChocolateyPackage -PackageName 'nebula-docx' -FileType 'exe' -SilentArgs '/S' -File $uninstaller -ValidExitCodes @(0, 1605, 1614, 1641, 3010)
}
