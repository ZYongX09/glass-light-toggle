/**
 * <glass-light-toggle> — 玻璃质感日/夜开关（Web Component）
 *
 * 1:1 复刻 https://experiments.thisiswhitespace.com/glass-light-toggle（原作 Zsolt Kacso）。
 * 结构：CPU 端弹簧像素图形（离屏 2D canvas 光栅化）→ 作为纹理，
 *       由单个 WebGL2 片元着色器完成玻璃、折射、磨砂与 LED 散射的全部光学效果。
 * 零依赖；仅要求浏览器支持 WebGL2。
 *
 * 用法：
 *   <script type="module" src="./glass-light-toggle.js"></script>
 *   <glass-light-toggle style="width:560px;height:400px"></glass-light-toggle>
 *
 * 特性：点击 / 拖拽 / 键盘（空格、回车、左右方向键）；change / themechange 事件；
 *       checked / zoom / path / moon-color / sun-color / hint / label 属性。
 */

// ---------------------------------------------------------------- layout
const TRACK = { w: 432, h: 224, r: 72 };
const PAD = 13;
const KNOB_HALF = (TRACK.h - PAD * 2) / 2; // 99
const KNOB_R = 58;
const GRID = 17, C0 = 8, PITCH = 5.7, PSIZE = 4.6;

// ---------------------------------------------------------------- icons
function buildMoon() {
  const out = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const dx = x - C0, dy = y - C0;
    const inMain = dx * dx + dy * dy <= 6.6 * 6.6;
    const sx = x - 11.3, sy = y - 5.6;
    const inShadow = sx * sx + sy * sy <= 5.4 * 5.4;
    if (inMain && !inShadow) out.push({ x, y, b: 1, kind: 'lit' });
    else if (inMain && inShadow && (x + y) % 2 === 0) out.push({ x, y, b: 0.2, kind: 'earth' });
  }
  for (const c of out) if ((c.x === 3 && c.y === 9) || (c.x === 6 && c.y === 12) || (c.x === 4 && c.y === 12)) c.b = 0.5;
  const stars = [[15, 1, 1], [14, 1, 0.45], [16, 1, 0.45], [15, 0, 0.45], [15, 2, 0.45], [11, 0, 0.75], [16, 5, 0.6]];
  for (const [x, y, b] of stars) out.push({ x, y, b, kind: 'star' });
  return out;
}

function buildSun() {
  const m = new Map();
  const add = (x, y, b, kind, ang = 0) => { const k = x + ',' + y; if (!m.has(k)) m.set(k, { x, y, b, kind, ang }); };
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const dx = x - C0, dy = y - C0;
    if (dx * dx + dy * dy <= 3.7 * 3.7) add(x, y, 1, 'core');
  }
  for (let a = 0; a < 8; a++) {
    const ang = a * Math.PI / 4;
    const rs = a % 2 ? [5.9, 7.2] : [5.6, 6.6, 7.6];
    for (const r of rs) add(Math.round(C0 + Math.cos(ang) * r), Math.round(C0 + Math.sin(ang) * r), 1, 'ray', ang);
  }
  return [...m.values()];
}

const MOON = buildMoon();
const SUN = buildSun();

const angKey = c => {
  const a = Math.atan2(c.y - C0, c.x - C0);
  return ((a + Math.PI * 0.75 + Math.PI * 2) % (Math.PI * 2)) + Math.hypot(c.x - C0, c.y - C0) * 1e-3;
};
const rnd = (a, b) => a + Math.random() * (b - a);

// Pair moon pixels with sun pixels by sweeping angle, so the morph reads as one coherent swirl.
function pairUp() {
  const A = [...MOON].sort((p, q) => angKey(p) - angKey(q));
  const B = [...SUN].sort((p, q) => angKey(p) - angKey(q));
  const pairs = [];
  const big = A.length >= B.length ? A : B, small = big === A ? B : A;
  let last = -1;
  for (let i = 0; i < big.length; i++) {
    const j = Math.floor(i * small.length / big.length);
    const first = j !== last; last = j;
    const s = { ...small[j], b: first ? small[j].b : 0 };
    pairs.push(big === A ? [big[i], s] : [s, big[i]]);
  }
  return pairs.map(([a, b]) => {
    const lead = 1 - a.x / (GRID - 1); // right-hand pixels lead when travelling right
    return {
      a, b,
      delay: 0.04 + lead * 0.26 + rnd(0, 0.06),
      curl: rnd(-1, 1) * 16 + (a.y - C0) * 0.9,
      lift: rnd(2, 12),
      k: rnd(260, 460),
      drag: rnd(0.004, 0.016),
      phase: rnd(0, Math.PI * 2),
      tw: rnd(1.5, 3.2),
      x: 0, y: 0, vx: 0, vy: 0, inited: false,
    };
  });
}

