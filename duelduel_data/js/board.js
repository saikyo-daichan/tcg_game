// board.js — card_board_ui.verse: the battle screen of one player (built once, then only updated): board, hands, log,
// card details, graves, the mulligan / surrender / grave dialogs, the cursor shared by every screen and the small
// effects. A board_ui always shows the match from its own side (Who); the menus (menus.js) put their screens on the
// same Root (Layer / Root.AddWidget) and read input with Pick / PickPaged / PickScroll / PickTimed / WaitInput.
//
// Ported 1:1 (same coordinates, sizes, z orders, texts). Browser changes / additions:
// - GetPlayerUI: Attach puts Root.el into StageEl; Close takes it off. UI.SetFocus (controller focus) has no stand-in.
// - Verse `race` cancelled the losing branch. Here: WaitInput throws FlowAbort (kit) when FlowGen changed while it
//   waited, when it was cancelled (the token of PickUntil / PickTimed / PremiumShow races), or when a newer input wait
//   started on this board (a wait left behind by somebody's race dies before the new one starts, so its `defer`s =
//   finally blocks run first). `await B.CancelWait()` kills a wait left behind on purpose (after your own race).
//   Pick* / WaitInput take an optional last argument Tok ({Dead}) used for that; callers don't pass it.
// - Esc / Backspace (KeyBack) cancels like X / I (NavCancel) — in Fortnite the Back button was the game's own.
// - Drag and drop (kit: press A, let go on B = click A, then click B): see hit_hub.OnClicked and the Drag* methods of
//   board_ui. Dragging a card / monster / jewel that is already selected doesn't unselect it; a drop after a drag
//   start that selected nothing is ignored; a no-target spell / jewel skill dropped on empty board space (above the
//   hand) is used (= choosing it again); dropped anywhere else on empty space / back on itself: the selection is
//   cancelled (= clicking empty space, id 99). Things that can't be a drag source have Draggable = false.
// - Moving animations (Shake, lunge, drop-in, flying cards, pop-ups, coin) move the widget's slot in place
//   (BdReBox / BdRePin) instead of taking it off and putting it on again every frame.
'use strict';

// ---------------------------------------------------------------- layout (matches T_Bg)
const LBoardX0 = 687.0;
const LCell = 170.0;
const LGap = 18.0;
const LRowFoe = 232.0;
const LRowMe = 450.0;
function CellX(C) { return LBoardX0 + (LCell + LGap) * C; }

// The click areas of the board (z 60, hand 70+) sit above every effect (pop-ups 51, effects 52, toast 53, cast 54, banner 55,
// stamps 56, flying card 50) but below the overlays (85+): a widget that covers a click area and then goes away
// leaves it "not hovered", and the next click on it is lost until the mouse moves.
function HandHitZ(I) { return 70 + I; }

// a stand-in for the click area inside a picture button whose real click area is a separate widget
function NoHit() { return new color_block({ DefaultColor: CWhite, DefaultOpacity: 0.0 }); }

// returned by WaitInput when the cancel button (X / I) is pressed
const NavCancel = -2;
// returned by PickPaged: LT / RT (Z / C) turn the page; LB / RB went past the last / first item
const NavPageNext = -6;
const NavPagePrev = -7;
const NavEdgeNext = -4;
const NavEdgePrev = -5;
// returned by PickScroll when the cursor steps past the edge of a scrolling list: NavScroll - Dir
// (Dir 0 RB / next, 1 LB / prev, 2 RT / down, 3 LT / up)
const NavScroll = -100;

// the grave list
const GraveCols = 8;
const GravePer = 24;

class rect {
  constructor(o = {}) { this.X = o.X ?? 0; this.Y = o.Y ?? 0; this.W = o.W ?? 0; this.H = o.H ?? 0; }
}
const BdRect = (X, Y, W, H) => new rect({ X, Y, W, H });

// x position of the first hand card and the spacing for N cards
function HandLayout(N) {
  const Spacing = N <= 1 ? 0 : Min(162, 760 / (N - 1));
  return [960 - (Spacing * (N - 1) + 150) / 2, Spacing];
}

// ---------------------------------------------------------------- small browser helpers (local to this file)
// moves a widget that already sits in Cv by a fixed-size slot (or puts it on)
function BdReBox(Cv, W, X, Y, Wd, Ht, Z) {
  const S = W.Slot;
  if (W.Parent === Cv && W.SlotEl && S && !S.Full && !S.SizeToContent) {
    const st = W.SlotEl.style;
    st.left = X + 'px'; st.top = Y + 'px'; st.width = Wd + 'px'; st.height = Ht + 'px'; st.zIndex = Z;
    S.X = X; S.Y = Y; S.W = Wd; S.H = Ht; S.ZOrder = Z;
    return;
  }
  Cv.RemoveWidget(W);
  Cv.AddWidget(RBox(W, X, Y, Wd, Ht, Z));
}
// the same for a centred size-to-content slot (RPin)
function BdRePin(Cv, W, X, Y, Z) {
  const S = W.Slot;
  if (W.Parent === Cv && W.SlotEl && S && S.SizeToContent && S.AX === 0.5 && S.AY === 0.5) {
    const st = W.SlotEl.style;
    st.left = X + 'px'; st.top = Y + 'px'; st.zIndex = Z;
    S.X = X; S.Y = Y; S.ZOrder = Z;
    return;
  }
  Cv.RemoveWidget(W);
  Cv.AddWidget(RPin(W, X, Y, Z));
}
// waits for the first of several VEvents: -> [tag, value]; the waiters left on the other events are taken off
function BdAwaitAny(Evs) {
  return new Promise(res => {
    const Fns = [];
    let Done = false;
    const Fire = (I, V) => {
      if (Done) return;
      Done = true;
      Evs.forEach((P, J) => { const L = P[0].waiters, K = L.indexOf(Fns[J]); if (K >= 0) L.splice(K, 1); });
      res([Evs[I][1], V]);
    };
    Evs.forEach((P, I) => { const F = V => Fire(I, V); Fns.push(F); P[0].waiters.push(F); });
  });
}
// Verse struct equality for tgt (Arr.Find[T])
function BdTgtIn(Arr, T) { return Arr.some(X => X.Side === T.Side && X.Col === T.Col); }
function BdSameXYs(A, B) {
  if (A.length !== B.length) return false;
  for (let I = 0; I < A.length; I++) if (A[I].X !== B[I].X || A[I].Y !== B[I].Y) return false;
  return true;
}
// [int]logic given as a Map or a plain object
function BdEdge(E, K) { if (!E) return false; return E instanceof Map ? !!E.get(K) : !!E[K]; }
const BdFlush = () => new Promise(r => setTimeout(r, 0));
// where the pointer went down / up last (for drag and drop)
const BoardPointer = { DownT: -1, UpT: -1, X: 0, Y: 0 };
window.addEventListener('pointerdown', () => { BoardPointer.DownT = performance.now(); }, true);
window.addEventListener('pointerup', e => {
  BoardPointer.UpT = performance.now();
  if (StageEl) { const P = PageToStage(e.clientX, e.clientY); BoardPointer.X = P.X; BoardPointer.Y = P.Y; }
}, true);

// ---------------------------------------------------------------- the click hub
// Every clickable thing is a transparent WBP_CardHit; clicks and hovers are forwarded as ids.
class hit_hub {
  constructor() {
    this.Clicks = new VEvent();
    this.Hovers = new VEvent();
    this.Quit = new VEvent();
    this.Ws = new Map();
    this.LastClick = 0;
    this.LastClickAt = -100;
    this.ClickFresh = false;
    // drag and drop (browser): the board_ui sets DragStartSkip(Id) -> true = ignore the click of a drag start,
    // DragDropMap(From, To) -> the id the drop clicks (null = nothing)
    this.DragActive = false;
    this.DragFrom = -1;
    this.DragDownT = -1;
    this.DragStartSkip = null;
    this.DragDropMap = null;
  }

  Make(Id) {
    const H = new WBP_CardHit();
    H._hubId = Id;
    this.Ws.set(Id, H);
    spawn(() => this.Watch(H, Id));
    return H;
  }

  async Watch(H, Id) {
    let Done = false;
    const Q = this.Quit.Await().then(() => { Done = true; });
    const Clicks = async () => { for (;;) { await H.Clicked.Await(); if (Done) return; this.OnClicked(H, Id); } };
    const Hovers = async () => { for (;;) { await H.Hovered.Await(); if (Done) return; this.Hovers.Signal(Id); } };
    await Race(Clicks(), Hovers(), Q);
  }

  // a click (or the start / the end of a drag)
  OnClicked(H, Id) {
    const d = HitInput.down;
    let To = Id;
    if (d && d.dragging && d.hit === H) {
      // a drag starts on this hit: it is picked (the kit clicks it)
      this.DragActive = true;
      this.DragFrom = Id;
      this.DragDownT = BoardPointer.DownT;
      this.DragSkipped = false;
      try { if (this.DragStartSkip && this.DragStartSkip(Id)) { this.DragSkipped = true; return; } } catch (e) { console.error(e); }
    } else if (this.DragActive && !d && BoardPointer.DownT === this.DragDownT) {
      // the drop of that drag
      this.DragActive = false;
      if (this.DragDropMap) {
        try { To = this.DragDropMap(this.DragFrom, Id); } catch (e) { console.error(e); }
        if (To == null) return;
      }
    } else {
      this.DragActive = false;
    }
    this.Fire(To);
  }

  Fire(Id) {
    this.LastClick = Id;
    this.LastClickAt = GetSimulationElapsedTime();
    this.ClickFresh = true;
    this.Clicks.Signal(Id);
  }
}

// ---------------------------------------------------------------- the battle screen
class board_ui {
  constructor(o) {
    // P Lib Hub Keys Sfx Root Fx Units(0..2 own, 3..5 enemy) MeHero FoeHero Hand(9) HandHits FoeBacks DeckMe DeckFoe
    // ManaMe ManaFoe ManaMeTxt ManaFoeTxt JewelMe JewelFoe JewelMeGlow JewelFoeGlow JewelMeCost JewelFoeCost EndTurn
    // Evolve EvoFoe TurnTxt TimerTxt DeckMeTxt DeckFoeTxt GraveMe GraveFoe GraveMeTxt GraveFoeTxt NaviPic NaviName NaviTxt
    // OppName HintTxt LogLines Detail DetailHelp DetailHint HelpBox Pops Fly Corners ToastTxt BannerTxt CastFace CastLabel
    // TrigFace TrigLabel MullSlot BannerSlot CastSlot TrigSlot ConfirmSlot GraveSlot StampSlot Stamps MullFaces MullMarks
    // MullTimer GraveFaces GraveTitle GravePageTxt GraveEmpty GraveBig GraveHelp TutSlot TutCanvas TutHead TutText
    // TutBtnSlot NoticeSlot NoticeTxt GraveCloseLbl SumRays SumRaysB SumRing SumFlash SumText SumSparks SpinPanel SpinArt
    // SpinSlot SpinCanvas SpinFrame SpinArtBig SpinBack SpinFace SpinLabel SpinSub CoinSlot CoinCanvas CoinPic CoinTxt
    // CoinShadow CoinRays Pics CoinPics SpinGlow  (all passed by MakeBoardUI)
    this.RayOwn = 0;
    this.FlashOwn = 0;
    this.CallOwn = 0;
    this.NoticeGen = 0;
    // card faces with プレミア animation (the hand, details, the menus' cards) and the step counter
    this.AnimFaces = [];
    this.AnimK = 0;
    this.TrigGen = 0;
    // LT / RT turn pages and LB / RB stop at the ends (PickPaged)
    this.Paging = false;
    // PickScroll: (item id * 4 + Dir) -> the list scrolls when the cursor leaves that item that way
    this.EdgeMap = null;
    this.SumGen = 0;
    this.Bounds = new Map();
    this.Match = null;
    this.Who = 0;
    this.LogBuf = [];
    this.HandXY = [];
    this.PopNext = 0;
    this.ToastGen = 0;
    this.BannerGen = 0;
    this.Opened = false;
    this.GraveCards = [];
    this.GravePage = 0;
    // controller / keyboard cursor (also drawn around what the mouse points at)
    this.Nav = false;
    this.MouseCur = false;
    this.CurId = -1;
    this.NavSmart = [];
    this.NavAll = [];
    this.CursorShown = false;
    this.Waiting = false;     // the cursor is only shown while input is awaited
    this.LastPad = false;
    // what Refresh showed last time (only changes are sent to the widgets)
    this.LastFoeHand = -1;
    this.LastManaMe = -1;
    this.LastManaFoe = -1;
    this.LastJewels = -1;
    this.LastJewelGlow = -99;
    this.LastEvo = -1;
    this.LastEvoFoe = -1;
    this.LastTurn = -1;
    this.LastEndGlow = -1;
    this.LastGraveMe = -1;
    this.LastGraveFoe = -1;
    this.CursorAt = -99;
    this.HandTop = -1;
    this.StampGen = 0;
    // (browser) the input waits: see the note at the top
    this.WaitGen = 0;
    this.WaitActive = 0;
    this.WaitWake = new VEvent();
    this.DragNowhereFn = null;
    Object.assign(this, o);
  }

  // ------------------------------------------------------------ open / close
  Open() {
    if (this.Opened) return;
    this.Opened = true;
    this.Attach();
    this.UpdateHints();
    this.DragNowhereFn = Hit => this.OnDragNowhere(Hit);
    DragDropNowhere = this.DragNowhereFn;
    spawn(() => this.HoverLoop());
    spawn(() => this.CursorLoop());
    spawn(() => this.AnimLoop());
  }

  // a flag that turns true when the screen is closed (Verse: race with Hub.Quit.Await())
  QuitFlag() {
    const Q = { Done: false };
    Q.P = this.Hub.Quit.Await().then(() => { Q.Done = true; });
    return Q;
  }

  // the プレミア animations (sparkles, moving art) of every card face and board slot
  async AnimLoop() {
    const Q = this.QuitFlag();
    // (10 steps a second: every step re-sizes a few pictures of each プレミア card on the screen)
    while (!Q.Done) {
      await Sleep(0.1);
      if (Q.Done) break;
      this.AnimK += 1;
      try {
        for (const F of this.AnimFaces) F.Tick(this.AnimK);
        for (const U of this.Units) U.Tick(this.AnimK);
        this.SpinFace.Tick(this.AnimK);
      } catch (e) { console.error(e); }
    }
  }

  Attach() {
    if (!StageEl) return;
    const el = this.Root.el;
    const st = el.style;
    st.position = 'absolute'; st.left = '0px'; st.top = '0px';
    st.width = STAGE_W + 'px'; st.height = STAGE_H + 'px'; st.zIndex = '10';
    if (el.parentNode) el.parentNode.removeChild(el);
    StageEl.appendChild(el);
  }

  // puts the whole screen on again (after a respawn); every screen keeps its state
  Reattach() {
    if (this.Opened) this.Attach();
  }

  Close() {
    if (!this.Opened) return;
    this.Opened = false;
    this.Hub.Quit.Signal();
    const el = this.Root.el;
    if (el.parentNode) el.parentNode.removeChild(el);
    if (DragDropNowhere === this.DragNowhereFn) DragDropNowhere = null;
  }

  Snd(Id) { this.Sfx.Play(this.P, Id); }

  AddBounds(Id, R) { this.Bounds.set(Id, R); }

  Bind(M, W) {
    this.Match = M;
    this.Who = W;
    const Mine = M.S(W);
    const Opp = M.S(1 - W);
    this.MeHero.Pic.SetImage(Mine.HeroPic());
    this.FoeHero.Pic.SetImage(Opp.HeroPic());
    this.JewelMe.SetImage(Mine.Hero.JewelPic);
    this.JewelFoe.SetImage(Opp.Hero.JewelPic);
    this.NaviPic.SetImage(Mine.HeroPic());
    this.NaviName.Set(Mine.Name);
    this.OppName.Set(Opp.Level > 0 ? TbVsNameLv(Opp.Name, Opp.HName(), Opp.Level) : TbVsName(Opp.Name, Opp.HName()));
    this.DeckMe.SetImage(CardBackTex(Mine.Back));
    this.DeckFoe.SetImage(CardBackTex(Opp.Back));
    for (const B of this.FoeBacks) B.SetImage(CardBackTex(Opp.Back));
    this.HandXY = [];
    this.ResetShown();
    this.ShowDetailHint();
    this.SetTimer(TxEmpty, false);
    for (const V of this.Units) V.SetGhost(null);
  }

