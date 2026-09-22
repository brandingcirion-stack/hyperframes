# Cirion · Cloud Connect — guion y estado

- **Fuente:** `Cirion-Info-Cloud-Connect-Externo-ESP.pdf` (lámina vertical única, Illustrator, Maven Pro).
- **Pieza:** 36 s = intro (3 s) + guion (30 s) + out (3 s). Horizontal 1920×1080, 30 fps, español. Sin locución; música synth tech y efectos sincronizados.
- **Entrega actual:** v04 — video completo en borrador (`renders/cirion-cloud-connect_es_1920x1080_completo_v04.mp4`).
- **Aprobado:** ritmo de v01–v02 y encendido horario de los beneficios (v03).

## Guion aprobado (texto exacto en pantalla)

| Tiempo  | Texto                                                                                                                                                                                       | Animación                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 00–04 s | ¿Qué ocurre entre tus usuarios y la nube?                                                                                                                                                   | Revelar al ejecutivo y la pregunta. Destacar «usuarios» y «nube» en magenta. Un filamento conecta ambos conceptos.           |
| 04–09 s | 90% / de las organizaciones adoptará estrategias de nube híbrida hasta 2027.\* / \*Fuente: Gartner.                                                                                         | Aparece el globo con el porcentaje. Cifra, explicación y fuente estables para leer.                                          |
| 09–15 s | Cloud Connect / Conexión privada entre tu red y los principales proveedores cloud.                                                                                                          | Dibujar la conexión desde «Tu red», a través de Cloud Connect, hacia los proveedores. Activar los destinos con pulsos.       |
| 15–24 s | Beneficios para tu negocio / Seguridad: tráfico privado. / Performance: menor variabilidad. / Flexibilidad: múltiples proveedores cloud. / Disponibilidad: redundancia y SLA empresariales. | Los cuatro beneficios alrededor de la nube desde el inicio. Iluminar cada icono en secuencia, con todos los textos visibles. |
| 24–30 s | Cloud Connect la acerca a tu red. / Conectividad privada para tus aplicaciones.                                                                                                             | Revelar la ciudad y sus conexiones. Integrar el logo oficial. Cierre completo estable durante los últimos 4 s.               |

## Montaje v04 (tiempos globales)

| Tiempo | Pieza                          | Acción visual                                                                                                                                                                                                  | Sonido (sintetizado, grilla de 120 BPM)                      |
| ------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 0–3    | `intro.mp4` (cliente)          | Logo oficial. Fundido a negro 2,6–3,0 s.                                                                                                                                                                       | Colchón que entra suave                                      |
| 3–7    | `compositions/pregunta.html`   | Aparece el ejecutivo; el titular entra por líneas. «usuarios» se enciende (4,0) y lanza un filamento con una chispa que llega a «nube» y la enciende (5,0). Sale a la izquierda; la foto se esfuma como vapor. | Tic 4,0 · barrido 4,0–5,0 · pulso 5,0                        |
| 7–12   | `compositions/dato.html`       | Entra desde la derecha. El globo se asienta; «90%» sube en su máscara (fijo en 7,5); explicación y fuente estables 8,4–11,66. Sale a la izquierda.                                                             | Aire 6,66 · golpe grave 7,5                                  |
| 12–18  | `compositions/conexion.html`   | Entra desde la derecha. La conexión privada se dibuja de «Tu red» a la nube (llega 13,5) y de la nube a los cinco proveedores (14,0–15,0), que se activan con pulsos. El esquema se retira y la nube queda.    | Barrido 12,9 · pulso 13,5 · cinco tics ascendentes 14,0–15,0 |
| 18–27  | `compositions/beneficios.html` | Misma nube (corte con elemento compartido). Todo visible desde el inicio; iconos encendidos en sentido horario 19,5 / 21,0 / 22,5 / 24,0; anillo completo 25,5. Sale hacia arriba.                             | Pulsos estéreo en cada llegada · acorde 25,5                 |
| 27–33  | `compositions/cierre.html`     | Entra desde abajo. Se revelan la ciudad y sus conexiones (27,2–28,8). Cierre completo estable 29–33.                                                                                                           | Aire 26,66 · barrido y destello 27,2                         |
| 33–36  | `out.mp4` (cliente)            | Logo oficial (integra el logo del guion).                                                                                                                                                                      | Acorde final y destello 33,3 sincronizado con el flare       |

