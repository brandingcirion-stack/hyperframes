// Cirion · Drones sobre la ciudad — escena Three.js controlada por tiempo.
// Cada cuadro se calcula solo a partir de `t` (evento hf-seek de HyperFrames):
// sin reloj del navegador, sin requestAnimationFrame y con semilla fija.
import * as THREE from "../vendor/three.module.min.js";
import { createCable } from "./cable.js";
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
// 1 en el preview (960×540); 2 en el master (`--resolution landscape`).
const DPR = window.devicePixelRatio || 1;

// Flujo lineal HDR: los colores sRGB de marca se convierten a lineal y el
// posproceso aplica tonemapping fílmico y la curva sRGB de salida.
const color = (hex) => new THREE.Color(hex);
const COL = Object.fromEntries(Object.entries(C.colores).map(([k, v]) => [k, color(v)]));
const blancoAzul = color("#DFF4FF");

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
const tanHalf = Math.tan(THREE.MathUtils.degToRad(C.camara.fov / 2));

// Reflejo planar: el mundo espejado (y → −y) visto desde la misma cámara.
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
  uFondo: { value: C.recorrido.profundidad },
  uHaze: { value: COL.bruma },
  uHazeDensity: { value: C.atmosfera.bruma },
  uAzul: { value: COL.azul },
  uMagenta: { value: COL.magenta },
  uHead: { value: new THREE.Vector3() },
  uHeadI: { value: 0 },
};

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
};
const quad = new THREE.PlaneGeometry(2, 2);

// ---------------------------------------------------------------- relieve del lecho
const noise = makeNoise2D(C.semilla + 7);
function relieve(x, z) {
  let h = 2.4 * noise(x * 0.032, z * 0.032);
  h += 1.1 * noise(x * 0.09 + 13, z * 0.09 - 7);
  h += 0.4 * noise(x * 0.24 - 3, z * 0.24 + 5);
  const w = noise(x * 0.05 + 40, z * 0.05);
  h += (0.05 + 0.07 * (w + 1)) * Math.sin((x * 0.55 + z * 0.85) * 3.8 + w * 6);
  const r = noise(x * 0.07 - 20, z * 0.07 + 31);
  h += Math.max(0, r - 0.35) * 5.5;
  // zona de arena casi plana donde se apoya el cable
  const dS = Math.hypot(x - C.recorrido.fondo[0], z - C.recorrido.fondo[2]);
  return h * (0.15 + 0.85 * smoothstep(10, 34, dS));
}
const seabedY = (x, z) => -C.recorrido.profundidad + relieve(x, z);

// ---------------------------------------------------------------- logo 3D (show de drones)
const claves = C.camara.claves;
const C0 = new THREE.Vector3(...claves[0].pos);
const K = new THREE.Vector3(...C.logo.centro);
// frente del logo: mira a la cámara inicial, girado `giro` grados sobre su eje vertical
const lFront = new THREE.Vector3(C0.x - K.x, 0, C0.z - K.z)
  .normalize()
  .applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(C.logo.giro));
const lUp = new THREE.Vector3(0, 1, 0);
const lRight = new THREE.Vector3().crossVectors(lFront.clone().negate(), lUp).normalize();

// ---------------------------------------------------------------- recorrido del extremo del cable
const E = new THREE.Vector3(...C.recorrido.entrada);
const CtrlSky = new THREE.Vector3(...C.recorrido.controlPicada);
const [fx, , fz] = C.recorrido.fondo;
const R_CABLE = C.cable.diametro / 2;
const S = new THREE.Vector3(fx, seabedY(fx, fz) + R_CABLE, fz);
const hDir = new THREE.Vector3(
  C.recorrido.llegadaHorizontal[0],
  0,
  C.recorrido.llegadaHorizontal[1],
).normalize();
const dirSky = E.clone().sub(CtrlSky).normalize();
const W1 = E.clone().addScaledVector(dirSky, 14);
W1.y = Math.min(W1.y, -6);
const W2 = S.clone().addScaledVector(hDir, -34);
W2.y = S.y - 2; // toca el lecho antes y se tiende sobre él

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
  const [t0, t1] = T.picada;
  if (t <= t0) return out.copy(K);
  if (t <= t1) {
    const s = (t - t0) / (t1 - t0);
    return bezier2(K, CtrlSky, E, 0.62 * s * s + 0.38 * s * s * s, out);
  }
  if (t <= T.llegadaFondo) {
    const s = (t - t1) / (T.llegadaFondo - t1);
    bezier3(E, W1, W2, S, 1 - (1 - s) ** 1.7, out);
  } else {
    out.copy(S);
  }
  // el cable nunca atraviesa el lecho: se apoya sobre el relieve
  out.y = Math.max(out.y, seabedY(out.x, out.z) + R_CABLE);
  return out;
}

