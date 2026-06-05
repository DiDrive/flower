import { _decorator, Component, Node, Vec3, Label, Prefab, instantiate, Collider, BoxCollider, Mat4, tween, Enum, MeshRenderer, Material, Texture2D, Quat } from 'cc';
import { Economy } from './Economy';
import { PlayerController } from './PlayerController';
import { Factory } from './Factory';
import { Market } from './Market';
import { AssistantController } from './AssistantController';
import { FocusTarget } from './FocusTarget';
import { emit } from '../PlayableFramework/PlayableEvents';
const { ccclass, property } = _decorator;
const ExpansionMode = Enum({ none: 0, reveal_nodes: 1, reveal_market: 2, assistant_harvester: 3, assistant_seller: 4, reveal_all: 5 });


/**
 * - none ：仅扣费，不触发任何显示/生成
- reveal_nodes ：显现你提前摆好的节点（ nodesToReveal ）
- reveal_market ：显现新的 market （ marketToReveal ）
- assistant_harvester ：生成一个采集型助手
- assistant_seller ：生成一个售卖型助手
- reveal_all ：同时显现 nodesToReveal 与 marketToReveal
 */
/**
 * ExpansionZone 扩张区域。
 * - 玩家靠近并消耗携带的金币达到 `cost` 后标记完成并触发下载/商店跳转。
 * - `label` 显示当前所需金币或完成状态。
 * 使用：放置在需要扩张的区域入口处。
 */
