// extra.js — card_extra.verse: v18 extras of the menus: the shop's 着せ替え tab (costumes + their card backs for gems)
// and the CPU strength select. Ported 1:1 (gems are in-game currency, no V-Bucks here).
// Changed: options are value-or-null (BuyQuestion returns a message or null); tuples are arrays (MBtn(...)[0]).
'use strict';

// ---------------------------------------------------------------- buying costumes
// the costume and its card back (gems); false when it is owned already or the gems are not enough
function CardBuySkin(P, Id) {
  const Sk = CardSkinById(Id);
  if (Sk && Sk.Price > 0) {
    if (CardOwnsShopSkin(P, Sk)) return false;
    const E = CardEdit(P);
    if (E.Gems < Sk.Price) return false;
    E.Gems -= Sk.Price;
    E.QGemsUsed += Sk.Price;
    if (!E.Skins.includes(Id)) E.Skins = [...E.Skins, Id];
    if (Sk.Back >= 0 && !E.Backs.includes(Sk.Back)) E.Backs = [...E.Backs, Sk.Back];
    CardCommit(P, E);
    return true;
  }
  return false;
}

function CardOwnsShopSkin(P, Sk) {
  return CardHasSkin(P, Sk.Id) && (Sk.Back < 0 || CardHasBack(P, Sk.Back));
}

function CardShopSkins() { return CardSkins().filter(S => S.Price > 0); }

function CardOwnsSkinSet(P) {
  for (const S of CardShopSkins()) if (!CardOwnsShopSkin(P, S)) return false;
  return true;
}

// every costume of the shop with its card back (CardSkinSetPrice gems)
function CardBuySkinSet(P) {
  if (CardOwnsSkinSet(P)) return false;
  const E = CardEdit(P);
  if (E.Gems < CardSkinSetPrice) return false;
  E.Gems -= CardSkinSetPrice;
  E.QGemsUsed += CardSkinSetPrice;
  for (const S of CardShopSkins()) {
    if (!E.Skins.includes(S.Id)) E.Skins = [...E.Skins, S.Id];
    if (S.Back >= 0 && !E.Backs.includes(S.Back)) E.Backs = [...E.Backs, S.Back];
  }
  CardCommit(P, E);
  return true;
}

// ---------------------------------------------------------------- the screens
// ids: costume tab cells 1210 (the set) and 1211..1218, the CPU strength select 1300..1303, 戻る 1309
class skin_cell {
  constructor(o = {}) { this.Bg = o.Bg; this.State = o.State; this.Price = o.Price; }
}

function SkinCellX(I) { return 190.0 + Mod(I, 3) * 515.0; }
function SkinCellY(I) { return 255.0 + Quotient(I, 3) * 205.0; }

class extra_ui {
  constructor(o = {}) {
    this.B = o.B;
    this.Lib = o.Lib;
    this.SkinTab = o.SkinTab;
    this.SkinCells = o.SkinCells;
    this.LevelSlot = o.LevelSlot;
    this.LevelMsg = o.LevelMsg;
    this.BossMark = o.BossMark;
    this.LastLevel = o.LastLevel ?? 0;
  }

  P() { return this.B.P; }

  CloseAll() { this.B.Layer(this.LevelSlot, false); }

  SkinIds() { return this.SkinCells.map((C, K) => 1210 + K); }

  FillSkins() {
    this.SkinCells.forEach((C, K) => {
      let Owned = false;
      if (K === 0) Owned = CardOwnsSkinSet(this.P());
      else { const Sk = At(CardShopSkins(), K - 1); Owned = Sk ? CardOwnsShopSkin(this.P(), Sk) : false; }
      C.State.Set(Owned ? TmOwned : TmBuy);
      C.State.SetColor(Owned ? CGrey : CGold);
      C.Bg.SetColor(Owned ? color(0.03, 0.03, 0.04) : color(0.08, 0.05, 0.12));
    });
  }

  // a costume cell of the shop was picked: the "really buy?" question (null: it is owned already, OwnedMsg says so)
  BuyQuestion(K) {
    if (K === 0) {
      if (CardOwnsSkinSet(this.P())) return null;
      return XsAskSet(CardSkinSetPrice);
    }
    const Sk = At(CardShopSkins(), K - 1);
    if (Sk && !CardOwnsShopSkin(this.P(), Sk)) {
      const H = HeroNameOf(Sk.Hero);
      return XsAskSkin(H, Sk.Name, Sk.Price);
    }
    return null;
  }

