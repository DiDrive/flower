import { _decorator, Component, Node, Prefab, instantiate, Collider, ITriggerEvent, BoxCollider, Vec3, Vec4, MeshRenderer, SkinnedMeshRenderer, Color, Mat4, Label, tween, Animation, SkeletalAnimation, Sprite, SpriteFrame, UITransform, Camera, ProgressBar, Canvas, view, SpriteAtlas } from 'cc';
import type { TweenEasing } from 'cc';
import { CollectStack } from './CollectStack';
import { PlayerController } from './PlayerController';
import { AssistantController } from './AssistantController';
import { Economy } from './Economy';
const { ccclass, property } = _decorator;

/**
 * Market 市场。
 * - 玩家靠近后按 `sellRate` 将身上的面包售卖为若干金币。
 * - 金币以网格排列摆放在 `coinSpawnRoot`，随后在 `coinPickupRadius` 范围按 `coinPickupRate` 被玩家拾取。
 * 使用：挂在市场节点上并设置金币预制体与摆放父节点。
 */
@ccclass('Market')
export class Market extends Component {
  @property({ min: 0.01, tooltip: '售卖间隔（秒/个）' }) sellIntervalSec: number = 0.333;
  @property({ min: 0.01, tooltip: '花饼暂存摆放间隔（秒/个）' }) stagePlaceIntervalSec: number = 0.333;
  @property({ min: 0, tooltip: '单次售卖生成的金币数量' }) price: number = 5;
  @property({ type: Prefab, tooltip: '金币预制体' }) coinPrefab: Prefab | null = null;
  @property({ type: Node, tooltip: '金币摆放父节点' }) coinSpawnRoot: Node | null = null;
  @property({ min: 1, tooltip: '金币摆放最大数量' }) coinPlacedMax: number = 30;
  @property({ min: 1, tooltip: '金币摆放列数' }) coinPlacedColumns: number = 5;
  @property({ min: 0, tooltip: '列间距（X）' }) coinPlacedColSpacing: number = 18;
  @property({ min: 0, tooltip: '行间距（Y）' }) coinPlacedRowSpacing: number = 10;
  @property({ min: 0, tooltip: '起始高度（Y）' }) coinPlacedBaseY: number = 0;
  @property({ min: 0, tooltip: '前方偏移量（Z负）' }) coinPlacedOffsetZ: number = 40;
  @property({ min: 0.01, tooltip: '金币摆放动画时长（秒）' }) coinPlaceSec: number = 0.2;
  @property({ tooltip: '金币摆放动画缓动' }) coinPlaceEasing: TweenEasing = 'sineOut';
  @property({ min: 0, tooltip: '交付抛物线峰值高度(Y)' }) deliverArcPeakY: number = 10;
  @property({ min: 0.05, tooltip: '交付抛掷总时长(秒)' }) deliverThrowSec: number = 0.25;
  @property({ tooltip: '交付抛掷缓动' }) deliverEasing: TweenEasing = 'sineInOut';
  @property({ min: 0, tooltip: '交付空中缩放倍数' }) deliverShrink: number = 0.85;
  @property({ min: 0, tooltip: '交付落地放大倍数' }) deliverOvershoot: number = 1.12;
  @property({ min: 0.01, tooltip: '交付落地回到正常时长(秒)' }) deliverSettleSec: number = 0.08;
  @property({ min: 0, tooltip: '金币拾取抛物线峰值高度(Y)' }) coinPickupArcPeakY: number = 10;
  @property({ min: 0.05, tooltip: '金币拾取抛掷总时长(秒)' }) coinPickupThrowSec: number = 0.25;
  @property({ tooltip: '金币拾取抛掷缓动' }) coinPickupEasing: TweenEasing = 'sineInOut';
  @property({ min: 0, tooltip: '金币拾取空中缩放倍数' }) coinPickupShrink: number = 0.85;
  @property({ min: 0, tooltip: '金币拾取落地放大倍数' }) coinPickupOvershoot: number = 1.12;
  @property({ min: 0.01, tooltip: '金币拾取落地回到正常时长(秒)' }) coinPickupSettleSec: number = 0.08;
  @property({ min: 0.01, tooltip: '金币拾取间隔（秒/个）' }) coinPickupIntervalSec: number = 0.2;
  @property({ min: 0.01, tooltip: '交付给顾客间隔（秒/个）' }) deliverIntervalSec: number = 0.333;
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
  @property({ min: 0.01, tooltip: '面包暂存摆放动画时长（秒）' }) breadStagePlaceSec: number = 0.25;
  @property({ tooltip: '面包暂存摆放缓动' }) breadStagePlaceEasing: TweenEasing = 'sineOut';

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
  @property({ min: 0, tooltip: '满足后离开前的停留时长（秒）' }) customerLeaveDelaySec: number = 0.8;
  @property({ type: Node, tooltip: 'UI画布(Canvas)节点' }) uiCanvas: Node | null = null;
  @property({ type: Node, tooltip: '世界摄像机节点' }) worldCameraNode: Node | null = null;
  @property({ type: SpriteFrame, tooltip: '气泡外框' }) bubbleFrame: SpriteFrame | null = null;
  @property({ type: SpriteFrame, tooltip: '气泡填充' }) bubbleFillFrame: SpriteFrame | null = null;
  @property({ min: 0, tooltip: '气泡世界高度Y偏移' }) bubbleWorldOffsetY: number = 220;
  @property({ min: 0.1, tooltip: '气泡缩放' }) bubbleScale: number = 1;
  @property({ type: [SpriteFrame], tooltip: '数字0-9图集' }) digitFrames: SpriteFrame[] = [];
  @property({ type: SpriteAtlas, tooltip: '数字图集（自动读取 n0..n9）' }) digitAtlas: SpriteAtlas | null = null;
  @property({ tooltip: '数字图集前缀（例如 n）' }) digitPrefix: string = 'n';
  @property({ type: Prefab, tooltip: '气泡UI预制体（含ProgressBar和Label）' }) bubblePrefab: Prefab | null = null;
  @property({ tooltip: '顾客头顶锚点名（可选）' }) headAnchorName: string = '';
  @property({ tooltip: '屏幕坐标X偏移' }) bubbleScreenOffsetX: number = 0;
  @property({ tooltip: '屏幕坐标Y偏移' }) bubbleScreenOffsetY: number = 0;
  @property({ tooltip: '在lateUpdate中更新气泡位置（避免摄像机跟随抖动）' }) bubbleLateUpdate: boolean = true;
  @property({ tooltip: '使用视图缩放换算UI坐标' }) bubbleUseViewScale: boolean = true;
  @property({ tooltip: '启用市场内物品可视裁剪' }) cullEnabled: boolean = true;
  @property({ min: 0, tooltip: '裁剪检测间隔（秒）' }) cullInterval: number = 0.25;
  @property({ min: 0, tooltip: '屏幕X方向提前显示边距（像素）' }) cullMarginX: number = 300;
  @property({ min: 0, tooltip: '屏幕Y方向提前显示边距（像素）' }) cullMarginY: number = 200;
  @property({ min: 0, tooltip: '相机世界裁剪半径（XZ），0为禁用' }) cullRadius: number = 600;
  @property({ min: 0, tooltip: '视野内最大显示数量（0为无限）' }) maxVisible: number = 120;

