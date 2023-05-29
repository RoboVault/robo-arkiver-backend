import { Cache, CacheEntry, Redis } from './deps.ts'
import { getEnv } from './utils.ts'

export interface RedisCacheOptions {
	ex: number
	url: string
	token: string
}

const defaultOpts: RedisCacheOptions = {
	ex: 60,
	token: '',
	url: '',
}

export class RedisCache implements Cache {
	#redis: Redis
	#opts: RedisCacheOptions

	constructor(opts?: Partial<RedisCacheOptions>) {
		const fullOpts = { ...defaultOpts, ...opts }

		this.#redis = new Redis({
			token: opts?.token ?? getEnv('REDIS_TOKEN'),
			url: opts?.url ?? getEnv('REDIS_URL'),
		})
		this.#opts = fullOpts
	}

	async get(key: string): Promise<CacheEntry<unknown> | null | undefined> {
		const value = await this.#redis.get(key)
		return JSON.parse(value as string)
	}

	set(key: string, value: CacheEntry<unknown>): unknown | Promise<unknown> {
		return this.#redis.set(key, JSON.stringify(value), { ex: this.#opts.ex })
	}

	async delete(key: string): Promise<void> {
		await this.#redis.del(key)
	}
}
