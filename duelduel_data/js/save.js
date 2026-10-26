// save.js — card_save.verse: the persistent player data (coins, gems, level, stats, cards, card backs, decks, costumes,
// daily quests, secret codes, one-time gifts, login days, hour bonus ...), ported 1:1.
//
// Changed for the browser:
// - Verse kept a persistable weak_map(player, card_save). Here there is ONE local player per browser: the save is JSON in
//   localStorage under `dd_save_<P.Id>` (P.Id = the device id made once by manager.js, localStorage `dd_device`).
//   It is written on every CardCommit (the only place Verse wrote the map). Loading fills every missing / broken field
//   with its default (older saves). When localStorage can't be used (private mode, quota) the save lives in memory.
// - The 12-digit PlayerNo shown on the profile IS the device id (CardCheckLogin sets it), so the save is tied to it.
//   (A random number is only used when the device id is not a number.)
// - GetSecondsSinceEpoch() = Date.now() / 1000 (UTC seconds); the JST day logic is unchanged.
// - Tuples are arrays ([From, To, LC, LG] ...), options are value-or-null.
// - Helper names that are not Verse names start with `Sv`.
'use strict';

// ---------------------------------------------------------------- the saved fields (name, default) — never remove / retype
// (Verse: once published, never remove fields or change their types; adding fields with defaults is fine)
const SvFields = [
  ['Coins', 0], ['Gems', 0], ['Xp', 0],
  ['Level', 1],               // the highest level whose reward was given
  ['Fav', 0],                 // the chosen character
  ['CpuWins', 0], ['CpuLosses', 0], ['PvpWins', 0], ['PvpLosses', 0], ['Matches', 0], ['Summons', 0],
  ['LoginDays', 0],           // days the player came to the island
  ['LastLoginDay', -1],
  ['LoginClaimed', 0],        // login bonuses received (the next one is DAY LoginClaimed + 1)
  ['LoginBonusDay', -1],      // the day the last login bonus was received
  ['QuestDay', -1],           // the day the quest counters below belong to
  ['QCpuWin', 0], ['QPvpWin', 0], ['QMatches', 0], ['QSummons', 0], ['QJewels', 0],
  ['QuestClaimed', []],
  ['Owned', []],              // how many copies of each card (index = card id)
  ['Backs', [0]],             // the card back designs the player has
  ['Back', 0],                // the card back in use
  ['Packs', 0],               // packs opened
  ['Codes', []],              // the secret codes already used (index in CardCodes)
  ['QPlayMin', 0],            // today's minutes on the island
  ['QPacks', 0],              // packs opened today
  ['QGemsUsed', 0],           // gems spent today
  ['Shards', 0],              // カケラ (spare cards turned into shards; shards make cards)
  ['HourAt', 0],              // when the last hour bonus was received (seconds since 1970)
  ['HourCount', 0],           // hour bonuses received
  ['Tutorial', 0],            // 0 the tutorial was never offered, 1 offered (declined / quit), 2 completed
  ['PlayerNo', 0],            // the 12-digit player ID shown on the profile (= the device id here)
  ['Tickets', 0],             // ガチャチケット (1 ticket = 1 pack)
  ['Prem', []],               // プレミア level of every card (index = card id): 0 none, 1, 2
  ['Decks', []],              // the decks the player built (up to CardMaxDecks) — card_deck objects
  ['DeckSel', 0],             // the deck used last
  ['Skins', []],              // the costumes the player has (skin ids, card_data CardSkins)
  ['HeroSkin', []],           // the costume every character wears (index = hero id, 0 = the default look)
  ['Gifts', 0],               // one-time gifts already given (bits: 1 the v14 starter deck, 2 the special player's items)
  ['GemsBought', 0],          // gems bought with V-Bucks (all time)
  ['RandStreak', 0],          // wins in a row in 野良対戦-通常 (now)
  ['RandBest', 0],            // the best streak in 野良対戦-通常
  ['PickWins', 0],            // 2Pick wins (CPU and players)
  ['HeroWins', []],           // wins with every character (index = hero id)
  ['AchClaimed', []],         // achievements whose reward was received (index in CardAchs)
  ['Titles', []],             // the titles the player has (index in CardTitles)
  ['Badges', []],             // the badges the player has (index in CardBadges)
  ['TitleSel', -1],           // the title shown with the name (-1 none)
  ['BadgeSel', []],           // the 3 badges shown (-1 empty)
  ['TicketsE', 0],            // エピック以上確定ガチャチケット (the last card of the pack: epic 85% / legend 15%)
  ['TicketsL', 0],            // レジェンド以上確定ガチャチケット (the last card of the pack is a legend)
  ['LoginNo', 0],             // login bonus days received (v18 login bonus; the next one is day LoginNo + 1)
  ['LoginAt', -1],            // the day (CardToday) the last login bonus was received
  ['Season', 0],              // the season the quest reward pass fields below belong to (card_pass)
  ['PassPts', 0],             // quest points of this season
  ['PassFree', []],           // pass tiers whose free reward was received
  ['PassPrem', []],           // pass tiers whose premium reward was received
  ['PassOwned', false],       // the premium pass of this season was unlocked
  ['BossWins', 0],            // wins against the 最恐 CPU
  ['QBossWin', 0],            // today's wins against the 最恐 CPU
];

// one deck of the deck builder: the character and the card ids (40)
class card_deck {
  constructor(o = {}) {
    this.Hero = o.Hero ?? 0;
    this.Cards = o.Cards ?? [];
    this.Icon = o.Icon ?? -1;   // the card shown on the deck list (-1: the character)
  }
}

// copies of the values (arrays are values in Verse: a copy never shares them)
function SvCopyValue(K, V) {
  if (K === 'Decks') return V.map(D => new card_deck({ Hero: D.Hero, Cards: D.Cards.slice(), Icon: D.Icon }));
  return Array.isArray(V) ? V.slice() : V;
}

class card_save {
  constructor(o = {}) {
    this.Version = o.Version ?? 1;
    for (const [K, D] of SvFields) this[K] = SvCopyValue(K, o[K] !== undefined ? o[K] : D);
  }
}

// a copy that can be changed: CardEdit -> change -> CardCommit
class card_save_edit {
  constructor(o = {}) {
    for (const [K, D] of SvFields) this[K] = SvCopyValue(K, o[K] !== undefined ? o[K] : D);
  }
}

// ---------------------------------------------------------------- storage (localStorage, memory when it can't be used)
const CardSaveMap = new Map();      // device id -> card_save (the loaded / committed save)
const SvMemStore = {};              // key -> JSON (fallback when localStorage throws)

