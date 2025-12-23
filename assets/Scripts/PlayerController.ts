import { _decorator, Component, Node, Vec3, tween, Animation, Vec2, Camera, Quat, SkeletalAnimation, RigidBody, CapsuleCollider, CCInteger, Canvas, director, PhysicsSystem, Sprite, SpriteAtlas, SpriteFrame, UITransform, view, Color } from 'cc';
import { Economy } from './Economy';
import { ResourceNode } from './ResourceNode';
import { Joystick } from './Joystick';
import { CollectStack } from './CollectStack';
import { CollectItem } from './CollectItem';
import { ActionStateMachine } from './ActionStateMachine';
const { ccclass, property } = _decorator;

/**
 * PlayerController 玩家控制器。
 *
 * 动作系统（有限状态机）：
 * - 状态集合：
 *   idle/run、carry_idle/carry_run、scissors_idle/scissors_run、mow_idle/mow_run、vacuum_idle/vacuum_run。
 * - 选择优先级：
 *   1) 身上有面包 → carry_*；
 *   2) 无面包且在采集范围 → 按 toolLevel 选择对应道具的 *_idle/_run；
 *   3) 其它 → 常规 idle/run。
 * - 移动判定：摇杆长度与死区 `moveDeadZone`（<阈值视为静止，≥视为移动）。
 * - 采集范围：通过场景内 `ResourceNode.radius` 与 `CollectItem.pickupRadius` 在 XZ 平面上判定。
 * - 道具等级：`toolLevel`（0=无、1=剪刀、2=割草、3=吸尘）。
 * - 播放守护：仅当目标剪辑名与当前不同且播放成功时切换；失败回退到 `defaultClip` 或源 `Animation`。
 * - 名称解析：支持逻辑名与导入器生成的 `*.animation` 资源名映射。
 *
 * 其它系统：
 * - 物品堆叠：花朵/面包/金币分别绑定到对应的 `CollectStack`；动作携带状态以堆叠的真实数量判定。
 * - 相机跟随：`updateCamera` 实现软区、滞后与前置引导。
 * - 容量与交接冷却：限制总携带数量并避免同帧反复交互。
 *
 * 使用：挂在玩家节点上，并关联摇杆、相机与各堆叠 Anchor。
 */
@ccclass('PlayerController')
export class PlayerController extends Component {
  @property({ min: 0.1, tooltip: '移动速度（单位/秒）' }) speed: number = 3;
  @property({ min: 0, tooltip: '摇杆死区阈值' }) moveDeadZone: number = 0.2;
  @property({ tooltip: '动作剪辑映射(JSON，可覆盖默认命名)' }) clipMapJson: string = '';
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
  @property({ tooltip: '相机在lateUpdate更新' }) camUseLateUpdate: boolean = true;
  @property({ tooltip: '相机锁定玩家屏幕中心' }) camLockCenter: boolean = true;
  @property({ tooltip: '相机在物理后事件更新' }) camUseAfterPhysics: boolean = true;
  @property({ tooltip: '相机平滑使用物理固定步长' }) camUseFixedDt: boolean = true;
  @property({ tooltip: '道具等级：0无、1剪刀、2割草、3吸尘' }) toolLevel: number = 1;
  @property({ min: 0, tooltip: '收割动作退出维持时间（秒）' }) harvestHoldSec: number = 0.5;
  @property({ type: Node, tooltip: '剪刀道具节点（等级1）' }) toolScissors: Node | null = null;
  @property({ type: Node, tooltip: '割草机道具父节点（等级2）' }) toolMower: Node | null = null;
  @property({ type: Node, tooltip: '三级机器/吸尘器节点（等级3）' }) toolVacuum: Node | null = null;
  @property({ tooltip: '到采集范围内自动显示对应道具' }) autoToolVisibility: boolean = true;
  @property({ tooltip: '使用物理刚体速度驱动移动' }) physicsDrive: boolean = true;
  @property({ type: [CCInteger], tooltip: '各等级花堆容量' }) stackCapacityByTool: number[] = [0, 10, 15, 20];
  @property({ type: [CCInteger], tooltip: '各等级背包总容量' }) bagCapacityByTool: number[] = [5, 8, 12, 16];
  @property({ type: SpriteAtlas, tooltip: '引导箭头图集' }) guideAtlas: SpriteAtlas | null = null;
  @property({ tooltip: '箭头帧名' }) guideFrameName: string = 'arrow';
  @property({ type: [Node], tooltip: '引导目标点列表' }) guideTargets: Node[] = [];
  @property({ min: 0, tooltip: '靠近隐藏半径（XZ）' }) guideHideRadius: number = 120;
  @property({ min: 0, tooltip: '自动前进阈值半径（XZ）' }) guideAdvanceRadius: number = 60;
  @property({ tooltip: '引导在lateUpdate更新' }) guideUseLateUpdate: boolean = true;
  @property({ tooltip: '使用视图缩放换算UI坐标' }) guideUseViewScale: boolean = true;
  @property({ tooltip: '箭头屏幕坐标X偏移' }) guideScreenOffsetX: number = 0;
  @property({ tooltip: '箭头屏幕坐标Y偏移' }) guideScreenOffsetY: number = 120;
  @property({ min: 0, tooltip: '箭头世界高度Y偏移' }) guideWorldOffsetY: number = 200;
  @property({ min: 0.1, tooltip: '箭头缩放' }) guideScale: number = 1;
  @property({ tooltip: '靠近目标时自动前进' }) guideAutoAdvance: boolean = false;

