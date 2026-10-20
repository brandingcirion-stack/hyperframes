// Cirion · Drones sobre la ciudad — escena Three.js controlada por tiempo (12 s).
// Cada cuadro se calcula solo a partir de `t` (evento hf-seek de HyperFrames):
// sin reloj del navegador, sin requestAnimationFrame y con semilla fija.
//
// Narrativa: el show de drones forma el logo → los drones dejan el logo en orden y
// entran a una corriente → la corriente se concentra en una cabeza luminosa que baja en
// curva al agua → bajo el agua la cabeza revela el cable sobre la misma trayectoria →
// el cable queda apoyado en el lecho y un pulso de datos lo recorre.
import * as THREE from "../vendor/three.module.min.js";
import { createCable } from "./cable.js";
import { createCamara } from "./camera.js";
import { createCity } from "./city.js";
import { CONFIG } from "./config.js";
import { COMMON } from "./glsl.js";
import { LOGO } from "./logo-data.js";
import { sampleLogo } from "./logo-sampler.js";
import { createTrayectoria } from "./path.js";
import { createPost } from "./post.js";
import { clamp, lerp, makeNoise2D, mulberry32, smootherstep, smoothstep } from "./util.js";

const C = CONFIG;
const T = C.tiempos;
const W = C.base.ancho;
const H = C.base.alto;
const DPR = window.devicePixelRatio || 1; // 1 en el preview; 2 en el master
const DT = 1 / C.fps;
const color = (hex) => new THREE.Color(hex);
const COL = Object.fromEntries(Object.entries(C.colores).map(([k, v]) => [k, color(v)]));
const blancoAzul = color("#E3F6FF");
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
const camera = new THREE.PerspectiveCamera(C.camara.fov, W / H, 0.1, 9000);
const camPrev = camera.clone();
const tanHalf = Math.tan(THREE.MathUtils.degToRad(C.camara.fov / 2));
const rtW = Math.round((W * DPR) / 2);
const rtH = Math.round((H * DPR) / 2);
const reflectRT = new THREE.WebGLRenderTarget(rtW, rtH, { type: THREE.HalfFloatType });
const mirrorCam = camera.clone();
mirrorCam.matrixAutoUpdate = false;
mirrorCam.matrixWorldAutoUpdate = false;
mirrorCam.layers.set(1);
const MIRROR = new THREE.Matrix4().makeScale(1, -1, 1);

const U = {
  uTime: { value: 0 },
  uDpr: { value: DPR },
  uRes: { value: new THREE.Vector2(W * DPR, H * DPR) },
  uTanHalf: { value: tanHalf },
  uReflectPass: { value: 0 },
  uUnder: { value: 0 },
  uFogDensity: { value: C.agua.niebla },
  uFogTop: { value: COL.azulProfundo.clone().multiplyScalar(1.4) },
  uFogBottom: { value: color("#000C26") },
  uFondo: { value: C.trayectoria.profundidad },
  uHaze: { value: COL.bruma },
  uHazeDensity: { value: C.atmosfera.bruma },
  uAzul: { value: COL.azul },
  uMagenta: { value: COL.magenta },
  uHead: { value: new THREE.Vector3(0, -999, 0) },
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

// ---------------------------------------------------------------- lecho de la bahía
const TR = C.trayectoria;
const PROF = TR.profundidad;
const noise = makeNoise2D(C.semilla + 7);
// pasillo de arena casi plano donde se apoya el cable (rumbo y curvatura del tendido)
const hLecho = V3(TR.direccionLecho).normalize();
const hLecho2 = hLecho.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), TR.curvaLecho);
const ap = new THREE.Vector2(TR.apoyo[0], TR.apoyo[2]);
const h2d = new THREE.Vector2(hLecho.x, hLecho.z);
const h2d2 = new THREE.Vector2(hLecho2.x, hLecho2.z);
const pasillo = [
  ap.clone().addScaledVector(h2d, -14),
  ap.clone(),
  ap.clone().addScaledVector(h2d, TR.largoApoyo * 0.5),
  ap
    .clone()
    .addScaledVector(h2d, TR.largoApoyo * 0.5)
    .addScaledVector(h2d2, TR.largoApoyo * 0.6),
];
function distPasillo(x, z) {
  let best = 1e9;
  for (let i = 0; i < pasillo.length - 1; i++) {
    const a = pasillo[i];
    const b = pasillo[i + 1];
    const abx = b.x - a.x;
    const abz = b.y - a.y;
    const f = clamp(((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz));
    best = Math.min(best, Math.hypot(x - a.x - abx * f, z - a.y - abz * f));
  }
  return best;
}
function relieve(x, z) {
  let h = 0.7 * noise(x * 0.05, z * 0.05) + 0.3 * noise(x * 0.13 + 7, z * 0.13 - 3);
  const r = noise(x * 0.11 - 20, z * 0.11 + 31);
  h += Math.max(0, r - 0.45) * 2.2; // rocas bajas
  return h * (0.12 + 0.88 * smoothstep(3, 9, distPasillo(x, z)));
}
const seabedY = (x, z) => -PROF + relieve(x, z);

// ---------------------------------------------------------------- logo 3D
const claves = C.camara.claves;
const C0 = V3(claves[0].pos);
const K = V3(C.logo.centro);
const lFront = new THREE.Vector3(C0.x - K.x, 0, C0.z - K.z)
  .normalize()
  .applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(C.logo.giro));
const lUp = new THREE.Vector3(0, 1, 0);
const lRight = new THREE.Vector3().crossVectors(lFront.clone().negate(), lUp).normalize();
const Kc = K.clone().addScaledVector(lFront, -C.logo.profundidad / 2);

