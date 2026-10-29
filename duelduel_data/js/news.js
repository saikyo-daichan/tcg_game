// news.js — (web only) アップデート情報: what changed in the last update, shown once over the title after an update
// (NewsMaybeShow) and any time from the settings (OpenNews). HTML over the game like the friend screen (friends.js
// styles .frbox / .frpanel ...). The changed cards are listed with their current numbers and text from the card list.
'use strict';

// bump with every update that has notes (the player sees the pop-up once per version)
const NewsVer = '1029b';
const NewsDate = '10/29';

// the notes of the update (plain text, one line each)
const NewsNotes = [
  '新しいミニゲーム「ボムドク」が登場！タイトル画面の右下の 💣 ボタンからあそべるよ',
  'ボムドク：色分けされた盤面にかくれた爆弾を、ルールをヒントに見つけ出すパズル。各行・各列・各色に爆弾は1つ、爆弾どうしはとなり合わない',
  'ボムドク：ステージをクリアするとデュエルデュエルのコインがもらえるよ（ミス1回ごとに報酬が25%ダウン、ノーミスで★3）',
  'ボムドク：10ステージごとに「鬼ステージ」！1回でもまちがえたら失敗だけど、はじめてクリアするとランダムなカードがもらえる',
  'ボムドク：毎日かわる「今日の1問」。その日はじめてクリアするとガチャチケット1枚！',
  'ボムドク：こまったときの「💡ヒント」（1ステージ1回）、進んだステージは保存されていつでも続きからあそべるよ',
  'デイリークエストに「ボムドクを1/5/10/30ステージクリアする」を追加',
  '実績に「ボムドクでステージ10/50/100/300/500/1000をクリアする」「ノーミスクリア50回」を追加（新しい称号・バッチ4種）',
];

// the cards whose numbers / effects changed (cards_web.js "(10/28)"; none this time)
const NewsCards = [];

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
        ${Cards.length ? `<div class="nwsub">カードの調整（${Cards.length}枚）</div>` : ''}
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
