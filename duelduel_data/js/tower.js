// tower.js (10/27 update) — 無限の塔 (Infinite Tower): the third CPU mode next to 通常 and 2Pick (decks.js ModeSelect,
// ModeTower). Browser-only (no Verse original); written in the same style as the ported screens.
// - A run: a built deck + character picked once at the start (kept for the whole run), then floor 1, 2, 3 ... against
//   the CPU until the player loses. The CPU gets stronger: 1-4 初級, 5-9 中級, 10-19 上級, 20+ 最恐 (boss deck,
//   HP 30 rising to CardBossHp); its HP also rises a little every 5 floors (TowerFoeHp).
// - The player's HP carries over between floors; clearing every 5th floor heals TowerMercyHp (at most TowerMaxHp).
// - Between floors (the floor screen, also shown with the rewards after a win) the player can go back to the title:
//   the run stays in the save (TowerFloor / TowerHp / TowerHero / TowerDeck) and resumes at the same floor and HP.
// - TowerInMatch is 1 while a floor's match is played. If the page is closed / reloaded then, the next visit counts
//   that floor as lost and the run ends (no retry exploit). Surrender = a loss as usual.
// - Each floor win: coins + EXP growing with the floor (TowerWinReward) and one random card (N65/R29/E5/L1 %,
//   every 5th floor R80/E17/L3 %). Floor wins count as CPU wins (CpuWins, the daily CPU-win quests, HeroWins via
//   CardMatchStats) but never as 最恐 wins (BossWins / QBossWin); CardGiveMatch is not used (its own rewards).
// Save fields (save.js): TowerBest, TowerFloor, TowerHp, TowerHero, TowerDeck, TowerInMatch, TowerOldBest.
// Click ids: 1400 挑戦開始 / 挑戦する / 次の階へ, 1401 戻る / タイトルへ (floor screen),
//            1402 タイトルへ, 1403 もう一度挑戦 (end screen); the mode select's 無限の塔 is 128 (decks.js).
'use strict';

const TowerMaxHp = 20;        // the player's HP at the start of a run (= CardHeroHp)
const TowerMercyEvery = 5;    // every 5th floor: better card odds, and clearing it heals
const TowerMercyHp = 5;

// ---------------------------------------------------------------- the floors
function TowerBonusFloor(N) { return N > 0 && Mod(N, TowerMercyEvery) === 0; }

// the CPU's strength on floor N
function TowerFoeLevel(N) {
  return N >= 20 ? CardAiNightmare : N >= 10 ? CardAiHard : N >= 5 ? CardAiMiddle : CardAiBeginner;
}

// the CPU's HP on floor N: 1-5 20, 6-10 22, 11-15 24, 16-19 26; 最恐 floors 30, 32 ... up to CardBossHp
function TowerFoeHp(N) {
  if (N >= 20) return Min(CardBossHp, 30 + 2 * (N - 20));
  return CardHeroHp + 2 * Quotient(Max(0, N - 1), 5);
}

// the reward of a floor win: [coins, xp] (stops growing at floor 50)
function TowerWinReward(N) {
  const K = Max(1, Min(N, 50));
  return [100 + 20 * K, 60 + 10 * K];
}

// the rarity of the reward card for X = 1..1000 (normal: L 1%, E 5%, R 29%, N 65%; every 5th floor: L 3%, E 17%, R 80%)
function TowerRarityOf(Floor, X) {
  if (TowerBonusFloor(Floor)) return X <= 30 ? RarL : X <= 200 ? RarE : RarR;
  return X <= 10 ? RarL : X <= 60 ? RarE : X <= 350 ? RarR : RarN;
}
function TowerRollRarity(Floor) { return TowerRarityOf(Floor, GetRandomInt(1, 1000)); }

// a random card (no tokens / 最恐 cards) of the rolled rarity
function TowerRollCard(DB, Floor) {
  const R = TowerRollRarity(Floor);
  const Cands = DB.filter(D => !D.Token && D.Rarity === R);
  return At(Cands, GetRandomInt(0, Cands.length - 1)) ?? DB.find(D => !D.Token) ?? null;
}

