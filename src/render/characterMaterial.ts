import { MeshDepthMaterial, MeshLambertMaterial, RGBADepthPacking, type WebGLProgramParametersWithUniforms } from 'three';

/**
 * Animation clips understood by the vertex shader. The CPU only writes a clip id
 * and a phase per instance; every joint rotation happens on the GPU.
 */
export const Clip = {
  Idle: 0,
  Walk: 1,
  Attack: 2,
  Die: 3,
  Cast: 4,
  Hit: 5,
} as const;
export type ClipId = (typeof Clip)[keyof typeof Clip];

/** Seconds per cycle (looping clips) or total duration (one-shot clips). */
export const CLIP_DURATION: Record<ClipId, number> = {
  [Clip.Idle]: 2.4,
  [Clip.Walk]: 0.7,
  [Clip.Attack]: 0.6,
  [Clip.Die]: 1.3,
  [Clip.Cast]: 0.9,
  [Clip.Hit]: 0.32,
};

export const CLIP_LOOPS: Record<ClipId, boolean> = {
  [Clip.Idle]: true,
  [Clip.Walk]: true,
  [Clip.Attack]: false,
  [Clip.Die]: false,
  [Clip.Cast]: false,
  [Clip.Hit]: false,
};

const PARS = /* glsl */ `
attribute float aPart;
attribute vec3 aPivot;
attribute float aGlow;
attribute vec4 aAnim; // clip, phase, hit flash, unused
varying float vFlash;
varying float vGlow;

mat3 fsRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 fsRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 fsRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

// Local pose (about the part pivot) and root pose (about the feet) for one part.
void fsPose(int part, vec4 anim, out mat3 L, out vec3 LT, out mat3 R, out vec3 RT) {
  L = mat3(1.0); LT = vec3(0.0); R = mat3(1.0); RT = vec3(0.0);
  float clip = anim.x;
  float ph = anim.y;
  float w = ph * 6.2831853;
  float s = sin(w);
  float c = cos(w);
  bool torso = part == 0; bool head = part == 1;
  bool armL = part == 2; bool armR = part == 3;
  bool legL = part == 4; bool legR = part == 5;
  if (clip < 0.5) {
    // Idle: breathe, look around, arms sway
    RT.y = 0.015 * s;
    if (head) L = fsRotY(0.14 * sin(w * 0.5 + 1.0)) * fsRotX(0.04 * s);
    if (armL) L = fsRotX(0.07 * s) * fsRotZ(0.03 * s);
    if (armR) L = fsRotX(-0.07 * s) * fsRotZ(-0.03 * s);
    if (torso) L = fsRotX(0.025 * s);
  } else if (clip < 1.5) {
    // Walk: opposite arm and leg swing, body bob, slight sway
    float a = 0.75 * s;
    if (legL) L = fsRotX(a);
    if (legR) L = fsRotX(-a);
    if (armL) L = fsRotX(-a * 0.7);
    if (armR) L = fsRotX(a * 0.7);
    RT.y = 0.05 * abs(c);
    R = fsRotZ(0.04 * s);
    if (head) L = fsRotZ(-0.04 * s);
  } else if (clip < 2.5) {
    // Attack: wind up, strike, recover
    float wind = smoothstep(0.0, 0.3, ph);
    float strike = smoothstep(0.3, 0.48, ph);
    float rec = smoothstep(0.6, 1.0, ph);
    if (armR) L = fsRotX(2.1 * wind - 3.0 * strike + 0.9 * rec) * fsRotZ(-0.3 * wind + 0.3 * strike);
    if (armL) L = fsRotX(-0.5 * wind + 0.7 * strike - 0.2 * rec);
    R = fsRotX(-0.18 * wind + 0.5 * strike - 0.32 * rec) * fsRotY(-0.35 * wind + 0.55 * strike - 0.2 * rec);
    if (head) L = fsRotX(0.15 * strike - 0.15 * rec);
    if (legL) L = fsRotX(0.25 * strike - 0.25 * rec);
    if (legR) L = fsRotX(-0.25 * strike + 0.25 * rec);
  } else if (clip < 3.5) {
    // Die: stagger, fall backward, sink into the ground
    float stagger = smoothstep(0.0, 0.2, ph);
    float fall = smoothstep(0.15, 0.6, ph);
    float sink = smoothstep(0.72, 1.0, ph);
    R = fsRotX(0.2 * stagger - 1.75 * fall * fall) * fsRotZ(0.15 * fall);
    RT.y = -1.6 * sink;
    RT.z = -0.3 * fall;
    if (armL) L = fsRotX(-0.9 * fall) * fsRotZ(0.6 * fall);
    if (armR) L = fsRotX(-1.1 * fall) * fsRotZ(-0.5 * fall);
    if (head) L = fsRotX(-0.4 * stagger + 0.3 * fall);
    if (legL) L = fsRotX(0.4 * fall);
    if (legR) L = fsRotX(0.15 * fall);
  } else if (clip < 4.5) {
    // Cast: both arms up and forward, hold, release
    float up = smoothstep(0.0, 0.22, ph);
    float hold = 1.0 - smoothstep(0.62, 1.0, ph);
    float k = up * hold;
    float pulse = 1.0 + 0.06 * sin(ph * 40.0) * k;
    if (armR) L = fsRotX(-2.5 * k) * fsRotZ(-0.25 * k);
    if (armL) L = fsRotX(-2.2 * k) * fsRotZ(0.45 * k);
    R = fsRotX(-0.12 * k);
    RT.y = 0.06 * k * pulse;
    if (head) L = fsRotX(-0.28 * k);
  } else {
    // Hit: flinch back
    float k = sin(clamp(ph, 0.0, 1.0) * 3.14159);
    R = fsRotX(-0.28 * k);
    RT.z = -0.18 * k;
    if (head) L = fsRotX(-0.35 * k);
    if (armL) L = fsRotZ(0.4 * k);
    if (armR) L = fsRotZ(-0.4 * k);
  }
}
`;

const NORMAL = /* glsl */ `
vec3 objectNormal = vec3( normal );
{
  mat3 fsL; vec3 fsLT; mat3 fsR; vec3 fsRT;
  fsPose(int(aPart + 0.5), aAnim, fsL, fsLT, fsR, fsRT);
  objectNormal = fsR * fsL * objectNormal;
}
`;

const VERTEX = /* glsl */ `
vec3 transformed = vec3( position );
{
  mat3 fsL; vec3 fsLT; mat3 fsR; vec3 fsRT;
  fsPose(int(aPart + 0.5), aAnim, fsL, fsLT, fsR, fsRT);
  transformed = fsR * (fsL * (transformed - aPivot) + aPivot + fsLT) + fsRT;
  vFlash = aAnim.z;
  vGlow = aGlow;
}
`;

const EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.85, 0.7) * vFlash * 0.9 + diffuseColor.rgb * vGlow * 2.6;
`;

function patch(shader: WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + PARS)
    .replace('#include <beginnormal_vertex>', NORMAL)
    .replace('#include <begin_vertex>', VERTEX);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vFlash;\nvarying float vGlow;')
    .replace('#include <emissivemap_fragment>', EMISSIVE);
}

/** Lit material plus the matching shadow-caster material for GPU-posed characters. */
export function createCharacterMaterials(): { material: MeshLambertMaterial; depthMaterial: MeshDepthMaterial } {
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = patch;
  material.customProgramCacheKey = () => 'fs-character';

  const depthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  depthMaterial.onBeforeCompile = patch;
  depthMaterial.customProgramCacheKey = () => 'fs-character-depth';
  return { material, depthMaterial };
}
