// lobby.js — card_lobby.verse rewritten for the browser: the 2Pick draft helpers (unchanged), and PvP between two
// browsers anywhere over PeerJS (WebRTC data channel; the public PeerJS server only introduces the two browsers).
//  - 野良対戦 (random queue): a few well-known "queue slot" peer ids per mode. A searching browser first tries to
//    join a waiting host; if nobody waits it becomes the host of a free slot (and keeps checking the lower slots,
//    so two hosts that started at the same moment still find each other).
//  - 部屋 (rooms): the room owner registers the peer id of its 2-digit room number; joining = connecting to it.
//  - The match is lockstep (see PORTING.md): both browsers run the same card_match with the same seed and only send
//    the players' decisions (card_match.Decide) — the host picks the seats, the seed and the draft schedule.
'use strict';

// ---------------------------------------------------------------- the player (one per browser)
class pvp_result {
  constructor(o = {}) {
    this.Won = o.Won ?? false; this.Lost = o.Lost ?? false; this.Reason = o.Reason ?? 0; this.Early = o.Early ?? false;
    this.Rounds = o.Rounds ?? 0; this.Summons = o.Summons ?? 0; this.Jewels = o.Jewels ?? 0; this.Mode = o.Mode ?? 0;
    this.IsRandom = o.IsRandom ?? false; this.Hero = o.Hero ?? -1;
  }
}
class card_player {
  constructor(o = {}) {
    this.P = o.P; this.UI = o.UI; this.Menus = o.Menus;
    this.Found = new VEvent();      // somebody took this player out of the queue / room
    this.Done = new VEvent();       // pvp_result
    this.Rescue = new VEvent();
    this.InGame = false;
  }
}

// ---------------------------------------------------------------- draft (as in Verse)
const DraftRounds = 20;
const DraftPickSeconds = 20.0;
const DraftPickRegain = 10.0;
const MullLimit = 20.0;
const HeroPickSeconds = 15.0;
const DeckHeroMaxSeconds = 45.0;

function DraftForced(R) { return (R === 10 || R === 20) ? RarL : (R === 5 || R === 15) ? RarE : -1; }
function DraftRollRarity() { const X = GetRandomInt(1, 100); return X <= 3 ? RarL : X <= 12 ? RarE : X <= 40 ? RarR : RarN; }
function DraftRollBelow(Top) { const X = GetRandomInt(1, 100); const R = X <= 12 ? RarE : X <= 42 ? RarR : RarN; return Math.min(R, Top - 1); }
function DraftPool(DB, HeroId) { return DB.filter(D => !D.Token && (D.HeroOnly < 0 || D.HeroOnly === HeroId)); }
function DraftRandomOf(Pool, Rarity, Except) {
  const Cands = Pool.filter(D => D.Rarity === Rarity && !Except.includes(D.Id));
  if (Cands.length > 0) return Cands[GetRandomInt(0, Cands.length - 1)];
  const Any = Pool.filter(D => !Except.includes(D.Id) && D.Rarity < RarE);
  return Any[GetRandomInt(0, Any.length - 1)] || Pool[0];
}
class draft_round { constructor(o) { this.A = o.A; this.B = o.B; } }
function DraftMakeSchedule() {
  const S = [];
  for (let R = 1; R <= DraftRounds; R++) {
    const F = DraftForced(R);
    S.push(F >= 0 ? new draft_round({ A: F, B: DraftRollBelow(F) }) : new draft_round({ A: DraftRollRarity(), B: DraftRollRarity() }));
  }
  return S;
}
function DraftRoundOf(Sched, R) { return At(Sched, R - 1) || new draft_round({ A: RarN, B: RarN }); }
function DraftOptions(Pool, Rd) {
  const C1 = DraftRandomOf(Pool, Rd.A, []);
  const C2 = DraftRandomOf(Pool, Rd.B, [C1.Id]);
  const C3 = DraftRandomOf(Pool, Rd.A, [C1.Id, C2.Id]);
  const C4 = DraftRandomOf(Pool, Rd.B, [C1.Id, C2.Id, C3.Id]);
  return [[C1, C2], [C3, C4]];
}
function DraftAutoPick(Opts) {
  let Best = 0, BestScore = -1;
  Opts.forEach((O, I) => {
    let Sc = GetRandomFloat(0, 1.5);
    for (const D of O) Sc += D.Rarity * 1.5 + ((D.Cost >= 2 && D.Cost <= 5) ? 0.5 : 0);
    if (Sc > BestScore) { BestScore = Sc; Best = I; }
  });
  return Best;
}
function DraftAutoDeck(Pool, Sched) {
  let Deck = [];
  for (let R = 1; R <= DraftRounds; R++) {
    const Opts = DraftOptions(Pool, DraftRoundOf(Sched, R));
    const O = Opts[DraftAutoPick(Opts)];
    if (O) Deck = Deck.concat(O);
  }
  return Deck;
}