  // overlays are taken off the screen when hidden (hidden widgets would still catch the mouse)
  Layer(S, On) {
    this.Root.RemoveWidget(S.Widget);
    if (On) this.Root.AddWidget(S);
  }

  SetTimer(M, Urgent) {
    this.TimerTxt.Set(M);
    this.TimerTxt.SetColor(Urgent ? CRed : CGold);
  }

  // ------------------------------------------------------------ refresh from the match state
  // Ready = what can act now (computed once per refresh, it is not cheap)  -> [On, colour]
  GlowFor(M, Id, MyTurn, Targets, Ready) {
    const Who = this.Who;
    // a card of the hand is being picked by an effect (大安売り)
    if (M.HandPick && M.Current === Who && Id >= 0 && Id <= 8) return [true, GlowPlace];
    if (M.PickTgts.length > 0 && M.Current === Who) {
      const T = TgtOfUi(Id);
      if (T && BdTgtIn(M.PickTgts, Loc(Who, T))) return [true, GlowAttack];
      return [false, GlowReady];
    }
    if (!MyTurn) return [false, GlowReady];
    if (M.Sel === Id) return [true, GlowSel];
    if (Targets.includes(Id)) {
      if (Id >= 20 && Id <= 31) return [true, GlowAttack];
      return [true, GlowPlace];
    }
    if (Ready.includes(Id)) return [true, GlowReady];
    return [false, GlowReady];
  }

  Refresh(M) {
    const Who = this.Who;
    const Root = this.Root;
    const Mine = M.S(Who);
    const Opp = M.S(1 - Who);
    const MyTurn = !!(M.Current === Who && !M.Ended && !M.Busy);
    const Targets = MyTurn ? M.TargetIds(Who, M.Sel) : [];
    const Ready = (MyTurn && M.Sel < 0 && !M.Pend) ? M.ReadyIds(Who) : [];
    // board (local side 0 = own)
    for (let LS = 0; LS <= 1; LS++) {
      for (let C = 0; C <= 2; C++) {
        const V = this.Units[LS * 3 + C];
        if (!V) continue;
        const G = LS === 0 ? Who : 1 - Who;
        const Cell = At(M.S(G).Board, C) || null;
        V.SetUnit(Cell, LS === 0 && M.Current === Who, M.AtkAt(G, C));
        if (Cell) V.SetGhost(null);
        const Gl = this.GlowFor(M, UiUnit(LS, C), MyTurn, Targets, Ready);
        V.SetGlow(Gl[0], Gl[1]);
      }
    }
    if (M.Sel < 0 || !MyTurn) this.ClearGhosts();
    // players
    this.MeHero.SetHero(Max(0, Mine.Hp), Mine.MaxHp, Mine.HeroAtk, Mine.Shield);
    this.FoeHero.SetHero(Max(0, Opp.Hp), Opp.MaxHp, Opp.HeroAtk, Opp.Shield);
    const G30 = this.GlowFor(M, 30, MyTurn, Targets, Ready);
    this.MeHero.SetGlow(G30[0], G30[1]);
    const G31 = this.GlowFor(M, 31, MyTurn, Targets, Ready);
    this.FoeHero.SetGlow(G31[0], G31[1]);
    // hand
    const N = Mine.Hand.length;
    const L = HandLayout(N);
    const NewXY = [];
    for (let I = 0; I <= CardMaxHand - 1; I++) NewXY.push(I < N ? V2(L[0] + L[1] * I, 828) : V2(-500, 828));
    if (!BdSameXYs(NewXY, this.HandXY)) {
      // only the cards that moved are put again (a widget put again under the mouse misses the next click)
      this.Hand.forEach((F, I) => {
        const XY = NewXY[I];
        if (!XY) return;
        const Old = this.HandXY[I];
        const Moved = !(Old && Old.X === XY.X && Old.Y === XY.Y);
        const Hit = this.HandHits[I];
        if (Moved && Hit) {
          Root.RemoveWidget(F.Root);
          Root.RemoveWidget(Hit);
          if (I < N) {
            Root.AddWidget(RBox(F.Root, XY.X, XY.Y, 150, 214, this.HandZ(I)));
            Root.AddWidget(RBox(Hit, XY.X, XY.Y, 150, 214, HandHitZ(I)));
          }
        }
      });
      this.HandXY = NewXY;
      this.HandTop = -1;
    }
    this.Hand.forEach((F, I) => {
      const H = Mine.Hand[I];
      if (H) {
        const D = H.Def;
        F.SetCard(this.Lib, D, D.Atk, D.Hp, D.Hp);
        F.SetGotKw(this.Lib, H.GotKw);
        F.SetCost(H.Cost);
        F.SetPrem(Mine.PremOf(D.Id));
        F.SetShown(true);
        const Gl = this.GlowFor(M, I, MyTurn, Targets, Ready);
        F.SetGlow(Gl[0], Gl[1]);
      } else {
        F.SetShown(false);
      }
    });
    if (Opp.Hand.length !== this.LastFoeHand) {
      this.LastFoeHand = Opp.Hand.length;
      this.FoeBacks.forEach((B, I) => Show(B, I < Opp.Hand.length));
    }
    // mana
    const KM = Mine.Mana * 100 + Mine.MaxMana;
    if (KM !== this.LastManaMe) {
      this.LastManaMe = KM;
      this.SetMana(this.ManaMe, Mine);
      this.ManaMeTxt.Set(TxSlash(Mine.Mana, Mine.MaxMana));
    }
    const KF = Opp.Mana * 100 + Opp.MaxMana;
    if (KF !== this.LastManaFoe) {
      this.LastManaFoe = KF;
      this.SetMana(this.ManaFoe, Opp);
      this.ManaFoeTxt.Set(TxSlash(Opp.Mana, Opp.MaxMana));
    }
    // jewels
    this.JewelMeCost.SetNum(M.JewelCost(Who));
    this.JewelFoeCost.SetNum(M.JewelCost(1 - Who));
    const KJ = (Mine.JewelUsed ? 1 : 0) + (Opp.JewelUsed ? 2 : 0);
    if (KJ !== this.LastJewels) {
      this.LastJewels = KJ;
      this.JewelMe.SetTint(Mine.JewelUsed ? CGrey : CWhite);
      this.JewelFoe.SetTint(Opp.JewelUsed ? CGrey : CWhite);
    }
    const G40 = this.GlowFor(M, 40, MyTurn, Targets, Ready);
    const KG = G40[0] ? ColorKey(G40[1]) : -2;
    if (KG !== this.LastJewelGlow) {
      this.LastJewelGlow = KG;
      this.JewelMeGlow.SetTint(G40[1]);
      Show(this.JewelMeGlow, G40[0]);
    }
    // evolve: dark until the evolve turn, bright (and glowing when a monster can evolve) once it can be used
    const Reached = Mine.EvoLeft > 0 && Mine.Turns >= M.EvoTurn(Who);
    const CanEvo = MyTurn && Reached && !Mine.EvoUsed;
    const Evolvable = [0, 1, 2].filter(C => M.EvoOk(Who, C));
    const EvoGlow = Targets.includes(UiEvolve) ? true : (CanEvo && M.Sel < 0 && !M.Pend && Evolvable.length > 0);
    const EvoWait = Max(0, M.EvoTurn(Who) - Mine.Turns);
    const KE = Mine.EvoLeft * 10000 + EvoWait * 100 + (CanEvo ? 10 : 0) + (EvoGlow ? 1 : 0) + (Reached ? 1000 : 0);
    if (KE !== this.LastEvo) {
      this.LastEvo = KE;
      this.Evolve.Label.Set(Mine.EvoLeft <= 0 ? TbEvolve(0) : Reached ? TbEvolve(Mine.EvoLeft) : TbEvoIn(EvoWait));
      this.Evolve.Face.SetTint(CanEvo ? CWhite : EvoDark);
      this.Evolve.Label.SetColor(CanEvo ? CWhite : CGrey);
      Show(this.Evolve.Glow, EvoGlow);
    }
    if (Opp.EvoLeft !== this.LastEvoFoe) {
      this.LastEvoFoe = Opp.EvoLeft;
      this.EvoFoe.Set(TbEvoFoe(Opp.EvoLeft));
    }
    // turn / buttons
    const IsEnd = M.Ended ? 1 : 0;
    const KT = IsEnd * 1000 + (M.Current === Who ? 100 : M.Current >= 0 ? 200 : 0) + (MyTurn ? 10 : 0);
    if (KT !== this.LastTurn) {
      this.LastTurn = KT;
      this.TurnTxt.Set(M.Ended ? TxEmpty : M.Current === Who ? TbMyTurn : M.Current >= 0 ? TbTheirTurn : TxEmpty);
      this.EndTurn.Label.Set(M.Current === Who ? TbEndTurn : TbTheirTurnBtn);
      this.EndTurn.Face.SetTint(MyTurn ? CWhite : CGrey);
    }
    const EndGlow = (MyTurn && M.Sel < 0 && !M.Pend && Ready.length === 0) ? 1 : 0;
    if (EndGlow !== this.LastEndGlow) {
      this.LastEndGlow = EndGlow;
      Show(this.EndTurn.Glow, EndGlow === 1);
    }
    // piles
    this.DeckMeTxt.SetNum(Mine.Deck.length);
    this.DeckFoeTxt.SetNum(Opp.Deck.length);
    if (Mine.Grave.length !== this.LastGraveMe) {
      this.LastGraveMe = Mine.Grave.length;
      this.ShowGraveTop(this.GraveMe, this.GraveMeTxt, Mine);
    }
    if (Opp.Grave.length !== this.LastGraveFoe) {
      this.LastGraveFoe = Opp.Grave.length;
      this.ShowGraveTop(this.GraveFoe, this.GraveFoeTxt, Opp);
    }
  }

  HandZ(I) { return 30 + I; }

  // ids of the battle board (hand, slots, players, jewels, graves)  (<decides>: true / false)
  OnBoardId(Id) {
    if (!this.Match) return false;
    return (Id >= 0 && Id <= 8) || (Id >= 10 && Id <= 12) || (Id >= 20 && Id <= 22) || Id === 30 || Id === 31 || Id === 40 || Id === 42 || Id === 45 || Id === 46;
  }

  // the 喜怒哀楽 menu (-1 = closed)
  async PickStamp() {
    this.Layer(this.StampSlot, true);
    try {
      const Old = this.CurId;
      this.CurId = 700;
      const Id = await this.Pick([700, 701, 702, 703, 704], 700, 704);
      this.CurId = Old;
      if (Id >= 700 && Id <= 703) {
        this.Snd(SfxSelect);
        return Id - 700;
      }
      return -1;
    } finally {
      this.Layer(this.StampSlot, false);
    }
  }

  // L = local side (0 own, 1 opponent), K = 0 喜 1 怒 2 哀 3 楽
  ShowStamp(L, K) {
    const T = this.Stamps[L];
    if (T) {
      T.SetImage(K === 1 ? CardGui.T_Stamp1 : K === 2 ? CardGui.T_Stamp2 : K === 3 ? CardGui.T_Stamp3 : CardGui.T_Stamp0);
      Show(T, true);
      this.StampGen += 1;
      const Gen = this.StampGen;
      spawn(() => this.StampEnd(T, Gen));
    }
    this.Snd(SfxFlip);
  }

  async StampEnd(T, Gen) {
    await Sleep(3.0);
    if (Gen === this.StampGen) Show(T, false);
  }

  // the hand card under the cursor is drawn above the others (-1: none)
  RaiseHand(Id) {
    if (Id === this.HandTop) return;
    for (const Old of [this.HandTop, Id]) {
      if (Old < 0) continue;
      const F = this.Hand[Old], XY = this.HandXY[Old];
      if (!F || !XY) continue;
      this.Root.RemoveWidget(F.Root);
      const Z = Old === Id ? 60 : this.HandZ(Old);
      this.Root.AddWidget(RBox(F.Root, XY.X, XY.Y, 150, 214, Z));
    }
    this.HandTop = Id;
  }

  // forget what was shown (a new match starts)
  ResetShown() {
    this.LastFoeHand = -1;
    this.LastManaMe = -1;
    this.LastManaFoe = -1;
    this.LastJewels = -1;
    this.LastJewelGlow = -99;
    this.LastEvo = -1;
    this.LastEvoFoe = -1;
    this.LastTurn = -1;
    this.LastEndGlow = -1;
    this.LastGraveMe = -1;
    this.LastGraveFoe = -1;
  }

  ShowGraveTop(F, T, Sd) {
    T.Set(TbGraveCount(Sd.Grave.length));
    const D = Sd.Grave[Sd.Grave.length - 1];
    if (D) {
      F.SetCard(this.Lib, D, D.Atk, D.Hp, D.Hp);
      F.SetShown(true);
    } else {
      F.SetShown(false);
    }
  }

  SetMana(Gems, Sd) {
    Gems.forEach((T, I) => {
      if (I < Sd.Mana) {
        T.SetImage(CardGui.T_ManaOn);
        Show(T, true);
      } else if (I < Sd.MaxMana) {
        T.SetImage(CardGui.T_ManaOff);
        Show(T, true);
      } else {
        Show(T, false);
      }
    });
  }

  ClearGhosts() {
    for (const V of this.Units) V.SetGhost(null);
  }

  // ------------------------------------------------------------ detail panel (hover / cursor)
  async HoverLoop() {
    const Q = this.QuitFlag();
    const A = async () => {
      for (;;) {
        const Id = await this.Hub.Hovers.Await();
        if (Q.Done) return;
        try {
          this.OnHover(Id);
          // the mouse (or the controller focus) moves the cursor too
          if (this.NavSmart.includes(Id) || this.NavAll.includes(Id)) {
            this.CurId = Id;
            if (!this.Nav) this.MouseCur = true;
          } else if (this.Keys.Pad && this.Nav && this.Waiting && Id !== this.CurId) {
            // the d-pad moved the focus onto something that can't be chosen now: on to the nearest item that way
            this.FocusSnap(Id);
          }
        } catch (e) { console.error(e); }
      }
    };
    const B = async () => {
      for (;;) {
        await Sleep(0.5);
        if (Q.Done) return;
        if (this.Keys.Pad !== this.LastPad) {
          this.LastPad = this.Keys.Pad;
          this.UpdateHints();
          if (this.Keys.Pad) this.SetNavOn(true);
        }
      }
    };
    await Race(A(), B(), Q.P);
  }

  UpdateHints() {
    this.HintTxt.SetText(this.Keys.Pad ? TbHintPad : TbHintMouse);
  }

  ShowDetailHint() {
    this.Detail.SetShown(false);
    Show(this.DetailHint, true);
    Show(this.HelpBox, false);
    this.DetailHelp.SetText(TxEmpty);
  }

  ShowDetail(D, A, H, MaxH, Extra) { this.ShowDetailX(D, A, H, MaxH, Extra, D.Cost, 0); }

  // Cost: the mana it costs / was played for, Prem: its プレミア level (Extra: a message or null)
  ShowDetailX(D, A, H, MaxH, Extra, Cost, Prem) {
    this.Detail.SetCard(this.Lib, D, A, H, MaxH);
    this.Detail.SetCost(Cost);
    this.Detail.SetPrem(Prem);
    this.Detail.SetShown(true);
    Show(this.DetailHint, false);
    Show(this.HelpBox, true);
    this.DetailHelp.SetText(Extra != null && Extra !== false ? Join([Extra, this.Lib.HelpOf(D)], TxNewline) : this.Lib.HelpOf(D));
  }

  // the leader's info plus what 冥府女帝 gave it
  LeaderPowers(Sd, Base) {
    const Id = Sd.EndSummons[0];
    const D = Id !== undefined ? this.Lib.DB[Id] : undefined;
    return D ? TbLeaderEnd(Base, D.Name, Sd.EndSummons.length) : Base;
  }

  ShowInfo(M) {
    this.Detail.SetShown(false);
    Show(this.DetailHint, false);
    Show(this.HelpBox, true);
    this.DetailHelp.SetText(M);
  }

  JewelInfo(Sd) {
    const H = Sd.Hero;
    const Base = TbJewelInfo(H.JewelName, H.Name, H.Cost, JewelText(this.Lib.DB, H), Sd.JewelUsed ? TbJewelUsed : TxEmpty);
    // the monster the jewel summons
    if ((H.Jewel.K === fx_kind.SummonAt || H.Jewel.K === fx_kind.Summon) && H.Jewel.C >= 0) {
      const D = this.Lib.DB[H.Jewel.C];
      if (D) return Join([Base, ThSummons, SummonInfo(this.Lib.DB, D)], TxNewline);
    }
    return Base;
  }

