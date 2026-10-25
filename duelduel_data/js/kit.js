// kit.js — the Verse runtime stand-ins every other file is ported onto.
// Widgets (canvas / texture_block / text_block / color_block / overlay), canvas slots (Box / Pin / RBox ...),
// colours, messages helpers, Sleep / events / spawn, random, textures (CardGui.X / CardMon.X) and the click hub.
// Everything is global (plain <script> files: they also work when the page is opened from a file).
'use strict';

// ------------------------------------------------------------------ stage
const STAGE_W = 1920, STAGE_H = 1080;
const FONT_K = 1.12;            // px per UMG text point (in game ~1.18, but this font is a little wider)
const IMG_ROOT = 'duelduel_data/img/';
let StageEl = null;             // the 1920x1080 element everything lives in
let StageScale = 1;

// A phone held upright: the whole app (#app: the game and the HTML dialogs) is turned 90° so the game is always
// played sideways (landscape), even when the phone's rotation is locked.
let AppRotated = false;
let StageOff = { X: 0, Y: 0 };
function FitApp() {
  const app = document.getElementById('app');
  const W = window.innerWidth, H = window.innerHeight;
  AppRotated = H > W && matchMedia('(pointer: coarse)').matches;
  const w = AppRotated ? H : W, h = AppRotated ? W : H;
  if (app) {
    app.style.width = w + 'px'; app.style.height = h + 'px';
    app.style.transform = AppRotated ? `translate(${W}px, 0) rotate(90deg)` : 'none';
  }
  return { w, h };
}
// the safe-area insets of the screen in page px {L, R, T, B} (0 on a PC)
let SafeProbe = null;
function SafeInsets() {
  if (!SafeProbe) {
    SafeProbe = document.createElement('div');
    SafeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(SafeProbe);
  }
  const s = getComputedStyle(SafeProbe);
  const v = x => parseFloat(x) || 0;
  return { L: v(s.paddingLeft), R: v(s.paddingRight), T: v(s.paddingTop), B: v(s.paddingBottom) };
}
function InitStage(host) {
  StageEl = document.createElement('div');
  StageEl.id = 'stage';
  host.appendChild(StageEl);
  const fit = () => {
    const { w, h } = FitApp();
    // phones: keep the game out of the notch and the home bar (touches there go to the phone, not the game)
    const I = SafeInsets();
    const L = AppRotated ? I.T : I.L, R = AppRotated ? I.B : I.R, T = AppRotated ? I.R : I.T, B = AppRotated ? I.L : I.B;
    const aw = Math.max(1, w - L - R), ah = Math.max(1, h - T - B);
    StageScale = Math.min(aw / STAGE_W, ah / STAGE_H);
    StageOff = { X: L + (aw - STAGE_W * StageScale) / 2, Y: T + (ah - STAGE_H * StageScale) / 2 };
    StageEl.style.transform = `translate(${StageOff.X}px, ${StageOff.Y}px) scale(${StageScale})`;
  };
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 200));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  fit();
  return StageEl;
}
// a point of the page (clientX / clientY) in stage coordinates
function PageToStage(px, py) {
  // (rotated: app x = client y, app y = window width - client x)
  const ax = AppRotated ? py : px, ay = AppRotated ? window.innerWidth - px : py;
  return { X: (ax - StageOff.X) / StageScale, Y: (ay - StageOff.Y) / StageScale };
}

// ------------------------------------------------------------------ small Verse things
const V2 = (X, Y) => ({ X, Y });
const Max = Math.max, Min = Math.min, Abs = Math.abs, Sin = Math.sin, Cos = Math.cos, Sqrt = Math.sqrt;
const PiFloat = Math.PI;
const Floor = x => Math.floor(x), Ceil = x => Math.ceil(x), Round = x => Math.round(x);
const Int = x => Math.trunc(x);                    // Verse Floor[] / Int[] on floats
const Mod = (a, b) => ((a % b) + b) % b;          // Verse Mod[] (always >= 0)
const Clamp01 = x => Math.max(0, Math.min(1, x));
function GetSimulationElapsedTime() { return performance.now() / 1000; }
function Print(...a) { console.log(...a); }

