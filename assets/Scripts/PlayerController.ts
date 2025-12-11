import { _decorator, Component, Node, Vec3, tween, Animation, Vec2, Camera, Quat, SkeletalAnimation, AnimationClip } from 'cc';
import { ResourceNode } from './ResourceNode';
import { Joystick } from './Joystick';
import { CollectStack } from './CollectStack';
import { CollectItem } from './CollectItem';
const { ccclass, property } = _decorator;

/**
 * PlayerController 玩家控制器。
 * - 通过 `Joystick` 输入在 XZ 平面移动，并播放基础动画。
 * - 物品堆叠：花朵/面包/金币分别绑定到对应的 `CollectStack`。
 * - 相机跟随：`updateCamera` 实现软区、滞后与前置引导。
 * - 容量与交接冷却：限制总携带数量并避免同帧反复交互。
 * 使用：挂在玩家节点上，并关联摇杆、相机与各堆叠 Anchor。
 */
@ccclass('PlayerController')
export class PlayerController extends Component {
  @property({ min: 0.1, tooltip: '移动速度（单位/秒）' }) speed: number = 3;
  @property({ min: 1, tooltip: '背包/堆叠容量上限' }) capacity: number = 5;
  @property({ type: Node, tooltip: '点击指示器（可选）' }) targetIndicator: Node | null = null;
  @property({ type: Animation, tooltip: '角色动画（idle/run）' }) anim: Animation | null = null;
  @property({ type: Joystick, tooltip: '摇杆组件引用' }) joystick: Joystick | null = null;
  @property({ type: Camera, tooltip: '世界相机（可选）' }) worldCamera: Camera | null = null;
  @property({ tooltip: '使用XZ平面移动与判定' }) useXZ: boolean = true;
  @property({ type: CollectStack, tooltip: '花朵堆叠组件' }) stack: CollectStack | null = null;
  @property({ type: CollectStack, tooltip: '面包堆叠组件' }) breadStack: CollectStack | null = null;
  @property({ type: CollectStack, tooltip: '金币堆叠组件' }) coinStack: CollectStack | null = null;
  @property({ min: 0, tooltip: '采集/交互后短暂保护时间（秒）' }) handoffCooldownSec: number = 0.5;
  @property({ tooltip: '相机相对玩家偏移' }) camOffset: Vec3 = new Vec3(0, 12, 12);
  @property({ min: 0.1, tooltip: '相机跟随速度' }) camLag: number = 6;
  @property({ min: 0, tooltip: '相机软区半径（XZ）' }) camSoftRadius: number = 2;
  @property({ min: 0, tooltip: '相机前置距离' }) camLead: number = 3;
  @property({ tooltip: '道具等级：0无、1剪刀、2割草、3吸尘' }) toolLevel: number = 0;

  flowers = 0;
  breads = 0;
  coins = 0;
  private target: Vec3 | null = null;

  private sa: SkeletalAnimation | null = null;
  onLoad() {
    const sa = this.node.getComponent(SkeletalAnimation) || this.node.getComponentInChildren(SkeletalAnimation);
    this.sa = sa || null;
    if (!this.anim) {
      const a = this.node.getComponent(Animation) || this.node.getComponentInChildren(Animation);
      if (a) this.anim = a;
    }
  }
  onEnable() {}
  onDisable() {}

  private handoffCooldown = 0;

  /**
   * 平滑相机跟随。
   * - 软区：相机位置与目标差值在 `camSoftRadius` 内时不移动。
   * - 滞后：按 `camLag` 指数逼近目标位置。
   * - 前置：依据摇杆方向在 XZ 平面前置 `camLead` 距离。
   */
  public updateCamera(dt: number, stick: Vec2) {
    if (!this.worldCamera) return;
    const camNode = this.worldCamera.node;
    const p = this.node.worldPosition;
    const leadX = stick.x * this.camLead;
    const leadZ = -stick.y * this.camLead;
    const target = new Vec3(p.x + this.camOffset.x + leadX, p.y + this.camOffset.y, p.z + this.camOffset.z + leadZ);
    const cur = camNode.worldPosition;
    const dx = target.x - cur.x;
    const dz = target.z - cur.z;
    const d = Math.hypot(dx, dz);
    let nx = cur.x;
    let nz = cur.z;
    const a = Math.min(1, dt * this.camLag);
    if (d > this.camSoftRadius) {
      nx = cur.x + dx * a;
      nz = cur.z + dz * a;
    }
    const ny = cur.y + (target.y - cur.y) * a;
    camNode.setWorldPosition(nx, ny, nz);
  }

  /**
   * 玩家移动与动画更新。
   * 根据摇杆方向与携带物品调整移动速度，并调用相机跟随。
   */
  update(dt: number) {
    if (this.handoffCooldown > 0) this.handoffCooldown = Math.max(0, this.handoffCooldown - dt);
    const cur = this.node.worldPosition;
    const stick = this.joystick?.dir ?? new Vec2(0, 0);
    const len = stick.length();
    if (len < 1e-3) {
      const idle = this.chooseClip(0);
      if (this.anim) this.safePlay(idle);
      return;
    }
    const v = this.flowers + this.breads > 0 ? this.speed * 0.8 : this.speed;
    if (this.useXZ) {
      const nx = cur.x + stick.x * v * dt;
      const nz = cur.z - stick.y * v * dt;
      this.node.setWorldPosition(nx, cur.y, nz);
      const yaw = Math.atan2(stick.x, -stick.y) * 180 / Math.PI;
      const q = new Quat();
      Quat.fromEuler(q, 0, yaw, 0);
      this.node.setWorldRotation(q);
    } else {
      const nx = cur.x + stick.x * v * dt;
      const ny = cur.y + stick.y * v * dt;
      this.node.setWorldPosition(nx, ny, cur.z);
    }
    const run = this.chooseClip(len);
    this.safePlay(run);
    this.updateCamera(dt, stick);
  }

