import Taro from '@tarojs/taro'
import type {
  CameraFrameSnapshot,
  FaceAnalysisResult,
  FaceDetectFace,
  FaceDetectRawResult,
  FaceDetectRect,
  FacePoint,
  FaceRect,
} from '../../types/face'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function toPoint(point: Partial<Taro.faceDetect.point> | undefined): FacePoint | null {
  if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
    return null
  }

  return { x: point.x, y: point.y }
}

function normalizeRect(rect: FaceDetectRect | undefined): FaceRect | undefined {
  if (!rect || !isFiniteNumber(rect.originX) || !isFiniteNumber(rect.originY) || !isFiniteNumber(rect.height)) {
    return undefined
  }

  const width = rect.width ?? rect.weight
  if (!isFiniteNumber(width)) {
    return undefined
  }

  return {
    x: rect.originX,
    y: rect.originY,
    width,
    height: rect.height,
  }
}

function normalizeFaceDetectResult(result: FaceDetectRawResult): {
  face?: FaceDetectFace
  faceCount: number
  rawKeys: string
} {
  const rawKeys = Object.keys(result).join(', ') || 'none'

  if (Array.isArray(result.faceInfo)) {
    return {
      face: result.faceInfo[0],
      faceCount: result.faceInfo.length,
      rawKeys,
    }
  }

  if (result.faceInfo) {
    return {
      face: result.faceInfo,
      faceCount: 1,
      rawKeys,
    }
  }

  return {
    face: result,
    faceCount: isFiniteNumber(result.x) && isFiniteNumber(result.y) ? 1 : 0,
    rawKeys,
  }
}

function getQualityResult(
  faceCount: number,
  frame: CameraFrameSnapshot,
  center?: FacePoint,
  rect?: FaceRect,
  roll?: number
): Pick<FaceAnalysisResult, 'status' | 'message'> {
  const maxFaceWidthRatio = 1.5
  const minFaceWidthRatio = 0.6

  if (faceCount === 0 || !center || !rect || center.x === -1 || center.y === -1) {
    return { status: 'no_face', message: '未识别人脸，请调整光线或距离后重试' }
  }

  if (faceCount > 1) {
    return { status: 'multiple_faces', message: '请确保画面中只有一张人脸后重试' }
  }

  const faceWidthRatio = rect.width / frame.width
  const centerOffsetX = Math.abs(center.x - frame.width / 2) / frame.width
  const centerOffsetY = Math.abs(center.y - frame.height / 2) / frame.height

  if (faceWidthRatio > maxFaceWidthRatio) {
    return { status: 'too_close', message: '距离太近，请稍微远离镜头后重试' }
  }

  if (faceWidthRatio < minFaceWidthRatio) {
    return { status: 'too_far', message: '距离太远，请靠近镜头后重试' }
  }

  if (centerOffsetX > 0.24 || centerOffsetY > 0.26) {
    return { status: 'off_center', message: '请将脸部移动到画面中央后重试' }
  }

  if (isFiniteNumber(roll) && Math.abs(roll) > 0.28) {
    return { status: 'tilted', message: '请保持正脸，不要明显歪头后重试' }
  }

  return { status: 'ok', message: '识别成功，已生成个性化辅助线' }
}

function detectFaceFromFrame(frame: CameraFrameSnapshot): Promise<FaceDetectRawResult> {
  return new Promise((resolve, reject) => {
    Taro.faceDetect({
      frameBuffer: frame.data,
      width: frame.width,
      height: frame.height,
      enablePoint: true,
      enableConf: true,
      enableAngle: true,
      enableMultiFace: true,
      success: resolve,
      fail: reject,
    })
  })
}

export async function analyzeFaceFrame(frame: CameraFrameSnapshot): Promise<FaceAnalysisResult> {
  const result = await detectFaceFromFrame(frame)
  const normalized = normalizeFaceDetectResult(result)
  const face = normalized.face
  const center = toPoint(face)
  const rect = normalizeRect(face?.detectRect as FaceDetectRect | undefined)
  const points = face?.pointArray?.map(toPoint).filter((point): point is FacePoint => Boolean(point)) ?? []
  const confidence = face?.confArray?.[0]?.global
  const angle = face?.angleArray?.[0]
  const quality = getQualityResult(normalized.faceCount, frame, center ?? undefined, rect, angle?.roll)

  return {
    ...quality,
    faceCount: normalized.faceCount,
    pointCount: points.length,
    frameWidth: frame.width,
    frameHeight: frame.height,
    center: center ?? undefined,
    rect,
    points,
    angles: angle
      ? {
          pitch: angle.pitch,
          yaw: angle.yaw,
          roll: angle.roll,
        }
      : undefined,
    confidence: isFiniteNumber(confidence) ? confidence : undefined,
    metrics:
      center && rect
        ? {
            faceRatio: rect.height / rect.width,
            faceWidthRatio: rect.width / frame.width,
            centerOffsetX: (center.x - frame.width / 2) / frame.width,
            centerOffsetY: (center.y - frame.height / 2) / frame.height,
            normalizedRect: {
              x: rect.x / frame.width,
              y: rect.y / frame.height,
              width: rect.width / frame.width,
              height: rect.height / frame.height,
            },
          }
        : undefined,
    rawKeys: normalized.rawKeys,
  }
}
