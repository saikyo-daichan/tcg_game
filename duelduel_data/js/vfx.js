// vfx.js — card_vfx.verse: visual effects on the battle screen: short flip-book animations (generated textures T_Fx*)
// played over a target, and fx_pool (a few pooled pictures any short effect borrows). Ported 1:1.
// (card_z[Z] in Verse only checked Z >= 0: the Z numbers are used as they are.)
'use strict';

const VfxFire = 1;
const VfxThunder = 2;
const VfxIce = 3;
const VfxHeal = 4;
const VfxBuff = 5;
const VfxCurse = 6;
const VfxDark = 7;
const VfxExplode = 8;
const VfxSlash = 9;
const VfxSummon = 10;
const VfxSummonBig = 11;
const VfxDestroy = 12;
const VfxBarrier = 13;
const VfxWind = 14;
const VfxMana = 15;
const VfxEvolve = 16;

function VfxFrames(K) {
  const G = CardGui;
  if (K === VfxFire) return [G.T_FxFire0, G.T_FxFire1, G.T_FxFire2, G.T_FxFire3, G.T_FxFire4];
  if (K === VfxThunder) return [G.T_FxBolt0, G.T_FxBolt1, G.T_FxBolt2, G.T_FxBolt3];
  if (K === VfxIce) return [G.T_FxIce0, G.T_FxIce1, G.T_FxIce2, G.T_FxIce3];
  if (K === VfxHeal) return [G.T_FxHeal0, G.T_FxHeal1, G.T_FxHeal2, G.T_FxHeal3];
  if (K === VfxBuff) return [G.T_FxBuff0, G.T_FxBuff1, G.T_FxBuff2, G.T_FxBuff3];
  if (K === VfxCurse) return [G.T_FxCurse0, G.T_FxCurse1, G.T_FxCurse2, G.T_FxCurse3];
  if (K === VfxDark) return [G.T_FxDark0, G.T_FxDark1, G.T_FxDark2, G.T_FxDark3];
  if (K === VfxExplode) return [G.T_FxBoom0, G.T_FxBoom1, G.T_FxBoom2, G.T_FxBoom3, G.T_FxBoom4];
  if (K === VfxSlash) return [G.T_FxSlash0, G.T_FxSlash1, G.T_FxSlash2];
  if (K === VfxSummon) return [G.T_FxRing0, G.T_FxRing1, G.T_FxRing2, G.T_FxRing3];
  if (K === VfxSummonBig) return [G.T_FxGold0, G.T_FxGold1, G.T_FxGold2, G.T_FxGold3, G.T_FxGold4];
  if (K === VfxDestroy) return [G.T_FxPuff0, G.T_FxPuff1, G.T_FxPuff2, G.T_FxPuff3];
  if (K === VfxBarrier) return [G.T_FxBubble0, G.T_FxBubble1, G.T_FxBubble2];
  if (K === VfxWind) return [G.T_FxWind0, G.T_FxWind1, G.T_FxWind2, G.T_FxWind3];
  if (K === VfxMana) return [G.T_FxMana0, G.T_FxMana1, G.T_FxMana2, G.T_FxMana3];
  return [G.T_FxEvo0, G.T_FxEvo1, G.T_FxEvo2, G.T_FxEvo3, G.T_FxEvo4];
}

// size of the effect, where its centre is relative to the target centre, and the time per frame
function VfxBox(K) {
  if (K === VfxThunder) return [220, 480, -170, 0.06];
  if (K === VfxExplode || K === VfxSummonBig || K === VfxEvolve) return [300, 300, 0, 0.06];
  if (K === VfxHeal || K === VfxBuff) return [220, 220, -20, 0.08];
  if (K === VfxSlash) return [220, 220, 0, 0.05];
  return [230, 230, 0, 0.065];
}

class vfx_layer {
  constructor(o) {
    this.Root = o.Root;
    this.Pool = o.Pool;
    // the run that owns each pooled picture (a newer run takes it over; the older one just stops)
    this.Owner = o.Owner || [];
    this.Next = 0;
  }

  // battle effects sit under the click areas of the board (see HitZ)
  Play(K, C) { this.PlayZ(K, C, 52); }

  // Z: the menus play them above their screens
  PlayZ(K, C, Z) {
    const I = Mod(this.Next, this.Pool.length) || 0;
    const T = this.Pool[I];
    if (T) {
      this.Next += 1;
      this.Owner[I] = this.Next;
      const Me = this.Next;
      spawn(() => this.Run(I, T, K, C, Z, Me));
    }
  }

