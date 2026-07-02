import { useEffect } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import shareImage from '../../assets/share-img.png'

const shareTitle = 'MS 智能画眉 - AI 相机画眉助手'
const shareDescription = '实时相机 + 人脸定标 + 眉形辅助线，对齐辅助线把眉头、眉峰、眉尾画准。'
const sharePath = '/pages/home/index'

export function useAppShare() {
  useShareAppMessage(() => ({
    title: shareTitle,
    path: sharePath,
    imageUrl: shareImage,
  }))

  useEffect(() => {
    Taro.showShareMenu({
      withShareTicket: true,
      showShareItems: ['shareAppMessage'],
    })
  }, [])
}

export function useHomeTimelineShare() {
  useShareTimeline(() => ({
    title: shareTitle,
    query: '',
    imageUrl: shareImage,
  }))

  useEffect(() => {
    Taro.showShareMenu({
      withShareTicket: true,
      showShareItems: ['shareAppMessage', 'shareTimeline'],
    })
  }, [])
}

export const appShareCopy = {
  title: shareTitle,
  description: shareDescription,
}
