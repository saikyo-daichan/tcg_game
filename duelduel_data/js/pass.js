// pass.js — card_pass.verse: クエスト報酬 (v18): a season pass filled with the points of the daily quests (free row +
// premium row), shown on top of the daily quest screen, the reward pop-up and the login bonus (one gacha ticket reward
// a day, a 7-day cycle). Saved indexes: never reorder CardPassTiers (the received tiers are saved by index).
//
// Changed for the browser:
// - No V-Bucks: the entitlement / offer classes (card_pass_s1, card_pass_s1_offer) are not ported. CardCheckPass is a
//   no-op (PassOwned stays as saved: the secret code 「1」 of the special player still unlocks it), CardBuyPass returns
//   false, and pass_ui.BuyPremium shows ComingSoon(B) (shop.js) instead of the purchase screen.
// - race{} losers keep running in JS: the endless effect loops (Tick, PopFx, LoginTick) get a stop flag `Ctl`
//   ({Stop: false}) that is set when the race is over (an extra parameter that Verse did not have).
// - Edges(): the [int]logic map is a JS Map whose keys are ALSO set as plain properties (M.get(K) and M[K] both work).
// - Tuples are arrays (MBtn(...)[0] / [1], MakePassCell(...)[0] / [1]).
'use strict';

// ---------------------------------------------------------------- rewards
const RwTickets = 0;
const RwTicketsE = 1;
const RwTicketsL = 2;
const RwCoins = 3;
const RwGems = 4;
const RwBadge = 5;
const RwTitle = 6;
const RwBack = 7;
const RwSkin = 8;

class card_reward {
  constructor(o = {}) { this.Kind = o.Kind; this.N = o.N ?? 1; }
}

function CardGiveReward(E, R) {
  if (R.Kind === RwTickets) {
    E.Tickets += R.N;
  } else if (R.Kind === RwTicketsE) {
    E.TicketsE += R.N;
  } else if (R.Kind === RwTicketsL) {
    E.TicketsL += R.N;
  } else if (R.Kind === RwCoins) {
    E.Coins += R.N;
  } else if (R.Kind === RwGems) {
    E.Gems += R.N;
  } else if (R.Kind === RwBadge) {
    if (!E.Badges.includes(R.N)) E.Badges = [...E.Badges, R.N];
  } else if (R.Kind === RwTitle) {
    if (!E.Titles.includes(R.N)) E.Titles = [...E.Titles, R.N];
    if (E.TitleSel < 0) E.TitleSel = R.N;
  } else if (R.Kind === RwBack) {
    if (!E.Backs.includes(R.N)) E.Backs = [...E.Backs, R.N];
  } else if (R.Kind === RwSkin) {
    if (!E.Skins.includes(R.N)) E.Skins = [...E.Skins, R.N];
  }
}

function CardRewardPic(R) {
  if (R.Kind === RwTickets) return CardGui.T_TicketN;
  if (R.Kind === RwTicketsE) return CardGui.T_TicketE;
  if (R.Kind === RwTicketsL) return CardGui.T_TicketL;
  if (R.Kind === RwCoins) return CardGui.T_Coin;
  if (R.Kind === RwGems) return CardGui.T_GemCur;
  if (R.Kind === RwBadge) { const Bd = At(CardBadges(), R.N); if (Bd) return Bd.Pic; }
  else if (R.Kind === RwTitle) return CardGui.T_Bdg07;
  else if (R.Kind === RwBack) return CardBackTex(R.N);
  else if (R.Kind === RwSkin) { const Sk = CardSkinById(R.N); if (Sk) return Sk.Pic; }
  return CardGui.T_Gift;
}

// the picture's size inside a Max x Max box (tickets are wide, card backs tall)
function CardRewardSize(R, Lim) {
  if (R.Kind <= RwTicketsL) return V2(Lim, Lim * 0.62);
  if (R.Kind === RwBack) return V2(Lim * 0.7, Lim);
  return V2(Lim, Lim);
}

// the short text on a pass cell
function CardRewardShort(R) {
  if (R.Kind <= RwTicketsL) return TmTimes(R.N);
  if (R.Kind === RwCoins || R.Kind === RwGems) return TxNum(R.N);
  if (R.Kind === RwBadge) return PsBadge;
  if (R.Kind === RwTitle) return PsTitle;
  if (R.Kind === RwBack) return PsBack;
  return PsSkin;
}

// the full name (the reward pop-up)
function CardRewardName(R) {
  if (R.Kind === RwTickets) return PrTickets(R.N);
  if (R.Kind === RwTicketsE) return PrTicketsE(R.N);
  if (R.Kind === RwTicketsL) return PrTicketsL(R.N);
  if (R.Kind === RwCoins) return PrCoins(R.N);
  if (R.Kind === RwGems) return PrGems(R.N);
  if (R.Kind === RwBadge) return AhBadgeQ(CardBadgeName(R.N));
  if (R.Kind === RwTitle) return AhTitleQ(CardTitleName(R.N));
  if (R.Kind === RwBack) return PrBack(CardBackName(R.N));
  const Sk = CardSkinById(R.N);
  if (Sk) return PrSkin(HeroNameOf(Sk.Hero), Sk.Name);
  return TxEmpty;
}

// the name of a card back that is not sold in the back tab (the pass / costume backs)
function CardBackName(I) {
  if (I === 17) return PsSeason1;
  if (I === CardBackCandy) return SnCandy;
  for (const S of CardSkins()) if (S.Back === I) return S.Name;
  return TxEmpty;
}

// coins / gems / tickets of the same kind are added up
function CardMergeRewards(Rs) {
  let Out = [];
  for (const R of Rs) {
    let AtI = -1;
    if (R.Kind <= RwGems) {
      Out.forEach((O, I) => { if (AtI < 0 && O.Kind === R.Kind) AtI = I; });
    }
    const O = At(Out, AtI);
    if (O) {
      Out = Out.slice();
      Out[AtI] = new card_reward({ Kind: R.Kind, N: O.N + R.N });
    } else {
      Out = [...Out, R];
    }
  }
  return Out;
}

// ---------------------------------------------------------------- seasons (Japan time)
// シーズン1 ends at 2027-01-01 0:00 (= the end of December 2026); later seasons are CardSeasonDays long until new ones are set up
const CardSeason1EndDay = 20819;
const CardSeasonDays = 91;

function CardSeasonNow() {
  const D = CardToday();
  return D < CardSeason1EndDay ? 1 : 2 + Quotient(D - CardSeason1EndDay, CardSeasonDays);
}

// seconds until the season ends
function CardSeasonLeft() {
  const EndDay = CardSeason1EndDay + CardSeasonDays * (CardSeasonNow() - 1);
  const Off = Math.floor(CardUtcOffsetHours * 3600.0);
  return Max(0, EndDay * 86400 - Off - CardNowSeconds());
}

// a new season: the points, received tiers and the premium pass start again
function CardPassRefresh(E) {
  const N = CardSeasonNow();
  if (E.Season !== N) {
    E.Season = N;
    E.PassPts = 0;
    E.PassFree = [];
    E.PassPrem = [];
    E.PassOwned = false;
  }
}

// ---------------------------------------------------------------- the pass
class pass_tier {
  constructor(o = {}) { this.Pts = o.Pts; this.Free = o.Free; this.Prem = o.Prem; }
}

// quest points of a quest tier: 1st +10, 2nd +15, 3rd +20, 4th +25, 5th +30
function CardQuestPts(Tier) { return 5 + 5 * Tier; }

