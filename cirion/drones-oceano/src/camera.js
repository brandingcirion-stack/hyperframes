// Cámara: posición y mira por claves (Hermite con tiempos) más un seguimiento parcial de la
// cabeza del haz sobre la trayectoria maestra. La mira no se clava en la cabeza: se mezcla
// con ella según un peso que cambia suavemente en el tiempo, y apunta a la cabeza
// promediada en una ventana gaussiana para que los cambios de ritmo del haz (aceleración de
// la picada, frenado en el agua) no se transmitan como tirones de cámara.
// Lo comparten la escena y las herramientas de diagnóstico (mismo código, mismo resultado).
import * as THREE from "../vendor/three.module.min.js";
import { makeTimeSpline, smoothstep } from "./util.js";

const MUESTRAS = 6; // muestras a cada lado en el promedio de la cabeza

export function createCamara({ C, tray, tCabeza }) {
  const claves = C.camara.claves;
  const posicion = makeTimeSpline(claves);
  const mira = makeTimeSpline(claves.map((k) => ({ t: k.t, pos: k.mira, quieta: k.quieta })));
  const seg = C.camara.seguimiento;
  const sigma = C.camara.suavizado;

  // peso del seguimiento: tramos [t, peso] unidos con smoothstep
  function peso(t) {
    if (t <= seg[0][0]) return seg[0][1];
    for (let i = 0; i < seg.length - 1; i++) {
      const [ta, wa] = seg[i];
      const [tb, wb] = seg[i + 1];
      if (t <= tb) return wa + (wb - wa) * smoothstep(ta, tb, t);
    }
    return seg[seg.length - 1][1];
  }

  const a = new THREE.Vector3();
  function cabezaSuave(t, out) {
    out.set(0, 0, 0);
    let suma = 0;
    for (let k = -MUESTRAS; k <= MUESTRAS; k++) {
      const d = (k / MUESTRAS) * 2 * sigma;
      const w = Math.exp(-0.5 * (d / sigma) ** 2);
      tray.P(tray.sHead(t + d), a);
      out.addScaledVector(a, w);
      suma += w;
    }
    return out.multiplyScalar(1 / suma);
  }

  const look = new THREE.Vector3();
  const objetivo = new THREE.Vector3();
  function cameraAt(t, cam) {
    posicion(t, cam.position);
    mira(t, look);
    const w = t >= tCabeza ? peso(t) : 0;
    if (w > 0) look.lerp(cabezaSuave(t, objetivo), w);
    cam.lookAt(look);
    cam.updateMatrixWorld();
    return cam;
  }

  return { cameraAt, peso, posicion };
}
