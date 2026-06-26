const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

async function ensureUsersCollection() {
  try {
    await db.createCollection('users')
  } catch (error) {
    if (!String(error && error.errMsg ? error.errMsg : error).includes('collection already exists')) {
      console.warn('[initUser] ensure users collection skipped', error)
    }
  }
}

function createUserId() {
  const date = new Date()
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('')
  const random = Math.random().toString(36).slice(2, 8)

  return `usr_${stamp}_${random}`
}

function toClientUser(user) {
  const { openid: _openid, ...clientUser } = user
  return clientUser
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    throw new Error('OPENID_NOT_FOUND')
  }

  await ensureUsersCollection()

  const now = db.serverDate()
  const users = db.collection('users')
  const existing = await users.where({ openid }).limit(1).get()

  if (existing.data.length > 0) {
    const user = existing.data[0]
    await users.doc(user._id).update({
      data: {
        lastLoginAt: now,
        updatedAt: now,
      },
    })

    return {
      isNew: false,
      user: toClientUser({
        ...user,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      }),
    }
  }

  const user = {
    userId: createUserId(),
    openid,
    nickname: event.nickname || '',
    avatarUrl: event.avatarUrl || '',
    memberStatus: 'free',
    memberLevel: 'free',
    firstLoginAt: now,
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now,
  }
  const result = await users.add({
    data: user,
  })

  return {
    isNew: true,
    user: toClientUser({
      _id: result._id,
      ...user,
      firstLoginAt: new Date(),
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  }
}
