// bomb.js — (web only) ボムドク: a puzzle game opened from the 💣 button at the bottom right of the title
// (click id 1790, next to ⚙; manager.js PlayLoop -> OpenBombGame). HTML over the game like the friend screen.
// Rules (the Meowdoku / "queens" kind of puzzle, with bombs):
// - an N x N board of N colours hides N bombs: one in every row, every column and every colour
// - no bomb touches another one (the 8 cells around a bomb are empty)
// - pick a cell and press 💣 しらべる: a bomb = found, else a miss (3 misses = game over); × = a note "no bomb here"
// - all bombs found = cleared: duel coins (first clear by board size, 10 for a replay)
// The stages are made offline (scratchpad bd_gen.js: every one has a single answer reachable by reasoning, sorted
// easy → hard inside each board size); after the list the last 100 come back turned / mirrored with other colours.
// Saved per device player in localStorage 'dd_bomb_<id>': {Top: the highest stage open, Cur: the stage being played
// (marks), Auto: × the cells a found bomb rules out, Help: rules seen}.
'use strict';

if (typeof IMG_MANIFEST !== 'undefined' && IMG_MANIFEST.CardGui && !IMG_MANIFEST.CardGui.T_BtnBomb) IMG_MANIFEST.CardGui.T_BtnBomb = [128, 128];

const BdBtnId = 1790;
const TvBomb = 'ボムドク';
const BdLives = 3;
// coins for the first clear by board size (5x5 .. 10x10); every 10th stage +100; a replay 10
const BdCoins = [30, 50, 70, 90, 110, 130];
const BdCoinsTen = 100;
const BdCoinsAgain = 10;
// the colours of the regions
const BdColors = ['#8db8e6', '#f2cf63', '#45a86a', '#8b74d4', '#ec8fb3', '#f39650', '#4cc2c0', '#e0625a', '#b5d55a', '#b48a64'];

// ---------------------------------------------------------------- stages
// "<N*N region digits><N bomb columns, one per row>"
function BdParse(S) {
  const L = S.length;
  const N = Math.round((Math.sqrt(1 + 4 * L) - 1) / 2);
  const Reg = [];
  for (let i = 0; i < N * N; i++) Reg.push(S.charCodeAt(i) - 48);
  const Ans = new Uint8Array(N * N);
  for (let r = 0; r < N; r++) Ans[r * N + (S.charCodeAt(N * N + r) - 48)] = 1;
  return { N, Reg, Ans };
}

function BdStage(Stage) {
  const Cnt = BdStages.length;
  if (Stage <= Cnt) return BdParse(BdStages[Stage - 1]);
  // after the list: the last 100 again, turned / mirrored (never as they were) and with the colours moved
  const K = Stage - Cnt - 1;
  const B = BdParse(BdStages[Cnt - 100 + (K * 37) % 100]);
  const N = B.N;
  const T = (K + Math.floor(K / 100)) % 7 + 1;
  const Sh = K % N;
  const Reg = new Array(N * N), Ans = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let yy = y, xx = x;
    if (T & 4) { const t = yy; yy = xx; xx = t; }
    if (T & 1) xx = N - 1 - xx;
    if (T & 2) yy = N - 1 - yy;
    Reg[yy * N + xx] = (B.Reg[y * N + x] + Sh) % N;
    Ans[yy * N + xx] = B.Ans[y * N + x];
  }
  return { N, Reg, Ans };
}

function BdSize(Stage) { return BdStage(Stage).N; }
function BdReward(Stage, First) {
  if (!First) return BdCoinsAgain;
  return BdCoins[Math.max(0, Math.min(BdCoins.length - 1, BdSize(Stage) - 5))] + (Stage % 10 === 0 ? BdCoinsTen : 0);
}

// ---------------------------------------------------------------- save
function BdKey(P) { return 'dd_bomb_' + SvId(P); }
function BdLoad(P) {
  let D = null;
  try { D = JSON.parse(SvRead(BdKey(P)) || 'null'); } catch (e) { D = null; }
  if (!D || typeof D !== 'object') D = {};
  const Cur = D.Cur && typeof D.Cur === 'object' && typeof D.Cur.M === 'string' ? D.Cur : null;
  return { Top: Math.max(1, SvInt(D.Top, 1)), Auto: D.Auto !== false, Help: !!D.Help, Cur };
}
function BdSave(P, D) { SvWrite(BdKey(P), JSON.stringify(D)); }

function BdSnd(Id) { if (typeof TheGame !== 'undefined' && TheGame && TheGame.Sfx) TheGame.Sfx.Play(null, Id); }

// ---------------------------------------------------------------- pictures
const BdSvgBomb = '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="29" cy="58" rx="17" ry="3.5" fill="rgba(0,0,0,.18)"/>'
  + '<path d="M40 14 l9 9 -6 6 -9 -9z" fill="#5a5a6e" stroke="#26262f" stroke-width="2"/>'
  + '<circle cx="28" cy="37" r="19" fill="#2c2c3c" stroke="#15151d" stroke-width="2.5"/>'
  + '<ellipse cx="21" cy="29" rx="6" ry="4.5" fill="#fff" opacity=".35" transform="rotate(-35 21 29)"/>'
  + '<circle cx="19.5" cy="27.5" r="2.2" fill="#fff" opacity=".8"/>'
  + '<path d="M46 17 q4 -9 10 -8" stroke="#a8743c" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
  + '<g stroke="#ffd23c" stroke-width="2.6" stroke-linecap="round"><path d="M56 9 l0 -6M56 9 l6 0M56 9 l4.5 -4.5M56 9 l4.5 4.5M56 9 l-4.5 -4.5"/></g>'
  + '<circle cx="56" cy="9" r="3" fill="#fff6c0"/></svg>';
const BdSvgX = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M17 17 L47 47 M47 17 L17 47" stroke="rgba(0,0,0,.16)" stroke-width="10" stroke-linecap="round" transform="translate(1.5 2.5)"/>'
  + '<path d="M17 17 L47 47 M47 17 L17 47" stroke="#fff" stroke-width="9" stroke-linecap="round"/></svg>';
const BdSvgMiss = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="24" fill="rgba(255,255,255,.55)"/>'
  + '<path d="M20 20 L44 44 M44 20 L20 44" stroke="#d93a32" stroke-width="8" stroke-linecap="round"/></svg>';
const BdSvgHeart = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 56 C10 40 4 30 6 20 C8 10 22 6 32 18 C42 6 56 10 58 20 C60 30 54 40 32 56Z"/></svg>';

