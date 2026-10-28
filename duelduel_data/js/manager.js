// manager.js — card_manager.verse: the flow of the whole game for the one player of this browser
// (title -> battles / deck building / shop / ...). Online PvP goes through lobby.js (PeerJS).
'use strict';

const DebugAutoPlay = false;
const DebugMoney = 0;

class card_game_device {
  constructor() {
    this.Sfx = null; this.Lib = null; this.Lobby = null; this.Me = null;
  }

  async OnBegin(P) {
    this.Sfx = MakeCardSfx();
    this.Lib = MakeCardLib('');
    this.Lobby = new card_lobby({ Lib: this.Lib });
    await this.RunPlayer(P);
  }

  async RunPlayer(P) {
    const Lobby = this.Lobby, Lib = this.Lib;
    CardCheckLogin(P);
    // the starter deck and the special players' gifts, given silently
    CardGiveGifts(P);
    if (DebugMoney > 0) {
      const Sv = GetCardSave(P);
      CardAddCoins(P, Math.max(0, DebugMoney - Sv.Coins));
      CardAddGems(P, Math.max(0, DebugMoney - Sv.Gems));
    }
    if (typeof CardRedeemGems === 'function') spawn(() => CardRedeemGems(P));
    if (typeof CardCheckPass === 'function') spawn(() => CardCheckPass(P));
    // (browser) friends: this game can be found online, requests waiting in the outbox go out
    spawn(() => FrStart());
    while (true) {
      const Again = await this.RunScreens(P, Lobby, Lib);
      if (!Again) break;
      await Sleep(0.3);
    }
  }

  // the card screen until the rescue (true) — in the browser the page just keeps running
  async RunScreens(P, Lobby, Lib) {
    const Keys = new card_keys();
    const UI = MakeBoardUI(P, Lib, this.Sfx, Keys);
    const Menus = MakeMenus(UI, Lobby, Lib);
    const Me = new card_player({ P, UI, Menus });
    Menus.Me = Me;
    this.Me = Me;
    Lobby.Join(Me);
    UI.Open();
    Keys.Run(P);
    spawn(() => this.PlayTimeLoop(P));
    let Rescued = false;
    await Race(this.PlayLoop(Me), Me.Rescue.Await().then(() => { Rescued = true; }));
    Lobby.Leave(Me);
    Lobby.Forget(Me);
    AbortFlows();
    Menus.CloseAll();
    UI.Close();
    return Rescued;
  }

  async PlayTimeLoop(P) {
    while (true) { await Sleep(60); CardAddPlayMinute(P); }
  }

