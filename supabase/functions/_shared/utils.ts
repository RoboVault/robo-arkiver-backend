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
		global: { headers: { Authorization: token } },
	})

	return supabase
}