// ---------------------------------------------------------------- the save
function TowerStartRun(P, HeroId, Ids) {
  const E = CardEdit(P);
  E.TowerOldBest = E.TowerBest;
  E.TowerFloor = 1;
  E.TowerHp = TowerMaxHp;
  E.TowerHero = HeroId;
  E.TowerDeck = Ids.slice();
  E.TowerInMatch = 0;
  E.TowerBest = Max(E.TowerBest, 1);
  CardCommit(P, E);
}

function TowerMatchBegins(P) {
  const E = CardEdit(P);
  E.TowerInMatch = 1;
  CardCommit(P, E);
}

// the counters CardGiveMatch keeps for every CPU match
function TowerCount(E, Won, Lost, Summons, Jewels) {
  E.Matches += 1;
  E.QMatches += 1;
  E.Summons += Summons;
  E.QSummons += Summons;
  E.QJewels += Jewels;
  if (Won) {
    E.CpuWins += 1;
    E.QCpuWin += 1;
  } else if (Lost) {
    E.CpuLosses += 1;
  }
}

class tower_win {
  constructor(o = {}) {
    this.Floor = o.Floor ?? 1;     // the floor cleared
    this.Gain = o.Gain ?? new card_gain();
    this.Card = o.Card ?? null;    // the card_def won
    this.New = o.New ?? false;     // the first copy of that card
    this.Heal = o.Heal ?? 0;       // HP healed by the 5th-floor bonus
  }
}

class tower_end {
  constructor(o = {}) {
    this.Floor = o.Floor ?? 1;     // the floor the run ended on
    this.Best = o.Best ?? 0;
    this.NewBest = o.NewBest ?? false;
    this.Gain = o.Gain ?? new card_gain();
  }
}

// the floor was won with Hp left: rewards, the next floor
function TowerFloorWon(P, DB, Hp, Summons, Jewels) {
  const E = CardEdit(P);
  const N = Max(1, E.TowerFloor);
  const [Coins, Xp] = TowerWinReward(N);
  const C = TowerRollCard(DB, N);
  const New = C ? (At(E.Owned, C.Id) ?? 0) === 0 : false;
  if (C) AddOwned(E, C.Id);
  TowerCount(E, true, false, Summons, Jewels);
  E.Coins += Coins;
  const L = CardAddXp(E, Xp);
  const H0 = Max(1, Min(TowerMaxHp, Hp));
  const Heal = TowerBonusFloor(N) ? Min(TowerMercyHp, TowerMaxHp - H0) : 0;
  E.TowerHp = H0 + Heal;
  E.TowerFloor = N + 1;
  E.TowerBest = Max(E.TowerBest, N + 1);
  E.TowerInMatch = 0;
  CardCommit(P, E);
  return new tower_win({
    Floor: N, Card: C, New, Heal,
    Gain: new card_gain({ Coins, Xp, LevelFrom: L[0], LevelTo: L[1], LevelCoins: L[2], LevelGems: L[3] }),
  });
}

// the run is over (lost, a draw, or the page was closed during the match): the CPU-loss consolation as CardGiveMatch
function TowerRunLost(P, Real, Early, Rounds, Summons, Jewels, Lost) {
  const E = CardEdit(P);
  const N = Max(1, E.TowerFloor);
  let Coins = 0;
  let Xp = 0;
  if (Real) {
    Coins = 40;
    Xp = 30;
  } else if (!Early) {
    Coins = Min(40, 4 * Rounds);
    Xp = Min(30, 3 * Rounds);
  }
  TowerCount(E, false, Lost, Summons, Jewels);
  E.Coins += Coins;
  const L = CardAddXp(E, Xp);
  E.TowerBest = Max(E.TowerBest, N);
  const NewBest = N > E.TowerOldBest;
  E.TowerOldBest = E.TowerBest;
  E.TowerFloor = 0;
  E.TowerHp = 0;
  E.TowerDeck = [];
  E.TowerInMatch = 0;
  CardCommit(P, E);
  return new tower_end({
    Floor: N, Best: E.TowerBest, NewBest,
    Gain: new card_gain({ Coins, Xp, LevelFrom: L[0], LevelTo: L[1], LevelCoins: L[2], LevelGems: L[3] }),
  });
}