const rnd = mulberry32(C.semilla);
const muestras = sampleLogo(LOGO, { ...C.logo, semilla: C.semilla });
const [vbx, vby, vbw, vbh] = LOGO.viewBox;
const escalaLogo = C.logo.ancho / vbw;
const targets = [];
for (const m of muestras) {
  const u = (m.x - (vbx + vbw / 2)) * escalaLogo;
  const v = -(m.y - (vby + vbh / 2)) * escalaLogo;
  const c = m.role === "simbolo" ? color(m.fill) : COL.letrasLogo;
  const niveles = m.borde ? C.logo.capasProfundidad + 1 : 1;
  for (let k = 0; k < niveles; k++) {
    const prof = (C.logo.profundidad * k) / C.logo.capasProfundidad;
    const p = K.clone()
      .addScaledVector(lRight, u)
      .addScaledVector(lUp, v)
      .addScaledVector(lFront, -prof);
    targets.push({ u, v, prof, p, c, capa: k });
  }
}
const N = targets.length;
const uMin = Math.min(...targets.map((t) => t.u));
const uMax = Math.max(...targets.map((t) => t.u));
const maxDist = Math.max(...targets.map((t) => Math.hypot(t.u, t.v)));

// boca de la corriente: a la derecha del logo, en su cara frontal; la corriente sigue
// la dirección de lectura y luego dobla hacia el agua
const H0 = K.clone().addScaledVector(lRight, C.logo.ancho / 2 + TR.salidaLateral);
const T0 = lRight.clone().addScaledVector(lUp, -0.12).normalize();

// tiempos de cada dron: formación desde el centro, salida ordenada de derecha a izquierda
const dr = C.drones;
const D = targets.map((tg) => {
  const dCentro = Math.hypot(tg.u, tg.v) / maxDist;
  const ini = Kc.clone()
    .addScaledVector(lRight, tg.u * 0.16 + (rnd() - 0.5) * 2)
    .addScaledVector(lUp, tg.v * 0.16 + (rnd() - 0.5) * 2)
    .addScaledVector(lFront, (rnd() - 0.5) * 4);
  const [f0, f1] = T.formacion;
  const fd = 0.7 + 0.8 * dCentro + rnd() * 0.06;
  const fs = f0 + Math.min(f1 - f0 - fd, 1.1 * dCentro ** 0.85 + tg.capa * 0.04 + rnd() * 0.05);
  const orden = 1 - (tg.u - uMin) / (uMax - uMin); // 0 = extremo derecho (sale primero)
  const [s0, s1] = T.salidas;
  const salida = s0 + orden * (s1 - s0) + tg.capa * 0.025 + rnd() * 0.04;
  const viaje = Math.max(0.45, tg.p.distanceTo(H0) / dr.velocidadCorriente);
  return {
    ini,
    fs,
    fd,
    bulto: 9 * (0.6 + 0.4 * rnd()),
    salida,
    viaje,
    entrada: salida + viaje,
    fase: rnd() * 40,
    brillo: dr.brilloCapas[Math.min(tg.capa, dr.brilloCapas.length - 1)],
  };
});
const tCabeza = Math.min(...D.map((d) => d.entrada));