// colours are LINEAR like Verse (color{R,G,B}); the kit converts them to sRGB for the page
// color(R, G, B) or color({R, G, B}) (cards.js writes `new color({R: …})` like Verse's color{R := …})
function color(R, G, B, A = 1) {
  if (R !== null && typeof R === 'object') return { R: R.R ?? 0, G: R.G ?? 0, B: R.B ?? 0, A: R.A ?? 1 };
  return { R, G, B, A };
}
function LinToCss(C, A) {
  const f = v => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2));
  const a = A === undefined ? (C.A === undefined ? 1 : C.A) : A;
  return `rgba(${f(C.R)},${f(C.G)},${f(C.B)},${a})`;
}
const CInk = color(0.08, 0.04, 0.02);
const CWhite = color(1, 1, 1);
const CGold = color(1, 0.85, 0.3);
const CRed = color(1, 0.33, 0.3);
const CGreen = color(0.45, 1, 0.45);
const CBlue = color(0.55, 0.85, 1);
const CBrown = color(0.075, 0.035, 0.012);
const CGrey = color(0.55, 0.55, 0.55);
const CCream = color(1, 0.96, 0.86);
const CPink = color(1, 0.6, 0.9);
const GlowReady = color(0.35, 1, 0.35);
const GlowSel = color(1, 0.9, 0.2);
const GlowAttack = color(1, 0.25, 0.2);
const GlowPlace = color(0.3, 0.85, 1);
const NamedColors = { Black: color(0, 0, 0), White: color(1, 1, 1) };
function HueColor(H) {
  const F = H - Math.floor(H);
  const R = Clamp01(Math.abs(F * 6 - 3) - 1), G = Clamp01(2 - Math.abs(F * 6 - 2)), B = Clamp01(2 - Math.abs(F * 6 - 4));
  return color(0.45 + 0.55 * R, 0.45 + 0.55 * G, 0.45 + 0.55 * B);
}
function ColorKey(C) { return Math.floor(C.R * 255) * 65536 + Math.floor(C.G * 255) * 256 + Math.floor(C.B * 255); }
function SameColor(A, B) { return A.R === B.R && A.G === B.G && A.B === B.B && (A.A ?? 1) === (B.A ?? 1); }

// messages are plain strings; <localizes> functions become functions returning strings
const TxEmpty = '';
const TxNewline = '\n';
function TxNum(N) { return String(N); }
function Join(Ms, Sep) { return Ms.join(Sep); }

// ------------------------------------------------------------------ time / concurrency
// Sleep(seconds): awaitable. A negative / 0 sleep still yields one frame like Verse Sleep(0.0).
function Sleep(S) {
  return new Promise(res => {
    if (!(S > 0)) { requestAnimationFrame(() => res()); return; }
    setTimeout(res, S * 1000);
  });
}
const NextTick = () => Sleep(0);
// spawn{ X() }: start without waiting (errors are logged, never lost silently)
function spawn(fn) {
  const fail = e => { if (!(e instanceof FlowAbort)) console.error('spawned task failed', e); };
  try {
    const p = fn();
    if (p && p.catch) p.catch(fail);
  } catch (e) { fail(e); }
}
// race: the first finished promise wins (the others keep running unless they check a cancel flag themselves)
function Race(...ps) { return Promise.race(ps); }
// Verse race cancelled the losing branch; JS can't. Screen loops left behind (a draft waiting for a pick after the
// opponent left) die on their next input: board.js WaitInput throws FlowAbort when FlowGen changed while it waited.
let FlowGen = 0;
class FlowAbort extends Error { constructor() { super('flow aborted'); this.name = 'FlowAbort'; } }
function AbortFlows() { FlowGen++; }
window.addEventListener('unhandledrejection', e => { if (e.reason instanceof FlowAbort) e.preventDefault(); });
// Verse event(t){}: Signal(v) wakes every Await()
class VEvent {
  constructor() { this.waiters = []; }
  Signal(v) { const w = this.waiters; this.waiters = []; for (const f of w) f(v); }
  Await() { return new Promise(r => this.waiters.push(r)); }
}

// ------------------------------------------------------------------ random
// The visual effects use Math.random. A match uses its own seeded generator (see MakeRng) so both players of an
// online match get the same results (card_rules must call its match RNG, never these).
function GetRandomInt(A, B) { if (B < A) return A; return A + Math.floor(Math.random() * (B - A + 1)); }
function GetRandomFloat(A, B) { return A + Math.random() * (B - A); }
function Shuffle(Arr) {
  const a = Arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// mulberry32: a small seeded generator ({Int(a, b), Float(a, b), Shuffle(arr)})
function MakeRng(Seed) {
  let s = Seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    Int(A, B) { if (B < A) return A; return A + Math.floor(next() * (B - A + 1)); },
    Float(A, B) { return A + next() * (B - A); },
    Shuffle(Arr) {
      const a = Arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    },
    State() { return s; },
  };
}

