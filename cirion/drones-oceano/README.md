# Cirion · Drones sobre la ciudad

Pieza de **12 s**, 1920 × 1080, 30 fps, horizontal, sin textos ni locución, una sola toma
aparente. Sobre una bahía urbana de noche, 1601 drones forman el logo de Cirion en 3D,
desde el centro hacia afuera y por encima de los edificios. Los drones dejan el logo en
orden y forman una corriente que se concentra en un haz con cabeza luminosa; el haz baja en
curva hasta el agua, la cruza y, ya bajo la superficie, guía la aparición del cable
submarino, que se apoya en el lecho. Un pulso de datos recorre el cable al final.

Construida con el motor del repositorio (HyperFrames) y una escena Three.js controlada por
tiempo: cada cuadro se calcula a partir de `t` (evento `hf-seek`), con semilla fija y sin
reloj del navegador. Render HDR con bloom, tonemapping fílmico ACES, viñeta y grano
determinista. Banda sonora de síntesis procedural propia.

## Técnica elegida

**Ciudad 3D procedural, no fondo fotográfico.** La narrativa exige que la cámara se desplace
casi 300 m, baje al agua y la atraviese: eso no se puede simular sobre una foto plana sin
inventar paralaje. Además, la foto de referencia (`image.png`) mide **433 × 292 px**, ~4,4 veces
menos que el ancho del master; ampliarla no agrega detalle. La foto se usó solo como guía de
aspecto (fachadas oscuras con oficinas encendidas, remates cálidos escasos, reflejos largos y
fragmentados).

El realismo de la ciudad sale del sombreado, no del brillo:

- Fachadas con _interior mapping_ (techo con luminarias, piso, tabiques y mobiliario detrás del
  vidrio), siete tipologías (muro cortina, aletas, hormigón con ventanas punzonadas,
  residencial con losas de balcón, podio comercial, servicio, patrimonio).
- Ocupación nocturna realista: 18–50 % de los pisos encendidos, por inquilino (bloques de
  1–3 pisos), y dentro de cada piso grupos de oficinas encendidas (~70 % de sus vanos).
  Temperaturas de color 2700–5000 K con intensidad moderada; nada parpadea.
- Vidrio con Fresnel y reflejo del cielo con resplandor urbano; cada paño refleja algo
  distinto (planitud imperfecta). Los promedios a distancia conservan la energía del
  detalle: de lejos no aparecen bandas más claras que de cerca, y no hay centelleo.
- Remates con lavado cálido o linterna solo en pocas torres; tope de altura individual
  detrás del logo (sin línea de techos plana).
- **Sin aristas cian ni magenta en los edificios**: los colores de marca quedan para el
  logo, los drones, el haz y la energía del cable.
- Agua con reflejo planar HDR alargado en vertical y fragmentado por el rizado; altas luces
  comprimidas (sin blancos saturados ni espejo perfecto).

**Una trayectoria maestra compartida** (`src/path.js`) gobierna la boca de la corriente, la
cabeza, la estela, el seguimiento de cámara y el revelado del cable: tres Bézier cúbicas con
tangente continua (cielo, descenso submarino, tendido en el lecho), remuestreadas a paso
uniforme de longitud de arco (0,2 m) y con marcos por transporte paralelo precalculados.

- Cabeza: velocidad integrada, sin escalones. En el cielo acelera con ley de potencia
  (v ∝ t^1,25) desde 4 m/s hasta 134 m/s al tocar el agua; el agua la frena en seco
  (τ = 0,06 s) hasta ~15 m/s; tras apoyarse sigue tendiendo a 9 m/s y se aleja hacia la
  penumbra (no hay extremo de cable cortado a la vista).
- Drones: funciones puras de `t`. Cada uno sale de su lugar en orden (derecha → izquierda),
  viaja por una curva Hermite hasta la boca con la tangente y la velocidad de la trayectoria,
  sigue la trayectoria y se funde en la cabeza (su luz pasa a la cabeza: haz angosto, sin
  masa ni explosiones).
