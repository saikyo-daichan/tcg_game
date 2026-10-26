// text.js — card_text.verse: the rules text of the cards (built from small templates), keyword help, summoned cards.
// Ported 1:1. TxEmpty / TxNum / TxNewline / Join live in kit.js (not redefined here).
// TxAgent(P) is P.Name (a player is a JS object {Id, Name, IsActive}).
'use strict';

function TxPlus(N) { return `+${N}`; }
function TxMinus(N) { return `-${N}`; }
function TxSlash(A, B) { return `${A}/${B}`; }
const TxDot = "・";
const TxSpace = "　";
function TxPair(A, B) { return `${A}${B}`; }
function TxAnd(A, B) { return `${A}。${B}`; }
function TxAgent(A) { return A && A.Name != null ? String(A.Name) : TxEmpty; }
const TxComputer = "コンピューター";
const TxYou = "あなた";
const TxOpponent = "相手";

// ---------------------------------------------------------------- keywords
const TkTaunt = "挑発";
const TkHaste = "速攻";
const TkRush = "特攻";
const TkDeadly = "必殺";
const TkDrain = "吸血";
const TkBarrier = "バリア";
const TkStealth = "潜伏";
const TkIntimidate = "威圧";
const TkInvincible = "無敵";
const TkBlocked = "正面にモンスターがいるとプレイヤーを攻撃できない";
function TkSelf(N) { return `自傷${N}`; }
const TkNoAttack = "攻撃の対象にならない";
const TkTwoActs = "1ターンに2回行動できる";
const TkSpellCheap = "スペルをプレイするたび、手札にあるこのカードのマナ-1";
const TkAmulet = "アミュレット";
function TkCountOnly(N) { return `カウントダウン${N}`; }
function TkHeroOnly(N) { return `【${N}専用】`; }
const TkRecur = "使ったあと、このカードは手札に戻る（墓地に行かない）";
function TkArmor(N) { return `このモンスターが受けるダメージ-${N}`; }
function TkFrontDown(N) { return `正面の敵モンスターの攻撃力-${N}（正面にいる間）`; }
function TkDmgCap(A, B) { return `このモンスターが受ける${A}以上のダメージは${B}になる`; }
function TkThorns(N) { return `このモンスターを攻撃したモンスターとプレイヤーに、追加で${N}ダメージ`; }

function KwName(Code) {
  if (Code === KwTaunt) return TkTaunt;
  else if (Code === KwHaste) return TkHaste;
  else if (Code === KwRush) return TkRush;
  else if (Code === KwDeadly) return TkDeadly;
  else if (Code === KwDrain) return TkDrain;
  else if (Code === KwBarrier) return TkBarrier;
  else if (Code === KwStealth) return TkStealth;
  return TkIntimidate;
}

// ---------------------------------------------------------------- triggers and conditions
function TtCry(E) { return `叫び：${E}`; }
function TtDeath(E) { return `破壊時：${E}`; }
function TtStart(E) { return `ターン開始時：${E}`; }
function TtEnd(E) { return `ターン終了時：${E}`; }
function TtAttack(E) { return `攻撃時：${E}`; }
function TtCount(N, E) { return `カウントダウン${N}：${E}`; }
function TtEvo(E) { return `進化時：${E}`; }
function TtKill(E) { return `敵モンスターを倒したとき：${E}`; }
function TtTick(E) { return `カウントダウンが進むたび：${E}`; }
function TtHeal(E) { return `自分のプレイヤーが回復するたび：${E}`; }
function TtAllyKw(K) { return `味方モンスターが場に出るたび、そのモンスターに「${K}」を付与`; }
function TtAllyBuff(S) { return `味方モンスターが場に出るたび、そのモンスターに${S}`; }
function TcAwaken(E) { return `覚醒なら${E}`; }
function TcVenge(E) { return `復讐なら${E}`; }
function TcHand(E) { return `自分の手札が2枚以下なら${E}`; }
function TcLower(E) { return `自分のプレイヤーのHPが相手プレイヤーより少ないなら${E}`; }
function TcHurt(E) { return `このモンスターがダメージを受けているなら${E}`; }

