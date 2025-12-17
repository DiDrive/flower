import { _decorator, Component, Node, Vec3, tween, Mat4 } from 'cc';
const { ccclass, property } = _decorator;

/**
 * CollectStack 物品堆叠组件。
 * - 将传入的物品节点按照列/行在人物前方整齐摆放。
 * - 通过 `columns/colSpacing/rowSpacing/offsetZ/baseY/capacity` 控制堆叠形态与容量。
 * 使用：挂在玩家的某个 Anchor 子节点（花朵/面包/金币各自一个）。
 */
@ccclass('CollectStack')
export class CollectStack extends Component {
  @property({ type: Node, tooltip: '堆叠的父节点（人物前方）' }) anchor: Node | null = null;
  @property({ min: 1, tooltip: '堆叠的列数' }) columns: number = 1;
  @property({ min: 0, tooltip: '列间距（X方向）' }) colSpacing: number = 20;
  @property({ min: 0, tooltip: '行间距（Y方向）' }) rowSpacing: number = 20;
  @property({ min: 0, tooltip: '前方偏移量（Z负方向）' }) offsetZ: number = 40;
  @property({ min: 0, tooltip: '起始高度（Y）' }) baseY: number = 0;
  @property({ min: 1, tooltip: '堆叠容量上限' }) capacity: number = 10;

  private items: Node[] = [];

  /** 当前堆叠中的物品数量 */
  count() {
    return this.items.length;
  }

  /**
   * 尝试加入一个物品到堆叠。
   * 返回 true 表示成功（并将物品位置缓动到栈位）。
   */
  tryAddItem(item: Node) {
    const parent = this.anchor ?? this.node;
    if (!parent) return false;
    if (this.items.length >= this.capacity) return false;
    const idx = this.items.length;
    const col = idx % this.columns;
    const row = Math.floor(idx / this.columns);
    const x = (col - (this.columns - 1) * 0.5) * this.colSpacing;
    const y = this.baseY + row * this.rowSpacing;
    const z = -this.offsetZ;
    item.parent = parent;
    tween(item).to(0.15, { position: new Vec3(x, y, z) }).start();
    this.items.push(item);
    return true;
  }

  popTopRaw(): Node | null {
    const it = this.items.pop();
    if (!it) return null;
    return it;
  }

  /**
   * 从顶部移除 n 个物品并销毁其节点，返回实际移除数量。
   */
  removeTop(n: number) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const it = this.items.pop();
      if (!it) break;
      moved += 1;
      it.destroy();
    }
    return moved;
  }

  /**
   * 将顶部一个物品以动画飞向目标世界位置并销毁。
   * 返回 true 表示存在物品并已触发动画。
   */
  popTopToWorld(parent: Node, targetWorld: Vec3, duration: number = 0.25) {
    const it = this.items.pop();
    if (!it) return false;
    const start = it.worldPosition.clone();
    it.parent = parent;
    it.setWorldPosition(start);
    const inv = new Mat4();
    Mat4.invert(inv, parent.worldMatrix);
    const lp = new Vec3();
    Vec3.transformMat4(lp, targetWorld, inv);
    tween(it).to(duration, { position: lp }).call(() => { it.destroy(); }).start();
    return true;
  }
}