  // ------------------------------------------------------------ menus
  async PlayLoop(Me) {
    const M = Me.Menus;
    if (DebugAutoPlay) { await this.AutoLoop(Me); return; }
    // the tutorial is offered once; then the login bonus and the hour bonus open by themselves
    // (web: a brand-new player doesn't need the アップデート情報)
    const Fresh = !CardTutorialOffered(Me.P);
    if (!CardTutorialOffered(Me.P)) {
      M.ShowTitle();
      const Yes = await M.TutorialAsk();
      CardTutorialSeen(Me.P);
      if (Yes) await this.TutorialMatch(Me);
    }
    if (CardLoginReady(Me.P)) {
      M.ShowTitle();
      await M.Ps.LoginBonus();
      M.UpdateTitle();
    }
    if (CardHourReady(Me.P)) {
      M.ShowTitle();
      await M.Login();
    }
    // (web) news.js: the notes of the update, once per version
    if (Fresh) NewsMarkSeen();
    else if (!NewsSeen()) {
      M.ShowTitle();
      await NewsMaybeShow();
    }
    while (true) {
      try {
        // (browser) a friend's invitation that was accepted: join their room
        if (this.PendingJoin) {
          const J = this.PendingJoin;
          await this.InvitedMatch(Me, J);
          this.PendingJoin = null;
          continue;
        }
        if (CardLoginReady(Me.P)) {
          M.ShowTitle();
          await M.Ps.LoginBonus();
        }
        const Id = await M.Title();
        if (Id === 100) await this.BattleLoop(Me);
        else if (Id === 101) { M.CloseAll(); await M.Dk.DeckBuilder(); M.CloseAll(); }
        else if (Id === 105) await M.Dk.CharDetail();
        else if (Id === 106) { M.CloseAll(); await M.Shop(); }
        else if (Id === 107) await M.Collection();
        else if (Id === 108) await M.BackSetting();
        else if (Id === 102) await M.Quests();
        else if (Id === 103) await M.Login();
        else if (Id === 104) await M.Rules();
        else if (Id === 119) await M.Ach.AchScreen();
        else if (Id === 109) await M.CodeScreen();
        else if (Id === 120) await M.Profile();
        else if (Id === OptGearId) await OptScreen(M);
        else if (Id === 124) {
          // (browser) フレンド: an invitation starts a private match
          M.ShowTitle();
          const R = await OpenFriendUI();
          if (R && R.Invite) await this.InviteMatch(Me, R.Invite, R.Mode);
        }
      } catch (e) {
        this.PendingJoin = this.PendingJoin && this.PendingJoin.Done ? null : this.PendingJoin;
        // a screen left behind by an online match that ended: back to the title
        if (!(e instanceof FlowAbort)) { console.error('menu flow', e); }
        Me.InGame = false;
        M.CloseAll();
        await Sleep(0.2);
      }
    }
  }

  // 通常 needs a deck with 40 cards
  CanUse(Me, Mode) {
    if (Mode !== ModeDeck) return true;
    if (CardFirstOkDeck(Me.P, this.Lib.DB) >= 0) return true;
    Me.Menus.Inform(TmNoDeck);
    Me.UI.Snd(SfxCancel);
    return false;
  }

  // 110 CPU, 111 野良（通常）, 118 野良（2Pick）, 112 部屋を作る, 113 部屋に参加
  async BattleLoop(Me) {
    const M = Me.Menus;
    while (true) {
      const C = await M.BattleMenu();
      if (C === 114) return;
      if (C === 110) {
        const Mode = await M.Dk.ModeSelect(TdCpuMode);
        if (Mode === ModeTower) {
          // 無限の塔 (tower.js): its own deck pick and CPU strength per floor
          const Back = await TowerLoop(this, Me);
          if (Back === 74) return;
        } else if (Mode >= 0 && this.CanUse(Me, Mode)) {
          const Level = await M.Ex.LevelSelect();
          if (Level >= 0) {
            const Back = await this.CpuLoop(Me, Mode, Level);
            if (Back === 74) return;
          }
        }
      } else if (C === 111 || C === 118) {
        const Mode = C === 111 ? ModeDeck : Mode2Pick;
        if (this.CanUse(Me, Mode)) {
          const Played = await this.RandomMatch(Me, Mode);
          if (Played) return;
        }
      } else if (C === 112) {
        const Mode = await M.Dk.ModeSelect(TdRoomMode);
        if (Mode >= 0 && this.CanUse(Me, Mode)) {
          const Played = await this.RoomMatch(Me, Mode);
          if (Played) return;
        }
      } else if (C === 113) {
        if (!this.Online(Me)) continue;
        const Joined = await M.JoinScreen();
        if (Joined) {
          const DoneP = Me.Done.Await();
          const Ses = await this.Lobby.StartPvp(Me, Joined[0], Joined[1], false);
          if (Ses) { await this.PvpResult(Me, DoneP); return; }
          M.Inform(TgLost);
        }
      }
    }
  }

  Online(Me) {
    if (NetAvailable()) return true;
    Me.Menus.Inform(TlOffline);
    Me.UI.Snd(SfxCancel);
    return false;
  }

