// boss.js — card_boss.verse: CPU strength (side.AiLevel, played by rules.js BestActLv) and the 最恐 CPU's decks.
// The 最恐 cards are generated tokens (ids in CardBossIds): never in packs, the collection, the deck builder, crafting
// or 2Pick drafts of players.
// Ported 1:1. The <decides> checks (CardIsBoss / CardIsArtifact / CardKeptToken / CardBossOk) return true / false.
// The decks are built before a match (outside it), so they use the kit's Shuffle (not the match RNG).
// Uses DraftPool / DraftOptions / DraftRoundOf / DraftRounds (lobby.js) and CardDeckSize (save.js).
'use strict';

// side.AiLevel values
const CardAiBeginner = 0;     // 初級: the classic AI
const CardAiMiddle = 1;       // 中級
const CardAiHard = 2;         // 上級
const CardAiNightmare = 3;    // 最恐: 上級 AI + CardBossHp + CardBossDeck / CardBossDraftDeck
const CardAiLevels = 4;

// the 最恐 CPU's HP (side Hp / MaxHp)
const CardBossHp = 50;

const TxAiBeginner = "初級";
const TxAiMiddle = "中級";
const TxAiHard = "上級";
const TxAiNightmare = "最恐";
const TxAiBeginnerDesc = "いつものCPU。はじめての人におすすめ";
const TxAiMiddleDesc = "進化権を温存し、盤面の処理を優先してくる";
const TxAiHardDesc = "マナを無駄なく使い、勝ち筋を読んでくる強敵";
const TxAiNightmareDesc = "体力50・特別な強力カード入りデッキ。勝利で称号とバッチ「最恐討伐者」";

function CardAiName(L) {
  if (L === CardAiMiddle) return TxAiMiddle;
  else if (L === CardAiHard) return TxAiHard;
  else if (L === CardAiNightmare) return TxAiNightmare;
  return TxAiBeginner;
}

function CardAiDesc(L) {
  if (L === CardAiMiddle) return TxAiMiddleDesc;
  else if (L === CardAiHard) return TxAiHardDesc;
  else if (L === CardAiNightmare) return TxAiNightmareDesc;
  return TxAiBeginnerDesc;
}

// a card only the 最恐 CPU uses
function CardIsBoss(D) { return CardBossIds.includes(D.Id); }

// an アーティファクト (AF-*: only made by アーティファクト基地 / AF-M)
function CardIsArtifact(D) { return CardArtifactIds.includes(D.Id); }

// a token that still acts like a real card: back to the hand when bounced, to the grave when destroyed
function CardKeptToken(D) { return CardIsBoss(D) || CardIsArtifact(D); }

// the 最恐 cards in CardBossIds order: 0 冥府の魔狼, 1 深淵のスライム, 2 影の暗殺者, 3 冥府の魔女, 4 魔界の門番, 5 冥王の使い,
// 6 魔界の黒騎士, 7 炎獄の魔竜, 8 天魔の黒龍, 9 終焉の大魔王, 10 魔王の裁き, 11 冥界の業火, 12 闇の叡智, 13 魔王の号令
function CardBossCards(Lib) { return CardBossIds.map(Id => At(Lib.DB, Id)).filter(D => D !== undefined); }

// normal cards the CPU plays well
function CardBossOk(D) {
  return !D.Amulet && D.Cry.K !== fx_kind.SummonFoe && D.TurnEnd.K !== fx_kind.Fuse && D.SelfDmg <= 2;
}

// Want cards with cost Lo..Hi: epics / legends first, then rares (2 copies each)
function CardBossPick(Pool, Lo, Hi, Want) {
  const Top = Shuffle(Pool.filter(D => D.Cost >= Lo && D.Cost <= Hi && D.Rarity >= RarE && CardBossOk(D)));
  const Mid = Shuffle(Pool.filter(D => D.Cost >= Lo && D.Cost <= Hi && D.Rarity === RarR && CardBossOk(D)));
  let Out = [];
  for (const D of [...Top, ...Mid]) {
    if (Out.length < Want) Out = [...Out, D];
    if (Out.length < Want) Out = [...Out, D];
  }
  return Out;
}

function CardBossFill(Pool, Deck) {
  let Out = Deck;
  for (const D of Shuffle(Pool.filter(D0 => CardBossOk(D0)))) {
    if (Out.length < CardDeckSize) Out = [...Out, D];
  }
  return Out;
}

// the 最恐 CPU's 通常 deck (40 cards): every 最恐 card (+ a second copy of 4 cheap ones) and strong cards of the hero's pool
function CardBossDeck(Lib, HeroId) {
  const Pool = DraftPool(Lib.DB, HeroId);
  const Boss = CardBossCards(Lib);
  const Extra = [0, 1, 3, 10].map(K => At(Boss, K)).filter(D => D !== undefined);
  let Deck = [...Boss, ...Extra];
  Deck = [...Deck, ...CardBossPick(Pool, 0, 2, 6)];
  Deck = [...Deck, ...CardBossPick(Pool, 3, 3, 5)];
  Deck = [...Deck, ...CardBossPick(Pool, 4, 4, 5)];
  Deck = [...Deck, ...CardBossPick(Pool, 5, 6, 4)];
  Deck = [...Deck, ...CardBossPick(Pool, 7, 10, 2)];
  return CardBossFill(Pool, Deck);
}

// how much the 最恐 CPU wants a draft card
function CardBossValue(D) {
  let V = D.Rarity * 2.0;
  if (D.Cost >= 2 && D.Cost <= 5) V += 0.8;
  if (D.Amulet) V -= 1.0;
  if (!CardBossOk(D)) V -= 2.0;
  if (D.IsMonster()) V += (D.Atk + D.Hp - 2 * D.Cost) * 0.3;
  return V;
}

// the better option of a draft round (no randomness)
function CardBossBestOpt(Opts) {
  let Best = 0;
  let BestScore = -1000.0;
  Opts.forEach((O, I) => {
    let Sc = 0.0;
    for (const D of O) Sc += CardBossValue(D);
    if (Sc > BestScore) {
      BestScore = Sc;
      Best = I;
    }
  });
  return Best;
}

function CardBossDraftPicks(Pool, Sched) {
  let Deck = [];
  for (let R = 1; R <= DraftRounds; R++) {
    const Opts = DraftOptions(Pool, DraftRoundOf(Sched, R));
    const O = At(Opts, CardBossBestOpt(Opts));
    if (O !== undefined) Deck = [...Deck, ...O];
  }
  return Deck;
}

// the 最恐 CPU's 2Pick deck: the same rarity schedule as the player, always the better option, and its 8 weakest
// picks swapped for 最恐 cards
function CardBossDraftDeck(Lib, HeroId, Sched) {
  const Pool = DraftPool(Lib.DB, HeroId);
  const Deck = CardBossDraftPicks(Pool, Sched);
  const Boss = CardBossCards(Lib);
  const Swaps = [0, 1, 2, 3, 6, 10, 7, 9].map(K => At(Boss, K)).filter(D => D !== undefined);
  const LowN = [], LowR = [];
  Deck.forEach((D, I) => { if (D.Rarity === RarN) LowN.push(I); });
  Deck.forEach((D, I) => { if (D.Rarity === RarR) LowR.push(I); });
  const Low = [...LowN, ...LowR];
  return Deck.map((D, I) => {
    const K = ArrFind(Low, I);
    const B = K !== undefined ? At(Swaps, K) : undefined;
    return B !== undefined ? B : D;
  });
}
