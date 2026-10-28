// tutorial.js — card_tutorial.verse: the tutorial match, a fixed little game against the CPU (enemy HP 5) that shows
// the player every basic rule. card_match plays it when its Tut is set: the player's input only allows the step the
// tutorial asks for, the decks are dealt in order and the CPU follows the script below instead of thinking.
// Ported 1:1 (offline only). card_tutorial.Cur() returns the step or undefined.
'use strict';

// one thing the player is asked to do
// Kind: 1 play card CardId, 2 attack with the monster CardId, 4 use the jewel skill (free in the tutorial), 5 end the turn
// Dst: the UI id (seen by the player) to play / attack on; -9 any legal one, TutGhostMine / TutGhostFoe the slots of 幽霊の絵
class tut_step {
  constructor(o = {}) {
    this.Kind = o.Kind;
    this.CardId = o.CardId ?? -1;
    this.Dst = o.Dst ?? -9;
    this.Pages = o.Pages ?? [];   // explained before the step
    this.Say = o.Say ?? TxEmpty;  // what to do
  }
}

// one move of the CPU
// Kind: 0 only the pages, 1 play card CardId (Col -1: the middle if free, TutColGhost: a slot with no player monster in front),
// 2 the monster CardId attacks the player's monster Target, 7 the monster CardId evolves, 8 the next random hit goes to Target
class tut_op {
  constructor(o = {}) {
    this.Kind = o.Kind;
    this.CardId = o.CardId ?? -1;
    this.Col = o.Col ?? -1;
    this.Target = o.Target ?? -1;
    this.Pages = o.Pages ?? [];   // explained after the move
  }
}

const TutGhostMine = -2;
const TutGhostFoe = -3;
const TutColGhost = -5;

class card_tutorial {
  constructor(o = {}) {
    this.Steps = o.Steps ?? [];
    this.Step = o.Step ?? 0;
    this.Shown = o.Shown ?? -1;
    // the slot 幽霊の絵 was put in (the snowman goes in front of it)
    this.GhostCol = o.GhostCol ?? 2;
  }

  Begin(Turn) {
    this.Steps = TutPlayerSteps(Turn);
    this.Step = 0;
    this.Shown = -1;
  }

  // the current step (undefined: none)
  Cur() { return At(this.Steps, this.Step); }

  Next() { this.Step += 1; }

  // a UI id of a step (the slots of 幽霊の絵 are only known once it is on the board)
  DstUi(D) {
    if (D === TutGhostMine) return 10 + this.GhostCol;
    else if (D === TutGhostFoe) return 20 + this.GhostCol;
    return D;
  }
}

// cards drawn at the start of the turn (the opening hand is 1 card each)
function TutDraws(Who, Turn) { return Turn <= 1 ? 0 : 1; }

// the decks in drawing order
function TutMyDeck() { return [CardTutMochi, CardWebTutRat, CardTutThunder, CardTutLadybug, CardTutSnowman, CardTutCurse]; }
function TutFoeDeck() { return [CardTutChoco, CardTutHoodRat, CardTutGhost, CardTutLancer]; }
const TutFoeHp = 5;

// pages shown just before a card's battlecry goes off
function TutCryPages(CardId) { return CardId === CardTutLadybug ? [TuCry] : []; }

function TutPlayerSteps(Turn) {
  if (Turn === 1) {
    return [
      new tut_step({ Kind: 1, CardId: CardTutMochi, Dst: 11, Pages: [TuHello, TuMana], Say: TuSayMochi }),
      new tut_step({ Kind: 5, Pages: [TuSleep], Say: TuSayEnd }),
    ];
  } else if (Turn === 2) {
    return [
      new tut_step({ Kind: 1, CardId: CardWebTutRat, Pages: [TuTurn2], Say: TuSayRat }),
      new tut_step({ Kind: 2, CardId: CardWebTutRat, Dst: 21, Pages: [TuHaste], Say: TuSayRatAtk }),
      new tut_step({ Kind: 2, CardId: CardTutMochi, Dst: 31, Pages: [TuChocoDown], Say: TuSayMochiHero }),
      new tut_step({ Kind: 5, Pages: [TuHp4], Say: TuSayEnd }),
    ];
  } else if (Turn === 3) {
    return [
      new tut_step({ Kind: 4, Pages: [TuTurn3, TuJewel], Say: TuSayJewel }),
      new tut_step({ Kind: 1, CardId: CardTutThunder, Pages: [TuJewelDone, TuStealth], Say: TuSayThunder }),
      new tut_step({ Kind: 1, CardId: CardTutLadybug, Pages: [TuRatDown], Say: TuSayLadybug }),
      new tut_step({ Kind: 2, CardId: CardTutMochi, Dst: 31, Pages: [TuBuffed], Say: TuSayMochiHero2 }),
      new tut_step({ Kind: 5, Pages: [TuHp2], Say: TuSayEnd }),
    ];
  } else if (Turn === 4) {
    return [
      new tut_step({ Kind: 1, CardId: CardTutSnowman, Dst: TutGhostMine, Pages: [TuTurn4], Say: TuSaySnowman }),
      new tut_step({ Kind: 2, CardId: CardTutMochi, Dst: TutGhostFoe, Pages: [TuFreeze], Say: TuSayMochiGhost }),
      new tut_step({ Kind: 5, Pages: [TuGhost1], Say: TuSayEnd }),
    ];
  } else if (Turn === 5) {
    return [
      new tut_step({ Kind: 1, CardId: CardTutCurse, Dst: TutGhostFoe, Pages: [TuTurn5, TuCurse], Say: TuSayCurse }),
      new tut_step({ Kind: 2, CardId: CardTutMochi, Dst: 31, Pages: [TuLast], Say: TuSayFinish }),
    ];
  }
  return [];
}

