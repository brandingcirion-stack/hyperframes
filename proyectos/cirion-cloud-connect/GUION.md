# Cirion · Cloud Connect — muestra animada v02

- **Fuente:** `Cirion-Info-Cloud-Connect-Externo-ESP.pdf` (lámina vertical única, Illustrator, Maven Pro).
- **Formato de la muestra:** horizontal 1920×1080, 30 fps, 8,0 s, español, H.264 sin audio.
- **Alcance:** muestra de estilo y movimiento para aprobar antes del video completo. Textos literales de la lámina; esquema reconstruido en vectores.
- **v02 (comentarios del 22/09):** se agrega la foto del ejecutivo, un fondo de vapor muy difuminado que asciende y se esfuma, y diagramación con proporción áurea. Se mantiene el ritmo aprobado de v01.

## Proporción áurea (φ ≈ 1,618) aplicada

- Columnas: foto en 0–0,382·W (733 px); texto desde 733 + H/φ⁵ (97 px) = 830 px.
- Horizontales: 0,382·H = 412 px (línea de los ojos del ejecutivo y tope del titular) y 0,618·H = 668 px (base del titular).
- Esquema: diámetro del anillo / ancho de la nube = φ (660 / 408 px).
- Escala tipográfica en pasos de √φ: 93 · 73 · 57 · 45 · 36 · 28 · 22 px (titular 93, nube 45, beneficios 36/28, proveedores y pie 22).

## Guion técnico

| Entrada–salida | Texto en pantalla                                                                       | Acción visual                                                                                                                                                                                         | Locución | Sonido    | Activo / fuente                              |
| -------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | -------------------------------------------- |
| 0,00–2,20      | «¿Qué ocurre entre tus usuarios y la nube?»                                             | Foto del ejecutivo (volteada como en la lámina) aparece y se asienta (escala 1,04→1). Entrada escalonada del titular; «usuarios» y «nube» pasan a magenta en 1,0 y 1,3 s. Vapor de fondo ascendiendo. | —        | Pendiente | Foto y titular de la lámina; vapor generado  |
| 2,20–2,90      | —                                                                                       | El titular sale hacia la derecha. La foto se desenfoca y se esfuma como vapor; su contorno magenta se transforma en la nube y viaja al centro.                                                        | —        | Pendiente | Contorno trazado desde la máscara de la foto |
| 2,90–3,60      | «CLOUD CONNECT»                                                                         | Traspaso de la nube (morph); aparece el nombre; se dibuja el anillo; aparecen los proveedores.                                                                                                        | —        | Pendiente | Esquema de beneficios                        |
| 3,60–5,90      | SEGURIDAD · FLEXIBILIDAD · DISPONIBILIDAD · PERFORMANCE con sus descripciones literales | En sentido horario, cada radio llega al nodo, el pulso lo activa, se dibuja el icono y aparece el texto (0,5 s entre beneficios).                                                                     | —        | Pendiente | Esquema de beneficios                        |
| 5,60–8,00      | «Conexiones privadas diseñadas para entornos empresariales.»                            | Líneas del pie y texto; cuadro final estable para lectura (~2,1 s).                                                                                                                                   | —        | Pendiente | Pie del esquema                              |

## Cue sheet de audio (propuesta; nada obtenido todavía)

- Música base suave desde 0,0 s; bajarla bajo la locución si se agrega.
- Pulso sutil en 1,25 s (aparece la nube).
- Soplo/vapor suave en 2,2–2,9 s (la foto se esfuma y el contorno se transforma).
- Cuatro pulsos breves en 3,72 / 4,22 / 4,72 / 5,22 s (activación de los nodos). Sin whoosh en cada entrada.
- Objetivo inicial: −16 LUFS integrados, true peak ≤ −1 dBTP; medir en el archivo final.

## Decisiones y pendientes

- **Logo:** no incluido. Falta el archivo oficial (SVG/PNG); no se recrea.
- **Proveedores cloud:** se muestran como nombres en texto gris, no como logotipos de terceros.
- **Foto del ejecutivo:** extraída del PDF con su máscara (1024×1536, baja resolución para 1080p: se muestra a 0,74×). Para la pieza final conviene el archivo original en alta y confirmar sus derechos de uso.
- **Animación de la boca:** no realizada; pendiente de decisión (ver notas de entrega).
- **Vapor:** texturas propias generadas con `scripts/generar-vapor.py` (semilla fija; requiere numpy, pillow y scikit-image).
- **Cifra 90 % (Gartner):** la lámina solo cita «Fuente: Gartner». Antes de usarla en la pieza final hace falta el informe, fecha y URL verificables.
- **Audio:** sin música, voz ni efectos con licencia; la muestra es muda.
- **Estructura para la pieza completa:** separar cada escena en una sub-composición (`compositions/`) para resolver los avisos de `lint`.

## Comandos verificados

```bash
node ../../packages/cli/bin/hyperframes.mjs check
node ../../packages/cli/bin/hyperframes.mjs render --output renders/cirion-cloud-connect_es_1920x1080_muestra_v02.mp4 --fps 30
# Verificador de costuras (como root requiere un Chrome con --no-sandbox en CHROME_PATH)
node ../../.claude/skills/motion-doctrine/scripts/seam-gate.mjs verify --ledger ledger.json --project .
```

GSAP y MorphSVGPlugin se cargan desde `assets/vendor/` (3.15.0, licencia estándar gratuita de GSAP) porque el CDN público está bloqueado en este entorno.