- Estela: es el recorrido reciente de la cabeza (`s(t) − s(t − 0,32 s)`); al frenar en el agua
  su cola sigue entrando por la misma trayectoria, no se acorta de golpe.
- Cable: anillos precalculados a lo largo de la trayectoria; en cada cuadro solo cambia
  cuántos se dibujan y el último se coloca en el frente de revelado, 0,9 m detrás de la
  cabeza. No se escala un tubo completo ni se recalculan orientaciones.
- Cruce de superficie: con la cámara sobre el agua, la cabeza se ve en su posición
  refractada (profundidad aparente d / 1,33, atenuada por el agua recorrida); en el último
  metro converge a la posición real, así no salta al sumergirse. Refracción ondulante breve,
  burbujas pocas, sin destello de pantalla completa, y una adaptación de exposición suave
  (+30 %) como la de una cámara real.

## Guion técnico

| Tiempo      | Acción visual                                                                                                               | Sonido                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 0,0–0,6 s   | Fundido desde negro. Bahía nocturna frente a la ciudad                                                                      | Ciudad lejana y agua de la bahía                      |
| 0,2–2,6 s   | El logo se abre desde su centro, por encima del skyline                                                                     | Textura tonal (Re sus2) que crece con la formación    |
| 2,6–4,3 s   | Logo completo, estable y legible (flotación mínima de dron real); la cámara se acerca despacio                              | La textura se abre                                    |
| 4,3–5,4 s   | Los drones dejan el logo en orden, de derecha a izquierda, hacia la boca a la derecha del logo; nace la cabeza (4,75 s)     | Comienza el ascenso de energía                        |
| 4,3–7,0 s   | La corriente se ordena y se concentra en un haz angosto con cabeza luminosa y estela controlada; la cámara la acompaña      | El ascenso crece y se funde con la picada (sin corte) |
| 6,6–8,1 s   | Picada en curva: aceleración continua; la cámara baja y espera la cabeza en el punto de entrada                             | Un solo desplazamiento descendente                    |
| 8,1 s       | Toca el agua: el agua la frena; la estela se drena por la misma trayectoria; onda, rizado iluminado desde abajo, burbujas   | Golpe sordo y pocas burbujas                          |
| 8,1–8,85 s  | La imagen refractada de la cabeza baja bajo la superficie; la cámara desciende                                              | Agua cercana                                          |
| 8,85 s      | La cámara cruza la superficie                                                                                               | Todo se amortigua                                     |
| 8,85–10,6 s | La cabeza desciende y guía el cable: la cubierta aparece detrás de ella sobre la misma trayectoria; apoyo suave con sombra  | Presión grave                                         |
| 10,6–12,0 s | El cable queda en reposo en el lecho; el pulso de datos lo recorre (10,7–11,7 s) y deja un rastro tenue; la cabeza se aleja | Pulso grave y cola                                    |

## Controles de continuidad

`window.__cirion` expone diagnósticos (también en el navegador del Studio):

- `continuidad(t0, t1)` — por cuadro: desplazamiento máximo en pantalla de drones y cabeza.
  Tramo 4,3–9,0 s: drones ≤ 16 px/cuadro. La cabeza se mueve en pantalla ≤ 14 px/cuadro,
  salvo los 6 cuadros finales de la picada (8,0–8,17 s, hasta ~45 px), siempre con la estela
  continua detrás; en ese momento la cámara la espera en el punto de entrada en lugar de
  perseguirla a 130 m/s.
- Cámara (mismo módulo `src/camera.js` que la escena): giro ≤ 3°/cuadro (máximo al recibir
  la picada), traslación ≤ 3 m/cuadro, siempre continua.
- Revisión cuadro a cuadro del tramo 4,3–9,4 s: diferencia media entre cuadros sin picos
  salvo el cambio de medio en el cruce (8,80–8,87 s), que es gradual.

## Estructura

- `index.html` — composición HyperFrames (960 × 540 CSS, 12 s, 30 fps): canvas y audio.
- `src/config.js` — **todo lo ajustable**: tiempos, colores, logo 3D, drones, trayectoria
  maestra y perfil de velocidad, haz, cable, ciudad, agua, cámara y posproceso.
