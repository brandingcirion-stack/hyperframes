// Cable de red submarino: tubo reconstruido cada cuadro a lo largo de la trayectoria
// del extremo. Chaqueta oscura con armadura de alambres helicoidales, hilo marcador
// magenta y pulsos de datos azules. El tramo aéreo llega energizado y se disuelve en
// luz; bajo el agua el cable queda tendido hasta apoyarse en el lecho.
import * as THREE from "../vendor/three.module.min.js";
import { COMMON } from "./glsl.js";

export function createCable({ U, C, scene, headAt, T }) {
  const cfg = C.cable;
  const R = cfg.diametro / 2;
  const t0 = T.picada[0];
  const t1 = T.llegadaFondo;

  // Tabla densa de la trayectoria: tiempo → posición → longitud de arco.
  const M = 4000;
  const times = new Float32Array(M + 1);
  const pts = [];
  const arc = new Float32Array(M + 1);
  const tmp = new THREE.Vector3();
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

  const NS = 280; // anillos a lo largo
  const NR = 18; // vértices por anillo
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((NS + 1) * (NR + 1) * 3);
  const nor = new Float32Array((NS + 1) * (NR + 1) * 3);
  const dat = new Float32Array((NS + 1) * (NR + 1) * 3); // s, tiempo de paso, ángulo
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("aData", new THREE.BufferAttribute(dat, 3));
  const idx = [];
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < NR; j++) {
      const a = i * (NR + 1) + j;
      const b = a + NR + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  geo.setIndex(idx);

  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      ...U,
      uTipS: { value: 0 },
      uVida: { value: cfg.vidaCielo },
      uEnergia: { value: cfg.energiaCielo },
      uPulsos: {
        value: new THREE.Vector3(
          cfg.pulsos.velocidad,
          cfg.pulsos.separacion,
          cfg.pulsos.intensidad,
        ),
      },
      uHilos: { value: cfg.hilos },
      uPaso: { value: cfg.paso },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aData;
      varying vec3 vWorld, vN, vData;
      void main() {
        vData = aData;
        vN = normal;
        vWorld = position;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform float uTipS, uVida, uEnergia, uHilos, uPaso, uHeadI;
      uniform vec3 uPulsos, uHead, uAzul, uMagenta;
      varying vec3 vWorld, vN, vData;
      void main() {
        float s = vData.x;
        float age = uTime - vData.y;
        float ang = vData.z;
        float aire = step(0.0, vWorld.y);
        if (uReflectPass > 0.5 && aire < 0.5) discard;
        // el tramo aéreo se disuelve en luz con un borde granulado
        float dis = aire * smoothstep(uVida, uVida + 0.35, age);
        float nz = vnoise(vec2(s * 0.9, ang * 2.0)) * 0.7 + hash12(vec2(s * 7.0, ang * 11.0)) * 0.3;
        if (nz < dis) discard;
        float borde = aire * smoothstep(0.12, 0.0, nz - dis) * step(0.001, dis);

        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        // armadura: alambres en hélice
        float th = ang - 6.2831853 * s / uPaso;
        float alambre = 0.5 + 0.5 * cos(th * uHilos);
        float ranura = smoothstep(0.25, 0.0, alambre);
        vec3 jacket = vec3(0.016, 0.017, 0.02) * (0.75 + 0.5 * alambre);

        // luz: punta del cable (bajo el agua) + cielo urbano / agua desde arriba
        vec3 L = uHead - vWorld;
        float d2 = dot(L, L);
        vec3 Ln = L * inversesqrt(max(d2, 1e-4));
        float att = uHeadI * 2.2 / (1.0 + d2 / 40.0);
        vec3 H = normalize(Ln + V);
        float spec = pow(max(dot(N, H), 0.0), 40.0) * (0.3 + 0.7 * alambre);
        vec3 luzPunta = mix(vec3(1.0), uAzul, 0.5) * att;
        vec3 amb = mix(uHaze * 3.0, uFogTop * 0.9, uUnder) * (0.4 + 0.6 * max(N.y, 0.0));
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 col = jacket * (amb + luzPunta * max(dot(N, Ln), 0.0)) + luzPunta * spec * 0.35
                 + amb * rim * 0.6;

        // hilo marcador magenta (acento)
        float m = abs(fract((ang - 6.2831853 * s / (uPaso * 3.0)) / 6.2831853) - 0.5);
        float marcador = smoothstep(0.016, 0.008, m);
        col = mix(col, uMagenta * (0.03 + att * 0.2), marcador * 0.8);
        col += uMagenta * marcador * 0.04;

        // pulsos de datos: viajan hacia el extremo
        float ph = mod(s - uTime * uPulsos.x, uPulsos.y);
        float pulso = exp(-pow((ph - uPulsos.y * 0.5) / 0.45, 2.0)) * smoothstep(uTipS - 0.5, uTipS - 4.0, s);
        col += uAzul * pulso * uPulsos.z * (0.15 + 0.6 * ranura) * (1.0 - aire * 0.5);
        // extremo energizado y tramo aéreo encendido
        float cerca = exp(-(uTipS - s) / 2.0);
        col += uAzul * cerca * 1.2 * (0.3 + 0.7 * rim);
        col += mix(uAzul, vec3(1.0), 0.15) * aire * uEnergia * (1.0 - smoothstep(0.0, uVida, age) * 0.6) * (0.35 + 0.65 * rim);
        col += mix(uAzul, uMagenta, 0.4) * borde * 6.0;

        if (aire > 0.5) col = col * atmosLight(vWorld) + uHaze * hazeAmount(vWorld) * 0.3;
        else col = atmos(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.enable(1);
  mesh.renderOrder = 6;
  scene.add(mesh);

  // Extremo: sección del cable con las fibras encendidas.
  const tapaMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...U, uI: { value: 0 } },
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
      uniform vec3 uAzul, uMagenta;
      varying vec2 vP;
      varying vec3 vWorld;
      void main() {
        float r = length(vP) / ${R.toFixed(3)};
        if (r > 1.0) discard;
        // haces de fibras en anillos concéntricos
        float a = atan(vP.y, vP.x);
        float ring = floor(r * 5.0);
        float nA = 6.0 + ring * 6.0;
        vec2 cell = vec2(fract(a / 6.2831853 * nA), fract(r * 5.0));
        float dot0 = smoothstep(0.32, 0.18, length(cell - 0.5));
        float id = hash12(vec2(ring, floor(a / 6.2831853 * nA)));
        vec3 fc = id < 0.18 ? uMagenta : mix(uAzul, vec3(1.0), 0.35);
        vec3 col = fc * dot0 * step(r, 0.62) * 9.0 * uI;
        col += vec3(0.02, 0.022, 0.026) * step(0.62, r) + uAzul * exp(-r * r * 6.0) * 2.0 * uI;
        if (uReflectPass > 0.5 && vWorld.y < 0.0) discard;
        gl_FragColor = vec4(col * atmosLight(vWorld), 1.0);
      }
    `,
  });
  const tapa = new THREE.Mesh(new THREE.CircleGeometry(R * 1.001, 48), tapaMat);
  tapa.frustumCulled = false;
  tapa.layers.enable(1);
  scene.add(tapa);

  const Tn = new THREE.Vector3();
  const Nn = new THREE.Vector3();
  const Bn = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const ring = [];
  for (let i = 0; i <= NS; i++) ring.push({ p: new THREE.Vector3(), t: 0, s: 0 });

  function update(t) {
    const tipS = arcAt(t);
    const activo = t > t0 && tipS > 0.05;
    mesh.visible = tapa.visible = activo;
    if (!activo) return { tipS: 0 };
    // el tramo aéreo ya disuelto no se construye
    const vida = cfg.vidaCielo + 0.4;
    let s0 = 0;
    const tCorte = t - vida;
    if (tCorte > t0) {
      // primer punto aún visible: bajo el agua siempre, en el aire si es reciente
      const sCorte = arcAt(tCorte);
      const sAgua = arcAt(T.picada[1]);
      s0 = Math.min(sCorte, sAgua - 2);
    }
    s0 = Math.max(0, s0);
    for (let i = 0; i <= NS; i++) {
      // más densidad cerca del extremo
      const f = 1 - (1 - i / NS) ** 1.6;
      const s = s0 + (tipS - s0) * f;
      ring[i].s = s;
      ring[i].t = sampleArc(s, ring[i].p);
    }
    // marcos por transporte paralelo (sin torsiones bruscas)
    Tn.subVectors(ring[1].p, ring[0].p).normalize();
    Nn.set(0, 1, 0);
    if (Math.abs(Tn.dot(Nn)) > 0.9) Nn.set(1, 0, 0);
    Bn.crossVectors(Tn, Nn).normalize();
    Nn.crossVectors(Bn, Tn).normalize();
    let k = 0;
    for (let i = 0; i <= NS; i++) {
      const p = ring[i].p;
      if (i > 0) {
        prev.copy(Tn);
        const a = ring[Math.min(NS, i + 1)].p;
        const b = ring[i - 1].p;
        Tn.subVectors(a, b);
        if (Tn.lengthSq() < 1e-10) Tn.copy(prev);
        Tn.normalize();
        // rota N para que siga perpendicular a la nueva tangente
        Nn.addScaledVector(Tn, -Nn.dot(Tn)).normalize();
        Bn.crossVectors(Tn, Nn).normalize();
      }
      const rr = R;
      for (let j = 0; j <= NR; j++) {
        const ang = (j / NR) * Math.PI * 2;
        const cx = Math.cos(ang);
        const sx = Math.sin(ang);
        const nx = Nn.x * cx + Bn.x * sx;
        const ny = Nn.y * cx + Bn.y * sx;
        const nz = Nn.z * cx + Bn.z * sx;
        pos[k * 3] = p.x + nx * rr;
        pos[k * 3 + 1] = p.y + ny * rr;
        pos[k * 3 + 2] = p.z + nz * rr;
        nor[k * 3] = nx;
        nor[k * 3 + 1] = ny;
        nor[k * 3 + 2] = nz;
        dat[k * 3] = ring[i].s;
        dat[k * 3 + 1] = ring[i].t;
        dat[k * 3 + 2] = ang;
        k++;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.aData.needsUpdate = true;
    mat.uniforms.uTipS.value = tipS;
    // tapa en el extremo, orientada según la tangente
    tapa.position.copy(ring[NS].p);
    tmp.copy(ring[NS].p).add(Tn);
    tapa.lookAt(tmp);
    tapaMat.uniforms.uI.value = 1;
    return { tipS, tangente: Tn.clone() };
  }

  return { update, arcAt, R };
}
