import { View, Text } from '@tarojs/components'
import './index.scss'

export default function PrivacyPage() {
  return (
    <View className='privacy-page page-shell'>
      <View className='privacy-page__card glass-card'>
        <Text className='privacy-page__title'>隐私说明</Text>
        <Text className='privacy-page__paragraph'>V1 版本的人脸关键点识别用于相机定标和眉形辅助线生成，处理过程在设备本地完成。</Text>
        <Text className='privacy-page__paragraph'>当前版本不上传人脸图片、不保存人脸关键点，也不接入云端用户画像分析。</Text>
        <Text className='privacy-page__paragraph'>后续如果加入登录、会员或云端分析能力，会在功能开启前重新提示并征得授权。</Text>
      </View>
    </View>
  )
}
