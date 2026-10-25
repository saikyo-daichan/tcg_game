// achieve.js — card_achieve.verse: 実績 (achievements), 称号 (titles) and バッチ (badges), ported 1:1.
// An achievement that is reached is not paid by itself: the player picks it on the 実績 screen and gets its title / badge
// with a big show. The profile shows one title and three badges (picked on the 称号・バッチ設定 screen); the matching
// screen shows them to the opponent. Saved indexes: never remove or reorder CardTitles / CardBadges / CardAchs entries.
// Changed: race{} losers keep running in JS, so ClaimFx gets a stop flag `Ctl` ({Stop: false}) (extra parameter);
// options are value-or-null (CardBadgeIn returns a texture or null); tuples are arrays (MBtn(...)[0] / [1]).
'use strict';

// ---------------------------------------------------------------- titles

// the special player's own title and badge (given silently, see CardGiveGifts)
const CardTitleCandy = 49;
const CardBadgeCandy = 1;

// ---------------------------------------------------------------- badges
class badge_def {
  constructor(o = {}) { this.Name = o.Name; this.Pic = o.Pic; }
}

function CardBadges() {
  const T = CardGui;
  return [
    new badge_def({ Name: AbDuel, Pic: T.T_Bdg00 }),
    new badge_def({ Name: AbCandy, Pic: T.T_Bdg01 }),
    new badge_def({ Name: AbDiamond, Pic: T.T_Bdg02 }),
    new badge_def({ Name: AbCrown, Pic: T.T_Bdg03 }),
    new badge_def({ Name: AbFlame, Pic: T.T_Bdg04 }),
    new badge_def({ Name: AbSilver, Pic: T.T_Bdg05 }),
    new badge_def({ Name: AbGold, Pic: T.T_Bdg06 }),
    new badge_def({ Name: AbStar, Pic: T.T_Bdg07 }),
    new badge_def({ Name: AbRainbow, Pic: T.T_Bdg08 }),
    new badge_def({ Name: AbHeart, Pic: T.T_Bdg09 }),
    new badge_def({ Name: AbSwords, Pic: T.T_Bdg10 }),
    new badge_def({ Name: AbTrophy, Pic: T.T_Bdg11 }),
    new badge_def({ Name: AbGear, Pic: T.T_Bdg12 }),
    new badge_def({ Name: AbDraft, Pic: T.T_Bdg13 }),
    new badge_def({ Name: AbChest, Pic: T.T_Bdg14 }),
    new badge_def({ Name: AbBook, Pic: T.T_Bdg15 }),
    new badge_def({ Name: AbSparkle, Pic: T.T_Bdg16 }),
    new badge_def({ Name: AbIsland, Pic: T.T_Bdg17 }),
    new badge_def({ Name: AbLaurel, Pic: T.T_Bdg18 }),
    new badge_def({ Name: AbHero0, Pic: T.T_Bdg19 }),
    new badge_def({ Name: AbHero1, Pic: T.T_Bdg20 }),
    new badge_def({ Name: AbHero2, Pic: T.T_Bdg21 }),
    new badge_def({ Name: AbHero3, Pic: T.T_Bdg22 }),
    new badge_def({ Name: AbHero4, Pic: T.T_Bdg23 }),
    new badge_def({ Name: AbHero5, Pic: T.T_Bdg24 }),
    new badge_def({ Name: AbHero6, Pic: T.T_Bdg25 }),
    new badge_def({ Name: AbHero7, Pic: T.T_Bdg26 }),
    new badge_def({ Name: AbSeason1, Pic: T.T_Bdg27 }),
    new badge_def({ Name: AbBoss, Pic: T.T_Bdg28 }),
    new badge_def({ Name: AbMaster, Pic: T.T_Bdg29 }),
    new badge_def({ Name: AbBlueFlame, Pic: T.T_Bdg30 }),
    new badge_def({ Name: AbCollector, Pic: T.T_Bdg31 }),
  ];
}

function CardBadgeName(I) { const Bd = At(CardBadges(), I); return Bd ? Bd.Name : TxEmpty; }
function CardTitleName(I) { return At(CardTitles, I) ?? TxEmpty; }

// ---------------------------------------------------------------- achievements
// Stat: what is counted (CardAchValue); the reward is title Title and badge Badge (-1: none)
class card_ach {
  constructor(o = {}) { this.Stat = o.Stat; this.Need = o.Need; this.Title = o.Title ?? -1; this.Badge = o.Badge ?? -1; }
}

const AchTutorial = 0;
const AchStreak = 1;
const AchLevel = 2;
const AchLegend2 = 3;
const AchGems = 4;
const AchPvpWins = 5;
const AchCpuWins = 6;
const AchMatches = 7;
const AchPickWins = 8;
const AchPacks = 9;
const AchKinds = 10;
const AchPrem = 11;
const AchLogin = 12;
const AchHour = 13;
const AchBacks = 14;
const AchSummons = 15;
const AchHeroWins = 16;      // + the hero id (16..23)
// (stats from 100 on are counted by CardAchValue3)
const AchBossWins = 100;

