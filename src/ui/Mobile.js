// 手机触屏控制：左摇杆移动 + 右侧滑动视角 + 按钮组（开火/瞄准/跳蹲/装填/换武器/交互/处决）
export function setupMobile(input) {
  const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  if (!isTouch) return false;
  document.body.classList.add("touch");

  const root = document.createElement("div");
  root.id = "touch-ui";
  root.innerHTML = `
    <div id="joy"><div id="joyKnob"></div></div>
    <div class="tbtn big" id="tFire">开 火</div>
    <div class="tbtn" id="tAim" style="right:132px;bottom:96px;">瞄 准</div>
    <div class="tbtn" id="tJump" style="right:24px;bottom:190px;">跳</div>
    <div class="tbtn" id="tCrouch" style="right:104px;bottom:190px;">蹲</div>
    <div class="tbtn" id="tSprint" style="right:184px;bottom:190px;">冲 刺</div>
    <div class="tbtn sm" id="tReload" style="right:24px;bottom:280px;">装 填</div>
    <div class="tbtn sm" id="tWeapon" style="right:104px;bottom:280px;">换 械</div>
    <div class="tbtn sm" id="tE" style="right:184px;bottom:280px;">重击<br>安放</div>
    <div class="tbtn sm" id="tF" style="right:264px;bottom:280px;">处 决</div>`;
  document.getElementById("app").appendChild(root);

  const joy = document.getElementById("joy");
  const knob = document.getElementById("joyKnob");
  const R = 46;
  let joyId = null, joyCx = 0, joyCy = 0;
  let lookId = null, lookX = 0, lookY = 0;

  const moveKeys = ["w", "a", "s", "d"];
  const clearMove = () => moveKeys.forEach(k => input.keys.delete(k));

  function joySet(dx, dy) {
    clearMove();
    const nx = dx / R, ny = dy / R;
    if (ny < -0.35) input.keys.add("w");
    if (ny > 0.35) input.keys.add("s");
    if (nx < -0.35) input.keys.add("a");
    if (nx > 0.35) input.keys.add("d");
    knob.style.transform = `translate(${dx}px,${dy}px)`;
  }

  joy.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joyId = t.identifier;
    const r = joy.getBoundingClientRect();
    joyCx = r.left + r.width / 2; joyCy = r.top + r.height / 2;
    joySet(t.clientX - joyCx, t.clientY - joyCy);
  }, { passive: false });

  document.addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        let dx = t.clientX - joyCx, dy = t.clientY - joyCy;
        const len = Math.hypot(dx, dy);
        if (len > R) { dx = dx / len * R; dy = dy / len * R; }
        joySet(dx, dy);
      } else if (t.identifier === lookId) {
        input.dx += (t.clientX - lookX) * 2.6;
        input.dy += (t.clientY - lookY) * 2.6;
        lookX = t.clientX; lookY = t.clientY;
      }
    }
  }, { passive: true });

  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) { joyId = null; clearMove(); knob.style.transform = "translate(0,0)"; }
      if (t.identifier === lookId) lookId = null;
    }
  };
  document.addEventListener("touchend", endTouch);
  document.addEventListener("touchcancel", endTouch);

  // 右半屏滑动 = 视角
  document.addEventListener("touchstart", (e) => {
    for (const t of e.changedTouches) {
      if (t.target.closest && (t.target.closest(".tbtn") || t.target.closest("#joy") || t.target.closest(".overlay"))) continue;
      if (t.clientX > innerWidth * 0.4 && lookId === null) {
        lookId = t.identifier; lookX = t.clientX; lookY = t.clientY;
      }
    }
  }, { passive: true });

  // ---- 按钮 ----
  const hold = (id, down, up) => {
    const el = document.getElementById(id);
    el.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add("on"); down(); }, { passive: false });
    const off = (e) => { e.preventDefault(); el.classList.remove("on"); up && up(); };
    el.addEventListener("touchend", off);
    el.addEventListener("touchcancel", off);
  };
  const pulse = (key) => { input.keys.add(key); setTimeout(() => input.keys.delete(key), 140); };
  const toggle = (key) => { input.keys.has(key) ? input.keys.delete(key) : input.keys.add(key); };

  let wpn = 0;
  hold("tFire", () => { input.mdown = true; }, () => { input.mdown = false; });
  hold("tAim", () => { input.rdown = !input.rdown; document.getElementById("tAim").classList.toggle("lock", input.rdown); });
  hold("tJump", () => pulse(" "));
  hold("tCrouch", () => toggle("c"));
  hold("tSprint", () => toggle("shiftleft"));
  hold("tReload", () => pulse("r"));
  hold("tWeapon", () => { wpn = (wpn + 1) % 3; pulse(String(wpn + 1)); });
  hold("tE", () => pulse("e"));
  hold("tF", () => pulse("f"));
  return true;
}
