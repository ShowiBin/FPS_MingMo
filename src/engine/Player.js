// 玩家第一人称控制器：移动 / 视角 / 武器切换 / 开火 / 近战 / 处决
import * as THREE from "three";
import { FACTIONS } from "../data/history.js";

const EYE = 1.6, EYE_CROUCH = 1.05, GRAV = 22, RADIUS = 0.42;

export class Player {
  constructor(scene, cam, world, fx) {
    this.scene = scene;
    this.cam = cam;
    this.world = world;
    this.fx = fx;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.armor = 0;
    this.alive = true; this.dead = false;
    this.onGround = true;
    this.crouched = false;
    this.stats = { kills: 0, deaths: 0 };
    this.weapons = {};
    this.slot = "primary";
    this.viewmodels = {};
    this.vmRoot = new THREE.Group();
    cam.add(this.vmRoot);
    this.blocking = false;
    this.aiming = false;
    this.fovBase = 75;
    this._lockT = 0;
    this._recoil = 0;
    this._bobT = 0;
    this._prevM = false;
    this._keysPrev = new Set();
    this.execTarget = null;
    this.faction = null;
    this.statsMul = FACTIONS.ming.stats;
  }

  revive(factionKey, spawn) {
    this.faction = FACTIONS[factionKey];
    this.factionKey = factionKey;
    this.statsMul = this.faction.stats;
    this.hp = this.statsMul.maxHp;
    this.armor = this.statsMul.armor;
    this.alive = true; this.dead = false;
    this.pos.copy(spawn);
    this.vel.set(0, 0, 0);
    this.yaw = Math.atan2(spawn.x, spawn.z); // 面向地图中心
    this.pitch = 0;
    this.slot = "primary";
    this._lockT = 0;
    this.blocking = false; this.aiming = false;
  }

  setWeapons(weapons) {
    this.weapons = weapons;
    for (const k of Object.keys(this.viewmodels)) this.vmRoot.remove(this.viewmodels[k]);
    this.viewmodels = {};
    for (const slot of Object.keys(weapons)) {
      const w = weapons[slot];
      if (!w) continue;
      if (w.setFactionMul) w.setFactionMul(this.statsMul);
      const vm = w.buildViewmodel();
      vm.visible = false;
      this.vmRoot.add(vm);
      this.viewmodels[slot] = vm;
    }
    this._applySlotVis();
  }

  currentWeapon() { return this.weapons[this.slot] || null; }

  lock(t) { this._lockT = Math.max(this._lockT, t); }

  _applySlotVis() {
    for (const k of Object.keys(this.viewmodels)) this.viewmodels[k].visible = (k === this.slot);
  }

  _switch(slot) {
    if (!this.weapons[slot]) return;
    if (this.slot === "melee" && this.weapons.melee) this.weapons.melee.setBlock(false);
    this.blocking = false; this.aiming = false;
    this.slot = slot;
    this._applySlotVis();
  }

