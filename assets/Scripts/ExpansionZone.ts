import { _decorator, Component, Node, Vec3, Label, Prefab, instantiate, Collider, BoxCollider, Mat4, tween, Enum } from 'cc';
import { Economy } from './Economy';
import { PlayerController } from './PlayerController';
import { Factory } from './Factory';
import { Market } from './Market';
import { AssistantController } from './AssistantController';
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
  @property({ type: Node, tooltip: '解锁后摄像机聚焦节点（可选）' }) focusNode: Node | null = null;
  @property({ min: 0, tooltip: '摄像机移动时长' }) focusMoveSec: number = 1;
  @property({ min: 0, tooltip: '摄像机停留时长' }) focusHoldSec: number = 0.6;
  private done = false;
  private remain = 0;
  private col: Collider | null = null;

  onLoad() {
    this.remain = Math.max(0, this.cost);
    const node = this.area ?? this.node;
    this.col = node.getComponent(Collider) || node.getComponentInChildren(Collider);
    if (this.label) this.label.string = `${this.remain}`;
  }

  update(dt: number) {
    if (this.done) return;
    const p = this.findPlayer();
    if (!p) return;
    const inside = this.isInsideAreaXZ(p.node.worldPosition);
    if (!inside) return;
    if (this.remain <= 0) { this.onUnlocked(); return; }
    if (this.drainPerSec <= 0) {
      const spent = p.removeCoin(this.remain);
      this.remain -= spent;
    } else {
      const want = Math.max(1, Math.floor(this.drainPerSec * dt));
      const spent = p.removeCoin(Math.min(this.remain, want));
      this.remain -= spent;
    }
    if (this.label) this.label.string = `${this.remain}`;
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
    if (this.label) this.label.string = `OK`;
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
    const doSpawnAssistant = (role: 'harvester' | 'seller') => {
      if (!this.assistantPrefab) return;
      const n = instantiate(this.assistantPrefab);
      n.parent = this.node.parent ?? this.node.scene;
      const ac = (n.getComponent(AssistantController) as AssistantController) || (n.addComponent(AssistantController) as AssistantController);
      ac.role = role;
      ac.factory = this.factoryRef;
      ac.market = this.marketRef;
    };
    switch (this.mode) {
      case ExpansionMode.reveal_market:
        doRevealMarket();
        break;
      case ExpansionMode.reveal_nodes:
        doRevealNodes();
        break;
      case ExpansionMode.assistant_harvester:
        doSpawnAssistant('harvester');
        break;
      case ExpansionMode.assistant_seller:
        doSpawnAssistant('seller');
        break;
      case ExpansionMode.reveal_all:
        doRevealNodes();
        doRevealMarket();
        break;
      default:
        break;
    }
    const p = this.findPlayer();
    if (p && this.focusNode) p.startCameraFocus(this.focusNode.worldPosition.clone(), this.focusMoveSec, this.focusHoldSec);
    this.node.destroy();
  }

  private isInsideAreaXZ(p: Vec3): boolean {
    const node = this.area ?? this.node;
    const bc = this.col instanceof BoxCollider ? this.col : null;
    if (!bc || !node) return false;
    const inv = new Mat4();
    Mat4.invert(inv, node.worldMatrix);
    const lp = new Vec3();
    Vec3.transformMat4(lp, p, inv);
    const dx = lp.x - bc.center.x;
    const dz = lp.z - bc.center.z;
    const hx = bc.size.x * 0.5;
    const hz = bc.size.z * 0.5;
    return Math.abs(dx) <= hx && Math.abs(dz) <= hz;
  }
}