// ---------------------------------------------------------------- effects
function TfHitFoeHero(N) { return `相手プレイヤーに${N}ダメージ`; }
function TfHealHero(N) { return `自分のプレイヤーのHPを${N}回復`; }
function TfDraw(N) { return `カードを${N}枚引く`; }
function TfHeroAtk(N) { return `このターン、自分のプレイヤーの攻撃力+${N}`; }
function TfManaUp(N) { return `最大マナ+${N}`; }
function TfHitFront(N) { return `正面の敵モンスターに${N}ダメージ`; }
const TfFreezeFront = "正面の敵モンスターを凍結";
const TfKillFront = "正面の敵モンスターを破壊";
const TfBounceFront = "正面の敵モンスターかアミュレットを手札に戻す";
function TfDebuffFront(S) { return `正面の敵モンスターに${S}`; }
function TfHitRandom(N) { return `ランダムな敵モンスター1体に${N}ダメージ`; }
function TfHitRandomTimes(N, M) { return `ランダムな敵モンスター1体に${N}ダメージを${M}回`; }
function TfHitAllFoes(N) { return `敵モンスター全体に${N}ダメージ`; }
function TfHitAllOthers(N) { return `他のモンスターすべてに${N}ダメージ`; }
function TfHitAllMonsters(N) { return `すべてのモンスターに${N}ダメージ`; }
function TfHitAllEnemies(N) { return `敵モンスター全体と相手プレイヤーに${N}ダメージ`; }
function TfDebuffAllFoes(S) { return `敵モンスター全体に${S}`; }
const TfFreezeRandom = "ランダムな敵モンスター1体を凍結";
const TfFreezeAll = "敵モンスター全体を凍結";
function TfBuffOthers(S) { return `他の味方モンスター全員に${S}`; }
function TfBuffAll(S) { return `味方モンスター全員に${S}`; }
function TfBuffRandomAlly(S) { return `ランダムな他の味方モンスター1体に${S}`; }
function TfHealAllies(N) { return `味方モンスター全員のHPを${N}回復`; }
const TfHealAlliesFull = "味方モンスター全員のHPを全回復";
function TfBuffSelf(S) { return `このモンスターに${S}`; }
function TfHealSelf(N) { return `このモンスターのHPを${N}回復`; }
function TfSelfKw(K) { return `このモンスターは「${K}」を得る`; }
function TfAllyKwOthers(K) { return `他の味方モンスター全員に「${K}」を付与`; }
function TfAllyKwAll(K) { return `味方モンスター全員に「${K}」を付与`; }
function TfAddCard(C, N) { return `手札に「${C}」を${N}枚加える`; }
function TfAddRandom(N) { return `手札にランダムなカードを${N}枚加える`; }
function TfAddSpell(N) { return `手札にランダムなスペルを${N}枚加える`; }
function TfAddLegend(N) { return `手札にランダムなレジェンドカードを${N}枚加える`; }
function TfSummon(C) { return `「${C}」を召喚`; }
function TfSummonN(C, N) { return `「${C}」を${N}体まで召喚`; }
function TfTransform(C) { return `このカードを破壊し「${C}」を召喚`; }
function TfGraveToHand(N) { return `自分の墓地からランダムに${N}枚を手札に加える`; }
function TfGraveRevive(N) { return `自分の墓地からマナ${N}以下のモンスターをランダムに1体召喚`; }
function TfGraveReviveN(N, M) { return `自分の墓地からマナ${N}以下のモンスターをランダムに最大${M}体召喚`; }
function TfGraveFill(N) { return `自分の墓地から、合計マナ${N}以下になるようにモンスターをランダムに空きマスの数まで召喚`; }
const TfEvolveAllies = "他の味方モンスター全員を進化させる";
function TfTutor(N) { return `山札からマナ${N}以下のカードを1枚手札に加える`; }
function TfHandDiscount(N) { return `手札のカードすべてのマナ-${N}`; }
function TfHandDiscountMon(N) { return `手札のモンスターカードすべてのマナ-${N}`; }
function TfDrawDiscard(N) { return `カードを${N}枚引き、手札をランダムに${N}枚捨てる`; }
function TfShieldUp(N) { return `自分のプレイヤーはシールド${N}を得る`; }
function TfHeroMaxUp(N) { return `自分のプレイヤーの最大HP+${N}（${N}回復）`; }
function TfGainMana(N) { return `マナを${N}回復`; }
function TfEvoUp(N) { return `進化ポイント+${N}`; }
function TfHitTarget(N) { return `敵モンスター1体に${N}ダメージ`; }
function TfFreezeHit(N) { return `敵モンスター1体に${N}ダメージを与え、凍結`; }
const TfFreezeTarget = "敵モンスター1体を凍結";
function TfDebuffTarget(S) { return `敵モンスター1体に${S}`; }
const TfDestroyTarget = "敵モンスター1体を破壊";
function TfHealTarget(N) { return `味方モンスター1体のHPを${N}回復`; }
function TfBuffTarget(S) { return `味方モンスター1体に${S}`; }
function TfGiveKw(K) { return `味方モンスター1体に「${K}」を付与`; }
const TfBounce = "モンスター1体を持ち主の手札に戻す";
function TfSummonAt(C) { return `空きマスに「${C}」を召喚`; }
const TfSummonSlime = "空きマスにスライムを1体召喚（1/2挑発・1/1速攻・2/2のどれか）";
const TfKillRandomFoe = "ランダムな敵モンスター1体を破壊";
function TfDebuffRandomFoe(S) { return `ランダムな敵モンスター1体に${S}`; }
function TfBuffSelfTurn(N) { return `ターン終了までこのモンスターの攻撃力+${N}`; }
function TfHitAny(N) { return `モンスターかプレイヤー1体に${N}ダメージ`; }
function TfSummonKw(C, K) { return `「${C}」を召喚し、「${K}」を付与`; }
function TfHitRandomEnemy(N, M) { return `ランダムな敵モンスターか相手プレイヤーに${N}ダメージ。これを${M}回行う`; }
function TfTutorHigh(N, M) { return `山札からマナ${N}以上のカードをランダムに${M}枚手札に加える`; }
function TfTutorSpell(N) { return `山札からスペルをランダムに${N}枚手札に加える`; }
function TfHealRandomAlly(N) { return `ランダムな味方モンスター1体のHPを${N}回復`; }
function TfFreezeHitRandom(N) { return `ランダムな敵モンスター1体に${N}ダメージを与え、凍結`; }
function TfHitFrontWide(N) { return `正面とその両隣の敵モンスターに${N}ダメージ`; }
function TfHealRandomAny(N, M) { return `ランダムなモンスター1体（敵味方問わず）のHPを${N}回復。これを${M}回行う`; }
function TfHealTeam(N) { return `味方モンスター全員と自分のプレイヤーのHPを${N}回復`; }
const TfDevourFoe = "敵モンスター1体を破壊し、その攻撃力と体力を得る";
function TfAddCardDear(C, N, M) { return `手札に「${C}」を${N}枚加え、それらのマナ+${M}`; }
function TsAtkUpHpDown(A, H) { return `攻撃力+${A}・体力-${H}`; }
function TfHitEnemy(N) { return `敵モンスター1体か相手プレイヤーに${N}ダメージ`; }
function TfAddCardCheap(C, N, M) { return `手札に「${C}」を${N}枚加え、それらのマナ-${M}`; }
function TfHealOthers(N) { return `他の味方モンスター全員のHPを${N}回復`; }
const TfBounceTwo = "モンスターを2体選び、持ち主の手札に戻す";
function TfFuse(P, C) { return `「${P}」がいるなら合体して「${C}」になる`; }
const TfKillAllOthers = "他のモンスターすべてを破壊";
function TfManaNext(N) { return `次の自分のターン、マナ+${N}（そのターンだけ）`; }
function TfDiscountRandom(N, M) { return `手札のランダムなカード1枚のマナ-${N}。これを${M}回行う`; }
function TfAdvanceAll(N) { return `自分のアミュレットすべてのカウントダウンを${N}進める`; }
function TfDiscountPick(N) { return `手札のカードを1枚選び、そのマナ-${N}`; }
const TfDevour = "他の味方モンスター1体を破壊し、その攻撃力と体力を得る";
function TfAdvanceTarget(N) { return `自分のアミュレット1つのカウントダウンを${N}進める`; }
const TfDestroyAmulet = "アミュレット1つを破壊";
function TfBuffOther(S) { return `他の味方モンスター1体に${S}`; }
const TfKillSelf = "このモンスターは破壊される";
const TfReturnSelf = "このモンスターは手札に戻る";
function TfDrawBoth(N) { return `お互いにカードを${N}枚引く`; }
function TfDrawCheap(N, M) { return `カードを${N}枚引き、そのカードのマナ-${M}`; }
function TfGravePick(N) { return `自分の墓地からカードを${N}枚選び、手札に加える`; }
function TfFoeHandToDeck(N) { return `相手の手札をランダムに${N}枚山札に戻し、シャッフルする`; }
function TfHitOwnHero(N) { return `自分のプレイヤーに${N}ダメージ`; }
function TfHitFrontSplash(N, M) { return `正面の敵モンスターに${N}ダメージ、その両隣にも${M}ダメージ`; }
function TfSummonRushBuff(C, N, M) { return `「${C}」を${N}体まで召喚し、それらに「特攻」と攻撃力+${M}を付与`; }
function TfHitAllMonsters2(N) { return `自分を含むすべてのモンスターに${N}ダメージ`; }
function TfHitSelf(N) { return `このモンスターに${N}ダメージ`; }
function TfHitRandomAny(N) { return `ランダムなモンスター1体（敵味方問わず）に${N}ダメージ`; }
function TfHitRandomAnyTimes(N, M) { return `ランダムなモンスター1体（敵味方問わず）に${N}ダメージ。これを${M}回行う`; }
function TfSummonFoe(C) { return `相手の場のランダムなマスに「${C}」を召喚`; }
function TfIfAllyBuff(C, S) { return `自分の場に「${C}」がいるなら、このモンスターに${S}`; }
function TfIfAllyKw(C, K) { return `自分の場に「${C}」がいるなら、このモンスターは「${K}」を得る`; }
function TfFoeDiscard(N) { return `相手の手札をランダムに${N}枚捨てる`; }
function TfDeckSummon(N) { return `山札からマナ${N}以下のモンスターをランダムに1体召喚`; }
function TfGravePickSummon(N) { return `自分の墓地からマナ${N}以下のモンスターを1体選び、召喚`; }
function TfSummonTrump(N, M) { return `ランダムな「トランプ兵」を${N}体まで召喚し、それらに+${M}/+${M}`; }
const TfKillAttackTarget = "攻撃するモンスターを、戦闘の前に破壊する";
const TfSilenceFront = "正面の敵モンスターの効果を消滅させる";
const TfSpellLock = "相手は次のターン、スペルを使えない";
function TfChoose(A, B) { return `次のどちらかを選んで発動：\n・${A}\n・${B}`; }
function TfGraveFillPick(N) { return `自分の墓地から、合計マナ${N}以下になるようにモンスターを好きなだけ選んで召喚（場が埋まるまで）`; }
function TfAddRandomCheap(N, M) { return `手札にランダムなカードを${N}枚加え、それらのマナ-${M}`; }
function TfTutorSpellCheap(N, M) { return `山札からスペルをランダムに${N}枚手札に加え、それのマナ-${M}`; }
function TfAddFull(C) { return `手札がいっぱいになるまで「${C}」を加える`; }
function TfAddArtifact(N) { return `手札にランダムなアーティファクトを${N}枚加える`; }
function TfHandKw(C, K) { return `手札の「${C}」すべてに「${K}」を付与`; }
const TfVanishSelf = "このモンスターは消滅する";
const TfKillOwnOthers = "自分の他のモンスターとアミュレットをすべて破壊";
const TfDestroyAlly = "自分の味方モンスター1体を破壊する";
const TfBounceAny = "場にあるモンスターまたはアミュレットを持ち主の手札に戻す";
function TfArtifactDeck(N) { return `自分の山札を、ランダムなアーティファクト${N}枚にする`; }
function TfHeroEndSummon(C) { return `自分のリーダーは「ターン終了時：「${C}」を召喚する」を得る`; }
// a keyword the card got in the hand, above its own text
function TcGotKw(K, B) { return `${K}\n${B}`; }
function TsBuff(A, H) { return `+${A}/+${H}`; }
function TsAtkUp(A) { return `攻撃力+${A}`; }
function TsHpUp(H) { return `体力+${H}`; }
function TsDebuff(A, H) { return `-${A}/-${H}`; }
function TsAtkDown(A) { return `攻撃力-${A}`; }
function TsHpDown(H) { return `体力-${H}`; }