@ccclass('ExpansionZone')
export class ExpansionZone extends Component {
  @property({ min: 0.1, tooltip: '玩家靠近判定半径（XZ）' }) radius: number = 60;
  @property({ min: 0, tooltip: '扩张所需金币，完成后触发CTA' }) cost: number = 100;
  @property({ type: Label, tooltip: '显示扩张所需金币或完成状态' }) label: Label | null = null;
  @property({ type: ExpansionMode, tooltip: '模式' }) mode: number = ExpansionMode.none;
  @property({ type: Prefab, tooltip: '助手预制体（生成后挂载助手逻辑）' }) assistantPrefab: Prefab | null = null;
  @property({ type: Factory, tooltip: '工厂引用（助手行为需要）' }) factoryRef: Factory | null = null;
  @property({ type: Market, tooltip: '市场引用（助手行为需要）' }) marketRef: Market | null = null;
  @property({ type: Node, tooltip: '区域节点（使用其碰撞体AABB进行判定；留空则取自身）' }) area: Node | null = null;
  @property({ min: 0, tooltip: '每秒消耗的金币速率（0为瞬时消耗）' }) drainPerSec: number = 0;
  @property({ type: Node, tooltip: '解锁后显示的新市场根节点（默认active=false）' }) marketToReveal: Node | null = null;
  @property({ tooltip: '解锁时将 marketToReveal 设为 active' }) revealActivate: boolean = true;
  @property({ type: [Node], tooltip: '解锁后显现的节点列表（pickup/助手/顾客等）' }) nodesToReveal: Node[] = [];
  @property({ tooltip: '显现时播放弹出动画' }) revealBounce: boolean = true;
  @property({ min: 0.01, tooltip: '弹出时长' }) revealBounceInSec: number = 0.35;
  @property({ min: 0.01, tooltip: '回弹时长' }) revealBounceOutSec: number = 0.2;
  @property({ min: 0, tooltip: '弹出放大倍数' }) revealOvershoot: number = 1.08;
  @property({ min: 0, tooltip: '初始缩放倍数' }) revealInitialScale: number = 0.2;
  @property({ type: Texture2D, tooltip: '填充贴图' }) fillTexture: Texture2D | null = null;
  @property({ type: [Texture2D], tooltip: '数字0-9贴图数组' }) digitTextures: Texture2D[] = [];
  @property({ tooltip: '使用材质指示' }) useMaterialIndicator: boolean = true;
  @property({ type: Node, tooltip: '填充平面节点' }) fillNode: Node | null = null;
  @property({ type: [Node], tooltip: '数字平面数组' }) digitNodes: Node[] = [];
  @property({ tooltip: '填充使用Z轴（默认X轴）' }) fillUseZAxis: boolean = false;
  @property({ min: 0, tooltip: '填充条本地宽度（用于左对齐缩放）' }) fillWidthLocal: number = 60;
  @property({ type: Node, tooltip: '填充左锚点' }) fillLeftAnchor: Node | null = null;
  @property({ type: Node, tooltip: '填充右锚点' }) fillRightAnchor: Node | null = null;
  @property({ type: Node, tooltip: '填充容器' }) fillContainer: Node | null = null;
  @property({ tooltip: '锚点在容器内使用局部坐标' }) anchorsInContainer: boolean = true;
  @property({ tooltip: '反向填充（从右向左）' }) fillReverse: boolean = false;
  @property({ min: 0, tooltip: '完成后停留时长' }) completeHoldSec: number = 0.4;
  @property({ min: 0, tooltip: '完成弹入时长' }) completeBounceInSec: number = 0.25;
  @property({ min: 0, tooltip: '完成回弹时长' }) completeBounceOutSec: number = 0.2;
  @property({ min: 0, tooltip: '完成弹入放大倍数' }) completeOvershoot: number = 1.08;
  @property({ tooltip: '完成后隐藏该区域' }) completeHideAfterBounce: boolean = true;
  @property({ type: [Node], tooltip: '作为花朵分排显现的节点列表' }) flowerNodes: Node[] = [];
  @property({ tooltip: '花朵分排按Z轴分组（默认X轴）' }) flowerRowUseZAxis: boolean = false;
  @property({ min: 0.001, tooltip: '分排分组容差' }) flowerRowTolerance: number = 10;
  @property({ min: 0, tooltip: '每排显现间隔（秒）' }) flowerRowDelaySec: number = 0.25;
  @property({ type: Node, tooltip: '花显现完成后玩家自动移动目标' }) playerMoveTarget: Node | null = null;
  @property({ min: 0, tooltip: '玩家自动移动时长（秒）' }) playerMoveSec: number = 1.2;
  @property({ type: [Node], tooltip: '在花显现与玩家位移之后显现的其他物品' }) otherNodesToReveal: Node[] = [];
  @property({ type: Node, tooltip: '结束UI根节点（默认active=false）' }) endUIRoot: Node | null = null;
  @property({ type: [Node], tooltip: '序列期间需要隐藏的UI根节点列表' }) uiHideList: Node[] = [];
  @property({ tooltip: '自动移动期间相机偏移增量' }) autoCamZoomDelta: Vec3 = new Vec3(0, 8, 8);
  @property({ tooltip: '引导出现的标识键（非空则初始隐藏，等待触发）' }) appearOnGuideKey: string = '';
  @property({ tooltip: '引导出现时是否弹入' }) appearUseBounce: boolean = true;
  @property({ tooltip: '使用 Guide Targets 名称自动出现（初始隐藏）' }) appearByGuideTargets: boolean = false;
  
  private done = false;
  private remain = 0;
  private col: Collider | null = null;
  private fillMat: Material | null = null;
  private digitMats: Material[] = [];
  private fillScale0X = 1;
  private fillScale0Z = 1;
  private static guideMap: Map<string, ExpansionZone[]> = new Map();
  private appearFocusedOnce = false;
  private unlockFocusedOnce = false;

  onLoad() {
    this.remain = Math.max(0, this.cost);
    const node = this.area ?? this.node;
    this.col = node.getComponent(Collider) || node.getComponentInChildren(Collider);
    if (this.label) this.label.string = `${this.remain}`;
    if (this.appearOnGuideKey && this.appearOnGuideKey.length > 0) {
      const arr = ExpansionZone.guideMap.get(this.appearOnGuideKey) || [];
      arr.push(this);
      ExpansionZone.guideMap.set(this.appearOnGuideKey, arr);
      this.node.active = false;
    }
    if (this.appearByGuideTargets) {
      const k = this.node?.name || '';
      if (k && k.length > 0) {
        const arr = ExpansionZone.guideMap.get(k) || [];
        arr.push(this);
        ExpansionZone.guideMap.set(k, arr);
        this.node.active = false;
      }
    }
    const nm = (this.node?.name || '').trim().toLowerCase();
  }