// ---------------------------------------------------------------- trayectoria maestra
const R_CABLE = C.cable.diametro / 2;
const tray = createTrayectoria({ C, H0, T0, seabedY, radio: R_CABLE, tCabeza });
const E = tray.E;
// velocidad de llegada a la boca y tiempo de alcance de cada dron
for (const d of D) {
  d.vA = Math.max(60, tray.vHead(d.entrada) + 20);
  d.lag0 = tray.sHead(d.entrada);
  d.tc = clamp(d.lag0 / (d.vA * 0.5), 0.25, 0.8);
  d.g0 = d.lag0 > 0.01 ? -((d.vA - tray.vHead(d.entrada)) * d.tc) / d.lag0 : -3;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
// Posición de un dron en t (función pura) y su opacidad.
function droneAt(i, t, out) {
  const tg = targets[i];
  const d = D[i];
  if (t < d.salida) {
    const s = clamp((t - d.fs) / d.fd);
    const p = smootherstep(s);
    out
      .copy(d.ini)
      .lerp(tg.p, p)
      .addScaledVector(lFront, d.bulto * Math.sin(Math.PI * p));
    // flotación mínima de un dron real durante el sostén (se apaga antes de salir)
    const hov = 0.15 * smoothstep(2.7, 3.3, t) * (1 - smoothstep(3.9, T.salidas[0] - 0.05, t));
    out
      .addScaledVector(lUp, Math.sin(t * 1.1 + d.fase) * hov)
      .addScaledVector(lRight, Math.cos(t * 0.9 + d.fase * 0.6) * hov);
    return smoothstep(0.08, 0.5, p);
  }
  if (t < d.entrada) {
    // Hermite: desde el reposo en el logo hasta la boca, con la tangente de la trayectoria
    const u = (t - d.salida) / d.viaje;
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    _v.copy(lFront).multiplyScalar(22).addScaledVector(lUp, 3); // despegue hacia el espectador
    _w.copy(T0).multiplyScalar(d.vA);
    out
      .copy(tg.p)
      .multiplyScalar(h00)
      .addScaledVector(_v, h10 * d.viaje)
      .addScaledVector(H0, h01)
      .addScaledVector(_w, h11 * d.viaje);
    return 1;
  }
  // en la trayectoria: alcanza a la cabeza y se funde en ella
  const r = clamp((t - d.entrada) / d.tc);
  const g = r >= 1 ? 0 : 2 * r ** 3 - 3 * r * r + 1 + d.g0 * (r ** 3 - 2 * r * r + r);
  const lag = Math.max(0, d.lag0 * g);
  const s = Math.max(0, tray.sHead(t) - lag);
  tray.P(s, out);
  // se apaga al acercarse a la cabeza: su luz pasa a la cabeza (haz angosto, sin masa)
  return smoothstep(1, 24, lag) * (r >= 1 ? 0 : 1) * (1 - smoothstep(tray.sE - 4, tray.sE, s));
}

const droneGeo = new THREE.InstancedBufferGeometry();
droneGeo.index = quad.index;
droneGeo.setAttribute("position", quad.getAttribute("position"));
const aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(
  THREE.DynamicDrawUsage,
);
const aPrev = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(
  THREE.DynamicDrawUsage,
);
const aCol = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(
  THREE.DynamicDrawUsage,
);
droneGeo.setAttribute("aPos", aPos);
droneGeo.setAttribute("aPrev", aPrev);
droneGeo.setAttribute("aCol", aCol);
droneGeo.instanceCount = N;
const droneMat = new THREE.ShaderMaterial({
  ...additive,
  uniforms: {
    ...U,
    uSize: { value: dr.tamano },
    uHalo: { value: dr.halo },
    uI: { value: dr.intensidad },
    uHaloI: { value: dr.intensidadHalo },
    uStreakMax: { value: dr.estelaMax },
    uRefDist: { value: 380 },
  },
  vertexShader: /* glsl */ `
    ${COMMON}
    attribute vec3 aPos, aPrev;
    attribute vec4 aCol;
    uniform mat4 uPrevVP;
    uniform float uSize, uHalo, uStreakMax, uRefDist;
    varying vec2 vLocal;
    varying float vHalfLen, vSize, vHalo, vAlpha;
    varying vec3 vColor;
    void main() {
      vec4 c = projectionMatrix * viewMatrix * vec4(aPos, 1.0);
      // estela de movimiento real en pantalla (incluye el movimiento de cámara), acotada
      vec4 cp = (uReflectPass > 0.5 ? projectionMatrix * viewMatrix : uPrevVP) * vec4(aPrev, 1.0);
      vec2 sp = c.xy / c.w * 0.5 * uRes;
      vec2 spp = cp.xy / cp.w * 0.5 * uRes;
      vec2 vel = sp - spp;
      float speed = length(vel);
      vec2 dir = speed > 1e-3 ? vel / speed : vec2(1.0, 0.0);
      vec2 perp = vec2(-dir.y, dir.x);
      float persp = clamp(uRefDist / distance(aPos, cameraPosition), 0.6, 2.4);
      float size = uSize * uDpr * persp;
      float halo = uHalo * uDpr * persp;
      float L = min(speed * 0.5, uStreakMax * uDpr * 0.5);
      float R = halo * 2.4;
      vLocal = vec2(position.x * (L + R), position.y * R);
      vHalfLen = L;
      vSize = size;
      vHalo = halo;
      gl_Position = c;
      gl_Position.xy += (dir * position.x * (L + R) + perp * position.y * R) / (0.5 * uRes) * c.w;
      vColor = aCol.rgb;
      vAlpha = aCol.a * sqrt(size / (size + L)) * atmosLight(aPos) * (c.w > 0.0 && cp.w > 0.0 ? 1.0 : 0.0);
      if (uReflectPass > 0.5 && aPos.y < 0.0) vAlpha = 0.0;
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
const azulLin = COL.azul;
const _p = new THREE.Vector3();
let absorbidos = 0;
function updateDrones(t) {
  const pa = aPos.array;
  const pp = aPrev.array;
  const ca = aCol.array;
  let fundidos = 0;
  for (let i = 0; i < N; i++) {
    const a = droneAt(i, t, _p);
    pa[i * 3] = _p.x;
    pa[i * 3 + 1] = _p.y;
    pa[i * 3 + 2] = _p.z;
    droneAt(i, t - DT, _p);
    pp[i * 3] = _p.x;
    pp[i * 3 + 1] = _p.y;
    pp[i * 3 + 2] = _p.z;
    const d = D[i];
    // durante la corriente el color del logo se carga de energía azul
    const k = t < d.salida ? 0 : t < d.entrada ? 0.35 * ((t - d.salida) / d.viaje) : 0.7;
    const c = targets[i].c;
    ca[i * 4] = (c.r + (azulLin.r - c.r) * k) * d.brillo;
    ca[i * 4 + 1] = (c.g + (azulLin.g - c.g) * k) * d.brillo;
    ca[i * 4 + 2] = (c.b + (azulLin.b - c.b) * k) * d.brillo;
    ca[i * 4 + 3] = a;
    if (t >= d.entrada + d.tc) fundidos++;
  }
  absorbidos = fundidos / N;
  aPos.needsUpdate = aPrev.needsUpdate = aCol.needsUpdate = true;
  drones.visible = t > T.formacion[0] - 0.05 && absorbidos < 1;
}

// ---------------------------------------------------------------- cabeza luminosa
function luzMaterial() {
  return new THREE.ShaderMaterial({
    ...additive,
    uniforms: {
      ...U,
      uPos: { value: new THREE.Vector3() },
      uCorePx: { value: C.haz.cabezaPx },
      uHaloPx: { value: C.haz.haloPx },
      uScatterM: { value: 0 },
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
        float dist = distance(uPos, cameraPosition);
        // bajo el agua el sprite se adelanta unos metros hacia la cámara (mismo tamaño en
        // pantalla) para que el halo no se recorte contra el lecho cercano
        vec3 haciaCam = (cameraPosition - uPos) / max(dist, 1e-3);
        vec4 c = projectionMatrix * viewMatrix * vec4(uPos + haciaCam * min(dist * 0.4, 4.0) * uUnder, 1.0);
        float pxPerM = uRes.y / (2.0 * dist * uTanHalf);
        float persp = clamp(60.0 / dist, 1.0, 2.2);
        vCore = uCorePx * uDpr * persp;
        vHalo = uHaloPx * uDpr * persp;
        vScatter = max(uScatterM * pxPerM, 1.0);
        float R = min(max(max(vHalo * 3.0, vScatter * 2.6), 40.0 * uDpr), uRes.y * 0.9);
        vLocal = position.xy * R;
        vLuz = atmosLight(uPos);
        gl_Position = c;
        gl_Position.xy += position.xy * R / (0.5 * uRes) * c.w;
        if (c.w <= 0.0 || (uReflectPass > 0.5 && uPos.y < 0.0)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform float uI, uScatterM;
      uniform vec3 uColCore, uAzul, uMagenta;
      varying vec2 vLocal;
      varying float vCore, vHalo, vScatter, vLuz;
      void main() {
        float d2 = dot(vLocal, vLocal);
        float core = exp(-d2 / (vCore * vCore));
        float halo = exp(-d2 / (vHalo * vHalo));
        float rim = exp(-d2 / (vHalo * vHalo * 3.0));
        float scatter = uScatterM > 0.0 ? exp(-d2 / (vScatter * vScatter)) : 0.0;
        vec3 col = uColCore * core * 5.0 + uAzul * halo * 1.2 + uMagenta * rim * 0.06 + uAzul * scatter * 0.3;
        gl_FragColor = vec4(col * uI * vLuz, 1.0);
      }
    `,
  });
}
const cabezaMat = luzMaterial();
const cabeza = new THREE.Mesh(quad, cabezaMat);
cabeza.frustumCulled = false;
cabeza.layers.enable(1);
cabeza.renderOrder = 8;
scene.add(cabeza);
// pulso de datos (luz que recorre el cable al final)
const pulsoMat = luzMaterial();
pulsoMat.uniforms.uCorePx.value = 1.4;
pulsoMat.uniforms.uHaloPx.value = 7;
pulsoMat.uniforms.uScatterM.value = 0.9;
const pulsoSprite = new THREE.Mesh(quad, pulsoMat);
pulsoSprite.frustumCulled = false;
pulsoSprite.renderOrder = 8;
scene.add(pulsoSprite);

