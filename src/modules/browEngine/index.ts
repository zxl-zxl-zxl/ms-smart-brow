import type { BrowTemplateId } from '../../types/brow'
import type { FaceAnalysisResult } from '../../types/face'
import type { BrowGuide, OverlayData, OverlayLandmarkPoint, OverlayLine, OverlayPoint, OverlayViewport } from '../../types/overlay'

const FALLBACK_OVERLAY_WIDTH = 375
const FALLBACK_OVERLAY_HEIGHT = 667

const templateParams: Record<
  BrowTemplateId,
  {
    peakRatio: number
    arch: number
    thickness: number
    angle: number
    tailLift: number
  }
> = {
  natural: {
    peakRatio: 0.58,
    arch: 0.32,
    thickness: 0.16,
    angle: 4,
    tailLift: 0.08,
  },
  standard: {
    peakRatio: 0.62,
    arch: 0.42,
    thickness: 0.17,
    angle: 7,
    tailLift: 0.15,
  },
  straight: {
    peakRatio: 0.56,
    arch: 0.18,
    thickness: 0.14,
    angle: 2,
    tailLift: 0.02,
  },
  arched: {
    peakRatio: 0.6,
    arch: 0.56,
    thickness: 0.18,
    angle: 5,
    tailLift: 0.2,
  },
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getCameraCoverTransform(analysis: FaceAnalysisResult, viewport: OverlayViewport): {
  scale: number
  offsetX: number
  offsetY: number
} {
  const scale = Math.max(viewport.width / analysis.frameWidth, viewport.height / analysis.frameHeight)
  const renderedWidth = analysis.frameWidth * scale
  const renderedHeight = analysis.frameHeight * scale

  return {
    scale,
    offsetX: (viewport.width - renderedWidth) / 2,
    offsetY: (viewport.height - renderedHeight) / 2,
  }
}

function mapPointToViewport(point: OverlayPoint, transform: { scale: number; offsetX: number; offsetY: number }): OverlayPoint {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY,
  }
}

function getLandmarkPoints(analysis: FaceAnalysisResult, viewport: OverlayViewport): OverlayLandmarkPoint[] {
  const transform = getCameraCoverTransform(analysis, viewport)

  return analysis.points.map((point, index) => ({
    ...mapPointToViewport(point, transform),
    id: `landmark-${index}`,
    index,
  }))
}

function getPointBounds(points: OverlayPoint[]): {
  x: number
  y: number
  width: number
  height: number
} | null {
  if (points.length === 0) {
    return null
  }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function cross(origin: OverlayPoint, a: OverlayPoint, b: OverlayPoint): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
}

function getConvexHull(points: OverlayPoint[]): OverlayPoint[] {
  if (points.length <= 3) {
    return points
  }

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  const lower: OverlayPoint[] = []
  const upper: OverlayPoint[] = []

  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop()
    }
    lower.push(point)
  })

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop()
    }
    upper.push(point)
  }

  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

function getFaceContourLines(points: OverlayPoint[]): OverlayLine[] {
  const bounds = getPointBounds(points)

  if (!bounds) {
    return []
  }

  const hull = getConvexHull(points).filter((point) => point.y >= bounds.y + bounds.height * 0.28)
  const centerX = bounds.x + bounds.width / 2
  const orderedHull = hull.sort((a, b) => {
    const angleA = Math.atan2(a.y - bounds.y - bounds.height / 2, a.x - centerX)
    const angleB = Math.atan2(b.y - bounds.y - bounds.height / 2, b.x - centerX)

    return angleA - angleB
  })

  return orderedHull.slice(0, -1).map((point, index) => {
    const nextPoint = orderedHull[index + 1]

    return {
      id: `face-contour-${index}`,
      x1: point.x,
      y1: point.y,
      x2: nextPoint.x,
      y2: nextPoint.y,
      kind: 'subtle',
    }
  })
}

