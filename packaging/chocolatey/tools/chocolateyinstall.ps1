$ErrorActionPreference = 'Stop'
$packageArgs = @{
  packageName    = 'nebula-docx'
  fileType       = 'exe'
  url64bit       = 'https://github.com/Porkstone/nebula-docx/releases/download/v1.0.0/Nebula-DOCX-Setup-1.0.0-x64.exe'
  checksum64     = 'fadfbc677c32ed0413dd33f9957df2514549949362f540001f1e9fc077dc0de2'
  checksumType64 = 'sha256'
  silentArgs     = '/S /allusers'
  validExitCodes = @(0, 1641, 3010)
  softwareName   = 'Nebula DOCX*'
}
if (-not (Get-OSArchitectureWidth -Compare 64)) { throw 'Nebula DOCX requires 64-bit Windows.' }
Install-ChocolateyPackage @packageArgs
