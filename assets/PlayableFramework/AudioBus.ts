/**
 * 全局音频总线：集中管理多个 `AudioSource` 的静音与音量恢复。
 *
 * - `init()` 从本地存储读取初始静音状态，并订阅 MuteChanged 事件。
 * - `register()`/`unregister()` 在场景加载/卸载时维护音源集合。
 * - `setMuted()` 设置静音并同步到本地存储。
 */
import { AudioSource, sys } from 'cc';
import { on, Events } from './PlayableEvents';

class AudioBus {
  private static sources = new Set<AudioSource>();
  private static baseVolumes = new Map<AudioSource, number>();
  private static muted = false;

  static init() {
    const v = sys.localStorage.getItem('playable_mute');
    AudioBus.muted = v === '1';
    on(Events.MuteChanged, (m: boolean) => AudioBus.setMuted(m));
  }

  static register(src: AudioSource) {
    AudioBus.sources.add(src);
    if (!AudioBus.baseVolumes.has(src)) AudioBus.baseVolumes.set(src, src.volume);
    AudioBus.apply(src);
  }

  static unregister(src: AudioSource) {
    AudioBus.sources.delete(src);
    AudioBus.baseVolumes.delete(src);
  }

  static setMuted(m: boolean) {
    AudioBus.muted = m;
    sys.localStorage.setItem('playable_mute', m ? '1' : '0');
    for (const s of AudioBus.sources) AudioBus.apply(s);
  }

  static isMuted(): boolean {
    return AudioBus.muted;
  }

  private static apply(s: AudioSource) {
    const base = AudioBus.baseVolumes.get(s) ?? 1;
    s.volume = AudioBus.muted ? 0 : base;
  }
}

export { AudioBus };