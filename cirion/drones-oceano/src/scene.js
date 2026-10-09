// Cirion · Drones sobre el océano — escena Three.js controlada por tiempo.
// Cada cuadro se calcula solo a partir de `t` (evento hf-seek de HyperFrames):
// sin reloj del navegador, sin requestAnimationFrame y con semilla fija.
import * as THREE from "../vendor/three.module.min.js";
import { CONFIG } from "./config.js";
import { LOGO } from "./logo-data.js";
import { sampleLogo } from "./logo-sampler.js";
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

// Los colores se escriben en sRGB y se usan tal cual en los shaders.
THREE.ColorManagement.enabled = false;
const color = (hex) => new THREE.Color(hex);
const COL = Object.fromEntries(Object.entries(C.colores).map(([k, v]) => [k, color(v)]));
const blancoAzul = color("#E6F7FF");

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("escena");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(DPR);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(C.camara.fov, W / H, 0.1, 6000);
const tanHalf = Math.tan(THREE.MathUtils.degToRad(C.camara.fov / 2));

// Reflejo planar: el mundo espejado (y → −y) visto desde la misma cámara.
const rtW = Math.round((W * DPR) / 2);
const rtH = Math.round((H * DPR) / 2);
const reflectRT = new THREE.WebGLRenderTarget(rtW, rtH);
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
  uFogTop: { value: COL.azulProfundo.clone().multiplyScalar(0.42) },
  uFogBottom: { value: color("#00050F") },
  uFondo: { value: C.recorrido.profundidad },
  uAzul: { value: COL.azul },
  uMagenta: { value: COL.magenta },
  uHorizon: { value: COL.azulProfundo.clone().multiplyScalar(0.42) },
  uHead: { value: new THREE.Vector3() },
  uHeadI: { value: 0 },
};

const GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform float uDpr;
uniform vec2 uRes;
uniform float uTanHalf;
uniform float uReflectPass;
uniform float uUnder;
uniform float uFogDensity;
uniform vec3 uFogTop;
uniform vec3 uFogBottom;
uniform float uFondo;
vec3 waterColorAt(float y) {
  float k = clamp(-y / uFondo, 0.0, 1.0);
  return mix(uFogTop, uFogBottom, pow(k, 0.6));
}
// Atenuación de la niebla submarina (solo cuando la cámara está bajo el agua).
float underFog(vec3 wp) {
  float d = distance(wp, cameraPosition);
  return uUnder * (1.0 - exp(-d * uFogDensity));
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
};

// ---------------------------------------------------------------- relieve del lecho
const noise = makeNoise2D(C.semilla + 7);
function relieve(x, z) {
  let h = 2.4 * noise(x * 0.032, z * 0.032);
  h += 1.1 * noise(x * 0.09 + 13, z * 0.09 - 7);
  h += 0.4 * noise(x * 0.24 - 3, z * 0.24 + 5);
  // ondulaciones de arena
  const w = noise(x * 0.05 + 40, z * 0.05);
  h += (0.05 + 0.07 * (w + 1)) * Math.sin((x * 0.55 + z * 0.85) * 3.8 + w * 6);
  // algunas rocas bajas
  const r = noise(x * 0.07 - 20, z * 0.07 + 31);
  h += Math.max(0, r - 0.35) * 5.5;
  return h;
}
const seabedY = (x, z) => -C.recorrido.profundidad + relieve(x, z);

// ---------------------------------------------------------------- cámara y logo
const claves = C.camara.claves;
const C0 = new THREE.Vector3(...claves[0].pos);
const pitch0 = Math.atan(tanHalf * (C.camara.horizonteY - 0.5) * 2);
const dir0 = new THREE.Vector3(0, Math.sin(pitch0), -Math.cos(pitch0));
const L0 = C0.clone().addScaledVector(dir0, 400); // objetivo de la cámara antes del seguimiento
camera.position.copy(C0);
camera.lookAt(L0);
camera.updateMatrixWorld();

// Centro del logo: el rayo que pasa por (centro, centroY) del primer cuadro.
const dirL = new THREE.Vector3(0, (0.5 - C.logo.centroY) * 2, 0.5)
  .unproject(camera)
  .sub(C0)
  .normalize();
const K = C0.clone().addScaledVector(dirL, C.logo.distancia); // centro del logo = núcleo
const lRight = new THREE.Vector3().crossVectors(dirL, new THREE.Vector3(0, 1, 0)).normalize();
const lUp = new THREE.Vector3().crossVectors(lRight, dirL).normalize();
const lNormal = dirL.clone().negate(); // hacia la cámara
const logoW = 2 * C.logo.distancia * tanHalf * (W / H) * C.logo.anchoPantalla;

