# Cirion · Drones sobre el océano

Pieza de 12 s, 1920 × 1080, 30 fps, sin textos ni locución. Cientos de drones (695) forman
el logo de Cirion sobre un océano nocturno, convergen en un haz que cae en picada,
atraviesa la superficie y llega al lecho marino. Una sola toma aparente.

Construida con el motor del repositorio (HyperFrames) y una escena Three.js controlada
por tiempo: cada cuadro se calcula a partir de `t` (evento `hf-seek`), con semilla fija y
sin reloj del navegador. La banda sonora es síntesis procedural propia.

## Guion técnico

| Entrada–salida | Acción visual                                                                                                                                                                       | Sonido                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 0,0–0,6 s      | Fundido desde negro. Plano abierto: horizonte en el tercio inferior                                                                                                                 | Océano nocturno suave (oleaje lento, espuma tenue), estéreo amplio                    |
| 0,0–0,9 s      | Los drones se encienden escalonados en una franja baja sobre el horizonte                                                                                                           | —                                                                                     |
| 0,3–2,85 s     | Vuelo coordinado, en ola del centro hacia afuera, hasta su lugar en el logo; llegada con desaceleración quíntica (velocidad y aceleración nulas)                                    | Textura tonal (Re sus2) que crece con la formación                                    |
| 3,0–5,0 s      | Logo completo y estable; acercamiento de cámara muy sutil; reflejo tenue y fragmentado en el agua                                                                                   | Textura sostenida, parciales que respiran                                             |
| 5,0–6,15 s     | Convergencia: los puntos dejan su lugar (los más alejados primero) y giran en espiral hacia el núcleo                                                                               | Ascenso de energía: ruido filtrado ascendente, tono con trémolo que acelera           |
| 5,75–6,5 s     | El núcleo crece con halo azul; dos anillos (azul y magenta) se contraen hacia él; se comprime y gana brillo                                                                         | El ascenso culmina                                                                    |
| 6,5–7,6 s      | Picada: el haz (punta blanca, estela azul, filamento magenta) acelera en diagonal hacia el agua; la cámara lo sigue con leve retraso                                                | Desplazamiento descendente sincronizado, paneo hacia la derecha                       |
| 7,6 s          | Toca el agua: iluminación local breve, onda circular, pocas burbujas                                                                                                                | Golpe sordo grave (sin salpicadura) y burbujas                                        |
| 7,86 s         | La cámara cruza la superficie (sin corte ni flash): el agua se vuelve transmisiva al acercarse y empalma con el tono submarino                                                      | Toda la capa de superficie se amortigua (paso bajo 16 kHz → 380 Hz)                   |
| 7,9–10,55 s    | Descenso: el haz baja hacia el lecho; nieve marina, rayos tenues desde la superficie que se alejan, dispersión alrededor de la punta; el entorno pasa de azul profundo a casi negro | Presión grave, dron oscuro con batido lento, desplazamiento amortiguado que desciende |
| 10,55–11,9 s   | Llegada: el haz ilumina el relieve; nace un pulso azul que se expande sobre el suelo y se disipa                                                                                    | Pulso grave contenido con cola de reverb                                              |
| 11,35–12,0 s   | Cámara quieta; pausa sobre el punto luminoso                                                                                                                                        | Cola suave hasta el silencio                                                          |

## Estructura

- `index.html` — composición HyperFrames (960 × 540 CSS, 12 s, 30 fps): canvas, fundido, audio.
- `src/config.js` — **todo lo ajustable**: duración y tiempos de cada tramo, colores, cantidad
  y tamaño de partículas, brillo, agua, niebla, recorrido del haz y claves de cámara.
- `src/scene.js` — escena Three.js: drones instanciados, núcleo/punta, estela, cielo, agua con
  reflejo planar, lecho marino, nieve, burbujas, rayos. Render por tiempo.
- `src/logo-sampler.js` — distribuye los drones sobre la geometría oficial (contorno + relleno).
- `src/logo-data.js` — **generado** desde el SVG oficial por `scripts/extract-logo.mjs`.
- `src/util.js` — PRNG con semilla, ruido, easing y spline de cámara (también lo usa el audio).
- `scripts/synth-audio.mjs`, `scripts/normalize-audio.sh` — banda sonora.
- `vendor/` — Three.js 0.181.2 local (MIT); el render no depende de CDN.

## Comandos verificados

Desde `cirion/drones-oceano/`, después de `bun install && bun run build` en la raíz del repo:

```bash
HF="node ../../packages/cli/bin/hyperframes.mjs"

$HF lint .      # 0 errores, 0 avisos
$HF check .     # aprobado (4 avisos de rendimiento de SwiftShader, sin efecto en la imagen)
$HF preview     # Studio en el navegador

# Previsualización 960 × 540 (H.264 + AAC) — ~50 s en este contenedor
$HF render . --fps 30 -o renders/cirion_drones-oceano_preview_960x540_v01.mp4

# Master 1920 × 1080 (H.264 High + AAC LC 48 kHz) — misma fuente, Chrome a DPR 2
$HF render . --resolution landscape --fps 30 -q delivery \
  -o renders/cirion_drones-oceano_master_1920x1080_v01.mp4
```

El master se probó con un render de 1 s de una copia temporal (`--resolution landscape`):
salió 1920 × 1080, H.264 High, AAC LC 48 kHz estéreo, con el WebGL a resolución nativa.
A ese ritmo (~13 s por segundo de video con GPU por software), el master completo
tarda unos 3 minutos. **El master de 12 s todavía no se renderizó**: queda pendiente de
la revisión del preview.

Fotogramas sueltos para revisar: `$HF snapshot . --at 2.9,4,6.3,7.8,7.9,10.7`.

## Logo

- `assets/logo/Cirion-logo-duo-negro.svg` — archivo oficial de Drive («Cirion-logo-duo-negro.svg»,
  3271 bytes, sha256 `2febbdf6…bc203`), sin modificar.
- Los drones se ubican muestreando sus trazados con `Path2D` (regla nonzero, la misma del
  SVG) y `getPointAtLength` para el contorno: no hay tipografía ni redibujo.
- Color: trazo magenta `#EF2AC1` tal como viene en el archivo; letras en blanco
  (versión negativa del duo para fondo nocturno, criterio ya usado en la placa de
  sostenibilidad).

## Audio

`assets/audio/banda-sonora.m4a` es síntesis original: no usa muestras ni pistas de terceros.

```bash
node scripts/synth-audio.mjs       # → assets/audio/banda-sonora.raw.wav (lee los tiempos de src/config.js)
bash scripts/normalize-audio.sh    # ganancia lineal a −16 LUFS + limitador → AAC 192 kbps
```

Medido en el preview MP4: **−16,2 LUFS integrados, pico verdadero −1,4 dBTP**. Curva de
sonoridad momentánea: apertura ≈ −22, formación ≈ −20, ascenso ≈ −18, picada e ingreso −11 a −14,
plano submarino ≈ −17, pulso ≈ −12 y cola ≈ −20 LUFS. Correlación L/R media 0,48 (compatible
con mono). Las mediciones son instrumentales; **la mezcla no se escuchó** en este entorno.

## Pendientes

- Revisar el preview, en especial la legibilidad del logo (3–5 s), el cruce de la superficie
  (7,6–8,0 s) y el descenso hasta el fondo; luego exportar el master con el comando de arriba.
- Confirmar con marca la versión negativa del logo duo (letras blancas) para fondo oscuro, o
  entregar el archivo negativo oficial si existe.
- Escuchar la mezcla con auriculares y altavoces antes de aprobar.
