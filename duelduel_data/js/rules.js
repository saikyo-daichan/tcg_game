// rules.js — card_rules.verse: one match (game state, rules, effects, turn flow, player input and the AI).
// Side 0 / 1; each side is played by a human (its board_ui in Views[W]), by the network (online: Net.Remote === W) or by
// the AI. Every human sees the board from its own side.
//
// Ported 1:1 (every Verse name kept). Notes / changes:
// - <decides> methods: the ones that give a value (MonAt, AmuletAt, ViewOf, ActionFor, HandIdxOf, UnitColOf, PickOne, TgtOfUi)
//   return it or undefined; the void ones (Hidden, IsBlocked, NoTarget, HasTwoActs, HasExclusive, CanPay, OnBoard,
//   SelfCast, KwBlocked, AiCanFace, AiKills, AiDies, AiWin, AiMayHit, AiLethal, AiEvoTrade, AiEvoSaves) return true / false.
//   Options: Pend / ForceTgt / PicOverride... are null when empty; PickSecond returns a tgt or null.
// - Verse arrays are values: Board / Hand / Deck / Grave / Bank / StampAt are never mutated, always replaced (RuWith).
// - tgt is a struct: compared by value (RuTgtEq / RuTgtIn).
// - Online lockstep (PORTING.md): card_match gets Seed (default random) and Net (default null). Every random number
//   of the rules / AI comes from this.Rng. Every player input / clock value that changes the game goes through
//   this.Decide(W, Fn, Def). Decide points: each turn action (PlayerTurn -> DecideExec / end turn / time out /
//   surrender, played back by RemoteTurn), the time bank at the end of a turn (TakeTurn), the mulligan (MullFor),
//   ChooseOf (どちらかを選ぶ / 墓地から選ぶ / 死者の行進), PickSecond (送還の風 second target), PickDiscount (大安売り).
//   A remote side (IsRemote) never uses the AI or a view: wherever Verse asked "ViewOf[W]" to decide between the
//   player's pick and the AI, this port asks Human(W) (a local view or the remote player).
//   Concede(W, Reason) (lobby.js: the remote player surrendered while waiting / left) ends the match now: every
//   Decide that waits for the network gives up (returns its Def) and the turn race ends.
//   The waiting local player's surrender (IdleLoop) calls ConcedeLocal(W): Net.Concede(W) (tells the other browser,
//   which calls Concede(W) there) then Concede(W). Stamps: Net.Stamp(W, K); the lobby calls RemoteStamp(W, K) on receipt.
// - Verse race: the losers keep running in JS, so TakeTurn gives IdleLoop / Clock a stop token, WaitTurnInput stops
//   its clock loop, and after every turn the views' CancelWait() (board.js) kills input waits that lost the race.
// - Web AI (not in Verse): every pause of a match is this.Wait(S) (= Sleep, or nothing in a look-ahead copy). NpcTurn
//   asks AiNext: the candidate actions are played on copies of the match (AiClone / AiTry, Sim = true: no screens, no
//   waiting, own random numbers; the real match and its Rng are never changed) and the positions valued (AiEval).
//   Levels: 0 初級 = the classic ScoreAct choice minus useless plays / blunders, 1 中級 = best position after the
//   action, 2 上級 = + follow-up actions, lethal search, the enemy's reply played out, 3 最恐 = 上級 knowing its draws,
//   the random results and the enemy hand. FxScore / ScoreAct also skip plays that do nothing (AoE on an empty board,
//   buffs without allies, 値引きの魔法 with nothing to discount, マナ解放 that opens nothing, monsters like
//   プレゼント箱 that break by themselves: AiDoomed). The old BestAct / BestActLv stay as the fallback if AiNext fails.
'use strict';

// ---------------------------------------------------------------- small helpers (values like Verse)
function RuTgtEq(A, B) { return !!A && !!B && A.Side === B.Side && A.Col === B.Col; }
function RuTgtIn(Ts, T) { for (const X of Ts) if (RuTgtEq(X, T)) return true; return false; }
// Verse "set A[I] = V" on an array value: a new array (unchanged when I is out of range)
function RuWith(Arr, I, V) {
  if (!(I >= 0 && I < Arr.length && Number.isInteger(I))) return Arr;
  const a = Arr.slice(); a[I] = V; return a;
}
// the decision codes of a turn (shared through card_match.Decide)
const RuDecAct = 1, RuDecEnd = 2, RuDecTimeout = 3, RuDecSurrender = 4;
// the value of a Decide that gave up because the match is over
const RuGaveUp = { GaveUp: true };

class unit {
  constructor(o = {}) {
    this.Def = o.Def;
    this.Atk = o.Atk;
    this.Hp = o.Hp;
    this.MaxHp = o.MaxHp;
    this.CanAct = o.CanAct ?? false;
    this.Sleeping = o.Sleeping ?? false;   // summoned this turn (shows "Zzz"); can't attack the player
    this.Acted = o.Acted ?? false;
    this.Frozen = o.Frozen ?? false;       // skips its next turn
    this.Taunt = o.Taunt ?? false;
    this.Haste = o.Haste ?? false;
    this.Rush = o.Rush ?? false;
    this.Deadly = o.Deadly ?? false;
    this.Drain = o.Drain ?? false;
    this.Barrier = o.Barrier ?? false;
    this.Invincible = o.Invincible ?? false;
    this.Intimidate = o.Intimidate ?? false;
    this.Stealth = o.Stealth ?? false;
    this.Count = o.Count ?? 0;
    this.Evolved = o.Evolved ?? false;
    this.ExtraUsed = o.ExtraUsed ?? false;  // 2回行動: the second action of the turn was used
    this.TempAtk = o.TempAtk ?? 0;          // attack that goes away at the end of the turn
    this.Thaw = o.Thaw ?? false;            // frozen: this own turn is skipped, the ice melts at its end
    this.PlayedCost = o.PlayedCost ?? 0;    // the mana it was played for (shown on its details)
    this.Prem = o.Prem ?? 0;                // プレミア level of its owner's card (sparkles / animated art)
    this.Silenced = o.Silenced ?? false;    // 効果消滅: its card's effects and keywords are gone
  }

  // the enemy can't pick it (attacks, spells, effects)
  Hidden() { return this.Intimidate || this.Stealth; }

  // an effect of its card (nothing once it lost its effects)
  Live(F) { return this.Silenced ? new fx() : F; }
  ArmorNow() { return this.Silenced ? 0 : this.Def.Armor; }
  ThornsNow() { return this.Silenced ? 0 : this.Def.Thorns; }
  CapNow() { return this.Silenced ? 0 : this.Def.DmgCap; }
  FrontDown() { return this.Silenced ? 0 : this.Def.FrontAtkDown; }
  IsBlocked() { return !this.Silenced && this.Def.Blocked; }
  NoTarget() { return !this.Silenced && this.Def.NoAttackTarget; }
  HasTwoActs() { return !this.Silenced && this.Def.TwoActs; }

  // 挑発 / 潜伏 / 無敵 / 威圧 (only one of them per monster)
  HasExclusive() { return this.Taunt || this.Stealth || this.Intimidate || this.Invincible; }
}

function MakeUnit(D) {
  return new unit({ Def: D, Atk: D.Atk, Hp: D.Hp, MaxHp: D.Hp, Taunt: D.Taunt, Haste: D.Haste, Rush: D.Rush, Deadly: D.Deadly, Drain: D.Drain,
    Barrier: D.Barrier, Invincible: D.Invincible, Intimidate: D.Intimidate, Stealth: D.Stealth, Count: D.Countdown, PlayedCost: D.Cost });
}

// a card in the hand (its cost can be lowered by effects)
class hand_card {
  constructor(o = {}) {
    this.Def = o.Def;
    this.Cost = o.Cost;
    this.GotKw = o.GotKw ?? 0;   // a keyword given in the hand (パペット召喚士: 速攻); the monster gets it when it is played
  }
}

function MakeHandCard(D) { return new hand_card({ Def: D, Cost: D.Cost }); }

class side {
  constructor(o = {}) {
    this.Hero = o.Hero;
    this.Name = o.Name ?? TxEmpty;            // shown next to the portrait (player name / コンピューター)
    this.Back = o.Back ?? 0;                  // card back design
    this.PicOverride = o.PicOverride ?? null; // the character's costume (着せ替え)
    this.NameOverride = o.NameOverride ?? null; // the costume's name (キャンディマン)
    this.RaceOverride = o.RaceOverride ?? null; // the costume's description (制作者)
    this.Prem = o.Prem ?? [];                 // プレミア levels of the player's cards (index = card id)
    this.Level = o.Level ?? 0;                // the player's level (shown to the opponent; 0 = the computer)
    this.AiLevel = o.AiLevel ?? 0;            // the CPU's strength (boss.js): 0 初級, 1 中級, 2 上級, 3 最恐
    this.Timeouts = o.Timeouts ?? 0;          // how often the turn time ran out
    this.TimedOut = o.TimedOut ?? false;      // the last turn ended because its time ran out (放置: no CardTurnActive bonus)
    this.Hp = o.Hp ?? CardHeroHp;
    this.MaxHp = o.MaxHp ?? CardHeroHp;
    this.Shield = o.Shield ?? 0;
    this.Deck = o.Deck ?? [];
    this.Hand = o.Hand ?? [];
    this.Board = o.Board ?? [null, null, null];
    this.Grave = o.Grave ?? [];
    this.Mana = o.Mana ?? 0;
    this.MaxMana = o.MaxMana ?? 0;
    this.JewelUsed = o.JewelUsed ?? false;
    this.HeroAtk = o.HeroAtk ?? 0;
    this.HeroDone = o.HeroDone ?? false;
    this.Fatigue = o.Fatigue ?? 0;
    this.Turns = o.Turns ?? 0;
    this.EvoLeft = o.EvoLeft ?? 0;
    this.EvoUsed = o.EvoUsed ?? false;
    this.NextMana = o.NextMana ?? 0;          // extra mana for the next own turn (白ウサギ)
    this.SpellLock = o.SpellLock ?? false;    // メデューサ: no spells can be played this (or the next own) turn
    this.EndSummons = o.EndSummons ?? [];     // 冥府女帝: card ids the leader summons at the end of every own turn
    // for the daily quests
    this.Summons = o.Summons ?? 0;
    this.Jewels = o.Jewels ?? 0;
  }

  CanPay(N) { return this.Mana >= N; }
  Pay(N) { this.Mana = Max(0, this.Mana - N); }
  // the monsters on the board (amulets are not monsters)
  Units() { return this.Board.filter(U => U && !U.Def.Amulet); }

  HeroPic() { return this.PicOverride != null ? this.PicOverride : this.Hero.Pic; }
  HName() { return this.NameOverride != null ? this.NameOverride : this.Hero.Name; }
  HRace() { return this.RaceOverride != null ? this.RaceOverride : this.Hero.Race; }

  PremOf(Id) { return At(this.Prem, Id) ?? 0; }
}

// Side = 0 / 1, Col = 0..2 board slot, -1 = the player (hero) itself
class tgt {
  constructor(o = {}) { this.Side = o.Side; this.Col = o.Col; }
}
function MkTgt(Side, Col) { return new tgt({ Side, Col }); }

// Kind: 1 play a card, 2 attack, 3 move, 4 jewel skill, 6 hero attack, 7 evolve
// Dst2 = the target of a monster's battlecry / evolve effect (NoTgt when it has none)
class act {
  constructor(o = {}) {
    this.Kind = o.Kind;
    this.Src = o.Src;
    this.Dst = o.Dst;
    this.Dst2 = o.Dst2 ?? MkTgt(0, -9);
    this.Score = o.Score ?? 0.0;
  }
}

const NoTgt = MkTgt(0, -9);

// what the stronger AI levels (side.AiLevel >= 1) know about the turn before they score the actions
class ai_ctx {
  constructor(o = {}) {
    this.Pot = o.Pot ?? 0;               // the damage the own side can still deal to the enemy player this turn
    this.Need = o.Need ?? 0;             // the enemy player's HP + shield
    this.Taunted = o.Taunted ?? false;   // the enemy has a taunt that can be attacked
    this.Planned = o.Planned ?? false;   // 上級+: Plan / PlanJewel hold the best use of the mana
    this.Plan = o.Plan ?? [];            // the hand cards (indices) worth playing this turn
    this.PlanJewel = o.PlanJewel ?? false;
  }
}

// the best set of plays for the mana (上級): items with mana cost, board slots and value; returns [value, item indices]
function AiKnap(Cost, Slot, Val, K, Mana, Slots) {
  const C = At(Cost, K), Sl = At(Slot, K), V = At(Val, K);
  if (C !== undefined && Sl !== undefined && V !== undefined) {
    const Skip = AiKnap(Cost, Slot, Val, K + 1, Mana, Slots);
    if (C <= Mana && Sl <= Slots) {
      const Take = AiKnap(Cost, Slot, Val, K + 1, Mana - C, Slots - Sl);
      // the mana that is used counts most (a 7 mana turn with 5/6/7 cost cards must not open with a 2 cost card)
      const TV = Take[0] + C * 6.0 + V;
      if (TV > Skip[0]) return [TV, [K, ...Take[1]]];
    }
    return Skip;
  }
  return [0.0, []];
}

// ---------------------------------------------------------------- AI look-ahead helpers (card_match.AiClone / AiEval)
// the pause of a look-ahead copy (already resolved: the copy runs through a whole action at once)
const AiNoWait = Promise.resolve();
// how many look-ahead copies were played (for tests)
let AiSims = 0;
// AiRollout: the first level that plays the enemy's reply out, how many candidates 最恐 plays out (上級: 3), and how
// much the value inside the turn still counts next to the played-out one (measured in AI-vs-AI matches)
const AiRollLv = 2;
const AiRollK = 8;
const AiRollW = 0.5;

// the best value of items (mana cost, board slots) that fit into Mana and Slots (a small knapsack)
function AiBestSet(Cost, Slot, Val, Mana, Slots) {
  const M = Max(0, Mana), S = Max(0, Slots);
  let Dp = [];
  for (let I = 0; I <= M; I++) { const Row = []; for (let J = 0; J <= S; J++) Row.push(0.0); Dp.push(Row); }
  for (let K = 0; K < Cost.length; K++) {
    const C = Cost[K], Sl = Slot[K], V = Val[K];
    if (C > M || Sl > S) continue;
    const Nx = Dp.map(Row => Row.slice());
    for (let I = C; I <= M; I++) for (let J = Sl; J <= S; J++) {
      const T = Dp[I - C][J - Sl] + V;
      if (T > Nx[I][J]) Nx[I][J] = T;
    }
    Dp = Nx;
  }
  return Dp[M][S];
}

// a copy of a side that the look-ahead may change (card defs and the hero are shared: they never change)
function AiCopySide(S) {
  const X = Object.assign(Object.create(side.prototype), S);
  X.Hand = S.Hand.map(H => new hand_card({ Def: H.Def, Cost: H.Cost, GotKw: H.GotKw }));
  X.Board = S.Board.map(U => U ? Object.assign(Object.create(unit.prototype), U) : null);
  X.Deck = S.Deck.slice();
  X.Grave = S.Grave.slice();
  X.EndSummons = S.EndSummons.slice();
  return X;
}

// what a player's HP is worth to the AI (the last points count most)
function AiHpVal(H) {
  if (H <= 0) return -60.0 + H;
  return 1.3 * Min(H, 8) + 0.75 * Max(0, Min(H, 20) - 8) + 0.3 * Max(0, H - 20);
}

// what one more point of damage to a player with H HP is worth
function AiFaceRate(H) { return H <= 8 ? 1.3 : H <= 20 ? 0.75 : 0.3; }

// what an effect a monster leaves behind when it is destroyed gives its owner
function AiDeathFxVal(F) {
  const K = F.K;
  if (K === fx_kind.None) return 0.0;
  if (K === fx_kind.AddCard || K === fx_kind.Draw || K === fx_kind.GraveToHand || K === fx_kind.Tutor || K === fx_kind.TutorHigh || K === fx_kind.TutorSpell) return 1.8 * Max(1, F.N);
  if (K === fx_kind.Summon || K === fx_kind.SummonKw || K === fx_kind.SummonRushBuff || K === fx_kind.SummonTrump || K === fx_kind.DeckSummon || K === fx_kind.GraveRevive) return 2.5 * Max(1, F.N);
  if (K === fx_kind.HitRandomFoe || K === fx_kind.HitAllFoes || K === fx_kind.HitRandomEnemy) return 0.8 * Max(1, F.N) * Max(1, F.M);
  if (K === fx_kind.HitFoeHero || K === fx_kind.HitAllEnemies) return 0.7 * F.N;
  if (K === fx_kind.HitOwnHero || K === fx_kind.SummonFoe) return -0.7 * Max(1, F.N);
  return 1.0;
}

// what an effect that goes off every turn (turn start / end) is worth while the monster stands
function AiTurnFxVal(F) {
  const K = F.K;
  if (K === fx_kind.None) return 0.0;
  if (K === fx_kind.HitSelf || K === fx_kind.KillSelf || K === fx_kind.VanishSelf || K === fx_kind.ReturnSelf || K === fx_kind.HitOwnHero || K === fx_kind.SummonFoe) return -0.5;
  return 1.5;
}

// the damage a spell effect can deal to the enemy player
function AiFxBurn(F) {
  return (F.K === fx_kind.HitFoeHero || F.K === fx_kind.HitEnemy || F.K === fx_kind.HitAny || F.K === fx_kind.HitAllEnemies) ? F.N : 0;
}

// a target seen from side W (local side 0 = W's own side). Converting twice gives the original back.
function Loc(W, T) { return MkTgt(T.Side === W ? 0 : 1, T.Col); }

// UI ids (local to each screen): hand 0..8, own slots 10..12, enemy slots 20..22, own hero 30, enemy hero 31,
// own jewel 40, enemy jewel 42, own grave 45, enemy grave 46, evolve 47, end turn 50, surrender 55
function UiUnit(L, Col) { return L === 0 ? 10 + Col : 20 + Col; }
function UiHero(L) { return 30 + L; }
function UiOf(T) { return T.Col < 0 ? UiHero(T.Side) : UiUnit(T.Side, T.Col); }
const UiEvolve = 47;
// (undefined when the id is not a board target)
function TgtOfUi(Id) {
  if (Id >= 10 && Id <= 12) return MkTgt(0, Id - 10);
  else if (Id >= 20 && Id <= 22) return MkTgt(1, Id - 20);
  else if (Id === 30) return MkTgt(0, -1);
  else if (Id === 31) return MkTgt(1, -1);
  return undefined;
}

// 持ち時間: the first turn has CardTurnMax seconds, every later turn the time left over + CardTurnRegain
// (+ CardTurnActive more when the last turn was ended by the player, not by the time running out), at most CardTurnMax
// e.g. 35 s left → 35 + 30 + 45 = 110 s; timed out → 0 + 30 = 30 s
const CardTurnMax = 120.0;
const CardTurnMin = 30.0;
const CardTurnRegain = 30.0;
const CardTurnActive = 45.0;

// returned by the turn input when the turn time ran out
const NavTimeout = -3;

// 効果の演出 (card_match.FxShow): what set an effect off
const FxShowCry = 1;
const FxShowDeath = 2;
const FxShowStart = 3;
const FxShowEnd = 4;
const FxShowAttack = 5;
const FxShowKill = 6;
const FxShowCount = 7;
const FxShowTick = 8;
const FxShowHeal = 9;
const FxShowEvo = 10;
const FxShowAlly = 11;

// why a match ended: 0 a player's HP reached 0, 1 surrender, 2 a player left
const EndHp = 0;
const EndSurrender = 1;
const EndLeft = 2;

class card_match {
  constructor(o = {}) {
    this.DB = o.DB;
    this.Me = o.Me;
    this.Foe = o.Foe;
    this.Views = o.Views ?? [null, null];   // per side: the screen of the human playing it (false/null = AI or remote)
    this.Pvp = o.Pvp ?? false;
    this.TurnSeconds = o.TurnSeconds ?? 0.0;  // > 0: 持ち時間 — the first turn has this much, the time left over carries over
    this.TurnRegain = o.TurnRegain ?? CardTurnRegain;  // added at the start of every later turn (at most TurnSeconds)
    this.TurnMin = o.TurnMin ?? CardTurnMin;          // a later turn never has less than this
    this.MullSeconds = o.MullSeconds ?? 0.0;
    this.AutoPlay = o.AutoPlay ?? false;    // debug: humans are played by the AI too
    this.Tut = o.Tut ?? null;               // the tutorial match (tutorial.js): side 0 is the player, side 1 follows the script
    // online lockstep: the same seed in both browsers; Net = {Remote: side, Send(W, v), Recv(W): Promise} or null
    this.Seed = o.Seed ?? ((Math.random() * 4294967296) >>> 0);
    this.Net = o.Net ?? null;
    this.Rng = MakeRng(this.Seed);
    this.EndP = new Promise(r => { this.EndRes = r; });
    this.ForceTgt = null;    // the tutorial: the next random pick takes this target when it can
    this.Current = -1;
    this.First = 0;
    this.Ended = false;
    this.Winner = -1;
    this.Reason = 0;
    this.Sel = -1;
    this.Pend = null;        // a play / evolve that waits for the target of its effect
    this.Busy = false;
    this.Deadline = 0.0;
    this.FirstTurnDone = false;
    this.PickTgts = [];      // the targets of a second pick in the middle of an effect (シロナガスクジラ)
    this.StampAt = [-100.0, -100.0];
    this.Bank = [0.0, 0.0];  // the time each player had left at the end of their last turn
    this.HandPick = false;   // the player is picking a card of the hand for an effect (大安売り)
    this.Dirty = false;      // the screens need a refresh
    this.Finished = false;
    // a death effect that adds the dead card again (首なし令嬢) starts from the mana it was played for
    this.FxSrcId = -1;
    this.FxBaseCost = -1;
    // the AI's look-ahead copy of a match (AiClone): no screens, no waiting
    this.Sim = false;
  }

  // every pause of the match (a look-ahead copy never waits)
  Wait(S) { return this.Sim ? AiNoWait : Sleep(S); }

  // ------------------------------------------------------------ online lockstep
  IsRemote(W) { return !!(this.Net && this.Net.Remote === W); }

  // a side whose choices a player makes (a local screen or the remote player); otherwise the AI picks
  Human(W) { return !!this.ViewOf(W) || this.IsRemote(W); }

  // W's decision: computed here (local / AI side) and sent, or received from the network (remote side).
  // When the match is over the remote side's decision is not waited for: Def is returned.
  async Decide(W, Fn, Def = null) {
    if (this.IsRemote(W)) {
      if (this.Ended) return Def;
      const v = await Promise.race([this.Net.Recv(W), this.EndP.then(() => RuGaveUp)]);
      return v === RuGaveUp ? Def : v;
    }
    let v = await Fn();
    if (v === undefined) v = null;
    if (this.Net) this.Net.Send(W, v);
    return v;
  }

  // the end of the match wakes everything that waits for the network
  EndNow() { if (this.EndRes) { const R = this.EndRes; this.EndRes = null; R(); } }

  // side W loses now (online: surrender while waiting, or a player left); both browsers call it
  Concede(W, Reason = EndSurrender) {
    if (!this.Ended) {
      this.Surrender(W);
      this.Reason = Reason;
      this.Refresh();
    }
    this.EndNow();
  }

  // the local player of side W gives up outside the own turn: the other browser is told, then Concede
  ConcedeLocal(W) {
    if (this.Net && !this.IsRemote(W)) {
      if (this.Net.Concede) this.Net.Concede(W);
      else if (this.Net.SendConcede) this.Net.SendConcede(W);
    }
    this.Concede(W);
  }

  // an action as a JSON-able decision (and back)
  ActCode(A) { return [RuDecAct, A.Kind, A.Src, A.Dst.Side, A.Dst.Col, A.Dst2.Side, A.Dst2.Col]; }
  ActOfCode(C) { return new act({ Kind: C[1], Src: C[2], Dst: MkTgt(C[3], C[4]), Dst2: MkTgt(C[5], C[6]), Score: 0.0 }); }

  // the player of side Who does A (shared with the other browser first)
  async DecideExec(Who, A) {
    const C = await this.Decide(Who, () => this.ActCode(A));
    if (Array.isArray(C) && C[0] === RuDecAct) await this.Exec(Who, this.ActOfCode(C));
  }

  // the turn of the remote player: their decisions are played here as they come
  async RemoteTurn(Who) {
    this.Sel = -1;
    this.Pend = null;
    this.Refresh();
    for (;;) {
      if (this.Ended) break;
      const C = await this.Decide(Who, () => null, null);
      if (this.Ended || !Array.isArray(C)) break;
      if (C[0] === RuDecAct) await this.Exec(Who, this.ActOfCode(C));
      else if (C[0] === RuDecTimeout) {
        this.Sel = -1;
        this.Pend = null;
        this.TimeUp(Who);
        break;
      } else if (C[0] === RuDecSurrender) {
        this.Surrender(Who);
        break;
      } else break;
      this.Refresh();
    }
  }

  // the turn time of side Who ran out (the next turn gets no CardTurnActive bonus); returns the time outs
  TimeUp(Who) {
    const Sd = this.S(Who);
    Sd.Timeouts += 1;
    Sd.TimedOut = true;
    this.LogBoth(Who, TlTimeUp(TxYou), TlTimeUp(TxOpponent));
    return Sd.Timeouts;
  }

  S(I) { return I === 0 ? this.Me : this.Foe; }

  // the monster (not amulet) in a slot
  MonAt(Side, Col) {
    const U = At(this.S(Side).Board, Col);
    if (U && !U.Def.Amulet) return U;
    return undefined;
  }

  AmuletAt(Side, Col) {
    const U = At(this.S(Side).Board, Col);
    if (U && U.Def.Amulet) return U;
    return undefined;
  }

  // a slot that exists and is empty (Verse "Cell := Board[C], not Cell?")
  CellEmpty(Side, Col) {
    const B = this.S(Side).Board;
    return Col >= 0 && Col < B.length && Number.isInteger(Col) && !B[Col];
  }

  // is U still standing in that slot?
  OnBoard(Side, Col, U) {
    const Still = At(this.S(Side).Board, Col);
    return !!Still && Still === U;
  }

  // the attack a monster really has: アリジゴク in front of it takes some away
  EffAtk(Side, Col, U) {
    const F = this.MonAt(1 - Side, Col);
    const Down = F ? F.FrontDown() : 0;
    return Max(0, U.Atk - Down);
  }

  // the attack of the monster in a slot (0 when there is none)
  AtkAt(Side, Col) {
    const U = this.MonAt(Side, Col);
    return U ? this.EffAtk(Side, Col, U) : 0;
  }

  CardOf(Id) {
    const D = At(this.DB, Id);
    if (D) return D;
    const D0 = At(this.DB, 0);
    if (D0) return D0;
    return new card_def({ Id: 0, Name: TxEmpty, Cost: 0, Art: CardMon.f_slime, ArtW: 1.0, ArtH: 1.0 });
  }

  ViewOf(Who) {
    if (this.AutoPlay) return undefined;
    return At(this.Views, Who) || undefined;
  }

  Rounds() { return Max(this.Me.Turns, this.Foe.Turns); }

  // every real screen with its side: [W, V]
  *Vs() {
    for (let W = 0; W < this.Views.length; W++) { const V = this.Views[W]; if (V) yield [W, V]; }
  }

  // ------------------------------------------------------------ what every screen shows
  // Refresh only marks the screens; RefreshLoop redraws them once per frame (many changes in a row cost one redraw)
  Refresh() { this.Dirty = true; }

  RefreshNow() {
    this.Dirty = false;
    for (const [, V] of this.Vs()) V.Refresh(this);
  }

  // (Finished is also set by the PvP session when the match was cancelled because a player left)
  async RefreshLoop() {
    for (;;) {
      await this.Wait(0.0);
      if (this.Dirty) this.RefreshNow();
      if (this.Finished) break;
    }
  }

  Snd(Id) { for (const [, V] of this.Vs()) V.Snd(Id); }

  SndTo(Who, Id) { const V = At(this.Views, Who); if (V) V.Snd(Id); }

  Pop(T, Msg, IsHeal) { for (const [W, V] of this.Vs()) V.FxPop(UiOf(Loc(W, T)), Msg, IsHeal); }

