import { _decorator, Component, Node, Vec3, Label } from 'cc';
import { Economy } from './Economy';
import { PlayerController } from './PlayerController';
import { Factory } from './Factory';
import { Market } from './Market';
const { ccclass, property } = _decorator;

/**
 * UpgradeStation 升级站。
 * - 玩家靠近并消耗携带的金币，依次升级：容量、速度、工厂产率、市场价格。
 * - `label` 显示下一次升级所需的金币，达到上限后显示 Max。
 * 使用：将该组件放置在升级区域，并配置各类升级消耗列表。
 */
@ccclass('UpgradeStation')
export class UpgradeStation extends Component {
  @property({ min: 0.1, tooltip: '玩家靠近判定半径（XZ）' }) radius: number = 60;
  @property({ type: Label, tooltip: '显示下一次升级所需金币' }) label: Label | null = null;

  @property({ tooltip: '容量升级的消耗列表' }) capacityCosts: number[] = [10, 20, 40];
  @property({ tooltip: '速度升级的消耗列表' }) speedCosts: number[] = [10, 20, 40];
  @property({ tooltip: '工厂产率升级的消耗列表' }) factoryRateCosts: number[] = [10, 20, 40];
  @property({ tooltip: '市场价格升级的消耗列表' }) marketPriceCosts: number[] = [10, 20, 40];

  private capLv = 0;
  private spdLv = 0;
  private facLv = 0;
  private priceLv = 0;

  update(dt: number) {
    const p = this.findPlayer();
    if (!p) return;
    const d = this.distanceTo(p.node.worldPosition);
    if (d > this.radius) return;
    const next = this.nextCost();
    if (this.label) this.label.string = next > 0 ? `${next}` : `Max`;
    if (next > 0) {
      const removed = p.removeCoin(next);
      if (removed >= next) this.applyNext(p);
    }
  }

  /** 计算下一次升级的金币消耗（若都满则为 0） */
  private nextCost(): number {
    const list = [
      this.capacityCosts[this.capLv] ?? 0,
      this.speedCosts[this.spdLv] ?? 0,
      this.factoryRateCosts[this.facLv] ?? 0,
      this.marketPriceCosts[this.priceLv] ?? 0,
    ].filter(v => v > 0);
    return list.length > 0 ? list[0] : 0;
  }

  /** 应用下一档升级到玩家或对应系统 */
  private applyNext(p: PlayerController) {
    if (this.capLv < this.capacityCosts.length) {
      this.capLv += 1;
      p.capacity += 1;
      return;
    }
    if (this.spdLv < this.speedCosts.length) {
      this.spdLv += 1;
      p.speed += 0.5;
      return;
    }
    const fac = this.findFactory();
    if (this.facLv < this.factoryRateCosts.length && fac) {
      this.facLv += 1;
      fac.produceRate += 0.5;
      return;
    }
    const market = this.findMarket();
    if (this.priceLv < this.marketPriceCosts.length && market) {
      this.priceLv += 1;
      market.price += 1;
    }
  }

  /** 在场景中查找 `PlayerController`（取第一个）。 */
  private findPlayer(): PlayerController | null {
    const n = this.node.scene;
    if (!n) return null;
    const list = n.getComponentsInChildren(PlayerController);
    return list.length > 0 ? list[0] : null;
  }

  /** 在场景中查找工厂组件（取第一个）。 */
  private findFactory(): Factory | null {
    const n = this.node.scene;
    if (!n) return null;
    const list = n.getComponentsInChildren(Factory);
    return list.length > 0 ? list[0] : null;
  }

  /** 在场景中查找市场组件（取第一个）。 */
  private findMarket(): Market | null {
    const n = this.node.scene;
    if (!n) return null;
    const list = n.getComponentsInChildren(Market);
    return list.length > 0 ? list[0] : null;
  }

  /** 计算升级站到某世界位置的 XZ 平面距离。 */
  private distanceTo(pos: Vec3): number {
    const a = this.node.worldPosition;
    return Math.hypot(a.x - pos.x, a.z - pos.z);
  }
}