import { _decorator, Component, Node, Vec3, Prefab, instantiate } from 'cc';
import { PlayerController } from './PlayerController';
const { ccclass, property } = _decorator;

/**
 * Market 市场。
 * - 玩家靠近后按 `sellRate` 将身上的面包售卖为若干金币。
 * - 金币以网格排列摆放在 `coinSpawnRoot`，随后在 `coinPickupRadius` 范围按 `coinPickupRate` 被玩家拾取。
 * 使用：挂在市场节点上并设置金币预制体与摆放父节点。
 */
@ccclass('Market')
export class Market extends Component {
  @property({ min: 0.1, tooltip: '玩家靠近判定半径（XZ）' }) radius: number = 60;
  @property({ min: 0.1, tooltip: '售卖速率（个/秒）' }) sellRate: number = 3;
  @property({ min: 0, tooltip: '单次售卖生成的金币数量' }) price: number = 5;
  @property({ type: Prefab, tooltip: '金币预制体' }) coinPrefab: Prefab | null = null;
  @property({ type: Node, tooltip: '金币摆放父节点' }) coinSpawnRoot: Node | null = null;
  @property({ min: 1, tooltip: '金币摆放最大数量' }) coinPlacedMax: number = 30;
  @property({ min: 1, tooltip: '金币摆放列数' }) coinPlacedColumns: number = 5;
  @property({ min: 0, tooltip: '列间距（X）' }) coinPlacedColSpacing: number = 18;
  @property({ min: 0, tooltip: '行间距（Y）' }) coinPlacedRowSpacing: number = 10;
  @property({ min: 0, tooltip: '起始高度（Y）' }) coinPlacedBaseY: number = 0;
  @property({ min: 0, tooltip: '前方偏移量（Z负）' }) coinPlacedOffsetZ: number = 40;
  @property({ min: 0.1, tooltip: '金币拾取区域半径（XZ）' }) coinPickupRadius: number = 60;
  @property({ min: 0.1, tooltip: '金币拾取速率（个/秒）' }) coinPickupRate: number = 5;

  private acc = 0;
  private accCoinPickup = 0;
  private coinPlaced: Node[] = [];

  /**
   * 主循环：
   * 1) 玩家近距离售卖面包并在摆放区生成金币；2) 玩家在金币拾取范围内将金币加入自身堆叠。
   */
  update(dt: number) {
    const p = this.findPlayer();
    if (!p) return;
    const d = this.distanceTo(p.node.worldPosition);
    if (d <= this.radius) {
      this.acc += dt;
      if (this.acc >= 1 / this.sellRate) {
        this.acc = 0;
        const moved = p.removeBread(1);
        if (moved > 0 && this.coinPrefab && this.coinSpawnRoot) {
          for (let i = 0; i < this.price; i++) {
            if (this.coinPlaced.length >= this.coinPlacedMax) break;
            const n = instantiate(this.coinPrefab);
            n.parent = this.coinSpawnRoot;
            const idx = this.coinPlaced.length;
            const col = idx % this.coinPlacedColumns;
            const row = Math.floor(idx / this.coinPlacedColumns);
            const x = (col - (this.coinPlacedColumns - 1) * 0.5) * this.coinPlacedColSpacing;
            const y = this.coinPlacedBaseY + row * this.coinPlacedRowSpacing;
            const z = -this.coinPlacedOffsetZ;
            n.setPosition(x, y, z);
            this.coinPlaced.push(n);
          }
        }
      }
    }

    const d2 = this.distanceTo(p.node.worldPosition);
    if (d2 <= this.coinPickupRadius) {
      this.accCoinPickup += dt;
      if (this.accCoinPickup >= 1 / this.coinPickupRate) {
        this.accCoinPickup = 0;
        const item = this.coinPlaced[0];
        if (item && p.tryAddCoinItem(item)) {
          this.coinPlaced.shift();
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

  /** 计算当前市场到某世界位置的 XZ 平面距离。 */
  private distanceTo(pos: Vec3): number {
    const a = this.node.worldPosition;
    return Math.hypot(a.x - pos.x, a.z - pos.z);
  }
}