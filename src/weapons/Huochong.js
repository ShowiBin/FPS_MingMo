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
    this.shots = def.shots || 1;
    this.ammo = this.shots;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadNeed = def.reloadTime;
    this._flash = 0;
  }

  get loaded() { return this.ammo > 0; }

  setFactionMul(mul) { this.mul = mul; this.reloadNeed = def_reload(this.def, mul); }

  canFire() { return this.ammo > 0 && !this.reloading; }

  // 返回发射参数；Player 负责加阵营系数
  fireOpts() {
    if (!this.canFire()) return null;
    this.ammo--;
    if (this.ammo <= 0) this.startReload();
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
    if (this.reloading || this.ammo >= this.shots) return;
    this.reloading = true;
    this.reloadT = 0;
  }

  reloadProgress() {
    if (this.ammo >= this.shots) return 1;
    if (!this.reloading) return 0;
    return Math.min(1, this.reloadT / this.reloadNeed);
  }

  update(dt) {
    if (this._flash > 0) this._flash -= dt;
    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= this.reloadNeed) {
        this.reloading = false;
        this.ammo = this.shots;
      }
    }
  }

  // 视模：铳身 + 铳管 + 火绳 + 铜箍 + 通条
  buildViewmodel() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3016, roughness: .85 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: .4, metalness: .8 });
    const brass = new THREE.MeshStandardMaterial({ color: 0x9a7a30, roughness: .35, metalness: .85 });
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), wood);
    stock.position.set(0, -0.02, 0.1);
    const butt = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.16), wood);
    butt.position.set(0, -0.05, 0.4);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.85, 10), iron);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.28);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), brass);
    muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.02, -0.7);
    g.add(stock, butt, barrel, muzzle);
    for (const z of [-0.12, -0.42]) { // 铜箍
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 10), brass);
      band.rotation.x = Math.PI / 2; band.position.set(0, 0.02, z);
      g.add(band);
    }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 6), wood); // 通条
    rod.rotation.x = Math.PI / 2; rod.position.set(0, -0.035, -0.3);
    g.add(rod);
    const pan = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.08), brass); // 药池
    pan.position.set(0.03, 0.04, -0.05);
    g.add(pan);
    const cord = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff7722 }));
    cord.position.set(0.035, 0.06, -0.05);
    this._cord = cord;
    g.add(cord);
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
