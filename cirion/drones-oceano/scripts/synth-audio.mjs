// Banda sonora procedural (estéreo, 48 kHz): ciudad y bahía nocturnas, show de drones,
// cable que sube al logo, picada, empalme en el lecho, recorrido y conexión con la ciudad B.
// Síntesis determinista con semilla: no usa muestras ni pistas de terceros.
// Lee los tiempos de src/config.js para quedar sincronizada con la imagen.
// Uso: node scripts/synth-audio.mjs   → assets/audio/banda-sonora.raw.wav
//      bash scripts/normalize-audio.sh → assets/audio/banda-sonora.m4a (−16 LUFS, AAC)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../src/config.js";
import { mulberry32, smoothstep, clamp, lerp } from "../src/util.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = CONFIG.tiempos;
const SR = 48000;
const DUR = CONFIG.duracion;
const N = Math.round(SR * DUR);
const TAU = Math.PI * 2;

// Buses: «superficie» (se amortigua al cruzar el agua), «agua» y envío a reverb.
const bus = () => [new Float32Array(N), new Float32Array(N)];
const sup = bus();
const agua = bus();
const rev = bus();
const revAgua = bus(); // reverb más oscura bajo el agua

const panGain = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];
function put(b, send, i, v, pan = 0, sendAmt = 0) {
  if (i < 0 || i >= N) return;
  const [gl, gr] = panGain(pan);
  b[0][i] += v * gl;
  b[1][i] += v * gr;
  if (send && sendAmt) {
    send[0][i] += v * gl * sendAmt;
    send[1][i] += v * gr * sendAmt;
  }
}