const PassRw = (Kind, N) => new card_reward({ Kind: Kind, N: N });
// (premium of the first tier: the シーズン1 badge 27 + the title 50 シーズン1支援者; 1000 pt: card back 17; 10000 pt: リオ「スカイ」 = skin 3)
const CardPassTiers = [
  new pass_tier({ Pts: 0, Free: [PassRw(RwTickets, 1)], Prem: [PassRw(RwBadge, 27), PassRw(RwTitle, 50)] }),
  new pass_tier({ Pts: 100, Free: [PassRw(RwCoins, 500)], Prem: [PassRw(RwGems, 100)] }),
  new pass_tier({ Pts: 300, Free: [PassRw(RwTickets, 1)], Prem: [PassRw(RwTicketsE, 1)] }),
  new pass_tier({ Pts: 500, Free: [PassRw(RwCoins, 500)], Prem: [PassRw(RwGems, 100)] }),
  new pass_tier({ Pts: 1000, Free: [PassRw(RwTickets, 3)], Prem: [PassRw(RwBack, 17)] }),
  new pass_tier({ Pts: 1500, Free: [PassRw(RwCoins, 500)], Prem: [PassRw(RwGems, 100)] }),
  new pass_tier({ Pts: 2000, Free: [PassRw(RwTickets, 3)], Prem: [PassRw(RwTicketsE, 1)] }),
  new pass_tier({ Pts: 2500, Free: [PassRw(RwCoins, 500)], Prem: [PassRw(RwGems, 100)] }),
  new pass_tier({ Pts: 3000, Free: [PassRw(RwTickets, 5)], Prem: [PassRw(RwTicketsL, 1)] }),
  new pass_tier({ Pts: 5000, Free: [PassRw(RwTickets, 10)], Prem: [PassRw(RwTicketsL, 2)] }),
  new pass_tier({ Pts: 7500, Free: [PassRw(RwTickets, 30)], Prem: [PassRw(RwTicketsL, 3)] }),
  new pass_tier({ Pts: 10000, Free: [PassRw(RwTickets, 50)], Prem: [PassRw(RwSkin, 3)] }),
];

// 0 not reached, 1 can be received, 2 received, 3 reached but the premium pass is locked
function CardPassState(E, T, Prem) {
  const Tr = At(CardPassTiers, T);
  const Need = Tr ? Tr.Pts : 999999;
  if (Prem) {
    if (E.PassPrem.includes(T)) return 2;
    if (E.PassPts < Need) return 0;
    if (!E.PassOwned) return 3;
    return 1;
  }
  if (E.PassFree.includes(T)) return 2;
  if (E.PassPts < Need) return 0;
  return 1;
}

function CardPassClaimableE(E) {
  for (let T = 0; T < CardPassTiers.length; T++) {
    if (CardPassState(E, T, false) === 1 || CardPassState(E, T, true) === 1) return true;
  }
  return false;
}

// receives one reward of the pass: what was received (empty: nothing)
function CardClaimPass(P, T, Prem) {
  const E = CardEdit(P);
  if (CardPassState(E, T, Prem) !== 1) return [];
  const Tr = At(CardPassTiers, T) ?? new pass_tier({ Pts: 0, Free: [], Prem: [] });
  const Rs = Prem ? Tr.Prem : Tr.Free;
  for (const R of Rs) CardGiveReward(E, R);
  if (Prem) E.PassPrem = [...E.PassPrem, T]; else E.PassFree = [...E.PassFree, T];
  CardCommit(P, E);
  return Rs;
}

function CardClaimAllPass(P) {
  let All = [];
  for (let T = 0; T < CardPassTiers.length; T++) {
    All = All.concat(CardClaimPass(P, T, false));
    All = All.concat(CardClaimPass(P, T, true));
  }
  return All;
}

// the first tier the screen shows: the last tier whose rewards were all received (the pass scrolls there by itself)
function CardPassFirstShown(E) {
  let Last = 0;
  for (let T = 0; T < CardPassTiers.length; T++) {
    const Done = CardPassState(E, T, false) === 2 && (CardPassState(E, T, true) === 2 || !E.PassOwned);
    if (Done) Last = T;
  }
  return Last;
}

// ---------------------------------------------------------------- the premium pass (V-Bucks, シーズン1)
const CardPassVBucks = 500;

// (Verse: a bought シーズン1 pass unlocks the premium row) — nothing can be bought here: PassOwned stays as saved
async function CardCheckPass(P) {
}

// (Verse: shows Epic's purchase screen; true when the pass is unlocked) — no purchases in the browser
async function CardBuyPass(P) {
  return false;
}

// ---------------------------------------------------------------- login bonus (one a day; day 8 comes after day 7, the rewards repeat every 7 days)
const CardLoginBonus = [
  new card_reward({ Kind: RwTickets, N: 1 }),
  new card_reward({ Kind: RwTickets, N: 1 }),
  new card_reward({ Kind: RwTickets, N: 3 }),
  new card_reward({ Kind: RwTickets, N: 1 }),
  new card_reward({ Kind: RwTickets, N: 1 }),
  new card_reward({ Kind: RwTickets, N: 3 }),
  new card_reward({ Kind: RwTicketsE, N: 1 }),
];

function CardLoginReady(P) { return GetCardSave(P).LoginAt !== CardToday(); }

// the reward, or null when today's was received already
function CardClaimLoginBonus(P) {
  const E = CardEdit(P);
  if (E.LoginAt === CardToday()) return null;
  const R = At(CardLoginBonus, Mod(E.LoginNo, 7)) ?? new card_reward({ Kind: RwTickets });
  CardGiveReward(E, R);
  E.LoginNo += 1;
  E.LoginAt = CardToday();
  CardCommit(P, E);
  return R;
}

// ---------------------------------------------------------------- the screens
// ids: pass free cells 1100..1105, premium cells 1110..1115, ◀ 1120, ▶ 1121, buy the pass 1122,
// quest rows 1130..1132, ▲ 1140, ▼ 1141, まとめて受け取る 1150, 戻る 1151 / pop-up OK 1190 / login: tiles 1000..1006, 受け取る 1010
const PassCols = 6;
const QuestVis = 3;
function PassColX(K) { return 540.0 + K * 212.0; }
function QuestRowY(K) { return 640.0 + K * 100.0; }

class pass_cell {
  constructor(o = {}) {
    this.Bg = o.Bg; this.Icon = o.Icon; this.Amt = o.Amt; this.Veil = o.Veil; this.Mark = o.Mark; this.Glow = o.Glow; this.Tag = o.Tag;
  }
}

// the progress track under a column: the left half fills up to the column's mark (reached = the reward can be received),
// the right half fills towards the next column
class pass_col {
  constructor(o = {}) {
    this.Head = o.Head; this.BarL = o.BarL; this.BarR = o.BarR; this.Tick = o.Tick; this.Dot = o.Dot; this.Free = o.Free; this.Prem = o.Prem;
  }
}

class pass_row {
  constructor(o = {}) {
    this.Bg = o.Bg; this.Name = o.Name; this.Reward = o.Reward; this.Bar = o.Bar; this.Prog = o.Prog; this.Btn = o.Btn; this.Root = o.Root;
  }
}

class login_tile {
  constructor(o = {}) {
    this.Bg = o.Bg; this.Day = o.Day; this.Icon = o.Icon; this.Amt = o.Amt; this.Veil = o.Veil; this.Check = o.Check; this.Glow = o.Glow;
  }
}

