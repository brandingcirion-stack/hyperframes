// Cirion · Conexión entre ciudades — escena Three.js controlada por tiempo.
// Cada cuadro se calcula solo a partir de `t` (evento hf-seek de HyperFrames):
// sin reloj del navegador, sin requestAnimationFrame y con semilla fija.
import * as THREE from "../vendor/three.module.min.js";
import { createCable, createTroncal } from "./cable.js";
import { createCity } from "./city.js";
import { CONFIG } from "./config.js";
import { COMMON } from "./glsl.js";
import { LOGO } from "./logo-data.js";
import { sampleLogo } from "./logo-sampler.js";
import { createPost } from "./post.js";
import {
  clamp,
  easeOutCubic,
  lerp,
  makeNoise2D,
  makeTimeSpline,
  mulberry32,
  smootherstep,
  smoothstep,
} from "./util.js";

const C = CONFIG;
const T = C.tiempos;
const W = C.base.ancho;
const H = C.base.alto;
const DPR = window.devicePixelRatio || 1; // 1 en el preview; 2 en el master
const DT = 1 / C.fps;

const color = (hex) => new THREE.Color(hex);
const COL = Object.fromEntries(Object.entries(C.colores).map(([k, v]) => [k, color(v)]));
const blancoAzul = color("#DFF4FF");
const V3 = (a) => new THREE.Vector3(...a);

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("escena");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(DPR);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0x000000, 1);
const post = createPost(renderer, { ancho: W, alto: H, dpr: DPR, cfg: C.posproceso, fps: C.fps });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(C.camara.fov, W / H, 0.5, 9000);
const camPrev = camera.clone(); // cámara del cuadro anterior (estelas de velocidad)
const tanHalf = Math.tan(THREE.MathUtils.degToRad(C.camara.fov / 2));

const rtW = Math.round((W * DPR) / 2);
const rtH = Math.round((H * DPR) / 2);
const reflectRT = new THREE.WebGLRenderTarget(rtW, rtH, { type: THREE.HalfFloatType });
const mirrorCam = camera.clone();
mirrorCam.matrixAutoUpdate = false;
mirrorCam.matrixWorldAutoUpdate = false;
mirrorCam.layers.set(1);
const MIRROR = new THREE.Matrix4().makeScale(1, -1, 1);

// ---------------------------------------------------------------- uniforms compartidos
const U = {
  uTime: { value: 0 },
  uDpr: { value: DPR },
  uRes: { value: new THREE.Vector2(W * DPR, H * DPR) },
  uTanHalf: { value: tanHalf },
  uReflectPass: { value: 0 },
  uUnder: { value: 0 },
  uFogDensity: { value: C.agua.niebla },
  uFogTop: { value: COL.azulProfundo.clone().multiplyScalar(0.85) },
  uFogBottom: { value: color("#000308") },
  uFondo: { value: 46 },
  uHaze: { value: COL.bruma },
  uHazeDensity: { value: C.atmosfera.bruma },
  uAzul: { value: COL.azul },
  uMagenta: { value: COL.magenta },
  uHead: { value: new THREE.Vector3() },
  uHeadI: { value: 0 },
  uPulsePos: { value: new THREE.Vector3(0, -999, 0) },
  uPulseI: { value: 0 },
  uPrevVP: { value: new THREE.Matrix4() },
};
const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
};
const quad = new THREE.PlaneGeometry(2, 2);

// ---------------------------------------------------------------- lecho marino
const noise = makeNoise2D(C.semilla + 7);
function profundidad(x) {
  const L = C.lecho;
  if (x <= L[0][0]) return L[0][1];
  for (let i = 1; i < L.length; i++) {
    if (x <= L[i][0]) {
      const s = (x - L[i - 1][0]) / (L[i][0] - L[i - 1][0]);
      return lerp(L[i - 1][1], L[i][1], s * s * (3 - 2 * s));
    }
  }
  return L[L.length - 1][1];
}
const J = (() => {
  const [x, z] = C.troncal.puntos[C.troncal.union];
  return { x, z };
})();
// Relieve a gran escala (el detalle fino lo pone el shader); se aplana en el empalme.
function relieve(x, z) {
  let h = 2.4 * noise(x * 0.032, z * 0.032) + 1.1 * noise(x * 0.09 + 13, z * 0.09 - 7);
  const r = noise(x * 0.07 - 20, z * 0.07 + 31);
  h += Math.max(0, r - 0.35) * 5.5;
  const dJ = Math.hypot(x - J.x, z - J.z);
  h *= 0.15 + 0.85 * smoothstep(10, 34, dJ);
  return h * smoothstep(1, 14, profundidad(x));
}
const seabedY = (x, z) => -profundidad(x) + relieve(x, z);

// ---------------------------------------------------------------- logo 3D (show de drones)
const claves = C.camara.claves;
const C0 = V3(claves[0].pos);
const K = V3(C.logo.centro);
const lFront = new THREE.Vector3(C0.x - K.x, 0, C0.z - K.z)
  .normalize()
  .applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(C.logo.giro));
const lUp = new THREE.Vector3(0, 1, 0);
const lRight = new THREE.Vector3().crossVectors(lFront.clone().negate(), lUp).normalize();
const Kc = K.clone().addScaledVector(lFront, -C.logo.profundidad / 2); // centro del volumen

// ---------------------------------------------------------------- troncal y empalme
const RT = C.troncal.diametro / 2;
const troncalPts = (() => {
  const ctrl = C.troncal.puntos.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curva = new THREE.CatmullRomCurve3(ctrl, false, "centripetal");
  const largo = curva.getLength();
  const n = Math.ceil(largo / 1.0);
  const pts = curva.getSpacedPoints(n).map((p) => {
    p.y = seabedY(p.x, p.z) + RT;
    return p;
  });
  // en la costa de la ciudad B sube por el muro hasta la estación de amarre
  const fin = pts[pts.length - 1];
  const am = V3(C.ciudadB.amarre);
  const tramo = [
    [fin.x + 4, -0.4, fin.z],
    [fin.x + 7.2, 1.2, fin.z],
    [fin.x + 9.5, am.y, fin.z],
    [am.x - 2, am.y, am.z],
  ];
  for (const [x, y, z] of tramo) {
    const a = pts[pts.length - 1];
    const b = new THREE.Vector3(x, y, z);
    const k = Math.max(1, Math.ceil(a.distanceTo(b) / 0.6));
    for (let i = 1; i <= k; i++) pts.push(a.clone().lerp(b, i / k));
  }
  return pts;
})();
const troncal = createTroncal({ U, C, scene, puntos: troncalPts });
// posición del empalme sobre el troncal
let sJ = 0;
{
  let best = 1e9;
  let acc = 0;
  troncalPts.forEach((p, i) => {
    if (i) acc += p.distanceTo(troncalPts[i - 1]);
    const d = Math.hypot(p.x - J.x, p.z - J.z);
    if (d < best) {
      best = d;
      sJ = acc;
    }
  });
}
const Jp = troncal.puntoEn(sJ, new THREE.Vector3());
const tJ = troncal
  .puntoEn(sJ + 1, new THREE.Vector3())
  .sub(troncal.puntoEn(sJ - 1, new THREE.Vector3()))
  .normalize();
