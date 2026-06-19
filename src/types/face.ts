import type Taro from '@tarojs/taro'

export interface CameraFrameSnapshot {
  data: ArrayBuffer
  width: number
  height: number
}

export type FaceQualityStatus =
  | 'ok'
  | 'no_face'
  | 'multiple_faces'
  | 'too_close'
  | 'too_far'
  | 'off_center'
  | 'tilted'
  | 'incomplete'

export interface FacePoint {
  x: number
  y: number
}

export interface FaceRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FaceAngles {
  pitch?: number
  yaw?: number
  roll?: number
}

export interface FaceMetrics {
  faceRatio: number
  faceWidthRatio: number
  centerOffsetX: number
  centerOffsetY: number
  normalizedRect: FaceRect
}

export interface FaceAnalysisResult {
  status: FaceQualityStatus
  message: string
  faceCount: number
  pointCount: number
  frameWidth: number
  frameHeight: number
  center?: FacePoint
  rect?: FaceRect
  points: FacePoint[]
  angles?: FaceAngles
  confidence?: number
  metrics?: FaceMetrics
  rawKeys?: string
}

export type FaceDetectFace = Partial<Taro.faceDetect.face>

export type FaceDetectRawResult = Taro.faceDetect.SuccessCallbackOption & {
  faceInfo?: FaceDetectFace | FaceDetectFace[]
}

export type FaceDetectRect = Partial<Taro.faceDetect.detectRect> & {
  width?: number
}
