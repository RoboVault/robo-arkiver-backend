import { http, redis } from '../../deps.ts'
import { ERROR_CODES, REDIS_KEYS } from '../constants.ts'
import { ArkiveProvider } from '../providers/interfaces.ts'
import { buildObjectFromArray } from '../utils.ts'
export type RateLimiter = (
	req: Request,
	connInfo: http.ConnInfo,
) => Promise<Response | undefined>

export interface IpRateLimitOptions {
	max: number
	window: number
}

export interface MonthlyRateLimitParams {
	arkiveId: number
}

export const createIpLimiter = (
	redis: redis.Redis,
	options: IpRateLimitOptions,
): RateLimiter => {
	const { max, window } = options

	return async (req: Request, connInfo: http.ConnInfo) => {
		const ip = (connInfo.remoteAddr as Deno.NetAddr).hostname ??
			req.headers.get('x-forwarded-for')
		if (!ip) return new Response('Bad Request', { status: 400 })

		const key = `${REDIS_KEYS.IP_RATELIMITER}:${ip}`
		const current = await redis.get(key)
		if (!current) {
			await redis.set(key, 1, { ex: window })
			return undefined
		}

		const currentInt = parseInt(current)
		if (currentInt >= max) {
			return new Response('Too Many Requests', { status: 429 })
		}

		await redis.incr(key)
		return undefined
	}
}

export const apiKeyLimiter = async (
	params: {
		redis: redis.Redis
		arkiveProvider: ArkiveProvider
		apiKey: string
		username: string
		arkivename: string
	},
) => {
	const { apiKey, username, arkiveProvider, redis, arkivename } = params
	const apiKeyRedisKey = `${REDIS_KEYS.API_KEYS}:${username}`
	const limitRedisKey = `${REDIS_KEYS.LIMITS}:${username}:${arkivename}`

	const pl = redis.pipeline()
	pl.sismember(apiKeyRedisKey, apiKey)
	pl.hgetall(limitRedisKey)
	const [validApiKey, limits] = await pl.flush()

	if (validApiKey === 0) {
		if (!(await arkiveProvider.validateApiKey(apiKey))) {
			return new Response('Unauthorized', { status: 401 })
		}
		const pl = redis.pipeline()
		pl.sadd(apiKeyRedisKey, apiKey)
		pl.expire(apiKeyRedisKey, 60 * 60 * 24)
		await pl.flush()
	}
	if (!limits || (Array.isArray(limits) && limits.length === 0)) {
		const arkiveLimits = await arkiveProvider.getLimits(username)
		if (!arkiveLimits) {
			return new Response('Username Not Found', { status: 404 })
		}
		await redis.hset(limitRedisKey, arkiveLimits)
		return {
			hfMax: arkiveLimits.hfMax,
			hfWindow: arkiveLimits.hfWindow,
		}
	}

	const { count, dayTimestamp, max, hfMax, hfWindow } = buildObjectFromArray(
		limits as string[],
	)
	if (!count || !dayTimestamp || !max || !hfMax || !hfWindow) {
		return new Response(
			`Internal Server Error: ${ERROR_CODES.INVALID_API_LIMITS}`,
			{ status: 500 },
		)
	}

	const now = Date.now()
	if (now - parseInt(dayTimestamp) > 86_400_000) {
		await redis.hset(limitRedisKey, {
			count: 1,
			dayTimestamp: now - (now % 86_400_000),
		})
		return {
			hfMax: parseInt(hfMax),
			hfWindow: parseInt(hfWindow),
		}
	}

	if (parseInt(count) >= parseInt(max)) {
		return new Response('Too Many Requests', { status: 429 })
	}

	await redis.hincrby(limitRedisKey, 'count', 1)

	return {
		hfMax: parseInt(hfMax),
		hfWindow: parseInt(hfWindow),
	}
}
