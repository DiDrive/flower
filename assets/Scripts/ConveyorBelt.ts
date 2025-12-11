import { _decorator, Component, Node, Vec3, MeshRenderer, Vec4 } from 'cc';
const { ccclass, property } = _decorator;

/**
 * ConveyorBelt 传送带组件。
 * - 让注册的物品沿 `path` 路径节点平滑移动。
 * - 通过 `beltMesh` 的材质属性实现 UV 滚动视觉效果。
 * 使用：在场景中放置若干路径节点，设置到 `path`，调用 `registerItem(node)` 让物品开始沿带移动。
 */
interface Rider {
  node: Node;
  distance: number;
}

@ccclass('ConveyorBelt')
export class ConveyorBelt extends Component {
  @property({ type: [Node], tooltip: '路径节点序列（世界坐标）' }) path: Node[] = [];
  @property({ type: MeshRenderer, tooltip: '传送带网格渲染器（用于UV滚动）' }) beltMesh: MeshRenderer | null = null;
  @property({ tooltip: '物品沿路径移动的速度（单位/秒）' }) speed: number = 1.5;
  @property({ tooltip: 'UV 滚动速度（偏移/秒）' }) uvScrollSpeed: number = 0.4;

  private riders: Rider[] = [];
  private positions: Vec3[] = [];
  private segmentLens: number[] = [];
  private totalLen = 0;
  private uvOffset = 0;

  onLoad() {
    // 初始化路径数据
    this.refreshPath();
  }

  /** 根据路径节点刷新采样数据（段长度与总长度）。 */
  refreshPath() {
    this.positions = this.path.map(n => n.worldPosition.clone());
    this.segmentLens = [];
    this.totalLen = 0;
    for (let i = 0; i < this.positions.length - 1; i++) {
      const len = Vec3.distance(this.positions[i], this.positions[i + 1]);
      this.segmentLens.push(len);
      this.totalLen += len;
    }
  }

  /** 注册一个物品到传送带，初始位置为路径起点。 */
  registerItem(node: Node) {
    this.riders.push({ node, distance: 0 });
    const p = this.sample(0);
    node.setWorldPosition(p);
  }

  update(dt: number) {
    if (this.positions.length < 2) return;
    // 推进物品移动并滚动 UV
    this.advanceItems(dt);
    this.scrollUV(dt);
  }

  /** 推进所有注册物品的沿路径位置，并在到达终点时移除。 */
  private advanceItems(dt: number) {
    const speed = this.speed;
    for (let i = this.riders.length - 1; i >= 0; i--) {
      const r = this.riders[i];
      r.distance += speed * dt;
      if (r.distance >= this.totalLen) {
        // 到达终点，移除并钩子可在外部处理（例如喂给市场）
        this.riders.splice(i, 1);
        continue;
      }
      const pos = this.sample(r.distance);
      r.node.setWorldPosition(pos);
    }
  }

  /** 在路径上按累计距离 `d` 进行线性插值采样到世界坐标。 */
  private sample(d: number): Vec3 {
    let acc = 0;
    for (let i = 0; i < this.segmentLens.length; i++) {
      const len = this.segmentLens[i];
      if (d <= acc + len) {
        const t = (d - acc) / len;
        const a = this.positions[i];
        const b = this.positions[i + 1];
        const out = new Vec3(
          a.x + (b.x - a.x) * t,
          a.y + (b.y - a.y) * t,
          a.z + (b.z - a.z) * t,
        );
        return out;
      }
      acc += len;
    }
    return this.positions[this.positions.length - 1].clone();
  }

  /** 滚动传送带材质的 `tilingOffset` 以产生移动效果。 */
  private scrollUV(dt: number) {
    if (!this.beltMesh) return;
    const mi = this.beltMesh.getMaterialInstance(0);
    if (!mi) return;
    this.uvOffset = (this.uvOffset + this.uvScrollSpeed * dt) % 1;
    const cur = mi.getProperty('tilingOffset') as Vec4 | null;
    const uScale = cur ? cur.x : 1;
    const vScale = cur ? cur.y : 1;
    const vOffset = cur ? cur.w : 0;
    mi.setProperty('tilingOffset', new Vec4(uScale, vScale, this.uvOffset, vOffset));
  }
}