  private customerQueue: Node[] = [];
  @property({ min: 1, tooltip: '顾客需求最小值' }) customerDemandMin: number = 1;
  @property({ min: 1, tooltip: '顾客需求最大值' }) customerDemandMax: number = 3;

  
  private accCull = 0;
  private accCoinPickup = 0;
  private accDeliver = 0;
  private accStagePlace = 0;
  private sellPlayerHit = false;
  private sellAssistantHit = false;
  private coinPlaced: Node[] = [];
  private sellHit = false;
  private pickupHit = false;
  private areas: { node: Node; col: Collider; setter: (v: boolean) => void; renders: { r: MeshRenderer | SkinnedMeshRenderer; orig: any[]; colors: any[] }[]; inside: boolean }[] = [];
  private stagePlaced: Node[] = [];
  private stageSlots: (Node | null)[] = [];
  private stageReservedSlots: Set<number> = new Set();
  private coinRenderers: Map<Node, (MeshRenderer | SkinnedMeshRenderer)[]> = new Map();
  private breadRenderers: Map<Node, (MeshRenderer | SkinnedMeshRenderer)[]> = new Map();
  private customerDemands: number[] = [];
  private customerTargets: Vec3[] = [];
  private customerDemandTotal: number[] = [];
  private bubbleMap: Map<Node, Node> = new Map();
  private lastAnim: Map<Node, string> = new Map();
  private coinInFlight: Set<Node> = new Set();
  private frontLeaving: boolean = false;
  private queueShifting: boolean = false;
  private shiftPending: number = 0;
  private frontDelivering: boolean = false;

  /**
   * 主循环：
   * 1) 玩家近距离售卖面包并在摆放区生成金币；2) 玩家在金币拾取范围内将金币加入自身堆叠。
   */
  onLoad() {
    this.bindAreaTrigger(this.sellArea, (v) => { this.sellHit = v; });
    this.bindAreaTrigger(this.pickupArea, (v) => { this.pickupHit = v; });
    this.ensureDigitFrames();
    this.initCustomers();
  }

  /** 助手售卖面包：按当前价格生成金币到摆放区 */
  stageBreadItem(item: Node) {
    if (!this.breadStageRoot) { item.destroy(); return; }
    if (this.occupiedStageSlotsCount() >= this.breadStageMax) { item.destroy(); return; }
    const parent = this.breadStageRoot;
    const idx = this.findStageFreeSlot();
    this.stageReservedSlots.add(idx);
    const col = idx % this.breadStageColumns;
    const row = Math.floor(idx / this.breadStageColumns);
    const x = (col - (this.breadStageColumns - 1) * 0.5) * this.breadStageColSpacing;
    const y = this.breadStageBaseY + row * this.breadStageRowSpacing;
    const z = -this.breadStageOffsetZ;
    const targetLocal = new Vec3(x, y, z);
    const startWorld = item.worldPosition.clone();
    item.parent = parent;
    item.setWorldPosition(startWorld);
    const lp = new Vec3(targetLocal.x, targetLocal.y, targetLocal.z);
    const s0 = item.scale.clone();
    const s1 = new Vec3(s0.x * this.deliverShrink, s0.y * this.deliverShrink, s0.z);
    const s2 = new Vec3(s0.x * this.deliverOvershoot, s0.y * this.deliverOvershoot, s0.z);
    const mid = new Vec3((item.position.x + lp.x) * 0.5, (item.position.y + lp.y) * 0.5 + this.deliverArcPeakY, (item.position.z + lp.z) * 0.5);
    (tween as any)(item)
      .to(this.deliverThrowSec * 0.5, { position: mid, scale: s1 }, { easing: this.deliverEasing })
      .to(this.deliverThrowSec * 0.5, { position: lp, scale: s2 }, { easing: this.deliverEasing })
      .to(this.deliverSettleSec, { scale: s0 }, { easing: 'sineOut' })
      .call(() => { this.stageReservedSlots.delete(idx); this.stageSlots[idx] = item; this.stagePlaced.push(item); this.cacheBreadRenderers(item); })
      .start();
  }

