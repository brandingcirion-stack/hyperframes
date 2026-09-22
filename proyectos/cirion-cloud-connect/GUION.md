# Cirion · Cloud Connect — muestra animada v01

- **Fuente:** `Cirion-Info-Cloud-Connect-Externo-ESP.pdf` (lámina vertical única, Illustrator, Maven Pro).
- **Formato de la muestra:** horizontal 1920×1080, 30 fps, 8,0 s, español, H.264 sin audio.
- **Alcance:** muestra de estilo y movimiento para aprobar antes del video completo. Textos literales de la lámina; elementos reconstruidos en vectores (sin rasterizar la lámina).

## Guion técnico

| Entrada–salida | Texto en pantalla                                                                       | Acción visual                                                                                                                      | Locución | Sonido    | Activo / fuente       |
| -------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | --------------------- |
| 0,00–2,40      | «¿Qué ocurre entre tus usuarios y la nube?»                                             | Entrada escalonada por línea (0,5 s c/u). «usuarios» pasa a magenta en 1,0 s; en 1,25 s se dibuja la nube y «nube» pasa a magenta. | —        | Pendiente | Titular de la lámina  |
| 2,40–2,90      | —                                                                                       | Salida del titular hacia la izquierda (cut-the-curve). La nube viaja a la izquierda y llega al centro en el corte.                 | —        | Pendiente | —                     |
| 2,90–3,60      | «CLOUD CONNECT»                                                                         | Traspaso de la nube (morph); aparece el nombre; se dibuja el anillo; aparecen los proveedores.                                     | —        | Pendiente | Esquema de beneficios |
| 3,60–5,90      | SEGURIDAD · FLEXIBILIDAD · DISPONIBILIDAD · PERFORMANCE con sus descripciones literales | En sentido horario, cada radio llega al nodo, el pulso lo activa, se dibuja el icono y aparece el texto (0,5 s entre beneficios).  | —        | Pendiente | Esquema de beneficios |
| 5,60–8,00      | «Conexiones privadas diseñadas para entornos empresariales.»                            | Líneas del pie y texto; cuadro final estable para lectura (~2,1 s).                                                                | —        | Pendiente | Pie del esquema       |

## Cue sheet de audio (propuesta; nada obtenido todavía)

- Música base suave desde 0,0 s; bajarla bajo la locución si se agrega.
- Pulso sutil en 1,25 s (aparece la nube).
- Desplazamiento suave en 2,4–2,9 s (corte).
- Cuatro pulsos breves en 3,72 / 4,22 / 4,72 / 5,22 s (activación de los nodos). Sin whoosh en cada entrada.
- Objetivo inicial: −16 LUFS integrados, true peak ≤ −1 dBTP; medir en el archivo final.

## Decisiones y pendientes

- **Logo:** no incluido. Falta el archivo oficial (SVG/PNG); no se recrea.
- **Proveedores cloud:** se muestran como nombres en texto gris, no como logotipos de terceros.
- **Foto del ejecutivo y fondos fotográficos de la lámina:** no usados en la muestra; se pueden incorporar desde el PDF o desde los originales en la pieza completa.
- **Cifra 90 % (Gartner):** la lámina solo cita «Fuente: Gartner». Antes de usarla en la pieza final hace falta el informe, fecha y URL verificables.
- **Audio:** sin música, voz ni efectos con licencia; la muestra es muda.
- **Estructura para la pieza completa:** separar cada escena en una sub-composición (`compositions/`) para resolver los avisos de `lint`.

## Comandos verificados

```bash
node ../../packages/cli/bin/hyperframes.mjs check
node ../../packages/cli/bin/hyperframes.mjs render --output renders/cirion-cloud-connect_es_1920x1080_muestra_v01.mp4 --fps 30
# Verificador de costuras (como root requiere un Chrome con --no-sandbox en CHROME_PATH)
node ../../.claude/skills/motion-doctrine/scripts/seam-gate.mjs verify --ledger ledger.json --project .
```

GSAP se carga desde `assets/vendor/gsap.min.js` (3.15.0) porque el CDN público está bloqueado en este entorno.
