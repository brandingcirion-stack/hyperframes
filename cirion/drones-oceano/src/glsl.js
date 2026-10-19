// Fragmentos GLSL compartidos por todos los materiales.
export const COMMON = /* glsl */ `
uniform float uTime;
uniform float uDpr;
uniform vec2 uRes;
uniform float uTanHalf;
uniform float uReflectPass;
uniform float uUnder;
uniform float uFogDensity;
uniform vec3 uFogTop;
uniform vec3 uFogBottom;
uniform float uFondo;
uniform vec3 uHaze;
uniform float uHazeDensity;

vec3 waterColorAt(float y) {
  float k = clamp(-y / uFondo, 0.0, 1.0);
  return mix(uFogTop, uFogBottom, pow(k, 0.6));
}
// Niebla submarina (solo con la cámara bajo el agua).
float underFog(vec3 wp) {
  float d = distance(wp, cameraPosition);
  return uUnder * (1.0 - exp(-d * uFogDensity));
}
// Bruma urbana: más densa cerca del suelo, aumenta con la distancia.
float hazeAmount(vec3 wp) {
  float d = distance(wp, cameraPosition);
  float h = exp(-max(wp.y, 0.0) / 380.0);
  return (1.0 - uUnder) * (1.0 - exp(-d * uHazeDensity * (0.3 + 0.7 * h)));
}
// Objeto opaco: mezcla hacia el color del medio (bruma o agua).
vec3 atmos(vec3 col, vec3 wp) {
  if (uUnder > 0.5) return mix(col, waterColorAt(mix(cameraPosition.y, wp.y, 0.5)), underFog(wp));
  return mix(col, uHaze, hazeAmount(wp));
}
// Luz aditiva: solo se atenúa (más suave que un objeto opaco).
float atmosLight(vec3 wp) {
  return (1.0 - underFog(wp) * 0.6) * (1.0 - hazeAmount(wp) * 0.75);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}
`;