  OwnedMsg(K) { return K === 0 ? XsAllOwned : XsOwned; }

  // the purchase after "yes"; returns the message for the shop's message line
  async DoBuy(K, Pop) {
    const B = this.B;
    if (K === 0) {
      const Bought = CardBuySkinSet(this.P());
      if (!Bought) {
        B.Snd(SfxCancel);
        return TmNoGems;
      }
      B.Snd(SfxWin);
      this.FillSkins();
      await Pop.RewardPop(CardShopSkins().map(S => new card_reward({ Kind: RwSkin, N: S.Id })), XsGotSet, XsGotSub);
      return XsThanks;
    }
    const Sk = At(CardShopSkins(), K - 1);
    if (Sk) {
      const Bought = CardBuySkin(this.P(), Sk.Id);
      if (!Bought) {
        B.Snd(SfxCancel);
        return TmNoGems;
      }
      B.Snd(SfxWin);
      this.FillSkins();
      await Pop.RewardPop([new card_reward({ Kind: RwSkin, N: Sk.Id }), new card_reward({ Kind: RwBack, N: Sk.Back })], XsGotOne, XsGotSub);
      return XsThanks;
    }
    return XsHello;
  }

  // ------------------------------------------------------------ CPU strength (0 初級 .. 3 最恐; -1 = 戻る)
  async LevelSelect() {
    const B = this.B;
    this.LevelMsg.Set(XsLevelHelp);
    this.BossMark.Set(GetCardSave(this.P()).BossWins > 0 ? XsBossDone(GetCardSave(this.P()).BossWins) : TxEmpty);
    B.Snd(SfxOpen);
    B.Layer(this.LevelSlot, true);
    try {
      B.CurId = 1300 + this.LastLevel;
      const Id = await B.Pick([1300, 1301, 1302, 1303, 1309], 1300 + this.LastLevel, 1309);
      if (Id === 1309) {
        B.Snd(SfxCancel);
        return -1;
      }
      this.LastLevel = Id - 1300;
      B.Snd(this.LastLevel === 3 ? SfxLegend : SfxClick);
      return this.LastLevel;
    } finally {
      B.Layer(this.LevelSlot, false);
    }
  }
}

