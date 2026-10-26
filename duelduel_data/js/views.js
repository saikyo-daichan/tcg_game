// views.js — card_views.verse: the widgets of one card (hand / enlarged / grave / pack), one board slot, a player
// portrait, the damage pop-up and the picture buttons. All stats are drawn on top of plain frame textures.
// The screens refresh often: every setter remembers what it shows and only sends changes to the widgets.
// Ported 1:1. (grid_card / MakeGridCard live in card_menus.verse -> menus.js, not here.)
// Verse "D.IsMonster[]" / "U.Hidden[]" (<decides> methods) are called as D.IsMonster() / U.Hidden() (truthy = success).
'use strict';

// the tint of an amulet's board panel
const AmuletTint = color(0.85, 0.75, 1.0);

// ---------------------------------------------------------------- a card (150 x 214 at scale 1)
class card_face {
  constructor(o) {
    this.S = o.S;
    this.Root = o.Root;
    this.Glow = o.Glow;
    this.Frame = o.Frame;
    this.Art = o.Art;
    this.Name = o.Name;
    this.Gem = o.Gem;
    this.Cost = o.Cost;
    this.AtkIcon = o.AtkIcon;
    this.Atk = o.Atk;
    this.HpIcon = o.HpIcon;
    this.Hp = o.Hp;
    this.Body = o.Body;
    this.BodySm = o.BodySm;
    this.BodyXs = o.BodyXs;
    this.Back = o.Back;
    this.Rar = o.Rar;
    this.Vis = o.Vis;
    this.GlowSw = o.GlowSw;
    this.BackSw = o.BackSw;
    this.RarSw = o.RarSw;
    this.StatSws = o.StatSws;
    this.BodySws = o.BodySws;
    // プレミア: sparkles around the frame (1st), a rainbow glow and moving art (2nd)
    this.Sparks = o.Sparks;
    this.SparkSws = o.SparkSws;
    this.PremGlow = o.PremGlow;
    this.PremSw = o.PremSw;
    // a picture with a background (spells): ★2 keeps the background still and moves only the icon (ArtFg)
    this.ArtFg = o.ArtFg;
    this.FgSw = o.FgSw;
    this.Split = null;
    this.SplitOn = false;
    this.Prem = 0;
    this.ArtSize = V2(100, 90);
    this.Shown = null;
    this.LastId = -1;
    this.LastA = -999;
    this.LastH = -999;
    this.LastM = -999;
    this.LastCost = -999;
    this.LastBack = -1;
    this.LastGlow = -1;
    this.LastKw = 0;
  }

  W() { return 150 * this.S; }
  H() { return 214 * this.S; }

  SetShown(On) { this.Vis.Set(On); }

  // A = current attack, Hp = current hp, MaxHp = current max hp (pass the card's own stats for a card in hand)
  SetCard(L, D, A, CurHp, MaxHp) {
    this.BackSw.Set(false);
    if (D.Id === this.LastId && A === this.LastA && CurHp === this.LastH && MaxHp === this.LastM) return;
    this.Shown = D;
    const S = this.S;
    if (D.Id !== this.LastId) {
      this.LastId = D.Id;
      this.LastCost = -999;
      this.LastKw = 0;
      this.Frame.SetImage(FrameTex(!!(D.IsSpell || D.Amulet), D.Rarity));
      this.Art.SetImage(D.Art);
      this.Art.SetTint(D.ArtTint);
      this.ArtSize = D.IsSpell ? FitSize(D.ArtW, D.ArtH, 132 * S, 100 * S) : FitSize(D.ArtW, D.ArtH, 128 * S, 96 * S);
      this.Art.SetDesiredSize(this.ArtSize);
      this.Split = PremSplit(D.Art);
      this.SplitOn = false;
      this.FgSw.Set(false);
      this.ApplySplit();
      this.Name.SetText(D.Name);
      this.Cost.SetNum(D.Cost);
      this.Cost.SetColor(CWhite);
      this.Rar.SetTint(RarityColor(D.Rarity));
      this.RarSw.Set(!D.Token);
      // long texts use a smaller font so they stay inside the text box
      const Rows = L.RowsOf(D);
      const Use = Rows >= 6 ? 2 : Rows >= 4 ? 1 : 0;
      [this.Body, this.BodySm, this.BodyXs].forEach((B, I) => {
        const Sw = this.BodySws[I];
        if (!Sw) return;
        if (I === Use) B.SetText(L.TextOf(D));
        Sw.Set(I === Use);
      });
      const Mon = !!D.IsMonster();
      for (const Sw of this.StatSws) Sw.Set(Mon);
    }
    this.LastA = A;
    this.LastH = CurHp;
    this.LastM = MaxHp;
    this.Atk.SetNum(A);
    this.Atk.SetColor(A > D.Atk ? CGreen : A < D.Atk ? CRed : CWhite);
    this.Hp.SetNum(CurHp);
    this.Hp.SetColor(CurHp < MaxHp ? CRed : CurHp > D.Hp ? CGreen : CWhite);
  }

