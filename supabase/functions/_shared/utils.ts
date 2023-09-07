import { Context, createClient } from './deps.ts'

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
 * Add check if value is not a valid JSON format
 * @param value 
 * @returns 
 */
export const parseJSON = (value: any) => {
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