function BuffText(A, H) {
  if (A > 0 && H < 0) return TsAtkUpHpDown(A, -H);
  else if (A > 0 && H > 0) return TsBuff(A, H);
  else if (A > 0) return TsAtkUp(A);
  return TsHpUp(H);
}

function DebuffText(A, H) {
  if (A > 0 && H > 0) return TsDebuff(A, H);
  else if (A > 0) return TsAtkDown(A);
  return TsHpDown(H);
}

// the rules text of one effect (IsSpell: "all allies" instead of "other allies")
function FxText(DB, F, IsSpell) {
  const N = F.N;
  const M = F.M;
  const K = F.K;
  const D = At(DB, F.C);
  const CardName = D ? D.Name : TxEmpty;
  let E;
  if (IsNewFx(K)) E = FxTextNew(DB, F, IsSpell);
  else if (K === fx_kind.HitFoeHero) E = TfHitFoeHero(N);
  else if (K === fx_kind.HealHero) E = TfHealHero(N);
  else if (K === fx_kind.Draw) E = TfDraw(N);
  else if (K === fx_kind.HeroAtk) E = TfHeroAtk(N);
  else if (K === fx_kind.ManaUp) E = TfManaUp(N);
  else if (K === fx_kind.HitFront) E = TfHitFront(N);
  else if (K === fx_kind.FreezeFront) E = TfFreezeFront;
  else if (K === fx_kind.KillFront) E = TfKillFront;
  else if (K === fx_kind.BounceFront) E = TfBounceFront;
  else if (K === fx_kind.DebuffFront) E = TfDebuffFront(DebuffText(N, M));
  else if (K === fx_kind.HitRandomFoe) E = (M > 1 ? TfHitRandomTimes(N, M) : TfHitRandom(N));
  else if (K === fx_kind.HitAllFoes) E = TfHitAllFoes(N);
  else if (K === fx_kind.HitAllOthers) E = (IsSpell ? TfHitAllMonsters(N) : TfHitAllOthers(N));
  else if (K === fx_kind.HitAllEnemies) E = TfHitAllEnemies(N);
  else if (K === fx_kind.DebuffAllFoes) E = TfDebuffAllFoes(DebuffText(N, M));
  else if (K === fx_kind.FreezeRandom) E = TfFreezeRandom;
  else if (K === fx_kind.FreezeAll) E = TfFreezeAll;
  else if (K === fx_kind.BuffAllies) E = (IsSpell ? TfBuffAll(BuffText(N, M)) : TfBuffOthers(BuffText(N, M)));
  else if (K === fx_kind.BuffRandomAlly) E = TfBuffRandomAlly(BuffText(N, M));
  else if (K === fx_kind.HealAllies) E = (M === 1 ? TfHealOthers(N) : N >= 9 ? TfHealAlliesFull : TfHealAllies(N));
  else if (K === fx_kind.BuffSelf) E = TfBuffSelf(BuffText(N, M));
  else if (K === fx_kind.HealSelf) E = TfHealSelf(N);
  else if (K === fx_kind.SelfKw) E = TfSelfKw(KwName(N));
  else if (K === fx_kind.AllyKw) E = (IsSpell ? TfAllyKwAll(KwName(N)) : TfAllyKwOthers(KwName(N)));
  else if (K === fx_kind.AddCard && N >= CardMaxHand && F.C >= 0) E = TfAddFull(CardName);
  else if (K === fx_kind.AddCard && F.C === CardRandomArtifact) E = TfAddArtifact(N);
  else if (K === fx_kind.AddCard && M > 0 && F.C >= 0) E = TfAddCardCheap(CardName, N, M);
  else if (K === fx_kind.AddCard && M < 0 && F.C >= 0) E = TfAddCardDear(CardName, N, -M);
  else if (K === fx_kind.AddCard && M > 0 && F.C === CardRandomAny) E = TfAddRandomCheap(N, M);
  else if (K === fx_kind.AddCard) E = (F.C === CardRandomAny ? TfAddRandom(N) : F.C === CardRandomSpell ? TfAddSpell(N) : F.C === CardRandomLegend ? TfAddLegend(N) : TfAddCard(CardName, N));
  else if (K === fx_kind.Summon) E = (N > 1 ? TfSummonN(CardName, N) : TfSummon(CardName));
  else if (K === fx_kind.Transform) E = TfTransform(CardName);
  else if (K === fx_kind.GraveToHand) E = TfGraveToHand(N);
  else if (K === fx_kind.GraveRevive) E = (M > 1 ? TfGraveReviveN(N, M) : TfGraveRevive(N));
  else if (K === fx_kind.GraveFill) E = TfGraveFillPick(N);
  else if (K === fx_kind.EvolveAllies) E = TfEvolveAllies;
  else if (K === fx_kind.Tutor) E = TfTutor(N);
  else if (K === fx_kind.HandDiscount) E = (M === 1 ? TfHandDiscountMon(N) : TfHandDiscount(N));
  else if (K === fx_kind.DrawDiscard) E = TfDrawDiscard(N);
  else if (K === fx_kind.ShieldUp) E = TfShieldUp(N);
  else if (K === fx_kind.HeroMaxUp) E = TfHeroMaxUp(N);
  else if (K === fx_kind.GainMana) E = TfGainMana(N);
  else if (K === fx_kind.EvoUp) E = TfEvoUp(N);
  else if (K === fx_kind.HitTarget) E = TfHitTarget(N);
  else if (K === fx_kind.FreezeHit) E = (N > 0 ? TfFreezeHit(N) : TfFreezeTarget);
  else if (K === fx_kind.DebuffTarget) E = TfDebuffTarget(DebuffText(N, M));
  else if (K === fx_kind.DestroyTarget) E = TfDestroyTarget;
  else if (K === fx_kind.HealTarget) E = TfHealTarget(N);
  else if (K === fx_kind.BuffTarget) E = TfBuffTarget(BuffText(N, M));
  else if (K === fx_kind.GiveKw) E = TfGiveKw(KwName(N));
  else if (K === fx_kind.Bounce) E = TfBounce;
  else if (K === fx_kind.SummonAt) E = (F.C < 0 ? TfSummonSlime : TfSummonAt(CardName));
  else if (K === fx_kind.KillRandomFoe) E = TfKillRandomFoe;
  else if (K === fx_kind.DebuffRandomFoe) E = TfDebuffRandomFoe(DebuffText(N, M));
  else if (K === fx_kind.BuffSelfTurn) E = TfBuffSelfTurn(N);
  else if (K === fx_kind.HitAny) E = TfHitAny(N);
  else if (K === fx_kind.BounceTwo) E = TfBounceTwo;
  else if (K === fx_kind.SummonKw) E = TfSummonKw(CardName, KwName(N));
  else if (K === fx_kind.HitRandomEnemy) E = TfHitRandomEnemy(N, Max(1, M));
  else if (K === fx_kind.TutorHigh) E = TfTutorHigh(N, Max(1, M));
  else if (K === fx_kind.TutorSpell) E = (M > 0 ? TfTutorSpellCheap(Max(1, N), M) : TfTutorSpell(Max(1, N)));
  else if (K === fx_kind.HealRandomAlly) E = TfHealRandomAlly(N);
  else if (K === fx_kind.FreezeHitRandom) E = TfFreezeHitRandom(N);
  else if (K === fx_kind.HitFrontWide) E = TfHitFrontWide(N);
  else if (K === fx_kind.HitEnemy) E = TfHitEnemy(N);
  else if (K === fx_kind.HealRandomAny) E = TfHealRandomAny(N, Max(1, M));
  else if (K === fx_kind.HealTeam) E = TfHealTeam(N);
  else if (K === fx_kind.DevourFoe) E = TfDevourFoe;
  else if (K === fx_kind.Fuse) { const P0 = At(DB, M); E = TfFuse(P0 ? P0.Name : TxEmpty, CardName); }
  else if (K === fx_kind.KillAllOthers) E = TfKillAllOthers;
  else if (K === fx_kind.ManaNext) E = TfManaNext(N);
  else if (K === fx_kind.DiscountRandom) E = TfDiscountRandom(N, Max(1, M));
  else if (K === fx_kind.AdvanceAll) E = TfAdvanceAll(N);
  else if (K === fx_kind.DiscountPick) E = TfDiscountPick(N);
  else if (K === fx_kind.Devour) E = TfDevour;
  else if (K === fx_kind.AdvanceTarget) E = TfAdvanceTarget(N);
  else if (K === fx_kind.DestroyAmulet) E = TfDestroyAmulet;
  else E = TxEmpty;
  if (F.Cond === 1) return TcAwaken(E); else if (F.Cond === 2) return TcVenge(E); else if (F.Cond === 3) return TcHand(E); else if (F.Cond === 4) return TcLower(E);
  else if (F.Cond === 5) return TcHurt(E);
  return E;
}

