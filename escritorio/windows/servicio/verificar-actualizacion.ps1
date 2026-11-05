# No detiene ni cambia procesos o servicios; falla cerrado ante dudas.
param([Parameter(Mandatory=$true)][string]$Carpeta)
$ErrorActionPreference = 'Stop'
try {
  $servicio = Get-CimInstance Win32_Service -Filter "Name='SGFServidor'" -ErrorAction Stop
  # Un servicio instalado contiene su propia copia del programa y puede
  # volver a iniciarse. No sustituirlo ni borrarlo automáticamente.
  if ($servicio) { exit 3 }
  $raiz = [System.IO.Path]::GetFullPath($Carpeta).TrimEnd('\') + '\'
  $procesos = Get-CimInstance Win32_Process -Filter "Name='sgf_escritorio.exe' OR Name='node.exe' OR Name='sgf_servicio.exe'" -ErrorAction Stop
  foreach ($proceso in $procesos) {
    if (-not $proceso.ExecutablePath) { exit 4 }
    $ruta = [System.IO.Path]::GetFullPath($proceso.ExecutablePath)
    if ($ruta.StartsWith($raiz, [System.StringComparison]::OrdinalIgnoreCase)) { exit 2 }
  }
  exit 0
} catch { exit 4 }
