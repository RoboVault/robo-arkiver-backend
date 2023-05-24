import { redis } from '../../deps.ts'
import { logger } from '../logger.ts'
import { CacheProvider } from './interfaces.ts'

export interface RedisProviderParams {
	hostname: string
	port: number
}

export class RedisProvider implements CacheProvider {
	private redisClient?: redis.Redis
	private params: RedisProviderParams

	constructor(params: RedisProviderParams) {
		this.params = params
	}

	private async initConnection() {
		if (this.redisClient) return
		logger('graphQLServer').info('[GraphQL Server] Connecting to Redis')
		this.redisClient = await redis.connect(this.params)
		logger('graphQLServer').info('[GraphQL Server] Connected to Redis')
	}

	async get(key: string) {
		await this.initConnection()
		return await this.redisClient?.get(key)
	}

	async set(key: string, value: string, opts?: redis.SetOpts) {
		await this.initConnection()
		await this.redisClient?.set(key, value, opts)
	}

	async incr(key: string) {
		await this.initConnection()
		return await this.redisClient?.incr(key)
	}

	async flush() {
		await this.initConnection()
		await this.redisClient?.flushall()
	}

	close() {
		this.redisClient?.close()
	}
}