function MakeExtraUI(B, Lib) {
  // ---- the shop's 着せ替え tab (the set first, then one costume per character)
  const ST = [];
  const Cells = [];
  const Shop = CardShopSkins();
  for (let K = 0; K <= Shop.length; K++) {
    const X = SkinCellX(K);
    const Y = SkinCellY(K);
    const Bg = new color_block({ DefaultColor: color(0.08, 0.05, 0.12), DefaultOpacity: 0.85 });
    const St = OText(TmBuy, 20.0, CGold, CInk);
    const Pr = OText(TxEmpty, 22.0, CPink, CInk);
    Cells.push(new skin_cell({ Bg: Bg, State: St, Price: Pr }));
    ST.push(RBox(Bg, X, Y, 500.0, 190.0, 1), RBox(B.Hub.Make(1210 + K), X, Y, 500.0, 190.0, 6), RPin(St.Root, X + 450.0, Y + 166.0, 3));
    B.AddBounds(1210 + K, { X: X, Y: Y, W: 500.0, H: 190.0 });
    if (K === 0) {
      Pr.Set(TmPriceGem(CardSkinSetPrice));
      ST.push(
        RBox(Tex(CardGui.T_SkinSet, 170.0, 170.0), X + 5.0, Y + 10.0, 170.0, 170.0, 2),
        RPinL(OText(XsSetName, 22.0, CGold, CInk).Root, X + 190.0, Y + 34.0, 3),
        RPinL(OText(XsSetSub, 17.0, CWhite, CInk).Root, X + 190.0, Y + 74.0, 3),
        RPinL(OText(XsSetSub2, 17.0, CWhite, CInk).Root, X + 190.0, Y + 102.0, 3),
        RPinL(Pr.Root, X + 190.0, Y + 150.0, 3));
    } else {
      const Sk = At(Shop, K - 1);
      if (Sk) {
        Pr.Set(TmPriceGem(Sk.Price));
        ST.push(
          RBox(Tex(Sk.Pic, 170.0, 170.0), X + 5.0, Y + 10.0, 170.0, 170.0, 2),
          RBox(Tex(CardBackTex(Sk.Back), 56.0, 80.0), X + 130.0, Y + 104.0, 56.0, 80.0, 3),
          RPinL(OText(XsSkinName(HeroNameOf(Sk.Hero), Sk.Name), 20.0, CWhite, CInk).Root, X + 196.0, Y + 30.0, 3),
          RPinL(OText(XsSkinRace(Sk.Race), 17.0, CBlue, CInk).Root, X + 196.0, Y + 64.0, 3),
          RPinL(OText(XsSkinBack(Sk.Name), 17.0, CWhite, CInk).Root, X + 196.0, Y + 98.0, 3),
          RPinL(Pr.Root, X + 196.0, Y + 150.0, 3));
      }
    }
  }
  ST.push(RPin(TxtDark(XsShopHelp, 20.0), 960.0, 885.0, 3));
  // ---- CPU strength
  const LevelMsg = OText(TxEmpty, 24.0, CWhite, CInk);
  const BossMark = OText(TxEmpty, 22.0, CGold, CRed);
  const LS = [MakeOverlayDim(0.85), RBox(Tex(CardGui.T_PanelLog, 1500.0, 900.0), 210.0, 90.0, 1500.0, 900.0, 1)];
  LS.push(
    RBox(Tex(CardGui.T_Banner, 900.0, 120.0), 510.0, 100.0, 900.0, 120.0, 2),
    RPin(OText(XsLevelTitle, 44.0, CGold, CInk).Root, 960.0, 160.0, 3),
    RPin(LevelMsg.Root, 960.0, 250.0, 3));
  const Faces = [BtnBlue, BtnGold, BtnPurple, BtnEnd];
  const Names = [TxAiBeginner, TxAiMiddle, TxAiHard, TxAiNightmare];
  const Descs = [TxAiBeginnerDesc, TxAiMiddleDesc, TxAiHardDesc, TxAiNightmareDesc];
  for (let I = 0; I <= 3; I++) {
    const Fc = Faces[I], Nm = Names[I], Ds = Descs[I];
    const Y = 290.0 + I * 140.0;
    const Bt = MBtn(B, 1300 + I, Fc, Nm, 300.0, Y, 420.0, 110.0, 40.0);
    LS.push(Bt[0], RBox(TxtWrap(Ds, 24.0, CBrown, 860.0), 760.0, Y + 18.0, 860.0, 90.0, 3));
  }
  LS.push(RPinL(BossMark.Root, 760.0, 790.0, 4));
  const LB = MBtn(B, 1309, BtnBlue, TmBack, 810.0, 870.0, 300.0, 80.0, 30.0);
  LS.push(LB[0]);
  return new extra_ui({
    B: B,
    Lib: Lib,
    SkinTab: RFull(new canvas({ Slots: ST }), 5),
    SkinCells: Cells,
    LevelSlot: RFull(new canvas({ Slots: LS }), 97),
    LevelMsg: LevelMsg,
    BossMark: BossMark,
  });
}

// ---------------------------------------------------------------- texts
const XsHello = "着せ替えとカード裏面のセットだよ";
const XsThanks = "お買い上げありがとう！ 着せ替えはタイトルのキャラクターからえらべるよ";
const XsOwned = "この着せ替えはもう持っているよ";
const XsAllOwned = "セットの着せ替えはもう全部持っているよ";
function XsAskSkin(H, S, G) { return `${H}着せ替え「${S}」とカード裏面「${S}」を\n${G}ジェムで買いますか？`; }
function XsAskSet(G) { return `全着せ替え裏面セットを\n${G}ジェムで買いますか？`; }
const XsGotOne = "着せ替えゲット！";
const XsGotSet = "全着せ替え裏面セットゲット！";
const XsGotSub = "カードの裏面もセットで手に入れたよ";
const XsSetName = "全着せ替え裏面セット";
const XsSetSub = "8キャラの着せ替え";
const XsSetSub2 = "＋カード裏面 全16点";
function XsSkinName(H, S) { return `${H}着せ替え「${S}」`; }
function XsSkinRace(R) { return `${R}`; }
function XsSkinBack(S) { return `＋カード裏面「${S}」`; }
const XsShopHelp = "着せ替えはタイトル画面のキャラクターからいつでも変えられるよ";
const XsTab = "着せ替え";
const XsLevelTitle = "CPUの強さ";
const XsLevelHelp = "対戦するCPUの強さをえらんでね";
function XsBossDone(N) { return `最恐CPU 討伐 ${N}回`; }
