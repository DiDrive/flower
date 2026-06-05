import { _decorator, Component, Node, Vec3, Label, Collider, BoxCollider, Mat4, CCInteger, MeshRenderer, Material, Texture2D, Vec4, Quat, tween } from 'cc'
import { PlayerController } from './PlayerController'
import { Economy } from './Economy'
import { emit } from '../PlayableFramework/PlayableEvents'
const { ccclass, property } = _decorator

@ccclass('ToolUpgradeZone')
export class ToolUpgradeZone extends Component {
  @property({ type: Label }) label: Label | null = null
  @property({ type: [CCInteger], tooltip: '升级消耗列表：按当前等级索引' }) toolCosts: number[] = [0, 20, 40]
  @property({ type: BoxCollider, tooltip: 'AABB 包围盒（为空则取自身上的 BoxCollider）' }) area: BoxCollider | null = null
  @property({ tooltip: '升级后自动隐藏该区域' }) autoHideOnUpgrade: boolean = true
  @property({ type: Texture2D, tooltip: '填充贴图' }) fillTexture: Texture2D | null = null
  @property({ type: [Texture2D], tooltip: '数字0-9贴图数组' }) digitTextures: Texture2D[] = []
  @property({ tooltip: '使用材质指示' }) useMaterialIndicator: boolean = true
  @property({ type: Node, tooltip: '填充平面节点' }) fillNode: Node | null = null
  @property({ type: Node, tooltip: '数字平面节点' }) digitNode: Node | null = null
  @property({ type: [Node], tooltip: '数字平面数组' }) digitNodes: Node[] = []
  @property({ tooltip: '填充使用Z轴（默认X轴）' }) fillUseZAxis: boolean = false
  @property({ min: 0, tooltip: '每秒扣费速率（0为瞬时全扣）' }) drainPerSec: number = 0
  @property({ min: 0, tooltip: '填充条本地宽度（用于左对齐缩放）' }) fillWidthLocal: number = 60
  @property({ type: Node, tooltip: '填充左锚点（优先使用世界坐标对齐）' }) fillLeftAnchor: Node | null = null
  @property({ type: Node, tooltip: '填充右锚点（可选，用于计算宽度）' }) fillRightAnchor: Node | null = null
  @property({ type: Node, tooltip: '填充容器（其原点放在左锚）' }) fillContainer: Node | null = null
  @property({ tooltip: '锚点是容器的子节点（直接用局部坐标）' }) anchorsInContainer: boolean = true
  @property({ tooltip: '反向填充（从右向左）' }) fillReverse: boolean = false
  @property({ tooltip: '引导出现的标识键（非空则初始隐藏，等待触发）' }) appearOnGuideKey: string = ''
  @property({ tooltip: '使用 Guide Targets 名称自动出现（初始隐藏）' }) appearByGuideTargets: boolean = false
  @property({ min: 0, tooltip: '聚焦移动时长' }) focusMoveSec: number = 1
  @property({ min: 0, tooltip: '聚焦停留时长' }) focusHoldSec: number = 0.6
  private paid = 0
  private fillMat: Material | null = null
  private digitMat: Material | null = null
  private digitMats: Material[] = []
  private fillScale0X = 1
  private fillPos0X = 0
  private fillScale0Z = 1
  private fillPos0Z = 0
  private fillLeft0X = 0
  private fillLeft0Z = 0

  private static guideMap: Map<string, ToolUpgradeZone[]> = new Map()
  onLoad() {
    if (this.appearOnGuideKey && this.appearOnGuideKey.length > 0) {
      const arr = ToolUpgradeZone.guideMap.get(this.appearOnGuideKey) || []
      arr.push(this)
      ToolUpgradeZone.guideMap.set(this.appearOnGuideKey, arr)
      this.node.active = false
    }
    if (this.appearByGuideTargets) {
      const k = this.node?.name || ''
      if (k && k.length > 0) {
        const arr = ToolUpgradeZone.guideMap.get(k) || []
        arr.push(this)
        ToolUpgradeZone.guideMap.set(k, arr)
        this.node.active = false
      }
    }
  }

