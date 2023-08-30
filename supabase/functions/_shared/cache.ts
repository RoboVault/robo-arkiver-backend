import { Cache, CacheEntry, Redis } from './deps.ts'
import { getEnv } from './utils.ts'

export interface RedisCacheOptions {
  url: string
  token: string
}

export class RedisCache implements Cache {
  #redis: Redis

  constructor(opts?: Partial<RedisCacheOptions>) {
    this.#redis = new Redis({
      token: opts?.token ?? getEnv('REDIS_TOKEN'),
      url: opts?.url ?? getEnv('REDIS_URL'),
    })
  }

  async get(key: string): Promise<CacheEntry<unknown> | null | undefined> {
    const value = await this.#redis.get(key)
    return JSON.parse(value as string)
  }

  set(key: string, value: CacheEntry<unknown>): unknown | Promise<unknown> {
    return this.#redis.set(key, JSON.stringify(value))
  }

  async delete(key: string): Promise<void> {
    await this.#redis.del(key)
  }
}
