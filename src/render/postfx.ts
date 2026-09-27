import { Vector2 } from 'three';

/**
 * Runs right after the scene render: replaces any not-a-number or infinite pixel
 * with black and caps brightness, so one bad pixel can never spread through the
 * bloom blur and black out the screen.
 */
export const SanitizeShader = {
  name: 'SanitizeShader',
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      bvec3 bad = bvec3(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b));
      vec3 safe = mix(clamp(c.rgb, 0.0, 48.0), vec3(0.0), vec3(bad));
      gl_FragColor = vec4(safe, 1.0);
    }
  `,
};

/**
 * Final colour grade, applied after tone mapping: split toning (cool shadows, warm
 * highlights), a touch of contrast, a heavy vignette and fine film grain.
 */
export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uVignette: { value: 0.55 },
    uContrast: { value: 1.12 },
    uSaturation: { value: 0.92 },
    uGrain: { value: 0.035 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uVignette;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uGrain;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (isnan(c.r) || isnan(c.g) || isnan(c.b) || isinf(c.r) || isinf(c.g) || isinf(c.b)) c = vec3(0.0);
      c = clamp(c, 0.0, 1.0);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;
      // Split toning: shadows toward cold blue, highlights toward torch amber
      vec3 shadowTint = vec3(0.86, 0.92, 1.12);
      vec3 highTint = vec3(1.06, 1.0, 0.92);
      c *= mix(shadowTint, highTint, smoothstep(0.1, 0.8, l));
      // Vignette
      vec2 q = vUv - 0.5;
      q.x *= uResolution.x / uResolution.y;
      float v = 1.0 - smoothstep(0.35, 1.15, length(q) * 1.25);
      c *= mix(1.0 - uVignette, 1.0, v);
      // Grain
      float g = hash(vUv * uResolution.xy * 0.5 + fract(uTime) * 100.0) - 0.5;
      c += g * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};