// the mode select's lines
function TowerBestText(P) { return TwBest(GetCardSave(P).TowerBest); }
function TowerRunText(P) {
  const S = GetCardSave(P);
  return S.TowerFloor > 0 ? TwRunNow(S.TowerFloor, S.TowerHp, TowerMaxHp) : TxEmpty;
}

// ---------------------------------------------------------------- the screens
class tower_ui {
  constructor(o) { Object.assign(this, o); }

  P() { return this.B.P; }

  CloseAll() {
    this.B.Layer(this.FloorSlot, false);
    this.B.Layer(this.EndSlot, false);
  }

  // the floor screen: Start = before a run (floor 1, the deck is picked after 挑戦開始), Win = the floor just cleared
  // (its rewards are shown) or null. true = 挑戦 / 次の階へ, false = 戻る / タイトルへ
  async FloorScreen(Win, Start) {
    const B = this.B, P = this.P(), S = GetCardSave(P);
    const N = Start ? 1 : Max(1, S.TowerFloor);
    const Hp = Start ? TowerMaxHp : S.TowerHp;
    B.HideCast();
    B.SetTimer(TxEmpty, false);
    this.Head.Set(Win ? TwCleared(Win.Floor) : TwTitle);
    this.Next.Set(Start ? TwStartFrom : TwNextFloor(N));
    if (Start) {
      Show(this.HeroPic, false);
      this.HeroName.Set(TwPickLater);
    } else {
      const H = this.Menus.HeroOf(S.TowerHero);
      this.HeroPic.SetImage(CardHeroPic(P, H));
      Show(this.HeroPic, true);
      this.HeroName.Set(CardHeroName(P, H));
    }
    this.HpTxt.Set(TwHp(Hp, TowerMaxHp));
    this.HpTxt.SetColor(Hp * 3 <= TowerMaxHp ? CRed : CWhite);
    this.HpBar.Set(Hp * 1.0 / (TowerMaxHp * 1.0));
    this.FoeTxt.Set(TwFoe(N, CardAiName(TowerFoeLevel(N)), TowerFoeHp(N)));
    this.BonusTxt.Set(TowerBonusFloor(N) ? TwBonusNow : TwBonusNext(N + TowerMercyEvery - Mod(N, TowerMercyEvery)));
    this.BestTxt.Set(TwBest(S.TowerBest));
    this.RewardSw.Set(!!Win);
    this.IntroSw.Set(!Win);
    if (Win) {
      const C = Win.Card;
      if (C) {
        this.Face.SetCard(this.Lib, C, C.Atk, C.Hp, C.Hp);
        this.Face.SetPrem(0);
        this.Face.SetGlow(true, RarityColor(C.Rarity));
        this.Face.SetShown(true);
        this.CardTxt.Set(TwCard(TwRarName(C.Rarity), C.Name, Win.New));
        this.CardTxt.SetColor(RarityColor(C.Rarity));
      } else {
        this.Face.SetShown(false);
        this.CardTxt.Set(TxEmpty);
      }
      this.GainTxt.Set(TwGain(Win.Gain.Coins, Win.Gain.Xp));
      this.HealTxt.Set(Win.Heal > 0 ? TwHeal(Win.Floor, Win.Heal) : TowerBonusFloor(Win.Floor) ? TwHealFull(Win.Floor) : TxEmpty);
      this.LvTxt.Set(Win.Gain.LevelTo > Win.Gain.LevelFrom ? TmLevelUp(Win.Gain.LevelFrom, Win.Gain.LevelTo, Win.Gain.LevelCoins, Win.Gain.LevelGems) : TxEmpty);
    }
    this.GoBtn.Label.Set(Start ? TwStart : Win ? TwNext : TwChallenge);
    this.BackBtn.Label.Set(Win ? TmToTitle : TmBack);
    B.Layer(this.FloorSlot, true);
    try {
      if (Win) {
        B.Snd(SfxWin);
        const R = Win.Card ? Win.Card.Rarity : RarN;
        if (R >= RarE) spawn(async () => { await Sleep(0.5); B.Snd(R === RarL ? SfxLegend : SfxRare); });
        if (Win.Gain.LevelTo > Win.Gain.LevelFrom) spawn(async () => { await Sleep(1.0); B.Snd(SfxLevelUp); });
      } else {
        B.Snd(SfxOpen);
      }
      B.CurId = 1400;
      const Id = await B.Pick([1400, 1401], 1400, 1401);
      B.Snd(Id === 1400 ? SfxClick : SfxCancel);
      return Id === 1400;
    } finally {
      B.Layer(this.FloorSlot, false);
    }
  }

