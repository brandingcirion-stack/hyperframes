// Parámetros centralizados de la pieza. Todo lo ajustable vive aquí:
// duración, tiempos de cada tramo, colores, ciudad, logo 3D, cable, agua, cámara y
// posproceso. Unidades de mundo = metros. Tiempos en segundos de composición.

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
    bruma: "#0B1A3A", // bruma urbana (contaminación lumínica en azul profundo)
  },

  // Guion por tramos (ver README.md).
  tiempos: {
    fundidoEntrada: 0.6,
    encendido: [0.0, 0.9], // los drones se encienden escalonados
    formacion: [0.3, 2.85], // vuelo hasta su lugar en el logo
    duracionVuelo: [1.45, 1.75],
    sosten: [3.0, 5.0],
    convergencia: [5.0, 6.5],
    salidaConvergencia: [5.0, 5.55],
    duracionConvergencia: [0.7, 0.85],
    compresion: [6.15, 6.5],
    picada: [6.5, 7.6], // el extremo del cable baja en diagonal hasta tocar el agua
    cruceCamara: 7.86,
    llegadaFondo: 10.55,
    pulso: [10.55, 11.9],
    pausaFinal: 11.35,
  },

  // Show de drones: logo extruido en 3D sobre la costa de la ciudad.
  logo: {
    centro: [0, 250, -560], // centro de la cara frontal
    ancho: 380, // m
    profundidad: 40, // extrusión (m)
    capasProfundidad: 3, // anillos de contorno detrás de la cara frontal
    giro: -24, // grados de giro sobre su eje vertical respecto de la cámara inicial
    espaciado: 13.5, // unidades del viewBox del SVG (1140 de ancho)
    pasoContorno: 11,
    margenContorno: 3.2,
  },

  particulas: {
    tamano: 1.15, // radio del núcleo en px (a 960 de ancho)
    halo: 3.0,
    intensidad: 2.6, // HDR: el bloom construye el resplandor
    intensidadHalo: 0.12,
    brilloCapas: [1.0, 0.5, 0.36, 0.26], // cara frontal → capas traseras
    estelaMax: 6,
    arcoVuelo: 30, // m
    giroConvergencia: 0.8,
  },

  nucleo: {
    radio: 9,
    radioComprimido: 4,
    brumaM: 14, // m de resplandor alrededor del núcleo
    intensidad: 9,
  },

  // Cable de red submarino (fibra óptica con armadura de acero).
  cable: {
    diametro: 1.5, // m (estilizado para leerse desde lejos)
    vidaCielo: 0.55, // s: el tramo aéreo se disuelve en luz tras ese tiempo
    energiaCielo: 3.2, // emisión del tramo aéreo (energizado)
    pulsos: { velocidad: 22, separacion: 14, intensidad: 1.1 }, // datos que viajan (m/s, m)
    hilos: 22, // alambres de la armadura helicoidal
    paso: 3.2, // m por vuelta de la hélice
    puntaHalo: 12, // px
  },

  ciudad: {
    costa: -470, // z de la costanera
    x: [-1700, 1700],
    fondo: -2900,
    manzana: 74, // m
    calle: 20,
    alturaBase: 28,
    clusters: [
      { x: -180, z: -1100, alto: 300, rx: 650, rz: 520 },
      { x: 760, z: -1550, alto: 200, rx: 420, rz: 420 },
      { x: -950, z: -1650, alto: 160, rx: 380, rz: 380 },
    ],
    torreIconica: { x: -330, z: -940, alto: 480, lado: 52 },
    ventanas: 0.32, // intensidad de ventanas
    autos: 170,
    puente: { desde: [-340, 22, -150], hasta: [-720, 22, -480], ancho: 26, pilas: 90 },
  },

  atmosfera: {
    bruma: 0.00028, // densidad de bruma por metro
    nubes: 0.35,
  },

  agua: {
    reflejo: 1.0,
    distorsion: 0.03,
    oleaje: 0.35,
    niebla: 0.027,
    anillo: { velocidad: 7, ancho: 0.9, duracion: 1.4 },
    burbujas: 16,
  },

  submarino: {
    nieve: 1600,
    rayos: 5,
    pulso: { radioMax: 18, ancho: 1.4 },
  },

  // Recorrido del extremo del cable.
  recorrido: {
    entrada: [46, 0, -158], // donde toca el agua
    controlPicada: [22, 120, -380],
    fondo: [84, null, -236], // xz donde queda apoyado; y = relieve del lecho
    llegadaHorizontal: [0.55, -0.83], // dirección (x, z) con la que se apoya en el lecho
    profundidad: 46,
  },

  // Cámara: claves [t, pos, mira]. `mira` es el objetivo antes del seguimiento;
  // desde `seguimiento.inicio` la cámara sigue el extremo del cable.
  camara: {
    fov: 50,
    claves: [
      { t: 0.0, pos: [-120, 14, 60], mira: [-30, 150, -560] },
      { t: 3.0, pos: [-78, 15, 36], mira: [-20, 155, -560] },
      { t: 5.0, pos: [-30, 17, 12], mira: [-8, 160, -560] },
      { t: 6.5, pos: [-8, 18, -4], mira: [0, 190, -560] },
      { t: 7.2, pos: [16, 14, -62] },
      { t: 7.86, pos: [36, 0, -132] },
      { t: 8.6, pos: [42, -10, -150] },
      { t: 9.6, pos: [52, -24, -176] },
      { t: 10.6, pos: [62, -34, -204], quieta: false },
      { t: 11.35, pos: [64, -36, -208], quieta: true },
      { t: 12.0, pos: [64.2, -36.1, -208.3], quieta: true },
    ],
    seguimiento: { inicio: 6.3, fin: 6.8, retraso: 0.16, retrasoAgua: 0.04 },
  },

  posproceso: {
    exposicion: 1.0,
    bloom: { umbral: 1.4, intensidad: 0.6, radio: 0.7 },
    vineta: 0.32,
    grano: 0.018,
  },
};