  // a keyword this copy got in the hand (0 none): printed above the card's own text
  SetGotKw(L, Code) {
    if (Code === this.LastKw) return;
    this.LastKw = Code;
    const D = this.Shown;
    if (D) {
      const Rows = L.RowsOf(D) + (Code > 0 ? 1 : 0);
      const Use = Rows >= 6 ? 2 : Rows >= 4 ? 1 : 0;
      const Txt0 = Code > 0 ? TcGotKw(KwName(Code), L.TextOf(D)) : L.TextOf(D);
      [this.Body, this.BodySm, this.BodyXs].forEach((B, I) => {
        const Sw = this.BodySws[I];
        if (!Sw) return;
        if (I === Use) B.SetText(Txt0);
        Sw.Set(I === Use);
      });
    }
  }

  // the cost of this copy in the hand (green when lowered)
  SetCost(N) {
    if (N === this.LastCost) return;
    this.LastCost = N;
    this.Cost.SetNum(N);
    const D = this.Shown;
    if (D) this.Cost.SetColor(N < D.Cost ? CGreen : N > D.Cost ? CRed : CWhite);
  }

  // face-down
  SetBack(Design) {
    this.Shown = null;
    this.LastId = -1;
    if (Design !== this.LastBack) {
      this.LastBack = Design;
      this.Back.SetImage(CardBackTex(Design));
    }
    this.BackSw.Set(true);
    this.SetPrem(0);
  }

  // the プレミア level of the card shown (0 none, 1 sparkles, 2 sparkles + rainbow glow + moving art)
  SetPrem(L) {
    if (L === this.Prem) return;
    this.Prem = L;
    for (const Sw of this.SparkSws) Sw.Set(L >= 1);
    this.PremSw.Set(L >= 2);
    if (L < 2) this.Art.SetDesiredSize(this.ArtSize);
    this.ApplySplit();
  }

  // ★2 on a picture with a background: the still background in Art, the icon in ArtFg on top
  ApplySplit() {
    const D = this.Shown;
    const On = !!(this.Prem >= 2 && this.Split && D);
    if (On === this.SplitOn) return;
    this.SplitOn = On;
    if (On) {
      this.Art.SetImage(this.Split[0]);
      this.Art.SetDesiredSize(this.ArtSize);
      this.ArtFg.SetImage(this.Split[1]);
      this.ArtFg.SetTint(D.ArtTint);
      this.ArtFg.SetDesiredSize(this.ArtSize);
    } else if (D) {
      this.Art.SetImage(D.Art);
    }
    this.FgSw.Set(On);
  }

  // one step of the プレミア animation (called about 12 times a second while shown)
  Tick(K) {
    if (this.Prem <= 0 || this.Vis.State === 0 || this.BackSw.State === 1) return;
    const S = this.S;
    this.Sparks.forEach((T, I) => {
      const V = Abs(Sin(K * 0.33 + I * 1.6));
      const Sz = S * (5 + 25 * V * V);
      T.SetDesiredSize(V2(Sz, Sz));
    });
    if (this.Prem >= 2) {
      if (this.SplitOn) {
        // only the icon moves (never smaller than the picture, so the background under it stays covered)
        this.ArtFg.SetDesiredSize(PremIconSize(this.ArtSize, K));
      } else {
        const B = 1 + 0.05 * Sin(K * 0.22);
        const Wob = 0.04 * Sin(K * 0.47);
        this.Art.SetDesiredSize(V2(this.ArtSize.X * B * (1 + Wob), this.ArtSize.Y * B * (1 - Wob)));
      }
      this.PremGlow.SetTint(HueColor(K * 0.02));
    }
  }

