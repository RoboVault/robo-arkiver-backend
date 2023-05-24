import { assertEquals } from 'https://deno.land/std@0.188.0/testing/asserts.ts'
import { http } from '../../deps.ts'
import { RedisProvider } from '../providers/redis.ts'
import { shortRateLimiter } from './rate-limiter.ts'

Deno.test('rateLimiter', async () => {
	const redisClient = new RedisProvider({
		hostname: 'localhost',
		port: 6379,
	})

	await redisClient.flush()

	const limiter = shortRateLimiter(redisClient)

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