  update(dt: number) {
    if (this.done) return;
    const p = this.findPlayer();
    if (!p) return;
    const inside = this.isInsideAreaXZ(p.node.worldPosition);
    this.updateMaterialIndicator(this.remain, this.cost, inside);
    if (!inside) return;
    if (this.remain <= 0) { this.onUnlocked(); return; }
    const need = this.drainPerSec <= 0 ? this.remain : Math.min(this.remain, Math.max(1, Math.floor(this.drainPerSec * dt)));
    const stackCount = p.coinStack ? (p.coinStack as any).count?.() as number : 0;
    const overflow = Math.max(0, Economy.coins - stackCount);
    const useGlobal = Math.min(need, overflow);
    const spentGlobal = useGlobal > 0 ? Economy.spendUpTo(useGlobal) : 0;
    const remainNeed = Math.max(0, need - spentGlobal);
    const spentStack = remainNeed > 0 && stackCount > 0 ? p.removeCoin(Math.min(remainNeed, stackCount)) : 0;
    const spent = spentGlobal + spentStack;
    this.remain -= spent;
    if (this.label) this.label.string = `${this.remain}`;
    this.updateMaterialIndicator(this.remain, this.cost, inside);
    if (this.remain <= 0) this.onUnlocked();
  }

  private findPlayer(): PlayerController | null {
    const n = this.node.scene;
    if (!n) return null;
    const list = n.getComponentsInChildren(PlayerController);
    return list.length > 0 ? list[0] : null;
  }

  private distanceTo(pos: Vec3): number {
    const a = this.node.worldPosition;
    return Math.hypot(a.x - pos.x, a.z - pos.z);
  }

