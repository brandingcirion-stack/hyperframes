// Cables de red submarinos: chaqueta oscura con armadura de alambres helicoidales, hilo
// marcador magenta y pulsos de datos azules.
// - createCable: el cable nuevo, reconstruido cada cuadro a lo largo de la trayectoria de
//   su extremo (sale de la torre de datos, toca el logo, cae al mar y llega al empalme).
//   Es continuo de punta a punta: nunca se ve un extremo cortado.
// - createTroncal: el cable existente tendido en el lecho; el pulso de datos lo recorre
//   desde el empalme hasta la estación de amarre de la otra ciudad.
import * as THREE from "../vendor/three.module.min.js";
import { COMMON } from "./glsl.js";

const NR = 18; // vértices por anillo

function cableMaterial(U, C, R) {
  const cfg = C.cable;
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      ...U,
      uR: { value: R },
      uTipS: { value: -1 }, // extremo energizado (cable nuevo)
      uEnergia: { value: cfg.energiaAire },
      uPulsos: {
        value: new THREE.Vector3(
          cfg.pulsos.velocidad,
          cfg.pulsos.separacion,
          cfg.pulsos.intensidad,
        ),
      },
      uFlujo: { value: new THREE.Vector4(-1, -1, 0, 0) }, // s inicio, s del pulso principal, brillo, encendido
      uHilos: { value: cfg.hilos },
      uPaso: { value: cfg.paso },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aData;
      varying vec3 vWorld, vN, vData;
      void main() {
        vData = aData;
        vN = normal;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform float uTipS, uEnergia, uHilos, uPaso, uHeadI, uR, uPulseI;
      uniform vec3 uPulsos, uHead, uAzul, uMagenta, uPulsePos;
      uniform vec4 uFlujo;
      varying vec3 vWorld, vN, vData;
      void main() {
        float s = vData.x;
        float ang = vData.z;
        float aire = step(0.0, vWorld.y);
        if (uReflectPass > 0.5 && aire < 0.5) discard;
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        // armadura: alambres en hélice
        float th = ang - 6.2831853 * s / uPaso;
        float alambre = 0.5 + 0.5 * cos(th * uHilos);
        float ranura = smoothstep(0.25, 0.0, alambre);
        vec3 jacket = vec3(0.016, 0.017, 0.02) * (0.75 + 0.5 * alambre);

        // luces: extremo del cable y pulso de datos
        vec3 L = uHead - vWorld;
        float d2 = dot(L, L);
        vec3 Ln = L * inversesqrt(max(d2, 1e-4));
        float att = uHeadI * 2.2 / (1.0 + d2 / 40.0);
        vec3 Lp = uPulsePos - vWorld;
        float dp2 = dot(Lp, Lp);
        float attP = uPulseI * 2.0 / (1.0 + dp2 / 30.0);
        vec3 Lpn = Lp * inversesqrt(max(dp2, 1e-4));
        vec3 H = normalize(Ln + V);
        float spec = pow(max(dot(N, H), 0.0), 40.0) * (0.3 + 0.7 * alambre);
        vec3 luzPunta = mix(vec3(1.0), uAzul, 0.5) * att;
        vec3 luzPulso = mix(vec3(1.0), uAzul, 0.6) * attP;
        vec3 amb = mix(uHaze * 3.0, uFogTop * 0.9, uUnder) * (0.4 + 0.6 * max(N.y, 0.0));
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 col = jacket * (amb + luzPunta * max(dot(N, Ln), 0.0) + luzPulso * max(dot(N, Lpn), 0.0))
                 + luzPunta * spec * 0.35
                 + luzPulso * pow(max(dot(N, normalize(Lpn + V)), 0.0), 40.0) * 0.3 * (0.3 + 0.7 * alambre)
                 + amb * rim * 0.6;

        // hilo marcador magenta (acento)
        float m = abs(fract((ang - 6.2831853 * s / (uPaso * 3.0)) / 6.2831853) - 0.5);
        float marcador = smoothstep(0.016, 0.008, m);
        col = mix(col, uMagenta * (0.03 + (att + attP) * 0.2), marcador * 0.8);
        col += uMagenta * marcador * 0.04;

        // pulsos de datos del cable nuevo: viajan hacia el extremo
        if (uTipS > 0.0) {
          float ph = mod(s - uTime * uPulsos.x, uPulsos.y);
          float pulso = exp(-pow((ph - uPulsos.y * 0.5) / 0.45, 2.0)) * smoothstep(uTipS - 0.5, uTipS - 4.0, s);
          col += uAzul * pulso * uPulsos.z * (0.15 + 0.6 * ranura);
          float cerca = exp(-(uTipS - s) / 2.0);
          col += uAzul * cerca * 1.2 * (0.3 + 0.7 * rim);
          // tramo aéreo energizado (cable de luz sobre la ciudad)
          col += mix(uAzul, vec3(1.0), 0.15) * aire * uEnergia * (0.35 + 0.65 * rim);
        }
        // flujo de datos por el troncal: pulso principal + tren de pulsos detrás de él
        if (uFlujo.w > 0.0) {
          float dS = s - uFlujo.y;
          float frente = exp(-dS * dS / 6.0) * uFlujo.z;
          float detras = step(uFlujo.x, s) * step(s, uFlujo.y);
          float tren = exp(-pow((mod(s - uTime * 60.0, 9.0) - 4.5) / 0.6, 2.0)) * detras * exp(-(uFlujo.y - s) / 220.0);
          col += uAzul * (frente * (2.0 + 4.0 * rim) + tren * 0.9 * (0.2 + ranura)) * uFlujo.w;
          col += vec3(1.0) * frente * 0.6 * uFlujo.w;
        }
        if (aire > 0.5) col = col * atmosLight(vWorld) + uHaze * hazeAmount(vWorld) * 0.3;
        else col = atmos(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function tubeGeometry(nAnillos) {
  const geo = new THREE.BufferGeometry();
  const n = nAnillos * (NR + 1);
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("aData", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const idx = [];
  for (let i = 0; i < nAnillos - 1; i++) {
    for (let j = 0; j < NR; j++) {
      const a = i * (NR + 1) + j;
      const b = a + NR + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  geo.setIndex(idx);
  return geo;
}

// Escribe los anillos del tubo con marcos por transporte paralelo (sin torsiones).
function writeRings(geo, anillos, R) {
  const pos = geo.attributes.position.array;
  const nor = geo.attributes.normal.array;
  const dat = geo.attributes.aData.array;
  const Tn = new THREE.Vector3();
  const Nn = new THREE.Vector3();
  const Bn = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const n = anillos.length;
  Tn.subVectors(anillos[1].p, anillos[0].p).normalize();
  Nn.set(0, 1, 0);
  if (Math.abs(Tn.dot(Nn)) > 0.9) Nn.set(1, 0, 0);
  Bn.crossVectors(Tn, Nn).normalize();
  Nn.crossVectors(Bn, Tn).normalize();
  let k = 0;
  for (let i = 0; i < n; i++) {
    const p = anillos[i].p;
    if (i > 0) {
      prev.copy(Tn);
      Tn.subVectors(anillos[Math.min(n - 1, i + 1)].p, anillos[i - 1].p);
      if (Tn.lengthSq() < 1e-10) Tn.copy(prev);
      Tn.normalize();
      Nn.addScaledVector(Tn, -Nn.dot(Tn)).normalize();
      Bn.crossVectors(Tn, Nn).normalize();
    }
    for (let j = 0; j <= NR; j++) {
      const ang = (j / NR) * Math.PI * 2;
      const cx = Math.cos(ang);
      const sx = Math.sin(ang);
      const nx = Nn.x * cx + Bn.x * sx;
      const ny = Nn.y * cx + Bn.y * sx;
      const nz = Nn.z * cx + Bn.z * sx;
      pos[k * 3] = p.x + nx * R;
      pos[k * 3 + 1] = p.y + ny * R;
      pos[k * 3 + 2] = p.z + nz * R;
      nor[k * 3] = nx;
      nor[k * 3 + 1] = ny;
      nor[k * 3 + 2] = nz;
      dat[k * 3] = anillos[i].s;
      dat[k * 3 + 1] = anillos[i].t;
      dat[k * 3 + 2] = ang;
      k++;
    }
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.normal.needsUpdate = true;
  geo.attributes.aData.needsUpdate = true;
  return Tn;
}

export function createCable({ U, C, scene, headAt, t0, t1 }) {
  const R = C.cable.diametro / 2;
  // tabla densa de la trayectoria: tiempo → posición → longitud de arco
  const M = 6000;
  const times = new Float32Array(M + 1);
  const pts = [];
  const arc = new Float32Array(M + 1);
  for (let i = 0; i <= M; i++) {
    times[i] = t0 + ((t1 - t0) * i) / M;
    pts.push(headAt(times[i], new THREE.Vector3()));
    arc[i] = i ? arc[i - 1] + pts[i].distanceTo(pts[i - 1]) : 0;
  }
  const arcAt = (t) => {
    if (t <= t0) return 0;
    if (t >= t1) return arc[M];
    const f = ((t - t0) / (t1 - t0)) * M;
    const i = Math.floor(f);
    return arc[i] + (arc[i + 1] - arc[i]) * (f - i);
  };
  function sampleArc(s, out) {
    let lo = 0;
    let hi = M;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arc[mid] < s) lo = mid;
      else hi = mid;
    }
    const span = arc[hi] - arc[lo] || 1;
    const f = Math.min(1, Math.max(0, (s - arc[lo]) / span));
    out.copy(pts[lo]).lerp(pts[hi], f);
    return times[lo] + (times[hi] - times[lo]) * f;
  }

  const NS = 420;
  const geo = tubeGeometry(NS + 1);
  const mat = cableMaterial(U, C, R);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.enable(1);
  mesh.renderOrder = 6;
  scene.add(mesh);
  const anillos = [];
  for (let i = 0; i <= NS; i++) anillos.push({ p: new THREE.Vector3(), t: 0, s: 0 });

  function update(t) {
    const tipS = arcAt(t);
    const activo = t > t0 && tipS > 0.05;
    mesh.visible = activo;
    if (!activo) return { tipS: 0 };
    for (let i = 0; i <= NS; i++) {
      // más densidad cerca del extremo
      const f = 1 - (1 - i / NS) ** 1.6;
      const s = tipS * f;
      anillos[i].s = s;
      anillos[i].t = sampleArc(s, anillos[i].p);
    }
    const tangente = writeRings(geo, anillos, R);
    mat.uniforms.uTipS.value = tipS;
    return { tipS, tangente: tangente.clone() };
  }

  return { update, arcAt, mesh, mat, R };
}

// Cable existente en el lecho (estático). `puntos` es una polilínea densa en mundo.
export function createTroncal({ U, C, scene, puntos }) {
  const R = C.troncal.diametro / 2;
  const anillos = [];
  let s = 0;
  puntos.forEach((p, i) => {
    if (i) s += p.distanceTo(puntos[i - 1]);
    anillos.push({ p, s, t: -1 });
  });
  const geo = tubeGeometry(anillos.length);
  writeRings(geo, anillos, R);
  const mat = cableMaterial(U, C, R);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.enable(1);
  scene.add(mesh);
  const arcos = anillos.map((a) => a.s);
  function puntoEn(sq, out) {
    let lo = 0;
    let hi = arcos.length - 1;
    if (sq <= 0) return out.copy(anillos[0].p);
    if (sq >= arcos[hi]) return out.copy(anillos[hi].p);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arcos[mid] < sq) lo = mid;
      else hi = mid;
    }
    const f = (sq - arcos[lo]) / (arcos[hi] - arcos[lo] || 1);
    return out.copy(anillos[lo].p).lerp(anillos[hi].p, f);
  }
  return { mesh, mat, largo: s, puntoEn, R };
}
