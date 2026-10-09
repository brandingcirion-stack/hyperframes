// Distribuye los drones sobre la geometría oficial del logo.
// 1) Contorno: puntos equiespaciados a lo largo de cada trazo (getPointAtLength),
//    retraídos levemente hacia dentro para conservar el grosor óptico.
// 2) Relleno: retícula hexagonal recortada por la máscara (Path2D + isPointInPath,
//    regla nonzero, la misma con la que el navegador pinta el SVG).
// Se descarta todo punto a menos de `espaciado` de uno ya aceptado.
import { mulberry32 } from "./util.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function sampleLogo(logo, { espaciado, pasoContorno, margenContorno, semilla }) {
  const rnd = mulberry32(semilla);
  const ctx = document.createElement("canvas").getContext("2d");
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  document.body.appendChild(svg);

  const accepted = [];
  const cell = espaciado;
  const grid = new Map();
  const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const isFree = (x, y, minD) => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = grid.get(`${cx + i},${cy + j}`);
        if (!list) continue;
        for (const p of list) if ((p.x - x) ** 2 + (p.y - y) ** 2 < minD * minD) return false;
      }
    }
    return true;
  };
  const accept = (p) => {
    accepted.push(p);
    const k = key(p.x, p.y);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  };

  const shapes = logo.paths.map((p) => ({ ...p, path2d: new Path2D(p.d) }));
  const inside = (x, y) => shapes.some((s) => ctx.isPointInPath(s.path2d, x, y, "nonzero"));
  const insideRole = (role, x, y) =>
    shapes.some((s) => s.role === role && ctx.isPointInPath(s.path2d, x, y, "nonzero"));

  // 1) Contornos.
  for (const shape of shapes) {
    const el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", shape.d);
    svg.appendChild(el);
    const total = el.getTotalLength();
    const steps = Math.floor(total / pasoContorno);
    for (let i = 0; i < steps; i++) {
      const l = (i / steps) * total;
      const a = el.getPointAtLength(l);
      const b = el.getPointAtLength(Math.min(total, l + 0.5));
      let nx = -(b.y - a.y);
      let ny = b.x - a.x;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      // Normal hacia el interior del trazo.
      if (!insideRole(shape.role, a.x + nx * 1.5, a.y + ny * 1.5)) {
        nx = -nx;
        ny = -ny;
      }
      const x = a.x + nx * margenContorno;
      const y = a.y + ny * margenContorno;
      if (!insideRole(shape.role, x, y)) continue;
      if (!isFree(x, y, espaciado * 0.86)) continue;
      accept({ x, y, role: shape.role, fill: shape.fill, borde: true });
    }
  }

  // 2) Relleno en retícula hexagonal con una leve variación (semilla fija).
  const [vx, vy, vw, vh] = logo.viewBox;
  const dy = espaciado * 0.866;
  let row = 0;
  for (let y = vy + dy * 0.5; y < vy + vh; y += dy, row++) {
    for (let x = vx + (row % 2 ? espaciado * 0.5 : 0); x < vx + vw; x += espaciado) {
      const jx = x + (rnd() - 0.5) * espaciado * 0.12;
      const jy = y + (rnd() - 0.5) * espaciado * 0.12;
      if (!inside(jx, jy)) continue;
      if (!isFree(jx, jy, espaciado * 0.9)) continue;
      const role = insideRole("simbolo", jx, jy) ? "simbolo" : "letras";
      const fill = shapes.find((s) => s.role === role).fill;
      accept({ x: jx, y: jy, role, fill, borde: false });
    }
  }

  svg.remove();
  return accepted;
}