  update(dt: number) {
    const p = this.findPlayer();
    if (!p) return;
    for (const it of this.areas) {
      const inside = this.isInsideAreaXZ(p.node.worldPosition, it.node, it.col);
      it.setter(inside);
      if (it.node === this.sellArea) this.sellPlayerHit = inside;
      if (inside !== it.inside) {
        it.inside = inside;
        if (inside) this.applyAreaColor(it, this.enterColor);
        else this.restoreAreaColor(it);
      }
    }
    if (this.sellArea) {
      const col = this.sellArea.getComponent(Collider) || this.sellArea.getComponentInChildren(Collider);
      if (col) {
        let anyAssistantInside = false;
        const assistants = this.findSellerAssistants();
        for (const a of assistants) {
          if (this.isInsideAreaXZ(a.node.worldPosition, this.sellArea, col)) { anyAssistantInside = true; break; }
        }
        this.sellAssistantHit = anyAssistantInside;
      }
    }
    if (this.sellPlayerHit) {
      this.accStagePlace += dt;
      if (this.accStagePlace >= this.stagePlaceIntervalSec) {
        this.accStagePlace = 0;
        const it = this.popBreadFromPlayerForStage();
        if (it) this.stageBreadItem(it);
      }
    }

    if (this.sellPlayerHit || this.sellAssistantHit) {
      this.accDeliver += dt;
      if (this.accDeliver >= this.deliverIntervalSec) {
        this.accDeliver = 0;
        if (!this.queueShifting) this.serveFrontCustomer();
      }
    }

  if (this.pickupHit && !p.isCameraFocusing()) {
    this.accCoinPickup += dt;
    if (this.accCoinPickup >= this.coinPickupIntervalSec) {
      this.accCoinPickup = 0;
      const idx = this.coinPlaced.length - 1;
      const item = idx >= 0 ? this.coinPlaced[idx] : null;
      if (item && !this.coinInFlight.has(item)) {
        this.coinPlaced.pop();
        this.coinInFlight.add(item);
        const parent = this.coinSpawnRoot || this.node;
        const targetW = this.getCoinPickupTargetWorld(p);
        this.throwCoinPickup(item, parent!, targetW, () => {
          const s = (p as any).coinStack as CollectStack | null;
          this.coinInFlight.delete(item);
          if (s && s.count() < s.capacity) {
            const ok = p.tryAddCoinItem(item);
            if (!ok) { Economy.add(1); this.vanishCoin(item); }
          } else {
            Economy.add(1);
            this.vanishCoin(item);
          }
        });
      }
    }
  }
    if (this.cullEnabled) {
      this.accCull += dt;
      if (this.accCull >= this.cullInterval) { this.accCull = 0; this.applyCulling(); }
    }
    if (!this.bubbleLateUpdate) this.updateBubblePositions();
  }

  lateUpdate(dt: number) {
    if (this.bubbleLateUpdate) this.updateBubblePositions();
  }

  /** 在场景中查找 `PlayerController`（取第一个）。 */
  private findPlayer(): PlayerController | null {
    const n = this.node.scene;
    if (!n) return null;
    const list = n.getComponentsInChildren(PlayerController);
    return list.length > 0 ? list[0] : null;
  }

  private popBreadFromPlayerForStage(): Node | null {
    const p = this.findPlayer();
    const itp = p?.breadStack ? (p!.breadStack as any).popTopRaw?.() as Node | null : null;
    return itp || null;
  }

