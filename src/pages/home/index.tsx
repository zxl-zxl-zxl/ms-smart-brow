import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

export default function HomePage() {
  const goCamera = () => {
    Taro.navigateTo({ url: '/pages/camera/index' })
  }

  return (
    <View className='home-page'>
      <View className='home-page__top'>
        <Text className='home-page__brand'>MS 智能画眉</Text>
        <Button className='home-page__profile'>我的</Button>
      </View>

      <View className='home-page__hero'>
        <View className='home-page__face'>
          <View className='home-page__brow home-page__brow--left' />
          <View className='home-page__brow home-page__brow--right' />
          <View className='home-page__center-line' />
        </View>
      </View>

      <Text className='home-page__title'>AI 推荐适合你的眉形</Text>
      <Text className='home-page__subtitle'>实时相机辅助线，帮你找准眉头、眉峰、眉尾</Text>

      <View className='home-page__steps'>
        <Text>1. 点击开始智能画眉</Text>
        <Text>2. 正脸定标，生成推荐眉形</Text>
        <Text>3. 对齐辅助线，照着虚线画眉</Text>
      </View>

      <Button className='home-page__cta' onClick={goCamera}>
        开始智能画眉
      </Button>
    </View>
  )
}
