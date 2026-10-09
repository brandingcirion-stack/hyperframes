// Banda sonora procedural (estéreo, 48 kHz, 12 s). Síntesis determinista con semilla:
// no usa muestras ni pistas de terceros. Lee los tiempos de src/config.js para quedar
// sincronizada con la imagen.
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

// ---------------------------------------------------------------- 1. océano nocturno
for (const [ch, pan, fase] of [
  [0, -0.6, 0],
  [1, 0.6, 1.7],
]) {
  const rnd = mulberry32(CONFIG.semilla + 11 + ch);
  const pink = pinkNoise(rnd);
  const lp = new Biquad().set("lp", 650, 0.6);
  const foam = new Biquad().set("bp", 3200, 0.6);
  for (let i = 0; i < N; i++) {
    const t = ts(i);
    const swell = 0.5 + 0.5 * Math.sin((Math.PI * (t + fase)) / 3.4) ** 2;
    const n = pink();
    const v = lp.run(n) * 0.36 * swell + foam.run(rnd() * 2 - 1) * 0.022 * swell ** 3;
    const env = smoothstep(0, 1.0, t) * lerp(1, 0.55, smoothstep(T.picada[0], T.cruceCamara, t));
    put(sup, null, i, v * env, pan);
  }
}

// ---------------------------------------------------------------- 2. textura tonal (formación y sostén)
{
  const notas = [73.42, 110, 146.83, 164.81, 220, 329.63]; // Re sus2 abierto
  const voces = [
    [-6, -0.45],
    [0, 0],
    [6, 0.45],
  ];
  const [a, b] = range(0, T.picada[1] + 0.6);
  for (const [k, f] of notas.entries()) {
    for (const [cents, pan] of voces) {
      const fd = f * 2 ** (cents / 1200);
      const ph0 = (k * 0.37 + cents * 0.01) % 1;
      for (let i = a; i < b; i++) {
        const t = ts(i);
        const crece =
          smoothstep(0.2, T.formacion[1] + 0.2, t) ** 1.5 * 0.75 + 0.25 * smoothstep(3, 5, t);
        const sale = 1 - smoothstep(6.0, T.picada[1] + 0.5, t) * 0.92;
        const brillo = 0.3 + 0.7 * smoothstep(0.5, 4.5, t);
        // leve respiración de los parciales altos
        const resp = 0.85 + 0.15 * Math.sin(TAU * 0.23 * t + k);
        let v = 0;
        for (let h = 1; h <= 5; h++) {
          v +=
            (Math.sin(TAU * fd * h * t + ph0 * h * TAU) / h ** 1.5) *
            (h === 1 ? 1 : (brillo * resp) ** (h - 1));
        }
        const amp = (k >= 4 ? 0.0065 : 0.012) * crece * sale;
        put(sup, rev, i, v * amp, pan, 0.45);
      }
    }
  }
}

// ---------------------------------------------------------------- 3. ascenso de energía (convergencia)
{
  const [a, b] = range(T.convergencia[0], T.picada[0] + 0.02);
  const bpL = new Biquad();
  const bpR = new Biquad();
  const rnd = mulberry32(CONFIG.semilla + 31);
  let ph = 0;
  let trem = 0;
  for (let i = a; i < b; i++) {
    const t = ts(i);
    const s = clamp((t - T.convergencia[0]) / (T.picada[0] - T.convergencia[0]));
    if ((i - a) % 32 === 0) {
      const fc = 250 * 12 ** (s ** 1.5);
      bpL.set("bp", fc, 4);
      bpR.set("bp", fc * 1.04, 4);
    }
    const corte = 1 - smoothstep(T.picada[0] - 0.03, T.picada[0] + 0.02, t);
    const env = s ** 2.2 * corte;
    const nL = bpL.run(rnd() * 2 - 1);
    const nR = bpR.run(rnd() * 2 - 1);
    const f = 110 * 3 ** (s ** 1.4);
    ph += (TAU * f) / SR;
    trem += (TAU * lerp(3, 14, s)) / SR;
    const tono = Math.sin(ph) * (0.75 + 0.25 * Math.sin(trem));
    const sub = Math.sin((TAU * 55 * t) % TAU);
    put(sup, rev, i, nL * env * 0.8 + tono * env * 0.07 + sub * env * 0.07, -0.25, 0.2);
    put(sup, rev, i, nR * env * 0.8 + tono * env * 0.07 + sub * env * 0.07, 0.25, 0.2);
  }
}

// ---------------------------------------------------------------- 4. picada (desplazamiento sincronizado)
{
  const [t0, t1] = T.picada;
  const [a, b] = range(t0, t1 + 0.05);
  const bp = [new Biquad(), new Biquad()];
  const rnd = mulberry32(CONFIG.semilla + 41);
  let ph = 0;
  for (let i = a; i < b; i++) {
    const t = ts(i);
    const s = clamp((t - t0) / (t1 - t0));
    if ((i - a) % 32 === 0) {
      const fc = 2600 * (350 / 2600) ** s;
      bp[0].set("bp", fc, 1.3);
      bp[1].set("bp", fc * 1.06, 1.3);
    }
    const env =
      (0.15 + 0.85 * s ** 1.5) *
      (1 - smoothstep(t1 - 0.01, t1 + 0.04, t)) *
      smoothstep(t0, t0 + 0.08, t);
    ph += (TAU * lerp(900, 240, s ** 0.8)) / SR;
    const pan = lerp(0, 0.3, s); // el haz cruza hacia la derecha del cuadro
    put(
      sup,
      rev,
      i,
      bp[0].run(rnd() * 2 - 1) * env * 0.9 + Math.sin(ph) * env * 0.035,
      pan - 0.15,
      0.15,
    );
    put(
      sup,
      rev,
      i,
      bp[1].run(rnd() * 2 - 1) * env * 0.9 + Math.sin(ph) * env * 0.035,
      pan + 0.15,
      0.15,
    );
  }
}

