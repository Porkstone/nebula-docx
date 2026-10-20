$ErrorActionPreference = 'Stop'
$packageArgs = @{
  packageName    = 'nebula-docx'
  fileType       = 'exe'
  url64bit       = 'https://github.com/Porkstone/nebula-docx/releases/download/v1.2.0/nebula-docx-1.2.0.exe'
  checksum64     = 'c88f571b905ef0c75b3173da3d9cc8a021e5f6e7b6a99031211250f978e50b6d'
  checksumType64 = 'sha256'
  silentArgs     = '/S /allusers'
  validExitCodes = @(0, 1641, 3010)
  softwareName   = 'Nebula DOCX*'
}
if (-not (Get-OSArchitectureWidth -Compare 64)) { throw 'Nebula DOCX requires 64-bit Windows.' }
Install-ChocolateyPackage @packageArgs
