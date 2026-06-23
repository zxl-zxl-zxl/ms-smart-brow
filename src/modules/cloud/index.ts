import Taro from '@tarojs/taro'
import { cloudConfig, hasCloudEnv } from '../../config/cloud'

let cloudReady = false

export function initCloud(): boolean {
  if (!hasCloudEnv()) {
    return false
  }

  if (!cloudReady) {
    Taro.cloud.init({
      env: cloudConfig.env,
      traceUser: true,
    })
    cloudReady = true
  }

  return true
}

export async function callCloudFunction<T>(name: string, data?: Record<string, unknown>): Promise<T> {
  if (!initCloud()) {
    throw new Error('未配置云开发环境 ID')
  }

  const result = await Taro.cloud.callFunction({
    name,
    data,
  })

  return result.result as T
}
