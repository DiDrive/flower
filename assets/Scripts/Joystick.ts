import { _decorator, Component, Node, Vec2, Vec3, UITransform, EventTouch, UIOpacity, tween, Canvas, UIRenderer } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Joystick 虚拟摇杆组件。
 * - 处理触摸输入并输出归一化方向向量 `dir`（范围 -1~1）。
 * - 支持半径限制与死区设置，带可视化的摇杆球 `knob`。
 * 使用：将该组件挂在 UI 节点，设置 `knob` 子节点。
 */
@ccclass('Joystick')
export class Joystick extends Component {
  @property({ type: Node, tooltip: '摇杆球节点' }) knob: Node | null = null;
  @property({ min: 10, tooltip: '摇杆半径（像素）' }) radius: number = 80;
  @property({ min: 0, tooltip: '死区，方向向量长度小于该值视为0（0~1）' }) deadZone: number = 0.1;
  @property({ tooltip: '浮动摇杆：触摸位置出现' }) floating: boolean = true;
  @property({ tooltip: '松手后自动隐藏' }) autoHide: boolean = true;
  @property({ type: Node, tooltip: '触摸根节点（例如Canvas），空则为本节点' }) touchRoot: Node | null = null;
  @property({ min: 0, tooltip: '隐藏时缩放' }) hideScale: number = 0.001;
  @property({ min: 0, tooltip: '显示时缩放' }) showScale: number = 1;
  @property({ tooltip: '启用闲置闪烁' }) enableIdleBlink: boolean = true;
  @property({ min: 0, tooltip: '闲置触发时长（秒）' }) idleDelaySec: number = 3;
  @property({ min: 0.1, tooltip: '闪烁周期（秒）' }) blinkIntervalSec: number = 0.6;
  @property({ min: 0, tooltip: '闪烁最低不透明度（0~255）' }) blinkOpacityLow: number = 80;
  @property({ type: Node, tooltip: '闲置时显示的图片节点' }) idleHintNode: Node | null = null;
  @property({ min: 0, tooltip: '缩放闪烁最低比例（0~1）' }) blinkScaleLow: number = 0.7;
  @property({ tooltip: '无不透明度支持时使用缩放闪烁' }) blinkUseScaleFallback: boolean = true;
  @property({ tooltip: '闲置时启用小操作杆环绕' }) idleKnobOrbitEnable: boolean = true;
  @property({ min: 0, tooltip: '环绕半径比例（相对摇杆半径）' }) idleKnobOrbitRatio: number = 0.5;
  @property({ min: 0, tooltip: '环绕角速度（度/秒）' }) idleKnobOrbitSpeedDeg: number = 90;
  @property({ tooltip: '开局立即进入闲置闪烁与提示' }) idleStartImmediate: boolean = true;
  @property({ tooltip: '自动寻找一个UI子节点作为提示图' }) idleHintAutoFind: boolean = true;

  dir: Vec2 = new Vec2(0, 0);
  private dragging = false;
  private evtNode: Node | null = null;
  private idleTimer = 0;
  private idleActive = false;
  private uiOpacity: UIOpacity | null = null;
  private blinkTween: any = null;
  private blinkTime = 0;
  private hasUIChildren = false;
  private idleKnobAngle = 0;

  /** 注册触摸事件 */
  onEnable() {
    if (!this.touchRoot) {
      const cv = this.node.scene?.getComponentInChildren(Canvas);
      this.evtNode = (cv && cv.node) ? cv.node : this.node;
    } else {
      this.evtNode = this.touchRoot;
    }
    const n = this.evtNode;
    if (!n) return;
    n.on(Node.EventType.TOUCH_START, this.onStart, this);
    n.on(Node.EventType.TOUCH_MOVE, this.onMove, this);
    n.on(Node.EventType.TOUCH_END, this.onEnd, this);
    n.on(Node.EventType.TOUCH_CANCEL, this.onEnd, this);
  }

  /** 取消触摸事件 */
  onDisable() {
    const n = this.evtNode || this.node;
    n.off(Node.EventType.TOUCH_START, this.onStart, this);
    n.off(Node.EventType.TOUCH_MOVE, this.onMove, this);
    n.off(Node.EventType.TOUCH_END, this.onEnd, this);
    n.off(Node.EventType.TOUCH_CANCEL, this.onEnd, this);
    this.endIdle();
  }

  start() {
    this.uiOpacity = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
    if (!this.idleHintNode && this.idleHintAutoFind) {
      for (const c of this.node.children) {
        if (this.knob && c === this.knob) continue;
        const r = c.getComponent(UIRenderer) || c.getComponentInChildren(UIRenderer);
        if (r) { this.idleHintNode = c; break; }
      }
    }
    if (this.idleHintNode) this.idleHintNode.active = false;
    const uiChildren = this.node.getComponentsInChildren(UIRenderer);
    this.hasUIChildren = uiChildren && uiChildren.length > 0;
    if (this.enableIdleBlink && this.idleStartImmediate) this.beginIdle();
  }

