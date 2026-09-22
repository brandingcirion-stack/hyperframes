"""Banda sonora de Cloud Connect (36 s): música synth tech + efectos sincronizados.

Todo se sintetiza aquí, de forma determinista y sin material de terceros.
Requiere numpy, scipy y ffmpeg.
Uso: python scripts/generar-audio.py  (escribe assets/audio/banda-sonora.flac)

Grilla: 120 BPM (pulso 0,5 s, compás 2 s), La menor. Los tiempos de los efectos
coinciden con los de compositions/*.html (tiempos globales = inicio de escena + tiempo local).
Mezcla final normalizada con ffmpeg loudnorm a −16 LUFS integrados, true peak −1,5 dBTP.
"""

import json
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
DURACION = 36.0
PULSO = 0.5  # 120 BPM
SALIDA = Path(__file__).resolve().parent.parent / "assets" / "audio" / "banda-sonora.flac"
rng = np.random.default_rng(2027)
N = int(DURACION * SR)
T = np.arange(N) / SR


# ---------- utilidades ----------
def nota(n: str) -> float:
    nombres = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    return 440.0 * 2 ** ((nombres[n[0]] + 12 * (int(n[1:]) - 4)) / 12)


def sierra(f: float, t: np.ndarray, armonicos: int = 24) -> np.ndarray:
    k = np.arange(1, armonicos + 1)
    k = k[k * f < 9000]
    return (np.sin(2 * np.pi * f * np.outer(t, k)) / k).sum(axis=1)


def filtro(x: np.ndarray, corte: float, tipo: str = "low", orden: int = 2) -> np.ndarray:
    return sosfilt(butter(orden, corte, btype=tipo, fs=SR, output="sos"), x)


def paneo(p: float) -> tuple[float, float]:
    a = (p + 1) * np.pi / 4
    return float(np.cos(a)), float(np.sin(a))


def sumar(buf: np.ndarray, t0: float, x: np.ndarray, pan: float = 0.0, ganancia: float = 1.0) -> None:
    i = int(round(t0 * SR))
    if i >= len(buf):
        return
    fin = min(len(buf), i + len(x))
    l, r = paneo(pan)
    buf[i:fin, 0] += x[: fin - i] * l * ganancia
    buf[i:fin, 1] += x[: fin - i] * r * ganancia


def sumar_estereo(buf: np.ndarray, t0: float, izq: np.ndarray, der: np.ndarray, ganancia: float = 1.0) -> None:
    i = int(round(t0 * SR))
    fin = min(len(buf), i + len(izq))
    buf[i:fin, 0] += izq[: fin - i] * ganancia
    buf[i:fin, 1] += der[: fin - i] * ganancia


def reverb(x: np.ndarray, segundos: float = 1.8, mezcla: float = 0.22) -> np.ndarray:
    n = int(segundos * SR)
    t = np.arange(n) / SR
    salida = np.zeros_like(x)
    for c in range(2):
        ir = rng.standard_normal(n) * np.exp(-t / (segundos / 6.9))
        ir = filtro(ir, 5000)
        ir /= np.sqrt((ir**2).sum())
        salida[:, c] = fftconvolve(x[:, c], ir)[: len(x)]
    return x * (1 - mezcla) + salida * mezcla


# ---------- música ----------
# Acordes de dos compases (4 s): Am9 · Fmaj7 · Cadd9 · G6 · Am9 · Fmaj7 · G6 · Fmaj7 · Cadd9
ACORDES = [
    (0, ["A3", "C4", "E4", "B4"]),
    (4, ["F3", "A3", "C4", "E4"]),
    (8, ["C4", "E4", "G4", "D5"]),
    (12, ["G3", "B3", "D4", "E4"]),
    (16, ["A3", "C4", "E4", "B4"]),
    (20, ["F3", "A3", "C4", "E4"]),
    (24, ["G3", "B3", "D4", "E4"]),
    (28, ["F3", "A3", "C4", "E4"]),
    (32, ["C4", "E4", "G4", "D5"]),
]
BAJOS = {0: "A1", 4: "F1", 8: "C2", 12: "G1", 16: "A1", 20: "F1", 24: "G1", 28: "F1", 32: "C2"}


def acorde_en(t: float) -> tuple[float, list[str]]:
    actual = ACORDES[0]
    for a in ACORDES:
        if a[0] <= t:
            actual = a
    return actual[0], actual[1]


def pad(buf: np.ndarray) -> None:
    for inicio, notas in ACORDES:
        dur = 4.0 + 1.2 if inicio < 32 else DURACION - inicio
        t = np.arange(int(dur * SR)) / SR
        env = np.clip(t / 0.9, 0, 1) * np.clip((dur - t) / 1.2, 0, 1)
        izq = sum(sierra(nota(n) * 2 ** (-6 / 1200), t) for n in notas)
        der = sum(sierra(nota(n) * 2 ** (6 / 1200), t) for n in notas)
        # el filtro se abre a medida que avanza la pieza
        corte = 900 + 1100 * min(1.0, inicio / 20)
        if inicio >= 32:
            corte = 1400
        izq, der = filtro(izq * env, corte), filtro(der * env, corte)
        ganancia = 0.035
        if inicio == 0:
            ganancia *= np.clip(t / 3.0, 0, 1)  # entrada suave bajo la intro
        if inicio >= 32:
            ganancia = 0.035 * np.clip((DURACION - 0.2 - (inicio + t)) / (DURACION - 0.2 - 33.0), 0, 1)
        sumar_estereo(buf, inicio, izq * ganancia, der * ganancia)


