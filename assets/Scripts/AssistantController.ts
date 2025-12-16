import { _decorator, Component, Node, Vec3, Prefab, instantiate, Quat, Animation, SkeletalAnimation, Collider, BoxCollider, Mat4 } from 'cc'
import { Factory } from './Factory'
import { Market } from './Market'
import { CollectItem } from './CollectItem'
import { ActionStateMachine } from './ActionStateMachine'
const { ccclass, property } = _decorator

@ccclass('AssistantController')
export class AssistantController extends Component {
  @property({ tooltip: '助手角色：harvester 或 seller' }) role: 'harvester' | 'seller' = 'harvester'
  @property({ tooltip: '移动速度（单位/秒）' }) speed: number = 3
  @property({ min: 0, tooltip: '最大携带数量' }) capacity: number = 10
  @property({ type: Factory, tooltip: '工厂引用' }) factory: Factory | null = null
  @property({ type: Market, tooltip: '市场引用' }) market: Market | null = null
  @property({ type: Animation, tooltip: '角色动画（idle/run）' }) anim: Animation | null = null
  @property({ min: 0.1, tooltip: '收割速率（件/秒）' }) harvestRate: number = 1.5
  @property({ min: 0.1, tooltip: '投递速率（件/秒）' }) deliverRate: number = 2

  private target: Vec3 | null = null
  private carry: Node[] = []
  private accHarvest = 0
  private accDeliver = 0
  private sa: SkeletalAnimation | null = null
  private machine: ActionStateMachine | null = null

  onLoad() {
    this.sa = this.node.getComponent(SkeletalAnimation) || this.node.getComponentInChildren(SkeletalAnimation)
    if (!this.anim) this.anim = this.node.getComponent(Animation) || this.node.getComponentInChildren(Animation)
    this.machine = new ActionStateMachine(this.sa, this.anim, 0.001)
  }

  update(dt: number) {
    if (this.role === 'harvester') this.tickHarvester(dt)
    else this.tickSeller(dt)
    const moving = !!this.target && this.distanceXZ(this.node.worldPosition, this.target) > 0.2
    const carrying = this.carry.length > 0
    const next = moving ? (carrying ? 'carry_run' : 'run') : (carrying ? 'carry_idle' : 'idle')
    this.machine?.play(next)
    this.stepMove(dt)
  }

  private tickHarvester(dt: number) {
    // 满载时选择上传；否则寻找最近采集物
    if (this.carry.length >= this.capacity) {
      if (this.factory?.uploadArea) this.target = this.factory.uploadArea.worldPosition.clone()
    }
    if (this.carry.length < this.capacity) {
      const item = this.findNearestCollectItem()
      if (item) {
        this.target = item.node.worldPosition.clone()
        this.accHarvest += dt
        const need = 1 / this.harvestRate
        if (this.distanceXZ(this.node.worldPosition, item.node.worldPosition) < 2 && this.accHarvest >= need) {
          this.accHarvest = 0
          const carry = this.harvestToCarry(item)
          if (carry) this.carry.push(carry)
        }
      }
    }
    // 到达上传区后按速率投递
    if (this.factory?.uploadArea && this.isInsideAreaXZ(this.factory.uploadArea)) {
      this.accDeliver += dt
      const need = 1 / this.deliverRate
      if (this.accDeliver >= need && this.carry.length > 0) {
        this.accDeliver = 0
        const moved = this.factory.acceptFlower(this.carry.length)
        for (let i = 0; i < moved; i++) this.carry.shift()?.destroy()
        if (moved <= 0) this.target = null
      }
    }
    // 没目标时待机
    if (!this.target && this.carry.length === 0) this.machine?.play('idle')
  }

  private tickSeller(dt: number) {
    if (this.carry.length < this.capacity && this.factory?.pickupArea) {
      this.target = this.factory!.pickupArea!.worldPosition.clone()
      if (this.isInsideAreaXZ(this.factory.pickupArea)) {
        this.accHarvest += dt
        const need = 1 / this.harvestRate
        if (this.accHarvest >= need) {
          this.accHarvest = 0
          const breads = this.factory.takeBread(Math.max(1, this.capacity - this.carry.length))
          for (const b of breads) this.carry.push(b)
        }
      }
    } else if (this.market?.sellArea) {
      this.target = this.market.sellArea.worldPosition.clone()
      if (this.isInsideAreaXZ(this.market.sellArea)) {
        this.accDeliver += dt
        const need = 1 / this.deliverRate
        if (this.accDeliver >= need && this.carry.length > 0) {
          this.accDeliver = 0
          const count = this.carry.length
          this.market.spawnCoinsFor(count)
          for (let i = 0; i < count; i++) this.carry.shift()?.destroy()
          if (this.carry.length === 0) this.target = null
        }
      }
    }
    if (!this.target && this.carry.length === 0) this.machine?.play('idle')
  }

  private stepMove(dt: number) {
    if (!this.target) return
    const p = this.node.worldPosition
    const dir = new Vec3(this.target.x - p.x, 0, this.target.z - p.z)
    const len = Math.hypot(dir.x, dir.z)
    if (len < 0.001) return
    dir.x /= len; dir.z /= len
    const step = this.speed * dt
    const nx = p.x + dir.x * step
    const nz = p.z - dir.z * step
    this.node.setWorldPosition(nx, p.y, nz)
    const yaw = Math.atan2(dir.x, -dir.z) * 180 / Math.PI
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
}