const CardAchs = [
  new card_ach({ Stat: AchTutorial, Need: 1, Title: 0, Badge: 0 }),
  new card_ach({ Stat: AchStreak, Need: 3, Title: 1 }),
  new card_ach({ Stat: AchStreak, Need: 5, Title: 2, Badge: 4 }),
  new card_ach({ Stat: AchStreak, Need: 10, Title: 3, Badge: 3 }),
  new card_ach({ Stat: AchLevel, Need: 5, Title: 4 }),
  new card_ach({ Stat: AchLevel, Need: 10, Title: 5 }),
  new card_ach({ Stat: AchLevel, Need: 20, Title: 6, Badge: 5 }),
  new card_ach({ Stat: AchLevel, Need: 30, Title: 7 }),
  new card_ach({ Stat: AchLevel, Need: 50, Title: 8, Badge: 6 }),
  new card_ach({ Stat: AchLegend2, Need: 1, Title: 9, Badge: 7 }),
  new card_ach({ Stat: AchLegend2, Need: 3, Title: 10 }),
  new card_ach({ Stat: AchLegend2, Need: 10, Title: 11, Badge: 8 }),
  new card_ach({ Stat: AchGems, Need: 100, Title: 12, Badge: 9 }),
  new card_ach({ Stat: AchGems, Need: 1000, Title: 13 }),
  new card_ach({ Stat: AchGems, Need: 10000, Title: 14, Badge: 2 }),
  new card_ach({ Stat: AchPvpWins, Need: 1, Title: 15 }),
  new card_ach({ Stat: AchPvpWins, Need: 10, Title: 16 }),
  new card_ach({ Stat: AchPvpWins, Need: 50, Title: 17, Badge: 10 }),
  new card_ach({ Stat: AchPvpWins, Need: 100, Title: 18, Badge: 11 }),
  new card_ach({ Stat: AchCpuWins, Need: 1, Title: 19 }),
  new card_ach({ Stat: AchCpuWins, Need: 10, Title: 20 }),
  new card_ach({ Stat: AchCpuWins, Need: 50, Title: 21, Badge: 12 }),
  new card_ach({ Stat: AchMatches, Need: 10, Title: 22 }),
  new card_ach({ Stat: AchMatches, Need: 100, Title: 23 }),
  new card_ach({ Stat: AchMatches, Need: 500, Title: 24, Badge: 18 }),
  new card_ach({ Stat: AchPickWins, Need: 1, Title: 25 }),
  new card_ach({ Stat: AchPickWins, Need: 10, Title: 26 }),
  new card_ach({ Stat: AchPickWins, Need: 30, Title: 27, Badge: 13 }),
  new card_ach({ Stat: AchPacks, Need: 10, Title: 28 }),
  new card_ach({ Stat: AchPacks, Need: 50, Title: 29 }),
  new card_ach({ Stat: AchPacks, Need: 200, Title: 30, Badge: 14 }),
  new card_ach({ Stat: AchKinds, Need: 100, Title: 31 }),
  new card_ach({ Stat: AchKinds, Need: 250, Title: 32 }),
  new card_ach({ Stat: AchKinds, Need: 380, Title: 33, Badge: 15 }),
  new card_ach({ Stat: AchPrem, Need: 1, Title: 34 }),
  new card_ach({ Stat: AchPrem, Need: 10, Title: 35, Badge: 16 }),
  new card_ach({ Stat: AchLogin, Need: 7, Title: 36 }),
  new card_ach({ Stat: AchLogin, Need: 30, Title: 37, Badge: 17 }),
  new card_ach({ Stat: AchHour, Need: 10, Title: 38 }),
  new card_ach({ Stat: AchBacks, Need: 5, Title: 39 }),
  new card_ach({ Stat: AchSummons, Need: 500, Title: 40 }),
  new card_ach({ Stat: AchHeroWins + 0, Need: 10, Title: 41, Badge: 19 }),
  new card_ach({ Stat: AchHeroWins + 1, Need: 10, Title: 42, Badge: 20 }),
  new card_ach({ Stat: AchHeroWins + 2, Need: 10, Title: 43, Badge: 21 }),
  new card_ach({ Stat: AchHeroWins + 3, Need: 10, Title: 44, Badge: 22 }),
  new card_ach({ Stat: AchHeroWins + 4, Need: 10, Title: 45, Badge: 23 }),
  new card_ach({ Stat: AchHeroWins + 5, Need: 10, Title: 46, Badge: 24 }),
  new card_ach({ Stat: AchHeroWins + 6, Need: 10, Title: 47, Badge: 25 }),
  new card_ach({ Stat: AchHeroWins + 7, Need: 10, Title: 48, Badge: 26 }),
  // v18: harder ones (titles 51.., badges 28..31; title 50 / badge 27 come from the quest reward pass)
  new card_ach({ Stat: AchBossWins, Need: 1, Title: 51, Badge: 28 }),
  new card_ach({ Stat: AchBossWins, Need: 10, Title: 52 }),
  new card_ach({ Stat: AchStreak, Need: 20, Title: 53, Badge: 29 }),
  new card_ach({ Stat: AchLevel, Need: 100, Title: 54, Badge: 30 }),
  new card_ach({ Stat: AchPvpWins, Need: 300, Title: 55 }),
  new card_ach({ Stat: AchPickWins, Need: 100, Title: 56 }),
  new card_ach({ Stat: AchKinds, Need: 440, Title: 57, Badge: 31 }),
  new card_ach({ Stat: AchLegend2, Need: 30, Title: 58 }),
  new card_ach({ Stat: AchMatches, Need: 1000, Title: 59 }),
  new card_ach({ Stat: AchLogin, Need: 100, Title: 60 }),
  new card_ach({ Stat: AchSummons, Need: 5000, Title: 61 }),
  new card_ach({ Stat: AchHour, Need: 100, Title: 62 }),
  new card_ach({ Stat: AchPacks, Need: 1000, Title: 63 }),
  new card_ach({ Stat: AchCpuWins, Need: 300, Title: 64 }),
];

// the text of an achievement (「野良対戦-通常で3連勝する」)
function CardAchName(A, Lib) {
  if (A.Stat === AchBossWins) return AcBossWins(A.Need);
  if (A.Stat >= AchHeroWins) {
    const Hd = At(Lib.Heroes, A.Stat - AchHeroWins);
    const H = Hd ? Hd.Name : TxEmpty;
    return AcHeroWins(H, A.Need);
  }
  return CardAchNameOf(A.Stat, A.Need);
}

function CardAchNameOf(St, N) {
  if (St === AchTutorial) return AcTutorial;
  if (St === AchStreak) return AcStreak(N);
  if (St === AchLevel) return AcLevel(N);
  if (St === AchLegend2) return AcLegend2(N);
  if (St === AchGems) return AcGems(N);
  if (St === AchPvpWins) return AcPvpWins(N);
  if (St === AchCpuWins) return AcCpuWins(N);
  if (St === AchMatches) return AcMatches(N);
  return CardAchNameOf2(St, N);
}

function CardAchNameOf2(St, N) {
  if (St === AchPickWins) return AcPickWins(N);
  if (St === AchPacks) return AcPacks(N);
  if (St === AchKinds) return AcKinds(N);
  if (St === AchPrem) return AcPrem(N);
  if (St === AchLogin) return AcLogin(N);
  if (St === AchHour) return AcHour(N);
  if (St === AchBacks) return AcBacks(N);
  return AcSummons(N);
}

// the counted value of a stat
function CardAchValue(S, DB, St) {
  if (St === AchBossWins) return S.BossWins;
  if (St >= AchHeroWins) return At(S.HeroWins, St - AchHeroWins) ?? 0;
  if (St === AchTutorial) return S.Tutorial >= 2 ? 1 : 0;
  if (St === AchStreak) return S.RandBest;
  if (St === AchLevel) return CardLevelOf(S.Xp).Level;
  if (St === AchLegend2) {
    let N = 0;
    S.Prem.forEach((L, Id) => { const D = At(DB, Id); if (L >= 2 && D && D.Rarity === RarL) N += 1; });
    return N;
  }
  if (St === AchGems) return S.GemsBought;
  if (St === AchPvpWins) return S.PvpWins;
  if (St === AchCpuWins) return S.CpuWins;
  if (St === AchMatches) return S.Matches;
  return CardAchValue2(S, St);
}

function CardAchValue2(S, St) {
  if (St === AchPickWins) return S.PickWins;
  if (St === AchPacks) return S.Packs;
  if (St === AchKinds) return S.Owned.filter(C => C > 0).length;
  if (St === AchPrem) return S.Prem.filter(L => L >= 1).length;
  if (St === AchLogin) return S.LoginDays;
  if (St === AchHour) return S.HourCount;
  if (St === AchBacks) return S.Backs.length;
  return S.Summons;
}

// 0 not reached yet, 1 reached (the reward can be received), 2 received
function CardAchState(S, DB, I) {
  if (S.AchClaimed.includes(I)) return 2;
  const A = At(CardAchs, I);
  if (A && CardAchValue(S, DB, A.Stat) >= A.Need) return 1;
  return 0;
}

function CardAchClaimable(P, DB) {
  const S = GetCardSave(P);
  for (let I = 0; I < CardAchs.length; I++) if (CardAchState(S, DB, I) === 1) return true;
  return false;
}

