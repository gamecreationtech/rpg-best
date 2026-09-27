import {
  BoxGeometry,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PointLight,
  Quaternion,
  RingGeometry,
  Vector3,
  AdditiveBlending,
  DoubleSide,
  BufferGeometry,
  Float32BufferAttribute,
} from 'three';
import { MONSTER_RECIPES } from '../../gen/characters';
import { buildHero, heroLookKey, type HeroLook } from '../../gen/characters/heroes';
import { DUMMIES } from '../../data/dummies';
import { RARITIES } from '../../data/items';
import { PLEDGES } from '../../data/pledges';
import { SKILLS } from '../../data/skills';
import { ELEMENT_COLORS, type Element } from '../../data/stats';
import { buildBrazier, buildPillar, buildRubble } from '../../gen/props';
import { hash2, valueNoise } from '../../gen/rng';
import { buildArcanaOracle, buildBloodFountain, buildForge, buildPortal, buildStashChest, dummyRecipe, vendorRecipe } from '../../gen/townProps';
import { Tile, type TileMap } from '../../sim/map/tilemap';
import type { Enemy, ProjectileShape, SimEvent, Zone } from '../../sim/types';
import type { World } from '../../sim/world';
import { Clip, createCharacterMaterials } from '../characterMaterial';
import { Actor, Crowd } from '../crowd';
import { Effects } from '../effects';
import { ParticleSystem } from '../particles';
import { Viewport } from '../viewport';
import { DamageNumbers } from './damageNumbers';
import { DropLabels } from './dropLabels';
import { Minimap } from './minimap';

type Vec3 = [number, number, number];

function rgb(hex: number, scale = 1): Vec3 {
  const c = new Color(hex);
  return [c.r * scale, c.g * scale, c.b * scale];
}