  Flash(T) { for (const [W, V] of this.Vs()) V.FxFlash(UiOf(Loc(W, T))); }

  // a visual effect (vfx.js) played on target T on every screen
  Vfx(Kind, T) { for (const [W, V] of this.Vs()) V.Vfx(Kind, UiOf(Loc(W, T))); }

  JewelFx(Who) { for (const [W, V] of this.Vs()) V.FxJewel(W === Who ? 0 : 1); }

  async Lunge(Src, Dst) {
    for (const [W, V] of this.Vs()) spawn(() => V.FxLunge(UiOf(Loc(W, Src)), UiOf(Loc(W, Dst))));
    await this.Wait(0.2);
  }

  async DrawFx(Who, Idx, N) {
    for (const [W, V] of this.Vs()) spawn(() => V.FxDraw(W === Who ? 0 : 1, Idx, N));
    await this.Wait(0.3);
  }

  // a log line about side Who: the owner reads Mine, the other player reads Theirs
  LogBoth(Who, Mine, Theirs) { for (const [W, V] of this.Vs()) V.Log(W === Who ? Mine : Theirs); }

  Log(Msg) { for (const [, V] of this.Vs()) V.Log(Msg); }

  Toast(Msg, Secs) { for (const [, V] of this.Vs()) V.Toast(Msg, Secs); }

  Cast(D, Who, Cost) {
    const Pm = this.S(Who).PremOf(D.Id);
    const Nm = this.S(Who).HName();
    for (const [W, V] of this.Vs()) {
      const L = W === Who ? (D.IsSpell ? TlCastSpell : TlCastMon) : (D.IsSpell ? TlFoeCastSpell(Nm) : TlFoeCastMon(Nm));
      V.ShowCast(D, L, Cost, Pm);
    }
  }

  HideCast() { for (const [, V] of this.Vs()) V.HideCast(); }

  // 効果の演出: before an effect of a card goes off, every screen shows that card with what set it off
  // (Kind: FxShowCry ...) and its slot flashes, so the players can follow what happens. Col < 0: not on the board
  async FxShow(Who, Col, D, Kind) {
    if (this.Ended) return;
    const Pm = this.S(Who).PremOf(D.Id);
    const L = FxShowName(Kind);
    for (const [W, V] of this.Vs()) V.ShowTrigger(D, W === Who ? L : TlFoeFx(L), Pm);
    if (Col >= 0) {
      const T0 = MkTgt(Who, Col);
      this.Flash(T0);
      this.Vfx(VfxMana, T0);
    }
    this.Snd(SfxAwaken);
    this.Refresh();
    await this.Wait(0.8);
  }

  // does anybody watch side Who's play from the other side?
  Watched(Who) { return !!At(this.Views, 1 - Who); }

  // ------------------------------------------------------------ rule checks (no side effects)
  TargetableTaunts(Who) { return this.S(Who).Units().filter(U => U.Taunt && !U.Hidden() && !U.NoTarget()); }

  AmuletsOf(Who) { const Out = []; for (let C = 0; C <= 2; C++) if (this.AmuletAt(Who, C)) Out.push(C); return Out; }

  HasTaunt(Who) { return this.TargetableTaunts(Who).length > 0; }

  AttackOk(Who, Col, T) {
    const O = 1 - Who;
    // (a monster with 0 attack can attack too)
    const U = At(this.S(Who).Board, Col);
    if (U && U.CanAct && T.Side === O) {
      const Taunt = this.HasTaunt(O);
      if (T.Col < 0) {
        if (Taunt) return false;
        // 特攻: a monster summoned this turn can only fight monsters
        if (U.Sleeping) return false;
        if (U.IsBlocked() && this.MonAt(O, Col)) return false;
        return true;
      } else {
        const Tg = this.MonAt(O, T.Col);
        if (Tg && Abs(T.Col - Col) <= 1 && !Tg.Hidden() && !Tg.NoTarget()) {
          if (Taunt && !Tg.Taunt) return false;
          return true;
        }
      }
    }
    return false;
  }

  HeroAttackOk(Who, T) {
    const A = this.S(Who);
    const O = 1 - Who;
    if (A.HeroAtk > 0 && !A.HeroDone && T.Side === O) {
      const Taunt = this.HasTaunt(O);
      if (T.Col < 0) return !Taunt;
      const Tg = this.MonAt(O, T.Col);
      if (Tg && !Tg.Hidden() && !Tg.NoTarget()) {
        if (Taunt && !Tg.Taunt) return false;
        return true;
      }
    }
    return false;
  }

  MoveOk(Who, Col, To) {
    const U = At(this.S(Who).Board, Col);
    return !!(U && U.CanAct && Abs(To - Col) === 1 && this.CellEmpty(Who, To));
  }

  // can effect F of side Who be aimed at T? (effects without a target use the own player as their target)
  FxTargetOk(Who, F, T) {
    const R = FxTarget(F.K);
    if (R === 0) return T.Side === Who && T.Col === -1;
    if (R === 4) return T.Side === Who && this.CellEmpty(Who, T.Col);
    if (R !== 8 && R !== 9 && T.Col < 0) return false;
    // amulets: 6 an own amulet whose countdown can still go down, 7 any amulet
    if (R === 6) { if (T.Side === Who) { const U = this.AmuletAt(Who, T.Col); if (U && U.Count > 0) return true; } return false; }
    if (R === 7) return !!this.AmuletAt(T.Side, T.Col);
    // 10 any monster or amulet (an enemy monster under 威圧 / 潜伏 can't be picked)
    if (R === 10) {
      const U10 = At(this.S(T.Side).Board, T.Col);
      if (!U10) return false;
      return !(T.Side !== Who && !U10.Def.Amulet && U10.Hidden());
    }
    if (R === 8 && T.Col < 0) return true;
    if (R === 9) {
      if (T.Side !== Who && T.Col < 0) return true;
      if (T.Side !== Who) { const U9 = this.MonAt(T.Side, T.Col); if (U9 && !U9.Hidden()) return true; }
      return false;
    }
    const U = this.MonAt(T.Side, T.Col);
    if (U) {
      // 威圧 / 潜伏: the enemy can't pick it
      if (T.Side !== Who && U.Hidden()) return false;
      if (R === 1) return T.Side !== Who;
      if (R === 2 || R === 5) return T.Side === Who;
      return true;
    }
    return false;
  }

  AllTargets() {
    return [MkTgt(0, 0), MkTgt(0, 1), MkTgt(0, 2), MkTgt(0, -1), MkTgt(1, 0), MkTgt(1, 1), MkTgt(1, 2), MkTgt(1, -1)];
  }

  // the targeted effect among two (a battlecry / evolve can have one)
  AimedFx(A, B) { return FxTarget(A.K) > 0 ? A : B; }

  // the legal second targets of a pair of effects (empty when they need none or nothing can be picked)
  AimTargets(Who, A, B) {
    const F = this.AimedFx(A, B);
    if (FxTarget(F.K) === 0) return [];
    return this.AllTargets().filter(T => this.FxTargetOk(Who, F, T));
  }

  // a spell is only played on a legal target (its own check is FxTargetOk, this also allows targetless spells)
  AimOk2(Who, F, T) { return this.FxTargetOk(Who, F, T); }

  // a second target is fine when it is legal, or when nothing could be picked anyway
  AimOk(Who, A, B, T) {
    const Ts = this.AimTargets(Who, A, B);
    if (Ts.length === 0) return true;
    return RuTgtIn(Ts, T);
  }

  EvoTurn(Who) { return Who === this.First ? CardEvoTurnFirst : CardEvoTurnSecond; }

  EvoOk(Who, Col) {
    const A = this.S(Who);
    const U = this.MonAt(Who, Col);
    return !!(A.EvoLeft > 0 && !A.EvoUsed && A.Turns >= this.EvoTurn(Who) && U && !U.Evolved);
  }

  // the tutorial lets the player use the jewel for free
  JewelCost(Who) { return (this.Tut && Who === 0) ? 0 : this.S(Who).Hero.Cost; }

  JewelOk(Who, T) {
    const A = this.S(Who);
    const H = A.Hero;
    if (A.JewelUsed || !A.CanPay(this.JewelCost(Who))) return false;
    if (H.Jewel.K === fx_kind.Draw && A.Hand.length >= CardMaxHand) return false;
    if (H.Jewel.K === fx_kind.HeroAtk && A.HeroDone) return false;
    if (H.Jewel.K === fx_kind.HitRandomFoe && this.S(1 - Who).Units().length === 0) return false;
    return this.FxTargetOk(Who, H.Jewel, T);
  }

  PlayOk(Who, Idx, T) {
    const A = this.S(Who);
    const H = At(A.Hand, Idx);
    if (H && A.CanPay(H.Cost)) {
      const D = H.Def;
      if (D.IsSpell) {
        // メデューサ: no spells this turn
        if (A.SpellLock) return false;
        return this.FxTargetOk(Who, D.Spell, T);
      }
      return T.Side === Who && this.CellEmpty(Who, T.Col);
    }
    return false;
  }

  Legal(Who, A) {
    if (A.Kind === 1) {
      if (!this.PlayOk(Who, A.Src, A.Dst)) return false;
      const H = At(this.S(Who).Hand, A.Src);
      if (H && !H.Def.IsSpell) return this.AimOk(Who, H.Def.Cry, H.Def.Cry2, A.Dst2);
      if (H && H.Def.IsSpell) return this.AimOk2(Who, H.Def.Spell, A.Dst);
      return true;
    } else if (A.Kind === 2) return this.AttackOk(Who, A.Src, A.Dst);
    else if (A.Kind === 3) return A.Dst.Side === Who ? this.MoveOk(Who, A.Src, A.Dst.Col) : false;
    else if (A.Kind === 4) return this.JewelOk(Who, A.Dst);
    else if (A.Kind === 6) return this.HeroAttackOk(Who, A.Dst);
    else if (A.Kind === 7) {
      if (!this.EvoOk(Who, A.Src)) return false;
      const U = At(this.S(Who).Board, A.Src);
      if (U) return this.AimOk(Who, U.Live(U.Def.Evo), U.Live(U.Def.Evo2), A.Dst2);
      return false;
    }
    return false;
  }

  // every legal action of one side (Score is filled in by the AI)
  Actions(Who) {
    let Out = [];
    const Ts = this.AllTargets();
    this.S(Who).Hand.forEach((H, I) => {
      for (const T of Ts) {
        if (!this.PlayOk(Who, I, T)) continue;
        if (H.Def.IsSpell) {
          Out.push(new act({ Kind: 1, Src: I, Dst: T, Score: 0.0 }));
        } else {
          const Aims = this.AimTargets(Who, H.Def.Cry, H.Def.Cry2);
          if (Aims.length === 0) Out.push(new act({ Kind: 1, Src: I, Dst: T, Score: 0.0 }));
          else for (const T2 of Aims) Out.push(new act({ Kind: 1, Src: I, Dst: T, Dst2: T2, Score: 0.0 }));
        }
      }
    });
    for (let C = 0; C <= 2; C++) {
      for (const T of Ts) {
        const A2 = new act({ Kind: 2, Src: C, Dst: T, Score: 0.0 });
        if (this.Legal(Who, A2)) Out.push(A2);
        const A3 = new act({ Kind: 3, Src: C, Dst: T, Score: 0.0 });
        if (this.Legal(Who, A3)) Out.push(A3);
      }
    }
    for (const T of Ts) {
      const A4 = new act({ Kind: 4, Src: 0, Dst: T, Score: 0.0 });
      if (this.Legal(Who, A4)) Out.push(A4);
      const A6 = new act({ Kind: 6, Src: 0, Dst: T, Score: 0.0 });
      if (this.Legal(Who, A6)) Out.push(A6);
    }
    for (let C = 0; C <= 2; C++) {
      if (!this.EvoOk(Who, C)) continue;
      const U = At(this.S(Who).Board, C);
      if (!U) continue;
      const Aims = this.AimTargets(Who, U.Live(U.Def.Evo), U.Live(U.Def.Evo2));
      if (Aims.length === 0) Out.push(new act({ Kind: 7, Src: C, Dst: this.Hero(Who), Score: 0.0 }));
      else for (const T2 of Aims) Out.push(new act({ Kind: 7, Src: C, Dst: this.Hero(Who), Dst2: T2, Score: 0.0 }));
    }
    return Out;
  }

  // ------------------------------------------------------------ selection (a human side, local UI ids)
  // The action meant by choosing Id while SelId is selected (undefined: none)
  ActionFor(Who, SelId, Id) {
    if (Id === UiEvolve) {
      if (SelId >= 10 && SelId <= 12 && this.EvoOk(Who, SelId - 10)) return new act({ Kind: 7, Src: SelId - 10, Dst: this.Hero(Who), Score: 0.0 });
      return undefined;
    }
    const T0 = TgtOfUi(Id);
    if (!T0) return undefined;
    const T = Loc(Who, T0);
    if (SelId >= 0 && SelId <= 8) {
      const A = new act({ Kind: 1, Src: SelId, Dst: T, Score: 0.0 });
      return this.PlayOk(Who, SelId, T) ? A : undefined;
    } else if (SelId >= 10 && SelId <= 12) {
      const Col = SelId - 10;
      if (T.Side === Who) {
        const A = new act({ Kind: 3, Src: Col, Dst: T, Score: 0.0 });
        return this.Legal(Who, A) ? A : undefined;
      }
      const A = new act({ Kind: 2, Src: Col, Dst: T, Score: 0.0 });
      return this.Legal(Who, A) ? A : undefined;
    } else if (SelId === 30) {
      const A = new act({ Kind: 6, Src: 0, Dst: T, Score: 0.0 });
      return this.Legal(Who, A) ? A : undefined;
    } else if (SelId === 40) {
      if (!this.S(Who).Hero.NeedsTarget()) return undefined;
      const A = new act({ Kind: 4, Src: 0, Dst: T, Score: 0.0 });
      return this.Legal(Who, A) ? A : undefined;
    }
    return undefined;
  }

  // the effect pair that a pending action still needs a target for
  PendFx(Who, A) {
    if (A.Kind === 1) { const H = At(this.S(Who).Hand, A.Src); if (H) return [H.Def.Cry, H.Def.Cry2]; }
    if (A.Kind === 7) { const U = At(this.S(Who).Board, A.Src); if (U) return [U.Live(U.Def.Evo), U.Live(U.Def.Evo2)]; }
    return [new fx(), new fx()];
  }

  PendTargets(Who, A) {
    const F = this.PendFx(Who, A);
    return this.AimTargets(Who, F[0], F[1]);
  }

  // UI ids that are legal targets for the current selection
  TargetIds(Who, SelId) {
    const Raw = this.TargetIdsRaw(Who, SelId);
    if (this.Tut && Who === 0) { const Al = this.TutAllow(Who, SelId); return Raw.filter(Id => Al.includes(Id)); }
    return Raw;
  }

  TargetIdsRaw(Who, SelId) {
    const P = this.Pend;
    if (P) return this.PendTargets(Who, P).map(T => UiOf(Loc(Who, T)));
    if (SelId < 0) return [];
    let Out = [10, 11, 12, 20, 21, 22, 30, 31].filter(Id => this.ActionFor(Who, SelId, Id) !== undefined);
    if (this.ActionFor(Who, SelId, UiEvolve) !== undefined) Out = [...Out, UiEvolve];
    return Out;
  }

  // the selection is used by choosing it a second time (no-target spells and jewel skills)
  SelfCast(Who, Id) {
    if (Id === 40) return !this.S(Who).Hero.NeedsTarget();
    if (!(Id >= 0 && Id <= 8)) return false;
    const H = At(this.S(Who).Hand, Id);
    return !!(H && H.Def.IsSpell && !H.Def.NeedsTarget());
  }

  // can the thing behind this id do anything right now?
  SourceReady(Who, Id) {
    if (this.TargetIdsRaw(Who, Id).length > 0) return true;
    if (this.SelfCast(Who, Id)) {
      if (Id === 40) { if (this.JewelOk(Who, this.Hero(Who))) return true; }
      else if (this.PlayOk(Who, Id, this.Hero(Who))) return true;
    }
    return false;
  }

