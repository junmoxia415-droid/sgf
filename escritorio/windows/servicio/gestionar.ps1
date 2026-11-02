# Ejecutado solo tras confirmación y UAC. No cambia firewall, políticas ni
# certificados globales. El servicio usa una cuenta virtual, nunca SYSTEM.
$ErrorActionPreference='Stop'
$nombre='SGFServidor'
$cuenta='NT SERVICE\SGFServidor'
$raiz=Join-Path $env:ProgramFiles 'SGFServidor'
$exe=Join-Path $raiz 'sgf_servicio.exe'
$datos=$env:SGF_SERVICE_DATA
$origen=$env:SGF_SERVICE_SOURCE
$sid=$env:SGF_SERVICE_USER_SID
$accion=$env:SGF_SERVICE_ACTION
$control=Join-Path $datos 'control-servicio'
$clave=Join-Path $control 'token.txt'
$marca=Join-Path $control 'instalado.json'
$anuncio=Join-Path $control 'anuncio.json'
function EjecutarIcacls([string[]]$argumentos) {
  & icacls.exe @argumentos | Out-Null
  if($LASTEXITCODE -ne 0) {throw 'No se pudo establecer la protección de carpetas.'}
}
function ServicioPropio {
  $s=Get-CimInstance Win32_Service -Filter "Name='$nombre'" -ErrorAction SilentlyContinue
  if(-not $s) {return $false}
  $esperado='"'+$exe+'"'
  if($s.PathName.Trim() -ine $esperado -or $s.StartName -ine $cuenta) {throw 'Existe un servicio con el mismo nombre que no pertenece a SGF.'}
  if(-not (Test-Path -LiteralPath (Join-Path $raiz 'config-servicio.json'))) {throw 'Falta la configuración protegida del servicio.'}
  $c=Get-Content -LiteralPath (Join-Path $raiz 'config-servicio.json') -Raw | ConvertFrom-Json
  if($c.tipo -ne 'sgf-servicio-v1' -or $c.datos -ine $datos) {throw 'El servicio pertenece a otra instalación o carpeta de datos.'}
  return $true
}
function RevisarArbol([string]$ruta) {
  $raizItem=Get-Item -LiteralPath $ruta -Force
  if(($raizItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {throw 'Se rechazó una ruta enlazada.'}
  $enlaces=Get-ChildItem -LiteralPath $ruta -Force -Recurse | Where-Object {($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0} | Select-Object -First 1
  if($enlaces) {throw 'Se rechazó un archivo enlazado en la aplicación.'}
}
if(-not [IO.Path]::IsPathRooted($datos) -or -not [IO.Path]::IsPathRooted($origen) -or $sid -notmatch '^S-1-5-(\d+-)*\d+$') {throw 'Rutas o usuario inválidos.'}
if($accion -notin @('instalar','iniciar','detener','desactivar')) {throw 'Acción inválida.'}
if($accion -ne 'instalar') {
  if(-not (ServicioPropio)) {throw 'El servicio de SGF no está instalado.'}
  if($accion -eq 'iniciar') {
    Start-Service -Name $nombre
    (Get-Service $nombre).WaitForStatus('Running',[TimeSpan]::FromSeconds(30))
  } else {
    if((Get-Service $nombre).Status -ne 'Stopped') {
      Stop-Service -Name $nombre
      (Get-Service $nombre).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(35))
    }
    if($accion -eq 'desactivar') {
      & sc.exe config $nombre start= demand | Out-Null
      if($LASTEXITCODE -ne 0) {throw 'No se pudo desactivar el inicio automático.'}
      if(-not (Test-Path -LiteralPath $marca -PathType Leaf)) {throw 'Falta el indicador del servicio.'}
      [IO.File]::WriteAllText($marca,'{"version":1,"activo":false}',[Text.Encoding]::ASCII)
    }
  }
  exit 0
}
if(ServicioPropio) {
  if(-not (Test-Path -LiteralPath $marca -PathType Leaf)) {throw 'Falta el indicador del servicio.'}
  # Primero impedir que la consola arranque otra instancia, incluso si falla
  # el siguiente paso o el equipo se apaga a mitad de la operación.
  [IO.File]::WriteAllText($marca,'{"version":1,"activo":true}',[Text.Encoding]::ASCII)
  & sc.exe config $nombre start= auto | Out-Null
  if($LASTEXITCODE -ne 0) {throw 'No se pudo activar el inicio automático; el indicador quedó protegido.'}
  if((Get-Service $nombre).Status -eq 'Stopped') {Start-Service -Name $nombre}
  exit 0
}
if(Test-Path -LiteralPath $raiz) {throw 'Existe una carpeta de servicio anterior; no se reemplazará.'}
if(-not (Test-Path -LiteralPath $datos -PathType Container) -or -not (Test-Path -LiteralPath (Join-Path $datos '.env') -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $datos 'red-protegida/identidad.json') -PathType Leaf)) {throw 'Prepare primero la identidad HTTPS y los datos de SGF.'}
foreach($p in @((Join-Path $origen 'servidor'),(Join-Path $origen 'client'),(Join-Path $origen 'servicio'))) {RevisarArbol $p}
if((Get-Item -LiteralPath $datos -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {throw 'La carpeta de datos no puede ser un enlace.'}
$creado=$false; $creadaCarpeta=$false; $creadoControl=$false; $concedidoDatos=$false; $concedidoClave=$false
try {
  New-Item -ItemType Directory -Path $raiz | Out-Null; $creadaCarpeta=$true
  EjecutarIcacls @($raiz,'/inheritance:r','/grant:r','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F')
  Copy-Item -LiteralPath (Join-Path $origen 'servidor') -Destination (Join-Path $raiz 'servidor') -Recurse
  Copy-Item -LiteralPath (Join-Path $origen 'client') -Destination (Join-Path $raiz 'client') -Recurse
  Copy-Item -LiteralPath (Join-Path $origen 'servicio/sgf_servicio.exe') -Destination $exe
  if(-not (Test-Path -LiteralPath (Join-Path $raiz 'servidor/runtime/node.exe')) -or -not (Test-Path -LiteralPath (Join-Path $raiz 'servidor/dist/scripts/supervisor-servicio.js'))) {throw 'Faltan archivos del servicio.'}
  & sc.exe create $nombre binPath= ('"'+$exe+'"') start= demand obj= $cuenta | Out-Null
  if($LASTEXITCODE -ne 0) {throw 'No se pudo registrar la cuenta virtual.'}; $creado=$true
  EjecutarIcacls @($raiz,'/grant:r',"${cuenta}:(OI)(CI)RX")
  EjecutarIcacls @($datos,'/grant',"${cuenta}:(OI)(CI)M"); $concedidoDatos=$true
  EjecutarIcacls @((Join-Path $datos 'red-protegida'),'/grant',"${cuenta}:(OI)(CI)RX"); $concedidoClave=$true
  EjecutarIcacls @((Join-Path $datos '.env'),'/grant',"${cuenta}:R")
  if(Test-Path -LiteralPath $control) {throw 'La carpeta de control ya existe; no se reemplazará.'}
  New-Item -ItemType Directory -Path $control | Out-Null; $creadoControl=$true
  EjecutarIcacls @($control,'/inheritance:r','/grant:r',"*${sid}:(OI)(CI)F",'*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F',"${cuenta}:(OI)(CI)M")
  $bytes=New-Object byte[] 32
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create(); try {$rng.GetBytes($bytes)} finally {$rng.Dispose()}
  $secreto=([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
  [IO.File]::WriteAllText($clave,$secreto,[Text.Encoding]::ASCII)
  $config=@{tipo='sgf-servicio-v1';datos=$datos;archivoEnv=(Join-Path $datos '.env');token=$clave;anuncio=$anuncio;puerto=443}
  [IO.File]::WriteAllText((Join-Path $raiz 'config-servicio.json'),($config|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText($marca,'{"version":1,"activo":true}',[Text.Encoding]::ASCII)
  & sc.exe config $nombre start= auto | Out-Null
  if($LASTEXITCODE -ne 0) {throw 'No se pudo habilitar el inicio automático.'}
  Start-Service -Name $nombre
  $limite=(Get-Date).AddSeconds(35)
  while(-not (Test-Path -LiteralPath $anuncio) -and (Get-Date) -lt $limite) {
    if((Get-Service $nombre).Status -eq 'Stopped') {throw 'El servidor del servicio terminó durante el arranque.'}
    Start-Sleep -Milliseconds 300
  }
  if(-not (Test-Path -LiteralPath $anuncio)) {throw 'El servicio no anunció su canal autenticado.'}
} catch {
  if($creado) {
    try {
      if((Get-Service -Name $nombre).Status -ne 'Stopped') {Stop-Service -Name $nombre; (Get-Service -Name $nombre).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(35))}
    } catch {throw 'No se confirmó el cierre del servicio; no se retiraron archivos ni permisos. Revise los datos y el servicio de Windows.'}
  }
  if($concedidoClave) {& icacls.exe (Join-Path $datos 'red-protegida') /remove:g $cuenta 2>$null | Out-Null}
  if($concedidoDatos) {& icacls.exe $datos /remove:g $cuenta 2>$null | Out-Null; & icacls.exe (Join-Path $datos '.env') /remove:g $cuenta 2>$null | Out-Null}
  if($creado) {& sc.exe delete $nombre 2>$null | Out-Null}
  if($creadoControl) {
    # Solo se retiran los archivos creados en este intento; nunca la carpeta de datos.
    foreach($f in @($marca,$anuncio,$clave)) {Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue}
    Remove-Item -LiteralPath $control -Force -ErrorAction SilentlyContinue
  }
  if($creadaCarpeta) {Remove-Item -LiteralPath $raiz -Recurse -Force -ErrorAction SilentlyContinue}
  throw
}