// ---------------------------------------------------------------- pixel canvases
const HAS_FILTER = (() => {
  const c = document.createElement('canvas').getContext('2d');
  return typeof c.filter === 'string' && (c.filter = 'blur(1px)', c.filter === 'blur(1px)');
})();

// ---------------------------------------------------------------- helpers
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

function inRoundRect(x, y, hx0, hy0, hw, hh, r) {
  const qx = Math.abs(x - hx0) - hw + r, qy = Math.abs(y - hy0) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0;
}

function compileShader(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

// ---------------------------------------------------------------- GL
const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

const FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes; uniform float uDpr; uniform float uScale;
uniform vec2 uC; uniform vec2 uTH; uniform float uTR;
uniform vec2 uK; uniform vec2 uKH; uniform float uKR;
uniform float uTheme, uTime, uLed, uLift;
uniform vec4 uBox;
uniform sampler2D uPix, uGlow;

uniform vec3 uLight;
uniform float uTheta, uHalfW, uRefract, uFrost, uGlowAmt, uMode, uStripLen;
uniform vec2 uStrip;
#define AMBER uLight
#define PEACH mix(uLight, vec3(1.0), 0.32)
float gPixA = 0.;

// One glow model for both themes. On dark, light adds. On a bright surface adding does
// nothing, so emit as a saturated tint with the same falloff: same perceived strength.
vec3 glow(vec3 col, float amt){
  vec3 dark = col + uLight * amt;
  vec3 lit  = mix(col, uLight * 1.04 + 0.03, clamp(1. - exp(-amt * 1.3), 0., 0.88));
  return mix(dark, lit, uTheme);
}

float sdRB(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.)) + min(max(q.x,q.y),0.) - r; }
float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }

float tex(sampler2D s, vec2 p){
  vec2 uv = (p - uBox.xy) / uBox.zw;
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return 0.;
  return texture(s, uv).a;
}

// The light strip hugs the glass from outside and travels around its perimeter.
// uTheta = angular centre of the strip, uHalfW = angular half-length.
float ledSd(vec2 p){
  if (uMode > 0.5) {
    // Track mode: strip runs along the inside wall of the container, centred on uStrip.
    float rad = sdRB(p - uC, uTH, uTR) + 6.5;
    float tang = max(length(p - uStrip) - uStripLen, 0.);
    return length(vec2(rad, tang)) - 1.5;
  }
  vec2 q = p - uK;
  float sk = sdRB(q, uKH, uKR);
  float a = atan(q.y, q.x);
  float da = abs(atan(sin(a - uTheta), cos(a - uTheta)));
  float tang = max(da - uHalfW, 0.) * 104.;
  float rad = sk - 6.5;
  return length(vec2(rad, tang)) - 1.5;
}

// light from the LED as it washes the track floor
float ledFloor(vec2 p){
  float ls = max(ledSd(p), 0.);
  return (exp(-ls/14.)*0.85 + exp(-ls/55.)*0.32) * uLed;
}

// The world under the glass: track floor + LED wash + pixel matrix.
vec3 floorScene(vec2 p, float frost, vec2 ca){
  float th = uTheme;
  vec3 base = mix(vec3(0.030), vec3(0.900), th);
  base *= 1. + (p.y - uC.y)/uTH.y * mix(0.05, 0.012, th);
  float sOff = sdRB(p - uC - vec2(0., 7.), uTH, uTR);
  float inner = smoothstep(-14., 3., sOff);
  base = mix(base * (1. - inner*0.6), base - inner*0.085, th);

  float g = ledFloor(p);
  base = glow(base, g*0.55);

  vec3 a;
  a.r = mix(tex(uPix, p - ca), tex(uGlow, p - ca)*1.35, frost);
  a.g = mix(tex(uPix, p     ), tex(uGlow, p     )*1.35, frost);
  a.b = mix(tex(uPix, p + ca), tex(uGlow, p + ca)*1.35, frost);
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  float inkT = smoothstep(0.40, 0.56, lum);
  vec3 pc = mix(vec3(1.0, 0.965, 0.925), vec3(0.11, 0.105, 0.10), inkT);
  pc = mix(pc + AMBER*g*0.9, pc + vec3(0.25,0.08,0.0)*g, th);
  gPixA = clamp(a.g, 0., 1.);
  vec3 col = mix(base, pc, clamp(a, 0., 1.));
  col += vec3(1.0, 0.78, 0.55) * tex(uGlow, p) * uGlowAmt * (1. - th);
  return col;
}

