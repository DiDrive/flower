import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('FocusTarget')
export class FocusTarget extends Component {
  @property({ type: Node }) focusNode: Node | null = null;
  @property enableOnAppear: boolean = false;
  @property enableOnUnlock: boolean = true;
  @property useAppearFocusNode: boolean = false;
  @property stopAfterRowsOnUnlock: boolean = false;
  @property({ min: 0 }) moveSec: number = 1;
  @property({ min: 0 }) holdSec: number = 0.6;
}