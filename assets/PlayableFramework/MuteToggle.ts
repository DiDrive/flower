/**
 * 静音开关：切换 AudioBus 的全局静音状态，并更新当前音源。
 */
import { _decorator, Component, Node, AudioSource } from 'cc';
import { emit, Events } from './PlayableEvents';
import { AudioBus } from './AudioBus';
const { ccclass, property } = _decorator;

@ccclass('MuteToggle')
export class MuteToggle extends Component {
  @property({ type: AudioSource, tooltip: '被静音/恢复的音源（主音量）' }) audio: AudioSource | null = null;
  private muted = false;

  onLoad() {
    this.muted = AudioBus.isMuted();
    this.apply();
  }

  onEnable() {
    this.node.on(Node.EventType.TOUCH_END, this.toggle, this);
  }

  onDisable() {
    this.node.off(Node.EventType.TOUCH_END, this.toggle, this);
  }

  /** 切换静音并广播 */
  toggle() {
    AudioBus.setMuted(!this.muted);
    this.muted = AudioBus.isMuted();
    this.apply();
    emit(Events.MuteChanged, this.muted);
  }

  apply() {
    if (this.audio) this.audio.volume = this.muted ? 0 : 1;
  }
}