  SetGlow(On, C) {
    if (On) {
      const K = ColorKey(C);
      if (K !== this.LastGlow) {
        this.LastGlow = K;
        this.Glow.SetTint(C);
      }
    }
    this.GlowSw.Set(On);
  }
}

// Hit: an optional click area put over the whole card (null / false = none)
function MakeCardFace(S, Hit) {
  const Glow = TexTint(CardGui.T_GlowCard, 182 * S, 246 * S, GlowReady);
  const Frame = Tex(CardGui.T_FrameMon, 150 * S, 214 * S);
  const Art = Tex(CardMon.f_slime, 100 * S, 90 * S);
  const ArtFg = Tex(CardMon.f_slime, 100 * S, 90 * S);
  const Name = TxtLeft(TxEmpty, 12.5 * S, CWhite);
  const Gem = Tex(CardGui.T_Gem, 38 * S, 38 * S);
  const Cost = ONum(0, 20 * S, CWhite, CInk);
  const AtkIcon = Tex(CardGui.T_Sword, 34 * S, 34 * S);
  const Atk = ONum(0, 21 * S, CWhite, CInk);
  const HpIcon = Tex(CardGui.T_Shield, 34 * S, 34 * S);
  const Hp = ONum(0, 21 * S, CWhite, CInk);
  const Body = TxtWrap(TxEmpty, 10.5 * S, CBrown, 124 * S);
  const BodySm = TxtWrap(TxEmpty, 8.8 * S, CBrown, 126 * S);
  const BodyXs = TxtWrap(TxEmpty, 7.6 * S, CBrown, 128 * S);
  const Back = Tex(CardGui.T_CardBack, 150 * S, 214 * S);
  const Rar = Tex(CardGui.T_Rarity, 22 * S, 22 * S);
  const Sparks = IRange(0, 3).map(I => TexTint(CardGui.T_Sparkle, 20 * S, 20 * S, (I === 1 || I === 2) ? CGold : CWhite));
  const PremGlow = TexTint(CardGui.T_GlowCard, 176 * S, 240 * S, CPink);
  const SparkXY = [V2(16, 30), V2(136, 52), V2(18, 182), V2(132, 200)];
  let Slots = [
    Box(PremGlow, -13 * S, -13 * S, 176 * S, 240 * S, 0),
    Box(Glow, -16 * S, -16 * S, 182 * S, 246 * S, 0),
    Box(Frame, 0, 0, 150 * S, 214 * S, 1),
    Pin(Art, 75 * S, 78 * S, 2),
    Pin(ArtFg, 75 * S, 78 * S, 3),
    PinL(Name, 11 * S, 15.5 * S, 4),
    Pin(Gem, 131 * S, 16 * S, 5),
    Pin(Cost.Root, 131 * S, 16 * S, 6),
    Pin(AtkIcon, 20 * S, 120 * S, 5),
    Pin(Atk.Root, 22 * S, 122 * S, 6),
    Pin(HpIcon, 130 * S, 120 * S, 5),
    Pin(Hp.Root, 130 * S, 121 * S, 6),
    Pin(Rar, 75 * S, 124 * S, 5),
    // fixed box: a wrapped text in a size-to-content slot collapses to one character per line
    Box(Body, 14 * S, 136 * S, 124 * S, 72 * S, 4),
    Box(BodySm, 13 * S, 135 * S, 126 * S, 74 * S, 4),
    Box(BodyXs, 12 * S, 134 * S, 128 * S, 76 * S, 4),
    Box(Back, 0, 0, 150 * S, 214 * S, 10),
  ];
  Sparks.forEach((T, I) => { const XY = SparkXY[I]; if (XY) Slots = [...Slots, Pin(T, XY.X * S, XY.Y * S, 8)]; });
  if (Hit) Slots = [...Slots, Box(Hit, 0, 0, 150 * S, 214 * S, 20)];
  const Root = new canvas({ Slots });
  return new card_face({
    S, Root, Glow, Frame, Art, Name, Gem, Cost, AtkIcon, Atk, HpIcon, Hp, Body, BodySm, BodyXs, Back, Rar,
    Vis: MakeSw(Root, true),
    GlowSw: MakeSw(Glow, false),
    BackSw: MakeSw(Back, false),
    RarSw: MakeSw(Rar, true),
    StatSws: [MakeSw(AtkIcon, true), MakeSw(Atk.Root, true), MakeSw(HpIcon, true), MakeSw(Hp.Root, true)],
    BodySws: [MakeSw(Body, true), MakeSw(BodySm, false), MakeSw(BodyXs, false)],
    Sparks,
    SparkSws: Sparks.map(T => MakeSw(T, false)),
    PremGlow,
    PremSw: MakeSw(PremGlow, false),
    ArtFg,
    FgSw: MakeSw(ArtFg, false),
  });
}

