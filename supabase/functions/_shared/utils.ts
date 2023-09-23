import { StorageClient } from 'https://esm.sh/v131/@supabase/storage-js@2.5.1/denonext/storage-js.mjs';
import { Context, SupabaseClient, createClient } from './deps.ts'
import { getUsernameFromUserId } from "./username.ts";

export const getEnv = (key: string, defaultValue?: string): string => {
  const value = Deno.env.get(key)
  if (!value && !defaultValue) {
    throw new Error(`Missing environment variable: ${key}`)
  }
  return value || defaultValue || ''
}

export const getSupabaseClient = (c: Context) => {
  const supabaseUrl = getEnv('SUPABASE_URL')
  const supabaseKey = getEnv('SUPABASE_ANON_KEY')
  const token = c.req.headers.get('Authorization') ?? `Bearer ${supabaseKey}`
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: token } },
  })

  return supabase
}

/**
 * Use this to check wether to get Public or User's Arkives
 * @param client 
 * @param username 
 */
export const hasActiveUser = async (username: string, client?: SupabaseClient) => {
  if (username && client) {
    const { data: { user } } = await client.auth.getUser()

    if (user) {
      const activeUser = await getUsernameFromUserId(client, user.id)
      return activeUser === username
    }

    return false
  } else {
    return false
  }
}

/**
 * Add check if value is not a valid JSON format
 * @param value 
 * @returns 
 */
export const stringifyJSON = (value: any) => {
  if (value) {
    let newValue = [value]

    try {
      // check if value is a valid array
      newValue = JSON.parse(value)

      const stringified = JSON.stringify(newValue)
      return stringified
    } catch (error) {
      const formatted = JSON.stringify(newValue)
      return formatted
    }
  }

  return value
}

export const parseJSON = (value: any) => {
  if (value) {
    try {
      return JSON.parse(value)
    } catch (error) {
      console.log('Not a valid JSON:: ', error.message)
      return [value]
    }
  }
}

export const getLimitOffset = (pageCount = '0', limit = '50') => {
  const page = parseInt(pageCount)
  const rows = parseInt(limit)

  if (page === 0) {
    return { limit, offset: 0 }
  }

  return { limit, offset: page * rows }
}