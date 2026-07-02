import { useEffect, useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { hasCloudEnv } from '../../config/cloud'
import { useAppShare } from '../../modules/share'
import { initUser } from '../../modules/user'
import type { UserProfile } from '../../types/user'
import './index.scss'

export default function ProfilePage() {
  useAppShare()

  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(hasCloudEnv() ? '正在初始化用户身份...' : '未配置云开发环境 ID')

  useEffect(() => {
    let disposed = false

    if (!hasCloudEnv()) {
      return
    }

    setLoading(true)
    initUser()
      .then((result) => {
        if (disposed) {
          return
        }
        setUser(result.user)
        setMessage(result.isNew ? '已创建用户身份' : '已同步用户身份')
      })
      .catch((error) => {
        if (disposed) {
          return
        }
        console.error('[profile] init user failed', error)
        setMessage('用户身份初始化失败，请稍后重试')
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false)
        }
      })

    return () => {
      disposed = true
    }
  }, [])

  const memberLabel = user?.memberLevel === 'free' ? '普通用户' : user?.memberLevel ?? '未登录'
  const userIdLabel = user?.userId ? user.userId.slice(-6).toUpperCase() : '--'

  return (
    <View className='profile-page page-shell'>
      <View className='profile-page__header glass-card'>
        <View className='profile-page__avatar'>{user?.nickname?.slice(0, 1) || 'MS'}</View>
        <View>
          <Text className='profile-page__title'>{user?.nickname || '个人中心'}</Text>
          <Text className='profile-page__desc'>{loading ? '正在连接云开发...' : message}</Text>
        </View>
      </View>

      <View className='profile-page__stats'>
        <View className='profile-page__stat glass-card'>
          <Text className='profile-page__stat-value'>{memberLabel}</Text>
          <Text className='profile-page__stat-label'>会员状态</Text>
        </View>
        <View className='profile-page__stat glass-card'>
          <Text className='profile-page__stat-value'>{userIdLabel}</Text>
          <Text className='profile-page__stat-label'>用户编号</Text>
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
