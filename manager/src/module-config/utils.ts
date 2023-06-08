import { redis } from '../../deps.ts'
import { ArkiveActor, ArkiveProvider } from '../providers/interfaces.ts'
import { getEnv, getSupabaseClient } from '../utils.ts'
import { getModuleActors } from './actors.ts'
import { getModuleProvider, moduleProvider } from './provider.ts'

export const moduleConfig = {
	'ARKIVE_RUNNER': {
		name: 'arkive-runner',
	},
	'GRAPHQL_SERVER': {
		name: 'graphql-server',
	},
	'MESSENGER': {
		name: 'messenger'
	}
} as const

export const getModuleConfig = async () => {
	const moduleName = getEnv('MODULE')

	validateModuleName(moduleName)
	let actors: { actor: ArkiveActor; name: string }[]
	let provider: { provider: ArkiveProvider; name: string }

	switch (moduleName) {
		case 'ARKIVE_RUNNER': {
			const redisClient = await redis.connect({
				hostname: getEnv('MESSENGER_REDIS_HOSTNAME'),
				port: parseInt(getEnv('MESSENGER_REDIS_PORT')),
			})
			provider = getModuleProvider(moduleName)({
				environment: getEnv('ENVIRONMENT'),
				supabase: getSupabaseClient(),
				redis: redisClient
			})
			actors = getModuleActors(moduleName)(provider.provider, redisClient)
			break
		}
		case 'GRAPHQL_SERVER': {
			const supabase = getSupabaseClient()
			const environment = getEnv('ENVIRONMENT')
			provider = moduleProvider[moduleName]({
				environment,
				supabase
			})
			actors = getModuleActors(moduleName)({
				environment,
				supabase,
			})
			break
		}
		case 'MESSENGER': {
			const supabase = getSupabaseClient()
			const environment = getEnv('ENVIRONMENT')
			provider = getModuleProvider(moduleName)({
				environment,
				supabase
			})
			actors = getModuleActors(moduleName)(
				await redis.connect({
					hostname: getEnv('MESSENGER_REDIS_HOSTNAME'),
					port: parseInt(getEnv('MESSENGER_REDIS_PORT')),
				})
			)
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