// receives the reward of achievement I (its title and badge); false when it can't be received
function CardClaimAch(P, DB, I) {
  if (CardAchState(GetCardSave(P), DB, I) !== 1) return false;
  const A = At(CardAchs, I) ?? new card_ach({ Stat: 0, Need: 0 });
  const E = CardEdit(P);
  E.AchClaimed = [...E.AchClaimed, I];
  if (A.Title >= 0 && !E.Titles.includes(A.Title)) E.Titles = [...E.Titles, A.Title];
  if (A.Badge >= 0 && !E.Badges.includes(A.Badge)) E.Badges = [...E.Badges, A.Badge];
  // the first title is put on by itself
  if (E.TitleSel < 0 && A.Title >= 0) E.TitleSel = A.Title;
  CardCommit(P, E);
  return true;
}

// the counters of the achievements after a match (CardGiveMatch counts the rest)
function CardMatchStats(P, IsRandom, Mode, Hero, Won, Lost, Early) {
  const E = CardEdit(P);
  // 野良対戦-通常: wins in a row (a win before the first turn was over doesn't count, a loss / draw ends the streak)
  if (IsRandom && Mode === ModeDeck) {
    if (Won) {
      if (!Early) {
        E.RandStreak += 1;
        if (E.RandStreak > E.RandBest) E.RandBest = E.RandStreak;
      }
    } else if (Lost || !Early) {
      E.RandStreak = 0;
    }
  }
  if (Won) {
    if (Mode === Mode2Pick) E.PickWins += 1;
    if (Hero >= 0) {
      while (E.HeroWins.length <= Hero) E.HeroWins.push(0);
      E.HeroWins[Hero] = E.HeroWins[Hero] + 1;
    }
  }
  CardCommit(P, E);
}

// ---------------------------------------------------------------- what the player shows (profile / matching screen)
function CardSetTitle(P, T) {
  const E = CardEdit(P);
  if (T >= 0 && !E.Titles.includes(T)) return;
  E.TitleSel = T;
  CardCommit(P, E);
}

// badge Bd (-1: none) in slot Slot (0..2); a badge is shown only once
function CardSetBadge(P, Slot, Bd) {
  if (Slot < 0 || Slot > 2) return;
  const E = CardEdit(P);
  if (Bd >= 0 && !E.Badges.includes(Bd)) return;
  const Sel = E.BadgeSel.map(X => (Bd >= 0 && X === Bd) ? -1 : X);
  while (Sel.length < 3) Sel.push(-1);
  Sel[Slot] = Bd;
  E.BadgeSel = Sel;
  CardCommit(P, E);
}

// the title shown with the name (empty: none)
function CardTitleOf(S) {
  if (S.TitleSel >= 0 && S.Titles.includes(S.TitleSel)) {
    const T = At(CardTitles, S.TitleSel);
    if (T !== undefined) return T;
  }
  return TxEmpty;
}

// the badge in slot Slot (0..2): its texture, or null
function CardBadgeIn(S, Slot) {
  const Bd = At(S.BadgeSel, Slot);
  if (Bd !== undefined && Bd >= 0 && S.Badges.includes(Bd)) {
    const Def = At(CardBadges(), Bd);
    if (Def) return Def.Pic;
  }
  return null;
}

function CardBadgePics(S) { return [0, 1, 2].map(K => CardBadgeIn(S, K)); }

// ---------------------------------------------------------------- the screens
// one line of the achievement list
class ach_row {
  constructor(o = {}) {
    this.Bg = o.Bg; this.Icon = o.Icon; this.Name = o.Name; this.Reward = o.Reward; this.Bar = o.Bar; this.Prog = o.Prog; this.Btn = o.Btn;
  }
}

// one cell of the title / badge lists
class eq_cell {
  constructor(o = {}) { this.Bg = o.Bg; this.Pic = o.Pic; this.Name = o.Name; }
}

const AchPer = 7;
const EqTitlePer = 24;
const EqBadgePer = 24;
function AchRowY(I) { return 170.0 + I * 106.0; }
function EqTitleX(I) { return 140.0 + Mod(I, 4) * 414.0; }
function EqTitleY(I) { return 470.0 + Quotient(I, 4) * 70.0; }
function EqBadgeX(I) { return 140.0 + Mod(I, 8) * 207.0; }
function EqBadgeY(I) { return 466.0 + Quotient(I, 8) * 146.0; }

// ids: list rows 900..906, 前へ 910, 次へ 911, 称号・バッチ設定 912, とじる 913 / the claim show's OK 915 /
// equip: the title 920, badge slots 921..923, titles 930..953, badges 960..983, 前へ 990, 次へ 991, はずす 992, 戻る 993
class ach_ui {
  constructor(o = {}) {
    this.B = o.B;
    this.Lib = o.Lib;
    this.ListSlot = o.ListSlot;
    this.Rows = o.Rows;
    this.RowSws = o.RowSws;
    this.PageTxt = o.PageTxt;
    this.CountTxt = o.CountTxt;
    this.ListMsg = o.ListMsg;
    // the claim show
    this.PopSlot = o.PopSlot;
    this.PopCanvas = o.PopCanvas;
    this.PopRays = o.PopRays;
    this.PopRaysB = o.PopRaysB;
    this.PopBadge = o.PopBadge;
    this.PopBadgeName = o.PopBadgeName;
    this.PopPlate = o.PopPlate;
    this.PopTitle = o.PopTitle;
    this.PopName = o.PopName;
    this.PopFlash = o.PopFlash;
    // equip
    this.EqSlot = o.EqSlot;
    this.EqCanvas = o.EqCanvas;
    this.EqName = o.EqName;
    this.EqTitle = o.EqTitle;
    this.EqTitleBg = o.EqTitleBg;
    this.EqSlotBgs = o.EqSlotBgs;
    this.EqSlotPics = o.EqSlotPics;
    this.EqHead = o.EqHead;
    this.EqMsg = o.EqMsg;
    this.EqPageTxt = o.EqPageTxt;
    this.EqTitleList = o.EqTitleList;
    this.EqBadgeList = o.EqBadgeList;
    this.EqTitleCells = o.EqTitleCells;
    this.EqBadgeCells = o.EqBadgeCells;
    this.Order = o.Order ?? [];
    this.PageNo = o.PageNo ?? 0;
    this.EqMode = o.EqMode ?? 0;
    this.EqPage = o.EqPage ?? 0;
    this.EqList = o.EqList ?? [];
  }

  P() { return this.B.P; }

  CloseAll() {
    for (const S of [this.ListSlot, this.PopSlot, this.EqSlot]) this.B.Layer(S, false);
  }

  // ------------------------------------------------------------ the achievement list
  // reached ones first, then the ones not reached yet, the received ones at the very end
  MakeOrder() {
    const S = GetCardSave(this.P());
    const Ready = [], Todo = [], Done = [];
    for (let I = 0; I < CardAchs.length; I++) {
      const St = CardAchState(S, this.Lib.DB, I);
      if (St === 1) Ready.push(I);
      else if (St === 0) Todo.push(I);
      else Done.push(I);
    }
    this.Order = [...Ready, ...Todo, ...Done];
  }

