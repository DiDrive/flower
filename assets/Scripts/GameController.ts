import { _decorator, Component } from 'cc';
import { on, Events } from '../PlayableFramework/PlayableEvents';
import { ExpansionZone } from './ExpansionZone';
import { ToolUpgradeZone } from './ToolUpgradeZone';
const { ccclass } = _decorator;

/**
 * GameController 游戏流程控制器。
 * - 订阅 Playable 框架事件并触发对应的游戏逻辑入口。
 * 使用：挂在场景的管理节点上，根据需要实现各回调。
 */
@ccclass('GameController')
export class GameController extends Component {
  private unlocked = new Set<string>();
  private revealed = new Set<string>();
  onLoad() {
    on(Events.Start, this.startGame, this);
    on(Events.Timeout, this.onTimeout, this);
    on(Events.End, this.onEnd, this);
    on('first-coin', this.onFirstCoin, this);
    on('zone-unlocked', this.onZoneUnlocked, this);
  }


  startGame() {}

  /** 倒计时结束 */
  onTimeout() {}

  /** 游戏结束，可携带结束原因 */
  onEnd(reason?: string) {}

  private onFirstCoin() {
    if (!this.revealed.has('ToolUpgradeZone')) {
      this.revealed.add('ToolUpgradeZone');
      ToolUpgradeZone.fireGuide('ToolUpgradeZone');
      console.log('[Chain] reveal ToolUpgradeZone');
    }
  }

  private onZoneUnlocked(name?: string) {
    const k = name || '';
    if (!k) return;
    this.unlocked.add(k);
    if (k === 'ToolUpgradeZone') {
      if (!this.revealed.has('HarvesterZoneA')) { this.revealed.add('HarvesterZoneA'); ExpansionZone.fireGuide('HarvesterZoneA'); console.log('[Chain] reveal HarvesterZoneA'); }
      if (!this.revealed.has('SellerZoneB')) { this.revealed.add('SellerZoneB'); ExpansionZone.fireGuide('SellerZoneB'); console.log('[Chain] reveal SellerZoneB'); }
    }
    if (this.unlocked.has('HarvesterZoneA') && this.unlocked.has('SellerZoneB')) {
      if (!this.revealed.has('new_marketZone')) { this.revealed.add('new_marketZone'); ExpansionZone.fireGuide('new_marketZone'); console.log('[Chain] reveal new_marketZone'); }
    }
    if (k === 'new_marketZone') {
      if (this.revealed.has('new_marketZone') && !this.revealed.has('new_area')) { this.revealed.add('new_area'); ExpansionZone.fireGuide('new_area'); console.log('[Chain] reveal new_area'); }
    }
  }
}