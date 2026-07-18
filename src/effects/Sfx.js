// 程序化音效（WebAudio，无外部资源）
// 分层火铳 / 远铳回响 / 三段装填 / 刀风 / 弓弦 / 鸣金 / 战鼓 / 处决太鼓 / 爆炸 / 环境风
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this._amb = null;
  }
  _ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      // 轻压限，防爆音
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.master.disconnect();
      this.master.connect(comp); comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; return this.muted; }
  _out(vol = 1, delay = 0) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.master);
    return g;
  }
  _noiseBuf(dur) {
    const n = Math.max(1, (this.ctx.sampleRate * dur) | 0);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  _noise(dur, freq, vol, { type = "lowpass", q = 0.8, at = 0, sweepTo = 0 } = {}) {
    this._ensure(); if (this.muted) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf(dur);
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    const t = this.ctx.currentTime + at;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  _tone(freq, dur, vol, { type = "sine", slide = 0, at = 0 } = {}) {
    this._ensure(); if (this.muted) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    const t = this.ctx.currentTime + at;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(18, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---- 火铳：炸裂 + 主体轰鸣 + 低频锤 + 回声尾 ----
  fire() {
    this._noise(0.06, 6000, 0.55, { type: "highpass" });                 // 炸裂
    this._noise(0.42, 1000, 0.95, { sweepTo: 220 });                     // 主体
    this._tone(110, 0.35, 0.55, { type: "triangle", slide: -70 });       // 低频锤
    this._noise(0.5, 420, 0.22, { at: 0.13, sweepTo: 120 });             // 回声
    this._tone(68, 0.5, 0.28, { type: "sine", slide: -30, at: 0.05 });
  }
  farFire(vol = 0.4) {
    this._noise(0.35, 460, 0.3 * vol, { sweepTo: 140 });
    this._tone(80, 0.3, 0.16 * vol, { type: "triangle", slide: -35, at: 0.03 });
    this._noise(0.4, 240, 0.12 * vol, { at: 0.16, sweepTo: 90 });
  }
  // ---- 装填三段：倒药 / 捣实 / 引药 ----
  reload(dur = 7) {
    const s = Math.min(dur, 10);
    this._noise(0.35, 2400, 0.16, { type: "bandpass", q: 1.4, sweepTo: 900, at: 0.1 });       // 倒药
    this._tone(300, 0.08, 0.2, { type: "square", at: 0.12 });
    this._noise(0.12, 700, 0.3, { at: s * 0.45 });                                            // 捣实
    this._tone(140, 0.1, 0.3, { type: "triangle", slide: -40, at: s * 0.45 });
    this._noise(0.2, 3200, 0.14, { type: "highpass", at: s * 0.8 });                          // 引药
    this._tone(620, 0.06, 0.18, { type: "square", at: s * 0.82 });
    this._tone(880, 0.08, 0.16, { type: "square", at: Math.max(0.2, s - 0.15) });             // 完毕
  }
  // ---- 弓 ----
  bow() {
    this._tone(240, 0.14, 0.32, { type: "square", slide: -160 });
    this._noise(0.22, 3600, 0.2, { type: "highpass", sweepTo: 1200, at: 0.02 });
  }
  // ---- 白刃 ----
  melee() {
    this._noise(0.18, 1400, 0.3, { type: "bandpass", q: 2.2, sweepTo: 5200 });
  }
  meleeHit() {
    this._noise(0.1, 640, 0.5);
    this._tone(95, 0.14, 0.42, { type: "triangle", slide: -35 });
    this._noise(0.08, 4000, 0.16, { type: "highpass", at: 0.01 });
  }
  hit() { this._tone(190, 0.09, 0.35, { type: "sawtooth", slide: -70 }); }
  hurt() {
    this._tone(85, 0.28, 0.5, { type: "sawtooth", slide: -40 });
    this._noise(0.22, 380, 0.42);
  }
  // ---- 鸣金（击杀确认）----
  kill() {
    this._tone(1240, 0.5, 0.22, { type: "sine", slide: 260 });
    this._tone(1860, 0.4, 0.1, { type: "sine", at: 0.02 });
  }
  // ---- 处决：太鼓 ----
  execute() {
    this._tone(58, 0.6, 0.85, { type: "sine", slide: -22 });
    this._noise(0.3, 900, 0.5, { sweepTo: 200 });
    this._tone(2400, 0.25, 0.12, { type: "sine", slide: -900, at: 0.05 });
  }
  // ---- 爆炸 ----
  explode() {
    this._noise(1.6, 260, 1.0, { sweepTo: 60 });
    this._tone(48, 1.3, 0.85, { type: "sine", slide: -26 });
    this._noise(0.5, 3000, 0.3, { type: "highpass" });
    for (let i = 0; i < 4; i++) this._noise(0.3, 500, 0.14, { at: 0.25 + i * 0.22, sweepTo: 100 });
  }
  plant()  { for (let i = 0; i < 3; i++) this._tone(660, 0.08, 0.26, { type: "square", at: i * 0.16 }); }
  defuse() { for (let i = 0; i < 3; i++) this._tone(440, 0.08, 0.26, { type: "square", at: i * 0.16 }); }
  // ---- 战鼓（回合开始/结束）----
  round() {
    this._tone(72, 0.35, 0.6, { type: "sine", slide: -30 });
    this._tone(72, 0.35, 0.5, { type: "sine", slide: -30, at: 0.28 });
    this._tone(96, 0.5, 0.6, { type: "sine", slide: -36, at: 0.56 });
    this._noise(0.2, 900, 0.2, { at: 0.56, sweepTo: 300 });
  }
  click() { this._tone(880, 0.045, 0.14, { type: "square" }); }
  headshot() { this._tone(1560, 0.22, 0.25, { type: "sine", slide: 500 }); this._tone(2200, 0.14, 0.12, { at: 0.03 }); }
  streak(n = 2) { const b = 500 + n * 90; this._tone(b, 0.16, 0.3, { type: "triangle", slide: 120 }); this._tone(b * 1.5, 0.2, 0.2, { type: "sine", at: 0.09 }); }
  heartbeat() { this._tone(52, 0.14, 0.5, { type: "sine", slide: -14 }); this._tone(48, 0.12, 0.4, { type: "sine", slide: -12, at: 0.2 }); }

  // ---- 环境：风 + 远处炮声 ----
  startAmbient() {
    this._ensure();
    if (this._amb) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf(4);
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 300; f.Q.value = 0.5;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.03;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this._amb = { src, lfo };
    this._ambTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      if (Math.random() < 0.5) this._noise(0.9, 160, 0.1, { sweepTo: 60 }); // 远炮
    }, 22000);
  }
  stopAmbient() {
    if (!this._amb) return;
    try { this._amb.src.stop(); this._amb.lfo.stop(); } catch (e) { void e; }
    clearInterval(this._ambTimer);
    this._amb = null;
  }
}