  Pages() { return Max(1, Quotient(this.Order.length + AchPer - 1, AchPer)); }

  FillList() {
    const S = GetCardSave(this.P());
    const DB = this.Lib.DB;
    this.PageNo = Max(0, Min(this.PageNo, this.Pages() - 1));
    this.PageTxt.Set(TbPage(this.PageNo + 1, this.Pages()));
    let Reached = 0;
    for (let I = 0; I < CardAchs.length; I++) if (CardAchState(S, DB, I) >= 1) Reached += 1;
    this.CountTxt.Set(AhCount(Reached, CardAchs.length, S.AchClaimed.length));
    this.Rows.forEach((R, K) => {
      const Sw = At(this.RowSws, K);
      if (!Sw) return;
      const I = At(this.Order, this.PageNo * AchPer + K);
      const A = I !== undefined ? At(CardAchs, I) : undefined;
      if (A) {
        Sw.Set(true);
        const St = CardAchState(S, DB, I);
        const V = Min(A.Need, CardAchValue(S, DB, A.Stat));
        R.Name.Set(CardAchName(A, this.Lib));
        R.Name.SetColor(St === 2 ? CGrey : CWhite);
        R.Reward.Set(this.RewardText(A));
        R.Reward.SetColor(St === 2 ? CGrey : CGold);
        R.Bar.Set(V * 1.0 / (Max(1, A.Need) * 1.0));
        R.Prog.Set(TxSlash(V, A.Need));
        const Bd = At(CardBadges(), A.Badge);
        R.Icon.SetImage(Bd ? Bd.Pic : CardGui.T_Bdg07);
        R.Icon.SetTint(St === 2 ? color(0.45, 0.45, 0.45) : A.Badge >= 0 ? CWhite : color(0.75, 0.75, 0.75));
        R.Btn.Label.Set(St === 1 ? TmClaim : St === 2 ? TmClaimed : TmNotYet);
        R.Btn.Face.SetTint(St === 1 ? CWhite : CGrey);
        Show(R.Btn.Glow, St === 1);
        R.Bg.SetColor(St === 1 ? color(0.24, 0.13, 0.012) : color(0.05, 0.04, 0.08));
      } else {
        Sw.Set(false);
      }
    });
  }

  RewardText(A) {
    if (A.Title >= 0 && A.Badge >= 0) return AhRewardBoth(CardTitleName(A.Title), CardBadgeName(A.Badge));
    if (A.Badge >= 0) return AhRewardBadge(CardBadgeName(A.Badge));
    return AhRewardTitle(CardTitleName(A.Title));
  }

  ListIds() {
    const N = Max(0, Min(AchPer, this.Order.length - this.PageNo * AchPer));
    const R = [];
    for (let K = 0; K <= N - 1; K++) R.push(900 + K);
    R.push(910, 911, 912, 913);
    return R;
  }

  // the 実績 screen (returns when とじる is chosen)
  async AchScreen() {
    const B = this.B;
    this.MakeOrder();
    this.PageNo = 0;
    this.ListMsg.Set(AhHelp);
    this.FillList();
    B.Snd(SfxOpen);
    B.Layer(this.ListSlot, true);
    try {
      B.CurId = 900;
      for (;;) {
        const Id = await B.PickPaged(this.ListIds(), 900, 913);
        if (Id === 913) {
          B.Snd(SfxCancel);
          return;
        }
        if (Id === NavPageNext || Id === NavEdgeNext || Id === 911) {
          this.PageNo = this.PageNo + 1 >= this.Pages() ? 0 : this.PageNo + 1;
          B.Snd(SfxFlip);
          this.FillList();
          if (Id === NavEdgeNext) B.CurId = 900;
        } else if (Id === NavPagePrev || Id === NavEdgePrev || Id === 910) {
          this.PageNo = this.PageNo <= 0 ? this.Pages() - 1 : this.PageNo - 1;
          B.Snd(SfxFlip);
          this.FillList();
          if (Id === NavEdgePrev) B.CurId = 913;
        } else if (Id === 912) {
          B.Snd(SfxClick);
          B.Layer(this.ListSlot, false);
          await this.Equip();
          B.Layer(this.ListSlot, true);
          this.FillList();
          B.CurId = 912;
        } else if (Id >= 900 && Id < 900 + AchPer) {
          const I = At(this.Order, this.PageNo * AchPer + Id - 900);
          if (I !== undefined) {
            const St = CardAchState(GetCardSave(this.P()), this.Lib.DB, I);
            if (St === 1) {
              const Got = CardClaimAch(this.P(), this.Lib.DB, I);
              if (Got) {
                await this.ClaimShow(I);
                // the received one goes to the back; the cursor stays on the same line
                this.MakeOrder();
                this.FillList();
                B.CurId = Id;
              }
            } else if (St === 2) {
              B.Snd(SfxCancel);
              this.ListMsg.Set(AhAlready);
            } else {
              B.Snd(SfxCancel);
              this.ListMsg.Set(AhNotYet);
            }
          }
        }
      }
    } finally {
      B.Layer(this.ListSlot, false);
    }
  }

  // ------------------------------------------------------------ the claim show (rays, a flash, the badge pops out, the title plate)
  async ClaimShow(I) {
    const B = this.B;
    const A = At(CardAchs, I) ?? new card_ach({ Stat: 0, Need: 0 });
    this.PopName.Set(CardAchName(A, this.Lib));
    const HasBadge = A.Badge >= 0;
    this.PopCanvas.RemoveWidget(this.PopBadge);
    this.PopCanvas.RemoveWidget(this.PopBadgeName.Root);
    this.PopCanvas.RemoveWidget(this.PopPlate);
    this.PopTitle.Set(A.Title >= 0 ? AhTitleQ(CardTitleName(A.Title)) : TxEmpty);
    const Bd = At(CardBadges(), A.Badge);
    if (Bd) {
      this.PopBadge.SetImage(Bd.Pic);
      this.PopBadgeName.Set(AhBadgeQ(Bd.Name));
    }
    B.Layer(this.PopSlot, true);
    try {
      // a white flash first
      this.PopCanvas.AddWidget(RFull(this.PopFlash, 20));
      B.Snd(SfxLegend);
      B.Snd(SfxJackpot);
      await Sleep(0.12);
      this.PopCanvas.RemoveWidget(this.PopFlash);
      B.Fx.PlayZ(VfxSummonBig, V2(960.0, 470.0), 130);
      // the title plate comes up (lower when there is a badge too)
      const PlateY = HasBadge ? 750.0 : 560.0;
      if (A.Title >= 0) this.PopCanvas.AddWidget(RPin(this.PopPlate, 960.0, PlateY, 6));
      // the badge pops out of nothing, a little too big, then settles
      if (HasBadge) {
        this.PopCanvas.AddWidget(RPin(this.PopBadge, 960.0, 440.0, 7));
        for (const Sz of [40.0, 120.0, 220.0, 300.0, 330.0, 300.0, 280.0]) {
          this.PopBadge.SetDesiredSize(V2(Sz, Sz));
          await Sleep(0.03);
        }
        this.PopCanvas.AddWidget(RPin(this.PopBadgeName.Root, 960.0, 618.0, 7));
        B.Snd(SfxPremium);
      }
      B.CurId = 915;
      const Ctl = { Stop: false };
      await Race(B.Pick([915], 915, 915), this.ClaimFx(HasBadge, Ctl));
      Ctl.Stop = true;
      B.Snd(SfxClick);
    } finally {
      B.Layer(this.PopSlot, false);
    }
  }