  // 「進化すると 攻撃力2→4 / 体力3→5」 and what its evolve effect does
  EvoPreview(U, A0) {
    const D = U.Def;
    const Base = TbEvoAfter(A0, A0 + D.EvoAtk, U.Hp, U.Hp + D.EvoHp);
    return U.Live(D.Evo).K !== fx_kind.None ? Join([Base, TtEvo(FxText2(this.Lib.DB, D.Evo, D.Evo2, false))], TxNewline) : Base;
  }

  // keywords a monster got from effects (null = none)
  GivenText(U) {
    const K = [];
    const Help = [];
    if (U.Taunt && !U.Def.Taunt) { K.push(TkTaunt); Help.push(ThTaunt); }
    if (U.Haste && !U.Def.Haste) { K.push(TkHaste); Help.push(ThHaste); }
    if (U.Rush && !U.Def.Rush) { K.push(TkRush); Help.push(ThRush); }
    if (U.Deadly && !U.Def.Deadly) { K.push(TkDeadly); Help.push(ThDeadly); }
    if (U.Drain && !U.Def.Drain) { K.push(TkDrain); Help.push(ThDrain); }
    if (U.Barrier && !U.Def.Barrier) { K.push(TkBarrier); Help.push(ThBarrier); }
    if (U.Stealth && !U.Def.Stealth) { K.push(TkStealth); Help.push(ThStealth); }
    if (U.Intimidate && !U.Def.Intimidate) { K.push(TkIntimidate); Help.push(ThIntimidate); }
    let L = [];
    if (U.Silenced) L = [...L, TbSilencedNote];
    if (K.length > 0) L = [...L, ThGiven(Join(K, TxDot)), ...Help];
    if (U.Evolved) L = [...L, TbEvolvedNote];
    if (U.Count > 0) L = [...L, TbCountNote(U.Count)];
    return L.length > 0 ? Join(L, TxNewline) : null;
  }

  OnHover(Id) {
    if (Id >= 200 && Id < 200 + GravePer) {
      const D = this.GraveCards[this.GravePage * GravePer + Id - 200];
      if (D) {
        this.GraveBig.SetCard(this.Lib, D, D.Atk, D.Hp, D.Hp);
        this.GraveBig.SetShown(true);
        this.GraveHelp.SetText(Join([this.Lib.TextOf(D), this.Lib.HelpOf(D)], TxNewline));
        return;
      }
    }
    const M = this.Match;
    if (!M) return;
    const Who = this.Who;
    const Mine = M.S(Who);
    const Opp = M.S(1 - Who);
    // preview of the monster about to be summoned
    this.ClearGhosts();
    if (M.Current === Who && !M.Pend && Id >= 10 && Id <= 12 && M.TargetIds(Who, M.Sel).includes(Id)) {
      const V = this.Units[Id - 10];
      if (V) {
        const SH = (M.Sel >= 0 && M.Sel <= 8) ? Mine.Hand[M.Sel] : undefined;
        if (SH && !SH.Def.IsSpell) V.SetGhost(SH.Def);
        else if (M.Sel === 40 && Mine.Hero.Jewel.K === fx_kind.SummonAt) V.SetGhost(M.CardOf(Mine.Hero.Jewel.C >= 0 ? Mine.Hero.Jewel.C : 0));
      }
    }
    const HH = (Id >= 0 && Id <= 8) ? Mine.Hand[Id] : undefined;
    const T = TgtOfUi(Id);
    const TU = (T && T.Col >= 0) ? At(M.S(Loc(Who, T).Side).Board, T.Col) : undefined;
    const EvoU = (Id === UiEvolve && M.Sel >= 10 && M.Sel <= 12 && M.EvoOk(Who, M.Sel - 10)) ? At(Mine.Board, M.Sel - 10) : undefined;
    const MineTop = Mine.Grave[Mine.Grave.length - 1];
    const OppTop = Opp.Grave[Opp.Grave.length - 1];
    const MullH = (Id >= 60 && Id <= 63) ? Mine.Hand[Id - 60] : undefined;
    if (HH) {
      const D = HH.Def;
      const Changed = TbCostChanged(D.Cost, HH.Cost);
      this.ShowDetailX(D, D.Atk, D.Hp, D.Hp, HH.Cost !== D.Cost ? Changed : null, HH.Cost, Mine.PremOf(D.Id));
    } else if (EvoU) {
      // the evolve button with a monster picked: how it will look after evolving
      const U = EvoU;
      const A0 = M.EffAtk(Who, M.Sel - 10, U);
      const Ev = this.EvoPreview(U, A0);
      this.ShowDetailX(U.Def, A0 + U.Def.EvoAtk, U.Hp + U.Def.EvoHp, U.MaxHp + U.Def.EvoHp, Ev, U.PlayedCost, U.Prem);
    } else if (TU) {
      const U = TU;
      const Sd = Loc(Who, T).Side;
      const A0 = M.EffAtk(Sd, T.Col, U);
      let Lines = [];
      const Given = this.GivenText(U);
      if (Given != null) Lines = [...Lines, Given];
      if (A0 < U.Atk) Lines = [...Lines, TbFrontDown(U.Atk - A0)];
      if (U.PlayedCost !== U.Def.Cost) Lines = [...Lines, TbPlayedCost(U.Def.Cost, U.PlayedCost)];
      if (Sd === Who && M.EvoOk(Who, T.Col)) {
        const Ev = this.EvoPreview(U, A0);
        Lines = [...Lines, Ev];
      }
      this.ShowDetailX(U.Def, A0, U.Hp, U.MaxHp, Lines.length > 0 ? Join(Lines, TxNewline) : null, U.PlayedCost, U.Prem);
    } else if (Id === 45 && MineTop) {
      this.ShowDetail(MineTop, MineTop.Atk, MineTop.Hp, MineTop.Hp, TbGraveHint);
    } else if (Id === 46 && OppTop) {
      this.ShowDetail(OppTop, OppTop.Atk, OppTop.Hp, OppTop.Hp, TbGraveHint);
    } else if (Id === 45 || Id === 46) {
      this.ShowInfo(TbGraveHint);
    } else if (MullH) {
      this.ShowDetail(MullH.Def, MullH.Def.Atk, MullH.Def.Hp, MullH.Def.Hp, null);
    } else if (Id === 40) {
      this.ShowInfo(this.JewelInfo(Mine));
    } else if (Id === 42) {
      this.ShowInfo(this.JewelInfo(Opp));
    } else if (Id === 30) {
      this.ShowInfo(this.LeaderPowers(Mine, TbHeroMe(Mine.HName(), Mine.HRace(), Max(0, Mine.Hp), Mine.MaxHp, Mine.Shield, Mine.HeroAtk, Mine.Hand.length, Mine.Deck.length, Mine.Grave.length, Mine.EvoLeft)));
    } else if (Id === 31) {
      this.ShowInfo(this.LeaderPowers(Opp, TbHeroFoe(Opp.Name, Opp.HName(), Max(0, Opp.Hp), Opp.MaxHp, Opp.Shield, Opp.HeroAtk, Opp.Hand.length, Opp.Deck.length, Opp.Grave.length, Opp.EvoLeft)));
    } else if (Id === 50) {
      this.ShowInfo(TbEndInfo);
    } else if (Id === 55) {
      this.ShowInfo(TbSurrenderInfo);
    } else if (Id === UiEvolve) {
      this.ShowInfo(TbEvoInfo(Mine.EvoLeft, M.EvoTurn(Who)));
    }
  }

  // ------------------------------------------------------------ controller / keyboard cursor
  // (<decides>: a rect or undefined)
  BoundsOf(Id) {
    if (Id >= 0 && Id <= 8) {
      const XY = this.HandXY[Id];
      return XY ? BdRect(XY.X, XY.Y, 150, 214) : undefined;
    }
    return this.Bounds.get(Id);
  }

  SetNavOn(On) {
    if (On === this.Nav) return;
    this.Nav = On;
    if (On) {
      this.MouseCur = false;
      if (!this.NavSmart.includes(this.CurId) && !this.NavAll.includes(this.CurId) && this.NavSmart.length > 0) this.CurId = this.NavSmart[0];
      this.MoveCursor(this.CurId);
    } else {
      this.HideCursor();
    }
  }

  // new lists of what the cursor can reach; Jump moves the cursor to the first useful item
  SetNav(Smart, All, Jump) {
    this.NavSmart = Smart;
    this.NavAll = All;
    let To = this.CurId;
    if (Jump || (!Smart.includes(this.CurId) && !All.includes(this.CurId))) {
      if (Smart.length > 0) To = Smart[0];
    }
    if (this.Nav) this.MoveCursor(To); else this.CurId = To;
  }

  NavReset() { this.CurId = -1; }

  MoveCursor(Id) {
    this.CurId = Id;
    if (!this.Nav || !this.Waiting) return;
    this.DrawCursor(4.0);
    // the same as hovering it with the mouse (details, previews)
    this.Hub.Hovers.Signal(Id);
    // (UI.SetFocus(W): the controller focus has no stand-in in the browser)
  }

  Step(L, D) {
    if (L.length === 0) return;
    const I = L.indexOf(this.CurId);
    const Next = I < 0 ? (D > 0 ? 0 : L.length - 1) : Mod(I + D + L.length, L.length);
    const Id = L[Next];
    if (Id !== undefined) this.MoveCursor(Id);
  }

  HideCursor() {
    if (this.CursorShown) {
      this.CursorShown = false;
      this.CursorAt = -99;
      for (const C of this.Corners) this.Root.RemoveWidget(C);
    }
  }

  DrawCursor(Bob) {
    if (this.CursorShown && this.CursorAt === this.CurId) return;
    const B = this.BoundsOf(this.CurId);
    if (B) {
      for (const C of this.Corners) this.Root.RemoveWidget(C);
      this.CursorAt = this.CurId;
      const O = 22 + Bob;
      const Pts = [V2(B.X - O, B.Y - O), V2(B.X + B.W + O - 40, B.Y - O), V2(B.X - O, B.Y + B.H + O - 40), V2(B.X + B.W + O - 40, B.Y + B.H + O - 40)];
      this.Corners.forEach((C, I) => {
        const XY = Pts[I];
        if (XY) this.Root.AddWidget(RBox(C, XY.X, XY.Y, 40, 40, 140));
      });
      this.CursorShown = true;
    } else {
      this.HideCursor();
    }
  }

  async CursorLoop() {
    const Q = this.QuitFlag();
    while (!Q.Done) {
      await Sleep(0.1);
      if (Q.Done) break;
      try {
        // the outline shows what is selected: the controller cursor, or what the mouse points at
        if ((this.Nav || (this.MouseCur && !this.OnBoardId(this.CurId))) && this.Waiting && (this.NavSmart.includes(this.CurId) || this.NavAll.includes(this.CurId))) this.DrawCursor(4.0);
        else if (this.CursorShown) this.HideCursor();
      } catch (e) { console.error(e); }
    }
  }

  // the nearest item of L from the cursor in direction Dir (0 up, 1 down, 2 left, 3 right): the closest one along
  // that direction, things in line with the cursor first  (null = none)
  Spatial(L, Dir) {
    const From = this.BoundsOf(this.CurId) || BdRect(960, 540, 0, 0);
    const Cx = From.X + From.W / 2;
    const Cy = From.Y + From.H / 2;
    let Best = null;
    let BestScore = 1000000;
    for (const Id of L) {
      if (Id === this.CurId) continue;
      const R = this.BoundsOf(Id);
      if (!R) continue;
      const Dx = R.X + R.W / 2 - Cx;
      const Dy = R.Y + R.H / 2 - Cy;
      const Along = Dir === 0 ? -Dy : Dir === 1 ? Dy : Dir === 2 ? -Dx : Dx;
      const Side = Dir <= 1 ? Abs(Dx) : Abs(Dy);
      const Score = Along + Side * 2;
      // (only things in front: not more than 3 times as far to the side as ahead)
      if (Along > 20 && Side <= Along * 3 && Score < BestScore) {
        BestScore = Score;
        Best = Id;
      }
    }
    return Best;
  }

  // the controller focus went to Id (not an item of the screen): the cursor goes one item that way instead
  FocusSnap(Id) {
    const To = this.BoundsOf(Id), From = this.BoundsOf(this.CurId);
    if (To && From) {
      const Dx = (To.X + To.W / 2) - (From.X + From.W / 2);
      const Dy = (To.Y + To.H / 2) - (From.Y + From.H / 2);
      const Dir = Abs(Dy) >= Abs(Dx) ? (Dy < 0 ? 0 : 1) : (Dx < 0 ? 2 : 3);
      const Found = this.Spatial(this.NavAll, Dir);
      if (Found != null) this.MoveCursor(Found); else this.MoveCursor(this.CurId);
    } else {
      this.MoveCursor(this.CurId);
    }
  }

  // -> an id / a Nav* value, or null (the key only moved the cursor)
  NavKey(K) {
    // (browser) Esc / Backspace: cancel, like X / I
    if (K === KeyBack) return NavCancel;
    // (paged screens turn the page with LT / RT before the cursor is shown)
    if (this.Paging && !this.Nav && K === KeyNextPage) return NavPageNext;
    if (this.Paging && !this.Nav && K === KeyPrevPage) return NavPagePrev;
    if (!this.Nav) {
      this.SetNavOn(true);
      return null;
    }
    // a scrolling list: leaving the last shown item scrolls the list instead (PickScroll)
    const Dir = K === KeyNext ? 0 : K === KeyPrev ? 1 : K === KeyNextPage ? 2 : K === KeyPrevPage ? 3 : -1;
    if (Dir >= 0 && BdEdge(this.EdgeMap, this.CurId * 4 + Dir)) return NavScroll - Dir;
    const NS = this.NavSmart;
    if (this.Paging && K === KeyNext && NS.length > 0 && NS[NS.length - 1] === this.CurId) return NavEdgeNext;
    if (this.Paging && K === KeyPrev && NS.length > 0 && NS[0] === this.CurId) return NavEdgePrev;
    if (K === KeyNext) this.Step(NS, 1);
    else if (K === KeyPrev) this.Step(NS, -1);
    // LT / RT: up / down on the screen (paged screens turn the page from the top / bottom row)
    else if (K === KeyNextPage) {
      const Down = this.Spatial(this.NavAll, 1);
      if (Down != null) this.MoveCursor(Down);
      else if (this.Paging) return NavPageNext;
    } else if (K === KeyPrevPage) {
      const Up = this.Spatial(this.NavAll, 0);
      if (Up != null) this.MoveCursor(Up);
      else if (this.Paging) return NavPagePrev;
    } else if (K === KeyUse) {
      if (NS.includes(this.CurId) || this.NavAll.includes(this.CurId)) return this.CurId;
    } else if (K === KeyInspect) {
      return NavCancel;
    }
    return null;
  }

  // (browser) an input wait left behind by a race (Verse would have cancelled it) dies now; its finally blocks run first
  async KillStale() {
    if (this.WaitActive > 0) {
      this.WaitGen += 1;
      this.WaitWake.Signal();
      await BdFlush();
    }
  }
  // the same, to call after your own race against a Pick / WaitInput of this board
  async CancelWait() { await this.KillStale(); }
  // kills the waits started with token Tok
  async KillTok(Tok) {
    if (!Tok || Tok.Dead) return;
    Tok.Dead = true;
    this.WaitWake.Signal();
    await BdFlush();
  }

  // waits for a click, or for a decision made with the cursor
  async WaitInput(Tok = null) {
    const G = FlowGen;
    await this.KillStale();
    if (G !== FlowGen || (Tok && Tok.Dead)) throw new FlowAbort();
    this.WaitGen += 1;
    const Me = this.WaitGen;
    this.WaitActive += 1;
    this.Waiting = true;
    const Hub = this.Hub;
    try {
      if (this.Nav) this.MoveCursor(this.CurId);
      // a click made a moment ago, while the game was still busy, is not lost
      if (Hub.ClickFresh && GetSimulationElapsedTime() - Hub.LastClickAt < 0.5) {
        Hub.ClickFresh = false;
        if (!this.Keys.Pad) this.SetNavOn(false);
        if (this.NavSmart.includes(Hub.LastClick) || this.NavAll.includes(Hub.LastClick)) this.CurId = Hub.LastClick;
        return Hub.LastClick;
      }
      Hub.ClickFresh = false;
      for (;;) {
        const R = await BdAwaitAny([[Hub.Clicks, 0], [this.Keys.Keys, 1], [this.WaitWake, 2]]);
        if (G !== FlowGen || Me !== this.WaitGen || (Tok && Tok.Dead)) throw new FlowAbort();
        if (R[0] === 2) continue;
        if (R[0] === 0) {
          Hub.ClickFresh = false;
          if (!this.Keys.Pad) this.SetNavOn(false);
          // the selection stays on what was pressed (a screen that doesn't change keeps its cursor there)
          if (this.NavSmart.includes(R[1]) || this.NavAll.includes(R[1])) this.CurId = R[1];
          return R[1];
        }
        const Res = this.NavKey(R[1]);
        if (Res != null) return Res;
      }
    } finally {
      this.WaitActive = Max(0, this.WaitActive - 1);
      if (this.WaitActive === 0) {
        this.Waiting = false;
        this.HideCursor();
      }
    }
  }

