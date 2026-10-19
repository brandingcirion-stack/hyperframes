# Cirion · Drones sobre la ciudad

Pieza de 12 s, 1920 × 1080, 30 fps, sin textos ni locución. Un show de 1601 drones forma
el logo de Cirion **en 3D** (cara frontal + volumen extruido) sobre una ciudad costera
tecnológica de noche. Los drones convergen en un núcleo del que nace un **cable de red
submarino real** (fibra óptica con armadura de acero): cae en picada a la bahía, atraviesa
la superficie y queda tendido sobre el lecho marino. Una sola toma aparente.

Construida con el motor del repositorio (HyperFrames) y una escena Three.js controlada por
tiempo: cada cuadro se calcula a partir de `t` (evento `hf-seek`), con semilla fija y sin
reloj del navegador. Render HDR con bloom, tonemapping fílmico ACES, viñeta y grano
determinista. La banda sonora es síntesis procedural propia.

## Guion técnico

| Entrada–salida | Acción visual                                                                                                                                                                                 | Sonido                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 0,0–0,6 s      | Fundido desde negro. Bahía nocturna frente a un skyline (≈2500 torres procedurales, fachadas de medios LED, coronas, tránsito, puente); reflejos en el agua                                   | Ciudad lejana (rumor de tránsito) y agua de la bahía                   |
| 0,0–0,9 s      | Los drones se encienden en una «alfombra» horizontal sobre la costa                                                                                                                           | —                                                                      |
| 0,3–2,85 s     | Vuelo coordinado, del centro hacia afuera, hasta su lugar en el logo 3D; llegada con desaceleración quíntica. La cámara avanza en arco y la perspectiva revela el volumen                     | Textura tonal (Re sus2) que crece con la formación                     |
| 3,0–5,0 s      | Logo completo, estable y legible; la cara frontal brilla más que las capas de profundidad. Cámara en arco lento; el logo se refleja en el agua                                                | Textura sostenida                                                      |
| 5,0–6,15 s     | Convergencia: los puntos dejan su lugar (los más alejados primero) y giran en espiral hacia el núcleo                                                                                         | Ascenso de energía                                                     |
| 5,75–6,5 s     | El núcleo crece con halo azul; dos anillos (azul y magenta) se contraen; se comprime                                                                                                          | El ascenso culmina                                                     |
| 6,5–7,6 s      | Picada: del núcleo nace el cable, energizado en azul, que cae en diagonal a la bahía; el tramo aéreo se disuelve en luz detrás del extremo                                                    | Desplazamiento descendente sincronizado                                |
| 7,6 s          | Toca el agua: iluminación local, onda circular, pocas burbujas alrededor del cable                                                                                                            | Golpe sordo grave y burbujas                                           |
| 7,86 s         | La cámara cruza la superficie sin corte ni flash                                                                                                                                              | Toda la capa de superficie se amortigua                                |
| 7,9–10,55 s    | Descenso: el cable se ve como cable real (chaqueta, alambres de armadura en hélice, hilo marcador magenta, pulsos de datos azules); nieve marina, rayos tenues; de azul profundo a casi negro | Presión grave, zumbido eléctrico del cable, desplazamiento amortiguado |
| 10,55–11,9 s   | El cable se tiende sobre una zona de arena; su extremo de fibras encendidas ilumina el lecho y nace un pulso azul que se expande y se disipa                                                  | Pulso grave contenido con cola de reverb                               |
| 11,35–12,0 s   | Cámara quieta sobre el extremo luminoso                                                                                                                                                       | Cola suave hasta el silencio                                           |

## Estructura

- `index.html` — composición HyperFrames (960 × 540 CSS, 12 s, 30 fps): canvas y audio.
- `src/config.js` — **todo lo ajustable**: tiempos, colores, logo 3D (tamaño, extrusión, giro),
  drones, núcleo, cable (diámetro, pulsos, armadura), ciudad, bruma, agua, cámara y posproceso.
