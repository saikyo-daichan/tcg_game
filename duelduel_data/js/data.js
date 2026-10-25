// data.js — card_data.verse: card types (effects, keywords, rarity), the playable characters and their costumes.
// The card list itself is cards.js (generated, loaded after this file).
// Ported 1:1. Notes:
// - fx_kind is an object whose values are the member names (fx_kind.HitFront === 'HitFront').
// - <decides> methods without a value (card_def.IsMonster / NeedsTarget, hero_def.NeedsTarget) return true / false.
// - CardSkinById returns the skin or null (Verse option).
'use strict';

// ---------------------------------------------------------------- effects
// One effect of a card: battlecry (叫び), death (破壊時), turn start / end, on attack, countdown, evolve, spell or jewel.
const fx_kind = {};
for (const K of [
  'None',
  // --- no target
  'HitFoeHero', 'HealHero', 'Draw', 'HeroAtk', 'ManaUp', 'HitFront', 'FreezeFront', 'KillFront', 'BounceFront', 'DebuffFront',
  'HitRandomFoe', 'HitAllFoes', 'HitAllOthers', 'HitAllEnemies', 'DebuffAllFoes', 'FreezeRandom', 'FreezeAll', 'BuffAllies',
  'BuffRandomAlly', 'HealAllies', 'BuffSelf', 'HealSelf', 'SelfKw', 'AllyKw', 'AddCard', 'Summon', 'Transform', 'GraveToHand',
  'GraveRevive', 'GraveFill', 'DebuffRandomFoe', 'BuffSelfTurn', 'Fuse', 'KillAllOthers', 'ManaNext', 'DiscountRandom', 'SummonKw',
  'HitRandomEnemy', 'TutorHigh', 'TutorSpell', 'HealRandomAlly', 'FreezeHitRandom', 'HitFrontWide', 'HealRandomAny', 'HealTeam',
  'EvolveAllies', 'Tutor', 'HandDiscount', 'DrawDiscard', 'ShieldUp', 'HeroMaxUp', 'GainMana', 'EvoUp', 'KillRandomFoe',
  'AdvanceAll', 'DiscountPick',
  // --- with a target
  'HitTarget', 'FreezeHit', 'DebuffTarget', 'DestroyTarget', 'HealTarget', 'BuffTarget', 'GiveKw', 'Bounce', 'SummonAt', 'Devour',
  'DevourFoe', 'HitEnemy', 'BounceTwo', 'HitAny', 'AdvanceTarget', 'DestroyAmulet', 'BuffOther',
  // --- v14 (no target unless noted)
  'KillSelf', 'ReturnSelf', 'DrawBoth', 'DrawCheap', 'GravePick', 'FoeHandToDeck', 'HitOwnHero', 'HitFrontSplash', 'SummonRushBuff',
  'HitAllMonsters', 'HitSelf', 'HitRandomAny', 'SummonFoe', 'IfAllyBuff', 'IfAllyKw', 'FoeDiscard', 'DeckSummon', 'GravePickSummon',
  'SummonTrump', 'KillAttackTarget',
  // --- v16
  'SilenceFront', 'SpellLock', 'Choose',
  // --- v19
  'HandKw', 'VanishSelf', 'KillOwnOthers', 'ArtifactDeck', 'HeroEndSummon',
]) fx_kind[K] = K;
Object.freeze(fx_kind);

// the effects added in v14 (card_rules DoFxNew / card_text FxTextNew)
const NewFxKinds = new Set(['BuffOther', 'KillSelf', 'ReturnSelf', 'DrawBoth', 'DrawCheap', 'GravePick', 'FoeHandToDeck', 'HitOwnHero',
  'HitFrontSplash', 'SummonRushBuff', 'HitAllMonsters', 'HitSelf', 'HitRandomAny', 'SummonFoe', 'IfAllyBuff', 'IfAllyKw', 'FoeDiscard',
  'DeckSummon', 'GravePickSummon', 'SummonTrump', 'KillAttackTarget', 'SilenceFront', 'SpellLock', 'Choose', 'HandKw', 'VanishSelf',
  'KillOwnOthers', 'ArtifactDeck', 'HeroEndSummon']);
function IsNewFx(K) { return NewFxKinds.has(K); }

