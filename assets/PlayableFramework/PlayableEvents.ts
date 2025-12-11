/**
 * 轻量事件总线，用于在 Playable 生命周期与玩法层之间解耦。
 * 典型事件：Boot/Preload/Start/CTA/End/Timeout/MuteChanged。
 * 使用：`on(name, cb)` 订阅；`emit(name, payload)` 派发。
 */
import { EventTarget } from 'cc';

export const Events = {
  Boot: 'boot',
  Preload: 'preload',
  Start: 'start',
  FirstInteraction: 'first-interaction',
  CTA: 'cta',
  End: 'end',
  Timeout: 'timeout',
  MuteChanged: 'mute-changed',
};

const bus = new EventTarget();

export function on(name: string, cb: Function, target?: any) {
  bus.on(name, cb as any, target);
}

export function off(name: string, cb: Function, target?: any) {
  bus.off(name, cb as any, target);
}

export function emit(name: string, arg?: any) {
  bus.emit(name, arg);
}