"""Genera las texturas de vapor (nubes muy difuminadas) de forma determinista.

Requiere: numpy, pillow, scikit-image.
Uso: python scripts/generar-vapor.py  (escribe assets/img/vapor-*.webp)
"""

from pathlib import Path

import numpy as np
from PIL import Image
from skimage.filters import gaussian
from skimage.transform import resize

W, H = 1100, 700
SALIDA = Path(__file__).resolve().parent.parent / "assets" / "img"

# (semilla, color RGB) — blanco lavanda, azul claro, magenta suave, lavanda, azul
VAPORES = [
    (11, (236, 228, 255)),
    (23, (170, 222, 248)),
    (37, (246, 170, 226)),
    (41, (214, 206, 250)),
    (53, (150, 196, 240)),
]


def ruido_fractal(rng: np.random.Generator) -> np.ndarray:
    total = np.zeros((H, W))
    amplitud, suma = 1.0, 0.0
    for celdas in (3, 6, 12, 24, 48):
        grilla = rng.random((celdas, int(celdas * W / H)))
        total += amplitud * resize(grilla, (H, W), order=3, mode="reflect")
        suma += amplitud
        amplitud *= 0.55
    total /= suma
    return (total - total.min()) / (total.max() - total.min())


def caida_radial() -> np.ndarray:
    y, x = np.mgrid[0:H, 0:W]
    dx = (x - W / 2) / (W / 2)
    dy = (y - H / 2) / (H / 2)
    d = np.sqrt(dx**2 + dy**2)
    return np.clip(1 - d, 0, 1) ** 1.6


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    for i, (semilla, color) in enumerate(VAPORES, start=1):
        rng = np.random.default_rng(semilla)
        alfa = np.clip((ruido_fractal(rng) - 0.35) * 2.2, 0, 1) * caida_radial()
        alfa = gaussian(alfa, sigma=14)
        alfa = alfa / alfa.max()
        rgba = np.zeros((H, W, 4), dtype=np.uint8)
        rgba[..., :3] = color
        rgba[..., 3] = (alfa * 255).astype(np.uint8)
        Image.fromarray(rgba, "RGBA").save(SALIDA / f"vapor-{i}.webp", "WEBP", quality=85, method=6)


if __name__ == "__main__":
    main()