function TutFoeOps(Turn) {
  if (Turn === 1) {
    return [new tut_op({ Kind: 1, CardId: CardTutChoco, Col: 1 })];
  } else if (Turn === 2) {
    return [new tut_op({ Kind: 1, CardId: CardTutHoodRat, Col: -1 })];
  } else if (Turn === 3) {
    return [
      new tut_op({ Kind: 1, CardId: CardTutGhost, Col: TutColGhost, Pages: [TuGhostIn, TuTaunt, TuTurnEnd] }),
      new tut_op({ Kind: 8, Target: CardTutLadybug }),
    ];
  } else if (Turn === 4) {
    return [
      new tut_op({ Kind: 1, CardId: CardTutLancer, Col: -1, Pages: [TuLancerIn, TuEvolve] }),
      new tut_op({ Kind: 7, CardId: CardTutLancer, Pages: [TuBarrier] }),
      new tut_op({ Kind: 2, CardId: CardTutLancer, Target: CardTutSnowman }),
    ];
  }
  return [];
}

// ---------------------------------------------------------------- texts
const TuHello = "ようこそ「デュエルデュエル」へ！\n\nこのチュートリアルでは、実際に対戦しながら遊び方をおぼえていこう。\n\n相手のHPは5。相手のHPを0にすれば勝ちだよ！";
const TuMana = "【マナ（コスト）】\nカードを使うにはマナが必要。カードの右上の数字が、そのカードを使うのに必要なマナ（コスト）だよ。\n\nマナはあなたのキャラクターの右にある青い石。ターンのはじめに全回復して、最大マナが1ずつ増えていく（最大10）。\n\nこのターンのマナは1。";
const TuSayMochi = "マナを1つ使って「ちいさな桜もち」を場に出してみよう！\n\n手札の「ちいさな桜もち」を選んで、光っている真ん中のマスを選んでね。";
const TuSleep = "【召喚酔い】\n場に出たばかりのモンスターは、そのターンは行動できないよ（攻撃は次のターンから）。\n\nこのターンにできることはもうないので、ターンを終わろう。";
const TuSayEnd = "右の「ターン終了」を押してみよう！";
const TuTurn2 = "相手は「チョコのかけら」を真ん中に召喚してきた。\n\nあなたのターン！山札から「ネズミ」を引いたよ。最大マナは2に増えた！";
const TuSayRat = "マナを2つ使って「ネズミ」を場に出してみよう！\n\n（空いているマスならどこでもOK）";
const TuHaste = "【速攻】\n「ネズミ」は速攻を持っているから、召喚酔いしない！出したターンからすぐに攻撃できるよ。\n\nモンスターは正面か斜め前の敵モンスター、または相手プレイヤーを攻撃できる。";
const TuSayRatAtk = "「ネズミ」を選んで、相手の「チョコのかけら」に攻撃してみよう！";
const TuChocoDown = "やったね、「チョコのかけら」を撃破！\n\n攻撃したモンスターも相手の攻撃力のぶんダメージを受けるので、ネズミも相打ちになったよ。\n\n「ちいさな桜もち」は前のターンに出したので、もう行動できる。";
const TuSayMochiHero = "「ちいさな桜もち」を選んで、相手プレイヤーを攻撃してみよう！";
const TuHp4 = "ナイス！相手のHPが4になった。\n\nこのターンにできることは終わったよ。";
const TuTurn3 = "相手は「ずきんネズミ」を出してきた。\n\nあなたは山札から「いかずち」を引いたよ。最大マナは3！";
const TuJewel = "【ジュエル】\nあなたのキャラクターの左にある六角形が「ジュエル」。キャラクターごとにちがう必殺技で、マナを使って1ターンに1回使えるよ。\n\nリオのジュエル「知恵のサファイア」は、カードを1枚引く効果（ふだんはマナ2）。\n\n今回は特別にマナ0で使わせてあげる！";
const TuSayJewel = "ジュエル（キャラクターの左の六角形）を選んで、もう一度選ぶと使えるよ！";
const TuJewelDone = "ジュエルで「てんとうむし」を引いた！\n\nジュエルは毎ターン使える心強い力。マナに余裕があるときはどんどん使っていこう！";
const TuStealth = "【潜伏】\n「ずきんネズミ」は潜伏を持っている。潜伏したモンスターは、自分から攻撃するまで、モンスターの攻撃や対象を選ぶ効果の対象にならないよ。\n\nでも「いかずち」のような、ランダムな敵に当たるスペルなら当てられる！";
const TuSayThunder = "「ずきんネズミ」を倒してみよう！\n\n手札の「いかずち」を選んで、もう一度選ぶと使えるよ。";
const TuRatDown = "「ずきんネズミ」を撃破！\n\nスペルは使い切りの魔法カード。使ったあとは墓地に行くよ。";
const TuSayLadybug = "残りのマナ2で「てんとうむし」を場に出してみよう！\n\n（空いているマスならどこでもOK）";
const TuCry = "【叫び】\n手札から場に出したときに発動する効果だよ。\n\n「てんとうむし」の叫び：ランダムな他の味方モンスター1体の攻撃力+1。\n\n場にいる「ちいさな桜もち」が強くなるよ！";
const TuBuffed = "「ちいさな桜もち」の攻撃力が2になった！（攻撃力2 / 体力2）";
const TuSayMochiHero2 = "強くなった「ちいさな桜もち」で、相手プレイヤーを攻撃しよう！";
const TuHp2 = "相手のHPは残り2！もうすぐ勝てそう！";
const TuGhostIn = "相手は「幽霊の絵」を、正面にだれもいないマスに出してきた。";
const TuTaunt = "【挑発】\n挑発を持つモンスターがいる限り、ほかのモンスターやプレイヤーには攻撃できない。\n\nまずは挑発のモンスターを倒す必要があるよ。";
const TuTurnEnd = "【ターン終了時】\n自分のターンのおわりに発動する効果だよ。\n\n「幽霊の絵」のターン終了時：ランダムな敵モンスター1体に1ダメージ。";
const TuTurn4 = "「幽霊の絵」の効果で「てんとうむし」がやられてしまった…\n\nあなたは「スノーマン紳士」を手札に加えたよ。最大マナは4！\n\n「スノーマン紳士」の叫びは、正面の敵モンスターに1ダメージを与えて凍結させる。";
const TuSaySnowman = "「スノーマン紳士」を、「幽霊の絵」の正面のマスに出してみよう！";
const TuFreeze = "【凍結】\n「スノーマン紳士」の叫びで「幽霊の絵」に1ダメージを与えて凍結させた！\n\n凍結したモンスターは、次の自分のターンに行動できないよ。";
const TuSayMochiGhost = "「ちいさな桜もち」で「幽霊の絵」を攻撃してみよう！\n\n（挑発がいるので、プレイヤーには攻撃できない）";
const TuGhost1 = "「幽霊の絵」の体力は残り1。\n\n「スノーマン紳士」も挑発を持っているから、相手のモンスターはまずスノーマン紳士を攻撃しないといけないよ。";
const TuLancerIn = "相手は「ホワイトランサー」を出してきた。";
const TuEvolve = "【進化】\n自分のモンスターを選んで「進化」を押すと、そのモンスターが進化して+2/+2される（カードによっては特別な効果も！）。\n\n進化したターンはモンスターに攻撃できる。進化は1ターンに1回で、先攻は5ターン目・後攻は4ターン目から使えるよ。";
const TuBarrier = "【バリア】\n進化した「ホワイトランサー」はバリアを手に入れた！\n\nバリアは、次に受けるダメージを1度だけ無効にするよ。";
const TuTurn5 = "「スノーマン紳士」がやられてしまった…でも相手のHPは残り2！\n\nあなたは「即死呪文」を手札に加えたよ。最大マナは5！";
const TuCurse = "【即死呪文】\n敵モンスター1体を選んで破壊するスペル。\n\n「幽霊の絵」を破壊すれば挑発がいなくなって、相手プレイヤーを攻撃できるようになるよ！";
const TuSayCurse = "「即死呪文」を選んで、「幽霊の絵」を選ぼう！";
const TuLast = "挑発がいなくなった！あとはとどめをさすだけ！";
const TuSayFinish = "「ちいさな桜もち」で相手プレイヤーを攻撃して、勝利しよう！";
const TuWrong = "今は案内どおりにやってみよう！";
