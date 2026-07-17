// 程序化音效（WebAudio，无外部资源）：火铳/弓/刀/命中/装填/爆炸/安放
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
  }
  _ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  toggle() { this.muted = !this.muted; return this.muted; }
  _out(vol = 1) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.master);
    return g;
  }
  _noise(dur, filterFreq, vol, type = "lowpass", q = 0.8) {
    this._ensure(); if (this.muted) return;
    const n = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq; f.Q.value = q;
    const g = this._out(vol);
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g);
    src.start();
  }
  _tone(freq, dur, vol, type = "sine", slide = 0) {
    this._ensure(); if (this.muted) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this._out(vol);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); o.start(); o.stop(t + dur + 0.02);
  }
  fire()   { this._noise(0.35, 900, 0.9); this._tone(120, 0.3, 0.5, "triangle", -80); }
  farFire(){ this._noise(0.3, 500, 0.25); }
  bow()    { this._tone(300, 0.12, 0.3, "square", -180); this._noise(0.08, 2000, 0.15, "highpass"); }
  melee()  { this._noise(0.16, 3000, 0.3, "bandpass", 2); }
  meleeHit(){ this._noise(0.1, 700, 0.5); this._tone(90, 0.12, 0.4, "triangle", -30); }
  hit()    { this._tone(180, 0.1, 0.4, "sawtooth", -60); }
  hurt()   { this._tone(90, 0.25, 0.5, "sawtooth", -40); this._noise(0.2, 400, 0.4); }
  reload() { this._tone(500, 0.05, 0.2, "square"); this._noise(0.06, 2500, 0.12, "highpass"); }
  explode(){ this._noise(1.4, 300, 1.0); this._tone(60, 1.0, 0.8, "sine", -35); }
  plant()  { this._tone(660, 0.09, 0.3, "square"); }
  defuse() { this._tone(440, 0.09, 0.3, "square"); }
  round()  { this._tone(220, 0.5, 0.35, "triangle", 110); }
  click()  { this._tone(880, 0.04, 0.15, "square"); }
  execute(){ this._noise(0.25, 1200, 0.5); this._tone(70, 0.3, 0.5, "sawtooth", -30); }
}
