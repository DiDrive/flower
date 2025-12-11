import { _decorator, Component, Node, Vec3, Prefab, instantiate } from 'cc';
import { ProductState } from './ProductState';
import { PlayerController } from './PlayerController';
const { ccclass, property } = _decorator;

/**
 * Factory 工厂。
 * - 玩家靠近后按 `inputRate` 从玩家身上取入花朵进入队列。
 * - 队列按 `produceRate` 产出面包，放置到 `spawnRoot`，按摆放参数整齐排列。
 * - 玩家在 `pickupRadius` 范围按 `pickupRate` 从摆放区拾取面包到自身堆叠。
 * 使用：将该组件挂在工厂节点上，并设置相关预制体与摆放父节点。
 */
@ccclass('Factory')
export class Factory extends Component {
  @property({ min: 0.1, tooltip: '玩家靠近判定半径（XZ）' }) radius: number = 60;
  @property({ min: 0.1, tooltip: '花朵转入队列速率（次/秒）' }) inputRate: number = 3;
  @property({ min: 0.1, tooltip: '面包产出速率（个/秒）' }) produceRate: number = 2;
  @property({ min: 0, tooltip: '生产队列最大容量' }) queueMax: number = 10;
  @property({ type: Prefab, tooltip: '面包预制体' }) breadPrefab: Prefab | null = null;
  @property({ type: Node, tooltip: '面包摆放父节点' }) spawnRoot: Node | null = null;
  @property({ min: 1, tooltip: '面包摆放最大数量' }) placedMax: number = 12;
  @property({ min: 1, tooltip: '摆放列数' }) placedColumns: number = 3;
  @property({ min: 0, tooltip: '列间距（X）' }) placedColSpacing: number = 20;
  @property({ min: 0, tooltip: '行间距（Y）' }) placedRowSpacing: number = 20;
  @property({ min: 0, tooltip: '起始高度（Y）' }) placedBaseY: number = 0;
  @property({ min: 0, tooltip: '前方偏移量（Z负）' }) placedOffsetZ: number = 40;
  @property({ min: 0.1, tooltip: '面包拾取区域半径（XZ）' }) pickupRadius: number = 60;
  @property({ min: 0.1, tooltip: '面包拾取速率（个/秒）' }) pickupRate: number = 3;
  @property({ min: 0, tooltip: '测试：半成品转成品的延时（秒）' }) finalizeDelaySec: number = 0;

  private accIn = 0;
  private accOut = 0;
  private queue = 0;
  private accPickup = 0;
  private placed: Node[] = [];
  private finalizePend: { n: Node; t: number }[] = [];

  /**
   * 主循环：
   * 1) 取入花朵进入生产队列；2) 队列出面包并摆放；3) 玩家近距离拾取面包。
   */
  update(dt: number) {
    if (this.finalizeDelaySec > 0) {
      for (let i = this.finalizePend.length - 1; i >= 0; i--) {
        const it = this.finalizePend[i];
        it.t -= dt;
        if (it.t <= 0) {
          const ps = it.n.getComponentInChildren(ProductState);
          if (ps) ps.setFinal();
          this.finalizePend.splice(i, 1);
        }
      }
      for (const n of this.placed) {
        const already = this.finalizePend.find(x => x.n === n);
        if (already) continue;
        const ps = n.getComponentInChildren(ProductState);
        if (ps && ps.getState() === 'semi') this.finalizePend.push({ n, t: this.finalizeDelaySec });
      }
    }
    const p = this.findPlayer();
    if (p) {
      const d = this.distanceTo(p.node.worldPosition);
      if (d <= this.radius) {
        this.accIn += dt;
        if (this.accIn >= 1 / this.inputRate) {
          this.accIn = 0;
          if (this.queue < this.queueMax) {
            const moved = p.removeFlower(1);
            if (moved > 0) this.queue += moved;
          }
        }
      }
    }
    if (this.queue > 0) {
      this.accOut += dt;
      if (this.accOut >= 1 / this.produceRate) {
        this.accOut = 0;
        if (this.breadPrefab && this.spawnRoot && this.placed.length < this.placedMax) {
          const n = instantiate(this.breadPrefab);
          n.parent = this.spawnRoot;
          const ps = n.getComponentInChildren(ProductState);
          if (ps) ps.setSemi();
          if (this.finalizeDelaySec > 0) this.finalizePend.push({ n, t: this.finalizeDelaySec });
          const idx = this.placed.length;
          const col = idx % this.placedColumns;
          const row = Math.floor(idx / this.placedColumns);
          const x = (col - (this.placedColumns - 1) * 0.5) * this.placedColSpacing;
          const y = this.placedBaseY + row * this.placedRowSpacing;
          const z = -this.placedOffsetZ;
          n.setPosition(x, y, z);
          this.placed.push(n);
          this.queue -= 1;
        }
      }
    }

    if (p) {
      const d2 = this.distanceTo(p.node.worldPosition);
      if (d2 <= this.pickupRadius) {
        this.accPickup += dt;
        if (this.accPickup >= 1 / this.pickupRate) {
          this.accPickup = 0;
          const item = this.placed[0];
          if (item && p.tryAddBreadItem(item)) {
            this.placed.shift();
          }
        }
      }
    }
  }

  /** 在场景中查找 `PlayerController`（取第一个）。 */
  private findPlayer(): PlayerController | null {
    const n = this.node.scene;
    if (!n) return null;
    const list = n.getComponentsInChildren(PlayerController);
    return list.length > 0 ? list[0] : null;
  }

  /** 计算当前工厂到某世界位置的 XZ 平面距离。 */
  private distanceTo(pos: Vec3): number {
    const a = this.node.worldPosition;
    return Math.hypot(a.x - pos.x, a.z - pos.z);
  }
}