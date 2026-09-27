import {
  AdditiveBlending,
  Camera,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';

export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds alive. */
  life: number;
  r: number;
  g: number;
  b: number;
  /** Brightness multiplier. Values above 1 bloom. */
  alpha?: number;
  size: number;
  /** Size at end of life. Defaults to 0. */
  sizeEnd?: number;
  /** Downward acceleration. */
  gravity?: number;
  /** Air resistance. 0 = none, 4 = stops quickly. */
  drag?: number;
}

const VERT = /* glsl */ `
attribute vec3 pStart;
attribute vec3 pVel;
attribute vec2 pTime;   // birth, life
attribute vec4 pColor;  // rgb, alpha
attribute vec4 pShape;  // size0, size1, gravity, drag
uniform float uTime;
uniform vec3 uRight;
uniform vec3 uUp;
varying vec4 vCol;
varying vec2 vUv;
void main() {
  float age = uTime - pTime.x;
  float t = age / max(pTime.y, 0.0001);
  if (t < 0.0 || t > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec4(0.0);
    vUv = uv;
    return;
  }
  vec3 disp = pVel * age;
  if (pShape.w > 0.001) disp = pVel * (1.0 - exp(-pShape.w * age)) / pShape.w;
  disp.y -= 0.5 * pShape.z * age * age;
  vec3 centre = pStart + disp;
  float size = mix(pShape.x, pShape.y, t);
  vec3 world = centre + (uRight * position.x + uUp * position.y) * size;
  float fade = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.5, 1.0, t));
  vCol = vec4(pColor.rgb, pColor.a * fade);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec4 vCol;
varying vec2 vUv;
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float a = smoothstep(1.0, 0.15, r);
  a *= a;
  gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0);
}
`;

/**
 * Stateless GPU particles. The CPU writes a particle once at spawn time; the
 * vertex shader integrates position from age, so nothing is touched per frame.
 * Storage is a ring buffer, so the oldest particles are recycled first.
 */
export class ParticleSystem {
  readonly mesh: Mesh;
  private readonly start: InstancedBufferAttribute;
  private readonly vel: InstancedBufferAttribute;
  private readonly time: InstancedBufferAttribute;
  private readonly color: InstancedBufferAttribute;
  private readonly shape: InstancedBufferAttribute;
  private readonly material: ShaderMaterial;
  private head = 0;
  private dirtyFrom = -1;
  private dirtyTo = -1;
  private wrapped = false;
  private now = 0;
  /** Particles spawned this frame, for the HUD and the budget. */
  spawnedThisFrame = 0;
  /** Hard cap on spawns per frame. Low-priority effects are dropped first. */
  budgetPerFrame = 600;

  constructor(public readonly capacity: number) {
    const base = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    geo.instanceCount = capacity;

    const make = (n: number) => {
      const attr = new InstancedBufferAttribute(new Float32Array(capacity * n), n);
      attr.setUsage(DynamicDrawUsage);
      return attr;
    };
    this.start = make(3);
    this.vel = make(3);
    this.time = make(2);
    this.color = make(4);
    this.shape = make(4);
    // Birth time far in the past so unused slots never render.
    (this.time.array as Float32Array).fill(-1e6);
    geo.setAttribute('pStart', this.start);
    geo.setAttribute('pVel', this.vel);
    geo.setAttribute('pTime', this.time);
    geo.setAttribute('pColor', this.color);
    geo.setAttribute('pShape', this.shape);

    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uRight: { value: new Vector3(1, 0, 0) }, uUp: { value: new Vector3(0, 1, 0) } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  /** Spawns one particle. Returns false if the frame budget is spent. */
  spawn(p: ParticleSpec, priority = 1): boolean {
    if (this.spawnedThisFrame >= this.budgetPerFrame * priority) return false;
    const i = this.head;
    this.start.setXYZ(i, p.x, p.y, p.z);
    this.vel.setXYZ(i, p.vx, p.vy, p.vz);
    this.time.setXY(i, this.now, p.life);
    this.color.setXYZW(i, p.r, p.g, p.b, p.alpha ?? 1);
    this.shape.setXYZW(i, p.size, p.sizeEnd ?? 0, p.gravity ?? 0, p.drag ?? 0);
    if (this.dirtyFrom < 0) this.dirtyFrom = i;
    this.dirtyTo = i;
    if (i < this.dirtyFrom) this.wrapped = true;
    this.head = (i + 1) % this.capacity;
    this.spawnedThisFrame++;
    return true;
  }

  /** Uploads what changed and orients billboards to the camera. Call once per frame after spawning. */
  update(time: number, camera: Camera): void {
    this.now = time;
    this.material.uniforms.uTime!.value = time;
    const right = this.material.uniforms.uRight!.value as Vector3;
    const up = this.material.uniforms.uUp!.value as Vector3;
    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

    if (this.dirtyFrom >= 0) {
      const attrs = [this.start, this.vel, this.time, this.color, this.shape];
      for (const a of attrs) {
        a.clearUpdateRanges();
        if (this.wrapped) {
          a.addUpdateRange(this.dirtyFrom * a.itemSize, (this.capacity - this.dirtyFrom) * a.itemSize);
          a.addUpdateRange(0, (this.dirtyTo + 1) * a.itemSize);
        } else {
          a.addUpdateRange(this.dirtyFrom * a.itemSize, (this.dirtyTo - this.dirtyFrom + 1) * a.itemSize);
        }
        a.needsUpdate = true;
      }
      this.dirtyFrom = -1;
      this.dirtyTo = -1;
      this.wrapped = false;
    }
    this.spawnedThisFrame = 0;
  }
}