  // the rays turn round (two layers growing and shrinking in turn) and sparkles keep popping
  async ClaimFx(HasBadge, Ctl) {
    const B = this.B;
    let K = 0;
    for (;;) {
      if (Ctl.Stop) return;
      K += 1;
      const A = 1100.0 + 80.0 * Sin(K * 0.18);
      const Bz = 1000.0 + 80.0 * Sin(K * 0.18 + 1.6);
      this.PopRays.SetDesiredSize(V2(A, A));
      this.PopRaysB.SetDesiredSize(V2(Bz, Bz));
      if (Mod(K, 9) === 0) {
        const X = 560.0 + Mod(K * 37, 800) * 1.0;
        const Y = 280.0 + Mod(K * 53, 420) * 1.0;
        B.Fx.PlayZ(VfxSummon, V2(X, Y), 130);
      }
      if (Mod(K, 30) === 0) B.Snd(SfxCoin);
      await Sleep(0.05);
    }
  }

  // ------------------------------------------------------------ 称号・バッチ設定
  FillEquip() {
    const S = GetCardSave(this.P());
    this.EqName.Set(TxAgent(this.P()));
    const T = CardTitleOf(S);
    this.EqTitle.Set(S.TitleSel >= 0 ? T : AhNoTitle);
    this.EqTitle.SetColor(S.TitleSel >= 0 ? CGold : CGrey);
    this.EqTitleBg.SetColor(this.EqMode === 0 ? color(0.24, 0.13, 0.012) : color(0.08, 0.06, 0.12));
    this.EqSlotPics.forEach((Pic, K) => {
      const Bg = At(this.EqSlotBgs, K);
      if (!Bg) return;
      const Tx = CardBadgeIn(S, K);
      if (Tx != null) {
        Pic.SetImage(Tx);
        Show(Pic, true);
      } else {
        Show(Pic, false);
      }
      Bg.SetColor(this.EqMode === K + 1 ? color(0.24, 0.13, 0.012) : color(0.08, 0.06, 0.12));
    });
    // the list of what the player has for the slot being changed
    this.EqList = this.EqMode === 0 ? S.Titles.slice() : S.Badges.slice();
    const Per = this.EqMode === 0 ? EqTitlePer : EqBadgePer;
    const NP = Max(1, Quotient(this.EqList.length + Per - 1, Per));
    this.EqPage = Max(0, Min(this.EqPage, NP - 1));
    this.EqPageTxt.Set(TbPage(this.EqPage + 1, NP));
    this.EqHead.Set(this.EqMode === 0 ? AhPickTitle(S.Titles.length, CardTitles.length) : AhPickBadge(this.EqMode, S.Badges.length, CardBadges().length));
    this.EqCanvas.RemoveWidget(this.EqTitleList.Widget);
    this.EqCanvas.RemoveWidget(this.EqBadgeList.Widget);
    this.EqCanvas.AddWidget(this.EqMode === 0 ? this.EqTitleList : this.EqBadgeList);
    const Cur = this.EqMode === 0 ? S.TitleSel : (At(S.BadgeSel, this.EqMode - 1) ?? -1);
    const Cells = this.EqMode === 0 ? this.EqTitleCells : this.EqBadgeCells;
    Cells.forEach((C, K) => {
      const X = At(this.EqList, this.EqPage * Per + K);
      if (X !== undefined) {
        Show(C.Bg, true);
        Show(C.Name.Root, true);
        C.Name.Set(this.EqMode === 0 ? CardTitleName(X) : CardBadgeName(X));
        C.Bg.SetColor(X === Cur ? color(0.24, 0.13, 0.012) : color(0.1, 0.08, 0.16));
        const Bd = this.EqMode > 0 ? At(CardBadges(), X) : undefined;
        if (Bd) {
          C.Pic.SetImage(Bd.Pic);
          Show(C.Pic, true);
        }
      } else {
        Show(C.Bg, false);
        Show(C.Name.Root, false);
        Show(C.Pic, false);
      }
    });
  }

  EquipIds() {
    const Per = this.EqMode === 0 ? EqTitlePer : EqBadgePer;
    const Base = this.EqMode === 0 ? 930 : 960;
    const N = Max(0, Min(Per, this.EqList.length - this.EqPage * Per));
    const R = [920, 921, 922, 923];
    for (let K = 0; K <= N - 1; K++) R.push(Base + K);
    R.push(990, 991, 992, 993);
    return R;
  }

  // the title and the three badges shown on the profile and the matching screen
  async Equip() {
    const B = this.B;
    this.EqMode = 0;
    this.EqPage = 0;
    this.EqMsg.Set(AhEquipHelp);
    this.FillEquip();
    B.Snd(SfxOpen);
    B.Layer(this.EqSlot, true);
    try {
      B.CurId = 920;
      for (;;) {
        const Id = await B.PickPaged(this.EquipIds(), 920, 993);
        const Per = this.EqMode === 0 ? EqTitlePer : EqBadgePer;
        const NP = Max(1, Quotient(this.EqList.length + Per - 1, Per));
        if (Id === 993) {
          B.Snd(SfxCancel);
          return;
        }
        if (Id === NavPageNext || Id === NavEdgeNext || Id === 991) {
          this.EqPage = this.EqPage + 1 >= NP ? 0 : this.EqPage + 1;
          B.Snd(SfxFlip);
          this.FillEquip();
          if (Id === NavEdgeNext) B.CurId = 920;
        } else if (Id === NavPagePrev || Id === NavEdgePrev || Id === 990) {
          this.EqPage = this.EqPage <= 0 ? NP - 1 : this.EqPage - 1;
          B.Snd(SfxFlip);
          this.FillEquip();
          if (Id === NavEdgePrev) B.CurId = 993;
        } else if (Id >= 920 && Id <= 923) {
          this.EqMode = Id - 920;
          this.EqPage = 0;
          B.Snd(SfxSelect);
          this.FillEquip();
          // the cursor goes on to the list (or stays when there is nothing to pick)
          B.CurId = this.EqList.length > 0 ? (this.EqMode === 0 ? 930 : 960) : Id;
        } else if (Id === 992) {
          if (this.EqMode === 0) CardSetTitle(this.P(), -1); else CardSetBadge(this.P(), this.EqMode - 1, -1);
          B.Snd(SfxCancel);
          this.EqMsg.Set(this.EqMode === 0 ? AhTitleOff : AhBadgeOff);
          this.FillEquip();
        } else if (Id >= 930 && Id < 930 + EqTitlePer && this.EqMode === 0) {
          const X = At(this.EqList, this.EqPage * EqTitlePer + Id - 930);
          if (X !== undefined) {
            CardSetTitle(this.P(), X);
            B.Snd(SfxPlace);
            this.EqMsg.Set(AhTitleSet(CardTitleName(X)));
            this.FillEquip();
          }
        } else if (Id >= 960 && Id < 960 + EqBadgePer && this.EqMode > 0) {
          const X = At(this.EqList, this.EqPage * EqBadgePer + Id - 960);
          if (X !== undefined) {
            CardSetBadge(this.P(), this.EqMode - 1, X);
            B.Snd(SfxPlace);
            this.EqMsg.Set(AhBadgeSet(CardBadgeName(X)));
            // the next empty slot comes next
            if (this.EqMode < 3) this.EqMode += 1;
            this.FillEquip();
            B.CurId = 920 + this.EqMode;
          }
        }
      }
    } finally {
      B.Layer(this.EqSlot, false);
    }
  }
}

