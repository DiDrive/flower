import { _decorator, Component, Label } from 'cc';
import { Economy } from './Economy';
const { ccclass, property } = _decorator;

/**
 * HUD 游戏信息显示。
 * - 显示当前金币与目标提示文本。
 * - 订阅 `Economy` 的金币变更事件自动刷新。
 */
@ccclass('HUD')
export class HUD extends Component {
  @property({ type: Label, tooltip: '显示当前金币数的标签' }) coinsLabel: Label | null = null;
  @property({ type: Label, tooltip: '显示当前目标提示的标签' }) objectiveLabel: Label | null = null;

  onLoad() {
    Economy.onCoins(this.updateCoins, this);
    this.updateCoins(Economy.coins);
  }

  /** 更新金币显示 */
  updateCoins(v: number) {
    if (this.coinsLabel) this.coinsLabel.string = `${v}`;
  }

  /** 更新目标提示 */
  setObjective(t: string) {
    if (this.objectiveLabel) this.objectiveLabel.string = t;
  }
}