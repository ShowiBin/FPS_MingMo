// 命中 / 枪口焰 / 血墨 / 震屏 / 爆破
import * as THREE from "three";

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.shakeAmt = 0;
    this.flashTex = makeFlashTexture();
    this.dotTex = makeDotTexture();
  }

  // 枪口焰：光点 + 闪光面片
  muzzleFlash(from, dir, power = 1) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.flashTex, transparent: true, opacity: .95, depthWrite: false,
      color: 0xffc060, blending: THREE.AdditiveBlending,
    }));
    sp.position.copy(from).addScaledVector(dir, 0.9);
    const s = 0.5 + power * 0.4;
    sp.scale.set(s, s, 1);
    this.scene.add(sp);
    this.parts.push({ sp, age: 0, ttl: 0.07 });
    const li = new THREE.PointLight(0xffa040, 2.6 * power, 9);
    li.position.copy(sp.position);
    this.scene.add(li);
    this.parts.push({ sp: li, age: 0, ttl: 0.07, light: true });
    this.shake(0.12 * power);
  }

  // 血墨飞溅
  splat(point, dmg = 30) {
    const n = Math.min(10, 4 + (dmg | 0) / 10);
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.dotTex, transparent: true, opacity: .9, depthWrite: false, color: 0x7a0d0d,
      }));
      sp.position.copy(point);
      const s = 0.08 + Math.random() * 0.12;
      sp.scale.set(s, s, 1);
      this.scene.add(sp);
      this.parts.push({
        sp, age: 0, ttl: 0.5 + Math.random() * 0.3,
        vel: new THREE.Vector3((Math.random() - .5) * 3, 1 + Math.random() * 2, (Math.random() - .5) * 3),
        grav: true,
      });
    }
    this.shake(0.06);
  }

  // 火药爆炸（A/B 点）
  witnessPlant(at) {
    const p = at || new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < 26; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.flashTex, transparent: true, depthWrite: false,
        color: i % 3 ? 0xffa030 : 0xff5510, blending: THREE.AdditiveBlending,
      }));
      sp.position.copy(p);
      sp.position.y += 0.5;
      const s = 0.6 + Math.random() * 1.4;
      sp.scale.set(s, s, 1);
      this.scene.add(sp);
      this.parts.push({
        sp, age: 0, ttl: 0.6 + Math.random() * 0.6,
        vel: new THREE.Vector3((Math.random() - .5) * 14, Math.random() * 10, (Math.random() - .5) * 14),
      });
    }
    const li = new THREE.PointLight(0xff7020, 8, 60);
    li.position.copy(p); li.position.y += 2;
    this.scene.add(li);
    this.parts.push({ sp: li, age: 0, ttl: 0.5, light: true });
    this.shake(1.6);
  }

  // 弹道曳光
  tracer(from, to, color = 0xffd9a0) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.5) return;
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, len, 4, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.scene.add(m);
    this.parts.push({ sp: m, age: 0, ttl: 0.09 });
  }

  // 墙面弹着（尘土 + 火星）
  impact(point) {
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.dotTex, transparent: true, opacity: .7, depthWrite: false,
        color: i < 2 ? 0xffc060 : 0x8a7a62,
      }));
      sp.position.copy(point);
      const s = 0.06 + Math.random() * 0.08;
      sp.scale.set(s, s, 1);
      this.scene.add(sp);
      this.parts.push({
        sp, age: 0, ttl: 0.3 + Math.random() * 0.2,
        vel: new THREE.Vector3((Math.random() - .5) * 2, Math.random() * 1.6, (Math.random() - .5) * 2),
        grav: true,
      });
    }
  }

  // 飘字伤害数字
  dmgNumber(point, dmg, head = false) {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 64;
    const ctx = c.getContext("2d");
    ctx.font = `bold ${head ? 44 : 34}px 'Segoe UI',monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "#000"; ctx.shadowBlur = 5;
    ctx.fillStyle = head ? "#ff4433" : "#ffd9a0";
    ctx.fillText(head ? `${Math.round(dmg)}!` : `${Math.round(dmg)}`, 64, 34);
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    sp.position.copy(point);
    sp.position.y += 0.35;
    const s = head ? 0.85 : 0.6;
    sp.scale.set(s * 2, s, 1);
    this.scene.add(sp);
    this.parts.push({ sp, age: 0, ttl: 0.75, vel: new THREE.Vector3((Math.random() - .5) * .4, 1.4, 0), num: true });
  }

  shake(a) { this.shakeAmt = Math.min(1.8, this.shakeAmt + a); }

  // Game 每帧取震屏量（自动衰减）
  consumeShake(dt) {
    const s = this.shakeAmt;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 3.2);
    return s;
  }

  reset() {
    for (const p of this.parts) this.scene.remove(p.sp);
    this.parts.length = 0;
    this.shakeAmt = 0;
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.ttl) { this.scene.remove(p.sp); this.parts.splice(i, 1); continue; }
      if (p.vel) {
        if (p.grav) p.vel.y -= dt * 9;
        p.sp.position.addScaledVector(p.vel, dt);
        if (p.sp.position.y < 0.02) { p.sp.position.y = 0.02; p.vel.set(0, 0, 0); }
      }
      const r = p.age / p.ttl;
      if (p.light) p.sp.intensity *= (1 - dt * 8);
      else p.sp.material.opacity = (1 - r) * 0.95;
    }
  }
}

function makeFlashTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,210,120,.8)");
  g.addColorStop(1, "rgba(255,140,40,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function makeDotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
