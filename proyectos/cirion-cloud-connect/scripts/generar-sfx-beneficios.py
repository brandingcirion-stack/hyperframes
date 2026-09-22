"""Sintetiza los efectos de la escena de beneficios (pulsos estéreo discretos).

Determinista y sin material de terceros. Requiere numpy y ffmpeg.
Uso: python scripts/generar-sfx-beneficios.py  (escribe assets/audio/beneficios-sfx.flac)

Los tiempos deben coincidir con compositions/beneficios.html (ENCENDIDOS y CIERRE).
"""

import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

SR = 48000
DURACION = 9.0
VIAJE = 0.45  # el pulso recorre el radio antes de encender el nodo
# (inicio del viaje, paneo -1..1): Seguridad, Flexibilidad, Disponibilidad, Performance
ENCENDIDOS = [(1.0, 0.0), (2.6, 0.35), (4.2, 0.0), (5.8, -0.35)]
CIERRE = 7.3
SALIDA = Path(__file__).resolve().parent.parent / "assets" / "audio" / "beneficios-sfx.flac"


def paneo(p: float) -> tuple[float, float]:
    angulo = (p + 1) * np.pi / 4  # paneo de igual potencia
    return float(np.cos(angulo)), float(np.sin(angulo))


def agregar(buf: np.ndarray, t0: float, mono: np.ndarray, pan: float) -> None:
    i = int(t0 * SR)
    fin = min(len(buf), i + len(mono))
    l, r = paneo(pan)
    buf[i:fin, 0] += mono[: fin - i] * l
    buf[i:fin, 1] += mono[: fin - i] * r


def viaje() -> np.ndarray:
    t = np.arange(int(VIAJE * SR)) / SR
    frec = 420 + (840 - 420) * (t / VIAJE) ** 2
    fase = 2 * np.pi * np.cumsum(frec) / SR
    env = np.sin(np.pi * t / VIAJE) ** 2
    return 0.07 * env * np.sin(fase)


def pulso() -> np.ndarray:
    t = np.arange(int(0.9 * SR)) / SR
    ataque = np.clip(t / 0.005, 0, 1)
    brillo = (np.sin(2 * np.pi * 880 * t) + 0.5 * np.sin(2 * np.pi * 1320 * t)) * np.exp(-t / 0.12)
    cuerpo = np.sin(2 * np.pi * 110 * t) * np.exp(-t / 0.18)
    return ataque * (0.22 * brillo + 0.2 * cuerpo)


def acorde(buf: np.ndarray, t0: float) -> None:
    t = np.arange(int(1.7 * SR)) / SR
    env = np.clip(t / 0.03, 0, 1) * np.exp(-t / 0.55)
    i = int(t0 * SR)
    fin = min(len(buf), i + len(t))
    for f in (523.25, 659.25, 783.99):
        # leve desafinación L/R para dar amplitud estéreo sin romper la compatibilidad mono
        buf[i:fin, 0] += (0.07 * env * np.sin(2 * np.pi * (f - 0.7) * t))[: fin - i]
        buf[i:fin, 1] += (0.07 * env * np.sin(2 * np.pi * (f + 0.7) * t))[: fin - i]


def main() -> None:
    buf = np.zeros((int(DURACION * SR), 2))
    for t0, pan in ENCENDIDOS:
        agregar(buf, t0, viaje(), pan * 0.5)
        agregar(buf, t0 + VIAJE, pulso(), pan)
    acorde(buf, CIERRE)
    buf *= 10 ** (-3 / 20) / np.max(np.abs(buf))  # pico de muestra en -3 dBFS
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "sfx.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((buf * 32767).astype("<i2").tobytes())
        # FLAC sin pérdida: mantiene el archivo por debajo del límite de binarios del repo
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-c:a", "flac", "-compression_level", "12", str(SALIDA)],
            check=True,
        )


if __name__ == "__main__":
    main()
