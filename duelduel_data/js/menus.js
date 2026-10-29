// menus.js — card_menus.verse: every screen outside the battle: title, battle menu, matchmaking (wait / room number),
// character select, 2Pick draft, shop + pack opening, collection, card back setting, daily quests, hour bonus,
// profile, rules, result and the "get!" pop-up. All of them are overlays on the player's board_ui and use its cursor (Pick).
// Ported 1:1 (same names, coordinates, z, texts). Changes / additions:
// - MenuHit(B, Id): B.Hub.Make(Id) with Draggable = false (every menu click area; MBtn uses it, so the pass /
//   achieve / extra buttons made with MBtn are not draggable either).
// - Verse race cancels the losers; here the tick loops (TitleTick, BattleTick, WaitTick, QuestTick, LoginTick,
//   OppTick) get a stop flag that is set after the race, and the pack opening checks PackGen after every wait so a
//   skipped opening stops (Verse cancelled it). WaitScreen is cancelled from outside (card_manager races it):
//   its finally only hides the wait screen when no newer WaitScreen started. The pack opening's すべて開ける is waited
//   for by PackSkipWait (Hub.Clicks / Keys.Keys) instead of a B.Pick that would be left waiting when the pack wins.
// - Sleep(100000000.0) "forever" → a promise that never resolves (setTimeout can't wait that long).
// - The room number / secret code keypad also takes 0-9, Backspace / Delete (消す) and Enter (決定) from the keyboard
//   while that screen is open (a capture keydown listener: those keys don't reach card_keys there, Esc still does).
// - Lobby.RoomMode / Lobby.JoinRoom are async in lobby.js (awaited; 「接続中…」 is shown meanwhile, and RoomMode -1 =
//   no such room skips JoinRoom).
// - V-Bucks gem packs (ids 190-192): `await ComingSoon(B)` (shop.js) instead of the Epic purchase.
// - TxAgent(P) → P.Name.
// - (10/28) 遊び方 and the "get!" pop-up close with a tap anywhere (board.js MakeTapDim; ShowGain ends early on a tap);
//   the collection's card help gets smaller / scrolls instead of running over the プレミア化 button (kit FitTextBox).
'use strict';

// a menu click area: dragging means nothing in the menus
function MenuHit(B, Id) {
  const H = B.Hub.Make(Id);
  H.Draggable = false;
  return H;
}
// Verse Sleep(100000000.0): never ends
function MenuNever() { return new Promise(() => { }); }

// ---------------------------------------------------------------- small widgets
// a bar that fills from the left (or from the bottom when Vertical)
class bar_view {
  constructor(o) { this.Root = o.Root; this.Fill = o.Fill; this.W = o.W; this.H = o.H; this.Vertical = o.Vertical ?? false; }
  Set(R) {
    const K = Max(0.0, Min(1.0, R));
    this.Root.RemoveWidget(this.Fill);
    if (K > 0.0) {
      if (this.Vertical) this.Root.AddWidget(Box(this.Fill, 0.0, this.H - this.H * K, this.W, this.H * K, 1));
      else this.Root.AddWidget(Box(this.Fill, 0.0, 0.0, this.W * K, this.H, 1));
    }
  }
}

function MakeBar(W, H, Bg, Fg, Vertical) {
  const Fill = new color_block({ DefaultColor: Fg });
  return new bar_view({ Root: new canvas({ Slots: [Box(new color_block({ DefaultColor: Bg, DefaultOpacity: 0.8 }), 0.0, 0.0, W, H, 0)] }), Fill, W, H, Vertical });
}

// one character panel (title showcase or character select)
class char_panel {
  constructor(o) {
    this.Root = o.Root; this.Glow = o.Glow; this.Pic = o.Pic; this.Name = o.Name; this.Race = o.Race; this.JPic = o.JPic;
    this.JName = o.JName; this.Cost = o.Cost; this.Desc = o.Desc; this.Mark = o.Mark;
  }
  Set(L, H) {
    this.Pic.SetImage(H.Pic);
    this.SetRest(L, H);
  }
  // with the player's costume
  SetFor(L, P, H) {
    this.Pic.SetImage(CardHeroPic(P, H));
    this.SetRest(L, H);
    this.Name.Set(CardHeroName(P, H));
    this.Race.SetText(CardHeroRace(P, H));
  }
  SetRest(L, H) {
    this.Name.Set(H.Name);
    this.Race.SetText(H.Race);
    this.JPic.SetImage(H.JewelPic);
    this.JName.SetText(H.JewelName);
    this.Cost.Set(TmMana(H.Cost));
    this.Desc.SetText(JewelText(L.DB, H));
  }
  Pick(On) {
    Show(this.Glow, On);
    Show(this.Mark.Root, On);
  }
}

// tall (330 x 470) used on the title
function MakeCharTall(Hit) {
  const G = TexTint(CardGui.T_GlowCard, 380.0, 520.0, CGold);
  const Pic = Tex(CardGui.T_HeroMe, 190.0, 190.0);
  const Name = OText(TxEmpty, 34.0, CWhite, CInk);
  const Race = TxtDark(TxEmpty, 18.0);
  const JPic = Tex(CardGui.T_JwBook, 78.0, 78.0);
  const JName = TxtLine(TxEmpty, 20.0, CBrown);
  const Cost = OText(TxEmpty, 20.0, CBlue, CInk);
  const Desc = TxtWrap(TxEmpty, 16.0, CBrown, 290.0);
  const Mark = OText(TmInUse, 22.0, CWhite, color(0.75, 0.1, 0.05));
  Show(G, false);
  return new char_panel({
    Root: new canvas({
      Slots: [
        Box(G, -25.0, -25.0, 380.0, 520.0, 0),
        Box(Tex(CardGui.T_PanelChar, 330.0, 470.0), 0.0, 0.0, 330.0, 470.0, 1),
        Box(Pic, 70.0, 22.0, 190.0, 190.0, 2),
        Pin(Name.Root, 165.0, 240.0, 3),
        Pin(Race, 165.0, 278.0, 3),
        Box(JPic, 18.0, 300.0, 78.0, 78.0, 3),
        PinL(JName, 104.0, 324.0, 3),
        PinL(Cost.Root, 104.0, 356.0, 3),
        Box(Desc, 22.0, 388.0, 292.0, 74.0, 3),
        Pin(Mark.Root, 165.0, 16.0, 4),
        Box(Hit, 0.0, 0.0, 330.0, 470.0, 10),
      ],
    }),
    Glow: G, Pic, Name, Race, JPic, JName, Cost, Desc, Mark,
  });
}

// wide (400 x 290) used on the character select
function MakeCharWide(Hit) {
  const G = TexTint(CardGui.T_GlowCard, 440.0, 330.0, CGold);
  const Pic = Tex(CardGui.T_HeroMe, 140.0, 140.0);
  const Name = OText(TxEmpty, 30.0, CWhite, CInk);
  const Race = TxtDark(TxEmpty, 16.0);
  const JPic = Tex(CardGui.T_JwBook, 60.0, 60.0);
  const JName = TxtLine(TxEmpty, 17.0, CBrown);
  const Cost = OText(TxEmpty, 18.0, CBlue, CInk);
  const Desc = TxtWrap(TxEmpty, 15.0, CBrown, 360.0);
  const Mark = OText(TmPicked, 20.0, CWhite, color(0.75, 0.1, 0.05));
  Show(G, false);
  Show(Mark.Root, false);
  return new char_panel({
    Root: new canvas({
      Slots: [
        Box(G, -20.0, -20.0, 440.0, 330.0, 0),
        Box(Tex(CardGui.T_PanelChar, 400.0, 290.0), 0.0, 0.0, 400.0, 290.0, 1),
        Box(Pic, 16.0, 16.0, 140.0, 140.0, 2),
        Pin(Name.Root, 278.0, 46.0, 3),
        Pin(Race, 278.0, 84.0, 3),
        Box(JPic, 170.0, 104.0, 60.0, 60.0, 3),
        PinL(JName, 238.0, 124.0, 3),
        PinL(Cost.Root, 238.0, 152.0, 3),
        Box(Desc, 20.0, 176.0, 360.0, 100.0, 3),
        Pin(Mark.Root, 200.0, 6.0, 4),
        Box(Hit, 0.0, 0.0, 400.0, 290.0, 10),
      ],
    }),
    Glow: G, Pic, Name, Race, JPic, JName, Cost, Desc, Mark,
  });
}

class quest_row {
  constructor(o) {
    this.Name = o.Name; this.Bar = o.Bar; this.Prog = o.Prog; this.CoinIcon = o.CoinIcon; this.CoinAmt = o.CoinAmt;
    this.GemIcon = o.GemIcon; this.GemAmt = o.GemAmt; this.XpTxt = o.XpTxt; this.Btn = o.Btn;
  }
}

class login_card {
  constructor(o) {
    this.Day = o.Day; this.Icon = o.Icon; this.Amt = o.Amt;
    this.Both = o.Both;           // coins and gems on the same day
    this.BothCoins = o.BothCoins; this.BothGems = o.BothGems; this.Veil = o.Veil; this.Stamp = o.Stamp; this.Glow = o.Glow;
  }
}

// a card in a grid (collection / pack summary) with a dark veil for cards not owned and a count
class grid_card {
  constructor(o) { this.Face = o.Face; this.Veil = o.Veil; this.Count = o.Count; this.New = o.New; }
}

function MakeGridCard(S, Hit) {
  // the hit area sits above the veil (a shown veil would catch the clicks on cards not owned)
  const F = MakeCardFace(S, null);
  const Veil = new color_block({ DefaultColor: color(0.02, 0.02, 0.05), DefaultOpacity: 0.7 });
  const Count = OText(TxEmpty, 18.0 * S + 6.0, CWhite, CInk);
  const New = OText(TmNew, 18.0 * S + 6.0, CGold, CRed);
  Show(Veil, false);
  Show(New.Root, false);
  const W = 150.0 * S;
  const H = 214.0 * S;
  const Root = new canvas({ Slots: [Box(F.Root, 0.0, 0.0, W, H, 0), Box(Veil, 0.0, 0.0, W, H, 25), Pin(Count.Root, W / 2.0, H - 14.0, 26), Pin(New.Root, W * 0.27, H * 0.2, 26), Box(Hit, 0.0, 0.0, W, H, 27)] });
  return [new grid_card({ Face: F, Veil, Count, New }), Root];
}

// a progress object shared by the two players of a draft (the AI and the CPU battle use it too)
// (online: OnPick sends the own picks right away, OnOpp redraws the opponent's count as soon as it arrives)
class draft_progress {
  constructor(o = {}) {
    this.Picks = o.Picks ?? [0, 0];
    this.OnPick = null;
    this.OnOpp = null;
  }
}

// one side of the matching screen (Level 0: the computer)
class vs_info {
  constructor(o) {
    this.Name = o.Name;
    this.Level = o.Level ?? 0;
    this.Hero = o.Hero;
    this.HeroName = o.HeroName;       // the costume's name when one is worn
    this.Pic = o.Pic;
    this.Wins = o.Wins ?? 0;
    this.Losses = o.Losses ?? 0;
    this.Title = o.Title ?? TxEmpty;  // the title the player shows (card_achieve)
    this.Badges = o.Badges ?? [];     // the 3 badges the player shows (texture or null)
  }
}

function VsOf(P, H) {
  const S = GetCardSave(P);
  return new vs_info({
    Name: P.Name, Level: CardLevelOf(S.Xp).Level, Hero: H, HeroName: CardHeroName(P, H), Pic: CardHeroPic(P, H), Wins: S.PvpWins, Losses: S.PvpLosses,
    Title: CardTitleOf(S), Badges: CardBadgePics(S),
  });
}

function VsCpu(H) { return new vs_info({ Name: TxComputer, Hero: H, HeroName: H.Name, Pic: H.Pic }); }

// how long the matching screen stays before the character select
const VsSeconds = 6.25;

// the ids of the title buttons
// hit ids of the card back lists (shop / card back setting)
const ShopBackId = 600;
const SetBackId = 620;
const SetBackClose = 639;

// (124 = フレンド, 1750 = 設定 (settings.js), 1790 = ボムドク (bomb.js), browser only)
const MenuTitleIds = [100, 101, 106, 107, 108, 102, 103, 119, 109, 104, 105, 120, 124, 1790, 1750];
const CollPer = 24;
const CollCols = 8;
// (web) the smallest text size of the collection's card help (kit FitTextBox; longer ones scroll)
const CollHelpMin = 12.0;

class card_menus {
  constructor(o) {
    // B, Lobby, Lib, Dk, Ach, Ps, Ex and every widget / slot made by MakeMenus
    Object.assign(this, o);
    this.CollSort = 0;
    this.InTitle = false;
    this.CollSel = null;    // the card the shard buttons work on
    this.TitleUp = false;
    this.LastPeople = -1;
    this.LastBadges = -1;
    this.LastWaiting = -1;
    this.LastWaiting2 = -1;
    this.BackScroll = 0;
    this.BackList = [];
    this.XpGen = 0;
    this.Me = null;         // card_player (set by the manager)
    this.Picked = 0;
    this.ShopTab = 0;
    // (10/27) the pack kind picked in the shop (PackKind*) and the kind of the pack being opened
    this.PackKind = 0;
    this.PackOpenKind = 0;
    this.CollFilter = -1;
    this.CollList = [];
    this.CollPageNo = 0;
    this.PackList = [];
    this.PackNew = [];
    this.SumIdx = [];
    this.PackShown = 0;
    // bumped when the opening is skipped: cards still flying out stop
    this.PackGen = 0;
    // how many cards of the pack on the screen are face up (the details of a face-down card stay secret)
    this.PackRevealed = 0;
    // (JS) bumped by every WaitScreen (a cancelled one must not hide a newer one)
    this.WaitGen = 0;
    // (JS) the keypad keys are ignored while the screen waits for something else
    this.KeypadBusy = false;
  }

  P() { return this.B.P; }

  CloseAll() {
    const B = this.B;
    for (const S of [this.VsSlot, this.TutAskSlot, this.TitleSlot, this.BattleSlot, this.WaitSlot, this.JoinSlot, this.CharSlot, this.DraftSlot, this.QuestSlot, this.LoginSlot, this.ProfSlot, this.RulesSlot, this.ResultSlot, this.GainSlot, this.ShopSlot, this.AskSlot, this.PackSlot, this.CollSlot, this.BackSlot]) {
      B.Layer(S, false);
    }
    this.Dk.CloseAll();
    this.Ach.CloseAll();
    this.Ps.CloseAll();
    this.Ex.CloseAll();
    B.Layer(B.SpinSlot, false);
    this.TitleUp = false;
  }

  CloseChar() { this.B.Layer(this.CharSlot, false); }

  HeroOf(Id) {
    return At(this.Lib.Heroes, Id) ?? At(this.Lib.Heroes, 0) ?? new hero_def({ Id: 0, Name: TxEmpty, Race: TxEmpty, Pic: CardGui.T_HeroMe, Jewel: new fx(), JewelName: TxEmpty, JewelPic: CardGui.T_JwBook, Cost: 2 });
  }

  FavHero() { return this.HeroOf(GetCardSave(this.P()).Fav); }

  // stops when the board is closed (the player left)  (<decides> → true / false)
  Alive() { return !!this.B.Opened; }

  // ------------------------------------------------------------ title
  UpdateTitle() {
    const S = GetCardSave(this.P());
    const L = CardLevelOf(S.Xp);
    this.TitleFav.SetFor(this.Lib, this.P(), this.FavHero());
    this.TCoins.SetNum(S.Coins);
    this.TGems.SetNum(S.Gems);
    this.TLv.Set(TmLv(L.Level));
    this.TXp.Set(L.Into * 1.0 / (L.Need * 1.0));
    this.TXpTxt.Set(TmExp(L.Into, L.Need));
    this.TStats.SetText(TmTitleStats(S.CpuWins, S.CpuLosses, S.PvpWins, S.PvpLosses, CardOwnedKinds(this.P())));
    Show(this.QBadge, this.InTitle && CardQuestClaimable(this.P()));
    Show(this.LBadge, this.InTitle && CardHourReady(this.P()));
    Show(this.ABadge, this.InTitle && CardAchClaimable(this.P(), this.Lib.DB));
    if (BdTitleBadge) Show(BdTitleBadge, this.InTitle && BdDailyWaiting(this.P()));
    this.LastBadges = -1;
    this.LastPeople = this.Lobby.PlayerCount();
    this.TPlayers.Set(TmPeople(this.LastPeople));
    Show(this.TPlayers.FBadge, this.LastPeople > 0);
  }

  // (Stop: {v} set when the race is over)
  async TitleTick(Stop) {
    while (true) {
      await Sleep(1.0);
      if (Stop && Stop.v) break;
      if (!this.Alive()) break;
      // only changes are sent to the screen
      const N = this.Lobby.PlayerCount();
      if (N !== this.LastPeople) {
        this.LastPeople = N;
        this.TPlayers.Set(TmPeople(N));
        Show(this.TPlayers.FBadge, N > 0);
      }
      const K = (this.InTitle && CardQuestClaimable(this.P()) ? 1 : 0) + (this.InTitle && CardHourReady(this.P()) ? 2 : 0) + (this.InTitle && CardAchClaimable(this.P(), this.Lib.DB) ? 4 : 0)
        + (this.InTitle && BdDailyWaiting(this.P()) ? 8 : 0);
      if (K !== this.LastBadges) {
        this.LastBadges = K;
        Show(this.QBadge, Mod(K, 2) === 1);
        Show(this.LBadge, Mod(Quotient(K, 2), 2) === 1);
        Show(this.ABadge, Mod(Quotient(K, 4), 2) === 1);
        if (BdTitleBadge) Show(BdTitleBadge, K >= 8);
      }
    }
    return -1;
  }

  // the title stays visible behind the smaller screens (quests, login bonus, ...); CloseAll takes it away
  ShowTitle() {
    this.B.Layer(this.TitleSlot, true);
    this.TitleUp = true;
    this.UpdateTitle();
  }

  // returns the chosen button
  async Title() {
    const B = this.B;
    this.ShowTitle();
    if (ArrFind(MenuTitleIds, B.CurId) === undefined) B.CurId = 100;
    this.InTitle = true;
    this.UpdateTitle();
    const Stop = { v: false };
    let Id;
    try {
      Id = await Race(B.Pick(MenuTitleIds, 100, -1), this.TitleTick(Stop));
    } finally {
      Stop.v = true;
    }
    B.Snd(SfxClick);
    // the badges stay off while a window covers the title
    this.InTitle = false;
    Show(this.QBadge, false);
    Show(this.LBadge, false);
    Show(this.ABadge, false);
    if (BdTitleBadge) Show(BdTitleBadge, false);
    return Id;
  }

  // ------------------------------------------------------------ battle menu
  async BattleTick(Stop) {
    while (true) {
      if (Stop && Stop.v) break;
      if (!this.Alive()) break;
      const C = this.Me;
      const N = C ? this.Lobby.Waiting(C, ModeDeck) : 0;
      if (N !== this.LastWaiting) {
        this.LastWaiting = N;
        this.BRandom.Label.Set(TmRandomN(N));
        Show(this.BRandom.Glow, N > 0);
      }
      const N2 = C ? this.Lobby.Waiting(C, Mode2Pick) : 0;
      if (N2 !== this.LastWaiting2) {
        this.LastWaiting2 = N2;
        this.BRandom2.Label.Set(TmRandom2(N2));
        Show(this.BRandom2.Glow, N2 > 0);
      }
      await Sleep(0.5);
    }
    return -1;
  }

  // 110 CPU, 111 野良（通常）, 118 野良（2Pick）, 112 部屋を作る, 113 部屋に参加, 114 戻る
  async BattleMenu() {
    const B = this.B;
    if (!this.TitleUp) this.ShowTitle();
    this.LastWaiting = -1;
    this.LastWaiting2 = -1;
    B.Snd(SfxOpen);
    B.Layer(this.BattleSlot, true);
    const Stop = { v: false };
    try {
      const Ids = [110, 111, 118, 112, 113, 114];
      if (ArrFind(Ids, B.CurId) === undefined) B.CurId = 110;
      const Id = await Race(B.Pick(Ids, 110, 114), this.BattleTick(Stop));
      B.Snd(Id === 114 ? SfxCancel : SfxClick);
      return Id;
    } finally {
      Stop.v = true;
      B.Layer(this.BattleSlot, false);
    }
  }

  // a short message over the menus (no usable deck, ...)
  Inform(M) { this.B.Notice(M); }

  // ------------------------------------------------------------ waiting for an opponent (returns when 戻る is chosen)
  async WaitTick(Base, Stop) {
    let K = 0;
    while (true) {
      if (Stop && Stop.v) break;
      if (!this.Alive()) break;
      this.WSub.SetText(TmDots(Base, K === 0 ? TmDot1 : K === 1 ? TmDot2 : TmDot3));
      K = Mod(K + 1, 3);
      await Sleep(0.5);
    }
  }

  async WaitScreen(Head, Big, Sub) {
    const B = this.B;
    const Gen = ++this.WaitGen;
    this.WTitle.Set(Head);
    this.WBig.Set(Big);
    B.Layer(this.WaitSlot, true);
    // (card_manager races this screen: when it is cancelled, the next WaitScreen / CloseAll stops the dots)
    const Stop = { v: false };
    const Gone = () => Gen !== this.WaitGen || this.WaitSlot.Widget.Parent !== B.Root;
    spawn(async () => { while (!Stop.v) { if (Gone()) Stop.v = true; await Sleep(0.25); } });
    try {
      B.CurId = 115;
      await Race(B.Pick([115], 115, 115), this.WaitTick(Sub, Stop));
    } finally {
      Stop.v = true;
      if (Gen === this.WaitGen) B.Layer(this.WaitSlot, false);
    }
  }

