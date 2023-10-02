import { SUPABASE_TABLES } from '../../../manager/packages/constants.ts'
import { RedisCache } from './cache.ts'
import { cachified, SupabaseClient } from './deps.ts'
import { HttpError } from './http_error.ts'

export const getUserIdFromUsername = async (
  supabase: SupabaseClient,
  username: string,
) => {
  const profileRes = await supabase
    .from(SUPABASE_TABLES.USER_PROFILE)
    .select<'id', { id: string }>('id')
    .eq('username', username)
    .single()

  if (profileRes.error) {
    if (profileRes.error.code === 'PGRST116') {
      throw new HttpError(404, `User ${username} not found`)
    }
    throw profileRes.error
  }

  return profileRes.data.id
}

export const getUsernameFromUserId = async (
  supabase: SupabaseClient,
  userId: string,
) => {
  const profileRes = await cachified({
    key: `${userId}-username`,
    cache: new RedisCache(),
    getFreshValue: () =>
      supabase
        .from(SUPABASE_TABLES.USER_PROFILE)
        .select<'username', { username: string }>('username')
        .eq('id', userId)
        .single(),
  })

  if (profileRes.error) {
    if (profileRes.error.code === 'PGRST116') {
      throw new HttpError(404, `User ${userId} not found`)
    }
    throw profileRes.error
  }

  return profileRes.data.username
}

export const getCachedUser = async (supabase: SupabaseClient) => {
  const user = await cachified({
    key: `authenticated-user`,
    cache: new RedisCache(),
    getFreshValue: () =>
      supabase.auth.getUser()
  })

  return user.data.user
}