void main(){
  vec2 praw = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 p = uC + (praw - uC) / uScale; // design space: everything below is authored at desktop size
  vec2 vp = uRes / uDpr;
  vec2 uv = praw / vp;
  float th = uTheme;

  // ---- page
  float sky = smoothstep(1.5, 0.0, length((uv - vec2(0.92, -0.08)) * vec2(1.0, 1.25)));
  vec3 dBg = mix(vec3(0.040), vec3(0.120), sky);
  vec3 lBg = mix(vec3(0.800), vec3(0.925), sky);
  vec3 col = mix(dBg, lBg, th);

  float st = sdRB(p - uC, uTH, uTR);
  float sh = 1. - smoothstep(-10., 34., sdRB(p - uC - vec2(0., 14.), uTH, uTR));
  col *= 1. - sh * mix(0.5, 0.17, th);
  float sh2 = 1. - smoothstep(-2., 4., sdRB(p - uC - vec2(0., 1.5), uTH, uTR));
  col *= 1. - sh2 * mix(0.3, 0.08, th);

  // LED spill onto the page
  float ls = max(ledSd(p), 0.);
  float spill = (exp(-ls/18.)*0.5 + exp(-ls/85.)*0.34) * uLed;
  col = glow(col, spill*0.6);

  // ---- track
  if (st < 2.) {
    vec3 tc = floorScene(p, 0., vec2(0.));
    float sk0 = sdRB(p - uK - vec2(0., 7. + uLift*5.), uKH, uKR);
    float ksh = 1. - smoothstep(-8., 20. + uLift*8., sk0);
    tc *= 1. - ksh * mix(0.6, 0.2, th);
    float rim = 1. - smoothstep(0., 1.3, abs(st + 0.75));
    float bottom = smoothstep(-uTH.y*0.6, uTH.y, p.y - uC.y);
    tc += rim * mix(mix(0.035, 0.09, bottom), mix(-0.07, 0.07, bottom), th);
    col = mix(tc, col, smoothstep(-0.6, 0.6, st));
  }

  // ---- glass knob
  float sk = sdRB(p - uK, uKH, uKR);
  if (sk < 2.) {
    vec2 e = vec2(0.5, 0.);
    vec2 n = vec2(sdRB(p + e.xy - uK, uKH, uKR) - sdRB(p - e.xy - uK, uKH, uKR),
                  sdRB(p + e.yx - uK, uKH, uKR) - sdRB(p - e.yx - uK, uKH, uKR));
    n = n / max(length(n), 1e-4);
    float d = max(-sk, 0.);
    float t = clamp(d / 26., 0., 1.);
    float slope = pow(1. - t, 2.6);

    // refraction: bevel bends rays inward, centre magnifies slightly
    vec2 off = -n * slope * uRefract - (p - uK) * 0.055;
    float frost = 0.06 + uFrost * slope;
    vec3 g = floorScene(p + off, frost, n * slope * 3.2 + (p - uK) * 0.006);

    float vy = clamp((p.y - (uK.y - uKH.y)) / (2. * uKH.y), 0., 1.);
    vec3 dGlass = g * 0.84 + vec3(0.135) * (1. - vy * 0.55);
    vec3 lGlass = mix(g, vec3(0.99), 0.5 * (1. - gPixA * 0.8));
    vec3 kc = mix(dGlass, lGlass, th);

    // LED light entering the glass from below and scattering inside it
    float lq = max(ledSd(p), 0.);
    float sc = (exp(-lq / 24.) * 0.8 + exp(-lq / 64.) * 0.2) * uLed;
    kc = glow(kc, sc * 0.8);
    // light trapped in the bevel (total internal reflection), strongest near the source
    float rg = exp(-d / 2.2) * exp(-lq / 40.) * uLed;
    kc = glow(kc, rg * 1.3);

    // specular
    vec2 Ld = normalize(vec2(-0.35, -1.0));
    float ndl = dot(n, Ld);
    kc += pow(max(ndl, 0.), 2.) * exp(-d / 1.25) * mix(0.42, 0.7, th);
    kc += max(ndl, 0.) * slope * mix(0.07, 0.16, th);
    kc *= 1. - max(-ndl, 0.) * slope * mix(0.28, 0.07, th);
    kc += exp(-d / 0.7) * mix(0.07, 0.12, th);

    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }

  // ---- the light source itself
  float lsd = ledSd(p);
  float lm = 1. - smoothstep(-0.6, 0.6, lsd);
  vec3 lc = mix(uLight * 1.05, mix(uLight, vec3(1.0), 0.65), smoothstep(-0.2, -1.4, lsd));
  col = mix(col, lc * (0.8 + 0.35 * uLed), lm);
  col = glow(col, exp(-max(lsd, 0.) / 4.5) * 0.55 * uLed * (1. - lm));

  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.022;
  o = vec4(clamp(col, 0., 1.), 1.);
}`;

// ---------------------------------------------------------------- defaults
// Tuned values (the dev panel has been removed; these are the shipped settings).
const DEFAULTS = {
  path: 'glass',          // 'glass' = light strip hugs the knob, 'track' = it runs inside the container wall
  moonColor: '#6f86ff',   // light colour in the dark (moon) state
  sunColor: '#ffa82e',    // light colour in the light (sun) state
  intensity: 1.89,
  lightWidth: 0.92,       // strip length (rad around the glass; ×130 px along the track)
  orbit: true,            // strip travels bottom ⇄ top
  trackIcons: false,      // dim copies of both icons printed on the track
  refraction: 40,
  frost: 0.76,
  swirl: 1.62,
  burst: 0.38,
  glow: 0.64,
  stiffness: 129,
};

const HEX_RE = /^#[0-9a-f]{6}$/i;

const SHADOW_CSS = `
  :host { display: block; position: relative; }
  :host([hidden]) { display: none; }
  canvas {
    position: absolute; inset: 0; width: 100%; height: 100%; display: block;
    touch-action: none; -webkit-tap-highlight-color: transparent;
  }
  canvas { overscroll-behavior: none; -webkit-user-select: none; user-select: none; }
  canvas:focus-visible { outline: 2px solid rgba(128, 128, 128, 0.65); outline-offset: 6px; }
  .hint {
    position: absolute; left: 0; right: 0; bottom: calc(36px + env(safe-area-inset-bottom));
    text-align: center;
    font: 500 11px/1 -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: rgba(255,255,255,0.28); pointer-events: none; user-select: none;
    transition: color 0.6s ease;
  }
  .fallback {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: #0d0d0d; color: rgba(255,255,255,0.55); text-align: center;
    font: 13px/1.6 -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif; padding: 16px;
  }