  // ------------------------------------------------------------ the keypad keys (JS: the physical keyboard)
  // 0-9 → 130..139, Backspace / Delete → 140 (消す), Enter → 141 (決定); returns the function that removes it
  KeypadOn() {
    const B = this.B;
    const H = e => {
      if (e.repeat || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
      let Id = -1;
      if (e.key.length === 1 && e.key >= '0' && e.key <= '9') Id = 130 + Number(e.key);
      else if (e.key === 'Backspace' || e.key === 'Delete') Id = 140;
      else if (e.key === 'Enter') Id = 141;
      if (Id < 0) return;
      e.preventDefault();
      e.stopPropagation();
      AudioUnlock();
      if (this.KeypadBusy || !this.Alive() || this.JoinSlot.Widget.Parent !== B.Root) return;
      const Hub = B.Hub;
      Hub.LastClick = Id;
      Hub.LastClickAt = GetSimulationElapsedTime();
      Hub.ClickFresh = true;
      Hub.Clicks.Signal(Id);
    };
    window.addEventListener('keydown', H, true);
    return () => window.removeEventListener('keydown', H, true);
  }

  // ------------------------------------------------------------ room number input (returns [the room owner, the room's mode], or null for 戻る)
  // (the cursor stays on the key that was pressed)
  async JoinScreen() {
    const B = this.B, Lobby = this.Lobby;
    B.Snd(SfxOpen);
    B.Layer(this.JoinSlot, true);
    const KeysOff = this.KeypadOn();
    this.KeypadBusy = false;
    try {
      let Num = 0;
      let Count = 0;
      this.JTitle.Set(TmJoinTitle);
      this.JDisplay.Set(TmDigits0);
      this.JMsg.SetText(TmJoinHelp);
      const Ids = [131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 130, 141, 142];
      B.CurId = 131;
      while (true) {
        const Id = await B.Pick(Ids, 131, 142);
        if (Id === 142) {
          B.Snd(SfxCancel);
          return null;
        }
        B.Snd(SfxClick);
        if (Id >= 130 && Id <= 139) {
          if (Count < 2) {
            Num = Num * 10 + (Id - 130);
            Count += 1;
          }
        } else if (Id === 140) {
          if (Count > 0) {
            Num = Quotient(Num, 10);
            Count -= 1;
          }
        } else if (Id === 141) {
          const C = this.Me;
          if (Count < 2) {
            this.JMsg.SetText(TmJoinNeed2);
          } else if (C) {
            this.JMsg.SetText(TmConnecting);
            this.KeypadBusy = true;
            let Md, Found;
            try {
              Md = await Lobby.RoomMode(Num);
              // a 通常 room needs a deck that can be used
              if (Md === ModeDeck && CardFirstOkDeck(this.P(), this.Lib.DB) < 0) {
                Found = undefined;
              } else {
                Found = Md < 0 ? null : await Lobby.JoinRoom(C, Num);
              }
            } finally {
              this.KeypadBusy = false;
            }
            if (Found === undefined) {
              B.Snd(SfxCancel);
              this.JMsg.SetText(TmRoomNeedDeck);
            } else {
              if (Found != null) return [Found, Md];
              this.JMsg.SetText(TmJoinNone(Quotient(Num, 10), Mod(Num, 10)));
            }
            Num = 0;
            Count = 0;
          }
        }
        this.JDisplay.Set(Count === 0 ? TmDigits0 : Count === 1 ? TmDigits1(Num) : TmDigits2(Quotient(Num, 10), Mod(Num, 10)));
      }
    } finally {
      KeysOff();
      B.Layer(this.JoinSlot, false);
    }
  }

  // ------------------------------------------------------------ secret code (the same number pad as the room input)
  async CodeScreen() {
    const B = this.B;
    B.Snd(SfxOpen);
    B.Layer(this.JoinSlot, true);
    const KeysOff = this.KeypadOn();
    this.KeypadBusy = false;
    try {
      let Digits = [];
      this.JTitle.Set(TmCodeTitle);
      this.JDisplay.Set(TmCodeEmpty);
      this.JMsg.SetText(TmCodeHelp);
      const Ids = [131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 130, 141, 142];
      B.CurId = 131;
      while (true) {
        const Id = await B.Pick(Ids, 131, 142);
        if (Id === 142) return;
        B.Snd(SfxSelect);
        if (Id >= 130 && Id <= 139) {
          if (Digits.length < 8) Digits = [...Digits, Id - 130];
        } else if (Id === 140) {
          if (Digits.length > 0) Digits = Digits.slice(0, Digits.length - 1);
        } else if (Id === 141) {
          if (Digits.length === 0) {
            this.JMsg.SetText(TmCodeHelp);
          } else {
            const R = CardRedeemCode(this.P(), Digits);
            if (R[0] === 3) {
              // the special player's 「1」: the premium pass of the season
              B.Snd(SfxWin);
              this.JMsg.SetText(TmCodePass);
              B.Layer(this.JoinSlot, false);
              this.KeypadBusy = true;
              try { await this.Ps.RewardPop([], PsPremUnlocked, PsPremUnlockedSub); } finally { this.KeypadBusy = false; }
              B.Layer(this.JoinSlot, true);
            } else if (R[0] === 2) {
              B.Snd(SfxWin);
              this.UpdateTitle();
              const G = R[1];
              this.JMsg.SetText(G.TicketsL > 0 ? TmCodeTicketsL(G.TicketsL) : G.TicketsE > 0 ? TmCodeTicketsE(G.TicketsE) : G.Tickets > 0 ? TmCodeTickets(G.Tickets) : (G.Gems > 0 && G.Coins > 0) ? TmCodeCG(G.Coins, G.Gems) : G.Gems > 0 ? TmCodeGems(G.Gems) : TmCodeCoins(G.Coins));
              this.KeypadBusy = true;
              try { await this.ShowGain(G, TmCodeOk); } finally { this.KeypadBusy = false; }
            } else {
              B.Snd(SfxCancel);
              this.JMsg.SetText(R[0] === 1 ? TmCodeUsed : TmCodeWrong);
            }
            Digits = [];
          }
        }
        this.JDisplay.Set(Digits.length === 0 ? TmCodeEmpty : Join(Digits.map(D => TxNum(D)), TxEmpty));
      }
    } finally {
      KeysOff();
      B.Layer(this.JoinSlot, false);
    }
  }

  // ------------------------------------------------------------ matching: who plays against whom (VsSeconds), before the character select
  VsSet(Os, I) {
    const N = At(Os, 0), Lv = At(Os, 1), H = At(Os, 2), R = At(Os, 3);
    if (N) N.Set(I.Name);
    if (Lv) Lv.Set(I.Level > 0 ? TmLv(I.Level) : TmVsCpuLv);
    if (H) H.Set(TmVsHero(I.HeroName));
    if (R) R.Set(I.Level > 0 ? TmVsRec(I.Wins, I.Losses) : TmVsCpuRec);
  }

  // (the badges are packed to the left: an empty slot leaves no gap)
  VsTitle(T, Pics, I) {
    T.Set(I.Title);
    const Shown = (I.Badges || []).filter(Tx => Tx != null);
    Pics.forEach((Pic, K) => {
      const Tx = At(Shown, K);
      if (Tx) {
        Pic.SetImage(Tx);
        Show(Pic, true);
      } else {
        Show(Pic, false);
      }
    });
  }

  async VsIntro(Mine, Theirs) {
    const B = this.B, VsCanvas = this.VsCanvas;
    this.CloseAll();
    const Start = GetSimulationElapsedTime();
    this.VsSet(this.VsMe, Mine);
    this.VsSet(this.VsFoe, Theirs);
    this.VsTitle(this.VsMeTitle, this.VsMeBadges, Mine);
    this.VsTitle(this.VsFoeTitle, this.VsFoeBadges, Theirs);
    this.VsMePic.SetImage(Mine.Pic);
    this.VsFoePic.SetImage(Theirs.Pic);
    VsCanvas.RemoveWidget(this.VsMePic);
    VsCanvas.RemoveWidget(this.VsFoePic);
    VsCanvas.RemoveWidget(this.VsMark.Root);
    VsCanvas.RemoveWidget(this.VsRing);
    B.Layer(this.VsSlot, true);
    try {
      B.Snd(SfxPack);
      // the two characters slide in from the sides
      for (let N = 1; N <= 10; N++) {
        const F = N * 1.0 / 10.0;
        const E = 1.0 - (1.0 - F) * (1.0 - F);
        VsCanvas.RemoveWidget(this.VsFoePic);
        VsCanvas.RemoveWidget(this.VsMePic);
        VsCanvas.AddWidget(RBox(this.VsFoePic, 1920.0 + (1350.0 - 1920.0) * E, 40.0, 460.0, 460.0, 6));
        VsCanvas.AddWidget(RBox(this.VsMePic, -460.0 + (110.0 + 460.0) * E, 590.0, 460.0, 460.0, 6));
        await Sleep(0.03);
      }
      // VS!
      B.Snd(SfxRare);
      VsCanvas.AddWidget(RPin(this.VsRing, 960.0, 540.0, 7));
      VsCanvas.AddWidget(RPin(this.VsMark.Root, 960.0, 540.0, 8));
      B.Fx.PlayZ(VfxSummonBig, V2(960.0, 540.0), 120);
      // the ring around VS pulses until the time is over
      let K = 0;
      while (true) {
        if (GetSimulationElapsedTime() - Start >= VsSeconds) break;
        K += 1;
        const Sz = 450.0 + 30.0 * Sin(K * 0.45);
        this.VsRing.SetDesiredSize(V2(Sz, Sz));
        await Sleep(0.05);
      }
    } finally {
      B.Layer(this.VsSlot, false);
    }
  }

  // ------------------------------------------------------------ the tutorial offer (true = はい)
  async TutorialAsk() {
    const B = this.B;
    B.Layer(this.TutAskSlot, true);
    try {
      B.Snd(SfxFlip);
      B.CurId = 116;
      const Id = await B.Pick([116, 117], 116, 117);
      B.Snd(Id === 116 ? SfxSelect : SfxCancel);
      return Id === 116;
    } finally {
      B.Layer(this.TutAskSlot, false);
    }
  }

  // ------------------------------------------------------------ character select
  ShowPicked() {
    this.CharPanels.forEach((Pn, I) => Pn.Pick(I === this.Picked));
  }

  // CanBack: a 戻る button (returns null), Deadline (GetSimulationElapsedTime, 0 = no limit): before a PvP match
  // (the highlighted character is taken when the time runs out)
  // Pre: the character picked at first (-1: the 使用キャラクター), SetFav: the pick becomes the 使用キャラクター
  // returns the hero_def or null
  async CharSelect(CanBack, Deadline, Pre, SetFav) {
    const B = this.B, Lib = this.Lib;
    const Timed = Deadline > 0.0;
    this.Picked = (Pre >= 0 && At(Lib.Heroes, Pre)) ? Pre : GetCardSave(this.P()).Fav;
    // (the deck list of a match against a player stays up until here)
    B.Layer(this.Dk.ListSlot, false);
    // the pictures with the player's costumes
    this.CharPanels.forEach((Pn, I) => {
      const H = At(Lib.Heroes, I);
      if (!H) return;
      Pn.Pic.SetImage(CardHeroPic(this.P(), H));
      Pn.Name.Set(CardHeroName(this.P(), H));
      Pn.Race.SetText(CardHeroRace(this.P(), H));
    });
    this.ShowPicked();
    this.CharWait.Set(TxEmpty);
    this.CharTimer.Set(TxEmpty);
    this.CharCanvas.RemoveWidget(this.CharBackSlot.Widget);
    if (CanBack) this.CharCanvas.AddWidget(this.CharBackSlot);
    B.Layer(this.CharSlot, true);
    B.CurId = 80 + this.Picked;
    const Ids = [...Lib.Heroes.map((H, I) => 80 + I), 89, ...(CanBack ? [88] : [])];
    const Cancel = CanBack ? 88 : -1;
    while (true) {
      const Id = Timed ? await B.PickTimed(Ids, 89, Cancel, Deadline, this.CharTimer) : await B.Pick(Ids, 89, Cancel);
      if (Id === 88) {
        B.Layer(this.CharSlot, false);
        B.Snd(SfxCancel);
        return null;
      }
      if (Id === 89 || Id === NavTimeout) break;
      this.Picked = Id - 80;
      B.Snd(SfxSelect);
      this.ShowPicked();
      B.MoveCursor(89);
    }
    B.Snd(SfxClick);
    if (SetFav) CardSetFav(this.P(), this.Picked);
    this.CharTimer.Set(TxEmpty);
    this.CharWait.Set(Timed ? TmCharWait(this.HeroOf(this.Picked).Name) : TmCharDone(this.HeroOf(this.Picked).Name));
    return this.HeroOf(this.Picked);
  }

  // ------------------------------------------------------------ 2Pick draft
  UpdateCurve(Deck) {
    const Counts = [0, 0, 0, 0, 0, 0, 0];
    for (const D of Deck) {
      const I = Max(0, Min(6, D.Cost - 1));
      Counts[I] += 1;
    }
    let Top = 4;
    for (const C of Counts) Top = Max(Top, C);
    this.DCurve.forEach((Bv, I) => {
      const C = At(Counts, I);
      if (C === undefined) return;
      Bv.Set(C * 1.0 / (Top * 1.0));
      const T = At(this.DCurveTxt, I);
      if (T) T.Set(TmCards(C));
    });
    this.DCount.Set(TmDeckCount(Deck.length, DraftRounds * 2));
  }

  // the opponent's picks (top left, and the big count of the waiting screen)
  ShowOppPicks(Prog, Seat) {
    const N = At(Prog.Picks, 1 - Seat) ?? 0;
    this.DOpp.Set(TmOppPicks(N, DraftRounds));
    this.DWaitN.Set(TxSlash(N, DraftRounds));
  }

  async OppTick(Prog, Seat, Stop) {
    let Done = false;
    Stop.Await().then(() => { Done = true; });
    Prog.OnOpp = () => { if (!Done) this.ShowOppPicks(Prog, Seat); };
    while (!Done) {
      if (!this.Alive()) break;
      this.ShowOppPicks(Prog, Seat);
      await Sleep(0.3);
    }
  }

  // done with the draft first (against a player): the big waiting screen until Stop
  async DraftWait(Prog, Seat, Stop) {
    Show(this.DWait, true);
    this.DTimer.Set(TxEmpty);
    try {
      await Race(this.OppTick(Prog, Seat, Stop), Stop.Await());
    } finally {
      Prog.OnOpp = null;
      Show(this.DWait, false);
    }
  }

  // Versus: against a player (their progress is shown). Every pick has a time bank (CPU battles too):
  // at most DraftPickSeconds, and every new pick adds DraftPickRegain to the time that was left.
  async Draft(Prog, Seat, Pool, Sched, Versus) {
    const B = this.B, Lib = this.Lib;
    B.Layer(this.DraftSlot, true);
    B.Layer(this.CharSlot, false);
    const Stop = new VEvent();
    // the opponent's progress only means something against a player
    if (Versus) spawn(() => this.OppTick(Prog, Seat, Stop)); else this.DOpp.Set(TxEmpty);
    let Bank = DraftPickSeconds - DraftPickRegain;
    try {
      let Deck = [];
      this.UpdateCurve(Deck);
      this.DTimer.Set(TxEmpty);
      for (let R = 1; R <= DraftRounds; R++) {
        const Forced = DraftForced(R);
        const Opts = DraftOptions(Pool, DraftRoundOf(Sched, R));
        this.DFaces.forEach((F, I) => {
          const O = At(Opts, Quotient(I, 2));
          const D = O ? At(O, Mod(I, 2)) : undefined;
          if (D) F.SetCard(Lib, D, D.Atk, D.Hp, D.Hp);
        });
        this.DHead.Set(TmDraftHead(R, DraftRounds));
        this.DSub.Set(Forced === RarL ? TmDraftLegend : Forced === RarE ? TmDraftEpic : TmDraftNormal);
        this.DSub.SetColor(Forced === RarL ? CGold : Forced === RarE ? color(0.85, 0.55, 1.0) : CWhite);
        if (Forced >= 0) B.Snd(SfxRare);
        if (ArrFind([90, 91], B.CurId) === undefined) B.CurId = 90;
        const Deadline = GetSimulationElapsedTime() + Min(DraftPickSeconds, Bank + DraftPickRegain);
        const Id = await B.PickTimed([90, 91], 90, -1, Deadline, this.DTimer);
        Bank = Max(0.0, Deadline - GetSimulationElapsedTime());
        this.DTimer.Set(TxEmpty);
        const Choice = Id === 90 ? 0 : Id === 91 ? 1 : DraftAutoPick(Opts);
        B.Snd(SfxSummon);
        const O = At(Opts, Choice);
        if (O) Deck = [...Deck, ...O];
        if (Seat >= 0 && Seat < Prog.Picks.length) { const Pk = Prog.Picks.slice(); Pk[Seat] = R; Prog.Picks = Pk; }
        if (Prog.OnPick) Prog.OnPick(R);
        this.UpdateCurve(Deck);
        // a short pause so that a double click doesn't also pick the next set
        const G = At(this.DGlows, Choice);
        if (G) {
          Show(G, true);
          B.Fx.PlayZ(VfxSummon, V2(Choice === 0 ? 530.0 : 1390.0, 395.0), 130);
          await Sleep(0.7);
          Show(G, false);
        }
        await Sleep(0.25);
      }
      this.DHead.Set(TmDraftDone);
      this.DSub.Set(TmDraftWait);
      this.DSub.SetColor(CWhite);
      this.DTimer.Set(TxEmpty);
      return Deck;
    } finally {
      Stop.Signal();
    }
  }

  // ------------------------------------------------------------ shop
  UpdateShop() {
    const S = GetCardSave(this.P());
    this.SCoins.SetNum(S.Coins);
    this.SGems.SetNum(S.Gems);
    // ガチャチケット: the coin buttons use tickets while the player has enough
    const Use1 = S.Tickets >= 1;
    const Use10 = S.Tickets >= 10;
    const Bt0 = At(this.PackBtns, 0);
    if (Bt0) {
      Bt0.Label.Set(Use1 ? TmBuy1Ticket : TmBuy1Coin(PackCoin));
      Bt0.Face.SetImage(BtnTex(Use1 ? BtnBlue : BtnGold, 560.0, 90.0));
    }
    const Bt2 = At(this.PackBtns, 2);
    if (Bt2) {
      Bt2.Label.Set(Use10 ? TmBuy10Ticket : TmBuy10Coin(Pack10Coin));
      Bt2.Face.SetImage(BtnTex(Use10 ? BtnBlue : BtnGold, 560.0, 90.0));
    }
    for (const W of this.CoinBadge) Show(W, !Use10);
    Show(this.TicketIcon, S.Tickets > 0);
    this.TicketTxt.Set(S.Tickets > 0 ? TmTicketHave(S.Tickets) : TxEmpty);
    this.TicketEBtn.Label.Set(TmUseTicketE(S.TicketsE));
    this.TicketEBtn.Face.SetTint(S.TicketsE > 0 ? CWhite : CGrey);
    Show(this.TicketEBtn.Glow, S.TicketsE > 0);
    this.TicketLBtn.Label.Set(TmUseTicketL(S.TicketsL));
    this.TicketLBtn.Face.SetTint(S.TicketsL > 0 ? CWhite : CGrey);
    Show(this.TicketLBtn.Glow, S.TicketsL > 0);
    // (10/27) the pack kinds: the picked one is gold, its rates / focus / glow colour are shown
    const K = this.PackKind;
    this.KindBtns.forEach((Bt, I) => {
      Bt.Face.SetImage(BtnTex(I === K ? BtnGold : BtnBlue, 320.0, 74.0));
      Show(Bt.Glow, I === K);
    });
    this.PackKindGlow.SetTint(PackKindColor(K));
    this.PackKindArt.SetTint(PackKindTint(K));
    this.PackKindName.Set(At(TmPackKinds, K) ?? TmTabPacks);
    this.PackKindDesc.SetText(At(TmPackKindDescs, K) ?? TxEmpty);
    this.PackRatesTx.SetText(TmPackRatesOf(PackRates(K)));
    this.Ex.FillSkins();
    this.Pre.Fill();
    this.STabBtns.forEach((Bt, I) => Bt.Label.SetColor(I === this.ShopTab ? CGold : CWhite));
    this.SBackPrice.forEach((Pr, I) => {
      const Price = CardBackPrice(I);
      const Owned = CardHasBack(this.P(), I);
      Pr.Set(Owned ? TxEmpty : Price[1] > 0 ? TmPriceGem(Price[1]) : TmPriceCoin(Price[0]));
      // coins in gold, gems in pink
      Pr.SetColor(Price[1] > 0 ? CPink : CGold);
      const St = At(this.SBackState, I);
      if (St) St.Set(S.Back === I ? TmInUse : Owned ? TmOwned : TmBuy);
    });
  }

  SetShopTab(T) {
    this.ShopTab = T;
    for (const S of this.ShopTabs) this.ShopCanvas.RemoveWidget(S.Widget);
    const S = At(this.ShopTabs, T);
    if (S) this.ShopCanvas.AddWidget(S);
    this.UpdateShop();
  }

  ShopIds() {
    // (10/27) 構築済みデッキ 3110 (ShopTab 4); the pack kinds 3100..3104
    const Tabs = [170, 3110, 171, 1200, 172];
    if (this.ShopTab === 0) return [...Tabs, ...IRange(0, PackKinds - 1).map(I => 3100 + I), 173, 175, 174, 176, 1220, 1221, 179];
    if (this.ShopTab === 1) return [...Tabs, ...ShopBackOrder.map(I => ShopBackId + I), 179];
    if (this.ShopTab === 3) return [...Tabs, ...this.Ex.SkinIds(), 179];
    if (this.ShopTab === 4) return [...Tabs, ...this.Pre.Ids(), 179];
    return [...Tabs, 190, 191, 192, 179];
  }

  // "really buy?" — true for yes
  async Ask(M) { return await this.AskWith(M, TmYesBuy); }

  async AskWith(M, Yes) {
    const B = this.B;
    this.AskYes.Label.Set(Yes);
    this.AskText.SetText(M);
    B.Layer(this.AskSlot, true);
    try {
      const Old = B.CurId;
      B.CurId = 195;
      const Id = await B.Pick([195, 196], 195, 196);
      B.CurId = Old;
      return Id === 195;
    } finally {
      B.Layer(this.AskSlot, false);
    }
  }

  async Shop() {
    const B = this.B, Lib = this.Lib;
    B.Snd(SfxOpen);
    B.Layer(this.ShopSlot, true);
    try {
      this.SetShopTab(this.ShopTab);
      this.SMsg.Set(TmShopHello);
      B.CurId = 173;
      while (true) {
        this.UpdateShop();
        const Ids = this.ShopIds();
        const Id = await B.Pick(Ids, this.ShopTab === 0 ? 173 : 179, 179);
        if (Id === 179) break;
        if (Id >= 170 && Id <= 172) {
          B.Snd(SfxSelect);
          this.SetShopTab(Id - 170);
        } else if (Id === 1200) {
          B.Snd(SfxSelect);
          this.SetShopTab(3);
          this.SMsg.Set(XsHello);
        } else if (Id === 3110) {
          // (10/27) 構築済みデッキ
          B.Snd(SfxSelect);
          this.SetShopTab(4);
          this.SMsg.Set(TpHello);
        } else if (Id >= 3111 && Id < 3111 + PreDecks.length) {
          B.Snd(SfxClick);
          this.SMsg.Set(await this.Pre.Buy(Id - 3111));
          this.UpdateTitle();
        } else if (Id >= 3100 && Id < 3100 + PackKinds) {
          // (10/27) the pack kind
          B.Snd(SfxSelect);
          this.PackKind = Id - 3100;
          this.SMsg.Set(At(TmPackKindDescs, this.PackKind) ?? TmShopHello);
        } else if (Id >= 1210 && Id <= 1218) {
          const K = Id - 1210;
          const Q = this.Ex.BuyQuestion(K);
          if (Q != null) {
            const Sure = await this.Ask(Q);
            if (Sure) {
              this.SMsg.Set(await this.Ex.DoBuy(K, this.Ps));
              this.UpdateTitle();
            }
          } else {
            B.Snd(SfxCancel);
            this.SMsg.Set(this.Ex.OwnedMsg(K));
          }
        } else if (Id === 1220 || Id === 1221) {
          const Pay = Id === 1220 ? PayTicketsE : PayTicketsL;
          const S0 = GetCardSave(this.P());
          const Have = Id === 1220 ? S0.TicketsE : S0.TicketsL;
          if (Have <= 0) {
            B.Snd(SfxCancel);
            this.SMsg.Set(Id === 1220 ? TmNoTicketE : TmNoTicketL);
          } else {
            const Kn = At(TmPackKinds, this.PackKind) ?? TmTabPacks;
            const Sure = await this.Ask(Id === 1220 ? TmAskTicketE(Kn) : TmAskTicketL(Kn));
            if (Sure) {
              const S1 = GetCardSave(this.P());
              const Before = Lib.DB.map(D => (S1.Owned[D.Id] ?? 0) > 0);
              const Cards = CardBuyPacks(this.P(), Lib.DB, 1, Pay, this.PackKind);
              if (Cards != null) {
                B.Snd(SfxCoin);
                this.PackOpenKind = this.PackKind;
                await this.OpenPacks(Cards, Before, 1);
                this.SMsg.Set(TmShopThanks);
              }
            }
          }
        } else if (Id >= 173 && Id <= 176) {
          const N = Id >= 175 ? 10 : 1;
          const Pay = (Id === 174 || Id === 176) ? PayGems : GetCardSave(this.P()).Tickets >= N ? PayTickets : PayCoins;
          const Price = PackPrice(N, Pay);
          const Kn = At(TmPackKinds, this.PackKind) ?? TmTabPacks;
          const Sure = await this.Ask(Pay === PayGems ? TmAskPackGem(N, Price, Kn) : Pay === PayTickets ? TmAskPackTicket(N, Price, Kn) : TmAskPackCoin(N, Price, Kn));
          if (Sure) {
            const S = GetCardSave(this.P());
            const Before = Lib.DB.map(D => (S.Owned[D.Id] ?? 0) > 0);
            const Cards = CardBuyPacks(this.P(), Lib.DB, N, Pay, this.PackKind);
            if (Cards != null) {
              B.Snd(SfxCoin);
              this.PackOpenKind = this.PackKind;
              await this.OpenPacks(Cards, Before, N);
              this.SMsg.Set(TmShopThanks);
            } else {
              B.Snd(SfxCancel);
              this.SMsg.Set(Pay === PayGems ? TmNoGems : Pay === PayTickets ? TmNoTickets : TmNoCoins);
            }
          }
        } else if (Id >= ShopBackId && Id < ShopBackId + CardBackCount) {
          const I = Id - ShopBackId;
          if (CardHasBack(this.P(), I)) {
            CardSetBack(this.P(), I);
            B.Snd(SfxSelect);
            this.SMsg.Set(TmBackSet3);
          } else {
            const Price = CardBackPrice(I);
            const Sure = await this.Ask(Price[1] > 0 ? TmAskBackGem(Price[1]) : TmAskBackCoin(Price[0]));
            if (Sure) {
              const Bought = CardBuyBack(this.P(), I);
              if (Bought) {
                B.Snd(SfxWin);
                this.SMsg.Set(TmBackBought);
              } else {
                B.Snd(SfxCancel);
                this.SMsg.Set(Price[1] > 0 ? TmNoGems : TmNoCoins);
              }
            }
          }
        } else if (Id >= 190 && Id <= 192) {
          // V-Bucks (CardBuyGemPack): not in the browser version
          await ComingSoon(B);
          this.SMsg.Set(TmShopHello);
        }
      }
    } finally {
      B.Layer(this.ShopSlot, false);
    }
  }

  // ------------------------------------------------------------ pack opening
  // (performance) the real card faces of a pack are put on the screen once per opening and never move: the cards that
  // fly and turn over are plain stand-in pictures (pack_fx). A face is filled while it is hidden, one per frame.
  PackXY(I) { return V2(330.0 + I * 260.0, 250.0); }
  PackCenter(I) { return V2(442.5 + I * 260.0, 410.5); }

  // hides the face of slot I and fills it with its card (nothing is sent again when the same card was there)
  PrepPackCard(I) {
    const G = At(this.PackCards, I);
    if (G) {
      G.Face.SetShown(false);
      Show(G.New.Root, false);
      const D = At(this.PackList, this.PackShown + I);
      if (D) G.Face.SetCard(this.Lib, D, D.Atk, D.Hp, D.Hp);
    }
  }

  ShowPackCard(I) {
    const G = At(this.PackCards, I);
    if (G) {
      G.Face.SetShown(true);
      Show(G.New.Root, !!At(this.PackNew, this.PackShown + I));
    }
  }

  // the pack slams down onto the table, trembles harder and harder with light leaking out, the light gathers and it
  // tears open with a flash, a shock ring, a light streak and flying particles
  // (no aura / rays around the pack and always the same light: anything that depends on the cards inside would give
  // away what is in the pack)
  // (JS: stops when the opening is skipped, PackGen changes)
  async PackIntro(Best) {
    const B = this.B, PFx = this.PFx, PackCanvas = this.PackCanvas, PackArt = this.PackArt;
    const Gen = this.PackGen;
    const GlowC = CCream;
    const Hot = false;
    const Leg = false;
    PFx.Clear();
    PackCanvas.RemoveWidget(PackArt);
    PackCanvas.RemoveWidget(this.PackGlow);
    this.PackGlow.SetTint(GlowC);
    // (only its size changes: it comes from the camera)
    PackArt.SetDesiredSize(V2(302.0 * 1.9, 420.0 * 1.9));
    PackCanvas.AddWidget(RPin(PackArt, 960.0, 470.0, 4));
    B.Snd(SfxPack);
    for (const S of [1.6, 1.32, 1.1, 0.95, 1.02, 1.0]) {
      PackArt.SetDesiredSize(V2(302.0 * S, 420.0 * S));
      await Sleep(0.03);
      if (Gen !== this.PackGen) return;
    }
    spawn(() => PFx.Ring(960.0, 600.0, 260.0, 720.0, CCream));
    const Steps = Leg ? 24 : Hot ? 20 : 14;
    for (let K = 1; K <= Steps; K++) {
      // the faces of the cards are filled now (hidden), one per frame
      if (K <= PackSize) this.PrepPackCard(K - 1);
      const Amp = K * (Hot ? 0.9 : 0.6);
      const Dx = Mod(K, 2) === 0 ? -Amp : Amp;
      const Dy = Mod(K, 4) < 2 ? -0.3 * Amp : 0.3 * Amp;
      PackCanvas.RemoveWidget(PackArt);
      PackCanvas.AddWidget(RPin(PackArt, 960.0 + Dx, 470.0 + Dy, 4));
      if (Mod(K, 3) === 0) PFx.Twinkle(960.0, 470.0, 330.0, Mod(K, 6) === 0 ? CWhite : GlowC);
      if (K === Steps - 7) {
        spawn(() => PFx.Burst(960.0, 470.0, 1000.0, 240.0, GlowC, 7));
        B.Snd(SfxEvoCharge);
      }
      await Sleep(0.05);
      if (Gen !== this.PackGen) return;
    }
    B.Snd(SfxPackTear);
    B.Snd(Hot ? SfxRare : SfxPackOpen);
    PackCanvas.RemoveWidget(PackArt);
    PackCanvas.RemoveWidget(this.PackGlow);
    spawn(() => PFx.FlashRun(Leg ? color(1.0, 0.9, 0.55) : CWhite, 0.9));
    spawn(() => PFx.Ring(960.0, 470.0, 200.0, Hot ? 1700.0 : 1200.0, GlowC));
    spawn(() => PFx.Burst(960.0, 470.0, 220.0, Hot ? 1400.0 : 1000.0, GlowC, 11));
    spawn(() => PFx.Flare(960.0, 470.0, Hot ? 1900.0 : 1400.0, GlowC));
    if (Hot) B.Fx.PlayZ(VfxSummonBig, V2(960.0, 470.0), 120);
    await Sleep(0.18);
  }

  // card I flies face down from the pack to its place (one picture, growing as it comes)
  async FlyPackCard(I, Gen) {
    const To = this.PackCenter(I);
    for (let K = 1; K <= 7; K++) {
      if (Gen !== this.PackGen) continue;
      const F = K * 1.0 / 7.0;
      const E = 1.0 - (1.0 - F) * (1.0 - F);
      this.PFx.BackAt(I, V2(960.0 + (To.X - 960.0) * E, 470.0 + (To.Y - 470.0) * E - 110.0 * Sin(F * 3.1416)), 0.45 + 0.55 * E);
      await Sleep(0.03);
    }
    if (Gen === this.PackGen) this.PFx.BackAt(I, To, 1.0);
  }

  // card I turns over; the better the card, the bigger the show:
  // rare: a blue ring and particles / epic: it trembles with gathering light, turns with rays, a flash and 「EPIC!」 /
  // legend: the room goes dark, the card rises shaking in its rays, turns, flash + streak + particles + 「LEGEND!!」 + fanfare
  async RevealPackCard(I, D) {
    const B = this.B, PFx = this.PFx;
    const Gen = this.PackGen;
    const Cut = () => Gen !== this.PackGen;
    const C = this.PackCenter(I);
    const XY = this.PackXY(I);
    const Col = RarityColor(D.Rarity);
    const Leg = D.Rarity >= RarL;
    const Epic = D.Rarity >= RarE;
    let Up = 1.0;
    if (Leg) {
      spawn(() => PFx.DimRun(true));
      PFx.CardRaysOn(I, C, Col);
      B.Snd(SfxEvoCharge);
      spawn(() => PFx.Burst(C.X, C.Y, 820.0, 200.0, Col, 12));
      await PFx.Tremble(I, C, 16, 7.0, 1.0, 1.15);
      Up = 1.15;
    } else if (Epic) {
      B.Snd(SfxSelect);
      spawn(() => PFx.Burst(C.X, C.Y, 620.0, 200.0, Col, 8));
      await PFx.Tremble(I, C, 9, 4.0, 1.0, 1.06);
      Up = 1.06;
    }
    if (Cut()) return;
    B.Snd(SfxFlip);
    await PFx.Flip(I, C, D, Up);
    if (Cut()) return;
    this.ShowPackCard(I);
    PFx.FrontOff(I);
    PFx.BackOff(I);
    this.PackRevealed = Max(this.PackRevealed, I + 1);
    spawn(() => PFx.CardFlashRun(I, XY.X, XY.Y));
    if (Leg) {
      B.Snd(SfxFanfare);
      B.Snd(SfxLegend);
      spawn(() => PFx.FlashRun(color(1.0, 0.85, 0.4), 0.85));
      spawn(() => PFx.Ring(C.X, C.Y, 150.0, 1300.0, Col));
      spawn(() => PFx.Burst(C.X, C.Y, 160.0, 1150.0, Col, 12));
      spawn(() => PFx.Flare(C.X, C.Y, 1700.0, Col));
      spawn(() => PFx.CallOut(true));
      B.Fx.PlayZ(VfxSummonBig, C, 120);
      await Sleep(0.25);
      if (Cut()) return;
      PFx.Twinkle(C.X, C.Y, 200.0, CWhite);
      PFx.Twinkle(C.X, C.Y, 220.0, Col);
      await Sleep(0.65);
      spawn(() => PFx.DimRun(false));
      if (Cut()) return;
      await Sleep(0.3);
    } else if (Epic) {
      B.Snd(SfxRare);
      spawn(() => PFx.FlashRun(color(0.85, 0.6, 1.0), 0.45));
      spawn(() => PFx.Ring(C.X, C.Y, 120.0, 820.0, Col));
      spawn(() => PFx.Burst(C.X, C.Y, 140.0, 780.0, Col, 10));
      spawn(() => PFx.Flare(C.X, C.Y, 1000.0, Col));
      spawn(() => PFx.CallOut(false));
      PFx.CardRaysOn(I, C, Col);
      B.Fx.PlayZ(VfxSummonBig, C, 120);
      await Sleep(0.75);
    } else if (D.Rarity >= RarR) {
      B.Snd(SfxSummonR);
      spawn(() => PFx.Ring(C.X, C.Y, 100.0, 520.0, Col));
      spawn(() => PFx.Burst(C.X, C.Y, 120.0, 540.0, Col, 8));
      await Sleep(0.32);
    } else {
      await Sleep(0.16);
    }
  }

  // opens one pack (5 cards from PackShown): the pack bursts, the cards fly out face down (the good ones glow in
  // their rarity colour, so you can see something is coming) and turn over one by one, the best one last
  async OpenOnePack() {
    const B = this.B;
    const Gen = this.PackGen;
    this.PackRevealed = 0;
    let Best = 0;
    for (let I = 0; I <= PackSize - 1; I++) {
      const D = At(this.PackList, this.PackShown + I);
      if (D) Best = Max(Best, D.Rarity);
    }
    this.PackTitle.Set(TmPackNo(Quotient(this.PackShown, PackSize) + 1, Quotient(this.PackList.length, PackSize), At(TmPackKinds, this.PackOpenKind) ?? TmTabPacks));
    for (const G of this.PackCards) {
      G.Face.SetShown(false);
      Show(G.New.Root, false);
    }
    this.PFx.SetBacks(CardBackTex(GetCardSave(this.P()).Back));
    await this.PackIntro(Best);
    if (Gen !== this.PackGen) return;
    for (let I = 0; I <= PackSize - 1; I++) {
      spawn(() => this.FlyPackCard(I, this.PackGen));
      B.Snd(SfxDraw);
      await Sleep(0.06);
      if (Gen !== this.PackGen) return;
    }
    // (no rarity glow on the face-down cards: each card shows its rarity only when it turns over)
    await Sleep(0.5);
    for (let I = 0; I <= PackSize - 1; I++) {
      if (Gen !== this.PackGen) return;
      const D = At(this.PackList, this.PackShown + I);
      if (D) await this.RevealPackCard(I, D);
    }
    if (Gen !== this.PackGen) return;
    this.PackHelp.SetText(TmPackHelp);
  }

  // the whole pack opening; returns to the shop when it is closed
  async OpenPacks(Cards0, Before, Packs) {
    const B = this.B, Lib = this.Lib, PackCanvas = this.PackCanvas, PFx = this.PFx;
    let Cards = [];
    for (let K = 0; K <= Packs - 1; K++) {
      if (K * PackSize > Cards0.length) continue;
      const Pk = Cards0.slice(K * PackSize, Min(Cards0.length, (K + 1) * PackSize));
      for (const R of [RarN, RarR, RarE, RarL]) for (const D of Pk) if (D.Rarity === R) Cards = [...Cards, D];
    }
    this.PackList = Cards;
    const SI = [];
    for (const R of [RarL, RarE, RarR, RarN]) Cards.forEach((D, I) => { if (D.Rarity === R) SI.push(I); });
    this.SumIdx = SI;
    // NEW = not owned before and the first copy in this opening
    this.PackNew = Cards.map((D, I) => {
      const Earlier = Cards.filter((E, J) => J < I && E.Id === D.Id);
      if (At(Before, D.Id)) return false;
      if (Earlier.length > 0) return false;
      return true;
    });
    this.PackShown = 0;
    // (10/27) the pack has the light tint of its kind
    this.PackArt.SetTint(PackKindTint(this.PackOpenKind));
    for (const G of this.SumRoots) PackCanvas.RemoveWidget(G);
    for (const Bu of this.PackBursts) PackCanvas.RemoveWidget(Bu);
    // the 5 card faces of a pack are put on once (hidden) and stay where they are for the whole opening
    this.PackRoots.forEach((R, I) => {
      const XY = this.PackXY(I);
      PackCanvas.RemoveWidget(R);
      PackCanvas.AddWidget(RBox(R, XY.X, XY.Y, 225.0, 321.0, 6));
    });
    for (const G of this.PackCards) {
      G.Face.SetShown(false);
      Show(G.New.Root, false);
    }
    PackCanvas.RemoveWidget(this.PackNextSlot.Widget);
    PackCanvas.RemoveWidget(this.PackSkipSlot.Widget);
    PackCanvas.RemoveWidget(this.PackCloseSlot.Widget);
    this.PackHelp.SetText(TxEmpty);
    this.PackHelpOn(true);
    B.Layer(this.PackSlot, true);
    try {
      const Many = this.PackList.length > PackSize;
      // 10 packs: "まとめて開ける" is there from the start (also while a pack is opening)
      if (Many) PackCanvas.AddWidget(this.PackSkipSlot);
      let Skip = false;
      while (true) {
        B.CurId = 241;
        // (JS: the skip button is waited for without a B.Pick, which would be left waiting when the pack wins)
        const SkipStop = { v: false };
        let Cut;
        try {
          Cut = await Race(
            (async () => { await this.OpenOnePack(); return false; })(),
            (async () => {
              if (Many) await this.PackSkipWait(SkipStop);
              else await MenuNever();
              return true;
            })(),
          );
        } finally {
          SkipStop.v = true;
        }
        if (Cut) {
          B.Hub.ClickFresh = false;
          this.PackGen += 1;
          Skip = true;
          break;
        }
        const More = this.PackShown + PackSize < this.PackList.length;
        if (More) {
          PackCanvas.AddWidget(this.PackNextSlot);
          const Ids = [...IRange(0, PackSize - 1).map(I => 250 + I), 240, 241];
          B.CurId = 240;
          while (true) {
            const Id = await B.Pick(Ids, 240, 240);
            if (Id === 240) break;
            if (Id === 241) {
              Skip = true;
              break;
            }
          }
          PackCanvas.RemoveWidget(this.PackNextSlot.Widget);
          for (const Bu of this.PackBursts) PackCanvas.RemoveWidget(Bu);
          this.PackShown += PackSize;
          if (Skip) break;
        } else {
          break;
        }
      }
      PackCanvas.RemoveWidget(this.PackSkipSlot.Widget);
      if (Many) {
        // 10 packs: every card in one list (the best ones first, with sparkles)
        PFx.Clear();
        PackCanvas.RemoveWidget(this.PackArt);
        PackCanvas.RemoveWidget(this.PackGlow);
        for (const R of this.PackRoots) PackCanvas.RemoveWidget(R);
        for (const Bu of this.PackBursts) PackCanvas.RemoveWidget(Bu);
        this.PackTitle.Set(TmPackAll(this.PackList.length));
        this.SumHelp.SetText(TmPackHelp);
        this.PackHelpOn(false);
        for (const R of this.SumRoots) PackCanvas.RemoveWidget(R);
        // a row of 10 at a time (the faces are filled and put on in small steps, not all 50 at once)
        for (let Row = 0; Row <= 4; Row++) {
          let RowBest = -1;
          for (let Cl = 0; Cl <= 9; Cl++) {
            const I = Row * 10 + Cl;
            const G = At(this.SumCards, I), R = At(this.SumRoots, I), J = At(this.SumIdx, I);
            const D = J !== undefined ? At(this.PackList, J) : undefined;
            if (!G || !R || !D) continue;
            G.Face.SetCard(Lib, D, D.Atk, D.Hp, D.Hp);
            Show(G.New.Root, !!At(this.PackNew, J));
            PackCanvas.AddWidget(RBox(R, SumX(I), SumY(I), 105.0, 150.0, 6));
            if (D.Rarity >= RarE) {
              RowBest = Max(RowBest, D.Rarity);
              spawn(() => PFx.Burst(SumX(I) + 52.5, SumY(I) + 75.0, 60.0, 330.0, RarityColor(D.Rarity), 8));
            } else if (D.Rarity >= RarR) {
              PFx.Twinkle(SumX(I) + 52.5, SumY(I) + 75.0, 40.0, RarityColor(D.Rarity));
            }
          }
          if (RowBest >= 0) {
            B.Snd(RowBest >= RarL ? SfxLegend : SfxRare);
            await Sleep(0.22);
          } else if (Row < 5) {
            B.Snd(SfxDraw);
          }
          await Sleep(0.1);
        }
        B.Snd(SfxWin);
      }
      PackCanvas.AddWidget(this.PackCloseSlot);
      const CardIds = Many ? IRange(0, this.PackList.length - 1).map(I => 300 + I) : IRange(0, PackSize - 1).map(I => 250 + I);
      B.CurId = 242;
      await B.Pick([...CardIds, 242], 242, 242);
      PackCanvas.RemoveWidget(this.PackCloseSlot.Widget);
      this.PackHelpOn(true);
      for (const R of this.SumRoots) PackCanvas.RemoveWidget(R);
      for (const R of this.PackRoots) PackCanvas.RemoveWidget(R);
      for (const Bu of this.PackBursts) PackCanvas.RemoveWidget(Bu);
    } finally {
      // (the rays keep shimmering until they are cleared)
      PFx.Clear();
      B.Layer(this.PackSlot, false);
    }
  }

  // (JS) Verse: B.Pick([241], 241, -1) raced against the opening. Resolves when すべて開ける (241) is clicked or
  // F / Enter is pressed; never resolves after Stop.v is set (the opening finished first)
  async PackSkipWait(Stop) {
    const B = this.B;
    while (!Stop.v) {
      const R = await Race(B.Hub.Clicks.Await().then(Id => [0, Id]), B.Keys.Keys.Await().then(K => [1, K]));
      if (Stop.v) break;
      if ((R[0] === 0 && R[1] === 241) || (R[0] === 1 && R[1] === KeyUse)) return true;
    }
    return MenuNever();
  }

  // the help boxes are put on / taken off the pack screen (a hidden widget would still catch the mouse)
  PackHelpOn(Single) {
    for (const S of [...this.PackHelpSlots, ...this.SumHelpSlots]) this.PackCanvas.RemoveWidget(S.Widget);
    for (const S of (Single ? this.PackHelpSlots : this.SumHelpSlots)) this.PackCanvas.AddWidget(S);
  }

  // the detail of the card under the cursor (pack / collection screens)
  OnHover(Id) {
    const Lib = this.Lib;
    // (10/27) the card list of the prebuilt deck purchase screen
    this.Pre.OnHover(Id);
    if (Id >= 250 && Id < 250 + PackSize && Id - 250 < this.PackRevealed && At(this.PackList, this.PackShown + Id - 250)) {
      const D = At(this.PackList, this.PackShown + Id - 250);
      Show(this.PackHelpBox, true);
      this.PackHelp.SetText(Join([D.Name, Lib.TextOf(D), Lib.HelpOf(D)], TxNewline));
    } else if (Id >= 300 && Id < 360) {
      const J = At(this.SumIdx, Id - 300);
      const D = J !== undefined ? At(this.PackList, J) : undefined;
      if (D && this.PackList.length > PackSize) this.SumHelp.SetText(Join([D.Name, Lib.TextOf(D), Lib.HelpOf(D)], TxNewline));
    }
    if (Id >= 400 && Id < 400 + CollPer && this.CollSel == null) {
      const D = At(this.CollList, this.CollPageNo * CollPer + Id - 400);
      if (D) {
        this.CollBig.SetCard(Lib, D, D.Atk, D.Hp, D.Hp);
        const Lv = CardPremLevel(this.P(), D.Id);
        this.CollBig.SetPrem(Lv);
        this.CollBig.SetShown(true);
        const N = CardOwnedCount(this.P(), D.Id);
        this.CollHelp.SetText(Join([N > 0 ? TmOwnedPrem(N, Lv) : TmNotOwned, Lib.TextOf(D), Lib.HelpOf(D)], TxNewline));
      }
    }
    this.Dk.OnHover(Id);
  }

  async HoverLoop() {
    while (true) {
      const Id = await this.B.Hub.Hovers.Await();
      this.OnHover(Id);
    }
  }

  // ------------------------------------------------------------ collection
  FillColl() {
    const Lib = this.Lib;
    const Order = this.CollSort === 1 ? CardOrderRarity : this.CollSort === 2 ? CardOrderName : this.CollSort === 3 ? CardOrderCost : Lib.DB.map(D => D.Id);
    const L = [];
    for (const Id of Order) {
      const D = At(Lib.DB, Id);
      if (D && !D.Token && (this.CollFilter < 0 || D.Rarity === this.CollFilter)) L.push(D);
    }
    this.CollList = L;
    this.CollSortBtn.Label.Set(this.CollSort === 1 ? TmSortRarity : this.CollSort === 2 ? TmSortName : this.CollSort === 3 ? TmSortCost : TmSortNo);
    const Pages = Max(1, Quotient(this.CollList.length + CollPer - 1, CollPer));
    this.CollPageNo = Max(0, Min(this.CollPageNo, Pages - 1));
    const S = GetCardSave(this.P());
    this.CollCards.forEach((G, I) => {
      const D = At(this.CollList, this.CollPageNo * CollPer + I);
      if (D) {
        G.Face.SetCard(Lib, D, D.Atk, D.Hp, D.Hp);
        G.Face.SetPrem(S.Prem[D.Id] ?? 0);
        const N = S.Owned[D.Id] ?? 0;
        Show(G.Veil, !(N > 0));
        G.Count.Set(N > 0 ? TmTimes(N) : TmNotOwned);
        G.Face.SetShown(true);
        Show(G.Count.Root, true);
      } else {
        G.Face.SetShown(false);
        Show(G.Veil, false);
        Show(G.Count.Root, false);
      }
    });
    this.CollPage.Set(TbPage(this.CollPageNo + 1, Pages));
    const Total = Lib.DB.filter(D => !D.Token);
    this.CollTitle.Set(TmCollTitle(CardOwnedKinds(this.P()), Total.length));
    this.CollFilterBtns.forEach((Bt, I) => Bt.Label.SetColor(I - 1 === this.CollFilter ? CGold : CWhite));
    this.ShowCollSel();
  }

  // the picked card: big picture, details and what the shard buttons would do
  ShowCollSel() {
    const Lib = this.Lib;
    const S = GetCardSave(this.P());
    this.CollShards.SetNum(S.Shards);
    const Sel = this.CollSel;
    this.CollCards.forEach((G, I) => {
      const D = At(this.CollList, this.CollPageNo * CollPer + I);
      const On = !!(D && Sel != null && Sel.Id === D.Id);
      G.Face.SetGlow(On, GlowSel);
    });
    if (Sel != null) {
      const D = Sel;
      const N = S.Owned[D.Id] ?? 0;
      const Lv = S.Prem[D.Id] ?? 0;
      this.CollBig.SetCard(Lib, D, D.Atk, D.Hp, D.Hp);
      this.CollBig.SetPrem(Lv);
      this.CollBig.SetShown(true);
      this.CollHelp.SetText(Join([N > 0 ? TmOwnedPrem(N, Lv) : TmNotOwned, Lib.TextOf(D), Lib.HelpOf(D)], TxNewline));
      this.CollConv.Label.Set(TmConvBtn(CardShardValue(D.Rarity)));
      this.CollMake.Label.Set(TmMakeBtn(CardCraftCost(D.Rarity)));
      this.CollConv.Face.SetTint(N >= 2 ? CWhite : CGrey);
      this.CollMake.Face.SetTint(S.Shards >= CardCraftCost(D.Rarity) ? CWhite : CGrey);
      const Need = CardPremNext(this.P(), D);
      this.CollPrem.Label.Set(Need <= 0 ? TmPremMax : TmPremBtn(Lv + 1, Need));
      this.CollPrem.Face.SetTint(Need > 0 && N >= Need + 1 ? CWhite : CGrey);
      Show(this.CollPrem.Glow, Need > 0 && N >= Need + 1);
    } else {
      this.CollBig.SetShown(false);
      this.CollHelp.SetText(TmCollHelp);
      this.CollConv.Label.Set(TmConvBtn0);
      this.CollMake.Label.Set(TmMakeBtn0);
      this.CollConv.Face.SetTint(CGrey);
      this.CollMake.Face.SetTint(CGrey);
      this.CollPrem.Label.Set(TmPremBtn0);
      this.CollPrem.Face.SetTint(CGrey);
      Show(this.CollPrem.Glow, false);
    }
    // (web) a long help (summoned cards' details ...) stays above the プレミア化 button: smaller text, then it scrolls
    FitTextBox(this.CollHelp, CollHelpMin);
  }

  // プレミア化: the picked card uses its spare copies (the picked copy stays) and turns round in a show
  async CollPremium() {
    const B = this.B;
    const D = this.CollSel;
    if (D != null) {
      const Need = CardPremNext(this.P(), D);
      const N = CardOwnedCount(this.P(), D.Id);
      const Lv = CardPremLevel(this.P(), D.Id);
      if (Need <= 0) {
        B.Snd(SfxCancel);
        this.CollMsg.Set(TmPremMaxMsg);
        return;
      }
      if (N < Need + 1) {
        B.Snd(SfxCancel);
        this.CollMsg.Set(TmPremShort(Need + 1 - N));
        return;
      }
      const Sure = await this.AskWith(TmPremAsk(D.Name, Need, Lv + 1), TmYesPrem);
      if (Sure) {
        const NewLv = CardPremium(this.P(), D);
        if (NewLv > 0) {
          await B.PremiumShow(D, NewLv, GetCardSave(this.P()).Back);
          this.CollMsg.Set(TmPremOk(D.Name, NewLv));
        }
        this.FillColl();
      }
    } else {
      B.Snd(SfxCancel);
      this.CollMsg.Set(TmPickFirst);
    }
  }

  CollConvert() {
    const B = this.B;
    const D = this.CollSel;
    if (D != null) {
      const Got = CardDisenchant(this.P(), D);
      if (Got > 0) {
        B.Snd(SfxShard);
        B.Fx.PlayZ(VfxIce, V2(1560.0, 271.0), 120);
        this.CollMsg.Set(TmConvOk(D.Name, Got));
      } else {
        B.Snd(SfxCancel);
        this.CollMsg.Set(TmConvNeed2);
      }
      this.FillColl();
    } else {
      B.Snd(SfxCancel);
      this.CollMsg.Set(TmPickFirst);
    }
  }

  async CollCraft() {
    const B = this.B;
    const D = this.CollSel;
    if (D != null) {
      const Cost = CardCraftCost(D.Rarity);
      const Have = GetCardSave(this.P()).Shards;
      if (Have < Cost) {
        B.Snd(SfxCancel);
        this.CollMsg.Set(TmCraftShort(Cost - Have));
        return;
      }
      const Sure = await this.AskWith(TmCraftAsk(D.Name, Cost), TmYesMake);
      if (Sure) {
        const Ok = CardCraft(this.P(), D);
        if (Ok) {
          B.Snd(SfxCraft);
          B.Fx.PlayZ(VfxSummonBig, V2(1560.0, 271.0), 120);
          this.CollMsg.Set(TmCraftOk(D.Name));
        }
        this.FillColl();
      }
    } else {
      B.Snd(SfxCancel);
      this.CollMsg.Set(TmPickFirst);
    }
  }

  async CollConvertAll() {
    const B = this.B;
    const Info = CardSpareInfo(this.P(), this.Lib.DB);
    if (Info[0] === 0) {
      B.Snd(SfxCancel);
      this.CollMsg.Set(TmSpareNone);
      return;
    }
    const Sure = await this.AskWith(TmSpareAsk(Info[0], Info[1]), TmYesConv);
    if (Sure) {
      const Got = CardDisenchantAll(this.P(), this.Lib.DB);
      B.Snd(SfxShard);
      B.Fx.PlayZ(VfxIce, V2(1270.0, 940.0), 120);
      this.CollMsg.Set(TmSpareOk(Got));
      this.FillColl();
    }
  }

  async Collection() {
    const B = this.B;
    this.CollPageNo = 0;
    this.CollSel = null;
    this.CollMsg.Set(TxEmpty);
    this.FillColl();
    B.Snd(SfxOpen);
    B.Layer(this.CollSlot, true);
    try {
      B.CurId = 400;
      while (true) {
        const Count = Max(0, Min(CollPer, this.CollList.length - this.CollPageNo * CollPer));
        const Ids = [...IRange(0, Count - 1).map(I => 400 + I), 430, 431, 433, 434, 435, 436, 437, 438, 448, 445, 446, 447, 432];
        // LT / RT turn the pages
        const Id0 = await B.PickPaged(Ids, 400, 432);
        const Id = Id0 === NavPageNext ? 431 : Id0 === NavPagePrev ? 430 : (Id0 === NavEdgeNext || Id0 === NavEdgePrev) ? -1 : Id0;
        if (Id0 === NavEdgeNext) B.CurId = At(Ids, 0) ?? 400;
        if (Id0 === NavEdgePrev) B.CurId = 432;
        if (Id === 432) break;
        if (Id >= 400 && Id < 400 + CollPer) {
          // any card (owned or not) can be picked
          const D = At(this.CollList, this.CollPageNo * CollPer + Id - 400);
          if (D) {
            this.CollSel = D;
            this.CollMsg.Set(TxEmpty);
            B.Snd(SfxSelect);
            this.ShowCollSel();
          }
        } else if (Id === 445) {
          this.CollConvert();
        } else if (Id === 446) {
          await this.CollCraft();
        } else if (Id === 447) {
          await this.CollConvertAll();
        } else if (Id === 448) {
          await this.CollPremium();
        } else if (Id >= 430) {
          if (Id === 430) this.CollPageNo -= 1;
          else if (Id === 431) this.CollPageNo += 1;
          else if (Id >= 433 && Id <= 437) {
            this.CollFilter = Id - 434;
            this.CollPageNo = 0;
          } else if (Id === 438) {
            this.CollSort = Mod(this.CollSort + 1, 4);
            this.CollPageNo = 0;
          }
          B.Snd(SfxSelect);
          this.FillColl();
        }
      }
    } finally {
      B.Layer(this.CollSlot, false);
    }
  }

  // ------------------------------------------------------------ card back setting (only the backs the player has; 8 x 2 shown, the rest scrolls)
  OwnedBacks() {
    const Order = [...SetBackOrder, ...IRange(0, CardBackCount - 1).filter(I => ArrFind(SetBackOrder, I) === undefined)];
    return Order.filter(I => CardHasBack(this.P(), I));
  }

  BackRows() { return Max(1, Quotient(this.BackList.length + 7, 8)); }

  FillBacks() {
    const S = GetCardSave(this.P());
    this.BackList = this.OwnedBacks();
    const MaxScroll = Max(0, this.BackRows() - 2);
    this.BackScroll = Max(0, Min(this.BackScroll, MaxScroll));
    this.BackFaces.forEach((T, K) => {
      const Mk = At(this.BackMarks, K), Sw = At(this.BackSws, K);
      if (!Mk || !Sw) return;
      const Id = At(this.BackList, this.BackScroll * 8 + K);
      if (Id !== undefined) {
        T.SetImage(CardBackTex(Id));
        Sw.Set(true);
        Show(Mk.Root, S.Back === Id);
      } else {
        Sw.Set(false);
      }
    });
    const Scrolls = this.BackRows() > 2;
    Show(this.BackUp.Root, Scrolls);
    Show(this.BackDown.Root, Scrolls);
    this.BackScrollTxt.Set(Scrolls ? TmBackRows(this.BackScroll + 1, MaxScroll + 1) : TxEmpty);
  }

  async BackSetting() {
    const B = this.B;
    this.BackScroll = 0;
    this.FillBacks();
    B.CurId = SetBackId;
    // the cursor starts on the back in use
    const Pos = ArrFind(this.BackList, GetCardSave(this.P()).Back);
    if (Pos !== undefined) {
      this.BackScroll = Max(0, Min(Quotient(Pos, 8), this.BackRows() - 2));
      this.FillBacks();
      B.CurId = SetBackId + Pos - this.BackScroll * 8;
    }
    B.Snd(SfxOpen);
    B.Layer(this.BackSlot, true);
    try {
      while (true) {
        const Vis = Max(0, Min(16, this.BackList.length - this.BackScroll * 8));
        const MaxScroll = Max(0, this.BackRows() - 2);
        const Arrows = MaxScroll > 0 ? [636, 637] : [];
        const Ids = [...Arrows, SetBackClose, ...IRange(0, Vis - 1).map(K => SetBackId + K)];
        // LT / RT scroll; LB / RB past the last / first back scroll too
        const Id = await B.PickPaged(Ids, SetBackId, SetBackClose);
        if (Id === SetBackClose) {
          B.Snd(SfxCancel);
          break;
        }
        if (Id === 636 || Id === NavPagePrev) {
          if (this.BackScroll > 0) {
            this.BackScroll -= 1;
            B.Snd(SfxFlip);
            this.FillBacks();
          }
        } else if (Id === 637 || Id === NavPageNext) {
          if (this.BackScroll < MaxScroll) {
            this.BackScroll += 1;
            B.Snd(SfxFlip);
            this.FillBacks();
            // the cursor stays on a back that is still there
            const Vis2 = Max(0, Min(16, this.BackList.length - this.BackScroll * 8));
            if (B.CurId >= SetBackId + Vis2 && B.CurId < SetBackId + 16) B.CurId = SetBackId + Max(0, Vis2 - 1);
          }
        } else if (Id === NavEdgeNext) {
          if (this.BackScroll < MaxScroll) {
            this.BackScroll += 1;
            this.FillBacks();
            B.CurId = SetBackId + 8;
          } else {
            this.BackScroll = 0;
            this.FillBacks();
            B.CurId = At(Ids, 0) ?? SetBackClose;
          }
          B.Snd(SfxFlip);
        } else if (Id === NavEdgePrev) {
          if (this.BackScroll > 0) {
            this.BackScroll -= 1;
            this.FillBacks();
            B.CurId = SetBackId + 7;
          } else {
            this.BackScroll = MaxScroll;
            this.FillBacks();
            B.CurId = SetBackId + Max(0, Min(16, this.BackList.length - this.BackScroll * 8) - 1);
          }
          B.Snd(SfxFlip);
        } else if (Id >= SetBackId && Id < SetBackId + 16) {
          const Back = At(this.BackList, this.BackScroll * 8 + Id - SetBackId);
          if (Back !== undefined) {
            CardSetBack(this.P(), Back);
            B.Snd(SfxPlace);
            this.FillBacks();
          }
        }
      }
    } finally {
      B.Layer(this.BackSlot, false);
    }
  }

  // ------------------------------------------------------------ daily quests
  RefreshQuests() {
    const E = CardEdit(this.P());
    this.QReset.Set(TmReset(CardHms(CardSecondsUntilReset())));
    // one row per quest line: it shows the line's current tier
    this.QRows.forEach((Row, C) => {
      const QI = CardChainCurrent(E, C);
      const Q = At(CardQuests, QI);
      if (!Q) return;
      const V = Min(Q.Need, CardQuestValue(E, QI));
      const St = CardQuestState(E, QI);
      const Tr = CardQuestTier(QI);
      Row.Name.SetText(TxPair(Q.Name, TmTier(Tr[0], Tr[1])));
      Row.Bar.Set(V * 1.0 / (Q.Need * 1.0));
      Row.Prog.Set(TxSlash(V, Q.Need));
      Show(Row.CoinIcon, Q.Coins > 0);
      Show(Row.CoinAmt.Root, Q.Coins > 0);
      Row.CoinAmt.SetNum(Q.Coins);
      Show(Row.GemIcon, Q.Gems > 0);
      Show(Row.GemAmt.Root, Q.Gems > 0);
      Row.GemAmt.SetNum(Q.Gems);
      Row.XpTxt.SetText(TmXp(Q.Xp));
      Row.Btn.Label.Set(St === 1 ? TmClaim : St === 2 ? TmClaimed : TmNotYet);
      Row.Btn.Face.SetTint(St === 1 ? CWhite : CGrey);
      Show(Row.Btn.Glow, St === 1);
    });
  }

  async QuestTick(Stop) {
    const Day = CardToday();
    while (true) {
      await Sleep(1.0);
      if (Stop && Stop.v) break;
      if (!this.Alive()) break;
      this.QReset.Set(TmReset(CardHms(CardSecondsUntilReset())));
      if (CardToday() !== Day) break;
    }
    return -1;
  }

  // v18: the daily quests live under the quest reward pass (card_pass)
  async Quests() {
    await this.Ps.QuestScreen();
    this.UpdateTitle();
  }

  async QuestsOld() {
    const B = this.B;
    B.Snd(SfxOpen);
    B.Layer(this.QuestSlot, true);
    try {
      while (true) {
        this.RefreshQuests();
        const E = CardEdit(this.P());
        let Def = 159;
        let Ready = 0;
        for (let C = 0; C <= CardQuestChains - 1; C++) {
          if (CardQuestState(E, CardChainCurrent(E, C)) === 1) {
            Ready += 1;
            if (Def === 159) Def = 150 + C;
          }
        }
        // まとめて受け取る glows while something can be claimed
        Show(this.QAll.Glow, Ready > 0);
        this.QAll.Face.SetTint(Ready > 0 ? CWhite : CGrey);
        if (Ready > 1) Def = 158;
        B.CurId = Def;
        const Stop = { v: false };
        let Id;
        try {
          Id = await Race(B.Pick([...IRange(0, CardQuestChains - 1).map(C => 150 + C), 158, 159], Def, 159), this.QuestTick(Stop));
        } finally {
          Stop.v = true;
        }
        if (Id === 159) {
          B.Snd(SfxCancel);
          break;
        }
        if (Id === 158) {
          const G = CardClaimAllQuests(this.P());
          if (G != null) {
            B.Snd(SfxQuest);
            this.UpdateTitle();
            await this.ShowGain(G, TmQuestAll);
          } else {
            B.Snd(SfxCancel);
          }
        } else if (Id >= 150 && Id < 150 + CardQuestChains) {
          const G = CardClaimQuest(this.P(), CardChainCurrent(CardEdit(this.P()), Id - 150));
          if (G != null) {
            B.Snd(SfxQuest);
            this.UpdateTitle();
            await this.ShowGain(G, TmQuestDone);
          } else {
            B.Snd(SfxCancel);
          }
        }
      }
    } finally {
      B.Layer(this.QuestSlot, false);
    }
  }

  // ------------------------------------------------------------ hour bonus (every 3 hours, a roulette over the 7 cards)
  RefreshLogin() {
    const Big = CardHourBigNext(this.P());
    const Rs = CardHourRewards(Big);
    this.LCards.forEach((C, I) => {
      const R = At(Rs, I);
      if (!R) return;
      C.Day.Set(R.Gift ? TmHrBox : R.Gems > 0 ? TmHrGem : TmHrCoin);
      C.Icon.SetImage(R.Gift ? CardGui.T_Gift : R.Gems > 0 ? CardGui.T_GemCur : CardGui.T_Coin);
      C.Amt.Set(R.Gift ? TmHrSecret : TmTimes(R.Gems > 0 ? R.Gems : R.Coins));
      C.Amt.SetColor(Big ? CGold : CWhite);
      Show(C.Icon, true);
      Show(C.Amt.Root, true);
      Show(C.Both, false);
      Show(C.Veil, false);
      Show(C.Stamp.Root, false);
    });
    const No = GetCardSave(this.P()).HourCount + 1;
    if (CardHourReady(this.P())) {
      this.LInfo.Set(Big ? TmHrReadyBig(No) : TmHrReady(No));
      this.LClaim.Face.SetTint(CWhite);
      this.LClaim.Label.Set(TmSpin);
    } else {
      this.LInfo.Set(TmHrNext(CardHms(CardHourLeft(this.P()))));
      this.LClaim.Face.SetTint(CGrey);
      this.LClaim.Label.Set(TmHrWait);
    }
  }

  async LoginTick(Stop) {
    const Was = CardHourReady(this.P());
    while (true) {
      await Sleep(1.0);
      if (Stop && Stop.v) break;
      if (!this.Alive()) break;
      const Now = CardHourReady(this.P());
      if (Now !== Was) break;
      if (!Now) this.LInfo.Set(TmHrNext(CardHms(CardHourLeft(this.P()))));
    }
    return -1;
  }

  async Login() {
    const B = this.B;
    B.Snd(SfxOpen);
    B.Layer(this.LoginSlot, true);
    try {
      for (const C of this.LCards) Show(C.Glow, false);
      while (true) {
        this.RefreshLogin();
        const Can = CardHourReady(this.P());
        B.CurId = Can ? 160 : 161;
        const Stop = { v: false };
        let Id;
        try {
          Id = await Race(B.Pick(Can ? [160, 161] : [161], B.CurId, 161), this.LoginTick(Stop));
        } finally {
          Stop.v = true;
        }
        if (Id === 161) break;
        if (Id === 160) {
          const Big = CardHourBigNext(this.P());
          const R = CardClaimHour(this.P());
          if (R != null) {
            B.Snd(SfxClick);
            await this.Spin(R[0], Big);
            this.RefreshLogin();
            // the coin / gem header of the title behind this window
            this.UpdateTitle();
            await this.ShowGain(R[1], TmHourGot);
            for (const C of this.LCards) Show(C.Glow, false);
          }
        }
      }
    } finally {
      B.Layer(this.LoginSlot, false);
    }
  }

  // the light runs over the cards from the left, slows down and stops on card Target (ticking all the way)
  async Spin(Target, Big) {
    const B = this.B;
    this.LClaim.Face.SetTint(CGrey);
    B.Snd(SfxSpin);
    const Steps = 21 + Target;
    for (let K = 0; K <= Steps; K++) {
      const Pos = Mod(K, 7);
      this.LCards.forEach((C, I) => Show(C.Glow, I === Pos));
      B.Snd(SfxTick);
      const T = K * 1.0 / (Steps * 1.0);
      // the last few cards: a drum roll of sparkles
      if (Steps - K <= 3 && At(this.LCards, Pos)) B.Fx.PlayZ(VfxSummon, V2(340.0 + Pos * 208.0, 435.0), 120);
      await Sleep(0.04 + 0.42 * T * T * T);
    }
    // it blinks where it stopped, with a fanfare and sparkles
    B.Snd(SfxJackpot);
    if (Big) B.Snd(SfxLegend);
    B.Fx.PlayZ(VfxSummonBig, V2(340.0 + Target * 208.0, 435.0), 120);
    const C = At(this.LCards, Target);
    if (C) {
      for (let K = 1; K <= 4; K++) {
        Show(C.Glow, false);
        await Sleep(0.1);
        Show(C.Glow, true);
        B.Snd(SfxCoin);
        await Sleep(0.14);
      }
    }
    await Sleep(0.3);
  }

  // ------------------------------------------------------------ profile / rules
  // the profile: 称号・バッチ設定 (122) or 戻る (121)
  async Profile() {
    const B = this.B;
    B.Snd(SfxOpen);
    B.Layer(this.ProfSlot, true);
    try {
      B.CurId = 121;
      while (true) {
        this.FillProfile();
        const Id = await B.Pick([122, 121, 123], 121, 121);
        if (Id === 121) break;
        B.Snd(SfxClick);
        // 123: the player's name (an HTML dialog, main.js)
        if (Id === 123) { await ChangePlayerName(); B.CurId = 123; continue; }
        B.Layer(this.ProfSlot, false);
        await this.Ach.Equip();
        B.Layer(this.ProfSlot, true);
        B.CurId = 122;
      }
    } finally {
      B.Layer(this.ProfSlot, false);
    }
  }

  FillProfile() {
    const S = GetCardSave(this.P());
    this.PTitle.Set(S.TitleSel >= 0 ? AhTitleQ(CardTitleOf(S)) : AhNoTitle);
    this.PTitle.SetColor(S.TitleSel >= 0 ? CGold : CGrey);
    this.PBadges.forEach((Pic, K) => {
      const Tx = CardBadgeIn(S, K);
      if (Tx != null) {
        Pic.SetImage(Tx);
        Show(Pic, true);
      } else {
        Show(Pic, false);
      }
    });
    const L = CardLevelOf(S.Xp);
    const H = this.FavHero();
    this.PPic.SetImage(CardHeroPic(this.P(), H));
    // (browser: the name can be changed — click / tap it)
    this.PName.Set(this.P().Name + ' ✎');
    this.PId.Set(TmPlayerId(CardPlayerIdText(S.PlayerNo)));
    this.PLv.Set(TmLv(L.Level));
    this.PXp.Set(L.Into * 1.0 / (L.Need * 1.0));
    this.PXpTxt.Set(TmExpTotal(L.Into, L.Need, S.Xp));
    this.PCoins.SetNum(S.Coins);
    this.PGems.SetNum(S.Gems);
    const Total = this.Lib.DB.filter(D => !D.Token);
    this.PStats.SetText(TmProfStats(S.CpuWins, S.CpuLosses, WinRate(S.CpuWins, S.CpuLosses), S.PvpWins, S.PvpLosses, WinRate(S.PvpWins, S.PvpLosses), S.Matches, S.LoginDays, CardOwnedKinds(this.P()), Total.length));
  }

  async Rules() {
    const B = this.B;
    B.Snd(SfxOpen);
    B.Layer(this.RulesSlot, true);
    try {
      B.CurId = 72;
      await B.Pick([72], 72, 72);
    } finally {
      B.Layer(this.RulesSlot, false);
    }
  }

  // ------------------------------------------------------------ "get!" pop-up
  async ShowGain(G, Head) {
    const B = this.B;
    this.GTitle.Set(Head);
    this.GIcon.SetImage(G.TicketsL > 0 ? CardGui.T_TicketL : G.TicketsE > 0 ? CardGui.T_TicketE : G.Tickets > 0 ? CardGui.T_TicketN : (G.Gems > 0 && G.Coins === 0) ? CardGui.T_GemCur : CardGui.T_Coin);
    this.GAmt.Set(G.TicketsL > 0 ? PrTicketsL(G.TicketsL) : G.TicketsE > 0 ? PrTicketsE(G.TicketsE) : G.Tickets > 0 ? TmGainT(G.Tickets) : G.Xp > 0 ? TmGain(G.Coins, G.Gems, G.Xp) : (G.Gems > 0 && G.Coins > 0) ? TmGainCG(G.Coins, G.Gems) : G.Gems > 0 ? TmGainG(G.Gems) : TmGainC(G.Coins));
    this.GSub.Set(G.LevelTo > G.LevelFrom ? TmLevelUp(G.LevelFrom, G.LevelTo, G.LevelCoins, G.LevelGems) : TxEmpty);
    B.Layer(this.GainSlot, true);
    try {
      B.Snd(SfxCoin);
      // (web) a tap anywhere closes it at once
      let Tapped = false;
      const Tap = this.GainTap.Clicked.Await().then(() => { Tapped = true; });
      for (let K = 1; K <= 8; K++) {
        if (Tapped) break;
        const Sz = K === 7 ? 190.0 : K === 8 ? 160.0 : 25.0 * (K * 1.0);
        this.GIcon.SetDesiredSize(V2(Sz, Sz));
        await Sleep(0.03);
      }
      if (!Tapped) await Race(Sleep(1.6), Tap);
    } finally {
      B.Layer(this.GainSlot, false);
    }
  }

  // ------------------------------------------------------------ result
  // returns 73 (play again) or 74 (title)
  async Result(Won, Lost, Reason, Early, Pvp, G) {
    const B = this.B;
    this.CloseAll();
    B.HideCast();
    B.SetTimer(TxEmpty, false);
    Show(this.RWin, Won);
    Show(this.RLose, Lost);
    Show(this.RDraw.Root, !Won && !Lost);
    this.RReason.Set(
      (Reason === EndLeft && Won && Early) ? TmLeftEarly
        : (Reason === EndLeft && Won) ? TmLeftWin
          : (Reason === EndSurrender && Won && Early) ? TmSurrEarly
            : (Reason === EndSurrender && Won) ? TmSurrWin
              : (Reason === EndSurrender) ? TmSurrLose
                : Won ? TmRealWin
                  : TxEmpty);
    this.RGain.Set(TmResultGain(G.Coins, G.Xp));
    // (the level-up line comes up when the bar gets there)
    this.RLevel.Set(TxEmpty);
    this.ResultCanvas.RemoveWidget(this.RAgainSlot.Widget);
    if (!Pvp) this.ResultCanvas.AddWidget(this.RAgainSlot);
    B.Snd(Won ? SfxWin : SfxLose);
    B.Layer(this.ResultSlot, true);
    this.XpGen += 1;
    try {
      const Xp1 = GetCardSave(this.P()).Xp;
      const Gen = this.XpGen;
      spawn(() => this.XpRun(Gen, Xp1 - G.Xp, Xp1, G));
      B.CurId = Pvp ? 74 : 73;
      return await B.Pick(Pvp ? [74] : [73, 74], B.CurId, -1);
    } finally {
      B.Layer(this.ResultSlot, false);
      this.XpGen += 1;
    }
  }

  // the experience bar of the result at Xp total experience
  ShowXp(Xp) {
    const L = CardLevelOf(Xp);
    this.RXpBar.Set(L.Into * 1.0 / (Max(1, L.Need) * 1.0));
    this.RXpLv.Set(TmLv(L.Level));
    this.RXpNum.Set(TmExp(L.Into, L.Need));
  }

  // the bar fills up from the old experience to the new one; every level reached on the way gets a level-up show
  async XpRun(Gen, From, To, G) {
    Show(this.RLvUp.Root, false);
    this.ShowXp(From);
    const L0 = CardLevelOf(From);
    this.RXpGain.Set(To > From ? TmXpPlus(To - From) : TxEmpty);
    await Sleep(0.7);
    if (To <= From || Gen !== this.XpGen) return;
    let LastLv = L0.Level;
    const Steps = 45;
    for (let K = 1; K <= Steps; K++) {
      if (Gen !== this.XpGen) continue;
      const F = K * 1.0 / (Steps * 1.0);
      const E = 1.0 - (1.0 - F) * (1.0 - F) * (1.0 - F);
      const X = From + Floor((To - From) * 1.0 * E);
      this.ShowXp(X);
      const L = CardLevelOf(X);
      if (Mod(K, 5) === 0) this.B.Snd(SfxCoin);
      if (L.Level > LastLv) {
        LastLv = L.Level;
        await this.LevelUpFx(Gen, G);
      }
      await Sleep(0.035);
    }
    if (Gen === this.XpGen) this.ShowXp(To);
  }

  async LevelUpFx(Gen, G) {
    const B = this.B;
    B.Snd(SfxLevelUp);
    B.Fx.PlayZ(VfxSummonBig, V2(960.0, 572.0), 100);
    B.Fx.PlayZ(VfxEvolve, V2(560.0, 572.0), 100);
    this.RLevel.Set(TmLevelUp(G.LevelFrom, G.LevelTo, G.LevelCoins, G.LevelGems));
    spawn(() => this.LvUpBlink(Gen));
    await Sleep(0.35);
  }

  // 「LEVEL UP!」 blinks a few times and stays
  async LvUpBlink(Gen) {
    for (let K = 1; K <= 4; K++) {
      if (Gen !== this.XpGen) continue;
      Show(this.RLvUp.Root, true);
      await Sleep(0.22);
      Show(this.RLvUp.Root, false);
      await Sleep(0.1);
    }
    if (Gen === this.XpGen) Show(this.RLvUp.Root, true);
  }

  // the end of the tutorial: cleared (with its reward) or given up
  async TutorialResult(Won, G) {
    const B = this.B;
    this.CloseAll();
    B.HideCast();
    B.SetTimer(TxEmpty, false);
    Show(this.RWin, Won);
    Show(this.RLose, !Won);
    Show(this.RDraw.Root, false);
    this.RReason.Set(Won ? TmTutClear : TmTutQuit);
    this.RGain.Set(G.Coins > 0 ? TmTutGain(G.Coins) : TxEmpty);
    this.RLevel.Set(TxEmpty);
    Show(this.RLvUp.Root, false);
    this.ShowXp(GetCardSave(this.P()).Xp);
    this.RXpGain.Set(TxEmpty);
    this.ResultCanvas.RemoveWidget(this.RAgainSlot.Widget);
    B.Snd(Won ? SfxWin : SfxLose);
    B.Layer(this.ResultSlot, true);
    try {
      if (G.Coins > 0) {
        await Sleep(0.8);
        await this.ShowGain(G, TmTutDoneHead);
      }
      B.CurId = 74;
      await B.Pick([74], 74, -1);
    } finally {
      B.Layer(this.ResultSlot, false);
    }
  }
}

// ---------------------------------------------------------------- building the screens
// where card I of the 10-pack list sits (10 x 5 grid on the left, details on the right)
function SumX(I) { return 40.0 + Mod(I, 10) * 128.0; }
function SumY(I) { return 120.0 + Quotient(I, 10) * 162.0; }

// returns [canvas_slot, pic_button]
function MBtn(B, Id, Face, Label, X, Y, W, H, Size) {
  const Pb = MakePicButton(Face, Label, W, H, Size, MenuHit(B, Id));
  B.AddBounds(Id, { X, Y, W, H });
  return [RBox(Pb.Root, X, Y, W, H * 1.08, 6), Pb];
}

// currency header (coins and gems) for the title and the shop: returns [slots, coins otext, gems otext]
function MoneyBar(Slots, X, Y) {
  const C = ONum(0, 26.0, CGold, CInk);
  const G = ONum(0, 26.0, CPink, CInk);
  const S = [...Slots,
    RBox(Tex(CardGui.T_Plate, 400.0, 70.0), X, Y, 400.0, 70.0, 3),
    RBox(Tex(CardGui.T_Coin, 52.0, 52.0), X + 16.0, Y + 9.0, 52.0, 52.0, 4),
    RPinTL(C.Root, X + 74.0, Y + 16.0, 4),
    RBox(Tex(CardGui.T_GemCur, 52.0, 52.0), X + 210.0, Y + 9.0, 52.0, 52.0, 4),
    RPinTL(G.Root, X + 268.0, Y + 16.0, 4),
  ];
  return [S, C, G];
}

function MakeMenus(B, Lobby, Lib) {
  const Heroes = Lib.Heroes;
  // ---- title
  let TS = [MakeOverlayDim(1.0), RBox(Tex(CardGui.T_TitleBg, 1920.0, 1080.0), 0.0, 0.0, 1920.0, 1080.0, 1)];
  TS.push(RBox(Tex(CardGui.T_Logo2, 800.0, 192.0), 560.0, 6.0, 800.0, 192.0, 3));
  const TitleFav = MakeCharTall(MenuHit(B, 105));
  B.AddBounds(105, { X: 170.0, Y: 262.0, W: 330.0, H: 470.0 });
  TS.push(RBox(TitleFav.Root, 170.0, 262.0, 330.0, 470.0, 4));
  TS.push(RPin(OText(TmFavLabel, 22.0, CGold, CInk).Root, 335.0, 760.0, 4));
  // (10/27: a little to the left, the フレンド button sits on its right)
  const MB = MoneyBar(TS, 1370.0, 20.0);
  TS = MB[0];
  const TCoins = MB[1];
  const TGems = MB[2];
  // profile card
  const PH = MenuHit(B, 120);
  B.AddBounds(120, { X: 1420.0, Y: 262.0, W: 330.0, H: 470.0 });
  const TLv = OText(TmLv(1), 52.0, CGold, CInk);
  const TXp = MakeBar(260.0, 22.0, color(0.1, 0.06, 0.03), color(0.35, 0.85, 1.0), false);
  const TXpTxt = OText(TxEmpty, 18.0, CWhite, CInk);
  const TStats = TxtWrap(TxEmpty, 18.0, CBrown, 270.0);
  const ProfCard = new canvas({
    Slots: [
      Box(Tex(CardGui.T_PanelChar, 330.0, 470.0), 0.0, 0.0, 330.0, 470.0, 1),
      Pin(OText(TmProfile, 28.0, CWhite, CInk).Root, 165.0, 44.0, 3),
      Pin(TLv.Root, 165.0, 118.0, 3),
      Box(TXp.Root, 35.0, 170.0, 260.0, 22.0, 3),
      Pin(TXpTxt.Root, 165.0, 212.0, 3),
      Box(TStats, 34.0, 244.0, 270.0, 170.0, 3),
      Pin(TxtDark(TmProfHint, 15.0), 165.0, 436.0, 3),
      Box(PH, 0.0, 0.0, 330.0, 470.0, 10),
    ],
  });
  TS.push(RBox(ProfCard, 1420.0, 262.0, 330.0, 470.0, 4));
  // buttons
  const TB0 = MBtn(B, 100, BtnGold, TmBattle, 540.0, 262.0, 840.0, 100.0, 40.0);
  const TB1 = MBtn(B, 101, BtnBlue, TmDeckBuild, 540.0, 384.0, 400.0, 86.0, 30.0);
  const TB6 = MBtn(B, 106, BtnPurple, TmShop, 980.0, 384.0, 400.0, 86.0, 30.0);
  const TB7 = MBtn(B, 107, BtnBlue, TmCollection, 540.0, 484.0, 400.0, 86.0, 30.0);
  const TB8 = MBtn(B, 108, BtnBlue, TmBackSet, 980.0, 484.0, 400.0, 86.0, 30.0);
  const TB2 = MBtn(B, 102, BtnBlue, TmQuests, 540.0, 584.0, 400.0, 86.0, 28.0);
  const TB3 = MBtn(B, 103, BtnBlue, TmLogin, 980.0, 584.0, 400.0, 86.0, 28.0);
  const TB10 = MBtn(B, 119, BtnGold, TmAch, 540.0, 684.0, 400.0, 86.0, 30.0);
  // 遊び方 at the very bottom
  const TB4 = MBtn(B, 104, BtnBlue, TmRules, 760.0, 790.0, 400.0, 76.0, 28.0);
  const TB9 = MBtn(B, 109, BtnPurple, TmCode, 980.0, 684.0, 400.0, 86.0, 28.0);
  TS.push(TB0[0], TB1[0], TB6[0], TB7[0], TB8[0], TB2[0], TB3[0], TB10[0], TB4[0], TB9[0]);
  const QBadge = Tex(CardGui.T_Badge2, 46.0, 46.0);
  const LBadge = Tex(CardGui.T_Badge2, 46.0, 46.0);
  const ABadge = Tex(CardGui.T_Badge2, 46.0, 46.0);
  TS.push(RBox(QBadge, 908.0, 572.0, 46.0, 46.0, 8), RBox(LBadge, 1348.0, 572.0, 46.0, 46.0, 8), RBox(ABadge, 908.0, 672.0, 46.0, 46.0, 8));
  // (browser: the player mark opens the friends (friends.js); the badge = friend requests waiting)
  // (a round 👤 button right of the coins / gems; 「!」 on its top right while friend requests are waiting)
  TS.push(RBox(Tex(CardGui.T_BtnFriend, 92.0, 92.0), 1788.0, 9.0, 92.0, 92.0, 4));
  const TPlayers = { Set() { } };
  TPlayers.FBadge = Tex(CardGui.T_Badge2, 42.0, 42.0);
  Show(TPlayers.FBadge, false);
  TS.push(RBox(TPlayers.FBadge, 1850.0, 2.0, 42.0, 42.0, 8));
  TS.push(RBox(MenuHit(B, 124), 1780.0, 0.0, 120.0, 112.0, 9));
  B.AddBounds(124, { X: 1788.0, Y: 9.0, W: 92.0, H: 92.0 });
  // (10/27) the ⚙ 設定 button at the bottom right (settings.js)
  TS.push(RBox(Tex(CardGui.T_BtnGear, 96.0, 96.0), 1800.0, 916.0, 96.0, 96.0, 4));
  TS.push(RPin(OText(TvGear, 22.0, CWhite, CInk).Root, 1848.0, 1036.0, 4));
  TS.push(RBox(MenuHit(B, OptGearId), 1784.0, 904.0, 128.0, 160.0, 9));
  B.AddBounds(OptGearId, { X: 1800.0, Y: 916.0, W: 96.0, H: 96.0 });
  // (10/29) the 💣 ボムドク button left of ⚙: the puzzle game (bomb.js)
  TS.push(RBox(Tex(CardGui.T_BtnBomb, 96.0, 96.0), 1680.0, 916.0, 96.0, 96.0, 4));
  TS.push(RPin(OText(TvBomb, 22.0, CWhite, CInk).Root, 1728.0, 1036.0, 4));
  TS.push(RBox(MenuHit(B, BdBtnId), 1664.0, 904.0, 120.0, 160.0, 9));
  B.AddBounds(BdBtnId, { X: 1680.0, Y: 916.0, W: 96.0, H: 96.0 });
  // 「!」 while 今日の1問 is waiting (bomb.js BdDailyWaiting)
  BdTitleBadge = Tex(CardGui.T_Badge2, 42.0, 42.0);
  Show(BdTitleBadge, false);
  TS.push(RBox(BdTitleBadge, 1744.0, 906.0, 42.0, 42.0, 8));
  TS.push(RPin(Txt(TmHint, 20.0, CCream), 960.0, 1032.0, 4));
  TS.push(RPin(OText(IslandCodeText(Lib), 30.0, CGold, CInk).Root, 960.0, 972.0, 4));
  const TitleSlot = RFull(new canvas({ Slots: TS }), 90);

  // ---- battle menu
  const BM0 = MBtn(B, 110, BtnGold, TmCpu, 640.0, 250.0, 640.0, 86.0, 34.0);
  const BM1 = MBtn(B, 111, BtnPurple, TmRandomN(0), 640.0, 352.0, 640.0, 86.0, 28.0);
  const BM5 = MBtn(B, 118, BtnPurple, TmRandom2(0), 640.0, 454.0, 640.0, 86.0, 28.0);
  const BM2 = MBtn(B, 112, BtnBlue, TmRoomMake, 640.0, 556.0, 640.0, 86.0, 32.0);
  const BM3 = MBtn(B, 113, BtnBlue, TmRoomJoin, 640.0, 658.0, 640.0, 86.0, 32.0);
  const BM4 = MBtn(B, 114, BtnEnd, TmBack, 810.0, 800.0, 300.0, 80.0, 30.0);
  const BattleRoot = new canvas({
    Slots: [
      MakeOverlayDim(0.7),
      RBox(Tex(CardGui.T_PanelLog, 820.0, 840.0), 550.0, 120.0, 820.0, 840.0, 1),
      RPin(OText(TmBattle, 44.0, CGold, CInk).Root, 960.0, 190.0, 2),
      BM0[0],
      BM1[0],
      BM5[0],
      BM2[0],
      BM3[0],
      BM4[0],
    ],
  });
  const BattleSlot = RFull(BattleRoot, 91);

  // ---- waiting for an opponent
  const WTitle = OText(TxEmpty, 34.0, CGold, CInk);
  const WBig = OText(TxEmpty, 96.0, CWhite, CInk);
  const WSub = TxtDark(TxEmpty, 22.0);
  const WB = MBtn(B, 115, BtnBlue, TmBack, 810.0, 640.0, 300.0, 80.0, 30.0);
  const WaitRoot = new canvas({
    Slots: [
      MakeOverlayDim(0.7),
      RBox(Tex(CardGui.T_PanelMsg, 820.0, 480.0), 550.0, 270.0, 820.0, 480.0, 1),
      RPin(WTitle.Root, 960.0, 350.0, 2),
      RPin(WBig.Root, 960.0, 460.0, 2),
      RPin(WSub, 960.0, 572.0, 2),
      WB[0],
    ],
  });
  const WaitSlot = RFull(WaitRoot, 96);

  // ---- room number input
  const JDisplay = OText(TmDigits0, 84.0, CWhite, CInk);
  const JMsg = TxtDark(TxEmpty, 20.0);
  const JS = [MakeOverlayDim(0.7), RBox(Tex(CardGui.T_PanelLog, 640.0, 840.0), 640.0, 120.0, 640.0, 840.0, 1)];
  const JTitle = OText(TmJoinTitle, 36.0, CGold, CInk);
  JS.push(RPin(JTitle.Root, 960.0, 188.0, 2), RPin(JDisplay.Root, 960.0, 280.0, 2), RPin(JMsg, 960.0, 760.0, 2));
  const Keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, -1, 0, -2];
  Keys.forEach((K, I) => {
    const X = 740.0 + Mod(I, 3) * 150.0;
    const Y = 340.0 + Quotient(I, 3) * 100.0;
    const Kb = K === -1 ? MBtn(B, 140, BtnEnd, TmErase, X, Y, 140.0, 86.0, 26.0)
      : K === -2 ? MBtn(B, 141, BtnGold, TbDecide, X, Y, 140.0, 86.0, 26.0)
        : MBtn(B, 130 + K, BtnBlue, TxNum(K), X, Y, 140.0, 86.0, 40.0);
    JS.push(Kb[0]);
  });
  const JB = MBtn(B, 142, BtnBlue, TmBack, 810.0, 810.0, 300.0, 80.0, 30.0);
  JS.push(JB[0]);
  const JoinSlot = RFull(new canvas({ Slots: JS }), 96);