function SvId(P) { return String(P && P.Id != null ? P.Id : 'local'); }
function SvKey(Id) { return 'dd_save_' + Id; }

function SvRead(Key) {
  let S = null;
  try { S = window.localStorage.getItem(Key); } catch (e) { S = null; }
  if (S == null && Object.prototype.hasOwnProperty.call(SvMemStore, Key)) S = SvMemStore[Key];
  return S;
}
function SvWrite(Key, Json) {
  SvMemStore[Key] = Json;
  try { window.localStorage.setItem(Key, Json); } catch (e) { /* private mode / full: kept in memory */ }
}

// a saved value of the default's type (else the default)
function SvInt(V, D) { return (typeof V === 'number' && Number.isFinite(V)) ? Math.trunc(V) : D; }
function SvInts(V, D) { return Array.isArray(V) ? V.map(X => SvInt(X, 0)) : D.slice(); }
function SvFromJson(O) {
  const S = new card_save();
  if (!O || typeof O !== 'object') return S;
  S.Version = SvInt(O.Version, 1);
  for (const [K, D] of SvFields) {
    const V = O[K];
    if (K === 'Decks') {
      S.Decks = Array.isArray(V) ? V.filter(X => X && typeof X === 'object').map(X => new card_deck({ Hero: SvInt(X.Hero, 0), Cards: SvInts(X.Cards, []), Icon: SvInt(X.Icon, -1) })) : [];
    } else if (Array.isArray(D)) S[K] = SvInts(V, D);
    else if (typeof D === 'boolean') S[K] = typeof V === 'boolean' ? V : D;
    else S[K] = SvInt(V, D);
  }
  return S;
}

function SvLoad(Id) {
  const J = SvRead(SvKey(Id));
  if (J == null) return null;
  try { return SvFromJson(JSON.parse(J)); } catch (e) { console.warn('save: broken save data, starting again', e); return null; }
}

// another tab of the same browser wrote the save: read it again next time
try {
  window.addEventListener('storage', e => {
    if (e.key && e.key.indexOf('dd_save_') === 0) CardSaveMap.delete(e.key.slice(8));
  });
} catch (e) { }

function GetCardSave(P) {
  const Id = SvId(P);
  let S = CardSaveMap.get(Id);
  if (!S) {
    S = SvLoad(Id) || new card_save();
    CardSaveMap.set(Id, S);
  }
  return S;
}

function CardEdit(P) {
  const S = GetCardSave(P);
  const E = new card_save_edit(S);
  CardQuestRefresh(E);
  CardPassRefresh(E);
  return E;
}

function CardCommit(P, E) {
  const Old = GetCardSave(P);
  const New = new card_save(E);
  New.Version = Old.Version;
  const Id = SvId(P);
  CardSaveMap.set(Id, New);
  SvWrite(SvKey(Id), JSON.stringify(New));
}

// ---------------------------------------------------------------- days (Japan time, the day changes at 0:00)
const CardUtcOffsetHours = 9.0;

function GetSecondsSinceEpoch() { return Date.now() / 1000; }

function CardToday() {
  return Math.floor((GetSecondsSinceEpoch() + CardUtcOffsetHours * 3600.0) / 86400.0);
}

function CardSecondsUntilReset() {
  const Sec = GetSecondsSinceEpoch() + CardUtcOffsetHours * 3600.0;
  const Next = (CardToday() + 1) * 86400.0;
  return Max(Int(Next - Sec), 0);
}

function TxHms2(H, M, S) { return `${H}時間${M}分${S}秒`; }

function CardHms(Seconds) {
  const H = Quotient(Seconds, 3600);
  const M = Mod(Quotient(Seconds, 60), 60);
  const S = Mod(Seconds, 60);
  return TxHms2(H, M, S);
}

// the device id as the 12-digit number (0 when it is not a number)
function SvDeviceNo(P) {
  const D = String(P && P.Id != null ? P.Id : '').replace(/\D/g, '');
  const N = D.length > 0 && D.length <= 15 ? parseInt(D, 10) : 0;
  return Number.isFinite(N) && N > 0 ? N : 0;
}

// called when the player enters the island: counts the login days
function CardCheckLogin(P) {
  const E = CardEdit(P);
  // the player ID (shown as xxxx-xxxx-xxxx on the profile) is the device id
  const No = SvDeviceNo(P);
  if (No > 0 ? E.PlayerNo !== No : E.PlayerNo <= 0) {
    E.PlayerNo = No > 0 ? No : GetRandomInt(100000000000, 999999999999);
    CardCommit(P, E);
  }
  const Today = CardToday();
  if (E.LastLoginDay === Today) return;
  E.LastLoginDay = Today;
  E.LoginDays += 1;
  CardCommit(P, E);
}

// the player ID as xxxx-xxxx-xxxx (12 digits, zeros kept)
function CardPad4(N) {
  return N < 10 ? `000${N}` : N < 100 ? `00${N}` : N < 1000 ? `0${N}` : `${N}`;
}

function CardPlayerIdText(No) {
  const A = Mod(Quotient(No, 100000000), 10000);
  const B = Mod(Quotient(No, 10000), 10000);
  const C = Mod(No, 10000);
  return `${CardPad4(A)}-${CardPad4(B)}-${CardPad4(C)}`;
}

// ---------------------------------------------------------------- level
function CardXpForNext(Level) { return 100 + 50 * (Level - 1); }

class card_level {
  constructor(o = {}) { this.Level = o.Level; this.Into = o.Into; this.Need = o.Need; }
}

function CardLevelOf(Xp) {
  let Level = 1;
  let Rest = Xp;
  for (;;) {
    const Need = CardXpForNext(Level);
    if (Rest < Need || Level >= 999) break;
    Rest -= Need;
    Level += 1;
  }
  return new card_level({ Level: Level, Into: Rest, Need: CardXpForNext(Level) });
}

// the reward for reaching level L
function CardLevelCoins(L) { return 100 + 20 * L; }
function CardLevelGems(L) { return Mod(L, 5) === 0 ? 20 : 0; }

// what a player got (shown on the result / claim screens)
class card_gain {
  constructor(o = {}) {
    this.Coins = o.Coins ?? 0;
    this.Gems = o.Gems ?? 0;
    this.Xp = o.Xp ?? 0;
    this.LevelFrom = o.LevelFrom ?? 1;
    this.LevelTo = o.LevelTo ?? 1;
    this.LevelCoins = o.LevelCoins ?? 0;
    this.LevelGems = o.LevelGems ?? 0;
    this.Tickets = o.Tickets ?? 0;
    this.TicketsE = o.TicketsE ?? 0;
    this.TicketsL = o.TicketsL ?? 0;
    this.Pts = o.Pts ?? 0;           // quest points (the reward pass)
  }
}