  // the run is over: 1403 もう一度挑戦 / 1402 タイトルへ
  async EndScreen(R, Why) {
    const B = this.B;
    B.HideCast();
    B.SetTimer(TxEmpty, false);
    this.EReached.Set(TwReached(R.Floor));
    this.ENew.Set(R.NewBest ? TwNewRecord : TxEmpty);
    this.EBest.Set(TwBest(R.Best));
    this.EWhy.Set(Why);
    this.EBgSw.Set(Why !== TxEmpty);
    this.EGain.Set(R.Gain.Coins > 0 || R.Gain.Xp > 0 ? TmResultGain(R.Gain.Coins, R.Gain.Xp) : TxEmpty);
    this.ELevel.Set(R.Gain.LevelTo > R.Gain.LevelFrom ? TmLevelUp(R.Gain.LevelFrom, R.Gain.LevelTo, R.Gain.LevelCoins, R.Gain.LevelGems) : TxEmpty);
    B.Layer(this.EndSlot, true);
    try {
      B.Snd(R.NewBest ? SfxLevelUp : SfxLose);
      B.CurId = 1402;
      const Id = await B.Pick([1403, 1402], 1402, 1402);
      B.Snd(Id === 1403 ? SfxClick : SfxCancel);
      return Id;
    } finally {
      B.Layer(this.EndSlot, false);
    }
  }
}

