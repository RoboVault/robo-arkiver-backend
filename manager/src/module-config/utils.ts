import { ArkiveActor, ArkiveProvider } from '../providers/interfaces.ts'
import { getEnv, getSupabaseClient } from '../utils.ts'
import { getModuleActors } from './actors.ts'
import { getModuleProvider } from './provider.ts'

export const moduleConfig = {
	'ARKIVE_RUNNER': {
		name: 'arkive-runner',
	},
	'GRAPHQL_SERVER': {
		name: 'graphql-server',
	},
} as const

export const getModuleConfig = () => {
	const moduleName = getEnv('MODULE')

	validateModuleName(moduleName)
	let actors: { actor: ArkiveActor; name: string }[]
	let provider: { provider: ArkiveProvider; name: string }

	switch (moduleName) {
		case 'ARKIVE_RUNNER': {
			provider = getModuleProvider(moduleName)({
				environment: getEnv('ENVIRONMENT'),
				supabase: getSupabaseClient(),
			})
			actors = getModuleActors(moduleName)(provider.provider)
			break
		}
		case 'GRAPHQL_SERVER': {
			const supabase = getSupabaseClient()
			const environment = getEnv('ENVIRONMENT')
			provider = getModuleProvider(moduleName)({
				environment,
				supabase,
			})
			actors = getModuleActors(moduleName)({
				environment,
				supabase,
			})
			break
		}
	}

	return {
		...moduleConfig[moduleName],
		actors,
		provider,
	}
}

function validateModuleName(
	moduleName: string,
): asserts moduleName is keyof typeof moduleConfig {
	if (!Object.keys(moduleConfig).includes(moduleName)) {
		throw new Error(`Invalid module: ${moduleName}`)
	}
}