  update(dt: number) {
    const p = this.findPlayer()
    if (!p) return
    const col = this.area || this.node.getComponent(BoxCollider)
    if (!col) return
    const inside = this.isInsideAreaXZ(p.node.worldPosition, this.node, col)
    const next = this.nextCost(p)
    const remain = next > 0 ? Math.max(0, next - this.paid) : 0
    if (this.label) this.label.string = next > 0 ? `${remain}` : 'Max'
    this.updateMaterialIndicator(remain, next, inside)
    if (inside && next > 0 && remain > 0) {
      const take = this.drainPerSec > 0 ? Math.max(1, Math.min(remain, Math.floor(this.drainPerSec * dt))) : remain
      const stackCount = p.coinStack ? (p.coinStack as any).count?.() as number : 0
      const overflow = Math.max(0, (Economy as any).coins - stackCount)
      const useGlobal = Math.min(take, overflow)
      const spentGlobal = useGlobal > 0 ? (Economy as any).spendUpTo(useGlobal) : 0
      const remainNeed = Math.max(0, take - spentGlobal)
      const removed = remainNeed > 0 && stackCount > 0 ? p.removeCoin(Math.min(remainNeed, stackCount)) : 0
      const paidThis = spentGlobal + removed
      if (paidThis > 0) {
        this.paid += paidThis
        console.log('[ToolUpgradeZone] pay', paidThis, 'progress=', this.paid, '/', next)
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
    emit('zone-unlocked', this.node.name)
  }

  private findPlayer(): PlayerController | null {
    const n = this.node.scene
    if (!n) return null
    const list = n.getComponentsInChildren(PlayerController)
    return list.length > 0 ? list[0] : null
  }

  public static fireGuide(key: string) {
    const arr = ToolUpgradeZone.guideMap.get(key) || []
    for (const z of arr) z.appearNowWithFocus()
  }

  private appearNowWithFocus() {
    if (!this.node.active) this.node.active = true
    const p = this.findPlayer()
    if (p) {
      const pos = this.node.worldPosition.clone()
      const sid = (p as any).startCameraFocus?.(pos, this.focusMoveSec, this.focusHoldSec)
      const after = Math.max(0, this.focusMoveSec + this.focusHoldSec)
      tween(this.node)
        .delay(after)
        .call(() => { (p as any).stopCameraFocus?.(sid) })
        .start()
    }
  }

  private isInsideAreaXZ(p: Vec3, areaNode: Node, col: Collider): boolean {
    const bc = col instanceof BoxCollider ? col : null
    if (!bc) return false
    const inv = new Mat4()
    Mat4.invert(inv, bc.node.worldMatrix)
    const lp = new Vec3()
    Vec3.transformMat4(lp, p, inv)
    const dx = lp.x - bc.center.x
    const dz = lp.z - bc.center.z
    const hx = bc.size.x * 0.5
    const hz = bc.size.z * 0.5
    return Math.abs(dx) <= hx && Math.abs(dz) <= hz
  }

  

  

  private ensureMaterialTargets() {
    if (this.fillNode && !this.fillMat) {
      const r = this.fillNode.getComponent(MeshRenderer)
      const mi = (r as any)?.getMaterialInstance?.(0) || r?.getSharedMaterial?.(0)
      this.fillMat = mi || null
      this.fillScale0X = this.fillNode.scale.x
      this.fillPos0X = this.fillNode.position.x
      this.fillScale0Z = this.fillNode.scale.z
      this.fillPos0Z = this.fillNode.position.z
      this.fillLeft0X = this.fillPos0X - this.fillWidthLocal * 0.5
      this.fillLeft0Z = this.fillPos0Z - this.fillWidthLocal * 0.5
    }
    if (this.digitNode && !this.digitMat) {
      const r = this.digitNode.getComponent(MeshRenderer)
      const mi = (r as any)?.getMaterialInstance?.(0) || r?.getSharedMaterial?.(0)
      this.digitMat = mi || null
    }
    if (this.digitNodes && this.digitNodes.length > 0 && this.digitMats.length === 0) {
      this.digitMats = []
      for (const n of this.digitNodes) {
        const r = n?.getComponent(MeshRenderer) || null
        const mi = (r as any)?.getMaterialInstance?.(0) || r?.getSharedMaterial?.(0)
        if (mi) this.digitMats.push(mi as Material)
      }
    }
  }

  private updateMaterialIndicator(remain: number, total: number, show: boolean) {
    if (!this.useMaterialIndicator) return
    this.ensureMaterialTargets()
    const prog = total <= 0 ? 1 : Math.max(0, Math.min(1, (total - remain) / total))
    if (this.fillNode) this.fillNode.active = total > 0
    if (this.digitNode) this.digitNode.active = total > 0
    if (this.fillNode) {
      const s = Math.max(0, Math.min(1, prog))
      if (this.fillContainer && this.fillLeftAnchor) {
        let leftL = new Vec3()
        let rightL = new Vec3()
        if (this.anchorsInContainer && this.fillLeftAnchor.parent === this.fillContainer && (!this.fillRightAnchor || this.fillRightAnchor.parent === this.fillContainer)) {
          leftL = this.fillLeftAnchor.position.clone()
          rightL = this.fillRightAnchor ? this.fillRightAnchor.position.clone() : new Vec3(leftL.x + (this.fillUseZAxis ? 0 : this.fillWidthLocal), leftL.y, leftL.z + (this.fillUseZAxis ? this.fillWidthLocal : 0))
        } else {
          const invCont = new Mat4()
          Mat4.invert(invCont, this.fillContainer.worldMatrix)
          const lw = this.fillLeftAnchor.worldPosition.clone()
          Vec3.transformMat4(leftL, lw, invCont)
          if (this.fillRightAnchor) {
            const rw = this.fillRightAnchor.worldPosition.clone()
            Vec3.transformMat4(rightL, rw, invCont)
          } else {
            rightL = new Vec3(leftL.x + (this.fillUseZAxis ? 0 : this.fillWidthLocal), leftL.y, leftL.z + (this.fillUseZAxis ? this.fillWidthLocal : 0))
          }
        }
        const dx = rightL.x - leftL.x
        const dz = rightL.z - leftL.z
        const widthL = Math.max(0.0001, Math.hypot(dx, dz))
        const nx = dx / widthL
        const nz = dz / widthL
        const half = (widthL * s) * 0.5
        const baseX = this.fillReverse ? (rightL.x - nx * half) : (leftL.x + nx * half)
        const baseZ = this.fillReverse ? (rightL.z - nz * half) : (leftL.z + nz * half)
        if (!this.fillUseZAxis) {
          const yaw = Math.atan2(-nz, nx)
          const q = new Quat(); Quat.fromEuler(q, 0, yaw * 180 / Math.PI, 0)
          this.fillNode.setRotation(q)
          const sx0 = this.fillScale0X || this.fillNode.scale.x
          this.fillNode.setScale(sx0 * s, this.fillNode.scale.y, this.fillNode.scale.z)
          this.fillNode.setPosition(baseX, this.fillNode.position.y, baseZ)
        } else {
          const yaw = Math.atan2(nx, nz)
          const q = new Quat(); Quat.fromEuler(q, 0, yaw * 180 / Math.PI, 0)
          this.fillNode.setRotation(q)
          const sz0 = this.fillScale0Z || this.fillNode.scale.z
          this.fillNode.setScale(this.fillNode.scale.x, this.fillNode.scale.y, sz0 * s)
          this.fillNode.setPosition(baseX, this.fillNode.position.y, baseZ)
        }
      } else {
        const parent = this.fillNode.parent
        const invParent = new Mat4()
        if (parent) Mat4.invert(invParent, parent.worldMatrix)
        const leftW = this.fillLeftAnchor ? this.fillLeftAnchor.worldPosition.clone() : this.fillNode.worldPosition.clone()
        const rightW = this.fillRightAnchor ? this.fillRightAnchor.worldPosition.clone() : new Vec3(leftW.x + (this.fillUseZAxis ? 0 : this.fillWidthLocal), leftW.y, leftW.z + (this.fillUseZAxis ? this.fillWidthLocal : 0))
        const leftL = new Vec3(); Vec3.transformMat4(leftL, leftW, invParent)
        const rightL = new Vec3(); Vec3.transformMat4(rightL, rightW, invParent)
        if (!this.fillUseZAxis) {
          const widthL = Math.abs(rightL.x - leftL.x)
          const centerL = leftL.x + (widthL * s) * 0.5
          const sx0 = this.fillScale0X || this.fillNode.scale.x
          this.fillNode.setScale(sx0 * s, this.fillNode.scale.y, this.fillNode.scale.z)
          this.fillNode.setPosition(centerL, this.fillNode.position.y, this.fillNode.position.z)
        } else {
          const widthL = Math.abs(rightL.z - leftL.z)
          const centerL = leftL.z + (widthL * s) * 0.5
          const sz0 = this.fillScale0Z || this.fillNode.scale.z
          this.fillNode.setScale(this.fillNode.scale.x, this.fillNode.scale.y, sz0 * s)
          this.fillNode.setPosition(this.fillNode.position.x, this.fillNode.position.y, centerL)
        }
      }
    }
    if (this.fillMat && this.fillTexture) {
      this.fillMat.setProperty('mainTexture', this.fillTexture)
    }
    const val = Math.max(0, remain | 0)
    const s = `${val}`
    if (this.digitMats.length > 0) {
      for (let i = 0; i < this.digitMats.length; i++) {
        const m = this.digitMats[i]
        const ch = i < s.length ? s[i] : ''
        const idx = ch ? (ch.charCodeAt(0) - 48) : -1
        const tex = idx >= 0 && this.digitTextures && this.digitTextures[idx] ? this.digitTextures[idx] : null
        if (tex) m.setProperty('mainTexture', tex)
        else m.setProperty('mainTexture', null as any)
        const node = this.digitNodes[i]
        if (node) node.active = total > 0 && !!ch
      }
    } else if (this.digitMat) {
      const idx = Math.max(0, Math.min(9, val))
      const tex = this.digitTextures && this.digitTextures[idx] ? this.digitTextures[idx] : null
      if (tex) this.digitMat.setProperty('mainTexture', tex)
    }
  }
}