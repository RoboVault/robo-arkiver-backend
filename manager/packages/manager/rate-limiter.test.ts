import { assertEquals } from 'https://deno.land/std@0.188.0/testing/asserts.ts'
import { http, redis } from '../../deps.ts'
import { apiKeyLimiter, createIpLimiter } from './rate-limiter.ts'
import { ArkiveProvider } from '../providers/interfaces.ts'
import { REDIS_KEYS } from '../constants.ts'

Deno.test('IP Rate Limit', async () => {
	const redisClient = await redis.connect({
		hostname: '127.0.0.1',
		port: 6379,
	})

	await redisClient.flushdb()

	const limiter = createIpLimiter(redisClient, { max: 100, window: 10 })

	const req = new Request('http://localhost:8080')
	const connInfo = {
		remoteAddr: {
			hostname: '127.0.0.1',
			transport: 'tcp',
			port: 8080,
		},
		localAddr: {
			hostname: '127.0.0.1',
			transport: 'tcp',
			port: 8080,
		},
	} satisfies http.ConnInfo

	for (let i = 0; i < 100; i++) {
		const res = await limiter(req, connInfo)
		assertEquals(res, undefined)
	}

	const res = await limiter(req, connInfo)
	await res?.arrayBuffer()
	assertEquals(res?.status, 429)

	redisClient.close()
})

Deno.test('API key rate limit should return null when not limited and return a 429 response when limited and return null after day reset', async () => {
	const redisClient = await redis.connect({
		hostname: '127.0.0.1',
		port: 6379,
	})
	const arkiveProvider = {
		getLimits: (_username: string) => {
			return Promise.resolve({
				count: 1,
				max: 100,
				dayTimestamp: Date.now(),
			})
		},
	} as ArkiveProvider
	const apiKey = crypto.randomUUID()
	const username = 'testuser'
	await redisClient.flushdb()
	await redisClient.sadd(REDIS_KEYS.API_KEYS, apiKey)

	for (let i = 0; i < 100; i++) {
		const limited = await apiKeyLimiter({
			apiKey,
			arkiveProvider,
			redis: redisClient,
			username,
		})
		assertEquals(limited, null, `Failed on iteration ${i}`)
	}

	const limited = await apiKeyLimiter({
		apiKey,
		arkiveProvider,
		redis: redisClient,
		username,
	})
	assertEquals(limited?.status, 429)

	await redisClient.hset(
		`${REDIS_KEYS.LIMITS}:${username}`,
		'dayTimestamp',
		Date.now() - 48 * 60 * 60 * 1000,
	)
	const limitedReset = await apiKeyLimiter({
		apiKey,
		arkiveProvider,
		redis: redisClient,
		username,
	})
	assertEquals(limitedReset, null)

	redisClient.close()
})

Deno.test('API key rate limit should return 401 response with invalid API key', async () => {
	const redisClient = await redis.connect({
		hostname: '127.0.0.1',
		port: 6379,
	})
	const arkiveProvider = {
		getLimits: (_username: string) => {
			return Promise.resolve({
				count: 1,
				max: 100,
				dayTimestamp: Date.now(),
			})
		},
	} as ArkiveProvider
	const apiKey = crypto.randomUUID()
	const username = 'testuser'
	await redisClient.flushdb()

	const limitedNoKey = await apiKeyLimiter({
		apiKey,
		arkiveProvider,
		redis: redisClient,
		username,
	})
	assertEquals(limitedNoKey?.status, 401)

	redisClient.close()
})
