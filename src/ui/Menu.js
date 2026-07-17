// 主菜单 / 选营 / 结算 界面逻辑
import { FACTIONS } from "../data/history.js";

const $ = (id) => document.getElementById(id);

export class Menu {
  constructor(game) {
    this.game = game;
    this._buildFactions();
    $("btnPlay").addEventListener("click", () => this.showFaction());
    $("btnRetry").addEventListener("click", () => {
      $("result").classList.add("hidden");
      this._lock();
      game.startGame(game.factionChoice);
    });
    const bm = $("btnMenu");
    bm && bm.addEventListener("click", () => {
      $("result").classList.add("hidden");
      this.showMenu();
    });
    // 战斗中点击画布重新锁定
    document.addEventListener("click", (e) => {
      if (game.state === "playing" && !document.pointerLockElement && e.target.tagName === "CANVAS")
        this._lock();
    });
  }

  _lock() {
    const dom = this.game.renderer && this.game.renderer.domElement;
    if (dom && dom.requestPointerLock) dom.requestPointerLock();
  }

  showMenu() {
    $("menu").classList.remove("hidden");
    $("faction").classList.add("hidden");
  }

  showFaction() {
    $("menu").classList.add("hidden");
    $("faction").classList.remove("hidden");
  }

  _buildFactions() {
    const wrap = $("factionChoices");
    wrap.innerHTML = "";
    const rows = [
      ["速度", (s) => `${Math.round(s.speed * 100)}%`],
      ["生命", (s) => s.maxHp],
      ["护甲", (s) => s.armor],
      ["装填", (s) => `${Math.round(s.reloadMul * 100)}%`],
      ["精度", (s) => `${Math.round(s.precisionMul * 100)}%`],
      ["近战", (s) => `${Math.round(s.meleeBonus * 100)}%`],
    ];
    for (const key of Object.keys(FACTIONS)) {
      const f = FACTIONS[key];
      const div = document.createElement("div");
      div.className = `faction ${key}`;
      div.innerHTML = `
        <div class="banner">${f.banner}</div>
        <h3>${f.name}</h3>
        <div class="era">${f.era}</div>
        <div class="desc">${f.desc}</div>
        <div class="stats">
          ${rows.map(([l, fn]) => `<div class="stat"><span>${l}</span><span>${fn(f.stats)}</span></div>`).join("")}
        </div>
        <div class="desc" style="margin-top:10px;color:${f.color}">${f.perk}</div>
        <div class="pick">择 此 营</div>`;
      div.addEventListener("click", () => {
        $("faction").classList.add("hidden");
        this._lock();
        this.game.startGame(key);
      });
      wrap.appendChild(div);
    }
  }
}