class pass_ui {
  constructor(o = {}) {
    this.B = o.B;
    this.Lib = o.Lib;
    this.Slot = o.Slot;
    this.Cols = o.Cols;
    this.Rows = o.Rows;
    this.PtsTxt = o.PtsTxt;
    this.NextTxt = o.NextTxt;
    this.SeasonTxt = o.SeasonTxt;
    this.ResetTxt = o.ResetTxt;
    this.ScrollTxt = o.ScrollTxt;
    this.PassScrollTxt = o.PassScrollTxt;
    this.PremState = o.PremState;
    this.PremBtn = o.PremBtn;
    this.AllBtn = o.AllBtn;
    this.PassLeft = o.PassLeft;
    this.PassRight = o.PassRight;
    this.QUp = o.QUp;
    this.QDown = o.QDown;
    // the reward pop-up
    this.PopSlot = o.PopSlot;
    this.PopCanvas = o.PopCanvas;
    this.PopRays = o.PopRays;
    this.PopRaysB = o.PopRaysB;
    this.PopHead = o.PopHead;
    this.PopSub = o.PopSub;
    this.PopIcons = o.PopIcons;
    this.PopNames = o.PopNames;
    this.PopRoots = o.PopRoots;
    this.PopFlash = o.PopFlash;
    // the login bonus
    this.LoginSlot = o.LoginSlot;
    this.LoginTiles = o.LoginTiles;
    this.LoginInfo = o.LoginInfo;
    this.LoginBtnTxt = o.LoginBtnTxt;
    this.PTop = o.PTop ?? 0;
    this.QTop = o.QTop ?? 0;
    this.QOrder = o.QOrder ?? [];
    this.GlowK = o.GlowK ?? 0;
  }

  P() { return this.B.P; }

  CloseAll() {
    for (const S of [this.Slot, this.PopSlot, this.LoginSlot]) this.B.Layer(S, false);
  }

  // ------------------------------------------------------------ the quest screen (pass on top, daily quests below)
  // claimable quest lines first, then the ones in progress, the lines that are all received at the end
  MakeQuestOrder() {
    const E = CardEdit(this.P());
    const Ready = [], Todo = [], Done = [];
    for (let C = 0; C <= CardQuestChains - 1; C++) {
      const St = CardQuestState(E, CardChainCurrent(E, C));
      if (St === 1) Ready.push(C);
      else if (St === 0) Todo.push(C);
      else Done.push(C);
    }
    this.QOrder = [...Ready, ...Todo, ...Done];
  }

  MaxPTop() { return Max(0, CardPassTiers.length - PassCols); }
  MaxQTop() { return Max(0, this.QOrder.length - QuestVis); }

  FillCell(C, Rs, St) {
    const R = At(Rs, 0);
    if (R) {
      C.Icon.SetImage(CardRewardPic(R));
      C.Icon.SetDesiredSize(CardRewardSize(R, 86.0));
      C.Amt.Set(Rs.length > 1 ? PsBadgeTitle : CardRewardShort(R));
    }
    // received: darker with a check, locked: darker with a lock, can be received: glowing
    // (the cell picture itself is tinted: a square veil would stick out of its round corners)
    const Dim = St === 1 ? CWhite : St === 2 ? color(0.3, 0.42, 0.3) : color(0.36, 0.36, 0.42);
    C.Bg.SetTint(Dim);
    C.Icon.SetTint(Dim);
    C.Mark.SetImage(St === 2 ? CardGui.T_Check : CardGui.T_Lock);
    Show(C.Mark, St === 2 || St === 3 || St === 0);
    Show(C.Glow, St === 1);
    Show(C.Tag.Root, St === 1);
  }

  FillPass() {
    const E = CardEdit(this.P());
    this.PTop = Max(0, Min(this.PTop, this.MaxPTop()));
    this.PtsTxt.Set(PsPts(E.PassPts));
    let Next = -1;
    for (const Tr of CardPassTiers) {
      if (Next < 0 && Tr.Pts > E.PassPts) Next = Tr.Pts;
    }
    this.NextTxt.Set(Next > 0 ? PsNext(Next - E.PassPts) : PsAllReached);
    const Left = CardSeasonLeft();
    this.SeasonTxt.Set(PsSeasonLeft(CardSeasonNow(), Quotient(Left, 86400), Mod(Quotient(Left, 3600), 24)));
    this.PassScrollTxt.Set(PsRange(this.PTop + 1, Min(CardPassTiers.length, this.PTop + PassCols), CardPassTiers.length));
    this.PassLeft.Face.SetTint(this.PTop > 0 ? CWhite : CGrey);
    this.PassRight.Face.SetTint(this.PTop < this.MaxPTop() ? CWhite : CGrey);
    this.Cols.forEach((Col, K) => {
      const T = this.PTop + K;
      const Tr = At(CardPassTiers, T);
      if (Tr) {
        Col.Head.Set(PsPtsHead(Tr.Pts));
        Col.Head.SetColor(E.PassPts >= Tr.Pts ? CGold : CWhite);
        this.FillCell(Col.Free, Tr.Free, CardPassState(E, T, false));
        this.FillCell(Col.Prem, Tr.Prem, CardPassState(E, T, true));
        const Pt = E.PassPts;
        // left half: from halfway after the previous tier up to this tier's mark
        const Pv = At(CardPassTiers, T - 1);
        if (Pv) {
          const Mid = (Pv.Pts + Tr.Pts) * 0.5;
          Col.BarL.Set(Clamp01((Pt * 1.0 - Mid) / Max(1.0, Tr.Pts * 1.0 - Mid)));
        } else {
          Col.BarL.Set(1.0);
        }
        // right half: from this tier's mark halfway to the next tier
        const Nt = At(CardPassTiers, T + 1);
        if (Nt) {
          const Mid = (Tr.Pts + Nt.Pts) * 0.5;
          Col.BarR.Set(Clamp01((Pt * 1.0 - Tr.Pts * 1.0) / Max(1.0, Mid - Tr.Pts * 1.0)));
        } else {
          Col.BarR.Set(Pt >= Tr.Pts ? 1.0 : 0.0);
        }
        const Reached = Pt >= Tr.Pts;
        Col.Tick.SetColor(Reached ? CGold : color(0.25, 0.22, 0.2));
        Col.Dot.SetTextColor(Reached ? CGold : CGrey);
      }
    });
    const Owned = E.PassOwned;
    this.PremState.Set(Owned ? PsPremOn : CardSeasonNow() === 1 ? PsPremOff : PsPremSoon);
    this.PremState.SetColor(Owned ? CGold : CWhite);
    this.PremBtn.Label.Set(Owned ? PsPremOwned : TmVbucks(CardPassVBucks));
    this.PremBtn.Face.SetTint((Owned || CardSeasonNow() !== 1) ? CGrey : CWhite);
  }

