import 'https://deno.land/std@0.189.0/dotenv/load.ts'
import { influx, log, redis } from '../../deps.ts'
import { REDIS_KEYS } from '../constants.ts'
import { logger } from '../logger/logger.ts'
import { ArkiveInfluxLogger } from '../logger/influx.ts'
import { ApiAuthProvider } from '../providers/interfaces.ts'
import {
	SupabaseAuthProvider,
	UserProfile,
} from '../providers/supabase-auth.ts'
import { getEnv, getSupabaseClient } from '../utils.ts'

export interface CacheManagerParams {
	redis: redis.Redis
	apiAuthProvider: ApiAuthProvider
}

export class CacheManager {
	#redis: redis.Redis
	#authProvider: ApiAuthProvider

	constructor(params: CacheManagerParams) {
		this.#redis = params.redis
		this.#authProvider = params.apiAuthProvider

		this.#authProvider.listenDeletedApiKey(
			this.#deleteApiKeyFromCache.bind(this),
		)
		this.#authProvider.listenUserUpgrade(this.#updateUserLimits.bind(this))

		logger('cacheManager').info('Cache Manager Initialized')
	}

	#deleteApiKeyFromCache = async (apiKey: string) => {
		logger('cacheManager').debug(`Deleting API Key ${apiKey}`)
		await this.#redis.del(apiKey)
	}

	#updateUserLimits = async (updatedUser: UserProfile) => {
		logger('cacheManager').debug(
			`Updating limits for user ${updatedUser.username}`,
		)
		const limits = await this.#authProvider.getTierLimits(
			updatedUser.tier_info_id,
		)

		if (!limits) {
			logger('cacheManager').error(
				`Could not find limits for user ${updatedUser.username} with tier_info_id ${updatedUser.tier_info_id}`,
			)
			return
		}

		const key = `${REDIS_KEYS.LIMITS}:${updatedUser.username}`
		await this.#redis.hset(
			key,
			limits,
		)
	}
}

if (import.meta.main) {
	const redisClient = await redis.connect({
		hostname: getEnv('SERVER_REDIS_HOSTNAME'),
		port: Number(getEnv('SERVER_REDIS_PORT')),
	})

	const authProvider = new SupabaseAuthProvider(getSupabaseClient())

	const writer = new influx.InfluxDB({
		url: getEnv('INFLUX_URL'),
		token: getEnv('INFLUX_TOKEN'),
	}).getWriteApi(getEnv('INFLUX_ORG'), getEnv('INFLUX_BUCKET'))

	log.setup({
		handlers: {
			console: new log.handlers.ConsoleHandler('DEBUG'),
			influx: new ArkiveInfluxLogger('DEBUG', {
				writer,
				tags: {
					source: 'cacheManager',
				},
			}),
		},
		loggers: {
			cacheManager: {
				level: 'DEBUG',
				handlers: ['console', 'influx'],
			},
		},
	})

	new CacheManager({
		redis: redisClient,
		apiAuthProvider: authProvider,
	})
}
