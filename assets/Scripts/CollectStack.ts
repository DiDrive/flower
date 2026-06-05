import { _decorator, Component, Node, Vec3, tween, Mat4, Camera, UITransform, Canvas, view, Quat } from 'cc';
import type { TweenEasing } from 'cc';
const { ccclass, property } = _decorator;

/**
 * CollectStack 物品堆叠组件。
 * - 将传入的物品节点按照列/行在人物前方整齐摆放。
 * - 通过 `columns/colSpacing/rowSpacing/offsetZ/baseY/capacity` 控制堆叠形态与容量。
 * 使用：挂在玩家的某个 Anchor 子节点（花朵/面包/金币各自一个）。
 */
@ccclass('CollectStack')
export class CollectStack extends Component {
  @property({ type: Node, tooltip: '堆叠的父节点（人物前方）' }) anchor: Node | null = null;
  @property({ min: 1, tooltip: '堆叠的列数' }) columns: number = 1;
  @property({ min: 0, tooltip: '列间距（X方向）' }) colSpacing: number = 20;
  @property({ min: 0, tooltip: '行间距（Y方向）' }) rowSpacing: number = 20;
  @property({ min: 0, tooltip: '前方偏移量（Z负方向）' }) offsetZ: number = 40;
  @property({ min: 0, tooltip: '起始高度（Y）' }) baseY: number = 0;
  @property({ min: 1, tooltip: '堆叠容量上限' }) capacity: number = 10;
  @property({ type: Node, tooltip: '满容量提示节点' }) maxIndicator: Node | null = null;
  @property({ tooltip: '满容量提示跟随栈顶' }) maxIndicatorFollowTop: boolean = true;
  @property({ min: 0, tooltip: '满容量提示顶部偏移Y' }) maxIndicatorOffsetY: number = 20;
  @property({ min: 0, tooltip: '满容量提示水平偏移X' }) maxIndicatorOffsetX: number = 0;
  @property({ type: Node, tooltip: 'UI画布根节点' }) uiCanvas: Node | null = null;
  @property({ type: Node, tooltip: '世界摄像机节点' }) worldCameraNode: Node | null = null;
  @property({ tooltip: '使用视图缩放换算UI坐标' }) indicatorUseViewScale: boolean = true;
  @property({ min: 0, tooltip: 'MAX 出现/消失时向上偏移量Y' }) maxRiseY: number = 20;
  @property({ min: 0.05, tooltip: 'MAX 出现时长' }) maxAppearSec: number = 0.4;
  @property({ min: 0, tooltip: 'MAX 停顿时长' }) maxHoldSec: number = 0.2;
  @property({ min: 0.05, tooltip: 'MAX 消失时长' }) maxVanishSec: number = 0.4;
  @property({ min: 0, tooltip: 'MAX 循环间隔（循环模式）' }) maxCyclePauseSec: number = 0.2;
  @property({ min: 0, tooltip: 'MAX 提示冷却时长（秒）' }) maxPingCooldownSec: number = 0.8;
  @property({ min: 0, tooltip: 'MAX 出现阶段放大倍数' }) maxOvershoot: number = 1.08;
  @property({ min: 0, tooltip: 'MAX 旋转抖动幅度（度）' }) maxShakeDeg: number = 6;
  @property({ min: 0.1, tooltip: 'MAX 旋转抖动频率（Hz）' }) maxShakeFreq: number = 8;
  @property({ min: 0.05, tooltip: 'MAX 抖动持续时长（秒）' }) maxShakeDurationSec: number = 0.18;
  @property({ min: 0, tooltip: 'MAX 抖动幅度衰减系数' }) maxShakeDamp: number = 0.5;
  @property({ min: 0, tooltip: '物品缩放倍数' }) itemScale: number = 1;
  @property({ min: 0.01, tooltip: '物品入栈动画时长（秒）' }) placeSec: number = 0.2;
  @property({ tooltip: '物品入栈动画缓动' }) placeEasing: TweenEasing = 'sineOut';
  @property({ min: 0.01, tooltip: '物品飞向世界目标时长（秒）' }) popToWorldSec: number = 0.25;
  @property({ tooltip: '物品飞向世界目标缓动' }) popToWorldEasing: TweenEasing = 'sineInOut';