  update(dt: number) {
    if (!this.enableIdleBlink) return;
    if (this.dragging) { this.idleTimer = 0; return; }
    this.idleTimer += dt;
    if (!this.idleActive && this.idleTimer >= Math.max(0, this.idleDelaySec)) this.beginIdle();
    if (this.idleActive) {
      this.blinkTime += dt;
      const period = Math.max(0.1, this.blinkIntervalSec);
      const t = (this.blinkTime % period) / period;
      const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
      const lowOp = Math.max(0, Math.min(255, this.blinkOpacityLow));
      const op = Math.round(lowOp + wave * (255 - lowOp));
      const lowScale = Math.max(0, Math.min(1, this.blinkScaleLow)) * this.showScale;
      const sc = lowScale + wave * (this.showScale - lowScale);
      if (this.uiOpacity && this.hasUIChildren) this.uiOpacity.opacity = op;
      else if (this.blinkUseScaleFallback) this.node.setScale(sc, sc, sc);
      if (this.idleKnobOrbitEnable && this.knob) {
        const r = Math.max(0, Math.min(1, this.idleKnobOrbitRatio)) * this.radius;
        this.idleKnobAngle += this.idleKnobOrbitSpeedDeg * dt;
        const rad = this.idleKnobAngle * Math.PI / 180;
        const x = Math.cos(rad) * r;
        const y = Math.sin(rad) * r;
        this.knob.setPosition(x, y, this.knob.position.z);
      }
    }
  }

  /** 开始拖拽并更新一次方向 */
  onStart(e: EventTouch) {
    this.dragging = true;
    this.onUserActivity();
    if (this.autoHide) this.node.setScale(this.showScale, this.showScale, this.showScale);
    if (this.floating) {
      const parent = this.node.parent?.getComponent(UITransform);
      const p = e.getUILocation();
      const local = parent ? parent.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0)) : new Vec3(p.x, p.y, 0);
      this.node.setPosition(local.x, local.y, this.node.position.z);
      if (this.knob) this.knob.setPosition(new Vec3(0, 0, this.knob.position.z));
    }
    this.updateByTouch(e);
  }

  /** 移动过程中持续更新方向 */
  onMove(e: EventTouch) {
    if (!this.dragging) return;
    this.onUserActivity();
    this.updateByTouch(e);
  }

  /** 结束拖拽并归位摇杆球 */
  onEnd() {
    this.dragging = false;
    this.dir.set(0, 0);
    if (this.knob) this.knob.setPosition(new Vec3(0, 0, this.knob.position.z));
    if (this.autoHide) this.node.setScale(this.hideScale, this.hideScale, this.hideScale);
    this.idleTimer = 0;
  }

  /** 将屏幕触点转换到本地坐标并计算方向向量 */
  private updateByTouch(e: EventTouch) {
    const ui = this.node.getComponent(UITransform);
    if (!ui) return;
    const p = e.getUILocation();
    const local = ui.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    const v = new Vec2(local.x, local.y);
    const len = v.length();
    if (len > this.radius) v.multiplyScalar(this.radius / len);
    const nx = v.x / this.radius;
    const ny = v.y / this.radius;
    const n = new Vec2(nx, ny);
    const nlen = n.length();
    if (nlen < this.deadZone) this.dir.set(0, 0);
    else this.dir = n.normalize();
    if (this.knob) this.knob.setPosition(new Vec3(v.x, v.y, this.knob.position.z));
  }

  private onUserActivity() {
    this.idleTimer = 0;
    if (this.idleActive) this.endIdle();
    if (this.idleHintNode) this.idleHintNode.active = false;
    if (this.uiOpacity) this.uiOpacity.opacity = 255;
  }

  private beginIdle() {
    this.idleActive = true;
    if (this.idleHintNode) this.idleHintNode.active = true;
    this.node.setScale(this.showScale, this.showScale, this.showScale);
    this.blinkTime = 0;
    this.idleKnobAngle = 0;
  }

  private endIdle() {
    this.idleActive = false;
    try { if (this.blinkTween) this.blinkTween.stop(); } catch {}
    this.blinkTween = null;
    if (this.uiOpacity) this.uiOpacity.opacity = 255;
    if (this.idleHintNode) this.idleHintNode.active = false;
    this.node.setScale(this.showScale, this.showScale, this.showScale);
    this.blinkTime = 0;
    if (this.knob) this.knob.setPosition(0, 0, this.knob.position.z);
  }
}