// ------------------------------------------------------------------ textures
// CardGui.T_Back1 / CardMon.f_slime -> {Grp, Name, W, H, Url}; IMG_MANIFEST comes from assets.js
const CardGui = {}, CardMon = {};
function InitTextures() {
  for (const [grp, obj] of [['CardGui', CardGui], ['CardMon', CardMon]]) {
    const m = (typeof IMG_MANIFEST !== 'undefined' && IMG_MANIFEST[grp]) || {};
    for (const n in m) obj[n] = { Grp: grp, Name: n, W: m[n][0], H: m[n][1], Url: IMG_ROOT + grp + '/' + n + '.webp' };
  }
}
const ImgCache = new Map();
function LoadImg(T) {
  let p = ImgCache.get(T.Url);
  if (!p) {
    p = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = T.Url; });
    ImgCache.set(T.Url, p);
  }
  return p;
}
// warms the browser cache (title screen loading bar)
async function PreloadTextures(List, OnProgress) {
  let n = 0;
  const step = 16;
  for (let i = 0; i < List.length; i += step) {
    await Promise.all(List.slice(i, i + step).map(T => LoadImg(T)));
    n = Math.min(List.length, i + step);
    if (OnProgress) OnProgress(n / List.length);
  }
}

// ------------------------------------------------------------------ widgets
const widget_visibility = { Visible: 'Visible', Collapsed: 'Collapsed', Hidden: 'Hidden' };
const text_justification = { Left: 'left', Center: 'center', Right: 'right' };
const horizontal_alignment = { Left: 'start', Center: 'center', Right: 'end', Fill: 'stretch' };
const vertical_alignment = { Top: 'start', Center: 'center', Bottom: 'end', Fill: 'stretch' };

class widget {
  constructor(tag = 'div') {
    this.el = document.createElement(tag);
    this.el.className = 'w';
    this.Vis = widget_visibility.Visible;
    this.Parent = null;   // the canvas / overlay it is in
    this.SlotEl = null;   // the element positioned by the slot
  }
  SetVisibility(V) {
    this.Vis = V;
    this.el.style.display = V === widget_visibility.Collapsed ? 'none' : '';
    this.el.style.visibility = V === widget_visibility.Hidden ? 'hidden' : '';
  }
  GetVisibility() { return this.Vis; }
  // size the widget wants in a size-to-content slot
  DesiredW() { return null; }
  DesiredH() { return null; }
}
function Show(W, On) { W.SetVisibility(On ? widget_visibility.Visible : widget_visibility.Collapsed); }

// canvas: children placed by canvas slots (absolute position, z order)
class canvas extends widget {
  constructor(opts = {}) {
    super();
    this.el.classList.add('cv');
    this.Slots = [];
    for (const S of (opts.Slots || [])) this.AddWidget(S);
  }
  AddWidget(S) {
    const W = S.Widget;
    if (W.Parent) W.Parent.RemoveWidget(W);
    const s = document.createElement('div');
    s.className = 'slot';
    const st = s.style;
    st.zIndex = S.ZOrder || 0;
    if (S.Full) { st.left = '0'; st.top = '0'; st.width = '100%'; st.height = '100%'; s.classList.add('fill'); }
    else {
      st.left = S.X + 'px'; st.top = S.Y + 'px';
      if (!S.SizeToContent) { st.width = S.W + 'px'; st.height = S.H + 'px'; s.classList.add('fill'); }
      const ax = S.AX || 0, ay = S.AY || 0;
      if (ax || ay) st.transform = `translate(${-ax * 100}%, ${-ay * 100}%)`;
    }
    s.appendChild(W.el);
    this.el.appendChild(s);
    W.Parent = this; W.SlotEl = s; W.Slot = S;
    this.Slots.push(S);
  }
  RemoveWidget(W) {
    if (W.Parent !== this) return;
    if (W.SlotEl && W.SlotEl.parentNode) W.SlotEl.parentNode.removeChild(W.SlotEl);
    this.Slots = this.Slots.filter(S => S.Widget !== W);
    W.Parent = null; W.SlotEl = null; W.Slot = null;
  }
  GetWidgets() { return this.Slots.map(S => S.Widget); }
}