// ---------------------------------------------------------------- network
const NET_VER = 'dd1';                 // both browsers must run the same rules (bump when the rules change)
const NET_PREFIX = 'duelduel-' + NET_VER + '-';
const NET_SLOTS = 4;                   // queue slots per mode

function NetAvailable() { return typeof Peer !== 'undefined' && navigator.onLine !== false; }

// a PeerJS peer (id = null: a random one); rejects with the PeerJS error type
function NetOpenPeer(Id, Timeout = 9000) {
  return new Promise((res, rej) => {
    if (!NetAvailable()) { rej('offline'); return; }
    let done = false;
    const p = Id ? new Peer(Id, { debug: 0 }) : new Peer({ debug: 0 });
    const t = setTimeout(() => { if (!done) { done = true; try { p.destroy(); } catch (e) { } rej('timeout'); } }, Timeout);
    p.on('open', () => { if (!done) { done = true; clearTimeout(t); res(p); } });
    p.on('error', e => { if (!done) { done = true; clearTimeout(t); try { p.destroy(); } catch (x) { } rej(e && e.type || 'error'); } });
  });
}

// one data connection with typed messages: Send(obj), await Next(type), OnMsg(type, fn), Closed (VEvent)
class net_link {
  constructor(Conn) {
    this.Conn = Conn; this.Queues = {}; this.Waiters = {}; this.Handlers = {}; this.Closed = new VEvent(); this.IsClosed = false;
    Conn.on('data', m => this.Got(m));
    Conn.on('close', () => this.Close());
    Conn.on('error', () => this.Close());
    // a dead connection (browser closed, phone asleep) is noticed by the missing pings
    this.LastSeen = Date.now();
    this.Ping = setInterval(() => {
      if (this.IsClosed) return;
      this.Send({ t: 'ping' });
      if (Date.now() - this.LastSeen > 20000) this.Close();
    }, 3000);
  }
  Got(m) {
    this.LastSeen = Date.now();
    if (!m || typeof m !== 'object' || m.t === 'ping') return;
    const h = this.Handlers[m.t];
    if (h) { h(m); return; }
    const w = this.Waiters[m.t];
    if (w && w.length) { w.shift()(m); return; }
    (this.Queues[m.t] = this.Queues[m.t] || []).push(m);
  }
  Send(m) { if (!this.IsClosed) try { this.Conn.send(m); } catch (e) { } }
  Next(T) {
    const q = this.Queues[T];
    if (q && q.length) return Promise.resolve(q.shift());
    return new Promise(r => (this.Waiters[T] = this.Waiters[T] || []).push(r));
  }
  OnMsg(T, Fn) {
    this.Handlers[T] = Fn;
    const q = this.Queues[T];
    if (q) { delete this.Queues[T]; for (const m of q) Fn(m); }
  }
  Close() {
    if (this.IsClosed) return;
    this.IsClosed = true;
    clearInterval(this.Ping);
    try { this.Conn.close(); } catch (e) { }
    this.Closed.Signal();
  }
}