// the texts of the v14 effects (FxText hands them over)
function FxTextNew(DB, F, IsSpell) {
  const N = F.N;
  const M = F.M;
  const K = F.K;
  const D = At(DB, F.C);
  const CardName = D ? D.Name : TxEmpty;
  if (K === fx_kind.BuffOther) return TfBuffOther(BuffText(N, M));
  else if (K === fx_kind.KillSelf) return TfKillSelf;
  else if (K === fx_kind.ReturnSelf) return TfReturnSelf;
  else if (K === fx_kind.DrawBoth) return TfDrawBoth(N);
  else if (K === fx_kind.DrawCheap) return TfDrawCheap(N, M);
  else if (K === fx_kind.GravePick) return TfGravePick(Max(1, N));
  else if (K === fx_kind.FoeHandToDeck) return TfFoeHandToDeck(Max(1, N));
  else if (K === fx_kind.HitOwnHero) return TfHitOwnHero(N);
  else if (K === fx_kind.HitFrontSplash) return TfHitFrontSplash(N, M);
  else if (K === fx_kind.SummonRushBuff) return TfSummonRushBuff(CardName, N, M);
  else if (K === fx_kind.HitAllMonsters) return (IsSpell ? TfHitAllMonsters(N) : TfHitAllMonsters2(N));
  else if (K === fx_kind.HitSelf) return TfHitSelf(N);
  else if (K === fx_kind.HitRandomAny) return (M > 1 ? TfHitRandomAnyTimes(N, M) : TfHitRandomAny(N));
  else if (K === fx_kind.SummonFoe) return TfSummonFoe(CardName);
  else if (K === fx_kind.IfAllyBuff) return TfIfAllyBuff(CardName, BuffText(N, M));
  else if (K === fx_kind.IfAllyKw) return TfIfAllyKw(CardName, KwName(N));
  else if (K === fx_kind.FoeDiscard) return TfFoeDiscard(Max(1, N));
  else if (K === fx_kind.DeckSummon) return TfDeckSummon(N);
  else if (K === fx_kind.GravePickSummon) return TfGravePickSummon(N);
  else if (K === fx_kind.SummonTrump) return TfSummonTrump(N, M);
  else if (K === fx_kind.KillAttackTarget) return TfKillAttackTarget;
  else if (K === fx_kind.SilenceFront) return TfSilenceFront;
  else if (K === fx_kind.SpellLock) return TfSpellLock;
  else if (K === fx_kind.Choose) {
    const A = At(DB, F.C), B = At(DB, M);
    return TfChoose(A ? FxText(DB, A.Spell, true) : TxEmpty, B ? FxText(DB, B.Spell, true) : TxEmpty);
  }
  else if (K === fx_kind.HandKw) return TfHandKw(CardName, KwName(N));
  else if (K === fx_kind.VanishSelf) return TfVanishSelf;
  else if (K === fx_kind.KillOwnOthers) return TfKillOwnOthers;
  else if (K === fx_kind.ArtifactDeck) return TfArtifactDeck(N);
  else if (K === fx_kind.HeroEndSummon) return TfHeroEndSummon(CardName);
  else if (K === fx_kind.DestroyAlly) return TfDestroyAlly;
  else if (K === fx_kind.BounceAny) return TfBounceAny;
  return TxEmpty;
}