const BdCss = `
.bd { position: absolute; inset: 0; z-index: 2150; --u: min(1cqh, 0.5625cqw); display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at 50% 35%, #fdf8f1 0%, #f1e6d6 70%, #e8d9c4 100%); color: #5b3b2a; overflow: hidden;
  font-family: 'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Meiryo', sans-serif; font-weight: 800; line-height: 1.25; touch-action: none;
  -webkit-text-size-adjust: none; text-size-adjust: none; }
.bdback, .bdstage, .bdchip, .bdsmall button, .bdbtn, .bdxbtn, .bdmoney div { white-space: nowrap; }
.bd button { font-family: inherit; font-weight: inherit; line-height: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.bd svg { display: block; }
.bd .bdinl svg { display: inline-block; width: 1.25em; height: 1.25em; vertical-align: -.3em; }
.bdmain { display: flex; align-items: center; gap: calc(var(--u) * 3); }
.bdleft { width: calc(var(--u) * 40); height: calc(var(--u) * 92); display: flex; flex-direction: column; gap: calc(var(--u) * 1.8); }
.bdright { width: calc(var(--u) * 36); height: calc(var(--u) * 92); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(var(--u) * 2.2); }
.bdback { align-self: flex-start; border: 0; border-radius: 999px; padding: calc(var(--u) * 1.2) calc(var(--u) * 2.6); font-size: calc(var(--u) * 2.8);
  background: #fff; box-shadow: 0 calc(var(--u) * .5) 0 #dccbb5, 0 calc(var(--u) * .8) calc(var(--u) * 2) rgba(90,60,30,.18); color: #7a4a2c; }
.bdlogo { display: flex; align-items: center; gap: calc(var(--u) * 1.2); font-size: calc(var(--u) * 6.4); color: #e2562d; letter-spacing: .04em;
  text-shadow: 0 calc(var(--u) * .5) 0 #fff, 0 calc(var(--u) * .9) 0 #c9a582; margin-top: calc(var(--u) * .6); }
.bdlogo svg { width: calc(var(--u) * 8); height: calc(var(--u) * 8); }
.bdstage { display: flex; align-items: baseline; gap: calc(var(--u) * 1.4); font-size: calc(var(--u) * 4.6); }
.bdsize { font-size: calc(var(--u) * 2.6); background: #7a4a2c; color: #fff; border-radius: 999px; padding: .1em .7em; }
.bdstat { display: flex; gap: calc(var(--u) * 1.4); }
.bdchip { display: flex; align-items: center; gap: calc(var(--u) * .8); background: #fff; border-radius: 999px; padding: calc(var(--u) * .8) calc(var(--u) * 2);
  font-size: calc(var(--u) * 3.6); box-shadow: 0 calc(var(--u) * .4) calc(var(--u) * 1.4) rgba(90,60,30,.15); }
.bdchip svg { width: calc(var(--u) * 4.6); height: calc(var(--u) * 4.6); }
.bdfound b { color: #2d9a4e; }
.bdlives svg { width: calc(var(--u) * 4.2); height: calc(var(--u) * 4.2); fill: #ff5470; transition: fill .3s, transform .3s; }
.bdlives svg.lost { fill: #dcd2c8; transform: scale(.8); }
.bdrules { background: #fff; border-radius: calc(var(--u) * 2.4); padding: calc(var(--u) * 1.2); display: flex; flex-direction: column; gap: calc(var(--u) * 1);
  box-shadow: 0 calc(var(--u) * .4) calc(var(--u) * 1.4) rgba(90,60,30,.12); }
.bdrule { display: flex; align-items: center; gap: calc(var(--u) * 1); background: #fbf1e6; border-radius: calc(var(--u) * 1.4);
  padding: calc(var(--u) * 1) calc(var(--u) * 1.4); font-size: calc(var(--u) * 2.5); }
.bdrule svg { width: calc(var(--u) * 3.6); height: calc(var(--u) * 3.6); flex: none; }
.bdmoney { margin-top: auto; display: flex; flex-direction: column; gap: calc(var(--u) * .6); font-size: calc(var(--u) * 2.5); color: #7a5a40; }
.bdmoney div { display: flex; align-items: center; gap: calc(var(--u) * .7); }
.bdmoney img { width: calc(var(--u) * 3.6); height: calc(var(--u) * 3.6); }
.bdmoney b { color: #c77d00; font-size: 1.2em; }
.bdwrap { position: relative; width: calc(var(--u) * 92); height: calc(var(--u) * 92); box-sizing: border-box; padding: calc(var(--u) * 1.6); background: #fff;
  border-radius: calc(var(--u) * 3); box-shadow: 0 calc(var(--u) * .8) calc(var(--u) * 3) rgba(90,60,30,.2); }
.bdboard { width: 100%; height: 100%; display: grid; gap: calc(var(--u) * .7); }
.bdboard.shake { animation: bdshake .4s; }
.bdc { position: relative; border-radius: calc(var(--u) * 1.1); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform .12s, box-shadow .12s; }
.bdc > svg { width: 72%; height: 72%; pointer-events: none; }
.bdc.x > svg { width: 62%; height: 62%; }
.bdc.sel { z-index: 2; transform: scale(1.06); box-shadow: 0 0 0 calc(var(--u) * .55) #fff, 0 0 0 calc(var(--u) * 1.15) #ff7a1a, 0 calc(var(--u) * .6) calc(var(--u) * 1.6) rgba(0,0,0,.3); }
.bdc.miss { filter: saturate(.45) brightness(.92); }
.bdc.bomb > svg { width: 86%; height: 86%; }
.bdc.boom > svg { animation: bdpop .55s ease-out; }
.bdc.boom::after { content: ''; position: absolute; inset: -20%; border-radius: 50%; border: calc(var(--u) * .8) solid #ffd23c; animation: bdring .6s ease-out forwards; pointer-events: none; }
.bdc.ouch { animation: bdshake .4s; }
.bdcheck { width: calc(var(--u) * 26); height: calc(var(--u) * 26); border-radius: 50%; border: calc(var(--u) * 1) solid #fff; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: calc(var(--u) * .4); background: radial-gradient(circle at 35% 30%, #ff9a5c, #e8442c 70%);
  box-shadow: 0 calc(var(--u) * 1) 0 #b33320, 0 calc(var(--u) * 1.6) calc(var(--u) * 3) rgba(120,40,20,.35); color: #fff !important; font-size: calc(var(--u) * 3.4);
  text-shadow: 0 calc(var(--u) * .3) 0 rgba(0,0,0,.3); transition: transform .1s, filter .2s; }
.bdcheck svg { width: calc(var(--u) * 12); height: calc(var(--u) * 12); }
.bdcheck:active { transform: translateY(calc(var(--u) * .6)); }
.bdcheck.off { filter: grayscale(.85) opacity(.6); }
.bdxbtn { min-width: calc(var(--u) * 28); border: 0; border-radius: 999px; padding: calc(var(--u) * 1.3) calc(var(--u) * 2.4); font-size: calc(var(--u) * 3);
  background: #fff; box-shadow: 0 calc(var(--u) * .5) 0 #dccbb5, 0 calc(var(--u) * .8) calc(var(--u) * 2) rgba(90,60,30,.18); }
.bdxbtn.off { opacity: .45; }
.bdtip { font-size: calc(var(--u) * 2.1); color: #8a6a50; text-align: center; line-height: 1.45; }
.bdsmall { display: grid; grid-template-columns: 1fr 1fr; gap: calc(var(--u) * 1.2); width: 100%; }
.bdsmall button { border: 0; border-radius: calc(var(--u) * 1.6); padding: calc(var(--u) * 1.1) calc(var(--u) * .6); font-size: calc(var(--u) * 2.3); background: #f8eddf;
  box-shadow: 0 calc(var(--u) * .4) 0 #dccbb5; color: #7a4a2c; }
.bdsmall button.on { background: #ffe6a3; }
.bdmsg { position: absolute; left: 50%; top: calc(var(--u) * 3); transform: translate(-50%, -150%); background: #5b3b2a; color: #fff; border-radius: 999px;
  padding: calc(var(--u) * 1.2) calc(var(--u) * 3.4); font-size: calc(var(--u) * 3); opacity: 0; transition: transform .25s, opacity .25s; pointer-events: none; white-space: nowrap; z-index: 5; }
.bdmsg.show { transform: translate(-50%, 0); opacity: 1; }
.bdmsg.good { background: #2d9a4e; } .bdmsg.bad { background: #d93a32; }
.bdpop { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; background: rgba(40,25,15,.55); }
.bdpanel { width: calc(var(--u) * 110); max-height: calc(var(--u) * 92); box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 2);
  background: #fffaf3; border-radius: calc(var(--u) * 3.4); padding: calc(var(--u) * 3.4) calc(var(--u) * 4); box-shadow: 0 calc(var(--u) * 2) calc(var(--u) * 6) rgba(0,0,0,.4);
  font-size: calc(var(--u) * 2.8); animation: bdin .25s ease-out; }
.bdpanel h2 { margin: 0; font-size: calc(var(--u) * 5.6); color: #e2562d; }
.bdpanel h2.blue { color: #3d6fb8; }
.bdpanel p { margin: 0; text-align: center; line-height: 1.5; }
.bdhelp { min-height: 0; flex: 1 1 auto; align-self: stretch; overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; display: flex; flex-direction: column; gap: calc(var(--u) * 1.1); }
.bdhelp div { display: flex; gap: calc(var(--u) * 1.2); align-items: center; background: #fbf1e6; border-radius: calc(var(--u) * 1.4); padding: calc(var(--u) * 1) calc(var(--u) * 1.6); line-height: 1.45; }
.bdhelp i { font-style: normal; flex: none; width: calc(var(--u) * 4.4); height: calc(var(--u) * 4.4); border-radius: 50%; background: #e2562d; color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: calc(var(--u) * 2.4); }
.bdgain { display: flex; align-items: center; gap: calc(var(--u) * 1); font-size: calc(var(--u) * 5); color: #c77d00; }
.bdgain img { width: calc(var(--u) * 7); height: calc(var(--u) * 7); }
.bdbtns { display: flex; gap: calc(var(--u) * 1.6); flex-wrap: wrap; justify-content: center; }
.bdbtn { border: 0; border-radius: 999px; padding: calc(var(--u) * 1.4) calc(var(--u) * 3.4); font-size: calc(var(--u) * 3); color: #fff !important;
  text-shadow: 0 calc(var(--u) * .3) 0 rgba(0,0,0,.3); box-shadow: 0 calc(var(--u) * .6) 0 rgba(0,0,0,.2); }
.bdbtn.red { background: linear-gradient(#ff8a5c, #e2462c); } .bdbtn.blue { background: linear-gradient(#8fc6ff, #3a7fd8); } .bdbtn.grey { background: linear-gradient(#cfc4b6, #9a8c7a); }
.bdgrid { position: relative; min-height: 0; align-self: stretch; overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; display: grid; grid-template-columns: repeat(10, 1fr);
  gap: calc(var(--u) * 1); padding: calc(var(--u) * .6); max-height: calc(var(--u) * 58); }
.bdgrid button { position: relative; border: 0; border-radius: calc(var(--u) * 1.4); aspect-ratio: 1; font-size: calc(var(--u) * 2.8); background: #fff;
  box-shadow: 0 calc(var(--u) * .4) 0 #dccbb5; }
.bdgrid button.done { background: #e4f4e2; color: #2d7a3e; }
.bdgrid button.top { background: #ffe0a6; box-shadow: 0 0 0 calc(var(--u) * .5) #ff7a1a; }
.bdgrid button.now { outline: calc(var(--u) * .5) solid #3a7fd8; }
.bdgrid button small { position: absolute; left: 0; right: 0; bottom: 6%; font-size: .55em; opacity: .65; }
.bdgrid button.lock { background: #eee6dc; color: #b9aa98; cursor: default; }
@keyframes bdpop { 0% { transform: scale(.2) rotate(-25deg); } 60% { transform: scale(1.3) rotate(8deg); } 100% { transform: scale(1); } }
@keyframes bdring { 0% { transform: scale(.4); opacity: 1; } 100% { transform: scale(1.3); opacity: 0; } }
@keyframes bdshake { 0%, 100% { translate: 0; } 20% { translate: -6% 0; } 40% { translate: 6% 0; } 60% { translate: -4% 0; } 80% { translate: 4% 0; } }
@keyframes bdin { 0% { transform: scale(.85); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
`;

