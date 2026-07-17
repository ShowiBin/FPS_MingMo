// 角弓：清军副武器，按住拉弓、松开放箭，无烟无声
import * as THREE from "three";

export class Bow {
  constructor(def, scene, fx, world) {
    this.def = def;
    this.scene = scene;
    this.fx = fx;
    this.world = world;
    this.kind = "bow";
    this.name = def.name;
    this.draw = 0;       // 0..1
    this.drawing = false;
    this.cd = 0;
  }

  beginDraw() { if (this.cd <= 0) this.drawing = true; }

  // 放箭：返回参数或 null
  release() {
    if (!this.drawing) return null;
    const d = this.draw;
    this.drawing = false;
    this.draw = 0;
    if (d < 0.25) return null;
    this.cd = 0.5;
    return {
      kind: "bow",
      range: this.def.range,
      maxDmg: this.def.maxDmg * (0.5 + 0.5 * d),
      spread: this.def.spread * (1.3 - d),
      power: d,
    };
  }

  update(dt) {
    if (this.cd > 0) this.cd -= dt;
    if (this.drawing) this.draw = Math.min(1, this.draw + dt / this.def.drawTime);
  }

  buildViewmodel() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2e14, roughness: .8 });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.014, 8, 24, Math.PI * 1.2), wood);
    arc.rotation.z = Math.PI / 2 - Math.PI * 0.6;
    const stringMat = new THREE.LineBasicMaterial({ color: 0xd8c9a0 });
    const a = new THREE.Vector3(0, 0.29, 0), b = new THREE.Vector3(0, -0.29, 0);
    const geo = new THREE.BufferGeometry().setFromPoints([a, new THREE.Vector3(0.02, 0, 0), b]);
    this._string = new THREE.Line(geo, stringMat);
    g.add(arc, this._string);
    g.rotation.y = -0.15;
    return g;
  }

  tickViewmodel() {
    if (!this._string) return;
    const pos = this._string.geometry.attributes.position;
    pos.setX(1, 0.02 + this.draw * 0.13); // 拉弦
    pos.needsUpdate = true;
  }
}