// two effects of the same trigger in one sentence
function FxText2(DB, A, B, IsSpell) {
  if (B.K === fx_kind.None) return FxText(DB, A, IsSpell);
  return TxAnd(FxText(DB, A, IsSpell), FxText(DB, B, IsSpell));
}

// the text printed on the card
function CardText(DB, D) {
  let Lines = [];
  if (D.HeroOnly >= 0) Lines = [...Lines, TkHeroOnly(HeroNameOf(D.HeroOnly))];
  let Kws = [];
  if (D.Amulet) Kws = [...Kws, TkAmulet];
  if (D.Taunt) Kws = [...Kws, TkTaunt];
  if (D.Haste) Kws = [...Kws, TkHaste];
  if (D.Rush) Kws = [...Kws, TkRush];
  if (D.Deadly) Kws = [...Kws, TkDeadly];
  if (D.Drain) Kws = [...Kws, TkDrain];
  if (D.Barrier) Kws = [...Kws, TkBarrier];
  if (D.Stealth) Kws = [...Kws, TkStealth];
  if (D.Intimidate) Kws = [...Kws, TkIntimidate];
  if (D.Invincible) Kws = [...Kws, TkInvincible];
  if (D.SelfDmg > 0) Kws = [...Kws, TkSelf(D.SelfDmg)];
  if (Kws.length > 0) Lines = [...Lines, Join(Kws, TxDot)];
  if (D.Blocked) Lines = [...Lines, TkBlocked];
  if (D.NoAttackTarget) Lines = [...Lines, TkNoAttack];
  if (D.TwoActs) Lines = [...Lines, TkTwoActs];
  if (D.Armor > 0) Lines = [...Lines, TkArmor(D.Armor)];
  if (D.DmgCap > 0) Lines = [...Lines, TkDmgCap(D.DmgCap + 1, D.DmgCap)];
  if (D.Thorns > 0) Lines = [...Lines, TkThorns(D.Thorns)];
  if (D.FrontAtkDown > 0) Lines = [...Lines, TkFrontDown(D.FrontAtkDown)];
  if (D.SpellCheaper) Lines = [...Lines, TkSpellCheap];
  if (D.IsSpell) {
    Lines = [...Lines, FxText2(DB, D.Spell, D.Spell2, true)];
    if (D.Recur) Lines = [...Lines, TkRecur];
  } else {
    if (D.Cry.K !== fx_kind.None) Lines = [...Lines, TtCry(FxText2(DB, D.Cry, D.Cry2, false))];
    if (D.Countdown > 0) Lines = [...Lines, D.CdFx.K === fx_kind.None ? TkCountOnly(D.Countdown) : TtCount(D.Countdown, FxText(DB, D.CdFx, false))];
    if (D.CdTick.K !== fx_kind.None) Lines = [...Lines, TtTick(FxText(DB, D.CdTick, false))];
    if (D.AllySum.K === fx_kind.SelfKw) Lines = [...Lines, TtAllyKw(KwName(D.AllySum.N))];
    else if (D.AllySum.K === fx_kind.BuffSelf) Lines = [...Lines, TtAllyBuff(BuffText(D.AllySum.N, D.AllySum.M))];
    if (D.TurnStart.K !== fx_kind.None) Lines = [...Lines, TtStart(FxText(DB, D.TurnStart, false))];
    if (D.TurnEnd.K !== fx_kind.None) Lines = [...Lines, TtEnd(FxText(DB, D.TurnEnd, false))];
    if (D.OnAttack.K !== fx_kind.None) Lines = [...Lines, TtAttack(FxText(DB, D.OnAttack, false))];
    if (D.OnKill.K !== fx_kind.None) Lines = [...Lines, TtKill(FxText(DB, D.OnKill, false))];
    if (D.OnHeal.K !== fx_kind.None) Lines = [...Lines, TtHeal(FxText(DB, D.OnHeal, false))];
    if (D.Death.K !== fx_kind.None) Lines = [...Lines, TtDeath(FxText2(DB, D.Death, D.Death2, false))];
    if (D.Evo.K !== fx_kind.None) Lines = [...Lines, TtEvo(FxText2(DB, D.Evo, D.Evo2, false))];
  }
  if (Lines.length === 0) return D.Flavor;
  return Join(Lines, TxNewline);
}

