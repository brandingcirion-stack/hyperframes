// Extrae la geometría del logo oficial (SVG de marca) a un módulo JS que la escena
// muestrea en tiempo de setup. No redibuja ni simplifica nada: copia los `d` de cada
// <path>, su color y el viewBox tal como vienen en el archivo.
// Uso: node scripts/extract-logo.mjs  → src/logo-data.js
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "assets/logo/Cirion-logo-duo-negro.svg";
const svg = readFileSync(join(root, SOURCE), "utf8");

const viewBox = svg
  .match(/viewBox="([^"]+)"/)[1]
  .trim()
  .split(/[\s,]+/)
  .map(Number);

// Colores declarados por clase en el <style> del archivo (p. ej. .cls-1 { fill: #ef2ac1 }).
const classFill = {};
for (const m of svg.matchAll(/\.([\w-]+)\s*\{[^}]*fill:\s*(#[0-9a-fA-F]{3,6})/g)) {
  classFill[m[1]] = m[2].toLowerCase();
}

const paths = [];
for (const m of svg.matchAll(/<path\b([^>]*?)\/?>/g)) {
  const attrs = m[1];
  const d = attrs.match(/\sd="([^"]+)"/)[1];
  const cls = attrs.match(/class="([^"]+)"/)?.[1];
  const fillAttr = attrs.match(/fill="([^"]+)"/)?.[1];
  // Sin fill explícito, SVG pinta en negro: son las letras de la versión duo-negro.
  const fill = (cls && classFill[cls]) || fillAttr || "#000000";
  const role = fill === "#ef2ac1" ? "simbolo" : "letras";
  paths.push({ role, fill, d });
}

const sha256 = createHash("sha256").update(svg).digest("hex");
const out = `// GENERADO por scripts/extract-logo.mjs — no editar a mano.
// Fuente: ${SOURCE} (sha256 ${sha256})
export const LOGO = ${JSON.stringify({ source: SOURCE, sha256, viewBox, paths }, null, 2)};
`;
writeFileSync(join(root, "src/logo-data.js"), out);
console.log(
  `logo-data.js: ${paths.length} paths (${paths.map((p) => `${p.role} ${p.fill}`).join(", ")}), viewBox ${viewBox.join(" ")}`,
);
