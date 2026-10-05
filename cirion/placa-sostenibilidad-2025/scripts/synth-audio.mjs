// Banda sonora original: sting de la intro (0–3 s) + placa (3–18 s, 120 BPM, Re menor).
// Síntesis determinista: no usa muestras ni pistas de terceros.
// Uso: node scripts/synth-audio.mjs  → assets/audio/placa-bed.raw.wav
// Luego normalizar con ffmpeg (ver README.md).
import { writeFileSync } from "node:fs";

const SR = 48000;
const INTRO = 3; // duración de la intro en video
const DUR = INTRO + 15;
const N = SR * DUR;
const L = new Float32Array(N);
const R = new Float32Array(N);
const sendL = new Float32Array(N); // envío a reverb
const sendR = new Float32Array(N);

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const TAU = Math.PI * 2;

// Seed fijo para el ruido: misma salida en cada ejecución.
let seed = 0x2025;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 - 0.5;
};

// `base` desplaza los eventos: 0 para la intro, INTRO*SR para la placa
let base = 0;
function add(i, l, r, send = 0) {
  i += base;
  if (i < 0 || i >= N) return;
  L[i] += l;
  R[i] += r;
  sendL[i] += l * send;
  sendR[i] += r * send;
}

base = INTRO * SR;

// ---- Pad: acordes con armónicos y detune L/R para amplitud estéreo ----
const chords = [
  { t: 0, d: 4.6, notes: [50, 53, 57, 64], root: 38 }, // Dm(add9)
  { t: 4, d: 4.6, notes: [46, 50, 53, 57, 60], root: 34 }, // Bbmaj9
  { t: 8, d: 2.6, notes: [43, 50, 53, 57, 58], root: 31 }, // Gm9
  { t: 10, d: 5, notes: [41, 48, 55, 57, 64], root: 29 }, // F(add9) resolución
];

function env(t, a, d, rel) {
  if (t < 0 || t > d) return 0;
  const att = Math.min(1, t / a);
  const tail = t > d - rel ? Math.max(0, (d - t) / rel) : 1;
  return Math.sin((att * Math.PI) / 2) * tail;
}

for (const c of chords) {
  const s0 = Math.floor(c.t * SR);
  const len = Math.floor(c.d * SR);
  for (const n of c.notes) {
    const f = hz(n);
    for (const [cents, pan] of [
      [-7, 0.85],
      [0, 0.5],
      [7, 0.15],
    ]) {
      const fd = f * 2 ** (cents / 1200);
      const gl = Math.cos((pan * Math.PI) / 2);
      const gr = Math.sin((pan * Math.PI) / 2);
      const ph = (n * 0.37 + cents) % 1;
      for (let k = 0; k < len; k++) {
        const t = k / SR;
        const gt = c.t + t;
        // brillo que se abre con la pieza
        const bright = 0.35 + 0.65 * Math.min(1, gt / 10);
        let v = 0;
        for (let h = 1; h <= 6; h++) {
          v += (Math.sin(TAU * fd * h * t + ph * h) / h ** 1.4) * (h === 1 ? 1 : bright ** (h - 1));
        }
        const e = env(t, 1.4, c.d, 1.2);
        const amp = 0.022 * e;
        add(s0 + k, v * amp * gl, v * amp * gr, 0.45);
      }
    }
  }
  // Sub grave: raíz + octava, centrado (mono-compatible)
  const fr = hz(c.root);
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const e = env(t, 1.0, c.d, 1.0);
    const v = (Math.sin(TAU * fr * t) * 0.9 + Math.sin(TAU * fr * 2 * t) * 0.35) * 0.11 * e;
    add(s0 + k, v, v, 0.05);
  }
}

// ---- Pulso tech (latido) 4.5 s → 13 s, en cada negra ----
const kicks = [];
for (let t = 4.5; t < 13.01; t += 0.5) kicks.push(t);
const duck = new Float32Array(N).fill(1);
for (const t0 of kicks) {
  const s0 = Math.floor(t0 * SR);
  const accent = [5, 6.5, 8, 10].some((x) => Math.abs(x - t0) < 0.01) ? 1.25 : 1;
  const fade = t0 > 11.5 ? Math.max(0.2, (13 - t0) / 1.5) : 1;
  let ph = 0;
  for (let k = 0; k < SR * 0.35; k++) {
    const t = k / SR;
    const f = 45 + 85 * Math.exp(-t * 30);
    ph += (TAU * f) / SR;
    const v = Math.sin(ph) * Math.exp(-t * 11) * 0.32 * accent * fade;
    add(s0 + k, v, v, 0.02);
    // sidechain suave sobre el pad
    const d = 1 - 0.28 * Math.exp(-t * 9) * fade;
    if (base + s0 + k < N) duck[base + s0 + k] = Math.min(duck[base + s0 + k], d);
  }
}
for (let i = 0; i < N; i++) {
  L[i] *= duck[i];
  R[i] *= duck[i];
}

