// main.js — page start-up: the stage, the device id (the save data is tied to it), the player name,
// loading the pictures, then the game (manager.js).
'use strict';

// a 12-digit id made once per device (browser); the save lives under it
function DeviceId() {
  let Id = null;
  try { Id = localStorage.getItem('dd_device'); } catch (e) { }
  if (!Id || !/^\d{12}$/.test(Id)) {
    Id = String(GetRandomInt(1, 9));
    for (let i = 0; i < 11; i++) Id += String(GetRandomInt(0, 9));
    try { localStorage.setItem('dd_device', Id); } catch (e) { }
  }
  return Id;
}
function SavedName() { try { return localStorage.getItem('dd_name') || ''; } catch (e) { return ''; } }
function SaveName(N) { try { localStorage.setItem('dd_name', N); } catch (e) { } }

// a plain HTML dialog for the name (Verse had the Fortnite name; here the player types one)
function AskName(Current) {
  return new Promise(res => {
    const box = document.getElementById('namebox');
    const inp = document.getElementById('nameinput');
    const ok = document.getElementById('nameok');
    inp.value = Current || '';
    box.style.display = 'flex';
    setTimeout(() => inp.focus(), 50);
    const done = () => {
      const N = inp.value.trim().slice(0, 12);
      if (!N) { inp.focus(); return; }
      box.style.display = 'none';
      ok.onclick = null; inp.onkeydown = null;
      SaveName(N);
      res(N);
    };
    ok.onclick = done;
    inp.onkeydown = e => { if (e.key === 'Enter') done(); };
  });
}

let TheGame = null;
let ThePlayer = null;

async function Boot() {
  // (a phone held upright: the game is shown sideways — landscape — from the loading screen on)
  FitApp();
  window.addEventListener('resize', FitApp);
  InitTextures();
  InitStage(document.getElementById('root'));
  HitInput.Init();
  const load = document.getElementById('loading');
  const bar = document.getElementById('loadbar');
  // the UI pictures first (the monsters load when they are needed)
  const Gui = Object.values(CardGui);
  await PreloadTextures(Gui, f => { bar.style.width = Math.round(f * 100) + '%'; });
  // the browser only plays sounds after a tap / click
  load.classList.add('ready');
  // phones: full screen (where the browser allows it) — asked inside the tap itself (browsers need the gesture)
  const GoFull = () => {
    if (!matchMedia('(pointer: coarse)').matches || !document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => { if (screen.orientation && screen.orientation.lock) return screen.orientation.lock('landscape'); })
      .catch(() => { });
  };
  await new Promise(r => {
    load.addEventListener('pointerup', () => { GoFull(); r(); }, { once: true });
    window.addEventListener('keydown', r, { once: true });
  });
  AudioUnlock();
  load.style.display = 'none';
  let Name = SavedName();
  if (!Name) Name = await AskName('');
  ThePlayer = { Id: DeviceId(), Name, IsActive: () => true };
  TheGame = new card_game_device();
  // monsters warm up in the background
  spawn(() => PreloadTextures(Object.values(CardMon)));
  await TheGame.OnBegin(ThePlayer);
}

// the player's name can be changed from the profile (menus call this)
async function ChangePlayerName() {
  const N = await AskName(ThePlayer ? ThePlayer.Name : '');
  if (ThePlayer) ThePlayer.Name = N;
  return N;
}

// service worker (offline play when the page is served over http(s); a page opened from a file works offline anyway)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('duelduel_sw.js').catch(() => { });
}

window.addEventListener('DOMContentLoaded', () => { Boot().catch(e => { console.error(e); document.getElementById('fatal').textContent = 'エラー: ' + e.message; }); });
