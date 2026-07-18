// 山寨关隘地图：A 火药库 / B 粮仓，村道 / 屋顶 / 窄巷 / 箭楼
import * as THREE from "three";

const SITE_A = new THREE.Vector3(-30, 0, 14);
const SITE_B = new THREE.Vector3( 26, 0,-22);
const SITE_RADIUS = 8.5;

const SPAWN_MAP   = new THREE.Vector3(-42, 0,-2);
const SPAWN_NONG  = new THREE.Vector3( 44, 0,  2);
const SPAWN_QING  = new THREE.Vector3( 40, 0, 22);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.walls = []; // [{mesh, dist-fn}]
    this.colliders = [];
    this.heightMap = null;
    this.siteRadius = SITE_RADIUS;
    this.build();
  }

  resetSites(){
    // 还原 A/B 标识颜色，不重建
  }

  spawnPoint(faction, jitter=false) {
    const p = ({ming:SPAWN_MAP, nong:SPAWN_NONG, qing:SPAWN_QING}[faction] || SPAWN_MAP).clone();
    if (jitter) { p.x += (Math.random()-0.5)*3; p.z += (Math.random()-0.5)*3; }
    return p;
  }

  // ---- 构造 ----
  build() {
    const s = this.scene;
    // 天空穹顶（黄昏渐变）
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(380, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {},
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vP;
          void main(){
            float h = normalize(vP).y;
            vec3 top = vec3(0.06,0.09,0.16);
            vec3 mid = vec3(0.55,0.28,0.14);
            vec3 low = vec3(0.85,0.48,0.2);
            vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25,0.9,h)) : mix(low, mid, smoothstep(-0.05,0.25,h));
            gl_FragColor = vec4(c,1.0);
          }`,
      })
    );
    s.add(sky);
    // 落日光斑
    const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), color: 0xffc070, transparent: true, opacity: .95,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sunDisc.position.set(200, 120, -100);
    sunDisc.scale.set(90, 90, 1);
    s.add(sunDisc);

    // 地面（土+石，程序化噪点纹理）
    const groundMat = new THREE.MeshStandardMaterial({ map: makeNoiseTexture("#2e251a", "#241c12", 24), roughness: 1.0, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), groundMat);
    ground.rotation.x = -Math.PI/2;
    ground.receiveShadow = true;
    s.add(ground);

    // 道路（土色）
    const road = new THREE.Mesh(new THREE.PlaneGeometry(110,5), new THREE.MeshStandardMaterial({ map: makeNoiseTexture("#5f4d34", "#4a3a26", 10), roughness: 1 }));
    road.rotation.x = -Math.PI/2; road.position.y = 0.02; road.receiveShadow = true; s.add(road);

    // 山体（背景）
    for (let i=0;i<8;i++){
      const r = 18 + Math.random()*30;
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, 25+r, 6), new THREE.MeshStandardMaterial({ color:0x1e1a24, roughness:1 }));
      // distant ring
      const ang = (i/8)*Math.PI*2;
      m.position.set(Math.cos(ang)*105, 12, Math.sin(ang)*105);
      m.rotation.y = Math.random()*3;
      s.add(m);
    }

    // ---- 地标 ----
    // 中路村道两侧：院墙、窄巷
    this.buildWall(s, -10, 4, 14, 6, 0x4a3a22);
    this.buildWall(s, -10,-4,-22,-4, 0x4a3a22);
    this.buildWall(s,  22, 4,  22,-22, 0x4a3a22);
    this.buildWall(s, -45,12, -45,-12,0x4a3a22);

    // 寨门（中心入口拱门）
    this.buildGate(s, 0,0, Math.PI/2);

    // 庭院（A 附近）
    this.buildCourtyard(s, SITE_A);
    // 粮仓建筑（B 处）
    this.buildGranary(s, SITE_B);
    // 火药库（A 处）
    this.buildPowderHouse(s, SITE_A);
    // 瞭望箭楼（远处）
    this.buildTower(s, 6, 24);
    this.buildTower(s, -34,-26);

    // 火药库标识（A：红色发光）
    this.addSiteMarker(SITE_A, 0xa81818, "A 火药库");
    this.addSiteMarker(SITE_B, 0xc8a05a, "B 粮仓");

    // 散落物：拒马、火药箱、箭袋、旗帜
    this.scatterProps(s);

    // 装饰：草丛 / 灯笼 / 火盆
    this.scatterDeco(s);

    // 拒马（可作掩体 + 阻挡）
    this.buildBarricade(s, 0,8);
    this.buildBarricade(s, 12,-6);
    this.buildBarricade(s,-22,-14);

    // 场景细节：火药桶 / 粮袋 / 辎重车 / 灯笼柱 / 门旗 / 流云
    this.buildDetails(s);

    // 投影：除地面/天空/标识环外全部投射阴影
    s.traverse(o => {
      if (!o.isMesh) return;
      const t = o.geometry && o.geometry.type;
      const r = o.geometry && o.geometry.parameters && o.geometry.parameters.radius;
      if (t === "PlaneGeometry" || t === "RingGeometry") return;
      if (t === "SphereGeometry" && r > 100) return;
      o.castShadow = true;
    });
  }

  buildDetails(s){
    this._flags = this._flags || [];
    this._clouds = [];
    const plank = makePlankTexture();
    // A：火药桶
    const barrelMat = new THREE.MeshStandardMaterial({ map: plank, color: 0x4a3a28 });
    for (const [bx, bz] of [[-34, 10], [-33.2, 11.2], [-34.2, 11.4], [-26, 18], [-33.5, 10.5, 0.95]]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.95, 12), barrelMat);
      bar.position.set(bx, 0.48, bz);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 12),
        new THREE.MeshStandardMaterial({ color: 0x222226, metalness: .6, roughness: .5 }));
      band.position.set(bx, 0.7, bz);
      s.add(bar, band);
    }
    // B：粮袋与陶罐
    for (const [gx, gz] of [[23, -18], [24, -17], [22.5, -17.2], [29, -25], [28.2, -24.4]]) {
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x8a6f42, roughness: 1 }));
      sack.position.set(gx, 0.38, gz); sack.scale.y = 0.68;
      s.add(sack);
    }
    for (const [jx, jz] of [[29.5, -18], [22, -25]]) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.8, 10),
        new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: .7 }));
      jar.position.set(jx, 0.4, jz);
      s.add(jar);
    }
    // 中路辎重车
    const cart = new THREE.Group();
    cart.position.set(6, 0, 3.5);
    cart.rotation.y = 0.35;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.28, 1.25), new THREE.MeshStandardMaterial({ map: plank, color: 0x7a5c38 }));
    bed.position.y = 0.75; cart.add(bed);
    for (const s2 of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 14), new THREE.MeshStandardMaterial({ color: 0x3a2a18 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 0.55, s2 * 0.72);
      cart.add(wheel);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.3, 0.08), new THREE.MeshStandardMaterial({ map: plank, color: 0x7a5c38 }));
      rail.position.set(0, 1.0, s2 * 0.6); cart.add(rail);
    }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a18 }));
    shaft.rotation.z = Math.PI / 2 - 0.25; shaft.position.set(1.9, 0.55, 0);
    cart.add(shaft);
    s.add(cart);
    this.colliders.push({ type: "box", obj: cart });
    // 灯笼柱（寨门二、A/B 各一）
    for (const [lx, lz] of [[-5.5, -2.5], [5.5, -2.5], [-27, 11], [24, -19]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.1, 8), new THREE.MeshStandardMaterial({ color: 0x2a1c10 }));
      pole.position.set(lx, 1.55, lz); s.add(pole);
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xffb050, emissive: 0xff7018, emissiveIntensity: 1.6 }));
      lan.position.set(lx, 3.0, lz); s.add(lan);
      const li = new THREE.PointLight(0xff8830, 1.1, 11);
      li.position.set(lx, 2.9, lz); s.add(li);
      this._flecks = this._flecks || [];
      this._flecks.push({ flame: lan, fire: li, t: Math.random() * 9 });
    }
    // 寨门竖幅
    for (const s2 of [-1, 1]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 3.2),
        new THREE.MeshStandardMaterial({ map: makeBannerTexture(s2 < 0 ? "寨" : "關"), side: THREE.DoubleSide, transparent: true }));
      banner.position.set(s2 * 3.4, 4.6, 0.4);
      s.add(banner);
      this._flags.push(banner);
    }
    // 流云
    const cloudTex = makeGlowTexture();
    for (let i = 0; i < 6; i++) {
      const cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xd8906a, transparent: true, opacity: 0.16 + Math.random() * 0.08, depthWrite: false, fog: false }));
      cl.position.set((Math.random() - .5) * 400, 70 + Math.random() * 40, (Math.random() - .5) * 400);
      const sc = 70 + Math.random() * 60;
      cl.scale.set(sc, sc * 0.36, 1);
      s.add(cl);
      this._clouds.push(cl);
    }
  }

  // 每帧动态：流云 / 火光 / 旗帜
  update(dt){
    for (const c of this._clouds || []) {
      c.position.x += dt * 1.1;
      if (c.position.x > 260) c.position.x = -260;
    }
    for (const f of this._flecks || []) {
      f.t += dt;
      const s = 0.85 + Math.sin(f.t * 9) * 0.18;
      f.flame.scale.set(s, s * 1.25, s);
      if (f.fire.intensity !== undefined) f.fire.intensity = 1.0 + Math.sin(f.t * 11) * 0.35;
    }
    const now = performance.now() / 1000;
    for (const fl of this._flags || []) fl.rotation.y = Math.sin(now * 1.4 + fl.position.x) * 0.28;
  }

  // 院墙
  buildWall(s, x1,z1, x2,z2, color=0x4a3a22, h=4){
    const dx = x2-x1, dz = z2-z1;
    const len = Math.hypot(dx,dz);
    const tex = makeBrickTexture();
    tex.repeat.set(Math.max(1, len/3.5), Math.max(1, h/3.5));
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, h, len),
      new THREE.MeshStandardMaterial({ map: tex, color, roughness:1 })
    );
    m.position.set((x1+x2)/2, h/2, (z1+z2)/2);
    m.rotation.y = -Math.atan2(dz, dx) + Math.PI/2;
    m.castShadow = true; m.receiveShadow = true;
    s.add(m);
    this.walls.push({ mesh:m, p1:new THREE.Vector3(x1,0,z1), p2:new THREE.Vector3(x2,0,z2), h });
    this.colliders.push({ type:"box", obj:m, half:m.geometry.parameters });
    return m;
  }
  buildGate(s, x, z, rot){
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = rot;
    const colMat = new THREE.MeshStandardMaterial({ color:0x332614, roughness:1 });
    for (let ox of [-4, 4]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45,0.55,7,10), colMat);
      col.position.set(ox, 3.5, 0); g.add(col);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(10, 1.4, 1.6), new THREE.MeshStandardMaterial({ color:0x3a2a18 }));
    lintel.position.set(0, 7, 0); g.add(lintel);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(8, 3.5, 4), new THREE.MeshStandardMaterial({ color:0x4a2818 }));
    roof.position.set(0,9.5,0); roof.rotation.y = Math.PI/4; g.add(roof);
    // 门匾（红色）
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.4,1.1,0.2), new THREE.MeshStandardMaterial({ color:0x8a1818, emissive:0x3a0000, emissiveIntensity:.5 }));
    board.position.set(0, 6, 0.65); g.add(board);
    s.add(g);
    // 仅门柱参与碰撞，门洞可通行
    for (const child of g.children) if (child.geometry && child.geometry.type === "CylinderGeometry")
      this.colliders.push({ type:"box", obj:child });
  }
  buildCourtyard(s, at){
    // 圈一个 12×12 院子，东墙与南墙各留 3m 门口
    const cx=at.x, cz=at.z, G=1.6;
    this.buildWall(s, cx-6, cz-6,  cx-6, cz-G, 0x432a14, 3);   // 西墙（南段）
    this.buildWall(s, cx-6, cz+G,  cx-6, cz+6, 0x432a14, 3);   // 西墙（北段）
    this.buildWall(s, cx+6, cz-6,  cx+6, cz+6, 0x432a14, 3);   // 东墙整体
    this.buildWall(s, cx-6, cz-6,  cx-G, cz-6, 0x432a14, 3);   // 南墙（西段）
    this.buildWall(s, cx+G, cz-6,  cx+6, cz-6, 0x432a14, 3);   // 南墙（东段）
    this.buildWall(s, cx-6, cz+6,  cx+6, cz+6, 0x432a14, 3);   // 北墙整体
  }
  buildPowderHouse(s, at){
    const m = new THREE.Group();
    m.position.set(at.x, 0, at.z - 6);
    const plank = makePlankTexture(); plank.repeat.set(3, 1.5);
    const house = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 5), new THREE.MeshStandardMaterial({ map: plank, color:0x8a7050 }));
    house.position.y = 2; m.add(house);
    const roofTex = makePlankTexture(); roofTex.repeat.set(4, 2);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6, 3, 4), new THREE.MeshStandardMaterial({ map: roofTex, color:0x6a4030 }));
    roof.position.y = 5.5; roof.rotation.y = Math.PI/4; m.add(roof);
    // 标牌
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.5,1.2,0.18), new THREE.MeshStandardMaterial({ color:0x8a1818, emissive:0x3a0000, emissiveIntensity:.45 }));
    plate.position.set(0, 3.2, 2.6); plate.rotation.y = Math.PI; m.add(plate);
    s.add(m);
    this.colliders.push({ type:"box", obj:m, half:new THREE.Vector3(4,2,2.5) });
  }
  buildGranary(s, at){
    const m = new THREE.Group();
    m.position.set(at.x, 0, at.z + 6);
    const plank = makePlankTexture(); plank.repeat.set(3, 1);
    // 高脚仓
    const base = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 6), new THREE.MeshStandardMaterial({ map: plank, color:0x9a7a52 }));
    base.position.y = 0.6; m.add(base);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,4,12), new THREE.MeshStandardMaterial({ map: makePlankTexture(), color:0xb08a5a }));
    body.position.y = 3; m.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.6, 12), new THREE.MeshStandardMaterial({ color:0x4a3020 }));
    roof.position.y = 6.3; m.add(roof);
    s.add(m);
    this.colliders.push({ type:"box", obj:m, half:new THREE.Vector3(4.5,3,3) });
  }
  buildTower(s, x, z){
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const plank = makePlankTexture(); plank.repeat.set(2, 6);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(3.6, 14, 3.6), new THREE.MeshStandardMaterial({ map: plank, color:0x6a5238 }));
    leg.position.y = 7; g.add(leg);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 2, 12), new THREE.MeshStandardMaterial({ color:0x4a3018 }));
    cap.position.y = 15.5; g.add(cap);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.5, 2.6, 8), new THREE.MeshStandardMaterial({ color:0x553322 }));
    roof.position.y = 17.6; roof.rotation.y = Math.PI/8; g.add(roof);
    // 灯笼
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), new THREE.MeshStandardMaterial({ color:0xffaa44, emissive:0xff6600, emissiveIntensity:1.4 }));
    lan.position.set(0, 14.6, 0); g.add(lan);
    s.add(g);
    this.colliders.push({ type:"box", obj:g, half:new THREE.Vector3(2,7,2) });
    this.towerZ = z+8;
  }
  addSiteMarker(at, color, name){
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(SITE_RADIUS-0.5, SITE_RADIUS, 48),
      new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.6, side:THREE.DoubleSide, depthWrite:false })
    );
    ring.rotation.x = -Math.PI/2; ring.position.copy(at); ring.position.y = 0.04;
    this.scene.add(ring);
    // 中心光柱
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 14, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.35, side:THREE.DoubleSide, depthWrite:false })
    );
    beam.position.copy(at); beam.position.y = 7; this.scene.add(beam);
    // 名称 sprite
    const lbl = makeSprite(name, "#"+color.toString(16).padStart(6,'0'));
    lbl.position.copy(at); lbl.position.y = 1.6; this.scene.add(lbl);

    this[ name.startsWith("A") ? "siteA" : "siteB" ] = at.clone();
  }

  scatterProps(s){
    // 拒马堆 / 箱子（避让出生点与 A/B 点）
    const boxMat = new THREE.MeshStandardMaterial({ color:0x352718, roughness:1 });
    const keep = [SPAWN_MAP, SPAWN_NONG, SPAWN_QING, SITE_A, SITE_B, new THREE.Vector3(0,0,0)];
    for (let i=0;i<14;i++){
      const x = (Math.random()-0.5)*90, z = (Math.random()-0.5)*90;
      if (keep.some(p => Math.hypot(p.x-x, p.z-z) < 7)) continue;
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.1,1,0.8), boxMat);
      box.position.set(x, 0.5, z); box.rotation.y = Math.random()*3;
      s.add(box);
      this.colliders.push({ type:"box", obj:box });
    }
    // 旗帜（营地远端）
    this._flags = this._flags || [];
    for (const f of [{x:-36,z:-6,c:0x8a1818,t:"明"}, {x:36,z:8,c:0x3f7a4e,t:"闯"}, {x:34,z:22,c:0xc8a05a,t:"清"}]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,7,6), new THREE.MeshStandardMaterial({ color:0x222 }));
      pole.position.set(f.x, 3.5, f.z); s.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshStandardMaterial({ color:f.c, emissive:f.c, emissiveIntensity:.2, side:THREE.DoubleSide }));
      flag.position.set(f.x+1.2, 6, f.z); s.add(flag);
      const txt = makeSprite(f.t, "#fff"); txt.position.set(f.x+1.2, 6, f.z+0.05); s.add(txt);
      this._flags.push(flag);
    }
    // 火盆
    for (let i=0;i<6;i++){
      const x = (Math.random()-0.5)*70, z = (Math.random()-0.5)*70;
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,0.3,10), new THREE.MeshStandardMaterial({ color:0x1a1010 }));
      basin.position.set(x, 0.15, z); s.add(basin);
      const fire = new THREE.PointLight(0xff7700, 1.4, 12);
      fire.position.set(x, 0.8, z); s.add(fire);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), new THREE.MeshBasicMaterial({ color:0xffaa33, transparent:true, opacity:.7 }));
      flame.position.set(x, 0.6, z); s.add(flame);
      // animate
      this._flecks = this._flecks || []; this._flecks.push({ flame, fire, t:0 });
    }
  }
  scatterDeco(s){
    // 干草 / 杂物
    for (let i=0;i<28;i++){
      const x=(Math.random()-0.5)*100, z=(Math.random()-0.5)*100;
      const hay = new THREE.Mesh(new THREE.SphereGeometry(0.4+Math.random()*0.4, 8, 8), new THREE.MeshStandardMaterial({ color:0x5a4022, roughness:1 }));
      hay.position.set(x, 0.3, z); hay.scale.y = 0.4; s.add(hay);
    }
  }
  buildBarricade(s, x, z){
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    for (let i=0;i<6;i++){
      const X = (i-2)*0.4;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,2.1,6), new THREE.MeshStandardMaterial({ color:0x2a1a10 }));
      log.position.set(X, 0.7, 0); log.rotation.x = Math.PI/2; log.rotation.z = (i-3)*0.2;
      g.add(log);
    }
    s.add(g);
    this.colliders.push({ type:"box", obj:g, half:new THREE.Vector3(1.2,0.8,1.2), world:true });
  }

  // ---- 查询 ----
  atSite(pos){
    return pos.distanceTo(SITE_A) < SITE_RADIUS || pos.distanceTo(SITE_B) < SITE_RADIUS;
  }
  atSiteName(pos){
    if (pos.distanceTo(SITE_A) < SITE_RADIUS) return "A 火药库";
    if (pos.distanceTo(SITE_B) < SITE_RADIUS) return "B 粮仓";
    return "";
  }

  // 球形碰撞：返回 true 时表示该位置被阻挡（Box3 缓存，静态场景只需算一次）
  collideSphere(pos, radius=0.4){
    const lim = 100;
    if (Math.abs(pos.x) > lim || Math.abs(pos.z) > lim) return true;
    for (const c of this.colliders) {
      if (!c.box) c.box = new THREE.Box3().setFromObject(c.obj);
      const b = c.box;
      const nx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
      const ny = Math.max(b.min.y, Math.min(pos.y, b.max.y));
      const nz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
      const dx = pos.x-nx, dy = pos.y-ny, dz = pos.z-nz;
      if (dx*dx + dy*dy + dz*dz < radius*radius) return true;
    }
    return false;
  }

  // 两点间是否被墙阻挡（AI 视线判断）
  losBlocked(from, to){
    const dir = to.clone().sub(from);
    const d = dir.length();
    if (d < 0.001) return false;
    dir.multiplyScalar(1/d);
    const rc = new THREE.Raycaster(from, dir, 0.2, d - 0.2);
    return !!this.raycastWalls(rc, d);
  }

  // Raycast 墙体
  raycastWalls(raycaster, range){
    for (const c of this.colliders) {
      if (!c.obj || !c.obj.visible) continue;
      const list = raycaster.intersectObject(c.obj, true);
      if (list.length && list[0].distance <= range) return list[0];
    }
    return null;
  }
}

function makeSprite(text, color){
  const c = document.createElement("canvas");
  c.width=128; c.height=64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0)"; ctx.fillRect(0,0,128,64);
  ctx.font = "bold 48px 'STSong','Songti SC',serif";
  ctx.fillStyle = color || "#fff";
  ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.shadowColor="#000"; ctx.shadowBlur=6;
  ctx.fillText(text, 64, 36);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(2, 1, 1);
  return sp;
}

// 程序化噪点地面纹理
function makeNoiseTexture(base, fleck, repeat = 16){
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = fleck;
  for (let i = 0; i < 2200; i++) {
    ctx.globalAlpha = 0.04 + Math.random() * 0.1;
    const s = 1 + Math.random() * 2.4;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = "#000";
  for (let i = 0; i < 300; i++) {
    const s = 2 + Math.random() * 4;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  return tex;
}

function makeGlowTexture(){
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(255,240,210,1)");
  g.addColorStop(0.35, "rgba(255,180,100,.55)");
  g.addColorStop(1, "rgba(255,140,60,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// 砖墙纹理（浅色底，由材质 color 调色）
function makeBrickTexture(){
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#b9a684"; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(60,45,30,.55)";
  ctx.lineWidth = 3;
  const course = 32;
  for (let y = 0; y <= 256; y += course) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
    const off = (y / course) % 2 ? 0 : 32;
    for (let x = off; x <= 256; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + course); ctx.stroke();
    }
  }
  ctx.fillStyle = "rgba(70,55,35,.18)";
  for (let i = 0; i < 700; i++) ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// 木板纹理
function makePlankTexture(){
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#c9a878"; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(70,48,26,.6)";
  ctx.lineWidth = 3;
  for (let x = 0; x <= 256; x += 36) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(90,64,36,.35)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 4, y + 20, x, y + 40); ctx.stroke();
  }
  ctx.fillStyle = "rgba(80,55,30,.15)";
  for (let i = 0; i < 500; i++) ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// 竖幅布旗纹理
function makeBannerTexture(char){
  const c = document.createElement("canvas");
  c.width = 128; c.height = 384;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#7a1414"; ctx.fillRect(0, 0, 128, 384);
  ctx.strokeStyle = "#c8a05a"; ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 112, 368);
  ctx.font = "bold 84px 'STSong','Songti SC',serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#e9dfc4";
  ctx.shadowColor = "#000"; ctx.shadowBlur = 8;
  ctx.fillText(char, 64, 192);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
