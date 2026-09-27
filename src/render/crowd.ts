import { Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Object3D, Quaternion, Vector3, type BufferGeometry } from 'three';
import type { CharacterRecipe } from '../gen/characters';
import { CLIP_DURATION, CLIP_LOOPS, Clip, createCharacterMaterials, type ClipId } from './characterMaterial';

/** One character instance inside a Crowd. Pure data; the Crowd owns the GPU buffers. */
export class Actor {
  x = 0;
  y = 0;
  z = 0;
  /** Facing angle around Y. 0 faces +z (toward the camera). */
  yaw = 0;
  scale = 1;
  clip: ClipId = Clip.Idle;
  phase = 0;
  /** 0..1 white flash, decays on its own. */
  flash = 0;
  tint = new Color(1, 1, 1);
  /** Extra time offset so crowds do not animate in lockstep. */
  phaseOffset = 0;
  dead = false;
  /** Called when a one-shot clip finishes. */
  onClipEnd: ((actor: Actor) => void) | null = null;

  constructor(public readonly crowd: Crowd, public readonly slot: number) {}

  play(clip: ClipId): void {
    this.clip = clip;
    this.phase = 0;
    this.dead = false;
  }

  hit(): void {
    if (this.clip === Clip.Die) return;
    this.flash = 0.8;
    this.play(Clip.Hit);
  }

  die(): void {
    if (this.clip === Clip.Die) return;
    this.flash = 0.6;
    this.play(Clip.Die);
  }

  /** Advances the clip. Loops looping clips and returns to idle after one-shots. */
  update(dt: number): void {
    const duration = CLIP_DURATION[this.clip];
    this.phase += dt / duration;
    this.flash = Math.max(0, this.flash - dt * 9);
    if (CLIP_LOOPS[this.clip]) {
      this.phase %= 1;
      return;
    }
    if (this.phase >= 1) {
      if (this.clip === Clip.Die) {
        this.phase = 1;
        this.dead = true;
      } else {
        this.clip = Clip.Idle;
        this.phase = 0;
      }
      this.onClipEnd?.(this);
    }
  }
}

const dummy = new Object3D();
const mat = new Matrix4();
const pos = new Vector3();
const quat = new Quaternion();
const scl = new Vector3();

/** All instances of one character recipe, drawn in a single draw call. */
export class Crowd {
  readonly mesh: InstancedMesh;
  readonly actors: Actor[] = [];
  private readonly anim: InstancedBufferAttribute;
  private readonly geometry: BufferGeometry;

  constructor(public readonly recipe: CharacterRecipe, public readonly capacity: number) {
    this.geometry = recipe.build();
    const { material, depthMaterial } = createCharacterMaterials();
    this.anim = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.anim.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('aAnim', this.anim);

    this.mesh = new InstancedMesh(this.geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.customDepthMaterial = depthMaterial;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // Allocate the colour buffer up front so tints work from the first frame.
    for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, new Color(1, 1, 1));
    this.mesh.instanceColor!.setUsage(DynamicDrawUsage);
  }

  spawn(): Actor {
    if (this.actors.length >= this.capacity) throw new Error(`Crowd ${this.recipe.id} is full`);
    const actor = new Actor(this, this.actors.length);
    this.actors.push(actor);
    return actor;
  }

  /** Removes every actor. */
  clear(): void {
    this.actors.length = 0;
    this.mesh.count = 0;
  }

  update(dt: number, time: number): void {
    const hoverLift = this.recipe.hover ? 0.45 : 0;
    const arr = this.anim.array as Float32Array;
    let count = 0;
    for (const a of this.actors) {
      a.update(dt);
      const hover = this.recipe.hover ? Math.sin(time * 1.7 + a.phaseOffset * 6.28) * 0.08 : 0;
      pos.set(a.x, a.y + hoverLift + hover, a.z);
      quat.setFromAxisAngle(dummy.up, a.yaw);
      scl.setScalar(a.scale);
      mat.compose(pos, quat, scl);
      this.mesh.setMatrixAt(count, mat);
      this.mesh.setColorAt(count, a.tint);
      const o = count * 4;
      arr[o] = a.clip;
      arr[o + 1] = CLIP_LOOPS[a.clip] ? (a.phase + a.phaseOffset) % 1 : a.phase;
      arr[o + 2] = a.flash;
      arr[o + 3] = 0;
      count++;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.anim.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as { dispose(): void }).dispose();
    this.mesh.customDepthMaterial?.dispose();
  }
}
