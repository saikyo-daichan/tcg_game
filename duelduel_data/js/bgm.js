// bgm.js (browser only, no Verse original) — the background music.
// Every song is original and made here at run time: a tiny sequencer + synthesizer (pure JS sample math, no files,
// no download) renders a song into an AudioBuffer once (in slices, so the page never stalls), then it plays as a
// seamless loop on the shared Web Audio context of sfx.js (works over http(s) and from a file:// page, offline).
// - outside battles (title and every menu): 4 cheerful songs; a different one each time the page is opened and each
//   time a battle ends (the last one is kept in localStorage 'dd_bgm_menu' so a reload changes the song too).
// - battles: 3 driving songs, one per match (never the same as the last match); card_match.prototype.Run is wrapped
//   below, so every match shown on this screen (CPU, PvP, tutorial, tower...) gets battle music.
// - the result screen: the battle song fades out, the win / lose jingle plays, then the next menu song fades in
//   quietly (ducked while card_menus Result / TutorialResult is open).
// - volume: 6 levels (0 = off) kept by sfx.js (SndLevel('bgm')); level 0 stops the music (no CPU at all).
// - the tab hidden: the audio context is suspended (music and sound effects pause), resumed when it is shown.
// Song data: chords per bar (C, Am, G7, Dm7, F#m/A, Bb...), melodies as "note+octave:length in 16ths" tokens
// ("r" = rest), a form of sections with an intensity 1..3 (which layers play) and "*" = the second lead sound.
'use strict';

const BgmSR = 32000;      // render rate (the context resamples)
const BgmTailS = 3.0;     // seconds rendered past the loop end and mixed back into its start (seamless loop)

// ------------------------------------------------------------------ tables
const BgmSinN = 4096;
const BgmSinT = new Float32Array(BgmSinN + 1);
for (let i = 0; i <= BgmSinN; i++) BgmSinT[i] = Math.sin(2 * Math.PI * i / BgmSinN);
// sine of a phase in cycles
function BgmSn(Ph) {
  Ph -= Math.floor(Ph);
  const X = Ph * BgmSinN, I = X | 0;
  return BgmSinT[I] + (BgmSinT[I + 1] - BgmSinT[I]) * (X - I);
}

// one-cycle wave tables, band limited to what fits under the Nyquist frequency for that pitch
const BgmWaveN = 2048;
const BgmWaves = new Map();
const BgmRecipes = {
  tri: n => (n % 2 ? ((((n - 1) / 2) % 2) ? -1 : 1) / (n * n) : 0),
  sq: n => (n % 2 ? 1 / n : 0),
  saw: n => 1 / n,
  flute: n => [0, 1, 0.32, 0.12, 0.05, 0.02][n] || 0,
  oca: n => [0, 1, 0.06, 0.14, 0.02, 0.03][n] || 0,
  reed: n => (n % 2 ? 1 / Math.pow(n, 1.25) : 0.06 / n),
  bassw: n => [0, 1, 0.55, 0.3, 0.16, 0.09, 0.05, 0.03][n] || 0,
};
function BgmWave(Kind, F) {
  const Nh = Math.max(1, Math.min(48, Math.floor(BgmSR * 0.42 / F)));
  const Key = Kind + Nh;
  let T = BgmWaves.get(Key);
  if (!T) {
    T = new Float32Array(BgmWaveN + 1);
    const R = BgmRecipes[Kind];
    for (let h = 1; h <= Nh; h++) {
      const A = R(h);
      if (!A) continue;
      for (let i = 0; i < BgmWaveN; i++) T[i] += A * BgmSinT[(h * i * 2) & (BgmSinN - 1)];
    }
    let M = 1e-9;
    for (let i = 0; i < BgmWaveN; i++) M = Math.max(M, Math.abs(T[i]));
    for (let i = 0; i < BgmWaveN; i++) T[i] /= M;
    T[BgmWaveN] = T[0];
    BgmWaves.set(Key, T);
  }
  return T;
}

// seeded random numbers (the same song always renders the same)
function BgmRng(Seed) {
  let A = Seed >>> 0;
  return () => { A = (A + 0x6D2B79F5) >>> 0; let T = A; T = Math.imul(T ^ (T >>> 15), T | 1); T ^= T + Math.imul(T ^ (T >>> 7), T | 61); return ((T ^ (T >>> 14)) >>> 0) / 4294967296; };
}
const BgmNoise = (() => { const R = BgmRng(12345), N = new Float32Array(1 << 16); for (let i = 0; i < N.length; i++) N[i] = R() * 2 - 1; return N; })();

// RBJ biquad coefficients [b0, b1, b2, a1, a2]
function BgmBiq(Type, F, Q) {
  const W = 2 * Math.PI * Math.min(F, BgmSR * 0.45) / BgmSR, C = Math.cos(W), S = Math.sin(W), Al = S / (2 * Q);
  let B0, B1, B2;
  if (Type === 'hp') { B0 = (1 + C) / 2; B1 = -(1 + C); B2 = (1 + C) / 2; }
  else if (Type === 'bp') { B0 = Al; B1 = 0; B2 = -Al; }
  else { B0 = (1 - C) / 2; B1 = 1 - C; B2 = (1 - C) / 2; }
  const A0 = 1 + Al;
  return [B0 / A0, B1 / A0, B2 / A0, (-2 * C) / A0, (1 - Al) / A0];
}
function BgmFilt(Buf, N, K) {
  let X1 = 0, X2 = 0, Y1 = 0, Y2 = 0;
  for (let i = 0; i < N; i++) {
    const X = Buf[i], Y = K[0] * X + K[1] * X1 + K[2] * X2 - K[3] * Y1 - K[4] * Y2;
    X2 = X1; X1 = X; Y2 = Y1; Y1 = Y; Buf[i] = Y;
  }
}

// ------------------------------------------------------------------ instruments
// t: gen (wave table oscillator(s) + envelope + 2-pole low pass + vibrato), fm (bell / music box), mar (marimba),
// ks (plucked string). a/d/s/r = attack, decay time, sustain level, release; lp = [cutoff start, end (x the note
// frequency), time]; vib = [rate, cents, delay]; det = cents of a second detuned oscillator; br = breath noise;
// leg = how much of the written length is held.
const BgmIns = {
  flute: { t: 'gen', w: 'flute', a: 0.05, d: 0.8, s: 0.8, r: 0.12, vib: [5.0, 14, 0.18], br: 0.04, leg: 0.95 },
  oca: { t: 'gen', w: 'oca', a: 0.035, d: 0.6, s: 0.8, r: 0.1, vib: [5.6, 16, 0.2], br: 0.025, leg: 0.92 },
  reed: { t: 'gen', w: 'reed', a: 0.015, d: 0.3, s: 0.6, r: 0.06, lp: [7, 3.5, 0.15], vib: [5, 8, 0.25], leg: 0.72 },
  violin: { t: 'gen', w: 'saw', det: 6, a: 0.07, d: 1.0, s: 0.85, r: 0.15, lp: [4, 4, 1], vib: [5.5, 20, 0.15], leg: 0.98 },
  brass: { t: 'gen', w: 'saw', det: 5, a: 0.025, d: 0.45, s: 0.75, r: 0.1, lp: [1.3, 4.5, 0.07], vib: [5, 9, 0.3], leg: 0.9 },
  sqlead: { t: 'gen', w: 'sq', a: 0.01, d: 0.25, s: 0.65, r: 0.08, lp: [9, 4, 0.12], vib: [5.5, 16, 0.2], leg: 0.88 },
  bell: { t: 'fm', ratio: 3, i0: 1.1, i1: 0.18, ti: 0.15, d: 0.8, r: 0.25, leg: 1 },
  mar: { t: 'mar', d: 0.5, leg: 1 },
  harp: { t: 'ks', t60: 2.0, br: 0.55, r: 0.3, leg: 1 },
  pizz: { t: 'ks', t60: 0.35, br: 0.4, r: 0.08, leg: 1 },
  pad: { t: 'gen', w: 'tri', det: 8, a: 0.35, d: 2.5, s: 0.85, r: 0.5, leg: 1 },
  strings: { t: 'gen', w: 'saw', det: 10, a: 0.22, d: 2, s: 0.85, r: 0.35, lp: [3, 3, 1], leg: 1 },
  softbass: { t: 'gen', w: 'bassw', a: 0.006, d: 0.4, s: 0.45, r: 0.07, leg: 0.85 },
  tuba: { t: 'gen', w: 'reed', a: 0.02, d: 0.25, s: 0.55, r: 0.06, lp: [3, 2, 0.2], leg: 0.8 },
  synbass: { t: 'gen', w: 'saw', a: 0.003, d: 0.18, s: 0.45, r: 0.04, lp: [9, 2.2, 0.06], leg: 0.8 },
  pluck: { t: 'gen', w: 'saw', det: 7, a: 0.002, d: 0.1, s: 0, r: 0.05, lp: [14, 2, 0.05], leg: 1 },
};

