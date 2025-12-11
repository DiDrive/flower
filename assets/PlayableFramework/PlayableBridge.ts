/**
 * 广告桥接：与宿主页面通信或回退到直接跳转。
 *
 * - `openStore()`：优先通过 `postMessage` 通知父页面打开商店；若失败，使用配置中的 `ctaUrl` 跳转；最后调用 `end('cta')`。
 * - `end(reason)`：通知父页面结束 playable，并发出 `End` 事件。
 */
import { getConfig } from './PlayableConfig';
import { emit, Events } from './PlayableEvents';

export class PlayableBridge {
  static openStore(): void {
    emit(Events.CTA);
    let handled = false;
    try {
      const w: any = window;
      if (w && w.parent && w.parent !== w) {
        w.parent.postMessage({ type: 'OPEN_STORE' }, '*');
        handled = true;
      }
    } catch {}
    const cfg = getConfig();
    if (cfg.ctaUrl && !handled) {
      location.href = cfg.ctaUrl;
    }
    PlayableBridge.end('cta');
  }

  static end(reason?: string): void {
    emit(Events.End, reason);
    try {
      const w: any = window;
      if (w && w.parent) {
        w.parent.postMessage({ type: 'END_PLAYABLE', reason }, '*');
      }
    } catch {}
  }
}