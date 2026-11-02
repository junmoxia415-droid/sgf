# VM efímera únicamente: instala, usa y elimina un servicio con datos ficticios.
$ErrorActionPreference='Stop'
$repo=(Resolve-Path '.').Path
$lab=Join-Path $env:ProgramData ('sgf-servicio-prueba-'+[guid]::NewGuid().ToString('N'))
$origen=Join-Path $lab 'origen'
$datos=Join-Path $lab 'datos'
$raiz=Join-Path $env:ProgramFiles 'SGFServidor'
if((Get-Service SGFServidor -ErrorAction SilentlyContinue) -or (Test-Path $raiz)) {throw 'La VM ya contiene un servicio SGF; no se modificará.'}
New-Item -ItemType Directory -Force -Path "$origen/servidor/runtime","$origen/client","$origen/servicio",$datos | Out-Null
try {
  Copy-Item -Recurse 'server/dist' "$origen/servidor/dist"
  Copy-Item -Recurse 'server/node_modules' "$origen/servidor/node_modules"
  Copy-Item 'server/package.json' "$origen/servidor/package.json"
  Copy-Item (Get-Command node).Source "$origen/servidor/runtime/node.exe"
  Copy-Item -Recurse 'client/dist' "$origen/client/dist"
  Copy-Item 'escritorio/windows/servicio/gestionar.ps1' "$origen/servicio/gestionar.ps1"
  $csc=Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
  $salida=Join-Path $origen 'servicio\sgf_servicio.exe'
  $codigo=(Resolve-Path 'escritorio/windows/servicio/ServicioSgf.cs').Path
  & $csc /nologo /target:exe /reference:System.ServiceProcess.dll "/out:$salida" $codigo
  if($LASTEXITCODE -ne 0) {throw 'Falló la compilación del servicio.'}
  [IO.File]::WriteAllText((Join-Path $datos '.env'),"DB_TYPE=sqlite`nJWT_SECRET=prueba-ficticia-solo-servicio-123456`n",[Text.Encoding]::ASCII)
  & node 'server/dist/scripts/red-protegida.js' preparar $datos | Out-Null
  if($LASTEXITCODE -ne 0) {throw 'No se creó la identidad de prueba.'}
  $env:SGF_SERVICE_DATA=$datos; $env:SGF_SERVICE_SOURCE=$origen
  $env:SGF_SERVICE_USER_SID=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $env:SGF_SERVICE_ACTION='instalar'
  & "$origen/servicio/gestionar.ps1"
  $svc=Get-CimInstance Win32_Service -Filter "Name='SGFServidor'"
  if($svc.StartName -ine 'NT SERVICE\SGFServidor' -or $svc.StartMode -ne 'Auto') {throw 'La cuenta o el inicio del servicio no son los esperados.'}
  $limite=(Get-Date).AddSeconds(35)
  while(-not (Test-Path "$datos/control-servicio/anuncio.json") -and (Get-Date) -lt $limite) {Start-Sleep -Milliseconds 300}
  & node 'server/test/servicio-windows.mjs' $datos 1
  if($LASTEXITCODE -ne 0) {throw 'Falló el primer inicio del servicio.'}
  $env:SGF_SERVICE_ACTION='detener'; & "$origen/servicio/gestionar.ps1"
  if(Test-Path "$datos/control-servicio/anuncio.json") {throw 'El anuncio siguió disponible después del cierre.'}
  $env:SGF_SERVICE_ACTION='iniciar'; & "$origen/servicio/gestionar.ps1"
  $limite=(Get-Date).AddSeconds(35)
  while(-not (Test-Path "$datos/control-servicio/anuncio.json") -and (Get-Date) -lt $limite) {Start-Sleep -Milliseconds 300}
  & node 'server/test/servicio-windows.mjs' $datos 2
  if($LASTEXITCODE -ne 0) {throw 'Falló el segundo inicio del servicio.'}
  $env:SGF_SERVICE_ACTION='desactivar'; & "$origen/servicio/gestionar.ps1"
  $estado=Get-Content "$datos/control-servicio/instalado.json" -Raw | ConvertFrom-Json
  if($estado.activo -ne $false) {throw 'El indicador del servicio no se desactivó.'}
  if((Get-CimInstance Win32_Service -Filter "Name='SGFServidor'").StartMode -ne 'Manual') {throw 'El servicio continúa en inicio automático.'}
  if(-not (Test-Path "$datos/sgf-data.db")) {throw 'No se conservó la base ficticia.'}
  Write-Host 'OK: instalación explícita, servicio virtual, HTTPS 443, dos inicios, cierre y desactivación sin borrar datos.'
} finally {
  Stop-Service SGFServidor -ErrorAction SilentlyContinue
  & sc.exe delete SGFServidor 2>$null | Out-Null
  Remove-Item -LiteralPath $raiz -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $lab -Recurse -Force -ErrorAction SilentlyContinue
}
