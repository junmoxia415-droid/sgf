import 'package:flutter/material.dart';

/// Piezas visuales reutilizables: tarjetas, avisos con explicación, estados
/// vacíos y diálogos de confirmación "a prueba de dedo torpe".

class PantallaCarga extends StatelessWidget {
  const PantallaCarga({super.key, required this.mensaje});
  final String mensaje;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 46,
              height: 46,
              child: CircularProgressIndicator(strokeWidth: 4),
            ),
            const SizedBox(height: 18),
            Text(mensaje, style: Theme.of(context).textTheme.titleMedium),
          ],
        ),
      ),
    );
  }
}

class Tarjeta extends StatelessWidget {
  const Tarjeta({super.key, required this.child, this.padding = const EdgeInsets.all(18)});
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Card(child: Padding(padding: padding, child: child));
  }
}

/// Aviso con título y explicación: el "por qué" en lenguaje llano.
class Aviso extends StatelessWidget {
  const Aviso({
    super.key,
    required this.titulo,
    required this.mensaje,
    this.tipo = TipoAviso.info,
    this.accion,
  });

  final String titulo;
  final String mensaje;
  final TipoAviso tipo;
  final Widget? accion;

  @override
  Widget build(BuildContext context) {
    final (color, icono) = switch (tipo) {
      TipoAviso.info => (const Color(0xFF1D6FB8), Icons.info_outline),
      TipoAviso.exito => (const Color(0xFF1B7F4B), Icons.check_circle_outline),
      TipoAviso.aviso => (const Color(0xFFB8730B), Icons.warning_amber_rounded),
      TipoAviso.error => (const Color(0xFFB3261E), Icons.error_outline),
    };
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icono, color: color, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(titulo, style: TextStyle(fontWeight: FontWeight.w700, color: color, fontSize: 15)),
                const SizedBox(height: 4),
                Text(mensaje, style: const TextStyle(fontSize: 14, height: 1.4)),
                if (accion != null) ...[const SizedBox(height: 10), accion!],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

enum TipoAviso { info, exito, aviso, error }

/// Diálogo de confirmación que explica consecuencias y exige escribir una
/// palabra cuando la acción es destructiva.
Future<bool> confirmar(
  BuildContext context, {
  required String titulo,
  required String mensaje,
  String textoConfirmar = 'Continuar',
  String textoCancelar = 'Cancelar',
  bool destructivo = false,
  String? escribirParaConfirmar,
}) async {
  final controlador = TextEditingController();
  final resultado = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) {
        final puede = escribirParaConfirmar == null || controlador.text.trim() == escribirParaConfirmar;
        return AlertDialog(
          title: Row(
            children: [
              Icon(destructivo ? Icons.warning_amber_rounded : Icons.help_outline,
                  color: destructivo ? const Color(0xFFB3261E) : null),
              const SizedBox(width: 10),
              Expanded(child: Text(titulo)),
            ],
          ),
          content: SizedBox(
            width: 460,
            child: SingleChildScrollView(
              child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(mensaje, style: const TextStyle(fontSize: 15, height: 1.45)),
                if (escribirParaConfirmar != null) ...[
                  const SizedBox(height: 16),
                  Text('Escriba «$escribirParaConfirmar» para confirmar:',
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: controlador,
                    autofocus: true,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(hintText: 'Escriba aquí'),
                  ),
                ],
              ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(textoCancelar)),
            FilledButton(
              style: destructivo ? FilledButton.styleFrom(backgroundColor: const Color(0xFFB3261E)) : null,
              onPressed: puede ? () => Navigator.pop(context, true) : null,
              child: Text(textoConfirmar),
            ),
          ],
        );
      },
    ),
  );
  // El controlador se libera cuando el dialogo ha terminado de desmontarse;
  // liberarlo antes provoca "TextEditingController used after being disposed".
  WidgetsBinding.instance.addPostFrameCallback((_) => controlador.dispose());
  return resultado ?? false;
}

void avisar(BuildContext context, String mensaje, {TipoAviso tipo = TipoAviso.exito}) {
  final color = switch (tipo) {
    TipoAviso.info => const Color(0xFF1D6FB8),
    TipoAviso.exito => const Color(0xFF1B7F4B),
    TipoAviso.aviso => const Color(0xFFB8730B),
    TipoAviso.error => const Color(0xFFB3261E),
  };
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(mensaje),
      backgroundColor: color,
      duration: const Duration(seconds: 5),
    ),
  );
}

/// Etiqueta de estado con color.
class Etiqueta extends StatelessWidget {
  const Etiqueta({super.key, required this.texto, required this.color, this.icono});
  final String texto;
  final Color color;
  final IconData? icono;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icono != null) ...[Icon(icono, size: 14, color: color), const SizedBox(width: 5)],
          Text(texto, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12.5)),
        ],
      ),
    );
  }
}

/// Dato grande para los paneles de resumen.
class Dato extends StatelessWidget {
  const Dato({super.key, required this.etiqueta, required this.valor, this.color, this.icono});
  final String etiqueta;
  final String valor;
  final Color? color;
  final IconData? icono;

  @override
  Widget build(BuildContext context) {
    final c = color ?? Theme.of(context).colorScheme.primary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            if (icono != null) ...[Icon(icono, size: 16, color: c), const SizedBox(width: 6)],
            Text(etiqueta.toUpperCase(),
                style: TextStyle(fontSize: 11.5, letterSpacing: 0.6, fontWeight: FontWeight.w700, color: c)),
          ],
        ),
        const SizedBox(height: 6),
        Text(valor, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, height: 1.1)),
      ],
    );
  }
}

/// Cabecera de cada pantalla: título + explicación de qué se hace aquí.
class Cabecera extends StatelessWidget {
  const Cabecera({super.key, required this.titulo, required this.descripcion, this.acciones = const []});
  final String titulo;
  final String descripcion;
  final List<Widget> acciones;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(titulo, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 4),
                Text(descripcion,
                    style: TextStyle(fontSize: 14.5, color: Theme.of(context).colorScheme.onSurfaceVariant, height: 1.4)),
              ],
            ),
          ),
          if (acciones.isNotEmpty) ...[const SizedBox(width: 16), ...acciones],
        ],
      ),
    );
  }
}

/// Dos bloques que se ponen uno al lado del otro en pantallas anchas y uno
/// debajo del otro en ventanas estrechas (portátiles pequeños o ventana
/// reducida). Así nunca se corta el contenido.
class EnColumnas extends StatelessWidget {
  const EnColumnas({
    super.key,
    required this.izquierda,
    required this.derecha,
    this.flexIzquierda = 5,
    this.flexDerecha = 4,
    this.espacio = 16,
    this.anchoMinimo = 980,
  });

  final Widget izquierda;
  final Widget derecha;
  final int flexIzquierda;
  final int flexDerecha;
  final double espacio;
  final double anchoMinimo;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, restricciones) {
        if (restricciones.maxWidth < anchoMinimo) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [izquierda, SizedBox(height: espacio), derecha],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(flex: flexIzquierda, child: izquierda),
            SizedBox(width: espacio),
            Expanded(flex: flexDerecha, child: derecha),
          ],
        );
      },
    );
  }
}
