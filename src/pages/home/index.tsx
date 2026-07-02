import { useState } from 'react'
import { View, Text, Button, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { browTemplates } from '../../config/browTemplates'
import { useAppShare, useHomeTimelineShare } from '../../modules/share'
import { initUser } from '../../modules/user'
import indexImg from '../../assets/index-img.png'
import './index.scss'

export default function HomePage() {
  useAppShare()
  useHomeTimelineShare()

  const [initializingTarget, setInitializingTarget] = useState<'camera' | 'profile' | null>(null)

  const goCamera = async () => {
    if (initializingTarget) {
      return
    }

    setInitializingTarget('camera')

    try {
      await initUser()
    } catch (error) {
      console.error('[home] init user before camera failed', error)
      Taro.showToast({
        title: '身份初始化失败，已进入体验模式',
        icon: 'none',
      })
    } finally {
      setInitializingTarget(null)
    }

    Taro.navigateTo({ url: '/pages/camera/index' })
  }

  const goProfile = async () => {
    if (initializingTarget) {
      return
    }

    setInitializingTarget('profile')

    try {
      await initUser()
      Taro.navigateTo({ url: '/pages/profile/index' })
    } catch (error) {
      console.error('[home] init user before profile failed', error)
      Taro.showToast({
        title: '个人中心暂不可用，可先体验智能画眉',
        icon: 'none',
      })
    } finally {
      setInitializingTarget(null)
    }
  }

  return (
    <View className='home-page page-shell'>
      <View className='home-page__nav'>
        <View>
          <Text className='home-page__eyebrow'>MS SMART BROW</Text>
          <Text className='home-page__brand'>MS 智能画眉</Text>
        </View>
        <Button
          className='home-page__profile'
          loading={initializingTarget === 'profile'}
          disabled={initializingTarget !== null}
          onClick={goProfile}
        >
          {initializingTarget === 'profile' ? '进入中' : '我的'}
        </Button>
      </View>

      <View className='home-page__hero glass-card'>
        <View className='home-page__hero-copy'>
          <Text className='home-page__title'>找到适合你的眉形</Text>
          <Text className='home-page__subtitle'>实时相机 + 人脸定标 + 眉形辅助线，对齐辅助线把眉头、眉峰、眉尾画准。</Text>
        </View>

        <View className='home-page__preview'>
          <Image className='home-page__preview-image' mode='aspectFill' src={indexImg} />
        </View>
      </View>

      <View className='home-page__cards'>
        <View className='home-page__card glass-card'>
          <Text className='home-page__card-num'>01</Text>
          <Text className='home-page__card-title'>本地识别</Text>
          <Text className='home-page__card-desc'>单帧人脸关键点定标，V1 不上传人脸数据。</Text>
        </View>
        <View className='home-page__card glass-card'>
          <Text className='home-page__card-num'>02</Text>
          <Text className='home-page__card-title'>辅助描画</Text>
          <Text className='home-page__card-desc'>定标后显示眉形轮廓线，可手动微调位置。</Text>
        </View>
      </View>

      <View className='home-page__templates glass-card'>
        <View className='home-page__section-head'>
          <Text className='home-page__section-title'>可切换眉形</Text>
          <Text className='home-page__section-sub'>AI 推荐后续升级</Text>
        </View>
        <View className='home-page__template-list'>
          {browTemplates.map((template) => (
            <View className='home-page__template' key={template.id}>
              <Text className='home-page__template-name'>{template.name}</Text>
              <Text className='home-page__template-desc'>{template.description}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='home-page__bottom-bar'>
        <Button
          className='home-page__cta'
          loading={initializingTarget === 'camera'}
          disabled={initializingTarget !== null}
          onClick={goCamera}
        >
          {initializingTarget === 'camera' ? '正在初始化身份' : '开始智能画眉'}
        </Button>
        <Text className='home-page__privacy'>仅在设备本地识别 · 不上传人脸数据</Text>
      </View>
    </View>
  )
}
