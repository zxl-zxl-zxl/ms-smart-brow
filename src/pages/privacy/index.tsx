import { View, Text } from '@tarojs/components'
import './index.scss'

export default function PrivacyPage() {
  return (
    <View className='privacy-page page-shell'>
      <View className='privacy-page__card glass-card'>
        <Text className='privacy-page__title'>隐私说明</Text>
        <Text className='privacy-page__paragraph'>V1 版本的人脸关键点识别用于相机定标和眉形辅助线生成，处理过程在设备本地完成。</Text>
        <Text className='privacy-page__paragraph'>当前版本不上传人脸图片、不保存人脸关键点、不保存画眉过程图，也不接入云端人脸分析。</Text>
        <Text className='privacy-page__paragraph'>小程序会通过微信云开发创建用户身份，用于展示用户编号、同步会员状态和维护基础服务状态。</Text>
        <Text className='privacy-page__paragraph'>云端仅保存用户基础身份、登录时间和会员预留字段；用户的相机画面和人脸关键点仅在本次使用中临时处理。</Text>
      </View>
    </View>
  )
}
