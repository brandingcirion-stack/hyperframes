// Ciudad costera nocturna procedural (semilla fija): torres con ventanas encendidas,
// coronas LED, costanera con faroles y tránsito, puente sobre la bahía y balizas.
// Todo se dibuja con geometría instanciada y shaders; el tiempo solo mueve el tránsito
// y las balizas.
import * as THREE from "../vendor/three.module.min.js";
import { COMMON } from "./glsl.js";
import { lerp, mulberry32 } from "./util.js";

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
};

export function createCity({ U, C, scene }) {
  const cc = C.ciudad;
  const rnd = mulberry32(C.semilla + 303);
  const boxes = [];
  const cyls = [];
  const lights = []; // {p:[x,y,z], c:[r,g,b], size, minPx, type, phase, move:[dx,dz,speed,len]}

  const logoX = C.logo.ancho * 0.75;
  function addBuilding(x, z, w, d, h, yaw, estilo, opts = {}) {
    let style = estilo;
    const seed = rnd() * 1000;
    const litR = style === 3 ? 0.08 + rnd() * 0.1 : 0.22 + rnd() * 0.45;
    const crown = opts.crown ?? (h > 120 && rnd() < 0.22 ? (rnd() < 0.18 ? 2 : 1) : 0);
    // algunas torres altas llevan fachada de medios LED
    if (!opts.cyl && h > 170 && rnd() < 0.18) style = 4;
    const led = opts.led ?? (style === 1 && rnd() < 0.35 ? 1 : 0);
    const target = opts.cyl ? cyls : boxes;
    let base = 0;
    // escalonamientos: cuerpo + uno o dos remates de menor planta
    const tramos = h > 110 && !opts.cyl && rnd() < 0.55 ? (rnd() < 0.4 ? 3 : 2) : 1;
    let fw = w;
    let fd = d;
    for (let k = 0; k < tramos; k++) {
      const hk = tramos === 1 ? h : k === 0 ? h * 0.68 : (h * 0.32) / (tramos - 1);
      target.push({
        x,
        z,
        w: fw,
        d: fd,
        h: hk,
        base,
        yaw,
        style,
        seed,
        litR,
        total: h,
        crown: k === tramos - 1 ? crown : 0,
        led,
      });
      base += hk;
      fw *= 0.74;
      fd *= 0.74;
    }
    if (h > 190) {
      lights.push({
        p: [x, h + 3, z],
        c: [3.2, 0.25, 0.18],
        size: 1.4,
        minPx: 1.3,
        type: 2,
        phase: rnd(),
      });
    }
  }

  // ---- manzanas
  for (let gz = cc.costa - 26; gz > cc.fondo; gz -= cc.manzana) {
    for (let gx = cc.x[0]; gx < cc.x[1]; gx += cc.manzana) {
      if (rnd() > 0.9) continue; // plazas y parques
      const cx = gx + cc.manzana / 2;
      const cz = gz - cc.manzana / 2;
      let hT = cc.alturaBase * (0.55 + 0.9 * rnd());
      for (const cl of cc.clusters) {
        hT += cl.alto * Math.exp(-(((cx - cl.x) / cl.rx) ** 2 + ((cz - cl.z) / cl.rz) ** 2));
      }
      // la periferia baja de a poco
      hT *= lerp(1, 0.35, Math.min(1, Math.max(0, (Math.abs(cx) - 1200) / 1800)));
      if (cz > cc.costa - 120) hT = Math.min(hT, 38 + rnd() * 70); // frente costero
      // no invadir el volumen del show de drones
      if (Math.abs(cx - C.logo.centro[0]) < logoX && cz > C.logo.centro[2] - 180)
        hT = Math.min(hT, 120);
      const lote = cc.manzana - cc.calle;
      const r = rnd();
      const n = hT > 150 ? 1 : r < 0.5 ? 1 : r < 0.85 ? 2 : 4;
      const subs =
        n === 1
          ? [[0, 0, lote, lote]]
          : n === 2
            ? [
                [-lote / 4, 0, lote / 2, lote],
                [lote / 4, 0, lote / 2, lote],
              ]
            : [
                [-lote / 4, -lote / 4, lote / 2, lote / 2],
                [lote / 4, -lote / 4, lote / 2, lote / 2],
                [-lote / 4, lote / 4, lote / 2, lote / 2],
                [lote / 4, lote / 4, lote / 2, lote / 2],
              ];
      for (const [ox, oz, sw, sd] of subs) {
        let h = hT * (0.55 + 0.7 * rnd());
        if (rnd() < 0.06) h *= 1.6;
        h = Math.max(9, Math.min(h, 380));
        const w = sw * (0.62 + 0.3 * rnd());
        const d = sd * (0.62 + 0.3 * rnd());
        const yaw = rnd() < 0.14 ? (rnd() - 0.5) * 0.7 : 0;
        const s = rnd();
        const style = s < 0.45 ? 0 : s < 0.72 ? 1 : s < 0.9 ? 2 : 3;
        const cyl = h > 150 && rnd() < 0.16;
        addBuilding(cx + ox, cz + oz, w, cyl ? w : d, h, yaw, style, { cyl });
      }
    }
  }
  // torre icónica: cuerpo afinado por tramos, corona azul
  {
    const t = cc.torreIconica;
    let lado = t.lado;
    let base = 0;
    const tramos = 7;
    for (let k = 0; k < tramos; k++) {
      const hk = (t.alto * (k < tramos - 1 ? 0.17 : 0.06)) / 1;
      boxes.push({
        x: t.x,
        z: t.z,
        w: lado,
        d: lado,
        h: hk,
        base,
        yaw: 0.3,
        style: 1,
        seed: 77 + k,
        litR: 0.55,
        total: t.alto,
        crown: k === tramos - 1 ? 1 : 0,
        led: 1,
      });
      base += hk;
      lado *= 0.86;
    }
    lights.push({
      p: [t.x, base + 18, t.z],
      c: [3.2, 0.25, 0.18],
      size: 1.8,
      minPx: 1.5,
      type: 2,
      phase: 0.3,
    });
  }

  // ---- material de edificios
  const makeBuildingMat = (cyl) =>
    new THREE.ShaderMaterial({
      uniforms: { ...U, uCyl: { value: cyl ? 1 : 0 }, uWinI: { value: cc.ventanas } },
      vertexShader: /* glsl */ `
        attribute vec3 aDim;
        attribute vec4 aInfo;   // semilla, estilo, ocupación, base
        attribute vec4 aInfo2;  // corona, led, altura total, -
        varying vec3 vLp, vWorld, vN, vDim;
        varying vec4 vInfo, vInfo2;
        void main() {
          vLp = position * aDim;
          vDim = aDim;
          vInfo = aInfo;
          vInfo2 = aInfo2;
          vN = normal;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON}
        uniform float uCyl, uWinI;
        uniform vec3 uAzul, uMagenta;
        varying vec3 vLp, vWorld, vN, vDim;
        varying vec4 vInfo, vInfo2;
        void main() {
          float seed = vInfo.x;
          float style = vInfo.y;
          float litR = vInfo.z;
          float v = vLp.y + vInfo.w;
          vec3 n = vN;
          float u;
          float faceW;
          float face;
          if (uCyl > 0.5) {
            float ang = atan(vLp.z, vLp.x);
            u = ang * vDim.x * 0.5;
            faceW = 6.2831 * vDim.x * 0.5;
            face = 0.0;
          } else if (abs(n.x) > 0.5) {
            u = vLp.z; faceW = vDim.z; face = n.x > 0.0 ? 1.0 : 2.0;
          } else {
            u = vLp.x; faceW = vDim.x; face = n.z > 0.0 ? 3.0 : 4.0;
          }
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 base = vec3(0.0035, 0.0045, 0.008);
          vec3 col;
          if (abs(n.y) > 0.5) {
            // azotea: oscura con algún equipo iluminado
            col = base * 0.8;
            float rl = step(0.985, hash12(floor(vLp.xz / 3.0) + seed));
            col += vec3(0.6, 0.7, 0.9) * rl * 0.4;
          } else {
            float fh = style == 2.0 ? 3.1 : style == 1.0 ? 4.0 : 3.7;
            float ww = style == 1.0 ? 1.5 : style == 2.0 ? 3.2 : mix(2.0, 2.8, fract(seed * 1.7));
            float fx = style == 1.0 ? 0.06 : style == 2.0 ? 0.24 : 0.15;
            float fy = style == 1.0 ? 0.1 : 0.24;
            vec2 cf = vec2(u / ww, v / fh);
            vec2 id = floor(cf);
            vec2 f = fract(cf);
            float win = step(fx, f.x) * step(f.x, 1.0 - fx) * step(fy, f.y) * step(f.y, 0.92);
            float r = hash12(id + vec2(seed * 0.37, face * 13.1));
            float piso = hash12(vec2(id.y * 1.37, seed));
            float lit;
            if (style == 1.0) lit = step(piso, litR) * step(0.12, r);   // plantas libres: pisos enteros
            else lit = step(r, litR) * step(0.15, piso);
            float r2 = hash12(id * 1.31 + seed);
            vec3 wc = r2 < 0.55 ? vec3(0.78, 0.86, 1.0) : r2 < 0.82 ? vec3(0.5, 0.7, 1.0) : vec3(1.0, 0.74, 0.5);
            if (style == 2.0 && r2 < 0.45) wc = vec3(1.0, 0.8, 0.58);
            float wi = mix(0.12, 1.0, pow(hash12(id * 2.7 + seed), 2.0)) * (style == 1.0 ? 0.75 : 1.0);
            vec3 detalle = lit * win * wc * wi;
            float cov = (1.0 - 2.0 * fx) * (0.92 - fy);
            vec3 medio = litR * cov * vec3(0.72, 0.8, 0.95) * 0.3 * (0.6 + 0.8 * fract(seed * 3.1));
            vec2 dc = fwidth(cf);
            float px = max(dc.x, dc.y);
            float nitido = 1.0 - smoothstep(0.3, 0.75, px);
            vec3 emis = mix(medio, detalle, nitido) * uWinI;
            if (style == 3.0) emis *= 0.35;
            if (style == 4.0) {
              // fachada de medios: ondas lentas de luz azul que suben por la torre
              float ola = 0.5 + 0.5 * sin(v * 0.045 - uTime * 1.1 + u * 0.03 + seed);
              float lineas = smoothstep(0.35, 0.0, abs(fract(u / 2.4) - 0.5));
              emis = emis * 0.3 + uAzul * (0.08 + 0.55 * ola * ola) * lineas;
            }
            // vidrio: refleja el resplandor del cielo en ángulo rasante
            vec2 nh = uCyl > 0.5 ? normalize(vLp.xz) : n.xz;
            float fres = pow(1.0 - max(dot(vec3(nh.x, 0.0, nh.y), V), 0.0), 3.0);
            col = base + uHaze * (0.05 + 0.6 * fres) + emis;
            // luz de calle que sube por la base de las fachadas
            col += vec3(1.0, 0.78, 0.55) * 0.02 * exp(-v / 22.0) * (0.6 + 0.4 * fract(seed));
            // aristas LED y coronas
            if (vInfo2.y > 0.5 && uCyl < 0.5) {
              float e = faceW * 0.5 - abs(u);
              col += uAzul * exp(-e * e / 0.35) * 1.6;
            }
            if (vInfo2.x > 0.5) {
              float top = vInfo2.z - v;
              float banda = smoothstep(7.0, 5.5, top) * step(0.0, top);
              vec3 cc = vInfo2.x > 1.5 ? uMagenta : uAzul;
              col += cc * banda * 1.3;
            }
          }
          gl_FragColor = vec4(atmos(col, vWorld), 1.0);
        }
      `,
    });

  function buildInstanced(list, geo, cyl) {
    const mesh = new THREE.InstancedMesh(geo, makeBuildingMat(cyl), list.length);
    const aDim = new Float32Array(list.length * 3);
    const aInfo = new Float32Array(list.length * 4);
    const aInfo2 = new Float32Array(list.length * 4);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    list.forEach((b, i) => {
      q.setFromEuler(e.set(0, b.yaw, 0));
      m.compose(new THREE.Vector3(b.x, b.base, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
      mesh.setMatrixAt(i, m);
      aDim.set([b.w, b.h, b.d], i * 3);
      aInfo.set([b.seed, b.style, b.litR, b.base], i * 4);
      aInfo2.set([b.crown, b.led, b.total, 0], i * 4);
    });
    geo.setAttribute("aDim", new THREE.InstancedBufferAttribute(aDim, 3));
    geo.setAttribute("aInfo", new THREE.InstancedBufferAttribute(aInfo, 4));
    geo.setAttribute("aInfo2", new THREE.InstancedBufferAttribute(aInfo2, 4));
    mesh.frustumCulled = false;
    mesh.layers.enable(1);
    scene.add(mesh);
    return mesh;
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 28, 1);
  cylGeo.translate(0, 0.5, 0);
  buildInstanced(boxes, boxGeo, false);
  if (cyls.length) buildInstanced(cyls, cylGeo, true);

  // ---- suelo urbano y muro de la costanera
  const sueloMat = new THREE.ShaderMaterial({
    uniforms: { ...U },
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
      varying vec3 vWorld;
      void main() {
        vec3 col = vec3(0.004, 0.005, 0.008);
        // calles: retícula de luz ambiente tenue
        vec2 g = abs(fract(vWorld.xz / ${cc.manzana.toFixed(1)}) - 0.5);
        col += vec3(0.5, 0.45, 0.4) * 0.02 * smoothstep(0.36, 0.5, max(g.x, g.y));
        gl_FragColor = vec4(atmos(col, vWorld), 1.0);
      }
    `,
  });
  // losa sobre el nivel del agua: no se cuela por debajo en el reflejo
  const suelo = new THREE.Mesh(new THREE.BoxGeometry(14000, 1, 9000), sueloMat);
  suelo.position.set(0, 0.9, cc.costa - 4500);
  suelo.layers.enable(1);
  scene.add(suelo);

  // ---- costanera: faroles y tránsito
  for (let x = -3400; x < 3400; x += 24) {
    lights.push({
      p: [x, 7, cc.costa - 2],
      c: [1.8, 1.9, 2.1],
      size: 0.9,
      minPx: 1.0,
      type: 0,
      phase: 0,
    });
  }
  const largo = 6800;
  for (let i = 0; i < cc.autos; i++) {
    const carril = i % 2;
    const speed = 13 + rnd() * 9;
    const s0 = rnd() * largo;
    const z = cc.costa - 14 - carril * 6;
    const dir = carril ? -1 : 1;
    // faro delantero blanco y luz trasera roja (4 m detrás)
    lights.push({
      p: [-3400, 1.2, z],
      c: [2.4, 2.4, 2.6],
      size: 0.7,
      minPx: 0.9,
      type: 1,
      phase: s0,
      move: [dir, 0, speed, largo],
    });
    lights.push({
      p: [-3400 - dir * 4, 1.2, z],
      c: [1.6, 0.08, 0.05],
      size: 0.6,
      minPx: 0.8,
      type: 1,
      phase: s0,
      move: [dir, 0, speed, largo],
    });
  }

  // ---- puente sobre la bahía
  {
    const pb = cc.puente;
    const A = new THREE.Vector3(...pb.desde);
    const B = new THREE.Vector3(...pb.hasta);
    const dir = B.clone().sub(A);
    const L = dir.length();
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      vertexShader: sueloMat.vertexShader,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying vec3 vWorld;
        void main() {
          vec3 col = vec3(0.012, 0.014, 0.02) + uHaze * 0.25;
          gl_FragColor = vec4(atmos(col, vWorld), 1.0);
        }
      `,
    });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(pb.ancho, 3, L + 100), mat);
    deck.position.copy(A).addScaledVector(dir, (L + 100) / 2);
    deck.rotation.y = yaw;
    deck.layers.enable(1);
    scene.add(deck);
    for (let s = 40; s < L; s += pb.pilas) {
      const p = A.clone().addScaledVector(dir, s);
      const pila = new THREE.Mesh(new THREE.BoxGeometry(7, A.y, 7), mat);
      pila.position.set(p.x, A.y / 2, p.z);
      pila.rotation.y = yaw;
      pila.layers.enable(1);
      scene.add(pila);
    }
    const lado = new THREE.Vector3(dir.z, 0, -dir.x);
    for (let s = 0; s < L + 100; s += 15) {
      for (const k of [-1, 1]) {
        const p = A.clone()
          .addScaledVector(dir, s)
          .addScaledVector(lado, (k * pb.ancho) / 2);
        lights.push({
          p: [p.x, A.y + 8, p.z],
          c: [1.7, 1.85, 2.2],
          size: 0.8,
          minPx: 1.0,
          type: 0,
          phase: 0,
        });
      }
    }
    for (let i = 0; i < 46; i++) {
      const carril = i % 2;
      const s0 = rnd() * (L + 100);
      const off = lado.clone().multiplyScalar(carril ? 4 : -4);
      const sgn = carril ? 1 : -1;
      const origen = A.clone().add(off);
      const color = carril ? [2.2, 2.2, 2.5] : [1.5, 0.08, 0.05];
      lights.push({
        p: [origen.x, A.y + 2.2, origen.z],
        c: color,
        size: 0.7,
        minPx: 0.9,
        type: 1,
        phase: s0,
        move: [dir.x * sgn, dir.z * sgn, 15 + rnd() * 6, L + 100],
        invert: sgn < 0,
      });
    }
  }

  // ---- luces puntuales (faroles, autos, balizas)
  const NL = lights.length;
  const quad = new THREE.PlaneGeometry(2, 2);
  const lgeo = new THREE.InstancedBufferGeometry();
  lgeo.index = quad.index;
  lgeo.setAttribute("position", quad.getAttribute("position"));
  const aPos = new Float32Array(NL * 3);
  const aCol = new Float32Array(NL * 3);
  const aPar = new Float32Array(NL * 4);
  const aMov = new Float32Array(NL * 4);
  lights.forEach((l, i) => {
    let p = l.p;
    if (l.invert) {
      // los autos en sentido contrario parten del otro extremo
      p = [p[0] - l.move[0] * l.move[3], p[1], p[2] - l.move[1] * l.move[3]];
    }
    aPos.set(p, i * 3);
    aCol.set(l.c, i * 3);
    aPar.set([l.size, l.minPx, l.type, l.phase], i * 4);
    aMov.set(l.move ?? [0, 0, 0, 1], i * 4);
  });
  lgeo.setAttribute("aPos", new THREE.InstancedBufferAttribute(aPos, 3));
  lgeo.setAttribute("aCol", new THREE.InstancedBufferAttribute(aCol, 3));
  lgeo.setAttribute("aPar", new THREE.InstancedBufferAttribute(aPar, 4));
  lgeo.setAttribute("aMov", new THREE.InstancedBufferAttribute(aMov, 4));
  lgeo.instanceCount = NL;
  const lmat = new THREE.ShaderMaterial({
    ...additive,
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec3 aPos, aCol;
      attribute vec4 aPar, aMov;
      varying vec2 vLocal;
      varying float vR;
      varying vec3 vCol;
      void main() {
        vec3 p = aPos;
        float I = 1.0;
        if (aPar.z == 1.0) {
          float s = mod(aPar.w + aMov.z * uTime, aMov.w);
          p += vec3(aMov.x, 0.0, aMov.y) * s;
        } else if (aPar.z == 2.0) {
          float ph = fract(uTime * 0.7 + aPar.w);
          I = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.18, 0.32, ph));
        }
        vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0);
        float d = distance(p, cameraPosition);
        float pxPerM = uRes.y / (2.0 * d * uTanHalf);
        float r = max(aPar.x * pxPerM, aPar.y * uDpr);
        float R = r * 3.0;
        vLocal = position.xy * R;
        vR = r;
        vCol = aCol * I * atmosLight(p);
        if (uReflectPass > 0.5 && p.y < 0.0) vCol = vec3(0.0);
        gl_Position = c;
        gl_Position.xy += position.xy * R / (0.5 * uRes) * c.w;
        if (c.w <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vLocal;
      varying float vR;
      varying vec3 vCol;
      void main() {
        float d2 = dot(vLocal, vLocal) / (vR * vR);
        float a = exp(-d2 * 1.6) + exp(-d2 * 0.25) * 0.06;
        gl_FragColor = vec4(vCol * a, 1.0);
      }
    `,
  });
  const luces = new THREE.Mesh(lgeo, lmat);
  luces.frustumCulled = false;
  luces.layers.enable(1);
  luces.renderOrder = 4;
  scene.add(luces);

  // materiales de una sola cara: el pase de reflejo invierte su orientación
  const unaCara = [];
  scene.traverse((o) => {
    if (o.material && o.material.side === THREE.FrontSide && !unaCara.includes(o.material))
      unaCara.push(o.material);
  });
  return { edificios: boxes.length + cyls.length, luces: NL, unaCara };
}