  flowers = 0;
  breads = 0;
  coins = 0;
  private target: Vec3 | null = null;
  private camUpdated: boolean = false;
  private camFocusTimer: number = 0;
  private camFocusHold: number = 0;
  private camFocusTarget: Vec3 | null = null;

  private sa: SkeletalAnimation | null = null;
  private rb: RigidBody | null = null;
  private capsule: CapsuleCollider | null = null;
  private guideArrow: Node | null = null;
  private guideIndex: number = 0;
  onLoad() {
    const sa = this.node.getComponent(SkeletalAnimation) || this.node.getComponentInChildren(SkeletalAnimation);
    this.sa = sa || null;
    this.rb = this.node.getComponent(RigidBody) || this.node.getComponentInChildren(RigidBody);
    this.capsule = this.node.getComponent(CapsuleCollider) || this.node.getComponentInChildren(CapsuleCollider);
    if (this.rb) {
      this.rb.useGravity = false;
      this.rb.angularFactor = new Vec3(0, 0, 0);
      this.rb.linearFactor = this.useXZ ? new Vec3(1, 0, 1) : new Vec3(1, 1, 1);
      this.rb.angularDamping = 1;
      this.rb.linearDamping = 0.05;
      (this.rb as any).allowSleep = false;
    }
    if (this.capsule) {
      this.capsule.isTrigger = false;
    }
    if (!this.anim) {
      const a = this.node.getComponent(Animation) || this.node.getComponentInChildren(Animation);
      if (a) this.anim = a;
    }
    this.machine = new ActionStateMachine(this.sa, this.anim, this.moveDeadZone);
    if (this.clipMapJson) {
      try {
        const map = JSON.parse(this.clipMapJson);
        if (map && typeof map === 'object') this.machine.setClipMap(map);
      } catch {}
    }
    if (this.camUseAfterPhysics) director.on((director as any).EVENT_AFTER_PHYSICS, this.onAfterPhysics, this);
  }
  onEnable() {}
  onDisable() {}