function MakeTowerUI(B, Lib, Menus) {
  // ---- the floor screen (start / between floors / rewards)
  const Head = OText(TwTitle, 44.0, CGold, CInk);
  const Next = OText(TxEmpty, 40.0, CGold, CInk);
  const HeroPic = Tex(CardGui.T_HeroMe, 150.0, 150.0);
  const HeroName = OText(TxEmpty, 26.0, CWhite, CInk);
  const HpTxt = OText(TxEmpty, 34.0, CWhite, CInk);
  const HpBar = MakeBar(420.0, 26.0, color(0.1, 0.06, 0.03), color(0.9, 0.18, 0.15), false);
  const FoeTxt = OText(TxEmpty, 24.0, CCream, CInk);
  const BonusTxt = OText(TxEmpty, 22.0, CGreen, CInk);
  const BestTxt = OText(TxEmpty, 24.0, CGold, CInk);
  const Go = MBtn(B, 1400, BtnGold, TwStart, 1010.0, 830.0, 300.0, 90.0, 32.0);
  const Bk = MBtn(B, 1401, BtnBlue, TmBack, 1340.0, 830.0, 300.0, 90.0, 30.0);
  // the left half: the rules (no rewards to show) or the rewards of the floor just cleared
  const Intro = new canvas({
    Slots: [
      RPin(OText(TwRulesHead, 32.0, CGold, CInk).Root, 595.0, 290.0, 3),
      RBox(TxtWrap(TwRules, 22.0, CBrown, 600.0), 290.0, 330.0, 600.0, 470.0, 3),
    ],
  });
  const Face = MakeCardFace(1.5, null);
  const CardTxt = OText(TxEmpty, 26.0, CWhite, CInk);
  const GainTxt = OText(TxEmpty, 30.0, CGold, CInk);
  const HealTxt = OText(TxEmpty, 24.0, CGreen, CInk);
  const LvTxt = OText(TxEmpty, 20.0, CGreen, CInk);
  const Reward = new canvas({
    Slots: [
      RPin(OText(TwRewardHead, 32.0, CGold, CInk).Root, 595.0, 280.0, 3),
      RBox(Face.Root, 482.5, 312.0, 225.0, 321.0, 3),
      RPin(CardTxt.Root, 595.0, 676.0, 4),
      RBox(Tex(CardGui.T_Coin, 44.0, 44.0), 392.0, 702.0, 44.0, 44.0, 4),
      RPin(GainTxt.Root, 630.0, 724.0, 4),
      RPin(HealTxt.Root, 595.0, 772.0, 4),
      RPin(LvTxt.Root, 595.0, 812.0, 4),
    ],
  });
  const FS = [
    MakeOverlayDim(1.0),
    RBox(Tex(CardGui.T_TitleBg, 1920.0, 1080.0), 0.0, 0.0, 1920.0, 1080.0, 1),
    MakeOverlayDim(0.45),
    RBox(Tex(CardGui.T_PanelLog, 1500.0, 900.0), 210.0, 90.0, 1500.0, 900.0, 2),
    RBox(Tex(CardGui.T_Banner, 900.0, 120.0), 510.0, 100.0, 900.0, 120.0, 3),
    RPin(Head.Root, 960.0, 160.0, 4),
    // a line between the halves
    RBox(new color_block({ DefaultColor: color(0.3, 0.18, 0.08), DefaultOpacity: 0.5 }), 955.0, 260.0, 4.0, 560.0, 3),
    RFull(Intro, 4),
    RFull(Reward, 4),
    RPin(Next.Root, 1320.0, 290.0, 4),
    RBox(HeroPic, 1010.0, 330.0, 150.0, 150.0, 4),
    RPinL(HeroName.Root, 1180.0, 360.0, 4),
    RPinL(HpTxt.Root, 1180.0, 412.0, 4),
    RBox(Tex(CardGui.T_Plate, 440.0, 40.0), 1170.0, 440.0, 440.0, 40.0, 4),
    RBox(HpBar.Root, 1180.0, 447.0, 420.0, 26.0, 5),
    RPinL(FoeTxt.Root, 1010.0, 530.0, 4),
    RPinL(BonusTxt.Root, 1010.0, 574.0, 4),
    RPinL(BestTxt.Root, 1010.0, 618.0, 4),
    RBox(TxtWrap(TwNote, 18.0, CBrown, 630.0), 1010.0, 660.0, 630.0, 120.0, 4),
    Go[0],
    Bk[0],
  ];
  const FloorSlot = RFull(new canvas({ Slots: FS }), 95);
  // ---- the end of a run
  const EReached = OText(TxEmpty, 64.0, CWhite, CInk);
  const ENew = OText(TxEmpty, 40.0, CGold, CRed);
  const EBest = OText(TxEmpty, 28.0, CGold, CInk);
  const EWhy = OText(TxEmpty, 22.0, CCream, CInk);
  const EGain = OText(TxEmpty, 28.0, CGold, CInk);
  const ELevel = OText(TxEmpty, 22.0, CGreen, CInk);
  const EA = MBtn(B, 1403, BtnGold, TwAgain, 560.0, 760.0, 380.0, 90.0, 32.0);
  const ET = MBtn(B, 1402, BtnBlue, TmToTitle, 980.0, 760.0, 380.0, 90.0, 32.0);
  // (the title picture behind it when there is no match on the board: the page was closed during the match)
  const EBg = new canvas({ Slots: [RBox(Tex(CardGui.T_TitleBg, 1920.0, 1080.0), 0.0, 0.0, 1920.0, 1080.0, 0)] });
  const EndSlot = RFull(new canvas({
    Slots: [
      RFull(EBg, 0),
      MakeOverlayDim(0.75),
      RBox(Tex(CardGui.T_PanelMsg, 1000.0, 680.0), 460.0, 220.0, 1000.0, 680.0, 1),
      RBox(Tex(CardGui.T_Banner, 1000.0, 154.0), 460.0, 170.0, 1000.0, 154.0, 2),
      RPin(OText(TwEndTitle, 50.0, CGold, CInk).Root, 960.0, 242.0, 3),
      RPin(EReached.Root, 960.0, 400.0, 3),
      RPin(ENew.Root, 960.0, 480.0, 3),
      RPin(EBest.Root, 960.0, 540.0, 3),
      RPin(EWhy.Root, 960.0, 590.0, 3),
      RPin(EGain.Root, 960.0, 646.0, 3),
      RPin(ELevel.Root, 960.0, 700.0, 3),
      EA[0],
      ET[0],
    ],
  }), 95);
  return new tower_ui({
    B, Lib, Menus,
    FloorSlot, Head, Next, HeroPic, HeroName, HpTxt, HpBar, FoeTxt, BonusTxt, BestTxt,
    GoBtn: Go[1], BackBtn: Bk[1],
    IntroSw: MakeSw(Intro, true), RewardSw: MakeSw(Reward, false),
    Face, CardTxt, GainTxt, HealTxt, LvTxt,
    EndSlot, EReached, ENew, EBest, EWhy, EGain, ELevel,
    EBgSw: MakeSw(EBg, false),
  });
}