function getMappedFaceBox(
  analysis: FaceAnalysisResult,
  viewport: OverlayViewport,
  landmarkPoints: OverlayLandmarkPoint[]
): {
  x: number
  y: number
  width: number
  height: number
} {
  const landmarkBounds = getPointBounds(landmarkPoints)
  if (landmarkBounds) {
    const width = clamp(landmarkBounds.width * 1.08, viewport.width * 0.28, viewport.width * 0.96)
    const height = clamp(landmarkBounds.height * 1.12, viewport.height * 0.22, viewport.height * 0.9)
    const centerX = landmarkBounds.x + landmarkBounds.width / 2
    const centerY = landmarkBounds.y + landmarkBounds.height / 2

    return {
      x: clamp(centerX - width / 2, 0, viewport.width - width),
      y: clamp(centerY - height / 2, 0, viewport.height - height),
      width,
      height,
    }
  }

  const rect = analysis.rect

  if (!rect) {
    return {
      x: viewport.width * 0.18,
      y: viewport.height * 0.18,
      width: viewport.width * 0.64,
      height: viewport.height * 0.52,
    }
  }

  const transform = getCameraCoverTransform(analysis, viewport)
  const rawX = rect.x * transform.scale + transform.offsetX
  const rawY = rect.y * transform.scale + transform.offsetY
  const rawWidth = rect.width * transform.scale
  const rawHeight = rect.height * transform.scale
  const width = clamp(rawWidth * 1.04, viewport.width * 0.3, viewport.width * 0.96)
  const height = clamp(rawHeight * 1.06, viewport.height * 0.24, viewport.height * 0.92)
  const centerX = rawX + rawWidth / 2
  const centerY = rawY + rawHeight / 2
  const x = clamp(centerX - width / 2, 0, viewport.width - width)
  const y = clamp(centerY - height / 2, 0, viewport.height - height)

  return {
    x,
    y,
    width,
    height,
  }
}

function createBrowGuide(
  side: 'left' | 'right',
  templateId: BrowTemplateId,
  x: number,
  y: number,
  width: number,
  faceRatio: number
): BrowGuide {
  const params = templateParams[templateId]
  const height = width * (params.thickness + params.arch * 0.18)
  const rotationBase = params.angle + clamp((faceRatio - 1.34) * 8, -2.5, 3.5)
  const rotation = side === 'left' ? -rotationBase : rotationBase
  const peakY = height * (0.52 - params.arch * 0.34)
  const endY = height * (0.5 - params.tailLift)

  return {
    side,
    templateId,
    x,
    y,
    width,
    height,
    rotation,
    peakRatio: params.peakRatio,
    tailLift: params.tailLift,
    keyPoints: {
      start: { x: 0, y: height * 0.58 },
      peak: { x: width * params.peakRatio, y: peakY },
      end: { x: width, y: endY },
    },
  }
}

function getBrowGuideFromLandmarks(
  side: 'left' | 'right',
  templateId: BrowTemplateId,
  landmarkPoints: OverlayLandmarkPoint[],
  faceBox: { x: number; y: number; width: number; height: number },
  faceRatio: number
): BrowGuide | null {
  const centerX = faceBox.x + faceBox.width / 2
  const sideMinX = side === 'left' ? faceBox.x + faceBox.width * 0.08 : centerX + faceBox.width * 0.04
  const sideMaxX = side === 'left' ? centerX - faceBox.width * 0.04 : faceBox.x + faceBox.width * 0.92
  const upperMinY = faceBox.y + faceBox.height * 0.04
  const upperMaxY = faceBox.y + faceBox.height * 0.36
  const candidates = landmarkPoints.filter((point) => {
    return point.x >= sideMinX && point.x <= sideMaxX && point.y >= upperMinY && point.y <= upperMaxY
  })

  if (candidates.length < 4) {
    return null
  }

  const sortedByY = [...candidates].sort((a, b) => a.y - b.y)
  const yCutoff = sortedByY[Math.min(sortedByY.length - 1, Math.max(3, Math.floor(sortedByY.length * 0.42)))].y
  const browPoints = candidates.filter((point) => point.y <= yCutoff)
  const bounds = getPointBounds(browPoints)

  if (!bounds || bounds.width < 18) {
    return null
  }

  const params = templateParams[templateId]
  const paddingX = clamp(bounds.width * 0.08, 3, 8)
  const width = clamp(bounds.width + paddingX * 2, 42, Math.min(104, faceBox.width * 0.42))
  const height = clamp(width * (params.thickness + params.arch * 0.12), 10, 25)
  const x = clamp(bounds.x - paddingX, faceBox.x, faceBox.x + faceBox.width - width)
  const y = clamp(bounds.y - height * 0.16, faceBox.y, faceBox.y + faceBox.height * 0.42)
  const sortedByX = [...browPoints].sort((a, b) => a.x - b.x)
  const firstPoint = sortedByX[0]
  const lastPoint = sortedByX[sortedByX.length - 1]
  const peakPoint = browPoints.reduce((current, point) => (point.y < current.y ? point : current), browPoints[0])
  const templateRotation = params.angle + clamp((faceRatio - 1.34) * 8, -2.5, 3.5)
  const landmarkRotation = Math.atan2(lastPoint.y - firstPoint.y, lastPoint.x - firstPoint.x) * (180 / Math.PI)
  const rotation = clamp(landmarkRotation, -14, 14) + (side === 'left' ? -params.tailLift * 4 : params.tailLift * 4)

  return {
    side,
    templateId,
    x,
    y,
    width,
    height,
    rotation: Number.isFinite(rotation) ? rotation : side === 'left' ? -templateRotation : templateRotation,
    peakRatio: clamp((peakPoint.x - x) / width, 0.42, 0.72),
    tailLift: params.tailLift,
    keyPoints: {
      start: {
        x: clamp(firstPoint.x - x, 0, width),
        y: clamp(firstPoint.y - y, 0, height),
      },
      peak: {
        x: clamp(peakPoint.x - x, 0, width),
        y: clamp(peakPoint.y - y, 0, height),
      },
      end: {
        x: clamp(lastPoint.x - x, 0, width),
        y: clamp(lastPoint.y - y, 0, height),
      },
    },
  }
}

