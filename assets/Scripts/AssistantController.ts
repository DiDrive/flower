import { _decorator, Component, Node, Vec3, Prefab, instantiate, Quat, Animation, SkeletalAnimation, Collider, BoxCollider, Mat4 } from 'cc'
import { Factory } from './Factory'
import { Market } from './Market'
import { CollectItem } from './CollectItem'
import { CollectStack } from './CollectStack'
import { ActionStateMachine } from './ActionStateMachine'
const { ccclass, property } = _decorator

@ccclass('AssistantController')
export class AssistantController extends Component {
  @property({ tooltip: '助手角色：harvester 或 seller' }) role: 'harvester' | 'seller' = 'harvester'
  @property({ tooltip: '移动速度（单位/秒）' }) speed: number = 3
  @property({ min: 1, tooltip: '最大携带数量' }) capacity: number = 10
  @property({ type: Factory, tooltip: '工厂引用' }) factory: Factory | null = null
  @property({ type: Market, tooltip: '市场引用' }) market: Market | null = null
  @property({ type: Animation, tooltip: '角色动画（idle/run）' }) anim: Animation | null = null
  @property({ min: 0.1, tooltip: '收割速率（件/秒）' }) harvestRate: number = 1
  @property({ min: 0.1, tooltip: '投递速率（件/秒）' }) deliverRate: number = 2
  @property({ type: CollectStack, tooltip: '鲜花堆叠显示' }) flowerStack: CollectStack | null = null
  @property({ type: CollectStack, tooltip: '鲜花饼堆叠显示' }) breadStack: CollectStack | null = null
  @property({ min: 1, tooltip: '单次投递/售卖批量' }) deliverBatch: number = 1
  @property({ tooltip: '动作剪辑映射(JSON，可覆盖默认命名)' }) clipMapJson: string = ''
  @property({ min: 0, tooltip: '收割动作退出维持时间（秒）' }) harvestHoldSec: number = 0.5
  @property({ type: Node, tooltip: '剪刀道具节点（播放 clipper_move 时显示）' }) toolScissors: Node | null = null
  @property({ tooltip: '自动控制剪刀显隐' }) autoToolVisibility: boolean = true

  private target: Vec3 | null = null
  private accHarvest = 0
  private accDeliver = 0
  private sa: SkeletalAnimation | null = null
  private machine: ActionStateMachine | null = null
  private uploading = false
  private selling = false
  private harvesting = false
  private inSellArea = false
  private harvestHold = 0

  onLoad() {
    this.sa = this.node.getComponent(SkeletalAnimation) || this.node.getComponentInChildren(SkeletalAnimation)
    if (!this.anim) this.anim = this.pickBestAnimation()
    this.machine = new ActionStateMachine(this.sa, this.anim, 0.001)
    if (this.clipMapJson) {
      try {
        const map = JSON.parse(this.clipMapJson)
        if (map && typeof map === 'object') this.machine.setClipMap(map)
      } catch {}
    }
    this.autoMapClips()
    if (!this.factory) this.factory = this.findFactory()
    if (!this.market) this.market = this.findMarket()
  }

  update(dt: number) {
    if (this.role === 'harvester') this.tickHarvester(dt)
    else this.tickSeller(dt)
    const moving = !!this.target && this.distanceXZ(this.node.worldPosition, this.target) > 0.2
    const breads = this.breadCount()
    let next = 'idle'
    if (this.harvesting) {
      next = moving ? 'scissors_run' : 'scissors_idle'
    } else if (this.role === 'seller' && this.inSellArea) {
      next = 'shouyin'
    } else if (breads > 0) {
      next = moving ? 'carry_run' : 'carry_idle'
    } else {
      next = moving ? 'run' : 'idle'
    }
    this.updateToolVisibility(moving && next === 'scissors_run')
    this.machine?.play(next)
    this.stepMove(dt)
  }