  // a menu: only the ids in Ids can be chosen; cancel picks CancelId (when >= 0)
  async Pick(Ids, Def, CancelId, Tok = null) {
    await this.KillStale();
    if (!Ids.includes(this.CurId)) this.CurId = Def;
    this.SetNav(Ids, Ids, false);
    for (;;) {
      const Id = await this.WaitInput(Tok);
      if (Ids.includes(Id)) return Id;
      if (Id === NavCancel && CancelId >= 0) return CancelId;
    }
  }

  // like Pick, but LT / RT return NavPageNext / NavPagePrev and LB / RB past the last / first id return NavEdgeNext / NavEdgePrev
  async PickPaged(Ids, Def, CancelId, Tok = null) {
    await this.KillStale();
    this.Paging = true;
    try {
      if (!Ids.includes(this.CurId)) this.CurId = Def;
      this.SetNav(Ids, Ids, false);
      for (;;) {
        const Id = await this.WaitInput(Tok);
        if (Ids.includes(Id)) return Id;
        if (Id === NavPageNext || Id === NavPagePrev || Id === NavEdgeNext || Id === NavEdgePrev) return Id;
        // (PickPagedScroll: a scrolling list inside a paged screen)
        if (Id <= NavScroll && Id >= NavScroll - 3) return Id;
        if (Id === NavCancel && CancelId >= 0) return CancelId;
      }
    } finally {
      this.Paging = false;
    }
  }

  // PickPaged with a scrolling list (Edges as in PickScroll)
  async PickPagedScroll(Ids, Def, CancelId, Edges, Tok = null) {
    await this.KillStale();
    this.EdgeMap = Edges;
    try {
      return await this.PickPaged(Ids, Def, CancelId, Tok);
    } finally {
      this.EdgeMap = null;
    }
  }

  // like Pick, for screens with scrolling lists: Edges[Id * 4 + Dir] makes the cursor leaving Id that way return NavScroll - Dir
  // (Edges: a Map or a plain object of id * 4 + Dir -> true)
  async PickScroll(Ids, Def, CancelId, Edges, Tok = null) {
    await this.KillStale();
    this.EdgeMap = Edges;
    try {
      if (!Ids.includes(this.CurId)) this.CurId = Def;
      this.SetNav(Ids, Ids, false);
      for (;;) {
        const Id = await this.WaitInput(Tok);
        if (Ids.includes(Id)) return Id;
        if (Id <= NavScroll && Id >= NavScroll - 3) return Id;
        if (Id === NavCancel && CancelId >= 0) return CancelId;
      }
    } finally {
      this.EdgeMap = null;
    }
  }

  // like Pick, but gives up at time Deadline (GetSimulationElapsedTime) and then returns NavTimeout
  async PickUntil(Ids, Def, CancelId, Deadline, Tok = null) {
    const T2 = Tok || { Dead: false };
    let Stop = false;
    const Timer = async () => {
      for (;;) {
        if (Stop) return NavTimeout;
        if (GetSimulationElapsedTime() >= Deadline) break;
        await Sleep(0.2);
      }
      return NavTimeout;
    };
    try {
      return await Race(this.Pick(Ids, Def, CancelId, T2), Timer());
    } finally {
      Stop = true;
      await this.KillTok(T2);
    }
  }

  // PickUntil with a "残り N秒" label kept up to date
  async PickTimed(Ids, Def, CancelId, Deadline, T, Tok = null) {
    const T2 = Tok || { Dead: false };
    const Stop = { Dead: false };
    try {
      return await Race(this.PickUntil(Ids, Def, CancelId, Deadline, T2), this.TimerRun(T, Deadline, Stop));
    } finally {
      Stop.Dead = true;
      await this.KillTok(T2);
    }
  }

  // keeps "残り N秒" up to date until the time is up (Stop: {Dead} ends it early)
  async TimerRun(T, Deadline, Stop = null) {
    for (;;) {
      if (Stop && Stop.Dead) return NavTimeout;
      const Left = Max(0, Ceil(Deadline - GetSimulationElapsedTime()));
      T.Set(TlTimeLeft(Left));
      T.SetColor(Left <= 5 ? CRed : CGold);
      if (Left <= 0) break;
      await Sleep(0.25);
    }
    await Sleep(0.5);
    return NavTimeout;
  }

  // ------------------------------------------------------------ messages
  Say(M) { this.NaviTxt.SetText(M); }

  ClearLog() {
    this.LogBuf = [];
    for (const L of this.LogLines) L.SetText(TxEmpty);
  }

  Log(M) {
    this.LogBuf = [...this.LogBuf, M];
    const Excess = this.LogBuf.length - this.LogLines.length;
    if (Excess > 0) this.LogBuf = this.LogBuf.slice(Excess);
    this.LogLines.forEach((L, I) => {
      const Line = this.LogBuf[I];
      L.SetText(Line !== undefined ? TbLogLine(Line) : TxEmpty);
    });
  }

  Toast(M, Secs) {
    this.ToastGen += 1;
    const Gen = this.ToastGen;
    this.ToastTxt.Set(M);
    Show(this.ToastTxt.Root, true);
    Show(this.TurnTxt.Root, false);
    spawn(() => this.ToastEnd(Gen, Secs));
  }

  async ToastEnd(Gen, Secs) {
    await Sleep(Secs);
    if (Gen === this.ToastGen) {
      Show(this.ToastTxt.Root, false);
      Show(this.TurnTxt.Root, true);
    }
  }

  Banner(M) {
    this.BannerGen += 1;
    const Gen = this.BannerGen;
    this.BannerTxt.Set(M);
    this.Layer(this.BannerSlot, true);
    // a light streak runs across it
    spawn(() => this.Pics.Scale(this.Root, V2(960, 426), 300, 1500, 0.25, 8, CCream, 54, FlareImgs(), true));
    spawn(() => this.BannerEnd(Gen));
  }

  async BannerEnd(Gen) {
    await Sleep(1.2);
    if (Gen === this.BannerGen) this.Layer(this.BannerSlot, false);
  }

  // the card being played, big in the middle of the board (both players see it before it does anything)
  ShowCast(D, Label, Cost, Prem) {
    this.CastFace.SetCard(this.Lib, D, D.Atk, D.Hp, D.Hp);
    this.CastFace.SetCost(Cost);
    this.CastFace.SetPrem(Prem);
    this.CastLabel.Set(Label);
    this.CastLabel.SetColor(D.IsSpell ? CBlue : CGold);
    this.Layer(this.CastSlot, true);
    const C = V2(960, 426);
    spawn(() => this.RingRun(C, 160, 640, D.IsSpell ? CBlue : CGold));
    this.Sparkle(C, 8, D.IsSpell ? CWhite : CGold);
  }

  HideCast() { this.Layer(this.CastSlot, false); }

  // 効果の演出: the card whose effect goes off (叫び, ターン終了時...) with what set it off; it goes away by itself
  ShowTrigger(D, Label, Prem) {
    this.TrigGen += 1;
    const Gen = this.TrigGen;
    this.TrigFace.SetCard(this.Lib, D, D.Atk, D.Hp, D.Hp);
    this.TrigFace.SetCost(D.Cost);
    this.TrigFace.SetPrem(Prem);
    this.TrigLabel.Set(Label);
    this.Layer(this.TrigSlot, true);
    spawn(() => this.TriggerEnd(Gen));
  }

  async TriggerEnd(Gen) {
    await Sleep(1.8);
    if (Gen === this.TrigGen) this.Layer(this.TrigSlot, false);
  }

  // ------------------------------------------------------------ effects
  CenterOf(Id) {
    if (Id >= 10 && Id <= 12) return V2(CellX(Id - 10) + 85, LRowMe + 85);
    if (Id >= 20 && Id <= 22) return V2(CellX(Id - 20) + 85, LRowFoe + 85);
    if (Id === 30) return V2(960, 731);
    if (Id === 31) return V2(960, 121);
    return V2(960, 426);
  }

  Vfx(Kind, Id) {
    this.Fx.Play(Kind, this.CenterOf(Id));
    this.Snd(VfxSound(Kind));
  }

  FxPop(Id, M, Heal) {
    const Pv = this.Pops[Mod(this.PopNext, this.Pops.length)];
    if (Pv) {
      this.PopNext += 1;
      const C = this.CenterOf(Id);
      spawn(() => this.PopRun(Pv, C, M, Heal));
    }
  }

  // the number on a star: the star pops up big and settles, stays a moment, then floats up and goes
  // (put on once; only the star's size changes, then three small moves)
  async PopRun(Pv, C, M, Heal) {
    const Root = this.Root;
    Pv.Burst.SetImage(Heal ? CardGui.T_HealBurst : CardGui.T_Burst);
    Pv.Num.Set(M);
    Pv.Num.SetColor(Heal ? CGreen : CWhite);
    Pv.Burst.SetDesiredSize(V2(50, 50));
    Root.RemoveWidget(Pv.Root);
    Root.AddWidget(RBox(Pv.Root, C.X - 65, C.Y - 65, 130, 130, 51));
    for (const S of [122, 180, 152, 140]) {
      await Sleep(0.03);
      Pv.Burst.SetDesiredSize(V2(S, S));
    }
    await Sleep(0.42);
    for (let K = 1; K <= 3; K++) {
      BdReBox(Root, Pv.Root, C.X - 65, C.Y - 65 - K * 12, 130, 130, 51);
      Pv.Burst.SetDesiredSize(V2(140 - K * 25, 140 - K * 25));
      await Sleep(0.05);
    }
    Root.RemoveWidget(Pv.Root);
  }

  FxFlash(Id) {
    if (Id >= 10 && Id <= 12) { const V = this.Units[Id - 10]; if (V) spawn(() => this.FlashRun(V.Flash)); }
    else if (Id >= 20 && Id <= 22) { const V = this.Units[Id - 17]; if (V) spawn(() => this.FlashRun(V.Flash)); }
    else if (Id === 30) spawn(() => this.FlashRun(this.MeHero.Flash));
    else if (Id === 31) spawn(() => this.FlashRun(this.FoeHero.Flash));
  }

  async FlashRun(W) {
    for (let K = 1; K <= 2; K++) {
      Show(W, true);
      await Sleep(0.08);
      Show(W, false);
      await Sleep(0.06);
    }
  }

  FxJewel(L) {
    const G = L === 0 ? this.JewelMeGlow : this.JewelFoeGlow;
    spawn(() => this.JewelRun(G));
    this.Vfx(VfxMana, L === 0 ? 30 : 31);
  }

  async JewelRun(G) {
    for (let K = 1; K <= 3; K++) {
      G.SetTint(CGold);
      Show(G, true);
      await Sleep(0.12);
      Show(G, false);
      await Sleep(0.08);
    }
  }

  // the flying card back between two rects (Steps frames, Ease: the T for T0, Sign: the lift direction)
  async FlyRun(From, To, Steps, Ease, LiftH, Sign) {
    const Root = this.Root;
    for (let K = 1; K <= Steps; K++) {
      const T0 = K / Steps;
      const T = Ease(T0);
      const Lift = LiftH * T0 * (1 - T0) * 4 * Sign;
      BdReBox(Root, this.Fly, From.X + (To.X - From.X) * T, From.Y + (To.Y - From.Y) * T + Lift, From.W + (To.W - From.W) * T, From.H + (To.H - From.H) * T, 50);
      await Sleep(0.03);
    }
    Root.RemoveWidget(this.Fly);
  }

  // a card flies from the deck to the hand (L = local side, Idx = new hand slot, N = hand size after the draw; Idx < 0 = burnt)
  async FxDraw(L, Idx, N) {
    const M = this.Match;
    if (M) this.Fly.SetImage(CardBackTex(M.S(L === 0 ? this.Who : 1 - this.Who).Back));
    const From = L === 0 ? BdRect(1280, 520, 120, 171) : BdRect(526, 60, 120, 171);
    const HL = HandLayout(N);
    const To = Idx < 0 ? BdRect(900, 340, 120, 171)
      : L === 0 ? BdRect(HL[0] + HL[1] * Idx, 828, 150, 214)
        : BdRect(1215 + Idx * 26, 34, 56, 80);
    await this.FlyRun(From, To, 9, T0 => 1 - (1 - T0) * (1 - T0), 60, L === 0 ? -1 : 1);
  }

  // a card of the hand flies to the grave (thrown away); L = local side, Idx = its hand slot, N = hand size
  async FxDiscard(L, Idx, N) {
    const M = this.Match;
    if (M) this.Fly.SetImage(CardBackTex(M.S(L === 0 ? this.Who : 1 - this.Who).Back));
    const HL = HandLayout(N);
    const From = L === 0 ? BdRect(HL[0] + HL[1] * Idx, 828, 150, 214) : BdRect(1215 + Idx * 26, 34, 56, 80);
    const To = L === 0 ? BdRect(526, 474, 120, 171) : BdRect(526, 268, 120, 171);
    await this.FlyRun(From, To, 10, T0 => T0 * T0, 50, L === 0 ? -1 : 1);
    this.Fx.Play(VfxDark, V2(To.X + 60, To.Y + 85));
  }

  // a card of the hand flies back into the deck (mulligan); L = local side, Idx = its hand slot, N = hand size
  async FxReturn(L, Idx, N) {
    const M = this.Match;
    if (M) this.Fly.SetImage(CardBackTex(M.S(L === 0 ? this.Who : 1 - this.Who).Back));
    const HL = HandLayout(N);
    const From = L === 0 ? BdRect(HL[0] + HL[1] * Idx, 828, 150, 214) : BdRect(1215 + Idx * 26, 34, 56, 80);
    const To = L === 0 ? BdRect(1280, 520, 120, 171) : BdRect(526, 60, 120, 171);
    await this.FlyRun(From, To, 9, T0 => T0 * T0, 60, L === 0 ? -1 : 1);
  }

  // ------------------------------------------------------------ summon entrances, evolve spin, プレミア show
  // Id = the board slot (UI id), R = rarity: every rarity has its own entrance and sound.
  // epic / legend: light gathers on the slot first, then the monster slams down in time with the sound's hit
  async FxSummon(Id, R) {
    const C = this.CenterOf(Id);
    const Root = this.Root;
    this.SumGen += 1;
    const Col = RarityColor(R);
    this.Snd(R >= RarL ? SfxSummonL : R >= RarE ? SfxSummonE : R >= RarR ? SfxSummonR : SfxSummon);
    if (R >= RarL) {
      spawn(() => this.Pics.Scale(Root, C, 780, 150, 1.0, 12, Col, 57, BurstImgs(), false));
      this.Sparkle(C, 6, CWhite);
      await Sleep(0.42);
      spawn(() => this.DropIn(Id, 170));
      await Sleep(0.18);
      spawn(() => this.FlashScreenP(color(1.0, 0.9, 0.55), 0.8));
      spawn(() => this.RaysRun(C, 680, Col, 16));
      spawn(() => this.RingRun(C, 140, 900, Col));
      spawn(() => this.Pics.Scale(Root, C, 160, 980, 1.0, 11, Col, 57, BurstImgs(), true));
      spawn(() => this.Pics.Scale(Root, C, 500, 1700, 0.25, 9, Col, 57, FlareImgs(), true));
      spawn(() => this.Shake(Id >= 20 ? 31 : 30, 6, 7.0));
      spawn(() => this.CallOut(TxLegendCall, C, Col));
      this.Fx.Play(VfxSummonBig, C);
      this.Sparkle(C, 12, Col);
    } else if (R >= RarE) {
      spawn(() => this.Pics.Scale(Root, C, 560, 150, 1.0, 8, Col, 57, BurstImgs(), false));
      await Sleep(0.28);
      spawn(() => this.DropIn(Id, 120));
      await Sleep(0.18);
      spawn(() => this.FlashScreenP(color(0.85, 0.6, 1.0), 0.35));
      spawn(() => this.RaysRun(C, 460, Col, 9));
      spawn(() => this.RingRun(C, 120, 560, Col));
      spawn(() => this.Pics.Scale(Root, C, 140, 640, 1.0, 9, Col, 57, BurstImgs(), true));
      spawn(() => this.Pics.Scale(Root, C, 300, 900, 0.25, 8, Col, 57, FlareImgs(), true));
      this.Fx.Play(VfxSummonBig, C);
      this.Sparkle(C, 7, Col);
    } else if (R >= RarR) {
      spawn(() => this.DropIn(Id, 70));
      await Sleep(0.15);
      spawn(() => this.RingRun(C, 100, 400, Col));
      spawn(() => this.Pics.Scale(Root, C, 100, 400, 1.0, 7, Col, 57, BurstImgs(), true));
      this.Fx.Play(VfxSummon, C);
      this.Sparkle(C, 5, Col);
    } else {
      spawn(() => this.DropIn(Id, 50));
      await Sleep(0.15);
      spawn(() => this.RingRun(C, 90, 300, CCream));
      this.Fx.Play(VfxSummon, C);
    }
  }