class Biquad {
  constructor() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  set(type, f, q = 0.707) {
    const w = (TAU * Math.min(f, SR * 0.45)) / SR;
    const c = Math.cos(w);
    const a = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === "lp") [b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2];
    else if (type === "hp") [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
    else [b0, b1, b2] = [a, 0, -a]; // bp
    const a0 = 1 + a;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * c) / a0;
    this.a2 = (1 - a) / a0;
    return this;
  }
  run(x) {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

function pinkNoise(rnd) {
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  return () => {
    const w = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    return out * 0.11;
  };
}
const ts = (i) => i / SR;
const range = (a, b) => [Math.max(0, Math.floor(a * SR)), Math.min(N, Math.ceil(b * SR))];

// ---------------------------------------------------------------- utilidades de eventos
// Barrido de ruido filtrado: frecuencia central f(t), envolvente env(t) y paneo pan(t).
function barrido(b, send, sendAmt, t0, t1, f, q, env, pan, semilla) {
  const [ia, ib] = range(t0, t1);
  const rnd = mulberry32(CONFIG.semilla + semilla);
  const bp = [new Biquad(), new Biquad()];
  for (let i = ia; i < ib; i++) {
    const t = ts(i);
    if ((i - ia) % 32 === 0) {
      const fc = f(t);
      bp[0].set("bp", fc, q);
      bp[1].set("bp", fc * 1.05, q);
    }
    const e = env(t);
    const pn = pan(t);
    put(b, send, i, bp[0].run(rnd() * 2 - 1) * e, pn - 0.2, sendAmt);
    put(b, send, i, bp[1].run(rnd() * 2 - 1) * e, pn + 0.2, sendAmt);
  }
}
// Campana suave (parciales inarmónicos con caída exponencial).
function campana(b, send, sendAmt, t0, f, amp, pan, caida = 1.2) {
  const [ia, ib] = range(t0, t0 + caida * 4);
  const parciales = [
    [1, 1],
    [2.01, 0.45],
    [3.0, 0.25],
    [4.17, 0.12],
  ];
  for (let i = ia; i < ib; i++) {
    const t = ts(i) - t0;
    const att = 1 - Math.exp(-t / 0.004);
    let v = 0;
    for (const [m, g] of parciales) v += Math.sin(TAU * f * m * t) * g * Math.exp(-t / (caida / m));
    put(b, send, i, v * amp * att, pan, sendAmt);
  }
}
// Golpe grave contenido (seno con caída de tono) + cuerpo de ruido filtrado.
function golpe(b, send, sendAmt, t0, amp, fBase, semilla, caida = 0.8) {
  const [ia, ib] = range(t0, t0 + caida * 5);
  const rnd = mulberry32(CONFIG.semilla + semilla);
  const lp = new Biquad().set("lp", 260, 0.7);
  let ph = 0;
  for (let i = ia; i < ib; i++) {
    const t = ts(i) - t0;
    ph += (TAU * (fBase + 22 * Math.exp(-t / 0.06))) / SR;
    const att = 1 - Math.exp(-t / 0.012);
    const v =
      Math.sin(ph) * att * Math.exp(-t / caida) * 0.32 +
      Math.sin(ph * 2) * att * Math.exp(-t / (caida * 0.5)) * 0.09 +
      lp.run(rnd() * 2 - 1) * (1 - Math.exp(-t / 0.05)) * Math.exp(-t / (caida * 0.6)) * 0.35;
    put(b, send, i, v * amp, 0, sendAmt);
  }
}
// Pad de parciales con desafinación estéreo.
function pad(b, send, sendAmt, t0, t1, notas, ampFn, brilloFn) {
  const [ia, ib] = range(t0, t1);
  const voces = [
    [-6, -0.45],
    [0, 0],
    [6, 0.45],
  ];
  for (const [k, f] of notas.entries()) {
    for (const [cents, pan] of voces) {
      const fd = f * 2 ** (cents / 1200);
      const ph0 = (k * 0.37 + cents * 0.01) % 1;
      for (let i = ia; i < ib; i++) {
        const t = ts(i);
        const br = brilloFn(t);
        const resp = 0.85 + 0.15 * Math.sin(TAU * 0.23 * t + k);
        let v = 0;
        for (let h = 1; h <= 5; h++) {
          v +=
            (Math.sin(TAU * fd * h * t + ph0 * h * TAU) / h ** 1.5) *
            (h === 1 ? 1 : (br * resp) ** (h - 1));
        }
        put(b, send, i, v * ampFn(t) * (f > 300 ? 0.55 : 1), pan, sendAmt);
      }
    }
  }
}
// Ambiente urbano: rumor de tránsito (banda media) y zumbido grave, decorrelacionado L/R.
function ambiente(b, t0, t1, fBanda, amp, envFn, semilla) {
  const [ia, ib] = range(t0, t1);
  for (const [ch, pan] of [
    [0, -0.4],
    [1, 0.4],
  ]) {
    const rnd = mulberry32(CONFIG.semilla + semilla + ch);
    const pink = pinkNoise(rnd);
    const bp = new Biquad().set("bp", fBanda, 0.5);
    const lp = new Biquad().set("lp", 160, 0.7);
    const agua = new Biquad().set("lp", 600, 0.6);
    for (let i = ia; i < ib; i++) {
      const t = ts(i);
      const ola = 0.5 + 0.5 * Math.sin((Math.PI * (t + ch * 1.7)) / 3.4) ** 2;
      const n = pink();
      const v = bp.run(n) * 0.11 + lp.run(n) * 0.16 + agua.run(pink()) * 0.22 * ola;
      put(b, null, i, v * amp * envFn(t), pan);
    }
  }
}

// ---------------------------------------------------------------- 1. ciudad A y bahía
ambiente(
  sup,
  0,
  T.cruceCamara + 0.6,
  420,
  1,
  (t) => smoothstep(0, 1, t) * (1 - smoothstep(T.picada[0], T.cruceCamara, t) * 0.8),
  21,
);

// ---------------------------------------------------------------- 2. textura tonal: formación, paneo, subida del cable
{
  const re = [73.42, 110, 146.83, 164.81, 220, 329.63]; // Re sus2 abierto
  pad(
    sup,
    rev,
    0.45,
    0.2,
    T.picada[1] + 0.6,
    re,
    (t) =>
      0.012 *
      (smoothstep(0.2, T.formacion[1], t) ** 1.4 * 0.7 +
        0.3 * smoothstep(T.paneo[0], T.paneo[1], t)) *
      (1 - smoothstep(T.compresion[0], T.picada[1] + 0.5, t) * 0.92),
    (t) => 0.3 + 0.7 * smoothstep(0.5, T.cableSube[1], t),
  );
}

// ---------------------------------------------------------------- 3. el cable sale de la torre y sube al logo
barrido(
  sup,
  rev,
  0.25,
  T.cableSube[0] - 0.1,
  T.cableSube[1] + 0.05,
  (t) => 300 * 7 ** smoothstep(T.cableSube[0], T.cableSube[1], t),
  2.2,
  (t) =>
    0.32 *
    smoothstep(T.cableSube[0] - 0.1, T.cableSube[0] + 0.4, t) *
    (0.4 + 0.6 * smoothstep(T.cableSube[0], T.cableSube[1], t)) *
    (1 - smoothstep(T.cableSube[1] - 0.05, T.cableSube[1] + 0.05, t)),
  () => 0.1,
  31,
);
{
  // zumbido eléctrico que sube de tono con el cable
  const [ia, ib] = range(T.cableSube[0], T.cableSube[1] + 0.3);
  let ph = 0;
  for (let i = ia; i < ib; i++) {
    const t = ts(i);
    const s = smoothstep(T.cableSube[0], T.cableSube[1], t);
    ph += (TAU * (110 + 110 * s)) / SR;
    const e =
      smoothstep(T.cableSube[0], T.cableSube[0] + 0.3, t) *
      (1 - smoothstep(T.cableSube[1], T.cableSube[1] + 0.3, t));
    const v = (Math.sin(ph) * 0.5 + Math.sin(ph * 3) * 0.2 + Math.sin(ph * 5) * 0.08) * e * 0.03;
    put(sup, rev, i, v, 0.1, 0.2);
  }
}

// ---------------------------------------------------------------- 4. contacto con el logo y transformación
golpe(sup, rev, 0.4, T.contacto, 0.7, 48, 41, 0.7);
campana(sup, rev, 0.6, T.contacto + 0.01, 587.33, 0.03, -0.2, 1.4);
campana(sup, rev, 0.6, T.contacto + 0.06, 880, 0.02, 0.25, 1.1);
barrido(
  sup,
  rev,
  0.2,
  T.contacto + 0.1,
  T.picada[0] + 0.02,
  (t) => 250 * 12 ** (smoothstep(T.contacto, T.picada[0], t) ** 1.5),
  4,
  (t) =>
    0.75 *
    smoothstep(T.contacto, T.picada[0], t) ** 2.2 *
    (1 - smoothstep(T.picada[0] - 0.03, T.picada[0] + 0.02, t)),
  () => 0,
  43,
);

// ---------------------------------------------------------------- 5. picada: desplazamiento descendente hacia la derecha
barrido(
  sup,
  rev,
  0.15,
  T.picada[0],
  T.picada[1] + 0.05,
  (t) => 2600 * (350 / 2600) ** ((t - T.picada[0]) / (T.picada[1] - T.picada[0])),
  1.3,
  (t) =>
    0.9 *
    (0.15 + 0.85 * clamp((t - T.picada[0]) / (T.picada[1] - T.picada[0])) ** 1.5) *
    (1 - smoothstep(T.picada[1] - 0.01, T.picada[1] + 0.04, t)) *
    smoothstep(T.picada[0], T.picada[0] + 0.08, t),
  (t) => lerp(0, 0.45, clamp((t - T.picada[0]) / (T.picada[1] - T.picada[0]))),
  51,
);

// ---------------------------------------------------------------- 6. ingreso al agua: golpe sordo y burbujas
{
  const te = T.picada[1];
  golpe(agua, revAgua, 0.35, te, 1.0, 40, 61, 0.45);
  const rnd = mulberry32(CONFIG.semilla + 62);
  for (let k = 0; k < 8; k++) {
    const t0 = te + 0.06 + k * 0.075 + rnd() * 0.05;
    const f0 = 380 + rnd() * 380;
    const pan = (rnd() - 0.5) * 0.8;
    const amp = 0.035 + rnd() * 0.03;
    const lpB = new Biquad().set("lp", 1800, 0.7);
    let phb = 0;
    const [ba, bb] = range(t0, t0 + 0.12);
    for (let i = ba; i < bb; i++) {
      const t = ts(i) - t0;
      phb += (TAU * f0 * (1 + 0.8 * Math.min(1, t / 0.04))) / SR;
      put(agua, revAgua, i, lpB.run(Math.sin(phb)) * amp * Math.exp(-t / 0.03), pan, 0.4);
    }
  }
}

// ---------------------------------------------------------------- 7. bajo el agua: presión, dron grave, zumbido del cable
{
  const t0 = T.picada[1] + 0.05;
  const t1 = T.emersion + 0.3;
  const [ia, ib] = range(t0, t1);
  const rnd = mulberry32(CONFIG.semilla + 71);
  const lp = [new Biquad().set("lp", 170, 0.7), new Biquad().set("lp", 160, 0.7)];
  const brown = [0, 0];
  for (let i = ia; i < ib; i++) {
    const t = ts(i);
    const env =
      smoothstep(T.picada[1], T.cruceCamara + 0.3, t) *
      (1 - smoothstep(T.emersion - 0.1, T.emersion + 0.3, t));
    for (const ch of [0, 1]) {
      brown[ch] = clamp(brown[ch] * 0.995 + (rnd() * 2 - 1) * 0.04, -1, 1);
      put(agua, null, i, lp[ch].run(brown[ch]) * 0.3 * env, ch ? 0.5 : -0.5);
    }
    const vL = Math.sin(TAU * 55 * t) * 0.03 + Math.sin(TAU * 82.4 * t) * 0.02;
    const vR = Math.sin(TAU * 55.15 * t) * 0.03 + Math.sin(TAU * 82.55 * t) * 0.02;
    put(agua, null, i, vL * env, -0.4);
    put(agua, null, i, vR * env, 0.4);
    // zumbido eléctrico del cable mientras desciende
    const ez =
      smoothstep(T.picada[1], T.cruceCamara + 0.4, t) *
      (1 - smoothstep(T.llegadaUnion, T.llegadaUnion + 0.6, t));
    let h = 0;
    for (const [m, g] of [
      [1, 0.5],
      [3, 0.35],
      [5, 0.2],
    ]) {
      h += Math.sin(TAU * 60 * m * t) * g;
    }
    put(agua, null, i, h * 0.014 * ez, 0);
  }
}

// ---------------------------------------------------------------- 8. empalme: cierre metálico contenido y pulso
{
  const tu = T.llegadaUnion;
  const [ia, ib] = range(tu, tu + 1.2);
  const rnd = mulberry32(CONFIG.semilla + 81);
  const bp1 = new Biquad().set("bp", 520, 9);
  const bp2 = new Biquad().set("bp", 1310, 12);
  for (let i = ia; i < ib; i++) {
    const t = ts(i) - tu;
    const x = (rnd() * 2 - 1) * Math.exp(-t / 0.012);
    const v = bp1.run(x) * 2.4 * Math.exp(-t / 0.35) + bp2.run(x) * 1.2 * Math.exp(-t / 0.2);
    put(agua, revAgua, i, v * 0.18, 0.15, 0.5);
  }
  golpe(agua, revAgua, 0.6, tu + 0.04, 1.1, 42, 82, 0.9);
  campana(agua, revAgua, 0.6, tu + 0.08, 293.66, 0.035, 0, 1.6);
}

// ---------------------------------------------------------------- 9. recorrido: flujo de datos y agua que corre
{
  const [v0, v1] = T.viaje;
  // agua que corre: la velocidad abre el filtro
  barrido(
    agua,
    revAgua,
    0.15,
    v0,
    T.emersion + 0.2,
    (t) => 220 + 900 * smoothstep(v0, v0 + 2.2, t),
    0.9,
    (t) =>
      (0.12 + 0.1 * smoothstep(v0 + 2, T.emersion, t)) *
      smoothstep(v0, v0 + 1.6, t) *
      (1 - smoothstep(T.emersion - 0.2, T.emersion + 0.2, t)),
    (t) => 0.25 * Math.sin(t * 0.9),
    91,
  );
  // pulsos de datos: tonos breves y amortiguados, cada vez más seguidos
  const rnd = mulberry32(CONFIG.semilla + 92);
  let t = v0 + 0.4;
  let k = 0;
  const lp = new Biquad().set("lp", 1400, 0.7);
  while (t < Math.min(v1, T.emersion + 0.2)) {
    const f = [587.33, 659.25, 880, 739.99][k % 4] * (rnd() < 0.2 ? 0.5 : 1);
    const [ia, ib] = range(t, t + 0.18);
    const amp =
      0.035 * smoothstep(v0, v0 + 1.2, t) * (0.7 + 0.3 * smoothstep(v0 + 2, T.emersion, t));
    const pan = Math.sin(k * 1.3) * 0.35;
    for (let i = ia; i < ib; i++) {
      const tt = ts(i) - t;
      put(agua, revAgua, i, lp.run(Math.sin(TAU * f * tt) * Math.exp(-tt / 0.05)) * amp, pan, 0.35);
    }
    const ritmo = lerp(0.26, 0.13, smoothstep(v0, T.emersion, t));
    t += ritmo;
    k++;
  }
  // dron que crece hacia la emersión
  pad(
    agua,
    revAgua,
    0.3,
    v0,
    T.emersion + 0.3,
    [73.42, 110, 146.83],
    (tt) =>
      0.012 * smoothstep(v0, T.emersion, tt) * (1 - smoothstep(T.emersion, T.emersion + 0.3, tt)),
    () => 0.4,
  );
}

// ---------------------------------------------------------------- 10. emersión y ciudad B
barrido(
  sup,
  rev,
  0.2,
  T.emersion - 0.25,
  T.emersion + 0.6,
  (t) => 400 * 6 ** smoothstep(T.emersion - 0.25, T.emersion + 0.3, t),
  1.1,
  (t) => 0.4 * Math.sin(Math.PI * clamp((t - (T.emersion - 0.25)) / 0.85)),
  () => 0,
  101,
);
ambiente(
  sup,
  T.emersion - 0.3,
  DUR,
  560,
  1.4,
  (t) => smoothstep(T.emersion - 0.3, T.emersion + 0.6, t),
  103,
);

// ---------------------------------------------------------------- 11. conexión: la ciudad se enciende
{
  const tc = T.conexion;
  golpe(sup, rev, 0.6, tc, 0.9, 46, 111, 1.0);
  // acorde de resolución (Re mayor add9) que se abre con la ola de luz
  pad(
    sup,
    rev,
    0.55,
    tc - 0.9,
    DUR,
    [73.42, 110, 146.83, 185.0, 220, 329.63, 440],
    (t) =>
      0.018 *
      (0.3 * smoothstep(tc - 0.9, tc, t) + 0.7 * smoothstep(tc, tc + 0.8, t)) *
      (1 - smoothstep(DUR - 1.4, DUR, t) * 0.6),
    (t) => 0.4 + 0.6 * smoothstep(tc, T.ondaCiudad[1], t),
  );
  // la ola de luz recorre la ciudad: barrido estéreo de izquierda a derecha
  barrido(
    sup,
    rev,
    0.3,
    T.ondaCiudad[0],
    T.ondaCiudad[1] + 0.3,
    (t) => 1800 + 2400 * smoothstep(T.ondaCiudad[0], T.ondaCiudad[1], t),
    2.5,
    (t) =>
      0.22 *
      Math.sin(Math.PI * clamp((t - T.ondaCiudad[0]) / (T.ondaCiudad[1] + 0.3 - T.ondaCiudad[0]))),
    (t) => lerp(-0.6, 0.6, clamp((t - T.ondaCiudad[0]) / (T.ondaCiudad[1] - T.ondaCiudad[0]))),
    112,
  );
  campana(sup, rev, 0.6, tc + 0.05, 1174.66, 0.012, 0.3, 1.8);
  campana(sup, rev, 0.6, tc + 0.35, 1479.98, 0.008, -0.3, 1.8);
}

// ---------------------------------------------------------------- amortiguación al cruzar la superficie
for (const ch of [0, 1]) {
  const lp = new Biquad();
  for (let i = 0; i < N; i++) {
    if (i % 32 === 0) {
      const t = ts(i);
      // se cierra al entrar al agua y se vuelve a abrir al emerger frente a la ciudad B
      const s =
        smoothstep(T.picada[1] - 0.02, T.cruceCamara + 0.08, t) *
        (1 - smoothstep(T.emersion - 0.1, T.emersion + 0.15, t));
      lp.set("lp", 16000 * (380 / 16000) ** s, 0.7);
    }
    sup[ch][i] = lp.run(sup[ch][i]);
  }
}

// ---------------------------------------------------------------- reverb (Freeverb simplificado)
function freeverb(input, { room = 0.84, damp = 0.4, spread = 0 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) =>
    Math.round(((d + spread) * SR) / 44100),
  );
  const alls = [556, 441, 341, 225].map((d) => Math.round(((d + spread) * SR) / 44100));
  const out = new Float32Array(N);
  const cb = combs.map((d) => ({ buf: new Float32Array(d), i: 0, store: 0 }));
  const ab = alls.map((d) => ({ buf: new Float32Array(d), i: 0 }));
  for (let n = 0; n < N; n++) {
    const x = input[n] * 0.015;
    let y = 0;
    for (const c of cb) {
      const o = c.buf[c.i];
      c.store = o * (1 - damp) + c.store * damp;
      c.buf[c.i] = x + c.store * room;
      c.i = (c.i + 1) % c.buf.length;
      y += o;
    }
    for (const a of ab) {
      const o = a.buf[a.i];
      a.buf[a.i] = y + o * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      y = o - y;
    }
    out[n] = y;
  }
  return out;
}
const revOut = [freeverb(rev[0]), freeverb(rev[1], { spread: 23 })];
const revAguaOut = [
  freeverb(revAgua[0], { room: 0.88, damp: 0.7 }),
  freeverb(revAgua[1], { room: 0.88, damp: 0.7, spread: 23 }),
];
// la reverb de superficie también se amortigua al entrar al agua
for (const ch of [0, 1]) {
  const lp = new Biquad();
  for (let i = 0; i < N; i++) {
    if (i % 32 === 0) {
      const t = ts(i);
      const s =
        smoothstep(T.picada[1] - 0.02, T.cruceCamara + 0.08, t) *
        (1 - smoothstep(T.emersion - 0.1, T.emersion + 0.15, t));
      lp.set("lp", 16000 * (500 / 16000) ** s, 0.7);
    }
    revOut[ch][i] = lp.run(revOut[ch][i]);
  }
}

// ---------------------------------------------------------------- mezcla y escritura
const mix = [new Float32Array(N), new Float32Array(N)];
let peak = 0;
for (const ch of [0, 1]) {
  for (let i = 0; i < N; i++) {
    const t = ts(i);
    const fade = smoothstep(0, 0.5, t) * (1 - smoothstep(DUR - 0.35, DUR, t));
    const v = (sup[ch][i] + agua[ch][i] + revOut[ch][i] * 1.1 + revAguaOut[ch][i] * 1.1) * fade;
    mix[ch][i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
}
const gain = 0.5 / peak; // margen antes de normalizar por sonoridad
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(clamp(mix[0][i] * gain, -1, 1) * 32767), i * 4);
  data.writeInt16LE(Math.round(clamp(mix[1][i] * gain, -1, 1) * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
const out = join(root, "assets/audio/banda-sonora.raw.wav");
writeFileSync(out, Buffer.concat([header, data]));
console.log(`banda-sonora.raw.wav: ${DUR}s estéreo ${SR} Hz`);
