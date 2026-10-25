// packfx.js — card_packfx.verse: the pack opening show (menus): light rays, sparkles, shock rings, particle bursts,
// flashes, the cards that fly out face down and turn over (stand-in pictures: the real card faces never move) and the
// EPIC / LEGEND call-outs. Everything is put on the pack screen canvas under its buttons (the buttons sit at 30).
// Ported 1:1. Verse `opacity01[X]` (a failable cast to 0..1) is the function opacity01(X): X, or undefined when out of range.
'use strict';

// color_block.SetOpacity takes 0..1 (undefined = the cast failed)
function opacity01(X) { return (X >= 0 && X <= 1) ? X : undefined; }

const TxEpicCall = "EPIC!";
const TxLegendCall = "LEGEND!!";

// the size of a pack card (MakeGridCard at scale 1.5) and where its picture sits (centre offset)
const PackCardW = 225.0;
const PackCardH = 321.0;
const PackArtDy = -43.5;

class pack_fx {
  constructor(o) {
    this.Canvas = o.Canvas;
    this.Rays = o.Rays;
    this.Pics = o.Pics;
    this.Flash = o.Flash;
    this.Dim = o.Dim;
    this.Big = o.Big;
    this.CardRays = o.CardRays;
    this.CardFlash = o.CardFlash;
    this.Backs = o.Backs;
    this.Fronts = o.Fronts;
    this.Arts = o.Arts;
    this.Glows = o.Glows;
    // Clear bumps Gen: every running animation that moves widgets stops
    this.Gen = 0;
    this.RayGen = 0;
    this.FlashGen = 0;
    this.DimGen = 0;
    this.LoopGen = -1;
    this.GlowOn = o.GlowOn || [];
    this.RayOn = o.RayOn || [];
    this.GlowAt = o.GlowAt || [];
  }

  // (a widget already on the canvas is moved in place: BdReBox / BdRePin in board.js)
  Put(W, X, Y, Wd, Ht, Z) {
    if (Z >= 0) BdReBox(this.Canvas, W, X, Y, Wd, Ht, Z); else this.Canvas.RemoveWidget(W);
  }

  // centred on (CX, CY) with its own desired size
  PutC(W, CX, CY, Z) {
    if (Z >= 0) BdRePin(this.Canvas, W, CX, CY, Z); else this.Canvas.RemoveWidget(W);
  }

  // everything off the screen
  Clear() {
    this.Gen += 1;
    this.RayGen += 1;
    this.FlashGen += 1;
    this.DimGen += 1;
    const Cv = this.Canvas;
    Cv.RemoveWidget(this.Rays);
    Cv.RemoveWidget(this.Flash);
    Cv.RemoveWidget(this.Dim);
    Cv.RemoveWidget(this.Big.Root);
    this.Pics.Off(Cv);
    for (const W of [...this.CardRays, ...this.Backs, ...this.Fronts, ...this.Arts, ...this.Glows]) Cv.RemoveWidget(W);
    for (const W of this.CardFlash) Cv.RemoveWidget(W);
    this.GlowOn = this.Glows.map(() => false);
    this.RayOn = this.CardRays.map(() => false);
  }

  // ------------------------------------------------------------ big effects
  // shimmering rays behind the pack / the cards until Clear (the two ray pictures take turns: widgets can't rotate)
  StartRays(CX, CY, S, C) {
    this.RayGen += 1;
    this.Rays.SetTint(C);
    this.Rays.SetDesiredSize(V2(S, S));
    this.PutC(this.Rays, CX, CY, 2);
    const G = this.RayGen;
    spawn(() => this.RayLoop(G, S));
  }

  async RayLoop(G, S) {
    let K = 0;
    for (;;) {
      await Sleep(0.12);
      if (G !== this.RayGen) break;
      K += 1;
      this.Rays.SetImage(Mod(K, 2) === 0 ? CardGui.T_Rays : CardGui.T_RaysB);
      const P = 1 + 0.05 * Sin(K * 0.7);
      this.Rays.SetDesiredSize(V2(S * P, S * P));
    }
  }

