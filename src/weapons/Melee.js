// 冷兵器：轻击 / 重击 / 格挡
import * as THREE from "three";

export class Melee {
  constructor(def, scene, fx, world) {
    this.def = def;
    this.scene = scene;
    this.fx = fx;
    this.world = world;
    this.kind = "melee";
    this.name = def.name;
    this.cd = 0;          // 攻击冷却
    this.swingT = -1;     // 挥砍动画计时（-1 闲置）
    this.swingKind = "light";
    this.blocking = false;
    this._pending = null; // 到点判定
  }

  // 发起攻击，返回 { hitAt } 表示多少秒后做命中判定
  attack(kind = "light") {
    if (this.cd > 0 || this.blocking) return null;
    const heavy = kind === "heavy";
    const windup = heavy ? 0.32 : 0.14;
    const total = heavy ? this.def.heavyTime : this.def.lightTime;
    this.cd = total + 0.15;
    this.swingT = 0;
    this.swingKind = kind;
    this._pending = { at: windup, kind };
    return { windup, kind };
  }

  setBlock(on) {
    this.blocking = on;
    if (on) { this._pending = null; this.swingT = -1; }
  }

  update(dt) {
    if (this.cd > 0) this.cd -= dt;
    if (this.swingT >= 0) {
      this.swingT += dt;
      if (this._pending && this.swingT >= this._pending.at) {
        this._fire = this._pending; // Player 每帧读取并清除
        this._pending = null;
      }
      const total = this.swingKind === "heavy" ? this.def.heavyTime : this.def.lightTime;
      if (this.swingT > total) this.swingT = -1;
    }
  }

  // Player 调用：取走到期判定
  consumePending() { const p = this._fire; this._fire = null; return p || null; }

  dmgOf(kind, meleeBonus = 1) {
    const base = kind === "heavy" ? this.def.dmg * 1.8 : this.def.dmg;
    return base * meleeBonus;
  }

  buildViewmodel() {
    const g = new THREE.Group();
    const isClub = /棒/.test(this.def.name);
    const iron = new THREE.MeshStandardMaterial({ color: 0x9a9aa2, roughness: .3, metalness: .9 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: .9 });
    if (isClub) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.75, 8), wood);
      shaft.rotation.x = Math.PI / 2; shaft.position.z = -0.1;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x55524a, roughness: .6, metalness: .4 }));
      head.position.z = -0.5;
      g.add(shaft, head);
      for (let i = 0; i < 6; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 6), iron);
        const a = (i / 6) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, -0.5);
        spike.rotation.z = -a - Math.PI / 2;
        g.add(spike);
      }
    } else {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.72), iron);
      blade.position.z = -0.42;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.03),
        new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: .7, roughness: .4 }));
      guard.position.z = -0.06;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), wood);
      grip.rotation.x = Math.PI / 2; grip.position.z = 0.03;
      g.add(blade, guard, grip);
    }
    return g;
  }
}