export function generateOverlayData(
  analysis: FaceAnalysisResult,
  templateId: BrowTemplateId,
  viewport: OverlayViewport = { width: FALLBACK_OVERLAY_WIDTH, height: FALLBACK_OVERLAY_HEIGHT }
): OverlayData {
  const faceRatio = clamp(analysis.metrics?.faceRatio ?? 1.34, 1.08, 1.72)
  const landmarkPoints = getLandmarkPoints(analysis, viewport)
  const faceContourLines = getFaceContourLines(landmarkPoints)
  const mappedFaceBox = getMappedFaceBox(analysis, viewport, landmarkPoints)
  const faceWidth = mappedFaceBox.width
  const faceHeight = mappedFaceBox.height
  const faceX = mappedFaceBox.x
  const faceY = mappedFaceBox.y
  const centerX = faceX + faceWidth / 2
  const eyeY = faceY + faceHeight * 0.4
  const browY = eyeY - faceHeight * 0.13
  const browWidth = clamp(faceWidth * (faceRatio > 1.45 ? 0.34 : 0.31), 58, 76)
  const browGap = clamp(faceWidth * 0.16, 26, 36)
  const browAreaHeight = clamp(faceHeight * 0.12, 28, 38)
  const eyeWidth = clamp(faceWidth * 0.2, 34, 46)
  const eyeHeight = clamp(faceHeight * 0.045, 10, 15)
  const noseTop = faceY + faceHeight * 0.41
  const noseBottom = faceY + faceHeight * 0.67

  const lines: OverlayLine[] = [
    {
      id: 'face-center',
      x1: centerX,
      y1: faceY + faceHeight * 0.08,
      x2: centerX,
      y2: faceY + faceHeight * 0.9,
      kind: 'primary',
    },
    {
      id: 'eye-level',
      x1: faceX + faceWidth * 0.16,
      y1: eyeY,
      x2: faceX + faceWidth * 0.84,
      y2: eyeY,
      kind: 'primary',
    },
    {
      id: 'nose-bridge',
      x1: centerX,
      y1: noseTop,
      x2: centerX,
      y2: noseBottom,
      kind: 'subtle',
    },
  ]

  const leftBrowX = centerX - browGap / 2 - browWidth
  const rightBrowX = centerX + browGap / 2
  const leftEyeX = centerX - browGap / 2 - eyeWidth * 0.92
  const rightEyeX = centerX + browGap / 2 - eyeWidth * 0.08
  const leftBrowGuide =
    getBrowGuideFromLandmarks('left', templateId, landmarkPoints, mappedFaceBox, faceRatio) ??
    createBrowGuide('left', templateId, leftBrowX, browY, browWidth, faceRatio)
  const rightBrowGuide =
    getBrowGuideFromLandmarks('right', templateId, landmarkPoints, mappedFaceBox, faceRatio) ??
    createBrowGuide('right', templateId, rightBrowX, browY, browWidth, faceRatio)

  return {
    width: viewport.width,
    height: viewport.height,
    templateId,
    faceOutline: {
      id: 'face-outline',
      x: faceX,
      y: faceY,
      width: faceWidth,
      height: faceHeight,
    },
    faceContourLines,
    eyeGuides: [
      {
        id: 'left-eye',
        x: leftEyeX,
        y: eyeY - eyeHeight / 2,
        width: eyeWidth,
        height: eyeHeight,
      },
      {
        id: 'right-eye',
        x: rightEyeX,
        y: eyeY - eyeHeight / 2,
        width: eyeWidth,
        height: eyeHeight,
      },
    ],
    browAreaGuides: [
      {
        id: 'left-brow-area',
        x: leftBrowX - 8,
        y: browY - browAreaHeight * 0.28,
        width: browWidth + 16,
        height: browAreaHeight,
      },
      {
        id: 'right-brow-area',
        x: rightBrowX - 8,
        y: browY - browAreaHeight * 0.28,
        width: browWidth + 16,
        height: browAreaHeight,
      },
    ],
    lines,
    landmarkPoints,
    browGuides: [leftBrowGuide, rightBrowGuide],
  }
}
