import { delay } from 'https://deno.land/std@0.189.0/async/delay.ts'
import { redis } from '../../deps.ts'
import { ApiAuthProvider, ApiLimits } from '../providers/interfaces.ts'
import { CacheManager } from './cache-manager.ts'
import { UserProfile } from '../providers/supabase-auth.ts'
import { REDIS_KEYS } from '../constants.ts'
import {
	assertArrayIncludes,
	assertEquals,
	assertNotEquals,
} from 'https://deno.land/std@0.188.0/testing/asserts.ts'

Deno.test('Cache Manager', async () => {
	const redisClient = await redis.connect({
		hostname: '127.0.0.1',
		port: 6379,
	})
	await redisClient.flushdb()

	const testApiKey = crypto.randomUUID()
	const testUser = {
		id: crypto.randomUUID(),
		tier_info_id: 1,
		username: 'test-user',
	} satisfies UserProfile
	const testNewLimits = {
		hfMax: 100,
		hfWindow: 60,
		max: 1000,
	} satisfies ApiLimits

	await Promise.all([
		redisClient.set(testApiKey, testUser.username),
		redisClient.hset(
			`${REDIS_KEYS.LIMITS}:${testUser.username}`,
			{ hfMax: 0, hfWindow: 0, max: 0 } satisfies ApiLimits,
		),
	])

	const mockApiAuthProvider = {
		getTierLimits: () => {
			return Promise.resolve(testNewLimits)
		},
		listenDeletedApiKey: (callback: (apiKey: string) => Promise<void>) => {
			callback(testApiKey)
		},
		listenUserUpgrade: (
			callback: (updatedUser: UserProfile) => Promise<void>,
		) => {
			callback(testUser)
		},
	} as unknown as ApiAuthProvider

	new CacheManager({
		redis: redisClient,
		apiAuthProvider: mockApiAuthProvider,
	})

	await delay(1000) // wait for the callbacks to be called

	const pl = redisClient.pipeline()
	pl.get(testApiKey)
	pl.hgetall(`${REDIS_KEYS.LIMITS}:${testUser.username}`)
	const [apiKey, limits] = await pl.flush()

	assertEquals(apiKey, null)
	assertNotEquals(limits, null)
	assertArrayIncludes(
		limits! as string[],
		Object.entries(testNewLimits).flat().map(String),
	)

	redisClient.close()
})