  // ---- character select
  const CS = [MakeOverlayDim(1.0), RBox(Tex(CardGui.T_TitleBg, 1920.0, 1080.0), 0.0, 0.0, 1920.0, 1080.0, 1), MakeOverlayDim(0.3)];
  CS.push(RPin(OText(TmCharTitle, 38.0, CGold, CInk).Root, 960.0, 70.0, 3));
  const CharTimer = OText(TxEmpty, 32.0, CGold, CInk);
  const CharWait = OText(TxEmpty, 28.0, CWhite, CInk);
  CS.push(RPin(CharTimer.Root, 1720.0, 70.0, 3), RPin(CharWait.Root, 960.0, 940.0, 3));
  const CharPanels = [];
  Heroes.forEach((H, I) => {
    const X = 130.0 + Mod(I, 4) * 420.0;
    const Y = 130.0 + Quotient(I, 4) * 320.0;
    const Pn = MakeCharWide(MenuHit(B, 80 + I));
    Pn.Set(Lib, H);
    CharPanels.push(Pn);
    CS.push(RBox(Pn.Root, X, Y, 400.0, 290.0, 4));
    B.AddBounds(80 + I, { X, Y, W: 400.0, H: 290.0 });
  });
  const CB0 = MBtn(B, 89, BtnGold, TbDecide, 560.0, 800.0, 380.0, 92.0, 34.0);
  const CB1 = MBtn(B, 88, BtnBlue, TmBack, 980.0, 800.0, 380.0, 92.0, 34.0);
  CS.push(CB0[0], RPin(Txt(TmHint, 20.0, CCream), 960.0, 1032.0, 3));
  const CharCanvas = new canvas({ Slots: CS });
  const CharBackSlot = CB1[0];
  const CharSlot = RFull(CharCanvas, 92);

