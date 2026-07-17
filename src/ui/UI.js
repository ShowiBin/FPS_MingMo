// HUD：血条 / 弹药 / 计分板 / 小地图 / 历史见证 / 击杀播报 / 安放进度
import { FACTIONS, WITNESSES } from "../data/history.js";

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      hpBar: $("hpBar"), hpNum: $("hpNum"), armorBar: $("armorBar"), armorNum: $("armorNum"),
      wName: $("wName"), wSub: $("wSub"), ammoCur: $("ammoCur"), ammoMax: $("ammoMax"),
      reloadBar: $("reloadBar"), timer: $("timer"), roundTxt: $("roundTxt"),
      sideAtk: $("sideAtk"), sideDef: $("sideDef"),
      mtBanner: $("mtBanner"), mtRole: $("mtRole"),
      witLine: $("witLine"), witSrc: $("witSrc"),
      killfeed: $("killfeed"), hitmark: $("hitmark"), damage: $("damage"),
      smokeFx: $("smoke-fx"), prompt: $("prompt"), promptTxt: $("promptTxt"),
      plant: $("plant"), plantBar: $("plantBar"), plantLbl: $("plantLbl"),
      crosshair: $("crosshair"), mini: $("mini"), banner: $("banner"),
    };
    this.mctx = this.el.mini.getContext("2d");
    this._witTimer = null;
    this._planting = null;
    this._bannerTimer = null;
  }

  bind(factionKey) {
    const fac = FACTIONS[factionKey];
    this.el.mtBanner.textContent = fac.banner;
    this.el.mtBanner.style.color = fac.color;
    this.refreshScorebar();
  }

  refreshScorebar() {
    const g = this.game;
    const me = FACTIONS[g.factionChoice], op = FACTIONS[g.sides.atk === g.factionChoice ? g.sides.def : g.sides.atk];
    this.el.sideAtk.innerHTML = `<span class="banner" style="color:${me.color};font-size:20px;font-weight:900">${me.banner}</span> ${me.name} <b>${g.scoreMe}</b>`;
    this.el.sideDef.innerHTML = `<b>${g.scoreEnemy}</b> ${op.name} <span class="banner" style="color:${op.color};font-size:20px;font-weight:900">${op.banner}</span>`;
    this.el.roundTxt.textContent = `第 ${g.round} 回合 · ${g.myAttacker ? "攻" : "守"}`;
    this.el.mtRole.textContent = me.name + (g.myAttacker ? " · 进攻" : " · 防守");
  }

  // ---- 历史见证 ----
  setWitness(w) {
    if (!w) return;
    clearTimeout(this._witTimer);
    this.el.witLine.textContent = w.line;
    this.el.witSrc.textContent = w.src || "";
    this.el.witLine.style.opacity = 1;
    this.el.witSrc.style.opacity = 1;
    this._witTimer = setTimeout(() => {
      this.el.witLine.style.opacity = 0;
      this.el.witSrc.style.opacity = 0;
    }, 7000);
  }
  witnessThen(w, delay = 1400) { setTimeout(() => this.setWitness(w), delay); }
  actionLine(text) {
    clearTimeout(this._witTimer);
    this.el.witLine.textContent = text;
    this.el.witSrc.textContent = "";
    this.el.witLine.style.opacity = 1;
    this._witTimer = setTimeout(() => { this.el.witLine.style.opacity = 0; }, 2600);
  }

  // ---- 播报 ----
  killfeed({ atk, vic, kind, own }) {
    const div = document.createElement("div");
    div.className = "kf";
    div.innerHTML = `<span class="${own ? "atkr" : ""}">${atk}</span> [${kind}] <span class="vic">${vic}</span>`;
    this.el.killfeed.prepend(div);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.lastChild.remove();
    setTimeout(() => { div.style.opacity = 0; div.style.transition = "opacity .5s"; }, 4200);
    setTimeout(() => div.remove(), 5000);
  }

  hitmark(on) {
    if (!on) return;
    this.el.hitmark.classList.add("on");
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => this.el.hitmark.classList.remove("on"), 140);
  }

  addDamage() {
    this.el.damage.classList.add("on");
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => this.el.damage.classList.remove("on"), 220);
  }

  smokePuff() {
    this.el.smokeFx.classList.add("on");
    clearTimeout(this._smkT);
    this._smkT = setTimeout(() => this.el.smokeFx.classList.remove("on"), 1200);
  }

  bannerIntro(text, dur = 1600) {
    if (!this.el.banner) return;
    this.el.banner.textContent = text;
    this.el.banner.classList.add("on");
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.el.banner.classList.remove("on"), dur);
  }

  // ---- 安放/拆解进度 ----
  startPlant(label, dur, cb) {
    if (this._planting) return;
    const g = this.game;
    this._planting = {
      t: 0, dur, cb,
      start: g.player.pos.clone(),
    };
    this.el.plantLbl.textContent = label;
    this.el.plant.classList.remove("hidden");
  }
  cancelPlant(msg) {
    if (!this._planting) return;
    this._planting = null;
    this.el.plant.classList.add("hidden");
    if (msg) this.bannerIntro(msg, 1000);
  }
  get isPlanting() { return !!this._planting; }

  // ---- 帧更新 ----
  update(game) {
    const p = game.player;
    // 血甲
    const maxHp = p.statsMul.maxHp;
    this.el.hpBar.style.width = `${(p.hp / maxHp) * 100}%`;
    this.el.hpNum.textContent = Math.ceil(p.hp);
    const maxArmor = Math.max(1, p.statsMul.armor);
    this.el.armorBar.style.width = `${(p.armor / maxArmor) * 100}%`;
    this.el.armorNum.textContent = Math.ceil(p.armor);

    // 武器
    const w = p.currentWeapon();
    if (w) {
      this.el.wName.textContent = w.name;
      this.el.crosshair.classList.toggle("melee", w.kind === "melee");
      if (w.kind === "gun") {
        this.el.wSub.textContent = "HUOCHONG · MATCHLOCK";
        this.el.ammoCur.textContent = w.loaded ? "1" : "0";
        this.el.ammoMax.textContent = "1";
        this.el.reloadBar.style.width = `${w.reloadProgress() * 100}%`;
      } else if (w.kind === "bow") {
        this.el.wSub.textContent = "HORN BOW · 角弓";
        this.el.ammoCur.textContent = w.drawing ? `${Math.round(w.draw * 100)}` : "∞";
        this.el.ammoMax.textContent = "";
        this.el.reloadBar.style.width = `${w.draw * 100}%`;
      } else {
        this.el.wSub.textContent = "COLD STEEL · 白刃";
        this.el.ammoCur.textContent = "—";
        this.el.ammoMax.textContent = "";
        this.el.reloadBar.style.width = w.blocking ? "100%" : "0%";
      }
    }

    // 计时
    const t = Math.max(0, game.timer);
    this.el.timer.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
    this.el.timer.style.color = (game.bombPlanted || t < 20) ? "#ff5544" : "";

    // 安放进度
    if (this._planting) {
      const pl = this._planting;
      pl.t += 1 / 60;
      const moved = p.pos.distanceTo(pl.start) > 1.2;
      if (moved || !p.alive || game.state !== "playing") this.cancelPlant("被打断");
      else if (pl.t >= pl.dur) {
        const cb = pl.cb;
        this._planting = null;
        this.el.plant.classList.add("hidden");
        cb && cb();
      } else this.el.plantBar.style.width = `${(pl.t / pl.dur) * 100}%`;
    }

    // 提示
    this._prompt(game, p, w);

    // 小地图
    this._minimap(game, p);
  }

  _prompt(game, p, w) {
    let txt = "";
    if (!p.alive) txt = "阵 亡 · 观 战 中";
    else if (this._planting) txt = "";
    else if (p.execTarget) txt = `<kbd>F</kbd> 处决残敌`;
    else if (game.world.atSite(p.pos)) {
      if (game.myAttacker && !game.bombPlanted) txt = `<kbd>E</kbd> 安放火药`;
      else if (!game.myAttacker && game.bombPlanted) txt = `<kbd>E</kbd> 拆解火药`;
    }
    if (!txt && w && w.kind === "gun" && !w.loaded && !w.reloading) txt = `<kbd>R</kbd> 装填`;
    if (txt) {
      this.el.promptTxt.innerHTML = txt;
      this.el.prompt.classList.add("on");
    } else this.el.prompt.classList.remove("on");
  }

  _minimap(game, p) {
    const ctx = this.mctx;
    const S = 220, half = S / 2;
    const w2m = (x, z) => [half + x * 1.05, half + z * 1.05];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = "rgba(10,8,6,.9)";
    ctx.fillRect(0, 0, S, S);
    // 中路
    ctx.strokeStyle = "rgba(200,160,90,.25)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(...w2m(-55, 0)); ctx.lineTo(...w2m(55, 0));
    ctx.stroke();
    // 寨门
    ctx.fillStyle = "rgba(200,160,90,.4)";
    ctx.fillRect(half - 4, half - 6, 8, 12);
    // A/B 点
    for (const [site, color, name] of [[game.world.siteA, "#a81818", "A"], [game.world.siteB, "#c8a05a", "B"]]) {
      if (!site) continue;
      const [x, y] = w2m(site.x, site.z);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "bold 11px serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(name, x, y);
      if (game.bombPlanted && game.bombSitePos === site) {
        ctx.fillStyle = `rgba(255,60,30,${0.5 + 0.5 * Math.sin(performance.now() / 150)})`;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    // AI
    for (const c of game.combatants) {
      if (!c.alive) continue;
      const [x, y] = w2m(c.position.x, c.position.z);
      ctx.fillStyle = c.friendly ? "#6fbf6f" : "#d74444";
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    // 玩家箭头
    const [px, py] = w2m(p.pos.x, p.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-p.yaw);
    ctx.fillStyle = "#e9dfc4";
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