// ---------------------------------------------------------------- estela (tramo de la trayectoria detrás de la cabeza)
const NE = 120;
const estelaGeo = new THREE.BufferGeometry();
estelaGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NE * 2 * 3), 3));
estelaGeo.setAttribute("aUV", new THREE.BufferAttribute(new Float32Array(NE * 2 * 2), 2));
{
  const idx = [];
  for (let i = 0; i < NE - 1; i++)
    idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  estelaGeo.setIndex(idx);
}
const estelaMat = new THREE.ShaderMaterial({
  ...additive,
  uniforms: { ...U, uI: { value: 0 }, uColA: { value: blancoAzul } },
  vertexShader: /* glsl */ `
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
    ${COMMON}
    uniform float uI;
    uniform vec3 uColA, uAzul, uMagenta;
    varying vec2 vUV;
    varying vec3 vWorld;
    void main() {
      if (uReflectPass > 0.5 && vWorld.y < 0.0) discard;
      float u = vUV.x;
      float v = vUV.y;
      float across = exp(-v * v * 5.0);
      float linea = exp(-v * v * 40.0);
      float borde = exp(-pow(abs(v) - 0.75, 2.0) * 30.0);
      vec3 col = uAzul * across * 0.9 * pow(u, 1.5) + uColA * linea * pow(u, 3.0) * 0.9 + uMagenta * borde * pow(u, 2.0) * 0.12;
      gl_FragColor = vec4(col * uI * atmosLight(vWorld), 1.0);
    }
  `,
});
const estela = new THREE.Mesh(estelaGeo, estelaMat);
estela.frustumCulled = false;
estela.layers.enable(1);
estela.renderOrder = 7;
scene.add(estela);
const _a = new THREE.Vector3();
const _t = new THREE.Vector3();
const _vw = new THREE.Vector3();
const _sd = new THREE.Vector3();
function updateEstela(t, sH, intensidad) {
  // la estela es el recorrido reciente de la cabeza: al frenar en el agua, su cola sigue
  // entrando por la misma trayectoria durante estelaS (no se acorta de golpe)
  const L = clamp(sH - tray.sHead(t - C.haz.estelaS), C.haz.estelaMin, C.haz.estelaMax);
  const s0 = Math.max(0, sH - L);
  estela.visible = intensidad > 0.001 && sH > 0.05;
  if (!estela.visible) return;
  const pos = estelaGeo.attributes.position;
  const uv = estelaGeo.attributes.aUV;
  for (let i = 0; i < NE; i++) {
    const f = i / (NE - 1);
    const s = s0 + (sH - s0) * f;
    tray.P(s, _a);
    tray.Tg(s, _t);
    _vw.subVectors(camera.position, _a);
    const dist = Math.max(_vw.length(), 0.3);
    _vw.normalize();
    _sd.crossVectors(_t, _vw);
    if (_sd.lengthSq() < 1e-8) _sd.set(1, 0, 0);
    _sd.normalize();
    const ancho = ((C.haz.anchoPx * 2 * dist * tanHalf) / H) * (0.25 + 0.75 * f ** 0.6);
    pos.setXYZ(i * 2, _a.x + _sd.x * ancho, _a.y + _sd.y * ancho, _a.z + _sd.z * ancho);
    pos.setXYZ(i * 2 + 1, _a.x - _sd.x * ancho, _a.y - _sd.y * ancho, _a.z - _sd.z * ancho);
    uv.setXY(i * 2, f, 1);
    uv.setXY(i * 2 + 1, f, -1);
  }
  pos.needsUpdate = uv.needsUpdate = true;
  estelaMat.uniforms.uI.value = intensidad;
}

// ---------------------------------------------------------------- cable
const cable = createCable({ U, C, scene, tray });

