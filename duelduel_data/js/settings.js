// settings.js (browser only, no Verse original) — the 設定 screen, opened from the ⚙ button at the bottom right of
// the title (click id 1750, manager.js PlayLoop -> OptScreen(Menus)).
// - BGM and 効果音: OFF (= mute) + 5 bars each (tap a bar = that level); applied at once, kept per device in
//   localStorage (sfx.js SndSetLevel: 'dd_vol_bgm' / 'dd_vol_se'). Changing the effects plays a sample effect.
// - 「曲をかえる」: another song of the same kind (bgm.js BgmSkip); the song playing now is shown.
// ids: BGM OFF 1760, BGM bars 1761..1765, 効果音 OFF 1770, bars 1771..1775, 曲をかえる 1780, とじる 1789
// The gear picture T_BtnGear (img/CardGui/T_BtnGear.webp, made for this update) is added to the texture list here.
'use strict';

if (typeof IMG_MANIFEST !== 'undefined' && IMG_MANIFEST.CardGui && !IMG_MANIFEST.CardGui.T_BtnGear) IMG_MANIFEST.CardGui.T_BtnGear = [128, 128];

const OptGearId = 1750;
const OptRows = [['bgm', 1760], ['se', 1770]];
const OptSkipId = 1780;
const OptCloseId = 1789;
const OptNewsId = 1781;
const TvNews = 'アップデート情報';

const TvGear = '設定';
const TvTitle = '設定';
const TvBgm = 'BGM';
const TvSe = '効果音';
const TvOff = 'OFF';
const TvMute = 'ミュート';
function TvLevel(L) { return `${L} / 5`; }
function TvNow(N) { return `♪ ${N}`; }
const TvNowOff = '♪ BGMはOFFです';
const TvSkip = '曲をかえる';
const TvHelp = 'バーをタップすると音量が変わります（OFFで消音）。\nこの端末に保存されます。';

// the bar colours
const OptOn = color(1.0, 0.72, 0.12);
const OptOnMute = color(0.9, 0.2, 0.15);
const OptBg = color(0.08, 0.05, 0.03);

function MakeOptUI(B) {
  const S = [MakeOverlayDim(0.7), RBox(Tex(CardGui.T_PanelLog, 1040.0, 800.0), 440.0, 140.0, 1040.0, 800.0, 1)];
  S.push(RPin(OText(TvTitle, 46.0, CGold, CInk).Root, 960.0, 214.0, 2));
  const Rows = [];
  OptRows.forEach(([Kind, Id0], R) => {
    const Y = 300.0 + R * 190.0;
    S.push(RPin(OText(Kind === 'bgm' ? TvBgm : TvSe, 36.0, CWhite, CInk).Root, 590.0, Y + 50.0, 3));
    const Off = MBtn(B, Id0, BtnEnd, TvOff, 660.0, Y + 12.0, 150.0, 76.0, 28.0);
    S.push(Off[0]);
    const Fills = [];
    for (let I = 1; I <= 5; I++) {
      const X = 842.0 + (I - 1) * 92.0;
      const H = 34.0 + I * 12.0;
      const Top = Y + 94.0 - H;
      const Fill = new color_block({ DefaultColor: OptOn, DefaultOpacity: 1.0 });
      Fills.push(Fill);
      S.push(RBox(new color_block({ DefaultColor: OptBg, DefaultOpacity: 0.75 }), X, Top, 72.0, H, 3));
      S.push(RBox(Fill, X + 5.0, Top + 5.0, 62.0, H - 10.0, 4));
      S.push(RBox(MenuHit(B, Id0 + I), X - 10.0, Y, 92.0, 104.0, 6));
      B.AddBounds(Id0 + I, { X, Y: Top, W: 72.0, H });
    }
    const Lv = OText(TxEmpty, 32.0, CWhite, CInk);
    S.push(RPin(Lv.Root, 1376.0, Y + 52.0, 3));
    Rows.push({ Kind, Fills, Lv });
  });
  const Now = OText(TxEmpty, 26.0, CCream, CInk);
  S.push(RPin(Now.Root, 820.0, 724.0, 3));
  const Skip = MBtn(B, OptSkipId, BtnPurple, TvSkip, 1080.0, 688.0, 260.0, 72.0, 24.0);
  S.push(Skip[0]);
  S.push(RPin(TxtDark(TvHelp, 18.0), 960.0, 800.0, 3));
  const Close = MBtn(B, OptCloseId, BtnBlue, TbClose, 810.0, 836.0, 300.0, 80.0, 30.0);
  S.push(Close[0]);
  // (news.js) the notes of the last update
  const News = MBtn(B, OptNewsId, BtnPurple, TvNews, 1150.0, 842.0, 280.0, 68.0, 22.0);
  S.push(News[0]);
  return { Slot: RFull(new canvas({ Slots: S }), 98), Rows, Now };
}

function OptRefresh(U) {
  for (const R of U.Rows) {
    const L = SndLevel(R.Kind);
    R.Fills.forEach((F, I) => { Show(F, I < L); F.SetColor(OptOn); });
    R.Lv.Set(L <= 0 ? TvMute : TvLevel(L));
    R.Lv.SetColor(L <= 0 ? OptOnMute : CWhite);
  }
  U.Now.Set(SndLevel('bgm') > 0 && BgmNowName() ? TvNow(BgmNowName()) : TvNowOff);
}

// the 設定 screen over the title (M = card_menus)
async function OptScreen(M) {
  const B = M.B;
  if (!M.OptUI) M.OptUI = MakeOptUI(B);
  const U = M.OptUI;
  OptRefresh(U);
  B.Snd(SfxOpen);
  B.Layer(U.Slot, true);
  const Ids = [];
  for (const [, Id0] of OptRows) for (let I = 0; I <= 5; I++) Ids.push(Id0 + I);
  Ids.push(OptSkipId, OptCloseId, OptNewsId);
  try {
    B.CurId = OptRows[0][1] + Math.max(0, SndLevel('bgm'));
    while (true) {
      const Id = await B.Pick(Ids, B.CurId, OptCloseId);
      if (Id === OptCloseId) { B.Snd(SfxCancel); return; }
      if (Id === OptNewsId) {
        B.Snd(SfxOpen);
        await OpenNews();
        continue;
      }
      if (Id === OptSkipId) {
        if (SndLevel('bgm') > 0) { BgmSkip(); B.Snd(SfxSelect); } else B.Snd(SfxCancel);
      } else {
        for (const [Kind, Id0] of OptRows) {
          if (Id < Id0 || Id > Id0 + 5) continue;
          SndSetLevel(Kind, Id - Id0);
          // a sample of the new volume (the music changes by itself)
          B.Snd(Kind === 'se' ? SfxCoin : SfxSelect);
        }
      }
      OptRefresh(U);
    }
  } finally {
    B.Layer(U.Slot, false);
  }
}
