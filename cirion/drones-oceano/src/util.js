// Utilidades deterministas: PRNG con semilla, ruido, easing y curvas en el tiempo.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// Quíntica: velocidad y aceleración nulas en ambos extremos (desaceleración precisa).
export const smootherstep = (t) => {
  t = clamp(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const easeInCubic = (t) => clamp(t) ** 3;
export const easeOutCubic = (t) => 1 - (1 - clamp(t)) ** 3;
export const easeInOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));

// Ruido de valor 2D con semilla (para el relieve del lecho marino).
export function makeNoise2D(seed) {
  const rnd = mulberry32(seed);
  const perm = new Uint16Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rnd() * 2 - 1;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const v = (x, y) => vals[perm[(x & 255) + perm[y & 255]]];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const w = fy * fy * (3 - 2 * fy);
    const a = lerp(v(xi, yi), v(xi + 1, yi), u);
    const b = lerp(v(xi, yi + 1), v(xi + 1, yi + 1), u);
    return lerp(a, b, w);
  };
}

/**
 * Curva cúbica de Hermite sobre claves {t, pos}, con tangentes Catmull-Rom en el
 * tiempo (C1 continua). Las claves marcadas `quieta` tienen velocidad nula.
 */
export function makeTimeSpline(keys) {
  const n = keys.length;
  const tangents = keys.map((k, i) => {
    if (k.quieta || i === 0) return [0, 0, 0];
    const prev = keys[i - 1];
    const next = keys[Math.min(n - 1, i + 1)];
    if (i === n - 1) return [0, 0, 0];
    const dt = next.t - prev.t;
    return [0, 1, 2].map((c) => (next.pos[c] - prev.pos[c]) / dt);
  });
  return (t, out) => {
    if (t <= keys[0].t) return out.set(...keys[0].pos);
    if (t >= keys[n - 1].t) return out.set(...keys[n - 1].pos);
    let i = 0;
    while (i < n - 2 && t > keys[i + 1].t) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const h = b.t - a.t;
    const s = (t - a.t) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    const ta = tangents[i];
    const tb = tangents[i + 1];
    const c = [0, 1, 2].map(
      (k) => h00 * a.pos[k] + h10 * h * ta[k] + h01 * b.pos[k] + h11 * h * tb[k],
    );
    return out.set(c[0], c[1], c[2]);
  };
}
