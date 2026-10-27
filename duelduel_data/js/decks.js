// decks.js — card_decks.verse: the deck builder (up to 8 decks, each with its character), the deck pick before a
// battle, the battle mode pick (通常 = a built deck / 2Pick) and the character screen with its costumes (着せ替え).
// Owned by card_menus (its Dk), drawn as overlays on the player's board_ui and driven by its cursor (Pick).
// Ported 1:1. Changes: every click area is made with MenuHit (menus.js: B.Hub.Make + Draggable = false);
// DkEdges returns a Map that also carries the same keys as plain properties (works with E.get(k) and E[k]).
'use strict';

// battle modes
const ModeDeck = 0;
const Mode2Pick = 1;
const ModeTower = 2;     // 無限の塔 (CPU only, tower.js)

// the time to pick a deck before a match against a player
const DeckPickSeconds = 15.0;

// the cards of deck D for character HeroId: a card only an other character can use (専用) is swapped for
// a random card of the same rarity
function DeckCards(Lib, D, HeroId) {
  const Pool = DraftPool(Lib.DB, HeroId);
  const Out = [];
  for (const Id of D.Cards) {
    const C = At(Lib.DB, Id);
    if (!C) continue;
    Out.push((C.HeroOnly >= 0 && C.HeroOnly !== HeroId) ? DraftRandomOf(Pool, C.Rarity, []) : C);
  }
  return Out;
}

// a random 40-card deck (a player without a usable deck, the CPU of a normal battle)
function RandomDeck(Lib, HeroId) {
  const Pool = DraftPool(Lib.DB, HeroId);
  const Cards = DraftAutoDeck(Pool, DraftMakeSchedule());
  return new card_deck({ Hero: HeroId, Cards: Cards.map(D => D.Id) });
}

// one deck on the deck list (400 x 300)
class deck_slot {
  constructor(o) {
    this.Pic = o.Pic;
    this.Face = o.Face;          // the deck's icon card (Pic shows the character when there is none)
    this.Name = o.Name;
    this.HeroName = o.HeroName;
    this.Count = o.Count;
    this.State = o.State;
    this.Glow = o.Glow;
  }
}

// one line of the deck list in the editor: cost, name, copies
class deck_row {
  constructor(o) { this.Root = o.Root; this.Cost = o.Cost; this.Name = o.Name; this.Num = o.Num; }
}

// the deck editor's grid: 6 x 3 cards at scale 0.9
const EdCols = 6;
const EdPer = 18;
const EdRowsMax = 40;
function EdX(I) { return 40.0 + Mod(I, EdCols) * 152.0; }
function EdY(I) { return 128.0 + Quotient(I, EdCols) * 232.0; }
// the deck list on the right: small cards (6 x 6 shown, the list scrolls by rows with the bar on its right)
const DkCols = 6;
const DkRows = 6;
const DkScale = 0.46;
function DkX(I) { return 986.0 + Mod(I, DkCols) * 75.0; }
function DkY(I) { return 128.0 + Quotient(I, DkCols) * 110.0; }
const DkTrackX = 1444.0;
const DkTrackY = 170.0;
const DkTrackH = 576.0;

// ids: mode 125 通常 126 2Pick 127 戻る / deck list 500..507, 509 戻る / editor: cards 510..527, 前へ 530, 次へ 531,
// キャラ 532, おまかせ 533, 全部はずす 534, 保存 535, 戻る 536, アイコン 537, 並び 538, deck lines 540..579 /
// characters 720..727, costumes 730..733, 戻る 739
class deck_ui {
  constructor(o) {
    Object.assign(this, o);
    this.Menus = null;
    this.EdNo = 0;
    this.EdHero = 0;
    this.EdCards = [];
    this.EdIcon = -1;
    this.EdPageNo = 0;
    this.EdList = [];
    this.EdEntries = [];
    this.EdSort = 0;      // the card list's order: 0 コスト順, 1 レア度順, 2 あいうえお順
    this.EdTop = 0;       // the first row of the deck list that is shown
    this.ChHero = 0;
    // a costume the player doesn't have, shown on the big picture only (-1: none)
    this.ChPreview = -1;
  }

  P() { return this.B.P; }

  CloseAll() {
    for (const S of [this.ModeSlot, this.ListSlot, this.EditSlot, this.CharDSlot]) this.B.Layer(S, false);
  }

  Hero(Id) {
    return At(this.Lib.Heroes, Id) ?? At(this.Lib.Heroes, 0) ?? new hero_def({ Id: 0, Name: TxEmpty, Race: TxEmpty, Pic: CardGui.T_HeroMe, Jewel: new fx(), JewelName: TxEmpty, JewelPic: CardGui.T_JwBook, Cost: 2 });
  }

  // ------------------------------------------------------------ the battle mode (0 通常, 1 2Pick, 2 無限の塔, -1 戻る)
  // (無限の塔 (128) is only offered against the CPU)
  async ModeSelect(Sub) {
    const B = this.B;
    this.ModeSub.Set(Sub);
    const Tower = Sub === TdCpuMode;
    this.ModeTowerSw.Set(Tower);
    if (Tower) {
      this.ModeTowerRec.Set(TowerBestText(this.P()));
      this.ModeTowerRun.Set(TowerRunText(this.P()));
    }
    const Ids = Tower ? [125, 126, 128, 127] : [125, 126, 127];
    B.Snd(SfxOpen);
    B.Layer(this.ModeSlot, true);
    try {
      if (ArrFind(Ids, B.CurId) === undefined) B.CurId = 125;
      const Id = await B.Pick(Ids, 125, 127);
      B.Snd(Id === 127 ? SfxCancel : SfxClick);
      return Id === 125 ? ModeDeck : Id === 126 ? Mode2Pick : Id === 128 ? ModeTower : -1;
    } finally {
      B.Layer(this.ModeSlot, false);
    }
  }

  // ------------------------------------------------------------ the deck list
  FillList() {
    const Lib = this.Lib;
    this.DSlots.forEach((S, I) => {
      const D = CardDeckOf(this.P(), I);
      const H = this.Hero(D.Hero);
      S.Name.Set(TdDeckNo(I + 1));
      // the icon card the player set (when it is still in the deck), else the character
      const C = D.Icon >= 0 ? At(Lib.DB, D.Icon) : undefined;
      if (D.Cards.length > 0 && D.Icon >= 0 && CardCopies(D.Cards, D.Icon) > 0 && C) {
        S.Face.SetCard(Lib, C, C.Atk, C.Hp, C.Hp);
        S.Face.SetPrem(CardPremLevel(this.P(), C.Id));
        S.Face.SetShown(true);
        Show(S.Pic, false);
      } else {
        S.Face.SetShown(false);
        Show(S.Pic, true);
      }
      if (D.Cards.length === 0) {
        S.Pic.SetImage(CardGui.T_CardBack);
        S.HeroName.Set(TdEmptyDeck);
        S.Count.Set(TxEmpty);
        S.State.Set(TdNew);
        S.State.SetColor(CBlue);
      } else {
        S.Pic.SetImage(CardHeroPic(this.P(), H));
        S.HeroName.Set(H.Name);
        S.Count.Set(TdCount(D.Cards.length, CardDeckSize));
        const Pr = CardDeckProblem(this.P(), Lib.DB, D);
        S.State.Set(Pr === 0 ? TdReady : Pr === 1 ? TdNotFull : Pr === 2 ? TdTooMany : TdShort);
        S.State.SetColor(Pr === 0 ? CGreen : CRed);
      }
      Show(S.Glow, I === GetCardSave(this.P()).DeckSel && D.Cards.length > 0);
    });
  }

