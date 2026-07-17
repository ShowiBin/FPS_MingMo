// 历史见证书写数据，UI 随机抽取并显示
// 数据来源：明史、纪效新书、武备志，及对松锦/山海关/潼关/开封战役的提炼

export const WITNESSES = [
  { line: "鸟铳者，点放迟缓，每发不过一丸，然中则立毙。", src: "——程子颐《武备志》" },
  { line: "三眼铳可三放，放罢则以铁首击人。", src: "——《明史·兵志》" },
  { line: "贼马骤至，铳不及放，则倒持其铳以击。", src: "——戚继光《纪效新书》" },
  { line: "关宁铁骑冠天下，然关外尽失，铁骑无以为家。", src: "——崇祯十一年辽东纪事" },
  { line: "传庭死，而明亡。", src: "——《明史·孙传庭传》" },
  { line: "甲申三月十八，京城陷，帝崩煤山，仅以身免一足。", src: "——崇祯实录" },
  { line: "一片石之战，闯军大溃，自此神州易主。", src: "——甲申传信录" },
  { line: "请君莫奏前朝曲，听唱新翻杨柳枝。", src: "——历史回响" },
  { line: "迎闯王，不纳粮。", src: "——民谣" },
  { line: "恸哭六军俱缟素，冲冠一怒为红颜。", src: "——吴伟业·圆圆曲" },
  { line: "洪承畴松锦败降，十五万援军尽没。", src: "——辽东纪略" },
  { line: "天雄军一败于巨鹿，卢象升力战殉国。", src: "——明史·卢象升传" },
  { line: "正月元旦，李自成僭位西安，国号大顺。", src: "——明季北略" },
  { line: "四月二十二，山海关一片石，清军铁骑席卷而至。", src: "——清史稿·多尔衮传" },
  { line: "六师屡出，漠北尘清；东自江海，西至流沙，南极炎方，北极瀚海。", src: "——清实录·乾隆朝" },
  { line: "中原板荡，流民裹挟百万。", src: "——明季北略·流寇始末" },
  { line: "拒马在前，铳兵在后，三段轮射以补迟缓。", src: "——纪效新书·操练" },
  { line: "雨天火绳受潮，铳不更用，唯有刀盾。", src: "——武备志" },
];

export const ACTIONS = {
  fire:    ["一铳既发，烟雾蔽目", "火绳明灭，弹丸呼啸", "黑火轰鸣，铳口如雷"],
  reload:  ["以药入膛，以丸压之，火绳复备", "立竿垂囊，三段轮射", "铳兵低眉，慢条斯理"],
  melee:   ["白刃相接，血溅衣裾", "刀兵冲脸，铳不及发", "近身肉搏，铳反成累"],
  execute: ["处决残敌，血溅寒刃", "一刀了事，归营再战"],
  plant:   ["火药埋伏，引线已备", "黑火主仓，一举冲天"],
  defuse:  ["拆解火户，急如星火", "拒敌于仓外，拆本以保全"],
  kill:    ["斩获一员，旌旗猎猎", "敌兵折损，鼓声愈急"],
  death:   ["魂归寨外，遗骨无寻", "天命已尽，归旗于灵"],
};