  private bindAreaTrigger(node: Node | null, setter: (v: boolean) => void) {
    if (!node) return;
    const col = node.getComponent(Collider) || node.getComponentInChildren(Collider);
    if (!col) return;
    console.log('[Market] bindAreaTrigger', node.name, 'isTrigger=', col.isTrigger);
    col.on('onTriggerEnter', (e: ITriggerEvent) => {
      console.log('[Market] trigger enter', e.otherCollider?.node?.name);
      if (this.isPlayerCollider(e.otherCollider)) setter(true);
      if (node === this.sellArea && e.otherCollider) {
        const who = this.classifyCollider(e.otherCollider);
        if (who === 'player') this.sellPlayerHit = true;
        else if (who === 'assistant') this.sellAssistantHit = true;
      }
    }, this);
    col.on('onTriggerStay', (e: ITriggerEvent) => {
      if (this.isPlayerCollider(e.otherCollider)) setter(true);
      if (node === this.sellArea && e.otherCollider) {
        const who = this.classifyCollider(e.otherCollider);
        if (who === 'player') this.sellPlayerHit = true;
        else if (who === 'assistant') this.sellAssistantHit = true;
      }
    }, this);
    col.on('onTriggerExit', (e: ITriggerEvent) => {
      console.log('[Market] trigger exit', e.otherCollider?.node?.name);
      if (this.isPlayerCollider(e.otherCollider)) setter(false);
      if (node === this.sellArea && e.otherCollider) {
        const who = this.classifyCollider(e.otherCollider);
        if (who === 'player') this.sellPlayerHit = false;
        else if (who === 'assistant') this.sellAssistantHit = false;
      }
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

  private classifyCollider(other: Collider | null): 'player' | 'assistant' | 'none' {
    if (!other) return 'none';
    let n: Node | null = other.node;
    while (n) {
      if (n.getComponent(PlayerController)) return 'player';
      const ac = n.getComponent(AssistantController);
      if (ac && ac.role === 'seller') return 'assistant';
      n = n.parent;
    }
    return 'none';
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
    this.customerDemandTotal = [];
    for (let i = 0; i < this.customerQueue.length; i++) {
      const node = this.customerQueue[i];
      const want = this.genDemand();
      this.customerDemands.push(want);
      this.customerDemandTotal.push(want);
      const lb = node.getComponentInChildren(Label);
      if (lb) lb.string = `${want}`;
      this.customerTargets.push(node.worldPosition.clone());
      const s = this.findCustomerStack(node);
      const carry = (s?.count() ?? 0) > 0;
      this.playCustomer(node, carry ? ['carry_idle', 'idle'] : ['idle']);
      this.spawnBubble(node, want);
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

  private updateQueuePositions(skipFront: boolean = false) {
    const parent = this.customerRoot ?? this.node;
    this.queueShifting = true;
    const movedCount = Math.max(0, this.customerQueue.length - (skipFront ? 1 : 0));
    this.shiftPending = movedCount;
    if (movedCount === 0) { this.queueShifting = false; return; }
    for (let i = 0; i < this.customerQueue.length; i++) {
      if (skipFront && i === 0) continue;
      const node = this.customerQueue[i];
      const posIndex = skipFront ? (i - 1) : i;
      const z = -posIndex * this.customerSpacingZ;
      const s = this.findCustomerStack(node);
      const carry = (s?.count() ?? 0) > 0;
      this.playCustomer(node, carry ? ['carry_move', 'move'] : ['move']);
      tween(node).to(this.customerShiftSec, { position: new Vec3(0, 0, z) }).call(() => {
        const s2 = this.findCustomerStack(node);
        const carry2 = (s2?.count() ?? 0) > 0;
        this.playCustomer(node, carry2 ? ['carry_idle', 'idle'] : ['idle']);
        this.shiftPending = Math.max(0, this.shiftPending - 1);
        if (this.shiftPending <= 0) this.queueShifting = false;
      }).start();
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
    this.customerDemandTotal.push(want);
    this.spawnBubble(n, want);
  }

  private serveFrontCustomer() {
    if (this.customerQueue.length === 0) return;
    if (this.queueShifting) return;
    if (!this.sellPlayerHit && !this.sellAssistantHit) return;
    if (this.frontDelivering) return;
    const node = this.customerQueue[0];
    let want = this.customerDemands[0] ?? 0;
    if (want <= 0) return;
    const stack = this.findCustomerStack(node);
    if (!stack) return;
    if (this.occupiedStageSlotsCount() <= 0) return;
    const item = this.takeStageFromTop();
    if (!item) return;
    if (stack.count() >= stack.capacity) { this.stagePlaced.push(item); return; }
    const parent = this.breadStageRoot || this.node;
    const targetW = this.getCustomerDeliverTargetWorld(stack);
    const origWant = want;
    this.frontDelivering = true;
    this.throwDeliverBread(item, parent!, targetW, () => {
      const ok = stack.tryAddItem(item);
      if (!ok) {
        if (!this.breadStageRoot) { this.stagePlaced.push(item); return; }
        const idxBack = this.findStageFreeSlot();
        this.stageReservedSlots.add(idxBack);
        const colBack = idxBack % this.breadStageColumns;
        const rowBack = Math.floor(idxBack / this.breadStageColumns);
        const xBack = (colBack - (this.breadStageColumns - 1) * 0.5) * this.breadStageColSpacing;
        const yBack = this.breadStageBaseY + rowBack * this.breadStageRowSpacing;
        const zBack = -this.breadStageOffsetZ;
        item.parent = this.breadStageRoot;
        (tween as any)(item)
          .to(this.breadStagePlaceSec, { position: new Vec3(xBack, yBack, zBack) }, { easing: this.breadStagePlaceEasing })
          .call(() => { this.stageReservedSlots.delete(idxBack); this.stageSlots[idxBack] = item; this.stagePlaced.push(item); this.frontDelivering = false; })
          .start();
        return;
      }
      want -= 1;
      this.customerDemands[0] = want;
      this.playCustomer(node, ['carry_idle', 'idle']);
      const lb = node.getComponentInChildren(Label);
      if (lb) lb.string = `${want > 0 ? want : 0}`;
      this.updateBubble(node, want, this.customerDemandTotal[0] ?? origWant);
      if (want <= 0) {
        const coins = origWant * this.price;
        const count = coins;
        for (let i = 0; i < count; i++) {
          if (!this.coinPrefab || !this.coinSpawnRoot) break;
          const n = instantiate(this.coinPrefab);
          n.parent = this.coinSpawnRoot;
          if (this.coinPlaced.length < this.coinPlacedMax) {
            const idx = this.coinPlaced.length;
            const col = idx % this.coinPlacedColumns;
            const row = Math.floor(idx / this.coinPlacedColumns);
            const x = (col - (this.coinPlacedColumns - 1) * 0.5) * this.coinPlacedColSpacing;
            const y = this.coinPlacedBaseY + row * this.coinPlacedRowSpacing;
            const z = -this.coinPlacedOffsetZ;
            n.setPosition(0, 0, 0);
            tween(n).to(this.coinPlaceSec, { position: new Vec3(x, y, z) }, { easing: this.coinPlaceEasing }).start();
            this.coinPlaced.push(n);
            this.cacheCoinRenderers(n);
          } else {
            const last = this.getCoinSlotLocal(Math.max(0, this.coinPlacedMax - 1));
            n.setPosition(0, 0, 0);
            (tween as any)(n)
              .to(this.coinPlaceSec, { position: last }, { easing: this.coinPlaceEasing })
              .call(() => { Economy.add(1); this.vanishCoin(n); })
              .start();
          }
        }
        this.removeBubble(node);
        const doLeave = () => {
          this.frontLeaving = true;
        this.playCustomer(node, ['carry_move', 'move']);
        this.updateQueuePositions(true);
        tween(node)
          .to(this.customerLeaveSec, { position: new Vec3(node.position.x, node.position.y, node.position.z + this.customerLeaveOffsetZ) })
          .call(() => {
            this.removeBubble(node);
            node.destroy();
            this.customerQueue.shift();
            this.customerDemands.shift();
            this.customerTargets.shift();
            this.customerDemandTotal.shift();
            this.addTailCustomer();
            this.frontLeaving = false;
          })
          .start();
      };
        if (this.customerLeaveDelaySec > 0) this.scheduleOnce(() => { doLeave(); }, this.customerLeaveDelaySec);
        else doLeave();
      }
      this.frontDelivering = false;
    });
  }

  private findCustomerStack(node: Node): CollectStack | null {
    const s = node.getComponent(CollectStack) || node.getComponentInChildren(CollectStack);
    return s || null;
  }

  private cacheCoinRenderers(n: Node) {
    const mrs = n.getComponentsInChildren(MeshRenderer);
    const srs = n.getComponentsInChildren(SkinnedMeshRenderer);
    this.coinRenderers.set(n, [...mrs, ...srs]);
  }

  private cacheBreadRenderers(n: Node) {
    const mrs = n.getComponentsInChildren(MeshRenderer);
    const srs = n.getComponentsInChildren(SkinnedMeshRenderer);
    this.breadRenderers.set(n, [...mrs, ...srs]);
  }

  private getCustomerDeliverTargetWorld(stack: CollectStack): Vec3 {
    return this.getStackNextSlotWorld(stack);
  }

  private getStackNextSlotWorld(stack: CollectStack): Vec3 {
    const idx = Math.max(0, stack.count());
    const cols = Math.max(1, stack.columns);
    const colSp = stack.colSpacing > 0 ? stack.colSpacing : 20;
    const rowSp = stack.rowSpacing > 0 ? stack.rowSpacing : 20;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = (col - (cols - 1) * 0.5) * colSp;
    const y = stack.baseY + row * rowSp;
    const z = -stack.offsetZ;
    const anchor = stack.anchor ?? stack.node;
    const world = new Vec3();
    Vec3.transformMat4(world, new Vec3(x, y, z), anchor.worldMatrix);
    return world;
  }

  private throwDeliverBread(item: Node, parent: Node, targetWorld: Vec3, onArrive: () => void) {
    const inv = new Mat4(); Mat4.invert(inv, parent.worldMatrix);
    const lp = new Vec3(); Vec3.transformMat4(lp, targetWorld, inv);
    const start = item.position.clone();
    const mid = new Vec3((start.x + lp.x) * 0.5, (start.y + lp.y) * 0.5 + this.deliverArcPeakY, (start.z + lp.z) * 0.5);
    const s0 = item.scale.clone();
    const s1 = new Vec3(s0.x * this.deliverShrink, s0.y * this.deliverShrink, s0.z);
    const s2 = new Vec3(s0.x * this.deliverOvershoot, s0.y * this.deliverOvershoot, s0.z);
    (tween as any)(item)
      .to(this.deliverThrowSec * 0.5, { position: mid, scale: s1 }, { easing: this.deliverEasing })
      .to(this.deliverThrowSec * 0.5, { position: lp, scale: s2 }, { easing: this.deliverEasing })
      .to(this.deliverSettleSec, { scale: s0 }, { easing: 'sineOut' })
      .call(onArrive)
      .start();
  }

  private getCoinPickupTargetWorld(p: PlayerController): Vec3 {
    const s = (p as any).coinStack as CollectStack | null;
    if (!s) return p.node.worldPosition.clone();
    return this.getStackNextSlotWorld(s);
  }

  private getCoinSlotLocal(idx: number): Vec3 {
    const col = idx % this.coinPlacedColumns;
    const row = Math.floor(idx / this.coinPlacedColumns);
    const x = (col - (this.coinPlacedColumns - 1) * 0.5) * this.coinPlacedColSpacing;
    const y = this.coinPlacedBaseY + row * this.coinPlacedRowSpacing;
    const z = -this.coinPlacedOffsetZ;
    return new Vec3(x, y, z);
  }

  private throwCoinPickup(item: Node, parent: Node, targetWorld: Vec3, onArrive: () => void) {
    const inv = new Mat4(); Mat4.invert(inv, parent.worldMatrix);
    const lp = new Vec3(); Vec3.transformMat4(lp, targetWorld, inv);
    const start = item.position.clone();
    const mid = new Vec3((start.x + lp.x) * 0.5, (start.y + lp.y) * 0.5 + this.coinPickupArcPeakY, (start.z + lp.z) * 0.5);
    const s0 = item.scale.clone();
    const s1 = new Vec3(s0.x * this.coinPickupShrink, s0.y * this.coinPickupShrink, s0.z);
    const s2 = new Vec3(s0.x * this.coinPickupOvershoot, s0.y * this.coinPickupOvershoot, s0.z);
    (tween as any)(item)
      .to(this.coinPickupThrowSec * 0.5, { position: mid, scale: s1 }, { easing: this.coinPickupEasing })
      .to(this.coinPickupThrowSec * 0.5, { position: lp, scale: s2 }, { easing: this.coinPickupEasing })
      .to(this.coinPickupSettleSec, { scale: s0 }, { easing: 'sineOut' })
      .call(onArrive)
      .start();
  }

  private findSellerAssistants(): AssistantController[] {
    const s = this.node.scene;
    if (!s) return [];
    const list = s.getComponentsInChildren(AssistantController);
    const out: AssistantController[] = [];
    for (const a of list) { if (a.role === 'seller') out.push(a); }
    return out;
  }

  

  private vanishCoin(item: Node) {
    (tween as any)(item)
      .to(this.coinPickupSettleSec, { scale: new Vec3(0, 0, 0) }, { easing: 'sineIn' })
      .call(() => { try { item.destroy(); } catch {} })
      .start();
  }

  private ensureStageSlotArray() {
    const n = Math.max(1, this.breadStageMax | 0);
    if (this.stageSlots.length !== n) {
      const old = this.stageSlots;
      this.stageSlots = new Array(n).fill(null);
      for (let i = 0; i < Math.min(old.length, n); i++) this.stageSlots[i] = old[i];
      this.stageReservedSlots.clear();
    }
  }

  private findStageFreeSlot(): number {
    this.ensureStageSlotArray();
    for (let i = 0; i < this.breadStageMax; i++) {
      const used = !!this.stageSlots[i];
      const resv = this.stageReservedSlots.has(i);
      if (!used && !resv) return i;
    }
    return Math.max(0, this.breadStageMax - 1);
  }

  private occupiedStageSlotsCount(): number {
    this.ensureStageSlotArray();
    let c = 0;
    for (let i = 0; i < this.breadStageMax; i++) if (this.stageSlots[i]) c++;
    return c + this.stageReservedSlots.size;
  }

  private topStageIndex(): number {
    this.ensureStageSlotArray();
    for (let i = this.breadStageMax - 1; i >= 0; i--) {
      if (this.stageSlots[i]) return i;
    }
    return -1;
  }

  private takeStageFromTop(): Node | null {
    const idx = this.topStageIndex();
    if (idx < 0) return null;
    const item = this.stageSlots[idx] as Node;
    try { (tween as any).stopAllByTarget?.(item); } catch {}
    this.stageSlots[idx] = null;
    const j = this.stagePlaced.indexOf(item);
    if (j >= 0) this.stagePlaced.splice(j, 1);
    return item;
  }

  

  


  private playCustomer(node: Node, names: string[]) {
    const sa = node.getComponent(SkeletalAnimation) || node.getComponentInChildren(SkeletalAnimation);
    if (sa) {
      const tryNames: string[] = [];
      const addName = (n: string) => {
        tryNames.push(n);
        tryNames.push(n + '.animation');
      };
      for (const base of names) {
        if (base === 'move') { addName('move'); addName('run'); addName('walk'); }
        else if (base === 'carry_move') { addName('carry_move'); addName('carry_run'); addName('carry_walk'); }
        else { addName(base); }
      }
      let chosen: string | null = null;
      for (const nm of tryNames) {
        const st = (sa as any).getState?.(nm);
        if (st) { chosen = nm; break; }
      }
      if (!chosen) {
        const idleNames = ['carry_idle', 'idle'];
        const candidates: string[] = [];
        for (const n of idleNames) { addName(n); }
        for (const nm of candidates.length > 0 ? candidates : tryNames) {
          const st = (sa as any).getState?.(nm);
          if (st) { chosen = nm; break; }
        }
      }
      const prev = this.lastAnim.get(node) || null;
      if (chosen && prev === chosen) {
        return;
      }
      if (chosen) {
        try {
          if ((sa as any).crossFade) (sa as any).crossFade(chosen, 0.1);
          else (sa as any).play?.(chosen);
          this.lastAnim.set(node, chosen);
          console.log('[Market] play SA', node.name, '->', chosen);
        } catch {}
      } else {
        console.log('[Market] play SA failed', node.name, 'candidates=', tryNames);
      }
      return;
    }
    const an = node.getComponent(Animation) || node.getComponentInChildren(Animation);
    if (an) {
      const tryNames: string[] = [];
      const addName = (n: string) => {
        tryNames.push(n);
        tryNames.push(n + '.animation');
      };
      for (const base of names) {
        if (base === 'move') { addName('move'); addName('run'); addName('walk'); }
        else if (base === 'carry_move') { addName('carry_move'); addName('carry_run'); addName('carry_walk'); }
        else { addName(base); }
      }
      let chosen: string | null = null;
      for (const nm of tryNames) {
        const st = (an as any).getState?.(nm);
        if (st) { chosen = nm; break; }
      }
      if (!chosen) {
        const idleNames = ['carry_idle', 'idle'];
        const candidates: string[] = [];
        for (const n of idleNames) { addName(n); }
        for (const nm of candidates.length > 0 ? candidates : tryNames) {
          const st = (an as any).getState?.(nm);
          if (st) { chosen = nm; break; }
        }
      }
      const prev = this.lastAnim.get(node) || null;
      if (chosen && prev === chosen) {
        return;
      }
      if (chosen) {
        try {
          if ((an as any).crossFade) (an as any).crossFade(chosen, 0.1);
          else (an as any).play?.(chosen);
          this.lastAnim.set(node, chosen);
          console.log('[Market] play Anim', node.name, '->', chosen);
        } catch {}
      } else { console.log('[Market] play Anim failed', node.name, 'candidates=', tryNames); }
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

  private spawnBubble(cust: Node, total: number) {
    if (!this.uiCanvas) return;
    if (this.bubbleMap.has(cust)) return;
    if (this.bubblePrefab) {
      const root = instantiate(this.bubblePrefab);
      root.parent = this.uiCanvas;
      root.setScale(this.bubbleScale, this.bubbleScale, 1);
      const pb = root.getComponent(ProgressBar) || root.getComponentInChildren(ProgressBar);
      if (pb) {
        const bar = (pb as any).barSprite as Sprite | null;
        if (bar) {
          const FILLED = (Sprite as any).Type?.FILLED ?? 3;
          const Mode = (ProgressBar as any).Mode ?? {};
          const isBarFilled = (bar as any).type === FILLED;
          const isModeFilled = (pb as any).mode === Mode.FILLED;
          if (isBarFilled && !isModeFilled && Mode.FILLED != null) {
            try { (pb as any).mode = Mode.FILLED; } catch {}
          }
          if (!isBarFilled && isModeFilled) {
            try { (bar as any).type = FILLED; } catch {}
          }
        }
        try { (pb as any).progress = 0; } catch {}
      }
      const lb = root.getComponent(Label) || root.getComponentInChildren(Label);
      if (lb) lb.string = `${total}`;
      const countNode = root.getChildByName('count') || root.getChildByName('Count');
      const spCount = countNode ? countNode.getComponent(Sprite) : null;
      const df = this.getDigitFrame(Math.max(0, Math.min(9, total)));
      if (spCount && df) {
        spCount.enabled = true;
        spCount.spriteFrame = df;
      } else if (countNode) {
        const lb2 = countNode.getComponent(Label) || countNode.addComponent(Label);
        lb2.string = `${total}`;
      }
      this.bubbleMap.set(cust, root);
      return;
    }
    if (!this.bubbleFrame || !this.bubbleFillFrame) return;
    const root = new Node('Bubble');
    root.parent = this.uiCanvas;
    const ut = root.addComponent(UITransform);
    ut.setContentSize(100, 100);
    root.setScale(this.bubbleScale, this.bubbleScale, 1);
    const inner = new Node('Inner');
    inner.parent = root;
    const spInner = inner.addComponent(Sprite);
    spInner.spriteFrame = this.bubbleFillFrame;
    spInner.type = Sprite.Type.FILLED;
    spInner.fillType = Sprite.FillType.HORIZONTAL;
    spInner.fillRange = 0;
    const num = new Node('Num');
    num.parent = root;
    const df2 = this.getDigitFrame(Math.max(0, Math.min(9, total)));
    if (df2) {
      const spNum = num.addComponent(Sprite);
      spNum.spriteFrame = df2;
    } else {
      const lb = num.addComponent(Label);
      lb.string = `${total}`;
      lb.fontSize = 24;
      lb.lineHeight = 26;
      lb.color = new Color(255,255,255,255);
    }
    const outer = new Node('Outer');
    outer.parent = root;
    const spOuter = outer.addComponent(Sprite);
    spOuter.spriteFrame = this.bubbleFrame;
    outer.setSiblingIndex(root.children.length - 1);
    this.bubbleMap.set(cust, root);
  }

  private updateBubble(cust: Node, remain: number, total: number) {
    const root = this.bubbleMap.get(cust);
    if (!root) return;
    const lbAny = root.getComponent(Label) || root.getComponentInChildren(Label);
    if (lbAny) lbAny.string = `${Math.max(0, remain)}`;
    const countNode = root.getChildByName('count') || root.getChildByName('Count');
    const spCount = countNode ? countNode.getComponent(Sprite) : null;
    const df = this.getDigitFrame(Math.max(0, Math.min(9, remain)));
    if (spCount && df) {
      spCount.enabled = true;
      spCount.spriteFrame = df;
    } else if (countNode) {
      const lb2 = countNode.getComponent(Label) || countNode.addComponent(Label);
      lb2.string = `${Math.max(0, remain)}`;
    }
    const pb = root.getComponent(ProgressBar) || root.getComponentInChildren(ProgressBar);
    if (pb) {
      const progress = total <= 0 ? 1 : (total - remain) / total;
      pb.progress = Math.max(0, Math.min(1, progress));
    } else {
      const num = root.getChildByName('Num');
      const spNum = num ? num.getComponent(Sprite) : null;
      const df2 = this.getDigitFrame(Math.max(0, Math.min(9, remain)));
      if (spNum && df2) spNum.spriteFrame = df2;
      const inner = root.getChildByName('Inner');
      const sp = inner ? inner.getComponent(Sprite) : null;
      if (sp) {
        const progress = total <= 0 ? 1 : (total - remain) / total;
        sp.fillRange = Math.max(0, Math.min(1, progress));
      }
    }
  }

  private ensureDigitFrames() {
    if (this.digitFrames && this.digitFrames.length >= 10) return;
    if (!this.digitAtlas) return;
    const frames: SpriteFrame[] = [];
    for (let i = 0; i <= 9; i++) {
      const name = `${this.digitPrefix}${i}`;
      const f = this.digitAtlas.getSpriteFrame(name);
      if (f) frames.push(f);
    }
    if (frames.length === 10) this.digitFrames = frames;
  }

  private getDigitFrame(idx: number): SpriteFrame | null {
    this.ensureDigitFrames();
    if (!this.digitFrames || this.digitFrames.length <= idx) return null;
    return this.digitFrames[idx] || null;
  }

  private removeBubble(cust: Node) {
    const root = this.bubbleMap.get(cust);
    if (!root) return;
    root.destroy();
    this.bubbleMap.delete(cust);
    this.lastAnim.delete(cust);
  }

  private getWorldCamera(): Camera | null {
    const n = this.worldCameraNode;
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

  private findHeadAnchor(node: Node): Node | null {
    const name = this.headAnchorName?.trim();
    if (!name) return null;
    const q: Node[] = [node];
    while (q.length) {
      const n = q.shift()!;
      if (n.name === name) return n;
      for (const ch of n.children) q.push(ch);
    }
    return null;
  }

  private applyCulling() {
    const cam = this.getWorldCamera();
    if (!cam) return;
    const vs = view.getVisibleSize();
    const w = vs.width, h = vs.height;
    const camPos = cam.node.worldPosition.clone();
    const inViewCoins: Node[] = [];
    const inViewBreads: Node[] = [];
    const checkItem = (it: Node, arr: Node[]) => {
      if (!it || !it.isValid) return;
      const sp = cam.worldToScreen(it.worldPosition.clone());
      let inView = sp.z > 0 && sp.x >= -this.cullMarginX && sp.x <= w + this.cullMarginX && sp.y >= -this.cullMarginY && sp.y <= h + this.cullMarginY;
      if (!inView && this.cullRadius <= 0) { this.setRenderersEnabled(it, false); return; }
      const dx = it.worldPosition.x - camPos.x;
      const dz = it.worldPosition.z - camPos.z;
      const d2 = dx * dx + dz * dz;
      const radiusOk = this.cullRadius <= 0 || d2 <= this.cullRadius * this.cullRadius;
      if (inView && radiusOk) arr.push(it); else this.setRenderersEnabled(it, false);
    };
    for (const it of this.coinPlaced) checkItem(it, inViewCoins);
    for (const it of this.stagePlaced) checkItem(it, inViewBreads);
    const limit = (list: Node[]) => {
      if (this.maxVisible <= 0 || list.length <= this.maxVisible) return list;
      return list.slice(0, this.maxVisible);
    };
    const coinsKeep = new Set<Node>(limit(inViewCoins));
    const breadsKeep = new Set<Node>(limit(inViewBreads));
    for (const it of this.coinPlaced) this.setRenderersEnabled(it, coinsKeep.has(it));
    for (const it of this.stagePlaced) this.setRenderersEnabled(it, breadsKeep.has(it));
    for (const [cust, root] of this.bubbleMap.entries()) {
      const anchor = this.findHeadAnchor(cust);
      const wp = (anchor ? anchor.worldPosition.clone() : cust.worldPosition.clone());
      wp.y += this.bubbleWorldOffsetY;
      const sp = cam.worldToScreen(wp);
      const inView = sp.z > 0 && sp.x >= -this.cullMarginX && sp.x <= w + this.cullMarginX && sp.y >= -this.cullMarginY && sp.y <= h + this.cullMarginY;
      root.active = inView;
    }
  }

  private setRenderersEnabled(n: Node, on: boolean) {
    const arr = this.coinRenderers.get(n) || this.breadRenderers.get(n) || [];
    for (const r of arr) r.enabled = on;
  }

  private updateBubblePositions() {
    if (!this.uiCanvas) return;
    const ui = this.uiCanvas.getComponent(UITransform);
    if (!ui) return;
    const cam = this.getWorldCamera();
    if (!cam) return;
    for (const [cust, root] of this.bubbleMap.entries()) {
      const anchor = this.findHeadAnchor(cust);
      const wp = (anchor ? anchor.worldPosition.clone() : cust.worldPosition.clone());
      wp.y += this.bubbleWorldOffsetY;
      const sp = cam.worldToScreen(wp);
      if (this.bubbleUseViewScale) {
        const vs = view.getVisibleSize();
        const x = sp.x / view.getScaleX() + this.bubbleScreenOffsetX - vs.width * 0.5;
        const y = sp.y / view.getScaleY() + this.bubbleScreenOffsetY - vs.height * 0.5;
        root.setPosition(x, y, 0);
      } else {
        sp.x += this.bubbleScreenOffsetX;
        sp.y += this.bubbleScreenOffsetY;
        const pos = ui.convertToNodeSpaceAR(new Vec3(sp.x, sp.y, 0));
        root.setPosition(pos.x, pos.y, 0);
      }
    }
  }
}
  
  