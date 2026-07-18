/* Seeker Summer — procedural golden-hour synthwave.
   Pure WebAudio: no assets, no network. Autoplay-first with gesture fallback.
   Mood: warm analog pads, soft sub bass, gentle pluck arp, wide space. */

const state = {
  ctx: null, master: null, musicBus: null, on: false, started: false,
  timers: [], step: 0, chord: 0, timerId: 0
};

/* A-minor sunset progression: Am9 -> Fmaj7 -> Cadd9 -> G6 */
const CHORDS = [
  { root: 45, pad: [57, 60, 64, 71], pent: [69, 72, 76, 79, 81] },  // A
  { root: 41, pad: [53, 57, 60, 64], pent: [65, 69, 72, 76, 77] },  // F
  { root: 36, pad: [55, 60, 62, 67], pent: [67, 72, 74, 79, 81] },  // C
  { root: 43, pad: [55, 59, 62, 66], pent: [67, 71, 74, 78, 79] }   // G
];
const STEP = 60 / 76 / 2;      // 76 BPM, 8th notes
const BAR = STEP * 8;
const CHORD_BARS = 4;          // 16 steps per chord

const midi = n => 440 * Math.pow(2, (n - 69) / 12);

function makeImpulse(ctx, seconds = 2.6, decay = 2.8) {
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function buildGraph() {
  const ctx = state.ctx;
  state.master = ctx.createGain(); state.master.gain.value = 0;
  state.master.connect(ctx.destination);

  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.4;
  const reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(ctx);
  const wet = ctx.createGain(); wet.gain.value = 0.33;
  const dry = ctx.createGain(); dry.gain.value = 0.8;

  state.musicBus = ctx.createGain(); state.musicBus.gain.value = 0.9;
  state.musicBus.connect(dry); dry.connect(state.master);
  state.musicBus.connect(lp); lp.connect(reverb); reverb.connect(wet); wet.connect(state.master);

  // shared echo for the arp
  const delay = ctx.createDelay(1); delay.delayTime.value = STEP * 3;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const echoLp = ctx.createBiquadFilter(); echoLp.type = 'lowpass'; echoLp.frequency.value = 1800;
  delay.connect(fb); fb.connect(echoLp); echoLp.connect(delay);
  state.echoIn = ctx.createGain(); state.echoIn.gain.value = 0.5;
  state.echoIn.connect(delay); delay.connect(state.musicBus);
}

function pad(midis, when, dur) {
  const ctx = state.ctx;
  for (const [i, n] of midis.entries()) {
    for (const det of [-6, 5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = midi(n); o.detune.value = det;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(520, when);
      f.frequency.linearRampToValueAtTime(980, when + dur * 0.5);
      f.frequency.linearRampToValueAtTime(560, when + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.028, when + dur * 0.3);
      g.gain.setValueAtTime(0.028, when + dur * 0.7);
      g.gain.linearRampToValueAtTime(0, when + dur * 1.06);
      o.connect(f); f.connect(g); g.connect(state.musicBus);
      o.start(when); o.stop(when + dur * 1.1);
    }
  }
}

function bass(note, when, dur) {
  const ctx = state.ctx;
  const o = ctx.createOscillator(); o.type = 'triangle';
  o.frequency.value = midi(note - 12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.11, when + 0.05);
  g.gain.setTargetAtTime(0.055, when + 0.1, dur * 0.3);
  g.gain.linearRampToValueAtTime(0, when + dur);
  o.connect(g); g.connect(state.musicBus);
  o.start(when); o.stop(when + dur + 0.05);
}

function pluck(note, when, vel = 1, pan = 0) {
  const ctx = state.ctx;
  const o = ctx.createOscillator(); o.type = 'square';
  o.frequency.value = midi(note);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(2600, when);
  f.frequency.exponentialRampToValueAtTime(500, when + 0.28);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.055 * vel, when);
  g.gain.exponentialRampToValueAtTime(0.0004, when + 0.42);
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  o.connect(f); f.connect(g); g.connect(p); p.connect(state.musicBus);
  g.connect(state.echoIn);
  o.start(when); o.stop(when + 0.5);
}

function noiseSweep(when) {
  const ctx = state.ctx, len = ctx.sampleRate * 1.8;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(400, when);
  f.frequency.exponentialRampToValueAtTime(3600, when + 1.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.016, when + 1.2);
  g.gain.linearRampToValueAtTime(0, when + 1.8);
  src.connect(f); f.connect(g); g.connect(state.musicBus);
  src.start(when);
}

/* seeded melodic choices so the loop feels composed, not random */
let melSeed = 7;
const melRand = () => (melSeed = (melSeed * 16807) % 2147483647) / 2147483647;

function scheduleStep() {
  const ctx = state.ctx;
  const t = ctx.currentTime + 0.08;
  const chord = CHORDS[state.chord % CHORDS.length];
  const stepInBar = state.step % 8;
  const barInChord = Math.floor(state.step / 8) % CHORD_BARS;

  if (state.step % (8 * CHORD_BARS) === 0) {
    pad(chord.pad, t, STEP * 8 * CHORD_BARS);
    if (state.step % (8 * CHORD_BARS * 2) === 0) noiseSweep(t);
  }
  if (stepInBar === 0) bass(chord.root, t, STEP * 7.4);
  else if (stepInBar === 4 && barInChord % 2 === 1) bass(chord.root + (state.chord === 3 ? 7 : 0), t, STEP * 3.4);

  // gentle pentatonic arp: sparse on first bars, fuller later
  const density = barInChord === 0 ? 0.45 : barInChord === 1 ? 0.6 : 0.75;
  if (melRand() < density) {
    const note = chord.pent[Math.floor(melRand() * chord.pent.length)] + (melRand() > 0.86 ? 12 : 0);
    pluck(note, t, 0.6 + melRand() * 0.5, (melRand() - 0.5) * 1.1);
  }

  state.step++;
  if (state.step % (8 * CHORD_BARS) === 0) state.chord++;
}

function schedulerLoop() {
  // stay two 8th-notes ahead
  while (state.nextStepTime < state.ctx.currentTime + STEP * 2.5) {
    scheduleStep();
    state.nextStepTime += STEP;
  }
}

function ensureSummerSoundStarted() {
  if (!state.started) {
    state.ctx = new (window.AudioContext || window.webkitAudioContext)();
    buildGraph();
    state.started = true;
    state.nextStepTime = state.ctx.currentTime + 0.1;
    state.timerId = setInterval(schedulerLoop, 40);
  }
}

function setSummerSound(enabled) {
  ensureSummerSoundStarted();
  const ctx = state.ctx;
  if (enabled && ctx.state === 'suspended') ctx.resume().catch(() => {});
  state.on = enabled;
  const now = ctx.currentTime;
  state.master.gain.cancelScheduledValues(now);
  state.master.gain.setValueAtTime(state.master.gain.value, now);
  state.master.gain.linearRampToValueAtTime(state.on ? 0.5 : 0, now + (state.on ? 1.6 : 0.5));
  return state.on;
}

export function toggleSummerSound() {
  return setSummerSound(!state.on);
}

export function summerSoundOn() { return state.on; }

export function bindSummerSoundButton(btn) {
  if (!btn) return;
  btn.addEventListener('click', () => {
    const on = toggleSummerSound();
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function autoplaySummerSound(btn) {
  const on = setSummerSound(true);
  btn?.classList.toggle('on', on);
  btn?.setAttribute('aria-pressed', on ? 'true' : 'false');

  // Chrome/Safari may suspend WebAudio until the first interaction.
  // Any gesture unlocks the already-enabled soundtrack; no speaker click required.
  const unlock = () => {
    if (state.on && state.ctx?.state === 'suspended') state.ctx.resume().catch(() => {});
    for (const event of ['pointerdown', 'touchstart', 'keydown']) document.removeEventListener(event, unlock, true);
  };
  if (state.ctx?.state === 'suspended') {
    for (const event of ['pointerdown', 'touchstart', 'keydown']) document.addEventListener(event, unlock, { capture: true, once: true });
  }
}

// auto-bind if the button exists at import time
if (typeof document !== 'undefined') {
  const ready = () => {
    const button = document.querySelector('#soundToggle');
    bindSummerSoundButton(button);
    autoplaySummerSound(button);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
}