// ---------------------------------------------------------------- recorrido del haz
const E = new THREE.Vector3(...C.recorrido.entrada);
const CtrlSky = new THREE.Vector3(...C.recorrido.controlPicada);
const [fx, , fz] = C.recorrido.fondo;
const S = new THREE.Vector3(fx, seabedY(fx, fz) + 0.9, fz);
const dirSky = E.clone().sub(CtrlSky).normalize();
const CtrlWater = E.clone().addScaledVector(dirSky, 6);

function bezier(a, b, c, p, out) {
  const q = 1 - p;
  return out
    .copy(a)
    .multiplyScalar(q * q)
    .addScaledVector(b, 2 * p * q)
    .addScaledVector(c, p * p);
}
function headAt(t, out) {
  const [t0, t1] = T.picada;
  if (t <= t0) return out.copy(K);
  if (t <= t1) {
    const s = (t - t0) / (t1 - t0);
    // arranca desde el reposo y acelera hasta tocar el agua
    return bezier(K, CtrlSky, E, 0.62 * s * s + 0.38 * s * s * s, out);
  }
  if (t <= T.llegadaFondo) {
    const s = (t - t1) / (T.llegadaFondo - t1);
    // el agua frena el haz; llega al fondo desacelerando
    return bezier(E, CtrlWater, S, 1 - (1 - s) ** 1.7, out);
  }
  return out.copy(S);
}

const camSpline = makeTimeSpline(claves);
const _head = new THREE.Vector3();
const _look = new THREE.Vector3();
function cameraAt(t) {
  camSpline(t, camera.position);
  const seg = C.camara.seguimiento;
  // en la picada la cámara va un poco detrás del haz; bajo el agua lo sigue más de cerca
  const retraso = lerp(
    seg.retraso,
    seg.retrasoAgua,
    smoothstep(T.picada[1] - 0.1, T.cruceCamara, t),
  );
  headAt(Math.max(0, t - retraso), _head);
  const k = smootherstep((t - seg.inicio) / (seg.fin - seg.inicio));
  _look.copy(L0).lerp(_head, k);
  camera.lookAt(_look);
  camera.updateMatrixWorld();
}

// ---------------------------------------------------------------- drones (partículas instanciadas)
const rnd = mulberry32(C.semilla);
const muestras = sampleLogo(LOGO, { ...C.logo, semilla: C.semilla });
const N = muestras.length;
const [vbx, vby, vbw, vbh] = LOGO.viewBox;
const escalaLogo = logoW / vbw;

const targets = muestras.map((m, i) => {
  const u = (m.x - (vbx + vbw / 2)) * escalaLogo;
  const v = -(m.y - (vby + vbh / 2)) * escalaLogo;
  const p = K.clone().addScaledVector(lRight, u).addScaledVector(lUp, v);
  const c = m.role === "simbolo" ? color(m.fill) : COL.letrasLogo;
  return { i, u, v, p, c };
});

// Formación inicial: una «alfombra» de drones baja sobre el horizonte, en filas de profundidad.
const FILAS = 8;
const columnas = Math.ceil(N / FILAS);
const porX = [...targets].sort((a, b) => a.u - b.u);
const starts = new Array(N);
const colFrac = new Float32Array(N);
for (let c = 0; c < columnas; c++) {
  const grupo = porX.slice(c * FILAS, (c + 1) * FILAS).sort((a, b) => b.v - a.v);
  grupo.forEach((tg, r) => {
    const fxc = (c + 0.5) / columnas;
    const x = K.x + lerp(-0.78, 0.78, fxc) * logoW + (rnd() - 0.5) * 1.2;
    // filas cercanas (más altas en pantalla) → parte superior del logo
    const z = K.z + lerp(32, -32, r / (FILAS - 1)) + (rnd() - 0.5) * 2;
    const y = 12 + (rnd() - 0.5) * 1.5;
    starts[tg.i] = new THREE.Vector3(x, y, z);
    colFrac[tg.i] = Math.abs(fxc - 0.5) * 2; // 0 al centro, 1 en los extremos
  });
}