// rough number of wrapped rows CardText needs on a card (messages can't be measured): picks the font size
function CardTextRows(D) {
  let R = 0;
  if (D.HeroOnly >= 0) R += 1;
  if (D.Amulet || D.Taunt || D.Haste || D.Rush || D.Deadly || D.Drain || D.Barrier || D.Stealth || D.Intimidate || D.Invincible || D.SelfDmg > 0) R += 1;
  if (D.Blocked) R += 1;
  if (D.IsSpell) {
    R += 2;
    if (D.Spell2.K !== fx_kind.None) R += 2;
    if (D.Recur) R += 2;
  } else {
    if (D.Armor > 0) R += 1;
    if (D.DmgCap > 0) R += 2;
    if (D.Thorns > 0) R += 2;
    if (D.FrontAtkDown > 0) R += 2;
    for (const F of [D.Cry, D.CdFx, D.CdTick, D.AllySum, D.TurnStart, D.TurnEnd, D.OnAttack, D.Death, D.Evo]) if (F.K !== fx_kind.None) R += 2;
    if (D.Cry2.K !== fx_kind.None) R += 2;
    // どちらかを選ぶ: two more lines
    if (D.Cry.K === fx_kind.Choose) R += 2;
    if (D.Evo2.K !== fx_kind.None) R += 2;
    if (D.Death2.K !== fx_kind.None) R += 2;
    if (D.OnKill.K !== fx_kind.None) R += 2;
    if (D.OnHeal.K !== fx_kind.None) R += 2;
    if (D.NoAttackTarget) R += 1;
    if (D.TwoActs) R += 1;
  }
  if (D.SpellCheaper) R += 2;
  return R;
}