// ---------------------------------------------------------------- 5. ingreso al agua: golpe sordo y burbujas
{
  const te = T.picada[1];
  const [a, b] = range(te, te + 1.4);
  const rnd = mulberry32(CONFIG.semilla + 51);
  const lp = new Biquad().set("lp", 480, 0.7);
  let ph = 0;
  for (let i = a; i < b; i++) {
    const t = ts(i) - te;
    ph += (TAU * (40 + 40 * Math.exp(-t / 0.08))) / SR;
    const env = Math.exp(-t / 0.45) * (1 - Math.exp(-t / 0.006));
    const v = Math.sin(ph) * env * 0.42 + lp.run(rnd() * 2 - 1) * Math.exp(-t / 0.16) * 0.5;
    put(agua, revAgua, i, v, 0.15, 0.35);
  }
  const burbujas = 8;
  for (let k = 0; k < burbujas; k++) {
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

// ---------------------------------------------------------------- 6. lecho submarino
{
  const [a, b] = range(T.picada[1] + 0.05, DUR);
  const rnd = mulberry32(CONFIG.semilla + 61);
  const lp = [new Biquad().set("lp", 170, 0.7), new Biquad().set("lp", 160, 0.7)];
  const swish = [new Biquad(), new Biquad()];
  let brown = [0, 0];
  for (let i = a; i < b; i++) {
    const t = ts(i);
    const entra = smoothstep(T.picada[1], T.cruceCamara + 0.3, t);
    const prof = smoothstep(T.cruceCamara, T.llegadaFondo, t);
    // presión: ruido marrón muy grave
    for (const ch of [0, 1]) {
      brown[ch] = clamp(brown[ch] * 0.995 + (rnd() * 2 - 1) * 0.04, -1, 1);
      const v = lp[ch].run(brown[ch]) * 0.3 * entra;
      put(agua, null, i, v, ch ? 0.5 : -0.5);
    }
    // dron tonal oscuro, con batido lento entre canales
    const dark = lerp(1, 0.7, prof);
    const vL = Math.sin(TAU * 55 * dark * t) * 0.03 + Math.sin(TAU * 82.4 * dark * t) * 0.02;
    const vR = Math.sin(TAU * 55.15 * dark * t) * 0.03 + Math.sin(TAU * 82.55 * dark * t) * 0.02;
    const env = entra * (1 - 0.4 * smoothstep(T.llegadaFondo, DUR, t));
    put(agua, null, i, vL * env, -0.4);
    put(agua, null, i, vR * env, 0.4);
    // desplazamiento amortiguado mientras desciende la cámara
    if (t < T.llegadaFondo + 0.2) {
      if ((i - a) % 32 === 0) {
        const fc = 900 * (220 / 900) ** prof;
        swish[0].set("bp", fc, 0.9);
        swish[1].set("bp", fc * 1.05, 0.9);
      }
      const e =
        entra *
        (0.5 + 0.5 * Math.sin(Math.PI * prof)) *
        (1 - smoothstep(T.llegadaFondo - 0.3, T.llegadaFondo + 0.2, t));
      put(agua, revAgua, i, swish[0].run(rnd() * 2 - 1) * e * 0.2, -0.3, 0.2);
      put(agua, revAgua, i, swish[1].run(rnd() * 2 - 1) * e * 0.2, 0.3, 0.2);
    }
  }
}

// ---------------------------------------------------------------- 7. pulso grave al llegar al fondo
{
  const t0 = T.llegadaFondo;
  const [a, b] = range(t0, DUR);
  const rnd = mulberry32(CONFIG.semilla + 71);
  const lp = new Biquad().set("lp", 260, 0.7);
  let ph = 0;
  let ph2 = 0;
  for (let i = a; i < b; i++) {
    const t = ts(i) - t0;
    ph += (TAU * (42 + 22 * Math.exp(-t / 0.06))) / SR;
    ph2 += (TAU * 84) / SR;
    const att = 1 - Math.exp(-t / 0.012);
    const v =
      Math.sin(ph) * att * Math.exp(-t / 0.9) * 0.3 +
      Math.sin(ph2) * att * Math.exp(-t / 0.45) * 0.09 +
      Math.sin(ph2 * 1.5) * att * Math.exp(-t / 0.3) * 0.03 +
      lp.run(rnd() * 2 - 1) * (1 - Math.exp(-t / 0.05)) * Math.exp(-t / 0.55) * 0.35;
    put(agua, revAgua, i, v, 0, 0.6);
    // resolución tonal muy baja y amortiguada (Re + La), cola suave
    const pad =
      (Math.sin(TAU * 73.42 * ts(i)) + 0.6 * Math.sin(TAU * 110 * ts(i))) *
      smoothstep(0.05, 0.6, t) *
      0.02;
    put(agua, revAgua, i, pad, 0, 0.5);
  }
}

// ---------------------------------------------------------------- amortiguación al cruzar la superficie
for (const ch of [0, 1]) {
  const lp = new Biquad();
  for (let i = 0; i < N; i++) {
    if (i % 32 === 0) {
      const t = ts(i);
      const s = smoothstep(T.picada[1] - 0.02, T.cruceCamara + 0.08, t);
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
      const s = smoothstep(T.picada[1] - 0.02, T.cruceCamara + 0.08, ts(i));
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
