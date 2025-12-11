/**
 * 简易响应式适配：设置设计分辨率与缩放策略。
 * Portrait/ Landscape 两套入口。
 */
import { view, ResolutionPolicy } from 'cc';

export class Responsive {
  /** 竖屏适配：SHOW_ALL 保持内容比例 */
  static applyPortrait(width = 720, height = 1280) {
    view.resizeWithBrowserSize(true);
    view.setDesignResolutionSize(width, height, ResolutionPolicy.SHOW_ALL);
  }

  /** 横屏适配：SHOW_ALL 保持内容比例 */
  static applyLandscape(width = 1280, height = 720) {
    view.resizeWithBrowserSize(true);
    view.setDesignResolutionSize(width, height, ResolutionPolicy.SHOW_ALL);
  }
}
