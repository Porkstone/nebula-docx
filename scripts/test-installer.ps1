$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $root "release/nebula-docx-$version.exe"
$target = Join-Path $root 'release/install-smoke'
if (Get-ItemProperty 'HKLM:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Nebula DOCX*' }) { throw 'Nebula DOCX is already installed. Run installer verification in a clean VM.' }
$docxKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('Software\Classes\.docx')
$defaultBefore = if ($docxKey) { $docxKey.GetValue('') } else { $null }
if ($docxKey) { $docxKey.Close() }
$process = Start-Process -FilePath $installer -ArgumentList @('/S','/allusers',"/D=$target") -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Silent install failed: $($process.ExitCode)" }
$executable = Join-Path $target 'nebula-docx.exe'
$uninstaller = Join-Path $target 'Uninstall nebula-docx.exe'
try {
  if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed executable missing.' }
  $entry = Get-ItemProperty 'HKLM:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*' | Where-Object { $_.DisplayName -like 'Nebula DOCX*' }
  if (-not $entry) { throw 'Machine-wide uninstall registration missing.' }
  $association = Get-ItemProperty 'HKLM:\Software\Classes\.docx\OpenWithProgids' -ErrorAction Stop
  if (-not ($association.PSObject.Properties.Name | Where-Object { $_ -like '*nebula*' })) { throw 'Open with file association missing.' }
  $docxKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('Software\Classes\.docx')
  $defaultAfter = $docxKey.GetValue('')
  $docxKey.Close()
  if ($defaultBefore -ne $defaultAfter) { throw 'Installer changed the default DOCX application.' }
  $shortcut = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'Nebula DOCX.lnk'
  if (-not (Test-Path -LiteralPath $shortcut)) { throw 'Start menu shortcut missing.' }
  $env:NEBULA_TEST_EXECUTABLE = $executable
  & pnpm test
  if ($LASTEXITCODE -ne 0) { throw 'Installed application smoke test failed.' }
} finally {
  Remove-Item Env:NEBULA_TEST_EXECUTABLE -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $uninstaller) {
    $uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
    if ($uninstall.ExitCode -ne 0) { throw "Silent uninstall failed: $($uninstall.ExitCode)" }
  }
}
Start-Sleep -Seconds 2
$remaining = Get-ItemProperty 'HKLM:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Nebula DOCX*' }
if ($remaining) { throw 'Uninstall registry entry was not removed.' }
Write-Output 'PASS: silent all-users install, Open with registration, installed app integration tests, silent uninstall and registry cleanup.'
