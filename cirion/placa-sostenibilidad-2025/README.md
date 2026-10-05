# Cirion · Placa animada «Informe de Sostenibilidad 2025»

Pieza 1:1 (1080×1080, 30 fps, 18 s) construida con HyperFrames: intro de marca (3 s) +
placa animada (15 s). Fuente única con textos en español, inglés y portugués; las cifras
son las mismas en los tres idiomas.

## Guion técnico

| Entrada–salida     | Texto en pantalla          | Acción visual                                                                            | Sonido                                                                                                        |
| ------------------ | -------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 0,0–3,0 s          | Logo Cirion (intro)        | `intro.mp4` de marca, recorte central 1:1; funde a negro en 2,8–3,0 s                    | Carga de luz, apertura estéreo de las ondas, impacto + campanas al aparecer el logo (0,6 s), destello (2,6 s) |
| 3,0–5,4 s          | —                          | La imagen (brote de red) se revela de izquierda a derecha, siguiendo el flujo de la onda | Barrido suave L→R, pad Re menor                                                                               |
| 3,15 s             | Logo arriba a la izquierda | Entrada ascendente suave                                                                 | —                                                                                                             |
| 3,3–4,9 s          | Titular                    | Cascada de palabras                                                                      | Pad                                                                                                           |
| 4,3–7,4 s          | Subtítulo magenta          | Entrada ascendente; avance lento sobre la imagen                                         | Subida de aire hacia las cifras                                                                               |
| 7,4–8,5 s          | —                          | La imagen sube y se oscurece; se trazan la línea de red y las tarjetas                   | Impacto grave, entra el pulso (120 BPM)                                                                       |
| 8,0 / 9,5 / 11,0 s | 11 % · 100 % · 20          | El pulso llega a cada nodo, que activa su tarjeta y el conteo                            | Ping cristalino por nodo, arpegio con eco estéreo                                                             |
| 13,0–14,0 s        | Texto institucional        | Cascada de palabras sobre degradado inferior                                             | Resolución a Fa (add9), impacto suave                                                                         |
| 15,0–16,8 s        | —                          | Segundo recorrido del pulso: confirma la red completa                                    | Arpegio y pulso se desvanecen                                                                                 |
| 16,8–18,0 s        | Placa completa             | Plano fijo con avance lento del fondo                                                    | Cola de reverb, fade out                                                                                      |

## Estructura

- `index.html` — composición raíz (variables, capas, intro, audio) y registro del timeline.
- `src/placa.css` — estilos de la placa.
- `src/placa.js` — textos ES/EN/PT y timeline; la placa se monta en la raíz a los 3 s.

## Comandos

```bash
CLI="node ../../packages/cli/bin/hyperframes.mjs"   # tras `bun install && bun run build` en la raíz
$CLI lint .
$CLI check .
$CLI preview
# Render por idioma (variable `lang`: es | en | pt)
$CLI render . -q high --fps 30 --variables '{"lang":"es"}' -o renders/cirion_placa-sostenibilidad-2025_ES_1x1_v02.mp4
$CLI render . -q high --fps 30 --variables '{"lang":"en"}' -o renders/cirion_placa-sostenibilidad-2025_EN_1x1_v02.mp4
$CLI render . -q high --fps 30 --variables '{"lang":"pt"}' -o renders/cirion_placa-sostenibilidad-2025_PT_1x1_v02.mp4
```

## Audio

`assets/audio/placa-bed.m4a` es una pieza original sintetizada por `scripts/synth-audio.mjs`
(sin muestras ni pistas de terceros). Para regenerarla:

```bash
node scripts/synth-audio.mjs        # → assets/audio/placa-bed.raw.wav (18 s: sting de intro + placa)
bash scripts/normalize-audio.sh     # dos pasadas a −16 LUFS / −1,5 dBTP y AAC 192 kbps
```

Medido en el MP4 final (v02): −16,0 LUFS integrados, pico −1,4 dB. La pista de audio de `intro.mp4` es silencio; el sting de la intro es parte de esta banda.

## Activos

- `assets/img/brote-red.jpg` — imagen entregada por el cliente (1254×1254).
- `assets/video/intro-1x1.mp4` — `intro.mp4` de marca (Drive, 1920×1080, 25 fps) con recorte central 1080×1080, sin audio.
- `assets/img/cirion-logo-duo-negativo.svg` — `Cirion-logo-duo-negro.svg` oficial (Drive) con las letras en blanco para fondo oscuro, igual que en la intro; el trazo magenta #EF2AC1 y la geometría no cambian.
- `assets/fonts/` — Maven Pro 400/500/700 (OFL, vía @fontsource/maven-pro).
- `vendor/gsap.min.js` — GSAP 3.14.2 local (el render no depende de CDN).

## Pendientes

- Confirmar con marca que la versión negativa del logo duo (letras blancas) es la aprobada para fondo oscuro, o reemplazar por el archivo negativo oficial si existe.
- Fuente y fecha verificable de las cifras (11 %, 100 % en data centers de 4 países, 20 data centers): se tomaron tal cual de la placa entregada.
- Revisión de las traducciones EN/PT por el equipo de marca.