  update(dt, input, cb) {
    if (!this.alive) { this._deadCam(dt); return; }
    if (this._lockT > 0) this._lockT -= dt;

    // ---- 视角 ----
    const sens = 0.0023;
    this.yaw   -= input.dx * sens;
    this.pitch -= input.dy * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    input.dx = 0; input.dy = 0;

    // ---- 按键 ----
    const k = input.keys;
    const pressed = (name) => { const has = k.has(name); const was = this._keysPrev.has(name); return has && !was; };
    const lockdown = this._lockT > 0;

    if (!lockdown) {
      if (pressed("1") || pressed("digit1")) this._switch("primary");
      if (pressed("2") || pressed("digit2")) this._switch("melee");
      if (pressed("3") || pressed("digit3")) this._switch(this.weapons.secondary && this.weapons.secondary.kind === "bow" ? "secondary" : "melee");
    }

    // ---- 移动 ----
    this.crouched = k.has("c") || k.has("controlleft");
    const sprint = (k.has("shiftleft") || k.has("shift")) && !this.crouched && !this.aiming;
    let speed = 4.6 * this.statsMul.speed;
    if (sprint) speed *= 1.5;
    if (this.crouched) speed *= 0.5;
    if (this.aiming) speed *= 0.6;
    if (this.blocking) speed *= 0.55;

    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const wish = new THREE.Vector3();
    if (!lockdown) {
      if (k.has("w") || k.has("keyw")) wish.add(f);
      if (k.has("s") || k.has("keys")) wish.sub(f);
      if (k.has("d") || k.has("keyd")) wish.add(r);
      if (k.has("a") || k.has("keya")) wish.sub(r);
    }
    this.moving = wish.lengthSq() > 0;
    if (this.moving) wish.normalize().multiplyScalar(speed);
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, dt * 10);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, dt * 10);

    // 跳 / 重力
    if ((k.has(" ") || k.has("space")) && this.onGround && !this.crouched && !lockdown) {
      this.vel.y = 7.2; this.onGround = false;
    }
    this.vel.y -= GRAV * dt;

    // 轴分离碰撞
    const nx = this.pos.clone(); nx.x += this.vel.x * dt;
    if (!this.world.collideSphere(new THREE.Vector3(nx.x, 0.9, nx.z), RADIUS)) this.pos.x = nx.x;
    const nz = this.pos.clone(); nz.z += this.vel.z * dt;
    if (!this.world.collideSphere(new THREE.Vector3(nz.x, 0.9, nz.z), RADIUS)) this.pos.z = nz.z;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.onGround = true; }

    // ---- 武器行为 ----
    const w = this.currentWeapon();
    const mdownNow = input.mdown;
    const mRise = mdownNow && !this._prevM;
    const mFall = !mdownNow && this._prevM;
    this._prevM = mdownNow;

    this.aiming = false;
    if (this.blocking && (!w || w.kind !== "melee")) this.blocking = false;

    if (w && !lockdown) {
      if (w.kind === "gun") {
        this.aiming = input.rdown;
        if (mRise && w.canFire()) {
          const opts = w.fireOpts();
          if (opts) {
            const mul = this.statsMul;
            opts.from = this.cam.getWorldPosition(new THREE.Vector3());
            opts.dir = this.cam.getWorldDirection(new THREE.Vector3());
            let sp = opts.spread / Math.max(0.3, mul.precisionMul);
            if (this.aiming) sp *= 0.55;
            if (this.moving) sp *= 1.35;
            if (this.crouched) sp *= 0.8;
            opts.spread = sp;
            opts.maxDmg = opts.maxDmg * mul.powerMul;
            this._recoil = Math.min(0.5, this._recoil + 0.22);
            this.pitch += 0.028;
            cb.onShoot && cb.onShoot(opts);
            if (w.reloading) cb.onReload && cb.onReload(w.reloadNeed);
          }
        }
        if ((pressed("r") || pressed("keyr")) && !w.loaded && !w.reloading) {
          w.startReload();
          if (w.reloading) cb.onReload && cb.onReload(w.reloadNeed);
        }
      } else if (w.kind === "melee") {
        const wantBlock = input.rdown;
        if (wantBlock !== this.blocking) { this.blocking = wantBlock; w.setBlock(wantBlock); }
        if (mRise && !this.blocking) { if (w.attack("light")) cb.onMeleeSwing && cb.onMeleeSwing(); }
        const p = w.consumePending();
        if (p) this._meleeJudge(w, p.kind, cb);
      } else if (w.kind === "bow") {
        if (mRise) w.beginDraw();
        if (mFall) {
          const opts = w.release();
          if (opts) {
            opts.from = this.cam.getWorldPosition(new THREE.Vector3());
            opts.dir = this.cam.getWorldDirection(new THREE.Vector3());
            opts.maxDmg *= this.statsMul.powerMul;
            cb.onBowShoot && cb.onBowShoot(opts);
          }
        }
      }
    }
    // E：点上交互（安放/拆解）否则近战重击
    if (!lockdown && (pressed("e") || pressed("keye"))) {
      if (this.world.atSite(this.pos)) cb.onContext && cb.onContext();
      else if (w && w.kind === "melee" && !this.blocking) { if (w.attack("heavy")) cb.onMeleeSwing && cb.onMeleeSwing(); }
    }
    // F：处决
    this.execTarget = this._findExecTarget();
    if (!lockdown && (pressed("f") || pressed("keyf")) && this.execTarget) {
      this.lock(0.9);
      cb.onExecute && cb.onExecute(this.execTarget);
    }

    // 所有武器计时
    for (const slot of Object.keys(this.weapons)) this.weapons[slot] && this.weapons[slot].update(dt);

    // ---- 相机与视模 ----
    const eye = this.crouched ? EYE_CROUCH : EYE;
    this._bobT += dt * (this.moving ? (sprint ? 11 : 8) : 2);
    const bobY = Math.sin(this._bobT * 2) * (this.moving ? 0.035 : 0.008);
    this.cam.position.set(this.pos.x, this.pos.y + eye + bobY, this.pos.z);
    // 侧移倾斜（相机 roll）
    const lat = this.vel.x * -Math.cos(this.yaw) + this.vel.z * Math.sin(this.yaw);
    this._roll = (this._roll || 0) + ((-lat * 0.006) - (this._roll || 0)) * Math.min(1, dt * 6);
    this.cam.rotation.set(this.pitch, this.yaw, this._roll, "YXZ");
    if (this._recoil > 0) this._recoil = Math.max(0, this._recoil - dt * 1.8);
    const targetFov = (this.aiming ? 58 : this.fovBase) - (this.fovKick || 0) * 4;
    if (this.fovKick > 0) this.fovKick = Math.max(0, this.fovKick - dt * 5);
    if (Math.abs(this.cam.fov - targetFov) > 0.1) {
      this.cam.fov += (targetFov - this.cam.fov) * Math.min(1, dt * 10);
      this.cam.updateProjectionMatrix();
    }
    // 视模姿态
    const vm = this.viewmodels[this.slot];
    if (vm) {
      const sway = 0.0012;
      vm.position.set(0.26 + Math.sin(this._bobT) * 0.008, -0.24 + bobY * 0.6 - (this.aiming ? -0.09 : 0), -0.45);
      if (w && w.kind === "gun") {
        vm.position.z += this._recoil * 0.16;
        vm.rotation.x = this._recoil * 0.5;
        if (this.aiming) vm.position.set(0, -0.148, -0.3 + this._recoil * 0.12);
      } else if (w && w.kind === "melee") {
        if (w.swingT >= 0) {
          const T = w.swingKind === "heavy" ? w.def.heavyTime : w.def.lightTime;
          const ph = w.swingT / T;
          vm.rotation.x = -1.1 * Math.sin(ph * Math.PI);
          vm.rotation.z = (w.swingKind === "heavy" ? 0.9 : 0.6) * Math.sin(ph * Math.PI);
        } else if (this.blocking) {
          vm.rotation.set(0.4, 0, 1.1);
          vm.position.set(0.05, -0.12, -0.4);
        } else { vm.rotation.set(0.2, 0.15, 0.25); }
      } else if (w && w.kind === "bow") {
        vm.position.set(0.02, -0.16, -0.42);
        vm.rotation.set(0, 0, 0);
        w.tickViewmodel && w.tickViewmodel();
      }
      w.tickViewmodel && w.kind === "gun" && w.tickViewmodel(dt, performance.now() / 1000);
      void sway;
    }

    this._keysPrev = new Set(k);
  }

  _meleeJudge(w, kind, cb) {
    const list = (this.getEnemies && this.getEnemies()) || [];
    const from = this.cam.getWorldPosition(new THREE.Vector3());
    const fwd = this.cam.getWorldDirection(new THREE.Vector3());
    let best = null, bd = w.def.range;
    for (const t of list) {
      if (!t.alive) continue;
      const to = t.position.clone().setY(1.0).sub(from);
      const d = to.length();
      if (d > w.def.range + 0.35) continue;
      to.normalize();
      if (to.dot(fwd) < 0.5) continue;
      if (d < bd + 0.35) { bd = d; best = t; }
    }
    if (best) {
      cb.onMeleeHit && cb.onMeleeHit({
        t: best,
        dmg: w.dmgOf(kind, this.statsMul.meleeBonus),
        dir: fwd.clone(),
        from,
        point: best.position.clone().setY(1.1),
        kind: kind === "heavy" ? "重击" : "轻击",
      });
    }
  }

  _findExecTarget() {
    const list = (this.getEnemies && this.getEnemies()) || [];
    const from = this.pos;
    for (const t of list) {
      if (!t.alive || t.hp > 35) continue;
      if (t.position.distanceTo(from) < 2.3) return t;
    }
    return null;
  }

  _deadCam(dt) {
    this.cam.position.y += (0.4 - this.cam.position.y) * Math.min(1, dt * 2);
  }

  damage(dmg, input) {
    if (!this.alive) return;
    if (this.blocking) dmg *= 0.35;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.65);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.hp -= dmg;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
  }
}