// each voice renders (mono) into a scratch buffer and returns the samples used
function BgmVGen(S, F, Dur, P, Rnd) {
  const Sr = BgmSR;
  let N = Math.min(S.length, Math.ceil((Dur + P.r * 7) * Sr));
  const T = BgmWave(P.w, F * 1.01);
  // (a detuned pair sits half above, half below the note)
  const Inc = F / Sr * BgmWaveN * (P.det ? Math.pow(2, -P.det / 2400) : 1);
  const Inc2 = P.det ? F / Sr * BgmWaveN * Math.pow(2, P.det / 2400) : 0;
  let P1 = Rnd() * BgmWaveN, P2 = Rnd() * BgmWaveN;
  const AN = Math.max(1, Math.floor(P.a * Sr)), OffN = Math.max(1, Math.floor(Dur * Sr));
  const Kd = Math.exp(-1 / (P.d * Sr)), Kr = Math.exp(-1 / (P.r * Sr)), Su = P.s;
  const Vib = P.vib, VR = Vib ? Vib[0] / Sr * 32 : 0, VD = Vib ? Math.pow(2, Vib[1] / 1200) - 1 : 0, VDel = Vib ? Vib[2] * Sr : 0;
  let VP = 0, Mod = 1;
  const Lp = P.lp;
  let Y1 = 0, Y2 = 0, C = 1;
  const Br = P.br || 0;
  let NI = (Rnd() * 60000) | 0;
  let E = 0, Dec = 1;
  for (let i = 0; i < N; i++) {
    if ((i & 31) === 0) {
      if (Lp) {
        let Fc = F * (Lp[1] + (Lp[0] - Lp[1]) * Math.exp(-i / Sr / Lp[2]));
        if (Fc > Sr * 0.45) Fc = Sr * 0.45;
        C = 1 - Math.exp(-2 * Math.PI * Fc / Sr);
      }
      if (VD) {
        const Ramp = i < VDel ? 0 : Math.min(1, (i - VDel) / (0.3 * Sr));
        Mod = 1 + VD * Ramp * BgmSn(VP);
        VP += VR;
      }
    }
    if (i < OffN) {
      if (i < AN) E = i / AN;
      else { Dec = Su + (Dec - Su) * Kd; E = Dec; if (Su === 0 && E < 1e-4) { N = i; break; } }
    } else {
      E *= Kr;
      if (E < 1e-4) { N = i; break; }
    }
    let Ix = P1 | 0;
    let V = T[Ix] + (T[Ix + 1] - T[Ix]) * (P1 - Ix);
    P1 += Inc * Mod; if (P1 >= BgmWaveN) P1 -= BgmWaveN;
    if (Inc2) {
      Ix = P2 | 0;
      V = (V + T[Ix] + (T[Ix + 1] - T[Ix]) * (P2 - Ix)) * 0.5;
      P2 += Inc2 * Mod; if (P2 >= BgmWaveN) P2 -= BgmWaveN;
    }
    if (Br) { V += Br * BgmNoise[NI]; NI = (NI + 1) & 65535; }
    if (Lp) { Y1 += C * (V - Y1); Y2 += C * (Y1 - Y2); V = Y2; }
    S[i] = V * E;
  }
  return N;
}

// two-operator FM: a music box / celesta
function BgmVFm(S, F, Dur, P) {
  const Sr = BgmSR;
  const N = Math.min(S.length, Math.ceil((Dur + P.r * 7) * Sr), Math.ceil(P.d * 7 * Sr));
  const IC = F / Sr, IM = F * P.ratio / Sr;
  const AN = Math.floor(0.002 * Sr), OffN = Math.floor(Dur * Sr);
  const Kd = Math.exp(-1 / (P.d * Sr)), Kr = Math.exp(-1 / (P.r * Sr));
  let PC = 0, PM = 0, Amp = 1, Idx = P.i0;
  for (let i = 0; i < N; i++) {
    if ((i & 31) === 0) Idx = (P.i1 + (P.i0 - P.i1) * Math.exp(-i / Sr / P.ti)) / (2 * Math.PI);
    Amp *= Kd;
    if (i >= OffN) Amp *= Kr;
    const E = i < AN ? Amp * i / AN : Amp;
    S[i] = BgmSn(PC + Idx * BgmSn(PM)) * E;
    PC += IC; PM += IM;
    if (PC > 1) PC -= 1;
    if (PM > 1) PM -= 1;
  }
  return N;
}

// marimba / kalimba: three sine partials (1, 4, 9.9) with shorter decays up high, and a soft mallet click
function BgmVMar(S, F, Dur, P, Rnd) {
  const Sr = BgmSR;
  const Tau = P.d * Math.min(1.4, Math.sqrt(330 / F));
  const N = Math.min(S.length, Math.ceil(Tau * 7 * Sr));
  const Pt = [[1, 1, Tau], [4, 0.22, Tau * 0.22], [9.9, 0.05, Tau * 0.07]].filter(X => X[0] * F < Sr * 0.45);
  for (let i = 0; i < N; i++) S[i] = 0;
  for (const [R, A, T] of Pt) {
    const Inc = F * R / Sr, K = Math.exp(-1 / (T * Sr));
    let Ph = 0, E = A;
    for (let i = 0; i < N; i++) { S[i] += BgmSn(Ph) * E; Ph += Inc; if (Ph > 1) Ph -= 1; E *= K; if (E < 1e-5) break; }
  }
  const CN = Math.floor(0.004 * Sr);
  let NI = (Rnd() * 60000) | 0;
  for (let i = 0; i < CN && i < N; i++) S[i] += 0.12 * BgmNoise[(NI++) & 65535] * (1 - i / CN);
  const AN = Math.floor(0.0015 * Sr);
  for (let i = 0; i < AN && i < N; i++) S[i] *= i / AN;
  return N;
}

// Karplus-Strong plucked string (harp, pizzicato) with an all-pass for exact tuning
function BgmVKs(S, F, Dur, P, Rnd) {
  const Sr = BgmSR;
  const N = Math.min(S.length, Math.ceil(Math.min(Dur + P.r * 6, P.t60 * 1.2 + 0.05) * Sr));
  const D = Sr / F - 0.5;
  let L = Math.floor(D), Fr = D - L;
  if (Fr < 0.1) { L -= 1; Fr += 1; }
  const Ca = (1 - Fr) / (1 + Fr);
  const Dl = new Float32Array(L);
  // a soft noise burst (brightness = low-pass amount)
  let Lp = 0, NI = (Rnd() * 60000) | 0, Mean = 0;
  for (let i = 0; i < L; i++) { Lp += P.br * (BgmNoise[(NI++) & 65535] - Lp); Dl[i] = Lp; Mean += Lp; }
  Mean /= L;
  for (let i = 0; i < L; i++) Dl[i] -= Mean;
  const G = Math.pow(0.001, 1 / (P.t60 * F));
  const OffN = Math.floor(Dur * Sr), Kr = Math.exp(-1 / (P.r * Sr));
  let Pt = 0, Last = 0, AX = 0, AY = 0, Rel = 1;
  for (let i = 0; i < N; i++) {
    const X = Dl[Pt];
    const Av = 0.5 * (X + Last); Last = X;
    const Ap = Ca * Av + AX - Ca * AY; AX = Av; AY = Ap;
    Dl[Pt] = Ap * G;
    Pt++; if (Pt >= L) Pt = 0;
    if (i >= OffN) Rel *= Kr;
    S[i] = X * Rel * 1.6;
  }
  return N;
}