// ---------------------------------------------------------------- the game screen
let BdOpen = null;

// resolves when the player goes back to デュエルデュエル
function OpenBombGame(P) {
  if (BdOpen) return BdOpen.Done;
  const G = new bd_game(P);
  BdOpen = G;
  G.Start();
  return G.Done;
}
// (manager.js JoinInvite: a friend's invitation was accepted) closes the game
function BdClose() { if (BdOpen) BdOpen.Leave(); }

class bd_game {
  constructor(P) {
    this.P = P;
    this.D = BdLoad(P);
    this.Done = new Promise(r => { this.Res = r; });
    this.Ptr = null;
    this.MsgTimer = 0;
    if (!document.getElementById('bdcss')) {
      const St = document.createElement('style');
      St.id = 'bdcss';
      St.textContent = BdCss;
      document.head.appendChild(St);
    }
    const Coin = IMG_ROOT + 'CardGui/T_Coin.webp';
    const Box = FrEl('div', 'bd');
    Box.innerHTML = `<div class="bdmain">
      <div class="bdleft">
        <button class="bdback">◀ デュエルデュエルへ</button>
        <div class="bdlogo">${BdSvgBomb}<span>${TvBomb}</span></div>
        <div class="bdstage"><span>ステージ <b class="bdsn">1</b></span><span class="bdsize">5×5</span></div>
        <div class="bdstat"><div class="bdchip bdfound">${BdSvgBomb}<span><b>0</b>/5</span></div><div class="bdchip bdlives"></div></div>
        <div class="bdrules">
          <div class="bdrule">${BdSvgBomb}<span>各行・各列に 爆弾は1つ</span></div>
          <div class="bdrule">${BdSvgBomb}<span>各色に 爆弾は1つ</span></div>
          <div class="bdrule">${BdSvgBomb}<span>爆弾のまわり8マスに 爆弾はない</span></div>
        </div>
        <div class="bdmoney">
          <div>クリア報酬 <img src="${Coin}" alt=""><b class="bdreward">0</b></div>
          <div>所持コイン <img src="${Coin}" alt=""><b class="bdcoins">0</b></div>
        </div>
      </div>
      <div class="bdwrap"><div class="bdboard"></div></div>
      <div class="bdright">
        <button class="bdcheck">${BdSvgBomb}<span>しらべる</span></button>
        <button class="bdxbtn">✕ マークする</button>
        <div class="bdtip">タッチでマスを選ぶ → <span class="bdinl">${BdSvgBomb}</span>しらべる<br>選んだマスをもう一度タッチで ✕<br>なぞると ✕ をまとめてつけられる</div>
        <div class="bdsmall">
          <button data-a="stages">ステージ選択</button>
          <button data-a="help">あそびかた</button>
          <button data-a="clearx">✕を全部けす</button>
          <button data-a="auto">自動✕</button>
        </div>
      </div>
    </div>
    <div class="bdmsg"></div>`;
    this.Box = Box;
    const Q = S => Box.querySelector(S);
    this.Board = Q('.bdboard');
    this.ElStage = Q('.bdsn');
    this.ElSize = Q('.bdsize');
    this.ElFound = Q('.bdfound span');
    this.ElLives = Q('.bdlives');
    this.ElReward = Q('.bdreward');
    this.ElCoins = Q('.bdcoins');
    this.ElCheck = Q('.bdcheck');
    this.ElX = Q('.bdxbtn');
    this.ElAuto = Q('[data-a="auto"]');
    this.ElMsg = Q('.bdmsg');
    Q('.bdback').onclick = () => { BdSnd(SfxCancel); this.Leave(); };
    this.ElCheck.onclick = () => this.Check();
    this.ElX.onclick = () => { if (this.Sel >= 0) this.ToggleX(this.Sel); else this.Msg('マスを選んでね'); };
    Q('[data-a="stages"]').onclick = () => { BdSnd(SfxOpen); this.ShowStages(); };
    Q('[data-a="help"]').onclick = () => { BdSnd(SfxOpen); this.ShowHelp(); };
    Q('[data-a="clearx"]').onclick = () => this.ClearX();
    this.ElAuto.onclick = () => {
      this.D.Auto = !this.D.Auto;
      BdSnd(SfxSelect);
      this.Msg(this.D.Auto ? '爆弾を見つけたら、ありえないマスに自動で ✕' : '自動✕ OFF');
      this.SaveCur();
      this.Refresh();
    };
    this.Board.addEventListener('pointerdown', e => this.OnDown(e));
    this.OnMoveF = e => this.OnMove(e);
    this.OnUpF = e => this.OnUp(e, false);
    this.OnCancelF = e => this.OnUp(e, true);
    this.OnKeyF = e => this.OnKey(e);
    window.addEventListener('pointermove', this.OnMoveF);
    window.addEventListener('pointerup', this.OnUpF);
    window.addEventListener('pointercancel', this.OnCancelF);
    window.addEventListener('keydown', this.OnKeyF, true);
    document.getElementById('app').appendChild(Box);
  }

  Start() {
    const C = this.D.Cur;
    this.LoadStage(C && C.S >= 1 && C.S <= this.D.Top ? C.S : this.D.Top, C);
    BdSnd(SfxOpen);
    if (!this.D.Help) {
      this.D.Help = true;
      this.SaveCur();
      this.ShowHelp();
    }
  }

  Leave() {
    if (!this.Box) return;
    this.SaveCur();
    window.removeEventListener('pointermove', this.OnMoveF);
    window.removeEventListener('pointerup', this.OnUpF);
    window.removeEventListener('pointercancel', this.OnCancelF);
    window.removeEventListener('keydown', this.OnKeyF, true);
    clearTimeout(this.MsgTimer);
    this.Box.remove();
    this.Box = null;
    if (BdOpen === this) BdOpen = null;
    this.Res();
  }