  private items: Node[] = [];
  private maxTween: any = null;
  private _maxHideCb: Function | null = null;
  private maxLoopActive: boolean = false;
  private maxPlaying: boolean = false;
  private maxAnimY: number = 0;
  private maxScale: number = 1;
  private maxPingCooldown: number = 0;
  private maxOwnerId: string = '';
  private maxShakeTimer: number = 0;
  private maxShakeAngle: number = 0;
  private maxShakeActive: boolean = false;

  /** 当前堆叠中的物品数量 */
  count() {
    return this.items.length;
  }

  setCapacity(n: number) {
    const v = Math.max(1, n | 0);
    this.capacity = v;
    if (this.items.length >= this.capacity) {
      this.pingMaxIndicator(0.8);
    } else {
      this.hideMaxIndicator();
    }
  }

  private showMaxIndicator() {
    const n = this.maxIndicator;
    if (!n) return;
    const oid = (n as any).__csOwnerId ?? '';
    if (oid && oid !== this.node.uuid) return;
    if (this.maxTween) { try { this.maxTween.stop(); } catch {} this.maxTween = null; }
    n.active = true;
    this.maxScale = 1;
    this.maxTween = null;
    (n as any).__csOwnerId = this.node.uuid;
    this.maxOwnerId = this.node.uuid;
    this.maxShakeTimer = 0;
  }

  private hideMaxIndicator() {
    const n = this.maxIndicator;
    if (!n) return;
    const oid = (n as any).__csOwnerId ?? '';
    if (oid && oid !== this.node.uuid) return;
    if (this.maxTween) { try { this.maxTween.stop(); } catch {} this.maxTween = null; }
    n.active = false;
    if (this._maxHideCb) { try { this.unschedule(this._maxHideCb as any); } catch {} this._maxHideCb = null; }
    this.maxAnimY = 0;
    this.maxScale = 1;
    (n as any).__csOwnerId = '';
    this.maxOwnerId = '';
    this.maxShakeTimer = 0;
    n.setRotation(new Quat());
    this.maxShakeAngle = 0;
  }

  private updateMaxIndicatorPosition() {
    const n = this.maxIndicator;
    if (!n) return;
    const oid = (n as any).__csOwnerId ?? '';
    if (oid && oid !== this.node.uuid) return;
    const count = Math.max(0, this.items.length);
    const rows = Math.max(1, Math.ceil(count / this.columns));
    const yTop = (this.maxIndicatorFollowTop ? (this.baseY + rows * this.rowSpacing) : this.baseY) + this.maxIndicatorOffsetY + this.maxAnimY;
    const z = -this.offsetZ;
    const anchor = this.anchor ?? this.node;
    if (!anchor) return;
    const lp = new Vec3(this.maxIndicatorOffsetX, yTop, z);
    const wp = new Vec3();
    Vec3.transformMat4(wp, lp, anchor.worldMatrix);
    const ui = this.uiCanvas ? this.uiCanvas.getComponent(UITransform) : null;
    const cam = this.getWorldCamera();
    if (ui && cam) {
      const sp = cam.worldToScreen(wp);
      if (this.indicatorUseViewScale) {
        const vs = view.getVisibleSize();
        const x = sp.x / view.getScaleX() - vs.width * 0.5;
        const y = sp.y / view.getScaleY() - vs.height * 0.5;
        n.setPosition(x, y, 0);
      } else {
        const pos = ui.convertToNodeSpaceAR(new Vec3(sp.x, sp.y, 0));
        n.setPosition(pos.x, pos.y, 0);
      }
    } else {
      n.setWorldPosition(wp);
    }
  }

