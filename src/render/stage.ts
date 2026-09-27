import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  FogExp2,
  HalfFloatType,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PointLight,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { buildGround } from '../gen/ground';
import { buildBrazier, buildPillar, buildRubble, buildTombstone, buildWall } from '../gen/props';
import { Rng } from '../gen/rng';
import { createCharacterMaterials } from './characterMaterial';
import { GradeShader } from './postfx';

const BACKDROP = 0x06070c;

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
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly heroLight: PointLight;
  private readonly composer: EffectComposer;
  private readonly grade: ShaderPass;
  private readonly sun: DirectionalLight;
  private readonly torches: PointLight[] = [];
  private readonly torchBase: number[] = [];

  /** Where the camera looks. Smoothed toward `lookTarget`. */
  readonly lookAt = new Vector3(1.8, 0.8, 0);
  readonly lookTarget = new Vector3(1.8, 0.8, 0);
  /** Camera distance multiplier, smoothed toward `zoomTarget`. */
  zoom = 1;
  zoomTarget = 1;
  private readonly offset = new Vector3(0, 17.5, 13.5);
  private shake = 0;
  private readonly shakeVec = new Vector3();

  /** Dynamic resolution state. */
  renderScale = 1;
  private readonly maxPixelRatio: number;
  private frameAvg = 16.7;
  private scaleTimer = 0;

  constructor(private readonly opts: StageOptions) {
    this.renderer = new WebGLRenderer({ canvas: opts.canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, opts.mobile ? 2 : 2);

    this.scene.background = new Color(BACKDROP);
    this.scene.fog = new FogExp2(BACKDROP, 0.026);

    this.camera = new PerspectiveCamera(30, 1, 0.5, 140);

    // Moonlight with one shadow map
    this.sun = new DirectionalLight(0x9db2e6, 7.5);
    this.sun.position.set(10, 24, 7);
    this.sun.target.position.set(2, 0, 0);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 4; sc.far = 60;
    sc.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(opts.mobile ? 1024 : 2048, opts.mobile ? 1024 : 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(new HemisphereLight(0x33405e, 0x0b0907, 1.4));

    this.heroLight = new PointLight(0x9fd0ff, 5, 14, 2);
    this.heroLight.position.set(-4.5, 1.6, 0);
    this.scene.add(this.heroLight);

    this.buildSet();

    const size = new Vector2();
    this.renderer.getSize(size);
    const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: opts.mobile ? 2 : 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(size, 0.42, 0.35, 1.0));
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.resize();
    window.addEventListener('resize', () => this.resize());
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
    this.shake = Math.min(1, this.shake + intensity);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = this.maxPixelRatio * this.renderScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // Portrait phones see less width, so pull back a little
    this.camera.fov = w < h ? 36 : 30;
    this.camera.updateProjectionMatrix();
    (this.grade.uniforms.uResolution!.value as Vector2).set(w * ratio, h * ratio);
  }

  /** Steps render scale down when frames are slow and back up when there is headroom. */
  private adaptQuality(dt: number): void {
    const ms = dt * 1000;
    this.frameAvg += (ms - this.frameAvg) * 0.08;
    this.scaleTimer += dt;
    if (this.scaleTimer < 1) return;
    this.scaleTimer = 0;
    if (this.frameAvg > 19 && this.renderScale > 0.6) {
      this.renderScale = Math.max(0.6, this.renderScale - 0.1);
      this.resize();
    } else if (this.frameAvg < 13 && this.renderScale < 1) {
      this.renderScale = Math.min(1, this.renderScale + 0.1);
      this.resize();
    }
  }

  update(dt: number, time: number): void {
    this.adaptQuality(dt);
    // Torch flicker
    for (let i = 0; i < this.torches.length; i++) {
      const t = time * 9 + (this.torchBase[i] ?? 0);
      this.torches[i]!.intensity = 8 + Math.sin(t) * 1.0 + Math.sin(t * 2.7) * 0.7 + Math.sin(t * 7.1) * 0.5;
    }
    // Camera follow with smoothing and shake
    const k = 1 - Math.exp(-dt * 4);
    this.lookAt.lerp(this.lookTarget, k);
    this.zoom += (this.zoomTarget - this.zoom) * k;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 0.5;
    this.shakeVec.set(Math.sin(time * 61) * s, Math.sin(time * 47) * s * 0.6, Math.cos(time * 53) * s);
    this.camera.position.copy(this.lookAt).addScaledVector(this.offset, this.zoom).add(this.shakeVec);
    this.camera.lookAt(this.lookAt.x + this.shakeVec.x, this.lookAt.y, this.lookAt.z + this.shakeVec.z);
    // Keep the shadow frustum centred on the action
    this.sun.position.set(this.lookAt.x + 10, 24, this.lookAt.z + 7);
    this.sun.target.position.set(this.lookAt.x + 2, 0, this.lookAt.z);
    this.grade.uniforms.uTime!.value = time;
  }

  render(): void {
    this.lastDrawCalls = this.renderer.info.render.calls;
    this.renderer.info.reset();
    this.composer.render();
  }

  private lastDrawCalls = 0;

  get drawCalls(): number {
    return this.lastDrawCalls;
  }
}
