import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useAppShare } from '../../modules/share'
import './index.scss'

export default function SaveSuccessPage() {
  useAppShare()

  return (
    <View className='save-success-page page-shell'>
      <View className='save-success-page__card glass-card'>
        <View className='save-success-page__icon'>
          <View className='save-success-page__check' />
        </View>
        <Text className='save-success-page__title'>保存成功</Text>
        <Text className='save-success-page__desc'>照片已保存到手机相册。你可以重新定标再画一次，或回到首页选择其他眉形。</Text>
        <Button className='save-success-page__primary' onClick={() => Taro.redirectTo({ url: '/pages/camera/index' })}>
          重新画眉
        </Button>
        <Button className='save-success-page__secondary' onClick={() => Taro.reLaunch({ url: '/pages/home/index' })}>
          返回首页
        </Button>
      </View>
    </View>
  )
}
