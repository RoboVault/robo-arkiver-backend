import { redis } from '../../deps.ts'
import { ArkiveProvider } from '../providers/interfaces.ts'

export interface CacheManagerParams {
	redis: redis.Redis
	arkiveProvider: ArkiveProvider
}

export class CacheManager {
	#redis: redis.Redis
	#arkiveProvider: ArkiveProvider

	constructor(params: CacheManagerParams) {
		this.#redis = params.redis
		this.#arkiveProvider = params.arkiveProvider
	}
}
