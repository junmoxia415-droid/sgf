import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';

class AjustesFalso extends Ajustes {
  AjustesFalso(this.file);
  final File file;
  bool fallar=false;
  @override Future<void> guardar() async {if(!fallar) await file.writeAsString(jsonEncode({'nombreDnsFijo':nombreDnsFijo}));}
}
class ControlFalso extends ControladorServidor {
  ControlFalso({required super.ajustes,required super.api,required this.file});
  final File file;
  @override File get archivoAjustes => file;
}
void main(){
  test('Guardar un nombre válido sin cambiar el DNS y conservarlo en ajustes',() async {
    final dir=await Directory.systemTemp.createTemp('sgf-dns-falso-');final file=File('${dir.path}/ajustes.json');
    final ajustes=AjustesFalso(file);final c=ControlFalso(ajustes:ajustes,api:Api(),file:file);
    try {
      await c.guardarNombreDnsFijo(' SGF.VCL.MN ');
      expect(ajustes.nombreDnsFijo,'sgf.vcl.mn');expect(jsonDecode(await file.readAsString())['nombreDnsFijo'],'sgf.vcl.mn');
      for(final n in ['http://sgf.vcl.mn','sgf.vcl.mn:443','192.0.2.1','sgf..local','localhost.localdomain','-sgf.example']) {
        await expectLater(c.guardarNombreDnsFijo(n),throwsStateError);
        expect(ajustes.nombreDnsFijo,'sgf.vcl.mn');
      }
      ajustes.fallar=true;
      await expectLater(c.guardarNombreDnsFijo('otro.ejemplo.test'),throwsStateError);
      expect(ajustes.nombreDnsFijo,'sgf.vcl.mn');
      ajustes.fallar=false;await c.guardarNombreDnsFijo('');expect(ajustes.nombreDnsFijo,isNull);
    } finally {c.dispose();await dir.delete(recursive:true);}
  });
}