const camSpline = makeTimeSpline(claves);
const miraSpline = makeTimeSpline(
  claves.filter((k) => k.mira).map((k) => ({ t: k.t, pos: k.mira })),
);
const _head = new THREE.Vector3();
const _look = new THREE.Vector3();
const _mira = new THREE.Vector3();
function cameraAt(t) {
  camSpline(t, camera.position);
  const seg = C.camara.seguimiento;
  const retraso = lerp(
    seg.retraso,
    seg.retrasoAgua,
    smoothstep(T.picada[1] - 0.1, T.cruceCamara, t),
  );
  headAt(Math.max(0, t - retraso), _head);
  miraSpline(t, _mira);
  const k = smootherstep((t - seg.inicio) / (seg.fin - seg.inicio));
  _look.copy(_mira).lerp(_head, k);
  camera.lookAt(_look);
  camera.updateMatrixWorld();
}

// ---------------------------------------------------------------- ciudad
const ciudad = createCity({ U, C, scene });

// ---------------------------------------------------------------- drones
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
  // cara frontal completa; el contorno se repite en profundidad (volumen extruido)
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

// Formación inicial: una «alfombra» horizontal de drones sobre la costa.
const FILAS = 12;
const columnas = Math.ceil(N / FILAS);
const porX = [...targets].sort((a, b) => a.u - b.u || a.prof - b.prof);
const starts = new Array(N);
const colFrac = new Float32Array(N);
for (let c = 0; c < columnas; c++) {
  const grupo = porX.slice(c * FILAS, (c + 1) * FILAS).sort((a, b) => b.v - a.v);
  grupo.forEach((tg, r) => {
    const f = (c + 0.5) / columnas;
    const p = K.clone()
      .addScaledVector(lRight, lerp(-0.85, 0.85, f) * C.logo.ancho)
      .addScaledVector(lFront, lerp(70, -70, r / (FILAS - 1)) + (rnd() - 0.5) * 3);
    p.y = 62 + (rnd() - 0.5) * 2;
    starts[tg.i] = p;
    colFrac[tg.i] = Math.abs(f - 0.5) * 2;
  });
}

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
const [dvMin, dvMax] = T.duracionVuelo;
const [e0, e1] = T.encendido;
const [c0, c1] = T.salidaConvergencia;
const [dcMin, dcMax] = T.duracionConvergencia;
const brilloCapas = C.particulas.brilloCapas;
for (const tg of targets) {
  const i = tg.i;
  starts[i].toArray(aStart, i * 3);
  tg.p.toArray(aTarget, i * 3);
  tg.c.toArray(aColor, i * 3);
  const dur = lerp(dvMin, dvMax, rnd());
  const salida = f0 + (colFrac[i] * 0.85 + rnd() * 0.15) * (f1 - f0 - dvMax);
  const enc = e0 + rnd() * (e1 - e0 - 0.3) * 0.7 + colFrac[i] * (e1 - e0 - 0.3) * 0.3;
  aForm.set([enc, salida, dur, C.particulas.arcoVuelo * (0.6 + 0.4 * rnd())], i * 4);
  const lejania = Math.hypot(tg.u, tg.v) / maxDist;
  const durC = lerp(dcMin, dcMax, rnd());
  const salidaC = c0 + ((1 - lejania) * 0.85 + rnd() * 0.15) * (c1 - c0);
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
    uK: { value: K },
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
    uRefDist: { value: 560 },
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
      P += (vec3(0.0, 0.5, 0.0) + uFront * 0.6) * aForm.w * sin(3.14159265 * p);
      // flotación mínima en el sostén, como drones reales con viento
      vec3 hover = (uUp * sin(t * 1.1 + aConv.z * 40.0) + uRight * cos(t * 0.9 + aConv.z * 23.0))
                 * 0.18 * smoothstep(2.6, 3.4, t);
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
      alpha = smoothstep(aForm.x, aForm.x + 0.3, t) * (1.0 - smoothstep(0.82, 1.0, sc));
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
      float persp = clamp(uRefDist / distance(P, cameraPosition), 0.6, 3.0);
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
      // capas traseras más tenues: se lee el volumen sin empastar la cara frontal
      float capa = mix(aConv.w, 1.0, smoothstep(0.2, 0.8, q));
      vAlpha = a * capa * sqrt(size / (size + L)) * pow(1.0 - q, 1.5) * atmosLight(P)
             * (c.w > 0.0 ? 1.0 : 0.0);
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
      vec3 col = vColor * (core + halo * uHaloI) * uI;
      gl_FragColor = vec4(col * vAlpha, 1.0);
    }
  `,
});
const drones = new THREE.Mesh(droneGeo, droneMat);
drones.frustumCulled = false;
drones.layers.enable(1);
drones.renderOrder = 5;
scene.add(drones);

// ---------------------------------------------------------------- núcleo / punta luminosa
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
  const crece = smoothstep(5.45, 6.15, t);
  const comp = smootherstep((t - T.compresion[0]) / (T.compresion[1] - T.compresion[0]));
  let I = crece * (1 + 0.45 * comp);
  let halo = lerp(C.nucleo.radio, C.nucleo.radioComprimido, comp);
  let core = lerp(1.6, 2.2, comp);
  if (t > T.picada[0]) {
    const k = smoothstep(T.picada[0], T.picada[0] + 0.3, t);
    halo = lerp(halo, C.cable.puntaHalo, k);
    core = lerp(core, 1.9, k);
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
  const [r1, i1] = anillo(5.75, 0.6);
  const [r2, i2] = anillo(6.0, 0.5);
  u.uAnillos.value.set(r1, i1, r2, i2);
  if (t > T.llegadaFondo) {
    const f = t - T.llegadaFondo;
    I *= 1 + 0.55 * (1 - Math.exp(-f * 30)) * Math.exp(-f / 0.25);
    I *= lerp(1, 0.75, smoothstep(T.llegadaFondo + 0.1, T.pausaFinal, t));
  }
  u.uI.value = I * (C.nucleo.intensidad / 6);
  u.uHaloPx.value = halo;
  u.uCorePx.value = core;
  U.uHead.value.copy(u.uPos.value);
  U.uHeadI.value = t > T.picada[0] ? I : 0;
  punta.visible = I > 0.001;
}

// ---------------------------------------------------------------- cable
const cable = createCable({ U, C, scene, headAt, T });

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
        // cielo urbano: negro en el cenit, resplandor de la ciudad en el horizonte
        vec3 sky = uHaze * (0.12 + 2.8 * exp(-max(el, 0.0) * 9.0));
        if (el > 0.0) {
          vec2 cp = d.xz / (el + 0.08) * 0.8 + vec2(uTime * 0.012, 0.0);
          float n = fbm(cp * 1.1);
          float nub = smoothstep(0.42, 0.78, n) * smoothstep(0.0, 0.08, el) * (1.0 - smoothstep(0.2, 0.55, el));
          sky += uHaze * nub * uNubes * 5.0 * exp(-el * 5.0);
        }
        float depth = max(-cameraPosition.y, 0.0);
        // hacia abajo y en el horizonte coincide con la niebla sobre el lecho (sin costura)
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
domo.layers.enable(1); // el cielo entra en el reflejo (los edificios lo tapan)
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
      d = normalize(vec2(0.35, -0.9)); g += d * 0.006 * 3.3 * cos(dot(d, p) * 3.3 + t * 3.4);
      // rizado fino por ruido (gradiente numérico)
      vec2 q = p * 0.8 + vec2(t * 0.25, -t * 0.4);
      float e = 0.15;
      float n0 = vnoise(q);
      g += vec2(vnoise(q + vec2(e, 0.0)) - n0, vnoise(q + vec2(0.0, e)) - n0) / e * 0.06;
      return g;
    }

    void main() {
      vec3 V = normalize(cameraPosition - vWorld);
      float dist = distance(cameraPosition, vWorld);
      // el oleaje fino se atenúa a lo lejos (sin aliasing)
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
        // reflejo de la ciudad, los drones y el cable: desplazado por el oleaje y
        // estirado en vertical (estelas de luz sobre el agua)
        vec2 uv = gl_FragCoord.xy / uRes;
        vec2 off = g * uDist * 7.0 * vec2(1.0, 1.6);
        vec3 refl = vec3(0.0);
        // estelas verticales: más largas hacia el espectador, rotas por el rizado
        float sm = 0.004 + 0.01 * smoothstep(40.0, 600.0, dist);
        for (int k = -2; k <= 5; k++) {
          float fk = float(k);
          float jit = (vnoise(vec2(vWorld.x * 0.35, fk * 3.1 + uTime)) - 0.5) * 0.004;
          refl += texture2D(uRefl, uv + off + vec2(jit, -fk * sm)).rgb * (1.0 - abs(fk - 1.5) / 5.0);
        }
        refl /= 4.6;
        col += refl * uReflI * (0.3 + 0.7 * fres);
        col = mix(col, uHaze * 1.2, hazeAmount(vWorld) * 0.85);
        float cerca = smoothstep(2.6, 0.0, cameraPosition.y);
        col = mix(col, waterColorAt(-1.5), cerca * (1.0 - fres) * 0.9);
        col += luz;
      } else {
        float cosT = -V.y;
        float win = smoothstep(0.6, 0.72, cosT);
        col = mix(uFogTop * 0.75, uFogTop * 1.9 + uHaze * 2.0, win) + luz * 1.2;
        // en el horizonte coincide con el fondo y con la niebla sobre el lecho
        vec3 fogC = mix(waterColorAt(mix(cameraPosition.y, -uFondo, 0.5)),
                        waterColorAt(cameraPosition.y) * 1.2, smoothstep(0.0, 0.7, -V.y));
        col = mix(col, fogC, underFog(vWorld));
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const agua = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), aguaMat);
agua.rotation.x = -Math.PI / 2;
scene.add(agua);

// ---------------------------------------------------------------- lecho marino
const lechoGeo = new THREE.PlaneGeometry(320, 320, 260, 260);
lechoGeo.rotateX(-Math.PI / 2);
lechoGeo.translate(S.x - 20, 0, S.z + 20);
{
  const pos = lechoGeo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) pos.setY(i, seabedY(pos.getX(i), pos.getZ(i)));
  lechoGeo.computeVertexNormals();
}
const pulso = C.submarino.pulso;
const lechoMat = new THREE.ShaderMaterial({
  uniforms: {
    ...U,
    uS: { value: S },
    uAlbedo: { value: COL.lechoMarino },
    uPulse: { value: new THREE.Vector3(0, 0, pulso.ancho) },
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
    uniform vec3 uS, uAlbedo, uPulse, uAzul, uHead;
    uniform float uHeadI;
    varying vec3 vWorld;
    varying vec3 vNormal;
    void main() {
      vec3 N = normalize(vNormal);
      float grano = 0.85 + 0.3 * vnoise(vWorld.xz * 3.1) * vnoise(vWorld.xz * 0.7 + 9.0);
      vec3 alb = uAlbedo * grano;
      vec3 L = uHead - vWorld;
      float d2 = dot(L, L);
      float diff = max(dot(N, L * inversesqrt(d2)), 0.0);
      vec3 luzHaz = mix(vec3(1.0), uAzul, 0.45) * uHeadI * 14.0 / (1.0 + d2 / 60.0);
      vec3 col = alb * luzHaz * diff;
      float dr = distance(vWorld.xz, uS.xz);
      float anillo = exp(-pow((dr - uPulse.x) / uPulse.z, 2.0)) * uPulse.y;
      col += (alb * 6.0 * (0.35 + 0.65 * max(N.y, 0.0)) + uAzul * 1.5) * uAzul * anillo;
      col += alb * uFogTop * 0.6 * max(N.y, 0.0);
      float f = underFog(vWorld);
      gl_FragColor = vec4(mix(col, waterColorAt(mix(cameraPosition.y, vWorld.y, 0.5)), f), 1.0);
    }
  `,
});
scene.add(new THREE.Mesh(lechoGeo, lechoMat));