  // the slot's monster drops in from above (board slots only)
  async DropIn(Id, From) {
    const M = this.MoverOf(Id);
    const W = M[0];
    if (Id >= 10 && Id <= 22 && W) {
      const Home = M[1];
      for (const K of [1.0, 0.55, 0.22, -0.06, 0.03, 0.0]) {
        BdReBox(this.Root, W, Home.X, Home.Y - From * K, 170, 170, 10);
        await Sleep(0.03);
      }
    }
  }

  // shimmering rays behind a summoned monster (one picture: the two ray images take turns, its size swells)
  async RaysRun(C, S, Col, Steps) {
    const Root = this.Root;
    this.RayOwn += 1;
    const Me = this.RayOwn;
    Root.RemoveWidget(this.SumRaysB);
    this.SumRays.SetTint(Col);
    this.SumRays.SetDesiredSize(V2(S * 0.55, S * 0.55));
    Root.RemoveWidget(this.SumRays);
    Root.AddWidget(RPin(this.SumRays, C.X, C.Y, 9));
    for (let K = 1; K <= Steps; K++) {
      await Sleep(0.07);
      if (Me !== this.RayOwn) return;
      const F = K / Steps;
      const Sz = S * (0.55 + 0.45 * Sin(F * 3.1416));
      this.SumRays.SetImage(Mod(K, 2) === 0 ? CardGui.T_Rays : CardGui.T_RaysB);
      this.SumRays.SetDesiredSize(V2(Sz, Sz));
    }
    if (Me === this.RayOwn) Root.RemoveWidget(this.SumRays);
  }

  // an expanding shock ring
  async RingRun(C, S0, S1, Col) {
    await this.Pics.Scale(this.Root, C, S0, S1, 1.0, 10, Col, 57, RingImgs(), true);
  }

  // a short full-screen flash (under the click areas): put on once, only its opacity changes
  async FlashScreen(Col) { await this.FlashScreenP(Col, 0.8); }

  async FlashScreenP(Col, Peak) {
    const Root = this.Root;
    this.FlashOwn += 1;
    const Me = this.FlashOwn;
    this.SumFlash.SetColor(Col);
    let V = opacity01(Peak);
    if (V !== undefined) this.SumFlash.SetOpacity(V);
    Root.RemoveWidget(this.SumFlash);
    Root.AddWidget(RBox(this.SumFlash, -400, -300, 2720, 1680, 58));
    for (const O of [0.68, 0.42, 0.2]) {
      await Sleep(0.045);
      if (Me !== this.FlashOwn) return;
      V = opacity01(Peak * O);
      if (V !== undefined) this.SumFlash.SetOpacity(V);
    }
    await Sleep(0.045);
    if (Me === this.FlashOwn) Root.RemoveWidget(this.SumFlash);
  }

  // 「LEGEND!!」 / 「EVOLVE!」 drops in over a slot and stays a moment
  async CallOut(M, C, Col) {
    const Root = this.Root;
    this.CallOwn += 1;
    const Me = this.CallOwn;
    this.SumText.Set(M);
    this.SumText.SetColor(Col);
    let First = true;
    for (const Dy of [-46, 5, 0]) {
      if (Me !== this.CallOwn) return;
      if (First) { Root.RemoveWidget(this.SumText.Root); First = false; }
      BdRePin(Root, this.SumText.Root, C.X, C.Y - 110 + Dy, 59);
      await Sleep(0.035);
    }
    await Sleep(0.8);
    if (Me === this.CallOwn) Root.RemoveWidget(this.SumText.Root);
  }

  // N sparkles blink around C
  Sparkle(C, N, Col) {
    for (let I = 0; I <= N - 1; I++) {
      const T = this.SumSparks[Mod(I + this.AnimK, this.SumSparks.length)];
      if (!T) continue;
      const A = GetRandomFloat(0, 6.2832);
      const D = GetRandomFloat(40, 120);
      const P = V2(C.X + Cos(A) * D, C.Y + Sin(A) * D * 0.8);
      spawn(() => this.SparkRun(T, P, Col, I * 0.04));
    }
  }

  async SparkRun(T, C, Col, Delay) {
    const Root = this.Root;
    await Sleep(Delay);
    T.SetTint(Col);
    T.SetDesiredSize(V2(4, 4));
    Root.RemoveWidget(T);
    Root.AddWidget(RPin(T, C.X, C.Y, 57));
    for (let K = 1; K <= 8; K++) {
      const Sz = 52 * Sin(K * 3.1416 / 9);
      T.SetDesiredSize(V2(Sz, Sz));
      await Sleep(0.035);
    }
    Root.RemoveWidget(T);
  }

  // evolving, like a real card turning over (both screens; card_match waits 1.05 s, then the new stats pop up):
  // 1. light gathers on the monster, 2. it lifts and turns over once (its back shows on the way round, the evolved
  // look comes up), 3. it slams down: flash, shock ring, light streak, particles, 「EVOLVE!」 and sparkles on its stats
  async FxEvolve(Id, D, Prem) {
    const Root = this.Root;
    let V = null;
    if (Id >= 10 && Id <= 12) V = this.Units[Id - 10] || null;
    else if (Id >= 20 && Id <= 22) V = this.Units[Id - 17] || null;
    if (!V) return;
    const C = this.CenterOf(Id);
    const Foe = Id >= 20;
    const Pink = color(1.0, 0.55, 0.95);
    // 1. charge
    this.Snd(SfxEvoCharge);
    this.SpinGlow.SetTint(color(1.0, 0.75, 1.0));
    this.SpinGlow.SetDesiredSize(V2(140, 140));
    Root.RemoveWidget(this.SpinGlow);
    Root.AddWidget(RPin(this.SpinGlow, C.X, C.Y, 56));
    spawn(() => this.Pics.Scale(Root, C, 560, 130, 1.0, 9, Pink, 57, BurstImgs(), false));
    for (let K = 1; K <= 9; K++) {
      await Sleep(0.033);
      const G = 140 + K * 20;
      this.SpinGlow.SetDesiredSize(V2(G, G));
      if (Mod(K, 3) === 0) this.Sparkle(C, 1, CGold);
    }
    // 2. the turn
    this.Snd(SfxSpin);
    this.SpinPanel.SetImage(UnitTex(Foe, D.Rarity));
    this.SpinPanel.SetTint(CWhite);
    this.SpinArt.SetImage(D.Art);
    this.SpinArt.SetTint(D.ArtTint);
    let Art = FitSize(D.ArtW, D.ArtH, 132, 118);
    this.SpinPanel.SetDesiredSize(V2(170, 170));
    this.SpinArt.SetDesiredSize(Art);
    Root.RemoveWidget(this.SpinPanel);
    Root.RemoveWidget(this.SpinArt);
    Root.AddWidget(RPin(this.SpinPanel, C.X, C.Y, 57));
    Root.AddWidget(RPin(this.SpinArt, C.X, C.Y - 7, 57));
    Show(V.Root, false);
    const Steps = 16;
    let Front = true;
    let Up = 1.0;
    for (let K = 1; K <= Steps; K++) {
      const F = K / Steps;
      const E = F * F * (3 - 2 * F);
      const Cs = Cos(E * 6.2832);
      const W = Max(0.04, Abs(Cs));
      Up = 1 + 0.3 * Sin(F * 3.1416 * 0.5);
      // (竜人) the evolved look shows up on the way round
      if (K === 8 && D.EvoArt) {
        this.SpinArt.SetImage(D.EvoArt);
        Art = FitSize(D.EvoArtW, D.EvoArtH, 132, 118);
      }
      const NowFront = Cs >= 0;
      if (NowFront !== Front) {
        Front = NowFront;
        this.SpinPanel.SetTint(Front ? CWhite : color(0.62, 0.45, 0.85));
        Show(this.SpinArt, Front);
      }
      this.SpinPanel.SetDesiredSize(V2(170 * W * Up, 170 * Up));
      this.SpinArt.SetDesiredSize(V2(Art.X * W * Up, Art.Y * Up));
      this.SpinGlow.SetDesiredSize(V2(320 * Up, 320 * Up));
      await Sleep(0.033);
    }
    // 3. the slam
    this.Snd(SfxEvoBurst);
    Root.RemoveWidget(this.SpinGlow);
    spawn(() => this.FlashScreenP(color(1.0, 0.85, 1.0), 0.55));
    spawn(() => this.RingRun(C, 120, 680, Pink));
    spawn(() => this.Pics.Scale(Root, C, 140, 720, 1.0, 10, Pink, 57, BurstImgs(), true));
    spawn(() => this.Pics.Scale(Root, C, 300, 1100, 0.25, 8, CWhite, 57, FlareImgs(), true));
    for (const S of [1.12, 0.93, 1.03, 1.0]) {
      this.SpinPanel.SetDesiredSize(V2(170 * S, 170 * S));
      this.SpinArt.SetDesiredSize(V2(Art.X * S, Art.Y * S));
      await Sleep(0.03);
    }
    Root.RemoveWidget(this.SpinPanel);
    Root.RemoveWidget(this.SpinArt);
    Show(this.SpinArt, true);
    Show(V.Root, true);
    this.Fx.Play(VfxSummonBig, C);
    spawn(() => this.CallOut(TxEvolveCall, C, Pink));
    this.Sparkle(C, 8, CGold);
    // the attack / hp corners sparkle (the new numbers pop up right after)
    spawn(() => this.Pics.Blink(Root, V2(C.X - 60, C.Y + 62), 70, CGold, 57, 0.1));
    spawn(() => this.Pics.Blink(Root, V2(C.X + 60, C.Y + 62), 70, CGold, 57, 0.16));
  }

  // a pop-up over card Idx of the own hand (マナ-1 ...)
  FxHandPop(Idx, M) {
    const XY = this.HandXY[Idx];
    const Pv = this.Pops[Mod(this.PopNext, this.Pops.length)];
    if (XY && Pv) {
      this.PopNext += 1;
      spawn(() => this.PopRun(Pv, V2(XY.X + 75, XY.Y + 50), M, true));
      this.Fx.Play(VfxMana, V2(XY.X + 75, XY.Y + 107));
    }
  }

  // the プレミア化 show: the card spins round and comes out sparkling. Lv = the new level, Back = the player's card back
  async PremiumShow(D, Lv, Back) {
    const SC = this.SpinCanvas;
    this.SpinFrame.SetImage(FrameTex(!!(D.IsSpell || D.Amulet), D.Rarity));
    this.SpinArtBig.SetImage(D.Art);
    this.SpinArtBig.SetTint(D.ArtTint);
    this.SpinBack.SetImage(CardBackTex(Back));
    const AS = D.IsSpell ? FitSize(D.ArtW, D.ArtH, 264, 200) : FitSize(D.ArtW, D.ArtH, 256, 192);
    this.SpinFace.SetShown(false);
    this.SpinLabel.Set(TxEmpty);
    this.SpinSub.Set(TxEmpty);
    for (const W of [this.SpinFrame, this.SpinArtBig, this.SpinBack]) SC.RemoveWidget(W);
    SC.AddWidget(RPin(this.SpinBack, 960, 470, 3));
    SC.AddWidget(RPin(this.SpinFrame, 960, 470, 3));
    SC.AddWidget(RPin(this.SpinArtBig, 960, 414, 4));
    this.Layer(this.SpinSlot, true);
    try {
      this.Snd(SfxSpin);
      const Steps = 40;
      for (let K = 0; K <= Steps; K++) {
        const F = K / Steps;
        const E = F * F * (3 - 2 * F);
        const Cs = Cos(E * 6.2832 * 3);
        const W = Max(0.02, Abs(Cs));
        const Up = 1 + 0.18 * Sin(F * 3.1416);
        const Front = Cs >= 0;
        this.SpinFrame.SetDesiredSize(V2(300 * W * Up, 428 * Up));
        this.SpinBack.SetDesiredSize(V2(300 * W * Up, 428 * Up));
        this.SpinArtBig.SetDesiredSize(V2(AS.X * W * Up, AS.Y * Up));
        Show(this.SpinFrame, Front);
        Show(this.SpinArtBig, Front);
        Show(this.SpinBack, !Front);
        if (Mod(K, 5) === 0) this.Fx.PlayZ(VfxSummon, V2(960, 470), 125);
        if (Mod(K, 10) === 5) this.Snd(SfxSpin);
        await Sleep(0.035);
      }
      for (const W of [this.SpinFrame, this.SpinArtBig, this.SpinBack]) SC.RemoveWidget(W);
      this.SpinFace.SetCard(this.Lib, D, D.Atk, D.Hp, D.Hp);
      this.SpinFace.SetPrem(Lv);
      this.SpinFace.SetShown(true);
      this.Fx.PlayZ(VfxSummonBig, V2(960, 470), 125);
      this.Fx.PlayZ(VfxEvolve, V2(960, 470), 125);
      this.Snd(SfxPremium);
      this.Snd(SfxLegend);
      this.SpinLabel.Set(Lv >= 2 ? TbPremDone2 : TbPremDone1);
      this.SpinSub.Set(Lv >= 2 ? TbPremSub2 : TbPremSub1);
      const Old = this.CurId;
      this.CurId = 780;
      const Tok = { Dead: false };
      try {
        await Race(this.Pick([780], 780, 780, Tok), Sleep(8.0));
      } finally {
        await this.KillTok(Tok);
      }
      this.CurId = Old;
      this.Snd(SfxSelect);
    } finally {
      this.Layer(this.SpinSlot, false);
    }
  }

  // the widget that shows board slot / player Id, where it normally is and its size -> [widget or null, home, size]
  MoverOf(Id) {
    if (Id >= 10 && Id <= 12) { const V = this.Units[Id - 10]; if (V) return [V.Root, V2(CellX(Id - 10), LRowMe), 170]; }
    else if (Id >= 20 && Id <= 22) { const V = this.Units[Id - 17]; if (V) return [V.Root, V2(CellX(Id - 20), LRowFoe), 170]; }
    else if (Id === 30) return [this.MeHero.Root, V2(885, 656), 150];
    else if (Id === 31) return [this.FoeHero.Root, V2(885, 46), 150];
    return [null, V2(0, 0), 0];
  }

  // the slot / player shakes (it was hit hard)
  async Shake(Id, Frames, Amp) {
    const M = this.MoverOf(Id);
    const W = M[0];
    if (!W) return;
    const H = M[1];
    const S = M[2];
    for (let K = 1; K <= Frames; K++) {
      const A = Amp * (1 - (K - 1) / Frames);
      const Dx = Mod(K, 2) === 0 ? -A : A;
      const Dy = Mod(K, 3) === 0 ? 0.5 * A : -0.3 * A;
      BdReBox(this.Root, W, H.X + Dx, H.Y + Dy, S, S, 10);
      await Sleep(0.03);
    }
    BdReBox(this.Root, W, H.X, H.Y, S, S, 10);
  }

  // the moment a blow lands on Id: a hit star, the target shakes (a player hit also flashes the screen red)
  Impact(Dst, Big) {
    const C = this.CenterOf(Dst);
    spawn(() => this.Pics.Scale(this.Root, C, 70, Big ? 360 : 250, 1.0, 5, color(1.0, 0.92, 0.7), 57, HitImgs(), true));
    spawn(() => this.Shake(Dst, Big ? 8 : 5, Big ? 11.0 : 6.0));
    if (Big) {
      spawn(() => this.FlashScreenP(color(1.0, 0.3, 0.2), 0.28));
      this.Snd(SfxImpact);
    }
  }

