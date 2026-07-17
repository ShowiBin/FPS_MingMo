// 游戏主类：场景、渲染循环、输入、回合状态机
import * as THREE from "three";
import { World } from "../engine/Map.js";
import { Player } from "../engine/Player.js";
import { AI, falloff } from "../engine/AI.js";
import { Huochong } from "../weapons/Huochong.js";
import { Melee } from "../weapons/Melee.js";
import { Bow } from "../weapons/Bow.js";
import { Smoke } from "../effects/Smoke.js";
import { Effects } from "../effects/Effects.js";
import { Sfx } from "../effects/Sfx.js";
import { HUD } from "../ui/UI.js";
import { FACTIONS, WEAPONS, WITNESSES, ACTIONS, BATTLES } from "../data/history.js";

const MAX_ROUNDS = 7; // 先达 4 胜者赢
const ROUND_TIME = 90;
const BOMB_TIME = 40;

const Input = {
  keys: new Set(),
  mdown: false, rdown: false,
  px: 0, py: 0, dx: 0, dy: 0,
  locked: false
};

export class Game {
  constructor() {
    this.scoreMe = 0; this.scoreEnemy = 0;
    this.round = 1;
    this.sides = { atk: "ming", def: "qing" };
    this.factionChoice = null;
    this.timer = ROUND_TIME;
    this.state = "menu"; // menu/playing/between/result
    this.last = performance.now();
    this._roundState = null;
    this.sfx = new Sfx();
  }

