import { _decorator, Component, Node, Vec3, Prefab, instantiate, Camera, Canvas, view, MeshRenderer, SkinnedMeshRenderer } from 'cc';
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
  @property({ min: 0, tooltip: '地面最大物品数量（自动生成）,spawnMode=random时生效，用来限制随机生成的地面物品最大数量。' }) maxItems: number = 10;
  @property({ min: 0, tooltip: '被拾取后重生延迟（秒）' }) respawnSec: number = 3;
  @property({ type: Prefab, tooltip: '自动生成的物品预制体（留空禁用生成）' }) itemPrefab: Prefab | null = null;
  @property({ tooltip: '生成模式：random 或 grid' }) spawnMode: string = 'random';
  @property({ min: 1, tooltip: '网格行数' }) gridRows: number = 3;
  @property({ min: 1, tooltip: '网格列数' }) gridCols: number = 3;
  @property({ min: 0, tooltip: '网格列间距（X）' }) gridColSpacing: number = 20;
  @property({ min: 0, tooltip: '网格行间距（Z）' }) gridRowSpacing: number = 20;
  @property({ tooltip: '为生成物体挂 CollectItem 组件' }) attachCollectItem: boolean = false;
  @property({ type: Node, tooltip: '用于可视裁剪的世界摄像机（不设置则自动选择）' }) cullCameraNode: Node | null = null;
  @property({ tooltip: '启用摄像机可视裁剪' }) cullEnabled: boolean = true;
  @property({ min: 0, tooltip: '裁剪检测间隔（秒）' }) cullInterval: number = 0.2;
  @property({ min: 0, tooltip: '屏幕X方向提前显示边距（像素）' }) cullMarginX: number = 350;
  @property({ min: 0, tooltip: '屏幕Y方向提前显示边距（像素）' }) cullMarginY: number = 200;
  @property({ min: 0, tooltip: '相机世界裁剪半径（XZ），0为禁用' }) cullRadius: number = 0;
  @property({ min: 0, tooltip: '视野内最大显示数量（0为无限）' }) maxVisible: number = 0;
  @property({ tooltip: '自动根据性能调整裁剪参数' }) autoTune: boolean = true;
  @property({ min: 1, tooltip: '自动调参采样秒数' }) autoTuneSampleSec: number = 3;

  private acc = 0;
  private accCull = 0;
  private items: Node[] = [];
  private itemRenderers: Map<Node, (MeshRenderer | SkinnedMeshRenderer)[]> = new Map();
  private tuneDone = false;
  private tuneTime = 0;
  private tuneFrames = 0;

  onLoad() {
    this.spawnInitial();
  }

  /** 生成初始地面物品（仅在启用自动生成时生效） */
  spawnInitial() {
    if (this.spawnMode === 'grid') {
      this.spawnGrid();
      return;
    }
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
    if (this.attachCollectItem) n.addComponent(CollectItem);
    this.items.push(n);
    this.cacheItemRenderers(n);
  }

  private spawnGrid() {
    if (!this.itemPrefab) return;
    const rows = Math.max(1, this.gridRows | 0);
    const cols = Math.max(1, this.gridCols | 0);
    const sx = this.gridColSpacing;
    const sz = this.gridRowSpacing;
    const halfW = (cols - 1) * sx * 0.5;
    const halfH = (rows - 1) * sz * 0.5;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const n = instantiate(this.itemPrefab);
        n.parent = this.node;
        const x = c * sx - halfW;
        const z = -r * sz + halfH;
        n.setPosition(x, 0, z);
        if (this.attachCollectItem) n.addComponent(CollectItem);
        this.items.push(n);
        this.cacheItemRenderers(n);
      }
    }
  }

  /** 玩家靠近后按速率自动拾取最近物品，并触发其复活 */
  update(dt: number) {
    if (this.autoTune && !this.tuneDone) {// 自动调参,根据不同 FPS 调整参数，低于 45 FPS 时，最大显示数量 60，裁剪间隔 0.5 秒，裁剪半径 15，裁剪边距 150px，70px
      this.tuneTime += dt;
      this.tuneFrames += 1;
      if (this.tuneTime >= this.autoTuneSampleSec) {
        const fps = this.tuneFrames / this.tuneTime;
        if (fps < 45) {
          this.maxVisible = this.maxVisible > 0 ? Math.min(this.maxVisible, 60) : 60;
          this.cullInterval = Math.max(this.cullInterval, 0.5);
          this.cullRadius = this.cullRadius > 0 ? Math.min(this.cullRadius, 15) : 15;
          this.cullMarginX = Math.max(150, this.cullMarginX);
          this.cullMarginY = Math.max(70, this.cullMarginY);
        } else if (fps < 55) {
          this.maxVisible = this.maxVisible > 0 ? Math.min(this.maxVisible, 100) : 100;
          this.cullInterval = Math.max(this.cullInterval, 0.35);
          this.cullRadius = this.cullRadius > 0 ? Math.max(this.cullRadius, 20) : 20;
          this.cullMarginX = Math.max(200, this.cullMarginX);
          this.cullMarginY = Math.max(100, this.cullMarginY);
        } else {
          this.maxVisible = this.maxVisible > 0 ? Math.min(this.maxVisible, 200) : 200;
          this.cullInterval = Math.max(this.cullInterval, 0.25);
          this.cullRadius = this.cullRadius > 0 ? Math.max(this.cullRadius, 800) : 800;
          this.cullMarginX = Math.max(300, this.cullMarginX);
          this.cullMarginY = Math.max(200, this.cullMarginY);
        }
        this.tuneDone = true;
      }
    }
    if (this.cullEnabled) {
      this.accCull += dt;
      if (this.accCull >= this.cullInterval) {
        this.accCull = 0;
        this.applyCulling();
      }
    }
    if (this.attachCollectItem) return;
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
      const carry: Node | null = ci ? (ci as any)['createCarryNode']?.() as Node | null : instantiate(item);
      if (!carry) return;
      const comps = carry.getComponentsInChildren(CollectItem);
      for (const c of comps) { c.enabled = false; c.destroy(); }
      if (p.tryAddFlowerItem(carry)) this.onCollected(item);
      else carry.destroy();
    }
  }

  private cacheItemRenderers(n: Node) {
    const mrs = n.getComponentsInChildren(MeshRenderer);
    const srs = n.getComponentsInChildren(SkinnedMeshRenderer);
    this.itemRenderers.set(n, [...mrs, ...srs]);
  }

  private getWorldCamera(): Camera | null {
    const n = this.cullCameraNode;
    const cam = n ? n.getComponent(Camera) : null;
    if (cam) return cam;
    const scene = this.node.scene;
    if (!scene) return null;
    const cams = scene.getComponentsInChildren(Camera);
    const list = cams.filter(c => {
      let p: Node | null = c.node;
      while (p) {
        if (p.getComponent(Canvas)) return false;
        p = p.parent;
      }
      return true;
    });
    return (list[0] || cams[0] || null);
  }

  private applyCulling() {
    if (!this.cullEnabled) return;
    const cam = this.getWorldCamera();
    if (!cam) return;
    const vs = view.getVisibleSize();
    const w = vs.width, h = vs.height;
    const camPos = cam.node.worldPosition.clone();
    const inViewList: { node: Node; dist2: number }[] = [];
    for (const it of this.items) {
      if (!it || !it.isValid) continue;
      const sp = cam.worldToScreen(it.worldPosition.clone());
      let inView = sp.z > 0 && sp.x >= -this.cullMarginX && sp.x <= w + this.cullMarginX && sp.y >= -this.cullMarginY && sp.y <= h + this.cullMarginY;
      if (!inView && this.cullRadius <= 0) {
        const rs0 = this.itemRenderers.get(it) || [];
        for (const r of rs0) { r.enabled = false; }
        continue;
      }
      const dx = it.worldPosition.x - camPos.x;
      const dz = it.worldPosition.z - camPos.z;
      const d2 = dx * dx + dz * dz;
      const radiusOk = this.cullRadius <= 0 || d2 <= this.cullRadius * this.cullRadius;
      if (inView && radiusOk) inViewList.push({ node: it, dist2: d2 });
      else {
        const rs = this.itemRenderers.get(it) || [];
        for (const r of rs) { r.enabled = false; }
      }
    }
    if (this.maxVisible > 0 && inViewList.length > this.maxVisible) {
      inViewList.sort((a, b) => a.dist2 - b.dist2);
      const keep = new Set<Node>();
      for (let i = 0; i < this.maxVisible; i++) keep.add(inViewList[i].node);
      for (const it of this.items) {
        const rs = this.itemRenderers.get(it) || [];
        const on = keep.has(it);
        for (const r of rs) { r.enabled = on; }
      }
    } else {
      for (const it of this.items) {
        const rs = this.itemRenderers.get(it) || [];
        const on = inViewList.find(x => x.node === it) != null;
        for (const r of rs) { r.enabled = on; }
      }
    }
  }

  /** 手动重置自动调参采样（例如切场景或进入大区域后调用） */
  public resetAutoTune() {
    this.tuneDone = false;
    this.tuneTime = 0;
    this.tuneFrames = 0;
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