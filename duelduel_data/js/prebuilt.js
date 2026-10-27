// prebuilt.js (10/27 update, web only — no Verse file): the shop's 構築済みデッキ tab.
// Three ready-made 40-card decks for PrePrice gems each; a player who never got one gets the first one free.
// Getting one adds its 40 cards to the collection and, when a deck slot is empty, saves it there as a deck
// (its character and icon card). The purchase screen shows the whole card list (cost order, monsters first)
// with the big card and its text of the picked / hovered card.
// Save field: PreBought (save.js) — how many times each deck was got (index in PreDecks).
// Click ids: tab 3110 (menus.js), deck buttons 3111..3113, purchase screen: yes 3120, no 3121, OK 3122,
// its card list 3130..3150.
'use strict';

// ---------------------------------------------------------------- texts
const TpTab = "構築済みデッキ";
const TpNameFast = "速攻デッキ";
const TpNameBig = "大型デッキ";
const TpNameSpell = "スペルデッキ";
const TpDescFast = "軽いモンスターとダメージスペルで、序盤から一気に攻めきる！ 速攻とダメージでたたみかけるデッキ。";
const TpDescBig = "マナを増やして守りを固め、強力な大型モンスターで逆転する！ 後半に強いデッキ。";
const TpDescSpell = "たくさんのスペルとまほうの仲間たちで戦う！ スペルで盤面をあやつるテクニカルなデッキ。";
function TpPrice(G) { return `${G}ジェム`; }
const TpFree = "無料でもらう！";
function TpHero(N) { return `キャラクター：${N}`; }
function TpMonSpell(M, S) { return `モンスター${M}枚・スペル${S}枚`; }
const TpCards40 = "40枚入り";
function TpSub(H, M, S) { return `キャラクター：${H}　　40枚（モンスター${M}枚・スペル${S}枚）`; }
function TpGotTimes(N) { return `入手済み（${N}回）`; }
const TpHelpFree = "はじめての方は、好きなデッキを1つ無料でもらえるよ！ カードはコレクションに入り、デッキに空きがあれば自動でデッキに登録されるよ。";
const TpHelpPaid = "カードはコレクションに入り、デッキに空きがあれば自動でデッキに登録されるよ。";
const TpHello = "すぐに使えるデッキだよ！";
const TpAskPaid = "本当に買いますか？";
const TpAskFree = "このデッキを無料でもらいますか？（無料は1回だけ）";
function TpYesPaid(G) { return `${G}ジェムで買う`; }
const TpYesFree = "無料でもらう";
const TpListHelp = "カードを選ぶと、くわしい効果が見られるよ。";
function TpSlotNote(N) { return N > 0 ? `デッキ${N}が空いているので、自動でデッキに登録されます。` : "デッキに空きがないため、デッキは登録されません（カードはコレクションに入ります）。"; }
function TpGot(N) { return `${N}を手に入れた！`; }
function TpGotSlot(N) { return `40枚のカードをコレクションに追加して、デッキ${N}に登録したよ！`; }
const TpGotNoSlot = "40枚のカードをコレクションに追加したよ！（デッキに空きがないので、デッキ構築で作ってね）";
function TpThanksSlot(N) { return `まいどあり！ デッキ構築のデッキ${N}ですぐに使えるよ`; }
const TpThanks = "まいどあり！ カードはコレクションに追加したよ";
const TpOk = "OK";

// ---------------------------------------------------------------- the decks
class prebuilt_deck {
  constructor(o = {}) {
    this.Name = o.Name;
    this.Desc = o.Desc;
    this.Hero = o.Hero;          // the character of the deck saved in a deck slot (hero id)
    this.Icon = o.Icon;          // the card shown for the deck (shop / deck list)
    this.List = o.List;          // [card id, copies]
  }
}