// adds the experience and pays the level-up rewards (the caller commits E): [From, To, LevelCoins, LevelGems]
function CardAddXp(E, Xp) {
  const From = CardLevelOf(E.Xp).Level;
  E.Xp += Max(0, Xp);
  const To = CardLevelOf(E.Xp).Level;
  let LC = 0;
  let LG = 0;
  if (To > E.Level) {
    for (let L = E.Level + 1; L <= To; L++) {
      LC += CardLevelCoins(L);
      LG += CardLevelGems(L);
    }
    E.Level = To;
    E.Coins += LC;
    E.Gems += LG;
  }
  return [From, To, LC, LG];
}

// ---------------------------------------------------------------- daily quests
// Chain: the quest line it belongs to (one row on the screen); a line shows its first tier that was not claimed yet.
// Stat: what is counted (0 CPU wins, 1 PvP wins, 2 matches, 3 summons, 4 jewels, 5 minutes played, 6 packs, 7 gems spent)
class card_quest {
  constructor(o = {}) {
    this.Name = o.Name;
    this.Chain = o.Chain;
    this.Stat = o.Stat;
    this.Need = o.Need;
    this.Coins = o.Coins ?? 0;
    this.Gems = o.Gems ?? 0;
    this.Xp = o.Xp ?? 0;
    this.Pts = o.Pts ?? 0;      // pass points (0: CardQuestPts of the tier)
  }
}

// the pass points quest I gives
function CardQuestPtsOf(I) {
  const Q = At(CardQuests, I);
  return (Q && Q.Pts > 0) ? Q.Pts : CardQuestPts(CardQuestTier(I)[0]);
}

const TqBoss1 = "CPUの強さ「最恐」に勝利する";
const TqPlay1 = "1回対戦する（CPU戦もOK）";
const TqPlay5 = "5回対戦する（CPU戦もOK）";
const TqPlay10 = "10回対戦する（CPU戦もOK）";
const TqCpu1 = "CPU戦で1回勝つ";
const TqCpu5 = "CPU戦で5回勝つ";
const TqCpu10 = "CPU戦で10回勝つ";
const TqPvp1 = "プレイヤーに1回勝つ（野良・部屋）";
const TqPvp5 = "プレイヤーに5回勝つ（野良・部屋）";
const TqPvp10 = "プレイヤーに10回勝つ（野良・部屋）";
const TqTime10 = "10分プレイする";
const TqTime30 = "30分プレイする";
const TqTime60 = "60分プレイする";
const TqTime120 = "120分プレイする";
const TqPack1 = "カードパックを1パック開封する";
const TqPack5 = "カードパックを5パック開封する";
const TqPack10 = "カードパックを10パック開封する";
const TqGem100 = "ジェムを100個使う";
const TqGem500 = "ジェムを500個使う";
const TqGem1000 = "ジェムを1000個使う";

const CardQuestChains = 7;

const CardQuests = [
  new card_quest({ Name: TqPlay1, Chain: 0, Stat: 2, Need: 1, Coins: 50, Xp: 20 }),
  new card_quest({ Name: TqPlay5, Chain: 0, Stat: 2, Need: 5, Coins: 100, Xp: 40 }),
  new card_quest({ Name: TqPlay10, Chain: 0, Stat: 2, Need: 10, Coins: 150, Xp: 60 }),
  new card_quest({ Name: TqCpu1, Chain: 1, Stat: 0, Need: 1, Coins: 50, Xp: 30 }),
  new card_quest({ Name: TqCpu5, Chain: 1, Stat: 0, Need: 5, Coins: 100, Xp: 50 }),
  new card_quest({ Name: TqCpu10, Chain: 1, Stat: 0, Need: 10, Coins: 150, Xp: 80 }),
  new card_quest({ Name: TqPvp1, Chain: 2, Stat: 1, Need: 1, Coins: 100, Xp: 50 }),
  new card_quest({ Name: TqPvp5, Chain: 2, Stat: 1, Need: 5, Coins: 200, Xp: 80 }),
  new card_quest({ Name: TqPvp10, Chain: 2, Stat: 1, Need: 10, Coins: 300, Xp: 120 }),
  new card_quest({ Name: TqTime10, Chain: 3, Stat: 5, Need: 10, Coins: 50, Xp: 10 }),
  new card_quest({ Name: TqTime30, Chain: 3, Stat: 5, Need: 30, Coins: 150, Xp: 20 }),
  new card_quest({ Name: TqTime60, Chain: 3, Stat: 5, Need: 60, Coins: 300, Xp: 40 }),
  new card_quest({ Name: TqTime120, Chain: 3, Stat: 5, Need: 120, Gems: 10, Xp: 60 }),
  new card_quest({ Name: TqPack1, Chain: 4, Stat: 6, Need: 1, Coins: 50, Xp: 10 }),
  new card_quest({ Name: TqPack5, Chain: 4, Stat: 6, Need: 5, Coins: 150, Xp: 30 }),
  new card_quest({ Name: TqPack10, Chain: 4, Stat: 6, Need: 10, Coins: 300, Xp: 50 }),
  new card_quest({ Name: TqGem100, Chain: 5, Stat: 7, Need: 100, Coins: 100, Xp: 20 }),
  new card_quest({ Name: TqGem500, Chain: 5, Stat: 7, Need: 500, Coins: 300, Xp: 40 }),
  new card_quest({ Name: TqGem1000, Chain: 5, Stat: 7, Need: 1000, Coins: 500, Xp: 60 }),
  new card_quest({ Name: TqBoss1, Chain: 6, Stat: 8, Need: 1, Coins: 300, Xp: 100, Pts: 25 }),
];

// the quest a line shows now: its first tier that was not claimed (the last one when all were)
function CardChainCurrent(E, Chain) {
  let Last = 0;
  let Found = -1;
  CardQuests.forEach((Q, I) => {
    if (Q.Chain === Chain) {
      Last = I;
      if (Found < 0 && !E.QuestClaimed.includes(I)) Found = I;
    }
  });
  return Found >= 0 ? Found : Last;
}