// canvas slots (same names / meaning as card_ui_kit.verse; the R* ones are the root ones = same here: the stage is 1920x1080)
function Box(W, X, Y, Width, Height, Z = 0) { return { Widget: W, X, Y, W: Width, H: Height, ZOrder: Z, SizeToContent: false }; }
function Pin(W, X, Y, Z = 0) { return { Widget: W, X, Y, ZOrder: Z, SizeToContent: true, AX: 0.5, AY: 0.5 }; }
function PinL(W, X, Y, Z = 0) { return { Widget: W, X, Y, ZOrder: Z, SizeToContent: true, AX: 0, AY: 0.5 }; }
function PinTL(W, X, Y, Z = 0) { return { Widget: W, X, Y, ZOrder: Z, SizeToContent: true, AX: 0, AY: 0 }; }
const RBox = Box, RPin = Pin, RPinL = PinL, RPinTL = PinTL;
function RFull(W, Z = 0) { return { Widget: W, Full: true, ZOrder: Z }; }
// a slot of any alignment (Verse canvas_slot{Offsets, Alignment, SizeToContent})
function SlotAt(W, X, Y, AX, AY, Z = 0, Width = null, Height = null) {
  return Width === null ? { Widget: W, X, Y, AX, AY, ZOrder: Z, SizeToContent: true } : { Widget: W, X, Y, AX, AY, W: Width, H: Height, ZOrder: Z, SizeToContent: false };
}

// tinted pictures, shared: key -> blob url (TintReady once made). TintShared turns false when the canvas can't be
// read back (a page opened from a file); the widgets then draw their own canvas.
const TintCache = new Map(), TintReady = new Map();
let TintShared = true;
function TintKey(T, C) { return T.Url + '|' + LinToCss(C, 1); }
function TintedUrl(T, C) {
  const key = TintKey(T, C);
  let p = TintCache.get(key);
  if (p) return p;
  p = LoadImg(T).then(im => new Promise(res => {
    if (!im || TintShared === false) { res(null); return; }
    const w = Math.min(im.naturalWidth, 1024), h = Math.round(im.naturalHeight * w / im.naturalWidth);
    const cnv = document.createElement('canvas');
    cnv.width = w; cnv.height = h;
    const g = cnv.getContext('2d');
    g.drawImage(im, 0, 0, w, h);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = LinToCss(C, 1);
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(im, 0, 0, w, h);
    try {
      cnv.toBlob(b => {
        if (!b) { res(null); return; }
        const url = URL.createObjectURL(b);
        TintReady.set(key, url);
        res(url);
      });
    } catch (e) { TintShared = false; res(null); }
  }));
  TintCache.set(key, p);
  return p;
}

// texture_block: an image with a desired size, a tint (multiply) and an opacity
class texture_block extends widget {
  constructor(opts = {}) {
    super();
    this.el.classList.add('tex');
    this.Img = null; this.Tint = CWhite; this.Opacity = 1;
    this.Size = opts.DefaultDesiredSize || V2(64, 64);
    this.cnv = null;
    this.ApplySize();
    if (opts.DefaultImage) this.SetImage(opts.DefaultImage);
    if (opts.DefaultTint) this.SetTint(opts.DefaultTint);
    if (opts.DefaultOpacity !== undefined) this.SetOpacity(opts.DefaultOpacity);
  }
  ApplySize() { this.el.style.width = this.Size.X + 'px'; this.el.style.height = this.Size.Y + 'px'; }
  SetDesiredSize(S) { if (S.X === this.Size.X && S.Y === this.Size.Y) return; this.Size = S; this.ApplySize(); }
  GetDesiredSize() { return this.Size; }
  SetImage(T) {
    if (!T) { console.warn('SetImage: missing texture'); return; }
    if (this.Img === T) return;
    this.Img = T;
    this.Draw();
  }
  SetTint(C) {
    if (SameColor(C, this.Tint)) return;
    this.Tint = C;
    this.Draw();
  }
  GetTint() { return this.Tint; }
  SetOpacity(O) { this.Opacity = O; this.el.style.opacity = O * (this.Tint.A ?? 1); }
  Draw() {
    const T = this.Img;
    if (!T) return;
    const C = this.Tint;
    this.el.style.opacity = this.Opacity * (C.A ?? 1);
    const white = C.R >= 0.999 && C.G >= 0.999 && C.B >= 0.999;
    if (white) {
      if (this.cnv) { this.cnv.remove(); this.cnv = null; }
      this.el.style.backgroundImage = `url("${T.Url}")`;
      this.TintShown = null;
      return;
    }
    // tinted: the picture times the colour (alpha kept). Every picture+colour pair is made once and shared as an
    // image (phones choked on one canvas per widget: ~1000 of them, only ~40 different ones)
    const key = TintKey(T, C);
    const ready = TintReady.get(key);
    if (ready) { this.ShowTinted(ready); return; }
    if (TintShared !== false) {
      // (another colour of the same picture stays until the new one is ready; anything else is hidden meanwhile)
      if (!this.cnv && this.TintShown !== T) { this.el.style.backgroundImage = 'none'; this.TintShown = null; }
      TintedUrl(T, C).then(url => {
        if (this.Img !== T || this.Tint !== C) return;
        if (url) this.ShowTinted(url); else this.DrawCanvas();
      });
      return;
    }
    this.DrawCanvas();
  }
  ShowTinted(url) {
    if (this.cnv) { this.cnv.remove(); this.cnv = null; }
    this.el.style.backgroundImage = `url("${url}")`;
    this.TintShown = this.Img;
  }
  // (a page opened from a file: the pictures can't be read back, so each widget draws its own canvas as before)
  DrawCanvas() {
    const T = this.Img, C = this.Tint;
    this.el.style.backgroundImage = 'none';
    this.TintShown = null;
    if (!this.cnv) { this.cnv = document.createElement('canvas'); this.cnv.className = 'tcv'; this.el.appendChild(this.cnv); }
    const cnv = this.cnv, want = T, tint = C;
    LoadImg(T).then(im => {
      if (!im || this.Img !== want || this.Tint !== tint || this.cnv !== cnv) return;
      const w = Math.min(im.naturalWidth, 1024), h = Math.round(im.naturalHeight * w / im.naturalWidth);
      if (cnv.width !== w || cnv.height !== h) { cnv.width = w; cnv.height = h; }
      const g = cnv.getContext('2d');
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, w, h);
      g.drawImage(im, 0, 0, w, h);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = LinToCss(tint, 1);
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(im, 0, 0, w, h);
    });
  }
}
function Tex(T, W, H) { return new texture_block({ DefaultImage: T, DefaultDesiredSize: V2(W, H) }); }
function TexTint(T, W, H, C) { return new texture_block({ DefaultImage: T, DefaultDesiredSize: V2(W, H), DefaultTint: C }); }