// Cond: 0 always, 1 覚醒 (max mana 7 or more), 2 復讐 (own HP 10 or less), 3 own hand 2 cards or less,
// 4 the own player has less HP than the enemy player, 5 this monster is damaged (HP below its max)
class fx {
  constructor(o = {}) {
    this.K = o.K ?? fx_kind.None;
    this.N = o.N ?? 0;
    this.M = o.M ?? 0;
    this.C = o.C ?? -1;
    this.Cond = o.Cond ?? 0;
  }
}

function FxN(K, N) { return new fx({ K, N }); }
function FxNM(K, N, M) { return new fx({ K, N, M }); }
function FxC(K, C, N) { return new fx({ K, N, C }); }
function Fx0(K) { return new fx({ K }); }

// what an effect is aimed at: 0 nothing, 1 an enemy monster, 2 an ally monster, 3 any monster, 4 an empty own slot,
// 5 an other ally monster, 6 an own amulet with a countdown, 7 any amulet, 8 any monster or player, 9 an enemy monster or the enemy player
function FxTarget(K) {
  if (K === fx_kind.HitTarget || K === fx_kind.FreezeHit || K === fx_kind.DebuffTarget || K === fx_kind.DestroyTarget || K === fx_kind.DevourFoe) return 1;
  else if (K === fx_kind.HealTarget || K === fx_kind.BuffTarget || K === fx_kind.GiveKw) return 2;
  else if (K === fx_kind.Devour || K === fx_kind.BuffOther) return 5;
  else if (K === fx_kind.AdvanceTarget) return 6;
  else if (K === fx_kind.DestroyAmulet) return 7;
  else if (K === fx_kind.HitAny) return 8;
  else if (K === fx_kind.HitEnemy) return 9;
  else if (K === fx_kind.Bounce || K === fx_kind.BounceTwo) return 3;
  else if (K === fx_kind.SummonAt) return 4;
  return 0;
}

// keyword codes (SelfKw / AllyKw / GiveKw)
const KwTaunt = 1;
const KwHaste = 2;
const KwRush = 3;
const KwDeadly = 4;
const KwDrain = 5;
const KwBarrier = 6;
const KwStealth = 7;
const KwIntimidate = 8;

// 挑発 / 潜伏 / 無敵 / 威圧: a monster can only have one of them (giving another one fails)
function KwExclusive(Code) { return Code === KwTaunt || Code === KwStealth || Code === KwIntimidate; }

// special card ids for AddCard
const CardRandomAny = -2;
const CardRandomSpell = -3;
const CardRandomLegend = -4;
const CardRandomArtifact = -5;

// ---------------------------------------------------------------- rarity
const RarN = 0;
const RarR = 1;
const RarE = 2;
const RarL = 3;

function RarityColor(R) {
  if (R === RarL) return color(1.0, 0.72, 0.1);
  else if (R === RarE) return color(0.75, 0.3, 1.0);
  else if (R === RarR) return color(0.35, 0.75, 1.0);
  return color(0.62, 0.6, 0.58);
}