// tier number (1..) and number of tiers of quest I in its line: [Tier, All]
function CardQuestTier(I) {
  let Tier = 0;
  let All = 0;
  const Q = At(CardQuests, I);
  if (Q) {
    CardQuests.forEach((O, J) => {
      if (O.Chain === Q.Chain) {
        All += 1;
        if (J <= I) Tier += 1;
      }
    });
  }
  return [Tier, All];
}

// called every minute while the player is on the island (the play time quests)
function CardAddPlayMinute(P) {
  const E = CardEdit(P);
  E.QPlayMin += 1;
  CardCommit(P, E);
}

// a new day: today's counters start again from 0
function CardQuestRefresh(E) {
  const Today = CardToday();
  if (E.QuestDay !== Today) {
    E.QuestDay = Today;
    E.QCpuWin = 0;
    E.QPvpWin = 0;
    E.QMatches = 0;
    E.QSummons = 0;
    E.QJewels = 0;
    E.QPlayMin = 0;
    E.QPacks = 0;
    E.QGemsUsed = 0;
    E.QBossWin = 0;
    E.QuestClaimed = [];
  }
}

function CardQuestValue(E, I) {
  const Q = At(CardQuests, I);
  const St = Q ? Q.Stat : 0;
  return St === 0 ? E.QCpuWin
    : St === 1 ? E.QPvpWin
    : St === 2 ? E.QMatches
    : St === 3 ? E.QSummons
    : St === 4 ? E.QJewels
    : St === 5 ? E.QPlayMin
    : St === 6 ? E.QPacks
    : St === 8 ? E.QBossWin
    : E.QGemsUsed;
}

// ---------------------------------------------------------------- secret codes (title → ひみつのコード)
// digits only, up to 8; once per player. The index in this array is saved: never remove or reorder entries.
class card_code {
  constructor(o = {}) {
    this.Digits = o.Digits;
    this.Coins = o.Coins ?? 0;
    this.Gems = o.Gems ?? 0;
    this.Tickets = o.Tickets ?? 0;
    this.TicketsE = o.TicketsE ?? 0;
    this.TicketsL = o.TicketsL ?? 0;
  }
}

const CardCodes = [
  new card_code({ Digits: [0, 7, 0, 8], Coins: 5000 }),
  new card_code({ Digits: [2, 0, 2, 6], Tickets: 10 }),
  new card_code({ Digits: [1, 2, 3, 4, 5], Tickets: 10 }),
  new card_code({ Digits: [5, 0, 5, 0], TicketsE: 1 }),
  new card_code({ Digits: [3, 1, 5, 2, 7, 3], TicketsL: 1 }),
];

// the island owner's own code (プレイヤーID CardVipNo only): 「0」 gives this every time it is entered
const CardVipCodeCoins = 1000;
const CardVipCodeGems = 1000;

function SvSameInts(A, B) {
  if (A.length !== B.length) return false;
  for (let I = 0; I < A.length; I++) if (A[I] !== B[I]) return false;
  return true;
}

// [0 wrong code / 1 already used / 2 accepted (the reward is in the gain) / 3 the premium pass was unlocked, card_gain]
function CardRedeemCode(P, Digits) {
  if (SvSameInts(Digits, [0])) {
    const V = CardEdit(P);
    if (V.PlayerNo !== CardVipNo) return [0, new card_gain()];
    V.Coins += CardVipCodeCoins;
    V.Gems += CardVipCodeGems;
    CardCommit(P, V);
    return [2, new card_gain({ Coins: CardVipCodeCoins, Gems: CardVipCodeGems })];
  }
  // 「1」: the special player unlocks the premium pass of the season (card_pass)
  if (SvSameInts(Digits, [1])) {
    const V = CardEdit(P);
    if (V.PlayerNo !== CardVipNo) return [0, new card_gain()];
    if (V.PassOwned) return [1, new card_gain()];
    V.PassOwned = true;
    CardCommit(P, V);
    return [3, new card_gain()];
  }
  let Found = -1;
  CardCodes.forEach((C, I) => { if (Found < 0 && SvSameInts(C.Digits, Digits)) Found = I; });
  if (Found < 0) return [0, new card_gain()];
  const E = CardEdit(P);
  if (E.Codes.includes(Found)) return [1, new card_gain()];
  const C = At(CardCodes, Found);
  if (C) {
    E.Codes = [...E.Codes, Found];
    E.Coins += C.Coins;
    E.Gems += C.Gems;
    E.Tickets += C.Tickets;
    E.TicketsE += C.TicketsE;
    E.TicketsL += C.TicketsL;
    CardCommit(P, E);
    return [2, new card_gain({ Coins: C.Coins, Gems: C.Gems, Tickets: C.Tickets, TicketsE: C.TicketsE, TicketsL: C.TicketsL })];
  }
  return [0, new card_gain()];
}

// 0 not yet, 1 can be claimed, 2 claimed
function CardQuestState(E, I) {
  if (E.QuestClaimed.includes(I)) return 2;
  const Q = At(CardQuests, I);
  if (Q && CardQuestValue(E, I) >= Q.Need) return 1;
  return 0;
}

function CardQuestClaimable(P) {
  const E = CardEdit(P);
  for (let C = 0; C <= CardQuestChains - 1; C++) {
    if (CardQuestState(E, CardChainCurrent(E, C)) === 1) return true;
  }
  // (a quest reward of the pass that can be received too)
  return CardPassClaimableE(E);
}

// card_gain, or null when it can't be claimed
function CardClaimQuest(P, I) {
  const E = CardEdit(P);
  const Q = At(CardQuests, I);
  if (CardQuestState(E, I) === 1 && Q) {
    E.QuestClaimed = [...E.QuestClaimed, I];
    E.Coins += Q.Coins;
    E.Gems += Q.Gems;
    // quest points for the reward pass: the higher the tier, the more points
    const Pts = CardQuestPtsOf(I);
    E.PassPts += Pts;
    const L = CardAddXp(E, Q.Xp);
    CardCommit(P, E);
    return new card_gain({ Coins: Q.Coins, Gems: Q.Gems, Xp: Q.Xp, LevelFrom: L[0], LevelTo: L[1], LevelCoins: L[2], LevelGems: L[3], Pts: Pts });
  }
  return null;
}