// ---- Arpegio de corcheas con eco ping-pong (5 s → 13 s) ----
const arpNotes = [
  { t: 4, seq: [70, 74, 77, 81] },
  { t: 8, seq: [67, 70, 74, 77] },
  { t: 10, seq: [65, 69, 72, 76] },
];
for (let t0 = 5; t0 < 13; t0 += 0.25) {
  const set = [...arpNotes].reverse().find((a) => t0 >= a.t);
  const step = Math.round((t0 - 5) / 0.25);
  const note = set.seq[step % 4] + (step % 8 >= 4 ? 0 : -12);
  const f = hz(note);
  const s0 = Math.floor(t0 * SR);
  const ramp = Math.min(1, (t0 - 5) / 2) * (t0 > 11.5 ? (13 - t0) / 1.5 : 1);
  const pan = step % 2 ? 0.35 : 0.65;
  for (let k = 0; k < SR * 0.4; k++) {
    const t = k / SR;
    const v =
      (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t)) * Math.exp(-t * 14) * 0.05 * ramp;
    add(s0 + k, v * Math.cos((pan * Math.PI) / 2), v * Math.sin((pan * Math.PI) / 2), 0.6);
  }
}

// ---- SFX: barrido de apertura (izq → der, como el revelado de la imagen) ----
function noiseSweep(t0, d, gain, panFrom, panTo, cutFrom, cutTo) {
  const s0 = Math.floor(t0 * SR);
  let lp = 0;
  let lp2 = 0;
  for (let k = 0; k < d * SR; k++) {
    const p = k / (d * SR);
    const cut = cutFrom + (cutTo - cutFrom) * p;
    const a = 1 - Math.exp((-TAU * cut) / SR);
    lp += a * (rnd() - lp);
    lp2 += a * (lp - lp2);
    const e = Math.sin(Math.PI * p) ** 1.5 * gain;
    const pan = panFrom + (panTo - panFrom) * p;
    add(
      s0 + k,
      lp2 * e * Math.cos((pan * Math.PI) / 2),
      lp2 * e * Math.sin((pan * Math.PI) / 2),
      0.7,
    );
  }
}
noiseSweep(0, 2.4, 0.5, 0.2, 0.8, 300, 4500);
noiseSweep(3.0, 1.6, 0.35, 0.5, 0.5, 400, 7000); // subida hacia las cifras
noiseSweep(8.9, 1.2, 0.3, 0.5, 0.5, 400, 6000); // subida hacia el cierre

// ---- SFX: pings cristalinos al activarse cada nodo/cifra ----
function ping(t0, midi, pan, gain) {
  const f = hz(midi);
  const s0 = Math.floor(t0 * SR);
  const partials = [
    [1, 1, 3.2],
    [2.76, 0.35, 5],
    [5.4, 0.15, 8],
  ];
  for (let k = 0; k < SR * 1.6; k++) {
    const t = k / SR;
    let v = 0;
    for (const [m, a, dk] of partials) v += Math.sin(TAU * f * m * t) * a * Math.exp(-t * dk);
    v *= gain * Math.min(1, t * 400);
    add(s0 + k, v * Math.cos((pan * Math.PI) / 2), v * Math.sin((pan * Math.PI) / 2), 0.8);
  }
}
ping(5.0, 81, 0.3, 0.06);
ping(6.5, 84, 0.5, 0.06);
ping(8.0, 88, 0.7, 0.06);
ping(10.0, 86, 0.5, 0.045);

// ---- Impactos graves suaves (titular se reubica / cierre) ----
function boom(t0, gain) {
  const s0 = Math.floor(t0 * SR);
  let ph = 0;
  for (let k = 0; k < SR * 1.5; k++) {
    const t = k / SR;
    ph += (TAU * (38 + 40 * Math.exp(-t * 6))) / SR;
    const v = Math.sin(ph) * Math.exp(-t * 2.6) * gain;
    add(s0 + k, v, v, 0.25);
  }
}
boom(4.5, 0.32);
boom(10.0, 0.3);

