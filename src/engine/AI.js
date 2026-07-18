// 敌方/友军 AI：寻点、接敌、火铳射击、近战、安放/拆解火药
import * as THREE from "three";
import { FACTIONS, WEAPONS } from "../data/history.js";

const ENGAGE_RANGE = 55;
const MELEE_RANGE = 2.4;

export class AI {
  constructor(scene, world, fx, factionKey, player, friendly = false) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.factionKey = factionKey;
    this.factionName = FACTIONS[factionKey].name;
    this.player = player;
    this.friendly = friendly;
    this.stats = FACTIONS[factionKey].stats;
    this.hp = this.stats.maxHp;
    this.armor = this.stats.armor;
    this.alive = true; this.dead = false;
    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.gun = WEAPONS[FACTIONS[factionKey].weapons.primary];
    this.meleeDef = WEAPONS[FACTIONS[factionKey].weapons.melee];
    this.loaded = true;
    this.reloadT = 0;
    this.scanT = Math.random() * 0.25;
    this.reactT = 0;
    this.target = null;
    this.meleeCd = 0;
    this.meleeWind = -1;
    this.channelT = 0;      // 安放/拆解进度
    this.channelKind = null;
    this.wpIndex = 0;
    this.route = [];
    this._repath = 0;
    this._buildMesh();
  }

  _buildMesh() {
    const fac = FACTIONS[this.factionKey];
    const col = new THREE.Color(fac.color);
    const g = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: col, roughness: .9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a080, roughness: .8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 1.05, 10), cloth);
    body.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), skin);
    head.position.y = 1.58;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.22, 10),
      new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.6), roughness: .8 }));
    hat.position.y = 1.76;
    g.add(body, head, hat);
    if (this.factionKey === "qing") { // 红缨
      const tassel = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0xaa1111 }));
      tassel.position.y = 1.92; g.add(tassel);
    }
    // 火铳（持于身侧）
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: 0x333338, metalness: .7, roughness: .4 }));
    gun.rotation.x = Math.PI / 2 - 0.15;
    gun.position.set(0.3, 1.15, -0.25);
    g.add(gun);
    // 头顶旗字
    const label = makeLabel(fac.banner, fac.color);
    label.position.y = 2.15;
    g.add(label);
    // 仅实体网格参与弹道检测（Sprite 参与 raycast 会抛异常导致整局卡死）
    this._hits = [body, head, hat];
    this.group = g;
    this._body = body;
    this.scene.add(g);
  }

  place(pos, route) {
    this.position.copy(pos);
    this.route = route;
    this.wpIndex = 0;
    this.group.position.copy(pos);
  }

  intersectsRay(ray) {
    if (!this.alive) return null;
    const hits = ray.intersectObjects(this._hits, false);
    return hits.length ? hits[0] : null;
  }

  // 返回 true 表示被击杀
  damage(dmg, dir, from) {
    if (!this.alive) return false;
    if (this.armor > 0) {
      const ab = Math.min(this.armor, dmg * 0.65);
      this.armor -= ab; dmg -= ab;
    }
    this.hp -= dmg;
    // 受击朝向攻击者
    if (from) this.yaw = Math.atan2(from.x - this.position.x, from.z - this.position.z);
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false; this.dead = true;
      this._die();
      return true;
    }
    return false;
  }

  _die() {
    this.group.rotation.z = Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
    this.group.position.y = 0.3;
    this.group.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.color && o.material.color.multiplyScalar(0.45); } });
  }

  dispose() { this.scene.remove(this.group); }

  _enemies(game) {
    const list = [];
    if (!this.friendly) {
      if (game.player.alive) list.push(game.player);
      for (const c of game.combatants) if (c !== this && c.alive && c.friendly) list.push(c);
    } else {
      for (const c of game.combatants) if (c !== this && c.alive && !c.friendly) list.push(c);
    }
    return list;
  }

  _eyePos() { return this.position.clone().setY(1.55); }
  _targetPos(t) { return t === this.player ? t.pos.clone().setY(1.3) : t.position.clone().setY(1.1); }

  update(dt, game) {
    if (!this.alive) return;
    if (this.meleeCd > 0) this.meleeCd -= dt;

    // ---- 目标扫描 ----
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.25;
      const eye = this._eyePos();
      let best = null, bd = ENGAGE_RANGE;
      for (const e of this._enemies(game)) {
        const tp = this._targetPos(e);
        const d = tp.distanceTo(eye);
        if (d < bd && !this.world.losBlocked(eye, tp)) { bd = d; best = e; }
      }
      if (best && best !== this.target) this.reactT = 0.45 + Math.random() * 0.5;
      this.target = best;
      this.targetDist = bd;
    }

    const isAtk = this.factionKey === game.sides.atk;

    // ---- 近战进行中 ----
    if (this.meleeWind >= 0) {
      this.meleeWind += dt;
      if (this.meleeWind >= 0.35) {
        this.meleeWind = -1;
        if (this.target && this.target.alive && this.targetDist < MELEE_RANGE + 0.6) {
          const dmg = this.meleeDef.dmg * this.stats.meleeBonus * (0.85 + Math.random() * 0.3);
          if (this.target === this.player) game.playerHit(dmg, this.position, FACTIONS[this.factionKey], "刀");
          else {
            const killed = this.target.damage(dmg, null, this.position);
            if (killed) game.hud.killfeed({ atk: this.factionName, vic: this.target.factionName || "我", kind: "刀" });
          }
          game.sfx && game.sfx.meleeHit();
        }
      }
      this._face(dt, 6);
      this._syncMesh();
      return;
    }

    // ---- 战斗 ----
    if (this.target && this.target.alive) {
      this.channelT = 0; this.channelKind = null;
      const tp = this._targetPos(this.target);
      this.yawTo = Math.atan2(tp.x - this.position.x, tp.z - this.position.z);
      this._face(dt, 8);

      if (this.targetDist < MELEE_RANGE && this.meleeCd <= 0) {
        this.meleeWind = 0;
        this.meleeCd = 1.3;
        game.sfx && game.sfx.melee();
      } else if (this.loaded) {
        if (this.reactT > 0) this.reactT -= dt;
        else {
          // 开火
          this.loaded = false;
          this.reloadT = 0;
          const from = this._eyePos();
          const dir = tp.clone().sub(from).normalize();
          const spread = this.gun.spread * 2.2 / Math.max(0.3, this.stats.precisionMul);
          dir.x += (Math.random() - .5) * spread * 2;
          dir.y += (Math.random() - .5) * spread * 1.5;
          dir.z += (Math.random() - .5) * spread * 2;
          dir.normalize();
          this._fireGun(game, from, dir, this.target);
        }
      }
      // 装填
      if (!this.loaded) {
        this.reloadT += dt;
        const need = this.gun.reloadTime / Math.max(0.3, this.stats.reloadMul);
        if (this.reloadT >= need) this.loaded = true;
      }
      // 距离过远则逼近
      if (this.targetDist > 26) this._moveToward(dt, tp, 3.4 * this.stats.speed, game);
      this._syncMesh();
      return;
    }

    // ---- 无目标：执行职责 ----
    if (!this.loaded) {
      this.reloadT += dt;
      const need = this.gun.reloadTime / Math.max(0.3, this.stats.reloadMul);
      if (this.reloadT >= need) this.loaded = true;
    }

    if (isAtk && !game.bombPlanted) {
      // 进攻：奔向包点并安放
      if (this._followRoute(dt, game)) {
        // 已在点上
        this.channelKind = "plant";
        this.channelT += dt;
        if (this.channelT >= 5) { this.channelT = 0; game.aiPlant(this); }
      } else this.channelT = 0;
    } else if (!isAtk && game.bombPlanted && !game.bombDefused) {
      // 防守：回防拆包
      const site = game.bombSitePos;
      if (site) {
        if (this.position.distanceTo(site) < this.world.siteRadius * 0.55) {
          this.channelKind = "defuse";
          this.channelT += dt;
          if (this.channelT >= 4) { this.channelT = 0; game.aiDefuse(this); }
        } else this._moveToward(dt, site, 3.6 * this.stats.speed, game);
      }
    } else {
      // 巡逻/推进
      this._followRoute(dt, game);
    }

    this._syncMesh();
  }

  _face(dt, rate) {
    const want = this.yawTo ?? this.yaw;
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * rate);
  }

  _followRoute(dt, game) {
    if (this.wpIndex >= this.route.length) return true; // 到终点
    const wp = this.route[this.wpIndex];
    if (this.position.distanceTo(wp) < 2.2) { this.wpIndex++; return this.wpIndex >= this.route.length; }
    this._moveToward(dt, wp, 3.8 * this.stats.speed, game);
    return false;
  }

  _moveToward(dt, target, speed, game) {
    const dir = target.clone().sub(this.position); dir.y = 0;
    if (dir.lengthSq() < 0.01) return;
    dir.normalize();
    this.yawTo = Math.atan2(dir.x, dir.z);
    this._face(dt, 6);
    const step = speed * dt;
    const tryAngles = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9];
    for (const a of tryAngles) {
      const c = Math.cos(a), s = Math.sin(a);
      const dx = dir.x * c - dir.z * s, dz = dir.x * s + dir.z * c;
      const np = new THREE.Vector3(this.position.x + dx * step, 0.9, this.position.z + dz * step);
      if (!this.world.collideSphere(np, 0.42)) {
        this.position.x = np.x; this.position.z = np.z;
        return;
      }
    }
  }

  _fireGun(game, from, dir, target) {
    const range = this.gun.range;
    const ray = new THREE.Raycaster(from, dir, 0.3, range);
    ray.camera = game.cam;
    // 玩家命中（球形近似）
    let hitT = null, hitDist = range, hitPoint = null;
    if (target === this.player) {
      const eye = this.player.pos.clone().setY(1.2);
      const toEye = eye.clone().sub(from);
      const along = toEye.dot(dir);
      if (along > 0 && along < range) {
        const closest = from.clone().addScaledVector(dir, along);
        if (closest.distanceTo(eye) < 0.42) { hitT = this.player; hitDist = along; hitPoint = closest; }
      }
    } else if (target) {
      const ix = target.intersectsRay(ray);
      if (ix) { hitT = target; hitDist = ix.distance; hitPoint = ix.point; }
    }
    const wall = this.world.raycastWalls(ray, range);
    if (wall && wall.distance < hitDist) { hitT = null; hitPoint = wall.point; hitDist = wall.distance; }

    this.fx.muzzleFlash(from, dir, 0.8);
    game.smoke.at(from, dir, this.gun.smokeL);
    if (game.sfx) {
      const d = game.player ? from.distanceTo(game.player.pos) : 30;
      game.sfx.farFire(Math.max(0.1, 1 - d / 90));
    }

    if (hitT) {
      const fall = falloff(hitDist, range);
      const dmg = this.gun.maxDmg * this.stats.powerMul * fall * (0.85 + Math.random() * 0.3);
      if (hitT === this.player) game.playerHit(dmg, this.position, FACTIONS[this.factionKey], "铳");
      else {
        const killed = hitT.damage(dmg, dir, this.position);
        this.fx.splat(hitPoint, dmg);
        if (killed) game.hud.killfeed({ atk: this.factionName, vic: hitT.factionName || "我", kind: "铳" });
      }
    }
  }

  _syncMesh() {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
  }
}

export function falloff(dist, range) {
  const near = 14;
  if (dist <= near) return 1;
  return Math.max(0.18, 1 - (dist - near) / (range * 0.9));
}

function makeLabel(text, color) {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const ctx = c.getContext("2d");
  ctx.font = "bold 44px 'STSong','Songti SC',serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "#000"; ctx.shadowBlur = 5;
  ctx.fillStyle = color || "#fff";
  ctx.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(0.55, 0.55, 1);
  return sp;
}