// every quest that can be claimed now (the next tiers too, when they are reached already); null = nothing to claim
function CardClaimAllQuests(P) {
  let G = new card_gain();
  let Got = 0;
  let From = -1;
  for (;;) {
    const E = CardEdit(P);
    let Next = -1;
    for (let C = 0; C <= CardQuestChains - 1; C++) {
      const I = CardChainCurrent(E, C);
      if (Next < 0 && CardQuestState(E, I) === 1) Next = I;
    }
    if (Next < 0 || Got >= 50) break;
    const One = CardClaimQuest(P, Next);
    if (One != null) {
      Got += 1;
      if (From < 0) From = One.LevelFrom;
      G = new card_gain({ Coins: G.Coins + One.Coins, Gems: G.Gems + One.Gems, Xp: G.Xp + One.Xp, LevelFrom: From, LevelTo: One.LevelTo,
        LevelCoins: G.LevelCoins + One.LevelCoins, LevelGems: G.LevelGems + One.LevelGems, Pts: G.Pts + One.Pts });
    } else {
      break;
    }
  }
  return Got > 0 ? G : null;
}

// ---------------------------------------------------------------- login bonus (7-day cycle, missed days don't reset it)
class card_login_reward {
  constructor(o = {}) { this.Coins = o.Coins ?? 0; this.Gems = o.Gems ?? 0; }
}

const CardLoginRewards = [
  new card_login_reward({ Coins: 300 }),
  new card_login_reward({ Gems: 10 }),
  new card_login_reward({ Coins: 500 }),
  new card_login_reward({ Coins: 300, Gems: 10 }),
  new card_login_reward({ Coins: 1000 }),
  new card_login_reward({ Coins: 500, Gems: 10 }),
  new card_login_reward({ Coins: 1500, Gems: 30 }),
];

function CardLoginClaimedToday(P) {
  return GetCardSave(P).LoginBonusDay === CardToday();
}

// the slot (0..6) that is claimable today, or was claimed today
function CardLoginSlot(P) {
  const S = GetCardSave(P);
  const Base = S.LoginBonusDay === CardToday() ? Max(0, S.LoginClaimed - 1) : S.LoginClaimed;
  return Mod(Base, 7);
}

function CardLoginCycle(P) {
  const S = GetCardSave(P);
  const Base = S.LoginBonusDay === CardToday() ? Max(0, S.LoginClaimed - 1) : S.LoginClaimed;
  return Quotient(Base, 7);
}

// card_gain, or null when it was received today already
function CardClaimLogin(P) {
  if (CardLoginClaimedToday(P)) return null;
  const E = CardEdit(P);
  const Slot = Mod(E.LoginClaimed, 7);
  const R = At(CardLoginRewards, Slot) ?? new card_login_reward();
  E.LoginClaimed += 1;
  E.LoginBonusDay = CardToday();
  E.Coins += R.Coins;
  E.Gems += R.Gems;
  CardCommit(P, E);
  return new card_gain({ Coins: R.Coins, Gems: R.Gems });
}

// ---------------------------------------------------------------- matches
// Won / Lost (both false = draw). Reason: EndHp = a real finish, otherwise surrender / a player left.
// Early: the match ended before the first player's first turn was over.
// a CPU win pays by the CPU's strength (初級 / 中級 / 上級 / 最恐), however long the match was: [coins, xp]
function CardCpuWinReward(AiLevel) {
  return AiLevel === CardAiNightmare ? [500, 250]
    : AiLevel === CardAiHard ? [350, 180]
    : AiLevel === CardAiMiddle ? [250, 130]
    : [150, 80];
}

function CardGiveMatch(P, Pvp, Won, Lost, Reason, Early, Rounds, Summons, Jewels, AiLevel = CardAiBeginner) {
  const E = CardEdit(P);
  let Coins = 0;
  let Xp = 0;
  const Real = Reason === EndHp;
  if (Won) {
    if (!Pvp) {
      [Coins, Xp] = CardCpuWinReward(AiLevel);
      if (AiLevel === CardAiNightmare) E.QBossWin += 1;
    } else if (Real) {
      // a real win pays the most, however long the match was
      Coins = 450;
      Xp = 150;
    } else if (Early) {
      Coins = 10;
      Xp = 5;
    } else {
      // the opponent gave up / left: the longer the match, the bigger the reward
      Coins = Min(Pvp ? 200 : 100, 20 + 15 * Rounds);
      Xp = Min(Pvp ? 100 : 50, 10 + 10 * Rounds);
    }
    if (Pvp) {
      E.PvpWins += 1;
      E.QPvpWin += 1;
    } else {
      E.CpuWins += 1;
      E.QCpuWin += 1;
    }
  } else {
    if (Real) {
      Coins = Pvp ? 80 : 40;
      Xp = Pvp ? 60 : 30;
    } else if (!Early) {
      Coins = Min(40, 4 * Rounds);
      Xp = Min(30, 3 * Rounds);
    }
    if (Lost) {
      if (Pvp) E.PvpLosses += 1; else E.CpuLosses += 1;
    }
  }
  E.Matches += 1;
  E.QMatches += 1;
  E.Summons += Summons;
  E.QSummons += Summons;
  E.QJewels += Jewels;
  E.Coins += Coins;
  const L = CardAddXp(E, Xp);
  CardCommit(P, E);
  return new card_gain({ Coins: Coins, Xp: Xp, LevelFrom: L[0], LevelTo: L[1], LevelCoins: L[2], LevelGems: L[3] });
}

function CardSetFav(P, Id) {
  const E = CardEdit(P);
  E.Fav = Id;
  CardCommit(P, E);
}

// ---------------------------------------------------------------- tutorial (offered once to every player)
const CardTutorialCoins = 500;

function CardTutorialOffered(P) { return GetCardSave(P).Tutorial > 0; }

// the offer was seen (declined, or the tutorial was quit); a completed tutorial stays completed
function CardTutorialSeen(P) {
  const E = CardEdit(P);
  if (E.Tutorial < 1) E.Tutorial = 1;
  CardCommit(P, E);
}

// the tutorial was won: the reward is paid once
function CardTutorialDone(P) {
  const E = CardEdit(P);
  if (E.Tutorial >= 2) return new card_gain();
  E.Tutorial = 2;
  E.Coins += CardTutorialCoins;
  CardCommit(P, E);
  return new card_gain({ Coins: CardTutorialCoins });
}

// ---------------------------------------------------------------- cards, packs and card backs
function CardOwnedCount(P, Id) { return At(GetCardSave(P).Owned, Id) ?? 0; }

function CardOwnedKinds(P) {
  return GetCardSave(P).Owned.filter(C => C > 0).length;
}

function AddOwned(E, Id) {
  if (Id < 0) return;
  if (E.Owned.length <= Id) {
    const A = E.Owned.slice();
    while (A.length <= Id) A.push(0);
    E.Owned = A;
  }
  E.Owned[Id] = E.Owned[Id] + 1;
}

