import { _decorator, Component, Label, Vec3, tween, Node } from 'cc';
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
  @property({ type: Node, tooltip: '金币UI根节点（整体抖动）' }) coinsRoot: Node | null = null;
  private coinsTween: any = null;
  private lastCoins: number = 0;

  onLoad() {
    Economy.onCoins(this.updateCoins, this);
    this.updateCoins(Economy.coins);
    this.lastCoins = Economy.coins;
  }

  /** 更新金币显示 */
  updateCoins(v: number) {
    if (this.coinsLabel) this.coinsLabel.string = `${v}`;
    const target: Node | null = this.coinsRoot
      ? this.coinsRoot
      : (this.coinsLabel ? (this.coinsLabel.node.parent || this.coinsLabel.node) : null);
    if (!target) return;
    const inc = v > this.lastCoins;
    this.lastCoins = v;
    if (!inc) return;
    const n = target;
    if (this.coinsTween) { try { this.coinsTween.stop(); } catch {} this.coinsTween = null; }
    const s = n.scale.clone();
    const up = new Vec3(s.x * 1.18, s.y * 1.18, s.z);
    const down = new Vec3(s.x * 0.92, s.y * 0.92, s.z);
    this.coinsTween = (tween as any)(n)
      .to(0.06, { scale: up })
      .to(0.06, { scale: down })
      .to(0.06, { scale: s })
      .call(() => { this.coinsTween = null; })
      .start();
  }

  /** 更新目标提示 */
  setObjective(t: string) {
    if (this.objectiveLabel) this.objectiveLabel.string = t;
  }
}