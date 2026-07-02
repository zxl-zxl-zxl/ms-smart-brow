import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { View, Text, Button, Camera, Slider, Image, Canvas, Switch } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { browTemplates } from '../../config/browTemplates'
import type { BrowTemplateId } from '../../types/brow'
import type { OverlayAdjustments } from '../../types/brow'
import type { CameraFrameSnapshot, FaceAnalysisResult } from '../../types/face'
import type { BrowGuide, OverlayBox, OverlayLandmarkPoint, OverlayLine, OverlayViewport } from '../../types/overlay'
import { analyzeFaceFrame } from '../../modules/faceAnalyzer'
import { generateOverlayData } from '../../modules/browEngine'
import { recommendBrowTemplate, type BrowRecommendation } from '../../modules/recommendation'
import browNormal from '../../assets/brow-normal.webp'
import browStandard from '../../assets/brow-standard.webp'
import browFlat from '../../assets/brow-flat.webp'
import browBend from '../../assets/brow-bend.webp'
import normalTemplate from '../../assets/normal.png'
import standardTemplate from '../../assets/standard.png'
import flatTemplate from '../../assets/flat.png'
import bendTemplate from '../../assets/bend.png'
import './index.scss'

const browCanvasId = 'brow-overlay-canvas'
// 实时辅助默认开关：关闭后定标完成不会继续周期检测，也不会执行跟随或自动定标。
const defaultRealtimeAssistEnabled = true
const trackingIntervalMs = 420
const trackingSmoothing = 0.28
const trackingDeadZonePx = 2.5
const trackingScaleDeadZone = 0.015
const trackingRotationDeadZone = 0.8
const maxTrackingTranslateRatio = 0.18
const maxTrackingScaleDelta = 0.35
const maxTrackingRotation = 8
const autoCalibrationScaleThreshold = 0.035
const autoCalibrationTranslateThresholdRatio = 0.025
const autoCalibrationStableFrames = 2
const autoCalibrationCooldownMs = 1400

const defaultAdjustments: OverlayAdjustments = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
  opacity: 0.8,
}

const browPreviewMap: Record<BrowTemplateId, string> = {
  natural: browNormal,
  standard: browStandard,
  straight: browFlat,
  arched: browBend,
}

const browTemplateAssetMap: Record<BrowTemplateId, string> = {
  natural: normalTemplate,
  standard: standardTemplate,
  straight: flatTemplate,
  arched: bendTemplate,
}

const browTemplateImageConfig: Record<
  BrowTemplateId,
  {
    imageWidth: number
    imageHeight: number
    contentX: number
    contentY: number
    contentWidth: number
    contentHeight: number
    widthScale: number
    heightScale: number
    minVisibleHeight: number
    maxVisibleHeight: number
  }
> = {
  natural: {
    imageWidth: 212,
    imageHeight: 112,
    contentX: 25,
    contentY: 31,
    contentWidth: 167,
    contentHeight: 46,
    widthScale: 1.14,
    heightScale: 1.18,
    minVisibleHeight: 16,
    maxVisibleHeight: 34,
  },
  standard: {
    imageWidth: 212,
    imageHeight: 112,
    contentX: 27,
    contentY: 27,
    contentWidth: 162,
    contentHeight: 51,
    widthScale: 1.16,
    heightScale: 1.18,
    minVisibleHeight: 17,
    maxVisibleHeight: 36,
  },
  straight: {
    imageWidth: 212,
    imageHeight: 112,
    contentX: 23,
    contentY: 31,
    contentWidth: 166,
    contentHeight: 41,
    widthScale: 1.15,
    heightScale: 1.08,
    minVisibleHeight: 14,
    maxVisibleHeight: 30,
  },
  arched: {
    imageWidth: 212,
    imageHeight: 112,
    contentX: 31,
    contentY: 35,
    contentWidth: 156,
    contentHeight: 43,
    widthScale: 1.14,
    heightScale: 1.18,
    minVisibleHeight: 16,
    maxVisibleHeight: 34,
  },
}

const defaultOverlayViewport: OverlayViewport = {
  width: 375,
  height: 667,
}

const defaultTrackingTransform = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
}

