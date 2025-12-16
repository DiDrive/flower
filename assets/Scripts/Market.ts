import { _decorator, Component, Node, Prefab, instantiate, Collider, ITriggerEvent, BoxCollider, Vec3, Vec4, MeshRenderer, SkinnedMeshRenderer, Color, Mat4 } from 'cc';
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
  @property({ min: 0.1, tooltip: '金币拾取速率（个/秒）' }) coinPickupRate: number = 5;
  @property({ type: Node, tooltip: '售卖区域触发器节点' }) sellArea: Node | null = null;
  @property({ type: Node, tooltip: '拾取区域触发器节点' }) pickupArea: Node | null = null;
  @property({ tooltip: '进入区域高亮颜色' }) enterColor: Color = new Color(255, 216, 51, 255);

  private acc = 0;
  private accCoinPickup = 0;
  private coinPlaced: Node[] = [];
  private sellHit = false;
  private pickupHit = false;
  private areas: { node: Node; col: Collider; setter: (v: boolean) => void; renders: { r: MeshRenderer | SkinnedMeshRenderer; orig: any[]; colors: any[] }[]; inside: boolean }[] = [];

  /**
   * 主循环：
   * 1) 玩家近距离售卖面包并在摆放区生成金币；2) 玩家在金币拾取范围内将金币加入自身堆叠。
   */
  onLoad() {
    this.bindAreaTrigger(this.sellArea, (v) => { this.sellHit = v; });
    this.bindAreaTrigger(this.pickupArea, (v) => { this.pickupHit = v; });
  }

  /** 助手售卖面包：按当前价格生成金币到摆放区 */
  spawnCoinsFor(breads: number) {
    if (!this.coinPrefab || !this.coinSpawnRoot) return
    const total = breads * this.price
    for (let i = 0; i < total; i++) {
      if (this.coinPlaced.length >= this.coinPlacedMax) break
      const n = instantiate(this.coinPrefab)
      n.parent = this.coinSpawnRoot
      const idx = this.coinPlaced.length
      const col = idx % this.coinPlacedColumns
      const row = Math.floor(idx / this.coinPlacedColumns)
      const x = (col - (this.coinPlacedColumns - 1) * 0.5) * this.coinPlacedColSpacing
      const y = this.coinPlacedBaseY + row * this.coinPlacedRowSpacing
      const z = -this.coinPlacedOffsetZ
      n.setPosition(x, y, z)
      this.coinPlaced.push(n)
    }
  }

  update(dt: number) {
    const p = this.findPlayer();
    if (!p) return;
    for (const it of this.areas) {
      const inside = this.isInsideAreaXZ(p.node.worldPosition, it.node, it.col);
      it.setter(inside);
      if (inside !== it.inside) {
        it.inside = inside;
        if (inside) this.applyAreaColor(it, this.enterColor);
        else this.restoreAreaColor(it);
      }
    }
    if (this.sellHit) {
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

    if (this.pickupHit) {
      this.accCoinPickup += dt;
      if (this.accCoinPickup >= 1 / this.coinPickupRate) {
        this.accCoinPickup = 0;
        const idx = this.coinPlaced.length - 1;
        const item = idx >= 0 ? this.coinPlaced[idx] : null;//倒序，视觉上从堆最上方开始拾取
        if (item && p.tryAddCoinItem(item)) {
          this.coinPlaced.pop();
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

  

  private bindAreaTrigger(node: Node | null, setter: (v: boolean) => void) {
    if (!node) return;
    const col = node.getComponent(Collider) || node.getComponentInChildren(Collider);
    if (!col) return;
    console.log('[Market] bindAreaTrigger', node.name, 'isTrigger=', col.isTrigger);
    col.on('onTriggerEnter', (e: ITriggerEvent) => {
      console.log('[Market] trigger enter', e.otherCollider?.node?.name);
      if (this.isPlayerCollider(e.otherCollider)) setter(true);
    }, this);
    col.on('onTriggerStay', (e: ITriggerEvent) => {
      if (this.isPlayerCollider(e.otherCollider)) setter(true);
    }, this);
    col.on('onTriggerExit', (e: ITriggerEvent) => {
      console.log('[Market] trigger exit', e.otherCollider?.node?.name);
      if (this.isPlayerCollider(e.otherCollider)) setter(false);
    }, this);
    col.on('onCollisionEnter', (e: any) => {
      console.log('[Market] collision enter', (e?.otherCollider as any)?.node?.name);
    }, this);
    col.on('onCollisionStay', (e: any) => {
      console.log('[Market] collision stay', (e?.otherCollider as any)?.node?.name);
    }, this);
    col.on('onCollisionExit', (e: any) => {
      console.log('[Market] collision exit', (e?.otherCollider as any)?.node?.name);
    }, this);
    const mrs = node.getComponentsInChildren(MeshRenderer);
    const srs = node.getComponentsInChildren(SkinnedMeshRenderer);
    const renders: { r: MeshRenderer | SkinnedMeshRenderer; orig: any[]; colors: any[] }[] = [];
    for (const r of mrs) {
      const count = (r.materials?.length) ?? 1;
      const origArr: any[] = [];
      const colors: any[] = [];
      for (let i = 0; i < count; i++) {
        const sm = r.getSharedMaterial(i) ?? r.materials?.[i] ?? null as any;
        origArr.push(sm);
        let c: any = null;
        try {
          const m = r.getSharedMaterial(i);
          c = ((m as any).getProperty?.('mainColor')) ?? null;
        } catch {}
        colors.push(c);
      }
      renders.push({ r, orig: origArr, colors });
    }
    for (const r of srs) {
      const count = (r.materials?.length) ?? 1;
      const origArr: any[] = [];
      const colors: any[] = [];
      for (let i = 0; i < count; i++) {
        const sm = r.getSharedMaterial(i) ?? r.materials?.[i] ?? null as any;
        origArr.push(sm);
        let c: any = null;
        try {
          const m = r.getSharedMaterial(i);
          c = ((m as any).getProperty?.('mainColor')) ?? null;
        } catch {}
        colors.push(c);
      }
      renders.push({ r, orig: origArr, colors });
    }
    this.areas.push({ node, col, setter, renders, inside: false });
  }

  private isPlayerCollider(other: Collider | null): boolean {
    if (!other) return false;
    let n: Node | null = other.node;
    while (n) {
      if (n.getComponent(PlayerController)) return true;
      n = n.parent;
    }
    return false;
  }

  

  

  private applyAreaColor(it: { renders: { r: MeshRenderer | SkinnedMeshRenderer; colors: any[] }[] }, color: Color) {
    for (const ent of it.renders) {
      const r = ent.r;
      const count = ent.colors.length;
      for (let i = 0; i < count; i++) {
        const m = (r as any).getMaterialInstance?.(i) || r.getSharedMaterial(i);
        try { (m as any).setProperty?.('mainColor', color); } catch {}
      }
    }
  }

  private restoreAreaColor(it: { renders: { r: MeshRenderer | SkinnedMeshRenderer; orig: any[]; colors: any[] }[] }) {
    for (const ent of it.renders) {
      const r = ent.r;
      const count = ent.colors.length;
      for (let i = 0; i < count; i++) {
        const orig = ent.orig[i];
        if (orig) r.setSharedMaterial(orig, i);
      }
    }
  }

  

  /** 判断点是否在 XZ 平面内的 AABB 区域内。 */ 
  private isInsideAreaXZ(p: Vec3, areaNode: Node, col: Collider): boolean {
    const bc = col instanceof BoxCollider ? col : null;
    if (!bc) return false;
    const inv = new Mat4();
    Mat4.invert(inv, areaNode.worldMatrix);
    const lp = new Vec3();
    Vec3.transformMat4(lp, p, inv);
    const dx = lp.x - bc.center.x;
    const dz = lp.z - bc.center.z;
    const hx = bc.size.x * 0.5;
    const hz = bc.size.z * 0.5;
    return Math.abs(dx) <= hx && Math.abs(dz) <= hz;
  }
}