const PrePrice = 500;
const PreDecks = [
  // 速攻: ゼノ (宝石: 自分のプレイヤーの攻撃力+2) — fast damage
  new prebuilt_deck({
    Name: TpNameFast, Desc: TpDescFast, Hero: 2, Icon: 421, List: [
      [53, 2], [213, 2], [238, 2], [38, 2], [407, 2], [44, 2], [307, 2], [200, 2], [299, 2], [388, 2], [386, 2],
      [28, 2], [40, 1], [376, 2], [191, 2], [138, 2], [421, 2], [286, 2], [97, 1], [451, 2], [5, 2]],
  }),
  // 大型: キング (宝石: シールド) — holds on until the big monsters come
  new prebuilt_deck({
    Name: TpNameBig, Desc: TpDescBig, Hero: 4, Icon: 36, List: [
      [409, 2], [295, 2], [438, 2], [407, 2], [445, 1], [114, 2], [263, 2], [39, 2], [385, 2], [428, 2], [410, 1],
      [360, 2], [283, 2], [76, 2], [36, 2], [406, 2], [157, 2], [365, 2], [375, 2], [188, 2], [332, 2]],
  }),
  // スペル: マジシャン (宝石: ランダムな敵に1ダメージ×2) — spells
  new prebuilt_deck({
    Name: TpNameSpell, Desc: TpDescSpell, Hero: 6, Icon: 257, List: [
      [503, 2], [50, 2], [358, 2], [201, 2], [28, 2], [33, 2], [436, 2], [409, 2], [412, 2], [407, 2], [198, 2],
      [44, 2], [197, 2], [466, 2], [257, 2], [42, 2], [265, 2], [80, 2], [258, 2], [266, 2]],
  }),
];

// the 40 card ids of deck K
function PreDeckCards(K) {
  const Dk = At(PreDecks, K);
  const Out = [];
  if (Dk) for (const [Id, N] of Dk.List) for (let I = 0; I < N; I++) Out.push(Id);
  return Out;
}

// the cards of deck K, one entry per card: cost order, monsters before spells / amulets inside a cost
function PreDeckList(DB, K) {
  const Dk = At(PreDecks, K);
  if (!Dk) return [];
  const L = Dk.List.map(([Id, N]) => [At(DB, Id), N]).filter(E => E[0]);
  L.sort((A, B) => (A[0].Cost - B[0].Cost) || ((A[0].IsMonster() ? 0 : 1) - (B[0].IsMonster() ? 0 : 1)) || (A[0].Id - B[0].Id));
  return L;
}

// [monsters, spells + amulets] of deck K
function PreDeckMix(DB, K) {
  let M = 0, S = 0;
  for (const [D, N] of PreDeckList(DB, K)) {
    if (D.IsMonster()) M += N;
    else S += N;
  }
  return [M, S];
}

// ---------------------------------------------------------------- the save
function CardPreTimes(P, K) { return At(GetCardSave(P).PreBought, K) ?? 0; }

// the first prebuilt deck is free (never got one before)
function CardPreFree(P) { return GetCardSave(P).PreBought.every(N => N <= 0); }

// the first empty deck slot (-1: none)
function CardEmptyDeckSlot(P) {
  for (let I = 0; I <= CardMaxDecks - 1; I++) if (CardDeckOf(P, I).Cards.length === 0) return I;
  return -1;
}

// pays (or uses the free one) and gives deck K: its cards, and the deck in the first empty slot.
// null when the gems are not enough, else { Free, Slot } (Slot -1: no empty slot)
function CardBuyPrebuilt(P, DB, K) {
  const Dk = At(PreDecks, K);
  if (!Dk) return null;
  const E = CardEdit(P);
  const Free = E.PreBought.every(N => N <= 0);
  if (!Free) {
    if (E.Gems < PrePrice) return null;
    E.Gems -= PrePrice;
    E.QGemsUsed += PrePrice;
  }
  const Cards = PreDeckCards(K);
  for (const Id of Cards) AddOwned(E, Id);
  const Bt = E.PreBought.slice();
  while (Bt.length <= K) Bt.push(0);
  Bt[K] += 1;
  E.PreBought = Bt;
  let Slot = -1;
  for (let I = 0; I <= CardMaxDecks - 1; I++) {
    const D = At(E.Decks, I);
    if (!D || D.Cards.length === 0) { Slot = I; break; }
  }
  if (Slot >= 0) {
    const Ds = E.Decks.slice();
    while (Ds.length <= Slot) Ds.push(new card_deck());
    Ds[Slot] = new card_deck({ Hero: Dk.Hero, Cards: Cards, Icon: Dk.Icon });
    E.Decks = Ds;
  }
  CardCommit(P, E);
  return { Free, Slot };
}