// color_block: a flat rectangle
class color_block extends widget {
  constructor(opts = {}) {
    super();
    this.el.classList.add('cb');
    this.Color = opts.DefaultColor || CWhite;
    this.Opacity = opts.DefaultOpacity === undefined ? 1 : opts.DefaultOpacity;
    this.Size = opts.DefaultDesiredSize || V2(32, 32);
    this.el.style.width = this.Size.X + 'px'; this.el.style.height = this.Size.Y + 'px';
    this.Paint();
  }
  Paint() { this.el.style.background = LinToCss(this.Color, (this.Color.A ?? 1) * this.Opacity); }
  SetColor(C) { this.Color = C; this.Paint(); }
  SetOpacity(O) { this.Opacity = O; this.Paint(); }
  SetDesiredSize(S) { this.Size = S; this.el.style.width = S.X + 'px'; this.el.style.height = S.Y + 'px'; }
}

// text_block
class text_block extends widget {
  constructor(opts = {}) {
    super();
    this.el.classList.add('tx');
    this.Text = '';
    this.Size = opts.DefaultTextSize || 24;
    this.Color = opts.DefaultTextColor || CWhite;
    this.Just = opts.DefaultJustification || text_justification.Left;
    this.Shadow = opts.DefaultShadowOffset ? { C: opts.DefaultShadowColor || CInk, O: opts.DefaultShadowOffset, A: opts.DefaultShadowOpacity ?? 1 } : null;
    this.TextOpacity = 1;
    const st = this.el.style;
    st.fontSize = (this.Size * FONT_K).toFixed(1) + 'px';
    st.textAlign = this.Just;
    if (opts.AutoWrap) { st.whiteSpace = 'pre-wrap'; st.wordBreak = 'break-all'; if (opts.WrapWidth) st.width = opts.WrapWidth + 'px'; this.el.classList.add('wrap'); }
    else st.whiteSpace = 'pre';
    this.PaintColor();
    this.PaintShadow();
    this.SetText(opts.DefaultText || '');
  }
  SetText(M) { M = M == null ? '' : String(M); if (M === this.Text) return; this.Text = M; this.el.textContent = M; }
  GetText() { return this.Text; }
  PaintColor() { this.el.style.color = LinToCss(this.Color, (this.Color.A ?? 1) * this.TextOpacity); }
  PaintShadow() {
    const S = this.Shadow;
    this.el.style.textShadow = S ? `${S.O.X * FONT_K}px ${S.O.Y * FONT_K}px 0 ${LinToCss(S.C, S.A)}` : 'none';
  }
  SetTextColor(C) { this.Color = C; this.PaintColor(); }
  SetTextOpacity(O) { this.TextOpacity = O; this.PaintColor(); }
  SetShadowOpacity(O) { if (this.Shadow) { this.Shadow.A = O; this.PaintShadow(); } }
  SetJustification(J) { this.Just = J; this.el.style.textAlign = J; }
}
function Txt(S, Size, C) {
  return new text_block({ DefaultText: S, DefaultTextColor: C, DefaultTextSize: Size, DefaultJustification: text_justification.Center, DefaultShadowColor: CInk, DefaultShadowOffset: V2(2, 2), DefaultShadowOpacity: 0.9 });
}
function TxtLeft(S, Size, C) {
  return new text_block({ DefaultText: S, DefaultTextColor: C, DefaultTextSize: Size, DefaultJustification: text_justification.Left, DefaultShadowColor: CInk, DefaultShadowOffset: V2(2, 2), DefaultShadowOpacity: 0.9 });
}
function TxtWrap(S, Size, C, Width) {
  return new text_block({ DefaultText: S, DefaultTextColor: C, DefaultTextSize: Size, DefaultJustification: text_justification.Left, AutoWrap: true, WrapWidth: Width });
}
function TxtLine(S, Size, C) { return new text_block({ DefaultText: S, DefaultTextColor: C, DefaultTextSize: Size, DefaultJustification: text_justification.Left }); }
function TxtDark(S, Size) { return new text_block({ DefaultText: S, DefaultTextColor: CBrown, DefaultTextSize: Size, DefaultJustification: text_justification.Center }); }

