import { supabase } from '../../deps.ts'
import { SupabaseProvider } from '../providers/supabase.ts'
import { moduleConfig } from './utils.ts'

export const getModuleProvider = (moduleName: keyof typeof moduleConfig) => {
	return moduleProvider[moduleName]
}

const moduleProvider = {
	'ARKIVE_RUNNER': (
		params: { supabase: supabase.SupabaseClient; environment: string },
	) => ({ name: 'supabase-provider', provider: new SupabaseProvider(params) }),
	'GRAPHQL_SERVER': (
		params: { supabase: supabase.SupabaseClient; environment: string },
	) => ({ name: 'supabase-provider', provider: new SupabaseProvider(params) }),
} as const