// [still background, icon] of a picture that has a background (the spell pictures T_Sp_*), or null
function PremSplit(T) {
  const Bg = T && T.Grp === 'CardGui' ? CardGui[T.Name + '_bg'] : undefined;
  const Fg = T && T.Grp === 'CardGui' ? CardGui[T.Name + '_fg'] : undefined;
  return Bg && Fg ? [Bg, Fg] : null;
}

// the size of a ★2 icon at animation step K: it breathes and wobbles but never gets smaller than Size
function PremIconSize(Size, K) {
  const B = 1.035 + 0.02 * Sin(K * 0.22);
  const Wob = 0.015 * Sin(K * 0.47);
  return V2(Size.X * B * (1 + Wob), Size.Y * B * (1 - Wob));
}

// ---------------------------------------------------------------- a board slot (170 x 170)
class unit_view {
  constructor(o) {
    this.Root = o.Root;
    this.Glow = o.Glow;
    this.Panel = o.Panel;
    this.Art = o.Art;
    this.Taunt = o.Taunt;
    this.Ice = o.Ice;
    this.Bubble = o.Bubble;
    this.Ghost = o.Ghost;
    this.GhostVeil = o.GhostVeil;
    this.AtkIcon = o.AtkIcon;
    this.Atk = o.Atk;
    this.HpIcon = o.HpIcon;
    this.Hp = o.Hp;
    this.Zzz = o.Zzz;
    this.KwTags = o.KwTags;
    this.Count = o.Count;
    this.Star = o.Star;
    this.Flash = o.Flash;
    // 潜伏: grey smoke drifting over the monster (its art is greyed too)
    this.Smoke = o.Smoke;
    this.IsFoe = o.IsFoe;
    // visibility switches: 0 panel 1 art 2 taunt 3 ice 4 bubble 5 atk icon 6 atk 7 hp icon 8 hp 9 zzz 10 tags 11 count 12 star 13 ghost 14 veil 15 glow 16 smoke
    this.Sws = o.Sws;
    // プレミア sparkles (1st) and moving art (2nd)
    this.Sparks = o.Sparks;
    this.SparkSws = o.SparkSws;
    // (amulets with a spell picture) ★2 moves only the icon, see card_face.ApplySplit
    this.ArtFg = o.ArtFg;
    this.FgSw = o.FgSw;
    this.Split = null;
    this.SplitOn = false;
    this.Prem = 0;
    this.ArtSize = V2(100, 100);
    this.LastU = null;
    this.LastEvoPic = false;
    this.LastKw = -1;
    this.LastCount = -1;
    this.LastBubble = -1;
    this.LastGlow = -1;
    this.LastGhost = -2;
    this.LastHid = -1;
  }

  SwSet(I, On) { const S = this.Sws[I]; if (S) S.Set(On); }

  // translucent preview of the monster that would be summoned here (null = none)
  SetGhost(MaybeD) {
    const D = MaybeD;
    if (D) {
      if (D.Id !== this.LastGhost) {
        this.LastGhost = D.Id;
        this.Ghost.SetImage(D.Art);
        this.Ghost.SetTint(D.ArtTint);
        this.Ghost.SetDesiredSize(FitSize(D.ArtW, D.ArtH, 132, 118));
      }
      this.SwSet(13, true);
      this.SwSet(14, true);
    } else {
      this.SwSet(13, false);
      this.SwSet(14, false);
    }
  }