  StopRays() {
    this.RayGen += 1;
    this.Canvas.RemoveWidget(this.Rays);
  }

  async Ring(CX, CY, S0, S1, C) {
    await this.Pics.Scale(this.Canvas, V2(CX, CY), S0, S1, 1.0, 10, C, 9, RingImgs(), true);
  }

  // particles flying out (S1 > S0) or light gathering in (S1 < S0)
  async Burst(CX, CY, S0, S1, C, Steps) {
    await this.Pics.Scale(this.Canvas, V2(CX, CY), S0, S1, 1.0, Steps, C, 10, BurstImgs(), S1 > S0);
  }

  // a horizontal light streak
  async Flare(CX, CY, W, C) {
    await this.Pics.Scale(this.Canvas, V2(CX, CY), W * 0.3, W, 0.25, 8, C, 11, FlareImgs(), true);
  }

  // a sparkle that blinks at a random spot around (CX, CY)
  Twinkle(CX, CY, R, C) {
    const A = GetRandomFloat(0, 6.2832);
    const D = GetRandomFloat(R * 0.5, R);
    const Sz = GetRandomFloat(50, 90);
    spawn(() => this.Pics.Blink(this.Canvas, V2(CX + Cos(A) * D, CY + Sin(A) * D), Sz, C, 9, 0));
  }

  // a full-screen flash that fades out (put on once, only its opacity changes)
  async FlashRun(C, Peak) {
    this.FlashGen += 1;
    const G = this.FlashGen;
    this.Flash.SetColor(C);
    let V = opacity01(Peak);
    if (V !== undefined) this.Flash.SetOpacity(V);
    this.Canvas.RemoveWidget(this.Flash);
    this.Canvas.AddWidget(RFull(this.Flash, 20));
    for (const O of [0.7, 0.45, 0.25, 0.1]) {
      await Sleep(0.04);
      if (G !== this.FlashGen) return;
      V = opacity01(Peak * O);
      if (V !== undefined) this.Flash.SetOpacity(V);
    }
    await Sleep(0.04);
    if (G === this.FlashGen) this.Canvas.RemoveWidget(this.Flash);
  }

  // the room goes dark behind the cards (a legend is coming) / comes back
  async DimRun(On) {
    this.DimGen += 1;
    const G = this.DimGen;
    if (On) {
      this.Dim.SetOpacity(0.2);
      this.Canvas.RemoveWidget(this.Dim);
      this.Canvas.AddWidget(RFull(this.Dim, 3));
      for (const O of [0.38, 0.52, 0.62]) {
        await Sleep(0.04);
        if (G !== this.DimGen) return;
        this.Dim.SetOpacity(O);
      }
    } else {
      for (const O of [0.45, 0.25, 0.1]) {
        await Sleep(0.05);
        if (G !== this.DimGen) return;
        this.Dim.SetOpacity(O);
      }
      await Sleep(0.05);
      if (G === this.DimGen) this.Canvas.RemoveWidget(this.Dim);
    }
  }

  // "EPIC!" / "LEGEND!!" drops in over the cards and stays a moment
  async CallOut(Legend) {
    const G = this.Gen;
    this.Big.Set(Legend ? TxLegendCall : TxEpicCall);
    this.Big.SetColor(RarityColor(Legend ? RarL : RarE));
    for (const Y of [150, 206, 198]) {
      if (G !== this.Gen) return;
      this.PutC(this.Big.Root, 960, Y, 21);
      await Sleep(0.04);
    }
    await Sleep(Legend ? 1.1 : 0.7);
    if (G === this.Gen) this.Canvas.RemoveWidget(this.Big.Root);
  }

  // ------------------------------------------------------------ the cards (I = 0..4, C = the centre of card I)
  SetBacks(T) {
    for (const B of this.Backs) B.SetImage(T);
  }