// ---------------------------------------------------------------- cards
class card_def {
  constructor(o = {}) {
    this.Id = o.Id;
    this.Name = o.Name;
    this.Flavor = o.Flavor ?? TxEmpty;
    this.IsSpell = o.IsSpell ?? false;
    this.Token = o.Token ?? false;        // only summoned by effects, never in a deck or a pack
    this.Rarity = o.Rarity ?? 0;
    this.Cost = o.Cost;
    this.Atk = o.Atk ?? 0;
    this.Hp = o.Hp ?? 0;
    this.Taunt = o.Taunt ?? false;        // 挑発
    this.Haste = o.Haste ?? false;        // 速攻: acts on the turn it is summoned
    this.Rush = o.Rush ?? false;          // 特攻: may attack monsters (not players) on the turn it is summoned
    this.Deadly = o.Deadly ?? false;      // 必殺: a monster it fights is always destroyed
    this.Drain = o.Drain ?? false;        // 吸血: the damage it deals heals its player
    this.Blocked = o.Blocked ?? false;    // can't attack the player while a monster stands in front
    this.Barrier = o.Barrier ?? false;    // バリア: the first damage is ignored
    this.Invincible = o.Invincible ?? false; // 無敵: takes no damage and can't be destroyed by effects
    this.Intimidate = o.Intimidate ?? false; // 威圧: the enemy can't target it (attacks, spells, effects)
    this.Stealth = o.Stealth ?? false;    // 潜伏: like 威圧 until it attacks
    this.SelfDmg = o.SelfDmg ?? 0;        // 自傷: the own player takes this much damage when it is played
    this.Countdown = o.Countdown ?? 0;    // カウントダウン: counts down at the owner's turn start, CdFx at 0
    this.CdFx = o.CdFx ?? new fx();
    this.CdTick = o.CdTick ?? new fx();   // every time the countdown goes down
    this.Amulet = o.Amulet ?? false;      // アミュレット: takes a board slot, can't attack and can't be attacked
    this.AllySum = o.AllySum ?? new fx(); // an ally monster that comes onto the board gets this (SelfKw / BuffSelf applied to it)
    this.HeroOnly = o.HeroOnly ?? -1;     // only the character with this id can draft it
    this.Cry = o.Cry ?? new fx();
    this.Cry2 = o.Cry2 ?? new fx();
    this.Death = o.Death ?? new fx();
    this.Death2 = o.Death2 ?? new fx();
    this.OnKill = o.OnKill ?? new fx();   // after it destroyed an enemy monster in a fight (and survived)
    this.OnHeal = o.OnHeal ?? new fx();   // every time the own player is healed
    this.TwoActs = o.TwoActs ?? false;    // can act twice a turn
    this.SpellCheaper = o.SpellCheaper ?? false; // in the hand: costs 1 less every time its owner plays a spell
    this.NoAttackTarget = o.NoAttackTarget ?? false; // can't be attacked (spells and effects can still pick it)
    this.Recur = o.Recur ?? false;        // a spell that goes back to the hand instead of the grave
    this.Armor = o.Armor ?? 0;            // the damage this monster takes is this much lower
    this.Thorns = o.Thorns ?? 0;          // サボテン: a monster / player attacking it takes this much more damage
    this.DmgCap = o.DmgCap ?? 0;          // モアイ: the damage it takes at once is at most this much (0 = no cap)
    this.FrontAtkDown = o.FrontAtkDown ?? 0; // the enemy monster in front of it has this much less attack
    this.TurnStart = o.TurnStart ?? new fx();
    this.TurnEnd = o.TurnEnd ?? new fx();
    this.OnAttack = o.OnAttack ?? new fx();
    this.Evo = o.Evo ?? new fx();
    this.Evo2 = o.Evo2 ?? new fx();
    this.EvoAtk = o.EvoAtk ?? 2;
    this.EvoHp = o.EvoHp ?? 2;
    this.Spell = o.Spell ?? new fx();
    this.Spell2 = o.Spell2 ?? new fx();
    this.Art = o.Art;
    this.ArtW = o.ArtW;
    this.ArtH = o.ArtH;
    this.ArtTint = o.ArtTint ?? color(1.0, 1.0, 1.0);
    // the picture of the evolved monster on the board (竜人: another look after evolving); null = none
    this.EvoArt = o.EvoArt ?? null;
    this.EvoArtW = o.EvoArtW ?? 1.0;
    this.EvoArtH = o.EvoArtH ?? 1.0;
  }

  // a monster (not a spell / amulet)
  IsMonster() { return !this.IsSpell && !this.Amulet; }

  // spells that need a target picked on the board
  NeedsTarget() { return this.IsSpell && FxTarget(this.Spell.K) > 0; }
}

const CardHeroHp = 20;
const CardMaxMana = 10;
const CardMaxHand = 9;
// evolve points and the first own turn they can be used
const CardEvoFirst = 2;
const CardEvoSecond = 3;
const CardEvoTurnFirst = 5;
const CardEvoTurnSecond = 4;

// CardSlimeTokens (ミント's jewel) and CardRoyalKnight (ナイト's jewel) are generated into cards.js

// ---------------------------------------------------------------- playable characters
// Each character has its own jewel skill (usable once per turn)
class hero_def {
  constructor(o = {}) {
    this.Id = o.Id;
    this.Name = o.Name;
    this.Race = o.Race;
    this.Pic = o.Pic;
    this.Jewel = o.Jewel;
    this.JewelName = o.JewelName;
    this.JewelPic = o.JewelPic;
    this.Cost = o.Cost;
  }