  // ---- draft
  const DS = [MakeOverlayDim(1.0), RBox(Tex(CardGui.T_TitleBg, 1920.0, 1080.0), 0.0, 0.0, 1920.0, 1080.0, 1), MakeOverlayDim(0.45)];
  const DHead = OText(TxEmpty, 34.0, CWhite, CInk);
  const DSub = OText(TxEmpty, 24.0, CWhite, CInk);
  const DTimer = OText(TxEmpty, 32.0, CGold, CInk);
  const DOpp = OText(TxEmpty, 24.0, CCream, CInk);
  const DCount = OText(TxEmpty, 28.0, CWhite, CInk);
  DS.push(RBox(Tex(CardGui.T_Plate, 1000.0, 84.0), 460.0, 18.0, 1000.0, 84.0, 2), RPin(DHead.Root, 960.0, 60.0, 3), RPin(DSub.Root, 960.0, 140.0, 3));
  DS.push(RPin(DTimer.Root, 1720.0, 60.0, 3), RPin(DOpp.Root, 200.0, 60.0, 3), RPin(DCount.Root, 960.0, 660.0, 3));
  const DFaces = [];
  const DGlows = [];
  for (let Side = 0; Side <= 1; Side++) {
    const X = Side === 0 ? 150.0 : 1010.0;
    const G = TexTint(CardGui.T_GlowCard, 800.0, 470.0, CGold);
    Show(G, false);
    DGlows.push(G);
    const F0 = MakeCardFace(1.6, null);
    const F1 = MakeCardFace(1.6, null);
    DFaces.push(F0, F1);
    const Panel = new canvas({
      Slots: [
        Box(G, -20.0, -20.0, 800.0, 470.0, 0),
        Box(Tex(CardGui.T_PanelMsg, 760.0, 430.0), 0.0, 0.0, 760.0, 430.0, 1),
        Box(F0.Root, 110.0, 44.0, 240.0, 342.4, 2),
        Box(F1.Root, 410.0, 44.0, 240.0, 342.4, 2),
        Box(MenuHit(B, 90 + Side), 0.0, 0.0, 760.0, 430.0, 10),
      ],
    });
    DS.push(RBox(Panel, X, 180.0, 760.0, 430.0, 4));
    B.AddBounds(90 + Side, { X, Y: 180.0, W: 760.0, H: 430.0 });
  }
  const DCurve = [];
  const DCurveTxt = [];
  DS.push(RBox(new color_block({ DefaultColor: color(0.0, 0.0, 0.0), DefaultOpacity: 0.35 }), 600.0, 700.0, 720.0, 360.0, 2));
  DS.push(RPin(OText(TmManaCost, 20.0, CCream, CInk).Root, 960.0, 720.0, 3));
  for (let I = 0; I <= 6; I++) {
    const X = 640.0 + I * 92.0;
    const Bv = MakeBar(56.0, 200.0, color(0.1, 0.1, 0.12), color(0.35, 0.75, 1.0), true);
    const T = OText(TmCards(0), 18.0, CWhite, CInk);
    DCurve.push(Bv);
    DCurveTxt.push(T);
    DS.push(RBox(Bv.Root, X, 745.0, 56.0, 200.0, 3), RPin(OText(I === 6 ? TmSevenUp : TxNum(I + 1), 22.0, CGold, CInk).Root, X + 28.0, 968.0, 3), RPin(T.Root, X + 28.0, 1002.0, 3));
  }
  DS.push(RPin(Txt(TmHint, 18.0, CCream), 960.0, 1044.0, 3));
  // done first against a player: a big "waiting for the opponent" over everything until the match starts
  const DWaitN = OText(TxEmpty, 96.0, CGold, CInk);
  const DWait = new canvas({
    Slots: [
      MakeOverlayDim(0.85),
      RPin(OText(TmDraftWaitBig, 64.0, CWhite, CInk).Root, 960.0, 440.0, 1),
      RPin(DWaitN.Root, 960.0, 600.0, 1),
    ],
  });
  Show(DWait, false);
  DS.push(RFull(DWait, 20));
  const DraftSlot = RFull(new canvas({ Slots: DS }), 94);