// connects to peer id To from peer Me; resolves with a net_link, rejects when it is not there
function NetConnect(Me, To, Timeout = 6000) {
  return new Promise((res, rej) => {
    let done = false;
    const c = Me.connect(To, { reliable: true, serialization: 'json' });
    const fail = why => { if (!done) { done = true; clearTimeout(t); Me.off('error', perr); try { c.close(); } catch (e) { } rej(why); } };
    const perr = e => { if (e && e.type === 'peer-unavailable' && String(e.message || '').includes(To)) fail('none'); };
    const t = setTimeout(() => fail('timeout'), Timeout);
    Me.on('error', perr);
    c.on('open', () => { if (!done) { done = true; clearTimeout(t); Me.off('error', perr); res(new net_link(c)); } });
    c.on('error', () => fail('error'));
  });
}

// textures travel as [group, name]
function TexRef(T) { return T ? [T.Grp, T.Name] : null; }
function TexOf(R) { if (!R) return null; return (R[0] === 'CardMon' ? CardMon : CardGui)[R[1]] || null; }

// ---------------------------------------------------------------- the lobby (one per browser)
class card_lobby {
  constructor(o = {}) {
    this.Lib = o.Lib;
    this.DebugBot = false;
    this.Players = [];
    this.WaitCache = {};          // mode -> players waiting (probed now and then)
    this.PollOn = false;
    this.Search = null;           // the running search / room: {Cancel()}
    this.Link = null;             // the connection of the session that is starting
  }
  // (browser: the title's player mark is the friends button: this = friend requests waiting, friends.js)
  PlayerCount() { return typeof FriendInCount === 'function' ? FriendInCount() : 0; }
  QueueSlot(Mode, K) { return NET_PREFIX + 'q' + Mode + '-' + K; }
  RoomId(No) { return NET_PREFIX + 'room-' + No; }

  // players waiting in the random queue of a mode (an estimate: the queue slots that answer)
  Waiting(Me, Mode) { this.StartPoll(); return this.WaitCache[Mode] || 0; }
  StartPoll() {
    if (this.PollOn) return;
    this.PollOn = true;
    spawn(async () => {
      let Probe = null;
      while (true) {
        if (NetAvailable() && !this.Search) {
          try {
            if (!Probe || Probe.destroyed || Probe.disconnected) { if (Probe) try { Probe.destroy(); } catch (e) { } Probe = await NetOpenPeer(null); }
            for (const Mode of [ModeDeck, Mode2Pick]) {
              let N = 0;
              for (let K = 0; K < NET_SLOTS; K++) {
                try {
                  const L = await NetConnect(Probe, this.QueueSlot(Mode, K), 3500);
                  L.Send({ t: 'peek', v: NET_VER });
                  const R = await Race(L.Next('peeked'), Sleep(3).then(() => null));
                  if (R && R.waiting) N++;
                  L.Close();
                } catch (e) { }
              }
              this.WaitCache[Mode] = N;
            }
          } catch (e) { }
        }
        await Sleep(15);
      }
    });
  }

  Join(Me) { this.Players = this.Players.filter(C => C !== Me).concat([Me]); }
  Forget(Me) { this.Players = this.Players.filter(C => C !== Me); }
  Leave(Me) { if (this.Search) { this.Search.Cancel(); this.Search = null; } }

