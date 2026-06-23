export type MemberStatus = 'free' | 'trial' | 'active' | 'expired' | 'blocked'

export type MemberLevel = 'free' | 'plus' | 'pro'

export interface UserProfile {
  userId: string
  openid: string
  nickname?: string
  avatarUrl?: string
  memberStatus: MemberStatus
  memberLevel: MemberLevel
  firstLoginAt?: string | Date
  lastLoginAt?: string | Date
  createdAt?: string | Date
  updatedAt?: string | Date
}

export interface InitUserResult {
  user: UserProfile
  isNew: boolean
}
