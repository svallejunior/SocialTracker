"""
processar_imagem.py — Utilitário para limpar metadados de imagens, converter para JPEG e injetar EXIF de celulares reais.
SocialTracker Image Processing Engine
"""

import os
import sys
import io
import random
from datetime import datetime
from PIL import Image

try:
    import piexif
    HAS_PIEXIF = True
except ImportError:
    HAS_PIEXIF = False

# Perfis de celulares reais de última geração para simulação de fotos de câmera nativa
PERFIS_CELULARES = [
    {
        "nome": "iPhone 15 Pro",
        "make": "Apple",
        "model": "iPhone 15 Pro",
        "software": "17.5.1",
        "lens_model": "iPhone 15 Pro back triple camera 6.765mm f/1.78",
        "f_number": (178, 100),
        "iso": 100
    },
    {
        "nome": "iPhone 14 Pro",
        "make": "Apple",
        "model": "iPhone 14 Pro",
        "software": "17.4.1",
        "lens_model": "iPhone 14 Pro back triple camera 6.86mm f/1.78",
        "f_number": (178, 100),
        "iso": 125
    },
    {
        "nome": "Samsung Galaxy S24 Ultra",
        "make": "Samsung",
        "model": "SM-S928B",
        "software": "S928BXXU1AXCA",
        "lens_model": "Galaxy S24 Ultra Rear Camera",
        "f_number": (170, 100),
        "iso": 50
    },
    {
        "nome": "Samsung Galaxy S23 Ultra",
        "make": "Samsung",
        "model": "SM-S918B",
        "software": "S918BXXU3CXCF",
        "lens_model": "Galaxy S23 Ultra Rear Camera",
        "f_number": (170, 100),
        "iso": 64
    },
    {
        "nome": "Google Pixel 8 Pro",
        "make": "Google",
        "model": "Pixel 8 Pro",
        "software": "Android 14",
        "lens_model": "Pixel 8 Pro back camera 6.8mm",
        "f_number": (168, 100),
        "iso": 64
    }
]


def gerar_exif_celular(perfil=None):
    """Gera bytes de metadados EXIF simulando foto tirada com celular real."""
    if not HAS_PIEXIF:
        return None

    if perfil is None:
        perfil = random.choice(PERFIS_CELULARES)

    agora = datetime.now()
    data_str = agora.strftime("%Y:%m:%d %H:%M:%S")

    exif_dict = {
        "0th": {
            piexif.ImageIFD.Make: perfil["make"],
            piexif.ImageIFD.Model: perfil["model"],
            piexif.ImageIFD.Software: perfil["software"],
            piexif.ImageIFD.DateTime: data_str,
            piexif.ImageIFD.Orientation: 1,
        },
        "Exif": {
            piexif.ExifIFD.DateTimeOriginal: data_str,
            piexif.ExifIFD.DateTimeDigitized: data_str,
            piexif.ExifIFD.LensModel: perfil["lens_model"],
            piexif.ExifIFD.FNumber: perfil["f_number"],
            piexif.ExifIFD.ISOSpeedRatings: perfil["iso"],
            piexif.ExifIFD.ColorSpace: 1,  # sRGB
            piexif.ExifIFD.ExposureProgram: 2,  # Normal program
            piexif.ExifIFD.Flash: 0,  # Flash did not fire
        }
    }

    try:
        return piexif.dump(exif_dict), perfil
    except Exception as err:
        print(f"[Aviso] Erro ao gerar EXIF: {err}", file=sys.stderr)
        return None, perfil


def processar_imagem_para_celular(caminho_ou_buffer_in, caminho_out=None, qualidade=95):
    """
    1. Abre imagem (PNG, JPG, WEBP, etc.)
    2. Converte para RGB puro (limpando qualquer metadado prévio de edição/IA)
    3. Gera e injeta novos metadados EXIF de celular (iPhone / Galaxy / Pixel)
    4. Salva como JPEG com alta qualidade
    
    Retorna: (caminho_final, bytes_jpeg, nome_celular)
    """
    if isinstance(caminho_ou_buffer_in, (bytes, bytearray)):
        img_raw = Image.open(io.BytesIO(caminho_ou_buffer_in))
    else:
        img_raw = Image.open(caminho_ou_buffer_in)

    with img_raw:
        # Converter para RGB puro descartando canais alfa e metadados anteriores
        img_rgb = img_raw.convert("RGB")
        
        # Recria a imagem em RGB para garantir o descarte absoluto de metadados antigos
        img_limpa = Image.new("RGB", img_rgb.size)
        img_limpa.paste(img_rgb)

        exif_bytes, perfil_escolhido = gerar_exif_celular()

        out_buffer = io.BytesIO()
        if exif_bytes:
            img_limpa.save(out_buffer, format="JPEG", quality=qualidade, exif=exif_bytes)
        else:
            img_limpa.save(out_buffer, format="JPEG", quality=qualidade)

        jpeg_bytes = out_buffer.getvalue()

        if caminho_out:
            os.makedirs(os.path.dirname(os.path.abspath(caminho_out)), exist_ok=True)
            with open(caminho_out, "wb") as f:
                f.write(jpeg_bytes)

        return caminho_out, jpeg_bytes, (perfil_escolhido["nome"] if perfil_escolhido else "Generico")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--file":
        input_path = sys.argv[2]
        output_path = sys.argv[3] if len(sys.argv) > 3 else input_path
        res_path, _, cel = processar_imagem_para_celular(input_path, output_path)
        print(f"OK: Processado com perfil {cel} -> {res_path}")
    elif len(sys.argv) > 1 and sys.argv[1] == "--stdin":
        # Le da entrada padrao e escreve na saida padrao
        input_bytes = sys.stdin.buffer.read()
        _, out_bytes, cel = processar_imagem_para_celular(input_bytes)
        sys.stdout.buffer.write(out_bytes)
    else:
        # Teste rapido
        test_img = Image.new("RGBA", (200, 200), color=(255, 0, 100, 200))
        buf = io.BytesIO()
        test_img.save(buf, format="PNG")
        _, out_bytes, cel = processar_imagem_para_celular(buf.getvalue())
        print(f"[OK] Teste de modulo concluido: {len(out_bytes)} bytes JPEG gerados com perfil '{cel}'")
