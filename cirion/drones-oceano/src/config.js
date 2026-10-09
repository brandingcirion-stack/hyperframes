// Parámetros centralizados de la pieza. Todo lo ajustable vive aquí:
// duración, tiempos de cada tramo, colores, partículas, brillo, agua y cámara.
// Unidades de mundo ≈ metros. Tiempos en segundos de composición.

export const CONFIG = {
  duracion: 12,
  fps: 30,
  // Tamaño CSS de la composición. El preview se renderiza a este tamaño (960×540);
  // el master 1920×1080 se obtiene con `--resolution landscape` (DPR 2), y todo lo
  // que se mide en píxeles se escala con el devicePixelRatio.
  base: { ancho: 960, alto: 540 },
  semilla: 20251009,

  colores: {
    negro: "#000000",
    azulProfundo: "#001F60",
    azul: "#00A7E1",
    magenta: "#EF2AC1",
    // Letras del logo duo sobre fondo nocturno (versión negativa: blanco).
    letrasLogo: "#FFFFFF",
    lechoMarino: "#4A5868",
  },

  // Guion por tramos (ver README.md).
  tiempos: {
    fundidoEntrada: 0.6, // la escena aparece desde negro
    encendido: [0.0, 0.9], // los drones se encienden escalonados
    formacion: [0.3, 2.85], // vuelo hasta su lugar en el logo (llegan antes de 2.9)
    duracionVuelo: [1.45, 1.75], // duración individual del vuelo (min, max)
    sosten: [3.0, 5.0],
    convergencia: [5.0, 6.5],
    salidaConvergencia: [5.0, 5.55], // ventana en la que cada punto abandona su lugar
    duracionConvergencia: [0.7, 0.85],
    compresion: [6.15, 6.5], // el núcleo se comprime y acumula energía
    picada: [6.5, 7.6], // el haz baja en diagonal hasta tocar el agua
    cruceCamara: 7.86, // la cámara atraviesa la superficie
    llegadaFondo: 10.55,
    pulso: [10.55, 11.9],
    pausaFinal: 11.35, // la cámara queda prácticamente quieta desde aquí
  },

  logo: {
    // Composición en el primer cuadro.
    anchoPantalla: 0.54, // fracción del ancho de cuadro
    centroY: 0.36, // fracción del alto, desde arriba
    distancia: 200,
    // Muestreo de la geometría oficial (unidades del viewBox del SVG, 1140 de ancho).
    espaciado: 13.5, // distancia mínima entre drones
    pasoContorno: 11, // muestreo a lo largo del contorno
    margenContorno: 3.2, // los puntos del contorno se retraen hacia dentro (en unidades SVG)
  },

  particulas: {
    tamano: 1.55, // radio del núcleo en px (a 960 de ancho)
    halo: 4.6, // radio del halo en px
    intensidadNucleo: 1.0,
    intensidadHalo: 0.17,
    estelaMax: 6, // largo máx. de la estela de movimiento (px)
    arcoVuelo: 9, // elevación del arco durante el vuelo (m)
    giroConvergencia: 0.8, // radianes de giro en espiral al converger
  },

  nucleo: {
    radio: 10, // px del halo al máximo antes de comprimirse
    radioComprimido: 4.2,
    brumaM: 4.5, // m de resplandor azul alrededor del núcleo (acumulación de energía)
    intensidad: 1.15,
  },

  haz: {
    estelaCielo: 0.9, // s de estela visible en la picada
    estelaAgua: 0.75, // s de estela bajo el agua (se desvanece)
    anchoPx: 5.5, // ancho del haz junto a la punta
    halo: 10, // px del halo de la punta
    haloAgua: 2.4, // m de dispersión alrededor de la punta bajo el agua
    hiloMagenta: 0.55, // intensidad del filamento magenta
  },

  agua: {
    reflejo: 0.42, // intensidad del reflejo del logo
    fragmentacion: 0.62, // 0 = espejo, 1 = muy roto
    distorsion: 0.012,
    oleaje: 0.35, // amplitud visual del oleaje
    niebla: 0.027, // densidad de niebla submarina
    anillo: { velocidad: 7, ancho: 0.7, duracion: 1.4 },
    burbujas: 14,
  },

  submarino: {
    nieve: 1400, // partículas suspendidas
    rayos: 5, // haces de luz desde la superficie
    pulso: { radioMax: 18, ancho: 1.4 },
  },

  // Recorrido del haz.
  recorrido: {
    entrada: [14, 0, -66], // punto donde el haz toca el agua
    controlPicada: [2, 34, -150], // curva de la picada (Bézier cuadrática)
    fondo: [22, null, -80], // xz del punto de llegada; y = relieve del lecho
    profundidad: 58,
  },

  // Cámara: claves [t, posición, objetivo]. `objetivo: "logo"` mira al logo;
  // `"haz"` sigue la punta del haz. Interpolación cúbica continua en el tiempo.
  camara: {
    fov: 40,
    horizonteY: 2 / 3, // fracción del alto en la que cae el horizonte en el primer cuadro
    claves: [
      { t: 0.0, pos: [0, 4, 0] },
      { t: 3.0, pos: [0, 4, -1.5] },
      { t: 5.0, pos: [0, 4.1, -8] },
      { t: 6.5, pos: [0.4, 4.2, -13] },
      { t: 7.2, pos: [6, 3.0, -38] },
      { t: 7.86, pos: [12.5, 0, -57.5] },
      { t: 8.6, pos: [14.5, -9, -63] },
      { t: 9.6, pos: [16, -24, -66] },
      { t: 10.6, pos: [17, -35.5, -66.5] },
      { t: 11.35, pos: [17, -38.8, -66.7], quieta: true },
      { t: 12.0, pos: [17, -39.0, -66.75], quieta: true },
    ],
    // Hacia dónde mira: mezcla logo→haz y retraso de seguimiento.
    seguimiento: { inicio: 6.35, fin: 6.75, retraso: 0.16, retrasoAgua: 0.03 },
  },
};
