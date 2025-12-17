import { SkeletalAnimation, Animation, AnimationClip } from 'cc'

export enum Action {
  Idle = 'idle',
  Run = 'run',
  CarryIdle = 'carry_idle',
  CarryRun = 'carry_run',
  ScissorsIdle = 'scissors_idle',
  ScissorsRun = 'scissors_run',
  MowIdle = 'mow_idle',
  MowRun = 'mow_run',
  VacuumIdle = 'vacuum_idle',
  VacuumRun = 'vacuum_run',
  Knead = 'knead',
  Shouyin = 'shouyin'
}

type ClipKey = keyof typeof Action

export class ActionStateMachine {
  private sa: SkeletalAnimation | null
  private anim: Animation | null
  private deadZone: number
  private current: string | null = null
  private map: Record<string, string> = {
    [Action.Idle]: 'idle',
    [Action.Run]: 'run',
    [Action.CarryIdle]: 'carry_idle',
    [Action.CarryRun]: 'carry_run',
    [Action.ScissorsIdle]: 'scissors_idle',
    [Action.ScissorsRun]: 'scissors_run',
    [Action.MowIdle]: 'mow_idle',
    [Action.MowRun]: 'mow_run',
    [Action.VacuumIdle]: 'vacuum_idle',
    [Action.VacuumRun]: 'vacuum_run',
    [Action.Knead]: 'knead',
    [Action.Shouyin]: 'shouyin'
  }

  constructor(sa: SkeletalAnimation | null, anim: Animation | null, deadZone: number) {
    this.sa = sa
    this.anim = anim
    this.deadZone = deadZone
  }

  setTargets(sa: SkeletalAnimation | null, anim: Animation | null) {
    this.sa = sa
    this.anim = anim
  }

  setDeadZone(v: number) { this.deadZone = v }

  setClipMap(map: Record<string, string>) {
    this.map = { ...this.map, ...map }
  }

  decideAction(len: number, breads: number, toolLevel: number, inHarvest: boolean): Action {
    const moving = len >= this.deadZone
    if (inHarvest) {
      if (toolLevel === 1) return moving ? Action.ScissorsRun : Action.ScissorsIdle
      if (toolLevel === 2) return moving ? Action.MowRun : Action.MowIdle
      if (toolLevel === 3) return moving ? Action.VacuumRun : Action.VacuumIdle
      return moving ? Action.Run : Action.Idle
    }
    if (breads > 0) return moving ? Action.CarryRun : Action.CarryIdle
    return moving ? Action.Run : Action.Idle
  }

  decide(len: number, breads: number, toolLevel: number, inHarvest: boolean): string {
    return this.decideAction(len, breads, toolLevel, inHarvest)
  }

  play(name: string): boolean {
    if (name === this.current) return true
    const logical = this.map[name] ?? name
    const saTarget = this.resolveInSa(logical)
    if (saTarget) {
      try { (this.sa as any)?.play(saTarget); this.current = name; return true } catch {}
    }
    const animTarget = this.resolveInAnim(logical)
    if (animTarget) {
      try { this.anim?.play(animTarget); this.current = name; return true } catch {}
    }
    const fbBase = this.fallbackBase(name)
    const fbSa = fbBase ? this.resolveInSa(fbBase) : null
    const fbAnim = fbBase ? this.resolveInAnim(fbBase) : null
    if (fbSa) {
      try { (this.sa as any)?.play(fbSa); this.current = name; return true } catch {}
    }
    if (fbAnim) {
      try { this.anim?.play(fbAnim); this.current = name; return true } catch {}
    }
    const def = this.defaultName()
    if (!def) return false
    if (this.sa) {
      try { (this.sa as any).play(def); this.current = name; return true } catch {}
    }
    try { this.anim?.play(def); this.current = name; return true } catch { return false }
  }

  playAction(action: Action): boolean {
    return this.play(action)
  }

  private fallbackBase(name: string): string | null {
    const base = name.endsWith('_run') ? 'run' : name.endsWith('_idle') ? 'idle' : null
    if (!base) return null
    const logical = this.map[base] ?? base
    return logical
  }

  private resolveInSa(name: string): string | null {
    if (this.sa && (this.sa.clips as any as AnimationClip[])) {
      const arr = this.sa.clips as any as AnimationClip[]
      for (const c of arr) {
        const n = (c as any).name as string
        if (!n) continue
        if (n === name || n === `${name}.animation`) return n
        if (n.endsWith('.animation')) {
          const base = n.substring(0, n.length - '.animation'.length)
          if (base === name) return n
        }
      }
    }
    return null
  }

  private resolveInAnim(name: string): string | null {
    if (this.anim && (this.anim as any).clips) {
      const arr = (this.anim as any).clips as AnimationClip[]
      for (const c of arr) {
        const n = (c as any).name as string
        if (!n) continue
        if (n === name || n === `${name}.animation`) return n
        if (n.endsWith('.animation')) {
          const base = n.substring(0, n.length - '.animation'.length)
          if (base === name) return n
        }
      }
    }
    return null
  }

  private defaultName(): string | null {
    if (this.sa?.defaultClip) return ((this.sa.defaultClip as any).name as string) || null
    if ((this.anim as any)?.defaultClip) return (((this.anim as any).defaultClip as any)?.name as string) || null
    if ((this.anim as any)?.clips && ((this.anim as any).clips as AnimationClip[]).length > 0) {
      const c = ((this.anim as any).clips as AnimationClip[])[0]
      return ((c as any).name as string) || null
    }
    return null
  }
}