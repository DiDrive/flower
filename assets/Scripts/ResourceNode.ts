import { _decorator, Component, Node, Vec3, Prefab, instantiate } from 'cc';
import { PlayerController } from './PlayerController';
import { CollectItem } from './CollectItem';
const { ccclass, property } = _decorator;

/**
 * ResourceNode 采集点。
 * - 可选自动生成地面物品：当设置 `itemPrefab` 时，按 `maxItems` 与半径随机生成初始物品。
 * - 玩家靠近后按 `pickupRate` 自动从地面最近的物品生成“可携带副本”交给玩家，并让地面物品进入 `respawnSec` 的复活。
 * - 若不设置 `itemPrefab`，可在编辑器手动摆放物品并挂 `CollectItem`，依旧具备靠近拾取与复活逻辑。
 * 使用：挂在一个采集点节点，设置半径与速率参数。
 */
@ccclass('ResourceNode')
export class ResourceNode extends Component {
  @property({ min: 0.1, tooltip: '玩家靠近判定半径（XZ）' }) radius: number = 60;
  @property({ min: 0.1, tooltip: '自动模式下的拾取速率（次/秒）' }) pickupRate: number = 2;
  @property({ min: 0, tooltip: '地面最大物品数量（自动生成）' }) maxItems: number = 10;
  @property({ min: 0, tooltip: '被拾取后重生延迟（秒）' }) respawnSec: number = 3;
  @property({ type: Prefab, tooltip: '自动生成的物品预制体（留空禁用生成）' }) itemPrefab: Prefab | null = null;

  private acc = 0;
  private items: Node[] = [];

  onLoad() {
    this.spawnInitial();
  }

  /** 生成初始地面物品（仅在启用自动生成时生效） */
  spawnInitial() {
    const count = this.maxItems;
    for (let i = 0; i < count; i++) this.spawnOne();
  }

  /** 随机在半径内生成一个地面物品并挂上 CollectItem 组件 */
  spawnOne() {
    if (!this.itemPrefab) return;
    if (this.items.length >= this.maxItems) return;
    const n = instantiate(this.itemPrefab);
    n.parent = this.node;
    const r = this.radius * 0.6;
    const angle = Math.random() * Math.PI * 2;
    const dist = r * (0.3 + 0.7 * Math.random());
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    n.setPosition(x, 0, z);
    n.addComponent(CollectItem);
    this.items.push(n);
  }

  /** 玩家靠近后按速率自动拾取最近物品，并触发其复活 */
  update(dt: number) {
    const p = this.findPlayer();
    if (!p) return;
    const d = this.distanceTo(p.node.worldPosition);
    if (d > this.radius) return;
    this.acc += dt;
    if (this.acc >= 1 / this.pickupRate) {
      this.acc = 0;
      const item = this.findNearestItem();
      if (!item) return;
      const ci = item.getComponent(CollectItem);
      const carry: Node = ci && ci.carryPrefab ? instantiate(ci.carryPrefab) : instantiate(item);
      const comps = carry.getComponentsInChildren(CollectItem);
      for (const c of comps) { c.enabled = false; c.destroy(); }
      if (p.tryAddFlowerItem(carry)) this.onCollected(item);
      else carry.destroy();
    }
  }

  /** 在场景中查找 `PlayerController`（取第一个）。 */
  private findPlayer(): PlayerController | null {
    const n = this.node.scene;
    if (!n) return null;
    const list = n.getComponentsInChildren(PlayerController);
    return list.length > 0 ? list[0] : null;
  }

  /** 计算采集点到某世界位置的 XZ 平面距离。 */
  private distanceTo(pos: Vec3): number {
    const a = this.node.worldPosition;
    return Math.hypot(a.x - pos.x, a.z - pos.z);
  }

  /** 寻找当前采集点下最近的活动物品节点 */
  private findNearestItem(): Node | null {
    let best: Node | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      if (!it.parent || it.parent !== this.node) continue;
      if (!it.activeInHierarchy) continue;
      const d = this.distanceTo(it.worldPosition);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  /** 当物品被采集时隐藏它并在 `respawnSec` 后重新激活 */
  private onCollected(item: Node) {
    item.active = false;
    this.scheduleOnce(() => {
      if (item && item.isValid) item.active = true;
    }, this.respawnSec);
  }
}