const maxDist = Math.max(...targets.map((tg) => Math.hypot(tg.u, tg.v)));
const quad = new THREE.PlaneGeometry(2, 2);
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
for (const tg of targets) {
  const i = tg.i;
  starts[i].toArray(aStart, i * 3);
  tg.p.toArray(aTarget, i * 3);
  tg.c.toArray(aColor, i * 3);
  // Formación: ola del centro hacia afuera; todos llegan antes de f1.
  const dur = lerp(dvMin, dvMax, rnd());
  const salida = f0 + (colFrac[i] * 0.85 + rnd() * 0.15) * (f1 - f0 - dvMax);
  const encendido = e0 + rnd() * (e1 - e0 - 0.3) * 0.7 + colFrac[i] * (e1 - e0 - 0.3) * 0.3;
  aForm.set([encendido, salida, dur, C.particulas.arcoVuelo * (0.6 + 0.4 * rnd())], i * 4);
  // Convergencia: los puntos más alejados del centro parten primero.
  const lejania = Math.hypot(tg.u, tg.v) / maxDist;
  const durC = lerp(dcMin, dcMax, rnd());
  const salidaC = c0 + ((1 - lejania) * 0.85 + rnd() * 0.15) * (c1 - c0);
  aConv.set([salidaC, durC, rnd(), 0], i * 4);
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
    uNormal: { value: lNormal },
    uSwirl: { value: C.particulas.giroConvergencia },
    uSize: { value: C.particulas.tamano },
    uHalo: { value: C.particulas.halo },
    uCoreI: { value: C.particulas.intensidadNucleo },
    uHaloI: { value: C.particulas.intensidadHalo },
    uStreakMax: { value: C.particulas.estelaMax },
    uCoreColor: { value: blancoAzul },
    uRefDist: { value: C.logo.distancia },
  },
  vertexShader: /* glsl */ `
    ${GLSL_COMMON}
    attribute vec3 aStart;
    attribute vec3 aTarget;
    attribute vec3 aColor;
    attribute vec4 aForm;
    attribute vec4 aConv;
    uniform vec3 uK, uRight, uUp, uNormal;
    uniform float uSwirl, uSize, uHalo, uStreakMax, uRefDist;
    uniform vec3 uCoreColor;
    varying vec2 vLocal;
    varying float vHalfLen, vSize, vHalo, vAlpha;
    varying vec3 vColor;

    float smoother(float t) { t = clamp(t, 0.0, 1.0); return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

    vec3 posAt(float t, out float alpha, out float q) {
      float s = clamp((t - aForm.y) / aForm.z, 0.0, 1.0);
      float p = smoother(s);
      vec3 P = mix(aStart, aTarget, p);
      P += (vec3(0.0, 0.45, 0.0) + uNormal * 0.9) * aForm.w * sin(3.14159265 * p);
      // flotación mínima en el sostén (los drones no quedan clavados)
      vec3 hover = (uUp * sin(t * 1.1 + aConv.z * 40.0) + uRight * cos(t * 0.9 + aConv.z * 23.0))
                 * 0.05 * smoothstep(2.6, 3.4, t);
      float sc = clamp((t - aConv.x) / aConv.y, 0.0, 1.0);
      q = 1.0 - cos(1.5707963 * sc); // arranca suave y acelera hacia el núcleo
      if (sc > 0.0) {
        vec3 r0 = aTarget - uK;
        float u = dot(r0, uRight);
        float v = dot(r0, uUp);
        float a = uSwirl * q;
        vec2 rr = vec2(u * cos(a) - v * sin(a), u * sin(a) + v * cos(a)) * (1.0 - q);
        P = uK + uRight * rr.x + uUp * rr.y + uNormal * sin(3.14159265 * q) * 2.5;
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
      float persp = clamp(uRefDist / distance(P, cameraPosition), 0.6, 2.5);
      float size = uSize * uDpr * persp;
      float halo = uHalo * uDpr * persp;
      float L = min(speed * 0.5, uStreakMax * uDpr * 0.5);
      float R = halo * 2.2;
      vec2 corner = position.xy;
      vLocal = vec2(corner.x * (L + R), corner.y * R);
      vHalfLen = L;
      vSize = size;
      vHalo = halo;
      gl_Position = c;
      gl_Position.xy += (dir * corner.x * (L + R) + perp * corner.y * R) / (0.5 * uRes) * c.w;
      vColor = mix(aColor, uCoreColor, smoothstep(0.3, 0.9, q) * 0.85);
      // la energía se reparte a lo largo de la estela de movimiento
      vAlpha = a * sqrt(size / (size + L)) * (1.0 - 0.65 * q) * (c.w > 0.0 ? 1.0 : 0.0);
      if (uReflectPass > 0.5 && P.y < 0.0) vAlpha = 0.0;
    }
  `,
  fragmentShader: /* glsl */ `
    ${GLSL_COMMON}
    uniform float uCoreI, uHaloI;
    varying vec2 vLocal;
    varying float vHalfLen, vSize, vHalo, vAlpha;
    varying vec3 vColor;
    void main() {
      float dx = max(abs(vLocal.x) - vHalfLen, 0.0);
      float d2 = dx * dx + vLocal.y * vLocal.y;
      float core = exp(-d2 / (vSize * vSize));
      float halo = exp(-d2 / (vHalo * vHalo));
      vec3 col = vColor * (core * uCoreI + halo * uHaloI) + vec3(core * core * 0.25);
      gl_FragColor = vec4(col * vAlpha, 1.0);
    }
  `,
});
const drones = new THREE.Mesh(droneGeo, droneMat);
drones.frustumCulled = false;
drones.layers.enable(1);
drones.renderOrder = 5;
scene.add(drones);

