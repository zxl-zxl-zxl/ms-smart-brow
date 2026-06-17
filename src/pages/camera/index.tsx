import { useEffect, useRef, useState } from 'react'
import { View, Text, Button, Camera, Slider } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { OverlayAdjustments } from '@/types/brow'
import './index.scss'

const defaultAdjustments: OverlayAdjustments = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
  opacity: 0.8,
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
  const [adjustments, setAdjustments] = useState(defaultAdjustments)
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
        <View className='camera-page__status'>
          <Text>前置摄像头 · 单帧识别 Spike</Text>
        </View>
      </View>

      {calibrated ? (
        <View className='camera-page__overlay' style={overlayStyle}>
          <View className='camera-page__debug-label'>View 辅助线测试层</View>
          <View className='camera-page__face-line camera-page__face-line--vertical' />
          <View className='camera-page__face-line camera-page__face-line--horizontal' />
          <View className='camera-page__brow camera-page__brow--left'>
            <View className='camera-page__dot camera-page__dot--start' />
            <View className='camera-page__dot camera-page__dot--peak' />
            <View className='camera-page__dot camera-page__dot--end' />
          </View>
          <View className='camera-page__brow camera-page__brow--right'>
            <View className='camera-page__dot camera-page__dot--start' />
            <View className='camera-page__dot camera-page__dot--peak' />
            <View className='camera-page__dot camera-page__dot--end' />
          </View>
        </View>
      ) : (
        <Text className='camera-page__hint'>请正脸面对镜头，保持光线充足</Text>
      )}

      <View className='camera-page__panel'>
        <View className='camera-page__face-status'>
          <Text className={`camera-page__face-status-title camera-page__face-status-title--${faceSummary.status}`}>
            {faceSummary.message}
          </Text>
          {faceSummary.status === 'success' ? (
            <View className='camera-page__face-status-detail'>
              <Text>关键点：{faceSummary.pointCount}</Text>
              <Text>人脸数：{faceSummary.faceCount}</Text>
              <Text>中心：{faceSummary.center}</Text>
              <Text>人脸框：{faceSummary.rect}</Text>
              <Text>置信度：{faceSummary.confidence}</Text>
              <Text>角度：{faceSummary.angle}</Text>
              <Text>原始字段：{faceSummary.rawKeys}</Text>
            </View>
          ) : null}
          {faceSummary.status === 'failed' && faceSummary.rawKeys ? (
            <View className='camera-page__face-status-detail'>
              <Text>人脸数：{faceSummary.faceCount}</Text>
              <Text>原始字段：{faceSummary.rawKeys}</Text>
            </View>
          ) : null}
        </View>
        {calibrated ? (
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
            <View className='camera-page__actions'>
              <Button className='camera-page__secondary' onClick={runCalibrationSpike}>
                重新定标
              </Button>
              <Button className='camera-page__primary' onClick={saveCleanPhoto}>
                完成并保存
              </Button>
            </View>
          </>
        ) : (
          <Button className='camera-page__primary' onClick={runCalibrationSpike}>
            开始定标
          </Button>
        )}
      </View>
    </View>
  )
}