const E = V3(C.cable.entrada);
// el puerto de derivación mira hacia donde llega el cable nuevo
const ladoJ = new THREE.Vector3().crossVectors(tJ, new THREE.Vector3(0, 1, 0)).normalize();
if (ladoJ.dot(new THREE.Vector3(E.x - Jp.x, 0, E.z - Jp.z)) < 0) ladoJ.negate();
const puerto = Jp.clone()
  .addScaledVector(ladoJ, 1.1)
  .add(new THREE.Vector3(0, 0.25, 0));

// pulso de datos por el troncal: velocidad creciente, llega a la estación en T.conexion
const pulsoTabla = (() => {
  const [vA, vB] = C.troncal.velocidadPulso;
  const n = 2000;
  const ts = [];
  const ss = [];
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const t = T.viaje[0] + ((T.conexion - T.viaje[0]) * i) / n;
    const v =
      lerp(8, vA, smoothstep(T.viaje[0], T.viaje[0] + 0.6, t)) +
      (vB - vA) * smoothstep(T.viaje[0] + 0.8, T.viaje[0] + 2.2, t);
    if (i) s += v * ((T.conexion - T.viaje[0]) / n);
    ts.push(t);
    ss.push(s);
  }
  const escala = (troncal.largo - sJ - 2) / s;
  return { ts, ss: ss.map((x) => x * escala) };
})();
function pulsoS(t) {
  if (t <= T.viaje[0]) return sJ;
  if (t >= T.conexion) return troncal.largo;
  const { ts, ss } = pulsoTabla;
  const f = ((t - ts[0]) / (ts[ts.length - 1] - ts[0])) * (ts.length - 1);
  const i = Math.floor(f);
  return sJ + ss[i] + (ss[Math.min(i + 1, ss.length - 1)] - ss[i]) * (f - i);
}

// ---------------------------------------------------------------- recorrido del extremo del cable nuevo
const O = V3(C.cable.origen);
const CtrlUp = V3(C.cable.controlSubida);
const CtrlSky = V3(C.cable.controlPicada);
const R_CABLE = C.cable.diametro / 2;
const dirSky = E.clone().sub(CtrlSky).normalize();
const W1 = E.clone().addScaledVector(dirSky, 14);
W1.y = Math.min(W1.y, -8);
const W2 = puerto
  .clone()
  .addScaledVector(ladoJ, 16)
  .add(new THREE.Vector3(0, 2.5, 0));
const fin = Jp.clone()
  .addScaledVector(ladoJ, 0.3)
  .add(new THREE.Vector3(0, 0.2, 0)); // dentro de la carcasa

function bezier2(a, b, c, p, out) {
  const q = 1 - p;
  return out
    .copy(a)
    .multiplyScalar(q * q)
    .addScaledVector(b, 2 * p * q)
    .addScaledVector(c, p * p);
}
function bezier3(a, b, c, d, p, out) {
  const q = 1 - p;
  return out
    .copy(a)
    .multiplyScalar(q * q * q)
    .addScaledVector(b, 3 * q * q * p)
    .addScaledVector(c, 3 * q * p * p)
    .addScaledVector(d, p * p * p);
}
function headAt(t, out) {
  const [s0, s1] = T.cableSube;
  const [d0, d1] = T.picada;
  if (t <= s0) return out.copy(O);
  if (t <= s1) return bezier2(O, CtrlUp, Kc, smootherstep((t - s0) / (s1 - s0)), out);
  if (t <= d0) return out.copy(Kc);
  if (t <= d1) {
    const s = (t - d0) / (d1 - d0);
    return bezier2(Kc, CtrlSky, E, s ** 1.7, out);
  }
  if (t <= T.llegadaUnion) {
    const s = (t - d1) / (T.llegadaUnion - d1);
    bezier3(E, W1, W2, puerto, 1 - (1 - s) ** 1.7, out);
    out.y = Math.max(out.y, seabedY(out.x, out.z) + R_CABLE);
    return out;
  }
  const s = smoothstep(T.llegadaUnion, T.llegadaUnion + 0.35, t);
  return out.copy(puerto).lerp(fin, s);
}
const cable = createCable({ U, C, scene, headAt, t0: T.cableSube[0], t1: T.llegadaUnion + 0.4 });

// ---------------------------------------------------------------- cámara
const camSpline = makeTimeSpline(claves);
const miraSpline = makeTimeSpline(claves.map((k) => ({ t: k.t, pos: k.mira, quieta: k.quieta })));
const ventana = ([a, b, c, d], t) => smoothstep(a, b, t) * (1 - smoothstep(c, d, t));
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _look = new THREE.Vector3();
const _seg = new THREE.Vector3();
function cameraAt(t, cam) {
  camSpline(t, cam.position);
  miraSpline(t, _look);
  // seguimiento del extremo del cable
  const w1 = ventana(C.camara.sigueCable, t);
  if (w1 > 0) {
    headAt(Math.max(0, t - C.camara.sigueCableRetraso), _a);
    _look.lerp(_a, w1);
  }
  // recorrido: la cámara va detrás del pulso de datos, a media altura, y mira adelante
  const w2 = ventana(C.camara.siguePulso, t);
  if (w2 > 0) {
    const s = pulsoS(t);
    troncal.puntoEn(s - 26, _seg);
    troncal.puntoEn(s - 25, _b);
    const tg = _b.sub(_seg).normalize();
    const lat = new THREE.Vector3(-tg.z, 0, tg.x);
    _a.copy(_seg)
      .addScaledVector(lat, 7)
      .add(new THREE.Vector3(0, 8, 0));
    _a.y = Math.min(_a.y, -1.8);
    cam.position.lerp(_a, w2);
    troncal.puntoEn(s + 22, _b);
    _b.y += 1.5;
    _look.lerp(_b, w2);
  }
  cam.lookAt(_look);
  cam.updateMatrixWorld();
}

// ---------------------------------------------------------------- ciudades
const ciudadA = createCity({
  U,
  C,
  scene,
  cfg: C.ciudadA,
  variante: "calida",
  posicion: [0, 0, 0],
  giro: 0,
  extras: {
    zonaLibre: { x: K.x, rx: C.logo.ancho * 0.75, zMin: K.z - 180, hMax: 120 },
    reservado: [
      [O.x, O.z],
      [-450, -530],
    ],
    torres: [{ x: O.x, z: O.z, lado: 34, alto: O.y - 4 }],
    patrimonio: [-450, -530],
  },
});
const B = C.ciudadB;
const ciudadB = createCity({
  U,
  C,
  scene,
  cfg: { ...B, costa: 0 },
  variante: "tecnologica",
  posicion: [B.costaMundo, 0, 0],
  giro: -Math.PI / 2, // la tierra local (−z) queda hacia +x en el mundo
  despertar: [B.amarre[0], B.amarre[2], 0, 1],
  extras: { reservado: [[B.amarre[0] + 10, B.amarre[2]]] },
});
const unaCara = [...ciudadA.unaCara, ...ciudadB.unaCara];

