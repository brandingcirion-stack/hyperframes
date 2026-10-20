// Ciudad costera nocturna procedural (semilla fija). Fachadas modeladas sobre la
// referencia de bahía urbana: coronas con reflectores dorados, muros cortina de vidrio
// con montantes y pisos de oficina encendidos, residenciales con balcones, edificio
// patrimonial iluminado y luces bajas violetas en la costanera.
// Se genera en coordenadas locales (costa en z = costa, tierra hacia −z) y un grupo la
// ubica en el mundo: así la misma función crea la ciudad A y la ciudad B.
import * as THREE from "../vendor/three.module.min.js";
import { COMMON } from "./glsl.js";
import { lerp, mulberry32 } from "./util.js";

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
};

// tipos de corona: 0 ninguna, 1 oro, 2 blanca, 3 azul, 4 magenta
// estilos: 0 oficina, 1 muro cortina, 2 residencial, 3 técnico oscuro, 4 medios LED, 5 patrimonio
export function createCity({ U, C, scene, cfg, variante, posicion, giro, despertar, extras = {} }) {
  const tecnologica = variante === "tecnologica";
  const rnd = mulberry32(C.semilla + cfg.semilla);
  const group = new THREE.Group();
  group.position.set(...posicion);
  group.rotation.y = giro;
  scene.add(group);
  const toLocal = (wx, wz) => {
    const v = new THREE.Vector3(wx, 0, wz)
      .sub(group.position)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -giro);
    return [v.x, v.z];
  };

  const boxes = [];
  const cyls = [];
  const wedges = [];
  const lights = [];
  const costa = cfg.costa;
  const fondo = costa - cfg.profundidad;
  const zonaLibre = extras.zonaLibre; // {x, rx, zMin, hMax} en local
  const reservados = (extras.reservado ?? []).map(([x, z]) => toLocal(x, z)); // dados en mundo
  const [sx0, sx1] = cfg.suelo ?? [-4500, 4500];

  function crownFor(h) {
    if (h < 90 || rnd() > (tecnologica ? 0.42 : 0.5)) return 0;
    const r = rnd();
    if (tecnologica) return r < 0.15 ? 1 : r < 0.35 ? 2 : r < 0.9 ? 3 : 4;
    return r < 0.7 ? 1 : r < 0.82 ? 2 : r < 0.95 ? 3 : 4;
  }

  function addBuilding(x, z, w, d, h, yaw, estilo, opts = {}) {
    let style = estilo;
    if (!opts.cyl && h > 160 && rnd() < (tecnologica ? 0.3 : 0.14)) style = 4;
    const seed = rnd() * 1000;
    const litR = style === 3 ? 0.1 + rnd() * 0.1 : 0.3 + rnd() * 0.45;
    const crown = opts.crown ?? crownFor(h);
    const led =
      opts.led ?? ((style === 1 || style === 4) && rnd() < (tecnologica ? 0.5 : 0.25) ? 1 : 0);
    const uplight = opts.uplight ?? 0;
    const crownFrac = 0.1 + rnd() * 0.14;
    const target = opts.cyl ? cyls : boxes;
    let base = 0;
    const tramos = h > 110 && !opts.cyl && rnd() < 0.5 ? (rnd() < 0.4 ? 3 : 2) : 1;
    let fw = w;
    let fd = d;
    for (let k = 0; k < tramos; k++) {
      const hk = tramos === 1 ? h : k === 0 ? h * 0.7 : (h * 0.3) / (tramos - 1);
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
        crown,
        crownFrac,
        led,
        uplight,
      });
      base += hk;
      fw *= 0.78;
      fd *= 0.78;
    }
    // remates: techo inclinado o aguja
    if (!opts.cyl && h > 120) {
      const r = rnd();
      if (r < 0.22) {
        const hw = Math.min(fw, fd) * 0.9;
        wedges.push({
          x,
          z,
          w: fw,
          d: fd,
          h: hw * 0.8,
          base,
          yaw,
          style,
          seed,
          litR,
          total: h + hw * 0.8,
          crown: crown || 1,
          crownFrac: 0.9,
          led: 0,
          uplight: 0,
        });
      } else if (r < 0.36) {
        const ha = h * (0.12 + rnd() * 0.12);
        cyls.push({
          x,
          z,
          w: 2.2,
          d: 2.2,
          h: ha,
          base,
          yaw: 0,
          style: 3,
          seed,
          litR: 0,
          total: h + ha,
          crown: 0,
          crownFrac: 0,
          led: 0,
          uplight: 0,
        });
        lights.push({
          p: [x, h + ha + 1, z],
          c: [2.6, 0.22, 0.16],
          size: 1.2,
          minPx: 1.2,
          type: 2,
          phase: rnd(),
        });
      }
    }
    if (h > 190 && rnd() < 0.5) {
      lights.push({
        p: [x, h + 2, z],
        c: [2.6, 0.22, 0.16],
        size: 1.2,
        minPx: 1.2,
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
      for (const cl of cfg.clusters) {
        hT += cl.alto * Math.exp(-(((cx - cl.x) / cl.rx) ** 2 + ((cz - cl.z) / cl.rz) ** 2));
      }
      hT *= lerp(1, 0.35, Math.min(1, Math.max(0, (Math.abs(cx) - 1100) / 1500)));
      if (cz > costa - 120) hT = Math.min(hT, 34 + rnd() * 60);
      if (zonaLibre && Math.abs(cx - zonaLibre.x) < zonaLibre.rx && cz > zonaLibre.zMin)
        hT = Math.min(hT, zonaLibre.hMax);
      if (reservados.some(([rx, rz]) => Math.hypot(cx - rx, cz - rz) < 60)) continue;
      const lote = cfg.manzana - cfg.calle;
      const r = rnd();
      const n = hT > 150 ? 1 : r < 0.5 ? 1 : r < 0.85 ? 2 : 4;
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
        if (rnd() < 0.06) h *= 1.5;
        h = Math.max(9, Math.min(h, 330));
        const w = sw * (0.62 + 0.3 * rnd());
        const d = sd * (0.62 + 0.3 * rnd());
        const yaw = rnd() < 0.14 ? (rnd() - 0.5) * 0.7 : 0;
        const s = rnd();
        const style = h < 45 ? (s < 0.6 ? 2 : 0) : s < 0.38 ? 0 : s < 0.8 ? 1 : s < 0.92 ? 2 : 3;
        const cyl = h > 130 && rnd() < (tecnologica ? 0.22 : 0.15);
        // la primera línea de la costa recibe luces bajas violetas / azules / magenta
        const uplight =
          cz > costa - 110 && rnd() < 0.4 ? (rnd() < 0.55 ? 1 : rnd() < 0.6 ? 2 : 3) : 0;
        addBuilding(cx + ox, cz + oz, w, cyl ? w * (0.8 + 0.4 * rnd()) : d, h, yaw, style, {
          cyl,
          uplight,
        });
      }
    }
  }
  // torre icónica: cuerpo afinado por tramos, corona con reflectores
  {
    const t = cfg.torreIconica;
    let lado = t.lado;
    let base = 0;
    for (let k = 0; k < 6; k++) {
      const hk = t.alto * (k < 5 ? 0.19 : 0.05);
      boxes.push({
        x: t.x,
        z: t.z,
        w: lado,
        d: lado * 0.8,
        h: hk,
        base,
        yaw: 0.3,
        style: 1,
        seed: 77 + k,
        litR: 0.6,
        total: t.alto,
        crown: tecnologica ? 3 : 1,
        crownFrac: 0.22,
        led: 1,
        uplight: 0,
      });
      base += hk;
      lado *= 0.88;
    }
    cyls.push({
      x: t.x,
      z: t.z,
      w: 2.4,
      d: 2.4,
      h: 60,
      base,
      yaw: 0,
      style: 3,
      seed: 5,
      litR: 0,
      total: base + 60,
      crown: 0,
      crownFrac: 0,
      led: 0,
      uplight: 0,
    });
    lights.push({
      p: [t.x, base + 61, t.z],
      c: [2.6, 0.22, 0.16],
      size: 1.6,
      minPx: 1.4,
      type: 2,
      phase: 0.3,
    });
  }
  // edificio patrimonial bañado en luz dorada sobre la costanera (solo ciudad A)
  if (extras.patrimonio) {
    const [px, pz] = extras.patrimonio;
    boxes.push({
      x: px,
      z: pz,
      w: 150,
      d: 60,
      h: 28,
      base: 0,
      yaw: 0,
      style: 5,
      seed: 12,
      litR: 0.5,
      total: 28,
      crown: 0,
      crownFrac: 0,
      led: 0,
      uplight: 0,
    });
    boxes.push({
      x: px,
      z: pz,
      w: 120,
      d: 40,
      h: 8,
      base: 28,
      yaw: 0,
      style: 5,
      seed: 13,
      litR: 0.5,
      total: 36,
      crown: 1,
      crownFrac: 1,
      led: 0,
      uplight: 0,
    });
  }
  // torres pedidas por la escena (p. ej. la torre de datos de donde sale el cable)
  for (const e of extras.torres ?? []) {
    const [lx, lz] = toLocal(e.x, e.z);
    boxes.push({
      x: lx,
      z: lz,
      w: e.lado,
      d: e.lado,
      h: e.alto,
      base: 0,
      yaw: 0,
      style: 1,
      seed: 3.3,
      litR: 0.7,
      total: e.alto,
      crown: 3,
      crownFrac: 0.12,
      led: 1,
      uplight: 0,
    });
    boxes.push({
      x: lx,
      z: lz,
      w: e.lado * 0.5,
      d: e.lado * 0.5,
      h: 6,
      base: e.alto,
      yaw: 0,
      style: 3,
      seed: 3.4,
      litR: 0,
      total: e.alto + 6,
      crown: 3,
      crownFrac: 1,
      led: 1,
      uplight: 0,
    });
  }

  // ---- material de fachadas
  const awake = new THREE.Vector4(...(despertar ?? [0, 0, 0, 0]));
  const makeMat = (forma) =>
    new THREE.ShaderMaterial({
      uniforms: {
        ...U,
        uForma: { value: forma },
        uAwake: { value: awake },
        uOro: { value: new THREE.Color(C.colores.oro) },
        uVioleta: { value: new THREE.Color(C.colores.violeta) },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aDim;
        attribute vec4 aInfo;   // semilla, estilo, ocupación, base
        attribute vec4 aInfo2;  // corona, led, altura total, fracción de corona
        attribute float aUp;    // luz baja
        varying vec3 vLp, vWorld, vN, vDim, vNw;
        varying vec4 vInfo, vInfo2;
        varying float vUp;
        void main() {
          vLp = position * aDim;
          vDim = aDim;
          vInfo = aInfo;
          vInfo2 = aInfo2;
          vUp = aUp;
          vN = normal;
          mat3 m = mat3(modelMatrix * instanceMatrix);
          vNw = normalize(m * (normal / max(aDim, vec3(1e-3))));
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON}
        uniform float uForma; // 0 caja, 1 cilindro, 2 techo inclinado
        uniform vec4 uAwake;
        uniform vec3 uAzul, uMagenta, uOro, uVioleta;
        varying vec3 vLp, vWorld, vN, vDim, vNw;
        varying vec4 vInfo, vInfo2;
        varying float vUp;

        vec3 crownColor(float k) {
          return k < 1.5 ? uOro : k < 2.5 ? vec3(1.0, 0.95, 0.88) : k < 3.5 ? uAzul : uMagenta;
        }

        void main() {
          float seed = vInfo.x;
          float style = vInfo.y;
          float litR = vInfo.z;
          float v = vLp.y + vInfo.w;
          float H = vInfo2.z;
          vec3 n = vN;
          vec3 V = normalize(cameraPosition - vWorld);
          // ciudad dormida (B) hasta que llega la ola de conexión
          float dW = distance(vWorld.xz, uAwake.xy);
          float despierta = uAwake.w > 0.5 ? 1.0 - smoothstep(uAwake.z - 70.0, uAwake.z, dW) : 1.0;
          float frente = uAwake.w > 0.5 ? exp(-pow((dW - uAwake.z) / 26.0, 2.0)) * step(1.0, uAwake.z) : 0.0;

          float u;
          float faceW;
          float face;
          bool techo = uForma > 1.5 ? n.y > 0.95 : abs(n.y) > 0.5;
          if (uForma > 0.5 && uForma < 1.5) {
            float ang = atan(vLp.z, vLp.x);
            u = ang * max(vDim.x, vDim.z) * 0.5;
            faceW = 3.14159 * max(vDim.x, vDim.z);
            face = 0.0;
          } else if (abs(n.x) > 0.5) {
            u = vLp.z; faceW = vDim.z; face = n.x > 0.0 ? 1.0 : 2.0;
          } else {
            u = vLp.x; faceW = vDim.x; face = n.z > 0.0 ? 3.0 : 4.0;
          }
          float fres = pow(1.0 - clamp(abs(dot(normalize(vNw), V)), 0.0, 1.0), 3.0);
          // reflejo del cielo y de los vecinos en el vidrio (manchas suaves)
          float vecinos = 0.6 + 0.8 * vnoise(vec2(u * 0.04 + seed, v * 0.015));
          vec3 reflejo = uHaze * (0.08 + 0.9 * fres) * vecinos;
          vec3 col;

          if (techo) {
            col = vec3(0.004, 0.005, 0.008) + uHaze * 0.1;
            float eq = step(0.985, hash12(floor(vLp.xz / 3.0) + seed));
            col += vec3(0.7, 0.8, 1.0) * eq * 0.25;
          } else {
            float fh = style == 2.0 ? 3.1 : style == 1.0 ? 4.0 : style == 5.0 ? 5.5 : 3.7;
            float ww = style == 1.0 ? 1.5 : style == 2.0 ? 3.4 : style == 5.0 ? 3.0 : mix(2.0, 2.8, fract(seed * 1.7));
            vec2 cf = vec2(u / ww, v / fh);
            vec2 id = floor(cf);
            vec2 f = fract(cf);
            vec2 dc = fwidth(cf);
            float nitido = 1.0 - smoothstep(0.3, 0.8, max(dc.x, dc.y));
            float r = hash12(id + vec2(seed * 0.37, face * 13.1));
            float r2 = hash12(id * 1.31 + seed);
            float piso = hash12(vec2(id.y * 1.37, seed));
            // temperatura de la luz interior
            float tc = hash12(vec2(id.y * 0.7 + floor(id.x / 6.0), seed * 2.1));
            vec3 calida = vec3(1.0, 0.7, 0.42);
            vec3 neutra = vec3(1.0, 0.86, 0.68);
            vec3 fria = vec3(0.78, 0.88, 1.0);
            vec3 wc = tc < 0.42 ? neutra : tc < 0.72 ? calida : fria;
            ${tecnologica ? "wc = tc < 0.55 ? fria : tc < 0.8 ? neutra : calida;" : ""}
            vec3 detalle;
            vec3 medio;
            vec3 base;
            if (style == 1.0) {
              // muro cortina: antepecho oscuro, montantes, pisos encendidos con tiras de luz de techo
              float lit = step(piso, litR);
              float antepecho = step(f.y, 0.17);
              float montante = smoothstep(0.06, 0.0, abs(f.x - 0.5) - 0.44);
              float techoLuz = smoothstep(0.76, 0.84, f.y) * (1.0 - smoothstep(0.88, 0.93, f.y));
              float interior = (0.28 + 0.72 * r2 * r2) * (1.0 - antepecho);
              detalle = lit * wc * (interior * 0.55 + techoLuz * 0.9) * (1.0 - montante * 0.7);
              medio = litR * wc * 0.42;
              base = reflejo * (1.0 - lit * 0.5) + vec3(0.012, 0.014, 0.018) * montante + reflejo * antepecho * 0.3;
            } else if (style == 2.0) {
              // residencial: balcones (losas) y ventanas cálidas irregulares
              float losa = smoothstep(0.1, 0.0, f.y) ;
              float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.18, f.y) * step(f.y, 0.88);
              float lit = step(r, litR * 0.9);
              detalle = lit * win * mix(calida, neutra, step(0.6, tc)) * (0.25 + 0.6 * r2);
              detalle += losa * vec3(0.9, 0.8, 0.7) * 0.05;
              medio = litR * 0.9 * 0.55 * calida * 0.45;
              base = vec3(0.01, 0.009, 0.009) + reflejo * 0.4;
            } else if (style == 5.0) {
              // patrimonio: fachada de piedra bañada en luz dorada, vanos más oscuros
              float vano = step(0.25, f.x) * step(f.x, 0.75) * step(0.15, f.y) * step(f.y, 0.8);
              vec3 banado = uOro * (0.45 + 0.4 * smoothstep(H, 0.0, v)) * 0.9;
              detalle = mix(banado, neutra * 0.5 * step(r, 0.6), vano);
              medio = banado * 0.8;
              base = vec3(0.0);
            } else {
              // oficina / técnico / medios: ventanas punzonadas con marco
              float fx = 0.15;
              float fy = 0.24;
              float win = step(fx, f.x) * step(f.x, 1.0 - fx) * step(fy, f.y) * step(f.y, 0.92);
              float lit = step(r, litR) * step(0.15, piso);
              float wi = mix(0.15, 0.85, pow(r2, 1.6));
              detalle = lit * win * wc * wi;
              medio = litR * (1.0 - 2.0 * fx) * (0.92 - fy) * wc * 0.4;
              base = vec3(0.006, 0.006, 0.008) + reflejo * 0.45;
              if (style == 3.0) { detalle *= 0.3; medio *= 0.3; }
            }
            // a distancia, el promedio de la fachada es mucho más oscuro que una ventana encendida
            vec3 emis = mix(medio * 0.45, detalle, nitido) * 0.42;
            emis *= mix(0.3, 1.0, despierta);
            col = base + emis;
            if (style == 4.0) {
              float ola = 0.5 + 0.5 * sin(v * 0.045 - uTime * 1.1 + u * 0.03 + seed);
              float lineas = smoothstep(0.35, 0.0, abs(fract(u / 2.4) - 0.5));
              col = base + emis * 0.4 + uAzul * (0.08 + 0.6 * ola * ola) * lineas * despierta;
            }
            // corona con reflectores: se intensifica hacia la cima, borde superior marcado
            if (vInfo2.x > 0.5) {
              float h0 = H * (1.0 - vInfo2.w);
              float k = smoothstep(h0, H, v);
              float borde = smoothstep(1.6, 0.0, H - v);
              vec3 cc = crownColor(vInfo2.x);
              float aletas = 0.65 + 0.35 * smoothstep(0.3, 0.0, abs(fract(u / 3.0) - 0.5));
              col += cc * (pow(k, 2.2) * 0.5 * aletas + borde * 1.3) * despierta;
            }
            // aristas LED
            if (vInfo2.y > 0.5 && uForma < 0.5) {
              float e = faceW * 0.5 - abs(u);
              col += uAzul * exp(-e * e / 0.3) * 1.5 * despierta;
            }
            // luces bajas en la costanera
            if (vUp > 0.5) {
              vec3 uc = vUp < 1.5 ? uVioleta : vUp < 2.5 ? uAzul : uMagenta;
              col += uc * exp(-v / 16.0) * 0.55;
            }
            // luz de calle que sube por la base
            col += vec3(1.0, 0.75, 0.5) * 0.018 * exp(-v / 20.0);
          }
          // frente de la ola de conexión (ciudad B)
          col += uAzul * frente * 1.4;
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
    const aUp = new Float32Array(list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    list.forEach((b, i) => {
      q.setFromEuler(e.set(0, b.yaw, 0));
      m.compose(new THREE.Vector3(b.x, b.base, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
      mesh.setMatrixAt(i, m);
      aDim.set([b.w, b.h, b.d], i * 3);
      aInfo.set([b.seed, b.style, b.litR, b.base], i * 4);
      aInfo2.set([b.crown, b.led, b.total, b.crownFrac], i * 4);
      aUp[i] = b.uplight;
    });
    geo.setAttribute("aDim", new THREE.InstancedBufferAttribute(aDim, 3));
    geo.setAttribute("aInfo", new THREE.InstancedBufferAttribute(aInfo, 4));
    geo.setAttribute("aInfo2", new THREE.InstancedBufferAttribute(aInfo2, 4));
    geo.setAttribute("aUp", new THREE.InstancedBufferAttribute(aUp, 1));
    mesh.frustumCulled = false;
    mesh.layers.enable(1);
    group.add(mesh);
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 28, 1);
  cylGeo.translate(0, 0.5, 0);
  // techo inclinado: la arista superior de un lado baja hasta la base
  const wedgeGeo = new THREE.BoxGeometry(1, 1, 1);
  wedgeGeo.translate(0, 0.5, 0);
  {
    const p = wedgeGeo.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0.99 && p.getX(i) > 0) p.setY(i, 0.02);
    }
    wedgeGeo.computeVertexNormals();
  }
  buildInstanced(boxes, boxGeo, 0);
  buildInstanced(cyls, cylGeo, 1);
  buildInstanced(wedges, wedgeGeo, 2);

  // ---- suelo urbano (losa sobre el nivel del agua)
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
        vec3 col = vec3(0.006, 0.006, 0.008);
        gl_FragColor = vec4(atmos(col, vWorld), 1.0);
      }
    `,
  });
  materiales.push(sueloMat);
  const suelo = new THREE.Mesh(
    new THREE.BoxGeometry(sx1 - sx0, 1, cfg.profundidad + 3000),
    sueloMat,
  );
  suelo.position.set((sx0 + sx1) / 2, 0.9, costa - (cfg.profundidad + 3000) / 2);
  suelo.layers.enable(1);
  group.add(suelo);
  // muro de la costanera
  const muro = new THREE.Mesh(new THREE.BoxGeometry(sx1 - sx0, 2.6, 3), sueloMat);
  muro.position.set((sx0 + sx1) / 2, 1.1, costa + 1);
  muro.layers.enable(1);
  group.add(muro);

  // ---- costanera: faroles, luces bajas y tránsito
  for (let x = Math.max(sx0, -3400); x < Math.min(sx1, 3400); x += 22) {
    lights.push({
      p: [x, 7, costa - 3],
      c: [2.0, 1.75, 1.35],
      size: 0.9,
      minPx: 1.0,
      type: 0,
      phase: 0,
    });
    if (!tecnologica && Math.abs(x) < 900 && Math.round(x / 22) % 3 === 0) {
      lights.push({
        p: [x + 8, 1.5, costa + 0.5],
        c: [1.2, 0.5, 2.6],
        size: 1.2,
        minPx: 1.1,
        type: 0,
        phase: 0,
      });
    }
    if (tecnologica && Math.round(x / 22) % 2 === 0) {
      lights.push({
        p: [x + 8, 1.5, costa + 0.5],
        c: [0.1, 1.0, 2.2],
        size: 1.0,
        minPx: 1.0,
        type: 0,
        phase: 0,
      });
    }
  }
  const x0 = Math.max(sx0, -3400);
  const largo = Math.min(sx1, 3400) - x0;
  for (let i = 0; i < cfg.autos; i++) {
    const carril = i % 2;
    const speed = 13 + rnd() * 9;
    const s0 = rnd() * largo;
    const z = costa - 14 - carril * 6;
    const dir = carril ? -1 : 1;
    lights.push({
      p: [x0, 1.6, z],
      c: [2.4, 2.3, 2.1],
      size: 0.7,
      minPx: 0.9,
      type: 1,
      phase: s0,
      move: [dir, 0, speed, largo],
    });
    lights.push({
      p: [x0 - dir * 4, 1.6, z],
      c: [1.6, 0.08, 0.05],
      size: 0.6,
      minPx: 0.8,
      type: 1,
      phase: s0,
      move: [dir, 0, speed, largo],
    });
  }

  // ---- puente con luces bajas violetas (ciudad A)
  if (cfg.puente) {
    const pb = cfg.puente;
    const [ax, az] = toLocal(pb.desde[0], pb.desde[2]);
    const [bx, bz] = toLocal(pb.hasta[0], pb.hasta[2]);
    const A = new THREE.Vector3(ax, pb.desde[1], az);
    const B = new THREE.Vector3(bx, pb.hasta[1], bz);
    const dir = B.clone().sub(A);
    const L = dir.length();
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      vertexShader: sueloMat.vertexShader,
      fragmentShader: /* glsl */ `
        ${COMMON}
        uniform vec3 uMagenta;
        varying vec3 vWorld;
        void main() {
          // canto del tablero iluminado desde abajo por las luces violetas
          float abajo = smoothstep(${(pb.desde[1] - 1).toFixed(1)}, ${(pb.desde[1] - 2.5).toFixed(1)}, vWorld.y);
          vec3 col = vec3(0.012, 0.012, 0.016) + uHaze * 0.2 + vec3(0.45, 0.2, 1.0) * 0.12 * abajo;
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
          c: [2.0, 1.8, 1.5],
          size: 0.8,
          minPx: 1.0,
          type: 0,
          phase: 0,
        });
        if (k < 0 && Math.round(s / 15) % 2 === 0) {
          lights.push({
            p: [p.x, A.y - 2.5, p.z],
            c: [1.4, 0.5, 3.0],
            size: 1.6,
            minPx: 1.2,
            type: 0,
            phase: 0,
          });
        }
      }
    }
    for (let i = 0; i < 46; i++) {
      const carril = i % 2;
      const s0 = rnd() * (L + 100);
      const off = lado.clone().multiplyScalar(carril ? 4 : -4);
      const sgn = carril ? 1 : -1;
      const origen = A.clone().add(off);
      const color = carril ? [2.2, 2.2, 2.4] : [1.5, 0.08, 0.05];
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
    uniforms: { ...U, uAwake: { value: awake } },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec3 aPos, aCol;
      attribute vec4 aPar, aMov;
      uniform vec4 uAwake;
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
        // la ola de conexión recorre la costanera encendiendo las luces a su paso
        if (uAwake.w > 0.5) {
          float dW = distance(p.xz, uAwake.xy);
          vCol *= mix(0.45, 1.0, 1.0 - smoothstep(uAwake.z - 60.0, uAwake.z, dW));
          vCol += vec3(0.2, 0.9, 2.4) * exp(-pow((dW - uAwake.z) / 30.0, 2.0)) * step(1.0, uAwake.z) * 2.0;
        }
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
  group.add(luces);

  return {
    group,
    awake,
    edificios: boxes.length + cyls.length + wedges.length,
    luces: NL,
    // materiales de una sola cara: el pase de reflejo invierte su orientación
    unaCara: materiales,
  };
}
