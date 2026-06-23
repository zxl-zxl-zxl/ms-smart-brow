import type { InitUserResult } from '../../types/user'
import { callCloudFunction } from '../cloud'

export async function initUser(): Promise<InitUserResult> {
  return callCloudFunction<InitUserResult>('initUser')
}
