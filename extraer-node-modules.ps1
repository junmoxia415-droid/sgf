# extraer-node-modules.ps1
# Extrae un .zip de forma robusta.
# Tolerante a archivos con permisos raros, symlinks, y archivos
# que antivirus como ESET suelen bloquear (esbuild.exe, etc).
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File extraer-node-modules.ps1 -ZipPath "sgf-server-modules.zip" -Destino "."
#
# Si no se pasan argumentos, busca los zips conocidos en la carpeta actual.

param(
  [string]$ZipPath = "",
  [string]$Destino = "."
)

$ErrorActionPreference = "Continue"

function Write-Log($msg) {
  Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $msg"
}

function Expand-ZipRobust([string]$zipPath, [string]$destino) {
  if (-not (Test-Path $zipPath)) {
    Write-Log "  [WARN] No existe: $zipPath"
    return
  }

  Write-Log "  -> $zipPath ($(([math]::Round((Get-Item $zipPath).Length / 1MB, 1)) MB)"

  # Crear destino si no existe
  if (-not (Test-Path $destino)) {
    New-Item -ItemType Directory -Path $destino -Force | Out-Null
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem

  # Usar Stream para no cargar todo el zip en memoria
  $stream = [System.IO.File]::OpenRead((Resolve-Path $zipPath))
  $zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Read)

  try {
    $count = 0
    $errors = 0
    $skipped = 0
    foreach ($entry in $zip.Entries) {
      $count++
      $entryPath = Join-Path $destino $entry.FullName

      # Normalizar separadores
      $entryPath = $entryPath -replace '/', '\'

      # Es un directorio
      if ([string]::IsNullOrEmpty($entry.Name)) {
        if (-not (Test-Path $entryPath)) {
          New-Item -ItemType Directory -Path $entryPath -Force | Out-Null
        }
        continue
      }

      # Crear directorio padre si no existe
      $parentDir = Split-Path $entryPath -Parent
      if ($parentDir -and -not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
      }

      # Detectar symlinks (ExternalAttributes & 0xA000 en sistemas Unix)
      # En Windows este bit no aplica, pero el archivo se extrae como texto
      if ($entry.ExternalAttributes -ne 0 -and ($entry.ExternalAttributes -band 0xA000) -eq 0xA000) {
        $skipped++
        continue
      }

      # Saltar archivos problematicos conocidos (esbuild.exe suele
      # bloquearlos antivirus en redes corporativas)
      $fileName = [System.IO.Path]::GetFileName($entryPath).ToLower()
      $isProblematic = $false
      $problematicFiles = @('esbuild.exe', '@esbuild', 'win32-x64')
      foreach ($p in $problematicFiles) {
        if ($entry.FullName -like "*$p*") {
          $isProblematic = $true
          break
        }
      }

      # Extraer archivo
      try {
        if ($entry.Length -gt 0) {
          if ($isProblematic) {
            # Intentar primero normalmente
            try {
              [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $entryPath, $true)
            } catch {
              # Si falla (antivirus), copiar como stream de bytes
              $entryStream = $entry.Open()
              $fileStream = [System.IO.File]::Create($entryPath)
              $entryStream.CopyTo($fileStream)
              $fileStream.Close()
              $entryStream.Close()
            }
          } else {
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $entryPath, $true)
          }
        } else {
          # Archivo vacio
          if (-not (Test-Path $entryPath)) {
            New-Item -ItemType File -Path $entryPath -Force | Out-Null
          }
        }
      } catch {
        $errors++
        if ($errors -le 3) {
          Write-Log "  [WARN] No se pudo extraer: $($entry.FullName)"
          Write-Log "         $($_.Exception.Message)"
        }
      }
    }
    Write-Log "  Total: $count archivos, $errors errores, $skipped symlinks saltados"
  } finally {
    $zip.Dispose()
    $stream.Close()
  }
}

# Si se pasaron argumentos, extraer ese zip
if ($ZipPath -ne "") {
  Expand-ZipRobust $ZipPath $Destino
  Write-Log "Listo."
  exit
}

# Si no, extraer los zips conocidos
Write-Log "Extrayendo node_modules en: $Destino"

$zips = @(
  @{ Path = "sgf-server-modules.zip"; Requerido = $true },
  @{ Path = "sgf-client-modules.zip"; Requerido = $true }
)

foreach ($z in $zips) {
  Expand-ZipRobust $z.Path $Destino
}

Write-Log "Listo."