// ---------------------------------------------------------------- ciudad
// las torres que caerían detrás del logo (vistas desde la cámara inicial) no lo tapan
const aziLogo = [-C.logo.ancho / 2 - 40, C.logo.ancho / 2 + 60].map((u) => {
  const p = K.clone().addScaledVector(lRight, u);
  return Math.atan2(p.x - C0.x, -(p.z - C0.z));
});
const elevBase = Math.atan2(K.y - C.logo.ancho * 0.22 - C0.y, Math.hypot(K.x - C0.x, K.z - C0.z));
const ciudad = createCity({
  U,
  C,
  scene,
  extras: {
    patrimonio: [-450, -530],
    reservado: [[-450, -530]],
    alturaMax: (x, z) => {
      const az = Math.atan2(x - C0.x, -(z - C0.z));
      if (az < aziLogo[0] || az > aziLogo[1]) return Infinity;
      return C0.y + Math.hypot(x - C0.x, z - C0.z) * Math.tan(elevBase - 0.03);
    },
  },
});

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
        // cielo nocturno: casi negro arriba, resplandor urbano tenue y algo cálido abajo
        vec3 sky = uHaze * (0.1 + 2.2 * exp(-max(el, 0.0) * 8.0)) + vec3(0.012, 0.008, 0.005) * exp(-max(el, 0.0) * 14.0);
        if (el > 0.0) {
          vec2 cp = d.xz / (el + 0.08) * 0.8 + vec2(uTime * 0.01, 0.0);
          float nub = smoothstep(0.45, 0.8, fbm(cp * 1.1)) * smoothstep(0.0, 0.08, el) * (1.0 - smoothstep(0.2, 0.5, el));
          sky += uHaze * nub * uNubes * 4.0 * exp(-el * 5.0);
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

    // oleaje: mar de fondo largo + rizado anisótropo (crestas largas en x, cortas en z)
    vec2 oleaje(vec2 p, float t, float lejos) {
      vec2 g = vec2(0.0);
      vec2 d;
      d = normalize(vec2(0.15, 1.0)); g += d * 0.035 * cos(dot(d, p) * 0.35 + t * 0.8);
      d = normalize(vec2(-0.4, 0.9)); g += d * 0.03 * cos(dot(d, p) * 0.6 + t * 1.2);
      vec2 q = vec2(p.x * 0.22, p.y * 1.4) + vec2(t * 0.05, t * 0.5);
      float e = 0.12;
      float n0 = vnoise(q) + 0.5 * vnoise(q * 2.3 + 5.0);
      float nx = vnoise(q + vec2(e, 0.0)) + 0.5 * vnoise((q + vec2(e, 0.0)) * 2.3 + 5.0);
      float nz = vnoise(q + vec2(0.0, e)) + 0.5 * vnoise((q + vec2(0.0, e)) * 2.3 + 5.0);
      g += vec2((nx - n0) * 0.22, (nz - n0) * 1.4) / e * 0.07 * (1.0 - lejos * 0.6);
      return g;
    }

    void main() {
      vec3 V = normalize(cameraPosition - vWorld);
      float dist = distance(cameraPosition, vWorld);
      float lejos = smoothstep(120.0, 900.0, dist);
      vec2 g = oleaje(vWorld.xz, uTime, lejos) * uWave;
      // onda del ingreso de la cabeza
      float te = uTime - uEntryT;
      float dE = distance(vWorld.xz, uEntry.xz);
      float ringR = max(te, 0.0) * uRing.x;
      float ringA = te > 0.0 ? exp(-te / (uRing.z * 0.45)) : 0.0;
      float ringN = (dE - ringR) / uRing.y;
      float ringV = exp(-ringN * ringN) * ringA;
      float ring2 = exp(-pow((dE - ringR * 0.6) / (uRing.y * 0.8), 2.0)) * ringA * 0.5;
      vec2 radial = dE > 1e-3 ? (vWorld.xz - uEntry.xz) / dE : vec2(0.0);
      g += radial * (-ringN * (ringV + ring2)) * 0.25;
      vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
      // luz local del ingreso y de la cabeza bajo la superficie: llega refractada por las
      // ondas (se desplaza y se rompe en manchas), nunca como un disco liso
      float flash = te > 0.0 ? (1.0 - exp(-te * 30.0)) * exp(-te / 0.35) : 0.0;
      // La cabeza bajo el agua vista desde arriba: su imagen está donde la línea de visión
      // hacia su profundidad aparente (d / 1,33) corta la superficie, con el mismo tamaño
      // angular y la misma atenuación que bajo el agua. Así, al cruzar, coincide con ella.
      float hd = max(-uHead.y, 0.0);
      vec3 aparente = vec3(uHead.x, uHead.y / 1.33, uHead.z);
      float fr = clamp(cameraPosition.y / max(cameraPosition.y - aparente.y, 1e-3), 0.0, 1.0);
      vec2 centro = mix(cameraPosition.xz, aparente.xz, fr);
      vec2 dh = vWorld.xz + g * (1.0 + hd * 0.6) * fr - centro;
      float camino = distance(vec3(centro.x, 0.0, centro.y), uHead);
      float atenua = 1.0 - (1.0 - exp(-camino * uFogDensity)) * 0.6;
      float sigma2 = pow(2.0 + hd * 0.25, 2.0) * fr * fr + 1e-3;
      float manchas = 0.55 + 0.9 * smoothstep(0.35, 0.8, vnoise(vWorld.xz * 1.7 + g * 9.0 + uTime * vec2(0.3, 0.9)));
      float bajo = uHeadI * step(0.0, te) * exp(-dot(dh, dh) / sigma2) * atenua * step(0.05, hd)
                 * smoothstep(0.2, 1.5, cameraPosition.y); // a ras del agua manda la imagen de la cabeza
      vec3 luz = uAzul * (flash * exp(-dE * dE / 2.0) * 2.0 + bajo * mix(1.0, manchas, fr) * 0.5);
      // el anillo no emite: es rizado iluminado desde abajo por la cabeza
      luz += uAzul * (ringV + ring2) * (0.06 + bajo * 0.5);

      vec3 col;
      if (cameraPosition.y >= 0.0) {
        float NdV = max(dot(N, V), 0.0);
        float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
        // reflejo: desplazado por el oleaje; las luces se alargan en vertical y el rizado las fragmenta
        vec2 uv = gl_FragCoord.xy / uRes;
        vec2 off = vec2(g.x * 0.5, g.y * 1.3) * uDist * 8.0;
        float sm = 0.004 + 0.012 * smoothstep(20.0, 600.0, dist);
        vec3 refl = vec3(0.0);
        float wsum = 0.0;
        for (int k = -3; k <= 16; k++) {
          float fk = float(k);
          vec2 pk = vWorld.xz + vec2(0.0, fk * 1.7);
          float rotura = smoothstep(0.25, 0.7, vnoise(vec2(pk.x * 0.3, pk.y * 1.8) + uTime * vec2(0.1, 0.6)));
          float base = exp(-pow((fk - 3.0) / 7.0, 2.0));
          float wk = base * mix(1.0, rotura, 0.65 * (1.0 - lejos));
          float jit = (vnoise(vec2(vWorld.x * 0.4, fk * 3.1 + uTime * 0.6)) - 0.5) * 0.004;
          refl += texture2D(uRefl, uv + off + vec2(jit, -fk * sm)).rgb * wk;
          wsum += base;
        }
        refl /= wsum;
        // altas luces comprimidas y absorción leve del agua: sin reflejos blancos saturados
        refl = refl / (1.0 + dot(refl, vec3(0.3, 0.5, 0.2)) * 0.6) * vec3(0.8, 0.85, 0.9);
        col = vec3(0.0015, 0.0018, 0.0024) + refl * uReflI * (0.3 + 0.7 * F);
        luz *= 1.0 - F * 0.85; // a ras del agua domina el reflejo, no la luz de abajo
        col = mix(col, uHaze * 1.1, hazeAmount(vWorld) * 0.85);
        // mirando en picado desde poca altura se ve algo del interior del agua
        col += waterColorAt(-2.0) * (1.0 - F) * 0.4 * smoothstep(10.0, 1.0, cameraPosition.y) * smoothstep(60.0, 5.0, dist);
        // muy cerca de la superficie el agua deja ver su interior
        float cerca = smoothstep(0.9, 0.0, cameraPosition.y);
        col = mix(col, waterColorAt(-1.0), cerca * (1.0 - F) * 0.85);
        col += luz;
      } else {
        float cosT = -V.y;
        float win = smoothstep(0.6, 0.72, cosT);
        col = mix(uFogTop * 0.7, uFogTop * 1.6 + uHaze * 2.0, win) + luz * 1.2;
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
const PASO = 0.6;
const LADO = 220;
const lechoGeo = new THREE.PlaneGeometry(PASO * LADO, PASO * LADO, LADO, LADO);
lechoGeo.rotateX(-Math.PI / 2);
const lechoBase = Float32Array.from(lechoGeo.getAttribute("position").array);
const NCAB = 40; // puntos del cable para la sombra de contacto
const cabPts = Array.from({ length: NCAB }, () => new THREE.Vector4(0, -999, 0, 1e9));
const lechoMat = new THREE.ShaderMaterial({
  uniforms: {
    ...U,
    uAlbedo: { value: COL.lechoMarino },
    uCab: { value: cabPts },
    uReveal: { value: -1 },
    uR: { value: R_CABLE },
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
    uniform vec3 uAlbedo, uAzul, uHead, uPulsePos;
    uniform float uHeadI, uPulseI, uReveal, uR;
    uniform vec4 uCab[${NCAB}];
    varying vec3 vWorld;
    varying vec3 vNormal;
    float rizos(vec2 p) {
      return sin(dot(p, vec2(0.35, 0.94)) * 7.5 + vnoise(p * 0.25) * 6.0) * 0.04 * smoothstep(0.3, 0.75, vnoise(p * 0.12 + 3.0))
           + vnoise(p * 1.7) * 0.05;
    }
    void main() {
      vec2 p = vWorld.xz;
      float e = 0.05;
      float h0 = rizos(p);
      vec3 N = normalize(normalize(vNormal) + vec3(-(rizos(p + vec2(e, 0.0)) - h0) / e, 0.0, -(rizos(p + vec2(0.0, e)) - h0) / e) * 0.6);
      float grano = 0.85 + 0.3 * vnoise(p * 9.0) * vnoise(p * 2.1 + 9.0);
      vec3 alb = uAlbedo * grano;
      // sombra de contacto del cable (más blanda donde todavía no toca el lecho)
      float occ = 0.0;
      for (int i = 0; i < ${NCAB - 1}; i++) {
        vec4 a = uCab[i];
        vec4 b = uCab[i + 1];
        if (a.w > uReveal) break;
        vec2 ab = b.xz - a.xz;
        float f = clamp(dot(p - a.xz, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
        if (b.w > uReveal) f = min(f, (uReveal - a.w) / max(b.w - a.w, 1e-4));
        vec2 q = a.xz + ab * f;
        float alto = max(mix(a.y, b.y, f) - vWorld.y - uR, 0.0);
        float d = distance(p, q);
        float ancho = uR * 1.6 + alto * 0.5;
        occ = max(occ, exp(-d * d / (ancho * ancho)) * exp(-alto / 1.5));
      }
      float sombra = 1.0 - 0.82 * occ;
      vec3 L = uHead - vWorld;
      float d2 = dot(L, L);
      vec3 col = alb * mix(vec3(1.0), uAzul, 0.45) * uHeadI * 8.0 / (1.0 + d2 / 12.0) * max(dot(N, L * inversesqrt(d2)), 0.0);
      vec3 Lp = uPulsePos - vWorld;
      float dp2 = dot(Lp, Lp);
      col += alb * mix(vec3(1.0), uAzul, 0.55) * uPulseI * 6.0 / (1.0 + dp2 / 8.0) * max(dot(N, Lp * inversesqrt(dp2)), 0.0);
      col += alb * uFogTop * 2.4 * max(N.y, 0.0);
      col *= sombra;
      float f = underFog(vWorld);
      gl_FragColor = vec4(mix(col, waterColorAt(mix(cameraPosition.y, vWorld.y, 0.5)), f), 1.0);
    }
  `,
});
const lecho = new THREE.Mesh(lechoGeo, lechoMat);
lecho.frustumCulled = false;
scene.add(lecho);
{
  // puntos del cable desde poco antes del apoyo hasta el final del tendido
  const sA = tray.sTD - 10;
  const paso = (tray.largo - sA) / (NCAB - 1);
  for (let i = 0; i < NCAB; i++) {
    const s = Math.min(tray.largo, sA + i * paso);
    tray.P(s, _a);
    cabPts[i].set(_a.x, _a.y, _a.z, s);
  }
}
function updateLecho() {
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

// ---------------------------------------------------------------- nieve marina
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
    uniforms: { ...U, uCaja: { value: new THREE.Vector3(26, 16, 26) } },
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
        vec3 deriva = vec3(sin(uTime * 0.25 + aSeed.w * 31.0) * 0.08, uTime * 0.02, cos(uTime * 0.22 + aSeed.w * 11.0) * 0.08);
        vec3 p = cameraPosition + mod(base + deriva - cameraPosition, uCaja) - uCaja * 0.5;
        p.y = min(p.y, -0.2);
        vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0);
        vec4 cp = uPrevVP * vec4(p, 1.0);
        vec2 sp = c.xy / c.w * 0.5 * uRes;
        vec2 spp = cp.xy / cp.w * 0.5 * uRes;
        vec2 vel = sp - spp;
        float speed = length(vel);
        vec2 dir = speed > 1e-3 ? vel / speed : vec2(1.0, 0.0);
        vec2 perp = vec2(-dir.y, dir.x);
        float d = distance(p, cameraPosition);
        float r = clamp((0.008 + 0.01 * aSeed.w) * uRes.y / (2.0 * d * uTanHalf), 0.6 * uDpr, 2.6 * uDpr);
        float L = min(speed * 0.5, 4.0 * uDpr);
        vLocal = vec2(position.x * (L + r * 2.0), position.y * r * 2.0);
        vR = r;
        vL = L;
        vec3 dh = p - uHead;
        vec3 dp = p - uPulsePos;
        float luz = 0.05 + 0.05 * aSeed.w + uHeadI * 3.0 / (1.0 + dot(dh, dh) / 3.0) + uPulseI * 2.0 / (1.0 + dot(dp, dp) / 3.0);
        vB = luz * smoothstep(0.3, 1.2, d) * (1.0 - underFog(p) * 0.8) * uUnder * sqrt(r / (r + L));
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
        gl_FragColor = vec4(mix(vec3(0.75, 0.82, 0.88), uAzul, 0.3) * vB * a, 1.0);
      }
    `,
  }),
);
nieve.frustumCulled = false;
nieve.renderOrder = 3;
scene.add(nieve);

// ---------------------------------------------------------------- burbujas: en el ingreso y frente a la cámara al cruzar
const rig = createCamara({ C, tray, tCabeza });
const burbujasDef = [];
{
  const tAgua = T.picada[1];
  for (let i = 0; i < C.agua.burbujas; i++) {
    const prof = 0.3 + rndAgua() * 3.5;
    tray.P(tray.sE + prof * 1.15, _a);
    const ang = rndAgua() * Math.PI * 2;
    _a.x += Math.cos(ang) * (R_CABLE + 0.15 + rndAgua() * 0.4);
    _a.z += Math.sin(ang) * (R_CABLE + 0.15 + rndAgua() * 0.4);
    burbujasDef.push([
      _a.x,
      _a.y,
      _a.z,
      tAgua + prof * 0.06 + rndAgua() * 0.1,
      0.008 + rndAgua() ** 2 * 0.03,
      0.3 + rndAgua() * 0.4,
      rndAgua(),
    ]);
  }
  // pocas burbujas que la propia cámara arrastra al entrar
  const camCruce = rig.cameraAt(T.cruceCamara + 0.15, camera.clone());
  const cc = camCruce.position.clone();
  const fwd = camCruce.getWorldDirection(new THREE.Vector3());
  for (let i = 0; i < 6; i++) {
    const p = cc.clone().addScaledVector(fwd, 0.8 + rndAgua() * 1.6);
    p.x += (rndAgua() - 0.5) * 1.4;
    p.z += (rndAgua() - 0.5) * 1.4;
    p.y = -0.25 - rndAgua() * 0.8;
    burbujasDef.push([
      p.x,
      p.y,
      p.z,
      T.cruceCamara + rndAgua() * 0.15,
      0.012 + rndAgua() * 0.02,
      0.25 + rndAgua() * 0.25,
      rndAgua(),
    ]);
  }
}
const burbGeo = new THREE.InstancedBufferGeometry();
burbGeo.index = quad.index;
burbGeo.setAttribute("position", quad.getAttribute("position"));
burbGeo.setAttribute(
  "aOrigen",
  new THREE.InstancedBufferAttribute(
    Float32Array.from(burbujasDef.flatMap((b) => b.slice(0, 3))),
    3,
  ),
);
burbGeo.setAttribute(
  "aParam",
  new THREE.InstancedBufferAttribute(
    Float32Array.from(burbujasDef.flatMap((b) => b.slice(3, 7))),
    4,
  ),
);
burbGeo.instanceCount = burbujasDef.length;
const burbujas = new THREE.Mesh(
  burbGeo,
  new THREE.ShaderMaterial({
    ...additive,
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec3 aOrigen;
      attribute vec4 aParam; // aparición, radio, ascenso, semilla
      uniform vec3 uHead;
      uniform float uHeadI;
      varying vec2 vUv;
      varying float vB;
      void main() {
        float age = uTime - aParam.x;
        vec3 p = aOrigen + vec3(sin(age * 7.0 + aParam.w * 20.0) * 0.02, age * aParam.z, cos(age * 6.0 + aParam.w * 9.0) * 0.02);
        p.y = min(p.y, -0.02);
        float vis = step(0.0, age) * smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(1.4, 2.2, age)) * (1.0 - smoothstep(-0.25, -0.03, p.y));
        vec3 view = normalize(cameraPosition - p);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), view));
        vec3 up = cross(view, right);
        vec3 wp = p + (right * position.x + up * position.y) * aParam.y;
        vUv = position.xy;
        vec3 dh = p - uHead;
        vB = vis * uUnder * (0.5 + uHeadI * 2.0 / (1.0 + dot(dh, dh) / 2.0)) * (1.0 - underFog(p) * 0.7);
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
        float borde = smoothstep(0.6, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r));
        float brillo = exp(-dot(vUv - vec2(-0.35, 0.35), vUv - vec2(-0.35, 0.35)) * 30.0);
        gl_FragColor = vec4(mix(vec3(0.8, 0.9, 1.0), uAzul, 0.3) * (borde * 0.45 + brillo * 0.6) * vB, 1.0);
      }
    `,
  }),
);
burbujas.frustumCulled = false;
burbujas.renderOrder = 6;
scene.add(burbujas);

// ---------------------------------------------------------------- cámara (sigue a la cabeza sobre la trayectoria maestra)
const cameraAt = rig.cameraAt;

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
  // bajo el agua el halo es dispersión en el volumen de agua: no lo recorta el lecho
  pulsoMat.depthTest = !bajo;

  updateDrones(t);
  // cabeza: aparece con los primeros drones y crece con los que se funden en ella
  const sH = tray.sHead(t);
  tray.P(sH, cabezaMat.uniforms.uPos.value);
  const carga = t >= tCabeza ? 0.25 + 0.75 * absorbidos ** 0.7 : 0;
  const Ihead = carga * smoothstep(tCabeza - 0.05, tCabeza + 0.25, t);
  cabezaMat.uniforms.uI.value = Ihead * 1.4;
  cabezaMat.uniforms.uScatterM.value = 1.2 * smoothstep(T.picada[1], T.picada[1] + 0.3, t);
  cabeza.visible = Ihead > 0.001;
  U.uHead.value.copy(cabezaMat.uniforms.uPos.value);
  U.uHeadI.value = Ihead;
  // Cámara sobre el agua y cabeza bajo ella: se ve su imagen refractada, a la profundidad
  // aparente (d / 1,33) y atenuada por el agua recorrida; el último metro antes del cruce
  // la imagen converge a la posición real, así la cabeza no salta al sumergirse.
  const hP = cabezaMat.uniforms.uPos.value;
  const refractada = !bajo && hP.y < 0;
  if (refractada) {
    const yCam = camera.position.y;
    hP.y /= 1 + 0.33 * smoothstep(0, 1, yCam);
    const fr = yCam / (yCam - hP.y);
    const enAgua = camera.position.distanceTo(hP) * (1 - fr);
    cabezaMat.uniforms.uI.value *= 1 - (1 - Math.exp(-enAgua * C.agua.niebla)) * 0.6;
  }
  cabezaMat.depthTest = !bajo && !refractada;
  updateEstela(t, sH, Ihead);
  // cable: la cubierta se revela detrás de la cabeza, sobre la misma trayectoria
  cable.update(sH - C.cable.frente);
  lechoMat.uniforms.uReveal.value = sH - C.cable.frente;

  // pulso final de datos a lo largo del cable
  const [p0, p1] = T.pulso;
  const kp = clamp((t - p0) / (p1 - p0));
  const pulsoActivo = t > p0 && t < p1;
  const sP = lerp(tray.sE + 1, sH - C.cable.frente - 1, smootherstep(kp));
  tray.P(sP, pulsoMat.uniforms.uPos.value);
  const Ip = pulsoActivo ? Math.sin(Math.PI * kp) : 0;
  pulsoMat.uniforms.uI.value = Ip * 0.9;
  pulsoSprite.visible = Ip > 0.001;
  U.uPulsePos.value.copy(pulsoMat.uniforms.uPos.value);
  U.uPulseI.value = Ip;
  cable.mat.uniforms.uPulsoS.value = t > p0 ? sP : -100;
  // rastro tenue que deja el pulso: la conexión queda activa y se apaga al cerrar
  cable.mat.uniforms.uRastro.value =
    smoothstep(p0, p0 + 0.15, t) * (1 - smoothstep(p1, C.duracion + 0.3, t) * 0.7);

  ciudad.group.visible = camera.position.y > -1;
  lecho.visible = bajo || camera.position.y < 2;
  if (lecho.visible) updateLecho();
  nieve.visible = bajo;

  if (camera.position.y > -0.05) {
    mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
    mirrorCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    mirrorCam.matrixWorld.multiplyMatrices(MIRROR, camera.matrixWorld);
    mirrorCam.matrixWorldInverse.copy(mirrorCam.matrixWorld).invert();
    U.uReflectPass.value = 1;
    U.uDpr.value = DPR * 0.5;
    U.uRes.value.set(rtW, rtH);
    for (const m of ciudad.unaCara) m.side = THREE.BackSide;
    renderer.setRenderTarget(reflectRT);
    renderer.clear();
    renderer.render(scene, mirrorCam);
    for (const m of ciudad.unaCara) m.side = THREE.FrontSide;
    U.uReflectPass.value = 0;
    U.uDpr.value = DPR;
    U.uRes.value.set(W * DPR, H * DPR);
  }
  const onda = Math.exp(-(((t - T.cruceCamara) / 0.1) ** 2));
  // adaptación de exposición al sumergirse (como el autoexposímetro de una cámara real)
  const PP = C.posproceso;
  const expo =
    PP.exposicion *
    (1 + PP.realceSubmarino * smoothstep(T.cruceCamara - 0.05, T.cruceCamara + 0.5, t));
  post.render(scene, camera, t, smoothstep(0, T.fundidoEntrada, t), onda, expo);
}

window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
renderAt(window.__hfThreeTime || 0);

// ---------------------------------------------------------------- diagnóstico (no afecta al render)
function proyector(t) {
  const cam = camera.clone();
  cameraAt(t, cam);
  return (v) => {
    const q = v.clone().project(cam);
    return [+(((q.x + 1) / 2) * W).toFixed(1), +(((1 - q.y) / 2) * H).toFixed(1), q.z < 1];
  };
}
function proyectar(t) {
  const pr = proyector(t);
  const head = tray.P(tray.sHead(t), new THREE.Vector3());
  const c = camera.clone();
  cameraAt(t, c);
  return {
    t,
    cam: c.position.toArray().map((x) => +x.toFixed(1)),
    logo: pr(K),
    boca: pr(H0),
    cabeza: pr(head),
    cabezaPos: head.toArray().map((x) => +x.toFixed(1)),
    sHead: +tray.sHead(t).toFixed(2),
    vHead: +tray.vHead(t).toFixed(1),
    entrada: pr(E),
    apoyo: pr(tray.TD),
  };
}
// Continuidad: desplazamiento máximo en pantalla de drones y cabeza entre cuadros
// consecutivos (a 30 fps), y saltos de posición en el mundo.
function continuidad(t0, t1, paso = 1) {
  const out = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let t = t0; t <= t1 + 1e-6; t += DT) {
    const prA = proyector(t - DT);
    const prB = proyector(t);
    let maxPx = 0;
    let maxMundo = 0;
    for (let i = 0; i < N; i += paso) {
      const al = droneAt(i, t, b);
      if (al < 0.05) continue;
      droneAt(i, t - DT, a);
      maxMundo = Math.max(maxMundo, a.distanceTo(b));
      const pa = prA(a);
      const pb = prB(b);
      if (pa[2] && pb[2]) maxPx = Math.max(maxPx, Math.hypot(pa[0] - pb[0], pa[1] - pb[1]));
    }
    const h0 = tray.P(tray.sHead(t - DT), new THREE.Vector3());
    const h1 = tray.P(tray.sHead(t), new THREE.Vector3());
    const ph0 = prA(h0);
    const ph1 = prB(h1);
    out.push({
      t: +t.toFixed(3),
      dronPx: +maxPx.toFixed(1),
      dronM: +maxMundo.toFixed(2),
      cabezaM: +h0.distanceTo(h1).toFixed(2),
      cabezaPx: +Math.hypot(ph0[0] - ph1[0], ph0[1] - ph1[1]).toFixed(1),
    });
  }
  return out;
}
window.__cirion = {
  drones: N,
  edificios: ciudad.edificios,
  tCabeza: +tCabeza.toFixed(3),
  tray: {
    largo: +tray.largo.toFixed(1),
    sE: +tray.sE.toFixed(1),
    sTD: +tray.sTD.toFixed(1),
    vE: +tray.vE.toFixed(1),
    vc: +tray.vc.toFixed(2),
  },
  renderAt,
  proyectar,
  continuidad,
};