  // moves the attacker towards its target and back: a short wind-up, the dash, the hit, back home
  async FxLunge(Src, Dst) {
    const M = this.MoverOf(Src);
    const Wd = M[0];
    if (!Wd) return;
    const Home = M[1];
    const Size = M[2];
    const A = this.CenterOf(Src);
    const B = this.CenterOf(Dst);
    for (const K of [-0.07, -0.1, 0.18, 0.45, 0.66]) {
      BdReBox(this.Root, Wd, Home.X + (B.X - A.X) * K, Home.Y + (B.Y - A.Y) * K, Size, Size, 16);
      await Sleep(0.03);
    }
    this.Impact(Dst, Dst === 30 || Dst === 31);
    for (const K of [0.48, 0.28, 0.12, 0.03]) {
      BdReBox(this.Root, Wd, Home.X + (B.X - A.X) * K, Home.Y + (B.Y - A.Y) * K, Size, Size, 16);
      await Sleep(0.03);
    }
    BdReBox(this.Root, Wd, Home.X, Home.Y, Size, Size, 10);
  }

  // the end of a match on the board (Res: 1 won, -1 lost, 0 draw; Ko: a player's HP reached 0):
  // the beaten player is blown away (hit star, shake, explosion, flash), then VICTORY / DEFEAT
  async FxMatchEnd(Res, Ko) {
    const Root = this.Root;
    if (Ko) {
      for (const Id of (Res > 0 ? [31] : Res < 0 ? [30] : [30, 31])) {
        const HC = this.CenterOf(Id);
        spawn(() => this.Pics.Scale(Root, HC, 80, 560, 1.0, 8, color(1.0, 0.85, 0.6), 57, HitImgs(), true));
        spawn(() => this.Pics.Scale(Root, HC, 160, 900, 1.0, 10, CGold, 57, BurstImgs(), true));
        spawn(() => this.Shake(Id, 12, 14.0));
        this.Fx.Play(VfxExplode, HC);
      }
      this.Snd(SfxImpact);
      this.Snd(SfxExplode);
      spawn(() => this.FlashScreenP(CWhite, 0.85));
      await Sleep(0.45);
    }
    const C = V2(960, 536);
    const Col = Res > 0 ? CGold : Res < 0 ? color(0.55, 0.65, 1.0) : CWhite;
    if (Res > 0) {
      spawn(() => this.RaysRun(C, 900, CGold, 14));
      spawn(() => this.Pics.Scale(Root, V2(960, 426), 400, 1800, 0.25, 9, CGold, 57, FlareImgs(), true));
      this.Sparkle(V2(960, 426), 10, CGold);
    }
    spawn(() => this.CallOut(Res > 0 ? TbVictory : Res < 0 ? TbDefeat : TbDraw, C, Col));
    await Sleep(0.9);
  }

  // ------------------------------------------------------------ mulligan / surrender / grave list
  // Secs > 0: the choice made so far is taken when the time runs out  -> []logic
  async Mulligan(Cards, Secs) {
    let Swap = Cards.map(() => false);
    this.MullFaces.forEach((F, I) => {
      const D = Cards[I];
      if (D) {
        F.SetCard(this.Lib, D, D.Atk, D.Hp, D.Hp);
        F.SetShown(true);
      } else {
        F.SetShown(false);
      }
    });
    for (const Mk of this.MullMarks) Show(Mk.Root, false);
    this.MullTimer.Set(TxEmpty);
    this.Layer(this.MullSlot, true);
    try {
      this.Say(TbMullSay);
      this.CurId = 64;
      const Deadline = Secs > 0 ? GetSimulationElapsedTime() + Secs : 0;
      for (;;) {
        const Id = Secs > 0 ? await this.PickTimed([60, 61, 62, 63, 64], 64, -1, Deadline, this.MullTimer) : await this.Pick([60, 61, 62, 63, 64], 64, -1);
        if (Id === 64 || Id === NavTimeout) break;
        const I = Id - 60;
        this.Snd(SfxSelect);
        if (I >= 0 && I < Swap.length) {
          const New = !Swap[I];
          Swap = Swap.map((V, J) => J === I ? New : V);
          const Mk = this.MullMarks[I];
          if (Mk) Show(Mk.Root, New);
        }
      }
      if (Secs > 0) this.Say(TbWaitOpp);
      return Swap;
    } finally {
      this.Layer(this.MullSlot, false);
    }
  }

  // ------------------------------------------------------------ notices
  Notice(M) {
    this.NoticeGen += 1;
    this.NoticeTxt.Set(M);
    this.Layer(this.NoticeSlot, true);
    this.Snd(SfxMyTurn);
    const Gen = this.NoticeGen;
    spawn(() => this.NoticeEnd(Gen));
  }

  async NoticeEnd(Gen) {
    await Sleep(6.0);
    if (Gen === this.NoticeGen) this.Layer(this.NoticeSlot, false);
  }

  // ------------------------------------------------------------ tutorial panel
  TutShow(On) {
    this.Layer(this.TutSlot, On);
    this.TutCanvas.RemoveWidget(this.TutBtnSlot.Widget);
    this.TutHead.Set(TbTutTitle);
    this.TutText.SetText(TxEmpty);
  }

  // what the player should do now (no button: the board is used)
  TutSay(M) {
    this.TutCanvas.RemoveWidget(this.TutBtnSlot.Widget);
    this.TutHead.Set(TbTutDo);
    this.TutHead.SetColor(CGold);
    this.TutText.SetText(M);
  }

  // explanations, one page at a time with 次へ
  async TutPages(Pages) {
    if (Pages.length === 0) return;
    const Old = this.CurId;
    this.TutHead.Set(TbTutTitle);
    this.TutHead.SetColor(CWhite);
    // the button is put on once for all the pages (a widget put again under the mouse misses the next click)
    this.TutCanvas.RemoveWidget(this.TutBtnSlot.Widget);
    this.TutCanvas.AddWidget(this.TutBtnSlot);
    for (const Pg of Pages) {
      this.TutText.SetText(Pg);
      this.Snd(SfxFlip);
      this.CurId = 66;
      // a click made before the page came up doesn't skip it
      const G = FlowGen;
      await Sleep(0.3);
      if (G !== FlowGen) throw new FlowAbort();
      this.Hub.ClickFresh = false;
      await this.Pick([66], 66, -1);
      this.Snd(SfxSelect);
    }
    this.TutCanvas.RemoveWidget(this.TutBtnSlot.Widget);
    this.TutText.SetText(TxEmpty);
    this.CurId = Old;
  }

  async ConfirmSurrender() {
    this.Snd(SfxSelect);
    this.Layer(this.ConfirmSlot, true);
    try {
      this.CurId = 57;
      const Id = await this.Pick([56, 57], 57, 57);
      if (Id === 56) return true;
      this.Snd(SfxCancel);
      return false;
    } finally {
      this.Layer(this.ConfirmSlot, false);
    }
  }

  DrawGravePage() {
    const Pages = Max(1, Quotient(this.GraveCards.length + GravePer - 1, GravePer));
    this.GravePage = Max(0, Min(this.GravePage, Pages - 1));
    this.GraveFaces.forEach((F, I) => {
      const D = this.GraveCards[this.GravePage * GravePer + I];
      if (D) {
        F.SetCard(this.Lib, D, D.Atk, D.Hp, D.Hp);
        F.SetShown(true);
      } else {
        F.SetShown(false);
      }
    });
    this.GravePageTxt.Set(TbPage(this.GravePage + 1, Pages));
    Show(this.GraveEmpty.Root, this.GraveCards.length === 0);
    this.GraveBig.SetShown(false);
    this.GraveHelp.SetText(TxEmpty);
  }

  // the coin toss before the opening hands, like a real coin: it lies on the table, is flicked up spinning over and
  // over (the picture gets thin and turns: 先 gold / 後 silver), comes towards you and falls back with two bounces
  // (a clink each time), wobbles flat, then jumps forward in rays with the result (card_match waits 4.6 s)
  async CoinToss(MeFirst) {
    const CC = this.CoinCanvas;
    const CoinPic = this.CoinPic, CoinShadow = this.CoinShadow, CoinRays = this.CoinRays;
    this.CoinTxt.Set(TxEmpty);
    for (const W of [CoinPic, CoinShadow, CoinRays]) CC.RemoveWidget(W);
    CC.RemoveWidget(this.CoinTxt.Root);
    this.Layer(this.CoinSlot, true);
    try {
      const Base = 740.0;
      CoinPic.SetImage(CardGui.T_CoinFirst);
      CoinPic.SetDesiredSize(V2(200, 200));
      CoinShadow.SetDesiredSize(V2(230, 64));
      CC.AddWidget(RPin(CoinShadow, 960, Base + 92, 2));
      CC.AddWidget(RPin(CoinPic, 960, Base, 7));
      await Sleep(0.35);
      // flick: a little dip, then up
      CoinPic.SetDesiredSize(V2(206, 188));
      await Sleep(0.06);
      this.Snd(SfxCoinFlip);
      // whole turns land on 先, an extra half turn on 後
      const Total = (14 + (MeFirst ? 0 : 1)) * 3.14159265;
      const Air = 30;
      const B1 = 8;
      const B2 = 5;
      const N = Air + B1 + B2;
      let Face = 0;
      for (let K = 1; K <= N; K++) {
        const F = K / N;
        const Ang = Total * (1 - (1 - F) * (1 - F));
        const Cs = Cos(Ang);
        let H = 0;
        if (K <= Air) {
          const F1 = K / Air;
          H = 380 * 4 * F1 * (1 - F1);
        } else if (K <= Air + B1) {
          const F2 = (K - Air) / B1;
          H = 70 * 4 * F2 * (1 - F2);
        } else {
          const F3 = (K - Air - B1) / B2;
          H = 18 * 4 * F3 * (1 - F3);
        }
        const Sz = 200 + 0.3 * H;
        const NowFace = Cs >= 0 ? 0 : 1;
        if (NowFace !== Face) {
          Face = NowFace;
          CoinPic.SetImage(Face === 0 ? CardGui.T_CoinFirst : CardGui.T_CoinSecond);
        }
        CoinPic.SetDesiredSize(V2(Max(10, Sz * Abs(Cs)), Sz));
        BdRePin(CC, CoinPic, 960, Base - H, 7);
        const Sh = Max(0.35, 1 - H / 600);
        CoinShadow.SetDesiredSize(V2(230 * Sh, 64 * Sh));
        if (K === Air || K === Air + B1) this.Snd(SfxCoinLand);
        await Sleep(0.03);
      }
      this.Snd(SfxCoinLand);
      CoinPic.SetImage(MeFirst ? CardGui.T_CoinFirst : CardGui.T_CoinSecond);
      for (const W of [0.88, 1.0, 0.94, 1.0]) {
        CoinPic.SetDesiredSize(V2(200 * W, 200));
        await Sleep(0.04);
      }
      // the result: the coin jumps forward in rays with a ring, a light streak and particles
      const Col = MeFirst ? CGold : color(0.75, 0.85, 1.0);
      this.Snd(MeFirst ? SfxJackpot : SfxRare);
      const Mid = 540.0;
      CoinRays.SetTint(Col);
      CoinRays.SetDesiredSize(V2(300, 300));
      CC.AddWidget(RPin(CoinRays, 960, Mid, 1));
      CC.RemoveWidget(CoinShadow);
      spawn(() => this.CoinPics.Scale(CC, V2(960, Mid), 150, 900, 1.0, 10, Col, 2, RingImgs(), true));
      spawn(() => this.CoinPics.Scale(CC, V2(960, Mid), 180, 860, 1.0, 11, Col, 2, BurstImgs(), true));
      spawn(() => this.CoinPics.Scale(CC, V2(960, Mid), 400, 1500, 0.25, 9, CWhite, 4, FlareImgs(), true));
      for (let K = 1; K <= 6; K++) {
        const F = K / 6;
        const E = 1 - (1 - F) * (1 - F);
        const S = 200 + 90 * E + 30 * Sin(F * 3.1416);
        CoinPic.SetDesiredSize(V2(S, S));
        BdRePin(CC, CoinPic, 960, Base + (Mid - Base) * E, 7);
        CoinRays.SetDesiredSize(V2(300 + 420 * E, 300 + 420 * E));
        await Sleep(0.03);
      }
      this.CoinTxt.Set(MeFirst ? TbCoinFirst : TbCoinSecond);
      this.CoinTxt.SetColor(MeFirst ? CGold : CWhite);
      CC.AddWidget(RPin(this.CoinTxt.Root, 960, 870, 8));
      // the rays keep turning a moment
      for (let K = 1; K <= 26; K++) {
        await Sleep(0.06);
        CoinRays.SetImage(Mod(K, 2) === 0 ? CardGui.T_Rays : CardGui.T_RaysB);
        const Rs = 720 * (1 + 0.04 * Sin(K * 0.8));
        CoinRays.SetDesiredSize(V2(Rs, Rs));
      }
    } finally {
      for (const W of [CoinPic, CoinShadow, CoinRays]) CC.RemoveWidget(W);
      CC.RemoveWidget(this.CoinTxt.Root);
      this.CoinPics.Off(CC);
      this.Layer(this.CoinSlot, false);
    }
  }

  // a card picked from Cards (the grave list screen): its index, -1 = the bottom button (Stop), NavTimeout = the time ran out
  async ChooseCard(Cards, Title, Stop, Deadline) {
    this.GraveCards = Cards;
    this.GravePage = 0;
    this.GraveTitle.Set(Title);
    this.GraveCloseLbl.Set(Stop);
    this.DrawGravePage();
    this.Snd(SfxOpen);
    this.Layer(this.GraveSlot, true);
    try {
      this.CurId = 200;
      for (;;) {
        const Count = Max(0, Min(GravePer, this.GraveCards.length - this.GravePage * GravePer));
        const Ids = [...IRange(0, Count - 1).map(I => 200 + I), 230, 231, 232];
        const Id = Deadline > 0 ? await this.PickUntil(Ids, Count > 0 ? 200 : 232, 232, Deadline) : await this.Pick(Ids, Count > 0 ? 200 : 232, 232);
        if (Id === NavTimeout) return NavTimeout;
        if (Id === 232) {
          this.Snd(SfxCancel);
          return -1;
        }
        if (Id === 230) {
          this.GravePage -= 1;
          this.DrawGravePage();
        } else if (Id === 231) {
          this.GravePage += 1;
          this.DrawGravePage();
        } else if (Id >= 200 && Id < 200 + GravePer) {
          this.Snd(SfxSelect);
          return this.GravePage * GravePer + Id - 200;
        }
      }
    } finally {
      this.Layer(this.GraveSlot, false);
      this.GraveCards = [];
      this.GraveCloseLbl.Set(TbClose);
    }
  }

  // the list of side Side's grave (newest first); returns when it is closed
  async ShowGrave(M, Side) {
    const Sd = M.S(Side);
    this.GraveCards = Sd.Grave.slice().reverse();
    this.GravePage = 0;
    this.GraveTitle.Set(Side === this.Who ? TbGraveMine(this.GraveCards.length) : TbGraveFoe(this.GraveCards.length));
    this.DrawGravePage();
    this.Snd(SfxSelect);
    this.Layer(this.GraveSlot, true);
    try {
      this.CurId = 232;
      for (;;) {
        const Count = Max(0, Min(GravePer, this.GraveCards.length - this.GravePage * GravePer));
        const Ids = [...IRange(0, Count - 1).map(I => 200 + I), 230, 231, 232];
        const Id = await this.Pick(Ids, Count > 0 ? 200 : 232, 232);
        if (Id === 232) break;
        if (Id === 230) {
          this.GravePage -= 1;
          this.DrawGravePage();
        } else if (Id === 231) {
          this.GravePage += 1;
          this.DrawGravePage();
        }
      }
    } finally {
      this.Layer(this.GraveSlot, false);
      this.GraveCards = [];
    }
    this.Snd(SfxCancel);
  }

  // ------------------------------------------------------------ drag and drop (browser)
  // a drag starts on Id: true = the kit's "click" of the drag start is ignored (it is already selected; clicking it
  // again would unselect it, or use a no-target spell)
  DragStartSkip(Id) {
    const M = this.Match;
    return !!(M && this.OnBoardId(Id) && M.Current === this.Who && !M.Ended && !M.Pend && M.Sel === Id);
  }

  // the drag from From was let go on To: the id that is clicked (null = nothing)
  DragDropMap(From, To) {
    const M = this.Match;
    if (!M || !this.OnBoardId(From) || M.Current !== this.Who || M.Ended) return To;
    // the drag start didn't select anything (no mana, nothing to do, a target that was picked ...): the drop does nothing
    if (M.Sel !== From || M.Pend) return null;
    if (To === 99) {
      // a no-target spell / jewel skill let go over the board: it is used (= choosing it a second time)
      const Self = typeof M.SelfCast === 'function' ? !!M.SelfCast(this.Who, From) : M.TargetIds(this.Who, From).length === 0;
      if (Self && (From === 40 || (From >= 0 && From <= 8)) && BoardPointer.Y < 800) return From;
      return 99;
    }
    return To;
  }

