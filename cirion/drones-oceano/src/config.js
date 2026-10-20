// Parámetros centralizados de la pieza. Todo lo ajustable vive aquí:
// duración, tiempos de cada tramo, colores, ciudad, logo 3D, trayectoria maestra del haz,
// cable, agua, cámara y posproceso. Unidades de mundo = metros. Tiempos en segundos.

export const CONFIG = {
  duracion: 12,
  fps: 30,
  // Tamaño CSS de la composición. El preview se renderiza a este tamaño (960×540);
  // el master 1920×1080 se obtiene con `--resolution landscape` (DPR 2).
  base: { ancho: 960, alto: 540 },
  semilla: 20251009,

  colores: {
    // marca: solo logo, drones, haz y energía de conexión
    azulProfundo: "#001F60",
    azul: "#00A7E1",
    magenta: "#EF2AC1",
    letrasLogo: "#FFFFFF", // versión negativa del logo duo sobre la noche
    // ciudad y entorno: colores fotográficos naturales
    bruma: "#161A22",
    lechoMarino: "#5A6168",
  },

  // Guion por tramos (ver README.md). Los nombres de `convergencia`, `picada`,
  // `cruceCamara` y `llegadaFondo` los usa también la banda sonora.
  tiempos: {
    fundidoEntrada: 0.6,
    formacion: [0.2, 2.6], // el logo se abre desde su centro
    sosten: [2.6, 4.3], // figura completa, estable y legible
    convergencia: [4.3, 7.0], // los drones dejan el logo en orden y forman la corriente
    salidas: [4.3, 5.4], // ventana en la que cada dron abandona su lugar
    picada: [6.6, 8.1], // la cabeza acelera en curva hasta tocar el agua (picada[1])
    cruceCamara: 8.85, // la cámara atraviesa la superficie (tras ver el impacto)
    llegadaFondo: 10.6, // el cable queda apoyado en el lecho
    pulso: [10.7, 11.7], // pulso de datos a lo largo del cable
  },

  logo: {
    centro: [0, 150, -320], // centro de la cara frontal (sobre la bahía, frente a la ciudad)
    ancho: 260,
    profundidad: 26,
    capasProfundidad: 3,
    giro: -12, // grados sobre su eje vertical respecto de la cámara inicial
    espaciado: 13.5, // unidades del viewBox del SVG (1140 de ancho)
    pasoContorno: 11,
    margenContorno: 3.2,
  },

  drones: {
    tamano: 1.25, // radio del núcleo en px (a 960 de ancho)
    halo: 3.0,
    intensidad: 4.2,
    intensidadHalo: 0.12,
    brilloCapas: [1.0, 0.5, 0.36, 0.26],
    estelaMax: 5, // px: estela de movimiento máxima de cada dron
    velocidadCorriente: 170, // m/s con que los drones cruzan el logo hacia la boca
  },

  // Trayectoria maestra: boca (lado derecho del logo) → curva descendente → agua →
  // descenso submarino → apoyo en el lecho. Tangente continua en cada unión.
  trayectoria: {
    salidaLateral: 18, // m a la derecha del logo donde nace la corriente
    entrada: [175, 0, -150], // punto donde la cabeza toca el agua
    tangenteEntrada: [0.42, -0.86, 0.29],
    apoyo: [214, null, -146], // xz donde el cable toca el lecho (y = relieve + radio)
    direccionLecho: [0.96, 0, 0.28], // rumbo del cable apoyado
    largoApoyo: 90, // m de tendido: la cabeza sigue y se pierde en la penumbra del fondo
    curvaLecho: 0.22, // rad: giro suave del tendido sobre el lecho
    profundidad: 20,
    velocidadInicial: 4, // m/s de la cabeza al nacer en la boca
    potencia: 1.25, // forma de la aceleración en el cielo (v ∝ t^potencia)
    tauFrenado: 0.06, // s: el agua frena la cabeza en seco (decaimiento exponencial de la velocidad)
    velocidadFinal: 9, // m/s: tras apoyarse, la cabeza sigue tendiendo y se aleja hacia la penumbra
  },

  haz: {
    cabezaPx: 2.0,
    haloPx: 10,
    estelaS: 0.32, // s de recorrido visibles como estela (se acorta al frenar)
    estelaMin: 2.0, // m mínimos de estela
    estelaMax: 46, // m máximos de estela
    anchoPx: 3.0,
  },

  cable: {
    diametro: 0.5, // m: cable armado de aguas someras (legible a 7–15 m)
    hilos: 18, // alambres de la armadura
    paso: 0.9, // m por vuelta de la hélice
    frente: 0.9, // m entre la cabeza y la cubierta ya formada
  },

  atmosfera: { bruma: 0.00026, nubes: 0.22 },

  agua: {
    reflejo: 1.0,
    distorsion: 0.018,
    oleaje: 0.3,
    niebla: 0.055, // densidad de niebla submarina (escala de bahía poco profunda)
    anillo: { velocidad: 4.5, ancho: 0.5, duracion: 1.2 },
    burbujas: 12,
  },

  submarino: { nieve: 700, rayos: 4 },

  ciudad: {
    semilla: 303,
    costa: -470,
    x: [-1700, 1700],
    profundidad: 2430,
    manzana: 74,
    calle: 20,
    alturaBase: 24,
    clusters: [
      { x: -160, z: -1150, alto: 200, rx: 650, rz: 520 },
      { x: 700, z: -1500, alto: 150, rx: 420, rz: 420 },
      { x: -720, z: -1500, alto: 190, rx: 300, rz: 300 },
      { x: 1250, z: -1350, alto: 170, rx: 300, rz: 300 },
    ],
    torreIconica: { x: -380, z: -980, alto: 290, lado: 44 },
    autos: 150,
    puente: { desde: [-340, 22, -150], hasta: [-720, 22, -480], ancho: 26, pilas: 90 },
  },

  // Cámara: claves [t, pos, mira] interpoladas con Hermite. Desde 5 s la mira se mezcla con
  // la cabeza del haz (misma trayectoria maestra) según `seguimiento` ([t, peso], tramos
  // suaves); la cabeza se promedia ±2·`suavizado` s para no transmitir tirones.
  // En el impacto el peso baja: la cámara espera la cabeza en el punto de entrada en lugar
  // de perseguirla a 130 m/s (giro máximo ≈ 2,5°/cuadro).
  camara: {
    fov: 50,
    claves: [
      { t: 0.0, pos: [-70, 11, 90], mira: [0, 118, -320] },
      { t: 2.6, pos: [-58, 12, 70], mira: [6, 122, -320] },
      { t: 4.3, pos: [-40, 14, 46], mira: [16, 124, -320] },
      { t: 5.8, pos: [26, 18, -16], mira: [120, 128, -290] },
      { t: 7.0, pos: [100, 16, -84], mira: [168, 90, -230] },
      { t: 7.7, pos: [135, 12, -112], mira: [174, 25, -165] },
      { t: 8.1, pos: [149, 9, -123], mira: [177, 0, -150] }, // la cabeza toca el agua
      { t: 8.85, pos: [172, 0, -138], mira: [182, -7, -150] }, // cruce de la superficie
      { t: 9.5, pos: [186, -9, -142], mira: [195, -15, -149] },
      { t: 10.2, pos: [199, -15, -141], mira: [207, -18.5, -148] },
      { t: 10.9, pos: [207.5, -17.2, -140], mira: [219, -19.6, -145], quieta: true },
      { t: 12.0, pos: [208.3, -17.3, -140.3], mira: [220, -19.6, -145], quieta: true },
    ],
    seguimiento: [
      [5.0, 0],
      [6.0, 0.8],
      [7.25, 0.8],
      [8.0, 0.12],
      [9.0, 0.4],
      [10.0, 0.4],
      [11.0, 0],
    ],
    suavizado: 0.15,
  },

  posproceso: {
    exposicion: 1.0,
    realceSubmarino: 0.3, // +30 % de exposición tras cruzar la superficie
    bloom: { umbral: 1.5, intensidad: 0.5, radio: 0.45 },
    vineta: 0.28,
    grano: 0.016,
  },
};
