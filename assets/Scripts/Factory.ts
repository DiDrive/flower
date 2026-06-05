import { _decorator, Component, Node, Prefab, instantiate, Collider, ITriggerEvent, BoxCollider, Vec3, Vec4, MeshRenderer, SkinnedMeshRenderer, Color, Mat4, tween } from 'cc';
import type { TweenEasing } from 'cc';
import { ProductState } from './ProductState';
import { PlayerController } from './PlayerController';
import { AssistantController } from './AssistantController';
import { CollectStack } from './CollectStack';
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
  @property({ min: 0.1, tooltip: '面包拾取速率（个/秒）' }) pickupRate: number = 3;
  @property({ min: 0, tooltip: '测试：半成品转成品的延时（秒）' }) finalizeDelaySec: number = 0;
  @property({ type: Node, tooltip: '上传区域触发器节点' }) uploadArea: Node | null = null;
  @property({ type: Node, tooltip: '拾取区域触发器节点' }) pickupArea: Node | null = null;
  @property({ tooltip: '进入区域高亮颜色' }) enterColor: Color = new Color(255, 216, 51, 255);
  @property({ type: Node, tooltip: '上传摆放父节点（为空则用 uploadArea）' }) uploadRoot: Node | null = null;
  @property({ min: 1, tooltip: '上传摆放最大数量' }) uploadMax: number = 24;
  @property({ min: 1, tooltip: '上传摆放列数' }) uploadColumns: number = 4;
  @property({ min: 0, tooltip: '上传列间距（X）' }) uploadColSpacing: number = 16;
  @property({ min: 0, tooltip: '上传行间距（Y）' }) uploadRowSpacing: number = 12;
  @property({ min: 0, tooltip: '上传起始高度（Y）' }) uploadBaseY: number = 0;
  @property({ min: 0, tooltip: '上传前方偏移量（Z负）' }) uploadOffsetZ: number = 28;
  @property({ min: 1, tooltip: '每次上传批量（件/次）' }) inputBurst: number = 3;
  @property({ min: 0.01, tooltip: '上传分隔时长(秒，Burst逐个间隔)' }) inputBurstGapSec: number = 0.06;
  @property({ min: 0, tooltip: '上传抛物线峰值高度(Y)' }) uploadArcPeakY: number = 10;
  @property({ min: 0.05, tooltip: '上传抛掷总时长(秒)' }) uploadThrowSec: number = 0.25;
  @property({ min: 0, tooltip: '上传后停顿时长(秒)' }) uploadHoldSec: number = 0.05;
  @property({ min: 0.05, tooltip: '上传消失缩小时长(秒)' }) uploadVanishSec: number = 0.35;
  @property({ tooltip: '上传抛掷缓动' }) uploadEasing: TweenEasing = 'sineInOut';
  @property({ type: Node, tooltip: '面包产出起始节点' }) produceFromNode: Node | null = null;
  @property({ min: 0, tooltip: '产出抛物线峰值高度(Y)' }) produceArcPeakY: number = 10;
  @property({ min: 0.05, tooltip: '产出抛掷总时长(秒)' }) produceThrowSec: number = 0.28;
  @property({ tooltip: '产出抛掷缓动' }) produceEasing: TweenEasing = 'sineInOut';
  @property({ min: 0, tooltip: '产出中空中缩放倍数' }) produceShrink: number = 0.85;
  @property({ min: 0, tooltip: '落地瞬间放大倍数' }) produceOvershoot: number = 1.15;
  @property({ min: 0.01, tooltip: '落地后回到正常缩放时长(秒)' }) produceSettleSec: number = 0.1;

  private accIn = 0;
  private accOut = 0;
  private queue = 0;
  private accInP = 0;
  private accInA = 0;
  private accPickup = 0;
  private placed: Node[] = [];
  private flowerSlots: (Node | null)[] = [];
  private reservedSlots: Set<number> = new Set();
  private vanishingSlots: Set<number> = new Set();
  private breadSlots: (Node | null)[] = [];
  private breadReservedSlots: Set<number> = new Set();
  private uploadInFlight: number = 0;
  private pendingP: number = 0;
  private pendingA: number = 0;
  private gapAccP: number = 0;
  private gapAccA: number = 0;
  private finalizePend: { n: Node; t: number }[] = [];
  private uploadHit = false;
  private uploadHitP = false;
  private uploadHitA = false;
  private pickupHit = false;
  private areas: { node: Node; col: Collider; setter: (v: boolean) => void; renders: { r: MeshRenderer | SkinnedMeshRenderer; orig: any[]; colors: any[] }[]; inside: boolean }[] = [];

  /**
   * 主循环：
   * 1) 取入花朵进入生产队列；2) 队列出面包并摆放；3) 玩家近距离拾取面包。
   */
  onLoad() {
    this.bindAreaTrigger(this.uploadArea, (v) => { this.uploadHit = v; });
    this.bindAreaTrigger(this.pickupArea, (v) => { this.pickupHit = v; });
  }

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
    const a = this.findAssistant();
    // 逐主体上传：谁在区域里就只提交自己身上的花朵
    if (this.uploadHitP) {
      this.accInP += dt;
      if (this.accInP >= 1 / this.inputRate) {
        this.accInP = 0;
        this.pendingP += Math.max(1, this.inputBurst | 0);
      }
      this.gapAccP += dt;
      while (this.pendingP > 0 && this.gapAccP >= this.inputBurstGapSec) {
        this.gapAccP -= this.inputBurstGapSec;
        const parent = this.uploadRoot || this.uploadArea || this.node;
        if ((this.queue + this.uploadInFlight) >= this.queueMax) break;
        if (!(p && p.stack && p.stack.count() > 0)) break;
        const it = p.stack.popTopRaw();
        if (!it) break;
        p.flowers = Math.max(0, p.flowers - 1);
        const idx = this.findFreeSlot();
        const start = it.worldPosition.clone();
        it.parent = parent;
        it.setWorldPosition(start);
        this.uploadInFlight += 1;
        if (idx >= 0) {
          const slotWorld = this.getUploadSlotWorld(idx, parent);
          this.reservedSlots.add(idx);
          this.throwToPlace(it, parent, slotWorld, () => {
            this.reservedSlots.delete(idx);
            this.flowerSlots[idx] = it!;
            this.queue += 1;
            this.uploadInFlight = Math.max(0, this.uploadInFlight - 1);
          });
        } else {
          const center = this.getUploadCenterWorld() || this.getUploadSlotWorld(Math.max(0, this.uploadMax - 1), parent);
          this.throwAndVanish(it, parent, center, () => {
            this.queue += 1;
            this.uploadInFlight = Math.max(0, this.uploadInFlight - 1);
          });
        }
        this.pendingP -= 1;
      }
    } else {
      this.pendingP = 0;
      this.gapAccP = 0;
    }
    if (this.uploadHitA) {
      this.accInA += dt;
      if (this.accInA >= 1 / this.inputRate) {
        this.accInA = 0;
        this.pendingA += Math.max(1, this.inputBurst | 0);
      }
      this.gapAccA += dt;
      while (this.pendingA > 0 && this.gapAccA >= this.inputBurstGapSec) {
        this.gapAccA -= this.inputBurstGapSec;
        const parent = this.uploadRoot || this.uploadArea || this.node;
        if ((this.queue + this.uploadInFlight) >= this.queueMax) break;
        if (!(a && a.flowerStack && a.flowerStack.count() > 0)) break;
        const it = a.flowerStack.popTopRaw();
        if (!it) break;
        const idx = this.findFreeSlot();
        const start = it.worldPosition.clone();
        it.parent = parent;
        it.setWorldPosition(start);
        this.uploadInFlight += 1;
        if (idx >= 0) {
          const slotWorld = this.getUploadSlotWorld(idx, parent);
          this.reservedSlots.add(idx);
          this.throwToPlace(it, parent, slotWorld, () => {
            this.reservedSlots.delete(idx);
            this.flowerSlots[idx] = it!;
            this.queue += 1;
            this.uploadInFlight = Math.max(0, this.uploadInFlight - 1);
          });
        } else {
          const center = this.getUploadCenterWorld() || this.getUploadSlotWorld(Math.max(0, this.uploadMax - 1), parent);
          this.throwAndVanish(it, parent, center, () => {
            this.queue += 1;
            this.uploadInFlight = Math.max(0, this.uploadInFlight - 1);
          });
        }
        this.pendingA -= 1;
      }
    } else {
      this.pendingA = 0;
      this.gapAccA = 0;
    }
    if (this.queue > 0) {
      this.accOut += dt;
      if (this.accOut >= 1 / this.produceRate) {
        this.accOut = 0;
        if (this.breadPrefab && this.spawnRoot && this.occupiedBreadSlotsCount() < this.placedMax) {
          const n = instantiate(this.breadPrefab);
          n.parent = this.spawnRoot;
          const ps = n.getComponentInChildren(ProductState);
          if (ps) ps.setSemi();
          if (this.finalizeDelaySec > 0) this.finalizePend.push({ n, t: this.finalizeDelaySec });
          const idxBread = this.findBreadFreeSlot();
          const col = idxBread % this.placedColumns;
          const row = Math.floor(idxBread / this.placedColumns);
          const x = (col - (this.placedColumns - 1) * 0.5) * this.placedColSpacing;
          const y = this.placedBaseY + row * this.placedRowSpacing;
          const z = -this.placedOffsetZ;
          const targetLocal = new Vec3(x, y, z);
          const startWorld = this.getProduceStartWorld() ?? this.node.worldPosition.clone();
          n.setWorldPosition(startWorld);
          const s0 = n.scale.clone();
          const s1 = new Vec3(s0.x * this.produceShrink, s0.y * this.produceShrink, s0.z);
          const s2 = new Vec3(s0.x * this.produceOvershoot, s0.y * this.produceOvershoot, s0.z);
          this.breadReservedSlots.add(idxBread);
          this.throwProduce(n, this.spawnRoot, targetLocal, s0, s1, s2, () => {
            this.breadReservedSlots.delete(idxBread);
            this.breadSlots[idxBread] = n;
            this.placed.push(n);
          });
          this.queue -= 1;
          const topIdx = this.topFlowerIndex();
          if (topIdx >= 0) {
            const f = this.flowerSlots[topIdx] as Node;
            if (f && !this.vanishingSlots.has(topIdx)) {
              this.vanishingSlots.add(topIdx);
              this.vanishFlower(f, () => {
                this.flowerSlots[topIdx] = null;
                this.vanishingSlots.delete(topIdx);
              });
            }
          }
        }
      }
    }

    {
      for (const it of this.areas) {
        const ip = p ? this.isInsideAreaXZ(p.node.worldPosition, it.node, it.col) : false;
        const ia = a ? this.isInsideAreaXZ(a.node.worldPosition, it.node, it.col) : false;
        const inside = ip || ia;
        if (it.node === this.uploadArea) {
          this.uploadHitP = ip;
          this.uploadHitA = ia;
        }
        it.setter(inside);
        if (inside !== it.inside) {
          it.inside = inside;
          if (inside) this.applyAreaColor(it, this.enterColor);
          else this.restoreAreaColor(it);
        }
      }
      if (p && this.pickupHit) {
        this.accPickup += dt;
        if (this.accPickup >= 1 / this.pickupRate) {
          this.accPickup = 0;
          const item = this.takeBreadFromTop();
          if (item) {
            if (!p.tryAddBreadItem(item)) {
              const idx = this.findBreadFreeSlot();
              const parent = this.spawnRoot || this.node;
              const col = idx % this.placedColumns;
              const row = Math.floor(idx / this.placedColumns);
              const x = (col - (this.placedColumns - 1) * 0.5) * this.placedColSpacing;
              const y = this.placedBaseY + row * this.placedRowSpacing;
              const z = -this.placedOffsetZ;
              const inv = new Mat4(); Mat4.invert(inv, parent.worldMatrix);
              const lp = new Vec3(x, y, z);
              item.parent = parent;
              item.setPosition(lp);
              this.breadSlots[idx] = item;
              this.placed.push(item);
            }
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

  /** 助手投递花朵到生产队列，返回成功投递数量 */
  acceptFlower(n: number): number {
    const room = this.queueMax - this.queue
    const moved = Math.max(0, Math.min(n, room))
    this.queue += moved
    return moved
  }

  /** 助手从摆放区拿取若干面包，返回拿到的节点列表 */
  takeBread(count: number): Node[] {
    const out: Node[] = []
    for (let i = 0; i < count; i++) {
      const item = this.takeBreadFromTop()
      if (!item) break
      out.push(item)
    }
    return out
  }

  

  private bindAreaTrigger(node: Node | null, setter: (v: boolean) => void) {
    if (!node) return;
    const col = node.getComponent(Collider) || node.getComponentInChildren(Collider);
    if (!col) return;
    //col.isTrigger = true;
    console.log('[Factory] bindAreaTrigger', node.name, 'isTrigger=', col.isTrigger);
    col.on('onTriggerEnter', (e: ITriggerEvent) => {
      console.log('[Factory] trigger enter', e.otherCollider?.node?.name);
      if (this.isPlayerCollider(e.otherCollider) || this.isAssistantCollider(e.otherCollider)) setter(true);
    }, this);
    col.on('onTriggerStay', (e: ITriggerEvent) => {
      if (this.isPlayerCollider(e.otherCollider) || this.isAssistantCollider(e.otherCollider)) setter(true);
    }, this);
    col.on('onTriggerExit', (e: ITriggerEvent) => {
      console.log('[Factory] trigger exit', e.otherCollider?.node?.name);
      if (this.isPlayerCollider(e.otherCollider) || this.isAssistantCollider(e.otherCollider)) setter(false);
    }, this);
    col.on('onCollisionEnter', (e: any) => {
      console.log('[Factory] collision enter', (e?.otherCollider as any)?.node?.name);
    }, this);
    col.on('onCollisionStay', (e: any) => {
      console.log('[Factory] collision stay', (e?.otherCollider as any)?.node?.name);
    }, this);
    col.on('onCollisionExit', (e: any) => {
      console.log('[Factory] collision exit', (e?.otherCollider as any)?.node?.name);
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

  private isAssistantCollider(other: Collider | null): boolean {
    if (!other) return false;
    let n: Node | null = other.node;
    while (n) {
      if (n.getComponent(AssistantController)) return true;
      n = n.parent;
    }
    return false;
  }

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

  private getUploadSlotWorld(idx: number, root: Node): Vec3 {
    const col = idx % this.uploadColumns;
    const row = Math.floor(idx / this.uploadColumns);
    const colSp = this.uploadColSpacing > 0 ? this.uploadColSpacing : 16;
    const rowSp = this.uploadRowSpacing > 0 ? this.uploadRowSpacing : 12;
    const x = (col - (this.uploadColumns - 1) * 0.5) * colSp;
    const y = this.uploadBaseY + row * rowSp;
    const z = -this.uploadOffsetZ;
    const local = new Vec3(x, y, z);
    const world = new Vec3();
    Vec3.transformMat4(world, local, root.worldMatrix);
    return world;
  }

  private ensureSlotArray() {
    const n = Math.max(1, this.uploadMax | 0)
    if (this.flowerSlots.length !== n) {
      const old = this.flowerSlots
      this.flowerSlots = new Array(n).fill(null)
      for (let i = 0; i < Math.min(old.length, n); i++) this.flowerSlots[i] = old[i]
      this.reservedSlots.clear()
      this.vanishingSlots.clear()
    }
  }

  private findFreeSlot(): number {
    this.ensureSlotArray()
    for (let i = 0; i < this.uploadMax; i++) {
      const used = !!this.flowerSlots[i]
      const resv = this.reservedSlots.has(i)
      const vani = this.vanishingSlots.has(i)
      if (!used && !resv && !vani) return i
    }
    return -1
  }

  private occupiedSlotsCount(): number {
    this.ensureSlotArray()
    let c = 0
    for (let i = 0; i < this.uploadMax; i++) if (this.flowerSlots[i]) c++
    return c + this.reservedSlots.size + this.vanishingSlots.size
  }

  private topFlowerIndex(): number {
    this.ensureSlotArray()
    for (let i = this.uploadMax - 1; i >= 0; i--) {
      if (this.flowerSlots[i] && !this.vanishingSlots.has(i)) return i
    }
    return -1
  }

  private throwToPlace(item: Node, parent: Node, targetWorld: Vec3, onArrive?: () => void) {
    const inv = new Mat4();
    Mat4.invert(inv, parent.worldMatrix);
    const lp = new Vec3();
    Vec3.transformMat4(lp, targetWorld, inv);
    const start = item.position.clone();
    const mid = new Vec3((start.x + lp.x) * 0.5, (start.y + lp.y) * 0.5 + this.uploadArcPeakY, (start.z + lp.z) * 0.5);
    tween(item)
      .to(this.uploadThrowSec * 0.5, { position: mid }, { easing: this.uploadEasing })
      .to(this.uploadThrowSec * 0.5, { position: lp }, { easing: this.uploadEasing })
      .call(() => { if (onArrive) onArrive(); })
      .start();
  }

  private vanishFlower(item: Node, onDone?: () => void) {
    tween(item)
      .to(this.uploadVanishSec, { scale: new Vec3(0, 0, 0) })
      .call(() => { try { (onDone || (() => {}))(); } finally { item.destroy(); } })
      .start();
  }

  private throwAndVanish(item: Node, parent: Node, targetWorld: Vec3, onDone?: () => void) {
    const inv = new Mat4();
    Mat4.invert(inv, parent.worldMatrix);
    const lp = new Vec3();
    Vec3.transformMat4(lp, targetWorld, inv);
    const start = item.position.clone();
    const mid = new Vec3((start.x + lp.x) * 0.5, (start.y + lp.y) * 0.5 + this.uploadArcPeakY, (start.z + lp.z) * 0.5);
    tween(item)
      .to(this.uploadThrowSec * 0.5, { position: mid }, { easing: this.uploadEasing })
      .to(this.uploadThrowSec * 0.5, { position: lp }, { easing: this.uploadEasing })
      .delay(this.uploadHoldSec)
      .to(this.uploadVanishSec, { scale: new Vec3(0, 0, 0) })
      .call(() => { try { (onDone || (() => {}))(); } finally { item.destroy(); } })
      .start();
  }

  private getUploadCenterWorld(): Vec3 | null {
    const na = this.uploadArea;
    if (!na) return null;
    const col = na.getComponent(Collider) || na.getComponentInChildren(Collider);
    const bc = col instanceof BoxCollider ? col : null;
    if (!bc) return na.worldPosition.clone();
    const centerLocal = new Vec3(bc.center.x, bc.center.y, bc.center.z);
    const m = na.worldMatrix;
    const out = new Vec3();
    Vec3.transformMat4(out, centerLocal, m);
    return out;
  }

  private getProduceStartWorld(): Vec3 | null {
    const n = this.produceFromNode || this.uploadArea || this.node
    return n ? n.worldPosition.clone() : null
  }

  private throwProduce(item: Node, parent: Node, targetLocal: Vec3, s0: Vec3, sShrink: Vec3, sOver: Vec3, onArrive?: () => void) {
    const start = item.position.clone()
    const mid = new Vec3((start.x + targetLocal.x) * 0.5, (start.y + targetLocal.y) * 0.5 + this.produceArcPeakY, (start.z + targetLocal.z) * 0.5)
    const tw: any = (tween as any)(item)
      .to(this.produceThrowSec * 0.5, { position: mid, scale: sShrink }, { easing: this.produceEasing })
      .to(this.produceThrowSec * 0.5, { position: targetLocal, scale: sOver }, { easing: this.produceEasing })
      .to(this.produceSettleSec, { scale: s0 }, { easing: 'sineOut' })
      .call(() => { try { if (onArrive) onArrive(); (item as any).__factoryTween = null } catch {} })
      .start()
    ;(item as any).__factoryTween = tw
  }

  private ensureBreadSlotArray() {
    const n = Math.max(1, this.placedMax | 0)
    if (this.breadSlots.length !== n) {
      const old = this.breadSlots
      this.breadSlots = new Array(n).fill(null)
      for (let i = 0; i < Math.min(old.length, n); i++) this.breadSlots[i] = old[i]
      this.breadReservedSlots.clear()
    }
  }

  private findBreadFreeSlot(): number {
    this.ensureBreadSlotArray()
    for (let i = 0; i < this.placedMax; i++) {
      const used = !!this.breadSlots[i]
      const resv = this.breadReservedSlots.has(i)
      if (!used && !resv) return i
    }
    return Math.max(0, this.placedMax - 1)
  }

  private occupiedBreadSlotsCount(): number {
    this.ensureBreadSlotArray()
    let c = 0
    for (let i = 0; i < this.placedMax; i++) if (this.breadSlots[i]) c++
    return c + this.breadReservedSlots.size
  }

  private topBreadIndex(): number {
    this.ensureBreadSlotArray()
    for (let i = this.placedMax - 1; i >= 0; i--) {
      if (this.breadSlots[i]) return i
    }
    return -1
  }

  private takeBreadFromTop(): Node | null {
    const idx = this.topBreadIndex()
    if (idx < 0) return null
    const item = this.breadSlots[idx] as Node
    const tw: any = (item as any).__factoryTween
    if (tw) { try { tw.stop() } catch {} ; (item as any).__factoryTween = null }
    try { (tween as any).stopAllByTarget?.(item) } catch {}
    this.breadSlots[idx] = null
    const j = this.placed.indexOf(item)
    if (j >= 0) this.placed.splice(j, 1)
    return item
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

  private findAssistant(): AssistantController | null {
    const n = this.node.scene;
    if (!n) return null;
    const list = n.getComponentsInChildren(AssistantController);
    if (!list || list.length === 0) return null;
    const ua = this.uploadArea;
    const col = ua ? (ua.getComponent(Collider) || ua.getComponentInChildren(Collider)) : null;
    if (ua && col) {
      for (const a of list) {
        const has = !!a.flowerStack && a.flowerStack.count() > 0;
        if (!has) continue;
        if (this.isInsideAreaXZ(a.node.worldPosition, ua, col)) return a;
      }
    }
    return list[0];
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

  
}