const PackSize = 5;
const PackCoin = 500;
const PackGem = 50;
const Pack10Coin = 4750;
const Pack10Gem = 450;

// one card of a pack: legend 1%, epic 5%, rare 29%, normal 65% (the same for every card of the pack)
function PackRarity(Last) {
  const X = GetRandomInt(1, 1000);
  return X <= 10 ? RarL : X <= 60 ? RarE : X <= 350 ? RarR : RarN;
}

function PackCard(DB, R) {
  const Cands = DB.filter(D => !D.Token && D.Rarity === R);
  return At(Cands, GetRandomInt(0, Cands.length - 1)) ?? At(DB, 0)
    ?? new card_def({ Id: 0, Name: TxEmpty, Cost: 0, Art: CardMon.f_slime, ArtW: 1.0, ArtH: 1.0 });
}

// how a pack is paid
const PayCoins = 0;
const PayGems = 1;
const PayTickets = 2;
const PayTicketsE = 3;     // エピック以上確定チケット: the last card is epic (85%) or legend (15%)
const PayTicketsL = 4;     // レジェンド以上確定チケット: the last card is a legend

// the last card of a pack opened with a special ticket
function PackRarityLast(Pay) {
  if (Pay === PayTicketsL) return RarL;
  if (GetRandomInt(1, 100) <= 15) return RarL;
  return RarE;
}

// the price of N packs (1 or 10): coins / gems, or 1 ticket per pack
function PackPrice(N, Pay) {
  if (Pay === PayTickets || Pay === PayTicketsE || Pay === PayTicketsL) return N;
  if (Pay === PayGems) return N >= 10 ? Pack10Gem : PackGem;
  return N >= 10 ? Pack10Coin : PackCoin;
}

// pays and opens N packs (1 or 10): the cards, or null when the player can't pay
function CardBuyPacks(P, DB, N, Pay) {
  const E = CardEdit(P);
  const Price = PackPrice(N, Pay);
  if (Pay === PayTickets) {
    if (E.Tickets < Price) return null;
    E.Tickets -= Price;
  } else if (Pay === PayTicketsE) {
    if (E.TicketsE < Price) return null;
    E.TicketsE -= Price;
  } else if (Pay === PayTicketsL) {
    if (E.TicketsL < Price) return null;
    E.TicketsL -= Price;
  } else if (Pay === PayGems) {
    if (E.Gems < Price) return null;
    E.Gems -= Price;
    E.QGemsUsed += Price;
  } else {
    if (E.Coins < Price) return null;
    E.Coins -= Price;
  }
  const Cards = [];
  const Special = Pay === PayTicketsE || Pay === PayTicketsL;
  for (let K = 1; K <= N; K++) {
    for (let I = 1; I <= PackSize; I++) {
      const D = PackCard(DB, (Special && I === PackSize) ? PackRarityLast(Pay) : PackRarity(I === PackSize));
      Cards.push(D);
      AddOwned(E, D.Id);
    }
  }
  E.Packs += N;
  E.QPacks += N;
  CardCommit(P, E);
  return Cards;
}

// [coins, gems] of card back I: 1 月 2 草 3 魔方陣 4 王冠 5 桜 6 結晶 7 レインボーダイヤ 8 炎 9 波 10 太陽 11 うろこ 12 赤チェック 13 ハート 14 雷 15 宇宙
function CardBackPrice(I) {
  return I === 1 ? [0, 100]
    : I === 2 ? [1000, 0]
    : I === 3 ? [0, 100]
    : I === 4 ? [0, 100]
    : I === 5 ? [0, 200]
    : I === 6 ? [3000, 0]
    : I === 7 ? [50000, 0]
    : I === 8 ? [2000, 0]
    : I === 9 ? [2000, 0]
    : I === 10 ? [5000, 0]
    : I === 11 ? [0, 100]
    : I === 12 ? [3000, 0]
    : I === 13 ? [0, 100]
    : I === 14 ? [5000, 0]
    : I === 15 ? [0, 200]
    : [0, 0];
}

// the shop shows the coin backs in the first row and the gem backs in the second (cheapest first)
const ShopBackOrder = [2, 8, 9, 6, 12, 10, 14, 7, 1, 3, 4, 11, 13, 5, 15];
// the card back setting: the first one and the gem backs, then the coin backs
const SetBackOrder = [0, 1, 3, 4, 11, 13, 5, 15, 2, 8, 9, 6, 12, 10, 14, 7];

function CardHasBack(P, I) {
  return I === 0 || GetCardSave(P).Backs.includes(I);
}

// buys card back I (coins or gems, whichever it costs); true when it was bought
function CardBuyBack(P, I) {
  if (CardHasBack(P, I)) return false;
  const E = CardEdit(P);
  const Price = CardBackPrice(I);
  if (E.Coins < Price[0] || E.Gems < Price[1]) return false;
  E.Coins -= Price[0];
  E.Gems -= Price[1];
  E.QGemsUsed += Price[1];
  E.Backs = [...E.Backs, I];
  E.Back = I;
  CardCommit(P, E);
  return true;
}

function CardSetBack(P, I) {
  if (!CardHasBack(P, I)) return;
  const E = CardEdit(P);
  E.Back = I;
  CardCommit(P, E);
}

function CardAddGems(P, N) {
  const E = CardEdit(P);
  E.Gems += N;
  CardCommit(P, E);
}

// gems bought with V-Bucks (counted for the 「累計○○ジェム課金」 achievements)
function CardAddBoughtGems(P, N) {
  const E = CardEdit(P);
  E.Gems += N;
  E.GemsBought += N;
  CardCommit(P, E);
}

function CardAddCoins(P, N) {
  const E = CardEdit(P);
  E.Coins = Max(0, E.Coins + N);
  CardCommit(P, E);
}

// ---------------------------------------------------------------- カケラ: spare copies become shards, shards make cards
function CardShardValue(R) { return R === RarL ? 30 : R === RarE ? 10 : R === RarR ? 3 : 1; }
function CardCraftCost(R) { return R === RarL ? 300 : R === RarE ? 200 : R === RarR ? 30 : 10; }

// one spare copy of D (2 or more owned) becomes shards; returns the shards got (0 = nothing happened)
function CardDisenchant(P, D) {
  const E = CardEdit(P);
  const N = At(E.Owned, D.Id) ?? 0;
  if (N < 2) return 0;
  E.Owned[D.Id] = N - 1;
  const V = CardShardValue(D.Rarity);
  E.Shards += V;
  CardCommit(P, E);
  return V;
}