  // ------------------------------------------------------------ random queue
  // resolves with {Link, Host} when matched; Cancel() (Leave) stops the search
  RandomSearch(Mode) {
    this.Leave();
    let Stop = false;
    const Peers = [];
    const S = { Cancel: () => { Stop = true; for (const p of Peers) try { p.destroy(); } catch (e) { } } };
    this.Search = S;
    // matched: the peer that carries the link stays, the others go
    const Keep = (R, Owner) => {
      S.Owner = Owner;
      for (const p of Peers) if (p !== Owner) try { p.destroy(); } catch (e) { }
      if (this.Search === S) this.Search = null;
      return { Link: R.Link, Host: R.Host, Owner };
    };
    S.Done = (async () => {
      while (!Stop) {
        try {
          // 1) somebody waiting? join them
          const Me = await NetOpenPeer(null); Peers.push(Me);
          for (let K = 0; K < NET_SLOTS && !Stop; K++) {
            const L = await this.TryJoin(Me, this.QueueSlot(Mode, K), { t: 'hi', v: NET_VER, kind: 'q', mode: Mode });
            if (L) return Keep({ Link: L, Host: false }, Me);
          }
          if (Stop) break;
          // 2) nobody: wait in the first free slot, and keep trying the lower ones
          for (let K = 0; K < NET_SLOTS && !Stop; K++) {
            let Host;
            try { Host = await NetOpenPeer(this.QueueSlot(Mode, K)); } catch (e) { if (e === 'unavailable-id') continue; throw e; }
            Peers.push(Host);
            const Got = await this.HostWait(Host, Mode, 'q', () => Stop, async () => {
              for (let J = 0; J < K; J++) {
                const L = await this.TryJoin(Me, this.QueueSlot(Mode, J), { t: 'hi', v: NET_VER, kind: 'q', mode: Mode });
                if (L) return L;
              }
              return null;
            });
            if (Got) return Keep(Got, Got.Host ? Host : Me);
            break;
          }
        } catch (e) { console.log('search', e); }
        if (!Stop) await Sleep(2);
      }
      return null;
    })();
    return S;
  }

  // connect + hello; the link when the host says yes, else null
  async TryJoin(Me, To, Hello) {
    let L;
    try { L = await NetConnect(Me, To, 4000); } catch (e) { return null; }
    L.Send(Hello);
    const R = await Race(L.Next('ok'), L.Next('no'), L.Closed.Await().then(() => null), Sleep(5).then(() => null));
    if (R && R.t === 'ok') return L;
    L.Close();
    return null;
  }

  // waits as host for one guest (also answers peeks); Poll (optional) can find a match the other way
  HostWait(Host, Mode, Kind, Stopped, Poll) {
    return new Promise(res => {
      let done = false;
      const finish = v => { if (!done) { done = true; clearInterval(t); res(v); } };
      Host.on('connection', c => {
        c.on('open', () => {
          const L = new net_link(c);
          L.OnMsg('peek', () => { L.Send({ t: 'peeked', waiting: !done, mode: Mode }); setTimeout(() => L.Close(), 500); });
          L.OnMsg('hi', m => {
            if (done || m.v !== NET_VER || (Kind === 'q' && m.mode !== Mode)) { L.Send({ t: 'no', why: m.v !== NET_VER ? 'version' : 'busy' }); setTimeout(() => L.Close(), 500); return; }
            L.Send({ t: 'ok', mode: Mode });
            finish({ Link: L, Host: true });
          });
        });
      });
      const t = setInterval(async () => {
        if (Stopped()) { finish(null); return; }
        if (Poll && !done) { const L = await Poll(); if (L) finish({ Link: L, Host: false }); }
      }, 4000);
    });
  }

  // ------------------------------------------------------------ rooms (2 digits like Verse, unique on the PeerJS server)
  async OpenRoom(Me, Mode) {
    this.Leave();
    let Stop = false;
    let Host = null;
    const S = { Cancel: () => { Stop = true; if (Host) try { Host.destroy(); } catch (e) { } } };
    this.Search = S;
    const Tried = new Set();
    let No = -1;
    while (Tried.size < 90) {
      const N = GetRandomInt(10, 99);
      if (Tried.has(N)) continue;
      Tried.add(N);
      try { Host = await NetOpenPeer(this.RoomId(N)); No = N; break; } catch (e) { if (e !== 'unavailable-id') { No = -1; break; } }
    }
    if (No < 0) { S.Done = Promise.resolve(null); return -1; }
    S.Done = this.HostWait(Host, Mode, 'room', () => Stop, null).then(R => {
      if (!R) return null;
      if (this.Search === S) this.Search = null;
      return { Link: R.Link, Host: true, Owner: Host };
    });
    return No;
  }