// estación de amarre (ciudad B): volumen bajo con franja LED que se enciende al llegar el pulso
const estacionMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uOn: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec3 vWorld, vN;
    void main() {
      vN = normal;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    ${COMMON}
    uniform float uOn;
    uniform vec3 uAzul;
    varying vec3 vWorld, vN;
    void main() {
      vec3 col = vec3(0.012, 0.013, 0.016) + uHaze * 0.3;
      float franja = smoothstep(0.35, 0.0, abs(vWorld.y - 7.0)) * step(abs(vN.y), 0.5);
      float puerta = step(abs(vWorld.z - ${B.amarre[2].toFixed(1)}), 3.0) * step(vWorld.y, 5.0) * step(vN.x, -0.5);
      col += uAzul * (franja * (0.25 + 2.5 * uOn) + puerta * 1.6 * uOn);
      gl_FragColor = vec4(atmos(col, vWorld), 1.0);
    }
  `,
});
unaCara.push(estacionMat);
const estacion = new THREE.Mesh(new THREE.BoxGeometry(22, 9, 44), estacionMat);
estacion.position.set(B.amarre[0] + 10, 4.5 + 0.4, B.amarre[2]);
estacion.layers.enable(1);
scene.add(estacion);

// ---------------------------------------------------------------- drones (logo 3D desde el centro)
const rnd = mulberry32(C.semilla);
const muestras = sampleLogo(LOGO, { ...C.logo, semilla: C.semilla });
const [vbx, vby, vbw, vbh] = LOGO.viewBox;
const escalaLogo = C.logo.ancho / vbw;
const targets = [];
const capas = C.logo.capasProfundidad;
for (const m of muestras) {
  const u = (m.x - (vbx + vbw / 2)) * escalaLogo;
  const v = -(m.y - (vby + vbh / 2)) * escalaLogo;
  const c = m.role === "simbolo" ? color(m.fill) : COL.letrasLogo;
  const niveles = m.borde ? capas + 1 : 1;
  for (let k = 0; k < niveles; k++) {
    const prof = (C.logo.profundidad * k) / capas;
    const p = K.clone()
      .addScaledVector(lRight, u)
      .addScaledVector(lUp, v)
      .addScaledVector(lFront, -prof);
    targets.push({ i: targets.length, u, v, prof, p, c, capa: k });
  }
}
const N = targets.length;
const maxDist = Math.max(...targets.map((tg) => Math.hypot(tg.u, tg.v)));
const droneGeo = new THREE.InstancedBufferGeometry();
droneGeo.index = quad.index;
droneGeo.setAttribute("position", quad.getAttribute("position"));
const aStart = new Float32Array(N * 3);
const aTarget = new Float32Array(N * 3);
const aColor = new Float32Array(N * 3);
const aForm = new Float32Array(N * 4);
const aConv = new Float32Array(N * 4);
const [f0, f1] = T.formacion;
const [c0, c1] = T.salidaConvergencia;
const [dcMin, dcMax] = T.duracionConvergencia;
const brilloCapas = C.particulas.brilloCapas;
for (const tg of targets) {
  const i = tg.i;
  // nace junto al centro del logo y vuela hacia afuera: el logo crece del centro al borde
  const d = Math.hypot(tg.u, tg.v) / maxDist;
  const ini = Kc.clone()
    .addScaledVector(lRight, tg.u * 0.16 + (rnd() - 0.5) * 3)
    .addScaledVector(lUp, tg.v * 0.16 + (rnd() - 0.5) * 3)
    .addScaledVector(lFront, (rnd() - 0.5) * 6);
  ini.toArray(aStart, i * 3);
  tg.p.toArray(aTarget, i * 3);
  tg.c.toArray(aColor, i * 3);
  const dur = 0.75 + 0.85 * d + rnd() * 0.08;
  const salida = f0 + Math.min(f1 - f0 - dur, 1.25 * d ** 0.85 + tg.capa * 0.05 + rnd() * 0.06);
  aForm.set([salida, salida, dur, 14 * (0.6 + 0.4 * rnd())], i * 4);
  const durC = lerp(dcMin, dcMax, rnd());
  const salidaC = c0 + ((1 - d) * 0.85 + rnd() * 0.15) * (c1 - c0);
  aConv.set([salidaC, durC, rnd(), brilloCapas[Math.min(tg.capa, brilloCapas.length - 1)]], i * 4);
}
droneGeo.setAttribute("aStart", new THREE.InstancedBufferAttribute(aStart, 3));
droneGeo.setAttribute("aTarget", new THREE.InstancedBufferAttribute(aTarget, 3));
droneGeo.setAttribute("aColor", new THREE.InstancedBufferAttribute(aColor, 3));
droneGeo.setAttribute("aForm", new THREE.InstancedBufferAttribute(aForm, 4));
droneGeo.setAttribute("aConv", new THREE.InstancedBufferAttribute(aConv, 4));
droneGeo.instanceCount = N;
const droneMat = new THREE.ShaderMaterial({
  ...additive,
  uniforms: {
    ...U,
    uK: { value: Kc },
    uRight: { value: lRight },
    uUp: { value: lUp },
    uFront: { value: lFront },
    uSwirl: { value: C.particulas.giroConvergencia },
    uSize: { value: C.particulas.tamano },
    uHalo: { value: C.particulas.halo },
    uI: { value: C.particulas.intensidad },
    uHaloI: { value: C.particulas.intensidadHalo },
    uStreakMax: { value: C.particulas.estelaMax },
    uCoreColor: { value: COL.azul.clone().multiplyScalar(1.1) },
    uRefDist: { value: 600 },
  },
  vertexShader: /* glsl */ `
    ${COMMON}
    attribute vec3 aStart, aTarget, aColor;
    attribute vec4 aForm, aConv;
    uniform vec3 uK, uRight, uUp, uFront, uCoreColor;
    uniform float uSwirl, uSize, uHalo, uStreakMax, uRefDist;
    varying vec2 vLocal;
    varying float vHalfLen, vSize, vHalo, vAlpha;
    varying vec3 vColor;

    float smoother(float t) { t = clamp(t, 0.0, 1.0); return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

    vec3 posAt(float t, out float alpha, out float q) {
      float s = clamp((t - aForm.y) / aForm.z, 0.0, 1.0);
      float p = smoother(s);
      vec3 P = mix(aStart, aTarget, p);
      // leve abombamiento hacia el espectador: el logo «florece» en volumen
      P += uFront * aForm.w * sin(3.14159265 * p);
      vec3 hover = (uUp * sin(t * 1.1 + aConv.z * 40.0) + uRight * cos(t * 0.9 + aConv.z * 23.0))
                 * 0.18 * smoothstep(2.8, 3.6, t);
      float sc = clamp((t - aConv.x) / aConv.y, 0.0, 1.0);
      q = 1.0 - cos(1.5707963 * sc);
      if (sc > 0.0) {
        vec3 r0 = aTarget - uK;
        float u = dot(r0, uRight);
        float v = dot(r0, uUp);
        float w = dot(r0, uFront);
        float a = uSwirl * q;
        vec2 rr = vec2(u * cos(a) - v * sin(a), u * sin(a) + v * cos(a)) * (1.0 - q);
        P = uK + uRight * rr.x + uUp * rr.y + uFront * (w * (1.0 - q) + sin(3.14159265 * q) * 10.0);
      }
      P += hover * (1.0 - q);
      // se enciende al despegar del centro
      // cada dron se enciende a medida que se separa del centro: el logo se abre hacia afuera
      alpha = smoothstep(0.08, 0.5, p) * (1.0 - smoothstep(0.82, 1.0, sc));
      return P;
    }

    void main() {
      float a, q, a0, q0;
      vec3 P = posAt(uTime, a, q);
      vec3 P0 = posAt(uTime - 1.0 / 30.0, a0, q0);
      vec4 c = projectionMatrix * viewMatrix * vec4(P, 1.0);
      vec4 cPrev = projectionMatrix * viewMatrix * vec4(P0, 1.0);
      vec2 sp = c.xy / c.w * 0.5 * uRes;
      vec2 spPrev = cPrev.xy / cPrev.w * 0.5 * uRes;
      vec2 vel = sp - spPrev;
      float speed = length(vel);
      vec2 dir = speed > 1e-3 ? vel / speed : vec2(1.0, 0.0);
      vec2 perp = vec2(-dir.y, dir.x);
      float persp = clamp(uRefDist / distance(P, cameraPosition), 0.6, 2.2);
      float size = uSize * uDpr * persp;
      float halo = uHalo * uDpr * persp;
      float L = min(speed * 0.5, uStreakMax * uDpr * 0.5);
      float R = halo * 2.4;
      vec2 corner = position.xy;
      vLocal = vec2(corner.x * (L + R), corner.y * R);
      vHalfLen = L;
      vSize = size;
      vHalo = halo;
      gl_Position = c;
      gl_Position.xy += (dir * corner.x * (L + R) + perp * corner.y * R) / (0.5 * uRes) * c.w;
      vColor = mix(aColor, uCoreColor, smoothstep(0.3, 0.9, q) * 0.85);
      float capa = mix(aConv.w, 1.0, smoothstep(0.2, 0.8, q));
      vAlpha = a * capa * sqrt(size / (size + L)) * pow(1.0 - q, 1.5) * atmosLight(P) * (c.w > 0.0 ? 1.0 : 0.0);
    }
  `,
  fragmentShader: /* glsl */ `
    ${COMMON}
    uniform float uI, uHaloI;
    varying vec2 vLocal;
    varying float vHalfLen, vSize, vHalo, vAlpha;
    varying vec3 vColor;
    void main() {
      float dx = max(abs(vLocal.x) - vHalfLen, 0.0);
      float d2 = dx * dx + vLocal.y * vLocal.y;
      float core = exp(-d2 / (vSize * vSize));
      float halo = exp(-d2 / (vHalo * vHalo));
      gl_FragColor = vec4(vColor * (core + halo * uHaloI) * uI * vAlpha, 1.0);
    }
  `,
});
const drones = new THREE.Mesh(droneGeo, droneMat);
drones.frustumCulled = false;
drones.layers.enable(1);
drones.renderOrder = 5;
scene.add(drones);

// ---------------------------------------------------------------- punta luminosa del cable / núcleo
const puntaMat = new THREE.ShaderMaterial({
  ...additive,
  uniforms: {
    ...U,
    uPos: { value: new THREE.Vector3() },
    uCorePx: { value: 1.6 },
    uHaloPx: { value: C.nucleo.radio },
    uScatterM: { value: 0 },
    uScatterI: { value: 0 },
    uAnillos: { value: new THREE.Vector4() },
    uI: { value: 0 },
    uColCore: { value: blancoAzul },
  },
  vertexShader: /* glsl */ `
    ${COMMON}
    uniform vec3 uPos;
    uniform float uCorePx, uHaloPx, uScatterM;
    varying vec2 vLocal;
    varying float vCore, vHalo, vScatter, vLuz;
    void main() {
      vec4 c = projectionMatrix * viewMatrix * vec4(uPos, 1.0);
      float dist = distance(uPos, cameraPosition);
      float pxPerM = uRes.y / (2.0 * dist * uTanHalf);
      float persp = clamp(80.0 / dist, 1.0, 2.4);
      vCore = uCorePx * uDpr * persp;
      vHalo = uHaloPx * uDpr * persp;
      vScatter = max(uScatterM * pxPerM, 1.0);
      float R = min(max(max(vHalo * 3.0, vScatter * 2.6), 60.0 * uDpr), uRes.y * 0.9);
      vLocal = position.xy * R;
      vLuz = atmosLight(uPos);
      gl_Position = c;
      gl_Position.xy += position.xy * R / (0.5 * uRes) * c.w;
      if (c.w <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      if (uReflectPass > 0.5 && uPos.y < 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    ${COMMON}
    uniform float uI, uScatterM, uScatterI;
    uniform vec4 uAnillos;
    uniform vec3 uColCore, uAzul, uMagenta;
    varying vec2 vLocal;
    varying float vCore, vHalo, vScatter, vLuz;
    void main() {
      float d2 = dot(vLocal, vLocal);
      float d = sqrt(d2);
      float core = exp(-d2 / (vCore * vCore));
      float halo = exp(-d2 / (vHalo * vHalo));
      float scatter = uScatterM > 0.0 ? exp(-d2 / (vScatter * vScatter)) : 0.0;
      float w = max(vHalo * 0.35, 1.5 * uDpr);
      float an1 = exp(-pow((d - uAnillos.x * uDpr) / w, 2.0)) * uAnillos.y;
      float an2 = exp(-pow((d - uAnillos.z * uDpr) / w, 2.0)) * uAnillos.w;
      vec3 col = uColCore * core * 6.0 + uAzul * halo * 1.4 + uAzul * scatter * uScatterI
               + uAzul * an1 * 1.0 + uMagenta * an2 * 0.45;
      gl_FragColor = vec4(col * uI * vLuz, 1.0);
    }
  `,
});
const punta = new THREE.Mesh(quad, puntaMat);
punta.frustumCulled = false;
punta.layers.enable(1);
punta.renderOrder = 8;
scene.add(punta);

function updatePunta(t) {
  const u = puntaMat.uniforms;
  headAt(t, u.uPos.value);
  // el cable asoma de la torre de datos; al tocar el logo los drones fluyen hacia el
  // punto de contacto y el núcleo se carga antes de la picada
  const crece = smoothstep(T.contacto, T.compresion[0], t);
  const comp = smootherstep((t - T.compresion[0]) / (T.compresion[1] - T.compresion[0]));
  const cargado = (0.9 + 1.1 * crece) * (1 + 0.45 * comp);
  let I = 0.9 * smoothstep(T.cableSube[0] - 0.15, T.cableSube[0] + 0.25, t);
  let halo = C.cable.puntaHalo;
  const core = 1.8;
  if (t >= T.contacto && t < T.picada[0]) {
    I = cargado;
    halo = lerp(
      lerp(halo, C.nucleo.radio, smoothstep(T.contacto, T.contacto + 0.3, t)),
      C.nucleo.radioComprimido,
      comp,
    );
  } else if (t >= T.picada[0]) {
    const k = smoothstep(T.picada[0], T.picada[0] + 0.4, t);
    I = lerp(cargado, 1.5, k);
    halo = lerp(C.nucleo.radioComprimido, C.cable.puntaHalo, k);
  }
  const bruma = crece * (1 - smoothstep(T.picada[0], T.picada[0] + 0.35, t)) * lerp(1, 0.7, comp);
  const agua = smoothstep(T.picada[1], T.picada[1] + 0.4, t);
  u.uScatterM.value = C.nucleo.brumaM * bruma + 2.2 * agua;
  u.uScatterI.value = 0.9 * bruma + 0.35 * agua;
  const anillo = (a0, dur) => {
    const s = (t - a0) / dur;
    if (s <= 0 || s >= 1) return [0, 0];
    return [lerp(46, 2, smootherstep(s)), Math.sin(Math.PI * s) * smoothstep(0, 0.2, s)];
  };
  const [r1, i1] = anillo(T.contacto + 0.2, 0.6);
  const [r2, i2] = anillo(T.contacto + 0.45, 0.5);
  u.uAnillos.value.set(r1, i1, r2, i2);
  // al empalmar, la punta entra en la carcasa y su luz pasa al empalme
  I *= 1 - smoothstep(T.llegadaUnion, T.llegadaUnion + 0.5, t);
  u.uI.value = I * (C.nucleo.intensidad / 6);
  u.uHaloPx.value = halo;
  u.uCorePx.value = core;
  U.uHead.value.copy(u.uPos.value);
  U.uHeadI.value = t > T.cableSube[0] ? I : 0;
  punta.visible = I > 0.001;
}

// ---------------------------------------------------------------- unidad de derivación (empalme)
const empalmeMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uOn: { value: 0 }, uCentro: { value: Jp }, uEje: { value: tJ } },
  vertexShader: /* glsl */ `
    varying vec3 vWorld, vN;
    void main() {
      vN = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    ${COMMON}
    uniform float uOn, uHeadI, uPulseI;
    uniform vec3 uCentro, uEje, uAzul, uHead, uPulsePos;
    varying vec3 vWorld, vN;
    void main() {
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vWorld);
      float x = dot(vWorld - uCentro, uEje);
      vec3 L = uHead - vWorld;
      float d2 = dot(L, L);
      vec3 Ln = L * inversesqrt(max(d2, 1e-4));
      float att = uHeadI * 2.5 / (1.0 + d2 / 30.0) + uOn * 1.2;
      float spec = pow(max(dot(N, normalize(Ln + V)), 0.0), 60.0);
      vec3 metal = vec3(0.05, 0.055, 0.06);
      vec3 col = metal * (uFogTop * 2.0 + att * max(dot(N, Ln), 0.0)) + mix(vec3(1.0), uAzul, 0.4) * spec * att * 0.6;
      // juntas de la carcasa: se encienden al conectar
      float junta = smoothstep(0.05, 0.0, abs(fract(x / 2.6) - 0.5) - 0.46);
      col += uAzul * junta * uOn * 2.0;
      col += uAzul * pow(1.0 - max(dot(N, V), 0.0), 4.0) * uOn * 0.12;
      gl_FragColor = vec4(atmos(col, vWorld), 1.0);
    }
  `,
});
{
  const g = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 7.5, 28), empalmeMat);
  const cono1 = new THREE.Mesh(new THREE.CylinderGeometry(RT * 1.05, 1.5, 2.2, 28), empalmeMat);
  const cono2 = cono1.clone();
  cono1.position.y = 4.85;
  cono2.position.y = -4.85;
  cono2.rotation.z = Math.PI;
  const manga = new THREE.Mesh(
    new THREE.CylinderGeometry(R_CABLE * 1.25, 1.0, 2.4, 24),
    empalmeMat,
  );
  g.add(cuerpo, cono1, cono2);
  g.position.copy(Jp);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tJ);
  scene.add(g);
  // manga del puerto de derivación, orientada hacia el cable que llega
  manga.position
    .copy(Jp)
    .addScaledVector(ladoJ, 1.6)
    .add(new THREE.Vector3(0, 0.2, 0));
  manga.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ladoJ);
  scene.add(manga);
}

// ---------------------------------------------------------------- cielo / fondo submarino
const domo = new THREE.Mesh(
  new THREE.SphereGeometry(7000, 64, 32),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { ...U, uNubes: { value: C.atmosfera.nubes } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform float uNubes;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float el = d.y;
        vec3 sky = uHaze * (0.12 + 2.6 * exp(-max(el, 0.0) * 8.0));
        if (el > 0.0) {
          vec2 cp = d.xz / (el + 0.08) * 0.8 + vec2(uTime * 0.012, 0.0);
          float n = fbm(cp * 1.1);
          float nub = smoothstep(0.42, 0.78, n) * smoothstep(0.0, 0.08, el) * (1.0 - smoothstep(0.2, 0.55, el));
          sky += uHaze * nub * uNubes * 5.0 * exp(-el * 5.0);
        }
        float depth = max(-cameraPosition.y, 0.0);
        vec3 abajo = waterColorAt(mix(-depth, -uFondo, 0.5));
        vec3 arriba = waterColorAt(-depth) * (1.0 + 0.5 * smoothstep(0.0, 1.0, d.y));
        vec3 under = mix(abajo, arriba, smoothstep(-0.02, 0.7, d.y));
        gl_FragColor = vec4(mix(sky, under, uUnder), 1.0);
      }
    `,
  }),
);
domo.frustumCulled = false;
domo.renderOrder = -10;
domo.layers.enable(1);
scene.add(domo);

// ---------------------------------------------------------------- superficie del agua
const ring = C.agua.anillo;
const aguaMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: {
    ...U,
    uRefl: { value: reflectRT.texture },
    uEntry: { value: E },
    uEntryT: { value: T.picada[1] },
    uReflI: { value: C.agua.reflejo },
    uDist: { value: C.agua.distorsion },
    uWave: { value: C.agua.oleaje },
    uRing: { value: new THREE.Vector3(ring.velocidad, ring.ancho, ring.duracion) },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    ${COMMON}
    uniform sampler2D uRefl;
    uniform vec3 uEntry, uRing, uAzul, uHead;
    uniform float uEntryT, uReflI, uDist, uWave, uHeadI;
    varying vec3 vWorld;

    vec2 waveGrad(vec2 p, float t) {
      vec2 g = vec2(0.0);
      vec2 d;
      d = normalize(vec2(0.2, 1.0));   g += d * 0.10 * 0.35 * cos(dot(d, p) * 0.35 + t * 0.9);
      d = normalize(vec2(-0.5, 0.85)); g += d * 0.05 * 0.62 * cos(dot(d, p) * 0.62 + t * 1.3);
      d = normalize(vec2(0.8, 0.6));   g += d * 0.025 * 1.1 * cos(dot(d, p) * 1.1 + t * 1.9);
      d = normalize(vec2(-0.9, 0.3));  g += d * 0.012 * 1.9 * cos(dot(d, p) * 1.9 + t * 2.6);
      vec2 q = p * 0.8 + vec2(t * 0.25, -t * 0.4);
      float e = 0.15;
      float n0 = vnoise(q);
      g += vec2(vnoise(q + vec2(e, 0.0)) - n0, vnoise(q + vec2(0.0, e)) - n0) / e * 0.05;
      return g;
    }

    void main() {
      vec3 V = normalize(cameraPosition - vWorld);
      float dist = distance(cameraPosition, vWorld);
      vec2 g = waveGrad(vWorld.xz, uTime) * uWave * mix(1.0, 0.35, smoothstep(150.0, 900.0, dist));
      float te = uTime - uEntryT;
      float dE = distance(vWorld.xz, uEntry.xz);
      float ringR = max(te, 0.0) * uRing.x;
      float ringA = te > 0.0 ? exp(-te / (uRing.z * 0.45)) : 0.0;
      float ringN = (dE - ringR) / uRing.y;
      float ringV = exp(-ringN * ringN) * ringA;
      float ring2 = exp(-pow((dE - ringR * 0.62) / (uRing.y * 0.8), 2.0)) * ringA * 0.5;
      vec2 radial = dE > 1e-3 ? (vWorld.xz - uEntry.xz) / dE : vec2(0.0);
      g += radial * (-ringN * (ringV + ring2)) * 0.35;
      vec3 N = normalize(vec3(-g.x, 1.0, -g.y));

      float flash = te > 0.0 ? (1.0 - exp(-te * 30.0)) * exp(-te / 0.4) : 0.0;
      vec3 luz = uAzul * (flash * exp(-dE * dE / 8.0) * 4.0 + (ringV + ring2) * 1.4);
      float hd = max(-uHead.y, 0.0);
      vec2 dh = vWorld.xz - uHead.xz;
      luz += uAzul * uHeadI * step(0.0, te) * exp(-dot(dh, dh) / (5.0 + hd * hd * 0.6)) * exp(-hd / 5.0) * 1.6;

      vec3 col;
      if (cameraPosition.y >= 0.0) {
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        col = vec3(0.001, 0.0015, 0.003);
        // agua calma: las luces se estiran en largas estelas verticales hacia el espectador
        vec2 uv = gl_FragCoord.xy / uRes;
        vec2 off = g * uDist * 7.0 * vec2(1.0, 1.6);
        vec3 refl = vec3(0.0);
        float sm = 0.005 + 0.012 * smoothstep(40.0, 700.0, dist);
        float wsum = 0.0;
        for (int k = -2; k <= 9; k++) {
          float fk = float(k);
          float jit = (vnoise(vec2(vWorld.x * 0.3, fk * 3.1 + uTime * 0.6)) - 0.5) * 0.003;
          float wk = exp(-pow((fk - 2.0) / 5.0, 2.0));
          refl += texture2D(uRefl, uv + off + vec2(jit, -fk * sm)).rgb * wk;
          wsum += wk;
        }
        refl /= wsum;
        col += refl * uReflI * (0.35 + 0.65 * fres);
        col = mix(col, uHaze * 1.2, hazeAmount(vWorld) * 0.85);
        float cerca = smoothstep(2.6, 0.0, cameraPosition.y);
        col = mix(col, waterColorAt(-1.5), cerca * (1.0 - fres) * 0.9);
        col += luz;
      } else {
        float cosT = -V.y;
        float win = smoothstep(0.6, 0.72, cosT);
        // cerca de la costa iluminada, la superficie se ve más clara desde abajo
        col = mix(uFogTop * 0.75, uFogTop * 1.9 + uHaze * 2.0, win) + luz * 1.2;
        vec3 fogC = mix(waterColorAt(mix(cameraPosition.y, -uFondo, 0.5)), waterColorAt(cameraPosition.y) * 1.2, smoothstep(0.0, 0.7, -V.y));
        col = mix(col, fogC, underFog(vWorld));
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const agua = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), aguaMat);
agua.rotation.x = -Math.PI / 2;
scene.add(agua);

// ---------------------------------------------------------------- lecho: malla que acompaña a la cámara
const PASO = 2.2;
const LADO = 220;
const lechoGeo = new THREE.PlaneGeometry(PASO * LADO, PASO * LADO, LADO, LADO);
lechoGeo.rotateX(-Math.PI / 2);
const lechoBase = Float32Array.from(lechoGeo.getAttribute("position").array);
const pulsoLecho = C.submarino.pulso;
const lechoMat = new THREE.ShaderMaterial({
  uniforms: {
    ...U,
    uJ: { value: Jp },
    uAlbedo: { value: COL.lechoMarino },
    uPulse: { value: new THREE.Vector3(0, 0, pulsoLecho.ancho) },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    varying vec3 vNormal;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vNormal = normal;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    ${COMMON}
    uniform vec3 uJ, uAlbedo, uPulse, uAzul, uHead, uPulsePos;
    uniform float uHeadI, uPulseI;
    varying vec3 vWorld;
    varying vec3 vNormal;
    void main() {
      // ondulaciones de arena y rocas finas por perturbación de normal
      vec2 p = vWorld.xz;
      float e = 0.2;
      // ondulaciones irregulares: amplitud modulada por ruido para que no se vea un rayado
      float am = smoothstep(0.35, 0.8, vnoise(p * 0.04 + 3.0)) * 0.05;
      float h0 = sin(dot(p, vec2(0.55, 0.85)) * 2.6 + vnoise(p * 0.08) * 7.0) * am + vnoise(p * 0.45) * 0.22;
      float hx = sin(dot(p + vec2(e, 0.0), vec2(0.55, 0.85)) * 2.6 + vnoise((p + vec2(e, 0.0)) * 0.08) * 7.0) * am + vnoise((p + vec2(e, 0.0)) * 0.45) * 0.22;
      float hz = sin(dot(p + vec2(0.0, e), vec2(0.55, 0.85)) * 2.6 + vnoise((p + vec2(0.0, e)) * 0.08) * 7.0) * am + vnoise((p + vec2(0.0, e)) * 0.45) * 0.22;
      vec3 N = normalize(normalize(vNormal) + vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * 0.35);
      float grano = 0.85 + 0.3 * vnoise(p * 3.1) * vnoise(p * 0.7 + 9.0);
      vec3 alb = uAlbedo * grano;
      vec3 L = uHead - vWorld;
      float d2 = dot(L, L);
      vec3 col = alb * mix(vec3(1.0), uAzul, 0.45) * uHeadI * 14.0 / (1.0 + d2 / 60.0) * max(dot(N, L * inversesqrt(d2)), 0.0);
      vec3 Lp = uPulsePos - vWorld;
      float dp2 = dot(Lp, Lp);
      col += alb * mix(vec3(1.0), uAzul, 0.6) * uPulseI * 10.0 / (1.0 + dp2 / 50.0) * max(dot(N, Lp * inversesqrt(dp2)), 0.0);
      float dr = distance(vWorld.xz, uJ.xz);
      float anillo = exp(-pow((dr - uPulse.x) / uPulse.z, 2.0)) * uPulse.y;
      col += (alb * 6.0 * (0.35 + 0.65 * max(N.y, 0.0)) + uAzul * 1.5) * uAzul * anillo;
      col += alb * uFogTop * 0.6 * max(N.y, 0.0);
      float f = underFog(vWorld);
      gl_FragColor = vec4(mix(col, waterColorAt(mix(cameraPosition.y, vWorld.y, 0.5)), f), 1.0);
    }
  `,
});
const lecho = new THREE.Mesh(lechoGeo, lechoMat);
lecho.frustumCulled = false;
scene.add(lecho);
function updateLecho() {
  // la malla se reubica en pasos enteros: los vértices caen siempre en los mismos puntos
  const cx = Math.round(camera.position.x / PASO) * PASO;
  const cz = Math.round(camera.position.z / PASO) * PASO;
  const pos = lechoGeo.getAttribute("position");
  const a = pos.array;
  for (let i = 0; i < pos.count; i++) {
    const x = lechoBase[i * 3] + cx;
    const z = lechoBase[i * 3 + 2] + cz;
    a[i * 3] = x;
    a[i * 3 + 1] = seabedY(x, z);
    a[i * 3 + 2] = z;
  }
  pos.needsUpdate = true;
  lechoGeo.computeVertexNormals();
}
function updatePulsoLecho(t) {
  const s = (t - T.pulsoUnion[0]) / (T.pulsoUnion[1] - T.pulsoUnion[0]);
  const v = lechoMat.uniforms.uPulse.value;
  if (s <= 0) return v.set(0, 0, pulsoLecho.ancho);
  v.x = pulsoLecho.radioMax * easeOutCubic(s);
  v.y = (1 - clamp(s)) ** 1.6 * smoothstep(0, 0.05, t - T.pulsoUnion[0]) * 1.4;
  v.z = pulsoLecho.ancho * (1 + 1.5 * clamp(s));
}

// ---------------------------------------------------------------- nieve marina (volumen que envuelve a la cámara)
const rndAgua = mulberry32(C.semilla + 101);
const NSN = C.submarino.nieve;
const nieveGeo = new THREE.InstancedBufferGeometry();
nieveGeo.index = quad.index;
nieveGeo.setAttribute("position", quad.getAttribute("position"));
const nSeed = new Float32Array(NSN * 4);
for (let i = 0; i < NSN; i++) nSeed.set([rndAgua(), rndAgua(), rndAgua(), rndAgua()], i * 4);
nieveGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(nSeed, 4));
nieveGeo.instanceCount = NSN;
const nieve = new THREE.Mesh(
  nieveGeo,
  new THREE.ShaderMaterial({
    ...additive,
    uniforms: { ...U, uCaja: { value: new THREE.Vector3(80, 50, 80) } },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec4 aSeed;
      uniform vec3 uHead, uPulsePos, uCaja;
      uniform float uHeadI, uPulseI;
      uniform mat4 uPrevVP;
      varying vec2 vLocal;
      varying float vB, vR, vL;
      void main() {
        vec3 base = aSeed.xyz * uCaja;
        vec3 deriva = vec3(sin(uTime * 0.25 + aSeed.w * 31.0) * 0.3, uTime * 0.04, cos(uTime * 0.22 + aSeed.w * 11.0) * 0.3);
        vec3 p = cameraPosition + mod(base + deriva - cameraPosition, uCaja) - uCaja * 0.5;
        p.y = min(p.y, -0.3);
        vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0);
        vec4 cp = uPrevVP * vec4(p, 1.0);
        vec2 sp = c.xy / c.w * 0.5 * uRes;
        vec2 spp = cp.xy / cp.w * 0.5 * uRes;
        vec2 vel = sp - spp;
        float speed = length(vel);
        vec2 dir = speed > 1e-3 ? vel / speed : vec2(1.0, 0.0);
        vec2 perp = vec2(-dir.y, dir.x);
        float d = distance(p, cameraPosition);
        float r = clamp((0.03 + 0.03 * aSeed.w) * uRes.y / (2.0 * d * uTanHalf), 0.7 * uDpr, 3.0 * uDpr);
        float L = min(speed * 0.5, 4.0 * uDpr);
        vLocal = vec2(position.x * (L + r * 2.0), position.y * r * 2.0);
        vR = r;
        vL = L;
        vec3 dh = p - uHead;
        vec3 dp = p - uPulsePos;
        float luz = 0.06 + 0.06 * aSeed.w + uHeadI * 4.0 / (1.0 + dot(dh, dh) / 6.0) + uPulseI * 4.0 / (1.0 + dot(dp, dp) / 20.0);
        vB = luz * smoothstep(0.6, 2.2, d) * (1.0 - underFog(p) * 0.8) * uUnder * sqrt(r / (r + L));
        gl_Position = c;
        gl_Position.xy += (dir * position.x * (L + r * 2.0) + perp * position.y * r * 2.0) / (0.5 * uRes) * c.w;
        if (c.w <= 0.0 || cp.w <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAzul;
      varying vec2 vLocal;
      varying float vB, vR, vL;
      void main() {
        float dx = max(abs(vLocal.x) - vL, 0.0);
        float a = exp(-(dx * dx + vLocal.y * vLocal.y) / (vR * vR));
        gl_FragColor = vec4(mix(vec3(0.75, 0.85, 0.95), uAzul, 0.35) * vB * a, 1.0);
      }
    `,
  }),
);
nieve.frustumCulled = false;
nieve.renderOrder = 3;
scene.add(nieve);

// ---------------------------------------------------------------- burbujas del ingreso
const NB = C.agua.burbujas;
const burbGeo = new THREE.InstancedBufferGeometry();
burbGeo.index = quad.index;
burbGeo.setAttribute("position", quad.getAttribute("position"));
const bOrigen = new Float32Array(NB * 3);
const bParam = new Float32Array(NB * 4);
{
  const dirAgua = W1.clone().sub(E).normalize();
  for (let i = 0; i < NB; i++) {
    const prof = 0.6 + rndAgua() * 7;
    const p = E.clone().addScaledVector(dirAgua, prof);
    const a = rndAgua() * Math.PI * 2;
    p.x += Math.cos(a) * (R_CABLE + 0.2 + rndAgua() * 0.6);
    p.z += Math.sin(a) * (R_CABLE + 0.2 + rndAgua() * 0.6);
    p.toArray(bOrigen, i * 3);
    bParam.set(
      [
        T.picada[1] + prof * 0.03 + rndAgua() * 0.15,
        0.04 + rndAgua() ** 2 * 0.1,
        0.9 + rndAgua() * 1.3,
        rndAgua(),
      ],
      i * 4,
    );
  }
}
burbGeo.setAttribute("aOrigen", new THREE.InstancedBufferAttribute(bOrigen, 3));
burbGeo.setAttribute("aParam", new THREE.InstancedBufferAttribute(bParam, 4));
burbGeo.instanceCount = NB;
const burbujas = new THREE.Mesh(
  burbGeo,
  new THREE.ShaderMaterial({
    ...additive,
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec3 aOrigen;
      attribute vec4 aParam;
      uniform vec3 uHead;
      uniform float uHeadI;
      varying vec2 vUv;
      varying float vB;
      void main() {
        float age = uTime - aParam.x;
        vec3 p = aOrigen + vec3(sin(age * 7.0 + aParam.w * 20.0) * 0.06, age * aParam.z, cos(age * 6.0 + aParam.w * 9.0) * 0.06);
        p.y = min(p.y, -0.05);
        float vis = step(0.0, age) * smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(1.6, 2.4, age)) * (1.0 - smoothstep(-0.6, -0.1, p.y));
        vec3 view = normalize(cameraPosition - p);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), view));
        vec3 up = cross(view, right);
        vec3 wp = p + (right * position.x + up * position.y) * aParam.y;
        vUv = position.xy;
        vec3 dh = p - uHead;
        vB = vis * uUnder * (0.8 + uHeadI * 4.0 / (1.0 + dot(dh, dh) / 4.0)) * (1.0 - underFog(p) * 0.7);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAzul;
      varying vec2 vUv;
      varying float vB;
      void main() {
        float r = length(vUv);
        if (r > 1.0) discard;
        float borde = smoothstep(0.62, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r));
        float brillo = exp(-dot(vUv - vec2(-0.35, 0.35), vUv - vec2(-0.35, 0.35)) * 40.0);
        gl_FragColor = vec4(mix(vec3(0.8, 0.92, 1.0), uAzul, 0.4) * (borde * 0.6 + brillo * 0.8) * vB, 1.0);
      }
    `,
  }),
);
burbujas.frustumCulled = false;
burbujas.renderOrder = 6;
scene.add(burbujas);

// ---------------------------------------------------------------- haces de luz desde la superficie
const NRY = C.submarino.rayos * 2;
const rayGeo = new THREE.InstancedBufferGeometry();
rayGeo.index = quad.index;
rayGeo.setAttribute("position", quad.getAttribute("position"));
const rRay = new Float32Array(NRY * 4);
const rTilt = new Float32Array(NRY * 3);
for (let i = 0; i < NRY; i++) {
  // la mitad cerca del ingreso; la otra mitad frente a la ciudad B (luz de la costa)
  const cerca = i < NRY / 2;
  const cx = cerca ? E.x : 1080;
  const cz = cerca ? E.z : -120;
  rRay.set(
    [
      cx + lerp(-20, 30, rndAgua()),
      cz + lerp(-40, 40, rndAgua()),
      24 + rndAgua() * 16,
      0.8 + rndAgua() * 1.6,
    ],
    i * 4,
  );
  rTilt.set([cerca ? 0.16 : -0.2, 0.1, rndAgua()], i * 3);
}
rayGeo.setAttribute("aRay", new THREE.InstancedBufferAttribute(rRay, 4));
rayGeo.setAttribute("aTilt", new THREE.InstancedBufferAttribute(rTilt, 3));
rayGeo.instanceCount = NRY;
const rayos = new THREE.Mesh(
  rayGeo,
  new THREE.ShaderMaterial({
    ...additive,
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec4 aRay;
      attribute vec3 aTilt;
      varying vec2 vUv;
      varying float vB;
      void main() {
        vec3 top = vec3(aRay.x, -0.3, aRay.y);
        vec3 axis = normalize(vec3(aTilt.x, -1.0, aTilt.y));
        float along = (1.0 - position.y) * 0.5 * aRay.z;
        vec3 p = top + axis * along;
        vec3 view = normalize(cameraPosition - p);
        vec3 side = normalize(cross(axis, view));
        p += side * position.x * aRay.w * (0.7 + 0.9 * along / aRay.z);
        vUv = vec2(position.x, along / aRay.z);
        float depth = max(-cameraPosition.y, 0.0);
        vB = uUnder * exp(-depth / 22.0) * (0.75 + 0.25 * sin(uTime * 0.7 + aTilt.z * 12.0)) * (1.0 - underFog(p) * 0.5);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogTop, uAzul, uHaze;
      varying vec2 vUv;
      varying float vB;
      void main() {
        float a = exp(-vUv.x * vUv.x * 3.0) * pow(1.0 - vUv.y, 2.2) * smoothstep(0.0, 0.04, vUv.y);
        gl_FragColor = vec4((uFogTop * 2.0 + uHaze * 3.0) * a * vB * 0.3, 1.0);
      }
    `,
  }),
);
rayos.frustumCulled = false;
rayos.renderOrder = 2;
scene.add(rayos);

