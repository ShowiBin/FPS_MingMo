// 阵营工具：单一数据源在 data/history.js
import { FACTIONS } from "../data/history.js";

export function getFaction(key) { return FACTIONS[key]; }
export function factionList() { return Object.keys(FACTIONS).map(k => ({ key: k, ...FACTIONS[k] })); }
export function opponentOf(key) {
  const map = { ming: "qing", nong: "ming", qing: "nong" };
  return map[key] || "qing";
}
export { FACTIONS };
