; Instalador de SGF Escritorio para Windows (Inno Setup 6).
;
; Requisitos: ninguno. Dentro va TODO: el programa, el servidor, Node.js y las
; dependencias. El usuario solo ejecuta este archivo y pulsa Siguiente.
;
; Genera: SGF-Escritorio-Setup-<version>.exe
;
; Notas de mantenimiento (para no repetir los fallos anteriores):
;   - Una cadena NO puede contener el caracter '#' (Inno lo toma como directiva
;     de preprocesador). Los saltos de linea se escriben Chr(13) + Chr(10).
;   - En Pascal Script no existe NewLine: usar Chr(13) + Chr(10).
;   - Las rutas de los archivos que lleva el paquete se comprueban con
;     Source: en [Files], no con FileExists en tiempo de instalacion: en el
;     equipo del usuario esos archivos ya no estan en la carpeta de origen.

#define MiApp "SGF Escritorio"
#define MiVersion "@VERSION@"
#define MiEditor "SGF"
#define MiWeb "https://github.com/junmoxia415-droid/sgf/releases"

[Setup]
AppId={{8E2C1A54-6B7D-4C3E-9F11-7A5D2B4C8E90}
AppName={#MiApp}
AppVersion={#MiVersion}
AppVerName={#MiApp} {#MiVersion}
AppPublisher={#MiEditor}
AppPublisherURL={#MiWeb}
AppSupportURL={#MiWeb}
DefaultDirName={autopf}\SGF
DefaultGroupName=SGF
DisableProgramGroupPage=yes
OutputDir=.
OutputBaseFilename=SGF-Escritorio-Setup-{#MiVersion}

; ── Diseño ────────────────────────────────────────────────────────────────
; Asistente moderno, con el icono de la aplicación y la marca lateral.
WizardStyle=modern
WizardImageFile=compiler:WizModernImage.bmp
WizardSmallImageFile=icono-instalador.png
WizardImageStretch=yes
SetupIconFile=sgf.ico
UninstallDisplayIcon={app}\sgf_escritorio.exe
UninstallDisplayName={#MiApp}
WindowVisible=yes

Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; Instalación por usuario: no pide permisos de administrador.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
; No permitir dos instalaciones a la vez sobre la misma carpeta.
SetupMutex=SGF_Escritorio_Instalador
; Los datos NO se borran al desinstalar: van en %LOCALAPPDATA%\SGF
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "espanol"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "escritorio"; Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos:"; Flags: checkedonce
Name: "inicio"; Description: "Iniciar SGF automáticamente al encender el equipo"; GroupDescription: "Opciones:"; Flags: unchecked

[Files]
; Todo el contenido de la carpeta de distribución: la app, el servidor, Node y
; las dependencias. Si algo faltara, la compilación falla antes de llegar aquí.
Source: "..\distribucion\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\SGF Escritorio"; Filename: "{app}\sgf_escritorio.exe"; IconFilename: "{app}\sgf_escritorio.exe"
Name: "{group}\Guía de primeros pasos"; Filename: "{app}\LEEME-PRIMERO.txt"
Name: "{group}\Desinstalar SGF"; Filename: "{uninstallexe}"
Name: "{autodesktop}\SGF Escritorio"; Filename: "{app}\sgf_escritorio.exe"; Tasks: escritorio
Name: "{userstartup}\SGF Escritorio"; Filename: "{app}\sgf_escritorio.exe"; Tasks: inicio

[Run]
; Se ofrece abrir la app al terminar, marcado por defecto.
Filename: "{app}\sgf_escritorio.exe"; Description: "Abrir SGF Escritorio ahora"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Nada de la carpeta de datos: los datos del usuario se quedan.

[Code]
var
  PaginaBienvenida: TInputOptionWizardPage;

// ── Comprobaciones previas ────────────────────────────────────────────────
// Se mira solo lo que hay que mirar aquí: que el equipo sea Windows de 64 bits
// y que Inno tenga permiso de escribir en la carpeta destino. Antes se
// comprobaba la carpeta de ORIGEN y el instalador se negaba a instalarse en
// cualquier equipo que no fuera el de compilación (fallo reportado en Descargas).
function InitializeSetup(): Boolean;
var
  Version: TWindowsVersion;
begin
  Result := True;
  GetWindowsVersionEx(Version);
  if Version.Major < 10 then
  begin
    if MsgBox('Este programa está pensado para Windows 10 u 11.' + Chr(13) + Chr(10) +
      'En versiones anteriores puede no funcionar bien. ¿Desea continuar?',
      mbConfirmation, MB_YESNO) = IDNO then
      Result := False;
  end;
end;

// Página de bienvenida propia: en dos líneas explica qué se va a instalar y
// avisa de la cuenta inicial. Es lo primero que ve el usuario.
procedure InitializeWizard();
begin
  PaginaBienvenida := CreateInputOptionPage(wpWelcome,
    'Bienvenido a SGF Escritorio',
    'Sistema de Gestión de Facturación de telefonía',
    'Se va a instalar SGF en este equipo. Todo lo necesario va dentro del ' +
    'instalador: no hace falta instalar Node, ni Java, ni nada más. ' +
    'El programa funciona sin conexión a Internet.' + Chr(13) + Chr(10) + Chr(13) + Chr(10) +
    'Marque las opciones que quiera y pulse Siguiente.',
    False, False);
  PaginaBienvenida.Add('Crear un acceso directo en el escritorio');
  PaginaBienvenida.Add('Iniciar SGF automáticamente al encender el equipo');
  PaginaBienvenida.Values[0] := True;
  PaginaBienvenida.Values[1] := False;
end;

// Traslada lo elegido en la página de bienvenida a las tareas de instalación.
procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpSelectTasks then
  begin
    if PaginaBienvenida.Values[0] then
      WizardSelectComponents('escritorio');
    if PaginaBienvenida.Values[1] then
      WizardSelectComponents('inicio');
  end;
end;

// Aviso final con lo que tiene que saber el usuario para empezar.
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    MsgBox('SGF se ha instalado correctamente.' + Chr(13) + Chr(10) + Chr(13) + Chr(10) +
      'Al abrirlo por primera vez, el asistente le guiará paso a paso.' + Chr(13) + Chr(10) +
      'Cuenta inicial: usuario "yolexis".' + Chr(13) + Chr(10) +
      'La contraseña se pide cambiarla en el primer acceso: hágalo antes de ' +
      'introducir datos reales.' + Chr(13) + Chr(10) + Chr(13) + Chr(10) +
      'Sus datos se guardan en la carpeta del usuario y NO se borran al desinstalar.',
      mbInformation, MB_OK);
end;