Fondo de vapor (`compositions/vapor.html`) de 3 a 29 s; se disipa antes del cierre estable. Transiciones verificadas con el verificador de costuras (`ledger.json`): LEFT 7,0 · LEFT 12,0 · nube compartida 18,0 · UP 27,0.

## Proporción áurea (φ ≈ 1,618)

- Beneficios y Cloud Connect: diámetro del anillo / ancho de la nube = φ (600 / 371 px); títulos en x = W/φ⁵ (173 px) con línea base en H/φ⁴ (158 px).
- Dato: texto en la columna 0,618·W (1187 px), desde 0,382·H; fuente sobre 0,618·H. Cifra 393 px y «%» 393/φ.
- Cierre: horizonte de la ciudad sobre 0,618·H (668 px).
- Escala tipográfica en pasos de √φ: 93 · 73 · 57 · 45 · 36 · 28 · 22 px (título 57, nube 45, beneficio 36, descripción 28).
- Pregunta: foto en 0–0,382·W; texto desde 830 px; ojos y tope del titular en 0,382·H; base en 0,618·H.

## Audio

- `scripts/generar-audio.py` sintetiza música y efectos (determinista, sin material de terceros): 120 BPM, La menor; colchón de acordes (Am9 · Fmaj7 · Cadd9 · G6…), arpegio en semicorcheas 3–29 s, bajo y hi-hats 12–27 s, bombo suave 18–27 s, resolución en Do al final.
- Medido en el MP4 v04: −16,0 LUFS integrados, pico −1,5 dBTP, LRA 3,2 LU. Mezcla mono −21,2 LUFS: el colchón y la reverberación tienen amplitud estéreo, pero no hay cancelaciones (la caída queda dentro de lo esperable para contenido parcialmente descorrelacionado).

## Decisiones y pendientes

- **Logo oficial:** llega con `out.mp4` inmediatamente después del cierre; no se recrea ni se duplica dentro de la escena 24–30 s.
- **Gartner (90 %):** completar informe, fecha y URL antes de publicar.
- **Foto del ejecutivo:** extraída del PDF (1024×1536); conviene el original en alta y confirmar derechos de uso. Sin animación de boca (el guion no la pide).
- **Proveedores cloud** (escena 09–15 s): nombres en texto, no logotipos de terceros, salvo que se entreguen los aprobados. «Tu red» y los proveedores son rótulos de la animación, tomados de la lámina.
- **Estructura:** `index.html` anfitrión + sub-composiciones en `compositions/`. `lint` avisa que `beneficios.html` es extenso (394 líneas); no afecta el render.

## Activos

- `assets/video/intro.mp4` y `assets/video/out.mp4` — del cliente (Google Drive, 1920×1080, 25 fps, 3 s). **Fuera de Git** por tamaño; descargarlos de los enlaces entregados antes de renderizar.
- `assets/audio/banda-sonora.flac` — **fuera de Git** (6 MB); se regenera con `scripts/generar-audio.py` (numpy, scipy, ffmpeg).
- `assets/fonts/MavenPro-latin.woff2` — Maven Pro (Google Fonts, OFL), servida localmente.
- `assets/img/ejecutivo.webp`, `globo.webp`, `ciudad.webp` — extraídas del PDF con sus máscaras (el ejecutivo, volteado como en la lámina).
- `assets/img/vapor-1…5.webp` — `scripts/generar-vapor.py` (semillas fijas; numpy, pillow, scikit-image).
- `assets/vendor/` — GSAP y MorphSVGPlugin 3.15.0 (licencia estándar gratuita de GSAP); el CDN público está bloqueado en este entorno.

## Comandos verificados

```bash
node ../../packages/cli/bin/hyperframes.mjs lint
node ../../packages/cli/bin/hyperframes.mjs check
python scripts/generar-audio.py
node ../../packages/cli/bin/hyperframes.mjs render --output renders/cirion-cloud-connect_es_1920x1080_completo_v04.mp4 --fps 30 --quality delivery
# Verificador de costuras (como root requiere un Chrome con --no-sandbox en CHROME_PATH)
node ../../.claude/skills/motion-doctrine/scripts/seam-gate.mjs verify --ledger ledger.json --project .
```