  // the mode of room No (-1: no such room / offline)
  async RoomMode(No) {
    let Me;
    try { Me = await NetOpenPeer(null); } catch (e) { return -1; }
    try {
      const L = await NetConnect(Me, this.RoomId(No), 5000);
      L.Send({ t: 'peek', v: NET_VER });
      const R = await Race(L.Next('peeked'), Sleep(5).then(() => null));
      L.Close();
      return R && R.waiting ? R.mode : -1;
    } catch (e) { return -1; } finally { setTimeout(() => { try { Me.destroy(); } catch (e) { } }, 800); }
  }

  // joins room No: the link (as a card_player-like "other") or null
  async JoinRoom(C, No) {
    this.Leave();
    let Me;
    try { Me = await NetOpenPeer(null); } catch (e) { return null; }
    const L = await this.TryJoin(Me, this.RoomId(No), { t: 'hi', v: NET_VER, kind: 'room' });
    if (!L) { try { Me.destroy(); } catch (e) { } return null; }
    this.Link = { Link: L, Host: false, Owner: Me };
    return this.Link;
  }

  // ------------------------------------------------------------ starting the session
  // Got = {Link, Host, Owner}; the host decides the seats, the seed and the draft schedule
  async StartPvp(Me, Got, Mode, IsRandom) {
    const L = Got.Link;
    let MySeat, Seed, Sched;
    if (Got.Host) {
      MySeat = GetRandomInt(0, 1);
      Seed = GetRandomInt(1, 2000000000);
      Sched = DraftMakeSchedule();
      L.Send({ t: 'start', seat: 1 - MySeat, seed: Seed, sched: Sched.map(R => [R.A, R.B]), mode: Mode, random: IsRandom });
    } else {
      const S = await Race(L.Next('start'), L.Closed.Await().then(() => null), Sleep(15).then(() => null));
      if (!S) { L.Close(); return null; }
      MySeat = S.seat; Seed = S.seed; Sched = S.sched.map(R => new draft_round({ A: R[0], B: R[1] })); Mode = S.mode; IsRandom = S.random;
    }
    Print(`card pvp: start seat=${MySeat} mode=${Mode} host=${Got.Host}`);
    const Ses = new pvp_session({ Lobby: this, Me, Link: L, Owner: Got.Owner, MySeat, Seed, Sched, Mode, IsRandom });
    spawn(() => Ses.Run());
    return Ses;
  }
}

// ---------------------------------------------------------------- the session (this browser's half)
class pvp_session {
  constructor(o) {
    this.Lobby = o.Lobby; this.Me = o.Me; this.Link = o.Link; this.Owner = o.Owner; this.MySeat = o.MySeat; this.Seed = o.Seed;
    this.Sched = o.Sched; this.Mode = o.Mode; this.IsRandom = o.IsRandom;
    this.Prog = new draft_progress();
    this.Match = null;
    this.Gone = false;
    this.Recvs = [[], []]; this.RecvWait = [[], []];
  }
  get Opp() { return 1 - this.MySeat; }

  async Run() {
    const L = this.Link;
    // the decisions of the other browser (card_match.Decide) and its surrender
    L.OnMsg('d', m => this.Got(m.w, m.v));
    L.OnMsg('concede', m => { if (this.Match && this.Match.Concede) this.Match.Concede(m.w); });
    L.OnMsg('prog', m => { this.Prog.Picks[this.Opp] = m.n; });
    L.OnMsg('stamp', m => { if (this.Match && this.Match.RemoteStamp) this.Match.RemoteStamp(m.w, m.k); });
    let R;
    try {
      R = await Race(this.Flow(), L.Closed.Await().then(() => 'gone'));
    } catch (e) {
      if (!(e instanceof FlowAbort)) console.error('pvp flow', e);
      R = 'gone';
    }
    if (R === 'gone') {
      this.Gone = true;
      Print('card pvp: the opponent left');
      const M = this.Match;
      if (M && !M.Ended && M.Concede) M.Concede(this.Opp, EndLeft);
      // (screens of the draft / deck pick still waiting for input die on their next input)
      AbortFlows();
      R = [this.MySeat, EndLeft];
    }
    if (this.Match) this.Match.Finished = true;
    setTimeout(() => { L.Close(); try { this.Owner && this.Owner.destroy(); } catch (e) { } }, 3000);
    this.Deliver(R[0], R[1]);
  }