  // the deck to battle with: its index; -1 = 戻る (CanBack) or no usable deck when the time ran out
  // Deadline (GetSimulationElapsedTime, 0 = no time limit): before a match against a player
  // (after the matching there is no 戻る: the character select's 戻る comes back here instead)
  async DeckSelect(CanBack, Deadline) {
    const B = this.B, Lib = this.Lib;
    const Timed = Deadline > 0.0;
    this.FillList();
    this.ListTitle.Set(TdPickTitle);
    this.ListMsg.Set(TdPickHelp);
    this.ListTimer.Set(TxEmpty);
    this.ListCanvas.RemoveWidget(this.ListBackSlot.Widget);
    if (CanBack) this.ListCanvas.AddWidget(this.ListBackSlot);
    B.Snd(SfxOpen);
    B.Layer(this.ListSlot, true);
    // before a match against a player the list stays up (「相手を待っています」) until the character select
    try {
      const Sel = GetCardSave(this.P()).DeckSel;
      const First = CardDeckOk(this.P(), Lib.DB, Sel) ? Sel : CardFirstOkDeck(this.P(), Lib.DB);
      B.CurId = 500 + Max(0, First);
      const Ids = [...IRange(0, CardMaxDecks - 1).map(I => 500 + I), ...(CanBack ? [509] : [])];
      while (true) {
        const Id = Timed ? await B.PickTimed(Ids, 500, -1, Deadline, this.ListTimer) : await B.Pick(Ids, 500, CanBack ? 509 : -1);
        if (Id === 509) {
          B.Snd(SfxCancel);
          return -1;
        }
        if (Id === NavTimeout) {
          // the time is up: the highlighted deck if it can be used, else the first one that can
          const Cur = B.CurId - 500;
          this.ListTimer.Set(TxEmpty);
          this.ListMsg.Set(TdWaitOpp);
          return CardDeckOk(this.P(), Lib.DB, Cur) ? Cur : CardFirstOkDeck(this.P(), Lib.DB);
        }
        const I = Id - 500;
        if (CardDeckOk(this.P(), Lib.DB, I)) {
          B.Snd(SfxClick);
          CardSetDeckSel(this.P(), I);
          this.ListTimer.Set(TxEmpty);
          this.ListMsg.Set(Timed ? TdWaitOpp : TdPicked(I + 1));
          this.FillList();
          return I;
        }
        B.Snd(SfxCancel);
        this.ListMsg.Set(TdCantUse);
      }
    } finally {
      if (!Timed) B.Layer(this.ListSlot, false);
    }
  }

  // the deck builder: the list, then the editor of the chosen deck (returns when 戻る is chosen on the list)
  async DeckBuilder() {
    const B = this.B;
    this.ListTitle.Set(TdBuildTitle);
    this.ListTimer.Set(TxEmpty);
    this.ListCanvas.RemoveWidget(this.ListBackSlot.Widget);
    this.ListCanvas.AddWidget(this.ListBackSlot);
    B.Snd(SfxOpen);
    B.CurId = 500 + Max(0, GetCardSave(this.P()).DeckSel);
    while (true) {
      this.FillList();
      this.ListMsg.Set(TdBuildHelp);
      B.Layer(this.ListSlot, true);
      const Id = await B.Pick([...IRange(0, CardMaxDecks - 1).map(I => 500 + I), 509], 500, 509);
      if (Id === 509) {
        B.Layer(this.ListSlot, false);
        B.Snd(SfxCancel);
        return;
      }
      B.Snd(SfxClick);
      B.Layer(this.ListSlot, false);
      await this.Edit(Id - 500);
      B.CurId = Id;
    }
  }

  // ------------------------------------------------------------ the editor
  // the cards that can go into the deck: owned, no tokens, the character's own 専用 cards only
  // (in the order of the 並び button: コスト順 / レア度順 / あいうえお順)
  MakePool() {
    const S = GetCardSave(this.P());
    const Order = this.EdSort === 1 ? CardOrderRarity : this.EdSort === 2 ? CardOrderName : CardOrderCost;
    const L = [];
    for (const Id of Order) {
      const D = At(this.Lib.DB, Id);
      if (D && !D.Token && (S.Owned[Id] ?? 0) > 0 && (D.HeroOnly < 0 || D.HeroOnly === this.EdHero)) L.push(D);
    }
    this.EdList = L;
    this.EdSortBtn.Label.Set(this.EdSort === 1 ? TmSortRarity : this.EdSort === 2 ? TmSortName : TmSortCost);
    const Pages = Max(1, Quotient(this.EdList.length + EdPer - 1, EdPer));
    this.EdPageNo = Max(0, Min(this.EdPageNo, Pages - 1));
  }

  // the most copies of D the deck may have
  Allowed(D) { return Min(CardDeckCopies, CardOwnedCount(this.P(), D.Id)); }