  private tickHarvester(dt: number) {
    this.harvesting = false
    // 上传会话：进入后持续提交到清空
    if (this.uploading) {
      if (this.factory?.uploadArea) this.target = this.factory.uploadArea.worldPosition.clone()
      if (this.factory?.uploadArea && this.isInsideAreaXZ(this.factory.uploadArea)) {
        this.accDeliver += dt
        const need = 1 / this.deliverRate
        if (this.accDeliver >= need && this.carryCount() > 0) {
          this.accDeliver = 0
          // 上传动画与转入队列由 Factory 在其 update 中按 inputRate 处理
        }
      }
      if (this.carryCount() <= 0) { this.uploading = false; this.target = null; this.harvestHold = 0; this.harvesting = false }
      return
    }

    // 满载才去上传；否则采集
    const cap = Math.max(1, this.capacity)
    if (this.carryCount() >= cap) {
      this.uploading = true
      this.harvestHold = 0
      this.harvesting = false
      if (this.factory?.uploadArea) this.target = this.factory.uploadArea.worldPosition.clone()
      return
    }

    const item = this.findNearestCollectItem()
    if (item) {
      this.target = item.node.worldPosition.clone()
      this.accHarvest += dt
      const need = 1 / this.harvestRate
      const near = this.distanceXZ(this.node.worldPosition, item.node.worldPosition) < (item.pickupRadius ?? 1)
      if (near) this.harvestHold = this.harvestHoldSec
      else this.harvestHold = Math.max(0, this.harvestHold - dt)
      this.harvesting = near || this.harvestHold > 0
      if (near && this.accHarvest >= need) {
        this.accHarvest = 0
        const carry = this.harvestToCarry(item)
        if (carry && this.flowerStack?.tryAddItem(carry)) {}
        else carry?.destroy()
      }
    } else {
      this.harvestHold = Math.max(0, this.harvestHold - dt)
      this.harvesting = this.harvestHold > 0
      if (!this.target) this.machine?.play('idle')
    }
  }

  private tickSeller(dt: number) {
    this.inSellArea = false
    // 售卖会话：进入后持续售卖到清空
    if (this.selling) {
      if (this.market?.sellArea) this.target = this.market.sellArea.worldPosition.clone()
      if (this.market?.sellArea && this.isInsideAreaXZ(this.market.sellArea)) {
        this.inSellArea = true
        this.accDeliver += dt
        const need = 1 / this.deliverRate
        if (this.accDeliver >= need && this.breadCount() > 0) {
          this.accDeliver = 0
          const count = Math.min(this.deliverBatch, this.breadCount())
          for (let i = 0; i < count; i++) {
            const it = this.breadStack?.popTopRaw() || null
            if (it && this.market) this.market.stageBreadItem(it)
          }
        }
      }
      if (this.breadCount() <= 0) { this.selling = false; this.target = null }
      return
    }

    // 满载才去售卖；否则持续拾取
    if (this.breadCount() >= this.capacity) {
      this.selling = true
      if (this.market?.sellArea) this.target = this.market.sellArea.worldPosition.clone()
      return
    }

    if (this.factory?.pickupArea && this.breadCount() < this.capacity) {
      this.target = this.factory!.pickupArea!.worldPosition.clone()
      if (this.isInsideAreaXZ(this.factory.pickupArea)) {
        this.accHarvest += dt
        const need = 1 / this.harvestRate
        if (this.accHarvest >= need) {
          this.accHarvest = 0
          const breads = this.factory.takeBread(1)
          for (const b of breads) {
            if (!this.breadStack?.tryAddItem(b)) b.destroy()
          }
        }
      }
    }
    if (!this.target && this.breadCount() === 0) this.machine?.play('idle')
  }

  private stepMove(dt: number) {
    if (!this.target) return
    const p = this.node.worldPosition
    const dx = this.target.x - p.x
    const dz = this.target.z - p.z
    const len = Math.hypot(dx, dz)
    if (len < 0.001) return
    const step = Math.min(this.speed * dt, len)
    const nx = p.x + (dx / len) * step
    const nz = p.z + (dz / len) * step
    this.node.setWorldPosition(nx, p.y, nz)
    const yaw = Math.atan2(dx, dz) * 180 / Math.PI
    const q = new Quat(); Quat.fromEuler(q, 0, yaw, 0)
    this.node.setWorldRotation(q)
  }

  private findNearestCollectItem(): CollectItem | null {
    const scene = this.node.scene
    if (!scene) return null
    const list = scene.getComponentsInChildren(CollectItem)
    let best: CollectItem | null = null
    let bestD = Infinity
    for (const c of list) {
      if (!c.node.activeInHierarchy) continue
      const d = this.distanceXZ(this.node.worldPosition, c.node.worldPosition)
      if (d < bestD) { bestD = d; best = c }
    }
    return best
  }

