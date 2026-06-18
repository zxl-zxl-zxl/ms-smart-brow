import { useEffect, useRef, useState } from 'react'
import { View, Text, Button, Camera, Slider, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { browTemplates } from '../../config/browTemplates'
import type { BrowTemplateId } from '@/types/brow'
import type { OverlayAdjustments } from '@/types/brow'
import browNormal from '../../assets/brow-normal.webp'
import browStandard from '../../assets/brow-standard.webp'
import browFlat from '../../assets/brow-flat.webp'
import browBend from '../../assets/brow-bend.webp'
import './index.scss'

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

interface CameraFrameSnapshot {
  data: ArrayBuffer
  width: number
  height: number
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

type FaceDetectFace = Partial<Taro.faceDetect.face>

type FaceDetectRawResult = Taro.faceDetect.SuccessCallbackOption & {
  faceInfo?: FaceDetectFace | FaceDetectFace[]
}

type FaceDetectRect = Partial<Taro.faceDetect.detectRect> & {
  width?: number
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeFaceDetectResult(result: FaceDetectRawResult): {
  face?: FaceDetectFace
  faceCount: number
  rawKeys: string
} {
  const rawKeys = Object.keys(result).join(', ') || '无'

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

function formatNumber(value: unknown): string {
  return isFiniteNumber(value) ? `${Math.round(value)}` : '无'
}

export default function CameraSpikePage() {
  const [calibrated, setCalibrated] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [adjustments, setAdjustments] = useState(defaultAdjustments)
  const [activeTemplate, setActiveTemplate] = useState<BrowTemplateId>('natural')
  const latestFrameRef = useRef<CameraFrameSnapshot | null>(null)
  const hasFrameRef = useRef(false)
  const [faceSummary, setFaceSummary] = useState<FaceDetectSummary>({
    status: 'idle',
    message: '等待相机帧...',
  })

  useEffect(() => {
    let disposed = false
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

  const updateAdjustment = (key: keyof OverlayAdjustments, value: number) => {
    setAdjustments((current) => ({ ...current, [key]: value }))
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

    setCalibrated(true)
    setSettingsOpen(false)
    setInfoOpen(false)
    setFaceSummary({
      status: 'detecting',
      message: '正在进行单帧人脸识别...',
    })

    try {
      const result = await detectFaceFromFrame(frame)
      console.info('[camera-spike] face detect result', result)
      const normalized = normalizeFaceDetectResult(result)
      const face = normalized.face

      if (!face || !isFiniteNumber(face.x) || !isFiniteNumber(face.y) || face.x === -1 || face.y === -1) {
        setFaceSummary({
          status: 'failed',
          message: '未解析到有效人脸，请查看原始字段',
          rawKeys: normalized.rawKeys,
          faceCount: normalized.faceCount,
        })
        return
      }

      const rect = face.detectRect as FaceDetectRect | undefined
      const confidence = face.confArray?.[0]
      const angle = face.angleArray?.[0]
      const rectWidth = rect?.width ?? rect?.weight

      Taro.showToast({
        title: '识别成功，\n已返回人脸关键点',
        icon: 'none',
        duration: 1800,
      })
      setFaceSummary({
        status: 'success',
        message: '识别成功，已返回人脸关键点',
        rawKeys: normalized.rawKeys,
        faceCount: normalized.faceCount,
        pointCount: face.pointArray?.length ?? 0,
        center: `${formatNumber(face.x)}, ${formatNumber(face.y)}`,
        rect: rect ? `${formatNumber(rect.originX)}, ${formatNumber(rect.originY)}, ${formatNumber(rectWidth)} x ${formatNumber(rect.height)}` : '无',
        confidence: confidence ? `global ${confidence.global.toFixed(2)}` : '无',
        angle: angle ? `pitch ${angle.pitch.toFixed(2)}, yaw ${angle.yaw.toFixed(2)}, roll ${angle.roll.toFixed(2)}` : '无',
      })
    } catch (error) {
      console.error('[camera-spike] face detect failed', error)
      setFaceSummary({
        status: 'failed',
        message: '人脸识别调用失败，请查看 Console',
      })
    }
  }

  const overlayStyle = {
    opacity: adjustments.opacity,
    transform: `translate(${adjustments.offsetX * 2}rpx, ${adjustments.offsetY * 2}rpx) scale(${adjustments.scale}) rotate(${adjustments.rotation}deg)`,
  }
  const activeTemplateInfo = browTemplates.find((template) => template.id === activeTemplate) ?? browTemplates[0]

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
        <View className='camera-page__status'>
          <Text className='camera-page__status-title'>{calibrated ? `${activeTemplateInfo.name}辅助中` : '前置摄像头已开启'}</Text>
          {calibrated ? <Text className='camera-page__status-subtitle'>对齐辅助线画眉</Text> : null}
        </View>
      </View>

      {calibrated && infoOpen ? (
        <View className='camera-page__info-popover'>
          <Text className='camera-page__info-line'>{faceSummary.message}</Text>
          <Text className='camera-page__info-line'>关键点：{faceSummary.pointCount ?? '无'}</Text>
          <Text className='camera-page__info-line'>人脸数：{faceSummary.faceCount ?? '无'}</Text>
          <Text className='camera-page__info-line'>中心：{faceSummary.center ?? '无'}</Text>
          <Text className='camera-page__info-line'>人脸框：{faceSummary.rect ?? '无'}</Text>
        </View>
      ) : null}

      {calibrated ? (
        <View className='camera-page__overlay' style={overlayStyle}>
          <View className='camera-page__calibration-badge'>眉形轮廓线</View>
          <View className='camera-page__face-line camera-page__face-line--vertical' />
          <View className='camera-page__face-line camera-page__face-line--horizontal' />
          <View className={`camera-page__brow camera-page__brow--left camera-page__brow--${activeTemplate}`}>
            <View className='camera-page__dot camera-page__dot--start' />
            <View className='camera-page__dot camera-page__dot--peak' />
            <View className='camera-page__dot camera-page__dot--end' />
          </View>
          <View className={`camera-page__brow camera-page__brow--right camera-page__brow--${activeTemplate}`}>
            <View className='camera-page__dot camera-page__dot--start' />
            <View className='camera-page__dot camera-page__dot--peak' />
            <View className='camera-page__dot camera-page__dot--end' />
          </View>
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
                onClick={() => setActiveTemplate(template.id)}
              >
                <Image className='camera-page__template-dock-image' mode='aspectFit' src={browPreviewMap[template.id]} />
                <Text className={`camera-page__template-dock-name ${template.id === activeTemplate ? 'camera-page__template-dock-name--active' : ''}`}>{template.name}</Text>
              </Button>
            ))}
          </View>
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