// ---------------------------------------------------------------- the screens
const PreCols = 7;
const PreGridMax = 21;
const PreGridScale = 0.8;
function PreGX(I) { return 100.0 + Mod(I, PreCols) * 134.0; }
function PreGY(I) { return 236.0 + Quotient(I, PreCols) * 204.0; }

class pre_cell {
  constructor(o) { this.Btn = o.Btn; this.State = o.State; this.Glow = o.Glow; }
}

class prebuilt_ui {
  constructor(o) {
    Object.assign(this, o);
    this.Open = -1;        // the deck on the purchase screen (-1: closed)
    this.List = [];        // its cards ([card_def, copies])
    this.Sel = null;       // the card shown big
  }

  P() { return this.B.P; }

  CloseAll() { this.B.Layer(this.ConfSlot, false); this.Open = -1; }

  Ids() { return PreDecks.map((Dk, K) => 3111 + K); }

  // the shop tab: prices (free for the first one) and how often each deck was got
  Fill() {
    const Free = CardPreFree(this.P());
    this.Cells.forEach((C, K) => {
      C.Btn.Label.Set(Free ? TpFree : TpPrice(PrePrice));
      C.Btn.Face.SetImage(BtnTex(Free ? BtnGold : BtnPurple, 400.0, 86.0));
      Show(C.Btn.Glow, Free);
      const N = CardPreTimes(this.P(), K);
      C.State.Set(N > 0 ? TpGotTimes(N) : TxEmpty);
    });
    this.TabHelp.SetText(Free ? TpHelpFree : TpHelpPaid);
  }

  // the card shown big on the purchase screen
  ShowCard(D) {
    const Lib = this.Lib;
    this.Sel = D;
    this.Big.SetCard(Lib, D, D.Atk, D.Hp, D.Hp);
    this.Big.SetShown(true);
    const N = CardOwnedCount(this.P(), D.Id);
    this.Help.SetText(Join([D.Name, N > 0 ? TmOwnedN(N) : TmNotOwned, Lib.TextOf(D), Lib.HelpOf(D)], TxNewline));
    this.Grid.forEach((G, I) => {
      const E = At(this.List, I);
      G.Face.SetGlow(!!(E && E[0].Id === D.Id), GlowSel);
    });
  }

  OnHover(Id) {
    if (this.Open < 0) return;
    if (Id >= 3130 && Id < 3130 + PreGridMax) {
      const E = At(this.List, Id - 3130);
      if (E) this.ShowCard(E[0]);
    }
  }

  // the buttons at the bottom: yes / no, or OK after the purchase
  SetButtons(Done) {
    for (const S of [this.YesSlot, this.NoSlot, this.OkSlot]) this.ConfCanvas.RemoveWidget(S.Widget);
    if (Done) this.ConfCanvas.AddWidget(this.OkSlot);
    else {
      this.ConfCanvas.AddWidget(this.YesSlot);
      this.ConfCanvas.AddWidget(this.NoSlot);
    }
  }