// a deck can hold up to 3 copies of a card, so the bulk convert keeps 3 of each
const CardKeepCopies = 3;

// the copies over CardKeepCopies of every card: [cards, shards they give]
function CardSpareInfo(P, DB) {
  const S = GetCardSave(P);
  let Cards = 0;
  let Shards = 0;
  for (const D of DB) {
    const N = At(S.Owned, D.Id);
    if (N !== undefined && N > CardKeepCopies) {
      Cards += N - CardKeepCopies;
      Shards += (N - CardKeepCopies) * CardShardValue(D.Rarity);
    }
  }
  return [Cards, Shards];
}

// every copy over CardKeepCopies becomes shards; returns the shards got
function CardDisenchantAll(P, DB) {
  const E = CardEdit(P);
  let Got = 0;
  for (const D of DB) {
    const N = At(E.Owned, D.Id);
    if (N !== undefined && N > CardKeepCopies) {
      Got += (N - CardKeepCopies) * CardShardValue(D.Rarity);
      E.Owned[D.Id] = CardKeepCopies;
    }
  }
  E.Shards += Got;
  CardCommit(P, E);
  return Got;
}

// makes one copy of D (owned or not) with shards; false when there are not enough
function CardCraft(P, D) {
  const E = CardEdit(P);
  const Cost = CardCraftCost(D.Rarity);
  if (E.Shards < Cost) return false;
  E.Shards -= Cost;
  AddOwned(E, D.Id);
  CardCommit(P, E);
  return true;
}

// ---------------------------------------------------------------- プレミア化: copies of the same card make it sparkle (1st) and move (2nd)
// the extra copies needed (the picked copy itself is kept)
function CardPremCost(Tier, R) {
  if (Tier <= 1) return R === RarL ? 1 : R === RarE ? 2 : R === RarR ? 3 : 5;
  return R === RarL ? 3 : R === RarE ? 5 : R === RarR ? 10 : 30;
}

function CardPremLevel(P, Id) { return At(GetCardSave(P).Prem, Id) ?? 0; }

// the copies the next step of D needs (0 = it is at the top already)
function CardPremNext(P, D) {
  const L = CardPremLevel(P, D.Id);
  return L >= 2 ? 0 : CardPremCost(L + 1, D.Rarity);
}

// one プレミア step for D: returns the new level (0 = not enough copies / already at the top)
function CardPremium(P, D) {
  const E = CardEdit(P);
  const L = At(E.Prem, D.Id) ?? 0;
  if (L >= 2) return 0;
  const Cost = CardPremCost(L + 1, D.Rarity);
  const N = At(E.Owned, D.Id) ?? 0;
  if (N < Cost + 1) return 0;
  E.Owned[D.Id] = N - Cost;
  while (E.Prem.length <= D.Id) E.Prem.push(0);
  E.Prem[D.Id] = L + 1;
  CardCommit(P, E);
  return L + 1;
}

// debug only (card_game_device.DebugCopies): every card of Ids is owned at least N times
function CardDebugCopies(P, Ids, N) {
  const E = CardEdit(P);
  for (const Id of Ids) {
    const Have = At(E.Owned, Id) ?? 0;
    for (let K = Have + 1; K <= N; K++) AddOwned(E, Id);
  }
  CardCommit(P, E);
}

// ---------------------------------------------------------------- decks (デッキ構築)
const CardMaxDecks = 8;
const CardDeckSize = 40;
const CardDeckCopies = 3;

function CardDeckOf(P, I) { return At(GetCardSave(P).Decks, I) ?? new card_deck(); }

function CardSaveDeck(P, I, Hero, Cards, Icon) {
  const E = CardEdit(P);
  while (E.Decks.length <= I) E.Decks.push(new card_deck());
  E.Decks[I] = new card_deck({ Hero: Hero, Cards: Cards.slice(), Icon: Icon });
  CardCommit(P, E);
}

function CardSetDeckSel(P, I) {
  const E = CardEdit(P);
  E.DeckSel = I;
  CardCommit(P, E);
}

// copies of card Id in a list of card ids
function CardCopies(Cards, Id) {
  let N = 0;
  for (const X of Cards) if (X === Id) N += 1;
  return N;
}

// why a deck can't be used: 0 it can, 1 it doesn't have 40 cards, 2 more than 3 copies of a card, 3 not enough copies owned
function CardDeckProblem(P, DB, D) {
  if (D.Cards.length !== CardDeckSize) return 1;
  const S = GetCardSave(P);
  const Seen = [];
  for (const Id of D.Cards) {
    if (!Seen.includes(Id)) {
      Seen.push(Id);
      const N = CardCopies(D.Cards, Id);
      if (N > CardDeckCopies) return 2;
      const C = At(DB, Id);
      if (C && C.Token) return 2;
      if (N > (At(S.Owned, Id) ?? 0)) return 3;
    }
  }
  return 0;
}

function CardDeckOk(P, DB, I) {
  return I >= 0 && I < CardMaxDecks && CardDeckProblem(P, DB, CardDeckOf(P, I)) === 0;
}

// the deck to use when none was picked: the last one if it can be used, else the first one that can (-1: none)
function CardFirstOkDeck(P, DB) {
  const Sel = GetCardSave(P).DeckSel;
  if (CardDeckOk(P, DB, Sel)) return Sel;
  for (let I = 0; I <= CardMaxDecks - 1; I++) if (CardDeckOk(P, DB, I)) return I;
  return -1;
}

// ---------------------------------------------------------------- costumes (着せ替え)
function CardHasSkin(P, SkinId) { return GetCardSave(P).Skins.includes(SkinId); }

function CardSkinOf(P, HeroId) { return At(GetCardSave(P).HeroSkin, HeroId) ?? 0; }

// the picture of character H with the costume the player chose
function CardHeroPic(P, H) {
  const Sk = CardSkinOf(P, H.Id);
  if (Sk > 0 && CardHasSkin(P, Sk)) {
    for (const X of CardSkins()) if (X.Id === Sk && X.Hero === H.Id) return X.Pic;
  }
  return H.Pic;
}

// the description under the name: the costume's own one when the character wears a costume
function CardHeroRace(P, H) {
  const Sk = CardSkinOf(P, H.Id);
  if (Sk > 0 && CardHasSkin(P, Sk)) {
    for (const X of CardSkins()) if (X.Id === Sk && X.Hero === H.Id) return X.Race;
  }
  return H.Race;
}

