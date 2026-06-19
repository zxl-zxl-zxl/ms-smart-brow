import type { BrowTemplateId } from './brow'

export interface OverlayPoint {
  x: number
  y: number
}

export interface OverlayLine {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  kind: 'primary' | 'subtle'
}

export interface OverlayLandmarkPoint extends OverlayPoint {
  id: string
  index: number
}

export interface OverlayBox {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface BrowGuide {
  side: 'left' | 'right'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  peakRatio: number
  tailLift: number
  templateId: BrowTemplateId
  keyPoints: {
    start: OverlayPoint
    peak: OverlayPoint
    end: OverlayPoint
  }
}

export interface OverlayData {
  width: number
  height: number
  templateId: BrowTemplateId
  faceOutline: OverlayBox
  faceContourLines: OverlayLine[]
  eyeGuides: OverlayBox[]
  browAreaGuides: OverlayBox[]
  lines: OverlayLine[]
  landmarkPoints: OverlayLandmarkPoint[]
  browGuides: BrowGuide[]
}

export interface OverlayViewport {
  width: number
  height: number
}