  FillEdit() {
    const Lib = this.Lib;
    const S = GetCardSave(this.P());
    const H = this.Hero(this.EdHero);
    this.EdTitle.Set(TdEditTitle(this.EdNo + 1));
    this.EdHeroPic.SetImage(CardHeroPic(this.P(), H));
    this.EdHeroName.Set(H.Name);
    this.EdCount.Set(TdCount(this.EdCards.length, CardDeckSize));
    this.EdCount.SetColor(this.EdCards.length === CardDeckSize ? CGreen : CGold);
    const Pages = Max(1, Quotient(this.EdList.length + EdPer - 1, EdPer));
    this.EdPageTxt.Set(TbPage(this.EdPageNo + 1, Pages));
    this.EdPool.forEach((G, I) => {
      const D = At(this.EdList, this.EdPageNo * EdPer + I);
      if (D) {
        G.Face.SetCard(Lib, D, D.Atk, D.Hp, D.Hp);
        G.Face.SetPrem(CardPremLevel(this.P(), D.Id));
        G.Face.SetShown(true);
        const In = CardCopies(this.EdCards, D.Id);
        const Own = S.Owned[D.Id] ?? 0;
        G.Count.Set(TdOwned(Own));
        Show(G.Count.Root, true);
        G.New.Set(TdInDeck(In));
        Show(G.New.Root, In > 0);
        Show(G.Veil, In >= this.Allowed(D));
      } else {
        G.Face.SetShown(false);
        Show(G.Count.Root, false);
        Show(G.New.Root, false);
        Show(G.Veil, false);
      }
    });
    // the deck list: one line per card (cheapest first)
    const Ids = [];
    for (const Id of CardOrderCost) if (CardCopies(this.EdCards, Id) > 0) Ids.push(Id);
    this.EdEntries = Ids;
    this.EdTop = Max(0, Min(this.EdTop, this.DkMaxTop()));
    this.EdRows.forEach((G, I) => {
      const Sw = At(this.EdRowSws, I);
      if (!Sw) return;
      const Id = At(this.EdEntries, this.EdTop * DkCols + I);
      const D = Id !== undefined ? At(Lib.DB, Id) : undefined;
      if (D) {
        G.Face.SetCard(Lib, D, D.Atk, D.Hp, D.Hp);
        G.Face.SetPrem(CardPremLevel(this.P(), D.Id));
        G.Face.SetShown(true);
        G.Count.Set(TmTimes(CardCopies(this.EdCards, Id)));
        Show(G.Count.Root, true);
        Sw.Set(true);
      } else {
        Sw.Set(false);
      }
    });
    // the scroll bar: only when the list is longer than what is shown
    const Rows = this.DkRowCount();
    const Scrolls = Rows > DkRows;
    for (const Sw of this.EdScrollSws) Sw.Set(Scrolls);
    if (Scrolls) {
      const ThumbH = Max(40.0, DkTrackH * DkRows / Rows);
      const ThumbY = (DkTrackH - ThumbH) * this.EdTop / Max(1, this.DkMaxTop());
      this.EdTrack.RemoveWidget(this.EdThumb);
      this.EdTrack.AddWidget(Box(this.EdThumb, 0.0, ThumbY, 14.0, ThumbH, 1));
    }
  }

  DkRowCount() { return Quotient(this.EdEntries.length + DkCols - 1, DkCols); }
  DkMaxTop() { return Max(0, this.DkRowCount() - DkRows); }

  // the controller cursor leaving the shown part of the deck list scrolls it (board_ui.PickPagedScroll)
  // ([int]logic: a Map whose keys are also set as plain properties)
  DkEdges() {
    const M = new Map();
    const Put = K => { M.set(K, true); M[K] = true; };
    const Shown = Min(DkCols * DkRows, this.EdEntries.length - this.EdTop * DkCols);
    if (this.EdTop < this.DkMaxTop()) {
      for (let I = DkCols * (DkRows - 1); I <= DkCols * DkRows - 1; I++) Put((540 + I) * 4 + 2);
      Put((540 + Shown - 1) * 4 + 0);
    }
    if (this.EdTop > 0) {
      for (let I = 0; I <= DkCols - 1; I++) Put((540 + I) * 4 + 3);
      Put(540 * 4 + 1);
    }
    return M;
  }

  EditIds() {
    const N = Max(0, Min(EdPer, this.EdList.length - this.EdPageNo * EdPer));
    const Shown = Max(0, Min(DkCols * DkRows, this.EdEntries.length - this.EdTop * DkCols));
    const Bar = this.DkRowCount() > DkRows ? [580, 581] : [];
    return [...IRange(0, N - 1).map(I => 510 + I), ...IRange(0, Shown - 1).map(I => 540 + I), ...Bar, 530, 538, 531, 532, 537, 533, 534, 535, 536];
  }

  ShowCard(D) {
    this.EdBig.SetCard(this.Lib, D, D.Atk, D.Hp, D.Hp);
    this.EdBig.SetPrem(CardPremLevel(this.P(), D.Id));
    this.EdBig.SetShown(true);
    const In = CardCopies(this.EdCards, D.Id);
    this.EdHelp.SetText(Join([TdInfo(In, CardOwnedCount(this.P(), D.Id)), this.Lib.TextOf(D), this.Lib.HelpOf(D)], TxNewline));
  }

  OnHover(Id) {
    if (Id >= 510 && Id < 510 + EdPer) {
      const D = At(this.EdList, this.EdPageNo * EdPer + Id - 510);
      if (D) this.ShowCard(D);
    } else if (Id >= 540 && Id < 540 + DkCols * DkRows) {
      const CId = At(this.EdEntries, this.EdTop * DkCols + Id - 540);
      const D = CId !== undefined ? At(this.Lib.DB, CId) : undefined;
      if (D) this.ShowCard(D);
    }
  }

  AddCard(D) {
    const B = this.B;
    if (this.EdCards.length >= CardDeckSize) {
      B.Snd(SfxCancel);
      this.EdMsg.Set(TdFull);
    } else if (CardCopies(this.EdCards, D.Id) >= this.Allowed(D)) {
      B.Snd(SfxCancel);
      this.EdMsg.Set(CardCopies(this.EdCards, D.Id) >= CardDeckCopies ? TdMax3 : TdNoMore);
    } else {
      this.EdCards = [...this.EdCards, D.Id];
      B.Snd(SfxPlace);
      this.EdMsg.Set(TdAdded(D.Name));
    }
  }

  RemoveCard(Id) {
    let Done = false;
    const Out = [];
    for (const X of this.EdCards) {
      if (!Done && X === Id) Done = true; else Out.push(X);
    }
    this.EdCards = Out;
    this.B.Snd(SfxFlip);
    const D = At(this.Lib.DB, Id);
    if (D) this.EdMsg.Set(TdRemoved(D.Name));
  }

  // おまかせ: owned cards fill the deck up to 40 along a mana curve; the better cards (rarity, stats for the cost)
  // are picked more often, and most cards go in 2 or 3 at a time (legends / big finishers 1 or 2)
  AutoFill() {
    const Lib = this.Lib;
    let Guard = 0;
    while (true) {
      if (this.EdCards.length >= CardDeckSize || Guard > 200 || this.EdList.length === 0) break;
      Guard += 1;
      // the cost group that is the furthest below its share of the curve
      let BestB = -1;
      let BestGap = -99.0;
      for (let Bk = 1; Bk <= 7; Bk++) {
        const Have = this.EdCards.filter(Id => { const D = At(Lib.DB, Id); return D && AutoBucket(D.Cost) === Bk; }).length;
        const Room = this.EdList.filter(D => AutoBucket(D.Cost) === Bk && CardCopies(this.EdCards, D.Id) < this.Allowed(D)).length;
        if (Room > 0) {
          const Gap = ((At(AutoCurve, Bk) ?? 4) - Have) * 1.0 + GetRandomFloat(0.0, 0.9);
          if (Gap > BestGap) {
            BestGap = Gap;
            BestB = Bk;
          }
        }
      }
      if (BestB < 0) break;
      const Cands = this.EdList.filter(D => AutoBucket(D.Cost) === BestB && CardCopies(this.EdCards, D.Id) < this.Allowed(D));
      // a weighted draw: better cards are more likely
      let Total = 0.0;
      for (const D of Cands) Total += AutoScore(D);
      let Roll = GetRandomFloat(0.0, Total);
      let Pick = null;
      for (const D of Cands) {
        if (Pick === null) {
          Roll -= AutoScore(D);
          if (Roll <= 0.0) Pick = D;
        }
      }
      if (Pick === null && Cands.length > 0) Pick = Cands[Cands.length - 1];
      if (Pick !== null) {
        const D = Pick;
        const Want = AutoCopies(D);
        for (let K = 1; K <= Want; K++) {
          if (this.EdCards.length < CardDeckSize && CardCopies(this.EdCards, D.Id) < this.Allowed(D)) this.EdCards = [...this.EdCards, D.Id];
        }
      }
    }
    this.B.Snd(SfxShuffle);
    this.EdMsg.Set(this.EdCards.length >= CardDeckSize ? TdAutoDone : TdAutoShort);
  }

