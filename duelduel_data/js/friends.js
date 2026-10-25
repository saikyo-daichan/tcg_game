// friends.js — フレンド (browser only, not in the Verse game).
// - Every running game is reachable at the PeerJS id NET_PREFIX + 'p-' + <player id> while it is online (presence).
// - Friend requests / answers / removals are kept in an outbox and delivered whenever both players are online
//   (there is no server: a request to an offline player arrives when both games are open at the same time).
// - The list shows whether each friend is online / in a match, and an online friend can be invited to a private match:
//   the inviter opens a room and sends its number; the friend accepts in a pop-up and joins it (manager.js).
// Saved per device in localStorage 'dd_friends_<device id>'.
'use strict';

let FrData = null;           // {Friends: [{Id, Name}], In: [{Id, Name}], Out: [{Id, Name}], Outbox: [{To, M}]}
let FrPeer = null;           // this game's presence peer
let FrStarted = false;
const FrStatus = new Map();  // Id -> 'online' | 'battle' | 'offline' | 'check'
let FrUI = null;             // the open friend screen {Render(), Close(R)}
let FrInviteOpen = false;

function FrKey() { return 'dd_friends_' + ThePlayer.Id; }
function FrLoad() {
  if (FrData) return FrData;
  let D = null;
  try { D = JSON.parse(localStorage.getItem(FrKey()) || 'null'); } catch (e) { }
  const L = A => Array.isArray(A) ? A.filter(X => X && typeof X.Id === 'string') : [];
  FrData = { Friends: L(D && D.Friends), In: L(D && D.In), Out: L(D && D.Out), Outbox: Array.isArray(D && D.Outbox) ? D.Outbox : [] };
  return FrData;
}
function FrSave() { try { localStorage.setItem(FrKey(), JSON.stringify(FrData)); } catch (e) { } }
// friend requests waiting for an answer (the title's badge)
function FriendInCount() { return (typeof ThePlayer !== 'undefined' && ThePlayer) ? FrLoad().In.length : 0; }
function FrPeerId(Id) { return NET_PREFIX + 'p-' + Id; }
function FrMe() { return { Id: ThePlayer.Id, Name: ThePlayer.Name }; }
function FrIdText(Id) { return String(Id).replace(/^(\d{4})(\d{4})(\d{4})$/, '$1-$2-$3'); }
function FrIn(List, Id) { return List.find(X => X.Id === Id); }
function FrDrop(Key, Id) { FrData[Key] = FrData[Key].filter(X => X.Id !== Id); }
function FrAdd(Key, Id, Name) {
  const X = FrIn(FrData[Key], Id);
  if (X) { if (Name) X.Name = Name; return; }
  FrData[Key] = FrData[Key].concat([{ Id, Name: Name || '？' }]);
}
function FrRefresh() { if (FrUI) FrUI.Render(); }

// ---------------------------------------------------------------- presence + delivery
async function FrStart() {
  if (FrStarted) return;
  FrStarted = true;
  FrLoad();
  while (true) {
    if (NetAvailable() && (!FrPeer || FrPeer.destroyed)) {
      try {
        FrPeer = await NetOpenPeer(FrPeerId(ThePlayer.Id));
        FrPeer.on('connection', FrIncoming);
        FrPeer.on('disconnected', () => { try { if (!FrPeer.destroyed) FrPeer.reconnect(); } catch (e) { } });
        FrPeer.on('error', () => { });
      } catch (e) { FrPeer = null; }
    }
    if (FrPeer && !FrPeer.destroyed) await FrFlush();
    await Sleep(20);
  }
}

function FrIncoming(c) {
  c.on('open', () => {
    const L = new net_link(c);
    L.OnMsg('fr', m => { spawn(() => FrGot(L, m)); });
  });
}