  ReadyIds(Who) {
    if (this.Pend) return [];
    const Raw = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 30, 40].filter(Id => this.SourceReady(Who, Id));
    if (this.Tut && Who === 0) { const Al = this.TutAllow(Who, -1); return Raw.filter(Id => Al.includes(Id)); }
    return Raw;
  }

  // ------------------------------------------------------------ the tutorial (tutorial.js)
  // the hand slot of the first card with id CardId (undefined: none)
  HandIdxOf(Who, CardId) {
    let Found = -1;
    this.S(Who).Hand.forEach((H, I) => { if (Found < 0 && H.Def.Id === CardId) Found = I; });
    return Found >= 0 ? Found : undefined;
  }

  // the board slot of the first monster with id CardId (undefined: none)
  UnitColOf(Who, CardId) {
    let Found = -1;
    for (let C = 0; C <= 2; C++) { const U = this.MonAt(Who, C); if (Found < 0 && U && U.Def.Id === CardId) Found = C; }
    return Found >= 0 ? Found : undefined;
  }

  // the UI ids the player may choose for the tutorial step (SelId = what is selected)
  TutAllow(Who, SelId) {
    const T = this.Tut;
    const St = T ? T.Cur() : undefined;
    if (T && St) {
      if (St.Kind === 5) return [50];
      if (St.Kind === 4) return [40];
      const Idx = St.Kind === 1 ? this.HandIdxOf(Who, St.CardId) : undefined;
      if (St.Kind === 1 && Idx !== undefined) {
        if (SelId !== Idx) return [Idx];
        const H = At(this.S(Who).Hand, Idx);
        if (H && H.Def.IsSpell && !H.Def.NeedsTarget()) return [Idx];
        if (St.Dst === -9) return this.TargetIdsRaw(Who, Idx);
        return [T.DstUi(St.Dst)];
      }
      const Col = St.Kind === 2 ? this.UnitColOf(Who, St.CardId) : undefined;
      if (St.Kind === 2 && Col !== undefined) {
        if (SelId !== 10 + Col) return [10 + Col];
        return [T.DstUi(St.Dst)];
      }
    }
    return [];
  }

  // can the player use Id now? (looking at the board and giving up always work)
  TutClickOk(Who, Id) {
    if (!this.Tut) return true;
    if (Id === 55 || Id === 45 || Id === 46 || Id === 99 || Id === NavCancel || Id === NavTimeout) return true;
    if (this.Sel >= 0 && Id === this.Sel) return true;
    return this.TutAllow(Who, this.Sel).includes(Id);
  }

  // is A the action the tutorial step asks for?
  TutHit(Who, A) {
    const T = this.Tut;
    const St = (Who === 0 && T) ? T.Cur() : undefined;
    if (St) {
      if (St.Kind === 1 && A.Kind === 1) { const H = At(this.S(Who).Hand, A.Src); if (H && H.Def.Id === St.CardId) return true; }
      if (St.Kind === 2 && A.Kind === 2) { const U = this.MonAt(Who, A.Src); if (U && U.Def.Id === St.CardId) return true; }
      if (St.Kind === 4 && A.Kind === 4) return true;
    }
    return false;
  }

  // the CPU's turn of the tutorial
  async TutNpc(T) {
    await this.Wait(0.8);
    for (const Op of TutFoeOps(this.Foe.Turns)) {
      if (this.Ended) break;
      const Idx = Op.Kind === 1 ? this.HandIdxOf(1, Op.CardId) : undefined;
      if (Op.Kind === 1 && Idx !== undefined) {
        const Free = this.EmptySlots(1);
        // 幽霊の絵: a slot with nobody in front of it
        const Open = Free.filter(C => this.CellEmpty(0, C));
        const Col = (Op.Col >= 0 && Free.includes(Op.Col)) ? Op.Col
          : (Op.Col === TutColGhost && Open.length > 0) ? Open[0]
          : Free.includes(1) ? 1
          : (At(Free, 0) ?? 0);
        const Hc = At(this.S(1).Hand, Idx);
        if (Hc && Hc.Def.Id === CardTutGhost) T.GhostCol = Col;
        await this.Exec(1, new act({ Kind: 1, Src: Idx, Dst: MkTgt(1, Col), Score: 0.0 }));
      } else if (Op.Kind === 2 && this.UnitColOf(1, Op.CardId) !== undefined && this.UnitColOf(0, Op.Target) !== undefined) {
        const Src = this.UnitColOf(1, Op.CardId), Dst = this.UnitColOf(0, Op.Target);
        await this.Exec(1, new act({ Kind: 2, Src, Dst: MkTgt(0, Dst), Score: 0.0 }));
      } else if (Op.Kind === 7 && this.UnitColOf(1, Op.CardId) !== undefined) {
        await this.Exec(1, new act({ Kind: 7, Src: this.UnitColOf(1, Op.CardId), Dst: this.Hero(1), Score: 0.0 }));
      } else if (Op.Kind === 8 && this.UnitColOf(0, Op.Target) !== undefined) {
        this.ForceTgt = MkTgt(0, this.UnitColOf(0, Op.Target));
      }
      await this.Wait(0.7);
      const V = this.ViewOf(0);
      if (Op.Pages.length > 0 && V) await V.TutPages(Op.Pages);
    }
    await this.Wait(0.4);
  }

  // what the controller cursor cycles through (LB / RB) and browses (LT / RT)
  NavSmart(Who) {
    if (this.Pend) return this.TargetIds(Who, this.Sel);
    if (this.Sel >= 0) {
      const Ts = this.TargetIds(Who, this.Sel);
      if (this.SelfCast(Who, this.Sel)) return [this.Sel, ...Ts];
      return [...Ts, this.Sel];
    }
    return [...this.ReadyIds(Who), 50];
  }

  NavAll(Who) {
    let Out = this.S(Who).Hand.map((H, I) => I);
    Out = [...Out, 10, 11, 12, 30, 40, 50, 20, 21, 22, 31, 42, 45, 46];
    return [...Out, 55];
  }

  // ------------------------------------------------------------ damage
  Hero(Who) { return MkTgt(Who, -1); }

  CondOk(Who, F) {
    if (F.Cond === 1) return this.S(Who).MaxMana >= 7;
    else if (F.Cond === 2) return this.S(Who).Hp <= 10;
    else if (F.Cond === 3) return this.S(Who).Hand.length <= 2;
    else if (F.Cond === 4) return this.S(Who).Hp < this.S(1 - Who).Hp;
    return true;
  }

  // the condition of effect F of the monster in slot Col (5: the monster is damaged) and CondOk
  FxWouldRun(Who, Col, F) {
    if (!this.CondOk(Who, F)) return false;
    if (F.Cond === 5) {
      const U = this.MonAt(Who, Col);
      return !!(U && U.Hp < U.MaxHp);
    }
    return true;
  }

  // the damage that really hits (shield, バリア, 無敵); the pop-up text explains what happened: [dealt, message]
  Hurt(T, N) {
    const Sd = this.S(T.Side);
    if (N <= 0) return [0, TxEmpty];
    if (T.Col < 0) {
      const Absorb = Min(Sd.Shield, N);
      Sd.Shield -= Absorb;
      Sd.Hp -= N - Absorb;
      return [N, Absorb >= N ? TlShielded : TxMinus(N - Absorb)];
    }
    const U = At(Sd.Board, T.Col);
    if (U) {
      if (U.Invincible) return [0, TkInvincible];
      if (U.Barrier) {
        U.Barrier = false;
        return [0, TlBarrierGone];
      }
      // マシュマロ: the damage is lower
      // モアイ: no more than its cap at once
      const Cap = U.CapNow();
      const Real = Min(Max(0, N - U.ArmorNow()), Cap > 0 ? Cap : N);
      if (Real <= 0) return [0, TlArmored];
      U.Hp -= Real;
      return [Real, TxMinus(Real)];
    }
    return [0, TxEmpty];
  }

  // several targets take damage at the same time
  async DamageMany(Ts, N) {
    if (N <= 0) return;
    const Hit = [];
    for (const T of Ts) {
      const R = this.Hurt(T, N);
      Hit.push([T, R[1]]);
    }
    if (Hit.length === 0) return;
    this.Refresh();
    this.Snd(N >= 4 ? SfxHitBig : SfxHit);
    for (const X of Hit) this.Pop(X[0], X[1], false);
    await this.Wait(0.45);
  }

  async Damage(T, N) { await this.DamageMany([T], N); }

  async Heal(T, N) {
    const Sd = this.S(T.Side);
    let Amount = 0;
    if (T.Col < 0) {
      Amount = Min(N, Sd.MaxHp - Sd.Hp);
      Sd.Hp += Amount;
    } else {
      const U = At(Sd.Board, T.Col);
      if (U) {
        Amount = Min(N, U.MaxHp - U.Hp);
        U.Hp += Amount;
      }
    }
    if (Amount <= 0) return;
    this.Refresh();
    this.Snd(SfxHeal);
    this.Vfx(VfxHeal, T);
    this.Pop(T, TxPlus(Amount), true);
    await this.Wait(0.4);
    // 「自分のプレイヤーが回復するたび」 (星の精, パフェドラゴン)
    if (T.Col < 0) {
      for (let C = 0; C <= 2; C++) {
        const U = this.MonAt(T.Side, C);
        if (!U || U.Live(U.Def.OnHeal).K === fx_kind.None || this.Ended) continue;
        await this.FxShow(T.Side, C, U.Def, FxShowHeal);
        await this.DoFx(T.Side, C, U.Def.OnHeal, this.Hero(T.Side));
      }
    }
  }

  async Buff(T, N, M) {
    const U = At(this.S(T.Side).Board, T.Col);
    if (U) {
      U.Atk += N;
      U.Hp += M;
      U.MaxHp = Max(1, U.MaxHp + M);
      this.Refresh();
      this.Snd(SfxBuff);
      this.Vfx(VfxBuff, T);
      this.Pop(T, BuffText(N, M), true);
      await this.Wait(0.4);
    }
  }

  async Debuff(T, N, M) {
    const U = At(this.S(T.Side).Board, T.Col);
    if (U) {
      U.Atk = Max(0, U.Atk - N);
      if (!U.Invincible) {
        U.Hp -= M;
        U.MaxHp = Max(1, U.MaxHp - M);
      }
      this.Refresh();
      this.Snd(SfxDebuff);
      this.Vfx(VfxCurse, T);
      this.Pop(T, DebuffText(N, M), false);
      await this.Wait(0.4);
    }
  }

  Freeze(T) {
    const F = At(this.S(T.Side).Board, T.Col);
    if (F) {
      F.Frozen = true;
      // (a new freeze: it lasts through the owner's next turn)
      F.Thaw = false;
      F.CanAct = false;
      this.Log(TlFrozen(F.Def.Name));
      this.Refresh();
      this.Snd(SfxFreeze);
      this.Vfx(VfxIce, T);
    }
  }

  // destroys a monster unless it is 無敵
  async Kill(T) { await this.KillMany([T]); }

  // every target gets its effect at the same moment and they are destroyed together (全体破壊)
  async KillMany(Ts) {
    let Any = false;
    for (const T of Ts) {
      const U = At(this.S(T.Side).Board, T.Col);
      if (!U) continue;
      Any = true;
      this.Vfx(VfxDark, T);
      if (U.Invincible) {
        this.Pop(T, TkInvincible, false);
      } else {
        U.Hp = Min(U.Hp, 0);
        this.Log(TlKilled(U.Def.Name));
      }
    }
    if (Any) await this.Wait(0.35);
  }

  // does the monster already have an other one of 挑発 / 潜伏 / 無敵 / 威圧?
  KwBlocked(U, Code) {
    return KwExclusive(Code) && U.HasExclusive()
      && !(Code === KwTaunt && U.Taunt) && !(Code === KwStealth && U.Stealth) && !(Code === KwIntimidate && U.Intimidate);
  }

  async GiveKw(T, Code) {
    const U = this.MonAt(T.Side, T.Col);
    if (U) {
      if (this.KwBlocked(U, Code)) {
        this.Log(TlKwFailed(U.Def.Name, KwName(Code)));
        this.Pop(T, TlFailed, false);
        await this.Wait(0.35);
        return;
      }
      if (Code === KwTaunt) U.Taunt = true;
      else if (Code === KwHaste) {
        U.Haste = true;
        U.Sleeping = false;
        if (!U.Acted && !U.Frozen) U.CanAct = true;
      } else if (Code === KwRush) {
        U.Rush = true;
        if (!U.Acted && !U.Frozen) U.CanAct = true;
      } else if (Code === KwDeadly) U.Deadly = true;
      else if (Code === KwDrain) U.Drain = true;
      else if (Code === KwBarrier) U.Barrier = true;
      else if (Code === KwStealth) U.Stealth = true;
      else if (Code === KwIntimidate) U.Intimidate = true;
      this.Log(TlGotKw(U.Def.Name, KwName(Code)));
      this.Refresh();
      this.Snd(SfxHeal);
      this.Vfx(Code === KwBarrier ? VfxBarrier : VfxBuff, T);
      this.Pop(T, KwName(Code), true);
      await this.Wait(0.35);
    }
  }

  // (monsters only: amulets are never hit by "monster" effects)
  FoeUnitsOf(Who) {
    const O = 1 - Who;
    const Out = [];
    for (let C = 0; C <= 2; C++) if (this.MonAt(O, C)) Out.push(MkTgt(O, C));
    return Out;
  }

  AllyUnitsOf(Who, Except) {
    const Out = [];
    for (let C = 0; C <= 2; C++) if (C !== Except && this.MonAt(Who, C)) Out.push(MkTgt(Who, C));
    return Out;
  }

  EmptySlots(Who) {
    const Out = [];
    for (let C = 0; C <= 2; C++) if (this.CellEmpty(Who, C)) Out.push(C);
    return Out;
  }

  // a random one of Ts (the tutorial's forced target first); undefined when Ts is empty
  PickOne(Ts) {
    const F = this.ForceTgt;
    if (F && RuTgtIn(Ts, F)) return F;
    return At(Ts, this.Rng.Int(0, Ts.length - 1));
  }

  // a random card for AddCard (-2 any, -3 spell, -4 legend, -5 artifact); cards of other characters are left out
  RandomCard(Who, Kind) {
    if (Kind === CardRandomArtifact) return this.CardOf(At(CardArtifactIds, this.Rng.Int(0, CardArtifactIds.length - 1)) ?? 0);
    const HeroId = this.S(Who).Hero.Id;
    const Cands = this.DB.filter(D => !D.Token && (D.HeroOnly < 0 || D.HeroOnly === HeroId)
      && ((Kind === CardRandomAny) || (Kind === CardRandomSpell && D.IsSpell) || (Kind === CardRandomLegend && D.Rarity === RarL)));
    return At(Cands, this.Rng.Int(0, Cands.length - 1)) ?? this.CardOf(0);
  }

  // ------------------------------------------------------------ cards moving around
  // a card joins the hand (from an effect); it is lost when the hand is full
  async AddToHand(Who, D) {
    const A = this.S(Who);
    if (A.Hand.length >= CardMaxHand) {
      this.LogBoth(Who, TlHandFull(TxYou, D.Name), TlHandFull(TxOpponent, D.Name));
      return;
    }
    await this.DrawFx(Who, A.Hand.length, A.Hand.length + 1);
    A.Hand = [...A.Hand, MakeHandCard(D)];
    this.SndTo(Who, SfxDraw);
    this.Refresh();
  }

  async Draw(Who) {
    const A = this.S(Who);
    const D = At(A.Deck, 0);
    if (D) {
      A.Deck = RemoveElement(A.Deck, 0);
      this.Refresh();
      if (A.Hand.length >= CardMaxHand) {
        await this.DrawFx(Who, -1, A.Hand.length);
        A.Grave = [...A.Grave, D];
        this.LogBoth(Who, TlBurnt(TxYou, D.Name), TlBurnt(TxOpponent, D.Name));
      } else {
        this.SndTo(Who, SfxDraw);
        await this.DrawFx(Who, A.Hand.length, A.Hand.length + 1);
        A.Hand = [...A.Hand, MakeHandCard(D)];
        this.Refresh();
      }
    } else {
      A.Fatigue += 1;
      this.LogBoth(Who, TlFatigue(TxYou, A.Fatigue), TlFatigue(TxOpponent, A.Fatigue));
      await this.Damage(this.Hero(Who), A.Fatigue);
    }
  }

  // puts a new monster on the board (from the hand or from an effect)
  async Summon(Who, Col, D) { return await this.SummonCost(Who, Col, D, D.Cost); }

  // Cost: the mana it was played for (shown on its details when it was lowered)
  async SummonCost(Who, Col, D, Cost) {
    const A = this.S(Who);
    const U = MakeUnit(D);
    U.PlayedCost = Cost;
    U.Prem = A.PremOf(D.Id);
    // an amulet never acts
    U.Sleeping = (D.Haste || D.Amulet) ? false : true;
    U.CanAct = D.Amulet ? false : (D.Haste || D.Rush) ? true : false;
    A.Board = RuWith(A.Board, Col, U);
    if (!D.Amulet) A.Summons += 1;
    this.LogBoth(Who, TlSummon(TxYou, D.Name), TlSummon(TxOpponent, D.Name));
    this.Refresh();
    // every rarity has its own entrance (FxSummon plays its sound too)
    const T0 = MkTgt(Who, Col);
    for (const [W, V] of this.Vs()) spawn(() => V.FxSummon(UiOf(Loc(W, T0)), D.Rarity));
    this.Toast(TlSummoned(D.Name), 1.0);
    await this.Wait(D.Rarity >= RarL ? 1.1 : D.Rarity >= RarE ? 0.7 : 0.4);
    // amulets / monsters that give something to every ally monster coming onto the board
    if (!D.Amulet) {
      const New1 = MkTgt(Who, Col);
      for (let C2 = 0; C2 <= 2; C2++) {
        if (C2 === Col) continue;
        const X = At(A.Board, C2);
        if (!X || X.Live(X.Def.AllySum).K === fx_kind.None || this.Ended || !this.OnBoard(Who, Col, U)) continue;
        await this.FxShow(Who, C2, X.Def, FxShowAlly);
        const F = X.Def.AllySum;
        if (F.K === fx_kind.SelfKw) await this.GiveKw(New1, F.N);
        else if (F.K === fx_kind.BuffSelf) await this.Buff(New1, F.N, F.M);
      }
    }
    return U;
  }

  // the countdown of the unit in slot C goes Steps further (turn start, or an effect): the tick effect each time,
  // the countdown effect at 0; an amulet breaks when its countdown is over
  async AdvanceCount(Who, C, U, Steps) {
    let Left = Steps;
    const Me1 = MkTgt(Who, C);
    for (;;) {
      if (Left <= 0 || U.Count <= 0 || this.Ended) break;
      if (!this.OnBoard(Who, C, U)) break;
      Left -= 1;
      U.Count -= 1;
      this.Refresh();
      this.Pop(Me1, TlCountDown(U.Count), true);
      await this.Wait(0.3);
      if (U.Live(U.Def.CdTick).K !== fx_kind.None) {
        await this.FxShow(Who, C, U.Def, FxShowTick);
        await this.DoFx(Who, C, U.Def.CdTick, this.Hero(Who));
        await this.ResolveDeaths();
        this.CheckOver();
      }
      if (U.Count === 0 && !this.Ended) {
        if (U.Live(U.Def.CdFx).K !== fx_kind.None) await this.FxShow(Who, C, U.Def, FxShowCount);
        await this.DoFx(Who, C, U.Live(U.Def.CdFx), this.Hero(Who));
        await this.ResolveDeaths();
        this.CheckOver();
        if (U.Def.Amulet && this.OnBoard(Who, C, U)) {
          U.Hp = 0;
          await this.ResolveDeaths();
        }
      }
    }
  }

  // a monster goes back to its owner's hand (tokens vanish)
  async Bounce(T) {
    const Sd = this.S(T.Side);
    const U = At(Sd.Board, T.Col);
    if (U) {
      this.Vfx(VfxWind, T);
      this.Snd(SfxReturn);
      Sd.Board = RuWith(Sd.Board, T.Col, null);
      this.Refresh();
      await this.Wait(0.25);
      if (U.Def.Token && !CardKeptToken(U.Def)) {
        this.Log(TlVanished(U.Def.Name));
      } else {
        this.LogBoth(T.Side, TlBounced(U.Def.Name, TxYou), TlBounced(U.Def.Name, TxOpponent));
        await this.AddToHand(T.Side, U.Def);
      }
    }
  }

  // ------------------------------------------------------------ card effects
  // Col = the slot of the monster that owns the effect (-1 for spells / jewels), T = the chosen target
  async DoFx(Who, Col, F, T) {
    if (F.K === fx_kind.None) return;
    if (!this.FxWouldRun(Who, Col, F)) return;
    if (FxTarget(F.K) > 0 && !this.FxTargetOk(Who, F, T)) return;
    const A = this.S(Who);
    const O = 1 - Who;
    const N = F.N;
    const K = F.K;
    const Front = MkTgt(O, Col);
    const Me1 = MkTgt(Who, Col);
    const Hero = W => this.Hero(W);
    if (IsNewFx(K)) {
      await this.DoFxNew(Who, Col, F, T);
      return;
    }
    if (K === fx_kind.HitFoeHero) {
      this.Vfx(VfxFire, Hero(O));
      await this.Damage(Hero(O), N);
    } else if (K === fx_kind.HealHero) {
      await this.Heal(Hero(Who), N);
    } else if (K === fx_kind.Draw) {
      for (let I = 1; I <= N; I++) await this.Draw(Who);
      this.Refresh();
    } else if (K === fx_kind.HeroAtk) {
      A.HeroAtk += N;
      this.Refresh();
      this.Snd(SfxAwaken);
      this.Vfx(VfxBuff, Hero(Who));
      this.Pop(Hero(Who), TxPlus(N), true);
      await this.Wait(0.45);
    } else if (K === fx_kind.ManaUp) {
      const Was = A.MaxMana;
      A.MaxMana = Min(CardMaxMana, A.MaxMana + N);
      // an amulet (マナの泉) does it at the turn start, after the mana was refilled: the new mana is full too (6/6 → 7/7)
      if (Col >= 0 && this.AmuletAt(Who, Col)) A.Mana += A.MaxMana - Was;
      this.Refresh();
      this.Snd(SfxMana);
      this.Vfx(VfxMana, Hero(Who));
      this.Pop(Hero(Who), TlManaUp(N), true);
      await this.Wait(0.45);
    } else if (K === fx_kind.GainMana) {
      A.Mana = Min(A.MaxMana, A.Mana + N);
      this.Refresh();
      this.Snd(SfxMana);
      this.Vfx(VfxMana, Hero(Who));
      await this.Wait(0.35);
    } else if (K === fx_kind.EvoUp) {
      A.EvoLeft += N;
      this.Refresh();
      this.Snd(SfxAwaken);
      await this.Wait(0.3);
    } else if (K === fx_kind.ShieldUp) {
      A.Shield += N;
      this.Refresh();
      this.Snd(SfxShield);
      this.Vfx(VfxBarrier, Hero(Who));
      this.Pop(Hero(Who), TlShieldUp(N), true);
      await this.Wait(0.45);
    } else if (K === fx_kind.HeroMaxUp) {
      A.MaxHp += N;
      A.Hp += N;
      this.Refresh();
      this.Snd(SfxHeal);
      this.Vfx(VfxHeal, Hero(Who));
      this.Pop(Hero(Who), TxPlus(N), true);
      await this.Wait(0.45);
    } else if (K === fx_kind.HitFront) {
      if (Col >= 0 && this.MonAt(O, Col)) {
        this.Vfx(VfxFire, Front);
        await this.Damage(Front, N);
      }
    } else if (K === fx_kind.FreezeFront) {
      if (Col >= 0 && this.MonAt(O, Col)) {
        this.Freeze(Front);
        await this.Wait(0.3);
      }
    } else if (K === fx_kind.KillFront) {
      if (Col >= 0 && this.MonAt(O, Col)) await this.Kill(Front);
    } else if (K === fx_kind.BounceFront) {
      if (Col >= 0 && At(this.S(O).Board, Col)) await this.Bounce(Front);
    } else if (K === fx_kind.DebuffFront) {
      if (Col >= 0 && this.MonAt(O, Col)) await this.Debuff(Front, N, F.M);
    } else if (K === fx_kind.HitRandomFoe) {
      for (let I = 1; I <= Max(1, F.M); I++) {
        const T0 = this.PickOne(this.FoeUnitsOf(Who));
        if (T0) {
          this.Vfx(VfxThunder, T0);
          await this.Damage(T0, N);
          await this.ResolveDeathsQuiet();
        }
      }
    } else if (K === fx_kind.HitAllFoes) {
      for (const T0 of this.FoeUnitsOf(Who)) this.Vfx(N >= 3 ? VfxExplode : VfxThunder, T0);
      await this.DamageMany(this.FoeUnitsOf(Who), N);
    } else if (K === fx_kind.HitAllOthers) {
      const Ts = [...this.FoeUnitsOf(Who), ...this.AllyUnitsOf(Who, Col)];
      for (const T0 of Ts) this.Vfx(VfxExplode, T0);
      await this.DamageMany(Ts, N);
    } else if (K === fx_kind.HitAllEnemies) {
      const Ts = [...this.FoeUnitsOf(Who), Hero(O)];
      for (const T0 of Ts) this.Vfx(VfxThunder, T0);
      await this.DamageMany(Ts, N);
    } else if (K === fx_kind.DebuffAllFoes) {
      for (const T0 of this.FoeUnitsOf(Who)) await this.Debuff(T0, N, F.M);
    } else if (K === fx_kind.FreezeRandom) {
      // a monster that is frozen already is not picked again
      const Thawed = this.FoeUnitsOf(Who).filter(T1 => { const U1 = this.MonAt(T1.Side, T1.Col); return U1 && !U1.Frozen; });
      const T0 = this.PickOne(Thawed);
      if (T0) {
        this.Freeze(T0);
        await this.Wait(0.3);
      }
    } else if (K === fx_kind.FreezeAll) {
      for (const T0 of this.FoeUnitsOf(Who)) this.Freeze(T0);
      await this.Wait(0.3);
    } else if (K === fx_kind.BuffAllies) {
      for (const T0 of this.AllyUnitsOf(Who, Col)) await this.Buff(T0, N, F.M);
    } else if (K === fx_kind.BuffRandomAlly) {
      const T0 = this.PickOne(this.AllyUnitsOf(Who, Col));
      if (T0) await this.Buff(T0, N, F.M);
    } else if (K === fx_kind.HealAllies) {
      for (const T0 of this.AllyUnitsOf(Who, F.M === 1 ? Col : -1)) await this.Heal(T0, N);
    } else if (K === fx_kind.BuffSelf) {
      if (Col >= 0 && this.MonAt(Who, Col)) await this.Buff(Me1, N, F.M);
    } else if (K === fx_kind.HealSelf) {
      if (Col >= 0 && this.MonAt(Who, Col)) await this.Heal(Me1, N);
    } else if (K === fx_kind.SelfKw) {
      if (Col >= 0 && this.MonAt(Who, Col)) await this.GiveKw(Me1, N);
    } else if (K === fx_kind.AllyKw) {
      for (const T0 of this.AllyUnitsOf(Who, Col)) await this.GiveKw(T0, N);
    } else if (K === fx_kind.AddCard) {
      // N >= the hand size (パペットガール): until the hand is full
      for (let I = 1; I <= N; I++) {
        if (!(N < CardMaxHand || A.Hand.length < CardMaxHand)) continue;
        const D = F.C <= CardRandomAny ? this.RandomCard(Who, F.C) : this.CardOf(F.C);
        // 首なし令嬢: the copy starts from the mana the destroyed one was played for
        const Base = (this.FxBaseCost >= 0 && F.C === this.FxSrcId) ? this.FxBaseCost : D.Cost;
        const Before = A.Hand.length;
        await this.AddToHand(Who, D);
        const H = A.Hand.length > Before ? At(A.Hand, A.Hand.length - 1) : undefined;
        if (H) {
          H.Cost = Max(0, Base - F.M);
          if (F.M > 0) this.HandPop(Who, A.Hand.length - 1, TlManaDown(F.M));
        }
      }
    } else if (K === fx_kind.Summon) {
      for (let I = 1; I <= N; I++) {
        const Free = this.EmptySlots(Who);
        const C0 = At(Free, this.Rng.Int(0, Free.length - 1));
        if (C0 !== undefined) await this.Summon(Who, C0, this.CardOf(F.C));
      }
    } else if (K === fx_kind.Transform) {
      const U = Col >= 0 ? At(A.Board, Col) : undefined;
      if (U) {
        this.Vfx(VfxSummonBig, Me1);
        A.Board = RuWith(A.Board, Col, null);
        if (!U.Def.Token) A.Grave = [...A.Grave, U.Def];
        this.Refresh();
        await this.Wait(0.3);
        await this.Summon(Who, Col, this.CardOf(F.C));
      }
    } else if (K === fx_kind.GraveToHand) {
      for (let I = 1; I <= N; I++) {
        if (A.Grave.length > 0) {
          const Pick = this.Rng.Int(0, A.Grave.length - 1);
          const D = At(A.Grave, Pick);
          if (D) {
            A.Grave = RemoveElement(A.Grave, Pick);
            this.LogBoth(Who, TlFromGrave(TxYou, D.Name), TlFromGrave(TxOpponent, D.Name));
            await this.AddToHand(Who, D);
          }
        }
      }
    } else if (K === fx_kind.GraveRevive) {
      // M > 1: up to M monsters
      let Left = Max(1, F.M);
      let Got = 0;
      for (;;) {
        if (Left <= 0 || this.Ended) break;
        Left -= 1;
        const Cands = [];
        A.Grave.forEach((D, I) => { if (D.IsMonster() && !D.Token && D.Cost <= N) Cands.push(I); });
        const Free = this.EmptySlots(Who);
        const Pick = At(Cands, this.Rng.Int(0, Cands.length - 1));
        const D = Pick !== undefined ? At(A.Grave, Pick) : undefined;
        const C0 = D ? At(Free, this.Rng.Int(0, Free.length - 1)) : undefined;
        if (C0 !== undefined) {
          A.Grave = RemoveElement(A.Grave, Pick);
          this.LogBoth(Who, TlRevived(TxYou, D.Name), TlRevived(TxOpponent, D.Name));
          this.Vfx(VfxDark, MkTgt(Who, C0));
          await this.Summon(Who, C0, D);
          Got += 1;
        } else {
          break;
        }
      }
      if (Got === 0) this.Log(TlNoRevive);
    } else if (K === fx_kind.GraveFill) {
      if (this.Human(Who)) await this.GraveFillPick(Who, N); else await this.GraveFill(Who, N);
    } else if (K === fx_kind.EvolveAllies) {
      for (let C0 = 0; C0 <= 2; C0++) {
        if (C0 === Col) continue;
        const U0 = this.MonAt(Who, C0);
        if (!U0 || U0.Evolved || this.Ended) continue;
        await this.EvolveFree(Who, C0);
      }
    } else if (K === fx_kind.Tutor) {
      const Cands = [];
      A.Deck.forEach((D, I) => { if (D.Cost <= N) Cands.push(I); });
      const Pick = At(Cands, this.Rng.Int(0, Cands.length - 1));
      const D = Pick !== undefined ? At(A.Deck, Pick) : undefined;
      if (D) {
        A.Deck = RemoveElement(A.Deck, Pick);
        this.LogBoth(Who, TlTutor(TxYou), TlTutor(TxOpponent));
        await this.AddToHand(Who, D);
      }
    } else if (K === fx_kind.HandDiscount) {
      // M = 1: only the monster cards
      for (const H of A.Hand) if (F.M === 0 || H.Def.IsMonster()) H.Cost = Max(0, H.Cost - N);
      this.LogBoth(Who, TlDiscount(TxYou, N), TlDiscount(TxOpponent, N));
      this.Snd(SfxMana);
      this.Refresh();
      await this.Wait(0.4);
    } else if (K === fx_kind.DrawDiscard) {
      // 取捨選択: the cards are drawn first (they can be thrown away too), then the discards are shown one by one
      for (let I = 1; I <= N; I++) await this.Draw(Who);
      this.Refresh();
      await this.Wait(0.5);
      for (let I = 1; I <= N; I++) {
        if (!(A.Hand.length > 0) || this.Ended) continue;
        await this.DiscardAt(Who, this.Rng.Int(0, A.Hand.length - 1));
      }
    } else if (K === fx_kind.HitTarget) {
      this.Vfx(N >= 4 ? VfxExplode : VfxFire, T);
      await this.Damage(T, N);
    } else if (K === fx_kind.FreezeHit) {
      this.Freeze(T);
      await this.Damage(T, N);
    } else if (K === fx_kind.DebuffTarget) {
      await this.Debuff(T, N, F.M);
    } else if (K === fx_kind.DestroyTarget) {
      await this.Kill(T);
    } else if (K === fx_kind.HealTarget) {
      await this.Heal(T, N);
    } else if (K === fx_kind.BuffTarget) {
      await this.Buff(T, N, F.M);
    } else if (K === fx_kind.GiveKw) {
      await this.GiveKw(T, N);
    } else if (K === fx_kind.Bounce) {
      await this.Bounce(T);
    } else if (K === fx_kind.SummonAt) {
      const Id = F.C >= 0 ? F.C : (At(CardSlimeTokens, this.Rng.Int(0, CardSlimeTokens.length - 1)) ?? 18);
      if (this.CellEmpty(Who, T.Col)) await this.Summon(Who, T.Col, this.CardOf(Id));
    } else if (K === fx_kind.SummonKw) {
      const Free = this.EmptySlots(Who);
      const C0 = At(Free, this.Rng.Int(0, Free.length - 1));
      if (C0 !== undefined) {
        await this.Summon(Who, C0, this.CardOf(F.C));
        await this.GiveKw(MkTgt(Who, C0), N);
      }
    } else if (K === fx_kind.HitRandomEnemy) {
      for (let I = 1; I <= Max(1, F.M); I++) {
        if (this.Ended) continue;
        const Ts = [...this.FoeUnitsOf(Who), Hero(O)];
        const T0 = this.PickOne(Ts);
        if (T0) {
          this.Vfx(VfxThunder, T0);
          await this.Damage(T0, N);
          await this.ResolveDeathsQuiet();
          this.CheckOver();
        }
      }
    } else if (K === fx_kind.TutorHigh || K === fx_kind.TutorSpell) {
      const Times = K === fx_kind.TutorSpell ? Max(1, N) : Max(1, F.M);
      for (let I = 1; I <= Times; I++) {
        const Cands = [];
        A.Deck.forEach((D, J) => { if ((K === fx_kind.TutorSpell && D.IsSpell) || (K === fx_kind.TutorHigh && D.Cost >= N)) Cands.push(J); });
        const Pick = At(Cands, this.Rng.Int(0, Cands.length - 1));
        const D = Pick !== undefined ? At(A.Deck, Pick) : undefined;
        if (D) {
          A.Deck = RemoveElement(A.Deck, Pick);
          this.LogBoth(Who, TlTutor(TxYou), TlTutor(TxOpponent));
          const Before = A.Hand.length;
          await this.AddToHand(Who, D);
          // まほうの帽子: the spell costs M less
          const H = (K === fx_kind.TutorSpell && F.M > 0 && A.Hand.length > Before) ? At(A.Hand, A.Hand.length - 1) : undefined;
          if (H) {
            H.Cost = Max(0, H.Cost - F.M);
            this.HandPop(Who, A.Hand.length - 1, TlManaDown(F.M));
          }
        }
      }
    } else if (K === fx_kind.HealRandomAlly) {
      const T0 = this.PickOne(this.AllyUnitsOf(Who, -1));
      if (T0) await this.Heal(T0, N);
    } else if (K === fx_kind.FreezeHitRandom) {
      const Thawed = this.FoeUnitsOf(Who).filter(T1 => { const U1 = this.MonAt(T1.Side, T1.Col); return U1 && !U1.Frozen; });
      const T0 = this.PickOne(Thawed);
      if (T0) {
        this.Freeze(T0);
        await this.Damage(T0, N);
      }
    } else if (K === fx_kind.HitFrontWide) {
      if (Col >= 0) {
        const Ts = [];
        for (let C0 = Col - 1; C0 <= Col + 1; C0++) if (C0 >= 0 && C0 <= 2 && this.MonAt(O, C0)) Ts.push(MkTgt(O, C0));
        for (const T0 of Ts) this.Vfx(VfxExplode, T0);
        await this.DamageMany(Ts, N);
      }
    } else if (K === fx_kind.HealRandomAny) {
      for (let I = 1; I <= Max(1, F.M); I++) {
        if (this.Ended) continue;
        const All = [];
        for (let W0 = 0; W0 <= 1; W0++) for (let C0 = 0; C0 <= 2; C0++) if (this.MonAt(W0, C0)) All.push(MkTgt(W0, C0));
        const T0 = this.PickOne(All);
        if (T0) await this.Heal(T0, N);
      }
    } else if (K === fx_kind.HealTeam) {
      for (const T0 of this.AllyUnitsOf(Who, -1)) await this.Heal(T0, N);
      await this.Heal(Hero(Who), N);
    } else if (K === fx_kind.DevourFoe) {
      const Tg = this.MonAt(T.Side, T.Col);
      if (Tg) {
        if (Tg.Invincible) {
          this.Pop(T, TkInvincible, false);
          await this.Wait(0.35);
        } else {
          const GainA = Max(0, Tg.Atk);
          const GainH = Max(0, Tg.Hp);
          await this.Kill(T);
          await this.ResolveDeaths();
          if (Col >= 0 && this.MonAt(Who, Col) && GainA + GainH > 0) await this.Buff(Me1, GainA, GainH);
        }
      }
    } else if (K === fx_kind.HitEnemy) {
      this.Vfx(VfxFire, T);
      await this.Damage(T, N);
    } else if (K === fx_kind.BounceTwo) {
      await this.Bounce(T);
      const Second = await this.PickSecond(Who);
      if (Second) await this.Bounce(Second);
    } else if (K === fx_kind.Fuse) {
      if (Col >= 0 && this.MonAt(Who, Col)) {
        let Mate = -1;
        for (let C0 = 0; C0 <= 2; C0++) {
          const P0 = C0 !== Col ? this.MonAt(Who, C0) : undefined;
          if (P0 && P0.Def.Id === F.M) { if (Mate < 0) Mate = C0; }
        }
        if (Mate >= 0) {
          this.Toast(TlFuse(this.CardOf(F.C).Name), 1.2);
          this.Vfx(VfxEvolve, Me1);
          this.Vfx(VfxEvolve, MkTgt(Who, Mate));
          this.Snd(SfxEvolve);
          await this.Wait(0.5);
          A.Board = RuWith(RuWith(A.Board, Mate, null), Col, null);
          this.Refresh();
          await this.Wait(0.2);
          await this.Summon(Who, Col, this.CardOf(F.C));
        }
      }
    } else if (K === fx_kind.KillAllOthers) {
      const Ts = [];
      for (let W0 = 0; W0 <= 1; W0++) for (let C0 = 0; C0 <= 2; C0++) if ((W0 !== Who || C0 !== Col) && this.MonAt(W0, C0)) Ts.push(MkTgt(W0, C0));
      await this.KillMany(Ts);
    } else if (K === fx_kind.ManaNext) {
      A.NextMana += N;
      this.LogBoth(Who, TlManaNext(TxYou, N), TlManaNext(TxOpponent, N));
      this.Snd(SfxMana);
    } else if (K === fx_kind.DiscountRandom) {
      // one card at a time, so the player sees every card getting cheaper
      for (let I = 1; I <= Max(1, F.M); I++) {
        const Idx = this.Rng.Int(0, A.Hand.length - 1);
        const H = At(A.Hand, Idx);
        if (H) {
          H.Cost = Max(0, H.Cost - N);
          this.LogBoth(Who, TlPickDiscount(TxYou, H.Def.Name, N), TlPickDiscount(TxOpponent, TxEmpty, N));
          this.Refresh();
          this.HandPop(Who, Idx, TlManaDown(N));
          this.SndTo(Who, SfxMana);
          await this.Wait(0.55);
        }
      }
    } else if (K === fx_kind.DebuffRandomFoe) {
      const T0 = this.PickOne(this.FoeUnitsOf(Who));
      if (T0) await this.Debuff(T0, N, F.M);
    } else if (K === fx_kind.BuffSelfTurn) {
      const U0 = Col >= 0 ? this.MonAt(Who, Col) : undefined;
      if (U0) {
        U0.TempAtk += N;
        await this.Buff(Me1, N, 0);
      }
    } else if (K === fx_kind.HitAny) {
      this.Vfx(VfxFire, T);
      await this.Damage(T, N);
    } else if (K === fx_kind.KillRandomFoe) {
      const T0 = this.PickOne(this.FoeUnitsOf(Who));
      if (T0) await this.Kill(T0);
    } else if (K === fx_kind.AdvanceAll) {
      for (const C0 of this.AmuletsOf(Who)) {
        const U = this.AmuletAt(Who, C0);
        if (!U || !(U.Count > 0) || this.Ended) continue;
        this.Vfx(VfxMana, MkTgt(Who, C0));
        await this.AdvanceCount(Who, C0, U, N);
      }
    } else if (K === fx_kind.AdvanceTarget) {
      const U = this.AmuletAt(Who, T.Col);
      if (U) {
        this.Vfx(VfxMana, T);
        await this.AdvanceCount(Who, T.Col, U, N);
      }
    } else if (K === fx_kind.DestroyAmulet) {
      const U = this.AmuletAt(T.Side, T.Col);
      if (U) {
        this.Vfx(VfxExplode, T);
        U.Hp = 0;
        this.Log(TlKilled(U.Def.Name));
        await this.Wait(0.35);
      }
    } else if (K === fx_kind.Devour) {
      // eats an other ally monster: its attack and HP are added to this one
      const Tg = (Col >= 0 && T.Col !== Col) ? this.MonAt(Who, T.Col) : undefined;
      if (Tg && this.MonAt(Who, Col)) {
        if (Tg.Invincible) {
          this.Pop(T, TkInvincible, false);
          await this.Wait(0.35);
        } else {
          const GainA = Max(0, Tg.Atk);
          const GainH = Max(0, Tg.Hp);
          this.Vfx(VfxDark, T);
          Tg.Hp = Min(Tg.Hp, 0);
          this.Log(TlDevoured(Tg.Def.Name));
          await this.Wait(0.35);
          await this.ResolveDeaths();
          if (GainA + GainH > 0) await this.Buff(Me1, GainA, GainH);
        }
      }
    } else if (K === fx_kind.DiscountPick) {
      await this.PickDiscount(Who, N);
    }
  }

  // the v14 effects (DoFx hands them over)
  async DoFxNew(Who, Col, F, T) {
    const A = this.S(Who);
    const O = 1 - Who;
    const N = F.N;
    const K = F.K;
    const Front = MkTgt(O, Col);
    const Me1 = MkTgt(Who, Col);
    const Hero = W => this.Hero(W);
    if (K === fx_kind.BuffOther) {
      await this.Buff(T, N, F.M);
    } else if (K === fx_kind.KillSelf) {
      if (Col >= 0 && this.MonAt(Who, Col)) await this.Kill(Me1);
    } else if (K === fx_kind.ReturnSelf) {
      if (Col >= 0 && this.MonAt(Who, Col)) await this.Bounce(Me1);
    } else if (K === fx_kind.DrawBoth) {
      for (let I = 1; I <= N; I++) {
        await this.Draw(Who);
        await this.Draw(O);
      }
      this.Refresh();
    } else if (K === fx_kind.DrawCheap) {
      for (let I = 1; I <= N; I++) {
        const Before = A.Hand.length;
        await this.Draw(Who);
        const H = A.Hand.length > Before ? At(A.Hand, A.Hand.length - 1) : undefined;
        if (H) {
          H.Cost = Max(0, H.Cost - F.M);
          this.Refresh();
          this.HandPop(Who, A.Hand.length - 1, TlManaDown(F.M));
          this.SndTo(Who, SfxMana);
          await this.Wait(0.3);
        }
      }
    } else if (K === fx_kind.GravePick) {
      for (let I = 1; I <= Max(1, N); I++) {
        if (this.Ended) continue;
        await this.GravePickOne(Who);
      }
    } else if (K === fx_kind.FoeHandToDeck) {
      for (let I = 1; I <= Max(1, N); I++) await this.HandToDeck(O);
    } else if (K === fx_kind.HitOwnHero) {
      this.Vfx(VfxDark, Hero(Who));
      await this.Damage(Hero(Who), N);
      this.CheckOver();
    } else if (K === fx_kind.HitFrontSplash) {
      if (Col >= 0) {
        if (this.MonAt(O, Col)) {
          this.Vfx(VfxExplode, Front);
          await this.Damage(Front, N);
        }
        const Sides = [];
        for (let C0 = Col - 1; C0 <= Col + 1; C0++) if (C0 !== Col && C0 >= 0 && C0 <= 2 && this.MonAt(O, C0)) Sides.push(MkTgt(O, C0));
        for (const T0 of Sides) this.Vfx(VfxFire, T0);
        await this.DamageMany(Sides, F.M);
      }
    } else if (K === fx_kind.SummonRushBuff) {
      for (let I = 1; I <= N; I++) {
        if (this.Ended) continue;
        const Free = this.EmptySlots(Who);
        const C0 = At(Free, this.Rng.Int(0, Free.length - 1));
        if (C0 !== undefined) {
          await this.Summon(Who, C0, this.CardOf(F.C));
          const T0 = MkTgt(Who, C0);
          await this.GiveKw(T0, KwRush);
          if (F.M > 0) await this.Buff(T0, F.M, 0);
        }
      }
    } else if (K === fx_kind.HitAllMonsters) {
      const Ts = [];
      for (let W0 = 0; W0 <= 1; W0++) for (let C0 = 0; C0 <= 2; C0++) if (this.MonAt(W0, C0)) Ts.push(MkTgt(W0, C0));
      for (const T0 of Ts) this.Vfx(VfxExplode, T0);
      await this.DamageMany(Ts, N);
    } else if (K === fx_kind.HitSelf) {
      if (Col >= 0 && this.MonAt(Who, Col)) {
        this.Vfx(VfxFire, Me1);
        await this.Damage(Me1, N);
      }
    } else if (K === fx_kind.HitRandomAny) {
      for (let I = 1; I <= Max(1, F.M); I++) {
        if (this.Ended) continue;
        const All = [];
        for (let W0 = 0; W0 <= 1; W0++) for (let C0 = 0; C0 <= 2; C0++) if ((W0 !== Who || C0 !== Col) && this.MonAt(W0, C0)) All.push(MkTgt(W0, C0));
        const T0 = this.PickOne(All);
        if (T0) {
          this.Vfx(VfxThunder, T0);
          await this.Damage(T0, N);
          await this.ResolveDeathsQuiet();
        }
      }
    } else if (K === fx_kind.SummonFoe) {
      for (let I = 1; I <= Max(1, N); I++) {
        if (this.Ended) continue;
        const Free = this.EmptySlots(O);
        const C0 = At(Free, this.Rng.Int(0, Free.length - 1));
        if (C0 !== undefined) await this.Summon(O, C0, this.CardOf(F.C));
      }
    } else if (K === fx_kind.IfAllyBuff || K === fx_kind.IfAllyKw) {
      if (Col >= 0 && this.MonAt(Who, Col)) {
        const Has = [];
        for (let C0 = 0; C0 <= 2; C0++) { const P0 = C0 !== Col ? this.MonAt(Who, C0) : undefined; if (P0 && P0.Def.Id === F.C) Has.push(C0); }
        if (Has.length > 0) {
          if (K === fx_kind.IfAllyBuff) await this.Buff(Me1, N, F.M); else await this.GiveKw(Me1, N);
        }
      }
    } else if (K === fx_kind.FoeDiscard) {
      for (let I = 1; I <= Max(1, N); I++) {
        const Od = this.S(O);
        if (Od.Hand.length > 0) {
          this.Vfx(VfxDark, Hero(O));
          await this.DiscardAt(O, this.Rng.Int(0, Od.Hand.length - 1));
        }
      }
    } else if (K === fx_kind.DeckSummon) {
      const Cands = [];
      A.Deck.forEach((D, I) => { if (D.IsMonster() && D.Cost <= N) Cands.push(I); });
      const Free = this.EmptySlots(Who);
      const Pick = At(Cands, this.Rng.Int(0, Cands.length - 1));
      const D = Pick !== undefined ? At(A.Deck, Pick) : undefined;
      const C0 = D ? At(Free, this.Rng.Int(0, Free.length - 1)) : undefined;
      if (C0 !== undefined) {
        A.Deck = RemoveElement(A.Deck, Pick);
        this.LogBoth(Who, TlFromDeck(TxYou, D.Name), TlFromDeck(TxOpponent, D.Name));
        await this.Summon(Who, C0, D);
      }
    } else if (K === fx_kind.GravePickSummon) {
      await this.GraveSummonPick(Who, N);
    } else if (K === fx_kind.SummonTrump) {
      for (let I = 1; I <= Max(1, N); I++) {
        if (this.Ended) continue;
        const Free = this.EmptySlots(Who);
        const C0 = At(Free, this.Rng.Int(0, Free.length - 1));
        const Id = C0 !== undefined ? At(CardTrumpIds, this.Rng.Int(0, CardTrumpIds.length - 1)) : undefined;
        if (Id !== undefined) {
          await this.Summon(Who, C0, this.CardOf(Id));
          if (F.M > 0) await this.Buff(MkTgt(Who, C0), F.M, F.M);
        }
      }
    } else if (K === fx_kind.SilenceFront) {
      if (Col >= 0 && this.MonAt(O, Col)) await this.Silence(Front);
    } else if (K === fx_kind.SpellLock) {
      this.S(O).SpellLock = true;
      this.LogBoth(O, TlSpellLock(TxYou), TlSpellLock(TxOpponent));
      this.Refresh();
      this.Snd(SfxDebuff);
      this.Vfx(VfxCurse, Hero(O));
      this.Pop(Hero(O), TlSpellLockPop, false);
      await this.Wait(0.6);
    } else if (K === fx_kind.Choose) {
      await this.ChooseFx(Who, Col, this.CardOf(F.C), this.CardOf(F.M));
    } else if (K === fx_kind.HandKw) {
      let Got = 0;
      const Hand = A.Hand;
      for (let I = 0; I < Hand.length; I++) {
        const H = Hand[I];
        if (H.Def.Id !== F.C) continue;
        H.GotKw = N;
        Got += 1;
        this.HandPop(Who, I, KwName(N));
      }
      if (Got > 0) {
        this.LogBoth(Who, TlHandKw(TxYou, this.CardOf(F.C).Name, KwName(N)), TlHandKw(TxOpponent, this.CardOf(F.C).Name, KwName(N)));
        this.SndTo(Who, SfxBuff);
        this.Refresh();
        await this.Wait(0.5);
      }
    } else if (K === fx_kind.VanishSelf) {
      const U = Col >= 0 ? At(A.Board, Col) : undefined;
      if (U) {
        this.Vfx(VfxWind, Me1);
        this.Snd(SfxReturn);
        A.Board = RuWith(A.Board, Col, null);
        this.Log(TlVanished(U.Def.Name));
        this.Refresh();
        await this.Wait(0.4);
      }
    } else if (K === fx_kind.KillOwnOthers) {
      const Ts = [];
      for (let C0 = 0; C0 <= 2; C0++) if (C0 !== Col && At(A.Board, C0)) Ts.push(MkTgt(Who, C0));
      await this.KillMany(Ts);
      await this.ResolveDeaths();
    } else if (K === fx_kind.DestroyAlly) {
      // リボンバット: an other own monster is destroyed
      if (T.Side === Who && T.Col !== Col && this.MonAt(Who, T.Col)) await this.Kill(T);
    } else if (K === fx_kind.BounceAny) {
      // ワルル: a monster or an amulet goes back to its owner's hand
      await this.Bounce(T);
    } else if (K === fx_kind.ArtifactDeck) {
      const Deck = [];
      for (let I = 1; I <= Max(1, N); I++) Deck.push(this.RandomCard(Who, CardRandomArtifact));
      A.Deck = Deck;
      this.LogBoth(Who, TlArtifactDeck(TxYou, N), TlArtifactDeck(TxOpponent, N));
      this.Toast(TlArtifactDeckToast, 1.4);
      this.Snd(SfxShuffle);
      this.Vfx(VfxEvolve, Hero(Who));
      this.Refresh();
      await this.Wait(0.8);
    } else if (K === fx_kind.HeroEndSummon) {
      A.EndSummons = [...A.EndSummons, F.C];
      this.LogBoth(Who, TlHeroEndSummon(TxYou, this.CardOf(F.C).Name), TlHeroEndSummon(TxOpponent, this.CardOf(F.C).Name));
      this.Snd(SfxDark);
      this.Vfx(VfxDark, Hero(Who));
      this.Pop(Hero(Who), TlHeroEndSummonPop, true);
      this.Refresh();
      await this.Wait(0.6);
    }
  }

  // 効果消滅: the monster loses every effect of its card and every keyword (even 威圧 / バリア / 無敵)
  async Silence(T) {
    const U = this.MonAt(T.Side, T.Col);
    if (U) {
      U.Silenced = true;
      U.Taunt = false;
      U.Haste = false;
      U.Rush = false;
      U.Deadly = false;
      U.Drain = false;
      U.Barrier = false;
      U.Invincible = false;
      U.Intimidate = false;
      U.Stealth = false;
      U.Count = 0;
      this.LogBoth(T.Side, TlSilenced(U.Def.Name, TxYou), TlSilenced(U.Def.Name, TxOpponent));
      this.Refresh();
      this.Snd(SfxDebuff);
      this.Vfx(VfxCurse, T);
      this.Pop(T, TkSilenced, false);
      await this.Wait(0.6);
    }
  }

  // どちらかを選んで発動: the player picks one of two spell cards (the AI takes the better one); the other players see the pick
  async ChooseFx(Who, Col, A, B) {
    const Opts = [A, B];
    let Pick = this.FxScore(Who, B.Spell, this.Hero(Who), 0.0) > this.FxScore(Who, A.Spell, this.Hero(Who), 0.0) ? 1 : 0;
    if (this.Human(Who)) Pick = await this.ChooseOf(Who, Opts, TnChooseFx, TbAuto, false);
    const D = At(Opts, Pick);
    if (D) {
      this.LogBoth(Who, TlChose(TxYou, D.Name), TlChose(TxOpponent, D.Name));
      this.Cast(D, Who, D.Cost);
      this.Snd(SfxSpell);
      this.Refresh();
      await this.Wait(this.Watched(Who) ? 1.2 : 0.6);
      this.HideCast();
      await this.DoFx(Who, Col, D.Spell, this.Hero(Who));
      if (D.Spell2.K !== fx_kind.None && !this.Ended) await this.DoFx(Who, Col, D.Spell2, this.Hero(Who));
    }
  }

  // a pop-up over a card of side Who's hand (only the owner sees which card)
  HandPop(Who, Idx, Msg) {
    const V = At(this.Views, Who);
    if (V) {
      // (the hand positions are laid out first: a card drawn a moment ago has no place yet)
      this.RefreshNow();
      V.FxHandPop(Idx, Msg);
    }
  }

  // card Pick of side Who's hand is thrown away: it is marked (the owner sees which one), flies to the grave,
  // and the grave shows it
  async DiscardAt(Who, Pick) {
    const A = this.S(Who);
    const H = At(A.Hand, Pick);
    if (H) {
      const N0 = A.Hand.length;
      this.HandPop(Who, Pick, TlDiscardPop);
      this.Snd(SfxDark);
      await this.Wait(0.45);
      for (const [X, V] of this.Vs()) spawn(() => V.FxDiscard(X === Who ? 0 : 1, Pick, N0));
      await this.Wait(0.3);
      A.Hand = RemoveElement(A.Hand, Pick);
      A.Grave = [...A.Grave, H.Def];
      this.LogBoth(Who, TlDiscard(TxYou, H.Def.Name), TlDiscard(TxOpponent, H.Def.Name));
      this.Refresh();
      await this.Wait(0.3);
    }
  }

  // a random card of side Who's hand goes back into the deck (サンドール)
  async HandToDeck(Who) {
    const A = this.S(Who);
    if (A.Hand.length === 0) return;
    const Pick = this.Rng.Int(0, A.Hand.length - 1);
    const H = At(A.Hand, Pick);
    if (H) {
      const N0 = A.Hand.length;
      for (const [X, V] of this.Vs()) spawn(() => V.FxReturn(X === Who ? 0 : 1, Pick, N0));
      await this.Wait(0.3);
      A.Hand = RemoveElement(A.Hand, Pick);
      A.Deck = this.Rng.Shuffle([...A.Deck, H.Def]);
      this.LogBoth(Who, TlToDeck(TxYou, H.Def.Name), TlToDeck(TxOpponent, TxEmpty));
      this.Snd(SfxShuffle);
      this.Refresh();
      await this.Wait(0.3);
    }
  }

  // the card of Cands the side's player picks (the AI takes the most expensive one): an index of Cands, -1 = none
  // (Decide: the pick of a player, made in their browser and shared)
  async ChooseOf(Who, Cands, Title, Stop, CanStop) {
    if (Cands.length === 0) return -1;
    let Best = 0;
    let BestCost = -1;
    Cands.forEach((D, I) => {
      if (D.Cost > BestCost || (D.Cost === BestCost && this.Rng.Int(0, 1) === 0)) {
        BestCost = D.Cost;
        Best = I;
      }
    });
    if (this.Human(Who)) {
      const R = await this.Decide(Who, async () => {
        const V = this.ViewOf(Who);
        const Busy0 = this.Busy;
        V.Say(Title);
        const Id = await V.ChooseCard(Cands, Title, Stop, this.TurnSeconds > 0.0 ? this.Deadline : 0.0);
        this.Busy = Busy0;
        this.Refresh();
        if (Id >= 0 && Id < Cands.length) return Id;
        if (Id === -1 && CanStop) return -1;
        // (time up, or おまかせ): a random one (only in this browser: the result is shared)
        return GetRandomInt(0, Cands.length - 1);
      }, -1);
      return typeof R === 'number' ? R : -1;
    }
    return Best;
  }

  // 思い出の欠片: a card of the own grave (picked) goes to the hand
  async GravePickOne(Who) {
    const A = this.S(Who);
    // newest first, like the grave list
    const Order = [];
    for (let I = 0; I <= A.Grave.length - 1; I++) Order.push(A.Grave.length - 1 - I);
    const Cands = Order.map(I => At(A.Grave, I)).filter(D => D !== undefined);
    if (Cands.length === 0) {
      this.Log(TlGraveEmpty);
      return;
    }
    const K = await this.ChooseOf(Who, Cands, TnPickGrave, TbAuto, false);
    const I = At(Order, K);
    const D = I !== undefined ? At(A.Grave, I) : undefined;
    if (D) {
      A.Grave = RemoveElement(A.Grave, I);
      this.LogBoth(Who, TlFromGrave(TxYou, D.Name), TlFromGrave(TxOpponent, D.Name));
      await this.AddToHand(Who, D);
    }
  }

  // the grave indices (newest first) of the monsters with cost <= N that can come back
  GraveMonIdx(Who, N) {
    const A = this.S(Who);
    const Idx = [];
    for (let I = 0; I <= A.Grave.length - 1; I++) {
      const J = A.Grave.length - 1 - I;
      const D = At(A.Grave, J);
      if (D && D.IsMonster() && !D.Token && D.Cost <= N) Idx.push(J);
    }
    return Idx;
  }

  // 怨霊どくろ: a monster with cost <= N of the own grave (picked) is summoned
  async GraveSummonPick(Who, N) {
    const A = this.S(Who);
    const Free = this.EmptySlots(Who);
    const Idx = this.GraveMonIdx(Who, N);
    const Cands = Idx.map(J => At(A.Grave, J)).filter(D => D !== undefined);
    if (Cands.length === 0 || Free.length === 0) {
      this.Log(TlNoRevive);
      return;
    }
    const K = await this.ChooseOf(Who, Cands, TnPickRevive(N), TbAuto, false);
    const J = At(Idx, K);
    const D = J !== undefined ? At(A.Grave, J) : undefined;
    const C0 = D ? At(Free, this.Rng.Int(0, Free.length - 1)) : undefined;
    if (C0 !== undefined) {
      A.Grave = RemoveElement(A.Grave, J);
      this.LogBoth(Who, TlRevived(TxYou, D.Name), TlRevived(TxOpponent, D.Name));
      this.Vfx(VfxDark, MkTgt(Who, C0));
      await this.Summon(Who, C0, D);
    }
  }

  // 死者の行進 (a player): monsters of the own grave are picked one by one while their costs fit into N and slots are free
  async GraveFillPick(Who, N) {
    const A = this.S(Who);
    let Left = N;
    let Got = 0;
    for (;;) {
      if (this.Ended) break;
      const Free = this.EmptySlots(Who);
      if (Free.length === 0) break;
      const Idx = this.GraveMonIdx(Who, Left);
      const Cands = Idx.map(J => At(A.Grave, J)).filter(D => D !== undefined);
      if (Cands.length === 0) break;
      const K = await this.ChooseOf(Who, Cands, TnPickFill(Left), TbFillStop, true);
      if (K < 0) break;
      const J = At(Idx, K);
      const D = J !== undefined ? At(A.Grave, J) : undefined;
      const C0 = D ? At(Free, 0) : undefined;
      if (C0 !== undefined) {
        A.Grave = RemoveElement(A.Grave, J);
        Left -= D.Cost;
        Got += 1;
        this.LogBoth(Who, TlRevived(TxYou, D.Name), TlRevived(TxOpponent, D.Name));
        this.Vfx(VfxDark, MkTgt(Who, C0));
        await this.Summon(Who, C0, D);
      } else {
        break;
      }
    }
    if (Got === 0) this.Log(TlNoRevive);
  }

  // 死者の行進: monsters of the own grave fill the empty slots; their costs add up to N at most (as close to N as it gets)
  async GraveFill(Who, N) {
    const A = this.S(Who);
    const Free = this.EmptySlots(Who);
    const Cands = [];
    A.Grave.forEach((D, I) => { if (D.IsMonster() && !D.Token && D.Cost <= N) Cands.push(I); });
    let Best = [];
    let BestSum = -1;
    // a few random tries, the fullest one is used
    for (let Try = 1; Try <= 24; Try++) {
      let Picked = [];
      let Sum = 0;
      for (const I of this.Rng.Shuffle(Cands)) {
        const D = At(A.Grave, I);
        if (Picked.length < Free.length && D && Sum + D.Cost <= N) {
          Picked = [...Picked, I];
          Sum += D.Cost;
        }
      }
      if (Sum > BestSum) {
        BestSum = Sum;
        Best = Picked;
      }
    }
    const Defs = Best.map(I => At(A.Grave, I)).filter(D => D !== undefined);
    if (Defs.length === 0) {
      this.Log(TlNoRevive);
      return;
    }
    A.Grave = A.Grave.filter((D, I) => !Best.includes(I));
    for (let K = 0; K < Defs.length; K++) {
      const D = Defs[K];
      const C0 = At(Free, K);
      if (C0 === undefined || this.Ended) continue;
      this.LogBoth(Who, TlRevived(TxYou, D.Name), TlRevived(TxOpponent, D.Name));
      this.Vfx(VfxDark, MkTgt(Who, C0));
      await this.Summon(Who, C0, D);
    }
  }

  // a monster evolves without using an evolve point (ファラオ); evolve effects that need a target are skipped
  async EvolveFree(Who, Col) {
    const U = this.MonAt(Who, Col);
    if (U && !U.Evolved) {
      const Me1 = MkTgt(Who, Col);
      await this.EvolveShow(Who, Col, U);
      U.Evolved = true;
      U.Atk += U.Def.EvoAtk;
      U.Hp += U.Def.EvoHp;
      U.MaxHp += U.Def.EvoHp;
      if (U.Sleeping) {
        U.Rush = true;
        if (!U.Acted && !U.Frozen) U.CanAct = true;
      }
      this.LogBoth(Who, TlEvolve(TxYou, U.Def.Name), TlEvolve(TxOpponent, U.Def.Name));
      this.Snd(SfxEvolve);
      this.Vfx(VfxEvolve, Me1);
      this.Refresh();
      this.Pop(Me1, BuffText(U.Def.EvoAtk, U.Def.EvoHp), true);
      await this.Wait(0.5);
      for (const F of [U.Live(U.Def.Evo), U.Live(U.Def.Evo2)]) {
        if (F.K === fx_kind.None || FxTarget(F.K) !== 0 || this.Ended) continue;
        await this.DoFx(Who, Col, F, this.Hero(Who));
      }
    }
  }

  // a second monster to pick in the middle of an effect: the player picks on the board, the AI takes the best enemy
  // (Decide: the UI id the player picked; null result = none)
  async PickSecond(Who) {
    const Cands = [];
    for (let W0 = 0; W0 <= 1; W0++) for (let C0 = 0; C0 <= 2; C0++) {
      const U0 = this.MonAt(W0, C0);
      if (U0 && (W0 === Who || !U0.Hidden())) Cands.push(MkTgt(W0, C0));
    }
    if (Cands.length === 0) return null;
    if (this.Human(Who)) {
      const Id = await this.Decide(Who, async () => {
        const V = this.ViewOf(Who);
        this.PickTgts = Cands;
        this.RefreshNow();
        V.Say(TnPickSecond);
        const Ids = Cands.map(T0 => UiOf(Loc(Who, T0)));
        const Def0 = At(Ids, 0) ?? 20;
        const R = this.TurnSeconds > 0.0 ? await V.PickUntil(Ids, Def0, -1, this.Deadline) : await V.Pick(Ids, Def0, -1);
        this.PickTgts = [];
        this.Refresh();
        return R;
      }, -1);
      const T0 = TgtOfUi(Id);
      if (T0) return Loc(Who, T0);
      return null;
    }
    let Best = null;
    let BestV = -1.0;
    for (const T0 of Cands) {
      if (T0.Side === Who) continue;
      const U0 = this.MonAt(T0.Side, T0.Col);
      if (!U0) continue;
      if (this.UnitValue(U0) > BestV) {
        BestV = this.UnitValue(U0);
        Best = T0;
      }
    }
    return Best;
  }

  // 喜怒哀楽 stamps: a face shown next to the player's portrait on both screens for 3 seconds
  async StampPick(Who, V) {
    // one stamp every 5 seconds
    const Now = GetSimulationElapsedTime();
    const Last = At(this.StampAt, Who);
    if (Last !== undefined && Now - Last < StampCooldown) {
      V.Snd(SfxCancel);
      const Secs = Ceil(StampCooldown - (Now - Last));
      V.Toast(TnStampWait(Number.isFinite(Secs) ? Secs : 1), 1.2);
      return;
    }
    const K = await V.PickStamp();
    if (K < 0) return;
    this.StampAt = RuWith(this.StampAt, Who, GetSimulationElapsedTime());
    this.ShowStampAll(Who, K);
    // (online: the other browser shows it too; the lobby calls RemoteStamp there)
    if (this.Net && !this.IsRemote(Who)) {
      if (this.Net.Stamp) this.Net.Stamp(Who, K);
      else if (this.Net.SendStamp) this.Net.SendStamp(Who, K);
    }
  }

  // stamp K of side Who on every screen
  ShowStampAll(Who, K) { for (const [W, X] of this.Vs()) X.ShowStamp(W === Who ? 0 : 1, K); }

  // online: the other player's stamp arrived (lobby.js); it is only shown (no game state)
  RemoteStamp(Who, K) { if (!this.Finished) this.ShowStampAll(Who, K); }

  // 大安売り: the player picks a card of the hand (the AI takes the most expensive one), it costs N less
  // (Decide: the hand index the player picked)
  async PickDiscount(Who, N) {
    const A = this.S(Who);
    if (A.Hand.length === 0) return;
    let Pick = 0;
    let BestCost = -1;
    A.Hand.forEach((H, I) => {
      if (H.Cost > BestCost) {
        BestCost = H.Cost;
        Pick = I;
      }
    });
    if (this.Human(Who)) {
      const Id = await this.Decide(Who, async () => {
        const V = this.ViewOf(Who);
        this.HandPick = true;
        this.RefreshNow();
        V.Say(TnPickHand(N));
        const Ids = A.Hand.map((H, I) => I);
        const R = this.TurnSeconds > 0.0 ? await V.PickUntil(Ids, 0, -1, this.Deadline) : await V.Pick(Ids, 0, -1);
        this.HandPick = false;
        return R;
      }, -1);
      if (Id >= 0 && Id < A.Hand.length) Pick = Id;
    }
    const H = At(A.Hand, Pick);
    if (H) {
      H.Cost = Max(0, H.Cost - N);
      this.LogBoth(Who, TlPickDiscount(TxYou, H.Def.Name, N), TlPickDiscount(TxOpponent, TxEmpty, N));
      this.SndTo(Who, SfxMana);
      this.Refresh();
      await this.Wait(0.3);
    }
  }

  // removes the destroyed monsters (between repeated random hits)
  async ResolveDeathsQuiet() {
    let Dead = 0;
    for (let Who = 0; Who <= 1; Who++) for (let C = 0; C <= 2; C++) { const U = At(this.S(Who).Board, C); if (U && U.Hp <= 0) Dead += 1; }
    if (Dead > 0) await this.ResolveDeaths();
  }

  // removes destroyed monsters (repeats while death effects destroy more)
  async ResolveDeaths() {
    for (;;) {
      const Dead = [];
      for (let Who = 0; Who <= 1; Who++) for (let C = 0; C <= 2; C++) {
        const U = At(this.S(Who).Board, C);
        if (U && U.Hp <= 0) Dead.push([Who, C, U]);
      }
      if (Dead.length === 0) break;
      this.Snd(SfxDestroy);
      for (const X of Dead) this.Vfx(VfxDestroy, MkTgt(X[0], X[1]));
      await this.Wait(0.3);
      for (const X of Dead) {
        const Sd = this.S(X[0]);
        Sd.Board = RuWith(Sd.Board, X[1], null);
        const D = X[2].Def;
        if (!D.Token || CardKeptToken(D)) Sd.Grave = [...Sd.Grave, D];
        this.Log(TlDestroyed(D.Name));
      }
      this.Refresh();
      await this.Wait(0.2);
      for (const X of Dead) {
        const D = X[2].Def;
        if (X[2].Live(D.Death).K === fx_kind.None || this.Ended) continue;
        await this.FxShow(X[0], -1, D, FxShowDeath);
        this.FxSrcId = D.Id;
        this.FxBaseCost = X[2].PlayedCost;
        await this.DoFx(X[0], X[1], D.Death, this.Hero(X[0]));
        if (D.Death2.K !== fx_kind.None && !this.Ended) await this.DoFx(X[0], X[1], D.Death2, this.Hero(X[0]));
        this.FxSrcId = -1;
        this.FxBaseCost = -1;
      }
      this.CheckOver();
    }
  }

  CheckOver() {
    if (this.Ended) return;
    if (this.Me.Hp <= 0 || this.Foe.Hp <= 0) {
      this.Ended = true;
      this.Reason = EndHp;
      this.Winner = this.Me.Hp > 0 ? 0 : this.Foe.Hp > 0 ? 1 : -1;
    }
  }

  Surrender(Who) {
    if (this.Ended) return;
    this.Ended = true;
    this.Winner = 1 - Who;
    this.Reason = EndSurrender;
    this.LogBoth(Who, TlSurrender(TxYou), TlSurrender(TxOpponent));
  }

  // ------------------------------------------------------------ actions
  async Exec(Who, A) {
    if (!this.Legal(Who, A)) return;
    const IsStep = this.TutHit(Who, A);
    this.Busy = true;
    this.Sel = -1;
    this.Pend = null;
    this.Refresh();
    if (A.Kind === 1) await this.DoPlay(Who, A.Src, A.Dst, A.Dst2);
    else if (A.Kind === 2) await this.DoAttack(Who, A.Src, A.Dst);
    else if (A.Kind === 3) await this.DoMove(Who, A.Src, A.Dst.Col);
    else if (A.Kind === 4) await this.DoJewel(Who, A.Dst);
    else if (A.Kind === 6) await this.DoHeroAttack(Who, A.Dst);
    else if (A.Kind === 7) await this.DoEvolve(Who, A.Src, A.Dst2);
    await this.ResolveDeaths();
    this.CheckOver();
    if (IsStep && this.Tut) this.Tut.Next();
    this.Busy = false;
    this.Refresh();
  }

  // 自傷: the own player takes damage when the card is played
  async SelfHarm(Who, D) {
    if (D.SelfDmg > 0) {
      this.Vfx(VfxDark, this.Hero(Who));
      await this.Damage(this.Hero(Who), D.SelfDmg);
      this.CheckOver();
    }
  }

  // the second effect of a pair uses the same target when it needs one
  async Pair(Who, Col, A, B, T2) {
    await this.DoFx(Who, Col, A, FxTarget(A.K) > 0 ? T2 : this.Hero(Who));
    if (B.K !== fx_kind.None && !this.Ended) {
      await this.DoFx(Who, Col, B, FxTarget(B.K) > 0 ? T2 : this.Hero(Who));
    }
  }

  async DoPlay(Who, Idx, T, T2) {
    const A = this.S(Who);
    const H = At(A.Hand, Idx);
    if (!H) return;
    const D = H.Def;
    const Paid = H.Cost;
    A.Pay(Paid);
    A.Hand = RemoveElement(A.Hand, Idx);
    if (D.IsSpell) {
      this.LogBoth(Who, TlCast(TxYou, D.Name), TlCast(TxOpponent, D.Name));
      this.Snd(SfxSpell);
      // the spell is shown big to both players before it does anything, then its target flashes
      this.Cast(D, Who, Paid);
      this.Refresh();
      await this.Wait(this.Watched(Who) ? 1.7 : 1.0);
      this.HideCast();
      if (FxTarget(D.Spell.K) > 0 && T.Col >= -1 && FxTarget(D.Spell.K) !== 4) {
        this.Flash(T);
        this.Vfx(VfxMana, T);
        await this.Wait(0.35);
      }
      await this.SelfHarm(Who, D);
      if (this.Ended) return;
      for (const H0 of A.Hand) if (H0.Def.SpellCheaper) H0.Cost = Max(0, H0.Cost - 1);
      await this.DoFx(Who, -1, D.Spell, T);
      if (D.Spell2.K !== fx_kind.None && !this.Ended) await this.DoFx(Who, -1, D.Spell2, FxTarget(D.Spell2.K) > 0 ? T : this.Hero(Who));
      // ローストチキン: the card goes back to the hand instead of the grave
      if (D.Recur) {
        this.LogBoth(Who, TlRecur(TxYou, D.Name), TlRecur(TxOpponent, D.Name));
        await this.AddToHand(Who, D);
      } else {
        A.Grave = [...A.Grave, D];
      }
    } else {
      if (this.Watched(Who)) {
        this.Cast(D, Who, Paid);
        this.Refresh();
        await this.Wait(1.1);
        this.HideCast();
      }
      const U = await this.SummonCost(Who, T.Col, D, Paid);
      // (the keyword it got in the hand: パペット召喚士)
      if (H.GotKw > 0 && this.OnBoard(Who, T.Col, U)) await this.GiveKw(MkTgt(Who, T.Col), H.GotKw);
      await this.SelfHarm(Who, D);
      if (this.Ended) return;
      if (D.Cry.K !== fx_kind.None && this.OnBoard(Who, T.Col, U)) {
        // the tutorial explains the battlecry before it goes off
        const Pages = (this.Tut && Who === 0) ? TutCryPages(D.Id) : [];
        const V = this.ViewOf(0);
        if (this.Tut && Who === 0 && Pages.length > 0 && V) {
          this.Refresh();
          await V.TutPages(Pages);
        }
        await this.FxShow(Who, T.Col, D, FxShowCry);
        // (the picked target flashes too)
        if (FxTarget(this.AimedFx(D.Cry, D.Cry2).K) > 0 && T2.Col >= -1) {
          this.Flash(T2);
          await this.Wait(0.25);
        }
        await this.Pair(Who, T.Col, D.Cry, D.Cry2, T2);
      }
    }
  }

  // one action of a monster (2回行動: the first one keeps it ready)
  UseAction(U) {
    if (U.HasTwoActs() && !U.ExtraUsed) {
      U.ExtraUsed = true;
      return;
    }
    U.CanAct = false;
    U.Acted = true;
  }

  // 吸血: damage dealt by a monster heals its player
  async DrainHeal(Who, U, Dealt) {
    if (U.Drain && Dealt > 0) await this.Heal(this.Hero(Who), Dealt);
  }

  async DoAttack(Who, Col, T) {
    const O = this.S(1 - Who);
    const U = At(this.S(Who).Board, Col);
    if (!U) return;
    this.UseAction(U);
    U.Stealth = false;
    const Me1 = MkTgt(Who, Col);
    // 人喰いざめ: the attacked monster is destroyed before the fight (no damage either way)
    if (U.Live(U.Def.OnAttack).K === fx_kind.KillAttackTarget) {
      const Tg0 = T.Col >= 0 ? this.MonAt(1 - Who, T.Col) : undefined;
      if (Tg0) {
        await this.FxShow(Who, Col, U.Def, FxShowAttack);
        this.Snd(SfxAttack);
        await this.Lunge(Me1, T);
        await this.Kill(T);
        await this.ResolveDeaths();
        this.CheckOver();
        if (this.Ended) return;
        // it survived (無敵): the attack goes on as usual
        const Still = this.MonAt(1 - Who, T.Col);
        const Same = !!Still && Still === Tg0;
        if (!Same) return;
      }
    } else if (U.Live(U.Def.OnAttack).K !== fx_kind.None) {
      await this.FxShow(Who, Col, U.Def, FxShowAttack);
      await this.DoFx(Who, Col, U.Def.OnAttack, this.Hero(Who));
      this.CheckOver();
      if (this.Ended) return;
    }
    this.Snd(SfxAttack);
    await this.Lunge(Me1, T);
    this.Vfx(VfxSlash, T);
    const A1 = this.EffAtk(Who, Col, U);
    if (T.Col < 0) {
      this.LogBoth(1 - Who, TlAttackHero(U.Def.Name, TxYou), TlAttackHero(U.Def.Name, TxOpponent));
      const R = this.Hurt(T, A1);
      this.Refresh();
      this.Snd(A1 >= 4 ? SfxHitBig : SfxHit);
      this.Pop(T, R[1], false);
      await this.Wait(0.45);
      await this.DrainHeal(Who, U, R[0]);
    } else {
      const Tg = At(O.Board, T.Col);
      if (!Tg) return;
      this.Log(TlAttackUnit(U.Def.Name, Tg.Def.Name));
      // サボテン: its thorns hurt the attacker too
      const A2 = this.EffAtk(1 - Who, T.Col, Tg) + Tg.ThornsNow();
      const R1 = this.Hurt(T, A1);
      const R2 = this.Hurt(Me1, A2);
      this.Snd((A1 >= 4 || A2 >= 4) ? SfxHitBig : SfxHit);
      // 必殺: a monster hurt by a 必殺 monster is destroyed
      if (U.Deadly && R1[0] > 0) Tg.Hp = Min(Tg.Hp, 0);
      if (Tg.Deadly && R2[0] > 0) U.Hp = Min(U.Hp, 0);
      this.Refresh();
      if (A1 > 0) this.Pop(T, R1[1], false);
      if (A2 > 0) this.Pop(Me1, R2[1], false);
      await this.Wait(0.5);
      await this.DrainHeal(Who, U, R1[0]);
      await this.DrainHeal(1 - Who, Tg, R2[0]);
      if (Tg.Hp <= 0 && U.Hp > 0 && U.Live(U.Def.OnKill).K !== fx_kind.None && !this.Ended) {
        // (the beaten monster leaves first, so the board shows what really happened)
        await this.ResolveDeaths();
        this.CheckOver();
        if (!this.Ended && this.OnBoard(Who, Col, U)) {
          await this.FxShow(Who, Col, U.Def, FxShowKill);
          await this.DoFx(Who, Col, U.Def.OnKill, this.Hero(Who));
        }
      }
    }
  }

  async DoHeroAttack(Who, T) {
    const A = this.S(Who);
    const O = this.S(1 - Who);
    const Atk = A.HeroAtk;
    A.HeroDone = true;
    A.HeroAtk = 0;
    this.Snd(SfxAttack);
    await this.Lunge(this.Hero(Who), T);
    this.Vfx(VfxSlash, T);
    if (T.Col < 0) {
      this.LogBoth(Who, TlHeroHits(TxYou), TlHeroHits(TxOpponent));
      await this.Damage(T, Atk);
    } else {
      const Tg = At(O.Board, T.Col);
      if (!Tg) return;
      this.Log(TlAttackUnit(A.HName(), Tg.Def.Name));
      const A2 = this.EffAtk(1 - Who, T.Col, Tg) + Tg.ThornsNow();
      const R1 = this.Hurt(T, Atk);
      const R2 = this.Hurt(this.Hero(Who), A2);
      this.Snd(SfxHit);
      this.Refresh();
      this.Pop(T, R1[1], false);
      if (A2 > 0) this.Pop(this.Hero(Who), R2[1], false);
      await this.Wait(0.5);
      await this.DrainHeal(1 - Who, Tg, R2[0]);
    }
  }

  async DoMove(Who, Col, To) {
    const Sd = this.S(Who);
    const U = At(Sd.Board, Col);
    if (U) {
      this.UseAction(U);
      U.Stealth = false;
      if (To >= 0 && To < Sd.Board.length) Sd.Board = RuWith(RuWith(Sd.Board, To, U), Col, null);
      this.Log(TlMoved(U.Def.Name));
      this.Refresh();
      await this.Wait(0.25);
    }
  }

  async DoJewel(Who, T) {
    const A = this.S(Who);
    const H = A.Hero;
    A.Pay(this.JewelCost(Who));
    A.JewelUsed = true;
    A.Jewels += 1;
    this.Snd(SfxForce);
    this.Refresh();
    this.Toast(H.JewelName, 1.0);
    this.JewelFx(Who);
    this.LogBoth(Who, TlJewel(TxYou, H.JewelName), TlJewel(TxOpponent, H.JewelName));
    await this.Wait(0.4);
    await this.DoFx(Who, -1, H.Jewel, T);
  }

  async DoEvolve(Who, Col, T2) {
    const A = this.S(Who);
    const U = At(A.Board, Col);
    if (U) {
      const Me1 = MkTgt(Who, Col);
      A.EvoLeft -= 1;
      A.EvoUsed = true;
      await this.EvolveShow(Who, Col, U);
      U.Evolved = true;
      U.Atk += U.Def.EvoAtk;
      U.Hp += U.Def.EvoHp;
      U.MaxHp += U.Def.EvoHp;
      // an evolved monster may fight monsters at once
      if (U.Sleeping) {
        U.Rush = true;
        if (!U.Acted && !U.Frozen) U.CanAct = true;
      }
      this.LogBoth(Who, TlEvolve(TxYou, U.Def.Name), TlEvolve(TxOpponent, U.Def.Name));
      this.Snd(SfxEvolve);
      this.Vfx(VfxEvolve, Me1);
      this.Refresh();
      this.Toast(TlEvolved(U.Def.Name), 1.2);
      this.Pop(Me1, BuffText(U.Def.EvoAtk, U.Def.EvoHp), true);
      await this.Wait(0.8);
      if (U.Live(U.Def.Evo).K !== fx_kind.None && !this.Ended) {
        await this.FxShow(Who, Col, U.Def, FxShowEvo);
        await this.Pair(Who, Col, U.Def.Evo, U.Def.Evo2, T2);
      }
    }
  }

  // the evolving monster turns round on every screen before it gets its new stats
  async EvolveShow(Who, Col, U) {
    const T0 = MkTgt(Who, Col);
    for (const [W, V] of this.Vs()) spawn(() => V.FxEvolve(UiOf(Loc(W, T0)), U.Def, U.Prem));
    await this.Wait(1.05);
  }

  // ------------------------------------------------------------ turns
  async TurnFx(Who, Start) {
    for (let C = 0; C <= 2; C++) {
      const U = At(this.S(Who).Board, C);
      if (!U || this.Ended) continue;
      const F = U.Live(Start ? U.Def.TurnStart : U.Def.TurnEnd);
      // (a conditional effect that would do nothing is not announced: 鬼娘 only when it is hurt)
      if (F.K !== fx_kind.None && this.OnBoard(Who, C, U) && this.FxWouldRun(Who, C, F)) {
        await this.FxShow(Who, C, U.Def, Start ? FxShowStart : FxShowEnd);
        await this.DoFx(Who, C, F, this.Hero(Who));
        await this.ResolveDeaths();
        this.CheckOver();
      }
      // カウントダウン
      if (Start && U.Count > 0 && !this.Ended && this.OnBoard(Who, C, U)) await this.AdvanceCount(Who, C, U, 1);
    }
  }

  async StartTurn(Who) {
    const A = this.S(Who);
    this.Current = Who;
    this.ForceTgt = null;
    A.Turns += 1;
    A.MaxMana = Min(CardMaxMana, A.MaxMana + 1);
    A.Mana = A.MaxMana + A.NextMana;
    const V0 = this.ViewOf(Who);
    if (A.NextMana > 0 && V0) V0.Toast(TlManaBonus(A.NextMana), 1.5);
    A.NextMana = 0;
    A.JewelUsed = false;
    A.HeroDone = false;
    A.EvoUsed = false;
    for (const U of A.Units()) {
      U.Sleeping = false;
      U.Acted = false;
      U.ExtraUsed = false;
      if (U.Frozen) {
        // it skips this turn; the ice stays on it until the turn is over
        U.CanAct = false;
        U.Thaw = true;
      } else {
        U.CanAct = true;
      }
    }
    this.Refresh();
    for (let C = 0; C <= 2; C++) { const U = this.MonAt(Who, C); if (U && U.Frozen) this.Vfx(VfxIce, MkTgt(Who, C)); }
    for (const [W, V] of this.Vs()) V.Banner(W === Who ? TxYourTurn : TxTheirTurn);
    this.SndTo(Who, SfxMyTurn);
    await this.Wait(1.0);
    // メデューサ: this turn no spells can be played
    if (A.SpellLock) {
      for (const [W, V] of this.Vs()) V.Banner(W === Who ? TlSpellLockedMe : TlSpellLockedFoe);
      this.Vfx(VfxCurse, this.Hero(Who));
      this.Snd(SfxDebuff);
      await this.Wait(1.2);
    }
    // the turn evolving becomes possible is announced with a banner of its own
    const V = this.ViewOf(Who);
    if (A.Turns === this.EvoTurn(Who) && A.EvoLeft > 0 && !this.Tut && V) {
      V.Banner(TlEvoReady);
      this.SndTo(Who, SfxEvolve);
      this.Refresh();
      await this.Wait(1.2);
    }
    // the first player does not draw on their very first turn
    const FirstTurn = Who === this.First && A.Turns === 1;
    const Draws = this.Tut ? TutDraws(Who, A.Turns) : FirstTurn ? 0 : 1;
    for (let I = 1; I <= Draws; I++) await this.Draw(Who);
    this.CheckOver();
    if (!this.Ended) await this.TurnFx(Who, true);
    this.Refresh();
  }

  async EndTurn(Who) {
    const A = this.S(Who);
    this.Sel = -1;
    this.Pend = null;
    this.Refresh();
    await this.TurnFx(Who, false);
    // 冥府女帝: the leader summons (while there is room)
    for (const Id of A.EndSummons) {
      if (this.Ended) continue;
      const Free = this.EmptySlots(Who);
      const C0 = At(Free, this.Rng.Int(0, Free.length - 1));
      if (C0 !== undefined) {
        this.Vfx(VfxDark, this.Hero(Who));
        this.Pop(this.Hero(Who), TlHeroEndSummonPop, true);
        await this.Wait(0.4);
        await this.Summon(Who, C0, this.CardOf(Id));
        await this.ResolveDeaths();
        this.CheckOver();
      }
    }
    for (const U of A.Units()) {
      U.CanAct = false;
      U.Sleeping = false;
      // the frozen turn is over: the ice melts
      if (U.Thaw) {
        U.Frozen = false;
        U.Thaw = false;
      }
      if (U.TempAtk > 0) {
        U.Atk = Max(0, U.Atk - U.TempAtk);
        U.TempAtk = 0;
      }
    }
    // the attack given by a jewel only lasts for the turn
    A.HeroAtk = 0;
    // メデューサ's seal lasts for one own turn
    A.SpellLock = false;
    if (Who === this.First && A.Turns === 1) this.FirstTurnDone = true;
    this.Refresh();
  }

  // one whole turn of side Who; the other human can still surrender meanwhile
  // (the time left at the end is measured by the acting side's browser and shared: Decide)
  async TakeTurn(Who) {
    if (this.TurnSeconds > 0.0) {
      // 持ち時間: the first turn has TurnSeconds, later turns the time left over + TurnRegain
      // (+ CardTurnActive unless the last turn timed out), TurnMin .. TurnSeconds
      const Sd = this.S(Who);
      const Give = Sd.Turns <= 1 ? this.TurnSeconds
        : Min(this.TurnSeconds, Max(this.TurnMin, (At(this.Bank, Who) ?? 0.0) + this.TurnRegain + (Sd.TimedOut ? 0.0 : CardTurnActive)));
      Sd.TimedOut = false;
      this.Deadline = GetSimulationElapsedTime() + Give;
    }
    if (this.Tut && Who === 0) this.Tut.Begin(this.S(Who).Turns);
    const Tok = { Stop: false };
    await Race(
      (async () => {
        const V = this.ViewOf(Who);
        if (V) await this.PlayerTurn(Who, V);
        else if (this.IsRemote(Who)) await this.RemoteTurn(Who);
        else if (this.Tut) await this.TutNpc(this.Tut);
        else await this.NpcTurn(Who);
      })(),
      (async () => {
        // (in the tutorial the CPU's turn shows its own pages: nothing else waits for input then)
        const V = this.ViewOf(1 - Who);
        if (!this.Tut && V) await this.IdleLoop(1 - Who, V, Tok); else await this.Forever();
      })(),
      (async () => {
        // (online: the waiting player sees the acting player's clock too)
        if (this.TurnSeconds > 0.0 && (this.ViewOf(Who) || this.IsRemote(Who))) await this.Clock(Tok); else await this.Forever();
      })(),
      this.EndP);
    Tok.Stop = true;
    if (this.TurnSeconds > 0.0) {
      const B = await this.Decide(Who, () => Max(0.0, this.Deadline - GetSimulationElapsedTime()), 0.0);
      this.Bank = RuWith(this.Bank, Who, typeof B === 'number' ? B : 0.0);
    }
    for (const [, V] of this.Vs()) {
      V.SetTimer(TxEmpty, false);
      // the surrender dialog / grave list of a cancelled wait
      V.Layer(V.ConfirmSlot, false);
      V.Layer(V.GraveSlot, false);
    }
    // (an input wait of a block that lost the race — IdleLoop's surrender dialog / grave list — dies like in Verse)
    for (const [, V] of this.Vs()) if (V.CancelWait) await V.CancelWait();
  }

  // (never ends)
  async Forever() { await new Promise(() => { }); }

  // the remaining turn time on every screen
  async Clock(Tok) {
    let Shown = -1;
    for (;;) {
      if (Tok && Tok.Stop) break;
      const C = Ceil(this.Deadline - GetSimulationElapsedTime());
      const Left = Max(0, Number.isFinite(C) ? C : 0);
      // only a new number is sent to the screens
      if (Left !== Shown) {
        Shown = Left;
        for (const [, V] of this.Vs()) V.SetTimer(TlTimeLeft(Left), Left <= 10);
        // the last seconds tick for the player whose turn it is
        if (Left <= 10 && Left > 0) this.SndTo(this.Current, SfxTimer);
      }
      await this.Wait(0.25);
    }
  }

  // the player who waits: only the surrender button and looking at the graves do something
  // (Tok.Stop: the turn is over — this wait lost the race)
  async IdleLoop(W, V, Tok) {
    const Stale = () => !!(Tok && Tok.Stop);
    V.Say(this.Pvp ? TnWaitPvp : TnWaitCpu(this.S(1 - W).HName()));
    for (;;) {
      if (Stale()) return;
      V.SetNav([55, 30, 45, 46], this.NavAll(W), false);
      const Id = await V.WaitInput();
      if (Stale()) return;
      if (Id === 30) await this.StampPick(W, V);
      if (Stale()) return;
      if (Id === 55 && !this.Ended) {
        const Yes = await V.ConfirmSurrender();
        if (Stale()) return;
        if (Yes) {
          this.ConcedeLocal(W);
          return;
        }
      } else if (Id === 45 || Id === 46) {
        await V.ShowGrave(this, Id === 45 ? W : 1 - W);
      }
    }
  }

  async WaitTurnInput(V) {
    if (this.TurnSeconds <= 0.0) return await V.WaitInput();
    let Stop = false;
    const R = await Race(
      V.WaitInput(),
      (async () => {
        for (;;) {
          if (Stop || GetSimulationElapsedTime() >= this.Deadline) break;
          await this.Wait(0.25);
        }
        return NavTimeout;
      })());
    Stop = true;
    return R;
  }

  CancelSel(V) {
    this.Sel = -1;
    this.Pend = null;
    V.Snd(SfxCancel);
    V.Say(TnCancel);
  }

  // the turn of a player on this screen (every action / end of turn / time out / surrender is a Decide)
  async PlayerTurn(Who, V) {
    this.Sel = -1;
    this.Pend = null;
    V.Say(TnYourTurn);
    this.Refresh();
    V.NavReset();
    let LastSel = -99;
    let WasPend = false;
    for (;;) {
      if (this.Ended) break;
      // the cursor jumps to the first useful item whenever the selection changes
      // the tutorial explains the next step (when it is a new one) and only lets the player do that
      const T = this.Tut;
      if (T && T.Shown !== T.Step) {
        T.Shown = T.Step;
        const St = T.Cur();
        if (St) {
          this.Sel = -1;
          this.Pend = null;
          this.RefreshNow();
          await V.TutPages(St.Pages);
          V.TutSay(St.Say);
          V.Say(St.Say);
          LastSel = -99;
        }
      }
      const IsPend = this.Pend != null;
      const Jump = this.Sel !== LastSel || IsPend !== WasPend;
      const Smart = this.Tut ? [...this.TutAllow(Who, this.Sel), ...(this.Sel >= 0 ? [this.Sel] : [])] : this.NavSmart(Who);
      V.SetNav(Smart, this.NavAll(Who), Jump);
      LastSel = this.Sel;
      WasPend = IsPend;
      const Id = await this.WaitTurnInput(V);
      if (this.Ended) break;
      if (!this.TutClickOk(Who, Id)) {
        V.Snd(SfxCancel);
        V.Toast(TuWrong, 1.5);
      } else if (Id === NavTimeout) {
        this.Sel = -1;
        this.Pend = null;
        await this.Decide(Who, () => [RuDecTimeout]);
        // only the first time out gives a longer next turn
        const N = this.TimeUp(Who);
        V.Say(N === 1 ? TnTimeUpBonus : TnTimeUp);
        break;
      } else if (Id === 50) {
        await this.Decide(Who, () => [RuDecEnd]);
        break;
      } else if (Id === 55) {
        this.Sel = -1;
        this.Pend = null;
        this.Refresh();
        const Yes = await V.ConfirmSurrender();
        if (Yes && !this.Ended) {
          await this.Decide(Who, () => [RuDecSurrender]);
          this.Surrender(Who);
          break;
        }
      } else if (Id === 45 || Id === 46) {
        await V.ShowGrave(this, Id === 45 ? Who : 1 - Who);
      } else if (Id === 30 && this.Sel < 0 && !this.Pend && !this.SourceReady(Who, 30)) {
        // nothing selected and the player can't attack: the stamp menu
        await this.StampPick(Who, V);
      } else if (Id === NavCancel) {
        if (this.Sel >= 0 || this.Pend) this.CancelSel(V);
      } else {
        await this.OnClick(Who, V, Id);
      }
      this.Refresh();
    }
  }

  async OnClick(Who, V, Id) {
    // the second target of a battlecry / evolve effect
    const P = this.Pend;
    if (P) {
      const T = TgtOfUi(Id);
      if (T && RuTgtIn(this.PendTargets(Who, P), Loc(Who, T))) {
        await this.DecideExec(Who, new act({ Kind: P.Kind, Src: P.Src, Dst: P.Dst, Dst2: Loc(Who, T), Score: 0.0 }));
        this.SayAfter(Who, V);
      } else {
        this.CancelSel(V);
      }
      return;
    }
    if (this.Sel >= 0) {
      if (Id === this.Sel) {
        // choosing a no-target spell or jewel skill again uses it
        if (this.SelfCast(Who, Id)) {
          const Kind = Id === 40 ? 4 : 1;
          await this.DecideExec(Who, new act({ Kind, Src: Id, Dst: this.Hero(Who), Score: 0.0 }));
          this.SayAfter(Who, V);
          return;
        }
        this.CancelSel(V);
        return;
      }
      const A = this.ActionFor(Who, this.Sel, Id);
      if (A) {
        // a monster with a targeted battlecry / evolve effect: pick that target next
        if ((A.Kind === 1 || A.Kind === 7) && this.PendTargets(Who, A).length > 0) {
          this.Pend = A;
          V.Snd(SfxSelect);
          V.Say(A.Kind === 7 ? TnEvoTarget : TnCryTarget);
          return;
        }
        await this.DecideExec(Who, A);
        this.SayAfter(Who, V);
        return;
      }
    }
    const Before = this.Sel;
    this.TrySelect(Who, V, Id);
    if (this.Sel >= 0) V.Snd(SfxSelect); else if (Before >= 0) V.Snd(SfxCancel);
  }

  TrySelect(Who, V, Id) {
    const Mine = this.S(Who);
    this.Sel = -1;
    if (Id >= 0 && Id <= 8) {
      const H = At(Mine.Hand, Id);
      if (H) {
        const D = H.Def;
        if (!Mine.CanPay(H.Cost)) {
          V.Say(TnNoMana(D.Name, H.Cost));
        } else if (D.IsSpell && !D.NeedsTarget()) {
          this.Sel = Id;
          V.Say(TnUseAgain(D.Name));
        } else if (this.SourceReady(Who, Id)) {
          this.Sel = Id;
          V.Say(D.IsSpell ? TnSpellTarget(D.Name) : TnSummonSlot(D.Name));
        } else {
          V.Say(D.IsSpell ? TnNoTarget : TnNoSlot);
        }
      }
    } else if (Id >= 10 && Id <= 12) {
      const Am = this.AmuletAt(Who, Id - 10);
      const U = At(Mine.Board, Id - 10);
      if (Am) {
        V.Say(TnAmulet(Am.Def.Name));
      } else if (U) {
        if (this.SourceReady(Who, Id)) {
          this.Sel = Id;
          V.Say(this.EvoOk(Who, Id - 10) ? TnUnitEvo(U.Def.Name) : U.Sleeping ? TnUnitRush(U.Def.Name) : TnUnitAct(U.Def.Name));
        } else if (U.Sleeping) {
          V.Say(TnJustSummoned);
        } else {
          V.Say(TnUnitDone(U.Def.Name));
        }
      }
    } else if (Id === 30) {
      if (this.SourceReady(Who, 30)) {
        this.Sel = 30;
        V.Say(TnHeroAttack);
      } else {
        V.Say(TnHeroNoAtk);
      }
    } else if (Id === 40) {
      const H = Mine.Hero;
      if (this.SourceReady(Who, 40)) {
        this.Sel = 40;
        const R = FxTarget(H.Jewel.K);
        V.Say(R === 4 ? TnJewelSlot(H.JewelName) : R === 1 ? TnJewelFoe(H.JewelName) : R > 0 ? TnJewelAlly(H.JewelName) : TnJewelSelf(H.JewelName));
      } else if (Mine.JewelUsed) {
        V.Say(TnJewelUsed);
      } else if (!Mine.CanPay(H.Cost)) {
        V.Say(TnJewelMana(H.Cost));
      } else {
        V.Say(TnJewelNone);
      }
    } else if (Id === UiEvolve) {
      V.Say(TnEvoHow);
    } else if (Id >= 20 && Id <= 22) {
      V.Say(TnFoeUnit);
    }
  }

  SayAfter(Who, V) {
    if (this.Ended) return;
    V.Say(this.ReadyIds(Who).length === 0 ? TnNothingLeft : TnGoodJob);
  }

  // ------------------------------------------------------------ AI
  UnitValue(U) {
    // (a monster without attack and without 挑発 only matters for its effects; one that destroys itself soon is worth little)
    let V = (U.Atk <= 0 && !U.Taunt) ? U.Hp * 0.25 : U.Atk * 1.0 + U.Hp * 0.8;
    if (this.AiLife(U) <= 2) V *= 0.5;
    if (U.Taunt) V += 1.0;
    if (U.Deadly) V += 1.5;
    if (U.Drain) V += 0.8;
    if (U.Barrier) V += 1.0;
    if (U.Invincible) V += 3.0;
    if (U.Hidden()) V += 1.0;
    if (U.Live(U.Def.TurnStart).K !== fx_kind.None || U.Live(U.Def.TurnEnd).K !== fx_kind.None) V += 1.5;
    return V;
  }

  // how many more turns of its owner a monster stays on the board by itself (99: it doesn't destroy itself)
  // (プレゼント箱: 2 damage to itself at every turn start)
  AiLife(U) {
    const TS = U.Live(U.Def.TurnStart), TE = U.Live(U.Def.TurnEnd);
    if (TS.K === fx_kind.KillSelf || TS.K === fx_kind.VanishSelf || TE.K === fx_kind.KillSelf || TE.K === fx_kind.VanishSelf) return 1;
    if (TS.K === fx_kind.HitSelf && TS.N > 0 && !U.Invincible) return Ceil(Max(1, U.Hp) / TS.N) + (U.Barrier ? 1 : 0);
    if (TE.K === fx_kind.HitSelf && TE.N > 0 && !U.Invincible) return Ceil(Max(1, U.Hp) / TE.N) + (U.Barrier ? 1 : 0);
    return 99;
  }

  // attacking it is a waste: it can't hurt anybody, doesn't block and goes away by itself (its death effect only
  // comes sooner)
  AiDoomed(T) {
    return T.Atk <= 0 && !T.Taunt && this.AiLife(T) <= 3;
  }

  // what 効果消滅 would take away from a monster
  SilenceValue(U) {
    if (U.Silenced) return 0.0;
    let V = 0.0;
    if (U.Taunt) V += 1.5;
    if (U.Deadly) V += 2.0;
    if (U.Drain) V += 0.8;
    if (U.Barrier) V += 1.5;
    if (U.Invincible) V += 4.0;
    if (U.Hidden()) V += 2.0;
    for (const F of [U.Def.TurnStart, U.Def.TurnEnd, U.Def.OnAttack, U.Def.OnKill, U.Def.OnHeal, U.Def.Death, U.Def.AllySum]) if (F.K !== fx_kind.None) V += 1.5;
    if (U.Def.Armor > 0 || U.Def.FrontAtkDown > 0 || U.Def.TwoActs || U.Def.Thorns > 0 || U.Def.DmgCap > 0) V += 1.5;
    if (!U.Evolved && U.Def.Evo.K !== fx_kind.None) V += 0.5;
    return V;
  }

  // where to put a new monster (from the hand or a jewel)
  LaneScore(Who, D, Col) {
    let Sc = 0.0;
    if (D.Amulet) return this.MonAt(1 - Who, Col) ? -0.5 : 0.3;
    const FrontU = this.MonAt(1 - Who, Col) ?? null;
    const K = D.Cry.K;
    if (K === fx_kind.HitFront || K === fx_kind.FreezeFront || K === fx_kind.KillFront || K === fx_kind.BounceFront || K === fx_kind.DebuffFront || K === fx_kind.HitFrontSplash) {
      if (FrontU) Sc += this.UnitValue(FrontU) * 1.5;
      else Sc -= 3.0;
    } else if (K === fx_kind.SilenceFront) {
      // 効果消滅 is worth what the monster in front would lose
      if (FrontU) Sc += this.SilenceValue(FrontU) * 1.5 - 1.0;
      else Sc -= 2.0;
    } else if (D.Taunt) {
      if (FrontU) Sc += FrontU.Atk * 0.5;
    } else if (D.Blocked) {
      if (FrontU) Sc -= 2.0; else Sc += 1.0;
    } else {
      // don't walk into a monster that would kill it for free
      if (FrontU && FrontU.Atk >= D.Hp && D.Atk < FrontU.Hp) Sc -= 1.5;
    }
    return Sc;
  }

  // how good effect F of side Who aimed at T is (effects of monsters, spells, jewels and evolutions)
  FxScore(Who, F, T, R) {
    const Mine = this.S(Who);
    const Op = this.S(1 - Who);
    const N = F.N;
    const K = F.K;
    if (K === fx_kind.None) return 0.0;
    if (!this.CondOk(Who, F)) return -0.5;
    // (no removal / damage wasted on an enemy monster that breaks by itself)
    if (FxTarget(K) > 0 && T.Side !== Who && T.Col >= 0 && K !== fx_kind.DestroyAmulet) {
      const Tu = this.MonAt(T.Side, T.Col);
      if (Tu && this.AiDoomed(Tu)) return -2.0;
    }
    if (K === fx_kind.HitTarget || K === fx_kind.FreezeHit) {
      const U = At(Op.Board, T.Col);
      if (U) {
        if (U.Invincible || U.Barrier) return 0.3 + R;
        let Sc = N >= U.Hp ? 5.0 + this.UnitValue(U) * 2.2 : N * 0.5 - 1.0;
        if (K === fx_kind.FreezeHit && N < U.Hp) Sc += U.Atk * 1.3;
        return Sc + R;
      }
      return -10.0;
    }
    if (K === fx_kind.DestroyTarget) {
      const U = At(Op.Board, T.Col);
      if (U) {
        if (U.Invincible) return -5.0;
        return 4.0 + this.UnitValue(U) * 2.0 + R;
      }
      return -10.0;
    }
    if (K === fx_kind.DebuffTarget) {
      const U = At(Op.Board, T.Col);
      if (U) {
        if (F.M >= U.Hp && !U.Invincible) return 5.0 + this.UnitValue(U) * 2.2 + R;
        return Min(N, U.Atk) * 1.1 + F.M * 0.6 - 0.5 + R;
      }
      return -10.0;
    }
    if (K === fx_kind.HealTarget) {
      const U = At(Mine.Board, T.Col);
      if (U) {
        const Missing = U.MaxHp - U.Hp;
        if (Missing <= 0) return -5.0;
        return Min(Missing, N) * 1.3 + this.UnitValue(U) * 0.2 + R;
      }
      return -10.0;
    }
    if (K === fx_kind.BuffTarget) {
      const U = At(Mine.Board, T.Col);
      if (U) {
        if (U.Hp + F.M <= 0) return -10.0;
        return 3.0 + N * (U.CanAct ? 1.6 : 1.0) + F.M * 0.8 + R;
      }
      return -10.0;
    }
    if (K === fx_kind.GiveKw) {
      const U = At(Mine.Board, T.Col);
      if (U) {
        if (N === KwTaunt) return (!U.Taunt && Op.Units().length > 0) ? 2.5 + U.Hp * 0.4 + R : -3.0;
        if (N === KwHaste) return (U.Sleeping && U.Atk > 0) ? 3.0 + U.Atk * 1.2 + R : -3.0;
        if (N === KwRush) return (U.Sleeping && !U.Rush && U.Atk > 0 && Op.Units().length > 0) ? 2.0 + U.Atk * 0.9 + R : -3.0;
        if (N === KwDeadly) return (!U.Deadly && Op.Units().length > 0) ? 3.0 + U.Atk * 0.3 + R : -3.0;
        if (N === KwBarrier) return !U.Barrier ? 2.0 + this.UnitValue(U) * 0.3 + R : -3.0;
        if (N === KwStealth || N === KwIntimidate) return !U.Hidden() ? 1.5 + this.UnitValue(U) * 0.3 + R : -3.0;
        return !U.Drain ? 1.5 + U.Atk * 0.4 + R : -3.0;
      }
      return -10.0;
    }
    if (K === fx_kind.Bounce) {
      const U = T.Side !== Who ? At(Op.Board, T.Col) : undefined;
      if (U) return this.UnitValue(U) * 1.2 + U.Def.Cost * 0.5 - 2.0 + R;
      return -10.0;
    }
    if (K === fx_kind.SummonAt) {
      const D = this.CardOf(F.C >= 0 ? F.C : 35);
      return 6.0 + D.Cost * 1.6 + R + this.LaneScore(Who, D, T.Col);
    }
    if (K === fx_kind.HitFoeHero) {
      if (N >= Op.Hp + Op.Shield) return 1000.0;
      return N * 1.2 + R;
    }
    if (K === fx_kind.HealHero) {
      const Missing = Mine.MaxHp - Mine.Hp;
      if (Missing < 2) return -3.0;
      return Min(Missing, N) * 1.3 + (Mine.Hp <= 6 ? 5.0 : 0.0) + R;
    }
    if (K === fx_kind.ShieldUp || K === fx_kind.HeroMaxUp) {
      return N * 1.0 + (Mine.Hp <= 8 ? 3.0 : 0.0) + R;
    }
    if (K === fx_kind.Draw) {
      // (an empty deck only hurts)
      if (Mine.Deck.length === 0) return -3.0;
      return Mine.Hand.length + N <= 7 ? 3.5 * N + R : -3.0;
    }
    if (K === fx_kind.HeroAtk) {
      if (this.HasTaunt(1 - Who)) {
        const Kills = Op.Units().filter(U => U.Taunt && Mine.HeroAtk + N >= U.Hp && Mine.Hp > U.Atk + 4);
        return Kills.length > 0 ? 3.0 + R : -1.0;
      }
      if (Mine.HeroAtk + N >= Op.Hp + Op.Shield) return 1000.0;
      return 3.5 + R;
    }
    if (K === fx_kind.ManaUp) {
      return Mine.MaxMana < CardMaxMana ? 4.5 + R : -5.0;
    }
    if (K === fx_kind.GainMana) {
      // (only when the mana pays for a card that could not be played without it; the mana never goes over the max)
      const Got = Min(Mine.MaxMana, Mine.Mana + N) - Mine.Mana;
      const Opens = Mine.Hand.filter(H => H.Def.Spell.K !== fx_kind.GainMana && H.Cost > Mine.Mana && H.Cost <= Mine.Mana + Got);
      return (Got > 0 && Opens.length > 0) ? 1.5 * N + R : -4.0;
    }
    if (K === fx_kind.EvoUp) {
      return 3.0 + R;
    }
    if (K === fx_kind.HitRandomFoe) {
      return Op.Units().length > 0 ? 1.2 * N * Max(1, F.M) + R : -2.0;
    }
    if (K === fx_kind.HitAllFoes || K === fx_kind.DebuffAllFoes || K === fx_kind.HitAllEnemies) {
      const Dm = K === fx_kind.DebuffAllFoes ? F.M : N;
      let V = K === fx_kind.HitAllEnemies ? N * 1.2 - 3.0 : -3.0;
      for (const U of Op.Units()) {
        if (Dm >= U.Hp && !U.Invincible) V += this.UnitValue(U) * 1.8; else V += Dm * 0.6 + (K === fx_kind.DebuffAllFoes ? N * 0.5 : 0.0);
      }
      return V + R;
    }
    if (K === fx_kind.HitAllOthers) {
      let V = -3.0;
      for (const U of Op.Units()) {
        if (N >= U.Hp && !U.Invincible) V += this.UnitValue(U) * 1.8; else V += N * 0.6;
      }
      for (const U of Mine.Units()) {
        if (N >= U.Hp && !U.Invincible) V -= this.UnitValue(U) * 1.8; else V -= N * 0.4;
      }
      return V + R;
    }
    if (K === fx_kind.FreezeAll || K === fx_kind.FreezeRandom) {
      let V = -1.0;
      for (const U of Op.Units()) V += U.Atk * (K === fx_kind.FreezeAll ? 0.9 : 0.4);
      return V + R;
    }
    if (K === fx_kind.HandDiscount) {
      // (the cards it makes cheaper: M = 1 only monsters; never the discount card itself)
      const Hit = Mine.Hand.filter(H => (F.M === 0 || H.Def.IsMonster()) && H.Def.Spell.K !== fx_kind.HandDiscount && H.Cost > 0);
      return Hit.length > 0 ? Hit.length * 1.1 * Max(1, N) - 1.5 + R : -4.0;
    }
    if (K === fx_kind.DrawDiscard) {
      return Mine.Hand.length <= 3 ? 1.5 + R : -2.0;
    }
    if (K === fx_kind.GraveToHand) {
      return Mine.Grave.length > 0 ? 3.0 * N + R : -5.0;
    }
    if (K === fx_kind.GraveRevive || K === fx_kind.GraveFill || K === fx_kind.GravePickSummon) {
      const Cands = Mine.Grave.filter(D => D.IsMonster() && !D.Token && D.Cost <= N);
      return (Cands.length > 0 && this.EmptySlots(Who).length > 0) ? 7.0 + Min(Cands.length, this.EmptySlots(Who).length) * 1.5 + R : -5.0;
    }
    if (K === fx_kind.EvolveAllies) {
      const Ev = Mine.Units().filter(U => !U.Evolved);
      return Ev.length > 0 ? 2.0 * Ev.length + R : -3.0;
    }
    if (K === fx_kind.Tutor) {
      return (Mine.Deck.length > 0 && Mine.Hand.length <= 7) ? 3.5 + R : -3.0;
    }
    if (K === fx_kind.AddCard) {
      return Mine.Hand.length + N <= 8 ? 2.5 * N + R : -2.0;
    }
    if (K === fx_kind.HitAny) {
      if (T.Col < 0) {
        if (T.Side === Who) return -10.0;
        if (N >= Op.Hp + Op.Shield) return 1000.0;
        return N * 1.2 + R;
      }
      if (T.Side === Who) return -10.0;
      const U = At(Op.Board, T.Col);
      if (U) {
        if (U.Invincible || U.Barrier) return 0.3 + R;
        return (N >= U.Hp ? 5.0 + this.UnitValue(U) * 2.2 : N * 0.5 - 1.0) + R;
      }
      return -10.0;
    }
    if (K === fx_kind.HitEnemy) {
      if (T.Side === Who) return -10.0;
      if (T.Col < 0) return N >= Op.Hp + Op.Shield ? 1000.0 : N * 1.2 + R;
      const U = At(Op.Board, T.Col);
      if (U) {
        if (U.Invincible || U.Barrier) return 0.3 + R;
        return (N >= U.Hp ? 5.0 + this.UnitValue(U) * 2.2 : N * 0.5 - 1.0) + R;
      }
      return -10.0;
    }
    if (K === fx_kind.HitRandomEnemy) {
      return 1.1 * N * Max(1, F.M) + R;
    }
    if (K === fx_kind.TutorHigh || K === fx_kind.TutorSpell) {
      return Mine.Hand.length <= 7 ? 3.5 + R : -3.0;
    }
    if (K === fx_kind.SummonKw) {
      return this.EmptySlots(Who).length > 0 ? 6.0 + R : -3.0;
    }
    if (K === fx_kind.BounceTwo) {
      const U = T.Side !== Who ? At(Op.Board, T.Col) : undefined;
      if (U) return this.UnitValue(U) * 1.2 + U.Def.Cost * 0.5 + (Op.Units().length > 1 ? 3.0 : 0.0) + R;
      return -10.0;
    }
    if (K === fx_kind.KillAllOthers) {
      let V = -2.0;
      for (const U of Op.Units()) if (!U.Invincible) V += this.UnitValue(U) * 1.8;
      for (const U of Mine.Units()) if (!U.Invincible) V -= this.UnitValue(U) * 1.5;
      return V + R;
    }
    // AF-M: its own board is lost (amulets too); a fresh deck helps more the emptier the old one is
    if (K === fx_kind.KillOwnOthers) {
      let V = 0.0;
      for (const U of Mine.Units()) if (!U.Invincible) V -= this.UnitValue(U) * 1.5;
      V -= 2.0 * this.AmuletsOf(Who).length;
      return V + R;
    }
    if (K === fx_kind.ArtifactDeck) {
      return (Mine.Deck.length < 10 ? 4.0 : 0.5) + R;
    }
    if (K === fx_kind.DestroyAlly) {
      // a loss, unless the monster was nearly dead anyway (the AI only does it when it must)
      const U = T.Side === Who ? this.MonAt(Who, T.Col) : undefined;
      if (U) return (U.Invincible ? -0.5 : -this.UnitValue(U) * 1.5 - 1.0) + R;
      return -10.0;
    }
    if (K === fx_kind.BounceAny) {
      if (T.Side === Who) return -6.0;
      const U = At(Op.Board, T.Col);
      if (U) return (U.Def.Amulet ? 2.0 + U.Def.Cost * 0.6 : this.UnitValue(U) * 1.2 + U.Def.Cost * 0.5 - 2.0) + R;
      return -10.0;
    }
    if (K === fx_kind.HandKw) {
      const Got = Mine.Hand.filter(H => H.Def.Id === F.C);
      return Got.length > 0 ? 1.5 * Got.length + R : -2.0;
    }
    if (K === fx_kind.HeroEndSummon) {
      return 10.0 + R;
    }
    if (K === fx_kind.ManaNext) {
      return 1.5 * N + R;
    }
    if (K === fx_kind.DiscountRandom) {
      return Mine.Hand.length > 1 ? 1.2 * Max(1, F.M) + R : -1.0;
    }
    if (K === fx_kind.KillRandomFoe) {
      return Op.Units().length > 0 ? 5.0 + R : -3.0;
    }
    if (K === fx_kind.AdvanceAll) {
      const Ams = this.AmuletsOf(Who).filter(C => { const U = this.AmuletAt(Who, C); return U && U.Count > 0; });
      return Ams.length > 0 ? 2.5 * Ams.length * N + R : -4.0;
    }
    if (K === fx_kind.AdvanceTarget) {
      return this.AmuletAt(Who, T.Col) ? 2.0 * N + R : -4.0;
    }
    if (K === fx_kind.DestroyAmulet) {
      const U = this.AmuletAt(T.Side, T.Col);
      if (U) return T.Side !== Who ? 3.0 + U.Def.Cost * 0.8 + R : -6.0;
      return -4.0;
    }
    if (K === fx_kind.Devour) {
      const U = this.MonAt(Who, T.Col);
      if (U) return (U.Atk + U.Hp) * 0.5 - this.UnitValue(U) * 0.6 + (U.Def.Token ? 2.0 : 0.0) + R;
      return -4.0;
    }
    if (K === fx_kind.DiscountPick) {
      return Mine.Hand.length > 1 ? 1.5 + R : -1.0;
    }
    if (K === fx_kind.BuffOther) {
      const U = At(Mine.Board, T.Col);
      if (U) return 2.5 + N * (U.CanAct ? 1.6 : 1.0) + F.M * 0.8 + R;
      return -10.0;
    }
    if (K === fx_kind.DrawBoth) {
      return Mine.Hand.length + N <= 7 ? 1.5 * N + R : -1.0;
    }
    if (K === fx_kind.DrawCheap) {
      return Mine.Hand.length + N <= 7 ? (3.5 + F.M * 1.0) * N + R : -3.0;
    }
    if (K === fx_kind.GravePick) {
      return Mine.Grave.length > 0 ? 3.5 * Max(1, N) + R : -5.0;
    }
    if (K === fx_kind.FoeHandToDeck) {
      return Op.Hand.length > 0 ? 1.5 + R : -1.0;
    }
    if (K === fx_kind.FoeDiscard) {
      return Op.Hand.length > 0 ? 2.5 + R : -1.0;
    }
    if (K === fx_kind.HitOwnHero) {
      return N >= Mine.Hp + Mine.Shield ? -2000.0 : -0.8 * N;
    }
    if (K === fx_kind.HitAllMonsters) {
      let V = -3.0;
      for (const U of Op.Units()) {
        if (N >= U.Hp && !U.Invincible) V += this.UnitValue(U) * 1.8; else V += N * 0.6;
      }
      for (const U of Mine.Units()) {
        if (N >= U.Hp && !U.Invincible) V -= this.UnitValue(U) * 1.8; else V -= N * 0.4;
      }
      return V + R;
    }
    if (K === fx_kind.SummonFoe) {
      return -2.0 + R;
    }
    if (K === fx_kind.DeckSummon) {
      return this.EmptySlots(Who).length > 0 ? 5.0 + R : -2.0;
    }
    if (K === fx_kind.SummonTrump || K === fx_kind.SummonRushBuff) {
      return this.EmptySlots(Who).length > 0 ? 4.0 + 1.5 * N + R : -2.0;
    }
    if (K === fx_kind.HitRandomAny) {
      // (a random monster, own ones too)
      const Foes = Op.Units().length, Allies = Mine.Units().length;
      if (Foes === 0) return -3.0;
      return (Foes >= Allies ? 0.5 + 0.6 * N * Max(1, F.M) * Foes / (Foes + Allies) : -1.0) + R;
    }
    if (K === fx_kind.SpellLock) {
      // (worth more when the enemy holds spells)
      return Op.Hand.length >= 3 ? 2.0 + R : 1.0 + R;
    }
    if (K === fx_kind.Choose) {
      return Max(this.FxScore(Who, this.CardOf(F.C).Spell, this.Hero(Who), 0.0), this.FxScore(Who, this.CardOf(F.M).Spell, this.Hero(Who), 0.0)) + R;
    }
    // effects on the own other monsters: nothing happens without them (a spell has no monster of its own)
    const Allies = Mine.Units().length;
    if (K === fx_kind.BuffAllies || K === fx_kind.BuffRandomAlly || K === fx_kind.AllyKw) {
      if (Allies === 0) return -3.0;
      const Many = K === fx_kind.BuffRandomAlly ? 1 : Allies;
      return (K === fx_kind.AllyKw ? 1.5 : 1.0 + N * 1.0 + F.M * 0.7) * Many + R;
    }
    if (K === fx_kind.HealAllies || K === fx_kind.HealRandomAlly || K === fx_kind.HealTeam || K === fx_kind.HealRandomAny) {
      let Missing = 0;
      for (const U of Mine.Units()) Missing += Min(N, U.MaxHp - U.Hp);
      if (K === fx_kind.HealTeam) Missing += Min(N, Mine.MaxHp - Mine.Hp);
      return Missing > 0 ? Missing * 0.8 + R : -3.0;
    }
    // effects on enemy monsters at random: nothing happens without them
    if (K === fx_kind.DebuffRandomFoe || K === fx_kind.FreezeHitRandom) {
      return Op.Units().length > 0 ? 1.0 + N * 0.8 + F.M * 0.8 + R : -3.0;
    }
    if (K === fx_kind.Summon) {
      return this.EmptySlots(Who).length > 0 ? 2.5 + this.CardOf(F.C).Cost * 1.0 + R : -3.0;
    }
    if (K === fx_kind.HitSelf || K === fx_kind.KillSelf || K === fx_kind.VanishSelf) return -1.0 + R;
    // effects of monsters on the board (front / allies / self...) are scored by the monster itself
    return 1.0 + R;
  }

  // self damage is only worth it when there is HP to spare
  HarmScore(Who, D) {
    if (D.SelfDmg <= 0) return 0.0;
    const Mine = this.S(Who);
    if (D.SelfDmg >= Mine.Hp + Mine.Shield) return -2000.0;
    if (Mine.Hp <= 8) return -D.SelfDmg * 2.5;
    return -D.SelfDmg * 0.8;
  }

  ScoreAct(Who, A) {
    const O = 1 - Who;
    const Me2 = this.S(Who);
    const Op = this.S(O);
    const R = this.Rng.Float(0.0, 0.6);
    if (A.Kind === 2) {
      const U = At(Me2.Board, A.Src);
      if (U) {
        const Ua = this.EffAtk(Who, A.Src, U);
        if (A.Dst.Col < 0) {
          // (a monster without attack doesn't hit the player for nothing)
          if (Ua <= 0) return -1.0;
          if (Ua >= Op.Hp + Op.Shield) return 1000.0;
          return Ua * 1.4 + (U.Drain ? 0.6 : 0.0) + R;
        }
        const T = At(Op.Board, A.Dst.Col);
        if (T) {
          // (プレゼント箱 breaks by itself: hitting it only hands its cards over sooner)
          if (this.AiDoomed(T)) return -1.0;
          const Ta = this.EffAtk(O, A.Dst.Col, T);
          const Blocked = T.Invincible || T.Barrier;
          const Hits = Min(Ua - T.ArmorNow(), T.CapNow() > 0 ? T.CapNow() : Ua);
          const Kills = !Blocked && Hits > 0 && (Hits >= T.Hp || U.Deadly);
          const Back = Ta + T.ThornsNow() - U.ArmorNow();
          const Die = !U.Invincible && !U.Barrier && Back > 0 && (Back >= U.Hp || T.Deadly);
          if (U.Live(U.Def.OnAttack).K === fx_kind.KillAttackTarget && !T.Invincible) return this.UnitValue(T) * 2.4 + 2.0 + R;
          let Sc = 0.0;
          if (Kills) Sc += this.UnitValue(T) * 2.2; else if (Blocked) Sc += (T.Barrier && Ua > 0) ? 1.2 : -2.0; else Sc += Ua * 0.5 - 0.3;
          if (Die) Sc -= this.UnitValue(U) * 2.0; else Sc -= Ta * 0.3;
          if (T.Taunt) Sc += 1.5;
          if (U.Drain) Sc += 0.5;
          return Sc + R;
        }
      }
      return -1.0;
    }
    if (A.Kind === 6) {
      if (A.Dst.Col < 0) {
        if (Me2.HeroAtk >= Op.Hp + Op.Shield) return 1000.0;
        return Me2.HeroAtk * 1.4 + R;
      }
      const T = At(Op.Board, A.Dst.Col);
      if (T) {
        if (this.AiDoomed(T)) return -1.0;
        if (Me2.HeroAtk >= T.Hp && !T.Invincible && Me2.Hp > this.EffAtk(O, A.Dst.Col, T) + T.ThornsNow() + 4) return this.UnitValue(T) * 2.0 + R;
        return -1.0;
      }
      return -1.0;
    }
    if (A.Kind === 4) {
      return this.FxScore(Who, Me2.Hero.Jewel, A.Dst, R);
    }
    if (A.Kind === 7) {
      const U = At(Me2.Board, A.Src);
      if (U) {
        let Sc = 4.0 + U.Def.EvoAtk * 1.2 + U.Def.EvoHp * 0.8 + R;
        if (U.Sleeping && Op.Units().length > 0) Sc += 1.5;
        if (U.Def.Evo.K !== fx_kind.None) {
          Sc += this.FxScore(Who, U.Def.Evo, FxTarget(U.Def.Evo.K) > 0 ? A.Dst2 : this.Hero(Who), 0.0);
          if (U.Def.Evo2.K !== fx_kind.None) Sc += this.FxScore(Who, U.Def.Evo2, FxTarget(U.Def.Evo2.K) > 0 ? A.Dst2 : this.Hero(Who), 0.0);
        }
        // keep the evolve points for later turns when the board is quiet
        if (Me2.Turns < 6 && U.Atk + U.Hp < 5) Sc -= 3.0;
        return Sc;
      }
      return -1.0;
    }
    if (A.Kind === 3) {
      // an オーク stuck behind a monster walks to a free lane
      const U = At(Me2.Board, A.Src);
      if (U && U.IsBlocked() && At(Op.Board, A.Src) && !At(Op.Board, A.Dst.Col)) return 2.5 + R;
      return -1.0;
    }
    if (A.Kind === 1) {
      const H = At(Me2.Hand, A.Src);
      if (H) {
        const D = H.Def;
        const Harm = this.HarmScore(Who, D);
        if (D.IsSpell) {
          return this.FxScore(Who, D.Spell, A.Dst, R) + this.FxScore(Who, D.Spell2, FxTarget(D.Spell2.K) > 0 ? A.Dst : this.Hero(Who), 0.0) * 0.8 + Harm;
        }
        let Sc = 6.0 + D.Cost * 3.0 + R + Harm;
        Sc += this.LaneScore(Who, D, A.Dst.Col);
        const CK = D.Cry.K;
        if (FxTarget(CK) > 0) {
          Sc += Min(6.0, this.FxScore(Who, D.Cry, A.Dst2, 0.0)) * 0.6;
        } else if (CK === fx_kind.HitAllFoes) {
          for (const T of Op.Units()) Sc += D.Cry.N >= T.Hp ? 3.0 : 1.0;
        } else if (CK !== fx_kind.HitFront && CK !== fx_kind.FreezeFront && CK !== fx_kind.KillFront && CK !== fx_kind.BounceFront && CK !== fx_kind.DebuffFront && CK !== fx_kind.SilenceFront) {
          Sc += Min(4.0, this.FxScore(Who, D.Cry, this.Hero(Who), 0.0)) * 0.5;
        }
        if (D.Cry2.K !== fx_kind.None) Sc += Min(4.0, this.FxScore(Who, D.Cry2, FxTarget(D.Cry2.K) > 0 ? A.Dst2 : this.Hero(Who), 0.0)) * 0.5;
        return Sc;
      }
    }
    return -1.0;
  }

  // the best action (null: none worth doing)
  BestAct(Who) {
    // 中級 and up think more (AiLevel 0 = the classic AI below, unchanged)
    if (this.S(Who).AiLevel > 0) return this.BestActLv(Who);
    let Best = null;
    let BestScore = 0.0;
    for (const A of this.Actions(Who)) {
      const Sc = this.ScoreAct(Who, A);
      if (Sc > BestScore) {
        BestScore = Sc;
        Best = new act({ Kind: A.Kind, Src: A.Src, Dst: A.Dst, Dst2: A.Dst2, Score: Sc });
      }
    }
    return Best;
  }

  // ------------------------------------------------------------ AI levels (side.AiLevel, boss.js)
  // 1 中級: keeps the evolve points for good moments, board control before face damage unless the kill is near
  // 2 上級 / 3 最恐: + plans the mana of the turn (AiPlan), goes for lethal through a taunt, sharper trades, mulligan (AiMull)
  BestActLv(Who) {
    const Lv = this.S(Who).AiLevel;
    const Acts = this.Actions(Who);
    const Ctx = this.AiContext(Who, Lv, Acts);
    let Best = null;
    let BestScore = 0.0;
    for (const A of Acts) {
      const Sc = this.ScoreActLv(Who, Lv, A, Ctx);
      if (Sc > BestScore) {
        BestScore = Sc;
        Best = new act({ Kind: A.Kind, Src: A.Src, Dst: A.Dst, Dst2: A.Dst2, Score: Sc });
      }
    }
    return Best;
  }

  AiContext(Who, Lv, Acts) {
    const Op = this.S(1 - Who);
    const Pot = this.AiFacePot(Who);
    const Need = Op.Hp + Op.Shield;
    const Taunted = this.HasTaunt(1 - Who);
    if (Lv >= 2) {
      const P = this.AiPlan(Who, Acts);
      return new ai_ctx({ Pot, Need, Taunted, Planned: true, Plan: P[0], PlanJewel: P[1] });
    }
    return new ai_ctx({ Pot, Need, Taunted });
  }

  // can this monster hit the enemy player (not counting taunts)?
  AiCanFace(Who, C, U) {
    if (!U.CanAct || U.Sleeping) return false;
    const Blk = U.IsBlocked() && !!this.MonAt(1 - Who, C);
    return !Blk;
  }

  // what one monster can still deal to the enemy player this turn
  AiFaceOf(Who, C, U) {
    if (this.AiCanFace(Who, C, U)) {
      const Hits = (U.HasTwoActs() && !U.ExtraUsed) ? 2 : 1;
      return this.EffAtk(Who, C, U) * Hits;
    }
    return 0;
  }

  // the damage the own side can still deal to the enemy player this turn: monsters, the player, the jewel, burn spells
  AiFacePot(Who) {
    const Me2 = this.S(Who);
    let P = (Me2.HeroAtk > 0 && !Me2.HeroDone) ? Me2.HeroAtk : 0;
    for (let C = 0; C <= 2; C++) {
      const U = this.MonAt(Who, C);
      if (U) P += this.AiFaceOf(Who, C, U);
    }
    let Mana = Me2.Mana;
    const H0 = Me2.Hero;
    if (H0.Jewel.K === fx_kind.HeroAtk && !Me2.JewelUsed && !Me2.HeroDone && this.JewelCost(Who) <= Mana) {
      P += H0.Jewel.N;
      Mana -= this.JewelCost(Who);
    }
    if (!Me2.SpellLock) {
      for (const H of Me2.Hand) {
        const Dm = H.Def.IsSpell ? AiFxBurn(H.Def.Spell) + AiFxBurn(H.Def.Spell2) : 0;
        if (Dm > 0 && H.Cost <= Mana) {
          P += Dm;
          Mana -= H.Cost;
        }
      }
    }
    return P;
  }

  // a fight of U (attack A, HP H) against enemy monster T in slot C: does T die / does U die?
  AiKills(T, A, U) {
    if (T.Invincible || T.Barrier) return false;
    const Hits = Min(A - T.ArmorNow(), T.CapNow() > 0 ? T.CapNow() : A);
    return Hits > 0 && (Hits >= T.Hp || U.Deadly);
  }

  AiDies(Who, C, T, H, U) {
    if (U.Invincible || U.Barrier) return false;
    const Back = this.EffAtk(1 - Who, C, T) + T.ThornsNow() - U.ArmorNow();
    return Back > 0 && (Back >= H || T.Deadly);
  }

  // U kills T and survives
  AiWin(Who, C, T, A, H, U) { return this.AiKills(T, A, U) && !this.AiDies(Who, C, T, H, U); }

  AiMayHit(TauntUp, T) { return !TauntUp || T.Taunt; }

  ScoreActLv(Who, Lv, A, Ctx) {
    const Base = this.ScoreAct(Who, A);
    if (A.Kind === 2 || A.Kind === 6) return this.AiAttackAdj(Who, Lv, A, Ctx, Base);
    if (A.Kind === 7) return this.AiEvoScore(Who, A, Ctx, Base);
    if (A.Kind === 1 || A.Kind === 4) return this.AiPlayAdj(Who, A, Ctx, Base);
    return Base;
  }

  AiLethal(Ctx) { return !Ctx.Taunted && Ctx.Pot >= Ctx.Need; }

  // attacks: lethal first, then good trades, the enemy player only when nothing better is left (or the kill is near)
  AiAttackAdj(Who, Lv, A, Ctx, Base) {
    if (Base >= 500.0) return Base;
    const Op = this.S(1 - Who);
    if (A.Dst.Col < 0) {
      if (this.AiLethal(Ctx) && Base > 0.0) return Base + 60.0;
      const Near = Lv >= 2 ? 3 : 2;
      if (Ctx.Pot + Near >= Ctx.Need || Op.Units().length === 0) return Base + 1.0;
      return Base * 0.45;
    }
    if (this.AiLethal(Ctx)) return Base - 4.0;
    const U = A.Kind === 2 ? this.MonAt(Who, A.Src) : undefined;
    const T = U ? this.MonAt(1 - Who, A.Dst.Col) : undefined;
    if (A.Kind === 2 && U && T) {
      const Ua = this.EffAtk(Who, A.Src, U);
      const Kills = this.AiKills(T, Ua, U);
      const Dies = this.AiDies(Who, A.Dst.Col, T, U.Hp, U);
      let Sc = Base;
      if (Kills && !Dies) Sc += 3.0 + this.UnitValue(T) * (Lv >= 2 ? 0.8 : 0.5);
      else if (Kills && Dies && this.UnitValue(T) >= this.UnitValue(U)) Sc += 1.0;
      else if (!Kills && Dies) Sc -= 3.0;
      // 上級: break the only taunt when the rest is lethal
      if (Lv >= 2 && Kills && T.Taunt && Ctx.Taunted && this.TargetableTaunts(1 - Who).length === 1 && Ctx.Pot - this.AiFaceOf(Who, A.Src, U) >= Ctx.Need) {
        Sc += 25.0;
      }
      return Sc;
    }
    return Base;
  }

  // evolving: only when it kills something, wins a trade, saves the monster or is lethal (or late in the match)
  AiEvoScore(Who, A, Ctx, Base) {
    const Me2 = this.S(Who);
    const U = this.MonAt(Who, A.Src);
    if (U) {
      const Ev = U.Live(U.Def.Evo);
      const FxV = Ev.K !== fx_kind.None ? this.FxScore(Who, Ev, FxTarget(Ev.K) > 0 ? A.Dst2 : this.Hero(Who), 0.0) : 0.0;
      let Good = false;
      if (FxV >= 6.0) Good = true;
      if (this.AiEvoTrade(Who, A.Src, U)) Good = true;
      if (this.AiEvoSaves(Who, A.Src, U)) Good = true;
      if (!Ctx.Taunted && this.AiCanFace(Who, A.Src, U) && Ctx.Pot + U.Def.EvoAtk >= Ctx.Need) Good = true;
      const Late = Me2.Turns >= 9 || (Me2.EvoLeft >= 2 && Me2.Turns >= 7);
      if (Good) return Base + 4.0;
      if (Late) return Base - 1.0;
      return Base - 12.0;
    }
    return Base;
  }

  // after evolving the monster can win a fight it could not win now
  AiEvoTrade(Who, Col, U) {
    const Ready = U.CanAct ? true : (U.Sleeping && !U.Acted && !U.Frozen);
    if (!Ready) return false;
    const Ea = this.EffAtk(Who, Col, U);
    const A2 = Ea + U.Def.EvoAtk;
    const H2 = U.Hp + U.Def.EvoHp;
    const TauntUp = this.HasTaunt(1 - Who);
    const Wins = [];
    for (let C = 0; C <= 2; C++) {
      if (Abs(C - Col) > 1) continue;
      const T = this.MonAt(1 - Who, C);
      if (T && !T.Hidden() && !T.NoTarget() && this.AiMayHit(TauntUp, T) && this.AiWin(Who, C, T, A2, H2, U) && !this.AiWin(Who, C, T, Ea, U.Hp, U)) Wins.push(C);
    }
    return Wins.length > 0;
  }

  // an enemy monster next to it would kill it now, but not after evolving
  AiEvoSaves(Who, Col, U) {
    if (U.Hidden() || U.Barrier || U.Invincible) return false;
    if (!(this.UnitValue(U) >= 5.0)) return false;
    const Threats = [];
    for (let C = 0; C <= 2; C++) {
      if (Abs(C - Col) > 1) continue;
      const T = this.MonAt(1 - Who, C);
      if (T && this.EffAtk(1 - Who, C, T) - U.ArmorNow() >= U.Hp) Threats.push(C);
    }
    if (!(Threats.length > 0)) return false;
    const Still = Threats.filter(C => { const T = this.MonAt(1 - Who, C); return T && (T.Deadly || this.EffAtk(1 - Who, C, T) - U.ArmorNow() >= U.Hp + U.Def.EvoHp); });
    return Still.length === 0;
  }

  // playing cards / the jewel: lethal burn first; 上級 only plays what the mana plan wants
  AiPlayAdj(Who, A, Ctx, Base) {
    if (Base >= 500.0) return Base;
    let Sc = Base;
    if (this.AiLethal(Ctx)) {
      if (A.Kind === 4 && this.S(Who).Hero.Jewel.K === fx_kind.HeroAtk) Sc += 60.0;
      const H = A.Kind === 1 ? At(this.S(Who).Hand, A.Src) : undefined;
      const D = H ? H.Def : undefined;
      if (D && D.IsSpell && AiFxBurn(D.Spell) + AiFxBurn(D.Spell2) > 0 && (A.Dst.Side !== Who || FxTarget(D.Spell.K) === 0)) {
        Sc += 60.0;
      }
    }
    if (Ctx.Planned) {
      const InPlan = A.Kind === 4 ? Ctx.PlanJewel : Ctx.Plan.includes(A.Src);
      if (InPlan) Sc += 2.0; else Sc -= 30.0;
    }
    return Sc;
  }

  // 上級: the hand cards (and the jewel) that use the mana of this turn best: [hand indices, jewel?]
  AiPlan(Who, Acts) {
    const Me2 = this.S(Who);
    let Idx = [], Cost = [], Slot = [], Val = [];
    Me2.Hand.forEach((H, I) => {
      let Best = -1.0;
      for (const A of Acts) {
        if (A.Kind !== 1 || A.Src !== I) continue;
        const Sc = this.ScoreAct(Who, A);
        if (Sc > Best) Best = Sc;
      }
      if (Best > 0.0) {
        Idx = [...Idx, I];
        Cost = [...Cost, H.Cost];
        Slot = [...Slot, H.Def.IsSpell ? 0 : 1];
        Val = [...Val, Min(Best, 40.0)];
      }
    });
    // the jewel skill is one more item (-1)
    let JBest = -1.0;
    for (const A of Acts) {
      if (A.Kind !== 4) continue;
      const Sc = this.ScoreAct(Who, A);
      if (Sc > JBest) JBest = Sc;
    }
    if (JBest > 0.0) {
      Idx = [...Idx, -1];
      Cost = [...Cost, this.JewelCost(Who)];
      Slot = [...Slot, 0];
      Val = [...Val, Min(JBest, 20.0)];
    }
    const Pick = AiKnap(Cost, Slot, Val, 0, Me2.Mana, this.EmptySlots(Who).length);
    const Chosen = Pick[1].map(K => At(Idx, K)).filter(I => I !== undefined);
    return [Chosen.filter(I => I >= 0), Chosen.includes(-1)];
  }

  // ------------------------------------------------------------ AI with look-ahead (every level)
  // A candidate action is played on a copy of the match (AiClone: no screens, no waiting, its own random numbers; the
  // real match is never changed and its Rng is only read, never advanced) and the position after it is valued (AiEval).
  // 0 初級: the classic scores above choose; the look-ahead only throws out plays that do nothing or blunder
  // 1 中級: the action that leaves the best position (trades, removal on the biggest threat, the mana used well)
  // 2 上級: + the best follow-up of the most promising actions (the order of plays and attacks), a search for a lethal
  //   line (spells / burn included), the enemy's area damage in mind
  // 3 最恐: 上級 that knows its next draws and the random results, sees the enemy hand and looks at more lines

  // a look-ahead copy. Know: the real deck order and random numbers (最恐, or a copy of a copy); otherwise both decks
  // are shuffled with the copy's own numbers (the AI doesn't know what comes)
  // (Who >= 0 and not Know: the enemy hand is dealt again from its hand and deck, the AI doesn't see it)
  AiClone(Know, Seed, Who = -1) {
    const M = new card_match({ DB: this.DB, Me: AiCopySide(this.Me), Foe: AiCopySide(this.Foe), Views: [null, null], AutoPlay: true, Seed: Seed >>> 0 });
    M.Sim = true;
    M.First = this.First;
    M.Current = this.Current;
    M.Ended = this.Ended;
    M.Winner = this.Winner;
    M.Reason = this.Reason;
    M.Pvp = this.Pvp;
    M.FirstTurnDone = this.FirstTurnDone;
    if (!Know) {
      M.Me.Deck = M.Rng.Shuffle(M.Me.Deck);
      M.Foe.Deck = M.Rng.Shuffle(M.Foe.Deck);
      if (Who === 0 || Who === 1) {
        const Op = M.S(1 - Who);
        const Pool = M.Rng.Shuffle([...Op.Hand.map(H => H.Def), ...Op.Deck]);
        Op.Hand = Pool.slice(0, Op.Hand.length).map(D => MakeHandCard(D));
        Op.Deck = Pool.slice(Op.Hand.length);
      }
    }
    M.AiRng0 = M.Rng.State();
    return M;
  }

  // the copy after side Who did A (null: the copy failed)
  async AiTry(Who, A, Know, Seed) {
    AiSims += 1;
    try {
      const M = this.AiClone(Know, Seed, Who);
      await M.Exec(Who, A);
      return M;
    } catch (e) {
      console.error('AI look-ahead failed', e);
      return null;
    }
  }

  // did the action use random numbers? (上級 looks at such an action twice)
  AiRandom() { return this.Rng.State() !== this.AiRng0; }

  // what a monster on the board is worth to its owner
  AiUnitVal(Side, Col, U) {
    const D = U.Def;
    const A = this.EffAtk(Side, Col, U);
    const H = Max(0, U.Hp);
    let V = (A <= 0 && !U.Taunt) ? 0.2 + 0.1 * H : 0.6 + 0.95 * A + 0.65 * H;
    if (U.Taunt) V += 0.4 + 0.25 * H;
    if (U.Deadly && A > 0) V += 1.5;
    if (U.Drain) V += 0.3 * A;
    if (U.Barrier) V += 0.8 + 0.3 * A;
    if (U.Invincible) V += 3.0 + 0.5 * A;
    if (U.Hidden()) V += 0.4 + 0.2 * A;
    if (U.HasTwoActs()) V += 0.8 * A;
    V += 0.7 * U.ArmorNow() + 0.4 * U.ThornsNow() + (U.CapNow() > 0 ? 1.5 : 0.0) + 0.6 * U.FrontDown();
    if (U.IsBlocked() && this.MonAt(1 - Side, Col)) V -= 0.3 * A;
    V += AiTurnFxVal(U.Live(D.TurnStart)) + AiTurnFxVal(U.Live(D.TurnEnd));
    if (U.Live(D.OnAttack).K !== fx_kind.None || U.Live(D.OnKill).K !== fx_kind.None || U.Live(D.OnHeal).K !== fx_kind.None || U.Live(D.AllySum).K !== fx_kind.None) V += 1.0;
    if (U.Count > 0 && U.Live(D.CdFx).K !== fx_kind.None) V += 1.5;
    // (プレゼント箱: it breaks by itself soon)
    const Life = this.AiLife(U);
    if (Life <= 1) V *= 0.35; else if (Life === 2) V *= 0.7;
    if (U.Frozen && !U.Thaw) V -= 0.5 * A;
    // its death effect still comes (cards in the hand now are worth a little more than cards later)
    V += 0.75 * (AiDeathFxVal(U.Live(D.Death)) + AiDeathFxVal(U.Live(D.Death2)));
    return V;
  }

  // the damage a monster can deal to the enemy player in its owner's next turn
  AiThreat(Side, Col, U) {
    if (U.Frozen && !U.Thaw) return 0;
    if (U.IsBlocked() && this.MonAt(1 - Side, Col)) return 0;
    return this.EffAtk(Side, Col, U) * (U.HasTwoActs() ? 2 : 1);
  }

  // the own hand (a card made cheaper is worth more)
  AiHandVal(Who) {
    let V = 0.0;
    const Hand = this.S(Who).Hand;
    for (let I = 0; I < Min(Hand.length, CardMaxHand); I++) {
      const H = Hand[I];
      const D = H.Def;
      V += 1.1 + 0.35 * D.Cost + 0.9 * Max(0, D.Cost - H.Cost) + (D.IsSpell ? 0.3 : 0.0);
    }
    return V;
  }

  // the damage side W's hand (and jewel) can deal to the enemy player with Mana mana (最恐 reads the enemy hand)
  AiHandBurn(W, Mana) {
    const Sd = this.S(W);
    let Left = Mana;
    let Dm = 0;
    const H0 = Sd.Hero;
    if (H0.Jewel.K === fx_kind.HeroAtk && this.JewelCost(W) <= Left) {
      Dm += H0.Jewel.N;
      Left -= this.JewelCost(W);
    }
    for (const H of Sd.Hand) {
      const D = H.Def;
      const B = D.IsSpell ? AiFxBurn(D.Spell) + AiFxBurn(D.Spell2) : (D.Haste ? D.Atk : 0) + AiFxBurn(D.Cry) + AiFxBurn(D.Cry2);
      if (B > 0 && H.Cost <= Left) {
        Dm += B;
        Left -= H.Cost;
      }
    }
    return Dm;
  }

  // 上級+: what the enemy's area damage next turn may cost (最恐 knows the enemy hand, 上級 guesses)
  AiAoeRisk(Who, Lv) {
    const Op = this.S(1 - Who);
    let N = 0;
    if (Lv >= 3) {
      for (const H of Op.Hand) {
        if (H.Cost > Op.MaxMana + 1) continue;
        const D = H.Def;
        for (const F of D.IsSpell ? [D.Spell, D.Spell2] : [D.Cry, D.Cry2]) {
          const K = F.K;
          if (K === fx_kind.HitAllFoes || K === fx_kind.HitAllEnemies || K === fx_kind.HitAllMonsters || K === fx_kind.HitAllOthers) N = Max(N, F.N);
          else if (K === fx_kind.DebuffAllFoes) N = Max(N, F.M);
        }
      }
    } else if (Op.Hand.length >= 3 && Op.MaxMana >= 3) {
      N = 2;
    }
    if (N <= 0) return 0.0;
    let Lost = 0.0, Count = 0;
    for (let C = 0; C <= 2; C++) {
      const U = this.MonAt(Who, C);
      if (U && U.Hp <= N && !U.Barrier && !U.Invincible) {
        Lost += this.AiUnitVal(Who, C, U);
        Count += 1;
      }
    }
    // (losing one monster is normal; it is about playing more into the same blow)
    if (Count < 2) return 0.0;
    return Lost * (Lv >= 3 ? 0.45 : 0.15);
  }

  // can a spell card do something useful now (some target with a positive score)?
  AiSpellUseful(Who, D) {
    for (const T of this.AllTargets()) {
      if (!this.FxTargetOk(Who, D.Spell, T)) continue;
      const S2 = D.Spell2.K !== fx_kind.None ? this.FxScore(Who, D.Spell2, FxTarget(D.Spell2.K) > 0 ? T : this.Hero(Who), 0.0) * 0.8 : 0.0;
      if (this.FxScore(Who, D.Spell, T, 0.0) + S2 + this.HarmScore(Who, D) > 0.5) return true;
    }
    return false;
  }

  AiJewelUseful(Who) {
    for (const T of this.AllTargets()) if (this.JewelOk(Who, T) && this.FxScore(Who, this.S(Who).Hero.Jewel, T, 0.0) > 0.5) return true;
    return false;
  }

  // what the rest of this turn can still add: the cards that can still be played (the best set for the mana and the
  // free slots) and the attacks left
  AiPot(Who) {
    const Me2 = this.S(Who);
    const O = 1 - Who;
    const Op = this.S(O);
    const Free = this.EmptySlots(Who).length;
    const Cost = [], Slot = [], Val = [];
    for (const H of Me2.Hand) {
      if (H.Cost > Me2.Mana) continue;
      const D = H.Def;
      if (D.IsSpell) {
        if (Me2.SpellLock || !this.AiSpellUseful(Who, D)) continue;
      } else if (Free === 0) continue;
      Cost.push(H.Cost);
      Slot.push(D.IsSpell ? 0 : 1);
      Val.push(0.3 + 0.25 * D.Cost);
    }
    if (!Me2.JewelUsed && this.JewelCost(Who) <= Me2.Mana && this.AiJewelUseful(Who)) {
      Cost.push(this.JewelCost(Who));
      Slot.push(FxTarget(Me2.Hero.Jewel.K) === 4 ? 1 : 0);
      Val.push(0.4);
    }
    let P = AiBestSet(Cost, Slot, Val, Me2.Mana, Free);
    const Fr = AiFaceRate(Op.Hp + Op.Shield);
    const Taunt = this.HasTaunt(O);
    const Foes = Op.Units().length > 0;
    for (let C = 0; C <= 2; C++) {
      const U = this.MonAt(Who, C);
      if (!U || !U.CanAct) continue;
      const Hits = (U.HasTwoActs() && !U.ExtraUsed) ? 2 : 1;
      const A = this.EffAtk(Who, C, U);
      if (!Taunt && !U.Sleeping && !(U.IsBlocked() && this.MonAt(O, C))) P += 0.8 * A * Fr * Hits;
      else if (Foes) P += 0.3 * A * Hits;
    }
    if (Me2.HeroAtk > 0 && !Me2.HeroDone) P += Taunt ? 0.3 * Me2.HeroAtk : 0.8 * Me2.HeroAtk * Fr;
    return P;
  }

  // how good the position is for side Who (Pot: + what the rest of this turn can still add)
  AiEval(Who, Lv, Pot) {
    if (this.Ended) return this.Winner === Who ? 10000.0 : this.Winner < 0 ? -5000.0 : -10000.0;
    const O = 1 - Who;
    const Me2 = this.S(Who);
    const Op = this.S(O);
    let E = AiHpVal(Me2.Hp + Me2.Shield) - AiHpVal(Op.Hp + Op.Shield);
    let MyAtk = 0, OpAtk = 0, MyWall = 0, OpWall = 0;
    for (let C = 0; C <= 2; C++) {
      const U = At(Me2.Board, C);
      if (U && U.Def.Amulet) E += 0.8 + 0.6 * U.Def.Cost;
      else if (U) {
        E += this.AiUnitVal(Who, C, U);
        MyAtk += this.AiThreat(Who, C, U);
        if (U.Taunt && !U.Hidden()) MyWall += Max(1, U.Hp);
      }
      const X = At(Op.Board, C);
      if (X && X.Def.Amulet) E -= 0.8 + 0.6 * X.Def.Cost;
      else if (X) {
        E -= this.AiUnitVal(O, C, X);
        OpAtk += this.AiThreat(O, C, X);
        if (X.Taunt && !X.Hidden()) OpWall += Max(1, X.Hp);
      }
    }
    E += this.AiHandVal(Who) - 1.7 * Min(Op.Hand.length, CardMaxHand);
    E += Me2.EvoLeft * (Me2.Turns >= 9 ? 1.0 : 2.6);
    if (Me2.Deck.length === 0) E -= 0.8 * (Me2.Fatigue + 1);
    // the enemy's next turn: can it kill this side? (最恐 reads the enemy hand)
    const Burn = Lv >= 3 ? this.AiHandBurn(O, Min(CardMaxMana, Op.MaxMana + 1)) : Min(Op.Hand.length, 3) * 0.7;
    const Reach = Max(0, OpAtk - MyWall) + Burn;
    const MyHp = Me2.Hp + Me2.Shield;
    if (Reach >= MyHp) E -= 15.0 + 2.0 * (Reach - MyHp);
    else if (Reach + 3 >= MyHp) E -= 3.0;
    // this side's threat for its next turn
    if (MyAtk - OpWall >= Op.Hp + Op.Shield) E += 4.0;
    if (Lv >= 2) E -= this.AiAoeRisk(Who, Lv);
    if (Pot) E += this.AiPot(Who);
    return E;
  }

  // the next action of an AI side (null: end the turn)
  async AiNext(Who) {
    const Lv = this.S(Who).AiLevel;
    const Acts = this.Actions(Who);
    if (Acts.length === 0) return null;
    const Know = Lv >= 3;
    // (the copies get their own numbers from the real Rng's state: reading it doesn't advance it)
    const Seed = Know ? this.Rng.State() : ((this.Rng.State() ^ 0x5bd1e995) >>> 0);
    const Now0 = this.AiEval(Who, Lv, false);
    const NowP = this.AiEval(Who, Lv, true);
    if (Lv <= 0) return await this.AiNextEasy(Who, Acts, Seed, Now0, NowP);
    if (Lv >= 2) {
      const L = await this.AiKillLine(Who, Lv, Know, Seed);
      if (L) return L;
    }
    let Sc = [];
    for (const A of Acts) {
      const M = await this.AiTry(Who, A, Know, Seed);
      if (!M) continue;
      if (M.Ended && M.Winner === Who) return A;
      let V = M.AiEval(Who, Lv, true);
      // 上級: an action with a random result is looked at twice
      if (Lv === 2 && M.AiRandom()) {
        const M2 = await this.AiTry(Who, A, Know, (Seed + 7919) >>> 0);
        if (M2) V = (V + M2.AiEval(Who, Lv, true)) * 0.5;
      }
      Sc.push({ V, V2: V, A, M });
    }
    if (Sc.length === 0) return null;
    Sc.sort((X, Y) => Y.V - X.V);
    // 上級+: the best follow-up of the most promising actions (the order of the plays and attacks)
    if (Lv >= 2) {
      // (the number of copies is bounded: a turn stays quick on a phone)
      const K = Min(Sc.length, Lv >= 3 ? 8 : 5);
      const St = { Left: Lv >= 3 ? 400 : 250 };
      for (let I = 0; I < K && St.Left > 0; I++) {
        const X = Sc[I];
        if (X.M.Ended) continue;
        let B2 = -1.0e9;
        for (const B of X.M.Actions(Who)) {
          if (St.Left <= 0) break;
          St.Left -= 1;
          const M2 = await X.M.AiTry(Who, B, true, X.M.Rng.State());
          if (!M2) continue;
          const V2 = M2.AiEval(Who, Lv, true);
          if (V2 > B2) B2 = V2;
        }
        X.V2 = Max(X.V, B2 - 0.2);
      }
      Sc.sort((X, Y) => Y.V2 - X.V2);
    }
    // 上級+: among the best few (that are worth doing at all), the one that is still best after the rest of this turn
    // and the enemy's whole reply are played out (上級: 3 of them, the enemy hand unknown = dealt again; 最恐: 8, the
    // enemy's real hand, both real decks and the real random numbers)
    if (Lv >= AiRollLv) {
      let BestR = -1.0e9, Pick = null;
      for (let I = 0; I < Min(Sc.length, Lv >= 3 ? AiRollK : 3); I++) {
        const X = Sc[I];
        if (!(X.V2 > Now0 + 0.3 && X.V2 >= NowP - 1.0)) continue;
        const R = (await this.AiRollout(Who, X.M, Lv)) + AiRollW * X.V2;
        if (R > BestR) {
          BestR = R;
          Pick = X;
        }
      }
      return Pick ? Pick.A : null;
    }
    const Best = Sc[0];
    // (only when it is better than ending the turn now, and doesn't throw away what the turn could still do)
    if (Best.V2 > Now0 + 0.3 && Best.V2 >= NowP - 1.0) return Best.A;
    return null;
  }

  // the classic choice of side W, whatever its level (the look-ahead plays the rest of a turn with it)
  AiClassic(W) {
    let Best = null;
    let BestScore = 0.0;
    for (const A of this.Actions(W)) {
      const Sc = this.ScoreAct(W, A);
      if (Sc > BestScore) {
        BestScore = Sc;
        Best = A;
      }
    }
    return Best;
  }

  // 上級+: the value (for Who) after the rest of Who's turn and the enemy's next turn are played out on a copy of M0
  // (both with the classic choice: cheap)
  async AiRollout(Who, M0, Lv) {
    const O = 1 - Who;
    try {
      const M = M0.AiClone(true, M0.Rng.State());
      AiSims += 1;
      for (let I = 0; I < 12 && !M.Ended; I++) {
        const A = M.AiClassic(Who);
        if (!A) break;
        await M.Exec(Who, A);
      }
      if (!M.Ended) await M.EndTurn(Who);
      if (!M.Ended) {
        M.Current = O;
        await M.StartTurn(O);
      }
      for (let I = 0; I < 12 && !M.Ended; I++) {
        const A = M.AiClassic(O);
        if (!A) break;
        await M.Exec(O, A);
      }
      if (!M.Ended) await M.EndTurn(O);
      return M.AiEval(Who, Lv, false);
    } catch (e) {
      console.error('AI look-ahead failed', e);
      return -1.0e9;
    }
  }

  // 初級: the classic choice, minus the plays that do nothing or blunder (a few next best ones are tried instead)
  async AiNextEasy(Who, Acts, Seed, Now0, NowP) {
    const Cands = [];
    for (const A of Acts) {
      const Sc = this.ScoreAct(Who, A);
      if (Sc > 0.0) Cands.push([Sc, A]);
    }
    Cands.sort((X, Y) => Y[0] - X[0]);
    for (let I = 0; I < Min(4, Cands.length); I++) {
      const A = Cands[I][1];
      const M = await this.AiTry(Who, A, false, Seed);
      if (!M) continue;
      if (M.Ended) {
        if (M.Winner === Who) return A;
        continue;
      }
      const V = M.AiEval(Who, 0, true);
      if (V > Now0 - 0.5 && V >= NowP - 3.0) return A;
    }
    return null;
  }

  // 上級+: a line of actions that wins this turn (attacks, burn, removal of a 挑発, buffs...): its first action or null
  async AiKillLine(Who, Lv, Know, Seed) {
    const Me2 = this.S(Who);
    const Op = this.S(1 - Who);
    // (only searched when the damage that could reach the enemy player is near enough)
    let Bound = this.AiFacePot(Who) + 4;
    for (const H of Me2.Hand) if (!H.Def.IsSpell && H.Def.Haste && H.Cost <= Me2.Mana) Bound += H.Def.Atk;
    if (Bound < Op.Hp + Op.Shield) return null;
    const St = { Left: Lv >= 3 ? 300 : 200 };
    return await this.AiKillDfs(Who, 5, St, Know, Seed);
  }

  async AiKillDfs(Who, Depth, St, Know, Seed) {
    for (const A of this.AiAggro(Who)) {
      if (St.Left <= 0) return null;
      St.Left -= 1;
      const M = await this.AiTry(Who, A, Know, Seed);
      if (!M) continue;
      if (M.Ended) {
        if (M.Winner === Who) return A;
        continue;
      }
      if (Depth > 1 && await M.AiKillDfs(Who, Depth - 1, St, true, M.Rng.State())) return A;
    }
    return null;
  }

  // the actions that can bring the enemy player down this turn (hits on the player first)
  AiAggro(Who) {
    const Face = [], Rest = [];
    for (const A of this.Actions(Who)) {
      if (A.Kind === 2 || A.Kind === 6) {
        if (A.Dst.Col < 0) Face.push(A);
        else {
          const T = this.MonAt(1 - Who, A.Dst.Col);
          if (T && T.Taunt) Rest.push(A);
        }
      } else if (A.Kind === 4 || A.Kind === 7) Rest.push(A);
      else if (A.Kind === 1) {
        const H = At(this.S(Who).Hand, A.Src);
        if (H && (H.Def.IsSpell || H.Def.Haste || H.GotKw === KwHaste || H.Def.Cry.K !== fx_kind.None)) Rest.push(A);
      }
    }
    return [...Face, ...Rest];
  }

  async NpcTurn(Who) {
    await this.Wait(0.6);
    let Steps = 0;
    for (;;) {
      if (this.Ended || Steps > 30) break;
      let A = null;
      try {
        A = await this.AiNext(Who);
      } catch (e) {
        // (the look-ahead must never stop a match: the classic choice instead)
        console.error('AI failed', e);
        A = this.BestAct(Who);
      }
      if (A) {
        await this.Exec(Who, A);
        Steps += 1;
        await this.Wait(0.55);
      } else {
        break;
      }
    }
    await this.Wait(0.4);
  }

  // ------------------------------------------------------------ whole match
  // (Decide: the cards a player sends back)
  async MullFor(Who) {
    const Cards = this.S(Who).Hand.map(H => H.Def);
    if (this.Human(Who)) {
      const R = await this.Decide(Who, async () => await this.ViewOf(Who).Mulligan(Cards, this.MullSeconds), Cards.map(() => false));
      return Array.isArray(R) ? Cards.map((D, I) => !!R[I]) : Cards.map(() => false);
    }
    if (this.S(Who).AiLevel >= 1) return this.AiMull(Cards);
    return Cards.map(D => D.Cost >= 5);
  }

  // 上級+: expensive cards go back; one 4 cost card stays when there is something cheap to play before it
  AiMull(Cards) {
    const Cheap = Cards.filter(D => D.Cost <= 3);
    const Fours = [];
    Cards.forEach((D, I) => { if (D.Cost === 4) Fours.push(I); });
    const KeepFour = (Cheap.length > 0 && Fours.length > 0) ? Fours[0] : -1;
    return Cards.map((D, I) => {
      if (D.Cost >= 5) return true;
      else if (D.Cost === 4 && I !== KeepFour) return true;
      return false;
    });
  }

  async Run() {
    for (const [W, V] of this.Vs()) V.Bind(this, W);
    spawn(() => this.RefreshLoop());
    // the tutorial: the decks stay in order, the player goes first and can't evolve
    if (!this.Tut) {
      this.Me.Deck = this.Rng.Shuffle(this.Me.Deck);
      this.Foe.Deck = this.Rng.Shuffle(this.Foe.Deck);
      this.Snd(SfxShuffle);
    }
    this.First = this.Tut ? 0 : (this.Rng.Int(0, 1) === 0 ? 0 : 1);
    this.S(this.First).EvoLeft = CardEvoFirst;
    this.S(1 - this.First).EvoLeft = CardEvoSecond;
    if (this.Tut) this.Me.EvoLeft = 0;
    for (const [, V] of this.Vs()) V.TutShow(!!this.Tut);
    for (const [, V] of this.Vs()) V.ClearLog();
    this.Refresh();
    for (const [W, V] of this.Vs()) V.Banner(TxVs(this.S(W).HName(), this.S(1 - W).HName()));
    await this.Wait(1.3);
    // a coin toss shows who goes first (every player sees the same toss from their own side)
    if (!this.Tut && !this.AutoPlay) {
      for (const [W, V] of this.Vs()) {
        const MeFirst = W === this.First;
        spawn(() => V.CoinToss(MeFirst));
      }
      await this.Wait(4.6);
    }
    this.Log(TlStart);
    // opening hands are dealt from the decks
    for (let K = 1; K <= (this.Tut ? 1 : 4); K++) {
      await this.Draw(0);
      await this.Draw(1);
    }
    for (const [W, V] of this.Vs()) {
      V.Say(this.First === W ? TnFirst : TnSecond);
      V.Toast(this.First === W ? TxYouFirst : TxYouSecond, 2.0);
    }
    await this.Wait(1.2);
    // mulligan (both players at the same time; none in the tutorial)
    if (!this.Tut) {
      const Swaps = await Race(Promise.all([this.MullFor(0), this.MullFor(1)]), this.EndP.then(() => null));
      for (const [, V] of this.Vs()) V.Layer(V.MullSlot, false);
      if (Swaps && !this.Ended) {
        // both players see the swapped cards go back into the deck and the new ones being drawn
        const SwapOf = [Swaps[0], Swaps[1]];
        await this.MullShow(this.First, At(SwapOf, this.First) ?? []);
        await this.MullShow(1 - this.First, At(SwapOf, 1 - this.First) ?? []);
      }
    }
    this.Refresh();
    this.Current = this.First;
    for (;;) {
      if (this.Ended) break;
      await this.StartTurn(this.Current);
      if (this.Ended) break;
      await this.TakeTurn(this.Current);
      if (this.Ended) break;
      await this.EndTurn(this.Current);
      if (this.Ended) break;
      this.Current = 1 - this.Current;
    }
    this.EndNow();
    this.Busy = false;
    this.RefreshNow();
    for (const [, V] of this.Vs()) V.TutShow(false);
    this.Finished = true;
    for (const [W, V] of this.Vs()) spawn(() => V.FxMatchEnd(this.Winner === W ? 1 : this.Winner < 0 ? 0 : -1, this.Reason === EndHp));
    await this.Wait(this.Reason === EndHp ? 2.0 : 1.4);
    return this.Winner;
  }

  // the mulligan of side W with its animation
  async MullShow(W, Swap) {
    const A = this.S(W);
    const Back = [];
    Swap.forEach((Sw, I) => { if (Sw) Back.push(I); });
    if (Back.length === 0) {
      this.LogBoth(W, TlMullNone(TxYou), TlMullNone(TxOpponent));
      return;
    }
    this.LogBoth(W, TlMulled(TxYou, Back.length), TlMulled(TxOpponent, Back.length));
    const V0 = At(this.Views, 1 - W);
    if (V0) V0.Toast(TlMulled(TxOpponent, Back.length), 1.5);
    const N0 = A.Hand.length;
    for (const Idx of Back) {
      for (const [X, V] of this.Vs()) spawn(() => V.FxReturn(X === W ? 0 : 1, Idx, N0));
      await this.Wait(0.28);
    }
    await this.Wait(0.2);
    const Keep = A.Hand.filter((H, I) => !Back.includes(I));
    const Returned = Back.map(I => At(A.Hand, I)).filter(H => H !== undefined).map(H => H.Def);
    const Pool = this.Rng.Shuffle([...A.Deck, ...Returned]);
    this.Snd(SfxShuffle);
    let New = [];
    let Rest = [];
    for (const D of Pool) {
      if (New.length < Returned.length && !Returned.includes(D)) New = [...New, D]; else Rest = [...Rest, D];
    }
    A.Deck = this.Rng.Shuffle(Rest);
    A.Hand = Keep;
    this.RefreshNow();
    for (const D of New) {
      await this.DrawFx(W, A.Hand.length, A.Hand.length + 1);
      A.Hand = [...A.Hand, MakeHandCard(D)];
      this.Refresh();
    }
    await this.Wait(0.3);
  }

  Mull(Sd, Swap) {
    let Keep = [];
    let Back = [];
    Sd.Hand.forEach((H, I) => { if (At(Swap, I)) Back = [...Back, H.Def]; else Keep = [...Keep, H]; });
    if (Back.length === 0) return;
    const Pool = this.Rng.Shuffle([...Sd.Deck, ...Back]);
    let NewHand = Keep;
    let Rest = [];
    let Need = Back.length;
    for (const D of Pool) {
      if (Need > 0 && !Back.includes(D)) {
        NewHand = [...NewHand, MakeHandCard(D)];
        Need -= 1;
      } else {
        Rest = [...Rest, D];
      }
    }
    Sd.Hand = NewHand;
    Sd.Deck = this.Rng.Shuffle(Rest);
  }
}

