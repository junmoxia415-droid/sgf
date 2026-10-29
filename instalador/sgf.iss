; Instalador de SGF Escritorio para Windows (Inno Setup 6).
;
; Requisitos: ninguno. El paquete ya incluye Node.js y el servidor, asi que el
; usuario solo ejecuta este archivo y pulsa Siguiente.
;
; Genera: SGF-Escritorio-Setup-<version>.exe

#define MiApp "SGF Escritorio"
#define MiVersion "@VERSION@"
#define MiEditor "SGF"

[Setup]
AppId={{8E2C1A54-6B7D-4C3E-9F11-7A5D2B4C8E90}
AppName={#MiApp}
AppVersion={#MiVersion}
AppPublisher={#MiEditor}
DefaultDirName={autopf}\SGF
DefaultGroupName=SGF
DisableProgramGroupPage=yes
OutputDir=.
OutputBaseFilename=SGF-Escritorio-Setup-{#MiVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#MiApp}
; Los datos NO se borran al desinstalar: van en %LOCALAPPDATA%\SGF
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "espanol"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "escritorio"; Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos:"
Name: "inicio"; Description: "Iniciar SGF al encender el equipo"; GroupDescription: "Opciones:"; Flags: unchecked

[Files]
; Todo el contenido de la carpeta de distribucion: la app, el servidor, Node y
; las dependencias.
Source: "..\distribucion\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Code]
// El instalador comprueba lo imprescindible para que el usuario no se encuentre
// con una app que "no arranca" sin explicacion:
//   1) que el ejecutable de la aplicacion exista,
//   2) que Node portatil vaya dentro (el usuario no tiene que instalar nada),
//   3) que el servidor compilado este.
// Si falta algo, se avisa y se cancela en vez de instalar a medias.
function InitializeSetup(): Boolean;
var
  faltan: String;
begin
  Result := True;
  faltan := '';

  if not FileExists(ExpandConstant('{src}\..\distribucion\sgf_escritorio.exe')) then
    faltan := faltan + #13#10 + '- El programa principal (sgf_escritorio.exe)';
  if not FileExists(ExpandConstant('{src}\..\distribucion\servidor\runtime\node.exe')) then
    faltan := faltan + #13#10 + '- El componente interno (node.exe)';
  if not FileExists(ExpandConstant('{src}\..\distribucion\servidor\dist\index.js')) then
    faltan := faltan + #13#10 + '- El servicio interno del programa (index.js)';

  if faltan <> '' then
  begin
    MsgBox('El paquete esta incompleto; faltan estos archivos:' + #13#10 + faltan +
      #13#10#13#10 + 'Vuelva a generar el paquete con GitHub Actions.', mbError, MB_OK);
    Result := False;
  end;
end;

// Aviso de la contrasena de fabrica, para que nadie se quede con ella puesta.
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    MsgBox('SGF se ha instalado correctamente.' + #13#10#13#10 +
      'Al abrirlo por primera vez, el asistente le guiara paso a paso.' + #13#10 +
      'La cuenta inicial es "admin" con la contrasena "Admin123!" y el programa le ' +
      'pedira cambiarla: hagalo antes de usar datos reales.',
      mbInformation, MB_OK);
end;

[Icons]
Name: "{group}\SGF Escritorio"; Filename: "{app}\sgf_escritorio.exe"
Name: "{group}\Guia de uso"; Filename: "{app}\LEEME-PRIMERO.txt"
Name: "{group}\Desinstalar SGF"; Filename: "{uninstallexe}"
Name: "{autodesktop}\SGF Escritorio"; Filename: "{app}\sgf_escritorio.exe"; Tasks: escritorio
Name: "{userstartup}\SGF Escritorio"; Filename: "{app}\sgf_escritorio.exe"; Tasks: inicio

[Run]
Filename: "{app}\sgf_escritorio.exe"; Description: "Abrir SGF ahora"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; No se toca %LOCALAPPDATA%\SGF (datos y copias del usuario).
Type: filesandordirs; Name: "{app}"