  // deck K's button in the shop: the purchase screen with the card list; returns the shop's message
  async Buy(K) {
    const B = this.B, Lib = this.Lib;
    const Dk = At(PreDecks, K);
    if (!Dk) return TmShopHello;
    this.Open = K;
    this.List = PreDeckList(Lib.DB, K);
    const Mix = PreDeckMix(Lib.DB, K);
    const H = At(Lib.Heroes, Dk.Hero);
    this.Title.Set(Dk.Name);
    this.Sub.Set(TpSub(H ? H.Name : TxEmpty, Mix[0], Mix[1]));
    this.Desc.SetText(Dk.Desc);
    if (H) this.HeroPic.SetImage(H.Pic);
    this.Grid.forEach((G, I) => {
      const E = At(this.List, I);
      const R = At(this.Roots, I);
      if (E) {
        G.Face.SetCard(Lib, E[0], E[0].Atk, E[0].Hp, E[0].Hp);
        this.Counts[I].Set(TmTimes(E[1]));
      } else this.Counts[I].Set(TxEmpty);
      if (R) Show(R, !!E);
    });
    const Free = CardPreFree(this.P());
    this.AskLine.Set(Free ? TpAskFree : TpAskPaid);
    this.AskLine.SetColor(CGold);
    const Slot = CardEmptyDeckSlot(this.P());
    this.Note.SetText(Join([TpListHelp, TpSlotNote(Slot + 1)], TxNewline));
    this.YesBtn.Label.Set(Free ? TpYesFree : TpYesPaid(PrePrice));
    this.YesBtn.Face.SetImage(BtnTex(Free ? BtnGold : BtnPurple, 400.0, 82.0));
    this.SetButtons(false);
    const Icon = this.List.find(E => E[0].Id === Dk.Icon);
    const First = Icon ?? At(this.List, 0);
    if (First) this.ShowCard(First[0]);
    const CardIds = this.List.map((E, I) => 3130 + I).filter(Id => Id < 3130 + PreGridMax);
    const OldId = B.CurId;
    B.Snd(SfxOpen);
    B.Layer(this.ConfSlot, true);
    try {
      B.CurId = 3120;
      let Done = false;
      let Msg = TpHello;
      while (true) {
        const Ids = Done ? [...CardIds, 3122] : [...CardIds, 3120, 3121];
        const Id = await B.Pick(Ids, Done ? 3122 : 3120, Done ? 3122 : 3121);
        if (Id === 3121) {
          B.Snd(SfxCancel);
          break;
        }
        if (Id === 3122) {
          B.Snd(SfxClick);
          break;
        }
        if (Id >= 3130 && Id < 3130 + PreGridMax) {
          const E = At(this.List, Id - 3130);
          if (E) {
            B.Snd(SfxSelect);
            this.ShowCard(E[0]);
          }
        } else if (Id === 3120) {
          const R = CardBuyPrebuilt(this.P(), Lib.DB, K);
          if (R == null) {
            B.Snd(SfxCancel);
            this.AskLine.Set(TmNoGems);
            this.AskLine.SetColor(CRed);
            continue;
          }
          B.Snd(SfxFanfare);
          B.Snd(SfxWin);
          B.Fx.PlayZ(VfxSummonBig, V2(960.0, 120.0), 120);
          this.AskLine.Set(TpGot(Dk.Name));
          this.AskLine.SetColor(CGold);
          this.Note.SetText(R.Slot >= 0 ? TpGotSlot(R.Slot + 1) : TpGotNoSlot);
          if (this.Sel) this.ShowCard(this.Sel);
          Msg = R.Slot >= 0 ? TpThanksSlot(R.Slot + 1) : TpThanks;
          this.SetButtons(true);
          B.CurId = 3122;
          Done = true;
        }
      }
      return Msg;
    } finally {
      B.Layer(this.ConfSlot, false);
      this.Open = -1;
      B.CurId = OldId;
    }
  }
}

