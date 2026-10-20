// Parámetros centralizados de la pieza. Todo lo ajustable vive aquí:
// duración, tiempos de cada tramo, colores, ciudades, logo 3D, cables, agua, cámara y
// posproceso. Unidades de mundo = metros. Tiempos en segundos de composición.

export const CONFIG = {
  duracion: 24,
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
    bruma: "#0E1A30", // bruma urbana nocturna
    oro: "#FFB24A", // reflectores dorados de las coronas (ref. Marina Bay)
    violeta: "#7A3CFF", // luces bajas de la costanera
  },

  // Guion por tramos (ver README.md).
  tiempos: {
    fundidoEntrada: 0.6,
    formacion: [0.3, 3.2], // el logo crece desde su centro hacia afuera
    paneo: [3.2, 5.6], // la cámara se acerca al logo
    cableSube: [5.4, 7.4], // el cable sale de la torre de datos y sube al logo
    contacto: 7.4,
    salidaConvergencia: [7.4, 7.75], // al tocarlo, el logo se transforma en el cable
    duracionConvergencia: [0.5, 0.62],
    compresion: [8.0, 8.4],
    picada: [8.4, 9.6], // del logo a la bahía
    cruceCamara: 9.86, // la cámara entra al agua
    llegadaUnion: 12.4, // el cable se empalma con el troncal del lecho
    pulsoUnion: [12.4, 13.6],
    viaje: [12.6, 20.8], // el pulso de datos recorre el troncal hasta la otra ciudad
    emersion: 19.55, // la cámara sale del agua frente a la ciudad B
    conexion: 20.8, // el pulso llega a la estación de amarre
    ondaCiudad: [20.8, 23.2], // la ciudad B se enciende desde la costa
  },

  logo: {
    centro: [0, 330, -620], // centro de la cara frontal, por encima del skyline
    ancho: 380,
    profundidad: 40,
    capasProfundidad: 3,
    giro: -22, // grados sobre su eje vertical respecto de la cámara inicial
    espaciado: 13.5, // unidades del viewBox del SVG (1140 de ancho)
    pasoContorno: 11,
    margenContorno: 3.2,
  },

  particulas: {
    tamano: 1.35, // radio del núcleo en px (a 960 de ancho)
    halo: 3.4,
    intensidad: 4.2, // HDR: brillo de cada dron
    intensidadHalo: 0.12,
    brilloCapas: [1.0, 0.5, 0.36, 0.26],
    estelaMax: 6,
    giroConvergencia: 0.9,
  },

  nucleo: { radio: 9, radioComprimido: 4, brumaM: 14, intensidad: 9 },

  // Cable de red submarino (fibra óptica con armadura de acero).
  cable: {
    diametro: 1.5, // m (estilizado para leerse desde lejos)
    energiaAire: 2.4, // emisión del tramo aéreo (energizado)
    pulsos: { velocidad: 22, separacion: 14, intensidad: 1.1 },
    hilos: 22,
    paso: 3.2,
    puntaHalo: 12,
    origen: [92, 218, -870], // azotea de la torre de datos (ciudad A)
    controlSubida: [60, 360, -800],
    entrada: [190, 0, -262], // donde toca el agua
    controlPicada: [120, 170, -470],
  },

  // Cable troncal existente en el lecho: se empalma con el nuevo y llega a la ciudad B.
  troncal: {
    // puntos de paso (x, z); la altura sigue el relieve
    puntos: [
      [-260, -330],
      [60, -262],
      [300, -228], // unidad de derivación (empalme)
      [560, -190],
      [820, -150],
      [1060, -122],
      [1240, -110],
      [1290, -110],
    ],
    union: 2, // índice del empalme
    diametro: 1.3,
    velocidadPulso: [40, 260], // m/s al salir del empalme → crucero
  },

  ciudadA: {
    semilla: 303,
    costa: -470, // z de la costanera
    x: [-1700, 1180],
    suelo: [-4500, 1260],
    profundidad: 2430,
    manzana: 74,
    calle: 20,
    alturaBase: 26,
    clusters: [
      { x: -180, z: -1150, alto: 190, rx: 650, rz: 520 },
      { x: 700, z: -1550, alto: 160, rx: 420, rz: 420 },
      { x: -950, z: -1650, alto: 130, rx: 380, rz: 380 },
    ],
    torreIconica: { x: -360, z: -980, alto: 300, lado: 46 },
    autos: 170,
    puente: { desde: [-340, 22, -150], hasta: [-720, 22, -480], ancho: 26, pilas: 90 },
  },

  // Ciudad B (destino): en la costa este, frente a la cámara al emerger.
  ciudadB: {
    semilla: 909,
    costaMundo: 1300, // x de su costanera (mira hacia −x)
    x: [-440, 1500], // en coordenadas locales (= z del mundo)
    suelo: [-470, 4000],
    profundidad: 2000,
    manzana: 70,
    calle: 20,
    alturaBase: 30,
    clusters: [
      { x: 120, z: -820, alto: 280, rx: 520, rz: 480 },
      { x: -700, z: -1100, alto: 170, rx: 420, rz: 400 },
    ],
    torreIconica: { x: 260, z: -700, alto: 400, lado: 46 },
    autos: 120,
    amarre: [1312, 3, -110], // estación de amarre del cable (mundo)
  },

  atmosfera: { bruma: 0.00028, nubes: 0.35 },

  agua: {
    reflejo: 1.25,
    distorsion: 0.022,
    oleaje: 0.22, // agua calma, casi espejo (ref. bahía)
    niebla: 0.026,
    anillo: { velocidad: 7, ancho: 0.9, duracion: 1.4 },
    burbujas: 16,
  },

  submarino: { nieve: 900, rayos: 5, pulso: { radioMax: 18, ancho: 1.4 } },

  // Profundidad del lecho a lo largo de x (pares [x, profundidad]).
  lecho: [
    [-1000, 46],
    [320, 46],
    [620, 58],
    [880, 40],
    [1060, 16],
    [1200, 6],
    [1296, 2],
  ],

  // Cámara: claves [t, pos, mira]. Durante el seguimiento la mira se mezcla con el
  // extremo del cable o con el pulso de datos (ver `seguimiento`).
  camara: {
    fov: 50,
    claves: [
      { t: 0.0, pos: [-150, 16, 90], mira: [-20, 215, -620] },
      { t: 3.2, pos: [-118, 22, 52], mira: [-8, 245, -620] },
      { t: 5.6, pos: [-60, 150, -250], mira: [20, 280, -690] },
      { t: 7.4, pos: [-40, 158, -268], mira: [36, 296, -700] },
      { t: 8.4, pos: [-12, 160, -262], mira: [20, 300, -660] },
      { t: 9.1, pos: [92, 84, -236], mira: [170, 20, -270] },
      { t: 9.86, pos: [160, 0, -236], mira: [200, -10, -262] },
      { t: 11.0, pos: [212, -20, -232], mira: [250, -36, -246] },
      { t: 12.4, pos: [268, -36, -214], mira: [300, -44, -228] },
      { t: 13.4, pos: [262, -37, -236], mira: [320, -44, -226] },
      { t: 14.4, pos: [280, -36, -238], mira: [360, -44, -220] },
      { t: 16.5, pos: [600, -45, -196], mira: [680, -50, -180] },
      { t: 18.6, pos: [880, -28, -150], mira: [960, -22, -136] },
      { t: 19.55, pos: [960, 0, -128], mira: [1300, 40, -112] },
      { t: 20.6, pos: [985, 14, -122], mira: [1320, 75, -110] },
      { t: 24.0, pos: [1005, 24, -118], mira: [1420, 110, -110], quieta: true },
    ],
    // seguimiento del extremo del cable [inicio, fin de entrada, inicio salida, fin]
    sigueCable: [5.3, 5.9, 12.2, 12.9],
    sigueCableRetraso: 0.03,
    // seguimiento del pulso de datos por el troncal
    siguePulso: [13.6, 14.4, 18.4, 19.2],
  },

  posproceso: {
    exposicion: 1.05,
    bloom: { umbral: 1.3, intensidad: 0.6, radio: 0.45 },
    vineta: 0.3,
    grano: 0.018,
  },
};
