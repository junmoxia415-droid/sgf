; Instalador EXPERIMENTAL aislado. Nunca actualiza la instalacion SGF estable.
#define MiVersion "@VERSION@"
[Setup]
AppId={{38AC5A5C-6BD7-45C4-B129-084D96797308}
AppName=SGF PRUEBA AISLADA
AppVersion={#MiVersion}
AppVerName=SGF PRUEBA AISLADA {#MiVersion}
AppPublisher=SGF
DefaultDirName={localappdata}\SGF-Prueba-4.0.8
DefaultGroupName=SGF Prueba 4.0.8
DisableProgramGroupPage=yes
DisableDirPage=yes
UsePreviousAppDir=no
OutputDir=.
OutputBaseFilename=SGF-Escritorio-Setup-{#MiVersion}
WizardStyle=modern
WizardImageFile=compiler:WizModernImage.bmp
WizardSmallImageFile=icono-instalador.png
WizardImageStretch=yes
SetupIconFile=sgf.ico
UninstallDisplayIcon={app}\sgf_escritorio.exe
UninstallDisplayName=SGF Prueba 4.0.8
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
SetupMutex=SGF_Escritorio_Prueba_408
CloseApplications=no
RestartApplications=no
[Languages]
Name: "espanol"; MessagesFile: "compiler:Languages\Spanish.isl"
[Tasks]
Name: "escritorio"; Description: "Crear acceso directo de SGF PRUEBA en el escritorio"; GroupDescription: "Accesos directos:"; Flags: checkedonce
[Files]
Source: "..\distribucion\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\SGF Prueba 4.0.8"; Filename: "{app}\sgf_escritorio.exe"; IconFilename: "{app}\sgf_escritorio.exe"
Name: "{group}\Guía de prueba"; Filename: "{app}\LEEME-PRIMERO.txt"
Name: "{group}\Desinstalar SGF Prueba 4.0.8"; Filename: "{uninstallexe}"
Name: "{autodesktop}\SGF Prueba 4.0.8"; Filename: "{app}\sgf_escritorio.exe"; Tasks: escritorio
[Run]
Filename: "{app}\sgf_escritorio.exe"; Description: "Abrir SGF PRUEBA ahora"; Flags: nowait postinstall skipifsilent unchecked
[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if CompareText(ExpandFileName(WizardDirValue), ExpandFileName(ExpandConstant('{localappdata}\SGF-Prueba-4.0.8'))) <> 0 then
    Result := 'Por seguridad, esta version de prueba solo se instala en su carpeta aislada. No se ha cambiado la instalacion anterior.';
end;
procedure InitializeWizard();
begin
  WizardForm.WelcomeLabel2.Caption := 'Esta version es EXCLUSIVAMENTE PARA PRUEBAS con datos ficticios.' + Chr(13) + Chr(10) + Chr(13) + Chr(10) +
    'Se instala en una carpeta separada y usa su propia carpeta de datos. No actualiza la instalacion SGF existente.' + Chr(13) + Chr(10) + Chr(13) + Chr(10) +
    'No use facturas ni bases de datos reales. HTTPS requiere confiar en el certificado de prueba en los equipos cliente y una red que permita la conexion.';
end;
