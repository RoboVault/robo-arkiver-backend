import 'https://deno.land/std@0.192.0/dotenv/load.ts'
import {
	assertEquals,
	assertNotInstanceOf,
} from 'https://deno.land/std@0.188.0/testing/asserts.ts'
import { redis } from '../../deps.ts'
import { apiKeyLimiter, createIpLimiter } from './rate-limiter.ts'
import { REDIS_KEYS } from '../constants.ts'
import { assertInstanceOf } from 'https://deno.land/std@0.192.0/testing/asserts.ts'
import { getSupabaseClient } from '../utils.ts'
import { SupabaseAuthProvider } from '../providers/supabase-auth.ts'

Deno.test('IP Rate Limit', async () => {
	const redisClient = await redis.connect({
		hostname: '127.0.0.1',
		port: 6379,
	})

	await redisClient.flushdb()

	const limiter = createIpLimiter(redisClient, {
		max: 100,
		window: 10,
		name: '10sec',
		message: 'Too many requests',
	})

	const req = new Request('http://localhost:8080')
	const connInfo = {
		remoteAddr: {
			hostname: '128.0.0.1',
			transport: 'tcp',
			port: 8080,
		},
	} satisfies Deno.ServeHandlerInfo

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
		const supabase = getSupabaseClient()
		const apiAuthProvider = new SupabaseAuthProvider(supabase)
		const apiKey = '90fcbac9-001d-4a7d-9904-b31296074068'
		const username = 'hzlntcld'
		const arkivename = 'testarkive'
		await redisClient.flushdb()
		await redisClient.set(apiKey, username)

		for (let i = 0; i < 100; i++) {
			const limited = await apiKeyLimiter({
				apiKey,
				apiAuthProvider,
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
			apiAuthProvider,
			arkivename,
			redis: redisClient,
			username,
		})
		assertInstanceOf(
			limited,
			Response,
			`Failed on iteration 101: got ${JSON.stringify(limited)}`,
		)
		assertEquals(limited.status, 429)

		await redisClient.expire(
			`${REDIS_KEYS.API_RATELIMITER}:${username}:${arkivename}`,
			0,
		)
		const limitedReset = await apiKeyLimiter({
			apiKey,
			apiAuthProvider,
			arkivename,
			redis: redisClient,
			username,
		})
		assertNotInstanceOf(limitedReset, Response, 'Failed after day reset')

		await redisClient.flushdb()
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
		const supabase = getSupabaseClient()
		const apiAuthProvider = new SupabaseAuthProvider(supabase)
		const apiKey = crypto.randomUUID()
		const username = 'hzlntcld'
		const arkivename = 'testarkive'
		await redisClient.flushdb()

		const limitedNoKey = await apiKeyLimiter({
			apiKey,
			arkivename,
			apiAuthProvider,
			redis: redisClient,
			username,
		})
		assertInstanceOf(limitedNoKey, Response)
		assertEquals(limitedNoKey.status, 401)

		redisClient.close()
	},
})