// ---------------------------------------------------------------- the run (BattleLoop: CPU対戦 → 無限の塔)
// returns 74 when the player went to the title, 0 when they went back to the battle menu
async function TowerLoop(Game, Me) {
  const M = Me.Menus, Lib = Game.Lib, P = Me.P;
  if (!M.Tw) M.Tw = MakeTowerUI(M.B, Lib, M);
  const T = M.Tw;
  let Win = null;       // the floor just cleared (its rewards are on the floor screen)
  let Ready = false;    // the run was just started: floor 1 begins without the floor screen
  try {
    while (true) {
      M.CloseAll();
      const S = GetCardSave(P);
      if (S.TowerFloor > 0 && S.TowerInMatch > 0) {
        // the page was closed during a floor's match: that floor is lost
        const R = TowerRunLost(P, false, true, 0, 0, 0, true);
        Print(`tower: left during floor ${R.Floor}, the run is over`);
        const C = await T.EndScreen(R, TwQuitLost);
        if (C === 1402) return 74;
        continue;
      }
      if (S.TowerFloor <= 0) {
        const Go = await T.FloorScreen(null, true);
        if (!Go) return 0;
        if (CardFirstOkDeck(P, Lib.DB) < 0) {
          M.Inform(TmNoDeck);
          M.B.Snd(SfxCancel);
          continue;
        }
        const DI = await M.Dk.DeckSelect(true, 0);
        if (DI < 0) continue;
        const D = CardDeckOf(P, DI);
        const Mine = await M.CharSelect(true, 0, D.Hero, false);
        M.CloseChar();
        if (!Mine) continue;
        TowerStartRun(P, Mine.Id, DeckCards(Lib, D, Mine.Id).map(C => C.Id));
        Win = null;
        Ready = true;
      } else if (!Ready) {
        const Go = await T.FloorScreen(Win, false);
        const After = Win;
        Win = null;
        if (!Go) return After ? 74 : 0;
      }
      Ready = false;
      const R = await TowerPlayFloor(Game, Me);
      if (R instanceof tower_win) {
        Win = R;
        continue;
      }
      const C = await T.EndScreen(R, TxEmpty);
      if (C === 1402) return 74;
    }
  } finally {
    Me.InGame = false;
    Game.TowerMatch = null;
    T.CloseAll();
  }
}

// one floor's match: a tower_win (won) or a tower_end (the run is over)
async function TowerPlayFloor(Game, Me) {
  const M = Me.Menus, Lib = Game.Lib, P = Me.P;
  const S = GetCardSave(P);
  const N = Max(1, S.TowerFloor);
  const Mine = M.HeroOf(S.TowerHero);
  const Others = Lib.Heroes.filter(H => H.Id !== Mine.Id);
  const Rival = Others[GetRandomInt(0, Others.length - 1)] || Mine;
  const Level = TowerFoeLevel(N);
  const FoeHp = TowerFoeHp(N);
  let MyDeck = S.TowerDeck.map(Id => At(Lib.DB, Id)).filter(D => D !== undefined);
  if (MyDeck.length === 0) MyDeck = DeckCards(Lib, RandomDeck(Lib, Mine.Id), Mine.Id);
  const FoeDeck = Level === CardAiNightmare ? CardBossDeck(Lib, Rival.Id) : DeckCards(Lib, RandomDeck(Lib, Rival.Id), Rival.Id);
  M.CloseAll();
  Me.InGame = true;
  await M.VsIntro(VsOf(P, Mine), VsCpu(Rival));
  const Match = new card_match({
    DB: Lib.DB,
    Me: new side({ Hero: Mine, Name: TxAgent(P), Back: S.Back, Deck: MyDeck, PicOverride: CardHeroPic(P, Mine), NameOverride: CardHeroName(P, Mine), RaceOverride: CardHeroRace(P, Mine), Prem: S.Prem, Level: CardLevelOf(S.Xp).Level, Hp: Max(1, Min(TowerMaxHp, S.TowerHp)), MaxHp: TowerMaxHp }),
    Foe: new side({ Hero: Rival, Name: TwFloorCpu(N), Back: GetRandomInt(0, CardShopBacks), Deck: FoeDeck, AiLevel: Level, Hp: FoeHp, MaxHp: FoeHp }),
    Views: [Me.UI, null],
    TurnSeconds: CardTurnMax,
    MullSeconds: MullLimit,
  });
  M.CloseAll();
  Game.TowerMatch = Match;
  TowerMatchBegins(P);
  const W = await Match.Run();
  Game.TowerMatch = null;
  Me.InGame = false;
  Print(`tower floor ${N} over, winner ${W}, hp ${Match.Me.Hp}`);
  const Won = W === 0, Lost = W === 1;
  const Early = !Match.FirstTurnDone;
  CardMatchStats(P, false, ModeTower, Mine.Id, Won, Lost, Early, CardMatchFacts(Match, 0));
  if (Won) return TowerFloorWon(P, Lib.DB, Match.Me.Hp, Match.Me.Summons, Match.Me.Jewels);
  return TowerRunLost(P, Match.Reason === EndHp, Early, Match.Rounds(), Match.Me.Summons, Match.Me.Jewels, Lost);
}

