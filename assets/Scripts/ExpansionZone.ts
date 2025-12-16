import { _decorator, Component, Node, Vec3, Label, Prefab, instantiate, Collider, BoxCollider, Mat4 } from 'cc';
import { Economy } from './Economy';
import { PlayerController } from './PlayerController';
import { Factory } from './Factory';
import { Market } from './Market';
import { AssistantController } from './AssistantController';
const { ccclass, property } = _decorator;

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
  @property({ tooltip: '解锁类型：none/harvester/seller' }) mode: string = 'none';
  @property({ type: Prefab, tooltip: '助手预制体（生成后挂载助手逻辑）' }) assistantPrefab: Prefab | null = null;
  @property({ type: Factory, tooltip: '工厂引用（助手行为需要）' }) factoryRef: Factory | null = null;
  @property({ type: Market, tooltip: '市场引用（助手行为需要）' }) marketRef: Market | null = null;
  @property({ type: Node, tooltip: '区域节点（使用其碰撞体AABB进行判定；留空则取自身）' }) area: Node | null = null;
  @property({ min: 0, tooltip: '每秒消耗的金币速率（0为瞬时消耗）' }) drainPerSec: number = 0;
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
    if (this.mode === 'harvester' || this.mode === 'seller') {
      if (this.assistantPrefab) {
        const n = instantiate(this.assistantPrefab);
        n.parent = this.node.parent ?? this.node.scene;
        const ac = (n.getComponent(AssistantController) as AssistantController) || (n.addComponent(AssistantController) as AssistantController);
        ac.role = this.mode === 'harvester' ? 'harvester' : 'seller';
        ac.factory = this.factoryRef;
        ac.market = this.marketRef;
      }
    }
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