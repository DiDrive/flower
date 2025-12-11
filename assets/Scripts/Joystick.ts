import { _decorator, Component, Node, Vec2, Vec3, UITransform, EventTouch } from 'cc';
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

  dir: Vec2 = new Vec2(0, 0);
  private dragging = false;

  /** 注册触摸事件 */
  onEnable() {
    this.node.on(Node.EventType.TOUCH_START, this.onStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.onMove, this);
    this.node.on(Node.EventType.TOUCH_END, this.onEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.onEnd, this);
  }

  /** 取消触摸事件 */
  onDisable() {
    this.node.off(Node.EventType.TOUCH_START, this.onStart, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this.onMove, this);
    this.node.off(Node.EventType.TOUCH_END, this.onEnd, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this.onEnd, this);
  }

  /** 开始拖拽并更新一次方向 */
  onStart(e: EventTouch) {
    this.dragging = true;
    this.updateByTouch(e);
  }

  /** 移动过程中持续更新方向 */
  onMove(e: EventTouch) {
    if (!this.dragging) return;
    this.updateByTouch(e);
  }

  /** 结束拖拽并归位摇杆球 */
  onEnd() {
    this.dragging = false;
    this.dir.set(0, 0);
    if (this.knob) this.knob.setPosition(new Vec3(0, 0, this.knob.position.z));
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
}