- `src/scene.js` — orquesta la escena: cámara, drones, núcleo, cielo, agua con reflejo planar
  HDR, lecho, nieve, burbujas, rayos y el render por tiempo.
- `src/city.js` — ciudad procedural instanciada (torres, ventanas con antialias por distancia,
  coronas y aristas LED, fachadas de medios, costanera, tránsito, puente, balizas).
- `src/cable.js` — cable submarino reconstruido cada cuadro (marcos de transporte paralelo) y
  sección del extremo con las fibras encendidas.
- `src/post.js` — HDR (MSAA ×4) → bloom en 4 niveles → ACES, viñeta y grano por cuadro.
- `src/glsl.js` — bruma urbana, niebla submarina y ruido compartidos por los shaders.
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
$HF check .     # aprobado (avisos de rendimiento de SwiftShader, sin efecto en la imagen)
$HF preview     # Studio en el navegador

# Previsualización 960 × 540 (H.264 + AAC) — ~5,5 min en este contenedor (GPU por software)
$HF render . --fps 30 -o renders/cirion_drones-ciudad_preview_960x540_v02.mp4

# Master 1920 × 1080 (H.264 High + AAC LC 48 kHz) — misma fuente, Chrome a DPR 2
$HF render . --resolution landscape --fps 30 -q delivery \
  -o renders/cirion_drones-ciudad_master_1920x1080_v02.mp4
```

El master se probó con un render corto (0,5 s) de una copia temporal: salió 1920 × 1080,
H.264 High, AAC LC 48 kHz estéreo, con el WebGL a resolución nativa. Al ritmo medido
(≈2 s por cuadro con GPU por software) el master completo tarda unos 12–13 minutos; con GPU
de hardware es mucho más rápido. **El master de 12 s todavía no se renderizó**: queda
pendiente de la revisión del preview.

Fotogramas sueltos para revisar: `$HF snapshot . --at 3,4.5,6.3,7.7,7.92,9.2,11.6`.

## Logo

- `assets/logo/Cirion-logo-duo-negro.svg` — archivo oficial de Drive («Cirion-logo-duo-negro.svg»,
  3271 bytes, sha256 `2febbdf6…bc203`), sin modificar.
- Los drones se ubican muestreando sus trazados con `Path2D` (regla nonzero, la misma del
  SVG) y `getPointAtLength` para el contorno: no hay tipografía ni redibujo. El volumen
  repite el contorno en 3 capas de profundidad (40 m de extrusión) detrás de la cara frontal.
- Color: trazo magenta `#EF2AC1` tal como viene en el archivo; letras en blanco
  (versión negativa del duo para fondo nocturno).

## Audio

`assets/audio/banda-sonora.m4a` es síntesis original: no usa muestras ni pistas de terceros.

```bash
node scripts/synth-audio.mjs       # → assets/audio/banda-sonora.raw.wav (lee los tiempos de src/config.js)
bash scripts/normalize-audio.sh    # ganancia lineal a −16 LUFS + limitador → AAC 192 kbps
```

Medido en el preview v02: **−16,2 LUFS integrados, pico verdadero −2,9 dBTP**. Curva de
sonoridad momentánea: apertura ≈ −22, formación ≈ −20, ascenso ≈ −18, picada e ingreso −11 a −14,
plano submarino ≈ −17, pulso ≈ −12 y cola ≈ −20 LUFS. Las mediciones son instrumentales;
**la mezcla no se escuchó** en este entorno.

## Pendientes

- Revisar el preview v02 y luego exportar el master con el comando de arriba.
- La ciudad es procedural y genérica (no reproduce ninguna ciudad real ni sus íconos).
  Las balizas rojas de las torres y las luces traseras de los autos son los únicos rojos de la
  pieza, por realismo; se pueden quitar en `src/city.js`.
- Confirmar con marca la versión negativa del logo duo (letras blancas) para fondo oscuro.
- Escuchar la mezcla con auriculares y altavoces antes de aprobar.
