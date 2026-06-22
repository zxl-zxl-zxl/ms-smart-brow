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
    peakRatio: 0.62,
    arch: 0.16,
    thickness: 0.1,
    angle: 2,
    tailLift: 0.05,
  },
  standard: {
    peakRatio: 0.64,
    arch: 0.24,
    thickness: 0.11,
    angle: 3,
    tailLift: 0.08,
  },
  straight: {
    peakRatio: 0.6,
    arch: 0.08,
    thickness: 0.09,
    angle: 1,
    tailLift: 0,
  },
  arched: {
    peakRatio: 0.64,
    arch: 0.34,
    thickness: 0.11,
    angle: 3,
    tailLift: 0.1,
  },
}

const browLandmarkIndexMap: Record<'left' | 'right', number[]> = {
  left: [33, 34, 35, 36, 37, 64, 65, 66, 67],
  right: [38, 39, 40, 41, 42, 68, 69, 70, 71],
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
  const height = clamp(width * (params.thickness + params.arch * 0.08), 9, 22)
  const rotationBase = params.angle + clamp((faceRatio - 1.34) * 8, -2.5, 3.5)
  const rotation = side === 'left' ? -rotationBase : rotationBase
  const startY = height * 0.52
  const peakY = height * (0.48 - params.arch * 0.22)
  const endY = height * (0.5 - params.tailLift)
  const thickness = clamp(height * 0.46, 4, 8)
  const start = { x: 0, y: startY }
  const peak = { x: width * params.peakRatio, y: peakY }
  const end = { x: width, y: endY }

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
      start,
      peak,
      end,
    },
    upperPath: [start, peak, end],
    lowerPath: [
      { x: start.x + width * 0.04, y: start.y + thickness },
      { x: peak.x, y: peak.y + thickness * 0.9 },
      { x: end.x - width * 0.04, y: end.y + thickness },
    ],
  }
}