  // a decision of side W from the network (numbered: they come in order)
  Got(W, V) { const w = this.RecvWait[W]; if (w.length) w.shift()(V); else this.Recvs[W].push(V); }
  Recv(W) { const q = this.Recvs[W]; if (q.length) return Promise.resolve(q.shift()); return new Promise(r => this.RecvWait[W].push(r)); }

  async Flow() {
    const L = this.Link, Me = this.Me, M = Me.Menus, Lib = this.Lobby.Lib, P = Me.P;
    M.CloseAll();
    // both players see who they play against first
    const MyVs = VsOf(P, M.FavHero());
    L.Send({ t: 'vs', vs: { Name: MyVs.Name, Level: MyVs.Level, Hero: MyVs.Hero.Id, HeroName: MyVs.HeroName, Pic: TexRef(MyVs.Pic), Wins: MyVs.Wins, Losses: MyVs.Losses, Title: MyVs.Title, Badges: (MyVs.Badges || []).map(TexRef) } });
    const V = (await L.Next('vs')).vs;
    const TheirVs = new vs_info({ Name: V.Name, Level: V.Level, Hero: M.HeroOf(V.Hero), HeroName: V.HeroName, Pic: TexOf(V.Pic) || M.HeroOf(V.Hero).Pic, Wins: V.Wins, Losses: V.Losses, Title: V.Title, Badges: (V.Badges || []).map(TexOf) });
    await M.VsIntro(MyVs, TheirVs);
    // the deck and the character
    let Hero, Deck;
    if (this.Mode === ModeDeck) {
      const Pk = await this.DeckAndHero();
      Hero = Pk[1];
      Deck = DeckCards(Lib, Pk[0], Hero.Id);
    } else {
      const T = GetSimulationElapsedTime() + HeroPickSeconds;
      Hero = (await this.PickHero(-1, false, T)) || M.FavHero();
      const Pool = DraftPool(Lib.DB, Hero.Id);
      // my progress goes to the other browser
      let Last = -1, Drafting = true;
      spawn(async () => { while (Drafting) { const N = this.Prog.Picks[this.MySeat]; if (N !== Last) { Last = N; L.Send({ t: 'prog', n: N }); } await Sleep(0.5); } });
      Deck = await M.Draft(this.Prog, this.MySeat, Pool, this.Sched, true);
      Drafting = false;
      L.Send({ t: 'prog', n: DraftRounds });
    }
    M.CloseAll();
    // everything the other browser needs to build my side
    const S = GetCardSave(P);
    L.Send({ t: 'side', hero: Hero.Id, deck: Deck.map(D => D.Id), name: TxAgent(P), back: S.Back, pic: TexRef(CardHeroPic(P, Hero)), hname: CardHeroName(P, Hero), hrace: CardHeroRace(P, Hero), prem: S.Prem, level: CardLevelOf(S.Xp).Level });
    if (Me.UI.Notice) Me.UI.Notice(TlWaitOpp);
    const O = await L.Next('side');
    const MySide = new side({ Hero, Name: TxAgent(P), Back: S.Back, Deck, PicOverride: CardHeroPic(P, Hero), NameOverride: CardHeroName(P, Hero), RaceOverride: CardHeroRace(P, Hero), Prem: S.Prem, Level: CardLevelOf(S.Xp).Level });
    const OH = M.HeroOf(O.hero);
    const TheirSide = new side({ Hero: OH, Name: O.name, Back: O.back, Deck: O.deck.map(Id => Lib.CardById(Id)), PicOverride: TexOf(O.pic) || OH.Pic, NameOverride: O.hname, RaceOverride: O.hrace, Prem: O.prem || [], Level: O.level });
    const Sides = this.MySeat === 0 ? [MySide, TheirSide] : [TheirSide, MySide];
    const Net = {
      Remote: this.Opp,
      Send: (W, Val) => L.Send({ t: 'd', w: W, v: Val }),
      Recv: W => this.Recv(W),
      Concede: W => L.Send({ t: 'concede', w: W }),
      Stamp: (W, K) => L.Send({ t: 'stamp', w: W, k: K }),
    };
    const Mt = new card_match({
      DB: Lib.DB, Me: Sides[0], Foe: Sides[1],
      Views: this.MySeat === 0 ? [Me.UI, null] : [null, Me.UI],
      Pvp: true, TurnSeconds: CardTurnMax, MullSeconds: MullLimit, Seed: this.Seed, Net,
    });
    this.Match = Mt;
    const W = await Mt.Run();
    return [W, Mt.Reason];
  }

