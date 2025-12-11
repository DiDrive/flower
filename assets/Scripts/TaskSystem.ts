import { _decorator, Component, Label } from 'cc';
import { HUD } from './HUD';
import { on, Events } from '../PlayableFramework/PlayableEvents';
const { ccclass, property } = _decorator;

/**
 * TaskSystem 引导任务系统。
 * - 管理并展示当前的引导目标文本。
 * - 接收框架 `Start` 事件进行初始化，并通过 `next()` 推进步骤。
 * 使用：挂在场景中的管理节点，根据美术需求更新文案。
 */
@ccclass('TaskSystem')
export class TaskSystem extends Component {
  @property(Label) label: Label | null = null;
  private step = 0;

  onLoad() {
    on(Events.Start, this.onStart, this);
  }

  /** 初始化任务引导 */
  onStart() {
    this.step = 0;
    this.updateLabel('采集花朵');
  }

  /** 推进到下一步并更新 HUD 的目标提示 */
  next() {
    this.step += 1;
    if (this.step === 1) this.updateLabel('运送到工厂');
    else if (this.step === 2) this.updateLabel('制作面包');
    else if (this.step === 3) this.updateLabel('运送到市场售卖');
    else if (this.step === 4) this.updateLabel('到升级台升级');
    else if (this.step === 5) this.updateLabel('扩大版图并完成');
  }

  /** 更新场景内标签和 HUD 的目标文本 */
  updateLabel(t: string) {
    if (this.label) this.label.string = t;
    const hud = this.node.scene?.getComponentInChildren(HUD);
    if (hud) hud.setObjective(t);
  }
}