  // ---- shop (tabs: packs / card backs / gems)
  let SS = [MakeOverlayDim(1.0), RBox(Tex(CardGui.T_TitleBg, 1920.0, 1080.0), 0.0, 0.0, 1920.0, 1080.0, 1), MakeOverlayDim(0.35)];
  SS.push(RBox(Tex(CardGui.T_PanelLog, 1600.0, 860.0), 160.0, 120.0, 1600.0, 860.0, 2));
  SS.push(RPin(OText(TmShop, 46.0, CGold, CInk).Root, 360.0, 64.0, 3));
  const SM = MoneyBar(SS, 1390.0, 20.0);
  SS = SM[0];
  const SMsg = OText(TxEmpty, 24.0, CWhite, CInk);
  SS.push(RPin(SMsg.Root, 960.0, 1010.0, 4));
  // tabs: パック 170, 構築済みデッキ 3110, 裏面 171, 着せ替え 1200, ジェム 172 (ShopTab 0, 4, 1, 3, 2)
  const ST0 = MBtn(B, 170, BtnGold, TmTabPacks, 236.0, 150.0, 280.0, 80.0, 26.0);
  const ST4 = MBtn(B, 3110, BtnGold, TpTab, 528.0, 150.0, 280.0, 80.0, 26.0);
  const ST1 = MBtn(B, 171, BtnBlue, TmTabBacks, 820.0, 150.0, 280.0, 80.0, 26.0);
  const ST3 = MBtn(B, 1200, BtnBlue, XsTab, 1112.0, 150.0, 280.0, 80.0, 26.0);
  const ST2 = MBtn(B, 172, BtnPurple, TmTabGems, 1404.0, 150.0, 280.0, 80.0, 26.0);
  const SBk = MBtn(B, 179, BtnEnd, TmBack, 1460.0, 870.0, 260.0, 80.0, 30.0);
  SS.push(ST0[0], ST1[0], ST2[0], ST3[0], ST4[0], SBk[0]);
  const Ex = MakeExtraUI(B, Lib);
  const Pre = MakePrebuiltUI(B, Lib);
  // the special tickets open one pack each (the last card is epic or better / a legend)
  const TBE = MBtn(B, 1220, BtnPurple, TxEmpty, 300.0, 880.0, 560.0, 70.0, 20.0);
  const TBL = MBtn(B, 1221, BtnGold, TxEmpty, 880.0, 880.0, 560.0, 70.0, 20.0);
  // packs
  // 1 / 10 packs for coins, then 1 / 10 packs for gems; the 10-packs carry how much they save
  const PB1 = MBtn(B, 173, BtnGold, TmBuy1Coin(PackCoin), 900.0, 270.0, 560.0, 90.0, 26.0);
  const PB3 = MBtn(B, 175, BtnGold, TmBuy10Coin(Pack10Coin), 900.0, 405.0, 560.0, 90.0, 26.0);
  const PB2 = MBtn(B, 174, BtnPurple, TmBuy1Gem(PackGem), 900.0, 530.0, 560.0, 90.0, 26.0);
  const PB4 = MBtn(B, 176, BtnPurple, TmBuy10Gem(Pack10Gem), 900.0, 665.0, 560.0, 90.0, 26.0);
  const CoinSaveBg = new color_block({ DefaultColor: color(0.85, 0.08, 0.06) });
  const CoinSaveTx = OText(TmSaveCoin(PackCoin * 10 - Pack10Coin), 22.0, CWhite, CInk);
  const TicketIcon = Tex(CardGui.T_TicketN, 96.0, 60.0);
  const TicketTxt = OText(TxEmpty, 26.0, CGold, CInk);
  // (10/27) the pack kinds 3100..3104 (a column on the left), the picked kind's pack in its colour, what it gives
  // more of and its rates
  const KindBtns = [];
  const KS = [];
  TmPackKinds.forEach((Nm, I) => {
    const Kb = MBtn(B, 3100 + I, BtnBlue, Nm, 196.0, 258.0 + I * 86.0, 320.0, 74.0, 24.0);
    KindBtns.push(Kb[1]);
    KS.push(Kb[0]);
  });
  const PackKindGlow = TexTint(CardGui.T_GlowCard, 320.0, 420.0, CGold);
  const PackKindArt = TexTint(CardGui.T_Pack2, 236.0, 329.0, CWhite);
  const PackKindName = OText(TxEmpty, 26.0, CWhite, CInk);
  const PackKindDesc = TxtWrap(TxEmpty, 21.0, CBrown, 660.0);
  const PackRatesTx = TxtWrap(TxEmpty, 18.0, CBrown, 620.0);
  const PackTab = new canvas({
    Slots: [
      ...KS,
      RBox(new color_block({ DefaultColor: color(0.85, 0.08, 0.06) }), 386.0, 244.0, 150.0, 30.0, 8),
      RPin(OText(TmLegend3x, 18.0, CWhite, CInk).Root, 461.0, 259.0, 9),
      RBox(PackKindGlow, 550.0, 248.0, 320.0, 420.0, 1),
      RBox(PackKindArt, 592.0, 268.0, 236.0, 329.0, 2),
      RPin(PackKindName.Root, 710.0, 634.0, 3),
      RBox(PackKindDesc, 200.0, 702.0, 660.0, 60.0, 3),
      PB1[0],
      PB2[0],
      PB3[0],
      PB4[0],
      RBox(CoinSaveBg, 1230.0, 372.0, 250.0, 38.0, 8),
      RPin(CoinSaveTx.Root, 1355.0, 391.0, 9),
      RBox(new color_block({ DefaultColor: color(0.85, 0.08, 0.06) }), 1230.0, 632.0, 250.0, 38.0, 8),
      RPin(OText(TmSaveGem(PackGem * 10 - Pack10Gem), 22.0, CWhite, CInk).Root, 1355.0, 651.0, 9),
      RBox(TicketIcon, 200.0, 776.0, 96.0, 60.0, 3),
      RPinL(TicketTxt.Root, 308.0, 806.0, 3),
      RBox(PackRatesTx, 900.0, 776.0, 620.0, 80.0, 3),
      TBE[0],
      TBL[0],
      RBox(Tex(CardGui.T_TicketE, 64.0, 40.0), 310.0, 893.0, 64.0, 40.0, 9),
      RBox(Tex(CardGui.T_TicketL, 64.0, 40.0), 890.0, 893.0, 64.0, 40.0, 9),
    ],
  });
  // card backs
  const BT = [];
  const SBackFaces = [];
  const SBackPrice = [];
  const SBackState = [];
  // the coin backs in the first row, the gem backs in the second (ShopBackOrder; the first back is free and not sold)
  for (let I = 0; I <= CardBackCount - 1; I++) {
    const T = Tex(CardBackTex(I), 120.0, 171.0);
    const Pr = OText(TxEmpty, 20.0, CGold, CInk);
    const St = OText(TxEmpty, 18.0, CWhite, CInk);
    SBackFaces.push(T);
    SBackPrice.push(Pr);
    SBackState.push(St);
    const Pos = ArrFind(ShopBackOrder, I);
    if (Pos !== undefined) {
      const Price = CardBackPrice(I);
      const Row = Price[1] > 0 ? 1 : 0;
      const Col = Row === 0 ? Pos : Pos - 8;
      const X = 300.0 + Col * 172.0;
      const Y = 268.0 + Row * 268.0;
      BT.push(RBox(T, X, Y, 120.0, 171.0, 2), RPin(Pr.Root, X + 60.0, Y + 190.0, 3), RPin(St.Root, X + 60.0, Y + 220.0, 3), RBox(MenuHit(B, ShopBackId + I), X, Y, 120.0, 236.0, 6));
      B.AddBounds(ShopBackId + I, { X, Y, W: 120.0, H: 236.0 });
    }
  }
  // row labels
  BT.push(RBox(Tex(CardGui.T_Coin, 64.0, 64.0), 196.0, 310.0, 64.0, 64.0, 2), RPin(OText(TmRowCoin, 20.0, CGold, CInk).Root, 228.0, 400.0, 3));
  BT.push(RBox(Tex(CardGui.T_GemCur, 64.0, 64.0), 196.0, 578.0, 64.0, 64.0, 2), RPin(OText(TmRowGem, 20.0, CPink, CInk).Root, 228.0, 668.0, 3));
  BT.push(RPin(TxtDark(TmBackShopHelp, 20.0), 960.0, 815.0, 3));
  const BackTab = new canvas({ Slots: BT });
  // gems (V-Bucks)
  const GT = [];
  CardGemPacks.forEach((Gp, I) => {
    const X = 330.0 + I * 440.0;
    const Gb = MBtn(B, 190 + I, BtnPurple, TmVbucks(Gp.VBucks), X + 20.0, 660.0, 340.0, 86.0, 28.0);
    GT.push(RBox(TexTint(CardGui.T_GlowCard, 380.0, 400.0, CPink), X, 260.0, 380.0, 400.0, 1), RBox(Tex(CardGui.T_GemCur, 220.0, 220.0), X + 80.0, 300.0, 220.0, 220.0, 2), RPin(OText(TmGems(Gp.Gems), 40.0, CPink, CInk).Root, X + 190.0, 570.0, 3), Gb[0]);
    // the bigger packs give more gems: '+500ジェムお得！' (browser: priced in yen)
    if (Gp.Bonus > 0) GT.push(RPin(OText(TmGemBonus(Gp.Bonus), 30.0, CGold, CRed).Root, X + 190.0, 285.0, 5));
  });
  GT.push(RPin(TxtDark(TmGemShopHelp, 20.0), 960.0, 800.0, 3));
  const GemTab = new canvas({ Slots: GT });
  const ShopTabs = [RFull(PackTab, 5), RFull(BackTab, 5), RFull(GemTab, 5), Ex.SkinTab, Pre.Tab];
  const ShopCanvas = new canvas({ Slots: SS });
  const ShopSlot = RFull(ShopCanvas, 95);
  // purchase confirmation
  const AskText = TxtWrap(TxEmpty, 30.0, CBrown, 680.0);
  const AY = MBtn(B, 195, BtnGold, TmYesBuy, 650.0, 600.0, 280.0, 82.0, 28.0);
  const AN = MBtn(B, 196, BtnBlue, TmNo, 990.0, 600.0, 280.0, 82.0, 28.0);
  const AskRoot = new canvas({
    Slots: [
      MakeOverlayDim(0.6),
      RBox(Tex(CardGui.T_PanelMsg, 820.0, 420.0), 550.0, 320.0, 820.0, 420.0, 1),
      RBox(AskText, 620.0, 400.0, 680.0, 180.0, 2),
      AY[0],
      AN[0],
    ],
  });
  const AskSlot = RFull(AskRoot, 105);

