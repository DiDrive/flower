/**
 * Playable 的入口组件：处理预加载、首次交互、计时、结束等流程。
 *
 * - 在 `start()` 中根据配置应用分辨率、预加载 resources 目录、注册音频。
 * - `waitForFirstTap()` 显示点击门并等待首次触控；触发后开始计时与游戏逻辑。
 * - 通过 `PlayableEvents` 对外广播关键节点（Start/Timeout/End等）。
 */
import { _decorator, Component, Node, Label, AudioSource } from 'cc';
import { getConfig } from './PlayableConfig';
import { Preloader } from './Preloader';
import { Responsive } from './Responsive';
import { emit, Events } from './PlayableEvents';
import { PlayableBridge } from './PlayableBridge';
import { AudioBus } from './AudioBus';

const { ccclass, property } = _decorator;

@ccclass('PlayableApp')
export class PlayableApp extends Component {
  @property({ type: Preloader, tooltip: '预加载与进度显示组件' }) preloader: Preloader | null = null;
  @property({ type: [String], tooltip: 'resources 下要预加载的目录列表' }) preloadDirs: string[] = [];
  @property({ type: Node, tooltip: '首次点击遮罩节点（点击后隐藏）' }) gate: Node | null = null;
  @property({ type: Label, tooltip: '倒计时显示的标签' }) timerLabel: Label | null = null;
  @property({ type: AudioSource, tooltip: '背景音乐音源（首次交互后播放）' }) bgm: AudioSource | null = null;

  private started = false;
  private remaining = 0;

  async start() {
    // 初始化事件与音频总线
    emit(Events.Boot);
    AudioBus.init();
    const cfg = getConfig();
    if (cfg.orientation === 'portrait') Responsive.applyPortrait();
    else Responsive.applyLandscape();
    // 资源预加载（可选）
    emit(Events.Preload);
    if (this.preloader && this.preloadDirs.length > 0) await this.preloader.preloadDirs(this.preloadDirs);
    if (this.bgm) AudioBus.register(this.bgm);
    this.waitForFirstTap();
  }

  /** 显示点击门并等待首次交互 */
  waitForFirstTap() {
    const target = this.gate || this.node;
    target.active = true;
    target.once(Node.EventType.TOUCH_START, this.onFirstTap, this);
  }

  /** 首次触控后：播放BGM、发出 Start、启动计时 */
  onFirstTap() {
    if (this.started) return;
    this.started = true;
    const cfg = getConfig();
    emit(Events.FirstInteraction);
    if (this.bgm) this.bgm.play();
    emit(Events.Start);
    if (cfg.durationSec > 0) {
      this.remaining = cfg.durationSec;
      this.schedule(this.tick, 1, cfg.durationSec - 1);
      this.scheduleOnce(this.onTimeout, cfg.durationSec);
    }
    if (this.gate) this.gate.active = false;
  }

  /** 计时标签更新（每秒一次） */
  tick() {
    this.remaining -= 1;
    if (this.timerLabel) this.timerLabel.string = `${this.remaining}s`;
  }

  /** 倒计时结束：派发 Timeout 并结束 playable */
  onTimeout() {
    emit(Events.Timeout);
    PlayableBridge.end('timeout');
  }
}