  // ------------------------------------------------------------ the tutorial (card_tutorial): fixed decks, the enemy has 5 HP
  async TutorialMatch(Me) {
    const M = Me.Menus, Lib = this.Lib;
    const Mine = M.HeroOf(0);
    const Rival = M.HeroOf(3);
    const S = GetCardSave(Me.P);
    const Match = new card_match({
      DB: Lib.DB,
      Me: new side({ Hero: Mine, Name: TxAgent(Me.P), Back: S.Back, Deck: TutMyDeck().map(Id => Lib.CardById(Id)), PicOverride: CardHeroPic(Me.P, Mine), NameOverride: CardHeroName(Me.P, Mine), RaceOverride: CardHeroRace(Me.P, Mine), Prem: S.Prem }),
      Foe: new side({ Hero: Rival, Name: TxComputer, Back: 0, Deck: TutFoeDeck().map(Id => Lib.CardById(Id)), Hp: TutFoeHp }),
      Views: [Me.UI, null],
      Tut: new card_tutorial(),
    });
    M.CloseAll();
    Me.InGame = true;
    const W = await Match.Run();
    Me.InGame = false;
    Print(`card tutorial over, winner ${W}`);
    const Won = W === 0;
    const G = Won ? CardTutorialDone(Me.P) : new card_gain();
    await M.TutorialResult(Won, G);
    M.CloseAll();
  }

  // ------------------------------------------------------------ CPU battles
  CpuMatch(Me, Lib, Mine, Rival, MyDeck, FoeDeck, Auto, AiLevel) {
    const FoeHp = AiLevel === CardAiNightmare ? CardBossHp : CardHeroHp;
    const S = GetCardSave(Me.P);
    return new card_match({
      DB: Lib.DB,
      Me: new side({ Hero: Mine, Name: TxAgent(Me.P), Back: S.Back, Deck: MyDeck, PicOverride: CardHeroPic(Me.P, Mine), NameOverride: CardHeroName(Me.P, Mine), RaceOverride: CardHeroRace(Me.P, Mine), Prem: S.Prem, Level: CardLevelOf(S.Xp).Level }),
      Foe: new side({ Hero: Rival, Name: TxComputer, Back: GetRandomInt(0, CardShopBacks), Deck: FoeDeck, AiLevel, Hp: FoeHp, MaxHp: FoeHp }),
      Views: [Me.UI, null],
      AutoPlay: Auto,
      TurnSeconds: Auto ? 0 : CardTurnMax,
      MullSeconds: Auto ? 0 : MullLimit,
    });
  }

  // returns 74 when the player chose "タイトルへ", 0 when they went back
  async CpuLoop(Me, Mode, Level) {
    const M = Me.Menus, Lib = this.Lib;
    try {
      while (true) {
        M.CloseAll();
        const Fav = M.FavHero();
        const Others = Lib.Heroes.filter(H => H.Id !== Fav.Id);
        const Rival = Others[GetRandomInt(0, Others.length - 1)] || Fav;
        Me.InGame = true;
        await M.VsIntro(VsOf(Me.P, Fav), VsCpu(Rival));
        let Mine = Fav, MyDeck = [], FoeDeck = [];
        if (Mode === ModeDeck) {
          let D = new card_deck();
          while (true) {
            const DI = await M.Dk.DeckSelect(false, 0);
            D = CardDeckOf(Me.P, DI >= 0 ? DI : Math.max(0, CardFirstOkDeck(Me.P, Lib.DB)));
            const Picked = await M.CharSelect(true, 0, D.Hero, false);
            if (Picked) { Mine = Picked; break; }
          }
          MyDeck = DeckCards(Lib, D, Mine.Id);
          FoeDeck = Level === CardAiNightmare ? CardBossDeck(Lib, Rival.Id) : DeckCards(Lib, RandomDeck(Lib, Rival.Id), Rival.Id);
        } else {
          const Picked = await M.CharSelect(false, 0, -1, true);
          Mine = Picked || Fav;
          const Sched = DraftMakeSchedule();
          MyDeck = await M.Draft(new draft_progress({ Picks: [0, DraftRounds] }), 0, DraftPool(Lib.DB, Mine.Id), Sched, false);
          FoeDeck = Level === CardAiNightmare ? CardBossDraftDeck(Lib, Rival.Id, Sched) : DraftAutoDeck(DraftPool(Lib.DB, Rival.Id), Sched);
        }
        const Match = this.CpuMatch(Me, Lib, Mine, Rival, MyDeck, FoeDeck, false, Level);
        M.CloseAll();
        const W = await Match.Run();
        Me.InGame = false;
        Print(`card match over, winner ${W}, mode ${Mode}`);
        const Won = W === 0, Lost = W === 1;
        const Early = !Match.FirstTurnDone;
        const G = CardGiveMatch(Me.P, false, Won, Lost, Match.Reason, Early, Match.Rounds(), Match.Me.Summons, Match.Me.Jewels, Level);
        CardMatchStats(Me.P, false, Mode, Mine.Id, Won, Lost, Early, CardMatchFacts(Match, 0));
        // a win against 最恐 (the 「最恐討伐者」 achievement)
        if (Won && Level === CardAiNightmare) {
          const E = CardEdit(Me.P);
          E.BossWins += 1;
          CardCommit(Me.P, E);
          if (E.BossWins === 1) Me.UI.Notice(TgBossFirst);
        }
        const Choice = await M.Result(Won, Lost, Match.Reason, Early, false, G);
        if (Choice === 74) return 74;
      }
    } finally {
      Me.InGame = false;
    }
  }

