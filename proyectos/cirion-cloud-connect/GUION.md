# Cirion · Cloud Connect — guion y estado

- **Fuente:** `Cirion-Info-Cloud-Connect-Externo-ESP.pdf` (lámina vertical única, Illustrator, Maven Pro).
- **Pieza final:** 30 s, horizontal 1920×1080, 30 fps, español. Sin locución; música y efectos sincronizados.
- **Entrega actual:** muestra v03 — solo la escena «Beneficios para tu negocio» (15–24 s), 9 s. Se espera aprobación antes del video completo.

## Guion aprobado (texto exacto en pantalla)

| Tiempo  | Texto                                                                                                                                                                                       | Animación                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 00–04 s | ¿Qué ocurre entre tus usuarios y la nube?                                                                                                                                                   | Revelar al ejecutivo y la pregunta. Destacar «usuarios» y «nube» en magenta. Un filamento conecta ambos conceptos.           |
| 04–09 s | 90% / de las organizaciones adoptará estrategias de nube híbrida hasta 2027.\* / \*Fuente: Gartner.                                                                                         | Aparece el globo con el porcentaje. Cifra, explicación y fuente estables para leer.                                          |
| 09–15 s | Cloud Connect / Conexión privada entre tu red y los principales proveedores cloud.                                                                                                          | Dibujar la conexión desde «Tu red», a través de Cloud Connect, hacia los proveedores. Activar los destinos con pulsos.       |
| 15–24 s | Beneficios para tu negocio / Seguridad: tráfico privado. / Performance: menor variabilidad. / Flexibilidad: múltiples proveedores cloud. / Disponibilidad: redundancia y SLA empresariales. | Los cuatro beneficios alrededor de la nube desde el inicio. Iluminar cada icono en secuencia, con todos los textos visibles. |
| 24–30 s | Cloud Connect la acerca a tu red. / Conectividad privada para tus aplicaciones.                                                                                                             | Revelar la ciudad y sus conexiones. Integrar el logo oficial. Cierre completo estable durante los últimos 4 s.               |

## Muestra v03 · escena de beneficios (local 0–9 s = 15–24 s del video)

| Entrada–salida | Acción visual                                                                                                         | Sonido (sintetizado)                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 0,00–1,00      | Título, nube, anillo, nodos atenuados y los cuatro textos visibles desde el primer cuadro. Vapor de fondo.            | —                                                    |
| 1,00–1,45      | Un pulso sale de la nube hacia Seguridad; al llegar, el icono se ilumina con un halo breve y el nombre toma su color. | Barrido suave (centro) + pulso en 1,45 s (centro)    |
| 2,60–3,05      | Igual hacia Flexibilidad.                                                                                             | Barrido + pulso en 3,05 s (derecha 0,35)             |
| 4,20–4,65      | Igual hacia Disponibilidad.                                                                                           | Barrido + pulso en 4,65 s (centro)                   |
| 5,80–6,25      | Igual hacia Performance.                                                                                              | Barrido + pulso en 6,25 s (izquierda 0,35)           |
| 7,30–9,00      | Con los cuatro activos, el anillo gana intensidad. Cuadro estable.                                                    | Acorde suave en 7,3 s, estéreo por leve desafinación |

Orden de encendido: horario (Seguridad → Flexibilidad → Disponibilidad → Performance), el mismo ritmo aprobado en v01–v02.

## Proporción áurea (φ ≈ 1,618)

- Escena de beneficios: diámetro del anillo / ancho de la nube = φ (600 / 371 px); título en x = W/φ⁵ (173 px) con línea base en H/φ⁴ (158 px).
- Escala tipográfica en pasos de √φ: 93 · 73 · 57 · 45 · 36 · 28 · 22 px (título 57, nube 45, beneficio 36, descripción 28).
- Apertura (v02): foto en 0–0,382·W; texto desde 830 px; ojos y tope del titular en 0,382·H; base en 0,618·H.

## Audio

- Efectos: `scripts/generar-sfx-beneficios.py` (determinista, sin material de terceros). Medido en el MP4 v03: −20,7 LUFS integrados, pico −3,0 dBTP; mezcla mono −24,1 LUFS (caída esperada de ~3 dB, sin cancelaciones).
- **Música: pendiente.** No hay pista con licencia; el objetivo de −16 LUFS / ≤ −1 dBTP se aplicará a la mezcla completa con música.

## Decisiones y pendientes

- **Logo oficial** (escena 24–30 s): falta el archivo SVG/PNG; no se recrea.
- **Gartner (90 %):** completar informe, fecha y URL antes de publicar.
- **Foto del ejecutivo:** extraída del PDF (1024×1536); conviene el original en alta y confirmar derechos de uso. Sin animación de boca (el guion no la pide).
- **Proveedores cloud** (escena 09–15 s): nombres en texto, no logotipos de terceros, salvo que se entreguen los aprobados.
- **Estructura:** `index.html` anfitrión + sub-composiciones en `compositions/` (vapor, beneficios). La apertura v02 queda en el historial de Git (`bdbc001`) para reutilizarla.

## Activos

- `assets/fonts/MavenPro-latin.woff2` — Maven Pro (Google Fonts, OFL), servida localmente.
- `assets/img/ejecutivo.webp` — foto del PDF con su máscara, volteada como en la lámina.
- `assets/img/vapor-1…5.webp` — `scripts/generar-vapor.py` (semillas fijas; numpy, pillow, scikit-image).
- `assets/vendor/` — GSAP y MorphSVGPlugin 3.15.0 (licencia estándar gratuita de GSAP); el CDN público está bloqueado en este entorno.

## Comandos verificados

```bash
node ../../packages/cli/bin/hyperframes.mjs lint
node ../../packages/cli/bin/hyperframes.mjs check
node ../../packages/cli/bin/hyperframes.mjs render --output renders/cirion-cloud-connect_es_1920x1080_beneficios_v03.mp4 --fps 30
```
