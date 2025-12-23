import { _decorator, Component, Node, Prefab, instantiate, Vec3 } from 'cc';
import { PlayerController } from './PlayerController';
const { ccclass, property } = _decorator;

@ccclass('CollectItem')
export class CollectItem extends Component {
  @property({ min: 0.1, tooltip: '靠近拾取的半径（XZ平面）' }) pickupRadius: number = 2;
  @property({ min: 0, tooltip: '被采集后重生所需的秒数' }) respawnSec: number = 3;
  @property({ min: 0, tooltip: '距离检测的时间间隔（秒；0为每帧）' }) scanInterval: number = 0.1;
  @property({ type: Prefab, tooltip: '被携带时使用的预制体（留空则克隆自身）' }) carryPrefab: Prefab | null = null;

  private acc = 0;
  private collected = false;

  /**
   * 距离检测与采集逻辑，按 `scanInterval` 进行间隔采样（0 为每帧）。
   * 玩家进入 `pickupRadius` 后尝试生成携带节点并交给玩家。
   */
  update(dt: number) {
    this.acc += dt;
    if (this.acc < this.scanInterval) return;
    this.acc = 0;
    if (!this.node.active || this.collected) return;
    const p = this.findPlayer();
    if (!p) return;
    const d = this.distanceXZ(p.node.worldPosition, this.node.worldPosition);
    if (d > this.pickupRadius) return;
    const carry = this.createCarryNode();
    if (carry && p.tryAddFlowerItem(carry)) {
      this.collected = true;
      this.node.active = false;
      this.scheduleOnce(() => {
        this.node.active = true;
        this.collected = false;
      }, this.respawnSec);
    } else if (carry) {
      carry.destroy();
    }
  }

  /**
   * 生成用于玩家携带的节点，并移除内部的 CollectItem 组件以避免递归采集。
   */
  private createCarryNode(): Node | null {
    const clone: Node = this.carryPrefab ? instantiate(this.carryPrefab) : instantiate(this.node);
    const wp = this.node.worldPosition.clone();
    clone.setWorldPosition(wp);
    const comps = clone.getComponentsInChildren(CollectItem);
    for (const c of comps) { c.enabled = false; c.destroy(); }
    return clone;
  }

  /** 在场景中查找 `PlayerController`（取第一个） */
  private findPlayer(): PlayerController | null {
    const s = this.node.scene;
    if (!s) return null;
    const list = s.getComponentsInChildren(PlayerController);
    return list.length > 0 ? list[0] : null;
  }

  /** 计算两点在 XZ 平面上的距离 */
  private distanceXZ(a: Vec3, b: Vec3): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }
}