  // the skill is used by picking a slot / monster on the board
  NeedsTarget() { return FxTarget(this.Jewel.K) > 0; }
}

function MakeHeroes() {
  return [
    new hero_def({ Id: 0, Name: HnRio, Race: HrRio, Pic: CardGui.T_HeroMe, Jewel: FxN(fx_kind.Draw, 1), JewelName: HjRio, JewelPic: CardGui.T_JwBook, Cost: 2 }),
    new hero_def({ Id: 1, Name: HnMint, Race: HrMint, Pic: CardGui.T_HeroMint, Jewel: FxC(fx_kind.SummonAt, -1, 1), JewelName: HjMint, JewelPic: CardGui.T_JwSlime, Cost: 3 }),
    new hero_def({ Id: 2, Name: HnZeno, Race: HrZeno, Pic: CardGui.T_HeroDark, Jewel: FxN(fx_kind.HeroAtk, 2), JewelName: HjZeno, JewelPic: CardGui.T_JwSword, Cost: 3 }),
    new hero_def({ Id: 3, Name: HnSadia, Race: HrSadia, Pic: CardGui.T_HeroFoe, Jewel: FxN(fx_kind.HitTarget, 1), JewelName: HjSadia, JewelPic: CardGui.T_JwBolt, Cost: 2 }),
    new hero_def({ Id: 4, Name: HnKing, Race: HrKing, Pic: CardGui.T_HeroKing, Jewel: FxN(fx_kind.ShieldUp, 2), JewelName: HjKing, JewelPic: CardGui.T_JwCrown, Cost: 3 }),
    new hero_def({ Id: 5, Name: HnKnight, Race: HrKnight, Pic: CardGui.T_HeroKnight, Jewel: FxC(fx_kind.SummonAt, CardRoyalKnight, 1), JewelName: HjKnight, JewelPic: CardGui.T_JwShield, Cost: 5 }),
    new hero_def({ Id: 6, Name: HnMage, Race: HrMage, Pic: CardGui.T_HeroMage, Jewel: FxNM(fx_kind.HitRandomFoe, 1, 2), JewelName: HjMage, JewelPic: CardGui.T_JwStar, Cost: 3 }),
    new hero_def({ Id: 7, Name: HnNun, Race: HrNun, Pic: CardGui.T_HeroNun, Jewel: FxN(fx_kind.HealTarget, 2), JewelName: HjNun, JewelPic: CardGui.T_JwCross, Cost: 3 }),
  ];
}

const HnRio = "リオ";
const HnMint = "ミント";
const HnZeno = "ゼノ";
const HnSadia = "サディア";
const HnKing = "キング";
const HnKnight = "ナイト";
const HnMage = "マジシャン";
const HnNun = "修道女";
const HrRio = "エルフの剣士";
const HrMint = "エルフの魔法使い";
const HrZeno = "ダークエルフの剣士";
const HrSadia = "ダークエルフの魔法使い";
const HrKing = "王国の王様";
const HrKnight = "王国の騎士";
const HrMage = "宮廷魔術師";
const HrNun = "教会のシスター";
const HjRio = "知恵のサファイア";
const HjMint = "森のエメラルド";
const HjZeno = "闘志のルビー";
const HjSadia = "闇のアメジスト";
const HjKing = "王者のトパーズ";
const HjKnight = "守護のラピス";
const HjMage = "星のオパール";
const HjNun = "癒しのアクアマリン";

// ---------------------------------------------------------------- costumes (着せ替え)
// Another look of a character. Id 0 is always the character's own picture. The ids are saved: never reorder them.
class skin_def {
  constructor(o = {}) {
    this.Id = o.Id;
    this.Hero = o.Hero;
    this.Name = o.Name;
    this.Pic = o.Pic;
    this.Gray = o.Gray;     // shown (black and white) to players who don't have it
    this.Race = o.Race;     // the description shown under the name while it is worn
    this.Back = o.Back ?? -1;   // the card back that comes with it in the shop (-1: none)
    this.Price = o.Price ?? 0;  // gems in the shop's 着せ替え tab (0: not sold)
  }
}