// ---------------------------------------------------------------- texts of the match
const TxYourTurn = "あなたのターン";
const TxTheirTurn = "相手のターン";
function TxVs(A, B) { return `${A}  VS  ${B}`; }
const TxYouFirst = "あなたが先攻です";
const TxYouSecond = "あなたは後攻です";
const TlStart = "バトル開始！";
function TlCardOf(N) { return `${N}のカード`; }
// the big card in the middle (Cast)
const TlCastSpell = "スペル発動！";
const TlCastMon = "召喚！";
function TlFoeCastSpell(N) { return `${N}のスペル！`; }
function TlFoeCastMon(N) { return `${N}の召喚！`; }
// 効果の演出 (FxShow): what set the effect off
const TlShowCry = "叫び！";
const TlShowDeath = "破壊時！";
const TlShowStart = "ターン開始時！";
const TlShowEnd = "ターン終了時！";
const TlShowAttack = "攻撃時！";
const TlShowKill = "撃破！";
const TlShowCount = "カウント0！";
const TlShowTick = "カウントダウン！";
const TlShowHeal = "回復に反応！";
const TlShowEvo = "進化時！";
const TlShowAlly = "仲間に効果！";
function TlFoeFx(L) { return `相手の${L}`; }
function FxShowName(Kind) {
  if (Kind === FxShowCry) return TlShowCry; else if (Kind === FxShowDeath) return TlShowDeath; else if (Kind === FxShowStart) return TlShowStart;
  else if (Kind === FxShowEnd) return TlShowEnd; else if (Kind === FxShowAttack) return TlShowAttack; else if (Kind === FxShowKill) return TlShowKill;
  else if (Kind === FxShowCount) return TlShowCount; else if (Kind === FxShowTick) return TlShowTick; else if (Kind === FxShowHeal) return TlShowHeal;
  else if (Kind === FxShowEvo) return TlShowEvo;
  return TlShowAlly;
}
// メデューサ / 効果消滅 / どちらかを選ぶ
function TlSpellLock(W) { return `${W}は次のターン、スペルを使えない！`; }
const TlSpellLockPop = "スペル封印";
const TlDiscardPop = "捨てる";
const TlSpellLockedMe = "スペル封印中！このターンはスペルを使えない";
const TlSpellLockedFoe = "相手はこのターン、スペルを使えない";
function TlSilenced(C, W) { return `${W}の${C}の効果が消滅した！`; }
const TnChooseFx = "発動する効果をえらんでね";
function TlChose(W, C) { return `${W}は「${C}」をえらんだ`; }
function TlSummon(W, C) { return `${W}は${C}を召喚`; }
function TlSummoned(C) { return `${C}を召喚！`; }
function TlCast(W, C) { return `${W}は${C}を使った`; }
function TlHandFull(W, C) { return `${W}の手札がいっぱい！${C}は消えた`; }
function TlBurnt(W, C) { return `${W}の手札がいっぱい！${C}は捨てられた`; }
function TlFatigue(W, N) { return `${W}の山札が切れた！${N}ダメージ`; }
function TlVanished(C) { return `${C}は消えてしまった`; }
function TlHandKw(W, C, K) { return `${W}の手札の${C}は「${K}」を得た`; }
function TlArtifactDeck(W, N) { return `${W}の山札がアーティファクト${N}枚になった！`; }
const TlArtifactDeckToast = "アーティファクトデッキ！";
function TlHeroEndSummon(W, C) { return `${W}のリーダーは、ターン終了時に${C}を召喚する力を得た`; }
const TlHeroEndSummonPop = "冥府の力";
function TlBounced(C, W) { return `${C}は${W}の手札に戻った`; }
function TlFrozen(C) { return `${C}は凍りついた！`; }
function TlKilled(C) { return `${C}は闇に飲まれた…`; }
function TlGotKw(C, K) { return `${C}に「${K}」がついた！`; }
function TlFromGrave(W, C) { return `${W}は墓地から${C}を手札に加えた`; }
function TlRevived(W, C) { return `${W}は墓地から${C}をよみがえらせた`; }
const TlNoRevive = "よみがえらせるモンスターがいなかった";
function TlTutor(W) { return `${W}は山札からカードを1枚手札に加えた`; }
function TlDiscount(W, N) { return `${W}の手札のマナが${N}下がった`; }
function TlDiscard(W, C) { return `${W}は${C}を捨てた`; }
function TlDestroyed(C) { return `${C}は破壊された`; }
function TlDeathFx(C) { return `${C}の破壊時効果！`; }
function TlAttackFx(C) { return `${C}の攻撃時効果！`; }
function TlStartFx(C) { return `${C}のターン開始時効果！`; }
function TlEndFx(C) { return `${C}のターン終了時効果！`; }
function TlCountFx(C) { return `${C}のカウントダウン！`; }
function TlSurrender(W) { return `${W}は降参した`; }
function TlAttackHero(C, W) { return `${C}が${W}を攻撃！`; }
function TlAttackUnit(A, B) { return `${A}が${B}を攻撃！`; }
function TlHeroHits(W) { return `${W}が直接攻撃！`; }
function TlMoved(C) { return `${C}が移動した`; }
function TlJewel(W, J) { return `${W}のジュエル：${J}`; }
function TlEvolve(W, C) { return `${W}は${C}を進化させた`; }
function TlEvolved(C) { return `${C}が進化！`; }
const TlEvoReady = "進化可能！";
function TlManaBonus(N) { return `追加マナ+${N}！`; }
function TlManaNext(W, N) { return `${W}は次のターン、マナが${N}増える`; }
function TlFuse(C) { return `合体！${C}！`; }
function TlKillFx(C) { return `${C}の効果！`; }
const TnPickSecond = "手札に戻すモンスターをもう1体選んでね。";
function TlMulled(W, N) { return `${W}は${N}枚交換した`; }
function TlMullNone(W) { return `${W}は手札を交換しなかった`; }
function TlCountDown(N) { return `カウント${N}`; }
const TlFailed = "失敗";
function TlKwFailed(C, K) { return `${C}には「${K}」を付与できなかった`; }
function TlDevoured(C) { return `${C}は食べられてしまった`; }
function TlPickDiscount(W, C, N) { return `${W}は${C}のマナを${N}下げた`; }
function TnPickHand(N) { return `マナを${N}下げるカードを手札から選んでね。`; }
function TnAmulet(C) { return `${C}はアミュレット。攻撃や移動はできないよ。`; }
function TlManaUp(N) { return `マナ+${N}`; }
function TlShieldUp(N) { return `シールド+${N}`; }
const TlShielded = "シールド";
const TlBarrierGone = "バリア！";
function TlTimeLeft(N) { return `残り ${N}秒`; }
function TnStampWait(N) { return `スタンプはあと${N}秒で使えるよ`; }
const StampCooldown = 5.0;
function TlTimeUp(W) { return `${W}の持ち時間が切れた`; }
const TnYourTurn = "あなたのターン！光っているカードやモンスターを選んで行動しよう。";
const TnWaitPvp = "相手のターン…。盤面のカードにカーソルを合わせると詳しく見られるよ。";
function TnWaitCpu(N) { return `${N}のターン…。どんな手で来るかな？`; }
const TnCancel = "選択をキャンセルしたよ。";
const TnTimeUp = "時間切れ！ターンを終了したよ。";
const TnCryTarget = "叫びの効果の対象を選んでね。（キャンセルで取り消し）";
const TnEvoTarget = "進化時の効果の対象を選んでね。（キャンセルで取り消し）";
function TnNoMana(C, N) { return `マナが足りないよ。${C}にはマナが${N}必要。`; }
function TnUseAgain(C) { return `${C}：もう一度選ぶと使うよ。`; }
function TnSpellTarget(C) { return `${C}の対象を選んでね。`; }
function TnSummonSlot(C) { return `${C}を召喚するマス（青く光るマス）を選んでね。`; }
const TnNoTarget = "対象がいないから使えないよ。";
const TnNoSlot = "空いているマスがないよ。";
function TnUnitAct(C) { return `${C}：攻撃する相手（赤）か、移動するマス（青）を選んでね。`; }
function TnUnitRush(C) { return `${C}：特攻！召喚したターンは敵モンスターにだけ攻撃できるよ。`; }
function TnUnitEvo(C) { return `${C}：行動を選ぶか、「進化」ボタンで進化できるよ。`; }
const TnJustSummoned = "召喚したばかりのモンスターは次のターンから行動できるよ。";
function TnUnitDone(C) { return `${C}は今は行動できないよ。`; }
const TnHeroAttack = "あなた自身で攻撃！攻撃する相手を選んでね。";
const TnHeroNoAtk = "攻撃力があるとき、あなた自身も攻撃できるよ。";
function TnJewelSlot(J) { return `${J}：召喚するマスを選んでね。`; }
function TnJewelFoe(J) { return `${J}：ねらう敵モンスターを選んでね。`; }
function TnJewelAlly(J) { return `${J}：味方モンスターを選んでね。`; }
function TnJewelSelf(J) { return `${J}：もう一度選ぶと発動するよ。`; }
const TnJewelUsed = "ジュエルは1ターンに1回までだよ。";
function TnJewelMana(N) { return `ジュエルにはマナが${N}必要だよ。`; }
const TnJewelNone = "今はジュエルを使える相手やマスがないみたい。";
const TnEvoHow = "進化させたい自分のモンスターを選んでから「進化」を押してね。1ターンに1回、進化ポイントを使うよ。";
const TnFoeUnit = "相手のモンスターだね。右に詳しく表示されているよ。";
const TnNothingLeft = "もうできることはなさそう。「ターン終了」を押してね。";
const TnGoodJob = "いい調子！光っているものはまだ行動できるよ。";
function TlManaDown(N) { return `マナ-${N}`; }
const TlArmored = "軽減";
function TlFromDeck(W, C) { return `${W}は山札から${C}を召喚した`; }
function TlToDeck(W, C) { return `${W}の手札のカード${C}が山札に戻された`; }
const TlGraveEmpty = "墓地にカードがなかった";
function TlRecur(W, C) { return `${C}は${W}の手札に戻った`; }
const TnPickGrave = "手札に加えるカードを墓地から選んでね。";
function TnPickRevive(N) { return `召喚するモンスター（マナ${N}以下）を墓地から選んでね。`; }
function TnPickFill(N) { return `召喚するモンスターを墓地から選んでね（残りマナ${N}まで）。「終了」でやめる。`; }
const TbAuto = "おまかせ";
const TbFillStop = "終了";
const TnTimeUpBonus = "時間切れ！ターンを終了したよ。（初回なので次のターンは60秒もらえるよ）";
const TnFirst = "あなたが先攻！まずは手札を確認してね。進化ポイントは2回分。";
const TnSecond = "あなたは後攻。そのかわり進化ポイントが3回分あるよ。";
