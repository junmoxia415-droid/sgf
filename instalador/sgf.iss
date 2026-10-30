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
Name: "inicio"; Description: "Abrir SGF automáticamente al iniciar sesión en Windows"; GroupDescription: "Opciones:"; Flags: unchecked

[Files]
; Todo el contenido de la carpeta de distribución: la app, el servidor, Node y
; las dependencias. Si algo faltara, la compilación falla antes de llegar aquí.
Source: "..\distribucion\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\SGF Escritorio"; Filename: "{app}\sgf_escritorio.exe"; IconFilename: "{app}\sgf_escritorio.exe"
Name: "{group}\Guía de primeros pasos"; Filename: "{app}\LEEME-PRIMERO.txt"
Name: "{group}\Desinstalar SGF"; Filename: "{uninstallexe}"
Name: "{autodesktop}\SGF Escritorio"; Filename: "{app}\sgf_escritorio.exe"; Tasks: escritorio

[Registry]
; Misma entrada que gestiona el interruptor dentro de SGF, solo para este usuario.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "SGF Escritorio"; ValueData: """{app}\sgf_escritorio.exe"""; Tasks: inicio; Flags: uninsdeletevalue

[InstallDelete]
; Si se selecciona inicio, sustituir el acceso antiguo por la entrada anterior.
Type: files; Name: "{userstartup}\SGF Escritorio.lnk"; Tasks: inicio

[Run]
; Se ofrece abrir la app al terminar, marcado por defecto.
Filename: "{app}\sgf_escritorio.exe"; Description: "Abrir SGF Escritorio ahora"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; La opción de inicio puede haberse activado desde la aplicación después de instalar.
; Se elimina solo esta entrada del usuario actual, sin tocar los datos.
Filename: "{sys}\reg.exe"; Parameters: "delete ""HKCU\Software\Microsoft\Windows\CurrentVersion\Run"" /v ""SGF Escritorio"" /f"; Flags: runhidden; RunOnceId: "QuitarInicioSGF"

[UninstallDelete]
; Nada de la carpeta de datos: los datos del usuario se quedan.

[Code]
var
  PaginaBienvenida: TInputOptionWizardPage;
  PaginaDatos: TInputOptionWizardPage;

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
  PaginaBienvenida.Add('Abrir SGF automáticamente al iniciar sesión en Windows');
  PaginaBienvenida.Values[0] := True;
  PaginaBienvenida.Values[1] := False;
  PaginaDatos := CreateInputOptionPage(PaginaBienvenida.ID,
    'Datos de SGF', 'Elija qué hacer con los datos anteriores',
    'La opción recomendada conserva usuarios, facturas, ajustes y líneas.' + Chr(13) + Chr(10) +
    'Si desea empezar desde cero, SGF guardará una copia de la carpeta local antes de crear una nueva. Las bases externas no se borran.',
    True, False);
  PaginaDatos.Add('Conservar mis datos anteriores (recomendado)');
  PaginaDatos.Add('Empezar desde cero: archivar mis datos locales y abrir el asistente');
  PaginaDatos.Values[0] := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = PaginaDatos.ID) and PaginaDatos.Values[1] then
  begin
    Result := MsgBox('¿Está seguro de empezar desde cero en este equipo?' + Chr(13) + Chr(10) +
      'Se archivarán los usuarios, ajustes y facturas locales. La aplicación creará una base vacía.' + Chr(13) + Chr(10) +
      'Cierre todas las ventanas de SGF antes de continuar. Las bases externas no se eliminan.',
      mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
  end;
end;

// Traslada lo elegido en la página de bienvenida a las tareas de instalación.
procedure CurPageChanged(CurPageID: Integer);
var
  Tareas: String;
begin
  if CurPageID = wpSelectTasks then
  begin
    Tareas := '';
    if PaginaBienvenida.Values[0] then Tareas := 'escritorio';
    if PaginaBienvenida.Values[1] then
    begin
      if Tareas <> '' then Tareas := Tareas + ',';
      Tareas := Tareas + 'inicio';
    end;
    WizardSelectTasks(Tareas);
  end;
end;

// Aviso final con lo que tiene que saber el usuario para empezar.
procedure CurStepChanged(CurStep: TSetupStep);
var
  Marcador: String;
begin
  if CurStep = ssPostInstall then
  begin
    Marcador := ExpandConstant('{userappdata}\SGF-solicitud-reinicio.txt');
    if PaginaDatos.Values[1] and (not WizardSilent) then
    begin
      if not SaveStringToFile(Marcador, 'El usuario confirmó archivar los datos locales.', False) then
        MsgBox('No se pudo preparar el reinicio de datos. Los datos anteriores se conservaron.', mbError, MB_OK);
    end
    else if FileExists(Marcador) and (not DeleteFile(Marcador)) then
      MsgBox('No se pudo cancelar una solicitud anterior de reinicio. No abra SGF hasta resolverlo; sus datos se conservan.', mbError, MB_OK);
    if not WizardSilent then MsgBox('SGF se ha instalado correctamente.' + Chr(13) + Chr(10) + Chr(13) + Chr(10) +
      'Si la instalación está vacía, el asistente le ayudará a crear su cuenta de administrador.' + Chr(13) + Chr(10) +
      'Las demás cuentas las crea el administrador desde Usuarios.' + Chr(13) + Chr(10) + Chr(10) +
      'Los datos anteriores se conservan salvo que haya elegido empezar de cero.', mbInformation, MB_OK);
  end;
end;