// ---------------------------------------------------------------- texts
const TwTitle = "無限の塔";
function TwCleared(N) { return `無限の塔　${N}階クリア！`; }
const TwStartFrom = "1階から挑戦！";
function TwNextFloor(N) { return `次は ${N}階`; }
const TwPickLater = "デッキとキャラは開始後に選ぶよ";
function TwFloorCpu(N) { return `${N}階のコンピューター`; }
function TwHp(A, B) { return `HP ${A} / ${B}`; }
function TwFoe(N, L, H) { return `${N}階の相手：CPU（${L}）　体力${H}`; }
const TwBonusNow = "★ボーナス階！ レア以上のカード確定＆クリアでHP+5";
function TwBonusNext(N) { return `次のボーナス階：${N}階（レア以上確定・クリアでHP+5）`; }
function TwBest(N) { return N > 0 ? `最高到達階層：${N}階` : "最高到達階層：まだなし"; }
function TwRunNow(F, H, M) { return `挑戦中：${F}階（HP ${H} / ${M}）続きから遊べるよ`; }
const TwNote = "※対戦中にページを閉じると、その階は負け（挑戦終了）になります。階と階の間ならタイトルに戻っても、同じ階・同じHPから続けられます。";
const TwRulesHead = "無限の塔のルール";
const TwRules = "・1階から順番にCPUと対戦。勝つと次の階へ！\n・HPは回復せずに次の階へ持ち越し（5階クリアごとにHP+5）\n・上の階ほどCPUが強くなる（5階 中級／10階 上級／20階 最恐）\n・勝つたびにコイン・EXP・カード1枚！5の倍数の階はレア以上確定\n・負けたら挑戦終了。デッキとキャラは挑戦の最初に選んで最後まで使うよ\n・階と階の間ならタイトルに戻っても続きから挑戦できるよ";
const TwRewardHead = "クリア報酬";
function TwRarName(R) { return R === RarL ? TmRarL : R === RarE ? TmRarE : R === RarR ? TmRarR : TmRarN; }
function TwCard(R, N, New) { return New ? `${R}「${N}」 NEW!` : `${R}「${N}」`; }
function TwGain(C, X) { return `+${C}コイン　+${X}EXP`; }
function TwHeal(N, H) { return `${N}階クリアボーナス！ HP+${H}`; }
function TwHealFull(N) { return `${N}階クリアボーナス！（HPは満タン）`; }
const TwStart = "挑戦開始";
const TwChallenge = "挑戦する";
const TwNext = "次の階へ";
const TwEndTitle = "挑戦終了";
function TwReached(N) { return `到達階層：${N}階`; }
const TwNewRecord = "新記録！";
const TwQuitLost = "対戦中にゲームを終了したため、その階は負けになりました";
const TwAgain = "もう一度挑戦";