// ---------------------------------------------------------------- building the screens
function MakeAchUI(B, Lib) {
  // ---- the achievement list
  const LS = [MakeOverlayDim(0.85), RBox(Tex(CardGui.T_PanelLog, 1840.0, 1020.0), 40.0, 30.0, 1840.0, 1020.0, 1)];
  const PageTxt = OText(TxEmpty, 24.0, CWhite, CInk);
  const CountTxt = OText(TxEmpty, 24.0, CGold, CInk);
  const ListMsg = OText(TxEmpty, 19.0, CWhite, CInk);
  LS.push(
    RBox(Tex(CardGui.T_Banner, 900.0, 138.0), 510.0, 34.0, 900.0, 138.0, 2),
    RPin(OText(AhTitle, 46.0, CGold, CInk).Root, 960.0, 100.0, 3),
    RPinL(CountTxt.Root, 120.0, 140.0, 3),
    RPin(PageTxt.Root, 960.0, 978.0, 3),
    RPin(ListMsg.Root, 1640.0, 140.0, 3));
  const Rows = [];
  const RowSws = [];
  for (let K = 0; K <= AchPer - 1; K++) {
    const Y = AchRowY(K);
    const Bg = new color_block({ DefaultColor: color(0.05, 0.04, 0.08), DefaultOpacity: 0.75 });
    const Icon = Tex(CardGui.T_Bdg07, 86.0, 86.0);
    const Nm = OText(TxEmpty, 28.0, CWhite, CInk);
    const Rw = OText(TxEmpty, 21.0, CGold, CInk);
    const Bar = MakeBar(330.0, 22.0, color(0.1, 0.06, 0.03), color(0.35, 0.85, 1.0), false);
    const Pr = OText(TxEmpty, 22.0, CWhite, CInk);
    const Btn = MakePicButton(BtnGold, TmNotYet, 230.0, 74.0, 26.0, NoHit());
    const Rt = new canvas({
      Slots: [
        Box(Bg, 0.0, 0.0, 1640.0, 96.0, 0),
        Box(Icon, 10.0, 5.0, 86.0, 86.0, 1),
        PinL(Nm.Root, 116.0, 30.0, 2),
        PinL(Rw.Root, 116.0, 70.0, 2),
        Box(Bar.Root, 1000.0, 26.0, 330.0, 22.0, 2),
        Pin(Pr.Root, 1165.0, 70.0, 2),
        Box(Btn.Root, 1380.0, 10.0, 230.0, 80.0, 2),
        Box(B.Hub.Make(900 + K), 0.0, 0.0, 1640.0, 96.0, 5),
      ],
    });
    Rows.push(new ach_row({ Bg: Bg, Icon: Icon, Name: Nm, Reward: Rw, Bar: Bar, Prog: Pr, Btn: Btn }));
    RowSws.push(MakeSw(Rt, false));
    LS.push(RBox(Rt, 140.0, Y, 1640.0, 96.0, 4));
    B.AddBounds(900 + K, { X: 140.0, Y: Y, W: 1640.0, H: 96.0 });
  }
  const LP = MBtn(B, 910, BtnBlue, TbPrev, 140.0, 944.0, 220.0, 70.0, 26.0);
  const LN = MBtn(B, 911, BtnBlue, TbNext, 1100.0, 944.0, 220.0, 70.0, 26.0);
  const LE = MBtn(B, 912, BtnPurple, AhEquipBtn, 400.0, 944.0, 400.0, 70.0, 26.0);
  const LC = MBtn(B, 913, BtnEnd, TbClose, 1560.0, 944.0, 220.0, 70.0, 26.0);
  LS.push(LP[0], LN[0], LE[0], LC[0]);
  const ListSlot = RFull(new canvas({ Slots: LS }), 96);
  // ---- the claim show
  const PopRays = TexTint(CardGui.T_Rays, 1100.0, 1100.0, CGold);
  const PopRaysB = TexTint(CardGui.T_RaysB, 1000.0, 1000.0, CPink);
  const PopBadge = Tex(CardGui.T_Bdg00, 280.0, 280.0);
  const PopBadgeName = OText(TxEmpty, 34.0, CWhite, CInk);
  const PopTitle = OText(TxEmpty, 44.0, CGold, CInk);
  const PopName = OText(TxEmpty, 30.0, CWhite, CInk);
  const PopFlash = new color_block({ DefaultColor: CWhite, DefaultOpacity: 0.85 });
  const PopPlate = new canvas({
    Slots: [
      Box(TexTint(CardGui.T_GlowCard, 860.0, 150.0, CGold), -50.0, -20.0, 860.0, 150.0, 0),
      Box(Tex(CardGui.T_Plate, 760.0, 110.0), 0.0, 0.0, 760.0, 110.0, 1),
      Pin(PopTitle.Root, 380.0, 55.0, 2),
    ],
  });
  const PopOk = MBtn(B, 915, BtnGold, TbOk, 810.0, 930.0, 300.0, 86.0, 34.0);
  const PopCanvas = new canvas({
    Slots: [
      MakeOverlayDim(0.8),
      RPin(PopRaysB, 960.0, 500.0, 1),
      RPin(PopRays, 960.0, 500.0, 2),
      RBox(Tex(CardGui.T_Banner, 1100.0, 170.0), 410.0, 40.0, 1100.0, 170.0, 3),
      RPin(OText(AhGetHead, 58.0, CGold, CRed).Root, 960.0, 120.0, 4),
      RPin(PopName.Root, 960.0, 240.0, 4),
      PopOk[0],
    ],
  });
  const PopSlot = RFull(PopCanvas, 125);
  // ---- 称号・バッチ設定
  const EqName = OText(TxEmpty, 34.0, CWhite, CInk);
  const EqTitle = OText(TxEmpty, 32.0, CGold, CInk);
  const EqTitleBg = new color_block({ DefaultColor: color(0.08, 0.06, 0.12), DefaultOpacity: 0.85 });
  const EqHead = OText(TxEmpty, 26.0, CCream, CInk);
  const EqMsg = OText(TxEmpty, 24.0, CGold, CInk);
  const EqPageTxt = OText(TxEmpty, 22.0, CWhite, CInk);
  const ES = [MakeOverlayDim(0.85), RBox(Tex(CardGui.T_PanelLog, 1840.0, 1020.0), 40.0, 30.0, 1840.0, 1020.0, 1)];
  ES.push(
    RPin(OText(AhEquipTitle, 42.0, CGold, CInk).Root, 960.0, 90.0, 3),
    RPin(EqName.Root, 960.0, 160.0, 3),
    RBox(EqTitleBg, 610.0, 196.0, 700.0, 72.0, 2),
    RPin(EqTitle.Root, 960.0, 232.0, 3),
    RBox(B.Hub.Make(920), 610.0, 196.0, 700.0, 72.0, 6),
    RPin(EqHead.Root, 960.0, 432.0, 3),
    RPin(EqMsg.Root, 960.0, 912.0, 3),
    RPin(EqPageTxt.Root, 960.0, 978.0, 3));
  B.AddBounds(920, { X: 610.0, Y: 196.0, W: 700.0, H: 72.0 });
  const EqSlotBgs = [];
  const EqSlotPics = [];
  for (let K = 0; K <= 2; K++) {
    const X = 730.0 + K * 160.0;
    const Bg = new color_block({ DefaultColor: color(0.08, 0.06, 0.12), DefaultOpacity: 0.85 });
    const Pic = Tex(CardGui.T_Bdg00, 120.0, 120.0);
    EqSlotBgs.push(Bg);
    EqSlotPics.push(Pic);
    ES.push(RBox(Bg, X, 282.0, 140.0, 130.0, 2), RPin(OText(AhSlotNo(K + 1), 18.0, CGrey, CInk).Root, X + 70.0, 298.0, 3), RBox(Pic, X + 10.0, 287.0, 120.0, 120.0, 4), RBox(B.Hub.Make(921 + K), X, 282.0, 140.0, 130.0, 6));
    B.AddBounds(921 + K, { X: X, Y: 282.0, W: 140.0, H: 130.0 });
  }
  // the title list (4 x 6) and the badge list (8 x 3): only one of them is on the screen
  const TL = [];
  const EqTitleCells = [];
  for (let K = 0; K <= EqTitlePer - 1; K++) {
    const X = EqTitleX(K);
    const Y = EqTitleY(K);
    const Bg = new color_block({ DefaultColor: color(0.1, 0.08, 0.16), DefaultOpacity: 0.85 });
    const Nm = OText(TxEmpty, 24.0, CWhite, CInk);
    EqTitleCells.push(new eq_cell({ Bg: Bg, Pic: Tex(CardGui.T_Bdg00, 1.0, 1.0), Name: Nm }));
    TL.push(RBox(Bg, X, Y, 400.0, 62.0, 1), RPin(Nm.Root, X + 200.0, Y + 31.0, 2), RBox(B.Hub.Make(930 + K), X, Y, 400.0, 62.0, 5));
    B.AddBounds(930 + K, { X: X, Y: Y, W: 400.0, H: 62.0 });
  }
  const BL = [];
  const EqBadgeCells = [];
  for (let K = 0; K <= EqBadgePer - 1; K++) {
    const X = EqBadgeX(K);
    const Y = EqBadgeY(K);
    const Bg = new color_block({ DefaultColor: color(0.1, 0.08, 0.16), DefaultOpacity: 0.85 });
    const Pic = Tex(CardGui.T_Bdg00, 96.0, 96.0);
    const Nm = OText(TxEmpty, 17.0, CWhite, CInk);
    EqBadgeCells.push(new eq_cell({ Bg: Bg, Pic: Pic, Name: Nm }));
    BL.push(RBox(Bg, X, Y, 196.0, 138.0, 1), RBox(Pic, X + 50.0, Y + 6.0, 96.0, 96.0, 2), RPin(Nm.Root, X + 98.0, Y + 118.0, 2), RBox(B.Hub.Make(960 + K), X, Y, 196.0, 138.0, 5));
    B.AddBounds(960 + K, { X: X, Y: Y, W: 196.0, H: 138.0 });
  }
  const EP = MBtn(B, 990, BtnBlue, TbPrev, 140.0, 944.0, 220.0, 70.0, 26.0);
  const EN = MBtn(B, 991, BtnBlue, TbNext, 400.0, 944.0, 220.0, 70.0, 26.0);
  const EO = MBtn(B, 992, BtnEnd, AhTakeOff, 1300.0, 944.0, 220.0, 70.0, 26.0);
  const EB = MBtn(B, 993, BtnBlue, TmBack, 1560.0, 944.0, 220.0, 70.0, 26.0);
  ES.push(EP[0], EN[0], EO[0], EB[0]);
  const EqCanvas = new canvas({ Slots: ES });
  return new ach_ui({
    B: B,
    Lib: Lib,
    ListSlot: ListSlot,
    Rows: Rows,
    RowSws: RowSws,
    PageTxt: PageTxt,
    CountTxt: CountTxt,
    ListMsg: ListMsg,
    PopSlot: PopSlot,
    PopCanvas: PopCanvas,
    PopRays: PopRays,
    PopRaysB: PopRaysB,
    PopBadge: PopBadge,
    PopBadgeName: PopBadgeName,
    PopPlate: PopPlate,
    PopTitle: PopTitle,
    PopName: PopName,
    PopFlash: PopFlash,
    EqSlot: RFull(EqCanvas, 97),
    EqCanvas: EqCanvas,
    EqName: EqName,
    EqTitle: EqTitle,
    EqTitleBg: EqTitleBg,
    EqSlotBgs: EqSlotBgs,
    EqSlotPics: EqSlotPics,
    EqHead: EqHead,
    EqMsg: EqMsg,
    EqPageTxt: EqPageTxt,
    EqTitleList: RFull(new canvas({ Slots: TL }), 4),
    EqBadgeList: RFull(new canvas({ Slots: BL }), 4),
    EqTitleCells: EqTitleCells,
    EqBadgeCells: EqBadgeCells,
  });
}