// a message from another game; every message gets an answer {t: 'fra', ...}
async function FrGot(L, m) {
  const Ans = A => { L.Send(Object.assign({ t: 'fra', name: ThePlayer.Name }, A)); setTimeout(() => L.Close(), 1500); };
  if (m.v !== NET_VER || !m.from || typeof m.from.Id !== 'string') { Ans({ ok: false, why: 'version' }); return; }
  FrLoad();
  const F = m.from;
  if (FrIn(FrData.Friends, F.Id)) FrAdd('Friends', F.Id, F.Name);
  if (m.k === 'st') {
    const InGame = !!(TheGame && TheGame.Me && TheGame.Me.InGame);
    Ans({ ok: true, st: InGame ? 'battle' : 'online', friend: !!FrIn(FrData.Friends, F.Id) });
  } else if (m.k === 'req') {
    if (FrIn(FrData.Friends, F.Id)) { Ans({ ok: true, mutual: true }); return; }
    // both asked each other: friends at once
    if (FrIn(FrData.Out, F.Id)) {
      FrDrop('Out', F.Id); FrAdd('Friends', F.Id, F.Name);
      FrData.Outbox = FrData.Outbox.filter(X => !(X.To === F.Id && X.M.k === 'req'));
      FrSave(); FrRefresh();
      Ans({ ok: true, mutual: true });
      return;
    }
    FrAdd('In', F.Id, F.Name);
    FrSave(); FrRefresh();
    if (TheGame && TheGame.Me && !TheGame.Me.InGame) TheGame.Me.UI.Notice(FrTxReqArrived(F.Name));
    Ans({ ok: true });
  } else if (m.k === 'acc') {
    if (FrIn(FrData.Out, F.Id) || FrIn(FrData.In, F.Id)) {
      FrDrop('Out', F.Id); FrDrop('In', F.Id); FrAdd('Friends', F.Id, F.Name);
      FrSave(); FrRefresh();
      if (TheGame && TheGame.Me && !TheGame.Me.InGame) TheGame.Me.UI.Notice(FrTxAccepted(F.Name));
    }
    Ans({ ok: true });
  } else if (m.k === 'dec') {
    FrDrop('Out', F.Id); FrSave(); FrRefresh();
    Ans({ ok: true });
  } else if (m.k === 'del') {
    FrDrop('Friends', F.Id); FrSave(); FrRefresh();
    Ans({ ok: true });
  } else if (m.k === 'inv') {
    Ans(await FrInvited(F, m));
  } else Ans({ ok: false, why: 'unknown' });
}

// sends a message to a player's game now; the answer, or null when that game is not online
async function FrSendNow(Id, M, Timeout = 5) {
  if (!FrPeer || FrPeer.destroyed || !NetAvailable()) return null;
  let L;
  try { L = await NetConnect(FrPeer, FrPeerId(Id), 5000); } catch (e) { return null; }
  L.Send(Object.assign({ t: 'fr', v: NET_VER, from: FrMe() }, M));
  const R = await Race(L.Next('fra'), L.Closed.Await().then(() => null), Sleep(Timeout).then(() => null));
  L.Close();
  if (R && R.name) {
    for (const K of ['Friends', 'Out', 'In']) { const X = FrIn(FrData[K], Id); if (X) X.Name = R.name; }
    FrSave();
  }
  return R;
}

// requests / answers / removals: kept until the other game has them
function FrQueue(Id, M) {
  FrData.Outbox = FrData.Outbox.filter(X => !(X.To === Id && X.M.k === M.k)).concat([{ To: Id, M }]);
  FrSave();
  spawn(() => FrFlush());
}
let FrFlushing = false;
async function FrFlush() {
  if (FrFlushing) return;
  FrFlushing = true;
  try {
    for (const X of FrData.Outbox.slice()) {
      const R = await FrSendNow(X.To, X.M);
      if (!R) continue;
      if (R.why === 'version') continue;
      FrData.Outbox = FrData.Outbox.filter(Y => Y !== X);
      if (X.M.k === 'req' && R.mutual) { FrDrop('Out', X.To); FrAdd('Friends', X.To, R.name); }
      FrSave(); FrRefresh();
    }
  } finally { FrFlushing = false; }
}

