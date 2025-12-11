/**
 * CTA 按钮：点击后触发商店跳转或父页面消息，并结束 playable。
 */
import { _decorator, Component, Node, Label } from 'cc';
import { PlayableBridge } from './PlayableBridge';
const { ccclass, property } = _decorator;

@ccclass('CTAButton')
export class CTAButton extends Component {
  @property({ type: Label, tooltip: '按钮文字的标签（可选）' }) label: Label | null = null;

  onEnable() {
    this.node.on(Node.EventType.TOUCH_END, this.onClick, this);
  }

  onDisable() {
    this.node.off(Node.EventType.TOUCH_END, this.onClick, this);
  }

  onClick() {
    PlayableBridge.openStore();
  }
}