  // debug: AI vs AI forever
  async AutoLoop(Me) {
    const Lib = this.Lib;
    while (true) {
      const Mine = Lib.Heroes[GetRandomInt(0, Lib.Heroes.length - 1)];
      const Sched = DraftMakeSchedule();
      const Others = Lib.Heroes.filter(H => H.Id !== Mine.Id);
      const Rival = Others[GetRandomInt(0, Others.length - 1)];
      const Match = this.CpuMatch(Me, Lib, Mine, Rival, DraftAutoDeck(DraftPool(Lib.DB, Mine.Id), Sched), DraftAutoDeck(DraftPool(Lib.DB, Rival.Id), Sched), true, 0);
      Me.Menus.CloseAll();
      const W = await Match.Run();
      Print(`card match over, winner ${W}`);
      await Sleep(3);
    }
  }

  // ------------------------------------------------------------ PvP (another browser, anywhere)
  async RandomMatch(Me, Mode) {
    if (!this.Online(Me)) return false;
    const Lobby = this.Lobby, M = Me.Menus;
    const S = Lobby.RandomSearch(Mode);
    const R = await Race(
      M.WaitScreen(Mode === ModeDeck ? TgRandomDeck : TgRandom2Pick, TmSearching, TmRandomSub).then(() => 0, () => 0),
      S.Done.then(G => G || 0));
    AbortFlows();
    M.CloseAll();
    if (!R) { Lobby.Leave(Me); return false; }
    Me.Found.Signal();
    const DoneP = Me.Done.Await();
    const Ses = await Lobby.StartPvp(Me, R, Mode, true);
    if (!Ses) { M.Inform(TgLost); return false; }
    await this.PvpResult(Me, DoneP);
    return true;
  }

  async RoomMatch(Me, Mode) {
    if (!this.Online(Me)) return false;
    const Lobby = this.Lobby, M = Me.Menus;
    M.Inform(TgRoomOpening);
    const No = await Lobby.OpenRoom(Me, Mode);
    this.LastRoomNo = No;
    const S = Lobby.Search;
    if (No < 0 || !S) { M.Inform(TlOffline); return false; }
    const R = await Race(
      M.WaitScreen(TmRoomTitle, TmRoomNo(Quotient(No, 10), Mod(No, 10)), Mode === ModeDeck ? TgRoomSubDeck : TgRoomSub2Pick).then(() => 0, () => 0),
      S.Done.then(G => G || 0));
    AbortFlows();
    M.CloseAll();
    if (!R) { Lobby.Leave(Me); return false; }
    const DoneP = Me.Done.Await();
    const Ses = await Lobby.StartPvp(Me, R, Mode, false);
    if (!Ses) { M.Inform(TgLost); return false; }
    await this.PvpResult(Me, DoneP);
    return true;
  }