// online / in a match / offline
async function FrCheck(Id) {
  FrStatus.set(Id, FrStatus.get(Id) || 'check');
  const R = await FrSendNow(Id, { k: 'st' }, 4);
  FrStatus.set(Id, R && R.ok ? R.st : 'offline');
  FrRefresh();
}

// ---------------------------------------------------------------- invitations
// the inviter (manager.InviteMatch): sends the room; resolves with the friend's answer ({ok, why}) or null
function FrSendInvite(Id, No, Mode) { return FrSendNow(Id, { k: 'inv', no: No, mode: Mode }, 40); }

// the invited player: a pop-up (20 s); accepting joins the room (manager.JoinInvite)
async function FrInvited(F, m) {
  const G = TheGame;
  if (!FrIn(FrData.Friends, F.Id)) return { ok: false, why: 'notfriend' };
  if (!G || !G.Me || G.Me.InGame || FrInviteOpen || G.PendingJoin || (G.Lobby && G.Lobby.Search)) return { ok: false, why: 'busy' };
  if (m.mode === ModeDeck && CardFirstOkDeck(G.Me.P, G.Lib.DB) < 0) {
    G.Me.UI.Notice(FrTxNoDeckInvite(F.Name));
    return { ok: false, why: 'nodeck' };
  }
  FrInviteOpen = true;
  try {
    const Yes = await FrAskInvite(F.Name, m.mode);
    if (!Yes) return { ok: false, why: 'declined' };
    if (G.Me.InGame) return { ok: false, why: 'busy' };
    G.JoinInvite(m.no, m.mode);
    return { ok: true };
  } finally { FrInviteOpen = false; }
}

function FrAskInvite(Name, Mode) {
  return new Promise(res => {
    const box = FrEl('div', 'frinv');
    box.innerHTML = `<div class="frpanel frsmall"><div class="frtitle">対戦の招待</div>
      <div class="frmsg">${FrEsc(Name)} から<br>プライベートマッチ（${Mode === ModeDeck ? '通常' : '2Pick'}）の招待が届きました！</div>
      <div class="frbtns"><button class="frbtn gold" data-a="y">受ける</button><button class="frbtn blue" data-a="n">断る</button></div>
      <div class="frtime"></div></div>`;
    document.getElementById('app').appendChild(box);
    if (TheGame && TheGame.Sfx) TheGame.Sfx.Play(null, SfxQuest);
    let Left = 20, done = false;
    const fin = v => { if (done) return; done = true; clearInterval(t); box.remove(); res(v); };
    const t = setInterval(() => { Left -= 1; box.querySelector('.frtime').textContent = `残り ${Left} 秒`; if (Left <= 0) fin(false); }, 1000);
    box.querySelector('.frtime').textContent = `残り ${Left} 秒`;
    box.querySelector('[data-a=y]').onclick = () => fin(true);
    box.querySelector('[data-a=n]').onclick = () => fin(false);
  });
}