  mount(canvas) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight, true);
    canvas.parentNode.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cssText = "width:100%;height:100%;display:block;";
    canvas.remove && canvas.remove();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0a0806");
    this.scene.fog = new THREE.Fog(0x14100a, 30, 240);

    this.cam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 800);
    this.cam.position.set(0, 1.6, 0);
    this.scene.add(this.cam); // 视模挂在相机上，必须入场景

    this.scene.add(new THREE.AmbientLight(0xffd9b3, 0.25));
    const sun = new THREE.DirectionalLight(0xffc188, 1.1);
    sun.position.set(50, 90, -20);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x6688aa, 0x352616, 0.45));

    this.world = new World(this.scene);
    this.combatants = [];
    this.fx = new Effects(this.scene);
    this.smoke = new Smoke(this.scene);
    this.player = new Player(this.scene, this.cam, this.world, this.fx);

    bindInput(this.renderer.domElement, Input);
    this.input = Input;
    addEventListener("resize", () => {
      this.renderer.setSize(innerWidth, innerHeight, true);
      this.cam.aspect = innerWidth / innerHeight;
      this.cam.updateProjectionMatrix();
    });
    addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "m") {
        const muted = this.sfx.toggle();
        this.hud && this.hud.bannerIntro(muted ? "静 音" : "开 声", 700);
      }
    });

    this.hud = new HUD(this);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ----- 选阵营 -> 开战 -----
  startGame(factionKey) {
    this.factionChoice = factionKey;
    this.scoreMe = 0; this.scoreEnemy = 0; this.round = 1;
    this.player.stats = { kills: 0, deaths: 0 };
    this.sides = { atk: factionKey, def: opponentOf(factionKey) };
    this.startRound(true);
    this.state = "playing";
    document.getElementById("hud").classList.remove("hidden");
    this.hud.bind(factionKey);
  }

  startRound(firstTime = false) {
    this.combatants.forEach(c => c.dispose && c.dispose());
    this.combatants = [];
    this.fx.reset();
    this.smoke.reset();
    this.hud.cancelPlant();
    this.world.resetSites();

    const playerSide = this.factionChoice;
    const oppSide = opponentOf(playerSide);
    this.myAttacker = (playerSide === this.sides.atk);

    // 玩家
    this.spawnPlayer(playerSide);
    this.player.getEnemies = () => this.combatants.filter(c => c.alive && !c.friendly);

    // AI：敌 4 / 友 3
    for (let i = 0; i < 4; i++) this.spawnAI(oppSide, false, i);
    for (let i = 0; i < 3; i++) this.spawnAI(playerSide, true, i);

    this.bombPlanted = false;
    this.bombDefused = false;
    this.bombSite = null;
    this.bombSitePos = null;
    this.timer = ROUND_TIME;
    this._roundState = null;

    this.hud.refreshScorebar();
    this.hud.bannerIntro(`第 ${this.round} 回合 · ${this.myAttacker ? "攻" : "守"}`);
    // 历史见证：先战役时间线，后随机语录
    if (this.round <= BATTLES.length) {
      const b = BATTLES[this.round - 1];
      this.hud.witnessThen({ line: `${b.t} · ${b.n} — ${b.d}`, src: "—— 战 史" }, 1800);
    } else {
      this.hud.witnessThen(random(WITNESSES), 1800);
    }
    void firstTime;
  }

  spawnPlayer(factionKey) {
    const fac = FACTIONS[factionKey];
    const wp = this.world.spawnPoint(factionKey);
    this.player.revive(factionKey, wp);
    this.weapons = {};
    for (const slot of ["primary", "secondary", "melee"]) {
      const key = fac.weapons[slot];
      if (key && WEAPONS[key]) this.weapons[slot] = makeWeapon(key, this.scene, this.fx, this.world);
    }
    this.player.setWeapons(this.weapons);
  }

  spawnAI(factionKey, friendly = false, idx = 0) {
    const wp = this.world.spawnPoint(factionKey, true);
    const ai = new AI(this.scene, this.world, this.fx, factionKey, this.player, friendly);
    const isAtk = factionKey === this.sides.atk;
    ai.place(wp, this.routeFor(factionKey, idx, isAtk));
    this.combatants.push(ai);
  }

  routeFor(factionKey, idx, isAtk) {
    const spawn = this.world.spawnPoint(factionKey);
    const A = this.world.siteA, B = this.world.siteB;
    const pickA = isAtk ? (Math.random() < 0.5) : (idx % 2 === 0);
    const site = (pickA ? A : B) || A;
    const pts = [];
    if (Math.sign(spawn.x) !== Math.sign(site.x)) pts.push(new THREE.Vector3(0, 0, 0));
    if (site === A) pts.push(new THREE.Vector3(A.x - 8.5, 0, A.z));
    else pts.push(new THREE.Vector3(B.x, 0, B.z - 9.5));
    pts.push(site.clone());
    return pts;
  }

  // ----- 主循环 -----
  loop(now) {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;

    if (this.state === "playing") {
      this.player.update(dt, this.input, {
        onShoot: (o) => this.onPlayerShoot(o),
        onMeleeHit: (e) => this.onPlayerMelee(e),
        onMeleeSwing: () => this.sfx.melee(),
        onBowShoot: (o) => this.onPlayerBow(o),
        onContext: () => this.onContext(),
        onExecute: (t) => this.tryExecute(t),
      });

      for (const c of this.combatants) c.update(dt, this);

      this.smoke.update(dt);
      this.fx.update(dt);

      // 震屏（在玩家写完相机后叠加）
      const sh = this.fx.consumeShake(dt);
      if (sh > 0.005) {
        this.cam.rotation.x += (Math.random() - 0.5) * sh * 0.05;
        this.cam.rotation.z += (Math.random() - 0.5) * sh * 0.05;
      }

      this.timer -= dt;
      this.checkRoundEnd();
      this.hud.update(this);
    }
    this.renderer.render(this.scene, this.cam);
    requestAnimationFrame(this.loop);
  }

  // ----- 玩家行为回调 -----
  onPlayerShoot(opts) {
    const dir = opts.dir.clone();
    dir.x += (Math.random() - 0.5) * opts.spread * 2;
    dir.y += (Math.random() - 0.5) * opts.spread * 2;
    dir.z += (Math.random() - 0.5) * opts.spread * 2.4;
    dir.normalize();

    const from = opts.from.clone();
    const ray = new THREE.Raycaster(from, dir, 0.5, opts.range);
    let hit = null, dist = opts.range;
    for (const t of this.combatants) {
      if (!t.alive || t.friendly) continue;
      const ix = t.intersectsRay(ray);
      if (ix && ix.distance < dist) { dist = ix.distance; hit = { t, point: ix.point }; }
    }
    const wallHit = this.world.raycastWalls(ray, opts.range);
    if (wallHit && (!hit || wallHit.distance < dist)) hit = null;

    this.fx.muzzleFlash(from, dir, opts.power);
    this.smoke.at(from, dir, opts.smokeL);
    this.hud.smokePuff();
    this.sfx.fire();
    if (Math.random() < 0.3) this.hud.actionLine(random(ACTIONS.fire));

    if (hit) {
      const dmg = opts.maxDmg * falloff(dist, opts.range);
      const killed = hit.t.damage(dmg, dir, from);
      this.fx.splat(hit.point, dmg);
      this.hud.hitmark(true);
      if (killed) {
        this.player.stats.kills++;
        this.hud.killfeed({ atk: "我", vic: hit.t.factionName, kind: "铳", own: true });
        if (Math.random() < 0.4) this.hud.actionLine(random(ACTIONS.kill));
      }
    }
  }

  onPlayerBow(o) {
    const dir = o.dir.clone();
    dir.x += (Math.random() - 0.5) * o.spread;
    dir.y += (Math.random() - 0.5) * o.spread;
    dir.normalize();
    const ray = new THREE.Raycaster(o.from, dir, 0.5, o.range);
    let hit = null, dist = o.range;
    for (const t of this.combatants) {
      if (!t.alive || t.friendly) continue;
      const ix = t.intersectsRay(ray);
      if (ix && ix.distance < dist) { dist = ix.distance; hit = { t, point: ix.point }; }
    }
    const wallHit = this.world.raycastWalls(ray, o.range);
    if (wallHit && (!hit || wallHit.distance < dist)) hit = null;
    this.sfx.bow();
    if (hit) {
      const dmg = o.maxDmg * falloff(dist, o.range);
      const killed = hit.t.damage(dmg, dir, o.from);
      this.fx.splat(hit.point, dmg);
      this.hud.hitmark(true);
      if (killed) {
        this.player.stats.kills++;
        this.hud.killfeed({ atk: "我", vic: hit.t.factionName, kind: "弓", own: true });
      }
    }
  }

  onPlayerMelee(hit) {
    if (!hit || !hit.t) return;
    this.sfx.meleeHit();
    const killed = hit.t.damage(hit.dmg, hit.dir, hit.from);
    this.fx.splat(hit.point, hit.dmg);
    this.hud.hitmark(true);
    if (killed) {
      this.player.stats.kills++;
      this.hud.killfeed({ atk: "我", vic: hit.t.factionName, kind: hit.kind, own: true });
      if (Math.random() < 0.5) this.hud.actionLine(random(ACTIONS.melee));
    }
  }

  onContext() {
    if (this.hud.isPlanting) return;
    if (this.myAttacker && !this.bombPlanted && this.world.atSite(this.player.pos)) {
      const siteName = this.world.atSiteName(this.player.pos);
      const sitePos = this.world.atSiteName(this.player.pos).startsWith("A") ? this.world.siteA : this.world.siteB;
      this.hud.startPlant(`安放火药 · ${siteName}`, 5.0, () => {
        this.bombPlanted = true;
        this.bombSite = siteName;
        this.bombSitePos = sitePos;
        this.timer = BOMB_TIME;
        this.sfx.plant();
        this.hud.bannerIntro("火药已埋！");
        this.hud.actionLine(random(ACTIONS.plant));
        this.hud.refreshScorebar();
      });
    } else if (!this.myAttacker && this.bombPlanted && this.world.atSite(this.player.pos)) {
      this.hud.startPlant("拆解火药", 5.0, () => {
        this.bombDefused = true;
        this.sfx.defuse();
        this.hud.actionLine(random(ACTIONS.defuse));
        this.endRound(true);
      });
    }
  }

  tryExecute(tgt) {
    if (!tgt || !tgt.alive || tgt.hp > 35) return;
    tgt.damage(999, this.cam.getWorldDirection(new THREE.Vector3()), this.cam.position.clone());
    this.fx.splat(tgt.position.clone().setY(1.1), 60);
    this.player.stats.kills++;
    this.sfx.execute();
    this.hud.killfeed({ atk: "我", vic: tgt.factionName, kind: "处决", own: true });
    this.hud.actionLine(random(ACTIONS.execute));
    this.hud.witnessThen(random(WITNESSES), 3000);
  }

  // ----- AI 安放 / 拆解 -----
  aiPlant(ai) {
    if (this.bombPlanted || this._roundState) return;
    this.bombPlanted = true;
    this.bombSite = this.world.atSiteName(ai.position);
    this.bombSitePos = this.bombSite.startsWith("A") ? this.world.siteA : this.world.siteB;
    this.timer = BOMB_TIME;
    this.sfx.plant();
    this.hud.bannerIntro(this.myAttacker ? "火药已埋！" : "敌军已安放火药！");
    this.hud.actionLine(random(ACTIONS.plant));
  }

  aiDefuse(ai) {
    if (!this.bombPlanted || this.bombDefused || this._roundState) return;
    this.bombDefused = true;
    this.sfx.defuse();
    this.hud.bannerIntro("火药已拆解");
    const meWon = !this.myAttacker; // 防守方（我或友军）拆解成功
    this.endRound(meWon);
  }

  checkRoundEnd() {
    if (this._roundState || this.state !== "playing") return;
    const myAlive = this.player.alive || this.combatants.some(c => c.alive && c.friendly);
    const oppAlive = this.combatants.some(c => c.alive && !c.friendly);

    if (!this.bombPlanted) {
      if (!oppAlive) return this.endRound(this.myAttacker);
      if (!myAlive) return this.endRound(!this.myAttacker);
      if (this.timer <= 0) return this.endRound(!this.myAttacker);
    } else {
      if (this.timer <= 0) {
        // 爆炸！
        this.fx.witnessPlant(this.bombSitePos);
        this.sfx.explode();
        return this.endRound(this.myAttacker);
      }
      if (this.myAttacker) {
        if (!oppAlive) return this.endRound(true);
      } else {
        if (!myAlive) return this.endRound(false);
      }
    }
  }

  endRound(meWon) {
    if (this._roundState) return;
    this._roundState = "ending";
    this.hud.cancelPlant();
    if (meWon) this.scoreMe++; else this.scoreEnemy++;
    this.hud.bannerIntro(meWon ? "回合胜出" : "回合败北", 1800);
    this.hud.refreshScorebar();
    this.sfx.round();
    this.state = "between";

    setTimeout(() => {
      if (this.round >= MAX_ROUNDS || this.scoreMe >= 4 || this.scoreEnemy >= 4) {
        this.showResult();
      } else {
        this.round++;
        const t = this.sides.atk; this.sides.atk = this.sides.def; this.sides.def = t;
        this.startRound();
        this.state = "playing";
      }
    }, 2600);
  }

  showResult() {
    this.state = "result";
    document.getElementById("hud").classList.add("hidden");
    document.exitPointerLock && document.exitPointerLock();
    const win = this.scoreMe > this.scoreEnemy;
    document.getElementById("resultTitle").textContent = win ? "胜　利" : "败　北";
    document.getElementById("resultSub").textContent = win ? "VICTORY" : "DEFEAT";
    document.getElementById("rKill").textContent = this.player.stats.kills;
    document.getElementById("rDead").textContent = this.player.stats.deaths;
    document.getElementById("rRound").textContent = this.scoreMe;
    document.getElementById("result").classList.remove("hidden");
  }

  playerHit(dmg, srcPos, fromFaction, kind = "铳") {
    if (!this.player.alive || this.state !== "playing") return;
    this.player.damage(dmg, this.input);
    this.hud.addDamage();
    this.sfx.hurt();
    this.fx.shake(0.22);
    if (!this.player.alive) {
      this.player.stats.deaths++;
      this.hud.killfeed({ atk: fromFaction.name, vic: "我", kind });
      this.hud.bannerIntro("阵　亡", 1500);
      this.hud.actionLine(random(ACTIONS.death));
    }
  }
}

