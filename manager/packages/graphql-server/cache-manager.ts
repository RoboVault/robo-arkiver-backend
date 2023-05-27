import { redis } from '../../deps.ts'
import { REDIS_KEYS } from '../constants.ts'
import { logger } from '../logger.ts'
import { ApiAuthProvider } from '../providers/interfaces.ts'
import { UserProfile } from '../providers/supabase-auth.ts'

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

		logger('graphQLServer').info('[Cache Manager] Cache Manager Initialized')
	}

	#deleteApiKeyFromCache = async (apiKey: string) => {
		await this.#redis.del(apiKey)
	}

	#updateUserLimits = async (updatedUser: UserProfile) => {
		const limits = await this.#authProvider.getTierLimits(
			updatedUser.tier_info_id,
		)

		if (!limits) {
			logger('graphQLServer').error(
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