  FillQuests() {
    const E = CardEdit(this.P());
    this.QTop = Max(0, Min(this.QTop, this.MaxQTop()));
    this.ResetTxt.Set(TmReset(CardHms(CardSecondsUntilReset())));
    this.ScrollTxt.Set(PsRange(this.QTop + 1, Min(this.QOrder.length, this.QTop + QuestVis), this.QOrder.length));
    this.QUp.Face.SetTint(this.QTop > 0 ? CWhite : CGrey);
    this.QDown.Face.SetTint(this.QTop < this.MaxQTop() ? CWhite : CGrey);
    let Ready = 0;
    for (let C = 0; C <= CardQuestChains - 1; C++) if (CardQuestState(E, CardChainCurrent(E, C)) === 1) Ready += 1;
    const Can = Ready > 0 || CardPassClaimableE(E);
    Show(this.AllBtn.Glow, Can);
    this.AllBtn.Face.SetTint(Can ? CWhite : CGrey);
    this.Rows.forEach((Row, K) => {
      const C = At(this.QOrder, this.QTop + K);
      const QI = C !== undefined ? CardChainCurrent(E, C) : -1;
      const Q = At(CardQuests, QI);
      if (C !== undefined && Q) {
        Row.Root.Set(true);
        const V = Min(Q.Need, CardQuestValue(E, QI));
        const St = CardQuestState(E, QI);
        const Tr = CardQuestTier(QI);
        Row.Name.Set(TxPair(Q.Name, TmTier(Tr[0], Tr[1])));
        Row.Name.SetColor(St === 2 ? CGrey : CWhite);
        Row.Reward.Set(this.QuestReward(Q, CardQuestPtsOf(QI)));
        Row.Reward.SetColor(St === 2 ? CGrey : CGold);
        Row.Bar.Set(V * 1.0 / (Max(1, Q.Need) * 1.0));
        Row.Prog.Set(TxSlash(V, Q.Need));
        Row.Btn.Label.Set(St === 1 ? TmClaim : St === 2 ? TmClaimed : TmNotYet);
        Row.Btn.Face.SetTint(St === 1 ? CWhite : CGrey);
        Show(Row.Btn.Glow, St === 1);
        Row.Bg.SetColor(St === 1 ? color(0.24, 0.13, 0.012) : color(0.05, 0.04, 0.08));
      } else {
        Row.Root.Set(false);
      }
    });
  }

  QuestReward(Q, Pts) {
    const L = [];
    if (Q.Coins > 0) L.push(PrCoins(Q.Coins));
    if (Q.Gems > 0) L.push(PrGems(Q.Gems));
    if (Q.Xp > 0) L.push(TmXp(Q.Xp));
    L.push(PsPtsPlus(Pts));
    return Join(L, PsSep);
  }

  FillAll() {
    this.FillPass();
    this.FillQuests();
  }

  Ids() {
    const Shown = Min(QuestVis, this.QOrder.length - this.QTop);
    const R = [1122, 1120];
    for (let K = 0; K <= PassCols - 1; K++) R.push(1100 + K);
    R.push(1121);
    for (let K = 0; K <= PassCols - 1; K++) R.push(1110 + K);
    for (let K = 0; K <= Shown - 1; K++) R.push(1130 + K);
    R.push(1140, 1141, 1150, 1151);
    return R;
  }

  // the cursor leaving the last shown cell / row scrolls the list (controller); see board_ui.PickScroll
  Edges() {
    const M = new Map();
    const Put = K => { M.set(K, true); M[K] = true; };
    const Last = PassCols - 1;
    if (this.PTop < this.MaxPTop()) {
      Put((1100 + Last) * 4 + 0);
      Put((1110 + Last) * 4 + 0);
    }
    if (this.PTop > 0) {
      Put(1100 * 4 + 1);
      Put(1110 * 4 + 1);
    }
    const LastRow = QuestVis - 1;
    if (this.QTop < this.MaxQTop()) {
      Put((1130 + LastRow) * 4 + 0);
      Put((1130 + LastRow) * 4 + 2);
    }
    if (this.QTop > 0) {
      Put(1130 * 4 + 1);
      Put(1130 * 4 + 3);
    }
    return M;
  }

  // the countdowns and the glow of what can be received (-1 = a new day; Ctl.Stop ends it when the race is over)
  async Tick(Ctl) {
    const B = this.B;
    const Day = CardToday();
    for (;;) {
      await Sleep(0.1);
      if (Ctl.Stop || !B.Opened) break;
      this.GlowK += 1;
      const Sz = 1.0 + 0.025 * Sin(this.GlowK * 0.35);
      for (const Col of this.Cols) for (const C of [Col.Free, Col.Prem]) C.Glow.SetDesiredSize(V2(206.0 * Sz, 162.0 * Sz));
      if (Mod(this.GlowK, 10) === 0) {
        this.ResetTxt.Set(TmReset(CardHms(CardSecondsUntilReset())));
        const Left = CardSeasonLeft();
        this.SeasonTxt.Set(PsSeasonLeft(CardSeasonNow(), Quotient(Left, 86400), Mod(Quotient(Left, 3600), 24)));
        if (CardToday() !== Day) break;
      }
    }
    return -1;
  }

  // the daily quest screen with the quest reward pass (returns on 戻る)
  async QuestScreen() {
    const B = this.B;
    spawn(() => CardCheckPass(this.P()));
    const E = CardEdit(this.P());
    this.PTop = CardPassFirstShown(E);
    this.QTop = 0;
    this.MakeQuestOrder();
    this.FillAll();
    B.Snd(SfxOpen);
    B.Layer(this.Slot, true);
    try {
      // the cursor starts on something that can be received
      let Def = 1151;
      if (CardPassClaimableE(E)) {
        for (let K = 0; K <= PassCols - 1; K++) {
          if (Def === 1151) {
            if (CardPassState(E, this.PTop + K, false) === 1) Def = 1100 + K;
            else if (CardPassState(E, this.PTop + K, true) === 1) Def = 1110 + K;
          }
        }
      }
      const C0 = At(this.QOrder, 0);
      if (Def === 1151 && C0 !== undefined && CardQuestState(E, CardChainCurrent(E, C0)) === 1) Def = 1130;
      B.CurId = Def;
      for (;;) {
        this.FillAll();
        const Ctl = { Stop: false };
        const Id = await Race(B.PickScroll(this.Ids(), Def, 1151, this.Edges()), this.Tick(Ctl));
        Ctl.Stop = true;
        if (Id === 1151) {
          B.Snd(SfxCancel);
          return;
        }
        if (Id === -1) {
          // a new day: the quests start again
          this.MakeQuestOrder();
        } else if (Id <= NavScroll && Id >= NavScroll - 3) {
          const Fwd = (Id === NavScroll || Id === NavScroll - 2) ? 1 : -1;
          if (B.CurId >= 1100 && B.CurId <= 1115) this.PTop = Max(0, Min(this.MaxPTop(), this.PTop + Fwd));
          else this.QTop = Max(0, Min(this.MaxQTop(), this.QTop + Fwd));
          B.Snd(SfxFlip);
        } else if (Id === 1120 || Id === 1121) {
          const Old = this.PTop;
          this.PTop = Max(0, Min(this.MaxPTop(), this.PTop + (Id === 1121 ? 2 : -2)));
          B.Snd(this.PTop !== Old ? SfxFlip : SfxCancel);
        } else if (Id === 1140 || Id === 1141) {
          const Old = this.QTop;
          this.QTop = Max(0, Min(this.MaxQTop(), this.QTop + (Id === 1141 ? 1 : -1)));
          B.Snd(this.QTop !== Old ? SfxFlip : SfxCancel);
        } else if (Id === 1122) {
          await this.BuyPremium();
        } else if (Id >= 1100 && Id <= 1115) {
          await this.ClaimCell(this.PTop + Mod(Id - 1100, 10), Id >= 1110);
        } else if (Id >= 1130 && Id < 1130 + QuestVis) {
          const C = At(this.QOrder, this.QTop + Id - 1130);
          if (C !== undefined) {
            const G = CardClaimQuest(this.P(), CardChainCurrent(CardEdit(this.P()), C));
            if (G != null) {
              B.Snd(SfxQuest);
              await this.GainPop(G, TmQuestDone);
              this.MakeQuestOrder();
            } else {
              B.Snd(SfxCancel);
              const E2 = CardEdit(this.P());
              B.Notice(CardQuestState(E2, CardChainCurrent(E2, C)) === 2 ? PsQuestAllDone : PsQuestNotYet);
            }
          }
        } else if (Id === 1150) {
          await this.ClaimAll();
        }
      }
    } finally {
      B.Layer(this.Slot, false);
    }
  }

