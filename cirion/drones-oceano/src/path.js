// Trayectoria maestra compartida por la corriente de drones, la cabeza luminosa, la
// estela, el seguimiento de cámara y el revelado del cable.
// - Geometría: tres Bézier cúbicas con tangente continua (C1) en cada unión:
//   cielo (boca del logo → superficie), descenso submarino (superficie → apoyo) y
//   tendido sobre el lecho. Se remuestrea a paso uniforme de longitud de arco.
// - Orientación: marcos por transporte paralelo precalculados (sin torsiones).
// - Movimiento: velocidad integrada (perfil determinista) → posición por arco s(t).
import * as THREE from "../vendor/three.module.min.js";
import { smoothstep } from "./util.js";

const DS = 0.2; // m entre muestras

function cubic(a, b, c, d, u, out) {
  const q = 1 - u;
  return out
    .copy(a)
    .multiplyScalar(q * q * q)
    .addScaledVector(b, 3 * q * q * u)
    .addScaledVector(c, 3 * q * u * u)
    .addScaledVector(d, u * u * u);
}

export function createTrayectoria({ C, H0, T0, seabedY, radio, tCabeza }) {
  const cfg = C.trayectoria;
  const T = C.tiempos;
  const V3 = (a) => new THREE.Vector3(...a);
  const E = V3(cfg.entrada);
  const tE = V3(cfg.tangenteEntrada).normalize();
  const h = V3(cfg.direccionLecho).normalize();
  const TD = new THREE.Vector3(cfg.apoyo[0], 0, cfg.apoyo[2]);
  TD.y = seabedY(TD.x, TD.z) + radio;
  // tendido: sigue el rumbo con una curvatura leve
  const h2 = h.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), cfg.curvaLecho);
  const FIN = TD.clone()
    .addScaledVector(h, cfg.largoApoyo * 0.5)
    .addScaledVector(h2, cfg.largoApoyo * 0.5);

  const dA = H0.distanceTo(E);
  const segA = [
    H0,
    H0.clone().addScaledVector(T0, dA * 0.38),
    E.clone().addScaledVector(tE, -dA * 0.3),
    E,
  ];
  const dB = E.distanceTo(TD);
  const segB = [
    E,
    E.clone().addScaledVector(tE, dB * 0.32),
    TD.clone().addScaledVector(h, -dB * 0.34),
    TD,
  ];
  const dC = TD.distanceTo(FIN);
  const segC = [
    TD,
    TD.clone().addScaledVector(h, dC * 0.35),
    FIN.clone().addScaledVector(h2, -dC * 0.35),
    FIN,
  ];

  // muestreo denso de cada tramo; el tendido copia el relieve (zona de arena casi plana)
  const densos = [];
  const muestrear = (seg, n, apoyado) => {
    for (let i = densos.length ? 1 : 0; i <= n; i++) {
      const p = cubic(seg[0], seg[1], seg[2], seg[3], i / n, new THREE.Vector3());
      if (apoyado) p.y = seabedY(p.x, p.z) + radio;
      densos.push(p);
    }
  };
  muestrear(segA, 6000, false);
  const iE = densos.length - 1;
  muestrear(segB, 3000, false);
  const iTD = densos.length - 1;
  muestrear(segC, 3000, true);
  const arcD = new Float64Array(densos.length);
  for (let i = 1; i < densos.length; i++)
    arcD[i] = arcD[i - 1] + densos[i].distanceTo(densos[i - 1]);
  const largo = arcD[arcD.length - 1];
  const sE = arcD[iE];
  const sTD = arcD[iTD];

  // remuestreo uniforme por longitud de arco
  const n = Math.floor(largo / DS) + 1;
  const pos = new Float32Array(n * 3);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = k * DS;
    while (j < arcD.length - 2 && arcD[j + 1] < s) j++;
    const f = (s - arcD[j]) / (arcD[j + 1] - arcD[j] || 1);
    const a = densos[j];
    const b = densos[j + 1];
    pos[k * 3] = a.x + (b.x - a.x) * f;
    pos[k * 3 + 1] = a.y + (b.y - a.y) * f;
    pos[k * 3 + 2] = a.z + (b.z - a.z) * f;
  }
  // tangentes y marcos por transporte paralelo
  const tan = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const bin = new Float32Array(n * 3);
  const t = new THREE.Vector3();
  const nn = new THREE.Vector3();
  const bb = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 1);
    const b = Math.min(n - 1, k + 1);
    t.set(
      pos[b * 3] - pos[a * 3],
      pos[b * 3 + 1] - pos[a * 3 + 1],
      pos[b * 3 + 2] - pos[a * 3 + 2],
    ).normalize();
    if (k === 0) {
      nn.set(0, 1, 0).addScaledVector(t, -t.y).normalize();
    } else {
      nn.addScaledVector(t, -nn.dot(t)).normalize();
    }
    bb.crossVectors(t, nn).normalize();
    t.toArray(tan, k * 3);
    nn.toArray(nor, k * 3);
    bb.toArray(bin, k * 3);
  }
  const leer = (arr, s, out) => {
    const x = Math.min(Math.max(s / DS, 0), n - 1.001);
    const k = Math.floor(x);
    const f = x - k;
    return out.set(
      arr[k * 3] + (arr[k * 3 + 3] - arr[k * 3]) * f,
      arr[k * 3 + 1] + (arr[k * 3 + 4] - arr[k * 3 + 1]) * f,
      arr[k * 3 + 2] + (arr[k * 3 + 5] - arr[k * 3 + 2]) * f,
    );
  };
  const P = (s, out) => leer(pos, s, out);
  const Tg = (s, out) => leer(tan, s, out).normalize();
  const Nm = (s, out) => leer(nor, s, out).normalize();
  const Bn = (s, out) => leer(bin, s, out).normalize();

  // ---- perfil de velocidad de la cabeza
  // cielo: nace en la boca casi quieta y acelera de forma continua (ley de potencia, sin
  // escalones) hasta tocar el agua en tAgua; la potencia reparte la aceleración para que la
  // velocidad de llegada no sea extrema. Agua: el medio la frena (decaimiento exponencial)
  // hasta una velocidad de crucero que la deja tocando el lecho en T.llegadaFondo; después
  // sigue tendiendo el cable.
  const tAgua = T.picada[1];
  const D1 = tAgua - tCabeza;
  const pot = cfg.potencia;
  const v0 = cfg.velocidadInicial;
  const vE = v0 + (pot + 1) * (sE / D1 - v0);
  const tau = cfg.tauFrenado;
  const D = T.llegadaFondo - tAgua;
  const kk = tau * (1 - Math.exp(-D / tau));
  const vc = (sTD - sE - vE * kk) / (D - kk);
  const vel = (x) => {
    if (x <= tCabeza) return 0;
    if (x <= tAgua) return v0 + (vE - v0) * ((x - tCabeza) / D1) ** pot;
    // en el lecho: tras apoyarse, la cabeza se aleja tendiendo el cable y se pierde en la
    // penumbra del fondo (el cable queda en reposo detrás)
    const aleja = (cfg.velocidadFinal - vc) * smoothstep(T.llegadaFondo, T.llegadaFondo + 0.9, x);
    return vc + (vE - vc) * Math.exp(-(x - tAgua) / tau) + aleja;
  };
  const dt = 1 / 2400;
  const t1 = C.duracion + 0.5;
  const nT = Math.ceil((t1 - tCabeza) / dt) + 1;
  const tabla = new Float64Array(nT);
  for (let i = 1; i < nT; i++) {
    const x = tCabeza + (i - 0.5) * dt;
    tabla[i] = tabla[i - 1] + vel(x) * dt;
  }
  // corrección final para que la cabeza toque el agua exactamente en tAgua
  const iAgua = Math.round((tAgua - tCabeza) / dt);
  const viejo = tabla[iAgua];
  const corr = sE / viejo;
  for (let i = 0; i < nT; i++) tabla[i] = i <= iAgua ? tabla[i] * corr : tabla[i] + sE - viejo;
  const sHead = (x) => {
    if (x <= tCabeza) return 0;
    const f = (x - tCabeza) / dt;
    const i = Math.min(Math.floor(f), nT - 2);
    return Math.min(largo, tabla[i] + (tabla[i + 1] - tabla[i]) * (f - i));
  };
  const vHead = (x) => (sHead(x + 0.002) - sHead(x - 0.002)) / 0.004;

  return { P, Tg, Nm, Bn, largo, sE, sTD, E, TD, FIN, sHead, vHead, vE, vc, tCabeza };
}