// ------------------------------------------------------------------ drums
// [gain, pan, reverb send]
const BgmKit = {
  k: [0.5, 0, 0.03], s: [0.34, 0.05, 0.22], c: [0.3, -0.05, 0.25], h: [0.11, 0.35, 0.08], oh: [0.09, 0.35, 0.12],
  sh: [0.1, -0.4, 0.1], tb: [0.08, 0.45, 0.15], t1: [0.36, -0.3, 0.2], t2: [0.4, 0.3, 0.2], cr: [0.12, -0.25, 0.3],
  tri: [0.07, 0.4, 0.4], wd: [0.16, -0.3, 0.18],
};
function BgmDrum(S, K, Rnd) {
  const Sr = BgmSR;
  let NI = (Rnd() * 60000) | 0;
  const Nz = () => BgmNoise[(NI++) & 65535];
  let N = 0;
  if (K === 'k') {
    N = Math.floor(0.45 * Sr);
    let Ph = 0;
    for (let i = 0; i < N; i++) {
      const T = i / Sr;
      Ph += (46 + 120 * Math.exp(-T / 0.028)) / Sr;
      S[i] = BgmSn(Ph) * Math.exp(-T / 0.22) * Math.min(1, i / 16) + 0.25 * Nz() * Math.exp(-T / 0.002);
    }
  } else if (K === 's' || K === 'c') {
    N = Math.floor(0.4 * Sr);
    for (let i = 0; i < N; i++) S[i] = Nz();
    BgmFilt(S, N, K === 's' ? BgmBiq('hp', 1400, 0.7) : BgmBiq('bp', 1150, 1.1));
    let Ph = 0;
    for (let i = 0; i < N; i++) {
      const T = i / Sr;
      if (K === 's') {
        Ph += 190 / Sr;
        S[i] = S[i] * Math.exp(-T / 0.11) + 0.55 * BgmSn(Ph) * Math.exp(-T / 0.05);
      } else {
        // three quick claps, then the tail
        const Bu = T < 0.03 ? Math.exp(-((T * 1000) % 10) / 2.5) : 0;
        S[i] *= 1.6 * Math.max(Bu, T >= 0.02 ? Math.exp(-(T - 0.02) / 0.1) : 0);
      }
    }
  } else if (K === 'h' || K === 'oh' || K === 'cr') {
    const D = K === 'h' ? 0.035 : K === 'oh' ? 0.22 : 1.1;
    N = Math.floor(Math.min(D * 6, 3.5) * Sr);
    for (let i = 0; i < N; i++) S[i] = Nz();
    BgmFilt(S, N, BgmBiq('hp', K === 'cr' ? 4500 : 7000, 0.7));
    for (let i = 0; i < N; i++) S[i] *= Math.exp(-i / Sr / D) * Math.min(1, i / 8);
  } else if (K === 'sh' || K === 'tb') {
    N = Math.floor(0.25 * Sr);
    for (let i = 0; i < N; i++) S[i] = Nz();
    BgmFilt(S, N, K === 'sh' ? BgmBiq('bp', 5500, 1.0) : BgmBiq('hp', 6500, 1.2));
    for (let i = 0; i < N; i++) { const T = i / Sr; S[i] *= Math.min(1, T / 0.012) * Math.exp(-T / (K === 'sh' ? 0.05 : 0.09)); }
  } else if (K === 't1' || K === 't2') {
    N = Math.floor(0.5 * Sr);
    const F0 = K === 't1' ? 210 : 140;
    let Ph = 0;
    for (let i = 0; i < N; i++) {
      const T = i / Sr;
      Ph += F0 * (0.75 + 0.25 * Math.exp(-T / 0.08)) / Sr;
      S[i] = BgmSn(Ph) * Math.exp(-T / 0.2) * Math.min(1, i / 16) + 0.15 * Nz() * Math.exp(-T / 0.01);
    }
  } else if (K === 'tri') {
    N = Math.floor(1.6 * Sr);
    let P1 = 0, P2 = 0;
    for (let i = 0; i < N; i++) {
      const T = i / Sr;
      P1 += 2640 / Sr; P2 += 6930 / Sr;
      S[i] = (BgmSn(P1) + 0.4 * BgmSn(P2)) * Math.exp(-T / 0.35) * Math.min(1, i / 20);
    }
  } else if (K === 'wd') {
    N = Math.floor(0.12 * Sr);
    let P1 = 0, P2 = 0;
    for (let i = 0; i < N; i++) {
      const T = i / Sr;
      P1 += 1750 / Sr; P2 += 2900 / Sr;
      S[i] = (BgmSn(P1) + 0.5 * BgmSn(P2) * Math.exp(-T / 0.006)) * Math.exp(-T / 0.022) * Math.min(1, i / 6);
    }
  }
  return N;
}