  // ---- pack opening
  const PackArt = Tex(CardGui.T_Pack2, 302.0, 420.0);
  const PackGlow = TexTint(CardGui.T_PackGlow, 500.0, 520.0, CGold);
  // (put on the screen only while it flashes: a hidden widget still catches the mouse)
  const PackFlash = new color_block({ DefaultColor: CWhite, DefaultOpacity: 0.9 });
  const PackFlashSlot = RFull(PackFlash, 20);
  const PackTitle = OText(TxEmpty, 36.0, CGold, CInk);
  const PackHelp = TxtWrap(TxEmpty, 18.0, CCream, 1300.0);
  const PackHelpBox = new color_block({ DefaultColor: color(0.0, 0.0, 0.0), DefaultOpacity: 0.55 });
  // the 10-pack list keeps its details in a panel on the right
  const SumHelp = TxtWrap(TxEmpty, 18.0, CCream, 520.0);
  const SumHelpBox = new color_block({ DefaultColor: color(0.0, 0.0, 0.0), DefaultOpacity: 0.55 });
  const PackCards = [];
  const PackRoots = [];
  const PackBursts = [];
  for (let I = 0; I <= PackSize - 1; I++) {
    const GC = MakeGridCard(1.5, MenuHit(B, 250 + I));
    PackCards.push(GC[0]);
    PackRoots.push(GC[1]);
    PackBursts.push(TexTint(CardGui.T_GlowCard, 345.0, 421.0, CGold));
    B.AddBounds(250 + I, { X: 330.0 + I * 260.0, Y: 250.0, W: 225.0, H: 321.0 });
  }
  const SumCards = [];
  const SumRoots = [];
  for (let I = 0; I <= 49; I++) {
    const GC = MakeGridCard(0.7, MenuHit(B, 300 + I));
    SumCards.push(GC[0]);
    SumRoots.push(GC[1]);
    B.AddBounds(300 + I, { X: SumX(I), Y: SumY(I), W: 105.0, H: 150.0 });
  }
  const PN = MBtn(B, 240, BtnGold, TmNextPack, 560.0, 950.0, 360.0, 80.0, 28.0);
  const PS = MBtn(B, 241, BtnBlue, TmSkipAll, 1000.0, 950.0, 360.0, 80.0, 28.0);
  const PC = MBtn(B, 242, BtnGold, TbClose, 780.0, 950.0, 360.0, 80.0, 30.0);
  const PackCanvas = new canvas({
    Slots: [
      MakeOverlayDim(1.0),
      RBox(Tex(CardGui.T_TitleBg, 1920.0, 1080.0), 0.0, 0.0, 1920.0, 1080.0, 1),
      MakeOverlayDim(0.55),
      RPin(PackTitle.Root, 960.0, 60.0, 8),
    ],
  });
  const PackSlot = RFull(PackCanvas, 110);
  // the help of one pack (under the cards) and of the 10-pack list (on the right): only one of them is on the screen
  const PackHelpSlots = [RBox(PackHelpBox, 300.0, 650.0, 1320.0, 290.0, 7), RBox(PackHelp, 314.0, 662.0, 1292.0, 270.0, 8)];
  const SumHelpSlots = [RBox(SumHelpBox, 1336.0, 120.0, 560.0, 800.0, 7), RBox(SumHelp, 1350.0, 134.0, 532.0, 772.0, 8)];

  // ---- collection
  const CO = [MakeOverlayDim(0.85), RBox(Tex(CardGui.T_PanelLog, 1840.0, 1000.0), 40.0, 40.0, 1840.0, 1000.0, 1)];
  const CollTitle = OText(TxEmpty, 32.0, CGold, CInk);
  const CollPage = OText(TxEmpty, 22.0, CWhite, CInk);
  CO.push(RPinL(CollTitle.Root, 104.0, 88.0, 2), RPin(CollPage.Root, 700.0, 948.0, 2));
  const CollCards = [];
  for (let I = 0; I <= CollPer - 1; I++) {
    const X = 110.0 + Mod(I, CollCols) * 152.0;
    const Y = 150.0 + Quotient(I, CollCols) * 252.0;
    const GC = MakeGridCard(1.0, MenuHit(B, 400 + I));
    CollCards.push(GC[0]);
    CO.push(RBox(GC[1], X, Y, 150.0, 214.0, 3));
    B.AddBounds(400 + I, { X, Y, W: 150.0, H: 214.0 });
  }
  const CollBig = MakeCardFace(1.6, null);
  const CollHelp = new text_block({ DefaultText: TxEmpty, DefaultTextColor: CBrown, DefaultTextSize: 15.0, DefaultJustification: text_justification.Left, AutoWrap: true, WrapWidth: 460.0 });
  CollBig.SetShown(false);
  CO.push(RBox(CollBig.Root, 1440.0, 100.0, 240.0, 342.4, 3), RBox(CollHelp, 1360.0, 456.0, 470.0, 236.0, 3));
  const CPm = MBtn(B, 448, BtnGold, TmPremBtn0, 1360.0, 700.0, 470.0, 66.0, 20.0);
  CO.push(CPm[0]);
  // shards: the count, the buttons for the picked card and the one for every spare card
  // the shard count sits right under the 変換 / 生成 buttons
  const CollShards = ONum(0, 28.0, CWhite, CInk);
  CO.push(
    RPinL(OText(TmShardHave, 22.0, CCream, CInk).Root, 1452.0, 880.0, 3),
    RBox(Tex(CardGui.T_Shard, 46.0, 46.0), 1584.0, 857.0, 46.0, 46.0, 3),
    RPinL(CollShards.Root, 1638.0, 880.0, 3),
  );
  const CCv = MBtn(B, 445, BtnBlue, TmConvBtn0, 1360.0, 782.0, 230.0, 64.0, 20.0);
  const CMk = MBtn(B, 446, BtnPurple, TmMakeBtn0, 1600.0, 782.0, 230.0, 64.0, 20.0);
  const CAll = MBtn(B, 447, BtnBlue, TmSpareBtn, 1110.0, 912.0, 330.0, 70.0, 22.0);
  const CollMsg = OText(TxEmpty, 20.0, CGold, CInk);
  CO.push(CCv[0], CMk[0], CAll[0], RPin(CollMsg.Root, 960.0, 1012.0, 4));
  const CPv = MBtn(B, 430, BtnBlue, TbPrev, 330.0, 912.0, 220.0, 70.0, 26.0);
  const CNx = MBtn(B, 431, BtnBlue, TbNext, 850.0, 912.0, 220.0, 70.0, 26.0);
  const CCl = MBtn(B, 432, BtnGold, TbClose, 1480.0, 912.0, 260.0, 76.0, 28.0);
  CO.push(CPv[0], CNx[0], CCl[0]);
  // the rarity filter buttons sit along the top of the list
  const CollFilterBtns = [];
  [TmAll, TmRarN, TmRarR, TmRarE, TmRarL].forEach((Lb, I) => {
    const Fb = MBtn(B, 433 + I, BtnBlue, Lb, 620.0 + I * 146.0, 62.0, 136.0, 50.0, 18.0);
    CollFilterBtns.push(Fb[1]);
    CO.push(Fb[0]);
  });
  const CSort = MBtn(B, 438, BtnPurple, TmSortNo, 1370.0, 40.0, 300.0, 50.0, 18.0);
  CO.push(CSort[0]);
  const CollSlot = RFull(new canvas({ Slots: CO }), 96);

