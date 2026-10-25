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

// Served over http(s): Web Audio (every sound decoded once, played with no delay; phones stalled on <audio>).
// Opened from a file (the sounds can't be fetched): a few audio elements per sound so the same sound can overlap.
const SfxWeb = location.protocol.startsWith('http') && !!(window.AudioContext || window.webkitAudioContext);
let SfxCtx = null, SfxGain = null;
const SfxBufs = [], SfxLoads = [];
function SfxLoad(Id) {
  if (!SfxLoads[Id]) {
    SfxLoads[Id] = fetch('duelduel_data/snd/' + SfxFiles[Id] + '.wav').then(r => r.arrayBuffer())
      .then(b => SfxCtx.decodeAudioData(b)).then(buf => { SfxBufs[Id] = buf; }).catch(() => { });
  }
  return SfxLoads[Id];
}
// the browser lets sounds start only from a touch / click / key: the audio is made (and woken) there
function SfxWake() {
  if (!SfxWeb) return;
  try {
    if (!SfxCtx) {
      SfxCtx = new (window.AudioContext || window.webkitAudioContext)();
      SfxGain = SfxCtx.createGain();
      SfxGain.connect(SfxCtx.destination);
      if (TheSfxVolume !== null) SfxGain.gain.value = TheSfxVolume;
      // every sound decoded in the background, a few at a time
      spawn(async () => { for (let i = 0; i < SfxFiles.length; i += 4) await Promise.all([i, i + 1, i + 2, i + 3].filter(j => j < SfxFiles.length).map(SfxLoad)); });
    }
    if (SfxCtx.state !== 'running') SfxCtx.resume().catch(() => { });
  } catch (e) { }
}
let TheSfxVolume = null;
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) window.addEventListener(ev, SfxWake, { capture: true, passive: true });

class card_sfx {
  constructor() {
    this.Pools = [];
    this.Volume = 0.8;
    try { const v = parseFloat(localStorage.getItem('dd_volume')); if (v >= 0 && v <= 1) this.Volume = v; } catch (e) { }
    TheSfxVolume = this.Volume;
    if (SfxGain) SfxGain.gain.value = this.Volume;
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
    if (SfxWeb) {
      if (!SfxCtx || SfxCtx.state !== 'running') return;
      const buf = SfxBufs[Id];
      if (!buf) { SfxLoad(Id); return; }
      try { const s = SfxCtx.createBufferSource(); s.buffer = buf; s.connect(SfxGain); s.start(); } catch (e) { }
      return;
    }
    const p = this.Pool(Id);
    const a = p.els[p.next];
    p.next = (p.next + 1) % p.els.length;
    try { a.currentTime = 0; a.volume = this.Volume; const r = a.play(); if (r && r.catch) r.catch(() => { }); } catch (e) { }
  }
  SetVolume(V) { this.Volume = V; TheSfxVolume = V; if (SfxGain) SfxGain.gain.value = V; try { localStorage.setItem('dd_volume', String(V)); } catch (e) { } }
}
function MakeCardSfx() { return new card_sfx(); }

// the sound that goes with a visual effect (-1 = none, the caller plays its own)
function VfxSound(K) {
  return K === VfxFire ? SfxFire : K === VfxThunder ? SfxThunder : K === VfxExplode ? SfxExplode : K === VfxSlash ? SfxSlash
    : K === VfxWind ? SfxWind : K === VfxDark ? SfxDark : -1;
}