  pingMaxIndicator(lifeSec: number = 1.0) {
    const n = this.maxIndicator;
    if (!n) return;
    if (this.maxPingCooldown > 0) return;
    const oid = (n as any).__csOwnerId ?? '';
    if (oid && oid !== this.node.uuid) return;
    this.updateMaxIndicatorPosition();
    if (this.maxLoopActive) return;
    if (this.maxPlaying) return;
    this.showMaxIndicator();
    if (this.maxTween) { try { this.maxTween.stop(); } catch {} }
    this.maxAnimY = 0;
    this.maxScale = 0;
    this.maxPlaying = true;
    const tw: any = (tween as any)(this as any);
    this.maxTween = tw
      .call(() => { this.shakeOnce(); })
      .to(this.maxAppearSec, { maxAnimY: this.maxRiseY, maxScale: this.maxOvershoot } as any, { easing: 'sineOut' })
      .delay(this.maxHoldSec)
      .to(this.maxVanishSec, { maxAnimY: this.maxRiseY * 2, maxScale: 0 } as any, { easing: 'sineIn' })
      .call(() => { this.hideMaxIndicator(); this.maxAnimY = 0; this.maxScale = 1; this.maxPlaying = false; })
      .start();
    this.maxPingCooldown = Math.max(0, this.maxPingCooldownSec);
    this.maxShakeTimer = 0;
  }

  setMaxLoopActive(active: boolean) {
    if (active === this.maxLoopActive) return;
    this.maxLoopActive = active;
    if (active) this.startMaxLoop(); else this.stopMaxLoop();
  }

  private startMaxLoop() {
    const n = this.maxIndicator;
    if (!n) return;
    const oid = (n as any).__csOwnerId ?? '';
    if (oid && oid !== this.node.uuid) return;
    this.updateMaxIndicatorPosition();
    this.showMaxIndicator();
    if (this.maxTween) { try { this.maxTween.stop(); } catch {} }
    this.maxAnimY = 0;
    this.maxScale = 0;
    this.maxPlaying = true;
    this.maxShakeTimer = 0;
    const twf: any = (tween as any)(this as any);
    const seg: any = (tween as any)(this as any)
      .call(() => { this.maxShakeTimer = 0; })
      .to(this.maxAppearSec, { maxAnimY: this.maxRiseY, maxScale: this.maxOvershoot } as any, { easing: 'sineOut' })
      .delay(this.maxHoldSec)
      .to(this.maxVanishSec, { maxAnimY: this.maxRiseY * 2, maxScale: 0 } as any, { easing: 'sineIn' })
      .delay(this.maxCyclePauseSec)
      .call(() => { this.maxAnimY = 0; this.maxScale = 0; });
    this.maxTween = twf.repeatForever(seg).start();
  }

  private stopMaxLoop() {
    const n = this.maxIndicator;
    if (!n) return;
    const oid = (n as any).__csOwnerId ?? '';
    if (oid && oid !== this.node.uuid) return;
    if (this.maxTween) { try { this.maxTween.stop(); } catch {} this.maxTween = null; }
    n.setScale(1, 1, 1);
    this.hideMaxIndicator();
    this.maxPlaying = false;
  }

  isMaxPlaying() { return this.maxPlaying; }

  /**
   * 尝试加入一个物品到堆叠。
   * 返回 true 表示成功（并将物品位置缓动到栈位）。
   */
  tryAddItem(item: Node) {
    const parent = this.anchor ?? this.node;
    if (!parent) return false;
    if (this.items.length >= this.capacity) { this.updateMaxIndicatorPosition(); this.pingMaxIndicator(1.0); return false; }
    const idx = this.items.length;
    const col = idx % this.columns;
    const row = Math.floor(idx / this.columns);
    const colSp = this.colSpacing > 0 ? this.colSpacing : 20;
    const rowSp = this.rowSpacing > 0 ? this.rowSpacing : 20;
    const x = (col - (this.columns - 1) * 0.5) * colSp;
    const y = this.baseY + row * rowSp;
    const z = -this.offsetZ;
    const startWorld = item.worldPosition.clone();
    item.parent = parent;
    item.setWorldPosition(startWorld);
    if (this.itemScale > 0) item.setScale(this.itemScale, this.itemScale, this.itemScale);
    tween(item).to(this.placeSec, { position: new Vec3(x, y, z) }, { easing: this.placeEasing }).start();
    this.items.push(item);
    this.updateMaxIndicatorPosition();
    if (this.items.length >= this.capacity) this.pingMaxIndicator(1.0); else this.hideMaxIndicator();
    return true;
  }

