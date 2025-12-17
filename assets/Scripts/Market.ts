import { _decorator, Component, Node, Prefab, instantiate, Collider, ITriggerEvent, BoxCollider, Vec3, Vec4, MeshRenderer, SkinnedMeshRenderer, Color, Mat4, Label, tween, Animation, SkeletalAnimation } from 'cc';
import { PlayerController } from './PlayerController';
import { AssistantController } from './AssistantController';
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
  @property({ type: Node, tooltip: '面包暂存父节点' }) breadStageRoot: Node | null = null;
  @property({ min: 1, tooltip: '面包暂存最大数量' }) breadStageMax: number = 50;
  @property({ min: 1, tooltip: '面包暂存列数' }) breadStageColumns: number = 5;
  @property({ min: 0, tooltip: '列间距（X）' }) breadStageColSpacing: number = 18;
  @property({ min: 0, tooltip: '行间距（Y）' }) breadStageRowSpacing: number = 10;
  @property({ min: 0, tooltip: '起始高度（Y）' }) breadStageBaseY: number = 0;
  @property({ min: 0, tooltip: '前方偏移量（Z负）' }) breadStageOffsetZ: number = 40;

  @property({ type: Prefab, tooltip: '顾客预制体' }) customerPrefab: Prefab | null = null;
  @property({ type: [Prefab], tooltip: '顾客预制体数组' }) customerPrefabs: Prefab[] = [];
  @property({ type: Node, tooltip: '顾客队列父节点' }) customerRoot: Node | null = null;
  @property({ min: 1, tooltip: '初始顾客数量' }) customerInitialCount: number = 5;
  @property({ min: 0, tooltip: '队列间距（Z）' }) customerSpacingZ: number = 60;
  @property({ min: 0.1, tooltip: '入队时长（秒）' }) customerEnterSec: number = 1.2;
  @property({ min: 0.1, tooltip: '离队时长（秒）' }) customerLeaveSec: number = 1.2;
  @property({ min: 0.1, tooltip: '队列前移时长（秒）' }) customerShiftSec: number = 0.5;
  @property({ min: 0, tooltip: '入队起始Z偏移' }) customerEnterOffsetZ: number = 200;
  @property({ min: 0, tooltip: '离队Z偏移（正向）' }) customerLeaveOffsetZ: number = 200;

  private customerQueue: Node[] = [];
  @property({ min: 1, tooltip: '顾客需求最小值' }) customerDemandMin: number = 1;
  @property({ min: 1, tooltip: '顾客需求最大值' }) customerDemandMax: number = 3;

  private acc = 0;
  private accCoinPickup = 0;
  private coinPlaced: Node[] = [];
  private sellHit = false;
  private pickupHit = false;
  private areas: { node: Node; col: Collider; setter: (v: boolean) => void; renders: { r: MeshRenderer | SkinnedMeshRenderer; orig: any[]; colors: any[] }[]; inside: boolean }[] = [];
  private stagePlaced: Node[] = [];
  private customerDemands: number[] = [];
  private customerTargets: Vec3[] = [];

  /**
   * 主循环：
   * 1) 玩家近距离售卖面包并在摆放区生成金币；2) 玩家在金币拾取范围内将金币加入自身堆叠。
   */
  onLoad() {
    this.bindAreaTrigger(this.sellArea, (v) => { this.sellHit = v; });
    this.bindAreaTrigger(this.pickupArea, (v) => { this.pickupHit = v; });
    this.initCustomers();
  }

  /** 助手售卖面包：按当前价格生成金币到摆放区 */
  stageBreadItem(item: Node) {
    if (!this.breadStageRoot) { item.destroy(); return; }
    if (this.stagePlaced.length >= this.breadStageMax) { item.destroy(); return; }
    item.parent = this.breadStageRoot;
    const idx = this.stagePlaced.length;
    const col = idx % this.breadStageColumns;
    const row = Math.floor(idx / this.breadStageColumns);
    const x = (col - (this.breadStageColumns - 1) * 0.5) * this.breadStageColSpacing;
    const y = this.breadStageBaseY + row * this.breadStageRowSpacing;
    const z = -this.breadStageOffsetZ;
    item.setPosition(0, 0, 0);
    tween(item).to(0.2, { position: new Vec3(x, y, z) }).start();
    this.stagePlaced.push(item);
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
        const it = p.breadStack ? (p.breadStack as any).popTopRaw?.() as Node | null : null;
        if (it) this.stageBreadItem(it);
        this.serveFrontCustomer();
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
      const ac = n.getComponent(AssistantController);
      if (ac && ac.role === 'seller') return true;
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

  private initCustomers() {
    const parent = this.customerRoot ?? this.node;
    if (this.customerQueue.length === 0) {
      for (let i = 0; i < this.customerInitialCount; i++) {
        const pf = this.pickCustomerPrefab();
        if (!pf) break;
        const n = instantiate(pf);
        n.parent = parent;
        const z = -i * this.customerSpacingZ;
        n.setPosition(0, 0, z);
        this.customerQueue.push(n);
      }
    }
    this.customerDemands = [];
    this.customerTargets = [];
    for (let i = 0; i < this.customerQueue.length; i++) {
      const node = this.customerQueue[i];
      const want = this.genDemand();
      this.customerDemands.push(want);
      const lb = node.getComponentInChildren(Label);
      if (lb) lb.string = `${want}`;
      this.customerTargets.push(node.worldPosition.clone());
    }
  }

  private pickCustomerPrefab(): Prefab | null {
    if (this.customerPrefabs && this.customerPrefabs.length > 0) {
      const idx = Math.floor(Math.random() * this.customerPrefabs.length);
      return this.customerPrefabs[idx] || null;
    }
    return this.customerPrefab;
  }

  private genDemand(): number {
    const min = Math.max(1, this.customerDemandMin | 0);
    const max = Math.max(min, this.customerDemandMax | 0);
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  private updateQueuePositions() {
    const parent = this.customerRoot ?? this.node;
    for (let i = 0; i < this.customerQueue.length; i++) {
      const node = this.customerQueue[i];
      const z = -i * this.customerSpacingZ;
      tween(node).to(this.customerShiftSec, { position: new Vec3(0, 0, z) }).start();
      this.customerTargets[i] = node.worldPosition.clone();
    }
  }

  private addTailCustomer() {
    const parent = this.customerRoot ?? this.node;
    const pf = this.pickCustomerPrefab();
    if (!pf) return;
    const n = instantiate(pf);
    n.parent = parent;
    const idx = this.customerQueue.length;
    const targetZ = -idx * this.customerSpacingZ;
    const startZ = targetZ - this.customerEnterOffsetZ;
    n.setPosition(0, 0, startZ);
    this.playCustomer(n, ['move', 'carry_move']);
    tween(n).to(this.customerEnterSec, { position: new Vec3(0, 0, targetZ) }).call(() => {
      this.playCustomer(n, ['idle']);
    }).start();
    const want = this.genDemand();
    const lb = n.getComponentInChildren(Label);
    if (lb) lb.string = `${want}`;
    this.customerQueue.push(n);
    this.customerDemands.push(want);
    this.customerTargets.push(n.worldPosition.clone());
  }

  private serveFrontCustomer() {
    if (this.customerQueue.length === 0) return;
    const node = this.customerQueue[0];
    let want = this.customerDemands[0] ?? 0;
    if (want <= 0) return;
    if (this.stagePlaced.length <= 0) return;
    const item = this.stagePlaced.pop();
    if (!item) return;
    const parent = this.coinSpawnRoot ?? this.node;
    const start = item.worldPosition.clone();
    item.parent = parent;
    item.setWorldPosition(start);
    tween(item).to(0.2, { position: parent.worldPosition.clone() }).call(() => { item.destroy(); }).start();
    const origWant = want;
    want -= 1;
    this.customerDemands[0] = want;
    this.playCustomer(node, ['carry_idle', 'idle']);
    const lb = node.getComponentInChildren(Label);
    if (lb) lb.string = `${want > 0 ? want : 0}`;
    if (want <= 0) {
      const coins = origWant * this.price;
      const count = coins;
      for (let i = 0; i < count; i++) {
        if (!this.coinPrefab || !this.coinSpawnRoot) break;
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
      this.playCustomer(node, ['carry_move', 'move']);
      tween(node).to(this.customerLeaveSec, { position: new Vec3(node.position.x, node.position.y, node.position.z + this.customerLeaveOffsetZ) }).call(() => { node.destroy(); }).start();
      this.customerQueue.shift();
      this.customerDemands.shift();
      this.customerTargets.shift();
      this.updateQueuePositions();
      this.addTailCustomer();
    }
  }

  private playCustomer(node: Node, names: string[]) {
    const sa = node.getComponent(SkeletalAnimation) || node.getComponentInChildren(SkeletalAnimation);
    if (sa) {
      const clips: any[] = ((sa as any).clips as any[]) || [];
      const pick = names.find(n => clips.some(c => {
        const nm = (c as any).name as string;
        const base = nm.endsWith('.animation') ? nm.substring(0, nm.length - 10) : nm;
        return base === n;
      })) || names[0];
      try { (sa as any).play?.(pick); } catch {}
      return;
    }
    const an = node.getComponent(Animation) || node.getComponentInChildren(Animation);
    if (an) {
      const clips: any[] = ((an as any).clips as any[]) || [];
      const pick = names.find(n => clips.some(c => {
        const nm = (c as any).name as string;
        const base = nm.endsWith('.animation') ? nm.substring(0, nm.length - 10) : nm;
        return base === n;
      })) || names[0];
      try { (an as any).play?.(pick); } catch {}
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