function MakePrebuiltUI(B, Lib) {
  // ---- the shop tab: one cell per deck
  const ST = [];
  const Cells = [];
  PreDecks.forEach((Dk, K) => {
    const X = 215.0 + K * 505.0;
    const Y = 255.0;
    const Mix = PreDeckMix(Lib.DB, K);
    const H = At(Lib.Heroes, Dk.Hero);
    const Face = MakeCardFace(1.3, null);
    const Ic = At(Lib.DB, Dk.Icon);
    if (Ic) Face.SetCard(Lib, Ic, Ic.Atk, Ic.Hp, Ic.Hp);
    const St = OText(TxEmpty, 20.0, CGreen, CInk);
    const Bt = MBtn(B, 3111 + K, BtnPurple, TpPrice(PrePrice), X + 40.0, Y + 492.0, 400.0, 86.0, 30.0);
    Cells.push(new pre_cell({ Btn: Bt[1], State: St }));
    ST.push(
      RBox(new color_block({ DefaultColor: color(0.08, 0.05, 0.12), DefaultOpacity: 0.85 }), X, Y, 480.0, 600.0, 1),
      RPin(OText(Dk.Name, 34.0, CGold, CInk).Root, X + 240.0, Y + 38.0, 3),
      RBox(Face.Root, X + 22.0, Y + 76.0, 195.0, 278.2, 2),
      RBox(Tex(H ? H.Pic : CardGui.T_HeroMe, 110.0, 110.0), X + 296.0, Y + 80.0, 110.0, 110.0, 2),
      RPin(OText(TpHero(H ? H.Name : TxEmpty), 18.0, CWhite, CInk).Root, X + 348.0, Y + 210.0, 3),
      RPin(OText(TpCards40, 19.0, CWhite, CInk).Root, X + 351.0, Y + 252.0, 3),
      RPin(OText(TpMonSpell(Mix[0], Mix[1]), 16.0, CCream, CInk).Root, X + 351.0, Y + 284.0, 3),
      RPin(St.Root, X + 351.0, Y + 330.0, 3),
      RBox(TxtWrap(Dk.Desc, 19.0, CWhite, 436.0), X + 22.0, Y + 372.0, 436.0, 110.0, 3),
      Bt[0]);
  });
  const TabHelp = TxtWrap(TpHelpFree, 20.0, CBrown, 1180.0);
  ST.push(RBox(TabHelp, 250.0, 868.0, 1180.0, 70.0, 3));

  // ---- the purchase screen: the card list (left), the picked card (right), yes / no
  const Title = OText(TxEmpty, 50.0, CGold, CInk);
  const Sub = OText(TxEmpty, 24.0, CWhite, CInk);
  const Desc = TxtDark(TxEmpty, 20.0);
  const HeroPic = Tex(CardGui.T_HeroMe, 120.0, 120.0);
  const AskLine = OText(TxEmpty, 32.0, CGold, CInk);
  const Note = TxtWrap(TxEmpty, 19.0, CBrown, 760.0);
  const Big = MakeCardFace(1.6, null);
  const Help = new text_block({ DefaultText: TxEmpty, DefaultTextColor: CBrown, DefaultTextSize: 17.0, DefaultJustification: text_justification.Left, AutoWrap: true, WrapWidth: 470.0 });
  const CS = [
    MakeOverlayDim(0.85),
    RBox(Tex(CardGui.T_PanelLog, 1840.0, 1030.0), 40.0, 25.0, 1840.0, 1030.0, 1),
    RBox(Tex(CardGui.T_Banner, 820.0, 120.0), 550.0, 30.0, 820.0, 120.0, 2),
    RPin(Title.Root, 960.0, 88.0, 3),
    RBox(HeroPic, 110.0, 50.0, 120.0, 120.0, 2),
    RPin(Sub.Root, 960.0, 172.0, 3),
    RPin(Desc, 960.0, 208.0, 3),
    RBox(Big.Root, 1080.0, 236.0, 240.0, 342.4, 3),
    RBox(Help, 1340.0, 236.0, 480.0, 560.0, 3),
    RBox(Note, 1080.0, 640.0, 740.0, 160.0, 3),
    RPin(AskLine.Root, 960.0, 870.0, 4),
  ];
  const Grid = [];
  const Roots = [];
  const Counts = [];
  for (let I = 0; I <= PreGridMax - 1; I++) {
    const GC = MakeGridCard(PreGridScale, MenuHit(B, 3130 + I));
    const Cn = OText(TxEmpty, 22.0, CWhite, CInk);
    Grid.push(GC[0]);
    Roots.push(GC[1]);
    Counts.push(Cn);
    CS.push(RBox(GC[1], PreGX(I), PreGY(I), 150.0 * PreGridScale, 214.0 * PreGridScale, 3), RPin(Cn.Root, PreGX(I) + 60.0, PreGY(I) + 186.0, 4));
    B.AddBounds(3130 + I, { X: PreGX(I), Y: PreGY(I), W: 150.0 * PreGridScale, H: 214.0 * PreGridScale });
  }
  const Yes = MBtn(B, 3120, BtnPurple, TxEmpty, 540.0, 920.0, 400.0, 82.0, 30.0);
  const No = MBtn(B, 3121, BtnBlue, TmNo, 980.0, 920.0, 400.0, 82.0, 30.0);
  const Ok = MBtn(B, 3122, BtnGold, TpOk, 760.0, 920.0, 400.0, 82.0, 30.0);
  const ConfCanvas = new canvas({ Slots: CS });
  return new prebuilt_ui({
    B, Lib,
    Tab: RFull(new canvas({ Slots: ST }), 5),
    Cells, TabHelp,
    ConfCanvas,
    ConfSlot: RFull(ConfCanvas, 104),
    Title, Sub, Desc, HeroPic, AskLine, Note, Big, Help, Grid, Roots, Counts,
    YesBtn: Yes[1],
    YesSlot: Yes[0],
    NoSlot: No[0],
    OkSlot: Ok[0],
  });
}