// overlay: every child in the same cell, aligned by its overlay_slot {Widget, HorizontalAlignment, VerticalAlignment, Padding}
class overlay extends widget {
  constructor(opts = {}) {
    super();
    this.el.classList.add('ov');
    this.Slots = [];
    for (const S of (opts.Slots || [])) this.AddWidget(S);
  }
  AddWidget(S) {
    const W = S.Widget;
    const st = W.el.style;
    st.gridArea = '1 / 1';
    st.justifySelf = S.HorizontalAlignment || 'center';
    st.alignSelf = S.VerticalAlignment || 'center';
    const P = S.Padding || {};
    st.margin = `${P.Top || 0}px ${P.Right || 0}px ${P.Bottom || 0}px ${P.Left || 0}px`;
    this.el.appendChild(W.el);
    W.Parent = this;
    this.Slots.push(S);
  }
  RemoveWidget(W) { if (W.el.parentNode === this.el) this.el.removeChild(W.el); this.Slots = this.Slots.filter(S => S.Widget !== W); W.Parent = null; }
}
const margin = (o = {}) => ({ Left: o.Left || 0, Top: o.Top || 0, Right: o.Right || 0, Bottom: o.Bottom || 0 });

// sw: visibility only sent when it changes
class sw {
  constructor(W) { this.W = W; this.State = -1; }
  Set(On) { const V = On ? 1 : 0; if (V !== this.State) { this.State = V; Show(this.W, On); } }
}
function MakeSw(W, On) { const S = new sw(W); S.Set(On); return S; }

// otext: text with a shadow (< 60 pt) or a thick outline (big numbers / headings)
class otext {
  constructor(Root, Main) { this.Root = Root; this.Main = Main; this.LastNum = -999999; this.LastColor = -1; }
  Set(M) { this.LastNum = -999999; this.Main.SetText(M); }
  SetNum(N) { if (N === this.LastNum) return; this.Set(TxNum(N)); this.LastNum = N; }
  SetColor(C) { const K = ColorKey(C); if (K === this.LastColor) return; this.LastColor = K; this.Main.SetTextColor(C); }
}
function OText(S, Size, C, OC) {
  const T = new text_block({ DefaultText: S, DefaultTextColor: C, DefaultTextSize: Size, DefaultJustification: text_justification.Center });
  if (Size < 60) {
    const Off = Math.max(1.5, Size / 14) * FONT_K;
    T.el.style.textShadow = `${Off}px ${Off}px 0 ${LinToCss(OC, 1)}`;
  } else {
    const E = (Size / 12 + 1) * FONT_K * 0.8;
    T.el.style.webkitTextStroke = `${(E * 2).toFixed(1)}px ${LinToCss(OC, 1)}`;
    T.el.style.paintOrder = 'stroke fill';
    T.el.style.textShadow = `0 ${E}px 0 ${LinToCss(OC, 1)}`;
  }
  return new otext(T, T);
}
function ONum(N, Size, C, OC) { return OText(TxNum(N), Size, C, OC); }

function FitSize(W, H, MaxW, MaxH) { const K = Math.min(MaxW / W, MaxH / H); return V2(W * K, H * K); }

