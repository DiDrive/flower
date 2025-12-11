/**
 * Playable的全局配置。
 *
 * 使用方法：在场景初始化时调用 `setConfig({...})` 写入你需要的参数；
 * 在运行时通过 `getConfig()` 读取。`defaultConfig` 提供默认值。
 */
import { sys } from 'cc';

export type Orientation = 'portrait' | 'landscape';

export interface PlayableConfig {
  ctaUrl: string;
  durationSec: number;
  allowReplay: boolean;
  orientation: Orientation;
  locale: string;
  debug: boolean;
}

const defaultConfig: PlayableConfig = {
  ctaUrl: '',
  durationSec: 30,
  allowReplay: false,
  orientation: 'portrait',
  locale: 'en',
  debug: false,
};

let current = defaultConfig;

/**
 * 合并并设置当前配置。仅覆盖传入的字段。
 */
export function setConfig(partial: Partial<PlayableConfig>): void {
  current = { ...current, ...partial };
}

/**
 * 读取当前配置。
 */
export function getConfig(): PlayableConfig {
  return current;
}

/**
 * 读取本地存储中的默认静音状态（由 AudioBus 管理）。
 */
export function getMutedByDefault(): boolean {
  const v = sys.localStorage.getItem('playable_mute');
  return v === '1';
}