  // (kit DragDropNowhere) a drag let go on nothing: the selection is cancelled like clicking empty space.
  // Let go on itself (Self) = a finger that slid a little while tapping: the same as a tap (the drag start already
  // picked it; when it was picked before, this is the second tap on it)
  OnDragNowhere(Hit, Self) {
    const Hub = this.Hub;
    Hub.DragActive = false;
    const M = this.Match;
    const Id = Hit ? Hit._hubId : undefined;
    if (Self) {
      if (Hub.DragSkipped && Id !== undefined) Hub.Fire(Id);
      return;
    }
    if (M && Id !== undefined && this.OnBoardId(Id) && M.Current === this.Who && !M.Ended && (M.Sel >= 0 || M.Pend)) Hub.Fire(99);
  }
}

// ---------------------------------------------------------------- building the screen
function MakeOverlayDim(Opacity) {
  return RFull(new color_block({ DefaultColor: color(0.0, 0.0, 0.0), DefaultOpacity: Opacity }), 0);
}

function MakeBoardUI(P, Lib, Sfx, Keys) {
  const Hub = new hit_hub();
  // a click area that can't start a drag (buttons, enemy things, dialogs)
  const Fixed = Id => { const H = Hub.Make(Id); H.Draggable = false; return H; };
  const BM = new Map();
  const SetBM = (Id, X, Y, W, H) => BM.set(Id, BdRect(X, Y, W, H));
  const Slots = [];
  const Add = (...S) => { for (const X of S) Slots.push(X); };
  // background
  Add(RFull(new color_block({ DefaultColor: color(0.12, 0.09, 0.07) }), 0));
  Add(RBox(Tex(CardGui.T_Bg2, 1920, 1080), 0, 0, 1920, 1080, 1));
  // clicking empty space cancels a selection
  Add(RFull(Fixed(99), 2));
  // left panels
  Add(RBox(Tex(CardGui.T_PanelMsg, 476, 252), 36, 44, 476, 252, 3));
  const NaviPic = Tex(CardGui.T_HeroMe, 112, 112);
  Add(RBox(NaviPic, 52, 62, 112, 112, 4));
  const NaviName = OText(TxEmpty, 16, CGold, CInk);
  Add(RPin(NaviName.Root, 108, 190, 4));
  const NaviTxt = TxtWrap(TxEmpty, 17, CBrown, 312);
  Add(RBox(NaviTxt, 180, 64, 316, 220, 4));
  Add(RBox(Tex(CardGui.T_PanelLog, 476, 716), 36, 320, 476, 716, 3));
  const LogTitle = OText(TbLogTitle, 22, CGold, CInk);
  Add(RPin(LogTitle.Root, 274, 352, 4));
  const LogLines = IRange(0, 12).map(() => TxtLine(TxEmpty, 15, CBrown));
  LogLines.forEach((L, I) => Add(RPinTL(L, 60, 380 + I * 40, 4)));
  Add(RBox(new color_block({ DefaultColor: color(0.3, 0.2, 0.1), DefaultOpacity: 0.18 }), 56, 906, 436, 106, 4));
  const HintTxt = TxtWrap(TxEmpty, 15, CBrown, 420);
  Add(RBox(HintTxt, 66, 914, 424, 96, 5));
  // opponent name (top right)
  // (kept clear of the Fortnite menu button in the top right corner)
  Add(RBox(Tex(CardGui.T_Plate, 370, 64), 1446, 40, 370, 64, 3));
  const OppName = OText(TxEmpty, 19, CWhite, CInk);
  Add(RPin(OppName.Root, 1631, 72, 4));
  // right panel (enlarged card)
  Add(RBox(Tex(CardGui.T_Plate, 440, 64), 1450, 120, 440, 64, 3));
  const DetailTitle = OText(TbDetailTitle, 22, CGold, CInk);
  Add(RPin(DetailTitle.Root, 1670, 152, 4));
  const Detail = MakeCardFace(2.0, null);
  const HelpBox = new color_block({ DefaultColor: color(0.08, 0.05, 0.03), DefaultOpacity: 0.6 });
  Show(HelpBox, false);
  Add(RBox(Detail.Root, 1520, 200, 300, 428, 4));
  Add(RBox(HelpBox, 1450, 640, 440, 350, 3));
  const DetailHelp = new text_block({ DefaultText: TxEmpty, DefaultTextColor: CCream, DefaultTextSize: 14, DefaultJustification: text_justification.Left, AutoWrap: true, WrapWidth: 412 });
  Add(RBox(DetailHelp, 1462, 650, 418, 332, 4));
  const DetailHint = Txt(TbDetailHint, 20, CCream);
  Add(RPin(DetailHint, 1670, 430, 4));
  // board slots
  const Units = [];
  for (let C = 0; C <= 2; C++) {
    const V = MakeUnitView(false);
    Units.push(V);
    Add(RBox(V.Root, CellX(C), LRowMe, 170, 170, 10));
    // the click area covers the whole cell including half of the gaps around it
    Add(RBox(Hub.Make(10 + C), CellX(C) - 9, LRowMe - 20, 188, 210, 60));
    SetBM(10 + C, CellX(C), LRowMe, 170, 170);
  }
  for (let C = 0; C <= 2; C++) {
    const V = MakeUnitView(true);
    Units.push(V);
    Add(RBox(V.Root, CellX(C), LRowFoe, 170, 170, 10));
    Add(RBox(Fixed(20 + C), CellX(C) - 9, LRowFoe - 20, 188, 210, 60));
    SetBM(20 + C, CellX(C), LRowFoe, 170, 170);
  }
  // players
  const MeHero = MakeHeroView(CardGui.T_HeroMe);
  const FoeHero = MakeHeroView(CardGui.T_HeroFoe);
  Add(RBox(Hub.Make(30), 885, 656, 150, 150, 60), RBox(Fixed(31), 885, 46, 150, 150, 60));
  Add(RBox(MeHero.Root, 885, 656, 150, 150, 10));
  Add(RBox(FoeHero.Root, 885, 46, 150, 150, 10));
  SetBM(30, 885, 656, 150, 150);
  SetBM(31, 885, 46, 150, 150);
  // jewels
  const JewelMeGlow = TexTint(CardGui.T_HexGlow, 140, 140, GlowReady);
  const JewelMe = Tex(CardGui.T_JwBook, 120, 120);
  const JewelMeCost = ONum(2, 30, CWhite, CInk);
  const JewelFoeGlow = TexTint(CardGui.T_HexGlow, 140, 140, CGold);
  const JewelFoe = Tex(CardGui.T_JwBolt, 120, 120);
  const JewelFoeCost = ONum(2, 30, CWhite, CInk);
  Show(JewelMeGlow, false);
  Show(JewelFoeGlow, false);
  Add(RPin(JewelMeGlow, 795, 731, 9), RPin(JewelMe, 795, 731, 10), RPin(JewelMeCost.Root, 750, 684, 11));
  Add(RBox(Hub.Make(40), 740, 676, 110, 110, 60));
  Add(RPin(JewelFoeGlow, 1125, 121, 9), RPin(JewelFoe, 1125, 121, 10), RPin(JewelFoeCost.Root, 1080, 74, 11));
  Add(RBox(Fixed(42), 1070, 66, 110, 110, 60));
  SetBM(40, 740, 676, 110, 110);
  SetBM(42, 1070, 66, 110, 110);
  const EvoFoe = OText(TxEmpty, 18, CPink, CInk);
  Add(RPin(EvoFoe.Root, 1125, 200, 12));
  // mana
  const ManaMe = IRange(1, CardMaxMana).map(() => Tex(CardGui.T_ManaOn, 24, 30));
  const ManaFoe = IRange(1, CardMaxMana).map(() => Tex(CardGui.T_ManaOn, 24, 30));
  ManaMe.forEach((T, I) => Add(RPin(T, I < 5 ? 1062 : 1090, 676 + Mod(I, 5) * 29, 12)));
  ManaFoe.forEach((T, I) => Add(RPin(T, I < 5 ? 858 : 830, 66 + Mod(I, 5) * 29, 12)));
  const ManaMeTxt = OText(TxEmpty, 24, CBlue, CInk);
  const ManaFoeTxt = OText(TxEmpty, 24, CBlue, CInk);
  Add(RPin(ManaMeTxt.Root, 1160, 790, 12), RPin(ManaFoeTxt.Root, 760, 182, 12));
  // decks
  const DeckMe = Tex(CardGui.T_CardBack, 120, 171);
  const DeckFoe = Tex(CardGui.T_CardBack, 120, 171);
  Add(RBox(DeckMe, 1280, 520, 120, 171, 5), RBox(DeckFoe, 526, 60, 120, 171, 5));
  const DeckMeTxt = ONum(40, 32, CWhite, CInk);
  const DeckFoeTxt = ONum(40, 32, CWhite, CInk);
  Add(RPin(DeckMeTxt.Root, 1340, 605, 6), RPin(DeckFoeTxt.Root, 586, 145, 6));
  Add(RPin(Txt(TbDeck, 14, CCream), 1340, 704, 6), RPin(Txt(TbDeck, 14, CCream), 586, 244, 6));
  // graves (the newest card on top; choosing one opens the list)
  const GraveFoe = MakeCardFace(0.8, null);
  const GraveMe = MakeCardFace(0.8, null);
  GraveFoe.SetShown(false);
  GraveMe.SetShown(false);
  Add(RBox(Tex(CardGui.T_GraveSlot, 120, 171), 526, 268, 120, 171, 5), RBox(GraveFoe.Root, 526, 268, 120, 171.2, 6));
  Add(RBox(Tex(CardGui.T_GraveSlot, 120, 171), 526, 474, 120, 171, 5), RBox(GraveMe.Root, 526, 474, 120, 171.2, 6));
  Add(RBox(Fixed(46), 526, 268, 120, 171, 60), RBox(Fixed(45), 526, 474, 120, 171, 60));
  SetBM(46, 526, 268, 120, 171);
  SetBM(45, 526, 474, 120, 171);
  const GraveFoeTxt = OText(TxEmpty, 14, CCream, CInk);
  const GraveMeTxt = OText(TxEmpty, 14, CCream, CInk);
  Add(RPin(GraveFoeTxt.Root, 586, 451, 7), RPin(GraveMeTxt.Root, 586, 657, 7));
  // enemy hand (backs)
  const FoeBacks = IRange(0, CardMaxHand - 1).map(() => Tex(CardGui.T_CardBack, 56, 80));
  FoeBacks.forEach((B, I) => Add(RBox(B, 1215 + I * 26, 34, 56, 80, 5)));
  // buttons
  // (the buttons' click areas are separate widgets above every effect)
  const Evolve = MakePicButtonG(BtnPurple, TbEvolve(0), 160, 64, 20, NoHit(), true);
  Add(RBox(Evolve.Root, 1280, 314, 160, 70, 12));
  const EndTurn = MakePicButtonG(BtnEnd, TbEndTurn, 160, 64, 22, NoHit(), true);
  Add(RBox(EndTurn.Root, 1280, 400, 160, 70, 12));
  const Surrender = MakePicButton(BtnEnd, TbSurrender, 110, 40, 16, NoHit());
  Add(RBox(Surrender.Root, 1780, 1000, 110, 44, 12));
  Add(RBox(Fixed(47), 1280, 314, 160, 64, 60), RBox(Fixed(50), 1280, 400, 160, 64, 60), RBox(Fixed(55), 1780, 1000, 110, 40, 60));
  Add(RPin(OText(IslandCodeText(Lib), 22, CGold, CInk).Root, 1600, 1021, 4));
  SetBM(47, 1280, 314, 160, 64);
  SetBM(50, 1280, 400, 160, 64);
  SetBM(55, 1780, 1000, 110, 40);
  const TimerTxt = OText(TxEmpty, 22, CGold, CInk);
  Add(RPin(TimerTxt.Root, 1360, 486, 13));
  const TurnTxt = OText(TxEmpty, 26, CWhite, CInk);
  Add(RPin(TurnTxt.Root, 960, 426, 14));
  // hand cards (positions are set by Refresh)
  const Hand = IRange(0, CardMaxHand - 1).map(() => MakeCardFace(1.0, null));
  const HandHits = IRange(0, CardMaxHand - 1).map(I => Hub.Make(I));
  // pop-ups, flying card, cursor, toast, banner, cast
  const Pops = IRange(0, 7).map(() => MakePopup());
  const Fly = Tex(CardGui.T_CardBack, 120, 171);
  const Corners = [Tex(CardGui.T_CurTL, 40, 40), Tex(CardGui.T_CurTR, 40, 40), Tex(CardGui.T_CurBL, 40, 40), Tex(CardGui.T_CurBR, 40, 40)];
  const ToastTxt = OText(TxEmpty, 40, CGold, CInk);
  Show(ToastTxt.Root, false);
  Add(RPin(ToastTxt.Root, 960, 426, 53));
  const BannerTxt = OText(TxEmpty, 44, CWhite, CInk);
  const BannerRoot = new canvas({ Slots: [Box(Tex(CardGui.T_Banner, 880, 136), 0, 0, 880, 136, 0), Pin(BannerTxt.Root, 440, 64, 1)] });
  const BannerSlot = RBox(BannerRoot, 520, 358, 880, 136, 55);
  // the card being played: big in the middle over a dimmed board (the click areas stay above it)
  const CastFace = MakeCardFace(2.0, null);
  const CastLabel = OText(TxEmpty, 34, CGold, CInk);
  const CastRoot = new canvas({
    Slots: [
      MakeOverlayDim(0.45),
      RBox(Tex(CardGui.T_Plate, 460, 70), 730, 152, 460, 70, 1),
      RPin(CastLabel.Root, 960, 186, 2),
      RBox(CastFace.Root, 810, 232, 300, 428, 2),
    ],
  });
  const CastSlot = RFull(CastRoot, 54);
  // the card whose effect goes off (right of the board, where the old cast was)
  const TrigFace = MakeCardFace(1.4, null);
  const TrigLabel = OText(TxEmpty, 24, CGold, CInk);
  const TrigRoot = new canvas({ Slots: [Box(Tex(CardGui.T_Plate, 250, 54), -14, -60, 250, 54, 0), Pin(TrigLabel.Root, 105, -33, 1), Box(TrigFace.Root, 0, 0, 210, 299.6, 0)] });
  const TrigSlot = RBox(TrigRoot, 1268, 250, 210, 299.6, 54);
  // ---- mulligan
  const MS = [MakeOverlayDim(0.62), RBox(Tex(CardGui.T_Plate, 900, 90), 510, 150, 900, 90, 1)];
  MS.push(RPin(OText(TbMullTitle, 30, CGold, CInk).Root, 960, 195, 2));
  const MullFaces = IRange(0, 3).map(() => MakeCardFace(1.5, null));
  const MullMarks = IRange(0, 3).map(() => OText(TbSwap, 48, CRed, CWhite));
  MullFaces.forEach((F, I) => {
    const X = 472.5 + I * 250;
    MS.push(RBox(F.Root, X, 290, 225, 321, 2));
    // the click area is above the 交換 mark (the mark, shown or hidden, would catch the clicks on the middle of the card)
    MS.push(RBox(Fixed(60 + I), X, 290, 225, 321, 4));
    SetBM(60 + I, X, 290, 225, 321);
  });
  MullMarks.forEach((Mk, I) => MS.push(RPin(Mk.Root, 585 + I * 250, 450, 3)));
  MS.push(RPin(Txt(TbMullHelp, 20, CCream), 960, 660, 2));
  const MullOk = MakePicButton(BtnGold, TbDecide, 300, 76, 32, Fixed(64));
  MS.push(RBox(MullOk.Root, 810, 710, 300, 82, 3));
  const MullTimer = OText(TxEmpty, 28, CGold, CInk);
  MS.push(RPin(MullTimer.Root, 1260, 748, 3));
  SetBM(64, 810, 710, 300, 76);
  const MullSlot = RFull(new canvas({ Slots: MS }), 85);
  // ---- surrender confirmation
  const Yes = MakePicButton(BtnEnd, TbSurrenderYes, 260, 76, 28, Fixed(56));
  const No = MakePicButton(BtnGold, TbSurrenderNo, 260, 76, 28, Fixed(57));
  const ConfirmRoot = new canvas({
    Slots: [
      MakeOverlayDim(0.6),
      RBox(Tex(CardGui.T_PanelMsg, 760, 400), 580, 300, 760, 400, 1),
      RPin(TxtDark(TbSurrenderAsk, 40), 960, 420, 2),
      RPin(TxtDark(TbSurrenderNote, 22), 960, 490, 2),
      RBox(Yes.Root, 650, 560, 260, 82, 3),
      RBox(No.Root, 1010, 560, 260, 82, 3),
    ],
  });
  const ConfirmSlot = RFull(ConfirmRoot, 93);
  SetBM(56, 650, 560, 260, 76);
  SetBM(57, 1010, 560, 260, 76);
  // ---- grave list
  const GS = [MakeOverlayDim(0.75), RBox(Tex(CardGui.T_PanelLog, 1840, 1000), 40, 40, 1840, 1000, 1)];
  const GraveTitle = OText(TxEmpty, 34, CGold, CInk);
  const GravePageTxt = OText(TxEmpty, 22, CWhite, CInk);
  const GraveEmpty = OText(TbGraveEmpty, 28, CCream, CInk);
  GS.push(RPin(GraveTitle.Root, 700, 100, 2), RPin(GravePageTxt.Root, 700, 948, 2), RPin(GraveEmpty.Root, 700, 480, 2));
  const GraveFaces = [];
  for (let I = 0; I <= GravePer - 1; I++) {
    const X = 110 + Mod(I, GraveCols) * 152;
    const Y = 150 + Quotient(I, GraveCols) * 252;
    const GH = Fixed(200 + I);
    const F = MakeCardFace(1.0, GH);
    GraveFaces.push(F);
    GS.push(RBox(F.Root, X, Y, 150, 214, 3));
    SetBM(200 + I, X, Y, 150, 214);
  }
  const GraveBig = MakeCardFace(1.6, null);
  const GraveHelp = new text_block({ DefaultText: TxEmpty, DefaultTextColor: CBrown, DefaultTextSize: 16, DefaultJustification: text_justification.Left, AutoWrap: true, WrapWidth: 460 });
  GraveBig.SetShown(false);
  GS.push(RBox(GraveBig.Root, 1440, 100, 240, 342.4, 3), RBox(GraveHelp, 1360, 460, 470, 440, 3));
  const GPrev = MakePicButton(BtnBlue, TbPrev, 220, 70, 26, Fixed(230));
  const GNext = MakePicButton(BtnBlue, TbNext, 220, 70, 26, Fixed(231));
  const GClose = MakePicButton(BtnGold, TbClose, 260, 76, 28, Fixed(232));
  GS.push(RBox(GPrev.Root, 330, 912, 220, 76, 3), RBox(GNext.Root, 850, 912, 220, 76, 3), RBox(GClose.Root, 1480, 912, 260, 82, 3));
  SetBM(230, 330, 912, 220, 70);
  SetBM(231, 850, 912, 220, 70);
  SetBM(232, 1480, 912, 260, 76);
  const GraveSlot = RFull(new canvas({ Slots: GS }), 94);
  // ---- summon entrances / evolve spin (put on the root only while they play)
  const SumRays = Tex(CardGui.T_Rays, 400, 400);
  const SumRaysB = Tex(CardGui.T_RaysB, 400, 400);
  const SumRing = Tex(CardGui.T_Ring, 300, 300);
  const SumFlash = new color_block({ DefaultColor: CWhite, DefaultOpacity: 0.8 });
  const SumText = OText(TxEmpty, 64, CGold, CInk);
  const SumSparks = IRange(0, 13).map(() => TexTint(CardGui.T_Sparkle, 40, 40, CGold));
  const SpinPanel = Tex(CardGui.T_UnitMe, 170, 170);
  const SpinArt = Tex(CardMon.f_slime, 100, 100);
  const SpinGlow = TexTint(CardGui.T_Shine, 300, 300, CPink);
  // ---- the プレミア化 show (collection)
  const SpinFrame = Tex(CardGui.T_FrameMon, 300, 428);
  const SpinArtBig = Tex(CardMon.f_slime, 256, 192);
  const SpinBack = Tex(CardGui.T_CardBack, 300, 428);
  const SpinFace = MakeCardFace(2.0, null);
  SpinFace.SetShown(false);
  const SpinLabel = OText(TxEmpty, 64, CGold, CRed);
  const SpinSub = OText(TxEmpty, 26, CWhite, CInk);
  const SpinOk = MakePicButton(BtnGold, TbOk, 300, 80, 32, Fixed(780));
  SetBM(780, 810, 960, 300, 80);
  const SpinCanvas = new canvas({
    Slots: [
      MakeOverlayDim(0.8),
      RBox(TexTint(CardGui.T_Rays, 1000, 1000, CGold), 460, -30, 1000, 1000, 1),
      RBox(SpinFace.Root, 810, 256, 300, 428, 5),
      RPin(SpinLabel.Root, 960, 120, 6),
      RPin(SpinSub.Root, 960, 900, 6),
      RBox(SpinOk.Root, 810, 960, 300, 86.4, 7),
    ],
  });
  const SpinSlot = RFull(SpinCanvas, 118);
  // ---- the coin toss
  const CoinPic = Tex(CardGui.T_CoinFirst, 260, 260);
  const CoinTxt = OText(TxEmpty, 80, CGold, CRed);
  const CoinShadow = Tex(CardGui.T_Fx2_Shadow, 230, 64);
  const CoinRays = Tex(CardGui.T_Rays, 700, 700);
  const CoinCanvas = new canvas({
    Slots: [
      MakeOverlayDim(0.6),
      RBox(Tex(CardGui.T_Banner, 1000, 154), 460, 110, 1000, 154, 5),
      RPin(OText(TbCoinHead, 44, CGold, CInk).Root, 960, 182, 6),
    ],
  });
  const CoinSlot = RFull(CoinCanvas, 117);
  // 喜怒哀楽 stamps: the menu (over the own side of the board) and one picture per side
  const SS = [RBox(Tex(CardGui.T_PanelMsg, 640, 200), 640, 440, 640, 200, 0)];
  for (let I = 0; I <= 3; I++) {
    const X = 668 + I * 124;
    const SH = Fixed(700 + I);
    SS.push(RBox(Tex(I === 1 ? CardGui.T_Stamp1 : I === 2 ? CardGui.T_Stamp2 : I === 3 ? CardGui.T_Stamp3 : CardGui.T_Stamp0, 104, 104), X, 488, 104, 104, 1), RBox(SH, X, 488, 104, 104, 5));
    SetBM(700 + I, X, 488, 104, 104);
  }
  const SClose = MakePicButton(BtnEnd, TbClose, 110, 50, 18, Fixed(704));
  SS.push(RBox(SClose.Root, 1160, 515, 110, 54, 3));
  SetBM(704, 1160, 515, 110, 50);
  const StampSlot = RFull(new canvas({ Slots: SS }), 93);
  // ---- tutorial panel (covers the battle log, which nothing clicks on)
  const TutHead = OText(TbTutTitle, 30, CWhite, CInk);
  const TutText = TxtWrap(TxEmpty, 21, CBrown, 410);
  const TutNext = MakePicButton(BtnGold, TbNext, 260, 72, 30, Fixed(66));
  const TutBtnSlot = Box(TutNext.Root, 108, 610, 260, 77.8, 3);
  SetBM(66, 144, 930, 260, 72);
  const TutCanvas = new canvas({
    Slots: [
      Box(Tex(CardGui.T_PanelLog, 476, 716), 0, 0, 476, 716, 0),
      Box(Tex(CardGui.T_Plate, 400, 64), 38, 18, 400, 64, 1),
      Pin(TutHead.Root, 238, 50, 2),
      Box(TutText, 32, 100, 412, 500, 2),
    ],
  });
  const TutSlot = RBox(TutCanvas, 36, 320, 476, 716, 86);
  // ---- notice (along the top edge, where no screen has buttons)
  const NoticeTxt = OText(TxEmpty, 22, CGold, CInk);
  const NoticeRoot = new canvas({ Slots: [Box(Tex(CardGui.T_Plate, 920, 54), 0, 0, 920, 54, 0), Pin(NoticeTxt.Root, 460, 27, 1)] });
  const NoticeSlot = RBox(NoticeRoot, 500, 4, 920, 54, 150);
  const Stamps = [Tex(CardGui.T_Stamp0, 130, 130), Tex(CardGui.T_Stamp0, 130, 130)];
  for (const St of Stamps) Show(St, false);
  Add(RBox(Stamps[0], 1050, 666, 130, 130, 56), RBox(Stamps[1], 700, 56, 130, 130, 56));
  const Root = new canvas({ Slots });
  const B = new board_ui({
    P, Lib, Hub, Keys, Sfx, Root,
    Fx: MakeVfx(Root),
    Bounds: BM,
    Units, MeHero, FoeHero, Hand, HandHits, FoeBacks, DeckMe, DeckFoe, ManaMe, ManaFoe, ManaMeTxt, ManaFoeTxt,
    JewelMe, JewelFoe, JewelMeGlow, JewelFoeGlow, JewelMeCost, JewelFoeCost, EndTurn, Evolve, EvoFoe, TurnTxt, TimerTxt,
    DeckMeTxt, DeckFoeTxt, GraveMe, GraveFoe, GraveMeTxt, GraveFoeTxt, NaviPic, NaviName, NaviTxt, OppName, HintTxt,
    LogLines, Detail, DetailHelp, DetailHint, HelpBox, Pops, Fly, Corners, ToastTxt, BannerTxt, CastFace, CastLabel,
    TrigFace, TrigLabel, MullSlot, BannerSlot, CastSlot, TrigSlot, ConfirmSlot, GraveSlot, StampSlot, Stamps, MullFaces,
    MullMarks, MullTimer, GraveFaces, GraveTitle, GravePageTxt, GraveEmpty, GraveBig, GraveHelp, TutSlot, TutCanvas,
    TutHead, TutText, TutBtnSlot, NoticeSlot, NoticeTxt,
    GraveCloseLbl: GClose.Label,
    SumRays, SumRaysB, SumRing, SumFlash, SumText, SumSparks, SpinPanel, SpinArt, SpinSlot, SpinCanvas, SpinFrame,
    SpinArtBig, SpinBack, SpinFace, SpinLabel, SpinSub, CoinSlot, CoinCanvas, CoinPic, CoinTxt, CoinShadow, CoinRays,
    Pics: MakeFxPool(14),
    CoinPics: MakeFxPool(4),
    SpinGlow,
    AnimFaces: [...Hand, ...MullFaces, Detail, CastFace, TrigFace, GraveBig],
  });
  // drag and drop on the battle board (see the note at the top)
  Hub.DragStartSkip = Id => B.DragStartSkip(Id);
  Hub.DragDropMap = (From, To) => B.DragDropMap(From, To);
  return B;
}