// ------------------------------------------------------------------ click areas (WBP_CardHit)
// A transparent area that reports clicks / hovers. Drag and drop: pressing on one area and letting go over another
// clicks the first one when the drag starts and the second one on release (the game sees "pick A, then pick B"),
// while an arrow follows the finger / mouse. Long press (touch) = hover (shows the details).
const HitRegistry = new Set();
let DragArrow = null;
const LongPressMs = 480;
class WBP_CardHit extends widget {
  constructor() {
    super();
    this.el.classList.add('hit');
    this.Clicked = new VEvent();
    this.Hovered = new VEvent();
    this.Unhovered = new VEvent();
    this.Draggable = true;        // the board turns this off for things that can't be dragged
    this.el._hit = this;
    HitRegistry.add(this);
    HitInput.Attach(this);
  }
}
const HitInput = {
  down: null,          // {hit, x, y, t, dragging, pointerId, longTimer}
  hover: null,
  enabled: true,
  Attach(H) {
    const el = H.el;
    el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') this.SetHover(H); });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && this.hover === H) { this.hover = null; H.Unhovered.Signal(); } });
    el.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button > 0) return;
      e.preventDefault();
      AudioUnlock();
      const d = { hit: H, x: e.clientX, y: e.clientY, t: e.timeStamp, dragging: false, pointerId: e.pointerId, touch: e.pointerType !== 'mouse', long: false };
      this.down = d;
      if (d.touch) d.longTimer = setTimeout(() => { if (this.down === d && !d.dragging) { d.long = true; this.SetHover(H); } }, LongPressMs);
    });
  },
  SetHover(H) { if (this.hover !== H) { this.hover = H; H.Hovered.Signal(); } },
  HitAt(x, y) {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) if (el._hit && el.offsetParent !== null) return el._hit;
    return null;
  },
  Init() {
    window.addEventListener('pointermove', e => {
      const d = this.down;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      const far = d.touch ? 26 : 18;
      if (!d.dragging && d.hit.Draggable && dx * dx + dy * dy > far * far) {
        d.dragging = true;
        clearTimeout(d.longTimer);
        d.hit.Clicked.Signal();           // the drag starts: pick what was pressed
        ShowDragArrow(d.x, d.y);
      }
      if (d.dragging) {
        MoveDragArrow(e.clientX, e.clientY);
        const H = this.HitAt(e.clientX, e.clientY);
        if (H && H !== d.hit) this.SetHover(H);
      }
    }, { passive: true });
    const up = e => {
      const d = this.down;
      if (!d) return;
      this.down = null;
      clearTimeout(d.longTimer);
      if (d.dragging) {
        HideDragArrow();
        const H = this.HitAt(e.clientX, e.clientY);
        if (H && H !== d.hit) setTimeout(() => H.Clicked.Signal(), 30);
        // (Self: let go on the thing it started from = a sloppy tap, the board treats it like a tap)
        else if (DragDropNowhere) DragDropNowhere(d.hit, H === d.hit);
      } else if (!d.long || e.timeStamp - d.t < LongPressMs) {
        // (a busy phone can run the long-press timer late: the finger's own times decide whether it was a tap)
        d.hit.Clicked.Signal();
      }
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', e => { const d = this.down; this.down = null; if (d) { clearTimeout(d.longTimer); HideDragArrow(); } });
  },
};
// what a drag that ends on nothing does (the board sets it: usually "cancel the selection")
let DragDropNowhere = null;
function ShowDragArrow(x, y) {
  if (!DragArrow) {
    DragArrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    DragArrow.id = 'dragarrow';
    DragArrow.innerHTML = '<defs><marker id="ah" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" fill="#ffd84a"/></marker></defs><line id="dal" stroke="#ffd84a" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 18" marker-end="url(#ah)"/>';
    document.body.appendChild(DragArrow);
  }
  DragArrow.style.display = 'block';
  DragArrow._x = x; DragArrow._y = y;
  MoveDragArrow(x, y);
}
function MoveDragArrow(x, y) {
  if (!DragArrow) return;
  const l = DragArrow.querySelector('#dal');
  l.setAttribute('x1', DragArrow._x); l.setAttribute('y1', DragArrow._y); l.setAttribute('x2', x); l.setAttribute('y2', y);
}
function HideDragArrow() { if (DragArrow) DragArrow.style.display = 'none'; }

