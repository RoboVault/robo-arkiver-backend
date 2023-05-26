import {
	assertEquals,
	assertNotInstanceOf,
} from 'https://deno.land/std@0.188.0/testing/asserts.ts'
import { http, redis } from '../../deps.ts'
import { apiKeyLimiter, createIpLimiter } from './rate-limiter.ts'
import { REDIS_KEYS } from '../constants.ts'
import { assertInstanceOf } from 'https://deno.land/std@0.132.0/testing/asserts.ts'
import { SupabaseProvider } from '../providers/supabase.ts'
import { ArkiveProvider } from '../providers/interfaces.ts'

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

Deno.test({
	name:
		'API key rate limit should return null when not limited and return a 429 response when limited and return null after day reset',
	sanitizeOps: false,
	sanitizeResources: false,
	async fn() {
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
					hfMax: 100,
					hfWindow: 10,
				})
			},
			validateApiKey: (_apiKey: string) => {
				return Promise.resolve(true)
			},
		} as ArkiveProvider
		// const arkiveProvider = new SupabaseProvider({ environment: 'staging' })
		const apiKey = '90fcbac9-001d-4a7d-9904-b31296074068'
		const username = 'hzlntcld'
		const arkivename = 'testarkive'
		await redisClient.flushdb()
		await redisClient.sadd(`${REDIS_KEYS.API_KEYS}:${username}`, apiKey)

		for (let i = 0; i < 100; i++) {
			const limited = await apiKeyLimiter({
				apiKey,
				arkiveProvider,
				arkivename,
				redis: redisClient,
				username,
			})
			assertNotInstanceOf(
				limited,
				Response,
				`Failed on iteration ${i}`,
			)
		}

		const limited = await apiKeyLimiter({
			apiKey,
			arkiveProvider,
			arkivename,
			redis: redisClient,
			username,
		})
		assertInstanceOf(limited, Response)
		assertEquals(limited.status, 429)

		await redisClient.hset(
			`${REDIS_KEYS.LIMITS}:${username}:${arkivename}`,
			'dayTimestamp',
			Date.now() - 48 * 60 * 60 * 1000,
		)
		const limitedReset = await apiKeyLimiter({
			apiKey,
			arkiveProvider,
			arkivename,
			redis: redisClient,
			username,
		})
		assertNotInstanceOf(limitedReset, Response, 'Failed after day reset')

		redisClient.close()
	},
})

Deno.test({
	name: 'API key rate limit should return 401 response with invalid API key',
	sanitizeOps: false,
	sanitizeResources: false,
	async fn() {
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
					hfMax: 100,
					hfWindow: 10,
				})
			},
			validateApiKey: (_apiKey: string) => {
				return Promise.resolve(false)
			},
		} as ArkiveProvider
		// const arkiveProvider = new SupabaseProvider({ environment: 'staging' })
		const apiKey = 'invalid-api-key'
		const username = 'hzlntcld'
		const arkivename = 'testarkive'
		await redisClient.flushdb()

		const limitedNoKey = await apiKeyLimiter({
			apiKey,
			arkivename,
			arkiveProvider,
			redis: redisClient,
			username,
		})
		assertInstanceOf(limitedNoKey, Response)
		assertEquals(limitedNoKey.status, 401)

		redisClient.close()
	},
})