const CardSkinCandy = 1;
const CardSkinEipiti = 2;
const CardSkinSky = 3;
// the shop's costumes (ids 4..11, one per character, each with its own card back 18..25)
const CardShopSkinFirst = 4;
const CardShopSkinLast = 11;
const CardSkinSetPrice = 6000;

function CardSkins() {
  return [
    new skin_def({ Id: CardSkinCandy, Hero: 6, Name: SnCandy, Race: SrCandy, Pic: CardGui.T_HeroCandy, Gray: CardGui.T_HeroCandyGray }),
    new skin_def({ Id: CardSkinEipiti, Hero: 5, Name: SnEipiti, Race: SrEipiti, Pic: CardGui.T_SkinEipiti, Gray: CardGui.T_SkinEipitiGray }),
    new skin_def({ Id: CardSkinSky, Hero: 0, Name: SnSky, Race: SrSky, Pic: CardGui.T_SkinSky, Gray: CardGui.T_SkinSkyGray }),
    new skin_def({ Id: 4, Hero: 0, Name: SnLily, Race: SrLily, Pic: CardGui.T_SkinLily, Gray: CardGui.T_SkinLilyGray, Back: 18, Price: 1000 }),
    new skin_def({ Id: 5, Hero: 1, Name: SnLuca, Race: SrLuca, Pic: CardGui.T_SkinLuca, Gray: CardGui.T_SkinLucaGray, Back: 19, Price: 1000 }),
    new skin_def({ Id: 6, Hero: 2, Name: SnReina, Race: SrReina, Pic: CardGui.T_SkinReina, Gray: CardGui.T_SkinReinaGray, Back: 20, Price: 1000 }),
    new skin_def({ Id: 7, Hero: 3, Name: SnFinn, Race: SrFinn, Pic: CardGui.T_SkinFinn, Gray: CardGui.T_SkinFinnGray, Back: 21, Price: 1000 }),
    new skin_def({ Id: 8, Hero: 4, Name: SnCeres, Race: SrCeres, Pic: CardGui.T_SkinCeres, Gray: CardGui.T_SkinCeresGray, Back: 22, Price: 1000 }),
    new skin_def({ Id: 9, Hero: 5, Name: SnLilia, Race: SrLilia, Pic: CardGui.T_SkinLilia, Gray: CardGui.T_SkinLiliaGray, Back: 23, Price: 1000 }),
    new skin_def({ Id: 10, Hero: 6, Name: SnAstel, Race: SrAstel, Pic: CardGui.T_SkinAstel, Gray: CardGui.T_SkinAstelGray, Back: 24, Price: 1000 }),
    new skin_def({ Id: 11, Hero: 7, Name: SnHal, Race: SrHal, Pic: CardGui.T_SkinHal, Gray: CardGui.T_SkinHalGray, Back: 25, Price: 1000 }),
  ];
}

// the costumes of one character (without the default look)
function CardSkinsOf(HeroId) { return CardSkins().filter(S => S.Hero === HeroId); }

// the skin with this id, or null
function CardSkinById(Id) {
  for (const S of CardSkins()) if (S.Id === Id) return S;
  return null;
}

const SnDefault = "いつもの姿";
const SnCandy = "キャンディマン";
const SnEipiti = "エイぴちぴち";
const SnSky = "スカイ";
const SnLily = "リリィ";
const SnLuca = "ルカ";
const SnReina = "レイナ";
const SnFinn = "フィン";
const SnCeres = "セレス";
const SnLilia = "リリア";
const SnAstel = "アステル";
const SnHal = "ハル";
const SrCandy = "制作者";
const SrEipiti = "イラストレーター";
const SrSky = "シーズン1";
const SrLily = "運命の魔法少女";
const SrLuca = "スライム召喚士";
const SrReina = "紅の剣士";
const SrFinn = "風の狩人";
const SrCeres = "宮殿の守護者";
const SrLilia = "白銀の騎士団長";
const SrAstel = "星の魔導士";
const SrHal = "癒しの賢者";

// the name of the character a card belongs to (HeroOnly)
function HeroNameOf(Id) {
  if (Id === 0) return HnRio; else if (Id === 1) return HnMint; else if (Id === 2) return HnZeno; else if (Id === 3) return HnSadia;
  else if (Id === 4) return HnKing; else if (Id === 5) return HnKnight; else if (Id === 6) return HnMage;
  return HnNun;
}