interface FaceDetectSummary {
  status: 'idle' | 'ready' | 'detecting' | 'success' | 'failed'
  message: string
  rawKeys?: string
  faceCount?: number
  pointCount?: number
  center?: string
  rect?: string
  confidence?: string
  angle?: string
}

interface FaceTrackingSnapshot {
  centerX: number
  centerY: number
  faceWidth: number
  roll: number
}

interface FaceTrackingTransform {
  offsetX: number
  offsetY: number
  scale: number
  rotation: number
}

function takeCameraPhoto(): Promise<Taro.CameraContext.TakePhotoSuccessCallbackResult> {
  const cameraContext = Taro.createCameraContext()

  return new Promise((resolve, reject) => {
    cameraContext.takePhoto({
      quality: 'high',
      success: resolve,
      fail: reject,
    })
  })
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatNumber(value: unknown): string {
  return isFiniteNumber(value) ? `${Math.round(value)}` : '无'
}

function formatAngle(value: unknown): string {
  return isFiniteNumber(value) ? value.toFixed(2) : '无'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor
}

function applyDeadZone(value: number, threshold: number, fallback: number): number {
  return Math.abs(value - fallback) < threshold ? fallback : value
}

function getCameraCoverTransform(
  analysis: FaceAnalysisResult,
  viewport: OverlayViewport
): {
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

function getRollDegrees(analysis: FaceAnalysisResult): number {
  const roll = analysis.angles?.roll

  return isFiniteNumber(roll) ? roll * (180 / Math.PI) : 0
}

function getTrackingSnapshot(analysis: FaceAnalysisResult, viewport: OverlayViewport): FaceTrackingSnapshot | null {
  if (!analysis.center || !analysis.rect || analysis.faceCount !== 1) {
    return null
  }

  const transform = getCameraCoverTransform(analysis, viewport)

  return {
    centerX: analysis.center.x * transform.scale + transform.offsetX,
    centerY: analysis.center.y * transform.scale + transform.offsetY,
    faceWidth: analysis.rect.width * transform.scale,
    roll: getRollDegrees(analysis),
  }
}

function canUseAnalysisForTracking(analysis: FaceAnalysisResult): boolean {
  return analysis.faceCount === 1 && Boolean(analysis.center && analysis.rect) && analysis.status !== 'multiple_faces' && analysis.status !== 'no_face'
}

function canUseAnalysisForOverlay(analysis: FaceAnalysisResult, calibrated: boolean): boolean {
  return analysis.status === 'ok' || (calibrated && canUseAnalysisForTracking(analysis))
}

function shouldRunAutoCalibration(
  base: FaceTrackingSnapshot,
  current: FaceTrackingSnapshot,
  viewport: OverlayViewport
): boolean {
  const scaleDelta = Math.abs(current.faceWidth / base.faceWidth - 1)
  const translateRatio = Math.max(Math.abs(current.centerX - base.centerX) / viewport.width, Math.abs(current.centerY - base.centerY) / viewport.height)

  return scaleDelta >= autoCalibrationScaleThreshold || translateRatio >= autoCalibrationTranslateThresholdRatio
}

function getTargetTrackingTransform(
  base: FaceTrackingSnapshot,
  current: FaceTrackingSnapshot,
  viewport: OverlayViewport
): FaceTrackingTransform {
  const maxOffsetX = viewport.width * maxTrackingTranslateRatio
  const maxOffsetY = viewport.height * maxTrackingTranslateRatio
  const rawScale = current.faceWidth / base.faceWidth
  const scale = clamp(rawScale, 1 - maxTrackingScaleDelta, 1 + maxTrackingScaleDelta)

  return {
    offsetX: clamp(current.centerX - base.centerX, -maxOffsetX, maxOffsetX),
    offsetY: clamp(current.centerY - base.centerY, -maxOffsetY, maxOffsetY),
    scale,
    rotation: clamp(current.roll - base.roll, -maxTrackingRotation, maxTrackingRotation),
  }
}

function smoothTrackingTransform(current: FaceTrackingTransform, target: FaceTrackingTransform): FaceTrackingTransform {
  const nextOffsetX = applyDeadZone(target.offsetX, trackingDeadZonePx, current.offsetX)
  const nextOffsetY = applyDeadZone(target.offsetY, trackingDeadZonePx, current.offsetY)
  const nextScale = applyDeadZone(target.scale, trackingScaleDeadZone, current.scale)
  const nextRotation = applyDeadZone(target.rotation, trackingRotationDeadZone, current.rotation)

  return {
    offsetX: lerp(current.offsetX, nextOffsetX, trackingSmoothing),
    offsetY: lerp(current.offsetY, nextOffsetY, trackingSmoothing),
    scale: lerp(current.scale, nextScale, trackingSmoothing),
    rotation: lerp(current.rotation, nextRotation, trackingSmoothing),
  }
}

function lineStyle(line: OverlayLine): CSSProperties {
  const width = Math.hypot(line.x2 - line.x1, line.y2 - line.y1)
  const rotation = Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * (180 / Math.PI)

  return {
    left: `${line.x1}px`,
    top: `${line.y1}px`,
    width: `${width}px`,
    transform: `rotate(${rotation}deg)`,
  }
}

function boxStyle(box: OverlayBox): CSSProperties {
  return {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  }
}

function browStyle(brow: BrowGuide): CSSProperties {
  return {
    left: `${brow.x}px`,
    top: `${brow.y}px`,
    width: `${brow.width}px`,
    height: `${brow.height}px`,
    transform: `rotate(${brow.rotation}deg)`,
  }
}

function browTemplateImageStyle(brow: BrowGuide): CSSProperties {
  const templateConfig = browTemplateImageConfig[brow.templateId]
  const contentWidth = brow.width * templateConfig.widthScale
  const naturalContentHeight = contentWidth / (templateConfig.contentWidth / templateConfig.contentHeight)
  const contentHeight = clamp(
    Math.max(naturalContentHeight, brow.height * templateConfig.heightScale),
    templateConfig.minVisibleHeight,
    templateConfig.maxVisibleHeight
  )
  const scaleX = contentWidth / templateConfig.contentWidth
  const scaleY = contentHeight / templateConfig.contentHeight
  const imageWidth = templateConfig.imageWidth * scaleX
  const imageHeight = templateConfig.imageHeight * scaleY
  const contentInsetX =
    brow.side === 'left'
      ? templateConfig.imageWidth - templateConfig.contentX - templateConfig.contentWidth
      : templateConfig.contentX
  const targetContentX = (brow.width - contentWidth) / 2
  const targetContentY = brow.height * 0.52 - contentHeight * 0.52

  return {
    left: `${targetContentX - contentInsetX * scaleX}px`,
    top: `${targetContentY - templateConfig.contentY * scaleY}px`,
    width: `${imageWidth}px`,
    height: `${imageHeight}px`,
    transform: brow.side === 'left' ? 'scaleX(-1)' : 'none',
  }
}

function dotStyle(point: { x: number; y: number }): CSSProperties {
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
  }
}

function landmarkStyle(point: OverlayLandmarkPoint): CSSProperties {
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
  }
}