  async ClaimCell(T, Prem) {
    const B = this.B;
    const E = CardEdit(this.P());
    const St = CardPassState(E, T, Prem);
    if (St === 1) {
      const Rs = CardClaimPass(this.P(), T, Prem);
      if (Rs.length > 0) await this.RewardPop(Rs, Prem ? PsGotPrem : PsGotFree, TxEmpty);
    } else {
      B.Snd(SfxCancel);
      const Tr = At(CardPassTiers, T);
      const Need = Tr ? Tr.Pts : 0;
      B.Notice(St === 2 ? PsAlready : St === 3 ? PsNeedPrem : PsNeedPts(Max(0, Need - E.PassPts)));
    }
  }

  async ClaimAll() {
    const B = this.B;
    const Got = CardClaimAllQuests(this.P());
    const Rs = CardClaimAllPass(this.P());
    let All = [];
    let Sub = TxEmpty;
    if (Got != null) {
      if (Got.Coins > 0) All.push(new card_reward({ Kind: RwCoins, N: Got.Coins }));
      if (Got.Gems > 0) All.push(new card_reward({ Kind: RwGems, N: Got.Gems }));
      Sub = this.GainSub(Got);
    }
    All = CardMergeRewards([...All, ...Rs]);
    if (All.length === 0 && Got == null) {
      B.Snd(SfxCancel);
      B.Notice(PsNothing);
      return;
    }
    B.Snd(SfxQuest);
    this.MakeQuestOrder();
    this.FillAll();
    await this.RewardPop(All, TmQuestAll, Sub);
    // points from the quests may have opened new pass rewards
    const Later = CardClaimAllPass(this.P());
    if (Later.length > 0) await this.RewardPop(CardMergeRewards(Later), PsGotFree, TxEmpty);
  }

  GainSub(G) {
    const L = [];
    if (G.Xp > 0) L.push(TmXp(G.Xp));
    if (G.Pts > 0) L.push(PsPtsPlus(G.Pts));
    if (G.LevelTo > G.LevelFrom) L.push(TmLevelUp(G.LevelFrom, G.LevelTo, G.LevelCoins, G.LevelGems));
    return Join(L, PsSep);
  }

  async GainPop(G, Head) {
    const Rs = [];
    if (G.Coins > 0) Rs.push(new card_reward({ Kind: RwCoins, N: G.Coins }));
    if (G.Gems > 0) Rs.push(new card_reward({ Kind: RwGems, N: G.Gems }));
    await this.RewardPop(Rs, Head, this.GainSub(G));
  }

  async BuyPremium() {
    const B = this.B;
    if (CardEdit(this.P()).PassOwned) {
      B.Snd(SfxCancel);
      B.Notice(PsPremAlready);
      return;
    }
    if (CardSeasonNow() !== 1) {
      B.Snd(SfxCancel);
      B.Notice(PsPremSoon);
      return;
    }
    B.Snd(SfxClick);
    // (Verse: B.Notice(TmVbucksOpen) and Epic's purchase screen) — no V-Bucks in the browser
    await ComingSoon(B);
    const Bought = await CardBuyPass(this.P());
    if (Bought) {
      this.FillAll();
      await this.RewardPop([], PsPremUnlocked, PsPremUnlockedSub);
    }
  }

  // ------------------------------------------------------------ the reward pop-up (rays, a flash, the rewards pop out)
  async RewardPop(Rs, Head, Sub) {
    const B = this.B;
    this.PopHead.Set(Head);
    this.PopSub.Set(Sub);
    const Shown = Rs.length === 0 ? [new card_reward({ Kind: -1 })] : Rs;
    const N = Min(Shown.length, this.PopRoots.length);
    for (const R of this.PopRoots) this.PopCanvas.RemoveWidget(R);
    B.Layer(this.PopSlot, true);
    try {
      this.PopCanvas.AddWidget(RFull(this.PopFlash, 20));
      B.Snd(SfxJackpot);
      await Sleep(0.1);
      this.PopCanvas.RemoveWidget(this.PopFlash);
      B.Fx.PlayZ(VfxSummonBig, V2(960.0, 470.0), 130);
      const Gap = 300.0;
      const X0 = 960.0 - (N - 1) * Gap / 2.0;
      for (let K = 0; K <= N - 1; K++) {
        const R = At(Shown, K), Rt = At(this.PopRoots, K), Ic = At(this.PopIcons, K), Nm = At(this.PopNames, K);
        if (!R || !Rt || !Ic || !Nm) continue;
        Ic.SetImage(R.Kind < 0 ? CardGui.T_PassPrem : CardRewardPic(R));
        Nm.Set(R.Kind < 0 ? PsPassName : CardRewardName(R));
        this.PopCanvas.AddWidget(RBox(Rt, X0 + K * Gap - 140.0, 320.0, 280.0, 340.0, 8));
        // each one pops: a little too big, then settles
        const Full = R.Kind < 0 ? V2(220.0, 220.0) : CardRewardSize(R, 200.0);
        for (const F of [0.3, 0.8, 1.2, 1.1, 1.0]) {
          Ic.SetDesiredSize(V2(Full.X * F, Full.Y * F));
          await Sleep(0.03);
        }
        B.Snd(SfxCoin);
        B.Fx.PlayZ(VfxSummon, V2(X0 + K * Gap, 430.0), 131);
      }
      B.CurId = 1190;
      const Ctl = { Stop: false };
      await Race(B.Pick([1190], 1190, 1190), this.PopFx(Ctl));
      Ctl.Stop = true;
      B.Snd(SfxClick);
    } finally {
      B.Layer(this.PopSlot, false);
    }
  }

  async PopFx(Ctl) {
    const B = this.B;
    let K = 0;
    for (;;) {
      if (Ctl.Stop) return;
      K += 1;
      const A = 1150.0 + 80.0 * Sin(K * 0.18);
      const Bz = 1050.0 + 80.0 * Sin(K * 0.18 + 1.6);
      this.PopRays.SetDesiredSize(V2(A, A));
      this.PopRaysB.SetDesiredSize(V2(Bz, Bz));
      if (Mod(K, 12) === 0) {
        const X = 560.0 + Mod(K * 37, 800) * 1.0;
        const Y = 280.0 + Mod(K * 53, 380) * 1.0;
        B.Fx.PlayZ(VfxSummon, V2(X, Y), 130);
      }
      await Sleep(0.05);
    }
  }

  // ------------------------------------------------------------ the login bonus (opens by itself; only 受け取る closes it)
  FillLogin(No, Got) {
    // No: login bonuses received before today's; the week of today's bonus is shown (day 8..14 after day 7, ...)
    const Week = Quotient(No, 7);
    const Today = Mod(No, 7);
    this.LoginTiles.forEach((T, I) => {
      const R = At(CardLoginBonus, I);
      if (!R) return;
      T.Day.Set(PsDay(Week * 7 + I + 1));
      T.Icon.SetImage(CardRewardPic(R));
      T.Amt.Set(R.Kind === RwTickets ? PsLoginT(R.N) : PsLoginE(R.N));
      const Done = I < Today || (I === Today && Got);
      T.Bg.SetTint(Done ? color(0.45, 0.45, 0.45) : CWhite);
      T.Icon.SetTint(Done ? color(0.45, 0.45, 0.45) : CWhite);
      Show(T.Check, Done);
      Show(T.Glow, I === Today && !Got);
    });
    this.LoginInfo.Set(PsLoginInfo(No + 1));
  }