// ---------------------------------------------------------------- texts of the battle screen
const TxEvolveCall = "EVOLVE!";
const TbVictory = "VICTORY!";
const TbDefeat = "DEFEAT...";
const TbDraw = "DRAW";
const TbCoinHead = "コイントスで先攻・後攻を決めます！";
const TbCoinFirst = "あなたが先攻！";
const TbCoinSecond = "あなたは後攻！";
function TbVsNameLv(N, H, L) { return `VS ${N} Lv${L}（${H}）`; }
const TbOk = "OK";
function TbEvoAfter(A0, A1, H0, H1) { return `【進化すると】攻撃力${A0}→${A1}　体力${H0}→${H1}`; }
function TbFrontDown(N) { return `《正面のアリジゴクで攻撃力-${N}》`; }
function TbPlayedCost(A, B) { return `《マナ${A}→${B}で召喚》`; }
const TbPremDone1 = "プレミア化！";
const TbPremDone2 = "プレミア化★★！";
const TbPremSub1 = "カードがキラキラになった！同じカードはすべてキラキラで登場するよ";
const TbPremSub2 = "カードが動き出した！キラキラ＋アニメーションで登場するよ";
const TbLogTitle = "バトルログ";
function TbLogLine(L) { return `・${L}`; }
const TbDetailTitle = "カード詳細";
const TbDetailHint = "カードやモンスターに\nカーソルを合わせると\nここに詳しく表示されます";
const TbDeck = "山札";
function TbGraveCount(N) { return `墓地 ${N}枚`; }
const TbGraveHint = "【墓地】破壊されたモンスターや使ったスペル。選ぶと一覧が見られるよ。";
function TbGraveMine(N) { return `あなたの墓地（${N}枚）`; }
function TbGraveFoe(N) { return `相手の墓地（${N}枚）`; }
const TbGraveEmpty = "まだ何もないよ";
function TbPage(A, B) { return `${A} / ${B} ページ`; }
const TbPrev = "前へ";
const TbNext = "次へ";
const TbClose = "とじる";
const TbDecide = "決定";
function TbVsName(N, H) { return `VS ${N}（${H}）`; }
const TbMyTurn = "あなたのターンです";
const TbTheirTurn = "相手のターンです";
const TbEndTurn = "ターン終了";
const TbTheirTurnBtn = "相手のターン";
const TbSurrender = "降参";
function TbEvolve(N) { return `進化（残り${N}）`; }
function TbEvoIn(N) { return `進化（あと${N}ターン）`; }
// the evolve button before it can be used
const EvoDark = color(0.18, 0.16, 0.22);
function TbEvoFoe(N) { return `進化 残り${N}`; }
const TbEvolvedNote = "★進化ずみ";
const TbSilencedNote = "【効果消滅】このモンスターのカードの効果とキーワードはすべて消えている。";
function TbCountNote(N) { return `カウントダウン：あと${N}`; }
function TbCostChanged(A, B) { return `《マナ${A}→${B}》`; }
const TbHintPad = "【コントローラー】\nLB/RB：行動を選ぶ　Y(△)：決定\nX(□)：キャンセル　LT/RT：上下に移動";
const TbHintMouse = "【操作】クリックで選んで、クリックで決定。\nキーボード：Q/E 選ぶ・F 決定・I キャンセル・Z/C 上下に移動";
function TbJewelInfo(J, H, C, T, U) { return `【${J}】（${H}のジュエル）\nマナ${C}：${T}\n\n1ターンに1回まで使える。${U}`; }
const TbJewelUsed = "（このターンは使用済み）";
function TbHeroMe(H, R, Hp, Mx, Sh, A, Hand, Deck, Grave, Evo) { return `【あなた：${H}（${R}）】\nHP ${Hp}/${Mx}　シールド ${Sh}　攻撃力 ${A}\n手札 ${Hand}枚　山札 ${Deck}枚　墓地 ${Grave}枚\n進化ポイント 残り${Evo}\n\n攻撃力があるときは、あなた自身も1回攻撃できる（攻撃すると攻撃力は0に戻る）。`; }
function TbLeaderEnd(B, C, N) { return `${B}\n\n【冥府の力】ターン終了時：「${C}」を召喚する（×${N}）`; }
function TbHeroFoe(N, H, Hp, Mx, Sh, A, Hand, Deck, Grave, Evo) { return `【相手：${N}（${H}）】\nHP ${Hp}/${Mx}　シールド ${Sh}　攻撃力 ${A}\n手札 ${Hand}枚　山札 ${Deck}枚　墓地 ${Grave}枚\n進化ポイント 残り${Evo}\n\nHPを0にすれば勝利！`; }
const TbEndInfo = "【ターン終了】\n相手にターンを渡す。\nターンのはじめにマナが全回復して、最大マナが1増える（最大10）。";
const TbSurrenderInfo = "【降参】\nこの対戦をあきらめる。押すと確認が出るよ。";
function TbEvoInfo(N, T) { return `【進化】\n自分のモンスターを選んでから押すと進化する（+2/+2など）。\n1ターンに1回。自分の${T}ターン目から使える。\n進化ポイント 残り${N}（先攻2回・後攻3回）`; }
const TbMullTitle = "交換したいカードを選んでください";
const TbSwap = "交換";
const TbMullHelp = "選ぶと「交換」を切り替え。交換したカードは山札に戻り、同じ枚数を引き直します。";
const TbMullSay = "いらないカードは交換できるよ。交換したいカードを選んで「決定」を押してね。";
const TbWaitOpp = "相手の準備を待っています…";
const TbSurrenderYes = "降参する";
const TbSurrenderNo = "やめる";
const TbTutTitle = "チュートリアル";
const TbTutDo = "やってみよう！";
const TbSurrenderAsk = "本当に降参しますか？";
const TbSurrenderNote = "降参すると、この対戦は負けになります。";
