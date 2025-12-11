import { _decorator, Component, Node, Vec3, Label } from 'cc';
import { Economy } from './Economy';
import { PlayableBridge } from '../PlayableFramework/PlayableBridge';
import { PlayerController } from './PlayerController';
const { ccclass, property } = _decorator;

/**
 * ExpansionZone 扩张区域。
 * - 玩家靠近并消耗携带的金币达到 `cost` 后标记完成并触发下载/商店跳转。
 * - `label` 显示当前所需金币或完成状态。
 * 使用：放置在需要扩张的区域入口处。
 */
@ccclass('ExpansionZone')
export class ExpansionZone extends Component {
  @property({ min: 0.1, tooltip: '玩家靠近判定半径（XZ）' }) radius: number = 60;
  @property({ min: 0, tooltip: '扩张所需金币，完成后触发CTA' }) cost: number = 100;
  @property({ type: Label, tooltip: '显示扩张所需金币或完成状态' }) label: Label | null = null;
  private done = false;

  onLoad() {
    if (this.label) this.label.string = `${this.cost}`;
  }

  update(dt: number) {
    if (this.done) return;
    const p = this.findPlayer();
    if (!p) return;
    const d = this.distanceTo(p.node.worldPosition);
    if (d > this.radius) return;
    const removed = p.removeCoin(this.cost);
    if (removed >= this.cost) {
      this.done = true;
      if (this.label) this.label.string = `OK`;
      PlayableBridge.openStore();
    }
  }

  private findPlayer(): PlayerController | null {
    const n = this.node.scene;
    if (!n) return null;
    const list = n.getComponentsInChildren(PlayerController);
    return list.length > 0 ? list[0] : null;
  }

  private distanceTo(pos: Vec3): number {
    const a = this.node.worldPosition;
    return Math.hypot(a.x - pos.x, a.z - pos.z);
  }
}