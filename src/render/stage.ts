import { InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Object3D, PointLight, Vector3, type BufferGeometry } from 'three';
import { buildGround } from '../gen/ground';
import { buildBrazier, buildPillar, buildRubble, buildTombstone, buildWall } from '../gen/props';
import { Rng } from '../gen/rng';
import { createCharacterMaterials } from './characterMaterial';
import { Viewport } from './viewport';


export interface StageOptions {
  canvas: HTMLCanvasElement;
  /** Fewer shadow texels and MSAA samples on phones. */
  mobile: boolean;
}

/**
 * Scene, camera, lights, ground, props and the post-processing chain. Also owns
 * dynamic resolution: it lowers render scale before it lets the frame rate drop.
 */
export class Stage {
  readonly view: Viewport;
  readonly heroLight: PointLight;
  private readonly torches: PointLight[] = [];
  private readonly torchBase: number[] = [];

  constructor(opts: StageOptions) {
    this.view = new Viewport({ canvas: opts.canvas, mobile: opts.mobile });
    this.view.lookAt.set(1.8, 0.8, 0);
    this.view.lookTarget.set(1.8, 0.8, 0);
    this.heroLight = new PointLight(0x9fd0ff, 5, 14, 2);
    this.heroLight.position.set(-4.5, 1.6, 0);
    this.scene.add(this.heroLight);
    this.buildSet();
  }

  get scene() {
    return this.view.scene;
  }
  get camera() {
    return this.view.camera;
  }
  get renderer() {
    return this.view.renderer;
  }
  get lookTarget() {
    return this.view.lookTarget;
  }
  get lookAt() {
    return this.view.lookAt;
  }
  set zoomTarget(v: number) {
    this.view.zoomTarget = v;
  }
  get zoomTarget() {
    return this.view.zoomTarget;
  }
  get renderScale() {
    return this.view.renderScale;
  }

  private buildSet(): void {
    const ground = new Mesh(buildGround(90, 1.5, 7), new MeshLambertMaterial({ vertexColors: true }));
    ground.receiveShadow = true;
    this.scene.add(ground);

    const rng = new Rng(99);
    const placeInstanced = (geometry: BufferGeometry, transforms: Matrix4[]) => {
      const { material, depthMaterial } = createCharacterMaterials();
      const anim = new InstancedBufferAttribute(new Float32Array(transforms.length * 4), 4);
      geometry.setAttribute('aAnim', anim);
      const mesh = new InstancedMesh(geometry, material, transforms.length);
      mesh.customDepthMaterial = depthMaterial;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      transforms.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
      return mesh;
    };
    const tf = (x: number, z: number, yaw = 0, s = 1) => {
      const o = new Object3D();
      o.position.set(x, 0, z);
      o.rotation.y = yaw;
      o.scale.setScalar(s);
      o.updateMatrix();
      return o.matrix.clone();
    };

    // Back wall and a side ruin
    placeInstanced(buildWall(14, 3.2, 3), [tf(-6, -8.5)]);
    placeInstanced(buildWall(12, 2.4, 4), [tf(13, -8.8, -0.12)]);

    // Pillars: a colonnade behind the stage and flanks
    const pillarSpots: [number, number, number][] = [
      [-10, -6, 3.6], [-7, -7.5, 2.2], [3, -7.2, 4.2], [8, -6.8, 1.6], [13, -6, 3.0],
      [-12, 2, 2.6], [17, 3, 1.4], [16, -2, 3.8],
    ];
    for (const [x, z, h] of pillarSpots) {
      placeInstanced(buildPillar(h, Math.round(x * 13 + z * 7)), [tf(x, z, rng.range(0, 6.28))]);
    }

    // Tombstones and rubble scattered outside the stage line
    const tombs: Matrix4[] = [];
    for (let i = 0; i < 14; i++) {
      const x = rng.range(-16, 20);
      const z = rng.range(-6, 12);
      if (Math.abs(z) < 2.6 && x > -8 && x < 12) continue;
      tombs.push(tf(x, z, rng.range(-0.4, 0.4), rng.range(0.8, 1.2)));
    }
    placeInstanced(buildTombstone(5), tombs.slice(0, 7));
    placeInstanced(buildTombstone(6), tombs.slice(7));
    const rubble: Matrix4[] = [];
    for (let i = 0; i < 40; i++) {
      const x = rng.range(-18, 22);
      const z = rng.range(-8, 14);
      if (Math.abs(z) < 2.2 && x > -8 && x < 12) continue;
      rubble.push(tf(x, z, rng.range(0, 6.28), rng.range(0.6, 1.4)));
    }
    placeInstanced(buildRubble(8), rubble.slice(0, 20));
    placeInstanced(buildRubble(9), rubble.slice(20));

    // Braziers flanking the stage, each with a flickering warm light
    const brazierSpots: [number, number][] = [[-8.5, 3.5], [12.5, 3.5], [-3, -5.5], [7.5, -5.5]];
    placeInstanced(buildBrazier(), brazierSpots.map(([x, z]) => tf(x, z)));
    for (const [x, z] of brazierSpots) {
      const light = new PointLight(0xff7a2a, 9, 12, 2);
      light.position.set(x, 1.6, z);
      this.scene.add(light);
      this.torches.push(light);
      this.torchBase.push(rng.range(0, 100));
    }
  }

  get torchPositions(): Vector3[] {
    return this.torches.map((t) => t.position);
  }

  kick(intensity: number): void {
    this.view.kick(intensity);
  }

  update(dt: number, time: number): void {
    for (let i = 0; i < this.torches.length; i++) {
      const t = time * 9 + (this.torchBase[i] ?? 0);
      this.torches[i]!.intensity = 8 + Math.sin(t) * 1.0 + Math.sin(t * 2.7) * 0.7 + Math.sin(t * 7.1) * 0.5;
    }
    this.view.update(dt, time);
  }

  render(): void {
    this.view.render();
  }

  get drawCalls(): number {
    return this.view.drawCalls;
  }
}
