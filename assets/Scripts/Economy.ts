import { EventTarget } from 'cc';
import { emit } from '../PlayableFramework/PlayableEvents';

/**
 * Economy 轻量金币系统。
 * - 使用静态字段记录金币数量并通过事件总线广播变更。
 * - HUD 等 UI 可订阅 `coins` 事件以刷新显示。
 */
class Economy {
  static coins = 0;
  static bus = new EventTarget();
  static firstCoinFired = false;
  /** 增加金币并广播当前金币数 */
  static add(n: number) {
    const before = Economy.coins;
    Economy.coins += n;
    if (!Economy.firstCoinFired && before <= 0 && Economy.coins > 0) {
      emit('first-coin');
      Economy.firstCoinFired = true;
    }
    Economy.bus.emit('coins', Economy.coins);
  }
  /** 尝试消耗金币，成功返回 true 并广播当前金币数 */
  static spend(n: number): boolean {
    if (Economy.coins < n) return false;
    Economy.coins -= n;
    Economy.bus.emit('coins', Economy.coins);
    return true;
  }
  /** 部分消耗：最多消耗 n 个并返回实际消耗数量 */
  static spendUpTo(n: number): number {
    const spent = Math.min(n, Economy.coins);
    if (spent <= 0) return 0;
    Economy.coins -= spent;
    Economy.bus.emit('coins', Economy.coins);
    return spent;
  }
  /** 订阅金币变更事件 */
  static onCoins(cb: Function, target?: any) {
    Economy.bus.on('coins', cb as any, target);
  }
}

export { Economy };