// ---------------------------------------------------------------- the friend screen (HTML over the game)
function FrEsc(S) { return String(S).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function FrEl(Tag, Cls) { const e = document.createElement(Tag); if (Cls) e.className = Cls; return e; }

// resolves with {Invite: {Id, Name}, Mode} or null (closed)
function OpenFriendUI() {
  FrLoad();
  return new Promise(res => {
    const box = FrEl('div', 'frbox');
    box.innerHTML = `<div class="frpanel">
      <div class="frhead"><div class="frtitle">フレンド</div><button class="frx" title="とじる">✕</button></div>
      <div class="frsearch"><span class="frlens">🔎</span><input class="frinput" inputmode="numeric" maxlength="14" placeholder="プレイヤーIDを入力（12桁）" autocomplete="off" spellcheck="false"><button class="frbtn purple frsend">送信</button></div>
      <div class="frnote"></div>
      <div class="frcols">
        <div class="frcol"><div class="frsub">フレンド申請</div><div class="frlist frin"></div></div>
        <div class="frcol wide"><div class="frsub">フレンド <span class="frmode">招待するモード：<button class="frchip" data-m="${ModeDeck}">通常</button><button class="frchip" data-m="${Mode2Pick}">2Pick</button></span></div><div class="frlist frfriends"></div></div>
      </div>
      <div class="frfoot">あなたのID：<b>${FrIdText(ThePlayer.Id)}</b>${NetAvailable() ? '' : '　<span class="froff">（オフライン：申請や招待はオンラインのときに届きます）</span>'}</div>
    </div>`;
    document.getElementById('app').appendChild(box);
    const $ = s => box.querySelector(s);
    let Mode = (() => { try { return Number(localStorage.getItem('dd_invmode')) === ModeDeck ? ModeDeck : Mode2Pick; } catch (e) { return Mode2Pick; } })();
    let done = false;
    const close = R => {
      if (done) return; done = true;
      clearInterval(poll); FrUI = null; box.remove();
      window.removeEventListener('keydown', key, true);
      res(R);
    };
    const note = (T, Bad) => { const n = $('.frnote'); n.textContent = T; n.classList.toggle('bad', !!Bad); };
    const snd = Id => { if (TheGame && TheGame.Sfx) TheGame.Sfx.Play(null, Id); };
    const stText = S => S === 'online' ? ['オンライン', 'on'] : S === 'battle' ? ['対戦中', 'bat'] : S === 'offline' ? ['オフライン', 'off'] : ['確認中…', 'chk'];
    const render = () => {
      $('.frmode').querySelectorAll('.frchip').forEach(b => b.classList.toggle('sel', Number(b.dataset.m) === Mode));
      const In = FrData.In, Fs = FrData.Friends, Out = FrData.Out;
      $('.frin').innerHTML = (In.length === 0 && Out.length === 0) ? '<div class="frempty">申請はありません</div>' :
        In.map(F => `<div class="frrow"><div class="frname">${FrEsc(F.Name)}<small>${FrIdText(F.Id)}</small></div>
          <button class="frbtn gold sm" data-acc="${F.Id}">承認</button><button class="frbtn grey sm" data-dec="${F.Id}">拒否</button></div>`).join('') +
        Out.map(F => `<div class="frrow out"><div class="frname">${FrEsc(F.Name === '？' ? '（申請中）' : F.Name)}<small>${FrIdText(F.Id)}</small></div><span class="frwait">返事待ち</span>
          <button class="frbtn grey sm" data-cancel="${F.Id}">取消</button></div>`).join('');
      $('.frfriends').innerHTML = Fs.length === 0 ? '<div class="frempty">まだフレンドがいません。上の🔎にIDを入れて申請しよう！</div>' :
        Fs.map(F => {
          const [T, C] = stText(FrStatus.get(F.Id));
          return `<div class="frrow"><div class="frname">${FrEsc(F.Name)}<small>${FrIdText(F.Id)}</small></div>
            <span class="frst ${C}">● ${T}</span>
            <button class="frbtn blue sm" data-inv="${F.Id}" ${FrStatus.get(F.Id) === 'online' ? '' : 'disabled'}>招待</button>
            <button class="frbtn grey sm" data-del="${F.Id}">削除</button></div>`;
        }).join('');
    };
    FrUI = { Render: render, Close: close };
    const checkAll = () => { for (const F of FrData.Friends) spawn(() => FrCheck(F.Id)); };
    const poll = setInterval(checkAll, 10000);
    checkAll();
    render();
    const send = () => {
      const Id = $('.frinput').value.replace(/\D/g, '');
      if (!/^\d{12}$/.test(Id)) { note('プレイヤーIDは12桁の数字だよ（プロフィールで確認できます）', true); snd(SfxCancel); return; }
      if (Id === ThePlayer.Id) { note('自分のIDには申請できません', true); snd(SfxCancel); return; }
      if (FrIn(FrData.Friends, Id)) { note('もうフレンドです', true); snd(SfxCancel); return; }
      if (FrIn(FrData.In, Id)) { accept(Id); return; }
      if (FrIn(FrData.Out, Id)) { note('申請済みです（返事待ち）', true); return; }
      FrAdd('Out', Id, '？');
      FrQueue(Id, { k: 'req' });
      $('.frinput').value = '';
      note(NetAvailable() ? 'フレンド申請を送りました！（相手がオフラインなら、次に同時にオンラインになったときに届きます）' : 'オフラインです。オンラインになったら申請が届きます');
      snd(SfxQuest);
      render();
    };
    const accept = Id => {
      const F = FrIn(FrData.In, Id); if (!F) return;
      FrDrop('In', Id); FrAdd('Friends', Id, F.Name); FrQueue(Id, { k: 'acc' });
      note(`${F.Name} とフレンドになりました！`); snd(SfxLevelUp); render(); spawn(() => FrCheck(Id));
    };
    $('.frsend').onclick = send;
    $('.frinput').onkeydown = e => { if (e.key === 'Enter') send(); };
    $('.frx').onclick = () => { snd(SfxCancel); close(null); };
    $('.frmode').onclick = e => { const m = e.target.dataset && e.target.dataset.m; if (m != null) { Mode = Number(m); try { localStorage.setItem('dd_invmode', String(Mode)); } catch (x) { } snd(SfxClick); render(); } };
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.acc) accept(d.acc);
      else if (d.dec) { const F = FrIn(FrData.In, d.dec); FrDrop('In', d.dec); FrQueue(d.dec, { k: 'dec' }); note(`${F ? F.Name : ''} の申請を拒否しました`); snd(SfxCancel); render(); }
      else if (d.cancel) { FrDrop('Out', d.cancel); FrData.Outbox = FrData.Outbox.filter(X => X.To !== d.cancel); FrSave(); note('申請を取り消しました'); render(); }
      else if (d.del) {
        const F = FrIn(FrData.Friends, d.del);
        if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '本当に？'; setTimeout(() => { if (b.isConnected) { b.dataset.sure = ''; b.textContent = '削除'; } }, 3000); return; }
        FrDrop('Friends', d.del); FrQueue(d.del, { k: 'del' }); note(`${F ? F.Name : ''} をフレンドから削除しました`); snd(SfxCancel); render();
      } else if (d.inv) {
        const F = FrIn(FrData.Friends, d.inv);
        if (!F) return;
        if (Mode === ModeDeck && CardFirstOkDeck(ThePlayer, TheGame.Lib.DB) < 0) { note('通常で招待するには、40枚のデッキが必要です', true); snd(SfxCancel); return; }
        snd(SfxClick);
        close({ Invite: { Id: F.Id, Name: F.Name }, Mode });
      }
    });
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(null); } };
    window.addEventListener('keydown', key, true);
  });
}
function FrCloseUI() { if (FrUI) FrUI.Close(null); }

function FrTxReqArrived(N) { return `${N} からフレンド申請が届きました！（タイトル右下の「フレンド」から確認できるよ）`; }
function FrTxAccepted(N) { return `${N} がフレンド申請を承認しました！`; }
function FrTxNoDeckInvite(N) { return `${N} から通常の招待が届いたけど、使えるデッキがないので受けられなかったよ`; }
const FrTxInviting = 'フレンドを招待中';
function FrTxWaitFriend(N) { return `${N} の返事を待っています…`; }
function FrTxRefused(Why) {
  return Why === 'busy' ? '相手は今、招待を受けられません（対戦中など）' : Why === 'nodeck' ? '相手に使えるデッキがありませんでした'
    : Why === 'declined' ? '招待は断られました' : Why === 'notfriend' ? '相手のフレンドリストにあなたがいません' : '相手に招待が届きませんでした（オフライン）';
}