// ---------------------------------------------------------------- the help under the enlarged card
const ThNormal = "【ノーマル】";
const ThRare = "【レア】";
const ThEpic = "【エピック】";
const ThLegend = "【レジェンド】";
const ThSpell = "スペル：使い切りの魔法カード。";
const ThToken = "トークン：効果で召喚されるモンスター。";
const ThBoss = "【最恐専用】最恐のCPUだけが使う特別なカード。";
const ThTaunt = "【挑発】敵はこのモンスターを優先して攻撃しなければならない。";
const ThHaste = "【速攻】召喚したターンから行動できる。";
const ThRush = "【特攻】召喚したターンでもモンスターには攻撃できる（プレイヤーには攻撃できない）。";
const ThDeadly = "【必殺】戦闘したモンスターを必ず破壊する（プレイヤーには効かない）。";
const ThDrain = "【吸血】与えたダメージの分だけ自分のプレイヤーを回復する。";
const ThBarrier = "【バリア】次に受けるダメージを1度だけ無効にする。";
const ThStealth = "【潜伏】自分から攻撃するまで、相手の攻撃・スペル・効果の対象にならない。";
const ThIntimidate = "【威圧】相手の攻撃・スペル・効果の対象にならない。全体やランダムの効果は受ける。";
const ThInvincible = "【無敵】ダメージを受けず、効果でも破壊されない。";
const ThSelf = "【自傷】使ったとき、自分のプレイヤーがダメージを受ける。";
const ThCount = "【カウントダウン】自分のターン開始時に1減り、0になると効果が発動する。";
const ThCry = "【叫び】手札から召喚したときに発動する。";
const ThDeath = "【破壊時】破壊されたときに発動する。";
const ThTurn = "【ターン開始時／終了時】自分のターンのはじめ／おわりに発動する。";
const ThAttack = "【攻撃時】このモンスターが攻撃するときに発動する。";
const ThAwaken = "【覚醒】自分の最大マナが7以上のとき。";
const ThVenge = "【復讐】自分のプレイヤーのHPが10以下のとき。";
function ThEvo(A, H, X, Y) { return `【進化】進化すると+${A}/+${H}（攻撃力${X}・体力${Y}）になり、そのターンは「特攻」を得る。`; }
const ThMove = "モンスターは正面か斜め前の敵、または相手プレイヤーを攻撃できる。攻撃の代わりに隣の空きマスへ移動もできる。";
function ThGiven(K) { return `《付与》${K}`; }
const ThAmulet = "【アミュレット】盤面のマスを1つ使う。攻撃できず、攻撃や「モンスター」を選ぶ効果も受けない。カウントダウンを持つものは0になると発動して破壊される。";
function ThHeroOnly(N) { return `【専用カード】${N}を使うときだけ2Pickに出てくる。`; }
const ThKwOne = "※挑発・潜伏・無敵・威圧は1体につき1つまで（他のものを付与しても失敗する）。";
const ThTick = "【カウントダウンが進むたび】カウントダウンが1減るたびに発動する。";
const ThSilence = "【効果消滅】そのモンスターのカードの効果とキーワード（挑発・バリア・威圧・無敵なども）がすべて消える。威圧・潜伏のモンスターにも効く。攻撃力・体力の変化はそのまま。";
const ThSpellLock = "【スペル封印】相手は次の自分のターンのあいだ、スペルカードを使えない。";
const ThVanish = "【消滅】破壊ではなく場から消える。無敵でも消え、破壊時の効果は発動せず、墓地にも行かない。";
const ThArtifact = "【アーティファクト】AF-A・AF-D・AF-H・AF-B・AF-S・AF-N・AF-C・AF-M のどれか（効果でしか手に入らない。AF-Mはまれ）。";

function HasCond(D, C) {
  for (const F of [D.Cry, D.Cry2, D.Death, D.TurnStart, D.TurnEnd, D.OnAttack, D.Evo, D.Evo2, D.Spell, D.Spell2, D.CdFx]) {
    if (F.Cond === C) return true;
  }
  return false;
}