  // (cheap: the picture is put on once, then only its image changes; it is taken off at the end)
  async Run(I, T, K, C, Z, Me) {
    const B = VfxBox(K);
    const Frames = VfxFrames(K);
    this.Root.RemoveWidget(T);
    if (Frames[0]) T.SetImage(Frames[0]);
    T.SetDesiredSize(V2(B[0], B[1]));
    this.Root.AddWidget(RBox(T, C.X - B[0] / 2, C.Y - B[1] / 2 + B[2], B[0], B[1], Z));
    for (let J = 0; J < Frames.length; J++) {
      if (this.Owner[I] !== Me) return;
      if (J > 0 && Frames[J]) T.SetImage(Frames[J]);
      await Sleep(B[3]);
    }
    if (this.Owner[I] === Me) this.Root.RemoveWidget(T);
  }
}

// ---------------------------------------------------------------- pooled effect pictures (v18)
// The particle bursts (two pictures that take turns so the particles twinkle), the shock ring, the hit star, the light streak.
function BurstImgs() { return [CardGui.T_Fx2_Burst, CardGui.T_Fx2_BurstB]; }
function RingImgs() { return [CardGui.T_Ring]; }
function HitImgs() { return [CardGui.T_Fx2_Impact]; }
function FlareImgs() { return [CardGui.T_Fx2_Flare]; }
function SparkImgs() { return [CardGui.T_Sparkle]; }

// A few plain pictures that any short effect can borrow. Every effect only changes the size (and the image) of a
// picture that was put on its canvas once: no widget is put on again every frame, which keeps the screens smooth.
class fx_pool {
  constructor(o) {
    this.Ws = o.Ws;
    this.Owner = o.Owner || [];
    this.Next = 0;
  }

  // -> [index, owner number]
  Take() {
    const I = Mod(this.Next, this.Ws.length) || 0;
    this.Next += 1;
    this.Owner[I] = this.Next;
    return [I, this.Next];
  }

  // a picture centred on C goes from size S0 to S1 (height = width * Ratio) in Steps frames, then it is taken off.
  // Out: eased out (bursts, rings); otherwise eased in (light gathering when S1 < S0). Imgs take turns every frame.
  async Scale(Cv, C, S0, S1, Ratio, Steps, Col, Z, Imgs, Out) {
    const [I, Me] = this.Take();
    const T = this.Ws[I];
    if (!T || !(Z >= 0)) return;
    T.SetTint(Col);
    if (Imgs[0]) T.SetImage(Imgs[0]);
    T.SetDesiredSize(V2(S0, S0 * Ratio));
    Cv.RemoveWidget(T);
    Cv.AddWidget(RPin(T, C.X, C.Y, Z));
    const N = Max(1, Steps);
    for (let K = 1; K <= N; K++) {
      await Sleep(0.033);
      if (this.Owner[I] !== Me) return;
      const F = K / N;
      const E = Out ? 1 - (1 - F) * (1 - F) : F * F;
      const S = S0 + (S1 - S0) * E;
      T.SetDesiredSize(V2(S, S * Ratio));
      if (Imgs.length > 1) { const Img = Imgs[Mod(K, Imgs.length)]; if (Img) T.SetImage(Img); }
    }
    await Sleep(0.033);
    if (this.Owner[I] === Me) Cv.RemoveWidget(T);
  }

  // a sparkle that blinks (grows and shrinks) at C after Delay seconds
  async Blink(Cv, C, S, Col, Z, Delay) {
    if (Delay > 0) await Sleep(Delay);
    const [I, Me] = this.Take();
    const T = this.Ws[I];
    if (!T || !(Z >= 0)) return;
    T.SetTint(Col);
    T.SetImage(CardGui.T_Sparkle);
    T.SetDesiredSize(V2(4, 4));
    Cv.RemoveWidget(T);
    Cv.AddWidget(RPin(T, C.X, C.Y, Z));
    for (let K = 1; K <= 7; K++) {
      await Sleep(0.035);
      if (this.Owner[I] !== Me) return;
      const Sz = S * Sin(K * 3.1416 / 8);
      T.SetDesiredSize(V2(Sz, Sz));
    }
    await Sleep(0.035);
    if (this.Owner[I] === Me) Cv.RemoveWidget(T);
  }

  // everything off (the screen is closed)
  Off(Cv) {
    this.Next += this.Ws.length;
    this.Ws.forEach((T, I) => {
      this.Owner[I] = -1;
      Cv.RemoveWidget(T);
    });
  }
}

function MakeFxPool(N) {
  return new fx_pool({ Ws: IRange(1, N).map(() => Tex(CardGui.T_Ring, 64, 64)), Owner: IRange(1, N).map(() => 0) });
}

function MakeVfx(Root) {
  const N = 14;
  return new vfx_layer({ Root, Pool: IRange(1, N).map(() => Tex(CardGui.T_FxFire0, 200, 200)), Owner: IRange(1, N).map(() => 0) });
}