function getBrowGuideFromIndexedLandmarks(
  side: 'left' | 'right',
  templateId: BrowTemplateId,
  landmarkPoints: OverlayLandmarkPoint[],
  faceBox: { x: number; y: number; width: number; height: number },
  faceRatio: number
): BrowGuide | null {
  const browPoints = browLandmarkIndexMap[side]
    .map((index) => landmarkPoints[index])
    .filter((point): point is OverlayLandmarkPoint => Boolean(point))
  const bounds = getPointBounds(browPoints)

  if (browPoints.length < 6 || !bounds || bounds.width < 18) {
    return null
  }

  const params = templateParams[templateId]
  const paddingX = clamp(bounds.width * 0.08, 3, 8)
  const width = clamp(bounds.width + paddingX * 2, 42, Math.min(104, faceBox.width * 0.42))
  const height = clamp(bounds.height * 1.12 + width * params.thickness * 0.2, 13, 28)
  const x = clamp(bounds.x - paddingX, faceBox.x, faceBox.x + faceBox.width - width)
  const y = clamp(bounds.y - height * 0.08, faceBox.y, faceBox.y + faceBox.height * 0.42)
  const sortedByX = [...browPoints].sort((a, b) => a.x - b.x)
  const firstPoint = sortedByX[0]
  const lastPoint = sortedByX[sortedByX.length - 1]
  const peakPoint = browPoints.reduce((current, point) => (point.y < current.y ? point : current), browPoints[0])
  const templateRotation = params.angle + clamp((faceRatio - 1.34) * 8, -2.5, 3.5)
  const landmarkRotation = Math.atan2(lastPoint.y - firstPoint.y, lastPoint.x - firstPoint.x) * (180 / Math.PI)
  const baseRotation = side === 'left' ? -templateRotation : templateRotation
  const rotation =
    templateId === 'natural'
      ? clamp(baseRotation * 0.42 + clamp(landmarkRotation, -8, 8) * 0.58, -7, 7)
      : clamp(landmarkRotation, -14, 14) + (side === 'left' ? -params.tailLift * 4 : params.tailLift * 4)
  const start = {
    x: clamp(firstPoint.x - x, 0, width),
    y: clamp(firstPoint.y - y, 0, height),
  }
  const peak = {
    x: clamp(peakPoint.x - x, width * 0.42, width * 0.72),
    y: clamp(peakPoint.y - y - height * params.arch * 0.08, 0, height * 0.7),
  }
  const end = {
    x: clamp(lastPoint.x - x, 0, width),
    y: clamp(lastPoint.y - y - height * params.tailLift * 0.2, 0, height),
  }
  const thickness = clamp(height * 0.62, 7, 14)

  return {
    side,
    templateId,
    x,
    y,
    width,
    height,
    rotation: Number.isFinite(rotation) ? rotation : baseRotation,
    peakRatio: clamp(peak.x / width, 0.42, 0.72),
    tailLift: params.tailLift,
    keyPoints: {
      start,
      peak,
      end,
    },
    upperPath: [start, peak, end],
    lowerPath: [
      { x: start.x + width * 0.04, y: start.y + thickness },
      { x: peak.x, y: peak.y + thickness * 0.9 },
      { x: end.x - width * 0.04, y: end.y + thickness },
    ],
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
  const height = clamp(bounds.height * 0.95 + width * params.thickness * 0.35, 13, 30)
  const x = clamp(bounds.x - paddingX, faceBox.x, faceBox.x + faceBox.width - width)
  const y = clamp(bounds.y - height * 0.12, faceBox.y, faceBox.y + faceBox.height * 0.42)
  const sortedByX = [...browPoints].sort((a, b) => a.x - b.x)
  const firstPoint = sortedByX[0]
  const lastPoint = sortedByX[sortedByX.length - 1]
  const peakPoint = browPoints.reduce((current, point) => (point.y < current.y ? point : current), browPoints[0])
  const templateRotation = params.angle + clamp((faceRatio - 1.34) * 8, -2.5, 3.5)
  const landmarkRotation = Math.atan2(lastPoint.y - firstPoint.y, lastPoint.x - firstPoint.x) * (180 / Math.PI)
  const baseRotation = side === 'left' ? -templateRotation : templateRotation
  const rotation =
    templateId === 'natural'
      ? clamp(baseRotation * 0.72 + clamp(landmarkRotation, -10, 10) * 0.28, -8, 8)
      : clamp(landmarkRotation, -14, 14) + (side === 'left' ? -params.tailLift * 4 : params.tailLift * 4)
  const start = {
    x: clamp(firstPoint.x - x, 0, width),
    y: clamp(firstPoint.y - y, 0, height),
  }
  const peak = {
    x: clamp(peakPoint.x - x, width * 0.42, width * 0.72),
    y: clamp(peakPoint.y - y - height * params.arch * 0.08, 0, height * 0.7),
  }
  const end = {
    x: clamp(lastPoint.x - x, 0, width),
    y: clamp(lastPoint.y - y - height * params.tailLift * 0.2, 0, height),
  }
  const thickness = clamp(height * 0.62, 7, 14)

  return {
    side,
    templateId,
    x,
    y,
    width,
    height,
    rotation: Number.isFinite(rotation) ? rotation : side === 'left' ? -templateRotation : templateRotation,
    peakRatio: clamp(peak.x / width, 0.42, 0.72),
    tailLift: params.tailLift,
    keyPoints: {
      start,
      peak,
      end,
    },
    upperPath: [start, peak, end],
    lowerPath: [
      { x: start.x + width * 0.04, y: start.y + thickness },
      { x: peak.x, y: peak.y + thickness * 0.9 },
      { x: end.x - width * 0.04, y: end.y + thickness },
    ],
  }
}

function resizeBrowGuide(guide: BrowGuide, width: number, height: number): BrowGuide {
  const scaleX = width / guide.width
  const scaleY = height / guide.height

  return {
    ...guide,
    width,
    height,
    keyPoints: {
      start: { x: guide.keyPoints.start.x * scaleX, y: guide.keyPoints.start.y * scaleY },
      peak: { x: guide.keyPoints.peak.x * scaleX, y: guide.keyPoints.peak.y * scaleY },
      end: { x: guide.keyPoints.end.x * scaleX, y: guide.keyPoints.end.y * scaleY },
    },
    upperPath: guide.upperPath.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
    lowerPath: guide.lowerPath.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
  }
}

function getGuideCenterDistance(guide: BrowGuide, centerX: number): number {
  return Math.abs(guide.x + guide.width / 2 - centerX)
}

function getNaturalGuideScore(
  guide: BrowGuide,
  faceBox: { x: number; y: number; width: number; height: number },
  expected: { width: number; height: number; centerDistance: number; y: number }
): number {
  const centerX = faceBox.x + faceBox.width / 2
  const widthScore = Math.abs(guide.width - expected.width) / expected.width
  const heightScore = Math.abs(guide.height - expected.height) / expected.height
  const distanceScore = Math.abs(getGuideCenterDistance(guide, centerX) - expected.centerDistance) / expected.centerDistance
  const yScore = Math.abs(guide.y - expected.y) / Math.max(1, faceBox.height * 0.08)
  const rotationScore = Math.abs(guide.rotation) / 12

  return widthScore * 1.1 + heightScore * 0.8 + distanceScore * 1.2 + yScore * 1.4 + rotationScore * 0.4
}

function mirrorNaturalBrowPair(
  leftGuide: BrowGuide,
  rightGuide: BrowGuide,
  faceBox: { x: number; y: number; width: number; height: number },
  expected: { width: number; height: number; centerDistance: number; y: number }
): BrowGuide[] {
  const centerX = faceBox.x + faceBox.width / 2
  const source =
    getNaturalGuideScore(leftGuide, faceBox, expected) <= getNaturalGuideScore(rightGuide, faceBox, expected)
      ? leftGuide
      : rightGuide
  const width = clamp(source.width, expected.width * 0.88, Math.min(expected.width * 1.2, faceBox.width * 0.42))
  const height = clamp(source.height, expected.height * 0.9, expected.height * 1.3)
  const outwardOffset = clamp(faceBox.width * 0.026, 5, 10)
  const centerDistance = clamp(
    Math.max(getGuideCenterDistance(source, centerX), expected.centerDistance) + outwardOffset,
    expected.centerDistance * 1.04,
    expected.centerDistance * 1.32
  )
  const verticalLift = clamp(faceBox.height * 0.012, 2, 5)
  const y = clamp(source.y * 0.85 + expected.y * 0.15 - verticalLift, faceBox.y, faceBox.y + faceBox.height * 0.42)
  const rotation = clamp(Math.abs(source.rotation), 1.2, 5.5)
  const sourceGuide = resizeBrowGuide(source, width, height)
  const leftSource = source.side === 'left' ? sourceGuide : resizeBrowGuide(leftGuide, width, height)
  const rightSource = source.side === 'right' ? sourceGuide : resizeBrowGuide(rightGuide, width, height)

  return [
    {
      ...leftSource,
      side: 'left',
      x: clamp(centerX - centerDistance - width / 2, faceBox.x, centerX - width),
      y,
      rotation: -rotation,
    },
    {
      ...rightSource,
      side: 'right',
      x: clamp(centerX + centerDistance - width / 2, centerX, faceBox.x + faceBox.width - width),
      y,
      rotation,
    },
  ]
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
    (templateId === 'natural' ? getBrowGuideFromIndexedLandmarks('left', templateId, landmarkPoints, mappedFaceBox, faceRatio) : null) ??
    getBrowGuideFromLandmarks('left', templateId, landmarkPoints, mappedFaceBox, faceRatio) ??
    createBrowGuide('left', templateId, leftBrowX, browY, browWidth, faceRatio)
  const rightBrowGuide =
    (templateId === 'natural' ? getBrowGuideFromIndexedLandmarks('right', templateId, landmarkPoints, mappedFaceBox, faceRatio) : null) ??
    getBrowGuideFromLandmarks('right', templateId, landmarkPoints, mappedFaceBox, faceRatio) ??
    createBrowGuide('right', templateId, rightBrowX, browY, browWidth, faceRatio)
  const expectedNaturalHeight = clamp(browWidth * (templateParams.natural.thickness + templateParams.natural.arch * 0.08), 13, 24)
  const browGuides =
    templateId === 'natural'
      ? mirrorNaturalBrowPair(leftBrowGuide, rightBrowGuide, mappedFaceBox, {
          width: browWidth,
          height: expectedNaturalHeight,
          centerDistance: browGap / 2 + browWidth / 2,
          y: browY,
        })
      : [leftBrowGuide, rightBrowGuide]

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
    browGuides,
  }
}
