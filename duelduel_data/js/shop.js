// shop.js — card_shop.verse: the shop's paid items (gem packs bought with V-Bucks).
// Changed for the browser: there are no V-Bucks here. The entitlement / offer classes (card_gems_100 ... and their
// offers, CardGemOffer) are not ported. CardBuyGemPack buys nothing (false) and CardRedeemGems adds nothing (0);
// the menus call ComingSoon(B) where Verse opened Epic's purchase screen.
// ComingSoon(B) (new, not a Verse name): a small pop-up on the board_ui Root 「Coming soon」 / 「V-Bucksでの購入は準備中です」
// with an OK button (click id 1196, waited for with B.Pick like the other pop-ups; Esc = OK).
'use strict';

const TsGem100 = "ジェム 100個";
const TsGem550 = "ジェム 550個（+10%）";
const TsGem1250 = "ジェム 1250個（+25%）";
const TsGemDesc = "デュエルデュエルのショップでカードパックやカードの裏面と交換できるジェム。";

// one gem pack of the shop
// (browser: priced in yen; Bonus = the gems on top of the 500円 rate)
class card_gem_pack {
  constructor(o = {}) { this.Gems = o.Gems; this.VBucks = o.VBucks; this.Bonus = o.Bonus ?? 0; }
}

const CardGemPacks = [
  new card_gem_pack({ Gems: 2000, VBucks: 500 }),
  new card_gem_pack({ Gems: 4500, VBucks: 1000, Bonus: 500 }),
  new card_gem_pack({ Gems: 10000, VBucks: 2000, Bonus: 2000 }),
];

// (Verse: shows Epic's purchase screen; true when gems were added) — no purchases in the browser
async function CardBuyGemPack(P, Pack) {
  return false;
}

// (Verse: turns every bought-but-not-yet-used gem pack into gems; returns the gems added) — nothing is ever bought here
async function CardRedeemGems(P) {
  return 0;
}

// ---------------------------------------------------------------- 「Coming soon」 (instead of the V-Bucks purchase screen)
const TsComingSoon = "Coming soon";
const TsComingSoonSub = "お金での購入は準備中です";
const ShopComingSoonId = 1196;
const ShopComingSoonSlots = new WeakMap();   // board_ui -> its pop-up slot (made once per board)

function MakeComingSoonSlot(B) {
  const Ok = MBtn(B, ShopComingSoonId, BtnGold, TbOk, 810.0, 640.0, 300.0, 86.0, 34.0);
  const Cv = new canvas({
    Slots: [
      MakeOverlayDim(0.75),
      RBox(Tex(CardGui.T_PanelLog, 900.0, 520.0), 510.0, 280.0, 900.0, 520.0, 1),
      RBox(Tex(CardGui.T_Banner, 760.0, 130.0), 580.0, 320.0, 760.0, 130.0, 2),
      RPin(OText(TsComingSoon, 64.0, CGold, CRed).Root, 960.0, 385.0, 3),
      RPin(OText(TsComingSoonSub, 30.0, CWhite, CInk).Root, 960.0, 540.0, 3),
      Ok[0],
    ],
  });
  return RFull(Cv, 127);
}

// shows the pop-up and waits until OK (or Esc / back) is chosen
async function ComingSoon(B) {
  let S = ShopComingSoonSlots.get(B);
  if (!S) {
    S = MakeComingSoonSlot(B);
    ShopComingSoonSlots.set(B, S);
  }
  const OldId = B.CurId;
  B.Snd(SfxOpen);
  B.Layer(S, true);
  try {
    B.CurId = ShopComingSoonId;
    await B.Pick([ShopComingSoonId], ShopComingSoonId, ShopComingSoonId);
    B.Snd(SfxClick);
  } finally {
    B.Layer(S, false);
    B.CurId = OldId;
  }
}