  // ---- card back setting
  const BS = [MakeOverlayDim(0.8), RBox(Tex(CardGui.T_PanelLog, 1600.0, 760.0), 160.0, 160.0, 1600.0, 760.0, 1)];
  BS.push(RPin(OText(TmBackSet, 40.0, CGold, CInk).Root, 960.0, 226.0, 2), RPin(TxtDark(TmBackSetHelp, 20.0), 960.0, 742.0, 2));
  const BackFaces = [];
  const BackMarks = [];
  const BackSws = [];
  // 16 slots (8 x 2): FillBacks puts the owned backs into them from the scroll position
  for (let K = 0; K <= 15; K++) {
    const X = 230.0 + Mod(K, 8) * 172.0;
    const Y = 290.0 + Quotient(K, 8) * 214.0;
    const T = Tex(CardBackTex(0), 120.0, 171.0);
    const Mk = OText(TmInUse, 20.0, CWhite, CRed);
    const Slot = new canvas({ Slots: [Box(T, 0.0, 0.0, 120.0, 171.0, 0), Pin(Mk.Root, 60.0, 0.0, 1), Box(MenuHit(B, SetBackId + K), 0.0, 0.0, 120.0, 171.0, 5)] });
    BackFaces.push(T);
    BackMarks.push(Mk);
    BackSws.push(MakeSw(Slot, true));
    BS.push(RBox(Slot, X, Y, 120.0, 171.0, 2));
    B.AddBounds(SetBackId + K, { X, Y, W: 120.0, H: 171.0 });
  }
  const BUp = MBtn(B, 636, BtnBlue, TmUp, 1620.0, 290.0, 110.0, 90.0, 34.0);
  const BDn = MBtn(B, 637, BtnBlue, TmDown, 1620.0, 580.0, 110.0, 90.0, 34.0);
  const BackScrollTxt = OText(TxEmpty, 20.0, CCream, CInk);
  const BBk = MBtn(B, SetBackClose, BtnGold, TbClose, 810.0, 790.0, 300.0, 80.0, 30.0);
  BS.push(BUp[0], BDn[0], RPin(BackScrollTxt.Root, 1675.0, 520.0, 3), BBk[0]);
  const BackSlot = RFull(new canvas({ Slots: BS }), 96);

  // ---- daily quests
  const QReset = OText(TxEmpty, 22.0, CBlue, CInk);
  const QS = [MakeOverlayDim(0.7), RBox(Tex(CardGui.T_PanelLog, 1320.0, 880.0), 300.0, 100.0, 1320.0, 880.0, 1)];
  QS.push(RPin(OText(TmQuests, 40.0, CGold, CInk).Root, 960.0, 168.0, 2), RPin(QReset.Root, 1440.0, 168.0, 2));
  const QRows = [];
  // the rows get smaller when there are more quests (they all fit between the title and 戻る)
  const QStep = Min(110.0, 640.0 / (CardQuestChains * 1.0));
  const QH = QStep - 8.0;
  for (let I = 0; I <= CardQuestChains - 1; I++) {
    const Y = 210.0 + I * QStep;
    const Name = TxtLine(TxEmpty, 22.0, CBrown);
    const Bar = MakeBar(500.0, 16.0, color(0.15, 0.1, 0.06), color(0.3, 0.85, 0.35), false);
    const Prog = OText(TxEmpty, 18.0, CWhite, CInk);
    const CI = Tex(CardGui.T_Coin, 32.0, 32.0);
    const CA = ONum(0, 20.0, CGold, CInk);
    const GI = Tex(CardGui.T_GemCur, 32.0, 32.0);
    const GA = ONum(0, 20.0, CPink, CInk);
    const XT = TxtLine(TxEmpty, 16.0, CBrown);
    const Bt = MBtn(B, 150 + I, BtnGold, TmNotYet, 1330.0, Y + (QH - 58.0) / 2.0, 220.0, 58.0, 24.0);
    QRows.push(new quest_row({ Name, Bar, Prog, CoinIcon: CI, CoinAmt: CA, GemIcon: GI, GemAmt: GA, XpTxt: XT, Btn: Bt[1] }));
    QS.push(
      RBox(new color_block({ DefaultColor: color(0.25, 0.15, 0.05), DefaultOpacity: 0.18 }), 350.0, Y, 1220.0, QH, 2),
      RPinTL(Name, 380.0, Y + 6.0, 3),
      RBox(Bar.Root, 380.0, Y + QH - 24.0, 500.0, 16.0, 3),
      RPinTL(Prog.Root, 896.0, Y + QH - 30.0, 3),
      RBox(CI, 1010.0, Y + 4.0, 32.0, 32.0, 3),
      RPinTL(CA.Root, 1048.0, Y + 6.0, 3),
      RBox(GI, 1010.0, Y + QH - 36.0, 32.0, 32.0, 3),
      RPinTL(GA.Root, 1048.0, Y + QH - 34.0, 3),
      RPinTL(XT, 1160.0, Y + QH / 2.0 - 10.0, 3),
      Bt[0],
    );
  }
  const QB = MBtn(B, 159, BtnBlue, TmBack, 1000.0, 870.0, 300.0, 80.0, 30.0);
  const QA = MBtn(B, 158, BtnGold, TmClaimAll, 620.0, 870.0, 340.0, 80.0, 28.0);
  QS.push(QA[0], QB[0]);
  const QuestSlot = RFull(new canvas({ Slots: QS }), 95);

  // ---- login bonus
  const LInfo = OText(TxEmpty, 24.0, CWhite, CInk);
  const LS = [MakeOverlayDim(0.7), RBox(Tex(CardGui.T_PanelLog, 1560.0, 740.0), 180.0, 170.0, 1560.0, 740.0, 1)];
  LS.push(RPin(OText(TmLogin, 40.0, CGold, CInk).Root, 960.0, 238.0, 2), RPin(LInfo.Root, 960.0, 620.0, 2));
  const LCards = [];
  for (let I = 0; I <= 6; I++) {
    const X = 245.0 + I * 208.0;
    const Day = OText(TxEmpty, 26.0, CWhite, CInk);
    const Icon = Tex(CardGui.T_Coin, 100.0, 100.0);
    const Amt = OText(TxEmpty, 26.0, CWhite, CInk);
    const BC = OText(TxEmpty, 22.0, CGold, CInk);
    const BG = OText(TxEmpty, 22.0, CPink, CInk);
    const Both = new canvas({
      Slots: [
        Box(Tex(CardGui.T_Coin, 62.0, 62.0), 14.0, 0.0, 62.0, 62.0, 0),
        PinL(BC.Root, 80.0, 31.0, 1),
        Box(Tex(CardGui.T_GemCur, 62.0, 62.0), 14.0, 76.0, 62.0, 62.0, 0),
        PinL(BG.Root, 80.0, 107.0, 1),
      ],
    });
    const Veil = new color_block({ DefaultColor: color(0.0, 0.0, 0.0), DefaultOpacity: 0.55 });
    const Stamp = OText(TmClaimed, 26.0, CRed, CWhite);
    const G = TexTint(CardGui.T_GlowCard, 230.0, 310.0, CGold);
    LCards.push(new login_card({ Day, Icon, Amt, Both, BothCoins: BC, BothGems: BG, Veil, Stamp, Glow: G }));
    const CardW = new canvas({
      Slots: [
        Box(G, -20.0, -20.0, 230.0, 310.0, 0),
        Box(Tex(CardGui.T_PanelChar, 190.0, 270.0), 0.0, 0.0, 190.0, 270.0, 1),
        Pin(Day.Root, 95.0, 36.0, 2),
        Box(Icon, 45.0, 72.0, 100.0, 100.0, 2),
        Pin(Amt.Root, 95.0, 206.0, 2),
        Box(Both, 10.0, 78.0, 180.0, 150.0, 2),
        Box(Veil, 8.0, 8.0, 174.0, 254.0, 3),
        Pin(Stamp.Root, 95.0, 135.0, 4),
      ],
    });
    LS.push(RBox(CardW, X, 300.0, 190.0, 270.0, 3));
  }
  const LC = MBtn(B, 160, BtnGold, TmClaim, 600.0, 680.0, 340.0, 88.0, 32.0);
  const LB = MBtn(B, 161, BtnBlue, TmBack, 980.0, 680.0, 340.0, 88.0, 32.0);
  LS.push(LC[0], LB[0]);
  const LoginSlot = RFull(new canvas({ Slots: LS }), 95);

  // ---- profile
  const PPic = Tex(CardGui.T_HeroMe, 220.0, 220.0);
  const PName = OText(TxEmpty, 26.0, CWhite, CInk);
  const PLv = OText(TmLv(1), 60.0, CGold, CInk);
  const PXp = MakeBar(560.0, 28.0, color(0.1, 0.06, 0.03), color(0.35, 0.85, 1.0), false);
  const PXpTxt = OText(TxEmpty, 22.0, CWhite, CInk);
  const PCoins = ONum(0, 28.0, CGold, CInk);
  const PGems = ONum(0, 28.0, CPink, CInk);
  const PStats = TxtWrap(TxEmpty, 22.0, CBrown, 860.0);
  // (browser: dark blue on the parchment, easier to read than the light blue)
  const PId = OText(TxEmpty, 24.0, color(0.0, 0.03, 0.25), CWhite);
  const PTitle = OText(TxEmpty, 30.0, CGold, CInk);
  const PBadges = IRange(0, 2).map(() => Tex(CardGui.T_Bdg00, 84.0, 84.0));
  const PB = MBtn(B, 121, BtnBlue, TmBack, 1010.0, 830.0, 300.0, 80.0, 30.0);
  const PE = MBtn(B, 122, BtnPurple, AhEquipBtn, 590.0, 830.0, 380.0, 80.0, 28.0);
  const ProfRoot = new canvas({
    Slots: [
      MakeOverlayDim(0.7),
      RBox(Tex(CardGui.T_PanelLog, 1000.0, 800.0), 460.0, 140.0, 1000.0, 800.0, 1),
      RPin(OText(TmProfile, 40.0, CGold, CInk).Root, 960.0, 205.0, 2),
      RBox(PPic, 530.0, 255.0, 220.0, 220.0, 2),
      RPin(PName.Root, 640.0, 500.0, 2),
      RPinTL(PLv.Root, 800.0, 255.0, 2),
      RBox(PXp.Root, 800.0, 350.0, 560.0, 28.0, 2),
      RPinTL(PXpTxt.Root, 800.0, 388.0, 2),
      RBox(Tex(CardGui.T_Coin, 48.0, 48.0), 800.0, 430.0, 48.0, 48.0, 2),
      RPinTL(PCoins.Root, 856.0, 436.0, 2),
      RBox(Tex(CardGui.T_GemCur, 48.0, 48.0), 1060.0, 430.0, 48.0, 48.0, 2),
      RPinTL(PGems.Root, 1116.0, 436.0, 2),
      RPinTL(PId.Root, 800.0, 488.0, 2),
      RPinL(PTitle.Root, 540.0, 568.0, 2),
      RBox(PStats, 540.0, 620.0, 860.0, 200.0, 2),
      PB[0],
      PE[0],
      RBox(MenuHit(B, 123), 500.0, 478.0, 280.0, 46.0, 3),
    ],
  });
  PBadges.forEach((Pic, K) => ProfRoot.AddWidget(RBox(Pic, 1110.0 + K * 92.0, 524.0, 84.0, 84.0, 3)));
  const ProfSlot = RFull(ProfRoot, 95);

  // ---- rules
  const RC = MBtn(B, 72, BtnGold, TbClose, 810.0, 940.0, 300.0, 76.0, 30.0);
  const RulesRoot = new canvas({
    Slots: [
      // (web) a tap anywhere = とじる
      MakeTapDim(B.Hub, 72, 0.7),
      RBox(Tex(CardGui.T_PanelLog, 1240.0, 880.0), 340.0, 50.0, 1240.0, 880.0, 1),
      RPin(OText(TmRules, 40.0, CGold, CInk).Root, 960.0, 112.0, 2),
      RBox(TxtWrap(TmRulesText, 19.0, CBrown, 1120.0), 400.0, 152.0, 1120.0, 770.0, 2),
      RC[0],
    ],
  });
  const RulesSlot = RFull(RulesRoot, 97);

  // ---- result
  const RWin = Tex(CardGui.T_Win, 1200.0, 300.0);
  const RLose = Tex(CardGui.T_Lose, 1200.0, 300.0);
  const RDraw = OText(TmDraw, 120.0, CWhite, CInk);
  const RReason = OText(TxEmpty, 28.0, CWhite, CInk);
  const RGain = OText(TxEmpty, 34.0, CGold, CInk);
  const RLevel = OText(TxEmpty, 26.0, CGreen, CInk);
  const RA = MBtn(B, 73, BtnGold, TmAgain, 750.0, 700.0, 420.0, 96.0, 36.0);
  const RT = MBtn(B, 74, BtnBlue, TmToTitle, 750.0, 820.0, 420.0, 96.0, 34.0);
  // the experience bar (it fills up when the result comes up)
  const RXpBar = MakeBar(560.0, 30.0, color(0.1, 0.06, 0.03), color(0.35, 0.85, 1.0), false);
  const RXpLv = OText(TmLv(1), 34.0, CGold, CInk);
  const RXpGain = OText(TxEmpty, 24.0, CGreen, CInk);
  const RXpNum = OText(TxEmpty, 20.0, CWhite, CInk);
  const RLvUp = OText(TmLevelUpBig, 64.0, CGold, CRed);
  Show(RLvUp.Root, false);
  const ResultCanvas = new canvas({
    Slots: [
      MakeOverlayDim(0.55),
      RBox(RWin, 360.0, 80.0, 1200.0, 300.0, 1),
      RBox(RLose, 360.0, 80.0, 1200.0, 300.0, 1),
      RPin(RDraw.Root, 960.0, 230.0, 1),
      RPin(RReason.Root, 960.0, 410.0, 2),
      RBox(Tex(CardGui.T_Coin, 56.0, 56.0), 690.0, 446.0, 56.0, 56.0, 2),
      RPin(RGain.Root, 960.0, 474.0, 2),
      RPinL(RXpLv.Root, 520.0, 560.0, 2),
      RBox(Tex(CardGui.T_Plate, 600.0, 50.0), 660.0, 535.0, 600.0, 50.0, 2),
      RBox(RXpBar.Root, 680.0, 545.0, 560.0, 30.0, 3),
      RPinL(RXpGain.Root, 1280.0, 560.0, 2),
      RPin(RXpNum.Root, 960.0, 606.0, 3),
      RPin(RLevel.Root, 960.0, 650.0, 2),
      RPin(RLvUp.Root, 960.0, 340.0, 5),
      RT[0],
    ],
  });
  const RAgainSlot = RA[0];
  const ResultSlot = RFull(ResultCanvas, 88);

  // ---- get! pop-up
  const GTitle = OText(TxEmpty, 56.0, CGold, CInk);
  const GIcon = Tex(CardGui.T_Coin, 160.0, 160.0);
  const GAmt = OText(TxEmpty, 44.0, CWhite, CInk);
  const GSub = OText(TxEmpty, 26.0, CGreen, CInk);
  // (web) a tap anywhere closes it at once (ShowGain awaits GainTap)
  const GainDim = MakeTapDim(B.Hub, null, 0.6);
  const GainRoot = new canvas({
    Slots: [
      GainDim,
      RBox(Tex(CardGui.T_PanelMsg, 900.0, 560.0), 510.0, 330.0, 900.0, 560.0, 1),
      RBox(Tex(CardGui.T_Banner, 1000.0, 154.0), 460.0, 300.0, 1000.0, 154.0, 2),
      RPin(GTitle.Root, 960.0, 372.0, 3),
      RPin(GIcon, 960.0, 580.0, 3),
      RPin(GAmt.Root, 960.0, 740.0, 3),
      RPin(GSub.Root, 960.0, 800.0, 3),
    ],
  });
  const GainSlot = RFull(GainRoot, 120);

  // ---- matching (VS)
  const VsMePic = Tex(CardGui.T_HeroMe, 460.0, 460.0);
  const VsFoePic = Tex(CardGui.T_HeroFoe, 460.0, 460.0);
  const VsMark = OText(TmVsMark, 190.0, CGold, CRed);
  const VsRing = TexTint(CardGui.T_Ring, 450.0, 450.0, CBlue);
  const VsMe = [OText(TxEmpty, 44.0, CWhite, CInk), OText(TxEmpty, 36.0, CGold, CInk), OText(TxEmpty, 26.0, CCream, CInk), OText(TxEmpty, 24.0, CCream, CInk)];
  const VsFoe = [OText(TxEmpty, 44.0, CWhite, CInk), OText(TxEmpty, 36.0, CGold, CInk), OText(TxEmpty, 26.0, CCream, CInk), OText(TxEmpty, 24.0, CCream, CInk)];
  const VsMeTitle = OText(TxEmpty, 28.0, CGold, CInk);
  const VsFoeTitle = OText(TxEmpty, 28.0, CGold, CInk);
  const VsMeBadges = IRange(0, 2).map(() => Tex(CardGui.T_Bdg00, 64.0, 64.0));
  const VsFoeBadges = IRange(0, 2).map(() => Tex(CardGui.T_Bdg00, 64.0, 64.0));
  // (red half for the opponent, blue half for the player, a light line between them)
  const VS = [
    MakeOverlayDim(1.0),
    RBox(Tex(CardGui.T_TitleBg, 1920.0, 1080.0), 0.0, 0.0, 1920.0, 1080.0, 1),
    RBox(new color_block({ DefaultColor: color(0.6, 0.05, 0.05), DefaultOpacity: 0.35 }), 0.0, 0.0, 1920.0, 540.0, 2),
    RBox(new color_block({ DefaultColor: color(0.02, 0.1, 0.5), DefaultOpacity: 0.35 }), 0.0, 540.0, 1920.0, 540.0, 2),
    RBox(new color_block({ DefaultColor: CBlue, DefaultOpacity: 0.3 }), 0.0, 522.0, 1920.0, 36.0, 4),
    RBox(new color_block({ DefaultColor: CWhite, DefaultOpacity: 0.95 }), 0.0, 536.0, 1920.0, 8.0, 5),
    RPin(OText(TmVsHead, 30.0, CGold, CInk).Root, 960.0, 40.0, 6),
  ];
  // the opponent: info on the top left, character on the top right; the player: character bottom left, info bottom right
  VS.push(RBox(Tex(CardGui.T_Plate, 780.0, 76.0), 70.0, 90.0, 780.0, 76.0, 6), RBox(Tex(CardGui.T_Plate, 780.0, 76.0), 1070.0, 610.0, 780.0, 76.0, 6));
  // name, title, badges, level, character, record (top to bottom)
  const FoeYs = [128.0, 306.0, 358.0, 404.0];
  VsFoe.forEach((T, I) => VS.push(RPinL(T.Root, 110.0, FoeYs[I], 7)));
  const MeYs = [648.0, 826.0, 878.0, 924.0];
  VsMe.forEach((T, I) => VS.push(RPinL(T.Root, 1110.0, MeYs[I], 7)));
  VS.push(RPinL(VsFoeTitle.Root, 110.0, 190.0, 7), RPinL(VsMeTitle.Root, 1110.0, 710.0, 7));
  VsFoeBadges.forEach((Pic, K) => VS.push(RBox(Pic, 110.0 + K * 74.0, 214.0, 64.0, 64.0, 7)));
  VsMeBadges.forEach((Pic, K) => VS.push(RBox(Pic, 1110.0 + K * 74.0, 734.0, 64.0, 64.0, 7)));
  const VsCanvas = new canvas({ Slots: VS });
  const VsSlot = RFull(VsCanvas, 98);

  // ---- tutorial offer
  const TY = MBtn(B, 116, BtnGold, TmTutYes, 590.0, 712.0, 340.0, 90.0, 32.0);
  const TN = MBtn(B, 117, BtnBlue, TmTutNo, 990.0, 712.0, 340.0, 90.0, 32.0);
  const TutAskRoot = new canvas({
    Slots: [
      MakeOverlayDim(0.65),
      RBox(Tex(CardGui.T_PanelMsg, 900.0, 600.0), 510.0, 250.0, 900.0, 600.0, 1),
      RBox(Tex(CardGui.T_Banner, 1000.0, 154.0), 460.0, 200.0, 1000.0, 154.0, 2),
      RPin(OText(TmTutTitle, 50.0, CGold, CInk).Root, 960.0, 272.0, 3),
      RBox(TxtWrap(TmTutAsk, 26.0, CBrown, 760.0), 580.0, 380.0, 760.0, 230.0, 3),
      RBox(Tex(CardGui.T_Coin, 70.0, 70.0), 700.0, 610.0, 70.0, 70.0, 3),
      RPinL(OText(TmTutReward(CardTutorialCoins), 38.0, CGold, CInk).Root, 784.0, 645.0, 3),
      TY[0],
      TN[0],
    ],
  });
  const TutAskSlot = RFull(TutAskRoot, 99);

