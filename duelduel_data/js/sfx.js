// sfx.js — card_sfx.verse: the sound effects (generated wav files in duelduel_data/snd)
'use strict';

const SfxSelect = 0, SfxCancel = 1, SfxSummon = 2, SfxHit = 3, SfxDestroy = 4, SfxHeal = 5, SfxSpell = 6, SfxForce = 7,
  SfxAwaken = 8, SfxMyTurn = 9, SfxDraw = 10, SfxFreeze = 11, SfxWin = 12, SfxLose = 13, SfxCurse = 14, SfxMana = 15,
  SfxShield = 16, SfxEvolve = 17, SfxLegend = 18, SfxRare = 19, SfxPack = 20, SfxPackOpen = 21, SfxFlip = 22, SfxCoin = 23,
  SfxFire = 24, SfxThunder = 25, SfxExplode = 26, SfxSlash = 27, SfxWind = 28, SfxDark = 29, SfxClick = 30, SfxOpen = 31,
  SfxShuffle = 32, SfxHitBig = 33, SfxSummonR = 34, SfxSummonE = 35, SfxSummonL = 36, SfxSpin = 37, SfxPremium = 38,
  SfxShard = 39, SfxCraft = 40, SfxTick = 41, SfxJackpot = 42, SfxTimer = 43, SfxDebuff = 44, SfxBuff = 45, SfxReturn = 46,
  SfxAttack = 47, SfxPlace = 48, SfxQuest = 49, SfxLevelUp = 50, SfxCoinFlip = 51, SfxCoinLand = 52, SfxEvoCharge = 53,
  SfxEvoBurst = 54, SfxFanfare = 55, SfxPackTear = 56, SfxImpact = 57;

const SfxFiles = ['select', 'cancel', 'summon', 'hit', 'destroy', 'heal', 'spell', 'force', 'awaken', 'myturn', 'draw', 'freeze',
  'win', 'lose', 'curse', 'mana', 'shield', 'evolve', 'legend', 'rare', 'pack', 'packopen', 'flip', 'coin', 'fire', 'thunder',
  'explode', 'slash', 'wind', 'dark', 'click', 'open', 'shuffle', 'hitbig', 'summon_r', 'summon_e', 'summon_l', 'spin', 'premium',
  'shard', 'craft', 'tick', 'jackpot', 'timer', 'debuff', 'buff', 'return', 'attack', 'place', 'quest', 'levelup', 'coinflip',
  'coinland', 'evocharge', 'evoburst', 'fanfare', 'packtear', 'impact'];

function SfxFallback(Id) {
  return Id === SfxCoinFlip ? SfxSpin : Id === SfxCoinLand ? SfxCoin : Id === SfxEvoCharge ? SfxSpin : Id === SfxFanfare ? SfxLegend
    : Id === SfxPackTear ? SfxPackOpen : Id === SfxImpact ? SfxHitBig : -1;
}

// a few audio elements per sound so the same sound can overlap
class card_sfx {
  constructor() {
    this.Pools = [];
    this.Volume = 0.8;
    try { const v = parseFloat(localStorage.getItem('dd_volume')); if (v >= 0 && v <= 1) this.Volume = v; } catch (e) { }
  }
  Pool(Id) {
    let p = this.Pools[Id];
    if (!p) {
      p = { els: [], next: 0 };
      for (let i = 0; i < 3; i++) { const a = new Audio('duelduel_data/snd/' + SfxFiles[Id] + '.wav'); a.preload = 'auto'; p.els.push(a); }
      this.Pools[Id] = p;
    }
    return p;
  }
  // (P = the player who hears it: always the local one in the browser)
  Play(P, Id) {
    if (Id < 0 || Id >= SfxFiles.length || !AudioUnlocked || this.Volume <= 0) return;
    const p = this.Pool(Id);
    const a = p.els[p.next];
    p.next = (p.next + 1) % p.els.length;
    try { a.currentTime = 0; a.volume = this.Volume; const r = a.play(); if (r && r.catch) r.catch(() => { }); } catch (e) { }
  }
  SetVolume(V) { this.Volume = V; try { localStorage.setItem('dd_volume', String(V)); } catch (e) { } }
}
function MakeCardSfx() { return new card_sfx(); }

// the sound that goes with a visual effect (-1 = none, the caller plays its own)
function VfxSound(K) {
  return K === VfxFire ? SfxFire : K === VfxThunder ? SfxThunder : K === VfxExplode ? SfxExplode : K === VfxSlash ? SfxSlash
    : K === VfxWind ? SfxWind : K === VfxDark ? SfxDark : -1;
}
