import { _decorator, Component } from 'cc';
import { on, Events } from '../PlayableFramework/PlayableEvents';
const { ccclass } = _decorator;

/**
 * GameController 游戏流程控制器。
 * - 订阅 Playable 框架事件并触发对应的游戏逻辑入口。
 * 使用：挂在场景的管理节点上，根据需要实现各回调。
 */
@ccclass('GameController')
export class GameController extends Component {
  onLoad() {
    on(Events.Start, this.startGame, this);
    on(Events.Timeout, this.onTimeout, this);
    on(Events.End, this.onEnd, this);
  }


  startGame() {}

  /** 倒计时结束 */
  onTimeout() {}

  /** 游戏结束，可携带结束原因 */
  onEnd(reason?: string) {}
}