  const Dk = MakeDeckUI(B, Lib);
  const Ach = MakeAchUI(B, Lib);
  const Ps = MakePassUI(B, Lib);
  const M = new card_menus({
    B, Lobby, Lib, Dk, Ach, Ps, Ex,
    TicketEBtn: TBE[1],
    TicketLBtn: TBL[1],
    BRandom2: BM5[1],
    CollPrem: CPm[1],
    BackSws,
    BackUp: BUp[1],
    BackDown: BDn[1],
    BackScrollTxt,
    QAll: QA[1],
    TitleSlot, BattleSlot, WaitSlot, JoinSlot, CharSlot, DraftSlot, QuestSlot, LoginSlot, ProfSlot, RulesSlot, ResultSlot,
    GainSlot, ShopSlot, ShopTabs, ShopCanvas, AskSlot, PackSlot, CollSlot, BackSlot,
    TitleFav, TCoins, TGems, TLv, TXp, TXpTxt, TStats, QBadge, LBadge, ABadge, TPlayers,
    BRandom: BM1[1],
    WTitle, WBig, WSub, JDisplay, JMsg, JTitle,
    CharCanvas, CharPanels, CharTimer, CharWait, CharBackSlot,
    DHead, DSub, DTimer, DOpp, DCount, DWait, DWaitN, DFaces, DGlows, DCurve, DCurveTxt,
    SCoins: SM[1],
    SGems: SM[2],
    SMsg,
    STabBtns: [ST0[1], ST1[1], ST2[1], ST3[1], ST4[1]],
    // (10/27) pack kinds, prebuilt decks
    Pre, KindBtns, PackKindGlow, PackKindArt, PackKindName, PackKindDesc, PackRatesTx,
    SBackFaces, SBackPrice, SBackState, AskText,
    PackBtns: [PB1[1], PB2[1], PB3[1], PB4[1]],
    CoinBadge: [CoinSaveBg, CoinSaveTx.Root],
    TicketIcon, TicketTxt,
    AskYes: AY[1],
    PackCanvas, PackArt, PackGlow, PackFlash, PackTitle, PackCards, PackRoots, PackBursts, PackHelp, PackHelpBox, SumHelp,
    SumHelpBox, PackHelpSlots, SumHelpSlots, PackFlashSlot,
    PFx: MakePackFx(PackCanvas),
    // the pack buttons sit above the effects (an effect over a button would make its next click miss)
    PackNextSlot: RBox(PN[1].Root, 560.0, 950.0, 360.0, 86.4, 30),
    PackSkipSlot: RBox(PS[1].Root, 1000.0, 950.0, 360.0, 86.4, 30),
    PackCloseSlot: RBox(PC[1].Root, 780.0, 950.0, 360.0, 86.4, 30),
    SumCards, SumRoots, CollCards, CollTitle, CollPage, CollBig, CollHelp, CollFilterBtns,
    CollSortBtn: CSort[1],
    CollShards, CollMsg,
    CollConv: CCv[1],
    CollMake: CMk[1],
    BackFaces, BackMarks, QReset, QRows, LCards, LInfo,
    LClaim: LC[1],
    PPic, PName, PLv, PXp, PXpTxt, PCoins, PGems, PStats, PId,
    ResultCanvas, RWin, RLose, RDraw, RReason, RGain, RLevel, RAgainSlot,
    GTitle, GIcon, GAmt, GSub, RXpBar, RXpLv, RXpGain, RXpNum, RLvUp,
    GainTap: GainDim.Widget,
    VsSlot, VsCanvas, VsMePic, VsFoePic, VsMark, VsRing, VsMe, VsFoe, VsMeTitle, VsFoeTitle, VsMeBadges, VsFoeBadges,
    PTitle, PBadges, TutAskSlot,
  });
  Dk.Menus = M;
  // the プレミア animation of the collection's cards
  B.AnimFaces = [...B.AnimFaces, ...CollCards.map(G => G.Face), CollBig];
  spawn(() => M.HoverLoop());
  return M;
}

// ---------------------------------------------------------------- texts of the menus
const TmHint = "クリック、または LB / RB（Q / E）で選んで LT / RT（Z / C）で上下に移動、Y(△)（F）で決定";
const TmFavLabel = "使用キャラクター";
const TmVsHead = "対戦相手が決まりました！";
const TmVsMark = "VS";
const TmVsCpuLv = "CPU";
function TmVsHero(H) { return `使用キャラクター：${H}`; }
function TmVsRec(W, L) { return `対人戦　${W}勝 ${L}敗`; }
const TmVsCpuRec = "コンピューター対戦";
function TmXpPlus(N) { return `+${N} EXP`; }
const TmLevelUpBig = "LEVEL UP!";
const TmTutTitle = "チュートリアル";
const TmTutAsk = "はじめての方におすすめ！\n実際に対戦しながら、遊び方をかんたんに説明します。\n\nチュートリアルを開始しますか？";
function TmTutReward(N) { return `クリアで +${N}コイン！`; }
const TmTutYes = "はい";
const TmTutNo = "いいえ";
const TmTutClear = "チュートリアル完了！これで遊び方はバッチリ！";
const TmTutQuit = "チュートリアルを終了しました";
function TmTutGain(N) { return `+${N}コイン`; }
const TmTutDoneHead = "チュートリアル完了！";
const TmInUse = "使用中";
const TmPicked = "せんたく中";
const TmOwned = "所持";
const TmBuy = "購入";
const TmLocked = "未購入";
const TmNew = "NEW";
function TmMana(N) { return `マナ${N}`; }
function TmLv(N) { return `Lv ${N}`; }
function TmExp(A, B) { return `EXP ${A} / ${B}`; }
function TmExpTotal(A, B, T) { return `EXP ${A} / ${B}（合計 ${T}）`; }
// (browser: the number of players isn't known — the connection state is shown; lobby.PlayerCount = 1 online / 0 offline)
// (browser: the title's player mark = フレンド; lobby.PlayerCount = friend requests waiting, shown as a badge)
function TmPeople(N) { return 'フレンド'; }
function TmTitleStats(CW, CL, PW, PL, K) { return `CPU戦　${CW}勝 ${CL}敗\n対人戦　${PW}勝 ${PL}敗\nカード　${K}種類`; }
const TmProfile = "プロフィール";
const TmProfHint = "えらぶと くわしく見られるよ";
const TmBattle = "対戦";
const TmCharSel = "キャラ選択";
const TmShop = "ショップ";
const TmCollection = "コレクション";
const TmBackSet = "カード設定";
const TmQuests = "デイリークエスト";
const TmLogin = "アワーボーナス";
const TmRules = "遊び方";
const TmAch = "実績";
const TmCpu = "CPUと対戦";
function TmRandom(N) { return `野良対戦（現在：${N}人待機）`; }
function TmRandomN(N) { return `野良対戦-通常（現在：${N}人待機）`; }
function TmRandom2(N) { return `野良対戦-2Pick（現在：${N}人待機）`; }
const TmDeckBuild = "デッキ構築";
const TmNoDeck = "使えるデッキがないよ！タイトルの「デッキ構築」で40枚のデッキを作ってね";
const TmRoomNeedDeck = "通常対戦の部屋です。使えるデッキがないので入れません（デッキ構築で作ってね）";
function TmOwnedPrem(N, L) { return `所持 ${N}枚　プレミア★${L}`; }
const TmPremBtn0 = "プレミア化";
function TmPremBtn(L, N) { return `★プレミア化${L}（同じカード×${N}枚を使う）`; }
const TmPremMax = "プレミア化★★ 完了済み";
const TmPremMaxMsg = "このカードはもう最高のプレミアだよ";
function TmPremShort(N) { return `同じカードがあと${N}枚必要だよ`; }
function TmPremAsk(C, N, L) { return `「${C}」を${N}枚使って\nプレミア化★${L}しますか？（選んだ1枚は残ります）`; }
const TmYesPrem = "プレミア化する";
function TmPremOk(C, L) { return `「${C}」がプレミア★${L}になった！`; }
function TmBackRows(A, B) { return `${A}/${B}`; }
const TmUp = "▲";
const TmDown = "▼";
const TmClaimAll = "まとめて受け取る";
const TmQuestAll = "クエストまとめて達成！";
const TmRoomMake = "部屋を作る";
const TmRoomJoin = "部屋に参加";
const TmBack = "戻る";
const TmBattleNote = "どの対戦も、キャラ選択 → 2Pickデッキ構築（40枚）→ 対戦！";
function TmDots(B, D) { return `${B}${D}`; }
const TmDot1 = "・";
const TmDot2 = "・・";
const TmDot3 = "・・・";
const TmRandomTitle = "野良対戦";
const TmSearching = "さがし中";
const TmRandomSub = "ほかのプレイヤーが「野良対戦」を選ぶと始まるよ";
const TmRoomTitle = "部屋番号";
function TmRoomNo(A, B) { return `${A}${B}`; }
const TmRoomSub = "相手が「部屋に参加」でこの番号を入れると始まるよ";
const TmJoinTitle = "部屋番号を入力";
const TmJoinHelp = "友だちに教えてもらった2桁の番号を入力してね";
const TmJoinNeed2 = "2桁の番号を入力してね";
function TmJoinNone(A, B) { return `部屋「${A}${B}」は見つからなかったよ。番号を確かめてね`; }
// (JS) shown while the room is looked up over the network
const TmConnecting = "接続中…";
const TmDigits0 = "_ _";
function TmDigits1(A) { return `${A} _`; }
function TmDigits2(A, B) { return `${A} ${B}`; }
const TmErase = "消す";
const TmSortNo = "並び：番号順";
const TmSortRarity = "並び：レア度順";
const TmSortName = "並び：あいうえお順";
const TmSortCost = "並び：コスト順";
function TmBonus(N) { return `+${N}%お得！`; }
function TmTier(A, B) { return `　（${A}/${B}段階）`; }
const TmCode = "ひみつのコード";
const TmCodeTitle = "ひみつのコード";
const TmCodeEmpty = "・・・・";
const TmCodeHelp = "数字のコードを入れてね（最大8けた）";
const TmCodeWrong = "コードがちがうみたい…";
const TmCodeUsed = "このコードはもう使ったよ";
const TmCodeOk = "コード成功！";
function TmCodeCoins(C) { return `コード成功！ +${C}コイン`; }
function TmCodeTickets(N) { return `コード成功！ ガチャチケット×${N}枚`; }
function TmGainT(N) { return `ガチャチケット×${N}枚`; }
function TmCodeTicketsE(N) { return `コード成功！ エピック以上確定チケット×${N}枚`; }
function TmCodeTicketsL(N) { return `コード成功！ レジェンド以上確定チケット×${N}枚`; }
const TmCodePass = "コード成功！ プレミアムパスを解放したよ";
function TmUseTicketE(N) { return `エピック以上確定チケットで開ける（${N}枚）`; }
function TmUseTicketL(N) { return `レジェンド以上確定チケットで開ける（${N}枚）`; }
const TmNoTicketE = "エピック以上確定チケットを持っていないよ";
const TmNoTicketL = "レジェンド以上確定チケットを持っていないよ";
// (10/27) K = the pack kind's name
function TmAskTicketE(K) { return `エピック以上確定チケット1枚で\n${K}を1パック開けますか？\n（最後の1枚がエピック85%／レジェンド15%）`; }
function TmAskTicketL(K) { return `レジェンド以上確定チケット1枚で\n${K}を1パック開けますか？\n（最後の1枚が必ずレジェンド）`; }
const TmBuy1Ticket = "1パック　ガチャチケット×1枚";
const TmBuy10Ticket = "10パック　ガチャチケット×10枚";
function TmSaveCoin(N) { return `${N}コインお得！`; }
function TmSaveGem(N) { return `${N}ジェムお得！`; }
function TmTicketHave(N) { return `ガチャチケット ×${N}枚`; }
function TmAskPackTicket(N, T, K = TmTabPacks) { return `${K}を${N}パック\nガチャチケット${T}枚で開けますか？`; }
const TmNoTickets = "ガチャチケットが足りないよ";
function TmPlayerId(S) { return `プレイヤーID　${S}`; }
function TmCodeGems(G) { return `コード成功！ +${G}ジェム`; }
function TmCodeCG(C, G) { return `コード成功！ +${C}コイン +${G}ジェム`; }
const TmCharTitle = "キャラクターをえらんでね";
function TmCharWait(N) { return `${N}で決定！相手を待っています…`; }
function TmCharDone(N) { return `${N}で決定！`; }
function TmCards(N) { return `${N}枚`; }
function TmDeckCount(A, B) { return `デッキ ${A} / ${B}枚`; }
function TmOppPicks(A, B) { return `相手 ${A} / ${B}`; }
function TmDraftHead(A, B) { return `2Pick デッキ構築　${A} / ${B}`; }
const TmDraftLegend = "★ レジェンド確定！どちらのセットにもレジェンドが1枚ずつ入っているよ ★";
const TmDraftEpic = "★ エピック確定！どちらのセットにもエピックが1枚ずつ入っているよ ★";
const TmDraftNormal = "どちらかのセット（2枚）を選んでデッキに加えよう";
const TmDraftDone = "デッキ完成！";
const TmDraftWait = "相手のデッキ構築が終わるのを待っています…";
const TmDraftWaitBig = "対戦相手が選ぶのを待っています...";
const TmManaCost = "マナコスト";
const TmSevenUp = "7+";
const TmTabPacks = "カードパック";
const TmTabBacks = "カードの裏面";
const TmTabGems = "ジェム";
function TmBuy1Coin(N) { return `1パック　${N}コイン`; }
function TmBuy1Gem(N) { return `1パック　${N}ジェム`; }
function TmBuy10Coin(N) { return `10パック　${N}コイン`; }
function TmBuy10Gem(N) { return `10パック　${N}ジェム`; }
const TmPackRates = "1パック5枚入り。排出率：レジェンド1%・エピック5%・レア29%・ノーマル65%";
// (10/27) the pack kinds (PackKind* in save.js), what they give more of, their rates (‰: [L, E, R, N])
const TmPackKinds = ["オールスターパック", "パワフルパック", "スピーディパック", "モンスターパック", "マジックパック"];
const TmPackKindDescs = [
  "全カードから出る！ レジェンド排出率3倍！",
  "マナ5以上の大型カードが出やすい！（60%以上）",
  "マナ4以下の軽いカードが出やすい！（70%以上）",
  "モンスターカードが出やすい！（85%以上）",
  "スペル・アミュレットが出やすい！（70%以上）",
];
const TmLegend3x = "レジェンド3倍！";
function TmPackRatesOf(Rt) { return `1パック5枚入り\n排出率：レジェンド${Rt[0] / 10}%・エピック${Rt[1] / 10}%・レア${Rt[2] / 10}%・ノーマル${Rt[3] / 10}%`; }
// the glow (and a light tint of the pack) of every kind
function PackKindColor(K) {
  return K === 1 ? color(1.0, 0.45, 0.1) : K === 2 ? color(0.3, 0.95, 0.45) : K === 3 ? color(1.0, 0.25, 0.3) : K === 4 ? color(0.35, 0.55, 1.0) : CGold;
}
function PackKindTint(K) {
  return K === 1 ? color(1.0, 0.75, 0.45) : K === 2 ? color(0.6, 1.0, 0.65) : K === 3 ? color(1.0, 0.6, 0.6) : K === 4 ? color(0.6, 0.7, 1.0) : CWhite;
}
function TmPriceCoin(N) { return `${N}コイン`; }
function TmPriceGem(N) { return `${N}ジェム`; }
const TmBackShopHelp = "裏面を選ぶと購入できるよ。持っている裏面は選ぶと使用中になる（タイトルの「カード設定」でも変更可能）。";
// (browser: prices in yen — the purchase itself is 「Coming soon」)
function TmVbucks(N) { return `${N.toLocaleString('ja-JP')}円`; }
function TmGems(N) { return `${N.toLocaleString('ja-JP')}ジェム`; }
function TmGemBonus(N) { return `+${N.toLocaleString('ja-JP')}ジェムお得！`; }
const TmGemShopHelp = "ジェムはお金で購入できます（購入機能は準備中です）。";
const TmShopHello = "いらっしゃいませ！";
const TmShopThanks = "まいどあり！";
const TmNoCoins = "コインが足りないよ";
const TmNoGems = "ジェムが足りないよ";
const TmBackSet2 = "カード設定";
const TmBackSetHelp = "使いたいカードの裏面を選んでね。裏面はショップで購入できるよ。";
const TmBackBought = "新しい裏面を手に入れた！（使用中にしたよ）";
const TmBackSet3 = "裏面を変更したよ";
const TmVbucksOpen = "購入画面を開いています…";
const TmGemThanks = "ジェムを受け取ったよ！ありがとう！";
function TmAskPackCoin(N, P, K = TmTabPacks) { return `${K}を${N}パック\n${P}コインで購入しますか？`; }
function TmAskPackGem(N, P, K = TmTabPacks) { return `${K}を${N}パック\n${P}ジェムで購入しますか？`; }
function TmAskBackCoin(P) { return `このカードの裏面を\n${P}コインで購入しますか？`; }
function TmAskBackGem(P) { return `このカードの裏面を\n${P}ジェムで購入しますか？`; }
const TmYesBuy = "購入する";
const TmNo = "やめる";
function TmPackNo(A, B, K = TmTabPacks) { return `${K}　${A} / ${B}`; }
function TmPackAll(N) { return `手に入れたカード（${N}枚）`; }
const TmPackHelp = "カードを選ぶと詳しく見られるよ。";
const TmNextPack = "次のパックを開ける";
const TmSkipAll = "すべて開ける";
function TmCollTitle(A, B) { return `コレクション　${A} / ${B} 種類`; }
const TmCollHelp = "カードを選ぶと詳しく見られるよ（持っていないカードも選べます）。\nダブったカードはカケラに変換できて、カケラを使えばどのカードでも生成できるよ。\n「ダブりをまとめて変換」は4枚以上あるカードを3枚残して変換します。\n変換：ノーマル1・レア3・エピック10・レジェンド30　生成：ノーマル10・レア30・エピック200・レジェンド300\n「プレミア化」は同じカードを使ってカードをキラキラに（★1）、さらにアニメーションに（★2）するよ。";
function TmOwnedN(N) { return `所持 ${N}枚`; }
const TmNotOwned = "未所持";
function TmTimes(N) { return `×${N}`; }
const TmAll = "すべて";
const TmRarN = "ノーマル";
const TmRarR = "レア";
const TmRarE = "エピック";
const TmRarL = "レジェンド";
function TmReset(T) { return `リセットまで ${T}`; }
function TmXp(N) { return `+${N} EXP`; }
const TmClaim = "受け取る！";
const TmClaimed = "受取済み";
const TmNotYet = "未達成";
const TmQuestDone = "クエスト達成！";
function TmDay(N) { return `DAY ${N}`; }
const TmLoginReady = "今日のログインボーナスを受け取れます！";
function TmLoginNext(T) { return `今日のボーナスは受け取ったよ。次まで ${T}`; }
const TmLoginGot = "ログインボーナス！";
const TmHourGot = "アワーボーナス！";
const TmHrCoin = "コイン";
const TmHrGem = "ジェム";
const TmHrBox = "プレゼント";
const TmHrSecret = "？？？";
const TmSpin = "ルーレットを回す！";
const TmHrWait = "まだ回せないよ";
function TmHrReady(N) { return `ルーレットを回そう！（${N}回目・5回ごとに報酬アップ！）`; }
function TmHrReadyBig(N) { return `${N}回目のボーナス！ 今回は報酬パワーアップ中！`; }
function TmHrNext(T) { return `次のアワーボーナスまで ${T}（3時間ごとに回せるよ）`; }
const TmRowCoin = "コイン";
const TmRowGem = "ジェム";
const TmConvBtn0 = "カケラに変換";
const TmMakeBtn0 = "カケラで生成";
function TmConvBtn(N) { return `カケラに変換 +${N}`; }
function TmMakeBtn(N) { return `生成 カケラ${N}`; }
const TmSpareBtn = "ダブりをまとめて変換";
const TmPickFirst = "先にカードを選んでね";
function TmConvOk(N, K) { return `「${N}」をカケラ${K}個に変換した！`; }
const TmConvNeed2 = "2枚以上持っているカードだけ変換できるよ（1枚は残ります）";
function TmCraftShort(N) { return `カケラが足りないよ（あと${N}個）`; }
function TmCraftAsk(N, K) { return `「${N}」を\nカケラ${K}個で生成しますか？`; }
function TmCraftOk(N) { return `「${N}」を生成した！`; }
const TmShardHave = "所持カケラ";
const TmSpareNone = "4枚以上持っているカードはないよ";
function TmSpareAsk(C, K) { return `4枚以上あるカードの余り${C}枚を\nカケラ${K}個に変換しますか？\n（どのカードも3枚は残ります）`; }
function TmSpareOk(K) { return `ダブりをまとめて変換！ カケラ+${K}`; }
const TmYesMake = "生成する";
const TmYesConv = "変換する";
function TmProfStats(CW, CL, CR, PW, PL, PR, M, D, K, T) { return `CPU戦：${CW}勝 ${CL}敗（勝率 ${CR}%）\n対人戦：${PW}勝 ${PL}敗（勝率 ${PR}%）\n通算対戦数：${M}回　ログイン日数：${D}日\nカード：${K} / ${T} 種類`; }
// win rate in percent (0 when nothing was played)
function WinRate(W, L) { return W + L > 0 ? Quotient(W * 100 + Quotient(W + L, 2), W + L) : 0; }
function TmGain(C, G, X) { return `+${C}コイン　+${G}ジェム　+${X}EXP`; }
function TmGainCG(C, G) { return `+${C}コイン　+${G}ジェム`; }
function TmGainC(C) { return `+${C}コイン`; }
function TmGainG(G) { return `+${G}ジェム`; }
function TmLevelUp(A, B, C, G) { return `レベルアップ！ Lv${A} → Lv${B}（+${C}コイン +${G}ジェム）`; }
function TmResultGain(C, X) { return `獲得：${C}コイン　${X}EXP`; }
const TmLeftWin = "相手が対戦から抜けたので、あなたの勝ち！";
const TmLeftEarly = "相手が最初のターンの前に抜けたので、報酬は少しだけ…";
const TmSurrWin = "相手が降参しました";
const TmSurrEarly = "相手がすぐに降参したので、報酬は少しだけ…";
const TmSurrLose = "降参しました";
const TmRealWin = "完全勝利！報酬アップ！";
const TmDraw = "DRAW";
const TmAgain = "もう一度";
const TmToTitle = "タイトルへ";
const TmRulesText = "・おたがいのHPは20。相手のHPを0にしたら勝ち！（HPは一部の効果を除いて20より増えない）\n・ターンのはじめにマナが全回復し、最大マナが1増える（最大10）。\n・手札のカードを選ぶ→青く光ったマスを選んで召喚。スペルは対象を選ぶ。叫びに対象があるときは、召喚のあとに対象を選ぶ。\n・モンスターは次のターンから行動できる。1ターンに「攻撃」か「となりのマスへ移動」のどちらか1回。攻撃できるのは正面か斜め前の敵、または相手プレイヤー。\n・進化：自分のモンスターを選んで「進化」で+2/+2（カードによっては特別な効果）。1ターン1回、先攻は2回・後攻は3回まで。\n・ジュエル（左下の六角形）はキャラクターごとにちがう必殺技。マナを使って1ターンに1回。\n・キーワード：挑発／速攻／特攻（召喚ターンでもモンスターに攻撃できる）／必殺／吸血／バリア（1度だけダメージ無効）／無敵／威圧（対象にならない）／潜伏（攻撃するまで対象にならない）／自傷／カウントダウン／覚醒（最大マナ7以上）／復讐（HP10以下）。\n・対戦は2種類：「通常」はデッキ構築で作った40枚のデッキ（同じカードは3枚まで）で対戦。「2Pick」はキャラ選択 → 2枚組を20回選んで40枚のデッキを作る（5・15回目はエピック、10・20回目はレジェンドが必ず入る）。\n・ショップのカードパックでカードを集めて、コレクションを完成させよう！\n・持ち時間：最初のターンは120秒。次のターンは残った時間+30秒、自分でターン終了したときはさらに+45秒（最大120秒）。時間切れでターン終了（時間切れのときは+30秒だけ）。\n・2Pickは1回最大20秒（次は残り+10秒）、手札の交換は20秒まで。\n・コントローラー：LB/RBで選ぶ、Y(△)で決定、X(□)でキャンセル、LT/RTで上下に移動（ページのある画面では、いちばん上・下でページ切り替え）。\n・実績：タイトルの「実績」で、達成した実績をえらぶと称号やバッチがもらえる。プロフィールの「称号・バッチ設定」で称号1つとバッチ3つを付けると、対戦相手に表示されるよ。";