  SetPrem(L) {
    if (L === this.Prem) return;
    this.Prem = L;
    for (const Sw of this.SparkSws) Sw.Set(L >= 1);
    if (L < 2) this.Art.SetDesiredSize(this.ArtSize);
  }

  ApplySplit(U) {
    const On = !!(U && this.Prem >= 2 && this.Split);
    if (On === this.SplitOn) return;
    this.SplitOn = On;
    if (On) {
      this.Art.SetImage(this.Split[0]);
      this.Art.SetDesiredSize(this.ArtSize);
      this.ArtFg.SetImage(this.Split[1]);
      this.ArtFg.SetTint(U.Def.ArtTint);
      this.ArtFg.SetDesiredSize(this.ArtSize);
    } else if (U) {
      this.Art.SetImage(U.Def.Art);
    }
    this.FgSw.Set(On);
  }

  Tick(K) {
    if (this.LastHid === 1) this.Smoke.SetDesiredSize(V2(176 + 10 * Sin(K * 0.21), 168 + 10 * Sin(K * 0.29 + 1)));
    if (this.Prem <= 0) return;
    this.Sparks.forEach((T, I) => {
      const V = Abs(Sin(K * 0.31 + I * 1.7));
      const Sz = 6 + 26 * V * V;
      T.SetDesiredSize(V2(Sz, Sz));
    });
    if (this.SplitOn) {
      this.ArtFg.SetDesiredSize(PremIconSize(this.ArtSize, K));
    } else if (this.Prem >= 2) {
      const B = 1 + 0.05 * Sin(K * 0.22);
      const Wob = 0.04 * Sin(K * 0.47);
      this.Art.SetDesiredSize(V2(this.ArtSize.X * B * (1 + Wob), this.ArtSize.Y * B * (1 - Wob)));
    }
  }

