/**
 * 资源预加载组件：按目录批量加载 `resources` Bundle 下的资源，并更新进度条/标签。
 * 用法：在入口处传入 `dirs` 列表调用 `preloadDirs([...])`。
 */
import { _decorator, Component, Label, ProgressBar, assetManager, Asset } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Preloader')
export class Preloader extends Component {
  @property({ type: Label, tooltip: '显示加载进度百分比的标签' }) label: Label | null = null;
  @property({ type: ProgressBar, tooltip: '显示加载进度的进度条' }) bar: ProgressBar | null = null;

  /** 逐目录加载资源并回调进度 */
  async preloadDirs(dirs: string[]): Promise<void> {
    const bundle = await new Promise<any>((resolve, reject) => {
      const b = assetManager.getBundle('resources');
      if (b) resolve(b);
      else assetManager.loadBundle('resources', (err, b2) => err ? reject(err) : resolve(b2));
    });
    for (const dir of dirs) {
      await new Promise<void>((resolve, reject) => {
        bundle.loadDir(dir, (completed: number, total: number) => {
          const p = total > 0 ? completed / total : 0;
          if (this.bar) this.bar.progress = p;
          if (this.label) this.label.string = `${Math.floor(p * 100)}%`;
        }, (err: any, assets: Asset[]) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
}