  async LoginTick(Today, Ctl) {
    let K = 0;
    for (;;) {
      if (Ctl.Stop) return;
      K += 1;
      const T = At(this.LoginTiles, Today);
      if (T) {
        const F = 1.0 + 0.015 * Sin(K * 0.3);
        const W = Today === 6 ? 376.0 : 276.0;
        const H = Today === 6 ? 596.0 : 296.0;
        T.Glow.SetDesiredSize(V2(W * F, H * F));
      }
      this.LoginBtnTxt.SetColor(Mod(Quotient(K, 6), 2) === 0 ? CGold : CWhite);
      await Sleep(0.06);
    }
  }

  // true when a bonus was received
  async LoginBonus() {
    const B = this.B;
    if (!CardLoginReady(this.P())) return false;
    const No = GetCardSave(this.P()).LoginNo;
    const Today = Mod(No, 7);
    this.FillLogin(No, false);
    B.Snd(SfxOpen);
    B.Layer(this.LoginSlot, true);
    try {
      B.CurId = 1010;
      // (no cancel: the window stays until the bonus is received)
      const Ctl = { Stop: false };
      await Race(B.Pick([1010, 1000 + Today], 1010, -1), this.LoginTick(Today, Ctl));
      Ctl.Stop = true;
      const R = CardClaimLoginBonus(this.P());
      if (R != null) {
        B.Snd(SfxPlace);
        this.FillLogin(No, true);
        const T = At(this.LoginTiles, Today);
        if (T) {
          // the stamp lands on today's tile
          for (const Sz of [240.0, 170.0, 110.0, 96.0]) {
            T.Check.SetDesiredSize(V2(Sz, Sz));
            await Sleep(0.04);
          }
        }
        B.Snd(SfxQuest);
        await Sleep(0.35);
        await this.RewardPop([R], PsLoginGot(No + 1), TxEmpty);
        return true;
      }
      return false;
    } finally {
      B.Layer(this.LoginSlot, false);
    }
  }
}

// ---------------------------------------------------------------- building the screens
// [pass_cell, its canvas]
function MakePassCell(B, Id, Bg, Glow) {
  const BgT = Tex(Bg, 200.0, 156.0);
  const Icon = Tex(CardGui.T_TicketN, 86.0, 53.0);
  const Amt = OText(TxEmpty, 26.0, CWhite, CInk);
  const Veil = new color_block({ DefaultColor: color(0.0, 0.0, 0.02), DefaultOpacity: 0.55 });
  const Mark = Tex(CardGui.T_Lock, 58.0, 58.0);
  const Gl = TexTint(Bg, 206.0, 162.0, Glow);
  const Tag = OText(TmClaim, 20.0, CGold, CInk);
  Show(Gl, false);
  Show(Tag.Root, false);
  const Root = new canvas({
    Slots: [
      Pin(Gl, 100.0, 78.0, 0),
      Box(BgT, 0.0, 0.0, 200.0, 156.0, 1),
      Pin(Icon, 100.0, 66.0, 2),
      Pin(Amt.Root, 100.0, 128.0, 3),
      Pin(Mark, 100.0, 70.0, 5),
      Pin(Tag.Root, 100.0, 16.0, 6),
      Box(B.Hub.Make(Id), 0.0, 0.0, 200.0, 156.0, 10),
    ],
  });
  return [new pass_cell({ Bg: BgT, Icon: Icon, Amt: Amt, Veil: Veil, Mark: Mark, Glow: Gl, Tag: Tag }), Root];
}

