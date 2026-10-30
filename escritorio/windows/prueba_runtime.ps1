$ErrorActionPreference='Stop'
$base=Join-Path $env:RUNNER_TEMP ('sgf-runtime-ensayo-'+[guid]::NewGuid().ToString())
$app=Join-Path $base 'app';$node=Join-Path $base 'node'
New-Item -ItemType Directory -Path $app,$node -Force | Out-Null
try {
  & "$PSScriptRoot\copiar_runtime.ps1" -Destino $app -DestinoNode $node
  $vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  $vs=(& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
  $dev=Join-Path $vs 'Common7\Tools\VsDevCmd.bat'
  if(-not (Test-Path $dev)) {throw 'No se encontró VsDevCmd.'}
  $fuente=Join-Path $base 'prueba.cpp'
  @'
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
int wmain() {
  const wchar_t* nombres[] = {L"vcruntime140.dll", L"vcruntime140_1.dll", L"msvcp140.dll"};
  wchar_t propia[MAX_PATH], ruta[MAX_PATH];
  if (!GetModuleFileNameW(NULL, propia, MAX_PATH)) return 10;
  wchar_t* p = wcsrchr(propia, L'\\');
  if (!p) return 11;
  *(p + 1) = 0;
  for (int i=0; i<3; ++i) {
    HMODULE m = LoadLibraryW(nombres[i]);
    if (!m || !GetModuleFileNameW(m, ruta, MAX_PATH)) return 12+i;
    if (_wcsnicmp(ruta, propia, wcslen(propia)) != 0) {wprintf(L"DLL fuera de la aplicación: %ls\n", ruta); return 20+i;}
    wprintf(L"DLL local verificada: %ls\n", nombres[i]);
  }
  return 0;
}
'@ | Set-Content -LiteralPath $fuente -Encoding ascii
  $probe=Join-Path $app 'probar-runtime.exe'
  $orden="call `"$dev`" -arch=x64 -host_arch=x64 >nul && cl /nologo /MD /O2 /EHsc /Fe:`"$probe`" `"$fuente`""
  & $env:ComSpec /d /s /c $orden
  if($LASTEXITCODE -ne 0) {throw 'No se pudo construir la prueba nativa aislada.'}
  & $probe
  if($LASTEXITCODE -ne 0) {throw 'El ejecutable de prueba no cargó las DLL locales de SGF.'}
  $otro=Join-Path $node 'probar-runtime.exe';Copy-Item $probe $otro
  & $otro
  if($LASTEXITCODE -ne 0) {throw 'El ejecutable de prueba no cargó las DLL locales de Node.'}
  Write-Host 'OK: se localizaron y cargaron runtime x64 firmados desde ambas carpetas.'
} finally {Remove-Item -LiteralPath $base -Recurse -Force -ErrorAction SilentlyContinue}
