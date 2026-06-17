import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

export default function SaveSuccessPage() {
  return (
    <View className='save-success-page'>
      <View className='save-success-page__card'>
        <Text className='save-success-page__title'>保存成功</Text>
        <Text className='save-success-page__desc'>画眉效果图已保存到相册</Text>
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