  // 専用 cards of an other character leave the deck when the character changes
  DropOthers() {
    const Kept = this.EdCards.filter(Id => { const D = At(this.Lib.DB, Id); return D && (D.HeroOnly < 0 || D.HeroOnly === this.EdHero); });
    if (Kept.length < this.EdCards.length) this.EdMsg.Set(TdDropped(this.EdCards.length - Kept.length));
    this.EdCards = Kept;
  }

  // デッキアイコン: one card of the deck, shown on the deck list instead of the character
  async PickIcon() {
    const B = this.B;
    const Choices = this.EdEntries.map(Id => At(this.Lib.DB, Id)).filter(D => D);
    if (Choices.length === 0) {
      B.Snd(SfxCancel);
      this.EdMsg.Set(TdIconEmpty);
      return;
    }
    B.Layer(this.EditSlot, false);
    const Got = await B.ChooseCard(Choices, TdIconTitle, TmBack, 0.0);
    B.Layer(this.EditSlot, true);
    const D = At(Choices, Got);
    if (D) {
      this.EdIcon = D.Id;
      B.Snd(SfxPlace);
      this.EdMsg.Set(TdIconSet(D.Name));
    }
    this.FillEdit();
  }

  async Edit(No) {
    const B = this.B;
    const D0 = CardDeckOf(this.P(), No);
    this.EdNo = No;
    this.EdHero = D0.Cards.length > 0 ? D0.Hero : GetCardSave(this.P()).Fav;
    this.EdCards = D0.Cards.slice();
    this.EdIcon = D0.Icon;
    this.EdPageNo = 0;
    this.EdTop = 0;
    this.MakePool();
    this.FillEdit();
    this.EdBig.SetShown(false);
    this.EdHelp.SetText(TdEditHelp);
    this.EdMsg.Set(TxEmpty);
    B.Layer(this.EditSlot, true);
    try {
      B.CurId = 510;
      while (true) {
        const Id = await B.PickPagedScroll(this.EditIds(), 510, 536, this.DkEdges());
        if (Id <= NavScroll && Id >= NavScroll - 3) {
          // the deck list scrolls one row (the cursor stays where it is)
          this.EdTop = Max(0, Min(this.DkMaxTop(), this.EdTop + ((Id === NavScroll || Id === NavScroll - 2) ? 1 : -1)));
          B.Snd(SfxFlip);
          this.FillEdit();
        } else if (Id === 580 || Id === 581) {
          const Old = this.EdTop;
          this.EdTop = Max(0, Min(this.DkMaxTop(), this.EdTop + (Id === 581 ? 1 : -1)));
          B.Snd(this.EdTop !== Old ? SfxFlip : SfxCancel);
          this.FillEdit();
        } else if (Id === NavPageNext || Id === NavEdgeNext || Id === 531) {
          this.EdPageNo += 1;
          if (this.EdPageNo * EdPer >= this.EdList.length) this.EdPageNo = 0;
          B.Snd(SfxFlip);
          this.FillEdit();
          if (Id === NavEdgeNext) B.CurId = 510;
        } else if (Id === NavPagePrev || Id === NavEdgePrev || Id === 530) {
          this.EdPageNo -= 1;
          if (this.EdPageNo < 0) this.EdPageNo = Max(0, Quotient(this.EdList.length - 1, EdPer));
          B.Snd(SfxFlip);
          this.FillEdit();
          if (Id === NavEdgePrev) B.CurId = 536;
        } else if (Id >= 510 && Id < 510 + EdPer) {
          const D = At(this.EdList, this.EdPageNo * EdPer + Id - 510);
          if (D) {
            this.AddCard(D);
            this.FillEdit();
            this.ShowCard(D);
          }
        } else if (Id >= 540 && Id < 540 + DkCols * DkRows) {
          const CId = At(this.EdEntries, this.EdTop * DkCols + Id - 540);
          if (CId !== undefined) {
            this.RemoveCard(CId);
            this.FillEdit();
            // the cursor stays on the list (the card may be gone)
            const Shown = Min(DkCols * DkRows, this.EdEntries.length - this.EdTop * DkCols);
            if (this.EdEntries.length === 0) B.CurId = 510;
            else if (Id - 540 >= Shown) B.CurId = 540 + Max(0, Shown - 1);
          }
        } else if (Id === 532) {
          const M = this.Menus;
          if (M) {
            B.Snd(SfxClick);
            B.Layer(this.EditSlot, false);
            const Picked = await M.CharSelect(true, 0.0, this.EdHero, false);
            M.CloseChar();
            B.Layer(this.EditSlot, true);
            if (Picked != null) {
              this.EdHero = Picked.Id;
              this.DropOthers();
              this.MakePool();
            }
            this.FillEdit();
            B.CurId = 532;
          }
        } else if (Id === 537) {
          await this.PickIcon();
          B.CurId = 537;
        } else if (Id === 538) {
          // 並び: コスト順 → レア度順 → あいうえお順 (back to the first page)
          this.EdSort = Mod(this.EdSort + 1, 3);
          this.EdPageNo = 0;
          B.Snd(SfxFlip);
          this.MakePool();
          this.FillEdit();
        } else if (Id === 533) {
          this.AutoFill();
          this.FillEdit();
        } else if (Id === 534) {
          this.EdCards = [];
          B.Snd(SfxCancel);
          this.EdMsg.Set(TdCleared);
          this.FillEdit();
        } else if (Id === 535) {
          CardSaveDeck(this.P(), this.EdNo, this.EdHero, this.EdCards, this.EdIcon);
          if (this.EdCards.length === CardDeckSize) CardSetDeckSel(this.P(), this.EdNo);
          B.Snd(SfxQuest);
          return;
        } else if (Id === 536) {
          const Old = CardDeckOf(this.P(), this.EdNo);
          const SameCards = Old.Cards.length === this.EdCards.length && Old.Cards.every((X, K) => X === this.EdCards[K]);
          const Same = SameCards && (Old.Hero === this.EdHero || Old.Cards.length === 0) && Old.Icon === this.EdIcon;
          if (Same) {
            B.Snd(SfxCancel);
            return;
          }
          const M = this.Menus;
          if (M) {
            const Sure = await M.AskWith(TdAskDiscard, TdYesDiscard);
            if (Sure) {
              B.Snd(SfxCancel);
              return;
            }
          }
        }
      }
    } finally {
      B.Layer(this.EditSlot, false);
    }
  }