  popTopRaw(): Node | null {
    const it = this.items.pop();
    if (!it) return null;
    this.updateMaxIndicatorPosition();
    if (this.items.length < this.capacity) this.hideMaxIndicator();
    return it;
  }

  /**
   * 从顶部移除 n 个物品并销毁其节点，返回实际移除数量。
   */
  removeTop(n: number) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const it = this.items.pop();
      if (!it) break;
      moved += 1;
      it.destroy();
    }
    this.updateMaxIndicatorPosition();
    if (this.items.length < this.capacity) this.hideMaxIndicator();
    return moved;
  }

  /**
   * 将顶部一个物品以动画飞向目标世界位置并销毁。
   * 返回 true 表示存在物品并已触发动画。
   */
  popTopToWorld(parent: Node, targetWorld: Vec3, duration: number = 0) {
    const it = this.items.pop();
    if (!it) return false;
    const start = it.worldPosition.clone();
    it.parent = parent;
    it.setWorldPosition(start);
    const inv = new Mat4();
    Mat4.invert(inv, parent.worldMatrix);
    const lp = new Vec3();
    Vec3.transformMat4(lp, targetWorld, inv);
    const dur = duration && duration > 0 ? duration : this.popToWorldSec;
    tween(it).to(dur, { position: lp }, { easing: this.popToWorldEasing }).call(() => { it.destroy(); }).start();
    this.updateMaxIndicatorPosition();
    if (this.items.length < this.capacity) this.hideMaxIndicator();
    return true;
  }

  private getWorldCamera(): Camera | null {
    if (this.worldCameraNode) {
      const c = this.worldCameraNode.getComponent(Camera);
      if (c) return c;
    }
    const s = this.node.scene;
    if (!s) return null;
    const cams = s.getComponentsInChildren(Camera);
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

  update(dt: number) {
    const n = this.maxIndicator;
    if (!n) return;
    if (!n.active && !this.maxPlaying && !this.maxLoopActive) return;
    const oid = (n as any).__csOwnerId ?? '';
    if (oid && oid !== this.node.uuid) return;
    this.updateMaxIndicatorPosition();
    n.setScale(this.maxScale, this.maxScale, 1);
    if (!this.maxShakeActive) {
      const q = new Quat();
      Quat.fromEuler(q, 0, 0, 0);
      n.setRotation(q);
    }
    if (this.maxPingCooldown > 0) this.maxPingCooldown = Math.max(0, this.maxPingCooldown - dt);
  }

  private shakeOnce() {
    const n = this.maxIndicator;
    if (!n) return;
    const oid = (n as any).__csOwnerId ?? '';
    if (oid && oid !== this.node.uuid) return;
    const mk = (z: number) => { const q = new Quat(); Quat.fromEuler(q, 0, 0, z); return q; };
    const d1 = Math.max(0.04, 0.08);
    const d2 = Math.max(0.04, 0.12);
    const d3 = Math.max(0.04, 0.08);
    this.maxShakeActive = true;
    (tween as any)(n)
      .to(d1, { rotation: mk(this.maxShakeDeg) })
      .to(d2, { rotation: mk(-this.maxShakeDeg * 0.5) })
      .to(d3, { rotation: mk(0) })
      .call(() => { this.maxShakeActive = false; })
      .start();
  }

  
}