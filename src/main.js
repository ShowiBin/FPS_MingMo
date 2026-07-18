// 入口：启动游戏、界面状态机
import { Game } from "./engine/Game.js";
import { Menu } from "./ui/Menu.js";

const app = document.getElementById("app");
const game = new Game();
const canvas = document.createElement("canvas");
app.appendChild(canvas);
game.mount(canvas);

const menu = new Menu(game);

window.__game = game; // 调试/自动化测试挂钩

document.getElementById("boot").classList.add("hidden");
menu.showMenu();