function KeywordHelp(D) {
  let L = [D.Rarity === RarL ? ThLegend : D.Rarity === RarE ? ThEpic : D.Rarity === RarR ? ThRare : ThNormal];
  if (D.HeroOnly >= 0) L = [...L, ThHeroOnly(HeroNameOf(D.HeroOnly))];
  if (D.IsSpell) L = [...L, ThSpell];
  if (D.Amulet) L = [...L, ThAmulet];
  if (CardIsBoss(D)) L = [...L, ThBoss]; else if (CardIsArtifact(D)) L = [...L, ThArtifact]; else if (D.Token) L = [...L, ThToken];
  if (D.Taunt) L = [...L, ThTaunt];
  if (D.Haste) L = [...L, ThHaste];
  if (D.Rush) L = [...L, ThRush];
  if (D.Deadly) L = [...L, ThDeadly];
  if (D.Drain) L = [...L, ThDrain];
  if (D.Barrier) L = [...L, ThBarrier];
  if (D.Stealth) L = [...L, ThStealth];
  if (D.Intimidate) L = [...L, ThIntimidate];
  if (D.Invincible) L = [...L, ThInvincible];
  if (D.SelfDmg > 0) L = [...L, ThSelf];
  if (D.Countdown > 0) L = [...L, ThCount];
  if (D.CdTick.K !== fx_kind.None) L = [...L, ThTick];
  if (D.Taunt || D.Stealth || D.Intimidate || D.Invincible) L = [...L, ThKwOne];
  if (D.Cry.K !== fx_kind.None) L = [...L, ThCry];
  if (D.Death.K !== fx_kind.None) L = [...L, ThDeath];
  if (D.TurnStart.K !== fx_kind.None || D.TurnEnd.K !== fx_kind.None) L = [...L, ThTurn];
  if (D.OnAttack.K !== fx_kind.None) L = [...L, ThAttack];
  if (HasCond(D, 1)) L = [...L, ThAwaken];
  if (HasCond(D, 2)) L = [...L, ThVenge];
  if (D.Cry.K === fx_kind.SilenceFront) L = [...L, ThSilence];
  if (D.Cry.K === fx_kind.SpellLock) L = [...L, ThSpellLock];
  if (D.CdFx.K === fx_kind.VanishSelf) L = [...L, ThVanish];
  if (D.TurnStart.C === CardRandomArtifact) L = [...L, ThArtifact];
  if (D.IsMonster()) {
    L = [...L, ThEvo(D.EvoAtk, D.EvoHp, D.Atk + D.EvoAtk, D.Hp + D.EvoHp)];
    L = [...L, ThMove];
  }
  return Join(L, TxNewline);
}

// the hero's jewel skill as text
function JewelText(DB, H) { return FxText(DB, H.Jewel, true); }

// ---------------------------------------------------------------- the cards a card summons (shown under its help)
const ThSummons = "【登場するカード】";
function TsSummonMon(N, C, A, H, T) { return `▼${N}（コスト${C}・攻撃${A}/体力${H}）\n${T}`; }
function TsSummonPlain(N, C, A, H) { return `▼${N}（コスト${C}・攻撃${A}/体力${H}）効果なし`; }
function TsSummonCard(N, C, T) { return `▼${N}（コスト${C}）\n${T}`; }

function SummonInfo(DB, D) {
  if (D.IsMonster()) {
    const Rows = CardTextRows(D);
    return Rows > 0 ? TsSummonMon(D.Name, D.Cost, D.Atk, D.Hp, CardText(DB, D)) : TsSummonPlain(D.Name, D.Cost, D.Atk, D.Hp);
  }
  return TsSummonCard(D.Name, D.Cost, CardText(DB, D));
}

const ThAdded = "【手札に加わるカード】";

// the other cards D's effects summon / turn into (Hand = false) or add to the hand (Hand = true)
function SummonedCards(DB, D, Hand) {
  let Ids = [];
  for (const F of [D.Cry, D.Cry2, D.Death, D.Death2, D.TurnStart, D.TurnEnd, D.OnAttack, D.OnKill, D.Evo, D.Evo2, D.Spell, D.Spell2, D.CdFx, D.CdTick]) {
    const K = F.K;
    const IsAdd = K === fx_kind.AddCard;
    const IsSummon = K === fx_kind.Summon || K === fx_kind.SummonAt || K === fx_kind.SummonKw || K === fx_kind.Transform || K === fx_kind.Fuse || K === fx_kind.SummonRushBuff || K === fx_kind.SummonFoe;
    if ((Hand ? IsAdd : IsSummon) && F.C >= 0 && F.C !== D.Id && !Ids.includes(F.C)) Ids = [...Ids, F.C];
    if (K === fx_kind.SummonTrump && !Hand) {
      for (const T of CardTrumpIds) if (!Ids.includes(T)) Ids = [...Ids, T];
    }
  }
  return Ids.map(Id => At(DB, Id)).filter(C => C !== undefined);
}

// the help of a card with the cards it summons and the cards it adds to the hand
function HelpWithSummons(DB, D) {
  const Sum = SummonedCards(DB, D, false);
  const Add = SummonedCards(DB, D, true);
  let L = [KeywordHelp(D)];
  if (Sum.length > 0) L = [...L, ThSummons, ...Sum.map(C => SummonInfo(DB, C))];
  if (Add.length > 0) L = [...L, ThAdded, ...Add.map(C => SummonInfo(DB, C))];
  return Join(L, TxNewline);
}
