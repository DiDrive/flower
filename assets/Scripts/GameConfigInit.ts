import { _decorator, Component } from 'cc';
import { setConfig } from '../PlayableFramework/PlayableConfig';
const { ccclass } = _decorator;

/**
 * GameConfigInit 场景配置初始化。
 * - 在场景加载时调用 `setConfig` 写入 Playable 广告的全局配置。
 * 使用：将该组件挂在任意常驻节点（如场景根节点）。
 */
@ccclass('GameConfigInit')
export class GameConfigInit extends Component {
  /** 在加载阶段写入配置 */
  onLoad() {
    setConfig({
      ctaUrl: 'https://example.com/store',// CTA 按钮跳转链接
      durationSec: 25,  // 游戏时长倒计时（秒）
      allowReplay: false,//是否允许重新游戏
      orientation: 'portrait',//游戏显示方向， portrait 竖屏，landscape 横屏
      locale: 'zh',
      debug: false,
    });
  }
}