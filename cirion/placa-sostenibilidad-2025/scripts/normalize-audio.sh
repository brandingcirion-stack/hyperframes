#!/usr/bin/env bash
# Normaliza la banda sonora en dos pasadas (−16 LUFS, −1,5 dBTP) y la codifica en AAC.
# Uso: bash scripts/normalize-audio.sh   (después de node scripts/synth-audio.mjs)
set -euo pipefail
cd "$(dirname "$0")/.."
IN=assets/audio/placa-bed.raw.wav
OUT=assets/audio/placa-bed.m4a
J=$(ffmpeg -hide_banner -i "$IN" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p')
val() { echo "$J" | grep "\"$1\"" | grep -oE '[-0-9.]+'; }
ffmpeg -y -loglevel error -i "$IN" \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(val input_i):measured_TP=$(val input_tp):measured_LRA=$(val input_lra):measured_thresh=$(val input_thresh):offset=$(val target_offset):linear=true,aresample=48000" \
  -c:a aac -b:a 192k "$OUT"
ffmpeg -hide_banner -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):"
