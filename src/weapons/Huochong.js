// 火铳：单发高伤、长装填、烟雾、精度不稳
import * as THREE from "three";

export class Huochong {
  constructor(def, scene, fx, world) {
    this.def = def;
    this.scene = scene;
    this.fx = fx;
    this.world = world;
    this.kind = "gun";
    this.name = def.name;
    this.loaded = true;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadNeed = def.reloadTime;
    this._flash = 0;
  }

  setFactionMul(mul) { this.mul = mul; this.reloadNeed = def_reload(this.def, mul); }

  canFire() { return this.loaded && !this.reloading; }

  // 返回发射参数；Player 负责加阵营系数
  fireOpts() {
    if (!this.canFire()) return null;
    this.loaded = false;
    this.startReload();
    this._flash = 0.06;
    return {
      kind: "gun",
      range: this.def.range,
      maxDmg: this.def.maxDmg,
      spread: this.def.spread,
      smokeL: this.def.smokeL,
      power: 1.0,
    };
  }

  startReload() {
    if (this.loaded || this.reloading) return;
    this.reloading = true;
    this.reloadT = 0;
  }

  reloadProgress() {
    if (this.loaded) return 1;
    if (!this.reloading) return 0;
    return Math.min(1, this.reloadT / this.reloadNeed);
  }

  update(dt) {
    if (this._flash > 0) this._flash -= dt;
    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= this.reloadNeed) {
        this.reloading = false;
        this.loaded = true;
      }
    }
  }

  // 视模：铳身 + 铳管 + 火绳
  buildViewmodel() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3016, roughness: .85 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: .4, metalness: .8 });
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), wood);
    stock.position.set(0, -0.02, 0.1);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.85, 10), iron);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.28);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), iron);
    muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.02, -0.7);
    const cord = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff7722 }));
    cord.position.set(0.035, 0.045, -0.05);
    this._cord = cord;
    g.add(stock, barrel, muzzle, cord);
    return g;
  }

  tickViewmodel(dt, t) {
    if (this._cord) this._cord.material.color.setHex(Math.sin(t * 6) > 0 ? 0xff8833 : 0xcc4400);
  }
}

function def_reload(def, mul) {
  const r = mul && mul.reloadMul ? mul.reloadMul : 1;
  return def.reloadTime / Math.max(0.3, r);
}