// ---------------------------------------------------------------- núcleo / punta del haz
const puntaMat = new THREE.ShaderMaterial({
  ...additive,
  depthTest: true,
  uniforms: {
    ...U,
    uPos: { value: new THREE.Vector3() },
    uCorePx: { value: 1.6 },
    uHaloPx: { value: C.nucleo.radio },
    uScatterM: { value: 0 },
    uScatterI: { value: 0 },
    uHaloI: { value: 1 },
    uAnillos: { value: new THREE.Vector4(0, 0, 0, 0) }, // radio px e intensidad de 2 anillos
    uI: { value: 0 },
    uColCore: { value: blancoAzul },
  },
  vertexShader: /* glsl */ `
    ${GLSL_COMMON}
    uniform vec3 uPos;
    uniform float uCorePx, uHaloPx, uScatterM;
    varying vec2 vLocal;
    varying float vCore, vHalo, vScatter, vFog;
    void main() {
      vec4 c = projectionMatrix * viewMatrix * vec4(uPos, 1.0);
      float dist = distance(uPos, cameraPosition);
      float pxPerM = uRes.y / (2.0 * dist * uTanHalf);
      float persp = clamp(60.0 / dist, 1.0, 2.2);
      vCore = uCorePx * uDpr * persp;
      vHalo = uHaloPx * uDpr * persp;
      vScatter = max(uScatterM * pxPerM, 1.0);
      float R = min(max(max(vHalo * 3.0, vScatter * 2.6), 60.0 * uDpr), uRes.y * 0.9);
      vLocal = position.xy * R;
      vFog = underFog(uPos);
      gl_Position = c;
      gl_Position.xy += position.xy * R / (0.5 * uRes) * c.w;
      if (c.w <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      if (uReflectPass > 0.5 && uPos.y < 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    ${GLSL_COMMON}
    uniform float uI, uScatterM, uScatterI, uHaloI;
    uniform vec4 uAnillos;
    uniform vec3 uColCore, uAzul, uMagenta;
    varying vec2 vLocal;
    varying float vCore, vHalo, vScatter, vFog;
    void main() {
      float d2 = dot(vLocal, vLocal);
      float core = exp(-d2 / (vCore * vCore));
      float halo = exp(-d2 / (vHalo * vHalo));
      float rim = exp(-d2 / (vHalo * vHalo * 3.2));
      float scatter = uScatterM > 0.0 ? exp(-d2 / (vScatter * vScatter)) : 0.0;
      float d = sqrt(d2);
      float w = max(vHalo * 0.35, 1.5 * uDpr);
      float an1 = exp(-pow((d - uAnillos.x * uDpr) / w, 2.0)) * uAnillos.y;
      float an2 = exp(-pow((d - uAnillos.z * uDpr) / w, 2.0)) * uAnillos.w;
      vec3 col = uColCore * core * 1.15 + uAzul * halo * 0.6 * uHaloI + uMagenta * rim * 0.07
               + uAzul * scatter * uScatterI + uAzul * an1 * 0.35 + uMagenta * an2 * 0.22;
      // en la niebla la luz se dispersa: se atenúa menos que un objeto opaco
      col *= uI * (1.0 - vFog * 0.55);
      gl_FragColor = vec4(col, 1.0);
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
  let I = crece * C.nucleo.intensidad * (1 + 0.45 * comp);
  let halo = lerp(C.nucleo.radio, C.nucleo.radioComprimido, comp);
  let core = lerp(1.5, 2.1, comp);
  if (t > T.picada[0]) {
    const k = smoothstep(T.picada[0], T.picada[0] + 0.3, t);
    halo = lerp(halo, C.haz.halo, k);
    core = lerp(core, 1.8, k);
  }
  // resplandor del núcleo mientras acumula energía; bajo el agua, dispersión en volumen
  const bruma = crece * (1 - smoothstep(T.picada[0], T.picada[0] + 0.35, t)) * lerp(1, 0.7, comp);
  const agua = smoothstep(T.picada[1], T.picada[1] + 0.4, t);
  u.uScatterM.value = C.nucleo.brumaM * bruma + C.haz.haloAgua * agua;
  u.uScatterI.value = 0.55 * bruma + 0.17 * agua;
  u.uHaloI.value = 1 + 0.8 * bruma;
  // anillos de energía que se contraen hacia el núcleo antes de la picada
  const anillo = (t0, dur) => {
    const s = (t - t0) / dur;
    if (s <= 0 || s >= 1) return [0, 0];
    return [lerp(46, 2, smootherstep(s)), Math.sin(Math.PI * s) * smoothstep(0, 0.2, s)];
  };
  const [r1, i1] = anillo(5.75, 0.6);
  const [r2, i2] = anillo(6.0, 0.5);
  u.uAnillos.value.set(r1, i1, r2, i2);
  // llegada al fondo: un destello contenido y luego un punto calmo
  if (t > T.llegadaFondo) {
    const f = t - T.llegadaFondo;
    I *= 1 + 0.55 * (1 - Math.exp(-f * 30)) * Math.exp(-f / 0.25);
    I *= lerp(1, 0.72, smoothstep(T.llegadaFondo + 0.1, T.pausaFinal, t));
  }
  u.uI.value = I;
  u.uHaloPx.value = halo;
  u.uCorePx.value = core;
  U.uHead.value.copy(u.uPos.value);
  U.uHeadI.value = t > T.picada[0] ? I : 0;
  punta.visible = I > 0.001;
}

// ---------------------------------------------------------------- estela del haz (cinta)
const TR_N = 110;
function makeRibbon(fragment) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TR_N * 2 * 3), 3));
  geo.setAttribute("aUV", new THREE.BufferAttribute(new Float32Array(TR_N * 2 * 2), 2));
  const idx = [];
  for (let i = 0; i < TR_N - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    ...additive,
    uniforms: { ...U, uI: { value: 1 }, uColA: { value: blancoAzul } },
    vertexShader: /* glsl */ `
      ${GLSL_COMMON}
      attribute vec2 aUV;
      varying vec2 vUV;
      varying vec3 vWorld;
      void main() {
        vUV = aUV;
        vWorld = position;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      uniform float uI;
      uniform vec3 uColA, uAzul, uMagenta;
      varying vec2 vUV;
      varying vec3 vWorld;
      void main() {
        if (uReflectPass > 0.5 && vWorld.y < 0.0) discard;
        float u = vUV.x;
        float v = vUV.y;
        ${fragment}
        col *= uI * (1.0 - underFog(vWorld) * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.enable(1);
  mesh.renderOrder = 7;
  scene.add(mesh);
  return mesh;
}
const estela = makeRibbon(/* glsl */ `
  float across = exp(-v * v * 4.5);
  float line = exp(-v * v * 40.0);
  vec3 col = uAzul * across * 0.85 * pow(u, 1.4) + uColA * line * pow(u, 3.0) * 0.9;
`);
const hilo = makeRibbon(/* glsl */ `
  float across = exp(-v * v * 6.0);
  vec3 col = uMagenta * across * pow(u, 1.2) * smoothstep(0.0, 0.25, 1.0 - u);
`);

const _p = new THREE.Vector3();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _view = new THREE.Vector3();
const _side = new THREE.Vector3();
const _bin = new THREE.Vector3();
const _off = new THREE.Vector3();
function updateTrail(t) {
  const activo = t > T.picada[0];
  estela.visible = hilo.visible = activo;
  if (!activo) return;
  const tau = lerp(
    C.haz.estelaCielo,
    C.haz.estelaAgua,
    smoothstep(T.picada[1], T.picada[1] + 0.5, t),
  );
  const pE = estela.geometry.getAttribute("position");
  const uvE = estela.geometry.getAttribute("aUV");
  const pH = hilo.geometry.getAttribute("position");
  const uvH = hilo.geometry.getAttribute("aUV");
  const tSample = (a) => Math.max(T.picada[0], t - a * tau);
  for (let i = 0; i < TR_N; i++) {
    const a = i / (TR_N - 1); // 0 = punta, 1 = cola
    headAt(tSample(a), _p);
    headAt(tSample(Math.max(0, a - 0.01)), _pa);
    headAt(tSample(Math.min(1, a + 0.01)), _pb);
    _tan.subVectors(_pa, _pb);
    if (_tan.lengthSq() < 1e-8) _tan.set(0, -1, 0);
    _tan.normalize();
    _view.subVectors(camera.position, _p);
    const dist = Math.max(_view.length(), 0.5);
    _view.normalize();
    _side.crossVectors(_tan, _view);
    if (_side.lengthSq() < 1e-8) _side.set(1, 0, 0);
    _side.normalize();
    _bin.crossVectors(_tan, _side).normalize();
    const mPorPx = (2 * dist * tanHalf) / H;
    const ancho = C.haz.anchoPx * mPorPx * ((1 - a) ** 0.8 * 0.85 + 0.15);
    const u = 1 - a;
    pE.setXYZ(i * 2, _p.x + _side.x * ancho, _p.y + _side.y * ancho, _p.z + _side.z * ancho);
    pE.setXYZ(i * 2 + 1, _p.x - _side.x * ancho, _p.y - _side.y * ancho, _p.z - _side.z * ancho);
    uvE.setXY(i * 2, u, 1);
    uvE.setXY(i * 2 + 1, u, -1);
    // filamento magenta: gira alrededor del haz
    const fi = a * 16 + t * 7;
    const r = ancho * 0.9;
    _off
      .copy(_side)
      .multiplyScalar(Math.cos(fi) * r)
      .addScaledVector(_bin, Math.sin(fi) * r);
    const w = ancho * 0.4;
    pH.setXYZ(
      i * 2,
      _p.x + _off.x + _side.x * w,
      _p.y + _off.y + _side.y * w,
      _p.z + _off.z + _side.z * w,
    );
    pH.setXYZ(
      i * 2 + 1,
      _p.x + _off.x - _side.x * w,
      _p.y + _off.y - _side.y * w,
      _p.z + _off.z - _side.z * w,
    );
    uvH.setXY(i * 2, u, 1);
    uvH.setXY(i * 2 + 1, u, -1);
  }
  pE.needsUpdate = uvE.needsUpdate = pH.needsUpdate = uvH.needsUpdate = true;
  // al llegar al fondo la estela se recoge sola: todas las muestras convergen en S
  estela.material.uniforms.uI.value = 1.05;
  hilo.material.uniforms.uI.value = C.haz.hiloMagenta;
}

// ---------------------------------------------------------------- cielo / fondo submarino
const domo = new THREE.Mesh(
  new THREE.SphereGeometry(3000, 48, 24),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      uniform vec3 uHorizon;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        // cielo nocturno: negro arriba, bruma azul profunda en el horizonte (sin estrellas)
        vec3 sky = mix(uHorizon, vec3(0.0), smoothstep(-0.005, 0.30, d.y));
        sky += uHorizon * 0.35 * exp(-abs(d.y) * 70.0);
        // bajo el agua: más claro hacia la superficie, casi negro hacia el fondo
        float depth = max(-cameraPosition.y, 0.0);
        vec3 abajo = waterColorAt(-depth - 30.0 * max(-d.y, 0.0));
        vec3 arriba = waterColorAt(-depth) * (1.0 + 0.5 * smoothstep(0.0, 1.0, d.y));
        vec3 under = mix(abajo, arriba, smoothstep(-0.5, 0.8, d.y));
        gl_FragColor = vec4(mix(sky, under, uUnder), 1.0);
      }
    `,
  }),
);
domo.frustumCulled = false;
domo.renderOrder = -10;
scene.add(domo);

// ---------------------------------------------------------------- superficie del océano
const ring = C.agua.anillo;
const aguaMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: {
    ...U,
    uRefl: { value: reflectRT.texture },
    uEntry: { value: E },
    uEntryT: { value: T.picada[1] },
    uReflI: { value: C.agua.reflejo },
    uFrag: { value: C.agua.fragmentacion },
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
    ${GLSL_COMMON}
    uniform sampler2D uRefl;
    uniform vec3 uEntry, uRing, uAzul, uHorizon, uHead;
    uniform float uEntryT, uReflI, uFrag, uDist, uWave, uHeadI;
    varying vec3 vWorld;

    vec2 waveGrad(vec2 p, float t) {
      vec2 g = vec2(0.0);
      vec2 d;
      d = normalize(vec2(0.2, 1.0));   g += d * 0.10 * 0.35 * cos(dot(d, p) * 0.35 + t * 0.9);
      d = normalize(vec2(-0.5, 0.85)); g += d * 0.05 * 0.62 * cos(dot(d, p) * 0.62 + t * 1.3);
      d = normalize(vec2(0.8, 0.6));   g += d * 0.025 * 1.1 * cos(dot(d, p) * 1.1 + t * 1.9);
      d = normalize(vec2(-0.9, 0.3));  g += d * 0.012 * 1.9 * cos(dot(d, p) * 1.9 + t * 2.6);
      return g;
    }

    void main() {
      vec3 V = normalize(cameraPosition - vWorld);
      vec2 g = waveGrad(vWorld.xz, uTime) * uWave;

      // onda circular del ingreso del haz
      float te = uTime - uEntryT;
      float dE = distance(vWorld.xz, uEntry.xz);
      float ringR = max(te, 0.0) * uRing.x;
      float ringA = te > 0.0 ? exp(-te / (uRing.z * 0.45)) : 0.0;
      float ringN = (dE - ringR) / uRing.y;
      float ring = exp(-ringN * ringN) * ringA;
      float ring2 = exp(-pow((dE - ringR * 0.62) / (uRing.y * 0.8), 2.0)) * ringA * 0.5;
      vec2 radial = dE > 1e-3 ? (vWorld.xz - uEntry.xz) / dE : vec2(0.0);
      g += radial * (-ringN * (ring + ring2)) * 0.35;
      vec3 N = normalize(vec3(-g.x, 1.0, -g.y));

      float flash = te > 0.0 ? (1.0 - exp(-te * 30.0)) * exp(-te / 0.4) : 0.0;
      vec3 luz = uAzul * (flash * exp(-dE * dE / 3.5) * 1.1 + (ring + ring2) * 0.45);
      // el haz se ve a través del agua mientras se hunde
      float hd = max(-uHead.y, 0.0);
      vec2 dh = vWorld.xz - uHead.xz;
      luz += uAzul * uHeadI * step(0.0, te) * exp(-dot(dh, dh) / (3.0 + hd * hd * 0.6)) * exp(-hd / 5.0) * 0.5;

      vec3 col;
      if (cameraPosition.y >= 0.0) {
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        vec3 skyR = mix(uHorizon, vec3(0.0), smoothstep(0.0, 0.3, R.y));
        col = skyR * fres * 1.15;

        // reflejo de los drones: desplazado por el oleaje, estirado en vertical y fragmentado
        vec2 uv = gl_FragCoord.xy / uRes;
        vec2 off = g * uDist * 8.0;
        vec3 refl = vec3(0.0);
        float sm = 0.006 + 0.02 * uFrag;
        for (int k = -3; k <= 3; k++) {
          float fk = float(k);
          refl += texture2D(uRefl, uv + off + vec2(0.0, fk * sm / 3.0)).rgb * (1.0 - abs(fk) / 4.0);
        }
        refl /= 4.0;
        float n1 = vnoise(vec2(vWorld.x * 0.45, vWorld.z * 2.4) + vec2(uTime * 0.35, uTime * 1.05));
        float n2 = vnoise(vec2(vWorld.x * 1.1, vWorld.z * 5.5) - vec2(uTime * 0.6, uTime * 0.7));
        float mask = mix(1.0, smoothstep(0.38, 0.72, n1 * 0.65 + n2 * 0.35), uFrag);
        col += refl * uReflI * mask * (0.55 + 0.45 * fres);

        // bruma de distancia hacia el horizonte
        float dist = distance(cameraPosition, vWorld);
        col = mix(col, uHorizon * 1.1, smoothstep(250.0, 2500.0, dist) * 0.85);

        // cerca de la superficie el agua deja ver su interior: empalma con el plano submarino
        float cerca = smoothstep(2.6, 0.0, cameraPosition.y);
        col = mix(col, waterColorAt(-1.5), cerca * (1.0 - fres) * 0.9);
        col += luz;
      } else {
        // desde abajo: ventana de Snell tenue y reflexión interna total alrededor
        float cosT = -V.y;
        float win = smoothstep(0.6, 0.72, cosT);
        col = mix(uFogTop * 0.75, uFogTop * 1.9, win) + luz * 1.2;
        float f = underFog(vWorld);
        col = mix(col, waterColorAt(cameraPosition.y * 0.5), f);
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const agua = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), aguaMat);
agua.rotation.x = -Math.PI / 2;
agua.renderOrder = 0;
scene.add(agua);

// ---------------------------------------------------------------- lecho marino
const lechoGeo = new THREE.PlaneGeometry(240, 240, 220, 220);
lechoGeo.rotateX(-Math.PI / 2);
lechoGeo.translate(S.x, 0, S.z);
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
    uPulse: { value: new THREE.Vector3(0, 0, pulso.ancho) }, // radio, intensidad, ancho
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
    ${GLSL_COMMON}
    uniform vec3 uS, uAlbedo, uPulse, uAzul, uHead;
    uniform float uHeadI;
    varying vec3 vWorld;
    varying vec3 vNormal;
    void main() {
      vec3 N = normalize(vNormal);
      // textura fina de sedimento
      float grano = 0.92 + 0.16 * vnoise(vWorld.xz * 3.1) * vnoise(vWorld.xz * 0.7 + 9.0);
      vec3 alb = uAlbedo * grano;
      vec3 L = uHead - vWorld;
      float d2 = dot(L, L);
      float diff = max(dot(N, L * inversesqrt(d2)), 0.0);
      vec3 luzHaz = mix(vec3(1.0), uAzul, 0.5) * uHeadI * 3.0 / (1.0 + d2 / 110.0);
      vec3 col = alb * luzHaz * diff;
      // pulso: anillo azul que se expande sobre el suelo
      float dr = distance(vWorld.xz, uS.xz);
      float anillo = exp(-pow((dr - uPulse.x) / uPulse.z, 2.0)) * uPulse.y;
      col += (alb * 1.4 * (0.35 + 0.65 * max(N.y, 0.0)) + uAzul * 0.35) * uAzul * anillo;
      // luz residual muy baja desde la superficie
      col += alb * uFogTop * 0.25 * max(N.y, 0.0);
      float f = underFog(vWorld);
      gl_FragColor = vec4(mix(col, waterColorAt(mix(cameraPosition.y, vWorld.y, 0.5)), f), 1.0);
    }
  `,
});
const lecho = new THREE.Mesh(lechoGeo, lechoMat);
scene.add(lecho);

function updatePulso(t) {
  const s = (t - T.pulso[0]) / (T.pulso[1] - T.pulso[0]);
  const v = lechoMat.uniforms.uPulse.value;
  if (s <= 0) return v.set(0, 0, pulso.ancho);
  v.x = pulso.radioMax * easeOutCubic(s);
  v.y = (1 - clamp(s)) ** 1.6 * smoothstep(0, 0.05, t - T.pulso[0]) * 1.4;
  v.z = pulso.ancho * (1 + 1.5 * clamp(s));
}

// ---------------------------------------------------------------- nieve marina (partículas suspendidas)
const rndAgua = mulberry32(C.semilla + 101);
const NS = C.submarino.nieve;
const nievePos = new Float32Array(NS * 3);
const nieveSeed = new Float32Array(NS);
for (let i = 0; i < NS; i++) {
  nievePos[i * 3] = lerp(-8, 46, rndAgua());
  nievePos[i * 3 + 1] = lerp(-C.recorrido.profundidad - 2, -0.8, rndAgua() ** 0.85);
  nievePos[i * 3 + 2] = lerp(-104, -38, rndAgua());
  nieveSeed[i] = rndAgua();
}
const nieveGeo = new THREE.BufferGeometry();
nieveGeo.setAttribute("position", new THREE.BufferAttribute(nievePos, 3));
nieveGeo.setAttribute("aSeed", new THREE.BufferAttribute(nieveSeed, 1));
const nieveMat = new THREE.ShaderMaterial({
  ...additive,
  uniforms: { ...U, uS: { value: S }, uPulse: lechoMat.uniforms.uPulse },
  vertexShader: /* glsl */ `
    ${GLSL_COMMON}
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
      float luz = 0.05 + 0.05 * aSeed + uHeadI * 1.8 / (1.0 + dot(dh, dh) / 6.0);
      float dr = distance(p.xz, uS.xz);
      luz += uPulse.y * exp(-pow((dr - uPulse.x) / 2.5, 2.0)) * exp(-abs(p.y - uS.y) / 3.0) * 1.2;
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
});
const nieve = new THREE.Points(nieveGeo, nieveMat);
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
  const dirAgua = CtrlWater.clone().sub(E).normalize();
  for (let i = 0; i < NB; i++) {
    const prof = 0.4 + rndAgua() * 6;
    const p = E.clone().addScaledVector(dirAgua, prof);
    p.x += (rndAgua() - 0.5) * 0.8;
    p.z += (rndAgua() - 0.5) * 0.8;
    p.toArray(bOrigen, i * 3);
    // aparición, radio (m), velocidad de ascenso, semilla
    bParam.set(
      [
        T.picada[1] + prof * 0.03 + rndAgua() * 0.15,
        0.04 + rndAgua() ** 2 * 0.09,
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
const burbMat = new THREE.ShaderMaterial({
  ...additive,
  uniforms: { ...U },
  vertexShader: /* glsl */ `
    ${GLSL_COMMON}
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
      vB = vis * uUnder * (0.25 + uHeadI * 1.2 / (1.0 + dot(dh, dh) / 4.0)) * (1.0 - underFog(p) * 0.7);
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
});
const burbujas = new THREE.Mesh(burbGeo, burbMat);
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
      E.x + lerp(-16, 22, (i + rndAgua() * 0.6) / NR),
      E.z + lerp(-26, 8, rndAgua()),
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
const rayMat = new THREE.ShaderMaterial({
  ...additive,
  uniforms: { ...U },
  vertexShader: /* glsl */ `
    ${GLSL_COMMON}
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
    uniform vec3 uFogTop, uAzul;
    varying vec2 vUv;
    varying float vB;
    void main() {
      float a = exp(-vUv.x * vUv.x * 3.0) * pow(1.0 - vUv.y, 2.2) * smoothstep(0.0, 0.04, vUv.y);
      gl_FragColor = vec4(mix(uFogTop * 2.4, uAzul, 0.15) * a * vB * 0.35, 1.0);
    }
  `,
});
const rayos = new THREE.Mesh(rayGeo, rayMat);
rayos.frustumCulled = false;
rayos.renderOrder = 2;
scene.add(rayos);

// ---------------------------------------------------------------- render por tiempo
const fundido = document.getElementById("fundido");
function renderAt(time) {
  const t = clamp(Number(time) || 0, 0, C.duracion);
  U.uTime.value = t;
  cameraAt(t);
  domo.position.copy(camera.position);
  U.uUnder.value = camera.position.y < 0 ? 1 : 0;
  updatePunta(t);
  updateTrail(t);
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
    renderer.setRenderTarget(reflectRT);
    renderer.clear();
    renderer.render(scene, mirrorCam);
    U.uReflectPass.value = 0;
    U.uDpr.value = DPR;
    U.uRes.value.set(W * DPR, H * DPR);
  }
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  fundido.style.opacity = String(1 - smoothstep(0, T.fundidoEntrada, t));
}

window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
renderAt(window.__hfThreeTime || 0);

// Diagnóstico para revisión (no afecta al render).
window.__cirion = { drones: N, renderAt, logoW, K: K.toArray(), S: S.toArray() };
