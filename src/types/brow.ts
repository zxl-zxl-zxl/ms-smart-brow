export type BrowTemplateId = 'natural' | 'standard' | 'straight' | 'arched'

export interface BrowTemplate {
  id: BrowTemplateId
  name: string
  description: string
}

export interface OverlayAdjustments {
  offsetX: number
  offsetY: number
  scale: number
  rotation: number
  opacity: number
}
