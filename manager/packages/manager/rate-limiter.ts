import { assertEquals } from 'https://deno.land/std@0.188.0/testing/asserts.ts'
import { http, redis } from '../../deps.ts'

export type RateLimiter = (
	req: Request,
	connInfo: http.ConnInfo,
) => Promise<Response | void>

export interface RateLimitOptions {
	max?: number
	window?: number
}

export const rateLimiter = (
	redis: redis.Redis,
	params?: RateLimitOptions,
) => {
	const defaultParams = { max: 100, window: 60 }
	const { max, window } = { ...defaultParams, ...params }

	return async (req: Request, connInfo: http.ConnInfo) => {
		const ip = (connInfo.remoteAddr as Deno.NetAddr).hostname ??
			req.headers.get('x-forwarded-for')
		if (!ip) return new Response('Bad Request', { status: 400 })

		const key = `rate-limiter:${ip}`
		const current = await redis.get(key)
		if (!current) {
			await redis.set(key, 1, { ex: window })
			return
		}

		const currentInt = parseInt(current)
		if (currentInt >= max) {
			return new Response('Too Many Requests', { status: 429 })
		}

		await redis.incr(key)
	}
}

Deno.test('rateLimiter', async () => {
	const redisClient = await redis.connect({
		hostname: 'localhost',
		port: 6379,
	})

	await redisClient.flushdb()

	const limiter = rateLimiter(redisClient)

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