  private chooseClip(len: number): string {
    const moving = len >= 1e-3;
    if (this.breads > 0) return moving ? 'carry_run' : 'carry_idle';
    if (this.isInHarvestArea()) {
      switch (this.toolLevel) {
        case 1: return moving ? 'scissors_run' : 'scissors_idle';
        case 2: return moving ? 'mow_run' : 'mow_idle';
        case 3: return moving ? 'vacuum_run' : 'vacuum_idle';
        default: return moving ? 'run' : 'idle';
      }
    }
    return moving ? 'run' : 'idle';
  }

  private safePlay(name: string) {
    const target = this.hasClip(name) ? name : (this.hasClip('Animation') ? 'Animation' : name);
    if (this.sa) {
      try {
        (this.sa as any).play(target);
      } catch {
        try { (this.sa as any).playDefaultClip(); } catch {}
      }
      return;
    }
    try { this.anim?.play(target); } catch {}
  }

  private hasClip(name: string): boolean {
    if (this.sa && (this.sa.clips as any as AnimationClip[])) {
      const arr = this.sa.clips as any as AnimationClip[];
      return arr.some(c => (c as any).name === name);
    }
    return false;
  }

  private isInHarvestArea(): boolean {
    const s = this.node.scene;
    if (!s) return false;
    const p = this.node.worldPosition;
    const rns = s.getComponentsInChildren(ResourceNode);
    for (const rn of rns) {
      if (!rn.enabled || !rn.node.active) continue;
      const a = rn.node.worldPosition;
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d <= rn.radius) return true;
    }
    const items = s.getComponentsInChildren(CollectItem);
    for (const ci of items) {
      if (!ci.enabled || !ci.node.active) continue;
      const a = ci.node.worldPosition;
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d <= ci.pickupRadius) return true;
    }
    return false;
  }

  /** 是否还能携带指定数量的花朵（受总容量限制） */
  canCarryFlower(n: number) {
    const current = this.stack ? this.stack.count() : this.flowers;
    return current + this.breads + this.coins + n <= this.capacity;
  }
  /** 将一个花朵物品加入堆叠，成功时增加计数并触发交接冷却 */
  tryAddFlowerItem(item: Node) {
    if (!this.canCarryFlower(1)) return false;
    const ci = item.getComponent(CollectItem);
    if (ci) { ci.enabled = false; ci.destroy(); }
    if (this.stack) {
      const ok = this.stack.tryAddItem(item);
      if (ok) this.flowers += 1;
      if (ok) this.handoffCooldown = this.handoffCooldownSec;
      return ok;
    }
    return false;
  }
  /** 从花朵堆叠顶部移除 n 个并返回实际移除数量 */
  removeFlower(n: number) {
    let d = Math.min(n, this.flowers);
    if (this.stack) d = this.stack.removeTop(d);
    this.flowers -= d;
    return d;
  }
  /** 直接增加携带的面包数量（不超过容量） */
  addBread(n: number) {
    const maxBread = this.capacity - (this.flowers + this.coins);
    this.breads = Math.min(this.breads + n, maxBread);
    if (n > 0) this.handoffCooldown = this.handoffCooldownSec;
  }
  /** 从面包堆叠顶部移除 n 个并返回实际移除数量 */
  removeBread(n: number) {
    let d = Math.min(n, this.breads);
    if (this.breadStack) d = this.breadStack.removeTop(d);
    this.breads -= d;
    return d;
  }

  /** 是否还能携带指定数量的面包（受总容量限制） */
  canCarryBread(n: number) {
    const currentBread = this.breadStack ? this.breadStack.count() : this.breads;
    return this.flowers + this.coins + currentBread + n <= this.capacity;
  }
  /** 将一个面包物品加入堆叠，成功时增加计数并触发交接冷却 */
  tryAddBreadItem(item: Node) {
    if (!this.canCarryBread(1)) return false;
    const ci = item.getComponent(CollectItem);
    if (ci) { ci.enabled = false; ci.destroy(); }
    if (this.breadStack) {
      const ok = this.breadStack.tryAddItem(item);
      if (ok) this.breads += 1;
      if (ok) this.handoffCooldown = this.handoffCooldownSec;
      return ok;
    }
    return false;
  }

  /** 当前是否允许与外部进行交接（冷却结束） */
  canHandoff(): boolean {
    return this.handoffCooldown <= 0;
  }
  /** 是否还能携带指定数量的金币（受总容量限制） */
  canCarryCoin(n: number) {
    const currentCoin = this.coinStack ? this.coinStack.count() : this.coins;
    return this.flowers + this.breads + currentCoin + n <= this.capacity;
  }
  /** 将一个金币物品加入堆叠，成功时增加计数并触发交接冷却 */
  tryAddCoinItem(item: Node) {
    if (!this.canCarryCoin(1)) return false;
    const ci = item.getComponent(CollectItem);
    if (ci) { ci.enabled = false; ci.destroy(); }
    if (this.coinStack) {
      const ok = this.coinStack.tryAddItem(item);
      if (ok) this.coins += 1;
      if (ok) this.handoffCooldown = this.handoffCooldownSec;
      return ok;
    }
    return false;
  }
  /** 从金币堆叠顶部移除 n 个并返回实际移除数量 */
  removeCoin(n: number) {
    let d = Math.min(n, this.coins);
    if (this.coinStack) d = this.coinStack.removeTop(d);
    this.coins -= d;
    return d;
  }
}
  