// ---------------------------------------------------------------- render por tiempo
function renderAt(time) {
  const t = clamp(Number(time) || 0, 0, C.duracion);
  U.uTime.value = t;
  cameraAt(Math.max(0, t - DT), camPrev);
  U.uPrevVP.value.multiplyMatrices(camPrev.projectionMatrix, camPrev.matrixWorldInverse);
  cameraAt(t, camera);
  domo.position.copy(camera.position);
  const bajo = camera.position.y < 0;
  U.uUnder.value = bajo ? 1 : 0;
  // profundidad de referencia del color del agua: la del lecho bajo la cámara
  U.uFondo.value = Math.max(12, profundidad(camera.position.x));

  updatePunta(t);
  cable.update(t);
  updatePulsoLecho(t);
  drones.visible = t > T.formacion[0] - 0.05 && t < T.picada[0] + 0.1;
  ciudadA.group.visible = t < T.cruceCamara + 0.4;
  ciudadB.group.visible = t > T.emersion - 1.2;
  lecho.visible = bajo || camera.position.y < 3;
  nieve.visible = bajo;
  if (lecho.visible) updateLecho();

  // empalme y pulso de datos
  const on = smoothstep(T.llegadaUnion, T.llegadaUnion + 0.3, t);
  empalmeMat.uniforms.uOn.value = on * (0.6 + 0.4 * Math.exp(-(t - T.llegadaUnion) / 0.6));
  const sp = pulsoS(t);
  const viajando = t > T.viaje[0] && t < T.conexion + 0.4;
  troncal.puntoEn(sp, U.uPulsePos.value);
  U.uPulseI.value = viajando
    ? smoothstep(T.viaje[0], T.viaje[0] + 0.5, t) *
      (1 - smoothstep(T.conexion, T.conexion + 0.4, t))
    : 0;
  troncal.mat.uniforms.uFlujo.value.set(sJ, sp, U.uPulseI.value, on);
  // estación de amarre y ola de encendido de la ciudad B
  estacionMat.uniforms.uOn.value = smoothstep(T.conexion - 0.1, T.conexion + 0.3, t);
  const [o0, o1] = T.ondaCiudad;
  ciudadB.awake.z = t < o0 ? 0 : lerp(0, 2800, easeOutCubic((t - o0) / (o1 - o0)));

  if (camera.position.y > -0.05) {
    mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
    mirrorCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    mirrorCam.matrixWorld.multiplyMatrices(MIRROR, camera.matrixWorld);
    mirrorCam.matrixWorldInverse.copy(mirrorCam.matrixWorld).invert();
    U.uReflectPass.value = 1;
    U.uDpr.value = DPR * 0.5;
    U.uRes.value.set(rtW, rtH);
    // la cámara espejada invierte el sentido de las caras: se dibujan las visibles
    for (const m of unaCara) m.side = THREE.BackSide;
    renderer.setRenderTarget(reflectRT);
    renderer.clear();
    renderer.render(scene, mirrorCam);
    for (const m of unaCara) m.side = THREE.FrontSide;
    U.uReflectPass.value = 0;
    U.uDpr.value = DPR;
    U.uRes.value.set(W * DPR, H * DPR);
  }
  post.render(scene, camera, t, smoothstep(0, T.fundidoEntrada, t));
}