  // 通常: the deck, then the character; the character select's 戻る goes back to the deck list while there is time
  async DeckFor(Deadline) {
    const C = this.Me, Lib = this.Lobby.Lib;
    const I = await C.Menus.Dk.DeckSelect(false, Deadline);
    if (I >= 0 && CardDeckOk(C.P, Lib.DB, I)) return CardDeckOf(C.P, I);
    return RandomDeck(Lib, C.Menus.FavHero().Id);
  }
  async DeckAndHero() {
    const Limit = GetSimulationElapsedTime() + DeckHeroMaxSeconds;
    while (true) {
      const T0 = GetSimulationElapsedTime();
      const D = await this.DeckFor(Math.max(T0 + 3, Math.min(T0 + DeckPickSeconds, Limit - HeroPickSeconds)));
      const T1 = GetSimulationElapsedTime();
      const Back = Limit - T1 > HeroPickSeconds + 5;
      const H = await this.PickHero(D.Hero, Back, Math.max(T1 + 3, Math.min(T1 + HeroPickSeconds, Limit)));
      if (H) return [D, H];
    }
  }
  async PickHero(Pre, CanBack, Deadline) {
    const Heroes = this.Lobby.Lib.Heroes, C = this.Me;
    const Picked = await C.Menus.CharSelect(CanBack, Deadline, Pre, Pre < 0);
    if (CanBack && !Picked) return null;
    return Picked || (Pre >= 0 && Heroes[Pre]) || C.Menus.FavHero();
  }

  Deliver(Winner, Reason) {
    const Seat = this.MySeat;
    let Res = new pvp_result({ Won: Winner === Seat, Lost: Winner === 1 - Seat, Reason, Early: true, Mode: this.Mode, IsRandom: this.IsRandom });
    const M = this.Match;
    if (M) {
      const Sd = M.S(Seat);
      Res = new pvp_result({ Won: Res.Won, Lost: Res.Lost, Reason, Early: !M.FirstTurnDone, Rounds: M.Rounds(), Summons: Sd.Summons, Jewels: Sd.Jewels, Mode: this.Mode, IsRandom: this.IsRandom, Hero: Sd.Hero.Id });
    }
    this.Me.Done.Signal(Res);
  }
}

// ---------------------------------------------------------------- texts
function TlNoticeRandom(N) { return `【お知らせ】野良対戦で${N}人が待機中！「対戦」→「野良対戦」で今すぐ対戦できるよ`; }
function TlNoticeDeck(N) { return `【お知らせ】野良対戦-通常で${N}人が待機中！「対戦」→「野良対戦-通常」で今すぐ対戦できるよ`; }
function TlNotice2Pick(N) { return `【お知らせ】野良対戦-2Pickで${N}人が待機中！「対戦」→「野良対戦-2Pick」で今すぐ対戦できるよ`; }
const TlWaitOpp = '相手の準備を待っています…';
const TlOffline = 'オンラインに接続できません。インターネット接続を確認してね（CPU対戦はオフラインでも遊べます）';
