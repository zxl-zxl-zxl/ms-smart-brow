import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { browTemplates } from '../../config/browTemplates'
import './index.scss'

export default function HomePage() {
  const goCamera = () => {
    Taro.navigateTo({ url: '/pages/camera/index' })
  }

  return (
    <View className='home-page page-shell'>
      <View className='home-page__nav'>
        <View>
          <Text className='home-page__eyebrow'>MS SMART BROW</Text>
          <Text className='home-page__brand'>MS 智能画眉</Text>
        </View>
        <Button className='home-page__profile' onClick={() => Taro.navigateTo({ url: '/pages/profile/index' })}>
          我的
        </Button>
      </View>

      <View className='home-page__hero glass-card'>
        <View className='home-page__hero-copy'>
          <Text className='home-page__title'>找到适合你的眉形</Text>
          <Text className='home-page__subtitle'>实时相机 + 人脸定标 + 眉形辅助线，跟着虚线把眉头、眉峰、眉尾画准。</Text>
        </View>

        <View className='home-page__preview'>
          <View className='home-page__face'>
            <View className='home-page__hair' />
            <View className='home-page__brow home-page__brow--left' />
            <View className='home-page__brow home-page__brow--right' />
            <View className='home-page__eye home-page__eye--left' />
            <View className='home-page__eye home-page__eye--right' />
            <View className='home-page__nose' />
            <View className='home-page__mouth' />
            <View className='home-page__center-line' />
          </View>
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
              <View className={`home-page__template-line home-page__template-line--${template.id}`} />
              <Text>{template.name}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='home-page__bottom-bar'>
        <Button className='home-page__cta' onClick={goCamera}>
          开始智能画眉
        </Button>
        <Text className='home-page__privacy'>仅在设备本地识别 · 不上传人脸数据</Text>
      </View>
    </View>
  )
}