  // the face-down stand-in of card I at C, scale S (the flight moves it: a single picture)
  BackAt(I, C, S) {
    const B = this.Backs[I];
    if (B) {
      B.SetDesiredSize(V2(PackCardW * S, PackCardH * S));
      this.PutC(B, C.X, C.Y, 8);
    }
  }

  // the card trembles (and rises from S0 to S1) before it turns: something good is inside
  async Tremble(I, C, Frames, Amp, S0, S1) {
    const G = this.Gen;
    const B = this.Backs[I];
    if (!B) return;
    for (let K = 1; K <= Frames; K++) {
      if (G !== this.Gen) return;
      const F = K / Frames;
      const S = S0 + (S1 - S0) * F;
      const A = Amp * (0.4 + 0.6 * F);
      const Dx = Mod(K, 2) === 0 ? -A : A;
      const Dy = Mod(K, 4) < 2 ? -0.4 * A : 0.4 * A;
      B.SetDesiredSize(V2(PackCardW * S, PackCardH * S));
      this.PutC(B, C.X + Dx, C.Y + Dy - 30 * (S - 1) * 4, 8);
      await Sleep(0.04);
    }
    if (G === this.Gen) this.PutC(B, C.X, C.Y - 30 * (S1 - 1) * 4, 8);
  }

  // the card turns over: the back gets thin, the front (frame + picture) comes round with a little pop, scale Up -> 1.
  // The real face is shown by the caller right after, then FrontOff takes the stand-ins away.
  async Flip(I, C, D, Up) {
    const G = this.Gen;
    const B = this.Backs[I], Fr = this.Fronts[I], Ar = this.Arts[I];
    if (!B || !Fr || !Ar) return;
    const Lift = -30 * (Up - 1) * 4;
    for (const W of [0.62, 0.28, 0.04]) {
      if (G !== this.Gen) return;
      B.SetDesiredSize(V2(PackCardW * Up * W, PackCardH * Up * (1 + 0.06 * (1 - W))));
      await Sleep(0.03);
    }
    this.Canvas.RemoveWidget(B);
    Fr.SetImage(FrameTex(!!(D.IsSpell || D.Amulet), D.Rarity));
    Ar.SetImage(D.Art);
    Ar.SetTint(D.ArtTint);
    const AS = D.IsSpell ? FitSize(D.ArtW, D.ArtH, 198, 150) : FitSize(D.ArtW, D.ArtH, 192, 144);
    Fr.SetDesiredSize(V2(PackCardW * 0.05, PackCardH * Up));
    Ar.SetDesiredSize(V2(AS.X * 0.05, AS.Y * Up));
    this.PutC(Fr, C.X, C.Y + Lift, 8);
    this.PutC(Ar, C.X, C.Y + Lift + PackArtDy * Up, 9);
    for (const St of [[0.4, 1.06], [0.8, 1.1], [1.0, 1.08], [1.0, 1.03]]) {
      await Sleep(0.03);
      if (G !== this.Gen) return;
      const S = Up * St[1];
      Fr.SetDesiredSize(V2(PackCardW * St[0] * S, PackCardH * S));
      Ar.SetDesiredSize(V2(AS.X * St[0] * S, AS.Y * S));
    }
    if (Up > 1.01) {
      // it settles back down onto the table
      for (const F of [0.6, 0.25, 0.0]) {
        await Sleep(0.03);
        if (G !== this.Gen) return;
        const S = 1 + (Up - 1) * F;
        Fr.SetDesiredSize(V2(PackCardW * S, PackCardH * S));
        Ar.SetDesiredSize(V2(AS.X * S, AS.Y * S));
        this.PutC(Fr, C.X, C.Y - 30 * (S - 1) * 4, 8);
        this.PutC(Ar, C.X, C.Y - 30 * (S - 1) * 4 + PackArtDy * S, 9);
      }
    }
    await Sleep(0.03);
  }

  FrontOff(I) {
    const Fr = this.Fronts[I], Ar = this.Arts[I];
    if (Fr && Ar) {
      this.Canvas.RemoveWidget(Fr);
      this.Canvas.RemoveWidget(Ar);
    }
  }