  private harvestToCarry(ci: CollectItem): Node | null {
    // 模拟 CollectItem 的携带克隆
    const clone: Node = ci.carryPrefab ? instantiate(ci.carryPrefab) : instantiate(ci.node)
    clone.setWorldPosition(ci.node.worldPosition.clone())
    const comps = clone.getComponentsInChildren(CollectItem)
    for (const c of comps) { c.enabled = false; c.destroy() }
    ci.node.active = false
    ci.scheduleOnce(() => { if (ci.node && ci.node.isValid) ci.node.active = true }, ci.respawnSec)
    return clone
  }

  private distanceXZ(a: Vec3, b: Vec3): number {
    return Math.hypot(a.x - b.x, a.z - b.z)
  }

  private isInsideAreaXZ(areaNode: Node): boolean {
    const col = areaNode.getComponent(Collider) || areaNode.getComponentInChildren(Collider)
    const bc = col instanceof BoxCollider ? col : null
    if (!bc) return false
    const inv = new Mat4()
    Mat4.invert(inv, areaNode.worldMatrix)
    const lp = new Vec3()
    Vec3.transformMat4(lp, this.node.worldPosition, inv)
    const dx = lp.x - bc.center.x
    const dz = lp.z - bc.center.z
    const hx = bc.size.x * 0.5
    const hz = bc.size.z * 0.5
    return Math.abs(dx) <= hx && Math.abs(dz) <= hz
  }

  private carryCount(): number {
    if (this.role === 'harvester') return this.flowerStack?.count() ?? 0
    return this.breadStack?.count() ?? 0
  }

  private breadCount(): number {
    return this.breadStack?.count() ?? 0
  }

  private findFactory(): Factory | null {
    const s = this.node.scene
    if (!s) return null
    const list = s.getComponentsInChildren(Factory)
    return list.length > 0 ? list[0] : null
  }

  private findMarket(): Market | null {
    const s = this.node.scene
    if (!s) return null
    const list = s.getComponentsInChildren(Market)
    return list.length > 0 ? list[0] : null
  }

  private autoMapClips() {
    const arrSa: any[] = (this.sa && (this.sa as any).clips) ? ((this.sa as any).clips as any[]) : []
    const arrAnim: any[] = (this.anim && (this.anim as any).clips) ? (((this.anim as any).clips as any[]) || []) : []
    const names: string[] = []
    for (const c of arrSa) {
      const n = (c as any).name as string
      if (n) names.push(n.endsWith('.animation') ? n.substring(0, n.length - '.animation'.length) : n)
    }
    for (const c of arrAnim) {
      const n = (c as any).name as string
      if (n) names.push(n.endsWith('.animation') ? n.substring(0, n.length - '.animation'.length) : n)
    }
    const map: Record<string, string> = {}
    if (names.indexOf('move') >= 0) map['run'] = 'move'
    if (names.indexOf('carry_move') >= 0) map['carry_run'] = 'carry_move'
    if (names.indexOf('clipper_move') >= 0) map['scissors_run'] = 'clipper_move'
    if (Object.keys(map).length > 0) this.machine?.setClipMap(map)
  }

  private pickBestAnimation(): Animation | null {
    const list = this.node.getComponentsInChildren(Animation)
    if (!list || list.length === 0) return this.node.getComponent(Animation) || null
    let best: Animation | null = null
    let bestScore = -1
    for (const a of list) {
      const clips = ((a as any).clips as any[]) || []
      const names: string[] = []
      for (const c of clips) {
        const n = (c as any).name as string
        if (n) names.push(n.endsWith('.animation') ? n.substring(0, n.length - '.animation'.length) : n)
      }
      let score = 0
      if (names.indexOf('move') >= 0) score += 1
      if (names.indexOf('carry_move') >= 0) score += 2
      if (names.indexOf('carry_idle') >= 0) score += 2
      if (names.indexOf('clipper_move') >= 0) score += 2
      if (score > bestScore) { bestScore = score; best = a }
    }
    return best || list[0]
  }

  private updateToolVisibility(show: boolean) {
    if (!this.autoToolVisibility) return
    if (this.toolScissors) this.toolScissors.active = !!show
  }
}