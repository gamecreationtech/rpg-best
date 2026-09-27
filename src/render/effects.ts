import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Camera,
  CircleGeometry,
  DoubleSide,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Rng } from '../gen/rng';
import type { ParticleSystem } from './particles';

type Vec3 = [number, number, number];

interface Ring {
  mesh: Mesh;
  t: number;
  duration: number;
  radius: number;
  active: boolean;
}

interface Flash {
  mesh: Mesh;
  t: number;
  duration: number;
  radius: number;
  active: boolean;
}

interface Projectile {
  mesh: Mesh;
  active: boolean;
  pos: Vector3;
  vel: Vector3;
  gravity: number;
  life: number;
  age: number;
  kind: 'fireball' | 'meteor';
  onEnd: ((x: number, y: number, z: number) => void) | null;
  /** Stops early when within this distance of the target point. */
  target: Vector3 | null;
}

interface Bolt {
  core: Mesh;
  glow: Mesh;
  points: Vec3[];
  t: number;
  duration: number;
  jitterTimer: number;
  active: boolean;
  seed: number;
}

interface Emitter {
  remaining: number;
  accumulator: number;
  rate: number;
  emit: (particles: ParticleSystem) => void;
}

/** Additive glow ball: bright where the surface faces the camera, soft at the rim. */
function softGlowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Vector3(1, 1, 1) }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying float vFacing;
      void main() {
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFacing = max(dot(n, normalize(-mv.xyz)), 0.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vFacing;
      void main() {
        float k = pow(vFacing, 2.4);
        gl_FragColor = vec4(uColor * k * uOpacity, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

const BOLT_NODES = 8;
const BOLT_SUBDIV = 9;
const BOLT_POINTS = (BOLT_NODES - 1) * BOLT_SUBDIV + 1;

function makeRibbon(): BufferGeometry {
  const g = new BufferGeometry();
  const verts = (BOLT_POINTS - 1) * 6;
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts * 3), 3));
  g.setDrawRange(0, 0);
  return g;
}

/**
 * Spell visuals built from three primitives: GPU particles, additive meshes
 * (rings, flashes, projectiles) and camera-facing lightning ribbons.
 */
export class Effects {
  private readonly rings: Ring[] = [];
  private readonly flashes: Flash[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly emitters: Emitter[] = [];
  private readonly rng = new Rng(1234);
  private readonly camPos = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  /** Called when something lands hard enough to shake the camera. */
  onKick: ((intensity: number) => void) | null = null;

  constructor(private readonly scene: Scene, private readonly particles: ParticleSystem) {
    const ringGeo = new RingGeometry(0.91, 1, 64);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const mesh = new Mesh(ringGeo, new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }));
      mesh.visible = false;
      mesh.renderOrder = 8;
      scene.add(mesh);
      this.rings.push({ mesh, t: 0, duration: 1, radius: 1, active: false });
    }
    const discGeo = new CircleGeometry(1, 40);
    discGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const mesh = new Mesh(discGeo, new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
      mesh.visible = false;
      mesh.renderOrder = 7;
      scene.add(mesh);
      this.rings.push({ mesh, t: 0, duration: 1, radius: 1, active: false });
    }
    const flashGeo = new IcosahedronGeometry(1, 3);
    for (let i = 0; i < 4; i++) {
      const mesh = new Mesh(flashGeo, softGlowMaterial());
      mesh.visible = false;
      mesh.renderOrder = 9;
      scene.add(mesh);
      this.flashes.push({ mesh, t: 0, duration: 1, radius: 1, active: false });
    }
    const ballGeo = new IcosahedronGeometry(0.24, 1);
    for (let i = 0; i < 8; i++) {
      const mesh = new Mesh(ballGeo, new MeshBasicMaterial({ fog: false }));
      mesh.visible = false;
      scene.add(mesh);
      this.projectiles.push({ mesh, active: false, pos: new Vector3(), vel: new Vector3(), gravity: 0, life: 0, age: 0, kind: 'fireball', onEnd: null, target: null });
    }
    for (let i = 0; i < 4; i++) {
      const core = new Mesh(makeRibbon(), new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }));
      (core.material as MeshBasicMaterial).color.setRGB(1.7, 1.9, 2.5);
      const glow = new Mesh(makeRibbon(), new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false, opacity: 0.22 }));
      (glow.material as MeshBasicMaterial).color.setRGB(0.3, 0.5, 1.4);
      core.visible = glow.visible = false;
      core.frustumCulled = glow.frustumCulled = false;
      core.renderOrder = glow.renderOrder = 9;
      scene.add(core, glow);
      this.bolts.push({ core, glow, points: [], t: 0, duration: 0.3, jitterTimer: 0, active: false, seed: i });
    }
  }

  // ---------- Primitive effects ----------

  ring(x: number, y: number, z: number, radius: number, duration: number, r: number, g: number, b: number, disc = false): void {
    const pool = this.rings.filter((q) => (q.mesh.geometry instanceof CircleGeometry) === disc);
    const ring = pool.find((q) => !q.active) ?? pool[0]!;
    ring.active = true;
    ring.t = 0;
    ring.duration = duration;
    ring.radius = radius;
    ring.mesh.position.set(x, y, z);
    (ring.mesh.material as MeshBasicMaterial).color.setRGB(r, g, b);
    ring.mesh.visible = true;
  }

  flash(x: number, y: number, z: number, radius: number, duration: number, r: number, g: number, b: number): void {
    const f = this.flashes.find((q) => !q.active) ?? this.flashes[0]!;
    f.active = true;
    f.t = 0;
    f.duration = duration;
    f.radius = radius;
    f.mesh.position.set(x, y, z);
    ((f.mesh.material as ShaderMaterial).uniforms.uColor!.value as Vector3).set(r, g, b);
    f.mesh.visible = true;
  }

  emitter(duration: number, perSecond: number, emit: (p: ParticleSystem) => void): void {
    this.emitters.push({ remaining: duration, accumulator: 0, rate: perSecond, emit });
  }

  burst(x: number, y: number, z: number, count: number, speed: number, color: Vec3, life: number, size: number, opts: { gravity?: number; drag?: number; up?: number; alpha?: number; spread?: number; priority?: number } = {}): void {
    const rng = this.rng;
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const e = rng.range(-1, 1) * (opts.spread ?? 1);
      const r = Math.sqrt(1 - e * e);
      const s = speed * rng.range(0.4, 1);
      this.particles.spawn(
        {
          x, y, z,
          vx: Math.cos(a) * r * s,
          vy: e * s + (opts.up ?? 0),
          vz: Math.sin(a) * r * s,
          life: life * rng.range(0.6, 1.2),
          r: color[0], g: color[1], b: color[2],
          alpha: opts.alpha ?? 1,
          size: size * rng.range(0.7, 1.3),
          sizeEnd: size * 0.15,
          gravity: opts.gravity ?? 0,
          drag: opts.drag ?? 0,
        },
        opts.priority ?? 1,
      );
    }
  }

  // ---------- Spells ----------

  fireball(from: Vec3, to: Vec3, onEnd: (x: number, y: number, z: number) => void): void {
    const p = this.projectiles.find((q) => !q.active) ?? this.projectiles[0]!;
    p.active = true;
    p.kind = 'fireball';
    p.pos.set(from[0], from[1], from[2]);
    p.vel.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize().multiplyScalar(15);
    p.gravity = 0;
    p.age = 0;
    p.life = 1.2;
    p.target = new Vector3(to[0], to[1], to[2]);
    p.onEnd = onEnd;
    (p.mesh.material as MeshBasicMaterial).color.setRGB(3, 1.1, 0.3);
    p.mesh.scale.setScalar(1);
    p.mesh.visible = true;
    this.flash(from[0], from[1], from[2], 0.5, 0.18, 2.5, 1.0, 0.25);
  }

  explode(x: number, y: number, z: number, scale = 1): void {
    this.flash(x, y, z, 1.05 * scale, 0.26, 3.2, 1.3, 0.35);
    this.ring(x, 0.08, z, 3.0 * scale, 0.4, 1.4, 0.55, 0.15);
    this.burst(x, y, z, Math.round(70 * scale), 7 * scale, [2.2, 0.9, 0.25], 0.5, 0.34 * scale, { drag: 3.5, up: 1.5, alpha: 0.8, priority: 1 });
    this.burst(x, y, z, Math.round(40 * scale), 9 * scale, [2.4, 0.7, 0.15], 0.9, 0.12, { gravity: 9, up: 4, priority: 1 });
    this.burst(x, y + 0.3, z, Math.round(20 * scale), 2 * scale, [0.35, 0.14, 0.06], 1.4, 0.8 * scale, { drag: 2, up: 1.6, alpha: 0.35, priority: 0.7 });
    this.onKick?.(0.25 * scale);
  }

  frostNova(x: number, y: number, z: number, radius: number): void {
    this.flash(x, y + 0.8, z, 1.3, 0.24, 0.8, 1.8, 3.0);
    this.ring(x, 0.1, z, radius, 0.45, 0.35, 0.9, 1.6);
    this.ring(x, 0.06, z, radius * 0.8, 1.4, 0.012, 0.03, 0.08, true);
    const rng = this.rng;
    for (let i = 0; i < 160; i++) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(6, 14);
      this.particles.spawn({
        x, y: y + rng.range(0.1, 1.0), z,
        vx: Math.cos(a) * s, vy: rng.range(-0.5, 1.5), vz: Math.sin(a) * s,
        life: rng.range(0.35, 0.7),
        r: 0.4, g: 1.2, b: 2.0, alpha: 0.9,
        size: rng.range(0.1, 0.24), sizeEnd: 0.02,
        drag: 4.5, gravity: 2,
      });
    }
    // Lingering frost mist
    this.emitter(1.2, 90, (p) => {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, radius * 0.9);
      p.spawn({
        x: x + Math.cos(a) * d, y: 0.1, z: z + Math.sin(a) * d,
        vx: 0, vy: rng.range(0.2, 0.6), vz: 0,
        life: rng.range(0.8, 1.4), r: 0.25, g: 0.6, b: 1.2, alpha: 0.14,
        size: rng.range(0.4, 0.9), sizeEnd: 0.1, drag: 1,
      }, 0.6);
    });
    this.onKick?.(0.18);
  }

  chainLightning(points: Vec3[]): void {
    const bolt = this.bolts.find((b) => !b.active) ?? this.bolts[0]!;
    bolt.active = true;
    bolt.t = 0;
    bolt.duration = 0.32;
    bolt.jitterTimer = 0;
    bolt.points = points.slice(0, BOLT_NODES);
    bolt.core.visible = bolt.glow.visible = true;
    for (let i = 0; i < bolt.points.length; i++) {
      const [x, y, z] = bolt.points[i]!;
      this.burst(x, y, z, i === 0 ? 10 : 26, 5, [0.9, 1.2, 2.2], 0.35, 0.1, { gravity: 6, drag: 1 });
      if (i > 0) this.flash(x, y, z, 0.6, 0.16, 1.2, 1.5, 2.6);
    }
    this.onKick?.(0.12);
  }

  meteor(target: Vec3, onImpact: (x: number, y: number, z: number) => void): void {
    const p = this.projectiles.find((q) => !q.active) ?? this.projectiles[0]!;
    p.active = true;
    p.kind = 'meteor';
    p.pos.set(target[0] - 5, 16, target[2] - 3);
    p.vel.set(5, -16, 3).multiplyScalar(1.15);
    p.gravity = 0;
    p.age = 0;
    p.life = 0.87;
    p.target = new Vector3(target[0], 0.3, target[2]);
    p.onEnd = (x, _y, z) => {
      this.explode(x, 0.4, z, 1.6);
      this.ring(x, 0.1, z, 6.5, 0.55, 1.6, 0.5, 0.12);
      const rng = this.rng;
      this.emitter(2.2, 140, (ps) => {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(0, 2.6);
        ps.spawn({
          x: x + Math.cos(a) * d, y: 0.1, z: z + Math.sin(a) * d,
          vx: rng.range(-0.3, 0.3), vy: rng.range(0.8, 2.2), vz: rng.range(-0.3, 0.3),
          life: rng.range(0.5, 1.1), r: 2, g: 0.7, b: 0.15, alpha: 0.5,
          size: rng.range(0.2, 0.45), sizeEnd: 0.05, drag: 1.5,
        }, 0.6);
      });
      this.onKick?.(0.9);
      onImpact(x, 0, z);
    };
    (p.mesh.material as MeshBasicMaterial).color.setRGB(3, 1.2, 0.35);
    p.mesh.scale.setScalar(2.2);
    p.mesh.visible = true;
    // Target marker on the ground
    this.ring(target[0], 0.08, target[2], 2.4, 0.85, 1.4, 0.45, 0.1);
  }

  // ---------- Per-frame update ----------

  update(dt: number, camera: Camera): void {
    this.camPos.setFromMatrixPosition(camera.matrixWorld);

    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt / r.duration;
      if (r.t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const ease = 1 - Math.pow(1 - r.t, 3);
      const disc = r.mesh.geometry instanceof CircleGeometry;
      r.mesh.scale.setScalar(Math.max(0.01, disc ? r.radius : r.radius * ease));
      (r.mesh.material as MeshBasicMaterial).opacity = disc ? (1 - r.t) * (1 - r.t) : 1 - r.t;
    }

    for (const f of this.flashes) {
      if (!f.active) continue;
      f.t += dt / f.duration;
      if (f.t >= 1) {
        f.active = false;
        f.mesh.visible = false;
        continue;
      }
      f.mesh.scale.setScalar(f.radius * (0.4 + 0.6 * Math.sqrt(f.t)));
      (f.mesh.material as ShaderMaterial).uniforms.uOpacity!.value = (1 - f.t) * (1 - f.t);
    }

    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.age += dt;
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.x += dt * 9;
      p.mesh.rotation.z += dt * 7;
      const trailCount = p.kind === 'meteor' ? 6 : 4;
      const big = p.kind === 'meteor' ? 1.6 : 1;
      for (let i = 0; i < trailCount; i++) {
        const back = (i / trailCount) * dt;
        this.particles.spawn({
          x: p.pos.x - p.vel.x * back + this.rng.range(-0.1, 0.1) * big,
          y: p.pos.y - p.vel.y * back + this.rng.range(-0.1, 0.1) * big,
          z: p.pos.z - p.vel.z * back + this.rng.range(-0.1, 0.1) * big,
          vx: this.rng.range(-0.6, 0.6), vy: this.rng.range(0.4, 1.6), vz: this.rng.range(-0.6, 0.6),
          life: this.rng.range(0.25, 0.5) * big,
          r: 2.2, g: 0.8, b: 0.2, alpha: 0.7,
          size: this.rng.range(0.22, 0.4) * big, sizeEnd: 0.02,
          drag: 2,
        }, 0.8);
      }
      let done = p.age >= p.life;
      if (p.target && p.pos.distanceToSquared(p.target) < 0.5 * 0.5) done = true;
      if (p.kind === 'fireball' && p.pos.y < 0.15) done = true;
      if (done) {
        p.active = false;
        p.mesh.visible = false;
        const cb = p.onEnd;
        p.onEnd = null;
        if (p.kind === 'fireball') this.explode(p.pos.x, Math.max(0.4, p.pos.y), p.pos.z, 1);
        cb?.(p.pos.x, p.pos.y, p.pos.z);
      }
    }

    for (const b of this.bolts) {
      if (!b.active) continue;
      b.t += dt / b.duration;
      if (b.t >= 1) {
        b.active = false;
        b.core.visible = b.glow.visible = false;
        continue;
      }
      b.jitterTimer -= dt;
      if (b.jitterTimer <= 0) {
        b.jitterTimer = 0.045;
        b.seed++;
        this.buildBolt(b);
      }
      const fade = b.t < 0.15 ? 1 : 1 - (b.t - 0.15) / 0.85;
      (b.core.material as MeshBasicMaterial).opacity = fade;
      (b.glow.material as MeshBasicMaterial).opacity = 0.22 * fade;
    }

    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i]!;
      e.remaining -= dt;
      e.accumulator += e.rate * dt;
      while (e.accumulator >= 1) {
        e.accumulator -= 1;
        e.emit(this.particles);
      }
      if (e.remaining <= 0) this.emitters.splice(i, 1);
    }
  }

  private buildBolt(b: Bolt): void {
    const rng = new Rng(b.seed * 7919);
    const pts: Vec3[] = [];
    for (let i = 0; i < b.points.length - 1; i++) {
      const a = b.points[i]!;
      const c = b.points[i + 1]!;
      const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      // Perpendicular frame for jitter
      const px = -dz / len, pz = dx / len;
      for (let s = 0; s < BOLT_SUBDIV; s++) {
        const t = s / BOLT_SUBDIV;
        const amp = Math.sin(t * Math.PI) * Math.min(0.4, len * 0.14);
        const j1 = (rng.next() - 0.5) * 2 * amp;
        const j2 = (rng.next() - 0.5) * 2 * amp * 0.6;
        pts.push([a[0] + dx * t + px * j1, a[1] + dy * t + j2, a[2] + dz * t + pz * j1]);
      }
    }
    const last = b.points[b.points.length - 1]!;
    pts.push([last[0], last[1], last[2]]);
    this.writeRibbon(b.core, pts, 0.045);
    this.writeRibbon(b.glow, pts, 0.19);
  }

  private writeRibbon(mesh: Mesh, pts: Vec3[], halfWidth: number): void {
    const attr = mesh.geometry.getAttribute('position') as BufferAttribute;
    const arr = attr.array as Float32Array;
    let v = 0;
    const write = (x: number, y: number, z: number) => {
      arr[v++] = x; arr[v++] = y; arr[v++] = z;
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const c = pts[i + 1]!;
      // Ribbon faces the camera: offset = normalize(segment x toCamera)
      this.tmp.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      this.tmp2.set(this.camPos.x - a[0], this.camPos.y - a[1], this.camPos.z - a[2]);
      this.tmp.cross(this.tmp2).normalize().multiplyScalar(halfWidth);
      const ox = this.tmp.x, oy = this.tmp.y, oz = this.tmp.z;
      write(a[0] - ox, a[1] - oy, a[2] - oz);
      write(a[0] + ox, a[1] + oy, a[2] + oz);
      write(c[0] + ox, c[1] + oy, c[2] + oz);
      write(a[0] - ox, a[1] - oy, a[2] - oz);
      write(c[0] + ox, c[1] + oy, c[2] + oz);
      write(c[0] - ox, c[1] - oy, c[2] - oz);
    }
    attr.needsUpdate = true;
    mesh.geometry.setDrawRange(0, v / 3);
  }
}