  // ShowZzz: "Zzz" is only meaningful for the own monsters on the own turn; A = the attack it really has (アリジゴク)
  SetUnit(MaybeU, ShowZzz, A) {
    const U = MaybeU;
    if (U) {
      // (竜人) an evolved monster may have a picture of its own
      const EvoPic = !!(U.Evolved && U.Def.EvoArt);
      if (this.LastU !== U || this.LastEvoPic !== EvoPic) {
        this.LastU = U;
        this.LastEvoPic = EvoPic;
        this.Panel.SetImage(UnitTex(this.IsFoe, U.Def.Rarity));
        this.Panel.SetTint(U.Def.Amulet ? AmuletTint : CWhite);
        if (EvoPic) {
          this.Art.SetImage(U.Def.EvoArt);
          this.ArtSize = FitSize(U.Def.EvoArtW, U.Def.EvoArtH, 132, 118);
        } else {
          this.Art.SetImage(U.Def.Art);
          this.ArtSize = FitSize(U.Def.ArtW, U.Def.ArtH, 132, 118);
        }
        this.Art.SetTint(U.Def.ArtTint);
        this.Art.SetDesiredSize(this.ArtSize);
        this.LastHid = -1;
        this.Split = EvoPic ? null : PremSplit(U.Def.Art);
        this.SplitOn = false;
        this.FgSw.Set(false);
      }
      this.SetPrem(U.Prem);
      this.ApplySplit(U);
      // 潜伏 (until it attacks): the art goes grey and smoke covers it
      const Hid = U.Hidden() ? 1 : 0;
      if (Hid !== this.LastHid) {
        this.LastHid = Hid;
        const T = U.Def.ArtTint;
        this.Art.SetTint(Hid === 1 ? color(T.R * 0.45 + 0.1, T.G * 0.45 + 0.1, T.B * 0.5 + 0.13) : T);
      }
      this.SwSet(16, Hid === 1);
      this.SwSet(0, true);
      this.SwSet(1, true);
      this.SwSet(2, !!U.Taunt);
      this.SwSet(3, !!U.Frozen);
      const B = U.Invincible ? 2 : U.Barrier ? 1 : 0;
      if (B !== this.LastBubble) {
        this.LastBubble = B;
        if (B > 0) this.Bubble.SetTint(B === 2 ? CGold : CBlue);
      }
      this.SwSet(4, B > 0);
      const Mon = !U.Def.Amulet;
      for (let I = 5; I <= 8; I++) this.SwSet(I, Mon);
      if (Mon) {
        this.Atk.SetNum(A);
        this.Atk.SetColor(A > U.Def.Atk ? CGreen : A < U.Def.Atk ? CRed : CWhite);
        this.Hp.SetNum(U.Hp);
        this.Hp.SetColor(U.Hp < U.MaxHp ? CRed : U.Hp > U.Def.Hp ? CGreen : CWhite);
      }
      // the keyword tags only change when one of the flags does
      const Mask = ((U.Rush && U.Sleeping) ? 1 : 0) + (U.Deadly ? 2 : 0) + (U.Drain ? 4 : 0) +
        (U.Intimidate ? 8 : 0) + (U.Stealth ? 16 : 0) + (U.Def.Amulet ? 32 : 0) + (U.Silenced ? 64 : 0);
      if (Mask !== this.LastKw) {
        this.LastKw = Mask;
        const Kw = [];
        if (U.Def.Amulet) Kw.push(TkAmulet);
        if (U.Silenced) Kw.push(TkSilenced);
        if (U.Rush && U.Sleeping) Kw.push(TkRush);
        if (U.Deadly) Kw.push(TkDeadly);
        if (U.Drain) Kw.push(TkDrain);
        if (U.Intimidate) Kw.push(TkIntimidate);
        if (U.Stealth) Kw.push(TkStealth);
        this.KwTags.Set(Join(Kw, TxSpace));
      }
      this.SwSet(10, Mask > 0);
      if (U.Count !== this.LastCount) {
        this.LastCount = U.Count;
        if (U.Count > 0) this.Count.Set(TuCount(U.Count));
      }
      this.SwSet(11, U.Count > 0);
      this.SwSet(12, !!U.Evolved);
      // sleeping = summoned this turn
      this.SwSet(9, !!(ShowZzz && U.Sleeping && Mon));
    } else {
      this.LastU = null;
      for (let I = 0; I <= 12; I++) this.SwSet(I, false);
      this.SwSet(16, false);
      this.LastHid = -1;
      this.SetPrem(0);
      this.SplitOn = false;
      this.FgSw.Set(false);
    }
  }

  SetGlow(On, C) {
    if (On) {
      const K = ColorKey(C);
      if (K !== this.LastGlow) {
        this.LastGlow = K;
        this.Glow.SetTint(C);
      }
    }
    this.SwSet(15, On);
  }
}

function TuCount(N) { return `カウント${N}`; }
const TkSilenced = "効果消滅";
const TuZzz = "Zzz";

