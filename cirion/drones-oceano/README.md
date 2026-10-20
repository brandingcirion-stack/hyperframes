# Cirion · Conexión entre ciudades

Pieza de **24 s**, 1920 × 1080, 30 fps, sin textos ni locución. Sobre una bahía urbana de
noche (referencia: skyline de bahía con coronas doradas y reflejos largos en el agua), 1601
drones forman el logo de Cirion en 3D, **desde el centro hacia afuera**, por encima de los
edificios. La cámara hace un paneo al logo; un **cable de red submarino** sale de una torre
de la ciudad, sube hasta el logo y, al tocarlo, el logo se transforma en energía que baja
por el cable hasta el fondo del mar. Allí el cable **se empalma con un troncal existente**
(sin extremos cortados), el pulso de datos recorre el mar y llega a **otra ciudad
tecnológica**, que se enciende al conectarse. Una sola toma aparente.

Construida con el motor del repositorio (HyperFrames) y una escena Three.js controlada por
tiempo: cada cuadro se calcula a partir de `t` (evento `hf-seek`), con semilla fija y sin
reloj del navegador. Render HDR con bloom, tonemapping fílmico ACES, viñeta y grano
determinista. Banda sonora de síntesis procedural propia.

> El brief original pedía 12 s. La nueva narrativa (paneo, cable desde la ciudad, empalme,
> recorrido por el mar y segunda ciudad) no entra en 12 s, por eso la pieza dura 24 s. La
> duración y cada tramo se ajustan en `src/config.js` (`duracion` y `tiempos`).

## Guion técnico

| Entrada–salida | Acción visual                                                                                                                                          | Sonido                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 0,0–0,6 s      | Fundido desde negro. Bahía nocturna frente a la ciudad A: torres con coronas doradas, muros cortina, luces violetas en la costanera, puente y reflejos | Ciudad lejana y agua de la bahía                                     |
| 0,3–3,2 s      | El logo 3D se abre desde su centro: cada dron se enciende al separarse del centro y llega a su lugar con desaceleración suave                          | Textura tonal (Re sus2) que crece con la formación                   |
| 3,2–5,6 s      | Paneo: la cámara sube y se acerca al logo; la perspectiva revela su volumen sobre la ciudad                                                            | La textura se abre                                                   |
| 5,4–7,4 s      | El cable sale de la azotea de la torre de datos y sube energizado hasta el centro del logo                                                             | Barrido ascendente y zumbido eléctrico que sube de tono              |
| 7,4–8,4 s      | Contacto: el logo se transforma; los drones fluyen en espiral hacia el punto de contacto; anillos de energía; el núcleo se comprime                    | Golpe contenido, campanas y ascenso de energía                       |
| 8,4–9,6 s      | Picada: el cable cae en diagonal hacia la bahía frente a la costanera; la cámara gira y lo sigue                                                       | Desplazamiento descendente paneado a la derecha                      |
| 9,6–9,9 s      | Toca el agua: luz local, onda y burbujas; la cámara cruza la superficie sin corte                                                                      | Golpe sordo y burbujas; todo se amortigua                            |
| 9,9–12,4 s     | Descenso hasta el lecho; el cable llega a la unidad de derivación del troncal y se empalma                                                             | Presión grave, zumbido del cable, cierre metálico y pulso            |
| 12,6–19,4 s    | Recorrido por el mar: la cámara sigue el pulso de datos a lo largo del troncal, sobre el relieve del lecho                                             | Agua que corre y pulsos de datos cada vez más seguidos               |
| 19,4–20,8 s    | La cámara emerge frente a la ciudad B (dormida); el pulso llega a la estación de amarre de la costa                                                    | El sonido se vuelve a abrir; ambiente de la ciudad B                 |
| 20,8–23,2 s    | Conexión: una ola de luz azul recorre la ciudad B desde la estación; se encienden ventanas, coronas, aristas LED, fachadas de medios y la costanera    | Golpe grave, acorde de resolución y barrido estéreo que sigue la ola |
| 23,2–24,0 s    | Plano final sobre la ciudad conectada                                                                                                                  | Cola suave                                                           |

## Estructura