  // ------------------------------------------------------------ characters and costumes (着せ替え)
  FillChar() {
    const P = this.P();
    this.ChTiles.forEach((T, I) => {
      const H0 = At(this.Lib.Heroes, I);
      if (!H0) return;
      T.SetImage(CardHeroPic(P, H0));
      const Tn = At(this.ChTileNames, I);
      if (Tn) Tn.Set(CardHeroName(P, H0));
    });
    this.ChMarks.forEach((Mk, I) => Show(Mk.Root, I === this.ChHero));
    const H = this.Hero(this.ChHero);
    // (a costume being previewed: its picture, name and description, even when it isn't owned)
    const Pv = CardSkinById(this.ChPreview);
    if (Pv != null && Pv.Hero === this.ChHero) {
      this.ChPic.SetImage(Pv.Pic);
      this.ChName.Set(Pv.Name);
      this.ChRace.SetText(Pv.Race);
    } else {
      this.ChPic.SetImage(CardHeroPic(P, H));
      this.ChName.Set(CardHeroName(P, H));
      this.ChRace.SetText(CardHeroRace(P, H));
    }
    this.ChJewel.SetText(TdJewel(H.JewelName, H.Cost, JewelText(this.Lib.DB, H)));
    const Skins = CardSkinsOf(this.ChHero);
    const Cur = CardSkinOf(P, this.ChHero);
    // the first tile is the character's own look, then its costumes
    this.ChSkinPics.forEach((Pic, K) => {
      const Nm = At(this.ChSkinNames, K), St = At(this.ChSkinStates, K), Gl = At(this.ChSkinGlows, K), Rt = At(this.ChSkinRoots, K);
      if (!Nm || !St || !Gl || !Rt) return;
      const Sk = K > 0 ? At(Skins, K - 1) : undefined;
      if (K === 0) {
        Rt.Set(Skins.length > 0);
        Pic.SetImage(H.Pic);
        Pic.SetTint(CWhite);
        Nm.Set(H.Name);
        St.Set(Cur === 0 ? TmInUse : TxEmpty);
        Show(Gl, Cur === 0);
      } else if (Sk) {
        Rt.Set(true);
        const Has = CardHasSkin(P, Sk.Id);
        // not owned: drawn in black and white
        Pic.SetImage(Has ? Sk.Pic : Sk.Gray);
        Pic.SetTint(CWhite);
        Nm.Set(Sk.Name);
        const Previewing = !Has && this.ChPreview === Sk.Id;
        St.Set(Previewing ? TdPreviewing : !Has ? TdNotOwnedSkin : Cur === Sk.Id ? TmInUse : TxEmpty);
        St.SetColor(Previewing ? CBlue : !Has ? CGrey : CGold);
        Show(Gl, (Has && Cur === Sk.Id) || Previewing);
      } else {
        Rt.Set(false);
      }
    });
    Show(this.ChSkinNone.Root, Skins.length === 0);
  }

  CharIds() {
    const N = CardSkinsOf(this.ChHero).length;
    return [...this.Lib.Heroes.map((H, I) => 720 + I), ...(N > 0 ? IRange(0, N).map(K => 730 + K) : []), 739];
  }

  // the title's character panel: pick the character to show (使用キャラクター) and its costume
  async CharDetail() {
    const B = this.B;
    this.ChHero = GetCardSave(this.P()).Fav;
    this.ChPreview = -1;
    this.ChMsg.Set(TdCharHelp);
    this.FillChar();
    B.Snd(SfxOpen);
    B.Layer(this.CharDSlot, true);
    try {
      B.CurId = 720 + this.ChHero;
      while (true) {
        const Id = await B.Pick(this.CharIds(), 720 + this.ChHero, 739);
        if (Id === 739) {
          B.Snd(SfxCancel);
          return;
        }
        if (Id >= 720 && Id <= 727) {
          this.ChHero = Id - 720;
          this.ChPreview = -1;
          CardSetFav(this.P(), this.ChHero);
          B.Snd(SfxClick);
          this.ChMsg.Set(CardSkinsOf(this.ChHero).length > 0 ? TdHasSkins : TdCharHelp);
          this.FillChar();
          // a character with costumes: the cursor goes to them
          if (CardSkinsOf(this.ChHero).length > 0) B.CurId = 730;
        } else if (Id >= 730 && Id <= 733) {
          const K = Id - 730;
          const Sk = K > 0 ? At(CardSkinsOf(this.ChHero), K - 1) : undefined;
          if (K === 0) {
            this.ChPreview = -1;
            const Reset = CardSetSkin(this.P(), this.ChHero, 0);
            if (Reset) B.Snd(SfxPlace);
            this.ChMsg.Set(TdSkinSet(this.Hero(this.ChHero).Name));
          } else if (Sk) {
            const Done = CardSetSkin(this.P(), this.ChHero, Sk.Id);
            if (Done) {
              this.ChPreview = -1;
              B.Snd(SfxPremium);
              this.ChMsg.Set(TdSkinSet(Sk.Name));
            } else {
              // not owned: it can still be looked at (picture, name, description), it just isn't worn
              this.ChPreview = Sk.Id;
              B.Snd(SfxSelect);
              this.ChMsg.Set(TdSkinPreview(Sk.Name));
            }
          }
          this.FillChar();
        }
      }
    } finally {
      B.Layer(this.CharDSlot, false);
    }
  }
}

// ---------------------------------------------------------------- おまかせ (auto fill)
// cards per cost group (1: cost 0-1, ..., 7: cost 7+), 40 in all
const AutoCurve = [0, 5, 7, 7, 7, 5, 4, 5];
function AutoBucket(Cost) { return Max(1, Min(7, Cost)); }

// how good a card looks: its rarity and its stats for the cost (spells and amulets count as average)
function AutoScore(D) {
  const R = D.Rarity === RarL ? 3.0 : D.Rarity === RarE ? 2.3 : D.Rarity === RarR ? 1.6 : 1.0;
  const Stats = (D.IsSpell || D.Amulet) ? 1.0 : (D.Atk + D.Hp) * 1.0 / (Max(1, D.Cost) * 2.0 + 1.0);
  const Effect = (D.Cry.K !== fx_kind.None || D.Evo.K !== fx_kind.None || D.TurnStart.K !== fx_kind.None) ? 0.3 : 0.0;
  return R * (0.6 + Min(1.6, Stats) + Effect);
}

// copies put in at once: legends 1 (sometimes 2), epics and big finishers 2 (sometimes 1), the rest 2 or 3
function AutoCopies(D) {
  const X = GetRandomInt(1, 100);
  if (D.Rarity === RarL) return X <= 25 ? 2 : 1;
  if (D.Cost >= 7) return X <= 40 ? 1 : 2;
  if (D.Rarity === RarE) return X <= 20 ? 3 : 2;
  return X <= 50 ? 3 : 2;
}