// ------------------------------------------------------------------ keys (card_input.verse)
const KeyBack = 1, KeyNext = 2, KeyPrev = 3, KeyNextPage = 4, KeyPrevPage = 5, KeyUse = 6, KeyInspect = 7;
class card_keys {
  constructor() { this.Keys = new VEvent(); this.Quit = new VEvent(); this.Pad = false; }
  async Run() {
    const map = { Escape: KeyBack, Backspace: KeyBack, e: KeyNext, E: KeyNext, ArrowRight: KeyNext, q: KeyPrev, Q: KeyPrev, ArrowLeft: KeyPrev,
      c: KeyNextPage, C: KeyNextPage, ArrowDown: KeyNextPage, z: KeyPrevPage, Z: KeyPrevPage, ArrowUp: KeyPrevPage, f: KeyUse, F: KeyUse, Enter: KeyUse, ' ': KeyUse, i: KeyInspect, I: KeyInspect };
    window.addEventListener('keydown', e => {
      const k = map[e.key];
      if (k && !e.repeat && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) { e.preventDefault(); this.Pad = true; this.Keys.Signal(k); }
    });
    window.addEventListener('pointermove', () => { this.Pad = false; }, { passive: true });
  }
}

// ------------------------------------------------------------------ audio
let AudioUnlocked = false;
function AudioUnlock() { AudioUnlocked = true; }
window.addEventListener('keydown', AudioUnlock);

// ------------------------------------------------------------------ misc helpers used by many ports
// Verse "X[I]" that fails out of range: Get(arr, i) returns undefined instead
function At(Arr, I) { return (I >= 0 && I < Arr.length && Number.isInteger(I)) ? Arr[I] : undefined; }
function RemoveElement(Arr, I) { return Arr.slice(0, I).concat(Arr.slice(I + 1)); }
function ArrFind(Arr, V) { const i = Arr.indexOf(V); return i < 0 ? undefined : i; }
function IRange(A, B) { const r = []; for (let i = A; i <= B; i++) r.push(i); return r; }   // Verse A..B (inclusive)
function DeepCopy(o) { return JSON.parse(JSON.stringify(o)); }
function Quotient(A, B) { return Math.trunc(A / B); }

// ------------------------------------------------------------------ the rest of card_ui_kit.verse
// the card library (built once): the texts of every card are made once
class card_lib {
  constructor(o) { this.DB = o.DB; this.Texts = o.Texts; this.Helps = o.Helps; this.Rows = o.Rows; this.Heroes = o.Heroes; this.IslandCode = o.IslandCode || ''; }
  TextOf(D) { return this.Texts[D.Id] ?? TxEmpty; }
  HelpOf(D) { return this.Helps[D.Id] ?? TxEmpty; }
  RowsOf(D) { return this.Rows[D.Id] ?? 0; }
  CardById(Id) { return this.DB[Id] || this.DB[0]; }
}
function MakeCardLib(Code) {
  const DB = MakeCardDB();
  return new card_lib({ DB, Texts: DB.map(D => CardText(DB, D)), Helps: DB.map(D => HelpWithSummons(DB, D)), Rows: DB.map(D => CardTextRows(D)), Heroes: MakeHeroes(), IslandCode: Code });
}
function TxIslandCode(C) { return `島コード  ${C}`; }
function IslandCodeText(Lib) { return Lib.IslandCode.length > 0 ? TxIslandCode(Lib.IslandCode) : TxEmpty; }

const CardBackCount = 26, CardBackCandy = 16, CardBackSeason1 = 17, CardShopBacks = 15;
function CardBackTex(I) { return (I >= 1 && I <= 25 && CardGui['T_Back' + I]) || CardGui.T_CardBack; }
function FrameTex(Spell, R) {
  if (Spell) return R === RarL ? CardGui.T_FrameSpellL : R === RarE ? CardGui.T_FrameSpellE : R === RarR ? CardGui.T_FrameSpellR : CardGui.T_FrameSpell;
  return R === RarL ? CardGui.T_FrameMonL : R === RarE ? CardGui.T_FrameMonE : R === RarR ? CardGui.T_FrameMonR : CardGui.T_FrameMon;
}
function UnitTex(Foe, R) {
  if (Foe) return R === RarL ? CardGui.T_UnitFoeL : R === RarE ? CardGui.T_UnitFoeE : R === RarR ? CardGui.T_UnitFoeR : CardGui.T_UnitFoe;
  return R === RarL ? CardGui.T_UnitMeL : R === RarE ? CardGui.T_UnitMeE : R === RarR ? CardGui.T_UnitMeR : CardGui.T_UnitMe;
}
const BtnGold = 0, BtnBlue = 1, BtnPurple = 2, BtnEnd = 3;
function BtnShape(W, H) { const R = W / Math.max(1, H); return R < 2.1 ? 0 : R < 3.1 ? 1 : R < 4.15 ? 2 : R < 5.6 ? 3 : R < 7.4 ? 4 : 5; }
function BtnTex(Kind, W, H) {
  const S = BtnShape(W, H);
  const nm = ['Gold', 'Blue', 'Purple', 'End'][Kind];
  return (nm && CardGui['T_B' + nm + S]) || CardGui.T_BGold2;
}