// (the click area of a slot is a separate widget above every effect, see MakeBoardUI)
function MakeUnitView(IsFoe) {
  const Glow = TexTint(CardGui.T_GlowUnit, 206, 206, GlowReady);
  const Panel = Tex(IsFoe ? CardGui.T_UnitFoe : CardGui.T_UnitMe, 170, 170);
  const Art = Tex(CardMon.f_slime, 100, 100);
  const ArtFg = Tex(CardMon.f_slime, 100, 100);
  const Taunt = Tex(CardGui.T_UnitTaunt, 170, 170);
  const Ice = Tex(CardGui.T_Freeze, 170, 170);
  const Bubble = TexTint(CardGui.T_Bubble, 170, 170, CBlue);
  const Ghost = Tex(CardMon.f_slime, 100, 100);
  const GhostVeil = new color_block({ DefaultColor: color(0.85, 0.95, 1.0), DefaultOpacity: 0.45 });
  const AtkIcon = Tex(CardGui.T_Sword, 44, 44);
  const Atk = ONum(0, 28, CWhite, CInk);
  const HpIcon = Tex(CardGui.T_Shield, 44, 44);
  const Hp = ONum(0, 28, CWhite, CInk);
  const Zzz = OText(TuZzz, 18, CBlue, CInk);
  const KwTags = OText(TxEmpty, 15, CGold, CInk);
  const Count = OText(TxEmpty, 16, CWhite, color(0.2, 0.05, 0.4));
  const Star = Tex(CardGui.T_EvoStar, 40, 40);
  const Flash = new color_block({ DefaultColor: CWhite, DefaultOpacity: 0.75 });
  Show(Flash, false);
  const Smoke = Tex(CardGui.T_Fx2_Smoke, 176, 168);
  const Sparks = IRange(0, 3).map(I => TexTint(CardGui.T_Sparkle, 24, 24, (I === 0 || I === 3) ? CGold : CWhite));
  const Sws = [
    MakeSw(Panel, true),
    MakeSw(Art, true),
    MakeSw(Taunt, true),
    MakeSw(Ice, true),
    MakeSw(Bubble, true),
    MakeSw(AtkIcon, true),
    MakeSw(Atk.Root, true),
    MakeSw(HpIcon, true),
    MakeSw(Hp.Root, true),
    MakeSw(Zzz.Root, true),
    MakeSw(KwTags.Root, true),
    MakeSw(Count.Root, true),
    MakeSw(Star, true),
    MakeSw(Ghost, false),
    MakeSw(GhostVeil, false),
    MakeSw(Glow, false),
    MakeSw(Smoke, false),
  ];
  const V = new unit_view({
    Root: new canvas({
      Slots: [
        Box(Glow, -18, -18, 206, 206, 0),
        Box(Panel, 0, 0, 170, 170, 1),
        Pin(Art, 85, 78, 2),
        Pin(ArtFg, 85, 78, 2),
        Pin(Ghost, 85, 78, 2),
        Box(GhostVeil, 12, 12, 146, 146, 3),
        Pin(Smoke, 85, 80, 3),
        Box(Ice, 0, 0, 170, 170, 3),
        Box(Bubble, 0, 0, 170, 170, 3),
        Box(Taunt, 0, 0, 170, 170, 4),
        Pin(AtkIcon, 24, 145, 6),
        Pin(Atk.Root, 26, 147, 7),
        Pin(HpIcon, 146, 145, 6),
        Pin(Hp.Root, 146, 146, 7),
        Pin(Zzz.Root, 140, 26, 7),
        Pin(KwTags.Root, 85, 20, 7),
        Pin(Count.Root, 85, 118, 7),
        Pin(Star, 26, 26, 7),
        Box(Flash, 10, 10, 150, 150, 8),
        Pin(Sparks[0], 30, 52, 7),
        Pin(Sparks[1], 142, 40, 7),
        Pin(Sparks[2], 36, 118, 7),
        Pin(Sparks[3], 140, 112, 7),
      ],
    }),
    Glow, Panel, Art, Taunt, Ice, Bubble, Ghost, GhostVeil, AtkIcon, Atk, HpIcon, Hp, Zzz, KwTags, Count, Star, Flash, Smoke,
    IsFoe, Sws, Sparks,
    SparkSws: Sparks.map(T => MakeSw(T, false)),
    ArtFg,
    FgSw: MakeSw(ArtFg, false),
  });
  V.SetUnit(null, false, 0);
  return V;
}

// ---------------------------------------------------------------- a player portrait (150 x 150)
class hero_view {
  constructor(o) {
    this.Root = o.Root;
    this.Glow = o.Glow;
    this.Pic = o.Pic;
    this.HpIcon = o.HpIcon;
    this.Hp = o.Hp;
    this.AtkIcon = o.AtkIcon;
    this.Atk = o.Atk;
    this.ShieldIcon = o.ShieldIcon;
    this.Shield = o.Shield;
    this.Flash = o.Flash;
    this.AtkSws = o.AtkSws;
    this.ShieldSws = o.ShieldSws;
    this.GlowSw = o.GlowSw;
    this.LastGlow = -1;
  }

  SetHero(CurHp, MaxHp, A, Sh) {
    this.Hp.SetNum(CurHp);
    this.Hp.SetColor(CurHp < MaxHp ? CRed : CWhite);
    for (const S of this.AtkSws) S.Set(A > 0);
    if (A > 0) this.Atk.SetNum(A);
    for (const S of this.ShieldSws) S.Set(Sh > 0);
    if (Sh > 0) this.Shield.SetNum(Sh);
  }

