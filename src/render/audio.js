// Synthesised sound: engine, mechanical clicks and clunks, road and wind noise,
// exam-system signals and spoken prompts. Everything is generated with Web Audio.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class CarAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.voiceOn = true;
    this.lastBlink = false;
    this.lastSay = 0;
    this.voice = null;
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(comp); comp.connect(c.destination);
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 2048; comp.connect(this.analyser);

    // noise buffers
    const len = c.sampleRate * 2;
    this.white = c.createBuffer(1, len, c.sampleRate);
    this.brown = c.createBuffer(1, len, c.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { w[i] = Math.random() * 2 - 1; last = (last + 0.02 * w[i]) / 1.02; b[i] = last * 3.5; }

    // engine: firing note plus its 2nd harmonic and a half-order rumble, soft-clipped.
    // Small speakers cannot play the 25-200 Hz fundamental, so the upper harmonics carry it.
    this.eng = c.createOscillator(); this.eng.type = "sawtooth";
    this.eng2 = c.createOscillator(); this.eng2.type = "sawtooth";
    this.sub = c.createOscillator(); this.sub.type = "square";
    const g1 = this.g1 = c.createGain(), g2 = this.g2 = c.createGain(), subG = this.subG = c.createGain();
    const shaper = this.shaper = c.createWaveShaper();
    this.engFilter = c.createBiquadFilter(); this.engFilter.type = "lowpass"; this.engFilter.Q.value = 1.4;
    this.engGain = c.createGain(); this.engGain.gain.value = 0;
    this.eng.connect(g1); this.eng2.connect(g2); this.sub.connect(subG);
    [g1, g2, subG].forEach(g => g.connect(shaper));
    shaper.connect(this.engFilter); this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.eng.start(); this.eng2.start(); this.sub.start();
    // exhaust: low noise pulsed at the firing rate (the "putt-putt" of the pipes) and a
    // slow uneven wobble at half the crank speed, so the idle is not a perfect tone
    const exSrc = c.createBufferSource(); exSrc.buffer = this.brown; exSrc.loop = true;
    this.exFilter = c.createBiquadFilter(); this.exFilter.type = "lowpass"; this.exFilter.frequency.value = 180; this.exFilter.Q.value = 0.8;
    this.exGain = c.createGain(); this.exGain.gain.value = 0;
    this.exPulse = c.createOscillator(); this.exPulse.type = "square";
    this.exDepth = c.createGain(); this.exDepth.gain.value = 0;
    this.exPulse.connect(this.exDepth); this.exDepth.connect(this.exGain.gain);
    exSrc.connect(this.exFilter); this.exFilter.connect(this.exGain); this.exGain.connect(this.master);
    exSrc.start(); this.exPulse.start();
    this.wobble = c.createOscillator(); this.wobble.type = "sine";
    this.wobDepth = c.createGain(); this.wobDepth.gain.value = 0;
    this.wobble.connect(this.wobDepth); this.wobDepth.connect(this.engGain.gain); this.wobble.start();
    // turbo whistle (rises with boost) for turbocharged engines
    this.whistle = c.createOscillator(); this.whistle.type = "sine";
    this.whistleGain = c.createGain(); this.whistleGain.gain.value = 0;
    this.whistle.connect(this.whistleGain); this.whistleGain.connect(this.master); this.whistle.start();
    this.setProfile(this.profile);

    // intake / road / wind beds
    this.intake = this.bed(this.white, "bandpass", 900, 1.2);
    this.road = this.bed(this.white, "bandpass", 650, 0.6);
    this.wind = this.bed(this.white, "highpass", 2200, 0.5);

    // tyre squeal and the in-car alarm beeper
    this.squeal = c.createOscillator(); this.squeal.type = "sawtooth"; this.squeal.frequency.value = 980;
    const sqF = c.createBiquadFilter(); sqF.type = "bandpass"; sqF.frequency.value = 1100; sqF.Q.value = 8;
    this.squealGain = c.createGain(); this.squealGain.gain.value = 0;
    this.squeal.connect(sqF); sqF.connect(this.squealGain); this.squealGain.connect(this.master); this.squeal.start();
    this.beep = c.createOscillator(); this.beep.type = "square"; this.beep.frequency.value = 1180;
    this.beepGain = c.createGain(); this.beepGain.gain.value = 0;
    this.beep.connect(this.beepGain); this.beepGain.connect(this.master); this.beep.start();

    this.ambience();
    this.pickVoice();
    if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => this.pickVoice();
  }

  // engine character per car: harmonic mix, distortion, filter, turbo
  setProfile(p) {
    this.profile = p = p || { harm: [0.55, 0.35, 0.3], drive: 2.6, filter: [700, 2600], gain: 1, turbo: 0 };
    if (!this.ctx) return;
    [this.g1, this.g2, this.subG].forEach((g, i) => { g.gain.value = p.harm[i]; });
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * p.drive); }
    this.shaper.curve = curve;
  }

  bed(buf, type, freq, q) {
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    return { f, g };
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 1; if (m && window.speechSynthesis) speechSynthesis.cancel(); }
  resume() { if (this.ctx && this.ctx.state !== "running") this.ctx.resume(); }
  // current output level (RMS), used by tests and the sound check
  level() {
    if (!this.analyser) return 0;
    const d = new Float32Array(this.analyser.fftSize); this.analyser.getFloatTimeDomainData(d);
    return Math.sqrt(d.reduce((a, v) => a + v * v, 0) / d.length);
  }

  /* ---------- one-shot helpers ---------- */
  burst({ freq = 1000, q = 1, type = "bandpass", gain = 0.2, dur = 0.08, when = 0, buf = null }) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + when;
    const src = c.createBufferSource(); src.buffer = buf || this.white;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }
  tone({ freq = 440, to = null, dur = 0.2, type = "sine", gain = 0.15, when = 0, attack = 0.005 }) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  /* ---------- car sounds ---------- */
  click(hi) { this.burst({ freq: hi ? 3200 : 2200, q: 6, gain: 0.25, dur: 0.025 }); }
  // Starter motor cranking: the whine of the starter plus a "rr-rr-rr" from each compression
  // stroke, a little faster as the engine turns over. Lasts `dur` seconds.
  starter(dur = 0.9) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const whine = c.createOscillator(), wg = c.createGain(), wf = c.createBiquadFilter();
    whine.type = "sawtooth"; whine.frequency.setValueAtTime(140, t); whine.frequency.linearRampToValueAtTime(210, t + dur);
    wf.type = "bandpass"; wf.frequency.value = 900; wf.Q.value = 2;
    wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.05, t + 0.05); wg.gain.setValueAtTime(0.05, t + dur - 0.05); wg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    whine.connect(wf); wf.connect(wg); wg.connect(this.master); whine.start(t); whine.stop(t + dur + 0.05);
    let at = 0, step = 0.11;
    while (at < dur) {
      this.burst({ freq: 170, q: 1.4, gain: 0.32, dur: 0.075, when: at, buf: this.brown });
      this.tone({ freq: 90, to: 65, dur: 0.07, type: "sawtooth", gain: 0.05, when: at });
      at += step; step = Math.max(0.075, step * 0.95);
    }
  }
  // the engine catching: a deep thump; the rev flare itself comes from the engine sound
  catchFire() {
    this.burst({ freq: 120, q: 1.2, gain: 0.5, dur: 0.18, buf: this.brown });
    this.burst({ freq: 420, q: 1.5, gain: 0.15, dur: 0.12, when: 0.03 });
  }
  stall() {
    for (let i = 0; i < 4; i++) this.burst({ freq: 140 - i * 15, q: 2, gain: 0.4 - i * 0.07, dur: 0.12, when: i * 0.14, buf: this.brown });
  }
  engineOff() { this.burst({ freq: 900, q: 3, gain: 0.12, dur: 0.04 }); }
  shift() {
    this.burst({ freq: 260, q: 2, gain: 0.35, dur: 0.07, buf: this.brown });
    this.burst({ freq: 1800, q: 5, gain: 0.08, dur: 0.03, when: 0.02 });
  }
  grind() {
    this.burst({ freq: 2600, q: 4, gain: 0.3, dur: 0.4 });
    this.tone({ freq: 2100, to: 1700, dur: 0.38, type: "sawtooth", gain: 0.05 });
  }
  handbrake(on) {
    if (on) for (let i = 0; i < 6; i++) this.burst({ freq: 2600 + i * 120, q: 7, gain: 0.18, dur: 0.02, when: i * 0.045 });
    else { this.burst({ freq: 1900, q: 5, gain: 0.15, dur: 0.03 }); this.burst({ freq: 300, q: 2, gain: 0.25, dur: 0.08, when: 0.04, buf: this.brown }); }
  }
  belt(on) {
    this.burst({ freq: 3000, q: 6, gain: 0.25, dur: 0.02 });
    if (on) this.burst({ freq: 2400, q: 6, gain: 0.28, dur: 0.03, when: 0.07 });
  }
  thump(strength = 1) { this.burst({ freq: 110, q: 1.2, gain: 0.5 * strength, dur: 0.16, buf: this.brown }); }

  /* ---------- exam system ---------- */
  penalty() {
    this.tone({ freq: 620, dur: 0.22, type: "square", gain: 0.09 });
    this.tone({ freq: 440, dur: 0.38, type: "square", gain: 0.09, when: 0.24 });
  }
  chime() {
    this.tone({ freq: 660, dur: 0.25, gain: 0.14 });
    this.tone({ freq: 990, dur: 0.45, gain: 0.14, when: 0.16 });
  }
  countdown(go) { this.tone({ freq: go ? 880 : 440, dur: go ? 0.6 : 0.18, type: "square", gain: 0.08 }); }

  /* ---------- recorded Uzbek voice prompts (public/audio/uz/<id>.mp3) ---------- */
  clip(id) {
    if (!this.clips) this.clips = new Map();
    if (!this.clips.has(id)) {
      this.clips.set(id, fetch(`audio/uz/${id}.mp3`)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(b => this.ctx.decodeAudioData(b)));
    }
    return this.clips.get(id);
  }
  preload(ids) { if (this.ctx) ids.forEach(id => this.clip(id).catch(() => {})); }
  // Speak a prompt; non-urgent prompts queue behind the current one, urgent ones cut in.
  // opts.pan places the voice left/right; opts.talk marks it as the instructor speaking.
  prompt(id, fallbackText, urgent = false, opts = {}) {
    if (!this.voiceOn || this.muted || !this.ctx) return;
    this.clip(id).then(buf => {
      const c = this.ctx, now = c.currentTime;
      if (urgent && this.cur) { try { this.cur.stop(); } catch (_) {} this.busyUntil = now; }
      const at = Math.max(now, this.busyUntil || 0);
      if (at - now > 5) return;                         // do not pile up stale prompts
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = buf; g.gain.value = 1.1;
      src.connect(g);
      if (opts.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = opts.pan; g.connect(p); p.connect(this.master); }
      else g.connect(this.master);
      src.start(at);
      this.cur = src; this.busyUntil = at + buf.duration + 0.15;
      if (opts.talk) { this.talkFrom = at; this.talkUntil = at + buf.duration; }
    }).catch(() => {
      if (!fallbackText) return;
      this.say(fallbackText, urgent);
      if (opts.talk) this.talkSpeech = performance.now() + 600 + fallbackText.length * 70;
    });
  }

  // a music file (e.g. a song) played once from `from` seconds; returns { stop(fade) }
  song(url, from = 0, onEnd) {
    let src = null, g = null, stopped = false;
    if (this.ctx) {
      this.songs = this.songs || new Map();
      if (!this.songs.has(url)) this.songs.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(b => this.ctx.decodeAudioData(b)));
      this.songs.get(url).then(buf => {
        if (stopped) return;
        const c = this.ctx;
        src = c.createBufferSource(); g = c.createGain(); g.gain.value = 1.0;
        src.buffer = buf; src.connect(g); g.connect(this.master);
        src.onended = () => { if (!stopped && onEnd) onEnd(); };
        src.start(0, Math.min(from, buf.duration - 0.1));
      }).catch(e => console.warn("song not loaded:", e.message));
    }
    return {
      stop: (fade = 0.6) => {
        stopped = true;
        if (!src) return;
        const t = this.ctx.currentTime;
        g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade);
        try { src.stop(t + fade + 0.05); } catch (_) {}
      }
    };
  }

  // the "pssh" of the turbo bypass valve when the throttle snaps shut
  blowOff() {
    const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime;
    src.buffer = this.white; f.type = "bandpass"; f.frequency.value = 2600; f.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.4);
    this.boost = 0;
  }

  talking() {
    const c = this.ctx;
    if (c && c.currentTime >= (this.talkFrom ?? 0) && c.currentTime < (this.talkUntil ?? 0)) return true;
    return !!(this.talkSpeech && performance.now() < this.talkSpeech);
  }

  /* ---------- browser speech (fallback only) ---------- */
  pickVoice() {
    if (!window.speechSynthesis) return;
    const vs = speechSynthesis.getVoices();
    // Uzbek if installed; otherwise Turkish reads Uzbek Latin text most naturally
    this.voice = vs.find(v => /^uz/i.test(v.lang)) || vs.find(v => /^tr/i.test(v.lang)) || vs.find(v => /^kk|^ky|^az/i.test(v.lang)) || null;
  }
  say(text, urgent = false) {
    if (!this.voiceOn || this.muted || !window.speechSynthesis) return;
    const now = performance.now();
    if (!urgent && now - this.lastSay < 700) return;
    this.lastSay = now;
    if (urgent) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = "uz-UZ";
    u.rate = 1.0; u.volume = 0.9;
    speechSynthesis.speak(u);
  }

  /* ---------- ambience ---------- */
  ambience() {
    const chirp = () => {
      if (this.ctx && !this.muted && Math.random() < 0.7) {
        const f = 2600 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone({ freq: f, to: f * (1.15 + Math.random() * 0.3), dur: 0.09, gain: 0.018, when: i * 0.13 });
      }
      this.ambT = setTimeout(chirp, 3000 + Math.random() * 7000);
    };
    chirp();
  }

  /* ---------- per-frame ---------- */
  update(car, env, now) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = car.rpm, thr = car.throttle, on = car.engineOn;
    const f = Math.max(6, rpm / 30);                       // 4-cylinder firing frequency
    this.eng.frequency.setTargetAtTime(f, t, 0.02);
    this.eng2.frequency.setTargetAtTime(f * 2.004, t, 0.02);
    this.sub.frequency.setTargetAtTime(f / 2, t, 0.02);
    const P = this.profile;
    this.engFilter.frequency.setTargetAtTime(clamp(P.filter[0] + thr * P.filter[1] + rpm * 0.3, 60, 12000), t, 0.04);
    const load = on ? 0.16 + thr * 0.16 + clamp(rpm / 6500, 0, 1) * 0.08 : (rpm > 50 ? 0.08 * rpm / 800 : 0);
    this.engGain.gain.setTargetAtTime(load * P.gain, t, 0.05);
    const ex = on ? 0.05 + thr * 0.11 : 0;
    this.exGain.gain.setTargetAtTime(ex, t, 0.06); this.exDepth.gain.setTargetAtTime(ex * 0.8, t, 0.06);
    this.exPulse.frequency.setTargetAtTime(f, t, 0.02);
    this.exFilter.frequency.setTargetAtTime(150 + rpm * 0.06 + thr * 260, t, 0.05);
    this.wobble.frequency.setTargetAtTime(Math.max(2, rpm / 120), t, 0.05);
    this.wobDepth.gain.setTargetAtTime(on ? load * 0.18 * Math.max(0, 1 - rpm / 2500) : 0, t, 0.1);
    // boost builds with throttle above ~1800 rpm; the whistle follows it
    const boost = P.turbo && on ? clamp(thr * (rpm - 1800) / 2500, 0, 1) : 0;
    this.boost = (this.boost || 0) + (boost - (this.boost || 0)) * 0.08;
    this.whistle.frequency.setTargetAtTime(2400 + this.boost * 3800, t, 0.05);
    this.whistleGain.gain.setTargetAtTime(this.boost * 0.012, t, 0.06);
    if (P.turbo && this.lastThr > 0.5 && thr < 0.15 && this.boost > 0.4) this.blowOff();
    this.lastThr = thr;
    this.intake.g.gain.setTargetAtTime(on ? thr * clamp(rpm / 4000, 0.15, 1) * 0.12 : 0, t, 0.06);
    this.intake.f.frequency.setTargetAtTime(500 + rpm * 0.25, t, 0.06);
    const kmh = car.kmh;
    this.road.g.gain.setTargetAtTime(clamp(kmh / 45, 0, 1) * 0.16, t, 0.1);
    this.wind.g.gain.setTargetAtTime(clamp((kmh / 60) ** 2, 0, 1) * 0.08, t, 0.15);
    const skid = car.brake > 0.75 && Math.abs(car.v) > 3.5 ? 0.035 : 0;
    this.squealGain.gain.setTargetAtTime(skid, t, 0.04);
    this.squeal.frequency.setTargetAtTime(950 + Math.sin(now / 37) * 60, t, 0.02);

    const blink = Math.floor(now / 380) % 2 === 0;
    if ((car.sig || car.hazard) && blink !== this.lastBlink) this.click(blink);
    this.lastBlink = blink;
    const beep = env.alarm && Math.floor(now / 230) % 2 === 0;
    this.beepGain.gain.setTargetAtTime(beep ? 0.07 : 0, t, 0.01);
  }
}
