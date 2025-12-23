import { _decorator, Component, Node, Vec3, Label, Collider, BoxCollider, Mat4, CCInteger } from 'cc'
import { PlayerController } from './PlayerController'
const { ccclass, property } = _decorator

@ccclass('ToolUpgradeZone')
export class ToolUpgradeZone extends Component {
  @property({ type: Label }) label: Label | null = null
  @property({ type: [CCInteger], tooltip: '升级消耗列表：按当前等级索引' }) toolCosts: number[] = [0, 20, 40]
  @property({ type: BoxCollider, tooltip: 'AABB 包围盒（为空则取自身上的 BoxCollider）' }) area: BoxCollider | null = null
  @property({ tooltip: '升级后自动隐藏该区域' }) autoHideOnUpgrade: boolean = true
  private paid = 0

  update(dt: number) {
    const p = this.findPlayer()
    if (!p) return
    const col = this.area || this.node.getComponent(BoxCollider)
    if (!col) return
    if (!this.isInsideAreaXZ(p.node.worldPosition, this.node, col)) return
    const next = this.nextCost(p)
    const remain = next > 0 ? Math.max(0, next - this.paid) : 0
    if (this.label) this.label.string = next > 0 ? `${remain}` : 'Max'
    if (next > 0 && remain > 0) {
      const take = remain
      const removed = p.removeCoin(take)
      if (removed > 0) {
        this.paid += removed
        console.log('[ToolUpgradeZone] pay', removed, 'progress=', this.paid, '/', next)
      }
      if (this.paid >= next) {
        this.paid = 0
        this.applyNext(p)
        console.log('[ToolUpgradeZone] upgraded tool to', (p as any).toolLevel)
        if (this.autoHideOnUpgrade) this.node.active = false
      }
    }
  }

  private nextCost(p: PlayerController): number {
    const idx = Math.max(0, Math.min(2, p.toolLevel))
    const c = this.toolCosts[idx] ?? 0
    return p.toolLevel >= 3 ? 0 : c
  }

  private applyNext(p: PlayerController) {
    const lvl = Math.min(3, p.toolLevel + 1)
    p.setToolLevel(lvl)
  }

  private findPlayer(): PlayerController | null {
    const n = this.node.scene
    if (!n) return null
    const list = n.getComponentsInChildren(PlayerController)
    return list.length > 0 ? list[0] : null
  }

  private isInsideAreaXZ(p: Vec3, areaNode: Node, col: Collider): boolean {
    const bc = col instanceof BoxCollider ? col : null
    if (!bc) return false
    const inv = new Mat4()
    Mat4.invert(inv, areaNode.worldMatrix)
    const lp = new Vec3()
    Vec3.transformMat4(lp, p, inv)
    const dx = lp.x - bc.center.x
    const dz = lp.z - bc.center.z
    const hx = bc.size.x * 0.5
    const hz = bc.size.z * 0.5
    return Math.abs(dx) <= hx && Math.abs(dz) <= hz
  }
}