function tileGround(map: TileMap, seed: number): BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const c = new Color();
  const stone = new Color(0x3c3c44);
  const earth = new Color(0x3a3128);
  const safe = new Color(0x364434);
  const wallFloor = new Color(0x18181e);
  for (let r = 0; r < map.rows; r++) {
    for (let q = 0; q < map.cols; q++) {
      const t = map.get(q, r);
      if (t === Tile.Wall) c.copy(wallFloor);
      else if (t === Tile.Safe) c.copy(safe).lerp(stone, valueNoise(q * 0.2, r * 0.2, seed) * 0.6);
      else c.copy(stone).lerp(earth, valueNoise(q * 0.12, r * 0.12, seed + 5));
      c.multiplyScalar(0.8 + hash2(q, r, seed + 1) * 0.4);
      const flip = hash2(q, r, seed + 3) > 0.5;
      const y = (v: number) => (t === Tile.Wall ? 0 : (v - 0.5) * 0.06);
      const y00 = y(hash2(q, r, seed + 7));
      const y10 = y(hash2(q + 1, r, seed + 7));
      const y01 = y(hash2(q, r + 1, seed + 7));
      const y11 = y(hash2(q + 1, r + 1, seed + 7));
      const tris: Vec3[][] = flip
        ? [[[q, y00, r], [q, y01, r + 1], [q + 1, y11, r + 1]], [[q, y00, r], [q + 1, y11, r + 1], [q + 1, y10, r]]]
        : [[[q, y00, r], [q, y01, r + 1], [q + 1, y10, r]], [[q + 1, y10, r], [q, y01, r + 1], [q + 1, y11, r + 1]]];
      for (const tri of tris) {
        const [a, b, d] = tri as [Vec3, Vec3, Vec3];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        const shade = 1 + (hash2(q * 2 + (flip ? 1 : 0), r * 2, seed + 21) - 0.5) * 0.1;
        for (const v of tri) {
          pos.push(v[0], v[1], v[2]);
          nrm.push(nx, ny, nz);
          col.push(c.r * shade, c.g * shade, c.b * shade);
        }
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

const SHAPE_GEOMETRY: Record<ProjectileShape, () => BufferGeometry> = {
  bolt: () => new IcosahedronGeometry(0.15, 1),
  ball: () => new IcosahedronGeometry(0.3, 1),
  dagger: () => new BoxGeometry(0.07, 0.07, 0.55),
  arrow: () => new BoxGeometry(0.05, 0.05, 0.75),
  hammer: () => new BoxGeometry(0.34, 0.24, 0.24),
  boulder: () => new IcosahedronGeometry(0.55, 1),
  enemy_bolt: () => new IcosahedronGeometry(0.17, 1),
};

/**
 * Draws a World: ground and walls from the tile map, town props, hero and enemy
 * crowds, projectiles, drops, zones, effects, damage numbers and the minimap.
 */
export class GameView {
  readonly view: Viewport;
  readonly particles: ParticleSystem;
  readonly effects: Effects;
  readonly numbers: DamageNumbers;
  readonly labels: DropLabels;
  readonly minimap: Minimap;
  private readonly areaGroup = new Group();
  private areaKey = '';
  private readonly enemyCrowds = new Map<string, Crowd>();
  private readonly enemyActors = new Map<number, Actor>();
  private readonly dying = new Set<number>();
  private readonly frozenUntil = new Map<number, number>();
  private heroCrowd: Crowd | null = null;
  private heroActor: Actor | null = null;
  private heroKey = '';
  private vendorActor: Actor | null = null;
  private readonly projectileMeshes = new Map<ProjectileShape, InstancedMesh>();
  private readonly dropMesh: InstancedMesh;
  private readonly coinMesh: InstancedMesh;
  private readonly zoneVisuals = new Map<number, Object3D[]>();
  private readonly auraDisc: Mesh;
  private readonly heroLight: PointLight;
  private readonly lights: PointLight[] = [];
  private beamTarget = -1;
  private time = 0;
  private readonly dummy = new Object3D();
  private readonly mat = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly ringGeo: RingGeometry;
  private readonly discGeo: CircleGeometry;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement, private readonly world: World, private readonly mobile: boolean, onPickDrop: (id: number) => void) {
    // Desktops see farther, so the fog thins to keep the far ground readable
    this.view = new Viewport({ canvas, mobile, fog: mobile ? 0.02 : 0.015, vignette: 0.42, ambient: 1.9 });
    this.particles = new ParticleSystem(mobile ? 6000 : 12000);
    this.view.scene.add(this.particles.mesh);
    this.effects = new Effects(this.view.scene, this.particles);
    this.effects.onKick = (k) => this.view.kick(k);
    this.numbers = new DamageNumbers(ui, this.view, 48);
    this.labels = new DropLabels(ui, this.view, onPickDrop);
    this.minimap = new Minimap(ui, world, mobile ? 112 : 200);
    this.view.scene.add(this.areaGroup);

    this.heroLight = new PointLight(0xffd0a0, 2, 11, 2);
    this.view.scene.add(this.heroLight);

    for (const recipe of MONSTER_RECIPES) this.addCrowd(recipe.id, new Crowd(recipe, 96));
    for (const d of DUMMIES) this.addCrowd(`dummy_${d.id}`, new Crowd(dummyRecipe(d.color), 1));
    const vendor = new Crowd(vendorRecipe, 1);
    this.addCrowd('vendor', vendor);

    for (const shape of Object.keys(SHAPE_GEOMETRY) as ProjectileShape[]) {
      const mesh = new InstancedMesh(SHAPE_GEOMETRY[shape](), new MeshBasicMaterial({ fog: false }), 96);
      (mesh.material as MeshBasicMaterial).color.setRGB(2.2, 2.2, 2.2);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      for (let i = 0; i < 96; i++) mesh.setColorAt(i, new Color(1, 1, 1));
      this.view.scene.add(mesh);
      this.projectileMeshes.set(shape, mesh);
    }
    const dropGeo = new BoxGeometry(0.36, 0.36, 0.36);
    this.dropMesh = new InstancedMesh(dropGeo, new MeshBasicMaterial({ fog: false }), 128);
    (this.dropMesh.material as MeshBasicMaterial).color.setRGB(1.5, 1.5, 1.5);
    for (let i = 0; i < 128; i++) this.dropMesh.setColorAt(i, new Color(1, 1, 1));
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    this.view.scene.add(this.dropMesh);
    this.coinMesh = new InstancedMesh(new IcosahedronGeometry(0.16, 0), new MeshBasicMaterial({ fog: false }), 128);
    (this.coinMesh.material as MeshBasicMaterial).color.setRGB(2.0, 1.5, 0.4);
    this.coinMesh.count = 0;
    this.coinMesh.frustumCulled = false;
    this.view.scene.add(this.coinMesh);

    this.ringGeo = new RingGeometry(0.9, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.discGeo = new CircleGeometry(1, 40);
    this.discGeo.rotateX(-Math.PI / 2);
    this.auraDisc = new Mesh(this.discGeo, new MeshBasicMaterial({ transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false }));
    this.auraDisc.position.y = 0.06;
    this.view.scene.add(this.auraDisc);

    this.rebuildArea();
    // Compile every shader now rather than during the first fight
    this.effects.withAllVisible(() => this.view.precompile());
    this.effects.warmup();
  }

  private addCrowd(key: string, crowd: Crowd): void {
    this.enemyCrowds.set(key, crowd);
    this.view.scene.add(crowd.mesh);
  }

  // ---------------------------------------------------------------- area

  private staticMesh(geometry: BufferGeometry, transforms: Matrix4[]): InstancedMesh {
    const { material, depthMaterial } = createCharacterMaterials();
    geometry.setAttribute('aAnim', new InstancedBufferAttribute(new Float32Array(transforms.length * 4), 4));
    const mesh = new InstancedMesh(geometry, material, transforms.length);
    mesh.customDepthMaterial = depthMaterial;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    transforms.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    this.areaGroup.add(mesh);
    return mesh;
  }

  private tf(x: number, z: number, yaw = 0, s = 1): Matrix4 {
    this.dummy.position.set(x, 0, z);
    this.dummy.rotation.set(0, yaw, 0);
    this.dummy.scale.setScalar(s);
    this.dummy.updateMatrix();
    return this.dummy.matrix.clone();
  }

  rebuildArea(): void {
    const key = this.world.area + ':' + this.world.map.cols;
    if (key === this.areaKey) return;
    this.areaKey = key;
    this.areaGroup.clear();
    for (const l of this.lights) this.view.scene.remove(l);
    this.lights.length = 0;
    for (const vis of this.zoneVisuals.values()) for (const o of vis) this.view.scene.remove(o);
    this.zoneVisuals.clear();
    this.labels.clear();
    const map = this.world.map;
    const seed = map.cols * 31 + map.rows;

    const ground = new Mesh(tileGround(map, seed), new MeshLambertMaterial({ vertexColors: true }));
    ground.receiveShadow = true;
    this.areaGroup.add(ground);

    // Walls as one instanced block mesh
    const wallTf: Matrix4[] = [];
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        if (map.get(c, r) !== Tile.Wall) continue;
        // Skip fully enclosed walls: nobody can see them
        if (map.get(c + 1, r) === Tile.Wall && map.get(c - 1, r) === Tile.Wall && map.get(c, r + 1) === Tile.Wall && map.get(c, r - 1) === Tile.Wall) continue;
        const h = 1.1 + hash2(c, r, seed + 40) * 0.6;
        this.dummy.position.set(c + 0.5, h / 2, r + 0.5);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, h, 1);
        this.dummy.updateMatrix();
        wallTf.push(this.dummy.matrix.clone());
      }
    }
    if (wallTf.length) {
      const wallMat = new MeshLambertMaterial({ color: 0x3a3a42 });
      const walls = new InstancedMesh(new BoxGeometry(1, 1, 1), wallMat, wallTf.length);
      walls.castShadow = true;
      walls.receiveShadow = true;
      wallTf.forEach((m, i) => {
        walls.setMatrixAt(i, m);
        const shade = 0.7 + hash2(i, 3, seed) * 0.5;
        walls.setColorAt(i, new Color(shade, shade, shade * 1.05));
      });
      walls.instanceMatrix.needsUpdate = true;
      this.areaGroup.add(walls);
    }

    const addLight = (x: number, z: number, color: number, intensity: number, dist: number) => {
      const l = new PointLight(color, intensity, dist, 2);
      l.position.set(x, 1.8, z);
      this.view.scene.add(l);
      this.lights.push(l);
    };

    if (this.world.area === 'town') {
      const t = this.world.town;
      this.staticMesh(buildStashChest(), [this.tf(t.stash.x, t.stash.z, 0.3)]);
      this.staticMesh(buildForge(), [this.tf(t.forge.x, t.forge.z, 0)]);
      this.staticMesh(buildBloodFountain(), [this.tf(t.bloodfountain.x, t.bloodfountain.z)]);
      this.staticMesh(buildArcanaOracle(), [this.tf(t.arcana.x, t.arcana.z)]);
      this.staticMesh(buildPortal(0xffd060), [this.tf(t.waypoint.x, t.waypoint.z)]);
      if (this.world.arenaVisited) this.staticMesh(buildPortal(0x6fa8ff, true), [this.tf(t.returnPortal.x, t.returnPortal.z)]);
      addLight(t.forge.x, t.forge.z, 0xff8a30, 10, 9);
      addLight(t.bloodfountain.x, t.bloodfountain.z, 0xff2a2a, 6, 8);
      addLight(t.arcana.x, t.arcana.z, 0xb066ff, 7, 9);
      addLight(t.waypoint.x, t.waypoint.z, 0xffd060, 7, 9);
      const brazierSpots: [number, number][] = [[6, 6], [38, 6], [6, 27], [38, 27], [22, 4]];
      this.staticMesh(buildBrazier(), brazierSpots.map(([x, z]) => this.tf(x + 0.5, z + 0.5)));
      for (const [x, z] of brazierSpots) addLight(x + 0.5, z + 0.5, 0xff7a2a, 8, 11);
      const pillars: Matrix4[] = [];
      for (let i = 0; i < 10; i++) {
        const x = 3 + ((i * 7) % 38);
        const z = i % 2 ? 3.5 : 29.5;
        pillars.push(this.tf(x + 0.5, z, i));
      }
      for (let i = 0; i < 6; i++) pillars.push(this.tf(i % 2 ? 3.5 : 40.5, 6 + i * 4, i * 1.3));
      this.staticMesh(buildPillar(2.6, 3), pillars);
      const rubble: Matrix4[] = [];
      for (let i = 0; i < 24; i++) rubble.push(this.tf(4 + ((i * 11) % 36) + 0.5, 4 + ((i * 7) % 25) + 0.5, i * 0.9, 0.5 + (i % 3) * 0.25));
      this.staticMesh(buildRubble(21), rubble);
      // The merchant
      const vendor = this.enemyCrowds.get('vendor')!;
      vendor.clear();
      this.vendorActor = vendor.spawn();
      this.vendorActor.x = t.vendor.x;
      this.vendorActor.z = t.vendor.z + 0.9;
      this.vendorActor.yaw = Math.PI;
      this.vendorActor.play(Clip.Idle);
      this.staticMesh(buildStashChest(), [this.tf(t.vendor.x - 1.2, t.vendor.z + 0.2, 0.2, 0.8), this.tf(t.vendor.x + 1.3, t.vendor.z + 0.1, -0.4, 0.7)]);
    } else {
      const s = this.world.arena!.spawn;
      this.staticMesh(buildPortal(0xb070ff, true), [this.tf(s.x - 2, s.z, Math.PI / 2)]);
      addLight(s.x - 2, s.z, 0xb070ff, 8, 10);
      const rubble: Matrix4[] = [];
      for (let i = 0; i < 60; i++) {
        const c = 3 + ((i * 13) % (map.cols - 6));
        const r = 3 + ((i * 29) % (map.rows - 6));
        if (map.get(c, r) !== Tile.Floor) continue;
        rubble.push(this.tf(c + 0.5, r + 0.5, i * 0.7, 0.6 + (i % 4) * 0.2));
      }
      if (rubble.length) this.staticMesh(buildRubble(11), rubble);
      this.enemyCrowds.get('vendor')!.clear();
      this.vendorActor = null;
    }
    this.view.lookAt.set(this.world.px, 0.8, this.world.pz);
    this.view.lookTarget.copy(this.view.lookAt);
  }

  // ---------------------------------------------------------------- sync

  private heroLook(): HeroLook {
    const p = this.world.player;
    const weapon = p.equipment.get('weapon')?.weapon?.type ?? null;
    const shieldItem = p.equipment.get('shield');
    const shield = shieldItem ? (shieldItem.baseId.includes('wooden') ? 'wooden' : 'iron') : null;
    return { classId: p.classId, pledgeId: p.pledgeId, weapon, shield };
  }

  private syncHero(dt: number): void {
    const look = this.heroLook();
    const key = heroLookKey(look);
    if (key !== this.heroKey) {
      const prevClip = this.heroActor?.clip ?? Clip.Idle;
      const prevPhase = this.heroActor?.phase ?? 0;
      if (this.heroCrowd) {
        this.view.scene.remove(this.heroCrowd.mesh);
        this.heroCrowd.dispose();
      }
      this.heroCrowd = new Crowd(buildHero(look), 1);
      this.view.scene.add(this.heroCrowd.mesh);
      this.heroActor = this.heroCrowd.spawn();
      this.heroActor.clip = prevClip;
      this.heroActor.phase = prevPhase;
      this.heroKey = key;
    }
    const a = this.heroActor!;
    const w = this.world;
    a.x = w.px;
    a.z = w.pz;
    a.yaw = w.pyaw;
    if (w.leap) {
      const k = w.leap.t / w.leap.duration;
      a.y = w.leap.arc ? Math.sin(Math.min(1, k) * Math.PI) * 1.6 : 0;
    } else {
      a.y = 0;
    }
    const oneShot = a.clip === Clip.Attack || a.clip === Clip.Cast || a.clip === Clip.Hit || a.clip === Clip.Die;
    if (w.playerDead) {
      if (a.clip !== Clip.Die) a.die();
    } else if (!oneShot) {
      const want = w.moving ? Clip.Walk : Clip.Idle;
      if (a.clip !== want) a.play(want);
    }
    const invisible = w.invisible;
    a.tint.setRGB(invisible ? 0.35 : 1, invisible ? 0.45 : 1, invisible ? 0.6 : 1);
    this.heroCrowd!.update(dt, this.time);
    this.heroLight.position.set(w.px, 2.6, w.pz + 0.4);
    this.heroLight.color.setHex(look.pledgeId ? PLEDGES[look.pledgeId]!.color : 0xffd0a0).lerp(new Color(0xffe0c0), 0.65);
    this.heroLight.intensity = w.area === 'arena' ? 3.2 : 2;

    // Aura for the strongest visible buff
    const buff = w.buffs.find((b) => b.id !== 'incense');
    const mat = this.auraDisc.material as MeshBasicMaterial;
    if (buff) {
      mat.color.setHex(buff.color).multiplyScalar(0.35);
      mat.opacity = 0.5 + Math.sin(this.time * 6) * 0.15;
      this.auraDisc.scale.setScalar(1.1);
      this.auraDisc.position.set(w.px, 0.06, w.pz);
    } else {
      mat.opacity = 0;
    }
  }

  private syncEnemies(dt: number): void {
    const w = this.world;
    for (const e of w.enemies) {
      const actor = this.enemyActors.get(e.id);
      if (!e.alive) {
        if (actor) {
          actor.crowd.release(actor);
          this.enemyActors.delete(e.id);
          this.dying.delete(e.id);
        }
        continue;
      }
      const key = e.dummy ? `dummy_${e.dummy.id}` : e.recipeId;
      let a = actor;
      if (!a || a.crowd.recipe.id !== this.enemyCrowds.get(key)?.recipe.id) {
        if (a) {
          a.crowd.release(a);
          this.enemyActors.delete(e.id);
        }
        const crowd = this.enemyCrowds.get(key);
        if (!crowd || crowd.actors.length >= crowd.capacity) continue;
        a = crowd.spawn();
        a.phaseOffset = Math.random();
        a.play(Clip.Idle);
        this.enemyActors.set(e.id, a);
      }
      a.x = e.x;
      a.z = e.z;
      a.yaw = e.yaw;
      a.scale = e.scale;
      if (e.dead) {
        if (!this.dying.has(e.id)) {
          this.dying.add(e.id);
          a.die();
        }
      } else {
        const oneShot = a.clip === Clip.Attack || a.clip === Clip.Hit;
        if (!oneShot) {
          const want = e.moving ? Clip.Walk : Clip.Idle;
          if (a.clip !== want) a.play(want);
        }
        const frozen = e.status.freeze > 0;
        const cursed = !!e.status.curse;
        const poisoned = !!e.status.poison;
        if (frozen) a.tint.setRGB(0.5, 0.8, 1.4);
        else if (cursed) a.tint.setRGB(0.9, 0.55, 1.2);
        else if (poisoned) a.tint.setRGB(0.6, 1.1, 0.6);
        else a.tint.setRGB(1, 1, 1);
        if (e.status.burn && Math.random() < dt * 14) this.effects.burst(e.x, 0.9 * e.scale, e.z, 1, 1, [2, 0.7, 0.2], 0.5, 0.18, { up: 1.5, priority: 0.4 });
        if (e.status.bleed && Math.random() < dt * 10) this.effects.burst(e.x, 1.0 * e.scale, e.z, 1, 1, [0.8, 0.1, 0.08], 0.5, 0.12, { gravity: 8, priority: 0.4 });
      }
    }
    for (const crowd of this.enemyCrowds.values()) crowd.update(dt, this.time);
  }

  private syncProjectiles(): void {
    const counts = new Map<ProjectileShape, number>();
    for (const p of this.world.projectiles) {
      if (!p.alive) continue;
      const mesh = this.projectileMeshes.get(p.shape)!;
      const i = counts.get(p.shape) ?? 0;
      if (i >= 96) continue;
      counts.set(p.shape, i + 1);
      const yaw = Math.atan2(p.vx, p.vz);
      this.v.set(p.x, p.y, p.z);
      if (p.shape === 'hammer') this.q.setFromAxisAngle(new Vector3(0, 1, 0), this.time * 14);
      else if (p.shape === 'boulder') this.q.setFromAxisAngle(new Vector3(1, 0, 0.4).normalize(), this.time * 6);
      else this.q.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
      this.mat.compose(this.v, this.q, new Vector3(1, 1, 1));
      mesh.setMatrixAt(i, this.mat);
      const c = ELEMENT_COLORS[p.element];
      mesh.setColorAt(i, new Color(p.owner === 'enemy' ? 0xff4a3a : p.shape === 'arrow' || p.shape === 'dagger' || p.shape === 'hammer' ? 0xe8e0d0 : c));
      if (p.shape === 'bolt' || p.shape === 'ball' || p.shape === 'boulder' || p.shape === 'enemy_bolt') {
        const col = rgb(p.owner === 'enemy' ? 0xff4a3a : c, 1.4);
        this.particles.spawn({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0.6, vz: 0, life: 0.35, r: col[0], g: col[1], b: col[2], alpha: 0.7, size: p.shape === 'ball' ? 0.45 : 0.25, sizeEnd: 0.02, drag: 2 }, 0.5);
      }
    }
    for (const [shape, mesh] of this.projectileMeshes) {
      mesh.count = counts.get(shape) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private syncDrops(): void {
    let items = 0;
    let coins = 0;
    for (const d of this.world.drops) {
      if (!d.alive) continue;
      const bob = 0.35 + Math.sin(this.time * 3 + d.id) * 0.06;
      if (d.item) {
        if (items >= 128) continue;
        this.v.set(d.x, bob, d.z);
        this.q.setFromAxisAngle(new Vector3(0.3, 1, 0.2).normalize(), this.time * 1.5 + d.id);
        this.mat.compose(this.v, this.q, new Vector3(1, 1, 1));
        this.dropMesh.setMatrixAt(items, this.mat);
        this.dropMesh.setColorAt(items, new Color(RARITIES[d.item.rarity].color));
        items++;
        if (d.item.rarity !== 'common' && Math.random() < 0.15) {
          const col = rgb(RARITIES[d.item.rarity].color, 1.5);
          this.particles.spawn({ x: d.x, y: 0.2, z: d.z, vx: 0, vy: 1.2, vz: 0, life: 1.2, r: col[0], g: col[1], b: col[2], alpha: 0.6, size: 0.14, sizeEnd: 0.02 }, 0.3);
        }
      } else {
        if (coins >= 128) continue;
        this.v.set(d.x, 0.2, d.z);
        this.q.setFromAxisAngle(new Vector3(0, 1, 0), this.time * 2 + d.id);
        this.mat.compose(this.v, this.q, new Vector3(1, 0.5, 1));
        this.coinMesh.setMatrixAt(coins, this.mat);
        coins++;
      }
    }
    this.dropMesh.count = items;
    this.dropMesh.instanceMatrix.needsUpdate = true;
    if (this.dropMesh.instanceColor) this.dropMesh.instanceColor.needsUpdate = true;
    this.coinMesh.count = coins;
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- zones

  private zoneColor(z: Zone): number {
    switch (z.type) {
      case 'fire_prison': return 0xff7a2a;
      case 'poison': return 0x66e070;
      case 'trap': return 0xa0a0b0;
      case 'spear_wall': return 0xd8d0c0;
      case 'void_trail': return 0x9a40ff;
      case 'sanctuary': return 0xffe87a;
      case 'wind': return 0x8fd0ff;
      case 'smoke': return 0x9090a0;
      case 'boulder': return 0xff9a40;
      case 'blizzard': return 0x9fe0ff;
      case 'storm': return 0x8fb0ff;
      default: return 0xffffff;
    }
  }

  private addZoneVisual(z: Zone): void {
    const objs: Object3D[] = [];
    const color = this.zoneColor(z);
    const ring = (radius: number, opacity: number, y = 0.08) => {
      const m = new Mesh(this.ringGeo, new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }));
      m.position.set(z.x, y, z.z);
      m.scale.setScalar(radius);
      objs.push(m);
      return m;
    };
    const disc = (radius: number, opacity: number) => {
      const m = new Mesh(this.discGeo, new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false }));
      m.position.set(z.x, 0.05, z.z);
      m.scale.setScalar(radius);
      objs.push(m);
      return m;
    };
    switch (z.type) {
      case 'fire_prison':
        ring(z.radius, 0.9);
        disc(z.radius, 0.12);
        break;
      case 'poison':
      case 'smoke':
        disc(z.radius, 0.25);
        break;
      case 'trap': {
        disc(z.radius, 0.35);
        const spikes = new InstancedMesh(new BoxGeometry(0.08, 0.3, 0.08), new MeshLambertMaterial({ color: 0x8a8a94 }), 6);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          spikes.setMatrixAt(i, this.tf(z.x + Math.cos(a) * z.radius * 0.8, z.z + Math.sin(a) * z.radius * 0.8));
        }
        spikes.castShadow = true;
        objs.push(spikes);
        break;
      }
      case 'spear_wall': {
        const spikes = new InstancedMesh(new BoxGeometry(0.12, 1.6, 0.12), new MeshLambertMaterial({ color: 0xa8a090 }), z.count);
        const px = -z.dz;
        const pz = z.dx;
        for (let k = 0; k < z.count; k++) {
          const t = z.count > 1 ? k / (z.count - 1) - 0.5 : 0;
          this.dummy.position.set(z.x + px * z.length * t, 0.7, z.z + pz * z.length * t);
          this.dummy.rotation.set(0.4 * -z.dz, 0, 0.4 * z.dx);
          this.dummy.scale.setScalar(1);
          this.dummy.updateMatrix();
          spikes.setMatrixAt(k, this.dummy.matrix.clone());
        }
        spikes.castShadow = true;
        objs.push(spikes);
        break;
      }
      case 'void_trail': {
        const m = new Mesh(new BoxGeometry(0.9, 0.05, z.length), new MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, fog: false }));
        m.position.set(z.x + z.dx * z.length * 0.5, 0.06, z.z + z.dz * z.length * 0.5);
        m.rotation.y = Math.atan2(z.dx, z.dz);
        objs.push(m);
        break;
      }
      case 'sanctuary':
        ring(z.radius, 0.6);
        disc(z.radius, 0.08);
        break;
      case 'wind':
        ring(z.radius, 0.3, 0.12);
        break;
      case 'boulder':
        ring(z.radius, 0.7);
        break;
      case 'blizzard':
      case 'storm':
        break;
    }
    for (const o of objs) this.view.scene.add(o);
    this.zoneVisuals.set(z.id, objs);
  }

  private syncZones(dt: number): void {
    for (const z of this.world.zones) {
      const objs = this.zoneVisuals.get(z.id);
      if (!objs) continue;
      if (z.followsPlayer) for (const o of objs) o.position.set(z.x, o.position.y, z.z);
      const pulse = 0.85 + Math.sin(this.time * 5 + z.id) * 0.15;
      for (const o of objs) if (o instanceof Mesh && o.geometry === this.ringGeo) o.scale.setScalar(z.radius * pulse);
      if (z.type === 'fire_prison' && Math.random() < dt * 40) {
        const a = Math.random() * Math.PI * 2;
        this.effects.burst(z.x + Math.cos(a) * z.radius, 0.2, z.z + Math.sin(a) * z.radius, 1, 0.5, [2.2, 0.8, 0.2], 0.6, 0.3, { up: 2, priority: 0.5 });
      }
      if ((z.type === 'poison' || z.type === 'smoke') && Math.random() < dt * 12) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * z.radius;
        const col = z.type === 'poison' ? [0.4, 1.3, 0.5] : [0.6, 0.6, 0.7];
        this.effects.burst(z.x + Math.cos(a) * r, 0.2, z.z + Math.sin(a) * r, 1, 0.3, col as Vec3, 1.4, 0.5, { up: 0.6, alpha: 0.35, priority: 0.4 });
      }
      if (z.type === 'wind' && Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        this.effects.burst(z.x + Math.cos(a) * z.radius * 0.9, 0.5 + Math.random(), z.z + Math.sin(a) * z.radius * 0.9, 1, 4, [0.6, 0.9, 1.4], 0.6, 0.15, { alpha: 0.5, priority: 0.4 });
      }
      if (z.type === 'sanctuary' && Math.random() < dt * 6) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * z.radius;
        this.effects.burst(z.x + Math.cos(a) * r, 0.1, z.z + Math.sin(a) * r, 1, 0.3, [2, 1.7, 0.7], 1.5, 0.12, { up: 1, priority: 0.4 });
      }
      if (z.type === 'storm' && Math.random() < dt * 4) {
        this.effects.burst(z.x + (Math.random() - 0.5) * 4, 5, z.z + (Math.random() - 0.5) * 4, 3, 1, [0.6, 0.7, 1.2], 0.4, 0.4, { alpha: 0.4, priority: 0.4 });
      }
    }
  }

  // ---------------------------------------------------------------- events

  handleEvent(ev: SimEvent): void {
    const w = this.world;
    switch (ev.type) {
      case 'damage': {
        if (ev.kind === 'dodge') this.numbers.show('dodge', ev.x, ev.y, ev.z, 'miss');
        else if (ev.kind === 'block') this.numbers.show('block', ev.x, ev.y, ev.z, 'miss');
        else if (ev.kind === 'absorb') this.numbers.show(String(ev.amount), ev.x, ev.y, ev.z, 'absorb');
        else if (ev.target === 'player') this.numbers.show(String(ev.amount), ev.x, ev.y, ev.z, 'player');
        else this.numbers.show(String(ev.amount), ev.x, ev.y, ev.z, ev.crit ? 'crit' : 'el-' + ev.element, ev.crit ? 1.1 : 0.8);
        break;
      }
      case 'heal':
        this.numbers.show('+' + ev.amount, w.px, 2.2, w.pz, 'heal');
        break;
      case 'enemy_hit': {
        const a = this.enemyActors.get(ev.id);
        if (a && a.clip !== Clip.Die && a.clip !== Clip.Attack) a.hit();
        else if (a) a.flash = 0.7;
        break;
      }
      case 'enemy_died': {
        const e = w.enemies[ev.id]!;
        this.effects.burst(ev.x, 0.8 * e.scale, ev.z, 26, 3.5, [0.9, 0.12, 0.08], 0.7, 0.18, { gravity: 8, up: 2.5, priority: 0.8 });
        break;
      }
      case 'enemy_attack': {
        const a = this.enemyActors.get(ev.id);
        if (a && a.clip !== Clip.Die) a.play(Clip.Attack);
        break;
      }
      case 'player_attack':
        this.heroActor?.play(Clip.Attack);
        break;
      case 'player_hit':
        if (this.heroActor) this.heroActor.flash = 0.5;
        this.view.kick(0.08);
        break;
      case 'player_died':
        this.heroActor?.die();
        this.effects.burst(w.px, 1, w.pz, 40, 3, [0.9, 0.12, 0.08], 0.9, 0.2, { gravity: 8, up: 3 });
        break;
      case 'player_respawn':
        this.heroActor?.play(Clip.Idle);
        this.effects.levelUp(w.px, w.pz);
        break;
      case 'cast': {
        const def = SKILLS[ev.skillId];
        const melee = def?.effect.kind === 'melee' || def?.effect.kind === 'mobility';
        this.heroActor?.play(melee ? Clip.Attack : Clip.Cast);
        const col = rgb(def && def.pledgeId ? PLEDGES[def.pledgeId]!.color : ELEMENT_COLORS[ev.element], 2);
        this.effects.flash(ev.x + ev.dirX * 0.6, 1.5, ev.z + ev.dirZ * 0.6, 0.45, 0.18, col[0], col[1], col[2]);
        break;
      }
      case 'melee_swing':
        this.effects.slash(ev.x, ev.z, ev.dirX, ev.dirZ, ev.range, ev.arc, rgb(ELEMENT_COLORS[ev.element], 1.6));
        break;
      case 'aoe':
        this.aoeVisual(ev.visual, ev.x, ev.z, ev.radius, ev.element);
        break;
      case 'projectile_hit': {
        const col = rgb(ELEMENT_COLORS[ev.element], 1.8);
        if (ev.splash > 0) this.effects.explode(ev.x, 0.6, ev.z, Math.max(0.5, ev.splash / 2.5));
        else this.effects.impact(ev.x, 1.0, ev.z, col, ev.shape === 'boulder' ? 2 : 1);
        break;
      }
      case 'zone_start':
        this.addZoneVisual(ev.zone);
        if (ev.zone.type === 'fire_prison') this.effects.ring(ev.zone.x, 0.1, ev.zone.z, ev.zone.radius, 0.4, 2.5, 1, 0.3);
        if (ev.zone.type === 'sanctuary') this.effects.ring(ev.zone.x, 0.1, ev.zone.z, ev.zone.radius, 0.6, 2.2, 1.8, 0.7);
        if (ev.zone.type === 'wind') this.effects.ring(ev.zone.x, 0.1, ev.zone.z, ev.zone.radius, 0.5, 0.6, 1.2, 2);
        break;
      case 'zone_tick':
        this.effects.iceImpact(ev.x, ev.z);
        break;
      case 'zone_end': {
        const objs = this.zoneVisuals.get(ev.id);
        if (objs) {
          for (const o of objs) this.view.scene.remove(o);
          this.zoneVisuals.delete(ev.id);
        }
        break;
      }
      case 'buff_start': {
        const col = rgb(ev.color, 1.6);
        this.effects.burst(w.px, 0.3, w.pz, 30, 2, col, 0.9, 0.2, { up: 2.5, drag: 1.5, priority: 0.8 });
        this.effects.ring(w.px, 0.1, w.pz, 1.6, 0.4, col[0], col[1], col[2]);
        break;
      }
      case 'leap':
        this.effects.stomp(ev.fromX, ev.fromZ, 0.9, [0.6, 0.55, 0.5]);
        break;
      case 'teleport': {
        const col = rgb(w.player.pledgeId ? PLEDGES[w.player.pledgeId]!.color : 0x9fd0ff, 1.8);
        this.effects.teleportPuff(ev.fromX, ev.fromZ, col);
        this.effects.teleportPuff(ev.toX, ev.toZ, col);
        break;
      }
      case 'beam':
        this.beamTarget = ev.on ? ev.targetId : -1;
        break;
      case 'level_up':
        this.effects.levelUp(w.px, w.pz);
        break;
      case 'pickup':
        if (ev.item) this.effects.burst(w.px, 0.6, w.pz, 8, 1.5, rgb(RARITIES[ev.item.rarity].color, 1.8), 0.6, 0.12, { up: 2, priority: 0.5 });
        break;
      case 'kick':
        this.view.kick(ev.k);
        break;
      case 'status': {
        const e = w.enemies[ev.id]!;
        if (ev.status === 'frozen') this.effects.burst(e.x, 0.9 * e.scale, e.z, 14, 2, [0.5, 1.2, 2], 0.6, 0.16, { drag: 2, priority: 0.6 });
        if (ev.status === 'stunned') this.effects.burst(e.x, 1.9 * e.scale, e.z, 6, 1, [2, 1.8, 0.6], 0.6, 0.12, { priority: 0.5 });
        break;
      }
      default:
        break;
    }
  }

  private aoeVisual(visual: string, x: number, z: number, radius: number, element: Element): void {
    switch (visual) {
      case 'stomp':
        this.effects.stomp(x, z, radius, [1.2, 1.0, 0.7]);
        break;
      case 'nova_cold':
        this.effects.frostNova(x, 0, z, radius);
        break;
      case 'nova_poison':
        this.effects.poisonNova(x, z, radius);
        break;
      case 'boulder':
        this.effects.explode(x, 0.5, z, 1.4);
        this.effects.stomp(x, z, radius, [0.9, 0.7, 0.5]);
        break;
      case 'lightning':
        this.effects.lightningStrike(x, z);
        break;
      case 'arrow_rain':
        this.effects.arrowRain(x, z, Math.min(radius, 10));
        break;
      case 'trap':
        this.effects.impact(x, 0.4, z, [1.6, 1.5, 1.3], 1.6);
        break;
      case 'curse':
        this.effects.curse(x, z, radius);
        break;
      default:
        this.effects.impact(x, 0.6, z, rgb(ELEMENT_COLORS[element], 1.8));
    }
  }

  // ---------------------------------------------------------------- frame

  update(dt: number, time: number): void {
    this.time = time;
    this.rebuildArea();
    const w = this.world;
    // Camera: follow the player with a small lead in the walking direction
    const lead = w.moving ? 0.8 : 0;
    this.view.lookTarget.set(w.px + Math.sin(w.pyaw) * lead, 0.8, w.pz + Math.cos(w.pyaw) * lead + (window.innerHeight > window.innerWidth ? 1.6 : 0.4));
    // Desktops have the pixels for a wider view; phones stay closer so things are tappable
    const desktop = !this.mobile && window.innerWidth >= 900;
    this.view.zoomTarget = (w.area === 'arena' ? 1.0 : 0.9) * (window.innerHeight > window.innerWidth ? 1.25 : 1) * (desktop ? 1.45 : 1);
    this.syncHero(dt);
    this.syncEnemies(dt);
    this.syncProjectiles();
    this.syncDrops();
    this.syncZones(dt);
    if (this.vendorActor) this.enemyCrowds.get('vendor')!.update(dt, time);
    if (this.beamTarget >= 0) {
      const t = w.enemies[this.beamTarget];
      if (t && t.alive && !t.dead) this.effects.beamSet([w.px, 1.6, w.pz], [t.x, 1.0 * t.scale, t.z], [0.5, 2.0, 0.7]);
    }
    this.effects.update(dt, this.view.camera);
    this.view.update(dt, time);
    this.particles.update(time, this.view.camera);
    this.numbers.update(dt);
    this.labels.update(w.drops);
    this.minimap.update(dt);
  }

  render(): void {
    this.view.render();
  }

  /** Nearest enemy to a screen point, within `px` pixels. */
  pickEnemy(sx: number, sy: number, px = 44): Enemy | null {
    let best: Enemy | null = null;
    let bestD = px * px;
    const out = { x: 0, y: 0 };
    for (const e of this.world.enemies) {
      if (!e.alive || e.dead) continue;
      if (!this.view.project(e.x, 0.9 * e.scale, e.z, out)) continue;
      const d = (out.x - sx) ** 2 + (out.y - sy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Nearest interactable to a screen point. */
  pickInteractable(sx: number, sy: number, px = 48): number {
    let best = -1;
    let bestD = px * px;
    const out = { x: 0, y: 0 };
    for (const it of this.world.interactables) {
      if (!it.active) continue;
      if (!this.view.project(it.x, 0.8, it.z, out)) continue;
      const d = (out.x - sx) ** 2 + (out.y - sy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = it.id;
      }
    }
    return best;
  }
}