// ---------------------------------------------------------------- texts
const AhTitle = "実績";
const AhHelp = "達成した実績をえらぶと報酬がもらえるよ";
function AhCount(A, N, C) { return `達成 ${A} / ${N}　（受け取り済み ${C}）`; }
const AhAlready = "この実績の報酬はもう受け取ったよ";
const AhNotYet = "この実績はまだ達成していないよ";
const AhEquipBtn = "称号・バッチ設定";
const AhGetHead = "実績達成！";
function AhTitleQ(T) { return `称号「${T}」`; }
function AhBadgeQ(N) { return `バッチ「${N}」`; }
function AhRewardBoth(T, N) { return `報酬：称号「${T}」＋バッチ「${N}」`; }
function AhRewardTitle(T) { return `報酬：称号「${T}」`; }
function AhRewardBadge(N) { return `報酬：バッチ「${N}」`; }
const AhEquipTitle = "称号・バッチ設定";
const AhEquipHelp = "上の称号・バッチ枠をえらんでから、下のリストから付けたいものをえらんでね";
const AhNoTitle = "（称号なし）";
function AhSlotNo(N) { return `バッチ${N}`; }
function AhPickTitle(A, N) { return `称号をえらんでね（所持 ${A} / ${N}）`; }
function AhPickBadge(S, A, N) { return `バッチ${S}に付けるバッチをえらんでね（所持 ${A} / ${N}）`; }
function AhTitleSet(T) { return `称号「${T}」を付けたよ`; }
function AhBadgeSet(N) { return `バッチ「${N}」を付けたよ`; }
const AhTitleOff = "称号をはずしたよ";
const AhBadgeOff = "バッチをはずしたよ";
const AhTakeOff = "はずす";

