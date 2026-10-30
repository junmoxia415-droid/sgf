param(
  [Parameter(Mandatory=$true)][string]$Destino,
  [Parameter(Mandatory=$true)][string]$DestinoNode
)
$ErrorActionPreference='Stop'
# Solo archivos redistribuibles x64 de la instalación oficial de Visual Studio;
# no descargar DLL sueltas de terceros ni copiarlas desde System32.
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if(-not (Test-Path -LiteralPath $vswhere)) {throw 'No se encontró vswhere para localizar el redistribuible oficial de Visual C++.'}
$vs=& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if($LASTEXITCODE -ne 0 -or -not $vs) {throw 'No se encontró Visual Studio con herramientas C++ x64.'}
$base=Join-Path ($vs | Select-Object -First 1) 'VC\Redist\MSVC'
if(-not (Test-Path -LiteralPath $base)) {throw 'Visual Studio no contiene el redistribuible C++ requerido.'}
$versiones=Get-ChildItem -LiteralPath $base -Directory | Where-Object {$_.Name -match '^\d+\.\d+\.\d+(\.\d+)?$'} | Sort-Object {[version]$_.Name} -Descending
$carpeta=$null
foreach($version in $versiones) {
  $x64=Join-Path $version.FullName 'x64'
  if(-not (Test-Path -LiteralPath $x64)) {continue}
  $posible=Get-ChildItem -LiteralPath $x64 -Directory -Filter 'Microsoft.VC*.CRT' | Select-Object -First 1
  if($posible) {$carpeta=$posible;break}
}
if(-not $carpeta) {throw 'No se encontró Microsoft.VC*.CRT x64 redistribuible.'}
$archivos=@(Get-ChildItem -LiteralPath $carpeta.FullName -File -Filter '*.dll')
foreach($obligatorio in @('msvcp140.dll','vcruntime140.dll','vcruntime140_1.dll')) {
  if(-not ($archivos.Name -contains $obligatorio)) {throw "Falta el runtime requerido $obligatorio."}
}
foreach($archivo in $archivos) {
  $firma=Get-AuthenticodeSignature -LiteralPath $archivo.FullName
  if($firma.Status -ne 'Valid' -or $firma.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {throw "Firma de Microsoft no válida: $($archivo.Name)."}
  $f=[IO.File]::OpenRead($archivo.FullName)
  try {
    $r=[IO.BinaryReader]::new($f)
    $f.Position=0x3c; $pe=$r.ReadInt32(); $f.Position=$pe
    if($r.ReadUInt32() -ne 0x00004550 -or $r.ReadUInt16() -ne 0x8664) {throw "No es una DLL PE de 64 bits: $($archivo.Name)."}
  } finally {$f.Dispose()}
}
foreach($dest in @($Destino,$DestinoNode)) {
  if(-not (Test-Path -LiteralPath $dest -PathType Container)) {throw "Falta el directorio de destino $dest."}
  foreach($archivo in $archivos) {
    $salida=Join-Path $dest $archivo.Name
    Copy-Item -LiteralPath $archivo.FullName -Destination $salida -Force
    if((Get-FileHash -Algorithm SHA256 -LiteralPath $archivo.FullName).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $salida).Hash) {throw "Error al copiar $($archivo.Name)."}
  }
}
Write-Host "Runtime Microsoft x64 $($carpeta.Parent.Parent.Name) incluido junto a SGF y Node: $($archivos.Count) archivos."
