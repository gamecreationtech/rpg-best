export interface Light {
  /** Frame pixels. */
  x: number;
  y: number;
  radius: number;
  /** Negative for a shadow that darkens its pool instead of lighting it. */
  intensity: number;
  r: number;
  g: number;
  b: number;
}

export const MAX_LIGHTS = 48;

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uSize;
uniform int uCount;
uniform vec4 uLights[${MAX_LIGHTS}];
uniform vec3 uColors[${MAX_LIGHTS}];
uniform float uDarkness;
uniform vec3 uAmbient;
uniform float uDither;
uniform float uLevels;
uniform float uTint;
uniform float uDim;
in vec2 vUv;
out vec4 outColor;
const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  vec3 c = texture(uScene, vec2(vUv.x, vUv.y)).rgb;
  float lit = 0.0;
  vec3 tint = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uCount) break;
    vec4 L = uLights[i];
    // Light pools are twice as wide as tall, like everything on the floor
    vec2 d = (p - L.xy) * vec2(1.0, 2.0) / L.z;
    float f = max(0.0, 1.0 - length(d));
    f = f * f * L.w;
    lit += f;
    tint += f * uColors[i];
  }
  // A light with a negative intensity is a shadow: it pulls the floor of the brightness down
  float l = clamp(lit, -0.7, 1.0);
  float b = max(0.0, ((1.0 - uDarkness) + uDarkness * l) * mix(1.0, 0.4, uDim));
  float lp = max(0.0, l);
  vec3 t = lit > 0.0 ? mix(vec3(1.0), tint / lit, lp * uTint) : vec3(1.0);
  vec3 amb = mix(uAmbient, vec3(1.0), lp);
  if (uDither > 0.5) {
    int bx = int(mod(floor(p.x), 4.0));
    int by = int(mod(floor(p.y), 4.0));
    float th = BAYER[by * 4 + bx] / 16.0;
    b = floor(b * uLevels + th) / uLevels;
  }
  outColor = vec4(c * b * t * amb, 1.0);
}`;

const BLIT_FRAG = `#version 300 es
precision mediump float;
uniform sampler2D uLit;
in vec2 vUv;
out vec4 outColor;
void main() {
  outColor = texture(uLit, vUv);
}`;

/**
 * Puts the low-resolution frame on the screen: uploads it as a texture, lights it
 * with a handful of point lights and quantises the light into dithered bands,
 * all at frame size, then scales the lit frame up by a whole number of device
 * pixels with nearest-neighbour sampling into a canvas sized in device pixels.
 * Falls back to a plain 2D copy without lighting where WebGL2 is unavailable.
 */
export class Compositor {
  private gl: WebGL2RenderingContext | null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private program: WebGLProgram | null = null;
  private blitProgram: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  /** The lit frame, rendered off screen at frame size. */
  private lit: WebGLTexture | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private litW = 0;
  private litH = 0;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private readonly lightData = new Float32Array(MAX_LIGHTS * 4);
  private readonly colorData = new Float32Array(MAX_LIGHTS * 3);
  readonly lights: Light[] = [];
  darkness = 0.7;
  ambient: [number, number, number] = [0.85, 0.88, 1.0];
  dither = true;
  levels = 6;
  tint = 0.6;
  dim = 0;
  background: [number, number, number] = [0, 0, 0];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (this.gl) this.setup(this.gl);
    else this.ctx2d = canvas.getContext('2d');
  }

  get hardware(): boolean {
    return !!this.gl;
  }

  private setup(gl: WebGL2RenderingContext): void {
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
      return sh;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    this.program = program;
    gl.useProgram(program);
    for (const name of ['uScene', 'uSize', 'uCount', 'uLights', 'uColors', 'uDarkness', 'uAmbient', 'uDither', 'uLevels', 'uTint', 'uDim']) this.uniforms.set(name, gl.getUniformLocation(program, name));
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const nearest = () => {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    nearest();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    // The blit: the lit frame to the screen, one fetch per device pixel
    const blit = gl.createProgram()!;
    gl.attachShader(blit, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(blit, compile(gl.FRAGMENT_SHADER, BLIT_FRAG));
    gl.linkProgram(blit);
    if (!gl.getProgramParameter(blit, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(blit) ?? 'link');
    this.blitProgram = blit;
    const blitLoc = gl.getAttribLocation(blit, 'aPos');
    gl.enableVertexAttribArray(blitLoc);
    gl.vertexAttribPointer(blitLoc, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(blit);
    gl.uniform1i(gl.getUniformLocation(blit, 'uLit'), 0);
    this.lit = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.lit);
    nearest();
    this.fbo = gl.createFramebuffer();
    gl.uniform1i(this.uniforms.get('uScene')!, 0);
  }

  /**
   * Draws `frame` scaled by `scale` CSS pixels at (offsetX, offsetY). The
   * canvas is sized in device pixels, so the scale lands on whole device
   * pixels as the camera arranged.
   */
  present(frame: HTMLCanvasElement, scale: number, offsetX: number, offsetY: number): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(W * dpr);
    const bh = Math.round(H * dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    const ox = Math.round(offsetX * dpr);
    const oy = Math.round(offsetY * dpr);
    const ow = Math.round(frame.width * scale * dpr);
    const oh = Math.round(frame.height * scale * dpr);
    const gl = this.gl;
    if (!gl) {
      const c = this.ctx2d;
      if (!c) return;
      c.imageSmoothingEnabled = false;
      c.fillStyle = '#000';
      c.fillRect(0, 0, bw, bh);
      c.drawImage(frame, ox, oy, ow, oh);
      return;
    }
    // Pass 1: light the frame at its own size, off screen
    if (this.litW !== frame.width || this.litH !== frame.height) {
      this.litW = frame.width;
      this.litH = frame.height;
      gl.bindTexture(gl.TEXTURE_2D, this.lit);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, frame.width, frame.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.lit, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, frame.width, frame.height);
    gl.clearColor(this.background[0], this.background[1], this.background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    const n = Math.min(MAX_LIGHTS, this.lights.length);
    for (let i = 0; i < n; i++) {
      const l = this.lights[i]!;
      this.lightData[i * 4] = l.x;
      this.lightData[i * 4 + 1] = l.y;
      this.lightData[i * 4 + 2] = Math.max(1, l.radius);
      this.lightData[i * 4 + 3] = l.intensity;
      this.colorData[i * 3] = l.r;
      this.colorData[i * 3 + 1] = l.g;
      this.colorData[i * 3 + 2] = l.b;
    }
    gl.uniform2f(this.uniforms.get('uSize')!, frame.width, frame.height);
    gl.uniform1i(this.uniforms.get('uCount')!, n);
    gl.uniform4fv(this.uniforms.get('uLights')!, this.lightData);
    gl.uniform3fv(this.uniforms.get('uColors')!, this.colorData);
    gl.uniform1f(this.uniforms.get('uDarkness')!, this.darkness);
    gl.uniform3f(this.uniforms.get('uAmbient')!, this.ambient[0], this.ambient[1], this.ambient[2]);
    gl.uniform1f(this.uniforms.get('uDither')!, this.dither ? 1 : 0);
    gl.uniform1f(this.uniforms.get('uLevels')!, this.levels);
    gl.uniform1f(this.uniforms.get('uTint')!, this.tint);
    gl.uniform1f(this.uniforms.get('uDim')!, this.dim);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // Pass 2: the lit frame to the screen. It fills its scaled rectangle; the rest keeps the clear colour
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bw, bh);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.blitProgram);
    gl.bindTexture(gl.TEXTURE_2D, this.lit);
    gl.viewport(ox, bh - oy - oh, ow, oh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