  SetGlow(On, C) {
    if (On) {
      const K = ColorKey(C);
      if (K !== this.LastGlow) {
        this.LastGlow = K;
        this.Glow.SetTint(C);
      }
    }
    this.GlowSw.Set(On);
  }
}

function MakeHeroView(Pic) {
  const Glow = TexTint(CardGui.T_GlowUnit, 186, 186, GlowReady);
  const P = Tex(Pic, 150, 150);
  const HpIcon = Tex(CardGui.T_Heart, 54, 54);
  const Hp = ONum(20, 30, CWhite, CInk);
  const AtkIcon = Tex(CardGui.T_Sword, 50, 50);
  const Atk = ONum(0, 30, CGold, CInk);
  const ShieldIcon = Tex(CardGui.T_ShieldBlue, 56, 56);
  const Shield = ONum(0, 26, CWhite, color(0.02, 0.08, 0.25));
  const Flash = new color_block({ DefaultColor: CWhite, DefaultOpacity: 0.75 });
  Show(Flash, false);
  return new hero_view({
    Root: new canvas({
      Slots: [
        Box(Glow, -18, -18, 186, 186, 0),
        Box(P, 0, 0, 150, 150, 1),
        Pin(HpIcon, 128, 128, 3),
        Pin(Hp.Root, 128, 126, 4),
        Pin(AtkIcon, 22, 128, 3),
        Pin(Atk.Root, 24, 129, 4),
        Pin(ShieldIcon, 128, 24, 3),
        Pin(Shield.Root, 128, 22, 4),
        Box(Flash, 9, 9, 132, 132, 5),
      ],
    }),
    Glow, Pic: P, HpIcon, Hp, AtkIcon, Atk, ShieldIcon, Shield, Flash,
    AtkSws: [MakeSw(AtkIcon, false), MakeSw(Atk.Root, false)],
    ShieldSws: [MakeSw(ShieldIcon, false), MakeSw(Shield.Root, false)],
    GlowSw: MakeSw(Glow, false),
  });
}

// ---------------------------------------------------------------- damage / heal pop-up (130 x 130)
class popup_view {
  constructor(o) { this.Root = o.Root; this.Burst = o.Burst; this.Num = o.Num; }
}

function MakePopup() {
  const B = Tex(CardGui.T_Burst, 130, 130);
  const N = OText(TxEmpty, 34, CWhite, CInk);
  return new popup_view({ Root: new canvas({ Slots: [Pin(B, 65, 65, 0), Pin(N.Root, 65, 63, 1)] }), Burst: B, Num: N });
}

// ---------------------------------------------------------------- a picture button (texture + label + hit)
class pic_button {
  constructor(o) { this.Root = o.Root; this.Face = o.Face; this.Label = o.Label; this.Glow = o.Glow; }
}

// Face: BtnGold / BtnBlue / BtnPurple / BtnEnd (the texture made for the button's shape is picked)
// (menu buttons have no glow: a square glow stuck out of the round buttons; Glow is a stand-in that is never drawn)
function MakePicButton(Face, Label, W, H, Size, Hit) {
  return MakePicButtonG(Face, Label, W, H, Size, Hit, false);
}

// UseGlow: a rim of the button's own shape lights up around it (the battle's 進化 / ターン終了)
function MakePicButtonG(Face, Label, W, H, Size, Hit, UseGlow) {
  const F = Tex(BtnTex(Face, W, H), W, H * 1.08);
  const L = OText(Label, Size, CWhite, CInk);
  const G = TexTint(BtnTex(Face, W, H), W + 16, H * 1.08 + 14, GlowSel);
  Show(G, false);
  let Slots = [Box(F, 0, 0, W, H * 1.08, 1), Pin(L.Root, W / 2, H / 2, 2), Box(Hit, 0, 0, W, H, 20)];
  if (UseGlow) Slots = [...Slots, Box(G, -8, -7, W + 16, H * 1.08 + 14, 0)];
  return new pic_button({ Root: new canvas({ Slots }), Face: F, Label: L, Glow: G });
}
