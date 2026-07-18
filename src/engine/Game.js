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
import { setupMobile } from "../ui/Mobile.js";
import { FACTIONS, WEAPONS, WITNESSES, ACTIONS, BATTLES, SHOP } from "../data/history.js";

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
    this.freezeT = 0;
    this._streak = 0;
    this.money = 800;
    this.buyT = 0;
    this.kitDefuse = false;
    this.kitPlant = false;
    this.sfx = new Sfx();
  }

  mount(canvas) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight, true);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvas.parentNode.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cssText = "width:100%;height:100%;display:block;";
    canvas.remove && canvas.remove();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#1a1410");
    this.scene.fog = new THREE.Fog(0x2a1c12, 40, 260);

    this.cam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 800);
    this.cam.position.set(0, 1.6, 0);
    this.scene.add(this.cam); // 视模挂在相机上，必须入场景

    this.scene.add(new THREE.AmbientLight(0xffd9b3, 0.22));
    const sun = new THREE.DirectionalLight(0xffb070, 1.5);
    sun.position.set(60, 80, -30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
    sun.shadow.camera.far = 260;
    sun.shadow.bias = -0.002;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x5a6f9a, 0x3a2a18, 0.5));

    this.world = new World(this.scene);
    this.combatants = [];
    this.fx = new Effects(this.scene);
    this.smoke = new Smoke(this.scene);
    this.player = new Player(this.scene, this.cam, this.world, this.fx);

    bindInput(this.renderer.domElement, Input);
    this.input = Input;
    setupMobile(Input);
    addEventListener("resize", () => {
      this.renderer.setSize(innerWidth, innerHeight, true);
      this.cam.aspect = innerWidth / innerHeight;
      this.cam.updateProjectionMatrix();
    });
    addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (k === "m") {
        const muted = this.sfx.toggle();
        this.hud && this.hud.bannerIntro(muted ? "静 音" : "开 声", 700);
      }
      if (this.state !== "playing") return;
      if (k === "b") {
        if (this.buyT > 0 || this.shopOpen) this.toggleShop(!this.shopOpen);
        else this.hud.bannerIntro("已非购置时辰", 700);
      }
      if (k === "escape" && this.shopOpen) this.toggleShop(false);
      if (this.shopOpen && /^[1-9]$/.test(k)) this.buyItem(parseInt(k, 10) - 1);
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
    this.money = 800;
    this.sides = { atk: factionKey, def: opponentOf(factionKey) };
    this.startRound(true);
    this.state = "playing";
    document.getElementById("hud").classList.remove("hidden");
    this.hud.bind(factionKey);
    this.sfx.startAmbient();
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
    this.freezeT = 0;
    this._streak = 0;
    this.buyT = 12; // 购置时辰
    this.shopOpen = false;
    Input.shopOpen = false;
    this.hud.toggleShop(false);

    this.hud.refreshScorebar();
    this.hud.bannerIntro(`第 ${this.round} 回合 · ${this.myAttacker ? "攻" : "守"}`);
    this.sfx.round();
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
    requestAnimationFrame(this.loop); // 先排下一帧，任何异常都不会卡死整局
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;

    try {
      if (this.state === "playing") {
        // 击杀顿帧
        let dtEff = dt;
        if (this.freezeT > 0) { this.freezeT -= dt; dtEff = this.freezeT > 0 ? 0 : dt; }

        this.player.update(dtEff, this.input, {
          onShoot: (o) => this.onPlayerShoot(o),
          onMeleeHit: (e) => this.onPlayerMelee(e),
          onMeleeSwing: () => this.sfx.melee(),
          onBowShoot: (o) => this.onPlayerBow(o),
          onContext: () => this.onContext(),
          onExecute: (t) => this.tryExecute(t),
          onReload: (d) => this.sfx.reload(d),
        });

        for (const c of this.combatants) c.update(dtEff, this);

        this.smoke.update(dtEff);
        this.fx.update(dtEff);
        this.world.update(dtEff);

        // 购置时辰
        if (this.buyT > 0) {
          this.buyT -= dtEff;
          if (this.buyT <= 0 && this.shopOpen) this.toggleShop(false);
        }

        // 震屏（在玩家写完相机后叠加）
        const sh = this.fx.consumeShake(dt);
        if (sh > 0.005) {
          this.cam.rotation.x += (Math.random() - 0.5) * sh * 0.05;
          this.cam.rotation.z += (Math.random() - 0.5) * sh * 0.05;
        }

        this.timer -= dtEff;
        this.checkRoundEnd();
        this.hud.update(this);
      }
      this.renderer.render(this.scene, this.cam);
    } catch (err) {
      console.error("[loop]", err);
    }
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
    ray.camera = this.cam;
    let hit = null, dist = opts.range;
    for (const t of this.combatants) {
      if (!t.alive || t.friendly) continue;
      const ix = t.intersectsRay(ray);
      if (ix && ix.distance < dist) { dist = ix.distance; hit = { t, point: ix.point, object: ix.object }; }
    }
    const wallHit = this.world.raycastWalls(ray, opts.range);
    if (wallHit && (!hit || wallHit.distance < dist)) hit = null;

    this.fx.muzzleFlash(from, dir, opts.power);
    this.smoke.at(from, dir, opts.smokeL);
    this.fx.tracer(from.clone().addScaledVector(dir, 1.1), hit ? hit.point : (wallHit ? wallHit.point : from.clone().addScaledVector(dir, opts.range)));
    if (!hit && wallHit) this.fx.impact(wallHit.point);
    this.hud.smokePuff();
    this.sfx.fire();
    this.player.fovKick = 1;
    if (Math.random() < 0.3) this.hud.actionLine(random(ACTIONS.fire));

    if (hit) {
      const isHead = hit.object === hit.t._head;
      const dmg = opts.maxDmg * falloff(dist, opts.range) * (isHead ? 1.6 : 1);
      const killed = hit.t.damage(dmg, dir, from);
      this.fx.splat(hit.point, dmg);
      this.fx.dmgNumber(hit.point, dmg, isHead);
      this.hud.hitmark(true, isHead);
      if (isHead) this.sfx.headshot();
      if (killed) {
        this._onKill();
        this.hud.killfeed({ atk: "我", vic: hit.t.factionName, kind: isHead ? "铳·首" : "铳", own: true });
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
    ray.camera = this.cam;
    let hit = null, dist = o.range;
    for (const t of this.combatants) {
      if (!t.alive || t.friendly) continue;
      const ix = t.intersectsRay(ray);
      if (ix && ix.distance < dist) { dist = ix.distance; hit = { t, point: ix.point, object: ix.object }; }
    }
    const wallHit = this.world.raycastWalls(ray, o.range);
    if (wallHit && (!hit || wallHit.distance < dist)) hit = null;
    this.sfx.bow();
    if (hit) {
      const isHead = hit.object === hit.t._head;
      const dmg = o.maxDmg * falloff(dist, o.range) * (isHead ? 1.6 : 1);
      const killed = hit.t.damage(dmg, dir, o.from);
      this.fx.splat(hit.point, dmg);
      this.fx.dmgNumber(hit.point, dmg, isHead);
      this.hud.hitmark(true, isHead);
      if (isHead) this.sfx.headshot();
      if (killed) {
        this._onKill();
        this.hud.killfeed({ atk: "我", vic: hit.t.factionName, kind: "弓", own: true });
      }
    }
  }

  onPlayerMelee(hit) {
    if (!hit || !hit.t) return;
    this.sfx.meleeHit();
    const killed = hit.t.damage(hit.dmg, hit.dir, hit.from);
    this.fx.splat(hit.point, hit.dmg);
    this.fx.dmgNumber(hit.point, hit.dmg, false);
    this.hud.hitmark(true);
    if (killed) {
      this._onKill();
      this.hud.killfeed({ atk: "我", vic: hit.t.factionName, kind: hit.kind, own: true });
      if (Math.random() < 0.5) this.hud.actionLine(random(ACTIONS.melee));
    }
  }

  _onKill() {
    this.player.stats.kills++;
    this.sfx.kill();
    this.freezeT = 0.055; // 击杀顿帧
    this.money += 250;
    this.hud.reward("+250");
    const now = performance.now();
    if (now - (this._lastKillT || 0) < 4200) this._streak = (this._streak || 0) + 1;
    else this._streak = 1;
    this._lastKillT = now;
    if (this._streak >= 2) {
      const names = ["", "", "双", "三", "四", "五", "六"];
      this.hud.bannerIntro(`${names[Math.min(6, this._streak)]} 连 杀`, 900);
      this.sfx.streak(this._streak);
    }
  }

  // ----- 军需铺 -----
  shopList() { return SHOP.filter(it => !it.qing || this.factionChoice === "qing"); }

  toggleShop(open) {
    this.shopOpen = open;
    Input.shopOpen = open;
    this.hud.toggleShop(open);
  }

  buyItem(idx) {
    const it = this.shopList()[idx];
    if (!it) return;
    if (this.money < it.price) { this.hud.bannerIntro("饷银不足", 700); return; }
    this.money -= it.price;
    this.sfx.click();
    if (it.kind === "weapon") {
      const def = WEAPONS[it.key];
      const w = makeWeapon(it.key, this.scene, this.fx, this.world);
      if (w && w.setFactionMul) w.setFactionMul(this.player.statsMul);
      this.weapons[it.slot] = w;
      this.player.setWeapons(this.weapons);
      this.hud.bannerIntro(`购得 ${it.name}`, 800);
    } else if (it.kind === "armor") {
      this.player.armor = Math.min(100, this.player.armor + it.armor);
      this.hud.bannerIntro(`披挂 ${it.name}`, 800);
    } else if (it.kind === "kit") {
      if (it.kit === "defuse") this.kitDefuse = true;
      if (it.kit === "plant") this.kitPlant = true;
      this.hud.bannerIntro(`置办 ${it.name}`, 800);
    }
    this.hud.refreshShop();
  }

  onContext() {
    if (this.hud.isPlanting) return;
    if (this.myAttacker && !this.bombPlanted && this.world.atSite(this.player.pos)) {
      const siteName = this.world.atSiteName(this.player.pos);
      const sitePos = this.world.atSiteName(this.player.pos).startsWith("A") ? this.world.siteA : this.world.siteB;
      this.hud.startPlant(`安放火药 · ${siteName}`, this.kitPlant ? 3 : 5, () => {
        this.bombPlanted = true;
        this.bombSite = siteName;
        this.bombSitePos = sitePos;
        this.timer = BOMB_TIME;
        this.money += 300;
        this.hud.reward("+300 埋药");
        this.sfx.plant();
        this.hud.bannerIntro("火药已埋！");
        this.hud.actionLine(random(ACTIONS.plant));
        this.hud.refreshScorebar();
      });
    } else if (!this.myAttacker && this.bombPlanted && this.world.atSite(this.player.pos)) {
      this.hud.startPlant("拆解火药", this.kitDefuse ? 2.5 : 5, () => {
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
    this._onKill();
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
    if (this.shopOpen) this.toggleShop(false);
    if (meWon) this.scoreMe++; else this.scoreEnemy++;
    const award = meWon ? 1200 : 700;
    this.money += award;
    this.hud.reward(`${meWon ? "胜局" : "败局"} +${award}`);
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
    // 伤害方向指示
    if (srcPos) {
      const p = this.player;
      const dx = srcPos.x - p.pos.x, dz = srcPos.z - p.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      const f = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
      const r = { x: -f.z, z: f.x };
      const rel = Math.atan2((dx / l) * r.x + (dz / l) * r.z, (dx / l) * f.x + (dz / l) * f.z);
      this.hud.showDamageDir(rel);
    }
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
