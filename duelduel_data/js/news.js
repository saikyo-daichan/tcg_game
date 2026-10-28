// news.js — (web only) アップデート情報: what changed in the last update, shown once over the title after an update
// (NewsMaybeShow) and any time from the settings (OpenNews). HTML over the game like the friend screen (friends.js
// styles .frbox / .frpanel ...). The changed cards are listed with their current numbers and text from the card list.
'use strict';

// bump with every update that has notes (the player sees the pop-up once per version)
const NewsVer = '1028';
const NewsDate = '10/28';

// the notes of the update (plain text, one line each)
const NewsNotes = [
  '実績を追加！難易度ごとのタブで見やすくなったよ',
  'ローストチキンなど「自分のプレイヤーのHPを回復」は、HPが満タンでも使える（+0回復でも「回復するたび」の効果が発動）',
  '「威圧オーラ」などで付与できない・もう持っているキーワードは、対象として選べなくなったよ',
  '吸血は自分から攻撃したときだけ回復するようになったよ（攻撃されたときは回復しない）',
  'OKだけのお知らせ画面は、画面のどこをタッチしても閉じられるよ',
  'コレクションで長い効果のカードもプレミア化ボタンに重ならないようにしたよ',
  '対戦画面の「進化」ボタンを「ターン終了」から離したよ',
];

// the cards whose numbers / effects changed (cards_web.js "(10/28)")
const NewsCards = [121, 228, 325, 135, 214, 213, 207, 305, 211, 3, 338, 244, 298, 133, 272, 206, 322, 334, 239, 59, 281, 195, 260, 467, 199,
  302, 117, 65, 418, 75, 284, 68, 151, 22, 282, 347, 308, 313, 178, 358, 185, 130, 152, 96, 373];

function NewsSeen() { try { return localStorage.getItem('dd_news') === NewsVer; } catch (e) { return true; } }
function NewsMarkSeen() { try { localStorage.setItem('dd_news', NewsVer); } catch (e) { } }

// shows the notes when this version was not seen yet (resolves when closed)
async function NewsMaybeShow() {
  if (NewsSeen()) return;
  NewsMarkSeen();
  await OpenNews();
}

let NewsLib = null;

// resolves when the pop-up is closed (✕, or a tap anywhere outside the list)
function OpenNews() {
  if (!NewsLib) NewsLib = MakeCardLib('');
  const L = NewsLib;
  return new Promise(res => {
    const box = FrEl('div', 'frbox nwbox');
    const Stat = D => D.IsSpell ? `マナ${D.Cost}` : D.Wild ? 'マナ? ?/?' : `マナ${D.Cost}　${D.Atk}/${D.Hp}`;
    const Text = D => FrEsc(L.TextOf(D) || '（効果なし）').replace(/\n/g, '<br>');
    const Cards = NewsCards.map(Id => L.DB[Id]).filter(D => D);
    box.innerHTML = `<div class="frpanel nwpanel">
      <div class="frhead"><div class="frtitle">アップデート情報（${NewsDate}）</div><button class="frx" title="とじる">✕</button></div>
      <div class="frlist nwlist">
        <div class="nwsub">ゲームの変更</div>
        ${NewsNotes.map(T => `<div class="nwnote">・${FrEsc(T)}</div>`).join('')}
        <div class="nwsub">カードの調整（${Cards.length}枚）</div>
        ${Cards.map(D => `<div class="frrow nwcard"><div class="nwname">${FrEsc(D.Name)}<small>${Stat(D)}</small></div><div class="nwtext">${Text(D)}</div></div>`).join('')}
      </div>
      <div class="frfoot nwfoot">画面のどこかをタッチすると閉じます</div>
    </div>`;
    document.getElementById('app').appendChild(box);
    let done = false;
    const close = () => {
      if (done) return; done = true;
      box.remove();
      window.removeEventListener('keydown', key, true);
      if (TheGame && TheGame.Sfx) TheGame.Sfx.Play(null, SfxCancel);
      res();
    };
    const key = e => { if (e.key === 'Escape' || e.key === 'Enter') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', key, true);
    box.querySelector('.frx').onclick = close;
    // a tap anywhere closes it, except inside the list (it scrolls)
    box.addEventListener('click', e => { if (!e.target.closest('.nwlist')) close(); });
  });
}