function MakePassUI(B, Lib) {
  // ---- the quest screen
  const S = [MakeOverlayDim(0.88), RBox(Tex(CardGui.T_PanelLog, 1860.0, 1040.0), 30.0, 20.0, 1860.0, 1040.0, 1)];
  const PtsTxt = OText(TxEmpty, 30.0, CGold, CInk);
  const NextTxt = OText(TxEmpty, 20.0, CWhite, CInk);
  const SeasonTxt = OText(TxEmpty, 22.0, CBlue, CInk);
  const ResetTxt = OText(TxEmpty, 22.0, CBlue, CInk);
  const ScrollTxt = OText(TxEmpty, 18.0, CWhite, CInk);
  const PassScrollTxt = OText(TxEmpty, 18.0, CWhite, CInk);
  const PremState = OText(TxEmpty, 20.0, CWhite, CInk);
  S.push(
    RBox(Tex(CardGui.T_Banner, 820.0, 110.0), 550.0, 26.0, 820.0, 110.0, 2),
    RPin(OText(PsTitle1, 42.0, CGold, CInk).Root, 960.0, 80.0, 3),
    RPinL(PtsTxt.Root, 90.0, 66.0, 3),
    RPinL(NextTxt.Root, 92.0, 106.0, 3),
    RPin(SeasonTxt.Root, 1640.0, 80.0, 3),
    RPin(PassScrollTxt.Root, 1170.0, 565.0, 3));
  // the premium pass panel (left)
  const PB = MBtn(B, 1122, BtnPurple, TmVbucks(CardPassVBucks), 78.0, 470.0, 260.0, 70.0, 22.0);
  S.push(
    RBox(TexTint(CardGui.T_GlowCard, 300.0, 430.0, CPink), 58.0, 130.0, 300.0, 430.0, 2),
    RBox(new color_block({ DefaultColor: color(0.06, 0.02, 0.08), DefaultOpacity: 0.85 }), 78.0, 150.0, 260.0, 390.0, 3),
    RPin(OText(PsGetPrem, 24.0, CPink, CInk).Root, 208.0, 178.0, 4),
    RBox(Tex(CardGui.T_PassPrem, 190.0, 190.0), 113.0, 205.0, 190.0, 190.0, 4),
    RPin(PremState.Root, 208.0, 420.0, 4),
    PB[0]);
  // row labels
  S.push(
    RBox(Tex(CardGui.T_PassFree, 96.0, 96.0), 390.0, 196.0, 96.0, 96.0, 3),
    RPin(OText(PsFree, 22.0, CWhite, CInk).Root, 438.0, 312.0, 4),
    RBox(Tex(CardGui.T_PassPrem, 96.0, 96.0), 390.0, 386.0, 96.0, 96.0, 3),
    RPin(OText(PsPremium, 22.0, CPink, CInk).Root, 438.0, 502.0, 4));
  // (the arrows sit outside the track: ◀ ends at 522, the track is 540..1812, ▶ starts at 1824)
  const PL = MBtn(B, 1120, BtnBlue, PsArrowL, 478.0, 300.0, 44.0, 100.0, 26.0);
  const PR = MBtn(B, 1121, BtnBlue, PsArrowR, 1824.0, 300.0, 44.0, 100.0, 26.0);
  S.push(PL[0], PR[0]);
  // the progress track behind the bars
  S.push(RBox(new color_block({ DefaultColor: color(0.02, 0.015, 0.01), DefaultOpacity: 0.9 }), 540.0, 346.0, 1272.0, 24.0, 2));
  const Cols = [];
  for (let K = 0; K <= PassCols - 1; K++) {
    const X = PassColX(K);
    const Head = OText(TxEmpty, 24.0, CWhite, CInk);
    const Fill = color(0.3, 1.0, 0.45);
    const Empty = color(0.08, 0.05, 0.03);
    const BarL = MakeBar(100.0, 16.0, Empty, Fill, false);
    const BarR = MakeBar(112.0, 16.0, Empty, Fill, false);
    const Tick = new color_block({ DefaultColor: color(0.25, 0.22, 0.2) });
    // (no shadow: it sits right in the middle of the line)
    const Dot = new text_block({ DefaultText: PsMark, DefaultTextColor: CGrey, DefaultTextSize: 28.0, DefaultJustification: text_justification.Center });
    const F = MakePassCell(B, 1100 + K, CardGui.T_PassCell, CBlue);
    const Pm = MakePassCell(B, 1110 + K, CardGui.T_PassCellP, CPink);
    Cols.push(new pass_col({ Head: Head, BarL: BarL, BarR: BarR, Tick: Tick, Dot: Dot, Free: F[0], Prem: Pm[0] }));
    S.push(
      RPin(Head.Root, X + 100.0, 164.0, 4),
      RBox(F[1], X, 182.0, 200.0, 156.0, 4),
      RBox(BarL.Root, X, 350.0, 100.0, 16.0, 3),
      RBox(BarR.Root, X + 100.0, 350.0, 112.0, 16.0, 3),
      // the mark: the reward of this column can be received once the bar reaches it
      RBox(Tick, X + 97.0, 338.0, 6.0, 40.0, 5),
      RPin(Dot, X + 100.0, 358.0, 6),
      RBox(Pm[1], X, 380.0, 200.0, 156.0, 4));
    B.AddBounds(1100 + K, { X: X, Y: 182.0, W: 200.0, H: 156.0 });
    B.AddBounds(1110 + K, { X: X, Y: 380.0, W: 200.0, H: 156.0 });
  }
  // the daily quests (between the pass and the buttons)
  S.push(
    RBox(new color_block({ DefaultColor: color(0.3, 0.2, 0.05), DefaultOpacity: 0.8 }), 90.0, 586.0, 1740.0, 4.0, 2),
    RPin(OText(TmQuests, 34.0, CGold, CInk).Root, 960.0, 612.0, 3),
    RPin(ResetTxt.Root, 1600.0, 612.0, 3),
    RPin(ScrollTxt.Root, 1800.0, 790.0, 3));
  const Rows = [];
  for (let K = 0; K <= QuestVis - 1; K++) {
    const Y = QuestRowY(K);
    const Bg = new color_block({ DefaultColor: color(0.05, 0.04, 0.08), DefaultOpacity: 0.8 });
    const Nm = OText(TxEmpty, 26.0, CWhite, CInk);
    const Rw = OText(TxEmpty, 20.0, CGold, CInk);
    const Bar = MakeBar(330.0, 22.0, color(0.1, 0.06, 0.03), color(0.3, 1.0, 0.45), false);
    const Pr = OText(TxEmpty, 22.0, CWhite, CInk);
    const Btn = MakePicButton(BtnGold, TmNotYet, 230.0, 72.0, 26.0, NoHit());
    const Rt = new canvas({
      Slots: [
        Box(Bg, 0.0, 0.0, 1640.0, 92.0, 0),
        PinL(Nm.Root, 24.0, 28.0, 2),
        PinL(Rw.Root, 24.0, 66.0, 2),
        Box(Bar.Root, 1000.0, 24.0, 330.0, 22.0, 2),
        Pin(Pr.Root, 1165.0, 66.0, 2),
        Box(Btn.Root, 1385.0, 8.0, 230.0, 78.0, 2),
        Box(B.Hub.Make(1130 + K), 0.0, 0.0, 1640.0, 92.0, 5),
      ],
    });
    Rows.push(new pass_row({ Bg: Bg, Name: Nm, Reward: Rw, Bar: Bar, Prog: Pr, Btn: Btn, Root: MakeSw(Rt, true) }));
    S.push(RBox(Rt, 100.0, Y, 1640.0, 92.0, 4));
    B.AddBounds(1130 + K, { X: 100.0, Y: Y, W: 1640.0, H: 92.0 });
  }
  const QU = MBtn(B, 1140, BtnBlue, PsArrowU, 1760.0, 640.0, 80.0, 110.0, 26.0);
  const QD = MBtn(B, 1141, BtnBlue, PsArrowD, 1760.0, 830.0, 80.0, 110.0, 26.0);
  const QA = MBtn(B, 1150, BtnGold, TmClaimAll, 560.0, 956.0, 400.0, 74.0, 28.0);
  const QB = MBtn(B, 1151, BtnBlue, TmBack, 1000.0, 956.0, 360.0, 74.0, 28.0);
  S.push(QU[0], QD[0], QA[0], QB[0]);
  // ---- the reward pop-up
  const PopRays = TexTint(CardGui.T_Rays, 1150.0, 1150.0, CGold);
  const PopRaysB = TexTint(CardGui.T_RaysB, 1050.0, 1050.0, CPink);
  const PopHead = OText(TxEmpty, 54.0, CGold, CRed);
  const PopSub = OText(TxEmpty, 26.0, CWhite, CInk);
  const PopFlash = new color_block({ DefaultColor: CWhite, DefaultOpacity: 0.85 });
  const PopIcons = [];
  const PopNames = [];
  const PopRoots = [];
  for (let K = 0; K <= 5; K++) {
    const Ic = Tex(CardGui.T_TicketN, 200.0, 124.0);
    const Nm = OText(TxEmpty, 24.0, CWhite, CInk);
    PopIcons.push(Ic);
    PopNames.push(Nm);
    PopRoots.push(new canvas({ Slots: [Box(TexTint(CardGui.T_GlowCard, 280.0, 280.0, CGold), 0.0, 0.0, 280.0, 280.0, 0), Pin(Ic, 140.0, 140.0, 1), Pin(Nm.Root, 140.0, 310.0, 2)] }));
  }
  const PopOk = MBtn(B, 1190, BtnGold, TbOk, 810.0, 900.0, 300.0, 86.0, 34.0);
  const PopCanvas = new canvas({
    Slots: [
      MakeOverlayDim(0.8),
      RPin(PopRaysB, 960.0, 480.0, 1),
      RPin(PopRays, 960.0, 480.0, 2),
      RBox(Tex(CardGui.T_Banner, 1100.0, 170.0), 410.0, 60.0, 1100.0, 170.0, 3),
      RPin(PopHead.Root, 960.0, 140.0, 4),
      RPin(PopSub.Root, 960.0, 790.0, 4),
      PopOk[0],
    ],
  });
  // ---- the login bonus
  const LoginInfo = OText(TxEmpty, 26.0, CBrown, CCream);
  const LoginBtnTxt = OText(PsLoginBtn, 44.0, CGold, CInk);
  const LS = [MakeOverlayDim(0.75), RBox(Tex(CardGui.T_LoginPanel, 1400.0, 860.0), 260.0, 110.0, 1400.0, 860.0, 1)];
  LS.push(
    RPin(OText(PsLoginTitle, 52.0, CWhite, CRed).Root, 960.0, 175.0, 3),
    RPin(LoginInfo.Root, 960.0, 250.0, 3));
  const Tiles = [];
  for (let I = 0; I <= 6; I++) {
    const Big = I === 6;
    const X = Big ? 1230.0 : 330.0 + Mod(I, 3) * 295.0;
    const Y = Big ? 290.0 : 290.0 + Quotient(I, 3) * 310.0;
    const W = Big ? 360.0 : 260.0;
    const H = Big ? 580.0 : 280.0;
    const Day = OText(TxEmpty, Big ? 34.0 : 28.0, CBrown, CCream);
    const Ic = Tex(CardGui.T_TicketN, Big ? 250.0 : 170.0, Big ? 155.0 : 105.0);
    const Amt = OText(TxEmpty, Big ? 30.0 : 24.0, CBrown, CCream);
    const Veil = new color_block({ DefaultColor: color(0.02, 0.02, 0.03), DefaultOpacity: 0.55 });
    const Ck = Tex(CardGui.T_Check, 96.0, 96.0);
    const Gl = TexTint(Big ? CardGui.T_LoginDay7 : CardGui.T_LoginDay, W + 16.0, H + 16.0, CGold);
    Show(Veil, false);
    Show(Ck, false);
    Show(Gl, false);
    const TileBg = Tex(Big ? CardGui.T_LoginDay7 : CardGui.T_LoginDay, W, H);
    Tiles.push(new login_tile({ Bg: TileBg, Day: Day, Icon: Ic, Amt: Amt, Veil: Veil, Check: Ck, Glow: Gl }));
    LS.push(
      RPin(Gl, X + W / 2.0, Y + H / 2.0, 2),
      RBox(TileBg, X, Y, W, H, 3),
      RPin(Day.Root, X + W / 2.0, Y + (Big ? 50.0 : 36.0), 4),
      RPin(Ic, X + W / 2.0, Y + H / 2.0 + (Big ? -10.0 : 4.0), 4),
      RPin(Amt.Root, X + W / 2.0, Y + H - (Big ? 90.0 : 40.0), 4),
      RPin(Ck, X + W / 2.0, Y + H / 2.0, 6),
      RBox(B.Hub.Make(1000 + I), X, Y, W, H, 8));
    B.AddBounds(1000 + I, { X: X, Y: Y, W: W, H: H });
  }
  // 受け取る: a see-through button (a dark glass strip with gold lines) so the text stays easy to read
  LS.push(
    RBox(new color_block({ DefaultColor: color(0.0, 0.0, 0.0), DefaultOpacity: 0.35 }), 700.0, 892.0, 520.0, 64.0, 3),
    RBox(new color_block({ DefaultColor: CGold, DefaultOpacity: 0.9 }), 700.0, 892.0, 520.0, 3.0, 4),
    RBox(new color_block({ DefaultColor: CGold, DefaultOpacity: 0.9 }), 700.0, 953.0, 520.0, 3.0, 4),
    RPin(LoginBtnTxt.Root, 960.0, 924.0, 5),
    RBox(B.Hub.Make(1010), 700.0, 892.0, 520.0, 64.0, 8));
  B.AddBounds(1010, { X: 700.0, Y: 892.0, W: 520.0, H: 64.0 });
  return new pass_ui({
    B: B,
    Lib: Lib,
    Slot: RFull(new canvas({ Slots: S }), 96),
    Cols: Cols,
    Rows: Rows,
    PtsTxt: PtsTxt,
    NextTxt: NextTxt,
    SeasonTxt: SeasonTxt,
    ResetTxt: ResetTxt,
    ScrollTxt: ScrollTxt,
    PassScrollTxt: PassScrollTxt,
    PremState: PremState,
    PremBtn: PB[1],
    AllBtn: QA[1],
    PassLeft: PL[1],
    PassRight: PR[1],
    QUp: QU[1],
    QDown: QD[1],
    PopSlot: RFull(PopCanvas, 126),
    PopCanvas: PopCanvas,
    PopRays: PopRays,
    PopRaysB: PopRaysB,
    PopHead: PopHead,
    PopSub: PopSub,
    PopIcons: PopIcons,
    PopNames: PopNames,
    PopRoots: PopRoots,
    PopFlash: PopFlash,
    LoginSlot: RFull(new canvas({ Slots: LS }), 98),
    LoginTiles: Tiles,
    LoginInfo: LoginInfo,
    LoginBtnTxt: LoginBtnTxt,
  });
}