def arpegio(buf: np.ndarray) -> None:
    patron = [0, 1, 2, 3, 2, 1, 2, 3]
    t16 = PULSO / 4
    tn = np.arange(int(0.35 * SR)) / SR
    paso = 0
    t = 3.0
    while t < 29.0:
        _, notas = acorde_en(t)
        f = nota(notas[patron[paso % len(patron)]]) * 2
        x = filtro(sierra(f, tn, 10) * np.exp(-tn / 0.09), 2600)
        nivel = 0.018 if t < 12 else 0.024
        if t > 27:
            nivel *= max(0.0, (29.0 - t) / 2.0)
        sumar(buf, t, x, pan=0.25 if paso % 2 else -0.25, ganancia=nivel)
        paso += 1
        t += t16


def bombo(buf: np.ndarray, golpes: list[float]) -> None:
    tn = np.arange(int(0.4 * SR)) / SR
    f = 45 + 80 * np.exp(-tn / 0.03)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tn / 0.22)
    for g in golpes:
        sumar(buf, g, x, ganancia=0.22)


def platillos(buf: np.ndarray, golpes: list[float]) -> None:
    tn = np.arange(int(0.08 * SR)) / SR
    for g in golpes:
        x = filtro(rng.standard_normal(len(tn)), 7000, "high") * np.exp(-tn / 0.025)
        sumar(buf, g, x, pan=0.15, ganancia=0.03)


def bajo(buf: np.ndarray, desde: float, hasta: float) -> None:
    tn = np.arange(int(0.24 * SR)) / SR
    t = desde
    while t < hasta:
        inicio, _ = acorde_en(t)
        f = nota(BAJOS[inicio])
        x = (np.sin(2 * np.pi * f * tn) + 0.35 * np.sin(4 * np.pi * f * tn)) * np.exp(-tn / 0.16)
        x = filtro(x * np.clip(tn / 0.005, 0, 1), 400)
        sumar(buf, t, x, ganancia=0.2)
        t += PULSO / 2


def compresion_lateral(buf: np.ndarray, golpes: list[float], cantidad: float = 0.35) -> None:
    g = np.ones(N)
    for k in golpes:
        i = int(k * SR)
        n = min(N - i, int(0.3 * SR))
        g[i : i + n] = np.minimum(g[i : i + n], 1 - cantidad * np.exp(-np.arange(n) / SR / 0.12))
    buf *= g[:, None]


# ---------- efectos (tiempos globales) ----------
def viaje(dur: float, f0: float = 420, f1: float = 840) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    f = f0 + (f1 - f0) * (t / dur) ** 2
    return 0.07 * np.sin(np.pi * t / dur) ** 2 * np.sin(2 * np.pi * np.cumsum(f) / SR)


def pulso(brillo: float = 880) -> np.ndarray:
    t = np.arange(int(0.9 * SR)) / SR
    x = (np.sin(2 * np.pi * brillo * t) + 0.5 * np.sin(3 * np.pi * brillo * t)) * np.exp(-t / 0.12)
    cuerpo = np.sin(2 * np.pi * 110 * t) * np.exp(-t / 0.18)
    return np.clip(t / 0.005, 0, 1) * (0.22 * x + 0.2 * cuerpo)


def tic(f: float) -> np.ndarray:
    t = np.arange(int(0.5 * SR)) / SR
    return 0.16 * np.clip(t / 0.003, 0, 1) * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.07)


def aire(dur: float) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    ruido = filtro(rng.standard_normal(len(t)), [600, 4000], "band")
    return 0.05 * ruido * (t / dur) ** 2


def golpe() -> np.ndarray:
    t = np.arange(int(0.8 * SR)) / SR
    f = 55 + 60 * np.exp(-t / 0.04)
    return 0.3 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3)


def destello(dur: float = 1.6) -> tuple[np.ndarray, np.ndarray]:
    t = np.arange(int(dur * SR)) / SR
    env = np.clip(t / 0.02, 0, 1) * np.exp(-t / (dur / 4))
    izq = sum(np.sin(2 * np.pi * f * 0.999 * t) for f in (1760, 2217, 2637, 3520)) * env * 0.025
    der = sum(np.sin(2 * np.pi * f * 1.001 * t) for f in (1760, 2217, 2637, 3520)) * env * 0.025
    return izq, der