// ---------------------------------------------------------------- building the screens
function MakeDeckUI(B, Lib) {
  // ---- battle mode
  const MB0 = MBtn(B, 125, BtnGold, TdModeDeck, 300.0, 300.0, 620.0, 200.0, 46.0);
  const MB1 = MBtn(B, 126, BtnPurple, TdMode2Pick, 1000.0, 300.0, 620.0, 200.0, 46.0);
  const MB2 = MBtn(B, 127, BtnEnd, TmBack, 810.0, 840.0, 300.0, 80.0, 30.0);
  const ModeSub = OText(TxEmpty, 26.0, CCream, CInk);
  // 無限の塔 (CPU only): a wide button with the record next to it
  const MB3 = MBtn(B, 128, BtnBlue, TdModeTower, 300.0, 660.0, 620.0, 140.0, 46.0);
  const ModeTowerRec = OText(TxEmpty, 30.0, CGold, CInk);
  const ModeTowerRun = OText(TxEmpty, 22.0, CGreen, CInk);
  const TowerRow = new canvas({
    Slots: [
      MB3[0],
      RPinL(ModeTowerRec.Root, 1010.0, 676.0, 2),
      RPinL(ModeTowerRun.Root, 1010.0, 714.0, 2),
      RBox(TxtWrap(TdModeTowerHelp, 20.0, CBrown, 600.0), 1010.0, 736.0, 600.0, 80.0, 2),
    ],
  });
  const ModeRoot = new canvas({
    Slots: [
      MakeOverlayDim(0.75),
      RBox(Tex(CardGui.T_PanelLog, 1500.0, 840.0), 210.0, 120.0, 1500.0, 840.0, 1),
      RPin(OText(TdModeTitle, 44.0, CGold, CInk).Root, 960.0, 190.0, 2),
      RPin(ModeSub.Root, 960.0, 252.0, 2),
      MB0[0],
      MB1[0],
      RBox(TxtWrap(TdModeDeckHelp, 22.0, CBrown, 600.0), 310.0, 530.0, 600.0, 110.0, 2),
      RBox(TxtWrap(TdMode2PickHelp, 22.0, CBrown, 600.0), 1010.0, 530.0, 600.0, 110.0, 2),
      RFull(TowerRow, 3),
      MB2[0],
    ],
  });
  const ModeSlot = RFull(ModeRoot, 97);
  const ModeTowerSw = MakeSw(TowerRow, false);
  // ---- the deck list (8 decks)
  const ListTitle = OText(TxEmpty, 40.0, CGold, CInk);
  const ListTimer = OText(TxEmpty, 32.0, CGold, CInk);
  const ListMsg = OText(TxEmpty, 24.0, CWhite, CInk);
  let LS = [MakeOverlayDim(1.0), RBox(Tex(CardGui.T_TitleBg, 1920.0, 1080.0), 0.0, 0.0, 1920.0, 1080.0, 1), MakeOverlayDim(0.4)];
  LS = [...LS, RPin(ListTitle.Root, 960.0, 70.0, 3), RPin(ListTimer.Root, 1720.0, 70.0, 3), RPin(ListMsg.Root, 960.0, 880.0, 3)];
  const DSlots = [];
  for (let I = 0; I <= CardMaxDecks - 1; I++) {
    const X = 110.0 + Mod(I, 4) * 430.0;
    const Y = 140.0 + Quotient(I, 4) * 350.0;
    const G = TexTint(CardGui.T_GlowCard, 440.0, 340.0, CGold);
    Show(G, false);
    const Pic = Tex(CardGui.T_CardBack, 150.0, 150.0);
    const Nm = OText(TxEmpty, 30.0, CWhite, CInk);
    const HN = OText(TxEmpty, 22.0, CCream, CInk);
    const Ct = OText(TxEmpty, 26.0, CGold, CInk);
    const St = OText(TxEmpty, 22.0, CGreen, CInk);
    const Fc = MakeCardFace(0.9, null);
    Fc.SetShown(false);
    DSlots.push(new deck_slot({ Pic, Face: Fc, Name: Nm, HeroName: HN, Count: Ct, State: St, Glow: G }));
    const Panel = new canvas({
      Slots: [
        Box(G, -20.0, -20.0, 440.0, 340.0, 0),
        Box(Tex(CardGui.T_PanelChar, 400.0, 300.0), 0.0, 0.0, 400.0, 300.0, 1),
        Box(Pic, 22.0, 70.0, 150.0, 150.0, 2),
        Box(Fc.Root, 28.0, 66.0, 135.0, 192.6, 2),
        Pin(Nm.Root, 200.0, 36.0, 3),
        PinL(HN.Root, 190.0, 110.0, 3),
        PinL(Ct.Root, 190.0, 160.0, 3),
        PinL(St.Root, 190.0, 210.0, 3),
        Box(MenuHit(B, 500 + I), 0.0, 0.0, 400.0, 300.0, 10),
      ],
    });
    LS.push(RBox(Panel, X, Y, 400.0, 300.0, 4));
    B.AddBounds(500 + I, { X, Y, W: 400.0, H: 300.0 });
  }
  const LB = MBtn(B, 509, BtnBlue, TmBack, 810.0, 930.0, 300.0, 80.0, 30.0);
  LS.push(RPin(Txt(TmHint, 20.0, CCream), 960.0, 1040.0, 3));
  const ListCanvas = new canvas({ Slots: LS });
  const ListSlot = RFull(ListCanvas, 93);
  // ---- the editor
  const EdTitle = OText(TxEmpty, 34.0, CGold, CInk);
  const EdHeroPic = Tex(CardGui.T_HeroMe, 76.0, 76.0);
  const EdHeroName = OText(TxEmpty, 26.0, CWhite, CInk);
  const EdCount = OText(TxEmpty, 44.0, CGold, CInk);
  const EdPageTxt = OText(TxEmpty, 22.0, CWhite, CInk);
  const EdMsg = OText(TxEmpty, 24.0, CGold, CInk);
  const ES = [MakeOverlayDim(1.0), RBox(Tex(CardGui.T_TitleBg, 1920.0, 1080.0), 0.0, 0.0, 1920.0, 1080.0, 1), MakeOverlayDim(0.55)];
  ES.push(
    RPinL(EdTitle.Root, 40.0, 58.0, 3),
    RBox(EdHeroPic, 560.0, 20.0, 76.0, 76.0, 3),
    RPinL(EdHeroName.Root, 650.0, 58.0, 3),
    RPin(EdCount.Root, 1226.0, 60.0, 3),
    RPin(OText(TdDeckList, 20.0, CCream, CInk).Root, 1226.0, 112.0, 3),
    RPin(EdPageTxt.Root, 485.0, 866.0, 3),
    RPin(EdMsg.Root, 960.0, 1040.0, 4),
    RBox(new color_block({ DefaultColor: color(0.0, 0.0, 0.0), DefaultOpacity: 0.45 }), 980.0, 124.0, 492.0, 676.0, 2),
  );
  const EdPool = [];
  for (let I = 0; I <= EdPer - 1; I++) {
    const GC = MakeGridCard(0.9, MenuHit(B, 510 + I));
    EdPool.push(GC[0]);
    ES.push(RBox(GC[1], EdX(I), EdY(I), 135.0, 192.6, 4));
    B.AddBounds(510 + I, { X: EdX(I), Y: EdY(I), W: 135.0, H: 192.6 });
  }
  // the deck list: small cards with the number of copies (pick one to take a copy out)
  const EdRows = [];
  const EdRowSws = [];
  const DkW = 150.0 * DkScale;
  const DkH = 214.0 * DkScale;
  for (let I = 0; I <= DkCols * DkRows - 1; I++) {
    const GC = MakeGridCard(DkScale, MenuHit(B, 540 + I));
    EdRows.push(GC[0]);
    EdRowSws.push(MakeSw(GC[1], false));
    ES.push(RBox(GC[1], DkX(I), DkY(I), DkW, DkH, 4));
    B.AddBounds(540 + I, { X: DkX(I), Y: DkY(I), W: DkW, H: DkH });
  }
  // the scroll bar (the thumb is put on the track by FillEdit)
  const EdThumb = new color_block({ DefaultColor: CGold, DefaultOpacity: 0.9 });
  const EdTrack = new canvas({ Slots: [Box(new color_block({ DefaultColor: color(0.02, 0.015, 0.01), DefaultOpacity: 0.85 }), 0.0, 0.0, 14.0, DkTrackH, 0)] });
  const SU = MBtn(B, 580, BtnBlue, PsArrowU, DkTrackX - 9.0, 124.0, 32.0, 40.0, 16.0);
  const SD = MBtn(B, 581, BtnBlue, PsArrowD, DkTrackX - 9.0, 752.0, 32.0, 40.0, 16.0);
  const TrackRoot = new canvas({ Slots: [Box(EdTrack, 0.0, 0.0, 14.0, DkTrackH, 0)] });
  ES.push(RBox(TrackRoot, DkTrackX, DkTrackY, 14.0, DkTrackH, 4), SU[0], SD[0]);
  const EdScrollSws = [MakeSw(TrackRoot, false), MakeSw(SU[1].Root, false), MakeSw(SD[1].Root, false)];
  const EdBig = MakeCardFace(1.3, null);
  EdBig.SetShown(false);
  const EdHelp = new text_block({ DefaultText: TxEmpty, DefaultTextColor: CCream, DefaultTextSize: 15.0, DefaultJustification: text_justification.Left, AutoWrap: true, WrapWidth: 400.0 });
  ES.push(
    RBox(EdBig.Root, 1585.0, 124.0, 195.0, 278.2, 4),
    RBox(new color_block({ DefaultColor: color(0.05, 0.03, 0.02), DefaultOpacity: 0.6 }), 1482.0, 414.0, 416.0, 470.0, 3),
    RBox(EdHelp, 1490.0, 420.0, 404.0, 460.0, 4),
  );
  const EP = MBtn(B, 530, BtnBlue, TbPrev, 150.0, 834.0, 200.0, 64.0, 24.0);
  const EN = MBtn(B, 531, BtnBlue, TbNext, 620.0, 834.0, 200.0, 64.0, 24.0);
  const EH = MBtn(B, 532, BtnPurple, TdChangeHero, 840.0, 22.0, 240.0, 66.0, 22.0);
  const EI = MBtn(B, 537, BtnPurple, TdIconBtn, 1490.0, 22.0, 280.0, 66.0, 22.0);
  const EA = MBtn(B, 533, BtnBlue, TdAuto, 40.0, 930.0, 320.0, 80.0, 26.0);
  const EC = MBtn(B, 534, BtnEnd, TdClear, 380.0, 930.0, 300.0, 80.0, 26.0);
  const ESv = MBtn(B, 535, BtnGold, TdSave, 1240.0, 930.0, 300.0, 80.0, 30.0);
  const EB = MBtn(B, 536, BtnBlue, TmBack, 1570.0, 930.0, 300.0, 80.0, 30.0);
  const ESo = MBtn(B, 538, BtnPurple, TmSortCost, 720.0, 930.0, 320.0, 80.0, 24.0);
  ES.push(EP[0], EN[0], EH[0], EI[0], EA[0], EC[0], ESv[0], EB[0], ESo[0]);
  const EditSlot = RFull(new canvas({ Slots: ES }), 94);
  // ---- characters and costumes
  const CS = [MakeOverlayDim(0.85), RBox(Tex(CardGui.T_PanelLog, 1740.0, 940.0), 90.0, 70.0, 1740.0, 940.0, 1)];
  CS.push(RPin(OText(TdCharTitle, 40.0, CGold, CInk).Root, 960.0, 130.0, 2));
  const ChTiles = [];
  const ChMarks = [];
  const ChTileNames = [];
  Lib.Heroes.forEach((H, I) => {
    const X = 150.0 + Mod(I, 4) * 200.0;
    const Y = 200.0 + Quotient(I, 4) * 270.0;
    const T = Tex(H.Pic, 180.0, 180.0);
    const Mk = OText(TmInUse, 20.0, CWhite, CRed);
    const Tn = OText(H.Name, 22.0, CWhite, CInk);
    ChTileNames.push(Tn);
    ChTiles.push(T);
    ChMarks.push(Mk);
    CS.push(
      RBox(T, X, Y, 180.0, 180.0, 3),
      RPin(Tn.Root, X + 90.0, Y + 206.0, 3),
      RPin(Mk.Root, X + 90.0, Y + 10.0, 4),
      RBox(MenuHit(B, 720 + I), X, Y, 180.0, 230.0, 6),
    );
    B.AddBounds(720 + I, { X, Y, W: 180.0, H: 230.0 });
  });
  const ChPic = Tex(CardGui.T_HeroMe, 240.0, 240.0);
  const ChName = OText(TxEmpty, 40.0, CWhite, CInk);
  const ChRace = TxtDark(TxEmpty, 22.0);
  const ChJewel = TxtWrap(TxEmpty, 20.0, CBrown, 520.0);
  CS.push(
    RBox(ChPic, 980.0, 180.0, 240.0, 240.0, 3),
    RPinL(ChName.Root, 1250.0, 220.0, 3),
    RPinL(ChRace, 1252.0, 270.0, 3),
    RBox(ChJewel, 1250.0, 300.0, 520.0, 130.0, 3),
    RPinL(OText(TdSkinTitle, 28.0, CGold, CInk).Root, 980.0, 470.0, 3),
  );
  const ChSkinPics = [];
  const ChSkinNames = [];
  const ChSkinStates = [];
  const ChSkinGlows = [];
  const ChSkinRoots = [];
  for (let K = 0; K <= 3; K++) {
    const X = 980.0 + K * 210.0;
    const Pic = Tex(CardGui.T_HeroMe, 180.0, 180.0);
    const Nm = OText(TxEmpty, 20.0, CWhite, CInk);
    const St = OText(TxEmpty, 20.0, CGold, CInk);
    const Gl = TexTint(CardGui.T_GlowCard, 220.0, 280.0, CGold);
    Show(Gl, false);
    const Rt = new canvas({
      Slots: [
        Box(Gl, -20.0, -20.0, 220.0, 280.0, 0),
        Box(Pic, 0.0, 0.0, 180.0, 180.0, 1),
        Pin(Nm.Root, 90.0, 202.0, 2),
        Pin(St.Root, 90.0, 230.0, 2),
        Box(MenuHit(B, 730 + K), 0.0, 0.0, 180.0, 240.0, 5),
      ],
    });
    ChSkinPics.push(Pic);
    ChSkinNames.push(Nm);
    ChSkinStates.push(St);
    ChSkinGlows.push(Gl);
    ChSkinRoots.push(MakeSw(Rt, false));
    CS.push(RBox(Rt, X, 510.0, 180.0, 240.0, 3));
    B.AddBounds(730 + K, { X, Y: 510.0, W: 180.0, H: 240.0 });
  }
  const ChSkinNone = OText(TdNoSkins, 24.0, CCream, CInk);
  const ChMsg = OText(TxEmpty, 24.0, CWhite, CInk);
  const CB = MBtn(B, 739, BtnBlue, TmBack, 810.0, 900.0, 300.0, 80.0, 30.0);
  CS.push(RPinL(ChSkinNone.Root, 990.0, 600.0, 3), RPin(ChMsg.Root, 960.0, 850.0, 3), CB[0]);
  const CharDSlot = RFull(new canvas({ Slots: CS }), 96);
  const D = new deck_ui({
    B, Lib, ModeSlot, ModeSub, ModeTowerSw, ModeTowerRec, ModeTowerRun, ListSlot, ListCanvas, ListTitle, ListTimer, ListMsg,
    ListBackSlot: LB[0],
    DSlots, EditSlot, EdTitle, EdHeroPic, EdHeroName, EdCount, EdPageTxt, EdMsg, EdPool, EdRows, EdRowSws,
    EdTrack, EdThumb, EdScrollSws, EdBig, EdHelp,
    EdSortBtn: ESo[1],
    CharDSlot, ChTiles, ChTileNames, ChMarks, ChPic, ChName, ChRace, ChJewel, ChSkinPics, ChSkinNames, ChSkinStates,
    ChSkinGlows, ChSkinRoots, ChSkinNone, ChMsg,
  });
  B.AnimFaces = [...B.AnimFaces, ...EdPool.map(G => G.Face), EdBig, ...DSlots.map(S => S.Face)];
  return D;
}