function clearBrowCanvas(viewport: OverlayViewport) {
  const context = Taro.createCanvasContext(browCanvasId)
  context.clearRect(0, 0, viewport.width, viewport.height)
  context.draw()
}

function getTemplateCurve(templateId: BrowTemplateId): {
  bottomLift: number
  upperLift: number
  tailLift: number
  headSlant: number
} {
  switch (templateId) {
    case 'straight':
      return { bottomLift: 0.03, upperLift: 0.04, tailLift: 0.02, headSlant: 0.08 }
    case 'arched':
      return { bottomLift: 0.12, upperLift: 0.18, tailLift: 0.12, headSlant: 0.12 }
    case 'standard':
      return { bottomLift: 0.08, upperLift: 0.12, tailLift: 0.08, headSlant: 0.1 }
    case 'natural':
    default:
      return { bottomLift: 0.06, upperLift: 0.08, tailLift: 0.05, headSlant: 0.14 }
  }
}

function drawBrowPath(context: Taro.CanvasContext, brow: BrowGuide) {
  const curve = getTemplateCurve(brow.templateId)
  const headBase = {
    x: brow.x + brow.width * 0.08,
    y: brow.y + brow.height * 0.72,
  }
  const bodyBase = {
    x: brow.x + brow.width * 0.44,
    y: brow.y + brow.height * (0.68 - curve.bottomLift * 0.12),
  }
  const tailBase = {
    x: brow.x + brow.width * 0.96,
    y: brow.y + brow.height * (0.5 - curve.tailLift * 0.18),
  }
  const upperStart = {
    x: brow.x + brow.width * 0.18,
    y: brow.y + brow.height * (0.3 - curve.upperLift * 0.08),
  }
  const upperPeak = {
    x: brow.x + brow.width * brow.peakRatio,
    y: brow.y + brow.height * (0.2 - curve.upperLift * 0.18),
  }
  const upperTail = {
    x: brow.x + brow.width * 0.9,
    y: brow.y + brow.height * (0.32 - curve.tailLift * 0.12),
  }
  const rotation = (brow.rotation * Math.PI) / 180
  const originX = brow.x + brow.width / 2
  const originY = brow.y + brow.height * 0.55

  context.save()
  context.translate(originX, originY)
  context.rotate(rotation)
  context.translate(-originX, -originY)

  context.beginPath()
  context.moveTo(headBase.x, headBase.y)
  context.bezierCurveTo(
    brow.x + brow.width * 0.26,
    brow.y + brow.height * (0.62 - curve.bottomLift * 0.08),
    brow.x + brow.width * 0.64,
    brow.y + brow.height * (0.62 - curve.bottomLift * 0.18),
    tailBase.x,
    tailBase.y
  )
  context.stroke()

  context.beginPath()
  context.moveTo(upperStart.x, upperStart.y)
  context.bezierCurveTo(
    brow.x + brow.width * 0.36,
    brow.y + brow.height * (0.16 - curve.upperLift * 0.12),
    brow.x + brow.width * 0.5,
    brow.y + brow.height * (0.14 - curve.upperLift * 0.12),
    upperPeak.x,
    upperPeak.y
  )
  context.bezierCurveTo(
    brow.x + brow.width * 0.74,
    brow.y + brow.height * (0.18 - curve.tailLift * 0.08),
    brow.x + brow.width * 0.84,
    brow.y + brow.height * (0.22 - curve.tailLift * 0.08),
    upperTail.x,
    upperTail.y
  )
  context.stroke()

  context.beginPath()
  context.moveTo(tailBase.x - brow.width * 0.08, tailBase.y + brow.height * 0.06)
  context.quadraticCurveTo(tailBase.x - brow.width * 0.02, tailBase.y, tailBase.x + brow.width * 0.06, tailBase.y - brow.height * 0.04)
  context.stroke()

  const flowBaseX = brow.x + brow.width * 0.08
  const flowTopY = brow.y + brow.height * 0.36
  ;[0, 1, 2].forEach((index) => {
    const startX = flowBaseX + brow.width * index * 0.05
    const startY = flowTopY + brow.height * index * 0.08
    context.beginPath()
    context.moveTo(startX, startY + brow.height * 0.26)
    context.quadraticCurveTo(
      startX + brow.width * (0.03 + curve.headSlant * 0.04),
      startY + brow.height * 0.12,
      startX + brow.width * (0.08 + curve.headSlant * 0.02),
      startY
    )
    context.stroke()
  })
  context.restore()
}