window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
renderAt(window.__hfThreeTime || 0);

// Diagnóstico para revisión (no afecta al render): proyecta puntos clave a pantalla.
const _p = new THREE.Vector3();
function proyectar(t) {
  const cam = camera.clone();
  cameraAt(t, cam);
  cam.updateProjectionMatrix();
  const pr = (v) => {
    _p.copy(v).project(cam);
    return [
      +(((_p.x + 1) / 2) * 100).toFixed(0),
      +(((1 - _p.y) / 2) * 100).toFixed(0),
      _p.z < 1 ? "" : "detrás",
    ];
  };
  const punta = headAt(t, new THREE.Vector3());
  const pulso = troncal.puntoEn(pulsoS(t), new THREE.Vector3());
  return {
    t,
    cam: cam.position.toArray().map((x) => +x.toFixed(1)),
    logo: pr(K),
    torre: pr(O),
    punta: pr(punta),
    puntaPos: punta.toArray().map((x) => +x.toFixed(1)),
    empalme: pr(Jp),
    pulso: pr(pulso),
    pulsoPos: pulso.toArray().map((x) => +x.toFixed(0)),
    amarre: pr(V3(B.amarre)),
    lecho: +seabedY(cam.position.x, cam.position.z).toFixed(1),
  };
}
window.__cirion = {
  drones: N,
  edificios: ciudadA.edificios + ciudadB.edificios,
  troncal: Math.round(troncal.largo),
  renderAt,
  proyectar,
};
