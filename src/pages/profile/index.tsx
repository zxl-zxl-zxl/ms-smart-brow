import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

export default function ProfilePage() {
  return (
    <View className='profile-page page-shell'>
      <View className='profile-page__header glass-card'>
        <View className='profile-page__avatar'>MS</View>
        <View>
          <Text className='profile-page__title'>个人中心</Text>
          <Text className='profile-page__desc'>登录、会员权益和画像分析将在后续版本接入。</Text>
        </View>
      </View>

      <View className='profile-page__stats'>
        <View className='profile-page__stat glass-card'>
          <Text className='profile-page__stat-value'>0</Text>
          <Text className='profile-page__stat-label'>历史画眉</Text>
        </View>
        <View className='profile-page__stat glass-card'>
          <Text className='profile-page__stat-value'>V1</Text>
          <Text className='profile-page__stat-label'>当前版本</Text>
        </View>
      </View>

      <View className='profile-page__list glass-card'>
        <Button className='profile-page__item' onClick={() => Taro.navigateTo({ url: '/pages/privacy/index' })}>
          隐私说明
        </Button>
        <Button className='profile-page__item' onClick={() => Taro.navigateTo({ url: '/pages/about/index' })}>
          关于 MS 智能画眉
        </Button>
        <Button className='profile-page__item profile-page__item--disabled'>
          会员功能规划中
        </Button>
      </View>

      <Button className='profile-page__home' onClick={() => Taro.reLaunch({ url: '/pages/home/index' })}>
        返回首页
      </Button>
    </View>
  )
}