  private handoffCooldown = 0;
  private harvestHold = 0;
  private machine: ActionStateMachine | null = null;
  private previewTimer = 0;
  private prevHarvestFull = false;

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
    const leadX = this.camLockCenter ? 0 : (stick.x * this.camLead);
    const leadZ = this.camLockCenter ? 0 : (-stick.y * this.camLead);
    let target = new Vec3(p.x + this.camOffset.x + leadX, p.y + this.camOffset.y, p.z + this.camOffset.z + leadZ);
    if ((this.camFocusTimer > 0 || this.camFocusHold > 0) && this.camFocusTarget) target = this.camFocusTarget.clone();
    const cur = camNode.worldPosition;
    const dx = target.x - cur.x;
    const dz = target.z - cur.z;
    const d = Math.hypot(dx, dz);
    const dtEff = (this.camUseAfterPhysics && this.camUseFixedDt) ? PhysicsSystem.instance.fixedTimeStep : dt;
    const a = 1 - Math.exp(-dtEff * this.camLag);
    const useSoft = !this.camLockCenter;
    const nx = useSoft && d <= this.camSoftRadius ? cur.x : cur.x + dx * a;
    const nz = useSoft && d <= this.camSoftRadius ? cur.z : cur.z + dz * a;
    const ny = cur.y + (target.y - cur.y) * a;
    camNode.setWorldPosition(nx, ny, nz);
  }

  /**
   * 玩家移动与动画更新。
   * 步骤：
   * 1) 更新交接冷却与摇杆向量。
   * 2) 同步堆叠中的面包数量到 `breads`（以视觉堆叠为准）。
   * 3) 小于死区 → 选择并播放 *_idle；否则计算移动、旋转并选择 *_run。
   * 4) 仅在剪辑变化且播放成功时切换，最后更新相机位置。
   */
  update(dt: number) {
    this.camUpdated = false;
    if (this.handoffCooldown > 0) this.handoffCooldown = Math.max(0, this.handoffCooldown - dt);
    if (this.previewTimer > 0) this.previewTimer = Math.max(0, this.previewTimer - dt);
    const cur = this.node.worldPosition;
    const stick = this.joystick?.dir ?? new Vec2(0, 0);
    const len = stick.length();
    if (this.breadStack) {
      this.breads = this.breadStack.count();
    }
    const inHarvestRaw = this.isInHarvestArea();
    if (inHarvestRaw)
       this.harvestHold = this.harvestHoldSec;
    else 
      this.harvestHold = Math.max(0, this.harvestHold - dt);
    const inHarvest = inHarvestRaw || this.harvestHold > 0;
    this.updateToolVisibility(inHarvest);
    if (len < this.moveDeadZone) {
      if (this.physicsDrive && this.rb) { this.rb.setLinearVelocity(new Vec3(0, 0, 0)); (this.rb as any).wakeUp?.(); }
      const next = this.machine?.decide(0, this.breads, this.toolLevel, inHarvest) ?? 'idle';
      this.machine?.play(next);
      return;
    }
    const v = this.flowers + this.breads > 0 ? this.speed * 0.8 : this.speed;
    if (this.useXZ) {
      const yaw = Math.atan2(stick.x, -stick.y) * 180 / Math.PI;
      const q = new Quat();
      Quat.fromEuler(q, 0, yaw, 0);
      this.node.setWorldRotation(q);
      if (this.physicsDrive && this.rb) {
        this.rb.setLinearVelocity(new Vec3(stick.x * v, 0, -stick.y * v));
        (this.rb as any).wakeUp?.();
      } else {
        const nx = cur.x + stick.x * v * dt;
        const nz = cur.z - stick.y * v * dt;
        this.node.setWorldPosition(nx, cur.y, nz);
      }
    } else {
      if (this.physicsDrive && this.rb) {
        this.rb.setLinearVelocity(new Vec3(stick.x * v, stick.y * v, 0));
        (this.rb as any).wakeUp?.();
      } else {
        const nx = cur.x + stick.x * v * dt;
        const ny = cur.y + stick.y * v * dt;
        this.node.setWorldPosition(nx, ny, cur.z);
      }
    }
    const next = this.machine?.decide(len, this.breads, this.toolLevel, inHarvest) ?? 'run';
    this.machine?.play(next);
    if (!this.camUseLateUpdate && !this.camUseAfterPhysics) { this.updateCamera(dt, stick); this.camUpdated = true; }

    const stackFull = !!this.stack && this.stack.count() >= this.stack.capacity;
    const nowHF = inHarvest && stackFull;
    if (nowHF) {
      const s = this.stack;
      if (s && !s.isMaxPlaying()) s.pingMaxIndicator(1.0);
    } else {
      this.stack?.setMaxLoopActive(false);
    }
    this.prevHarvestFull = nowHF;
    if (this.camFocusTimer > 0) this.camFocusTimer = Math.max(0, this.camFocusTimer - dt);
    else if (this.camFocusHold > 0) this.camFocusHold = Math.max(0, this.camFocusHold - dt);
    else this.camFocusTarget = null;
  }

  lateUpdate(dt: number) {
    const stick = this.joystick?.dir ?? new Vec2(0, 0);
    const need = this.camUseLateUpdate || (this.camUseAfterPhysics && !this.camUpdated);
    if (need) { this.updateCamera(dt, stick); this.camUpdated = true; }
    if (this.guideUseLateUpdate) this.updateGuide(dt);
  }

  private onAfterPhysics() {
    if (!this.camUseAfterPhysics) return;
    const dt = director.getDeltaTime();
    const stick = this.joystick?.dir ?? new Vec2(0, 0);
    this.updateCamera(dt, stick);
    this.camUpdated = true;
  }

  public startCameraFocus(target: Vec3, moveSec: number = 1, holdSec: number = 0) {
    this.camFocusTarget = target.clone();
    this.camFocusTimer = Math.max(0.001, moveSec);
    this.camFocusHold = Math.max(0, holdSec);
  }
  public stopCameraFocus() {
    this.camFocusTarget = null;
    this.camFocusTimer = 0;
    this.camFocusHold = 0;
  }


  private isInHarvestArea(): boolean {
    /**
     * 采集范围判定：
     * - 遍历场景中启用且激活的 `ResourceNode` 与 `CollectItem`；
     * - 用玩家与目标在 XZ 平面的距离，与各自半径比较；
     * - 任一命中即视为在采集范围，用于触发工具动作。
     */
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

  private ensureGuideArrow() {
    if (this.guideArrow) return;
    const cvsNode = this.getMainCanvasNode();
    if (!cvsNode) return;
    const root = new Node('GuideArrow');
    root.parent = cvsNode;
    root.setScale(this.guideScale, this.guideScale, 1);
    const sp = root.addComponent(Sprite);
    let f: SpriteFrame | null = null;
    if (this.guideAtlas && this.guideFrameName) {
      try { f = this.guideAtlas.getSpriteFrame(this.guideFrameName) || null; } catch {}
    }
    if (f) sp.spriteFrame = f;
    else {
      const fallback = new Color(255, 255, 255, 255);
      sp.color = fallback;
    }
    this.guideArrow = root;
  }

  private updateGuide(dt: number) {
    const tgt = this.guideTargets && this.guideTargets.length > 0 && this.guideIndex < this.guideTargets.length ? this.guideTargets[this.guideIndex] : null;
    if (!tgt || !tgt.active) {
      if (this.guideArrow) this.guideArrow.active = false;
      return;
    }
    const cam = this.worldCamera;
    if (!cam) return;
    this.ensureGuideArrow();
    const arrow = this.guideArrow;
    if (!arrow) return;
    const ui = arrow.parent?.getComponent(UITransform) || null;
    if (!ui) return;
    const p = this.node.worldPosition.clone();
    p.y += this.guideWorldOffsetY;
    const a = tgt.worldPosition.clone();
    const spP = cam.worldToScreen(p);
    const spA = cam.worldToScreen(a);
    if (this.guideUseViewScale) {
      const vs = view.getVisibleSize();
      const x = spP.x / view.getScaleX() + this.guideScreenOffsetX - vs.width * 0.5;
      const y = spP.y / view.getScaleY() + this.guideScreenOffsetY - vs.height * 0.5;
      arrow.setPosition(x, y, 0);
    } else {
      const pos = ui.convertToNodeSpaceAR(new Vec3(spP.x + this.guideScreenOffsetX, spP.y + this.guideScreenOffsetY, 0));
      arrow.setPosition(pos.x, pos.y, 0);
    }
    const dx = spA.x - spP.x;
    const dy = spA.y - spP.y;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    (arrow as any).angle = ang;
    const dXZ = Math.hypot(a.x - this.node.worldPosition.x, a.z - this.node.worldPosition.z);
    let alpha = 1;
    if (this.guideHideRadius > this.guideAdvanceRadius) {
      const t = (dXZ - this.guideAdvanceRadius) / (this.guideHideRadius - this.guideAdvanceRadius);
      alpha = Math.max(0, Math.min(1, t));
    } else {
      alpha = dXZ > this.guideHideRadius ? 1 : 0;
    }
    const sp = arrow.getComponent(Sprite);
    if (sp) {
      const c = sp.color;
      sp.color = new Color(c.r, c.g, c.b, Math.floor(255 * alpha));
    }
    arrow.active = alpha > 0.01;
    if (this.guideAutoAdvance && dXZ <= this.guideAdvanceRadius) this.nextGuide();
  }

  public setGuideTargets(list: Node[]) {
    this.guideTargets = list || [];
    this.guideIndex = 0;
  }
  public setGuideIndex(i: number) {
    this.guideIndex = Math.max(0, Math.min(this.guideTargets.length - 1, i | 0));
  }
  public nextGuide() {
    this.setGuideIndex(this.guideIndex + 1);
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
    if (ci) { 
      ci.enabled = false; ci.destroy();
     }
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
    if (ci) { 
      ci.enabled = false; ci.destroy();
     }
    if (this.coinStack) {
      const ok = this.coinStack.tryAddItem(item);
      if (ok) this.coins += 1;
      if (ok) Economy.add(1);
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
    if (d > 0) Economy.spend(d);
    return d;
  }

  private updateToolVisibility(inHarvest: boolean) {
    if (!this.autoToolVisibility) return;
    const show = (this.previewTimer > 0) || (inHarvest && this.toolLevel > 0);
    const t1 = this.toolScissors;
    const t2 = this.toolMower;
    const t3 = this.toolVacuum;
    if (t1) 
      t1.active = false;
    if (t2) 
      t2.active = false;
    if (t3) 
      t3.active = false;
    if (!show) return;
    if (this.toolLevel === 1) 
      { 
        if (t1) t1.active = true; 
      }
    else if (this.toolLevel === 2) 
      { 
        if (t2) t2.active = true; 
      }
    else if (this.toolLevel === 3) 
      { 
        if (t3) t3.active = true; 
      }
  }

  public setToolLevel(level: number) {
    this.toolLevel = Math.max(0, Math.min(3, level | 0));
    this.previewTimer = 1.2;
    const bag = this.bagCapacityByTool[this.toolLevel] ?? this.capacity;
    this.capacity = bag;
    if (this.stack) {
      const cap = this.stackCapacityByTool[this.toolLevel] ?? this.stack.capacity;
      this.stack.setCapacity(cap);
      this.stack.worldCameraNode = this.worldCamera ? this.worldCamera.node : this.stack.worldCameraNode;
      this.stack.uiCanvas = this.getMainCanvasNode();
    }
  }

  private getMainCanvasNode(): Node | null {
    const s = this.node.scene;
    if (!s) return null;
    const cvs = s.getComponentsInChildren((Canvas as any));
    for (const cv of cvs as any[]) {
      const n = (cv as any).node as Node;
      const isUiCameraChild = n.getChildByName?.('UI_Camera') != null; // 兼容你的层级命名
      if (isUiCameraChild || n.parent?.name === 'Main' || n.parent == null) return n;
    }
    return cvs.length > 0 ? (cvs[0] as any).node : null;
  }
}
  
 
  