function updatePulso(t) {
  const s = (t - T.pulso[0]) / (T.pulso[1] - T.pulso[0]);
  const v = lechoMat.uniforms.uPulse.value;
  if (s <= 0) return v.set(0, 0, pulso.ancho);
  v.x = pulso.radioMax * easeOutCubic(s);
  v.y = (1 - clamp(s)) ** 1.6 * smoothstep(0, 0.05, t - T.pulso[0]) * 1.4;
  v.z = pulso.ancho * (1 + 1.5 * clamp(s));
}

// ---------------------------------------------------------------- nieve marina
const rndAgua = mulberry32(C.semilla + 101);
const NS = C.submarino.nieve;
const nievePos = new Float32Array(NS * 3);
const nieveSeed = new Float32Array(NS);
for (let i = 0; i < NS; i++) {
  nievePos[i * 3] = lerp(E.x - 30, S.x + 25, rndAgua());
  nievePos[i * 3 + 1] = lerp(-C.recorrido.profundidad - 2, -0.8, rndAgua() ** 0.85);
  nievePos[i * 3 + 2] = lerp(S.z - 25, E.z + 40, rndAgua());
  nieveSeed[i] = rndAgua();
}
const nieveGeo = new THREE.BufferGeometry();
nieveGeo.setAttribute("position", new THREE.BufferAttribute(nievePos, 3));
nieveGeo.setAttribute("aSeed", new THREE.BufferAttribute(nieveSeed, 1));
const nieve = new THREE.Points(
  nieveGeo,
  new THREE.ShaderMaterial({
    ...additive,
    uniforms: { ...U, uS: { value: S }, uPulse: lechoMat.uniforms.uPulse },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute float aSeed;
      uniform vec3 uHead, uS, uPulse;
      uniform float uHeadI;
      varying float vB;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.25 + aSeed * 31.0) * 0.3,
                                 sin(uTime * 0.18 + aSeed * 17.0) * 0.2 + uTime * 0.04,
                                 cos(uTime * 0.22 + aSeed * 11.0) * 0.3);
        float d = distance(p, cameraPosition);
        vec3 dh = p - uHead;
        float luz = 0.12 + 0.1 * aSeed + uHeadI * 5.0 / (1.0 + dot(dh, dh) / 6.0);
        float dr = distance(p.xz, uS.xz);
        luz += uPulse.y * exp(-pow((dr - uPulse.x) / 2.5, 2.0)) * exp(-abs(p.y - uS.y) / 3.0) * 4.0;
        vB = luz * smoothstep(0.6, 2.2, d) * (1.0 - underFog(p) * 0.8) * uUnder;
        float px = (0.035 + 0.03 * aSeed) * uRes.y / (2.0 * d * uTanHalf);
        gl_PointSize = clamp(px, 0.9 * uDpr, 3.2 * uDpr);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAzul;
      varying float vB;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = exp(-dot(c, c) * 14.0);
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
        float vis = step(0.0, age) * smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(1.6, 2.4, age))
                  * (1.0 - smoothstep(-0.6, -0.1, p.y));
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
const NR = C.submarino.rayos;
const rayGeo = new THREE.InstancedBufferGeometry();
rayGeo.index = quad.index;
rayGeo.setAttribute("position", quad.getAttribute("position"));
const rRay = new Float32Array(NR * 4);
const rTilt = new Float32Array(NR * 3);
for (let i = 0; i < NR; i++) {
  rRay.set(
    [
      E.x + lerp(-16, 30, (i + rndAgua() * 0.6) / NR),
      E.z + lerp(-40, 8, rndAgua()),
      28 + rndAgua() * 18,
      0.8 + rndAgua() * 1.6,
    ],
    i * 4,
  );
  rTilt.set([0.16, 0.1, rndAgua()], i * 3);
}
rayGeo.setAttribute("aRay", new THREE.InstancedBufferAttribute(rRay, 4));
rayGeo.setAttribute("aTilt", new THREE.InstancedBufferAttribute(rTilt, 3));
rayGeo.instanceCount = NR;
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
        vB = uUnder * exp(-depth / 22.0) * (0.75 + 0.25 * sin(uTime * 0.7 + aTilt.z * 12.0))
           * (1.0 - underFog(p) * 0.5);
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
  cameraAt(t);
  domo.position.copy(camera.position);
  U.uUnder.value = camera.position.y < 0 ? 1 : 0;
  updatePunta(t);
  cable.update(t);
  updatePulso(t);
  drones.visible = t < T.convergencia[1] + 0.1;

  if (camera.position.y > -0.05) {
    mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
    mirrorCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    mirrorCam.matrixWorld.multiplyMatrices(MIRROR, camera.matrixWorld);
    mirrorCam.matrixWorldInverse.copy(mirrorCam.matrixWorld).invert();
    U.uReflectPass.value = 1;
    U.uDpr.value = DPR * 0.5;
    U.uRes.value.set(rtW, rtH);
    // la cámara espejada invierte el sentido de las caras: se dibujan las visibles
    for (const m of ciudad.unaCara) m.side = THREE.BackSide;
    renderer.setRenderTarget(reflectRT);
    renderer.clear();
    renderer.render(scene, mirrorCam);
    for (const m of ciudad.unaCara) m.side = THREE.FrontSide;
    U.uReflectPass.value = 0;
    U.uDpr.value = DPR;
    U.uRes.value.set(W * DPR, H * DPR);
  }
  post.render(scene, camera, t, smoothstep(0, T.fundidoEntrada, t));
}

window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
renderAt(window.__hfThreeTime || 0);

// Diagnóstico para revisión (no afecta al render).
window.__cirion = {
  drones: N,
  edificios: ciudad.edificios,
  luces: ciudad.luces,
  renderAt,
  K: K.toArray(),
  S: S.toArray(),
};
