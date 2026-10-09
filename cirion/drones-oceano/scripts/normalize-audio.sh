#!/usr/bin/env bash
# Lleva la banda sonora a −16 LUFS integrados con ganancia LINEAL (conserva la dinámica
# diseñada: textura → ascenso → picada → plano amortiguado → pulso) y un limitador
# de picos que deja el pico verdadero por debajo de −1 dBTP. Codifica en AAC 192 kbps.
# (loudnorm en modo dinámico aplana la curva cuando no puede aplicar ganancia lineal.)
# Un pasa-altos a 28 Hz quita energía infrasónica que el AAC convertía en sobrepicos.
# Uso: bash scripts/normalize-audio.sh   (después de node scripts/synth-audio.mjs)
set -euo pipefail
cd "$(dirname "$0")/.."
IN=assets/audio/banda-sonora.raw.wav
OUT=assets/audio/banda-sonora.m4a
TARGET=-16
LIMIT=0.668 # −3,5 dBFS de pico de muestra en el limitador; deja margen de true peak tras el AAC

integrated() { ffmpeg -hide_banner -nostats -i "$1" -af ebur128 -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | grep -oE '[-0-9.]+' | head -1; }

GAIN=$(echo "$TARGET - $(integrated "$IN")" | bc -l)
for _ in 1 2; do
  ffmpeg -y -loglevel error -i "$IN" \
    -af "highpass=f=28,volume=${GAIN}dB,alimiter=limit=${LIMIT}:attack=2:release=60:level=disabled,aresample=48000" \
    -c:a aac -b:a 192k "$OUT"
  # el limitador resta algo de sonoridad: corrige la ganancia una vez
  GAIN=$(echo "$GAIN + ($TARGET - $(integrated "$OUT"))" | bc -l)
done
echo "Medición de $OUT:"
ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):"