  // ------------------------------------------------------------ friends (browser only)
  // the friend accepted in the pop-up (friends.js): whatever menu is open is left, then PlayLoop joins the room
  JoinInvite(No, Mode) {
    this.PendingJoin = { No, Mode };
    FrCloseUI();
    AbortFlows();
    if (this.Me) spawn(() => this.Me.UI.CancelWait());
  }

  async InvitedMatch(Me, J) {
    const M = Me.Menus;
    J.Done = true;
    M.CloseAll();
    M.Inform(TgJoining);
    const Got = await this.Lobby.JoinRoom(Me, J.No);
    if (!Got) { M.Inform(TgLost); return; }
    const DoneP = Me.Done.Await();
    const Ses = await this.Lobby.StartPvp(Me, Got, J.Mode, false);
    if (!Ses) { M.Inform(TgLost); return; }
    await this.PvpResult(Me, DoneP);
  }

  // opens a room and sends its number to the friend; the match starts when they join
  async InviteMatch(Me, F, Mode) {
    if (!this.Online(Me)) return;
    const Lobby = this.Lobby, M = Me.Menus;
    M.Inform(TgRoomOpening);
    const No = await Lobby.OpenRoom(Me, Mode);
    const S = Lobby.Search;
    if (No < 0 || !S) { M.Inform(TlOffline); return; }
    const Answer = FrSendInvite(F.Id, No, Mode);
    let Why = null;
    const R = await Race(
      M.WaitScreen(FrTxInviting, FrTxWaitFriend(F.Name), Mode === ModeDeck ? TgRoomSubDeck : TgRoomSub2Pick).then(() => 0, () => 0),
      S.Done.then(G => G || 0),
      Answer.then(A => { if (A && A.ok) return new Promise(() => { }); Why = A ? A.why : 'offline'; return 0; }));
    AbortFlows();
    M.CloseAll();
    if (!R) {
      Lobby.Leave(Me);
      if (Why) { M.Inform(FrTxRefused(Why)); Me.UI.Snd(SfxCancel); }
      return;
    }
    const DoneP = Me.Done.Await();
    const Ses = await Lobby.StartPvp(Me, R, Mode, false);
    if (!Ses) { M.Inform(TgLost); return; }
    await this.PvpResult(Me, DoneP);
  }

  async PvpResult(Me, DoneP) {
    Me.InGame = true;
    const Res = await DoneP;
    Me.InGame = false;
    AbortFlows();
    Print(`card pvp result won=${Res.Won} lost=${Res.Lost} reason=${Res.Reason}`);
    const G = CardGiveMatch(Me.P, true, Res.Won, Res.Lost, Res.Reason, Res.Early, Res.Rounds, Res.Summons, Res.Jewels);
    CardMatchStats(Me.P, Res.IsRandom, Res.Mode, Res.Hero, Res.Won, Res.Lost, Res.Early, Res.Facts);
    Me.Menus.CloseAll();
    await Me.Menus.Result(Res.Won, Res.Lost, Res.Reason, Res.Early, true, G);
  }
}

const TgBossFirst = '最恐CPUを討伐！ 実績「最恐討伐者」を受け取れるよ';
const TgRandomDeck = '野良対戦-通常';
const TgRandom2Pick = '野良対戦-2Pick';
const TgRoomSubDeck = '【通常】相手が「部屋に参加」でこの番号を入れると始まるよ';
const TgRoomSub2Pick = '【2Pick】相手が「部屋に参加」でこの番号を入れると始まるよ';
const TgLost = '相手との接続が切れました';
const TgRoomOpening = '部屋を作っています…';
const TgJoining = 'フレンドの部屋に接続しています…';