// the name shown for the character: the costume's name while it wears one (マジシャン → キャンディマン)
function CardHeroName(P, H) {
  const Sk = CardSkinOf(P, H.Id);
  if (Sk > 0 && CardHasSkin(P, Sk)) {
    for (const X of CardSkins()) if (X.Id === Sk && X.Hero === H.Id) return X.Name;
  }
  return H.Name;
}

// SkinId 0 = the default look
function CardSetSkin(P, HeroId, SkinId) {
  if (SkinId > 0 && !CardHasSkin(P, SkinId)) return false;
  const E = CardEdit(P);
  while (E.HeroSkin.length <= HeroId) E.HeroSkin.push(0);
  E.HeroSkin[HeroId] = SkinId;
  CardCommit(P, E);
  return true;
}

// ---------------------------------------------------------------- one-time gifts (given silently when the player comes)
const CardGiftStarter = 1;
const CardGiftVip = 2;
// the special player (HTML版: プレイヤーID 4004-2202-2888) who always has キャンディマン
const CardVipNo = 400422022888;

function HasBit(X, B) { return Mod(Quotient(X, B), 2) === 1; }

function CardGiveGifts(P) {
  const E = CardEdit(P);
  let Changed = false;
  // v14 (デッキ構築): the cards of the starter deck (only the missing copies) and the deck itself as デッキ1
  if (!HasBit(E.Gifts, CardGiftStarter)) {
    const Done = [];
    for (const Id of CardStarterDeck) {
      if (!Done.includes(Id)) {
        Done.push(Id);
        const Need = CardCopies(CardStarterDeck, Id);
        const Have = At(E.Owned, Id) ?? 0;
        for (let K = Have + 1; K <= Need; K++) AddOwned(E, Id);
      }
    }
    if (E.Decks.length === 0) E.Decks = [new card_deck({ Hero: E.Fav, Cards: CardStarterDeck.slice() })];
    E.Gifts += CardGiftStarter;
    Changed = true;
  }
  // the special player always has キャンディマン (costume and card back)
  if (E.PlayerNo === CardVipNo) {
    if (!E.Skins.includes(CardSkinCandy)) {
      E.Skins = [...E.Skins, CardSkinCandy];
      Changed = true;
    }
    if (!E.Backs.includes(CardBackCandy)) {
      E.Backs = [...E.Backs, CardBackCandy];
      Changed = true;
    }
    // and the キャンディマン title and badge (card_achieve)
    if (!E.Titles.includes(CardTitleCandy)) {
      E.Titles = [...E.Titles, CardTitleCandy];
      Changed = true;
    }
    if (!E.Badges.includes(CardBadgeCandy)) {
      E.Badges = [...E.Badges, CardBadgeCandy];
      Changed = true;
    }
    if (!HasBit(E.Gifts, CardGiftVip)) {
      E.Gifts += CardGiftVip;
      Changed = true;
    }
  }
  // エイぴちぴち (ナイトの着せ替え) belongs to these two players only, given silently every time they come
  if (CardEipitiNos.includes(E.PlayerNo) && !E.Skins.includes(CardSkinEipiti)) {
    E.Skins = [...E.Skins, CardSkinEipiti];
    Changed = true;
  }
  if (Changed) CardCommit(P, E);
}

// the players who get エイぴちぴち (HTML版: プレイヤーID 4004-2202-2888)
const CardEipitiNos = [400422022888];

// ---------------------------------------------------------------- hour bonus (every 3 hours: a roulette over 7 rewards, every 5th one is bigger)
const CardHourSeconds = 10800;

class card_hour_reward {
  constructor(o = {}) {
    this.Coins = o.Coins ?? 0;
    this.Gems = o.Gems ?? 0;
    this.Gift = o.Gift ?? false;      // プレゼントBOX: random coins and gems
  }
}

const CardHourNormal = [
  new card_hour_reward({ Coins: 300 }),
  new card_hour_reward({ Gems: 10 }),
  new card_hour_reward({ Coins: 500 }),
  new card_hour_reward({ Gift: true }),
  new card_hour_reward({ Coins: 500 }),
  new card_hour_reward({ Gems: 10 }),
  new card_hour_reward({ Coins: 300 }),
];

const CardHourBig = [
  new card_hour_reward({ Coins: 500 }),
  new card_hour_reward({ Gems: 20 }),
  new card_hour_reward({ Coins: 1000 }),
  new card_hour_reward({ Gift: true }),
  new card_hour_reward({ Coins: 1000 }),
  new card_hour_reward({ Gems: 20 }),
  new card_hour_reward({ Coins: 500 }),
];

function CardHourRewards(Big) { return Big ? CardHourBig : CardHourNormal; }
function CardBoxCoins(Big) { return Big ? [500, 1000, 1500, 2000, 2500, 3000] : [300, 500, 1000]; }
function CardBoxGems(Big) { return Big ? [20, 30, 40, 50] : [10, 20, 30]; }

function CardNowSeconds() { return Math.floor(GetSecondsSinceEpoch()); }

// seconds until the next hour bonus (0 = it can be received now)
function CardHourLeft(P) {
  const S = GetCardSave(P);
  if (S.HourCount === 0) return 0;
  return Max(0, S.HourAt + CardHourSeconds - CardNowSeconds());
}

function CardHourReady(P) { return CardHourLeft(P) <= 0; }

// the next bonus is a 5th one (the bigger rewards)
function CardHourBigNext(P) { return Mod(GetCardSave(P).HourCount + 1, 5) === 0; }

// spins the roulette: [the card it stops on, what was received], or null when it is not ready
function CardClaimHour(P) {
  if (!CardHourReady(P)) return null;
  const E = CardEdit(P);
  const Big = Mod(E.HourCount + 1, 5) === 0;
  const Slot = GetRandomInt(0, 6);
  const R = At(CardHourRewards(Big), Slot) ?? new card_hour_reward({ Coins: 300 });
  const BC = CardBoxCoins(Big);
  const BG = CardBoxGems(Big);
  const Coins = R.Gift ? (At(BC, GetRandomInt(0, BC.length - 1)) ?? 300) : R.Coins;
  const Gems = R.Gift ? (At(BG, GetRandomInt(0, BG.length - 1)) ?? 10) : R.Gems;
  E.HourCount += 1;
  E.HourAt = CardNowSeconds();
  E.Coins += Coins;
  E.Gems += Gems;
  CardCommit(P, E);
  return [Slot, new card_gain({ Coins: Coins, Gems: Gems })];
}
