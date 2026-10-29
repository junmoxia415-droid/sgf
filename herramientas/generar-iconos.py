"""
generar-iconos.py - Crea los iconos del programa y del instalador.

Dibuja el icono a mano (sin dependencias de SVG) para que salga nitido en todos
los tamanos: fondo redondeado verde SGF, una tarjeta de factura con lineas y una
Marca de verificacion, y el texto SGF en la version grande.

Genera:
  escritorio/windows/runner/resources/app_icon.ico   (icono del .exe, multi-tamano)
  instalador/sgf.ico                                 (icono del instalador)
  escritorio/assets/icono.png                        (1024, para la app y la web)
  instalador/icono-instalador.png                    (256, vista previa)

Uso: python3 herramientas/generar-iconos.py
"""

from PIL import Image, ImageDraw, ImageFont
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

VERDE = (14, 124, 102)        # 0E7C66, el color del tema de la app
VERDE_OSCURO = (10, 92, 76)
BLANCO = (255, 255, 255)
GRIS = (203, 214, 220)
AMBAR = (242, 176, 46)

TAMANOS_ICO = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def dibujar(lado: int, con_texto: bool) -> Image.Image:
    """Dibuja el icono a la resolucion pedida. Se dibuja a 4x y se reduce, para
    que los bordes queden suaves."""
    escala = 4
    S = lado * escala
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Fondo: cuadrado redondeado con degradado vertical sencillo.
    radio = int(S * 0.22)
    for i in range(S):
        t = i / S
        color = (
            int(VERDE[0] * (1 - t) + VERDE_OSCURO[0] * t),
            int(VERDE[1] * (1 - t) + VERDE_OSCURO[1] * t),
            int(VERDE[2] * (1 - t) + VERDE_OSCURO[2] * t),
            255,
        )
        d.line([(0, i), (S, i)], fill=color)
    mascara = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, S - 1, S - 1], radius=radio, fill=255)
    img.putalpha(mascara)

    # Tarjeta de factura blanca, ligeramente inclinada: se dibuja aparte y se rota.
    tarjeta = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    td = ImageDraw.Draw(tarjeta)
    mx, my = int(S * 0.24), int(S * 0.12)
    ancho, alto = int(S * 0.50), int(S * 0.56)
    td.rounded_rectangle([mx, my, mx + ancho, my + alto], radius=int(S * 0.045), fill=BLANCO)

    # Lineas de texto de la factura (se estrechan hacia abajo, como un documento).
    y = my + int(alto * 0.16)
    for k, factor in enumerate([0.72, 0.88, 0.62, 0.8, 0.5]):
        td.rounded_rectangle(
            [mx + int(ancho * 0.11), y, mx + int(ancho * (0.11 + 0.74 * factor)), y + max(2, int(S * 0.022))],
            radius=max(1, int(S * 0.011)),
            fill=GRIS,
        )
        y += int(alto * 0.115)

    # Importe destacado en ambar (el "total a pagar").
    td.rounded_rectangle(
        [mx + int(ancho * 0.11), y + int(alto * 0.03), mx + int(ancho * 0.55), y + int(alto * 0.03) + max(3, int(S * 0.035))],
        radius=max(1, int(S * 0.017)),
        fill=AMBAR,
    )
    tarjeta = tarjeta.rotate(-7, resample=Image.BICUBIC, center=(S // 2, S // 2))
    img.alpha_composite(tarjeta)

    # Marca de verificacion verde sobre un circulo blanco, abajo a la derecha.
    cx, cy = int(S * 0.715), int(S * 0.625)
    r = int(S * 0.145)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BLANCO)
    grosor = max(2, int(S * 0.038))
    d.line(
        [(cx - int(r * 0.48), cy + int(r * 0.02)), (cx - int(r * 0.1), cy + int(r * 0.4)), (cx + int(r * 0.52), cy - int(r * 0.42))],
        fill=VERDE,
        width=grosor,
        joint="curve",
    )

    # Texto SGF (solo en tamanos grandes, si no se emborrona).
    if con_texto:
        try:
            fuente = ImageFont.truetype("DejaVuSans-Bold.ttf", int(S * 0.15))
        except OSError:
            fuente = ImageFont.load_default()
        texto = "SGF"
        caja = d.textbbox((0, 0), texto, font=fuente)
        d.text(
            ((S - (caja[2] - caja[0])) / 2 - caja[0], S * 0.775),
            texto,
            font=fuente,
            fill=BLANCO,
        )

    return img.resize((lado, lado), Image.LANCZOS)


def main():
    destinos = {
        os.path.join(RAIZ, "escritorio", "windows", "runner", "resources", "app_icon.ico"): TAMANOS_ICO,
        os.path.join(RAIZ, "instalador", "sgf.ico"): TAMANOS_ICO,
    }

    for ruta, tamanos in destinos.items():
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        # Se parte del tamano mayor y Pillow genera todos los demas: si se le da
        # una imagen pequena, el ICO se queda solo con ese tamano.
        base = dibujar(max(l for l, _ in tamanos), con_texto=True)
        base.save(ruta, format="ICO", sizes=tamanos)
        with Image.open(ruta) as comprobacion:
            generados = sorted(comprobacion.info.get("sizes", set()))
        print(f"ICO  {os.path.relpath(ruta, RAIZ)}  {len(generados)} tamanos: {generados}")

    pngs = {
        os.path.join(RAIZ, "escritorio", "assets", "icono.png"): 1024,
        os.path.join(RAIZ, "instalador", "icono-instalador.png"): 256,
        os.path.join(RAIZ, "client", "public", "icono-sgf.png"): 512,
    }
    for ruta, lado in pngs.items():
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        dibujar(lado, con_texto=True).save(ruta, format="PNG")
        print(f"PNG  {os.path.relpath(ruta, RAIZ)}  ({lado}px)")


if __name__ == "__main__":
    main()
