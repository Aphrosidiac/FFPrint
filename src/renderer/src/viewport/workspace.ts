// Shared UI state of the Prepare workspace (current tool, lay-flat pick mode) and the camera bridge the
// mounted viewport registers. All scene actions live in ./actions.ts.

import { reactive } from 'vue'

export type Tool = 'move' | 'rotate' | 'scale'
export type View = 'iso' | 'top' | 'front' | 'left' | 'right'
export type CameraView = View | 'fit' | 'fit-selection'

export const ws = reactive({
  tool: 'move' as Tool,
  /** "Lay on face" pick mode: the next click on a face lays it on the bed */
  layFlat: false
})

/** Camera actions, registered by the mounted viewport (no-ops while it is not mounted). */
export const viewBridge = {
  setView: (_v: View): void => {},
  /** fits the selection, or the whole plate when nothing is selected */
  fit: (): void => {},
  /** fits the whole plate and every visible part */
  fitAll: (): void => {},
  requestRender: (): void => {}
}
