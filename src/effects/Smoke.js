// 火铳烟雾：炮口喷出的烟团，扩散、漂移、消散（真实 3D 遮蔽视线）
import * as THREE from "three";

const MAX = 240;

export class Smoke {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.tex = makeSmokeTexture();
    this.mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, opacity: .5, depthWrite: false, color: 0xcfc4ae });
  }

  // 在 from 沿 dir 喷一团烟，life 决定存续（0.5~0.7 -> 约 4~6s）
  at(from, dir, life = 0.55) {
    const n = 12;
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX) this._kill(this.parts[0]);
      const sp = new THREE.Sprite(this.mat.clone());
      const t = 0.35 + Math.random() * 1.3;
      sp.position.copy(from).addScaledVector(dir, t);
      sp.position.x += (Math.random() - .5) * .35;
      sp.position.y += (Math.random() - .5) * .25;
      sp.position.z += (Math.random() - .5) * .35;
      const s = 0.35 + Math.random() * 0.5;
      sp.scale.set(s, s, 1);
      sp.material.opacity = 0.5 + Math.random() * 0.2;
      sp.material.rotation = Math.random() * Math.PI;
      this.scene.add(sp);
      this.parts.push({
        sp,
        vel: new THREE.Vector3(
          dir.x * 0.35 + (Math.random() - .5) * .3,
          0.25 + Math.random() * .35,
          dir.z * 0.35 + (Math.random() - .5) * .3),
        age: 0,
        ttl: 2.8 + life * 5 + Math.random(),
        grow: 0.9 + Math.random() * 0.8,
      });
    }
    return true;
  }

  _kill(p) { this.scene.remove(p.sp); p.sp.material.dispose(); }

  reset() { for (const p of this.parts) this._kill(p); this.parts.length = 0; }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.ttl) { this._kill(p); this.parts.splice(i, 1); continue; }
      p.sp.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 0.6);
      p.vel.y += dt * 0.05;
      const k = 1 + p.grow * dt;
      p.sp.scale.multiplyScalar(k);
      const r = p.age / p.ttl;
      p.sp.material.opacity = 0.62 * (1 - r) * (r < 0.12 ? r / 0.12 : 1);
      p.sp.material.rotation += dt * 0.3;
    }
  }
}

function makeSmokeTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, "rgba(255,255,255,.85)");
  g.addColorStop(0.45, "rgba(240,235,220,.42)");
  g.addColorStop(1, "rgba(230,225,210,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