export default function CameraSpikePage() {
  const [calibrated, setCalibrated] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [positionGuidesVisible, setPositionGuidesVisible] = useState(true)
  const [realtimeAssistEnabled, setRealtimeAssistEnabled] = useState(defaultRealtimeAssistEnabled)
  const [adjustments, setAdjustments] = useState(defaultAdjustments)
  const [activeTemplate, setActiveTemplate] = useState<BrowTemplateId>('natural')
  const [faceAnalysis, setFaceAnalysis] = useState<FaceAnalysisResult | null>(null)
  const [recommendation, setRecommendation] = useState<BrowRecommendation | null>(null)
  const [overlayViewport, setOverlayViewport] = useState<OverlayViewport>(defaultOverlayViewport)
  const [trackingTransform, setTrackingTransform] = useState<FaceTrackingTransform>(defaultTrackingTransform)
  const latestFrameRef = useRef<CameraFrameSnapshot | null>(null)
  const baseTrackingSnapshotRef = useRef<FaceTrackingSnapshot | null>(null)
  const trackingBusyRef = useRef(false)
  const trackingMissCountRef = useRef(0)
  const autoCalibrationHitCountRef = useRef(0)
  const lastAutoCalibrationAtRef = useRef(0)
  const hasFrameRef = useRef(false)
  const [faceSummary, setFaceSummary] = useState<FaceDetectSummary>({
    status: 'idle',
    message: '等待相机帧...',
  })
  const overlayData = useMemo(() => {
    if (!faceAnalysis || !canUseAnalysisForOverlay(faceAnalysis, calibrated)) {
      return null
    }

    return generateOverlayData(faceAnalysis, activeTemplate, overlayViewport)
  }, [activeTemplate, calibrated, faceAnalysis, overlayViewport])

  useEffect(() => {
    if (!calibrated || !overlayData) {
      return
    }

    const drawTimer = setTimeout(() => {
      const context = Taro.createCanvasContext(browCanvasId)
      context.clearRect(0, 0, overlayViewport.width, overlayViewport.height)
      context.setStrokeStyle('rgba(241, 210, 167, 0.94)')
      context.setLineWidth(1)
      context.setLineCap('round')
      context.setLineJoin('round')
      context.setLineDash([5, 3], 0)
      context.draw()
    }, 30)

    return () => clearTimeout(drawTimer)
  }, [calibrated, overlayData, overlayViewport.height, overlayViewport.width])

  useEffect(() => {
    let disposed = false
    const systemInfo = Taro.getSystemInfoSync()
    setOverlayViewport({
      width: systemInfo.windowWidth,
      height: systemInfo.windowHeight,
    })
    const cameraContext = Taro.createCameraContext()
    const listener = cameraContext.onCameraFrame((frame) => {
      latestFrameRef.current = {
        data: frame.data,
        width: frame.width,
        height: frame.height,
      }

      if (!hasFrameRef.current && !disposed) {
        hasFrameRef.current = true
        setFaceSummary({
          status: 'ready',
          message: `已获取相机帧：${frame.width} x ${frame.height}`,
        })
      }
    })

    listener.start({
      fail: (error) => {
        console.error('[camera-spike] frame listener start failed', error)
        setFaceSummary({
          status: 'failed',
          message: '相机帧监听启动失败，请在真机预览中重试',
        })
      },
    })

    Taro.initFaceDetect({
      fail: (error) => {
        console.error('[camera-spike] init face detect failed', error)
        setFaceSummary({
          status: 'failed',
          message: '人脸识别初始化失败',
        })
      },
    })

    return () => {
      disposed = true
      listener.stop({})
      Taro.stopFaceDetect({})
    }
  }, [])

  useEffect(() => {
    if (!realtimeAssistEnabled || !calibrated || !baseTrackingSnapshotRef.current) {
      trackingBusyRef.current = false
      return
    }

    let disposed = false

    const trackFace = async () => {
      const frame = latestFrameRef.current
      const baseSnapshot = baseTrackingSnapshotRef.current

      if (!frame || !baseSnapshot || trackingBusyRef.current) {
        return
      }

      trackingBusyRef.current = true

      try {
        const analysis = await analyzeFaceFrame(frame)

        if (disposed) {
          return
        }

        if (!canUseAnalysisForTracking(analysis)) {
          trackingMissCountRef.current += 1
          return
        }

        const currentSnapshot = getTrackingSnapshot(analysis, overlayViewport)

        if (!currentSnapshot) {
          trackingMissCountRef.current += 1
          return
        }

        if (shouldRunAutoCalibration(baseSnapshot, currentSnapshot, overlayViewport)) {
          autoCalibrationHitCountRef.current += 1

          if (autoCalibrationHitCountRef.current >= autoCalibrationStableFrames && Date.now() - lastAutoCalibrationAtRef.current >= autoCalibrationCooldownMs) {
            baseTrackingSnapshotRef.current = currentSnapshot
            lastAutoCalibrationAtRef.current = Date.now()
            autoCalibrationHitCountRef.current = 0
            trackingMissCountRef.current = 0
            setFaceAnalysis(analysis)
            setTrackingTransform(defaultTrackingTransform)
            return
          }
        } else {
          autoCalibrationHitCountRef.current = 0
        }

        const targetTransform = getTargetTrackingTransform(baseSnapshot, currentSnapshot, overlayViewport)
        trackingMissCountRef.current = 0
        setTrackingTransform((current) => smoothTrackingTransform(current, targetTransform))
      } catch (error) {
        if (!disposed) {
          trackingMissCountRef.current += 1
          console.warn('[camera] face tracking skipped', error)
        }
      } finally {
        trackingBusyRef.current = false
      }
    }

    trackFace()
    const trackingTimer = setInterval(trackFace, trackingIntervalMs)

    return () => {
      disposed = true
      clearInterval(trackingTimer)
    }
  }, [calibrated, overlayViewport, realtimeAssistEnabled])

  const updateAdjustment = (key: keyof OverlayAdjustments, value: number) => {
    setAdjustments((current) => ({ ...current, [key]: value }))
  }

  const updateRealtimeAssistEnabled = (enabled: boolean) => {
    setRealtimeAssistEnabled(enabled)

    if (!enabled) {
      trackingBusyRef.current = false
      autoCalibrationHitCountRef.current = 0
      trackingMissCountRef.current = 0
      setTrackingTransform(defaultTrackingTransform)
    }
  }

  const saveCleanPhoto = async () => {
    try {
      const result = await takeCameraPhoto()
      await Taro.saveImageToPhotosAlbum({ filePath: result.tempImagePath })
      await Taro.navigateTo({ url: '/pages/save-success/index' })
    } catch (error) {
      Taro.showToast({
        title: '保存失败，请检查相册权限',
        icon: 'none',
      })
    }
  }

  const runCalibrationSpike = async () => {
    const frame = latestFrameRef.current

    if (!frame) {
      setFaceSummary({
        status: 'failed',
        message: '暂未获取到相机帧，请稍后重试',
      })
      return
    }

    clearBrowCanvas(overlayViewport)
    setCalibrated(false)
    setPositionGuidesVisible(true)
    setSettingsOpen(false)
    setInfoOpen(false)
    setFaceAnalysis(null)
    setTrackingTransform(defaultTrackingTransform)
    baseTrackingSnapshotRef.current = null
    trackingMissCountRef.current = 0
    autoCalibrationHitCountRef.current = 0
    lastAutoCalibrationAtRef.current = 0
    setFaceSummary({
      status: 'detecting',
      message: '正在识别脸型...',
    })

    try {
      const analysis = await analyzeFaceFrame(frame)
      console.info('[camera] face analysis result', analysis)

      if (analysis.status !== 'ok') {
        setFaceAnalysis(analysis)
        setFaceSummary({
          status: 'failed',
          message: analysis.message,
          rawKeys: analysis.rawKeys,
          faceCount: analysis.faceCount,
          pointCount: analysis.pointCount,
        })
        Taro.showToast({
          title: analysis.message,
          icon: 'none',
        })
        return
      }

      const nextRecommendation = recommendBrowTemplate(analysis)
      const nextTemplate = nextRecommendation.templateId
      baseTrackingSnapshotRef.current = getTrackingSnapshot(analysis, overlayViewport)
      setFaceAnalysis(analysis)
      setRecommendation(nextRecommendation)
      setActiveTemplate(nextTemplate)
      setAdjustments(defaultAdjustments)
      setTrackingTransform(defaultTrackingTransform)
      setCalibrated(true)
      setFaceSummary({
        status: 'success',
        message: analysis.message,
        rawKeys: analysis.rawKeys,
        faceCount: analysis.faceCount,
        pointCount: analysis.pointCount,
        center: analysis.center ? `${formatNumber(analysis.center.x)}, ${formatNumber(analysis.center.y)}` : '无',
        rect: analysis.rect
          ? `${formatNumber(analysis.rect.x)}, ${formatNumber(analysis.rect.y)}, ${formatNumber(analysis.rect.width)} x ${formatNumber(analysis.rect.height)}`
          : '无',
        confidence: analysis.confidence ? `global ${analysis.confidence.toFixed(2)}` : '无',
        angle: analysis.angles
          ? `pitch ${formatAngle(analysis.angles.pitch)}, yaw ${formatAngle(analysis.angles.yaw)}, roll ${formatAngle(analysis.angles.roll)}`
          : '无',
      })
    } catch (error) {
      console.error('[camera] face detect failed', error)
      setFaceSummary({
        status: 'failed',
        message: '人脸识别调用失败，请调整光线或距离后重试',
      })
      Taro.showToast({
        title: '人脸识别调用失败，请重试',
        icon: 'none',
      })
    }
  }

  const effectiveTrackingTransform = realtimeAssistEnabled ? trackingTransform : defaultTrackingTransform
  const overlayStyle: CSSProperties = {
    opacity: adjustments.opacity,
    transform: `translate(${effectiveTrackingTransform.offsetX}px, ${effectiveTrackingTransform.offsetY}px) scale(${effectiveTrackingTransform.scale}) rotate(${effectiveTrackingTransform.rotation}deg) translate(${adjustments.offsetX * 2}rpx, ${adjustments.offsetY * 2}rpx) scale(${adjustments.scale}) rotate(${adjustments.rotation}deg)`,
  }

  return (
    <View className='camera-page'>
      <Camera
        className='camera-page__camera'
        mode='normal'
        devicePosition='front'
        frameSize='small'
        flash='off'
        onInitDone={(event) => {
          console.info('[camera-spike] camera init done', event.detail)
        }}
        onError={(event) => {
          console.error('[camera-spike] camera error', event.detail)
        }}
      />

      <View className='camera-page__top'>
        <View className='camera-page__top-line'>
          {calibrated ? (
            <View className='camera-page__tools'>
              <Button className='camera-page__settings-entry' onClick={() => setSettingsOpen(true)}>
                微调
              </Button>
              <Button className='camera-page__info-entry' onClick={() => setInfoOpen((current) => !current)}>
                i
              </Button>
            </View>
          ) : (
            <View className='camera-page__top-placeholder' />
          )}
          {calibrated ? (
            <View className='camera-page__guide-toggle-wrap'>
              <View className='camera-page__guide-toggle'>
                <Text className='camera-page__guide-toggle-text'>辅助线</Text>
                <Switch checked={positionGuidesVisible} color='#7b5537' onChange={(event) => setPositionGuidesVisible(event.detail.value)} />
              </View>
            </View>
          ) : (
            <View className='camera-page__status'>
              <Text className='camera-page__status-title'>前置摄像头已开启</Text>
            </View>
          )}
        </View>
        {calibrated ? (
          <View className='camera-page__top-line'>
            <View className='camera-page__top-placeholder' />
            <View className='camera-page__guide-toggle-wrap'>
              <View className='camera-page__guide-toggle'>
                <Text className='camera-page__guide-toggle-text'>实时</Text>
                <Switch checked={realtimeAssistEnabled} color='#7b5537' onChange={(event) => updateRealtimeAssistEnabled(event.detail.value)} />
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {calibrated && infoOpen ? (
        <View className='camera-page__info-popover'>
          <Text className='camera-page__info-line'>{faceSummary.message}</Text>
          <Text className='camera-page__info-line'>人脸数：{faceSummary.faceCount ?? '无'}</Text>
          <Text className='camera-page__info-line'>中心：{faceSummary.center ?? '无'}</Text>
          <Text className='camera-page__info-line'>人脸框：{faceSummary.rect ?? '无'}</Text>
        </View>
      ) : null}

      {calibrated && overlayData ? (
        <View className='camera-page__overlay' style={overlayStyle}>
          {positionGuidesVisible ? (
            <>
              {overlayData.faceContourLines.map((line) => (
                <View
                  className='camera-page__face-contour-line'
                  key={line.id}
                  style={lineStyle(line)}
                />
              ))}
              {overlayData.lines.map((line) => (
                <View
                  className={`camera-page__guide-line camera-page__guide-line--${line.kind}`}
                  key={line.id}
                  style={lineStyle(line)}
                />
              ))}
              {overlayData.eyeGuides.map((eye) => (
                <View className='camera-page__eye-guide' key={eye.id} style={boxStyle(eye)} />
              ))}
              {overlayData.browAreaGuides.map((area) => (
                <View className='camera-page__brow-area-guide' key={area.id} style={boxStyle(area)} />
              ))}
              {overlayData.landmarkPoints.map((point) => (
                <View className='camera-page__landmark-point' key={point.id} style={landmarkStyle(point)} />
              ))}
              <Canvas
                canvasId={browCanvasId}
                className='camera-page__brow-canvas'
                style={{ width: `${overlayViewport.width}px`, height: `${overlayViewport.height}px` }}
              />
              {overlayData.browGuides.map((brow) => (
                <View className={`camera-page__brow-guide camera-page__brow-guide--${brow.templateId}`} key={brow.side} style={browStyle(brow)}>
                  <Image className='camera-page__brow-template-image' mode='scaleToFill' src={browTemplateAssetMap[brow.templateId]} style={browTemplateImageStyle(brow)} />
                </View>
              ))}
            </>
          ) : null}
        </View>
      ) : (
        <View className='camera-page__hint'>
          <Text className='camera-page__hint-title'>请正脸面对镜头</Text>
          <Text className='camera-page__hint-desc'>保持光线充足，点击开始定标后生成眉形辅助线。</Text>
        </View>
      )}

      {!calibrated ? (
        <View className='camera-page__panel'>
          <View className='camera-page__face-status'>
            <Text className={`camera-page__face-status-title camera-page__face-status-title--${faceSummary.status}`}>
              {faceSummary.message}
            </Text>
          </View>
          <Text className='camera-page__privacy'>人脸关键点仅用于本次本地定标，不上传人脸数据。</Text>
          <Button className='camera-page__primary' onClick={runCalibrationSpike}>
            开始定标
          </Button>
        </View>
      ) : null}

      {calibrated ? (
        <View className='camera-page__compact-panel'>
          <View className='camera-page__template-dock'>
            {browTemplates.map((template) => (
              <Button
                className={`camera-page__template-dock-item ${template.id === activeTemplate ? 'camera-page__template-dock-item--active' : ''}`}
                key={template.id}
                onClick={() => {
                  clearBrowCanvas(overlayViewport)
                  setActiveTemplate(template.id)
                }}
              >
                <Image className='camera-page__template-dock-image' mode='aspectFit' src={browPreviewMap[template.id]} />
                <Text className={`camera-page__template-dock-name ${template.id === activeTemplate ? 'camera-page__template-dock-name--active' : ''}`}>
                  {recommendation?.templateId === template.id ? `推荐 ${template.name}` : template.name}
                </Text>
              </Button>
            ))}
          </View>
          {recommendation ? <Text className='camera-page__recommendation'>{recommendation.reason}</Text> : null}
          <View className='camera-page__compact-actions'>
            <Button className='camera-page__secondary camera-page__compact-button' onClick={runCalibrationSpike}>
              重新定标
            </Button>
            <Button className='camera-page__primary camera-page__compact-button' onClick={saveCleanPhoto}>
              完成保存
            </Button>
          </View>
        </View>
      ) : null}

      {calibrated && settingsOpen ? (
        <View className='camera-page__panel camera-page__panel--settings'>
          <View className='camera-page__panel-head'>
            <Text className='camera-page__panel-title'>微调</Text>
            <Button className='camera-page__collapse' onClick={() => setSettingsOpen(false)}>
              收起面板
            </Button>
          </View>
          <>
            <View className='camera-page__sliders'>
              <Text>上下</Text>
              <Slider min={-30} max={30} value={adjustments.offsetY} onChanging={(event) => updateAdjustment('offsetY', event.detail.value)} />
              <Text>左右</Text>
              <Slider min={-30} max={30} value={adjustments.offsetX} onChanging={(event) => updateAdjustment('offsetX', event.detail.value)} />
              <Text>大小</Text>
              <Slider min={80} max={120} value={adjustments.scale * 100} onChanging={(event) => updateAdjustment('scale', event.detail.value / 100)} />
              <Text>旋转</Text>
              <Slider min={-10} max={10} value={adjustments.rotation} onChanging={(event) => updateAdjustment('rotation', event.detail.value)} />
              <Text>透明度</Text>
              <Slider min={20} max={100} value={adjustments.opacity * 100} onChanging={(event) => updateAdjustment('opacity', event.detail.value / 100)} />
            </View>
          </>
        </View>
      ) : null}
    </View>
  )
}
