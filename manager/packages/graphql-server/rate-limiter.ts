import { http, redis } from '../../deps.ts'
import { ERROR_CODES, REDIS_KEYS } from '../constants.ts'
import { ApiAuthProvider } from '../providers/interfaces.ts'
import { buildObjectFromArray } from '../utils.ts'
export type RateLimiter = (
	req: Request,
	connInfo: http.ConnInfo,
) => Promise<Response | undefined>

export interface IpRateLimitOptions {
	name: string
	max: number
	window: number
	message: string
}

export interface MonthlyRateLimitParams {
	arkiveId: number
}

export const createIpLimiter = (
	redis: redis.Redis,
	options: IpRateLimitOptions,
): RateLimiter => {
	const { max, window, name, message } = options

	return async (req: Request, connInfo: http.ConnInfo) => {
		const ip = (connInfo.remoteAddr as Deno.NetAddr).hostname ??
			req.headers.get('x-forwarded-for')
		if (!ip) return new Response('Bad Request', { status: 400 })

		const key = `${REDIS_KEYS.IP_RATELIMITER}:${name}:${ip}`
		const current = await redis.get(key)
		if (!current) {
			await redis.set(key, 1, { ex: window })
			return undefined
		}

		const currentInt = parseInt(current)
		console.log(currentInt)
		const expiry = await redis.ttl(key)
		if (currentInt >= max) {
			return new Response(`Too Many Requests ${message} (expires in ${expiry} seconds)`, { status: 429 })
		}

		await redis.incr(key)
		return undefined
	}
}

export const apiKeyLimiter = async (
	params: {
		redis: redis.Redis
		apiAuthProvider: ApiAuthProvider
		apiKey: string
		username: string
		arkivename: string
	},
) => {
	const { apiKey, username, apiAuthProvider, redis, arkivename } = params
	const limitRedisKey = `${REDIS_KEYS.LIMITS}:${username}`
	const countRedisKey =
		`${REDIS_KEYS.API_RATELIMITER}:${username}:${arkivename}`

	const pl = redis.pipeline()
	pl.get(apiKey)
	pl.get(countRedisKey)
	pl.hgetall(limitRedisKey)
	const [cachedUsername, count, limits] = await pl.exec()

	if (!cachedUsername || cachedUsername !== username) {
		if (!(await apiAuthProvider.validateApiKey(apiKey, username))) {
			return new Response('Unauthorized', { status: 401 })
		}
		await redis.set(apiKey, username, { ex: 60 * 60 * 24 })
	}
	if (!limits || (Array.isArray(limits) && limits.length === 0)) {
		const arkiveLimits = await apiAuthProvider.getUserLimits(username)
		if (!arkiveLimits) {
			return new Response('Username Not Found', { status: 404 })
		}
		await redis.hset(limitRedisKey, arkiveLimits)
		if (!count) {
			await redis.set(countRedisKey, 1, { ex: 60 * 60 * 24 } /* 24 hours */)
		}

		return {
			hfMax: arkiveLimits.hfMax,
			hfWindow: arkiveLimits.hfWindow,
		}
	}

	const { max, hfMax, hfWindow } = buildObjectFromArray(
		limits as string[],
	)
	if (!max || !hfMax || !hfWindow) {
		return new Response(
			`Internal Server Error: ${ERROR_CODES.INVALID_API_LIMITS}`,
			{ status: 500 },
		)
	}

	if (!count) {
		await redis.set(countRedisKey, 1, { ex: 60 * 60 * 24 } /* 24 hours */)
		return {
			hfMax: parseInt(hfMax),
			hfWindow: parseInt(hfWindow),
		}
	}
	const expiry = await redis.ttl(countRedisKey)
	if (parseInt(count as string) >= parseInt(max)) {
		return new Response(`Too Many Requests. The daily limit for your account is: ${parseInt(max)}. Please wait ${(expiry / 60).toFixed(1)} minutes.`, { status: 429 })
	}

	await redis.incr(countRedisKey)

	return {
		hfMax: parseInt(hfMax),
		hfWindow: parseInt(hfWindow),
	}
}
