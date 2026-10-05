# Cirion · Placa animada «Informe de Sostenibilidad 2025»

Placa 1:1 (1080×1080, 30 fps, 15 s) construida con HyperFrames. Fuente única con
textos en español, inglés y portugués; las cifras son las mismas en los tres idiomas.

## Guion técnico

| Entrada–salida    | Texto en pantalla   | Acción visual                                                                            | Sonido                                            |
| ----------------- | ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 0,0–2,4 s         | —                   | La imagen (brote de red) se revela de izquierda a derecha, siguiendo el flujo de la onda | Barrido suave L→R, pad Re menor                   |
| 0,3–1,9 s         | Titular             | Cascada de palabras                                                                      | Pad                                               |
| 1,3–4,4 s         | Subtítulo magenta   | Entrada ascendente; avance lento sobre la imagen                                         | Subida de aire hacia las cifras                   |
| 4,4–5,5 s         | —                   | La imagen sube y se oscurece; se trazan la línea de red y las tarjetas                   | Impacto grave, entra el pulso (120 BPM)           |
| 5,0 / 6,5 / 8,0 s | 11 % · 100 % · 20   | El pulso llega a cada nodo, que activa su tarjeta y el conteo                            | Ping cristalino por nodo, arpegio con eco estéreo |
| 10,0–11,0 s       | Texto institucional | Cascada de palabras sobre degradado inferior                                             | Resolución a Fa (add9), impacto suave             |
| 12,0–13,8 s       | —                   | Segundo recorrido del pulso: confirma la red completa                                    | Arpegio y pulso se desvanecen                     |
| 13,8–15,0 s       | Placa completa      | Plano fijo con avance lento del fondo                                                    | Cola de reverb, fade out                          |

## Comandos

```bash
CLI="node ../../packages/cli/bin/hyperframes.mjs"   # tras `bun install && bun run build` en la raíz
$CLI lint .
$CLI check .
$CLI preview
# Render por idioma (variable `lang`: es | en | pt)
$CLI render . -q high --fps 30 --variables '{"lang":"es"}' -o renders/cirion_placa-sostenibilidad-2025_ES_1x1_v01.mp4
$CLI render . -q high --fps 30 --variables '{"lang":"en"}' -o renders/cirion_placa-sostenibilidad-2025_EN_1x1_v01.mp4
$CLI render . -q high --fps 30 --variables '{"lang":"pt"}' -o renders/cirion_placa-sostenibilidad-2025_PT_1x1_v01.mp4
```

## Audio

`assets/audio/placa-bed.m4a` es una pieza original sintetizada por `scripts/synth-audio.mjs`
(sin muestras ni pistas de terceros). Para regenerarla:

```bash
node scripts/synth-audio.mjs                      # → assets/audio/placa-bed.raw.wav
# normalización en dos pasadas a −16 LUFS / −1,5 dBTP (loudnorm, linear=true) y AAC 256 kbps
```

Medido en el MP4 final: −16,0 LUFS integrados, true peak −1,6 dBTP; suma mono sin cancelaciones.

## Activos

- `assets/img/brote-red.jpg` — imagen entregada por el cliente (1254×1254).
- `assets/fonts/` — Maven Pro 400/500/700 (OFL, vía @fontsource/maven-pro).
- `vendor/gsap.min.js` — GSAP 3.14.2 local (el render no depende de CDN).

## Pendientes

- Logo oficial de Cirion (no incluido; no se recrea).
- Fuente y fecha verificable de las cifras (11 %, 100 % en DC de 4 países, 20 data centers): se tomaron tal cual de la placa entregada.
- Revisión de las traducciones EN/PT por el equipo de marca.