`;

export class GlassLightToggle extends HTMLElement {
  static get observedAttributes() {
    return ['checked', 'zoom', 'path', 'moon-color', 'sun-color', 'hint', 'label'];
  }

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${SHADOW_CSS}</style>
      <canvas part="canvas" tabindex="0" role="switch" aria-checked="false"></canvas>
      <div class="hint" part="hint"></div>
    `;
    this._canvas = root.querySelector('canvas');
    this._hintEl = root.querySelector('.hint');
    this._fallbackEl = null;

    // ---------------------------------------------------------------- tunables
    this._P = { ...DEFAULTS };
    this._zoom = 1;

    // ---------------------------------------------------------------- state
    this._state = {
      p: 0, v: 0, target: 0,
      dragging: false, dragStartX: 0, dragStartP: 0, moved: 0, lastX: 0, lastT: 0, dragV: 0,
      hover: 0, hoverT: 0, press: 0, pressT: 0, led: 1, kick: 0, dir: 1, sp: 0, spv: 0,
      pendingClick: false,
    };
    this._PIX = pairUp();
    this._lit = false;
    this._connected = false;
    this._visible = true; // IntersectionObserver 报告前先乐观假设可见
    this._raf = 0;
    this._lastT = performance.now();

    // per-instance buffers, sized to the toggle plus glow margin
    this._box = { x: 0, y: 0, w: TRACK.w + 120, h: TRACK.h + 120 };
    this._pcan = document.createElement('canvas');
    this._pctx = this._pcan.getContext('2d');
    this._gcan = document.createElement('canvas');
    this._gctx = this._gcan.getContext('2d');

    this._dpr = 1; this._vw = 0; this._vh = 0;
    this._cx = 0; this._cy = 0; this._S = 1;
    this._leftX = 0; this._rightX = 0;

    this._gl = null;
    this._initGL();

    this._readAttrs();
    this._applyHintText();

    this._bindInput();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this);
    // 视口外的实例暂停整个渲染循环（多实例页面只给可见实例花 GPU/ CPU）
    this._io = new IntersectionObserver(entries => {
      const vis = entries.some(e => e.isIntersecting);
      if (vis === this._visible) return;
      this._visible = vis;
      if (vis) {
        if (this._connected && this._gl) {
          this._lastT = performance.now();
          this._raf = requestAnimationFrame(t => this._frame(t));
        }
      } else {
        cancelAnimationFrame(this._raf);
      }
    }, { rootMargin: '120px' });
    this._io.observe(this);
  }

  // ---------------------------------------------------------------- public API
  /** 当前是否为「开」（太阳/亮色）状态 */
  get checked() { return this._state.target > 0.5; }
  set checked(v) { this._setTarget(v ? 1 : 0, 0.6); }

  /** 在开/关之间切换 */
  toggle() { this._setTarget(this._state.target > 0.5 ? 0 : 1, 1); }

  // ---------------------------------------------------------------- lifecycle
  connectedCallback() {
    this._connected = true;
    this._applyLabel();
    this._resize();
    if (this._visible && this._gl) {
      this._lastT = performance.now();
      this._raf = requestAnimationFrame(t => this._frame(t));
    }
  }

  disconnectedCallback() {
    this._connected = false;
    cancelAnimationFrame(this._raf);
  }

  attributeChangedCallback(name, _old, value) {
    if (this._P == null) return;
    switch (name) {
      case 'zoom': {
        const z = parseFloat(value);
        this._zoom = Number.isFinite(z) ? Math.max(0.5, z) : 1;
        this._resize();
        break;
      }
      case 'path':
        this._P.path = value === 'track' ? 'track' : 'glass';
        break;
      case 'moon-color':
        if (HEX_RE.test(value || '')) this._P.moonColor = value;
        break;
      case 'sun-color':
        if (HEX_RE.test(value || '')) this._P.sunColor = value;
        break;
      case 'checked': {
        const v = value !== null && value !== 'false' && value !== '0';
        if ((v ? 1 : 0) !== this._state.target) this._setTarget(v ? 1 : 0, 0.6);
        break;
      }
      case 'hint':
        this._applyHintText();
        break;
      case 'label':
        this._applyLabel();
        break;
    }
  }

  _applyLabel() {
    this._canvas.setAttribute('aria-label', this.getAttribute('label') || 'Glass light toggle');
  }

  _applyHintText() {
    if (!this._hintEl) return;
    const attr = this.getAttribute('hint');
    if (attr !== null) {
      if (attr === 'none' || attr === '') { this._hintEl.textContent = ''; this._hintEl.hidden = true; return; }
      this._hintEl.hidden = false; this._hintEl.textContent = attr; return;
    }
    this._hintEl.hidden = false;
    this._hintEl.textContent = matchMedia('(hover: none)').matches ? 'Tap or drag' : 'Click or drag';
  }

  _readAttrs() {
    for (const name of GlassLightToggle.observedAttributes) {
      this.attributeChangedCallback(name, null, this.getAttribute(name));
    }
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  _setTarget(v, kick = 0) {
    const s = this._state;
    const nv = v > 0.5 ? 1 : 0;
    const changed = s.target !== nv;
    s.target = nv;
    s.kick = Math.max(s.kick, kick);
    if (!changed) return;
    this._canvas.setAttribute('aria-checked', String(nv > 0.5));
    if (nv > 0.5) { if (!this.hasAttribute('checked')) this.setAttribute('checked', ''); }
    else if (this.hasAttribute('checked')) this.removeAttribute('checked');
    this._emit('change', { checked: nv > 0.5 });
  }

  // ---------------------------------------------------------------- geometry
  // Point on the track's inner wall (inset 6.5px), by arc length u measured from
  // bottom-centre heading right (bottom → right end → top → left end → bottom).
  _trackPoint(u) {
    const cx = this._cx, cy = this._cy;
    const ins = 6.5, hx = TRACK.w / 2 - ins, hy = TRACK.h / 2 - ins, r = TRACK.r - ins;
    const a = hx - r, b = 2 * (hy - r), q = Math.PI * r / 2;
    const segs = [
      [a, t => [t, hy]],
      [q, t => { const th = Math.PI / 2 - t / r; return [a + r * Math.cos(th), (hy - r) + r * Math.sin(th)]; }],
      [b, t => [hx, (hy - r) - t]],
      [q, t => { const th = -t / r; return [a + r * Math.cos(th), -(hy - r) + r * Math.sin(th)]; }],
      [2 * a, t => [a - t, -hy]],
      [q, t => { const th = -Math.PI / 2 - t / r; return [-a + r * Math.cos(th), -(hy - r) + r * Math.sin(th)]; }],
      [b, t => [-hx, -(hy - r) + t]],
      [q, t => { const th = Math.PI - t / r; return [-a + r * Math.cos(th), (hy - r) + r * Math.sin(th)]; }],
      [a, t => [-a + t, hy]],
    ];
    const per = segs.reduce((s, [l]) => s + l, 0);
    u = ((u % per) + per) % per;
    for (const [l, fn] of segs) { if (u <= l) { const [x, y] = fn(u); return [cx + x, cy + y]; } u -= l; }
    return [cx, cy + hy];
  }

  _trackPerimeter() {
    const ins = 6.5, hx = TRACK.w / 2 - ins, hy = TRACK.h / 2 - ins, r = TRACK.r - ins;
    return 4 * (hx - r) + 4 * (hy - r) + 2 * Math.PI * r;
  }

  // ---------------------------------------------------------------- GL setup
  _initGL() {
    const canvas = this._canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
    if (!gl) return this._fallback('此组件需要支持 WebGL2 的浏览器');
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
    } catch (err) {
      console.error('[glass-light-toggle]', err);
      return this._fallback('着色器初始化失败');
    }
    this._gl = gl;
    this._prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    for (const n of ['uScale', 'uMode', 'uStrip', 'uStripLen', 'uLight', 'uTheta', 'uHalfW', 'uRefract', 'uFrost', 'uGlowAmt', 'uRes', 'uDpr', 'uC', 'uTH', 'uTR', 'uK', 'uKH', 'uKR', 'uTheme', 'uTime', 'uLed', 'uLift', 'uBox', 'uPix', 'uGlow'])
      U[n] = gl.getUniformLocation(prog, n);
    this._U = U;

    const mkTex = unit => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this._texPix = mkTex(0);
    this._texGlow = mkTex(1);
    gl.uniform1i(U.uPix, 0);
    gl.uniform1i(U.uGlow, 1);
  }

  _fallback(msg) {
    this._gl = null;
    if (this._fallbackEl) return;
    const div = document.createElement('div');
    div.className = 'fallback';
    div.textContent = msg;
    this.shadowRoot.appendChild(div);
    this._fallbackEl = div;
    this._hintEl && this._hintEl.remove();
    this._hintEl = null;
  }

  _resize() {
    if (!this._gl) return;
    const vw = this.clientWidth, vh = this.clientHeight;
    if (vw < 12 || vh < 12) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._dpr = dpr; this._vw = vw; this._vh = vh;
    const canvas = this._canvas;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    this._cx = vw / 2; this._cy = vh / 2 - 10;
    // screen px per design px: the toggle is laid out at desktop size and scaled to fit
    this._S = Math.min(this._zoom, (vw - 36) / (TRACK.w + 24), (vh - 120) / (TRACK.h + 160));
    const inner = TRACK.w / 2 - PAD - KNOB_HALF;
    this._leftX = this._cx - inner;
    this._rightX = this._cx + inner;
    const box = this._box;
    box.x = this._cx - box.w / 2;
    box.y = this._cy - box.h / 2;
    this._pcan.width = Math.round(box.w * dpr);
    this._pcan.height = Math.round(box.h * dpr);
    this._gcan.width = Math.round(box.w * dpr / 2);
    this._gcan.height = Math.round(box.h * dpr / 2);
    this._gl.viewport(0, 0, canvas.width, canvas.height);
    for (const px of this._PIX) px.inited = false;
  }

  // ---------------------------------------------------------------- simulation
  _pixelTarget(px, p, time, kx) {
    // Translation is carried by the glass; the morph is a local rearrangement around it.
    const P = this._P;
    const t = Math.min(1, Math.max(0, (p - px.delay) / 0.62));
    const e = easeIO(t);
    const ox = (px.a.x - C0) * PITCH, oy = (px.a.y - C0) * PITCH;
    const tx = (px.b.x - C0) * PITCH, ty = (px.b.y - C0) * PITCH;
    const dx = tx - ox, dy = ty - oy, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const arc = Math.sin(Math.PI * e);
    let x = ox + dx * e + nx * px.curl * P.swirl * arc;
    let y = oy + dy * e + ny * px.curl * P.swirl * arc;
    // breathe outward mid-morph, like the icon exhales and re-forms
    const r = Math.hypot(x, y) || 1;
    x += (x / r) * px.lift * arc * 1.4 * P.burst;
    y += (y / r) * px.lift * arc * 1.4 * P.burst;

    let ba = px.a.b, bb = px.b.b;
    if (px.a.kind === 'star') ba *= 0.45 + 0.55 * Math.pow(Math.sin(time * px.tw + px.phase), 2);
    if (px.b.kind === 'ray') bb *= 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(time * 2.2 - px.b.ang));
    const bright = (ba + (bb - ba) * e) * (1 + 0.3 * arc);
    const size = PSIZE * (1 - 0.45 * arc);
    return { x: kx + x, y: this._cy + y, bright, size };
  }

  _drawGhost(set, ox, alpha) {
    const pctx = this._pctx;
    for (const c of set) {
      pctx.globalAlpha = alpha * Math.max(c.b, 0.35);
      pctx.fillRect(ox + (c.x - C0) * PITCH - PSIZE / 2, this._cy + (c.y - C0) * PITCH - PSIZE / 2, PSIZE, PSIZE);
    }
  }

  // ---------------------------------------------------------------- frame loop
  _frame(now) {
    if (this._connected && this._visible) this._raf = requestAnimationFrame(t => this._frame(t));
    if (!this._gl) return;

    const dt = Math.min(1 / 30, (now - this._lastT) / 1000);
    this._lastT = now;
    const time = now / 1000;
    const s = this._state;
    const P = this._P;
    const gl = this._gl;
    const U = this._U;
    const canvas = this._canvas;
    const dpr = this._dpr;
    const cx = this._cx, cy = this._cy;
    const leftX = this._leftX, rightX = this._rightX;
    const S = this._S;

    if (canvas.width < 24 || canvas.height < 24) return;

    // knob position spring (scrubbed directly while dragging)
    if (!s.dragging) {
      const k = P.stiffness, c = 2 * Math.sqrt(k) * 0.6;
      const steps = 4, h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const a = -k * (s.p - s.target) - c * s.v;
        s.v += a * h; s.p += s.v * h;
      }
    }
    s.hover += (s.hoverT - s.hover) * Math.min(1, dt * 10);
    s.press += (s.pressT - s.press) * Math.min(1, dt * 18);
    s.kick *= Math.exp(-dt * 3.5);
    s.led = 1 + s.hover * 0.08 + Math.min(Math.abs(s.v) * 0.05, 0.18) + s.kick * 0.12;

    const pc = Math.min(1, Math.max(0, s.p));
    const over = Math.max(-s.p, s.p - 1, 0);
    const speed = Math.abs(s.v);
    const stretch = Math.min(speed * 6.5, 16);
    let khx = KNOB_HALF + stretch - over * 110;
    let khy = Math.min(KNOB_HALF - stretch * 0.45 + over * 30, KNOB_HALF + 5);
    const squeeze = 1 - s.press * 0.035;
    khx *= squeeze; khy *= squeeze;
    let kx = leftX + (rightX - leftX) * pc;
    if (s.p > 1) kx += over * 110; else if (s.p < 0) kx -= over * 110;
    const theme = smooth(0.18, 0.82, pc);

    // Light orbit. Leaving dark (p≈0) it sweeps bottom → leading (right) side → top;
    // leaving light it continues top → left side → bottom, so it keeps circling one way.
    // Direction is latched only at rest, so reversing mid-drag retraces the same arc.
    // The strip has its own eased, slightly lagging phase so it glides rather than being
    // welded to the knob: ease-in-out on the knob position, then a critically damped follow.
    {
      const goal = easeIO(pc), k = 70, c = 2 * Math.sqrt(k);
      s.spv += (-k * (s.sp - goal) - c * s.spv) * dt;
      s.sp += s.spv * dt;
    }
    const sp = Math.min(1, Math.max(0, s.sp));
    if (sp < 0.015) s.dir = 1; else if (sp > 0.985) s.dir = -1;
    const HALF = Math.PI / 2;
    let theta = s.dir > 0 ? HALF - Math.PI * sp : -HALF - Math.PI * (1 - sp);
    if (!P.orbit) theta = HALF;
    const cm = hex(P.moonColor), cs = hex(P.sunColor);

    // Track mode: same story along the container wall. Dark rests on the bottom under the knob,
    // light rests on the top above it; the strip travels the long way round the end of the track.
    let strip = [kx, cy + TRACK.h / 2];
    {
      const ins = 6.5, hx = TRACK.w / 2 - ins, hy = TRACK.h / 2 - ins, r = TRACK.r - ins;
      const a = hx - r, b = 2 * (hy - r), q = Math.PI * r / 2;
      const u0 = 0;                     // middle of the bottom edge
      const u1 = a + q + b + q + a;     // middle of the top edge (exactly half the perimeter)
      const per = this._trackPerimeter();
      let u = s.dir > 0 ? u0 + (u1 - u0) * sp : u1 + (per - u1) * (1 - sp);
      if (!P.orbit) u = (kx - cx); // stays on the bottom, following the knob
      strip = this._trackPoint(u);
    }

    // pixels: each one springs toward its path position (organic trailing)
    const kvx = s.v * (rightX - leftX); // knob speed, px/s
    for (const px of this._PIX) {
      const tg = this._pixelTarget(px, pc, time, 0);
      const rx = tg.x, ry = tg.y - cy; // offset relative to the glass centre
      if (!px.inited) { px.x = rx; px.y = ry; px.vx = 0; px.vy = 0; px.inited = true; }
      const kk = px.k, cc = 2 * Math.sqrt(kk) * 0.72;
      px.vx += (-kk * (px.x - rx) - cc * px.vx) * dt;
      px.vy += (-kk * (px.y - ry) - cc * px.vy) * dt;
      px.x += px.vx * dt; px.y += px.vy * dt;
      const drag = Math.max(-14, Math.min(14, -kvx * px.drag));
      px.sx = kx + px.x + drag; px.sy = cy + px.y;
      px.bright = tg.bright; px.size = tg.size;
    }

    // raster pixels
    const pctx = this._pctx, gctx = this._gctx;
    const pcan = this._pcan, gcan = this._gcan;
    const box = this._box;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, pcan.width, pcan.height);
    pctx.setTransform(dpr, 0, 0, dpr, -box.x * dpr, -box.y * dpr);
    pctx.fillStyle = '#fff';
    pctx.globalCompositeOperation = 'source-over';
    for (const px of this._PIX) {
      if (px.bright <= 0.002) continue;
      pctx.globalAlpha = Math.min(1, px.bright);
      const sz = px.size;
      pctx.fillRect(px.sx - sz / 2, px.sy - sz / 2, sz, sz);
    }
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, gcan.width, gcan.height);
    if (HAS_FILTER) {
      gctx.filter = `blur(${4 * dpr / 2}px)`;
      gctx.drawImage(pcan, 0, 0, gcan.width, gcan.height);
      gctx.filter = 'none';
    } else {
      // poor man's blur: a ring of offset, faint copies
      const r = 3 * dpr / 2;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        gctx.globalAlpha = 0.16;
        gctx.drawImage(pcan, Math.cos(a) * r, Math.sin(a) * r, gcan.width, gcan.height);
      }
      gctx.globalAlpha = 1;
    }
    // dim "unlit" icons sit underneath
    pctx.globalCompositeOperation = 'destination-over';
    if (P.trackIcons) {
      this._drawGhost(MOON, leftX, 0.12);
      this._drawGhost(SUN, rightX, 0.12);
    }
    pctx.globalCompositeOperation = 'source-over';
    pctx.globalAlpha = 1;

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this._texPix);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pcan);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this._texGlow);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gcan);

    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform1f(U.uScale, S);
    gl.uniform2f(U.uC, cx, cy);
    gl.uniform2f(U.uTH, TRACK.w / 2, TRACK.h / 2);
    gl.uniform1f(U.uTR, TRACK.r);
    gl.uniform2f(U.uK, kx, cy);
    gl.uniform2f(U.uKH, khx, khy);
    gl.uniform1f(U.uKR, Math.min(KNOB_R, khx - 1, khy - 1));
    gl.uniform1f(U.uTheme, theme);
    gl.uniform1f(U.uTime, time);
    gl.uniform1f(U.uLed, s.led * P.intensity);
    gl.uniform3f(U.uLight, cm[0] + (cs[0] - cm[0]) * theme, cm[1] + (cs[1] - cm[1]) * theme, cm[2] + (cs[2] - cm[2]) * theme);
    gl.uniform1f(U.uTheta, theta);
    gl.uniform1f(U.uHalfW, P.lightWidth);
    gl.uniform1f(U.uMode, P.path === 'track' ? 1 : 0);
    gl.uniform2f(U.uStrip, strip[0], strip[1]);
    gl.uniform1f(U.uStripLen, P.lightWidth * 130);
    gl.uniform1f(U.uRefract, P.refraction);
    gl.uniform1f(U.uFrost, P.frost);
    gl.uniform1f(U.uGlowAmt, P.glow);
    gl.uniform1f(U.uLift, s.hover * (1 - s.press));
    gl.uniform4f(U.uBox, box.x, box.y, box.w, box.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (this._hintEl) this._hintEl.style.color = theme > 0.5 ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.26)';
    const lit = theme > 0.5;
    if (lit !== this._lit) {
      this._lit = lit;
      this._emit('themechange', { lit, checked: this.checked });
    }
  }

  // ---------------------------------------------------------------- input
  _overTrack(x, y) {
    return inRoundRect(x, y, this._cx, this._cy, TRACK.w / 2, TRACK.h / 2, TRACK.r);
  }
  _knobX() {
    return this._leftX + (this._rightX - this._leftX) * Math.min(1, Math.max(0, this._state.p));
  }
  _overKnob(x, y) {
    return inRoundRect(x, y, this._knobX(), this._cy, KNOB_HALF, KNOB_HALF, KNOB_R);
  }
  _toD(x, y) {
    return [this._cx + (x - this._cx) / this._S, this._cy + (y - this._cy) / this._S];
  }
  _local(e) {
    const r = this._canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  _bindInput() {
    const canvas = this._canvas;

    canvas.addEventListener('pointermove', e => {
      const s = this._state;
      const [lx, ly] = this._local(e);
      const [dxp, dyp] = this._toD(lx, ly);
      const ot = this._overTrack(dxp, dyp);
      canvas.style.cursor = s.dragging ? 'grabbing' : ot ? 'pointer' : 'default';
      s.hoverT = ot && e.pointerType === 'mouse' ? 1 : 0;
      if (!s.dragging) return;
      const dx = (lx - s.dragStartX) / this._S;
      s.moved = Math.max(s.moved, Math.abs(dx) * this._S);
      const rightX = this._rightX, leftX = this._leftX;
      let p = s.dragStartP + dx / (rightX - leftX);
      if (p > 1) p = 1 + (p - 1) * 0.22;
      if (p < 0) p = p * 0.22;
      const t = performance.now();
      const ddt = Math.max(1, t - s.lastT) / 1000;
      s.dragV = s.dragV * 0.6 + ((p - s.p) / ddt) * 0.4;
      s.v = s.dragV; s.p = p; s.lastT = t;
    });

    canvas.addEventListener('pointerdown', e => {
      const [lx, ly] = this._local(e);
      const [dxp, dyp] = this._toD(lx, ly);
      if (!this._overTrack(dxp, dyp)) return;
      const s = this._state;
      canvas.setPointerCapture(e.pointerId);
      s.pressT = 1; s.moved = 0;
      if (this._overKnob(dxp, dyp)) {
        s.dragging = true; s.dragStartX = lx; s.dragStartP = s.p; s.lastT = performance.now(); s.dragV = 0;
      } else {
        s.pendingClick = true;
      }
    });

    const release = () => {
      const s = this._state;
      s.pressT = 0;
      if (s.dragging) {
        s.dragging = false;
        if (s.moved < 4) this.toggle();
        else this._setTarget((s.p + s.dragV * 0.15) > 0.5 ? 1 : 0, 0.6);
      } else if (s.pendingClick) this.toggle();
      s.pendingClick = false;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', () => { this._state.hoverT = 0; });

    canvas.addEventListener('keydown', e => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        this.toggle();
      }
    });
  }
}

customElements.define('glass-light-toggle', GlassLightToggle);

export default GlassLightToggle;