// ----- Helpers -----
function bindInput(dom, Input) {
  addEventListener("keydown", e => { Input.keys.add(e.code.toLowerCase()); Input.keys.add(e.key.toLowerCase()); });
  addEventListener("keyup", e => { Input.keys.delete(e.code.toLowerCase()); Input.keys.delete(e.key.toLowerCase()); });
  dom.addEventListener("mousedown", e => {
    if (!Input.locked) return;
    if (e.button === 0) Input.mdown = true;
    if (e.button === 2) Input.rdown = true;
  });
  addEventListener("mouseup", e => {
    if (e.button === 0) Input.mdown = false;
    if (e.button === 2) Input.rdown = false;
  });
  dom.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("pointerlockchange", () => {
    Input.locked = (document.pointerLockElement === dom);
  });
  dom.addEventListener("mousemove", e => {
    if (!Input.locked) return;
    Input.dx += e.movementX; Input.dy += e.movementY;
  });
}
function random(arr) { return arr[Math.floor(Math.random() * arr.length)] || arr[0]; }
function makeWeapon(key, scene, fx, world) {
  const def = WEAPONS[key];
  if (!def) return null;
  if (def.kind === "gun") return new Huochong(def, scene, fx, world);
  if (def.kind === "melee") return new Melee(def, scene, fx, world);
  if (def.kind === "bow") return new Bow(def, scene, fx, world);
  return null;
}
function opponentOf(factionKey) {
  const map = { ming: "qing", nong: "ming", qing: "nong" };
  return map[factionKey] || "qing";
}