def acorde_suave(dur: float = 1.7) -> tuple[np.ndarray, np.ndarray]:
    t = np.arange(int(dur * SR)) / SR
    env = np.clip(t / 0.03, 0, 1) * np.exp(-t / 0.55)
    izq = sum(np.sin(2 * np.pi * (f - 0.7) * t) for f in (523.25, 659.25, 783.99)) * env * 0.07
    der = sum(np.sin(2 * np.pi * (f + 0.7) * t) for f in (523.25, 659.25, 783.99)) * env * 0.07
    return izq, der


def barrido_ciudad(dur: float = 1.6) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    ruido = rng.standard_normal(len(t))
    x = filtro(ruido, 2500) * np.sin(np.pi * t / dur) ** 2
    return 0.06 * x


EVENTOS = []  # registro para documentar la sincronía


def efectos(buf: np.ndarray) -> None:
    def ev(t: float, nombre: str) -> None:
        EVENTOS.append((round(t, 3), nombre))

    # Escena 1 (3–7): «usuarios» 4,0 · filamento 4,0–5,0 · «nube» 5,0
    sumar(buf, 4.0, tic(1320), pan=0.15)
    ev(4.0, "usuarios se enciende")
    sumar(buf, 4.0, viaje(1.0, 500, 1000), pan=0.2)
    sumar(buf, 5.0, pulso(990), pan=0.1)
    ev(5.0, "filamento llega a nube")
    # Costura 7,0 (LEFT) · cifra 7,5
    sumar(buf, 6.66, aire(0.34), pan=-0.2)
    sumar(buf, 7.5, golpe())
    ev(7.5, "cifra 90 %")
    # Escena 3 (12–18): enlace 12,9–13,5 · destinos 14,0–15,0
    sumar(buf, 11.66, aire(0.34), pan=-0.2)
    sumar(buf, 12.9, viaje(0.6, 380, 760), pan=-0.3)
    sumar(buf, 13.5, pulso(880))
    ev(13.5, "nube Cloud Connect")
    for i, f in enumerate(("A5", "C6", "D6", "E6", "G6")):
        t = 14.0 + i * 0.25
        sumar(buf, t, tic(nota(f)), pan=0.3)
        ev(t, f"destino {i + 1}")
    # Escena 4 (18–27): llegadas 19,5 · 21,0 · 22,5 · 24,0 · acorde 25,5
    for i, pan in enumerate((0.0, 0.35, 0.0, -0.35)):
        t = 19.5 + i * 1.5
        sumar(buf, t - 0.45, viaje(0.45), pan=pan * 0.5)
        sumar(buf, t, pulso(), pan=pan)
        ev(t, f"beneficio {i + 1}")
    izq, der = acorde_suave()
    sumar_estereo(buf, 25.5, izq, der)
    ev(25.5, "anillo completo")
    # Costura 27,0 (UP) · ciudad 27,2–28,8
    sumar(buf, 26.66, aire(0.34))
    sumar(buf, 27.2, barrido_ciudad())
    izq, der = destello(1.8)
    sumar_estereo(buf, 27.6, izq, der)
    ev(27.2, "ciudad")
    # Out (33–36): destello del logo ~33,3
    izq, der = destello(2.4)
    sumar_estereo(buf, 33.3, izq, der, ganancia=1.4)
    ev(33.3, "destello del out")


def main() -> None:
    musica = np.zeros((N, 2))
    pad(musica)
    arpegio(musica)
    bombos = [18.0 + i * PULSO for i in range(int((27.0 - 18.0) / PULSO))]
    platillos(musica, [12.0 + PULSO / 2 + i * PULSO for i in range(int((27.0 - 12.0) / PULSO))])
    bajo(musica, 12.0, 27.0)
    compresion_lateral(musica, bombos)
    bombo(musica, bombos)
    musica = reverb(musica, 1.8, 0.25)

    fx = np.zeros((N, 2))
    efectos(fx)
    fx = reverb(fx, 1.2, 0.18)

    mezcla = musica + fx * 1.3
    # silencio final limpio
    cola = T > DURACION - 0.15
    mezcla[cola] *= np.linspace(1, 0, cola.sum())[:, None]
    mezcla *= 10 ** (-6 / 20) / np.max(np.abs(mezcla))

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "mezcla.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((mezcla * 32767).astype("<i2").tobytes())
        objetivo = "I=-16:TP=-1.5:LRA=11"
        medida = subprocess.run(
            ["ffmpeg", "-hide_banner", "-i", str(wav), "-af", f"loudnorm={objetivo}:print_format=json", "-f", "null", "-"],
            capture_output=True,
            text=True,
            check=True,
        ).stderr
        m = json.loads(medida[medida.rindex("{") :])
        segunda = (
            f"loudnorm={objetivo}:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
            f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}"
            f":offset={m['target_offset']}:linear=true"
        )
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-af", segunda, "-ar", str(SR), "-c:a", "flac", "-compression_level", "12", str(SALIDA)],
            check=True,
        )
    for t, nombre in EVENTOS:
        print(f"{t:6.2f} s  {nombre}")


if __name__ == "__main__":
    main()