  // ---- a stage: Mark per cell 0 = nothing, 1 = ✕, 2 = a miss (no bomb, checked), 3 = a found bomb
  LoadStage(S, Cur) {
    const Pz = BdStage(S);
    this.Stage = S;
    this.N = Pz.N;
    this.Reg = Pz.Reg;
    this.Ans = Pz.Ans;
    const NN = this.N * this.N;
    this.Mark = new Uint8Array(NN);
    this.Miss = 0;
    this.Sel = -1;
    this.Over = false;
    if (Cur && Cur.S === S && Cur.M.length === NN) {
      let Ok = true;
      for (let i = 0; i < NN; i++) {
        const M = Cur.M.charCodeAt(i) - 48;
        if (M < 0 || M > 3 || (M === 3 && !this.Ans[i]) || (M === 2 && this.Ans[i])) { Ok = false; break; }
        this.Mark[i] = M;
      }
      this.Miss = Ok ? Math.max(0, Math.min(BdLives - 1, SvInt(Cur.X, 0))) : 0;
      if (!Ok) this.Mark.fill(0);
    }
    this.Found = this.Mark.reduce((a, m) => a + (m === 3 ? 1 : 0), 0);
    this.First = S === this.D.Top;
    this.Board.style.gridTemplateColumns = `repeat(${this.N}, 1fr)`;
    this.Board.style.gridTemplateRows = `repeat(${this.N}, 1fr)`;
    this.Board.innerHTML = '';
    this.Cells = [];
    for (let i = 0; i < NN; i++) {
      const C = FrEl('div', 'bdc');
      C.dataset.i = i;
      C.style.background = BdColors[this.Reg[i] % BdColors.length];
      this.Board.appendChild(C);
      this.Cells.push(C);
    }
    this.ElLives.innerHTML = BdSvgHeart.repeat(BdLives);
    this.CellKind = [];
    this.SaveCur();
    this.Refresh();
  }

  SaveCur() {
    this.D.Cur = this.Over || !this.Mark ? null : { S: this.Stage, M: Array.from(this.Mark).join(''), X: this.Miss };
    BdSave(this.P, this.D);
  }

  Refresh() {
    const N = this.N;
    for (let i = 0; i < N * N; i++) {
      const M = this.Mark[i];
      const C = this.Cells[i];
      if (this.CellKind[i] !== M) {
        this.CellKind[i] = M;
        C.innerHTML = M === 1 ? BdSvgX : M === 2 ? BdSvgMiss : M === 3 ? BdSvgBomb : '';
        C.classList.toggle('x', M === 1);
        C.classList.toggle('miss', M === 2);
        C.classList.toggle('bomb', M === 3);
      }
      C.classList.toggle('sel', i === this.Sel && !this.Over);
    }
    this.ElStage.textContent = this.Stage;
    this.ElSize.textContent = `${N}×${N}`;
    this.ElFound.innerHTML = `<b>${this.Found}</b>/${N}`;
    [...this.ElLives.children].forEach((H, I) => H.classList.toggle('lost', I >= BdLives - this.Miss));
    this.ElReward.textContent = BdReward(this.Stage, this.First);
    this.ElCoins.textContent = GetCardSave(this.P).Coins;
    const CanCheck = !this.Over && this.Sel >= 0 && this.Mark[this.Sel] < 2;
    this.ElCheck.classList.toggle('off', !CanCheck);
    this.ElX.classList.toggle('off', !CanCheck);
    this.ElAuto.textContent = this.D.Auto ? '自動✕ ON' : '自動✕ OFF';
    this.ElAuto.classList.toggle('on', this.D.Auto);
  }

  Msg(T, Kind) {
    const E = this.ElMsg;
    E.textContent = T;
    E.className = 'bdmsg show' + (Kind ? ' ' + Kind : '');
    clearTimeout(this.MsgTimer);
    this.MsgTimer = setTimeout(() => { E.className = 'bdmsg' + (Kind ? ' ' + Kind : ''); }, 1800);
  }

  // ---- touch: a tap selects (a tap on the selected cell = ✕); a drag over cells puts ✕ (or takes them off when it
  // started on a ✕)
  CellAt(e) {
    const El = document.elementFromPoint(e.clientX, e.clientY);
    const C = El && El.closest ? El.closest('.bdc') : null;
    return C && this.Board.contains(C) ? +C.dataset.i : -1;
  }
  OnDown(e) {
    if (this.Over || this.Ptr !== null || this.Box.querySelector('.bdpop')) return;
    const C = this.CellAt(e);
    if (C < 0) return;
    e.preventDefault();
    this.Ptr = e.pointerId;
    this.PStart = C;
    this.PLast = C;
    this.Painting = false;
    this.PaintTo = this.Mark[C] === 1 ? 0 : 1;
  }
  OnMove(e) {
    if (e.pointerId !== this.Ptr) return;
    const C = this.CellAt(e);
    if (C < 0 || C === this.PLast) return;
    if (!this.Painting) {
      this.Painting = true;
      this.SetX(this.PStart, this.PaintTo);
    }
    this.PLast = C;
    if (this.SetX(C, this.PaintTo)) BdSnd(SfxTick);
    this.Refresh();
  }
  OnUp(e, Cancel) {
    if (e.pointerId !== this.Ptr) return;
    this.Ptr = null;
    if (this.Painting) { this.SaveCur(); return; }
    if (Cancel || !this.Box) return;
    const C = this.PStart;
    if (this.Sel === C) this.ToggleX(C);
    else {
      this.Sel = C;
      BdSnd(SfxClick);
      this.Refresh();
    }
  }
  SetX(C, To) {
    if (this.Mark[C] >= 2 || this.Mark[C] === To) return false;
    this.Mark[C] = To;
    return true;
  }
  ToggleX(C) {
    if (this.Over || this.Mark[C] >= 2) return;
    this.Mark[C] = this.Mark[C] === 1 ? 0 : 1;
    BdSnd(this.Mark[C] ? SfxPlace : SfxClick);
    this.SaveCur();
    this.Refresh();
  }
  ClearX() {
    let Any = false;
    for (let i = 0; i < this.Mark.length; i++) if (this.Mark[i] === 1) { this.Mark[i] = 0; Any = true; }
    BdSnd(Any ? SfxReturn : SfxCancel);
    if (Any) { this.SaveCur(); this.Refresh(); }
  }

  OnKey(e) {
    if (!this.Box) return;
    const Pop = this.Box.querySelector('.bdpop');
    const K = e.key;
    let Used = true;
    if (Pop) {
      if (K === 'Escape' && Pop.dataset.esc) Pop.querySelector('[data-esc]').click();
      else Used = K === 'Enter' || K === ' ' || K === 'Escape';
    } else if (K === 'Escape') { BdSnd(SfxCancel); this.Leave(); }
    else if (K.startsWith('Arrow')) {
      const N = this.N;
      if (this.Sel < 0) this.Sel = 0;
      else {
        let y = (this.Sel / N) | 0, x = this.Sel % N;
        if (K === 'ArrowUp') y = (y + N - 1) % N; else if (K === 'ArrowDown') y = (y + 1) % N;
        else if (K === 'ArrowLeft') x = (x + N - 1) % N; else x = (x + 1) % N;
        this.Sel = y * N + x;
      }
      BdSnd(SfxClick);
      this.Refresh();
    } else if (K === ' ' || K === 'x' || K === 'X') { if (this.Sel >= 0) this.ToggleX(this.Sel); }
    else if (K === 'Enter' || K === 'b' || K === 'B') this.Check();
    else Used = false;
    if (Used) { e.preventDefault(); e.stopPropagation(); }
  }

  // ---- 💣 しらべる
  Check() {
    if (this.Over) return;
    const C = this.Sel;
    if (C < 0) { BdSnd(SfxCancel); this.Msg('先にマスをタッチして選んでね'); return; }
    if (this.Mark[C] >= 2) { BdSnd(SfxCancel); this.Msg('そのマスはもう調べたよ'); return; }
    const El = this.Cells[C];
    if (this.Ans[C]) {
      this.Mark[C] = 3;
      this.Found++;
      if (this.D.Auto) this.AutoX(C);
      BdSnd(SfxRare);
      El.classList.remove('boom'); void El.offsetWidth; El.classList.add('boom');
      setTimeout(() => El.classList.remove('boom'), 700);
      this.Sel = -1;
      if (this.Found >= this.N) { this.Refresh(); this.Clear(); return; }
      this.Msg(`爆弾を見つけた！ あと${this.N - this.Found}個`, 'good');
    } else {
      this.Mark[C] = 2;
      this.Miss++;
      BdSnd(SfxHit);
      El.classList.remove('ouch'); void El.offsetWidth; El.classList.add('ouch');
      this.Board.classList.remove('shake'); void this.Board.offsetWidth; this.Board.classList.add('shake');
      setTimeout(() => { El.classList.remove('ouch'); if (this.Board) this.Board.classList.remove('shake'); }, 450);
      if (this.Miss >= BdLives) { this.Refresh(); this.Lose(); return; }
      this.Msg(`ハズレ！ あと${BdLives - this.Miss}回ミスでゲームオーバー`, 'bad');
    }
    this.SaveCur();
    this.Refresh();
  }