// ---- Sting de la intro (tiempos absolutos, sincronizados con intro.mp4) ----
base = 0;
// 0–0,6 s: el punto de luz se carga (tono que sube + aire)
for (let k = 0; k < SR * 0.62; k++) {
  const t = k / SR;
  const p = t / 0.62;
  const f = hz(74) * (1 + 0.5 * p * p);
  const v = Math.sin(TAU * f * t) * p ** 2 * 0.05;
  add(k, v, v, 0.5);
}
noiseSweep(0, 0.7, 0.3, 0.5, 0.5, 200, 3500);
// 0,4–1,3 s: las ondas se abren hacia los lados
noiseSweep(0.4, 0.9, 0.22, 0.45, 0.05, 2500, 900);
noiseSweep(0.4, 0.9, 0.22, 0.55, 0.95, 2500, 900);
// 0,6 s: aparece el logo
boom(0.6, 0.34);
ping(0.6, 74, 0.35, 0.05);
ping(0.6, 81, 0.65, 0.045);
ping(0.62, 86, 0.5, 0.035);
// 0,6–3,2 s: colchón en Re menor que enlaza con la placa
for (const [n, pan] of [
  [50, 0.3],
  [57, 0.7],
  [62, 0.5],
]) {
  const f = hz(n);
  for (let k = 0; k < SR * 2.6; k++) {
    const t = k / SR;
    const e = env(t, 0.5, 2.6, 0.9) * 0.02;
    const v = (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * f * 2 * t)) * e;
    add(
      Math.floor(0.6 * SR) + k,
      v * Math.cos((pan * Math.PI) / 2),
      v * Math.sin((pan * Math.PI) / 2),
      0.5,
    );
  }
}
// 2,55–3,1 s: destello final de la intro
noiseSweep(2.55, 0.55, 0.4, 0.5, 0.5, 500, 8000);

// ---- Reverb estéreo (Freeverb simplificado, tiempos distintos por canal) ----
function reverb(input, combs, allpasses, fb, damp) {
  const out = new Float32Array(N + 0);
  for (const len of combs) {
    const buf = new Float32Array(len);
    let idx = 0;
    let store = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[idx];
      store = y * (1 - damp) + store * damp;
      buf[idx] = input[i] + store * fb;
      out[i] += y;
      idx = (idx + 1) % len;
    }
  }
  for (const len of allpasses) {
    const buf = new Float32Array(len);
    let idx = 0;
    for (let i = 0; i < N; i++) {
      const b = buf[idx];
      const y = -out[i] + b;
      buf[idx] = out[i] + b * 0.5;
      out[i] = y;
      idx = (idx + 1) % len;
    }
  }
  return out;
}
const revL = reverb(
  sendL,
  [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((x) => x * 2),
  [556, 441, 341, 225],
  0.86,
  0.3,
);
const revR = reverb(
  sendR,
  [1580, 1640, 1514, 1445, 1300, 1379, 1211, 1139].map((x) => x * 2),
  [579, 464, 364, 248],
  0.86,
  0.3,
);

// Eco ping-pong sobre el envío (profundidad)
const dl = Math.floor(0.375 * SR);
const dr = Math.floor(0.25 * SR);
for (let i = 0; i < N; i++) {
  const eL = i >= dl ? sendR[i - dl] * 0.18 : 0;
  const eR = i >= dr ? sendL[i - dr] * 0.18 : 0;
  L[i] += revL[i] * 0.045 + eL;
  R[i] += revR[i] * 0.045 + eR;
}

// Fade in/out de seguridad
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const g = Math.min(1, t / 0.05) * Math.min(1, Math.max(0, (DUR - t) / 1.8));
  L[i] *= g;
  R[i] *= g;
}

// ---- WAV 24-bit ----
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = 0.7 / peak;
const bytes = 3;
const data = Buffer.alloc(N * 2 * bytes);
for (let i = 0; i < N; i++) {
  for (const [c, ch] of [
    [0, L],
    [1, R],
  ]) {
    const v = Math.max(-1, Math.min(1, ch[i] * norm));
    data.writeIntLE(Math.round(v * 8388607), (i * 2 + c) * bytes, 3);
  }
}
const hdr = Buffer.alloc(44);
hdr.write("RIFF", 0);
hdr.writeUInt32LE(36 + data.length, 4);
hdr.write("WAVEfmt ", 8);
hdr.writeUInt32LE(16, 16);
hdr.writeUInt16LE(1, 20);
hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(SR, 24);
hdr.writeUInt32LE(SR * 2 * bytes, 28);
hdr.writeUInt16LE(2 * bytes, 32);
hdr.writeUInt16LE(bytes * 8, 34);
hdr.write("data", 36);
hdr.writeUInt32LE(data.length, 40);
const out = new URL("../assets/audio/placa-bed.raw.wav", import.meta.url);
writeFileSync(out, Buffer.concat([hdr, data]));
console.log("ok", out.pathname, "peak", peak.toFixed(3));