  BackOff(I) {
    const B = this.Backs[I];
    if (B) this.Canvas.RemoveWidget(B);
  }

  // a white flash over one card as it turns (X, Y = its top left)
  async CardFlashRun(I, X, Y) {
    const G = this.Gen;
    const F = this.CardFlash[I];
    if (!F) return;
    F.SetOpacity(0.95);
    this.Put(F, X, Y, PackCardW, PackCardH, 7);
    for (const O of [0.65, 0.35, 0.12]) {
      await Sleep(0.035);
      if (G !== this.Gen) return;
      F.SetOpacity(O);
    }
    await Sleep(0.035);
    if (G === this.Gen) this.Canvas.RemoveWidget(F);
  }

  // the glow in the rarity colour behind a face-down card (it gently pulses until Clear)
  GlowSet(I, C, Col) {
    const T = this.Glows[I];
    if (T) {
      T.SetTint(Col);
      T.SetDesiredSize(V2(330, 420));
      this.PutC(T, C.X, C.Y, 5);
      if (I < this.GlowOn.length) this.GlowOn = this.GlowOn.map((V, J) => J === I ? true : V);
      if (I < this.GlowAt.length) this.GlowAt = this.GlowAt.map((V, J) => J === I ? C : V);
      this.StartLoop();
    }
  }

  // rays behind a card (epic / legend) until Clear
  CardRaysOn(I, C, Col) {
    const T = this.CardRays[I];
    if (T) {
      T.SetTint(Col);
      T.SetDesiredSize(V2(560, 560));
      this.PutC(T, C.X, C.Y, 4);
      if (I < this.RayOn.length) this.RayOn = this.RayOn.map((V, J) => J === I ? true : V);
      this.StartLoop();
    }
  }

  StartLoop() {
    if (this.LoopGen !== this.Gen) {
      this.LoopGen = this.Gen;
      const G = this.Gen;
      spawn(() => this.CardLoop(G));
    }
  }

  // one loop for every card glow and card rays (a few size / image changes ten times a second)
  async CardLoop(G) {
    let K = 0;
    for (;;) {
      await Sleep(0.1);
      if (G !== this.Gen) break;
      K += 1;
      this.GlowOn.forEach((On, I) => {
        const T = this.Glows[I];
        if (!On || !T) return;
        const P = 1 + 0.05 * Sin(K * 0.6 + I * 1.3);
        T.SetDesiredSize(V2(330 * P, 420 * P));
      });
      if (Mod(K, 2) === 0) {
        this.RayOn.forEach((On, I) => {
          const T = this.CardRays[I];
          if (On && T) T.SetImage(Mod(K, 4) === 0 ? CardGui.T_Rays : CardGui.T_RaysB);
        });
      }
    }
  }
}

function MakePackFx(Canvas) {
  const N = 5;
  const R = () => IRange(1, N);
  return new pack_fx({
    Canvas,
    Rays: Tex(CardGui.T_Rays, 900, 900),
    Pics: MakeFxPool(16),
    Flash: new color_block({ DefaultColor: CWhite, DefaultOpacity: 0.9 }),
    Dim: new color_block({ DefaultColor: color(0.0, 0.0, 0.01), DefaultOpacity: 0.6 }),
    Big: OText(TxEmpty, 96, CGold, CInk),
    CardRays: R().map(() => Tex(CardGui.T_Rays, 560, 560)),
    CardFlash: R().map(() => new color_block({ DefaultColor: CWhite, DefaultOpacity: 0.9 })),
    Backs: R().map(() => Tex(CardGui.T_CardBack, PackCardW, PackCardH)),
    Fronts: R().map(() => Tex(CardGui.T_FrameMon, PackCardW, PackCardH)),
    Arts: R().map(() => Tex(CardMon.f_slime, 100, 100)),
    Glows: R().map(() => TexTint(CardGui.T_GlowCard, 330, 420, CGold)),
    GlowOn: R().map(() => false),
    RayOn: R().map(() => false),
    GlowAt: R().map(() => V2(0, 0)),
  });
}
