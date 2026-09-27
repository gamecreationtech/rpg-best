import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  FogExp2,
  HalfFloatType,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GradeShader } from './postfx';

export const BACKDROP = 0x06070c;

export interface ViewportOptions {
  canvas: HTMLCanvasElement;
  mobile: boolean;
  fog?: number;
  vignette?: number;
  ambient?: number;
}

/**
 * Renderer, scene, camera, moonlight with one shadow map, fog and the post chain.
 * Owns dynamic resolution: render scale drops before frame rate does.
 */
export class Viewport {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  private readonly composer: EffectComposer;
  private readonly grade: ShaderPass;
  readonly lookAt = new Vector3();
  readonly lookTarget = new Vector3();
  zoom = 1;
  zoomTarget = 1;
  readonly offset = new Vector3(0, 17.5, 13.5);
  private shake = 0;
  private readonly shakeVec = new Vector3();
  renderScale = 1;
  private readonly maxPixelRatio: number;
  /** Dynamic resolution bookkeeping: frames measured in the current window and how many were slow. */
  private windowFrames = 0;
  private windowSlow = 0;
  private windowTime = 0;
  private slowWindows = 0;
  private fastWindows = 0;
  private cooldown = 6;
  private lastW = 0;
  private lastH = 0;
  private lastDrawCalls = 0;
  readonly mobile: boolean;

  constructor(opts: ViewportOptions) {
    this.mobile = opts.mobile;
    this.renderer = new WebGLRenderer({ canvas: opts.canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.scene.background = new Color(BACKDROP);
    this.scene.fog = new FogExp2(BACKDROP, opts.fog ?? 0.026);
    this.camera = new PerspectiveCamera(30, 1, 0.5, 140);

    this.sun = new DirectionalLight(0x9db2e6, 7.5);
    this.sun.position.set(10, 24, 7);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 4; sc.far = 60;
    sc.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(opts.mobile ? 1024 : 2048, opts.mobile ? 1024 : 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new HemisphereLight(0x33405e, 0x0b0907, opts.ambient ?? 1.4);
    this.scene.add(this.hemi);

    const size = new Vector2();
    this.renderer.getSize(size);
    const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: opts.mobile ? 2 : 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(size, 0.42, 0.35, 1.0));
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    if (opts.vignette !== undefined) this.grade.uniforms.uVignette!.value = opts.vignette;
    this.composer.addPass(this.grade);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  kick(intensity: number): void {
    this.shake = Math.min(1, this.shake + intensity);
  }

  /**
   * The canvas always stays at full size; only the internal render targets scale.
   * Changing the canvas size makes browsers clear it, which shows as a black frame.
   */
  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w !== this.lastW || h !== this.lastH) {
      this.lastW = w;
      this.lastH = h;
      this.renderer.setPixelRatio(this.maxPixelRatio);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.fov = w < h ? 36 : 30;
      this.camera.updateProjectionMatrix();
    }
    const ratio = this.maxPixelRatio * this.renderScale;
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    (this.grade.uniforms.uResolution!.value as Vector2).set(w * ratio, h * ratio);
  }

  /**
   * Steps the internal resolution down only after two seconds where most frames
   * were slow, twice in a row, and back up only after a long calm stretch. A single
   * stutter (a shader compiling, a burst of effects) never triggers it.
   */
  private adaptQuality(dt: number): void {
    this.cooldown -= dt;
    this.windowTime += dt;
    this.windowFrames++;
    if (dt > 0.021) this.windowSlow++;
    if (this.windowTime < 2) return;
    const slowShare = this.windowSlow / Math.max(1, this.windowFrames);
    this.windowTime = 0;
    this.windowFrames = 0;
    this.windowSlow = 0;
    if (slowShare > 0.5) {
      this.slowWindows++;
      this.fastWindows = 0;
    } else if (slowShare < 0.05) {
      this.fastWindows++;
      this.slowWindows = 0;
    } else {
      this.slowWindows = 0;
      this.fastWindows = 0;
    }
    if (this.cooldown > 0) return;
    if (this.slowWindows >= 2 && this.renderScale > 0.6) {
      this.renderScale = Math.max(0.6, Math.round((this.renderScale - 0.1) * 10) / 10);
      this.slowWindows = 0;
      this.cooldown = 6;
      this.resize();
    } else if (this.fastWindows >= 5 && this.renderScale < 1) {
      this.renderScale = Math.min(1, Math.round((this.renderScale + 0.1) * 10) / 10);
      this.fastWindows = 0;
      this.cooldown = 10;
      this.resize();
    }
  }

  /** Compiles every material in the scene now, so nothing stutters the first time it appears. */
  precompile(): void {
    this.renderer.compile(this.scene, this.camera);
  }

  /** Moves the camera toward its target and keeps the shadow frustum centred on it. */
  update(dt: number, time: number): void {
    this.adaptQuality(dt);
    const k = 1 - Math.exp(-dt * 4);
    this.lookAt.lerp(this.lookTarget, k);
    this.zoom += (this.zoomTarget - this.zoom) * k;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 0.5;
    this.shakeVec.set(Math.sin(time * 61) * s, Math.sin(time * 47) * s * 0.6, Math.cos(time * 53) * s);
    this.camera.position.copy(this.lookAt).addScaledVector(this.offset, this.zoom).add(this.shakeVec);
    this.camera.lookAt(this.lookAt.x + this.shakeVec.x, this.lookAt.y, this.lookAt.z + this.shakeVec.z);
    this.sun.position.set(this.lookAt.x + 10, 24, this.lookAt.z + 7);
    this.sun.target.position.set(this.lookAt.x + 2, 0, this.lookAt.z);
    this.grade.uniforms.uTime!.value = time;
  }

  render(): void {
    this.lastDrawCalls = this.renderer.info.render.calls;
    this.renderer.info.reset();
    this.composer.render();
  }

  get drawCalls(): number {
    return this.lastDrawCalls;
  }

  /** Projects a world point to CSS pixels. Returns null when behind the camera. */
  project(x: number, y: number, z: number, out: { x: number; y: number }): boolean {
    const v = new Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return false;
    out.x = (v.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    return true;
  }

  /** Ground point under a screen position (y = 0 plane). */
  unproject(sx: number, sy: number, out: { x: number; z: number }): boolean {
    const ndc = new Vector3((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1, 0.5).unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    if (Math.abs(dir.y) < 1e-4) return false;
    const t = -this.camera.position.y / dir.y;
    if (t < 0) return false;
    out.x = this.camera.position.x + dir.x * t;
    out.z = this.camera.position.z + dir.z * t;
    return true;
  }
}