  private onUnlocked() {
    this.done = true;
    emit('zone-unlocked', this.node.name);
    if (this.label) this.label.string = `OK`;
    if (this.uiHideList && this.uiHideList.length > 0) { for (const n of this.uiHideList) { if (n) n.active = false; } }
    const doRevealMarket = () => {
      const mNode = this.marketToReveal;
      if (!mNode || !this.revealActivate) return;
      mNode.active = true;
      const orig = mNode.scale.clone();
      mNode.setScale(orig.x * this.revealInitialScale, orig.y * this.revealInitialScale, orig.z * this.revealInitialScale);
      tween(mNode)
        .to(this.revealBounceInSec, { scale: new Vec3(orig.x * this.revealOvershoot, orig.y * this.revealOvershoot, orig.z * this.revealOvershoot) }, { easing: 'backOut' })
        .to(this.revealBounceOutSec, { scale: orig }, { easing: 'sineOut' })
        .start();
    };
    const doRevealNodes = () => {
      if (!this.nodesToReveal || this.nodesToReveal.length === 0) return;
      for (const n of this.nodesToReveal) {
        if (!n) continue;
        const isFlower = this.flowerNodes && this.flowerNodes.indexOf(n) >= 0;
        if (isFlower) continue;
        n.active = true;
        if (this.revealBounce) {
          const orig = n.scale.clone();
          n.setScale(orig.x * this.revealInitialScale, orig.y * this.revealInitialScale, orig.z * this.revealInitialScale);
          tween(n)
            .to(this.revealBounceInSec, { scale: new Vec3(orig.x * this.revealOvershoot, orig.y * this.revealOvershoot, orig.z * this.revealOvershoot) }, { easing: 'backOut' })
            .to(this.revealBounceOutSec, { scale: orig }, { easing: 'sineOut' })
            .start();
        }
      }
    };
    const doRevealOtherNodes = () => {
      if (!this.otherNodesToReveal || this.otherNodesToReveal.length === 0) return;
      for (const n of this.otherNodesToReveal) {
        if (!n) continue;
        n.active = true;
        if (this.revealBounce) {
          const orig = n.scale.clone();
          n.setScale(orig.x * this.revealInitialScale, orig.y * this.revealInitialScale, orig.z * this.revealInitialScale);
          tween(n)
            .to(this.revealBounceInSec, { scale: new Vec3(orig.x * this.revealOvershoot, orig.y * this.revealOvershoot, orig.z * this.revealOvershoot) }, { easing: 'backOut' })
            .to(this.revealBounceOutSec, { scale: orig }, { easing: 'sineOut' })
            .start();
        }
      }
    };
    const groupFlowerRows = (): Node[][] => {
      const list = (this.flowerNodes || []).filter(n => !!n);
      if (!list || list.length === 0) return [];
      const hasChildren = list.some(n => (n.children?.length || 0) > 0);
      if (hasChildren) {
        const rows: Node[][] = [];
        for (const rowRoot of list) {
          const children = (rowRoot.children || []).slice();
          rows.push(children);
        }
        return rows;
      }
      const useZ = !!this.flowerRowUseZAxis;
      const tol = Math.max(0.001, this.flowerRowTolerance || 10);
      const map = new Map<number, Node[]>();
      for (const n of list) {
        const wp = n.worldPosition;
        const v = useZ ? wp.z : wp.x;
        const key = Math.round(v / tol) * tol;
        const arr = map.get(key);
        if (arr) arr.push(n); else map.set(key, [n]);
      }
      const keys = Array.from(map.keys()).sort((a, b) => a - b);
      const rows: Node[][] = keys.map(k => map.get(k) || []);
      return rows;
    };
    const revealFlowersRowByRow = () => {
      const rows = groupFlowerRows();
      if (!rows || rows.length === 0) return 0;
      for (const root of (this.flowerNodes || [])) { if (root && (root.children?.length || 0) > 0) root.active = true; }
      for (const row of rows) for (const n of row) { if (n) n.active = false; }
      const perDelay = Math.max(0, this.flowerRowDelaySec || 0);
      let lastDelay = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const delay = i * perDelay;
        lastDelay = delay;
        for (const n of row) {
          if (!n) continue;
          const orig = n.scale.clone();
          tween(n)
            .delay(delay)
            .call(() => { n.active = true; n.setScale(orig.x * this.revealInitialScale, orig.y * this.revealInitialScale, orig.z * this.revealInitialScale); })
            .to(this.revealBounceInSec, { scale: new Vec3(orig.x * this.revealOvershoot, orig.y * this.revealOvershoot, orig.z * this.revealOvershoot) }, { easing: 'backOut' })
            .to(this.revealBounceOutSec, { scale: orig }, { easing: 'sineOut' })
            .start();
        }
      }
      const total = lastDelay + this.revealBounceInSec + this.revealBounceOutSec;
      return total;
    };
    const doSpawnAssistant = (role: 'harvester' | 'seller') => {
      if (!this.assistantPrefab) return;
      const n = instantiate(this.assistantPrefab);
      n.parent = this.node.parent ?? this.node.scene;
      const ac = (n.getComponent(AssistantController) as AssistantController) || (n.addComponent(AssistantController) as AssistantController);
      ac.role = role;
      ac.factory = this.factoryRef;
      ac.market = this.marketRef;
    };
    let revealMarketLater = false;
    let revealNodesLater = false;
    let assistantRoleLater: 'harvester' | 'seller' | null = null;
    switch (this.mode) {
      case ExpansionMode.reveal_market:
        revealMarketLater = true;
        break;
      case ExpansionMode.reveal_nodes:
        revealNodesLater = true;
        break;
      case ExpansionMode.assistant_harvester:
        assistantRoleLater = 'harvester';
        break;
      case ExpansionMode.assistant_seller:
        assistantRoleLater = 'seller';
        break;
      case ExpansionMode.reveal_all:
        revealNodesLater = true;
        revealMarketLater = true;
        break;
      default:
        break;
    }
    const p = this.findPlayer();
    const ft = (this.node.getComponent(FocusTarget) as FocusTarget) || (this.node.getComponentInChildren(FocusTarget) as FocusTarget);
    const focusLater = !!(ft && ft.focusNode);
    const rowTotalEstimate = ((this.flowerNodes?.length ?? 0) > 0) ? (Math.max(0, this.flowerRowDelaySec) * Math.max(0, (groupFlowerRows()?.length ?? 0) - 1) + this.revealBounceInSec + this.revealBounceOutSec) : 0;
    const moveTotal = this.playerMoveTarget ? Math.max(0, this.playerMoveSec) : 0;
    const otherTotal = (this.otherNodesToReveal && this.otherNodesToReveal.length > 0) ? (this.revealBounceInSec + this.revealBounceOutSec) : 0;
    const uiTotal = this.endUIRoot ? (this.revealBounceInSec + this.revealBounceOutSec) : 0;
    const focusDur = (ft && ft.enableOnUnlock && ft.focusNode) ? (Math.max(0, (ft as any).moveSec || 0) + Math.max(0, (ft as any).holdSec || 0)) : 0;
    const lockSec = this.completeHoldSec + this.completeBounceInSec + this.completeBounceOutSec + focusDur + rowTotalEstimate + moveTotal + otherTotal + uiTotal + 0.5;
    if (p && lockSec > 0) (p as any).lockControlFor?.(lockSec);
    const target = this.node;
    if (target) {
      const orig = target.scale.clone();
      tween(target)
        .delay(this.completeHoldSec)
        .to(this.completeBounceInSec, { scale: new Vec3(orig.x * this.completeOvershoot, orig.y * this.completeOvershoot, orig.z * this.completeOvershoot) }, { easing: 'backOut' })
        .to(this.completeBounceOutSec, { scale: orig }, { easing: 'sineOut' })
        .call(() => {
          if (this.completeHideAfterBounce) target.active = false;
          let didFocus = false;
          if (ft && ft.enableOnUnlock && this.mode !== ExpansionMode.reveal_market && p && ft.focusNode && !this.unlockFocusedOnce && !p.isCameraFocusing()) {
            this.unlockFocusedOnce = true;
            didFocus = true;
            const mv = Math.max(0, (ft as any).moveSec || 0);
            const hd = Math.max(0, (ft as any).holdSec || 0);
            const sid2 = p.startCameraFocus(ft.focusNode.worldPosition.clone(), mv, hd);
            (this.node as any).__unlockFocusSid = sid2;
          }
          const afterFocus = didFocus ? (Math.max(0, (ft as any).moveSec || 0) + Math.max(0, (ft as any).holdSec || 0)) : 0;
          tween(this.node)
            .delay(afterFocus)
            .call(() => {
              const sidStop = (this.node as any).__unlockFocusSid;
              (this.node as any).__unlockFocusSid = 0;
              if (didFocus && p && !(ft && ft.stopAfterRowsOnUnlock)) p.stopCameraFocus(sidStop);
              const flowersTotal = revealFlowersRowByRow();
              const afterFlowers = Math.max(0, flowersTotal);
              tween(this.node)
                .delay(afterFlowers)
                .call(() => {
                  if (didFocus && p && (ft && ft.stopAfterRowsOnUnlock)) p.stopCameraFocus(sidStop);
                  if (p && this.playerMoveTarget) {
                    const parent = p.node.parent;
                    const invParent = new Mat4();
                    if (parent) Mat4.invert(invParent, parent.worldMatrix);
                    const destW = this.playerMoveTarget.worldPosition.clone();
                    const destL = new Vec3(); Vec3.transformMat4(destL, destW, invParent);
                    p.setAutoFacingTarget(destW);
                    p.faceToWorld(destW);
                    const off = new Vec3(p.camOffset.x + this.autoCamZoomDelta.x, p.camOffset.y + this.autoCamZoomDelta.y, p.camOffset.z + this.autoCamZoomDelta.z);
                    p.setAutoCamOffset(off);
                    p.playAutoMoving();
                    tween(p.node)
                      .to(this.playerMoveSec, { position: destL }, { easing: 'sineInOut' })
                      .call(() => {
                        p.playAutoIdle();
                        p.setAutoFacingTarget(null);
                        if (assistantRoleLater) doSpawnAssistant(assistantRoleLater);
                        if (revealNodesLater) doRevealNodes();
                        if (revealMarketLater) doRevealMarket();
                        doRevealOtherNodes();
                        if (this.endUIRoot) {
                          const ui = this.endUIRoot;
                          ui.active = true;
                          const u0 = ui.scale.clone();
                          ui.setScale(u0.x * this.revealInitialScale, u0.y * this.revealInitialScale, u0.z * this.revealInitialScale);
                          tween(ui)
                            .to(this.revealBounceInSec, { scale: new Vec3(u0.x * this.revealOvershoot, u0.y * this.revealOvershoot, u0.z * this.revealOvershoot) }, { easing: 'backOut' })
                            .to(this.revealBounceOutSec, { scale: u0 }, { easing: 'sineOut' })
                            .start();
                        }
                      })
                      .start();
                  } else {
                    if (assistantRoleLater) doSpawnAssistant(assistantRoleLater);
                    if (revealNodesLater) doRevealNodes();
                    if (revealMarketLater) doRevealMarket();
                    doRevealOtherNodes();
                    if (this.endUIRoot) {
                      const ui = this.endUIRoot;
                      ui.active = true;
                      const u0 = ui.scale.clone();
                      ui.setScale(u0.x * this.revealInitialScale, u0.y * this.revealInitialScale, u0.z * this.revealInitialScale);
                      tween(ui)
                        .to(this.revealBounceInSec, { scale: new Vec3(u0.x * this.revealOvershoot, u0.y * this.revealOvershoot, u0.z * this.revealOvershoot) }, { easing: 'backOut' })
                        .to(this.revealBounceOutSec, { scale: u0 }, { easing: 'sineOut' })
                        .start();
                    }
                    if (didFocus && p && (ft && ft.stopAfterRowsOnUnlock)) p.stopCameraFocus(sidStop);
                  }
                })
                .start();
            })
            .start();
        })
        .start();
    }
  }

  public static fireGuide(key: string) {
    const arr = ExpansionZone.guideMap.get(key) || [];
    for (const z of arr) z.appearNowWithFocus();
  }

  private appearNowWithFocus() {
    if (this.done) return;
    if (!this.node.active) {
      this.node.active = true;
      if (this.appearUseBounce) {
        const orig = this.node.scale.clone();
        this.node.setScale(orig.x * this.revealInitialScale, orig.y * this.revealInitialScale, orig.z * this.revealInitialScale);
        tween(this.node)
          .to(this.revealBounceInSec, { scale: new Vec3(orig.x * this.revealOvershoot, orig.y * this.revealOvershoot, orig.z * this.revealOvershoot) }, { easing: 'backOut' })
          .to(this.revealBounceOutSec, { scale: orig }, { easing: 'sineOut' })
          .start();
      }
    }
    const p = this.findPlayer();
    const ft2 = (this.node.getComponent(FocusTarget) as FocusTarget) || (this.node.getComponentInChildren(FocusTarget) as FocusTarget);
    if (p && ft2 && ft2.enableOnAppear && this.mode !== ExpansionMode.reveal_market && !this.appearFocusedOnce && !p.isCameraFocusing()) {
      this.appearFocusedOnce = true;
      const focusPos = (ft2.useAppearFocusNode && ft2.focusNode) ? ft2.focusNode.worldPosition.clone() : this.node.worldPosition.clone();
      const mv = Math.max(0, (ft2 as any).moveSec || 0);
      const hd = Math.max(0, (ft2 as any).holdSec || 0);
      const sid = p.startCameraFocus(focusPos, mv, hd);
      const after = Math.max(0, mv + hd);
      tween(this.node)
        .delay(after)
        .call(() => { p.stopCameraFocus(sid); })
        .start();
    }
  }

  private isInsideAreaXZ(p: Vec3): boolean {
    const node = this.area ?? this.node;
    const bc = this.col instanceof BoxCollider ? this.col : null;
    if (!bc || !node) return false;
    const inv = new Mat4();
    const m = this.col instanceof BoxCollider ? (this.col as BoxCollider).node.worldMatrix : node.worldMatrix;
    Mat4.invert(inv, m);
    const lp = new Vec3();
    Vec3.transformMat4(lp, p, inv);
    const dx = lp.x - bc.center.x;
    const dz = lp.z - bc.center.z;
    const hx = bc.size.x * 0.5;
    const hz = bc.size.z * 0.5;
    return Math.abs(dx) <= hx && Math.abs(dz) <= hz;
  }

  private ensureMaterialTargets() {
    if (this.fillNode && !this.fillMat) {
      const r = this.fillNode.getComponent(MeshRenderer);
      const mi = (r as any)?.getMaterialInstance?.(0) || r?.getSharedMaterial?.(0);
      this.fillMat = mi || null;
      this.fillScale0X = this.fillNode.scale.x;
      this.fillScale0Z = this.fillNode.scale.z;
    }
    if (this.digitNodes && this.digitNodes.length > 0 && this.digitMats.length === 0) {
      this.digitMats = [];
      for (const n of this.digitNodes) {
        const r = n?.getComponent(MeshRenderer) || null;
        const mi = (r as any)?.getMaterialInstance?.(0) || r?.getSharedMaterial?.(0);
        if (mi) this.digitMats.push(mi as Material);
      }
    }
  }

  private updateMaterialIndicator(remain: number, total: number, inside: boolean) {
    if (!this.useMaterialIndicator) return;
    this.ensureMaterialTargets();
    const prog = total <= 0 ? 1 : Math.max(0, Math.min(1, (total - remain) / total));
    if (this.fillNode) this.fillNode.active = total > 0;
    const val = Math.max(0, remain | 0);
    const s = `${val}`;
    if (this.digitMats.length > 0) {
      for (let i = 0; i < this.digitMats.length; i++) {
        const m = this.digitMats[i];
        const ch = i < s.length ? s[i] : '';
        const idx = ch ? (ch.charCodeAt(0) - 48) : -1;
        const tex = idx >= 0 && this.digitTextures && this.digitTextures[idx] ? this.digitTextures[idx] : null;
        if (tex) m.setProperty('mainTexture', tex);
        else m.setProperty('mainTexture', null as any);
        const node = this.digitNodes[i];
        if (node) node.active = total > 0 && !!ch;
      }
    }
    if (this.fillMat && this.fillTexture) this.fillMat.setProperty('mainTexture', this.fillTexture);
    if (this.fillNode) {
      const sProg = Math.max(0, Math.min(1, prog));
      if (this.fillContainer && this.fillLeftAnchor) {
        let leftL = new Vec3();
        let rightL = new Vec3();
        if (this.anchorsInContainer && this.fillLeftAnchor.parent === this.fillContainer && (!this.fillRightAnchor || this.fillRightAnchor.parent === this.fillContainer)) {
          leftL = this.fillLeftAnchor.position.clone();
          rightL = this.fillRightAnchor ? this.fillRightAnchor.position.clone() : new Vec3(leftL.x + (this.fillUseZAxis ? 0 : this.fillWidthLocal), leftL.y, leftL.z + (this.fillUseZAxis ? this.fillWidthLocal : 0));
        } else {
          const invCont = new Mat4();
          Mat4.invert(invCont, this.fillContainer.worldMatrix);
          const lw = this.fillLeftAnchor.worldPosition.clone();
          Vec3.transformMat4(leftL, lw, invCont);
          if (this.fillRightAnchor) {
            const rw = this.fillRightAnchor.worldPosition.clone();
            Vec3.transformMat4(rightL, rw, invCont);
          } else {
            rightL = new Vec3(leftL.x + (this.fillUseZAxis ? 0 : this.fillWidthLocal), leftL.y, leftL.z + (this.fillUseZAxis ? this.fillWidthLocal : 0));
          }
        }
        const dx = rightL.x - leftL.x;
        const dz = rightL.z - leftL.z;
        const widthL = Math.max(0.0001, Math.hypot(dx, dz));
        const nx = dx / widthL;
        const nz = dz / widthL;
        const half = (widthL * sProg) * 0.5;
        const baseX = this.fillReverse ? (rightL.x - nx * half) : (leftL.x + nx * half);
        const baseZ = this.fillReverse ? (rightL.z - nz * half) : (leftL.z + nz * half);
        const yaw = Math.atan2(-nz, nx);
        const q = new Quat(); Quat.fromEuler(q, 0, yaw * 180 / Math.PI, 0);
        this.fillNode.setRotation(q);
        const sx0 = this.fillScale0X || this.fillNode.scale.x;
        const sz0 = this.fillScale0Z || this.fillNode.scale.z;
        if (!this.fillUseZAxis) this.fillNode.setScale(sx0 * sProg, this.fillNode.scale.y, this.fillNode.scale.z);
        else this.fillNode.setScale(this.fillNode.scale.x, this.fillNode.scale.y, sz0 * sProg);
        this.fillNode.setPosition(baseX, this.fillNode.position.y, baseZ);
      }
    }
  }
}
  