  // the cells a found bomb rules out get ✕: its row, column, colour and the 8 around it
  AutoX(C) {
    const N = this.N, y0 = (C / N) | 0, x0 = C % N;
    for (let i = 0; i < N * N; i++) {
      if (this.Mark[i] !== 0) continue;
      const y = (i / N) | 0, x = i % N;
      if (y === y0 || x === x0 || this.Reg[i] === this.Reg[C] || (Math.abs(y - y0) <= 1 && Math.abs(x - x0) <= 1)) this.Mark[i] = 1;
    }
  }

  Clear() {
    this.Over = true;
    const Coins = BdReward(this.Stage, this.First);
    CardAddCoins(this.P, Coins);
    if (this.First) this.D.Top = this.Stage + 1;
    this.SaveCur();
    this.Refresh();
    setTimeout(() => {
      if (!this.Box) return;
      BdSnd(SfxWin);
      setTimeout(() => BdSnd(SfxCoin), 600);
      const Next = this.Stage + 1;
      this.Pop(`<h2>ステージ${this.Stage} クリア！</h2>
        <p>ぜんぶの爆弾を見つけたよ！${this.First ? '' : '（2回目からの報酬）'}</p>
        <div class="bdgain"><img src="${IMG_ROOT}CardGui/T_Coin.webp" alt="">+${Coins}</div>
        <p style="font-size:.8em;color:#8a6a50">デュエルデュエルのコインに追加されました</p>
        <div class="bdbtns"><button class="bdbtn red" data-a="next">つぎのステージ（${Next}）へ</button>
        <button class="bdbtn blue" data-a="stages">ステージ選択</button><button class="bdbtn grey" data-a="back">デュエルデュエルへ</button></div>`, {
        next: () => { BdSnd(SfxSelect); this.LoadStage(Next, null); },
        stages: () => { BdSnd(SfxOpen); this.ShowStages(); },
        back: () => { BdSnd(SfxCancel); this.Leave(); },
      });
    }, 900);
  }

  Lose() {
    this.Over = true;
    this.SaveCur();
    this.Refresh();
    setTimeout(() => {
      if (!this.Box) return;
      BdSnd(SfxLose);
      this.Pop(`<h2 class="blue">ゲームオーバー…</h2>
        <p>${BdLives}回まちがえちゃった。<br>✕ をうまく使って、爆弾がある場所をしぼりこもう！</p>
        <div class="bdbtns"><button class="bdbtn red" data-a="again">もう一度</button>
        <button class="bdbtn blue" data-a="stages">ステージ選択</button><button class="bdbtn grey" data-a="back">デュエルデュエルへ</button></div>`, {
        again: () => { BdSnd(SfxSelect); this.LoadStage(this.Stage, null); },
        stages: () => { BdSnd(SfxOpen); this.ShowStages(); },
        back: () => { BdSnd(SfxCancel); this.Leave(); },
      });
    }, 700);
  }

  // a pop-up; Acts = { name: fn } for the buttons with data-a (Esc = the one marked data-esc)
  Pop(Html, Acts, Esc) {
    this.ClosePop();
    const Pop = FrEl('div', 'bdpop');
    Pop.innerHTML = `<div class="bdpanel">${Html}</div>`;
    if (Esc) Pop.dataset.esc = '1';
    Pop.querySelectorAll('[data-a]').forEach(B => {
      const F = Acts[B.dataset.a];
      if (Esc && B.dataset.a === Esc) B.dataset.esc = '1';
      if (F) B.onclick = () => { this.ClosePop(); F(B); };
    });
    this.Box.appendChild(Pop);
    return Pop;
  }
  ClosePop() {
    const Old = this.Box && this.Box.querySelector('.bdpop');
    if (Old) Old.remove();
  }

  ShowHelp() {
    this.Pop(`<h2>あそびかた</h2>
      <div class="bdhelp">
        <div><i>1</i><span>盤面に爆弾がかくれているよ。数は 行の数と同じ（5×5なら5個）。</span></div>
        <div><i>2</i><span>各行・各列に 爆弾はちょうど1つ。同じ行・同じ列に2つはないよ。</span></div>
        <div><i>3</i><span>各色に 爆弾はちょうど1つ。</span></div>
        <div><i>4</i><span>爆弾のまわり8マス（ななめもふくむ）に 別の爆弾はない。</span></div>
        <div><i>5</i><span>マスをタッチして選び、<span class="bdinl">${BdSvgBomb}</span>「しらべる」で確かめよう。爆弾なら発見！ちがったらミスで、${BdLives}回ミスするとゲームオーバー。</span></div>
        <div><i>6</i><span>爆弾がないと思うマスには ✕ をつけてメモしよう。選んだマスをもう一度タッチで ✕、指でなぞるとまとめて ✕ がつくよ。</span></div>
        <div><i>7</i><span>ぜんぶの爆弾を見つけたらクリア！デュエルデュエルで使えるコインがもらえるよ。ステージが進むほどむずかしくなるよ。</span></div>
      </div>
      <div class="bdbtns"><button class="bdbtn red" data-a="ok">わかった！</button></div>`, { ok: () => BdSnd(SfxSelect) }, 'ok');
  }

  ShowStages() {
    const Top = this.D.Top;
    let Html = '';
    for (let S = 1; S <= Top + 1; S++) {
      const Cls = S > Top ? 'lock' : S === Top ? 'top' : 'done';
      const Now = S === this.Stage && !this.Over ? ' now' : '';
      const N = BdSize(S);
      Html += S > Top ? `<button class="lock" disabled>🔒<small>${N}×${N}</small></button>`
        : `<button class="${Cls}${Now}" data-a="s" data-s="${S}">${S}<small>${S < Top ? '★ ' : ''}${N}×${N}</small></button>`;
    }
    const Pop = this.Pop(`<h2>ステージ選択</h2>
      <p style="font-size:.85em">クリアしたステージ（★）もあそべるよ（報酬は${BdCoinsAgain}コイン）</p>
      <div class="bdgrid">${Html}</div>
      <div class="bdbtns"><button class="bdbtn grey" data-a="close">とじる</button></div>`, {
      s: B => {
        BdSnd(SfxSelect);
        const S = +B.dataset.s;
        // the stage being played is kept as it is
        if (S === this.Stage && !this.Over) return;
        this.LoadStage(S, null);
      },
      close: () => BdSnd(SfxCancel),
    }, 'close');
    // the newest stage in view (not scrollIntoView: that could move the whole page)
    const G = Pop.querySelector('.bdgrid'), T = G.querySelector('.top');
    if (T) G.scrollTop = Math.max(0, T.offsetTop - G.clientHeight / 2);
  }
}

