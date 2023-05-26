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
	},
) => {
	const { apiKey, username, arkiveProvider, redis } = params

	const pl = redis.pipeline()
	pl.sismember(REDIS_KEYS.API_KEYS, apiKey)
	pl.hgetall(`${REDIS_KEYS.LIMITS}:${username}`)
	const [validApiKey, limits] = await pl.flush()

	if (validApiKey === 0) {
		return new Response('Unauthorized', { status: 401 })
	}
	if (!limits || (limits && (limits as string[]).length === 0)) {
		const arkiveLimits = await arkiveProvider.getLimits(username)
		if (!arkiveLimits) {
			return new Response('Username Not Found', { status: 404 })
		}
		await redis.hset(`${REDIS_KEYS.LIMITS}:${username}`, arkiveLimits)
		return null
	}

	const { count, dayTimestamp, max } = buildObjectFromArray(
		limits as string[],
	)
	if (!count || !dayTimestamp || !max) {
		return new Response(
			`Internal Server Error: ${ERROR_CODES.INVALID_API_LIMITS}`,
			{ status: 500 },
		)
	}

	const now = Date.now()
	if (now - parseInt(dayTimestamp) > 86_400_000) {
		await redis.hset(`${REDIS_KEYS.LIMITS}:${username}`, {
			count: 1,
			dayTimestamp: now,
		})
		return null
	}

	if (parseInt(count) >= parseInt(max)) {
		return new Response('Too Many Requests', { status: 429 })
	}

	await redis.hincrby(`${REDIS_KEYS.LIMITS}:${username}`, 'count', 1)

	return null
}
