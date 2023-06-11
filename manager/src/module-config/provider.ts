import { redis, supabase } from '../../deps.ts'
import { RunnerProvider } from '../providers/runner-provider.ts'
import { SupabaseProvider } from '../providers/supabase.ts'
import { moduleConfig } from './utils.ts'

export const getModuleProvider = <TModuleName extends keyof typeof moduleConfig>(moduleName: TModuleName): typeof moduleProvider[TModuleName] => {
	return moduleProvider[moduleName]
}

export const moduleProvider = {
	ARKIVE_RUNNER: (
		params: { supabase: supabase.SupabaseClient; environment: string, redis: redis.Redis },
	) => ({ name: 'runner-provider', provider: new RunnerProvider({ environment: params.environment, redis: params.redis, supabase: params.supabase }) }),
	GRAPHQL_SERVER: (
		params: { supabase: supabase.SupabaseClient; environment: string },
	) => ({ name: 'supabase-provider', provider: new SupabaseProvider(params) }),
	MESSENGER: (
		params: { supabase: supabase.SupabaseClient; environment: string }
	) => ({ name: 'supabase-provider', provider: new SupabaseProvider(params) })
} as const
