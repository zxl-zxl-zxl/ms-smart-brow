import { View, Text } from '@tarojs/components'
import { useAppShare } from '../../modules/share'
import './index.scss'

export default function AboutPage() {
  useAppShare()

  return (
    <View className='about-page page-shell'>
      <View className='about-page__hero glass-card'>
        <Text className='about-page__logo'>MS</Text>
        <Text className='about-page__title'>MS 智能画眉</Text>
        <Text className='about-page__desc'>一款用实时相机辅助线帮助用户更稳、更快完成画眉的小程序。</Text>
      </View>
      <View className='about-page__card glass-card'>
        <Text className='about-page__item'>版本：V1.0.0</Text>
        <Text className='about-page__item'>定位：本地识别 · 隐私优先 · 轻量辅助</Text>
        <Text className='about-page__item'>下一步：眉形推荐、保存记录、会员能力规划</Text>
      </View>
    </View>
  )
}
