$ErrorActionPreference = 'Stop'
$packageArgs = @{
  packageName    = 'nebula-docx'
  fileType       = 'exe'
  url64bit       = 'https://github.com/Porkstone/nebula-docx/releases/download/v1.1.0/nebula-docx.exe'
  checksum64     = '0c4a89b46f42530f00788688b8fd0be8b0495f955d5ab2a72901f733903b8ff1'
  checksumType64 = 'sha256'
  silentArgs     = '/S /allusers'
  validExitCodes = @(0, 1641, 3010)
  softwareName   = 'Nebula DOCX*'
}
if (-not (Get-OSArchitectureWidth -Compare 64)) { throw 'Nebula DOCX requires 64-bit Windows.' }
Install-ChocolateyPackage @packageArgs
