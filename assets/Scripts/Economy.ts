import { EventTarget } from 'cc';

/**
 * Economy 轻量金币系统。
 * - 使用静态字段记录金币数量并通过事件总线广播变更。
 * - HUD 等 UI 可订阅 `coins` 事件以刷新显示。
 */
class Economy {
  static coins = 0;
  static bus = new EventTarget();
  /** 增加金币并广播当前金币数 */
  static add(n: number) {
    Economy.coins += n;
    Economy.bus.emit('coins', Economy.coins);
  }
  /** 尝试消耗金币，成功返回 true 并广播当前金币数 */
  static spend(n: number): boolean {
    if (Economy.coins < n) return false;
    Economy.coins -= n;
    Economy.bus.emit('coins', Economy.coins);
    return true;
  }
  /** 订阅金币变更事件 */
  static onCoins(cb: Function, target?: any) {
    Economy.bus.on('coins', cb as any, target);
  }
}

export { Economy };