- `index.html` — composición HyperFrames (960 × 540 CSS, 24 s, 30 fps): canvas y audio.
- `src/config.js` — **todo lo ajustable**: tiempos, colores, logo 3D, drones, cables (origen,
  picada, troncal y velocidad del pulso), ciudades A y B, lecho, agua, cámara y posproceso.
- `src/scene.js` — orquesta la escena: cámara con seguimiento del cable y del pulso, drones,
  núcleo, empalme, cielo, agua con reflejo planar HDR, lecho que acompaña a la cámara, nieve
  marina, burbujas, rayos y el render por tiempo.
- `src/city.js` — ciudad procedural instanciada (A y B con la misma función): fachadas con
  coronas iluminadas, muros cortina, residenciales, patrimonio dorado, techos inclinados,
  agujas, LED, fachadas de medios, costanera, tránsito, puente y la ola de encendido.
- `src/cable.js` — cable nuevo (reconstruido cada cuadro) y troncal del lecho, con armadura
  helicoidal, hilo marcador magenta, pulsos y flujo de datos.
- `src/post.js` — HDR (MSAA ×4) → bloom en 4 niveles → ACES, viñeta y grano por cuadro.
- `src/glsl.js`, `src/util.js`, `src/logo-sampler.js`, `src/logo-data.js` (generado).
- `scripts/synth-audio.mjs`, `scripts/normalize-audio.sh` — banda sonora.
- `vendor/` — Three.js 0.181.2 local (MIT); el render no depende de CDN.

## Comandos verificados

Desde `cirion/drones-oceano/`, después de `bun install && bun run build` en la raíz del repo:

```bash
HF="node ../../packages/cli/bin/hyperframes.mjs"

$HF lint .      # 0 errores, 0 avisos
$HF check .     # aprobado (avisos de rendimiento de SwiftShader, sin efecto en la imagen)
$HF preview     # Studio en el navegador

# Previsualización 960 × 540 (H.264 + AAC)
$HF render . --fps 30 -o renders/cirion_conexion-ciudades_preview_960x540_v03.mp4

# Master 1920 × 1080 (H.264 High + AAC LC 48 kHz) — misma fuente, Chrome a DPR 2
$HF render . --resolution landscape --fps 30 -q delivery \
  -o renders/cirion_conexion-ciudades_master_1920x1080_v03.mp4
```

Fotogramas sueltos para revisar: `$HF snapshot . --at 2.4,4.6,6.6,7.8,9.6,12.9,16,21.5`.

## Logo

- `assets/logo/Cirion-logo-duo-negro.svg` — archivo oficial de Drive («Cirion-logo-duo-negro.svg»,
  3271 bytes, sha256 `2febbdf6…bc203`), sin modificar.
- Los drones se ubican muestreando sus trazados con `Path2D` (regla nonzero, la misma del
  SVG) y `getPointAtLength` para el contorno: no hay tipografía ni redibujo. El volumen repite
  el contorno en 3 capas de profundidad (40 m de extrusión) detrás de la cara frontal.
- Color: trazo magenta `#EF2AC1` tal como viene en el archivo; letras en blanco (versión
  negativa del duo para fondo nocturno).

## Audio

`assets/audio/banda-sonora.m4a` es síntesis original: no usa muestras ni pistas de terceros.

```bash
node scripts/synth-audio.mjs       # → assets/audio/banda-sonora.raw.wav (lee los tiempos de src/config.js)
bash scripts/normalize-audio.sh    # ganancia lineal a −16 LUFS + limitador → AAC 160 kbps
```

Medido en el archivo de audio: −16,1 LUFS integrados, pico verdadero −3,1 dBTP. Las mediciones
son instrumentales; **la mezcla no se escuchó** en este entorno.

## Pendientes

- Revisar el preview v03 y luego exportar el master con el comando de arriba.
- Confirmar la duración de 24 s (el brief original era de 12 s).
- Las ciudades son procedurales y genéricas (no reproducen ninguna ciudad real ni sus íconos).
  Las balizas rojas de las torres y las luces traseras de los autos son los únicos rojos.
- Confirmar con marca la versión negativa del logo duo (letras blancas) para fondo oscuro.
- Escuchar la mezcla con auriculares y altavoces antes de aprobar.
