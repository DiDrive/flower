/**
 * 音源注册：把本节点上的 `AudioSource` 注册到 AudioBus，便于统一静音管理，BGM已经注册到 AudioBus，无需重复注册。
 */
import { _decorator, Component, AudioSource } from 'cc';
import { AudioBus } from './AudioBus';
const { ccclass, property } = _decorator;

@ccclass('AudioRegister')
export class AudioRegister extends Component {
  @property({ type: AudioSource, tooltip: '注册到全局静音总线的音源（留空取本节点）' }) source: AudioSource | null = null;

  onLoad() {
    const s = this.source ?? this.node.getComponent(AudioSource);
    if (s) AudioBus.register(s);
  }

  onDestroy() {
    const s = this.source ?? this.node.getComponent(AudioSource);
    if (s) AudioBus.unregister(s);
  }
}