// ---------------------------------------------------------------- the stage list (made by bd_gen.js)
const BdStages = [
  // 1~: 5x5
  '000130001340211442214422141302',
  '334443111431002330020000231402',
  '004442000420111331113331142031',
  '311113321144200444004440030241',
  '224332243120441200410001130241',
  // 6~: 6x6
  '333222354440554400554000514001511111503142',
  '000044000044000144111122355222333322413520',
  '000055000555110445113345211344111333251403',
  '114445133455233355222555222255222055402513',
  '111111111000313220333224333524335544140352',
  '444445244333243330222230112100111100513042',
  '113335113555125555024445024445000444305142',
  '224444222344233343255333555031000011403152',
  '000312033312551112555111555444555444025314',
  '000511055511222544233344233334233444153024',
  '333332433332444222544222500011500111352041',
  '553333333223334222444422114422111100025314',
  '441111444111334411330422000022555222420531',
  '444000440002444022335522333522311555415302',
  '022223022233442233144553111533111555031524',
  // 21~: 7x7
  '11114421511144551311455133445003664000666600006666205314',
  '44444114422221666221166623356666333006666300066335136420',
  '44444002144400211444022145532215553225555565555553526140',
  '56623336662334666222466604446610000661000011111000536142',
  '11112223312224311022433006443300544335554433555441504263',
  '22251112205111220556100055110005511300411133041116152403',
  '66622256662220666622046611004411100444100044443006315204',
  '32255553322655442265544666554466655444660544166000364152',
  '00000001100000611132261443221114422555544255554225140362',
  '00446610004111005411102551112225311222331323333335302614',
  '26666556666555116555511000331000433144444314444330251364',
  '33330001113300122355066335506666554666555466644443026415',
  '44444554455555444253542220351222035666003566003332635041',
  '46666554636555433353543333350033322033332200331112503164',
  '56111115611111555510055442003334200333220033320001503642',
  '61111156111155644115566441556444255040223500022350316425',
  '66603336000033444443414444441414444111225511125551352046',
  '56666115561111331111131110113333002444444244444443150462',
  '22000662404036544433655443335555333555551155555113062415',
  '33344623336662333336253311225111122555512055500003516204',
  '00045440004444000041160644116666633626666362666334253061',
  '22244112224411224433322200532200553666005566666553640251',
  '66666116606661660661140003334022555422555544222551624053',
  '44443364433336043333602336660233166055111605511113506142',
  '66661556606155440115042000004203303220033320003332630514',
  // 46~: 8x8
  '444444624555546645554466557770065377000033377010313170113111111170613524',
  '555772265555726645177666441706661410066611110666111100661311000062407351',
  '442222264422200047770000477700007771000077770055777750557733555574053162',
  '445555104552550044425000742226667472226677722266333222663332266664713025',
  '337774413777744437777554777775547706755500067555000055520002222275026314',
  '777722227577002255570000550000445000144463011444331114443311111436257041',
  '111155541131555633335566333226663222777600222776000227760002777771460352',
  '666655576661177766631227666313226663332266663333400033330000033353716402',
  '444555614555556644555566000555560005552633777222333333223333322270631425',
  '666344446333433463333344033333440333714100737111057771115555222227304615',
  '333333303333330037331302371115027771555274445552445555664445566626137405',
  '211111142211444422215334225553442222334422233347222363670226666726135740',
  '311114443337444463777745637775556677555566272525062225250222222542631705',
  '666666554464115144447111347777773777077733300077333022273000022272513064',
  '666633334666333146673333447773007477222077772200777220007722255517402635',
  '777443337777443377774333177443551124000522222055222220652222226531504726',
  '222255552665555426667744666674406661770066333000633333003333330050463172',
  '611111116666111366660113555601132255333325557334222277742222444431426057',
  '000055570106666721063677213334772134447721377447113744771337777742530617',
  '775550007777500071755000112333001222320022222200222466002244666004152736',
  '777733557722333322233336220000364200333644000166440101164111116660275314',
  '766333307633300076113000771110004112120041222222442222524425555224037516',
  '777226665777226657722226575222265555554635111144330114443001144473526041',
  '666666627766666277622222777700001770030410000344111153341115553420647513',
  '666222276661225566111555661111156441110566413105634130003333300074630251',
  '555277775552277766523333644433334444433144444331444440014444441141306257',
  '422221114442231144223311443333114443331705455777055555570055556653147026',
  '111111551131115513311445333344553377755563707775633027756600225571624035',
  '777772331777222311772223111442236111400066615550666665556666555562531704',
  '005444440055674410556777111567771115666711133377111333721111333330264175',
  '666633346533334465503444150034771500777711207777212007772220777735716042',
  '000021110000111166033111660333716553377755544777445447774444477741750263',
  '662244002662240022224403222444431577443317774443111774331111333306351742',
  '777755557777555577775551777733337044333300244433002444330666663361753024',
  '222227772220276700006664011144440113333451133333511333335511333337460251',
  '000557710055577705555777045757764447777633444226334442663322226671352064',
  '222266665552666655576660445777704555700044111100441110003411110036257140',
  '112222231162443366600443660004437700053370005555700055557700555540257361',
  '333333663333366633334666033444770054477700541717225511172555117736402715',
  '644000016444000066330000653330005522300755227777522222275522222772504631',
  '111444443122444432244700333547005355570055577770556666605556666616203574',
  '000000020000002230002222333007713377771166666741665566446555544426074135',
  '557772225570777255700112455001113330001133300061333300613333666631706425',
  '111336660112226600112265000226650000775504077757040775570777777737240615',
  '555224442252040422220000777610337766103376661113766661137761111362051374',
  // 91~: 9x9
  '555566666550006622150006222154046272114446272118444272188447772388887777887777777364815207',
  '666677777666677773155557733155500333115550033211500033222544003822444403224444333374816205',
  '633333441663334444666633444666664444666624777602222777600882777600087777650077777836075241',
  '222227777222207744777277774777777774657777734611111133661111333661111388661111188248513607',
  '444447711444444412464444552666845522666845222666882233630088223633888883333333333573680241',
  '888885551888888555788888665788886665778866665477666333477760303427200003222200003863517042',
  '000222214002225554000022544300000545303305555333366555337766888337766888333777788728150463',
  '444111222444113337414133377411133377331333687333333687333336688500066688000888888613847502',
  '112266666122222777223222777333333557443333555443333335343338555333008855333000555703861524',
  '007776646007276666002222266000022262100002222100222252113388855111338555113338855728150463',
  '885333333055333333004333666004433666004022666000022666000002666000006671000007771025374186',
  '115555554111155577115552277116662227116666627113366622333666600338680000888880000847530261',
  '555522223555022221505022221505002121500001121447701111447761116447866616444666666817462035',
  '555522288555222184555522188555521188555511118607771188000371111000331111000333333682750413',
  '555555222188888072111180072111888077113448007113340000633330000666300000666600000584730261',
  '300000777330000778330000777666660077666000077661115557644111111444111122444111112086135274',
  '333331111333331211333332222333222227883427777584440077884440777886600007886666667726830514',
  '444444447666488888666455833666555883665558833612255883612222233611122203111122000853042716',
  '443333331444433331744444322773333332073733652077776655000676655800666655886666555837415206',
  '555555557225555777221115577222115777022225537006665533066665533066666888466668888584271360',
  '888822200888883000788333000777330000755300000755511006555110000554110000554000000635708142',
  '555667777055666777055506667000006687000088687040088888444028222442222212433222211086351472',
  '220011111266011117550011777550011177555557777533377777553333377553884448888888888025317468',
  '110000000111444088222444047222244447222663777256633737555663737556663337555563333186470352',
  '777333111777733311777333551433355581433333580444333588446335558446665288466622288613580274',
  '664447522344777522333775552333175552331155222333350002333355000338888800338880000024638157',
  '118880043111800003111888333161685533161655533666655577666655577262227577222227777753081426',
  '333310004333310144663111144633333444655333444665444444665544224655588822755888222641382750',
  '222810444222811114288811111555881111555888811655555111655557777665677777666633337580372614',
  '444411066441111006444148806444448606544468606554566666555566663755555663755222263475261803',
  '222666673222266773226666473226044473000041444088111155881111115811111155881111555263840571',
  '555444444555554000555534060855530060855533000888883222733833312733333112777333111317508462',
  '666666655300006555300066685322000055322224454322222444322721144377711444333111111857316024',
  '444443333044445883044447888041417787011417777001117777202111667222111666222266666852706314',
  '666227711262227771265227711222233773222233333222233333282233330888433300884444000082635174',
  '666666333466636333444633333444633335886675555777775555777722251777702221777002111205813647',
  '222227766222727766222777776220000466550118888511118888555188888553188888533888888358624071',
  '776622222576666222556558888555500888300000018330400018330400111333444411333344111162084753',
  '633222214663332224633302244666600044666660045668880055668800055688705555667777555751802463',
  '225555661222555666227753666277753666477773366477003336777700338777700388777770088831605247',
  '888877444888877744686800005666600555666655553262233333222223333221113113111111113483571602',
  '266644444222644444222341444233341144223341114333777111333887711888800751000000551180625374',
  '111000000144000000114400000844444444842444333822666533222266553622267753666663333163024758',
  '500000027504400227504400222554400222555442233155552333165522338166333388166663388483150627',
  '443333377444433070443330070444300000411000080411222282411112222451122226555526666802475316',
  '777222266777226663711433333111433300111444000444450000885550000885550000888855000570613842',
  '222666610222261611222661611222211111551111711388777711388847411388444441444441111862715304',
  '355666777335666677355667777355566777315562777815522227811544277881114444811144440417350268',
  '333330066333100666333100226331100222311112222717122888717142458777744458774444488164258073',
  '770000555770603333776600334776603334776663344666662221688822211688882221888882111620571483',
  '633444444333354444333551140555555100555500000555000000755000002775808022777888822072635814',
  '033333688030036688000066888000066688000772628777772228777742222555144422551144422581637402',
  '227777766277777776277777756227077856220088855320588555300588554311555554111155544148350627',
  '111888888411188666444488566777255566772255666772225556372200666322006666333300006253614807',
  '112000077112200777122007777122400777522400077555440077535444446533444466333348886137504826',
  '222133333212111333111177777111171777881111777800055555855555444866544444666644444168502473',
  '111113388111113384111133334771733344777734442555754422557755222555550222655000022374162850',
  '211440000211140007222177777822226777882266666582883363588883333585333333555333333463827150',
  '552222222552222227555507727655507777666000077446400033444411333444113333811113333682413570',
  '555553330555553300566683337556687777666688877661888877661848887111144882444442222570614283',
  '555554446505444744005557744000777222081122222081122222888822222888822222888883222827403615',
  '666333333686663444688883341688883311888811111888115555887555725887577722087772222537146280',
  '444411111224477777224000067222006667222266888222225888322225558322225588333255558428357160',
  '755888800775588880777880080777880000272440404272444444222634344221633344111663344531708624',
  '446666222556622288552227788552777888777700088777008888770000333000000333000011133024137586',
  '888332222888332202683337200633777200663110000651110000551140040511144440551144400263514708',
  '000086772000886722000886662008866662000365566000365664330355444133335554111355554638415720',
  '555511111335551111888444412884422212844442222884442222884666222666660277666667777207146358',
  '001177777000777777066677777000665773006655373206553333255553333222253888228888844253147068',
  '000777774060000077066666777001666633001111633501112333511122833552228883552228888806372415',
  // 161~: 10x10
  '22222999402221199900271199990077111199037715133303711516333371156663337115663366811556666611555566668296147503',
  '77777799997767777990766444999926444495552664499555222444445522145555553214458555111188855511188885555971428036',
  '33374446663737474666773777666677777066669710000066911110066691911006669999100668299111888822222255551635842907',
  '11100055551110066665111666646611116644641113344444111134884811973388881193388888229998888899999988885961483702',
  '88883333368888866366888886666689888666658888806555222226615122222111112222217771242221117744222117774271586390',
  '55999999885555999980577599998877799999987777696688776766666676666644447622334444222213444422223334440913857246',
  '00006633330000633335660066333366066633946666689994666688894422666889882111188888222211818827211111112973685041',
  '33333333333337799920363779222266377772226633337222664431772266643111186464411118444444118854444441182953716480',
  '55555099665555999966559999966145999999114889991111488988111144888871114444887711434377777123333777715286941730',
  '00222229990000222299000022226950000066695888886669588888666755555867775554566777354441111144444444117526491308',
  '05555999965555522996555552296655552229667775552226377444282133444428223348444822338888888833888888880738296415',
  '77444666665554669663555449993355555593330505003333000000033300000203330002220033000221008300022118880736192485',
  '44444111774448481177444888117798888833339558883223955858223399555552239952222222096662222299622222223685941702',
  '66663337776633333777666343777756444777775544409877555449987722544998882444999998222492999812222299983648519720',
  '77777655539997755333997777553399272203309922220000499982000044448200004444888000444488888044111188885368419072',
  '77777996337887796663787799633378769966337266666333226644666322244411332224441113200000011125000000114257903861',
  '81111111008111113330881111773388166144438666611444886666664486699666648822999444882999994458299999948369715240',
  '24333399992233399995223333955511733395551179999885117799998811776888881117688888111666888011166688881408637295',
  '53333999995033331999533531177955551177991111177778111111177812111167881211116888122266668822244666683190758624',
  '22221118882222188888222211888820228888862002888886000237776600004747790004444799444444479945444777995069247381',
  '22220008482550000888555006088851116600885111666088511166688351111166637111166333717793333377799333338026953741',
  '66637722226663372220663337300066633330005565530000555533300055553333905555389999545448999914444899994716928530',
  '66000004446660007774600088777766688877776688855777888855777288885577229885522222999551122299911112237136248059',
  '11111119891111191989111119999917777569997777776666733777766673333666647334444444234444444422244440048295316407',
  '22244449992244444666224446666600045663630044553363005555333300751133330071111313007777111387777711337142859630',
  '99228866669222266266992222226699922222669192222170919112117011111114773111144447511111444755551144444615938072',
  '99999999961999996666999977776689998777768888800066888880006458885003645555503364555050322250000032222085194637',
  '11100000881100000022910000002299990002229779000222555544422255544466665554446666554444466655544466369053172648',
  '22222299882222299888442229988844442288886444444480664455551075555500007555555550773355500073335550006472085913',
  '33333382213631118811663311188163311111116031111111603111114160311919410051199944075515944477755554448630417952',
  '11133333361111223222111112222211115222241551522244555555222457555828445705588884500959998850099999989605831724',
  '11111222261111221266111121111131111111553111447775318114445533899444453389994445038999445588899999556839751402',
  '77711133857711133555711133555511113333990100029999000002449900022244940062244444666224444466666444448075192463',
  '33333000993333006699111000669211100666661111664666111668464651118844445511884444788888884478888888448394726150',
  '33388888873333387777333778770044377777004400777000550000002255566622225566222292666669999216666666995361792840',
  '03337777750033377775003777177500079711550209991111220099191824449999664444499966444444996644444466663148690527',
  '33222222403330222200333000000933800009998880000999888809999988888119998687711199565771111155577111118570936142',
  '99922222239999296622999999666790000667779000016677000011667711111156771111555777418888877788888777779413758602',
  '22223333089222333308922113330892611335059661177555996111755599611777559966111775494444477544444447770968572413',
  '66666666886633333688633343388844434488885444417777541111777755555111775550501171999000011122999000017964831520',
  '77772224463373112266333311226633333116693333311969833331199988880019118000011111855011111188555511117268194053',
  '11114488881111144498111112449951112244495155222099555227700955667700006556600000666660330366666033334920835716',
  '44000088884440002282440000722214116672771111667777199996633359999666635966666663599999663355996666636247903581',
  '66111111776661444477661111444786114444778611424277881882222288882222253888225555333020059930000009994268519037',
  '22000000992210406000211440666622114666662273448866227334866677733886667773383633577333363355733333339703586241',
  '11300000061133500066111450000611745009667774550966774455599274445558824444458888444448888844444488884208179536',
  '33344666873333446677333334667733333467773333306667339990007759992207775959200017555522221155522211118461527093',
  '50000666665055066666555506666751112666674131267667433122777743822877774888887779488888777948888889994283051796',
  '00555311190053331339005523333700522277770022266777222246677722244666778284446667888444466784444444667952038614',
  '66077777776607222277666666224416666228841666668844116333884411333358449193333333919333333399933333332835796140',
  '33333222223333222288444312226843331222664443111666444111666544111996557711119995771170009577777000002490738615',
  '44445555552241155999444155555944415555567745550556774755056677777000663737888006333888800633338888882093584716',
  '66661111196666666919666666999963666699993366662229333668242253888804425588800422757870442277777744224931850627',
  '99999444219999444222899997777289999777728897777772886666777288860002226666660032566000003255550033339425138607',
  '55555578885555557788995577733499999277749222222444122000004411220000461122660046116666600616666666667286095314',
  '77222222507777222000777722000077772999337776229934776699993476669199346661111444666811144468881144448469051372',
  '33336666627333662222733112222277311222221111522424111155444498815444009985544000988554000098850000006304857192',
  '55775552225555555222500555555255055959990505999999050396666600004118680044411888044441888804441118882495038617',
  '40000333334406099993444666699924446666992454688999222668881127777888812777777111227777771122777771113918246057',
  '77700000097700000099771500000977155008897711555888711555888871115558836411225333661125523366622222336807359142',
  '18889999991868899994166699999911666999926666992292666666622255777622225557700222533333322253333322222971384605',
  '55566770005566677000956666620095666631019553333111995344114198544441449884444144988844444498888444448573692041',
  '88611111118800112111888001221188883322228388333242833333224483333224448352222744535577779455557777942531469708',
  '88855555508888575660888777556088777750002888977000211107003311110003331114403333114440333311444033337581406293',
  '55555111446555511447655551114766666117778886111999886681339988668833228888833222808833322200833322223792480516',
  '00004441160000074446088777476608888777662888886663228885633322285533335555533333955553333399555533338605742931',
  '44422225554442622288444666888849466888887990000833779900003377799933317779111311777711131111111111119614758302',
  '95554117779555441447954444442295544444229554444422995553333280000030328006000022866666222286666666625972816403',
  '57711111125377711122533306662250030066240000066624000000666409904444449990494484999949948899999944441520863794',
  '33000888883322388668332338666633334866663333486666333346666533144449657114449965777444945577744444554628397150',
  '88888666618888886333888778333322777773332279933333999999344459993334445599330044599000044455900004449624135708',
  '44446666660444226666000112666700112266670011227777081122277708112223738885553333898555333389855555533740869251',
  '11882222221112229999171199999977755955557775555555770000536570000033667003333666400333466644444444462405813697',
  '00779999660077998886007779888877755555883755555588311155555833311555883311115555333112555534442222227902864153',
  '99966666719966661111999566661195555811119995581818399558881839955848883955444828333444422233334002228293160475',
  '55444222205444422228549942222854933222889493332228999933337819133363771113366777113333667711113666779308624715',
  '66668888446662222244116622444411969222441196922444019992444400099999940009935594333333559537333335556837042591',
  '99933333119995537766999553376699855537779888555577908885557790888822270008822227044482227744444222778597403162',
  '11444222691144442266111144422633144455563115555556333533555688333555668003355777880033337788003337779642518037',
  '20999777772099997444229999744532339974453333595455333355555533335565881133366688111333368811333338881604793528',
  '77744000007777708889772228899967288899996222888119626388111966638811996333331191633335511163333555513502691748',
  '66666633306622333388666253338866225333332225555444225555444411155555447711995444711994544477999444449186275304',
  '55555211885599227178599992777755922222275999962227550666622745066633234466663333444646666344444663336975302418',
  '88333333558333333331883833333188883332118883333212998888822299999446269099444666007444666607746666668493705162',
  '11188000001411000000144100077754440077775556077777556666777755666377725666633322566633322296663333224263851790',
  '99933333419933334444955544422495554422229985444422888544222288855442227888604220788860020078886600009463172085',
  '00000226660000026666122222266611122226691111222399111222299914199999985447777888554777777844477777773642791805',
  '99999444779999994676899999466689999944668888944266111844426651144442265111133006511313300033333300005849172036',
  '34333006663333000666333330007633333300773333555577553555587755555888885555522998115552999911111222991492835706',
  '92222688889292666668999966666699999666669996666661996666744199665574415555557444555553774450033333347140968352',
  '77779995557779999555779999555569969995556666666333116113333011111340001111444800111144288814444228881360792485',
  '66666999776666119973661111933355111113335511111388551111118425100011842211000444222200044422222244445807931426',
  '77777885556777885599676777999966639999916333931111663333111163344311114444221211044422221144442222115748319206',
  '66622931116662299111622229111162299911152200955555000555577700555554770055545477800554447700554447776138425709',
  '77774442237777744222775444422277555442227755554222155555426611155066661111006669100008869900008899999137206485',
  '99944444419944444444999944444439994444442222227444222222784866555778886665777888666677788866660777889180573624',
  '14444442331114444223144444002315000000208500000000850770000055777700005777776666577777766655579766669258061374',
  '88888555558886611115666661110566611110006622221110663222221033333320107333300000777774000099444444448246973051',
  '22221114442222221111222221188822222113386211113338626166355566666335759666667775990007777500077775557159683024',
  '33337777773333777777399300077711100557761100005776188805577644880552264448855222488855522248855522223720591468',
  '88888999228999999222899977777285555555778833055666383300000633333110063313111144331111111433111111445742069138',
  '88066666228706666222870009662277009966620000944462000099942255000933325500033222555103332355511133330918473625',
  '00000000020000000022011000002211880822259998888555949888555594488357779448837767994883366699888833364813062759',
  '73333333842223333884222353888422235588842255558844220008884400000888440000009911000000996100099996660314852697',
  '22000000012277701111222277141122227444412222744411333266641133386911113388691111538999911133999111117958261304',
  '88884777778888444447888844444733333333773000002376001102266600011666660000116666011116666501111195558140253796',
  '11111114441111881444111118848400061844840666884888026668888822266388889926333755996663375799966377774860315972',
  '39999992043322229224333822224433388844443388844747633388877765311888756555111775655555115555555555558649153702',
  '44444422223434422220333442222033344622209344462000999466600099666670009916677755191777888511111788553519046827',
  '88883999118333339951880300999188000669918000666644888666644477766664447744446444777444444422777444444869315720',
  '33332222993333222299333322299911332799996177279999677777994966675554406667754444666885554468888544446271309584',
  '55999977778555597777855552226655522266661122226260111222220013123320001333334400333344444433344444444702816935',
  '22221115882212111588211111698941113169994113336699441136669741133333770003033777000007777700000077777182950364',
  '00066699990000688999000668889900118899990011199949001119999900771159330077155533077755223377755522233704829516',
  '77000008887776008988766608888838668888883888888888332888884431222288453122288845312222855511122255555703618492',
  '95555551119559555551999992222199444221119944222228444447778844444778884464407383446460338344666033331902468573',
  '00999997710009997711229999777725555997775555594777544444447654544444765555444466558888444455888344441840792635',
  '33311117773331011117333300211733300221776630022779563000222956608229995588888999488889899944888999999736402581',
  '77744441117744404111777421111377442223337777729936777889996678788959965888895596555855569655555556663574860291',
  '66666611119997111144999777144422773314442773333454233330045528830004558800000555880000555588800005555713940682',
  '11117776661131777676113117777699333357569000555556900055552290005555529000055552448800552248880555522975086413',
  '77777444447777774444222224443422234443339663333331966666666196666661119996666810559556680055555558882613057948',
  '11115999991811555999881555999988188555998888888033888888600078886660007887746000777744600044444422202831975046',
  '33882225553338822225333812222233331122293333311199373111100933616600996666666000666666444466666644442950813746',
  '11166000001116666770441166670041166777074666677777443333779988333359998883335999228835599928855599992914758630',
  '44444466771414446777111444677719999466771199999975219999990022229990003888899900388999999038999999904716953820',
  '99999994449999999344999999334211908733321190888332110088333311108833331118883833166688883315566663338695724031',
  '00333344493000344999333337499933677748983367771898666777188867771111187777711111777771511172777555110538297461',
  '55511111305555541333555444433352555444635222244663552224446382244466638827499663887779777388777777739680724153',
  '22222999442222999944222229944652220998865225009986555500388655500038861000133366100111733711111177778427913506',
  '33344222223333442298333324429933332222997376662229737666555977761111117776661111777001111170000111113948160572',
  '44477788884144477888114777888811199988301619998333169969333366666933332665555333666555553366655555531749253086',
  '99000000009909001000999901108833935110883393511888339355188233333528227333352222743365622244336666227358492061',
  '55566699995554462299544444222244448433224400833332400883813300888881110077788111000077711177777111113802951647',
  '66333377006633333300666131311066111111106661111110666111221955555122295555519929555851999954888889996840572931',
  '11114444441814444400881133333066613030006633300002666300000266666055529996655222999695552297999922223506827941',
  '55555550445566600004555561100055556811115555288817555522887755522287775553222227999322277793333227778647513902',
  '88833333318688387733668888773366677777556644475555444747775544777755552277705559222270559922200000999420357186',
  '22333999992222333989222222228922228828892227788881555744411157770011110070000011077000011600000001162715360849',
  '00041222220001126272011111667799116166779911666677999956867795955688875595568888555555888855533388883702619485',
];
