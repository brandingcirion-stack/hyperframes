// Posproceso cinematográfico: escena HDR (MSAA) → bloom en 4 niveles → tonemapping
// ACES, viñeta y grano. El grano usa el número de cuadro, no el reloj: es determinista.
import * as THREE from "../vendor/three.module.min.js";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export function createPost(renderer, { ancho, alto, dpr, cfg, fps }) {
  const W = Math.round(ancho * dpr);
  const H = Math.round(alto * dpr);
  const hdr = { type: THREE.HalfFloatType, depthBuffer: false };
  const sceneRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const niveles = [2, 4, 8, 16].map((d) => {
    const w = Math.max(1, Math.round(W / d));
    const h = Math.max(1, Math.round(H / d));
    return {
      a: new THREE.WebGLRenderTarget(w, h, hdr),
      b: new THREE.WebGLRenderTarget(w, h, hdr),
      w,
      h,
    };
  });

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const escena = new THREE.Scene();
  escena.add(quad);

  const brillo = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uUmbral: { value: cfg.bloom.umbral } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc;
      uniform float uUmbral;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb;
        float l = max(c.r, max(c.g, c.b));
        // rodilla suave: sin cortes duros en el umbral
        float k = clamp((l - uUmbral + 0.5) / 1.0, 0.0, 1.0);
        float w = max(l - uUmbral, 0.0) + k * k * 0.25;
        gl_FragColor = vec4(c * (w / max(l, 1e-4)), 1.0);
      }
    `,
    depthTest: false,
  });
  const blur = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc;
      uniform vec2 uDir;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
        c += texture2D(tSrc, vUv + uDir * 1.3846153).rgb * 0.3162162;
        c += texture2D(tSrc, vUv - uDir * 1.3846153).rgb * 0.3162162;
        c += texture2D(tSrc, vUv + uDir * 3.2307692).rgb * 0.0702703;
        c += texture2D(tSrc, vUv - uDir * 3.2307692).rgb * 0.0702703;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    depthTest: false,
  });
  const copia = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc;
      varying vec2 vUv;
      void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }
    `,
    depthTest: false,
  });
  const final = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: sceneRT.texture },
      tB0: { value: niveles[0].a.texture },
      tB1: { value: niveles[1].a.texture },
      tB2: { value: niveles[2].a.texture },
      tB3: { value: niveles[3].a.texture },
      uBloom: { value: cfg.bloom.intensidad },
      uRadio: { value: cfg.bloom.radio },
      uExpo: { value: cfg.exposicion },
      uVineta: { value: cfg.vineta },
      uGrano: { value: cfg.grano },
      uCuadro: { value: 0 },
      uFundido: { value: 1 },
      uRes: { value: new THREE.Vector2(W, H) },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene, tB0, tB1, tB2, tB3;
      uniform float uBloom, uRadio, uExpo, uVineta, uGrano, uCuadro, uFundido;
      uniform vec2 uRes;
      varying vec2 vUv;
      vec3 aces(vec3 x) {
        // ajuste de Narkowicz del ACES fílmico
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }
      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb;
        vec3 b = texture2D(tB0, vUv).rgb * 1.0
               + texture2D(tB1, vUv).rgb * mix(0.6, 1.0, uRadio)
               + texture2D(tB2, vUv).rgb * mix(0.35, 0.9, uRadio)
               + texture2D(tB3, vUv).rgb * mix(0.2, 0.8, uRadio);
        c += b * uBloom * 0.35;
        c = aces(c * uExpo);
        vec2 q = vUv - 0.5;
        c *= 1.0 - uVineta * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
        c = toSRGB(c);
        // grano fílmico estable por cuadro (no depende del reloj)
        float g = hash(gl_FragCoord.xy + uCuadro * 37.0) - 0.5;
        c += g * uGrano * (0.6 + 0.4 * (1.0 - c));
        gl_FragColor = vec4(c * uFundido, 1.0);
      }
    `,
    depthTest: false,
  });

  function pass(mat, target) {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(escena, cam);
  }

  return {
    sceneRT,
    render(scene, camera, t, fundido) {
      renderer.setRenderTarget(sceneRT);
      renderer.clear();
      renderer.render(scene, camera);
      // umbral → nivel 0; cada nivel siguiente se reduce del anterior y se desenfoca
      brillo.uniforms.tSrc.value = sceneRT.texture;
      pass(brillo, niveles[0].a);
      niveles.forEach((n, i) => {
        if (i > 0) {
          copia.uniforms.tSrc.value = niveles[i - 1].a.texture;
          pass(copia, n.a);
        }
        for (let k = 0; k < 2; k++) {
          blur.uniforms.tSrc.value = n.a.texture;
          blur.uniforms.uDir.value.set(1 / n.w, 0);
          pass(blur, n.b);
          blur.uniforms.tSrc.value = n.b.texture;
          blur.uniforms.uDir.value.set(0, 1 / n.h);
          pass(blur, n.a);
        }
      });
      final.uniforms.uCuadro.value = Math.round(t * fps);
      final.uniforms.uFundido.value = fundido;
      pass(final, null);
    },
  };
}