export const FACTIONS = {
  ming: {
    banner: "明",
    name: "明军",
    eng: "MING DYNASTY",
    color: "#a81818",
    color2: "#5c0d0d",
    desc: "辽东重骑、京津神机营，火器精良。装填快、精度高，可拒马守点，野战稍逊。",
    era: "崇祯年间 · 末世余晖",
    stats: {
      speed: 1.0,
      maxHp: 100,
      armor: 15,
      reloadMul: 1.0,
      precisionMul: 1.0,
      powerMul: 1.0,
      meleeBonus: 1.0,
    },
    weapons: {
      primary:   "ming:matchlock", // 鸟铳
      secondary: "common:saber",  // 腰刀
      melee:     "common:saber",
    },
    perk: "守备固守，装填更快，可部署拒马减伤。",
    perkGameplay: "可右键部署拒马（阻挡冲锋、提供蹲射掩体）；火铳装填 8s（更短）。",
  },
  nong: {
    banner: "闯",
    name: "农民军",
    eng: "REBEL ARMY",
    color: "#3f7a4e",
    color2: "#143e1a",
    desc: "闯营马甲迅捷，近战凶猛。流动作战，机动力强，惜火器不足。",
    era: "大顺永昌 · 抗天命者",
    stats: {
      speed: 1.18,
      maxHp: 90,
      armor: 0,
      reloadMul: 0.7,
      precisionMul: 0.7,
      powerMul: 0.85,
      meleeBonus: 1.25,
    },
    weapons: {
      primary:   "nong:matchlock_short", // 短铳、缴获明军
      secondary: "nong:club",            // 狼牙棒
      melee:     "nong:club",
    },
    perk: "速度最快、近战加成最高、人数优势。",
    perkGameplay: "近战重/轻击伤害 +25%，冲刺速度 +18%，火铳威力与精度折半。",
  },
  qing: {
    banner: "清",
    name: "清军",
    eng: "QING BANNER",
    color: "#c8a05a",
    color2: "#6e5a2a",
    desc: "八旗铁骑重甲横扫。弓骑远程稳定，近战稳健，惜攻坚有限。",
    era: "顺治元年 · 鼎革之际",
    stats: {
      speed: 0.95,
      maxHp: 125,
      armor: 30,
      reloadMul: 0.85,
      precisionMul: 0.9,
      powerMul: 0.9,
      meleeBonus: 1.15,
    },
    weapons: {
      primary:   "qing:matchlock", // 火铳
      secondary: "qing:bow",
      melee:     "qing:dao",
    },
    perk: "血厚甲坚、弓箭稳定可远射、近战稳健。",
    perkGameplay: "最大生命 125，护甲 30；额外配弓（远程稳定、无烟雾无装填）；近战伤害稳健。",
  },
};

// 武器数据（数值即调教用）
export const WEAPONS = {
  "ming:matchlock": {
    name: "鸟铳（精）", kind:"gun",     range: 85,  maxDmg: 78,  spread: 0.018, reloadTime: 7.5, pellet:1, pellets:1,
    smokeL: 0.55, desc:"明军精制火绳铳，装填较稳、烟稍小。"
  },
  "nong:matchlock_short": {
    name: "缴获短铳", kind:"gun",       range: 38,  maxDmg: 60,  spread: 0.045, reloadTime: 11.5,pellet:1, pellets:1,
    smokeL: 0.65, desc:"缴获明军短铳，精度差而乱放。"
  },
  "qing:matchlock": {
    name: "汉军旗铳", kind:"gun",      range: 70,  maxDmg: 72,  spread: 0.025, reloadTime: 8.5, pellet:1, pellets:1,
    smokeL: 0.55, desc:"汉军旗自制火铳，威稳配甲爪手。"
  },
  "common:saber":   { name: "腰刀", kind:"melee",    range: 2.4, dmg: 32, lightTime: 0.5, heavyTime: 0.9, parryTime: 0.45, desc:"明军制式腰刀，轻灵可用。" },
  "nong:club":      { name: "狼牙棒", kind:"melee",  range: 2.6, dmg: 38, lightTime: 0.55,heavyTime: 1.0, parryTime: 0.5, desc:"破甲钝击，近身凶猛。" },
  "qing:dao":       { name: "顺刀", kind:"melee",   range: 2.5, dmg: 34, lightTime: 0.5, heavyTime: 0.85,parryTime: 0.4, desc:"八旗短刀，配合重甲。" },
  "qing:bow":       { name: "角弓", kind:"bow",     range: 65,  maxDmg: 48, spread: 0.018, drawTime: 0.7, desc:"满洲角弓，无烟、稳定。需引弓。" },
};

// 战役时间线（开战背景）
export const BATTLES = [
  { t:"1639", n:"松锦之战（序幕）", d:"清军围锦州，洪承畴督师十三万驻松山，粮道为清所断。" },
  { t:"1642", n:"松山陷", d:"洪承畴兵败被俘，明朝九边精锐尽没。" },
  { t:"1643", n:"潼关败", d:"孙传庭战死潼关，关中门户洞开。" },
  { t:"1644.3",n:"大顺立", d:"李自成僭位西安，国号大顺，改元永昌。" },
  { t:"1644.3",n:"北京陷", d:"三月十八京城陷，崇祯崩于煤山，甲申国变。" },
  { t:"1644.4",n:"山海关", d:"吴三桂引清入关，一片石大捷，多尔衮定鼎燕京。" },
];
