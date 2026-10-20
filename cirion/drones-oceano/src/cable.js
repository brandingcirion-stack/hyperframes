// Cable submarino revelado detrás de la cabeza luminosa, sobre la trayectoria maestra.
// La geometría de todos los anillos se precalcula una vez con los marcos fijos de la
// trayectoria (transporte paralelo): en cada cuadro solo cambia cuántos anillos se dibujan
// y el último anillo se coloca exactamente en el frente de revelado. No se escala un tubo
// completo ni se recalculan orientaciones: no hay torsiones ni saltos.
// Aspecto: cable armado de aguas someras (cubierta bituminosa oscura sobre alambres en
// hélice), sin franjas de color; la energía azul solo aparece en el frente de formación y
// en el pulso de datos.
import * as THREE from "../vendor/three.module.min.js";
import { COMMON } from "./glsl.js";

const NR = 20; // vértices por anillo
const PASO = 0.18; // m entre anillos

export function createCable({ U, C, scene, tray }) {
  const R = C.cable.diametro / 2;
  const s0 = tray.sE + 0.6; // nace justo bajo la superficie, donde entró la cabeza
  const nAnillos = Math.ceil((tray.largo - s0) / PASO) + 2;
  const nV = nAnillos * (NR + 1);
  const base = new Float32Array(nV * 3);
  const baseN = new Float32Array(nV * 3);
  const data = new Float32Array(nV * 2);
  const p = new THREE.Vector3();
  const nn = new THREE.Vector3();
  const bb = new THREE.Vector3();
  function anillo(k, s, posArr, norArr, datArr) {
    tray.P(s, p);
    tray.Nm(s, nn);
    tray.Bn(s, bb);
    for (let j = 0; j <= NR; j++) {
      const a = (j / NR) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const i = k * (NR + 1) + j;
      const nx = nn.x * c + bb.x * sn;
      const ny = nn.y * c + bb.y * sn;
      const nz = nn.z * c + bb.z * sn;
      posArr[i * 3] = p.x + nx * R;
      posArr[i * 3 + 1] = p.y + ny * R;
      posArr[i * 3 + 2] = p.z + nz * R;
      norArr[i * 3] = nx;
      norArr[i * 3 + 1] = ny;
      norArr[i * 3 + 2] = nz;
      datArr[i * 2] = s;
      datArr[i * 2 + 1] = a;
    }
  }
  for (let k = 0; k < nAnillos; k++)
    anillo(k, Math.min(tray.largo, s0 + k * PASO), base, baseN, data);
  const baseD = Float32Array.from(data);
  const pos = Float32Array.from(base);
  const nor = Float32Array.from(baseN);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("aData", new THREE.BufferAttribute(data, 2));
  const idx = [];
  for (let k = 0; k < nAnillos - 1; k++) {
    for (let j = 0; j < NR; j++) {
      const a = k * (NR + 1) + j;
      const b = a + NR + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uReveal: { value: s0 },
      uHilos: { value: C.cable.hilos },
      uPaso: { value: C.cable.paso },
      uPulsoS: { value: -100 },
      uRastro: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aData;
      varying vec3 vWorld, vN;
      varying vec2 vData;
      void main() {
        vData = aData;
        vN = normal;
        vWorld = position;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform float uReveal, uHilos, uPaso, uHeadI, uPulseI, uPulsoS, uRastro;
      uniform vec3 uHead, uAzul, uPulsePos;
      varying vec3 vWorld, vN;
      varying vec2 vData;
      void main() {
        float s = vData.x;
        float ang = vData.y;
        if (s > uReveal + 0.001) discard;
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        // relieve de la armadura: alambres en hélice bajo la cubierta (normal perturbada)
        float th = ang - 6.2831853 * s / uPaso;
        float onda = cos(th * uHilos);
        vec3 Nb = normalize(N + cross(N, vec3(1e-3, 1.0, 0.0)) * onda * 0.07);
        float alambre = 0.5 + 0.5 * onda;
        vec3 albedo = vec3(0.022, 0.022, 0.024) * (0.9 + 0.15 * alambre);
        // luz de la cabeza y del pulso (puntuales) + luz difusa del agua desde arriba
        vec3 L = uHead - vWorld;
        float d2 = dot(L, L);
        vec3 Ln = L * inversesqrt(max(d2, 1e-4));
        vec3 cH = mix(vec3(1.0), uAzul, 0.45) * uHeadI * 3.0 / (1.0 + d2 / 6.0);
        vec3 Lp = uPulsePos - vWorld;
        float dp2 = dot(Lp, Lp);
        vec3 Lpn = Lp * inversesqrt(max(dp2, 1e-4));
        vec3 cP = mix(vec3(1.0), uAzul, 0.55) * uPulseI * 2.5 / (1.0 + dp2 / 5.0);
        vec3 amb = mix(uHaze * 2.0, uFogTop * 0.55, uUnder) * (0.35 + 0.65 * max(Nb.y, 0.0));
        float rug = 0.42;
        float esp = pow(max(dot(Nb, normalize(Ln + V)), 0.0), 2.0 / (rug * rug)) * 0.25;
        float espP = pow(max(dot(Nb, normalize(Lpn + V)), 0.0), 2.0 / (rug * rug)) * 0.25;
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        // reflejo de la claridad de la superficie sobre el lomo del cable: define su volumen
        vec3 Rv = reflect(-V, Nb);
        vec3 cielo = waterColorAt(0.0) * smoothstep(0.1, 0.9, Rv.y) * (0.35 + 0.65 * fres) * uUnder;
        vec3 col = albedo * (amb + cH * max(dot(Nb, Ln), 0.0) + cP * max(dot(Nb, Lpn), 0.0))
                 + cH * esp * (0.7 + 0.3 * alambre) + cP * espP * (0.7 + 0.3 * alambre)
                 + amb * fres * 0.25 + cielo * 0.3 * (0.75 + 0.25 * alambre);
        // frente de formación: la energía se vuelve cubierta en el último tramo
        float frente = smoothstep(uReveal - 0.9, uReveal, s);
        col = mix(col, uAzul * 1.6 + vec3(0.6), frente * frente * 0.85);
        // pulso de datos: luz breve que recorre el cable
        float dS = s - uPulsoS;
        col += uAzul * exp(-dS * dS / 0.8) * uPulseI * (0.6 + 0.6 * fres);
        // rastro del pulso: se desvanece detrás de él a lo largo de unos metros
        float tras = dS < 0.0 ? exp(dS / 7.0) : 0.0;
        col += uAzul * tras * uRastro * (0.05 + 0.12 * alambre) * (0.5 + 0.5 * fres);
        gl_FragColor = vec4(atmos(col, vWorld), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // cara del frente: disco luminoso que cierra el tubo mientras se forma
  const tapaMat = new THREE.ShaderMaterial({
    ...{
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    },
    uniforms: { ...U, uI: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      varying vec3 vWorld;
      void main() {
        vP = position.xy;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform float uI;
      uniform vec3 uAzul;
      varying vec2 vP;
      varying vec3 vWorld;
      void main() {
        float r = length(vP) / ${R.toFixed(4)};
        if (r > 1.0) discard;
        vec3 col = (uAzul * 2.0 + vec3(0.8)) * (1.0 - r * r) * uI;
        gl_FragColor = vec4(col * atmosLight(vWorld), 1.0);
      }
    `,
  });
  const tapa = new THREE.Mesh(new THREE.CircleGeometry(R, 32), tapaMat);
  tapa.frustumCulled = false;
  scene.add(tapa);

  let kTocado = -1;
  const tg = new THREE.Vector3();
  function update(sReveal) {
    const visible = sReveal > s0 + 0.01;
    mesh.visible = tapa.visible = visible;
    if (!visible) return;
    const kCompletos = Math.floor((sReveal - s0) / PASO);
    const kUltimo = Math.min(kCompletos + 1, nAnillos - 1);
    // restaurar el anillo movido en el cuadro anterior
    if (kTocado >= 0 && kTocado !== kUltimo) {
      const a = kTocado * (NR + 1) * 3;
      const b = a + (NR + 1) * 3;
      pos.set(base.subarray(a, b), a);
      nor.set(baseN.subarray(a, b), a);
      const da = kTocado * (NR + 1) * 2;
      data.set(baseD.subarray(da, da + (NR + 1) * 2), da);
    }
    // el último anillo va exactamente al frente de revelado
    anillo(kUltimo, sReveal, pos, nor, data);
    kTocado = kUltimo;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.aData.needsUpdate = true;
    geo.setDrawRange(0, kUltimo * NR * 6);
    mat.uniforms.uReveal.value = sReveal;
    tray.P(sReveal, tapa.position);
    tray.Tg(sReveal, tg);
    tapa.lookAt(tapa.position.clone().add(tg));
  }
  return { update, mesh, mat, tapa: tapaMat, R, s0 };
}