- `src/path.js` — trayectoria maestra (geometría, marcos, perfil de velocidad de la cabeza).
- `src/camera.js` — claves de cámara y seguimiento parcial de la cabeza (promedio gaussiano).
- `src/scene.js` — drones, cabeza, estela, cielo, agua con reflejo planar HDR, lecho con
  sombra de contacto, nieve marina, burbujas y el render por tiempo.
- `src/city.js` — ciudad procedural instanciada (fachadas, remates, costanera, tránsito,
  puente, edificio patrimonial).
- `src/cable.js` — cable armado revelado sobre la trayectoria, pulso y rastro.
- `src/post.js` — HDR (MSAA ×4) → bloom en 4 niveles → ACES, viñeta, grano por cuadro,
  refracción del cruce y exposición.
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
$HF render . --fps 30 -o renders/cirion_drones-ciudad_preview_960x540_v03.mp4

# Master 1920 × 1080 (H.264 High + AAC LC 48 kHz) — misma fuente, Chrome a DPR 2
$HF render . --resolution landscape --fps 30 -q delivery \
  -o renders/cirion_drones-ciudad_master_1920x1080_v03.mp4
```

Fotogramas sueltos para revisar: `$HF snapshot . --at 3.6,6.0,8.6,9.6,11.5 --no-end`.

## Logo

- `assets/logo/Cirion-logo-duo-negro.svg` — archivo oficial de Drive («Cirion-logo-duo-negro.svg»,
  3271 bytes, sha256 `2febbdf6…bc203`), sin modificar.
- Los drones se ubican muestreando sus trazados con `Path2D` (regla nonzero, la misma del
  SVG) y `getPointAtLength` para el contorno: no hay tipografía ni redibujo. El volumen repite
  el contorno en 3 capas de profundidad (26 m de extrusión) detrás de la cara frontal.
- Color: trazo magenta `#EF2AC1` tal como viene en el archivo; letras en blanco (versión
  negativa del duo para fondo nocturno).

## Audio

`assets/audio/banda-sonora.m4a` es síntesis original: no usa muestras ni pistas de terceros.
Lee los tiempos de `src/config.js`: el ascenso acompaña la convergencia y se funde con la
picada; un solo desplazamiento para la picada (no uno por movimiento); golpe sordo y pocas
burbujas en el ingreso; amortiguado desde el cruce de la cámara; pulso grave al apoyarse.

```bash
node scripts/synth-audio.mjs       # → assets/audio/banda-sonora.raw.wav
bash scripts/normalize-audio.sh    # ganancia lineal a −16 LUFS + limitador → AAC 160 kbps
```

Medido en el archivo de audio: −16,0 LUFS integrados, pico verdadero −3,1 dBTP. Las mediciones
son instrumentales; **la mezcla no se escuchó** en este entorno.

## Límites conocidos

- La ciudad es procedural: es creíble en plano general nocturno y en movimiento, pero no
  alcanza el detalle de una fotografía (no hay geometría de fachada más allá de volúmenes,
  ni texturas escaneadas). No se presentó un aumento de brillo o resolución como realismo.
- Para un fondo fotográfico real haría falta: **una fotografía nocturna con licencia de un
  skyline frente al agua, de al menos 3840 × 2160 px (idealmente RAW o HDR con horquillado),
  tomada desde unos 10–15 m sobre el agua con lente de 24–35 mm**, más una segunda placa
  limpia del agua para el descenso. Aun así, solo serviría para el tramo inicial con cámara
  casi fija; la picada y el cruce seguirían siendo 3D.
- El render de este entorno usa GPU por software (SwiftShader): ~0,8 s por cuadro a 960 × 540;
  el master 1920 × 1080 tarda unas cuatro veces más.

## Pendientes

- Revisar el preview v03 y luego exportar el master con el comando de arriba.
- Confirmar con marca la versión negativa del logo duo (letras blancas) para fondo oscuro.
- Escuchar la mezcla con auriculares y altavoces antes de aprobar.