const AcTutorial = "チュートリアルをクリアする";
function AcStreak(N) { return `野良対戦-通常で${N}連勝する`; }
function AcLevel(N) { return `レベル${N}に到達する`; }
function AcLegend2(N) { return `レジェンドのプレミア化★2を${N}枚保有する`; }
function AcGems(N) { return `累計${N}ジェム課金する`; }
function AcPvpWins(N) { return `プレイヤーとの対戦（野良・部屋）で通算${N}勝する`; }
function AcCpuWins(N) { return `CPU戦で通算${N}勝する`; }
function AcMatches(N) { return `通算${N}回対戦する`; }
function AcPickWins(N) { return `2Pickで通算${N}勝する`; }
function AcPacks(N) { return `カードパックを${N}パック開封する`; }
function AcKinds(N) { return `カードを${N}種類あつめる`; }
function AcPrem(N) { return `プレミア化したカードを${N}種類にする`; }
function AcLogin(N) { return `${N}日ログインする`; }
function AcHour(N) { return `アワーボーナスを${N}回受け取る`; }
function AcBacks(N) { return `カードの裏面を${N}種類持つ`; }
function AcSummons(N) { return `モンスターを通算${N}体召喚する`; }
function AcHeroWins(H, N) { return `${H}で${N}回勝利する`; }
function AcBossWins(N) { return `CPU戦（最恐）で${N}回勝利する`; }

const AtBeginner = "駆け出し";
const AtStreak3 = "連勝街道";
const AtStreak5 = "破竹の勢い";
const AtStreak10 = "無敗の覇者";
const AtLv5 = "見習い決闘者";
const AtLv10 = "一人前の決闘者";
const AtLv20 = "ベテラン";
const AtLv30 = "熟練の決闘者";
const AtLv50 = "デュエルマスター";
const AtLeg1 = "輝きを持つ者";
const AtLeg3 = "伝説の収集家";
const AtLeg10 = "レジェンドの主";
const AtGem100 = "支援者";
const AtGem1000 = "富豪";
const AtGem10000 = "大富豪";
const AtPvp1 = "初勝利";
const AtPvp10 = "対戦好き";
const AtPvp50 = "歴戦の勇士";
const AtPvp100 = "対人戦の鬼";
const AtCpu1 = "腕試し";
const AtCpu10 = "CPUキラー";
const AtCpu50 = "機械仕掛けの天敵";
const AtPlay10 = "デュエル好き";
const AtPlay100 = "デュエル中毒";
const AtPlay500 = "生きる伝説";
const AtPick1 = "目利き";
const AtPick10 = "ドラフト職人";
const AtPick30 = "2Pickの鬼";
const AtPack10 = "開封の儀";
const AtPack50 = "パックハンター";
const AtPack200 = "ガチャの申し子";
const AtColl100 = "コレクター";
const AtColl250 = "図鑑マニア";
const AtColl380 = "カード博士";
const AtPrem1 = "キラキラ好き";
const AtPrem10 = "プレミア職人";
const AtLogin7 = "常連さん";
const AtLogin30 = "島の住人";
const AtHour10 = "ルーレット好き";
const AtBacks5 = "おしゃれさん";
const AtSummon500 = "召喚士";
const AtHero0 = "リオの相棒";
const AtHero1 = "ミントの相棒";
const AtHero2 = "ゼノの相棒";
const AtHero3 = "サディアの相棒";
const AtHero4 = "キングの相棒";
const AtHero5 = "ナイトの相棒";
const AtHero6 = "マジシャンの相棒";
const AtHero7 = "修道女の相棒";
const AtCandy = "キャンディマン";
const AtSeason1 = "シーズン1支援者";
const AtBoss = "最恐討伐者";
const AtBoss10 = "悪夢を越えし者";
const AtStreak20 = "伝説の連勝王";
const AtLv100 = "デュエルの神";
const AtPvp300 = "対戦の覇王";
const AtPick100 = "ドラフトの神";
const AtColl450 = "完全図鑑";
const AtLeg30 = "至高の輝き";
const AtPlay1000 = "終わらない決闘";
const AtLogin100 = "島の守り神";
const AtSummon5000 = "大召喚士";
const AtHour100 = "ルーレットマスター";
const AtPack1000 = "開封王";
const AtCpu300 = "CPUの支配者";

const AbDuel = "DUEL";
const AbCandy = "キャンディマン";
const AbDiamond = "ダイヤモンド";
const AbCrown = "王冠";
const AbFlame = "連勝の炎";
const AbSilver = "銀の盾";
const AbGold = "金の盾";
const AbStar = "スター";
const AbRainbow = "虹の星";
const AbHeart = "ハート";
const AbSwords = "双剣";
const AbTrophy = "トロフィー";
const AbGear = "歯車";
const AbDraft = "ドラフト";
const AbChest = "宝箱";
const AbBook = "図鑑";
const AbSparkle = "キラキラ";
const AbIsland = "島";
const AbLaurel = "月桂冠";
const AbHero0 = "リオ";
const AbHero1 = "ミント";
const AbHero2 = "ゼノ";
const AbHero3 = "サディア";
const AbHero4 = "キング";
const AbHero5 = "ナイト";
const AbHero6 = "マジシャン";
const AbHero7 = "修道女";
const AbSeason1 = "シーズン1";
const AbBoss = "最恐討伐者";
const AbMaster = "虹の王冠";
const AbBlueFlame = "蒼炎";
const AbCollector = "カードマスター";

// (after the messages it uses)
const CardTitles = [
  AtBeginner,
  AtStreak3,
  AtStreak5,
  AtStreak10,
  AtLv5,
  AtLv10,
  AtLv20,
  AtLv30,
  AtLv50,
  AtLeg1,
  AtLeg3,
  AtLeg10,
  AtGem100,
  AtGem1000,
  AtGem10000,
  AtPvp1,
  AtPvp10,
  AtPvp50,
  AtPvp100,
  AtCpu1,
  AtCpu10,
  AtCpu50,
  AtPlay10,
  AtPlay100,
  AtPlay500,
  AtPick1,
  AtPick10,
  AtPick30,
  AtPack10,
  AtPack50,
  AtPack200,
  AtColl100,
  AtColl250,
  AtColl380,
  AtPrem1,
  AtPrem10,
  AtLogin7,
  AtLogin30,
  AtHour10,
  AtBacks5,
  AtSummon500,
  AtHero0,
  AtHero1,
  AtHero2,
  AtHero3,
  AtHero4,
  AtHero5,
  AtHero6,
  AtHero7,
  AtCandy,
  AtSeason1,
  AtBoss,
  AtBoss10,
  AtStreak20,
  AtLv100,
  AtPvp300,
  AtPick100,
  AtColl450,
  AtLeg30,
  AtPlay1000,
  AtLogin100,
  AtSummon5000,
  AtHour100,
  AtPack1000,
  AtCpu300,
];
