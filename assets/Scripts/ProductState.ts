import { _decorator, Component, Material, MeshRenderer, SkinnedMeshRenderer } from 'cc'
const { ccclass, property } = _decorator

@ccclass('ProductState')
export class ProductState extends Component {
  @property({ type: Material }) semiMaterial: Material | null = null
  @property({ type: Material }) finalMaterial: Material | null = null

  private state: 'semi' | 'final' | null = null

  setSemi() {
    if (!this.semiMaterial) return
    this.applyMaterial(this.semiMaterial)
    this.state = 'semi'
  }

  setFinal() {
    if (!this.finalMaterial) return
    this.applyMaterial(this.finalMaterial)
    this.state = 'final'
  }

  setState(s: 'semi' | 'final') {
    if (s === 'semi') this.setSemi()
    else this.setFinal()
  }

  getState(): 'semi' | 'final' | null {
    return this.state
  }

  private applyMaterial(mat: Material) {
    const mrs = this.node.getComponentsInChildren(MeshRenderer)
    for (const r of mrs) {
      const count = (r.materials?.length) ?? 1
      for (let i = 0; i < count; i++) r.setSharedMaterial(mat, i)
    }
    const srs = this.node.getComponentsInChildren(SkinnedMeshRenderer)
    for (const r of srs) {
      const count = (r.materials?.length) ?? 1
      for (let i = 0; i < count; i++) r.setSharedMaterial(mat, i)
    }
  }
}