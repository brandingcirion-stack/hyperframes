// Ciudad costera nocturna procedural (semilla fija) con criterio arquitectónico:
// cada torre se compone de podio, fuste con retranqueos y remate (linterna iluminada,
// sala de máquinas, techo inclinado o aguja). Las fachadas se sombrean según su
// tipología: muro cortina con montantes y antepechos, piedra con ventanas punzonadas,
// residencial con balcones, comercio en planta baja y patrimonio bañado en luz cálida.
// Las ventanas usan «interior mapping»: cada vano muestra un ambiente con techo
// iluminado, paredes y piso que cambian con el punto de vista. Las plantas se encienden
// por bloques de inquilino, con temperatura e intensidad estables (sin ruido temporal).
// Colores naturales: los colores de marca quedan reservados al logo, el haz y el cable.
import * as THREE from "../vendor/three.module.min.js";
import { COMMON } from "./glsl.js";
import { lerp, mulberry32 } from "./util.js";

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
};

// estilos: 0 muro cortina, 1 piedra/punzonada, 2 residencial, 3 podio comercial,
//          4 servicio (casi ciego), 5 patrimonio, 6 vidrio con aletas verticales
// remates (aInfo2.x): 0 ninguno, 1 reflectores cálidos, 2 reflectores neutros, 3 linterna
export function createCity({ U, C, scene, extras = {} }) {
  const cfg = C.ciudad;
  const rnd = mulberry32(C.semilla + cfg.semilla);
  const group = new THREE.Group();
  scene.add(group);

  const boxes = [];
  const cyls = [];
  const wedges = [];
  const lights = [];
  const costa = cfg.costa;
  const fondo = costa - cfg.profundidad;
  const zonaLibre = extras.zonaLibre;
  const reservados = extras.reservado ?? [];
  // límite de altura por posición (deja limpio el cielo detrás del logo)
  const alturaMax = extras.alturaMax ?? (() => Infinity);

  function pieza(list, b) {
    list.push({ crown: 0, crownFrac: 0, yaw: 0, ...b });
  }

  // Torre: podio + fuste con retranqueos + remate.
  function torre(x, z, w, d, h, yaw, estilo, opts = {}) {
    const seed = rnd() * 1000;
    const litR = 0.18 + rnd() * 0.32; // ocupación nocturna: 18–50 % de los pisos
    const cil = opts.cyl;
    let base = 0;
    // podio comercial más ancho en las torres
    if (h > 90 && !cil && rnd() < 0.7) {
      const hp = 9 + rnd() * 12;
      pieza(boxes, {
        x,
        z,
        w: w * 1.32,
        d: d * 1.25,
        h: hp,
        base: 0,
        yaw,
        style: 3,
        seed: seed + 1,
        litR: 0.5,
        total: hp,
      });
      base = hp;
    }
    const remate = h < 70 ? 0 : rnd();
    const crownType = h > 140 && rnd() < 0.2 ? (rnd() < 0.7 ? 1 : 2) : 0;
    const crownFrac = 0.08 + rnd() * 0.1;
    const tramos = h > 120 && !cil && rnd() < 0.55 ? (rnd() < 0.4 ? 3 : 2) : 1;
    const resto = h - base;
    let fw = w;
    let fd = d;
    for (let k = 0; k < tramos; k++) {
      const hk = tramos === 1 ? resto : k === 0 ? resto * 0.66 : (resto * 0.34) / (tramos - 1);
      pieza(cil ? cyls : boxes, {
        x,
        z,
        w: fw,
        d: fd,
        h: hk,
        base,
        yaw,
        style: estilo,
        seed,
        litR,
        total: h,
        crown: crownType,
        crownFrac,
      });
      base += hk;
      fw *= 0.82;
      fd *= 0.82;
    }
    if (cil) return;
    // remates
    if (remate > 0.93) {
      // linterna: volumen de vidrio iluminado sobre la cubierta
      const hl = 8 + rnd() * 10;
      pieza(boxes, {
        x,
        z,
        w: fw * 0.72,
        d: fd * 0.72,
        h: hl,
        base,
        yaw,
        style: 0,
        seed: seed + 7,
        litR: 0.6,
        total: base + hl,
        crown: 3,
        crownFrac: 1,
      });
    } else if (remate > 0.55) {
      // sala de máquinas
      const hm = 4 + rnd() * 4;
      pieza(boxes, {
        x: x + (rnd() - 0.5) * fw * 0.3,
        z,
        w: fw * 0.5,
        d: fd * 0.45,
        h: hm,
        base,
        yaw,
        style: 4,
        seed: seed + 9,
        litR: 0.05,
        total: base + hm,
      });
    } else if (remate > 0.4 && h > 150) {
      const hw = Math.min(fw, fd) * 0.7;
      pieza(wedges, {
        x,
        z,
        w: fw,
        d: fd,
        h: hw,
        base,
        yaw,
        style: estilo === 1 ? 1 : 0,
        seed,
        litR,
        total: base + hw,
        crown: crownType || 2,
        crownFrac: 1,
      });
    } else if (remate > 0.3 && h > 160) {
      const ha = h * (0.1 + rnd() * 0.12);
      pieza(cyls, { x, z, w: 1.6, d: 1.6, h: ha, base, style: 4, seed, litR: 0, total: base + ha });
      lights.push({
        p: [x, base + ha + 0.8, z],
        c: [2.4, 0.22, 0.14],
        size: 0.9,
        minPx: 1.0,
        type: 2,
        phase: rnd(),
      });
    }
  }

  // ---- manzanas
  for (let gz = costa - 26; gz > fondo; gz -= cfg.manzana) {
    for (let gx = cfg.x[0]; gx < cfg.x[1]; gx += cfg.manzana) {
      if (rnd() > 0.9) continue;
      const cx = gx + cfg.manzana / 2;
      const cz = gz - cfg.manzana / 2;
      let hT = cfg.alturaBase * (0.55 + 0.9 * rnd());
      for (const cl of cfg.clusters)
        hT += cl.alto * Math.exp(-(((cx - cl.x) / cl.rx) ** 2 + ((cz - cl.z) / cl.rz) ** 2));
      hT *= lerp(1, 0.35, Math.min(1, Math.max(0, (Math.abs(cx) - 1100) / 1500)));
      if (cz > costa - 120) hT = Math.min(hT, 30 + rnd() * 55);
      if (zonaLibre && Math.abs(cx - zonaLibre.x) < zonaLibre.rx && cz > zonaLibre.zMin)
        hT = Math.min(hT, zonaLibre.hMax);
      if (reservados.some(([rx, rz]) => Math.hypot(cx - rx, cz - rz) < 70)) continue;
      const lote = cfg.manzana - cfg.calle;
      const r = rnd();
      const n = hT > 140 ? 1 : r < 0.45 ? 1 : r < 0.85 ? 2 : 4;
      const q = lote / 4;
      const subs =
        n === 1
          ? [[0, 0, lote, lote]]
          : n === 2
            ? [
                [-q, 0, lote / 2, lote],
                [q, 0, lote / 2, lote],
              ]
            : [
                [-q, -q, lote / 2, lote / 2],
                [q, -q, lote / 2, lote / 2],
                [-q, q, lote / 2, lote / 2],
                [q, q, lote / 2, lote / 2],
              ];
      for (const [ox, oz, sw, sd] of subs) {
        let h = hT * (0.55 + 0.7 * rnd());
        if (rnd() < 0.05) h *= 1.5;
        // detrás del logo cada torre recibe su propio tope (sin una línea de techos plana)
        const tope = alturaMax(cx + ox, cz + oz) * (0.5 + 0.5 * rnd());
        h = Math.max(9, Math.min(h, 300, tope));
        // proporciones: torres esbeltas, placas y bloques bajos
        const esbelta = h > 120 && rnd() < 0.45;
        const w = sw * (esbelta ? 0.5 + 0.2 * rnd() : 0.66 + 0.28 * rnd());
        const d = sd * (esbelta ? 0.5 + 0.2 * rnd() : 0.55 + 0.35 * rnd());
        const yaw = rnd() < 0.12 ? (rnd() - 0.5) * 0.6 : 0;
        const s = rnd();
        let style;
        if (h < 40) style = s < 0.55 ? 2 : s < 0.8 ? 1 : 4;
        else if (h < 100) style = s < 0.35 ? 1 : s < 0.65 ? 2 : s < 0.92 ? 0 : 4;
        else style = s < 0.62 ? 0 : s < 0.78 ? 6 : s < 0.93 ? 1 : 2;
        const cyl = h > 130 && style === 0 && rnd() < 0.12;
        torre(cx + ox, cz + oz, w, cyl ? w : d, h, yaw, style, { cyl });
      }
    }
  }
  // torre icónica afinada con remate iluminado
  {
    const t = cfg.torreIconica;
    let lado = t.lado;
    let base = 0;
    for (let k = 0; k < 5; k++) {
      const hk = t.alto * (k < 4 ? 0.22 : 0.12);
      pieza(boxes, {
        x: t.x,
        z: t.z,
        w: lado,
        d: lado * 0.82,
        h: hk,
        base,
        yaw: 0.3,
        style: 0,
        seed: 77 + k,
        litR: 0.62,
        total: t.alto,
        crown: 1,
        crownFrac: 0.12,
      });
      base += hk;
      lado *= 0.9;
    }
    pieza(cyls, {
      x: t.x,
      z: t.z,
      w: 1.8,
      d: 1.8,
      h: 46,
      base,
      style: 4,
      seed: 5,
      litR: 0,
      total: base + 46,
    });
    lights.push({
      p: [t.x, base + 47, t.z],
      c: [2.4, 0.22, 0.14],
      size: 1.2,
      minPx: 1.1,
      type: 2,
      phase: 0.3,
    });
  }
  // edificio patrimonial bañado en luz cálida sobre la costanera
  if (extras.patrimonio) {
    const [px, pz] = extras.patrimonio;
    pieza(boxes, {
      x: px,
      z: pz,
      w: 150,
      d: 60,
      h: 26,
      base: 0,
      style: 5,
      seed: 12,
      litR: 0.55,
      total: 34,
    });
    pieza(boxes, {
      x: px,
      z: pz,
      w: 118,
      d: 40,
      h: 8,
      base: 26,
      style: 5,
      seed: 13,
      litR: 0.55,
      total: 34,
    });
  }

  // ---- material de fachadas
  const makeMat = (forma) =>
    new THREE.ShaderMaterial({
      uniforms: { ...U, uForma: { value: forma } },
      vertexShader: /* glsl */ `
        attribute vec3 aDim;
        attribute vec4 aInfo;   // semilla, estilo, ocupación, base
        attribute vec4 aInfo2;  // remate, -, altura total, fracción del remate
        varying vec3 vLp, vWorld, vN, vDim;
        varying vec4 vInfo, vInfo2;
        varying mat3 vRot;
        void main() {
          vLp = position * aDim;
          vDim = aDim;
          vInfo = aInfo;
          vInfo2 = aInfo2;
          vN = normal;
          mat3 m = mat3(modelMatrix * instanceMatrix);
          vRot = mat3(normalize(m[0]), normalize(m[1]), normalize(m[2]));
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON}
        uniform float uForma; // 0 caja, 1 cilindro, 2 techo inclinado
        varying vec3 vLp, vWorld, vN, vDim;
        varying vec4 vInfo, vInfo2;
        varying mat3 vRot;

        const vec3 K2700 = vec3(1.0, 0.70, 0.43);
        const vec3 K3200 = vec3(1.0, 0.80, 0.60);
        const vec3 K4000 = vec3(1.0, 0.90, 0.80);
        const vec3 K5000 = vec3(0.88, 0.93, 1.0);

        // Entorno reflejado: cielo nocturno con resplandor urbano y luces lejanas.
        vec3 entorno(vec3 R, float rug, float seed) {
          float el = R.y;
          vec3 sky = uHaze * (0.08 + 2.2 * exp(-max(el, 0.0) * 7.0));
          // por debajo del horizonte: la ciudad y la calle (más cálida, salpicada de luces)
          vec3 abajo = vec3(0.018, 0.015, 0.013) + K2700 * 0.02 * smoothstep(0.0, -0.4, el);
          vec2 p = vec2(atan(R.z, R.x) * 30.0, el * 60.0) + seed;
          float luces = smoothstep(0.86 + rug * 0.1, 0.97, vnoise(p)) * (1.0 - rug);
          abajo += K3200 * luces * 0.35;
          return mix(sky, abajo, smoothstep(0.02, -0.06, el));
        }

        // Interior de un vano visto a través del vidrio (interior mapping).
        vec3 interior(vec2 f, vec3 rd, float ww, float fh, float D, float lit, vec3 lc, float h) {
          vec3 o = vec3(f.x * ww, f.y * fh, 0.0);
          float tx = rd.x > 0.0 ? (ww - o.x) / max(rd.x, 1e-4) : o.x / max(-rd.x, 1e-4);
          float ty = rd.y > 0.0 ? (fh - o.y) / max(rd.y, 1e-4) : o.y / max(-rd.y, 1e-4);
          float tz = D / max(rd.z, 1e-3);
          float t = min(tx, min(ty, tz));
          vec3 q = o + rd * t;
          vec3 amb = lc * 0.012 + vec3(0.003);
          vec3 c;
          if (t == ty && rd.y > 0.0) {
            // techo con luminarias lineales
            float lum = smoothstep(0.18, 0.0, abs(fract(q.z / 1.8 + h) - 0.5) - 0.32);
            c = lc * (0.3 + 0.6 * lum);
          } else if (t == ty) {
            c = lc * 0.07 * (1.0 - 0.4 * q.z / D);
          } else if (t == tz) {
            // fondo: tabiques y mobiliario a contraluz
            float mueble = step(q.y, 0.95 + 0.25 * h) * step(0.3, fract(q.x / 2.3 + h));
            c = lc * (0.22 + 0.13 * q.y / fh) * (1.0 - 0.55 * mueble);
          } else {
            c = lc * 0.14 * (0.5 + 0.5 * q.y / fh);
          }
          return mix(amb, c, lit);
        }

        void main() {
          float seed = vInfo.x;
          float style = vInfo.y;
          float litR = vInfo.z;
          float v = vLp.y + vInfo.w;
          float H = vInfo2.z;
          vec3 n = vN;
          vec3 V = normalize(cameraPosition - vWorld);
          bool techo = uForma > 1.5 ? n.y > 0.95 : abs(n.y) > 0.5;

          // sistema local de la cara: T (a lo largo), Y (arriba), N (fuera)
          vec3 nl;
          vec3 tl;
          float u;
          float faceW;
          float face;
          if (uForma > 0.5 && uForma < 1.5) {
            vec2 dir = normalize(vLp.xz / max(vDim.xz, vec2(1e-3)));
            nl = vec3(dir.x, 0.0, dir.y);
            tl = vec3(-dir.y, 0.0, dir.x);
            u = atan(vLp.z, vLp.x) * max(vDim.x, vDim.z) * 0.5;
            faceW = 3.14159 * max(vDim.x, vDim.z);
            face = 0.0;
          } else if (abs(n.x) > 0.5) {
            nl = vec3(sign(n.x), 0.0, 0.0);
            tl = vec3(0.0, 0.0, 1.0); // a lo largo de u = z local
            u = vLp.z; faceW = vDim.z; face = n.x > 0.0 ? 1.0 : 2.0;
          } else {
            nl = vec3(0.0, 0.0, sign(n.z));
            tl = vec3(1.0, 0.0, 0.0); // a lo largo de u = x local
            u = vLp.x; faceW = vDim.x; face = n.z > 0.0 ? 3.0 : 4.0;
          }
          vec3 Nw = normalize(vRot * (techo ? vec3(0.0, sign(n.y), 0.0) : nl));
          vec3 Tw = normalize(vRot * tl);
          float NdV = max(dot(Nw, V), 0.0);
          vec3 R = reflect(-V, Nw);
          vec3 col;

          if (techo) {
            col = vec3(0.006, 0.006, 0.007) + uHaze * 0.12;
            float eq = step(0.987, hash12(floor(vLp.xz / 3.0) + seed));
            col += K4000 * eq * 0.12;
          } else {
            // tipología
            float fh = style == 2.0 ? 3.1 : style == 3.0 ? 5.2 : style == 5.0 ? 5.6 : 3.9;
            float ww = style == 0.0 ? 1.5 : style == 6.0 ? 1.2 : style == 2.0 ? 3.3 : style == 3.0 ? 4.0 : style == 5.0 ? 3.2 : 2.4;
            float D = style == 2.0 ? 4.0 : 6.0;
            vec2 cf = vec2(u / ww, v / fh);
            vec2 id = floor(cf);
            vec2 f = fract(cf);
            vec2 dc = fwidth(cf);
            float pxCelda = 1.0 / max(max(dc.x, dc.y), 1e-4);
            float nitido = smoothstep(1.5, 3.5, pxCelda);
            float pxPiso = 1.0 / max(dc.y, 1e-4);
            float pisoNitido = smoothstep(0.8, 2.0, pxPiso);

            // iluminación organizada: bloques de pisos por inquilino, algunos vanos apagados
            float bloque = floor(id.y / (1.0 + floor(fract(seed * 3.7) * 3.0)));
            float hb = hash12(vec2(bloque, seed));
            float pisoOn = step(hb, litR);
            if (style == 2.0) pisoOn = step(hash12(id + seed * 0.13 + face), litR * 0.85); // viviendas: por unidad
            if (style == 3.0 || style == 5.0) pisoOn = id.y < 1.0 ? 1.0 : step(hb, litR);
            if (style == 4.0) pisoOn = step(hash12(id + seed), 0.06);
            float vanoOn = step(0.3, hash12(id * 1.7 + seed + face * 5.0));
            // grupos de vanos a lo largo del piso (oficinas, salas): rompe las bandas parejas
            float grupo = step(0.3, hash12(vec2(floor(u / (ww * (4.0 + 6.0 * fract(seed * 1.9)))), id.y * 1.31 + seed + face)));
            float lit = pisoOn * vanoOn * grupo;
            // cara de servicio: núcleo casi ciego
            float ciega = step(hash12(vec2(face, seed)), style == 0.0 || style == 6.0 ? 0.12 : 0.2);
            // temperatura e intensidad moderadas por inquilino
            float tc = hash12(vec2(bloque * 1.3 + face, seed * 2.1));
            vec3 lc = tc < 0.38 ? K3200 : tc < 0.65 ? K2700 : tc < 0.9 ? K4000 : K5000;
            if (style == 2.0) lc = tc < 0.6 ? K2700 : K3200;
            float inten = mix(0.75, 1.1, hash12(vec2(bloque, seed + face)));
            lc *= inten * (id.y < 1.0 ? 1.3 : 1.0);

            // vista dentro del vano (espacio local de la cara)
            vec3 Yw = normalize(vRot * vec3(0.0, 1.0, 0.0));
            vec3 rd = normalize(vec3(dot(-V, Tw), dot(-V, Yw), dot(-V, -Nw)));
            float Fg = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
            float rug = style == 0.0 || style == 6.0 ? 0.12 + 0.2 * fract(seed * 5.3) : 0.35;
            // cada paño refleja algo distinto (planitud y ángulo de montaje imperfectos)
            vec3 env = entorno(R, rug, seed) * (0.75 + 0.5 * hash12(id * 0.37 + seed + face));
            vec3 envMedio = entorno(R, rug, seed);

            // Detalle (vanos resueltos) y promedios para cuando el vano o el piso no se
            // resuelven en píxeles: apagado (muro + reflejo) y encendido (+ interior medio
            // por la fracción de vidrio y de vanos encendidos). Conservan la energía del
            // detalle: a distancia no aparecen bandas más brillantes que de cerca.
            vec3 detalle;
            vec3 apagado;
            float aVano;
            vec3 interiorMedio = lc * 0.2;
            if (style == 0.0 || style == 6.0) {
              // muro cortina: montantes, antepecho por piso, vidrio con interior
              float mw = 0.06 / ww;
              float montante = 1.0 - step(mw, f.x) * step(f.x, 1.0 - mw);
              float antepecho = step(f.y, 0.24);
              float aleta = style == 6.0 ? smoothstep(0.1, 0.0, abs(f.x - 0.5) - 0.38) : 0.0;
              vec3 vidrio = interior(f, rd, ww, fh, D, lit * (1.0 - ciega), lc, hash12(id + seed)) * (1.0 - Fg) * 0.9 + env * Fg;
              vec3 panel = env * (0.25 + 0.75 * Fg) + vec3(0.004);
              vec3 metal = env * 0.55 + K2700 * 0.02 * smoothstep(40.0, 0.0, v) + vec3(0.006);
              detalle = mix(vidrio, panel, antepecho);
              detalle = mix(detalle, metal, max(montante, aleta));
              apagado = envMedio * (0.35 + 0.65 * Fg) + vec3(0.004);
              aVano = 0.7 * (1.0 - ciega) * (1.0 - Fg) * 0.9;
            } else if (style == 2.0) {
              // residencial: losas de balcón, carpinterías, ventanas cálidas
              float losa = step(f.y, 0.1);
              float vano = step(0.18, f.x) * step(f.x, 0.82) * step(0.2, f.y) * step(f.y, 0.88);
              vec3 muro = vec3(0.045, 0.042, 0.04) * (uHaze * 4.0 + K2700 * 0.05 * smoothstep(30.0, 0.0, v));
              vec3 ventana = interior(f, rd, ww, fh, D, lit, lc * 0.85, hash12(id + seed)) * (1.0 - Fg) + env * Fg;
              detalle = mix(muro, ventana, vano);
              detalle = mix(detalle, muro * 1.6 + K3200 * 0.01 * lit, losa);
              apagado = muro * 0.6 + envMedio * Fg * 0.43;
              aVano = 0.43 * 0.85 * (1.0 - Fg);
            } else if (style == 5.0) {
              // patrimonio: piedra bañada en luz cálida desde abajo, vanos más oscuros
              float vano = step(0.28, f.x) * step(f.x, 0.72) * step(0.14, f.y) * step(f.y, 0.78);
              vec3 piedra = vec3(0.55, 0.47, 0.36) * K2700 * (0.2 + 0.3 * smoothstep(H, 0.0, v));
              vec3 ventana = interior(f, rd, ww, fh, D, lit, lc, hash12(id + seed)) * 0.8;
              detalle = mix(piedra, ventana, vano);
              apagado = piedra * 0.72;
              aVano = 0.28 * 0.8;
            } else {
              // piedra/hormigón con ventanas punzonadas, podios comerciales y servicio
              float fx = style == 3.0 ? 0.06 : 0.17;
              float fy = style == 3.0 ? 0.12 : 0.25;
              float vano = step(fx, f.x) * step(f.x, 1.0 - fx) * step(fy, f.y) * step(f.y, 0.92);
              vec3 muro = vec3(0.05, 0.048, 0.046) * (uHaze * 3.5 + K2700 * 0.06 * smoothstep(25.0, 0.0, v));
              vec3 ventana = interior(f, rd, ww, fh, D, lit * (1.0 - ciega), lc, hash12(id + seed)) * (1.0 - Fg) + env * Fg;
              detalle = mix(muro, ventana, vano);
              float fv = (1.0 - 2.0 * fx) * (0.92 - fy);
              apagado = muro * (1.0 - fv) + envMedio * Fg * fv;
              aVano = fv * (1.0 - ciega) * (1.0 - Fg);
            }
            // piso sin resolver ventanas: grupos encendidos de ese piso (≈70 % de sus vanos)
            vec3 porPiso = apagado + interiorMedio * aVano * pisoOn * grupo * 0.7;
            // ni pisos resueltos: ocupación media del edificio, temperatura promedio
            vec3 sinPisos = apagado + K3200 * 0.2 * aVano * litR * 0.49;
            vec3 lejos = mix(sinPisos, porPiso, pisoNitido);
            col = mix(lejos, detalle, nitido);

            // remate con reflectores: lavado ascendente con aletas y borde superior
            if (vInfo2.x > 0.5) {
              float h0 = H * (1.0 - vInfo2.w);
              float k = smoothstep(h0, H, v);
              vec3 cc = vInfo2.x < 1.5 ? K2700 * vec3(1.0, 0.9, 0.66) : K3200;
              if (vInfo2.x > 2.5) {
                // linterna: vidrio iluminado de forma pareja
                col = mix(col, K2700 * (0.22 + 0.1 * smoothstep(0.1, 0.0, abs(f.x - 0.5) - 0.42)), 0.8);
              } else {
                float aletas = 0.55 + 0.45 * smoothstep(0.25, 0.0, abs(fract(u / 2.4) - 0.5) - 0.1);
                col += cc * (pow(k, 2.0) * 0.2 * aletas + smoothstep(1.2, 0.0, H - v) * 0.06);
              }
            }
            // luz cálida de calle sobre la base de las fachadas
            col += K2700 * 0.03 * exp(-v / 14.0);
          }
          gl_FragColor = vec4(atmos(col, vWorld), 1.0);
        }
      `,
    });

  const materiales = [];
  function buildInstanced(list, geo, forma) {
    if (!list.length) return;
    const mat = makeMat(forma);
    materiales.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
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
      aInfo2.set([b.crown, 0, b.total, b.crownFrac], i * 4);
    });
    geo.setAttribute("aDim", new THREE.InstancedBufferAttribute(aDim, 3));
    geo.setAttribute("aInfo", new THREE.InstancedBufferAttribute(aInfo, 4));
    geo.setAttribute("aInfo2", new THREE.InstancedBufferAttribute(aInfo2, 4));
    mesh.frustumCulled = false;
    mesh.layers.enable(1);
    group.add(mesh);
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32, 1);
  cylGeo.translate(0, 0.5, 0);
  const wedgeGeo = new THREE.BoxGeometry(1, 1, 1);
  wedgeGeo.translate(0, 0.5, 0);
  {
    const p = wedgeGeo.getAttribute("position");
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.99 && p.getX(i) > 0) p.setY(i, 0.02);
    wedgeGeo.computeVertexNormals();
  }
  buildInstanced(boxes, boxGeo, 0);
  buildInstanced(cyls, cylGeo, 1);
  buildInstanced(wedges, wedgeGeo, 2);

  // ---- suelo urbano y muro de la costanera (sobre el nivel del agua)
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
        // hormigón del muro iluminado por los faroles de la costanera
        vec3 col = vec3(0.01, 0.009, 0.008) + vec3(1.0, 0.72, 0.45) * 0.02 * smoothstep(-1.0, 2.0, vWorld.y);
        gl_FragColor = vec4(atmos(col, vWorld), 1.0);
      }
    `,
  });
  materiales.push(sueloMat);
  const suelo = new THREE.Mesh(new THREE.BoxGeometry(9000, 1, cfg.profundidad + 3000), sueloMat);
  suelo.position.set(0, 0.9, costa - (cfg.profundidad + 3000) / 2);
  suelo.layers.enable(1);
  group.add(suelo);
  const muro = new THREE.Mesh(new THREE.BoxGeometry(9000, 2.6, 3), sueloMat);
  muro.position.set(0, 1.1, costa + 1);
  muro.layers.enable(1);
  group.add(muro);

  // ---- costanera: faroles cálidos y tránsito
  for (let x = -3400; x < 3400; x += 22) {
    lights.push({
      p: [x, 7, costa - 3],
      c: [2.1, 1.55, 1.0],
      size: 0.8,
      minPx: 1.0,
      type: 0,
      phase: 0,
    });
  }
  const largo = 6800;
  for (let i = 0; i < cfg.autos; i++) {
    const carril = i % 2;
    const speed = 13 + rnd() * 9;
    const s0 = rnd() * largo;
    const z = costa - 14 - carril * 6;
    const dir = carril ? -1 : 1;
    lights.push({
      p: [-3400, 1.6, z],
      c: [2.2, 2.0, 1.7],
      size: 0.6,
      minPx: 0.8,
      type: 1,
      phase: s0,
      move: [dir, 0, speed, largo],
    });
    lights.push({
      p: [-3400 - dir * 4, 1.6, z],
      c: [1.5, 0.08, 0.05],
      size: 0.5,
      minPx: 0.7,
      type: 1,
      phase: s0,
      move: [dir, 0, speed, largo],
    });
  }

  // ---- puente con luminarias cálidas
  if (cfg.puente) {
    const pb = cfg.puente;
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
          float abajo = smoothstep(${(pb.desde[1] - 1).toFixed(1)}, ${(pb.desde[1] - 2.5).toFixed(1)}, vWorld.y);
          vec3 col = vec3(0.014, 0.013, 0.013) + uHaze * 0.2 + vec3(1.0, 0.72, 0.45) * 0.03 * abajo;
          gl_FragColor = vec4(atmos(col, vWorld), 1.0);
        }
      `,
    });
    materiales.push(mat);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(pb.ancho, 3, L + 100), mat);
    deck.position.copy(A).addScaledVector(dir, (L + 100) / 2);
    deck.rotation.y = yaw;
    deck.layers.enable(1);
    group.add(deck);
    for (let s = 40; s < L; s += pb.pilas) {
      const p = A.clone().addScaledVector(dir, s);
      const pila = new THREE.Mesh(new THREE.BoxGeometry(7, A.y, 7), mat);
      pila.position.set(p.x, A.y / 2, p.z);
      pila.rotation.y = yaw;
      pila.layers.enable(1);
      group.add(pila);
    }
    const lado = new THREE.Vector3(dir.z, 0, -dir.x);
    for (let s = 0; s < L + 100; s += 15) {
      for (const k of [-1, 1]) {
        const p = A.clone()
          .addScaledVector(dir, s)
          .addScaledVector(lado, (k * pb.ancho) / 2);
        lights.push({
          p: [p.x, A.y + 6, p.z],
          c: [2.0, 1.5, 0.95],
          size: 0.7,
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
      const color = carril ? [2.1, 2.0, 1.7] : [1.4, 0.08, 0.05];
      lights.push({
        p: [origen.x, A.y + 2.2, origen.z],
        c: color,
        size: 0.6,
        minPx: 0.8,
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
    if (l.invert) p = [p[0] - l.move[0] * l.move[3], p[1], p[2] - l.move[1] * l.move[3]];
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
        p = (modelMatrix * vec4(p, 1.0)).xyz;
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
        float a = exp(-d2 * 1.6) + exp(-d2 * 0.25) * 0.05;
        gl_FragColor = vec4(vCol * a, 1.0);
      }
    `,
  });
  const luces = new THREE.Mesh(lgeo, lmat);
  luces.frustumCulled = false;
  luces.layers.enable(1);
  luces.renderOrder = 4;
  group.add(luces);

  return {
    group,
    edificios: boxes.length + cyls.length + wedges.length,
    luces: NL,
    unaCara: materiales,
  };
}