// ---------------------------------------------------------------- texts
const TdModeTitle = "対戦モードをえらんでね";
const TdModeDeck = "通常（デッキ）";
const TdMode2Pick = "2Pick";
const TdModeDeckHelp = "デッキ構築で作ったデッキで対戦！デッキを選んでからキャラクターを選ぶよ（デッキのキャラが最初に選ばれている）。";
const TdMode2PickHelp = "その場でデッキを作る！キャラクターを選んで、2枚組のカードを20回選んで40枚のデッキを作るよ。";
const TdModeTower = "無限の塔";
const TdModeTowerHelp = "1階から勝ち抜き！HPは次の階に持ち越し。負けるまで続くよ。勝つたびにカードの報酬！";
const TdCpuMode = "CPUと対戦";
const TdRoomMode = "部屋を作る（相手も同じモードで対戦します）";
function TdDeckNo(N) { return `デッキ${N}`; }
const TdEmptyDeck = "（からっぽ）";
const TdNew = "えらぶと作れるよ";
function TdCount(A, B) { return `${A} / ${B}枚`; }
const TdReady = "使用できます";
const TdNotFull = "40枚になっていません";
const TdTooMany = "同じカードが多すぎます";
const TdShort = "カードが足りません";
const TdPickTitle = "使うデッキをえらんでね";
const TdPickHelp = "40枚そろったデッキで対戦できるよ";
function TdPicked(N) { return `デッキ${N}で対戦！`; }
const TdWaitOpp = "デッキ決定！相手を待っています…";
const TdCantUse = "このデッキはまだ使えないよ（デッキ構築で40枚そろえてね）";
const TdBuildTitle = "デッキ構築";
const TdBuildHelp = "作りたい・直したいデッキをえらんでね（最大8つ）";
function TdEditTitle(N) { return `デッキ構築　デッキ${N}`; }
const TdDeckList = "デッキのカード（選ぶと1枚はずす）";
function TdOwned(N) { return `所持${N}`; }
function TdInDeck(N) { return `×${N}`; }
function TdInfo(A, B) { return `デッキに${A}枚　（所持${B}枚・同じカードは3枚まで）`; }
const TdEditHelp = "左のカードを選ぶとデッキに1枚入る。右のリストを選ぶと1枚はずれる。\n40枚そろえて「保存する」を押してね。\nコントローラー：LT/RTで上下に移動（いちばん上・下でページ切り替え）。";
const TdFull = "デッキはもう40枚だよ";
const TdMax3 = "同じカードは3枚までだよ";
const TdNoMore = "持っている枚数より多くは入れられないよ";
function TdAdded(N) { return `「${N}」を入れた`; }
function TdRemoved(N) { return `「${N}」をはずした`; }
const TdAutoDone = "おまかせで40枚にしたよ";
const TdAutoShort = "持っているカードが足りなくて40枚にできなかったよ";
function TdDropped(N) { return `ほかのキャラ専用のカード${N}枚をはずしたよ`; }
const TdCleared = "カードを全部はずしたよ";
const TdChangeHero = "キャラ変更";
const TdIconBtn = "デッキアイコン";
const TdIconTitle = "デッキアイコンにするカードをえらんでね";
const TdIconEmpty = "先にデッキにカードを入れてね";
function TdIconSet(N) { return `「${N}」をデッキアイコンにしたよ（保存すると反映）`; }
const TdAuto = "おまかせ補充";
const TdClear = "全部はずす";
const TdSave = "保存する";
const TdAskDiscard = "変更を保存せずに戻りますか？";
const TdYesDiscard = "戻る";
const TdCharTitle = "キャラクター";
const TdCharHelp = "キャラクターをえらぶとタイトルの「使用キャラクター」になるよ";
const TdHasSkins = "着せ替えをえらんでね";
function TdJewel(J, C, T) { return `ジュエル【${J}】マナ${C}\n${T}`; }
const TdSkinTitle = "着せ替え";
const TdNoSkins = "このキャラクターの着せ替えはまだないよ";
const TdNotOwnedSkin = "未所持";
function TdSkinSet(N) { return `「${N}」に着せ替えたよ！`; }
function TdSkinLocked(N) { return `「${N}」はまだ持っていないよ`; }
const TdPreviewing = "プレビュー中";
function TdSkinPreview(S) { return `「${S}」は持っていないので見るだけだよ（手に入れると着せ替えできるよ）`; }