// ------------------------------------------------------------------ parsing the songs
const BgmPc = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
// the melody tokens "<note>[#]<octave>[:len]", "r[:len]" (len in 16ths, carried over), bars split by "|"
function BgmParseMel(Str, BarSteps) {
  const Notes = [];
  const Bars = Str.split('|');
  let St = 0, Len = 4;
  const Errs = [];
  Bars.forEach((B, Bi) => {
    const Start = St;
    for (const Tok of B.trim().split(/\s+/)) {
      if (!Tok) continue;
      const M = /^([a-gr])(#?)(\d?)(?::(\d+))?$/.exec(Tok);
      if (!M || (M[1] !== 'r' && !M[3])) { Errs.push('bad token ' + Tok); continue; }
      if (M[4]) Len = parseInt(M[4], 10);
      if (M[1] !== 'r') Notes.push({ St, Len, M: 12 * (parseInt(M[3], 10) + 1) + BgmPc[M[1]] + (M[2] ? 1 : 0) });
      St += Len;
    }
    if (St - Start !== BarSteps) Errs.push(`bar ${Bi + 1}: ${St - Start} steps`);
  });
  return { Notes, Bars: Bars.length, Errs };
}
const BgmQual = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], dim: [0, 3, 6], add9: [0, 4, 7, 14] };
function BgmPitch(S) {
  const M = /^([A-G])([#b]?)$/.exec(S);
  if (!M) throw new Error('note ' + S);
  return (BgmPc[M[1].toLowerCase()] + (M[2] === '#' ? 1 : M[2] === 'b' ? 11 : 0)) % 12;
}
// "Am7/G" -> {Root, Iv (intervals), Bass}
function BgmParseChord(S) {
  const [Main, Slash] = S.split('/');
  const M = /^([A-G][#b]?)(.*)$/.exec(Main);
  if (!M) throw new Error('chord ' + S);
  const Root = BgmPitch(M[1]);
  const Iv = BgmQual[M[2]];
  if (!Iv) throw new Error('chord ' + S);
  return { Root, Iv, Bass: Slash ? BgmPitch(Slash) : Root };
}
// a pitch class placed at or above Lo
function BgmAbove(Pc, Lo) { let M = Lo - (((Lo % 12) + 12) % 12) + Pc; if (M < Lo) M += 12; return M; }

// ------------------------------------------------------------------ the score -> events
// layers: [gain, pan, reverb send, echo send]
const BgmLayers = {
  lead: [0.3, 0, 0.3, 1], dbl: [0.11, 0.25, 0.4, 1], arp: [0.12, -0.35, 0.3, 0], pad: [0.08, 0, 0.5, 0],
  bass: [0.3, 0, 0.04, 0], stab: [0.09, 0.3, 0.3, 0],
};
function BgmEvents(Song) {
  const StepS = 60 / Song.Bpm / 4, BarSteps = Song.Beat * 4;
  const St = Song.Style;
  const Rnd = BgmRng(Song.Seed);
  const Ev = [];
  const Mod4 = X => ((X % 4) + 4) % 4;
  const Tm = Step => Step * StepS + (Song.Swing && Mod4(Step) === 2 ? Song.Swing * StepS : 0);
  const Note = (Layer, Ins, Step, Steps, M, V) => {
    const P = BgmIns[Ins];
    Ev.push({ Layer, Ins, T: Math.max(0, Tm(Step) + (Rnd() - 0.5) * 0.006), D: Steps * StepS * P.leg, M, V: V * (0.94 + Rnd() * 0.12) });
  };
  let Bar = 0;
  for (const F of Song.Form) {
    const Nm = /^([A-Z]+)(\d)(\*?)$/.exec(F);
    const Sec = Song.Sec[Nm[1]], Lv = parseInt(Nm[2], 10), Alt = !!Nm[3];
    const ChBars = Sec.ch.trim().split(/\s+/).map(B => B.split(',').map(BgmParseChord));
    const NB = ChBars.length;
    const Lead = Alt ? Song.Ins.lead2 : Song.Ins.lead;
    for (let B = 0; B < NB; B++) {
      const B0 = (Bar + B) * BarSteps;
      const Chs = ChBars[B];
      const Last = B === NB - 1;
      Chs.forEach((Ch, Ci) => {
        const CS = Ci * BarSteps / Chs.length, CL = BarSteps / Chs.length;
        const Next = Chs[Ci + 1] || (ChBars[B + 1] ? ChBars[B + 1][0] : Ch);
        // pad: the chord tones voiced in one octave from padLo
        const PadMs = Ch.Iv.map(I => BgmAbove((Ch.Root + I) % 12, St.padLo)).sort((X, Y) => X - Y);
        if (Song.Ins.pad && (St.padLv ?? 0) <= Lv) for (const M of PadMs) Note('pad', Song.Ins.pad, B0 + CS, CL, M, 1);
        // arpeggio
        if (St.arp && (St.arpLv ?? 1) <= Lv) {
          const Base = Ch.Iv.map(I => BgmAbove((Ch.Root + I) % 12, St.arpLo)).sort((X, Y) => X - Y);
          for (const [S, K, L] of St.arp) {
            if (S < CS || S >= CS + CL) continue;
            const M = Base[K % Base.length] + 12 * Math.floor(K / Base.length);
            Note('arp', Song.Ins.arp, B0 + S, L, M, S % 4 === 0 ? 1 : 0.8);
          }
        }
        // chord stabs
        if (St.stab && (St.stabLv ?? 1) <= Lv) {
          for (const [S, L] of St.stab) {
            if (S < CS || S >= CS + CL) continue;
            for (const M of PadMs) Note('stab', Song.Ins.stab, B0 + S, L, M + 12, 1);
          }
        }
        // bass
        if (St.bass && Lv >= 1) {
          const R = BgmAbove(Ch.Bass, St.bassLo);
          const Rt = BgmAbove(Ch.Root, St.bassLo);
          for (const [S, K, L] of St.bass) {
            if (S < CS || S >= CS + CL) continue;
            const M = K === 'R' ? R : K === '5' ? Rt + 7 : K === '8' ? R + 12 : K === '3' ? Rt + Ch.Iv[1] : BgmAbove(Next.Bass, St.bassLo) - 1;
            Note('bass', Song.Ins.bass, B0 + S, L, M, S % 4 === 0 ? 1 : 0.85);
          }
        }
      });
      // drums (the last bar of a section gets the fill)
      const Pat = (Last && Lv >= 2 && St.fill) ? St.fill : St.dr[Lv];
      if (Pat) {
        for (const K in Pat) {
          const Row = Pat[K];
          for (let S = 0; S < Row.length; S++) {
            const C = Row[S];
            if (C === '.') continue;
            Ev.push({ Layer: 'drum', Ins: K, T: Math.max(0, Tm(B0 + S) + (Rnd() - 0.5) * 0.003), D: 0, M: 0, V: (C === 'X' ? 1 : C === 'x' ? 0.78 : 0.45) * (0.93 + Rnd() * 0.1) });
          }
        }
      }
      if (B === 0 && Lv >= 2 && Song.Crash) Ev.push({ Layer: 'drum', Ins: 'cr', T: Tm(B0), D: 0, M: 0, V: Lv >= 3 ? 1 : 0.7 });
    }
    // the melody (and its octave double at intensity 3)
    if (Sec.mel) {
      const Mel = BgmParseMel(Sec.mel, BarSteps);
      for (const N of Mel.Notes) {
        Note('lead', Lead, Bar * BarSteps + N.St, N.Len, N.M, 1);
        if (Lv >= 3 && Song.Ins.dbl) Note('dbl', Song.Ins.dbl, Bar * BarSteps + N.St, N.Len, N.M + 12, 1);
      }
    }
    Bar += NB;
  }
  Ev.sort((A, B) => A.T - B.T);
  return { Ev, Bars: Bar, LoopS: Bar * BarSteps * StepS, StepS };
}

// problems in a song's data (bar lengths, chord / melody bar counts) — for the tests
function BgmCheck(Song) {
  const Errs = [];
  const BarSteps = Song.Beat * 4;
  for (const K in Song.Sec) {
    const S = Song.Sec[K];
    let NB = 0;
    try { NB = S.ch.trim().split(/\s+/).map(B => B.split(',').map(BgmParseChord)).length; } catch (e) { Errs.push(`${Song.Name} ${K}: ${e.message}`); }
    if (S.mel) {
      const M = BgmParseMel(S.mel, BarSteps);
      for (const E of M.Errs) Errs.push(`${Song.Name} ${K}: ${E}`);
      if (M.Bars !== NB) Errs.push(`${Song.Name} ${K}: ${M.Bars} melody bars, ${NB} chord bars`);
    }
  }
  return Errs;
}

// ------------------------------------------------------------------ rendering (a generator: the caller runs it in slices)
const BgmTargetRms = 0.14;  // about -17 dBFS (the sound effects are about -14.5 dBFS at their loudest)
function BgmClip(X) {
  const A = Math.abs(X);
  if (A <= 0.75) return X;
  const Y = 0.75 + 0.22 * Math.tanh((A - 0.75) / 0.22);
  return X < 0 ? -Y : Y;
}
function* BgmRenderGen(Song, Stats) {
  const Sr = BgmSR;
  const Sc = BgmEvents(Song);
  const LoopN = Math.round(Sc.LoopS * Sr), TailN = Math.round(BgmTailS * Sr), N = LoopN + TailN;
  const L = new Float32Array(N), R = new Float32Array(N), Rv = new Float32Array(N), Ec = new Float32Array(N);
  const Scr = new Float32Array(Sr * 8);
  const Rnd = BgmRng(Song.Seed * 7 + 1);
  let K = 0;
  for (const E of Sc.Ev) {
    const Pos = Math.round(E.T * Sr);
    let Len = 0, G, Pan, Sv, Ev;
    if (E.Layer === 'drum') {
      Len = BgmDrum(Scr, E.Ins, Rnd);
      const Kd = BgmKit[E.Ins];
      G = Kd[0] * E.V; Pan = Kd[1]; Sv = Kd[2]; Ev = 0;
    } else {
      const P = BgmIns[E.Ins], F = 440 * Math.pow(2, (E.M - 69) / 12);
      Len = P.t === 'fm' ? BgmVFm(Scr, F, E.D, P) : P.t === 'mar' ? BgmVMar(Scr, F, E.D, P, Rnd) : P.t === 'ks' ? BgmVKs(Scr, F, E.D, P, Rnd) : BgmVGen(Scr, F, E.D, P, Rnd);
      const Ly = BgmLayers[E.Layer];
      G = Ly[0] * E.V * ((Song.Gain && Song.Gain[E.Layer]) || 1);
      Pan = E.Layer === 'pad' || E.Layer === 'stab' ? ((E.M % 5) - 2) * 0.2 : Ly[1];
      Sv = Ly[2]; Ev = Ly[3] * (Song.Echo || 0);
    }
    const GL = G * Math.cos((Pan + 1) * Math.PI / 4) * Math.SQRT2, GR = G * Math.sin((Pan + 1) * Math.PI / 4) * Math.SQRT2;
    const GS = G * Sv, GE = G * Ev;
    const End = Math.min(Len, N - Pos);
    let En = 0;
    for (let i = 0; i < End; i++) {
      const X = Scr[i];
      L[Pos + i] += X * GL; R[Pos + i] += X * GR; Rv[Pos + i] += X * GS;
      if (GE) Ec[Pos + i] += X * GE;
      En += X * X;
    }
    if (Stats) { const Ky = E.Layer === 'drum' ? 'drum' : E.Layer; Stats[Ky] = (Stats[Ky] || 0) + En * G * G; }
    if (++K % 6 === 0) yield;
  }
  // echo (ping-pong, a dotted eighth), also sent to the reverb
  if (Song.Echo) {
    const Dd = Math.round(Sc.StepS * 3 * Sr);
    const DL = new Float32Array(Dd), DR = new Float32Array(Dd);
    let P = 0, LpL = 0, LpR = 0;
    for (let i = 0; i < N; i++) {
      const OL = DL[P], OR = DR[P];
      LpL += 0.5 * (OR - LpL); LpR += 0.5 * (OL - LpR);
      DL[P] = Ec[i] + LpL * 0.38; DR[P] = LpR * 0.38;
      L[i] += OL * 0.55; R[i] += OR * 0.55; Rv[i] += (OL + OR) * 0.2;
      if (++P >= Dd) P = 0;
      if ((i & 32767) === 0) yield;
    }
  }
  // reverb (a small Freeverb: 4 combs + 2 all-passes per side)
  const Wet = Song.Rev ?? 0.8;
  for (let Side = 0; Side < 2; Side++) {
    const Sp = Side * 23, Out = Side ? R : L;
    const CL = [1116, 1188, 1277, 1356].map(X => Math.round((X + Sp) * Sr / 44100));
    const AL = [556, 441].map(X => Math.round((X + Sp) * Sr / 44100));
    const Cb = CL.map(X => new Float32Array(X)), Ci = [0, 0, 0, 0], Cf = [0, 0, 0, 0];
    const Ab = AL.map(X => new Float32Array(X)), Ai = [0, 0];
    const Fb = 0.8, Dm = 0.3, Gin = BgmRevGain * Wet;
    for (let i = 0; i < N; i++) {
      const In = Rv[i] * Gin;
      let S = 0;
      for (let c = 0; c < 4; c++) {
        const B = Cb[c], O = B[Ci[c]];
        Cf[c] = O * (1 - Dm) + Cf[c] * Dm;
        B[Ci[c]] = In + Cf[c] * Fb;
        if (++Ci[c] >= B.length) Ci[c] = 0;
        S += O;
      }
      for (let a = 0; a < 2; a++) {
        const B = Ab[a], O = B[Ai[a]];
        B[Ai[a]] = S + O * 0.5;
        S = O - S;
        if (++Ai[a] >= B.length) Ai[a] = 0;
      }
      Out[i] += S;
      if ((i & 16383) === 0) yield;
    }
  }
  // the tail goes back to the start (seamless loop), DC blocked, the same loudness for every song
  for (let i = 0; i < TailN; i++) { L[i] += L[LoopN + i]; R[i] += R[LoopN + i]; }
  let XL = 0, YL = 0, XR = 0, YR = 0;
  const Hp = Math.exp(-2 * Math.PI * 25 / Sr);
  // two passes: the filter state is settled where the loop restarts
  for (let Pass = 0; Pass < 2; Pass++) {
    for (let i = 0; i < LoopN; i++) {
      const A = L[i], B = R[i];
      YL = Hp * (YL + A - XL); XL = A; YR = Hp * (YR + B - XR); XR = B;
      if (Pass === 1) { L[i] = YL; R[i] = YR; }
    }
    yield;
  }
  let Sum = 0;
  for (let i = 0; i < LoopN; i++) Sum += L[i] * L[i] + R[i] * R[i];
  const Rms = Math.sqrt(Sum / (2 * LoopN)) || 1;
  const Gn = BgmTargetRms / Rms;
  for (let i = 0; i < LoopN; i++) { L[i] = BgmClip(L[i] * Gn); R[i] = BgmClip(R[i] * Gn); }
  if (Stats) { Stats.rawRms = Rms; Stats.gain = Gn; Stats.loopS = Sc.LoopS; Stats.events = Sc.Ev.length; }
  return { L: L.subarray(0, LoopN), R: R.subarray(0, LoopN), Sr, Song };
}
const BgmRevGain = 0.06;
// runs a render to the end in one go (tests)
function BgmRenderNow(Song, Stats) {
  const G = BgmRenderGen(Song, Stats);
  for (;;) { const R = G.next(); if (R.done) return R.value; }
}

// ------------------------------------------------------------------ the songs
// menu: light and cheerful / battle: driving.  Style: bass / arp = [step, chord tone (arp) or R 5 8 3 A (bass;
// A = a half step under the next chord), 16ths], stab = [step, 16ths], dr = drum rows per intensity (k kick,
// s snare, c clap, h hat, oh open hat, sh shaker, tb tambourine, t1 / t2 toms, tri triangle, wd wood block;
// X accent, x normal, o soft), fill = the last bar of a section (intensity 2+).
const BgmSongs = [
  {
    Id: 'm1', Kind: 'menu', Name: 'はじまりの草原', Seed: 11, Bpm: 112, Beat: 4, Swing: 0, Rev: 0.9, Echo: 0.35,
    Ins: { lead: 'flute', lead2: 'bell', dbl: 'bell', arp: 'mar', bass: 'softbass', pad: 'pad' },
    Style: {
      padLo: 55, arpLo: 60, bassLo: 36, arpLv: 1,
      bass: [[0, 'R', 6], [6, '5', 2], [8, '8', 4], [12, '5', 4]],
      arp: [[0, 0, 2], [2, 1, 2], [4, 2, 2], [6, 1, 2], [8, 3, 2], [10, 2, 2], [12, 1, 2], [14, 2, 2]],
      dr: {
        1: { sh: 'o.x.o.x.o.x.o.x.' },
        2: { k: 'x.......x.....o.', c: '....x.......x...', sh: 'o.x.o.x.o.x.o.x.' },
        3: { k: 'x.......x.....o.', c: '....x.......x...', sh: 'o.x.o.x.o.x.o.x.', tb: '..x...x...x...x.' },
      },
      fill: { k: 'x.......x.......', c: '....x.......x.xx', sh: 'o.x.o.x.o.x.o.x.' },
    },
    Sec: {
      I: { ch: 'C Am F G' },
      A: {
        ch: 'C G/B Am Em/G F C/E Dm7 G',
        mel: 'e5:4 g5:2 e5:2 c6:6 b5:2 | a5:2 g5:2 d5:4 g5:8 | c5:2 e5:2 a5:4 g5:2 e5:2 c5:4 | d5:4 e5:2 g5:2 b4:8 | a4:2 c5:2 f5:4 a5:4 g5:2 f5:2 | e5:4 c5:2 e5:2 g5:8 | f5:2 e5:2 d5:2 c5:2 d5:4 a5:4 | g5:6 f5:2 d5:4 b4:4',
      },
      B: {
        ch: 'F G Em Am Dm7 G C C,G7',
        mel: 'c6:4 a5:4 f5:4 a5:4 | b5:4 g5:4 d5:4 g5:4 | b5:2 a5:2 g5:2 e5:2 g5:8 | a5:2 g5:2 e5:2 c5:2 e5:8 | f5:4 a5:4 c6:4 a5:4 | b5:4 d6:4 b5:2 a5:2 g5:4 | c6:6 g5:2 e5:4 g5:4 | c6:8 r:4 g5:2 b5:2',
      },
    },
    Form: ['I1', 'A2', 'B2', 'A3*'],
  },
  {
    Id: 'm2', Kind: 'menu', Name: 'おかしの街', Seed: 22, Bpm: 128, Beat: 4, Swing: 0.5, Rev: 0.7, Echo: 0.2,
    Ins: { lead: 'reed', lead2: 'mar', dbl: 'bell', stab: 'pizz', bass: 'tuba', pad: 'pad' },
    Gain: { pad: 0.7, stab: 4 },
    Style: {
      padLo: 57, bassLo: 36, padLv: 2, stabLv: 1,
      bass: [[0, 'R', 3], [8, '5', 3]],
      stab: [[4, 2], [12, 2]],
      dr: {
        1: { wd: '..o...o...o...o.' },
        2: { k: 'x.......x.......', c: '....o.......o...', wd: '..x...x...x...x.', sh: 'o.o.o.o.o.o.o.o.' },
        3: { k: 'x.......x.......', c: '....x.......x...', wd: '..x...x...x...x.', sh: 'o.o.o.o.o.o.o.o.', tb: '....x.......x...' },
      },
      fill: { k: 'x.......x.......', c: '....o.......o...', wd: '..x...x...x.xxxx' },
    },
    Sec: {
      I: { ch: 'F F C7 C7' },
      A: {
        ch: 'F Dm Gm7 C7 F Dm Gm7,C7 F',
        mel: 'c5:2 f5:2 a5:2 c6:2 a5:4 f5:4 | d5:2 f5:2 a5:2 d6:2 a5:4 f5:4 | g5:2 a#5:2 d6:2 a#5:2 a5:2 g5:2 f5:4 | e5:2 g5:2 c6:2 a#5:2 g5:4 e5:4 | f5:2 a5:2 c6:2 f6:2 e6:2 c6:2 a5:4 | d6:2 c6:2 a5:2 f5:2 a5:8 | a#5:2 a5:2 g5:4 g5:2 a5:2 a#5:2 e5:2 | f5:4 c5:4 f5:4 r:4',
      },
      B: {
        ch: 'Bb Bb F F Gm C7 F,Dm Gm7,C7',
        mel: 'd6:6 c6:2 a#5:8 | f5:4 g5:4 a#5:4 d6:4 | c6:6 a5:2 f5:8 | a5:4 c6:4 a5:4 g5:4 | a#5:6 a5:2 g5:4 d5:4 | e5:4 g5:4 c6:4 a#5:4 | a5:4 c6:4 d6:4 a5:4 | g5:4 a#5:4 c6:4 e5:4',
      },
    },
    Form: ['I1', 'A2', 'B2', 'A3*'],
  },
  {
    Id: 'm3', Kind: 'menu', Name: '星降る図書館', Seed: 33, Bpm: 132, Beat: 3, Swing: 0, Rev: 1.1, Echo: 0.3,
    Ins: { lead: 'bell', lead2: 'violin', dbl: 'bell', arp: 'harp', bass: 'softbass', pad: 'strings' },
    Gain: { pad: 0.8, arp: 1.1 },
    Style: {
      padLo: 54, arpLo: 50, bassLo: 38, arpLv: 1,
      bass: [[0, 'R', 4]],
      arp: [[0, 0, 2], [2, 1, 2], [4, 2, 2], [6, 3, 2], [8, 2, 2], [10, 1, 2]],
      dr: {
        2: { tri: 'x...........', sh: '....o...o...' },
        3: { tri: 'x.....o.....', sh: '..o.o.o.o.o.' },
      },
    },
    Sec: {
      I: { ch: 'D D G A' },
      A: {
        ch: 'D A/C# Bm F#m/A G D/F# Em7 A7',
        mel: 'f#5:8 a5:4 | e5:8 a5:4 | d5:4 f#5:4 b5:4 | a5:8 f#5:4 | g5:4 b5:4 d6:4 | d6:8 a5:4 | g5:4 f#5:4 e5:4 | a5:8 g5:4',
      },
      C: {
        ch: 'D A/C# Bm F#m/A G A7 D D',
        mel: 'f#5:8 a5:4 | e5:8 a5:4 | d5:4 f#5:4 b5:4 | a5:8 f#5:4 | g5:4 b5:4 d6:4 | c#6:4 e6:4 c#6:4 | d6:12 | a5:4 f#5:4 d5:4',
      },
      B: {
        ch: 'G A F#m Bm Em A D D',
        mel: 'b5:4 a5:4 g5:4 | a5:8 e5:4 | f#5:4 e5:4 c#5:4 | d5:8 b4:4 | e5:4 g5:4 b5:4 | c#6:4 b5:4 a5:4 | f#5:8 e5:4 | d5:12',
      },
    },
    Form: ['I1', 'A2', 'B2', 'C2', 'B3*'],
  },
  {
    Id: 'm4', Kind: 'menu', Name: '旅立ちの朝', Seed: 44, Bpm: 100, Beat: 4, Swing: 0, Rev: 0.8, Echo: 0.3,
    Ins: { lead: 'oca', lead2: 'flute', dbl: 'bell', arp: 'harp', bass: 'softbass', pad: 'pad' },
    Gain: { arp: 2 },
    Style: {
      padLo: 55, arpLo: 50, bassLo: 36, arpLv: 0,
      bass: [[0, 'R', 4], [4, '5', 4], [8, '8', 4], [12, '5', 2], [14, 'A', 2]],
      arp: [[0, 0, 2], [2, 2, 1], [3, 1, 1], [4, 3, 2], [6, 2, 2], [8, 0, 2], [10, 2, 1], [11, 1, 1], [12, 3, 2], [14, 2, 2]],
      dr: {
        1: { sh: 'x.o.x.o.x.o.x.o.' },
        2: { k: 'x.....x...x.....', c: '....x.......x...', tb: '..o...o...o...o.', sh: 'x.o.x.o.x.o.x.o.' },
        3: { k: 'x.....x...x...o.', c: '....x.......x...', tb: '..x...x...x...x.', sh: 'x.o.x.o.x.o.x.o.' },
      },
      fill: { k: 'x.....x...x.....', c: '....x.......x.x.', tb: '..o...o...o...o.' },
    },
    Sec: {
      I: { ch: 'G D/F# Em C' },
      A: {
        ch: 'G D/F# Em Bm C G/B Am7 D',
        mel: 'd5:4 g5:4 b5:6 a5:2 | a5:4 f#5:4 d5:8 | e5:2 f#5:2 g5:4 b5:6 g5:2 | f#5:8 d5:4 b4:4 | c5:4 e5:4 g5:4 c6:4 | b5:6 a5:2 g5:8 | a5:4 g5:4 e5:4 c5:4 | d5:8 f#5:4 a5:4',
      },
      B: {
        ch: 'C D Bm Em Am7 D G D7',
        mel: 'e6:6 d6:2 c6:8 | d6:6 c6:2 a5:8 | b5:6 a5:2 f#5:8 | g5:4 b5:4 e6:8 | c6:4 b5:4 a5:4 g5:4 | f#5:4 a5:4 d6:8 | b5:6 a5:2 g5:8 | a5:4 b5:4 c6:4 f#5:4',
      },
    },
    Form: ['I1', 'A2', 'B2', 'A3*'],
  },
  {
    Id: 'b1', Kind: 'battle', Name: '決闘のファンファーレ', Seed: 55, Bpm: 150, Beat: 4, Swing: 0, Rev: 0.6, Echo: 0.15, Crash: true,
    Ins: { lead: 'brass', lead2: 'sqlead', dbl: 'sqlead', arp: 'pluck', bass: 'synbass', pad: 'strings' },
    Gain: { pad: 1.2, arp: 2.5, lead: 1.3 },
    Style: {
      padLo: 52, arpLo: 64, bassLo: 33, arpLv: 3,
      bass: [[0, 'R', 2], [2, 'R', 2], [4, '8', 2], [6, 'R', 2], [8, 'R', 2], [10, 'R', 2], [12, '8', 2], [14, '5', 2]],
      arp: [[0, 0, 1], [1, 1, 1], [2, 2, 1], [3, 1, 1], [4, 3, 1], [5, 1, 1], [6, 2, 1], [7, 1, 1], [8, 0, 1], [9, 1, 1], [10, 2, 1], [11, 1, 1], [12, 3, 1], [13, 2, 1], [14, 1, 1], [15, 2, 1]],
      dr: {
        1: { k: 'x.......x.......', h: 'x.x.x.x.x.x.x.x.' },
        2: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
        3: { k: 'x.....x.x.....x.', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo' },
      },
      fill: { k: 'x.....x.x.......', s: '....x.......x...', t1: '..........xx....', t2: '............xxXX' },
    },
    Sec: {
      I: { ch: 'Am F G E' },
      A: {
        ch: 'Am F C G Am F E E',
        mel: 'a4:3 a4:1 c5:2 e5:2 a5:6 g5:2 | f5:4 e5:2 d5:2 c5:4 a4:4 | g4:3 g4:1 c5:2 e5:2 g5:6 e5:2 | d5:8 b4:4 g4:4 | a4:3 a4:1 c5:2 e5:2 a5:4 b5:4 | c6:4 a5:4 f5:4 a5:4 | g#5:4 e5:4 b4:4 d5:4 | e5:12 r:4',
      },
      B: {
        ch: 'F G Em Am F G E E',
        mel: 'c6:6 a5:2 f5:8 | d6:6 b5:2 g5:8 | e5:2 g5:2 b5:4 e6:4 d6:4 | c6:8 a5:8 | a4:2 c5:2 f5:4 e5:2 d5:2 c5:4 | b4:2 d5:2 g5:4 f5:2 e5:2 d5:4 | e5:4 g#5:4 b5:4 d6:4 | e6:8 r:4 b5:2 g#5:2',
      },
      C: {
        ch: 'Dm Am Dm E F G Am E',
        mel: 'f5:8 a5:8 | e5:8 c5:8 | d5:4 f5:4 a5:4 d6:4 | b5:8 g#5:8 | a5:8 c6:8 | b5:8 d6:8 | c6:4 b5:4 a5:4 e5:4 | g#5:8 b5:4 e6:4',
      },
    },
    Form: ['I1', 'A2', 'B2', 'A3', 'C2*'],
  },
  {
    Id: 'b2', Kind: 'battle', Name: '魔法陣の攻防', Seed: 66, Bpm: 160, Beat: 4, Swing: 0, Rev: 0.6, Echo: 0.15, Crash: true,
    Ins: { lead: 'sqlead', lead2: 'brass', dbl: 'pluck', arp: 'pluck', bass: 'synbass', pad: 'strings' },
    Gain: { pad: 1.1, arp: 2, lead: 1.1, dbl: 2.5 },
    Style: {
      padLo: 53, arpLo: 62, bassLo: 33, arpLv: 0,
      bass: [[0, 'R', 2], [2, '8', 2], [4, 'R', 2], [6, '8', 2], [8, 'R', 2], [10, '8', 2], [12, 'R', 2], [14, '8', 2]],
      arp: [[0, 0, 1], [1, 2, 1], [2, 1, 1], [3, 2, 1], [4, 3, 1], [5, 2, 1], [6, 1, 1], [7, 2, 1], [8, 0, 1], [9, 2, 1], [10, 1, 1], [11, 2, 1], [12, 3, 1], [13, 2, 1], [14, 1, 1], [15, 2, 1]],
      dr: {
        1: { k: 'x...x...x...x...' },
        2: { k: 'x...x...x...x...', c: '....x.......x...', oh: '..x...x...x...x.' },
        3: { k: 'x...x...x...x...', s: '....x.......x...', c: '....x.......x...', oh: '..x...x...x...x.', h: 'xoxoxoxoxoxoxoxo' },
      },
      fill: { k: 'x...x...x...x...', s: '....x.....x.xxXX', oh: '..x...x.........' },
    },
    Sec: {
      I: { ch: 'Dm Dm Bb C' },
      A: {
        ch: 'Dm Bb C Am Dm Bb Gm A',
        mel: 'd5:2 f5:2 a5:4 d6:4 c6:2 a5:2 | a#5:6 a5:2 f5:4 d5:4 | c5:2 e5:2 g5:4 c6:4 a#5:2 g5:2 | a5:8 e5:4 c5:4 | d5:2 f5:2 a5:4 d6:4 e6:2 f6:2 | d6:6 c6:2 a#5:4 f5:4 | g5:4 a#5:4 d6:4 a#5:4 | a5:4 c#6:4 e6:6 r:2',
      },
      B: {
        ch: 'Bb C Dm Dm Bb C A A',
        mel: 'f5:4 a#5:4 d6:8 | e6:4 d6:4 c6:8 | d6:4 a5:4 f5:4 a5:4 | d6:16 | f6:4 d6:4 a#5:8 | g5:4 c6:4 e6:8 | e6:4 c#6:4 a5:4 e5:4 | a5:8 c#6:4 e6:4',
      },
    },
    Form: ['I1', 'A2', 'B2', 'A3', 'B3*'],
  },
  {
    Id: 'b3', Kind: 'battle', Name: '勇者たちの賭け', Seed: 77, Bpm: 138, Beat: 4, Swing: 0, Rev: 0.7, Echo: 0.15, Crash: true,
    Ins: { lead: 'brass', lead2: 'violin', dbl: 'violin', arp: 'pluck', bass: 'synbass', pad: 'strings' },
    Gain: { pad: 1.2, arp: 2.5, lead: 1.8 },
    Style: {
      padLo: 52, arpLo: 64, bassLo: 35, arpLv: 3,
      bass: [[0, 'R', 2], [2, 'R', 1], [3, 'R', 1], [4, 'R', 2], [6, 'R', 1], [7, 'R', 1], [8, 'R', 2], [10, 'R', 1], [11, 'R', 1], [12, '8', 2], [14, '5', 1], [15, '5', 1]],
      arp: [[0, 0, 1], [2, 1, 1], [4, 2, 1], [6, 3, 1], [8, 2, 1], [10, 1, 1], [12, 2, 1], [14, 3, 1]],
      dr: {
        1: { k: 'x.......x.......', h: 'x.x.x.x.x.x.x.x.' },
        2: { k: 'x.x...x.x.x...x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
        3: { k: 'x.x...x.x.x...x.', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo' },
      },
      fill: { k: 'x.x...x.........', s: '....x.......xxXX', t1: '........xx......', t2: '..........xx....' },
    },
    Sec: {
      I: { ch: 'Em C D B7' },
      A: {
        ch: 'Em C G D Em C Am B7',
        mel: 'e5:6 f#5:2 g5:4 b5:4 | c6:6 b5:2 a5:4 g5:4 | g5:4 b5:4 d6:8 | a5:6 f#5:2 d5:8 | e5:6 f#5:2 g5:4 b5:4 | e6:6 d6:2 c6:4 g5:4 | a5:4 c6:4 e6:4 c6:4 | d#6:8 b5:4 f#5:4',
      },
      B: {
        ch: 'C D G Em C D B7 B7',
        mel: 'e5:4 g5:4 c6:8 | d6:4 a5:4 f#5:8 | g5:4 b5:4 d6:8 | e6:6 d6:2 b5:8 | c6:4 b5:4 g5:8 | a5:4 d6:4 f#6:8 | d#6:6 f#6:2 b5:8 | a5:4 b5:4 d#6:4 f#6:4',
      },
    },
    Form: ['I1', 'A2', 'B2', 'A3', 'B3*'],
  },
];

// ------------------------------------------------------------------ playback (browser)
const Bgm = {
  Ctx: null, Out: null, Cur: null, Want: null, Gen: 0,
  Cache: new Map(), Jobs: new Map(), Queue: Promise.resolve(),
  Duck: 1, Hidden: false, InBattle: false,
  LastMenu: '', LastBattle: '', NextMenu: null, NextBattle: null,
  Log: [],
};
try { Bgm.LastMenu = localStorage.getItem('dd_bgm_menu') || ''; } catch (e) { }
// a song of that kind, never the one played last
function BgmPick(Kind) {
  const L = BgmSongs.filter(S => S.Kind === Kind);
  const Last = Kind === 'menu' ? Bgm.LastMenu : Bgm.LastBattle;
  const C = L.filter(S => S.Id !== Last);
  return C[Math.floor(Math.random() * C.length)] || L[0];
}
function BgmRemember(S) {
  if (S.Kind === 'menu') { Bgm.LastMenu = S.Id; try { localStorage.setItem('dd_bgm_menu', S.Id); } catch (e) { } }
  else Bgm.LastBattle = S.Id;
}

// renders a song (one at a time, in slices of ~10 ms so the game keeps running) -> AudioBuffer (cached)
function BgmBuffer(Song) {
  if (Bgm.Cache.has(Song.Id)) return Promise.resolve(Bgm.Cache.get(Song.Id));
  if (Bgm.Jobs.has(Song.Id)) return Bgm.Jobs.get(Song.Id);
  const Job = Bgm.Queue.then(() => new Promise(Res => {
    const T0 = performance.now();
    const G = BgmRenderGen(Song, null);
    const Step = () => {
      const S0 = performance.now();
      let R;
      do { R = G.next(); } while (!R.done && performance.now() - S0 < 10);
      if (!R.done) { setTimeout(Step, 0); return; }
      const O = R.value;
      // (before the first tap there is no context yet: an AudioBuffer can be made without one in today's browsers,
      // else the samples wait in the cache until BgmStart)
      const Buf = BgmToBuffer(O) || { Raw: O };
      Bgm.Log.push(`render ${Song.Id} ${Math.round(performance.now() - T0)}ms`);
      Bgm.Jobs.delete(Song.Id);
      if (Buf) Bgm.Cache.set(Song.Id, Buf);
      BgmTrim();
      Res(Buf);
    };
    Step();
  }));
  Bgm.Jobs.set(Song.Id, Job);
  Bgm.Queue = Job.then(() => { }, () => { });
  return Job;
}
function BgmToBuffer(O) {
  let Buf = null;
  try { Buf = new AudioBuffer({ length: O.L.length, numberOfChannels: 2, sampleRate: O.Sr }); } catch (e) { Buf = null; }
  try { if (!Buf && Bgm.Ctx) Buf = Bgm.Ctx.createBuffer(2, O.L.length, O.Sr); } catch (e) { Buf = null; }
  if (!Buf) return null;
  Buf.getChannelData(0).set(O.L);
  Buf.getChannelData(1).set(O.R);
  return Buf;
}
// only the buffers that may play soon are kept (each is ~15 MB)
function BgmTrim() {
  const Keep = new Set([Bgm.Cur && Bgm.Cur.Song.Id, Bgm.Want && Bgm.Want.Id, Bgm.NextMenu && Bgm.NextMenu.Id, Bgm.NextBattle && Bgm.NextBattle.Id]);
  for (const K of [...Bgm.Cache.keys()]) if (!Keep.has(K)) Bgm.Cache.delete(K);
}

function BgmLevel() { return SndLevel('bgm'); }
function BgmMasterGain() { return Bgm.Hidden ? 0 : SndGain(BgmLevel()) * Bgm.Duck; }
function BgmApplyGain(Tc = 0.12) {
  if (!Bgm.Out) return;
  const T = Bgm.Ctx.currentTime;
  try { Bgm.Out.gain.cancelScheduledValues(T); Bgm.Out.gain.setTargetAtTime(BgmMasterGain(), T, Tc); } catch (e) { }
}

// the audio context is the one of sfx.js (made inside the first tap); true when music can play now
function BgmReady() {
  if (!Bgm.Ctx) {
    if (typeof SfxCtx === 'undefined' || !SfxCtx) return false;
    Bgm.Ctx = SfxCtx;
    Bgm.Out = SfxCtx.createGain();
    Bgm.Out.gain.value = BgmMasterGain();
    Bgm.Out.connect(SfxCtx.destination);
    // (the context may wake up a moment after the tap, e.g. on iOS)
    try { SfxCtx.addEventListener('statechange', () => setTimeout(BgmPoke, 0)); } catch (e) { }
  }
  return AudioUnlocked && Bgm.Ctx.state === 'running';
}

// starts what should play now (after taps, volume changes, the tab shown again)
function BgmPoke() {
  if (!BgmReady()) return;
  if (BgmLevel() <= 0) { if (Bgm.Cur) BgmStopCur(0.3); return; }
  if (!Bgm.Want || (Bgm.Cur && Bgm.Cur.Song === Bgm.Want) || Bgm.Starting === Bgm.Want) return;
  BgmStart(Bgm.Want, 0, 1.2);
}

function BgmStopCur(Fade) {
  const C = Bgm.Cur;
  if (!C) return;
  Bgm.Cur = null;
  const T = Bgm.Ctx.currentTime;
  try {
    C.G.gain.cancelScheduledValues(T);
    C.G.gain.setValueAtTime(C.G.gain.value, T);
    C.G.gain.linearRampToValueAtTime(0, T + Fade);
    C.Src.stop(T + Fade + 0.05);
  } catch (e) { }
}

// the current song fades out, Song fades in (after Delay seconds)
async function BgmStart(Song, Delay, FadeIn) {
  const Gen = ++Bgm.Gen;
  Bgm.Starting = Song;
  let Buf = null;
  try { Buf = await BgmBuffer(Song); } finally { if (Gen === Bgm.Gen) Bgm.Starting = null; }
  if (Gen !== Bgm.Gen || !Buf || Bgm.Want !== Song || BgmLevel() <= 0 || !BgmReady()) return;
  if (Buf.Raw) { Buf = BgmToBuffer(Buf.Raw); if (!Buf) return; Bgm.Cache.set(Song.Id, Buf); }
  if (Bgm.Cur && Bgm.Cur.Song === Song) return;
  BgmStopCur(1.0);
  const Ctx = Bgm.Ctx;
  const Src = Ctx.createBufferSource();
  Src.buffer = Buf;
  Src.loop = true;
  const G = Ctx.createGain();
  const T = Ctx.currentTime + Math.max(0, Delay);
  G.gain.setValueAtTime(0, Ctx.currentTime);
  G.gain.setValueAtTime(0, T);
  G.gain.linearRampToValueAtTime(1, T + FadeIn);
  Src.connect(G);
  G.connect(Bgm.Out);
  Src.start(T);
  Bgm.Cur = { Song, Src, G };
  Bgm.Log.push(`play ${Song.Kind} ${Song.Id} ${Song.Name}`);
  BgmTrim();
  // the song that comes next is made ahead of time, while this one plays
  setTimeout(() => {
    if (Bgm.Want !== Song || (Bgm.Cur && Bgm.Cur.Song !== Song)) return;
    if (Song.Kind === 'menu' && !Bgm.NextBattle) Bgm.NextBattle = BgmPick('battle');
    if (Song.Kind === 'battle' && !Bgm.NextMenu) Bgm.NextMenu = BgmPick('menu');
    const Nx = Song.Kind === 'menu' ? Bgm.NextBattle : Bgm.NextMenu;
    if (Nx && BgmLevel() > 0) BgmBuffer(Nx);
  }, 4000);
}

// ---- scenes
function BgmMenu(Delay = 0, FadeIn = 1.2) {
  const S = Bgm.NextMenu && Bgm.NextMenu.Id !== Bgm.LastMenu ? Bgm.NextMenu : BgmPick('menu');
  Bgm.NextMenu = null;
  BgmRemember(S);
  Bgm.Want = S;
  if (BgmReady() && BgmLevel() > 0) BgmStart(S, Delay, FadeIn);
}
function BgmBattleStart() {
  Bgm.InBattle = true;
  const S = Bgm.NextBattle && Bgm.NextBattle.Id !== Bgm.LastBattle ? Bgm.NextBattle : BgmPick('battle');
  Bgm.NextBattle = null;
  BgmRemember(S);
  Bgm.Want = S;
  Bgm.Duck = 1;
  BgmApplyGain();
  if (BgmReady() && BgmLevel() > 0) BgmStart(S, 0.3, 1.5);
}
// the battle is over: its song fades out, the result's jingle plays, then a new menu song comes in
function BgmBattleEnd() {
  Bgm.InBattle = false;
  if (Bgm.Cur && Bgm.Ctx) BgmStopCur(1.2);
  BgmMenu(2.6, 2.5);
}
// the result screen: the music stays quieter
function BgmSetDuck(D) { Bgm.Duck = D; BgmApplyGain(0.4); }
// 設定「曲をかえる」: another song of the same kind
function BgmSkip() {
  if (Bgm.Want && Bgm.Want.Kind === 'battle') { Bgm.NextBattle = null; BgmBattleStart(); }
  else { Bgm.NextMenu = null; BgmMenu(0.4, 1.0); }
}
function BgmNowName() { return Bgm.Want ? Bgm.Want.Name : ''; }
// the volume level changed (settings)
function BgmVolumeChanged() { BgmApplyGain(0.08); BgmPoke(); }

if (typeof window !== 'undefined') {
  // the first menu song is chosen when the page opens (not the one of last time) and made while the page loads
  BgmMenu();
  if (BgmLevel() > 0) setTimeout(() => BgmBuffer(Bgm.Want), 300);
  // after every tap (the context of sfx.js is made / woken inside the tap; AudioUnlock comes from main.js / kit.js)
  for (const Ev of ['pointerup', 'touchend', 'keydown', 'click']) window.addEventListener(Ev, () => setTimeout(BgmPoke, 30), { passive: true });
  // the tab hidden: everything pauses (the context is shared with the sound effects)
  document.addEventListener('visibilitychange', () => {
    Bgm.Hidden = document.hidden;
    if (!Bgm.Ctx) return;
    if (Bgm.Hidden) {
      BgmApplyGain(0.05);
      setTimeout(() => { if (Bgm.Hidden && Bgm.Ctx.state === 'running') Bgm.Ctx.suspend().catch(() => { }); }, 250);
    } else {
      Bgm.Ctx.resume().then(() => { BgmApplyGain(0.3); BgmPoke(); }).catch(() => { });
    }
  });
  // every match shown on this screen gets battle music (tutorial, CPU, PvP, ...)
  if (typeof card_match !== 'undefined') {
    const RunOrig = card_match.prototype.Run;
    card_match.prototype.Run = async function (...A) {
      const Shown = Array.isArray(this.Views) && this.Views.some(V => V);
      if (Shown) BgmBattleStart();
      try { return await RunOrig.apply(this, A); } finally { if (Shown) BgmBattleEnd(); }
    };
  }
  // the result screens: quieter music under the jingle
  if (typeof card_menus !== 'undefined') {
    for (const Nm of ['Result', 'TutorialResult']) {
      const Orig = card_menus.prototype[Nm];
      if (!Orig) continue;
      card_menus.prototype[Nm] = async function (...A) {
        BgmSetDuck(0.55);
        try { return await Orig.apply(this, A); } finally { BgmSetDuck(1); }
      };
    }
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { BgmSongs, BgmRenderNow, BgmCheck, BgmEvents, BgmSR, BgmIns, BgmVGen, BgmVFm, BgmVMar, BgmVKs, BgmRng };