// ---------------------------------------------------------------- texts
const PsTitle1 = "クエスト報酬";
function PsPts(N) { return `所持ポイント ${N} pt`; }
function PsNext(N) { return `次の報酬まで あと ${N} pt`; }
const PsAllReached = "すべての報酬に到達！";
function PsSeasonLeft(S, D, H) { return `シーズン${S}終了まで ${D}日${H}時間`; }
function PsPtsHead(N) { return `${N} pt`; }
function PsPtsPlus(N) { return `+${N} pt`; }
function PsRange(A, B, N) { return `${A}-${B} / ${N}`; }
const PsSep = "　";
const PsFree = "フリー";
const PsPremium = "プレミアム";
const PsGetPrem = "プレミアムパス";
const PsPremOn = "解放済み！";
const PsPremOff = "解放でさらに報酬GET！";
const PsPremSoon = "次のシーズンは準備中";
const PsPremOwned = "解放済み";
const PsPremAlready = "プレミアムパスはもう解放しているよ";
const PsPremUnlocked = "プレミアムパス解放！";
const PsPremUnlockedSub = "プレミアムの報酬も受け取れるようになったよ";
const PsPassName = "プレミアムパス（シーズン1）";
const PsPassDesc = "デュエルデュエルのクエスト報酬でプレミアムの報酬（バッチ・称号・カード裏面・着せ替え・確定チケットなど）も受け取れるようになるシーズン1限定のパス。";
const PsMark = "◆";
const PsArrowL = "◀";
const PsArrowR = "▶";
const PsArrowU = "▲";
const PsArrowD = "▼";
const PsBadge = "バッチ";
const PsTitle = "称号";
const PsBack = "カード裏面";
const PsSkin = "着せ替え";
const PsBadgeTitle = "バッチ＋称号";
const PsSeason1 = "シーズン1";
const PsGotFree = "報酬ゲット！";
const PsGotPrem = "プレミアム報酬ゲット！";
const PsAlready = "この報酬はもう受け取ったよ";
const PsNeedPrem = "プレミアムパスを解放すると受け取れるよ";
function PsNeedPts(N) { return `あと ${N} pt で受け取れるよ`; }
const PsNothing = "受け取れるものはまだないよ";
const PsQuestNotYet = "このクエストはまだ達成していないよ";
const PsQuestAllDone = "このクエストは今日はすべて達成したよ";
function PrTickets(N) { return `ガチャチケット×${N}枚`; }
function PrTicketsE(N) { return `エピック以上確定チケット×${N}枚`; }
function PrTicketsL(N) { return `レジェンド以上確定チケット×${N}枚`; }
function PrCoins(N) { return `${N}コイン`; }
function PrGems(N) { return `${N}ジェム`; }
function PrBack(B) { return `カード裏面「${B}」`; }
function PrSkin(H, S) { return `${H}着せ替え「${S}」`; }
const PsLoginTitle = "ログインボーナス";
function PsLoginInfo(N) { return `今日は ${N}日目！ 毎日ログインして報酬をもらおう`; }
const PsLoginBtn = "受け取る";
function PsDay(N) { return `${N}日目`; }
function PsLoginT(N) { return `ガチャチケット×${N}`; }
function PsLoginE(N) { return `エピック以上確定\nチケット×${N}`; }
function PsLoginGot(N) { return `ログインボーナス ${N}日目！`; }
